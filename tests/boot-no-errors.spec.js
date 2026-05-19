/**
 * Boot-time error guardrail.
 *
 * Loads the built game in a fresh page and asserts that nothing
 * console.error's or throws during boot. This catches the whole class
 * of "load order broke, setup.X is undefined" bugs that surface as
 * cross-controller module-load failures.
 *
 * History:
 *   - When a new event bus was added at the root of passages/, the
 *     Tweego concatenation order shifted and pre-existing controllers
 *     that called setup.Cooldowns / setup.defineAccessors at module
 *     load broke. Symptom was "tw-user-script-0: setup.Cooldowns is
 *     undefined". This test would have flagged it immediately.
 *
 * If this test fires:
 *   - First failure is almost always a setup.X module-load reference
 *     that landed before X was concatenated. Either reshape the
 *     consumer to defer to :storyready, or move the producer's source
 *     file so it loads first (e.g. back to passages/ root).
 */
const { test, expect } = require('@playwright/test');
const { openGame } = require('./helpers');

test.describe('boot integrity', () => {
	test('loading the built HTML produces no console errors or thrown exceptions', async ({ browser }) => {
		const consoleErrors = [];
		const pageErrors = [];

		/* Capture before openGame's goto so we don't miss anything that
		   fires during the initial script eval / StoryInit run. */
		const page = await browser.newPage();
		/* Filter out the "Failed to load resource" noise that our own
		   route.abort() below produces for images/media/fonts -- those
		   are intentional and not the class of bug we're guarding. */
		const isAbortedResource = (text) =>
			/Failed to load resource/.test(text) && /ERR_FAILED|ERR_ABORTED/.test(text);
		page.on('console', (msg) => {
			if (msg.type() !== 'error') return;
			const text = msg.text();
			if (isAbortedResource(text)) return;
			consoleErrors.push(text);
		});
		page.on('pageerror', (err) => pageErrors.push(err.message));

		await page.route('**/*', (route) => {
			const type = route.request().resourceType();
			if (type === 'image' || type === 'media' || type === 'font') {
				return route.abort();
			}
			return route.continue();
		});

		const path = require('path');
		const GAME_URL = `file://${path.resolve(__dirname, '..', 'ghost-in-msheet.html')}`;
		await page.goto(GAME_URL, { waitUntil: 'load' });
		await page.waitForFunction(() =>
			typeof SugarCube !== 'undefined' &&
			SugarCube.State && SugarCube.State.variables &&
			SugarCube.State.passage !== ''
		);
		/* Give late :storyready subscribers a moment to fire (the boot
		   path defers cross-controller registrations to :storyready). */
		await page.waitForTimeout(500);

		await page.close();

		/* Pretty-print all errors at once so the first failure shows the
		   whole picture instead of just one message at a time. */
		const all = [
			...consoleErrors.map((e) => `console.error: ${e}`),
			...pageErrors.map((e) => `pageerror: ${e}`)
		];
		expect(all, all.join('\n  - ')).toEqual([]);
	});

	test('every cross-controller bus + helper is defined after boot', async ({ browser }) => {
		/* Boot-order canaries -- if a producer ever loads after a
		   consumer's IIFE again, its setup.X facade will be undefined
		   at the first call site and the page will error out. The
		   no-errors test above already catches the symptom; this test
		   pins the explicit shape so the diagnosis is one assertion
		   away from the failure. */
		const page = await openGame(browser);
		const shape = await page.evaluate(() => {
			const setup = SugarCube.setup;
			return {
				Meter:            typeof setup.Meter,
				defineAccessors:  typeof setup.defineAccessors,
				defineStageAccessors: typeof setup.defineStageAccessors,
				Cooldowns:        typeof setup.Cooldowns,
				CooldownsDaily:   setup.Cooldowns ? setup.Cooldowns.listDaily().length : 0,
				Hunt:             typeof setup.Hunt,
				HuntEvent:        setup.Hunt && typeof setup.Hunt.Event,
				HuntController:   typeof setup.HuntController,
				Achievements:     typeof setup.Achievements,
				AchievementsEvent: setup.Achievements && typeof setup.Achievements.Event,
				StoryEvents:      typeof setup.StoryEvents,
				StoryEventsEvent: setup.StoryEvents && typeof setup.StoryEvents.Event,
				Tick:             typeof setup.Tick,
				Styles:           typeof setup.Styles,
				Game:             typeof setup.Game,
				Mc:               typeof setup.Mc,
				Companion:        typeof setup.Companion,
				Ghosts:           typeof setup.Ghosts,
				Time:             typeof setup.Time
			};
		});
		await page.close();

		for (const [key, value] of Object.entries(shape)) {
			if (key === 'CooldownsDaily') continue;
			expect(value, `setup.${key}`).not.toBe('undefined');
		}
		/* Daily cooldowns are registered at :storyready by 8 different
		   controllers; if the registration broke (Cooldowns went
		   undefined when consumers ran), the list would be empty. */
		expect(shape.CooldownsDaily).toBeGreaterThan(0);
	});
});
