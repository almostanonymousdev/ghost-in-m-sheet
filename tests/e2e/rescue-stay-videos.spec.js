const fs = require('fs');
const path = require('path');
const { test, expect } = require('../fixtures');
const { setVar, callSetup, goToPassage } = require('../helpers');

const REPO_ROOT = path.join(__dirname, '..', '..');

/**
 * RescueStay video coverage (setup.MissingWomen.rescueStayConfig + the
 * <<rescueStay>> widget in passages/missing_women/widgetRescue.tw).
 *
 * Regression: the Ash "stay" branch built its cycled clip path from
 *   _stayCfg.stay.base + _videoIndex + ".mp4"
 * with base "AshBoth", but the files on disk are ash-both1.mp4..ash-both5.mp4.
 * Every cycled <<video>> therefore pointed at a non-existent AshBoth*.mp4 and
 * the player saw an empty video element ("the video doesn't show up during the
 * Ash rescue"). The `(_videoIndex + 1) % 6` cycle compounded it, walking onto
 * index 0 / past 5. check_assets.py could not catch it because the path is
 * built by string concatenation, which the static scanner skips.
 *
 * These specs pin both halves: (1) every girl's stay clip set resolves on
 * disk, and (2) driving the Ash widget through a full cycle only ever renders
 * videos that exist.
 */
test.describe('RescueStay videos', () => {

  /** Assert a path relative to setup.ImagePath resolves to a file on disk. */
  function assertAssetExists(imagePath, relUnderImagePath, context) {
    expect(relUnderImagePath, `${context}: expected a non-empty path`).toBeTruthy();
    const abs = path.join(REPO_ROOT, imagePath, relUnderImagePath);
    expect(
      fs.existsSync(abs),
      `${context}: referenced video does not exist on disk → ${imagePath}/${relUnderImagePath}`,
    ).toBe(true);
  }

  /** Drop the leading "<imagePath>/" the <<video>> macro prepends to a src. */
  function stripImagePath(imagePath, src) {
    if (!src) return src;
    const prefix = imagePath + '/';
    return src.startsWith(prefix) ? src.slice(prefix.length) : src;
  }

  test('every rescue-stay clip resolves on disk for every girl', async ({ game: page }) => {
    const imagePath = await callSetup(page, 'setup.ImagePath');
    const girls = await callSetup(page, 'setup.MissingWomen.rescueGirlNames()');
    expect(girls.length).toBeGreaterThan(0);

    for (const girl of girls) {
      const cfg = await callSetup(page, `setup.MissingWomen.rescueStayConfig(${JSON.stringify(girl)})`);
      expect(cfg, `rescueStayConfig(${girl})`).not.toBeNull();
      const { slug, stay } = cfg;
      // stayClipPath(slug, file) = "characters/rescue/<slug>/<file>"
      const clip = (file) => `characters/rescue/${slug}/${file}`;

      assertAssetExists(imagePath, clip(stay.endClip), `${girl} stay end clip`);

      if (stay.kind === 'toggle') {
        assertAssetExists(imagePath, clip(stay.base + '1.mp4'), `${girl} stay toggle clip 1`);
        assertAssetExists(imagePath, clip(stay.base + '2.mp4'), `${girl} stay toggle clip 2`);
      } else if (stay.kind === 'ash') {
        assertAssetExists(imagePath, clip(stay.initial), `${girl} stay intro clip`);
        // The widget cycles indices 1..5 (see widgetRescue.tw `rescueStay`).
        for (let i = 1; i <= 5; i++) {
          assertAssetExists(imagePath, clip(stay.base + i + '.mp4'), `${girl} stay cycle clip ${i}`);
        }
      } else {
        throw new Error(`${girl}: unknown stay kind "${stay.kind}"`);
      }
    }
  });

  test('Ash stay cycle renders only on-disk videos across repeated clicks', async ({ game: page }) => {
    const imagePath = await callSetup(page, 'setup.ImagePath');
    await setVar(page, 'currentRescueGirl', 'Ash');
    await goToPassage(page, 'RescueStay');

    const containerSrc = () =>
      page.locator('#rescueStayContainer video source').first().getAttribute('src');

    // Intro clip.
    assertAssetExists(imagePath, stripImagePath(imagePath, await containerSrc()), 'Ash stay intro render');

    const link = page.locator('a').filter({ hasText: 'one after the other' }).first();
    const seen = new Set();
    // Click past one full cycle (5 distinct clips) and into the wrap-around so
    // an off-by-one / modulo bug that re-shows the intro or runs off the end
    // would surface as a missing file or an unexpected distinct-count.
    for (let i = 0; i < 7; i++) {
      await link.click();
      const src = stripImagePath(imagePath, await containerSrc());
      assertAssetExists(imagePath, src, `Ash stay cycle render after click ${i + 1}`);
      seen.add(src);
    }
    // ash-both1.mp4 .. ash-both5.mp4 — exactly five distinct clips, no index-0
    // intro re-show, no out-of-range clip.
    expect(seen.size, `distinct cycle clips: ${[...seen].join(', ')}`).toBe(5);

    // No SugarCube error span rendered (the widget wikified cleanly).
    expect(await page.locator('.passage .error').count()).toBe(0);
  });
});
