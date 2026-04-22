const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { openGame, resetGame } = require('./helpers');

const REPO_ROOT = path.join(__dirname, '..');
const MEDIA_EXT_RE = /\.(jpg|jpeg|png|webp|gif|mp4|webm)$/i;

/**
 * Render key UI passages and assert every <img>/<source> src resolves to a
 * real file. Catches the class of bug where a macro silently swallows part
 * of its argument list and emits an src pointing at a directory (e.g.
 * `<<image "img/icons/" + _var>>` rendering as `src="…/img/icons/"` when
 * the macro fails to concatenate). The static asset checker skips dynamic
 * paths on purpose, so it can't see runtime-produced dead refs — this spec
 * exercises the macros as the engine actually runs them.
 */

test.describe('rendered image/video refs resolve to files', () => {
  let page;
  let imagePath;
  let assetRoots;

  test.beforeAll(async ({ browser }) => {
    page = await openGame(browser);
    imagePath = await page.evaluate(() => SugarCube.setup.ImagePath);
    // The runtime can emit either the configured ImagePath (e.g.
    // "asset-placeholders") or the hard-coded "assets/" prefix used by the
    // CSS-url rewriter for StoryStylesheet. Accept both.
    assetRoots = Array.from(new Set([imagePath, 'assets', 'asset-placeholders']));
  });

  test.afterAll(async () => {
    if (page) await page.close();
  });

  async function collectSrcs(wikitext) {
    return await page.evaluate((wt) => {
      const c = document.createElement('div');
      new SugarCube.Wikifier(c, wt);
      const out = [];
      c.querySelectorAll('img, source').forEach(el => {
        const src = el.getAttribute('src');
        if (src) out.push(src);
      });
      return out;
    }, wikitext);
  }

  function assertSrcsResolve(srcs, label) {
    const broken = [];
    for (const src of srcs) {
      // Ignore external URLs, data URIs, and anything outside our asset roots.
      if (!assetRoots.some(r => src.startsWith(r + '/'))) continue;

      if (!MEDIA_EXT_RE.test(src)) {
        broken.push(`${src}  (no media extension — unresolved macro arg?)`);
        continue;
      }
      const abs = path.join(REPO_ROOT, src);
      try {
        if (!fs.statSync(abs).isFile()) {
          broken.push(`${src}  (resolved to a directory, not a file)`);
        }
      } catch {
        broken.push(`${src}  (file not found)`);
      }
    }
    expect(
      broken,
      `${label} rendered ${broken.length} broken image/video src(s):\n  ${broken.join('\n  ')}`
    ).toHaveLength(0);
  }

  test('StoryCaption (left panel) resolves every img/source src', async () => {
    await resetGame(page);
    const srcs = await collectSrcs('<<include "StoryCaption">>');
    expect(srcs.length).toBeGreaterThan(0);
    assertSrcsResolve(srcs, 'StoryCaption');
  });

  test('MC bottom slot resolves a real file for each clothing option', async () => {
    for (const which of ['jeans', 'shorts', 'skirt']) {
      await resetGame(page);
      await page.evaluate((s) => {
        const V = SugarCube.State.variables;
        V.jeansState = s === 'jeans' ? 'worn' : 'not worn';
        V.shortsState = s === 'shorts' ? 'worn' : 'not worn';
        V.skirtState = s === 'skirt' ? 'worn' : 'not worn';
      }, which);
      const srcs = await collectSrcs('<<include "MC">>');
      assertSrcsResolve(srcs, `MC with ${which} worn`);
    }
  });

  test('BodyModification resolves an icon for every piercing slot', async () => {
    await resetGame(page);
    await page.evaluate(() => {
      const V = SugarCube.State.variables;
      SugarCube.setup.piercingList.forEach(p => { V[p.var] = 'worn'; });
    });
    const srcs = await collectSrcs('<<include "BodyModification">>');
    expect(srcs.length).toBeGreaterThan(0);
    assertSrcsResolve(srcs, 'BodyModification (all piercings worn)');
  });
});
