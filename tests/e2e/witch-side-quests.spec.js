const { test, expect } = require('../fixtures');
const { setVar, getVar, callSetup, goToPassage } = require('../helpers');
const { expectCleanPassage } = require('./e2e-helpers');

test.describe('Witch — cursed-item quest lifecycle', () => {
  test('quest progresses offer → active → turn-in → reward', async ({ game: page }) => {
    await page.evaluate(() => { delete SugarCube.State.variables.gotCursedItem; });
    await setVar(page, 'mc.lvl', 3);

    expect(await callSetup(page, 'setup.Witch.canOfferCursedItemQuest()')).toBe(true);
    expect(await callSetup(page, 'setup.Witch.cursedItemQuestActive()')).toBe(false);
    expect(await callSetup(page, 'setup.Witch.hasCursedItemToTurnIn()')).toBe(false);

    await page.evaluate(() => SugarCube.setup.Witch.startCursedItemQuest());
    expect(await getVar(page, 'gotCursedItem')).toBe(0);
    expect(await callSetup(page, 'setup.Witch.cursedItemQuestActive()')).toBe(true);
    expect(await callSetup(page, 'setup.Witch.canOfferCursedItemQuest()')).toBe(false);

    await setVar(page, 'gotCursedItem', 1);
    expect(await callSetup(page, 'setup.Witch.hasCursedItemToTurnIn()')).toBe(true);

    await setVar(page, 'mc.money', 50);
    await setVar(page, 'isCIDildo', 1);
    await setVar(page, 'isCIButtplug', 0);
    await setVar(page, 'isCIBeads', 0);
    await setVar(page, 'isCIHDildo', 1);
    await page.evaluate(() => SugarCube.setup.Witch.collectCursedItemReward());

    expect(await getVar(page, 'mc.money')).toBe(80);
    expect(await getVar(page, 'gotCursedItem')).toBe(0);
    expect(await getVar(page, 'isCIDildo')).toBe(0);
    expect(await getVar(page, 'isCIHDildo')).toBe(0);
  });

  test('shouldAwardGwb3OnTurnIn fires upgradeGwbToLvl3', async ({ game: page }) => {
    await setVar(page, 'equipment', { gwb: 1 });
    expect(await callSetup(page, 'setup.Witch.shouldAwardGwb3OnTurnIn()')).toBe(true);
    await page.evaluate(() => SugarCube.setup.Witch.upgradeGwbToLvl3());
    expect(await callSetup(page, 'setup.Witch.ownsLevel3Gwb()')).toBe(true);
    expect(await callSetup(page, 'setup.Witch.shouldAwardGwb3OnTurnIn()')).toBe(false);
  });
});

test.describe('Witch — exorcism and rescue referrals', () => {
  test('exorcismQuestNotStarted is true when stage is 0 or undefined', async ({ game: page }) => {
    await page.evaluate(() => { delete SugarCube.State.variables.exorcismQuestStage; });
    expect(await callSetup(page, 'setup.Witch.exorcismQuestNotStarted()')).toBe(true);
    await setVar(page, 'exorcismQuestStage', 0);
    expect(await callSetup(page, 'setup.Witch.exorcismQuestNotStarted()')).toBe(true);
    await setVar(page, 'exorcismQuestStage', 1);
    expect(await callSetup(page, 'setup.Witch.exorcismQuestNotStarted()')).toBe(false);
  });

  test('resetExorcismQuestStage sets stage back to 0', async ({ game: page }) => {
    await setVar(page, 'exorcismQuestStage', 5);
    await page.evaluate(() => SugarCube.setup.Witch.resetExorcismQuestStage());
    expect(await getVar(page, 'exorcismQuestStage')).toBe(0);
  });

  test('hasSuccubusEncounter reads $succubus', async ({ game: page }) => {
    await page.evaluate(() => { delete SugarCube.State.variables.succubus; });
    expect(await callSetup(page, 'setup.Witch.hasSuccubusEncounter()')).toBe(false);
    await setVar(page, 'succubus', 1);
    expect(await callSetup(page, 'setup.Witch.hasSuccubusEncounter()')).toBe(true);
  });

  test('clearQuestForRescue sets $hasQuestForRescue to 0', async ({ game: page }) => {
    await setVar(page, 'hasQuestForRescue', 3);
    await page.evaluate(() => SugarCube.setup.MissingWomen.resetQuestToAvailable());
    expect(await getVar(page, 'hasQuestForRescue')).toBe(0);
  });
});

test.describe('Witch — level 3 tools referral', () => {
  test('restartToolEvent clears eventToolsOneStart', async ({ game: page }) => {
    await setVar(page, 'eventToolsOneStart', 1);
    await page.evaluate(() => SugarCube.setup.Witch.restartToolEvent());
    expect(await getVar(page, 'eventToolsOneStart')).toBe(0);
    expect(await callSetup(page, 'setup.Witch.canAskAboutLevel3Tools()')).toBe(true);
  });

  test('markWardenOutfitHintOpened sets wardenClothesStage to 1', async ({ game: page }) => {
    await setVar(page, 'wardenClothesStage', 0);
    await page.evaluate(() => SugarCube.setup.Witch.markWardenOutfitHintOpened());
    expect(await getVar(page, 'wardenClothesStage')).toBe(1);
    expect(await callSetup(page, 'setup.Witch.canAskAboutIronclad()')).toBe(true);
  });
});

test.describe('Witch — weaken ghost quest', () => {
  test('markWeakenQuestStarted sets weakenTheGhostQuest to 1', async ({ game: page }) => {
    await page.evaluate(() => { delete SugarCube.State.variables.weakenTheGhostQuest; });
    expect(await callSetup(page, 'setup.Witch.hasWeakenTheGhostQuest()')).toBe(false);
    await page.evaluate(() => SugarCube.setup.Witch.markWeakenQuestStarted());
    expect(await getVar(page, 'weakenTheGhostQuest')).toBe(1);
    expect(await callSetup(page, 'setup.Witch.hasWeakenTheGhostQuest()')).toBe(true);
  });

  test('markGhostWeakened reflects in isGhostWeakened', async ({ game: page }) => {
    await setVar(page, 'isWeakenGhost', 0);
    expect(await callSetup(page, 'setup.Witch.isGhostWeakened()')).toBe(false);
    await page.evaluate(() => SugarCube.setup.Witch.markGhostWeakened());
    expect(await getVar(page, 'isWeakenGhost')).toBe(1);
    expect(await callSetup(page, 'setup.Witch.isGhostWeakened()')).toBe(true);
  });

});

test.describe('Witch — tool upgrades and crucifix', () => {
  test('TOOL_UPGRADE_PRICES lists a price for each tool', async ({ game: page }) => {
    const prices = await page.evaluate(() => SugarCube.setup.Witch.TOOL_UPGRADE_PRICES);
    expect(prices.emf).toBe(200);
    expect(prices.temperature).toBe(100);
    expect(prices.spiritbox).toBe(500);
    expect(prices.gwb).toBe(400);
    expect(prices.glass).toBe(300);
    expect(prices.uvl).toBe(400);
  });

  test('upgradeTool raises tool to 4 and deducts money', async ({ game: page }) => {
    await setVar(page, 'mc.money', 500);
    await setVar(page, 'equipment', { emf: 2, temperature: 1, spiritbox: 1, gwb: 1, glass: 1, uvl: 1 });
    await page.evaluate(() => SugarCube.setup.Witch.upgradeTool('emf'));
    expect(await callSetup(page, 'setup.Witch.toolLevel("emf")')).toBe(4);
    expect(await getVar(page, 'mc.money')).toBe(300);
  });

  test('buyDetector sets boughtDetector and deducts $200', async ({ game: page }) => {
    await setVar(page, 'mc.money', 300);
    await page.evaluate(() => { delete SugarCube.State.variables.boughtDetector; });
    expect(await callSetup(page, 'setup.Witch.detectorBought()')).toBe(false);
    await page.evaluate(() => SugarCube.setup.Witch.buyDetector());
    expect(await getVar(page, 'mc.money')).toBe(100);
    expect(await callSetup(page, 'setup.Witch.detectorBought()')).toBe(true);
  });

  test('initCrucifixIfNeeded only sets 0 when undefined', async ({ game: page }) => {
    await page.evaluate(() => { delete SugarCube.State.variables.crucifixAmount; });
    await page.evaluate(() => SugarCube.setup.ToolController.initCrucifixIfNeeded());
    expect(await callSetup(page, 'setup.ToolController.crucifixAmount()')).toBe(0);

    await setVar(page, 'crucifixAmount', 3);
    await page.evaluate(() => SugarCube.setup.ToolController.initCrucifixIfNeeded());
    expect(await callSetup(page, 'setup.ToolController.crucifixAmount()')).toBe(3);
  });

  test('addCrucifix increments crucifixAmount', async ({ game: page }) => {
    await setVar(page, 'crucifixAmount', 0);
    await page.evaluate(() => SugarCube.setup.ToolController.addCrucifix());
    await page.evaluate(() => SugarCube.setup.ToolController.addCrucifix());
    expect(await callSetup(page, 'setup.ToolController.crucifixAmount()')).toBe(2);
  });

  test('clearHiddenEvidence removes all hidden-evidence flags', async ({ game: page }) => {
    await setVar(page, 'hiddenEvidence', 1);
    await setVar(page, 'hiddenEvidence1', 1);
    await setVar(page, 'hiddenEvidence2', 1);
    await setVar(page, 'deleteSecondEvidence', 1);
    await setVar(page, 'deleteThirdEvidence', 1);
    await setVar(page, 'deleteOneEvidence', 1);
    await page.evaluate(() => SugarCube.setup.Ghosts.clearHiddenEvidence());
    const V = await page.evaluate(() => ({
      a: SugarCube.State.variables.hiddenEvidence,
      b: SugarCube.State.variables.hiddenEvidence1,
      c: SugarCube.State.variables.hiddenEvidence2,
      d: SugarCube.State.variables.deleteSecondEvidence,
      e: SugarCube.State.variables.deleteThirdEvidence,
      f: SugarCube.State.variables.deleteOneEvidence,
    }));
    expect(V.a).toBeUndefined();
    expect(V.b).toBeUndefined();
    expect(V.c).toBeUndefined();
    expect(V.d).toBeUndefined();
    expect(V.e).toBeUndefined();
    expect(V.f).toBeUndefined();
  });
});

test.describe('Witch — night sneak-in gating', () => {
  test('witchLateNightHour is true only when hours <= 5', async ({ game: page }) => {
    await setVar(page, 'hours', 2);
    expect(await callSetup(page, 'setup.Witch.witchLateNightHour()')).toBe(true);
    await setVar(page, 'hours', 5);
    expect(await callSetup(page, 'setup.Witch.witchLateNightHour()')).toBe(true);
    await setVar(page, 'hours', 6);
    expect(await callSetup(page, 'setup.Witch.witchLateNightHour()')).toBe(false);
  });

  test('startWitchNightCooldown and canVisitWitchBedroomNight', async ({ game: page }) => {
    await page.evaluate(() => { delete SugarCube.State.variables.witchNight; });
    expect(await callSetup(page, 'setup.Witch.canVisitWitchBedroomNight()')).toBe(true);
    await page.evaluate(() => SugarCube.setup.Witch.startWitchNightCooldown());
    expect(await getVar(page, 'witchNight')).toBe(1);
    expect(await callSetup(page, 'setup.Witch.canVisitWitchBedroomNight()')).toBe(false);
  });

  test('startStealItemsCooldown gates canStealItemsFromWitch', async ({ game: page }) => {
    await page.evaluate(() => { delete SugarCube.State.variables.stealItemsFromWitch; });
    expect(await callSetup(page, 'setup.Witch.canStealItemsFromWitch()')).toBe(true);
    await page.evaluate(() => SugarCube.setup.Witch.startStealItemsCooldown());
    expect(await getVar(page, 'stealItemsFromWitch')).toBe(1);
    expect(await callSetup(page, 'setup.Witch.canStealItemsFromWitch()')).toBe(false);
  });

  test('markKeyFromWitchStolen sets $gotKeyFromWitch and unlocks sneak-in', async ({ game: page }) => {
    await page.evaluate(() => { delete SugarCube.State.variables.gotKeyFromWitch; });
    await setVar(page, 'hours', 2);
    expect(await callSetup(page, 'setup.Witch.canSneakInAtNight()')).toBe(false);
    await page.evaluate(() => SugarCube.setup.Witch.markKeyFromWitchStolen());
    expect(await callSetup(page, 'setup.Witch.hasStolenKey()')).toBe(true);
    expect(await callSetup(page, 'setup.Witch.canSneakInAtNight()')).toBe(true);
  });
});

test.describe('Witch — passage rendering with mixed state', () => {
  test('Witch entrance renders at 10:00 (just-open edge)', async ({ game: page }) => {
    await setVar(page, 'hours', 10);
    await goToPassage(page, 'Witch');
    await expectCleanPassage(page);
  });

  test('Witch entrance renders at 23:59 (closing edge)', async ({ game: page }) => {
    await setVar(page, 'hours', 23);
    await setVar(page, 'minutes', 59);
    await goToPassage(page, 'Witch');
    await expectCleanPassage(page);
  });

  test('WitchInside renders without error when no hunt is active', async ({ game: page }) => {
    await setVar(page, 'hours', 12);
    await setVar(page, 'firstVisitWitchShop', false);
    await page.evaluate(() => { SugarCube.State.variables.hunt = null; });
    await goToPassage(page, 'WitchInside');
    await expectCleanPassage(page);
  });
});
