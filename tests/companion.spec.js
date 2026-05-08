const { test, expect } = require('./fixtures');
const { setVar, getVar, callSetup } = require('./helpers');

test.describe('Companion Controller', () => {
  // --- Selection ---

  test('no companion selected by default', async ({ game: page }) => {
    // act
    const result = await callSetup(page, 'setup.Companion.anyCompanionSelected()');

    // assert
    expect(result).toBe(false);
  });

  test('selectCompanion sets the correct flag', async ({ game: page }) => {
    // act
    await page.evaluate(() => SugarCube.setup.Companion.selectCompanion('Brook'));

    // assert
    expect(await getVar(page, 'brook.chosen')).toBe(1);
    expect(await getVar(page, 'alice.chosen')).toBe(0);
    expect(await callSetup(page, 'setup.Companion.anyCompanionSelected()')).toBe(true);
  });

  test('selectCompanion clears previous selection', async ({ game: page }) => {
    // arrange
    await page.evaluate(() => SugarCube.setup.Companion.selectCompanion('Brook'));

    // act
    await page.evaluate(() => SugarCube.setup.Companion.selectCompanion('Alice'));

    // assert
    expect(await getVar(page, 'brook.chosen')).toBe(0);
    expect(await getVar(page, 'alice.chosen')).toBe(1);
  });

  test('clearCompanionSelection resets all flags', async ({ game: page }) => {
    // arrange
    await page.evaluate(() => SugarCube.setup.Companion.selectCompanion('Blake'));

    // act
    await page.evaluate(() => SugarCube.setup.Companion.clearCompanionSelection());

    // assert
    expect(await callSetup(page, 'setup.Companion.anyCompanionSelected()')).toBe(false);
  });

  // --- Sanity tiers ---

  test('sanityTier returns "high" when companion sanity >= 75', async ({ game: page }) => {
    // arrange
    await setVar(page, 'companion', { name: 'Brook', sanity: 80, lust: 0 });

    // act
    const tier = await callSetup(page, 'setup.Companion.sanityTier()');

    // assert
    expect(tier).toBe('high');
  });

  test('sanityTier returns "mid" when companion sanity is 50-74', async ({ game: page }) => {
    // arrange
    await setVar(page, 'companion', { name: 'Brook', sanity: 60, lust: 0 });

    // act
    const tier = await callSetup(page, 'setup.Companion.sanityTier()');

    // assert
    expect(tier).toBe('mid');
  });

  test('sanityTier returns "low" when companion sanity is 25-49', async ({ game: page }) => {
    // arrange
    await setVar(page, 'companion', { name: 'Brook', sanity: 30, lust: 0 });

    // act
    const tier = await callSetup(page, 'setup.Companion.sanityTier()');

    // assert
    expect(tier).toBe('low');
  });

  test('sanityTier returns "critical" when companion sanity < 25', async ({ game: page }) => {
    // arrange
    await setVar(page, 'companion', { name: 'Brook', sanity: 10, lust: 0 });

    // act
    const tier = await callSetup(page, 'setup.Companion.sanityTier()');

    // assert
    expect(tier).toBe('critical');
  });

  test('sanityTier boundary: exactly 75 is "high"', async ({ game: page }) => {
    // arrange
    await setVar(page, 'companion', { name: 'Brook', sanity: 75, lust: 0 });

    // act
    const tier = await callSetup(page, 'setup.Companion.sanityTier()');

    // assert
    expect(tier).toBe('high');
  });

  test('sanityTier boundary: exactly 50 is "mid"', async ({ game: page }) => {
    // arrange
    await setVar(page, 'companion', { name: 'Brook', sanity: 50, lust: 0 });

    // act
    const tier = await callSetup(page, 'setup.Companion.sanityTier()');

    // assert
    expect(tier).toBe('mid');
  });

  test('sanityTier boundary: exactly 25 is "low"', async ({ game: page }) => {
    // arrange
    await setVar(page, 'companion', { name: 'Brook', sanity: 25, lust: 0 });

    // act
    const tier = await callSetup(page, 'setup.Companion.sanityTier()');

    // assert
    expect(tier).toBe('low');
  });

  // --- Lust ---

  test('isLustHigh returns true when companion lust >= 50', async ({ game: page }) => {
    // arrange
    await setVar(page, 'companion', { name: 'Brook', sanity: 100, lust: 55 });

    // act
    const result = await callSetup(page, 'setup.Companion.isLustHigh()');

    // assert
    expect(result).toBe(true);
  });

  test('isLustHigh returns false when companion lust < 50', async ({ game: page }) => {
    // arrange
    await setVar(page, 'companion', { name: 'Brook', sanity: 100, lust: 30 });

    // act
    const result = await callSetup(page, 'setup.Companion.isLustHigh()');

    // assert
    expect(result).toBe(false);
  });

  // --- Walk home ---

  test('canWalkHomeWithCompanion requires bottom clothing', async ({ game: page }) => {
    // act
    const result = await callSetup(page, 'setup.Companion.canWalkHomeWithCompanion()');

    // assert
    expect(result).toBe(true);
  });

  test('canWalkHomeWithCompanion false when no bottoms worn', async ({ game: page }) => {
    // arrange
    await setVar(page, 'jeansState', 'not worn');
    await setVar(page, 'skirtState', 'not bought');
    await setVar(page, 'shortsState', 'not bought');

    // act
    const result = await callSetup(page, 'setup.Companion.canWalkHomeWithCompanion()');

    // assert
    expect(result).toBe(false);
  });

  test('canWalkHomeWithCompanion true with skirt', async ({ game: page }) => {
    // arrange
    await setVar(page, 'jeansState', 'not worn');
    await setVar(page, 'skirtState', 'worn');

    // act
    const result = await callSetup(page, 'setup.Companion.canWalkHomeWithCompanion()');

    // assert
    expect(result).toBe(true);
  });

  // --- Sanity pills ---

  test('giveSanityPill decrements pills and heals companion', async ({ game: page }) => {
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

  test('giveSanityPill caps sanity at 100', async ({ game: page }) => {
    // arrange
    await setVar(page, 'sanityPillsAmount', 1);
    await setVar(page, 'companion', { name: 'Brook', sanity: 85, lust: 0 });

    // act
    await page.evaluate(() => SugarCube.setup.Companion.giveSanityPill());

    // assert
    expect(await getVar(page, 'companion.sanity')).toBe(100);
  });

  test('giveSanityPill fails with no pills', async ({ game: page }) => {
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

  test('giveSanityPill fails when companion at full sanity', async ({ game: page }) => {
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

  test('canAffordSoloContract true with >= $20', async ({ game: page }) => {
    // arrange
    await setVar(page, 'mc.money', 20);

    // act
    const result = await callSetup(page, 'setup.Companion.canAffordSoloContract()');

    // assert
    expect(result).toBe(true);
  });

  test('canAffordSoloContract false with < $20', async ({ game: page }) => {
    // arrange
    await setVar(page, 'mc.money', 19);

    // act
    const result = await callSetup(page, 'setup.Companion.canAffordSoloContract()');

    // assert
    expect(result).toBe(false);
  });

  test('payForSoloContract deducts money and sets flag', async ({ game: page }) => {
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

  test('payForSoloContract does not double-charge', async ({ game: page }) => {
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

  test('resetHuntState clears all hunt tracking variables', async ({ game: page }) => {
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

  test('cursedItemQuestUnlocked false when gotCursedItem is undefined', async ({ game: page }) => {
    // act
    const result = await callSetup(page, 'setup.Companion.cursedItemQuestUnlocked()');

    // assert
    expect(result).toBe(false);
  });

  test('cursedItemQuestUnlocked true when gotCursedItem is defined', async ({ game: page }) => {
    // arrange
    await setVar(page, 'gotCursedItem', 1);

    // act
    const result = await callSetup(page, 'setup.Companion.cursedItemQuestUnlocked()');

    // assert
    expect(result).toBe(true);
  });

  test('hasCursedItem true only when gotCursedItem is 1', async ({ game: page }) => {
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

  test('inHauntedHouseLocation true for Owaissa', async ({ game: page }) => {
    // arrange
    await setVar(page, 'hauntedHouse', 'owaissa');

    // act
    const result = await callSetup(page, 'setup.Companion.inHauntedHouseLocation()');

    // assert
    expect(result).toBe(true);
  });

  test('inHauntedHouseLocation true for Elm', async ({ game: page }) => {
    // arrange
    await setVar(page, 'hauntedHouse', 'elm');

    // act
    const result = await callSetup(page, 'setup.Companion.inHauntedHouseLocation()');

    // assert
    expect(result).toBe(true);
  });

  test('inHauntedHouseLocation false when not in either house', async ({ game: page }) => {
    // arrange
    await setVar(page, 'hauntedHouse', null);

    // act
    const result = await callSetup(page, 'setup.Companion.inHauntedHouseLocation()');

    // assert
    expect(result).toBe(false);
  });

  // --- CompanionEvent dialog catalogue ---

  test('eventTextForTier returns Brook copy for cis companion', async ({ game: page }) => {
    const text = await callSetup(page, 'setup.Companion.getByName("Brook").eventTextForTier(1)');
    expect(text).toContain('She was naked and visibly shaken');
  });

  test('eventTextForTier returns null outside tiers 1..4', async ({ game: page }) => {
    const t0 = await callSetup(page, 'setup.Companion.getByName("Brook").eventTextForTier(0)');
    const t5 = await callSetup(page, 'setup.Companion.getByName("Brook").eventTextForTier(5)');
    expect(t0).toBeNull();
    expect(t5).toBeNull();
  });

  test('eventTextForTier picks trans pre-stage by default', async ({ game: page }) => {
    await setVar(page, 'transFirstStage', undefined);
    const text = await callSetup(page, 'setup.Companion.getByName("Alex").eventTextForTier(1)');
    expect(text).toContain('a figure that clearly belongs to a female body');
  });

  test('eventTextForTier picks trans post-stage once flag is set', async ({ game: page }) => {
    await setVar(page, 'transFirstStage', 1);
    const text = await callSetup(page, 'setup.Companion.getByName("Alex").eventTextForTier(1)');
    expect(text).toContain('the body has become irresistibly feminine');
  });

  test('eventTextForTier returns same trans copy for all trans companions', async ({ game: page }) => {
    await setVar(page, 'transFirstStage', 1);
    const alex   = await callSetup(page, 'setup.Companion.getByName("Alex").eventTextForTier(2)');
    const taylor = await callSetup(page, 'setup.Companion.getByName("Taylor").eventTextForTier(2)');
    const casey  = await callSetup(page, 'setup.Companion.getByName("Casey").eventTextForTier(2)');
    expect(alex).toBe(taylor);
    expect(taylor).toBe(casey);
    expect(alex).toContain('the ghost defiling');
  });
});
