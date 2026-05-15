const { test, expect } = require('../fixtures');
const { setVar, getVar, callSetup, seedRandom } = require('../helpers');
const { setupHunt } = require('./e2e-helpers');

/**
 * Per-ghost behavior flags not already exercised in
 * ghost-unique-abilities.spec.js / special-ghost-events.spec.js:
 *
 *   - Shade        invertedSanityStages
 *   - Moroi        spiritboxPossessionChance (possession + menacing)
 *   - Banshee      canKiss (bansheeRoll branch in rollProwlEvent)
 *   - Cthulion     canTentacles + cursedActivityVideos
 *   - Raiju        spiritboxStaticChance + emf/temperature glitch rolls
 */
test.describe('Per-ghost mechanics', () => {
  test.describe.configure({ timeout: 20_000 });

  test('Shade: rollSaveEvent uses inverted decreasing-sanity stages', async ({ game: page }) => {
    await setupHunt(page, 'Shade');
    await seedRandom(page, 1);
    // rollSaveEvent stamps $decreasingSanity according to the ghost's
    // invertedSanityStages flag — Shade flips it so the player gets
    // *more* generous video rolls at high sanity, not less.
    await callSetup(page, 'setup.Events.rollSaveEvent()');
    const ds = await getVar(page, 'decreasingSanity');
    expect(ds).toEqual({ stage1: 9, stage2: 7, stage3: 5, stage4: 3 });
  });

  test('Spirit (control): rollSaveEvent uses normal decreasing-sanity stages', async ({ game: page }) => {
    await setupHunt(page, 'Spirit');
    await seedRandom(page, 1);
    await callSetup(page, 'setup.Events.rollSaveEvent()');
    const ds = await getVar(page, 'decreasingSanity');
    expect(ds).toEqual({ stage1: 3, stage2: 5, stage3: 7, stage4: 9 });
  });

  test('Moroi: spiritbox possession routes to CityMapPossessed when brain ≥ 3', async ({ game: page }) => {
    await setupHunt(page, 'Moroi');
    await page.evaluate(() => {
      SugarCube.State.variables.sensualBodyPart.brain = 5;
      // randInt(1, 100) → roll 1; both possession and static branches read this.
      window._origRandom = Math.random;
      Math.random = () => 0;
    });
    try {
      const html = await callSetup(page, 'setup.ToolController.render("spiritbox")');
      expect(html).toContain('losing consciousness');
      expect(html).toContain('CityMapPossessed');
    } finally {
      await page.evaluate(() => { Math.random = window._origRandom; });
    }
  });

  test('Moroi: spiritbox menacing variant when brain < 3', async ({ game: page }) => {
    await setupHunt(page, 'Moroi');
    await page.evaluate(() => {
      SugarCube.State.variables.sensualBodyPart.brain = 0;
      window._origRandom = Math.random;
      Math.random = () => 0;
    });
    try {
      const html = await callSetup(page, 'setup.ToolController.render("spiritbox")');
      // No CityMapPossessed link in this branch; emits one of the menacing one-liners.
      expect(html).not.toContain('CityMapPossessed');
      expect(html).toMatch(/spread you open|pretty mouth|take my time|already wet|already mine|catch up/);
    } finally {
      await page.evaluate(() => { Math.random = window._origRandom; });
    }
  });

  test('Banshee: rollSaveEvent kiss branch fires under forced low roll', async ({ game: page }) => {
    await setupHunt(page, 'Banshee');
    // setSanity(100) puts the player out of the sanity-banded video tiers
    // so the only way rollSaveEvent triggers is via the bansheeRoll==1
    // canKiss path. Force Math.random=0 so the chance/bansheeRoll both hit 1.
    await callSetup(page, 'setup.Mc.setSanity(100)');
    await page.evaluate(() => { window._origRandom = Math.random; Math.random = () => 0; });
    try {
      const fired = await callSetup(page, 'setup.Events.rollSaveEvent()');
      expect(fired).toBe(true);
      expect(await callSetup(page, 'setup.Ghosts.bansheeActive()')).toBe(true);
      const video = await getVar(page, 'videoEvent');
      expect(typeof video).toBe('string');
      expect(video.length).toBeGreaterThan(0);
    } finally {
      await page.evaluate(() => { Math.random = window._origRandom; });
    }
  });

  test('Cthulion: rollSaveEvent tentacle branch picks from cursedActivityVideos pool', async ({ game: page }) => {
    await setupHunt(page, 'Cthulion');
    // Force the ctRoll==1 path: chance≤stage2 + ctRoll===1. Sanity stays
    // mid-band so the cthulionTierForSanity → tier-1 pool fires.
    await callSetup(page, 'setup.Mc.setSanity(60)');
    await page.evaluate(() => { window._origRandom = Math.random; Math.random = () => 0; });
    try {
      const fired = await callSetup(page, 'setup.Events.rollSaveEvent()');
      expect(fired).toBe(true);
      const video = await getVar(page, 'videoEvent');
      expect(video).toMatch(/characters\/ghosts\/cthulion\/1\./);
    } finally {
      await page.evaluate(() => { Math.random = window._origRandom; });
    }
  });

  test('Cthulion: cursedActivityVideos pool is exposed on the active ghost', async ({ game: page }) => {
    await setupHunt(page, 'Cthulion');
    const videos = await page.evaluate(() => SugarCube.setup.Ghosts.active().cursedActivityVideos);
    expect(Array.isArray(videos)).toBe(true);
    expect(videos.length).toBeGreaterThan(0);
    videos.forEach((v) => expect(v).toMatch(/^characters\/ghosts\/cthulion\//));
  });

  test('Raiju: spiritbox static branch fires under forced low roll', async ({ game: page }) => {
    await setupHunt(page, 'Raiju');
    await page.evaluate(() => { window._origRandom = Math.random; Math.random = () => 0; });
    try {
      const html = await callSetup(page, 'setup.ToolController.render("spiritbox")');
      // Static-burst pool sentences end with leaked moans / cut whispers.
      expect(html).toMatch(/crackling|static|wet sounds|shuddering exhale|gasping/);
      expect(html).not.toContain('CityMapPossessed');
    } finally {
      await page.evaluate(() => { Math.random = window._origRandom; });
    }
  });

  test('Raiju: EMF glitch fires ~1/3 of ticks, temperature glitch ~1/8', async ({ game: page }) => {
    await setupHunt(page, 'Raiju');
    await seedRandom(page, 42);
    // 1500 rolls each, expect within ±40% of theoretical (1/3 and 1/8) —
    // a deterministic seed plus large sample size keeps this stable.
    const { emfHits, tempHits } = await page.evaluate(() => {
      const g = SugarCube.setup.Ghosts.active();
      let emf = 0, temp = 0;
      for (let i = 0; i < 1500; i++) if (g.rollEmfGlitch()) emf++;
      for (let i = 0; i < 1500; i++) if (g.rollTemperatureGlitch()) temp++;
      return { emfHits: emf, tempHits: temp };
    });
    // EMF: 1/3 → ~500. Temp: 1/8 → ~187.
    expect(emfHits).toBeGreaterThan(400);
    expect(emfHits).toBeLessThan(600);
    expect(tempHits).toBeGreaterThan(140);
    expect(tempHits).toBeLessThan(240);
  });

  test('Phantom (control): no sensor glitches', async ({ game: page }) => {
    await setupHunt(page, 'Phantom');
    const { emfHits, tempHits } = await page.evaluate(() => {
      const g = SugarCube.setup.Ghosts.active();
      let emf = 0, temp = 0;
      for (let i = 0; i < 200; i++) {
        if (g.rollEmfGlitch()) emf++;
        if (g.rollTemperatureGlitch()) temp++;
      }
      return { emfHits: emf, tempHits: temp };
    });
    expect(emfHits).toBe(0);
    expect(tempHits).toBe(0);
  });
});
