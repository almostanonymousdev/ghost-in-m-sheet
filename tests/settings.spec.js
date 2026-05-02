const { test, expect } = require('@playwright/test');
const { openGame } = require('./helpers');

test.describe('SugarCube Settings — mute all videos toggle', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });

  test.beforeEach(async () => {
    await page.evaluate(() => SugarCube.Setting.setValue('muteAllVideos', false));
  });

  test('muteAllVideos is registered with default false', async () => {
    expect(await page.evaluate(() => SugarCube.Setting.has('muteAllVideos'))).toBe(true);
    expect(await page.evaluate(() => SugarCube.settings.muteAllVideos)).toBe(false);
  });

  test('Setting.setValue flips the toggle and SugarCube.settings reflects it', async () => {
    await page.evaluate(() => SugarCube.Setting.setValue('muteAllVideos', true));
    expect(await page.evaluate(() => SugarCube.Setting.getValue('muteAllVideos'))).toBe(true);
    expect(await page.evaluate(() => SugarCube.settings.muteAllVideos)).toBe(true);
  });

  test('muteAllVideos lives in SugarCube.settings, not State.variables', async () => {
    const inState = await page.evaluate(() =>
      Object.prototype.hasOwnProperty.call(SugarCube.State.variables, 'muteAllVideos'));
    expect(inState).toBe(false);
  });
});
