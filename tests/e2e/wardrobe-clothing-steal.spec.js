const { test, expect } = require('../fixtures');
const {
  callSetup, resetGame,
  setWardrobeItem, getWardrobeItem, setWardrobeSlot,
  getWardrobeStolen, getWardrobeLost,
} = require('../helpers');

/* Equip a catalogue item through the real Wardrobe.equip path. `id` is the
 * canonical wardrobe id ("bra1", "jeans1", "tshirt2") — there are no flat
 * $<name>State save keys any more, everything lives in $wardrobe. */
async function equipById(page, groupName, id) {
  await page.evaluate(({ g, i }) => {
    const grp = SugarCube.setup.WARDROBE_GROUPS.find((x) => x.name === g);
    const item = grp.items.find((it) => it.id === i);
    SugarCube.setup.Wardrobe.equip(grp, item);
  }, { g: groupName, i: id });
}

async function unequipById(page, groupName, id) {
  await page.evaluate(({ g, i }) => {
    const grp = SugarCube.setup.WARDROBE_GROUPS.find((x) => x.name === g);
    const item = grp.items.find((it) => it.id === i);
    SugarCube.setup.Wardrobe.unequip(grp, item);
  }, { g: groupName, i: id });
}

test.describe('Wardrobe — equip / unequip / beauty roundtrip', () => {
  test('equipping a bra adds beauty; unequipping removes it', async ({ game: page }) => {
    await callSetup(page, `setup.Mc.setBeauty(10)`);
    await setWardrobeItem(page, 'bra1', 'not worn');
    await equipById(page, 'bra', 'bra1');
    expect(await getWardrobeItem(page, 'bra1')).toBe('worn');
    expect(await callSetup(page, 'setup.Mc.beauty()')).toBe(12);

    await unequipById(page, 'bra', 'bra1');
    expect(await getWardrobeItem(page, 'bra1')).toBe('not worn');
    expect(await callSetup(page, 'setup.Mc.beauty()')).toBe(10);
  });

  test('equipping a higher tier swaps off the previous tier', async ({ game: page }) => {
    await callSetup(page, `setup.Mc.setBeauty(10)`);
    await setWardrobeItem(page, 'bra1', 'not worn');
    await setWardrobeItem(page, 'bra2', 'not worn');

    await equipById(page, 'bra', 'bra1');
    expect(await callSetup(page, 'setup.Mc.beauty()')).toBe(12);

    await equipById(page, 'bra', 'bra2');
    // Old bra-1 (+2) gone, bra-2 (+4) on → net +4 from baseline 10
    expect(await callSetup(page, 'setup.Mc.beauty()')).toBe(14);
    expect(await getWardrobeItem(page, 'bra1')).toBe('not worn');
    expect(await getWardrobeItem(page, 'bra2')).toBe('worn');
  });
});

test.describe('Wardrobe — steal / restore mechanics', () => {
  test('stealGarment steals a worn bra and refunds its beauty', async ({ game: page }) => {
    await callSetup(page, `setup.Mc.setBeauty(10)`);
    await equipById(page, 'bra', 'bra1');
    expect(await callSetup(page, 'setup.Mc.beauty()')).toBe(12);

    const stole = await callSetup(page, "setup.Wardrobe.stealGarment('bra')");
    expect(stole).toBe('bra');
    expect(await callSetup(page, 'setup.Mc.beauty()')).toBe(10);
    expect(await callSetup(page, 'setup.Wardrobe.isBraStolen()')).toBe(true);
    expect(await getWardrobeItem(page, 'bra1')).toBe('not worn');
    expect(await callSetup(page, 'setup.Wardrobe.rememberTopUnder()')).toBe('nobra1');
  });

  test('stealGarment is a no-op (null) when nothing is worn', async ({ game: page }) => {
    await setWardrobeSlot(page, 'bra', 'not worn');
    const stole = await callSetup(page, "setup.Wardrobe.stealGarment('bra')");
    expect(stole).toBeNull();
  });

  test('restoreGarment restores worn flag, beauty, and clears the stolen marker', async ({ game: page }) => {
    await callSetup(page, `setup.Mc.setBeauty(10)`);
    await equipById(page, 'bra', 'bra1');
    expect(await callSetup(page, 'setup.Mc.beauty()')).toBe(12);

    await callSetup(page, "setup.Wardrobe.stealGarment('bra')");
    expect(await callSetup(page, 'setup.Mc.beauty()')).toBe(10);

    const restored = await callSetup(page, "setup.Wardrobe.restoreGarment('bra')");
    expect(restored).toBe(true);
    expect(await getWardrobeItem(page, 'bra1')).toBe('worn');
    expect(await callSetup(page, 'setup.Mc.beauty()')).toBe(12);
    expect(await callSetup(page, 'setup.Wardrobe.isBraStolen()')).toBe(false);
    expect(await callSetup(page, 'setup.Wardrobe.rememberTopUnder()')).toBe('bra1');
  });

  test('stealGarment("bottom") classifies jeans / shorts / skirt correctly', async ({ game: page }) => {
    const cases = [
      { id: 'jeans1',  expected: 'jeans'  },
      { id: 'shorts1', expected: 'shorts' },
      { id: 'skirt1',  expected: 'skirt'  },
    ];
    for (const c of cases) {
      await resetGame(page);
      await callSetup(page, `setup.Mc.setBeauty(10)`);
      await equipById(page, 'bottomOuter', c.id);

      const result = await callSetup(page, "setup.Wardrobe.stealGarment('bottom')");
      expect(result).toBe(c.expected);
      // The aggregate bottom flag and the sub-category flag both flip.
      expect(await getWardrobeStolen(page, 'bottom')).toBe(true);
      expect(await getWardrobeStolen(page, c.expected)).toBe(true);
      expect(await getWardrobeItem(page, c.id)).toBe('not worn');
    }
  });

  test('stealGarment("bottom") returns null when nothing is worn', async ({ game: page }) => {
    // Fresh bundle wears jeans0 (slot-0 bottom); strip it so nothing is worn.
    await setWardrobeSlot(page, 'jeans', 'not worn');
    const result = await callSetup(page, "setup.Wardrobe.stealGarment('bottom')");
    expect(result).toBeNull();
  });

  test('loseAllStolen marks "not bought" only on stolen-flag groups', async ({ game: page }) => {
    await callSetup(page, `setup.Mc.setBeauty(10)`);
    await equipById(page, 'bra', 'bra1');
    await equipById(page, 'panties', 'panties1');

    await callSetup(page, "setup.Wardrobe.stealGarment('bra')");
    await callSetup(page, "setup.Wardrobe.stealGarment('panties')");

    await callSetup(page, 'setup.Wardrobe.loseAllStolen()');

    expect(await getWardrobeItem(page, 'bra1')).toBe('not bought');
    expect(await getWardrobeItem(page, 'panties1')).toBe('not bought');
    expect(await callSetup(page, 'setup.Wardrobe.isBraStolen()')).toBe(false);
    expect(await callSetup(page, 'setup.Wardrobe.isPantiesStolen()')).toBe(false);
    // The lost pieces land on the buyback list.
    const lost = await getWardrobeLost(page);
    expect(lost).toEqual(expect.arrayContaining(['bra1', 'panties1']));
  });
});

test.describe('Wardrobe — query helpers', () => {
  test('worn(slot) tracks each slot', async ({ game: page }) => {
    await setWardrobeSlot(page, 'tshirt', 'worn');
    expect(await callSetup(page, 'setup.Wardrobe.worn(setup.WardrobeSlot.TSHIRT)')).toBe(true);
    await setWardrobeSlot(page, 'tshirt', 'not worn');
    expect(await callSetup(page, 'setup.Wardrobe.worn(setup.WardrobeSlot.TSHIRT)')).toBe(false);

    await setWardrobeSlot(page, 'bra', 'worn');
    expect(await callSetup(page, 'setup.Wardrobe.worn(setup.WardrobeSlot.BRA)')).toBe(true);

    await setWardrobeSlot(page, 'panties', 'worn');
    expect(await callSetup(page, 'setup.Wardrobe.worn(setup.WardrobeSlot.PANTIES)')).toBe(true);

    await setWardrobeSlot(page, 'jeans', 'worn');
    expect(await callSetup(page, 'setup.Wardrobe.worn(setup.WardrobeSlot.JEANS)')).toBe(true);

    // Setting shorts worn clears jeans (one garment per bottomOuter group).
    await setWardrobeSlot(page, 'shorts', 'worn');
    expect(await callSetup(page, 'setup.Wardrobe.worn(setup.WardrobeSlot.SHORTS)')).toBe(true);

    await setWardrobeSlot(page, 'skirt', 'worn');
    expect(await callSetup(page, 'setup.Wardrobe.worn(setup.WardrobeSlot.SKIRT)')).toBe(true);
  });

  test('takeOffSlotZero flips a slot-0 item to "not worn"', async ({ game: page }) => {
    await setWardrobeItem(page, 'tshirt0', 'worn');
    await callSetup(page, "setup.Wardrobe.takeOffSlotZero('tshirt0')");
    expect(await getWardrobeItem(page, 'tshirt0')).toBe('not worn');
  });

  test('state(slot) rolls item states up: worn beats not-worn beats not-bought', async ({ game: page }) => {
    await setWardrobeItem(page, 'tshirt0', 'not worn');
    await setWardrobeItem(page, 'tshirt1', 'worn');
    await setWardrobeItem(page, 'tshirt2', 'not bought');
    await setWardrobeItem(page, 'tshirt3', 'not bought');
    expect(await callSetup(page, "setup.Wardrobe.state('tshirt')")).toBe('worn');

    await setWardrobeItem(page, 'tshirt1', 'not worn');
    expect(await callSetup(page, "setup.Wardrobe.state('tshirt')")).toBe('not worn');

    // Drop every tshirt item to "not bought" so nothing rolls up above it.
    await setWardrobeItem(page, 'tshirt0', 'not bought');
    await setWardrobeItem(page, 'tshirt1', 'not bought');
    expect(await callSetup(page, "setup.Wardrobe.state('tshirt')")).toBe('not bought');
  });

  test('currentBottomDescriptor picks the worn outer bottom', async ({ game: page }) => {
    await setWardrobeSlot(page, 'shorts', 'worn'); // worn shorts; clears jeans/skirt
    const desc = await page.evaluate(() => SugarCube.setup.Wardrobe.currentBottomDescriptor());
    expect(desc).not.toBeNull();
    expect(desc.tip).toBe('Wearing shorts');

    await setWardrobeSlot(page, 'shorts', 'not worn');
    const empty = await page.evaluate(() => SugarCube.setup.Wardrobe.currentBottomDescriptor());
    expect(empty).toBeNull();
  });
});

test.describe('Wardrobe — legacy save fold', () => {
  test('foldLegacyWardrobe upgrades bare remember tokens to slot-0 ids', async ({ game: page }) => {
    // Drop the bundle, plant pre-v7 flat keys, and re-run the on-load fold.
    const out = await page.evaluate(() => {
      const v = SugarCube.State.variables;
      delete v.wardrobe;
      v.rememberTopOuter = 'tshirt';   // very old bare token
      v.rememberBottomOuter = 'jeans'; // very old bare token
      SugarCube.setup.applySaveDefaults(v);
      return {
        top: v.wardrobe.remembered.tshirt,
        bottom: v.wardrobe.remembered.bottomOuter,
        topFlat: v.rememberTopOuter,        // flat key should be gone
        bottomFlat: v.rememberBottomOuter,
      };
    });
    expect(out.top).toBe('tshirt0');
    expect(out.bottom).toBe('jeans0');
    expect(out.topFlat).toBeUndefined();
    expect(out.bottomFlat).toBeUndefined();
  });
});
