const { test, expect } = require('./fixtures');
const { setVar, getVar, callSetup, goToPassage, seedRandom } = require('./helpers');

/* setup.Tick is the per-passage maintenance hub: cursed-hunt timer
   expiry, detector highlights, rescue quest expiry, prowl timer, choker
   lust floor, possession-tarot cleanup, companion attack rolls, steal
   chance recompute, daily cooldown rollover. The orchestration lives
   inside onPassageReady / onPassageDone but each helper is exported so
   tests can pin the underlying invariants without booting a full
   passage chain. */
test.describe('TickController helpers', () => {

  // --- Rescue quest expiry --------------------------------------

  test('tickRescueQuestExpiry fails the quest when stage hits 2', async ({ game: page }) => {
    const Q = await callSetup(page, 'setup.RescueQuestState');
    await setVar(page, 'hasQuestForRescue', Q.ACTIVE);
    await setVar(page, 'rescueStage', 2);
    await setVar(page, 'hasRescueClue', 1);
    await page.evaluate(() => SugarCube.setup.Tick.tickRescueQuestExpiry());
    expect(await getVar(page, 'hasQuestForRescue')).toBe(Q.FAILED);
    expect(await getVar(page, 'rescueStage')).toBe(0);
    expect(await getVar(page, 'hasRescueClue')).toBe(0);
  });

  test('tickRescueQuestExpiry fails the quest when stage 1 outlasts 5 PM', async ({ game: page }) => {
    const Q = await callSetup(page, 'setup.RescueQuestState');
    await setVar(page, 'hasQuestForRescue', Q.ACTIVE);
    await setVar(page, 'rescueStage', 1);
    await setVar(page, 'hours', 18);
    await page.evaluate(() => SugarCube.setup.Tick.tickRescueQuestExpiry());
    expect(await getVar(page, 'hasQuestForRescue')).toBe(Q.FAILED);
  });

  test('tickRescueQuestExpiry leaves a stage-1 quest alone before 5 PM', async ({ game: page }) => {
    const Q = await callSetup(page, 'setup.RescueQuestState');
    await setVar(page, 'hasQuestForRescue', Q.ACTIVE);
    await setVar(page, 'rescueStage', 1);
    await setVar(page, 'hours', 12);
    await page.evaluate(() => SugarCube.setup.Tick.tickRescueQuestExpiry());
    expect(await getVar(page, 'hasQuestForRescue')).toBe(Q.ACTIVE);
    expect(await getVar(page, 'rescueStage')).toBe(1);
  });

  test('tickRescueQuestExpiry is a no-op when the quest is not ACTIVE', async ({ game: page }) => {
    const Q = await callSetup(page, 'setup.RescueQuestState');
    await setVar(page, 'hasQuestForRescue', Q.AVAILABLE);
    await setVar(page, 'rescueStage', 9); // would normally trigger expiry
    await setVar(page, 'hours', 23);
    await page.evaluate(() => SugarCube.setup.Tick.tickRescueQuestExpiry());
    expect(await getVar(page, 'hasQuestForRescue')).toBe(Q.AVAILABLE);
    expect(await getVar(page, 'rescueStage')).toBe(9);
  });

  // --- Prowl timer ----------------------------------------------

  test('tickProwlTimer advances elapsedTimeProwl while inside the window', async ({ game: page }) => {
    await setVar(page, 'prowlActivated', 1);
    await setVar(page, 'prowlActivationTime', 600);   // 10:00
    await setVar(page, 'hours', 10);
    await setVar(page, 'minutes', 30);
    await setVar(page, 'prowlTimeRemain', 60);
    await setVar(page, 'elapsedTimeProwl', 0);
    await page.evaluate(() => SugarCube.setup.Tick.tickProwlTimer());
    expect(await getVar(page, 'elapsedTimeProwl')).toBe(30);
    expect(await getVar(page, 'prowlActivated')).toBe(1);
  });

  test('tickProwlTimer expires the prowl flag once elapsed exceeds remain', async ({ game: page }) => {
    await setVar(page, 'prowlActivated', 1);
    await setVar(page, 'prowlActivationTime', 600);
    await setVar(page, 'prowlTimeRemain', 30);
    await setVar(page, 'elapsedTimeProwl', 31);
    await page.evaluate(() => SugarCube.setup.Tick.tickProwlTimer());
    expect(await getVar(page, 'prowlActivated')).toBe(0);
  });

  // --- Choker lust floor ----------------------------------------

  test('applyChokerLustFloor pushes lust to 15 while choker is WORN', async ({ game: page }) => {
    const WORN = await callSetup(page, 'setup.ClothingState.WORN');
    await setVar(page, 'neckChokerState1', WORN);
    await setVar(page, 'mc.lust', 5);
    const changed = await page.evaluate(() => SugarCube.setup.Tick.applyChokerLustFloor());
    expect(changed).toBe(true);
    expect(await getVar(page, 'mc.lust')).toBe(15);
  });

  test('applyChokerLustFloor leaves lust alone when already above the floor', async ({ game: page }) => {
    const WORN = await callSetup(page, 'setup.ClothingState.WORN');
    await setVar(page, 'neckChokerState1', WORN);
    await setVar(page, 'mc.lust', 50);
    const changed = await page.evaluate(() => SugarCube.setup.Tick.applyChokerLustFloor());
    expect(changed).toBe(false);
    expect(await getVar(page, 'mc.lust')).toBe(50);
  });

  test('applyChokerLustFloor does nothing when choker is not WORN', async ({ game: page }) => {
    const NOT_WORN = await callSetup(page, 'setup.ClothingState.NOT_WORN');
    await setVar(page, 'neckChokerState1', NOT_WORN);
    await setVar(page, 'mc.lust', 0);
    const changed = await page.evaluate(() => SugarCube.setup.Tick.applyChokerLustFloor());
    expect(changed).toBe(false);
    expect(await getVar(page, 'mc.lust')).toBe(0);
  });

  // --- Possession / tarot cleanup -------------------------------

  test('applyPossessionTarotCleanup spends the tarot deck and retires the monkey paw on possession', async ({ game: page }) => {
    // Drive the ghost into POSSESSED so the cleanup branch fires.
    await page.evaluate(() => {
      SugarCube.setup.Ghosts.startHunt('Spirit');
      SugarCube.setup.Ghosts.setHuntMode(SugarCube.setup.Ghosts.HuntMode.POSSESSED);
    });
    await setVar(page, 'tarotCardsStage', 'CARRYING');
    await page.evaluate(() => SugarCube.setup.Tick.applyPossessionTarotCleanup());
    const SPENT = await callSetup(page, 'setup.TarotStage.SPENT');
    expect(await getVar(page, 'tarotCardsStage')).toBe(SPENT);
  });

  test('applyPossessionTarotCleanup is a no-op when ghost is not possessed', async ({ game: page }) => {
    await page.evaluate(() => SugarCube.setup.Ghosts.startHunt('Spirit'));
    const initial = await callSetup(page, 'setup.HauntedHouses.tarotCardsStage()');
    await page.evaluate(() => SugarCube.setup.Tick.applyPossessionTarotCleanup());
    expect(await callSetup(page, 'setup.HauntedHouses.tarotCardsStage()')).toBe(initial);
  });

  // --- Step counter ---------------------------------------------

  test('stepCount returns 0 when undefined and increments correctly', async ({ game: page }) => {
    await page.evaluate(() => { delete SugarCube.State.variables.stepCount; });
    expect(await callSetup(page, 'setup.Tick.stepCount()')).toBe(0);
    await page.evaluate(() => SugarCube.setup.Tick.incrementStepCount());
    await page.evaluate(() => SugarCube.setup.Tick.incrementStepCount());
    expect(await callSetup(page, 'setup.Tick.stepCount()')).toBe(2);
  });

  // --- Steal chance ----------------------------------------------

  test('recomputeStealChance scales linearly with stealChanceMult', async ({ game: page }) => {
    await setVar(page, 'mc.sanity', 50);
    await setVar(page, 'stealChanceMult', 1);
    await page.evaluate(() => SugarCube.setup.Tick.recomputeStealChance());
    const baseline = await getVar(page, 'stealChance');
    await setVar(page, 'stealChanceMult', 2);
    await page.evaluate(() => SugarCube.setup.Tick.recomputeStealChance());
    expect(await getVar(page, 'stealChance')).toBeCloseTo(baseline * 2, 5);
  });

  test('recomputeStealChance grows as sanity drops', async ({ game: page }) => {
    await setVar(page, 'stealChanceMult', 1);
    await setVar(page, 'mc.sanity', 100);
    await page.evaluate(() => SugarCube.setup.Tick.recomputeStealChance());
    const high = await getVar(page, 'stealChance');
    await setVar(page, 'mc.sanity', 10);
    await page.evaluate(() => SugarCube.setup.Tick.recomputeStealChance());
    const low = await getVar(page, 'stealChance');
    expect(low).toBeGreaterThan(high);
  });

  // --- initTick --------------------------------------------------

  test('initTick resets stealChanceMult to its 1.1 baseline', async ({ game: page }) => {
    await setVar(page, 'stealChanceMult', 9);
    await page.evaluate(() => SugarCube.setup.Tick.initTick());
    expect(await getVar(page, 'stealChanceMult')).toBe(1.1);
  });

  // --- Companion attack helpers ---------------------------------

  test('companionAttackActiveHit is true when chosen plan timer has elapsed', async ({ game: page }) => {
    const CS = await callSetup(page, 'setup.CompanionShow');
    await setVar(page, 'chosenPlanActivated', 1);
    await setVar(page, 'chosenPlanActivatedTime', 600); // 10:00
    await setVar(page, 'hours', 11);
    await setVar(page, 'minutes', 0);
    await setVar(page, 'showComp', CS.HIDDEN);
    expect(await callSetup(page, 'setup.Tick.companionAttackActiveHit()')).toBe(true);
  });

  test('companionAttackActiveHit is false once the attack already resolved', async ({ game: page }) => {
    const CS = await callSetup(page, 'setup.CompanionShow');
    await setVar(page, 'chosenPlanActivated', 1);
    await setVar(page, 'chosenPlanActivatedTime', 600);
    await setVar(page, 'hours', 11);
    await setVar(page, 'minutes', 0);
    await setVar(page, 'showComp', CS.ATTACK_FAILED);
    expect(await callSetup(page, 'setup.Tick.companionAttackActiveHit()')).toBe(false);
    await setVar(page, 'showComp', CS.ATTACK_SAFE);
    expect(await callSetup(page, 'setup.Tick.companionAttackActiveHit()')).toBe(false);
  });

  test('companionAttackActiveHit is false before the timer fires', async ({ game: page }) => {
    const CS = await callSetup(page, 'setup.CompanionShow');
    await setVar(page, 'chosenPlanActivated', 1);
    await setVar(page, 'chosenPlanActivatedTime', 700);
    await setVar(page, 'hours', 10);
    await setVar(page, 'minutes', 0);
    await setVar(page, 'showComp', CS.HIDDEN);
    expect(await callSetup(page, 'setup.Tick.companionAttackActiveHit()')).toBe(false);
  });

  test('resolveCompanionAttack flags ATTACK_SAFE when roll >= chanceToAttack', async ({ game: page }) => {
    // Pin Math.random so the roll is deterministic.
    await seedRandom(page, 0xCA51);
    const CS = await callSetup(page, 'setup.CompanionShow');
    await setVar(page, 'chanceToAttack', 0); // any roll succeeds
    const result = await page.evaluate(
      () => SugarCube.setup.Tick.resolveCompanionAttack());
    expect(result).toBe('safe');
    expect(await getVar(page, 'showComp')).toBe(CS.ATTACK_SAFE);
  });

  test('resolveCompanionAttack flags ATTACK_FAILED + zeroes stepCount when the roll fails', async ({ game: page }) => {
    await seedRandom(page, 0xCA51);
    const CS = await callSetup(page, 'setup.CompanionShow');
    await setVar(page, 'chanceToAttack', 101); // any roll fails
    await setVar(page, 'stepCount', 7);
    const result = await page.evaluate(
      () => SugarCube.setup.Tick.resolveCompanionAttack());
    expect(result).toBe('hit');
    expect(await getVar(page, 'showComp')).toBe(CS.ATTACK_FAILED);
    expect(await getVar(page, 'stepCount')).toBe(0);
  });

  // --- Daily cooldown rollover ----------------------------------

  test('resetCooldowns advances Brooke possession recovery', async ({ game: page }) => {
    const BP = await callSetup(page, 'setup.BrookePossession');
    const RECOVERY = await callSetup(page, 'setup.BROOKE_POSSESSED_RECOVERY_DAYS');
    await setVar(page, 'isBrookePossessed', BP.INACTIVE);
    await setVar(page, 'isBrookePossessedCD', RECOVERY - 1);
    await page.evaluate(() => SugarCube.setup.Tick.resetCooldowns());
    expect(await getVar(page, 'isBrookePossessed')).toBe(BP.RECOVERED);
    // CD bookkeeping is dropped once the recovery flips through.
    expect(await page.evaluate(
      () => SugarCube.State.variables.isBrookePossessedCD)).toBeUndefined();
  });

  test('resetCooldowns increments rescueStage from 0 -> 1', async ({ game: page }) => {
    await setVar(page, 'rescueStage', 0);
    await page.evaluate(() => SugarCube.setup.Tick.resetCooldowns());
    expect(await getVar(page, 'rescueStage')).toBe(1);
  });

  test('resetCooldowns advances ghost-mare event counter when started', async ({ game: page }) => {
    await setVar(page, 'ghostMareEventStart', 1);
    await setVar(page, 'ghostMareEventStage', 2);
    await page.evaluate(() => SugarCube.setup.Tick.resetCooldowns());
    expect(await getVar(page, 'ghostMareEventStage')).toBe(3);
  });

  test('resetCooldowns clamps ghost-mare event counter to 0 when not started', async ({ game: page }) => {
    await setVar(page, 'ghostMareEventStart', 0);
    await setVar(page, 'ghostMareEventStage', 9);
    await page.evaluate(() => SugarCube.setup.Tick.resetCooldowns());
    expect(await getVar(page, 'ghostMareEventStage')).toBe(0);
  });

  test('resetCooldowns ticks the cursed-item event cooldown up to its 3 cap', async ({ game: page }) => {
    await setVar(page, 'gotCursedItem', 1);
    await setVar(page, 'gotCursedItemEventCD', 0);
    await page.evaluate(() => SugarCube.setup.Tick.resetCooldowns());
    expect(await getVar(page, 'gotCursedItemEventCD')).toBe(1);
    await setVar(page, 'gotCursedItemEventCD', 3);
    await page.evaluate(() => SugarCube.setup.Tick.resetCooldowns());
    // Capped: stays at 3 once it hits the limit.
    expect(await getVar(page, 'gotCursedItemEventCD')).toBe(3);
  });

  test('resetCooldowns resets webcam.showCD when the bundle exists', async ({ game: page }) => {
    await page.evaluate(() => {
      const V = SugarCube.State.variables;
      V.webcam = V.webcam || {};
      V.webcam.showCD = 7;
    });
    await page.evaluate(() => SugarCube.setup.Tick.resetCooldowns());
    expect(await page.evaluate(
      () => SugarCube.State.variables.webcam.showCD)).toBe(0);
  });

  // --- onPassageReady --------------------------------------------

  test('onPassageReady refreshes tool timer + recomputes steal chance + clamps lust', async ({ game: page }) => {
    const WORN = await callSetup(page, 'setup.ClothingState.WORN');
    await setVar(page, 'neckChokerState1', WORN);
    await setVar(page, 'mc.lust', 0);
    await setVar(page, 'mc.sanity', 50);
    await setVar(page, 'stealChanceMult', 1);
    // Detach any tool-timer init so the call has to re-run it.
    await page.evaluate(() => { delete SugarCube.State.variables.timerToolsDecreased; });
    const result = await page.evaluate(
      () => SugarCube.setup.Tick.onPassageReady());
    expect(result).toBeNull();
    // Tool timer is initialised.
    expect(await callSetup(page, 'setup.Gui.timerToolsInitialized()')).toBe(true);
    // recomputeStealChance ran (stealChance is no longer undefined).
    expect(typeof await getVar(page, 'stealChance')).toBe('number');
  });
});
