const { test, expect } = require('@playwright/test');
const { spawnSync } = require('child_process');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(REPO_ROOT, 'tools', 'check_reachability.py');

/**
 * check_reachability.py walks every passage and flags any that can be
 * navigated to but has no way out — no link, no goto, no include, no
 * widget call, no form/click/timed interaction. This is the static
 * complement to the random-walk fuzzer: cheaper, runs before CI spins
 * up a browser, and catches softlock traps the moment they're committed.
 *
 * Widget-tagged passages, script/stylesheet blobs, SugarCube specials,
 * and include-only fragments are excluded — they are templating, not
 * navigable destinations.
 */
test('check_reachability.py finds no dead-end passages', () => {
  const result = spawnSync('python3', [SCRIPT], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
  });
  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  expect(
    result.status,
    `check_reachability.py exited ${result.status}\n` +
      `stdout:\n${stdout}\nstderr:\n${stderr}`,
  ).toBe(0);
  expect(stdout).toContain('No dead-end passages found.');
});
