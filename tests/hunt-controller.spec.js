const { test, expect } = require('@playwright/test');
const { openGame, resetGame, callSetup, goToPassage, getVar } = require('./helpers');

/* setup.HuntController is the hunt facade. Public surface:
     - isActive()               true iff a hunt is in flight
     - activeGhost()            Ghost instance or null
     - isGhostHere()            bool
     - isHuntActive()           per-tick chain gate (hunt + on HuntRun)
     - shouldStartRandomProwl()  CheckHuntStart gate
     - shouldTriggerSteal()     StealClothesEvent gate
     - huntOverPassage(reason)  routes sanity / exhaustion / time
                                runouts to HuntSummary with a failure stamp
   These tests pin the contract so a future caller can rely on the
   facade rather than checking $run by hand. */
test.describe('HuntController', () => {
  let page;

  test.beforeAll(async ({ browser }) => {
    page = await openGame(browser);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test.beforeEach(async () => {
    await resetGame(page);
    /* GhostStreet's huntCard gates the link behind setup.Mc.lvl() >= 4
       (new games start at lvl 0). resetGame only blocks until the first
       passage renders, which can race the $mc rebind, so wait for the
       variable bag before mutating. */
    await page.waitForFunction(() => SugarCube.State.variables.mc != null);
    await page.evaluate(() => { SugarCube.State.variables.mc.lvl = 4; });
  });

  /* The hunt card's link text is the per-cycle randomised street address.
     The card resolves it from setup.HuntController.nextSeed() (see
     widgetHauntedHouseStreet.tw), so the test must read from the same
     source -- not setup.Time.dailySeed(), which the card no longer uses
     after the address-update fix. Resolve it client-side and click. */
  async function clickHuntCard(page) {
    const huntAddr = await page.evaluate(() =>
      SugarCube.setup.HuntController.addressFromSeed(SugarCube.setup.HuntController.nextSeed()).formatted
    );
    await page.locator('.passage')
      .getByText(huntAddr, { exact: true })
      .first()
      .click();
    await page.waitForFunction(() => SugarCube.State.passage === 'HuntStart');
  }

  test('isActive() returns false when no hunt is active', async () => {
    expect(await callSetup(page, 'setup.HuntController.isActive()')).toBe(false);
    expect(await callSetup(page, 'setup.HuntController.activeGhost()')).toBeNull();
    expect(await callSetup(page, 'setup.HuntController.isGhostHere()')).toBe(false);
  });

  test('isActive() returns true once a hunt is rolled', async () => {
    await goToPassage(page, 'GhostStreet');
    await clickHuntCard(page);

    expect(await callSetup(page, 'setup.HuntController.isActive()')).toBe(true);

    const huntGhostName = await callSetup(page, 'setup.HuntController.ghostName()');
    expect(huntGhostName).toBeTruthy();
    expect(await callSetup(page, 'setup.HuntController.activeGhost().name')).toBe(huntGhostName);
    expect(await callSetup(page, 'setup.Ghosts.active().name')).toBe(huntGhostName);
  });

  test('isHuntActive() requires the player to be on HuntRun', async () => {
    await goToPassage(page, 'GhostStreet');
    await clickHuntCard(page);

    // Run is rolled but player is in the HuntStart lobby -- chain
    // shouldn't fire there.
    expect(await callSetup(page, 'setup.HuntController.isHuntActive()')).toBe(false);

    await page.locator('.passage').getByText('Enter the hunt', { exact: true }).first().click();
    await page.waitForFunction(() => SugarCube.State.passage === 'HuntRun');
    expect(await callSetup(page, 'setup.HuntController.isHuntActive()')).toBe(true);

    await goToPassage(page, 'CityMap');
    expect(await callSetup(page, 'setup.HuntController.isHuntActive()')).toBe(false);
  });

  test('huntOverPassage() stamps a failure reason and returns HuntSummary', async () => {
    expect(await callSetup(page, 'setup.HuntController.huntOverPassage("sanity")')).toBeNull();

    await goToPassage(page, 'GhostStreet');
    await clickHuntCard(page);

    expect(await callSetup(page, 'setup.HuntController.huntOverPassage("sanity")'))
      .toBe('HuntSummary');
    expect(await callSetup(page, 'setup.HuntController.field("outcome")')).toBe('failure');
    expect(await callSetup(page, 'setup.HuntController.field("failureReason")')).toBe('sanity');

    expect(await callSetup(page, 'setup.HuntController.huntOverPassage("exhaustion")'))
      .toBe('HuntSummary');
    expect(await callSetup(page, 'setup.HuntController.field("failureReason")')).toBe('exhaustion');

    expect(await callSetup(page, 'setup.HuntController.huntOverPassage("time")'))
      .toBe('HuntSummary');
    expect(await callSetup(page, 'setup.HuntController.field("failureReason")')).toBe('time');
  });

  test('huntCaughtPassage() stamps a caught failure and routes to HuntSummary', async () => {
    /* HuntEnd's <<huntEndExit>> widget delegates the post-scene exit
       target to this helper. Hunt mode stamps a "caught" failure and
       routes to HuntSummary. Outside a hunt, falls back to Sleep. */
    expect(await callSetup(page, 'setup.HuntController.huntCaughtPassage()')).toBe('Sleep');

    await goToPassage(page, 'GhostStreet');
    await clickHuntCard(page);

    expect(await callSetup(page, 'setup.HuntController.huntCaughtPassage()')).toBe('HuntSummary');
    expect(await callSetup(page, 'setup.HuntController.field("outcome")')).toBe('failure');
    expect(await callSetup(page, 'setup.HuntController.field("failureReason")')).toBe('caught');
  });

  test('shouldStartRandomProwl() fires when the predicate is met', async () => {
    /* Predicate: !prowlActivated && elapsedTimeProwl >= prowlTimeRemain
       && roll <= threshold && ghost.canProwl(mc). We pre-stamp
       prowlTimeRemain=0 so the timer is already past, lower MC sanity
       under the canProwl cutoff (<= 55), and patch Math.random to 0 so
       the threshold roll always passes. */
    await page.evaluate(() => {
      const V = SugarCube.State.variables;
      V.prowlActivated = 0;
      V.prowlTimeRemain = 0;
      V.elapsedTimeProwl = 0;
      V.prowlActivationTime = 0;
      V.mc.sanity = 30; // under every catalogue ghost's prowlCondition floor
      const _r = Math.random;
      Math.random = () => 0; // floor(0*101) = 0, well below threshold
      window.__restoreRandom = () => { Math.random = _r; };
    });

    // No active hunt: predicate is suppressed.
    expect(await callSetup(page, 'setup.HuntController.shouldStartRandomProwl()')).toBe(false);

    // Active hunt: pin the ghost to Shade so canProwl(sanity<=55) is met
    // regardless of seed.
    await page.evaluate(() => {
      SugarCube.setup.HuntController.startHunt({ seed: 1 });
      SugarCube.setup.HuntController.setField('ghostName', 'Shade');
    });
    await goToPassage(page, 'HuntRun');
    expect(await callSetup(page, 'setup.HuntController.shouldStartRandomProwl()')).toBe(true);

    await page.evaluate(() => window.__restoreRandom && window.__restoreRandom());
  });

  test('shouldTriggerSteal() opts ironclad out of the steal step', async () => {
    /* Only the ironclad static hunt house opts out via the catalogue's
       runsStealClothes:false flag. Procedural / other static hunt
       houses always answer with the predicate. */
    await page.evaluate(() => {
      SugarCube.setup.HuntController.startHunt({ seed: 1, staticHouseId: 'owaissa' });
      SugarCube.State.variables.stealChance = 100;
    });
    expect(await callSetup(page, 'setup.HuntController.shouldTriggerSteal()')).toBe(true);

    await page.evaluate(() => SugarCube.setup.HuntController.endHunt(false));
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1, staticHouseId: 'ironclad' }));
    await page.evaluate(() => { SugarCube.State.variables.stealChance = 100; });
    expect(await callSetup(page, 'setup.HuntController.shouldTriggerSteal()')).toBe(false);
  });

  test('onCaughtCleanup() clears stolen-garment flags without throwing', async () => {
    /* HuntEnd's bottom-of-passage cleanup goes through this helper.
       No $hunt to mutate; cleanup still runs and clears the
       stolen-garment flags so the player walks out clean. */
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1 }));
    await page.evaluate(() => { SugarCube.State.variables.isClothesStolen = 1; });

    // Should not throw even with no $hunt object.
    await page.evaluate(() => SugarCube.setup.HuntController.onCaughtCleanup());
    expect(await callSetup(page, 'setup.HuntController.isActive()')).toBe(true);
  });

  test('shuffleGhostRoom() respects ghost.staysInOneRoom (Goryo)', async () => {
    // Goryo's catalogue entry sets staysInOneRoom = true; the
    // controller bails before any roll happens.
    await page.evaluate(() => {
      SugarCube.setup.HuntController.startHunt({ seed: 1 });
      SugarCube.setup.HuntController.setField('ghostName', 'Goryo');
      SugarCube.State.variables.lastChangeIntervalRoom = '';
      SugarCube.State.variables.minutes = 25;
      Math.random = () => 0; // would otherwise fire the drift
    });
    await goToPassage(page, 'HuntRun');
    const before = await page.evaluate(
      () => SugarCube.State.variables.run.floorplan.spawnRoomId
    );
    await page.evaluate(() => SugarCube.setup.HuntController.shuffleGhostRoom());
    const after = await page.evaluate(
      () => SugarCube.State.variables.run.floorplan.spawnRoomId
    );
    expect(after).toBe(before);
  });

  test('shuffleGhostRoom() bails when no hunt is active', async () => {
    // No run -> nothing to shuffle, no error.
    await page.evaluate(() => SugarCube.setup.HuntController.shuffleGhostRoom());
    expect(await callSetup(page, 'setup.HuntController.isActive()')).toBe(false);
  });

  test('driftChance() shrinks as MC beauty rises (ghost lingers near a prettier MC)', async () => {
    // Default beauty is 30 -> base 45% drift chance.
    await page.evaluate(() => SugarCube.setup.Mc.setBeauty(30));
    expect(await callSetup(page, 'setup.HuntController.driftChance()')).toBeCloseTo(0.45, 5);

    // 0.5% off per beauty point above 30.
    await page.evaluate(() => SugarCube.setup.Mc.setBeauty(50));
    expect(await callSetup(page, 'setup.HuntController.driftChance()')).toBeCloseTo(0.35, 5);

    await page.evaluate(() => SugarCube.setup.Mc.setBeauty(70));
    expect(await callSetup(page, 'setup.HuntController.driftChance()')).toBeCloseTo(0.25, 5);

    // Floored at 20% so the ghost can still wander in extreme cases.
    await page.evaluate(() => SugarCube.setup.Mc.setBeauty(200));
    expect(await callSetup(page, 'setup.HuntController.driftChance()')).toBeCloseTo(0.20, 5);

    // Below the 30-point baseline: chance stays at the base (no bonus).
    await page.evaluate(() => SugarCube.setup.Mc.setBeauty(0));
    expect(await callSetup(page, 'setup.HuntController.driftChance()')).toBeCloseTo(0.45, 5);
  });

  test('isGhostHere() follows the lair-room comparison', async () => {
    await goToPassage(page, 'GhostStreet');
    await clickHuntCard(page);
    await page.locator('.passage')
      .getByText('Enter the hunt', { exact: true })
      .first()
      .click();
    await page.waitForFunction(() => SugarCube.State.passage === 'HuntRun');

    // Player starts in room_0 (hallway); lair is non-hallway.
    const lair = await callSetup(page, 'setup.HuntController.ghostRoomId()');
    expect(lair).not.toBe('room_0');
    expect(await callSetup(page, 'setup.HuntController.isGhostHere()')).toBe(false);

    // Walk into the lair, re-render HuntRun, expect true.
    await page.evaluate(id => SugarCube.setup.HuntController.setCurrentRoom(id), lair);
    await goToPassage(page, 'HuntRun');
    expect(await callSetup(page, 'setup.HuntController.isGhostHere()')).toBe(true);

    // Outside HuntRun, isGhostHere() falls back to false even when the
    // player record says they're in the lair -- the tool checks that
    // read this only fire on HuntRun.
    await goToPassage(page, 'CityMap');
    expect(await callSetup(page, 'setup.HuntController.isGhostHere()')).toBe(false);
  });

  test('realGhostName() returns the active ghost name (or empty when no run)', async () => {
    expect(await callSetup(page, 'setup.HuntController.realGhostName()')).toBe('');

    await goToPassage(page, 'GhostStreet');
    await clickHuntCard(page);
    const huntGhost = await callSetup(page, 'setup.HuntController.ghostName()');
    expect(await callSetup(page, 'setup.HuntController.realGhostName()')).toBe(huntGhost);
  });

});
