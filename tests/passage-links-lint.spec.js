const { test, expect } = require('@playwright/test');
const { spawnSync } = require('child_process');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(REPO_ROOT, 'check_links.py');

/**
 * check_links.py walks passages/ for every `::` header and every link
 * (`[[...]]`, `<<link>>`, `<<goto>>`, `<<include>>`, `Engine.play`) and
 * fails if a link points at a passage name that does not exist or if a
 * passage name is defined twice. This test just runs the script so a
 * rename / deleted passage / typo shows up in CI.
 */
test('check_links.py finds no broken links or duplicate passages', () => {
  const result = spawnSync('python3', [SCRIPT], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
  });
  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  expect(
    result.status,
    `check_links.py exited ${result.status}\n` +
      `stdout:\n${stdout}\nstderr:\n${stderr}`,
  ).toBe(0);
  expect(stdout).toContain('No broken links or duplicate passages found.');
});
