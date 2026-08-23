// Regex compilation, matching and static pattern review.
//
// Kept separate from the route so the matching behaviour is unit-testable, and
// so the line-oriented matcher can be reused by anything else that evaluates
// rules against log lines.

export type CompileResult = { ok: true; regex: RegExp } | { ok: false; error: string };

export type MatchInfo = {
	index: number;
	value: string;
	groups: { name: string; value: string | undefined }[];
};

export type MatchSet = {
	matches: MatchInfo[];
	truncated: boolean;
	limit: number;
};

export type LineResult = {
	number: number;
	text: string;
	matches: MatchInfo[];
};

export type LineSet = {
	lines: LineResult[];
	totalLines: number;
	matchedLines: number;
	totalMatches: number;
	truncated: boolean;
};

export type Severity = 'high' | 'medium' | 'low';
export type PatternWarning = { kind: string; severity: Severity; message: string; detail: string };

export const DEFAULT_LIMIT = 5000;

export function compile(pattern: string, flags: string): CompileResult {
	try {
		return { ok: true, regex: new RegExp(pattern, flags) };
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : String(e) };
	}
}

/**
 * Names of the capturing groups in source order, so group N can be labelled.
 * A named group is also numbered in JavaScript, so without this the table
 * shows every named capture twice, once under its index and once under its
 * name.
 */
export function captureNames(source: string): (string | null)[] {
	const names: (string | null)[] = [];
	let inClass = false;
	let escaped = false;

	for (let i = 0; i < source.length; i++) {
		const ch = source[i];
		if (escaped) { escaped = false; continue; }
		if (ch === '\\') { escaped = true; continue; }
		if (inClass) { if (ch === ']') inClass = false; continue; }
		if (ch === '[') { inClass = true; continue; }
		if (ch !== '(') continue;

		const rest = source.slice(i + 1);
		if (!rest.startsWith('?')) { names.push(null); continue; }        // plain group
		const named = /^\?<([A-Za-z_$][\w$]*)>/.exec(rest);
		if (named) { names.push(named[1]); continue; }                    // (?<name>…)
		// Everything else beginning with "?" is non-capturing: (?:…) and the
		// lookaround forms (?=…) (?!…) (?<=…) (?<!…).
	}
	return names;
}

function toMatchInfo(m: RegExpExecArray, names: (string | null)[]): MatchInfo {
	const groups: MatchInfo['groups'] = [];
	for (let i = 1; i < m.length; i++) {
		groups.push({ name: names[i - 1] ?? String(i), value: m[i] });
	}
	return { index: m.index, value: m[0], groups };
}

/**
 * All matches in one string. Callers get `truncated` so the cap can be shown
 * rather than silently dropping results.
 */
export function findMatches(regex: RegExp, text: string, limit = DEFAULT_LIMIT): MatchSet {
	const matches: MatchInfo[] = [];
	let truncated = false;

	const names = captureNames(regex.source);

	if (!regex.global && !regex.sticky) {
		const m = regex.exec(text);
		if (m) matches.push(toMatchInfo(m, names));
		return { matches, truncated, limit };
	}

	// exec with /g or /y is stateful; start clean and never trust a caller's
	// leftover lastIndex.
	const re = new RegExp(regex.source, regex.flags);
	re.lastIndex = 0;

	let m: RegExpExecArray | null;
	while ((m = re.exec(text))) {
		if (matches.length >= limit) {
			truncated = true;
			break;
		}
		matches.push(toMatchInfo(m, names));
		// A zero-length match leaves lastIndex where it is, which would loop
		// forever.
		if (m[0].length === 0) re.lastIndex++;
		if (re.lastIndex > text.length) break;
	}

	return { matches, truncated, limit };
}

/**
 * Match line by line, which is how you actually check a detection pattern
 * against log output. Anchors apply per line here regardless of the m flag.
 */
export function matchLines(regex: RegExp, text: string, limit = DEFAULT_LIMIT): LineSet {
	const rawLines = text.split(/\r\n|\r|\n/);
	const lines: LineResult[] = [];
	let totalMatches = 0;
	let matchedLines = 0;
	let truncated = false;

	for (let i = 0; i < rawLines.length; i++) {
		const remaining = limit - totalMatches;
		if (remaining <= 0) {
			truncated = true;
			break;
		}
		const set = findMatches(regex, rawLines[i], remaining);
		if (set.truncated) truncated = true;
		if (set.matches.length) matchedLines++;
		totalMatches += set.matches.length;
		lines.push({ number: i + 1, text: rawLines[i], matches: set.matches });
	}

	return {
		lines,
		totalLines: rawLines.length,
		matchedLines,
		totalMatches,
		truncated
	};
}

/** Column headers for the capture-group table, in first-seen order. */
export function groupColumns(matches: MatchInfo[]): string[] {
	const seen: string[] = [];
	for (const m of matches) {
		for (const g of m.groups) if (!seen.includes(g.name)) seen.push(g.name);
	}
	return seen;
}

// ── Static pattern review ────────────────────────────────────────────────

const QUANTIFIER = /(?<!\\)(?:\*|\+|\{\d+(?:,\d*)?\})/;

/**
 * Flag shapes associated with catastrophic backtracking.
 *
 * This is a deliberately conservative heuristic, not a decision procedure.
 * It looks for an unbounded quantifier applied to a group that can itself
 * match the same input more than one way, which is the classic (a+)+ shape.
 * It will miss constructions it does not model, so a clean result is not a
 * guarantee of safety.
 */
export function analyzePattern(pattern: string): PatternWarning[] {
	const warnings: PatternWarning[] = [];
	if (!pattern) return warnings;

	type Open = { start: number };
	const stack: Open[] = [];
	let inClass = false;
	let escaped = false;

	for (let i = 0; i < pattern.length; i++) {
		const ch = pattern[i];

		if (escaped) { escaped = false; continue; }
		if (ch === '\\') { escaped = true; continue; }

		if (inClass) {
			if (ch === ']') inClass = false;
			continue;
		}
		if (ch === '[') { inClass = true; continue; }

		if (ch === '(') { stack.push({ start: i }); continue; }

		if (ch === ')') {
			const open = stack.pop();
			if (!open) continue;

			const body = pattern.slice(open.start + 1, i).replace(/^\?(:|<?[=!]|<[A-Za-z_$][\w$]*>)/, '');
			const after = pattern.slice(i + 1);
			const quant = /^(?:(\*|\+)|\{(\d+)(?:,(\d*))?\})/.exec(after);
			if (!quant) continue;

			// Only open-ended repetition produces the blow-up. {2} or {2,5} is
			// bounded work; a large upper bound is treated as open-ended.
			const [, symbol, , upper] = quant;
			const openEnded =
				symbol !== undefined ||          // * or +
				upper === '' ||                  // {n,}
				(upper !== undefined && Number(upper) >= 20); // {n,large}
			if (!openEnded) continue;

			const snippet = pattern.slice(open.start, i + 1 + quant[0].length);

			if (stripClasses(body).match(QUANTIFIER)) {
				warnings.push({
					kind: 'nested-quantifier',
					severity: 'high',
					message: 'Nested quantifier',
					detail: `${snippet} applies a repeat to a group that already repeats. On input that almost matches, the engine can try an enormous number of ways to split it. This is the classic catastrophic backtracking shape.`
				});
			} else if (hasTopLevelAlternation(stripClasses(body))) {
				warnings.push({
					kind: 'quantified-alternation',
					severity: 'medium',
					message: 'Repeated alternation',
					detail: `${snippet} repeats a group containing alternatives. If two alternatives can match the same text, the engine has multiple ways to reach the same position and backtracking can blow up.`
				});
			}
		}
	}

	if (stack.length) {
		// Unbalanced parentheses will already have failed to compile; nothing to add.
	}

	return dedupe(warnings);
}

function stripClasses(s: string): string {
	let out = '';
	let inClass = false;
	let escaped = false;
	for (const ch of s) {
		if (escaped) { escaped = false; continue; }
		if (ch === '\\') { escaped = true; continue; }
		if (inClass) { if (ch === ']') inClass = false; continue; }
		if (ch === '[') { inClass = true; continue; }
		out += ch;
	}
	return out;
}

function hasTopLevelAlternation(body: string): boolean {
	let depth = 0;
	for (let i = 0; i < body.length; i++) {
		const ch = body[i];
		if (ch === '(') depth++;
		else if (ch === ')') depth--;
		else if (ch === '|' && depth === 0) return true;
	}
	return false;
}

function dedupe(warnings: PatternWarning[]): PatternWarning[] {
	const seen = new Set<string>();
	return warnings.filter((w) => {
		const key = w.kind + '|' + w.detail;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}
