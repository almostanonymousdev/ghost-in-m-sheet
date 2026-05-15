const { test, expect } = require('../fixtures');
const { setVar, getVar, callSetup, goToPassage } = require('../helpers');

/**
 * ChurchNunQuest passage branches on $hasQuestForRescue (the
 * rescueQuestStage). Quest stages:
 *
 *   AVAILABLE (0) - first-meet copy + initRainIfNeeded()
 *   ACTIVE    (1) - in-progress; no special branch (just the intro)
 *   FAILED    (2) - "send experienced ghost hunter" + relationship -1
 *   SUCCEEDED (3) - thank-you + spiritbox lvl 3 reward + relationship +1
 *
 * upgradeSpiritboxReward returns true only the first time (no-op once
 * spiritbox is already lvl 3).
 */
test.describe('Church nun quest', () => {
  test.describe.configure({ timeout: 20_000 });

  async function resetRain(page) {
    await page.evaluate(() => {
      delete SugarCube.State.variables.relationshipWithRain;
    });
  }

  test('initRainIfNeeded seeds relationship at 0 only on first call', async ({ game: page }) => {
    await resetRain(page);
    expect(await callSetup(page, 'setup.Church.hasMetRain()')).toBe(false);
    await callSetup(page, 'setup.Church.initRainIfNeeded()');
    expect(await callSetup(page, 'setup.Church.relationshipWithRain()')).toBe(0);
    expect(await callSetup(page, 'setup.Church.hasMetRain()')).toBe(true);
    // Re-call after a bump should not reset the relationship.
    await callSetup(page, 'setup.Church.adjustRainRelationship(3)');
    await callSetup(page, 'setup.Church.initRainIfNeeded()');
    expect(await callSetup(page, 'setup.Church.relationshipWithRain()')).toBe(3);
  });

  test('adjustRainRelationship adds and subtracts deltas', async ({ game: page }) => {
    await resetRain(page);
    await callSetup(page, 'setup.Church.initRainIfNeeded()');
    await callSetup(page, 'setup.Church.adjustRainRelationship(5)');
    expect(await callSetup(page, 'setup.Church.relationshipWithRain()')).toBe(5);
    await callSetup(page, 'setup.Church.adjustRainRelationship(-2)');
    expect(await callSetup(page, 'setup.Church.relationshipWithRain()')).toBe(3);
  });

  test('upgradeSpiritboxReward upgrades to lvl 3 once, returns false on repeat', async ({ game: page }) => {
    await page.evaluate(() => {
      SugarCube.setup.ToolController.setTier('spiritbox', 1);
    });
    expect(await callSetup(page, 'setup.ToolController.tierOf("spiritbox")')).toBe(1);
    expect(await callSetup(page, 'setup.Church.upgradeSpiritboxReward()')).toBe(true);
    expect(await callSetup(page, 'setup.ToolController.tierOf("spiritbox")')).toBe(3);
    expect(await callSetup(page, 'setup.Church.upgradeSpiritboxReward()')).toBe(false);
  });

  test('FAILED stage drops Rain relationship by 1', async ({ game: page }) => {
    await resetRain(page);
    await callSetup(page, 'setup.Church.initRainIfNeeded()');
    await callSetup(page, 'setup.Church.adjustRainRelationship(4)');
    // Stamp FAILED.
    await page.evaluate(() => {
      SugarCube.State.variables.hasQuestForRescue = SugarCube.setup.RescueQuestState.FAILED;
    });
    await goToPassage(page, 'ChurchNunQuest');
    const text = await page.evaluate(() => document.querySelector('.passage').textContent);
    expect(text).toMatch(/experienced ghost hunter/);
    expect(await callSetup(page, 'setup.Church.relationshipWithRain()')).toBe(3);
  });

  test('SUCCEEDED stage gives spiritbox + relationship +1', async ({ game: page }) => {
    await resetRain(page);
    await callSetup(page, 'setup.Church.initRainIfNeeded()');
    await page.evaluate(() => {
      SugarCube.State.variables.hasQuestForRescue = SugarCube.setup.RescueQuestState.SUCCEEDED;
      SugarCube.setup.ToolController.setTier('spiritbox', 1);
    });
    await goToPassage(page, 'ChurchNunQuest');
    const text = await page.evaluate(() => document.querySelector('.passage').textContent);
    expect(text).toMatch(/found our girl/);
    expect(text).toMatch(/lvl 3 Spiritbox/);
    expect(await callSetup(page, 'setup.ToolController.tierOf("spiritbox")')).toBe(3);
    expect(await callSetup(page, 'setup.Church.relationshipWithRain()')).toBe(1);
  });

  test('SUCCEEDED with spiritbox already at lvl 3 still bumps relationship, no reward copy', async ({ game: page }) => {
    await resetRain(page);
    await callSetup(page, 'setup.Church.initRainIfNeeded()');
    await page.evaluate(() => {
      SugarCube.State.variables.hasQuestForRescue = SugarCube.setup.RescueQuestState.SUCCEEDED;
      SugarCube.setup.ToolController.setTier('spiritbox', 3);
    });
    await goToPassage(page, 'ChurchNunQuest');
    const text = await page.evaluate(() => document.querySelector('.passage').textContent);
    expect(text).toMatch(/found our girl/);
    expect(text).not.toMatch(/lvl 3 Spiritbox/);
    expect(await callSetup(page, 'setup.Church.relationshipWithRain()')).toBe(1);
  });
});
