const { test, expect } = require('../fixtures');
const { setVar, getVar, callSetup } = require('../helpers');

/**
 * Ectoplasm meta-shop -- persistent unlocks priced in mL of $ectoplasm.
 *
 *   - shopCatalogue() enumerates every purchasable item
 *   - buyUnlock(id) spends ectoplasm, increments metaUnlock(id) up to max
 *   - canAffordEctoplasm gates the "Buy" link
 *   - REROLL_CHARGE is uncapped (max: Infinity) and stacks rerollCharges
 *   - BANLIST_SLOT (max: 3) plus toggleBannedModifier exposes the run-prep flow
 */
test.describe('Ectoplasm shop', () => {
  test.describe.configure({ timeout: 20_000 });

  test('shopCatalogue lists every advertised item with cost+max', async ({ game: page }) => {
    const catalogue = await callSetup(page, 'setup.HuntController.shopCatalogue()');
    const ids = catalogue.map(i => i.id).sort();
    expect(ids).toEqual([
      'banlist_slot', 'calves_of_steel', 'intense_intuition',
      'loot_sense', 'monkeys_favor', 'reliable_recon',
      'reroll_charge', 'smaller_house', 'steeled_hand', 'witchs_blessing'
    ]);
    for (const item of catalogue) {
      expect(typeof item.cost).toBe('number');
      expect(item.cost).toBeGreaterThan(0);
      expect(typeof item.max).toBe('number');
      expect(item.max).toBeGreaterThan(0);
      expect(typeof item.name).toBe('string');
      expect(typeof item.description).toBe('string');
    }
  });

  test('canAffordEctoplasm flips on the threshold', async ({ game: page }) => {
    await page.evaluate(() => { SugarCube.State.variables.ectoplasm = 0; });
    expect(await callSetup(page, 'setup.HuntController.canAffordEctoplasm(20)')).toBe(false);
    await page.evaluate(() => { SugarCube.State.variables.ectoplasm = 19; });
    expect(await callSetup(page, 'setup.HuntController.canAffordEctoplasm(20)')).toBe(false);
    await page.evaluate(() => { SugarCube.State.variables.ectoplasm = 20; });
    expect(await callSetup(page, 'setup.HuntController.canAffordEctoplasm(20)')).toBe(true);
  });

  test('buyUnlock succeeds, deducts ectoplasm, increments meta.unlocks', async ({ game: page }) => {
    await page.evaluate(() => {
      SugarCube.State.variables.ectoplasm = 50;
      SugarCube.State.variables.meta = { unlocks: {}, bannedModifiers: [], rerollCharges: 0 };
    });
    const ok = await callSetup(page, 'setup.HuntController.buyUnlock("smaller_house")');
    expect(ok).toBe(true);
    expect(await callSetup(page, 'setup.HuntController.ectoplasm()')).toBe(30); // 50 - 20
    expect(await callSetup(page, 'setup.HuntController.metaUnlock("smaller_house")')).toBe(1);
    expect(await callSetup(page, 'setup.HuntController.hasUnlock("smaller_house")')).toBe(true);
  });

  test('buyUnlock refuses when unaffordable (no partial deduction)', async ({ game: page }) => {
    await page.evaluate(() => {
      SugarCube.State.variables.ectoplasm = 10;
      SugarCube.State.variables.meta = { unlocks: {}, bannedModifiers: [], rerollCharges: 0 };
    });
    const ok = await callSetup(page, 'setup.HuntController.buyUnlock("smaller_house")');
    expect(ok).toBe(false);
    expect(await callSetup(page, 'setup.HuntController.ectoplasm()')).toBe(10);
    expect(await callSetup(page, 'setup.HuntController.metaUnlock("smaller_house")')).toBe(0);
  });

  test('buyUnlock refuses to exceed max for bool unlocks', async ({ game: page }) => {
    await page.evaluate(() => {
      SugarCube.State.variables.ectoplasm = 1000;
      SugarCube.State.variables.meta = { unlocks: {}, bannedModifiers: [], rerollCharges: 0 };
    });
    expect(await callSetup(page, 'setup.HuntController.buyUnlock("smaller_house")')).toBe(true);
    expect(await callSetup(page, 'setup.HuntController.buyUnlock("smaller_house")')).toBe(false);
    expect(await callSetup(page, 'setup.HuntController.metaUnlock("smaller_house")')).toBe(1);
  });

  test('REROLL_CHARGE stacks indefinitely and increments rerollCharges', async ({ game: page }) => {
    await page.evaluate(() => {
      SugarCube.State.variables.ectoplasm = 100;
      SugarCube.State.variables.meta = { unlocks: {}, bannedModifiers: [], rerollCharges: 0 };
    });
    for (let i = 0; i < 4; i++) {
      const ok = await callSetup(page, 'setup.HuntController.buyUnlock("reroll_charge")');
      expect(ok).toBe(true);
    }
    expect(await callSetup(page, 'setup.HuntController.metaUnlock("reroll_charge")')).toBe(4);
    expect(await callSetup(page, 'setup.HuntController.rerollCharges()')).toBe(4);
    expect(await callSetup(page, 'setup.HuntController.ectoplasm()')).toBe(80); // 100 - 4*5
  });

  test('BANLIST_SLOT stacks up to 3 and enables toggleBannedModifier', async ({ game: page }) => {
    await page.evaluate(() => {
      SugarCube.State.variables.ectoplasm = 1000;
      SugarCube.State.variables.meta = { unlocks: {}, bannedModifiers: [], rerollCharges: 0 };
    });
    expect(await callSetup(page, 'setup.HuntController.buyUnlock("banlist_slot")')).toBe(true);
    expect(await callSetup(page, 'setup.HuntController.buyUnlock("banlist_slot")')).toBe(true);
    expect(await callSetup(page, 'setup.HuntController.buyUnlock("banlist_slot")')).toBe(true);
    expect(await callSetup(page, 'setup.HuntController.buyUnlock("banlist_slot")')).toBe(false); // cap
    expect(await callSetup(page, 'setup.HuntController.bannedSlotsTotal()')).toBe(3);

    // Ban two modifiers, then unban one.
    expect(await callSetup(page, 'setup.HuntController.toggleBannedModifier("pheromones")')).toBe(true);
    expect(await callSetup(page, 'setup.HuntController.toggleBannedModifier("locked_tools")')).toBe(true);
    expect(await callSetup(page, 'setup.HuntController.bannedSlotsUsed()')).toBe(2);
    expect(await callSetup(page, 'setup.HuntController.bannedSlotsRemaining()')).toBe(1);

    // Toggle off pheromones.
    expect(await callSetup(page, 'setup.HuntController.toggleBannedModifier("pheromones")')).toBe(true);
    expect(await callSetup(page, 'setup.HuntController.isBanned("pheromones")')).toBe(false);
    expect(await callSetup(page, 'setup.HuntController.isBanned("locked_tools")')).toBe(true);
  });

  test('toggleBannedModifier rejects unknown modifier ids', async ({ game: page }) => {
    await page.evaluate(() => {
      SugarCube.State.variables.ectoplasm = 1000;
      SugarCube.State.variables.meta = { unlocks: { banlist_slot: 3 }, bannedModifiers: [], rerollCharges: 0 };
    });
    expect(await callSetup(page, 'setup.HuntController.toggleBannedModifier("not_a_real_modifier")')).toBe(false);
  });

  test('toggleBannedModifier refuses when no slots available', async ({ game: page }) => {
    await page.evaluate(() => {
      SugarCube.State.variables.ectoplasm = 0;
      SugarCube.State.variables.meta = { unlocks: {}, bannedModifiers: [], rerollCharges: 0 };
    });
    expect(await callSetup(page, 'setup.HuntController.bannedSlotsTotal()')).toBe(0);
    expect(await callSetup(page, 'setup.HuntController.toggleBannedModifier("pheromones")')).toBe(false);
  });

  test('unknown shop ids are rejected by buyUnlock', async ({ game: page }) => {
    await page.evaluate(() => { SugarCube.State.variables.ectoplasm = 100; });
    expect(await callSetup(page, 'setup.HuntController.buyUnlock("phantom_item")')).toBe(false);
    expect(await callSetup(page, 'setup.HuntController.ectoplasm()')).toBe(100);
  });
});
