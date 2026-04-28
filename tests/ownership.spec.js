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
const { openGame } = require('./helpers');

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
});
