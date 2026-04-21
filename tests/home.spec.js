const { test, expect } = require('@playwright/test');
const { openGame, resetGame, setVar, getVar, setHuntMode, getHuntMode, callSetup } = require('./helpers');

test.describe('Home Controller', () => {
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

  // --- isDressedForStreet ---

  test('isDressedForStreet true with default clothing (tshirt + jeans)', async () => {
    // act
    const result = await callSetup(page, 'setup.Home.isDressedForStreet()');

    // assert
    expect(result).toBe(true);
  });

  test('isDressedForStreet false without top', async () => {
    // arrange
    await setVar(page, 'tshirtState', 'not worn');

    // act
    const result = await callSetup(page, 'setup.Home.isDressedForStreet()');

    // assert
    expect(result).toBe(false);
  });

  test('isDressedForStreet false without any bottom', async () => {
    // arrange
    await setVar(page, 'jeansState', 'not worn');
    await setVar(page, 'skirtState', 'not bought');
    await setVar(page, 'shortsState', 'not bought');

    // act
    const result = await callSetup(page, 'setup.Home.isDressedForStreet()');

    // assert
    expect(result).toBe(false);
  });

  test('isDressedForStreet true with skirt instead of jeans', async () => {
    // arrange
    await setVar(page, 'jeansState', 'not worn');
    await setVar(page, 'skirtState', 'worn');

    // act
    const result = await callSetup(page, 'setup.Home.isDressedForStreet()');

    // assert
    expect(result).toBe(true);
  });

  test('isDressedForStreet true with shorts instead of jeans', async () => {
    // arrange
    await setVar(page, 'jeansState', 'not worn');
    await setVar(page, 'shortsState', 'worn');

    // act
    const result = await callSetup(page, 'setup.Home.isDressedForStreet()');

    // assert
    expect(result).toBe(true);
  });

  // --- isWearingUnderwear ---

  test('isWearingUnderwear true with both bra and panties', async () => {
    // act
    const result = await callSetup(page, 'setup.Home.isWearingUnderwear()');

    // assert
    expect(result).toBe(true);
  });

  test('isWearingUnderwear false without bra', async () => {
    // arrange
    await setVar(page, 'braState', 'not worn');

    // act
    const result = await callSetup(page, 'setup.Home.isWearingUnderwear()');

    // assert
    expect(result).toBe(false);
  });

  test('isWearingUnderwear false without panties', async () => {
    // arrange
    await setVar(page, 'pantiesState', 'not worn');

    // act
    const result = await callSetup(page, 'setup.Home.isWearingUnderwear()');

    // assert
    expect(result).toBe(false);
  });

  // --- canLeaveHome ---

  test('canLeaveHome true when dressed with underwear', async () => {
    // act
    const result = await callSetup(page, 'setup.Home.canLeaveHome()');

    // assert
    expect(result).toBe(true);
  });

  test('canLeaveHome false when naked', async () => {
    // arrange
    await setVar(page, 'tshirtState', 'not worn');

    // act
    const result = await callSetup(page, 'setup.Home.canLeaveHome()');

    // assert
    expect(result).toBe(false);
  });

  test('canLeaveHome false when dirty', async () => {
    // arrange
    await setVar(page, 'mc.dirty', 1);

    // act
    const result = await callSetup(page, 'setup.Home.canLeaveHome()');

    // assert
    expect(result).toBe(false);
  });

  test('canLeaveHome false without underwear at low corruption', async () => {
    // arrange
    await setVar(page, 'braState', 'not worn');
    await setVar(page, 'mc.corruption', 5);

    // act
    const result = await callSetup(page, 'setup.Home.canLeaveHome()');

    // assert
    expect(result).toBe(false);
  });

  test('canLeaveHome true without underwear at high corruption (>= 10)', async () => {
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

  test('leaveBlockerReason returns null when can leave', async () => {
    // act
    const result = await callSetup(page, 'setup.Home.leaveBlockerReason()');

    // assert
    expect(result).toBeNull();
  });

  test('leaveBlockerReason returns "naked" when undressed', async () => {
    // arrange
    await setVar(page, 'tshirtState', 'not worn');

    // act
    const result = await callSetup(page, 'setup.Home.leaveBlockerReason()');

    // assert
    expect(result).toBe('naked');
  });

  test('leaveBlockerReason returns "dirty" when dirty', async () => {
    // arrange
    await setVar(page, 'mc.dirty', 1);

    // act
    const result = await callSetup(page, 'setup.Home.leaveBlockerReason()');

    // assert
    expect(result).toBe('dirty');
  });

  test('leaveBlockerReason returns "underwear" when no underwear and low corruption', async () => {
    // arrange
    await setVar(page, 'braState', 'not worn');
    await setVar(page, 'mc.corruption', 0);

    // act
    const result = await callSetup(page, 'setup.Home.leaveBlockerReason()');

    // assert
    expect(result).toBe('underwear');
  });

  // --- Ghost hunting eligibility ---

  test('isNightForHunt true at hour >= 23', async () => {
    // arrange
    await setVar(page, 'hours', 23);

    // act
    const result = await callSetup(page, 'setup.Home.isNightForHunt()');

    // assert
    expect(result).toBe(true);
  });

  test('isNightForHunt false before 23', async () => {
    // arrange
    await setVar(page, 'hours', 22);

    // act
    const result = await callSetup(page, 'setup.Home.isNightForHunt()');

    // assert
    expect(result).toBe(false);
  });

  test('hasHuntContract true when ghostHuntingMode is 1', async () => {
    // arrange
    await setHuntMode(page, 1);

    // act
    const result = await callSetup(page, 'setup.Home.hasHuntContract()');

    // assert
    expect(result).toBe(true);
  });

  test('needsWitch true when ghostHuntingMode is 3', async () => {
    // arrange
    await setHuntMode(page, 3);

    // act
    const result = await callSetup(page, 'setup.Home.needsWitch()');

    // assert
    expect(result).toBe(true);
  });

  test('canGoHunting requires contract and dressed', async () => {
    // arrange
    await setHuntMode(page, 1);

    // act
    const result = await callSetup(page, 'setup.Home.canGoHunting()');

    // assert
    expect(result).toBe(true);
  });

  test('canGoHunting false without contract', async () => {
    // arrange
    await setHuntMode(page, 0);

    // act
    const result = await callSetup(page, 'setup.Home.canGoHunting()');

    // assert
    expect(result).toBe(false);
  });

  // --- Succubus events ---

  test('succubusCanKnock requires evening hours and high corruption', async () => {
    // arrange
    await setVar(page, 'hours', 19);
    await setVar(page, 'mc.corruption', 6);

    // act
    const result = await callSetup(page, 'setup.Home.succubusCanKnock()');

    // assert
    expect(result).toBe(true);
  });

  test('succubusCanKnock false outside 18-20 range', async () => {
    // arrange
    await setVar(page, 'hours', 17);
    await setVar(page, 'mc.corruption', 6);

    // act
    const result = await callSetup(page, 'setup.Home.succubusCanKnock()');

    // assert
    expect(result).toBe(false);
  });

  test('succubusCanKnock false with low corruption', async () => {
    // arrange
    await setVar(page, 'hours', 19);
    await setVar(page, 'mc.corruption', 5);

    // act
    const result = await callSetup(page, 'setup.Home.succubusCanKnock()');

    // assert
    expect(result).toBe(false);
  });

  test('succubusCanKnock false if succubus already encountered', async () => {
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

  test('tentaclesNapEventReady requires cursed item and high cooldown', async () => {
    // arrange
    await setVar(page, 'gotCursedItem', 1);
    await setVar(page, 'gotCursedItemEventCD', 2);

    // act
    const result = await callSetup(page, 'setup.Home.tentaclesNapEventReady()');

    // assert
    expect(result).toBe(true);
  });

  test('tentaclesNapEventReady false without cursed item', async () => {
    // arrange
    await setVar(page, 'gotCursedItem', 0);
    await setVar(page, 'gotCursedItemEventCD', 2);

    // act
    const result = await callSetup(page, 'setup.Home.tentaclesNapEventReady()');

    // assert
    expect(result).toBe(false);
  });

  test('tentaclesTVEventReady requires cooldown >= 3', async () => {
    // arrange
    await setVar(page, 'gotCursedItem', 1);
    await setVar(page, 'gotCursedItemEventCD', 3);

    // act
    const result = await callSetup(page, 'setup.Home.tentaclesTVEventReady()');

    // assert
    expect(result).toBe(true);
  });

  test('tentaclesSleepEventReady requires evening hours', async () => {
    // arrange
    await setVar(page, 'gotCursedItem', 1);
    await setVar(page, 'gotCursedItemEventCD', 1);
    await setVar(page, 'hours', 20);

    // act
    const result = await callSetup(page, 'setup.Home.tentaclesSleepEventReady()');

    // assert
    expect(result).toBe(true);
  });

  test('tentaclesSleepEventReady false during daytime', async () => {
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

  test('canSummonForExorcism true at stage 1 or 2 with no cooldown', async () => {
    // arrange
    await setVar(page, 'exorcismQuestStage', 1);
    await setVar(page, 'exorcismCD', 0);

    // act
    const atStage1 = await callSetup(page, 'setup.Home.canSummonForExorcism()');
    await setVar(page, 'exorcismQuestStage', 2);
    const atStage2 = await callSetup(page, 'setup.Home.canSummonForExorcism()');

    // assert
    expect(atStage1).toBe(true);
    expect(atStage2).toBe(true);
  });

  test('canSummonForExorcism false on cooldown', async () => {
    // arrange
    await setVar(page, 'exorcismQuestStage', 1);
    await setVar(page, 'exorcismCD', 1);

    // act
    const result = await callSetup(page, 'setup.Home.canSummonForExorcism()');

    // assert
    expect(result).toBe(false);
  });

  test('mareEventActive true when ghostMareEventStart >= 1', async () => {
    // arrange
    await setVar(page, 'ghostMareEventStart', 1);

    // act
    const atOne = await callSetup(page, 'setup.Home.mareEventActive()');
    await setVar(page, 'ghostMareEventStart', 3);
    const atThree = await callSetup(page, 'setup.Home.mareEventActive()');

    // assert
    expect(atOne).toBe(true);
    expect(atThree).toBe(true);
  });

  test('mareEventActive false when ghostMareEventStart is 0', async () => {
    // arrange
    await setVar(page, 'ghostMareEventStart', 0);

    // act
    const result = await callSetup(page, 'setup.Home.mareEventActive()');

    // assert
    expect(result).toBe(false);
  });

  test('useHolyWaterOnMare clears mare and holy water state', async () => {
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

  test('canUseHolyWaterOnMare requires holy water and active mare', async () => {
    // arrange
    await setVar(page, 'holyWaterIsCollected', 1);
    await setVar(page, 'ghostMareEventStart', 1);

    // act
    const result = await callSetup(page, 'setup.Home.canUseHolyWaterOnMare()');

    // assert
    expect(result).toBe(true);
  });

  test('canUseHolyWaterOnMare false without holy water', async () => {
    // arrange
    await setVar(page, 'holyWaterIsCollected', 0);
    await setVar(page, 'ghostMareEventStart', 1);

    // act
    const result = await callSetup(page, 'setup.Home.canUseHolyWaterOnMare()');

    // assert
    expect(result).toBe(false);
  });

  // --- Sleep effects ---

  test('applyFullRest restores all stats to max', async () => {
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

  test('applySleepPenalty caps sanity at 70 and restores energy', async () => {
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

  test('applyAssaultDebuff does not restore energy', async () => {
    // arrange
    await setVar(page, 'mc.energy', 2);

    // act
    await page.evaluate(() => SugarCube.setup.Home.applyAssaultDebuff());

    // assert
    expect(await getVar(page, 'mc.sanityMax')).toBe(70);
    expect(await getVar(page, 'mc.energy')).toBe(2);
  });

  test('applyMareWake low stage gives moderate debuff', async () => {
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

  test('applyMareWake high stage gives severe debuff', async () => {
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

  // --- Twins event ---

  test('twinsEventAvailable requires flag and no cooldown', async () => {
    // arrange
    await setVar(page, 'thetwinsevent', 1);
    await setVar(page, 'thetwinseventCD', 0);

    // act
    const result = await callSetup(page, 'setup.Home.twinsEventAvailable()');

    // assert
    expect(result).toBe(true);
  });

  test('twinsEventAvailable false on cooldown', async () => {
    // arrange
    await setVar(page, 'thetwinsevent', 1);
    await setVar(page, 'thetwinseventCD', 1);

    // act
    const result = await callSetup(page, 'setup.Home.twinsEventAvailable()');

    // assert
    expect(result).toBe(false);
  });

  test('twinsEventTriggered true when beauty roll <= mc beauty', async () => {
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

  test('canApplyMakeup requires not already applied and enough charges', async () => {
    // arrange
    await setVar(page, 'makeupApplied', 0);
    await setVar(page, 'makeupAmount', 3);

    // act
    const result = await callSetup(page, 'setup.Home.canApplyMakeup(2)');

    // assert
    expect(result).toBe(true);
  });

  test('canApplyMakeup false if already applied', async () => {
    // arrange
    await setVar(page, 'makeupApplied', 1);
    await setVar(page, 'makeupAmount', 3);

    // act
    const result = await callSetup(page, 'setup.Home.canApplyMakeup(1)');

    // assert
    expect(result).toBe(false);
  });

  test('canApplyMakeup false if not enough charges', async () => {
    // arrange
    await setVar(page, 'makeupApplied', 0);
    await setVar(page, 'makeupAmount', 1);

    // act
    const result = await callSetup(page, 'setup.Home.canApplyMakeup(2)');

    // assert
    expect(result).toBe(false);
  });
});
