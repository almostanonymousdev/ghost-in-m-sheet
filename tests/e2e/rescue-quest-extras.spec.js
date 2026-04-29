const { test, expect } = require('@playwright/test');
const { openGame, resetGame, setVar, getVar, callSetup, goToPassage } = require('../helpers');
const { expectCleanPassage, setupActiveQuest } = require('./e2e-helpers');

test.describe('Missing Women — clue / EMF upgrade flow', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  test('hasRescueClue reflects $hasRescueClue', async () => {
    await page.evaluate(() => { delete SugarCube.State.variables.hasRescueClue; });
    expect(await callSetup(page, 'setup.MissingWomen.hasRescueClue()')).toBe(false);
    await setVar(page, 'hasRescueClue', 1);
    expect(await callSetup(page, 'setup.MissingWomen.hasRescueClue()')).toBe(true);
  });

  test('setRescueClueFound flips $hasRescueClue', async () => {
    await page.evaluate(() => { delete SugarCube.State.variables.hasRescueClue; });
    await page.evaluate(() => SugarCube.setup.MissingWomen.setRescueClueFound());
    expect(await getVar(page, 'hasRescueClue')).toBe(1);
  });

  test('emfLevel reads equipment.emf', async () => {
    await setVar(page, 'equipment', { emf: 1 });
    expect(await callSetup(page, 'setup.MissingWomen.emfLevel()')).toBe(1);
    await setVar(page, 'equipment', { emf: 3 });
    expect(await callSetup(page, 'setup.MissingWomen.emfLevel()')).toBe(3);
  });

  test('upgradeEmfToLvl3 raises EMF to level 3', async () => {
    await setVar(page, 'equipment', { emf: 1 });
    await page.evaluate(() => SugarCube.setup.MissingWomen.upgradeEmfToLvl3());
    expect(await callSetup(page, 'setup.MissingWomen.emfLevel()')).toBe(3);
  });

  test('upgradeEmfToLvl3 is a no-op when equipment is missing', async () => {
    await page.evaluate(() => { delete SugarCube.State.variables.equipment; });
    await page.evaluate(() => SugarCube.setup.MissingWomen.upgradeEmfToLvl3());
    expect(await callSetup(page, 'setup.MissingWomen.emfLevel()')).toBeUndefined();
  });

  test('RescueClueFound passage upgrades EMF to 3', async () => {
    await setupActiveQuest(page, 'Victoria');
    await setVar(page, 'equipment', { emf: 1 });
    await setVar(page, 'tornStyles', ['torn-style-1 torn-effect']);
    await setVar(page, 'tornStyleRandom', 'torn-style-1 torn-effect');
    await goToPassage(page, 'RescueClueFound');
    await expectCleanPassage(page);
  });
});

test.describe('Missing Women — task board', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  test('ensureBoardCooldowns initialises both counters to 0', async () => {
    await page.evaluate(() => {
      delete SugarCube.State.variables.rescueCD;
      delete SugarCube.State.variables.rescueQuestCD;
    });
    await page.evaluate(() => SugarCube.setup.MissingWomen.ensureBoardCooldowns());
    expect(await getVar(page, 'rescueCD')).toBe(0);
    expect(await getVar(page, 'rescueQuestCD')).toBe(0);
  });

  test('ensureBoardCooldowns leaves existing values alone', async () => {
    await setVar(page, 'rescueCD', 5);
    await setVar(page, 'rescueQuestCD', 7);
    await page.evaluate(() => SugarCube.setup.MissingWomen.ensureBoardCooldowns());
    expect(await getVar(page, 'rescueCD')).toBe(5);
    expect(await getVar(page, 'rescueQuestCD')).toBe(7);
  });

  test('startRescueBoardCooldown sets rescueQuestCD to 1', async () => {
    await setVar(page, 'rescueQuestCD', 0);
    await page.evaluate(() => SugarCube.setup.MissingWomen.startRescueBoardCooldown());
    expect(await getVar(page, 'rescueQuestCD')).toBe(1);
  });

  test('rollBoardGirls picks two distinct girls from the pool', async () => {
    await setVar(page, 'rescueGirls', ['Victoria', 'Jade', 'Julia', 'Nadia', 'Ash']);
    await setVar(page, 'rescueRandomGirls', []);
    await setVar(page, 'rescueCD', 0);
    await page.evaluate(() => SugarCube.setup.MissingWomen.rollBoardGirls());
    const girls = await getVar(page, 'rescueRandomGirls');
    expect(girls).toHaveLength(2);
    expect(girls[0]).not.toBe(girls[1]);
    expect(['Victoria', 'Jade', 'Julia', 'Nadia', 'Ash']).toContain(girls[0]);
    expect(['Victoria', 'Jade', 'Julia', 'Nadia', 'Ash']).toContain(girls[1]);
    expect(await getVar(page, 'rescueCD')).toBe(1);
  });

  test('initRescueGirlPool stores the master list', async () => {
    await page.evaluate(() => SugarCube.setup.MissingWomen.initRescueGirlPool(['Victoria', 'Jade']));
    expect(await getVar(page, 'rescueGirls')).toEqual(['Victoria', 'Jade']);
  });

  test('seedTornStyle picks from $tornStyles and randomizes photo number', async () => {
    await setVar(page, 'tornStyles', ['style-A', 'style-B', 'style-C']);
    await page.evaluate(() => SugarCube.setup.MissingWomen.seedTornStyle());
    const t = await getVar(page, 'tornStyleRandom');
    expect(['style-A', 'style-B', 'style-C']).toContain(t);
    const n = await getVar(page, 'randomRescuePhotoNumber');
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(16);
  });

  test('seedTornStyle is a no-op when $tornStyles is empty', async () => {
    await setVar(page, 'tornStyles', []);
    await setVar(page, 'tornStyleRandom', 'unchanged');
    await page.evaluate(() => SugarCube.setup.MissingWomen.seedTornStyle());
    expect(await getVar(page, 'tornStyleRandom')).toBe('unchanged');
  });
});

test.describe('Missing Women — rescue dispatch and accessors', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  test('setCurrentRescueGirl / currentRescueGirl round-trip', async () => {
    await page.evaluate(() => SugarCube.setup.MissingWomen.setCurrentRescueGirl('Nadia'));
    expect(await callSetup(page, 'setup.MissingWomen.currentRescueGirl()')).toBe('Nadia');
  });

  test('setQuestForRescueStarted sets quest to active and stage 0', async () => {
    await setVar(page, 'hasQuestForRescue', 0);
    await page.evaluate(() => SugarCube.setup.MissingWomen.setQuestForRescueStarted());
    expect(await getVar(page, 'hasQuestForRescue')).toBe(1);
    expect(await getVar(page, 'rescueStage')).toBe(0);
  });

  test('setRescueQuestStage / rescueQuestStage round-trip', async () => {
    await page.evaluate(() => SugarCube.setup.MissingWomen.setRescueQuestStage(2));
    expect(await callSetup(page, 'setup.MissingWomen.rescueQuestStage()')).toBe(2);
    expect(await callSetup(page, 'setup.MissingWomen.questFailed()')).toBe(true);
  });

  test('Jade and Victoria possessed-stage helpers track distinct keys', async () => {
    await page.evaluate(() => SugarCube.setup.MissingWomen.setJadePossessedStage(2));
    await page.evaluate(() => SugarCube.setup.MissingWomen.setVictoriaPossessedStage(1));
    expect(await callSetup(page, 'setup.MissingWomen.jadePossessedStage()')).toBe(2);
    expect(await callSetup(page, 'setup.MissingWomen.victoriaPossessedStage()')).toBe(1);
  });

  test('sleepOffHoursAfterEvent advances clock by 3', async () => {
    await setVar(page, 'hours', 10);
    await page.evaluate(() => SugarCube.setup.MissingWomen.sleepOffHoursAfterEvent());
    expect(await getVar(page, 'hours')).toBe(13);
  });

  test('setRescueHouse / rescueHouse round-trip', async () => {
    await page.evaluate(() => SugarCube.setup.MissingWomen.setRescueHouse(7));
    expect(await callSetup(page, 'setup.MissingWomen.rescueHouse()')).toBe(7);
  });

  test('setRescueStage / rescueStage round-trip', async () => {
    await page.evaluate(() => SugarCube.setup.MissingWomen.setRescueStage(2));
    expect(await callSetup(page, 'setup.MissingWomen.rescueStage()')).toBe(2);
  });

  test('setRandomRescuePhotoNumber / randomRescuePhotoNumber round-trip', async () => {
    await page.evaluate(() => SugarCube.setup.MissingWomen.setRandomRescuePhotoNumber(11));
    expect(await callSetup(page, 'setup.MissingWomen.randomRescuePhotoNumber()')).toBe(11);
  });
});

test.describe('Missing Women — rescue success roll', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  test('rollRescueSuccess always succeeds at hour 0 (chance = 100)', async () => {
    await setVar(page, 'hours', 0);
    await page.evaluate(() => { window._origRandom = Math.random; Math.random = () => 0.5; });
    try {
      expect(await callSetup(page, 'setup.MissingWomen.rollRescueSuccess()')).toBe(true);
    } finally {
      await page.evaluate(() => { Math.random = window._origRandom; });
    }
  });

  test('rollRescueSuccess hour 9 has ~50% chance', async () => {
    await setVar(page, 'hours', 9);
    // chance = 100 - 9*100/18 = 50
    await page.evaluate(() => { window._origRandom = Math.random; Math.random = () => 0; });
    try {
      // random(1, 100) with 0 → 1, 1 <= 50, success
      expect(await callSetup(page, 'setup.MissingWomen.rollRescueSuccess()')).toBe(true);
    } finally {
      await page.evaluate(() => { Math.random = window._origRandom; });
    }
    await page.evaluate(() => { window._origRandom = Math.random; Math.random = () => 0.99; });
    try {
      // random(1, 100) with 0.99 → 100, 100 > 50, failure
      expect(await callSetup(page, 'setup.MissingWomen.rollRescueSuccess()')).toBe(false);
    } finally {
      await page.evaluate(() => { Math.random = window._origRandom; });
    }
  });

  test('rollRescueSuccess at hour 18+ is essentially 0 (always fails)', async () => {
    await setVar(page, 'hours', 18);
    // chance = 100 - 18*100/18 = 0
    await page.evaluate(() => { window._origRandom = Math.random; Math.random = () => 0; });
    try {
      // random(1,100) → 1, but chance is 0, 1 > 0 → false
      expect(await callSetup(page, 'setup.MissingWomen.rollRescueSuccess()')).toBe(false);
    } finally {
      await page.evaluate(() => { Math.random = window._origRandom; });
    }
  });
});

test.describe('Missing Women — RescueSuccess and RescueMap rendering', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  test('RescueSuccess renders for each girl', async () => {
    for (const girl of ['Victoria', 'Jade', 'Julia', 'Nadia', 'Ash']) {
      await resetGame(page);
      await setupActiveQuest(page, girl);
      await goToPassage(page, 'RescueSuccess');
      await expectCleanPassage(page);
    }
  });

  test('RescueMap renders cleanly', async () => {
    await setupActiveQuest(page, 'Victoria');
    await goToPassage(page, 'RescueMap');
    await expectCleanPassage(page);
  });

  test('RescueMap shows 16 house cards', async () => {
    await setupActiveQuest(page, 'Victoria');
    await goToPassage(page, 'RescueMap');
    const count = await page.locator('.rescuehousecard').count();
    expect(count).toBe(16);
  });
});

test.describe('Missing Women — Bag rescue clue photo viewer', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  test('Bag renders cleanly when the rescue clue is held', async () => {
    await setupActiveQuest(page, 'Victoria');
    await page.evaluate(() => SugarCube.setup.MissingWomen.setRescueClueFound());
    await goToPassage(page, 'Bag');
    await expectCleanPassage(page);
    await expect(page.locator('a:has-text("Look at the photo")')).toHaveCount(1);
  });

  test('clicking "Look at the photo" reveals the photo without errors', async () => {
    await setupActiveQuest(page, 'Victoria');
    await page.evaluate(() => SugarCube.setup.MissingWomen.setRescueClueFound());
    await goToPassage(page, 'Bag');
    await page.locator('a:has-text("Look at the photo")').first().click();
    await expectCleanPassage(page);
    const imgCount = await page.locator('.flexwrapper img[src*="rescue/house"]').count();
    expect(imgCount).toBeGreaterThan(0);
  });

  test('photo viewer still works when $tornStyleRandom is unset', async () => {
    await setupActiveQuest(page, 'Victoria');
    await page.evaluate(() => SugarCube.setup.MissingWomen.setRescueClueFound());
    await page.evaluate(() => { delete SugarCube.State.variables.tornStyleRandom; });
    await goToPassage(page, 'Bag');
    await page.locator('a:has-text("Look at the photo")').first().click();
    await expectCleanPassage(page);
  });
});

test.describe('Missing Women — multi-stage possession passages', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  const POSSESSION_PASSAGES = [
    { girl: 'Victoria', passages: ['RescueVictoriaPossessed', 'RescueVictoriaPossessed1', 'RescueVictoriaPossessed2'] },
    { girl: 'Jade',     passages: ['RescueJadePossessed', 'RescueJadePossessed1', 'RescueJadePossessed2'] },
    { girl: 'Julia',    passages: ['RescueJuliaPossessed', 'RescueJuliaPossessed1', 'RescueJuliaPossessed2', 'RescueJuliaPossessed3'] },
    { girl: 'Nadia',    passages: ['RescueNadiaPossessed', 'RescueNadiaPossessed1', 'RescueNadiaPossessed2', 'RescueNadiaPossessed3'] },
    { girl: 'Ash',      passages: ['RescueAshPossessed', 'RescueAshPossessed1', 'RescueAshPossessed2'] },
  ];

  for (const { girl, passages } of POSSESSION_PASSAGES) {
    for (const passage of passages) {
      test(`${passage} renders cleanly`, async () => {
        test.setTimeout(10_000);
        await setupActiveQuest(page, girl);
        await setVar(page, 'hasQuestForRescue', 2);
        await setVar(page, 'mc.corruption', 5);
        await goToPassage(page, passage);
        await expectCleanPassage(page);
      });
    }
  }
});
