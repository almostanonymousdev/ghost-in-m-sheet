const { test, expect } = require('@playwright/test');
const { openGame, resetGame, callSetup, goToPassage } = require('./helpers');

/* commitTempCorruption caps the per-hunt corruption commit at +1, so
   once $tempCorr has reached 1 every additional 0.05 / 0.1 the
   snapshot would have stamped is discarded at hunt end. The hunt HUD
   row in widgetHauntedHouseRoom.tw reads snapshot().corruptionPending
   verbatim, so without this guard the player sees "+0.1/step" promised
   while the bank silently swallows everything past the cap. Pin the
   contract: snapshot().corruptionPending must be 0 once $tempCorr
   is already at (or past) the cap. */
test.describe('HauntConditions corruption banking cap', () => {
  let page;

  test.beforeAll(async ({ browser }) => {
    page = await openGame(browser);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test.beforeEach(async () => {
    await resetGame(page);
    await page.waitForFunction(() => SugarCube.State.variables.mc != null);
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1 }));
    await goToPassage(page, 'HuntRun');
  });

  test('corruptionPending is non-zero while the bank has headroom', async () => {
    const pending = await page.evaluate(() => {
      const V = SugarCube.State.variables;
      V.tempCorr = 0;
      V.mc.lust = 100;          // engages both lust >= 50 and lust >= 100 banking lines
      return SugarCube.setup.HauntConditions.snapshot().corruptionPending;
    });
    expect(pending).toBeGreaterThan(0);
  });

  test('corruptionPending is 0 once $tempCorr has reached the +1 cap', async () => {
    const pending = await page.evaluate(() => {
      const V = SugarCube.State.variables;
      V.tempCorr = 1;
      V.mc.lust = 100;          // would normally add 0.1
      return SugarCube.setup.HauntConditions.snapshot().corruptionPending;
    });
    expect(pending).toBe(0);
  });

  test('corruptionPending is 0 when $tempCorr has overshot the cap', async () => {
    const pending = await page.evaluate(() => {
      const V = SugarCube.State.variables;
      V.tempCorr = 2.5;         // e.g. Monkey Paw bursts past 1 between commits
      V.mc.lust = 100;
      return SugarCube.setup.HauntConditions.snapshot().corruptionPending;
    });
    expect(pending).toBe(0);
  });

  test('applyTickEffects does not grow $tempCorr past the cap', async () => {
    const result = await page.evaluate(() => {
      const V = SugarCube.State.variables;
      V.tempCorr = 1;
      V.mc.lust = 100;
      const before = V.tempCorr;
      SugarCube.setup.HauntConditions.applyTickEffects();
      return { before, after: V.tempCorr };
    });
    expect(result.before).toBe(1);
    expect(result.after).toBe(1);
  });
});
