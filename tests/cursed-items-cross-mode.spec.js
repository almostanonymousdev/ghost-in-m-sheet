const { test, expect } = require('@playwright/test');
const { openGame, resetGame, callSetup, getVar, setVar } = require('./helpers');

/* The tarot deck and the monkey paw share a carry-state + wish/draw
   mechanism inside a hunt. Both pickup paths land on the same
   $tarotCardsStage / $MonkeyPawStage flags, and the hunt lifecycle
   folds in setup.HauntedHouses.resetCursedItemState at start/end so
   leftovers from a prior run never bleed into the next one. These
   tests pin the contract so future callers don't reintroduce ad-hoc
   forks at the call site. */
test.describe('Cursed-item hunt facade', () => {
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

  // --- HuntController.snapGhostToCurrentRoom ---

  test('snapGhostToCurrentRoom pins floorplan.spawnRoomId to currentRoomId', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1 }));
    const fp = await getVar(page, 'run').then(r => r.floorplan);
    const nonHallway = fp.rooms.find(r => r.template !== 'hallway');
    expect(nonHallway).toBeDefined();
    // Move the player to a non-hallway, non-spawn room and snap.
    await page.evaluate(id => SugarCube.setup.HuntController.setCurrentRoom(id), nonHallway.id);
    await page.evaluate(() => SugarCube.setup.HuntController.snapGhostToCurrentRoom());

    const newSpawn = await page.evaluate(
      () => SugarCube.State.variables.run.floorplan.spawnRoomId
    );
    expect(newSpawn).toBe(nonHallway.id);
  });

  test('snapGhostToCurrentRoom outside any hunt is a no-op', async () => {
    expect(await callSetup(page, 'setup.HuntController.snapGhostToCurrentRoom()')).toBe(false);
  });

  // --- HuntController.trapGhost / isGhostTrapped ---

  test('trapGhost stamps run.trapped + run.exitLock', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1 }));
    await page.evaluate(() => SugarCube.setup.HuntController.trapGhost('dawn'));

    const run = await getVar(page, 'run');
    expect(run.trapped).toBe(true);
    expect(run.exitLock).toEqual({ unlockBy: 'dawn' });
    expect(await callSetup(page, 'setup.HuntController.isGhostTrapped()')).toBe(true);
  });

  test('driftGhostRoom respects run.trapped and stops the shuffle', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 42 }));
    const before = await page.evaluate(
      () => SugarCube.State.variables.run.floorplan.spawnRoomId
    );
    await page.evaluate(() => SugarCube.setup.HuntController.trapGhost('cursedItem'));
    // Force a drift roll: with run.trapped=true the helper bails before
    // touching spawnRoomId regardless of randomness.
    await page.evaluate(() => SugarCube.setup.HuntController.driftGhostRoom());
    const after = await page.evaluate(
      () => SugarCube.State.variables.run.floorplan.spawnRoomId
    );
    expect(after).toBe(before);
  });

  // --- HuntController.streetExitPassage ---

  test('streetExitPassage stamps abandon failure + HuntSummary', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1 }));
    expect(await callSetup(page, 'setup.HuntController.streetExitPassage()'))
      .toBe('HuntSummary');
    expect(await callSetup(page, 'setup.HuntController.field("outcome")')).toBe('failure');
    expect(await callSetup(page, 'setup.HuntController.field("failureReason")')).toBe('abandon');
  });

  // --- HuntController.possessionPassage ---

  test('possessionPassage routes to CityMapPossessed and stamps a possessed failure', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1 }));
    expect(await callSetup(page, 'setup.HuntController.possessionPassage()'))
      .toBe('CityMapPossessed');
    /* endHunt cleared $run so isActive() flips false; the run is
       gone, but the meta-failure was recorded inside endHunt. */
    expect(await callSetup(page, 'setup.HuntController.isActive()')).toBe(false);
  });

  // --- HuntController.consumeKnowledgeEvidence ---

  test('consumeKnowledgeEvidence picks an evidence the hunt ghost lacks', async () => {
    await page.evaluate(() => {
      SugarCube.setup.HuntController.startHunt({ seed: 1 });
      // Pin the hunt ghost to Shade so the missing-evidence pool is known
      // (Shade has emf/gwb/temperature -> missing is spiritbox/uvl/glass).
      SugarCube.setup.HuntController.setField('ghostName', 'Shade');
      Math.random = () => 0;
    });
    await page.evaluate(() => SugarCube.setup.HuntController.consumeKnowledgeEvidence());

    expect(await getVar(page, 'knowledgeUsed')).toBe(1);
    const chosen = await getVar(page, 'chosenEvidence');
    expect(['spiritbox', 'uvl', 'glass']).toContain(chosen);
  });

  test('consumeKnowledgeEvidence is idempotent within a single hunt', async () => {
    await page.evaluate(() => {
      SugarCube.setup.HuntController.startHunt({ seed: 1 });
      SugarCube.setup.HuntController.setField('ghostName', 'Shade');
      Math.random = () => 0;
    });
    await page.evaluate(() => SugarCube.setup.HuntController.consumeKnowledgeEvidence());
    const first = await getVar(page, 'chosenEvidence');

    // Second call must not overwrite -- the wish/card is a one-shot.
    await page.evaluate(() => { Math.random = () => 0.5; });
    await page.evaluate(() => SugarCube.setup.HuntController.consumeKnowledgeEvidence());
    expect(await getVar(page, 'chosenEvidence')).toBe(first);
  });

  // --- HuntController.banActiveContext ---

  test('banActiveContext is a no-op (hunts are one-shot) (runs are one-shot)', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1 }));
    expect(await callSetup(page, 'setup.HuntController.banActiveContext()')).toBeNull();
  });

  // --- HuntController.isInsideHuntPassage (Bag gate) ---

  test('isInsideHuntPassage accepts HuntRun and rejects the city/lobby', async () => {
    /* Bag opens with previous(1) = whichever passage launched it.
       Force passage history to each candidate and assert the gate. */
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1 }));
    await page.evaluate(() => SugarCube.Engine.play('HuntRun'));
    await page.waitForFunction(() => SugarCube.State.passage === 'HuntRun');
    await page.evaluate(() => SugarCube.Engine.play('Bag'));
    await page.waitForFunction(() => SugarCube.State.passage === 'Bag');
    expect(await callSetup(page, 'setup.HuntController.isInsideHuntPassage()')).toBe(true);

    await page.evaluate(() => SugarCube.Engine.play('CityMap'));
    await page.waitForFunction(() => SugarCube.State.passage === 'CityMap');
    await page.evaluate(() => SugarCube.Engine.play('Bag'));
    await page.waitForFunction(() => SugarCube.State.passage === 'Bag');
    expect(await callSetup(page, 'setup.HuntController.isInsideHuntPassage()')).toBe(false);
  });

  // --- Lifecycle: hunt start/end fold in resetCursedItemState ---

  test('startHunt resets tarot stage + monkey paw wish count to fresh-hunt defaults', async () => {
    /* Pre-stamp dirty state from a prior session, then start a hunt
       run and verify the carry-stage globals come back clean. */
    await page.evaluate(() => {
      const V = SugarCube.State.variables;
      V.tarotCardsStage = SugarCube.setup.TarotStage.CARRYING;
      V.drawnCards = 4;
      V.MonkeyPawStage = SugarCube.setup.MonkeyPawStage.FOUND;
      V.wishesCount = 1;
      V.knowledgeUsed = 1;
      V.chosenEvidence = 'emf';
    });
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1 }));

    expect(await callSetup(page, 'setup.HauntedHouses.tarotCardsStage()'))
      .toBe(await callSetup(page, 'setup.TarotStage.HIDDEN'));
    expect(await getVar(page, 'drawnCards')).toBe(0);
    expect(await callSetup(page, 'setup.MonkeyPaw.isDiscoverable()')).toBe(true);
    expect(await callSetup(page, 'setup.MonkeyPaw.wishesLeft()')).toBe(3);
    expect(await getVar(page, 'knowledgeUsed')).toBeFalsy();
    expect(await getVar(page, 'chosenEvidence')).toBeUndefined();
  });

  test('endHunt resets shared state so the next run starts clean', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1 }));
    // Simulate the player picking up the deck + paw mid-run and using a wish.
    await page.evaluate(() => {
      SugarCube.setup.HauntedHouses.markTarotCarrying();
      SugarCube.setup.MonkeyPaw.markFound();
      SugarCube.setup.MonkeyPaw.removeWish();
    });
    expect(await callSetup(page, 'setup.MonkeyPaw.wishesLeft()')).toBe(2);

    await page.evaluate(() => SugarCube.setup.HuntController.endHunt(true));

    // Carry state is back to fresh defaults so the next hunt sees a
    // clean deck/paw rather than inheriting the prior run's leftovers.
    expect(await callSetup(page, 'setup.HauntedHouses.tarotCardsStage()'))
      .toBe(await callSetup(page, 'setup.TarotStage.HIDDEN'));
    expect(await callSetup(page, 'setup.MonkeyPaw.isDiscoverable()')).toBe(true);
    expect(await callSetup(page, 'setup.MonkeyPaw.wishesLeft()')).toBe(3);
  });

  // --- MonkeyPaw wish results route through HuntController ---

  test('dawn wish routes the goto through huntOverPassage("time") -> HuntSummary', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1 }));
    const out = await page.evaluate(
      () => SugarCube.setup.MonkeyPaw.activate('dawn')
    );
    expect(out.goto).toBe('HuntSummary');
    expect(await callSetup(page, 'setup.HuntController.field("failureReason")')).toBe('time');
  });

  test('leave wish routes the goto through streetExitPassage -> HuntSummary', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1 }));
    const out = await page.evaluate(
      () => SugarCube.setup.MonkeyPaw.activate('leave')
    );
    expect(out.goto).toBe('HuntSummary');
    expect(await callSetup(page, 'setup.HuntController.field("failureReason")')).toBe('abandon');
  });

  test('trapTheGhost wish marks run.trapped + run.exitLock', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1 }));
    await page.evaluate(() => SugarCube.setup.MonkeyPaw.activate('trapTheGhost'));

    const run = await getVar(page, 'run');
    expect(run.trapped).toBe(true);
    expect(run.exitLock).toEqual({ unlockBy: 'cursedItem' });
  });

  test('knowledge wish stamps $chosenEvidence and burns one wish', async () => {
    await page.evaluate(() => {
      SugarCube.setup.HuntController.startHunt({ seed: 1 });
      SugarCube.setup.HuntController.setField('ghostName', 'Shade');
      Math.random = () => 0;
    });
    const out = await page.evaluate(
      () => SugarCube.setup.MonkeyPaw.activate('knowledge')
    );
    expect(out.alreadyUsed).toBeFalsy();
    expect(await callSetup(page, 'setup.MonkeyPaw.wishesLeft()')).toBe(2);
    const chosen = await getVar(page, 'chosenEvidence');
    expect(['spiritbox', 'uvl', 'glass']).toContain(chosen);
  });

  // --- Tarot draw widgets pull state through HuntController ---

  test('tarot Possession card target routes via HuntController.possessionPassage', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1 }));
    expect(await callSetup(page, 'setup.HuntController.possessionPassage()'))
      .toBe('CityMapPossessed');
  });

  test('tarot Oblivion card target routes via HuntController.huntOverPassage("sanity")', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1 }));
    expect(await callSetup(page, 'setup.HuntController.huntOverPassage("sanity")'))
      .toBe('HuntSummary');
  });
});
