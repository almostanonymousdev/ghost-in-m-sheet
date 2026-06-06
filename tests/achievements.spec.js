/**
 * setup.Achievements bus + controller contract.
 *
 * Pins:
 *   - The bus loads independently of Hunt (no setup.Hunt reference at
 *     module-eval time, only at :storyready).
 *   - unlock() on a fresh id emits UNLOCKED once and writes $achievements.
 *   - unlock() on an owned non-repeatable id emits ALREADY_HAD (not UNLOCKED).
 *   - unlock() on a repeatable id emits UNLOCKED every press, regardless of
 *     prior unlock state. This is the bedroom "sploosh" button's contract --
 *     the gag is the toast firing, so a silent second press would be a bug.
 */
const { test, expect } = require('@playwright/test');
const { openGame, resetGame, goToPassage } = require('./helpers');

test.describe('setup.Achievements', () => {
	let page;

	test.beforeAll(async ({ browser }) => {
		page = await openGame(browser);
	});

	test.afterAll(async () => {
		await page.close();
	});

	test.beforeEach(async () => {
		await resetGame(page);
		await page.waitForFunction(() => SugarCube.setup.Achievements && SugarCube.setup.Achievements.unlock);
		/* Drain subscribers and clear stored unlocks so each test gets
		   a clean slate. Subscriber tables live in module-local memory
		   and survive Engine.restart. */
		await page.evaluate(() => {
			window.__achSubs = window.__achSubs || [];
			while (window.__achSubs.length) window.__achSubs.shift()();
			SugarCube.State.variables.achievements = {};
		});
	});

	test('bus is exposed with Event constants', async () => {
		const shape = await page.evaluate(() => {
			const A = SugarCube.setup.Achievements;
			return {
				hasOn: typeof A.on === 'function',
				hasEmit: typeof A.emit === 'function',
				hasUnlock: typeof A.unlock === 'function',
				unlockedEvent: A.Event && A.Event.UNLOCKED,
				alreadyHadEvent: A.Event && A.Event.ALREADY_HAD
			};
		});
		expect(shape.hasOn).toBe(true);
		expect(shape.hasEmit).toBe(true);
		expect(shape.hasUnlock).toBe(true);
		expect(shape.unlockedEvent).toBe('unlocked');
		expect(shape.alreadyHadEvent).toBe('already-had');
	});

	test('first unlock emits UNLOCKED and writes $achievements', async () => {
		const result = await page.evaluate(() => {
			const A = SugarCube.setup.Achievements;
			const calls = [];
			window.__achSubs.push(A.on(A.Event.UNLOCKED, (ctx) => calls.push(ctx.id)));
			const returned = A.unlock('fail.sanity');
			return {
				returned: returned,
				calls: calls,
				stored: !!SugarCube.State.variables.achievements['fail.sanity']
			};
		});
		expect(result.returned).toBe(true);
		expect(result.calls).toEqual(['fail.sanity']);
		expect(result.stored).toBe(true);
	});

	test('second unlock of a non-repeatable id emits ALREADY_HAD only', async () => {
		const result = await page.evaluate(() => {
			const A = SugarCube.setup.Achievements;
			const unlockedCalls = [];
			const alreadyCalls = [];
			window.__achSubs.push(A.on(A.Event.UNLOCKED,    (ctx) => unlockedCalls.push(ctx.id)));
			window.__achSubs.push(A.on(A.Event.ALREADY_HAD, (ctx) => alreadyCalls.push(ctx.id)));
			A.unlock('fail.sanity');
			const secondReturn = A.unlock('fail.sanity');
			return { unlockedCalls, alreadyCalls, secondReturn };
		});
		expect(result.unlockedCalls).toEqual(['fail.sanity']); // only the first press
		expect(result.alreadyCalls).toEqual(['fail.sanity']);  // the second
		expect(result.secondReturn).toBe(false);
	});

	test('repeatable id re-emits UNLOCKED on every press', async () => {
		const result = await page.evaluate(() => {
			const A = SugarCube.setup.Achievements;
			const unlockedCalls = [];
			const alreadyCalls = [];
			window.__achSubs.push(A.on(A.Event.UNLOCKED,    (ctx) => unlockedCalls.push(ctx.id)));
			window.__achSubs.push(A.on(A.Event.ALREADY_HAD, (ctx) => alreadyCalls.push(ctx.id)));
			A.unlock('fun.sploosh');
			A.unlock('fun.sploosh');
			A.unlock('fun.sploosh');
			return { unlockedCalls, alreadyCalls };
		});
		expect(result.unlockedCalls).toEqual(['fun.sploosh', 'fun.sploosh', 'fun.sploosh']);
		expect(result.alreadyCalls).toEqual([]);
	});

	test('bestiary catalogue is derived from setup.Ghosts.list()', async () => {
		const result = await page.evaluate(() => {
			const A = SugarCube.setup.Achievements;
			const G = SugarCube.setup.Ghosts;
			const ghostCount = G.list().length;
			const bestiary = A.all().filter((e) => e.category === 'bestiary');
			return { ghostCount: ghostCount, bestiaryCount: bestiary.length };
		});
		expect(result.bestiaryCount).toBe(result.ghostCount);
	});

	test('unknown id is a no-op (warns, does not throw or store)', async () => {
		const result = await page.evaluate(() => {
			const A = SugarCube.setup.Achievements;
			const returned = A.unlock('does.not.exist');
			return {
				returned: returned,
				stored: !!SugarCube.State.variables.achievements['does.not.exist']
			};
		});
		expect(result.returned).toBe(false);
		expect(result.stored).toBe(false);
	});

	test('toast renders per-achievement icon when catalogue entry has one', async () => {
		const view = await page.evaluate(() => {
			SugarCube.setup.Achievements.unlock('fun.sploosh');
			const $toast = document.querySelector('.achievement-toast');
			const $orb = $toast && $toast.querySelector('.achievement-toast-orb');
			const $img = $toast && $toast.querySelector('.achievement-toast-orb-img');
			return {
				orbHasIconClass: !!($orb && $orb.classList.contains('has-icon')),
				imgPresent: !!$img,
				imgSrc: $img ? $img.getAttribute('src') : null
			};
		});
		expect(view.orbHasIconClass).toBe(true);
		expect(view.imgPresent).toBe(true);
		expect(view.imgSrc).toMatch(/ui\/achievements\/sploosh\.png$/);
	});

	test('toast starts green then swaps to per-achievement icon', async () => {
		/* Mirror the 360 cadence: when the toast first appears, the orb
		   should be the default green glass (no .show-icon yet). After
		   the swap delay, the orb gains .show-icon, which the CSS uses
		   to fade green out and the icon in. */
		const initialClasses = await page.evaluate(() => {
			SugarCube.setup.Achievements.unlock('fun.sploosh');
			const $orb = document.querySelector('.achievement-toast .achievement-toast-orb');
			return $orb ? $orb.className : null;
		});
		expect(initialClasses).toContain('has-icon');
		expect(initialClasses).not.toContain('show-icon');

		/* Wait for the swap class to land. Don't sleep a fixed budget --
		   poll for the class so the test isn't tied to ICON_SWAP_DELAY_MS. */
		await page.waitForFunction(() => {
			const $orb = document.querySelector('.achievement-toast .achievement-toast-orb');
			return !!($orb && $orb.classList.contains('show-icon'));
		}, { timeout: 3000 });
	});

	test('toast keeps cycling between green and icon for the whole hold', async () => {
		/* The orb does not swap once and freeze on the icon -- it
		   alternates green/icon every ICON_SWAP_DELAY_MS so both states
		   remain visible across the hold window. Assert at least one
		   forward+back flip occurs: show-icon lands, then comes off
		   again as the orb returns to green. */
		await page.evaluate(() => {
			SugarCube.setup.Achievements.unlock('fun.sploosh');
		});
		await page.waitForFunction(() => {
			const $orb = document.querySelector('.achievement-toast .achievement-toast-orb');
			return !!($orb && $orb.classList.contains('show-icon'));
		}, { timeout: 3000 });
		await page.waitForFunction(() => {
			const $orb = document.querySelector('.achievement-toast .achievement-toast-orb');
			return !!($orb && !$orb.classList.contains('show-icon'));
		}, { timeout: 3000 });
	});

	test('toast omits the icon image when catalogue entry has no icon', async () => {
		const view = await page.evaluate(() => {
			SugarCube.setup.Achievements.unlock('fail.sanity');
			const $toast = document.querySelector('.achievement-toast');
			const $orb = $toast && $toast.querySelector('.achievement-toast-orb');
			const $img = $toast && $toast.querySelector('.achievement-toast-orb-img');
			return {
				orbHasIconClass: !!($orb && $orb.classList.contains('has-icon')),
				imgPresent: !!$img
			};
		});
		expect(view.orbHasIconClass).toBe(false);
		expect(view.imgPresent).toBe(false);
	});

	test('iconless toast never gets show-icon class', async () => {
		/* Inverse of the swap test: catalogue entries without an icon
		   should stay green for the full hold. If a future refactor
		   accidentally added .show-icon unconditionally, the green
		   would fade out to a bare dark circle for failure/discovery
		   toasts. Poll past the swap delay; absence is the assertion. */
		await page.evaluate(() => {
			SugarCube.setup.Achievements.unlock('fail.sanity');
		});
		/* Give the would-be swap timer ample budget to fire. 1500ms
		   covers ICON_SWAP_DELAY_MS plus generous CI slack. */
		await page.waitForTimeout(1500);
		const hasShowIcon = await page.evaluate(() => {
			const $orb = document.querySelector('.achievement-toast .achievement-toast-orb');
			return !!($orb && $orb.classList.contains('show-icon'));
		});
		expect(hasShowIcon).toBe(false);
	});

	test('toast layer coalesces rapid repeated unlocks of the same id', async () => {
		/* Press the same repeatable trigger many times in one tick. The
		   bus still emits UNLOCKED for each press (that contract is
		   tested above), but the toast layer must coalesce: only the
		   currently-showing toast remains in the DOM, no backlog of
		   identical pending toasts queues up. */
		const counts = await page.evaluate(() => {
			const A = SugarCube.setup.Achievements;
			for (let i = 0; i < 10; i++) A.unlock('fun.sploosh');
			return {
				visible: document.querySelectorAll('.achievement-toast').length
			};
		});
		expect(counts.visible).toBe(1);
	});

	test('TrophyShelf passage lists every catalogue entry', async () => {
		await goToPassage(page, 'TrophyShelf');
		const view = await page.evaluate(() => {
			const total = SugarCube.setup.Achievements.all().length;
			const cards = document.querySelectorAll('.trophy-card').length;
			return { total, cards };
		});
		expect(view.cards).toBe(view.total);
	});

	test('TrophyShelf renders an unlocked entry as unlocked, with name + hint', async () => {
		await page.evaluate(() => {
			SugarCube.setup.Achievements.unlock('fail.sanity');
		});
		await goToPassage(page, 'TrophyShelf');
		const view = await page.evaluate(() => {
			const cards = Array.from(document.querySelectorAll('.trophy-card'));
			const unlocked = cards.filter((c) => c.classList.contains('unlocked'));
			const named = cards.find((c) =>
				c.querySelector('.trophy-card-name') &&
				c.querySelector('.trophy-card-name').textContent.trim() === 'Lost the Plot'
			);
			return {
				anyUnlocked: unlocked.length > 0,
				foundEntry: !!named,
				entryHint: named && named.querySelector('.trophy-card-hint').textContent.trim(),
				entryUnlocked: !!(named && named.classList.contains('unlocked'))
			};
		});
		expect(view.anyUnlocked).toBe(true);
		expect(view.foundEntry).toBe(true);
		expect(view.entryUnlocked).toBe(true);
		expect(view.entryHint).toContain('End a hunt');
	});

	test('TrophyShelf hides hidden+locked entries behind ???', async () => {
		await goToPassage(page, 'TrophyShelf');
		const view = await page.evaluate(() => {
			/* win.nocaught is `hidden: true` in the catalogue. Locked + hidden
			   should render as "???" rather than spoiling the name. */
			const cards = Array.from(document.querySelectorAll('.trophy-card'));
			const byName = function (n) {
				return cards.find((c) => c.querySelector('.trophy-card-name').textContent.trim() === n);
			};
			return {
				hasUntouched: !!byName('Untouched'),
				hasMystery: !!byName('???')
			};
		});
		expect(view.hasUntouched).toBe(false);
		expect(view.hasMystery).toBe(true);
	});

	test('TrophyShelf persists unlocks across save/load (browser migration)', async () => {
		/* The achievements bundle lives in $State.variables.achievements; the
		   save migration's DEFAULTS keep old saves loadable. Unlock something,
		   serialise the save, restart the game, deserialise — the unlock
		   should survive the round-trip exactly like any other $variable. */
		await goToPassage(page, 'CityMap');
		await page.evaluate(() => {
			SugarCube.State.variables.achievements = {};
			SugarCube.setup.Achievements.unlock('disc.trap');
			/* Flush to history: SugarCube reads Save.serialize from history,
			   not the live State.variables working copy. A normal passage
			   transition does this implicitly; here we mutated in place. */
			var idx = SugarCube.State.activeIndex !== undefined
				? SugarCube.State.activeIndex
				: SugarCube.State.history.length - 1;
			var moment = SugarCube.State.history[idx];
			if (moment) moment.variables = JSON.parse(JSON.stringify(SugarCube.State.variables));
		});
		expect(await page.evaluate(() => SugarCube.setup.Achievements.has('disc.trap'))).toBe(true);

		const serialised = await page.evaluate(() => SugarCube.Save.serialize());

		await resetGame(page);
		await page.waitForFunction(() => SugarCube.setup.Achievements && SugarCube.setup.Achievements.unlock);
		/* Sanity: reset wiped the unlock so the round-trip below can't
		   pass as a no-op. */
		expect(await page.evaluate(() => SugarCube.setup.Achievements.has('disc.trap'))).toBe(false);

		await page.evaluate((s) => SugarCube.Save.deserialize(s), serialised);
		expect(await page.evaluate(() => SugarCube.setup.Achievements.has('disc.trap'))).toBe(true);
	});

	test('Hunt-bus integration: Event.CAUGHT unlocks fail.caught', async () => {
		const result = await page.evaluate(() => {
			const A = SugarCube.setup.Achievements;
			const H = SugarCube.setup.Hunt;
			H.emit(H.Event.CAUGHT, { ghostName: 'Banshee' });
			return A.has('fail.caught');
		});
		expect(result).toBe(true);
	});

	test('Hunt-bus integration: SENSOR_GLITCH unlocks disc.pants_on_fire', async () => {
		/* Regression: the Raiju EMF glitch was emitting SENSOR_GLITCH but
		   no subscriber was unlocking the matching catalogue entry, so
		   players watching the sensor read 66 (or any other 0-100 glitch
		   value) never got the achievement. */
		const result = await page.evaluate(() => {
			const A = SugarCube.setup.Achievements;
			const H = SugarCube.setup.Hunt;
			H.emit(H.Event.SENSOR_GLITCH, { tool: 'emf' });
			return A.has('disc.pants_on_fire');
		});
		expect(result).toBe(true);
	});

	test('Hunt-bus integration: LOOT_TAKEN with kind="cash" unlocks disc.loot.cash', async () => {
		const result = await page.evaluate(() => {
			const A = SugarCube.setup.Achievements;
			const H = SugarCube.setup.Hunt;
			H.emit(H.Event.LOOT_TAKEN, { kind: 'cash', roomId: 'room_1' });
			return A.has('disc.loot.cash');
		});
		expect(result).toBe(true);
	});

	test('Hunt-bus integration: LOOT_TAKEN with kind="ectoplasm" unlocks disc.loot.ecto', async () => {
		const result = await page.evaluate(() => {
			const A = SugarCube.setup.Achievements;
			const H = SugarCube.setup.Hunt;
			H.emit(H.Event.LOOT_TAKEN, { kind: 'ectoplasm', roomId: 'room_1' });
			return A.has('disc.loot.ecto');
		});
		expect(result).toBe(true);
	});

	test('Hunt-bus integration: LOOT_TAKEN with non-rare kind does not unlock either loot achievement', async () => {
		/* Guards against the wiring accidentally over-firing -- only
		   the cash and ectoplasm kinds should trip these discovery
		   achievements, not the always-present cursedItem / rescueClue
		   / tarotCards / monkeyPaw / tool_* kinds. */
		const result = await page.evaluate(() => {
			const A = SugarCube.setup.Achievements;
			const H = SugarCube.setup.Hunt;
			H.emit(H.Event.LOOT_TAKEN, { kind: 'tarotCards', roomId: 'room_1' });
			H.emit(H.Event.LOOT_TAKEN, { kind: 'tool_emf',   roomId: 'room_1' });
			return { cash: A.has('disc.loot.cash'), ecto: A.has('disc.loot.ecto') };
		});
		expect(result.cash).toBe(false);
		expect(result.ecto).toBe(false);
	});

	test('StoryEvents integration: CONTRACT_SIGNED unlocks disc.good_girl', async () => {
		const result = await page.evaluate(() => {
			const A = SugarCube.setup.Achievements;
			const SE = SugarCube.setup.StoryEvents;
			SE.emit(SE.Event.CONTRACT_SIGNED, { houseId: 'owaissa', fee: 100, payout: 400 });
			return A.has('disc.good_girl');
		});
		expect(result).toBe(true);
	});

	test('WitchContract.buyContract unlocks disc.good_girl end-to-end', async () => {
		/* Full path: drive the controller the way the witch-contract passage
		   does and confirm the StoryEvents → Achievements wiring fires. */
		const result = await page.evaluate(() => {
			const A = SugarCube.setup.Achievements;
			const W = SugarCube.setup.WitchContract;
			SugarCube.setup.Mc.setMoney(10000);
			W.refresh();
			const houseId = W.offered()[0] && W.offered()[0].houseId;
			const bought = W.buyContract(houseId);
			return { bought: bought, hasAch: A.has('disc.good_girl') };
		});
		expect(result.bought).toBe(true);
		expect(result.hasAch).toBe(true);
	});

	test('cheated save blocks future unlocks but preserves prior ones', async () => {
		const result = await page.evaluate(() => {
			const A = SugarCube.setup.Achievements;
			const SE = SugarCube.setup.StoryEvents;
			A.unlock('fail.sanity');
			const preCheatKept = A.has('fail.sanity');
			SE.emit(SE.Event.CHEAT_USED, { source: 'test' });
			const cheated = A.hasCheated();
			const cheatGranted = A.has('fun.cheat');
			const returned = A.unlock('disc.trap');
			return {
				preCheatKept: preCheatKept,
				cheated: cheated,
				cheatGranted: cheatGranted,
				postCheatReturn: returned,
				postCheatStored: A.has('disc.trap')
			};
		});
		expect(result.preCheatKept).toBe(true);
		expect(result.cheated).toBe(true);
		expect(result.cheatGranted).toBe(true);
		expect(result.postCheatReturn).toBe(false);
		expect(result.postCheatStored).toBe(false);
	});

	test('cheated save still allows fun.cheat to re-fire its own unlock path', async () => {
		/* fun.cheat is the documented exception to the cheated-save gate
		   because it's the artifact OF the cheat. Calling unlock('fun.cheat')
		   directly after a cheat must keep working, otherwise the joke
		   achievement breaks for any subsequent CHEAT_USED emit. */
		const result = await page.evaluate(() => {
			const A = SugarCube.setup.Achievements;
			const SE = SugarCube.setup.StoryEvents;
			SE.emit(SE.Event.CHEAT_USED, { source: 'first' });
			SugarCube.State.variables.achievements['fun.cheat'] = undefined;
			delete SugarCube.State.variables.achievements['fun.cheat'];
			return { reUnlocked: A.unlock('fun.cheat') };
		});
		expect(result.reUnlocked).toBe(true);
	});

	test('cheated flag persists across save/load', async () => {
		await goToPassage(page, 'CityMap');
		await page.evaluate(() => {
			SugarCube.State.variables.achievements = {};
			SugarCube.setup.StoryEvents.emit(
				SugarCube.setup.StoryEvents.Event.CHEAT_USED,
				{ source: 'test' }
			);
			var idx = SugarCube.State.activeIndex !== undefined
				? SugarCube.State.activeIndex
				: SugarCube.State.history.length - 1;
			var moment = SugarCube.State.history[idx];
			if (moment) moment.variables = JSON.parse(JSON.stringify(SugarCube.State.variables));
		});
		const serialised = await page.evaluate(() => SugarCube.Save.serialize());

		await resetGame(page);
		await page.waitForFunction(() => SugarCube.setup.Achievements && SugarCube.setup.Achievements.unlock);
		expect(await page.evaluate(() => SugarCube.setup.Achievements.hasCheated())).toBe(false);

		await page.evaluate((s) => SugarCube.Save.deserialize(s), serialised);
		expect(await page.evaluate(() => SugarCube.setup.Achievements.hasCheated())).toBe(true);
		/* And the gate is live after reload: a brand-new unlock attempt
		   on the restored save should be blocked. */
		const blocked = await page.evaluate(() => {
			return SugarCube.setup.Achievements.unlock('disc.drift');
		});
		expect(blocked).toBe(false);
	});

	/* --- Hunt-end win/discovery wiring --------------------------------
	   Each test emits Hunt.START to reset the per-run tracker, sets up
	   the state the trigger reads ($run modifiers, MonkeyPaw stage,
	   clock), emits any mid-hunt events the achievement requires, then
	   emits the matching HUNT_END_GRACEFUL / HUNT_END_ASSAULTED ctx.
	   Direct .emit() rather than driving the real lifecycle keeps the
	   spec focused on the subscriber contract, not on end-to-end flow. */

	/* win.notools ("Bare Hands"): win without the player ever reading the
	   EMF or UV light. Every GhostProwlEvent force-opens BOTH tool windows
	   (HuntProwl.beginProwlEvent -> activateTool emf+uvl) so the readers can
	   pick up trail/residue regardless of the branch the player takes. That
	   forced activation is NOT the player using a tool, so it must not block
	   the award -- otherwise any hunt with a single prowl makes Bare Hands
	   unobtainable. The signal is the player pressing the EMF/UVL slot
	   (renderEmf/renderUvl emit Event.TOOL_USED), never the window state. */
	test('win.notools survives a prowl force-activating EMF/UVL (window state never blocks it)', async () => {
		const has = await page.evaluate(() => {
			const A = SugarCube.setup.Achievements;
			const H = SugarCube.setup.Hunt;
			H.emit(H.Event.START, {});
			// Simulate the prowl opening both tool windows, then a nav step.
			SugarCube.setup.activateTool('emf');
			SugarCube.setup.activateTool('uvl');
			H.emit(H.Event.TICK, {});
			H.emit(H.Event.HUNT_END_GRACEFUL, { success: true });
			return A.has('win.notools');
		});
		expect(has).toBe(true);
	});

	test('win.notools does NOT unlock when the player reads the EMF', async () => {
		const has = await page.evaluate(() => {
			const A = SugarCube.setup.Achievements;
			const H = SugarCube.setup.Hunt;
			H.emit(H.Event.START, {});
			H.emit(H.Event.TOOL_USED, { tool: 'emf' });
			H.emit(H.Event.HUNT_END_GRACEFUL, { success: true });
			return A.has('win.notools');
		});
		expect(has).toBe(false);
	});

	test('win.notools does NOT unlock when the player reads the UV light', async () => {
		const has = await page.evaluate(() => {
			const A = SugarCube.setup.Achievements;
			const H = SugarCube.setup.Hunt;
			H.emit(H.Event.START, {});
			H.emit(H.Event.TOOL_USED, { tool: 'uvl' });
			H.emit(H.Event.HUNT_END_GRACEFUL, { success: true });
			return A.has('win.notools');
		});
		expect(has).toBe(false);
	});

	test('reading another tool (e.g. spiritbox/gwb) does NOT block Bare Hands', async () => {
		const has = await page.evaluate(() => {
			const A = SugarCube.setup.Achievements;
			const H = SugarCube.setup.Hunt;
			H.emit(H.Event.START, {});
			H.emit(H.Event.TOOL_USED, { tool: 'gwb' });
			H.emit(H.Event.TOOL_USED, { tool: 'plasm' });
			H.emit(H.Event.HUNT_END_GRACEFUL, { success: true });
			return A.has('win.notools');
		});
		expect(has).toBe(true);
	});

	test('renderEmf / renderUvl emit Event.TOOL_USED so a real tool press blocks the award', async () => {
		const tools = await page.evaluate(() => {
			const H = SugarCube.setup.Hunt;
			const seen = [];
			const off = H.on(H.Event.TOOL_USED, (ctx) => seen.push(ctx && ctx.tool));
			window.__achSubs.push(off);
			SugarCube.setup.ToolController.render('emf');
			SugarCube.setup.ToolController.render('uvl');
			return seen;
		});
		expect(tools).toContain('emf');
		expect(tools).toContain('uvl');
	});

	test('win.pacifist unlocks on a successful hunt with no spiritbox press', async () => {
		const has = await page.evaluate(() => {
			const A = SugarCube.setup.Achievements;
			const H = SugarCube.setup.Hunt;
			H.emit(H.Event.START, {});
			H.emit(H.Event.HUNT_END_GRACEFUL, { success: true });
			return A.has('win.pacifist');
		});
		expect(has).toBe(true);
	});

	test('win.pacifist does NOT unlock when the spiritbox was pressed mid-hunt', async () => {
		const has = await page.evaluate(() => {
			const A = SugarCube.setup.Achievements;
			const H = SugarCube.setup.Hunt;
			H.emit(H.Event.START, {});
			H.emit(H.Event.SPIRITBOX_USED, {});
			H.emit(H.Event.HUNT_END_GRACEFUL, { success: true });
			return A.has('win.pacifist');
		});
		expect(has).toBe(false);
	});

	test('win.empty_bag unlocks on a successful hunt rolled with locked_tools', async () => {
		const has = await page.evaluate(() => {
			const A = SugarCube.setup.Achievements;
			const H = SugarCube.setup.Hunt;
			H.emit(H.Event.START, {});
			SugarCube.State.variables.run = SugarCube.State.variables.run || {};
			SugarCube.State.variables.run.modifiers = ['locked_tools'];
			H.emit(H.Event.HUNT_END_GRACEFUL, { success: true, modifiers: ['locked_tools'] });
			return A.has('win.empty_bag');
		});
		expect(has).toBe(true);
	});

	test('win.empty_bag does NOT unlock without the locked_tools modifier', async () => {
		const has = await page.evaluate(() => {
			const A = SugarCube.setup.Achievements;
			const H = SugarCube.setup.Hunt;
			H.emit(H.Event.START, {});
			SugarCube.State.variables.run = SugarCube.State.variables.run || {};
			SugarCube.State.variables.run.modifiers = ['pheromones'];
			H.emit(H.Event.HUNT_END_GRACEFUL, { success: true, modifiers: ['pheromones'] });
			return A.has('win.empty_bag');
		});
		expect(has).toBe(false);
	});

	test('win.speed_banish unlocks when the hunt ends < 60 minutes after HOUSE_ENTER', async () => {
		const has = await page.evaluate(() => {
			const A = SugarCube.setup.Achievements;
			const H = SugarCube.setup.Hunt;
			SugarCube.State.variables.hours = 0;
			SugarCube.State.variables.minutes = 0;
			H.emit(H.Event.START, {});
			H.emit(H.Event.HOUSE_ENTER, {});
			SugarCube.State.variables.hours = 0;
			SugarCube.State.variables.minutes = 45;
			H.emit(H.Event.HUNT_END_GRACEFUL, { success: true });
			return A.has('win.speed_banish');
		});
		expect(has).toBe(true);
	});

	test('win.speed_banish does NOT unlock when the hunt drags past an in-house hour', async () => {
		const has = await page.evaluate(() => {
			const A = SugarCube.setup.Achievements;
			const H = SugarCube.setup.Hunt;
			SugarCube.State.variables.hours = 0;
			SugarCube.State.variables.minutes = 0;
			H.emit(H.Event.START, {});
			H.emit(H.Event.HOUSE_ENTER, {});
			SugarCube.State.variables.hours = 1;
			SugarCube.State.variables.minutes = 5;
			H.emit(H.Event.HUNT_END_GRACEFUL, { success: true });
			return A.has('win.speed_banish');
		});
		expect(has).toBe(false);
	});

	test('win.faceoff unlocks on a Mimic win when the disguise rotates at most once', async () => {
		const has = await page.evaluate(() => {
			const A = SugarCube.setup.Achievements;
			const H = SugarCube.setup.Hunt;
			H.emit(H.Event.START, {});
			SugarCube.State.variables.run = { ghostName: 'Mimic', disguiseName: 'Mimic', evidence: [] };
			/* One MIMIC_ROTATE is the initial seeding from the Mimic
			   huntHook + the first PassageDone roll; that's the floor,
			   not "the face changed." */
			H.emit(H.Event.MIMIC_ROTATE, { disguiseName: 'Spirit' });
			H.emit(H.Event.HUNT_END_GRACEFUL, { success: true, ghostName: 'Mimic' });
			return A.has('win.faceoff');
		});
		expect(has).toBe(true);
	});

	test('win.faceoff does NOT unlock when the Mimic rotates a second time', async () => {
		const has = await page.evaluate(() => {
			const A = SugarCube.setup.Achievements;
			const H = SugarCube.setup.Hunt;
			H.emit(H.Event.START, {});
			SugarCube.State.variables.run = { ghostName: 'Mimic', disguiseName: 'Mimic', evidence: [] };
			H.emit(H.Event.MIMIC_ROTATE, { disguiseName: 'Spirit' });
			H.emit(H.Event.MIMIC_ROTATE, { disguiseName: 'Shade' });
			H.emit(H.Event.HUNT_END_GRACEFUL, { success: true, ghostName: 'Mimic' });
			return A.has('win.faceoff');
		});
		expect(has).toBe(false);
	});

	test('win.knocks unlocks on a Mare banish', async () => {
		const has = await page.evaluate(() => {
			const A = SugarCube.setup.Achievements;
			const H = SugarCube.setup.Hunt;
			H.emit(H.Event.START, {});
			SugarCube.State.variables.run = { ghostName: 'Mare', disguiseName: 'Mare', evidence: [] };
			H.emit(H.Event.HUNT_END_GRACEFUL, { success: true, ghostName: 'Mare' });
			return A.has('win.knocks');
		});
		expect(has).toBe(true);
	});

	test('win.knocks does NOT unlock on a non-Mare banish', async () => {
		const has = await page.evaluate(() => {
			const A = SugarCube.setup.Achievements;
			const H = SugarCube.setup.Hunt;
			H.emit(H.Event.START, {});
			SugarCube.State.variables.run = { ghostName: 'Phantom', disguiseName: 'Phantom', evidence: [] };
			H.emit(H.Event.HUNT_END_GRACEFUL, { success: true, ghostName: 'Phantom' });
			return A.has('win.knocks');
		});
		expect(has).toBe(false);
	});

	test('win.no_wishes unlocks when the paw is carried through a win without spending', async () => {
		const has = await page.evaluate(() => {
			const A = SugarCube.setup.Achievements;
			const H = SugarCube.setup.Hunt;
			SugarCube.setup.MonkeyPaw.resetHunt();
			SugarCube.setup.MonkeyPaw.markFound();
			H.emit(H.Event.START, {});
			H.emit(H.Event.HUNT_END_GRACEFUL, { success: true, monkeyPawCarried: true, monkeyPawWishesLeft: 3 });
			return A.has('win.no_wishes');
		});
		expect(has).toBe(true);
	});

	test('win.no_wishes does NOT unlock when a wish was burned mid-hunt', async () => {
		const has = await page.evaluate(() => {
			const A = SugarCube.setup.Achievements;
			const H = SugarCube.setup.Hunt;
			SugarCube.setup.MonkeyPaw.resetHunt();
			SugarCube.setup.MonkeyPaw.markFound();
			H.emit(H.Event.START, {});
			SugarCube.State.variables.wishesCount = 2;
			H.emit(H.Event.HUNT_END_GRACEFUL, { success: true, monkeyPawCarried: true, monkeyPawWishesLeft: 2 });
			return A.has('win.no_wishes');
		});
		expect(has).toBe(false);
	});

	test('win.no_wishes does NOT unlock when the paw was never carried', async () => {
		const has = await page.evaluate(() => {
			const A = SugarCube.setup.Achievements;
			const H = SugarCube.setup.Hunt;
			SugarCube.setup.MonkeyPaw.resetHunt();
			H.emit(H.Event.START, {});
			H.emit(H.Event.HUNT_END_GRACEFUL, { success: true, monkeyPawCarried: false, monkeyPawWishesLeft: 3 });
			return A.has('win.no_wishes');
		});
		expect(has).toBe(false);
	});

	test('disc.three_am unlocks on TICK when the clock reads hour 3', async () => {
		const has = await page.evaluate(() => {
			const A = SugarCube.setup.Achievements;
			const H = SugarCube.setup.Hunt;
			H.emit(H.Event.START, {});
			SugarCube.State.variables.hours = 3;
			SugarCube.State.variables.minutes = 15;
			H.emit(H.Event.TICK, { roomId: 'room_1', minutes: 15 });
			return A.has('disc.three_am');
		});
		expect(has).toBe(true);
	});

	test('disc.three_am does NOT unlock on TICKs outside the witching hour', async () => {
		const has = await page.evaluate(() => {
			const A = SugarCube.setup.Achievements;
			const H = SugarCube.setup.Hunt;
			H.emit(H.Event.START, {});
			SugarCube.State.variables.hours = 2;
			SugarCube.State.variables.minutes = 59;
			H.emit(H.Event.TICK, { roomId: 'room_1', minutes: 59 });
			SugarCube.State.variables.hours = 4;
			SugarCube.State.variables.minutes = 0;
			H.emit(H.Event.TICK, { roomId: 'room_1', minutes: 0 });
			return A.has('disc.three_am');
		});
		expect(has).toBe(false);
	});

	test('disc.trap_twice unlocks on the second TRAP in one hunt (first TRAP fires only disc.trap)', async () => {
		const result = await page.evaluate(() => {
			const A = SugarCube.setup.Achievements;
			const H = SugarCube.setup.Hunt;
			H.emit(H.Event.START, {});
			H.emit(H.Event.TRAP, {});
			const afterFirst = A.has('disc.trap_twice');
			H.emit(H.Event.TRAP, {});
			const afterSecond = A.has('disc.trap_twice');
			return { afterFirst, afterSecond, trap: A.has('disc.trap') };
		});
		expect(result.afterFirst).toBe(false);
		expect(result.afterSecond).toBe(true);
		expect(result.trap).toBe(true);
	});

	test('disc.drift_twice unlocks on the second DRIFT in one hunt', async () => {
		const result = await page.evaluate(() => {
			const A = SugarCube.setup.Achievements;
			const H = SugarCube.setup.Hunt;
			H.emit(H.Event.START, {});
			H.emit(H.Event.DRIFT, {});
			const afterFirst = A.has('disc.drift_twice');
			H.emit(H.Event.DRIFT, {});
			return { afterFirst, afterSecond: A.has('disc.drift_twice') };
		});
		expect(result.afterFirst).toBe(false);
		expect(result.afterSecond).toBe(true);
	});

	test('disc.trap_twice / disc.drift_twice reset across hunts (counts do not carry over)', async () => {
		const has = await page.evaluate(() => {
			const A = SugarCube.setup.Achievements;
			const H = SugarCube.setup.Hunt;
			H.emit(H.Event.START, {});
			H.emit(H.Event.TRAP, {});
			H.emit(H.Event.HUNT_END_GRACEFUL, { success: false, failureReason: 'time' });
			/* Fresh hunt: a single TRAP must not push it over the line. */
			H.emit(H.Event.START, {});
			H.emit(H.Event.TRAP, {});
			return A.has('disc.trap_twice');
		});
		expect(has).toBe(false);
	});

	test('disc.cold_feet unlocks when a contracted hunt ends with FLED', async () => {
		const has = await page.evaluate(() => {
			const A = SugarCube.setup.Achievements;
			const H = SugarCube.setup.Hunt;
			SugarCube.setup.Mc.setMoney(10000);
			SugarCube.setup.WitchContract.refresh();
			const houseId = SugarCube.setup.WitchContract.offered()[0].houseId;
			SugarCube.setup.WitchContract.buyContract(houseId);
			H.emit(H.Event.START, {});
			const FR = SugarCube.setup.HuntController.FailureReason;
			H.emit(H.Event.HUNT_END_GRACEFUL, { success: false, failureReason: FR.FLED });
			return A.has('disc.cold_feet');
		});
		expect(has).toBe(true);
	});

	test('disc.cold_feet does NOT unlock when no contract was held (rogue-hunt flee)', async () => {
		const has = await page.evaluate(() => {
			const A = SugarCube.setup.Achievements;
			const H = SugarCube.setup.Hunt;
			SugarCube.setup.WitchContract.clearHeld();
			H.emit(H.Event.START, {});
			const FR = SugarCube.setup.HuntController.FailureReason;
			H.emit(H.Event.HUNT_END_GRACEFUL, { success: false, failureReason: FR.FLED });
			return A.has('disc.cold_feet');
		});
		expect(has).toBe(false);
	});

	/* --- Hunt-end achievements survive the REAL teardown-then-emit ----
	   Regression for the bestiary never populating. The direct-.emit()
	   specs above keep $run live across the emit, which the real game
	   never does: HuntController.endHunt() runs cleanupRunState() + end()
	   (clearing $run, resetting the monkey-paw) BEFORE emitting the
	   settle event. Any onHuntEnd check that read live hunt state instead
	   of the ctx side-channel silently no-opped in play. These drive the
	   real lifecycle via cheatStartHunt + endHunt(true) so a regression
	   reading stale state fails here even though the isolated specs pass. */

	test('bestiary entry unlocks on a real successful hunt (endHunt clears $run before the emit)', async () => {
		const has = await page.evaluate(() => {
			const A = SugarCube.setup.Achievements;
			SugarCube.State.variables.achievements = {};
			SugarCube.setup.Ghosts.cheatStartHunt('Banshee');
			SugarCube.setup.HuntController.markSuccess();
			SugarCube.setup.HuntController.endHunt(true);
			return A.has('bestiary.banshee');
		});
		expect(has).toBe(true);
	});

	test('win.mimic / win.knocks key off ctx.ghostName, not the cleared $run', async () => {
		const result = await page.evaluate(() => {
			const A = SugarCube.setup.Achievements;
			SugarCube.State.variables.achievements = {};
			SugarCube.setup.Ghosts.cheatStartHunt('Mare');
			SugarCube.setup.HuntController.markSuccess();
			SugarCube.setup.HuntController.endHunt(true);
			return { knocks: A.has('win.knocks'), bestiary: A.has('bestiary.mare') };
		});
		expect(result.knocks).toBe(true);
		expect(result.bestiary).toBe(true);
	});

	test('win.empty_bag unlocks via the real lifecycle (modifiers from ctx, not the cleared $run)', async () => {
		const has = await page.evaluate(() => {
			const A = SugarCube.setup.Achievements;
			SugarCube.State.variables.achievements = {};
			SugarCube.setup.Ghosts.cheatStartHunt('Banshee');
			SugarCube.State.variables.run.modifiers = ['locked_tools'];
			SugarCube.setup.HuntController.markSuccess();
			SugarCube.setup.HuntController.endHunt(true);
			return A.has('win.empty_bag');
		});
		expect(has).toBe(true);
	});

	test('win.no_wishes unlocks via the real lifecycle (paw snapshotted before cleanup resets it)', async () => {
		const has = await page.evaluate(() => {
			const A = SugarCube.setup.Achievements;
			SugarCube.State.variables.achievements = {};
			SugarCube.setup.Ghosts.cheatStartHunt('Banshee');
			SugarCube.setup.MonkeyPaw.resetHunt();
			SugarCube.setup.MonkeyPaw.markFound();
			SugarCube.setup.HuntController.markSuccess();
			SugarCube.setup.HuntController.endHunt(true);
			return A.has('win.no_wishes');
		});
		expect(has).toBe(true);
	});

	test('win.no_wishes does NOT unlock via the real lifecycle when a wish was spent', async () => {
		const has = await page.evaluate(() => {
			const A = SugarCube.setup.Achievements;
			SugarCube.State.variables.achievements = {};
			SugarCube.setup.Ghosts.cheatStartHunt('Banshee');
			SugarCube.setup.MonkeyPaw.resetHunt();
			SugarCube.setup.MonkeyPaw.markFound();
			SugarCube.State.variables.wishesCount = 2;
			SugarCube.setup.HuntController.markSuccess();
			SugarCube.setup.HuntController.endHunt(true);
			return A.has('win.no_wishes');
		});
		expect(has).toBe(false);
	});

	/* --- StoryEvents-bus wiring -------------------------------------- */

	test('StoryEvents.MODIFIER_BANNED unlocks disc.naughty_list', async () => {
		const has = await page.evaluate(() => {
			const A = SugarCube.setup.Achievements;
			const SE = SugarCube.setup.StoryEvents;
			SE.emit(SE.Event.MODIFIER_BANNED, { id: 'pheromones' });
			return A.has('disc.naughty_list');
		});
		expect(has).toBe(true);
	});

	test('StoryEvents.REROLL_USED unlocks disc.tempting_fate', async () => {
		const has = await page.evaluate(() => {
			const A = SugarCube.setup.Achievements;
			const SE = SugarCube.setup.StoryEvents;
			SE.emit(SE.Event.REROLL_USED, {});
			return A.has('disc.tempting_fate');
		});
		expect(has).toBe(true);
	});

	test('disc.take_two unlocks when a sanity pill is gained and used on the same day', async () => {
		const has = await page.evaluate(() => {
			const A = SugarCube.setup.Achievements;
			const SE = SugarCube.setup.StoryEvents;
			SE.emit(SE.Event.SANITY_PILL_GAINED, { day: 4242 });
			SE.emit(SE.Event.SANITY_PILL_USED,   { day: 4242 });
			return A.has('disc.take_two');
		});
		expect(has).toBe(true);
	});

	test('disc.take_two does NOT unlock when the pill is swallowed on a later day', async () => {
		const has = await page.evaluate(() => {
			const A = SugarCube.setup.Achievements;
			const SE = SugarCube.setup.StoryEvents;
			SE.emit(SE.Event.SANITY_PILL_GAINED, { day: 4242 });
			SE.emit(SE.Event.SANITY_PILL_USED,   { day: 9999 });
			return A.has('disc.take_two');
		});
		expect(has).toBe(false);
	});

	test('disc.take_two does NOT unlock when SANITY_PILL_USED fires with no prior gain', async () => {
		const has = await page.evaluate(() => {
			const A = SugarCube.setup.Achievements;
			const SE = SugarCube.setup.StoryEvents;
			SE.emit(SE.Event.SANITY_PILL_USED, { day: 4242 });
			return A.has('disc.take_two');
		});
		expect(has).toBe(false);
	});

	/* --- Library wiring ---------------------------------------------- */

	test('disc.library_card unlocks on markTipsBookFound', async () => {
		const has = await page.evaluate(() => {
			SugarCube.setup.Library.markTipsBookFound();
			return SugarCube.setup.Achievements.has('disc.library_card');
		});
		expect(has).toBe(true);
	});

	test('disc.library_card unlocks on markDesecratedBookFound', async () => {
		const has = await page.evaluate(() => {
			SugarCube.setup.Library.markDesecratedBookFound();
			return SugarCube.setup.Achievements.has('disc.library_card');
		});
		expect(has).toBe(true);
	});
});
