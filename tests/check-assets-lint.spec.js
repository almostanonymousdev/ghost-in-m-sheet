const { test, expect } = require('@playwright/test');
const { spawnSync } = require('child_process');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(REPO_ROOT, 'tools', 'check_assets.py');

/**
 * check_assets.py walks passages/ (.tw + .css + .js) for every static asset
 * reference (<<video>>/<<image>> macros, url(assets/…), bare "assets/…"
 * literals, furniture/hideSpot widgets) and fails the build if a path points
 * at a file not on disk.
 *
 * Example asset paths inside JS/CSS *doc-comments* (e.g. the StyleController
 * usage notes documenting `<<video "characters/mc/bra-off.webm">>`) are NOT
 * live references and must not be required on disk. The checker blanks
 * `/* … *\/` block comments in .js/.css before scanning — the same strip
 * tests/asset-references.spec.js already applies. (In dev mode this bug is
 * latent because a like-named placeholder happens to exist; it bites in a
 * release build where setup.ImagePath points at the production `assets/`
 * tree and the doc-example file is absent.)
 */

// Run a snippet of Python with tools/ on sys.path and check_assets imported.
function runPy(body) {
  const code = `import sys; sys.path.insert(0, ${JSON.stringify(path.join(REPO_ROOT, 'tools'))})\nimport check_assets as ca\n${body}`;
  return spawnSync('python3', ['-c', code], { cwd: REPO_ROOT, encoding: 'utf-8' });
}

test('check_assets.py finds no missing assets in the current tree', () => {
  const result = spawnSync('python3', [SCRIPT], { cwd: REPO_ROOT, encoding: 'utf-8' });
  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  expect(
    result.status,
    `check_assets.py exited ${result.status}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
  ).toBe(0);
  expect(stdout).toContain('All referenced assets exist on disk.');
});

test('dynamic (concatenated) asset paths are anchored, globbed, and checked', () => {
  // scan_dynamic replaces every variable segment of a `+`-built path with `*`
  // and requires the resulting glob to match >=1 file. It must: keep a literal
  // directory anchor, ignore the options object / trailing positional args,
  // read template-literal tails, skip paths with no literal anchor, and leave
  // lone literals to the static pass. A typo'd directory/extension literal
  // produces a glob that matches nothing — which is exactly the catch.
  const result = runPy([
    'B = ca.ASSET_BASE',
    'gl = lambda src: sorted(set(p for p, _ in ca.scan_dynamic(src)))',
    // anchored macro path
    "assert gl('<<video \"scenes/deliveryhub/specialevent/\" + _pick + \".webm\">>') == [B + '/scenes/deliveryhub/specialevent/*.webm'], 'macro anchor'",
    // leading variable -> no anchor -> skipped
    "assert gl('<<image _args[0] + _n + _args[3]>>') == [], 'no-anchor skip'",
    // the options-object `+` must not be read as part of the path
    "assert gl('<<image \"ui/img/\" + _icon { style: \"x\" + _y }>>') == [B + '/ui/img/*'], 'options ignored'",
    // a trailing positional arg (e.g. a CSS class) is not part of the path
    "assert gl('<<image \"characters/ghosts/\" + _g.image \"iconPx\">>') == [B + '/characters/ghosts/*'], 'positional arg ignored'",
    // a backtick-template tail contributes its literal text
    "assert gl('<<video \"characters/succubus/pc\" + _i+`.mp4`>>') == [B + '/characters/succubus/pc*.mp4'], 'template tail'",
    // bare JS concat with member/call/index operands
    'assert gl(\'return "characters/rescue/" + slug + "/" + ch.id + "." + v + ".mp4";\') == [B + \'/characters/rescue/*/*.*.mp4\'], "js concat"',
    // 'assets/' + wholePathVar normalises to the asset root -> skipped
    "assert gl(\"<<bodyBackground `'assets/' + _img`>>\") == [], 'root-only anchor skip'",
    // a lone literal is not a concatenation -> left to the static pass
    "assert gl('<<video \"characters/mc/x.webm\">>') == [], 'lone literal skip'",
    // ${} template interpolation is unresolvable -> skipped
    "assert gl('<<image `characters/${_x}/y.png`>>') == [], 'interpolation skip'",
    // detection: a typo'd directory literal yields a glob that matches nothing
    "typo = gl('<<video \"scenes/deliveryhub/specialevnt/\" + _p + \".webm\">>')",
    "assert typo == [B + '/scenes/deliveryhub/specialevnt/*.webm'], typo",
    "assert next(ca.repo_root().glob(typo[0]), None) is None, 'typo glob must match no file on disk'",
    "print('DYN_OK')",
  ].join('\n'));
  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  expect(
    result.status,
    `dynamic-path unit check exited ${result.status}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
  ).toBe(0);
  expect(stdout).toContain('DYN_OK');
});

test('block-comment example paths in .js/.css are not required on disk', () => {
  // A multi-line /* … */ doc-comment referencing a definitely-missing asset
  // must be blanked out, so its example path never reaches the on-disk check.
  // Newlines are preserved so reported line numbers stay accurate. Twee (.tw)
  // is read verbatim — `/* */` there is prose. A live (non-comment) reference
  // must survive the strip so real broken paths are still caught.
  const result = runPy([
    'doc = \'/*\\n *   <<video "characters/mc/__doc_only__.webm" "cls">>\\n */\\nvar x = 1;\'',
    "stripped = ca.strip_comments(doc, '.js')",
    "assert '__doc_only__' not in stripped, 'block comment not stripped: ' + repr(stripped)",
    "assert stripped.count(chr(10)) == doc.count(chr(10)), 'newlines not preserved'",
    "assert '__live__' in ca.strip_comments('var p = \"assets/characters/mc/__live__.webm\";', '.js'), 'live ref wrongly stripped'",
    "assert '__tw__' in ca.strip_comments('/* prose */ \"assets/x/__tw__.png\"', '.tw'), 'twee should be verbatim'",
    "print('UNIT_OK')",
  ].join('\n'));
  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  expect(
    result.status,
    `comment-strip unit check exited ${result.status}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
  ).toBe(0);
  expect(stdout).toContain('UNIT_OK');
});
