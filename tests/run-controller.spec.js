const { test, expect } = require('@playwright/test');
const { openGame, resetGame, getVar, setVar, callSetup } = require('./helpers');

/* setup.Run owns rogue-run lifecycle ($run) and the persistent
   meta-progression currency ($echoes). Classic mode = no rogue
   run active = $run is null. */
test.describe('Run Controller', () => {
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

  // --- Default state ---

  test('fresh save starts in classic mode with no run active', async () => {
    expect(await getVar(page, 'run')).toBeNull();
    expect(await callSetup(page, 'setup.Run.isClassic()')).toBe(true);
    expect(await callSetup(page, 'setup.Run.isRogue()')).toBe(false);
    expect(await callSetup(page, 'setup.Run.active()')).toBeNull();
  });

  test('fresh save initializes echoes to 0', async () => {
    expect(await getVar(page, 'echoes')).toBe(0);
    expect(await callSetup(page, 'setup.Run.echoes()')).toBe(0);
  });

  // --- Run lifecycle ---

  test('start() with explicit seed records the seed and increments run number', async () => {
    await page.evaluate(() => SugarCube.setup.Run.start({ seed: 12345 }));

    expect(await callSetup(page, 'setup.Run.seed()')).toBe(12345);
    expect(await callSetup(page, 'setup.Run.number()')).toBe(1);
    expect(await callSetup(page, 'setup.Run.isRogue()')).toBe(true);
  });

  test('start() without seed rolls a random one in [0, 1e9)', async () => {
    await page.evaluate(() => SugarCube.setup.Run.start());

    const seed = await callSetup(page, 'setup.Run.seed()');
    expect(typeof seed).toBe('number');
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThan(1e9);
  });

  test('default objective is "identify"', async () => {
    await page.evaluate(() => SugarCube.setup.Run.start({ seed: 1 }));
    expect(await callSetup(page, 'setup.Run.objective()')).toBe('identify');
  });

  test('start() with options stores modifiers, loadout, objective', async () => {
    await page.evaluate(() => SugarCube.setup.Run.start({
      seed: 7,
      modifiers: ['power_outage', 'tarot_only'],
      loadout: { tools: ['emf'], money: 50 },
      objective: 'rescue'
    }));

    expect(await callSetup(page, 'setup.Run.modifiers()')).toEqual(['power_outage', 'tarot_only']);
    expect(await callSetup(page, 'setup.Run.loadout()')).toEqual({ tools: ['emf'], money: 50 });
    expect(await callSetup(page, 'setup.Run.objective()')).toBe('rescue');
  });

  test('end() clears the active run but classic predicate flips back', async () => {
    await page.evaluate(() => SugarCube.setup.Run.start({ seed: 1 }));
    expect(await callSetup(page, 'setup.Run.isRogue()')).toBe(true);

    await page.evaluate(() => SugarCube.setup.Run.end());

    expect(await getVar(page, 'run')).toBeNull();
    expect(await callSetup(page, 'setup.Run.isRogue()')).toBe(false);
    expect(await callSetup(page, 'setup.Run.isClassic()')).toBe(true);
  });

  test('run number increments across successive runs', async () => {
    await page.evaluate(() => SugarCube.setup.Run.start({ seed: 1 }));
    await page.evaluate(() => SugarCube.setup.Run.end());
    await page.evaluate(() => SugarCube.setup.Run.start({ seed: 2 }));
    expect(await callSetup(page, 'setup.Run.number()')).toBe(2);
    await page.evaluate(() => SugarCube.setup.Run.end());
    await page.evaluate(() => SugarCube.setup.Run.start({ seed: 3 }));
    expect(await callSetup(page, 'setup.Run.number()')).toBe(3);
  });

  // --- Modifier helpers ---

  test('hasModifier matches the active deck and returns false off-run', async () => {
    expect(await callSetup(page, 'setup.Run.hasModifier("power_outage")')).toBe(false);

    await page.evaluate(() => SugarCube.setup.Run.start({
      seed: 1, modifiers: ['power_outage']
    }));

    expect(await callSetup(page, 'setup.Run.hasModifier("power_outage")')).toBe(true);
    expect(await callSetup(page, 'setup.Run.hasModifier("tarot_only")')).toBe(false);
  });

  test('addModifier appends to the deck and is idempotent', async () => {
    await page.evaluate(() => SugarCube.setup.Run.start({ seed: 1 }));

    expect(await callSetup(page, 'setup.Run.addModifier("foo")')).toBe(true);
    expect(await callSetup(page, 'setup.Run.addModifier("foo")')).toBe(false);
    expect(await callSetup(page, 'setup.Run.modifiers()')).toEqual(['foo']);

    await page.evaluate(() => SugarCube.setup.Run.addModifier('bar'));
    expect(await callSetup(page, 'setup.Run.modifiers()')).toEqual(['foo', 'bar']);
  });

  // --- Generic field stash ---

  test('setField/field round-trips arbitrary per-run subsystem state', async () => {
    await page.evaluate(() => SugarCube.setup.Run.start({ seed: 1 }));

    await page.evaluate(() => SugarCube.setup.Run.setField('floorplan', { rooms: ['a', 'b'] }));
    expect(await callSetup(page, 'setup.Run.field("floorplan")')).toEqual({ rooms: ['a', 'b'] });
  });

  test('setField/field is a no-op when no run is active', async () => {
    await page.evaluate(() => SugarCube.setup.Run.setField('floorplan', { rooms: ['a'] }));
    expect(await callSetup(page, 'setup.Run.field("floorplan")')).toBeUndefined();
  });

  // --- Echoes ---

  test('addEchoes accumulates the persistent currency', async () => {
    await page.evaluate(() => SugarCube.setup.Run.addEchoes(5));
    await page.evaluate(() => SugarCube.setup.Run.addEchoes(7));
    expect(await callSetup(page, 'setup.Run.echoes()')).toBe(12);
  });

  test('spendEchoes rejects when the player cannot afford the cost', async () => {
    await page.evaluate(() => SugarCube.setup.Run.addEchoes(3));

    expect(await callSetup(page, 'setup.Run.spendEchoes(5)')).toBe(false);
    expect(await callSetup(page, 'setup.Run.echoes()')).toBe(3); // unchanged
  });

  test('spendEchoes deducts on success', async () => {
    await page.evaluate(() => SugarCube.setup.Run.addEchoes(10));

    expect(await callSetup(page, 'setup.Run.spendEchoes(4)')).toBe(true);
    expect(await callSetup(page, 'setup.Run.echoes()')).toBe(6);
  });

  test('canAffordEchoes reflects the current balance', async () => {
    await page.evaluate(() => SugarCube.setup.Run.addEchoes(5));

    expect(await callSetup(page, 'setup.Run.canAffordEchoes(5)')).toBe(true);
    expect(await callSetup(page, 'setup.Run.canAffordEchoes(6)')).toBe(false);
  });

  test('echoes survive across run start/end', async () => {
    await page.evaluate(() => SugarCube.setup.Run.addEchoes(10));
    await page.evaluate(() => SugarCube.setup.Run.start({ seed: 1 }));
    expect(await callSetup(page, 'setup.Run.echoes()')).toBe(10);
    await page.evaluate(() => SugarCube.setup.Run.end());
    expect(await callSetup(page, 'setup.Run.echoes()')).toBe(10);
  });
});
