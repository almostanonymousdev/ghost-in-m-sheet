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

  test('streetExitPassage stamps abandon failure + routes to CityMap', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1 }));
    /* The helper now settles the run itself before returning a goto
       target, so the outcome lives on $meta (lastWasSuccess) rather
       than on $run. */
    expect(await callSetup(page, 'setup.HuntController.streetExitPassage()'))
      .toBe('CityMap');
    expect(await callSetup(page, 'setup.HuntController.isActive()')).toBe(false);
    expect(await getVar(page, 'meta').then(m => m.lastWasSuccess)).toBe(false);
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
      // cheatStartHunt stamps both ghostName and run.evidence from the
      // catalogue, so activeGhost() resolves to Shade's true evidence
      // (emf/gwb/temperature) rather than whatever the random startHunt
      // roll picked. Without this pin the missing-evidence pool depends
      // on a prior random ghost and the assertion below is flaky.
      SugarCube.setup.Ghosts.cheatStartHunt('Shade');
      Math.random = () => 0;
    });
    await page.evaluate(() => SugarCube.setup.HuntController.consumeKnowledgeEvidence());

    expect(await getVar(page, 'knowledgeUsed')).toBe(true);
    const chosen = await getVar(page, 'chosenEvidence');
    expect(['spiritbox', 'uvl', 'glass']).toContain(chosen);
  });

  test('consumeKnowledgeEvidence is idempotent within a single hunt', async () => {
    await page.evaluate(() => {
      SugarCube.setup.Ghosts.cheatStartHunt('Shade');
      Math.random = () => 0;
    });
    await page.evaluate(() => SugarCube.setup.HuntController.consumeKnowledgeEvidence());
    const first = await getVar(page, 'chosenEvidence');

    // Second call must not overwrite -- the wish/card is a one-shot.
    await page.evaluate(() => { Math.random = () => 0.5; });
    await page.evaluate(() => SugarCube.setup.HuntController.consumeKnowledgeEvidence());
    expect(await getVar(page, 'chosenEvidence')).toBe(first);
  });

  /* Mimic's catalogue evidence is [uvl, temperature, spiritbox] but
     setup.Ghosts.isMimicHunt() makes ectoplasm read positive too --
     so Knowledge crossing out ectoplasm during a Mimic hunt would
     lie to the player (their eyes see ectoplasm in the room while
     the diary says it's been ruled out). Knowledge must consult
     Ghost.hasEvidence(), not the raw catalogue array. */
  test('consumeKnowledgeEvidence never strikes ectoplasm during a Mimic hunt', async () => {
    await page.evaluate(() => {
      SugarCube.setup.Ghosts.cheatStartHunt('Mimic');
    });
    // Exhaustively roll the random index across the missing-pool size
    // so we catch the bug regardless of which slot glass occupies.
    for (let r = 0; r < 6; r++) {
      await page.evaluate((rv) => {
        SugarCube.setup.Ghosts.clearKnowledgeUsed();
        SugarCube.setup.Ghosts.clearChosenEvidence();
        Math.random = () => rv / 6 + 0.001;
      }, r);
      await page.evaluate(() => SugarCube.setup.HuntController.consumeKnowledgeEvidence());
      const chosen = await getVar(page, 'chosenEvidence');
      expect(chosen, `roll ${r} struck ectoplasm during a Mimic hunt`).not.toBe('glass');
    }
  });

  /* The function used to hardcode the evidence-id list as a literal,
     duplicating the setup.Ghosts.Evidence catalogue. Pin the contract:
     every chosen id must be a real Evidence enum id, regardless of
     which ghost is active. Catches the duplication drift the moment a
     new evidence type is added without updating the function. */
  test('consumeKnowledgeEvidence only picks ids from setup.Ghosts.Evidence', async () => {
    const validIds = await page.evaluate(() => {
      return Object.keys(SugarCube.setup.Ghosts.Evidence).map(
        (k) => SugarCube.setup.Ghosts.Evidence[k].id
      );
    });
    const ghostNames = await page.evaluate(() => SugarCube.setup.Ghosts.names());
    for (const name of ghostNames) {
      await page.evaluate((n) => {
        SugarCube.setup.Ghosts.cheatStartHunt(n);
        SugarCube.setup.Ghosts.clearKnowledgeUsed();
        SugarCube.setup.Ghosts.clearChosenEvidence();
        Math.random = () => 0;
      }, name);
      await page.evaluate(() => SugarCube.setup.HuntController.consumeKnowledgeEvidence());
      const chosen = await getVar(page, 'chosenEvidence');
      expect(validIds, `chose unknown evidence "${chosen}" for ${name}`).toContain(chosen);
    }
  });

  /* The wish/card promises "one entry struck from your diary". If no
     entry can be struck (a ghost with every evidence id), the wish
     should not burn -- otherwise the player loses the one-shot for
     zero effect. Currently impossible in production (every ghost has
     3/6 evidence) but the contract still has to hold for future
     modifiers / contracts that expand the active evidence pool. */
  test('consumeKnowledgeEvidence does not burn the wish when no evidence can be struck', async () => {
    await page.evaluate(() => {
      SugarCube.setup.Ghosts.cheatStartHunt('Shade');
      SugarCube.setup.Ghosts.clearKnowledgeUsed();
      SugarCube.setup.Ghosts.clearChosenEvidence();
      // Override the active-ghost evidence to cover every catalogue id.
      const allIds = Object.keys(SugarCube.setup.Ghosts.Evidence).map(
        (k) => SugarCube.setup.Ghosts.Evidence[k].id
      );
      SugarCube.setup.HuntController.setField('evidence', allIds);
    });
    await page.evaluate(() => SugarCube.setup.HuntController.consumeKnowledgeEvidence());
    expect(await getVar(page, 'chosenEvidence')).toBeFalsy();
    expect(await getVar(page, 'knowledgeUsed')).toBeFalsy();
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
       run and verify the carry-stage globals come back clean. Bump
       mc.lvl past the paw's level gate so isDiscoverable can fairly
       report that the reset succeeded (otherwise the level gate would
       mask the per-hunt stage flip). */
    await setVar(page, 'mc.lvl', await callSetup(page, 'setup.MonkeyPaw.levelRequired()'));
    await page.evaluate(() => {
      const V = SugarCube.State.variables;
      V.tarotCardsStage = SugarCube.setup.TarotStage.CARRYING;
      V.drawnCards = 4;
      V.MonkeyPawStage = SugarCube.setup.MonkeyPawStage.FOUND;
      V.wishesCount = 1;
      V.knowledgeUsed = true;
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
    await setVar(page, 'mc.lvl', await callSetup(page, 'setup.MonkeyPaw.levelRequired()'));
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

  test('dawn wish routes the goto through huntOverPassage("time") -> HuntOverTime', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1 }));
    const out = await page.evaluate(
      () => SugarCube.setup.MonkeyPaw.activate('dawn')
    );
    /* huntOverPassage now settles the run inline and returns the
       exit-passage for the failure reason; "time" maps to HuntOverTime. */
    expect(out.goto).toBe('HuntOverTime');
    expect(await callSetup(page, 'setup.HuntController.isActive()')).toBe(false);
  });

  test('leave wish routes the goto through streetExitPassage -> CityMap', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1 }));
    const out = await page.evaluate(
      () => SugarCube.setup.MonkeyPaw.activate('leave')
    );
    expect(out.goto).toBe('CityMap');
    expect(await callSetup(page, 'setup.HuntController.isActive()')).toBe(false);
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
      // startHunt is required here (not cheatStartHunt) because it
      // runs resetCursedItemState which reseeds MonkeyPaw.wishesCount
      // to 3 -- without that activate() short-circuits on no-wishes.
      // Then pin the ghost identity + evidence explicitly so the
      // missing-evidence pool is Shade's, not the random startHunt roll.
      SugarCube.setup.HuntController.startHunt({ seed: 1 });
      const shade = SugarCube.setup.Ghosts.getByName('Shade');
      SugarCube.setup.HuntController.setField('ghostName', 'Shade');
      SugarCube.setup.HuntController.setField('disguiseName', 'Shade');
      SugarCube.setup.HuntController.setField(
        'evidence', shade.evidence.map((e) => e.id)
      );
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
      .toBe('HuntOverSanity');
  });
});
