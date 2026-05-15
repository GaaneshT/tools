// Parse a raw HTTP header block and audit it against a checklist.

export type ParsedHeaders = Record<string, string[]>; // lowercased key → values

export function parseHeaders(raw: string): ParsedHeaders {
  const out: ParsedHeaders = {};
  // Allow optional "HTTP/1.1 200 OK" status line at the top
  const lines = raw
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.replace(/^[\s>]+/, ''))   // strip leading whitespace + ">"
    .filter((l) => l.trim() && !/^HTTP\/\S+\s+\d/i.test(l));

  for (const line of lines) {
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const val = line.slice(idx + 1).trim();
    if (!key) continue;
    (out[key] ||= []).push(val);
  }
  return out;
}

export type Grade = 'good' | 'warn' | 'bad' | 'info';
export type Finding = {
  key: string;            // canonical header name for display
  grade: Grade;
  summary: string;
  detail: string;
  raw?: string;
};

// ── Auditors ─────────────────────────────────────────────────────────────

function pick(h: ParsedHeaders, key: string): string | undefined {
  return h[key.toLowerCase()]?.[0];
}

function auditHSTS(h: ParsedHeaders): Finding {
  const raw = pick(h, 'Strict-Transport-Security');
  if (!raw) return { key: 'Strict-Transport-Security', grade: 'bad', summary: 'Missing', detail: 'Add Strict-Transport-Security with at least max-age=15552000 (180 days). Consider includeSubDomains; preload.' };
  const m = /max-age=(\d+)/i.exec(raw);
  const age = m ? Number(m[1]) : 0;
  if (age < 60 * 60 * 24 * 30) return { key: 'Strict-Transport-Security', grade: 'warn', summary: `Short max-age (${age}s)`, detail: 'Browsers will obey, but the protection window is short. Increase to ≥180 days.', raw };
  if (!/includesubdomains/i.test(raw)) return { key: 'Strict-Transport-Security', grade: 'warn', summary: 'No includeSubDomains', detail: 'Subdomains may not be covered. Add includeSubDomains if your apex covers them all.', raw };
  return { key: 'Strict-Transport-Security', grade: 'good', summary: 'OK', detail: `max-age ${age}s${/preload/i.test(raw) ? ' · preload requested' : ''}.`, raw };
}

function auditCSP(h: ParsedHeaders): Finding {
  const raw = pick(h, 'Content-Security-Policy');
  if (!raw) return { key: 'Content-Security-Policy', grade: 'bad', summary: 'Missing', detail: 'No CSP. Define at least default-src and script-src to mitigate XSS.' };
  const issues: string[] = [];
  if (/'unsafe-inline'/.test(raw)) issues.push("uses 'unsafe-inline' (defeats most XSS protection)");
  if (/'unsafe-eval'/.test(raw))   issues.push("uses 'unsafe-eval'");
  if (/\bdata:\b/.test(raw) && /script-src/i.test(raw)) issues.push('script-src allows data:');
  if (!/default-src|script-src/i.test(raw)) issues.push('no default-src or script-src directive');
  if (issues.length === 0) return { key: 'Content-Security-Policy', grade: 'good', summary: 'OK', detail: 'No obvious weaknesses detected.', raw };
  return { key: 'Content-Security-Policy', grade: 'warn', summary: 'Weaknesses', detail: issues.join('; '), raw };
}

function auditXFO(h: ParsedHeaders): Finding {
  const raw = pick(h, 'X-Frame-Options');
  if (!raw) {
    // CSP frame-ancestors is the modern alternative
    const csp = pick(h, 'Content-Security-Policy');
    if (csp && /frame-ancestors/i.test(csp)) {
      return { key: 'X-Frame-Options', grade: 'good', summary: 'Superseded by CSP', detail: 'CSP frame-ancestors directive is set; X-Frame-Options is redundant.', raw: csp };
    }
    return { key: 'X-Frame-Options', grade: 'bad', summary: 'Missing', detail: 'Set X-Frame-Options: DENY (or use CSP frame-ancestors).' };
  }
  if (/^DENY$/i.test(raw)) return { key: 'X-Frame-Options', grade: 'good', summary: 'DENY', detail: 'Cannot be framed by any origin.', raw };
  if (/^SAMEORIGIN$/i.test(raw)) return { key: 'X-Frame-Options', grade: 'good', summary: 'SAMEORIGIN', detail: 'Only framed by same origin.', raw };
  return { key: 'X-Frame-Options', grade: 'warn', summary: 'Unusual value', detail: 'Prefer DENY or SAMEORIGIN.', raw };
}

function auditXCTO(h: ParsedHeaders): Finding {
  const raw = pick(h, 'X-Content-Type-Options');
  if (!raw) return { key: 'X-Content-Type-Options', grade: 'bad', summary: 'Missing', detail: 'Add "nosniff" to prevent MIME-type confusion attacks.' };
  if (/^nosniff$/i.test(raw)) return { key: 'X-Content-Type-Options', grade: 'good', summary: 'nosniff', detail: 'MIME sniffing disabled.', raw };
  return { key: 'X-Content-Type-Options', grade: 'warn', summary: 'Unexpected value', detail: 'Only "nosniff" is meaningful.', raw };
}

function auditReferrer(h: ParsedHeaders): Finding {
  const raw = pick(h, 'Referrer-Policy');
  if (!raw) return { key: 'Referrer-Policy', grade: 'warn', summary: 'Missing', detail: 'Recommended: no-referrer or strict-origin-when-cross-origin.' };
  if (/^(no-referrer|strict-origin|strict-origin-when-cross-origin|same-origin)$/i.test(raw)) return { key: 'Referrer-Policy', grade: 'good', summary: 'Strict', detail: 'Limits referrer leakage.', raw };
  if (/^(origin|origin-when-cross-origin)$/i.test(raw)) return { key: 'Referrer-Policy', grade: 'warn', summary: 'Lax', detail: 'Origin is sent; consider stricter.', raw };
  return { key: 'Referrer-Policy', grade: 'warn', summary: 'Unusual', detail: 'Review value.', raw };
}

function auditPP(h: ParsedHeaders): Finding {
  const raw = pick(h, 'Permissions-Policy');
  if (!raw) return { key: 'Permissions-Policy', grade: 'warn', summary: 'Missing', detail: 'Restrict powerful features (camera, microphone, geolocation, etc.) you don\'t use.' };
  return { key: 'Permissions-Policy', grade: 'good', summary: 'Set', detail: 'Declared. Review the directives to make sure they match your usage.', raw };
}

function auditCOOP(h: ParsedHeaders): Finding {
  const raw = pick(h, 'Cross-Origin-Opener-Policy');
  if (!raw) return { key: 'Cross-Origin-Opener-Policy', grade: 'warn', summary: 'Missing', detail: 'Set same-origin (or same-origin-allow-popups) to isolate browsing contexts.' };
  return { key: 'Cross-Origin-Opener-Policy', grade: 'good', summary: raw, detail: 'Browsing context isolation is in effect.', raw };
}

function auditCOEP(h: ParsedHeaders): Finding {
  const raw = pick(h, 'Cross-Origin-Embedder-Policy');
  if (!raw) return { key: 'Cross-Origin-Embedder-Policy', grade: 'info', summary: 'Not set', detail: 'Optional. Required only if you need SharedArrayBuffer/cross-origin isolation.' };
  return { key: 'Cross-Origin-Embedder-Policy', grade: 'good', summary: raw, detail: 'Embedder policy is set.', raw };
}

function auditCORP(h: ParsedHeaders): Finding {
  const raw = pick(h, 'Cross-Origin-Resource-Policy');
  if (!raw) return { key: 'Cross-Origin-Resource-Policy', grade: 'info', summary: 'Not set', detail: 'Optional. Limits which origins can fetch this resource.' };
  return { key: 'Cross-Origin-Resource-Policy', grade: 'good', summary: raw, detail: 'Resource sharing policy is set.', raw };
}

function auditDisclosure(h: ParsedHeaders): Finding[] {
  const findings: Finding[] = [];
  for (const k of ['Server', 'X-Powered-By', 'X-AspNet-Version', 'X-AspNetMvc-Version']) {
    const raw = pick(h, k);
    if (raw) findings.push({
      key: k,
      grade: 'warn',
      summary: 'Disclosed',
      detail: `Reveals stack/version information. Strip or override "${k}" in production responses.`,
      raw
    });
  }
  if (findings.length === 0) {
    findings.push({ key: 'Server / X-Powered-By', grade: 'good', summary: 'Clean', detail: 'No technology disclosure headers detected.' });
  }
  return findings;
}

export function audit(raw: string): { headers: ParsedHeaders; findings: Finding[]; score: number } {
  const headers = parseHeaders(raw);
  const findings: Finding[] = [
    auditHSTS(headers),
    auditCSP(headers),
    auditXFO(headers),
    auditXCTO(headers),
    auditReferrer(headers),
    auditPP(headers),
    auditCOOP(headers),
    auditCOEP(headers),
    auditCORP(headers),
    ...auditDisclosure(headers)
  ];
  const weights: Record<Grade, number> = { good: 1, warn: 0.5, bad: 0, info: 1 };
  // Only weight the security headers, not info checks
  const weighted = findings.filter((f) => f.grade !== 'info');
  const score = weighted.length === 0 ? 0 : Math.round((weighted.reduce((s, f) => s + weights[f.grade], 0) / weighted.length) * 100);
  return { headers, findings, score };
}
