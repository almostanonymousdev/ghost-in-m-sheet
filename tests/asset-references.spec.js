const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

/**
 * Verifies that every static asset reference in the source resolves
 * to a real file under both `assets/` (production) and `asset-placeholders/`
 * (dev stubs). Catches the class of bug where content is authored against
 * placeholders but an artwork file is missing from the production tree
 * (users report "some images aren't showing up" after playing the release).
 *
 * Scans .tw passages, .css stylesheets, and .js controllers: the
 * .tw -> .js/.css migration moved `url(assets/…)` rules into standalone
 * stylesheets and asset-path data tables (room backgrounds, icon paths,
 * video lists) into controller scripts, so a .tw-only walk would no longer
 * see them. Block comments (`/* … *\/`) in .js/.css are stripped before
 * extraction so example paths in doc-comments aren't mistaken for refs.
 *
 * Covers the same patterns as check_assets.py plus:
 *   - Object-literal keys (src:, image:, img:) whose values contain a "/"
 *     so we know they're full paths, not e.g. ghost icon stems like
 *     "spirit.webp" that get a site-specific prefix from their caller.
 *   - Array-literal video/image paths such as ["skirt1/1.mp4", ...].
 *   - <<randRangeImg prefix start end ext>> expansions.
 *   - <<randRangeVideo prefix start end ext>> expansions.
 *   - <<deliveryVideo cat start [end]>> expansions.
 *
 * Dynamic references (template literals that splice variables into paths,
 * e.g. `setup.ImagePath + "/ghosts/specials/twins" + _videoIndex + ".mp4"`)
 * cannot be checked statically and are intentionally skipped by the
 * extension-suffix filter.
 */

const REPO_ROOT = path.join(__dirname, '..');
const PASSAGES_DIR = path.join(REPO_ROOT, 'passages');
const ASSET_ROOTS = ['assets', 'asset-placeholders'];

const EXT_RE = /\.(jpg|jpeg|png|webp|gif|mp4|webm)$/i;

// Different callers prepend different path stems to the same literal
// ("pizzaevent/1.jpg" is consumed as "scenes/deliveryhub/pizzaevent/1.jpg" in
// one widget, "ui/img/pizzaevent/1.jpg" wouldn't be valid — the consumer
// dictates the stem). Accept any reference that exists under one of these.
const CANDIDATE_PREFIXES = [
  '',
  'ui/img/',
  'scenes/deliveryhub/',
  'characters/ghosts/',
  'characters/mc/piercing/',
  'scenes/furniture/',
];

function collectSourceFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectSourceFiles(full));
    else if (/\.(tw|css|js)$/.test(entry.name)) out.push(full);
  }
  return out;
}

// Read a source file, stripping `/* … */` block comments for .js/.css so
// example paths inside doc-comments (e.g. the StyleController usage notes)
// aren't picked up as live asset references. Twee (.tw) is read verbatim —
// `/* */` there is prose, not a comment.
function readSource(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  if (/\.(js|css)$/.test(filePath)) {
    // Preserve newlines so reported line numbers stay accurate.
    return content.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  }
  return content;
}

function extractRefs(filePath) {
  const refs = [];
  const content = readSource(filePath);
  const lines = content.split('\n');

  const push = (p, lineno) => {
    if (!EXT_RE.test(p)) return;
    refs.push({ path: p, file: filePath, lineno });
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineno = i + 1;

    // @src="setup.ImagePath + '/PATH'"
    for (const m of line.matchAll(/@src\s*=\s*["']setup\.ImagePath\s*\+\s*['"`]\/?([^'"`\n]+?)['"`]/g)) {
      push(m[1], lineno);
    }
    // <<video "PATH"...>> / <<image "PATH"...>> — first arg is a static
    // string relative to setup.ImagePath. Dynamic paths (variable concat,
    // template literals) are skipped: the lookahead requires the closing
    // quote be followed by end-of-macro, an options object, or a class
    // shorthand string; anything else (e.g. `"prefix" + var`) falls through.
    for (const m of line.matchAll(/<<(?:video|image)\s+['"]\/?([^'"\n]+?)['"](?=\s*(?:>>|\{|['"]))/g)) {
      push(m[1], lineno);
    }
    // src="assets/PATH" or href="assets/PATH"
    for (const m of line.matchAll(/(?:src|href)\s*=\s*["']assets\/([^"'\n]+)["']/g)) {
      push(m[1], lineno);
    }
    // url('assets/PATH') in CSS
    for (const m of line.matchAll(/url\(['"]?assets\/([^"')\n]+)['"]?\)/g)) {
      push(m[1], lineno);
    }
    // <<furnitureItem "FILE" "id">>
    for (const m of line.matchAll(/<<furnitureItem\s+["']([^"'\n]+)["']/g)) {
      push('scenes/furniture/' + m[1], lineno);
    }
    // <<hideSpot "passage" "FILE" "id">>
    for (const m of line.matchAll(/<<hideSpot\s+["'][^"'\n]+["']\s+["']([^"'\n]+)["']/g)) {
      push('scenes/furniture/' + m[1], lineno);
    }
    // <<randRangeImg "prefix" START END ".ext">>
    for (const m of line.matchAll(/<<randRangeImg\s+["']([^"'\n]+)["']\s+(\d+)\s+(\d+)\s+["']([^"'\n]+)["']/g)) {
      const [, pref, s, e, ext] = m;
      for (let n = parseInt(s); n <= parseInt(e); n++) push(pref + n + ext, lineno);
    }
    // <<randRangeVideo "prefix" START END ".ext">>
    for (const m of line.matchAll(/<<randRangeVideo\s+["']([^"'\n]+)["']\s+(\d+)\s+(\d+)\s+["']([^"'\n]+)["']/g)) {
      const [, pref, s, e, ext] = m;
      for (let n = parseInt(s); n <= parseInt(e); n++) push(pref + n + ext, lineno);
    }
    // <<deliveryVideo "cat" START [END]>>
    for (const m of line.matchAll(/<<deliveryVideo\s+["']([^"'\n]+)["']\s+(\d+)(?:\s+(\d+))?\s*>>/g)) {
      const [, cat, s, e] = m;
      const start = parseInt(s);
      const end = e !== undefined ? parseInt(e) : start;
      for (let n = start; n <= end; n++) push('scenes/deliveryhub/' + cat + '/' + n + '.mp4', lineno);
    }
    // Any string literal that contains a "/" and ends in a media extension:
    // catches { src: "characters/brook/1.jpg" }, ["skirt1/1.mp4", ...], and
    // the image: / img: / icon: keys whose values are real paths.
    // (Bare filenames like "spirit.webp" are skipped — the caller's site-
    // specific prefix varies, so we can't verify them without a map.)
    for (const m of line.matchAll(/["'`]([A-Za-z0-9_][A-Za-z0-9_.-]*\/[A-Za-z0-9_][A-Za-z0-9_\/.-]*\.(?:jpg|jpeg|png|webp|gif|mp4|webm))["'`]/gi)) {
      // CSS url('assets/…') and JS data tables write the literal "assets/"
      // prefix; the runtime rewriter swaps it for setup.ImagePath. Strip it
      // so these resolve against the same on-disk layout as the url() rule
      // (and dedupe cleanly with refs it already captured).
      const p = m[1].startsWith('assets/') ? m[1].slice('assets/'.length) : m[1];
      push(p, lineno);
    }
  }
  return refs;
}

function existsUnder(root, p) {
  for (const pref of CANDIDATE_PREFIXES) {
    try {
      fs.accessSync(path.join(REPO_ROOT, root, pref + p));
      return true;
    } catch {}
  }
  return false;
}

function relFile(file) {
  return path.relative(REPO_ROOT, file);
}

// Detect the class of typo where an author migrating from raw
// `<img @src="setup.ImagePath + '/foo/' + _v + '/bar.png'">` to the
// `<<image>>/<<video>>` macro preserves the inner single-quoted concat
// inside the outer double-quoted macro argument, e.g.
//   <<image "ghosts/' + _ghostName + '.webp" "iconPx">>
// SugarCube reads this as the single literal string
// "ghosts/' + _ghostName + '.webp", so the URL resolves to a missing
// asset. Real asset paths never contain "+", so any "+" inside the
// first-arg string literal of <<image>>/<<video>> is a bug marker.
// The correct form is a JS concat across separate string literals:
//   <<image "ghosts/" + _ghostName + ".webp" "iconPx">>
function extractBrokenConcatRefs(filePath) {
  const bad = [];
  const content = readSource(filePath);
  const lines = content.split('\n');
  const patterns = [
    /<<(?:image|video)\s+"([^"\n]*\+[^"\n]*)"/g,
    /<<(?:image|video)\s+'([^'\n]*\+[^'\n]*)'/g,
  ];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const re of patterns) {
      for (const m of line.matchAll(re)) {
        // Skip matches embedded inside a backtick template literal (e.g.
        // `<<link \`'<<image "' + _path + '">>'\` "target">>`, which builds
        // markup dynamically -- the concat is correct JS, not a typo).
        const before = line.slice(0, m.index);
        const backtickCount = (before.match(/`/g) || []).length;
        if (backtickCount % 2 === 1) continue;
        bad.push({ file: filePath, lineno: i + 1, text: m[0] });
      }
    }
  }
  return bad;
}

// Detect backtick-wrapped first arguments on <<image>>/<<video>>, e.g.
//   <<image `_c.imagePath(State.variables[_chanceVar])` { width: "100%" }>>
// SugarCube does NOT reliably evaluate backtick expressions as the first
// arg of these macros when the expression contains brackets/parens
// (observed: companion-portrait regression where the URL rendered as the
// literal string "_c.imagePath(State.variables[_chanceVar])"). The raw-
// expression form is always supported and is what other sites use:
//   <<image _c.imagePath(State.variables[_chanceVar]) { width: "100%" }>>
//   <<image _ac.portraitPath() "companion-image">>
//   <<image "img/wardrobe/" + _grp.bareImage>>
function extractBacktickFirstArg(filePath) {
  const bad = [];
  const content = readSource(filePath);
  const lines = content.split('\n');
  const re = /<<(?:image|video)\s+`[^`\n]*`/g;
  for (let i = 0; i < lines.length; i++) {
    for (const m of lines[i].matchAll(re)) {
      bad.push({ file: filePath, lineno: i + 1, text: m[0] });
    }
  }
  return bad;
}

test.describe('asset references', () => {
  // Gather once — reused across the per-root assertions below.
  const allFiles = collectSourceFiles(PASSAGES_DIR);
  const allRefs = allFiles.flatMap(extractRefs);

  // Deduplicate by asset path; keep the first reporting location.
  const byPath = new Map();
  for (const r of allRefs) if (!byPath.has(r.path)) byPath.set(r.path, r);

  for (const root of ASSET_ROOTS) {
    const rootAbs = path.join(REPO_ROOT, root);
    // Skip roots that aren't present in this checkout (a symlink may be
    // broken on a dev machine that hasn't synced the art yet).
    const rootExists = fs.existsSync(rootAbs);

    test(`every referenced asset exists under ${root}/`, () => {
      test.skip(!rootExists, `${root}/ not present in this checkout`);
      const missing = [];
      for (const [p, r] of byPath) {
        if (!existsUnder(root, p)) {
          missing.push(`  ${p}  (first referenced at ${relFile(r.file)}:${r.lineno})`);
        }
      }
      expect(
        missing,
        `${missing.length} asset reference(s) resolve to no file under ${root}/:\n${missing.join('\n')}`
      ).toHaveLength(0);
    });
  }

  test('no broken-concat typos in <<image>>/<<video>> first argument', () => {
    const bad = allFiles.flatMap(extractBrokenConcatRefs);
    const report = bad.map(b => `  ${relFile(b.file)}:${b.lineno}  ${b.text}`);
    expect(
      bad,
      `${bad.length} <<image>>/<<video>> call(s) have "+" inside the quoted ` +
      `first argument — this is almost certainly a concat typo like ` +
      `<<image "foo/' + _v + '.png">> (rewrite as "foo/" + _v + ".png"):\n` +
      report.join('\n')
    ).toHaveLength(0);
  });

  test('no backtick-wrapped first argument on <<image>>/<<video>>', () => {
    const bad = allFiles.flatMap(extractBacktickFirstArg);
    const report = bad.map(b => `  ${relFile(b.file)}:${b.lineno}  ${b.text}`);
    expect(
      bad,
      `${bad.length} <<image>>/<<video>> call(s) use backticks around the ` +
      `first argument — SugarCube does not reliably evaluate these when the ` +
      `expression contains brackets/parens (the URL renders as the literal ` +
      `template text). Drop the backticks; the raw-expression form (e.g. ` +
      `<<image _c.imagePath(x) ...>> or <<image "foo/" + _v>>) works:\n` +
      report.join('\n')
    ).toHaveLength(0);
  });
});
