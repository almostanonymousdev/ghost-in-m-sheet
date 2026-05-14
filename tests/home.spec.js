const { test, expect } = require('./fixtures');
const { setVar, getVar, setHuntMode, getHuntMode, callSetup, goToPassage } = require('./helpers');

test.describe('Home Controller', () => {
  // --- isDressedForStreet ---

  test('isDressedForStreet true with default clothing (tshirt + jeans)', async ({ game: page }) => {
    // act
    const result = await callSetup(page, 'setup.Wardrobe.isDressedForStreet()');

    // assert
    expect(result).toBe(true);
  });

  test('isDressedForStreet false without top', async ({ game: page }) => {
    // arrange
    await setVar(page, 'tshirtState', 'not worn');

    // act
    const result = await callSetup(page, 'setup.Wardrobe.isDressedForStreet()');

    // assert
    expect(result).toBe(false);
  });

  test('isDressedForStreet false without any bottom', async ({ game: page }) => {
    // arrange
    await setVar(page, 'jeansState', 'not worn');
    await setVar(page, 'skirtState', 'not bought');
    await setVar(page, 'shortsState', 'not bought');

    // act
    const result = await callSetup(page, 'setup.Wardrobe.isDressedForStreet()');

    // assert
    expect(result).toBe(false);
  });

  test('isDressedForStreet true with skirt instead of jeans', async ({ game: page }) => {
    // arrange
    await setVar(page, 'jeansState', 'not worn');
    await setVar(page, 'skirtState', 'worn');

    // act
    const result = await callSetup(page, 'setup.Wardrobe.isDressedForStreet()');

    // assert
    expect(result).toBe(true);
  });

  test('isDressedForStreet true with shorts instead of jeans', async ({ game: page }) => {
    // arrange
    await setVar(page, 'jeansState', 'not worn');
    await setVar(page, 'shortsState', 'worn');

    // act
    const result = await callSetup(page, 'setup.Wardrobe.isDressedForStreet()');

    // assert
    expect(result).toBe(true);
  });

  // --- isWearingUnderwear ---

  test('isWearingUnderwear true with both bra and panties', async ({ game: page }) => {
    // act
    const result = await callSetup(page, 'setup.Wardrobe.isWearingUnderwear()');

    // assert
    expect(result).toBe(true);
  });

  test('isWearingUnderwear false without bra', async ({ game: page }) => {
    // arrange
    await setVar(page, 'braState', 'not worn');

    // act
    const result = await callSetup(page, 'setup.Wardrobe.isWearingUnderwear()');

    // assert
    expect(result).toBe(false);
  });

  test('isWearingUnderwear false without panties', async ({ game: page }) => {
    // arrange
    await setVar(page, 'pantiesState', 'not worn');

    // act
    const result = await callSetup(page, 'setup.Wardrobe.isWearingUnderwear()');

    // assert
    expect(result).toBe(false);
  });

  // --- canLeaveHome ---

  test('canLeaveHome true when dressed with underwear', async ({ game: page }) => {
    // act
    const result = await callSetup(page, 'setup.Home.canLeaveHome()');

    // assert
    expect(result).toBe(true);
  });

  test('canLeaveHome false when naked', async ({ game: page }) => {
    // arrange
    await setVar(page, 'tshirtState', 'not worn');

    // act
    const result = await callSetup(page, 'setup.Home.canLeaveHome()');

    // assert
    expect(result).toBe(false);
  });

  test('canLeaveHome false when dirty', async ({ game: page }) => {
    // arrange
    await setVar(page, 'mc.dirty', 1);

    // act
    const result = await callSetup(page, 'setup.Home.canLeaveHome()');

    // assert
    expect(result).toBe(false);
  });

  test('canLeaveHome false without underwear at low corruption', async ({ game: page }) => {
    // arrange
    await setVar(page, 'braState', 'not worn');
    await setVar(page, 'mc.corruption', 5);

    // act
    const result = await callSetup(page, 'setup.Home.canLeaveHome()');

    // assert
    expect(result).toBe(false);
  });

  test('canLeaveHome true without underwear at high corruption (>= 10)', async ({ game: page }) => {
    // arrange
    await setVar(page, 'braState', 'not worn');
    await setVar(page, 'pantiesState', 'not worn');
    await setVar(page, 'mc.corruption', 10);

    // act
    const result = await callSetup(page, 'setup.Home.canLeaveHome()');

    // assert
    expect(result).toBe(true);
  });

  // --- leaveBlockerReason ---

  test('leaveBlockerReason returns null when can leave', async ({ game: page }) => {
    // act
    const result = await callSetup(page, 'setup.Home.leaveBlockerReason()');

    // assert
    expect(result).toBeNull();
  });

  test('leaveBlockerReason returns "naked" when undressed', async ({ game: page }) => {
    // arrange
    await setVar(page, 'tshirtState', 'not worn');

    // act
    const result = await callSetup(page, 'setup.Home.leaveBlockerReason()');

    // assert
    expect(result).toBe('naked');
  });

  test('leaveBlockerReason returns "dirty" when dirty', async ({ game: page }) => {
    // arrange
    await setVar(page, 'mc.dirty', 1);

    // act
    const result = await callSetup(page, 'setup.Home.leaveBlockerReason()');

    // assert
    expect(result).toBe('dirty');
  });

  test('leaveBlockerReason returns "underwear" when no underwear and low corruption', async ({ game: page }) => {
    // arrange
    await setVar(page, 'braState', 'not worn');
    await setVar(page, 'mc.corruption', 0);

    // act
    const result = await callSetup(page, 'setup.Home.leaveBlockerReason()');

    // assert
    expect(result).toBe('underwear');
  });

  // --- Ghost hunting eligibility ---

  test('isNightForHunt true at hour >= 23', async ({ game: page }) => {
    // arrange
    await setVar(page, 'hours', 23);

    // act
    const result = await callSetup(page, 'setup.Home.isNightForHunt()');

    // assert
    expect(result).toBe(true);
  });

  test('isNightForHunt false before 23', async ({ game: page }) => {
    // arrange
    await setVar(page, 'hours', 22);

    // act
    const result = await callSetup(page, 'setup.Home.isNightForHunt()');

    // assert
    expect(result).toBe(false);
  });

  test('isPossessed true when ghostHuntingMode is 3', async ({ game: page }) => {
    // arrange
    await setHuntMode(page, 3);

    // act
    const result = await callSetup(page, 'setup.Ghosts.isPossessed()');

    // assert
    expect(result).toBe(true);
  });

  // --- Succubus events ---

  test('succubusCanKnock requires evening hours and high corruption', async ({ game: page }) => {
    // arrange
    await setVar(page, 'hours', 19);
    await setVar(page, 'mc.corruption', 6);

    // act
    const result = await callSetup(page, 'setup.Home.succubusCanKnock()');

    // assert
    expect(result).toBe(true);
  });

  test('succubusCanKnock false outside 18-20 range', async ({ game: page }) => {
    // arrange
    await setVar(page, 'hours', 17);
    await setVar(page, 'mc.corruption', 6);

    // act
    const result = await callSetup(page, 'setup.Home.succubusCanKnock()');

    // assert
    expect(result).toBe(false);
  });

  test('succubusCanKnock false with low corruption', async ({ game: page }) => {
    // arrange
    await setVar(page, 'hours', 19);
    await setVar(page, 'mc.corruption', 5);

    // act
    const result = await callSetup(page, 'setup.Home.succubusCanKnock()');

    // assert
    expect(result).toBe(false);
  });

  test('succubusCanKnock false if succubus already encountered', async ({ game: page }) => {
    // arrange
    await setVar(page, 'hours', 19);
    await setVar(page, 'mc.corruption', 6);
    await setVar(page, 'succubus', 1);

    // act
    const result = await callSetup(page, 'setup.Home.succubusCanKnock()');

    // assert
    expect(result).toBe(false);
  });

  // --- Tentacles events ---

  test('tentaclesNapEventReady requires cursed item and high cooldown', async ({ game: page }) => {
    // arrange
    await setVar(page, 'gotCursedItem', 1);
    await setVar(page, 'gotCursedItemEventCD', 2);

    // act
    const result = await callSetup(page, 'setup.Home.tentaclesNapEventReady()');

    // assert
    expect(result).toBe(true);
  });

  test('tentaclesNapEventReady false without cursed item', async ({ game: page }) => {
    // arrange
    await setVar(page, 'gotCursedItem', 0);
    await setVar(page, 'gotCursedItemEventCD', 2);

    // act
    const result = await callSetup(page, 'setup.Home.tentaclesNapEventReady()');

    // assert
    expect(result).toBe(false);
  });

  test('tentaclesTVEventReady requires cooldown >= 3', async ({ game: page }) => {
    // arrange
    await setVar(page, 'gotCursedItem', 1);
    await setVar(page, 'gotCursedItemEventCD', 3);

    // act
    const result = await callSetup(page, 'setup.Home.tentaclesTVEventReady()');

    // assert
    expect(result).toBe(true);
  });

  test('tentaclesSleepEventReady requires evening hours', async ({ game: page }) => {
    // arrange
    await setVar(page, 'gotCursedItem', 1);
    await setVar(page, 'gotCursedItemEventCD', 1);
    await setVar(page, 'hours', 20);

    // act
    const result = await callSetup(page, 'setup.Home.tentaclesSleepEventReady()');

    // assert
    expect(result).toBe(true);
  });

  test('tentaclesSleepEventReady false during daytime', async ({ game: page }) => {
    // arrange
    await setVar(page, 'gotCursedItem', 1);
    await setVar(page, 'gotCursedItemEventCD', 1);
    await setVar(page, 'hours', 12);

    // act
    const result = await callSetup(page, 'setup.Home.tentaclesSleepEventReady()');

    // assert
    expect(result).toBe(false);
  });

  // --- Mare / exorcism ---

  test('canSummonForExorcism true at stage 1 or 2 with no cooldown', async ({ game: page }) => {
    // arrange
    await setVar(page, 'exorcismQuestStage', 1);
    await setVar(page, 'exorcism', 0);

    // act
    const atStage1 = await callSetup(page, 'setup.Home.canSummonForExorcism()');
    await setVar(page, 'exorcismQuestStage', 2);
    const atStage2 = await callSetup(page, 'setup.Home.canSummonForExorcism()');

    // assert
    expect(atStage1).toBe(true);
    expect(atStage2).toBe(true);
  });

  test('canSummonForExorcism false on cooldown', async ({ game: page }) => {
    // arrange
    await setVar(page, 'exorcismQuestStage', 1);
    await setVar(page, 'exorcism', 1);

    // act
    const result = await callSetup(page, 'setup.Home.canSummonForExorcism()');

    // assert
    expect(result).toBe(false);
  });

  test('mareEventActive true when ghostMareEventStart >= 1', async ({ game: page }) => {
    // arrange
    await setVar(page, 'ghostMareEventStart', 1);

    // act
    const atOne = await callSetup(page, 'setup.SpecialEvent.mareEventActive()');
    await setVar(page, 'ghostMareEventStart', 3);
    const atThree = await callSetup(page, 'setup.SpecialEvent.mareEventActive()');

    // assert
    expect(atOne).toBe(true);
    expect(atThree).toBe(true);
  });

  test('mareEventActive false when ghostMareEventStart is 0', async ({ game: page }) => {
    // arrange
    await setVar(page, 'ghostMareEventStart', 0);

    // act
    const result = await callSetup(page, 'setup.SpecialEvent.mareEventActive()');

    // assert
    expect(result).toBe(false);
  });

  test('useHolyWaterOnMare clears mare and holy water state', async ({ game: page }) => {
    // arrange
    await setVar(page, 'ghostMareEventStart', 2);
    await setVar(page, 'holyWaterIsCollected', 1);
    await setVar(page, 'ghostMareEventStage', 3);

    // act
    await page.evaluate(() => SugarCube.setup.Home.useHolyWaterOnMare());

    // assert
    expect(await getVar(page, 'ghostMareEventStart')).toBe(0);
    expect(await getVar(page, 'holyWaterIsCollected')).toBe(0);
    expect(await getVar(page, 'ghostMareEventStage')).toBe(0);
  });

  test('canUseHolyWaterOnMare requires holy water and active mare', async ({ game: page }) => {
    // arrange
    await setVar(page, 'holyWaterIsCollected', 1);
    await setVar(page, 'ghostMareEventStart', 1);

    // act
    const result = await callSetup(page, 'setup.Home.canUseHolyWaterOnMare()');

    // assert
    expect(result).toBe(true);
  });

  test('canUseHolyWaterOnMare false without holy water', async ({ game: page }) => {
    // arrange
    await setVar(page, 'holyWaterIsCollected', 0);
    await setVar(page, 'ghostMareEventStart', 1);

    // act
    const result = await callSetup(page, 'setup.Home.canUseHolyWaterOnMare()');

    // assert
    expect(result).toBe(false);
  });

  // --- Sleep effects ---

  test('applyFullRest restores all stats to max', async ({ game: page }) => {
    // arrange
    await setVar(page, 'mc.sanity', 30);
    await setVar(page, 'mc.energy', 2);
    await setVar(page, 'mc.lust', 50);

    // act
    await page.evaluate(() => SugarCube.setup.Home.applyFullRest());

    // assert
    expect(await getVar(page, 'mc.sanityMax')).toBe(100);
    expect(await getVar(page, 'mc.sanity')).toBe(100);
    expect(await getVar(page, 'mc.energy')).toBe(await getVar(page, 'mc.energyMax'));
    expect(await getVar(page, 'mc.lust')).toBe(0);
  });

  test('applySleepPenalty caps sanity at 70 and restores energy', async ({ game: page }) => {
    // arrange
    await setVar(page, 'mc.sanity', 100);
    await setVar(page, 'mc.energy', 2);

    // act
    await page.evaluate(() => SugarCube.setup.Home.applySleepPenalty());

    // assert
    expect(await getVar(page, 'mc.sanityMax')).toBe(70);
    const sanity = await getVar(page, 'mc.sanity');
    expect(sanity).toBeGreaterThanOrEqual(40);
    expect(sanity).toBeLessThanOrEqual(70);
    expect(await getVar(page, 'mc.energy')).toBe(await getVar(page, 'mc.energyMax'));
    const lust = await getVar(page, 'mc.lust');
    expect(lust).toBeGreaterThanOrEqual(30);
    expect(lust).toBeLessThanOrEqual(60);
  });

  test('applyAssaultDebuff does not restore energy', async ({ game: page }) => {
    // arrange
    await setVar(page, 'mc.energy', 2);

    // act
    await page.evaluate(() => SugarCube.setup.Home.applyAssaultDebuff());

    // assert
    expect(await getVar(page, 'mc.sanityMax')).toBe(70);
    expect(await getVar(page, 'mc.energy')).toBe(2);
  });

  test('applyMareWake low stage gives moderate debuff', async ({ game: page }) => {
    // arrange
    await setVar(page, 'ghostMareEventStage', 1);

    // act
    await page.evaluate(() => SugarCube.setup.Home.applyMareWake());

    // assert
    expect(await getVar(page, 'mc.sanityMax')).toBe(70);
    const sanity = await getVar(page, 'mc.sanity');
    expect(sanity).toBeGreaterThanOrEqual(50);
    expect(sanity).toBeLessThanOrEqual(70);
  });

  test('applyMareWake high stage gives severe debuff', async ({ game: page }) => {
    // arrange
    await setVar(page, 'ghostMareEventStage', 3);

    // act
    await page.evaluate(() => SugarCube.setup.Home.applyMareWake());

    // assert
    expect(await getVar(page, 'mc.sanityMax')).toBe(50);
    const sanity = await getVar(page, 'mc.sanity');
    expect(sanity).toBeGreaterThanOrEqual(30);
    expect(sanity).toBeLessThanOrEqual(49);
    const lust = await getVar(page, 'mc.lust');
    expect(lust).toBeGreaterThanOrEqual(60);
    expect(lust).toBeLessThanOrEqual(90);
  });

  // --- Sleep advance ---

  test('sleepAdvance advances time and triggers an autosave', async ({ game: page }) => {
    // arrange
    await page.evaluate(() => {
      SugarCube.State.variables.hours = 22;
      SugarCube.State.variables.minutes = 0;
      SugarCube.Save.browser.auto.clear();
    });
    expect(await page.evaluate(
      () => SugarCube.Save.browser.auto.entries().length
    )).toBe(0);

    // act: 4-hour sleep wraps past midnight
    const rollover = await page.evaluate(
      () => SugarCube.setup.Home.sleepAdvance(4)
    );
    // autosave is scheduled via setTimeout(..., 0) so we have to yield.
    await page.waitForFunction(
      () => SugarCube.Save.browser.auto.entries().length > 0
    );

    // assert
    expect(rollover).toBe(true);
    expect(await getVar(page, 'hours')).toBe(2);
    expect(await page.evaluate(
      () => SugarCube.Save.browser.auto.entries().length
    )).toBeGreaterThan(0);
  });

  test('sleepAdvance without midnight rollover still autosaves', async ({ game: page }) => {
    // arrange
    await page.evaluate(() => {
      SugarCube.State.variables.hours = 8;
      SugarCube.State.variables.minutes = 0;
      SugarCube.Save.browser.auto.clear();
    });

    // act: 4-hour sleep stays within the same day
    const rollover = await page.evaluate(
      () => SugarCube.setup.Home.sleepAdvance(4)
    );
    await page.waitForFunction(
      () => SugarCube.Save.browser.auto.entries().length > 0
    );

    // assert
    expect(rollover).toBe(false);
    expect(await getVar(page, 'hours')).toBe(12);
    expect(await page.evaluate(
      () => SugarCube.Save.browser.auto.entries().length
    )).toBeGreaterThan(0);
  });

  test('passage transitions outside of sleep do not autosave', async ({ game: page }) => {
    // arrange
    await page.evaluate(() => SugarCube.Save.browser.auto.clear());

    // act: navigate through several passages without calling sleepAdvance
    await goToPassage(page, 'Bedroom');
    await goToPassage(page, 'Bathroom');
    await goToPassage(page, 'Livingroom');
    await goToPassage(page, 'Bedroom');

    // assert: SugarCube's per-passage autosave is suppressed
    expect(await page.evaluate(
      () => SugarCube.Save.browser.auto.entries().length
    )).toBe(0);
  });

  // --- Alarm clock ---

  test('alarmEnabled defaults to false on a fresh game', async ({ game: page }) => {
    expect(await callSetup(page, 'setup.Home.alarmEnabled()')).toBe(false);
    expect(await callSetup(page, 'setup.Home.alarmHour()')).toBe(7);
  });

  test('setAlarm enables and stores the chosen hour', async ({ game: page }) => {
    await page.evaluate(() => SugarCube.setup.Home.setAlarm(6));
    expect(await callSetup(page, 'setup.Home.alarmEnabled()')).toBe(true);
    expect(await callSetup(page, 'setup.Home.alarmHour()')).toBe(6);
  });

  test('clearAlarm disables the alarm but keeps the last hour', async ({ game: page }) => {
    await page.evaluate(() => SugarCube.setup.Home.setAlarm(9));
    await page.evaluate(() => SugarCube.setup.Home.clearAlarm());
    expect(await callSetup(page, 'setup.Home.alarmEnabled()')).toBe(false);
    expect(await callSetup(page, 'setup.Home.alarmHour()')).toBe(9);
  });

  test('hoursUntilAlarm returns the gap to the alarm hour later today', async ({ game: page }) => {
    await setVar(page, 'hours', 23);
    await page.evaluate(() => SugarCube.setup.Home.setAlarm(7));
    expect(await callSetup(page, 'setup.Home.hoursUntilAlarm()')).toBe(8);
  });

  test('hoursUntilAlarm wraps past midnight when the alarm is later in the day', async ({ game: page }) => {
    await setVar(page, 'hours', 6);
    await page.evaluate(() => SugarCube.setup.Home.setAlarm(7));
    expect(await callSetup(page, 'setup.Home.hoursUntilAlarm()')).toBe(1);
  });

  test('hoursUntilAlarm returns a full day when the alarm hour matches now', async ({ game: page }) => {
    // Sleeping at 7:00 with the alarm set to 7 means waking 24 hours later,
    // not zero -- otherwise Time.sleepAdvanceHours(0) is a no-op nap.
    await setVar(page, 'hours', 7);
    await page.evaluate(() => SugarCube.setup.Home.setAlarm(7));
    expect(await callSetup(page, 'setup.Home.hoursUntilAlarm()')).toBe(24);
  });

  test('restHours falls back to a flat 8 when the alarm is off', async ({ game: page }) => {
    expect(await callSetup(page, 'setup.Home.restHours()')).toBe(8);
  });

  test('restHours honors the alarm when it is on', async ({ game: page }) => {
    await setVar(page, 'hours', 22);
    await page.evaluate(() => SugarCube.setup.Home.setAlarm(6));
    expect(await callSetup(page, 'setup.Home.restHours()')).toBe(8);
  });

  test('resolveSleepWake honors the alarm for the default rest branch', async ({ game: page }) => {
    await setVar(page, 'hours', 23);
    await page.evaluate(() => SugarCube.setup.Home.setAlarm(5));
    const result = await page.evaluate(() => SugarCube.setup.Home.resolveSleepWake('Bedroom'));
    expect(result.passage).toBe('Bedroom');
    expect(result.postWake).toBe('rest');
    expect(result.hours).toBe(6);
  });

  test('sleepAdvance always lands on HH:00 regardless of the alarm', async ({ game: page }) => {
    // Wakes — alarm-driven or 3-hour event partials — read cleaner
    // when minutes snap to 00, so sleepAdvance enforces that for
    // every caller.
    await setVar(page, 'hours', 22);
    await setVar(page, 'minutes', 37);
    await page.evaluate(() => SugarCube.setup.Home.sleepAdvance(3));
    expect(await getVar(page, 'hours')).toBe(1);
    expect(await getVar(page, 'minutes')).toBe(0);
  });

  test('resolveSleepWake leaves event branches at 3h even with alarm set', async ({ game: page }) => {
    // Alarm set: hunt-defeat / mareEnd / spirit are still 3-hour partial
    // sleeps cut short by the event, not full nights. Wraith is the only
    // catalogue ghost with a sleepPassage, so it's the branch we can
    // exercise here.
    // resolveSleepWake reads setup.Ghosts.active(), which in the unified hunt
    // mode comes from $run.ghostName -- a bare $hunt isn't enough, so we
    // start a real hunt with Wraith pinned.
    await page.evaluate(() => {
      SugarCube.setup.HuntController.startHunt({ seed: 1 });
      SugarCube.setup.HuntController.setField('ghostName', 'Wraith');
      const g = SugarCube.setup.Ghosts.getByName('Wraith');
      SugarCube.setup.HuntController.setField('evidence', g.evidence.map(e => e.id));
      SugarCube.setup.Ghosts.startHunt('Wraith');
    });
    await setVar(page, 'hours', 22);
    await page.evaluate(() => SugarCube.setup.Home.setAlarm(7));
    const fromDefeat = await page.evaluate(
      () => SugarCube.setup.Home.resolveSleepWake('HuntEnd')
    );
    expect(fromDefeat.hours).toBe(3);
    expect(fromDefeat.postWake).toBe('huntDefeat');
    await page.evaluate(() => SugarCube.setup.HuntController.end());
  });

  test('sleepAdvance to alarm wakes the MC at the configured hour', async ({ game: page }) => {
    await page.evaluate(() => {
      SugarCube.State.variables.hours = 23;
      SugarCube.State.variables.minutes = 0;
      SugarCube.Save.browser.auto.clear();
    });
    await page.evaluate(() => SugarCube.setup.Home.setAlarm(6));
    const hours = await page.evaluate(
      () => SugarCube.setup.Home.hoursUntilAlarm()
    );
    await page.evaluate(
      (n) => SugarCube.setup.Home.sleepAdvance(n),
      hours
    );
    expect(await getVar(page, 'hours')).toBe(6);
  });

  // --- Twins event ---

  test('twinsEventAvailable requires flag and no cooldown', async ({ game: page }) => {
    // arrange
    await setVar(page, 'twinsEventActive', 1);
    await setVar(page, 'twinsEvent', 0);

    // act
    const result = await callSetup(page, 'setup.Ghosts.twinsEventReady()');

    // assert
    expect(result).toBe(true);
  });

  test('twinsEventAvailable false on cooldown', async ({ game: page }) => {
    // arrange
    await setVar(page, 'twinsEventActive', 1);
    await setVar(page, 'twinsEvent', 1);

    // act
    const result = await callSetup(page, 'setup.Ghosts.twinsEventReady()');

    // assert
    expect(result).toBe(false);
  });

  test('weak Mirror branch clears twinsEventActive so it does not re-fire daily', async ({ game: page }) => {
    // Regression: the Mirror passage's weak branch (beauty roll beats MC) used
    // to set only $twinsEvent, leaving $twinsEventActive=1. ResetCooldowns
    // zeros the CD on every day-wrap, so the event re-fired every morning —
    // an infinite loop players can only escape by eventually rolling the full
    // event (TheTwinsEvent, which does clear both flags).
    await setVar(page, 'twinsEventActive', 1);
    await setVar(page, 'twinsEvent', 0);
    await setVar(page, 'mc.beauty', 10); // random(30,100) always beats this → weak branch
    await goToPassage(page, 'Mirror');
    await page.locator('.passage .macro-linkappend').filter({ hasText: 'through the glass' }).first().click();
    await page.waitForTimeout(100);

    expect(await getVar(page, 'twinsEventActive')).toBe(0);
    expect(await getVar(page, 'twinsEvent')).toBe(1);
  });

  test('twinsEventTriggered true when beauty roll <= mc beauty', async ({ game: page }) => {
    // arrange
    await setVar(page, 'mc.beauty', 50);

    // act
    const rollBelow = await callSetup(page, 'setup.Home.twinsEventTriggered(40)');
    const rollEqual = await callSetup(page, 'setup.Home.twinsEventTriggered(50)');
    const rollAbove = await callSetup(page, 'setup.Home.twinsEventTriggered(51)');

    // assert
    expect(rollBelow).toBe(true);
    expect(rollEqual).toBe(true);
    expect(rollAbove).toBe(false);
  });

  // --- Makeup ---

  test('canApplyMakeup requires not already applied and enough charges', async ({ game: page }) => {
    // arrange
    await setVar(page, 'makeupApplied', 0);
    await setVar(page, 'makeupAmount', 3);

    // act
    const result = await callSetup(page, 'setup.Home.canApplyMakeup(2)');

    // assert
    expect(result).toBe(true);
  });

  test('canApplyMakeup false if already applied', async ({ game: page }) => {
    // arrange
    await setVar(page, 'makeupApplied', 1);
    await setVar(page, 'makeupAmount', 3);

    // act
    const result = await callSetup(page, 'setup.Home.canApplyMakeup(1)');

    // assert
    expect(result).toBe(false);
  });

  test('canApplyMakeup false if not enough charges', async ({ game: page }) => {
    // arrange
    await setVar(page, 'makeupApplied', 0);
    await setVar(page, 'makeupAmount', 1);

    // act
    const result = await callSetup(page, 'setup.Home.canApplyMakeup(2)');

    // assert
    expect(result).toBe(false);
  });
});
