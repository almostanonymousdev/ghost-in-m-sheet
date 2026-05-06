const { test, expect } = require('../fixtures');
const { setVar, getVar, setHuntMode, getHuntMode, callSetup, goToPassage } = require('../helpers');
const { expectCleanPassage } = require('./e2e-helpers');

test.describe('Witch — access and hours', () => {
  test('isDayTime is true between 10:00 and 23:00', async ({ game: page }) => {
    await setVar(page, 'hours', 9);
    expect(await callSetup(page, 'setup.Witch.isDayTime()')).toBe(false);
    await setVar(page, 'hours', 10);
    expect(await callSetup(page, 'setup.Witch.isDayTime()')).toBe(true);
    await setVar(page, 'hours', 23);
    expect(await callSetup(page, 'setup.Witch.isDayTime()')).toBe(true);
    await setVar(page, 'hours', 0);
    expect(await callSetup(page, 'setup.Witch.isDayTime()')).toBe(false);
  });

  test('Witch exterior shows closed message before 10 AM without a stolen key', async ({ game: page }) => {
    await setVar(page, 'hours', 3);
    await page.evaluate(() => { delete SugarCube.State.variables.gotKeyFromWitch; });
    await goToPassage(page, 'Witch');
    const text = await page.locator('#passages').innerText();
    expect(text).toContain('10 in the morning to midnight');
    await expectCleanPassage(page);
  });

  test('canSneakInAtNight requires stolen key and non-daytime', async ({ game: page }) => {
    await setVar(page, 'hours', 3);
    await page.evaluate(() => { delete SugarCube.State.variables.gotKeyFromWitch; });
    expect(await callSetup(page, 'setup.Witch.canSneakInAtNight()')).toBe(false);
    await setVar(page, 'gotKeyFromWitch', 1);
    expect(await callSetup(page, 'setup.Witch.canSneakInAtNight()')).toBe(true);
    await setVar(page, 'hours', 12);
    expect(await callSetup(page, 'setup.Witch.canSneakInAtNight()')).toBe(false);
  });

  test('canStealKeyFromWitch requires corruption >= 3 and no existing key', async ({ game: page }) => {
    await page.evaluate(() => { delete SugarCube.State.variables.gotKeyFromWitch; });
    await setVar(page, 'mc.corruption', 2);
    expect(await callSetup(page, 'setup.Witch.canStealKeyFromWitch()')).toBe(false);
    await setVar(page, 'mc.corruption', 3);
    expect(await callSetup(page, 'setup.Witch.canStealKeyFromWitch()')).toBe(true);
    await setVar(page, 'gotKeyFromWitch', 1);
    expect(await callSetup(page, 'setup.Witch.canStealKeyFromWitch()')).toBe(false);
  });

  test('WitchInsideNight passage renders cleanly for a night sneak-in', async ({ game: page }) => {
    await setVar(page, 'hours', 2);
    await setVar(page, 'gotKeyFromWitch', 1);
    await goToPassage(page, 'WitchInsideNight');
    await expectCleanPassage(page);
  });

  test('WitchBedroom passage renders cleanly for bedroom events', async ({ game: page }) => {
    await setVar(page, 'hours', 2);
    await setVar(page, 'gotKeyFromWitch', 1);
    await setVar(page, 'witchNight', 0);
    await goToPassage(page, 'WitchBedroom');
    await expectCleanPassage(page);
  });
});

test.describe('Witch — contract lifecycle', () => {
  test('canAffordContract requires money >= 35', async ({ game: page }) => {
    await setVar(page, 'mc.money', 34);
    expect(await callSetup(page, 'setup.Witch.canAffordContract()')).toBe(false);
    await setVar(page, 'mc.money', 35);
    expect(await callSetup(page, 'setup.Witch.canAffordContract()')).toBe(true);
  });

  test('hasActiveContract / contractReadyToEnd track ghostHuntingMode', async ({ game: page }) => {
    await setHuntMode(page, 0);
    expect(await callSetup(page, 'setup.Witch.hasActiveContract()')).toBe(false);
    expect(await callSetup(page, 'setup.Witch.contractReadyToEnd()')).toBe(false);
    await setHuntMode(page, 1);
    expect(await callSetup(page, 'setup.Witch.hasActiveContract()')).toBe(true);
    await setHuntMode(page, 3);
    expect(await callSetup(page, 'setup.Witch.contractReadyToEnd()')).toBe(true);
  });

  test('WitchInside shows contract links during daytime when affordable', async ({ game: page }) => {
    await setVar(page, 'hours', 12);
    await setVar(page, 'mc.money', 200);
    await setVar(page, 'firstVisitWitchShop', false);
    await setHuntMode(page, 0);
    await goToPassage(page, 'WitchInside');
    await expectCleanPassage(page);
    const text = await page.locator('#passages').innerText();
    expect(text).toContain('I want to get a contract');
  });

  test('WitchInside shows "not enough money" when broke', async ({ game: page }) => {
    await setVar(page, 'hours', 12);
    await setVar(page, 'mc.money', 5);
    await setVar(page, 'firstVisitWitchShop', false);
    await setHuntMode(page, 0);
    await goToPassage(page, 'WitchInside');
    const text = await page.locator('#passages').innerText();
    expect(text).toContain("don't have enough money");
    await expectCleanPassage(page);
  });

  test('WitchInside shows "already have a contract" during an active hunt', async ({ game: page }) => {
    await setVar(page, 'hours', 12);
    await setVar(page, 'mc.money', 200);
    await setVar(page, 'firstVisitWitchShop', false);
    await setHuntMode(page, 1);
    await goToPassage(page, 'WitchInside');
    const text = await page.locator('#passages').innerText();
    expect(text).toContain('already have a contract');
    await expectCleanPassage(page);
  });

  test('WitchEndContract renders the ghost-type picker when ready to turn in', async ({ game: page }) => {
    await setVar(page, 'hours', 12);
    await setHuntMode(page, 3);
    await setVar(page, 'moneyFromContract', 100);
    await setVar(page, 'moneyFromWeakenTheGhost', 0);
    await goToPassage(page, 'WitchEndContract');
    await expectCleanPassage(page);
    await expect(page.locator('select')).toBeVisible();
  });
});

test.describe('Witch — side quests', () => {
  test('canOfferRescueQuest is true only when $hasQuestForRescue is undefined', async ({ game: page }) => {
    await page.evaluate(() => { delete SugarCube.State.variables.hasQuestForRescue; });
    expect(await callSetup(page, 'setup.Witch.canOfferRescueQuest()')).toBe(true);
    await setVar(page, 'hasQuestForRescue', 0);
    expect(await callSetup(page, 'setup.Witch.canOfferRescueQuest()')).toBe(false);
  });

  test('rescueQuestUnlocked requires mc.lvl >= 4', async ({ game: page }) => {
    await setVar(page, 'mc.lvl', 3);
    expect(await callSetup(page, 'setup.Witch.rescueQuestUnlocked()')).toBe(false);
    await setVar(page, 'mc.lvl', 4);
    expect(await callSetup(page, 'setup.Witch.rescueQuestUnlocked()')).toBe(true);
  });

  test('canOfferCursedItemQuest requires mc.lvl >= 2 and no existing quest', async ({ game: page }) => {
    await page.evaluate(() => { delete SugarCube.State.variables.gotCursedItem; });
    await setVar(page, 'mc.lvl', 1);
    expect(await callSetup(page, 'setup.Witch.canOfferCursedItemQuest()')).toBe(false);
    await setVar(page, 'mc.lvl', 2);
    expect(await callSetup(page, 'setup.Witch.canOfferCursedItemQuest()')).toBe(true);
    await setVar(page, 'gotCursedItem', 0);
    expect(await callSetup(page, 'setup.Witch.canOfferCursedItemQuest()')).toBe(false);
  });

  test('cursedItemQuestActive / hasCursedItemToTurnIn reflect $gotCursedItem', async ({ game: page }) => {
    await setVar(page, 'gotCursedItem', 0);
    expect(await callSetup(page, 'setup.Witch.cursedItemQuestActive()')).toBe(true);
    expect(await callSetup(page, 'setup.Witch.hasCursedItemToTurnIn()')).toBe(false);
    await setVar(page, 'gotCursedItem', 1);
    expect(await callSetup(page, 'setup.Witch.cursedItemQuestActive()')).toBe(false);
    expect(await callSetup(page, 'setup.Witch.hasCursedItemToTurnIn()')).toBe(true);
  });

  test('collectCursedItemReward pays $30, clears gotCursedItem and CI flags', async ({ game: page }) => {
    await setVar(page, 'gotCursedItem', 1);
    await setVar(page, 'mc.money', 100);
    await setVar(page, 'isCIDildo', 1);
    await setVar(page, 'isCIButtplug', 1);
    await page.evaluate(() => SugarCube.setup.Witch.collectCursedItemReward());
    expect(await getVar(page, 'mc.money')).toBe(130);
    expect(await getVar(page, 'gotCursedItem')).toBe(0);
    expect(await getVar(page, 'isCIDildo')).toBe(0);
    expect(await getVar(page, 'isCIButtplug')).toBe(0);
  });

  test('shouldAwardGwb3OnTurnIn reflects current gwb level', async ({ game: page }) => {
    await setVar(page, 'equipment', { gwb: 1 });
    expect(await callSetup(page, 'setup.Witch.shouldAwardGwb3OnTurnIn()')).toBe(true);
    await setVar(page, 'equipment', { gwb: 3 });
    expect(await callSetup(page, 'setup.Witch.shouldAwardGwb3OnTurnIn()')).toBe(false);
  });

  test('canOfferWeakenQuest requires mc.lvl >= 5 and no existing quest', async ({ game: page }) => {
    await page.evaluate(() => { delete SugarCube.State.variables.weakenTheGhostQuest; });
    await setVar(page, 'mc.lvl', 4);
    expect(await callSetup(page, 'setup.Witch.canOfferWeakenQuest()')).toBe(false);
    await setVar(page, 'mc.lvl', 5);
    expect(await callSetup(page, 'setup.Witch.canOfferWeakenQuest()')).toBe(true);
    await setVar(page, 'weakenTheGhostQuest', 1);
    expect(await callSetup(page, 'setup.Witch.canOfferWeakenQuest()')).toBe(false);
  });

  test('canAskAboutMonkeyPaw requires $boughtMonkeyPawGuide === 0', async ({ game: page }) => {
    await setVar(page, 'boughtMonkeyPawGuide', 0);
    expect(await callSetup(page, 'setup.Witch.canAskAboutMonkeyPaw()')).toBe(true);
    await setVar(page, 'boughtMonkeyPawGuide', 1);
    expect(await callSetup(page, 'setup.Witch.canAskAboutMonkeyPaw()')).toBe(false);
  });

  test('unlockMonkeyPawWishes marks every wish learned and deducts $400', async ({ game: page }) => {
    await setVar(page, 'mc.money', 500);
    await setVar(page, 'boughtMonkeyPawGuide', 1);
    await page.evaluate(() => { delete SugarCube.State.variables.monkeyPawLearned; });
    await page.evaluate(() => { delete SugarCube.State.variables.wishAnything; });
    await page.evaluate(() => SugarCube.setup.Witch.unlockMonkeyPawWishes());
    expect(await getVar(page, 'mc.money')).toBe(100);
    expect(await getVar(page, 'boughtMonkeyPawGuide')).toBe(2);
    expect(await callSetup(page, 'setup.MonkeyPaw.hasGuide()')).toBe(true);
    expect(await callSetup(page, 'setup.MonkeyPaw.hasAnything()')).toBe(true);
    const wishIds = await page.evaluate(() =>
      SugarCube.setup.MonkeyPaw.list().map(w => w.id));
    for (const id of wishIds) {
      expect(await callSetup(page, `setup.MonkeyPaw.isLearned('${id}')`)).toBe(true);
    }
  });

  test('canAskAboutIronclad matches wardenClothesStage 0 or 1', async ({ game: page }) => {
    await setVar(page, 'wardenClothesStage', 0);
    expect(await callSetup(page, 'setup.Witch.canAskAboutIronclad()')).toBe(true);
    await setVar(page, 'wardenClothesStage', 1);
    expect(await callSetup(page, 'setup.Witch.canAskAboutIronclad()')).toBe(true);
    await setVar(page, 'wardenClothesStage', 2);
    expect(await callSetup(page, 'setup.Witch.canAskAboutIronclad()')).toBe(false);
  });

  test('canAskAboutLevel3Tools is true until eventToolsOneStart is set', async ({ game: page }) => {
    await page.evaluate(() => { delete SugarCube.State.variables.eventToolsOneStart; });
    expect(await callSetup(page, 'setup.Witch.canAskAboutLevel3Tools()')).toBe(true);
    await setVar(page, 'eventToolsOneStart', 0);
    expect(await callSetup(page, 'setup.Witch.canAskAboutLevel3Tools()')).toBe(true);
    await setVar(page, 'eventToolsOneStart', 1);
    expect(await callSetup(page, 'setup.Witch.canAskAboutLevel3Tools()')).toBe(false);
  });
});

test.describe('Witch — shop and intimate events', () => {
  test('WitchSale renders without SugarCube errors', async ({ game: page }) => {
    await setVar(page, 'hours', 12);
    await setVar(page, 'mc.money', 500);
    await goToPassage(page, 'WitchSale');
    await expectCleanPassage(page);
  });

  test('WitchInsideMast (1-in-7 random redirect) renders cleanly', async ({ game: page }) => {
    await setVar(page, 'hours', 12);
    await goToPassage(page, 'WitchInsideMast');
    await expectCleanPassage(page);
  });

  test('WitchTentaclesEvent renders cleanly', async ({ game: page }) => {
    await setVar(page, 'hours', 12);
    await goToPassage(page, 'WitchTentaclesEvent');
    await expectCleanPassage(page);
  });
});
