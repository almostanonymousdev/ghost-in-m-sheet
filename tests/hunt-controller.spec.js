const { test, expect } = require('@playwright/test');
const { openGame, resetGame, callSetup, goToPassage, getVar } = require('./helpers');

/* setup.HuntController is the rogue-run hunt facade. Public surface:
     - mode()                   'rogue' | null
     - isActive()               true iff a run is in flight
     - activeGhost()            Ghost instance or null
     - isGhostHere()            bool
     - isHuntActive()           per-tick chain gate (run + on RogueRun)
     - shouldStartRandomProwl()  CheckHuntStart gate
     - shouldTriggerSteal()     StealClothesEvent gate
     - huntOverPassage(reason)  routes sanity / exhaustion / time
                                runouts to RogueEnd with a failure stamp
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
    /* GhostStreet's rogueHuntCard gates the link behind setup.Mc.lvl() >= 4
       (new games start at lvl 0). resetGame only blocks until the first
       passage renders, which can race the $mc rebind, so wait for the
       variable bag before mutating. */
    await page.waitForFunction(() => SugarCube.State.variables.mc != null);
    await page.evaluate(() => { SugarCube.State.variables.mc.lvl = 4; });
  });

  /* The rogue card's link text is the per-cycle randomised street address.
     The card resolves it from setup.Rogue.nextSeed() (see
     widgetHauntedHouseStreet.tw), so the test must read from the same
     source -- not setup.Time.dailySeed(), which the card no longer uses
     after the address-update fix. Resolve it client-side and click. */
  async function clickRogueCard(page) {
    const rogueAddr = await page.evaluate(() =>
      SugarCube.setup.Rogue.addressFromSeed(SugarCube.setup.Rogue.nextSeed()).formatted
    );
    await page.locator('.passage')
      .getByText(rogueAddr, { exact: true })
      .first()
      .click();
    await page.waitForFunction(() => SugarCube.State.passage === 'RogueStart');
  }

  test('mode() returns null when no rogue run is active', async () => {
    expect(await callSetup(page, 'setup.HuntController.mode()')).toBeNull();
    expect(await callSetup(page, 'setup.HuntController.isActive()')).toBe(false);
    expect(await callSetup(page, 'setup.HuntController.activeGhost()')).toBeNull();
    expect(await callSetup(page, 'setup.HuntController.isGhostHere()')).toBe(false);
  });

  test('mode() returns "rogue" once a rogue run is rolled', async () => {
    await goToPassage(page, 'GhostStreet');
    await clickRogueCard(page);

    expect(await callSetup(page, 'setup.HuntController.mode()')).toBe('rogue');
    expect(await callSetup(page, 'setup.HuntController.isActive()')).toBe(true);

    const rogueGhostName = await callSetup(page, 'setup.Rogue.ghostName()');
    expect(rogueGhostName).toBeTruthy();
    expect(await callSetup(page, 'setup.HuntController.activeGhost().name')).toBe(rogueGhostName);
    expect(await callSetup(page, 'setup.Ghosts.active().name')).toBe(rogueGhostName);
  });

  test('isHuntActive() in rogue mode requires the player to be on RogueRun', async () => {
    await goToPassage(page, 'GhostStreet');
    await clickRogueCard(page);

    // Run is rolled but player is in the RogueStart lobby -- chain
    // shouldn't fire there.
    expect(await callSetup(page, 'setup.HuntController.isHuntActive()')).toBe(false);

    await page.locator('.passage').getByText('Enter the hunt', { exact: true }).first().click();
    await page.waitForFunction(() => SugarCube.State.passage === 'RogueRun');
    expect(await callSetup(page, 'setup.HuntController.isHuntActive()')).toBe(true);

    await goToPassage(page, 'CityMap');
    expect(await callSetup(page, 'setup.HuntController.isHuntActive()')).toBe(false);
  });

  test('huntOverPassage() stamps a failure reason and returns RogueEnd', async () => {
    expect(await callSetup(page, 'setup.HuntController.huntOverPassage("sanity")')).toBeNull();

    await goToPassage(page, 'GhostStreet');
    await clickRogueCard(page);

    expect(await callSetup(page, 'setup.HuntController.huntOverPassage("sanity")'))
      .toBe('RogueEnd');
    expect(await callSetup(page, 'setup.Rogue.field("outcome")')).toBe('failure');
    expect(await callSetup(page, 'setup.Rogue.field("failureReason")')).toBe('sanity');

    expect(await callSetup(page, 'setup.HuntController.huntOverPassage("exhaustion")'))
      .toBe('RogueEnd');
    expect(await callSetup(page, 'setup.Rogue.field("failureReason")')).toBe('exhaustion');

    expect(await callSetup(page, 'setup.HuntController.huntOverPassage("time")'))
      .toBe('RogueEnd');
    expect(await callSetup(page, 'setup.Rogue.field("failureReason")')).toBe('time');
  });

  test('huntCaughtPassage() stamps a caught failure and routes to RogueEnd', async () => {
    /* HuntEnd's <<huntEndExit>> widget delegates the post-scene exit
       target to this helper. Rogue mode stamps a "caught" failure and
       routes to RogueEnd. Outside a run, falls back to Sleep. */
    expect(await callSetup(page, 'setup.HuntController.huntCaughtPassage()')).toBe('Sleep');

    await goToPassage(page, 'GhostStreet');
    await clickRogueCard(page);

    expect(await callSetup(page, 'setup.HuntController.huntCaughtPassage()')).toBe('RogueEnd');
    expect(await callSetup(page, 'setup.Rogue.field("outcome")')).toBe('failure');
    expect(await callSetup(page, 'setup.Rogue.field("failureReason")')).toBe('caught');
  });

  test('shouldStartRandomProwl() fires in rogue when the predicate is met', async () => {
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

    // No active mode: predicate is suppressed.
    expect(await callSetup(page, 'setup.HuntController.shouldStartRandomProwl()')).toBe(false);

    // Rogue mode: pin the ghost to Shade so canProwl(sanity<=55) is met
    // regardless of seed.
    await page.evaluate(() => {
      SugarCube.setup.Rogue.startRogue({ seed: 1 });
      SugarCube.setup.Rogue.setField('ghostName', 'Shade');
    });
    await goToPassage(page, 'RogueRun');
    expect(await callSetup(page, 'setup.HuntController.shouldStartRandomProwl()')).toBe(true);

    await page.evaluate(() => window.__restoreRandom && window.__restoreRandom());
  });

  test('shouldTriggerSteal() opts ironclad out of the steal step', async () => {
    /* Only the ironclad static rogue house opts out via the catalogue's
       runsStealClothes:false flag. Procedural / other static rogue
       houses always answer with the predicate. */
    await page.evaluate(() => {
      SugarCube.setup.Rogue.startRogue({ seed: 1, staticHouseId: 'rogue-owaissa' });
      SugarCube.State.variables.stealChance = 100;
    });
    expect(await callSetup(page, 'setup.HuntController.shouldTriggerSteal()')).toBe(true);

    await page.evaluate(() => SugarCube.setup.Rogue.endRogue(false));
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({ seed: 1, staticHouseId: 'rogue-ironclad' }));
    await page.evaluate(() => { SugarCube.State.variables.stealChance = 100; });
    expect(await callSetup(page, 'setup.HuntController.shouldTriggerSteal()')).toBe(false);
  });

  test('onCaughtCleanup() clears stolen-garment flags in rogue without throwing', async () => {
    /* HuntEnd's bottom-of-passage cleanup goes through this helper.
       Rogue: no $hunt to mutate; cleanup still runs and clears the
       stolen-garment flags so the player walks out clean. */
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({ seed: 1 }));
    await page.evaluate(() => { SugarCube.State.variables.isClothesStolen = 1; });

    // Should not throw even with no $hunt object.
    await page.evaluate(() => SugarCube.setup.HuntController.onCaughtCleanup());
    expect(await callSetup(page, 'setup.Rogue.isRogue()')).toBe(true);
  });

  test('shuffleGhostRoom() respects ghost.staysInOneRoom (Goryo)', async () => {
    // Goryo's catalogue entry sets staysInOneRoom = true; the
    // controller bails before any roll happens.
    await page.evaluate(() => {
      SugarCube.setup.Rogue.startRogue({ seed: 1 });
      SugarCube.setup.Rogue.setField('ghostName', 'Goryo');
      SugarCube.State.variables.lastChangeIntervalRoom = '';
      SugarCube.State.variables.minutes = 25;
      Math.random = () => 0; // would otherwise fire the drift
    });
    await goToPassage(page, 'RogueRun');
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
    expect(await callSetup(page, 'setup.HuntController.mode()')).toBeNull();
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

  test('isGhostHere() follows the rogue lair-room comparison', async () => {
    await goToPassage(page, 'GhostStreet');
    await clickRogueCard(page);
    await page.locator('.passage')
      .getByText('Enter the hunt', { exact: true })
      .first()
      .click();
    await page.waitForFunction(() => SugarCube.State.passage === 'RogueRun');

    // Player starts in room_0 (hallway); lair is non-hallway.
    const lair = await callSetup(page, 'setup.Rogue.ghostRoomId()');
    expect(lair).not.toBe('room_0');
    expect(await callSetup(page, 'setup.HuntController.isGhostHere()')).toBe(false);

    // Walk into the lair, re-render RogueRun, expect true.
    await page.evaluate(id => SugarCube.setup.Rogue.setCurrentRoom(id), lair);
    await goToPassage(page, 'RogueRun');
    expect(await callSetup(page, 'setup.HuntController.isGhostHere()')).toBe(true);

    // Outside RogueRun, isGhostHere() falls back to false even when the
    // player record says they're in the lair -- the tool checks that
    // read this only fire on RogueRun.
    await goToPassage(page, 'CityMap');
    expect(await callSetup(page, 'setup.HuntController.isGhostHere()')).toBe(false);
  });

  test('realGhostName() returns the rogue ghost name (or empty when no run)', async () => {
    expect(await callSetup(page, 'setup.HuntController.realGhostName()')).toBe('');

    await goToPassage(page, 'GhostStreet');
    await clickRogueCard(page);
    const rogueGhost = await callSetup(page, 'setup.Rogue.ghostName()');
    expect(await callSetup(page, 'setup.HuntController.realGhostName()')).toBe(rogueGhost);
  });

  test('payoutForGuess() returns zero in rogue (ectoplasm is paid on RogueEnd)', async () => {
    expect(await callSetup(page, 'setup.HuntController.payoutForGuess(true)'))
      .toEqual({ money: 0, xp: 0 });

    await goToPassage(page, 'GhostStreet');
    await clickRogueCard(page);
    expect(await callSetup(page, 'setup.HuntController.payoutForGuess(true)'))
      .toEqual({ money: 0, xp: 0 });
    expect(await callSetup(page, 'setup.HuntController.payoutForGuess(false)'))
      .toEqual({ money: 0, xp: 0 });
  });
});
