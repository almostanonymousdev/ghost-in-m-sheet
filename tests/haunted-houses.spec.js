const { test, expect } = require('@playwright/test');
const { openGame, resetGame, setVar, getVar, setHuntMode, getHuntMode, callSetup } = require('./helpers');

test.describe('Haunted Houses Controller', () => {
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

  // --- Hunt mode states ---

  test('isContractMode true when ghostHuntingMode is 1', async () => {
    // arrange
    await setHuntMode(page, 1);

    // act
    const result = await callSetup(page, 'setup.HauntedHouses.isContractMode()');

    // assert
    expect(result).toBe(true);
  });

  test('isInsideHouse true when ghostHuntingMode is 2', async () => {
    // arrange
    await setHuntMode(page, 2);

    // act
    const result = await callSetup(page, 'setup.HauntedHouses.isInsideHouse()');

    // assert
    expect(result).toBe(true);
  });

  test('isHuntOver true when ghostHuntingMode is 3', async () => {
    // arrange
    await setHuntMode(page, 3);

    // act
    const result = await callSetup(page, 'setup.HauntedHouses.isHuntOver()');

    // assert
    expect(result).toBe(true);
  });

  test('endHunt sets ghostHuntingMode to 3', async () => {
    // arrange
    await setHuntMode(page, 2);

    // act
    await page.evaluate(() => SugarCube.setup.HauntedHouses.endHunt());

    // assert
    expect(await getHuntMode(page)).toBe(3);
  });

  test('hunt mode states are mutually exclusive', async () => {
    // arrange
    await setHuntMode(page, 1);

    // act
    const isContract = await callSetup(page, 'setup.HauntedHouses.isContractMode()');
    const isInside = await callSetup(page, 'setup.HauntedHouses.isInsideHouse()');
    const isOver = await callSetup(page, 'setup.HauntedHouses.isHuntOver()');

    // assert
    expect(isContract).toBe(true);
    expect(isInside).toBe(false);
    expect(isOver).toBe(false);
  });

  // --- House identification ---

  test('isOwaissa checks isOwaissa flag', async () => {
    // act
    const before = await callSetup(page, 'setup.HauntedHouses.isOwaissa()');
    await setVar(page, 'isOwaissa', 1);
    const after = await callSetup(page, 'setup.HauntedHouses.isOwaissa()');

    // assert
    expect(before).toBe(false);
    expect(after).toBe(true);
  });

  test('isElm checks isElm flag', async () => {
    // act
    const before = await callSetup(page, 'setup.HauntedHouses.isElm()');
    await setVar(page, 'isElm', 1);
    const after = await callSetup(page, 'setup.HauntedHouses.isElm()');

    // assert
    expect(before).toBe(false);
    expect(after).toBe(true);
  });

  test('isEnigma checks isEnigma flag', async () => {
    // act
    const before = await callSetup(page, 'setup.HauntedHouses.isEnigma()');
    await setVar(page, 'isEnigma', 1);
    const after = await callSetup(page, 'setup.HauntedHouses.isEnigma()');

    // assert
    expect(before).toBe(false);
    expect(after).toBe(true);
  });

  test('isIronclad checks isIronclad flag', async () => {
    // act
    const before = await callSetup(page, 'setup.HauntedHouses.isIronclad()');
    await setVar(page, 'isIronclad', 1);
    const after = await callSetup(page, 'setup.HauntedHouses.isIronclad()');

    // assert
    expect(before).toBe(false);
    expect(after).toBe(true);
  });

  // --- Clothing aggregation ---

  test('isFullyDressed true with tshirt and jeans', async () => {
    // act
    const result = await callSetup(page, 'setup.HauntedHouses.isFullyDressed()');

    // assert
    expect(result).toBe(true);
  });

  test('isFullyDressed false when topless', async () => {
    // arrange
    await setVar(page, 'tshirtState', 'not worn');

    // act
    const result = await callSetup(page, 'setup.HauntedHouses.isFullyDressed()');

    // assert
    expect(result).toBe(false);
  });

  test('isFullyDressed false when no bottoms', async () => {
    // arrange
    await setVar(page, 'jeansState', 'not worn');
    await setVar(page, 'skirtState', 'not bought');
    await setVar(page, 'shortsState', 'not bought');

    // act
    const result = await callSetup(page, 'setup.HauntedHouses.isFullyDressed()');

    // assert
    expect(result).toBe(false);
  });

  test('isTopless true with bottom but no top', async () => {
    // arrange
    await setVar(page, 'tshirtState', 'not worn');

    // act
    const result = await callSetup(page, 'setup.HauntedHouses.isTopless()');

    // assert
    expect(result).toBe(true);
  });

  test('isTopless false when fully dressed', async () => {
    // act
    const result = await callSetup(page, 'setup.HauntedHouses.isTopless()');

    // assert
    expect(result).toBe(false);
  });

  test('isFullyNude true when all clothes off', async () => {
    // arrange
    await setVar(page, 'tshirtState', 'not worn');
    await setVar(page, 'pantiesState', 'not worn');
    await setVar(page, 'jeansState', 'not worn');
    await setVar(page, 'skirtState', 'not bought');
    await setVar(page, 'shortsState', 'not bought');

    // act
    const result = await callSetup(page, 'setup.HauntedHouses.isFullyNude()');

    // assert
    expect(result).toBe(true);
  });

  test('isFullyNude false when wearing panties', async () => {
    // arrange
    await setVar(page, 'tshirtState', 'not worn');
    await setVar(page, 'pantiesState', 'worn');
    await setVar(page, 'jeansState', 'not worn');
    await setVar(page, 'skirtState', 'not bought');
    await setVar(page, 'shortsState', 'not bought');

    // act
    const result = await callSetup(page, 'setup.HauntedHouses.isFullyNude()');

    // assert
    expect(result).toBe(false);
  });

  test('hasBottomWorn true with skirt instead of jeans', async () => {
    // arrange
    await setVar(page, 'jeansState', 'not worn');
    await setVar(page, 'skirtState', 'worn');

    // act
    const result = await callSetup(page, 'setup.HauntedHouses.hasBottomWorn()');

    // assert
    expect(result).toBe(true);
  });

  test('hasBottomWorn true with shorts instead of jeans', async () => {
    // arrange
    await setVar(page, 'jeansState', 'not worn');
    await setVar(page, 'shortsState', 'worn');

    // act
    const result = await callSetup(page, 'setup.HauntedHouses.hasBottomWorn()');

    // assert
    expect(result).toBe(true);
  });

  // --- Nudity event helpers ---

  test('nudityNakedNoBottoms matches fully nude state', async () => {
    // arrange
    await setVar(page, 'tshirtState', 'not worn');
    await setVar(page, 'pantiesState', 'not worn');
    await setVar(page, 'jeansState', 'not worn');
    await setVar(page, 'skirtState', 'not bought');
    await setVar(page, 'shortsState', 'not bought');

    // act
    const result = await callSetup(page, 'setup.HauntedHouses.nudityNakedNoBottoms()');

    // assert
    expect(result).toBe(true);
  });

  test('nudityToplessWithPanties matches topless-panties state', async () => {
    // arrange
    await setVar(page, 'tshirtState', 'not worn');
    await setVar(page, 'pantiesState', 'worn');
    await setVar(page, 'jeansState', 'not worn');
    await setVar(page, 'skirtState', 'not bought');
    await setVar(page, 'shortsState', 'not bought');

    // act
    const result = await callSetup(page, 'setup.HauntedHouses.nudityToplessWithPanties()');

    // assert
    expect(result).toBe(true);
  });

  // --- Stolen clothes ---

  test('hasClothesStolen checks flag', async () => {
    // act
    const before = await callSetup(page, 'setup.HauntedHouses.hasClothesStolen()');
    await setVar(page, 'isClothesStolen', 1);
    const after = await callSetup(page, 'setup.HauntedHouses.hasClothesStolen()');

    // assert
    expect(before).toBe(false);
    expect(after).toBe(true);
  });

  test('clearStolenClothesFlag resets flag to 0', async () => {
    // arrange
    await setVar(page, 'isClothesStolen', 1);

    // act
    await page.evaluate(() => SugarCube.setup.HauntedHouses.clearStolenClothesFlag());

    // assert
    expect(await getVar(page, 'isClothesStolen')).toBe(0);
  });

  // --- Tool timers ---

  test('resetToolTimers clears all tool activation state', async () => {
    // arrange
    await setVar(page, 'EmfActivationTime', 500);
    await setVar(page, 'uvlActivationTime', 300);
    await setVar(page, 'EmfActivated', 1);
    await setVar(page, 'uvlActivated', 1);

    // act
    await page.evaluate(() => SugarCube.setup.HauntedHouses.resetToolTimers());

    // assert
    expect(await getVar(page, 'EmfActivationTime')).toBe(0);
    expect(await getVar(page, 'uvlActivationTime')).toBe(0);
    expect(await getVar(page, 'EmfActivated')).toBe(0);
    expect(await getVar(page, 'uvlActivated')).toBe(0);
  });

  test('resetEvidenceChecks clears all evidence check flags', async () => {
    // arrange
    await setVar(page, 'EMF5Check', true);
    await setVar(page, 'EctoglassCheck', true);
    await setVar(page, 'GWBCheck', true);
    await setVar(page, 'SpiritboxCheck', true);
    await setVar(page, 'TemperatureCheck', true);
    await setVar(page, 'UVLCheck', true);

    // act
    await page.evaluate(() => SugarCube.setup.HauntedHouses.resetEvidenceChecks());

    // assert
    expect(await getVar(page, 'EMF5Check')).toBe(false);
    expect(await getVar(page, 'EctoglassCheck')).toBe(false);
    expect(await getVar(page, 'GWBCheck')).toBe(false);
    expect(await getVar(page, 'SpiritboxCheck')).toBe(false);
    expect(await getVar(page, 'TemperatureCheck')).toBe(false);
    expect(await getVar(page, 'UVLCheck')).toBe(false);
  });

  // --- Corruption accumulator ---

  test('commitTempCorruption adds temp corruption to mc and resets', async () => {
    // arrange
    await setVar(page, 'mc.corruption', 0);
    await setVar(page, 'tempCorr', 0.5);

    // act
    const amount = await page.evaluate(() =>
      SugarCube.setup.HauntedHouses.commitTempCorruption()
    );

    // assert
    expect(amount).toBe(0.5);
    expect(await getVar(page, 'mc.corruption')).toBe(0.5);
    expect(await getVar(page, 'tempCorr')).toBe(0);
  });

  test('commitTempCorruption caps tempCorr at 1 before applying', async () => {
    // arrange
    await setVar(page, 'mc.corruption', 2);
    await setVar(page, 'tempCorr', 5);

    // act
    await page.evaluate(() =>
      SugarCube.setup.HauntedHouses.commitTempCorruption()
    );

    // assert — tempCorr >= 1 is capped to 1, then added to corruption
    expect(await getVar(page, 'mc.corruption')).toBe(3);
    expect(await getVar(page, 'tempCorr')).toBe(0);
  });

  test('commitTempCorruption does nothing with zero tempCorr', async () => {
    // arrange
    await setVar(page, 'mc.corruption', 5);
    await setVar(page, 'tempCorr', 0);

    // act
    await page.evaluate(() =>
      SugarCube.setup.HauntedHouses.commitTempCorruption()
    );

    // assert
    expect(await getVar(page, 'mc.corruption')).toBe(5);
  });

  // --- Hunt triggers ---

  test('canStartRandomHunt true when not activated and time elapsed', async () => {
    // arrange
    await setVar(page, 'huntActivated', 0);
    await setVar(page, 'elapsedTimeHunt', 10);
    await setVar(page, 'huntTimeRemain', 5);

    // act
    const result = await callSetup(page, 'setup.HauntedHouses.canStartRandomHunt()');

    // assert
    expect(result).toBe(true);
  });

  test('canStartRandomHunt false when already activated', async () => {
    // arrange
    await setVar(page, 'huntActivated', 1);
    await setVar(page, 'elapsedTimeHunt', 100);
    await setVar(page, 'huntTimeRemain', 5);

    // act
    const result = await callSetup(page, 'setup.HauntedHouses.canStartRandomHunt()');

    // assert
    expect(result).toBe(false);
  });

  test('canStartRandomHunt false when not enough time elapsed', async () => {
    // arrange
    await setVar(page, 'huntActivated', 0);
    await setVar(page, 'elapsedTimeHunt', 3);
    await setVar(page, 'huntTimeRemain', 5);

    // act
    const result = await callSetup(page, 'setup.HauntedHouses.canStartRandomHunt()');

    // assert
    expect(result).toBe(false);
  });
});
