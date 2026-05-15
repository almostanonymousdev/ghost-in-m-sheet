const { test, expect } = require('../fixtures');
const { setVar, getVar, callSetup } = require('../helpers');

/**
 * Gym trainer 1/2 event gates from setup.Gym:
 *
 *   hasSexyLingerieForTrainer1() — requires stockings2/3, bra2/3, panties2/3
 *   canTriggerTrainer1Event() — tipReceived + not on cooldown + lingerie
 *   applyTrainer1Discount() — flips isDiscountTrainer1 + coachingCost=1
 *   markTrainer1Tipped() — sets trainer1TipReceived = 1
 *   meetsFitForTrainer2Event() — fit >= 30
 *
 * Also exercises the time-of-day open windows + training cost lookups.
 */
test.describe('Gym trainer events', () => {
  test.describe.configure({ timeout: 20_000 });

  async function setBottomStockings(page, key) {
    await page.evaluate((k) => {
      window._origRememberBottomStockings = SugarCube.setup.Wardrobe.rememberBottomStockings;
      SugarCube.setup.Wardrobe.rememberBottomStockings = () => k;
    }, key);
  }
  async function setTopUnder(page, key) {
    await page.evaluate((k) => {
      window._origRememberTopUnder = SugarCube.setup.Wardrobe.rememberTopUnder;
      SugarCube.setup.Wardrobe.rememberTopUnder = () => k;
    }, key);
  }
  async function setBottomUnder(page, key) {
    await page.evaluate((k) => {
      window._origRememberBottomUnder = SugarCube.setup.Wardrobe.rememberBottomUnder;
      SugarCube.setup.Wardrobe.rememberBottomUnder = () => k;
    }, key);
  }
  async function restoreWardrobe(page) {
    await page.evaluate(() => {
      if (window._origRememberBottomStockings) SugarCube.setup.Wardrobe.rememberBottomStockings = window._origRememberBottomStockings;
      if (window._origRememberTopUnder) SugarCube.setup.Wardrobe.rememberTopUnder = window._origRememberTopUnder;
      if (window._origRememberBottomUnder) SugarCube.setup.Wardrobe.rememberBottomUnder = window._origRememberBottomUnder;
    });
  }

  test('hasSexyLingerieForTrainer1 requires all three premium items', async ({ game: page }) => {
    await setBottomStockings(page, 'stockings2');
    await setTopUnder(page, 'bra2');
    await setBottomUnder(page, 'panties2');
    try {
      expect(await callSetup(page, 'setup.Gym.hasSexyLingerieForTrainer1()')).toBe(true);
      // Downgrade panties to a non-qualifying tier
      await setBottomUnder(page, 'panties1');
      expect(await callSetup(page, 'setup.Gym.hasSexyLingerieForTrainer1()')).toBe(false);
      // Restore panties, downgrade bra
      await setBottomUnder(page, 'panties3');
      await setTopUnder(page, 'bra1');
      expect(await callSetup(page, 'setup.Gym.hasSexyLingerieForTrainer1()')).toBe(false);
      // Restore bra, downgrade stockings
      await setTopUnder(page, 'bra3');
      await setBottomStockings(page, 'stockings1');
      expect(await callSetup(page, 'setup.Gym.hasSexyLingerieForTrainer1()')).toBe(false);
    } finally {
      await restoreWardrobe(page);
    }
  });

  test('canTriggerTrainer1Event requires tip + lingerie + no cooldown', async ({ game: page }) => {
    await setBottomStockings(page, 'stockings3');
    await setTopUnder(page, 'bra3');
    await setBottomUnder(page, 'panties3');
    await page.evaluate(() => {
      SugarCube.State.variables.trainer1TipReceived = 0;
      SugarCube.State.variables.trainer1Sex = 0;
    });
    try {
      // Missing tip
      expect(await callSetup(page, 'setup.Gym.canTriggerTrainer1Event()')).toBe(false);
      // Mark tipped
      await callSetup(page, 'setup.Gym.markTrainer1Tipped()');
      expect(await callSetup(page, 'setup.Gym.canTriggerTrainer1Event()')).toBe(true);
      // Start cooldown — blocks the trigger
      await callSetup(page, 'setup.Gym.startTrainer1SexCooldown()');
      expect(await callSetup(page, 'setup.Gym.canTriggerTrainer1Event()')).toBe(false);
    } finally {
      await restoreWardrobe(page);
    }
  });

  test('applyTrainer1Discount sets the discount flags', async ({ game: page }) => {
    await page.evaluate(() => {
      delete SugarCube.State.variables.isDiscountTrainer1;
      delete SugarCube.State.variables.trainer1CoachingCost;
    });
    expect(await callSetup(page, 'setup.Gym.trainer1Discounted()')).toBe(false);
    await callSetup(page, 'setup.Gym.applyTrainer1Discount()');
    expect(await callSetup(page, 'setup.Gym.trainer1Discounted()')).toBe(true);
    expect(await getVar(page, 'isDiscountTrainer1')).toBe(1);
    expect(await getVar(page, 'trainer1CoachingCost')).toBe(1);
  });

  test('computeTrainingCost respects the trainer1 discount in morning slot', async ({ game: page }) => {
    await setVar(page, 'hours', 9);
    await page.evaluate(() => {
      delete SugarCube.State.variables.trainer1CoachingCost;
    });
    expect(await callSetup(page, 'setup.Gym.computeTrainingCost()')).toBe(15);

    await callSetup(page, 'setup.Gym.markTrainer1Coaching()');
    expect(await callSetup(page, 'setup.Gym.computeTrainingCost()')).toBe(0);
  });

  test('meetsFitForTrainer2Event requires fit >= 30', async ({ game: page }) => {
    await page.evaluate(() => {
      SugarCube.State.variables.mc.fit = 29;
    });
    expect(await callSetup(page, 'setup.Gym.meetsFitForTrainer2Event()')).toBe(false);
    await page.evaluate(() => { SugarCube.State.variables.mc.fit = 30; });
    expect(await callSetup(page, 'setup.Gym.meetsFitForTrainer2Event()')).toBe(true);
  });

  test('isMorning / isAfternoon / isEvening windows are non-overlapping and cover open hours', async ({ game: page }) => {
    const slots = [
      { h: 8,  m: true, a: false, e: false },
      { h: 11, m: true, a: false, e: false },
      { h: 12, m: false, a: true, e: false },
      { h: 16, m: false, a: true, e: false },
      { h: 17, m: false, a: false, e: true },
      { h: 22, m: false, a: false, e: true },
      { h: 23, m: false, a: false, e: false },
      { h: 7,  m: false, a: false, e: false },
    ];
    for (const s of slots) {
      await setVar(page, 'hours', s.h);
      expect(await callSetup(page, 'setup.Gym.isMorning()')).toBe(s.m);
      expect(await callSetup(page, 'setup.Gym.isAfternoon()')).toBe(s.a);
      expect(await callSetup(page, 'setup.Gym.isEvening()')).toBe(s.e);
    }
  });

  test('Emily relationship raises up to 10 and stops there', async ({ game: page }) => {
    await page.evaluate(() => { SugarCube.State.variables.relationEmily = undefined; });
    await callSetup(page, 'setup.Gym.greetEmilyFirstTime()');
    expect(await callSetup(page, 'setup.Gym.emilyRelationshipStage()')).toBe(1);
    for (let i = 0; i < 20; i++) await callSetup(page, 'setup.Gym.raiseEmilyRelationship()');
    expect(await callSetup(page, 'setup.Gym.emilyRelationshipStage()')).toBe(10);
  });
});
