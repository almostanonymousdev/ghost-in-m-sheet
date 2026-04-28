/**
 * Variable-ownership invariants. Each controller declares an OWNED_VARS
 * array on its setup namespace listing the State.variables keys it is
 * the canonical owner of. These tests enforce two rules:
 *
 *   1. No two controllers may claim the same variable.
 *   2. Every State.variables key the running game touches must be owned
 *      by exactly one controller (modulo a small allowlist of legacy
 *      keys we have not yet routed through a controller).
 *
 * The aim is to keep cross-controller state cleanly partitioned. When a
 * new controller is added, register its name in CONTROLLER_NAMES below
 * and add an OWNED_VARS array to the controller; new variables either
 * land in someone's OWNED_VARS or get listed in UNOWNED_ALLOWLIST.
 */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { openGame } = require('./helpers');

const PASSAGES_ROOT = path.join(__dirname, '..', 'passages');

/* Lower-bound on the number of controllers we expect to find at
   runtime. Catches the regression where a controller forgets to
   expose OWNED_VARS (and so vanishes from the dynamic discovery
   below) without us noticing. Bump as new controllers are added. */
const MIN_CONTROLLER_COUNT = 23;

/* Top-level State.variables keys with no owning controller. Only two
   are allowed:
     - `return` — a SugarCube built-in (last non-noreturn passage),
       not a gameplay var the controllers should manage.
     - `__rng__` — random-walk fuzzer / debug scaffolding seeded by
       tests, never present in real saves.
   Every other live $variable must be claimed in some controller's
   OWNED_VARS. */
const UNOWNED_ALLOWLIST = new Set([
	'return',
	'__rng__'
]);

/* Legacy state-var names that only appear in SaveMigration's
   read-and-delete path for old saves. They are read off `vars.X`
   (raw State.variables) to migrate the data into the new shape,
   then `delete`d. They never exist in fresh games and aren't
   owned by any controller. */
const LEGACY_SAVE_VARS = new Set([
	'ghostName', 'ghostEvidence', 'ghostRoom',
	'ghostIsTrapped', 'ghostHuntingMode', 'saveMimic'
]);

test.describe('Variable ownership', () => {
	let page;
	let controllerNames; // [string] — keys of setup.* with an OWNED_VARS array
	let ownerMap;        // { varName: [ controllerName, ... ] }
	let ownedByName;     // { controllerName: [varName, ...] }
	let unfrozenControllers; // [string] — controllers whose OWNED_VARS isn't frozen

	test.beforeAll(async ({ browser }) => {
		page = await openGame(browser);
		const discovered = await page.evaluate(() => {
			// A controller is anything on `setup` that exposes an
			// OWNED_VARS array. Iterating setup picks up new controller
			// files automatically — no registration needed.
			const out = { perController: {}, unfrozen: [] };
			for (const name of Object.keys(SugarCube.setup)) {
				const ctrl = SugarCube.setup[name];
				if (!ctrl || typeof ctrl !== 'object') continue;
				if (!Array.isArray(ctrl.OWNED_VARS)) continue;
				out.perController[name] = Array.from(ctrl.OWNED_VARS);
				if (!Object.isFrozen(ctrl.OWNED_VARS)) out.unfrozen.push(name);
			}
			return out;
		});
		ownedByName = discovered.perController;
		unfrozenControllers = discovered.unfrozen;
		controllerNames = Object.keys(ownedByName);
		ownerMap = {};
		for (const [ctrl, vars] of Object.entries(ownedByName)) {
			for (const v of vars) {
				if (!ownerMap[v]) ownerMap[v] = [];
				ownerMap[v].push(ctrl);
			}
		}
	});

	test.afterAll(async () => {
		await page.close();
	});

	test(`at least ${MIN_CONTROLLER_COUNT} controllers expose OWNED_VARS`, () => {
		// Sanity check: discovery walks setup.* and picks up any object
		// with an OWNED_VARS array. If a controller forgets to expose
		// one (or fails to load) it silently disappears from every
		// other check — this floor catches that regression.
		expect(
			controllerNames.length,
			`Found only ${controllerNames.length} controllers with OWNED_VARS (expected >= ${MIN_CONTROLLER_COUNT}). Discovered: ${controllerNames.join(', ')}`
		).toBeGreaterThanOrEqual(MIN_CONTROLLER_COUNT);
	});

	test('OWNED_VARS arrays are non-empty (or explicitly empty)', () => {
		// Salon currently owns nothing — that's a deliberate design choice.
		// Every other discovered controller should claim at least one var.
		const empty = controllerNames
			.filter((n) => ownedByName[n].length === 0 && n !== 'Salon');
		expect(
			empty,
			`Controllers with empty OWNED_VARS (other than Salon): ${empty.join(', ')}`
		).toEqual([]);
	});

	test('no two controllers claim the same variable', () => {
		const overlaps = Object.entries(ownerMap)
			.filter(([, ctrls]) => ctrls.length > 1)
			.map(([v, ctrls]) => `${v} -> ${ctrls.join(', ')}`);
		expect(
			overlaps,
			`Overlapping OWNED_VARS:\n  ${overlaps.join('\n  ')}`
		).toEqual([]);
	});

	test('every State.variables key is owned by some controller', async () => {
		const liveKeys = await page.evaluate(() => Object.keys(SugarCube.State.variables));
		const owned = new Set(Object.keys(ownerMap));
		const unowned = liveKeys.filter((k) =>
			!owned.has(k) && !UNOWNED_ALLOWLIST.has(k)
		);
		expect(
			unowned,
			`State.variables keys with no owning controller (add to a controller's OWNED_VARS or extend UNOWNED_ALLOWLIST):\n  ${unowned.join('\n  ')}`
		).toEqual([]);
	});

	test('OWNED_VARS arrays are frozen', () => {
		expect(
			unfrozenControllers,
			`Controllers with non-frozen OWNED_VARS: ${unfrozenControllers.join(', ')}`
		).toEqual([]);
	});

	/* Static scan: walk every .tw source file and extract every
	   top-level $variable / State.variables.X / sv().X reference.
	   Each name must appear in some controller's OWNED_VARS or
	   UNOWNED_ALLOWLIST. Catches the "someone added a new global
	   var that isn't seeded at game-init" case the live-snapshot
	   test above misses (e.g. flags only set after a witch
	   contract begins / a hunt ends / a specific event fires). */
	test('every $variable referenced in passages is owned by some controller', () => {
		const ownedSet = new Set(Object.keys(ownerMap));
		const files = collectTwFiles(PASSAGES_ROOT);
		// name -> [file:line example, up to 3]
		const seen = new Map();
		const record = (name, file, lineNum) => {
			if (!seen.has(name)) seen.set(name, []);
			const list = seen.get(name);
			if (list.length < 3) {
				list.push(`${path.relative(PASSAGES_ROOT, file)}:${lineNum}`);
			}
		};
		// Twee `$foo` is a SugarCube state-var reference. In [script]
		// passages the same syntax is just a JS identifier (jQuery's
		// `$el`, `$wrapper`, etc.) so we only scan TWEE_RE outside
		// [script] passages. STATE_RE and SV_RE work in both.
		const TWEE_RE = /\$([a-zA-Z_][a-zA-Z0-9_]*)/g;
		const STATE_RE = /State\.variables\.([a-zA-Z_][a-zA-Z0-9_]*)/g;
		const SV_RE = /\bsv\(\)\.([a-zA-Z_][a-zA-Z0-9_]*)/g;
		for (const file of files) {
			const text = fs.readFileSync(file, 'utf8');
			for (const passage of splitPassages(text)) {
				const stripped = stripJsCommentsAndStrings(passage.body);
				// STATE_RE / SV_RE are unambiguous and run on the full
				// passage body. TWEE_RE only fires in Twee context: skip
				// [script]-tagged passages and the inside of any
				// <<script>>…<</script>> block (where `$x` is jQuery /
				// JS, not SugarCube state).
				const stateLines = stripped.split('\n');
				for (let i = 0; i < stateLines.length; i++) {
					for (const re of [STATE_RE, SV_RE]) {
						re.lastIndex = 0;
						let m;
						while ((m = re.exec(stateLines[i])) !== null) {
							record(m[1], file, passage.headerLine + i);
						}
					}
				}
				if (passage.isScript) continue;
				const tweeText = blankJsBlocks(stripped);
				const tweeLines = tweeText.split('\n');
				for (let i = 0; i < tweeLines.length; i++) {
					TWEE_RE.lastIndex = 0;
					let m;
					while ((m = TWEE_RE.exec(tweeLines[i])) !== null) {
						record(m[1], file, passage.headerLine + i);
					}
				}
			}
		}
		const unowned = [];
		for (const [name, locations] of seen) {
			if (ownedSet.has(name)) continue;
			if (UNOWNED_ALLOWLIST.has(name)) continue;
			if (LEGACY_SAVE_VARS.has(name)) continue;
			unowned.push(`${name} (e.g. ${locations.join(', ')})`);
		}
		unowned.sort();
		expect(
			unowned,
			`$variables referenced in passages but not owned by any controller:\n  ${unowned.join('\n  ')}`
		).toEqual([]);
	});

	/* Encapsulation: a controller's IIFE may only directly read or write
	   State.variables members listed in its own OWNED_VARS. Cross-domain
	   state must go through the owning controller's API
	   (setup.Other.foo()).

	   Detection: for each [script] passage that defines
	   `setup.X = (function () { … })`,
	   - Match `State.variables.<name>` and `sv().<name>` references.
	   - Detect aliases declared as `var <alias> = sv()` / `= State.variables`
	     and treat `<alias>.<name>` as a state-var reference.
	   - Each <name> must be in X's OWNED_VARS.
	   Dynamic access (`s[expr]`) isn't validated. */
	test('controllers only directly access variables they own', () => {
		/* Updates is exempt: its job is save-migration. It deliberately
		   reads and writes vars owned by other controllers to seed
		   initial state on legacy saves before the owning APIs are
		   safe to call. The header comment in UpdatesController.tw
		   spells this out. */
		const EXEMPT_CONTROLLERS = new Set(['Updates']);
		const files = collectTwFiles(PASSAGES_ROOT);
		const violations = [];
		for (const file of files) {
			const text = fs.readFileSync(file, 'utf8');
			for (const passage of splitPassages(text)) {
				if (!passage.isScript) continue;
				/* A passage is a "controller passage" if it assigns to
				   any setup.X where X has OWNED_VARS in our discovered
				   map. Two patterns are in use:
				     setup.X = (function () { … })()      -- IIFE
				     setup.X = { OWNED_VARS: …, … }       -- object literal
				   We accept either by just looking at top-level
				   `setup.X = ` assignments and filtering to known
				   controllers. */
				const SETUP_RE = /\bsetup\.(\w+)\s*=(?!=)/g;
				const ctrlSet = new Set();
				let cm;
				while ((cm = SETUP_RE.exec(passage.body)) !== null) {
					if (ownedByName[cm[1]]) ctrlSet.add(cm[1]);
				}
				if (ctrlSet.size === 0) continue;
				if ([...ctrlSet].some((n) => EXEMPT_CONTROLLERS.has(n))) continue;

				/* If a passage defines multiple controllers in a single
				   IIFE (rare), allow accesses to vars owned by any of
				   them — they share a closure so the boundary doesn't
				   meaningfully exist within the file. */
				const ownedSet = new Set();
				for (const n of ctrlSet) {
					for (const v of ownedByName[n]) ownedSet.add(v);
				}
				const ctrlLabel = [...ctrlSet].sort().join('+');

				const stripped = stripJsCommentsAndStrings(passage.body);

				/* Aliases: any `var/let/const <name> = sv()` or
				   `= State.variables` (not followed by . or [, which
				   would indicate a sub-property read, not aliasing). */
				const aliases = new Set();
				const ALIAS_RE = /\b(?:var|let|const)\s+(\w+)\s*=\s*(?:sv\(\)|State\.variables)(?![.[])/g;
				let am;
				while ((am = ALIAS_RE.exec(stripped)) !== null) {
					aliases.add(am[1]);
				}

				const accessRes = [
					/State\.variables\.([a-zA-Z_]\w*)/g,
					/\bsv\(\)\.([a-zA-Z_]\w*)/g
				];
				for (const alias of aliases) {
					accessRes.push(new RegExp(`\\b${alias}\\.([a-zA-Z_]\\w*)`, 'g'));
				}

				const lines = stripped.split('\n');
				for (let i = 0; i < lines.length; i++) {
					for (const re of accessRes) {
						re.lastIndex = 0;
						let m;
						while ((m = re.exec(lines[i])) !== null) {
							const name = m[1];
							if (ownedSet.has(name)) continue;
							violations.push(
								`${ctrlLabel} (${path.relative(PASSAGES_ROOT, file)}:${passage.headerLine + i}): .${name}`
							);
						}
					}
				}
			}
		}
		violations.sort();
		expect(
			violations,
			`Controllers directly accessing state-vars they don't own (route through the owner's API):\n  ${violations.join('\n  ')}`
		).toEqual([]);
	});
});

/* Recursively collect every .tw file under `dir`. */
function collectTwFiles(dir) {
	const out = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			out.push(...collectTwFiles(full));
		} else if (entry.name.endsWith('.tw')) {
			out.push(full);
		}
	}
	return out;
}

/* Split a .tw file into its individual passages. Each passage starts
   with a `:: Name [tags]` header line and runs until the next header
   or EOF. Returns [{name, isScript, body, headerLine}]. */
function splitPassages(text) {
	const lines = text.split('\n');
	const passages = [];
	let current = null;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (line.startsWith(':: ')) {
			if (current) passages.push(current);
			const tagMatch = line.match(/\[([^\]]+)\]/);
			current = {
				name: line.slice(3),
				isScript: !!(tagMatch && /\bscript\b/i.test(tagMatch[1])),
				body: '',
				headerLine: i + 2 // body starts on the line after the header
			};
		} else if (current) {
			current.body += line + '\n';
		}
	}
	if (current) passages.push(current);
	return passages;
}

/* Blank out the body of every `<<script>>…<</script>>` block, line by
   line, preserving line numbers. Inside such blocks `$foo` is JS /
   jQuery, not a SugarCube state-var reference. */
function blankJsBlocks(src) {
	return src.replace(
		/<<script\b[\s\S]*?<<\/script>>/g,
		(match) => match.replace(/[^\n]/g, ' ')
	);
}

/* Replace JS line/block comments and string literals with same-length
   whitespace so that line/column positions are preserved but textual
   matches inside them no longer fire false positives. Twee macro
   syntax (e.g. `<<set $foo>>`) lives outside JS comments and isn't
   touched. */
function stripJsCommentsAndStrings(src) {
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
		// Line comment
		if (c === '/' && next === '/') {
			let j = i + 2;
			while (j < len && out[j] !== '\n') j++;
			blank(i, j);
			i = j;
			continue;
		}
		// Block comment
		if (c === '/' && next === '*') {
			let j = i + 2;
			while (j < len - 1 && !(out[j] === '*' && out[j + 1] === '/')) j++;
			j = Math.min(len, j + 2);
			blank(i, j);
			i = j;
			continue;
		}
		// String literal (single, double, backtick)
		if (c === "'" || c === '"' || c === '`') {
			const quote = c;
			let j = i + 1;
			while (j < len && out[j] !== quote) {
				if (out[j] === '\\') j += 2; else j++;
			}
			j = Math.min(len, j + 1);
			// Keep quote chars; only blank the content.
			blank(i + 1, j - 1);
			i = j;
			continue;
		}
		i++;
	}
	return out.join('');
}
