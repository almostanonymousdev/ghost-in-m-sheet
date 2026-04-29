const { test, expect } = require('@playwright/test');
const { openGame, resetGame, setVar, getVar, callSetup } = require('./helpers');

test.describe('Companion Controller', () => {
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

  // --- Selection ---

  test('no companion selected by default', async () => {
    // act
    const result = await callSetup(page, 'setup.Companion.anyCompanionSelected()');

    // assert
    expect(result).toBe(false);
  });

  test('selectCompanion sets the correct flag', async () => {
    // act
    await page.evaluate(() => SugarCube.setup.Companion.selectCompanion('Brook'));

    // assert
    expect(await getVar(page, 'brook.chosen')).toBe(1);
    expect(await getVar(page, 'alice.chosen')).toBe(0);
    expect(await callSetup(page, 'setup.Companion.anyCompanionSelected()')).toBe(true);
  });

  test('selectCompanion clears previous selection', async () => {
    // arrange
    await page.evaluate(() => SugarCube.setup.Companion.selectCompanion('Brook'));

    // act
    await page.evaluate(() => SugarCube.setup.Companion.selectCompanion('Alice'));

    // assert
    expect(await getVar(page, 'brook.chosen')).toBe(0);
    expect(await getVar(page, 'alice.chosen')).toBe(1);
  });

  test('clearCompanionSelection resets all flags', async () => {
    // arrange
    await page.evaluate(() => SugarCube.setup.Companion.selectCompanion('Blake'));

    // act
    await page.evaluate(() => SugarCube.setup.Companion.clearCompanionSelection());

    // assert
    expect(await callSetup(page, 'setup.Companion.anyCompanionSelected()')).toBe(false);
  });

  // --- Sanity tiers ---

  test('sanityTier returns "high" when companion sanity >= 75', async () => {
    // arrange
    await setVar(page, 'companion', { name: 'Brook', sanity: 80, lust: 0 });

    // act
    const tier = await callSetup(page, 'setup.Companion.sanityTier()');

    // assert
    expect(tier).toBe('high');
  });

  test('sanityTier returns "mid" when companion sanity is 50-74', async () => {
    // arrange
    await setVar(page, 'companion', { name: 'Brook', sanity: 60, lust: 0 });

    // act
    const tier = await callSetup(page, 'setup.Companion.sanityTier()');

    // assert
    expect(tier).toBe('mid');
  });

  test('sanityTier returns "low" when companion sanity is 25-49', async () => {
    // arrange
    await setVar(page, 'companion', { name: 'Brook', sanity: 30, lust: 0 });

    // act
    const tier = await callSetup(page, 'setup.Companion.sanityTier()');

    // assert
    expect(tier).toBe('low');
  });

  test('sanityTier returns "critical" when companion sanity < 25', async () => {
    // arrange
    await setVar(page, 'companion', { name: 'Brook', sanity: 10, lust: 0 });

    // act
    const tier = await callSetup(page, 'setup.Companion.sanityTier()');

    // assert
    expect(tier).toBe('critical');
  });

  test('sanityTier boundary: exactly 75 is "high"', async () => {
    // arrange
    await setVar(page, 'companion', { name: 'Brook', sanity: 75, lust: 0 });

    // act
    const tier = await callSetup(page, 'setup.Companion.sanityTier()');

    // assert
    expect(tier).toBe('high');
  });

  test('sanityTier boundary: exactly 50 is "mid"', async () => {
    // arrange
    await setVar(page, 'companion', { name: 'Brook', sanity: 50, lust: 0 });

    // act
    const tier = await callSetup(page, 'setup.Companion.sanityTier()');

    // assert
    expect(tier).toBe('mid');
  });

  test('sanityTier boundary: exactly 25 is "low"', async () => {
    // arrange
    await setVar(page, 'companion', { name: 'Brook', sanity: 25, lust: 0 });

    // act
    const tier = await callSetup(page, 'setup.Companion.sanityTier()');

    // assert
    expect(tier).toBe('low');
  });

  // --- Lust ---

  test('isLustHigh returns true when companion lust >= 50', async () => {
    // arrange
    await setVar(page, 'companion', { name: 'Brook', sanity: 100, lust: 55 });

    // act
    const result = await callSetup(page, 'setup.Companion.isLustHigh()');

    // assert
    expect(result).toBe(true);
  });

  test('isLustHigh returns false when companion lust < 50', async () => {
    // arrange
    await setVar(page, 'companion', { name: 'Brook', sanity: 100, lust: 30 });

    // act
    const result = await callSetup(page, 'setup.Companion.isLustHigh()');

    // assert
    expect(result).toBe(false);
  });

  // --- Walk home ---

  test('canWalkHomeWithCompanion requires bottom clothing', async () => {
    // act
    const result = await callSetup(page, 'setup.Companion.canWalkHomeWithCompanion()');

    // assert
    expect(result).toBe(true);
  });

  test('canWalkHomeWithCompanion false when no bottoms worn', async () => {
    // arrange
    await setVar(page, 'jeansState', 'not worn');
    await setVar(page, 'skirtState', 'not bought');
    await setVar(page, 'shortsState', 'not bought');

    // act
    const result = await callSetup(page, 'setup.Companion.canWalkHomeWithCompanion()');

    // assert
    expect(result).toBe(false);
  });

  test('canWalkHomeWithCompanion true with skirt', async () => {
    // arrange
    await setVar(page, 'jeansState', 'not worn');
    await setVar(page, 'skirtState', 'worn');

    // act
    const result = await callSetup(page, 'setup.Companion.canWalkHomeWithCompanion()');

    // assert
    expect(result).toBe(true);
  });

  // --- Sanity pills ---

  test('giveSanityPill decrements pills and heals companion', async () => {
    // arrange
    await setVar(page, 'sanityPillsAmount', 3);
    await setVar(page, 'companion', { name: 'Brook', sanity: 50, lust: 0 });

    // act
    const result = await page.evaluate(() =>
      SugarCube.setup.Companion.giveSanityPill()
    );

    // assert
    expect(result).toBe(true);
    expect(await getVar(page, 'sanityPillsAmount')).toBe(2);
    expect(await getVar(page, 'companion.sanity')).toBe(80);
  });

  test('giveSanityPill caps sanity at 100', async () => {
    // arrange
    await setVar(page, 'sanityPillsAmount', 1);
    await setVar(page, 'companion', { name: 'Brook', sanity: 85, lust: 0 });

    // act
    await page.evaluate(() => SugarCube.setup.Companion.giveSanityPill());

    // assert
    expect(await getVar(page, 'companion.sanity')).toBe(100);
  });

  test('giveSanityPill fails with no pills', async () => {
    // arrange
    await setVar(page, 'sanityPillsAmount', 0);
    await setVar(page, 'companion', { name: 'Brook', sanity: 50, lust: 0 });

    // act
    const result = await page.evaluate(() =>
      SugarCube.setup.Companion.giveSanityPill()
    );

    // assert
    expect(result).toBe(false);
  });

  test('giveSanityPill fails when companion at full sanity', async () => {
    // arrange
    await setVar(page, 'sanityPillsAmount', 5);
    await setVar(page, 'companion', { name: 'Brook', sanity: 100, lust: 0 });

    // act
    const result = await page.evaluate(() =>
      SugarCube.setup.Companion.giveSanityPill()
    );

    // assert
    expect(result).toBe(false);
    expect(await getVar(page, 'sanityPillsAmount')).toBe(5);
  });

  // --- Solo hunt ---

  test('canAffordSoloContract true with >= $20', async () => {
    // arrange
    await setVar(page, 'mc.money', 20);

    // act
    const result = await callSetup(page, 'setup.Companion.canAffordSoloContract()');

    // assert
    expect(result).toBe(true);
  });

  test('canAffordSoloContract false with < $20', async () => {
    // arrange
    await setVar(page, 'mc.money', 19);

    // act
    const result = await callSetup(page, 'setup.Companion.canAffordSoloContract()');

    // assert
    expect(result).toBe(false);
  });

  test('payForSoloContract deducts money and sets flag', async () => {
    // arrange
    await setVar(page, 'mc.money', 100);

    // act
    await page.evaluate(() =>
      SugarCube.setup.Companion.payForSoloContract('Brook')
    );

    // assert
    expect(await getVar(page, 'mc.money')).toBe(80);
    expect(await getVar(page, 'brook.paidForSolo')).toBe(1);
  });

  test('payForSoloContract does not double-charge', async () => {
    // arrange
    await setVar(page, 'mc.money', 100);
    await setVar(page, 'brook.paidForSolo', 1);

    // act
    await page.evaluate(() =>
      SugarCube.setup.Companion.payForSoloContract('Brook')
    );

    // assert
    expect(await getVar(page, 'mc.money')).toBe(100);
  });

  // --- Hunt state reset ---

  test('resetHuntState clears all hunt tracking variables', async () => {
    // arrange
    await setVar(page, 'chosenPlan', 'Plan1');
    await setVar(page, 'chosenPlanActivated', 1);
    await setVar(page, 'randomGhostPassage', 5);
    await setVar(page, 'isCompRoomChosen', 1);
    await setVar(page, 'showComp', 1);
    await setVar(page, 'isCompChosen', 1);

    // act
    await page.evaluate(() => SugarCube.setup.Companion.resetHuntState());

    // assert
    expect(await getVar(page, 'chosenPlan')).toBe(0);
    expect(await getVar(page, 'chosenPlanActivated')).toBe(0);
    expect(await getVar(page, 'randomGhostPassage')).toBe(0);
    expect(await getVar(page, 'isCompRoomChosen')).toBe(0);
    expect(await getVar(page, 'showComp')).toBe(0);
    expect(await getVar(page, 'isCompChosen')).toBe(0);
  });

  // --- Cursed item ---

  test('cursedItemQuestUnlocked false when gotCursedItem is undefined', async () => {
    // act
    const result = await callSetup(page, 'setup.Companion.cursedItemQuestUnlocked()');

    // assert
    expect(result).toBe(false);
  });

  test('cursedItemQuestUnlocked true when gotCursedItem is defined', async () => {
    // arrange
    await setVar(page, 'gotCursedItem', 1);

    // act
    const result = await callSetup(page, 'setup.Companion.cursedItemQuestUnlocked()');

    // assert
    expect(result).toBe(true);
  });

  test('hasCursedItem true only when gotCursedItem is 1', async () => {
    // arrange
    await setVar(page, 'gotCursedItem', 0);

    // act
    const resultWhenZero = await callSetup(page, 'setup.Companion.hasCursedItem()');
    await setVar(page, 'gotCursedItem', 1);
    const resultWhenOne = await callSetup(page, 'setup.Companion.hasCursedItem()');

    // assert
    expect(resultWhenZero).toBe(false);
    expect(resultWhenOne).toBe(true);
  });

  // --- Haunted house location ---

  test('inHauntedHouseLocation true for Owaissa', async () => {
    // arrange
    await setVar(page, 'hauntedHouse', 'owaissa');

    // act
    const result = await callSetup(page, 'setup.Companion.inHauntedHouseLocation()');

    // assert
    expect(result).toBe(true);
  });

  test('inHauntedHouseLocation true for Elm', async () => {
    // arrange
    await setVar(page, 'hauntedHouse', 'elm');

    // act
    const result = await callSetup(page, 'setup.Companion.inHauntedHouseLocation()');

    // assert
    expect(result).toBe(true);
  });

  test('inHauntedHouseLocation false when not in either house', async () => {
    // arrange
    await setVar(page, 'hauntedHouse', null);

    // act
    const result = await callSetup(page, 'setup.Companion.inHauntedHouseLocation()');

    // assert
    expect(result).toBe(false);
  });
});
