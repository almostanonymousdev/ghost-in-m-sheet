const { test, expect } = require('@playwright/test');
const { openGame, resetGame, setVar, getVar, goToPassage } = require('../helpers');
const { expectCleanPassage, setupHunt } = require('./e2e-helpers');

test.describe('Ghost abilities — Oni, Raiju, Mimic', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  // ── Oni ────────────────────────────────────────────────────────

  test('Oni: sanity drain is 3-8 (faster than normal 1-5)', async () => {
    await setupHunt(page, 'Oni');
    await goToPassage(page, 'OwaissaKitchen');
    await expectCleanPassage(page);

    const drains = [];
    for (let i = 0; i < 30; i++) {
      await goToPassage(page, 'eventMC');
      drains.push(await getVar(page, 'ghostSanityEventDecreased'));
    }

    for (const d of drains) {
      expect(d).toBeGreaterThanOrEqual(3);
      expect(d).toBeLessThanOrEqual(8);
    }
    expect(new Set(drains).size).toBeGreaterThan(1);
  });

  test('Oni: non-Oni ghost drains sanity at 1-5 (control test)', async () => {
    await setupHunt(page, 'Spirit');

    const drains = [];
    for (let i = 0; i < 30; i++) {
      await goToPassage(page, 'eventMC');
      drains.push(await getVar(page, 'ghostSanityEventDecreased'));
    }

    for (const d of drains) {
      expect(d).toBeGreaterThanOrEqual(1);
      expect(d).toBeLessThanOrEqual(5);
    }
  });

  // ── Raiju ──────────────────────────────────────────────────────

  test('Raiju: EMF readings can glitch to random values', async () => {
    await setupHunt(page, 'Raiju');
    await setVar(page, 'EmfActivated', 1);
    await setVar(page, 'EmfActivationTime', 0);
    await setVar(page, 'equipment.emf', 3);

    const readings = [];
    for (let i = 0; i < 30; i++) {
      await goToPassage(page, 'EMFcheck');
      const num = parseInt(await page.locator('.passage').textContent(), 10);
      if (!isNaN(num)) readings.push(num);
    }

    expect(readings.some(r => r !== 5), 'Raiju never glitched EMF').toBe(true);
    expect(readings.some(r => r === 5), 'Normal EMF (5) never appeared').toBe(true);
  });

  test('Raiju: non-Raiju ghost always shows EMF 5 for emf evidence', async () => {
    await setupHunt(page, 'Spirit');
    await setVar(page, 'EmfActivated', 1);
    await setVar(page, 'EmfActivationTime', 0);
    await setVar(page, 'equipment.emf', 3);

    for (let i = 0; i < 10; i++) {
      await goToPassage(page, 'EMFcheck');
      const num = parseInt(await page.locator('.passage').textContent(), 10);
      if (!isNaN(num)) expect(num).toBe(5);
    }
  });

  test('Raiju: temperature readings can glitch', async () => {
    test.setTimeout(15_000);
    await setupHunt(page, 'Raiju');

    await page.evaluate(() => {
      SugarCube.State.variables.ghostRoom = { name: 'kitchen' };
    });
    await setVar(page, 'equipment.temperature', 3);
    await setVar(page, 'temperature', 0);

    const readings = [];
    for (let i = 0; i < 40; i++) {
      await goToPassage(page, 'OwaissaKitchen');
      await goToPassage(page, 'temperatureHigh');
      const num = parseInt(await page.locator('.passage').textContent(), 10);
      if (!isNaN(num)) readings.push(num);
    }

    const hasGlitch = readings.some(r => r < 18 || r > 21);
    expect(hasGlitch, 'Raiju never glitched temperature').toBe(true);
  });

  // ── Mimic ──────────────────────────────────────────────────────

  test('Mimic: saveMimic flag is set when entering house', async () => {
    await setupHunt(page, 'Mimic');

    expect(await page.evaluate(() =>
      SugarCube.State.variables.ghost.name === 'Mimic'
    )).toBe(true);

    await setVar(page, 'saveMimic', 1);
    expect(await getVar(page, 'saveMimic')).toBe(1);

    await goToPassage(page, 'OwaissaHallway');
    await expectCleanPassage(page);
  });

  test('Mimic: disguise changes at 30-minute intervals', async () => {
    await setupHunt(page, 'Mimic');
    await setVar(page, 'saveMimic', '1');
    await setVar(page, 'lastChangeIntervalMimic', ' ');

    await setVar(page, 'minutes', 10);
    await goToPassage(page, 'Mimic');
    expect(await getVar(page, 'lastChangeIntervalMimic')).toBe('0-29');
    expect(await getVar(page, 'ghost.name')).toBeTruthy();

    await setVar(page, 'minutes', 35);
    await goToPassage(page, 'Mimic');
    expect(await getVar(page, 'lastChangeIntervalMimic')).toBe('30-59');
  });

  test('Mimic: extra ectoplasm evidence check', async () => {
    await setupHunt(page, 'Mimic');
    await setVar(page, 'saveMimic', 1);

    const evidence = await getVar(page, 'ghost.evidence');
    expect(evidence).toContain('spiritbox');
    expect(evidence).toContain('temperature');
    expect(evidence).toContain('uvl');
    expect(await getVar(page, 'saveMimic')).toBe(1);

    await goToPassage(page, 'OwaissaKitchen');
    await expectCleanPassage(page);
  });
});
