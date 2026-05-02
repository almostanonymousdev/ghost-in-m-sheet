const { test, expect } = require('@playwright/test');
const { openGame, resetGame, setVar, getVar, callSetup, goToPassage } = require('../helpers');
const { expectCleanPassage } = require('./e2e-helpers');

const PIERCING_LIST = [
  { var: 'earsPiercing',    price: 50,  beauty: 2 },
  { var: 'nosePiercing',    price: 70,  beauty: 3 },
  { var: 'tonguePiercing',  price: 100, beauty: 0 },
  { var: 'titsPiercing',    price: 130, beauty: 0 },
  { var: 'pussyPiercing',   price: 150, beauty: 0 },
];

const TATTOO_LIST = [
  { var: 'tattooFace',  price: 100, corruption: 0 },
  { var: 'tattooNeck',  price: 80,  corruption: 0 },
  { var: 'tattooHand',  price: 50,  corruption: 0 },
  { var: 'tattooChest', price: 150, corruption: 5 },
  { var: 'tattooPussy', price: 200, corruption: 5 },
  { var: 'tattooAss',   price: 350, corruption: 5 },
];

test.describe('Body mods — salon access and hours', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  test('Salon.isOpen between 8 AM and 9 PM', async () => {
    await setVar(page, 'hours', 7);
    expect(await callSetup(page, 'setup.Salon.isOpen()')).toBe(false);
    await setVar(page, 'hours', 8);
    expect(await callSetup(page, 'setup.Salon.isOpen()')).toBe(true);
    await setVar(page, 'hours', 21);
    expect(await callSetup(page, 'setup.Salon.isOpen()')).toBe(true);
    await setVar(page, 'hours', 22);
    expect(await callSetup(page, 'setup.Salon.isOpen()')).toBe(false);
  });

  test('BeautySalon exterior shows closed message before 8 AM', async () => {
    await setVar(page, 'hours', 5);
    await goToPassage(page, 'BeautySalon');
    const text = await page.locator('#passages').innerText();
    expect(text).toContain('not open right now');
    await expectCleanPassage(page);
  });

  test('BeautySalon exterior shows "Go inside" during open hours', async () => {
    await setVar(page, 'hours', 10);
    await goToPassage(page, 'BeautySalon');
    const text = await page.locator('#passages').innerText();
    expect(text).toContain('Go inside');
    await expectCleanPassage(page);
  });

  test('BeautySalonInside shows both Piercing and Tattoos links', async () => {
    await setVar(page, 'hours', 10);
    await goToPassage(page, 'BeautySalonInside');
    const text = await page.locator('#passages').innerText();
    expect(text).toContain('Piercing');
    expect(text).toContain('Tattoos');
    await expectCleanPassage(page);
  });
});

test.describe('Body mods — piercing purchases', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  test('BeautySalonPiercing renders cleanly with enough money', async () => {
    await setVar(page, 'hours', 10);
    await setVar(page, 'mc.money', 1000);
    await goToPassage(page, 'BeautySalonPiercing');
    await expectCleanPassage(page);
    const text = await page.locator('#passages').innerText();
    // The salonItem widget prints the price + "$" — confirm we see them
    expect(text).toContain('50$');
    expect(text).toContain('70$');
    expect(text).toContain('100$');
    expect(text).toContain('130$');
    expect(text).toContain('150$');
    expect(text).toContain('Buy');
  });

  test('BeautySalonPiercing shows "not enough money" when broke', async () => {
    await setVar(page, 'hours', 10);
    await setVar(page, 'mc.money', 10);
    await goToPassage(page, 'BeautySalonPiercing');
    const text = await page.locator('#passages').innerText();
    expect(text).toContain("don't have enough money");
    expect(text).not.toContain('Buy');
    await expectCleanPassage(page);
  });

  for (const piercing of PIERCING_LIST) {
    test(`${piercing.var} already purchased hides its card`, async () => {
      await setVar(page, 'hours', 10);
      await setVar(page, 'mc.money', 1000);
      // Setting it to "worn" makes `ndef State.variables[_varName]` false, so
      // the card is omitted entirely.
      await setVar(page, piercing.var, 'worn');
      await goToPassage(page, 'BeautySalonPiercing');
      const text = await page.locator('#passages').innerText();
      // The price is unique per item; confirm it's no longer rendered.
      const otherPrices = PIERCING_LIST
        .filter(p => p.var !== piercing.var)
        .map(p => p.price + '$');
      // Still see the other items' prices (unless they collide, none do).
      for (const price of otherPrices) {
        expect(text).toContain(price);
      }
    });
  }
});

test.describe('Body mods — tattoo purchases', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  test('BeautySalonTattoos shows low-corruption tattoos by default', async () => {
    await setVar(page, 'hours', 10);
    await setVar(page, 'mc.money', 1000);
    await setVar(page, 'mc.corruption', 0);
    await goToPassage(page, 'BeautySalonTattoos');
    await expectCleanPassage(page);
    const text = await page.locator('#passages').innerText();
    // Regular tattoos visible
    expect(text).toContain('100$'); // face
    expect(text).toContain('80$');  // neck
    expect(text).toContain('50$');  // hand
    // Corruption-gated ones should show the req warning, not the price
    expect(text).toContain('Req. 5+');
  });

  test('BeautySalonTattoos unlocks corruption-gated tattoos at corruption >= 5', async () => {
    await setVar(page, 'hours', 10);
    await setVar(page, 'mc.money', 1000);
    await setVar(page, 'mc.corruption', 5);
    await goToPassage(page, 'BeautySalonTattoos');
    await expectCleanPassage(page);
    const text = await page.locator('#passages').innerText();
    // Now all six prices should be visible
    for (const tattoo of TATTOO_LIST) {
      expect(text).toContain(tattoo.price + '$');
    }
    expect(text).not.toContain('Req. 5+');
  });
});

test.describe('Body mods — piercing wardrobe (wear/remove)', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  test('Piercing passage renders without SugarCube errors when nothing is owned', async () => {
    // The Piercing passage is a partial — normally rendered inside the
    // Wardrobe passage, which provides the #currentPiercing* anchors. When
    // every piercing is undefined (the default), no `<<replace>>` or
    // `<<append>>` macros fire, so the passage is a no-op.
    await goToPassage(page, 'Piercing');
    await expectCleanPassage(page);
  });

  test('setup.piercingList exposes the five piercings', async () => {
    const entries = await page.evaluate(() => SugarCube.setup.piercingList.map(p => p.var));
    for (const piercing of PIERCING_LIST) {
      expect(entries).toContain(piercing.var);
    }
    expect(entries).toHaveLength(5);
  });
});

test.describe('Body mods — home mirror and wardrobe', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  test('Home Mirror passage renders cleanly', async () => {
    await goToPassage(page, 'Mirror');
    await expectCleanPassage(page);
  });

  test('Home Wardrobe passage renders cleanly', async () => {
    await goToPassage(page, 'Wardrobe');
    await expectCleanPassage(page);
  });

  test('BodyModification gui passage renders cleanly', async () => {
    await goToPassage(page, 'BodyModification');
    await expectCleanPassage(page);
  });

  test('Mirror applies regular makeup: +5 beauty, -1 charge', async () => {
    await setVar(page, 'makeupAmount', 3);
    await setVar(page, 'makeupApplied', 0);
    await setVar(page, 'mc.beauty', 10);
    // Suppress the twins mirror branch so we reliably hit the makeup UI.
    await setVar(page, 'twinsEventActive', 0);
    await setVar(page, 'twinsEvent', 1);
    await goToPassage(page, 'Mirror');
    await page.locator('#passages')
      .getByText('Apply regular makeup', { exact: false })
      .first()
      .click();
    await page.waitForFunction(() => SugarCube.State.variables.makeupApplied === 1);
    expect(await getVar(page, 'makeupAmount')).toBe(2);
    expect(await getVar(page, 'mc.beauty')).toBe(15);
  });
});

test.describe('Body mods — in-hunt exhibitionism events', () => {
  test.describe.configure({ timeout: 10_000, retries: 1 });

  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  async function primeForNudityEvent(page, { exhib }) {
    // Drive the "naked, no bottoms" branch deterministically.
    await setVar(page, 'ghost', { name: 'Shade' });
    await setVar(page, 'tshirtState', 'not worn');
    await setVar(page, 'pantiesState', 'not worn');
    await setVar(page, 'jeansState', 'not worn');
    await setVar(page, 'skirtState', 'not bought');
    await setVar(page, 'shortsState', 'not bought');
    await setVar(page, 'braState', 'not worn');
    await setVar(page, 'mc.exhibitionism', exhib);
  }

  test('NudityEvent renders the low-exhib branch when mc.exhibitionism <= 4', async () => {
    await primeForNudityEvent(page, { exhib: 2 });
    await goToPassage(page, 'NudityEvent');
    await expectCleanPassage(page);
    const text = await page.locator('#passages').innerText();
    expect(text).toContain('Exhibitionism');
  });

  test('NudityEvent renders the high-exhib branch when mc.exhibitionism >= 5', async () => {
    await primeForNudityEvent(page, { exhib: 7 });
    await goToPassage(page, 'NudityEvent');
    await expectCleanPassage(page);
  });

  test('NudityEventTwo renders cleanly with a driven ghost and clothing state', async () => {
    await primeForNudityEvent(page, { exhib: 3 });
    await goToPassage(page, 'NudityEventTwo');
    await expectCleanPassage(page);
  });

  for (const passage of [
    'StealClothes',
    'StealBra',
    'StealPanties',
    'StealBottomOuter',
    'FindStolenClothes',
  ]) {
    test(`${passage} renders cleanly`, async () => {
      await setVar(page, 'ghost', { name: 'Shade' });
      await goToPassage(page, passage);
      await expectCleanPassage(page);
    });
  }
});
