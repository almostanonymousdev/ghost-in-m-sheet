const { test, expect } = require('@playwright/test');
const { openGame, resetGame, getVar, callSetup } = require('./helpers');

/* setup.Rogue.startRogue / endRogue compose Run + FloorPlan +
   Modifiers into a single end-to-end lifecycle. The lifecycle
   passages (RogueStart, RogueRun, RogueEnd, RogueMetaShop) are
   thin orchestration around these. */
test.describe('Rogue lifecycle helpers', () => {
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

  // --- startRogue ---

  test('startRogue creates a run with seed, modifiers, and floorplan', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({ seed: 42 }));

    const run = await getVar(page, 'run');
    expect(run.seed).toBe(42);
    expect(run.modifiers.length).toBe(2);
    expect(run.objective).toBe('identify');

    const fp = await callSetup(page, 'setup.Rogue.field("floorplan")');
    expect(fp).not.toBeNull();
    expect(fp.seed).toBe(42);
    expect(fp.rooms.length).toBeGreaterThan(0);
  });

  test('startRogue is deterministic from a fixed seed', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({ seed: 100 }));
    const a = await page.evaluate(() => ({
      modifiers: SugarCube.State.variables.run.modifiers,
      floorplan: SugarCube.setup.Rogue.field('floorplan'),
    }));
    await page.evaluate(() => SugarCube.setup.Rogue.end());

    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({ seed: 100 }));
    const b = await page.evaluate(() => ({
      modifiers: SugarCube.State.variables.run.modifiers,
      floorplan: SugarCube.setup.Rogue.field('floorplan'),
    }));

    expect(a).toEqual(b);
  });

  test('startRogue with modifierCount controls the draft size', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({
      seed: 1, modifierCount: 4
    }));

    const run = await getVar(page, 'run');
    expect(run.modifiers.length).toBe(4);
  });

  test('startRogue forwards floor-plan opts (e.g. roomCount, includeBoss)', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({
      seed: 1,
      floorPlanOpts: { roomCount: 7, includeBoss: true }
    }));

    const fp = await callSetup(page, 'setup.Rogue.field("floorplan")');
    expect(fp.rooms.length).toBe(7);
    expect(fp.bossRoomId).not.toBeNull();
  });

  test('startRogue accepts custom objective and loadout', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({
      seed: 1,
      objective: 'rescue',
      loadout: { tools: ['emf'], money: 50 }
    }));

    expect(await callSetup(page, 'setup.Rogue.objective()')).toBe('rescue');
    expect(await callSetup(page, 'setup.Rogue.loadout()')).toEqual({ tools: ['emf'], money: 50 });
  });

  // --- endRogue ---

  test('endRogue on a successful run pays out base + bonus + per-modifier mL of ectoplasm', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({
      seed: 1, modifierCount: 2
    }));

    const summary = await page.evaluate(() => SugarCube.setup.Rogue.endRogue(true));

    // base 5 + success 5 + 2 modifiers = 12 mL
    expect(summary.payout).toBe(12);
    expect(summary.success).toBe(true);
    expect(await callSetup(page, 'setup.Rogue.ectoplasm()')).toBe(12);
  });

  test('endRogue on a failed run pays out base + per-modifier (no success bonus)', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({
      seed: 1, modifierCount: 2
    }));

    const summary = await page.evaluate(() => SugarCube.setup.Rogue.endRogue(false));

    // base 5 + 2 modifiers = 7 mL
    expect(summary.payout).toBe(7);
    expect(summary.success).toBe(false);
    expect(await callSetup(page, 'setup.Rogue.ectoplasm()')).toBe(7);
  });

  test('endRogue clears the active run', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({ seed: 1 }));
    expect(await callSetup(page, 'setup.Rogue.isRogue()')).toBe(true);

    await page.evaluate(() => SugarCube.setup.Rogue.endRogue(true));

    expect(await callSetup(page, 'setup.Rogue.isRogue()')).toBe(false);
    expect(await getVar(page, 'run')).toBeNull();
  });

  test('endRogue summary captures the run identifiers and modifier list', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({
      seed: 7, modifierCount: 3
    }));

    const summary = await page.evaluate(() => SugarCube.setup.Rogue.endRogue(true));

    expect(summary.seed).toBe(7);
    expect(summary.number).toBe(1);
    expect(summary.objective).toBe('identify');
    expect(summary.modifiers.length).toBe(3);
  });

  test('endRogue is a no-op (returns null) when no run is active', async () => {
    const result = await page.evaluate(() => SugarCube.setup.Rogue.endRogue(true));
    expect(result).toBeNull();
    expect(await callSetup(page, 'setup.Rogue.ectoplasm()')).toBe(0);
  });
});
