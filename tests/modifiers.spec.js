const { test, expect } = require('@playwright/test');
const { openGame, resetGame, callSetup } = require('./helpers');

/* setup.Modifiers is a pure catalogue + drafter. Effects are
   wired into individual controllers as each modifier is brought
   online; the registry just enumerates and weighted-randomly
   picks them. */
test.describe('Modifier registry', () => {
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

  // --- Catalogue shape ---

  test('catalogue is non-empty and frozen', async () => {
    const cat = await callSetup(page, 'setup.Modifiers.list()');
    expect(Array.isArray(cat)).toBe(true);
    expect(cat.length).toBeGreaterThan(0);

    // Every entry has the required fields.
    cat.forEach(m => {
      expect(typeof m.id).toBe('string');
      expect(typeof m.name).toBe('string');
      expect(typeof m.description).toBe('string');
      expect(typeof m.weight).toBe('number');
    });
  });

  test('every modifier has a unique id', async () => {
    const cat = await callSetup(page, 'setup.Modifiers.list()');
    const ids = cat.map(m => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('byId returns the entry or null', async () => {
    const known = await callSetup(page, 'setup.Modifiers.byId("power_outage")');
    expect(known).not.toBeNull();
    expect(known.id).toBe('power_outage');

    const unknown = await callSetup(page, 'setup.Modifiers.byId("does_not_exist")');
    expect(unknown).toBeNull();
  });

  test('draftableList drops weight-0 entries', async () => {
    const draftable = await callSetup(page, 'setup.Modifiers.draftableList()');
    draftable.forEach(m => expect(m.weight).toBeGreaterThan(0));

    // hard_mode is in the catalogue but not draftable.
    const cat = await callSetup(page, 'setup.Modifiers.list()');
    const hard = cat.find(m => m.id === 'hard_mode');
    expect(hard).toBeDefined();
    expect(hard.weight).toBe(0);
    expect(draftable.find(m => m.id === 'hard_mode')).toBeUndefined();
  });

  // --- Draft determinism ---

  test('draft is deterministic per (seed, n)', async () => {
    const a = await callSetup(page, 'setup.Modifiers.draft(42, 3)');
    const b = await callSetup(page, 'setup.Modifiers.draft(42, 3)');
    expect(a.map(m => m.id)).toEqual(b.map(m => m.id));
  });

  test('draft picks distinct modifiers (no duplicates within one draw)', async () => {
    for (const seed of [1, 2, 3, 99, 12345]) {
      const picks = await page.evaluate(s =>
        SugarCube.setup.Modifiers.draft(s, 5).map(m => m.id), seed);
      expect(new Set(picks).size).toBe(picks.length);
    }
  });

  test('draft caps at draftable pool size', async () => {
    const draftable = await callSetup(page, 'setup.Modifiers.draftableList()');
    const overdraft = await page.evaluate(n =>
      SugarCube.setup.Modifiers.draft(1, n + 5).length, draftable.length);
    expect(overdraft).toBe(draftable.length);
  });

  test('draft never returns weight-0 entries', async () => {
    for (const seed of [1, 17, 42, 123]) {
      const picks = await page.evaluate(s =>
        SugarCube.setup.Modifiers.draft(s, 3), seed);
      picks.forEach(m => expect(m.weight).toBeGreaterThan(0));
    }
  });

  // --- Integration with active run ---

  test('activeList resolves $run.modifiers ids to catalogue entries', async () => {
    await page.evaluate(() => SugarCube.setup.Run.start({
      seed: 1, modifiers: ['power_outage', 'tarot_only']
    }));

    const active = await callSetup(page, 'setup.Modifiers.activeList()');
    expect(active.map(m => m.id)).toEqual(['power_outage', 'tarot_only']);
  });

  test('activeList drops unknown modifier ids silently', async () => {
    await page.evaluate(() => SugarCube.setup.Run.start({
      seed: 1, modifiers: ['power_outage', 'renamed_or_removed', 'sanity_drain']
    }));

    const active = await callSetup(page, 'setup.Modifiers.activeList()');
    expect(active.map(m => m.id)).toEqual(['power_outage', 'sanity_drain']);
  });

  test('activeList returns [] in classic mode', async () => {
    const active = await callSetup(page, 'setup.Modifiers.activeList()');
    expect(active).toEqual([]);
  });
});
