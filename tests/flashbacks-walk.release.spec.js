/**
 * Flashback scene walker.
 *
 * For every entry in setup.Flashbacks.all():
 *   1. Reset the engine, mark the scene seen, and enterReplay(id).
 *   2. Engine.play the scene's scenePassage cold.
 *   3. Assert the rendered passage isn't "empty" -- it must have either
 *      a visible video / image or at least one visible forward link.
 *      An entry that lands the player on a blank page is a trap.
 *   4. Walk the visible link chain: at each step click the first
 *      reachable forward link, snapshot the destination, and verify:
 *        - we didn't bounce back to Flashbacks before exhausting the chain
 *          (a scene-too-short bug -- e.g. wikilink target not in
 *          replayPassages, so containReplay kicks us out)
 *        - the destination isn't an empty/error passage either
 *      Stop when we land on Flashbacks (clean exit), reach an entry's
 *      walkBudget, or run out of clickable links.
 *
 * Notes:
 *   - This runs only under the `release` Playwright project (named
 *     *.release.spec.js).
 *   - Uses openGame + Engine.restart between scenes so each entry sees a
 *     pristine state. enterReplay's snapshot is fine for in-game state
 *     restore, but between TEST cases we want a hard reset so prior
 *     scenes don't leak (e.g. corruption planted by Bedside Manners
 *     setup persisting into the next scene's stat checks).
 */
const { test, expect } = require('@playwright/test');
const { openGame, goToPassage, resetGame } = require('./helpers');

// Per-step click settle + tail idle (mirrors passage-walk-coverage.release.spec.js).
const CLICK_SETTLE_MS = 600;
const POST_CLICK_IDLE_MS = 60;

// Cap clicks per scene. Most scene chains are 1-4 hops; cap protects
// against accidental infinite walks (e.g. a deferred macro that
// re-renders the same link).
const MAX_HOPS = 12;

// Cap revisits to the same passage during a single scene walk. Two
// visits is normal (e.g. a passage that bounces through a transient
// step and comes back); three or more is a loop. The cursed-plaything
// trap (UseCursedItem -> FlashbackEnter -> UseCursedItem -> ...)
// surfaces as the player passage being entered three times before the
// hop cap fires.
const MAX_REVISITS = 2;

async function snapshotPassage(page) {
  return await page.evaluate(() => {
    const passageEl = document.querySelector('.passage');
    if (!passageEl) {
      return { passage: SugarCube.State.passage, hasPassage: false, links: [], hasMedia: false, hasText: false, errors: ['no .passage element'] };
    }
    const clone = passageEl.cloneNode(true);
    clone.querySelectorAll('.error-view, .error-source').forEach((n) => n.remove());
    const txt = (clone.textContent || '').trim();
    const errors = [];
    passageEl.querySelectorAll('.error-view .error, span.error').forEach((el) => {
      const t = (el.textContent || '').trim().slice(0, 200);
      if (t) errors.push('macro-error: ' + t);
    });
    const macroLeaks = txt.match(/<<[\/=\-a-zA-Z][^<>]{0,80}>>/g);
    if (macroLeaks) errors.push('unprocessed-macros: ' + macroLeaks.slice(0, 3).join(' | '));

    const hasMedia = !!passageEl.querySelector('img, video, source');
    const hasText = txt.length > 30;

    const root = document.querySelector('#passages') || document.body;
    // SugarCube tags the passage container .passage[data-passage=...]; exclude
    // it from the link sweep so it doesn't masquerade as the "first link"
    // (its textContent is the whole passage prose, its click is a no-op).
    const nodes = root.querySelectorAll('a, button.link-internal, .macro-link, [data-passage]:not(.passage)');
    const links = [];
    const seen = new Set();
    nodes.forEach((el, i) => {
      if (el.offsetParent === null) return;
      if (el.classList.contains('disabled-link')) return;
      if (el.classList.contains('disabled')) return;
      if (el.getAttribute('aria-disabled') === 'true') return;
      // Sidebar/HUD links (back button, save menu, etc.) — not part of
      // the scene chain. The catalogue cares about the passage body only.
      if (el.closest('#ui-bar') || el.closest('#story-caption') || el.closest('#story-menu')) return;
      const text = (el.textContent || '').trim();
      if (!text) return;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const target = el.getAttribute('data-passage') || '';
      const key = text.slice(0, 80) + '|' + target;
      if (seen.has(key)) return;
      seen.add(key);
      links.push({ idx: i, text: text.slice(0, 80), target });
    });

    return {
      passage: SugarCube.State.passage,
      hasPassage: true,
      links,
      hasMedia,
      hasText,
      errors,
    };
  });
}

async function clickLinkByIndex(page, idx) {
  const before = await page.evaluate(() => ({
    passage: SugarCube.State.passage,
    htmlLen: (document.querySelector('.passage') || document.body).innerHTML.length,
  }));
  await page.evaluate((i) => {
    const root = document.querySelector('#passages') || document.body;
    // Selector must match the one in snapshotPassage so node indices line up.
    const nodes = root.querySelectorAll('a, button.link-internal, .macro-link, [data-passage]:not(.passage)');
    const el = nodes[i];
    if (el) el.click();
  }, idx);
  try {
    await page.waitForFunction(
      (b) => {
        const cur = SugarCube.State.passage;
        const len = (document.querySelector('.passage') || document.body).innerHTML.length;
        return cur !== b.passage || len !== b.htmlLen;
      },
      before,
      { timeout: CLICK_SETTLE_MS }
    );
  } catch {
    return { settled: false };
  }
  await page.waitForTimeout(POST_CLICK_IDLE_MS);
  return { settled: true };
}

test.describe('flashbacks scene walk', () => {
  // Single browser page reused across all scene tests. Each scene
  // hard-resets between iterations via Engine.restart + enterReplay.
  let page;

  test.beforeAll(async ({ browser }) => {
    page = await openGame(browser, { seed: 1 });
  });

  test.afterAll(async () => {
    if (page) await page.close();
  });

  test('every catalogue scene renders content and walks to a clean exit', async () => {
    test.setTimeout(15 * 60 * 1000);

    const catalogue = await page.evaluate(() =>
      SugarCube.setup.Flashbacks.all().map((e) => ({
        id: e.id,
        title: e.title,
        location: e.location,
        scenePassage: e.scenePassage,
        replayPassages: e.replayPassages || null,
      }))
    );
    expect(catalogue.length).toBeGreaterThan(0);

    const failures = [];

    for (const entry of catalogue) {
      const label = `${entry.id} (${entry.title}) → ${entry.scenePassage}`;
      try {
        await resetGame(page);
        // SugarCube.setup.Flashbacks.cheatUnlockAll() so the gallery
        // links exist (some scenes also gate on $flashbacks.seen via
        // their own setup() — not relevant here, but keeps state sane).
        await page.evaluate((id) => {
          const F = SugarCube.setup.Flashbacks;
          F.markSeen(id);
          F.enterReplay(id);
        }, entry.id);

        // Route via FlashbackEnter (not direct goto) so history matches
        // what a player sees when they click Replay in the gallery —
        // i.e. [..., FlashbackEnter, scenePassage]. Scenes whose Back
        // link resolves `previous()` were silently passing the walker
        // because direct goToPassage left history at [Intro,
        // scenePassage] and previous() returned Intro instead of the
        // trap-target FlashbackEnter.
        await goToPassage(page, 'FlashbackEnter').catch(() => {});
        await page.waitForTimeout(POST_CLICK_IDLE_MS);

        const initial = await snapshotPassage(page);
        if (initial.errors.length) {
          failures.push(`${label} — render errors: ${initial.errors.join(' | ')}`);
          continue;
        }
        if (initial.passage === 'Flashbacks') {
          // Bounced back before any content rendered.
          failures.push(`${label} — bounced to Flashbacks on enterReplay (scene never rendered)`);
          continue;
        }
        if (!initial.hasMedia && !initial.hasText && initial.links.length === 0) {
          failures.push(`${label} — empty page (no media, no prose, no links)`);
          continue;
        }
        if (initial.links.length === 0 && !initial.hasMedia) {
          // Text-only with no exit is a soft trap.
          failures.push(`${label} — no clickable links and no media (text-only dead end)`);
          continue;
        }

        // Walk the chain. Click the first non-back link if available,
        // otherwise fall back to clicking any link. Stop on Flashbacks
        // (clean exit), error, or hop cap.
        let hop = 0;
        let lastSnap = initial;
        let trapped = false;
        let prematureExit = false;
        // Per-passage visit counter. Only bumped when the walker
        // actually changes passages (so linkreplace re-renders on the
        // same passage don't count). Catches alternating A <-> B
        // traps; same-passage traps (the cursed-plaything case, where
        // FlashbackEnter <<goto>>'s synchronously) are caught upstream
        // by the "none of N links advanced" check.
        const visits = Object.create(null);
        visits[initial.passage] = 1;
        while (hop < MAX_HOPS) {
          if (lastSnap.passage === 'Flashbacks') break;
          if (lastSnap.errors.length) {
            failures.push(`${label} hop ${hop} on ${lastSnap.passage} — errors: ${lastSnap.errors.join(' | ')}`);
            break;
          }
          if (lastSnap.links.length === 0) {
            // No links left and we're not on Flashbacks. Trap.
            trapped = true;
            failures.push(`${label} hop ${hop} on ${lastSnap.passage} — no forward links and not yet at Flashbacks`);
            break;
          }
          // Try each link in DOM order until one advances. Many sex-scene
          // passages have video-cycler links (`<<link "in various
          // positions">>`) that mutate only the <source src> attribute —
          // these don't change innerHTML length and don't change passage,
          // so the settle wait times out. Skip them and try the next link
          // rather than treating the scene as broken.
          const beforePassage = lastSnap.passage;
          let advanced = false;
          let triedLinks = [];
          for (const candidate of lastSnap.links) {
            triedLinks.push(candidate.text);
            const clicked = await clickLinkByIndex(page, candidate.idx);
            const afterPassage = await page.evaluate(() => SugarCube.State.passage);
            if (clicked.settled || afterPassage !== lastSnap.passage) {
              lastSnap = await snapshotPassage(page);
              advanced = true;
              break;
            }
            const tryAgain = await snapshotPassage(page);
            if (tryAgain.links.length !== lastSnap.links.length) {
              lastSnap = tryAgain;
              advanced = true;
              break;
            }
          }
          if (!advanced) {
            failures.push(`${label} hop ${hop} on ${lastSnap.passage} — none of ${triedLinks.length} links advanced (tried: ${triedLinks.slice(0, 3).map((t) => `"${t}"`).join(', ')})`);
            break;
          }
          // Premature bounce: gallery before any meaningful walk
          // (scene's chain wasn't long enough to need it).
          if (lastSnap.passage === 'Flashbacks' && hop === 0 && entry.replayPassages && entry.replayPassages.length > 1) {
            prematureExit = true;
            failures.push(`${label} hop 0 — first click bounced to Flashbacks despite replayPassages chain`);
            break;
          }
          // Revisit guard: only bump when the click actually changed
          // passages (linkreplace re-renders on the same passage are
          // not revisits). Bumping past MAX_REVISITS means the chain
          // is cycling across distinct passages (an A <-> B loop).
          if (lastSnap.passage !== beforePassage) {
            visits[lastSnap.passage] = (visits[lastSnap.passage] || 0) + 1;
            if (visits[lastSnap.passage] > MAX_REVISITS) {
              failures.push(`${label} hop ${hop} on ${lastSnap.passage} — passage revisited ${visits[lastSnap.passage]} times (loop)`);
              break;
            }
          }
          hop++;
        }

        if (hop >= MAX_HOPS) {
          // Hit the cap without reaching Flashbacks. Not necessarily a
          // bug -- some scenes (e.g. Sleep) terminate at a non-gallery
          // passage. We only flag if we never saw the gallery AND we
          // still have clickable links (suggests a loop).
          if (lastSnap.passage !== 'Flashbacks' && lastSnap.links.length > 0) {
            failures.push(`${label} — hit hop cap ${MAX_HOPS} on ${lastSnap.passage}, still has ${lastSnap.links.length} links (possible loop)`);
          }
        }
      } catch (err) {
        failures.push(`${label} — exception: ${err.message || String(err)}`);
      }
    }

    expect(
      failures.length,
      `\nFlashback scenes with issues (${failures.length}/${catalogue.length}):\n` +
      failures.map((f) => '  - ' + f).join('\n') + '\n'
    ).toBe(0);
  });
});
