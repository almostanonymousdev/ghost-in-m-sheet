/**
 * Cheat / test-only method call-site lint.
 *
 * Some controller methods exist solely for the in-game cheat dialog or
 * for unit / e2e specs to park the player in a contrived state without
 * running the full production setup (e.g. parking the player in an
 * "active hunt" state by stamping a minimal $run rather than rolling a
 * procedural floorplan + modifiers + starting tools).
 *
 * Naming convention: those methods are prefixed `cheat` — e.g.
 *   setup.Ghosts.cheatStartHunt(name)
 *   setup.Ghosts.cheatForceHuntGhost(g)
 *   setup.HuntController.cheatStampMinimalRun({...})
 *   setup.Intro.cheatMaximizeSensualBodyParts(obj)
 *
 * This lint policies the call sites: a `setup.X.cheatY()` call may appear
 * in tests/ (any file) or in passages/ only from explicitly-allowlisted
 * cheat-dialog code (currently the GuiController cheat menu). Anywhere
 * else in passages/ is a violation — production code paths must call the
 * non-cheat equivalents (setup.HuntController.start, etc.).
 *
 * Together with the naming half (a method prefixed `cheat`) and the
 * lint half (call sites restricted), the rule is self-enforcing: any
 * new test/cheat-only helper that follows the convention gets the
 * lint protection for free; a non-test caller is forced to either
 * use a production API or drop the `cheat` prefix.
 */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const PASSAGES_ROOT = path.join(__dirname, '..', 'passages');

/* Files inside passages/ that are explicitly allowed to invoke
   setup.X.cheat*() — i.e. the cheat dialog itself. Paths are
   relative to PASSAGES_ROOT, normalised with forward slashes.
   Anything else under passages/ that calls a cheat* method is a
   lint violation. Adding a new allowlist entry should be rare and
   reviewed: the point of the lint is that the in-game cheat menu is
   the only production caller. */
const ALLOWED_CALLERS = new Set([
	'gui/GuiController.js'
]);

/* Recursively collect every .tw and .js source file under `dir`. */
function collectSourceFiles(dir) {
	const out = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			out.push(...collectSourceFiles(full));
		} else if (entry.name.endsWith('.tw') || entry.name.endsWith('.js')) {
			out.push(full);
		}
	}
	return out;
}

/* Blank out JS line/block comments and string literals so identifiers
   embedded in doc comments / strings don't register as call sites.
   Preserves line numbers (newlines kept) so reported positions line
   up with the original source. */
function stripCommentsAndStrings(src) {
	const out = src.split('');
	let i = 0;
	const len = out.length;
	const blank = (start, end) => {
		for (let k = start; k < end; k++) {
			if (out[k] !== '\n') out[k] = ' ';
		}
	};
	while (i < len) {
		const c = out[i];
		const next = out[i + 1];
		if (c === '/' && next === '/') {
			let j = i + 2;
			while (j < len && out[j] !== '\n') j++;
			blank(i, j); i = j; continue;
		}
		if (c === '/' && next === '*') {
			let j = i + 2;
			while (j < len - 1 && !(out[j] === '*' && out[j + 1] === '/')) j++;
			j = Math.min(len, j + 2);
			blank(i, j); i = j; continue;
		}
		if (c === "'" || c === '"' || c === '`') {
			const quote = c;
			let j = i + 1;
			while (j < len && out[j] !== quote) {
				if (out[j] === '\\') j += 2; else j++;
			}
			j = Math.min(len, j + 1);
			blank(i + 1, j - 1);
			i = j; continue;
		}
		i++;
	}
	return out.join('');
}

test.describe('cheat method call sites', () => {

	/* Every setup.X.cheatY(...) call in passages/ must come from a
	   file in ALLOWED_CALLERS. Tests live outside passages/ and are
	   naturally exempt — they're the primary intended callers. */
	test('no production passages call setup.X.cheat* outside the cheat dialog', () => {
		const files = collectSourceFiles(PASSAGES_ROOT);
		const violations = [];
		/* Match `setup.X.cheatY(` where Y starts with a capital. The
		   trailing `(` requirement skips method references stored
		   without invocation (rare, but keeps the rule "call sites"
		   not "any mention"). */
		const CHEAT_RE = /\bsetup\.[A-Z]\w*\.(cheat[A-Z]\w*)\s*\(/g;
		/* A `cheat`-prefixed function may delegate to other `cheat`
		   methods (e.g. cheatStartHunt → cheatStampMinimalRun). To
		   allow that, find function-definition headers whose name
		   starts with `cheat` and skip any matches in their body.
		   We approximate the body extent by walking forward from the
		   opening `{` and balancing braces, ignoring braces inside
		   strings/comments (already blanked by stripCommentsAndStrings).
		   Patterns covered:
		     `cheatX: function (...)`        — object-literal method
		     `function cheatX(...)`          — function declaration
		     `cheatX = function (...)`       — assignment form
		   The heuristic is intentionally simple: nested functions
		   inside a cheat body remain inside its brace range and so
		   are also exempt, which matches what we want (helpers a
		   cheat method defines locally). */
		const CHEAT_DEF_RE = /\b(?:function\s+(cheat[A-Z]\w*)|(cheat[A-Z]\w*)\s*[:=]\s*function)\b/g;
		function cheatBodyRanges(text) {
			const ranges = [];
			CHEAT_DEF_RE.lastIndex = 0;
			let m;
			while ((m = CHEAT_DEF_RE.exec(text)) !== null) {
				const open = text.indexOf('{', m.index + m[0].length);
				if (open === -1) continue;
				let depth = 0;
				let j = open;
				for (; j < text.length; j++) {
					const ch = text[j];
					if (ch === '{') depth++;
					else if (ch === '}') {
						depth--;
						if (depth === 0) { j++; break; }
					}
				}
				ranges.push([open, j]);
			}
			return ranges;
		}
		function inAnyRange(offset, ranges) {
			for (const [a, b] of ranges) {
				if (offset >= a && offset < b) return true;
			}
			return false;
		}
		for (const file of files) {
			const rel = path.relative(PASSAGES_ROOT, file).split(path.sep).join('/');
			if (ALLOWED_CALLERS.has(rel)) continue;
			const stripped = stripCommentsAndStrings(fs.readFileSync(file, 'utf8'));
			const exemptRanges = cheatBodyRanges(stripped);
			/* Line-start offsets so we can map a regex match to a line
			   number without splitting the file twice. */
			const lineStarts = [0];
			for (let k = 0; k < stripped.length; k++) {
				if (stripped[k] === '\n') lineStarts.push(k + 1);
			}
			CHEAT_RE.lastIndex = 0;
			let m;
			while ((m = CHEAT_RE.exec(stripped)) !== null) {
				if (inAnyRange(m.index, exemptRanges)) continue;
				// Binary-search the line number.
				let lo = 0, hi = lineStarts.length - 1;
				while (lo < hi) {
					const mid = (lo + hi + 1) >> 1;
					if (lineStarts[mid] <= m.index) lo = mid; else hi = mid - 1;
				}
				violations.push(`${rel}:${lo + 1}  ${m[0].replace(/\s*\($/, '()')}`);
			}
		}
		violations.sort();
		expect(
			violations,
			`Production passages calling setup.X.cheat* methods (route through the non-cheat API, or add the file to ALLOWED_CALLERS if it's a new cheat-dialog surface):\n  ${violations.join('\n  ')}`
		).toEqual([]);
	});

	/* Self-test: if the project removes every cheat* method (or the
	   ALLOWED_CALLERS exemption silently absorbs every call), the lint
	   above passes vacuously. Assert that at least one cheat-prefixed
	   method exists somewhere under passages/ so the rule has real work
	   to do. Bump the floor if the codebase deliberately retires the
	   convention. */
	test('the cheat* convention still has live members under passages/', () => {
		const files = collectSourceFiles(PASSAGES_ROOT);
		const DEF_RE = /\b(?:function\s+(cheat[A-Z]\w*)|(cheat[A-Z]\w*)\s*[:=]\s*function)\b/g;
		const found = new Set();
		for (const file of files) {
			const stripped = stripCommentsAndStrings(fs.readFileSync(file, 'utf8'));
			DEF_RE.lastIndex = 0;
			let m;
			while ((m = DEF_RE.exec(stripped)) !== null) {
				found.add(m[1] || m[2]);
			}
		}
		expect(
			found.size,
			`No setup.X.cheat* methods detected — either the convention has been retired (update this lint) or a refactor silently dropped every cheat method.`
		).toBeGreaterThan(0);
	});

});
