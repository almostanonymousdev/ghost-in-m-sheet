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

  // Companion portraits used to omit the "characters/" prefix and resolve
  // to e.g. asset-placeholders/brook/brook.png (missing) instead of
  // .../characters/brook/brook.png. Exercise every catalogue entry through
  // the actual macros that consume the path.
  for (const name of ['Brook', 'Alice', 'Blake', 'Alex', 'Taylor', 'Casey']) {
    test(`${name} portrait + tier images resolve via Companion methods`, async () => {
      await resetGame(page);
      const paths = await page.evaluate((n) => {
        const c = SugarCube.setup.Companion.getByName(n);
        const out = { portrait: c.portraitPath(), tiers: [] };
        // chance 25 = tier 1, then the four entries from TIER_CHANCES.
        for (const ch of [25, 40, 55, 70, 90]) out.tiers.push(c.imagePath(ch));
        return out;
      }, name);
      const root = (await page.evaluate(() => SugarCube.setup.ImagePath)) + '/';
      const srcs = [paths.portrait, ...paths.tiers].map(p => root + p);
      assertSrcsResolve(srcs, `${name} catalogue paths`);
    });
  }

  // The footer companionLinks card is what shows in haunted-house rooms while
  // the companion is "with you" (showComp == 1). A regression in the cis
  // portrait path (missing "characters/" prefix) made Brook's small portrait
  // 404 here while every static reference elsewhere kept working.
  for (const name of ['Brook', 'Alice', 'Blake']) {
    test(`${name} active in a haunted-house room renders a real portrait`, async () => {
      await resetGame(page);
      await page.evaluate((n) => {
        const V = SugarCube.State.variables;
        V.companion = { name: n, sanity: 100, lust: 0 };
        if (V[n.toLowerCase()]) V[n.toLowerCase()].chosen = 1;
        V.isCompChosen = 1;
        V.showComp = 1;
        V.hauntedHouse = 'owaissa';
      }, name);
      const srcs = await collectSrcs('<<companionLinks>>');
      expect(srcs.length).toBeGreaterThan(0);
      assertSrcsResolve(srcs, `${name} <<companionLinks>>`);

      const captionSrcs = await collectSrcs('<<include "StoryCaption">>');
      assertSrcsResolve(captionSrcs, `StoryCaption with ${name} active`);
    });
  }

  // CompanionSucceeded portrait (-happy / -sad) goes through outcomePortrait,
  // which had the same missing-prefix bug as portraitPath.
  for (const name of ['Brook', 'Alice', 'Blake']) {
    test(`${name} outcome portraits (happy + sad) resolve`, async () => {
      await resetGame(page);
      await page.evaluate((n) => {
        SugarCube.State.variables.companion = { name: n, sanity: 100, lust: 0 };
      }, name);
      const paths = await page.evaluate(() => ({
        happy: SugarCube.setup.Companion.outcomePortrait(true),
        sad:   SugarCube.setup.Companion.outcomePortrait(false),
      }));
      const root = (await page.evaluate(() => SugarCube.setup.ImagePath)) + '/';
      assertSrcsResolve([root + paths.happy, root + paths.sad], `${name} outcomePortrait`);
    });
  }

  // Catch-all sweep: render every story passage via Wikifier under a small
  // set of scenarios and assert every emitted img/source src resolves to a
  // file. The static checker can't see runtime-built paths (e.g. anything
  // assembled inside a [script] passage). This pass is the safety net for
  // that whole class — any controller that returns a wrong path will
  // surface here when its consumer renders.
  //
  // Scenarios cover the major branches that swap which assets get rendered:
  //   default            — fresh game, no companion, no hunt
  //   companion=Brook    — cis companion active, in Owaissa, MC dressed
  //   companion=Alice    — same shape, different cis (Alice files differ)
  //   companion=Blake    — same shape, third cis variant
  //   companion=Casey    — trans companion, transPicture set, in Elm
  //   hunt               — active hunt + possessed mode (different room art)
  test('every passage in every scenario emits only resolvable srcs', async () => {
    test.setTimeout(180000);

    // Parse passage names + tags from the .tw source. Reading the source is
    // simpler and more stable than poking at SugarCube.Story internals across
    // versions, and the build already validates header well-formedness via
    // the lint suite.
    const PASSAGE_HEADER = /^::\s*([^\[\{\n]+?)(?:\s*\[([^\]]*)\])?(?:\s*\{[^}]*\})?\s*$/;
    const SKIP_PASSAGES = new Set([
      'StoryData', 'StoryInit', 'StoryCaption', 'StoryStylesheet',
      'StoryTitle', 'StoryAuthor', 'StoryMenu',
      'PassageHeader', 'PassageFooter', 'PassageDone', 'PassageReady',
    ]);
    const passageNames = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (!entry.name.endsWith('.tw')) continue;
        const lines = fs.readFileSync(full, 'utf-8').split('\n');
        for (const line of lines) {
          const m = line.match(PASSAGE_HEADER);
          if (!m) continue;
          const title = m[1].trim();
          const tags = (m[2] || '').trim().split(/\s+/).filter(Boolean);
          if (SKIP_PASSAGES.has(title)) continue;
          if (tags.some(t => t === 'script' || t === 'stylesheet' || t === 'widget')) continue;
          passageNames.push(title);
        }
      }
    };
    walk(path.join(REPO_ROOT, 'passages'));

    expect(passageNames.length, 'expected to find some renderable passages').toBeGreaterThan(50);

    const scenarios = [
      { label: 'default', setup: () => {} },
      {
        label: 'companion=Brook in Owaissa',
        setup: () => {
          const V = SugarCube.State.variables;
          V.companion = { name: 'Brook', sanity: 100, lust: 0, decreaseSanity: 10, lvl: 3, exp: 0, expForNextLvl: 60 };
          if (V.brook) V.brook.chosen = 1;
          V.isCompChosen = 1;
          V.showComp = 1;
          V.chosenPlan = 'Plan1';
          V.hauntedHouse = 'owaissa';
        },
      },
      {
        label: 'companion=Alice in Owaissa',
        setup: () => {
          const V = SugarCube.State.variables;
          V.companion = { name: 'Alice', sanity: 60, lust: 20, decreaseSanity: 10, lvl: 3, exp: 0, expForNextLvl: 60 };
          if (V.alice) V.alice.chosen = 1;
          V.isCompChosen = 1;
          V.showComp = 1;
          V.chosenPlan = 'Plan1';
          V.hauntedHouse = 'owaissa';
        },
      },
      {
        label: 'companion=Blake in Elm',
        setup: () => {
          const V = SugarCube.State.variables;
          V.companion = { name: 'Blake', sanity: 30, lust: 60, decreaseSanity: 10, lvl: 4, exp: 0, expForNextLvl: 100 };
          if (V.blake) V.blake.chosen = 1;
          V.isCompChosen = 1;
          V.showComp = 1;
          V.chosenPlan = 'Plan1';
          V.hauntedHouse = 'elm';
        },
      },
      {
        label: 'companion=Casey (trans) in Elm',
        setup: () => {
          const V = SugarCube.State.variables;
          V.companion = { name: 'Casey', sanity: 80, lust: 30, decreaseSanity: 10, lvl: 5 };
          if (V.casey) V.casey.chosen = 1;
          V.isCompChosen = 1;
          V.showComp = 1;
          V.transPicture = 3;
          V.transFirstStage = 1;
          V.hauntedHouse = 'elm';
        },
      },
      {
        label: 'hunt active',
        setup: () => {
          SugarCube.setup.Ghosts.startHunt('Shade');
          SugarCube.setup.Ghosts.setHuntMode(SugarCube.setup.Ghosts.HuntMode.ACTIVE);
        },
      },
    ];

    // Aggregate broken srcs across all (scenario, passage) pairs so a single
    // run reports every site where the issue surfaces, not just the first.
    const broken = [];
    const seen = new Set();

    for (const scenario of scenarios) {
      await resetGame(page);
      await page.evaluate(scenario.setup);

      // Render all passages in a single page.evaluate call — one round-trip
      // per scenario instead of one per passage keeps the sweep snappy.
      const results = await page.evaluate((names) => {
        const out = [];
        for (const name of names) {
          const c = document.createElement('div');
          try {
            new SugarCube.Wikifier(c, '<<include "' + name.replace(/"/g, '\\"') + '">>');
          } catch (e) {
            // Wikifier already inlines macro errors as <span class="error">.
            // A thrown error here means the include itself failed; skip and
            // move on — the sweep is about catching srcs that DO render
            // pointing at the wrong place, not coverage of every passage.
            continue;
          }
          c.querySelectorAll('img, source').forEach(el => {
            const src = el.getAttribute('src');
            if (src) out.push({ src, passage: name });
          });
        }
        return out;
      }, passageNames);

      for (const { src, passage } of results) {
        const key = scenario.label + '|' + src;
        if (seen.has(key)) continue;
        seen.add(key);

        if (!assetRoots.some(r => src.startsWith(r + '/'))) continue;
        // Out-of-context renders surface as paths containing the literal
        // string "undefined" (JS string-concat against an unset variable).
        // That's a separate class of bug — passages whose render expects
        // a controller to have populated quest state — and is not what
        // this src-resolution sweep is trying to catch. Skip them.
        if (/\/undefined(?:[._\/]|$)/.test(src)) continue;
        if (!MEDIA_EXT_RE.test(src)) {
          broken.push(`[${scenario.label}] ${passage}: ${src}  (no media extension)`);
          continue;
        }
        try {
          if (!fs.statSync(path.join(REPO_ROOT, src)).isFile()) {
            broken.push(`[${scenario.label}] ${passage}: ${src}  (file not found)`);
          }
        } catch {
          broken.push(`[${scenario.label}] ${passage}: ${src}  (file not found)`);
        }
      }
    }

    expect(
      broken,
      `${broken.length} passage(s) emitted broken image/video src(s):\n  ${broken.join('\n  ')}`
    ).toHaveLength(0);
  });
});
