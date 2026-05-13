const { test, expect } = require('../fixtures');
const { setVar, getVar, callSetup, goToPassage, seedRandom } = require('../helpers');
const { expectCleanPassage, setupHunt } = require('./e2e-helpers');

test.describe('Ghost abilities — Oni, Raiju, Mimic', () => {
  // Every test here does a loop of 20-40 goToPassage calls to sample ghost
  // ability RNG. A single cold navigation can take 100-400ms under parallel
  // worker load, so the cumulative budget must cover the full loop.
  // NB: Playwright's per-test `{ timeout }` details arg is NOT honored
  // (TestDetails only accepts tag/annotation). Set the budget here instead.
  // Each sampling test seeds Math.random via seedRandom so the sequence is
  // deterministic — no `retries` needed.
  test.describe.configure({ timeout: 90_000 });
  // ── Oni ────────────────────────────────────────────────────────

  test('Oni: sanity drain is 3-8 (faster than normal 1-5)', async ({ game: page }) => {
    await setupHunt(page, 'Oni');
    await goToPassage(page, 'HuntRun');
    await expectCleanPassage(page);
    await seedRandom(page, 0xA1);

    const drains = [];
    for (let i = 0; i < 30; i++) {
      await goToPassage(page, 'EventMC');
      drains.push(await getVar(page, 'ghostSanityEventDecreased'));
    }

    for (const d of drains) {
      expect(d).toBeGreaterThanOrEqual(3);
      expect(d).toBeLessThanOrEqual(8);
    }
    expect(new Set(drains).size).toBeGreaterThan(1);
  });

  test('Oni: non-Oni ghost drains sanity at 1-5 (control test)', async ({ game: page }) => {
    await setupHunt(page, 'Spirit');
    await seedRandom(page, 0xA2);

    const drains = [];
    for (let i = 0; i < 30; i++) {
      await goToPassage(page, 'EventMC');
      drains.push(await getVar(page, 'ghostSanityEventDecreased'));
    }

    for (const d of drains) {
      expect(d).toBeGreaterThanOrEqual(1);
      expect(d).toBeLessThanOrEqual(5);
    }
  });

  // ── Raiju ──────────────────────────────────────────────────────

  // EMF reading comes out of setup.ToolController.render('emf'), which
  // returns a <<coloredText "<color>" <N>>> markup string. Sampling the
  // controller directly avoids a per-iteration passage navigation (and
  // doesn't need a dedicated EMFcheck passage to exist).
  async function sampleEmfReadings(page, count) {
    const rx = /<<coloredText\s+"[^"]*"\s+(-?\d+)/;
    const readings = [];
    for (let i = 0; i < count; i++) {
      const markup = await page.evaluate(() => SugarCube.setup.ToolController.render('emf'));
      const m = markup.match(rx);
      if (m) readings.push(parseInt(m[1], 10));
    }
    return readings;
  }

  test('Raiju: EMF readings can glitch to random values', async ({ game: page }) => {
    await setupHunt(page, 'Raiju');
    await setVar(page, 'tools', { emf: { activated: 1, activationTime: 0 }, uvl: { activated: 0, activationTime: 0 } });
    await setVar(page, 'equipment.emf', 3);
    await seedRandom(page, 0xB1);

    const readings = await sampleEmfReadings(page, 30);

    expect(readings.some(r => r !== 5), 'Raiju never glitched EMF').toBe(true);
    expect(readings.some(r => r === 5), 'Normal EMF (5) never appeared').toBe(true);
  });

  test('Raiju: non-Raiju ghost always shows EMF 5 for emf evidence', async ({ game: page }) => {
    await setupHunt(page, 'Spirit');
    await setVar(page, 'tools', { emf: { activated: 1, activationTime: 0 }, uvl: { activated: 0, activationTime: 0 } });
    await setVar(page, 'equipment.emf', 3);
    await seedRandom(page, 0xB2);

    const readings = await sampleEmfReadings(page, 10);
    for (const num of readings) expect(num).toBe(5);
  });

  test('Raiju: temperature readings can glitch', async ({ game: page }) => {
    await setupHunt(page, 'Raiju');

    await page.evaluate(() => {
      SugarCube.State.variables.ghostRoom = { name: 'kitchen' };
    });
    await setVar(page, 'equipment.temperature', 3);
    await setVar(page, 'temperature', 0);
    await seedRandom(page, 0xB3);

    // TemperatureHigh's base reading depends on setup.isGhostHere(), which
    // reads the CURRENT passage. That's why we re-enter OwaissaKitchen before
    // every sample — without it isGhostHere returns false and unglitched
    // readings drop to 13-16, which would be indistinguishable from glitches.
    const readings = [];
    for (let i = 0; i < 25; i++) {
      await goToPassage(page, 'HuntRun');
      await goToPassage(page, 'TemperatureHigh');
      const num = parseInt(await page.locator('.passage').textContent(), 10);
      if (!isNaN(num)) readings.push(num);
    }

    const hasGlitch = readings.some(r => r < 18 || r > 21);
    expect(hasGlitch, 'Raiju never glitched temperature').toBe(true);
  });

  // ── Mimic ──────────────────────────────────────────────────────

  test('Mimic: isMimicHunt reports true for a Mimic contract', async ({ game: page }) => {
    await setupHunt(page, 'Mimic');

    expect(await page.evaluate(() =>
      SugarCube.State.variables.hunt.realName === 'Mimic'
    )).toBe(true);
    expect(await callSetup(page, 'setup.Ghosts.isMimicHunt()')).toBe(true);

    await goToPassage(page, 'HuntRun');
    await expectCleanPassage(page);
  });

  test('Mimic: disguise changes at 30-minute intervals', async ({ game: page }) => {
    await setupHunt(page, 'Mimic');
    await setVar(page, 'lastChangeIntervalMimic', ' ');

    await setVar(page, 'minutes', 10);
    await goToPassage(page, 'Mimic');
    expect(await getVar(page, 'lastChangeIntervalMimic')).toBe('0-29');
    expect(await page.evaluate(() =>
      SugarCube.State.variables.hunt.name
    )).toBeTruthy();

    await setVar(page, 'minutes', 35);
    await goToPassage(page, 'Mimic');
    expect(await getVar(page, 'lastChangeIntervalMimic')).toBe('30-59');
  });

  test('Mimic: extra ectoplasm evidence check', async ({ game: page }) => {
    await setupHunt(page, 'Mimic');

    const evidence = await page.evaluate(() =>
      SugarCube.State.variables.hunt.evidence
    );
    expect(evidence).toContain('spiritbox');
    expect(evidence).toContain('temperature');
    expect(evidence).toContain('uvl');
    expect(await callSetup(page, 'setup.Ghosts.isMimicHunt()')).toBe(true);

    await goToPassage(page, 'HuntRun');
    await expectCleanPassage(page);
  });
});
