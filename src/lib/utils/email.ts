// Parse a raw email header block and triage it for phishing indicators.
//
// Everything here is offline string parsing. SPF, DKIM and DMARC results are
// read back from what the receiving mail server recorded; they are never
// re-verified, because that needs DNS and this runs entirely in the browser.
// Callers must surface that distinction, otherwise the output reads as
// verification when it is only reporting.

export type EmailHeader = { name: string; value: string };

export type Hop = {
	index: number;
	from: string;
	by: string;
	protocol: string;
	id: string;
	recipient: string;
	ip: string;
	dateRaw: string;
	timestamp: number | null;
	delaySeconds: number | null;
	raw: string;
};

export type AuthMethod = 'spf' | 'dkim' | 'dmarc' | 'arc' | 'compauth';
export type AuthResult = { method: string; result: string; detail: string };

export type Grade = 'good' | 'warn' | 'bad' | 'info';
export type Finding = { key: string; grade: Grade; summary: string; detail: string; raw?: string };

export type Address = { display: string; address: string; domain: string };

export type Analysis = {
	headers: EmailHeader[];
	hops: Hop[];
	auth: AuthResult[];
	findings: Finding[];
	subject: string;
	from: Address | null;
	replyTo: Address | null;
	returnPath: Address | null;
	to: Address | null;
	transitSeconds: number | null;
	verdict: 'clean' | 'review' | 'suspicious';
};

// ── Parsing ──────────────────────────────────────────────────────────────

/**
 * Unfold a header block per RFC 5322: a field continues onto any following
 * line that starts with whitespace. Stops at the blank line separating the
 * headers from the body. Order and duplicates are preserved, because the
 * Received chain depends on both.
 */
export function unfoldHeaders(raw: string): EmailHeader[] {
	const lines = raw
		.replace(/\r\n/g, '\n')
		.replace(/\r/g, '\n')
		// Tolerate forwarded mail quoted with "> ". One space after the marker
		// is consumed so genuine continuation indentation survives.
		.split('\n')
		.map((l) => l.replace(/^>+ ?/, ''));

	const out: EmailHeader[] = [];
	let current: string | null = null;

	const flush = () => {
		if (current === null) return;
		const idx = current.indexOf(':');
		if (idx > 0) {
			out.push({ name: current.slice(0, idx).trim(), value: current.slice(idx + 1).trim() });
		}
		current = null;
	};

	for (const line of lines) {
		if (line.trim() === '') break;
		if (/^[ \t]/.test(line) && current !== null) {
			current += ' ' + line.trim();
			continue;
		}
		flush();
		current = line;
	}
	flush();
	return out;
}

const get = (headers: EmailHeader[], name: string): string | undefined =>
	headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value;

const getAll = (headers: EmailHeader[], name: string): string[] =>
	headers.filter((h) => h.name.toLowerCase() === name.toLowerCase()).map((h) => h.value);

/**
 * Split `"Display Name" <user@host>` into its parts.
 *
 * The real address is the last angle-bracket pair that is *not* inside a
 * quoted string. A display name is allowed to contain anything, including a
 * complete decoy address, so taking the first `<...>` would report the
 * spoofed address as the sender: exactly the attack this tool is for.
 */
export function parseAddress(value: string): Address {
	const raw = value.trim();

	let inQuote = false;
	let escaped = false;
	let open = -1;
	let bestOpen = -1;
	let bestClose = -1;

	for (let i = 0; i < raw.length; i++) {
		const ch = raw[i];
		if (escaped) { escaped = false; continue; }
		if (ch === '\\') { escaped = true; continue; }
		if (ch === '"') { inQuote = !inQuote; continue; }
		if (inQuote) continue;
		if (ch === '<') open = i;
		else if (ch === '>' && open >= 0) { bestOpen = open; bestClose = i; open = -1; }
	}

	const hasAngles = bestOpen >= 0 && bestClose > bestOpen;
	let address = (hasAngles ? raw.slice(bestOpen + 1, bestClose) : raw)
		.trim()
		.replace(/^mailto:/i, '');

	// Header fields such as To: may list several recipients. Report the first,
	// so the domain checks compare against something meaningful.
	if (!hasAngles && address.includes(',')) address = address.split(',')[0].trim();

	let display = hasAngles ? raw.slice(0, bestOpen).trim() : '';
	display = display.replace(/^"(.*)"$/s, '$1').replace(/\\"/g, '"').trim();

	const at = address.lastIndexOf('@');
	const domain = at >= 0 ? address.slice(at + 1).trim().toLowerCase().replace(/[>,;]+$/, '') : '';
	return { display, address, domain };
}

/** Pull the structured fields out of one Received header value. */
export function parseReceived(value: string, index: number): Hop {
	const collapsed = value.replace(/\s+/g, ' ').trim();

	// The timestamp is whatever follows the final ";".
	const semi = collapsed.lastIndexOf(';');
	const dateRaw = semi >= 0 ? collapsed.slice(semi + 1).trim() : '';
	const head = semi >= 0 ? collapsed.slice(0, semi) : collapsed;

	const grab = (re: RegExp): string => re.exec(head)?.[1]?.trim() ?? '';

	// "from" may carry a parenthesised rDNS/IP comment; keep it, it is evidence.
	const from = grab(/\bfrom\s+([^\s;]+(?:\s+\([^)]*\))?)/i);
	const by = grab(/\bby\s+([^\s;]+)/i);
	const protocol = grab(/\bwith\s+([^\s;]+)/i);
	const id = grab(/\bid\s+([^\s;]+)/i);
	const recipient = grab(/\bfor\s+<?([^\s;<>]+)>?/i);

	const ipv4 = /\[?((?:\d{1,3}\.){3}\d{1,3})\]?/.exec(from)?.[1] ?? '';
	const ipv6 = /\[?((?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4})\]?/i.exec(from)?.[1] ?? '';

	return {
		index,
		from,
		by,
		protocol,
		id,
		recipient,
		ip: ipv4 || ipv6,
		dateRaw,
		timestamp: parseDate(dateRaw),
		delaySeconds: null,
		raw: value.trim()
	};
}

/** RFC 2822 date, tolerating a trailing "(SGT)" style comment. */
export function parseDate(value: string): number | null {
	if (!value) return null;
	const cleaned = value.replace(/\s*\([^)]*\)\s*$/, '').trim();
	const t = new Date(cleaned).getTime();
	return Number.isNaN(t) ? null : t;
}

/** Read spf/dkim/dmarc verdicts out of Authentication-Results / Received-SPF. */
export function parseAuth(headers: EmailHeader[]): AuthResult[] {
	const out: AuthResult[] = [];
	const seen = new Set<string>();

	for (const value of getAll(headers, 'Authentication-Results')) {
		const re = /\b(spf|dkim|dmarc|arc|compauth)\s*=\s*([a-z]+)/gi;
		let m: RegExpExecArray | null;
		while ((m = re.exec(value))) {
			const method = m[1].toLowerCase();
			if (seen.has(method)) continue;
			seen.add(method);
			const tail = value.slice(m.index + m[0].length);
			const detail = /^[^;]*/.exec(tail)?.[0]?.trim() ?? '';
			out.push({ method, result: m[2].toLowerCase(), detail });
		}
	}

	if (!seen.has('spf')) {
		const spf = get(headers, 'Received-SPF');
		if (spf) {
			const result = /^\s*(pass|fail|softfail|neutral|none|permerror|temperror)/i.exec(spf)?.[1];
			if (result) out.push({ method: 'spf', result: result.toLowerCase(), detail: spf.trim() });
		}
	}

	return out;
}

// ── Triage ───────────────────────────────────────────────────────────────

const AUTH_GRADE: Record<string, Grade> = {
	pass: 'good',
	fail: 'bad',
	softfail: 'warn',
	neutral: 'warn',
	none: 'warn',
	permerror: 'warn',
	temperror: 'info',
	bestguesspass: 'warn'
};

// Two-level public suffixes where the registrable domain is three labels.
// Without these, evil.com.sg and dbs.com.sg both reduce to "com.sg" and would
// be reported as the same organisation. This is a pragmatic subset, not the
// full Public Suffix List, which is far too large to ship for this purpose.
const MULTI_PART_SUFFIXES = new Set([
	'com.sg', 'edu.sg', 'gov.sg', 'net.sg', 'org.sg', 'per.sg',
	'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'me.uk', 'net.uk',
	'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au',
	'co.jp', 'or.jp', 'ne.jp', 'ac.jp', 'go.jp',
	'com.my', 'com.hk', 'com.cn', 'com.tw', 'com.br', 'com.mx',
	'co.in', 'co.id', 'co.kr', 'co.nz', 'co.za', 'com.tr',
	'com.ph', 'com.vn', 'co.th', 'com.ar', 'com.pk'
]);

/** The registrable domain, e.g. mail.dbs.com.sg -> dbs.com.sg. */
export function registrableDomain(domain: string): string {
	const parts = domain.toLowerCase().split('.').filter(Boolean);
	if (parts.length <= 2) return parts.join('.');
	const lastTwo = parts.slice(-2).join('.');
	const take = MULTI_PART_SUFFIXES.has(lastTwo) ? 3 : 2;
	return parts.slice(-take).join('.');
}

/** Do two domains belong to the same organisation? */
export function sameOrgDomain(a: string, b: string): boolean {
	if (!a || !b) return false;
	if (a === b) return true;
	return registrableDomain(a) === registrableDomain(b);
}

const EMAIL_IN_TEXT = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

export function analyze(raw: string): Analysis {
	const headers = unfoldHeaders(raw);

	const fromRaw = get(headers, 'From');
	const from = fromRaw ? parseAddress(fromRaw) : null;
	const replyToRaw = get(headers, 'Reply-To');
	const replyTo = replyToRaw ? parseAddress(replyToRaw) : null;
	const returnPathRaw = get(headers, 'Return-Path');
	const returnPath = returnPathRaw ? parseAddress(returnPathRaw) : null;
	const toRaw = get(headers, 'To');
	const to = toRaw ? parseAddress(toRaw) : null;

	// Each relay prepends its Received header, so the list is newest first.
	// Reverse it so hop 1 is the origin.
	const received = getAll(headers, 'Received');
	const hops = received
		.map((v, i) => parseReceived(v, i))
		.reverse()
		.map((h, i) => ({ ...h, index: i + 1 }));

	for (let i = 1; i < hops.length; i++) {
		const prev = hops[i - 1].timestamp;
		const cur = hops[i].timestamp;
		hops[i].delaySeconds = prev !== null && cur !== null ? Math.round((cur - prev) / 1000) : null;
	}

	const first = hops[0]?.timestamp ?? null;
	const last = hops[hops.length - 1]?.timestamp ?? null;
	const transitSeconds = first !== null && last !== null ? Math.round((last - first) / 1000) : null;

	const auth = parseAuth(headers);
	const findings: Finding[] = [];

	// ── authentication, as reported by the receiving server ────────────────
	for (const method of ['spf', 'dkim', 'dmarc'] as const) {
		const hit = auth.find((a) => a.method === method);
		const label = method.toUpperCase();
		if (!hit) {
			findings.push({
				key: label,
				grade: 'warn',
				summary: 'Not reported',
				detail: `No ${label} result in Authentication-Results. Either the receiver did not check it, or those headers were not included in what you pasted.`
			});
			continue;
		}
		findings.push({
			key: label,
			grade: AUTH_GRADE[hit.result] ?? 'warn',
			summary: hit.result,
			detail:
				hit.result === 'pass'
					? `The receiving server recorded ${label}=pass. This is its verdict, not a re-check.`
					: `The receiving server recorded ${label}=${hit.result}. Treat a fail or softfail on a supposedly corporate sender as a strong signal.`,
			raw: hit.detail || undefined
		});
	}

	// ── DMARC-style alignment ──────────────────────────────────────────────
	if (from?.domain && returnPath?.domain) {
		const aligned = sameOrgDomain(from.domain, returnPath.domain);
		findings.push({
			key: 'Return-Path alignment',
			grade: aligned ? 'good' : 'warn',
			summary: aligned ? 'Aligned' : 'Different domain',
			detail: aligned
				? `Envelope sender and From are both on ${from.domain}.`
				: `From is ${from.domain} but the envelope sender is ${returnPath.domain}. Normal for mailing lists and marketing platforms, suspicious for a bank.`,
			raw: returnPathRaw
		});
	}

	if (from?.domain && replyTo?.domain && !sameOrgDomain(from.domain, replyTo.domain)) {
		findings.push({
			key: 'Reply-To',
			grade: 'bad',
			summary: 'Redirects elsewhere',
			detail: `Replies go to ${replyTo.domain}, not ${from.domain}. This is how a reply gets captured after a convincing-looking message.`,
			raw: replyToRaw
		});
	}

	// ── display-name spoofing ──────────────────────────────────────────────
	if (from) {
		const inName = EMAIL_IN_TEXT.exec(from.display)?.[0];
		if (inName && inName.toLowerCase() !== from.address.toLowerCase()) {
			findings.push({
				key: 'Display name',
				grade: 'bad',
				summary: 'Contains a different address',
				detail: `The display name reads "${inName}" but the message is actually from ${from.address}. Most mail clients show only the display name.`,
				raw: fromRaw
			});
		} else if (from.display && /\b(support|security|admin|it|helpdesk|payroll|hr|billing)\b/i.test(from.display)) {
			findings.push({
				key: 'Display name',
				grade: 'info',
				summary: 'Authority-flavoured',
				detail: `Display name "${from.display}" claims an internal function. Check it against the sending domain rather than trusting the label.`,
				raw: fromRaw
			});
		}
	}

	// ── lookalike domains ──────────────────────────────────────────────────
	if (from?.domain?.startsWith('xn--') || from?.domain?.includes('.xn--')) {
		findings.push({
			key: 'Sender domain',
			grade: 'bad',
			summary: 'Punycode',
			detail: `${from.domain} is an internationalised domain. Rendered in a mail client it can be visually identical to a familiar brand.`,
			raw: from.domain
		});
	}

	// ── Message-ID provenance ──────────────────────────────────────────────
	const messageId = get(headers, 'Message-ID');
	if (messageId && from?.domain) {
		const midDomain = /@([^>\s]+)>?\s*$/.exec(messageId)?.[1]?.toLowerCase() ?? '';
		if (midDomain && !sameOrgDomain(midDomain, from.domain)) {
			findings.push({
				key: 'Message-ID',
				grade: 'info',
				summary: 'Generated elsewhere',
				detail: `Message-ID is on ${midDomain} while From is ${from.domain}. Common with legitimate senders using a mail platform, worth noting alongside the other signals.`,
				raw: messageId
			});
		}
	} else if (!messageId) {
		findings.push({
			key: 'Message-ID',
			grade: 'warn',
			summary: 'Missing',
			detail: 'Nearly all legitimate mail carries a Message-ID. Bulk sending scripts often omit it.'
		});
	}

	// ── transit anomalies ──────────────────────────────────────────────────
	const stalled = hops.filter((h) => (h.delaySeconds ?? 0) >= 3600);
	if (stalled.length) {
		findings.push({
			key: 'Relay timing',
			grade: 'info',
			summary: `${stalled.length} slow hop${stalled.length === 1 ? '' : 's'}`,
			detail: `A hop took an hour or more. Usually greylisting or a queue backlog, occasionally a sign the headers were assembled by hand.`,
			raw: stalled.map((h) => `hop ${h.index}: ${formatDuration(h.delaySeconds ?? 0)}`).join('\n')
		});
	}

	if (hops.length === 0) {
		findings.push({
			key: 'Received chain',
			grade: 'info',
			summary: 'No hops found',
			detail: 'No Received headers were present. Paste the full original headers to reconstruct the delivery path.'
		});
	}

	const verdict: Analysis['verdict'] = findings.some((f) => f.grade === 'bad')
		? 'suspicious'
		: findings.some((f) => f.grade === 'warn')
			? 'review'
			: 'clean';

	return {
		headers,
		hops,
		auth,
		findings,
		subject: get(headers, 'Subject') ?? '',
		from,
		replyTo,
		returnPath,
		to,
		transitSeconds,
		verdict
	};
}

export function formatDuration(seconds: number): string {
	const s = Math.abs(seconds);
	if (s < 1) return 'instant';
	if (s < 60) return `${s}s`;
	if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	return `${h}h ${m}m`;
}
