const { test, expect } = require('@playwright/test');
const { spawnSync } = require('child_process');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(REPO_ROOT, 'check_undefined_vars.py');

/**
 * check_undefined_vars.py walks every passage and flags any $story
 * variable that is read somewhere but never assigned anywhere in the
 * codebase. SugarCube renders undefined variables as empty strings
 * rather than erroring, so a typo like $corrutpion vs $corruption only
 * surfaces when a player walks down the right branch — exactly the
 * c443cf4-style "missing message in low corruption path" bug class.
 *
 * Definitions are collected from <<set $foo>>, <<unset $foo>>,
 * State.variables.foo / s.foo / V.foo assignments in [script]
 * passages, form-input macros (<<listbox "$foo">>, <<textbox>>, etc.),
 * and the forEach-with-literal-array pattern used by initState() to
 * seed per-room state.
 *
 * False-positive sources that ARE filtered: [script] passage bodies
 * (jQuery `$el` aliases), <<script>> blocks inside other passages,
 * /* ...  *\/ doc comments, and backtick-templated string fragments
 * inside macro arguments.
 */
test('check_undefined_vars.py finds no undefined story variables', () => {
  const result = spawnSync('python3', [SCRIPT], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
  });
  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  expect(
    result.status,
    `check_undefined_vars.py exited ${result.status}\n` +
      `stdout:\n${stdout}\nstderr:\n${stderr}`,
  ).toBe(0);
  expect(stdout).toContain('No undefined story variables found.');
});
