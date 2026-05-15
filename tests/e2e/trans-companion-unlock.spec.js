const { test, expect } = require('../fixtures');
const { setVar, getVar, callSetup, goToPassage } = require('../helpers');

/**
 * Trans companion (Alex / Taylor / Casey) unlock + selection:
 *
 *   - Alex always shown on Internet
 *   - Taylor visible only when subscribers() >= 5
 *   - Casey visible only when subscribers() >= 10
 *   - pickTransCompanion(name) clones the source NPC onto $companion,
 *     selects it, and resets per-hunt trans-event bookkeeping
 *     (chosenPlan, transStart, transPicture, transFirstStage).
 */
test.describe('Trans companion unlock', () => {
  test.describe.configure({ timeout: 20_000 });

  async function setSubscribers(page, n) {
    await page.evaluate((v) => {
      const w = SugarCube.State.variables.webcam = SugarCube.State.variables.webcam || {};
      w.subscribers = v;
    }, n);
  }

  // The Choose-X links live inside a <<linkreplace>>, so clicking the
  // "Find a partner..." link is what reveals them.
  async function revealPartners(page) {
    await page.locator('a.macro-linkreplace').filter({ hasText: /Find a partner/ }).click();
    await page.waitForFunction(() =>
      document.querySelector('.passage').textContent.includes('Choose Alex')
      || document.querySelector('.passage').textContent.includes('responded to your offer'),
      null,
      { timeout: 3000 }
    ).catch(() => {});
  }

  test('Alex is always present on Internet, regardless of subscribers', async ({ game: page }) => {
    await setSubscribers(page, 0);
    await goToPassage(page, 'Internet');
    await revealPartners(page);
    const text = await page.evaluate(() => document.querySelector('.passage').textContent);
    expect(text).toMatch(/Choose Alex/);
    expect(text).not.toMatch(/Choose Taylor/);
    expect(text).not.toMatch(/Choose Casey/);
  });

  test('Taylor unlocks at 5 subscribers, Casey still locked', async ({ game: page }) => {
    await setSubscribers(page, 5);
    await goToPassage(page, 'Internet');
    await revealPartners(page);
    const text = await page.evaluate(() => document.querySelector('.passage').textContent);
    expect(text).toMatch(/Choose Taylor/);
    expect(text).not.toMatch(/Choose Casey/);
  });

  test('Casey unlocks at 10 subscribers', async ({ game: page }) => {
    await setSubscribers(page, 10);
    await goToPassage(page, 'Internet');
    await revealPartners(page);
    const text = await page.evaluate(() => document.querySelector('.passage').textContent);
    expect(text).toMatch(/Choose Alex/);
    expect(text).toMatch(/Choose Taylor/);
    expect(text).toMatch(/Choose Casey/);
  });

  test('pickTransCompanion("Alex") sets $companion + selection flags', async ({ game: page }) => {
    await page.evaluate(() => {
      SugarCube.State.variables.transFirstStage = 1;
      SugarCube.State.variables.chosenPlan = 4;
      SugarCube.State.variables.transStart = 5;
      SugarCube.State.variables.transPicture = 3;
    });
    await callSetup(page, 'setup.Companion.pickTransCompanion("Alex")');

    expect(await getVar(page, 'companion.name')).toBe('Alex');
    expect(await callSetup(page, 'SugarCube.State.variables.alex.chosen')).toBe(1);
    expect(await getVar(page, 'chosenPlan')).toBe(0);
    expect(await getVar(page, 'transStart')).toBe(0);
    expect(await getVar(page, 'transPicture')).toBe(0);
    expect(await callSetup(page, 'SugarCube.State.variables.transFirstStage')).toBeUndefined();
  });

  test('pickTransCompanion routes to all three trans NPCs', async ({ game: page }) => {
    for (const name of ['Alex', 'Taylor', 'Casey']) {
      await callSetup(page, `setup.Companion.pickTransCompanion("${name}")`);
      expect(await getVar(page, 'companion.name')).toBe(name);
      expect(await callSetup(page, 'setup.Companion.isTransByName(setup.Companion.name())')).toBe(true);
    }
  });

  test('markTransFirstStage stamps the right portrait index per companion', async ({ game: page }) => {
    const cases = [
      { name: 'Alex',  idx: 1 },
      { name: 'Taylor', idx: 2 },
      { name: 'Casey', idx: 3 },
    ];
    for (const c of cases) {
      await page.evaluate((n) => {
        SugarCube.State.variables.transFirstStage = undefined;
        SugarCube.State.variables.transPicture = 0;
        SugarCube.setup.Companion.pickTransCompanion(n);
        SugarCube.setup.Companion.markTransFirstStage();
      }, c.name);
      expect(await getVar(page, 'transPicture')).toBe(c.idx);
      expect(await callSetup(page, 'setup.Companion.isTransFirstStageSet()')).toBe(true);
    }
  });

  test('stateFor returns the underlying NPC stat object', async ({ game: page }) => {
    const alex = await callSetup(page, 'setup.Companion.stateFor("alex")');
    expect(alex).toBeDefined();
    expect(alex.name).toBe('Alex');
    const casey = await callSetup(page, 'setup.Companion.stateFor("casey")');
    expect(casey).toBeDefined();
    expect(casey.name).toBe('Casey');
    expect(await callSetup(page, 'setup.Companion.stateFor("nobody")')).toBeUndefined();
  });

  test('isTransByName recognizes the 3 trans companions', async ({ game: page }) => {
    expect(await callSetup(page, 'setup.Companion.isTransByName("Alex")')).toBe(true);
    expect(await callSetup(page, 'setup.Companion.isTransByName("Taylor")')).toBe(true);
    expect(await callSetup(page, 'setup.Companion.isTransByName("Casey")')).toBe(true);
    expect(await callSetup(page, 'setup.Companion.isTransByName("Brook")')).toBe(false);
    expect(await callSetup(page, 'setup.Companion.isTransByName("Alice")')).toBe(false);
  });
});
