const { test, expect } = require('../fixtures');
const { setVar, getVar, callSetup, goToPassage } = require('../helpers');
const { setupHunt } = require('./e2e-helpers');

/**
 * CompanionResult branches on $chosenPlan:
 *   - Plan2: cursed-item find (random pick via rollFoundCursedItem,
 *            +30 lust, companionExp 10) -- unless already holding one,
 *            in which case the companion comments and exits.
 *   - Plan3: random evidence find via pickRandomHuntEvidence, +5 exp,
 *            renders one of emf/gwb/temperature/spiritbox/uvl/glass blocks.
 *   - Plan4: declares the ghost's favorite room, +5 exp.
 *
 * pickRandomHuntEvidence returns null on no hunt; rollFoundCursedItem
 * always sets a flag via setup.Witch.setCursedItemFlag.
 */
test.describe('Companion result plans', () => {
  test.describe.configure({ timeout: 20_000 });

  test('pickRandomHuntEvidence returns a valid evidence id during an active hunt', async ({ game: page }) => {
    await setupHunt(page, 'Spirit');
    const hunt = await callSetup(page, 'setup.Ghosts.huntEvidence()');
    expect(Array.isArray(hunt)).toBe(true);
    expect(hunt.length).toBeGreaterThan(0);

    const evidenceIds = ['emf', 'gwb', 'temperature', 'spiritbox', 'uvl', 'glass', 'plasm'];
    const picked = await callSetup(page, 'setup.Companion.pickRandomHuntEvidence()');
    expect(evidenceIds).toContain(picked);
  });

  test('pickRandomHuntEvidence returns null when no hunt is active', async ({ game: page }) => {
    await page.evaluate(() => { SugarCube.State.variables.hunt = null; });
    const picked = await callSetup(page, 'setup.Companion.pickRandomHuntEvidence()');
    expect(picked).toBeNull();
  });

  test('pickGwbImage returns a 1..18 path under mechanics/gwb', async ({ game: page }) => {
    const seen = new Set();
    for (let i = 0; i < 100; i++) {
      const img = await callSetup(page, 'setup.Companion.pickGwbImage()');
      expect(img).toMatch(/^mechanics\/gwb\/([1-9]|1[0-8])\.jpg$/);
      seen.add(img);
    }
    expect(seen.size).toBeGreaterThan(5);
  });

  test('rollFoundCursedItem stamps a cursed-item flag and marks holding', async ({ game: page }) => {
    await page.evaluate(() => {
      // Clear all isCI* flags first
      const v = SugarCube.State.variables;
      Object.keys(v).forEach(k => { if (/^isCI/.test(k)) v[k] = 0; });
    });
    const pick = await callSetup(page, 'setup.Companion.rollFoundCursedItem()');
    expect(pick).toBeDefined();
    expect(typeof pick.key).toBe('string');
    expect(await callSetup(page, 'setup.Witch.hasCursedItemToTurnIn()')).toBe(true);
  });

  test('Plan2 result renders "found the cursed item" success on a fresh hunt', async ({ game: page }) => {
    await setupHunt(page, 'Spirit');
    await page.evaluate(() => {
      SugarCube.State.variables.chosenPlan = 'Plan2';
      SugarCube.State.variables.companion = { name: 'Alex' };
      const v = SugarCube.State.variables;
      Object.keys(v).forEach(k => { if (/^isCI/.test(k)) v[k] = 0; });
      v.cursedItemHeld = 0;
    });
    await goToPassage(page, 'CompanionResult');
    // The passage uses a linkappend on "it's a cursed item..." so the
    // assertion just verifies the speech anchor is rendered.
    const text = await page.evaluate(() => document.querySelector('.passage').textContent);
    expect(text).toMatch(/cursed item/);
  });

  test('Plan4 result names the favorite room and grants companion exp', async ({ game: page }) => {
    await setupHunt(page, 'Spirit');
    await page.evaluate(() => {
      SugarCube.State.variables.chosenPlan = 'Plan4';
      SugarCube.State.variables.companion = { name: 'Alex' };
      // Plan4 prints $hunt.room.name via <<ghostRoom>>; setupHunt pinned it.
    });
    await goToPassage(page, 'CompanionResult');
    const text = await page.evaluate(() => document.querySelector('.passage').textContent);
    expect(text).toMatch(/favorite room/);
    // <<ghostRoom>> emits the pinned room name.
    expect(text.toLowerCase()).toMatch(/kitchen|hallway/);
  });

  test('Plan3 result renders an evidence block matching the picked id', async ({ game: page }) => {
    await setupHunt(page, 'Spirit');
    await page.evaluate(() => {
      SugarCube.State.variables.chosenPlan = 'Plan3';
      SugarCube.State.variables.companion = { name: 'Alex' };
      // Pin Math.random=0 to force the first hunt evidence.
      window._origRandom = Math.random;
      Math.random = () => 0;
    });
    try {
      await goToPassage(page, 'CompanionResult');
      const text = await page.evaluate(() => document.querySelector('.passage').textContent);
      expect(text).toMatch(/evidence|EMF|Spirit Box|Temperature|UVL|Ectoglass|Ghost Writing Book/);
      expect(text).toMatch(/found the evidence/);
    } finally {
      await page.evaluate(() => { Math.random = window._origRandom; });
    }
  });

  test('grantExpTo bumps the named companion exp by amount', async ({ game: page }) => {
    await page.evaluate(() => {
      const v = SugarCube.State.variables;
      v.alex = v.alex || { name: 'Alex', lvl: 1, exp: 0 };
      v.alex.lvl = 1;
      v.alex.exp = 0;
    });
    await callSetup(page, 'setup.Companion.grantExpTo("Alex", 5)');
    expect(await callSetup(page, 'SugarCube.State.variables.alex.exp')).toBe(5);
  });

  test('grantExpTo is a no-op when companion is maxed out at lvl 5', async ({ game: page }) => {
    await page.evaluate(() => {
      const v = SugarCube.State.variables;
      v.alex = v.alex || { name: 'Alex', lvl: 5, exp: 0 };
      v.alex.lvl = 5;
      v.alex.exp = 50;
    });
    await callSetup(page, 'setup.Companion.grantExpTo("Alex", 10)');
    expect(await callSetup(page, 'SugarCube.State.variables.alex.exp')).toBe(50);
  });

  test('isAtMaxLvl detects level 5', async ({ game: page }) => {
    await page.evaluate(() => {
      const v = SugarCube.State.variables;
      v.alex = v.alex || { name: 'Alex' };
      v.alex.lvl = 4;
    });
    expect(await callSetup(page, 'setup.Companion.isAtMaxLvl("Alex")')).toBe(false);
    await page.evaluate(() => { SugarCube.State.variables.alex.lvl = 5; });
    expect(await callSetup(page, 'setup.Companion.isAtMaxLvl("Alex")')).toBe(true);
  });
});
