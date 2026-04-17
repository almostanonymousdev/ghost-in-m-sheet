const { test, expect } = require('@playwright/test');
const { openGame, resetGame, setVar, getVar, goToPassage } = require('../helpers');
const { expectCleanPassage } = require('./e2e-helpers');

test.describe('Missing Women — task board', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  test('shows girls when evening, quest available, no cooldown', async () => {
    await setVar(page, 'relationshipWithRain', 1);
    await setVar(page, 'hasQuestForRescue', 0);
    await setVar(page, 'rescueQuestCD', 0);
    await setVar(page, 'rescueCD', 0);
    await setVar(page, 'hours', 20);

    await goToPassage(page, 'RescueTaskBoard');
    await expectCleanPassage(page);

    const text = await page.locator('.passage').textContent();
    expect(text).toContain('Take');
    expect(await page.locator('.passage .usebtn').count()).toBe(2);
  });

  test('shows active quest message when quest is 1', async () => {
    await setVar(page, 'relationshipWithRain', 1);
    await setVar(page, 'hasQuestForRescue', 1);
    await setVar(page, 'currentRescueGirl', 'Victoria');
    await setVar(page, 'rescueQuestCD', 0);
    await setVar(page, 'rescueCD', 0);
    await setVar(page, 'hours', 20);

    await goToPassage(page, 'RescueTaskBoard');
    await expectCleanPassage(page);

    const text = await page.locator('.passage').textContent();
    expect(text).toContain('already taken the missing poster');
  });

  test('shows daytime message when before 6 PM', async () => {
    await setVar(page, 'relationshipWithRain', 1);
    await setVar(page, 'hasQuestForRescue', 0);
    await setVar(page, 'rescueQuestCD', 0);
    await setVar(page, 'rescueCD', 0);
    await setVar(page, 'hours', 12);

    await goToPassage(page, 'RescueTaskBoard');
    await expectCleanPassage(page);

    expect(await page.locator('.passage').textContent()).toContain('6 PM');
  });

  test('shows cooldown message when on cooldown', async () => {
    await setVar(page, 'relationshipWithRain', 1);
    await setVar(page, 'hasQuestForRescue', 0);
    await setVar(page, 'rescueQuestCD', 1);
    await setVar(page, 'rescueCD', 0);
    await setVar(page, 'hours', 20);

    await goToPassage(page, 'RescueTaskBoard');
    await expectCleanPassage(page);

    expect(await page.locator('.passage').textContent()).toContain('Enough for today');
  });

  test('shows return-to-nun message when quest is 2 or 3', async () => {
    await setVar(page, 'relationshipWithRain', 1);
    await setVar(page, 'hasQuestForRescue', 2);
    await setVar(page, 'rescueQuestCD', 0);
    await setVar(page, 'rescueCD', 0);
    await setVar(page, 'hours', 20);

    await goToPassage(page, 'RescueTaskBoard');
    await expectCleanPassage(page);

    expect(await page.locator('.passage').textContent()).toContain('nun');
  });

  test('taking a quest sets correct variables', async () => {
    await setVar(page, 'relationshipWithRain', 1);
    await setVar(page, 'hasQuestForRescue', 0);
    await setVar(page, 'rescueQuestCD', 0);
    await setVar(page, 'rescueCD', 0);
    await setVar(page, 'hours', 20);

    await goToPassage(page, 'RescueTaskBoard');
    await page.locator('.passage .usebtn').first().click();
    await page.waitForFunction(() => SugarCube.State.variables.hasQuestForRescue === 1);

    expect(await getVar(page, 'hasQuestForRescue')).toBe(1);
    expect(await getVar(page, 'rescueStage')).toBe(0);
    expect(['Victoria', 'Julia', 'Jade', 'Nadia', 'Ash']).toContain(await getVar(page, 'currentRescueGirl'));

    const houseNum = await getVar(page, 'randomRescuePhotoNumber');
    expect(houseNum).toBeGreaterThanOrEqual(1);
    expect(houseNum).toBeLessThanOrEqual(16);
  });

  test('random girl selection produces 2 unique girls', async () => {
    await setVar(page, 'relationshipWithRain', 1);
    await setVar(page, 'hasQuestForRescue', 0);
    await setVar(page, 'rescueQuestCD', 0);
    await setVar(page, 'rescueCD', 0);
    await setVar(page, 'hours', 20);

    await goToPassage(page, 'RescueTaskBoard');

    const girls = await getVar(page, 'rescueRandomGirls');
    expect(girls).toHaveLength(2);
    expect(girls[0].name).not.toBe(girls[1].name);
    for (const g of girls) {
      expect(['Victoria', 'Julia', 'Jade', 'Nadia', 'Ash']).toContain(g.name);
    }
  });
});
