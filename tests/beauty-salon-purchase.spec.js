const { test, expect } = require('./fixtures');
const { goToPassage, getVar, setVar } = require('./helpers');

test.describe('Beauty Salon — Piercing Purchase', () => {
  test.beforeEach(async ({ game: page }) => {
    await setVar(page, 'hours', 12);
  });

  test('purchasing ears piercing deducts money and marks item as worn', async ({ game: page }) => {
    // arrange
    const startingMoney = await getVar(page, 'mc.money');
    const piercingBefore = await getVar(page, 'earsPiercing');
    await goToPassage(page, 'BeautySalonPiercing');
    const buyLink = page.locator('.buyItemLink a').first();

    // act
    await buyLink.click();
    await page.waitForFunction(() => SugarCube.State.passage === 'BeautySalonPiercing');

    // assert
    expect(startingMoney).toBe(100);
    expect(piercingBefore).toBeUndefined();
    expect(await getVar(page, 'mc.money')).toBe(startingMoney - 50);
    expect(await getVar(page, 'earsPiercing')).toBe('worn');
    expect(await getVar(page, 'mc.beauty')).toBe(32); // 30 (base) + 2 from ears piercing
  });

  test('purchasing nose piercing deducts $70 and adds +3 beauty', async ({ game: page }) => {
    // arrange
    await setVar(page, 'mc.money', 200);
    const startBeauty = await getVar(page, 'mc.beauty');
    await goToPassage(page, 'BeautySalonPiercing');
    const noseBuyLink = page.locator('.buyItemLink a').nth(1);

    // act
    await noseBuyLink.click();
    await page.waitForFunction(() => SugarCube.State.passage === 'BeautySalonPiercing');

    // assert
    expect(await getVar(page, 'mc.money')).toBe(200 - 70);
    expect(await getVar(page, 'nosePiercing')).toBe('worn');
    expect(await getVar(page, 'mc.beauty')).toBe(startBeauty + 3);
  });

  test('cannot purchase when money is insufficient', async ({ game: page }) => {
    // arrange
    await setVar(page, 'mc.money', 10);
    await goToPassage(page, 'BeautySalonPiercing');

    // act
    const buyLinks = page.locator('.buyItemLink a');
    const noMoneyText = page.locator('.mc-thoughts');

    // assert
    await expect(buyLinks).toHaveCount(0);
    await expect(noMoneyText.first()).toBeVisible();
    expect(await getVar(page, 'mc.money')).toBe(10);
  });

  test('already-purchased piercing does not appear again', async ({ game: page }) => {
    // arrange
    await setVar(page, 'mc.money', 1000);
    await setVar(page, 'earsPiercing', 'worn');

    // act
    await goToPassage(page, 'BeautySalonPiercing');

    // assert
    const buyLinks = page.locator('.buyItemLink a');
    await expect(buyLinks).toHaveCount(4);
  });
});
