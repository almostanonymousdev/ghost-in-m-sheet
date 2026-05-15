const { test, expect } = require('../fixtures');
const { setVar, getVar, callSetup } = require('../helpers');

/**
 * Delivery hub gates from setup.Delivery:
 *
 *   meetsBeautyForManagerFlirt() -- beauty >= 45
 *   managerWillPayExtra()        -- corruption >= 2
 *   managerBJOnCooldown()        -- daily cooldown on 'deliveryBJ'
 *   canAcceptPizzaDeal()         -- corruption >= 3
 *   canAcceptPackageDeal()       -- corruption >= 3
 *   canAcceptBurgerWeed()        -- corruption >= 4
 *   canAcceptPapersFlirt()       -- corruption >= 3
 *   papersLustHighEnough()       -- lust >= 40
 *   papersInitialLustHighEnough()-- lust >= 30
 *   packageLustHighEnough()      -- lust > 49
 *
 * Plus catalogue lookups (eventNameForItem), the open-hours window,
 * and the reputation / pay-tier ladder.
 */
test.describe('Delivery manager events', () => {
  test.describe.configure({ timeout: 20_000 });

  async function setBeauty(page, n) {
    await page.evaluate((val) => {
      window._origBeauty = SugarCube.setup.Mc.beauty;
      SugarCube.setup.Mc.beauty = () => val;
    }, n);
  }
  async function restoreBeauty(page) {
    await page.evaluate(() => {
      if (window._origBeauty) SugarCube.setup.Mc.beauty = window._origBeauty;
    });
  }

  test('meetsBeautyForManagerFlirt flips at beauty 45', async ({ game: page }) => {
    await setBeauty(page, 44);
    try {
      expect(await callSetup(page, 'setup.Delivery.meetsBeautyForManagerFlirt()')).toBe(false);
      await setBeauty(page, 45);
      expect(await callSetup(page, 'setup.Delivery.meetsBeautyForManagerFlirt()')).toBe(true);
      await setBeauty(page, 80);
      expect(await callSetup(page, 'setup.Delivery.meetsBeautyForManagerFlirt()')).toBe(true);
    } finally {
      await restoreBeauty(page);
    }
  });

  test('managerWillPayExtra flips at corruption 2', async ({ game: page }) => {
    await page.evaluate(() => { SugarCube.State.variables.mc.corruption = 1; });
    expect(await callSetup(page, 'setup.Delivery.managerWillPayExtra()')).toBe(false);
    await page.evaluate(() => { SugarCube.State.variables.mc.corruption = 2; });
    expect(await callSetup(page, 'setup.Delivery.managerWillPayExtra()')).toBe(true);
  });

  test('managerBJOnCooldown reflects the daily cooldown', async ({ game: page }) => {
    await page.evaluate(() => { SugarCube.State.variables.deliveryBJ = 0; });
    expect(await callSetup(page, 'setup.Delivery.managerBJOnCooldown()')).toBe(false);
    await callSetup(page, 'setup.Delivery.startManagerBJCooldown()');
    expect(await callSetup(page, 'setup.Delivery.managerBJOnCooldown()')).toBe(true);
  });

  test('canAcceptPizzaDeal/PackageDeal/PapersFlirt gate at corruption >= 3', async ({ game: page }) => {
    await page.evaluate(() => { SugarCube.State.variables.mc.corruption = 2; });
    expect(await callSetup(page, 'setup.Delivery.canAcceptPizzaDeal()')).toBe(false);
    expect(await callSetup(page, 'setup.Delivery.canAcceptPackageDeal()')).toBe(false);
    expect(await callSetup(page, 'setup.Delivery.canAcceptPapersFlirt()')).toBe(false);

    await page.evaluate(() => { SugarCube.State.variables.mc.corruption = 3; });
    expect(await callSetup(page, 'setup.Delivery.canAcceptPizzaDeal()')).toBe(true);
    expect(await callSetup(page, 'setup.Delivery.canAcceptPackageDeal()')).toBe(true);
    expect(await callSetup(page, 'setup.Delivery.canAcceptPapersFlirt()')).toBe(true);
  });

  test('canAcceptBurgerWeed gates at corruption >= 4 (the strictest gate)', async ({ game: page }) => {
    await page.evaluate(() => { SugarCube.State.variables.mc.corruption = 3; });
    expect(await callSetup(page, 'setup.Delivery.canAcceptBurgerWeed()')).toBe(false);
    await page.evaluate(() => { SugarCube.State.variables.mc.corruption = 4; });
    expect(await callSetup(page, 'setup.Delivery.canAcceptBurgerWeed()')).toBe(true);
  });

  test('papers lust gates: papersInitialLustHighEnough (>=30) then papersLustHighEnough (>=40)', async ({ game: page }) => {
    await page.evaluate(() => { SugarCube.State.variables.mc.lust = 29; });
    expect(await callSetup(page, 'setup.Delivery.papersInitialLustHighEnough()')).toBe(false);
    expect(await callSetup(page, 'setup.Delivery.papersLustHighEnough()')).toBe(false);

    await page.evaluate(() => { SugarCube.State.variables.mc.lust = 30; });
    expect(await callSetup(page, 'setup.Delivery.papersInitialLustHighEnough()')).toBe(true);
    expect(await callSetup(page, 'setup.Delivery.papersLustHighEnough()')).toBe(false);

    await page.evaluate(() => { SugarCube.State.variables.mc.lust = 40; });
    expect(await callSetup(page, 'setup.Delivery.papersLustHighEnough()')).toBe(true);
  });

  test('packageLustHighEnough requires strict lust > 49', async ({ game: page }) => {
    await page.evaluate(() => { SugarCube.State.variables.mc.lust = 49; });
    expect(await callSetup(page, 'setup.Delivery.packageLustHighEnough()')).toBe(false);
    await page.evaluate(() => { SugarCube.State.variables.mc.lust = 50; });
    expect(await callSetup(page, 'setup.Delivery.packageLustHighEnough()')).toBe(true);
  });

  test('papersStillCorruptible holds while corruption <= 3, flips off above', async ({ game: page }) => {
    await page.evaluate(() => { SugarCube.State.variables.mc.corruption = 3; });
    expect(await callSetup(page, 'setup.Delivery.papersStillCorruptible()')).toBe(true);
    await page.evaluate(() => { SugarCube.State.variables.mc.corruption = 4; });
    expect(await callSetup(page, 'setup.Delivery.papersStillCorruptible()')).toBe(false);
  });

  test('eventNameForItem maps order items to catalogue keys', async ({ game: page }) => {
    expect(await callSetup(page, 'setup.Delivery.eventNameForItem("pizza")')).toBe('pizza');
    expect(await callSetup(page, 'setup.Delivery.eventNameForItem("package")')).toBe('package');
    expect(await callSetup(page, 'setup.Delivery.eventNameForItem("burgers")')).toBe('burger');
    expect(await callSetup(page, 'setup.Delivery.eventNameForItem("newspapers")')).toBe('papers');
    expect(await callSetup(page, 'setup.Delivery.eventNameForItem("books")')).toBeNull();
    expect(await callSetup(page, 'setup.Delivery.eventNameForItem("unknown")')).toBeNull();
  });

  test('setup.deliveryEvents catalogue has all four entries with the expected gate', async ({ game: page }) => {
    const keys = await page.evaluate(() => Object.keys(SugarCube.setup.deliveryEvents));
    expect(keys.sort()).toEqual(['burger', 'package', 'papers', 'pizza']);

    const shape = await page.evaluate(() => {
      const out = {};
      for (const k of Object.keys(SugarCube.setup.deliveryEvents)) {
        const e = SugarCube.setup.deliveryEvents[k];
        out[k] = { varName: e.varName, payMode: e.payMode, gateCorrReq: e.gateCorrReq };
      }
      return out;
    });
    expect(shape.pizza).toEqual({ varName: 'deliveryPizzaEvent', payMode: 'done', gateCorrReq: 3 });
    expect(shape.package).toEqual({ varName: 'deliveryPackageEvent', payMode: 'always', gateCorrReq: 3 });
    expect(shape.burger).toEqual({ varName: 'deliveryBurgerEvent', payMode: 'always', gateCorrReq: 5 });
    expect(shape.papers).toEqual({ varName: 'deliveryPapersEvent', payMode: 'always', gateCorrReq: 3 });
  });

  test('markEvent("papers") starts the papers cooldown via the catalogue', async ({ game: page }) => {
    await page.evaluate(() => { SugarCube.State.variables.deliveryPapersEvent = 0; });
    await callSetup(page, 'setup.Delivery.markEvent("papers")');
    const onCooldown = await page.evaluate(() => SugarCube.setup.Cooldowns.onCooldown('deliveryPapersEvent'));
    expect(onCooldown).toBe(true);
  });

  test('isOpen tracks the 8..19 window (h > 7 && h < 20)', async ({ game: page }) => {
    for (const [h, open] of [[7, false], [8, true], [12, true], [19, true], [20, false], [21, false]]) {
      await setVar(page, 'hours', h);
      expect(await callSetup(page, 'setup.Delivery.isOpen()')).toBe(open);
    }
  });

  test('reputationLevel ladder + payBonus + label tracks deliveryBestStreak', async ({ game: page }) => {
    await page.evaluate(() => { SugarCube.State.variables.deliveryBestStreak = 0; });
    expect(await callSetup(page, 'setup.Delivery.reputationLevel()')).toBe(0);
    expect(await callSetup(page, 'setup.Delivery.reputationPayBonus()')).toBe(0);
    expect(await callSetup(page, 'setup.Delivery.reputationLabel()')).toBe('Newbie');

    await page.evaluate(() => { SugarCube.State.variables.deliveryBestStreak = 5; });
    expect(await callSetup(page, 'setup.Delivery.reputationLevel()')).toBe(1);
    expect(await callSetup(page, 'setup.Delivery.reputationPayBonus()')).toBe(2);
    expect(await callSetup(page, 'setup.Delivery.reputationLabel()')).toBe('Reliable');

    await page.evaluate(() => { SugarCube.State.variables.deliveryBestStreak = 10; });
    expect(await callSetup(page, 'setup.Delivery.reputationLevel()')).toBe(2);
    expect(await callSetup(page, 'setup.Delivery.reputationPayBonus()')).toBe(4);
    expect(await callSetup(page, 'setup.Delivery.reputationLabel()')).toBe('Trusted');

    await page.evaluate(() => { SugarCube.State.variables.deliveryBestStreak = 20; });
    expect(await callSetup(page, 'setup.Delivery.reputationLevel()')).toBe(3);
    expect(await callSetup(page, 'setup.Delivery.reputationPayBonus()')).toBe(6);
    expect(await callSetup(page, 'setup.Delivery.reputationLabel()')).toBe('Star Courier');
  });

  test('deliveryTime is 20 minutes at level >= 3, else 30', async ({ game: page }) => {
    await page.evaluate(() => { SugarCube.State.variables.deliveryBestStreak = 0; });
    expect(await callSetup(page, 'setup.Delivery.deliveryTime()')).toBe(30);

    await page.evaluate(() => { SugarCube.State.variables.deliveryBestStreak = 19; });
    expect(await callSetup(page, 'setup.Delivery.deliveryTime()')).toBe(30);

    await page.evaluate(() => { SugarCube.State.variables.deliveryBestStreak = 20; });
    expect(await callSetup(page, 'setup.Delivery.deliveryTime()')).toBe(20);
  });

  test('isRouteFamiliar fires after 3 trackVisit calls to the same address', async ({ game: page }) => {
    await page.evaluate(() => { delete SugarCube.State.variables.deliveryVisitCounts; });
    expect(await callSetup(page, 'setup.Delivery.isRouteFamiliar("ElmSt")')).toBeFalsy();
    await callSetup(page, 'setup.Delivery.trackVisit("ElmSt")');
    await callSetup(page, 'setup.Delivery.trackVisit("ElmSt")');
    expect(await callSetup(page, 'setup.Delivery.isRouteFamiliar("ElmSt")')).toBe(false);
    await callSetup(page, 'setup.Delivery.trackVisit("ElmSt")');
    expect(await callSetup(page, 'setup.Delivery.isRouteFamiliar("ElmSt")')).toBe(true);
  });
});
