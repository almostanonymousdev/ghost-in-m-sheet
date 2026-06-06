// Pure-node lint: drives tools/format_twee.py (the "Twee: Format" task) over
// synthetic fixtures to lock in the dialogue-collapse convention — the
// open/close of a dialogue macro should live on the SAME line whenever the
// body is a single line, while genuinely multi-line bodies stay blocks.
//
// Regression guard for two bugs found while migrating to the dialogue macros:
//   1. a trivial `<<say>>text` / `<</say>>` split must be pulled inline;
//   2. an italic run (`//…//`) ending right before the closer must collapse
//      cleanly — earlier the closer ended up after a `//` and tripped the
//      indentation lint, which read `//` as a JS comment (see
//      tests/tw-source-lint.spec.js, blankInlineDialogueBodies).
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const FORMATTER = path.join(ROOT, 'tools', 'format_twee.py');

/** Format `text` through format_twee.py in a throwaway temp file and return
 *  { out, idempotent }. `idempotent` is true iff a follow-up `--check`
 *  (which exits non-zero when a file would still change) reports clean. */
function format(text) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fmt-dlg-'));
  const file = path.join(dir, 'sample.tw');
  try {
    fs.writeFileSync(file, text, 'utf8');
    execFileSync('python3', [FORMATTER, file], { cwd: ROOT });
    const out = fs.readFileSync(file, 'utf8');
    let idempotent = true;
    try {
      execFileSync('python3', [FORMATTER, '--check', file], { cwd: ROOT });
    } catch {
      idempotent = false;
    }
    return { out, idempotent };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const HEADER = '{"position":"100,100","size":"100,100"}';

test.describe('format_twee.py — dialogue open/close on the same line', () => {
  test('a single-line dialogue body is pulled onto one inline line', () => {
    const { out, idempotent } = format(
      `:: T [nobr] ${HEADER}\n<<say "Jerry">>Hello there\n<</say>>\n`
    );
    expect(out).toContain('<<say "Jerry">>Hello there<</say>>');
    expect(out).not.toMatch(/^<<\/say>>/m); // no lone closer line left behind
    expect(idempotent).toBe(true);
  });

  test('a dialogue opener glued after <<else>> still collapses', () => {
    const { out, idempotent } = format(
      `:: T [nobr] ${HEADER}\n<<if $x>>\n\t<<thought>>yes<</thought>>\n<<else>><<thought>>no\n<</thought>>\n<</if>>\n`
    );
    expect(out).toContain('<<else>><<thought>>no<</thought>>');
    expect(idempotent).toBe(true);
  });

  test('a genuinely multi-line dialogue body stays a block', () => {
    const { out, idempotent } = format(
      `:: T [nobr] ${HEADER}\n<<thought>>line one<br>\nline two\n<</thought>>\n`
    );
    // The continuation line means it can't collapse: closer keeps its own
    // line (aligned to the opener at column 0) and the body indents deeper.
    expect(out).toMatch(/^<<\/thought>>/m);
    expect(out).toMatch(/^\tline two$/m);
    expect(idempotent).toBe(true);
  });

  test('an italic run right before the closer collapses cleanly (no // mishap)', () => {
    const { out, idempotent } = format(
      `:: T [nobr] ${HEADER}\n<<thought>>plain text. //italic tail//\n<</thought>><br>\n`
    );
    expect(out).toContain('<<thought>>plain text. //italic tail//<</thought>><br>');
    expect(idempotent).toBe(true);
  });
});
