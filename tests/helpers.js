const path = require('path');

const GAME_URL = `file://${path.resolve(__dirname, '..', 'ghost-in-msheet.html')}`;

/**
 * Wait for SugarCube to finish initializing and rendering a passage.
 */
async function waitForSugarCube(page) {
  await page.waitForFunction(() =>
    typeof SugarCube !== 'undefined' &&
    SugarCube.State &&
    SugarCube.State.variables &&
    SugarCube.Engine
  );
}

/**
 * Navigate to a SugarCube passage by name and wait for it to render.
 *
 * Retries once if the engine fails to update `State.passage` within 3s —
 * occasionally under heavy parallel worker load the first play() call is
 * swallowed while the engine is still restarting. A single retry recovers
 * without the caller having to rely on the test-level retry mechanism.
 */
async function goToPassage(page, passageName) {
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.evaluate((p) => SugarCube.Engine.play(p), passageName);
    try {
      await page.waitForFunction(
        (p) => SugarCube.State.passage === p,
        passageName,
        { timeout: 3000 }
      );
      return;
    } catch (err) {
      if (attempt === 1) throw err;
    }
  }
}

/**
 * Read a SugarCube story variable (e.g. "mc.money" → $mc.money).
 */
function getVar(page, varName) {
  return page.evaluate((v) => {
    const parts = v.split('.');
    let value = SugarCube.State.variables;
    for (const p of parts) value = value[p];
    return value;
  }, varName);
}

/**
 * Set a SugarCube story variable.
 */
function setVar(page, varName, value) {
  return page.evaluate(({ v, val }) => {
    const parts = v.split('.');
    let target = SugarCube.State.variables;
    for (let i = 0; i < parts.length - 1; i++) target = target[parts[i]];
    target[parts[parts.length - 1]] = val;
  }, { v: varName, val: value });
}

/**
 * Set $hunt.mode (0 = none/null-hunt, 1 = contract, 2 = active, 3 = possessed).
 * Auto-creates a stub hunt for modes >= 1 so tests can exercise mode
 * transitions without calling setupHunt first.
 */
function setHuntMode(page, mode) {
  return page.evaluate((m) => {
    const V = SugarCube.State.variables;
    if (m === 0) {
      V.hunt = null;
      return;
    }
    if (!V.hunt) SugarCube.setup.Ghosts.startHunt('Shade');
    V.hunt.mode = m;
  }, mode);
}

/** Read $hunt.mode (0 when no hunt is active). */
function getHuntMode(page) {
  return page.evaluate(() => {
    const h = SugarCube.State.variables.hunt;
    return h ? h.mode : 0;
  });
}

/**
 * Call a setup.* controller method and return the result.
 */
function callSetup(page, expr) {
  return page.evaluate((e) => {
    return new Function('setup', 'return ' + e)(SugarCube.setup);
  }, expr);
}

/**
 * Open the game and wait for SugarCube. Returns the page.
 *
 * Blocks media (images/videos/audio) at the network layer. The test suite
 * never reads pixel data, but many passages embed autoplay <video> tags whose
 * decode/buffer pipeline saturates the browser under parallel worker load and
 * produces "Target page has been closed" flakes. Aborting these requests
 * keeps the DOM + SugarCube state intact while freeing those resources.
 */
async function openGame(browser) {
  const page = await browser.newPage();
  await page.route('**/*', (route) => {
    const type = route.request().resourceType();
    if (type === 'image' || type === 'media' || type === 'font') {
      return route.abort();
    }
    return route.continue();
  });
  await page.goto(GAME_URL, { waitUntil: 'load' });
  await waitForSugarCube(page);
  return page;
}

/**
 * Reset SugarCube state by restarting the engine (replays StoryInit).
 * Much faster than closing and reopening the page.
 */
async function resetGame(page) {
  await page.evaluate(() => SugarCube.Engine.restart());
  await waitForSugarCube(page);
  await page.waitForFunction(() => SugarCube.State.passage !== '');
}

module.exports = {
  GAME_URL,
  waitForSugarCube,
  goToPassage,
  getVar,
  setVar,
  setHuntMode,
  getHuntMode,
  callSetup,
  openGame,
  resetGame,
};
