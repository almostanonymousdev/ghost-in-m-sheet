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
 * RNG: the fixture-provided page boots with a fixed Mulberry32 seed
 * (DEFAULT_FIXTURE_SEED below). Without this, every random()/either() call
 * in the game runs against the browser's real Math.random, so any test that
 * doesn't explicitly stamp its own RNG state can flake under "unlucky" rolls.
 * Tests that need their own seed continue to call seedRandom() / openGame({
 * seed }); those calls override the fixture seed for the remainder of that
 * test, and resetGame restores the snapshot before the next.
 *
 * Specs that need custom boot options (e.g. multiple pages per test, or a
 * seed-from-the-start-of-StoryInit guarantee) should keep calling openGame()
 * directly — the fixture is only for the standard one-page-per-worker pattern.
 */
const DEFAULT_FIXTURE_SEED = 1;

const test = base.test.extend({
  // Worker-scoped page holder: opened once when the worker starts. Wrapped
  // in a holder so the per-test fixture can reopen the page mid-worker if a
  // prior test crashed it (under heavy parallel load, a runaway passage can
  // OOM-kill the renderer; without recovery, every subsequent test in that
  // worker fails with "Target page, context or browser has been closed").
  gameWorkerPage: [async ({ browser }, use) => {
    const holder = { browser, page: await openGame(browser, { seed: DEFAULT_FIXTURE_SEED }) };
    await use(holder);
    if (!holder.page.isClosed()) await holder.page.close();
  }, { scope: 'worker' }],

  // Test-scoped handoff: resets SugarCube state before each test runs. If
  // the worker page was closed (or its context was destroyed) since the last
  // test, transparently reopen so this test still gets a clean game.
  game: async ({ gameWorkerPage }, use) => {
    if (gameWorkerPage.page.isClosed()) {
      gameWorkerPage.page = await openGame(gameWorkerPage.browser, { seed: DEFAULT_FIXTURE_SEED });
    }
    try {
      await resetGame(gameWorkerPage.page);
    } catch (err) {
      gameWorkerPage.page = await openGame(gameWorkerPage.browser, { seed: DEFAULT_FIXTURE_SEED });
    }
    await use(gameWorkerPage.page);
  },
});

module.exports = { test, expect: base.expect };
