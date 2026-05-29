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
		page.on('console', () => { });
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

	/* Toggling a cheat OFF (back to its disabled/default value) must not
	   emit CHEAT_USED. A player who forgot a persistent cheat was on from
	   a previous session and is turning it back off would otherwise get
	   re-charged for the cheat just for cleaning up. */
	test('toggling a cheat OFF does NOT emit CHEAT_USED', async () => {
		const sources = await page.evaluate(async () => {
			const SE = SugarCube.setup.StoryEvents;
			const seen = [];
			window.__seSubs.push(SE.on(SE.Event.CHEAT_USED, (ctx) => seen.push(ctx && ctx.source)));
			SugarCube.UI.settings();
			await new Promise((r) => setTimeout(r, 50));
			SugarCube.Setting.setValue('highlightRescueHouse', true);
			await new Promise((r) => setTimeout(r, 30));
			const afterOn = seen.slice();
			SugarCube.Setting.setValue('highlightRescueHouse', false);
			await new Promise((r) => setTimeout(r, 30));
			const afterOff = seen.slice();
			SugarCube.Dialog.close();
			return { afterOn: afterOn, afterOff: afterOff };
		});
		expect(sources.afterOn).toEqual(['highlightRescueHouse']);
		expect(sources.afterOff).toEqual(['highlightRescueHouse']);
	});

	/* Same rule for the list pickers: changing back to "—" (the off
	   sentinel) is "turning the cheat off" and must not fire CHEAT_USED.
	   Switching between two non-off picks still fires. */
	test('setting a ghost-type picker back to "—" does NOT emit CHEAT_USED', async () => {
		const sources = await page.evaluate(async () => {
			const SE = SugarCube.setup.StoryEvents;
			const seen = [];
			window.__seSubs.push(SE.on(SE.Event.CHEAT_USED, (ctx) => seen.push(ctx && ctx.source)));
			SugarCube.UI.settings();
			await new Promise((r) => setTimeout(r, 50));
			SugarCube.Setting.setValue('cheatGhostType', 'Spirit');
			await new Promise((r) => setTimeout(r, 30));
			const afterOn = seen.slice();
			SugarCube.Setting.setValue('cheatGhostType', '—');
			await new Promise((r) => setTimeout(r, 30));
			const afterOff = seen.slice();
			SugarCube.Dialog.close();
			return { afterOn: afterOn, afterOff: afterOff };
		});
		expect(sources.afterOn).toEqual(['cheatGhostType']);
		expect(sources.afterOff).toEqual(['cheatGhostType']);
	});

	/* Persistent cheats (toggles + the list pickers) fire CHEAT_USED on
	   toggle, but a save loaded with the setting already on would
	   otherwise sidestep that emit. These cases pin that the cheats
	   ALSO fire CHEAT_USED whenever the cheat actually takes effect,
	   so consumption alone is enough to mark the save as cheated. */
	test('drawAndStampTarotCard with cheatTarotCard set emits CHEAT_USED', async () => {
		const result = await page.evaluate(() => {
			const SE = SugarCube.setup.StoryEvents;
			const sources = [];
			window.__seSubs.push(SE.on(SE.Event.CHEAT_USED, (ctx) => sources.push(ctx && ctx.source)));
			delete SugarCube.State.variables.chosenCard;
			SugarCube.settings.cheatTarotCard = 'death';
			try { SugarCube.setup.Tarot.drawAndStampTarotCard(); }
			finally { SugarCube.settings.cheatTarotCard = '—'; }
			return sources;
		});
		expect(result).toContain('cheatTarotCard');
	});

	test('drawAndStampTarotCard with no cheatTarotCard set does NOT emit CHEAT_USED', async () => {
		const result = await page.evaluate(() => {
			const SE = SugarCube.setup.StoryEvents;
			const sources = [];
			window.__seSubs.push(SE.on(SE.Event.CHEAT_USED, (ctx) => sources.push(ctx && ctx.source)));
			delete SugarCube.State.variables.chosenCard;
			SugarCube.settings.cheatTarotCard = '—';
			const orig = Math.random;
			Math.random = () => 0;
			try { SugarCube.setup.Tarot.drawAndStampTarotCard(); }
			finally { Math.random = orig; }
			return sources;
		});
		expect(result).not.toContain('cheatTarotCard');
	});

	test('refreshToolTimer with fastToolTimers on emits CHEAT_USED', async () => {
		const result = await page.evaluate(() => {
			const SE = SugarCube.setup.StoryEvents;
			const sources = [];
			window.__seSubs.push(SE.on(SE.Event.CHEAT_USED, (ctx) => sources.push(ctx && ctx.source)));
			SugarCube.settings.fastToolTimers = true;
			try { SugarCube.setup.Gui.refreshToolTimer(); }
			finally { SugarCube.settings.fastToolTimers = false; }
			return sources;
		});
		expect(result).toContain('fastToolTimers');
	});

	test('refreshToolTimer with fastToolTimers off does NOT emit CHEAT_USED', async () => {
		const result = await page.evaluate(() => {
			const SE = SugarCube.setup.StoryEvents;
			const sources = [];
			window.__seSubs.push(SE.on(SE.Event.CHEAT_USED, (ctx) => sources.push(ctx && ctx.source)));
			SugarCube.settings.fastToolTimers = false;
			SugarCube.setup.Gui.refreshToolTimer();
			return sources;
		});
		expect(result).not.toContain('fastToolTimers');
	});

	test('RescueMap render with highlightRescueHouse on emits CHEAT_USED', async () => {
		const result = await page.evaluate(async () => {
			const SE = SugarCube.setup.StoryEvents;
			const sources = [];
			window.__seSubs.push(SE.on(SE.Event.CHEAT_USED, (ctx) => sources.push(ctx && ctx.source)));
			SugarCube.settings.highlightRescueHouse = true;
			try { SugarCube.Engine.play('RescueMap'); await new Promise((r) => setTimeout(r, 30)); }
			finally { SugarCube.settings.highlightRescueHouse = false; }
			return sources;
		});
		expect(result).toContain('highlightRescueHouse');
	});

	test('RescueMap render with highlightRescueHouse off does NOT emit CHEAT_USED', async () => {
		const result = await page.evaluate(async () => {
			const SE = SugarCube.setup.StoryEvents;
			const sources = [];
			window.__seSubs.push(SE.on(SE.Event.CHEAT_USED, (ctx) => sources.push(ctx && ctx.source)));
			SugarCube.settings.highlightRescueHouse = false;
			SugarCube.Engine.play('RescueMap');
			await new Promise((r) => setTimeout(r, 30));
			return sources;
		});
		expect(result).not.toContain('highlightRescueHouse');
	});

	/* The back/forward arrows let players rewind one-shot mutations
	   (e.g. spent cooldowns, granted money), so any click on the
	   history navigation has to mark the save as cheated -- AND the
	   mark has to land on the rewound moment, not the moment being
	   discarded, so a save taken right after pressing back still
	   carries the cheated flag. */
	test('clicking #history-backward emits CHEAT_USED on the rewound moment', async () => {
		const result = await page.evaluate(async () => {
			const SE = SugarCube.setup.StoryEvents;
			const A = SugarCube.setup.Achievements;
			const sources = [];
			window.__seSubs.push(SE.on(SE.Event.CHEAT_USED, (ctx) => sources.push(ctx && ctx.source)));
			SugarCube.Engine.play('CityMap');
			await new Promise((r) => setTimeout(r, 30));
			SugarCube.Engine.play('RescueMap');
			await new Promise((r) => setTimeout(r, 30));
			document.getElementById('history-backward').click();
			await new Promise((r) => setTimeout(r, 30));
			return {
				sources: sources,
				passage: SugarCube.State.passage,
				cheatedSaveFlag: SugarCube.State.variables.achievements && SugarCube.State.variables.achievements.cheatedSave,
				funCheat: A.has('fun.cheat')
			};
		});
		expect(result.sources).toContain('historyBackward');
		expect(result.passage).toBe('CityMap'); // confirms the click actually rewound
		expect(result.cheatedSaveFlag).toBe(true);
		expect(result.funCheat).toBe(true);
	});

	test('clicking #history-forward emits CHEAT_USED', async () => {
		const result = await page.evaluate(async () => {
			const SE = SugarCube.setup.StoryEvents;
			const sources = [];
			window.__seSubs.push(SE.on(SE.Event.CHEAT_USED, (ctx) => sources.push(ctx && ctx.source)));
			/* Force-enable the button: jQuery (and the browser) skip
			   click events on disabled form controls, and the freshly-
			   reset save has no forward history to enable it organically.
			   We're pinning the click→emit wiring, not the engine's
			   navigation gating. */
			const fwd = document.getElementById('history-forward');
			fwd.disabled = false;
			fwd.removeAttribute('aria-disabled');
			fwd.click();
			return sources;
		});
		expect(result).toContain('historyForward');
	});
});
