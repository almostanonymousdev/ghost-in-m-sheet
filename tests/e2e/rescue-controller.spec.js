const { test, expect } = require('@playwright/test');
const { openGame, resetGame, setVar, getVar, callSetup } = require('../helpers');

test.describe('Missing Women — controller + church integration', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  // ── MissingWomen controller ────────────────────────────────────

  test('isQuestAvailable is true when hasQuestForRescue is 0', async () => {
    await setVar(page, 'hasQuestForRescue', 0);
    expect(await callSetup(page, 'setup.MissingWomen.isQuestAvailable()')).toBe(true);
  });

  test('hasActiveQuest is true when hasQuestForRescue is 1', async () => {
    await setVar(page, 'hasQuestForRescue', 1);
    expect(await callSetup(page, 'setup.MissingWomen.hasActiveQuest()')).toBe(true);
  });

  test('questFailed is true when hasQuestForRescue is 2', async () => {
    await setVar(page, 'hasQuestForRescue', 2);
    expect(await callSetup(page, 'setup.MissingWomen.questFailed()')).toBe(true);
  });

  test('questSucceeded is true when hasQuestForRescue is 3', async () => {
    await setVar(page, 'hasQuestForRescue', 3);
    expect(await callSetup(page, 'setup.MissingWomen.questSucceeded()')).toBe(true);
  });

  test('quest stages are mutually exclusive', async () => {
    await setVar(page, 'hasQuestForRescue', 1);
    expect(await callSetup(page, 'setup.MissingWomen.isQuestAvailable()')).toBe(false);
    expect(await callSetup(page, 'setup.MissingWomen.hasActiveQuest()')).toBe(true);
    expect(await callSetup(page, 'setup.MissingWomen.questFailed()')).toBe(false);
    expect(await callSetup(page, 'setup.MissingWomen.questSucceeded()')).toBe(false);
  });

  test('mustReturnToNun is true for stages 2 and 3', async () => {
    await setVar(page, 'hasQuestForRescue', 2);
    expect(await callSetup(page, 'setup.MissingWomen.mustReturnToNun()')).toBe(true);
    await setVar(page, 'hasQuestForRescue', 3);
    expect(await callSetup(page, 'setup.MissingWomen.mustReturnToNun()')).toBe(true);
    await setVar(page, 'hasQuestForRescue', 1);
    expect(await callSetup(page, 'setup.MissingWomen.mustReturnToNun()')).toBe(false);
    await setVar(page, 'hasQuestForRescue', 0);
    expect(await callSetup(page, 'setup.MissingWomen.mustReturnToNun()')).toBe(false);
  });

  test('boardPostingsOutToday is true between 18:00 and 23:59', async () => {
    await setVar(page, 'hours', 17);
    expect(await callSetup(page, 'setup.MissingWomen.boardPostingsOutToday()')).toBe(false);
    await setVar(page, 'hours', 18);
    expect(await callSetup(page, 'setup.MissingWomen.boardPostingsOutToday()')).toBe(true);
    await setVar(page, 'hours', 23);
    expect(await callSetup(page, 'setup.MissingWomen.boardPostingsOutToday()')).toBe(true);
    await setVar(page, 'hours', 0);
    expect(await callSetup(page, 'setup.MissingWomen.boardPostingsOutToday()')).toBe(false);
  });

  test('boardOnCooldown checks rescueQuest', async () => {
    await setVar(page, 'rescueQuest', 0);
    expect(await callSetup(page, 'setup.MissingWomen.boardOnCooldown()')).toBe(false);
    await setVar(page, 'rescueQuest', 1);
    expect(await callSetup(page, 'setup.MissingWomen.boardOnCooldown()')).toBe(true);
  });

  test('hasHolyWater and useHolyWater', async () => {
    await setVar(page, 'holyWaterIsCollected', 0);
    expect(await callSetup(page, 'setup.MissingWomen.hasHolyWater()')).toBe(false);
    await setVar(page, 'holyWaterIsCollected', 1);
    expect(await callSetup(page, 'setup.MissingWomen.hasHolyWater()')).toBe(true);
    await page.evaluate(() => SugarCube.setup.MissingWomen.useHolyWater());
    expect(await getVar(page, 'holyWaterIsCollected')).toBe(0);
  });

  test('isCorrectHouse compares rescueHouse to randomRescuePhotoNumber', async () => {
    await setVar(page, 'randomRescuePhotoNumber', 7);
    await setVar(page, 'rescueHouse',7);
    expect(await callSetup(page, 'setup.MissingWomen.isCorrectHouse()')).toBe(true);
    await setVar(page, 'rescueHouse',3);
    expect(await callSetup(page, 'setup.MissingWomen.isCorrectHouse()')).toBe(false);
  });

  test('canResolveRescue requires stage < 2, correct house, and active quest', async () => {
    await setVar(page, 'hasQuestForRescue', 1);
    await setVar(page, 'rescueStage', 0);
    await setVar(page, 'randomRescuePhotoNumber', 5);
    await setVar(page, 'rescueHouse',5);
    expect(await callSetup(page, 'setup.MissingWomen.canResolveRescue()')).toBe(true);
    await setVar(page, 'rescueHouse',3);
    expect(await callSetup(page, 'setup.MissingWomen.canResolveRescue()')).toBe(false);
    await setVar(page, 'rescueHouse',5);
    await setVar(page, 'rescueStage', 2);
    expect(await callSetup(page, 'setup.MissingWomen.canResolveRescue()')).toBe(false);
    await setVar(page, 'rescueStage', 0);
    await setVar(page, 'hasQuestForRescue', 0);
    expect(await callSetup(page, 'setup.MissingWomen.canResolveRescue()')).toBe(false);
  });

  test('canStaySubmissive requires corruption >= 6', async () => {
    await setVar(page, 'mc.corruption', 5);
    expect(await callSetup(page, 'setup.MissingWomen.canStaySubmissive()')).toBe(false);
    await setVar(page, 'mc.corruption', 6);
    expect(await callSetup(page, 'setup.MissingWomen.canStaySubmissive()')).toBe(true);
  });

  test('canSearchHouse requires energy >= 1', async () => {
    await setVar(page, 'mc.energy', 0);
    expect(await callSetup(page, 'setup.MissingWomen.canSearchHouse()')).toBe(false);
    await setVar(page, 'mc.energy', 1);
    expect(await callSetup(page, 'setup.MissingWomen.canSearchHouse()')).toBe(true);
  });

  test('rescueEventAuto is true when rescueStage is 0', async () => {
    await setVar(page, 'rescueStage', 0);
    expect(await callSetup(page, 'setup.MissingWomen.rescueEventAuto()')).toBe(true);
    await setVar(page, 'rescueStage', 1);
    expect(await callSetup(page, 'setup.MissingWomen.rescueEventAuto()')).toBe(false);
  });

  test('rescueEventRolls requires stage 1 and hours < 18', async () => {
    await setVar(page, 'rescueStage', 1);
    await setVar(page, 'hours', 12);
    expect(await callSetup(page, 'setup.MissingWomen.rescueEventRolls()')).toBe(true);
    await setVar(page, 'hours', 18);
    expect(await callSetup(page, 'setup.MissingWomen.rescueEventRolls()')).toBe(false);
    await setVar(page, 'hours', 12);
    await setVar(page, 'rescueStage', 0);
    expect(await callSetup(page, 'setup.MissingWomen.rescueEventRolls()')).toBe(false);
  });

  test('possessedPassageFor returns correct passage for each girl', async () => {
    for (const girl of ['Victoria', 'Jade', 'Julia', 'Nadia', 'Ash']) {
      expect(await callSetup(page, `setup.MissingWomen.possessedPassageFor("${girl}")`))
        .toBe('Rescue' + girl + 'Possessed');
    }
    expect(await callSetup(page, 'setup.MissingWomen.possessedPassageFor("Nobody")')).toBeNull();
  });

  // ── Church integration ─────────────────────────────────────────

  test('canStartNunQuest is true when quest is 0 and Rain not met', async () => {
    await setVar(page, 'hasQuestForRescue', 0);
    await page.evaluate(() => { delete SugarCube.State.variables.relationshipWithRain; });
    expect(await callSetup(page, 'setup.Church.canStartNunQuest()')).toBe(true);
  });

  test('canStartNunQuest is false after Rain is met', async () => {
    await setVar(page, 'hasQuestForRescue', 0);
    await setVar(page, 'relationshipWithRain', 0);
    expect(await callSetup(page, 'setup.Church.canStartNunQuest()')).toBe(false);
  });

  test('showMissingPersonsBoard requires Rain met and quest defined', async () => {
    await setVar(page, 'relationshipWithRain', 1);
    await setVar(page, 'hasQuestForRescue', 0);
    expect(await callSetup(page, 'setup.Church.showMissingPersonsBoard()')).toBe(true);
    await page.evaluate(() => { delete SugarCube.State.variables.hasQuestForRescue; });
    expect(await callSetup(page, 'setup.Church.showMissingPersonsBoard()')).toBe(false);
  });

  test('shouldRedirectToNunQuest is true when quest is 2 or 3', async () => {
    await setVar(page, 'hasQuestForRescue', 2);
    expect(await callSetup(page, 'setup.Church.shouldRedirectToNunQuest()')).toBe(true);
    await setVar(page, 'hasQuestForRescue', 3);
    expect(await callSetup(page, 'setup.Church.shouldRedirectToNunQuest()')).toBe(true);
    await setVar(page, 'hasQuestForRescue', 1);
    expect(await callSetup(page, 'setup.Church.shouldRedirectToNunQuest()')).toBe(false);
  });

  test('holy water available when Rain met and not already collected', async () => {
    await setVar(page, 'relationshipWithRain', 1);
    await setVar(page, 'holyWaterIsCollected', 0);
    expect(await callSetup(page, 'setup.Church.holyWaterAvailable()')).toBe(true);
    await setVar(page, 'holyWaterIsCollected', 1);
    expect(await callSetup(page, 'setup.Church.holyWaterAvailable()')).toBe(false);
  });

  test('collectHolyWater sets holyWaterIsCollected to 1', async () => {
    await setVar(page, 'holyWaterIsCollected', 0);
    await page.evaluate(() => SugarCube.setup.Church.collectHolyWater());
    expect(await getVar(page, 'holyWaterIsCollected')).toBe(1);
  });
});
