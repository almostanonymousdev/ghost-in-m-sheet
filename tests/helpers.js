const path = require('path');

const GAME_URL = `file://${path.resolve(__dirname, '..', 'ghost-in-msheet.html')}`;

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
 * Install a deterministic Mulberry32 PRNG over Math.random on an already-open
 * page. Unlike installSeededRng (which uses addInitScript and only takes effect
 * for fresh navigations), this can be called mid-test after openGame so a
 * single test can pin RNG without disturbing the worker-shared page — the
 * patched Math.random survives until the next resetGame, which restores the
 * snapshot captured by openGame.
 *
 * Use this for stochastic gameplay tests (sanity-drain sampling, evidence
 * glitch sampling, etc.) so a fixed seed produces a reproducible sequence
 * instead of relying on natural RNG variance + test retries.
 */
async function seedRandom(page, seed) {
  await page.evaluate((s) => {
    if (!window.__origMathRandom) window.__origMathRandom = Math.random;
    let state = s >>> 0;
    Math.random = function () {
      state = (state + 0x6D2B79F5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    if (window.__rng__) window.__rng__.reseed(s);
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

/* --- Wardrobe ($wardrobe bundle) helpers --------------------------
 *
 * The wardrobe collapsed into a single $wardrobe bundle behind
 * setup.Wardrobe; there are no flat $<name>State<N> / $remember* /
 * $is*Stolen / $lostClothing save keys any more. Tests reach the
 * mutable facts through these thin wrappers over the bundle paths:
 *
 *   $wardrobe.items.<id>        "worn" | "not worn" | "not bought"
 *   $wardrobe.remembered.<grp>  "<id>" | "no<id>" | null
 *   $wardrobe.stolen.<cat>      bool   (shirt|bra|panties|bottom|jeans|shorts|skirt)
 *   $wardrobe.lost              [ <id>, ... ]
 *
 * `id` is the canonical wardrobe id ("tshirt0", "bra2", "skirt1");
 * `grp` is a group name ('tshirt'|'bottomOuter'|'bra'|'panties'|'stockings');
 * `cat` is a steal category. Aggregate slot state is *computed* now —
 * read it with `callSetup(page, "setup.Wardrobe.state('tshirt')")` and
 * drive it by setting an actual item, not a flat aggregate key.
 */
const wardrobeItemPath = (id) => `wardrobe.items.${id}`;

function setWardrobeItem(page, id, state) { return setVar(page, wardrobeItemPath(id), state); }
function getWardrobeItem(page, id) { return getVar(page, wardrobeItemPath(id)); }
function setWardrobeRemember(page, grp, token) { return setVar(page, `wardrobe.remembered.${grp}`, token); }
function getWardrobeRemember(page, grp) { return getVar(page, `wardrobe.remembered.${grp}`); }
function setWardrobeStolen(page, cat, val) { return setVar(page, `wardrobe.stolen.${cat}`, val); }
function getWardrobeStolen(page, cat) { return getVar(page, `wardrobe.stolen.${cat}`); }
function getWardrobeLost(page) { return getVar(page, 'wardrobe.lost'); }
function setWardrobeLost(page, ids) { return setVar(page, 'wardrobe.lost', ids); }

/** Set many item states at once: setWardrobeItems(page, { tshirt0:'not worn', tshirt1:'worn' }). */
function setWardrobeItems(page, map) {
  return page.evaluate((m) => {
    const items = SugarCube.State.variables.wardrobe.items;
    for (const id in m) items[id] = m[id];
  }, map);
}

/**
 * Flip every currently-worn item to "not worn" (a naked baseline) without
 * touching beauty — for coverage / exposure tests that build an outfit up
 * from nothing. Leaves not-bought items and remember tokens untouched.
 */
function stripWardrobeBare(page) {
  return page.evaluate(() => {
    const items = SugarCube.State.variables.wardrobe.items;
    for (const id in items) if (items[id] === 'worn') items[id] = 'not worn';
  });
}

/**
 * Drive a whole *slot* to worn / not-worn — the bundle-era replacement for
 * the removed flat aggregate `$<slot>State`. Aggregate slot state is computed
 * from the items now (`setup.Wardrobe.state(slot)`), so there's nothing flat
 * to set; this mirrors what an equip/strip would leave behind:
 *
 *   - 'worn'      → clears any worn garment in the slot's group (one garment
 *                   per group), then wears the slot default (slot-0, or tier-1
 *                   for shorts/skirt which have no slot-0).
 *   - 'not worn'  → flips any worn item in the slot back to not-worn, leaving
 *                   not-bought tiers untouched.
 *   - 'not bought'→ as 'not worn' but parks worn items at not-bought.
 *
 * `slot` is 'tshirt'|'bra'|'panties'|'jeans'|'shorts'|'skirt'|'stockings'.
 * jeans/shorts/skirt share the bottomOuter group but only touch their own
 * category, so setting one bottom worn clears the others.
 */
function setWardrobeSlot(page, slot, state) {
  return page.evaluate(({ slot, state }) => {
    const W = SugarCube.setup.Wardrobe;
    const items = SugarCube.State.variables.wardrobe.items;
    const grp = W.groupForSlot(slot);
    const isBottom = (slot === 'jeans' || slot === 'shorts' || slot === 'skirt');
    const slotItems = isBottom
      ? grp.items.filter((it) => it.category === slot)
      : grp.items;
    if (state === 'worn') {
      grp.items.forEach((it) => { if (items[it.id] === 'worn') items[it.id] = 'not worn'; });
      const target = slotItems.find((it) => it.slot === 0) || slotItems[0];
      items[target.id] = 'worn';
    } else {
      const parked = state === 'not bought' ? 'not bought' : 'not worn';
      slotItems.forEach((it) => { if (items[it.id] === 'worn') items[it.id] = parked; });
    }
  }, { slot, state });
}

/** Read the computed aggregate slot state (replaces reads of `$<slot>State`). */
function getWardrobeSlot(page, slot) {
  return page.evaluate((s) => SugarCube.setup.Wardrobe.state(s), slot);
}

/**
 * Set $huntMode (0 = none, 2 = active, 3 = possessed, 4 = ended).
 * Auto-creates a stub $run for non-zero modes so tests can exercise
 * mode transitions without calling setupHunt first.
 */
function setHuntMode(page, mode) {
  return page.evaluate((m) => {
    const V = SugarCube.State.variables;
    if (m === 0) {
      V.huntMode = 0;
      V.run = null;
      return;
    }
    if (!V.run || !V.run.ghostName) SugarCube.setup.Ghosts.cheatStartHunt('Shade');
    V.huntMode = m;
  }, mode);
}

/** Read $huntMode (0 when no hunt is active). */
function getHuntMode(page) {
  return page.evaluate(() => {
    return SugarCube.State.variables.huntMode || 0;
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
  /* Snapshot the active Math.random so resetGame can restore it after a
     test pins a deterministic stub (e.g. `Math.random = () => 0`). Without
     this, the stub survives Engine.restart (which doesn't reload the page)
     and corrupts the next test's StoryInit — sometimes silently, sometimes
     crashing the page outright. Runs after installSeededRng so the snapshot
     captures the seeded rng when one is installed. */
  await page.addInitScript(() => {
    if (!window.__origMathRandom) {
      window.__origMathRandom = Math.random;
    }
  });
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
 * Ensure a usable page: if the supplied one is still alive, return it; if
 * the renderer was closed (heavy passages can OOM the renderer under
 * parallel worker load), open a fresh one against the same browser.
 *
 * Used by spec files that own their own page lifecycle (hunt-flow,
 * hunt-outside, events-controller) so a single crashed page doesn't
 * cascade into "Target page closed" failures across the rest of the file.
 * The fixture-based `game` test fixture handles the equivalent recovery
 * inline.
 */
async function ensureOpenPage(browser, page) {
  if (page && !page.isClosed()) return page;
  return openGame(browser);
}

/**
 * Reset SugarCube state by restarting the engine (replays StoryInit).
 * Much faster than closing and reopening the page.
 *
 * SugarCube's Engine.restart() resets state and then calls
 * window.location.reload() — an *asynchronous* navigation that commits after
 * the current task finishes. The pre-reload document still has a live
 * SugarCube with non-empty State.passage and a populated State.variables, so
 * a naive "wait for SugarCube + passage" check resolves immediately against
 * the doomed page; the reload then commits mid-test and wipes $mc / $brook /
 * $companion, surfacing as intermittent "Cannot read properties of
 * null/undefined" crashes in whatever passage the test renders next.
 *
 * To close that window we stamp window.__preRestart__ on the current document
 * before calling restart, then wait until we're on a document that lacks the
 * marker (i.e. the reloaded one) AND whose StoryInit has finished seeding
 * core state ($mc). The marker can only be absent on the fresh document, so
 * the wait can't satisfy itself against the old page.
 *
 * We also wait for the fresh game's one-shot tick-migrations to settle. A
 * brand-new game does NOT seed the legacy-save migration flags ($update0909,
 * $update22, $update2707) at init; instead TickController's onPassageDone
 * (:passageend) fires them on the first passage's tick — and
 * migrateDeliveryAndCompanionReset() unconditionally rewrites
 * $companion = { name: false }. $mc / State.passage are populated at
 * :passagestart, BEFORE that :passageend tick, so a wait that stops at "$mc
 * seeded" can return while the migration is still armed. A test that then
 * seeds $companion (e.g. the passage-walk's seedBaselineState) has its
 * companion silently clobbered when the deferred tick finally lands —
 * surfacing as intermittent null-companion crashes in CompanionMain et al.
 * under parallel-worker load. Gating on $update0909 (the companion-reset
 * migration's flag; all three run in the same synchronous onPassageDone pass)
 * guarantees the tick has run before any caller seeds state on top of it.
 */
async function resetGame(page) {
  /* Undo any test-local Math.random stub before StoryInit re-runs — see
     openGame for the rationale. The seeded RNG is reinstalled on the reloaded
     document by the addInitScript from openGame({ seed }). */
  await page.evaluate(() => {
    if (window.__origMathRandom) Math.random = window.__origMathRandom;
    window.__preRestart__ = true;
    SugarCube.Engine.restart();
  });
  await page.waitForFunction(() =>
    typeof window.__preRestart__ === 'undefined' &&
    typeof SugarCube !== 'undefined' &&
    SugarCube.State &&
    SugarCube.State.variables &&
    SugarCube.State.variables.mc &&
    SugarCube.Engine &&
    SugarCube.State.passage !== '' &&
    SugarCube.State.variables.update0909 !== undefined
  );
}

module.exports = {
  GAME_URL,
  waitForSugarCube,
  goToPassage,
  getVar,
  setVar,
  setWardrobeItem,
  getWardrobeItem,
  setWardrobeItems,
  setWardrobeRemember,
  getWardrobeRemember,
  setWardrobeStolen,
  getWardrobeStolen,
  getWardrobeLost,
  setWardrobeLost,
  stripWardrobeBare,
  setWardrobeSlot,
  getWardrobeSlot,
  setHuntMode,
  getHuntMode,
  callSetup,
  openGame,
  resetGame,
  installSeededRng,
  reseedRng,
  seedRandom,
  ensureOpenPage,
};
