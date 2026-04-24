const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { openGame, goToPassage, reseedRng } = require('./helpers');

/*
 * Random-walk fuzzer.
 *
 * Starts the game at CityMap (bypassing the intro) with a seeded in-game
 * RNG, then repeatedly picks one visible link at random and clicks it. At
 * every step it enforces a small set of player-facing invariants:
 *
 *   - No unprocessed <<macro>> markup leaked into rendered text
 *   - No visible `$state.var` interpolation (undefined variable leak)
 *   - No error banners visible on the page
 *   - mc.{energy,money,sanity,lust,corruption} are finite numbers
 *   - No uncaught page errors in the console
 *   - Current passage has at least one forward link (not a dead end)
 *   - Not stuck in a tight loop (same passage repeated above a threshold)
 *
 * Both the in-game Math.random (via openGame seed) and the test-side
 * link-picker PRNG are seeded, so every failure comes with a one-line
 * repro: FUZZ_SEEDS=<seed> FUZZ_STEPS=<n> npx playwright test
 * random-walk-fuzzer.spec.js.
 *
 * Tuning knobs (env):
 *   FUZZ_SEEDS  comma-separated list of seeds, default "1"
 *   FUZZ_STEPS  max steps per walk, default 150
 *   FUZZ_START  start passage, default "CityMap"
 *
 * The default (1 seed × 150 steps) is a cheap smoke gate for CI. Bump
 * FUZZ_SEEDS and FUZZ_STEPS for soak runs — each additional seed is fully
 * independent and can be bisected in isolation.
 */

const SEEDS = (process.env.FUZZ_SEEDS || '1').split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
const MAX_STEPS = Number(process.env.FUZZ_STEPS) || 80;
const START_PASSAGE = process.env.FUZZ_START || 'CityMap';
// Per-step budget for the click-settle wait. Most clicks settle in <50ms;
// we only need enough headroom to rule out a truly frozen link. Keeping
// this tight is the difference between a 30s CI gate and a 2min one.
const CLICK_SETTLE_MS = 500;

// Same passage N times in a row = softlock. Kept generous because some
// legitimate passages re-render on refresh-style links (e.g. inventory UI).
const STUCK_LIMIT = 25;

// Test-side Mulberry32. Kept independent of the in-game PRNG so the walk's
// link-picking sequence stays stable even if the game consumes different
// numbers of random draws per step.
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function currentPassage(page) {
  return page.evaluate(() => SugarCube.State.passage);
}

// Collect clickable, visible forward-links in the main passage area.
// Returns an array of { selectorIdx, text, target } where selectorIdx is
// the element's index among all candidates — used to click deterministically.
async function collectLinks(page) {
  return page.evaluate(() => {
    const root = document.querySelector('#passages') || document.body;
    const nodes = root.querySelectorAll('a, [data-passage], button.link-internal, .macro-link');
    const out = [];
    const seen = new Set();
    nodes.forEach((el, i) => {
      if (el.offsetParent === null) return;
      if (el.classList.contains('disabled-link')) return;
      if (el.classList.contains('disabled')) return;
      if (el.getAttribute('aria-disabled') === 'true') return;
      const text = (el.textContent || '').trim();
      if (!text) return;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const target = el.getAttribute('data-passage') || '';
      const key = text.slice(0, 80) + '|' + target;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ idx: i, text: text.slice(0, 80), target });
    });
    return out;
  });
}

// Click the i-th candidate link, wait for SugarCube to finish rendering,
// and return whether anything changed. The wait has two phases:
//   1. Detect an initial change (passage name or DOM content).
//   2. Wait for the passage name to stay stable for a short window, so
//      <<goto>> redirect chains (A → B → C) complete before we sample.
async function clickNth(page, idx) {
  const before = await page.evaluate(() => ({
    passage: SugarCube.State.passage,
    html: (document.querySelector('.passage') || document.body).innerHTML.length,
  }));
  await page.evaluate((i) => {
    const root = document.querySelector('#passages') || document.body;
    const nodes = root.querySelectorAll('a, [data-passage], button.link-internal, .macro-link');
    const el = nodes[i];
    if (el) el.click();
  }, idx);
  try {
    await page.waitForFunction(
      (b) => {
        const curPassage = SugarCube.State.passage;
        const curLen = (document.querySelector('.passage') || document.body).innerHTML.length;
        return curPassage !== b.passage || curLen !== b.html;
      },
      before,
      { timeout: CLICK_SETTLE_MS }
    );
  } catch {
    return false;
  }
  // Settle: small idle wait so any <<goto>>-scheduled redirect lands
  // before the fuzzer samples the next step's passage + links.
  await page.waitForTimeout(50);
  return true;
}

async function checkInvariants(page) {
  return page.evaluate(() => {
    const issues = [];
    const passageEl = document.querySelector('.passage');
    if (passageEl) {
      const txt = passageEl.textContent;
      const macroLeaks = txt.match(/<<\/?[a-zA-Z][^<>]{0,80}>>/g);
      if (macroLeaks) {
        issues.push('unprocessed-macros: ' + macroLeaks.slice(0, 3).join(' | '));
      }
      const varLeak = txt.match(/\$[a-zA-Z_]\w*\.\w+/);
      if (varLeak) issues.push('visible-variable: ' + varLeak[0]);
    }
    document.querySelectorAll('.error, [class*="macro-error"]').forEach((el) => {
      if (el.offsetParent !== null) {
        issues.push('error-element: ' + el.textContent.trim().slice(0, 100));
      }
    });
    const V = SugarCube.State.variables;
    if (V && V.mc) {
      for (const k of ['energy', 'money', 'sanity', 'lust', 'corruption']) {
        const v = V.mc[k];
        if (v !== undefined && typeof v === 'number' && !Number.isFinite(v)) {
          issues.push('mc.' + k + ' not finite: ' + String(v));
        }
      }
    }
    return issues;
  });
}

function formatFailure({ seed, step, history, reason, detail, links, dom }) {
  const tail = history.slice(-15).map((h, i) => `    ${history.length - 15 + i}: ${h}`).join('\n');
  const linkList = (links || []).slice(0, 10).map((l) => `      - "${l.text}" → ${l.target || '(in-passage)'}`).join('\n');
  return [
    `Random-walk fuzzer failure`,
    `  seed:   ${seed}`,
    `  step:   ${step} / ${MAX_STEPS}`,
    `  reason: ${reason}`,
    detail ? `  detail: ${detail}` : null,
    `  last 15 passages:\n${tail || '    (none)'}`,
    links && links.length ? `  visible links (up to 10):\n${linkList}` : null,
    dom ? `  passage HTML (truncated):\n    ${dom.replace(/\s+/g, ' ').slice(0, 800)}` : null,
    ``,
    `Repro:`,
    `  FUZZ_SEEDS=${seed} FUZZ_STEPS=${step + 1} npx playwright test random-walk-fuzzer.spec.js`,
  ].filter(Boolean).join('\n');
}

function saveArtifact(seed, body) {
  const dir = path.join(__dirname, '..', 'test-results');
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `fuzz-seed-${seed}.txt`), body);
  } catch {
    // best-effort; don't fail the test on disk issues
  }
}

for (const seed of SEEDS) {
  test(`random walk from ${START_PASSAGE} is softlock-free (seed=${seed}, steps=${MAX_STEPS})`, async ({ browser }) => {
    // Budget ~1.5s per step — covers settle-timeouts and occasional slow
    // passages (hunts with <<do>>/<<redo>> chains). Floor of 90s so small
    // step counts still have room for setup/teardown.
    test.setTimeout(Math.max(90_000, MAX_STEPS * 1500));

    const consoleErrors = [];
    const page = await openGame(browser, { seed });
    page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const text = msg.text();
      // openGame aborts image/media/font requests at the network layer to
      // keep the browser responsive under parallel load; Chromium logs
      // those aborts as "Failed to load resource: net::ERR_FAILED". They
      // are not game bugs — ignore them.
      if (/Failed to load resource: net::ERR_/.test(text)) return;
      consoleErrors.push('console.error: ' + text);
    });

    try {
      await goToPassage(page, START_PASSAGE);
      // Re-seed after navigation so the in-game RNG starts from a known
      // state relative to step 0 regardless of draws consumed during init.
      await reseedRng(page, seed);

      const pickRng = makeRng(seed ^ 0xC0FFEE);
      const history = [];
      let stuckCounter = 0;

      for (let step = 0; step < MAX_STEPS; step++) {
        const passage = await currentPassage(page);
        history.push(passage);

        if (history.length >= 2 && history[history.length - 2] === passage) {
          stuckCounter++;
        } else {
          stuckCounter = 0;
        }
        if (stuckCounter >= STUCK_LIMIT) {
          const body = formatFailure({ seed, step, history, reason: 'stuck-in-loop', detail: `passage "${passage}" repeated ${stuckCounter + 1}x` });
          saveArtifact(seed, body);
          expect.soft(consoleErrors, 'page errors during walk').toEqual([]);
          throw new Error(body);
        }

        const invariantIssues = await checkInvariants(page);
        if (invariantIssues.length) {
          const body = formatFailure({ seed, step, history, reason: 'invariant-violation', detail: invariantIssues.join(' ; ') });
          saveArtifact(seed, body);
          throw new Error(body);
        }

        const links = await collectLinks(page);
        if (links.length === 0) {
          const dom = await page.evaluate(() => {
            const report = (sel) => {
              const el = document.querySelector(sel);
              return el ? `${sel}: ${el.innerHTML.length} chars` : `${sel}: (missing)`;
            };
            const primary = document.querySelector('.passage')
              || document.querySelector('#passages')
              || document.body;
            return {
              lengths: [report('.passage'), report('#passages'), report('#story')].join(' | '),
              html: (primary.innerHTML || '').slice(0, 1500),
            };
          });
          const body = formatFailure({
            seed, step, history,
            reason: 'dead-end (no visible forward links)',
            links,
            detail: dom.lengths,
            dom: dom.html,
          });
          saveArtifact(seed, body);
          throw new Error(body);
        }

        const pick = links[Math.floor(pickRng() * links.length)];
        const changed = await clickNth(page, pick.idx);
        if (!changed) {
          // No-op link — allowed once, but if it keeps happening we'll
          // surface it via the stuck-in-loop check above.
          continue;
        }
      }

      // Walk completed without tripping any invariant.
      expect(consoleErrors, 'page errors during walk:\n' + consoleErrors.join('\n')).toEqual([]);
    } finally {
      await page.close();
    }
  });
}
