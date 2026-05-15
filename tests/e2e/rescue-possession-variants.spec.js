const { test, expect } = require('../fixtures');
const { setVar, getVar, callSetup, goToPassage } = require('../helpers');

/**
 * Missing-women rescue branch from setup.MissingWomen:
 *
 *   rescueEventOutcome():
 *     stage 0                      -> 'success' (auto)
 *     stage 1 + hours < 18 + roll  -> 'success' or 'possessed' (random)
 *     stage >= 2 / hours >= 18     -> 'possessed'
 *
 *   possessedPassageFor(girl) routes to the per-girl follow-up
 *   passage (RescueVictoriaPossessed, RescueJadePossessed, etc.).
 *
 *   markQuestFailed / markQuestSucceeded / resetQuestToAvailable
 *   wrap the hasQuestForRescue lifecycle bit.
 */
test.describe('Rescue possession variants', () => {
  test.describe.configure({ timeout: 30_000 });

  const GIRLS = ['Victoria', 'Jade', 'Julia', 'Nadia', 'Ash'];

  test('possessedPassageFor routes every catalogue girl to her possessed entry', async ({ game: page }) => {
    for (const girl of GIRLS) {
      const passage = await callSetup(page, `setup.MissingWomen.possessedPassageFor(${JSON.stringify(girl)})`);
      expect(passage).toBe(`Rescue${girl}Possessed`);
    }
    // Unknown girl falls through to null.
    expect(await callSetup(page, 'setup.MissingWomen.possessedPassageFor("Nobody")')).toBeNull();
  });

  test('rescueGirlNames matches the dispatch table', async ({ game: page }) => {
    const names = await callSetup(page, 'setup.MissingWomen.rescueGirlNames()');
    expect(names.sort()).toEqual([...GIRLS].sort());
  });

  test('rescueGirlConfig returns a slug + chapters for every girl, null for unknown', async ({ game: page }) => {
    for (const girl of GIRLS) {
      const cfg = await callSetup(page, `setup.MissingWomen.rescueGirlConfig(${JSON.stringify(girl)})`);
      expect(cfg).not.toBeNull();
      expect(typeof cfg.slug).toBe('string');
      expect(Array.isArray(cfg.chapters)).toBe(true);
      expect(cfg.chapters.length).toBeGreaterThan(0);
    }
    expect(await callSetup(page, 'setup.MissingWomen.rescueGirlConfig("Mystery")')).toBeNull();
  });

  test('rescueEventOutcome returns success at stage 0 (auto path)', async ({ game: page }) => {
    await page.evaluate(() => {
      SugarCube.State.variables.rescueStage = 0;
      SugarCube.State.variables.hasQuestForRescue = SugarCube.setup.RescueQuestState.ACTIVE;
    });
    expect(await callSetup(page, 'setup.MissingWomen.rescueEventOutcome()')).toBe('success');
  });

  test('rescueEventOutcome returns possessed when stage>=1 and hours>=18', async ({ game: page }) => {
    await page.evaluate(() => {
      SugarCube.State.variables.rescueStage = 1;
      SugarCube.State.variables.hasQuestForRescue = SugarCube.setup.RescueQuestState.ACTIVE;
      SugarCube.State.variables.hours = 19;
    });
    expect(await callSetup(page, 'setup.MissingWomen.rescueEventOutcome()')).toBe('possessed');

    await page.evaluate(() => { SugarCube.State.variables.rescueStage = 2; });
    expect(await callSetup(page, 'setup.MissingWomen.rescueEventOutcome()')).toBe('possessed');
  });

  test('rescueEventOutcome rolls at stage 1 + hours<18; low roll -> success, high roll -> possessed', async ({ game: page }) => {
    await page.evaluate(() => {
      SugarCube.State.variables.rescueStage = 1;
      SugarCube.State.variables.hasQuestForRescue = SugarCube.setup.RescueQuestState.ACTIVE;
      SugarCube.State.variables.hours = 6; // chance = 100 - 6*100/18 ~= 66.66
    });
    // Pin random(1, 100) = 1 -> rolls under the chance -> 'success'
    const success = await page.evaluate(() => {
      const orig = Math.random;
      Math.random = () => 0;
      try { return SugarCube.setup.MissingWomen.rescueEventOutcome(); }
      finally { Math.random = orig; }
    });
    expect(success).toBe('success');

    // Pin random(1, 100) ~= 100 -> rolls above the chance -> 'possessed'
    const possessed = await page.evaluate(() => {
      const orig = Math.random;
      Math.random = () => 0.999999;
      try { return SugarCube.setup.MissingWomen.rescueEventOutcome(); }
      finally { Math.random = orig; }
    });
    expect(possessed).toBe('possessed');
  });

  test('markQuestFailed and markQuestSucceeded flip the lifecycle bit', async ({ game: page }) => {
    await page.evaluate(() => {
      SugarCube.State.variables.hasQuestForRescue = SugarCube.setup.RescueQuestState.ACTIVE;
    });
    expect(await callSetup(page, 'setup.MissingWomen.hasActiveQuest()')).toBe(true);
    expect(await callSetup(page, 'setup.MissingWomen.questFailed()')).toBe(false);

    await callSetup(page, 'setup.MissingWomen.markQuestFailed()');
    expect(await callSetup(page, 'setup.MissingWomen.questFailed()')).toBe(true);
    expect(await callSetup(page, 'setup.MissingWomen.hasActiveQuest()')).toBe(false);

    await callSetup(page, 'setup.MissingWomen.markQuestSucceeded()');
    expect(await callSetup(page, 'setup.MissingWomen.questSucceeded()')).toBe(true);
    expect(await callSetup(page, 'setup.MissingWomen.questFailed()')).toBe(false);

    await callSetup(page, 'setup.MissingWomen.resetQuestToAvailable()');
    expect(await callSetup(page, 'setup.MissingWomen.isQuestAvailable()')).toBe(true);
  });

  test('mustReturnToNun is true after success or failure, false while active', async ({ game: page }) => {
    await page.evaluate(() => {
      SugarCube.State.variables.hasQuestForRescue = SugarCube.setup.RescueQuestState.ACTIVE;
    });
    expect(await callSetup(page, 'setup.MissingWomen.mustReturnToNun()')).toBe(false);
    await callSetup(page, 'setup.MissingWomen.markQuestFailed()');
    expect(await callSetup(page, 'setup.MissingWomen.mustReturnToNun()')).toBe(true);
    await callSetup(page, 'setup.MissingWomen.markQuestSucceeded()');
    expect(await callSetup(page, 'setup.MissingWomen.mustReturnToNun()')).toBe(true);
  });

  test('sleepOffHoursAfterEvent advances time by 3 hours', async ({ game: page }) => {
    await setVar(page, 'hours', 10);
    await callSetup(page, 'setup.MissingWomen.sleepOffHoursAfterEvent()');
    expect(await getVar(page, 'hours')).toBe(13);
  });

  test('initRescueScene primes $videoRescueEvent with a chapter clip; null for unknown girl', async ({ game: page }) => {
    for (const girl of GIRLS) {
      const scene = await page.evaluate((g) => {
        const orig = Math.random;
        Math.random = () => 0;
        try { return SugarCube.setup.MissingWomen.initRescueScene(g); }
        finally { Math.random = orig; }
      }, girl);
      expect(scene).not.toBeNull();
      expect(scene.slug).toBeTruthy();
      expect(scene.current).toMatch(new RegExp(`characters/rescue/${scene.slug}/`));
      const video = await getVar(page, 'videoRescueEvent');
      expect(video).toBe(scene.current);
    }
    expect(await callSetup(page, 'setup.MissingWomen.initRescueScene("Mystery")')).toBeNull();
  });

  test('advanceRescueScene rotates through clips without repeating until the pool resets', async ({ game: page }) => {
    // Keep the scene live on the page so each advance call mutates the same
    // `used` array; serializing across page.evaluate would reset it.
    const scene = await page.evaluate(() => {
      const orig = Math.random;
      Math.random = () => 0;
      try {
        window.__scene = SugarCube.setup.MissingWomen.initRescueScene('Victoria');
        return { srcs: window.__scene.srcs.slice(), current: window.__scene.current };
      } finally { Math.random = orig; }
    });
    expect(scene.srcs.length).toBeGreaterThan(1);

    const seen = [scene.current];
    for (let i = 0; i < scene.srcs.length - 1; i++) {
      const next = await page.evaluate(() => SugarCube.setup.MissingWomen.advanceRescueScene(window.__scene));
      expect(seen.includes(next)).toBe(false);
      seen.push(next);
    }
    expect(seen.length).toBe(scene.srcs.length);

    const reset = await page.evaluate(() => SugarCube.setup.MissingWomen.advanceRescueScene(window.__scene));
    expect(scene.srcs.includes(reset)).toBe(true);
  });

  test('endRescueScene swaps in the per-chapter end clip', async ({ game: page }) => {
    const scene = await page.evaluate(() => {
      const orig = Math.random;
      Math.random = () => 0;
      try { return SugarCube.setup.MissingWomen.initRescueScene('Jade'); }
      finally { Math.random = orig; }
    });
    const ended = await page.evaluate((s) => SugarCube.setup.MissingWomen.endRescueScene(s), scene);
    expect(ended).toMatch(/end\.mp4$/);
    expect(await getVar(page, 'videoRescueEvent')).toBe(ended);
  });

  test('RescuePossessed passage routes to the per-girl wake-up link after Continue', async ({ game: page }) => {
    for (const girl of GIRLS) {
      await page.evaluate((g) => {
        const v = SugarCube.State.variables;
        v.currentRescueGirl = g;
        v.hasQuestForRescue = SugarCube.setup.RescueQuestState.ACTIVE;
      }, girl);
      await goToPassage(page, 'RescuePossessed');
      // The girl-specific link is wrapped in a <<linkreplace "Continue">>;
      // click to reveal it.
      await page.locator('a.macro-linkreplace').filter({ hasText: /Continue/ }).first().click();
      await page.waitForFunction(
        (g) => document.querySelector('.passage').innerHTML.includes(`Rescue${g}Possessed`),
        girl,
        { timeout: 3000 }
      );
      const html = await page.evaluate(() => document.querySelector('.passage').innerHTML);
      expect(html).toContain(`Rescue${girl}Possessed`);
    }
  });

  test('canStaySubmissive opens up at corruption >= 6', async ({ game: page }) => {
    await page.evaluate(() => { SugarCube.State.variables.mc.corruption = 5; });
    expect(await callSetup(page, 'setup.MissingWomen.canStaySubmissive()')).toBe(false);
    await page.evaluate(() => { SugarCube.State.variables.mc.corruption = 6; });
    expect(await callSetup(page, 'setup.MissingWomen.canStaySubmissive()')).toBe(true);
  });

  test('jadePossessedStage and victoriaPossessedStage accessors track the underlying vars', async ({ game: page }) => {
    await page.evaluate(() => {
      SugarCube.State.variables.rescueJadePossessed = 0;
      SugarCube.State.variables.rescueVictoriaPossessed = 0;
    });
    expect(await callSetup(page, 'setup.MissingWomen.jadePossessedStage()')).toBe(0);
    await callSetup(page, 'setup.MissingWomen.setJadePossessedStage(2)');
    expect(await callSetup(page, 'setup.MissingWomen.jadePossessedStage()')).toBe(2);
    expect(await getVar(page, 'rescueJadePossessed')).toBe(2);

    await callSetup(page, 'setup.MissingWomen.setVictoriaPossessedStage(1)');
    expect(await callSetup(page, 'setup.MissingWomen.victoriaPossessedStage()')).toBe(1);
    expect(await getVar(page, 'rescueVictoriaPossessed')).toBe(1);
  });

  test('isCorrectHouse compares photo number vs rescue house', async ({ game: page }) => {
    await page.evaluate(() => {
      SugarCube.State.variables.randomRescuePhotoNumber = 4;
      SugarCube.State.variables.rescueHouse = 7;
    });
    expect(await callSetup(page, 'setup.MissingWomen.isCorrectHouse()')).toBe(false);
    await page.evaluate(() => { SugarCube.State.variables.rescueHouse = 4; });
    expect(await callSetup(page, 'setup.MissingWomen.isCorrectHouse()')).toBe(true);
  });

  test('canResolveRescue gates on stage<2, correct house, and an active quest', async ({ game: page }) => {
    await page.evaluate(() => {
      SugarCube.State.variables.randomRescuePhotoNumber = 4;
      SugarCube.State.variables.rescueHouse = 4;
      SugarCube.State.variables.rescueStage = 0;
      SugarCube.State.variables.hasQuestForRescue = SugarCube.setup.RescueQuestState.ACTIVE;
    });
    expect(await callSetup(page, 'setup.MissingWomen.canResolveRescue()')).toBe(true);

    await page.evaluate(() => { SugarCube.State.variables.rescueStage = 2; });
    expect(await callSetup(page, 'setup.MissingWomen.canResolveRescue()')).toBe(false);

    await page.evaluate(() => {
      SugarCube.State.variables.rescueStage = 0;
      SugarCube.State.variables.hasQuestForRescue = SugarCube.setup.RescueQuestState.FAILED;
    });
    expect(await callSetup(page, 'setup.MissingWomen.canResolveRescue()')).toBe(false);
  });

  test('boardPostingsOutToday opens at 18 and closes at midnight', async ({ game: page }) => {
    for (const [h, on] of [[17, false], [18, true], [22, true], [23, true], [24, false]]) {
      await setVar(page, 'hours', h);
      expect(await callSetup(page, 'setup.MissingWomen.boardPostingsOutToday()')).toBe(on);
    }
  });

  test('upgradeEmfToLvl3 bumps the EMF tier to 3 regardless of the prior tier', async ({ game: page }) => {
    await page.evaluate(() => { SugarCube.setup.ToolController.setTier('emf', 1); });
    await callSetup(page, 'setup.MissingWomen.upgradeEmfToLvl3()');
    expect(await callSetup(page, 'setup.ToolController.tierOf("emf")')).toBe(3);
  });
});
