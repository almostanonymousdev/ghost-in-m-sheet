const { test, expect } = require('@playwright/test');
const { openGame, resetGame, callSetup } = require('./helpers');

test.describe('Save recovery — missing passage', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  // ── recoverMissingPassage ────────────────────────────────────

  test('rewrites moment.title to CityMap when passage does not exist', async () => {
    // arrange
    const moment = { title: 'DefinitelyNotARealPassage', variables: {} };

    // act
    const result = await page.evaluate((m) => {
      const changed = SugarCube.setup.recoverMissingPassage(m);
      return { changed: changed, title: m.title };
    }, moment);

    // assert
    expect(result.changed).toBe(true);
    expect(result.title).toBe('CityMap');
  });

  test('leaves moment untouched when passage exists', async () => {
    // arrange
    const moment = { title: 'CityMap', variables: { foo: 1 } };

    // act
    const result = await page.evaluate((m) => {
      const changed = SugarCube.setup.recoverMissingPassage(m);
      return { changed: changed, title: m.title, foo: m.variables.foo };
    }, moment);

    // assert
    expect(result.changed).toBe(false);
    expect(result.title).toBe('CityMap');
    expect(result.foo).toBe(1);
  });

  test('returns false for null/undefined moment', async () => {
    const nullResult = await callSetup(page, 'setup.recoverMissingPassage(null)');
    const undefResult = await callSetup(page, 'setup.recoverMissingPassage(undefined)');
    expect(nullResult).toBe(false);
    expect(undefResult).toBe(false);
  });

  test('treats empty title as a missing passage', async () => {
    const result = await page.evaluate(() => {
      const m = { title: '', variables: {} };
      const changed = SugarCube.setup.recoverMissingPassage(m);
      return { changed: changed, title: m.title };
    });
    expect(result.changed).toBe(true);
    expect(result.title).toBe('CityMap');
  });

  test('deleted map passages (RescueMap, DeliveryMap) are recovered', async () => {
    for (const title of ['RescueMap', 'DeliveryMap']) {
      const result = await page.evaluate((t) => {
        const m = { title: t, variables: {} };
        const changed = SugarCube.setup.recoverMissingPassage(m);
        return { changed: changed, title: m.title };
      }, title);
      expect(result.changed).toBe(true);
      expect(result.title).toBe('CityMap');
    }
  });

  // ── clearInFlightState ───────────────────────────────────────

  test('clearInFlightState zeroes hunt activity', async () => {
    const vars = {
      ghostHuntingMode: 2,
      isOwaissa: 1, isElm: 0, isEnigma: 0, isIronclad: 0,
      EmfActivated: 1, EmfActivationTime: 500,
      uvlActivated: 1, uvlActivationTime: 300,
      EMF5Check: true, EctoglassCheck: true, GWBCheck: true,
      SpiritboxCheck: true, TemperatureCheck: true, UVLCheck: true,
      tempCorr: 0.7, huntActivated: 1,
    };

    const result = await page.evaluate((v) => {
      SugarCube.setup.clearInFlightState(v);
      return v;
    }, vars);

    expect(result.ghostHuntingMode).toBe(0);
    expect(result.isOwaissa).toBe(0);
    expect(result.EmfActivated).toBe(0);
    expect(result.uvlActivationTime).toBe(0);
    expect(result.EMF5Check).toBe(false);
    expect(result.UVLCheck).toBe(false);
    expect(result.tempCorr).toBe(0);
    expect(result.huntActivated).toBe(0);
  });

  test('clearInFlightState resets delivery shift state', async () => {
    const vars = {
      deliverySpecialOrder: true,
      deliverySpecialOrderAddress: 'Cedar Drive 41',
      deliverySpecialOrderPay: 22,
      orders: [{ address: 'Maple Street 12', item: 'pizza' }],
      currentHouse: 'Maple Street 12',
      currentOrder: 1,
      earnedMoney: 45,
      deliveryCorrectThisShift: 2,
      deliveryActiveIcon1: false,
      deliveryActiveIcon2: false,
      deliveryActiveIcon3: false,
    };

    const result = await page.evaluate((v) => {
      SugarCube.setup.clearInFlightState(v);
      return v;
    }, vars);

    expect(result.deliverySpecialOrder).toBe(false);
    expect(result.deliverySpecialOrderAddress).toBe('');
    expect(result.deliverySpecialOrderPay).toBe(0);
    expect(result.orders).toEqual([]);
    expect(result.currentHouse).toBe('');
    expect(result.currentOrder).toBe(0);
    expect(result.earnedMoney).toBe(0);
    expect(result.deliveryCorrectThisShift).toBe(0);
    expect(result.deliveryActiveIcon1).toBe(true);
    expect(result.deliveryActiveIcon2).toBe(true);
    expect(result.deliveryActiveIcon3).toBe(true);
  });

  test('clearInFlightState resets suburb map mode', async () => {
    const vars = { suburbMapMode: 'delivery' };
    const result = await page.evaluate((v) => {
      SugarCube.setup.clearInFlightState(v);
      return v;
    }, vars);
    expect(result.suburbMapMode).toBe('');
  });

  test('clearInFlightState clears cursed-home active flag', async () => {
    const vars = { cursedHomeItemActive: 1 };
    const result = await page.evaluate((v) => {
      SugarCube.setup.clearInFlightState(v);
      return v;
    }, vars);
    expect(result.cursedHomeItemActive).toBe(0);
  });

  test('clearInFlightState preserves quest progression flags', async () => {
    const vars = {
      hasQuestForRescue: 1,
      currentRescueGirl: 'Victoria',
      mc: { money: 500, corruption: 4, lvl: 3 },
      relationshipBlake: 2,
      relationshipWithRain: 3,
      meetAlice: 1,
      holyWaterIsCollected: 1,
      // and things it should clear
      ghostHuntingMode: 2,
      orders: [1, 2, 3],
    };

    const result = await page.evaluate((v) => {
      SugarCube.setup.clearInFlightState(v);
      return v;
    }, vars);

    // Quest/relationship/progress preserved
    expect(result.hasQuestForRescue).toBe(1);
    expect(result.currentRescueGirl).toBe('Victoria');
    expect(result.mc.money).toBe(500);
    expect(result.mc.corruption).toBe(4);
    expect(result.relationshipBlake).toBe(2);
    expect(result.relationshipWithRain).toBe(3);
    expect(result.meetAlice).toBe(1);
    expect(result.holyWaterIsCollected).toBe(1);
    // Mid-activity cleared
    expect(result.ghostHuntingMode).toBe(0);
    expect(result.orders).toEqual([]);
  });

  test('clearInFlightState handles null/non-object safely', async () => {
    // Should not throw
    await page.evaluate(() => {
      SugarCube.setup.clearInFlightState(null);
      SugarCube.setup.clearInFlightState(undefined);
      SugarCube.setup.clearInFlightState(42);
    });
  });

  // ── Integration: recover + clear together ────────────────────

  test('recovery from missing passage also clears in-flight state', async () => {
    const result = await page.evaluate(() => {
      const m = {
        title: 'DeletedPassage',
        variables: {
          ghostHuntingMode: 2,
          orders: [{ address: 'Maple Street 12' }],
          suburbMapMode: 'delivery',
          hasQuestForRescue: 1,
          mc: { money: 100 },
        },
      };
      SugarCube.setup.recoverMissingPassage(m);
      return m;
    });

    expect(result.title).toBe('CityMap');
    expect(result.variables.ghostHuntingMode).toBe(0);
    expect(result.variables.orders).toEqual([]);
    expect(result.variables.suburbMapMode).toBe('');
    // Progression untouched
    expect(result.variables.hasQuestForRescue).toBe(1);
    expect(result.variables.mc.money).toBe(100);
  });
});
