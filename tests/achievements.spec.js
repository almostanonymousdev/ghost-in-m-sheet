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
});
