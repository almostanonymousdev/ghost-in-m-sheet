const { test, expect } = require('@playwright/test');
const { openGame, resetGame, callSetup, goToPassage, getVar } = require('./helpers');

/* CompanyRescue — the ambulance branch off an assaulted hunt end.
 *
 * Wiring under test (event-driven, see CompanyRescueController.js):
 *   1. setup.CompanyRescue subscribes to HUNT_END_ASSAULTED. On the
 *      scene-trigger emit (run still live) it rolls; a 30% hit *arms* a
 *      one-shot redirect. random() here is Math.random-backed (no seeded
 *      State PRNG), so a forced Math.random pins the branch -- same trick
 *      as hunt-controller.spec.js.
 *   2. The armed redirect fires on the player's next in-story link click:
 *      the assault passage opens, the player clicks to advance, and the
 *      click is diverted to CompanyRescue instead of expanding the scene.
 *   3. The lifecycle-settle emit from endHunt() (run already cleared) must
 *      NOT arm -- otherwise CompanyRescue's own endHunt would re-arm.
 *   4. CompanyRescueDischarge's final reveal owns the teardown: the medics
 *      keep every garment she's wearing (stealClothes -> loseAllStolen,
 *      i.e. treated as left in the haunted house, so they surface in the
 *      Bedroom buyback), the broken-neck penalty clears, lust zeroes,
 *      sanity tops out, and endHunt(false) closes the run.
 */
test.describe('CompanyRescue — ambulance rescue branch', () => {
  let page;

  test.beforeAll(async ({ browser }) => {
    page = await openGame(browser);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test.beforeEach(async () => {
    await resetGame(page);
    await page.waitForFunction(() => SugarCube.State.variables.mc != null);
    /* Engine.restart() doesn't re-eval controllers, so scrub the
       module-local redirect latch between tests. */
    await page.evaluate(() => SugarCube.setup.CompanyRescue.resetRedirect());
  });

  /* Pin Math.random; resetGame restores the snapshot before the next test. */
  async function forceRandom(value) {
    await page.evaluate((v) => {
      if (!window.__origMathRandom) window.__origMathRandom = Math.random;
      Math.random = () => v;
    }, value);
  }

  async function startActiveHunt() {
    await page.evaluate(() =>
      SugarCube.setup.HuntController.startHunt({ seed: 11, floorPlanOpts: { roomCount: 5 } }));
    expect(await callSetup(page, 'setup.HuntController.isActive()')).toBe(true);
  }

  async function emitAssaulted() {
    await page.evaluate(() =>
      SugarCube.setup.Hunt.emit(SugarCube.setup.Hunt.Event.HUNT_END_ASSAULTED));
  }

  // -----------------------------------------------------------------
  // Arming logic (driven straight off the bus)
  // -----------------------------------------------------------------

  test('a low roll on the scene-trigger emit arms the redirect', async () => {
    await startActiveHunt();
    await forceRandom(0); // 1, <= 30
    await emitAssaulted();
    expect(await callSetup(page, 'setup.CompanyRescue.isArmed()')).toBe(true);
  });

  test('a high roll on the scene-trigger emit does not arm', async () => {
    await startActiveHunt();
    await forceRandom(0.99); // 100, > 30
    await emitAssaulted();
    expect(await callSetup(page, 'setup.CompanyRescue.isArmed()')).toBe(false);
  });

  test('the lifecycle-settle emit (run already cleared) never arms', async () => {
    await startActiveHunt();
    await forceRandom(0); // would arm if it were eligible
    /* end() clears $run exactly as endHunt() does before its own emit. */
    await page.evaluate(() => {
      SugarCube.setup.HuntController.end();
      SugarCube.setup.Hunt.emit(SugarCube.setup.Hunt.Event.HUNT_END_ASSAULTED,
        { failureReason: 'caught' });
    });
    expect(await callSetup(page, 'setup.CompanyRescue.isArmed()')).toBe(false);
  });

  test('arming requires a live run -- a bare emit with no hunt is a no-op', async () => {
    await forceRandom(0);
    await emitAssaulted(); // no startActiveHunt: $run is null
    expect(await callSetup(page, 'setup.CompanyRescue.isArmed()')).toBe(false);
  });

  // -----------------------------------------------------------------
  // The assault passages emit + arm on render
  // -----------------------------------------------------------------

  for (const branch of ['HuntOverProwl', 'HuntOverSanity']) {
    test(`${branch} arms the redirect on render when the roll hits`, async () => {
      await startActiveHunt();
      await forceRandom(0);
      await goToPassage(page, branch); // real HUNT_END_ASSAULTED emit on render
      expect(await callSetup(page, 'setup.CompanyRescue.isArmed()')).toBe(true);
      /* Both branches keep $run alive after render (deferred / kept
         cleanup), so CompanyRescue can still run its own teardown. */
      expect(await callSetup(page, 'setup.HuntController.isActive()')).toBe(true);
    });
  }

  // -----------------------------------------------------------------
  // Next-click redirect, end to end
  // -----------------------------------------------------------------

  test('the next link click after an armed assault lands in CompanyRescue', async () => {
    await startActiveHunt();
    await forceRandom(0);
    /* HuntOverSanity renders exactly one "Next" linkreplace and no
       clothing/companion branching, so the click target is deterministic. */
    await goToPassage(page, 'HuntOverSanity');
    expect(await callSetup(page, 'setup.CompanyRescue.isArmed()')).toBe(true);

    await page.click('#passages a.macro-linkreplace');
    await page.waitForFunction(
      () => SugarCube.State.passage === 'CompanyRescue',
      null,
      { timeout: 3000 }
    );
    expect(await page.evaluate(() => SugarCube.State.passage)).toBe('CompanyRescue');
    /* The latch is one-shot. */
    expect(await callSetup(page, 'setup.CompanyRescue.isArmed()')).toBe(false);
    /* The run survives the divert so CompanyRescue's teardown can fire. */
    expect(await callSetup(page, 'setup.HuntController.isActive()')).toBe(true);
  });

  test('a high roll lets the next link click advance the assault normally', async () => {
    await startActiveHunt();
    await forceRandom(0.99);
    await goToPassage(page, 'HuntOverSanity');
    expect(await callSetup(page, 'setup.CompanyRescue.isArmed()')).toBe(false);

    /* No divert: the linkreplace expands in place, still HuntOverSanity. */
    await page.click('#passages a.macro-linkreplace');
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => SugarCube.State.passage)).toBe('HuntOverSanity');
  });

  // -----------------------------------------------------------------
  // Discharge teardown
  // -----------------------------------------------------------------

  test('CompanyRescueDischarge heals, takes every worn garment, and ends the hunt', async () => {
    await startActiveHunt();
    /* Dress her through the real equip flow (slot-1 paid pieces) so the
       rememberVar markers line up -- loseAllStolen only records lost,
       buyback-eligible pieces when a "no<key>" marker survives the steal,
       and only slot != 0 items are eligible. */
    await page.evaluate(() => {
      const W = SugarCube.setup.Wardrobe;
      const V = SugarCube.State.variables;
      function equipByKey(slotName, key) {
        const grp = W.groupForSlot(slotName);
        const item = grp.items.find((i) => i.key === key);
        W.equip(grp, item);
      }
      equipByKey('tshirt', 'tshirt1');
      equipByKey('bra', 'bra1');
      equipByKey('panties', 'panties1');
      equipByKey('jeans', 'jeans1');
      W.refreshAggregateStates();
      V.lostClothing = [];
      SugarCube.setup.Mc.setPenalized(true);
      SugarCube.setup.Mc.setLust(40);
      SugarCube.setup.Mc.setSanity(10);
    });
    await forceRandom(0); // deterministic stash slot

    await goToPassage(page, 'CompanyRescueDischarge');
    expect(await callSetup(page, 'setup.HuntController.isActive()')).toBe(true);

    /* Reveal the final clip + run the teardown <<silently>> block. The
       redirect latch is disarmed (no assault emit this test), so the click
       behaves normally. */
    await page.click('#passages a.macro-linkreplace');
    await page.waitForFunction(() => SugarCube.State.variables.run === null, null, { timeout: 3000 });

    // Injured status cleared.
    expect(await callSetup(page, 'setup.Mc.isPenalized()')).toBe(false);
    // Lust zeroed.
    expect(await callSetup(page, 'setup.Mc.lust()')).toBe(0);
    // Sanity topped out.
    const sanity = await callSetup(page, 'setup.Mc.sanity()');
    const sanityMax = await callSetup(page, 'setup.Mc.sanityMax()');
    expect(sanity).toBe(sanityMax);
    // Stolen flags cleared, and the four worn pieces are recorded as lost
    // (treated as left in the house) for the Bedroom buyback.
    expect(await callSetup(page, 'setup.Wardrobe.hasClothesStolen()')).toBe(false);
    const lost = await getVar(page, 'lostClothing');
    expect(lost).toEqual(expect.arrayContaining(
      ['tshirtState1', 'braState1', 'pantiesState1', 'jeansState1']
    ));
    // Hunt fully closed.
    expect(await getVar(page, 'huntMode')).toBe(await callSetup(page, 'setup.HuntController.HuntMode.NONE'));
  });
});
