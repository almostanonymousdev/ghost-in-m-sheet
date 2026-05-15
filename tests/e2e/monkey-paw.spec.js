const { test, expect } = require('../fixtures');
const { setVar, getVar, callSetup } = require('../helpers');
const { setupHunt } = require('./e2e-helpers');

/**
 * Monkey Paw cursed-item behavior. The paw owns its own controller
 * (setup.MonkeyPaw); these tests poke through that surface rather than
 * the wish widgets, so they don't depend on the DOM rendering pipeline.
 *
 *   - Tier escalation: wishesCount=3 -> t1, =2 -> t2, =1 -> t3
 *   - byInput is case- and whitespace-insensitive
 *   - hasWishes() gates the menu when wishesCount === 0
 *   - rollAnything() draws uniformly from the 6 catalogue wishes
 */
test.describe('Monkey Paw wishes', () => {
  test.describe.configure({ timeout: 20_000 });

  test('activity tier 1: +15 lust, -15 sanity, no temp corruption', async ({ game: page }) => {
    await setupHunt(page, 'Shade');
    await page.evaluate(() => {
      SugarCube.setup.MonkeyPaw.resetHunt();
      SugarCube.setup.Mc.setSanity(80);
      const m = SugarCube.State.variables.mc;
      m.lust = 0;
      SugarCube.State.variables.tempCorr = 0;
    });
    const result = await callSetup(page, 'setup.MonkeyPaw.activate("activity")');
    expect(result.tier).toBe(1);
    expect(result.lustDelta).toBe(15);
    expect(result.sanityDelta).toBe(-15);
    expect(result.corrDelta).toBe(0);
    expect(result.drewGhost).toBe(false);
    expect(await getVar(page, 'mc.lust')).toBe(15);
    expect(await callSetup(page, 'setup.Mc.sanity()')).toBe(65);
    expect(await callSetup(page, 'setup.MonkeyPaw.wishesLeft()')).toBe(2);
  });

  test('activity tier 3 escalates: +40 lust, -40 sanity, +0.4 tempCorr, snaps ghost', async ({ game: page }) => {
    await setupHunt(page, 'Shade');
    await page.evaluate(() => {
      SugarCube.setup.MonkeyPaw.resetHunt();
      SugarCube.State.variables.wishesCount = 1;
      SugarCube.setup.Mc.setSanity(80);
      SugarCube.State.variables.mc.lust = 0;
      SugarCube.State.variables.tempCorr = 0;
    });
    const result = await callSetup(page, 'setup.MonkeyPaw.activate("activity")');
    expect(result.tier).toBe(3);
    expect(result.lustDelta).toBe(40);
    expect(result.sanityDelta).toBe(-40);
    expect(result.corrDelta).toBe(0.4);
    expect(result.drewGhost).toBe(true);
    expect(await getVar(page, 'mc.lust')).toBe(40);
    expect(await callSetup(page, 'setup.Mc.sanity()')).toBe(40);
    expect(await callSetup(page, 'setup.MonkeyPaw.wishesLeft()')).toBe(0);
  });

  test('sanity wish pins sanity to 50 across all tiers', async ({ game: page }) => {
    await setupHunt(page, 'Shade');
    await page.evaluate(() => {
      SugarCube.setup.MonkeyPaw.resetHunt();
      SugarCube.setup.Mc.setSanity(10);
    });
    const t1 = await callSetup(page, 'setup.MonkeyPaw.activate("sanity")');
    expect(t1.tier).toBe(1);
    expect(t1.sanitySet).toBe(50);
    expect(await callSetup(page, 'setup.Mc.sanity()')).toBe(50);

    // tier 2: drop sanity to 90, then wish — tier should now be 2.
    await page.evaluate(() => SugarCube.setup.Mc.setSanity(90));
    const t2 = await callSetup(page, 'setup.MonkeyPaw.activate("sanity")');
    expect(t2.tier).toBe(2);
    expect(await callSetup(page, 'setup.Mc.sanity()')).toBe(50);
    expect(t2.lustDelta).toBe(10);
  });

  test('dawn wish jumps clock to 6 AM and ends the hunt', async ({ game: page }) => {
    await setupHunt(page, 'Shade');
    await page.evaluate(() => {
      SugarCube.setup.MonkeyPaw.resetHunt();
      SugarCube.State.variables.hours = 2;
      SugarCube.State.variables.minutes = 0;
    });
    const result = await callSetup(page, 'setup.MonkeyPaw.activate("dawn")');
    expect(result.tier).toBe(1);
    expect(result.goto).toBe('HuntSummary');
    expect(await getVar(page, 'hours')).toBe(6);
  });

  test('knowledge wish: first activation removes evidence and goes to GhostHuntEvent', async ({ game: page }) => {
    await setupHunt(page, 'Shade');
    await page.evaluate(() => {
      SugarCube.setup.MonkeyPaw.resetHunt();
      SugarCube.setup.Ghosts.clearKnowledgeUsed();
      SugarCube.setup.Mc.setSanity(80);
    });
    const result = await callSetup(page, 'setup.MonkeyPaw.activate("knowledge")');
    expect(result.tier).toBe(1);
    expect(result.goto).toBe('GhostHuntEvent');
    expect(result.alreadyUsed).toBeUndefined();
    expect(await callSetup(page, 'setup.Ghosts.knowledgeUsed()')).toBe(true);

    // Second activation should short-circuit with alreadyUsed.
    const second = await callSetup(page, 'setup.MonkeyPaw.activate("knowledge")');
    expect(second.alreadyUsed).toBe(true);
    expect(second.tier).toBe(0);
  });

  test('byInput matches case-insensitively with whitespace trim', async ({ game: page }) => {
    expect(await callSetup(page, 'setup.MonkeyPaw.byInput("activity") && setup.MonkeyPaw.byInput("activity").id')).toBe('activity');
    expect(await callSetup(page, 'setup.MonkeyPaw.byInput("  Activity  ") && setup.MonkeyPaw.byInput("  Activity  ").id')).toBe('activity');
    expect(await callSetup(page, 'setup.MonkeyPaw.byInput("TRAP THE GHOST") && setup.MonkeyPaw.byInput("TRAP THE GHOST").id')).toBe('trapTheGhost');
    expect(await callSetup(page, 'setup.MonkeyPaw.byInput("be sane") && setup.MonkeyPaw.byInput("be sane").id')).toBe('sanity');
    expect(await callSetup(page, 'setup.MonkeyPaw.byInput("notawish")')).toBeNull();
    expect(await callSetup(page, 'setup.MonkeyPaw.byInput("")')).toBeNull();
  });

  test('hasWishes() gates when wishesCount drops to 0', async ({ game: page }) => {
    await page.evaluate(() => SugarCube.setup.MonkeyPaw.resetHunt());
    expect(await callSetup(page, 'setup.MonkeyPaw.hasWishes()')).toBe(true);
    expect(await callSetup(page, 'setup.MonkeyPaw.wishesLeft()')).toBe(3);
    await page.evaluate(() => { SugarCube.State.variables.wishesCount = 0; });
    expect(await callSetup(page, 'setup.MonkeyPaw.hasWishes()')).toBe(false);
  });

  test('rollAnything picks uniformly across the 6 catalogue wishes', async ({ game: page }) => {
    const counts = await page.evaluate(() => {
      const buckets = {};
      let origRandom = Math.random;
      try {
        let i = 0;
        Math.random = () => {
          // cycle through 0, 1/6, 2/6, 3/6, 4/6, 5/6 so each wish gets one hit
          const r = (i % 6) / 6 + 0.001;
          i++;
          return r;
        };
        for (let n = 0; n < 60; n++) {
          const w = SugarCube.setup.MonkeyPaw.rollAnything();
          buckets[w.id] = (buckets[w.id] || 0) + 1;
        }
      } finally {
        Math.random = origRandom;
      }
      return buckets;
    });
    expect(Object.keys(counts).sort()).toEqual(
      ['activity', 'dawn', 'knowledge', 'leave', 'sanity', 'trapTheGhost'].sort()
    );
    for (const id of Object.keys(counts)) {
      expect(counts[id]).toBe(10);
    }
  });

  test('purchaseGuide marks every wish learned and grants anything-wish', async ({ game: page }) => {
    await page.evaluate(() => {
      SugarCube.State.variables.monkeyPawLearned = {};
      SugarCube.State.variables.wishAnything = 0;
      SugarCube.setup.MonkeyPaw.purchaseGuide();
    });
    for (const id of ['activity', 'trapTheGhost', 'sanity', 'leave', 'knowledge', 'dawn']) {
      expect(await callSetup(page, `setup.MonkeyPaw.isLearned("${id}")`)).toBe(true);
    }
    expect(await callSetup(page, 'setup.MonkeyPaw.hasAnything()')).toBe(true);
    expect(await callSetup(page, 'setup.MonkeyPaw.hasGuide()')).toBe(true);
  });
});
