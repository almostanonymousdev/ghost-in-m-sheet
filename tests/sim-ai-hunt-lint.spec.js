const { test, expect } = require('@playwright/test');
const { spawnSync } = require('child_process');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(REPO_ROOT, 'tools', 'sim_ai_hunt.py');

/**
 * sim_ai_hunt.py parses mechanics out of the live .tw source instead of
 * hard-coding them. This test runs the script's --validate-data mode so any
 * rename / restructure of the parsed bits (ghost config, TIER_CHANCE,
 * HauntConditions snapshot, CheckHuntStart, Hide/RunFast thresholds, etc.)
 * shows up as a failing test in CI before it silently desyncs the sim.
 */
test('sim_ai_hunt.py --validate-data finds all expected game data', () => {
  const result = spawnSync('python3', [SCRIPT, '--validate-data'], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
  });
  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  expect(
    result.status,
    `sim_ai_hunt.py --validate-data exited ${result.status}\n` +
      `stdout:\n${stdout}\nstderr:\n${stderr}`,
  ).toBe(0);
  expect(stdout).toContain('game-data validation OK');
});
