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
const { openGame, callSetup } = require('./helpers');

/* Every controller that exposes an OWNED_VARS array. */
const CONTROLLER_NAMES = [
	'Mc',
	'Time',
	'Ghosts',
	'ToolController',
	'Wardrobe',
	'Witch',
	'Companion',
	'Home',
	'Church',
	'Salon',
	'CursedItems',
	'Park',
	'Mall',
	'Gym',
	'Library',
	'Events',
	'Delivery',
	'MissingWomen',
	'MonkeyPaw',
	'HauntedHouses',
	'Posession',
	'SpecialEvent',
	'SeduceGhostMinigame',
	'Updates',
	'Gui'
];

/* Top-level State.variables keys we have NOT yet migrated to a single
   owning controller. New variables should land in someone's OWNED_VARS
   instead of growing this list. The allowlist exists so the
   "every-var-owned" invariant can run today without blocking the
   remaining cleanup. Adding an entry to OWNED_VARS should remove it
   from this list. */
const UNOWNED_ALLOWLIST = new Set([
	// Hunt timing not yet folded into Ghosts.
	'elapsedTimeHunt', 'huntTimeRemain',
	// Search-overlay scratch state set by setup.searchToolDefs/StoryScript.
	'searchState',
	// Per-room state objects (kitchen, bedroom, ...) seeded by
	// HOUSE_CONFIG. Owned indirectly by HauntedHouses, but their names
	// vary by house and we don't enumerate them.
	'kitchen', 'bathroom', 'bedroom', 'livingroom', 'hallway',
	'nursery', 'hallwayUpstairs', 'bedroomTwo', 'bathroomTwo', 'basement',
	'roomA', 'roomB', 'roomC',
	'BlockA', 'BlockB',
	'BlockACellA', 'BlockACellB', 'BlockACellC',
	'BlockBCellA', 'BlockBCellB', 'BlockBCellC',
	'reception',
	// `return` is a SugarCube built-in (last non-noreturn passage).
	'return',
	// Random-walk fuzzer / debug scaffolding seeded by tests.
	'__rng__'
]);

test.describe('Variable ownership', () => {
	let page;
	let ownerMap;       // { varName: [ controllerName, ... ] }
	let ownedByName;    // { controllerName: [varName, ...] }

	test.beforeAll(async ({ browser }) => {
		page = await openGame(browser);
		const collected = await page.evaluate((names) => {
			const result = { perController: {} };
			for (const n of names) {
				const ctrl = SugarCube.setup[n];
				const owned = ctrl && ctrl.OWNED_VARS ? Array.from(ctrl.OWNED_VARS) : null;
				result.perController[n] = owned;
			}
			return result;
		}, CONTROLLER_NAMES);
		ownedByName = collected.perController;
		ownerMap = {};
		for (const [ctrl, vars] of Object.entries(ownedByName)) {
			if (!vars) continue;
			for (const v of vars) {
				if (!ownerMap[v]) ownerMap[v] = [];
				ownerMap[v].push(ctrl);
			}
		}
	});

	test.afterAll(async () => {
		await page.close();
	});

	test('every controller in CONTROLLER_NAMES exposes OWNED_VARS', () => {
		const missing = CONTROLLER_NAMES.filter((n) => !ownedByName[n]);
		expect(
			missing,
			`Controllers missing OWNED_VARS: ${missing.join(', ')}`
		).toEqual([]);
	});

	test('OWNED_VARS arrays are non-empty (or explicitly empty)', () => {
		// Salon currently owns nothing — that's a deliberate design choice.
		// Every other registered controller should claim at least one var.
		const empty = CONTROLLER_NAMES
			.filter((n) => ownedByName[n] && ownedByName[n].length === 0 && n !== 'Salon');
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

	test('OWNED_VARS arrays are frozen', async () => {
		const unfrozen = await page.evaluate((names) => {
			const out = [];
			for (const n of names) {
				const ctrl = SugarCube.setup[n];
				if (ctrl && ctrl.OWNED_VARS && !Object.isFrozen(ctrl.OWNED_VARS)) {
					out.push(n);
				}
			}
			return out;
		}, CONTROLLER_NAMES);
		expect(
			unfrozen,
			`Controllers with non-frozen OWNED_VARS: ${unfrozen.join(', ')}`
		).toEqual([]);
	});
});
