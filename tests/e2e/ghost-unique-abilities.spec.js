const { test, expect } = require('@playwright/test');
const { openGame, resetGame, setVar, getVar, goToPassage } = require('../helpers');
const { expectCleanPassage, expectNoErrors, setupHunt } = require('./e2e-helpers');

test.describe('Ghost unique abilities — Phantom, Goryo, Deogen, Jinn', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  // ── Phantom ────────────────────────────────────────────────────

  test('Phantom: lights cannot be turned off', async () => {
    await setupHunt(page, 'Phantom');
    await goToPassage(page, 'OwaissaHallway');
    await expectCleanPassage(page);

    await setVar(page, 'hallway.background', 1);

    for (let i = 0; i < 20; i++) {
      await goToPassage(page, 'LightPassageGhost');
      const bg = await getVar(page, 'hallway.background');
      expect(bg, 'Phantom turned off lights on iteration ' + i).toBe(1);
    }

    await goToPassage(page, 'OwaissaHallway');
    await expectCleanPassage(page);
  });

  test('Phantom: non-Phantom ghost CAN turn off lights (control test)', async () => {
    await setupHunt(page, 'Spirit');
    await goToPassage(page, 'OwaissaHallway');

    const canTurnOff = await page.evaluate(() =>
      SugarCube.State.variables.ghost.name !== 'Phantom'
    );
    expect(canTurnOff).toBe(true);
    await expectCleanPassage(page);
  });

  // ── Goryo ──────────────────────────────────────────────────────

  test('Goryo: ghost room never changes', async () => {
    await setupHunt(page, 'Goryo');
    const initialRoom = await getVar(page, 'ghostRoom.name');

    for (const min of [5, 25, 45]) {
      await setVar(page, 'minutes', min);
      await setVar(page, 'lastChangeIntervalRoom', '');
      await goToPassage(page, 'ChangeGhostRoom');

      const room = await getVar(page, 'ghostRoom.name');
      expect(room, `Goryo room changed at minute ${min}`).toBe(initialRoom);
    }

    await goToPassage(page, 'OwaissaHallway');
    await expectCleanPassage(page);
  });

  test('Goryo: non-Goryo ghost CAN change rooms (control test)', async () => {
    await setupHunt(page, 'Spirit');

    const canChangeRoom = await page.evaluate(() => {
      const V = SugarCube.State.variables;
      return V.ghost.name !== 'Goryo' && V.ghostIsTrapped !== 1;
    });
    expect(canChangeRoom).toBe(true);
  });

  // ── Deogen ─────────────────────────────────────────────────────

  test('Deogen: hiding always fails', async () => {
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

  test('Deogen: running always succeeds', async () => {
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

  test('Deogen: cursed hunt catches hidden players', async () => {
    await setupHunt(page, 'Deogen');

    const deogenCatchesHidden = await page.evaluate(() => {
      const isDeogen = SugarCube.State.variables.ghost.name === 'Deogen';
      return isDeogen === true; // isDeogen === isHidden
    });
    expect(deogenCatchesHidden).toBe(true);

    const deogenMissesNotHidden = await page.evaluate(() => {
      const isDeogen = SugarCube.State.variables.ghost.name === 'Deogen';
      return isDeogen === false; // isDeogen === isHidden
    });
    expect(deogenMissesNotHidden).toBe(false);
  });

  // ── Jinn ───────────────────────────────────────────────────────

  test('Jinn: running always fails', async () => {
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

  test('Jinn: hiding always succeeds', async () => {
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
