const { test, expect } = require('@playwright/test');
const { openGame, goToPassage } = require('./helpers');

/**
 * Renders a Twee fragment via SugarCube's $.wiki() and returns the
 * resulting innerHTML. Avoids creating a real passage so tests stay
 * isolated from the live Story state.
 */
async function renderTwee(page, twee) {
  return page.evaluate((src) => {
    const div = document.createElement('div');
    jQuery(div).wiki(src);
    return div.innerHTML;
  }, twee);
}

test.describe('SugarCube Settings — mute all videos toggle', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });

  test.beforeEach(async () => {
    await page.evaluate(() => SugarCube.Setting.setValue('muteAllVideos', true));
    await goToPassage(page, 'Start');
  });

  test('muteAllVideos is registered with default true', async () => {
    expect(await page.evaluate(() => SugarCube.Setting.has('muteAllVideos'))).toBe(true);
    expect(await page.evaluate(() => SugarCube.settings.muteAllVideos)).toBe(true);
  });

  test('Setting.setValue flips the toggle', async () => {
    await page.evaluate(() => SugarCube.Setting.setValue('muteAllVideos', false));
    expect(await page.evaluate(() => SugarCube.settings.muteAllVideos)).toBe(false);
  });

  test('muteAllVideos lives in SugarCube.settings, not State.variables', async () => {
    const inState = await page.evaluate(() =>
      Object.prototype.hasOwnProperty.call(SugarCube.State.variables, 'muteAllVideos'));
    expect(inState).toBe(false);
  });

  test('<<video>> emits muted attribute when toggle is ON', async () => {
    const html = await renderTwee(page, '<<video "characters/mc/bra-off.webm">>');
    expect(html).toContain('<video');
    expect(html).toContain('muted');
  });

  test('<<video>> still mutes when caller passes muted:false but toggle is ON', async () => {
    const html = await renderTwee(page, '<<video "scenes/cursed-home/bath1.webm" { muted: false }>>');
    expect(html).toContain('muted');
  });

  test('<<video>> respects muted:false when toggle is OFF', async () => {
    await page.evaluate(() => SugarCube.Setting.setValue('muteAllVideos', false));
    const html = await renderTwee(page, '<<video "scenes/cursed-home/bath1.webm" { muted: false }>>');
    expect(html).not.toContain('muted');
  });

  test('<<video>> default-mutes even with toggle OFF (existing behavior)', async () => {
    await page.evaluate(() => SugarCube.Setting.setValue('muteAllVideos', false));
    const html = await renderTwee(page, '<<video "characters/mc/bra-off.webm">>');
    expect(html).toContain('muted');
  });
});
