const { test, expect } = require('../fixtures');
const { setVar, getVar, callSetup, goToPassage } = require('../helpers');

/**
 * Library groping / guy event corruption gates:
 *
 *   LibraryGuy gate (passage):
 *     corruption < 1  -> "Stop it right now, or I'll scream" -> LibraryInside
 *     corruption >= 1 -> "stay silent" link -> LibraryGuy1
 *
 *   LibraryGuy1 chains:
 *     corruption < 2  -> tryGainGropingCorruption(2, 0.1)
 *     corruption <= 6 -> tryGainGropingCorruption(6, 0.2)
 *
 *   Library.tryGainGropingCorruption(cap, delta) only ticks corruption
 *   when current corr <= cap; gainSmallCorruption() ticks only when < 3.
 *
 * Also exercises clothing branches: wearingPants vs wearingSkirt.
 */
test.describe('Library corruption events', () => {
  test.describe.configure({ timeout: 20_000 });

  test('gainSmallCorruption ticks only while corruption < 3', async ({ game: page }) => {
    await page.evaluate(() => { SugarCube.State.variables.mc.corruption = 0; });
    await callSetup(page, 'setup.Library.gainSmallCorruption()');
    expect(await callSetup(page, 'setup.Mc.corruption()')).toBeCloseTo(0.1, 5);

    await page.evaluate(() => { SugarCube.State.variables.mc.corruption = 3; });
    await callSetup(page, 'setup.Library.gainSmallCorruption()');
    expect(await callSetup(page, 'setup.Mc.corruption()')).toBe(3);

    await page.evaluate(() => { SugarCube.State.variables.mc.corruption = 5; });
    await callSetup(page, 'setup.Library.gainSmallCorruption()');
    expect(await callSetup(page, 'setup.Mc.corruption()')).toBe(5);
  });

  test('tryGainGropingCorruption(2, 0.1) gates at corr <= 2', async ({ game: page }) => {
    await page.evaluate(() => { SugarCube.State.variables.mc.corruption = 1.5; });
    await callSetup(page, 'setup.Library.tryGainGropingCorruption(2, 0.1)');
    expect(await callSetup(page, 'setup.Mc.corruption()')).toBeCloseTo(1.6, 5);

    await page.evaluate(() => { SugarCube.State.variables.mc.corruption = 2; });
    await callSetup(page, 'setup.Library.tryGainGropingCorruption(2, 0.1)');
    expect(await callSetup(page, 'setup.Mc.corruption()')).toBeCloseTo(2.1, 5);

    await page.evaluate(() => { SugarCube.State.variables.mc.corruption = 2.5; });
    await callSetup(page, 'setup.Library.tryGainGropingCorruption(2, 0.1)');
    expect(await callSetup(page, 'setup.Mc.corruption()')).toBe(2.5);
  });

  test('tryGainGropingCorruption(6, 0.2) gates at corr <= 6', async ({ game: page }) => {
    await page.evaluate(() => { SugarCube.State.variables.mc.corruption = 5; });
    await callSetup(page, 'setup.Library.tryGainGropingCorruption(6, 0.2)');
    expect(await callSetup(page, 'setup.Mc.corruption()')).toBeCloseTo(5.2, 5);

    await page.evaluate(() => { SugarCube.State.variables.mc.corruption = 7; });
    await callSetup(page, 'setup.Library.tryGainGropingCorruption(6, 0.2)');
    expect(await callSetup(page, 'setup.Mc.corruption()')).toBe(7);
  });

  test('LibraryGuy passage: low corruption forces the back-out link', async ({ game: page }) => {
    await page.evaluate(() => { SugarCube.State.variables.mc.corruption = 0; });
    await goToPassage(page, 'LibraryGuy');
    const html = await page.evaluate(() => document.querySelector('.passage').innerHTML);
    expect(html).toMatch(/LibraryInside/);
    expect(html).not.toMatch(/LibraryGuy1/);
  });

  test('LibraryGuy passage: high corruption unlocks the "stay silent" branch', async ({ game: page }) => {
    await page.evaluate(() => { SugarCube.State.variables.mc.corruption = 5; });
    await goToPassage(page, 'LibraryGuy');
    const html = await page.evaluate(() => document.querySelector('.passage').innerHTML);
    expect(html).toMatch(/LibraryGuy1/);
    expect(html).not.toMatch(/Stop it right now/);
  });

  test('wearingPants reflects jeans/shorts; wearingSkirt reflects skirt', async ({ game: page }) => {
    await page.evaluate(() => {
      window._origWorn = SugarCube.setup.Wardrobe.worn;
      SugarCube.setup.Wardrobe.worn = (slot) => slot === SugarCube.setup.WardrobeSlot.JEANS;
    });
    try {
      expect(await callSetup(page, 'setup.Library.wearingPants()')).toBe(true);
      expect(await callSetup(page, 'setup.Library.wearingSkirt()')).toBe(false);
      await page.evaluate(() => {
        SugarCube.setup.Wardrobe.worn = (slot) => slot === SugarCube.setup.WardrobeSlot.SHORTS;
      });
      expect(await callSetup(page, 'setup.Library.wearingPants()')).toBe(true);
      await page.evaluate(() => {
        SugarCube.setup.Wardrobe.worn = (slot) => slot === SugarCube.setup.WardrobeSlot.SKIRT;
      });
      expect(await callSetup(page, 'setup.Library.wearingPants()')).toBe(false);
      expect(await callSetup(page, 'setup.Library.wearingSkirt()')).toBe(true);
    } finally {
      await page.evaluate(() => {
        if (window._origWorn) SugarCube.setup.Wardrobe.worn = window._origWorn;
      });
    }
  });

  test('availableSearchResults filters out already-found targets', async ({ game: page }) => {
    await page.evaluate(() => {
      const v = SugarCube.State.variables;
      delete v.foundTips;
      delete v.foundComics;
      delete v.foundBrook;
      delete v.foundGirl;
      delete v.foundGuy;
      delete v.foundDesecratedBook;
      delete v.meetBrook;
      window._origPossessed = SugarCube.setup.Home.isBrookePossessed;
      window._origCDLow = SugarCube.setup.Home.brookePossessedCDLow;
      SugarCube.setup.Home.isBrookePossessed = () => false;
      SugarCube.setup.Home.brookePossessedCDLow = () => false;
    });
    try {
      const initial = await callSetup(page, 'setup.Library.availableSearchResults()');
      expect(initial).toContain('book');
      expect(initial).toContain('girl');
      expect(initial).toContain('guy');
      expect(initial).toContain('brook');

      await page.evaluate(() => {
        SugarCube.State.variables.foundGirl = 1;
        SugarCube.State.variables.foundGuy = 1;
      });
      const after = await callSetup(page, 'setup.Library.availableSearchResults()');
      expect(after).not.toContain('girl');
      expect(after).not.toContain('guy');
      expect(after).toContain('book');
    } finally {
      await page.evaluate(() => {
        if (window._origPossessed) SugarCube.setup.Home.isBrookePossessed = window._origPossessed;
        if (window._origCDLow) SugarCube.setup.Home.brookePossessedCDLow = window._origCDLow;
      });
    }
  });
});
