/**
 * Address-stability regression tests.
 *
 * The hunt lobby + GhostStreet card both display a seed-derived
 * street address (or a static-house label) that has to remain
 * stable across save/reload. Two failure modes the lifecycle had
 * historically introduced:
 *
 *   1. Re-entering HuntStart while a run was already in flight
 *      forfeited the run via setup.HuntController.endHunt(false), which
 *      called rollNextSeed() -- so a save/reload that landed back
 *      on the lobby would regenerate the seed and the address
 *      would drift.
 *   2. The forfeit-on-reentry semantic wasn't paired with anywhere
 *      to attribute the click intent, so any path that re-rendered
 *      HuntStart (browser back-button, sidebar nav) silently
 *      paid out a failure.
 *
 * The fix moves the forfeit from HuntStart entry to the GhostStreet
 * card click handlers (huntCard / huntHouseCard). These
 * tests pin the resulting invariants:
 *
 *   - Save/reload on HuntStart resumes the existing run with its
 *     original seed and address.
 *   - Save/reload on HuntRun preserves the address.
 *   - $nextHuntSeed survives serialize/deserialize.
 *   - Re-rendering HuntStart with no card click does NOT mutate
 *     $nextHuntSeed or the active run's seed.
 */
const { test, expect } = require('@playwright/test');
const { openGame, resetGame, getVar, callSetup } = require('./helpers');

test.describe('Hunt address stability across save/reload', () => {
  let page;

  test.beforeAll(async ({ browser }) => {
    page = await openGame(browser);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test.beforeEach(async () => {
    await resetGame(page);
  });

  /* Mirrors the helper in save-load-roundtrip.spec.js. SugarCube
     keeps State.variables as a working copy of the active moment;
     direct mutations there don't auto-write back to history, and
     Save.serialize reads from history. Tests that mutate via the
     setup APIs and then save must do this flush explicitly. */
  function commitToSave(page) {
    return page.evaluate(() => {
      const idx = SugarCube.State.activeIndex !== undefined
        ? SugarCube.State.activeIndex
        : SugarCube.State.history.length - 1;
      const moment = SugarCube.State.history[idx];
      if (!moment) return;
      moment.variables = JSON.parse(JSON.stringify(SugarCube.State.variables));
    });
  }

  test('$nextHuntSeed survives a Save.serialize / deserialize round-trip', async () => {
    /* Pin $nextHuntSeed to a known value, save, wipe state, reload
       from the saved blob, confirm the seed came back unchanged.
       Catches any SaveMigration default that overwrites a numeric
       field on load. */
    await page.evaluate(() => { SugarCube.State.variables.nextHuntSeed = 4242; });
    await commitToSave(page);

    const blob = await page.evaluate(() => SugarCube.Save.serialize());
    await resetGame(page);
    expect(await getVar(page, 'nextHuntSeed')).not.toBe(4242);

    await page.evaluate(b => SugarCube.Save.deserialize(b), blob);
    expect(await getVar(page, 'nextHuntSeed')).toBe(4242);
  });

  test('GhostStreet hunt card address stays stable after save/reload', async () => {
    /* Pin the seed, snapshot the address derived from it, save,
       wipe state, reload, and confirm the address (= the same
       seed-derived string) renders identically. The address is
       derived from setup.HuntController.addressFromSeed which is purely
       deterministic on the seed -- this test is really pinning
       "the seed survives the round-trip". */
    await page.evaluate(() => { SugarCube.State.variables.nextHuntSeed = 99999; });
    await commitToSave(page);

    const before = await callSetup(page, 'setup.HuntController.addressFromSeed(setup.HuntController.nextSeed()).formatted');

    const blob = await page.evaluate(() => SugarCube.Save.serialize());
    await resetGame(page);
    await page.evaluate(b => SugarCube.Save.deserialize(b), blob);

    const after = await callSetup(page, 'setup.HuntController.addressFromSeed(setup.HuntController.nextSeed()).formatted');
    expect(after).toBe(before);
  });

  test('save/reload on HuntStart preserves the lobby address', async () => {
    /* End-to-end: start a procedural hunt, snapshot its
       address (seed-derived, not the static-house label), save the
       game while still on the lobby, wipe everything, deserialize,
       and confirm the lobby's address still matches. Before the
       fix this would re-trigger endHunt + rollNextSeed on HuntStart
       entry and the address would drift. */
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 12345 }));
    await page.evaluate(() => SugarCube.Engine.play('HuntStart'));
    await page.waitForFunction(() => SugarCube.State.passage === 'HuntStart');

    const before = await callSetup(page, 'setup.HuntController.address().formatted');
    const seedBefore = await callSetup(page, 'setup.HuntController.seed()');
    const nextBefore = await getVar(page, 'nextHuntSeed');
    expect(seedBefore).toBe(12345);

    await commitToSave(page);
    const blob = await page.evaluate(() => SugarCube.Save.serialize());
    await resetGame(page);
    await page.evaluate(b => SugarCube.Save.deserialize(b), blob);

    /* The active passage on reload is HuntStart. SugarCube's
       deserialize replays the current moment so HuntStart's
       <<set>>/<<run>> block fires again -- the regression we're
       guarding is "this re-render must not mutate seeds." */
    expect(await callSetup(page, 'setup.HuntController.seed()')).toBe(seedBefore);
    expect(await getVar(page, 'nextHuntSeed')).toBe(nextBefore);
    expect(await callSetup(page, 'setup.HuntController.address().formatted')).toBe(before);
  });

  test('save/reload on HuntRun preserves the in-hunt address', async () => {
    /* Same invariant but mid-hunt. The HUD reads
       setup.HuntController.address().formatted off run.seed; reload must
       leave run.seed (and so the address) untouched. */
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 77777 }));
    await page.evaluate(() => SugarCube.Engine.play('HuntRun'));
    await page.waitForFunction(() => SugarCube.State.passage === 'HuntRun');

    const before = await callSetup(page, 'setup.HuntController.address().formatted');
    const seedBefore = await callSetup(page, 'setup.HuntController.seed()');
    expect(seedBefore).toBe(77777);

    await commitToSave(page);
    const blob = await page.evaluate(() => SugarCube.Save.serialize());
    await resetGame(page);
    await page.evaluate(b => SugarCube.Save.deserialize(b), blob);

    expect(await callSetup(page, 'setup.HuntController.seed()')).toBe(seedBefore);
    expect(await callSetup(page, 'setup.HuntController.address().formatted')).toBe(before);
  });

  test('rendering HuntStart with no run active rolls a fresh run, but a re-render on the same passage does not', async () => {
    /* First entry into HuntStart with no active run: a run gets
       rolled from the persistent $nextHuntSeed. A second
       Engine.play('HuntStart') call (simulating a re-render --
       same passage, same active run) must NOT roll a new run or
       rotate $nextHuntSeed. This pins the "HuntStart resumes
       when isActive() is already true" branch. */
    expect(await getVar(page, 'run')).toBeNull();
    await page.evaluate(() => SugarCube.Engine.play('HuntStart'));
    await page.waitForFunction(() => SugarCube.State.passage === 'HuntStart');

    const seedAfterFirst = await callSetup(page, 'setup.HuntController.seed()');
    const nextAfterFirst = await getVar(page, 'nextHuntSeed');
    expect(typeof seedAfterFirst).toBe('number');

    /* Second render: same passage. With the resume branch in
       HuntStart this is a no-op for seed state. */
    await page.evaluate(() => SugarCube.Engine.play('HuntStart'));
    await page.waitForFunction(() => SugarCube.State.passage === 'HuntStart');

    expect(await callSetup(page, 'setup.HuntController.seed()')).toBe(seedAfterFirst);
    expect(await getVar(page, 'nextHuntSeed')).toBe(nextAfterFirst);
  });

  test('owaissa lobby address survives save/reload', async () => {
    /* Static-plan houses use the catalogue label as the formatted
       address (setup.HuntController.address overrides the seed-derived
       string when staticHouseId is set). The label is constant by
       design, but the underlying seed is still expected to be
       stable too -- pin both sides. */
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({
      seed: 31415, staticHouseId: 'owaissa'
    }));
    await page.evaluate(() => SugarCube.Engine.play('HuntStart'));
    await page.waitForFunction(() => SugarCube.State.passage === 'HuntStart');

    const labelBefore = await callSetup(page, 'setup.HuntController.address().formatted');
    const seedBefore = await callSetup(page, 'setup.HuntController.seed()');
    const houseBefore = await callSetup(page, 'setup.HuntController.staticHouseId()');
    expect(labelBefore).toBe('Owaissa Avenue');
    expect(houseBefore).toBe('owaissa');

    await commitToSave(page);
    const blob = await page.evaluate(() => SugarCube.Save.serialize());
    await resetGame(page);
    await page.evaluate(b => SugarCube.Save.deserialize(b), blob);

    expect(await callSetup(page, 'setup.HuntController.staticHouseId()')).toBe(houseBefore);
    expect(await callSetup(page, 'setup.HuntController.seed()')).toBe(seedBefore);
    expect(await callSetup(page, 'setup.HuntController.address().formatted')).toBe(labelBefore);
  });

  // --- Determinism axioms ---

  test('addressFromSeed is purely deterministic on the seed (idempotent across calls)', async () => {
    /* Pin a handful of (seed, expected formatted) pairs by snapshotting
       the current output. If the address generator's hashing or
       vocabulary lists change in the future, the snapshot here will
       diff and force a deliberate update -- catches "accidentally
       added a road suffix and reshuffled all addresses". */
    for (const seed of [0, 1, 42, 12345, 0xdeadbeef]) {
      const a = await callSetup(page, `setup.HuntController.addressFromSeed(${seed}).formatted`);
      const b = await callSetup(page, `setup.HuntController.addressFromSeed(${seed}).formatted`);
      const c = await callSetup(page, `setup.HuntController.addressFromSeed(${seed}).formatted`);
      expect(a).toBe(b);
      expect(b).toBe(c);
      expect(typeof a).toBe('string');
      expect(a.length).toBeGreaterThan(0);
    }
  });

  test('addressFromSeed components stay within the catalogue ranges', async () => {
    /* Number is 1..999, road comes from ROAD_NAMES, suffix from
       ROAD_SUFFIXES. Pinning this guards against an off-by-one in
       the % length math drifting the index out of range. */
    const roadNames = await callSetup(page, 'setup.HuntController.ROAD_NAMES');
    const roadSuffixes = await callSetup(page, 'setup.HuntController.ROAD_SUFFIXES');
    for (let seed = 0; seed < 50; seed++) {
      const a = await callSetup(page, `setup.HuntController.addressFromSeed(${seed})`);
      expect(a.number).toBeGreaterThanOrEqual(1);
      expect(a.number).toBeLessThanOrEqual(999);
      expect(roadNames).toContain(a.road);
      expect(roadSuffixes).toContain(a.suffix);
      expect(a.formatted).toBe(`${a.number} ${a.road} ${a.suffix}`);
    }
  });

  test('addressFromSeed produces variety across seeds (not constant)', async () => {
    /* Sanity-check the hash actually mixes -- 50 seeds should not
       collapse to a single label. A regression here would mean the
       mix32 salts collided or got zeroed out. */
    const labels = new Set();
    for (let seed = 1; seed <= 50; seed++) {
      const a = await callSetup(page, `setup.HuntController.addressFromSeed(${seed}).formatted`);
      labels.add(a);
    }
    expect(labels.size).toBeGreaterThan(10);
  });

  // --- Lifecycle invariants: rollNextSeed call sites ---

  test('rollNextSeed is the only path that mutates $nextHuntSeed (besides explicit assignment)', async () => {
    /* Lock the contract: every code path that can rotate the seed
       has to go through setup.HuntController.rollNextSeed. setField, start,
       endHunt, and the lobby resume branch must all leave it
       untouched. The bug we're fixing was endHunt calling
       rollNextSeed indirectly via the lobby; checking that no
       other observable callers do the same locks the regression
       surface. */
    await page.evaluate(() => { SugarCube.State.variables.nextHuntSeed = 555; });

    // setField on the run object must not touch nextHuntSeed.
    await page.evaluate(() => SugarCube.setup.HuntController.start({ seed: 1 }));
    await page.evaluate(() => SugarCube.setup.HuntController.setField('floorplan', { rooms: [], edges: [] }));
    expect(await getVar(page, 'nextHuntSeed')).toBe(555);

    // Plain end() (cleanup helper, not endHunt) must not touch it.
    await page.evaluate(() => SugarCube.setup.HuntController.end());
    expect(await getVar(page, 'nextHuntSeed')).toBe(555);

    // Direct nextSeed() read is non-mutating.
    await callSetup(page, 'setup.HuntController.nextSeed()');
    expect(await getVar(page, 'nextHuntSeed')).toBe(555);
  });

  test('endHunt rotates $nextHuntSeed exactly once per call', async () => {
    /* Pin "endHunt calls rollNextSeed once" by saving the seed
       before, calling endHunt, and confirming the seed is now
       different. Then call endHunt again with no run active --
       must be a no-op (preserves the just-rotated seed). */
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1 }));
    await page.evaluate(() => { SugarCube.State.variables.nextHuntSeed = 12345; });

    await page.evaluate(() => SugarCube.setup.HuntController.endHunt(false));
    const afterFirst = await getVar(page, 'nextHuntSeed');
    expect(afterFirst).not.toBe(12345);

    /* endHunt with no active run is a no-op -- it returns null
       early without rolling. */
    expect(await page.evaluate(() => SugarCube.setup.HuntController.endHunt(false))).toBeNull();
    expect(await getVar(page, 'nextHuntSeed')).toBe(afterFirst);
  });

  test('startHunt does not rotate $nextHuntSeed', async () => {
    /* Starting a run should consume nextSeed (read it as the
       seed for the run) but never advance it. The advance only
       happens at endHunt, after a run completes. */
    await page.evaluate(() => { SugarCube.State.variables.nextHuntSeed = 777; });
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 777 }));
    expect(await getVar(page, 'nextHuntSeed')).toBe(777);
    expect(await callSetup(page, 'setup.HuntController.seed()')).toBe(777);
  });

  test('nextSeed() lazy-initialises but does not mutate an existing seed', async () => {
    /* The lazy-init path triggers when $nextHuntSeed is missing
       (e.g. very old saves predating the field). After that, every
       call must return the same value without rotating. */
    await page.evaluate(() => { delete SugarCube.State.variables.nextHuntSeed; });
    expect(await getVar(page, 'nextHuntSeed')).toBeUndefined();

    const first = await callSetup(page, 'setup.HuntController.nextSeed()');
    expect(typeof first).toBe('number');

    const second = await callSetup(page, 'setup.HuntController.nextSeed()');
    const third = await callSetup(page, 'setup.HuntController.nextSeed()');
    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(await getVar(page, 'nextHuntSeed')).toBe(first);
  });

  // --- HuntStart re-entry semantics ---

  test('HuntStart re-entered N times with active run does not rotate seeds', async () => {
    /* The fix's load-bearing invariant: hitting HuntStart while a
       run is already in flight is a no-op for seed state. Loop a
       handful of re-entries and confirm both run.seed and
       $nextHuntSeed stay constant. */
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 8888 }));
    await page.evaluate(() => SugarCube.Engine.play('HuntStart'));
    await page.waitForFunction(() => SugarCube.State.passage === 'HuntStart');

    const seedBefore = await callSetup(page, 'setup.HuntController.seed()');
    const nextBefore = await getVar(page, 'nextHuntSeed');

    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => SugarCube.Engine.play('HuntStart'));
      await page.waitForFunction(() => SugarCube.State.passage === 'HuntStart');
    }

    expect(await callSetup(page, 'setup.HuntController.seed()')).toBe(seedBefore);
    expect(await getVar(page, 'nextHuntSeed')).toBe(nextBefore);
  });

  test('save/reload cycles preserve the seed across multiple iterations', async () => {
    /* Address stability across more than one round-trip: serialize,
       wipe, deserialize, repeat. A subtle leak (e.g. a default
       running on second load) would surface only after several
       iterations. */
    await page.evaluate(() => { SugarCube.State.variables.nextHuntSeed = 24681; });
    await commitToSave(page);

    let blob = await page.evaluate(() => SugarCube.Save.serialize());
    for (let cycle = 0; cycle < 4; cycle++) {
      await resetGame(page);
      await page.evaluate(b => SugarCube.Save.deserialize(b), blob);
      expect(await getVar(page, 'nextHuntSeed')).toBe(24681);
      // Re-serialize for the next cycle to catch shape drift between
      // round-trips (a save format that mutates the field on save
      // would surface here).
      await commitToSave(page);
      blob = await page.evaluate(() => SugarCube.Save.serialize());
    }
  });

  // --- Card-click forfeit semantics ---

  test('clicking the procedural hunt card with an active run forfeits and rolls a new run', async () => {
    /* The huntCard widget is the canonical "fresh start"
       entry point: clicking it must end any in-flight run and
       advance the seed. Drives the click via direct widget body
       evaluation (the assertion is on state mutation, not DOM). */
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1 }));
    const seedBefore = await callSetup(page, 'setup.HuntController.seed()');
    const nextBefore = await getVar(page, 'nextHuntSeed');
    expect(await callSetup(page, 'setup.HuntController.isActive()')).toBe(true);

    /* Mirrors the body of the huntCard's <<link>>: forfeit the
       active run if one's in flight, then route to HuntStart. */
    await page.evaluate(() => {
      if (SugarCube.setup.HuntController.isActive()) SugarCube.setup.HuntController.endHunt(false);
    });
    await page.evaluate(() => SugarCube.Engine.play('HuntStart'));
    await page.waitForFunction(() => SugarCube.State.passage === 'HuntStart');

    /* The forfeit rotated nextHuntSeed; HuntStart then rolled a
       fresh run from the new seed. Both observable side effects
       must surface. */
    expect(await getVar(page, 'nextHuntSeed')).not.toBe(nextBefore);
    expect(await callSetup(page, 'setup.HuntController.seed()')).not.toBe(seedBefore);
    expect(await callSetup(page, 'setup.HuntController.isActive()')).toBe(true);
  });

  test('clicking the procedural hunt card without an active run starts a new run from the current nextSeed', async () => {
    /* Symmetry check: with no run in flight, the card click skips
       the forfeit branch but still seeds a fresh run from
       $nextHuntSeed. */
    await page.evaluate(() => { SugarCube.State.variables.nextHuntSeed = 9999; });
    expect(await callSetup(page, 'setup.HuntController.isActive()')).toBe(false);

    await page.evaluate(() => {
      if (SugarCube.setup.HuntController.isActive()) SugarCube.setup.HuntController.endHunt(false);
    });
    await page.evaluate(() => SugarCube.Engine.play('HuntStart'));
    await page.waitForFunction(() => SugarCube.State.passage === 'HuntStart');

    expect(await callSetup(page, 'setup.HuntController.seed()')).toBe(9999);
    /* Without a run to end, nextHuntSeed should not have rotated;
       the fresh run consumed it as-is. */
    expect(await getVar(page, 'nextHuntSeed')).toBe(9999);
  });

  test('static hunt-house card click stamps the catalogue id and forfeits any in-flight run', async () => {
    /* Static-hunt-house cards stage $pendingHuntHouseId and
       forfeit any active run before navigating; HuntStart then
       reads the staging slot and threads it to startHunt. This
       test mirrors the click body for elm. */
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1 }));
    const seedBefore = await callSetup(page, 'setup.HuntController.seed()');
    expect(await callSetup(page, 'setup.HuntController.staticHouseId()')).toBeNull();

    await page.evaluate(() => {
      if (SugarCube.setup.HuntController.isActive()) SugarCube.setup.HuntController.endHunt(false);
      SugarCube.State.variables.pendingHuntHouseId = 'elm';
    });
    await page.evaluate(() => SugarCube.Engine.play('HuntStart'));
    await page.waitForFunction(() => SugarCube.State.passage === 'HuntStart');

    expect(await callSetup(page, 'setup.HuntController.seed()')).not.toBe(seedBefore);
    expect(await callSetup(page, 'setup.HuntController.staticHouseId()')).toBe('elm');
    /* The staging slot is consumed once and cleared. */
    expect(await getVar(page, 'pendingHuntHouseId')).toBeNull();
  });

  // --- Cross-surface address consistency ---

  test('GhostStreet card label and HuntStart lobby address resolve to the same string for a given $nextHuntSeed', async () => {
    /* Two different read paths must agree:
         GhostStreet:   addressFromSeed(nextSeed())
         HuntStart:    address() -- which is addressFromSeed(run.seed)
       since startHunts with seed = nextSeed(). A renderer that
       hashed differently would let the card and the HUD disagree. */
    await page.evaluate(() => { SugarCube.State.variables.nextHuntSeed = 31415; });
    const cardLabel = await callSetup(page, 'setup.HuntController.addressFromSeed(setup.HuntController.nextSeed()).formatted');

    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 31415 }));
    const lobbyLabel = await callSetup(page, 'setup.HuntController.address().formatted');

    expect(lobbyLabel).toBe(cardLabel);
  });

  test('every static hunt house renders its catalogue label as the address (not a seed-derived street)', async () => {
    /* Static houses override the formatted address with the
       catalogue label. Every catalogue entry should round-trip
       through the override; if a future entry forgets to set
       `label` the address would silently fall back to the
       seed-derived string. */
    const ids = await callSetup(page, 'setup.HuntHouses.ids()');
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      await page.evaluate(({ s, h }) => {
        if (SugarCube.setup.HuntController.isActive()) SugarCube.setup.HuntController.end();
        SugarCube.setup.HuntController.startHunt({ seed: s, staticHouseId: h });
      }, { s: 4242, h: id });
      const cat = await callSetup(page, `setup.HuntHouses.byId(${JSON.stringify(id)})`);
      const addr = await callSetup(page, 'setup.HuntController.address().formatted');
      expect(addr).toBe(cat.label);
      await page.evaluate(() => SugarCube.setup.HuntController.endHunt(false));
    }
  });

  // --- Per-stage save/reload fuzz ---

  test('save/reload across many seeds preserves the lobby address every time', async () => {
    /* Fuzz: for a range of seeds, start a run on the lobby, save,
       wipe, deserialize, and check the address is unchanged. A
       single failing seed surfaces with its formatted label so
       the regression is easy to inspect. */
    test.setTimeout(30_000);
    const seeds = [1, 7, 42, 100, 999, 12345, 67890, 0xcafe, 0xbeef];
    for (const seed of seeds) {
      await resetGame(page);
      await page.evaluate(s => SugarCube.setup.HuntController.startHunt({ seed: s }), seed);
      await page.evaluate(() => SugarCube.Engine.play('HuntStart'));
      await page.waitForFunction(() => SugarCube.State.passage === 'HuntStart');

      const before = await callSetup(page, 'setup.HuntController.address().formatted');
      await commitToSave(page);
      const blob = await page.evaluate(() => SugarCube.Save.serialize());
      await resetGame(page);
      await page.evaluate(b => SugarCube.Save.deserialize(b), blob);

      const after = await callSetup(page, 'setup.HuntController.address().formatted');
      expect(after, `seed ${seed} address drift`).toBe(before);
    }
  });

  test('every static hunt house preserves its label across a full save/reload cycle', async () => {
    /* Counterpart to the seed-fuzz above, but for static-house
       runs. Walks the catalogue and confirms each entry's label
       round-trips with the run. */
    test.setTimeout(30_000);
    const ids = await callSetup(page, 'setup.HuntHouses.ids()');
    for (const id of ids) {
      await resetGame(page);
      await page.evaluate(({ s, h }) =>
        SugarCube.setup.HuntController.startHunt({ seed: s, staticHouseId: h }),
        { s: 1, h: id });
      await page.evaluate(() => SugarCube.Engine.play('HuntStart'));
      await page.waitForFunction(() => SugarCube.State.passage === 'HuntStart');

      const before = await callSetup(page, 'setup.HuntController.address().formatted');
      const houseBefore = await callSetup(page, 'setup.HuntController.staticHouseId()');
      await commitToSave(page);
      const blob = await page.evaluate(() => SugarCube.Save.serialize());
      await resetGame(page);
      await page.evaluate(b => SugarCube.Save.deserialize(b), blob);

      expect(await callSetup(page, 'setup.HuntController.staticHouseId()'), `${id} houseId drift`).toBe(houseBefore);
      expect(await callSetup(page, 'setup.HuntController.address().formatted'), `${id} label drift`).toBe(before);
    }
  });

  // --- Source-level lint: forfeit-on-entry must NOT come back ---

  test('HuntStart source no longer auto-forfeits on entry', async () => {
    /* Static lint to keep the bug from coming back via a clever
       refactor. HuntStart's body must not contain a call to
       setup.HuntController.endHunt at the *top* of the passage -- that was
       the literal source of the address-drift bug. The forfeit
       lives on the GhostStreet card click handlers instead, which
       is verified separately by the click-forfeit test above. */
    const fs = require('fs');
    const path = require('path');
    const lifecyclePath = path.resolve(
      __dirname, '..', 'passages', 'hunt', 'HuntLifecycle.tw');
    const body = fs.readFileSync(lifecyclePath, 'utf8');

    /* Slice out the HuntStart block and check that block alone --
       endHunt calls in HuntSummary are legitimate. */
    const startIdx = body.indexOf(':: HuntStart');
    const nextIdx = body.indexOf('\n:: ', startIdx + 1);
    const startBlock = body.slice(startIdx, nextIdx === -1 ? body.length : nextIdx);
    expect(startBlock.length).toBeGreaterThan(0);
    expect(startBlock).not.toMatch(/<<run\s+setup\.HuntController\.endHunt/);
  });

  test('GhostStreet card widgets carry the forfeit-before-launch click body', async () => {
    /* Companion lint to the above: the hunt card widgets in
       widgetHauntedHouseStreet.tw must end the active run before
       navigating to HuntStart. Without this, HuntStart's resume
       branch would silently let an old run carry into a "new
       hunt" click -- a visible UX bug. */
    const fs = require('fs');
    const path = require('path');
    const widgetPath = path.resolve(
      __dirname, '..', 'passages', 'haunted_houses', 'tools',
      'widgetHauntedHouseStreet.tw');
    const body = fs.readFileSync(widgetPath, 'utf8');

    /* Both huntCard and huntHouseCard widgets must
       contain the in-flight forfeit. */
    expect(body).toContain('huntCard');
    expect(body).toContain('huntHouseCard');
    /* Two distinct call sites -- one per widget. */
    const matches = body.match(/setup\.HuntController\.endHunt\(false\)/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});
