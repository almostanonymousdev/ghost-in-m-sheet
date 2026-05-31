/**
 * Seduce-win field-guide coverage.
 *
 * On a seduce-minigame win the <<seduceGhostInspect>> widget
 * (passages/events/seduceGhostMinigame/widgetSeduceGhostMinigame.tw)
 * crouches the MC over the spent ghost and identifies its species. It
 * switches on the TRUE identity -- setup.Ghosts.huntRealName() -- with a
 * <<case "Name">> per catalogue ghost and a <<default>> fallback.
 *
 * This pure-Node lint pins two things that are easy to break silently:
 *   1. EVERY ghost in GHOST_CONFIG has its own <<case>>, so adding ghost
 *      #19 without a specimen line fails the build instead of quietly
 *      dropping it to the generic fallback.
 *   2. The widget keeps switching on huntRealName() (the unmasked
 *      identity, $run.ghostName), NOT huntName()/ActiveGhost.name() --
 *      otherwise a Mimic would be keyed out as whatever face it was
 *      wearing instead of being unmasked as a Mimic.
 */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const GHOST_CONTROLLER = path.join(
  __dirname, '..', 'passages', 'ghosts', 'GhostController.js'
);
const WIDGET_FILE = path.join(
  __dirname, '..', 'passages', 'events', 'seduceGhostMinigame',
  'widgetSeduceGhostMinigame.tw'
);

/* GHOST_CONFIG entries read `{ name: "Shade", image: "shade.webp", ... }`.
   Anchor on the trailing `, image:` so we only pick up catalogue ghosts
   and not other `name:` fields elsewhere in the file. */
function catalogueGhostNames(src) {
  const names = [];
  const re = /name:\s*"([^"]+)"\s*,\s*image:/g;
  let m;
  while ((m = re.exec(src)) !== null) names.push(m[1]);
  return names;
}

/* Pull the body of the seduceGhostInspect widget so case-matching can't
   stray into the other seduceGhostMinigame* widgets in the same file. */
function inspectWidgetBody(src) {
  const start = src.indexOf('<<widget "seduceGhostInspect">>');
  expect(start, 'seduceGhostInspect widget must exist').toBeGreaterThan(-1);
  const end = src.indexOf('<</widget>>', start);
  expect(end, 'seduceGhostInspect widget must be closed').toBeGreaterThan(start);
  return src.slice(start, end);
}

function caseNames(widgetBody) {
  const names = [];
  const re = /<<case\s+"([^"]+)">>/g;
  let m;
  while ((m = re.exec(widgetBody)) !== null) names.push(m[1]);
  return names;
}

test('every catalogue ghost has a seduce-win inspection case', () => {
  const ghostSrc = fs.readFileSync(GHOST_CONTROLLER, 'utf8');
  const widgetSrc = fs.readFileSync(WIDGET_FILE, 'utf8');

  const ghosts = catalogueGhostNames(ghostSrc);
  expect(ghosts.length, 'should find the full ghost catalogue').toBeGreaterThanOrEqual(18);

  const cases = new Set(caseNames(inspectWidgetBody(widgetSrc)));

  const missing = ghosts.filter((g) => !cases.has(g));
  expect(
    missing,
    `seduceGhostInspect is missing a <<case>> for: ${missing.join(', ')}`
  ).toEqual([]);
});

test('seduceGhostInspect switches on the TRUE identity (huntRealName)', () => {
  const widgetSrc = fs.readFileSync(WIDGET_FILE, 'utf8');
  const body = inspectWidgetBody(widgetSrc);

  expect(
    body,
    'must switch on setup.Ghosts.huntRealName() so a Mimic is unmasked'
  ).toContain('<<switch setup.Ghosts.huntRealName()>>');

  // Guard against a regression to the display/disguise name, which would
  // mis-identify a Mimic as whatever face it was wearing.
  expect(body).not.toContain('huntName()');
  expect(body).not.toContain('ActiveGhost.name()');

  // A fallback must exist for any unlisted/future ghost.
  expect(body, 'needs a <<default>> fallback').toContain('<<default>>');
});
