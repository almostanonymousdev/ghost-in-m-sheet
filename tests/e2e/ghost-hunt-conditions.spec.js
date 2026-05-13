const { test, expect } = require('../fixtures');
const { setVar, goToPassage, callSetup } = require('../helpers');
const { expectCleanPassage, setupHunt } = require('./e2e-helpers');

test.describe('Ghost hunt conditions', () => {
  test('Shade: hunt triggers only at sanity <= 55', async ({ game: page }) => {
    await setupHunt(page, 'Shade');

    await setVar(page, 'mc.sanity', 60);
    expect(await callSetup(page,
      'setup.Ghosts.getByName("Shade").canProwl(SugarCube.State.variables.mc)')).toBe(false);

    await setVar(page, 'mc.sanity', 55);
    expect(await callSetup(page,
      'setup.Ghosts.getByName("Shade").canProwl(SugarCube.State.variables.mc)')).toBe(true);

    await setVar(page, 'mc.sanity', 20);
    expect(await callSetup(page,
      'setup.Ghosts.getByName("Shade").canProwl(SugarCube.State.variables.mc)')).toBe(true);

    await goToPassage(page, 'HuntRun');
    await expectCleanPassage(page);
  });

  test('Demon: hunt triggers at sanity <= 90 (most aggressive)', async ({ game: page }) => {
    await setupHunt(page, 'Demon');

    await setVar(page, 'mc.sanity', 95);
    expect(await callSetup(page,
      'setup.Ghosts.getByName("Demon").canProwl(SugarCube.State.variables.mc)')).toBe(false);

    await setVar(page, 'mc.sanity', 90);
    expect(await callSetup(page,
      'setup.Ghosts.getByName("Demon").canProwl(SugarCube.State.variables.mc)')).toBe(true);

    await setVar(page, 'mc.sanity', 50);
    expect(await callSetup(page,
      'setup.Ghosts.getByName("Demon").canProwl(SugarCube.State.variables.mc)')).toBe(true);

    await goToPassage(page, 'HuntRun');
    await expectCleanPassage(page);
  });

  test('Spirit: hunt condition requires lust >= 30', async ({ game: page }) => {
    await setupHunt(page, 'Spirit');

    await setVar(page, 'mc.lust', 25);
    expect(await callSetup(page,
      'setup.Ghosts.getByName("Spirit").canProwl(SugarCube.State.variables.mc)')).toBe(false);

    await setVar(page, 'mc.lust', 30);
    expect(await callSetup(page,
      'setup.Ghosts.getByName("Spirit").canProwl(SugarCube.State.variables.mc)')).toBe(true);

    await goToPassage(page, 'HuntRun');
    await expectCleanPassage(page);
  });

  test('Poltergeist: hunt condition requires sanity <= 70', async ({ game: page }) => {
    await setupHunt(page, 'Poltergeist');

    await setVar(page, 'mc.sanity', 75);
    expect(await callSetup(page,
      'setup.Ghosts.getByName("Poltergeist").canProwl(SugarCube.State.variables.mc)')).toBe(false);

    await setVar(page, 'mc.sanity', 70);
    expect(await callSetup(page,
      'setup.Ghosts.getByName("Poltergeist").canProwl(SugarCube.State.variables.mc)')).toBe(true);

    await goToPassage(page, 'HuntRun');
    await expectCleanPassage(page);
  });

  test('Moroi: hunt condition requires sanity <= 70 and has spiritbox evidence', async ({ game: page }) => {
    await setupHunt(page, 'Moroi');

    await setVar(page, 'mc.sanity', 75);
    expect(await callSetup(page,
      'setup.Ghosts.getByName("Moroi").canProwl(SugarCube.State.variables.mc)')).toBe(false);

    await setVar(page, 'mc.sanity', 70);
    expect(await callSetup(page,
      'setup.Ghosts.getByName("Moroi").canProwl(SugarCube.State.variables.mc)')).toBe(true);

    const evidence = await page.evaluate(() => SugarCube.State.variables.hunt.evidence);
    expect(evidence).toContain('spiritbox');

    await goToPassage(page, 'HuntRun');
    await expectCleanPassage(page);
  });

  test('Myling: hunt condition requires lust >= 30', async ({ game: page }) => {
    await setupHunt(page, 'Myling');

    await setVar(page, 'mc.lust', 25);
    expect(await callSetup(page,
      'setup.Ghosts.getByName("Myling").canProwl(SugarCube.State.variables.mc)')).toBe(false);

    await setVar(page, 'mc.lust', 30);
    expect(await callSetup(page,
      'setup.Ghosts.getByName("Myling").canProwl(SugarCube.State.variables.mc)')).toBe(true);

    await goToPassage(page, 'HuntRun');
    await expectCleanPassage(page);
  });

  test('The Twins: hunt condition requires lust >= 30', async ({ game: page }) => {
    await setupHunt(page, 'The Twins');

    await setVar(page, 'mc.lust', 25);
    expect(await callSetup(page,
      'setup.Ghosts.getByName("The Twins").canProwl(SugarCube.State.variables.mc)')).toBe(false);

    await setVar(page, 'mc.lust', 30);
    expect(await callSetup(page,
      'setup.Ghosts.getByName("The Twins").canProwl(SugarCube.State.variables.mc)')).toBe(true);

    await goToPassage(page, 'HuntRun');
    await expectCleanPassage(page);
  });

  test('Wraith: hunt condition requires lust >= 30', async ({ game: page }) => {
    await setupHunt(page, 'Wraith');

    await setVar(page, 'mc.lust', 25);
    expect(await callSetup(page,
      'setup.Ghosts.getByName("Wraith").canProwl(SugarCube.State.variables.mc)')).toBe(false);

    await setVar(page, 'mc.lust', 35);
    expect(await callSetup(page,
      'setup.Ghosts.getByName("Wraith").canProwl(SugarCube.State.variables.mc)')).toBe(true);

    await goToPassage(page, 'HuntRun');
    await expectCleanPassage(page);
  });

  test('Mare: hunt condition requires lust >= 30', async ({ game: page }) => {
    await setupHunt(page, 'Mare');

    await setVar(page, 'mc.lust', 25);
    expect(await callSetup(page,
      'setup.Ghosts.getByName("Mare").canProwl(SugarCube.State.variables.mc)')).toBe(false);

    await setVar(page, 'mc.lust', 30);
    expect(await callSetup(page,
      'setup.Ghosts.getByName("Mare").canProwl(SugarCube.State.variables.mc)')).toBe(true);

    await goToPassage(page, 'HuntRun');
    await expectCleanPassage(page);
  });

  test('Banshee: hunt condition requires lust >= 30', async ({ game: page }) => {
    await setupHunt(page, 'Banshee');

    await setVar(page, 'mc.lust', 25);
    expect(await callSetup(page,
      'setup.Ghosts.getByName("Banshee").canProwl(SugarCube.State.variables.mc)')).toBe(false);

    await setVar(page, 'mc.lust', 30);
    expect(await callSetup(page,
      'setup.Ghosts.getByName("Banshee").canProwl(SugarCube.State.variables.mc)')).toBe(true);

    await goToPassage(page, 'HuntRun');
    await expectCleanPassage(page);
  });

  test('Banshee: Kiss of the Banshee reduces sanity by 10', async ({ game: page }) => {
    await setupHunt(page, 'Banshee');

    const hint = await callSetup(page, 'setup.Ghosts.getByName("Banshee").hint');
    expect(hint).toContain('10');
    expect(hint.toLowerCase()).toContain('sanity');

    await goToPassage(page, 'HuntRun');
    await expectCleanPassage(page);
  });

  test('Cthulion: hunt condition requires sanity <= 70', async ({ game: page }) => {
    await setupHunt(page, 'Cthulion');

    await setVar(page, 'mc.sanity', 75);
    expect(await callSetup(page,
      'setup.Ghosts.getByName("Cthulion").canProwl(SugarCube.State.variables.mc)')).toBe(false);

    await setVar(page, 'mc.sanity', 70);
    expect(await callSetup(page,
      'setup.Ghosts.getByName("Cthulion").canProwl(SugarCube.State.variables.mc)')).toBe(true);

    await goToPassage(page, 'HuntRun');
    await expectCleanPassage(page);
  });

  test('Raiju: hunt condition requires sanity <= 70', async ({ game: page }) => {
    await setupHunt(page, 'Raiju');

    await setVar(page, 'mc.sanity', 75);
    expect(await callSetup(page,
      'setup.Ghosts.getByName("Raiju").canProwl(SugarCube.State.variables.mc)')).toBe(false);

    await setVar(page, 'mc.sanity', 70);
    expect(await callSetup(page,
      'setup.Ghosts.getByName("Raiju").canProwl(SugarCube.State.variables.mc)')).toBe(true);

    await goToPassage(page, 'HuntRun');
    await expectCleanPassage(page);
  });

  test('all ghosts have exactly 3 evidence types', async ({ game: page }) => {
    const ALL_GHOSTS = [
      'Spirit', 'Shade', 'Poltergeist', 'Phantom', 'Goryo', 'Demon',
      'Deogen', 'Jinn', 'Moroi', 'Myling', 'Oni', 'Mimic',
      'The Twins', 'Wraith', 'Mare', 'Cthulion', 'Banshee', 'Raiju',
    ];
    for (const ghostName of ALL_GHOSTS) {
      const ghost = await callSetup(page, `setup.Ghosts.getByName("${ghostName}")`);
      expect(ghost, `Ghost "${ghostName}" not found`).toBeTruthy();
      expect(ghost.evidence, `"${ghostName}" should have 3 evidence types`).toHaveLength(3);
    }
  });

  test('all ghosts have valid hunt conditions', async ({ game: page }) => {
    const ALL_GHOSTS = [
      'Spirit', 'Shade', 'Poltergeist', 'Phantom', 'Goryo', 'Demon',
      'Deogen', 'Jinn', 'Moroi', 'Myling', 'Oni', 'Mimic',
      'The Twins', 'Wraith', 'Mare', 'Cthulion', 'Banshee', 'Raiju',
    ];
    for (const ghostName of ALL_GHOSTS) {
      const result = await page.evaluate((name) => {
        const g = SugarCube.setup.Ghosts.getByName(name);
        if (!g) return null;
        return {
          predicateIsFunction: typeof g.prowlCondition === 'function',
          hasText: typeof g.prowlConditionText === 'string' && g.prowlConditionText.length > 0,
          // Predicates should respond to a full-stats mc and an empty one differently.
          triggersLow: g.canProwl({ sanity: 0,   lust: 100 }),
          triggersHigh: g.canProwl({ sanity: 100, lust: 0 })
        };
      }, ghostName);
      expect(result, `"${ghostName}" not found`).toBeTruthy();
      expect(result.predicateIsFunction, `"${ghostName}" prowlCondition must be a function`).toBe(true);
      expect(result.hasText, `"${ghostName}" missing prowlConditionText`).toBe(true);
      expect(result.triggersLow || result.triggersHigh,
        `"${ghostName}" predicate never returns true`).toBe(true);
    }
  });
});
