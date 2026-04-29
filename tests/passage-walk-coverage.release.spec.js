const { test, expect } = require('@playwright/test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openGame, goToPassage, resetGame } = require('./helpers');

/*
 * Exhaustive passage-and-link walker.
 *
 * For every navigable passage in the game:
 *   1. Reset the engine and Engine.play() into the passage cold.
 *   2. Inspect the rendered passage for: pageerror / console.error,
 *      visible <span class="error"> macro errors, leaked <<macro>> markup,
 *      leaked $variable interpolation, and <img>/<source> srcs that don't
 *      resolve to a file on disk.
 *   3. Enumerate every visible forward link, then for each one:
 *        - Reset, re-enter the source passage so state matches the cold
 *          render the link was authored against.
 *        - Click the link.
 *        - Wait for the click to settle (passage change or DOM update,
 *          plus a small idle window so any <<goto>> chain lands).
 *        - Re-run the same set of checks at the destination.
 *   4. We do NOT recurse: once a click reaches a new passage we record
 *      the (source, link) result and stop. The new passage's own links
 *      are exercised when the outer loop visits it independently.
 *
 * Static linters (check_links.py, check_reachability.py) already verify
 * that link targets exist and that no passage is a literal dead end. The
 * random-walk fuzzer covers state-dependent paths from a real start.
 * This spec is the missing piece: a flat sweep that catches passages
 * which render or transition with errors regardless of how the player
 * got there (e.g. a passage that reads `_var` but is also reached cold
 * from a [[link]] elsewhere).
 *
 * The walk is sharded across ~50% of CPU cores by default. Shards run as
 * separate parallel test() blocks; each gets its own browser page and
 * walks a disjoint subset of passages (passages[i] where i % SHARDS ===
 * shardIdx). Each shard self-reports; the overall run fails if any
 * shard fails. A single artifact (test-results/passage-walk-coverage.txt)
 * collects the union of findings from every shard.
 *
 * Knobs (env):
 *   PWC_LIMIT       — limit number of passages walked (dev iteration). Default: all.
 *   PWC_START       — start at this passage name (skip everything before it
 *                     in the sorted list). Useful for resuming after a failure.
 *   PWC_FILTER      — substring; only walk passages whose name contains it.
 *   PWC_LINK_CAP    — max links to click per passage (default 12). Cap exists
 *                     because hub passages (CityMap, Notebook, etc.) can
 *                     expose 30+ links and clicking each one squares the
 *                     runtime cost.
 *   PWC_SKIP_CLICKS_ON_BROKEN — when "1" (default), don't click links from
 *                     passages whose cold render already errored — those
 *                     clicks would just propagate the same error and
 *                     drown the report in cascading noise.
 *   PWC_SHARDS      — number of parallel shards (default: floor(cpus/2),
 *                     min 1). Set to 1 to run sequentially (useful when
 *                     debugging — failures interleave less in the log).
 */

const REPO_ROOT = path.join(__dirname, '..');
const PASSAGES_DIR = path.join(REPO_ROOT, 'passages');
const MEDIA_EXT_RE = /\.(jpg|jpeg|png|webp|gif|mp4|webm)$/i;

// Lifecycle / framework passages — never user-navigable.
const SKIP_PASSAGES = new Set([
  'StoryData', 'StoryInit', 'StoryScript', 'StoryStylesheet',
  'StoryCaption', 'StoryMenu', 'StoryTitle', 'StoryAuthor', 'StoryBanner',
  'PassageHeader', 'PassageFooter', 'PassageDone', 'PassageReady',
  'StoryReady',
]);

// Tags that mark a passage as non-navigable templating, not a destination.
const SKIP_TAGS = new Set(['widget', 'script', 'stylesheet', 'Twine.image']);

// How long to wait for a click to settle (passage transition or DOM
// update). Most clicks settle in <50ms; we only need enough headroom
// to rule out a frozen link.
const CLICK_SETTLE_MS = 400;

// After a settle event, give SugarCube a small idle window so any
// <<goto>>-redirect chains complete before we sample the destination.
const POST_CLICK_IDLE_MS = 40;

// Hard cap on links clicked per source passage. Hubs like CityMap or
// Notebook can expose 30+ links, and the click cost is per-link
// (re-enter + click + verify). Capping keeps the full sweep near 8 min
// without losing meaningful coverage — the same destinations almost
// always show up reachable from multiple sources.
const DEFAULT_LINK_CAP = 12;

const PASSAGE_HEADER_RE = /^::\s*([^\[\{\n]+?)(?:\s*\[([^\]]*)\])?(?:\s*\{[^}]*\})?\s*$/;

function collectPassages() {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!entry.name.endsWith('.tw')) continue;
      const lines = fs.readFileSync(full, 'utf-8').split('\n');
      for (const line of lines) {
        const m = line.match(PASSAGE_HEADER_RE);
        if (!m) continue;
        const name = m[1].trim();
        if (SKIP_PASSAGES.has(name)) continue;
        const tags = (m[2] || '').trim().split(/\s+/).filter(Boolean);
        if (tags.some((t) => SKIP_TAGS.has(t))) continue;
        out.push({ name, tags, file: full });
      }
    }
  };
  walk(PASSAGES_DIR);
  // Sort for deterministic iteration order across runs / shards.
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

// Read .tw source for a passage and report whether its body contains a
// <<widget>> definition. Files like widgetGym.tw declare reusable
// widgets; the file gets a top-level :: header but the body is purely
// templating, not a navigable destination. (Some widget files lack the
// `widget` tag on their header — they slip past the tag filter.)
function isWidgetContainer(passage) {
  try {
    const body = fs.readFileSync(passage.file, 'utf-8');
    return /<<widget\s/.test(body);
  } catch {
    return false;
  }
}

// Scan every .tw file for navigation references (links, gotos, Engine.play)
// and include references (<<include>>) and return the set of passage names
// that are ONLY referenced via <<include>>. Those are templating fragments
// (e.g. WardrobeSlots is included by PassageDone but never linked to);
// rendering them cold via Engine.play surfaces "no element matched the
// selector" errors because the parent passage's DOM isn't there. Mirrors
// the same idea as tools/check_reachability.py, just in JS.
function collectIncludeOnlyPassages() {
  const navTargets = new Set();
  const includeTargets = new Set();
  const allFiles = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (entry.name.endsWith('.tw')) allFiles.push(full);
    }
  };
  walk(PASSAGES_DIR);

  const navPatterns = [
    /\[\[([^\]|>]+?)\]\]/g,                                // [[Target]]
    /\[\[[^\]]+?\|([^\]]+?)\]\]/g,                         // [[Text|Target]]
    /\[\[[^\]]+?->\s*([^\]]+?)\]\]/g,                      // [[Text->Target]]
    /\[\[([^\]<]+?)\s*<-[^\]]+?\]\]/g,                     // [[Target<-Text]]
    /<<link\s+["'][^"']*["']\s+["']([^"']+)["']/g,         // <<link "text" "Target">>
    /<<goto\s+["']([^"']+)["']/g,                          // <<goto "Target">>
    /Engine\.play\s*\(\s*["']([^"']+)["']\s*\)/g,          // Engine.play("Target")
  ];
  const includePattern = /<<include\s+["']([^"']+)["']/g;
  const isDynamic = (t) => /[(`)$]/.test(t) || t.startsWith('_');

  for (const file of allFiles) {
    const text = fs.readFileSync(file, 'utf-8');
    for (const re of navPatterns) {
      for (const m of text.matchAll(re)) {
        const t = m[1].trim();
        if (!isDynamic(t)) navTargets.add(t);
      }
    }
    for (const m of text.matchAll(includePattern)) {
      const t = m[1].trim();
      if (!isDynamic(t)) includeTargets.add(t);
    }
  }

  const includeOnly = new Set();
  for (const name of includeTargets) {
    if (!navTargets.has(name)) includeOnly.add(name);
  }
  return includeOnly;
}

function applyEnvFilters(passages) {
  const filter = process.env.PWC_FILTER;
  const start = process.env.PWC_START;
  const limit = process.env.PWC_LIMIT ? Number(process.env.PWC_LIMIT) : null;
  let filtered = passages;
  if (filter) filtered = filtered.filter((p) => p.name.includes(filter));
  if (start) {
    const idx = filtered.findIndex((p) => p.name === start);
    if (idx >= 0) filtered = filtered.slice(idx);
  }
  if (limit && limit > 0) filtered = filtered.slice(0, limit);
  return filtered;
}

// Snapshot enough state to recreate "what the player saw at this
// moment": the rendered passage body, all visible forward-link text,
// all <img>/<source> srcs, and any visible macro-error markup. The
// click-each-link loop pulls from this snapshot rather than re-querying
// the DOM each iteration.
async function snapshotPage(page) {
  return await page.evaluate(() => {
    const passageEl = document.querySelector('.passage');
    const root = document.querySelector('#passages') || document.body;
    const result = {
      passage: SugarCube.State.passage,
      hasPassage: !!passageEl,
      issues: [],
      srcs: [],
      links: [],
    };
    if (!passageEl) {
      result.issues.push('no .passage element rendered');
      return result;
    }

    // SugarCube renders failed-macro errors as a <div class="error-view">
    // wrapper around <span class="error"> + <pre class="error-source">.
    // The span carries the message; the pre carries the raw source. We
    // care about the span's text. We don't gate on offsetParent because
    // error-views are sometimes embedded in inline contexts where
    // offsetParent legitimately returns null.
    const seenErrors = new Set();
    passageEl.querySelectorAll('.error-view .error, span.error, [class*="macro-error"]').forEach((el) => {
      const text = (el.textContent || '').trim().slice(0, 200);
      if (!text || seenErrors.has(text)) return;
      seenErrors.add(text);
      result.issues.push('macro-error: ' + text);
    });

    // For macro-leak / variable-leak scans, work off a clone with all
    // .error-view subtrees stripped — the raw <<macro>> source the
    // error-view echoes back is not a real leak, just diagnostic
    // markup. The error itself was already captured above.
    const clone = passageEl.cloneNode(true);
    clone.querySelectorAll('.error-view, .error-source').forEach((n) => n.remove());
    const txt = clone.textContent || '';
    // Match opening macros (<<name ...>>), closing macros (</name>>),
    // AND the print-expression shorthands <<= expr>> / <<- expr>>. The
    // [a-zA-Z]-only anchor previously missed <<=/<<- which let widget
    // bugs (e.g. "Ask <<= _cName>>...") render straight to the player
    // without flagging.
    const macroLeaks = txt.match(/<<[\/=\-a-zA-Z][^<>]{0,80}>>/g);
    if (macroLeaks) {
      result.issues.push('unprocessed-macros: ' + macroLeaks.slice(0, 3).join(' | '));
    }
    const varLeak = txt.match(/\$[a-zA-Z_]\w*\.\w+/);
    if (varLeak) result.issues.push('visible-variable: ' + varLeak[0]);

    passageEl.querySelectorAll('img, source').forEach((el) => {
      const src = el.getAttribute('src');
      if (src) result.srcs.push(src);
    });

    // Visible forward-link enumeration (mirrors random-walk-fuzzer):
    // any anchor / data-passage / link-internal / .macro-link that's
    // visible, enabled, and has text.
    const nodes = root.querySelectorAll('a, [data-passage], button.link-internal, .macro-link');
    const seenLinks = new Set();
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
      if (seenLinks.has(key)) return;
      seenLinks.add(key);
      result.links.push({ idx: i, text: text.slice(0, 80), target });
    });
    return result;
  });
}

function checkBrokenSrcs(srcs, assetRoots) {
  const broken = [];
  const seen = new Set();
  for (const src of srcs) {
    if (seen.has(src)) continue;
    seen.add(src);
    if (!assetRoots.some((r) => src.startsWith(r + '/'))) continue;
    // Out-of-context renders surface as paths containing the literal
    // string "undefined" (JS string-concat against an unset variable).
    // That's a separate class of bug surfaced by this spec via the
    // visible-variable / macro-error checks. Skip them here.
    if (/\/undefined(?:[._\/]|$)/.test(src)) continue;
    if (!MEDIA_EXT_RE.test(src)) {
      broken.push(`${src}  (no media extension — unresolved macro arg?)`);
      continue;
    }
    try {
      if (!fs.statSync(path.join(REPO_ROOT, src)).isFile()) {
        broken.push(`${src}  (not a file)`);
      }
    } catch {
      broken.push(`${src}  (file not found)`);
    }
  }
  return broken;
}

// Click the i-th candidate link in document order. Returns the dest
// passage name once the click has settled. Returns null if the click
// produced no visible change inside CLICK_SETTLE_MS — that's allowed
// (a no-op link such as a disabled toggle); the caller treats it as a
// data point, not a failure.
async function clickAndSettle(page, idx) {
  const before = await page.evaluate(() => ({
    passage: SugarCube.State.passage,
    htmlLen: (document.querySelector('.passage') || document.body).innerHTML.length,
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
        const cur = SugarCube.State.passage;
        const len = (document.querySelector('.passage') || document.body).innerHTML.length;
        return cur !== b.passage || len !== b.htmlLen;
      },
      before,
      { timeout: CLICK_SETTLE_MS }
    );
  } catch {
    return { settled: false, passage: before.passage };
  }
  await page.waitForTimeout(POST_CLICK_IDLE_MS);
  const after = await page.evaluate(() => SugarCube.State.passage);
  return { settled: true, passage: after };
}

// Group failures by the (deduped, sorted) set of issues so 50 separate
// "click X → DeliveryMap" failures with the same underlying error
// collapse into one entry that lists every source. Makes the output
// readable when one broken downstream passage cascades through dozens
// of upstream callers.
function groupFailures(failures) {
  const groups = new Map();
  for (const f of failures) {
    const key = [...new Set(f.issues)].sort().join('\n');
    if (!groups.has(key)) groups.set(key, { issues: [...new Set(f.issues)].sort(), labels: [] });
    groups.get(key).labels.push(f.label);
  }
  // Sort groups by descending impact so the most-cascading failures
  // come first.
  return [...groups.values()].sort((a, b) => b.labels.length - a.labels.length);
}

function formatFullReport(groups) {
  return groups
    .map((g, i) => {
      const head = `── group ${i + 1} (${g.labels.length} site${g.labels.length === 1 ? '' : 's'}) ──`;
      const issueLines = g.issues.map((s) => '  ' + s).join('\n');
      const labelLines = g.labels.map((l) => '    ' + l).join('\n');
      return `${head}\n${issueLines}\n  sites:\n${labelLines}`;
    })
    .join('\n\n');
}

function formatSummary(groups, total, shardLabel) {
  // Cap inline output at the 5 most-impactful groups — the rest go to
  // the artifact file. expect.toBe() embeds whatever we hand it into
  // the failure body, so we keep that body short.
  const head = groups.slice(0, 5).map((g) => {
    const sample = g.labels.slice(0, 3).join(' | ') + (g.labels.length > 3 ? ` …(+${g.labels.length - 3})` : '');
    return `(${g.labels.length}×) ${g.issues[0]}\n     e.g. ${sample}`;
  });
  const reportName = shardLabel
    ? `passage-walk-coverage-${shardLabel}.txt`
    : 'passage-walk-coverage.txt';
  return [
    `${total} site(s) flagged across ${groups.length} distinct issue group(s).`,
    'Top groups:',
    ...head,
    groups.length > 5 ? `…and ${groups.length - 5} more group(s) — see test-results/${reportName}` : null,
  ].filter(Boolean).join('\n');
}

function saveReport(body, label) {
  const dir = path.join(REPO_ROOT, 'test-results');
  const filename = label
    ? `passage-walk-coverage-${label}.txt`
    : 'passage-walk-coverage.txt';
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, filename), body);
  } catch {
    /* best-effort */
  }
}

// Walk a list of passages with a single browser page. Returns
// { failures, stats }. Pulled out of the test so it can be invoked
// from each parallel shard with its own disjoint slice of passages.
async function walkPassages(browser, passages, label) {
  const consoleErrors = [];
  const page = await openGame(browser, { seed: 1 });
  page.on('pageerror', (err) => {
    consoleErrors.push({ type: 'pageerror', text: err.message });
  });
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    // openGame aborts image/media/font requests at the network layer;
    // Chromium logs those as "Failed to load resource: net::ERR_FAILED".
    // They are not game bugs.
    if (/Failed to load resource: net::ERR_/.test(text)) return;
    consoleErrors.push({ type: 'console.error', text });
  });

  const imagePath = await page.evaluate(() => SugarCube.setup.ImagePath);
  const assetRoots = Array.from(new Set([imagePath, 'assets', 'asset-placeholders']));

  const linkCap = process.env.PWC_LINK_CAP
    ? Math.max(1, Number(process.env.PWC_LINK_CAP))
    : DEFAULT_LINK_CAP;
  const skipClicksOnBroken = process.env.PWC_SKIP_CLICKS_ON_BROKEN !== '0';

  const failures = [];
  const stats = { renderOk: 0, clicksTried: 0, clicksSettled: 0, linksSkipped: 0, passagesProcessed: 0 };

  // Persist a partial report every N passages so a timeout still leaves
  // the user with the issues collected so far. Cheap (one fs.writeFile
  // per checkpoint) and the artifact is useful for triaging which
  // passage the shard was on when it timed out.
  const CHECKPOINT_EVERY = 25;
  const writeCheckpoint = () => {
    const groups = groupFailures(failures);
    saveReport(
      `(checkpoint at ${stats.passagesProcessed}/${passages.length} passages)\n\n` +
      formatFullReport(groups),
      label
    );
  };

  function drainConsole() {
    const drained = consoleErrors.splice(0);
    return drained.map((e) => `${e.type}: ${e.text}`);
  }

  // Seed a "mid-game" baseline so passages that assume normal player
  // flow (a contract is open, a delivery shift has started, a companion
  // is selected, an event video is queued) can render. Without this we
  // surface ~200 "passage X errors when entered cold" findings, almost
  // all of which are state-not-initialized rather than real bugs. The
  // canonical initializers (setup.Ghosts.startHunt, setup.Delivery.initShift,
  // setup.Companion.defaultStateFor, setup.applySaveDefaults) are the
  // same ones invoked by GhostRandomize / WorkDelivery / SaveMigration
  // in normal play, so the resulting state matches what a player sees
  // on entry.
  async function seedBaselineState() {
    await page.evaluate(() => {
      const V = SugarCube.State.variables;
      const setup = SugarCube.setup;

      // SaveMigration normally runs on load and seeds $brook/$alice/...
      // and other post-launch defaults. Manual call gets equivalent
      // state on a fresh restart.
      if (typeof setup.applySaveDefaults === 'function') {
        setup.applySaveDefaults(V);
      }

      // Active hunt — needed by everything that reads $hunt or branches
      // on huntMode. Shade is a generic ghost with no special quirks.
      setup.Ghosts.startHunt('Shade');

      // Per-hunt search bags (every haunted-house room reads
      // $currentsearch<Room>). GhostRandomize does this in the real flow.
      setup.searchableRooms.forEach((room) => {
        V['currentsearch' + room] = setup.makeEmptySearchState();
      });

      // Delivery shift state ($orders, $order1..3, etc.). Without this
      // every Delivery* passage errors on the orders read.
      setup.Delivery.initShift();
      V.currentHouse = setup.deliveryStreets[0];
      V.currentOrder = 1;

      // Companion: pick Brook (cis) and seed $companion. Mirrors what
      // the player sees after picking a companion at the witch.
      V.companion = setup.Companion.defaultStateFor('Brook');
      setup.Companion.selectCompanion('Brook');
      V.chosenPlan = 'Plan1';

      // Force the post-solo-return branch on for all three cis
      // companions so the walker exercises the
      // <<cisCompanionSoloPicker>> "Ask … how … went" link in
      // BrookInfo / AliceInfo / BlakeInfo. Otherwise the cold render
      // always takes the else-branch and a regression like the one
      // fixed in widgetCompanion.tw (raw "<<= _cName>>" leak) would go
      // unseen by this sweep. AliceInfo additionally gates on
      // aliceWorkState === 2 — set that too.
      if (V.brook) V.brook.goingSolo = 2;
      if (V.alice) V.alice.goingSolo = 2;
      if (V.blake) V.blake.goingSolo = 2;
      if (typeof setup.Companion.setAliceWorkState === 'function') {
        setup.Companion.setAliceWorkState(2);
      }

      // Event content placeholders — passages that consume these
      // require non-empty path strings. ui/img/witch-girl.jpg is a
      // real asset under both asset-placeholders/ and assets/.
      V.videoEvent = 'ui/img/witch-girl.jpg';
      V.artImgEvent = 'ui/img/witch-girl.jpg';
      V.artVideoEvent = 'ui/img/witch-girl.jpg';

      // Default to "inside Owaissa house" so haunted-house rooms have
      // a recognised location flag set. Most location-aware passages
      // pick up either Owaissa or Elm; rooms in either renders cleanly
      // once the search bags above are in place.
      V.hauntedHouse = 'owaissa';
    });
  }

  async function gotoOrFail(name) {
    try {
      await resetGame(page);
      await seedBaselineState();
      try {
        await goToPassage(page, name);
      } catch (err) {
        // Some passages auto-redirect via <<goto>> in onLoad (e.g.
        // NudityEvent → Livingroom when MC is fully dressed). The
        // helper's waitForFunction(state.passage === name) then
        // times out because the engine has already moved on. That's
        // legitimate game flow, not a test failure — accept whatever
        // passage the engine actually settled on and let the snapshot
        // pass verify it rendered cleanly.
        const settled = await page.evaluate(() => SugarCube.State.passage);
        if (!settled) throw err;
      }
      return true;
    } catch (err) {
      return err;
    }
  }

  // Re-enter a passage WITHOUT a full Engine.restart. Used between
  // link iterations within the same passage. State from the previous
  // click carries over — that's intentional; restarting before every
  // click would more than double the sweep runtime, and "click did
  // not error" is the property we actually want to verify. If state
  // accumulation breaks a downstream click, that's still a real
  // finding (the player can hit the same accumulated state by
  // clicking links in the same order).
  async function softReenter(name) {
    try {
      try {
        await goToPassage(page, name);
      } catch (err) {
        // Auto-redirect tolerance — same rationale as gotoOrFail.
        // NudityEvent's onLoad redirects to Livingroom when MC is
        // fully dressed (which the baseline state sets up); the
        // helper's wait-for-passage check then times out, but the
        // engine has settled on a real passage we can still operate
        // against.
        const settled = await page.evaluate(() => SugarCube.State.passage);
        if (!settled) throw err;
      }
      return true;
    } catch (err) {
      return err;
    }
  }

  for (const { name } of passages) {
    stats.passagesProcessed++;
    if (stats.passagesProcessed % CHECKPOINT_EVERY === 0) writeCheckpoint();

    const gotoResult = await gotoOrFail(name);
    if (gotoResult !== true) {
      failures.push({
        label: `goto:${name}`,
        issues: [
          'navigation threw before render: ' + (gotoResult.message || String(gotoResult)),
          ...drainConsole(),
        ],
      });
      continue;
    }

    const snap = await snapshotPage(page);
    const consoleAtRender = drainConsole();
    const issues = [
      ...snap.issues,
      ...checkBrokenSrcs(snap.srcs, assetRoots).map((s) => 'broken-src: ' + s),
      ...consoleAtRender,
    ];
    const renderBroken = issues.length > 0;
    if (renderBroken) {
      failures.push({ label: `render:${name}`, issues });
    } else {
      stats.renderOk++;
    }

    // If the cold render itself errored, link clicks from this passage
    // will just propagate the same error and bury the report in
    // cascades. Skip them and let the user fix the root cause first.
    // (Toggle off via PWC_SKIP_CLICKS_ON_BROKEN=0.)
    if (renderBroken && skipClicksOnBroken) {
      stats.linksSkipped += snap.links.length;
      continue;
    }

    // Phase 2: click each visible forward link from this passage. We
    // loop by index over the snapshot we just took; for each click we
    // re-enter the source so state is consistent (clicks mutate
    // $vars and $hunt — re-rendering the source after a mutation
    // gives a different link list).
    const linksToTry = snap.links.slice(0, linkCap);
    stats.linksSkipped += Math.max(0, snap.links.length - linksToTry.length);
    for (let i = 0; i < linksToTry.length; i++) {
      const link = linksToTry[i];
      // Re-enter the source. First iteration: we're still on the
      // cold-render snapshot, so no nav needed. Subsequent iterations:
      // light goToPassage(name) (no Engine.restart) to re-render the
      // source after the prior click.
      const reenter = i === 0 ? true : await softReenter(name);
      if (reenter !== true) {
        // Source itself is now unreachable mid-walk — surface it as a
        // separate failure rather than crash the whole sweep.
        failures.push({
          label: `re-enter:${name} for link "${link.text}"`,
          issues: [
            'navigation threw on re-entry: ' + (reenter.message || String(reenter)),
            ...drainConsole(),
          ],
        });
        continue;
      }
      // The link list might shift between cold renders if the
      // passage consumes RNG or time. Re-fetch the link by its
      // (text, target) signature rather than trusting the original
      // index blindly.
      const reSnap = await snapshotPage(page);
      const match = reSnap.links.find(
        (l) => l.text === link.text && l.target === link.target
      );
      if (!match) {
        // Link wasn't reproducible on re-entry — likely RNG-gated.
        // Skip without flagging; the random-walk fuzzer covers
        // RNG-dependent paths.
        drainConsole();
        continue;
      }

      stats.clicksTried++;
      const dest = await clickAndSettle(page, match.idx);
      const destSnap = await snapshotPage(page);
      const consoleAtClick = drainConsole();
      const destIssues = [
        ...destSnap.issues,
        ...checkBrokenSrcs(destSnap.srcs, assetRoots).map((s) => 'broken-src: ' + s),
        ...consoleAtClick,
      ];
      if (destIssues.length) {
        const arrow = dest.passage && dest.passage !== name ? `→ ${dest.passage}` : '(in-passage)';
        failures.push({
          label: `click:${name} "${link.text}" ${arrow}`,
          issues: destIssues,
        });
      }
      if (dest.settled) stats.clicksSettled++;
    }
  }

  await page.close();
  return { failures, stats };
}

// Number of parallel shards. Default ≈50% of cores so the sweep
// finishes faster but the machine stays responsive (the editor + IDE
// extension share the box). Each shard is its own browser page in its
// own Playwright worker process.
const SHARD_COUNT = Math.max(
  1,
  process.env.PWC_SHARDS ? Number(process.env.PWC_SHARDS) : Math.floor(os.cpus().length / 2)
);

// Allow the per-test blocks below to run concurrently. Without this the
// shards would still serialize within the file (fullyParallel: false in
// playwright.config.js).
test.describe.configure({ mode: 'parallel' });

test.describe('passage walk coverage', () => {
  for (let shardIdx = 0; shardIdx < SHARD_COUNT; shardIdx++) {
    const shardLabel = `shard-${shardIdx + 1}-of-${SHARD_COUNT}`;
    test(`${shardLabel}: every passage renders cold and every visible link transitions cleanly`,
      async ({ browser }) => {
        // Per-shard timeout. With SHARD_COUNT≈cores/2 each shard handles
        // ~1/N of the passage list and finishes well within the budget;
        // generous because cold renders on heavy passages (hunts with
        // many <<do>>/<<redo>> tags) can take seconds.
        test.setTimeout(20 * 60 * 1000);

        const allPassages = collectPassages();
        expect(allPassages.length, 'expected to find passages on disk').toBeGreaterThan(50);

        // Filter out files that hold widget definitions but lack the
        // `widget` tag on their header, plus passages that are only
        // ever referenced via <<include>> (templating fragments
        // expecting their parent passage's DOM to be present).
        const includeOnly = collectIncludeOnlyPassages();
        const navigable = allPassages.filter(
          (p) => !isWidgetContainer(p) && !includeOnly.has(p.name)
        );
        const filtered = applyEnvFilters(navigable);
        expect(filtered.length, 'no passages matched env filter').toBeGreaterThan(0);

        // Round-robin slice. This spreads alphabetically-clustered
        // passages (e.g. all Companion*) across shards so no one shard
        // ends up with all the heavy state-dependent renders.
        const shardPassages = filtered.filter((_, i) => i % SHARD_COUNT === shardIdx);

        const { failures, stats } = await walkPassages(browser, shardPassages, shardLabel);

        // eslint-disable-next-line no-console
        console.log(
          `[${shardLabel}] passages=${shardPassages.length} ` +
          `clean-renders=${stats.renderOk} clicks-tried=${stats.clicksTried} ` +
          `clicks-settled=${stats.clicksSettled} links-skipped=${stats.linksSkipped} ` +
          `flagged-sites=${failures.length}`
        );

        const groups = groupFailures(failures);
        saveReport(formatFullReport(groups), shardLabel);

        // Numeric assertion — Playwright's deep-equality diff would
        // otherwise inline every failure entry and bury the summary.
        expect(
          failures.length,
          `\n[${shardLabel}]\n` + formatSummary(groups, failures.length, shardLabel) + '\n'
        ).toBe(0);
      });
  }
});
