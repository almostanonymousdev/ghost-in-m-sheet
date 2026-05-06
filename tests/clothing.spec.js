const { test, expect } = require('./fixtures');
const { goToPassage, getVar, setVar, callSetup } = require('./helpers');

test.describe('Clothing — Purchase and Beauty', () => {
  test.beforeEach(async ({ game: page }) => {
    await setVar(page, 'hours', 12);
  });

  test('purchasing jeans1 deducts $30 and sets state to "not worn"', async ({ game: page }) => {
    await setVar(page, 'mc.money', 200);
    const startBeauty = await getVar(page, 'mc.beauty');
    await goToPassage(page, 'ClothingSection');
    const buyLink = page.locator('.buyItemLink a').first();

    await buyLink.click();
    await page.waitForFunction(() => SugarCube.State.passage === 'ClothingSection');

    expect(await getVar(page, 'mc.money')).toBe(200 - 30);
    expect(await getVar(page, 'jeansState1')).toBe('not worn');
    expect(await getVar(page, 'mc.beauty')).toBe(startBeauty);
  });

  test('purchasing tshirt1 deducts $30 and sets state to "not worn"', async ({ game: page }) => {
    await setVar(page, 'mc.money', 500);
    await setVar(page, 'jeansState1', 'not worn');
    await setVar(page, 'jeansState2', 'not worn');
    await setVar(page, 'jeansState3', 'not worn');
    await setVar(page, 'shortsState1', 'not worn');
    await setVar(page, 'shortsState2', 'not worn');
    await setVar(page, 'shortsState3', 'not worn');
    await setVar(page, 'skirtState1', 'not worn');
    await setVar(page, 'skirtState2', 'not worn');
    await setVar(page, 'skirtState3', 'not worn');

    await goToPassage(page, 'ClothingSection');
    const buyLink = page.locator('.buyItemLink a').first();

    await buyLink.click();
    await page.waitForFunction(() => SugarCube.State.passage === 'ClothingSection');

    expect(await getVar(page, 'mc.money')).toBe(500 - 30);
    expect(await getVar(page, 'tshirtState1')).toBe('not worn');
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
    await setVar(page, 'jeansState1', 'not worn');

    await goToPassage(page, 'ClothingSection');
    const buyLinks = page.locator('.buyItemLink a');
    const count = await buyLinks.count();
    expect(count).toBeLessThan(22);
  });

  test('wearing jeans1 in wardrobe adds +5 beauty', async ({ game: page }) => {
    await setVar(page, 'jeansState1', 'not worn');
    await setVar(page, 'jeansState0', 'not worn');
    await setVar(page, 'rememberBottomOuter', 'nojeans0');
    const startBeauty = await getVar(page, 'mc.beauty');

    await goToPassage(page, 'Wardrobe');

    const jeans1Link = page.locator('#availableOuterwear a', {
      has: page.locator('img[src*="jeans1"]'),
    });
    await jeans1Link.click();
    await page.waitForFunction(() => SugarCube.State.passage === 'Wardrobe');

    expect(await getVar(page, 'jeansState1')).toBe('worn');
    expect(await getVar(page, 'mc.beauty')).toBe(startBeauty + 5);
  });

  test('wearing bra1 in wardrobe adds +2 beauty', async ({ game: page }) => {
    await setVar(page, 'braState1', 'not worn');
    await setVar(page, 'braState0', 'not worn');
    await setVar(page, 'rememberTopUnder', 'nobra0');
    const startBeauty = await getVar(page, 'mc.beauty');

    await goToPassage(page, 'Wardrobe');

    const bra1Link = page.locator('#availableClothes a', {
      has: page.locator('img[src*="slip2"]'),
    });
    await bra1Link.click();
    await page.waitForFunction(() => SugarCube.State.passage === 'Wardrobe');

    expect(await getVar(page, 'braState1')).toBe('worn');
    expect(await getVar(page, 'mc.beauty')).toBe(startBeauty + 2);
  });

  test('switching from jeans1 (+5) to jeans2 (+8) nets +3 beauty', async ({ game: page }) => {
    await setVar(page, 'jeansState0', 'not worn');
    await setVar(page, 'jeansState1', 'worn');
    await setVar(page, 'jeansState2', 'not worn');
    await setVar(page, 'rememberBottomOuter', 'jeans1');
    await setVar(page, 'mc.beauty', 35);

    await goToPassage(page, 'Wardrobe');

    const jeans2Link = page.locator('#availableOuterwear a', {
      has: page.locator('img[src*="jeans2"]'),
    });
    await jeans2Link.click();
    await page.waitForFunction(() => SugarCube.State.passage === 'Wardrobe');

    expect(await getVar(page, 'jeansState2')).toBe('worn');
    expect(await getVar(page, 'jeansState1')).toBe('not worn');
    expect(await getVar(page, 'mc.beauty')).toBe(35 + 8 - 5);
  });
});

test.describe('Clothing — Lost-clothing buyback', () => {
  test.beforeEach(async ({ game: page }) => {
    await setVar(page, 'hours', 12);
  });

  test('loseAllStolen records discarded tier item onto $lostClothing', async ({ game: page }) => {
    // arrange — wear and have a tier-2 tshirt stolen
    await setVar(page, 'tshirtState0', 'not worn');
    await setVar(page, 'tshirtState1', 'not worn');
    await setVar(page, 'tshirtState2', 'worn');
    await setVar(page, 'tshirtState', 'worn');
    await setVar(page, 'rememberTopOuter', 'tshirt2');

    await callSetup(page, 'setup.Wardrobe.stealWornInGroup("tshirt", "tshirtState", "isShirtStolen")');
    await callSetup(page, 'setup.Wardrobe.loseAllStolen()');

    expect(await getVar(page, 'tshirtState2')).toBe('not bought');
    expect(await getVar(page, 'lostClothing')).toEqual(['tshirtState2']);
    expect(await callSetup(page, 'setup.Wardrobe.hasLostClothing()')).toBe(true);
  });

  test('replaceLostClothing deducts store price and restores not-worn state', async ({ game: page }) => {
    await setVar(page, 'mc.money', 100);
    await setVar(page, 'tshirtState2', 'not bought');
    await setVar(page, 'lostClothing', ['tshirtState2']);

    const ok = await callSetup(page, 'setup.Wardrobe.replaceLostClothing("tshirtState2")');

    expect(ok).toBe(true);
    expect(await getVar(page, 'mc.money')).toBe(100 - 40);
    expect(await getVar(page, 'tshirtState2')).toBe('not worn');
    expect(await getVar(page, 'lostClothing')).toEqual([]);
  });

  test('replaceLostClothing fails when MC cannot afford it', async ({ game: page }) => {
    await setVar(page, 'mc.money', 5);
    await setVar(page, 'tshirtState2', 'not bought');
    await setVar(page, 'lostClothing', ['tshirtState2']);

    const ok = await callSetup(page, 'setup.Wardrobe.replaceLostClothing("tshirtState2")');

    expect(ok).toBe(false);
    expect(await getVar(page, 'mc.money')).toBe(5);
    expect(await getVar(page, 'tshirtState2')).toBe('not bought');
    expect(await getVar(page, 'lostClothing')).toEqual(['tshirtState2']);
  });

  test('replaceLostClothing no-ops on items not in the lost list', async ({ game: page }) => {
    await setVar(page, 'mc.money', 1000);
    await setVar(page, 'lostClothing', []);

    const ok = await callSetup(page, 'setup.Wardrobe.replaceLostClothing("tshirtState2")');

    expect(ok).toBe(false);
    expect(await getVar(page, 'mc.money')).toBe(1000);
  });

  test('Bedroom hides Replace lost clothing button when nothing is lost', async ({ game: page }) => {
    await setVar(page, 'lostClothing', []);
    await goToPassage(page, 'Bedroom');

    const link = page.locator('a', { hasText: 'Replace lost clothing' });
    await expect(link).toHaveCount(0);
  });

  test('Bedroom shows Replace lost clothing button when items are lost', async ({ game: page }) => {
    await setVar(page, 'lostClothing', ['tshirtState2']);
    await setVar(page, 'tshirtState2', 'not bought');
    await goToPassage(page, 'Bedroom');

    const link = page.locator('a', { hasText: 'Replace lost clothing' });
    await expect(link).toHaveCount(1);
  });

  test('ReplaceLostClothing passage buy link replaces the item end-to-end', async ({ game: page }) => {
    await setVar(page, 'mc.money', 200);
    await setVar(page, 'tshirtState2', 'not bought');
    await setVar(page, 'lostClothing', ['tshirtState2']);

    await goToPassage(page, 'ReplaceLostClothing');
    const buyLink = page.locator('.buyItemLink a').first();
    await buyLink.click();
    await page.waitForFunction(() => SugarCube.State.passage === 'ReplaceLostClothing');

    expect(await getVar(page, 'mc.money')).toBe(200 - 40);
    expect(await getVar(page, 'tshirtState2')).toBe('not worn');
    expect(await getVar(page, 'lostClothing')).toEqual([]);
  });

  test('SaveMigration back-fills $lostClothing for pre-tracking saves', async ({ game: page }) => {
    // Simulate a save that lost a tier-2 tshirt before the tracking
    // shipped: tier-2 in NOT_BOUGHT, rememberVar still pointing at
    // "notshirt2", but $lostClothing not yet populated.
    await setVar(page, 'tshirtState2', 'not bought');
    await setVar(page, 'rememberTopOuter', 'notshirt2');
    await setVar(page, 'lostClothing', []);

    await page.evaluate(() => SugarCube.setup.applySaveDefaults(SugarCube.State.variables));

    expect(await getVar(page, 'lostClothing')).toEqual(['tshirtState2']);
    expect(await callSetup(page, 'setup.Wardrobe.hasLostClothing()')).toBe(true);
  });

  test('SaveMigration back-fill leaves never-bought items alone', async ({ game: page }) => {
    // Fresh save: tier-2 tshirt in NOT_BOUGHT but rememberVar points at
    // the slot-0 default. No loss happened — no entry should appear.
    await setVar(page, 'tshirtState2', 'not bought');
    await setVar(page, 'rememberTopOuter', 'tshirt0');
    await setVar(page, 'lostClothing', []);

    await page.evaluate(() => SugarCube.setup.applySaveDefaults(SugarCube.State.variables));

    expect(await getVar(page, 'lostClothing')).toEqual([]);
  });

  test('SaveMigration back-fill is idempotent across repeated runs', async ({ game: page }) => {
    await setVar(page, 'tshirtState2', 'not bought');
    await setVar(page, 'rememberTopOuter', 'notshirt2');
    await setVar(page, 'lostClothing', []);

    await page.evaluate(() => {
      SugarCube.setup.applySaveDefaults(SugarCube.State.variables);
      SugarCube.setup.applySaveDefaults(SugarCube.State.variables);
      SugarCube.setup.applySaveDefaults(SugarCube.State.variables);
    });

    expect(await getVar(page, 'lostClothing')).toEqual(['tshirtState2']);
  });

  test('WARDROBE_GROUPS prices match ClothingSection.tw store prices', async ({ game: page }) => {
    // Pulled from passages/mall/ClothingSection.tw -- the buyback button
    // uses the price field on each WARDROBE_GROUPS item, so the two
    // tables must agree. Slot-0 items have no store price.
    const expected = {
      jeansState1: 30, jeansState2: 40, jeansState3: 50,
      shortsState1: 35, shortsState2: 45, shortsState3: 55,
      skirtState1: 40, skirtState2: 50, skirtState3: 60,
      tshirtState1: 30, tshirtState2: 40, tshirtState3: 50,
      braState1: 20, braState2: 30, braState3: 40,
      pantiesState1: 25, pantiesState2: 35, pantiesState3: 45,
      stockingsState1: 30, stockingsState2: 60, stockingsState3: 120,
      neckChokerState1: 100,
    };

    const prices = await page.evaluate(() => {
      const out = {};
      for (const grp of SugarCube.setup.WARDROBE_GROUPS) {
        for (const item of grp.items) {
          if (item.slot !== 0) out[item.var] = item.price;
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
        tshirt:  W.groupForSlot('tshirt').name,
        bra:     W.groupForSlot('bra').name,
        panties: W.groupForSlot('panties').name,
        jeans:   W.groupForSlot('jeans').name,
        shorts:  W.groupForSlot('shorts').name,
        skirt:   W.groupForSlot('skirt').name,
        bottom:  W.groupForSlot('bottomOuter').name,
        bogus:   W.groupForSlot('nope'),
      };
    });
    expect(map).toEqual({
      tshirt: 'tshirt', bra: 'bra', panties: 'panties',
      jeans: 'bottomOuter', shorts: 'bottomOuter', skirt: 'bottomOuter',
      bottom: 'bottomOuter', bogus: null,
    });
  });

  test('quickUndress(tshirt) on a worn tier-1 t-shirt unequips it and refunds beauty', async ({ game: page }) => {
    await setVar(page, 'tshirtState0', 'not worn');
    await setVar(page, 'tshirtState1', 'worn');
    await setVar(page, 'tshirtState',  'worn');
    await setVar(page, 'rememberTopOuter', 'tshirt1');
    await setVar(page, 'mc.beauty', 30);

    const ok = await callSetup(page, 'setup.Wardrobe.quickUndress("tshirt")');

    expect(ok).toBe(true);
    expect(await getVar(page, 'tshirtState1')).toBe('not worn');
    expect(await getVar(page, 'rememberTopOuter')).toBe('notshirt1');
    expect(await getVar(page, 'mc.beauty')).toBe(30 - 5);
  });

  test('quickUndress no-ops when the slot already has nothing on', async ({ game: page }) => {
    await setVar(page, 'braState0', 'not worn');
    await setVar(page, 'braState1', 'not worn');
    await setVar(page, 'braState',  'not worn');
    const startBeauty = await getVar(page, 'mc.beauty');

    const ok = await callSetup(page, 'setup.Wardrobe.quickUndress("bra")');

    expect(ok).toBe(false);
    expect(await getVar(page, 'mc.beauty')).toBe(startBeauty);
  });

  test('quickRedress restores the previously worn item and re-applies its beauty', async ({ game: page }) => {
    await setVar(page, 'pantiesState0', 'not worn');
    await setVar(page, 'pantiesState2', 'not worn');
    await setVar(page, 'pantiesState',  'not worn');
    await setVar(page, 'rememberBottomUnder', 'nopanties2');
    await setVar(page, 'mc.beauty', 20);

    const ok = await callSetup(page, 'setup.Wardrobe.quickRedress("panties")');

    expect(ok).toBe(true);
    expect(await getVar(page, 'pantiesState2')).toBe('worn');
    expect(await getVar(page, 'rememberBottomUnder')).toBe('panties2');
    expect(await getVar(page, 'mc.beauty')).toBe(20 + 4);
  });

  test('quickRedress refuses to put back a now-NOT_BOUGHT (stolen) item', async ({ game: page }) => {
    await setVar(page, 'tshirtState0', 'not worn');
    await setVar(page, 'tshirtState2', 'not bought');
    await setVar(page, 'tshirtState',  'not worn');
    await setVar(page, 'rememberTopOuter', 'notshirt2');

    const can = await callSetup(page, 'setup.Wardrobe.canQuickRedress("tshirt")');
    const ok  = await callSetup(page, 'setup.Wardrobe.quickRedress("tshirt")');

    expect(can).toBe(false);
    expect(ok).toBe(false);
    expect(await getVar(page, 'tshirtState2')).toBe('not bought');
  });

  test('quickRedress refuses to put back an in-hunt stolen item even though the tier is still purchased', async ({ game: page }) => {
    /* In-hunt steal: stealWornInGroup flips tshirtState1 to NOT_WORN
     * (still purchased — it's not gone for good yet) and stamps
     * isShirtStolen=1. Recovery has to happen via FindStolenClothes;
     * the HUD shortcut must refuse. */
    await setVar(page, 'tshirtState0', 'not worn');
    await setVar(page, 'tshirtState1', 'not worn');
    await setVar(page, 'tshirtState',  'not worn');
    await setVar(page, 'rememberTopOuter', 'notshirt1');
    await setVar(page, 'isShirtStolen', 1);

    const can = await callSetup(page, 'setup.Wardrobe.canQuickRedress("tshirt")');
    const ok  = await callSetup(page, 'setup.Wardrobe.quickRedress("tshirt")');

    expect(can).toBe(false);
    expect(ok).toBe(false);
    expect(await getVar(page, 'tshirtState1')).toBe('not worn');
    expect(await getVar(page, 'isShirtStolen')).toBe(1);
  });

  test('quickRedress refuses bottomOuter when the in-hunt $isBottomStolen aggregate is set', async ({ game: page }) => {
    await setVar(page, 'jeansState0', 'not worn');
    await setVar(page, 'jeansState1', 'not worn');
    await setVar(page, 'jeansState',  'not worn');
    await setVar(page, 'rememberBottomOuter', 'nojeans1');
    await setVar(page, 'isBottomStolen', 1);

    expect(await callSetup(page, 'setup.Wardrobe.canQuickRedress("jeans")')).toBe(false);
    expect(await callSetup(page, 'setup.Wardrobe.canQuickRedress("bottomOuter")')).toBe(false);
    expect(await callSetup(page, 'setup.Wardrobe.quickRedress("bottomOuter")')).toBe(false);
    expect(await getVar(page, 'jeansState1')).toBe('not worn');
  });

  test('isSlotStolen maps each slot to the right $is<Garment>Stolen flag', async ({ game: page }) => {
    await setVar(page, 'isShirtStolen',   1);
    await setVar(page, 'isBraStolen',     0);
    await setVar(page, 'isPantiesStolen', 1);
    await setVar(page, 'isBottomStolen',  1);

    const map = await page.evaluate(() => {
      const W = SugarCube.setup.Wardrobe;
      return {
        tshirt:      W.isSlotStolen('tshirt'),
        bra:         W.isSlotStolen('bra'),
        panties:     W.isSlotStolen('panties'),
        jeans:       W.isSlotStolen('jeans'),
        shorts:      W.isSlotStolen('shorts'),
        skirt:       W.isSlotStolen('skirt'),
        bottomOuter: W.isSlotStolen('bottomOuter'),
        bogus:       W.isSlotStolen('nope'),
      };
    });
    expect(map).toEqual({
      tshirt: true, bra: false, panties: true,
      jeans: true, shorts: true, skirt: true, bottomOuter: true,
      bogus: false,
    });
  });

  test('canQuickRedress is false when nothing is remembered', async ({ game: page }) => {
    // rememberVar still holds the worn key (no "no" prefix) — nothing to restore.
    await setVar(page, 'rememberTopUnder', 'bra0');
    const can = await callSetup(page, 'setup.Wardrobe.canQuickRedress("bra")');
    expect(can).toBe(false);
  });

  test('undress + redress on bottomOuter (jeans) round-trips', async ({ game: page }) => {
    await setVar(page, 'jeansState0', 'not worn');
    await setVar(page, 'jeansState1', 'worn');
    await setVar(page, 'jeansState',  'worn');
    await setVar(page, 'rememberBottomOuter', 'jeans1');
    await setVar(page, 'mc.beauty', 35);

    expect(await callSetup(page, 'setup.Wardrobe.quickUndress("jeans")')).toBe(true);
    expect(await getVar(page, 'jeansState1')).toBe('not worn');
    expect(await getVar(page, 'rememberBottomOuter')).toBe('nojeans1');
    expect(await getVar(page, 'mc.beauty')).toBe(35 - 5);

    expect(await callSetup(page, 'setup.Wardrobe.canQuickRedress("jeans")')).toBe(true);
    expect(await callSetup(page, 'setup.Wardrobe.quickRedress("jeans")')).toBe(true);
    expect(await getVar(page, 'jeansState1')).toBe('worn');
    expect(await getVar(page, 'rememberBottomOuter')).toBe('jeans1');
    expect(await getVar(page, 'mc.beauty')).toBe(35);
  });

  test('currentBottomSlotName reports the worn outer-bottom or null', async ({ game: page }) => {
    await setVar(page, 'jeansState',  'not worn');
    await setVar(page, 'shortsState', 'worn');
    await setVar(page, 'skirtState',  'not worn');
    expect(await callSetup(page, 'setup.Wardrobe.currentBottomSlotName()')).toBe('shorts');

    await setVar(page, 'shortsState', 'not worn');
    expect(await callSetup(page, 'setup.Wardrobe.currentBottomSlotName()')).toBe(null);
  });
});

test.describe('MC HUD — Hunt-mode click handlers', () => {
  const { setHuntMode } = require('./helpers');

  /* Pin to pre-dawn so PassageDone's isMorningPlus + isHunting branch
   * doesn't auto-redirect Bedroom to HuntOverTime and tear down the
   * hunt mid-test. */
  test.beforeEach(async ({ game: page }) => {
    await setVar(page, 'hours', 2);
  });

  /* The MC clothing strip lives in StoryCaption (sidebar). To verify
   * a specific state actually drives the right output we render the
   * widget body directly via `setup.Macro.evaluateString` — that
   * sidesteps the parallel-worker race where the sidebar HTML
   * snapshotted into the DOM lags behind the just-set state. */
  async function renderStrip(page) {
    return page.evaluate(() => {
      const $div = jQuery('<div></div>');
      $div.wiki('<<mcStatusBody>>');
      return $div.html();
    });
  }

  test('outside a hunt the t-shirt icon has no click handler', async ({ game: page }) => {
    await setHuntMode(page, 0);
    await setVar(page, 'tshirtState0', 'worn');
    await setVar(page, 'tshirtState',  'worn');

    const html = await renderStrip(page);
    expect(html).toContain('id="statusOuterTop"');
    expect(html).not.toContain('take it off');
  });

  test('during a hunt the t-shirt slot becomes a take-off link', async ({ game: page }) => {
    await setHuntMode(page, 2);
    await setVar(page, 'tshirtState0', 'not worn');
    await setVar(page, 'tshirtState1', 'worn');
    await setVar(page, 'tshirtState',  'worn');
    await setVar(page, 'rememberTopOuter', 'tshirt1');

    const html = await renderStrip(page);
    expect(html).toContain('take it off');
    expect(html).toMatch(/id="statusOuterTop"[\s\S]*?<a /);
  });

  test('during a hunt with a remembered item the empty bra slot becomes a put-back-on link', async ({ game: page }) => {
    await setHuntMode(page, 2);
    await setVar(page, 'braState0', 'not worn');
    await setVar(page, 'braState2', 'not worn');
    await setVar(page, 'braState',  'not worn');
    await setVar(page, 'rememberTopUnder', 'nobra2');

    const html = await renderStrip(page);
    expect(html).toContain('put it back on');
    expect(html).toMatch(/id="statusUnderTop"[\s\S]*?<a /);
  });

  test('during a hunt with no remembered item the empty bra slot stays a plain image', async ({ game: page }) => {
    await setHuntMode(page, 2);
    await setVar(page, 'braState0', 'not worn');
    await setVar(page, 'braState',  'not worn');
    await setVar(page, 'rememberTopUnder', 'bra0');

    const html = await renderStrip(page);
    expect(html).toContain('id="statusUnderTop"');
    expect(html).not.toContain('put it back on');
  });

  test('a stolen tier-1 t-shirt renders with no redress link in the HUD', async ({ game: page }) => {
    /* Even though the tier is still purchased and the rememberVar
     * still points at "notshirt1", the in-hunt steal flag must
     * suppress the put-back-on shortcut. */
    await setHuntMode(page, 2);
    await setVar(page, 'tshirtState0', 'not worn');
    await setVar(page, 'tshirtState1', 'not worn');
    await setVar(page, 'tshirtState',  'not worn');
    await setVar(page, 'rememberTopOuter', 'notshirt1');
    await setVar(page, 'isShirtStolen', 1);

    const html = await renderStrip(page);
    /* Pull just the tshirt slot out of the strip so anchors in
     * other slots can't mask a regression. */
    const slot = html.match(/id="statusOuterTop"[\s\S]*?<\/div>/)[0];
    expect(slot).toContain('empty.jpg');
    expect(slot).not.toContain('<a ');
    expect(slot).not.toContain('put it back on');
  });

  test('Ironclad warden costume mode shows no clothing slots', async ({ game: page }) => {
    await setHuntMode(page, 2);
    await setVar(page, 'hauntedHouse', 'ironclad');

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
    await setHuntMode(page, 2);
    await setVar(page, 'tshirtState0', 'not worn');
    await setVar(page, 'tshirtState1', 'worn');
    await setVar(page, 'tshirtState',  'worn');
    await setVar(page, 'rememberTopOuter', 'tshirt1');
    await setVar(page, 'mc.beauty', 30);
    await goToPassage(page, 'Bedroom');

    await page.evaluate(() => jQuery('#statusOuterTop a').trigger('click'));

    expect(await getVar(page, 'tshirtState1')).toBe('not worn');
    /* Aggregate must refresh too — otherwise the next click finds
     * tshirtState still "worn" and quickUndress no-ops. */
    expect(await getVar(page, 'tshirtState')).toBe('not worn');
    expect(await getVar(page, 'rememberTopOuter')).toBe('notshirt1');
    expect(await getVar(page, 'mc.beauty')).toBe(30 - 5);

    const html = await page.locator('#statusOuterTop').innerHTML();
    expect(html).toMatch(/img src="[^"]+\/empty\.jpg"/);
    expect(html).toContain('put it back on');
  });

  test('clicking the empty t-shirt icon puts the remembered tier back on', async ({ game: page }) => {
    await setHuntMode(page, 2);
    await setVar(page, 'tshirtState0', 'not worn');
    await setVar(page, 'tshirtState1', 'not worn');
    await setVar(page, 'tshirtState',  'not worn');
    await setVar(page, 'rememberTopOuter', 'notshirt1');
    await setVar(page, 'mc.beauty', 25);
    await goToPassage(page, 'Bedroom');

    await page.evaluate(() => jQuery('#statusOuterTop a').trigger('click'));

    expect(await getVar(page, 'tshirtState1')).toBe('worn');
    expect(await getVar(page, 'tshirtState')).toBe('worn');
    expect(await getVar(page, 'rememberTopOuter')).toBe('tshirt1');
    expect(await getVar(page, 'mc.beauty')).toBe(25 + 5);

    const html = await page.locator('#statusOuterTop').innerHTML();
    expect(html).toMatch(/img src="[^"]+\/top\.jpg"/);
    expect(html).toContain('take it off');
  });

  test('toggle round-trip: take off → put back on lands on the original state', async ({ game: page }) => {
    await setHuntMode(page, 2);
    await setVar(page, 'tshirtState0', 'not worn');
    await setVar(page, 'tshirtState1', 'worn');
    await setVar(page, 'tshirtState',  'worn');
    await setVar(page, 'rememberTopOuter', 'tshirt1');
    await setVar(page, 'mc.beauty', 30);
    await goToPassage(page, 'Bedroom');

    // First click: take off
    await page.evaluate(() => jQuery('#statusOuterTop a').trigger('click'));
    expect(await getVar(page, 'tshirtState1')).toBe('not worn');
    expect(await getVar(page, 'mc.beauty')).toBe(30 - 5);

    // Second click on the now-empty slot: put back on
    await page.evaluate(() => jQuery('#statusOuterTop a').trigger('click'));
    expect(await getVar(page, 'tshirtState1')).toBe('worn');
    expect(await getVar(page, 'tshirtState')).toBe('worn');
    expect(await getVar(page, 'rememberTopOuter')).toBe('tshirt1');
    expect(await getVar(page, 'mc.beauty')).toBe(30);
  });

  /* The HUD shortcut gates on HuntController.isHuntActive() instead of
     the classic-only setup.Ghosts.isHunting() so it also fires inside
     a rogue run (mode === 'rogue' on the RogueRun passage). Without
     this, the click-to-undress feature would silently no-op for the
     entire rogue flow. */
  test('rogue run: t-shirt slot becomes a take-off link on the RogueRun passage', async ({ game: page }) => {
    await setHuntMode(page, 0);
    await setVar(page, 'tshirtState0', 'not worn');
    await setVar(page, 'tshirtState1', 'worn');
    await setVar(page, 'tshirtState',  'worn');
    await setVar(page, 'rememberTopOuter', 'tshirt1');
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({ seed: 1 }));
    await page.evaluate(() => SugarCube.Engine.play('RogueRun'));
    await page.waitForFunction(() => SugarCube.State.passage === 'RogueRun');

    const html = await page.evaluate(() => {
      const $div = jQuery('<div></div>');
      $div.wiki('<<mcStatusBody>>');
      return $div.html();
    });
    expect(html).toContain('take it off');
    expect(html).toMatch(/id="statusOuterTop"[\s\S]*?<a /);
  });
});

