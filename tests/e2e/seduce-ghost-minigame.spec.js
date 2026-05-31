const { test, expect } = require('../fixtures');
const { setVar, getVar, callSetup, goToPassage } = require('../helpers');
const { setupHunt } = require('./e2e-helpers');

/*
 * The seduce/weaken-ghost minigame's live entry point is the
 * "Seduce the ghost" branch in GhostProwlEvent. Before this branch
 * existed the minigame passage (SeduceGhostMinigame) had no inbound
 * link and setup.SeduceGhostMinigame.init() was never called, so the
 * whole subsystem was unreachable in play. These specs pin the wiring:
 *
 *   1. the gate predicate (setup.Witch.canWeakenGhostInHunt)
 *   2. the option only renders once Khadija has set a weaken job AND
 *      the MC has energy to spend
 *   3. taking it calls init(), which resets BOTH arousal meters (so the
 *      minigame never inherits a carried-over orgasmMeter)
 *   4. winning (ghost arousal >= 100) routes back to $return and bumps
 *      the lifetime weaken tally the ectoplasm quest reads
 */
test.describe('Seduce-ghost minigame — prowl-event trigger', () => {

  test('canWeakenGhostInHunt opens on either the weaken or ectoplasm job', async ({ game: page }) => {
    // Fresh game: no job set, ability locked.
    expect(await callSetup(page, 'setup.Witch.canWeakenGhostInHunt()')).toBe(false);

    // Flat "Weaken the Ghost" side task unlocks it.
    await page.evaluate(() => SugarCube.setup.Witch.markWeakenQuestStarted());
    expect(await callSetup(page, 'setup.Witch.canWeakenGhostInHunt()')).toBe(true);

    // The ectoplasm quest path unlocks it too (a player can take that
    // quest without the flat task, and it asks for weaken-minigame wins).
    await page.evaluate(() => {
      delete SugarCube.State.variables.weakenTheGhostQuest;
      SugarCube.State.variables.mc.lvl = 5;
      SugarCube.setup.Witch.offerEctoplasmQuest();
    });
    expect(await callSetup(page, 'setup.Witch.hasWeakenTheGhostQuest()')).toBe(false);
    expect(await callSetup(page, 'setup.Witch.canWeakenGhostInHunt()')).toBe(true);

    // Stays open after the ectoplasm quest completes (ability not revoked).
    await page.evaluate(() => SugarCube.setup.Witch.completeEctoplasmQuest());
    expect(await callSetup(page, 'setup.Witch.canWeakenGhostInHunt()')).toBe(true);
  });

  test('GhostProwlEvent shows "Seduce the ghost" only when the job is set and energy remains', async ({ game: page }) => {
    await setupHunt(page, 'Spirit');
    await setVar(page, 'mc.energy', 10);

    const seduceLink = () =>
      page.locator('.passage').getByText('Seduce the ghost', { exact: true });

    // No job yet -> branch hidden.
    await goToPassage(page, 'GhostProwlEvent');
    await expect(seduceLink()).toHaveCount(0);

    // Job set, energy present -> branch shows.
    await page.evaluate(() => SugarCube.setup.Witch.markWeakenQuestStarted());
    await goToPassage(page, 'GhostProwlEvent');
    await expect(seduceLink()).toHaveCount(1);

    // Job set but out of energy -> branch hidden (no dead-end into a
    // minigame the MC can't act in).
    await setVar(page, 'mc.energy', 0);
    await goToPassage(page, 'GhostProwlEvent');
    await expect(seduceLink()).toHaveCount(0);
  });

  test('taking the branch inits the minigame and clears any carried-over arousal', async ({ game: page }) => {
    await setupHunt(page, 'Spirit');
    await setVar(page, 'mc.energy', 10);
    await page.evaluate(() => SugarCube.setup.Witch.markWeakenQuestStarted());

    // Stamp stale arousal from a prior scene; init() must wipe both.
    await page.evaluate(() => {
      SugarCube.State.variables.ghostOrgasmMeter = 60;
      SugarCube.setup.Mc.setOrgasmMeter(45);
    });

    await goToPassage(page, 'GhostProwlEvent');
    await page.locator('.passage').getByText('Seduce the ghost', { exact: true }).first().click();
    await page.waitForFunction(() => SugarCube.State.passage === 'SeduceGhostMinigame');

    expect(await callSetup(page, 'setup.SeduceGhostMinigame.minigameVideo()')).toBe('start');
    expect(await getVar(page, 'ghostOrgasmMeter')).toBe(0);
    expect(await callSetup(page, 'setup.Mc.orgasmMeter()')).toBe(0);
  });

  test('winning the minigame returns to $return and bumps the lifetime weaken tally', async ({ game: page }) => {
    await setupHunt(page, 'Spirit');
    await setVar(page, 'mc.energy', 10);
    await page.evaluate(() => SugarCube.setup.Witch.markWeakenQuestStarted());
    await setVar(page, 'return', 'HuntRun');

    const before = await callSetup(page, 'setup.Witch.ectoplasmWeakenCount()');

    // Drive the ghost meter to the win threshold and re-render the
    // minigame so its win branch (Continue investigating) is offered.
    await page.evaluate(() => { SugarCube.State.variables.ghostOrgasmMeter = 100; });
    await page.evaluate(() => { SugarCube.State.variables.minigameVideo = 'start'; });
    await goToPassage(page, 'SeduceGhostMinigame');

    const winLink = page.locator('.passage').getByText('Continue investigating', { exact: true });
    await expect(winLink).toHaveCount(1);
    await winLink.first().click();
    await page.waitForFunction(() => SugarCube.State.passage === 'HuntRun');

    expect(await callSetup(page, 'setup.Witch.ectoplasmWeakenCount()')).toBe(before + 1);
    expect(await callSetup(page, 'setup.Witch.isGhostWeakened()')).toBe(true);
  });
});
