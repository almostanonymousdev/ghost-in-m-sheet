// Pure-node lint: the dialogue container macros must be allow-listed as
// block macros everywhere indentation/format logic lives, so the
// auto-formatter (tools/format_twee.py, the "Twee: Format" task) and the
// indentation lint (this suite) agree on how <<mc>>/<<say>>/<<thought>>/
// <<vocal>>/<<narration>> bodies are indented and their closers aligned.
//
// Regression guard for: the formatter not knowing about the dialogue
// wrappers, so it indented their lone closers as plain content (one tab
// deeper than the enclosing block) while the reference style aligns the
// closer to its opener. Keeping the three block-macro sets in sync for the
// dialogue subset is what makes formatter output pass the lint.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

/** Read the {...}/[...] literal that follows `ident` and return every
 *  single/double-quoted token inside it. Balances the opening delimiter so
 *  a trailing brace elsewhere in the file can't over-capture. */
function extractQuotedSet(file, ident) {
  const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const at = text.indexOf(ident);
  expect(at, `${ident} not found in ${file}`).toBeGreaterThanOrEqual(0);
  // Find the first opening { or [ after the identifier.
  const openIdx = text.slice(at).search(/[[{]/);
  expect(openIdx, `no set/list literal after ${ident} in ${file}`).toBeGreaterThanOrEqual(0);
  const start = at + openIdx;
  const open = text[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let end = -1;
  for (let i = start; i < text.length; i++) {
    if (text[i] === open) depth++;
    else if (text[i] === close && --depth === 0) { end = i; break; }
  }
  expect(end, `unbalanced ${open}${close} after ${ident} in ${file}`).toBeGreaterThan(start);
  const body = text.slice(start, end + 1);
  return new Set([...body.matchAll(/['"]([a-z][\w]*)['"]/gi)].map((m) => m[1].toLowerCase()));
}

test.describe('dialogue macros are allow-listed as block macros', () => {
  // Canonical source of truth for the dialogue wrapper names.
  const dialogueMacros = extractQuotedSet('tools/check_format.py', 'DIALOGUE_MACROS');

  test('check_format.py defines the expected dialogue wrappers', () => {
    expect([...dialogueMacros].sort()).toEqual(
      ['mc', 'narration', 'say', 'thought', 'vocal']
    );
  });

  const targets = [
    ['tools/format_twee.py', 'BLOCK_MACROS'],          // the auto-formatter
    ['tests/tw-source-lint.spec.js', 'BLOCK_MACROS'],  // the indentation lint
  ];

  for (const [file, ident] of targets) {
    test(`${file} ${ident} includes every dialogue macro`, () => {
      const block = extractQuotedSet(file, ident);
      const missing = [...dialogueMacros].filter((m) => !block.has(m));
      expect(missing, `${file} ${ident} is missing: ${missing.join(', ')}`).toHaveLength(0);
    });
  }
});
