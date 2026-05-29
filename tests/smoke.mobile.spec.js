const { test, expect, MOBILE_VIEWPORT } = require('./mobile-fixtures');
const { goToPassage } = require('./helpers');

/*
 * Mobile layout smoke.
 *
 * For each core passage, render at mobile viewport and police a small
 * set of structural invariants that any reasonable mobile rendering
 * should satisfy:
 *
 *   1. No horizontal scroll. document.documentElement.scrollWidth must
 *      stay within the visual viewport (a single px of float-rounding
 *      slop is allowed). Anything wider means a child is bursting the
 *      container (an oversized image, an inline-table widget that
 *      forgot max-width, a `width: NNNpx` rule against a desktop base).
 *
 *   2. Visible passage links land inside [0, viewport]. A link
 *      rendered at x < 0 or x > viewport.right is a clipped target
 *      the player cannot reach without horizontal scroll — the worst
 *      kind of dead-end on a phone.
 *
 *   3. Rendering produced no pageerrors. SugarCube layout bugs at a
 *      cramped viewport occasionally surface as "cannot read property
 *      of null" when a positioner reads getBoundingClientRect on a
 *      not-yet-laid-out element; treat any pageerror at mobile width
 *      as a regression worth investigating.
 *
 * Visual regression (toHaveScreenshot) is intentionally NOT here — the
 * project is moving fast enough that pinned screenshots would generate
 * maintenance churn far in excess of their signal. These three
 * invariants give "did it break" coverage without that cost.
 */

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

/* Horizontal overflow allowance. Browsers occasionally report
   scrollWidth one CSS pixel above clientWidth due to subpixel rounding
   on transformed elements; treating that as a failure is noise. */
const HORIZONTAL_SLOP_PX = 1;

test.describe(`mobile layout smoke @ ${MOBILE_VIEWPORT.width}×${MOBILE_VIEWPORT.height}`, () => {
  for (const passageName of PASSAGES) {
    test(`${passageName}: no horizontal overflow`, async ({ game: page }) => {
      await goToPassage(page, passageName);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const geom = await page.evaluate(() => {
        /* Identify which element actually overflows so the failure
           message points at the culprit instead of just naming the
           passage. Filter out elements that can't actually contribute
           to documentElement.scrollWidth: position:fixed/sticky are
           taken out of normal flow (so SugarCube's stowed #ui-bar at
           left:-248 isn't the cause even though its bounding rect is
           off-screen), descendants of fixed/sticky ancestors live in
           that same out-of-flow subtree, and visibility:hidden /
           display:none elements don't paint. */
        const isOutOfFlow = (el) => {
          for (let n = el; n && n !== document.body; n = n.parentElement) {
            const p = getComputedStyle(n).position;
            if (p === 'fixed' || p === 'sticky') return true;
          }
          return false;
        };
        const docW = document.documentElement.scrollWidth;
        const innerW = window.innerWidth;
        const culprits = [];
        if (docW > innerW) {
          for (const el of document.querySelectorAll('body *')) {
            if (isOutOfFlow(el)) continue;
            const style = getComputedStyle(el);
            if (style.visibility === 'hidden' || style.display === 'none') continue;
            const r = el.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) continue;
            if (r.right > innerW + 1 || r.left < -1) {
              culprits.push({
                tag: el.tagName.toLowerCase(),
                classes: el.className || '',
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

    test(`${passageName}: visible passage links are inside the viewport`, async ({ game: page }) => {
      await goToPassage(page, passageName);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const result = await page.evaluate(() => {
        const out = [];
        const vw = window.innerWidth;
        for (const a of document.querySelectorAll('#passages a, #passages [data-passage]')) {
          const r = a.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          const style = getComputedStyle(a);
          if (style.visibility === 'hidden' || style.display === 'none') continue;
          /* Allow targets that straddle the right edge (partially in
             view) — the player can still hit them. Flag only those
             completely off-screen. */
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
      });
      expect(
        result.offscreen,
        `${passageName} renders links entirely outside the ${result.vw}px viewport:\n  ` +
          result.offscreen.map((o) =>
            `"${o.text}"${o.passage ? ' → ' + o.passage : ''} at x=${o.left}..${o.right}`
          ).join('\n  ')
      ).toEqual([]);
    });

    test(`${passageName}: renders without pageerrors`, async ({ game: page }) => {
      const errors = [];
      const onError = (err) => errors.push('pageerror: ' + err.message);
      page.on('pageerror', onError);
      try {
        await goToPassage(page, passageName);
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      } finally {
        page.off('pageerror', onError);
      }
      expect(
        errors,
        `${passageName} produced pageerrors at mobile viewport:\n  ` + errors.join('\n  ')
      ).toEqual([]);
    });
  }
});
