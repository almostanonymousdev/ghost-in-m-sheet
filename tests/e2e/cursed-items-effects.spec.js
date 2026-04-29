const { test, expect } = require('@playwright/test');
const { openGame, resetGame, setVar, getVar, callSetup, goToPassage } = require('../helpers');
const { expectCleanPassage } = require('./e2e-helpers');

test.describe('Cursed home items — applyCurseEventEffects payload', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  test('applyCurseEventEffects: -15 sanity, +0.5 corruption, lust=100, curse cleared', async () => {
    await setVar(page, 'cursedHomeItem', 'tv');
    await setVar(page, 'cursedHomeItemActive', 1);
    await setVar(page, 'mc.sanity', 80);
    await setVar(page, 'mc.corruption', 2);
    await setVar(page, 'mc.lust', 0);

    await page.evaluate(() => SugarCube.setup.CursedItems.applyCurseEventEffects());

    expect(await getVar(page, 'mc.sanity')).toBe(65);
    expect(await getVar(page, 'mc.corruption')).toBe(2.5);
    expect(await getVar(page, 'mc.lust')).toBe(100);
    expect(await getVar(page, 'cursedHomeItem')).toBe('');
    expect(await getVar(page, 'cursedHomeItemActive')).toBe(0);
  });

  test('applyCurseEventEffects pegs lust to 100 even from already-high lust', async () => {
    await setVar(page, 'mc.sanity', 100);
    await setVar(page, 'mc.corruption', 0);
    await setVar(page, 'mc.lust', 80);
    await page.evaluate(() => SugarCube.setup.CursedItems.applyCurseEventEffects());
    expect(await getVar(page, 'mc.lust')).toBe(100);
  });

  test('forceCursedItem returns one of the five item keys and activates curse', async () => {
    await page.evaluate(() => { window._origRandom = Math.random; Math.random = () => 0.5; });
    try {
      const item = await page.evaluate(() => SugarCube.setup.CursedItems.forceCursedItem());
      expect(['tv', 'pc', 'bed', 'shower', 'bath']).toContain(item);
      expect(await getVar(page, 'cursedHomeItem')).toBe(item);
      expect(await getVar(page, 'cursedHomeItemActive')).toBe(1);
    } finally {
      await page.evaluate(() => { Math.random = window._origRandom; });
    }
  });

  test('forceCursedItem can roll each of the five items deterministically', async () => {
    const items = ['tv', 'pc', 'bed', 'shower', 'bath'];
    for (let i = 0; i < items.length; i++) {
      await resetGame(page);
      await page.evaluate((idx) => {
        window._origRandom = Math.random;
        Math.random = () => idx / 5 + 0.001;
      }, i);
      try {
        const got = await page.evaluate(() => SugarCube.setup.CursedItems.forceCursedItem());
        expect(got).toBe(items[i]);
      } finally {
        await page.evaluate(() => { Math.random = window._origRandom; });
      }
    }
  });

  test('curse persists between hub visit and event trigger', async () => {
    await setVar(page, 'cursedHomeItem', 'tv');
    await setVar(page, 'cursedHomeItemActive', 1);
    await goToPassage(page, 'Livingroom');
    expect(await callSetup(page, 'setup.CursedItems.isItemCursed("tv")')).toBe(true);
    await goToPassage(page, 'CursedTVEvent');
    await expectCleanPassage(page);
  });

  test('CursedItems.isActive reflects $cursedHomeItemActive', async () => {
    await setVar(page, 'cursedHomeItemActive', 0);
    expect(await callSetup(page, 'setup.CursedItems.isActive()')).toBe(false);
    await setVar(page, 'cursedHomeItemActive', 1);
    expect(await callSetup(page, 'setup.CursedItems.isActive()')).toBe(true);
  });
});

test.describe('Summoning home events — render at base state', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  for (const passage of [
    'SummoningStart',
    'Summoning',
    'SummonMare',
    'SummonSpirit',
    'SummonTentacles',
    'SummonTwins',
    'SuccubusChoice',
  ]) {
    test(`${passage} renders cleanly`, async () => {
      await goToPassage(page, passage);
      await expectCleanPassage(page);
    });
  }
});
