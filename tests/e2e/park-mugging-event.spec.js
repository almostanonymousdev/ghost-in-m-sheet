const { test, expect } = require('../fixtures');
const { setVar, getVar, callSetup } = require('../helpers');

/**
 * Park mugging event lives in setup.Park:
 *
 *   shouldTriggerParkMugging() -- false when exhibitionism >= 5, else 10%
 *   applyMuggingOutcome()      -- energy=0, exhibitionism+1 (capped at 10),
 *                                 returns new exhib or null at cap
 *
 * Plus the supporting park gates:
 *   isOpen() -- 6 <= hour <= 21
 *   canJogNow() -- sportswear + open + no cooldown + 2+ energy
 *   canEscapeParkEvent() -- energy >= 4
 */
test.describe('Park mugging event', () => {
  test.describe.configure({ timeout: 20_000 });

  test('shouldTriggerParkMugging returns false when exhibitionism is 5 or more', async ({ game: page }) => {
    for (const exhib of [5, 6, 9, 15]) {
      await page.evaluate((e) => {
        SugarCube.State.variables.mc.exhibitionism = e;
      }, exhib);
      // Force Math.random=0 so the only thing gating is the exhib cap.
      const triggers = await page.evaluate(() => {
        const orig = Math.random;
        Math.random = () => 0;
        try { return SugarCube.setup.Park.shouldTriggerParkMugging(); }
        finally { Math.random = orig; }
      });
      expect(triggers).toBe(false);
    }
  });

  test('shouldTriggerParkMugging fires under exhibitionism cap with low roll', async ({ game: page }) => {
    await page.evaluate(() => { SugarCube.State.variables.mc.exhibitionism = 0; });
    const triggered = await page.evaluate(() => {
      const orig = Math.random;
      Math.random = () => 0.05; // < 0.10
      try { return SugarCube.setup.Park.shouldTriggerParkMugging(); }
      finally { Math.random = orig; }
    });
    expect(triggered).toBe(true);
  });

  test('shouldTriggerParkMugging does not fire at high roll', async ({ game: page }) => {
    await page.evaluate(() => { SugarCube.State.variables.mc.exhibitionism = 0; });
    const triggered = await page.evaluate(() => {
      const orig = Math.random;
      Math.random = () => 0.5; // >= 0.10
      try { return SugarCube.setup.Park.shouldTriggerParkMugging(); }
      finally { Math.random = orig; }
    });
    expect(triggered).toBe(false);
  });

  test('applyMuggingOutcome drains energy and bumps exhibitionism when below cap', async ({ game: page }) => {
    await page.evaluate(() => {
      SugarCube.State.variables.mc.exhibitionism = 3;
      SugarCube.setup.Mc.setEnergy(50);
    });
    const newExhib = await callSetup(page, 'setup.Park.applyMuggingOutcome()');
    expect(newExhib).toBe(4);
    expect(await callSetup(page, 'setup.Mc.energy()')).toBe(0);
  });

  test('applyMuggingOutcome returns null when exhibitionism is already capped at 10', async ({ game: page }) => {
    await page.evaluate(() => {
      SugarCube.State.variables.mc.exhibitionism = 10;
      SugarCube.setup.Mc.setEnergy(80);
    });
    const result = await callSetup(page, 'setup.Park.applyMuggingOutcome()');
    expect(result).toBeNull();
    expect(await callSetup(page, 'setup.Mc.energy()')).toBe(0);
    expect(await callSetup(page, 'SugarCube.State.variables.mc.exhibitionism')).toBe(10);
  });

  test('isOpen tracks the 6..21 window', async ({ game: page }) => {
    for (const [h, open] of [[5, false], [6, true], [12, true], [21, true], [22, false], [23, false]]) {
      await setVar(page, 'hours', h);
      expect(await callSetup(page, 'setup.Park.isOpen()')).toBe(open);
    }
  });

  test('canEscapeParkEvent requires 4+ energy', async ({ game: page }) => {
    await page.evaluate(() => SugarCube.setup.Mc.setEnergy(3));
    expect(await callSetup(page, 'setup.Park.canEscapeParkEvent()')).toBe(false);
    await page.evaluate(() => SugarCube.setup.Mc.setEnergy(4));
    expect(await callSetup(page, 'setup.Park.canEscapeParkEvent()')).toBe(true);
  });

  test('isBeautyBelow returns true when the threshold is at or below MC beauty', async ({ game: page }) => {
    await page.evaluate(() => {
      window._origBeauty = SugarCube.setup.Mc.beauty;
      SugarCube.setup.Mc.beauty = () => 50;
    });
    try {
      expect(await callSetup(page, 'setup.Park.isBeautyBelow(40)')).toBe(true);
      expect(await callSetup(page, 'setup.Park.isBeautyBelow(50)')).toBe(true);
      expect(await callSetup(page, 'setup.Park.isBeautyBelow(70)')).toBe(false);
    } finally {
      await page.evaluate(() => {
        if (window._origBeauty) SugarCube.setup.Mc.beauty = window._origBeauty;
      });
    }
  });
});
