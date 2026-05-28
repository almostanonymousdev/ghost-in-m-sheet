const { test, expect, MOBILE_VIEWPORT } = require('./mobile-fixtures');
const { goToPassage } = require('./helpers');

/*
 * Mobile tap-target audit.
 *
 * Every visible interactive element on a core passage must hit roughly
 * 44×44 CSS pixels — the floor both Apple HIG and Material Design pick
 * for thumb-reachable targets. Smaller and the player either misses or
 * has to zoom; either is a usability defect on a touch device.
 *
 * Approach: at mobile viewport, render each curated passage, walk every
 * <a> / <button> / [role="button"] / [data-passage] element, measure its
 * bounding rect, and fail any visible target whose smaller dimension
 * falls below MIN_TAP_PX.
 *
 * Visibility filter: zero-area boxes, display:none, visibility:hidden,
 * and elements behind the hidden #ui-bar-history history strip are
 * skipped. Hidden targets aren't a usability problem the player can hit.
 *
 * This spec is *expected to fail loudly on the first run* — the game's
 * CSS has no mobile-specific @media rules, and several `.movebtn`-style
 * text links are sized in `em` against a desktop base. Failures should
 * be read as a punch list, not a regression: each one names the passage,
 * element, current size, and CSS class so it can be fixed individually.
 *
 * To add a new passage: append it to PASSAGES below. To carve out a
 * known-acceptable exception (e.g. an icon that's intentionally compact),
 * add a predicate to ALLOWED_EXCEPTIONS rather than blanket-relaxing
 * MIN_TAP_PX.
 */

const MIN_TAP_PX = 44;

/* Passages exercised by the audit. Picked to cover: the home loop
   (Home, Livingroom, Bathroom), the modal HUD passages (Bag, Notebook,
   Evidence, ChangeLog), and the city hub (CityMap). Adding broad
   coverage (every passage) belongs in a release-tier sweep, not this
   smoke set. */
const PASSAGES = [
  'Home',
  'Livingroom',
  'Bathroom',
  'Bag',
  'Notebook',
  'Evidence',
  'ChangeLog',
  'CityMap',
];

/* Known-acceptable carve-outs. Each entry is a predicate evaluated in
   browser context against an element + its bounding rect. Returning
   true marks the element as exempt from the size floor. Keep this list
   short and justified — every entry is a usability trade-off. */
const ALLOWED_EXCEPTIONS_SRC = `[
  // The #ui-bar-history strip is hidden by default behind a cheat
  // setting (.show-history); when the cheat is on, its buttons are
  // intentionally compact and live in a non-touch context.
  (el) => el.closest('#ui-bar-history') !== null,
]`;

test.describe(`mobile tap targets (≥ ${MIN_TAP_PX}px) @ ${MOBILE_VIEWPORT.width}×${MOBILE_VIEWPORT.height}`, () => {
  for (const passageName of PASSAGES) {
    test(`${passageName}: every visible interactive element meets the floor`, async ({ game: page }) => {
      await goToPassage(page, passageName);
      // Two animation frames so any post-render reflow (linkappend
      // hydration, KeyboardNav refresh, sidebar positioner) commits
      // before we measure.
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

      const violations = await page.evaluate(({ min, exceptionsSrc }) => {
        const exceptions = eval(exceptionsSrc);
        const SELECTOR = 'a, button, [role="button"], [data-passage]';
        const isElementVisible = (el) => {
          const style = getComputedStyle(el);
          if (style.visibility === 'hidden') return false;
          if (style.display === 'none') return false;
          /* Walk ancestors: a display:none parent hides the descendant
             regardless of the descendant's own style. offsetParent ===
             null is a cheap proxy but breaks for position:fixed
             children — read the parent chain explicitly. */
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
            // Identify the element with enough context that a reader
            // can grep for it without re-running the test.
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
  }
});
