const { test, expect, MOBILE_VIEWPORT } = require('./mobile-fixtures');
const { goToPassage } = require('./helpers');

/*
 * Mobile audit for the .hunt-run-messages narrative panel and the
 * "Offer the cursed item to the seal/door" nav links that appear
 * during Monkey Paw lock states. The general hunt.mobile.spec.js
 * suite parks the engine on a fresh HuntRun where these elements
 * don't render — so without this file the locked-state UI would
 * not be measured at phone width.
 *
 * Checks:
 *  - no horizontal overflow at 390×844
 *  - the messages panel does not overlap the wrapped tool cards
 *  - the cursed-item nav links meet the 44×44 tap-target floor
 */

const VERTICAL_OVERLAP_SLOP_PX = 2;

async function setupLockedRoom(page, { withCursedItem = false } = {}) {
  await page.evaluate((carry) => {
    SugarCube.State.variables.mc.lvl = 4;
    SugarCube.setup.Witch.completeEctoplasmQuest();
    if (carry) SugarCube.setup.Witch.cheatGrantCursedItem('dildo');
    SugarCube.setup.HuntController.startHunt({ seed: 12345 });
    SugarCube.setup.HuntController.activateHunt();
    SugarCube.setup.HuntController.lockCurrentRoom();
  }, withCursedItem);
  await goToPassage(page, 'HuntRun');
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

async function setupLockedExitInHallway(page, { withCursedItem = false } = {}) {
  await page.evaluate((carry) => {
    SugarCube.State.variables.mc.lvl = 4;
    SugarCube.setup.Witch.completeEctoplasmQuest();
    if (carry) SugarCube.setup.Witch.cheatGrantCursedItem('dildo');
    SugarCube.setup.HuntController.startHunt({ seed: 12345 });
    SugarCube.setup.HuntController.activateHunt();
    SugarCube.setup.HuntController.trapGhost('cursedItem');
    const run = SugarCube.State.variables.run;
    const fp = run.floorplan;
    const hallway = fp.rooms.find((r) => r.template === SugarCube.setup.FloorPlan.HALLWAY_TEMPLATE);
    if (hallway) SugarCube.setup.HuntController.setCurrentRoom(hallway.id);
  }, withCursedItem);
  await goToPassage(page, 'HuntRun');
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

const SCENARIOS = [
  { name: 'locked-room',                            setup: (p) => setupLockedRoom(p) },
  { name: 'locked-room-with-cursed-item',           setup: (p) => setupLockedRoom(p, { withCursedItem: true }) },
  { name: 'locked-exit-in-hallway',                 setup: (p) => setupLockedExitInHallway(p) },
  { name: 'locked-exit-in-hallway-with-cursed-item', setup: (p) => setupLockedExitInHallway(p, { withCursedItem: true }) },
];

test.describe(`mobile Monkey-Paw lock UI @ ${MOBILE_VIEWPORT.width}×${MOBILE_VIEWPORT.height}`, () => {
  for (const sc of SCENARIOS) {
    test(`${sc.name}: panel + nav fit the viewport with no overflow / overlap / undersized taps`, async ({ game: page }) => {
      await sc.setup(page);
      const result = await page.evaluate(() => {
        const m = document.querySelector('.hunt-run-messages');
        const messageRect = m && m.getBoundingClientRect();
        const tools = document.querySelector('.hunt-run-tools');
        const toolsRect = tools && tools.getBoundingClientRect();
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
                left: Math.round(r.left),
                right: Math.round(r.right),
              });
              if (culprits.length >= 5) break;
            }
          }
        }
        const tapViolations = [];
        for (const a of document.querySelectorAll('.hunt-run-nav a, .hunt-run-messages a')) {
          const r = a.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (r.width < 44 || r.height < 44) {
            tapViolations.push({
              text: (a.textContent || '').trim().slice(0, 60),
              w: Math.round(r.width),
              h: Math.round(r.height),
            });
          }
        }
        return {
          present: !!m,
          messageText: m ? m.textContent.trim().slice(0, 200) : null,
          messageRect: messageRect && { top: Math.round(messageRect.top), bottom: Math.round(messageRect.bottom), left: Math.round(messageRect.left), right: Math.round(messageRect.right) },
          toolsRect: toolsRect && { top: Math.round(toolsRect.top), bottom: Math.round(toolsRect.bottom) },
          tapViolations,
          docW,
          innerW,
          culprits,
        };
      });

      expect(result.present, `${sc.name}: .hunt-run-messages should render`).toBe(true);
      expect(
        result.docW,
        `${sc.name} overflows ${result.innerW}px viewport (scrollWidth=${result.docW}). ` +
          (result.culprits.length
            ? `Overflowing elements: ` + result.culprits.map((c) => `<${c.tag} class="${c.classes}"> at x=${c.left}..${c.right}`).join('; ')
            : '')
      ).toBeLessThanOrEqual(result.innerW + 1);
      if (result.messageRect && result.toolsRect) {
        expect(
          result.messageRect.bottom,
          `${sc.name}: .hunt-run-messages bottom=${result.messageRect.bottom} overlaps .hunt-run-tools top=${result.toolsRect.top}. ` +
            `On mobile the tool cards wrap into multiple rows; messages must clear them.`
        ).toBeLessThanOrEqual(result.toolsRect.top + VERTICAL_OVERLAP_SLOP_PX);
      }
      expect(
        result.tapViolations,
        `${sc.name}: tap-target floor violations in nav/messages: ` +
          result.tapViolations.map((v) => `"${v.text}" ${v.w}×${v.h}`).join('; ')
      ).toEqual([]);
    });
  }
});
