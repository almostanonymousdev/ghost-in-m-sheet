const { test, expect } = require('@playwright/test');
const { openGame, resetGame, getVar, callSetup } = require('./helpers');

/* Persistent hunt unlocks bought from the witch with ectoplasm.
   setup.HuntController exposes a catalogue (shopCatalogue), per-id
   getters (metaUnlock / hasUnlock), a buy entry point that deducts
   $ectoplasm and bumps the count, plus banlist + reroll-charge
   helpers. Effect wiring lives in startHunt / endHunt / minimapSvg;
   the tests below pin the API contract and the wiring surface for
   each unlock. The WitchEctoplasm passage renders this catalogue. */

test.describe('Hunt persistent unlocks (witch ectoplasm shop)', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  // --- Catalogue / state shape ---

  test('fresh save initialises $meta to empty unlocks/banlist/charges', async () => {
    expect(await getVar(page, 'meta.unlocks')).toEqual({});
    expect(await getVar(page, 'meta.bannedModifiers')).toEqual([]);
    expect(await getVar(page, 'meta.rerollCharges')).toBe(0);
  });

  test('shopCatalogue exposes every advertised unlock id', async () => {
    const ids = (await callSetup(page, 'setup.HuntController.shopCatalogue()')).map(i => i.id);
    expect(ids).toEqual(expect.arrayContaining([
      'banlist_slot', 'reroll_charge', 'witchs_blessing', 'monkeys_favor',
      'smaller_house', 'loot_sense', 'steeled_hand', 'calves_of_steel',
      'intense_intuition', 'reliable_recon'
    ]));
  });

  // --- Buy mechanics ---

  test('buyUnlock deducts ectoplasm and increments the owned count', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.addEctoplasm(40));
    expect(await callSetup(page, 'setup.HuntController.buyUnlock("witchs_blessing")')).toBe(true);
    expect(await callSetup(page, 'setup.HuntController.metaUnlock("witchs_blessing")')).toBe(1);
    expect(await callSetup(page, 'setup.HuntController.hasUnlock("witchs_blessing")')).toBe(true);
    expect(await callSetup(page, 'setup.HuntController.ectoplasm()')).toBe(10); // 40 - 30
  });

  test('buyUnlock rejects when the player cannot afford the cost', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.addEctoplasm(5));
    expect(await callSetup(page, 'setup.HuntController.buyUnlock("witchs_blessing")')).toBe(false);
    expect(await callSetup(page, 'setup.HuntController.hasUnlock("witchs_blessing")')).toBe(false);
    expect(await callSetup(page, 'setup.HuntController.ectoplasm()')).toBe(5);
  });

  test('buyUnlock caps one-time unlocks at max=1', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.addEctoplasm(1000));
    expect(await callSetup(page, 'setup.HuntController.buyUnlock("witchs_blessing")')).toBe(true);
    expect(await callSetup(page, 'setup.HuntController.buyUnlock("witchs_blessing")')).toBe(false);
    expect(await callSetup(page, 'setup.HuntController.metaUnlock("witchs_blessing")')).toBe(1);
  });

  test('buyUnlock allows stacking the banlist slot up to its cap', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.addEctoplasm(1000));
    expect(await callSetup(page, 'setup.HuntController.buyUnlock("banlist_slot")')).toBe(true);
    expect(await callSetup(page, 'setup.HuntController.buyUnlock("banlist_slot")')).toBe(true);
    expect(await callSetup(page, 'setup.HuntController.buyUnlock("banlist_slot")')).toBe(true);
    expect(await callSetup(page, 'setup.HuntController.buyUnlock("banlist_slot")')).toBe(false);
    expect(await callSetup(page, 'setup.HuntController.bannedSlotsTotal()')).toBe(3);
  });

  // --- Banlist ---

  test('toggleBannedModifier respects available slots', async () => {
    // No slots owned -> ban refused.
    expect(await callSetup(page, 'setup.HuntController.toggleBannedModifier("pheromones")')).toBe(false);

    await page.evaluate(() => SugarCube.setup.HuntController.addEctoplasm(100));
    await page.evaluate(() => SugarCube.setup.HuntController.buyUnlock('banlist_slot'));

    expect(await callSetup(page, 'setup.HuntController.toggleBannedModifier("pheromones")')).toBe(true);
    expect(await callSetup(page, 'setup.HuntController.bannedModifiers()')).toEqual(['pheromones']);
    // Toggling again removes it (frees the slot).
    expect(await callSetup(page, 'setup.HuntController.toggleBannedModifier("pheromones")')).toBe(true);
    expect(await callSetup(page, 'setup.HuntController.bannedModifiers()')).toEqual([]);
  });

  test('toggleBannedModifier rejects unknown modifier ids', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.addEctoplasm(100));
    await page.evaluate(() => SugarCube.setup.HuntController.buyUnlock('banlist_slot'));
    expect(await callSetup(page, 'setup.HuntController.toggleBannedModifier("not_a_real_modifier")')).toBe(false);
    expect(await callSetup(page, 'setup.HuntController.bannedModifiers()')).toEqual([]);
  });

  test('startHunt strips banned modifiers from the draft pool', async () => {
    // Buy enough banlist slots to ban every modifier-1 ahead of one
    // we know the seeded draft would otherwise pick.
    await page.evaluate(() => SugarCube.setup.HuntController.addEctoplasm(1000));
    await page.evaluate(() => {
      const all = SugarCube.setup.Modifiers.draftableList().map(m => m.id);
      // Ban every modifier; the draft should fall back to fewer picks.
      // Buy enough slots first.
      // (We need 3 slots max -> ban 3 of 11 ids: enough for the smoke test.)
      SugarCube.setup.HuntController.buyUnlock('banlist_slot');
      SugarCube.setup.HuntController.buyUnlock('banlist_slot');
      SugarCube.setup.HuntController.buyUnlock('banlist_slot');
      SugarCube.setup.HuntController.toggleBannedModifier(all[0]);
      SugarCube.setup.HuntController.toggleBannedModifier(all[1]);
      SugarCube.setup.HuntController.toggleBannedModifier(all[2]);
    });
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 42 }));
    const drafted = await callSetup(page, 'setup.HuntController.modifiers()');
    const banned  = await callSetup(page, 'setup.HuntController.bannedModifiers()');
    drafted.forEach(id => expect(banned).not.toContain(id));
  });

  // --- Reroll charges ---

  test('reroll charge is consumed and modifies the active run\'s deck', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.addEctoplasm(100));
    await page.evaluate(() => SugarCube.setup.HuntController.buyUnlock('reroll_charge'));
    expect(await callSetup(page, 'setup.HuntController.rerollCharges()')).toBe(1);

    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 9001 }));
    const before = await callSetup(page, 'setup.HuntController.modifiers()');

    expect(await callSetup(page, 'setup.HuntController.consumeRerollCharge()')).toBe(true);
    const newDraft = await callSetup(page, 'setup.HuntController.redraftRunModifiers()');
    expect(newDraft).not.toEqual(before);
    expect(await callSetup(page, 'setup.HuntController.modifiers()')).toEqual(newDraft);
    expect(await callSetup(page, 'setup.HuntController.rerollCharges()')).toBe(0);
  });

  test('consumeRerollCharge fails when stockpile is empty', async () => {
    expect(await callSetup(page, 'setup.HuntController.consumeRerollCharge()')).toBe(false);
  });

  // --- startHunt effect wiring per unlock ---

  test('Witch\'s Blessing pre-stamps tarot deck onto collectedLoot', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.addEctoplasm(100));
    await page.evaluate(() => SugarCube.setup.HuntController.buyUnlock('witchs_blessing'));
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1 }));

    expect(await callSetup(page, 'setup.HuntController.hasCollected("tarotCards")')).toBe(true);
    // Tarot deck stage should be CARRYING (the markTarotCarrying flip).
    expect(await callSetup(page, 'setup.HauntedHouses.tarotCardsStage()'))
      .toBe(await callSetup(page, 'setup.TarotStage.CARRYING'));
  });

  test('Monkey\'s Favor pre-stamps the paw onto collectedLoot', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.addEctoplasm(100));
    await page.evaluate(() => SugarCube.setup.HuntController.buyUnlock('monkeys_favor'));
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1 }));

    expect(await callSetup(page, 'setup.HuntController.hasCollected("monkeyPaw")')).toBe(true);
    // Paw stage should be FOUND.
    expect(await callSetup(page, 'setup.MonkeyPaw.isFound()')).toBe(true);
  });

  test('Smaller House shaves one room off the floor plan', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1 }));
    const before = (await callSetup(page, 'setup.HuntController.field("floorplan")')).rooms.length;

    // End and re-roll with the unlock active.
    await page.evaluate(() => SugarCube.setup.HuntController.end());
    await page.evaluate(() => SugarCube.setup.HuntController.addEctoplasm(100));
    await page.evaluate(() => SugarCube.setup.HuntController.buyUnlock('smaller_house'));
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1 }));
    const after = (await callSetup(page, 'setup.HuntController.field("floorplan")')).rooms.length;

    expect(after).toBe(before - 1);
  });

  test('Steeled Hand bumps sanityMax for the duration of the run', async () => {
    const baseMax = await getVar(page, 'mc.sanityMax');

    await page.evaluate(() => SugarCube.setup.HuntController.addEctoplasm(100));
    await page.evaluate(() => SugarCube.setup.HuntController.buyUnlock('steeled_hand'));
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1 }));

    expect(await getVar(page, 'mc.sanityMax')).toBe(baseMax + 25);

    // endHunt restores the prior cap.
    await page.evaluate(() => SugarCube.setup.HuntController.endHunt(false));
    expect(await getVar(page, 'mc.sanityMax')).toBe(baseMax);
  });

  test('Calves of Steel bumps energyMax for the duration of the run', async () => {
    const baseMax = await getVar(page, 'mc.energyMax');

    await page.evaluate(() => SugarCube.setup.HuntController.addEctoplasm(100));
    await page.evaluate(() => SugarCube.setup.HuntController.buyUnlock('calves_of_steel'));
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1 }));

    expect(await getVar(page, 'mc.energyMax')).toBe(baseMax + 5);

    await page.evaluate(() => SugarCube.setup.HuntController.endHunt(false));
    expect(await getVar(page, 'mc.energyMax')).toBe(baseMax);
  });

  test('Intense Intuition pre-checks one of the ghost\'s true evidences', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.addEctoplasm(100));
    await page.evaluate(() => SugarCube.setup.HuntController.buyUnlock('intense_intuition'));
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1 }));

    const evidence = await callSetup(page, 'setup.HuntController.runEvidence()');
    const checks = await callSetup(page, 'setup.Ghosts.readEvidenceChecks()');
    const checkedIds = Object.keys(checks).filter(k => checks[k]);
    expect(checkedIds.length).toBe(1);
    expect(evidence).toContain(checkedIds[0]);
  });

  // --- Minimap rendering ---

  test('Loot Sense adds hunt-minimap-loot to rooms with uncollected loot', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.addEctoplasm(100));
    await page.evaluate(() => SugarCube.setup.HuntController.buyUnlock('loot_sense'));
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1 }));

    const svg = await callSetup(page, 'setup.HuntController.minimapSvg()');
    expect(svg).toMatch(/hunt-minimap-loot/);
  });

  test('Loot Sense drops the highlight once every loot kind in a room is collected', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.addEctoplasm(100));
    await page.evaluate(() => SugarCube.setup.HuntController.buyUnlock('loot_sense'));
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1 }));

    // Mark every floor-plan loot kind collected.
    await page.evaluate(() => {
      const fp = SugarCube.setup.HuntController.field('floorplan');
      Object.keys(fp.loot || {}).forEach(k => SugarCube.setup.HuntController.takeLoot(k));
    });
    const svg = await callSetup(page, 'setup.HuntController.minimapSvg()');
    expect(svg).not.toMatch(/hunt-minimap-loot/);
  });

  test('Reliable Recon highlights spawn until the ghost relocates', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.addEctoplasm(100));
    await page.evaluate(() => SugarCube.setup.HuntController.buyUnlock('reliable_recon'));
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1 }));

    let svg = await callSetup(page, 'setup.HuntController.minimapSvg()');
    expect(svg).toMatch(/hunt-minimap-recon/);

    // Force the ghost to drift so spawnRoomId diverges from
    // originalSpawnRoomId. The driftGhostRoom helper picks a fresh
    // non-hallway room; rerun until the spawn actually moves.
    await page.evaluate(() => {
      const fp = SugarCube.setup.HuntController.field('floorplan');
      const orig = fp.spawnRoomId;
      let attempts = 0;
      while (fp.spawnRoomId === orig && attempts++ < 50) {
        SugarCube.setup.HuntController.driftGhostRoom();
      }
    });
    svg = await callSetup(page, 'setup.HuntController.minimapSvg()');
    expect(svg).not.toMatch(/hunt-minimap-recon/);
  });

  test('Reliable Recon highlight is absent when the unlock is not owned', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1 }));
    const svg = await callSetup(page, 'setup.HuntController.minimapSvg()');
    expect(svg).not.toMatch(/hunt-minimap-recon/);
  });

  // --- Address rotation across runs ---

  test('endHunt rolls a fresh nextSeed so the next run\'s address differs', async () => {
    const before = await callSetup(page, 'setup.HuntController.nextSeed()');
    await page.evaluate(s => SugarCube.setup.HuntController.startHunt({ seed: s }), before);
    await page.evaluate(() => SugarCube.setup.HuntController.endHunt(false));
    const after = await callSetup(page, 'setup.HuntController.nextSeed()');
    expect(after).not.toBe(before);
  });

  test('GhostStreet hunt card preview matches the lobby\'s actual run seed', async () => {
    // Card preview uses setup.HuntController.nextSeed(); HuntStart auto-roll
    // consumes that same seed via setup.HuntController.startHunt({ seed: ... }).
    const previewSeed = await callSetup(page, 'setup.HuntController.nextSeed()');
    await page.evaluate(s => SugarCube.setup.HuntController.startHunt({ seed: s }), previewSeed);
    expect(await callSetup(page, 'setup.HuntController.seed()')).toBe(previewSeed);
  });

  // --- Save migration / ownership ---

  test('reading API on a save without $meta lazily backfills the bundle', async () => {
    await page.evaluate(() => { delete SugarCube.State.variables.meta; });
    expect(await callSetup(page, 'setup.HuntController.metaUnlock("witchs_blessing")')).toBe(0);
    expect(await callSetup(page, 'setup.HuntController.bannedModifiers()')).toEqual([]);
    expect(await callSetup(page, 'setup.HuntController.rerollCharges()')).toBe(0);
    // The lazy fill should have populated the bundle for subsequent writes.
    expect(await getVar(page, 'meta.unlocks')).toEqual({});
  });
});
