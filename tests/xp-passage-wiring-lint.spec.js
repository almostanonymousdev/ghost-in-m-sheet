const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

/* Three XP grants live inline in passage OnClicks / widget bodies
   instead of in controller methods (the action is one-shot, the
   controller side has no natural seam, and inlining keeps the grant
   visible at the call site). Verify the source string still contains
   the grant -- a refactor that moves the inline grant out without
   re-wiring it elsewhere will silently drop XP from these flows
   without breaking any browser test. */

const repoRoot = path.resolve(__dirname, '..');

test.describe('XP passage wiring — inline setup.Mc.grantExp / <<gainXP>>', () => {
  test('widgetRescue.tw "Leave|Church" link grants 30 xp on rescue success', () => {
    const body = fs.readFileSync(
      path.join(repoRoot, 'passages/missing_women/widgetRescue.tw'), 'utf8');
    expect(body).toMatch(/markQuestSucceeded\(\);\s*setup\.Mc\.grantExp\(30\)/);
  });

  test('SummoningStart.tw "Back|Bedroom" link grants 50 xp on succubus deal', () => {
    const body = fs.readFileSync(
      path.join(repoRoot, 'passages/home/summoning/SummoningStart.tw'), 'utf8');
    expect(body).toMatch(/markSuccubusSummoned\(\);[\s\S]*?setup\.Mc\.grantExp\(50\)/);
  });

  test('LibraryTornPage.tw shows <<gainXP 5>> in the found branch', () => {
    const body = fs.readFileSync(
      path.join(repoRoot, 'passages/library/LibraryTornPage.tw'), 'utf8');
    expect(body).toMatch(/<<gainXP\s+5\s*>>/);
  });

  test('WebcamShowStart.tw renders <<gainXP _out.xp>>', () => {
    const body = fs.readFileSync(
      path.join(repoRoot, 'passages/home/pc/WebcamShowStart.tw'), 'utf8');
    expect(body).toMatch(/<<gainXP\s+_out\.xp\s*>>/);
  });
});
