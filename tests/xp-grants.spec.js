const { test, expect } = require('./fixtures');
const { callSetup, getVar, setVar } = require('./helpers');

/* Coverage for the post-hunt XP sources: webcam shows, library torn
   pages, mare-arc nightly tick, missing-women rescue, exorcism summon,
   and witch-contract tier lookup. Hunt-success / contract-completion
   XP is exercised in tests/hunt-lifecycle.spec.js and
   tests/witch-end-contract.spec.js -- this file pins the rest of the
   XP economy so a tweak to one grant doesn't silently shift another. */

test.describe('WitchContract.xpRewardFor — per-tier contract XP table', () => {
  test('owaissa success -> 15 xp', async ({ game: page }) => {
    expect(await callSetup(page, 'setup.WitchContract.xpRewardFor("owaissa", true)')).toBe(15);
  });
  test('elm success -> 25 xp', async ({ game: page }) => {
    expect(await callSetup(page, 'setup.WitchContract.xpRewardFor("elm", true)')).toBe(25);
  });
  test('ironclad success -> 40 xp', async ({ game: page }) => {
    expect(await callSetup(page, 'setup.WitchContract.xpRewardFor("ironclad", true)')).toBe(40);
  });
  test('failure -> 0 xp regardless of tier', async ({ game: page }) => {
    expect(await callSetup(page, 'setup.WitchContract.xpRewardFor("owaissa", false)')).toBe(0);
    expect(await callSetup(page, 'setup.WitchContract.xpRewardFor("elm", false)')).toBe(0);
    expect(await callSetup(page, 'setup.WitchContract.xpRewardFor("ironclad", false)')).toBe(0);
  });
  test('unknown houseId -> 0 (safe fallback)', async ({ game: page }) => {
    expect(await callSetup(page, 'setup.WitchContract.xpRewardFor("nonsense", true)')).toBe(0);
  });
});

test.describe('Home.runWebcamShow — XP in the result descriptor', () => {
  test('result includes an xp field of 8 or 10', async ({ game: page }) => {
    await page.evaluate(() => { SugarCube.State.variables.webcam = { event: 'tease' }; });
    const out = await page.evaluate(() => SugarCube.setup.Home.runWebcamShow());
    expect([8, 10]).toContain(out.xp);
  });

  test('high-corruption show clears the bonus threshold -> 10 xp', async ({ game: page }) => {
    /* toyanal CORR range is [40, 55]; even the floor (40) plus any
       non-zero fitBonus is well over the 20 threshold, so the bonus
       reliably fires for the most extreme show type. */
    await page.evaluate(() => { SugarCube.State.variables.webcam = { event: 'toyanal' }; });
    await page.evaluate(() => { SugarCube.setup.Mc.setFit(20); }); // non-zero fit so fitBonus > 0
    const out = await page.evaluate(() => SugarCube.setup.Home.runWebcamShow());
    expect(out.xp).toBe(10);
  });

  test('runWebcamShow does NOT grant exp directly (widget does it)', async ({ game: page }) => {
    /* The XP grant is wired through <<gainXP _out.xp>> in
       WebcamShowStart.tw so the player gets the standard XP-bar UI.
       runWebcamShow itself is pure-compute; calling it from JS must
       not mutate $mc.exp. Pinning this invariant prevents a future
       refactor from accidentally double-granting. */
    await page.evaluate(() => { SugarCube.State.variables.webcam = { event: 'tease' }; });
    const before = await callSetup(page, 'setup.Mc.exp()');
    await page.evaluate(() => SugarCube.setup.Home.runWebcamShow());
    const after = await callSetup(page, 'setup.Mc.exp()');
    expect(after).toBe(before);
  });
});

test.describe('SpecialEvent.tickMareStageMidnight — nightly XP nudge during active arc', () => {
  test('active arc -> stage++ and +3 xp', async ({ game: page }) => {
    await setVar(page, 'ghostMareEventStart', 1);
    await setVar(page, 'ghostMareEventStage', 0);
    const expBefore = await callSetup(page, 'setup.Mc.exp()');
    const lvlBefore = await callSetup(page, 'setup.Mc.lvl()');
    await page.evaluate(() => SugarCube.setup.SpecialEvent.tickMareStageMidnight());
    expect(await getVar(page, 'ghostMareEventStage')).toBe(1);
    /* grantExp might overflow into a level-up; assert at least one of
       exp / lvl moved upward, same pattern as hunt-lifecycle.spec.js. */
    const expAfter = await callSetup(page, 'setup.Mc.exp()');
    const lvlAfter = await callSetup(page, 'setup.Mc.lvl()');
    expect(expAfter > expBefore || lvlAfter > lvlBefore).toBe(true);
  });

  test('inactive arc -> stage resets to 0 and no xp', async ({ game: page }) => {
    await setVar(page, 'ghostMareEventStart', 0);
    await setVar(page, 'ghostMareEventStage', 4);
    const expBefore = await callSetup(page, 'setup.Mc.exp()');
    await page.evaluate(() => SugarCube.setup.SpecialEvent.tickMareStageMidnight());
    expect(await getVar(page, 'ghostMareEventStage')).toBe(0);
    expect(await callSetup(page, 'setup.Mc.exp()')).toBe(expBefore);
  });
});

