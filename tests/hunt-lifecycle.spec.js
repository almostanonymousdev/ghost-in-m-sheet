const { test, expect } = require('@playwright/test');
const { openGame, resetGame, getVar, callSetup } = require('./helpers');

/* setup.HuntController.startHunt / endHunt compose Run + FloorPlan +
   Modifiers into a single end-to-end lifecycle. The lifecycle
   passages (HuntStart, HuntRun, HuntSummary) are thin orchestration
   around these; the persistent-unlock storefront lives on the
   witch (WitchEctoplasm). */
test.describe('Hunt lifecycle helpers', () => {
  let page;

  test.beforeAll(async ({ browser }) => {
    page = await openGame(browser);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test.beforeEach(async () => {
    await resetGame(page);
  });

  // --- startHunt ---

  test('startHunt creates a run with seed, modifiers, and floorplan', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 42 }));

    const run = await getVar(page, 'run');
    expect(run.seed).toBe(42);
    expect(run.modifiers.length).toBe(2);
    expect(run.objective).toBe('identify');

    const fp = await callSetup(page, 'setup.HuntController.field("floorplan")');
    expect(fp).not.toBeNull();
    expect(fp.seed).toBe(42);
    expect(fp.rooms.length).toBeGreaterThan(0);
  });

  test('startHunt is deterministic from a fixed seed', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 100 }));
    const a = await page.evaluate(() => ({
      modifiers: SugarCube.State.variables.run.modifiers,
      floorplan: SugarCube.setup.HuntController.field('floorplan'),
    }));
    await page.evaluate(() => SugarCube.setup.HuntController.end());

    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 100 }));
    const b = await page.evaluate(() => ({
      modifiers: SugarCube.State.variables.run.modifiers,
      floorplan: SugarCube.setup.HuntController.field('floorplan'),
    }));

    expect(a).toEqual(b);
  });

  test('startHunt with modifierCount controls the draft size', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({
      seed: 1, modifierCount: 1
    }));

    const run = await getVar(page, 'run');
    expect(run.modifiers.length).toBe(1);
  });

  test('startHunt forwards floor-plan opts (e.g. roomCount, includeBoss)', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({
      seed: 1,
      floorPlanOpts: { roomCount: 7, includeBoss: true }
    }));

    const fp = await callSetup(page, 'setup.HuntController.field("floorplan")');
    expect(fp.rooms.length).toBe(7);
    expect(fp.bossRoomId).not.toBeNull();
  });

  test('startHunt accepts custom objective and loadout', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({
      seed: 1,
      objective: 'rescue',
      loadout: { tools: ['emf'], money: 50 }
    }));

    expect(await callSetup(page, 'setup.HuntController.objective()')).toBe('rescue');
    expect(await callSetup(page, 'setup.HuntController.loadout()')).toEqual({ tools: ['emf'], money: 50 });
  });

  // --- endHunt ---

  test('endHunt on a successful run pays out base * deck payoutMultiplier (success base 10)', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({
      seed: 1, modifierCount: 2
    }));
    const expected = await page.evaluate(() =>
      Math.round(10 * SugarCube.setup.Modifiers.payoutMultiplier()));

    const summary = await page.evaluate(() => SugarCube.setup.HuntController.endHunt(true));

    expect(summary.payout).toBe(expected);
    expect(summary.success).toBe(true);
    expect(await callSetup(page, 'setup.HuntController.ectoplasm()')).toBe(expected);
  });

  test('endHunt on a failed run pays out base * deck payoutMultiplier (failure base 3)', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({
      seed: 1, modifierCount: 2
    }));
    const expected = await page.evaluate(() =>
      Math.round(3 * SugarCube.setup.Modifiers.payoutMultiplier()));

    const summary = await page.evaluate(() => SugarCube.setup.HuntController.endHunt(false));

    expect(summary.payout).toBe(expected);
    expect(summary.success).toBe(false);
    expect(await callSetup(page, 'setup.HuntController.ectoplasm()')).toBe(expected);
  });

  test('endHunt clears the active run', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1 }));
    expect(await callSetup(page, 'setup.HuntController.isActive()')).toBe(true);

    await page.evaluate(() => SugarCube.setup.HuntController.endHunt(true));

    expect(await callSetup(page, 'setup.HuntController.isActive()')).toBe(false);
    expect(await getVar(page, 'run')).toBeNull();
  });

  test('endHunt summary captures the run identifiers and modifier list', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({
      seed: 7, modifierCount: 2
    }));

    const summary = await page.evaluate(() => SugarCube.setup.HuntController.endHunt(true));

    expect(summary.seed).toBe(7);
    expect(summary.number).toBe(1);
    expect(summary.objective).toBe('identify');
    expect(summary.modifiers.length).toBe(2);
  });

  test('endHunt is a no-op (returns null) when no run is active', async () => {
    const result = await page.evaluate(() => SugarCube.setup.HuntController.endHunt(true));
    expect(result).toBeNull();
    expect(await callSetup(page, 'setup.HuntController.ectoplasm()')).toBe(0);
  });

  /* HuntSummary reads summary.exitPassage to wire its Continue link;
     each FailureReason routes to its matching HuntOver* screen and the
     remaining outcomes fall back to CityMap. */
  test('endHunt summary.exitPassage maps each failure reason to its HuntOver* screen', async () => {
    const cases = [
      { success: true,  reason: null,         exitPassage: 'CityMap' },
      { success: false, reason: 'sanity',     exitPassage: 'HuntOverSanity' },
      { success: false, reason: 'exhaustion', exitPassage: 'HuntOverExhaustion' },
      { success: false, reason: 'time',       exitPassage: 'HuntOverTime' },
      { success: false, reason: 'caught',     exitPassage: 'CityMap' },
      { success: false, reason: 'fled',       exitPassage: 'CityMap' },
      { success: false, reason: 'abandon',    exitPassage: 'CityMap' },
      { success: false, reason: null,         exitPassage: 'CityMap' }
    ];
    for (const c of cases) {
      await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1 }));
      if (c.success) {
        await page.evaluate(() => SugarCube.setup.HuntController.markSuccess());
      } else if (c.reason) {
        await page.evaluate(reason => SugarCube.setup.HuntController.markFailure(reason), c.reason);
      } else {
        await page.evaluate(() => SugarCube.setup.HuntController.markFailure());
      }
      const summary = await page.evaluate(success => SugarCube.setup.HuntController.endHunt(success), c.success);
      expect(summary.exitPassage).toBe(c.exitPassage);
    }
  });
});
