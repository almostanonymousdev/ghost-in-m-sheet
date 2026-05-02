const { test, expect } = require('@playwright/test');
const { openGame, resetGame, setVar, getVar, callSetup } = require('../helpers');

test.describe('Wardrobe — equip / unequip / beauty roundtrip', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  async function equipBraSlot(p, slotKey, slotImg, beauty, key) {
    await page.evaluate(({ k, i, b, ke }) => {
      const grp = SugarCube.setup.WARDROBE_GROUPS.find(g => g.name === 'bra');
      const item = grp.items.find(it => it.var === k);
      SugarCube.setup.Wardrobe.equip(grp, item);
    }, { k: slotKey, i: slotImg, b: beauty, ke: key });
  }

  test('equipping a bra adds beauty; unequipping removes it', async () => {
    await setVar(page, 'mc.beauty', 10);
    await setVar(page, 'braState1', 'not worn');
    await page.evaluate(() => {
      const grp = SugarCube.setup.WARDROBE_GROUPS.find(g => g.name === 'bra');
      const item = grp.items.find(i => i.var === 'braState1');
      SugarCube.setup.Wardrobe.equip(grp, item);
    });
    expect(await getVar(page, 'braState1')).toBe('worn');
    expect(await getVar(page, 'mc.beauty')).toBe(12);

    await page.evaluate(() => {
      const grp = SugarCube.setup.WARDROBE_GROUPS.find(g => g.name === 'bra');
      const item = grp.items.find(i => i.var === 'braState1');
      SugarCube.setup.Wardrobe.unequip(grp, item);
    });
    expect(await getVar(page, 'braState1')).toBe('not worn');
    expect(await getVar(page, 'mc.beauty')).toBe(10);
  });

  test('equipping a higher tier swaps off the previous tier', async () => {
    await setVar(page, 'mc.beauty', 10);
    await setVar(page, 'braState1', 'not worn');
    await setVar(page, 'braState2', 'not worn');

    await page.evaluate(() => {
      const grp = SugarCube.setup.WARDROBE_GROUPS.find(g => g.name === 'bra');
      const item = grp.items.find(i => i.var === 'braState1');
      SugarCube.setup.Wardrobe.equip(grp, item);
    });
    expect(await getVar(page, 'mc.beauty')).toBe(12);

    await page.evaluate(() => {
      const grp = SugarCube.setup.WARDROBE_GROUPS.find(g => g.name === 'bra');
      const item = grp.items.find(i => i.var === 'braState2');
      SugarCube.setup.Wardrobe.equip(grp, item);
    });
    // Old bra-1 (+2) gone, bra-2 (+4) on → net +4 from baseline 10
    expect(await getVar(page, 'mc.beauty')).toBe(14);
    expect(await getVar(page, 'braState1')).toBe('not worn');
    expect(await getVar(page, 'braState2')).toBe('worn');
  });
});

test.describe('Wardrobe — steal / restore mechanics', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  async function equip(p, groupName, varName) {
    await p.evaluate(({ g, v }) => {
      const grp = SugarCube.setup.WARDROBE_GROUPS.find(x => x.name === g);
      const item = grp.items.find(i => i.var === v);
      SugarCube.setup.Wardrobe.equip(grp, item);
    }, { g: groupName, v: varName });
  }

  test('stealWornInGroup steals a worn bra and refunds its beauty', async () => {
    await setVar(page, 'mc.beauty', 10);
    await equip(page, 'bra', 'braState1');
    expect(await getVar(page, 'mc.beauty')).toBe(12);
    await setVar(page, 'braState', 'worn');

    const stole = await page.evaluate(() =>
      SugarCube.setup.Wardrobe.stealWornInGroup('bra', 'braState', 'isBraStolen'));
    expect(stole).toBe(true);
    expect(await getVar(page, 'mc.beauty')).toBe(10);
    expect(await getVar(page, 'isBraStolen')).toBe(1);
    expect(await getVar(page, 'braState1')).toBe('not worn');
    expect(await getVar(page, 'rememberTopUnder')).toBe('nobra1');
  });

  test('stealWornInGroup is a no-op when nothing is worn', async () => {
    await setVar(page, 'braState', 'not worn');
    const stole = await page.evaluate(() =>
      SugarCube.setup.Wardrobe.stealWornInGroup('bra', 'braState', 'isBraStolen'));
    expect(stole).toBe(false);
  });

  test('restoreStolenInGroup restores worn flag, beauty, and clears stolen marker', async () => {
    await setVar(page, 'mc.beauty', 10);
    await equip(page, 'bra', 'braState1');
    expect(await getVar(page, 'mc.beauty')).toBe(12);
    await setVar(page, 'braState', 'worn');

    await page.evaluate(() =>
      SugarCube.setup.Wardrobe.stealWornInGroup('bra', 'braState', 'isBraStolen'));
    expect(await getVar(page, 'mc.beauty')).toBe(10);

    const restored = await page.evaluate(() =>
      SugarCube.setup.Wardrobe.restoreStolenInGroup('bra', 'isBraStolen'));
    expect(restored).toBe(true);
    expect(await getVar(page, 'braState1')).toBe('worn');
    expect(await getVar(page, 'mc.beauty')).toBe(12);
    expect(await getVar(page, 'isBraStolen')).toBe(0);
    expect(await getVar(page, 'rememberTopUnder')).toBe('bra1');
  });

  test('stealBottomOuter classifies jeans / shorts / skirt correctly', async () => {
    const cases = [
      { var: 'jeansState1',  expected: 'jeans',  flag: 'isJeansStolen'  },
      { var: 'shortsState1', expected: 'shorts', flag: 'isShortsStolen' },
      { var: 'skirtState1',  expected: 'skirt',  flag: 'isSkirtStolen'  },
    ];
    for (const c of cases) {
      await resetGame(page);
      await setVar(page, 'mc.beauty', 10);
      await equip(page, 'bottomOuter', c.var);

      const result = await page.evaluate(() =>
        SugarCube.setup.Wardrobe.stealBottomOuter());
      expect(result).toBe(c.expected);
      expect(await getVar(page, c.flag)).toBe(1);
      expect(await getVar(page, c.var)).toBe('not worn');
    }
  });

  test('stealBottomOuter returns null when nothing is worn', async () => {
    await setVar(page, 'rememberBottomOuter', null);
    const result = await page.evaluate(() =>
      SugarCube.setup.Wardrobe.stealBottomOuter());
    expect(result).toBeNull();
  });

  test('loseAllStolen marks "not bought" only on stolen-flag groups', async () => {
    await setVar(page, 'mc.beauty', 10);
    await equip(page, 'bra', 'braState1');
    await equip(page, 'panties', 'pantiesState1');
    await page.evaluate(() => {
      SugarCube.State.variables.braState = 'worn';
      SugarCube.State.variables.pantiesState = 'worn';
    });

    await page.evaluate(() =>
      SugarCube.setup.Wardrobe.stealWornInGroup('bra', 'braState', 'isBraStolen'));
    await page.evaluate(() =>
      SugarCube.setup.Wardrobe.stealWornInGroup('panties', 'pantiesState', 'isPantiesStolen'));

    await page.evaluate(() => SugarCube.setup.Wardrobe.loseAllStolen());

    expect(await getVar(page, 'braState1')).toBe('not bought');
    expect(await getVar(page, 'pantiesState1')).toBe('not bought');
    expect(await getVar(page, 'isBraStolen')).toBe(0);
    expect(await getVar(page, 'isPantiesStolen')).toBe(0);
    expect(await getVar(page, 'isClothesStolen')).toBe(0);
  });
});

test.describe('Wardrobe — query helpers', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  test('topShirtWorn / braWorn / pantiesWorn / jeansWorn / shortsWorn / skirtWorn', async () => {
    await setVar(page, 'tshirtState', 'worn');
    expect(await callSetup(page, "setup.Wardrobe.worn(setup.WardrobeSlot.TSHIRT)")).toBe(true);
    await setVar(page, 'tshirtState', 'not worn');
    expect(await callSetup(page, "setup.Wardrobe.worn(setup.WardrobeSlot.TSHIRT)")).toBe(false);

    await setVar(page, 'braState', 'worn');
    expect(await callSetup(page, "setup.Wardrobe.worn(setup.WardrobeSlot.BRA)")).toBe(true);

    await setVar(page, 'pantiesState', 'worn');
    expect(await callSetup(page, "setup.Wardrobe.worn(setup.WardrobeSlot.PANTIES)")).toBe(true);

    await setVar(page, 'jeansState', 'worn');
    expect(await callSetup(page, "setup.Wardrobe.worn(setup.WardrobeSlot.JEANS)")).toBe(true);

    await setVar(page, 'shortsState', 'worn');
    expect(await callSetup(page, "setup.Wardrobe.worn(setup.WardrobeSlot.SHORTS)")).toBe(true);

    await setVar(page, 'skirtState', 'worn');
    expect(await callSetup(page, "setup.Wardrobe.worn(setup.WardrobeSlot.SKIRT)")).toBe(true);
  });

  test('takeOffSlotZero flips slot-0 flag to "not worn"', async () => {
    await setVar(page, 'tshirtState0', 'worn');
    await page.evaluate(() => SugarCube.setup.Wardrobe.takeOffSlotZero('tshirtState0'));
    expect(await getVar(page, 'tshirtState0')).toBe('not worn');
  });

  test('refreshAggregateStates rolls slot states up to legacy aggregates', async () => {
    await setVar(page, 'tshirtState0', 'not worn');
    await setVar(page, 'tshirtState1', 'worn');
    await setVar(page, 'tshirtState2', 'not bought');
    await setVar(page, 'tshirtState3', 'not bought');
    await page.evaluate(() => SugarCube.setup.Wardrobe.refreshAggregateStates());
    expect(await getVar(page, 'tshirtState')).toBe('worn');

    await setVar(page, 'tshirtState1', 'not worn');
    await page.evaluate(() => SugarCube.setup.Wardrobe.refreshAggregateStates());
    expect(await getVar(page, 'tshirtState')).toBe('not worn');
  });

  test('normalizeOuterRememberTokens upgrades legacy values', async () => {
    await setVar(page, 'rememberTopOuter', 'tshirt');
    await setVar(page, 'rememberBottomOuter', 'jeans');
    await page.evaluate(() => SugarCube.setup.Wardrobe.normalizeOuterRememberTokens());
    expect(await getVar(page, 'rememberTopOuter')).toBe('tshirt0');
    expect(await getVar(page, 'rememberBottomOuter')).toBe('jeans0');
  });

  test('currentBottomDescriptor picks the worn outer bottom', async () => {
    await setVar(page, 'jeansState', 'not worn');
    await setVar(page, 'shortsState', 'worn');
    await setVar(page, 'skirtState', 'not worn');
    const desc = await page.evaluate(() => SugarCube.setup.Wardrobe.currentBottomDescriptor());
    expect(desc).not.toBeNull();
    expect(desc.tip).toBe('Wearing shorts');

    await setVar(page, 'shortsState', 'not worn');
    const empty = await page.evaluate(() => SugarCube.setup.Wardrobe.currentBottomDescriptor());
    expect(empty).toBeNull();
  });
});
