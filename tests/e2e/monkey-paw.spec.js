const { test, expect } = require('../fixtures');
const { setVar, getVar, callSetup, goToPassage } = require('../helpers');
const { setupHunt } = require('./e2e-helpers');

/**
 * Monkey Paw cursed-item behavior. The paw owns its own controller
 * (setup.MonkeyPaw); these tests poke through that surface rather than
 * the wish widgets, so they don't depend on the DOM rendering pipeline.
 *
 *   - Tier escalation: wishesCount=3 -> t1, =2 -> t2, =1 -> t3
 *   - byInput is case- and whitespace-insensitive
 *   - hasWishes() gates the menu when wishesCount === 0
 *   - rollAnything() draws uniformly from the 6 catalogue wishes
 */
test.describe('Monkey Paw wishes', () => {
  test.describe.configure({ timeout: 20_000 });

  /* Helper: park the hunt in a clean state with the requested
     starting wishesCount. wishesCount=3 → tier 1 next, =2 → tier 2,
     =1 → tier 3. Resets sanity/lust/tempCorr to known values too so
     each tier assertion has a stable baseline. */
  async function primeWish(page, { wishesCount = 3, sanity = 80 } = {}) {
    await page.evaluate(({ wc, san }) => {
      SugarCube.setup.MonkeyPaw.resetHunt();
      SugarCube.State.variables.wishesCount = wc;
      SugarCube.setup.Mc.setSanity(san);
      SugarCube.State.variables.mc.lust = 0;
      SugarCube.setup.Mc.setTempCorr(0);
      SugarCube.setup.Mc.setCorruption(0);
      SugarCube.setup.Ghosts.clearKnowledgeUsed();
    }, { wc: wishesCount, san: sanity });
  }

  // --- activity wish ---------------------------------------------

  test('activity tier 1: +15 lust, -15 sanity, no temp corruption', async ({ game: page }) => {
    await setupHunt(page, 'Shade');
    await primeWish(page, { wishesCount: 3 });
    const result = await callSetup(page, 'setup.MonkeyPaw.activate("activity")');
    expect(result.tier).toBe(1);
    expect(result.lustDelta).toBe(15);
    expect(result.sanityDelta).toBe(-15);
    expect(result.corrDelta).toBe(0);
    expect(result.drewGhost).toBe(false);
    expect(result.video).toMatch(/^mechanics\/cursedpossessions\/.+\.mp4$/);
    expect(result.narrative).toBe("Shit! I shouldn't have asked this....");
    expect(await getVar(page, 'mc.lust')).toBe(15);
    expect(await callSetup(page, 'setup.Mc.sanity()')).toBe(65);
    expect(await callSetup(page, 'setup.Mc.tempCorr()')).toBe(0);
    expect(await callSetup(page, 'setup.MonkeyPaw.wishesLeft()')).toBe(2);
  });

  test('activity tier 2: +25 lust, -25 sanity, +0.2 tempCorr, no ghost snap', async ({ game: page }) => {
    await setupHunt(page, 'Shade');
    await primeWish(page, { wishesCount: 2 });
    const result = await callSetup(page, 'setup.MonkeyPaw.activate("activity")');
    expect(result.tier).toBe(2);
    expect(result.lustDelta).toBe(25);
    expect(result.sanityDelta).toBe(-25);
    expect(result.corrDelta).toBe(0.2);
    expect(result.drewGhost).toBe(false);
    expect(result.video).toMatch(/^mechanics\/cursedpossessions\/.+\.mp4$/);
    expect(result.narrative).toBe("God, it's even worse this time. I shouldn't have asked again....");
    expect(await getVar(page, 'mc.lust')).toBe(25);
    expect(await callSetup(page, 'setup.Mc.sanity()')).toBe(55);
    expect(await callSetup(page, 'setup.Mc.tempCorr()')).toBeCloseTo(0.2);
    expect(await callSetup(page, 'setup.MonkeyPaw.wishesLeft()')).toBe(1);
  });

  test('activity tier 3 escalates: +40 lust, -40 sanity, +0.4 tempCorr, snaps ghost', async ({ game: page }) => {
    await setupHunt(page, 'Shade');
    await primeWish(page, { wishesCount: 1 });
    /* Move the player to a non-spawn room so the snap is observable. */
    const target = await page.evaluate(() => {
      const fp = SugarCube.State.variables.run.floorplan;
      const room = fp.rooms.find(r => r.id !== fp.spawnRoomId && r.template !== 'hallway');
      SugarCube.setup.HuntController.setCurrentRoom(room.id);
      return room.id;
    });
    const result = await callSetup(page, 'setup.MonkeyPaw.activate("activity")');
    expect(result.tier).toBe(3);
    expect(result.lustDelta).toBe(40);
    expect(result.sanityDelta).toBe(-40);
    expect(result.corrDelta).toBe(0.4);
    expect(result.drewGhost).toBe(true);
    expect(result.video).toMatch(/^mechanics\/cursedpossessions\/.+\.mp4$/);
    expect(result.narrative).toBe("Something in the room just... noticed me. It's here. It's here.");
    expect(await getVar(page, 'mc.lust')).toBe(40);
    expect(await callSetup(page, 'setup.Mc.sanity()')).toBe(40);
    expect(await callSetup(page, 'setup.Mc.tempCorr()')).toBeCloseTo(0.4);
    expect(await callSetup(page, 'setup.MonkeyPaw.wishesLeft()')).toBe(0);
    /* Snap pulls the ghost into the player's room. */
    expect(await callSetup(page, 'setup.HuntController.ghostRoomId()')).toBe(target);
  });

  // --- trapTheGhost wish -----------------------------------------

  test('trapTheGhost tier 1: -15 sanity, unlockBy cursedItem, traps ghost, no snap', async ({ game: page }) => {
    await setupHunt(page, 'Shade');
    await primeWish(page, { wishesCount: 3 });
    const result = await callSetup(page, 'setup.MonkeyPaw.activate("trapTheGhost")');
    expect(result.tier).toBe(1);
    expect(result.sanityDelta).toBe(-15);
    expect(result.corrDelta).toBe(0);
    expect(result.doorUnlockBy).toBe('cursedItem');
    expect(result.drewGhost).toBe(false);
    expect(result.roomSealed).toBe(false);
    expect(result.narrative).toBe(
      "The ghost is pinned to one room.<br>The front door seals itself behind the wish -- only a cursed offering will open it."
    );
    expect(await callSetup(page, 'setup.Mc.sanity()')).toBe(65);
    expect(await callSetup(page, 'setup.Mc.tempCorr()')).toBe(0);
    expect(await callSetup(page, 'setup.HuntController.isGhostTrapped()')).toBe(true);
    expect(await getVar(page, 'run.exitLock')).toEqual({ unlockBy: 'cursedItem' });
    expect(await callSetup(page, 'setup.MonkeyPaw.wishesLeft()')).toBe(2);
  });

  test('trapTheGhost tier 2: -25 sanity, +0.2 tempCorr, unlockBy dawn', async ({ game: page }) => {
    await setupHunt(page, 'Shade');
    await primeWish(page, { wishesCount: 2 });
    const result = await callSetup(page, 'setup.MonkeyPaw.activate("trapTheGhost")');
    expect(result.tier).toBe(2);
    expect(result.sanityDelta).toBe(-25);
    expect(result.corrDelta).toBe(0.2);
    expect(result.doorUnlockBy).toBe('dawn');
    expect(result.drewGhost).toBe(false);
    expect(result.roomSealed).toBe(false);
    expect(result.narrative).toBe(
      "The ghost is bound. The front door sinks into the frame until dawn.<br>I'll have to wait out the dark."
    );
    expect(await callSetup(page, 'setup.Mc.sanity()')).toBe(55);
    expect(await callSetup(page, 'setup.Mc.tempCorr()')).toBeCloseTo(0.2);
    expect(await callSetup(page, 'setup.HuntController.isGhostTrapped()')).toBe(true);
    expect(await getVar(page, 'run.exitLock')).toEqual({ unlockBy: 'dawn' });
    expect(await callSetup(page, 'setup.MonkeyPaw.wishesLeft()')).toBe(1);
  });

  test('trapTheGhost tier 3: -40 sanity, +0.4 tempCorr, unlockBy cursedItem, snaps ghost into player room, locks the room', async ({ game: page }) => {
    await setupHunt(page, 'Shade');
    await primeWish(page, { wishesCount: 1 });
    const target = await page.evaluate(() => {
      const fp = SugarCube.State.variables.run.floorplan;
      const room = fp.rooms.find(r => r.id !== fp.spawnRoomId && r.template !== 'hallway');
      SugarCube.setup.HuntController.setCurrentRoom(room.id);
      return room.id;
    });
    const result = await callSetup(page, 'setup.MonkeyPaw.activate("trapTheGhost")');
    expect(result.tier).toBe(3);
    expect(result.sanityDelta).toBe(-40);
    expect(result.corrDelta).toBe(0.4);
    expect(result.doorUnlockBy).toBe('cursedItem');
    expect(result.drewGhost).toBe(true);
    expect(result.roomSealed).toBe(true);
    expect(result.narrative).toBe(
      "I nailed the ghost in place -- here, with me. The doors around me thunk shut.<br>I'll need a cursed offering, or a loud voice."
    );
    expect(await callSetup(page, 'setup.Mc.sanity()')).toBe(40);
    expect(await callSetup(page, 'setup.Mc.tempCorr()')).toBeCloseTo(0.4);
    expect(await callSetup(page, 'setup.HuntController.isGhostTrapped()')).toBe(true);
    expect(await getVar(page, 'run.exitLock')).toEqual({ unlockBy: 'cursedItem' });
    expect(await callSetup(page, 'setup.HuntController.isRoomLocked()')).toBe(true);
    expect(await callSetup(page, 'setup.HuntController.ghostRoomId()')).toBe(target);
    expect(await callSetup(page, 'setup.MonkeyPaw.wishesLeft()')).toBe(0);
  });

  test('trapTheGhost tier 1 and 2 do not lock the player in their current room', async ({ game: page }) => {
    /* Only tier 3 drops the ghost on you; tiers 1 and 2 still let
       you walk the hallway. */
    await setupHunt(page, 'Shade');
    await primeWish(page, { wishesCount: 3 });
    await callSetup(page, 'setup.MonkeyPaw.activate("trapTheGhost")');
    expect(await callSetup(page, 'setup.HuntController.isRoomLocked()')).toBe(false);

    await primeWish(page, { wishesCount: 2 });
    await callSetup(page, 'setup.MonkeyPaw.activate("trapTheGhost")');
    expect(await callSetup(page, 'setup.HuntController.isRoomLocked()')).toBe(false);
  });

  test('trapGhost stops periodic drift so the ghost stays put for the rest of the run', async ({ game: page }) => {
    /* A trapped ghost must not shuffle rooms when driftGhostRoom is
       called. Pre-bug, the trap effect did set $hunt.trapped, but the
       drift roll never consulted it — every tick could re-randomize
       the lair and undo the wish. */
    await setupHunt(page, 'Shade');
    await primeWish(page, { wishesCount: 3 });
    await callSetup(page, 'setup.MonkeyPaw.activate("trapTheGhost")');
    const before = await callSetup(page, 'setup.HuntController.ghostRoomId()');
    /* Force a drift roll — with run.trapped=true the helper bails. */
    await callSetup(page, 'setup.HuntController.driftGhostRoom()');
    const after = await callSetup(page, 'setup.HuntController.ghostRoomId()');
    expect(after).toBe(before);
  });

  test('isExitLocked() flips after a trap wish; exitLockReason mirrors the wish tier', async ({ game: page }) => {
    /* The whole point of the trap wish is that the player cannot
       walk out of the haunt while the lock is active. Pre-fix, no
       caller in the codebase read $run.exitLock at all -- the bit
       was stamped onto the run and ignored. This regression-pins
       the controller predicate the nav layer now reads from. */
    await setupHunt(page, 'Shade');
    await primeWish(page, { wishesCount: 3 });
    expect(await callSetup(page, 'setup.HuntController.isExitLocked()')).toBe(false);
    expect(await callSetup(page, 'setup.HuntController.exitLockReason()')).toBe(null);
    await callSetup(page, 'setup.MonkeyPaw.activate("trapTheGhost")');
    expect(await callSetup(page, 'setup.HuntController.isExitLocked()')).toBe(true);
    expect(await callSetup(page, 'setup.HuntController.exitLockReason()')).toBe('cursedItem');
  });

  test('isExitLocked() returns false with no active run (guarded fallback)', async ({ game: page }) => {
    /* Nav-layer guards must tolerate being asked outside a hunt --
       isExitLocked() reads $run.exitLock through the guarded()
       wrapper, so it must answer false when the run is null. */
    await page.evaluate(() => { SugarCube.State.variables.run = null; });
    expect(await callSetup(page, 'setup.HuntController.isExitLocked()')).toBe(false);
    expect(await callSetup(page, 'setup.HuntController.exitLockReason()')).toBe(null);
  });

  test('trapTheGhost tier 2 (dawn-unlock) stamps exitLockReason=dawn', async ({ game: page }) => {
    /* Per-tier exit-lock reason: t2 unlocks at dawn so the nav
       message and recovery flow can branch on the reason. */
    await setupHunt(page, 'Shade');
    await primeWish(page, { wishesCount: 2 });
    await callSetup(page, 'setup.MonkeyPaw.activate("trapTheGhost")');
    expect(await callSetup(page, 'setup.HuntController.isExitLocked()')).toBe(true);
    expect(await callSetup(page, 'setup.HuntController.exitLockReason()')).toBe('dawn');
  });

  test('HuntRun hallway hides the Outside link once the trap wish is active', async ({ game: page }) => {
    /* The actual bug the trap wish was meant to fix: the hallway's
       [[Outside|HuntOutside]] link in HuntLifecycle.tw was rendered
       unconditionally, so the player could walk out of a "sealed"
       house freely. With the gate in place the link disappears and
       a "door is sealed" thought renders in its place. */
    await setupHunt(page, 'Shade');
    await primeWish(page, { wishesCount: 3 });
    /* Pin the player to the hallway (room_0 is the hallway in static
       houses) so HuntLifecycle's hallway branch renders. */
    await callSetup(page, 'setup.HuntController.setCurrentRoom("room_0")');

    await goToPassage(page, 'HuntRun');
    const passageBeforeTrap = await page.locator('#passages').innerHTML();
    expect(passageBeforeTrap).toContain('HuntOutside');

    await callSetup(page, 'setup.MonkeyPaw.activate("trapTheGhost")');
    await goToPassage(page, 'HuntRun');
    const passageAfterTrap = await page.locator('#passages').innerHTML();
    expect(passageAfterTrap).not.toContain('HuntOutside');
    expect(passageAfterTrap).toMatch(/door is sealed/i);
  });

  test('sealed door (cursedItem lock) prompts for a sacrifice when the MC is carrying one', async ({ game: page }) => {
    /* Trap t1/t3 stamp unlockBy=cursedItem. If the player is
       carrying a witch-quest cursed item, the sealed-door hallway
       must offer a way to give it up to break the seal. */
    await setupHunt(page, 'Shade');
    await primeWish(page, { wishesCount: 3 });
    await callSetup(page, 'setup.HuntController.setCurrentRoom("room_0")');
    await callSetup(page, 'setup.MonkeyPaw.activate("trapTheGhost")');
    await callSetup(page, 'setup.Witch.cheatGrantCursedItem("dildo")');

    await goToPassage(page, 'HuntRun');
    const html = await page.locator('#passages').innerHTML();
    expect(html).toMatch(/door is sealed/i);
    expect(html).toMatch(/offer the cursed item to the door/i);
  });

  test('sealed door (cursedItem lock) hints at the cursed-item option when MC has none', async ({ game: page }) => {
    /* When the lock is cursedItem-keyed but the MC is empty-handed
       the door still seals; the UI flags the requirement so the
       player knows what to look for. */
    await setupHunt(page, 'Shade');
    await primeWish(page, { wishesCount: 3 });
    await callSetup(page, 'setup.HuntController.setCurrentRoom("room_0")');
    await callSetup(page, 'setup.MonkeyPaw.activate("trapTheGhost")');
    expect(await callSetup(page, 'setup.Witch.hasCursedItemToTurnIn()')).toBe(false);

    await goToPassage(page, 'HuntRun');
    const html = await page.locator('#passages').innerHTML();
    expect(html).toMatch(/door is sealed/i);
    expect(html).toMatch(/cursed object might break the seal/i);
    expect(html).not.toMatch(/offer the cursed item to the door/i);
  });

  test('sealed door (dawn lock) tells the player to wait, never offers a sacrifice', async ({ game: page }) => {
    /* Trap t2 locks the door until dawn; carrying a cursed item
       must NOT bypass it, otherwise the dawn-only variant collapses
       into the cursedItem variant. */
    await setupHunt(page, 'Shade');
    await primeWish(page, { wishesCount: 2 });
    await callSetup(page, 'setup.HuntController.setCurrentRoom("room_0")');
    await callSetup(page, 'setup.MonkeyPaw.activate("trapTheGhost")');
    await callSetup(page, 'setup.Witch.cheatGrantCursedItem("dildo")');

    await goToPassage(page, 'HuntRun');
    const html = await page.locator('#passages').innerHTML();
    expect(html).toMatch(/wait out the dark/i);
    expect(html).not.toMatch(/offer the cursed item to the door/i);
    expect(html).not.toContain('HuntOutside');
  });

  test('sacrificeCursedItemAtDoor consumes the carried item and unlocks the door (lock=cursedItem)', async ({ game: page }) => {
    await setupHunt(page, 'Shade');
    await primeWish(page, { wishesCount: 3 });
    await callSetup(page, 'setup.MonkeyPaw.activate("trapTheGhost")');
    await callSetup(page, 'setup.Witch.cheatGrantCursedItem("dildo")');
    expect(await callSetup(page, 'setup.Witch.hasCursedItemToTurnIn()')).toBe(true);

    const cleared = await callSetup(page, 'setup.HuntController.sacrificeCursedItemAtDoor()');
    expect(cleared).toBe('isCIDildo');
    expect(await callSetup(page, 'setup.Witch.hasCursedItemToTurnIn()')).toBe(false);
    expect(await callSetup(page, 'setup.HuntController.isExitLocked()')).toBe(false);
    /* The ghost is still trapped -- only the door reopens. */
    expect(await callSetup(page, 'setup.HuntController.isGhostTrapped()')).toBe(true);
  });

  test('sacrificeCursedItemAtDoor refuses dawn-keyed locks even when the MC has a cursed item', async ({ game: page }) => {
    await setupHunt(page, 'Shade');
    await primeWish(page, { wishesCount: 2 });
    await callSetup(page, 'setup.MonkeyPaw.activate("trapTheGhost")');
    await callSetup(page, 'setup.Witch.cheatGrantCursedItem("dildo")');

    const cleared = await callSetup(page, 'setup.HuntController.sacrificeCursedItemAtDoor()');
    expect(cleared).toBe(null);
    /* Item not consumed, lock still in place. */
    expect(await callSetup(page, 'setup.Witch.hasCursedItemToTurnIn()')).toBe(true);
    expect(await callSetup(page, 'setup.HuntController.isExitLocked()')).toBe(true);
  });

  test('sacrificeCursedItemAtDoor refuses when the MC is empty-handed', async ({ game: page }) => {
    await setupHunt(page, 'Shade');
    await primeWish(page, { wishesCount: 3 });
    await callSetup(page, 'setup.MonkeyPaw.activate("trapTheGhost")');

    const cleared = await callSetup(page, 'setup.HuntController.sacrificeCursedItemAtDoor()');
    expect(cleared).toBe(null);
    expect(await callSetup(page, 'setup.HuntController.isExitLocked()')).toBe(true);
  });

  test('trap tier 3 HuntRun: neighbor links are gone and the room-seal message renders', async ({ game: page }) => {
    /* The whole point of the new tier-3 escalation: the player can't
       even walk to a neighboring room. HuntLifecycle hides every
       neighbor link and prints the room-seal thought instead. */
    await setupHunt(page, 'Shade');
    await primeWish(page, { wishesCount: 1 });
    /* Pin the player into a non-hallway room and capture its
       neighbor labels via currentRoomData (which is what the
       HuntLifecycle render also consumes). */
    const neighborLabels = await page.evaluate(() => {
      const fp = SugarCube.State.variables.run.floorplan;
      const room = fp.rooms.find(r => r.template !== 'hallway');
      SugarCube.setup.HuntController.setCurrentRoom(room.id);
      const data = SugarCube.setup.HuntController.currentRoomData();
      return (data && data.neighbors ? data.neighbors : []).map(n => n.label);
    });
    expect(neighborLabels.length).toBeGreaterThan(0);
    await callSetup(page, 'setup.MonkeyPaw.activate("trapTheGhost")');

    await goToPassage(page, 'HuntRun');
    /* The room-seal narrative lives in .hunt-run-messages (the panel
       above the light buttons). The exit-nav box stays for actionable
       links only -- so the nav must not list any neighbor labels, and
       the seal prose must be in the messages panel. */
    const messagesHtml = await page.locator('#passages .hunt-run-messages').innerHTML();
    expect(messagesHtml).toMatch(/doors around you have fused shut/i);
    const navHtml = await page.locator('#passages .hunt-run-nav').innerHTML();
    expect(navHtml).not.toMatch(/doors around you have fused shut/i);
    for (const label of neighborLabels) {
      expect(navHtml).not.toContain(`>${label}<`);
    }
  });

  test('trap tier 3 sealed-room: sacrifice link surfaces when the MC has a cursed item', async ({ game: page }) => {
    await setupHunt(page, 'Shade');
    await primeWish(page, { wishesCount: 1 });
    await page.evaluate(() => {
      const fp = SugarCube.State.variables.run.floorplan;
      const room = fp.rooms.find(r => r.template !== 'hallway');
      SugarCube.setup.HuntController.setCurrentRoom(room.id);
    });
    await callSetup(page, 'setup.MonkeyPaw.activate("trapTheGhost")');
    await callSetup(page, 'setup.Witch.cheatGrantCursedItem("dildo")');

    await goToPassage(page, 'HuntRun');
    const html = await page.locator('#passages').innerHTML();
    expect(html).toMatch(/doors around you have fused shut/i);
    expect(html).toMatch(/offer the cursed item to the seal/i);
  });

  test('sacrificeCursedItemAtDoor on trap tier 3 clears both door and room locks with one item', async ({ game: page }) => {
    /* Tier 3 stamps two locks (exitLock + roomLock). A single cursed
       item must break both — players only ever carry one. */
    await setupHunt(page, 'Shade');
    await primeWish(page, { wishesCount: 1 });
    await callSetup(page, 'setup.MonkeyPaw.activate("trapTheGhost")');
    expect(await callSetup(page, 'setup.HuntController.isExitLocked()')).toBe(true);
    expect(await callSetup(page, 'setup.HuntController.isRoomLocked()')).toBe(true);

    await callSetup(page, 'setup.Witch.cheatGrantCursedItem("dildo")');
    const cleared = await callSetup(page, 'setup.HuntController.sacrificeCursedItemAtDoor()');
    expect(cleared).toBe('isCIDildo');
    expect(await callSetup(page, 'setup.HuntController.isExitLocked()')).toBe(false);
    expect(await callSetup(page, 'setup.HuntController.isRoomLocked()')).toBe(false);
    expect(await callSetup(page, 'setup.Witch.hasCursedItemToTurnIn()')).toBe(false);
    /* The ghost stays pinned even after the seals break. */
    expect(await callSetup(page, 'setup.HuntController.isGhostTrapped()')).toBe(true);
  });

  test('sacrificeCursedItemAtDoor works for a room-only lock (e.g. exit unlocked elsewhere)', async ({ game: page }) => {
    /* Defensive: if some future code path clears the exitLock but
       leaves the room locked, sacrifice should still unblock the
       room. Mirrors the symmetric case where the door is cursedItem
       and the room is not. */
    await setupHunt(page, 'Shade');
    await primeWish(page, { wishesCount: 1 });
    await callSetup(page, 'setup.MonkeyPaw.activate("trapTheGhost")');
    /* Hand-clear the front door so only the room lock remains. */
    await callSetup(page, 'setup.HuntController.clearExitLock()');
    expect(await callSetup(page, 'setup.HuntController.isExitLocked()')).toBe(false);
    expect(await callSetup(page, 'setup.HuntController.isRoomLocked()')).toBe(true);

    await callSetup(page, 'setup.Witch.cheatGrantCursedItem("dildo")');
    const cleared = await callSetup(page, 'setup.HuntController.sacrificeCursedItemAtDoor()');
    expect(cleared).toBe('isCIDildo');
    expect(await callSetup(page, 'setup.HuntController.isRoomLocked()')).toBe(false);
  });

  test('isRoomLocked() returns false with no active run (guarded fallback)', async ({ game: page }) => {
    await page.evaluate(() => { SugarCube.State.variables.run = null; });
    expect(await callSetup(page, 'setup.HuntController.isRoomLocked()')).toBe(false);
  });

  test('clicking the sacrifice link restores the Outside link on the next render', async ({ game: page }) => {
    /* End-to-end: trap → grant item → render → click sacrifice →
       the post-sacrifice HuntRun must show the Outside link again. */
    await setupHunt(page, 'Shade');
    await primeWish(page, { wishesCount: 3 });
    await callSetup(page, 'setup.HuntController.setCurrentRoom("room_0")');
    await callSetup(page, 'setup.MonkeyPaw.activate("trapTheGhost")');
    await callSetup(page, 'setup.Witch.cheatGrantCursedItem("dildo")');

    await goToPassage(page, 'HuntRun');
    await page.locator('#passages').getByRole('button', { name: /offer the cursed item to the door/i }).click();
    await page.waitForFunction(
      () => SugarCube.State.passage === 'HuntRun'
        && !SugarCube.setup.HuntController.isExitLocked(),
      null,
      { timeout: 3000 }
    );
    /* Pin the room back to the hallway so the post-sacrifice render
       exposes the Outside link (huntTickStep can drift the player to
       a different room mid-render via passage ticks). */
    await callSetup(page, 'setup.HuntController.setCurrentRoom("room_0")');
    await goToPassage(page, 'HuntRun');
    const html = await page.locator('#passages').innerHTML();
    expect(html).toContain('HuntOutside');
    expect(html).not.toMatch(/door is sealed/i);
  });

  // --- sanity wish -----------------------------------------------

  test('sanity tier 1: pins sanity to 50, no lust, no corr', async ({ game: page }) => {
    await setupHunt(page, 'Shade');
    await primeWish(page, { wishesCount: 3, sanity: 10 });
    const result = await callSetup(page, 'setup.MonkeyPaw.activate("sanity")');
    expect(result.tier).toBe(1);
    expect(result.sanitySet).toBe(50);
    expect(result.lustDelta).toBe(0);
    expect(result.corrDelta).toBe(0);
    expect(result.narrative).toBe("I shouldn't have expected anything better...");
    expect(await callSetup(page, 'setup.Mc.sanity()')).toBe(50);
    expect(await getVar(page, 'mc.lust')).toBe(0);
    expect(await callSetup(page, 'setup.Mc.tempCorr()')).toBe(0);
    expect(await callSetup(page, 'setup.MonkeyPaw.wishesLeft()')).toBe(2);
  });

  test('sanity tier 1 also clamps DOWN to 50 when MC starts above', async ({ game: page }) => {
    /* The wish is a hard SET, not an additive bump -- whether the
       MC starts below or above 50 they land on 50. */
    await setupHunt(page, 'Shade');
    await primeWish(page, { wishesCount: 3, sanity: 95 });
    await callSetup(page, 'setup.MonkeyPaw.activate("sanity")');
    expect(await callSetup(page, 'setup.Mc.sanity()')).toBe(50);
  });

  test('sanity tier 2: pins sanity to 50, +10 lust, +0.2 tempCorr', async ({ game: page }) => {
    await setupHunt(page, 'Shade');
    await primeWish(page, { wishesCount: 2, sanity: 90 });
    const result = await callSetup(page, 'setup.MonkeyPaw.activate("sanity")');
    expect(result.tier).toBe(2);
    expect(result.sanitySet).toBe(50);
    expect(result.lustDelta).toBe(10);
    expect(result.corrDelta).toBe(0.2);
    expect(result.narrative).toBe("My mind is quiet. Too quiet. My body isn't.");
    expect(await callSetup(page, 'setup.Mc.sanity()')).toBe(50);
    expect(await getVar(page, 'mc.lust')).toBe(10);
    expect(await callSetup(page, 'setup.Mc.tempCorr()')).toBeCloseTo(0.2);
    expect(await callSetup(page, 'setup.MonkeyPaw.wishesLeft()')).toBe(1);
  });

  test('sanity tier 3: pins sanity to 50, +20 lust, +0.4 tempCorr', async ({ game: page }) => {
    await setupHunt(page, 'Shade');
    await primeWish(page, { wishesCount: 1, sanity: 5 });
    const result = await callSetup(page, 'setup.MonkeyPaw.activate("sanity")');
    expect(result.tier).toBe(3);
    expect(result.sanitySet).toBe(50);
    expect(result.lustDelta).toBe(20);
    expect(result.corrDelta).toBe(0.4);
    expect(result.narrative).toBe("Clarity, bought in full. Something else in me is paying it down.");
    expect(await callSetup(page, 'setup.Mc.sanity()')).toBe(50);
    expect(await getVar(page, 'mc.lust')).toBe(20);
    expect(await callSetup(page, 'setup.Mc.tempCorr()')).toBeCloseTo(0.4);
    expect(await callSetup(page, 'setup.MonkeyPaw.wishesLeft()')).toBe(0);
  });

  // --- dawn wish -------------------------------------------------

  test('dawn tier 1: clock jumps to 06:00 (minutes untouched), no tempCorr, ends the hunt', async ({ game: page }) => {
    await setupHunt(page, 'Shade');
    await primeWish(page, { wishesCount: 3 });
    await page.evaluate(() => {
      SugarCube.State.variables.hours = 2;
      SugarCube.State.variables.minutes = 37;
    });
    const result = await callSetup(page, 'setup.MonkeyPaw.activate("dawn")');
    expect(result.tier).toBe(1);
    expect(result.goto).toBe('HuntOverTime');
    expect(result.corrDelta).toBe(0);
    expect(await getVar(page, 'hours')).toBe(6);
    /* The wish only sets the hour -- minutes are left at whatever the
       clock said when the player asked for dawn. */
    expect(await getVar(page, 'minutes')).toBe(37);
    expect(await callSetup(page, 'setup.Mc.tempCorr()')).toBe(0);
    /* The dawn wish ends the hunt synchronously; cleanupRunState's
       resetCursedItemState calls MonkeyPaw.resetHunt() which restores
       wishesCount to 3. The wish was still consumed -- the player just
       sees a fresh-contract paw next time. */
    expect(await callSetup(page, 'setup.MonkeyPaw.wishesLeft()')).toBe(3);
    expect(await callSetup(page, 'setup.HuntController.isActive()')).toBe(false);
  });

  test('dawn tier 2: clock jumps to 06:00, +0.2 corruption (committed via endHunt)', async ({ game: page }) => {
    await setupHunt(page, 'Shade');
    await primeWish(page, { wishesCount: 2 });
    await page.evaluate(() => {
      SugarCube.State.variables.hours = 2;
      SugarCube.State.variables.minutes = 37;
    });
    const result = await callSetup(page, 'setup.MonkeyPaw.activate("dawn")');
    expect(result.tier).toBe(2);
    expect(result.goto).toBe('HuntOverTime');
    expect(result.corrDelta).toBe(0.2);
    expect(await getVar(page, 'hours')).toBe(6);
    expect(await getVar(page, 'minutes')).toBe(37);
    /* huntOverPassage('time') fires endHunt synchronously, which
       commits tempCorr into permanent corruption. Assert the
       post-commit shape (tempCorr drained, corruption banked). */
    expect(await callSetup(page, 'setup.Mc.tempCorr()')).toBe(0);
    expect(await callSetup(page, 'setup.Mc.corruption()')).toBeCloseTo(0.2);
    /* Same as t1: endHunt → resetHunt restores wishesCount. */
    expect(await callSetup(page, 'setup.MonkeyPaw.wishesLeft()')).toBe(3);
    expect(await callSetup(page, 'setup.HuntController.isActive()')).toBe(false);
  });

  test('dawn tier 3: clock jumps to 06:00, +0.4 corruption (committed via endHunt)', async ({ game: page }) => {
    await setupHunt(page, 'Shade');
    await primeWish(page, { wishesCount: 1 });
    await page.evaluate(() => {
      SugarCube.State.variables.hours = 2;
      SugarCube.State.variables.minutes = 37;
    });
    const result = await callSetup(page, 'setup.MonkeyPaw.activate("dawn")');
    expect(result.tier).toBe(3);
    expect(result.goto).toBe('HuntOverTime');
    expect(result.corrDelta).toBe(0.4);
    expect(await getVar(page, 'hours')).toBe(6);
    expect(await getVar(page, 'minutes')).toBe(37);
    expect(await callSetup(page, 'setup.Mc.tempCorr()')).toBe(0);
    expect(await callSetup(page, 'setup.Mc.corruption()')).toBeCloseTo(0.4);
    /* Same as t1/t2: endHunt → resetHunt restores wishesCount. */
    expect(await callSetup(page, 'setup.MonkeyPaw.wishesLeft()')).toBe(3);
    expect(await callSetup(page, 'setup.HuntController.isActive()')).toBe(false);
  });

  // --- knowledge wish --------------------------------------------

  test('knowledge tier 1: removes evidence, routes to GhostProwlEvent, no sanity hit', async ({ game: page }) => {
    await setupHunt(page, 'Shade');
    await primeWish(page, { wishesCount: 3 });
    /* Shade carries [emf, gwb, temperature]; consumeKnowledgeEvidence
       picks one of the missing ones (spiritbox/glass/uvl). */
    await page.evaluate(() => SugarCube.setup.Ghosts.clearChosenEvidence());
    const result = await callSetup(page, 'setup.MonkeyPaw.activate("knowledge")');
    expect(result.tier).toBe(1);
    expect(result.goto).toBe('GhostProwlEvent');
    expect(result.alreadyUsed).toBeUndefined();
    expect(result.sanityDelta).toBe(0);
    expect(result.narrative).toBe(
      "It worked! One evidence has been removed from my diary!<br>Wait...I hear someone's footsteps..."
    );
    expect(await callSetup(page, 'setup.Ghosts.knowledgeUsed()')).toBe(true);
    expect(await callSetup(page, 'setup.Mc.sanity()')).toBe(80);
    expect(['spiritbox', 'glass', 'uvl']).toContain(
      await callSetup(page, 'setup.Ghosts.chosenEvidence()')
    );
    expect(await callSetup(page, 'setup.MonkeyPaw.wishesLeft()')).toBe(2);

    /* Second activation short-circuits without consuming a wish. */
    const wishesBefore = await callSetup(page, 'setup.MonkeyPaw.wishesLeft()');
    const second = await callSetup(page, 'setup.MonkeyPaw.activate("knowledge")');
    expect(second.alreadyUsed).toBe(true);
    expect(second.tier).toBe(0);
    expect(await callSetup(page, 'setup.MonkeyPaw.wishesLeft()')).toBe(wishesBefore);
  });

  test('knowledge tier 2: removes evidence, -15 sanity', async ({ game: page }) => {
    await setupHunt(page, 'Shade');
    await primeWish(page, { wishesCount: 2 });
    await page.evaluate(() => SugarCube.setup.Ghosts.clearChosenEvidence());
    const result = await callSetup(page, 'setup.MonkeyPaw.activate("knowledge")');
    expect(result.tier).toBe(2);
    expect(result.goto).toBe('GhostProwlEvent');
    expect(result.sanityDelta).toBe(-15);
    expect(result.narrative).toBe("The knowledge comes with a voice. It's already in the hallway.");
    expect(await callSetup(page, 'setup.Mc.sanity()')).toBe(65);
    expect(await callSetup(page, 'setup.Ghosts.knowledgeUsed()')).toBe(true);
    expect(['spiritbox', 'glass', 'uvl']).toContain(
      await callSetup(page, 'setup.Ghosts.chosenEvidence()')
    );
    expect(await callSetup(page, 'setup.MonkeyPaw.wishesLeft()')).toBe(1);
  });

  test('knowledge tier 3: removes evidence, -30 sanity', async ({ game: page }) => {
    await setupHunt(page, 'Shade');
    await primeWish(page, { wishesCount: 1 });
    await page.evaluate(() => SugarCube.setup.Ghosts.clearChosenEvidence());
    const result = await callSetup(page, 'setup.MonkeyPaw.activate("knowledge")');
    expect(result.tier).toBe(3);
    expect(result.goto).toBe('GhostProwlEvent');
    expect(result.sanityDelta).toBe(-30);
    expect(result.narrative).toBe("The paw takes my memory and gives me its tenant in trade.");
    expect(await callSetup(page, 'setup.Mc.sanity()')).toBe(50);
    expect(await callSetup(page, 'setup.Ghosts.knowledgeUsed()')).toBe(true);
    expect(['spiritbox', 'glass', 'uvl']).toContain(
      await callSetup(page, 'setup.Ghosts.chosenEvidence()')
    );
    expect(await callSetup(page, 'setup.MonkeyPaw.wishesLeft()')).toBe(0);
  });

  test('knowledge wish never strikes evidence the ghost actually has', async ({ game: page }) => {
    /* The paw's diary edit must be a misdirect, not a freebie -- it
       removes an entry the ghost was never going to leave anyway. */
    await setupHunt(page, 'Shade');
    await primeWish(page, { wishesCount: 3 });
    await page.evaluate(() => SugarCube.setup.Ghosts.clearChosenEvidence());
    await callSetup(page, 'setup.MonkeyPaw.activate("knowledge")');
    const chosen = await callSetup(page, 'setup.Ghosts.chosenEvidence()');
    /* Shade.evidence is [emf, gwb, temperature]; none of these must
       be chosen. */
    expect(['emf', 'gwb', 'temperature']).not.toContain(chosen);
  });

  // --- leave wish ------------------------------------------------

  /* Helper: park the wardrobe in a known fully-clothed shape so the
     leave widget's steal cascade has something to strip. The Wardrobe
     defaults already worn-mark every slot via GameInit, but the
     rememberTopOuter / rememberBottomOuter keys are NOT seeded -- the
     home wardrobe flow normally sets those when the player equips
     anything. Steal* helpers consult those keys, so we seed defaults
     here. */
  async function seedFullOutfit(page) {
    await page.evaluate(() => {
      const V = SugarCube.State.variables;
      const CS = SugarCube.setup.ClothingState;
      V.tshirtState  = CS.WORN; V.tshirtState0  = CS.WORN;
      V.braState     = CS.WORN; V.braState1     = CS.WORN;
      V.jeansState   = CS.WORN; V.jeansState0   = CS.WORN;
      V.pantiesState = CS.WORN; V.pantiesState1 = CS.WORN;
      /* Each WARDROBE_GROUP uses its own rememberVar; stealWornInGroup
         consults that var to know which numbered slot to flip. */
      V.rememberTopOuter    = "tshirt0";  /* tshirt group */
      V.rememberTopUnder    = "bra1";     /* bra group */
      V.rememberBottomOuter = "jeans0";   /* bottomOuter (jeans/shorts/skirt) */
      V.rememberBottomUnder = "panties1"; /* panties group */
      V.isShirtStolen  = false;
      V.isBraStolen    = false;
      V.isJeansStolen  = false;
      V.isShortsStolen = false;
      V.isSkirtStolen  = false;
      V.isBottomStolen = false;
      V.isPantiesStolen = false;
    });
  }

  test('leave tier 1: clothes-stolen flag set, no cursed item, no banned house, hunt stays active', async ({ game: page }) => {
    await setupHunt(page, 'Shade');
    await primeWish(page, { wishesCount: 3 });
    /* Seed a baseline cursed-item state so we can prove t1 did NOT
       touch it. */
    await page.evaluate(() => {
      SugarCube.State.variables.cursedHomeItem = '';
      SugarCube.State.variables.cursedHomeItemActive = false;
    });
    const result = await callSetup(page, 'setup.MonkeyPaw.activate("leave")');
    expect(result.tier).toBe(1);
    expect(result.clothesStolen).toBe(true);
    expect(result.cursedItem).toBeNull();
    expect(result.bannedHouse).toBeNull();
    /* t1 dumps the MC in the yard with the hunt still active -- the
       wish is a tactical reset (modesty gate, lights), not a run
       forfeit. */
    expect(result.goto).toBe('HuntOutside');
    expect(await callSetup(page, 'setup.HuntController.isActive()')).toBe(true);
    expect(await getVar(page, 'cursedHomeItem')).toBe('');
    expect(await getVar(page, 'cursedHomeItemActive')).toBe(false);
    /* Hunt still active, so MonkeyPaw.resetHunt was NOT invoked --
       wishesCount decremented normally. */
    expect(await callSetup(page, 'setup.MonkeyPaw.wishesLeft()')).toBe(2);
  });

  test('leave tier 2: clothes-stolen flag set + cursed home item stamped, hunt stays active', async ({ game: page }) => {
    await setupHunt(page, 'Shade');
    await primeWish(page, { wishesCount: 2 });
    await page.evaluate(() => {
      SugarCube.State.variables.cursedHomeItem = '';
      SugarCube.State.variables.cursedHomeItemActive = false;
    });
    const result = await callSetup(page, 'setup.MonkeyPaw.activate("leave")');
    expect(result.tier).toBe(2);
    expect(result.clothesStolen).toBe(true);
    expect(result.cursedItem).toBeTruthy();
    expect(['tv', 'pc', 'bed', 'shower', 'bath']).toContain(result.cursedItem);
    expect(result.bannedHouse).toBeNull();
    /* Same dump-to-yard as t1; the t2 bite is the cursed item
       waiting at home, not a forfeit. */
    expect(result.goto).toBe('HuntOutside');
    expect(await callSetup(page, 'setup.HuntController.isActive()')).toBe(true);
    /* CursedItems.forceCursedItem() stamps both the id and the active
       flag onto State. */
    expect(await getVar(page, 'cursedHomeItem')).toBe(result.cursedItem);
    expect(await getVar(page, 'cursedHomeItemActive')).toBe(true);
    expect(await callSetup(page, 'setup.MonkeyPaw.wishesLeft()')).toBe(1);
  });

  test('leave tier 3: clothes-stolen flag set + cursed item + banActiveContext called, hunt forfeited', async ({ game: page }) => {
    await setupHunt(page, 'Shade');
    await primeWish(page, { wishesCount: 1 });
    await page.evaluate(() => {
      SugarCube.State.variables.cursedHomeItem = '';
      SugarCube.State.variables.cursedHomeItemActive = false;
    });
    const result = await callSetup(page, 'setup.MonkeyPaw.activate("leave")');
    expect(result.tier).toBe(3);
    expect(result.clothesStolen).toBe(true);
    expect(result.cursedItem).toBeTruthy();
    expect(['tv', 'pc', 'bed', 'shower', 'bath']).toContain(result.cursedItem);
    /* banActiveContext is a no-op stub (runs are one-shot) so
       bannedHouse is null, but the call must still happen without
       throwing. */
    expect(result.bannedHouse).toBeNull();
    /* Tier 3 is the only tier that still forfeits the run -- goto
       is the post-run summary destination, not HuntOutside. */
    expect(result.goto).toBe('CityMap');
    expect(await callSetup(page, 'setup.HuntController.isActive()')).toBe(false);
    expect(await getVar(page, 'cursedHomeItem')).toBe(result.cursedItem);
    expect(await getVar(page, 'cursedHomeItemActive')).toBe(true);
    /* endHunt → cleanupRunState → MonkeyPaw.resetHunt restores
       wishesCount to the fresh-contract default. */
    expect(await callSetup(page, 'setup.MonkeyPaw.wishesLeft()')).toBe(3);
  });

  /* Widget-driven leave tests. The controller's activate("leave")
     stamps the clothesStolen flag but the actual wardrobe strip
     happens in the `<<leave>>` widget in widgetText.tw. Drive the
     widget via jQuery().wiki() and assert the per-slot $is*Stolen
     flags + rememberOuter keys flip. */

  test('leave widget tier 1: strips every worn slot (t1 baseline)', async ({ game: page }) => {
    await setupHunt(page, 'Shade');
    await primeWish(page, { wishesCount: 3 });
    await seedFullOutfit(page);
    /* Sanity-check the baseline: every slot worn, no stolen flags. */
    expect(await callSetup(page, 'setup.Wardrobe.worn(setup.WardrobeSlot.TSHIRT)')).toBe(true);
    expect(await callSetup(page, 'setup.Wardrobe.worn(setup.WardrobeSlot.BRA)')).toBe(true);
    expect(await callSetup(page, 'setup.Wardrobe.worn(setup.WardrobeSlot.JEANS)')).toBe(true);
    expect(await callSetup(page, 'setup.Wardrobe.worn(setup.WardrobeSlot.PANTIES)')).toBe(true);

    await page.evaluate(() => {
      const $div = jQuery('<div></div>');
      $div.wiki('<<leave>>');
    });

    expect(await getVar(page, 'isShirtStolen')).toBe(true);
    expect(await getVar(page, 'isBraStolen')).toBe(true);
    expect(await getVar(page, 'isJeansStolen')).toBe(true);
    expect(await getVar(page, 'isBottomStolen')).toBe(true);
    expect(await getVar(page, 'isPantiesStolen')).toBe(true);
    /* Per-slot state vars flip to "not worn". (The aggregate
       $<slot>State is refreshed lazily by Wardrobe.refreshAggregateStates
       on re-entry; the stolen flags are the canonical post-theft signal.) */
    expect(await getVar(page, 'tshirtState0')).toBe('not worn');
    expect(await getVar(page, 'braState1')).toBe('not worn');
    expect(await getVar(page, 'jeansState0')).toBe('not worn');
    expect(await getVar(page, 'pantiesState1')).toBe('not worn');
    /* remember* keys gain the "no" prefix. */
    expect(await getVar(page, 'rememberTopOuter')).toBe('notshirt0');
    expect(await getVar(page, 'rememberBottomOuter')).toBe('nojeans0');
  });

  test('leave widget tier 2: strips outfit AND forces a cursed home item', async ({ game: page }) => {
    await setupHunt(page, 'Shade');
    await primeWish(page, { wishesCount: 2 });
    await seedFullOutfit(page);
    await page.evaluate(() => {
      SugarCube.State.variables.cursedHomeItem = '';
      SugarCube.State.variables.cursedHomeItemActive = false;
    });

    await page.evaluate(() => {
      const $div = jQuery('<div></div>');
      $div.wiki('<<leave>>');
    });

    expect(await getVar(page, 'isShirtStolen')).toBe(true);
    expect(await getVar(page, 'isBraStolen')).toBe(true);
    expect(await getVar(page, 'isJeansStolen')).toBe(true);
    expect(await getVar(page, 'isBottomStolen')).toBe(true);
    expect(await getVar(page, 'isPantiesStolen')).toBe(true);
    expect(['tv', 'pc', 'bed', 'shower', 'bath']).toContain(await getVar(page, 'cursedHomeItem'));
    expect(await getVar(page, 'cursedHomeItemActive')).toBe(true);
  });

  test('leave widget tier 3: strips outfit + cursed item, hunt cleared', async ({ game: page }) => {
    await setupHunt(page, 'Shade');
    await primeWish(page, { wishesCount: 1 });
    await seedFullOutfit(page);
    await page.evaluate(() => {
      SugarCube.State.variables.cursedHomeItem = '';
      SugarCube.State.variables.cursedHomeItemActive = false;
    });

    await page.evaluate(() => {
      const $div = jQuery('<div></div>');
      $div.wiki('<<leave>>');
    });

    expect(await getVar(page, 'isShirtStolen')).toBe(true);
    expect(await getVar(page, 'isBraStolen')).toBe(true);
    expect(await getVar(page, 'isJeansStolen')).toBe(true);
    expect(await getVar(page, 'isPantiesStolen')).toBe(true);
    expect(['tv', 'pc', 'bed', 'shower', 'bath']).toContain(await getVar(page, 'cursedHomeItem'));
    expect(await getVar(page, 'cursedHomeItemActive')).toBe(true);
    /* The wish ends the hunt regardless of tier. */
    expect(await callSetup(page, 'setup.HuntController.isActive()')).toBe(false);
  });

  test('leave widget only strips currently-worn slots (skirt-out scenario)', async ({ game: page }) => {
    /* If the MC was already topless / bottomless when the wish fires,
       the widget's per-slot worn() check must skip those groups so
       isShirtStolen / isJeansStolen do not gain a false-positive
       stolen marker. */
    await setupHunt(page, 'Shade');
    await primeWish(page, { wishesCount: 3 });
    await seedFullOutfit(page);
    await page.evaluate(() => {
      const V = SugarCube.State.variables;
      const CS = SugarCube.setup.ClothingState;
      V.tshirtState = CS.NOT_WORN; V.tshirtState0 = CS.NOT_WORN;
      V.jeansState  = CS.NOT_WORN; V.jeansState0  = CS.NOT_WORN;
    });

    await page.evaluate(() => {
      const $div = jQuery('<div></div>');
      $div.wiki('<<leave>>');
    });

    /* Already-bare slots stay non-stolen. */
    expect(await getVar(page, 'isShirtStolen')).toBe(false);
    expect(await getVar(page, 'isJeansStolen')).toBe(false);
    /* Slots that were still worn get cleaned out. */
    expect(await getVar(page, 'isBraStolen')).toBe(true);
    expect(await getVar(page, 'isPantiesStolen')).toBe(true);
  });

  test('byInput matches case-insensitively with whitespace trim', async ({ game: page }) => {
    expect(await callSetup(page, 'setup.MonkeyPaw.byInput("activity") && setup.MonkeyPaw.byInput("activity").id')).toBe('activity');
    expect(await callSetup(page, 'setup.MonkeyPaw.byInput("  Activity  ") && setup.MonkeyPaw.byInput("  Activity  ").id')).toBe('activity');
    expect(await callSetup(page, 'setup.MonkeyPaw.byInput("TRAP THE GHOST") && setup.MonkeyPaw.byInput("TRAP THE GHOST").id')).toBe('trapTheGhost');
    expect(await callSetup(page, 'setup.MonkeyPaw.byInput("be sane") && setup.MonkeyPaw.byInput("be sane").id')).toBe('sanity');
    expect(await callSetup(page, 'setup.MonkeyPaw.byInput("notawish")')).toBeNull();
    expect(await callSetup(page, 'setup.MonkeyPaw.byInput("")')).toBeNull();
  });

  test('hasWishes() gates when wishesCount drops to 0', async ({ game: page }) => {
    await page.evaluate(() => SugarCube.setup.MonkeyPaw.resetHunt());
    expect(await callSetup(page, 'setup.MonkeyPaw.hasWishes()')).toBe(true);
    expect(await callSetup(page, 'setup.MonkeyPaw.wishesLeft()')).toBe(3);
    await page.evaluate(() => { SugarCube.State.variables.wishesCount = 0; });
    expect(await callSetup(page, 'setup.MonkeyPaw.hasWishes()')).toBe(false);
  });

  test('rollAnything picks uniformly across the 6 catalogue wishes', async ({ game: page }) => {
    const counts = await page.evaluate(() => {
      const buckets = {};
      let origRandom = Math.random;
      try {
        let i = 0;
        Math.random = () => {
          // cycle through 0, 1/6, 2/6, 3/6, 4/6, 5/6 so each wish gets one hit
          const r = (i % 6) / 6 + 0.001;
          i++;
          return r;
        };
        for (let n = 0; n < 60; n++) {
          const w = SugarCube.setup.MonkeyPaw.rollAnything();
          buckets[w.id] = (buckets[w.id] || 0) + 1;
        }
      } finally {
        Math.random = origRandom;
      }
      return buckets;
    });
    expect(Object.keys(counts).sort()).toEqual(
      ['activity', 'dawn', 'knowledge', 'leave', 'sanity', 'trapTheGhost'].sort()
    );
    for (const id of Object.keys(counts)) {
      expect(counts[id]).toBe(10);
    }
  });

  test('purchaseGuide marks every wish learned, every effect known, and grants anything-wish', async ({ game: page }) => {
    await page.evaluate(() => {
      SugarCube.State.variables.monkeyPawLearned = {};
      SugarCube.State.variables.monkeyPawEffectsKnown = {};
      SugarCube.State.variables.wishAnything = false;
      SugarCube.setup.MonkeyPaw.purchaseGuide();
    });
    for (const id of ['activity', 'trapTheGhost', 'sanity', 'leave', 'knowledge', 'dawn']) {
      expect(await callSetup(page, `setup.MonkeyPaw.isLearned("${id}")`)).toBe(true);
      expect(await callSetup(page, `setup.MonkeyPaw.isEffectKnown("${id}")`)).toBe(true);
    }
    expect(await callSetup(page, 'setup.MonkeyPaw.hasAnything()')).toBe(true);
    expect(await callSetup(page, 'setup.MonkeyPaw.hasGuide()')).toBe(true);
    expect(await callSetup(page, 'setup.MonkeyPaw.hasWishList()')).toBe(true);
  });

  test('purchaseWishList reveals every label but no effects, and does not grant anything-wish', async ({ game: page }) => {
    await page.evaluate(() => {
      SugarCube.State.variables.monkeyPawLearned = {};
      SugarCube.State.variables.monkeyPawEffectsKnown = {};
      SugarCube.State.variables.wishAnything = false;
      SugarCube.setup.MonkeyPaw.purchaseWishList();
    });
    for (const id of ['activity', 'trapTheGhost', 'sanity', 'leave', 'knowledge', 'dawn']) {
      expect(await callSetup(page, `setup.MonkeyPaw.isLearned("${id}")`)).toBe(true);
      expect(await callSetup(page, `setup.MonkeyPaw.isEffectKnown("${id}")`)).toBe(false);
      expect(await callSetup(page, `setup.MonkeyPaw.describe("${id}")`)).toBe(null);
    }
    expect(await callSetup(page, 'setup.MonkeyPaw.hasAnything()')).toBe(false);
    expect(await callSetup(page, 'setup.MonkeyPaw.hasGuide()')).toBe(false);
    expect(await callSetup(page, 'setup.MonkeyPaw.hasWishList()')).toBe(true);
  });

  /* Level gate: the paw is supposed to be invisible (no furniture
     pickups, no witch dialog) below MonkeyPaw.levelRequired. The two
     guarantees below pin both halves -- isDiscoverable goes false even
     when the per-hunt stage is HIDDEN, and HuntController.lootKindsAt
     filters the kind out so a furniture search never surfaces it. */
  test('isDiscoverable returns false when MC is below the level gate', async ({ game: page }) => {
    await page.evaluate(() => SugarCube.setup.MonkeyPaw.resetHunt());
    const req = await callSetup(page, 'setup.MonkeyPaw.levelRequired()');
    await setVar(page, 'mc.lvl', req - 1);
    expect(await callSetup(page, 'setup.MonkeyPaw.isDiscoverable()')).toBe(false);
    await setVar(page, 'mc.lvl', req);
    expect(await callSetup(page, 'setup.MonkeyPaw.isDiscoverable()')).toBe(true);
  });

  test('floor-plan furniture search hides monkeyPaw below level gate', async ({ game: page }) => {
    /* startHunt with a seed known to land monkeyPaw on a furniture
       slot. Below the level gate, HuntController.lootKindsAt() filters
       monkeyPaw out so the player searching that slot finds nothing
       (or the other co-located loot kinds, just not the paw). At/above
       the gate the paw reappears in the same slot. */
    await setVar(page, 'mc.lvl', 1);
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1 }));
    const slot = await page.evaluate(() => {
      const fp = SugarCube.State.variables.run.floorplan;
      return fp.loot.monkeyPaw
        ? { room: fp.loot.monkeyPaw, suffix: fp.lootFurniture.monkeyPaw }
        : null;
    });
    expect(slot).not.toBeNull();
    expect(slot.suffix).toBeTruthy();

    const lockedKinds = await page.evaluate(
      (s) => SugarCube.setup.HuntController.lootKindsAt(s.room, s.suffix),
      slot
    );
    expect(lockedKinds).not.toContain('monkeyPaw');

    const req = await callSetup(page, 'setup.MonkeyPaw.levelRequired()');
    await setVar(page, 'mc.lvl', req);
    const unlockedKinds = await page.evaluate(
      (s) => SugarCube.setup.HuntController.lootKindsAt(s.room, s.suffix),
      slot
    );
    expect(unlockedKinds).toContain('monkeyPaw');
  });

  // --- Cross-cutting invariants ----------------------------------

  test('currentTier() clamps to 3 when wishesCount underflows to 0', async ({ game: page }) => {
    /* The tier formula is max(1, min(3, 4 - wishesLeft)). With
       wishesCount=0 the raw value is 4 -> clamped to 3. The clamp
       guards against weird save states or cheats; activate() must
       still return a well-typed result. */
    await setupHunt(page, 'Shade');
    await page.evaluate(() => SugarCube.setup.MonkeyPaw.resetHunt());
    await page.evaluate(() => { SugarCube.State.variables.wishesCount = 0; });
    expect(await callSetup(page, 'setup.MonkeyPaw.tier()')).toBe(3);
    /* hasWishes() still gates the UI before activate() runs in
       production. But if a caller dodges that gate, activate() still
       returns a tier-3 result rather than throwing. */
    expect(await callSetup(page, 'setup.MonkeyPaw.hasWishes()')).toBe(false);
  });

  test('tier() preview tracks wishesLeft across the full ramp', async ({ game: page }) => {
    /* The "what would the next wish cost?" preview UI calls
       MonkeyPaw.tier() to badge the buttons. Sweep every legal value
       and the underflow case to lock the mapping. */
    await page.evaluate(() => SugarCube.setup.MonkeyPaw.resetHunt());
    const stages = [
      { wishes: 3, expected: 1 },
      { wishes: 2, expected: 2 },
      { wishes: 1, expected: 3 },
      { wishes: 0, expected: 3 } /* clamp */
    ];
    for (const { wishes, expected } of stages) {
      await page.evaluate((w) => { SugarCube.State.variables.wishesCount = w; }, wishes);
      expect(await callSetup(page, 'setup.MonkeyPaw.tier()')).toBe(expected);
    }
  });

  test('activate() does not auto-mark learned or effectKnown', async ({ game: page }) => {
    /* The textbox-input path in MonkeyPaw.tw flips both bits before
       calling activate, because the player chose the wish themselves.
       But the controller's activate() and byInput() are read-only on
       the learned maps -- the UI owns the "did the player live through
       this?" decision. Stays true even after a full firing. */
    await setupHunt(page, 'Shade');
    await primeWish(page, { wishesCount: 3 });
    await page.evaluate(() => {
      SugarCube.State.variables.monkeyPawLearned = {};
      SugarCube.State.variables.monkeyPawEffectsKnown = {};
    });
    await callSetup(page, 'setup.MonkeyPaw.activate("activity")');
    expect(await callSetup(page, 'setup.MonkeyPaw.isLearned("activity")')).toBe(false);
    expect(await callSetup(page, 'setup.MonkeyPaw.isEffectKnown("activity")')).toBe(false);

    /* byInput() is a pure lookup; never mutates. */
    await callSetup(page, 'setup.MonkeyPaw.byInput("activity")');
    expect(await callSetup(page, 'setup.MonkeyPaw.isLearned("activity")')).toBe(false);
    expect(await callSetup(page, 'setup.MonkeyPaw.isEffectKnown("activity")')).toBe(false);
  });

  test('describe() returns null until effectKnown is set, even when learned is true', async ({ game: page }) => {
    /* Wishes-list purchase flips learned but not effectKnown; the menu
       button shows up but the description below it stays hidden. */
    await page.evaluate(() => {
      SugarCube.State.variables.monkeyPawLearned = {};
      SugarCube.State.variables.monkeyPawEffectsKnown = {};
      SugarCube.setup.MonkeyPaw.markLearned("dawn");
    });
    expect(await callSetup(page, 'setup.MonkeyPaw.isLearned("dawn")')).toBe(true);
    expect(await callSetup(page, 'setup.MonkeyPaw.isEffectKnown("dawn")')).toBe(false);
    expect(await callSetup(page, 'setup.MonkeyPaw.describe("dawn")')).toBe(null);

    await page.evaluate(() => SugarCube.setup.MonkeyPaw.markEffectKnown("dawn"));
    expect(await callSetup(page, 'setup.MonkeyPaw.describe("dawn")')).toBe(
      "Morning comes, ready or not. The hunt ends."
    );
  });

  test('resetHunt clears hunt-scoped paw state but preserves learned / guide / anything bits', async ({ game: page }) => {
    /* Cross-hunt persistence guarantee. Buying the guide should not
       evaporate just because a new contract starts. */
    await page.evaluate(() => {
      SugarCube.setup.MonkeyPaw.purchaseGuide();
      SugarCube.State.variables.wishesCount = 1;
      SugarCube.State.variables.MonkeyPawStage = SugarCube.setup.MonkeyPawStage.FOUND;
      SugarCube.setup.Ghosts.markKnowledgeUsed();
      SugarCube.setup.MonkeyPaw.resetHunt();
    });
    /* Hunt-scoped state reset back to fresh-contract defaults. */
    expect(await callSetup(page, 'setup.MonkeyPaw.wishesLeft()')).toBe(3);
    expect(await getVar(page, 'MonkeyPawStage')).toBe(0);
    expect(await callSetup(page, 'setup.Ghosts.knowledgeUsed()')).toBe(false);
    /* Cross-hunt state survives. */
    expect(await callSetup(page, 'setup.MonkeyPaw.hasGuide()')).toBe(true);
    expect(await callSetup(page, 'setup.MonkeyPaw.hasAnything()')).toBe(true);
    for (const id of ['activity', 'trapTheGhost', 'sanity', 'leave', 'knowledge', 'dawn']) {
      expect(await callSetup(page, `setup.MonkeyPaw.isLearned("${id}")`)).toBe(true);
      expect(await callSetup(page, `setup.MonkeyPaw.isEffectKnown("${id}")`)).toBe(true);
    }
  });

  test('every wish in the catalogue is reachable from the WISHES list', async ({ game: page }) => {
    /* Guards against the catalogue silently losing an entry. The six
       ids below match the six widgets, witch-shop guide pages, and
       byInput keywords -- any drift breaks the whole subsystem. */
    const ids = await callSetup(page, 'setup.MonkeyPaw.list().map(function(w){return w.id;})');
    expect(ids.sort()).toEqual(['activity', 'dawn', 'knowledge', 'leave', 'sanity', 'trapTheGhost'].sort());
  });

  test('each wish has a non-empty label + widget + input keyword + description', async ({ game: page }) => {
    /* Schema lint for the catalogue: any wish missing one of these
       fields breaks either the menu render (label/widget) or the
       textbox lookup (input) or the unlocked-description shop perk. */
    const wishes = await callSetup(page, 'setup.MonkeyPaw.list()');
    expect(wishes.length).toBe(6);
    for (const w of wishes) {
      expect(typeof w.id).toBe('string');
      expect(w.id.length).toBeGreaterThan(0);
      expect(typeof w.label).toBe('string');
      expect(w.label.length).toBeGreaterThan(0);
      expect(typeof w.widget).toBe('string');
      expect(w.widget.length).toBeGreaterThan(0);
      expect(typeof w.input).toBe('string');
      expect(w.input.length).toBeGreaterThan(0);
      expect(typeof w.description).toBe('string');
      expect(w.description.length).toBeGreaterThan(0);
    }
  });

  test('Monkey\'s Favor meta-shop unlock does not pre-stamp the paw below level gate', async ({ game: page }) => {
    /* The meta-shop "Monkey's Favor" perk normally hands the player a
       found-paw at hunt start. That hand-off must also respect the
       level gate -- buying the perk early shouldn't smuggle the paw
       into the inventory before LEVEL_REQUIRED. */
    await setVar(page, 'mc.lvl', 1);
    await page.evaluate(() => {
      const id = SugarCube.setup.HuntShop.ShopItem.MONKEYS_FAVOR;
      SugarCube.State.variables.meta = { unlocks: {}, bannedModifiers: [], rerollCharges: 0 };
      SugarCube.State.variables.meta.unlocks[id] = 1;
      SugarCube.setup.MonkeyPaw.resetHunt();
    });
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1 }));
    expect(await callSetup(page, 'setup.MonkeyPaw.isFound()')).toBe(false);

    /* Same setup at level-gate now lets the perk fire. */
    const req = await callSetup(page, 'setup.MonkeyPaw.levelRequired()');
    await setVar(page, 'mc.lvl', req);
    await page.evaluate(() => SugarCube.setup.MonkeyPaw.resetHunt());
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1 }));
    expect(await callSetup(page, 'setup.MonkeyPaw.isFound()')).toBe(true);
  });
});
