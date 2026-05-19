/**
 * Boot-error regression: opening the game and reaching the title screen
 * must produce zero pageerrors and zero console.errors. Catches the
 * class of bug where a controller script references another controller
 * (setup.Hunt, setup.Mc, ...) at module-eval time, but Tweego's
 * filesystem-order concatenation puts the referenced controller after
 * the referencing one in the bundled output. The original symptom is a
 * fatal "tw-user-script" alert at first paint -- which surfaces as a
 * pageerror here.
 *
 * Cross-controller wiring at script-load time must defer to :storyready
 * (the established pattern in GuiController, KeyboardNav,
 * StyleController, AchievementsController). This test pins that.
 */
const { test, expect } = require('@playwright/test');
const path = require('path');

const GAME_URL = `file://${path.resolve(__dirname, '..', 'ghost-in-msheet.html')}`;

test('opening the game produces no pageerrors or console.errors', async ({ browser }) => {
	const page = await browser.newPage();
	const errors = [];
	page.on('pageerror', (err) => {
		errors.push('pageerror: ' + err.message);
	});
	page.on('console', (msg) => {
		if (msg.type() !== 'error') return;
		const text = msg.text();
		/* "Failed to load resource: ..." is the browser's own log for
		   blocked image/media/font fetches (we abort those routes below
		   to keep the test fast). It is not a script error and isn't
		   what this regression is policing -- the original tw-user-script
		   bug produces a JS-level error, which surfaces as a pageerror
		   *and* a console.error whose text starts with "Error". */
		if (text.startsWith('Failed to load resource')) return;
		errors.push('console.error: ' + text);
	});

	/* Skip media -- like openGame() does in helpers.js. The point of
	   this test is the JS load path, not asset 404s, which on a local
	   file:// URL are noisy but harmless. */
	await page.route('**/*', (route) => {
		const type = route.request().resourceType();
		if (type === 'image' || type === 'media' || type === 'font') {
			return route.abort();
		}
		return route.continue();
	});

	await page.goto(GAME_URL, { waitUntil: 'load' });
	/* Engine + State + a non-empty start passage means script passages
	   have eval'd, :storyready has fired, and StoryInit has run. Any
	   load-time `tw-user-script` error would have surfaced by now. */
	await page.waitForFunction(() =>
		typeof SugarCube !== 'undefined' &&
		SugarCube.Engine &&
		SugarCube.State &&
		SugarCube.State.passage &&
		document.querySelector('#passages .passage') !== null
	, { timeout: 10000 });

	await page.close();

	expect(
		errors,
		'Boot must be silent. Encountered:\n  ' + errors.join('\n  ')
	).toEqual([]);
});
