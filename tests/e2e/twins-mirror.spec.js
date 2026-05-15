const { test, expect } = require('../fixtures');
const { setVar, getVar, callSetup, goToPassage } = require('../helpers');

/**
 * Twins-ghost mirror event. Bathroom -> Mirror rolls
 *   _checkBeauty = random(30,100)
 *
 * Branches:
 *   - twinsEventReady() && _checkBeauty >  beauty()  -> twins1 (fail, just look)
 *   - twinsEventReady() && _checkBeauty <= beauty()  -> twins success
 *                                                      -> link to TheTwinsEvent
 *   - otherwise -> normal makeup mirror
 *
 * Both branches call setup.Ghosts.consumeTwinsEvent() which flips
 * twinsEventActive to 0 and starts the daily cooldown.
 */
test.describe('Twins mirror event', () => {
  test.describe.configure({ timeout: 20_000 });

  async function setMcBeauty(page, beautyVal) {
    await page.evaluate((b) => {
      const m = SugarCube.State.variables.mc;
      // Beauty is derived: face * cleanliness + makeup bonus + fit bonus.
      // Pin it by overriding the Mc.beauty() helper for the test.
      window._origBeauty = SugarCube.setup.Mc.beauty;
      SugarCube.setup.Mc.beauty = () => b;
    }, beautyVal);
  }

  async function restoreBeauty(page) {
    await page.evaluate(() => {
      if (window._origBeauty) SugarCube.setup.Mc.beauty = window._origBeauty;
    });
  }

  test('low beauty branch: random ≥ beauty triggers twins1 fail (no TheTwinsEvent link)', async ({ game: page }) => {
    await page.evaluate(() => {
      SugarCube.State.variables.twinsEventActive = 1;
      // Reset daily cooldown so twinsEventReady() returns true.
      SugarCube.State.variables.twinsEvent = 0;
    });
    expect(await callSetup(page, 'setup.Ghosts.twinsEventReady()')).toBe(true);

    await setMcBeauty(page, 30);
    try {
      await page.evaluate(() => {
        window._origRandom = Math.random;
        Math.random = () => 0.999; // random(30,100) -> 100, > beauty(30)
      });
      try {
        await goToPassage(page, 'Mirror');
        const text = await page.evaluate(() => document.querySelector('.passage').textContent);
        expect(text).toMatch(/two strangers appear/);
        expect(text).not.toContain('giving in to their desires');
      } finally {
        await page.evaluate(() => { Math.random = window._origRandom; });
      }
    } finally {
      await restoreBeauty(page);
    }
  });

  test('high beauty branch: random ≤ beauty triggers twins success with TheTwinsEvent link', async ({ game: page }) => {
    await page.evaluate(() => {
      SugarCube.State.variables.twinsEventActive = 1;
      SugarCube.State.variables.twinsEvent = 0;
    });
    await setMcBeauty(page, 100);
    try {
      await page.evaluate(() => {
        window._origRandom = Math.random;
        Math.random = () => 0; // random(30,100) -> 30, < beauty(100)
      });
      try {
        await goToPassage(page, 'Mirror');
        // The TheTwinsEvent link is wrapped in a <<linkappend "through the glass">>
        // — click it to materialize the link in the DOM.
        await page.locator('a.macro-linkappend').filter({ hasText: /through the glass/ }).click();
        await page.waitForFunction(
          () => document.querySelector('.passage').innerHTML.includes('TheTwinsEvent'),
          null,
          { timeout: 3000 }
        );
        const html = await page.evaluate(() => document.querySelector('.passage').innerHTML);
        expect(html).toMatch(/TheTwinsEvent/);
      } finally {
        await page.evaluate(() => { Math.random = window._origRandom; });
      }
    } finally {
      await restoreBeauty(page);
    }
  });

  test('twinsEventReady=false renders normal mirror, no twins markup', async ({ game: page }) => {
    await page.evaluate(() => {
      SugarCube.State.variables.twinsEventActive = 0;
    });
    expect(await callSetup(page, 'setup.Ghosts.twinsEventReady()')).toBe(false);
    await goToPassage(page, 'Mirror');
    const text = await page.evaluate(() => document.querySelector('.passage').textContent);
    expect(text).toMatch(/Beauty:/);
    expect(text).not.toMatch(/two strangers appear/);
  });

  test('consumeTwinsEvent clears the active flag and starts cooldown', async ({ game: page }) => {
    await page.evaluate(() => {
      SugarCube.State.variables.twinsEventActive = 1;
      SugarCube.State.variables.twinsEvent = 0;
    });
    expect(await callSetup(page, 'setup.Ghosts.twinsEventReady()')).toBe(true);
    await callSetup(page, 'setup.Ghosts.consumeTwinsEvent()');
    expect(await getVar(page, 'twinsEventActive')).toBe(0);
    expect(await callSetup(page, 'setup.Ghosts.twinsEventReady()')).toBe(false);
  });

  test('clearTwinsEvent zeroes the flag without touching cooldown', async ({ game: page }) => {
    await page.evaluate(() => {
      SugarCube.State.variables.twinsEventActive = 1;
    });
    await callSetup(page, 'setup.Ghosts.clearTwinsEvent()');
    expect(await getVar(page, 'twinsEventActive')).toBe(0);
  });
});
