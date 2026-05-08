const { test, expect } = require('./fixtures');
const { getVar, getHuntMode, callSetup } = require('./helpers');

test.describe('Game Initialization (StoryInit)', () => {
  // --- MC defaults ---

  test('MC stats are initialized correctly', async ({ game: page }) => {
    // act
    const mc = await page.evaluate(() => SugarCube.State.variables.mc);

    // assert
    expect(mc.money).toBe(100);
    expect(mc.sanity).toBe(100);
    expect(mc.corruption).toBe(0);
    expect(mc.lust).toBe(0);
    expect(mc.energy).toBe(10);
    expect(mc.energyMax).toBe(10);
    expect(mc.lvl).toBe(0);
    expect(mc.exp).toBe(0);
    expect(mc.beauty).toBe(30);
    expect(mc.dirty).toBe(0);
  });

  // --- Clothing defaults ---

  test('clothing states are initialized correctly', async ({ game: page }) => {
    // act
    const jeans = await getVar(page, 'jeansState');
    const tshirt = await getVar(page, 'tshirtState');
    const panties = await getVar(page, 'pantiesState');
    const bra = await getVar(page, 'braState');
    const skirt = await getVar(page, 'skirtState');

    // assert
    expect(jeans).toBe('worn');
    expect(tshirt).toBe('worn');
    expect(panties).toBe('worn');
    expect(bra).toBe('worn');
    expect(skirt).toBe('not bought');
  });

  // --- Equipment ---

  test('all equipment starts with 5 charges', async ({ game: page }) => {
    // act
    const equipment = await getVar(page, 'equipment');

    // assert
    expect(equipment.emf).toBe(5);
    expect(equipment.spiritbox).toBe(5);
    expect(equipment.gwb).toBe(5);
    expect(equipment.glass).toBe(5);
    expect(equipment.temperature).toBe(5);
    expect(equipment.uvl).toBe(5);
  });

  // --- Time and game state defaults ---

  test('time and game state are initialized correctly', async ({ game: page }) => {
    // act
    const hours = await getVar(page, 'hours');
    const minutes = await getVar(page, 'minutes');
    const meridiem = await getVar(page, 'meridiem');
    const mode = await getHuntMode(page);

    // assert
    expect(hours).toBe(12);
    expect(minutes).toBe(0);
    expect(meridiem).toBe('AM');
    expect(mode).toBe(0);
  });

  // --- Delivery ---

  test('delivery defaults are initialized correctly', async ({ game: page }) => {
    // act
    const successPay = await getVar(page, 'jobMoneySuccessed');
    const failPay = await getVar(page, 'jobMoneyFailed');
    const firstVisit = await getVar(page, 'firstVisitDeliveryHub');

    // assert
    expect(successPay).toBe(8);
    expect(failPay).toBe(3);
    expect(firstVisit).toBe(true);
  });

  // --- Ghost definitions ---

  test('ghost types have correct evidence arrays', async ({ game: page }) => {
    // act
    const shadeIds = await page.evaluate(() =>
      SugarCube.setup.Ghosts.getByName('Shade').evidence.map(e => e.id));
    const spiritIds = await page.evaluate(() =>
      SugarCube.setup.Ghosts.getByName('Spirit').evidence.map(e => e.id));

    // assert
    expect(shadeIds).toEqual(['emf', 'gwb', 'temperature']);
    expect(spiritIds).toEqual(['emf', 'spiritbox', 'gwb']);
  });

  test('Evidence table exposes all 6 types with id/label/cssClass', async ({ game: page }) => {
    // act
    const ev = await page.evaluate(() => SugarCube.setup.Ghosts.Evidence);

    // assert
    for (const key of ['EMF', 'SPIRITBOX', 'GWB', 'GLASS', 'TEMPERATURE', 'UVL']) {
      expect(ev[key]).toBeDefined();
      expect(typeof ev[key].id).toBe('string');
      expect(typeof ev[key].label).toBe('string');
      expect(typeof ev[key].cssClass).toBe('string');
    }
  });

  // --- Piercing list ---

  test('piercingList has 5 entries with correct structure', async ({ game: page }) => {
    // act
    const list = await page.evaluate(() => SugarCube.setup.piercingList);

    // assert
    expect(list).toHaveLength(5);
    expect(list[0].var).toBe('earsPiercing');
    expect(list[0].beauty).toBe(2);
    expect(list[1].var).toBe('nosePiercing');
    expect(list[1].beauty).toBe(3);
  });

  // --- Delivery houses ---

  test('deliveryStreets has 10 entries', async ({ game: page }) => {
    // act
    const streets = await page.evaluate(() => SugarCube.setup.deliveryStreets);

    // assert
    expect(streets).toHaveLength(10);
  });

  test('deliveryEvents catalogue has pizza, package, burger, papers', async ({ game: page }) => {
    // act
    const config = await page.evaluate(() => SugarCube.setup.deliveryEvents);

    // assert
    expect(config.pizza).toBeDefined();
    expect(config.package).toBeDefined();
    expect(config.burger).toBeDefined();
    expect(config.papers).toBeDefined();
    // each entry must carry the fields the unified dispatcher reads
    for (const key of ['pizza', 'package', 'burger', 'papers']) {
      expect(typeof config[key].varName).toBe('string');
      expect(typeof config[key].videoSubdir).toBe('string');
      expect(typeof config[key].headerImg).toBe('string');
      expect(typeof config[key].payMode).toBe('string');
      expect(typeof config[key].gateCorrReq).toBe('number');
    }
  });
});
