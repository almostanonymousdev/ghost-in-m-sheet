const { test, expect } = require('@playwright/test');
const { openGame, resetGame, setVar, getVar, goToPassage, callSetup } = require('../helpers');
const { expectCleanPassage, expectNoErrors, setupActiveQuest } = require('./e2e-helpers');

test.describe('Missing Women — map, house search, events, clue, nun', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  // ── Rescue map ─────────────────────────────────────────────────

  test('rescue map renders 16 houses without errors', async () => {
    await setupActiveQuest(page, 'Victoria');
    await goToPassage(page, 'rescueMap');
    await expectCleanPassage(page);
    expect(await page.locator('.passage .housecard').count()).toBe(16);
  });

  test('selecting a house sets $rescueHouse and navigates to rescueHouse', async () => {
    await setupActiveQuest(page, 'Victoria');
    await goToPassage(page, 'rescueMap');
    await page.locator('.passage .icontextcity').first().click();
    await page.waitForFunction(() => SugarCube.State.passage === 'rescueHouse');
    expect(await getVar(page, 'rescueHouse')).toBe(1);
  });

  // ── Rescue house ───────────────────────────────────────────────

  test('wrong house shows "no one found" after search', async () => {
    test.setTimeout(10_000);
    await setupActiveQuest(page, 'Victoria');
    await setVar(page, 'randomRescuePhotoNumber', 5);
    await setVar(page, 'rescueHouse', 3);

    await goToPassage(page, 'rescueHouse');
    await expectCleanPassage(page);

    await page.locator('.passage .usebtn').first().click();
    await page.waitForFunction(() =>
      document.querySelector('.passage').textContent.includes('find no one')
    );

    expect(await page.locator('.passage').textContent()).toContain('find no one');
    expect(await getVar(page, 'mc.energy')).toBe(9);
  });

  test('correct house at stage 0 triggers auto success', async () => {
    test.setTimeout(10_000);
    await setupActiveQuest(page, 'Victoria');
    await setVar(page, 'randomRescuePhotoNumber', 5);
    await setVar(page, 'rescueHouse', 5);
    await setVar(page, 'rescueStage', 0);

    await goToPassage(page, 'rescueHouse');
    await page.locator('.passage .usebtn').first().click();
    await page.waitForFunction(() => SugarCube.State.passage === 'rescueEvent');
    await expectCleanPassage(page);
    expect(await page.locator('.passage').textContent()).toContain('abandoned house');
  });

  test('photo comparison — correct house', async () => {
    test.setTimeout(10_000);
    await setupActiveQuest(page, 'Victoria');
    await setVar(page, 'hasRescueClue', 1);
    await setVar(page, 'randomRescuePhotoNumber', 5);
    await setVar(page, 'rescueHouse', 5);

    await goToPassage(page, 'rescueHouse');
    await expectCleanPassage(page);

    const btn = page.locator('.passage .usebtn').filter({ hasText: 'Compare the house with the photo' });
    await expect(btn).toBeVisible();
    await btn.click();

    await page.waitForFunction(() => {
      const t = document.querySelector('.passage').textContent;
      return t.includes('this is the house') || t.includes("doesn't really look");
    });
    expect(await page.locator('.passage').textContent()).toContain('this is the house');
  });

  test('photo comparison — wrong house', async () => {
    test.setTimeout(10_000);
    await setupActiveQuest(page, 'Victoria');
    await setVar(page, 'hasRescueClue', 1);
    await setVar(page, 'randomRescuePhotoNumber', 5);
    await setVar(page, 'rescueHouse', 3);

    await goToPassage(page, 'rescueHouse');
    await page.locator('.passage .usebtn').filter({ hasText: 'Compare the house with the photo' }).click();

    await page.waitForFunction(() => {
      const t = document.querySelector('.passage').textContent;
      return t.includes("doesn't really look") || t.includes('this is the house');
    });
    expect(await page.locator('.passage').textContent()).toContain("doesn't really look");
  });

  test('no energy shows tired message', async () => {
    await setupActiveQuest(page, 'Victoria');
    await setVar(page, 'mc.energy', 0);
    await setVar(page, 'rescueHouse', 3);

    await goToPassage(page, 'rescueHouse');
    await expectCleanPassage(page);
    expect(await page.locator('.passage').textContent()).toContain('too tired');
  });

  test('quest failed shows too-late message', async () => {
    await setupActiveQuest(page, 'Victoria');
    await setVar(page, 'hasQuestForRescue', 2);
    await setVar(page, 'rescueHouse', 3);

    await goToPassage(page, 'rescueHouse');
    await expectCleanPassage(page);
    expect(await page.locator('.passage').textContent()).toContain('too late');
  });

  // ── Rescue event outcomes ──────────────────────────────────────

  test('rescueEvent at stage 0 renders success passage', async () => {
    await setupActiveQuest(page, 'Victoria');
    await setVar(page, 'rescueStage', 0);

    await goToPassage(page, 'rescueEvent');
    await expectCleanPassage(page);

    const text = await page.locator('.passage').textContent();
    expect(text).toContain('abandoned house');
    expect(text).toContain('Leave');
    expect(text).toContain('Continue');
  });

  test('rescueEvent at stage >= 2 renders possessed passage', async () => {
    await setupActiveQuest(page, 'Victoria');
    await setVar(page, 'rescueStage', 2);

    await goToPassage(page, 'rescueEvent');
    await expectCleanPassage(page);
    expect(await page.locator('.passage').textContent()).toContain('abandoned house');
    expect(await getVar(page, 'rescueQuestCD')).toBe(1);
  });

  test('rescueSuccess has Leave and Continue choices', async () => {
    await setupActiveQuest(page, 'Victoria');
    await setVar(page, 'rescueStage', 0);

    await goToPassage(page, 'rescueEvent');
    await expectCleanPassage(page);

    await expect(page.locator('.passage a').filter({ hasText: 'Leave' }).first()).toBeVisible();
    await expect(page.locator('.passage .usebtn').filter({ hasText: 'Continue' }).first()).toBeVisible();
  });

  // ── Clue discovery ─────────────────────────────────────────────

  test('rescueClueFound sets hasRescueClue to 1', async () => {
    await setupActiveQuest(page, 'Victoria');
    await setVar(page, 'hasRescueClue', 0);
    await setVar(page, 'return', 'OwaissaHallway');
    await setVar(page, 'equipment.emf', 2);

    await goToPassage(page, 'rescueClueFound');
    await expectCleanPassage(page);

    await page.locator('.passage .usebtn').first().click();
    await page.waitForFunction(() => SugarCube.State.variables.hasRescueClue === 1);
    expect(await getVar(page, 'hasRescueClue')).toBe(1);
  });

  test('rescueClueFound upgrades EMF to level 3', async () => {
    await setupActiveQuest(page, 'Victoria');
    await setVar(page, 'hasRescueClue', 0);
    await setVar(page, 'return', 'OwaissaHallway');
    await setVar(page, 'equipment.emf', 1);

    await goToPassage(page, 'rescueClueFound');
    await page.locator('.passage .usebtn').first().click();
    await page.waitForFunction(() => SugarCube.State.variables.equipment.emf === 3);
    expect(await getVar(page, 'equipment.emf')).toBe(3);
    await expectNoErrors(page);
  });

  // ── Nun quest resolution ───────────────────────────────────────

  test('ChurchNunQuest shows failure text when quest is 2', async () => {
    await setVar(page, 'relationshipWithRain', 3);
    await setVar(page, 'hasQuestForRescue', 2);
    await setVar(page, 'hasRescueClue', 0);
    await setVar(page, 'hours', 12);

    await goToPassage(page, 'ChurchNunQuest');
    await expectCleanPassage(page);
    expect(await page.locator('.passage').textContent()).toContain('experienced ghost hunter');
  });

  test('ChurchNunQuest shows success text when quest is 3', async () => {
    await setVar(page, 'relationshipWithRain', 3);
    await setVar(page, 'hasQuestForRescue', 3);
    await setVar(page, 'hasRescueClue', 0);
    await setVar(page, 'hours', 12);
    await setVar(page, 'equipment.spiritbox', 3);

    await goToPassage(page, 'ChurchNunQuest');
    await expectCleanPassage(page);
    expect(await page.locator('.passage').textContent()).toContain('thank you');
  });

  test('ChurchNunQuest resets hasRescueClue to 0', async () => {
    await setVar(page, 'relationshipWithRain', 3);
    await setVar(page, 'hasQuestForRescue', 3);
    await setVar(page, 'hasRescueClue', 1);
    await setVar(page, 'hours', 12);
    await setVar(page, 'equipment.spiritbox', 3);

    await goToPassage(page, 'ChurchNunQuest');
    expect(await getVar(page, 'hasRescueClue')).toBe(0);
  });

  test('failure decreases relationship with Rain', async () => {
    await setVar(page, 'relationshipWithRain', 3);
    await setVar(page, 'hasQuestForRescue', 2);
    await setVar(page, 'hasRescueClue', 0);
    await setVar(page, 'hours', 12);

    await goToPassage(page, 'ChurchNunQuest');
    expect(await getVar(page, 'relationshipWithRain')).toBe(2);
  });

  test('failure at relationship 0 does not go negative', async () => {
    await setVar(page, 'relationshipWithRain', 0);
    await setVar(page, 'hasQuestForRescue', 2);
    await setVar(page, 'hasRescueClue', 0);
    await setVar(page, 'hours', 12);

    await goToPassage(page, 'ChurchNunQuest');
    expect(await getVar(page, 'relationshipWithRain')).toBe(0);
  });
});
