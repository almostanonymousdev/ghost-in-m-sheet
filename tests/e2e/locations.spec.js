const { test, expect } = require('@playwright/test');
const { openGame, resetGame, setVar, getVar, callSetup, goToPassage } = require('../helpers');
const { expectCleanPassage } = require('./e2e-helpers');

test.describe('Gym — hours and training gates', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  test('Gym exterior shows closed message at 5 AM', async () => {
    await setVar(page, 'hours', 5);
    await goToPassage(page, 'Gym');
    const text = await page.locator('#passages').innerText();
    expect(text).toContain('not open right now');
    await expectCleanPassage(page);
  });

  test('Gym exterior shows "Inside" link at 10 AM', async () => {
    await setVar(page, 'hours', 10);
    await goToPassage(page, 'Gym');
    const text = await page.locator('#passages').innerText();
    expect(text).toContain('Inside');
    await expectCleanPassage(page);
  });

  test('Gym.isMorning/Afternoon/Evening are mutually exclusive', async () => {
    await setVar(page, 'hours', 9);
    expect(await callSetup(page, 'setup.Gym.isMorning()')).toBe(true);
    expect(await callSetup(page, 'setup.Gym.isAfternoon()')).toBe(false);
    expect(await callSetup(page, 'setup.Gym.isEvening()')).toBe(false);
    await setVar(page, 'hours', 14);
    expect(await callSetup(page, 'setup.Gym.isAfternoon()')).toBe(true);
    await setVar(page, 'hours', 19);
    expect(await callSetup(page, 'setup.Gym.isEvening()')).toBe(true);
  });

  test('Gym.isGroupClassTime only fires between 12:00 and 13:59', async () => {
    await setVar(page, 'hours', 11);
    expect(await callSetup(page, 'setup.Gym.isGroupClassTime()')).toBe(false);
    await setVar(page, 'hours', 12);
    expect(await callSetup(page, 'setup.Gym.isGroupClassTime()')).toBe(true);
    await setVar(page, 'hours', 13);
    expect(await callSetup(page, 'setup.Gym.isGroupClassTime()')).toBe(true);
    await setVar(page, 'hours', 14);
    expect(await callSetup(page, 'setup.Gym.isGroupClassTime()')).toBe(false);
  });

  test('computeTrainingCost is $15 by default and $0 in morning with trainer1 discount', async () => {
    await setVar(page, 'hours', 10);
    await page.evaluate(() => { delete SugarCube.State.variables.trainer1CoachingCost; });
    expect(await callSetup(page, 'setup.Gym.computeTrainingCost()')).toBe(15);
    await setVar(page, 'trainer1CoachingCost', 0);
    expect(await callSetup(page, 'setup.Gym.computeTrainingCost()')).toBe(0);
  });

  test('canTrainSolo requires sportswear and energy >= 5', async () => {
    await setVar(page, 'mc.energy', 10);
    await page.evaluate(() => { delete SugarCube.State.variables.sportswear; });
    expect(await callSetup(page, 'setup.Gym.canTrainSolo()')).toBe(false);
    await setVar(page, 'sportswear', 1);
    expect(await callSetup(page, 'setup.Gym.canTrainSolo()')).toBe(true);
    await setVar(page, 'mc.energy', 3);
    expect(await callSetup(page, 'setup.Gym.canTrainSolo()')).toBe(false);
  });

  test('canTriggerTrainer1Event requires tip + no cooldown + sexy lingerie', async () => {
    await setVar(page, 'trainer1TipReceived', 1);
    await setVar(page, 'trainer1SexCD', 0);
    await setVar(page, 'rememberBottomStockings', 'stockings2');
    await setVar(page, 'rememberTopUnder', 'bra2');
    await setVar(page, 'rememberBottomUnder', 'panties2');
    expect(await callSetup(page, 'setup.Gym.canTriggerTrainer1Event()')).toBe(true);

    await setVar(page, 'trainer1SexCD', 1);
    expect(await callSetup(page, 'setup.Gym.canTriggerTrainer1Event()')).toBe(false);

    await setVar(page, 'trainer1SexCD', 0);
    await setVar(page, 'rememberTopUnder', 'bra1');
    expect(await callSetup(page, 'setup.Gym.canTriggerTrainer1Event()')).toBe(false);
  });

  test('group-class gates: beauty >= 50 for event, lust >= 50 for orgy', async () => {
    await setVar(page, 'mc.beauty', 49);
    expect(await callSetup(page, 'setup.Gym.meetsBeautyForGroupEvent()')).toBe(false);
    await setVar(page, 'mc.beauty', 50);
    expect(await callSetup(page, 'setup.Gym.meetsBeautyForGroupEvent()')).toBe(true);

    await setVar(page, 'mc.lust', 49);
    expect(await callSetup(page, 'setup.Gym.canJoinGroupOrgy()')).toBe(false);
    await setVar(page, 'mc.lust', 50);
    expect(await callSetup(page, 'setup.Gym.canJoinGroupOrgy()')).toBe(true);
  });
});

test.describe('Gym — passages render cleanly', () => {
  test.describe.configure({ timeout: 10_000, retries: 1 });

  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  for (const passage of [
    'Gym', 'GymInside', 'GymSolo', 'GymTraining', 'GymTrainingTrainer',
    'GymTrainer', 'GymTrainerEvent1Start', 'GymTrainerEvent1Start1',
    'GymTrainerEvent1Start2', 'GymTrainerEvent2Start', 'GymTrainerEvent2Start2',
    'GroupGymTraining', 'GymGroupEvent1Start', 'GymGroupEvent1Start2',
    'EmilyTalk',
  ]) {
    test(`${passage} renders cleanly during open hours`, async () => {
      await setVar(page, 'hours', 10);
      await setVar(page, 'sportswear', 1);
      await setVar(page, 'mc.energy', 10);
      await setVar(page, 'mc.money', 100);
      await setVar(page, 'trainingCost', 15);
      await goToPassage(page, passage);
      await expectCleanPassage(page);
    });
  }
});

test.describe('Library — hours and meeting gates', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  test('Library exterior shows no "Enter" link before 8 AM', async () => {
    await setVar(page, 'hours', 5);
    await goToPassage(page, 'Library');
    const text = await page.locator('#passages').innerText();
    expect(text).not.toContain('Enter the library');
    await expectCleanPassage(page);
  });

  test('Library exterior shows "Enter the library" at 10 AM', async () => {
    await setVar(page, 'hours', 10);
    await goToPassage(page, 'Library');
    const text = await page.locator('#passages').innerText();
    expect(text).toContain('Enter the library');
    await expectCleanPassage(page);
  });

  test('canMeetBrookAtLibrary blocked when Brook is possessed or recently with Rain', async () => {
    await setVar(page, 'isBrookePossessed', 1);
    expect(await callSetup(page, 'setup.Library.canMeetBrookAtLibrary()')).toBe(false);
    await setVar(page, 'isBrookePossessed', 0);
    await setVar(page, 'isBrookePossessedCD', 1);
    expect(await callSetup(page, 'setup.Library.canMeetBrookAtLibrary()')).toBe(false);
    await setVar(page, 'isBrookePossessedCD', 3);
    expect(await callSetup(page, 'setup.Library.canMeetBrookAtLibrary()')).toBe(true);
  });

  test('availableSearchResults is a subset of the five discovery keys', async () => {
    const results = await callSetup(page, 'setup.Library.availableSearchResults()');
    expect(Array.isArray(results)).toBe(true);
    for (const r of results) {
      expect(['book', 'Comics', 'girl', 'guy', 'brook']).toContain(r);
    }
  });

  test('availableSearchResults drops entries that have already been found', async () => {
    await setVar(page, 'foundTips', 1);
    await setVar(page, 'foundComics', 1);
    const results = await callSetup(page, 'setup.Library.availableSearchResults()');
    expect(results).not.toContain('book');
    expect(results).not.toContain('Comics');
  });

  test('brookSolo chances scale with $brook.lvl', async () => {
    await setVar(page, 'brook', { lvl: 5 });
    expect(await callSetup(page, 'setup.Library.brookSoloOwaissaChance()')).toBe(70);
    await setVar(page, 'brook', { lvl: 1 });
    expect(await callSetup(page, 'setup.Library.brookSoloOwaissaChance()')).toBe(0);
  });
});

test.describe('Library — passages render cleanly', () => {
  test.describe.configure({ timeout: 10_000, retries: 1 });

  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  for (const passage of [
    'Library', 'LibraryInside', 'LibrarySearchResult',
    'Comics', 'ReadComics', 'LibraryGhostBook', 'LibraryTipsBook',
    'LibraryGirl', 'LibraryGuy', 'LibraryGuy1',
  ]) {
    test(`${passage} renders cleanly`, async () => {
      await setVar(page, 'hours', 10);
      await setVar(page, 'mc.energy', 10);
      await setVar(page, 'mc.money', 100);
      await goToPassage(page, passage);
      await expectCleanPassage(page);
    });
  }

  test('LibraryBrook renders cleanly when Brook is eligible', async () => {
    await setVar(page, 'hours', 10);
    await setVar(page, 'isBrookePossessed', 0);
    await setVar(page, 'isBrookePossessedCD', 5);
    await setVar(page, 'brook', { lvl: 1, sanity: 100, lust: 0 });
    await goToPassage(page, 'LibraryBrook');
    await expectCleanPassage(page);
  });
});

test.describe('Park — jogging and events', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  test('Park prompts for sportswear when missing', async () => {
    await page.evaluate(() => { delete SugarCube.State.variables.sportswear; });
    await setVar(page, 'hours', 10);
    await goToPassage(page, 'Park');
    const text = await page.locator('#passages').innerText();
    expect(text).toContain('buy sportswear');
    await expectCleanPassage(page);
  });

  test('Park shows Jogging link when sportswear owned + open + energy >= 2', async () => {
    await setVar(page, 'sportswear', 1);
    await setVar(page, 'hours', 10);
    await setVar(page, 'mc.energy', 10);
    await setVar(page, 'joggingCD', 0);
    await goToPassage(page, 'Park');
    const text = await page.locator('#passages').innerText();
    expect(text).toContain('Jogging');
    await expectCleanPassage(page);
  });

  test('Park blocks jogging on cooldown', async () => {
    await setVar(page, 'sportswear', 1);
    await setVar(page, 'hours', 10);
    await setVar(page, 'joggingCD', 1);
    await goToPassage(page, 'Park');
    const text = await page.locator('#passages').innerText();
    expect(text).toContain('Enough for today');
  });

  test('Park shows "not enough energy" when below 2 energy', async () => {
    await setVar(page, 'sportswear', 1);
    await setVar(page, 'hours', 10);
    await setVar(page, 'joggingCD', 0);
    await setVar(page, 'mc.energy', 1);
    await goToPassage(page, 'Park');
    const text = await page.locator('#passages').innerText();
    expect(text).toContain('Not enough energy');
  });

  test('canEscapeParkEvent requires energy >= 4', async () => {
    await setVar(page, 'mc.energy', 3);
    expect(await callSetup(page, 'setup.Park.canEscapeParkEvent()')).toBe(false);
    await setVar(page, 'mc.energy', 4);
    expect(await callSetup(page, 'setup.Park.canEscapeParkEvent()')).toBe(true);
  });

  for (const passage of ['Park', 'ParkJogging', 'ParkEvent1', 'ParkEvent2']) {
    test(`${passage} renders cleanly`, async () => {
      await setVar(page, 'sportswear', 1);
      await setVar(page, 'hours', 10);
      await setVar(page, 'mc.energy', 10);
      await goToPassage(page, passage);
      await expectCleanPassage(page);
    });
  }
});

test.describe('Church — rescue hub and priest routes', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  test('Church exterior shows closed message at 3 AM', async () => {
    await setVar(page, 'hours', 3);
    await goToPassage(page, 'Church');
    const text = await page.locator('#passages').innerText();
    expect(text).toContain('inappropriate time');
    await expectCleanPassage(page);
  });

  test('Church exterior shows "Confess your sins" during open hours', async () => {
    await setVar(page, 'hours', 10);
    await goToPassage(page, 'Church');
    const text = await page.locator('#passages').innerText();
    expect(text).toContain('Confess your sins');
    await expectCleanPassage(page);
  });

  test('Church shows missing persons board once Rain is met and quest exists', async () => {
    await setVar(page, 'hours', 10);
    await setVar(page, 'relationshipWithRain', 1);
    await setVar(page, 'hasQuestForRescue', 0);
    await goToPassage(page, 'Church');
    const text = await page.locator('#passages').innerText();
    expect(text).toContain('Missing persons board');
  });

  test('Church shows "Take holy water" when Rain is met and none collected', async () => {
    await setVar(page, 'hours', 10);
    await setVar(page, 'relationshipWithRain', 1);
    await setVar(page, 'holyWaterIsCollected', 0);
    await goToPassage(page, 'Church');
    const text = await page.locator('#passages').innerText();
    expect(text).toContain('Take holy water');
  });

  test('Church holy water link sets $holyWaterIsCollected on click', async () => {
    await setVar(page, 'hours', 10);
    await setVar(page, 'relationshipWithRain', 1);
    await setVar(page, 'holyWaterIsCollected', 0);
    await goToPassage(page, 'Church');
    await page.locator('#passages')
      .getByText('Take holy water', { exact: false })
      .first()
      .click();
    await page.waitForFunction(() => SugarCube.State.variables.holyWaterIsCollected === 1);
    expect(await getVar(page, 'holyWaterIsCollected')).toBe(1);
  });

  test('priest-flirt gates: lust >= 40 AND eventToolsOneStart === 1', async () => {
    await setVar(page, 'mc.lust', 39);
    await setVar(page, 'eventToolsOneStart', 1);
    expect(await callSetup(page, 'setup.Church.canFlirtWithPriest()')).toBe(false);
    await setVar(page, 'mc.lust', 40);
    expect(await callSetup(page, 'setup.Church.canFlirtWithPriest()')).toBe(true);
    await setVar(page, 'eventToolsOneStart', 0);
    expect(await callSetup(page, 'setup.Church.canFlirtWithPriest()')).toBe(false);
  });

  test('rescuesNeededForExorcism decreases as relationship increases', async () => {
    await setVar(page, 'relationshipWithRain', 0);
    expect(await callSetup(page, 'setup.Church.rescuesNeededForExorcism()')).toBe(5);
    await setVar(page, 'relationshipWithRain', 3);
    expect(await callSetup(page, 'setup.Church.rescuesNeededForExorcism()')).toBe(2);
    await setVar(page, 'relationshipWithRain', 5);
    expect(await callSetup(page, 'setup.Church.rescuesNeededForExorcism()')).toBe(0);
    await setVar(page, 'relationshipWithRain', 7);
    expect(await callSetup(page, 'setup.Church.rescuesNeededForExorcism()')).toBe(0);
  });

  test('priestWillTradeToolForSex requires corruption >= 4', async () => {
    await setVar(page, 'mc.corruption', 3);
    expect(await callSetup(page, 'setup.Church.priestWillTradeToolForSex()')).toBe(false);
    await setVar(page, 'mc.corruption', 4);
    expect(await callSetup(page, 'setup.Church.priestWillTradeToolForSex()')).toBe(true);
  });
});

test.describe('Church — passages render cleanly', () => {
  test.describe.configure({ timeout: 10_000, retries: 1 });

  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  for (const passage of [
    'Church', 'ChurchPray', 'ChurchNunQuest', 'ChurchBasementEntrance',
    'RainExorcism', 'RainHelps',
    'ToolsEventChurch', 'ToolsEventChurch1', 'ToolsEventChurchEnd',
  ]) {
    test(`${passage} renders cleanly`, async () => {
      await setVar(page, 'hours', 10);
      await setVar(page, 'mc.energy', 10);
      await goToPassage(page, passage);
      await expectCleanPassage(page);
    });
  }
});

test.describe('Mall — shopping and Blake content', () => {
  test.describe.configure({ timeout: 10_000, retries: 1 });

  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  for (const passage of [
    'Mall', 'ClothingSection', 'ElectronicsSection',
    'AdultSection', 'AdultSectionPurchase', 'AdultSectionBlake',
  ]) {
    test(`${passage} renders cleanly`, async () => {
      await setVar(page, 'hours', 12);
      await setVar(page, 'mc.money', 1000);
      await goToPassage(page, passage);
      await expectCleanPassage(page);
    });
  }
});
