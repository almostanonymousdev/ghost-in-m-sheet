const { test, expect } = require('@playwright/test');
const { openGame, resetGame, setVar, goToPassage, callSetup } = require('../helpers');
const { expectCleanPassage, setupHunt } = require('./e2e-helpers');

test.describe('Ghost hunt conditions', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  test('Shade: hunt triggers only at sanity <= 35', async () => {
    await setupHunt(page, 'Shade');

    await setVar(page, 'mc.sanity', 40);
    expect(await callSetup(page,
      'setup.Ghosts.getByName("Shade").canHunt(SugarCube.State.variables.mc)')).toBe(false);

    await setVar(page, 'mc.sanity', 35);
    expect(await callSetup(page,
      'setup.Ghosts.getByName("Shade").canHunt(SugarCube.State.variables.mc)')).toBe(true);

    await setVar(page, 'mc.sanity', 20);
    expect(await callSetup(page,
      'setup.Ghosts.getByName("Shade").canHunt(SugarCube.State.variables.mc)')).toBe(true);

    await goToPassage(page, 'OwaissaHallway');
    await expectCleanPassage(page);
  });

  test('Demon: hunt triggers at sanity <= 70 (more aggressive)', async () => {
    await setupHunt(page, 'Demon');

    await setVar(page, 'mc.sanity', 75);
    expect(await callSetup(page,
      'setup.Ghosts.getByName("Demon").canHunt(SugarCube.State.variables.mc)')).toBe(false);

    await setVar(page, 'mc.sanity', 70);
    expect(await callSetup(page,
      'setup.Ghosts.getByName("Demon").canHunt(SugarCube.State.variables.mc)')).toBe(true);

    await setVar(page, 'mc.sanity', 50);
    expect(await callSetup(page,
      'setup.Ghosts.getByName("Demon").canHunt(SugarCube.State.variables.mc)')).toBe(true);

    await goToPassage(page, 'OwaissaKitchen');
    await expectCleanPassage(page);
  });

  test('Spirit: hunt condition requires lust >= 50', async () => {
    await setupHunt(page, 'Spirit');

    await setVar(page, 'mc.lust', 40);
    expect(await callSetup(page,
      'setup.Ghosts.getByName("Spirit").canHunt(SugarCube.State.variables.mc)')).toBe(false);

    await setVar(page, 'mc.lust', 50);
    expect(await callSetup(page,
      'setup.Ghosts.getByName("Spirit").canHunt(SugarCube.State.variables.mc)')).toBe(true);

    await goToPassage(page, 'OwaissaHallway');
    await expectCleanPassage(page);
  });

  test('Poltergeist: hunt condition requires sanity <= 50', async () => {
    await setupHunt(page, 'Poltergeist');

    await setVar(page, 'mc.sanity', 55);
    expect(await callSetup(page,
      'setup.Ghosts.getByName("Poltergeist").canHunt(SugarCube.State.variables.mc)')).toBe(false);

    await setVar(page, 'mc.sanity', 50);
    expect(await callSetup(page,
      'setup.Ghosts.getByName("Poltergeist").canHunt(SugarCube.State.variables.mc)')).toBe(true);

    await goToPassage(page, 'OwaissaBathroom');
    await expectCleanPassage(page);
  });

  test('Moroi: hunt condition requires sanity <= 50 and has spiritbox evidence', async () => {
    await setupHunt(page, 'Moroi');

    await setVar(page, 'mc.sanity', 55);
    expect(await callSetup(page,
      'setup.Ghosts.getByName("Moroi").canHunt(SugarCube.State.variables.mc)')).toBe(false);

    await setVar(page, 'mc.sanity', 50);
    expect(await callSetup(page,
      'setup.Ghosts.getByName("Moroi").canHunt(SugarCube.State.variables.mc)')).toBe(true);

    const evidence = await page.evaluate(() => SugarCube.State.variables.ghostEvidence);
    expect(evidence).toContain('spiritbox');

    await goToPassage(page, 'OwaissaLivingroom');
    await expectCleanPassage(page);
  });

  test('Myling: hunt condition requires lust >= 50', async () => {
    await setupHunt(page, 'Myling');

    await setVar(page, 'mc.lust', 45);
    expect(await callSetup(page,
      'setup.Ghosts.getByName("Myling").canHunt(SugarCube.State.variables.mc)')).toBe(false);

    await setVar(page, 'mc.lust', 50);
    expect(await callSetup(page,
      'setup.Ghosts.getByName("Myling").canHunt(SugarCube.State.variables.mc)')).toBe(true);

    await goToPassage(page, 'OwaissaBedroom');
    await expectCleanPassage(page);
  });

  test('The Twins: hunt condition requires lust >= 50', async () => {
    await setupHunt(page, 'The Twins');

    await setVar(page, 'mc.lust', 45);
    expect(await callSetup(page,
      'setup.Ghosts.getByName("The Twins").canHunt(SugarCube.State.variables.mc)')).toBe(false);

    await setVar(page, 'mc.lust', 50);
    expect(await callSetup(page,
      'setup.Ghosts.getByName("The Twins").canHunt(SugarCube.State.variables.mc)')).toBe(true);

    await goToPassage(page, 'OwaissaKitchen');
    await expectCleanPassage(page);
  });

  test('Wraith: hunt condition requires lust >= 50', async () => {
    await setupHunt(page, 'Wraith');

    await setVar(page, 'mc.lust', 45);
    expect(await callSetup(page,
      'setup.Ghosts.getByName("Wraith").canHunt(SugarCube.State.variables.mc)')).toBe(false);

    await setVar(page, 'mc.lust', 55);
    expect(await callSetup(page,
      'setup.Ghosts.getByName("Wraith").canHunt(SugarCube.State.variables.mc)')).toBe(true);

    await goToPassage(page, 'OwaissaLivingroom');
    await expectCleanPassage(page);
  });

  test('Mare: hunt condition requires lust >= 50', async () => {
    await setupHunt(page, 'Mare');

    await setVar(page, 'mc.lust', 45);
    expect(await callSetup(page,
      'setup.Ghosts.getByName("Mare").canHunt(SugarCube.State.variables.mc)')).toBe(false);

    await setVar(page, 'mc.lust', 50);
    expect(await callSetup(page,
      'setup.Ghosts.getByName("Mare").canHunt(SugarCube.State.variables.mc)')).toBe(true);

    await goToPassage(page, 'OwaissaHallway');
    await expectCleanPassage(page);
  });

  test('Banshee: hunt condition requires lust >= 50', async () => {
    await setupHunt(page, 'Banshee');

    await setVar(page, 'mc.lust', 45);
    expect(await callSetup(page,
      'setup.Ghosts.getByName("Banshee").canHunt(SugarCube.State.variables.mc)')).toBe(false);

    await setVar(page, 'mc.lust', 50);
    expect(await callSetup(page,
      'setup.Ghosts.getByName("Banshee").canHunt(SugarCube.State.variables.mc)')).toBe(true);

    await goToPassage(page, 'OwaissaHallway');
    await expectCleanPassage(page);
  });

  test('Banshee: Kiss of the Banshee reduces sanity by 10', async () => {
    await setupHunt(page, 'Banshee');

    const hint = await callSetup(page, 'setup.Ghosts.getByName("Banshee").hint');
    expect(hint).toContain('10');
    expect(hint.toLowerCase()).toContain('sanity');

    await goToPassage(page, 'OwaissaBedroom');
    await expectCleanPassage(page);
  });

  test('Cthulion: hunt condition requires sanity <= 50', async () => {
    await setupHunt(page, 'Cthulion');

    await setVar(page, 'mc.sanity', 55);
    expect(await callSetup(page,
      'setup.Ghosts.getByName("Cthulion").canHunt(SugarCube.State.variables.mc)')).toBe(false);

    await setVar(page, 'mc.sanity', 50);
    expect(await callSetup(page,
      'setup.Ghosts.getByName("Cthulion").canHunt(SugarCube.State.variables.mc)')).toBe(true);

    await goToPassage(page, 'OwaissaBedroom');
    await expectCleanPassage(page);
  });

  test('Raiju: hunt condition requires sanity <= 50', async () => {
    await setupHunt(page, 'Raiju');

    await setVar(page, 'mc.sanity', 55);
    expect(await callSetup(page,
      'setup.Ghosts.getByName("Raiju").canHunt(SugarCube.State.variables.mc)')).toBe(false);

    await setVar(page, 'mc.sanity', 50);
    expect(await callSetup(page,
      'setup.Ghosts.getByName("Raiju").canHunt(SugarCube.State.variables.mc)')).toBe(true);

    await goToPassage(page, 'OwaissaHallway');
    await expectCleanPassage(page);
  });

  test('all ghosts have exactly 3 evidence types', async () => {
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

  test('all ghosts have valid hunt conditions', async () => {
    const ALL_GHOSTS = [
      'Spirit', 'Shade', 'Poltergeist', 'Phantom', 'Goryo', 'Demon',
      'Deogen', 'Jinn', 'Moroi', 'Myling', 'Oni', 'Mimic',
      'The Twins', 'Wraith', 'Mare', 'Cthulion', 'Banshee', 'Raiju',
    ];
    for (const ghostName of ALL_GHOSTS) {
      const ghost = await callSetup(page, `setup.Ghosts.getByName("${ghostName}")`);
      expect(ghost.huntCondition, `"${ghostName}" missing huntCondition`).toBeTruthy();
      expect(['sanity', 'lust']).toContain(ghost.huntCondition.stat);
      expect(['lte', 'gte']).toContain(ghost.huntCondition.op);
      expect(ghost.huntCondition.value).toBeGreaterThan(0);
    }
  });
});
