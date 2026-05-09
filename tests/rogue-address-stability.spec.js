/**
 * Address-stability regression tests.
 *
 * The rogue lobby + GhostStreet card both display a seed-derived
 * street address (or a static-house label) that has to remain
 * stable across save/reload. Two failure modes the lifecycle had
 * historically introduced:
 *
 *   1. Re-entering RogueStart while a run was already in flight
 *      forfeited the run via setup.Rogue.endRogue(false), which
 *      called rollNextSeed() -- so a save/reload that landed back
 *      on the lobby would regenerate the seed and the address
 *      would drift.
 *   2. The forfeit-on-reentry semantic wasn't paired with anywhere
 *      to attribute the click intent, so any path that re-rendered
 *      RogueStart (browser back-button, sidebar nav) silently
 *      paid out a failure.
 *
 * The fix moves the forfeit from RogueStart entry to the GhostStreet
 * card click handlers (rogueHuntCard / rogueStaticHouseCard). These
 * tests pin the resulting invariants:
 *
 *   - Save/reload on RogueStart resumes the existing run with its
 *     original seed and address.
 *   - Save/reload on RogueRun preserves the address.
 *   - $nextRogueSeed survives serialize/deserialize.
 *   - Re-rendering RogueStart with no card click does NOT mutate
 *     $nextRogueSeed or the active run's seed.
 */
const { test, expect } = require('@playwright/test');
const { openGame, resetGame, getVar, callSetup } = require('./helpers');

test.describe('Rogue address stability across save/reload', () => {
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

  test('$nextRogueSeed survives a Save.serialize / deserialize round-trip', async () => {
    /* Pin $nextRogueSeed to a known value, save, wipe state, reload
       from the saved blob, confirm the seed came back unchanged.
       Catches any SaveMigration default that overwrites a numeric
       field on load. */
    await page.evaluate(() => { SugarCube.State.variables.nextRogueSeed = 4242; });
    await commitToSave(page);

    const blob = await page.evaluate(() => SugarCube.Save.serialize());
    await resetGame(page);
    expect(await getVar(page, 'nextRogueSeed')).not.toBe(4242);

    await page.evaluate(b => SugarCube.Save.deserialize(b), blob);
    expect(await getVar(page, 'nextRogueSeed')).toBe(4242);
  });

  test('GhostStreet rogue card address stays stable after save/reload', async () => {
    /* Pin the seed, snapshot the address derived from it, save,
       wipe state, reload, and confirm the address (= the same
       seed-derived string) renders identically. The address is
       derived from setup.Rogue.addressFromSeed which is purely
       deterministic on the seed -- this test is really pinning
       "the seed survives the round-trip". */
    await page.evaluate(() => { SugarCube.State.variables.nextRogueSeed = 99999; });
    await commitToSave(page);

    const before = await callSetup(page, 'setup.Rogue.addressFromSeed(setup.Rogue.nextSeed()).formatted');

    const blob = await page.evaluate(() => SugarCube.Save.serialize());
    await resetGame(page);
    await page.evaluate(b => SugarCube.Save.deserialize(b), blob);

    const after = await callSetup(page, 'setup.Rogue.addressFromSeed(setup.Rogue.nextSeed()).formatted');
    expect(after).toBe(before);
  });

  test('save/reload on RogueStart preserves the lobby address', async () => {
    /* End-to-end: start a procedural rogue run, snapshot its
       address (seed-derived, not the static-house label), save the
       game while still on the lobby, wipe everything, deserialize,
       and confirm the lobby's address still matches. Before the
       fix this would re-trigger endRogue + rollNextSeed on RogueStart
       entry and the address would drift. */
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({ seed: 12345 }));
    await page.evaluate(() => SugarCube.Engine.play('RogueStart'));
    await page.waitForFunction(() => SugarCube.State.passage === 'RogueStart');

    const before = await callSetup(page, 'setup.Rogue.address().formatted');
    const seedBefore = await callSetup(page, 'setup.Rogue.seed()');
    const nextBefore = await getVar(page, 'nextRogueSeed');
    expect(seedBefore).toBe(12345);

    await commitToSave(page);
    const blob = await page.evaluate(() => SugarCube.Save.serialize());
    await resetGame(page);
    await page.evaluate(b => SugarCube.Save.deserialize(b), blob);

    /* The active passage on reload is RogueStart. SugarCube's
       deserialize replays the current moment so RogueStart's
       <<set>>/<<run>> block fires again -- the regression we're
       guarding is "this re-render must not mutate seeds." */
    expect(await callSetup(page, 'setup.Rogue.seed()')).toBe(seedBefore);
    expect(await getVar(page, 'nextRogueSeed')).toBe(nextBefore);
    expect(await callSetup(page, 'setup.Rogue.address().formatted')).toBe(before);
  });

  test('save/reload on RogueRun preserves the in-hunt address', async () => {
    /* Same invariant but mid-hunt. The HUD reads
       setup.Rogue.address().formatted off run.seed; reload must
       leave run.seed (and so the address) untouched. */
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({ seed: 77777 }));
    await page.evaluate(() => SugarCube.Engine.play('RogueRun'));
    await page.waitForFunction(() => SugarCube.State.passage === 'RogueRun');

    const before = await callSetup(page, 'setup.Rogue.address().formatted');
    const seedBefore = await callSetup(page, 'setup.Rogue.seed()');
    expect(seedBefore).toBe(77777);

    await commitToSave(page);
    const blob = await page.evaluate(() => SugarCube.Save.serialize());
    await resetGame(page);
    await page.evaluate(b => SugarCube.Save.deserialize(b), blob);

    expect(await callSetup(page, 'setup.Rogue.seed()')).toBe(seedBefore);
    expect(await callSetup(page, 'setup.Rogue.address().formatted')).toBe(before);
  });

  test('rendering RogueStart with no run active rolls a fresh run, but a re-render on the same passage does not', async () => {
    /* First entry into RogueStart with no active run: a run gets
       rolled from the persistent $nextRogueSeed. A second
       Engine.play('RogueStart') call (simulating a re-render --
       same passage, same active run) must NOT roll a new run or
       rotate $nextRogueSeed. This pins the "RogueStart resumes
       when isRogue() is already true" branch. */
    expect(await getVar(page, 'run')).toBeNull();
    await page.evaluate(() => SugarCube.Engine.play('RogueStart'));
    await page.waitForFunction(() => SugarCube.State.passage === 'RogueStart');

    const seedAfterFirst = await callSetup(page, 'setup.Rogue.seed()');
    const nextAfterFirst = await getVar(page, 'nextRogueSeed');
    expect(typeof seedAfterFirst).toBe('number');

    /* Second render: same passage. With the resume branch in
       RogueStart this is a no-op for seed state. */
    await page.evaluate(() => SugarCube.Engine.play('RogueStart'));
    await page.waitForFunction(() => SugarCube.State.passage === 'RogueStart');

    expect(await callSetup(page, 'setup.Rogue.seed()')).toBe(seedAfterFirst);
    expect(await getVar(page, 'nextRogueSeed')).toBe(nextAfterFirst);
  });

  test('rogue-owaissa lobby address survives save/reload', async () => {
    /* Static-plan houses use the catalogue label as the formatted
       address (setup.Rogue.address overrides the seed-derived
       string when staticHouseId is set). The label is constant by
       design, but the underlying seed is still expected to be
       stable too -- pin both sides. */
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({
      seed: 31415, staticHouseId: 'rogue-owaissa'
    }));
    await page.evaluate(() => SugarCube.Engine.play('RogueStart'));
    await page.waitForFunction(() => SugarCube.State.passage === 'RogueStart');

    const labelBefore = await callSetup(page, 'setup.Rogue.address().formatted');
    const seedBefore = await callSetup(page, 'setup.Rogue.seed()');
    const houseBefore = await callSetup(page, 'setup.Rogue.staticHouseId()');
    expect(labelBefore).toBe('Rogue Owaissa');
    expect(houseBefore).toBe('rogue-owaissa');

    await commitToSave(page);
    const blob = await page.evaluate(() => SugarCube.Save.serialize());
    await resetGame(page);
    await page.evaluate(b => SugarCube.Save.deserialize(b), blob);

    expect(await callSetup(page, 'setup.Rogue.staticHouseId()')).toBe(houseBefore);
    expect(await callSetup(page, 'setup.Rogue.seed()')).toBe(seedBefore);
    expect(await callSetup(page, 'setup.Rogue.address().formatted')).toBe(labelBefore);
  });
});
