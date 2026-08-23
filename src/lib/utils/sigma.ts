// Evaluate a Sigma rule against sample events, entirely in the browser.
//
// This implements a deliberate subset of the Sigma specification. Anything it
// does not model is refused by name rather than ignored: a detection engineer
// acting on a silent false negative is worse off than one told the tool cannot
// answer the question.

import { load as loadYaml, YAMLException } from 'js-yaml';

export type SigmaRule = {
	title?: string;
	id?: string;
	status?: string;
	description?: string;
	author?: string;
	level?: string;
	logsource?: Record<string, unknown>;
	detection: Record<string, unknown>;
	[k: string]: unknown;
};

export type ParseOutcome = { ok: true; rule: SigmaRule } | { ok: false; error: string };

export type Unsupported = { feature: string; where: string; detail: string };

export type BlockOutcome = { name: string; matched: boolean };
export type EvalOutcome = { matched: boolean; blocks: BlockOutcome[] };

export type EventParse =
	| { ok: true; events: Record<string, unknown>[] }
	| { ok: false; error: string };

/** Modifiers this implementation actually evaluates. */
export const SUPPORTED_MODIFIERS = [
	'contains', 'startswith', 'endswith', 're', 'all', 'exists',
	'lt', 'lte', 'gt', 'gte', 'cidr'
] as const;

/** Modifiers that exist in Sigma but are not evaluated here. */
const REFUSED_MODIFIERS: Record<string, string> = {
	base64: 'Encodes the value as base64 before matching.',
	base64offset: 'Matches base64 at any of three byte offsets.',
	utf16: 'Re-encodes the value as UTF-16 before matching.',
	utf16le: 'Re-encodes the value as UTF-16LE before matching.',
	utf16be: 'Re-encodes the value as UTF-16BE before matching.',
	wide: 'Alias for utf16le.',
	expand: 'Expands a placeholder from an external value list.',
	fieldref: 'Compares against another field rather than a literal.',
	windash: 'Expands command-line dash variants.'
};

// ── Rule parsing ─────────────────────────────────────────────────────────

export function parseRule(yamlText: string): ParseOutcome {
	if (!yamlText.trim()) return { ok: false, error: 'Rule is empty.' };

	let doc: unknown;
	try {
		doc = loadYaml(yamlText);
	} catch (e) {
		if (e instanceof YAMLException) return { ok: false, error: `YAML: ${e.reason ?? e.message}` };
		return { ok: false, error: e instanceof Error ? e.message : String(e) };
	}

	if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
		return { ok: false, error: 'Rule must be a YAML mapping at the top level.' };
	}
	const rule = doc as SigmaRule;

	if (!rule.detection || typeof rule.detection !== 'object' || Array.isArray(rule.detection)) {
		return { ok: false, error: 'Rule has no "detection" section.' };
	}
	if (typeof rule.detection.condition !== 'string' && !Array.isArray(rule.detection.condition)) {
		return { ok: false, error: 'detection has no "condition".' };
	}
	if (blockNames(rule).length === 0) {
		return { ok: false, error: 'detection has a condition but no search identifiers.' };
	}

	return { ok: true, rule };
}

export function blockNames(rule: SigmaRule): string[] {
	return Object.keys(rule.detection).filter((k) => k !== 'condition');
}

/** The condition string. A list condition is treated as OR, per the spec. */
export function conditionOf(rule: SigmaRule): string {
	const c = rule.detection.condition;
	if (Array.isArray(c)) return c.map((x) => `(${String(x)})`).join(' or ');
	return String(c ?? '');
}

/**
 * Report Sigma features present in the rule that this evaluator does not
 * implement. A non-empty result means the verdict would be unreliable, so
 * callers should refuse to show one.
 */
export function findUnsupported(rule: SigmaRule): Unsupported[] {
	const out: Unsupported[] = [];

	const inspectMap = (map: Record<string, unknown>, where: string) => {
		for (const key of Object.keys(map)) {
			const parts = key.split('|');
			for (const mod of parts.slice(1)) {
				const m = mod.toLowerCase();
				if (REFUSED_MODIFIERS[m]) {
					out.push({ feature: `|${m}`, where, detail: REFUSED_MODIFIERS[m] });
				} else if (!(SUPPORTED_MODIFIERS as readonly string[]).includes(m)) {
					out.push({ feature: `|${mod}`, where, detail: 'Unrecognised modifier.' });
				}
			}
		}
	};

	for (const name of blockNames(rule)) {
		const block = rule.detection[name];
		if (Array.isArray(block)) {
			block.forEach((entry, i) => {
				if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
					inspectMap(entry as Record<string, unknown>, `${name}[${i}]`);
				}
			});
		} else if (block && typeof block === 'object') {
			inspectMap(block as Record<string, unknown>, name);
		}
	}

	// Deduplicate on feature + location.
	const seen = new Set<string>();
	return out.filter((u) => {
		const k = u.feature + '@' + u.where;
		if (seen.has(k)) return false;
		seen.add(k);
		return true;
	});
}

// ── Event parsing ────────────────────────────────────────────────────────

/** Accepts a JSON array, a single JSON object, or one JSON object per line. */
export function parseEvents(text: string): EventParse {
	const trimmed = text.trim();
	if (!trimmed) return { ok: true, events: [] };

	if (trimmed.startsWith('[')) {
		try {
			const arr = JSON.parse(trimmed);
			if (!Array.isArray(arr)) return { ok: false, error: 'Expected a JSON array.' };
			return { ok: true, events: arr.map(asObject) };
		} catch (e) {
			return { ok: false, error: `JSON array: ${e instanceof Error ? e.message : String(e)}` };
		}
	}

	const events: Record<string, unknown>[] = [];
	const lines = trimmed.split(/\r\n|\r|\n/);
	// A single pretty-printed object spans lines, so try the whole blob first.
	if (trimmed.startsWith('{')) {
		try {
			return { ok: true, events: [asObject(JSON.parse(trimmed))] };
		} catch {
			// fall through to line-by-line
		}
	}
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();
		if (!line) continue;
		try {
			events.push(asObject(JSON.parse(line)));
		} catch {
			return { ok: false, error: `Line ${i + 1} is not valid JSON. Use one JSON object per line, or a JSON array.` };
		}
	}
	return { ok: true, events };
}

function asObject(v: unknown): Record<string, unknown> {
	return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : { value: v };
}

// ── Value matching ───────────────────────────────────────────────────────

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Sigma plain values support * and ? wildcards, escapable with a backslash. */
export function globToRegex(pattern: string): RegExp {
	let out = '';
	for (let i = 0; i < pattern.length; i++) {
		const ch = pattern[i];
		if (ch === '\\') {
			const next = pattern[i + 1];
			if (next === '*' || next === '?' || next === '\\') { out += escapeRe(next); i++; }
			else out += '\\\\';
			continue;
		}
		if (ch === '*') { out += '[\\s\\S]*'; continue; }
		if (ch === '?') { out += '[\\s\\S]'; continue; }
		out += escapeRe(ch);
	}
	return new RegExp(`^${out}$`, 'i');
}

/** Field lookup: exact key, then dotted path, then case-insensitive key. */
export function lookupField(event: Record<string, unknown>, field: string): unknown {
	if (field in event) return event[field];

	if (field.includes('.')) {
		let cur: unknown = event;
		for (const part of field.split('.')) {
			if (!cur || typeof cur !== 'object') return undefined;
			cur = (cur as Record<string, unknown>)[part];
		}
		if (cur !== undefined) return cur;
	}

	const lower = field.toLowerCase();
	for (const k of Object.keys(event)) if (k.toLowerCase() === lower) return event[k];
	return undefined;
}

function toText(v: unknown): string {
	if (v === null || v === undefined) return '';
	if (typeof v === 'object') return JSON.stringify(v);
	return String(v);
}

function ipv4ToInt(ip: string): number | null {
	const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip.trim());
	if (!m) return null;
	let n = 0;
	for (let i = 1; i <= 4; i++) {
		const o = Number(m[i]);
		if (o > 255) return null;
		n = n * 256 + o;
	}
	return n >>> 0;
}

function inCidr(value: string, cidr: string): boolean {
	const [net, bitsRaw] = cidr.split('/');
	const bits = Number(bitsRaw);
	const a = ipv4ToInt(value);
	const b = ipv4ToInt(net);
	if (a === null || b === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
	if (bits === 0) return true;
	const mask = (0xffffffff << (32 - bits)) >>> 0;
	return (a & mask) >>> 0 === (b & mask) >>> 0;
}

/** Match one expected value against one concrete field value. */
function matchOne(actual: unknown, expected: unknown, mods: string[]): boolean {
	// An explicit null expectation means "absent or null".
	if (expected === null) return actual === undefined || actual === null;

	if (mods.includes('exists')) {
		const want = expected === true || String(expected).toLowerCase() === 'true';
		const present = actual !== undefined && actual !== null;
		return want ? present : !present;
	}

	if (actual === undefined || actual === null) return false;

	// Arrays in the event match if any element matches.
	if (Array.isArray(actual)) return actual.some((a) => matchOne(a, expected, mods));

	for (const numeric of ['lt', 'lte', 'gt', 'gte'] as const) {
		if (mods.includes(numeric)) {
			const a = Number(toText(actual));
			const b = Number(toText(expected));
			if (Number.isNaN(a) || Number.isNaN(b)) return false;
			return numeric === 'lt' ? a < b : numeric === 'lte' ? a <= b : numeric === 'gt' ? a > b : a >= b;
		}
	}

	if (mods.includes('cidr')) return inCidr(toText(actual), toText(expected));

	const text = toText(actual);
	const exp = toText(expected);

	if (mods.includes('re')) {
		try {
			return new RegExp(exp).test(text);
		} catch {
			return false;
		}
	}
	if (mods.includes('contains')) return globToRegex(`*${exp}*`).test(text);
	if (mods.includes('startswith')) return globToRegex(`${exp}*`).test(text);
	if (mods.includes('endswith')) return globToRegex(`*${exp}`).test(text);

	return globToRegex(exp).test(text);
}

/** One `field|mods: value` pair. A list value is OR, or AND under |all. */
function matchField(event: Record<string, unknown>, key: string, expected: unknown): boolean {
	const [field, ...mods] = key.split('|');
	const lowered = mods.map((m) => m.toLowerCase());
	const actual = lookupField(event, field);

	if (Array.isArray(expected)) {
		if (expected.length === 0) return false;
		return lowered.includes('all')
			? expected.every((e) => matchOne(actual, e, lowered))
			: expected.some((e) => matchOne(actual, e, lowered));
	}
	return matchOne(actual, expected, lowered);
}

/** Keyword search: Sigma matches these against the whole record. */
function matchKeyword(event: Record<string, unknown>, expected: unknown): boolean {
	const haystack = JSON.stringify(event);
	return globToRegex(`*${toText(expected)}*`).test(haystack);
}

function matchBlock(event: Record<string, unknown>, block: unknown): boolean {
	if (block === null || block === undefined) return false;

	if (Array.isArray(block)) {
		// A list of maps is OR; a list of scalars is a keyword OR.
		return block.some((entry) =>
			entry && typeof entry === 'object' && !Array.isArray(entry)
				? matchBlock(event, entry)
				: matchKeyword(event, entry)
		);
	}

	if (typeof block === 'object') {
		const map = block as Record<string, unknown>;
		const keys = Object.keys(map);
		if (keys.length === 0) return false;
		return keys.every((k) => matchField(event, k, map[k]));
	}

	return matchKeyword(event, block);
}

// ── Condition parsing ────────────────────────────────────────────────────

type Node =
	| { t: 'ref'; name: string }
	| { t: 'and'; l: Node; r: Node }
	| { t: 'or'; l: Node; r: Node }
	| { t: 'not'; n: Node }
	| { t: 'quant'; count: 'all' | number; pattern: string };

type Token = { k: string; v: string };

function tokenize(src: string): Token[] {
	const tokens: Token[] = [];
	const re = /\s*(\(|\)|\||[A-Za-z_][\w*]*|\d+)/y;
	let i = 0;
	while (i < src.length) {
		re.lastIndex = i;
		const m = re.exec(src);
		if (!m) {
			if (/^\s+$/.test(src.slice(i))) break;
			throw new Error(`Unexpected character at position ${i}: "${src[i]}"`);
		}
		i = re.lastIndex;
		const v = m[1];
		const lower = v.toLowerCase();
		if (v === '(' || v === ')') tokens.push({ k: v, v });
		else if (lower === 'and' || lower === 'or' || lower === 'not' || lower === 'of' || lower === 'them' || lower === 'all')
			tokens.push({ k: lower, v });
		else if (/^\d+$/.test(v)) tokens.push({ k: 'num', v });
		else tokens.push({ k: 'ident', v });
	}
	return tokens;
}

export function parseCondition(src: string): Node {
	const tokens = tokenize(src);
	let pos = 0;
	const peek = () => tokens[pos];
	const eat = (k: string) => {
		if (!tokens[pos] || tokens[pos].k !== k) {
			throw new Error(`Expected ${k} in condition, found ${tokens[pos]?.v ?? 'end of input'}`);
		}
		return tokens[pos++];
	};

	const parseOr = (): Node => {
		let n = parseAnd();
		while (peek()?.k === 'or') { pos++; n = { t: 'or', l: n, r: parseAnd() }; }
		return n;
	};
	const parseAnd = (): Node => {
		let n = parseNot();
		while (peek()?.k === 'and') { pos++; n = { t: 'and', l: n, r: parseNot() }; }
		return n;
	};
	const parseNot = (): Node => {
		if (peek()?.k === 'not') { pos++; return { t: 'not', n: parseNot() }; }
		return parsePrimary();
	};
	const parsePrimary = (): Node => {
		const t = peek();
		if (!t) throw new Error('Condition ended unexpectedly.');

		if (t.k === '(') { pos++; const n = parseOr(); eat(')'); return n; }

		if (t.k === 'num' || t.k === 'all') {
			const count = t.k === 'all' ? 'all' : Number(t.v);
			pos++;
			eat('of');
			const target = peek();
			if (!target) throw new Error('Expected a search identifier after "of".');
			pos++;
			const pattern = target.k === 'them' ? '*' : target.v;
			return { t: 'quant', count, pattern };
		}

		if (t.k === 'ident') { pos++; return { t: 'ref', name: t.v }; }

		throw new Error(`Unexpected "${t.v}" in condition.`);
	};

	const node = parseOr();
	if (pos < tokens.length) throw new Error(`Unexpected "${tokens[pos].v}" after the condition.`);
	return node;
}

function namesMatching(pattern: string, names: string[]): string[] {
	if (pattern === '*') return names;
	const re = globToRegex(pattern);
	return names.filter((n) => re.test(n));
}

// ── Evaluation ───────────────────────────────────────────────────────────

/**
 * Evaluate a rule against one event. Throws if the condition cannot be
 * parsed, so callers should validate once before looping over events.
 */
export function evaluate(rule: SigmaRule, event: Record<string, unknown>): EvalOutcome {
	const names = blockNames(rule);
	const blocks: BlockOutcome[] = names.map((name) => ({
		name,
		matched: matchBlock(event, rule.detection[name])
	}));
	const byName = new Map(blocks.map((b) => [b.name, b.matched]));

	const walk = (n: Node): boolean => {
		switch (n.t) {
			case 'ref': {
				if (!byName.has(n.name)) {
					// A bare identifier with a wildcard is shorthand for "1 of x*".
					const hits = namesMatching(n.name, names);
					if (hits.length) return hits.some((h) => byName.get(h) === true);
					throw new Error(`Condition refers to "${n.name}", which is not defined in detection.`);
				}
				return byName.get(n.name) === true;
			}
			case 'and': return walk(n.l) && walk(n.r);
			case 'or': return walk(n.l) || walk(n.r);
			case 'not': return !walk(n.n);
			case 'quant': {
				const hits = namesMatching(n.pattern, names);
				if (!hits.length) throw new Error(`"of ${n.pattern}" matches no search identifier.`);
				const count = hits.filter((h) => byName.get(h) === true).length;
				return n.count === 'all' ? count === hits.length : count >= n.count;
			}
		}
	};

	return { matched: walk(parseCondition(conditionOf(rule))), blocks };
}
