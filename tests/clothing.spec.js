const { test, expect } = require('./fixtures');
const {
  goToPassage, getVar, setVar, callSetup, setHuntMode,
  setWardrobeItem, getWardrobeItem, setWardrobeItems,
  setWardrobeRemember, getWardrobeRemember,
  setWardrobeStolen, getWardrobeStolen,
  getWardrobeLost, setWardrobeLost, stripWardrobeBare,
} = require('./helpers');

test.describe('Clothing — Purchase and Beauty', () => {
  test.beforeEach(async ({ game: page }) => {
    await setVar(page, 'hours', 12);
  });

  test('purchasing jeans1 deducts $30 and sets state to "not worn"', async ({ game: page }) => {
    await setVar(page, 'mc.money', 200);
    const startBeauty = await callSetup(page, 'setup.Mc.beauty()');
    await goToPassage(page, 'ClothingSection');
    const buyLink = page.locator('.buyItemLink a').first();

    await buyLink.click();
    await page.waitForFunction(() => SugarCube.State.passage === 'ClothingSection');

    expect(await getVar(page, 'mc.money')).toBe(200 - 30);
    expect(await getWardrobeItem(page, 'jeans1')).toBe('not worn');
    expect(await callSetup(page, 'setup.Mc.beauty()')).toBe(startBeauty);
  });

  test('purchasing tshirt1 deducts $30 and sets state to "not worn"', async ({ game: page }) => {
    await setVar(page, 'mc.money', 500);
    // Buy out every bottom-outer tier so the first buy link is tshirt1.
    await setWardrobeItems(page, {
      jeans1: 'not worn', jeans2: 'not worn', jeans3: 'not worn',
      shorts1: 'not worn', shorts2: 'not worn', shorts3: 'not worn',
      skirt1: 'not worn', skirt2: 'not worn', skirt3: 'not worn',
    });

    await goToPassage(page, 'ClothingSection');
    const buyLink = page.locator('.buyItemLink a').first();

    await buyLink.click();
    await page.waitForFunction(() => SugarCube.State.passage === 'ClothingSection');

    expect(await getVar(page, 'mc.money')).toBe(500 - 30);
    expect(await getWardrobeItem(page, 'tshirt1')).toBe('not worn');
  });

  test('cannot purchase clothing when money is insufficient', async ({ game: page }) => {
    await setVar(page, 'mc.money', 5);
    await goToPassage(page, 'ClothingSection');

    const buyLinks = page.locator('.buyItemLink a');
    await expect(buyLinks).toHaveCount(0);
    expect(await getVar(page, 'mc.money')).toBe(5);
  });

  test('already-purchased clothing does not show buy button', async ({ game: page }) => {
    await setVar(page, 'mc.money', 1000);
    await setWardrobeItem(page, 'jeans1', 'not worn');

    await goToPassage(page, 'ClothingSection');
    const buyLinks = page.locator('.buyItemLink a');
    const count = await buyLinks.count();
    expect(count).toBeLessThan(22);
  });

  test('wearing jeans1 in wardrobe adds +5 beauty', async ({ game: page }) => {
    await setWardrobeItems(page, { jeans1: 'not worn', jeans0: 'not worn' });
    await setWardrobeRemember(page, 'bottomOuter', 'nojeans0');
    const startBeauty = await callSetup(page, 'setup.Mc.beauty()');

    await goToPassage(page, 'Wardrobe');

    const jeans1Link = page.locator('#availableOuterwear a', {
      has: page.locator('img[src*="jeans1"]'),
    });
    await jeans1Link.click();
    await page.waitForFunction(() => SugarCube.State.passage === 'Wardrobe');

    expect(await getWardrobeItem(page, 'jeans1')).toBe('worn');
    expect(await callSetup(page, 'setup.Mc.beauty()')).toBe(startBeauty + 5);
  });

  test('wearing bra1 in wardrobe adds +2 beauty', async ({ game: page }) => {
    await setWardrobeItems(page, { bra1: 'not worn', bra0: 'not worn' });
    await setWardrobeRemember(page, 'bra', 'nobra0');
    const startBeauty = await callSetup(page, 'setup.Mc.beauty()');

    await goToPassage(page, 'Wardrobe');

    const bra1Link = page.locator('#availableClothes a', {
      has: page.locator('img[src*="slip2"]'),
    });
    await bra1Link.click();
    await page.waitForFunction(() => SugarCube.State.passage === 'Wardrobe');

    expect(await getWardrobeItem(page, 'bra1')).toBe('worn');
    expect(await callSetup(page, 'setup.Mc.beauty()')).toBe(startBeauty + 2);
  });

  test('switching from jeans1 (+5) to jeans2 (+8) nets +3 beauty', async ({ game: page }) => {
    await setWardrobeItems(page, { jeans0: 'not worn', jeans1: 'worn', jeans2: 'not worn' });
    await setWardrobeRemember(page, 'bottomOuter', 'jeans1');
    await callSetup(page, `setup.Mc.setBeauty(35)`);

    await goToPassage(page, 'Wardrobe');

    const jeans2Link = page.locator('#availableOuterwear a', {
      has: page.locator('img[src*="jeans2"]'),
    });
    await jeans2Link.click();
    await page.waitForFunction(() => SugarCube.State.passage === 'Wardrobe');

    expect(await getWardrobeItem(page, 'jeans2')).toBe('worn');
    expect(await getWardrobeItem(page, 'jeans1')).toBe('not worn');
    expect(await callSetup(page, 'setup.Mc.beauty()')).toBe(35 + 8 - 5);
  });
});

test.describe('Clothing — Coverage and harassment readout', () => {
  test.beforeEach(async ({ game: page }) => {
    // Naked baseline: every worn item (the slot-0 defaults) flips off so
    // coverage() starts at 0 and tests build an outfit up from nothing.
    await stripWardrobeBare(page);
  });

  test('coverage() is 0 when naked and 100 when fully dressed', async ({ game: page }) => {
    expect(await callSetup(page, 'setup.Wardrobe.coverage()')).toBe(0);
    await setWardrobeItems(page, {
      tshirt0: 'worn', bra0: 'worn', panties0: 'worn', jeans0: 'worn',
    });
    expect(await callSetup(page, 'setup.Wardrobe.coverage()')).toBe(100);
  });

  test('coverage() distinguishes bottoms (jeans > shorts > skirt)', async ({ game: page }) => {
    await setWardrobeItem(page, 'jeans0', 'worn');
    expect(await callSetup(page, 'setup.Wardrobe.coverage()')).toBe(30);
    await setWardrobeItem(page, 'jeans0', 'not worn');
    await setWardrobeItem(page, 'shorts1', 'worn');
    expect(await callSetup(page, 'setup.Wardrobe.coverage()')).toBe(20);
    await setWardrobeItem(page, 'shorts1', 'not worn');
    await setWardrobeItem(page, 'skirt1', 'worn');
    expect(await callSetup(page, 'setup.Wardrobe.coverage()')).toBe(10);
  });

  test('harassmentLevel() maps coverage to High / Medium / Low', async ({ game: page }) => {
    expect(await callSetup(page, 'setup.Wardrobe.harassmentLevel()')).toBe('High');
    await setWardrobeItems(page, { tshirt0: 'worn', jeans0: 'worn' });
    // coverage = 60 → Medium
    expect(await callSetup(page, 'setup.Wardrobe.harassmentLevel()')).toBe('Medium');
    await setWardrobeItems(page, { bra0: 'worn', panties0: 'worn' });
    // coverage = 100 → Low
    expect(await callSetup(page, 'setup.Wardrobe.harassmentLevel()')).toBe('Low');
  });

  /* Aggregate worn-state is computed from the items now (no per-tier
     flag + roll-up step), so the Wardrobe readout can never lag a click
     behind. This still guards the render path: an unequip must show up
     on the next render. */
  test('readout reflects the current worn state after an unequip', async ({ game: page }) => {
    // Fully dressed in tier-1 garments (slot 0 cleared as their sibling).
    await setWardrobeItems(page, {
      tshirt0: 'not worn', tshirt1: 'worn',
      jeans0: 'not worn', jeans1: 'worn',
      bra0: 'not worn', bra1: 'worn',
      panties0: 'not worn', panties1: 'worn',
    });
    await goToPassage(page, 'Wardrobe');
    await expect(page.locator('#huntHarassmentReadout .huntHarassment-Low')).toContainText('Low');

    // Take jeans + tshirt back off through the controller; coverage drops
    // to 40 (bra + panties) → Medium. State is computed, so the next
    // render reflects it with no roll-up.
    await page.evaluate(() => {
      const W = SugarCube.setup.Wardrobe;
      W.unequip(W.groupForSlot('jeans'), W.itemById('jeans1'));
      W.unequip(W.groupForSlot('tshirt'), W.itemById('tshirt1'));
    });
    // Bounce via Bedroom so Engine.play actually re-renders Wardrobe.
    await goToPassage(page, 'Bedroom');
    await goToPassage(page, 'Wardrobe');
    await expect(page.locator('#huntHarassmentReadout .huntHarassment-Medium')).toContainText('Medium');
  });

  test('Wardrobe passage renders the harassment readout', async ({ game: page }) => {
    await setWardrobeItems(page, {
      tshirt0: 'worn', jeans0: 'worn', bra0: 'worn', panties0: 'worn',
    });
    await goToPassage(page, 'Wardrobe');
    const readout = page.locator('#huntHarassmentReadout');
    await expect(readout).toContainText('Estimated hunt harassment');
    await expect(readout.locator('.huntHarassment-Low')).toContainText('Low');
  });
});

test.describe('Clothing — Lost-clothing buyback', () => {
  test.beforeEach(async ({ game: page }) => {
    await setVar(page, 'hours', 12);
  });

  test('loseAllStolen records discarded tier item onto $wardrobe.lost', async ({ game: page }) => {
    // arrange — wear and have a tier-2 tshirt stolen
    await setWardrobeItems(page, {
      tshirt0: 'not worn', tshirt1: 'not worn', tshirt2: 'worn',
    });
    await setWardrobeRemember(page, 'tshirt', 'tshirt2');

    await callSetup(page, 'setup.Wardrobe.stealGarment("shirt")');
    await callSetup(page, 'setup.Wardrobe.loseAllStolen()');

    expect(await getWardrobeItem(page, 'tshirt2')).toBe('not bought');
    expect(await getWardrobeLost(page)).toEqual(['tshirt2']);
    expect(await callSetup(page, 'setup.Wardrobe.hasLostClothing()')).toBe(true);
  });

  test('replaceLostClothing deducts store price and restores not-worn state', async ({ game: page }) => {
    await setVar(page, 'mc.money', 100);
    await setWardrobeItem(page, 'tshirt2', 'not bought');
    await setWardrobeLost(page, ['tshirt2']);

    const ok = await callSetup(page, 'setup.Wardrobe.replaceLostClothing("tshirt2")');

    expect(ok).toBe(true);
    expect(await getVar(page, 'mc.money')).toBe(100 - 40);
    expect(await getWardrobeItem(page, 'tshirt2')).toBe('not worn');
    expect(await getWardrobeLost(page)).toEqual([]);
  });

  test('replaceLostClothing fails when MC cannot afford it', async ({ game: page }) => {
    await setVar(page, 'mc.money', 5);
    await setWardrobeItem(page, 'tshirt2', 'not bought');
    await setWardrobeLost(page, ['tshirt2']);

    const ok = await callSetup(page, 'setup.Wardrobe.replaceLostClothing("tshirt2")');

    expect(ok).toBe(false);
    expect(await getVar(page, 'mc.money')).toBe(5);
    expect(await getWardrobeItem(page, 'tshirt2')).toBe('not bought');
    expect(await getWardrobeLost(page)).toEqual(['tshirt2']);
  });

  test('replaceLostClothing no-ops on items not in the lost list', async ({ game: page }) => {
    await setVar(page, 'mc.money', 1000);
    await setWardrobeLost(page, []);

    const ok = await callSetup(page, 'setup.Wardrobe.replaceLostClothing("tshirt2")');

    expect(ok).toBe(false);
    expect(await getVar(page, 'mc.money')).toBe(1000);
  });

  test('Bedroom hides Replace lost clothing button when nothing is lost', async ({ game: page }) => {
    await setWardrobeLost(page, []);
    await goToPassage(page, 'Bedroom');

    const link = page.locator('a', { hasText: 'Replace lost clothing' });
    await expect(link).toHaveCount(0);
  });

  test('Bedroom shows Replace lost clothing button when items are lost', async ({ game: page }) => {
    await setWardrobeLost(page, ['tshirt2']);
    await setWardrobeItem(page, 'tshirt2', 'not bought');
    await goToPassage(page, 'Bedroom');

    const link = page.locator('a', { hasText: 'Replace lost clothing' });
    await expect(link).toHaveCount(1);
  });

  test('ReplaceLostClothing passage buy link replaces the item end-to-end', async ({ game: page }) => {
    await setVar(page, 'mc.money', 200);
    await setWardrobeItem(page, 'tshirt2', 'not bought');
    await setWardrobeLost(page, ['tshirt2']);

    await goToPassage(page, 'ReplaceLostClothing');
    const buyLink = page.locator('.buyItemLink a').first();
    await buyLink.click();
    await page.waitForFunction(() => SugarCube.State.passage === 'ReplaceLostClothing');

    expect(await getVar(page, 'mc.money')).toBe(200 - 40);
    expect(await getWardrobeItem(page, 'tshirt2')).toBe('not worn');
    expect(await getWardrobeLost(page)).toEqual([]);
  });

  test('legacy fold back-fills lost clothing for a pre-tracking save', async ({ game: page }) => {
    // Simulate a flat-key save (no $wardrobe yet) that lost a tier-2
    // tshirt before lost-tracking shipped: tier-2 in NOT_BOUGHT, the
    // rememberVar still pointing at "notshirt2", $lostClothing empty.
    // applySaveDefaults' foldLegacyWardrobe folds the flat keys into the
    // bundle and back-fills the lost list.
    await page.evaluate(() => {
      const v = SugarCube.State.variables;
      delete v.wardrobe;
      v.tshirtState0 = 'worn';
      v.tshirtState2 = 'not bought';
      v.rememberTopOuter = 'notshirt2';
      v.lostClothing = [];
      SugarCube.setup.applySaveDefaults(v);
    });

    expect(await getWardrobeItem(page, 'tshirt2')).toBe('not bought');
    expect(await getWardrobeLost(page)).toEqual(['tshirt2']);
    expect(await callSetup(page, 'setup.Wardrobe.hasLostClothing()')).toBe(true);
  });

  test('legacy fold leaves never-bought items off the lost list', async ({ game: page }) => {
    // Fresh save: tier-2 tshirt NOT_BOUGHT but rememberVar points at the
    // slot-0 default. No loss happened — no entry should appear.
    await page.evaluate(() => {
      const v = SugarCube.State.variables;
      delete v.wardrobe;
      v.tshirtState0 = 'worn';
      v.tshirtState2 = 'not bought';
      v.rememberTopOuter = 'tshirt0';
      v.lostClothing = [];
      SugarCube.setup.applySaveDefaults(v);
    });

    expect(await getWardrobeLost(page)).toEqual([]);
  });

  test('legacy fold is idempotent across repeated applySaveDefaults runs', async ({ game: page }) => {
    await page.evaluate(() => {
      const v = SugarCube.State.variables;
      delete v.wardrobe;
      v.tshirtState0 = 'worn';
      v.tshirtState2 = 'not bought';
      v.rememberTopOuter = 'notshirt2';
      v.lostClothing = [];
      SugarCube.setup.applySaveDefaults(v);
      SugarCube.setup.applySaveDefaults(v);
      SugarCube.setup.applySaveDefaults(v);
    });

    expect(await getWardrobeLost(page)).toEqual(['tshirt2']);
  });

  test('WARDROBE_GROUPS prices match ClothingSection.tw store prices', async ({ game: page }) => {
    // Pulled from passages/mall/ClothingSection.tw -- the buyback button
    // uses the price field on each WARDROBE_GROUPS item, so the two
    // tables must agree. Slot-0 items have no store price.
    const expected = {
      jeans1: 30, jeans2: 40, jeans3: 50,
      shorts1: 35, shorts2: 45, shorts3: 55,
      skirt1: 40, skirt2: 50, skirt3: 60,
      tshirt1: 30, tshirt2: 40, tshirt3: 50,
      bra1: 20, bra2: 30, bra3: 40,
      panties1: 25, panties2: 35, panties3: 45,
      stockings1: 30, stockings2: 60, stockings3: 120,
      neckChoker1: 100,
    };

    const prices = await page.evaluate(() => {
      const out = {};
      for (const grp of SugarCube.setup.WARDROBE_GROUPS) {
        for (const item of grp.items) {
          if (item.slot !== 0) out[item.id] = item.price;
        }
      }
      return out;
    });

    expect(prices).toEqual(expected);
  });
});

test.describe('Clothing — Hunt-mode quick undress/redress', () => {
  test.beforeEach(async ({ game: page }) => {
    await setVar(page, 'hours', 12);
  });

  test('groupForSlot returns the right group for each slot alias', async ({ game: page }) => {
    const map = await page.evaluate(() => {
      const W = SugarCube.setup.Wardrobe;
      return {
        tshirt: W.groupForSlot('tshirt').name,
        bra: W.groupForSlot('bra').name,
        panties: W.groupForSlot('panties').name,
        jeans: W.groupForSlot('jeans').name,
        shorts: W.groupForSlot('shorts').name,
        skirt: W.groupForSlot('skirt').name,
        bottom: W.groupForSlot('bottomOuter').name,
        bogus: W.groupForSlot('nope'),
      };
    });
    expect(map).toEqual({
      tshirt: 'tshirt', bra: 'bra', panties: 'panties',
      jeans: 'bottomOuter', shorts: 'bottomOuter', skirt: 'bottomOuter',
      bottom: 'bottomOuter', bogus: null,
    });
  });

  test('quickUndress(tshirt) on a worn tier-1 t-shirt unequips it and refunds beauty', async ({ game: page }) => {
    await setWardrobeItems(page, { tshirt0: 'not worn', tshirt1: 'worn' });
    await setWardrobeRemember(page, 'tshirt', 'tshirt1');
    await callSetup(page, `setup.Mc.setBeauty(30)`);

    const ok = await callSetup(page, 'setup.Wardrobe.quickUndress("tshirt")');

    expect(ok).toBe(true);
    expect(await getWardrobeItem(page, 'tshirt1')).toBe('not worn');
    expect(await getWardrobeRemember(page, 'tshirt')).toBe('notshirt1');
    expect(await callSetup(page, 'setup.Mc.beauty()')).toBe(30 - 5);
  });

  test('quickUndress no-ops when the slot already has nothing on', async ({ game: page }) => {
    await setWardrobeItems(page, { bra0: 'not worn', bra1: 'not worn' });
    const startBeauty = await callSetup(page, 'setup.Mc.beauty()');

    const ok = await callSetup(page, 'setup.Wardrobe.quickUndress("bra")');

    expect(ok).toBe(false);
    expect(await callSetup(page, 'setup.Mc.beauty()')).toBe(startBeauty);
  });

  test('quickRedress restores the previously worn item and re-applies its beauty', async ({ game: page }) => {
    await setWardrobeItems(page, { panties0: 'not worn', panties2: 'not worn' });
    await setWardrobeRemember(page, 'panties', 'nopanties2');
    await callSetup(page, `setup.Mc.setBeauty(20)`);

    const ok = await callSetup(page, 'setup.Wardrobe.quickRedress("panties")');

    expect(ok).toBe(true);
    expect(await getWardrobeItem(page, 'panties2')).toBe('worn');
    expect(await getWardrobeRemember(page, 'panties')).toBe('panties2');
    expect(await callSetup(page, 'setup.Mc.beauty()')).toBe(20 + 4);
  });

  test('quickRedress refuses to put back a now-NOT_BOUGHT (stolen) item', async ({ game: page }) => {
    await setWardrobeItems(page, { tshirt0: 'not worn', tshirt2: 'not bought' });
    await setWardrobeRemember(page, 'tshirt', 'notshirt2');

    const can = await callSetup(page, 'setup.Wardrobe.canQuickRedress("tshirt")');
    const ok = await callSetup(page, 'setup.Wardrobe.quickRedress("tshirt")');

    expect(can).toBe(false);
    expect(ok).toBe(false);
    expect(await getWardrobeItem(page, 'tshirt2')).toBe('not bought');
  });

  test('quickRedress refuses to put back an in-hunt stolen item even though the tier is still purchased', async ({ game: page }) => {
    /* In-hunt steal: stealGarment flips tshirt1 to NOT_WORN (still
     * purchased — it's not gone for good yet) and stamps stolen.shirt.
     * Recovery has to happen via FindStolenClothes; the HUD shortcut
     * must refuse. */
    await setWardrobeItems(page, { tshirt0: 'not worn', tshirt1: 'not worn' });
    await setWardrobeRemember(page, 'tshirt', 'notshirt1');
    await setWardrobeStolen(page, 'shirt', true);

    const can = await callSetup(page, 'setup.Wardrobe.canQuickRedress("tshirt")');
    const ok = await callSetup(page, 'setup.Wardrobe.quickRedress("tshirt")');

    expect(can).toBe(false);
    expect(ok).toBe(false);
    expect(await getWardrobeItem(page, 'tshirt1')).toBe('not worn');
    expect(await getWardrobeStolen(page, 'shirt')).toBe(true);
  });

  test('quickRedress refuses bottomOuter when the in-hunt bottom-stolen flag is set', async ({ game: page }) => {
    await setWardrobeItems(page, { jeans0: 'not worn', jeans1: 'not worn' });
    await setWardrobeRemember(page, 'bottomOuter', 'nojeans1');
    await setWardrobeStolen(page, 'bottom', true);

    expect(await callSetup(page, 'setup.Wardrobe.canQuickRedress("jeans")')).toBe(false);
    expect(await callSetup(page, 'setup.Wardrobe.canQuickRedress("bottomOuter")')).toBe(false);
    expect(await callSetup(page, 'setup.Wardrobe.quickRedress("bottomOuter")')).toBe(false);
    expect(await getWardrobeItem(page, 'jeans1')).toBe('not worn');
  });

  test('isSlotStolen maps each slot to the right stolen flag', async ({ game: page }) => {
    await setWardrobeStolen(page, 'shirt', true);
    await setWardrobeStolen(page, 'bra', false);
    await setWardrobeStolen(page, 'panties', true);
    await setWardrobeStolen(page, 'bottom', true);

    const map = await page.evaluate(() => {
      const W = SugarCube.setup.Wardrobe;
      return {
        tshirt: W.isSlotStolen('tshirt'),
        bra: W.isSlotStolen('bra'),
        panties: W.isSlotStolen('panties'),
        jeans: W.isSlotStolen('jeans'),
        shorts: W.isSlotStolen('shorts'),
        skirt: W.isSlotStolen('skirt'),
        bottomOuter: W.isSlotStolen('bottomOuter'),
        bogus: W.isSlotStolen('nope'),
      };
    });
    expect(map).toEqual({
      tshirt: true, bra: false, panties: true,
      jeans: true, shorts: true, skirt: true, bottomOuter: true,
      bogus: false,
    });
  });

  test('canQuickRedress is false when nothing is remembered', async ({ game: page }) => {
    // rememberVar still holds the worn id (no "no" prefix) — nothing to restore.
    await setWardrobeRemember(page, 'bra', 'bra0');
    const can = await callSetup(page, 'setup.Wardrobe.canQuickRedress("bra")');
    expect(can).toBe(false);
  });

  test('undress + redress on bottomOuter (jeans) round-trips', async ({ game: page }) => {
    await setWardrobeItems(page, { jeans0: 'not worn', jeans1: 'worn' });
    await setWardrobeRemember(page, 'bottomOuter', 'jeans1');
    await callSetup(page, `setup.Mc.setBeauty(35)`);

    expect(await callSetup(page, 'setup.Wardrobe.quickUndress("jeans")')).toBe(true);
    expect(await getWardrobeItem(page, 'jeans1')).toBe('not worn');
    expect(await getWardrobeRemember(page, 'bottomOuter')).toBe('nojeans1');
    expect(await callSetup(page, 'setup.Mc.beauty()')).toBe(35 - 5);

    expect(await callSetup(page, 'setup.Wardrobe.canQuickRedress("jeans")')).toBe(true);
    expect(await callSetup(page, 'setup.Wardrobe.quickRedress("jeans")')).toBe(true);
    expect(await getWardrobeItem(page, 'jeans1')).toBe('worn');
    expect(await getWardrobeRemember(page, 'bottomOuter')).toBe('jeans1');
    expect(await callSetup(page, 'setup.Mc.beauty()')).toBe(35);
  });

  test('currentBottomSlotName reports the worn outer-bottom or null', async ({ game: page }) => {
    await setWardrobeItems(page, { jeans0: 'not worn', shorts1: 'worn' });
    expect(await callSetup(page, 'setup.Wardrobe.currentBottomSlotName()')).toBe('shorts');

    await setWardrobeItem(page, 'shorts1', 'not worn');
    expect(await callSetup(page, 'setup.Wardrobe.currentBottomSlotName()')).toBe(null);
  });

  test('redressAfterHunt re-equips slots the MC voluntarily took off', async ({ game: page }) => {
    /* MC took her tier-1 jeans and tier-2 bra off mid-hunt and never
     * put them back on. End-of-hunt cleanup should restore them. */
    await setWardrobeItems(page, { jeans0: 'not worn', jeans1: 'not worn' });
    await setWardrobeRemember(page, 'bottomOuter', 'nojeans1');
    await setWardrobeStolen(page, 'bottom', false);

    await setWardrobeItems(page, { bra0: 'not worn', bra2: 'not worn' });
    await setWardrobeRemember(page, 'bra', 'nobra2');
    await setWardrobeStolen(page, 'bra', false);

    const restored = await callSetup(page, 'setup.Wardrobe.redressAfterHunt()');
    expect(restored.sort()).toEqual(['bottomOuter', 'bra']);
    expect(await getWardrobeItem(page, 'jeans1')).toBe('worn');
    expect(await callSetup(page, "setup.Wardrobe.state('jeans')")).toBe('worn');
    expect(await getWardrobeItem(page, 'bra2')).toBe('worn');
    expect(await callSetup(page, "setup.Wardrobe.state('bra')")).toBe('worn');
  });

  test('redressAfterHunt skips slots flagged as stolen', async ({ game: page }) => {
    /* The ghost stole the tier-1 tshirt during the hunt
     * (stolen.shirt=true) — auto-redress must not put it back on, the
     * recovery has to go through FindStolenClothes / loseAllStolen. */
    await setWardrobeItems(page, { tshirt0: 'not worn', tshirt1: 'not worn' });
    await setWardrobeRemember(page, 'tshirt', 'notshirt1');
    await setWardrobeStolen(page, 'shirt', true);

    const restored = await callSetup(page, 'setup.Wardrobe.redressAfterHunt()');
    expect(restored).toEqual([]);
    expect(await getWardrobeItem(page, 'tshirt1')).toBe('not worn');
    expect(await getWardrobeStolen(page, 'shirt')).toBe(true);
  });

  test('redressAfterHunt skips slots whose item is now NOT_BOUGHT (lost)', async ({ game: page }) => {
    /* loseAllStolen runs first in cleanupAfterHuntFinalized and flips a
     * stolen tier to NOT_BOUGHT. Even after the stolen flag is cleared,
     * the NOT_BOUGHT filter in _rememberedItem keeps redress from putting
     * a no-longer-owned garment back on. */
    await setWardrobeItems(page, { panties0: 'not worn', panties2: 'not bought' });
    await setWardrobeRemember(page, 'panties', 'nopanties2');
    await setWardrobeStolen(page, 'panties', false);

    const restored = await callSetup(page, 'setup.Wardrobe.redressAfterHunt()');
    expect(restored).toEqual([]);
    expect(await getWardrobeItem(page, 'panties2')).toBe('not bought');
  });

  test('redressAfterHunt is a no-op when nothing was undressed', async ({ game: page }) => {
    await setWardrobeItem(page, 'tshirt0', 'worn');
    await setWardrobeRemember(page, 'tshirt', 'tshirt0');

    const restored = await callSetup(page, 'setup.Wardrobe.redressAfterHunt()');
    expect(restored).toEqual([]);
    expect(await getWardrobeItem(page, 'tshirt0')).toBe('worn');
  });

  test('cleanupAfterHuntFinalized redresses voluntary removals and skips ghost-stolen ones', async ({ game: page }) => {
    /* Mixed end-of-hunt state: MC took off her own jeans, ghost
     * stole her tier-1 tshirt. After cleanupAfterHuntFinalized({loseStolen:true}):
     * - jeans back on (voluntary removal),
     * - tshirt permanently lost (NOT_BOUGHT, on $wardrobe.lost). */
    await setWardrobeItems(page, { jeans0: 'not worn', jeans1: 'not worn' });
    await setWardrobeRemember(page, 'bottomOuter', 'nojeans1');
    await setWardrobeStolen(page, 'bottom', false);

    await setWardrobeItems(page, { tshirt0: 'not worn', tshirt1: 'not worn' });
    await setWardrobeRemember(page, 'tshirt', 'notshirt1');
    await setWardrobeStolen(page, 'shirt', true);
    await setWardrobeLost(page, []);

    await callSetup(page, 'setup.HuntController.cleanupAfterHuntFinalized({ loseStolen: true })');

    expect(await getWardrobeItem(page, 'jeans1')).toBe('worn');
    expect(await getWardrobeItem(page, 'tshirt1')).toBe('not bought');
    expect(await getWardrobeLost(page)).toEqual(['tshirt1']);
  });
});

test.describe('MC HUD — Hunt-mode click handlers', () => {
  /* Pin to pre-dawn so PassageDone's isMorningPlus + isHunting branch
   * doesn't auto-redirect Bedroom to HuntOverTime and tear down the
   * hunt mid-test. */
  test.beforeEach(async ({ game: page }) => {
    await setVar(page, 'hours', 2);
  });

  /* HuntController.isHuntActive() requires both an active hunt and
   * the current passage to be HuntRun, so the in-hunt HUD branch fires.
   * `house` is one of 'owaissa' (default) / 'elm' / 'ironclad'. */
  async function startActiveHunt(page, house = 'owaissa') {
    await page.evaluate((staticHouseId) => {
      SugarCube.setup.HuntController.startHunt({ seed: 1, staticHouseId });
    }, house);
    await goToPassage(page, 'HuntRun');
  }

  /* The MC clothing strip lives in StoryCaption (sidebar). To verify
   * a specific state actually drives the right output we render the
   * widget body directly via a wikified copy — that sidesteps the
   * parallel-worker race where the sidebar HTML snapshotted into the
   * DOM lags behind the just-set state. */
  async function renderStrip(page) {
    return page.evaluate(() => {
      const $div = jQuery('<div></div>');
      $div.wiki('<<mcStatusBody>>');
      return $div.html();
    });
  }

  test('outside a hunt the t-shirt icon has no click handler', async ({ game: page }) => {
    await setHuntMode(page, 0);
    await setWardrobeItem(page, 'tshirt0', 'worn');

    const html = await renderStrip(page);
    expect(html).toContain('id="statusOuterTop"');
    expect(html).not.toContain('take it off');
  });

  test('during a hunt the t-shirt slot becomes a take-off link', async ({ game: page }) => {
    await setWardrobeItems(page, { tshirt0: 'not worn', tshirt1: 'worn' });
    await setWardrobeRemember(page, 'tshirt', 'tshirt1');
    await startActiveHunt(page);

    const html = await renderStrip(page);
    expect(html).toContain('take it off');
    expect(html).toMatch(/id="statusOuterTop"[\s\S]*?<a /);
  });

  test('during a hunt with a remembered item the empty bra slot becomes a put-back-on link', async ({ game: page }) => {
    await setWardrobeItems(page, { bra0: 'not worn', bra2: 'not worn' });
    await setWardrobeRemember(page, 'bra', 'nobra2');
    await startActiveHunt(page);

    const html = await renderStrip(page);
    expect(html).toContain('put it back on');
    expect(html).toMatch(/id="statusUnderTop"[\s\S]*?<a /);
  });

  test('during a hunt with no remembered item the empty bra slot stays a plain image', async ({ game: page }) => {
    await setWardrobeItem(page, 'bra0', 'not worn');
    await setWardrobeRemember(page, 'bra', 'bra0');
    await startActiveHunt(page);

    const html = await renderStrip(page);
    expect(html).toContain('id="statusUnderTop"');
    expect(html).not.toContain('put it back on');
  });

  test('a stolen tier-1 t-shirt renders with no redress link in the HUD', async ({ game: page }) => {
    /* Even though the tier is still purchased and the rememberVar
     * still points at "notshirt1", the in-hunt steal flag must
     * suppress the put-back-on shortcut. */
    await setWardrobeItems(page, { tshirt0: 'not worn', tshirt1: 'not worn' });
    await setWardrobeRemember(page, 'tshirt', 'notshirt1');
    await setWardrobeStolen(page, 'shirt', true);
    await startActiveHunt(page);

    const html = await renderStrip(page);
    /* Pull just the tshirt slot out of the strip so anchors in
     * other slots can't mask a regression. */
    const slot = html.match(/id="statusOuterTop"[\s\S]*?<\/div>/)[0];
    expect(slot).toContain('empty.jpg');
    expect(slot).not.toContain('<a ');
    expect(slot).not.toContain('put it back on');
  });

  test('Ironclad warden costume mode shows no clothing slots', async ({ game: page }) => {
    await setVar(page, 'wardenClothesStage', 2);
    await startActiveHunt(page, 'ironclad');

    const html = await renderStrip(page);
    expect(html).not.toContain('id="statusOuterTop"');
    expect(html).not.toContain('id="statusUnderTop"');
    expect(html).toContain('warden1.png');
  });

  /* End-to-end: navigate, click the live link in the sidebar, and
   * verify both the wardrobe state AND the re-rendered strip flip.
   * Uses jQuery.trigger('click') to drive the SugarCube link
   * handler (Playwright's click doesn't bubble cleanly through the
   * <img> child + force-click trips the visibility check because
   * test mode aborts the icon image request). */
  test('clicking the worn t-shirt icon in the sidebar takes it off and re-renders', async ({ game: page }) => {
    await setWardrobeItems(page, { tshirt0: 'not worn', tshirt1: 'worn' });
    await setWardrobeRemember(page, 'tshirt', 'tshirt1');
    await callSetup(page, `setup.Mc.setBeauty(30)`);
    await startActiveHunt(page);

    await page.evaluate(() => jQuery('#statusOuterTop a').trigger('click'));

    expect(await getWardrobeItem(page, 'tshirt1')).toBe('not worn');
    /* The computed slot state must read "not worn" too — otherwise the
       next click finds the slot still worn and quickUndress no-ops. */
    expect(await callSetup(page, "setup.Wardrobe.state('tshirt')")).toBe('not worn');
    expect(await getWardrobeRemember(page, 'tshirt')).toBe('notshirt1');
    /* Beauty is frozen for the duration of the hunt, so the displayed
       value stays pinned at the pre-hunt snapshot. The underlying
       modifier still moves (-5) so the live value resurfaces after
       the hunt ends. */
    expect(await callSetup(page, 'setup.Mc.beauty()')).toBe(30);
    expect(await getVar(page, 'mc.beautyModifier')).toBe(-5);

    const html = await page.locator('#statusOuterTop').innerHTML();
    expect(html).toMatch(/img src="[^"]+\/empty\.jpg"/);
    expect(html).toContain('put it back on');
  });

  test('clicking the empty t-shirt icon puts the remembered tier back on', async ({ game: page }) => {
    await setWardrobeItems(page, { tshirt0: 'not worn', tshirt1: 'not worn' });
    await setWardrobeRemember(page, 'tshirt', 'notshirt1');
    await callSetup(page, `setup.Mc.setBeauty(25)`);
    await startActiveHunt(page);

    await page.evaluate(() => jQuery('#statusOuterTop a').trigger('click'));

    expect(await getWardrobeItem(page, 'tshirt1')).toBe('worn');
    expect(await callSetup(page, "setup.Wardrobe.state('tshirt')")).toBe('worn');
    expect(await getWardrobeRemember(page, 'tshirt')).toBe('tshirt1');
    /* Frozen during the hunt — displayed value stays at the snapshot;
       modifier moved (+5) and will surface after the hunt ends. */
    expect(await callSetup(page, 'setup.Mc.beauty()')).toBe(25);
    expect(await getVar(page, 'mc.beautyModifier')).toBe(0);

    const html = await page.locator('#statusOuterTop').innerHTML();
    expect(html).toMatch(/img src="[^"]+\/top\.jpg"/);
    expect(html).toContain('take it off');
  });

  test('toggle round-trip: take off → put back on lands on the original state', async ({ game: page }) => {
    await setWardrobeItems(page, { tshirt0: 'not worn', tshirt1: 'worn' });
    await setWardrobeRemember(page, 'tshirt', 'tshirt1');
    await callSetup(page, `setup.Mc.setBeauty(30)`);
    await startActiveHunt(page);

    // First click: take off
    await page.evaluate(() => jQuery('#statusOuterTop a').trigger('click'));
    expect(await getWardrobeItem(page, 'tshirt1')).toBe('not worn');
    /* Frozen at the pre-hunt snapshot; underlying modifier tracks
       the take-off delta so the live value will resurface post-hunt. */
    expect(await callSetup(page, 'setup.Mc.beauty()')).toBe(30);
    expect(await getVar(page, 'mc.beautyModifier')).toBe(-5);

    // Second click on the now-empty slot: put back on
    await page.evaluate(() => jQuery('#statusOuterTop a').trigger('click'));
    expect(await getWardrobeItem(page, 'tshirt1')).toBe('worn');
    expect(await callSetup(page, "setup.Wardrobe.state('tshirt')")).toBe('worn');
    expect(await getWardrobeRemember(page, 'tshirt')).toBe('tshirt1');
    expect(await callSetup(page, 'setup.Mc.beauty()')).toBe(30);
    expect(await getVar(page, 'mc.beautyModifier')).toBe(0);
  });

  /* The HUD shortcut gates on HuntController.isHuntActive() so it
     fires whenever a hunt is in flight on the HuntRun passage.
     Without this, the click-to-undress feature would silently no-op
     during a hunt. */
  test('active hunt: t-shirt slot becomes a take-off link on the HuntRun passage', async ({ game: page }) => {
    await setHuntMode(page, 0);
    await setWardrobeItems(page, { tshirt0: 'not worn', tshirt1: 'worn' });
    await setWardrobeRemember(page, 'tshirt', 'tshirt1');
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1 }));
    await page.evaluate(() => SugarCube.Engine.play('HuntRun'));
    await page.waitForFunction(() => SugarCube.State.passage === 'HuntRun');

    const html = await page.evaluate(() => {
      const $div = jQuery('<div></div>');
      $div.wiki('<<mcStatusBody>>');
      return $div.html();
    });
    expect(html).toContain('take it off');
    expect(html).toMatch(/id="statusOuterTop"[\s\S]*?<a /);
  });

  /* End-to-end coverage for the live sidebar HUD across every slot,
     including slot-0 defaults. Earlier specs cover tshirt and bra
     in detail; this loop catches per-slot regressions in the click
     handler / re-render path without duplicating beauty-modifier
     assertions for each one. */
  for (const slot of [
    { wornDiv: 'statusOuterTop',    name: 'tshirt'  },
    { wornDiv: 'statusOuterBottom', name: 'jeans'   },
    { wornDiv: 'statusUnderTop',    name: 'bra'     },
    { wornDiv: 'statusUnderBottom', name: 'panties' },
  ]) {
    test(`fresh-game default outfit: ${slot.wornDiv} click toggles undress / redress`, async ({ game: page }) => {
      /* Drive the actual sidebar -- not a wikified copy -- so a
         regression in StoryCaption's #statusContainer / mcStatusBody
         pipeline surfaces here. */
      await startActiveHunt(page);

      expect(await callSetup(page, `setup.Wardrobe.state('${slot.name}')`)).toBe('worn');

      await page.evaluate((sel) => jQuery('#statusContainer #' + sel + ' a').trigger('click'), slot.wornDiv);
      expect(await callSetup(page, `setup.Wardrobe.state('${slot.name}')`)).toBe('not worn');

      /* The slot's <a> must still be there (now the redress link)
         and clicking it must put the clothes back on. */
      const redressLinks = await page.evaluate(
        (sel) => jQuery('#statusContainer #' + sel + ' a').length,
        slot.wornDiv
      );
      expect(redressLinks, `${slot.wornDiv} lost its click target after undress`).toBe(1);

      await page.evaluate((sel) => jQuery('#statusContainer #' + sel + ' a').trigger('click'), slot.wornDiv);
      expect(await callSetup(page, `setup.Wardrobe.state('${slot.name}')`), `${slot.wornDiv} did not redress on second click`).toBe('worn');
    });
  }

  /* The Wardrobe screen's slot-0 take-off route (takeOffSlotZero)
     must leave the same "no<id>" remember marker that quickUndress
     does -- otherwise the HUD on a later hunt sees an empty slot
     with no remembered last-worn item and silently refuses to put
     the default outfit back on. Failing this means the player can
     take their default clothes off in the bedroom, walk into a
     hunt, and find the side-panel redress button missing. */
  test('takeOffSlotZero stamps the remember token so a later hunt-HUD redress works', async ({ game: page }) => {
    for (const [id, grp, marker] of [
      ['tshirt0',  'tshirt',      'notshirt0'],
      ['jeans0',   'bottomOuter', 'nojeans0'],
      ['bra0',     'bra',         'nobra0'],
      ['panties0', 'panties',     'nopanties0'],
    ]) {
      await callSetup(page, `setup.Wardrobe.takeOffSlotZero("${id}")`);
      expect(await getWardrobeItem(page, id)).toBe('not worn');
      expect(await getWardrobeRemember(page, grp)).toBe(marker);
    }

    /* Cross-scenario regression: undress via the Wardrobe screen,
       then start a hunt -- the HUD must offer a redress link for
       each slot. */
    await startActiveHunt(page);
    const html = await renderStrip(page);
    for (const id of ['statusOuterTop', 'statusOuterBottom', 'statusUnderTop', 'statusUnderBottom']) {
      const section = html.match(new RegExp(`id="${id}"[\\s\\S]*?</div>`));
      expect(section, `slot ${id} not rendered`).toBeTruthy();
      expect(section[0], `slot ${id} has no redress link after wardrobe undress`).toContain('<a ');
      expect(section[0], `slot ${id} redress tip missing after wardrobe undress`).toContain('put it back on');
    }
  });
});
