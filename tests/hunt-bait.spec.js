const { test, expect } = require('@playwright/test');
const { openGame, resetGame, callSetup, goToPassage, getVar } = require('./helpers');

/* The huntActionBar widget in widgetHauntedHouseRoom.tw renders the
   "Bait ghost" link whenever setup.HauntConditions.canBait() returns
   true. Removing classic hunt left canBait() gated on legacy state
   ($hunt + setup.hauntedPassages) that the new HuntController flow
   never populates, so the bait button vanished mid-hunt. These tests
   pin the new gating contract: bait is available whenever the
   HuntController-driven hunt is active on HuntRun and the MC has the
   energy to spend. */
test.describe('HauntConditions bait', () => {
  let page;

  test.beforeAll(async ({ browser }) => {
    page = await openGame(browser);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test.beforeEach(async () => {
    await resetGame(page);
    await page.waitForFunction(() => SugarCube.State.variables.mc != null);
  });

  test('canBait() is true once a hunt is active on HuntRun', async () => {
    expect(await callSetup(page, 'setup.HauntConditions.canBait()')).toBe(false);

    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1 }));
    await goToPassage(page, 'HuntRun');

    expect(await callSetup(page, 'setup.HuntController.isHuntActive()')).toBe(true);
    expect(await callSetup(page, 'setup.HauntConditions.canBait()')).toBe(true);
  });

  test('canBait() is false when the MC is out of energy', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1 }));
    await goToPassage(page, 'HuntRun');
    await page.evaluate(() => { SugarCube.State.variables.mc.energy = 0; });

    expect(await callSetup(page, 'setup.HauntConditions.canBait()')).toBe(false);
  });

  test('BaitOrgasm preserves $return so "Pull yourself up" exits the loop', async () => {
    /* Regression: BaitOrgasm was missing the noreturn tag, so the
       :passagestart $return tracker stamped "BaitOrgasm" into $return
       — and the "Pull yourself up|$return" link just re-entered the
       same passage forever. */
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1 }));
    await goToPassage(page, 'HuntRun');

    const huntRunReturn = await getVar(page, 'return');
    expect(huntRunReturn).toBe('HuntRun');

    await goToPassage(page, 'BaitOrgasm');

    expect(await getVar(page, 'return')).toBe('HuntRun');
  });

  test('consumeBaitOrgasm() seeds the aftershock cooldown so the HUD chip lands', async () => {
    /* Regression: the bait orgasm path zeroed lust + bled sanity but
       never called setOrgasmCooldown, so after a bait-triggered orgasm
       the Aftershock contributor chip never appeared in the hunt HUD —
       even though the equivalent widgetEvent.tw orgasm trigger always
       seeds a 3-step window. The bait flow now seeds the same window so
       both orgasm paths produce identical aftershock UI. */
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1 }));
    await goToPassage(page, 'HuntRun');

    expect(await getVar(page, 'orgasmCooldownSteps')).toBe(0);

    await page.evaluate(() => {
      SugarCube.State.variables.mc.lust = 100;
      SugarCube.State.variables.baitOrgasmPending = 1;
    });
    expect(await callSetup(page, 'setup.HauntConditions.consumeBaitOrgasm()')).toBe(true);

    expect(await getVar(page, 'orgasmCooldownSteps')).toBeGreaterThan(0);
    const contributors = await callSetup(page, 'setup.HauntConditions.snapshot().contributors');
    const labels = contributors.map(c => c.label);
    expect(labels.some(l => l.startsWith('Aftershock'))).toBe(true);
  });

  test('startBait() pins the ghost to the player\'s current room', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1 }));
    await goToPassage(page, 'HuntRun');

    // Walk into a non-hallway room so we can verify the snap.
    const targetRoom = await page.evaluate(() => {
      const rooms = SugarCube.State.variables.run.floorplan.rooms;
      const nonHallway = rooms.find(r => r.id !== 'room_0');
      SugarCube.setup.HuntController.setCurrentRoom(nonHallway.id);
      return nonHallway.id;
    });
    // Force the ghost to start somewhere else.
    await page.evaluate(() => {
      const fp = SugarCube.State.variables.run.floorplan;
      const other = fp.rooms.find(r => r.id !== SugarCube.setup.HuntController.currentRoomId());
      fp.spawnRoomId = other.id;
    });

    expect(await callSetup(page, 'setup.HuntController.isGhostHere()')).toBe(false);
    expect(await callSetup(page, 'setup.HauntConditions.startBait()')).toBe(true);
    expect(await page.evaluate(
      () => SugarCube.State.variables.run.floorplan.spawnRoomId
    )).toBe(targetRoom);
    expect(await callSetup(page, 'setup.HuntController.isGhostHere()')).toBe(true);
    expect(await callSetup(page, 'setup.HauntConditions.snapshot().baitActive')).toBe(true);
  });
});
