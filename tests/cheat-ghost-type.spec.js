const { test, expect } = require('@playwright/test');
const { openGame, resetGame, callSetup, getVar } = require('./helpers');

/* The Settings/Cheats dialog exposes a "Force ghost type" list (see
   GuiController.cheatGhostType). When the player picks a name, the
   onChange handler calls setup.Ghosts.cheatForceHuntGhost(ghost), which
   rewrites $run.ghostName / $run.disguiseName / $run.evidence so the
   active hunt now reads as the chosen catalogue entry. */
test.describe('cheatGhostType — forceHuntGhost', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });

  test.beforeEach(async () => {
    await resetGame(page);
    await page.evaluate(() => {
      if (SugarCube.setup.HuntController.isActive()) {
        SugarCube.setup.HuntController.end();
      }
      SugarCube.State.variables.huntMode = 0;
      SugarCube.State.variables.run = null;
    });
  });

  test('list of selectable ghosts matches the catalogue', async () => {
    const names = await callSetup(page, 'setup.Ghosts.list().map(function(g){return g.name;})');
    expect(names).toContain('Shade');
    expect(names).toContain('Banshee');
    expect(names).toContain('Mimic');
    expect(names.length).toBe(18);
  });

  test('no-op when no hunt is active', async () => {
    expect(await getVar(page, 'run')).toBeNull();
    await page.evaluate(() => {
      const g = SugarCube.setup.Ghosts.getByName('Banshee');
      SugarCube.setup.Ghosts.cheatForceHuntGhost(g);
    });
    expect(await getVar(page, 'run')).toBeNull();
  });

  /* Regression: during a hunt run the active ghost is sourced from
     $run.ghostName. The cheat must rewrite the $run fields (ghostName,
     disguiseName, evidence) so setup.Ghosts.active() /
     HuntController.ghostName() / runEvidence() all repoint at the
     newly-chosen catalogue entry. */
  test('hunt run: rewrites $run.ghostName, evidence, and active()', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 42 }));

    const initialName = await callSetup(page, 'setup.HuntController.ghostName()');
    expect(typeof initialName).toBe('string');
    const target = initialName === 'Banshee' ? 'Shade' : 'Banshee';

    await page.evaluate((name) => {
      const g = SugarCube.setup.Ghosts.getByName(name);
      SugarCube.setup.Ghosts.cheatForceHuntGhost(g);
    }, target);

    expect(await callSetup(page, 'setup.HuntController.ghostName()')).toBe(target);
    expect(await callSetup(page, 'setup.Ghosts.active().name')).toBe(target);

    const runEv = await callSetup(page, 'setup.HuntController.runEvidence()');
    const expected = await page.evaluate((name) =>
      SugarCube.setup.Ghosts.getByName(name).evidence.map(e => e.id), target);
    expect(runEv.slice().sort()).toEqual(expected.slice().sort());

    expect(await getVar(page, 'run.ghostName')).toBe(target);
    expect(await getVar(page, 'run.disguiseName')).toBe(target);
  });

  /* End-to-end through the settings onChange path: invoking the same
     handler the SugarCube Setting list calls should propagate the cheat
     all the way to setup.Ghosts.active(). Mirrors the body of the
     onChange registered in GuiController.cheatGhostType. */
  test('settings.cheatGhostType onChange path applies the override during a hunt', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 7 }));
    const initialName = await callSetup(page, 'setup.HuntController.ghostName()');
    const target = initialName === 'Mimic' ? 'Phantom' : 'Mimic';

    await page.evaluate((name) => {
      SugarCube.settings.cheatGhostType = name;
      // Mirror the body of GuiController's onChange handler. If this test
      // diverges from that handler, update both — they share the same
      // contract.
      if (name === '—') return;
      if (!SugarCube.setup.Ghosts.isAnyMode()) return;
      const ghost = SugarCube.setup.Ghosts.list().filter(g => g.name === name)[0];
      if (ghost) SugarCube.setup.Ghosts.cheatForceHuntGhost(ghost);
    }, target);

    expect(await callSetup(page, 'setup.Ghosts.active().name')).toBe(target);
    expect(await callSetup(page, 'setup.HuntController.ghostName()')).toBe(target);
  });
});
