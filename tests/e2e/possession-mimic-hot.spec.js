const { test, expect } = require('../fixtures');
const { setVar, getVar, callSetup, goToPassage, resetGame } = require('../helpers');
const { expectCleanPassage, setupHunt } = require('./e2e-helpers');

test.describe('Possession — resistance meter', () => {
  test('meter() returns $mcpossession', async ({ game: page }) => {
    await setVar(page, 'mcpossession', 0);
    expect(await callSetup(page, 'setup.Posession.meter()')).toBe(0);
    await setVar(page, 'mcpossession', 5);
    expect(await callSetup(page, 'setup.Posession.meter()')).toBe(5);
  });

  test('meterAtLeast compares against threshold', async ({ game: page }) => {
    await setVar(page, 'mcpossession', 3);
    expect(await callSetup(page, 'setup.Posession.meterAtLeast(2)')).toBe(true);
    expect(await callSetup(page, 'setup.Posession.meterAtLeast(3)')).toBe(true);
    expect(await callSetup(page, 'setup.Posession.meterAtLeast(4)')).toBe(false);
  });

  test('meterAtLeast handles undefined meter as 0', async ({ game: page }) => {
    await page.evaluate(() => { delete SugarCube.State.variables.mcpossession; });
    expect(await callSetup(page, 'setup.Posession.meterAtLeast(0)')).toBe(true);
    expect(await callSetup(page, 'setup.Posession.meterAtLeast(1)')).toBe(false);
  });

  test('raiseMeter increments up to cap and blocks beyond', async ({ game: page }) => {
    await setVar(page, 'mcpossession', 0);
    expect(await callSetup(page, 'setup.Posession.raiseMeter(3)')).toBe(true);
    expect(await getVar(page, 'mcpossession')).toBe(1);
    expect(await callSetup(page, 'setup.Posession.raiseMeter(3)')).toBe(true);
    expect(await getVar(page, 'mcpossession')).toBe(2);
    expect(await callSetup(page, 'setup.Posession.raiseMeter(3)')).toBe(true);
    expect(await callSetup(page, 'setup.Posession.raiseMeter(3)')).toBe(true);
    // At 4, meter > cap 3, should return false
    expect(await callSetup(page, 'setup.Posession.raiseMeter(3)')).toBe(false);
  });

  test('raiseMeter initialises undefined meter to 1', async ({ game: page }) => {
    await page.evaluate(() => { delete SugarCube.State.variables.mcpossession; });
    expect(await callSetup(page, 'setup.Posession.raiseMeter(10)')).toBe(true);
    expect(await getVar(page, 'mcpossession')).toBe(1);
  });

  test('canResist tier predicates match documented thresholds', async ({ game: page }) => {
    const checks = [
      { meter: 3, first: false, second: false, final: false },
      { meter: 4, first: true,  second: false, final: false },
      { meter: 6, first: true,  second: false, final: false },
      { meter: 7, first: true,  second: true,  final: false },
      { meter: 10, first: true, second: true,  final: false },
      { meter: 11, first: true, second: true,  final: true },
    ];
    for (const c of checks) {
      await setVar(page, 'mcpossession', c.meter);
      expect(await callSetup(page, 'setup.Posession.canResistFirstAttempt()')).toBe(c.first);
      expect(await callSetup(page, 'setup.Posession.canResistSecondAttempt()')).toBe(c.second);
      expect(await callSetup(page, 'setup.Posession.canResistFinalAttempt()')).toBe(c.final);
    }
  });
});

test.describe('Possession — Mimic ghost rotation', () => {
  test('rollMimicType picks a new ghost when interval changes', async ({ game: page }) => {
    await setupHunt(page, 'Mimic');
    await setVar(page, 'minutes', 15);
    await page.evaluate(() => { delete SugarCube.State.variables.lastChangeIntervalMimic; });

    const result = await page.evaluate(() => {
      const names = SugarCube.setup.Ghosts.names({ exclude: ['Mimic'] });
      return SugarCube.setup.Posession.rollMimicType(names);
    });
    expect(result).not.toBeNull();
    expect(typeof result).toBe('string');
    expect(result).not.toBe('Mimic');
    expect(await getVar(page, 'lastChangeIntervalMimic')).toBe('0-29');
    expect(await getVar(page, 'currentIntervalMimic')).toBe('0-29');
  });

  test('rollMimicType returns null when interval unchanged', async ({ game: page }) => {
    await setupHunt(page, 'Mimic');
    await setVar(page, 'minutes', 10);
    await setVar(page, 'lastChangeIntervalMimic', '0-29');
    const result = await page.evaluate(() => {
      const names = SugarCube.setup.Ghosts.names({ exclude: ['Mimic'] });
      return SugarCube.setup.Posession.rollMimicType(names);
    });
    expect(result).toBeNull();
    expect(await getVar(page, 'currentIntervalMimic')).toBe('0-29');
  });

  test('rollMimicType distinguishes 0-29 and 30-59 intervals', async ({ game: page }) => {
    await setupHunt(page, 'Mimic');
    await setVar(page, 'minutes', 45);
    await setVar(page, 'lastChangeIntervalMimic', '0-29');
    const result = await page.evaluate(() => {
      const names = SugarCube.setup.Ghosts.names({ exclude: ['Mimic'] });
      return SugarCube.setup.Posession.rollMimicType(names);
    });
    expect(result).not.toBeNull();
    expect(await getVar(page, 'lastChangeIntervalMimic')).toBe('30-59');
  });

  test('rollMimicType updates $hunt.name to the rolled identity', async ({ game: page }) => {
    await setupHunt(page, 'Mimic');
    await setVar(page, 'minutes', 20);
    await page.evaluate(() => { delete SugarCube.State.variables.lastChangeIntervalMimic; });
    const rolled = await page.evaluate(() => {
      const names = SugarCube.setup.Ghosts.names({ exclude: ['Mimic'] });
      return SugarCube.setup.Posession.rollMimicType(names);
    });
    expect(await getVar(page, 'hunt.name')).toBe(rolled);
    // realName stays Mimic
    expect(await getVar(page, 'hunt.realName')).toBe('Mimic');
  });

  test('Mimic passage runs rollMimicType when active mimic hunt', async ({ game: page }) => {
    await setupHunt(page, 'Mimic');
    await setVar(page, 'minutes', 12);
    await page.evaluate(() => { delete SugarCube.State.variables.lastChangeIntervalMimic; });
    await goToPassage(page, 'Mimic');
    expect(await getVar(page, 'lastChangeIntervalMimic')).toBe('0-29');
  });
});

test.describe('Possession — Hot flags', () => {
  test('pantiesState / braState read underlying clothing flags', async ({ game: page }) => {
    await setVar(page, 'pantiesState', 'worn');
    await setVar(page, 'braState', 'not worn');
    expect(await callSetup(page, 'setup.Posession.pantiesState()')).toBe('worn');
    expect(await callSetup(page, 'setup.Posession.braState()')).toBe('not worn');
  });

  test('clearHotFlags zeroes hotAct and addtemptorealhouse', async ({ game: page }) => {
    await setVar(page, 'hotAct', 1);
    await setVar(page, 'addtemptorealhouse', 1);
    await page.evaluate(() => SugarCube.setup.Posession.clearHotFlags());
    expect(await getVar(page, 'hotAct')).toBe(0);
    expect(await getVar(page, 'addtemptorealhouse')).toBe(0);
  });

  test('Hot passage renders cleanly during an active hunt', async ({ game: page }) => {
    await setupHunt(page, 'Shade');
    await goToPassage(page, 'Hot');
    await expectCleanPassage(page);
  });

  test('Hot1 renders cleanly and clears hot flags for each clothing combo', async ({ game: page }) => {
    for (const p of ['worn', 'not worn']) {
      for (const b of ['worn', 'not worn']) {
        await resetGame(page);
        await setupHunt(page, 'Shade');
        await setVar(page, 'hotAct', 1);
        await setVar(page, 'addtemptorealhouse', 1);
        await setVar(page, 'pantiesState', p);
        await setVar(page, 'braState', b);
        await goToPassage(page, 'Hot1');
        await expectCleanPassage(page);
        expect(await getVar(page, 'hotAct')).toBe(0);
        expect(await getVar(page, 'addtemptorealhouse')).toBe(0);
      }
    }
  });
});

test.describe('Possession — location choice', () => {
  test('setLocationChoice and locationChoice round-trip', async ({ game: page }) => {
    await page.evaluate(() => SugarCube.setup.Posession.setLocationChoice('Park'));
    expect(await callSetup(page, 'setup.Posession.locationChoice()')).toBe('Park');
    await page.evaluate(() => SugarCube.setup.Posession.setLocationChoice('Gym'));
    expect(await callSetup(page, 'setup.Posession.locationChoice()')).toBe('Gym');
  });
});

test.describe('Possession — Brooke rescue path', () => {
  test('canPepperSprayBrookeAttacker requires spray + charges', async ({ game: page }) => {
    await setVar(page, 'hasPSpray', 0);
    await setVar(page, 'hasPSprayCharges', 0);
    expect(await callSetup(page, 'setup.Posession.canPepperSprayBrookeAttacker()')).toBe(false);
    await setVar(page, 'hasPSpray', 1);
    await setVar(page, 'hasPSprayCharges', 0);
    expect(await callSetup(page, 'setup.Posession.canPepperSprayBrookeAttacker()')).toBe(false);
    await setVar(page, 'hasPSpray', 1);
    await setVar(page, 'hasPSprayCharges', 2);
    expect(await callSetup(page, 'setup.Posession.canPepperSprayBrookeAttacker()')).toBe(true);
  });

  test('consumePepperSprayCharge decrements charges', async ({ game: page }) => {
    await setVar(page, 'hasPSprayCharges', 3);
    await page.evaluate(() => SugarCube.setup.Posession.consumePepperSprayCharge());
    expect(await getVar(page, 'hasPSprayCharges')).toBe(2);
  });

  test('analIsTrained and analIsVeryLoose thresholds', async ({ game: page }) => {
    await page.evaluate(() => {
      SugarCube.State.variables.sensualBodyPart = {
        brain: 0, tits: 0, ass: 0, bottom: 0,
        mouth: 0, pussy: 0, anal: 2,
      };
    });
    expect(await callSetup(page, 'setup.Posession.analIsTrained()')).toBe(false);
    expect(await callSetup(page, 'setup.Posession.analIsVeryLoose()')).toBe(false);
    await page.evaluate(() => { SugarCube.State.variables.sensualBodyPart.anal = 3; });
    expect(await callSetup(page, 'setup.Posession.analIsTrained()')).toBe(true);
    expect(await callSetup(page, 'setup.Posession.analIsVeryLoose()')).toBe(false);
    await page.evaluate(() => { SugarCube.State.variables.sensualBodyPart.anal = 5; });
    expect(await callSetup(page, 'setup.Posession.analIsVeryLoose()')).toBe(true);
  });

  test('markBrookePossessedInactive sets Brooke back to not active', async ({ game: page }) => {
    await setVar(page, 'isBrookePossessed', 1);
    await page.evaluate(() => SugarCube.setup.Posession.markBrookePossessedInactive());
    expect(await getVar(page, 'isBrookePossessed')).toBe('not active');
  });

  test('skipRandomHours adds 2-6 hours to the clock', async ({ game: page }) => {
    await setVar(page, 'hours', 10);
    await page.evaluate(() => SugarCube.setup.Posession.skipRandomHours());
    const after = await getVar(page, 'hours');
    expect(after).toBeGreaterThanOrEqual(12);
    expect(after).toBeLessThanOrEqual(16);
  });

  test('isBlakeHuntWithCursedItem requires Blake as companion + cursed item', async ({ game: page }) => {
    await setVar(page, 'isCompChosen', 1);
    await setVar(page, 'companion', { name: 'Blake' });
    await setVar(page, 'gotCursedItem', 1);
    expect(await callSetup(page, 'setup.Posession.isBlakeHuntWithCursedItem()')).toBe(true);
    await setVar(page, 'companion', { name: 'Alice' });
    expect(await callSetup(page, 'setup.Posession.isBlakeHuntWithCursedItem()')).toBe(false);
    await setVar(page, 'companion', { name: 'Blake' });
    await setVar(page, 'gotCursedItem', 0);
    expect(await callSetup(page, 'setup.Posession.isBlakeHuntWithCursedItem()')).toBe(false);
  });
});
