/**
 * Controller method-naming convention.
 *
 * Each controller (passages/<area>/<Name>Controller.tw, also nested
 * subcontrollers) exposes its API as `setup.<Name>`. To keep the
 * surface predictable, methods follow a fixed verb scheme:
 *
 *   Getter (no-arg, returns a value):  bareNoun()       e.g. money(), sanity()
 *   Setter (1 arg, writes a field):    setNoun(v)
 *   Increment (1 arg, += n):           addNoun(n)
 *   Decrement (1 arg, -= n):           removeNoun(n)
 *   Force-clear:                       clearNoun()
 *   Force-set (truthy):                markNounYyy()
 *   Predicate (no-arg, returns bool):  hasX() / canX() / isX()
 *   Action verb:                       use*, apply*, consume*, pick*, roll*,
 *                                      reset*, activate*, ensure*, fire*, …
 *
 * This lint policies a small blocklist of off-pattern prefixes that
 * have crept in during refactors. Adding a new convention violation
 * to the list is easier and less annoying than reviewing every PR for
 * it by hand.
 */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const PASSAGES_ROOT = path.join(__dirname, '..', 'passages');

/* Recursively collect every Controller.tw file under passages/. */
function collectControllerFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectControllerFiles(full));
    } else if (entry.name.endsWith('Controller.tw')) {
      out.push(full);
    }
  }
  return out;
}

/* Strip JS strings + comments so identifiers inside them don't
   register as method names. */
function stripStringsAndComments(js) {
  return js
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}

/* Disallowed method-name prefixes. Each entry is { prefix, zeroArgOnly,
   suggestion } When `zeroArgOnly` is true the rule only fires on no-arg
   methods — parametric lookups like `getByName(name)` / `getVideos(key)`
   are legitimate queries and are intentionally exempted. */
const BAD_PREFIXES = [
  { prefix: 'get', zeroArgOnly: true,
    suggestion: 'use bare-noun getter (e.g. money() not getMoney())' },
];

test.describe('controller method naming', () => {

  test('no off-pattern verb prefixes (get*) on controller methods', () => {
    const files = collectControllerFiles(PASSAGES_ROOT);
    const violations = [];

    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      // Walk passage by passage; only [script] passages declare controllers.
      const lines = text.split('\n');
      let inScriptPassage = false;
      let passageStart = 0;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith(':: ')) {
          inScriptPassage = /\[\s*[^\]]*\bscript\b[^\]]*\]/.test(line);
          passageStart = i;
          continue;
        }
        if (!inScriptPassage) continue;
        const stripped = stripStringsAndComments(line);
        // Match `^<whitespace><name>: function` at start of stripped line —
        // the canonical method-definition form inside a return-object
        // literal or `api.X = function ...` assignment.
        const m =
          stripped.match(/^\s+([a-z][a-zA-Z0-9_]*)\s*:\s*function\s*\(([^)]*)\)/) ||
          stripped.match(/^\s+api\.([a-z][a-zA-Z0-9_]*)\s*=\s*function\s*\(([^)]*)\)/);
        if (!m) continue;
        const name = m[1];
        const isZeroArg = m[2].trim() === '';
        for (const { prefix, zeroArgOnly, suggestion } of BAD_PREFIXES) {
          if (zeroArgOnly && !isZeroArg) continue;
          const re = new RegExp('^' + prefix + '[A-Z]');
          if (re.test(name)) {
            const rel = path.relative(PASSAGES_ROOT, file);
            violations.push(`${rel}:${i + 1}  ${name}  — ${suggestion}`);
          }
        }
      }
    }

    expect(
      violations,
      `Off-pattern controller method names found:\n  ${violations.join('\n  ')}`
    ).toEqual([]);
  });

});
