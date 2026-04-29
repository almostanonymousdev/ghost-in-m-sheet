const { test, expect } = require('@playwright/test');
const { openGame, resetGame, setVar, getVar, callSetup } = require('./helpers');

test.describe('Mall Controller', () => {
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

  // --- Open hours ---

  test('isOpen true during business hours (8-21)', async () => {
    // arrange
    await setVar(page, 'hours', 12);

    // act
    const result = await callSetup(page, 'setup.Mall.isOpen()');

    // assert
    expect(result).toBe(true);
  });

  test('isOpen false at hour 7', async () => {
    // arrange
    await setVar(page, 'hours', 7);

    // act
    const result = await callSetup(page, 'setup.Mall.isOpen()');

    // assert
    expect(result).toBe(false);
  });

  test('isOpen false at hour 22', async () => {
    // arrange
    await setVar(page, 'hours', 22);

    // act
    const result = await callSetup(page, 'setup.Mall.isOpen()');

    // assert
    expect(result).toBe(false);
  });

  // --- Blake / adult shop ---

  test('blakeUnlocked requires alice level >= 2', async () => {
    // act
    const beforeLevelUp = await callSetup(page, 'setup.Mall.blakeUnlocked()');
    await page.evaluate(() => { SugarCube.State.variables.alice.lvl = 2; });
    const afterLevelUp = await callSetup(page, 'setup.Mall.blakeUnlocked()');

    // assert
    expect(beforeLevelUp).toBe(false);
    expect(afterLevelUp).toBe(true);
  });

  test('blakeFirstMeeting true when dialogBlake is undefined', async () => {
    // act
    const result = await callSetup(page, 'setup.Mall.blakeFirstMeeting()');

    // assert
    expect(result).toBe(true);
  });

  test('blakeFirstMeeting false after dialog starts', async () => {
    // arrange
    await setVar(page, 'dialogBlake', 1);

    // act
    const result = await callSetup(page, 'setup.Mall.blakeFirstMeeting()');

    // assert
    expect(result).toBe(false);
  });

  test('blakeCanIntroduceCursedItemBuyback requires gotCursedItem defined and dialogBlake != 1', async () => {
    // arrange
    await setVar(page, 'gotCursedItem', 1);

    // act
    const result = await callSetup(page, 'setup.Mall.blakeCanIntroduceCursedItemBuyback()');

    // assert
    expect(result).toBe(true);
  });

  test('blakeCanIntroduceCursedItemBuyback false when dialogBlake is 1', async () => {
    // arrange
    await setVar(page, 'gotCursedItem', 1);
    await setVar(page, 'dialogBlake', 1);

    // act
    const result = await callSetup(page, 'setup.Mall.blakeCanIntroduceCursedItemBuyback()');

    // assert
    expect(result).toBe(false);
  });

  test('blakeHasCursedItemToSell requires gotCursedItem=1 and dialogBlake=1', async () => {
    // arrange
    await setVar(page, 'gotCursedItem', 1);
    await setVar(page, 'dialogBlake', 1);

    // act
    const result = await callSetup(page, 'setup.Mall.blakeHasCursedItemToSell()');

    // assert
    expect(result).toBe(true);
  });

  test('sellCursedItemToBlake clears item flags and adds $60', async () => {
    // arrange
    await setVar(page, 'gotCursedItem', 1);
    await setVar(page, 'isCIDildo', 1);
    await setVar(page, 'isCIButtplug', 1);
    await setVar(page, 'isCIBeads', 1);
    await setVar(page, 'isCIHDildo', 1);
    await setVar(page, 'mc.money', 50);

    // act
    await page.evaluate(() => SugarCube.setup.Mall.sellCursedItemToBlake());

    // assert
    expect(await getVar(page, 'gotCursedItem')).toBe(0);
    expect(await getVar(page, 'isCIDildo')).toBe(0);
    expect(await getVar(page, 'isCIButtplug')).toBe(0);
    expect(await getVar(page, 'isCIBeads')).toBe(0);
    expect(await getVar(page, 'isCIHDildo')).toBe(0);
    expect(await getVar(page, 'mc.money')).toBe(110);
  });

  // --- Blake as companion ---

  test('blakeIsCompanionCandidate requires relationshipBlake >= 5', async () => {
    // arrange
    await setVar(page, 'relationshipBlake', 4);

    // act
    const belowGate = await callSetup(page, 'setup.Mall.blakeIsCompanionCandidate()');
    await setVar(page, 'relationshipBlake', 5);
    const atGate = await callSetup(page, 'setup.Mall.blakeIsCompanionCandidate()');

    // assert
    expect(belowGate).toBe(false);
    expect(atGate).toBe(true);
  });

  test('canRaiseBlakeRelationship true when <= 4', async () => {
    // arrange
    await setVar(page, 'relationshipBlake', 4);

    // act
    const result = await callSetup(page, 'setup.Mall.canRaiseBlakeRelationship()');

    // assert
    expect(result).toBe(true);
  });

  test('canRaiseBlakeRelationship false when > 4', async () => {
    // arrange
    await setVar(page, 'relationshipBlake', 5);

    // act
    const result = await callSetup(page, 'setup.Mall.canRaiseBlakeRelationship()');

    // assert
    expect(result).toBe(false);
  });

  test('canPayForBlakeSoloHunt requires unpaid and $20', async () => {
    // arrange
    await setVar(page, 'mc.money', 20);

    // act
    const result = await callSetup(page, 'setup.Mall.canPayForBlakeSoloHunt()');

    // assert
    expect(result).toBe(true);
  });

  test('canPayForBlakeSoloHunt false when already paid', async () => {
    // arrange
    await setVar(page, 'blake.paidForSolo', 1);
    await setVar(page, 'mc.money', 100);

    // act
    const result = await callSetup(page, 'setup.Mall.canPayForBlakeSoloHunt()');

    // assert
    expect(result).toBe(false);
  });

  test('cannotAffordBlakeSoloHunt when money < 20', async () => {
    // arrange
    await setVar(page, 'mc.money', 19);

    // act
    const result = await callSetup(page, 'setup.Mall.cannotAffordBlakeSoloHunt()');

    // assert
    expect(result).toBe(true);
  });

  test('blakeHuntFinishedAlone checks flag value 2', async () => {
    // act
    const before = await callSetup(page, 'setup.Mall.blakeHuntFinishedAlone()');
    await setVar(page, 'blake.goingSolo', 2);
    const after = await callSetup(page, 'setup.Mall.blakeHuntFinishedAlone()');

    // assert
    expect(before).toBe(false);
    expect(after).toBe(true);
  });

  // --- Warden outfit ---

  test('canBuyWardenOutfit requires wardenClothesStage === 1', async () => {
    // act
    const before = await callSetup(page, 'setup.Mall.canBuyWardenOutfit()');
    await setVar(page, 'wardenClothesStage', 1);
    const after = await callSetup(page, 'setup.Mall.canBuyWardenOutfit()');

    // assert
    expect(before).toBe(false);
    expect(after).toBe(true);
  });

  test('meetsCorruptionForWarden requires corruption >= 3', async () => {
    // arrange
    await setVar(page, 'mc.corruption', 2);

    // act
    const belowGate = await callSetup(page, 'setup.Mall.meetsCorruptionForWarden()');
    await setVar(page, 'mc.corruption', 3);
    const atGate = await callSetup(page, 'setup.Mall.meetsCorruptionForWarden()');

    // assert
    expect(belowGate).toBe(false);
    expect(atGate).toBe(true);
  });

  // --- Pepper spray ---

  test('needsPepperSpray true when hasPSpray undefined', async () => {
    // act
    const result = await callSetup(page, 'setup.Mall.needsPepperSpray()');

    // assert
    expect(result).toBe(true);
  });

  test('needsPepperSpray true when hasPSpray is 0', async () => {
    // arrange
    await setVar(page, 'hasPSpray', 0);

    // act
    const result = await callSetup(page, 'setup.Mall.needsPepperSpray()');

    // assert
    expect(result).toBe(true);
  });

  test('needsPepperSpray false when hasPSpray is truthy', async () => {
    // arrange
    await setVar(page, 'hasPSpray', 1);

    // act
    const result = await callSetup(page, 'setup.Mall.needsPepperSpray()');

    // assert
    expect(result).toBe(false);
  });
});
