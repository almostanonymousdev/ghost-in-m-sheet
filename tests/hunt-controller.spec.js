const { test, expect } = require('@playwright/test');
const { openGame, resetGame, callSetup, goToPassage, getVar } = require('./helpers');

/* setup.HuntController is the hunt facade. Public surface:
     - isActive()               true iff a hunt is in flight
     - activeGhost()            Ghost instance or null
     - isGhostHere()            bool
     - isHuntActive()           per-tick chain gate (hunt + on HuntRun)
     - shouldStartProwl()       hunt-tick-chain prowl gate
     - shouldTriggerSteal()     hunt-tick-chain steal-clothes gate
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
    /* GhostStreet's huntCard is hidden until the witch's ectoplasm-
       unlock quest is complete (new games start with the quest
       NOT_OFFERED). resetGame only blocks until the first passage
       renders, which can race the $mc rebind, so wait for the
       variable bag before mutating. */
    await page.waitForFunction(() => SugarCube.State.variables.mc != null);
    await page.evaluate(() => {
      SugarCube.State.variables.mc.lvl = 4;
      SugarCube.setup.Witch.completeEctoplasmQuest();
    });
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
    expect(await callSetup(page, 'setup.HuntController.activeGhost().name')).toBe(huntGhostName);
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

  test('huntOverPassage() stamps a failure reason and routes to the matching HuntOver* passage', async () => {
    /* The helper now settles the run itself (endHunt) before
       returning a goto target, so each branch needs a fresh hunt. */
    expect(await callSetup(page, 'setup.HuntController.huntOverPassage("sanity")')).toBeNull();

    await goToPassage(page, 'GhostStreet');
    await clickHuntCard(page);
    expect(await callSetup(page, 'setup.HuntController.huntOverPassage("sanity")'))
      .toBe('HuntOverSanity');
    expect(await callSetup(page, 'setup.HuntController.isActive()')).toBe(false);

    await goToPassage(page, 'GhostStreet');
    await clickHuntCard(page);
    expect(await callSetup(page, 'setup.HuntController.huntOverPassage("exhaustion")'))
      .toBe('HuntOverExhaustion');

    await goToPassage(page, 'GhostStreet');
    await clickHuntCard(page);
    expect(await callSetup(page, 'setup.HuntController.huntOverPassage("time")'))
      .toBe('HuntOverTime');
  });

  test('huntCaughtPassage() stamps a caught failure and routes to Sleep', async () => {
    /* HuntOverProwl's <<huntBlackoutExit>> widget delegates the post-scene exit
       target to this helper. Hunt mode stamps a "caught" failure,
       settles the run via endHunt, and routes to Sleep -- the
       blackout narration ("fading into darkness") flows straight into
       the bedroom cum-covered wake-up (Bedroom.returningFromHuntDefeat).
       Outside a hunt, also falls back to Sleep. */
    expect(await callSetup(page, 'setup.HuntController.huntCaughtPassage()')).toBe('Sleep');

    await goToPassage(page, 'GhostStreet');
    await clickHuntCard(page);

    expect(await callSetup(page, 'setup.HuntController.huntCaughtPassage()')).toBe('Sleep');
    expect(await callSetup(page, 'setup.HuntController.isActive()')).toBe(false);
  });

  test('shouldStartProwl() fires when the predicate is met', async () => {
    /* Predicate: !prowlActivated && elapsedTimeProwl >= prowlTimeRemain
       && roll <= threshold && ghost.canProwl(mc). We pre-stamp
       prowlTimeRemain=0 so the timer is already past, lower MC sanity
       under the canProwl cutoff (<= 55), and patch Math.random to 0 so
       the threshold roll always passes. */
    await page.evaluate(() => {
      const V = SugarCube.State.variables;
      V.prowlActivated = false;
      V.prowlTimeRemain = 0;
      V.elapsedTimeProwl = 0;
      V.prowlActivationTime = 0;
      V.mc.sanity = 30; // under every catalogue ghost's prowlCondition floor
      const _r = Math.random;
      Math.random = () => 0; // floor(0*101) = 0, well below threshold
      window.__restoreRandom = () => { Math.random = _r; };
    });

    // No active hunt: predicate is suppressed.
    expect(await callSetup(page, 'setup.HuntController.shouldStartProwl()')).toBe(false);

    // Active hunt: pin the ghost to Shade so canProwl(sanity<=55) is met
    // regardless of seed.
    await page.evaluate(() => {
      SugarCube.setup.HuntController.startHunt({ seed: 1 });
      SugarCube.setup.HuntController.setField('ghostName', 'Shade');
    });
    await goToPassage(page, 'HuntRun');
    expect(await callSetup(page, 'setup.HuntController.shouldStartProwl()')).toBe(true);

    await page.evaluate(() => window.__restoreRandom && window.__restoreRandom());
  });

  test('shouldTriggerSteal() opts ironclad out of the steal step', async () => {
    /* Ironclad's catalogue entry forces the no_clothes_theft modifier
       at startHunt, whose STEAL_CHECK subscriber sets ctx.suppress=true.
       Procedural / other static hunt houses always answer with the
       predicate. */
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
    /* HuntOverProwl's bottom-of-passage cleanup goes through this helper.
       The per-piece stolen flags (isPantiesStolen, etc.) should fold
       back through the wardrobe-restore flow without throwing, even
       when none are set. */
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1 }));
    await page.evaluate(() => { SugarCube.State.variables.isPantiesStolen = true; });

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
      // Past the drift deadline (totalMinutes() = 25, deadline = 0)
      // so a non-Goryo ghost would otherwise roll a drift here.
      SugarCube.State.variables.nextDriftAtMinute = 0;
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

  test('startHunt seeds the drift deadline so the first tick does not drift', async () => {
    // Regression: the 'It Moved' (disc.drift) achievement was firing
    // immediately on hunt start because the drift deadline was never
    // initialized -- the first shuffleGhostRoom() pass would fall
    // through the interval check and roll the drift.
    await page.evaluate(() => {
      SugarCube.setup.HuntController.startHunt({ seed: 7 });
      // Force the random roll so a drift WOULD happen if the gate
      // weren't seeded.
      Math.random = () => 0;
    });
    const before = await page.evaluate(
      () => SugarCube.State.variables.run.floorplan.spawnRoomId
    );
    await page.evaluate(() => SugarCube.setup.HuntController.shuffleGhostRoom());
    const after = await page.evaluate(
      () => SugarCube.State.variables.run.floorplan.spawnRoomId
    );
    expect(after).toBe(before);
  });

  test('drift deadline is re-rolled inside 15-35 minutes after each shuffle', async () => {
    // Each shuffleGhostRoom pass reschedules the next deadline at
    // totalMinutes() + Rng.intInclusive(15, 35), so a player can't
    // time movements off a fixed 20-minute cadence.
    await page.evaluate(() => {
      SugarCube.setup.HuntController.startHunt({ seed: 11 });
      SugarCube.setup.HuntController.setField('ghostName', 'Spirit');
    });
    // shuffleGhostRoom gates on passage() === 'HuntRun'; without it
    // the function bails before the reroll.
    await goToPassage(page, 'HuntRun');

    /* Sample the reschedule with a varying RNG so every offset in
       [15, 35] gets exercised. The drift-vs-skip roll inside
       shuffleGhostRoom consumes one Math.random call before the
       reroll, so we cycle through enough phases to land both above
       and below driftChance() and to cover the full int range. */
    const samples = await page.evaluate(() => {
      var picks = [];
      var seq = 0;
      // 21 samples × 2 random calls per pass = enough to hit every
      // integer in [0, 20] for the reroll path.
      Math.random = function () {
        var v = (seq % 42) / 41;
        seq++;
        return v;
      };
      for (var i = 0; i < 21; i++) {
        SugarCube.State.variables.hours = 0;
        SugarCube.State.variables.minutes = 0;
        SugarCube.State.variables.nextDriftAtMinute = 0;
        SugarCube.setup.HuntController.shuffleGhostRoom();
        picks.push(SugarCube.State.variables.nextDriftAtMinute);
      }
      return picks;
    });

    samples.forEach((offset, i) => {
      expect(offset, `sample ${i} offset out of [15,35]`).toBeGreaterThanOrEqual(15);
      expect(offset, `sample ${i} offset out of [15,35]`).toBeLessThanOrEqual(35);
    });
    // Spread check: more than one distinct offset across the samples
    // (a degenerate fixed roll would all collapse to the same value).
    const distinct = new Set(samples);
    expect(distinct.size).toBeGreaterThan(1);
  });

  test('shuffleGhostRoom does nothing until the clock crosses the drift deadline', async () => {
    await page.evaluate(() => {
      SugarCube.setup.HuntController.startHunt({ seed: 13 });
      SugarCube.setup.HuntController.setField('ghostName', 'Spirit');
    });
    // shuffleGhostRoom gates on passage() === 'HuntRun'.
    await goToPassage(page, 'HuntRun');
    await page.evaluate(() => {
      // Park the clock 5 minutes shy of the deadline -- the shuffle
      // must bail without re-rolling the deadline or moving the ghost.
      SugarCube.State.variables.hours = 0;
      SugarCube.State.variables.minutes = 10;
      SugarCube.State.variables.nextDriftAtMinute = 15;
      // Would otherwise fire if the gate let us through.
      Math.random = () => 0;
    });
    const beforeRoom = await page.evaluate(
      () => SugarCube.State.variables.run.floorplan.spawnRoomId
    );
    await page.evaluate(() => SugarCube.setup.HuntController.shuffleGhostRoom());
    const afterRoom = await page.evaluate(
      () => SugarCube.State.variables.run.floorplan.spawnRoomId
    );
    const afterDeadline = await page.evaluate(
      () => SugarCube.State.variables.nextDriftAtMinute
    );
    expect(afterRoom).toBe(beforeRoom);
    expect(afterDeadline).toBe(15);
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

    // Pick a non-lair room so the initial false-check is meaningful
    // regardless of which room the seed dropped the ghost into.
    const lair = await callSetup(page, 'setup.HuntController.ghostRoomId()');
    const nonLair = await page.evaluate(l => {
      const fp = SugarCube.State.variables.run.floorplan;
      const other = fp.rooms.find(r => r.id !== l);
      return other ? other.id : null;
    }, lair);
    expect(nonLair).not.toBeNull();
    await page.evaluate(id => SugarCube.setup.HuntController.setCurrentRoom(id), nonLair);
    await goToPassage(page, 'HuntRun');
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

  test('cursedItem loot slots stay inert until Khadija opens the quest', async () => {
    // Regression: cursed sex toys were showing up in furniture during
    // hunts before the witch had even mentioned the quest. The
    // floor-plan generator still stamps a cursedItem slot at hunt
    // start, but lootKindsAt should filter it out until
    // setup.Witch.cursedItemQuestStarted() is true.
    await page.evaluate(() => {
      SugarCube.setup.HuntController.startHunt({ seed: 13 });
    });

    // Fresh save: gotCursedItem is undefined, quest not started.
    expect(await callSetup(page, 'setup.Witch.cursedItemQuestStarted()')).toBe(false);

    const ciSlot = await page.evaluate(() => {
      var run = SugarCube.State.variables.run;
      var roomId = run.floorplan.loot.cursedItem;
      var suffix = run.floorplan.lootFurniture.cursedItem;
      return roomId ? { room: roomId, suffix: suffix } : null;
    });
    expect(ciSlot).not.toBeNull();

    // With the quest still locked, the slot reads as empty.
    const kindsBefore = await page.evaluate(s =>
      SugarCube.setup.HuntController.lootKindsAt(s.room, s.suffix),
      ciSlot
    );
    expect(kindsBefore).not.toContain('cursedItem');

    // Opening the quest (Khadija sets gotCursedItem = 0) flips the gate.
    await page.evaluate(() => SugarCube.setup.Witch.clearCursedItemHeld());
    expect(await callSetup(page, 'setup.Witch.cursedItemQuestStarted()')).toBe(true);

    const kindsAfter = await page.evaluate(s =>
      SugarCube.setup.HuntController.lootKindsAt(s.room, s.suffix),
      ciSlot
    );
    expect(kindsAfter).toContain('cursedItem');
  });

});
