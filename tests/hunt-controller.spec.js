const { test, expect } = require('@playwright/test');
const { openGame, resetGame, callSetup, goToPassage } = require('./helpers');

/* setup.HuntController is the cross-mode facade that the regular
   witch-contract flow ($hunt) and the rogue-run flow ($run) both
   plug into. Public surface:
     - mode()                  'regular' | 'rogue' | null
     - isActive()              true iff mode() !== null
     - activeGhost()            Ghost instance or null
     - isGhostHere()            bool, mode-aware
     - isHuntActive()           per-tick chain gate
     - isCursedHuntActive()     classic-only sub-flow gate
     - shouldStartRandomHunt()  CheckHuntStart gate
     - shouldTriggerSteal()     StealClothesEvent gate
     - huntOverPassage(reason)  routes sanity / exhaustion / time
                                runouts to the mode-appropriate
                                end-of-hunt passage
   These tests pin the contract so a future caller can rely on the
   facade rather than checking $hunt / $run by hand. */
test.describe('HuntController', () => {
  let page;

  test.beforeAll(async ({ browser }) => {
    page = await openGame(browser);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test.beforeEach(async () => {
    await resetGame(page);
  });

  test('mode() returns null when neither a hunt nor a rogue run is active', async () => {
    expect(await callSetup(page, 'setup.HuntController.mode()')).toBeNull();
    expect(await callSetup(page, 'setup.HuntController.isActive()')).toBe(false);
    expect(await callSetup(page, 'setup.HuntController.activeGhost()')).toBeNull();
    expect(await callSetup(page, 'setup.HuntController.isGhostHere()')).toBe(false);
  });

  test('mode() returns "regular" while a witch contract is open', async () => {
    await page.evaluate(() => SugarCube.setup.Ghosts.startHunt('Shade'));
    expect(await callSetup(page, 'setup.HuntController.mode()')).toBe('regular');
    expect(await callSetup(page, 'setup.HuntController.isActive()')).toBe(true);

    // The classic active() path should still resolve through the facade.
    const activeName = await callSetup(page, 'setup.HuntController.activeGhost().name');
    expect(activeName).toBe('Shade');

    // setup.Ghosts.active() is the legacy alias and must agree.
    const aliasName = await callSetup(page, 'setup.Ghosts.active().name');
    expect(aliasName).toBe('Shade');
  });

  test('mode() returns "rogue" once a rogue run is rolled', async () => {
    await goToPassage(page, 'GhostStreet');
    await page.locator('.passage')
      .getByText('Rogue Haunt', { exact: true })
      .first()
      .click();
    await page.waitForFunction(() => SugarCube.State.passage === 'RogueStart');

    expect(await callSetup(page, 'setup.HuntController.mode()')).toBe('rogue');
    expect(await callSetup(page, 'setup.HuntController.isActive()')).toBe(true);

    // Rogue mode resolves to the rogue ghost from the catalogue.
    const rogueGhostName = await callSetup(page, 'setup.Rogue.ghostName()');
    expect(rogueGhostName).toBeTruthy();
    expect(await callSetup(page, 'setup.HuntController.activeGhost().name')).toBe(rogueGhostName);
    expect(await callSetup(page, 'setup.Ghosts.active().name')).toBe(rogueGhostName);
  });

  test('regular mode wins when both $hunt and $run somehow co-exist', async () => {
    /* Defensive: a corrupted save could carry both. The witch flow has
       priority because that's where evidence-pruning and DeleteEvidence
       state live; rogue runs only ever read from the catalogue. */
    await goToPassage(page, 'GhostStreet');
    await page.locator('.passage')
      .getByText('Rogue Haunt', { exact: true })
      .first()
      .click();
    await page.waitForFunction(() => SugarCube.State.passage === 'RogueStart');
    await page.evaluate(() => SugarCube.setup.Ghosts.startHunt('Spirit'));

    expect(await callSetup(page, 'setup.HuntController.mode()')).toBe('regular');
    expect(await callSetup(page, 'setup.HuntController.activeGhost().name')).toBe('Spirit');
  });

  test('rogue wins when the player is physically on RogueRun (regression: stale $hunt blocking the clock)', async () => {
    /* Prior bug: a player who walked away from a witch hunt without
       formally ending the contract (so $hunt.name still populated,
       $hunt.mode POSSESSED) would start a rogue run, end up on
       RogueRun, and have mode() report "regular". isHuntActive
       then read setup.Ghosts.isHunting() (which gates on
       HuntMode.ACTIVE, not POSSESSED) and answered false, so the
       per-tick chain skipped applyTickEffects -- the clock and the
       stat drains never fired. Furniture searches still advanced
       because <<addTime 1>> doesn't go through the chain. */
    await page.evaluate(() => {
      SugarCube.setup.Ghosts.startHunt('Shade');
      SugarCube.setup.Ghosts.setHuntMode(SugarCube.setup.Ghosts.HuntMode.POSSESSED);
    });
    await goToPassage(page, 'GhostStreet');
    await page.locator('.passage').getByText('Rogue Haunt', { exact: true }).first().click();
    await page.waitForFunction(() => SugarCube.State.passage === 'RogueStart');
    await page.locator('.passage').getByText('Enter the haunt', { exact: true }).first().click();
    await page.waitForFunction(() => SugarCube.State.passage === 'RogueRun');

    // On RogueRun, even with stale $hunt.name still set, dispatch
    // is rogue and the per-tick gate is open.
    expect(await callSetup(page, 'setup.HuntController.mode()')).toBe('rogue');
    expect(await callSetup(page, 'setup.HuntController.isHuntActive()')).toBe(true);
    const rogueGhost = await callSetup(page, 'setup.Rogue.ghostName()');
    expect(await callSetup(page, 'setup.HuntController.activeGhost().name')).toBe(rogueGhost);

    // Off RogueRun, the prior tie-break still wins for $hunt.
    await goToPassage(page, 'CityMap');
    expect(await callSetup(page, 'setup.HuntController.mode()')).toBe('regular');
  });

  test('isHuntActive() reports the per-tick gate per mode', async () => {
    expect(await callSetup(page, 'setup.HuntController.isHuntActive()')).toBe(false);

    // Classic: $hunt object alone isn't enough; the player has to be
    // inside the haunted house (HuntMode.ACTIVE).
    await page.evaluate(() => SugarCube.setup.Ghosts.startHunt('Shade'));
    expect(await callSetup(page, 'setup.HuntController.isHuntActive()')).toBe(false);
    await page.evaluate(() =>
      SugarCube.setup.Ghosts.setHuntMode(SugarCube.setup.Ghosts.HuntMode.ACTIVE));
    expect(await callSetup(page, 'setup.HuntController.isHuntActive()')).toBe(true);
    await page.evaluate(() =>
      SugarCube.setup.Ghosts.setHuntMode(SugarCube.setup.Ghosts.HuntMode.POSSESSED));
    expect(await callSetup(page, 'setup.HuntController.isHuntActive()')).toBe(false);
  });

  test('isHuntActive() in rogue mode requires the player to be on RogueRun', async () => {
    await goToPassage(page, 'GhostStreet');
    await page.locator('.passage').getByText('Rogue Haunt', { exact: true }).first().click();
    await page.waitForFunction(() => SugarCube.State.passage === 'RogueStart');

    // Run is rolled but player is in the RogueStart lobby -- chain
    // shouldn't fire there.
    expect(await callSetup(page, 'setup.HuntController.isHuntActive()')).toBe(false);

    await page.locator('.passage').getByText('Enter the haunt', { exact: true }).first().click();
    await page.waitForFunction(() => SugarCube.State.passage === 'RogueRun');
    expect(await callSetup(page, 'setup.HuntController.isHuntActive()')).toBe(true);

    await goToPassage(page, 'CityMap');
    expect(await callSetup(page, 'setup.HuntController.isHuntActive()')).toBe(false);
  });

  test('huntOverPassage() picks the mode-aware over-state passage', async () => {
    expect(await callSetup(page, 'setup.HuntController.huntOverPassage("sanity")')).toBeNull();

    await page.evaluate(() => SugarCube.setup.Ghosts.startHunt('Shade'));
    expect(await callSetup(page, 'setup.HuntController.huntOverPassage("sanity")'))
      .toBe('HuntOverSanity');
    expect(await callSetup(page, 'setup.HuntController.huntOverPassage("exhaustion")'))
      .toBe('HuntOverExhaustion');
    expect(await callSetup(page, 'setup.HuntController.huntOverPassage("time")'))
      .toBe('HuntOverTime');

    // Switch to rogue: same call routes to RogueEnd and stamps the
    // run as a failure with the reason so RogueEnd can render the
    // matching mc-thoughts line.
    await page.evaluate(() => SugarCube.setup.Ghosts.endContract());
    await goToPassage(page, 'GhostStreet');
    await page.locator('.passage').getByText('Rogue Haunt', { exact: true }).first().click();
    await page.waitForFunction(() => SugarCube.State.passage === 'RogueStart');

    expect(await callSetup(page, 'setup.HuntController.huntOverPassage("sanity")'))
      .toBe('RogueEnd');
    expect(await callSetup(page, 'setup.Rogue.field("outcome")')).toBe('failure');
    expect(await callSetup(page, 'setup.Rogue.field("failureReason")')).toBe('sanity');

    expect(await callSetup(page, 'setup.HuntController.huntOverPassage("exhaustion")'))
      .toBe('RogueEnd');
    expect(await callSetup(page, 'setup.Rogue.field("failureReason")')).toBe('exhaustion');

    expect(await callSetup(page, 'setup.HuntController.huntOverPassage("time")'))
      .toBe('RogueEnd');
    expect(await callSetup(page, 'setup.Rogue.field("failureReason")')).toBe('time');
  });

  test('shouldTriggerSteal() opts ironclad out of the steal step', async () => {
    /* The steal predicate is a reusable wardrobe-state roll. Only the
       active classic house can opt out via runsStealClothes:false; rogue
       runs always answer with the predicate. */
    await page.evaluate(() => SugarCube.setup.Ghosts.startHunt('Shade'));
    await page.evaluate(() => SugarCube.setup.HauntedHouses.activate('owaissa'));
    await page.evaluate(() => { SugarCube.State.variables.stealChance = 100; });
    expect(await callSetup(page, 'setup.HuntController.shouldTriggerSteal()')).toBe(true);

    await page.evaluate(() => SugarCube.setup.HauntedHouses.activate('ironclad'));
    expect(await callSetup(page, 'setup.HuntController.shouldTriggerSteal()')).toBe(false);
  });

  test('isGhostHere() in rogue mode follows the lair-room comparison', async () => {
    await goToPassage(page, 'GhostStreet');
    await page.locator('.passage')
      .getByText('Rogue Haunt', { exact: true })
      .first()
      .click();
    await page.waitForFunction(() => SugarCube.State.passage === 'RogueStart');
    await page.locator('.passage')
      .getByText('Enter the haunt', { exact: true })
      .first()
      .click();
    await page.waitForFunction(() => SugarCube.State.passage === 'RogueRun');

    // Player starts in room_0 (hallway); lair is non-hallway.
    const lair = await callSetup(page, 'setup.Rogue.ghostRoomId()');
    expect(lair).not.toBe('room_0');
    expect(await callSetup(page, 'setup.HuntController.isGhostHere()')).toBe(false);

    // Walk into the lair, re-render RogueRun, expect true.
    await page.evaluate(id => SugarCube.setup.Rogue.setCurrentRoom(id), lair);
    await goToPassage(page, 'RogueRun');
    expect(await callSetup(page, 'setup.HuntController.isGhostHere()')).toBe(true);

    // Outside the RogueRun passage, isGhostHere() falls back to false
    // even when the player record says they're in the lair -- the
    // tool checks that read this only fire on RogueRun.
    await goToPassage(page, 'CityMap');
    expect(await callSetup(page, 'setup.HuntController.isGhostHere()')).toBe(false);
  });
});
