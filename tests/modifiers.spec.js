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
      expect(typeof m.payoutMultiplier).toBe('number');
      expect(m.payoutMultiplier).toBeGreaterThan(0);
    });
  });

  test('every modifier has a unique id', async () => {
    const cat = await callSetup(page, 'setup.Modifiers.list()');
    const ids = cat.map(m => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('byId returns the entry or null', async () => {
    const known = await callSetup(page, 'setup.Modifiers.byId("locked_tools")');
    expect(known).not.toBeNull();
    expect(known.id).toBe('locked_tools');

    const unknown = await callSetup(page, 'setup.Modifiers.byId("does_not_exist")');
    expect(unknown).toBeNull();
  });

  test('pheromones is a draftable modifier', async () => {
    const entry = await callSetup(page, 'setup.Modifiers.byId("pheromones")');
    expect(entry).not.toBeNull();
    expect(entry.id).toBe('pheromones');
    expect(entry.weight).toBeGreaterThan(0);
  });

  test('draftableList drops weight-0 entries', async () => {
    const draftable = await callSetup(page, 'setup.Modifiers.draftableList()');
    draftable.forEach(m => expect(m.weight).toBeGreaterThan(0));
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

  test('draft excludes ids in opts.banned', async () => {
    const all = await callSetup(page, 'setup.Modifiers.draftableList()');
    const banned = [all[0].id, all[1].id];
    for (const seed of [1, 17, 42, 123, 9000]) {
      const picks = await page.evaluate(({ s, b }) =>
        SugarCube.setup.Modifiers.draft(s, 5, { banned: b }).map(m => m.id),
        { s: seed, b: banned });
      banned.forEach(id => expect(picks).not.toContain(id));
    }
  });

  test('draft falls back to the trimmed pool size when banned shrinks it below n', async () => {
    const all = await callSetup(page, 'setup.Modifiers.draftableList()');
    // Ban every modifier except the last; ask for more than 1 -> 1 returned.
    const banned = all.slice(0, -1).map(m => m.id);
    const picks = await page.evaluate(b =>
      SugarCube.setup.Modifiers.draft(1, 5, { banned: b }).map(m => m.id),
      banned);
    expect(picks.length).toBe(1);
    expect(banned).not.toContain(picks[0]);
  });

  // --- Integration with active run ---

  test('activeList resolves $run.modifiers ids to catalogue entries', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.start({
      seed: 1, modifiers: ['locked_tools', 'pheromones']
    }));

    const active = await callSetup(page, 'setup.Modifiers.activeList()');
    expect(active.map(m => m.id)).toEqual(['locked_tools', 'pheromones']);
  });

  test('activeList drops unknown modifier ids silently', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.start({
      seed: 1, modifiers: ['locked_tools', 'renamed_or_removed', 'pheromones']
    }));

    const active = await callSetup(page, 'setup.Modifiers.activeList()');
    expect(active.map(m => m.id)).toEqual(['locked_tools', 'pheromones']);
  });

  test('activeList returns [] in classic mode', async () => {
    const active = await callSetup(page, 'setup.Modifiers.activeList()');
    expect(active).toEqual([]);
  });

  // --- Payout multiplier ---

  test('payoutMultiplier returns 1 with no active run', async () => {
    expect(await callSetup(page, 'setup.Modifiers.payoutMultiplier()')).toBe(1);
  });

  test('payoutMultiplier multiplies the active deck', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.start({
      seed: 1, modifiers: ['locked_tools', 'pheromones']
    }));
    const lt = await callSetup(page, 'setup.Modifiers.byId("locked_tools").payoutMultiplier');
    const ph = await callSetup(page, 'setup.Modifiers.byId("pheromones").payoutMultiplier');
    const got = await callSetup(page, 'setup.Modifiers.payoutMultiplier()');
    expect(got).toBeCloseTo(lt * ph, 5);
  });

  test('payoutMultiplier ignores unknown modifier ids (1x contribution)', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.start({
      seed: 1, modifiers: ['fog_of_war', 'renamed_or_removed']
    }));
    const fow = await callSetup(page, 'setup.Modifiers.byId("fog_of_war").payoutMultiplier');
    const got = await callSetup(page, 'setup.Modifiers.payoutMultiplier()');
    expect(got).toBeCloseTo(fow, 5);
  });
});
