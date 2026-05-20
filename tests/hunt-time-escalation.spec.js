const { test, expect } = require('@playwright/test');
const { openGame, resetGame, callSetup, goToPassage } = require('./helpers');

/* Time-driven event escalation: as the hunt progresses, the ghost
   should unlock more body parts to target AND prowl events should fire
   more often. Stat axes (lust / corruption / beauty) still nudge things
   but only as a small bump on top of the time signal — see
   setup.Events.statTierBonus (capped at +1 tier) and the per-tick
   "Time (HHMM)" contributor that HauntConditions.snapshot stamps onto
   prowlChanceBonus. */
test.describe('Hunt time-driven escalation', () => {
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
  });

  test('snapshot.prowlChanceBonus grows with elapsed hunt minutes', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1 }));
    await goToPassage(page, 'HuntRun');

    async function bonusAt(elapsed) {
      return page.evaluate((m) => {
        SugarCube.State.variables.hours   = Math.floor(m / 60);
        SugarCube.State.variables.minutes = m % 60;
        return SugarCube.setup.HauntConditions.snapshot().prowlChanceBonus;
      }, elapsed);
    }

    // The room may be dark / overcharged / etc. — we only care about
    // monotonic growth across time samples taken with everything else
    // held constant.
    const t0   = await bonusAt(0);
    const t60  = await bonusAt(60);
    const t180 = await bonusAt(180);
    const t360 = await bonusAt(360);

    expect(t60).toBeGreaterThan(t0);
    expect(t180).toBeGreaterThan(t60);
    expect(t360).toBeGreaterThan(t180);
    // +1% per 20 min capped at +18%, so the spread from t0 → t360 is
    // exactly +18 from the time component alone.
    expect(t360 - t0).toBe(18);
  });

  test('snapshot adds a "Time" contributor once the bonus is non-zero', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1 }));
    await goToPassage(page, 'HuntRun');

    // At hunt start (t=0) there's no Time contributor: timeBonus is 0
    // and the chip is suppressed to keep the HUD quiet.
    let labels = await page.evaluate(() => {
      SugarCube.State.variables.hours = 0;
      SugarCube.State.variables.minutes = 0;
      return SugarCube.setup.HauntConditions.snapshot()
        .contributors.map(c => c.label);
    });
    expect(labels.some(l => l.startsWith('Time'))).toBe(false);

    // After an hour the chip lands.
    labels = await page.evaluate(() => {
      SugarCube.State.variables.hours = 1;
      SugarCube.State.variables.minutes = 0;
      return SugarCube.setup.HauntConditions.snapshot()
        .contributors.map(c => c.label);
    });
    expect(labels.some(l => l.startsWith('Time'))).toBe(true);
  });

  test('time contributor only fires while a hunt is in progress', async () => {
    // Outside a hunt, snapshot() short-circuits the inHouse block, so
    // no Time contributor (and no prowl bonus) should appear.
    const result = await page.evaluate(() => {
      SugarCube.State.variables.hours = 3;
      SugarCube.State.variables.minutes = 0;
      return SugarCube.setup.HauntConditions.snapshot();
    });
    expect(result.prowlChanceBonus).toBe(0);
    expect(result.contributors.map(c => c.label).some(l => l.startsWith('Time'))).toBe(false);
  });

  test('rollBodyPartEvent at t=0 only reaches "brain" (mind only)', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1 }));
    await goToPassage(page, 'HuntRun');
    await page.evaluate(() => {
      const V = SugarCube.State.variables;
      V.hours = 0; V.minutes = 0;
      V.mc.lust = 100;            // even maxed stats can't unlock past tier 1
      V.mc.corruption = 0;
      V.sensualBodyPart = { brain: 1, tits: 5, ass: 5, bottom: 5, mouth: 5, pussy: 5, anal: 5 };
    });
    // Stats don't bump base tier 1 with only one axis maxed, so parts
    // should still be limited to ['brain'].
    expect(await callSetup(page, 'setup.Events.eventTier()')).toBe(1);
    const seen = new Set();
    for (let i = 0; i < 20; i++) {
      const r = await callSetup(page, 'setup.Events.rollBodyPartEvent(0)');
      if (r) seen.add(r);
    }
    // Every roll that picks anything at all must pick 'brain'.
    expect([...seen]).toEqual(['brain']);
  });
});
