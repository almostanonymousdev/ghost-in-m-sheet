const { test, expect } = require('@playwright/test');
const { openGame, resetGame, goToPassage, getVar, setVar } = require('./helpers');

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
    await goToPassage(page, 'clothingSection');
    const buyLink = page.locator('.buyItemLink a').first();

    await buyLink.click();
    await page.waitForFunction(() => SugarCube.State.passage === 'clothingSection');

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

    await goToPassage(page, 'clothingSection');
    const buyLink = page.locator('.buyItemLink a').first();

    await buyLink.click();
    await page.waitForFunction(() => SugarCube.State.passage === 'clothingSection');

    expect(await getVar(page, 'mc.money')).toBe(500 - 30);
    expect(await getVar(page, 'tshirtState1')).toBe('not worn');
  });

  test('cannot purchase clothing when money is insufficient', async () => {
    await setVar(page, 'mc.money', 5);
    await goToPassage(page, 'clothingSection');

    const buyLinks = page.locator('.buyItemLink a');
    await expect(buyLinks).toHaveCount(0);
    expect(await getVar(page, 'mc.money')).toBe(5);
  });

  test('already-purchased clothing does not show buy button', async () => {
    await setVar(page, 'mc.money', 1000);
    await setVar(page, 'jeansState1', 'not worn');

    await goToPassage(page, 'clothingSection');
    const buyLinks = page.locator('.buyItemLink a');
    const count = await buyLinks.count();
    expect(count).toBeLessThan(22);
  });

  test('wearing jeans1 in wardrobe adds +5 beauty', async () => {
    await setVar(page, 'jeansState1', 'not worn');
    await setVar(page, 'jeansState0', 'not worn');
    await setVar(page, 'rememberBottomOuter', 'nojeans0');
    const startBeauty = await getVar(page, 'mc.beauty');

    await goToPassage(page, 'wardrobe');

    const jeans1Link = page.locator('#availableOuterwear a', {
      has: page.locator('img[src*="jeans1"]'),
    });
    await jeans1Link.click();
    await page.waitForFunction(() => SugarCube.State.passage === 'wardrobe');

    expect(await getVar(page, 'jeansState1')).toBe('worn');
    expect(await getVar(page, 'mc.beauty')).toBe(startBeauty + 5);
  });

  test('wearing bra1 in wardrobe adds +2 beauty', async () => {
    await setVar(page, 'braState1', 'not worn');
    await setVar(page, 'braState0', 'not worn');
    await setVar(page, 'rememberTopUnder', 'nobra0');
    const startBeauty = await getVar(page, 'mc.beauty');

    await goToPassage(page, 'wardrobe');

    const bra1Link = page.locator('#availableClothes a', {
      has: page.locator('img[src*="slip2"]'),
    });
    await bra1Link.click();
    await page.waitForFunction(() => SugarCube.State.passage === 'wardrobe');

    expect(await getVar(page, 'braState1')).toBe('worn');
    expect(await getVar(page, 'mc.beauty')).toBe(startBeauty + 2);
  });

  test('switching from jeans1 (+5) to jeans2 (+8) nets +3 beauty', async () => {
    await setVar(page, 'jeansState0', 'not worn');
    await setVar(page, 'jeansState1', 'worn');
    await setVar(page, 'jeansState2', 'not worn');
    await setVar(page, 'rememberBottomOuter', 'jeans1');
    await setVar(page, 'mc.beauty', 35);

    await goToPassage(page, 'wardrobe');

    const jeans2Link = page.locator('#availableOuterwear a', {
      has: page.locator('img[src*="jeans2"]'),
    });
    await jeans2Link.click();
    await page.waitForFunction(() => SugarCube.State.passage === 'wardrobe');

    expect(await getVar(page, 'jeansState2')).toBe('worn');
    expect(await getVar(page, 'jeansState1')).toBe('not worn');
    expect(await getVar(page, 'mc.beauty')).toBe(35 + 8 - 5);
  });
});
