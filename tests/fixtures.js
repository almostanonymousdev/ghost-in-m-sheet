const base = require('@playwright/test');
const { openGame, resetGame } = require('./helpers');

/**
 * Playwright fixtures for the SugarCube game.
 *
 * The vast majority of specs share the same boilerplate: open the game once
 * per worker, reset SugarCube state before each test, close the page after.
 * This module collapses that pattern into a single `game` fixture.
 *
 * Usage:
 *   const { test, expect } = require('./fixtures');   // tests/foo.spec.js
 *   const { test, expect } = require('../fixtures');  // tests/e2e/foo.spec.js
 *
 *   test('does the thing', async ({ game }) => {
 *     await setVar(game, 'mc.money', 100);
 *     // ...
 *   });
 *
 * `game` is a Playwright Page that has been booted and reset; tests interact
 * with it via the helper functions in tests/helpers.js exactly as before.
 *
 * Specs that need custom boot options (e.g. a deterministic RNG seed,
 * multiple pages per test) should keep calling openGame() directly — the
 * fixture is only for the standard one-page-per-worker pattern.
 */
const test = base.test.extend({
  // Worker-scoped page: opened once when the worker starts, closed when it ends.
  gameWorkerPage: [async ({ browser }, use) => {
    const page = await openGame(browser);
    await use(page);
    await page.close();
  }, { scope: 'worker' }],

  // Test-scoped handoff: resets SugarCube state before each test runs.
  game: async ({ gameWorkerPage }, use) => {
    await resetGame(gameWorkerPage);
    await use(gameWorkerPage);
  },
});

module.exports = { test, expect: base.expect };
