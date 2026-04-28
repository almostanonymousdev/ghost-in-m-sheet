const { test, expect } = require('@playwright/test');
const { spawnSync } = require('child_process');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(REPO_ROOT, 'tools', 'check_link_macros.py');

/**
 * check_link_macros.py walks passages/ and flags any [[Text|target]] /
 * [[Text->target]] / [[target<-Text]] wikilink whose target *or* display
 * portion contains unevaluated <<...>> macro syntax.
 *
 *  - Targets render as raw passage names (e.g. "<<= _cName>>HuntEndAlone")
 *    because SugarCube doesn't evaluate macros in wikilink targets.
 *  - Display text is also unreliable in this codebase — raw "<<= ...>>"
 *    leaks through to the player. Use <<link>> macro form for either.
 */
test('check_link_macros.py finds no unevaluated macros in wikilinks', () => {
  const result = spawnSync('python3', [SCRIPT], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
  });
  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  expect(
    result.status,
    `check_link_macros.py exited ${result.status}\n` +
      `stdout:\n${stdout}\nstderr:\n${stderr}`,
  ).toBe(0);
  expect(stdout).toContain(
    'No unevaluated macros found in wikilink targets or display text.',
  );
});
