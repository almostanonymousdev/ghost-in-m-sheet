const { test, expect } = require('@playwright/test');
const { openGame, resetGame, setVar, getVar, goToPassage, callSetup } = require('../helpers');
const { expectCleanPassage, expectNoErrors, setupActiveQuest } = require('./e2e-helpers');

const GIRLS = ['Victoria', 'Jade', 'Julia', 'Nadia', 'Ash'];

test.describe('Missing Women — rescue girls, possession, stay', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  // ── Per-girl rescue passages ───────────────────────────────────

  for (const girl of GIRLS) {
    test(`${girl}: passage renders without errors (with holy water)`, async () => {
      test.setTimeout(10_000);
      await setupActiveQuest(page, girl);
      await setVar(page, 'holyWaterIsCollected', 1);

      await goToPassage(page, 'rescue' + girl);
      await expectCleanPassage(page);
      expect(await page.locator('.passage').textContent()).toContain(girl);
    });

    test(`${girl}: holy water option appears when collected`, async () => {
      test.setTimeout(10_000);
      await setupActiveQuest(page, girl);
      await setVar(page, 'holyWaterIsCollected', 1);

      await goToPassage(page, 'rescue' + girl);
      await expectCleanPassage(page);
      expect(await page.locator('.passage').textContent()).toContain('holywater');
    });

    test(`${girl}: no holy water shows missing message`, async () => {
      test.setTimeout(10_000);
      await setupActiveQuest(page, girl);
      await setVar(page, 'holyWaterIsCollected', 0);

      await goToPassage(page, 'rescue' + girl);
      await expectCleanPassage(page);
      expect(await page.locator('.passage').textContent()).toContain("didn't bring any holy water");
    });
  }

  // ── Possession flow ────────────────────────────────────────────

  for (const girl of GIRLS) {
    test(`rescuePossessed dispatches to ${girl}'s possession passage`, async () => {
      test.setTimeout(10_000);
      await setupActiveQuest(page, girl);
      await setVar(page, 'rescueStage', 2);

      await goToPassage(page, 'rescueEvent');
      await expectCleanPassage(page);

      await page.locator('.passage .usebtn').filter({ hasText: 'Continue' }).first().click();

      await page.waitForFunction(() => {
        const text = document.querySelector('.passage').textContent;
        return text.includes('Oh my god') || text.includes('Wake up') ||
               text.includes('Come closer') || text.includes('follow me');
      });

      expect(await getVar(page, 'hasQuestForRescue')).toBe(2);
      await expectNoErrors(page);
    });
  }

  test('rescuePossessed Leave option returns to rescueMap', async () => {
    test.setTimeout(10_000);
    await setupActiveQuest(page, 'Victoria');
    await setVar(page, 'rescueStage', 2);

    await goToPassage(page, 'rescueEvent');
    await expectCleanPassage(page);

    await page.locator('.passage a').filter({ hasText: 'Leave' }).first().click();
    await page.waitForFunction(() => SugarCube.State.passage === 'rescueMap');

    expect(await page.evaluate(() => SugarCube.State.passage)).toBe('rescueMap');
    await expectCleanPassage(page);
  });

  // ── Girl-specific possession passages ──────────────────────────

  for (const girl of GIRLS) {
    test(`${girl} possessed passage renders without errors`, async () => {
      test.setTimeout(10_000);
      await setupActiveQuest(page, girl);
      await setVar(page, 'hasQuestForRescue', 2);

      const passageName = await callSetup(page,
        `setup.MissingWomen.possessedPassageFor("${girl}")`);
      await goToPassage(page, passageName);
      await expectCleanPassage(page);
    });
  }

  // ── rescueStay ─────────────────────────────────────────────────

  for (const girl of GIRLS) {
    test(`rescueStay renders for ${girl} without errors`, async () => {
      test.setTimeout(10_000);
      await setupActiveQuest(page, girl);
      await setVar(page, 'mc.corruption', 10);
      await setVar(page, 'hasQuestForRescue', 2);

      await goToPassage(page, 'rescue' + girl);
      await goToPassage(page, 'rescueStay');
      await expectCleanPassage(page);
    });
  }
});
