const { test, expect } = require('../fixtures');
const { setVar, getVar, callSetup, goToPassage } = require('../helpers');
const { expectCleanPassage } = require('./e2e-helpers');

const CURSED_ITEMS = [
  { key: 'tv',     label: 'TV',       event: 'CursedTVEvent',     hub: 'Livingroom' },
  { key: 'pc',     label: 'Computer', event: 'CursedPCEvent',     hub: 'Livingroom' },
  { key: 'bed',    label: 'Bed',      event: 'CursedBedEvent',    hub: 'Bedroom'    },
  { key: 'shower', label: 'Shower',   event: 'CursedShowerEvent', hub: 'Bathroom'   },
  { key: 'bath',   label: 'Bathtub',  event: 'CursedBathEvent',   hub: 'Bathroom'   },
];

async function primeCurse(page, itemKey) {
  await setVar(page, 'cursedHomeItem', itemKey);
  await setVar(page, 'cursedHomeItemActive', 1);
}

test.describe('Cursed Home Items — controller', () => {
  test('isItemCursed is false when no curse is active', async ({ game: page }) => {
    await setVar(page, 'cursedHomeItemActive', 0);
    for (const { key } of CURSED_ITEMS) {
      expect(
        await callSetup(page, `setup.CursedItems.isItemCursed("${key}")`)
      ).toBe(false);
    }
  });

  test('isItemCursed is true only for the active item', async ({ game: page }) => {
    await primeCurse(page, 'tv');
    expect(await callSetup(page, 'setup.CursedItems.isItemCursed("tv")')).toBe(true);
    expect(await callSetup(page, 'setup.CursedItems.isItemCursed("bed")')).toBe(false);
    expect(await callSetup(page, 'setup.CursedItems.isItemCursed("pc")')).toBe(false);
  });

  test('cursedItemLabel returns the human-readable label', async ({ game: page }) => {
    for (const { key, label } of CURSED_ITEMS) {
      await primeCurse(page, key);
      expect(await callSetup(page, 'setup.CursedItems.cursedItemLabel()')).toBe(label);
    }
  });

  test('cursedItemLabel returns empty string when nothing is cursed', async ({ game: page }) => {
    await setVar(page, 'cursedHomeItem', '');
    expect(await callSetup(page, 'setup.CursedItems.cursedItemLabel()')).toBe('');
  });

  test('clearCurse resets both state variables', async ({ game: page }) => {
    await primeCurse(page, 'bed');
    await page.evaluate(() => SugarCube.setup.CursedItems.clearCurse());
    expect(await getVar(page, 'cursedHomeItem')).toBe('');
    expect(await getVar(page, 'cursedHomeItemActive')).toBe(0);
    expect(await callSetup(page, 'setup.CursedItems.isItemCursed("bed")')).toBe(false);
  });

  test('rollForCursedItem always picks one of the five items (bias the RNG)', async ({ game: page }) => {
    // Force Math.random to 0 so the 40% branch always fires AND index 0 is chosen.
    await page.evaluate(() => { window._origRandom = Math.random; Math.random = () => 0; });
    try {
      await page.evaluate(() => SugarCube.setup.CursedItems.rollForCursedItem());
      expect(await getVar(page, 'cursedHomeItemActive')).toBe(1);
      expect(['tv', 'pc', 'bed', 'shower', 'bath'])
        .toContain(await getVar(page, 'cursedHomeItem'));
    } finally {
      await page.evaluate(() => { Math.random = window._origRandom; });
    }
  });

  test('rollForCursedItem skips the curse when the 40% roll fails', async ({ game: page }) => {
    // Force Math.random to 0.99 so the < 0.4 branch never fires.
    await page.evaluate(() => { window._origRandom = Math.random; Math.random = () => 0.99; });
    try {
      await setVar(page, 'cursedHomeItemActive', 0);
      await setVar(page, 'cursedHomeItem', '');
      await page.evaluate(() => SugarCube.setup.CursedItems.rollForCursedItem());
      expect(await getVar(page, 'cursedHomeItemActive')).toBe(0);
      expect(await getVar(page, 'cursedHomeItem')).toBe('');
    } finally {
      await page.evaluate(() => { Math.random = window._origRandom; });
    }
  });
});

test.describe('Cursed Home Items — home hub integration', () => {
  for (const { key, hub, event, label } of CURSED_ITEMS) {
    test(`${label} hub (${hub}) renders with cursed item active`, async ({ game: page }) => {
      await primeCurse(page, key);
      await goToPassage(page, hub);
      await expectCleanPassage(page);
      // isItemCursed drives the hub's conditional link — confirm that's still true
      expect(await callSetup(page, `setup.CursedItems.isItemCursed("${key}")`)).toBe(true);
    });

    test(`${label} event passage (${event}) renders cleanly`, async ({ game: page }) => {
      await primeCurse(page, key);
      await setVar(page, 'mc.sanity', 80);
      await setVar(page, 'mc.corruption', 0);
      await setVar(page, 'mc.lust', 0);
      await goToPassage(page, event);
      await expectCleanPassage(page);
    });
  }

  test('only one cursed item can be active at a time', async ({ game: page }) => {
    await primeCurse(page, 'tv');
    // Overwrite — controller semantics are single-item.
    await primeCurse(page, 'bed');
    expect(await callSetup(page, 'setup.CursedItems.isItemCursed("tv")')).toBe(false);
    expect(await callSetup(page, 'setup.CursedItems.isItemCursed("bed")')).toBe(true);
  });

  test('Livingroom without curse shows normal Use PC link (no redirect)', async ({ game: page }) => {
    await setVar(page, 'cursedHomeItemActive', 0);
    await setVar(page, 'cursedHomeItem', '');
    await goToPassage(page, 'Livingroom');
    await expectCleanPassage(page);
    expect(await callSetup(page, 'setup.CursedItems.isItemCursed("pc")')).toBe(false);
  });
});
