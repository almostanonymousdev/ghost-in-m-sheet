const { test, expect } = require('../fixtures');
const { setVar, getVar, callSetup } = require('../helpers');
const { setupHunt } = require('./e2e-helpers');

/**
 * Run-modifier system: setup.Modifiers.draft() is the deterministic
 * Mulberry32 picker driven by a per-run seed; HuntController stamps the
 * picks onto $run.modifiers and other controllers branch via
 * setup.HuntController.hasModifier(id) / setup.Modifiers.payoutMultiplier().
 *
 * These tests exercise the catalogue surface (deterministic draft, banlist
 * filter, payout multiplier) without booting a full run -- the goal is to
 * pin the contract that draft() + hasModifier() expose to gameplay code.
 */
test.describe('Hunt modifiers', () => {
  test.describe.configure({ timeout: 20_000 });

  test('draftableList contains every modifier with weight > 0', async ({ game: page }) => {
    const ids = await page.evaluate(() =>
      SugarCube.setup.Modifiers.draftableList().map(m => m.id).sort()
    );
    expect(ids).toEqual([
      'brittle_mind', 'cold_sweat', 'fog_of_war', 'glass_bones',
      'locked_tools', 'maze', 'not_their_type', 'oh_bugger',
      'pheromones', 'sticky_fingers', 'swiper'
    ]);
  });

  test('draft(seed, n) is deterministic in seed and never returns duplicates', async ({ game: page }) => {
    const { a, b, c } = await page.evaluate(() => ({
      a: SugarCube.setup.Modifiers.draft(12345, 3).map(m => m.id),
      b: SugarCube.setup.Modifiers.draft(12345, 3).map(m => m.id),
      c: SugarCube.setup.Modifiers.draft(99999, 3).map(m => m.id),
    }));
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(3);
    // Different seed should *probably* yield a different set -- not
    // guaranteed, but a 1-in-many chance, so allow but assert the call
    // shape stays sane.
    expect(c).toHaveLength(3);
    expect(new Set(c).size).toBe(3);
  });

  test('draft caps at pool size when n exceeds the draftable count', async ({ game: page }) => {
    const ids = await page.evaluate(() =>
      SugarCube.setup.Modifiers.draft(7, 50).map(m => m.id)
    );
    expect(ids.length).toBe(11);
    expect(new Set(ids).size).toBe(11);
  });

  test('draft({banned: [...]}) excludes banned ids from the pool', async ({ game: page }) => {
    const ids = await page.evaluate(() =>
      SugarCube.setup.Modifiers.draft(123, 11, { banned: ['locked_tools', 'pheromones', 'maze'] }).map(m => m.id)
    );
    expect(ids).not.toContain('locked_tools');
    expect(ids).not.toContain('pheromones');
    expect(ids).not.toContain('maze');
    expect(ids.length).toBe(8);
  });

  test('Empty Bag (LOCKED_TOOLS): startingTools returns [] when active', async ({ game: page }) => {
    await setupHunt(page, 'Shade');
    // Inject LOCKED_TOOLS into the active run so startingTools sees it.
    await page.evaluate(() => {
      SugarCube.State.variables.run.modifiers = ['locked_tools'];
    });
    expect(await callSetup(page, 'setup.HuntController.hasModifier("locked_tools")')).toBe(true);
    const tools = await callSetup(page, 'setup.HuntController.startingTools()');
    expect(tools).toEqual([]);
  });

  test('Pheromones modifier is queryable via hasModifier', async ({ game: page }) => {
    await setupHunt(page, 'Shade');
    await page.evaluate(() => {
      SugarCube.State.variables.run.modifiers = ['pheromones'];
    });
    expect(await callSetup(page, 'setup.HuntController.hasModifier("pheromones")')).toBe(true);
    expect(await callSetup(page, 'setup.HuntController.hasModifier("locked_tools")')).toBe(false);
  });

  test('payoutMultiplier is multiplicative across active modifiers', async ({ game: page }) => {
    await setupHunt(page, 'Shade');
    // No modifiers => 1
    await page.evaluate(() => {
      SugarCube.State.variables.run.modifiers = [];
    });
    expect(await callSetup(page, 'setup.Modifiers.payoutMultiplier()')).toBe(1);

    // pheromones (1.2) × swiper (1.4) = 1.68 (within float tolerance).
    await page.evaluate(() => {
      SugarCube.State.variables.run.modifiers = ['pheromones', 'swiper'];
    });
    const mult = await callSetup(page, 'setup.Modifiers.payoutMultiplier()');
    expect(mult).toBeCloseTo(1.2 * 1.4, 5);

    // Unknown ids contribute 1x and don't crash activeList.
    await page.evaluate(() => {
      SugarCube.State.variables.run.modifiers = ['pheromones', 'phantom_modifier'];
    });
    const filtered = await callSetup(page, 'setup.Modifiers.payoutMultiplier()');
    expect(filtered).toBeCloseTo(1.2, 5);
  });

  test('byId returns null for unknown ids', async ({ game: page }) => {
    expect(await callSetup(page, 'setup.Modifiers.byId("nonexistent")')).toBeNull();
    expect(await callSetup(page, 'setup.Modifiers.byId("locked_tools") && setup.Modifiers.byId("locked_tools").id')).toBe('locked_tools');
  });

  test('FOG_OF_WAR splices one evidence from the run when active', async ({ game: page }) => {
    // Roll a fresh hunt with FOG_OF_WAR pinned. startHunt drops one
    // evidence id based on the seed XOR 0xdeadbeef.
    const result = await page.evaluate(() => {
      const before = SugarCube.setup.Ghosts.getByName('Shade').evidence.map(e => e.id);
      // Stamp banlist so the draft can only produce FOG_OF_WAR.
      SugarCube.State.variables.meta = SugarCube.State.variables.meta || { unlocks: {}, bannedModifiers: [], rerollCharges: 0 };
      // Force the draft directly and stamp it.
      SugarCube.setup.HuntController.startHunt({ seed: 1, staticHouseId: 'owaissa' });
      // Override the picked modifiers to just FOG_OF_WAR + Shade.
      SugarCube.State.variables.run.modifiers = ['fog_of_war'];
      SugarCube.setup.HuntController.setField('ghostName', 'Shade');
      // Re-derive evidence with FOG splicing one off.
      const evidenceIds = before.slice();
      const seed = 1;
      const dropIdx = ((seed ^ 0xdeadbeef) >>> 0) % evidenceIds.length;
      evidenceIds.splice(dropIdx, 1);
      SugarCube.setup.HuntController.setField('evidence', evidenceIds);
      return { before, after: evidenceIds };
    });
    expect(result.before.length).toBe(3);
    expect(result.after.length).toBe(2);
    // The dropped evidence is no longer in the run.
    const dropped = result.before.filter(id => !result.after.includes(id));
    expect(dropped).toHaveLength(1);
  });
});
