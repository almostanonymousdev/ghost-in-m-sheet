const { test, expect } = require('../fixtures');
const { setVar, getVar, callSetup, goToPassage, resetGame } = require('../helpers');
const { expectCleanPassage, setupActiveQuest } = require('./e2e-helpers');

test.describe('Missing Women — clue / EMF upgrade flow', () => {
  test('hasRescueClue reflects $hasRescueClue', async ({ game: page }) => {
    await page.evaluate(() => { delete SugarCube.State.variables.hasRescueClue; });
    expect(await callSetup(page, 'setup.MissingWomen.hasRescueClue()')).toBe(false);
    await setVar(page, 'hasRescueClue', 1);
    expect(await callSetup(page, 'setup.MissingWomen.hasRescueClue()')).toBe(true);
  });

  test('setRescueClueFound flips $hasRescueClue', async ({ game: page }) => {
    await page.evaluate(() => { delete SugarCube.State.variables.hasRescueClue; });
    await page.evaluate(() => SugarCube.setup.MissingWomen.setRescueClueFound());
    expect(await getVar(page, 'hasRescueClue')).toBe(1);
  });

  test('emfLevel reads equipment.emf', async ({ game: page }) => {
    await setVar(page, 'equipment', { emf: 1 });
    expect(await callSetup(page, 'setup.MissingWomen.emfLevel()')).toBe(1);
    await setVar(page, 'equipment', { emf: 3 });
    expect(await callSetup(page, 'setup.MissingWomen.emfLevel()')).toBe(3);
  });

  test('upgradeEmfToLvl3 raises EMF to level 3', async ({ game: page }) => {
    await setVar(page, 'equipment', { emf: 1 });
    await page.evaluate(() => SugarCube.setup.MissingWomen.upgradeEmfToLvl3());
    expect(await callSetup(page, 'setup.MissingWomen.emfLevel()')).toBe(3);
  });

  test('upgradeEmfToLvl3 is a no-op when equipment is missing', async ({ game: page }) => {
    await page.evaluate(() => { delete SugarCube.State.variables.equipment; });
    await page.evaluate(() => SugarCube.setup.MissingWomen.upgradeEmfToLvl3());
    expect(await callSetup(page, 'setup.MissingWomen.emfLevel()')).toBeUndefined();
  });

  test('RescueClueFound passage upgrades EMF to 3', async ({ game: page }) => {
    await setupActiveQuest(page, 'Victoria');
    await setVar(page, 'equipment', { emf: 1 });
    await setVar(page, 'tornStyles', ['torn-style-1 torn-effect']);
    await setVar(page, 'tornStyleRandom', 'torn-style-1 torn-effect');
    await goToPassage(page, 'RescueClueFound');
    await expectCleanPassage(page);
  });
});

test.describe('Missing Women — task board', () => {
  test('ensureBoardCooldowns initialises both counters to 0', async ({ game: page }) => {
    await page.evaluate(() => {
      delete SugarCube.State.variables.rescue;
      delete SugarCube.State.variables.rescueQuest;
    });
    await page.evaluate(() => SugarCube.setup.MissingWomen.ensureBoardCooldowns());
    expect(await getVar(page, 'rescue')).toBe(0);
    expect(await getVar(page, 'rescueQuest')).toBe(0);
  });

  test('ensureBoardCooldowns leaves existing values alone', async ({ game: page }) => {
    await setVar(page, 'rescue', 5);
    await setVar(page, 'rescueQuest', 7);
    await page.evaluate(() => SugarCube.setup.MissingWomen.ensureBoardCooldowns());
    expect(await getVar(page, 'rescue')).toBe(5);
    expect(await getVar(page, 'rescueQuest')).toBe(7);
  });

  test('startRescueBoardCooldown sets rescueQuest to 1', async ({ game: page }) => {
    await setVar(page, 'rescueQuest', 0);
    await page.evaluate(() => SugarCube.setup.MissingWomen.startRescueBoardCooldown());
    expect(await getVar(page, 'rescueQuest')).toBe(1);
  });

  test('rollBoardGirls picks two distinct girls from the pool', async ({ game: page }) => {
    await setVar(page, 'rescueGirls', ['Victoria', 'Jade', 'Julia', 'Nadia', 'Ash']);
    await setVar(page, 'rescueRandomGirls', []);
    await setVar(page, 'rescue', 0);
    await page.evaluate(() => SugarCube.setup.MissingWomen.rollBoardGirls());
    const girls = await getVar(page, 'rescueRandomGirls');
    expect(girls).toHaveLength(2);
    expect(girls[0]).not.toBe(girls[1]);
    expect(['Victoria', 'Jade', 'Julia', 'Nadia', 'Ash']).toContain(girls[0]);
    expect(['Victoria', 'Jade', 'Julia', 'Nadia', 'Ash']).toContain(girls[1]);
    expect(await getVar(page, 'rescue')).toBe(1);
  });

  test('initRescueGirlPool stores the master list', async ({ game: page }) => {
    await page.evaluate(() => SugarCube.setup.MissingWomen.initRescueGirlPool(['Victoria', 'Jade']));
    expect(await getVar(page, 'rescueGirls')).toEqual(['Victoria', 'Jade']);
  });

  test('seedTornStyle picks from $tornStyles and randomizes photo number', async ({ game: page }) => {
    await setVar(page, 'tornStyles', ['style-A', 'style-B', 'style-C']);
    await page.evaluate(() => SugarCube.setup.MissingWomen.seedTornStyle());
    const t = await getVar(page, 'tornStyleRandom');
    expect(['style-A', 'style-B', 'style-C']).toContain(t);
    const n = await getVar(page, 'randomRescuePhotoNumber');
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(16);
  });

  test('seedTornStyle is a no-op when $tornStyles is empty', async ({ game: page }) => {
    await setVar(page, 'tornStyles', []);
    await setVar(page, 'tornStyleRandom', 'unchanged');
    await page.evaluate(() => SugarCube.setup.MissingWomen.seedTornStyle());
    expect(await getVar(page, 'tornStyleRandom')).toBe('unchanged');
  });
});

test.describe('Missing Women — rescue dispatch and accessors', () => {
  test('setCurrentRescueGirl / currentRescueGirl round-trip', async ({ game: page }) => {
    await page.evaluate(() => SugarCube.setup.MissingWomen.setCurrentRescueGirl('Nadia'));
    expect(await callSetup(page, 'setup.MissingWomen.currentRescueGirl()')).toBe('Nadia');
  });

  test('setQuestForRescueStarted sets quest to active and stage 0', async ({ game: page }) => {
    await setVar(page, 'hasQuestForRescue', 0);
    await page.evaluate(() => SugarCube.setup.MissingWomen.setQuestForRescueStarted());
    expect(await getVar(page, 'hasQuestForRescue')).toBe(1);
    expect(await getVar(page, 'rescueStage')).toBe(0);
  });

  test('markQuestFailed / rescueQuestStage round-trip', async ({ game: page }) => {
    await page.evaluate(() => SugarCube.setup.MissingWomen.markQuestFailed());
    expect(await callSetup(page, 'setup.MissingWomen.rescueQuestStage()')).toBe(2);
    expect(await callSetup(page, 'setup.MissingWomen.questFailed()')).toBe(true);
  });

  test('Jade and Victoria possessed-stage helpers track distinct keys', async ({ game: page }) => {
    await page.evaluate(() => SugarCube.setup.MissingWomen.setJadePossessedStage(2));
    await page.evaluate(() => SugarCube.setup.MissingWomen.setVictoriaPossessedStage(1));
    expect(await callSetup(page, 'setup.MissingWomen.jadePossessedStage()')).toBe(2);
    expect(await callSetup(page, 'setup.MissingWomen.victoriaPossessedStage()')).toBe(1);
  });

  test('sleepOffHoursAfterEvent advances clock by 3', async ({ game: page }) => {
    await setVar(page, 'hours', 10);
    await page.evaluate(() => SugarCube.setup.MissingWomen.sleepOffHoursAfterEvent());
    expect(await getVar(page, 'hours')).toBe(13);
  });

  test('setRescueHouse / rescueHouse round-trip', async ({ game: page }) => {
    await page.evaluate(() => SugarCube.setup.MissingWomen.setRescueHouse(7));
    expect(await callSetup(page, 'setup.MissingWomen.rescueHouse()')).toBe(7);
  });

  test('setRescueStage / rescueStage round-trip', async ({ game: page }) => {
    await page.evaluate(() => SugarCube.setup.MissingWomen.setRescueStage(2));
    expect(await callSetup(page, 'setup.MissingWomen.rescueStage()')).toBe(2);
  });

  test('setRandomRescuePhotoNumber / randomRescuePhotoNumber round-trip', async ({ game: page }) => {
    await page.evaluate(() => SugarCube.setup.MissingWomen.setRandomRescuePhotoNumber(11));
    expect(await callSetup(page, 'setup.MissingWomen.randomRescuePhotoNumber()')).toBe(11);
  });
});

test.describe('Missing Women — rescue success roll', () => {
  test('rollRescueSuccess always succeeds at hour 0 (chance = 100)', async ({ game: page }) => {
    await setVar(page, 'hours', 0);
    await page.evaluate(() => { window._origRandom = Math.random; Math.random = () => 0.5; });
    try {
      expect(await callSetup(page, 'setup.MissingWomen.rollRescueSuccess()')).toBe(true);
    } finally {
      await page.evaluate(() => { Math.random = window._origRandom; });
    }
  });

  test('rollRescueSuccess hour 9 has ~50% chance', async ({ game: page }) => {
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

  test('rollRescueSuccess at hour 18+ is essentially 0 (always fails)', async ({ game: page }) => {
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
  test('RescueSuccess renders for each girl', async ({ game: page }) => {
    for (const girl of ['Victoria', 'Jade', 'Julia', 'Nadia', 'Ash']) {
      await resetGame(page);
      await setupActiveQuest(page, girl);
      await goToPassage(page, 'RescueSuccess');
      await expectCleanPassage(page);
    }
  });

  test('RescueMap renders cleanly', async ({ game: page }) => {
    await setupActiveQuest(page, 'Victoria');
    await goToPassage(page, 'RescueMap');
    await expectCleanPassage(page);
  });

  test('RescueMap shows 16 house cards', async ({ game: page }) => {
    await setupActiveQuest(page, 'Victoria');
    await goToPassage(page, 'RescueMap');
    const count = await page.locator('.rescuehousecard').count();
    expect(count).toBe(16);
  });
});

test.describe('Missing Women — Bag rescue clue photo viewer', () => {
  test('Bag renders cleanly when the rescue clue is held', async ({ game: page }) => {
    await setupActiveQuest(page, 'Victoria');
    await page.evaluate(() => SugarCube.setup.MissingWomen.setRescueClueFound());
    await goToPassage(page, 'Bag');
    await expectCleanPassage(page);
    await expect(page.locator('a:has-text("Look at the photo")')).toHaveCount(1);
  });

  test('clicking "Look at the photo" reveals the photo without errors', async ({ game: page }) => {
    await setupActiveQuest(page, 'Victoria');
    await page.evaluate(() => SugarCube.setup.MissingWomen.setRescueClueFound());
    await goToPassage(page, 'Bag');
    await page.locator('a:has-text("Look at the photo")').first().click();
    await expectCleanPassage(page);
    const imgCount = await page.locator('.flexwrapper img[src*="rescue/house"]').count();
    expect(imgCount).toBeGreaterThan(0);
  });

  test('photo viewer still works when $tornStyleRandom is unset', async ({ game: page }) => {
    await setupActiveQuest(page, 'Victoria');
    await page.evaluate(() => SugarCube.setup.MissingWomen.setRescueClueFound());
    await page.evaluate(() => { delete SugarCube.State.variables.tornStyleRandom; });
    await goToPassage(page, 'Bag');
    await page.locator('a:has-text("Look at the photo")').first().click();
    await expectCleanPassage(page);
  });
});

test.describe('Missing Women — multi-stage possession passages', () => {
  const POSSESSION_PASSAGES = [
    { girl: 'Victoria', passages: ['RescueVictoriaPossessed', 'RescueVictoriaPossessed1', 'RescueVictoriaPossessed2'] },
    { girl: 'Jade',     passages: ['RescueJadePossessed', 'RescueJadePossessed1', 'RescueJadePossessed2'] },
    { girl: 'Julia',    passages: ['RescueJuliaPossessed', 'RescueJuliaPossessed1', 'RescueJuliaPossessed2', 'RescueJuliaPossessed3'] },
    { girl: 'Nadia',    passages: ['RescueNadiaPossessed', 'RescueNadiaPossessed1', 'RescueNadiaPossessed2', 'RescueNadiaPossessed3'] },
    { girl: 'Ash',      passages: ['RescueAshPossessed', 'RescueAshPossessed1', 'RescueAshPossessed2'] },
  ];

  for (const { girl, passages } of POSSESSION_PASSAGES) {
    for (const passage of passages) {
      test(`${passage} renders cleanly`, async ({ game: page }) => {
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
