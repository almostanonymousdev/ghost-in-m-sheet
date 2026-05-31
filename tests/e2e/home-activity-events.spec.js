const { test, expect } = require('../fixtures');
const { setVar, getVar, callSetup, goToPassage } = require('../helpers');
const { expectCleanPassage } = require('./e2e-helpers');

/*
 * Class regression: "activity link does nothing but burn time."
 *
 * The home activity links (Livingroom "Watch tv", Bedroom "Take a nap")
 * advance the clock and then route to one of several ambient events when
 * a readiness predicate is true. The bug: <<addTime>> ran BEFORE the
 * readiness checks, so the action's own time cost could push the clock
 * out of the event's window -- or across midnight, where <<addTime>>
 * fires setup.Tick.resetCooldowns() -- making a predicate that was true
 * at click-time read false a moment later. The <<if>> chain then matched
 * nothing and the link silently reloaded the room. Symptom reported in
 * play: "I clicked 'watch tv' and nothing happened -- only 30m passed."
 *
 * The fix evaluates readiness on the pre-action clock (capture the
 * destination, THEN advance time, THEN goto), so an event ready when the
 * player clicks always fires regardless of how much time the action costs.
 *
 * These tests force each readiness predicate true and assert the click
 * lands on the event passage rather than back on the activity hub. The
 * boundary cases (clock near a window edge / near midnight) are the ones
 * that actually failed before the fix; the benign-time cases lock the
 * contract for predicates that aren't time-gated today but share the
 * advance-then-check anti-pattern.
 */

/* Click an activity link by visible text and report where it lands.
   waitForFunction is best-effort: on the buggy path the goto never
   fires, the link reloads its own hub, and we fall through to read the
   (unchanged) passage so the assertion gets a clear actual value. */
async function clickActivity(page, linkText, expectedPassage) {
  await page.locator('.passage').getByText(linkText).first().click();
  await page
    .waitForFunction((ev) => SugarCube.State.passage === ev, expectedPassage, { timeout: 4000 })
    .catch(() => {});
  return page.evaluate(() => SugarCube.State.passage);
}

test.describe('Home activity links fire their event regardless of the action time cost', () => {
  test.describe.configure({ timeout: 20_000 });

  test('REGRESSION: Watch TV fires the succubus event even when +30m crosses midnight (23:50)', async ({ game: page }) => {
    // succubusTVEventReady is gated to 18:00-23:59. At 23:50 it is ready,
    // but the old code advanced the clock to 00:20 (crossing midnight,
    // resetting daily cooldowns) before testing isBetween(18,23) -- which
    // then read false, so the event was dropped and only 30m elapsed.
    await setVar(page, 'succubus', 1);
    await page.evaluate(() => { SugarCube.State.variables.succubusEvent = { eventCD: 0 }; });
    await setVar(page, 'hours', 23);
    await setVar(page, 'minutes', 50);

    expect(await callSetup(page, 'setup.Home.succubusTVEventReady()')).toBe(true);

    await goToPassage(page, 'Livingroom');
    const landed = await clickActivity(page, /Watch tv/i, 'SuccubusEventTV');
    expect(landed).toBe('SuccubusEventTV');
    await expectCleanPassage(page);
  });

  test('Watch TV still fires the succubus event well inside the window (19:00 control)', async ({ game: page }) => {
    await setVar(page, 'succubus', 1);
    await page.evaluate(() => { SugarCube.State.variables.succubusEvent = { eventCD: 0 }; });
    await setVar(page, 'hours', 19);
    await setVar(page, 'minutes', 0);

    await goToPassage(page, 'Livingroom');
    const landed = await clickActivity(page, /Watch tv/i, 'SuccubusEventTV');
    expect(landed).toBe('SuccubusEventTV');
  });

  test('Watch TV routes to the cursed TV event (curse takes precedence, not time-gated)', async ({ game: page }) => {
    await setVar(page, 'cursedHomeItem', 'tv');
    await setVar(page, 'cursedHomeItemActive', true);
    // Park the clock at the same midnight boundary to prove the curse
    // branch is immune to the time advance too.
    await setVar(page, 'hours', 23);
    await setVar(page, 'minutes', 50);

    await goToPassage(page, 'Livingroom');
    const landed = await clickActivity(page, /Watch tv/i, 'CursedTVEvent');
    expect(landed).toBe('CursedTVEvent');
  });

  test('Watch TV with no event ready simply reloads the Livingroom (only time passes)', async ({ game: page }) => {
    // The legitimate no-event path: nothing armed, so the link is allowed
    // to burn 30m and return. This guards against a fix that over-fires.
    await page.evaluate(() => { delete SugarCube.State.variables.succubus; });
    await setVar(page, 'cursedHomeItemActive', false);
    await setVar(page, 'cursedHomeItem', '');
    await page.evaluate(() => { SugarCube.State.variables.ghostSpiritEventStage = 1; });
    await page.evaluate(() => { SugarCube.State.variables.gotCursedItem = 0; });
    await setVar(page, 'hours', 14);
    await setVar(page, 'minutes', 0);

    await goToPassage(page, 'Livingroom');
    const before = await getVar(page, 'minutes');
    const landed = await clickActivity(page, /Watch tv/i, 'SuccubusEventTV');
    expect(landed).toBe('Livingroom');
    // Time still advanced 30m: 14:00 -> 14:30.
    expect(await getVar(page, 'hours')).toBe(14);
    expect(await getVar(page, 'minutes')).toBe(30);
    expect(before).toBe(0);
  });

  test('Take a nap fires the spirit nap event when armed (guard for the same anti-pattern)', async ({ game: page }) => {
    // Nap predicates are not time-of-day gated today, so this passes
    // before and after the fix -- it locks the contract that arming the
    // event makes the nap link route to it rather than silently nap.
    await page.evaluate(() => { SugarCube.State.variables.ghostSpiritEventStage = 0; });
    await callSetup(page, 'setup.Cooldowns.resetDaily()');
    expect(await callSetup(page, 'setup.SpecialEvent.spiritEventReady()')).toBe(true);

    await goToPassage(page, 'Bedroom');
    const napVisible = await page.locator('.passage').getByText(/Take a nap/i).count();
    expect(napVisible).toBeGreaterThan(0);
    const landed = await clickActivity(page, /Take a nap/i, 'GhostSpecialEventNapSpirit');
    expect(landed).toBe('GhostSpecialEventNapSpirit');
  });

  test('Take a nap fires the tentacles nap event when armed', async ({ game: page }) => {
    // spirit OFF (stage != 0) so the tentacles branch is reached;
    // tentaclesNapEventReady = gotCursedItem === 1 && gotCursedItemEventCD >= 2.
    await page.evaluate(() => { SugarCube.State.variables.ghostSpiritEventStage = 1; });
    await setVar(page, 'gotCursedItem', 1);
    await setVar(page, 'gotCursedItemEventCD', 2);
    expect(await callSetup(page, 'setup.Home.tentaclesNapEventReady()')).toBe(true);

    await goToPassage(page, 'Bedroom');
    const napVisible = await page.locator('.passage').getByText(/Take a nap/i).count();
    expect(napVisible).toBeGreaterThan(0);
    const landed = await clickActivity(page, /Take a nap/i, 'TentaclesEventNap');
    expect(landed).toBe('TentaclesEventNap');
  });
});
