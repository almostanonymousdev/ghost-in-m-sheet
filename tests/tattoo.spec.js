const { test, expect } = require('./fixtures');
const { goToPassage, getVar, setVar } = require('./helpers');

test.describe('Tattoo — Purchase and Beauty', () => {
  test.beforeEach(async ({ game: page }) => {
    await setVar(page, 'hours', 12);
  });

  test('purchasing face tattoo deducts $100 and adds +2 beauty', async ({ game: page }) => {
    await setVar(page, 'mc.money', 500);
    await goToPassage(page, 'BeautySalonTattoos');
    const buyLink = page.locator('.buyItemLink a').first();

    await buyLink.click();
    await page.waitForFunction(() => SugarCube.State.passage === 'BeautySalonTattoos');

    expect(await getVar(page, 'mc.money')).toBe(500 - 100);
    expect(await getVar(page, 'tattooFace')).toBe('worn');
    expect(await getVar(page, 'mc.beauty')).toBe(30 + 2);
  });

  test('purchasing neck tattoo deducts $80 and adds +2 beauty', async ({ game: page }) => {
    await setVar(page, 'mc.money', 500);
    await goToPassage(page, 'BeautySalonTattoos');
    const buyLink = page.locator('.buyItemLink a').nth(1);

    await buyLink.click();
    await page.waitForFunction(() => SugarCube.State.passage === 'BeautySalonTattoos');

    expect(await getVar(page, 'mc.money')).toBe(500 - 80);
    expect(await getVar(page, 'tattooNeck')).toBe('worn');
    expect(await getVar(page, 'mc.beauty')).toBe(30 + 2);
  });

  test('purchasing hand tattoo deducts $50 and adds +1 beauty', async ({ game: page }) => {
    await setVar(page, 'mc.money', 500);
    await goToPassage(page, 'BeautySalonTattoos');
    const buyLink = page.locator('.buyItemLink a').nth(2);

    await buyLink.click();
    await page.waitForFunction(() => SugarCube.State.passage === 'BeautySalonTattoos');

    expect(await getVar(page, 'mc.money')).toBe(500 - 50);
    expect(await getVar(page, 'tattooHand')).toBe('worn');
    expect(await getVar(page, 'mc.beauty')).toBe(30 + 1);
  });

  test('corruption-gated tattoo hidden when corruption too low', async ({ game: page }) => {
    await setVar(page, 'mc.money', 1000);
    await setVar(page, 'mc.corruption', 2);
    await goToPassage(page, 'BeautySalonTattoos');

    const buyLinks = page.locator('.buyItemLink a');
    await expect(buyLinks).toHaveCount(3);
  });

  test('corruption-gated chest tattoo purchasable at corruption >= 5', async ({ game: page }) => {
    await setVar(page, 'mc.money', 1000);
    await setVar(page, 'mc.corruption', 5);

    await goToPassage(page, 'BeautySalonTattoos');

    const buyLinks = page.locator('.buyItemLink a');
    await expect(buyLinks).toHaveCount(6);

    await buyLinks.nth(3).click();
    await page.waitForFunction(() => SugarCube.State.passage === 'BeautySalonTattoos');

    expect(await getVar(page, 'mc.money')).toBe(1000 - 150);
    expect(await getVar(page, 'tattooChest')).toBe('worn');
    expect(await getVar(page, 'mc.beauty')).toBe(30 + 3);
  });

  test('cannot purchase tattoo when money is insufficient', async ({ game: page }) => {
    await setVar(page, 'mc.money', 10);
    await goToPassage(page, 'BeautySalonTattoos');

    const buyLinks = page.locator('.buyItemLink a');
    await expect(buyLinks).toHaveCount(0);
    expect(await getVar(page, 'mc.money')).toBe(10);
  });

  test('already-purchased tattoo does not appear again', async ({ game: page }) => {
    await setVar(page, 'mc.money', 1000);
    await setVar(page, 'tattooFace', 'worn');
    await goToPassage(page, 'BeautySalonTattoos');

    const buyLinks = page.locator('.buyItemLink a');
    await expect(buyLinks).toHaveCount(2);
  });

  test('buying multiple tattoos accumulates beauty', async ({ game: page }) => {
    await setVar(page, 'mc.money', 1000);
    const startBeauty = await getVar(page, 'mc.beauty');

    await goToPassage(page, 'BeautySalonTattoos');
    await page.locator('.buyItemLink a').first().click();
    await page.waitForFunction(() => SugarCube.State.passage === 'BeautySalonTattoos');

    await page.locator('.buyItemLink a').first().click();
    await page.waitForFunction(() => SugarCube.State.passage === 'BeautySalonTattoos');

    await page.locator('.buyItemLink a').first().click();
    await page.waitForFunction(() => SugarCube.State.passage === 'BeautySalonTattoos');

    expect(await getVar(page, 'mc.beauty')).toBe(startBeauty + 2 + 2 + 1);
    expect(await getVar(page, 'mc.money')).toBe(1000 - 100 - 80 - 50);
  });
});
