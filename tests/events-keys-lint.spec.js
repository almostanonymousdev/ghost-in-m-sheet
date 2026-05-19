/**
 * Events-controller key registry lint.
 *
 * setup.Events.EventKey / ClothingKey / CthulionTier are the typed
 * lookup constants for setup.EventVideos / setup.EventText / Cthulion
 * pools. This spec keeps them honest:
 *
 *   1. EventKey values match the actual top-level keys of setup.EventVideos
 *      (and EventText is a subset of those).
 *   2. ClothingKey values are a superset of every clothing sub-key that
 *      appears under any EventVideos entry. `_type` is metadata, not a
 *      clothing key, and is excluded.
 *   3. Literal string calls to the lookup methods in source files
 *      only pass keys that exist in the registry — so a typo is
 *      caught at lint time instead of falling into the runtime
 *      assertions and breaking a hunt. Methods scanned: getVideos,
 *      videoListForEvent, bottomClothingVideos, topClothingVideos,
 *      eventTextFor, initEvent.
 *
 * The spec runs in the `lint` project (Node-only, no browser).
 */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const EVENTS_DIR = path.join(ROOT, 'passages', 'events');

/* Evaluate a self-contained pure-data JS file (EventVideos.js /
   EventText.js) under a stub `setup` namespace and return it. The
   files only assign to setup.* and don't reference State, so a
   minimal Function-wrapper sandbox is enough. */
function loadDataFile(file) {
  const code = fs.readFileSync(file, 'utf8');
  const setup = {};
  // eslint-disable-next-line no-new-func
  new Function('setup', code)(setup);
  return setup;
}

/* Pull the value-set from an `Object.freeze({ KEY: 'val', ... })` block
   inside a JS source file. Returns a Set of the string values. The
   regex is intentionally narrow — these blocks are short and live
   right at the top of EventsController.js. */
function extractFrozenValues(source, name) {
  const re = new RegExp('var\\s+' + name + '\\s*=\\s*Object\\.freeze\\(\\{([^}]*)\\}\\);', 'm');
  const m = source.match(re);
  if (!m) throw new Error('Could not find Object.freeze({...}) for ' + name);
  const values = new Set();
  const entryRe = /[A-Z_]+\s*:\s*'([^']+)'/g;
  let em;
  while ((em = entryRe.exec(m[1])) !== null) {
    values.add(em[1]);
  }
  return values;
}

const controllerSrc = fs.readFileSync(path.join(EVENTS_DIR, 'EventsController.js'), 'utf8');
const eventVideos   = loadDataFile(path.join(EVENTS_DIR, 'EventVideos.js')).EventVideos;
const eventText     = loadDataFile(path.join(EVENTS_DIR, 'EventText.js')).EventText;

const EventKeySet    = extractFrozenValues(controllerSrc, 'EventKey');
const ClothingKeySet = extractFrozenValues(controllerSrc, 'ClothingKey');

test.describe('Events key registry — constants vs data', () => {
  test('EventKey values exactly match setup.EventVideos top-level keys', () => {
    const dataKeys = new Set(Object.keys(eventVideos));
    expect([...EventKeySet].sort()).toEqual([...dataKeys].sort());
  });

  test('setup.EventText top-level keys are all in EventKey', () => {
    const missing = Object.keys(eventText).filter((k) => !EventKeySet.has(k));
    expect(missing).toEqual([]);
  });

  test('every clothing sub-key in EventVideos is in ClothingKey', () => {
    const subKeys = new Set();
    for (const ev of Object.values(eventVideos)) {
      for (const k of Object.keys(ev)) {
        if (k === '_type') continue;
        subKeys.add(k);
      }
    }
    const missing = [...subKeys].filter((k) => !ClothingKeySet.has(k));
    expect(missing).toEqual([]);
  });
});

/* --- Caller-site literal-string scan --------------------------------
   Walk every .js and .tw file under passages/ + tests/ and find calls
   to the typed lookup methods on setup.Events. Any literal string
   argument must exist in the corresponding key set; otherwise it would
   throw at runtime. Variable-argument calls (e.g. resolved from a
   computed expression) are skipped — they're outside what static lint
   can verify. */
function walkSources(root) {
  const out = [];
  (function recur(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { recur(full); continue; }
      if (entry.name.endsWith('.js') || entry.name.endsWith('.tw')) out.push(full);
    }
  })(root);
  return out;
}

const sourceFiles = [
  ...walkSources(path.join(ROOT, 'passages')),
  ...walkSources(path.join(ROOT, 'tests')),
];

/* Each rule: a regex that captures one literal string arg + the
   set the arg must belong to. */
const CALL_RULES = [
  { name: 'videoListForEvent',    re: /\bvideoListForEvent\(\s*['"]([^'"]+)['"]\s*\)/g,        set: EventKeySet,    label: 'event key' },
  { name: 'bottomClothingVideos', re: /\bbottomClothingVideos\(\s*['"]([^'"]+)['"]\s*\)/g,     set: EventKeySet,    label: 'event key' },
  { name: 'topClothingVideos',    re: /\btopClothingVideos\(\s*['"]([^'"]+)['"]\s*\)/g,        set: EventKeySet,    label: 'event key' },
  { name: 'eventTextFor',         re: /\beventTextFor\(\s*['"]([^'"]+)['"]/g,                  set: EventKeySet,    label: 'event key' },
  { name: 'initEvent',            re: /\binitEvent\(\s*['"]([^'"]+)['"]\s*\)/g,                set: EventKeySet,    label: 'event key' },
];

/* getVideos takes two literal string args; handle separately. */
const GET_VIDEOS_RE = /\bgetVideos\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*\)/g;

/* Some call sites intentionally pass bad keys — e.g. the throw-path
   tests that assert the unknown-key error, and this lint itself which
   regex-matches example calls. Annotate those lines with the sentinel
   below to skip them. */
const SKIP_SENTINEL = 'lint-skip: events-keys';

/* Locate the file/line for a regex match within source. */
function lineOf(src, idx) {
  return src.slice(0, idx).split('\n').length;
}

test.describe('Events key registry — caller-site keys', () => {
  test('no source file passes an unknown key to a typed Events lookup', () => {
    const violations = [];
    for (const file of sourceFiles) {
      const src = fs.readFileSync(file, 'utf8');
      const lines = src.split('\n');
      const rel = path.relative(ROOT, file);

      const check = (idx, msg) => {
        const ln = lineOf(src, idx);
        if (lines[ln - 1] && lines[ln - 1].indexOf(SKIP_SENTINEL) !== -1) return;
        violations.push(`${rel}:${ln}: ${msg}`);
      };

      for (const rule of CALL_RULES) {
        rule.re.lastIndex = 0;
        let m;
        while ((m = rule.re.exec(src)) !== null) {
          const key = m[1];
          if (!rule.set.has(key)) {
            check(m.index, rule.name + '(' + key + ') — unknown ' + rule.label); // lint-skip: events-keys
          }
        }
      }
      GET_VIDEOS_RE.lastIndex = 0;
      let g;
      while ((g = GET_VIDEOS_RE.exec(src)) !== null) {
        const ek = g[1], ck = g[2];
        if (!EventKeySet.has(ek)) {
          check(g.index, 'getVideos(' + ek + ', ' + ck + ') — unknown event key'); // lint-skip: events-keys
        }
        if (!ClothingKeySet.has(ck)) {
          check(g.index, 'getVideos(' + ek + ', ' + ck + ') — unknown clothing key'); // lint-skip: events-keys
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
