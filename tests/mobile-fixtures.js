const base = require('./fixtures');

/*
 * Mobile viewport wrapper around the standard `game` fixture.
 *
 * Re-uses the worker-shared SugarCube page from tests/fixtures.js and pins
 * the viewport to a typical mid-range phone (iPhone-13-ish 390×844) before
 * each test runs. setViewportSize on the live page is enough for layout +
 * tap-target measurement; full touch emulation (hasTouch, tap events) is
 * not needed by these specs and is intentionally skipped so we stay on
 * the standard worker page.
 *
 * Usage:
 *   const { test, expect, MOBILE_VIEWPORT } = require('./mobile-fixtures');
 *
 *   test('renders at mobile width', async ({ game: page }) => {
 *     // page is already sized to MOBILE_VIEWPORT
 *   });
 */
const MOBILE_VIEWPORT = { width: 390, height: 844 };

const test = base.test.extend({
  game: async ({ game }, use) => {
    await game.setViewportSize(MOBILE_VIEWPORT);
    await use(game);
  },
});

module.exports = { test, expect: base.expect, MOBILE_VIEWPORT };
