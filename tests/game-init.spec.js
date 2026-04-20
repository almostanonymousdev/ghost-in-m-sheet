const { test, expect } = require('@playwright/test');
const { openGame, resetGame, getVar, callSetup } = require('./helpers');

test.describe('Game Initialization (StoryInit)', () => {
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

  // --- MC defaults ---

  test('MC stats are initialized correctly', async () => {
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

  test('clothing states are initialized correctly', async () => {
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

  test('all equipment starts with 5 charges', async () => {
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

  test('time and game state are initialized correctly', async () => {
    // act
    const hours = await getVar(page, 'hours');
    const minutes = await getVar(page, 'minutes');
    const meridiem = await getVar(page, 'meridiem');
    const mode = await getVar(page, 'ghostHuntingMode');

    // assert
    expect(hours).toBe(12);
    expect(minutes).toBe(0);
    expect(meridiem).toBe('AM');
    expect(mode).toBe(0);
  });

  // --- Delivery ---

  test('delivery defaults are initialized correctly', async () => {
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

  test('ghost types have correct evidence arrays', async () => {
    // act
    const evidenceType = await getVar(page, 'EvidenceType');
    const shade = await getVar(page, 'ghost1');
    const spirit = await getVar(page, 'ghost2');

    // assert
    expect(shade.name).toBe('Shade');
    expect(shade.evidence).toEqual([evidenceType.EMF, evidenceType.GWB, evidenceType.TEMPERATURE]);
    expect(spirit.name).toBe('Spirit');
    expect(spirit.evidence).toEqual([evidenceType.EMF, evidenceType.SPIRITBOX, evidenceType.GWB]);
  });

  test('evidence type enum has 6 entries', async () => {
    // act
    const et = await getVar(page, 'EvidenceType');

    // assert
    expect(et.EMF).toBeDefined();
    expect(et.SPIRITBOX).toBeDefined();
    expect(et.GWB).toBeDefined();
    expect(et.GLASS).toBeDefined();
    expect(et.TEMPERATURE).toBeDefined();
    expect(et.UVL).toBeDefined();
  });

  // --- Piercing list ---

  test('piercingList has 5 entries with correct structure', async () => {
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

  test('deliveryStreets has 16 entries (derived from rescue houses)', async () => {
    // act
    const streets = await page.evaluate(() => SugarCube.setup.deliveryStreets);

    // assert
    expect(streets).toHaveLength(16);
  });

  test('rescueHouses has 16 entries with addresses and images', async () => {
    // act
    const houses = await page.evaluate(() => SugarCube.setup.rescueHouses);

    // assert
    expect(houses).toHaveLength(16);
    for (const h of houses) {
      expect(typeof h.id).toBe('number');
      expect(typeof h.street).toBe('string');
      expect(typeof h.number).toBe('number');
      expect(h.address).toBe(h.street + ' ' + h.number);
      expect(h.image).toBe('rescue/house/' + h.id + '.jpg');
    }
  });

  test('rescueStreets groups the 16 houses into named neighborhoods', async () => {
    // act
    const streets = await page.evaluate(() => SugarCube.setup.rescueStreets);

    // assert
    const total = streets.reduce((n, s) => n + s.houses.length, 0);
    expect(total).toBe(16);
    // Every street has a human-readable name
    for (const s of streets) {
      expect(typeof s.name).toBe('string');
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.houses.length).toBeGreaterThan(0);
    }
    // House ids across all streets are 1..16 unique
    const ids = streets.flatMap(s => s.houses.map(h => h.id)).sort((a, b) => a - b);
    expect(ids).toEqual([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]);
  });

  test('deliveryHouses uses rescue house addresses as keys', async () => {
    // act
    const { deliveryHouses, rescueHouses } = await page.evaluate(() => ({
      deliveryHouses: SugarCube.setup.deliveryHouses,
      rescueHouses: SugarCube.setup.rescueHouses,
    }));

    // assert
    for (const h of rescueHouses) {
      expect(deliveryHouses[h.address]).toBe(h.image);
    }
  });

  test('rescueHouseById and rescueHouseByAddress lookups are consistent', async () => {
    // act
    const data = await page.evaluate(() => ({
      byId: SugarCube.setup.rescueHouseById,
      byAddress: SugarCube.setup.rescueHouseByAddress,
      houses: SugarCube.setup.rescueHouses,
    }));

    // assert
    for (const h of data.houses) {
      expect(data.byId[h.id].address).toBe(h.address);
      expect(data.byAddress[h.address].id).toBe(h.id);
    }
  });

  test('deliveryEventChooseConfig has pizza, package, burger, papers', async () => {
    // act
    const config = await page.evaluate(() => SugarCube.setup.deliveryEventChooseConfig);

    // assert
    expect(config.pizza).toBeDefined();
    expect(config.package).toBeDefined();
    expect(config.burger).toBeDefined();
    expect(config.papers).toBeDefined();
  });
});
