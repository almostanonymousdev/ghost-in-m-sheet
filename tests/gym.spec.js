const { test, expect } = require('@playwright/test');
const { openGame, resetGame, setVar, getVar, callSetup } = require('./helpers');

test.describe('Gym Controller', () => {
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

  test('isOpen true during operating hours (8-21)', async () => {
    // arrange
    await setVar(page, 'hours', 12);

    // act
    const result = await callSetup(page, 'setup.Gym.isOpen()');

    // assert
    expect(result).toBe(true);
  });

  test('isOpen false at hour 7 (boundary)', async () => {
    // arrange
    await setVar(page, 'hours', 7);

    // act
    const result = await callSetup(page, 'setup.Gym.isOpen()');

    // assert
    expect(result).toBe(false);
  });

  test('isOpen false at hour 22 (boundary)', async () => {
    // arrange
    await setVar(page, 'hours', 22);

    // act
    const result = await callSetup(page, 'setup.Gym.isOpen()');

    // assert
    expect(result).toBe(false);
  });

  // --- Time-of-day slots ---

  test('isMorning true from 8 to 11', async () => {
    // arrange
    await setVar(page, 'hours', 8);

    // act
    const atStart = await callSetup(page, 'setup.Gym.isMorning()');
    await setVar(page, 'hours', 11);
    const atEnd = await callSetup(page, 'setup.Gym.isMorning()');

    // assert
    expect(atStart).toBe(true);
    expect(atEnd).toBe(true);
  });

  test('isMorning false at 12', async () => {
    // arrange
    await setVar(page, 'hours', 12);

    // act
    const result = await callSetup(page, 'setup.Gym.isMorning()');

    // assert
    expect(result).toBe(false);
  });

  test('isAfternoon true from 12 to 16', async () => {
    // arrange
    await setVar(page, 'hours', 12);

    // act
    const atStart = await callSetup(page, 'setup.Gym.isAfternoon()');
    await setVar(page, 'hours', 16);
    const atEnd = await callSetup(page, 'setup.Gym.isAfternoon()');

    // assert
    expect(atStart).toBe(true);
    expect(atEnd).toBe(true);
  });

  test('isAfternoon false at 17', async () => {
    // arrange
    await setVar(page, 'hours', 17);

    // act
    const result = await callSetup(page, 'setup.Gym.isAfternoon()');

    // assert
    expect(result).toBe(false);
  });

  test('isEvening true from 17 to 22', async () => {
    // arrange
    await setVar(page, 'hours', 17);

    // act
    const atStart = await callSetup(page, 'setup.Gym.isEvening()');
    await setVar(page, 'hours', 22);
    const atEnd = await callSetup(page, 'setup.Gym.isEvening()');

    // assert
    expect(atStart).toBe(true);
    expect(atEnd).toBe(true);
  });

  test('isEvening false at 23', async () => {
    // arrange
    await setVar(page, 'hours', 23);

    // act
    const result = await callSetup(page, 'setup.Gym.isEvening()');

    // assert
    expect(result).toBe(false);
  });

  // --- Group class time ---

  test('isGroupClassTime true at 12 and 13', async () => {
    // arrange
    await setVar(page, 'hours', 12);

    // act
    const atNoon = await callSetup(page, 'setup.Gym.isGroupClassTime()');
    await setVar(page, 'hours', 13);
    const atOne = await callSetup(page, 'setup.Gym.isGroupClassTime()');

    // assert
    expect(atNoon).toBe(true);
    expect(atOne).toBe(true);
  });

  test('isGroupClassTime false outside 12-13', async () => {
    // arrange
    await setVar(page, 'hours', 11);

    // act
    const before = await callSetup(page, 'setup.Gym.isGroupClassTime()');
    await setVar(page, 'hours', 14);
    const after = await callSetup(page, 'setup.Gym.isGroupClassTime()');

    // assert
    expect(before).toBe(false);
    expect(after).toBe(false);
  });

  // --- Solo training slots ---

  test('soloSlotMorning covers 8-12', async () => {
    // arrange
    await setVar(page, 'hours', 8);

    // act
    const atStart = await callSetup(page, 'setup.Gym.soloSlotMorning()');
    await setVar(page, 'hours', 12);
    const atEnd = await callSetup(page, 'setup.Gym.soloSlotMorning()');
    await setVar(page, 'hours', 13);
    const pastEnd = await callSetup(page, 'setup.Gym.soloSlotMorning()');

    // assert
    expect(atStart).toBe(true);
    expect(atEnd).toBe(true);
    expect(pastEnd).toBe(false);
  });

  test('soloSlotAfternoon covers 13-17', async () => {
    // arrange
    await setVar(page, 'hours', 13);

    // act
    const atStart = await callSetup(page, 'setup.Gym.soloSlotAfternoon()');
    await setVar(page, 'hours', 17);
    const atEnd = await callSetup(page, 'setup.Gym.soloSlotAfternoon()');
    await setVar(page, 'hours', 18);
    const pastEnd = await callSetup(page, 'setup.Gym.soloSlotAfternoon()');

    // assert
    expect(atStart).toBe(true);
    expect(atEnd).toBe(true);
    expect(pastEnd).toBe(false);
  });

  test('soloSlotEvening covers 18-22', async () => {
    // arrange
    await setVar(page, 'hours', 18);

    // act
    const atStart = await callSetup(page, 'setup.Gym.soloSlotEvening()');
    await setVar(page, 'hours', 22);
    const atEnd = await callSetup(page, 'setup.Gym.soloSlotEvening()');
    await setVar(page, 'hours', 23);
    const pastEnd = await callSetup(page, 'setup.Gym.soloSlotEvening()');

    // assert
    expect(atStart).toBe(true);
    expect(atEnd).toBe(true);
    expect(pastEnd).toBe(false);
  });

  // --- Training cost ---

  test('computeTrainingCost returns default price in morning without discount', async () => {
    // arrange
    await setVar(page, 'hours', 9);

    // act
    const cost = await callSetup(page, 'setup.Gym.computeTrainingCost()');

    // assert
    expect(cost).toBe(15);
  });

  test('computeTrainingCost returns 0 in morning with trainer1 discount', async () => {
    // arrange
    await setVar(page, 'hours', 9);
    await setVar(page, 'trainer1CoachingCost', 0);

    // act
    const cost = await callSetup(page, 'setup.Gym.computeTrainingCost()');

    // assert
    expect(cost).toBe(0);
  });

  test('computeTrainingCost always 15 in afternoon', async () => {
    // arrange
    await setVar(page, 'hours', 14);

    // act
    const cost = await callSetup(page, 'setup.Gym.computeTrainingCost()');

    // assert
    expect(cost).toBe(15);
  });

  test('computeTrainingCost returns default in evening without discount', async () => {
    // arrange
    await setVar(page, 'hours', 19);

    // act
    const cost = await callSetup(page, 'setup.Gym.computeTrainingCost()');

    // assert
    expect(cost).toBe(15);
  });

  test('computeTrainingCost returns 0 in evening with trainer3 discount', async () => {
    // arrange
    await setVar(page, 'hours', 19);
    await setVar(page, 'trainer3CoachingCost', 0);

    // act
    const cost = await callSetup(page, 'setup.Gym.computeTrainingCost()');

    // assert
    expect(cost).toBe(0);
  });

  // --- Player capability checks ---

  test('hasSportswear false by default', async () => {
    // act
    const result = await callSetup(page, 'setup.Gym.hasSportswear()');

    // assert
    expect(result).toBe(false);
  });

  test('hasSportswear true when sportswear is defined', async () => {
    // arrange
    await setVar(page, 'sportswear', 1);

    // act
    const result = await callSetup(page, 'setup.Gym.hasSportswear()');

    // assert
    expect(result).toBe(true);
  });

  test('hasEnergyToTrain requires energy >= 5', async () => {
    // arrange
    await setVar(page, 'mc.energy', 5);

    // act
    const atThreshold = await callSetup(page, 'setup.Gym.hasEnergyToTrain()');
    await setVar(page, 'mc.energy', 4);
    const belowThreshold = await callSetup(page, 'setup.Gym.hasEnergyToTrain()');

    // assert
    expect(atThreshold).toBe(true);
    expect(belowThreshold).toBe(false);
  });

  test('canTrainSolo requires sportswear and energy', async () => {
    // arrange
    await setVar(page, 'sportswear', 1);
    await setVar(page, 'mc.energy', 5);

    // act
    const result = await callSetup(page, 'setup.Gym.canTrainSolo()');

    // assert
    expect(result).toBe(true);
  });

  test('canTrainSolo false without sportswear', async () => {
    // arrange
    await setVar(page, 'mc.energy', 5);

    // act
    const result = await callSetup(page, 'setup.Gym.canTrainSolo()');

    // assert
    expect(result).toBe(false);
  });

  test('canTrainSolo false without enough energy', async () => {
    // arrange
    await setVar(page, 'sportswear', 1);
    await setVar(page, 'mc.energy', 4);

    // act
    const result = await callSetup(page, 'setup.Gym.canTrainSolo()');

    // assert
    expect(result).toBe(false);
  });

  // --- Trainer events ---

  test('trainer1OnCooldown checks CD flag', async () => {
    // act
    const before = await callSetup(page, 'setup.Gym.trainer1OnCooldown()');
    await setVar(page, 'trainer1Sex', 1);
    const after = await callSetup(page, 'setup.Gym.trainer1OnCooldown()');

    // assert
    expect(before).toBe(false);
    expect(after).toBe(true);
  });

  test('trainer2OnCooldown checks CD flag', async () => {
    // act
    const before = await callSetup(page, 'setup.Gym.trainer2OnCooldown()');
    await setVar(page, 'trainer2Sex', 1);
    const after = await callSetup(page, 'setup.Gym.trainer2OnCooldown()');

    // assert
    expect(before).toBe(false);
    expect(after).toBe(true);
  });

  test('meetsFitForTrainer2Event requires fit >= 30', async () => {
    // arrange
    await setVar(page, 'mc.fit', 29);

    // act
    const belowGate = await callSetup(page, 'setup.Gym.meetsFitForTrainer2Event()');
    await setVar(page, 'mc.fit', 30);
    const atGate = await callSetup(page, 'setup.Gym.meetsFitForTrainer2Event()');

    // assert
    expect(belowGate).toBe(false);
    expect(atGate).toBe(true);
  });

  test('hasSexyLingerieForTrainer1 requires matching lingerie set', async () => {
    // arrange
    await setVar(page, 'rememberBottomStockings', 'stockings2');
    await setVar(page, 'rememberTopUnder', 'bra2');
    await setVar(page, 'rememberBottomUnder', 'panties2');

    // act
    const result = await callSetup(page, 'setup.Gym.hasSexyLingerieForTrainer1()');

    // assert
    expect(result).toBe(true);
  });

  test('hasSexyLingerieForTrainer1 false with wrong lingerie', async () => {
    // arrange
    await setVar(page, 'rememberBottomStockings', 'stockings1');
    await setVar(page, 'rememberTopUnder', 'bra1');
    await setVar(page, 'rememberBottomUnder', 'panties1');

    // act
    const result = await callSetup(page, 'setup.Gym.hasSexyLingerieForTrainer1()');

    // assert
    expect(result).toBe(false);
  });

  // --- Group class ---

  test('meetsBeautyForGroupEvent requires beauty >= 50', async () => {
    // arrange
    await setVar(page, 'mc.beauty', 49);

    // act
    const belowGate = await callSetup(page, 'setup.Gym.meetsBeautyForGroupEvent()');
    await setVar(page, 'mc.beauty', 50);
    const atGate = await callSetup(page, 'setup.Gym.meetsBeautyForGroupEvent()');

    // assert
    expect(belowGate).toBe(false);
    expect(atGate).toBe(true);
  });

  test('canJoinGroupOrgy requires lust >= 50', async () => {
    // arrange
    await setVar(page, 'mc.lust', 49);

    // act
    const belowGate = await callSetup(page, 'setup.Gym.canJoinGroupOrgy()');
    await setVar(page, 'mc.lust', 50);
    const atGate = await callSetup(page, 'setup.Gym.canJoinGroupOrgy()');

    // assert
    expect(belowGate).toBe(false);
    expect(atGate).toBe(true);
  });

  // --- Emily ---

  test('hasMetEmily false by default', async () => {
    // act
    const result = await callSetup(page, 'setup.Gym.hasMetEmily()');

    // assert
    expect(result).toBe(false);
  });

  test('hasMetEmily true when relationEmily is defined', async () => {
    // arrange
    await setVar(page, 'relationEmily', 1);

    // act
    const result = await callSetup(page, 'setup.Gym.hasMetEmily()');

    // assert
    expect(result).toBe(true);
  });

  test('emilyRelationshipStage returns 0 by default', async () => {
    // act
    const result = await callSetup(page, 'setup.Gym.emilyRelationshipStage()');

    // assert
    expect(result).toBe(0);
  });

  test('emilyRelationshipStage returns current stage', async () => {
    // arrange
    await setVar(page, 'relationEmily', 3);

    // act
    const result = await callSetup(page, 'setup.Gym.emilyRelationshipStage()');

    // assert
    expect(result).toBe(3);
  });
});
