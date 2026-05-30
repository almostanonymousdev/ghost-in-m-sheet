const { test, expect } = require('../fixtures');
const { setVar, getVar, goToPassage } = require('../helpers');
const { expectCleanPassage, expectNoErrors, setupHunt } = require('./e2e-helpers');

test.describe('Ghost unique abilities — Phantom, Goryo, Deogen, Jinn', () => {
  // Playwright's per-test `{ timeout }` details arg is NOT honored
  // (TestDetails only accepts tag/annotation). Set the budget here instead.
  test.describe.configure({ timeout: 20_000 });
  // ── Phantom ────────────────────────────────────────────────────

  test('Phantom: lights cannot be turned off', async ({ game: page }) => {
    await setupHunt(page, 'Phantom');
    await goToPassage(page, 'HuntRun');
    await expectCleanPassage(page);

    await setVar(page, 'hallway.background', 1);

    for (let i = 0; i < 20; i++) {
      const dest = await page.evaluate(() =>
        SugarCube.setup.Events.maybeTurnOffLights()
      );
      expect(dest, 'Phantom triggered lights-off on iteration ' + i).toBeNull();
      const bg = await getVar(page, 'hallway.background');
      expect(bg, 'Phantom turned off lights on iteration ' + i).toBe(1);
    }

    await goToPassage(page, 'HuntRun');
    await expectCleanPassage(page);
  });

  test('Phantom: non-Phantom ghost CAN turn off lights (control test)', async ({ game: page }) => {
    await setupHunt(page, 'Spirit');
    await goToPassage(page, 'HuntRun');

    const canTurnOff = await page.evaluate(() =>
      SugarCube.State.variables.run.disguiseName !== 'Phantom'
    );
    expect(canTurnOff).toBe(true);
    await expectCleanPassage(page);
  });

  test('non-Phantom ghost turns off lights in a procedural hunt room', async ({ game: page }) => {
    // Regression: maybeTurnOffLights only flipped static-house room
    // background flags; procedural hunts (HuntRun + $run.lights)
    // never had their lights turned off, so EMF-via-darkness never
    // fired during a procedural run.
    await page.evaluate(() => {
      SugarCube.setup.HuntController.startHunt({ seed: 1 });
      SugarCube.setup.HuntController.setField('ghostName', 'Spirit');
      SugarCube.setup.HuntController.setField('disguiseName', 'Spirit');
      SugarCube.setup.HuntController.cheatSetHuntMode(SugarCube.setup.HuntController.HuntMode.ACTIVE);
    });
    await goToPassage(page, 'HuntRun');
    await page.evaluate(() => {
      var HC = SugarCube.setup.HuntController;
      HC.setRoomLight(HC.currentRoomId(), SugarCube.setup.RoomLight.LIT);
      // Force the 1-in-65 random gate to fire deterministically.
      Math.random = () => 0;
    });
    const dest = await page.evaluate(() =>
      SugarCube.setup.Events.maybeTurnOffLights()
    );
    expect(dest).toBe('HuntRun');
    const dark = await page.evaluate(() =>
      SugarCube.setup.HuntController.isCurrentRoomDark()
    );
    expect(dark).toBe(true);
  });

  // ── Goryo ──────────────────────────────────────────────────────

  test('Goryo: ghost room never changes', async ({ game: page }) => {
    await setupHunt(page, 'Goryo');
    const getRoom = () => page.evaluate(() =>
      SugarCube.setup.HuntController.ghostRoomLabel()
    );
    const initialRoom = await getRoom();

    for (const min of [5, 25, 45]) {
      await setVar(page, 'minutes', min);
      // Park the drift deadline well in the past so the gate would
      // otherwise let a non-Goryo ghost drift; Goryo's
      // staysInOneRoom must still block the shuffle.
      await setVar(page, 'nextDriftAtMinute', 0);
      await goToPassage(page, 'ChangeGhostRoom');

      const room = await getRoom();
      expect(room, `Goryo room changed at minute ${min}`).toBe(initialRoom);
    }

    await goToPassage(page, 'HuntRun');
    await expectCleanPassage(page);
  });

  test('Goryo: non-Goryo ghost CAN change rooms (control test)', async ({ game: page }) => {
    await setupHunt(page, 'Spirit');

    const canChangeRoom = await page.evaluate(() => {
      const run = SugarCube.State.variables.run;
      return !!run && run.disguiseName !== 'Goryo' && !run.trapped;
    });
    expect(canChangeRoom).toBe(true);
  });

  // ── Deogen ─────────────────────────────────────────────────────

  test('Deogen: hiding always fails', async ({ game: page }) => {
    test.setTimeout(10_000);
    await setupHunt(page, 'Deogen');
    await setVar(page, 'mc.corruption', 10);
    await setVar(page, 'crucifixAmount', 1);
    await setVar(page, 'return', 'OwaissaHallway');

    await goToPassage(page, 'Hide');
    await expectCleanPassage(page);

    await page.locator('.passage .usebtn').first().click();

    await page.waitForFunction(() => {
      const text = document.querySelector('.passage').textContent;
      return text.includes('fatal mistake') || text.includes('you got lucky');
    });

    const text = await page.locator('.passage').textContent();
    expect(text).toContain('fatal mistake');
    expect(text).not.toContain('you got lucky');
    await expectNoErrors(page);
  });

  test('Deogen: running always succeeds', async ({ game: page }) => {
    test.setTimeout(10_000);
    await setupHunt(page, 'Deogen');
    await setVar(page, 'crucifixAmount', 1);
    await setVar(page, 'return', 'OwaissaHallway');

    await goToPassage(page, 'RunFast');
    await expectCleanPassage(page);

    await page.locator('.passage .usebtn').first().click();

    await page.waitForFunction(() => {
      const text = document.querySelector('.passage').textContent;
      return text.includes('ghost has disappeared') || text.includes('freezes with terror');
    });

    const text = await page.locator('.passage').textContent();
    expect(text).toContain('ghost has disappeared');
    expect(text).not.toContain('freezes with terror');
    await expectNoErrors(page);
  });

  test('Deogen: cursed hunt catches hidden players', async ({ game: page }) => {
    await setupHunt(page, 'Deogen');

    const deogenCatchesHidden = await page.evaluate(() => {
      const isDeogen = SugarCube.State.variables.run.disguiseName === 'Deogen';
      return isDeogen === true; // isDeogen === isHidden
    });
    expect(deogenCatchesHidden).toBe(true);

    const deogenMissesNotHidden = await page.evaluate(() => {
      const isDeogen = SugarCube.State.variables.run.disguiseName === 'Deogen';
      return isDeogen === false; // isDeogen === isHidden
    });
    expect(deogenMissesNotHidden).toBe(false);
  });

  // ── Jinn ───────────────────────────────────────────────────────

  test('Jinn: running always fails', async ({ game: page }) => {
    test.setTimeout(10_000);
    await setupHunt(page, 'Jinn');
    await setVar(page, 'mc.corruption', 10);
    await setVar(page, 'crucifixAmount', 1);
    await setVar(page, 'return', 'OwaissaHallway');

    await goToPassage(page, 'RunFast');
    await expectCleanPassage(page);

    await page.locator('.passage .usebtn').first().click();

    await page.waitForFunction(() => {
      const text = document.querySelector('.passage').textContent;
      return text.includes('freezes with terror') || text.includes('ghost has disappeared');
    });

    const text = await page.locator('.passage').textContent();
    expect(text).toContain('freezes with terror');
    expect(text).not.toContain('ghost has disappeared');
    await expectNoErrors(page);
  });

  test('Jinn: hiding always succeeds', async ({ game: page }) => {
    test.setTimeout(10_000);
    await setupHunt(page, 'Jinn');
    await setVar(page, 'crucifixAmount', 1);
    await setVar(page, 'return', 'OwaissaHallway');

    await goToPassage(page, 'Hide');
    await expectCleanPassage(page);

    await page.locator('.passage .usebtn').first().click();

    await page.waitForFunction(() => {
      const text = document.querySelector('.passage').textContent;
      return text.includes('you got lucky') || text.includes('fatal mistake');
    });

    const text = await page.locator('.passage').textContent();
    expect(text).toContain('you got lucky');
    expect(text).not.toContain('fatal mistake');
    await expectNoErrors(page);
  });
});
