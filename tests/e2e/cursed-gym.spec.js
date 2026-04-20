const { test, expect } = require('@playwright/test');
const { openGame, resetGame, setVar, getVar, callSetup, goToPassage } = require('../helpers');
const { expectCleanPassage } = require('./e2e-helpers');

const RETRIEVAL_PATHS = [
  { name: 'Sneak', passage: 'GymBagSwapSneak', exhib: 0,  gate: 'canSneak' },
  { name: 'Towel', passage: 'GymBagSwapTowel', exhib: 5,  gate: 'canTowel' },
  { name: 'Nude',  passage: 'GymBagSwapNude',  exhib: 8,  gate: 'canNude'  },
];

async function primeSwap(page) {
  await setVar(page, 'gymBagStolen', 1);
}

async function primeForGymInside(page) {
  // GymInside gates the Leave link behind hasSportswear() and the current
  // hour; prime both so the passage renders the Leave button cleanly.
  await setVar(page, 'sportswear', 1);
  await setVar(page, 'hours', 12);
  await setVar(page, 'minutes', 0);
}

test.describe('Cursed Gym — controller', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  test('isBagStolen is false by default', async () => {
    expect(await callSetup(page, 'setup.CursedGym.isBagStolen()')).toBe(false);
  });

  test('isBagStolen is true once the flag is set', async () => {
    await primeSwap(page);
    expect(await callSetup(page, 'setup.CursedGym.isBagStolen()')).toBe(true);
  });

  test('clearSwap resets the flag', async () => {
    await primeSwap(page);
    await page.evaluate(() => SugarCube.setup.CursedGym.clearSwap());
    expect(await getVar(page, 'gymBagStolen')).toBe(0);
    expect(await callSetup(page, 'setup.CursedGym.isBagStolen()')).toBe(false);
  });

  test('rollForGymBagSwap sets the flag when the 10% roll succeeds', async () => {
    await page.evaluate(() => { window._origRandom = Math.random; Math.random = () => 0; });
    try {
      await page.evaluate(() => SugarCube.setup.CursedGym.rollForGymBagSwap());
      expect(await getVar(page, 'gymBagStolen')).toBe(1);
    } finally {
      await page.evaluate(() => { Math.random = window._origRandom; });
    }
  });

  test('rollForGymBagSwap leaves the flag alone when the roll fails', async () => {
    await page.evaluate(() => { window._origRandom = Math.random; Math.random = () => 0.99; });
    try {
      await setVar(page, 'gymBagStolen', 0);
      await page.evaluate(() => SugarCube.setup.CursedGym.rollForGymBagSwap());
      expect(await getVar(page, 'gymBagStolen')).toBe(0);
    } finally {
      await page.evaluate(() => { Math.random = window._origRandom; });
    }
  });

  test('rollForGymBagSwap skips at the 10% boundary (Math.random = 0.1 is not < 0.1)', async () => {
    await page.evaluate(() => { window._origRandom = Math.random; Math.random = () => 0.1; });
    try {
      await setVar(page, 'gymBagStolen', 0);
      await page.evaluate(() => SugarCube.setup.CursedGym.rollForGymBagSwap());
      expect(await getVar(page, 'gymBagStolen')).toBe(0);
    } finally {
      await page.evaluate(() => { Math.random = window._origRandom; });
    }
  });

  test('canSneak is always true', async () => {
    await setVar(page, 'mc.exhib', 0);
    expect(await callSetup(page, 'setup.CursedGym.canSneak()')).toBe(true);
  });

  test('canTowel gates on exhib >= 5', async () => {
    await setVar(page, 'mc.exhib', 4);
    expect(await callSetup(page, 'setup.CursedGym.canTowel()')).toBe(false);
    await setVar(page, 'mc.exhib', 5);
    expect(await callSetup(page, 'setup.CursedGym.canTowel()')).toBe(true);
  });

  test('canNude gates on exhib >= 8', async () => {
    await setVar(page, 'mc.exhib', 7);
    expect(await callSetup(page, 'setup.CursedGym.canNude()')).toBe(false);
    await setVar(page, 'mc.exhib', 8);
    expect(await callSetup(page, 'setup.CursedGym.canNude()')).toBe(true);
  });
});

test.describe('Cursed Gym — GymInside Leave intercept + retrieval events', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  test('GymInside Leave link routes to GymBagSwapEvent when a swap is pending', async () => {
    await primeForGymInside(page);
    await primeSwap(page);
    await goToPassage(page, 'GymInside');
    await expectCleanPassage(page);
    const html = await page.evaluate(() => document.querySelector('.passage').innerHTML);
    // Leave link should target the event intro, not CityMap.
    expect(html).toMatch(/data-passage="GymBagSwapEvent"/);
    expect(html).not.toMatch(/data-passage="CityMap"/);
  });

  test('GymInside Leave link routes to CityMap when no swap is pending', async () => {
    await primeForGymInside(page);
    await setVar(page, 'gymBagStolen', 0);
    await goToPassage(page, 'GymInside');
    await expectCleanPassage(page);
    const html = await page.evaluate(() => document.querySelector('.passage').innerHTML);
    expect(html).toMatch(/data-passage="CityMap"/);
    expect(html).not.toMatch(/data-passage="GymBagSwapEvent"/);
  });

  test('GymBagSwapEvent renders with only the sneak option at exhib 0', async () => {
    await primeSwap(page);
    await setVar(page, 'mc.exhib', 0);
    await goToPassage(page, 'GymBagSwapEvent');
    await expectCleanPassage(page);
    const body = await page.evaluate(() => document.querySelector('.passage').textContent);
    expect(body).toMatch(/slip in/i);
    // Locked options should still render a warning hint.
    expect(body).toMatch(/Req\. Exhibitionism Level 5\+/);
    expect(body).toMatch(/Req\. Exhibitionism Level 8\+/);
  });

  test('GymBagSwapEvent unlocks the towel option at exhib 5', async () => {
    await primeSwap(page);
    await setVar(page, 'mc.exhib', 5);
    await goToPassage(page, 'GymBagSwapEvent');
    await expectCleanPassage(page);
    const body = await page.evaluate(() => document.querySelector('.passage').textContent);
    expect(body).toMatch(/towel/i);
    expect(body).toMatch(/Req\. Exhibitionism Level 8\+/);
  });

  test('GymBagSwapEvent unlocks every option at exhib 8', async () => {
    await primeSwap(page);
    await setVar(page, 'mc.exhib', 8);
    await goToPassage(page, 'GymBagSwapEvent');
    await expectCleanPassage(page);
    const body = await page.evaluate(() => document.querySelector('.passage').textContent);
    expect(body).toMatch(/nothing at all/i);
    expect(body).not.toMatch(/Req\. Exhibitionism Level/);
  });

  for (const { name, passage, exhib } of RETRIEVAL_PATHS) {
    test(`${name} retrieval passage (${passage}) renders cleanly`, async () => {
      await primeSwap(page);
      await setVar(page, 'mc.exhib', exhib);
      await setVar(page, 'mc.sanity', 80);
      await setVar(page, 'mc.corruption', 0);
      await setVar(page, 'mc.lust', 0);
      await goToPassage(page, passage);
      await expectCleanPassage(page);
    });
  }
});
