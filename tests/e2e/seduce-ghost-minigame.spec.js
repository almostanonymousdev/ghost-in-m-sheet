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

/*
 * Win/lose routing. The minigame is a race between two arousal meters:
 * the ghost's (>=100 => the MC wins, weakens the ghost, returns) and the
 * MC's own (>=100 => she passes out => HuntOverProwl). Both continueSeduce
 * and submit raise BOTH meters in a single action -- and the MC's climbs
 * faster (random(4,8) vs random(2,6)) -- so a turn that crosses both
 * thresholds at once is a realistic endgame state, not a corner case.
 * A defeat (passing out) must win that tie: you can't claim the ghost as
 * weakened in the same breath you black out. These specs pin the routing.
 */
test.describe('Seduce-ghost minigame — win/lose routing', () => {

  // Park the player on the resolution branch with the given meter pair and
  // render the minigame so whichever outcome link applies is offered.
  async function renderResolution(page, ghostMeter, mcMeter) {
    await setupHunt(page, 'Spirit');
    await setVar(page, 'mc.energy', 10);
    await page.evaluate(() => SugarCube.setup.Witch.markWeakenQuestStarted());
    await setVar(page, 'return', 'HuntRun');
    await page.evaluate(({ ghostMeter, mcMeter }) => {
      SugarCube.State.variables.ghostOrgasmMeter = ghostMeter;
      SugarCube.setup.Mc.setOrgasmMeter(mcMeter);
      SugarCube.State.variables.minigameVideo = 'start';
    }, { ghostMeter, mcMeter });
    await goToPassage(page, 'SeduceGhostMinigame');
  }

  test('the MC maxing her own arousal routes to passing out, not a win', async ({ game: page }) => {
    await renderResolution(page, 40, 100); // ghost not weakened, MC spent
    const passage = page.locator('.passage');
    await expect(passage.getByText('passing out', { exact: false })).toHaveCount(1);
    await expect(passage.getByText('Continue investigating', { exact: true })).toHaveCount(0);

    const before = await callSetup(page, 'setup.Witch.ectoplasmWeakenCount()');
    await passage.getByText('passing out', { exact: false }).first().click();
    await page.waitForFunction(() => SugarCube.State.passage === 'HuntOverProwl');
    // Passing out is a defeat -- no weaken credit, ghost not marked weakened.
    expect(await callSetup(page, 'setup.Witch.ectoplasmWeakenCount()')).toBe(before);
    expect(await callSetup(page, 'setup.Witch.isGhostWeakened()')).toBe(false);
  });

  test('both meters maxing at once is a defeat -- passing out wins the tie', async ({ game: page }) => {
    const before = await callSetup(page, 'setup.Witch.ectoplasmWeakenCount()');
    await renderResolution(page, 100, 100); // simultaneous cross
    const passage = page.locator('.passage');

    // Defeat takes precedence: she passes out, she does NOT collect the win.
    await expect(passage.getByText('passing out', { exact: false })).toHaveCount(1);
    await expect(passage.getByText('Continue investigating', { exact: true })).toHaveCount(0);

    await passage.getByText('passing out', { exact: false }).first().click();
    await page.waitForFunction(() => SugarCube.State.passage === 'HuntOverProwl');
    expect(await callSetup(page, 'setup.Witch.ectoplasmWeakenCount()')).toBe(before);
    expect(await callSetup(page, 'setup.Witch.isGhostWeakened()')).toBe(false);
  });

  test('ghost maxed while the MC is safe still routes to the win', async ({ game: page }) => {
    await renderResolution(page, 100, 40); // ghost weakened, MC safe
    const passage = page.locator('.passage');
    await expect(passage.getByText('Continue investigating', { exact: true })).toHaveCount(1);
    await expect(passage.getByText('passing out', { exact: false })).toHaveCount(0);
  });
});

/*
 * Energy is the minigame's pacing resource: the widget gates every
 * effortful move behind energy >= 1 (energyGate / resistCostsEnergy),
 * but the actual energy mutations live in the controller actions. They
 * were dropped when the inline minigame widget was extracted into the
 * controller, which left the gate decorative and the minigame costless
 * (grindable forever). These specs pin the economy back down so a
 * future extraction can't silently drop it again.
 */
test.describe('Seduce-ghost minigame — energy economy', () => {

  // Park the minigame in a given state with clean meters, then run an
  // action and report the energy delta.
  async function energyDeltaFor(page, state, action, startEnergy) {
    return page.evaluate(({ state, action, startEnergy }) => {
      const M = SugarCube.setup.SeduceGhostMinigame;
      SugarCube.State.variables.minigameVideo = state;
      SugarCube.State.variables.ghostOrgasmMeter = 0;
      SugarCube.setup.Mc.setOrgasmMeter(0);
      SugarCube.setup.Mc.setEnergy(startEnergy);
      const before = SugarCube.setup.Mc.energy();
      M[action]();
      return SugarCube.setup.Mc.energy() - before;
    }, { state, action, startEnergy });
  }

  test('effortful moves each cost one action of energy', async ({ game: page }) => {
    const cost = await callSetup(page, 'setup.SeduceGhostMinigame.actionEnergyCost()');
    expect(cost).toBeCloseTo(1, 5); // pin the tuning value the widget gate reads
    const cases = [
      ['start',        'tryAttract'],
      ['seduceFailed', 'tryAgain'],
      ['slapface',     'resist'],   // non-free resist state
      ['slapface',     'subdue'],
    ];
    for (const [state, action] of cases) {
      const delta = await energyDeltaFor(page, state, action, 5);
      expect(delta, `${action} from ${state}`).toBeCloseTo(-cost, 5);
    }
  });

  test('leaning in (continue / submit) trickles energy back', async ({ game: page }) => {
    expect(await energyDeltaFor(page, 'seduce', 'continueSeduce', 5)).toBeCloseTo(0.2, 5);
    expect(await energyDeltaFor(page, 'slapface', 'submit', 5)).toBeCloseTo(0.2, 5);
  });

  test('resisting a subdued hold is free (FREE_RESIST states)', async ({ game: page }) => {
    for (const state of ['subdueslapface', 'subduetitjob', 'subdueassjob']) {
      expect(await callSetup(page, `setup.SeduceGhostMinigame.resistCostsEnergy('${state}')`)).toBe(false);
      expect(await energyDeltaFor(page, state, 'resist', 5), `resist from ${state}`).toBeCloseTo(0, 5);
    }
  });

  test('energy never drops below zero or climbs past the cap', async ({ game: page }) => {
    // A resist with almost no energy clamps at 0, not negative.
    const floored = await energyDeltaFor(page, 'slapface', 'resist', 0.5);
    expect(floored).toBeCloseTo(-0.5, 5); // 0.5 - 1 -> clamped to 0
    expect(await getVar(page, 'mc.energy')).toBe(0);

    // Submitting at the cap stays at the cap.
    await page.evaluate(() => {
      SugarCube.State.variables.minigameVideo = 'slapface';
      SugarCube.State.variables.ghostOrgasmMeter = 0;
      SugarCube.setup.Mc.setOrgasmMeter(0);
      SugarCube.setup.Mc.setEnergy(SugarCube.State.variables.mc.energyMax);
      SugarCube.setup.SeduceGhostMinigame.submit();
    });
    expect(await getVar(page, 'mc.energy')).toBe(await getVar(page, 'mc.energyMax'));
  });
});
