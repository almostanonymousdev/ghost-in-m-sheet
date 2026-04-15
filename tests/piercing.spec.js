const { test, expect } = require('@playwright/test');
const { openGame, resetGame, goToPassage, getVar, setVar } = require('./helpers');

test.describe('Piercing — Purchase and Beauty', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });

  test.beforeEach(async () => {
    await resetGame(page);
    await setVar(page, 'hours', 12);
  });

  test('purchasing ears piercing adds +2 beauty at purchase', async () => {
    await setVar(page, 'mc.money', 200);
    await goToPassage(page, 'BeautySalonPiercing');
    const buyLink = page.locator('.buyItemLink a').first();

    await buyLink.click();
    await page.waitForFunction(() => SugarCube.State.passage === 'BeautySalonPiercing');

    expect(await getVar(page, 'mc.money')).toBe(200 - 50);
    expect(await getVar(page, 'earsPiercing')).toBe('worn');
    expect(await getVar(page, 'mc.beauty')).toBe(30 + 2);
  });

  test('purchasing nose piercing adds +3 beauty at purchase', async () => {
    await setVar(page, 'mc.money', 200);
    await goToPassage(page, 'BeautySalonPiercing');
    const buyLink = page.locator('.buyItemLink a').nth(1);

    await buyLink.click();
    await page.waitForFunction(() => SugarCube.State.passage === 'BeautySalonPiercing');

    expect(await getVar(page, 'mc.money')).toBe(200 - 70);
    expect(await getVar(page, 'nosePiercing')).toBe('worn');
    expect(await getVar(page, 'mc.beauty')).toBe(30 + 3);
  });

  test('purchasing tongue piercing sets sensitivity modifier, no beauty', async () => {
    await setVar(page, 'mc.money', 200);
    const startBeauty = await getVar(page, 'mc.beauty');
    await goToPassage(page, 'BeautySalonPiercing');
    const buyLink = page.locator('.buyItemLink a').nth(2);

    await buyLink.click();
    await page.waitForFunction(() => SugarCube.State.passage === 'BeautySalonPiercing');

    expect(await getVar(page, 'mc.money')).toBe(200 - 100);
    expect(await getVar(page, 'tonguePiercing')).toBe('worn');
    expect(await getVar(page, 'piercingTongueAddSens')).toBe(0.1);
    expect(await getVar(page, 'mc.beauty')).toBe(startBeauty);
  });

  test('removing ears piercing in wardrobe subtracts beauty', async () => {
    await setVar(page, 'earsPiercing', 'worn');
    await setVar(page, 'mc.beauty', 32);

    await goToPassage(page, 'wardrobe');

    const earsPiercingLink = page.locator('#currentPiercingEars a');
    await earsPiercingLink.click();
    await page.waitForFunction(() => SugarCube.State.passage === 'wardrobe');

    expect(await getVar(page, 'earsPiercing')).toBe('not worn');
    expect(await getVar(page, 'mc.beauty')).toBe(30);
  });

  test('re-wearing ears piercing in wardrobe adds beauty back', async () => {
    await setVar(page, 'earsPiercing', 'not worn');
    await setVar(page, 'mc.beauty', 30);

    await goToPassage(page, 'wardrobe');

    const earsPiercingLink = page.locator('#availablePiercing a').first();
    await earsPiercingLink.click();
    await page.waitForFunction(() => SugarCube.State.passage === 'wardrobe');

    expect(await getVar(page, 'earsPiercing')).toBe('worn');
    expect(await getVar(page, 'mc.beauty')).toBe(32);
  });

  test('removing tongue piercing clears sensitivity modifier', async () => {
    await setVar(page, 'tonguePiercing', 'worn');
    await setVar(page, 'piercingTongueAddSens', 0.1);

    await goToPassage(page, 'wardrobe');

    const tonguePiercingLink = page.locator('#currentPiercingTongue a');
    await tonguePiercingLink.click();
    await page.waitForFunction(() => SugarCube.State.passage === 'wardrobe');

    expect(await getVar(page, 'tonguePiercing')).toBe('not worn');
    expect(await getVar(page, 'piercingTongueAddSens')).toBe(0);
  });
});
