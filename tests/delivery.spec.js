const { test, expect } = require('./fixtures');
const { setVar, getVar, callSetup } = require('./helpers');

test.describe('Delivery Controller', () => {
  // --- Open hours ---

  test('isOpen true during business hours (8-19)', async ({ game: page }) => {
    // arrange
    await setVar(page, 'hours', 12);

    // act
    const result = await callSetup(page, 'setup.Delivery.isOpen()');

    // assert
    expect(result).toBe(true);
  });

  test('isOpen false at hour 7 (boundary)', async ({ game: page }) => {
    // arrange
    await setVar(page, 'hours', 7);

    // act
    const result = await callSetup(page, 'setup.Delivery.isOpen()');

    // assert
    expect(result).toBe(false);
  });

  test('isOpen false at hour 20 (boundary)', async ({ game: page }) => {
    // arrange
    await setVar(page, 'hours', 20);

    // act
    const result = await callSetup(page, 'setup.Delivery.isOpen()');

    // assert
    expect(result).toBe(false);
  });

  test('isOpen true at hour 8', async ({ game: page }) => {
    // arrange
    await setVar(page, 'hours', 8);

    // act
    const result = await callSetup(page, 'setup.Delivery.isOpen()');

    // assert
    expect(result).toBe(true);
  });

  test('isOpen true at hour 19', async ({ game: page }) => {
    // arrange
    await setVar(page, 'hours', 19);

    // act
    const result = await callSetup(page, 'setup.Delivery.isOpen()');

    // assert
    expect(result).toBe(true);
  });

  test('isOpen false at night', async ({ game: page }) => {
    // arrange
    await setVar(page, 'hours', 23);

    // act
    const result = await callSetup(page, 'setup.Delivery.isOpen()');

    // assert
    expect(result).toBe(false);
  });

  // --- First visit ---

  test('isFirstVisit true by default', async ({ game: page }) => {
    // act
    const result = await callSetup(page, 'setup.Delivery.isFirstVisit()');

    // assert
    expect(result).toBe(true);
  });

  test('isFirstVisit false after clearing flag', async ({ game: page }) => {
    // arrange
    await setVar(page, 'firstVisitDeliveryHub', false);

    // act
    const result = await callSetup(page, 'setup.Delivery.isFirstVisit()');

    // assert
    expect(result).toBe(false);
  });

  // --- Energy for shift ---

  test('hasEnergyForShift true with energy >= 2', async ({ game: page }) => {
    // arrange
    await setVar(page, 'mc.energy', 5);

    // act
    const result = await callSetup(page, 'setup.Delivery.hasEnergyForShift()');

    // assert
    expect(result).toBe(true);
  });

  test('hasEnergyForShift true at exactly 2', async ({ game: page }) => {
    // arrange
    await setVar(page, 'mc.energy', 2);

    // act
    const result = await callSetup(page, 'setup.Delivery.hasEnergyForShift()');

    // assert
    expect(result).toBe(true);
  });

  test('hasEnergyForShift false with energy < 2', async ({ game: page }) => {
    // arrange
    await setVar(page, 'mc.energy', 1);

    // act
    const result = await callSetup(page, 'setup.Delivery.hasEnergyForShift()');

    // assert
    expect(result).toBe(false);
  });

  // --- canStartShift (composite) ---

  test('canStartShift true when not first visit, open, and has energy', async ({ game: page }) => {
    // arrange
    await setVar(page, 'firstVisitDeliveryHub', false);
    await setVar(page, 'hours', 12);
    await setVar(page, 'mc.energy', 5);

    // act
    const result = await callSetup(page, 'setup.Delivery.canStartShift()');

    // assert
    expect(result).toBe(true);
  });

  test('canStartShift false on first visit', async ({ game: page }) => {
    // arrange
    await setVar(page, 'hours', 12);
    await setVar(page, 'mc.energy', 5);

    // act
    const result = await callSetup(page, 'setup.Delivery.canStartShift()');

    // assert
    expect(result).toBe(false);
  });

  test('canStartShift false when closed', async ({ game: page }) => {
    // arrange
    await setVar(page, 'firstVisitDeliveryHub', false);
    await setVar(page, 'hours', 23);
    await setVar(page, 'mc.energy', 5);

    // act
    const result = await callSetup(page, 'setup.Delivery.canStartShift()');

    // assert
    expect(result).toBe(false);
  });

  test('canStartShift false when too tired', async ({ game: page }) => {
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

  test('tooTiredForShift true when open but no energy', async ({ game: page }) => {
    // arrange
    await setVar(page, 'firstVisitDeliveryHub', false);
    await setVar(page, 'hours', 12);
    await setVar(page, 'mc.energy', 0);

    // act
    const result = await callSetup(page, 'setup.Delivery.tooTiredForShift()');

    // assert
    expect(result).toBe(true);
  });

  test('tooTiredForShift false when has energy', async ({ game: page }) => {
    // arrange
    await setVar(page, 'firstVisitDeliveryHub', false);
    await setVar(page, 'hours', 12);
    await setVar(page, 'mc.energy', 5);

    // act
    const result = await callSetup(page, 'setup.Delivery.tooTiredForShift()');

    // assert
    expect(result).toBe(false);
  });

  // --- Once-per-day shift cap ---

  test('shiftDoneToday false when cooldown is clear', async ({ game: page }) => {
    // arrange
    await setVar(page, 'deliveryShiftDone', 0);

    // act
    const result = await callSetup(page, 'setup.Delivery.shiftDoneToday()');

    // assert
    expect(result).toBe(false);
  });

  test('shiftDoneToday true after initShift stamps the cooldown', async ({ game: page }) => {
    // arrange
    await setVar(page, 'deliveryShiftDone', 0);

    // act
    await callSetup(page, 'setup.Delivery.initShift()');
    const result = await callSetup(page, 'setup.Delivery.shiftDoneToday()');

    // assert
    expect(result).toBe(true);
  });

  test('canStartShift false when shift already done today', async ({ game: page }) => {
    // arrange — all other gates open
    await setVar(page, 'firstVisitDeliveryHub', false);
    await setVar(page, 'hours', 12);
    await setVar(page, 'mc.energy', 5);
    await setVar(page, 'deliveryShiftDone', 1);

    // act
    const result = await callSetup(page, 'setup.Delivery.canStartShift()');

    // assert
    expect(result).toBe(false);
  });

  test('tooTiredForShift false when shift already done today (no double-message)', async ({ game: page }) => {
    // shiftDoneToday should suppress the "too tired" branch so the
    // hub doesn't show both messages at once.
    // arrange
    await setVar(page, 'firstVisitDeliveryHub', false);
    await setVar(page, 'hours', 12);
    await setVar(page, 'mc.energy', 0);
    await setVar(page, 'deliveryShiftDone', 1);

    // act
    const result = await callSetup(page, 'setup.Delivery.tooTiredForShift()');

    // assert
    expect(result).toBe(false);
  });

  test('deliveryShiftDone is registered as a daily cooldown', async ({ game: page }) => {
    // act
    const list = await callSetup(page, 'setup.Cooldowns.listDaily()');

    // assert
    expect(list).toContain('deliveryShiftDone');
  });

  // --- Manager event ---

  test('meetsBeautyForManagerFlirt true at beauty >= 35', async ({ game: page }) => {
    // arrange
    await callSetup(page, `setup.Mc.setBeauty(35)`);

    // act
    const result = await callSetup(page, 'setup.Delivery.meetsBeautyForManagerFlirt()');

    // assert
    expect(result).toBe(true);
  });

  test('meetsBeautyForManagerFlirt false at beauty < 35', async ({ game: page }) => {
    // arrange
    await callSetup(page, `setup.Mc.setBeauty(34)`);

    // act
    const result = await callSetup(page, 'setup.Delivery.meetsBeautyForManagerFlirt()');

    // assert
    expect(result).toBe(false);
  });

  test('canSeduceManager true at corruption >= 2', async ({ game: page }) => {
    // arrange
    await setVar(page, 'mc.corruption', 2);

    // act
    const result = await callSetup(page, 'setup.Delivery.canSeduceManager()');

    // assert
    expect(result).toBe(true);
  });

  test('canSeduceManager false at corruption < 2', async ({ game: page }) => {
    // arrange
    await setVar(page, 'mc.corruption', 1);

    // act
    const result = await callSetup(page, 'setup.Delivery.canSeduceManager()');

    // assert
    expect(result).toBe(false);
  });

  test('canOfferHandjob true at corruption >= 2', async ({ game: page }) => {
    await setVar(page, 'mc.corruption', 2);
    expect(await callSetup(page, 'setup.Delivery.canOfferHandjob()')).toBe(true);
  });

  test('canOfferHandjob false at corruption < 2', async ({ game: page }) => {
    await setVar(page, 'mc.corruption', 1);
    expect(await callSetup(page, 'setup.Delivery.canOfferHandjob()')).toBe(false);
  });

  test('canOfferBlowjob requires corruption >= 3 and beauty >= 40', async ({ game: page }) => {
    await setVar(page, 'mc.corruption', 3);
    await callSetup(page, 'setup.Mc.setBeauty(40)');
    expect(await callSetup(page, 'setup.Delivery.canOfferBlowjob()')).toBe(true);

    await setVar(page, 'mc.corruption', 2);
    await callSetup(page, 'setup.Mc.setBeauty(40)');
    expect(await callSetup(page, 'setup.Delivery.canOfferBlowjob()')).toBe(false);

    await setVar(page, 'mc.corruption', 3);
    await callSetup(page, 'setup.Mc.setBeauty(39)');
    expect(await callSetup(page, 'setup.Delivery.canOfferBlowjob()')).toBe(false);
  });

  test('canOfferSex requires corruption >= 4 and beauty >= 45', async ({ game: page }) => {
    await setVar(page, 'mc.corruption', 4);
    await callSetup(page, 'setup.Mc.setBeauty(45)');
    expect(await callSetup(page, 'setup.Delivery.canOfferSex()')).toBe(true);

    await setVar(page, 'mc.corruption', 3);
    await callSetup(page, 'setup.Mc.setBeauty(45)');
    expect(await callSetup(page, 'setup.Delivery.canOfferSex()')).toBe(false);

    await setVar(page, 'mc.corruption', 4);
    await callSetup(page, 'setup.Mc.setBeauty(44)');
    expect(await callSetup(page, 'setup.Delivery.canOfferSex()')).toBe(false);
  });

  test('managerSceneReward returns the per-kind reward bundle', async ({ game: page }) => {
    const hj = await callSetup(page, 'setup.Delivery.managerSceneReward("handjob")');
    expect(hj).toEqual({ money: 15, exp: 5, corruption: 0.25, lust: 10 });

    const bj = await callSetup(page, 'setup.Delivery.managerSceneReward("blowjob")');
    expect(bj).toEqual({ money: 25, exp: 10, corruption: 0.5, lust: 30 });

    const sx = await callSetup(page, 'setup.Delivery.managerSceneReward("sex")');
    expect(sx).toEqual({ money: 40, exp: 20, corruption: 1, lust: 50 });
  });

  test('managerBJOnCooldown checks deliveryBJ flag', async ({ game: page }) => {
    // act
    const beforeCD = await callSetup(page, 'setup.Delivery.managerBJOnCooldown()');
    await setVar(page, 'deliveryBJ', 1);
    const afterCD = await callSetup(page, 'setup.Delivery.managerBJOnCooldown()');

    // assert
    expect(beforeCD).toBe(false);
    expect(afterCD).toBe(true);
  });

  test('hasMetManagerEvent does not throw', async ({ game: page }) => {
    // act — State.hasVisited is not a function; the correct global is hasVisited()
    const result = await callSetup(page, 'setup.Delivery.hasMetManagerEvent()');

    // assert
    expect(result).toBe(false);
  });

  // --- Corruption gates ---

  test('canAcceptPizzaDeal requires corruption >= 3', async ({ game: page }) => {
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

  test('canAcceptPackageDeal requires corruption >= 3', async ({ game: page }) => {
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

  test('canAcceptBurgerWeed requires corruption >= 4', async ({ game: page }) => {
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

  test('canAcceptPapersFlirt requires corruption >= 3', async ({ game: page }) => {
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

  test('papersLustHighEnough requires lust >= 40', async ({ game: page }) => {
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

  test('papersInitialLustHighEnough requires lust >= 30', async ({ game: page }) => {
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

  test('packageLustHighEnough requires lust > 49', async ({ game: page }) => {
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

  test('papersStillCorruptible requires corruption <= 3', async ({ game: page }) => {
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

  test('updatePayTier sets base pay from tier table', async ({ game: page }) => {
    // arrange
    await setVar(page, 'deliveryCompletedShifts', 0);
    await setVar(page, 'deliveryBestStreak', 0);

    // act
    await callSetup(page, 'setup.Delivery.updatePayTier()');
    const basePay = await getVar(page, 'jobMoneySuccessed');

    // assert
    expect(basePay).toBe(10);
  });

  test('updatePayTier increases pay at 5 shifts', async ({ game: page }) => {
    // arrange
    await setVar(page, 'deliveryCompletedShifts', 5);
    await setVar(page, 'deliveryBestStreak', 0);

    // act
    await callSetup(page, 'setup.Delivery.updatePayTier()');
    const basePay = await getVar(page, 'jobMoneySuccessed');

    // assert
    expect(basePay).toBe(12);
  });

  test('updatePayTier increases pay at 12 shifts', async ({ game: page }) => {
    // arrange
    await setVar(page, 'deliveryCompletedShifts', 12);
    await setVar(page, 'deliveryBestStreak', 0);

    // act
    await callSetup(page, 'setup.Delivery.updatePayTier()');
    const basePay = await getVar(page, 'jobMoneySuccessed');

    // assert
    expect(basePay).toBe(15);
  });

  test('updatePayTier includes reputation bonus', async ({ game: page }) => {
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

  test('reputationLevel returns 0 with no streak', async ({ game: page }) => {
    // arrange
    await setVar(page, 'deliveryBestStreak', 0);

    // act
    const level = await callSetup(page, 'setup.Delivery.reputationLevel()');

    // assert
    expect(level).toBe(0);
  });

  test('reputationLevel returns 1 at streak 5', async ({ game: page }) => {
    // arrange
    await setVar(page, 'deliveryBestStreak', 5);

    // act
    const level = await callSetup(page, 'setup.Delivery.reputationLevel()');

    // assert
    expect(level).toBe(1);
  });

  test('reputationLevel returns 2 at streak 10', async ({ game: page }) => {
    // arrange
    await setVar(page, 'deliveryBestStreak', 10);

    // act
    const level = await callSetup(page, 'setup.Delivery.reputationLevel()');

    // assert
    expect(level).toBe(2);
  });

  test('reputationLevel returns 3 at streak 20', async ({ game: page }) => {
    // arrange
    await setVar(page, 'deliveryBestStreak', 20);

    // act
    const level = await callSetup(page, 'setup.Delivery.reputationLevel()');

    // assert
    expect(level).toBe(3);
  });

  test('reputationLabel returns Newbie at level 0', async ({ game: page }) => {
    // arrange
    await setVar(page, 'deliveryBestStreak', 0);

    // act
    const label = await callSetup(page, 'setup.Delivery.reputationLabel()');

    // assert
    expect(label).toBe('Newbie');
  });

  test('reputationLabel returns Star Courier at level 3', async ({ game: page }) => {
    // arrange
    await setVar(page, 'deliveryBestStreak', 20);

    // act
    const label = await callSetup(page, 'setup.Delivery.reputationLabel()');

    // assert
    expect(label).toBe('Star Courier');
  });

  test('deliveryTime returns 30 normally', async ({ game: page }) => {
    // arrange
    await setVar(page, 'deliveryBestStreak', 0);

    // act
    const time = await callSetup(page, 'setup.Delivery.deliveryTime()');

    // assert
    expect(time).toBe(30);
  });

  test('deliveryTime returns 20 at reputation level 3', async ({ game: page }) => {
    // arrange
    await setVar(page, 'deliveryBestStreak', 20);

    // act
    const time = await callSetup(page, 'setup.Delivery.deliveryTime()');

    // assert
    expect(time).toBe(20);
  });

  // --- Unified delivery-event catalogue & dispatch helpers ---

  test('eventNameForItem maps order items to catalogue keys', async ({ game: page }) => {
    expect(await callSetup(page, "setup.Delivery.eventNameForItem('pizza')")).toBe('pizza');
    expect(await callSetup(page, "setup.Delivery.eventNameForItem('package')")).toBe('package');
    expect(await callSetup(page, "setup.Delivery.eventNameForItem('burgers')")).toBe('burger');
    expect(await callSetup(page, "setup.Delivery.eventNameForItem('newspapers')")).toBe('papers');
    expect(await callSetup(page, "setup.Delivery.eventNameForItem('books')")).toBe(null);
    expect(await callSetup(page, "setup.Delivery.eventNameForItem('mystery')")).toBe(null);
  });

  test('currentEventType reads the order in the active slot', async ({ game: page }) => {
    // arrange — slot 2 holds a burgers order
    await setVar(page, 'currentOrder', 2);
    await setVar(page, 'order2', { address: 'Star Street 25', item: 'burgers', image: '' });

    // act
    const ev = await callSetup(page, 'setup.Delivery.currentEventType()');

    // assert
    expect(ev).toBe('burger');
  });

  test('currentEventType returns null for non-encounter items', async ({ game: page }) => {
    // arrange — books has no encounter (Alice intercepts)
    await setVar(page, 'currentOrder', 1);
    await setVar(page, 'order1', { address: 'Star Street 25', item: 'books', image: '' });

    // act
    const ev = await callSetup(page, 'setup.Delivery.currentEventType()');

    // assert
    expect(ev).toBe(null);
  });

  test('markEvent sets the cooldown var named in the catalogue', async ({ game: page }) => {
    // arrange
    await setVar(page, 'deliveryBurgerEvent', 0);

    // act
    await callSetup(page, "setup.Delivery.markEvent('burger')");
    const flag = await getVar(page, 'deliveryBurgerEvent');

    // assert
    expect(flag).toBe(1);
  });

  test('markEvent is a no-op for unknown names (no throw)', async ({ game: page }) => {
    // act / assert — must not throw, must not touch unrelated vars
    await callSetup(page, "setup.Delivery.markEvent('does-not-exist')");
  });

  test('per-item markXxxEvent helpers go through the catalogue', async ({ game: page }) => {
    // arrange
    await setVar(page, 'deliveryPizzaEvent', 0);
    await setVar(page, 'deliveryPackageEvent', 0);
    await setVar(page, 'deliveryPapersEvent', 0);

    // act
    await callSetup(page, 'setup.Delivery.markPizzaEvent()');
    await callSetup(page, 'setup.Delivery.markPackageEvent()');
    await callSetup(page, 'setup.Delivery.markPapersEvent()');

    // assert
    expect(await getVar(page, 'deliveryPizzaEvent')).toBe(1);
    expect(await getVar(page, 'deliveryPackageEvent')).toBe(1);
    expect(await getVar(page, 'deliveryPapersEvent')).toBe(1);
  });

  // --- markDeliveryFailed (declined lewd encounter = failed delivery) ---

  // ON_ENTRY encounters (burger/package/papers) pre-pay a success the
  // instant their gate renders, so declining must unwind that pre-pay
  // before booking the small fail fee.
  test('markDeliveryFailed unwinds an ON_ENTRY pre-pay then books the fail fee', async ({ game: page }) => {
    // arrange — base tier: success $10, fail $3; burger is ON_ENTRY
    await setVar(page, 'deliveryCompletedShifts', 0);
    await setVar(page, 'deliveryBestStreak', 0);
    await callSetup(page, 'setup.Delivery.updatePayTier()');
    await setVar(page, 'currentOrder', 0);
    await setVar(page, 'order0', { address: 'Star Street 25', item: 'burgers', image: '' });
    // simulate the gate render: pre-paid one success + one correct-credit
    await setVar(page, 'earnedMoney', 10);
    await setVar(page, 'deliveryCorrectThisShift', 1);

    // act
    await callSetup(page, 'setup.Delivery.markDeliveryFailed()');

    // assert — pre-pay reversed (+10 → 0), fail fee booked (+3); credit reversed
    expect(await getVar(page, 'earnedMoney')).toBe(3);
    expect(await getVar(page, 'deliveryCorrectThisShift')).toBe(0);
  });

  test('markDeliveryFailed never drives correct-credit below zero', async ({ game: page }) => {
    // arrange — ON_ENTRY burger, but no correct-credit on the books yet
    await setVar(page, 'deliveryCompletedShifts', 0);
    await setVar(page, 'deliveryBestStreak', 0);
    await callSetup(page, 'setup.Delivery.updatePayTier()');
    await setVar(page, 'currentOrder', 0);
    await setVar(page, 'order0', { address: 'Star Street 25', item: 'burgers', image: '' });
    await setVar(page, 'earnedMoney', 10);
    await setVar(page, 'deliveryCorrectThisShift', 0);

    // act
    await callSetup(page, 'setup.Delivery.markDeliveryFailed()');

    // assert — money still unwinds, but the streak counter floors at 0
    expect(await getVar(page, 'earnedMoney')).toBe(3);
    expect(await getVar(page, 'deliveryCorrectThisShift')).toBe(0);
  });

  test('markDeliveryFailed on an ON_DONE encounter just books the fail fee', async ({ game: page }) => {
    // arrange — pizza is ON_DONE, so there is no pre-pay to unwind
    await setVar(page, 'deliveryCompletedShifts', 0);
    await setVar(page, 'deliveryBestStreak', 0);
    await callSetup(page, 'setup.Delivery.updatePayTier()');
    await setVar(page, 'currentOrder', 0);
    await setVar(page, 'order0', { address: 'Star Street 25', item: 'pizza', image: '' });
    await setVar(page, 'earnedMoney', 0);
    await setVar(page, 'deliveryCorrectThisShift', 0);

    // act
    await callSetup(page, 'setup.Delivery.markDeliveryFailed()');

    // assert — only the fail fee, no correct-credit touched
    expect(await getVar(page, 'earnedMoney')).toBe(3);
    expect(await getVar(page, 'deliveryCorrectThisShift')).toBe(0);
  });

  test('markDeliveryFailed with no active encounter books the fail fee only', async ({ game: page }) => {
    // arrange — books has no encounter (currentEventType null)
    await setVar(page, 'deliveryCompletedShifts', 0);
    await setVar(page, 'deliveryBestStreak', 0);
    await callSetup(page, 'setup.Delivery.updatePayTier()');
    await setVar(page, 'currentOrder', 0);
    await setVar(page, 'order0', { address: 'Star Street 25', item: 'books', image: '' });
    await setVar(page, 'earnedMoney', 0);
    await setVar(page, 'deliveryCorrectThisShift', 0);

    // act
    await callSetup(page, 'setup.Delivery.markDeliveryFailed()');

    // assert
    expect(await getVar(page, 'earnedMoney')).toBe(3);
    expect(await getVar(page, 'deliveryCorrectThisShift')).toBe(0);
  });

  test('a failed delivery cannot count toward the 3-correct perfect shift', async ({ game: page }) => {
    // arrange — two clean deliveries already banked this shift, then a
    // burger gate renders (pre-pays the third) and MC declines.
    await setVar(page, 'deliveryCompletedShifts', 0);
    await setVar(page, 'deliveryBestStreak', 0);
    await callSetup(page, 'setup.Delivery.updatePayTier()');
    await setVar(page, 'currentOrder', 0);
    await setVar(page, 'order0', { address: 'Star Street 25', item: 'burgers', image: '' });
    await setVar(page, 'deliveryCorrectThisShift', 2);
    // gate render pre-pays the third correct-credit + success
    await callSetup(page, 'setup.Delivery.incrementCorrectThisShift()');
    expect(await getVar(page, 'deliveryCorrectThisShift')).toBe(3);

    // act — decline unwinds the pre-paid credit
    await callSetup(page, 'setup.Delivery.markDeliveryFailed()');

    // assert — back below the perfect-shift threshold of 3
    expect(await getVar(page, 'deliveryCorrectThisShift')).toBe(2);
  });
});
