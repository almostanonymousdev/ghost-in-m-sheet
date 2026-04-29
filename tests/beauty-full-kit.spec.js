const { test, expect } = require('@playwright/test');
const { openGame, resetGame, goToPassage, getVar, setVar, callSetup } = require('./helpers');

/**
 * Regression: a user reported that with Fitness 100, stylish makeup, and
 * all six tattoos the displayed beauty was -1. Each ingredient should add
 * to beauty, never subtract; the resulting value should be well above 0.
 *
 * Path A (cheat): the StoryCaption "fitUp" cheat calls setup.Mc.setFit(100),
 * which writes fit directly without applying the per-5-fit beauty bonus.
 * Path B (natural): training at the gym calls setup.Gym.applyFitnessGain,
 * which awards +1 beauty per +5 fit.
 *
 * Both should yield positive beauty after stacking stylish makeup (+10)
 * and the six salon tattoos (+2+2+1+3+3+3 = +14).
 */
test.describe('Beauty — full-kit stack (fit 100 + stylish makeup + all tattoos)', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });

  test.beforeEach(async () => {
    await resetGame(page);
    await setVar(page, 'hours', 12);
    await setVar(page, 'mc.money', 5000);
    await setVar(page, 'mc.corruption', 10); // unlocks corruption-gated tattoos
    await setVar(page, 'makeupAmount', 5);
    await setVar(page, 'makeupApplied', 0);
  });

  async function buyAllTattoos() {
    await goToPassage(page, 'BeautySalonTattoos');
    for (let i = 0; i < 6; i++) {
      await page.locator('.buyItemLink a').first().click();
      await page.waitForFunction(() => SugarCube.State.passage === 'BeautySalonTattoos');
    }
  }

  test('via fitUp cheat: stylish makeup + all tattoos leaves beauty positive', async () => {
    // mc.fit defaults to undefined in the literal init; the migration sets
    // it to 0. Mirror the real game by ensuring fit is numeric before
    // calling setFit (the cheat path doesn't normalize).
    await setVar(page, 'mc.fit', 0);

    // fitUp cheat (StoryCaption.tw) -> setup.Mc.setFit(100). Sets fit
    // directly, no beauty bonus.
    await callSetup(page, 'setup.Mc.setFit(100)');

    await callSetup(page, 'setup.Home.applyMakeupTier(2)'); // stylish: +10
    await buyAllTattoos();                                   // +14

    const beauty = await getVar(page, 'mc.beauty');
    // 30 (start) + 0 (cheat skips fit bonus) + 10 (makeup) + 14 (tattoos) = 54.
    expect(beauty).toBe(54);
  });

  test('via natural training: stylish makeup + all tattoos leaves beauty positive', async () => {
    await setVar(page, 'mc.fit', 0);

    // Natural fit gain via applyFitnessGain: floor(100/5) - floor(0/5) = +20 beauty
    await callSetup(page, 'setup.Gym.applyFitnessGain(100)');

    await callSetup(page, 'setup.Home.applyMakeupTier(2)'); // +10
    await buyAllTattoos();                                   // +14

    const beauty = await getVar(page, 'mc.beauty');
    // 30 + 20 + 10 + 14 = 74
    expect(beauty).toBe(74);
  });

  test('repeated shower→reapply stylish makeup never drops beauty below 0', async () => {
    // Repro for the user-reported "Beauty is -1" bug. The Bathroom shower
    // calls <<washClean "50%" 10>> -> removeMakeupWithPenalty(10), which
    // deducts (10 + 5) = 15 for tier-2 makeup but applyMakeupTier(2) only
    // adds 10. Each shower→reapply cycle loses 5 beauty with no clamp, so
    // 15 cycles starting from beauty=74 drives the stat to -1 while the
    // user still sees stylish makeup applied.
    await setVar(page, 'makeupAmount', 100);
    await setVar(page, 'mc.beauty', 74);
    await setVar(page, 'mc.makeupImg', 2);
    await setVar(page, 'makeupApplied', 1);

    for (let i = 0; i < 15; i++) {
      await callSetup(page, 'setup.Home.wipeMakeupWithPenalty(10)'); // shower
      await callSetup(page, 'setup.Home.applyMakeupTier(2)');          // re-apply
    }

    const beauty = await getVar(page, 'mc.beauty');
    expect(beauty).toBeGreaterThanOrEqual(0);
  });
});
