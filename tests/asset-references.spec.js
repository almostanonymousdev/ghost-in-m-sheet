const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

/**
 * Verifies that every static asset reference in the .tw source resolves
 * to a real file under both `assets/` (production) and `asset-placeholders/`
 * (dev stubs). Catches the class of bug where content is authored against
 * placeholders but an artwork file is missing from the production tree
 * (users report "some images aren't showing up" after playing the release).
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
// ("pizzaevent/1.jpg" is consumed as "deliveryhub/pizzaevent/1.jpg" in one
// widget, "img/pizzaevent/1.jpg" wouldn't be valid — the consumer dictates
// the stem). Accept any reference that exists under one of these candidates.
const CANDIDATE_PREFIXES = ['', 'img/', 'deliveryhub/', 'ghosts/', 'img/piercing/', 'img/furniture/'];

function collectTwFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectTwFiles(full));
    else if (entry.name.endsWith('.tw')) out.push(full);
  }
  return out;
}

function extractRefs(filePath) {
  const refs = [];
  const content = fs.readFileSync(filePath, 'utf-8');
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
      push('img/furniture/' + m[1], lineno);
    }
    // <<hideSpot "passage" "FILE" "id">>
    for (const m of line.matchAll(/<<hideSpot\s+["'][^"'\n]+["']\s+["']([^"'\n]+)["']/g)) {
      push('img/furniture/' + m[1], lineno);
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
      for (let n = start; n <= end; n++) push('deliveryhub/' + cat + '/' + n + '.mp4', lineno);
    }
    // Any string literal that contains a "/" and ends in a media extension:
    // catches { src: "trans/pics/1.0.jpg" }, ["skirt1/1.mp4", ...], and
    // the image: / img: / icon: keys whose values are real paths.
    // (Bare filenames like "spirit.webp" are skipped — the caller's site-
    // specific prefix varies, so we can't verify them without a map.)
    for (const m of line.matchAll(/["'`]([A-Za-z0-9_][A-Za-z0-9_.-]*\/[A-Za-z0-9_][A-Za-z0-9_\/.-]*\.(?:jpg|jpeg|png|webp|gif|mp4|webm))["'`]/gi)) {
      // Skip refs already captured by the url('assets/…') rule; those were
      // pushed with the "assets/" stripped, while this regex keeps it.
      if (m[1].startsWith('assets/')) continue;
      push(m[1], lineno);
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

test.describe('asset references', () => {
  // Gather once — reused across the per-root assertions below.
  const allFiles = collectTwFiles(PASSAGES_DIR);
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
});
