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
    await page.evaluate(() => SugarCube.Setting.setValue('muteAllVideos', false));
    await goToPassage(page, 'Start');
  });

  test('muteAllVideos is registered with default false', async () => {
    expect(await page.evaluate(() => SugarCube.Setting.has('muteAllVideos'))).toBe(true);
    expect(await page.evaluate(() => SugarCube.settings.muteAllVideos)).toBe(false);
  });

  test('Setting.setValue flips the toggle', async () => {
    await page.evaluate(() => SugarCube.Setting.setValue('muteAllVideos', true));
    expect(await page.evaluate(() => SugarCube.settings.muteAllVideos)).toBe(true);
  });

  test('muteAllVideos lives in SugarCube.settings, not State.variables', async () => {
    const inState = await page.evaluate(() =>
      Object.prototype.hasOwnProperty.call(SugarCube.State.variables, 'muteAllVideos'));
    expect(inState).toBe(false);
  });

  test('<<video>> defaults to unmuted (no muted attribute)', async () => {
    const html = await renderTwee(page, '<<video "characters/mc/bra-off.webm">>');
    expect(html).toContain('<video');
    expect(html).not.toMatch(/\smuted(\s|>|=)/);
  });

  test('<<video>> respects explicit muted: true', async () => {
    const html = await renderTwee(page, '<<video "characters/mc/bra-off.webm" { muted: true }>>');
    expect(html).toMatch(/\smuted(\s|>|=)/);
  });

  test('Settings toggle ON forces muted regardless of caller', async () => {
    await page.evaluate(() => SugarCube.Setting.setValue('muteAllVideos', true));
    const defaulted = await renderTwee(page, '<<video "characters/mc/bra-off.webm">>');
    const explicitFalse = await renderTwee(page, '<<video "characters/mc/bra-off.webm" { muted: false }>>');
    expect(defaulted).toMatch(/\smuted(\s|>|=)/);
    expect(explicitFalse).toMatch(/\smuted(\s|>|=)/);
  });
});
