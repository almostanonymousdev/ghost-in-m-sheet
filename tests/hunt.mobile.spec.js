const { test, expect, MOBILE_VIEWPORT } = require('./mobile-fixtures');
const { goToPassage } = require('./helpers');

/*
 * Mobile hunt-UI audit.
 *
 * The hunt screens (HuntStart lobby, HuntRun active room) are
 * authored against a desktop layout: .hunt-run-layout is
 * position:fixed left:17.5em (clearing the sidebar), .hunt-run-top
 * is a 2-column grid, the tool-card row assumes 6 64-px cards fit
 * on a single line, .hunt-run-nav lives in the bottom-right, and
 * .hunt-run-companion overlays the right edge. None of that holds
 * at 390px viewport.
 *
 * Additionally, SugarCube's stock UI-bar styling keeps #ui-bar at
 * left: 0 and width: 17.5em even after the breakpoint where #story
 * shrinks its margin -- so on phones the sidebar visually overlays
 * the passage and intercepts every click meant for the gameplay
 * area. The fix lives in GuiController.js (auto-stows on narrow
 * viewports) + passages/styles/mobile.css (restacks the hunt UI).
 *
 * These tests would have caught the original "UI unusable on
 * mobile" report: each one fails loudly if the sidebar overlays
 * the hunt area, if the hunt layout doesn't reach the viewport
 * edge, if a tool button is offscreen, or if a tap target falls
 * under 44 px.
 */

const MIN_TAP_PX = 44;
const HORIZONTAL_SLOP_PX = 1;
const ALLOWED_EXCEPTIONS_SRC = `[
  (el) => el.closest('#ui-bar-history') !== null,
  /* Stowed sidebar contents sit at left: -15.5em; their child
     anchors render off the left of the viewport but are not a
     reachable tap target while the bar is stowed. */
  (el) => {
    const bar = el.closest('#ui-bar');
    return bar && bar.classList.contains('stowed');
  },
]`;

/* Roll a deterministic hunt and park the engine on the given hunt
   passage. Uses the real procedural startHunt so the floor plan,
   modifiers, starting tools, and ghost catalogue lookups all fire
   -- a cheatStampMinimalRun would skip the floor plan and HuntRun
   would render an empty stub that doesn't exercise the bug. */
async function setupHuntAt(page, passageName, seed = 12345) {
  await page.evaluate((s) => {
    SugarCube.State.variables.mc.lvl = 4;
    SugarCube.setup.Witch.completeEctoplasmQuest();
    SugarCube.setup.HuntController.startHunt({ seed: s });
    SugarCube.setup.HuntController.activateHunt();
  }, seed);
  await goToPassage(page, passageName);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

const HUNT_PASSAGES = ['HuntStart', 'HuntRun'];

test.describe(`mobile hunt UI @ ${MOBILE_VIEWPORT.width}×${MOBILE_VIEWPORT.height}`, () => {
  for (const passageName of HUNT_PASSAGES) {
    test(`${passageName}: sidebar auto-stows so it doesn't overlay the passage`, async ({ game: page }) => {
      await setupHuntAt(page, passageName);
      const ui = await page.evaluate(() => {
        const bar = document.getElementById('ui-bar');
        if (!bar) return null;
        const r = bar.getBoundingClientRect();
        return { stowed: bar.classList.contains('stowed'), right: Math.round(r.right), vw: window.innerWidth };
      });
      expect(ui, 'should find #ui-bar').not.toBeNull();
      /* Stowed sidebar peeks ~2em (~32 px) from the left; anything
         more means the bar is still occupying gameplay area. */
      expect(
        ui.stowed,
        `${passageName} renders with #ui-bar un-stowed at ${ui.vw}px viewport (right edge at x=${ui.right}); the bar overlays gameplay and intercepts clicks.`
      ).toBe(true);
    });

    test(`${passageName}: no horizontal overflow`, async ({ game: page }) => {
      await setupHuntAt(page, passageName);
      const geom = await page.evaluate(() => {
        const docW = document.documentElement.scrollWidth;
        const innerW = window.innerWidth;
        const culprits = [];
        if (docW > innerW) {
          for (const el of document.querySelectorAll('body *')) {
            const r = el.getBoundingClientRect();
            if (r.right > innerW + 1) {
              culprits.push({
                tag: el.tagName.toLowerCase(),
                classes: typeof el.className === 'string' ? el.className : '',
                id: el.id || '',
                left: Math.round(r.left),
                right: Math.round(r.right),
              });
              if (culprits.length >= 5) break;
            }
          }
        }
        return { docW, innerW, culprits };
      });
      expect(
        geom.docW,
        `${passageName} overflows ${geom.innerW}px viewport (scrollWidth=${geom.docW}). ` +
          (geom.culprits.length
            ? `First overflowing elements:\n  ` +
              geom.culprits.map((c) =>
                `<${c.tag}${c.id ? ' id="' + c.id + '"' : ''}${c.classes ? ' class="' + c.classes + '"' : ''}> at x=${c.left}..${c.right}`
              ).join('\n  ')
            : '')
      ).toBeLessThanOrEqual(geom.innerW + HORIZONTAL_SLOP_PX);
    });

    test(`${passageName}: hunt layout fills the viewport`, async ({ game: page }) => {
      await setupHuntAt(page, passageName);
      const layout = await page.evaluate(() => {
        /* Both hunt passages render a primary content region: the
           lobby uses .hunt-lobby (centered card, max-width:640px),
           the run uses .hunt-run-layout (fixed full-bleed). For
           the lobby we just need it not to overflow; for the run
           we need it to actually fill the viewport. */
        const run = document.querySelector('.hunt-run-layout');
        const lobby = document.querySelector('.hunt-lobby');
        if (run) {
          const r = run.getBoundingClientRect();
          return { kind: 'run', left: Math.round(r.left), right: Math.round(r.right), vw: window.innerWidth };
        }
        if (lobby) {
          const r = lobby.getBoundingClientRect();
          return { kind: 'lobby', left: Math.round(r.left), right: Math.round(r.right), vw: window.innerWidth };
        }
        return null;
      });
      expect(layout, `${passageName} should render a primary content region`).not.toBeNull();
      if (layout.kind === 'run') {
        /* Active hunt layout must span the viewport edge-to-edge.
           The original bug parked it at left:280px (still clearing
           the un-stowed sidebar's 17.5em) with only ~110px usable
           on a 390px viewport. */
        expect(
          layout.left,
          `${passageName}: .hunt-run-layout starts at x=${layout.left}; the sidebar gutter is eating gameplay area on a ${layout.vw}px viewport.`
        ).toBeLessThanOrEqual(2);
        expect(
          layout.right,
          `${passageName}: .hunt-run-layout ends at x=${layout.right} on a ${layout.vw}px viewport; the column is not reaching the right edge.`
        ).toBeGreaterThanOrEqual(layout.vw - 2);
      } else {
        /* Lobby panel must at least fit inside the viewport. */
        expect(layout.left, `${passageName}: lobby left edge`).toBeGreaterThanOrEqual(0);
        expect(layout.right, `${passageName}: lobby right edge`).toBeLessThanOrEqual(layout.vw + 1);
      }
    });

    test(`${passageName}: every visible interactive element meets the tap-target floor`, async ({ game: page }) => {
      await setupHuntAt(page, passageName);
      const violations = await page.evaluate(({ min, exceptionsSrc }) => {
        const exceptions = eval(exceptionsSrc);
        const SELECTOR = 'a, button, [role="button"], [data-passage]';
        const isElementVisible = (el) => {
          const style = getComputedStyle(el);
          if (style.visibility === 'hidden') return false;
          if (style.display === 'none') return false;
          for (let n = el; n; n = n.parentElement) {
            const s = getComputedStyle(n);
            if (s.display === 'none' || s.visibility === 'hidden') return false;
          }
          return true;
        };
        const out = [];
        const seen = new Set();
        for (const el of document.querySelectorAll(SELECTOR)) {
          if (seen.has(el)) continue;
          seen.add(el);
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (!isElementVisible(el)) continue;
          if (exceptions.some((fn) => fn(el))) continue;
          if (r.width < min || r.height < min) {
            const ancestor = el.closest('[class]');
            out.push({
              tag: el.tagName.toLowerCase(),
              text: (el.textContent || '').trim().slice(0, 40),
              classes: (el.className || '') + (ancestor && ancestor !== el ? ` (in .${[...ancestor.classList].join('.')})` : ''),
              passage: (el.getAttribute('data-passage') || ''),
              w: Math.round(r.width),
              h: Math.round(r.height),
            });
          }
        }
        return out;
      }, { min: MIN_TAP_PX, exceptionsSrc: ALLOWED_EXCEPTIONS_SRC });

      expect(
        violations,
        `Tap targets below ${MIN_TAP_PX}px on ${passageName}:\n  ` +
          violations.map((v) =>
            `${v.tag}${v.classes ? '.' + v.classes : ''}` +
            (v.passage ? ` [data-passage="${v.passage}"]` : '') +
            ` "${v.text}" — ${v.w}×${v.h}px`
          ).join('\n  ')
      ).toEqual([]);
    });

    test(`${passageName}: visible interactive elements are inside the viewport`, async ({ game: page }) => {
      await setupHuntAt(page, passageName);
      const result = await page.evaluate(({ exceptionsSrc }) => {
        const exceptions = eval(exceptionsSrc);
        const out = [];
        const vw = window.innerWidth;
        for (const a of document.querySelectorAll('a, button, [role="button"], [data-passage]')) {
          const r = a.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          const style = getComputedStyle(a);
          if (style.visibility === 'hidden' || style.display === 'none') continue;
          let hidden = false;
          for (let n = a; n; n = n.parentElement) {
            const s = getComputedStyle(n);
            if (s.display === 'none' || s.visibility === 'hidden') { hidden = true; break; }
          }
          if (hidden) continue;
          if (exceptions.some((fn) => fn(a))) continue;
          if (r.right <= 0 || r.left >= vw) {
            out.push({
              text: (a.textContent || '').trim().slice(0, 40),
              passage: a.getAttribute('data-passage') || '',
              left: Math.round(r.left),
              right: Math.round(r.right),
            });
          }
        }
        return { offscreen: out, vw };
      }, { exceptionsSrc: ALLOWED_EXCEPTIONS_SRC });
      expect(
        result.offscreen,
        `${passageName} renders interactive elements entirely outside the ${result.vw}px viewport:\n  ` +
          result.offscreen.map((o) =>
            `"${o.text}"${o.passage ? ' → ' + o.passage : ''} at x=${o.left}..${o.right}`
          ).join('\n  ')
      ).toEqual([]);
    });
  }
});
