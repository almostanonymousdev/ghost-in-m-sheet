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

  test('managerBJOnCooldown checks deliveryBJ flag', async () => {
    // act
    const beforeCD = await callSetup(page, 'setup.Delivery.managerBJOnCooldown()');
    await setVar(page, 'deliveryBJ', 1);
    const afterCD = await callSetup(page, 'setup.Delivery.managerBJOnCooldown()');

    // assert
    expect(beforeCD).toBe(false);
    expect(afterCD).toBe(true);
  });

  test('hasMetManagerEvent does not throw', async () => {
    // act — State.hasVisited is not a function; the correct global is hasVisited()
    const result = await callSetup(page, 'setup.Delivery.hasMetManagerEvent()');

    // assert
    expect(result).toBe(false);
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

  // --- Pay tiers ---

  test('updatePayTier sets base pay from tier table', async () => {
    // arrange
    await setVar(page, 'deliveryCompletedShifts', 0);
    await setVar(page, 'deliveryBestStreak', 0);

    // act
    await callSetup(page, 'setup.Delivery.updatePayTier()');
    const basePay = await getVar(page, 'jobMoneySuccessed');

    // assert
    expect(basePay).toBe(10);
  });

  test('updatePayTier increases pay at 5 shifts', async () => {
    // arrange
    await setVar(page, 'deliveryCompletedShifts', 5);
    await setVar(page, 'deliveryBestStreak', 0);

    // act
    await callSetup(page, 'setup.Delivery.updatePayTier()');
    const basePay = await getVar(page, 'jobMoneySuccessed');

    // assert
    expect(basePay).toBe(12);
  });

  test('updatePayTier increases pay at 12 shifts', async () => {
    // arrange
    await setVar(page, 'deliveryCompletedShifts', 12);
    await setVar(page, 'deliveryBestStreak', 0);

    // act
    await callSetup(page, 'setup.Delivery.updatePayTier()');
    const basePay = await getVar(page, 'jobMoneySuccessed');

    // assert
    expect(basePay).toBe(15);
  });

  test('updatePayTier includes reputation bonus', async () => {
    // arrange - 25 shifts + streak of 10 = Trusted (+$4)
    await setVar(page, 'deliveryCompletedShifts', 25);
    await setVar(page, 'deliveryBestStreak', 10);

    // act
    await callSetup(page, 'setup.Delivery.updatePayTier()');
    const basePay = await getVar(page, 'jobMoneySuccessed');

    // assert — tier base $18 + reputation bonus $4
    expect(basePay).toBe(22);
  });

  // --- Reputation ---

  test('reputationLevel returns 0 with no streak', async () => {
    // arrange
    await setVar(page, 'deliveryBestStreak', 0);

    // act
    const level = await callSetup(page, 'setup.Delivery.reputationLevel()');

    // assert
    expect(level).toBe(0);
  });

  test('reputationLevel returns 1 at streak 5', async () => {
    // arrange
    await setVar(page, 'deliveryBestStreak', 5);

    // act
    const level = await callSetup(page, 'setup.Delivery.reputationLevel()');

    // assert
    expect(level).toBe(1);
  });

  test('reputationLevel returns 2 at streak 10', async () => {
    // arrange
    await setVar(page, 'deliveryBestStreak', 10);

    // act
    const level = await callSetup(page, 'setup.Delivery.reputationLevel()');

    // assert
    expect(level).toBe(2);
  });

  test('reputationLevel returns 3 at streak 20', async () => {
    // arrange
    await setVar(page, 'deliveryBestStreak', 20);

    // act
    const level = await callSetup(page, 'setup.Delivery.reputationLevel()');

    // assert
    expect(level).toBe(3);
  });

  test('reputationLabel returns Newbie at level 0', async () => {
    // arrange
    await setVar(page, 'deliveryBestStreak', 0);

    // act
    const label = await callSetup(page, 'setup.Delivery.reputationLabel()');

    // assert
    expect(label).toBe('Newbie');
  });

  test('reputationLabel returns Star Courier at level 3', async () => {
    // arrange
    await setVar(page, 'deliveryBestStreak', 20);

    // act
    const label = await callSetup(page, 'setup.Delivery.reputationLabel()');

    // assert
    expect(label).toBe('Star Courier');
  });

  test('deliveryTime returns 30 normally', async () => {
    // arrange
    await setVar(page, 'deliveryBestStreak', 0);

    // act
    const time = await callSetup(page, 'setup.Delivery.deliveryTime()');

    // assert
    expect(time).toBe(30);
  });

  test('deliveryTime returns 20 at reputation level 3', async () => {
    // arrange
    await setVar(page, 'deliveryBestStreak', 20);

    // act
    const time = await callSetup(page, 'setup.Delivery.deliveryTime()');

    // assert
    expect(time).toBe(20);
  });

  // --- Route familiarity ---

  test('isRouteFamiliar false with no visits', async () => {
    // arrange
    await setVar(page, 'deliveryVisitCounts', {});

    // act
    const result = await callSetup(page, "setup.Delivery.isRouteFamiliar('Star Street 25')");

    // assert
    expect(result).toBe(false);
  });

  test('isRouteFamiliar true after 3 visits', async () => {
    // arrange
    await setVar(page, 'deliveryVisitCounts', { 'Star Street 25': 3 });

    // act
    const result = await callSetup(page, "setup.Delivery.isRouteFamiliar('Star Street 25')");

    // assert
    expect(result).toBe(true);
  });

  test('trackVisit increments visit count', async () => {
    // arrange
    await setVar(page, 'deliveryVisitCounts', {});
    await setVar(page, 'currentHouse', 'Star Street 25');

    // act
    await callSetup(page, "setup.Delivery.trackVisit('Star Street 25')");
    await callSetup(page, "setup.Delivery.trackVisit('Star Street 25')");
    const counts = await getVar(page, 'deliveryVisitCounts');

    // assert
    expect(counts['Star Street 25']).toBe(2);
  });
});
