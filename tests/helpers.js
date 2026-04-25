const path = require('path');

const GAME_URL = `file://${path.resolve(__dirname, '..', 'dist', 'ghost-in-msheet.html')}`;

/**
 * Install a seeded PRNG in place of Math.random for the lifetime of the page.
 *
 * Runs as an addInitScript so it takes effect before SugarCube loads and
 * before any passage script runs. The game never calls State.prng.init(),
 * so SugarCube's random() / either() / randomFloat() all delegate to
 * Math.random — patching one function covers every RNG site in the game.
 *
 * The PRNG is Mulberry32: 32-bit state, fast, good-enough distribution for
 * gameplay tests (not cryptographic). State is exposed at window.__rng__ so
 * tests can re-seed mid-run (e.g. before Engine.restart) without a page
 * reload by calling reseedRng(page, seed).
 */
async function installSeededRng(page, seed) {
  await page.addInitScript((s) => {
    const rng = {
      state: s >>> 0,
      seed: s >>> 0,
      next() {
        this.state = (this.state + 0x6D2B79F5) >>> 0;
        let t = this.state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      },
      reseed(newSeed) {
        this.seed = newSeed >>> 0;
        this.state = newSeed >>> 0;
      },
    };
    window.__rng__ = rng;
    Math.random = () => rng.next();
  }, seed);
}

/**
 * Re-seed the PRNG on an already-open page. Useful before Engine.restart()
 * so the restarted game sees the same random sequence as the initial run.
 */
async function reseedRng(page, seed) {
  await page.evaluate((s) => {
    if (!window.__rng__) {
      throw new Error('reseedRng called but no seeded RNG is installed (open the page with openGame({ seed })).');
    }
    window.__rng__.reseed(s);
  }, seed);
}

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
 *
 * Options:
 *   seed — if provided, installs a deterministic Mulberry32 PRNG in place of
 *          Math.random before SugarCube loads. Makes every random()/either()
 *          call in the game reproducible for this page.
 */
async function openGame(browser, { seed } = {}) {
  const page = await browser.newPage();
  if (seed !== undefined) {
    await installSeededRng(page, seed);
  }
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
  installSeededRng,
  reseedRng,
};
