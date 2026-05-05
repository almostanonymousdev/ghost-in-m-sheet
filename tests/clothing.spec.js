const { test, expect } = require('@playwright/test');
const { openGame, resetGame, goToPassage, getVar, setVar, callSetup } = require('./helpers');

test.describe('Clothing — Purchase and Beauty', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });

  test.beforeEach(async () => {
    await resetGame(page);
    await setVar(page, 'hours', 12);
  });

  test('purchasing jeans1 deducts $30 and sets state to "not worn"', async () => {
    await setVar(page, 'mc.money', 200);
    const startBeauty = await getVar(page, 'mc.beauty');
    await goToPassage(page, 'ClothingSection');
    const buyLink = page.locator('.buyItemLink a').first();

    await buyLink.click();
    await page.waitForFunction(() => SugarCube.State.passage === 'ClothingSection');

    expect(await getVar(page, 'mc.money')).toBe(200 - 30);
    expect(await getVar(page, 'jeansState1')).toBe('not worn');
    expect(await getVar(page, 'mc.beauty')).toBe(startBeauty);
  });

  test('purchasing tshirt1 deducts $30 and sets state to "not worn"', async () => {
    await setVar(page, 'mc.money', 500);
    await setVar(page, 'jeansState1', 'not worn');
    await setVar(page, 'jeansState2', 'not worn');
    await setVar(page, 'jeansState3', 'not worn');
    await setVar(page, 'shortsState1', 'not worn');
    await setVar(page, 'shortsState2', 'not worn');
    await setVar(page, 'shortsState3', 'not worn');
    await setVar(page, 'skirtState1', 'not worn');
    await setVar(page, 'skirtState2', 'not worn');
    await setVar(page, 'skirtState3', 'not worn');

    await goToPassage(page, 'ClothingSection');
    const buyLink = page.locator('.buyItemLink a').first();

    await buyLink.click();
    await page.waitForFunction(() => SugarCube.State.passage === 'ClothingSection');

    expect(await getVar(page, 'mc.money')).toBe(500 - 30);
    expect(await getVar(page, 'tshirtState1')).toBe('not worn');
  });

  test('cannot purchase clothing when money is insufficient', async () => {
    await setVar(page, 'mc.money', 5);
    await goToPassage(page, 'ClothingSection');

    const buyLinks = page.locator('.buyItemLink a');
    await expect(buyLinks).toHaveCount(0);
    expect(await getVar(page, 'mc.money')).toBe(5);
  });

  test('already-purchased clothing does not show buy button', async () => {
    await setVar(page, 'mc.money', 1000);
    await setVar(page, 'jeansState1', 'not worn');

    await goToPassage(page, 'ClothingSection');
    const buyLinks = page.locator('.buyItemLink a');
    const count = await buyLinks.count();
    expect(count).toBeLessThan(22);
  });

  test('wearing jeans1 in wardrobe adds +5 beauty', async () => {
    await setVar(page, 'jeansState1', 'not worn');
    await setVar(page, 'jeansState0', 'not worn');
    await setVar(page, 'rememberBottomOuter', 'nojeans0');
    const startBeauty = await getVar(page, 'mc.beauty');

    await goToPassage(page, 'Wardrobe');

    const jeans1Link = page.locator('#availableOuterwear a', {
      has: page.locator('img[src*="jeans1"]'),
    });
    await jeans1Link.click();
    await page.waitForFunction(() => SugarCube.State.passage === 'Wardrobe');

    expect(await getVar(page, 'jeansState1')).toBe('worn');
    expect(await getVar(page, 'mc.beauty')).toBe(startBeauty + 5);
  });

  test('wearing bra1 in wardrobe adds +2 beauty', async () => {
    await setVar(page, 'braState1', 'not worn');
    await setVar(page, 'braState0', 'not worn');
    await setVar(page, 'rememberTopUnder', 'nobra0');
    const startBeauty = await getVar(page, 'mc.beauty');

    await goToPassage(page, 'Wardrobe');

    const bra1Link = page.locator('#availableClothes a', {
      has: page.locator('img[src*="slip2"]'),
    });
    await bra1Link.click();
    await page.waitForFunction(() => SugarCube.State.passage === 'Wardrobe');

    expect(await getVar(page, 'braState1')).toBe('worn');
    expect(await getVar(page, 'mc.beauty')).toBe(startBeauty + 2);
  });

  test('switching from jeans1 (+5) to jeans2 (+8) nets +3 beauty', async () => {
    await setVar(page, 'jeansState0', 'not worn');
    await setVar(page, 'jeansState1', 'worn');
    await setVar(page, 'jeansState2', 'not worn');
    await setVar(page, 'rememberBottomOuter', 'jeans1');
    await setVar(page, 'mc.beauty', 35);

    await goToPassage(page, 'Wardrobe');

    const jeans2Link = page.locator('#availableOuterwear a', {
      has: page.locator('img[src*="jeans2"]'),
    });
    await jeans2Link.click();
    await page.waitForFunction(() => SugarCube.State.passage === 'Wardrobe');

    expect(await getVar(page, 'jeansState2')).toBe('worn');
    expect(await getVar(page, 'jeansState1')).toBe('not worn');
    expect(await getVar(page, 'mc.beauty')).toBe(35 + 8 - 5);
  });
});

test.describe('Clothing — Lost-clothing buyback', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });

  test.beforeEach(async () => {
    await resetGame(page);
    await setVar(page, 'hours', 12);
  });

  test('loseAllStolen records discarded tier item onto $lostClothing', async () => {
    // arrange — wear and have a tier-2 tshirt stolen
    await setVar(page, 'tshirtState0', 'not worn');
    await setVar(page, 'tshirtState1', 'not worn');
    await setVar(page, 'tshirtState2', 'worn');
    await setVar(page, 'tshirtState', 'worn');
    await setVar(page, 'rememberTopOuter', 'tshirt2');

    await callSetup(page, 'setup.Wardrobe.stealWornInGroup("tshirt", "tshirtState", "isShirtStolen")');
    await callSetup(page, 'setup.Wardrobe.loseAllStolen()');

    expect(await getVar(page, 'tshirtState2')).toBe('not bought');
    expect(await getVar(page, 'lostClothing')).toEqual(['tshirtState2']);
    expect(await callSetup(page, 'setup.Wardrobe.hasLostClothing()')).toBe(true);
  });

  test('replaceLostClothing deducts store price and restores not-worn state', async () => {
    await setVar(page, 'mc.money', 100);
    await setVar(page, 'tshirtState2', 'not bought');
    await setVar(page, 'lostClothing', ['tshirtState2']);

    const ok = await callSetup(page, 'setup.Wardrobe.replaceLostClothing("tshirtState2")');

    expect(ok).toBe(true);
    expect(await getVar(page, 'mc.money')).toBe(100 - 40);
    expect(await getVar(page, 'tshirtState2')).toBe('not worn');
    expect(await getVar(page, 'lostClothing')).toEqual([]);
  });

  test('replaceLostClothing fails when MC cannot afford it', async () => {
    await setVar(page, 'mc.money', 5);
    await setVar(page, 'tshirtState2', 'not bought');
    await setVar(page, 'lostClothing', ['tshirtState2']);

    const ok = await callSetup(page, 'setup.Wardrobe.replaceLostClothing("tshirtState2")');

    expect(ok).toBe(false);
    expect(await getVar(page, 'mc.money')).toBe(5);
    expect(await getVar(page, 'tshirtState2')).toBe('not bought');
    expect(await getVar(page, 'lostClothing')).toEqual(['tshirtState2']);
  });

  test('replaceLostClothing no-ops on items not in the lost list', async () => {
    await setVar(page, 'mc.money', 1000);
    await setVar(page, 'lostClothing', []);

    const ok = await callSetup(page, 'setup.Wardrobe.replaceLostClothing("tshirtState2")');

    expect(ok).toBe(false);
    expect(await getVar(page, 'mc.money')).toBe(1000);
  });

  test('Bedroom hides Replace lost clothing button when nothing is lost', async () => {
    await setVar(page, 'lostClothing', []);
    await goToPassage(page, 'Bedroom');

    const link = page.locator('a', { hasText: 'Replace lost clothing' });
    await expect(link).toHaveCount(0);
  });

  test('Bedroom shows Replace lost clothing button when items are lost', async () => {
    await setVar(page, 'lostClothing', ['tshirtState2']);
    await setVar(page, 'tshirtState2', 'not bought');
    await goToPassage(page, 'Bedroom');

    const link = page.locator('a', { hasText: 'Replace lost clothing' });
    await expect(link).toHaveCount(1);
  });

  test('ReplaceLostClothing passage buy link replaces the item end-to-end', async () => {
    await setVar(page, 'mc.money', 200);
    await setVar(page, 'tshirtState2', 'not bought');
    await setVar(page, 'lostClothing', ['tshirtState2']);

    await goToPassage(page, 'ReplaceLostClothing');
    const buyLink = page.locator('.buyItemLink a').first();
    await buyLink.click();
    await page.waitForFunction(() => SugarCube.State.passage === 'ReplaceLostClothing');

    expect(await getVar(page, 'mc.money')).toBe(200 - 40);
    expect(await getVar(page, 'tshirtState2')).toBe('not worn');
    expect(await getVar(page, 'lostClothing')).toEqual([]);
  });

  test('SaveMigration back-fills $lostClothing for pre-tracking saves', async () => {
    // Simulate a save that lost a tier-2 tshirt before the tracking
    // shipped: tier-2 in NOT_BOUGHT, rememberVar still pointing at
    // "notshirt2", but $lostClothing not yet populated.
    await setVar(page, 'tshirtState2', 'not bought');
    await setVar(page, 'rememberTopOuter', 'notshirt2');
    await setVar(page, 'lostClothing', []);

    await page.evaluate(() => SugarCube.setup.applySaveDefaults(SugarCube.State.variables));

    expect(await getVar(page, 'lostClothing')).toEqual(['tshirtState2']);
    expect(await callSetup(page, 'setup.Wardrobe.hasLostClothing()')).toBe(true);
  });

  test('SaveMigration back-fill leaves never-bought items alone', async () => {
    // Fresh save: tier-2 tshirt in NOT_BOUGHT but rememberVar points at
    // the slot-0 default. No loss happened — no entry should appear.
    await setVar(page, 'tshirtState2', 'not bought');
    await setVar(page, 'rememberTopOuter', 'tshirt0');
    await setVar(page, 'lostClothing', []);

    await page.evaluate(() => SugarCube.setup.applySaveDefaults(SugarCube.State.variables));

    expect(await getVar(page, 'lostClothing')).toEqual([]);
  });

  test('SaveMigration back-fill is idempotent across repeated runs', async () => {
    await setVar(page, 'tshirtState2', 'not bought');
    await setVar(page, 'rememberTopOuter', 'notshirt2');
    await setVar(page, 'lostClothing', []);

    await page.evaluate(() => {
      SugarCube.setup.applySaveDefaults(SugarCube.State.variables);
      SugarCube.setup.applySaveDefaults(SugarCube.State.variables);
      SugarCube.setup.applySaveDefaults(SugarCube.State.variables);
    });

    expect(await getVar(page, 'lostClothing')).toEqual(['tshirtState2']);
  });

  test('WARDROBE_GROUPS prices match ClothingSection.tw store prices', async () => {
    // Pulled from passages/mall/ClothingSection.tw -- the buyback button
    // uses the price field on each WARDROBE_GROUPS item, so the two
    // tables must agree. Slot-0 items have no store price.
    const expected = {
      jeansState1: 30, jeansState2: 40, jeansState3: 50,
      shortsState1: 35, shortsState2: 45, shortsState3: 55,
      skirtState1: 40, skirtState2: 50, skirtState3: 60,
      tshirtState1: 30, tshirtState2: 40, tshirtState3: 50,
      braState1: 20, braState2: 30, braState3: 40,
      pantiesState1: 25, pantiesState2: 35, pantiesState3: 45,
      stockingsState1: 30, stockingsState2: 60, stockingsState3: 120,
      neckChokerState1: 100,
    };

    const prices = await page.evaluate(() => {
      const out = {};
      for (const grp of SugarCube.setup.WARDROBE_GROUPS) {
        for (const item of grp.items) {
          if (item.slot !== 0) out[item.var] = item.price;
        }
      }
      return out;
    });

    expect(prices).toEqual(expected);
  });
});
