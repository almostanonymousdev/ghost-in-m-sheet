/**
 * setup.StoryEvents bus + cheat → achievement wiring.
 *
 * Pins:
 *   - The bus exposes the same on/emit/filter/applyFilter shape as
 *     setup.Hunt and setup.Achievements.
 *   - CHEAT_USED unlocks the 'fun.cheat' achievement.
 *   - Subscriber tables live in module-local memory (drain them between
 *     tests so they don't leak across).
 */
const { test, expect } = require('@playwright/test');
const { openGame, resetGame } = require('./helpers');

test.describe('setup.StoryEvents', () => {
	let page;

	test.beforeAll(async ({ browser }) => {
		page = await openGame(browser);
	});

	test.afterAll(async () => {
		await page.close();
	});

	test.beforeEach(async () => {
		await resetGame(page);
		await page.waitForFunction(() => SugarCube.setup.StoryEvents && SugarCube.setup.StoryEvents.emit);
		await page.evaluate(() => {
			window.__seSubs = window.__seSubs || [];
			while (window.__seSubs.length) window.__seSubs.shift()();
			SugarCube.State.variables.achievements = {};
		});
	});

	test('bus is exposed with Event constants', async () => {
		const shape = await page.evaluate(() => {
			const SE = SugarCube.setup.StoryEvents;
			return {
				hasOn: typeof SE.on === 'function',
				hasEmit: typeof SE.emit === 'function',
				hasFilter: typeof SE.filter === 'function',
				hasApplyFilter: typeof SE.applyFilter === 'function',
				cheatUsed: SE.Event && SE.Event.CHEAT_USED,
				frozen: Object.isFrozen(SE.Event)
			};
		});
		expect(shape.hasOn).toBe(true);
		expect(shape.hasEmit).toBe(true);
		expect(shape.hasFilter).toBe(true);
		expect(shape.hasApplyFilter).toBe(true);
		expect(shape.cheatUsed).toBe('cheat-used');
		expect(shape.frozen).toBe(true);
	});

	test('on() subscriber receives ctx; unsubscribe removes it', async () => {
		const result = await page.evaluate(() => {
			const SE = SugarCube.setup.StoryEvents;
			const seen = [];
			const unsub = SE.on(SE.Event.CHEAT_USED, (ctx) => seen.push(ctx));
			window.__seSubs.push(unsub);
			SE.emit(SE.Event.CHEAT_USED, { source: 'a' });
			SE.emit(SE.Event.CHEAT_USED, { source: 'b' });
			unsub();
			SE.emit(SE.Event.CHEAT_USED, { source: 'c' });
			return seen;
		});
		expect(result).toEqual([{ source: 'a' }, { source: 'b' }]);
	});

	test('a throwing subscriber does not block subsequent subscribers', async () => {
		page.on('console', () => {});
		const result = await page.evaluate(() => {
			const SE = SugarCube.setup.StoryEvents;
			const log = [];
			window.__seSubs.push(SE.on(SE.Event.CHEAT_USED, () => log.push('first')));
			window.__seSubs.push(SE.on(SE.Event.CHEAT_USED, () => { throw new Error('boom'); }));
			window.__seSubs.push(SE.on(SE.Event.CHEAT_USED, () => log.push('third')));
			SE.emit(SE.Event.CHEAT_USED, { source: 'x' });
			return log;
		});
		expect(result).toEqual(['first', 'third']);
	});

	test('emit with no subscribers is a no-op', async () => {
		const threw = await page.evaluate(() => {
			const SE = SugarCube.setup.StoryEvents;
			try { SE.emit(SE.Event.CHEAT_USED, { source: 'x' }); return false; }
			catch (e) { return true; }
		});
		expect(threw).toBe(false);
	});

	test('filter mutates ctx in place; applyFilter returns same ref', async () => {
		const result = await page.evaluate(() => {
			const SE = SugarCube.setup.StoryEvents;
			window.__seSubs.push(SE.filter(SE.Event.CHEAT_USED, (ctx) => { ctx.tagged = true; }));
			const input = { source: 'x' };
			const output = SE.applyFilter(SE.Event.CHEAT_USED, input);
			return { sameRef: output === input, tagged: output.tagged };
		});
		expect(result).toEqual({ sameRef: true, tagged: true });
	});

	test('CHEAT_USED unlocks fun.cheat achievement', async () => {
		const result = await page.evaluate(() => {
			const SE = SugarCube.setup.StoryEvents;
			const A = SugarCube.setup.Achievements;
			const before = A.has('fun.cheat');
			SE.emit(SE.Event.CHEAT_USED, { source: 'test' });
			return { before: before, after: A.has('fun.cheat') };
		});
		expect(result.before).toBe(false);
		expect(result.after).toBe(true);
	});

	/* Regression: opening the Settings/Cheats dialog used to grant
	   fun.cheat all by itself. SugarCube renders each cheat control by
	   calling Setting.setValue(name, default) when the control has no
	   stored value, which fires onChange -- the cheat onChange handlers
	   have to ignore that default-write and only emit CHEAT_USED on a
	   real user move. */
	test('opening the Settings dialog with no cheat toggled does NOT unlock fun.cheat', async () => {
		const result = await page.evaluate(async () => {
			const A = SugarCube.setup.Achievements;
			const before = A.has('fun.cheat');
			SugarCube.UI.settings();
			await new Promise((r) => setTimeout(r, 50));
			SugarCube.Dialog.close();
			await new Promise((r) => setTimeout(r, 50));
			return { before: before, after: A.has('fun.cheat') };
		});
		expect(result.before).toBe(false);
		expect(result.after).toBe(false);
	});

	test('actually toggling a cheat after opening the dialog unlocks fun.cheat', async () => {
		const result = await page.evaluate(async () => {
			const A = SugarCube.setup.Achievements;
			SugarCube.UI.settings();
			await new Promise((r) => setTimeout(r, 50));
			const before = A.has('fun.cheat');
			SugarCube.Setting.setValue('highlightRescueHouse', true);
			await new Promise((r) => setTimeout(r, 50));
			const after = A.has('fun.cheat');
			SugarCube.Setting.setValue('highlightRescueHouse', false);
			SugarCube.Dialog.close();
			return { before: before, after: after };
		});
		expect(result.before).toBe(false);
		expect(result.after).toBe(true);
	});

	test('fun.cheat catalogue entry exists with the meta-joke name', async () => {
		const entry = await page.evaluate(() => {
			return SugarCube.setup.Achievements.byId('fun.cheat');
		});
		expect(entry).not.toBeNull();
		expect(entry.name).toBe('all achievements disabled.   ...wait');
		expect(entry.hidden).toBe(true);
		expect(entry.category).toBe('fun');
	});
});
