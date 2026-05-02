const { test, expect } = require('@playwright/test');
const { openGame, resetGame, callSetup, getVar, setVar } = require('./helpers');

/* The tarot deck and the monkey paw share a single carry-state +
   wish/draw mechanism between classic (witch contract) and rogue
   (procedural run) modes. Both pickup paths land on the same
   $tarotCardsStage / $MonkeyPawStage flags, both runtime mechanics
   call into setup.HuntController for any branching that depends on
   what kind of hunt is in flight, and rogue-lifecycle resets fold
   in the same setup.HauntedHouses.resetCursedItemState helper that
   classic uses at GhostRandomize. These tests pin the contract so
   future callers don't reintroduce mode-aware forks at the call
   site. */
test.describe('Cursed-item cross-mode facade', () => {
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

  test('snapGhostToCurrentRoom in rogue pins floorplan.spawnRoomId to currentRoomId', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({ seed: 1 }));
    const fp = await getVar(page, 'run').then(r => r.floorplan);
    const nonHallway = fp.rooms.find(r => r.template !== 'hallway');
    expect(nonHallway).toBeDefined();
    // Move the player to a non-hallway, non-spawn room and snap.
    await page.evaluate(id => SugarCube.setup.Rogue.setCurrentRoom(id), nonHallway.id);
    await page.evaluate(() => SugarCube.setup.HuntController.snapGhostToCurrentRoom());

    const newSpawn = await page.evaluate(
      () => SugarCube.State.variables.run.floorplan.spawnRoomId
    );
    expect(newSpawn).toBe(nonHallway.id);
  });

  test('snapGhostToCurrentRoom in classic pins $hunt.room.name from the current passage', async () => {
    await page.evaluate(() => {
      SugarCube.setup.Ghosts.startHunt('Shade');
      SugarCube.State.variables.hunt.room = { name: 'kitchen' };
    });
    // Walk the player into a known haunted-house passage so the
    // hauntedPassages lookup has a hit.
    await page.evaluate(() => SugarCube.Engine.play('OwaissaBedroom'));
    await page.waitForFunction(() => SugarCube.State.passage === 'OwaissaBedroom');
    await page.evaluate(() => SugarCube.setup.HuntController.snapGhostToCurrentRoom());

    expect(await getVar(page, 'hunt.room.name')).toBe('bedroom');
  });

  test('snapGhostToCurrentRoom outside any hunt is a no-op', async () => {
    expect(await callSetup(page, 'setup.HuntController.snapGhostToCurrentRoom()')).toBe(false);
  });

  // --- HuntController.trapGhost / isGhostTrapped ---

  test('trapGhost in classic locks the front door + flags hunt.trapped', async () => {
    await page.evaluate(() => {
      SugarCube.setup.Ghosts.startHunt('Shade');
      SugarCube.State.variables.hunt.room = { name: 'kitchen' };
    });
    await page.evaluate(() => SugarCube.setup.HuntController.trapGhost('cursedItem'));

    expect(await getVar(page, 'hunt.trapped')).toBe(true);
    expect(await callSetup(page, 'setup.MonkeyPaw.isFrontDoorLocked()')).toBe(true);
    expect(await callSetup(page, 'setup.MonkeyPaw.doorUnlockBy()')).toBe('cursedItem');
    expect(await callSetup(page, 'setup.HuntController.isGhostTrapped()')).toBe(true);
  });

  test('trapGhost in rogue stamps run.trapped + run.exitLock and skips the classic door state', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({ seed: 1 }));
    await page.evaluate(() => SugarCube.setup.HuntController.trapGhost('dawn'));

    const run = await getVar(page, 'run');
    expect(run.trapped).toBe(true);
    expect(run.exitLock).toEqual({ unlockBy: 'dawn' });
    // Classic door-lock state is never touched in rogue.
    expect(await callSetup(page, 'setup.MonkeyPaw.isFrontDoorLocked()')).toBe(false);
    expect(await callSetup(page, 'setup.HuntController.isGhostTrapped()')).toBe(true);
  });

  test('rogue driftGhostRoom respects run.trapped and stops the shuffle', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({ seed: 42 }));
    const before = await page.evaluate(
      () => SugarCube.State.variables.run.floorplan.spawnRoomId
    );
    await page.evaluate(() => SugarCube.setup.HuntController.trapGhost('cursedItem'));
    // Force a drift roll: with run.trapped=true the helper bails before
    // touching spawnRoomId regardless of randomness.
    await page.evaluate(() => SugarCube.setup.Rogue.driftGhostRoom());
    const after = await page.evaluate(
      () => SugarCube.State.variables.run.floorplan.spawnRoomId
    );
    expect(after).toBe(before);
  });

  // --- HuntController.streetExitPassage ---

  test('streetExitPassage returns the active house street in classic', async () => {
    await page.evaluate(() => {
      SugarCube.setup.Ghosts.startHunt('Shade');
      SugarCube.setup.HauntedHouses.activate('owaissa');
    });
    expect(await callSetup(page, 'setup.HuntController.streetExitPassage()'))
      .toBe('Owaissa Street');

    await page.evaluate(() => SugarCube.setup.HauntedHouses.activate('elm'));
    expect(await callSetup(page, 'setup.HuntController.streetExitPassage()'))
      .toBe('Elm Street');
  });

  test('streetExitPassage stamps abandon failure + RogueEnd in rogue', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({ seed: 1 }));
    expect(await callSetup(page, 'setup.HuntController.streetExitPassage()'))
      .toBe('RogueEnd');
    expect(await callSetup(page, 'setup.Rogue.field("outcome")')).toBe('failure');
    expect(await callSetup(page, 'setup.Rogue.field("failureReason")')).toBe('abandon');
  });

  // --- HuntController.possessionPassage ---

  test('possessionPassage flips $hunt.mode to POSSESSED in classic and routes to CityMapPossessed', async () => {
    await page.evaluate(() => SugarCube.setup.Ghosts.startHunt('Shade'));
    const target = await callSetup(page, 'setup.HuntController.possessionPassage()');
    expect(target).toBe('CityMapPossessed');
    expect(await callSetup(page, 'setup.Ghosts.huntMode()'))
      .toBe(await callSetup(page, 'setup.Ghosts.HuntMode.POSSESSED'));
  });

  test('possessionPassage stamps possessed failure in rogue and routes to RogueEnd', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({ seed: 1 }));
    expect(await callSetup(page, 'setup.HuntController.possessionPassage()'))
      .toBe('RogueEnd');
    expect(await callSetup(page, 'setup.Rogue.field("outcome")')).toBe('failure');
    expect(await callSetup(page, 'setup.Rogue.field("failureReason")')).toBe('possessed');
  });

  // --- HuntController.consumeKnowledgeEvidence ---

  test('consumeKnowledgeEvidence in classic stamps a missing evidence on $chosenEvidence', async () => {
    /* Classic path mirrors the existing setup.Ghosts.consumeKnowledgeEvidence
       behavior: pick something the ghost doesn't have and that the witch
       hasn't already hidden. We pin the random pick to index 0 of the
       missing list. */
    await page.evaluate(() => {
      SugarCube.setup.Ghosts.startHunt('Shade');
      // Shade's evidence is [emf, gwb, temperature].
      Math.random = () => 0;
    });
    await page.evaluate(() => SugarCube.setup.HuntController.consumeKnowledgeEvidence());

    expect(await getVar(page, 'knowledgeUsed')).toBe(1);
    const chosen = await getVar(page, 'chosenEvidence');
    expect(['spiritbox', 'uvl', 'glass']).toContain(chosen);
  });

  test('consumeKnowledgeEvidence in rogue picks an evidence the rogue ghost lacks', async () => {
    await page.evaluate(() => {
      SugarCube.setup.Rogue.startRogue({ seed: 1 });
      // Pin the rogue ghost to Shade so the missing-evidence pool is known
      // (Shade has emf/gwb/temperature -> missing is spiritbox/uvl/glass).
      SugarCube.setup.Rogue.setField('ghostName', 'Shade');
      Math.random = () => 0;
    });
    await page.evaluate(() => SugarCube.setup.HuntController.consumeKnowledgeEvidence());

    expect(await getVar(page, 'knowledgeUsed')).toBe(1);
    const chosen = await getVar(page, 'chosenEvidence');
    expect(['spiritbox', 'uvl', 'glass']).toContain(chosen);
  });

  test('consumeKnowledgeEvidence is idempotent within a single hunt', async () => {
    await page.evaluate(() => {
      SugarCube.setup.Rogue.startRogue({ seed: 1 });
      SugarCube.setup.Rogue.setField('ghostName', 'Shade');
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

  test('banActiveContext bans the classic house but is a no-op in rogue', async () => {
    await page.evaluate(() => {
      SugarCube.setup.Ghosts.startHunt('Shade');
      SugarCube.setup.HauntedHouses.activate('owaissa');
    });
    const banned = await page.evaluate(
      () => SugarCube.setup.HuntController.banActiveContext()
    );
    expect(banned).toBe('owaissa');
    expect(await callSetup(page, 'setup.MonkeyPaw.isHouseBanned("owaissa")')).toBe(true);

    await page.evaluate(() => SugarCube.setup.Ghosts.endContract());
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({ seed: 1 }));
    expect(await callSetup(page, 'setup.HuntController.banActiveContext()')).toBeNull();
  });

  // --- HuntController.shouldUseCursedHuntOption ---

  test('shouldUseCursedHuntOption mirrors the player toggle in classic and is false in rogue', async () => {
    /* setup.Gui.isCursedHuntOptionOn() returns true when
       $cursedHuntOption is 0 or undefined (the default), false when
       the player has flipped the toggle off (1). Classic mirrors
       that state; rogue always returns false because cursed-hunt
       sub-flow only applies to witch-contract hunts. */
    await page.evaluate(() => SugarCube.setup.Ghosts.startHunt('Shade'));
    await setVar(page, 'cursedHuntOption', 0);
    expect(await callSetup(page, 'setup.HuntController.shouldUseCursedHuntOption()')).toBe(true);
    await setVar(page, 'cursedHuntOption', 1);
    expect(await callSetup(page, 'setup.HuntController.shouldUseCursedHuntOption()')).toBe(false);

    // Same toggle, rogue mode -> the cursed-hunt sub-flow is disabled.
    await page.evaluate(() => SugarCube.setup.Ghosts.endContract());
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({ seed: 1 }));
    await page.evaluate(() => SugarCube.Engine.play('RogueRun'));
    await page.waitForFunction(() => SugarCube.State.passage === 'RogueRun');
    await setVar(page, 'cursedHuntOption', 0);
    expect(await callSetup(page, 'setup.HuntController.shouldUseCursedHuntOption()')).toBe(false);
  });

  // --- HuntController.isInsideHuntPassage (Bag gate) ---

  test('isInsideHuntPassage accepts haunted-house rooms and RogueRun, rejects streets', async () => {
    /* Bag opens with previous(1) = whichever passage launched it.
       Force passage history to each candidate and assert the gate. */
    await page.evaluate(() => SugarCube.Engine.play('OwaissaBedroom'));
    await page.waitForFunction(() => SugarCube.State.passage === 'OwaissaBedroom');
    await page.evaluate(() => SugarCube.Engine.play('Bag'));
    await page.waitForFunction(() => SugarCube.State.passage === 'Bag');
    expect(await callSetup(page, 'setup.HuntController.isInsideHuntPassage()')).toBe(true);

    await page.evaluate(() => SugarCube.Engine.play('Owaissa Street'));
    await page.waitForFunction(() => SugarCube.State.passage === 'Owaissa Street');
    await page.evaluate(() => SugarCube.Engine.play('Bag'));
    await page.waitForFunction(() => SugarCube.State.passage === 'Bag');
    expect(await callSetup(page, 'setup.HuntController.isInsideHuntPassage()')).toBe(false);
  });

  // --- Lifecycle: rogue start/end fold in resetCursedItemState ---

  test('startRogue resets tarot stage + monkey paw wish count to fresh-hunt defaults', async () => {
    /* Pre-stamp dirty state from a prior session, then start a rogue
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
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({ seed: 1 }));

    expect(await callSetup(page, 'setup.HauntedHouses.tarotCardsStage()'))
      .toBe(await callSetup(page, 'setup.TarotStage.HIDDEN'));
    expect(await getVar(page, 'drawnCards')).toBe(0);
    expect(await callSetup(page, 'setup.MonkeyPaw.isDiscoverable()')).toBe(true);
    expect(await callSetup(page, 'setup.MonkeyPaw.wishesLeft()')).toBe(3);
    expect(await getVar(page, 'knowledgeUsed')).toBeFalsy();
    expect(await getVar(page, 'chosenEvidence')).toBeUndefined();
  });

  test('endRogue resets shared state so a follow-up classic hunt starts clean', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({ seed: 1 }));
    // Simulate the player picking up the deck + paw mid-run and using a wish.
    await page.evaluate(() => {
      SugarCube.setup.HauntedHouses.markTarotCarrying();
      SugarCube.setup.MonkeyPaw.markFound();
      SugarCube.setup.MonkeyPaw.removeWish();
    });
    expect(await callSetup(page, 'setup.MonkeyPaw.wishesLeft()')).toBe(2);

    await page.evaluate(() => SugarCube.setup.Rogue.endRogue(true));

    // Carry state is back to fresh defaults so a classic hunt sees a
    // clean deck/paw rather than inheriting the rogue run's leftovers.
    expect(await callSetup(page, 'setup.HauntedHouses.tarotCardsStage()'))
      .toBe(await callSetup(page, 'setup.TarotStage.HIDDEN'));
    expect(await callSetup(page, 'setup.MonkeyPaw.isDiscoverable()')).toBe(true);
    expect(await callSetup(page, 'setup.MonkeyPaw.wishesLeft()')).toBe(3);
  });

  // --- MonkeyPaw wish results route through HuntController in rogue ---

  test('dawn wish in rogue routes the goto through huntOverPassage("time") -> RogueEnd', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({ seed: 1 }));
    const out = await page.evaluate(
      () => SugarCube.setup.MonkeyPaw.activate('dawn')
    );
    expect(out.goto).toBe('RogueEnd');
    expect(await callSetup(page, 'setup.Rogue.field("failureReason")')).toBe('time');
  });

  test('leave wish in rogue routes the goto through streetExitPassage -> RogueEnd', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({ seed: 1 }));
    const out = await page.evaluate(
      () => SugarCube.setup.MonkeyPaw.activate('leave')
    );
    expect(out.goto).toBe('RogueEnd');
    expect(await callSetup(page, 'setup.Rogue.field("failureReason")')).toBe('abandon');
  });

  test('trapTheGhost wish in rogue marks run.trapped + run.exitLock', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({ seed: 1 }));
    await page.evaluate(() => SugarCube.setup.MonkeyPaw.activate('trapTheGhost'));

    const run = await getVar(page, 'run');
    expect(run.trapped).toBe(true);
    expect(run.exitLock).toEqual({ unlockBy: 'cursedItem' });
  });

  test('knowledge wish in rogue stamps $chosenEvidence and burns one wish', async () => {
    await page.evaluate(() => {
      SugarCube.setup.Rogue.startRogue({ seed: 1 });
      SugarCube.setup.Rogue.setField('ghostName', 'Shade');
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
    /* The widget renders <<link "Give in" `possessionPassage()`>>; the
       passage target is computed at render time, so we just verify
       that target string in both modes. */
    await page.evaluate(() => SugarCube.setup.Ghosts.startHunt('Shade'));
    expect(await callSetup(page, 'setup.HuntController.possessionPassage()'))
      .toBe('CityMapPossessed');

    await page.evaluate(() => SugarCube.setup.Ghosts.endContract());
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({ seed: 1 }));
    expect(await callSetup(page, 'setup.HuntController.possessionPassage()'))
      .toBe('RogueEnd');
  });

  test('tarot Oblivion card target routes via HuntController.huntOverPassage("sanity")', async () => {
    await page.evaluate(() => SugarCube.setup.Ghosts.startHunt('Shade'));
    expect(await callSetup(page, 'setup.HuntController.huntOverPassage("sanity")'))
      .toBe('HuntOverSanity');

    await page.evaluate(() => SugarCube.setup.Ghosts.endContract());
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({ seed: 1 }));
    expect(await callSetup(page, 'setup.HuntController.huntOverPassage("sanity")'))
      .toBe('RogueEnd');
  });
});
