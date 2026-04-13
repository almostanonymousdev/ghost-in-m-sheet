const { test, expect } = require('@playwright/test');
const { openGame, resetGame, setVar, getVar, callSetup } = require('./helpers');

test.describe('Delivery Controller', () => {
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

  test('isOpen true during business hours (8-19)', async () => {
    // arrange
    await setVar(page, 'hours', 12);

    // act
    const result = await callSetup(page, 'setup.Delivery.isOpen()');

    // assert
    expect(result).toBe(true);
  });

  test('isOpen false at hour 7 (boundary)', async () => {
    // arrange
    await setVar(page, 'hours', 7);

    // act
    const result = await callSetup(page, 'setup.Delivery.isOpen()');

    // assert
    expect(result).toBe(false);
  });

  test('isOpen false at hour 20 (boundary)', async () => {
    // arrange
    await setVar(page, 'hours', 20);

    // act
    const result = await callSetup(page, 'setup.Delivery.isOpen()');

    // assert
    expect(result).toBe(false);
  });

  test('isOpen true at hour 8', async () => {
    // arrange
    await setVar(page, 'hours', 8);

    // act
    const result = await callSetup(page, 'setup.Delivery.isOpen()');

    // assert
    expect(result).toBe(true);
  });

  test('isOpen true at hour 19', async () => {
    // arrange
    await setVar(page, 'hours', 19);

    // act
    const result = await callSetup(page, 'setup.Delivery.isOpen()');

    // assert
    expect(result).toBe(true);
  });

  test('isOpen false at night', async () => {
    // arrange
    await setVar(page, 'hours', 23);

    // act
    const result = await callSetup(page, 'setup.Delivery.isOpen()');

    // assert
    expect(result).toBe(false);
  });

  // --- First visit ---

  test('isFirstVisit true by default', async () => {
    // act
    const result = await callSetup(page, 'setup.Delivery.isFirstVisit()');

    // assert
    expect(result).toBe(true);
  });

  test('isFirstVisit false after clearing flag', async () => {
    // arrange
    await setVar(page, 'firstVisitDeliveryHub', false);

    // act
    const result = await callSetup(page, 'setup.Delivery.isFirstVisit()');

    // assert
    expect(result).toBe(false);
  });

  // --- Energy for shift ---

  test('hasEnergyForShift true with energy >= 2', async () => {
    // arrange
    await setVar(page, 'mc.energy', 5);

    // act
    const result = await callSetup(page, 'setup.Delivery.hasEnergyForShift()');

    // assert
    expect(result).toBe(true);
  });

  test('hasEnergyForShift true at exactly 2', async () => {
    // arrange
    await setVar(page, 'mc.energy', 2);

    // act
    const result = await callSetup(page, 'setup.Delivery.hasEnergyForShift()');

    // assert
    expect(result).toBe(true);
  });

  test('hasEnergyForShift false with energy < 2', async () => {
    // arrange
    await setVar(page, 'mc.energy', 1);

    // act
    const result = await callSetup(page, 'setup.Delivery.hasEnergyForShift()');

    // assert
    expect(result).toBe(false);
  });

  // --- canStartShift (composite) ---

  test('canStartShift true when not first visit, open, and has energy', async () => {
    // arrange
    await setVar(page, 'firstVisitDeliveryHub', false);
    await setVar(page, 'hours', 12);
    await setVar(page, 'mc.energy', 5);

    // act
    const result = await callSetup(page, 'setup.Delivery.canStartShift()');

    // assert
    expect(result).toBe(true);
  });

  test('canStartShift false on first visit', async () => {
    // arrange
    await setVar(page, 'hours', 12);
    await setVar(page, 'mc.energy', 5);

    // act
    const result = await callSetup(page, 'setup.Delivery.canStartShift()');

    // assert
    expect(result).toBe(false);
  });

  test('canStartShift false when closed', async () => {
    // arrange
    await setVar(page, 'firstVisitDeliveryHub', false);
    await setVar(page, 'hours', 23);
    await setVar(page, 'mc.energy', 5);

    // act
    const result = await callSetup(page, 'setup.Delivery.canStartShift()');

    // assert
    expect(result).toBe(false);
  });

  test('canStartShift false when too tired', async () => {
    // arrange
    await setVar(page, 'firstVisitDeliveryHub', false);
    await setVar(page, 'hours', 12);
    await setVar(page, 'mc.energy', 1);

    // act
    const result = await callSetup(page, 'setup.Delivery.canStartShift()');

    // assert
    expect(result).toBe(false);
  });

  // --- tooTiredForShift ---

  test('tooTiredForShift true when open but no energy', async () => {
    // arrange
    await setVar(page, 'firstVisitDeliveryHub', false);
    await setVar(page, 'hours', 12);
    await setVar(page, 'mc.energy', 0);

    // act
    const result = await callSetup(page, 'setup.Delivery.tooTiredForShift()');

    // assert
    expect(result).toBe(true);
  });

  test('tooTiredForShift false when has energy', async () => {
    // arrange
    await setVar(page, 'firstVisitDeliveryHub', false);
    await setVar(page, 'hours', 12);
    await setVar(page, 'mc.energy', 5);

    // act
    const result = await callSetup(page, 'setup.Delivery.tooTiredForShift()');

    // assert
    expect(result).toBe(false);
  });

  // --- Manager event ---

  test('meetsBeautyForManagerFlirt true at beauty >= 45', async () => {
    // arrange
    await setVar(page, 'mc.beauty', 45);

    // act
    const result = await callSetup(page, 'setup.Delivery.meetsBeautyForManagerFlirt()');

    // assert
    expect(result).toBe(true);
  });

  test('meetsBeautyForManagerFlirt false at beauty < 45', async () => {
    // arrange
    await setVar(page, 'mc.beauty', 44);

    // act
    const result = await callSetup(page, 'setup.Delivery.meetsBeautyForManagerFlirt()');

    // assert
    expect(result).toBe(false);
  });

  test('managerWillPayExtra true at corruption >= 2', async () => {
    // arrange
    await setVar(page, 'mc.corruption', 2);

    // act
    const result = await callSetup(page, 'setup.Delivery.managerWillPayExtra()');

    // assert
    expect(result).toBe(true);
  });

  test('managerWillPayExtra false at corruption < 2', async () => {
    // arrange
    await setVar(page, 'mc.corruption', 1);

    // act
    const result = await callSetup(page, 'setup.Delivery.managerWillPayExtra()');

    // assert
    expect(result).toBe(false);
  });

  test('managerBJOnCooldown checks deliveryBJCD flag', async () => {
    // act
    const beforeCD = await callSetup(page, 'setup.Delivery.managerBJOnCooldown()');
    await setVar(page, 'deliveryBJCD', 1);
    const afterCD = await callSetup(page, 'setup.Delivery.managerBJOnCooldown()');

    // assert
    expect(beforeCD).toBe(false);
    expect(afterCD).toBe(true);
  });

  // --- Corruption gates ---

  test('canAcceptPizzaDeal requires corruption >= 3', async () => {
    // arrange
    await setVar(page, 'mc.corruption', 2);

    // act
    const belowGate = await callSetup(page, 'setup.Delivery.canAcceptPizzaDeal()');
    await setVar(page, 'mc.corruption', 3);
    const atGate = await callSetup(page, 'setup.Delivery.canAcceptPizzaDeal()');

    // assert
    expect(belowGate).toBe(false);
    expect(atGate).toBe(true);
  });

  test('canAcceptPackageDeal requires corruption >= 3', async () => {
    // arrange
    await setVar(page, 'mc.corruption', 2);

    // act
    const belowGate = await callSetup(page, 'setup.Delivery.canAcceptPackageDeal()');
    await setVar(page, 'mc.corruption', 3);
    const atGate = await callSetup(page, 'setup.Delivery.canAcceptPackageDeal()');

    // assert
    expect(belowGate).toBe(false);
    expect(atGate).toBe(true);
  });

  test('canAcceptBurgerWeed requires corruption >= 4', async () => {
    // arrange
    await setVar(page, 'mc.corruption', 3);

    // act
    const belowGate = await callSetup(page, 'setup.Delivery.canAcceptBurgerWeed()');
    await setVar(page, 'mc.corruption', 4);
    const atGate = await callSetup(page, 'setup.Delivery.canAcceptBurgerWeed()');

    // assert
    expect(belowGate).toBe(false);
    expect(atGate).toBe(true);
  });

  test('canAcceptPapersFlirt requires corruption >= 3', async () => {
    // arrange
    await setVar(page, 'mc.corruption', 2);

    // act
    const belowGate = await callSetup(page, 'setup.Delivery.canAcceptPapersFlirt()');
    await setVar(page, 'mc.corruption', 3);
    const atGate = await callSetup(page, 'setup.Delivery.canAcceptPapersFlirt()');

    // assert
    expect(belowGate).toBe(false);
    expect(atGate).toBe(true);
  });

  // --- Lust gates ---

  test('papersLustHighEnough requires lust >= 40', async () => {
    // arrange
    await setVar(page, 'mc.lust', 39);

    // act
    const belowGate = await callSetup(page, 'setup.Delivery.papersLustHighEnough()');
    await setVar(page, 'mc.lust', 40);
    const atGate = await callSetup(page, 'setup.Delivery.papersLustHighEnough()');

    // assert
    expect(belowGate).toBe(false);
    expect(atGate).toBe(true);
  });

  test('papersInitialLustHighEnough requires lust >= 30', async () => {
    // arrange
    await setVar(page, 'mc.lust', 29);

    // act
    const belowGate = await callSetup(page, 'setup.Delivery.papersInitialLustHighEnough()');
    await setVar(page, 'mc.lust', 30);
    const atGate = await callSetup(page, 'setup.Delivery.papersInitialLustHighEnough()');

    // assert
    expect(belowGate).toBe(false);
    expect(atGate).toBe(true);
  });

  test('packageLustHighEnough requires lust > 49', async () => {
    // arrange
    await setVar(page, 'mc.lust', 49);

    // act
    const belowGate = await callSetup(page, 'setup.Delivery.packageLustHighEnough()');
    await setVar(page, 'mc.lust', 50);
    const atGate = await callSetup(page, 'setup.Delivery.packageLustHighEnough()');

    // assert
    expect(belowGate).toBe(false);
    expect(atGate).toBe(true);
  });

  test('papersStillCorruptible requires corruption <= 3', async () => {
    // arrange
    await setVar(page, 'mc.corruption', 3);

    // act
    const atLimit = await callSetup(page, 'setup.Delivery.papersStillCorruptible()');
    await setVar(page, 'mc.corruption', 4);
    const pastLimit = await callSetup(page, 'setup.Delivery.papersStillCorruptible()');

    // assert
    expect(atLimit).toBe(true);
    expect(pastLimit).toBe(false);
  });
});
