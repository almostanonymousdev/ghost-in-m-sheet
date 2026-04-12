const { test, expect } = require('@playwright/test');
const path = require('path');

const GAME_URL = `file://${path.resolve(__dirname, '..', 'ghost-in-msheet.html')}`;

/**
 * Helper: wait for SugarCube to finish initializing and rendering a passage.
 */
async function waitForSugarCube(page) {
  await page.waitForFunction(() =>
    typeof SugarCube !== 'undefined' &&
    SugarCube.State &&
    SugarCube.State.variables &&
    SugarCube.Engine
  );
}

/**
 * Helper: navigate to a SugarCube passage by name and wait for it to render.
 */
async function goToPassage(page, passageName) {
  await page.evaluate((p) => SugarCube.Engine.play(p), passageName);
  await page.waitForFunction(
    (p) => SugarCube.State.passage === p,
    passageName
  );
}

/**
 * Helper: read a SugarCube story variable (e.g. "mc.money" → $mc.money).
 */
function getVar(page, varName) {
  return page.evaluate((v) => {
    const parts = v.split('.');
    let value = SugarCube.State.variables;
    for (const p of parts) value = value[p];
    return value;
  }, varName);
}

/**
 * Helper: set a SugarCube story variable.
 */
function setVar(page, varName, value) {
  return page.evaluate(({ v, val }) => {
    const parts = v.split('.');
    let target = SugarCube.State.variables;
    for (let i = 0; i < parts.length - 1; i++) target = target[parts[i]];
    target[parts[parts.length - 1]] = val;
  }, { v: varName, val: value });
}

test.describe('Beauty Salon — Piercing Purchase', () => {
  let page;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
    await page.goto(GAME_URL, { waitUntil: 'load' });
    await waitForSugarCube(page);
    await setVar(page, 'hours', 12);
  });

  test.afterEach(async () => {
    await page.close();
  });

  test('purchasing ears piercing deducts money and marks item as worn', async () => {
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
    const beautyBonus = await page.evaluate(
      () => SugarCube.State.variables['mc.beauty']
    );
    expect(beautyBonus).toBe(32); // 30 (base) + 2 from ears piercing
  });

  test('purchasing nose piercing deducts $70 and adds +3 beauty', async () => {
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
    const beautyBonus = await page.evaluate(
      () => SugarCube.State.variables['mc.beauty']
    );
    expect(beautyBonus).toBe(startBeauty + 3);
  });

  test('cannot purchase when money is insufficient', async () => {
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

  test('already-purchased piercing does not appear again', async () => {
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
