const { test, expect } = require('./fixtures');
const { setVar, getVar, callSetup } = require('./helpers');

/* Regression tests for "Brook missing room bug": when a companion's
   Plan2/3/4 mission fails (showComp = ATTACK_FAILED), the game must
   stamp $randomGhostPassage with a real floor-plan room id so the
   per-tick atRandomGhostPassage() redirect can fire CompanionEvent
   when the MC walks into that room.

   Failure modes to defend against:
     1. The single-shot pick path -- pickRandomCompanionRoom flips
        isCompRoomChosen=true BEFORE the pick happens, so any
        early-return (no run, no floorplan, no rooms) locks the
        state with no recorded room. The MC is then unable to find
        the companion anywhere.
     2. Corrupt save: $randomGhostPassage carries a value that
        isn't in the current floor plan (e.g. integer index from
        a pre-floorplan-rebuild save, or a stale id from a prior
        run that didn't get cleaned up). atRandomGhostPassage()
        never matches and the MC can't find the companion.

   Both are recovered by making the picker idempotent + self-healing:
   it only marks isCompRoomChosen=true on a successful pick, and the
   per-tick onPassageReady re-rolls when showComp=ATTACK_FAILED but
   randomGhostPassage is missing/invalid. */
test.describe('Brook missing room bug', () => {
  test('pickRandomCompanionRoom sets randomGhostPassage to a real room id when companion ambushed', async ({ game: page }) => {
    // Setup: start a hunt with Brook on Plan2
    await page.evaluate(() => {
      SugarCube.setup.HuntController.startHunt({ seed: 99, staticHouseId: 'owaissa' });
      SugarCube.setup.HuntController.setField('ghostName', 'Shade');
      SugarCube.setup.HuntController.setField('disguiseName', 'Shade');
      SugarCube.setup.HuntController.cheatSetHuntMode(SugarCube.setup.HuntController.HuntMode.ACTIVE);
      SugarCube.setup.Companion.selectCompanion('Brook');
      SugarCube.State.variables.companion = { name: 'Brook' };
    });

    // Plant Brook on Plan2, force timer elapsed, hidden showComp.
    // Use 02:00 so isMorningPlus() (>= 6) stays false and the post-event
    // tick doesn't reroute us into HuntOverTime.
    await setVar(page, 'chosenPlan', 'Plan2');
    await setVar(page, 'chosenPlanActivated', 1);
    await setVar(page, 'chosenPlanActivatedTime', 60);
    await setVar(page, 'hours', 2);
    await setVar(page, 'minutes', 0);
    const CS = await callSetup(page, 'setup.CompanionShow');
    await setVar(page, 'showComp', CS.HIDDEN);
    await setVar(page, 'chanceToSuccess', 0); // ensure attack fails

    // Verify the precondition: companionAttackActiveHit returns true
    const isHit = await callSetup(page, 'setup.Tick.companionAttackActiveHit()');
    expect(isHit).toBe(true);

    // Trigger the actual code path used at :passagestart
    await page.evaluate(() => {
      if (SugarCube.setup.HuntController.isHunting()
          && SugarCube.setup.Tick.companionAttackActiveHit()
          && SugarCube.setup.Tick.resolveCompanionAttack() === 'hit') {
        SugarCube.setup.Companion.pickRandomCompanionRoomFromContext();
      }
    });

    expect(await getVar(page, 'showComp')).toBe(CS.ATTACK_FAILED);
    expect(await getVar(page, 'isCompRoomChosen')).toBe(true);

    const target = await getVar(page, 'randomGhostPassage');
    expect(target).toBeTruthy();

    // Verify target is a valid room id (not the current room)
    const isValid = await page.evaluate((t) => {
      const run = SugarCube.State.variables.run;
      const allIds = run.floorplan.rooms.map(r => r.id);
      return { isInRooms: allIds.includes(t), current: run.currentRoomId, allIds };
    }, target);
    expect(isValid.isInRooms).toBe(true);
    expect(target).not.toBe(isValid.current);

    // Verify atRandomGhostPassage when MC enters that room
    await page.evaluate((t) => { SugarCube.State.variables.run.currentRoomId = t; }, target);
    await page.evaluate(() => SugarCube.Engine.play('HuntRun'));
    await page.waitForTimeout(200);

    const currentPassage = await page.evaluate(() => SugarCube.State.passage);
    expect(currentPassage).toBe('CompanionEvent');
  });

  /* Regression: a flag-only failure must not lock the picker forever.
     If pickRandomCompanionRoom fails before stamping randomGhostPassage
     (e.g. run.floorplan briefly missing during a load race), the next
     attempt must still produce a real pick. The buggy implementation
     set isCompRoomChosen=true at the top, so a follow-up call would
     no-op and leave the companion permanently lost. */
  test('pickRandomCompanionRoom recovers if the first call could not pick a room', async ({ game: page }) => {
    await page.evaluate(() => {
      SugarCube.setup.HuntController.startHunt({ seed: 99, staticHouseId: 'owaissa' });
      SugarCube.setup.HuntController.setField('ghostName', 'Shade');
      SugarCube.setup.HuntController.cheatSetHuntMode(SugarCube.setup.HuntController.HuntMode.ACTIVE);
      SugarCube.setup.Companion.selectCompanion('Brook');
      SugarCube.State.variables.companion = { name: 'Brook' };
    });

    // Simulate the bad state: showComp says "missing", but the previous
    // attempt left randomGhostPassage unset and isCompRoomChosen=true.
    const CS = await callSetup(page, 'setup.CompanionShow');
    await setVar(page, 'chosenPlan', 'Plan2');
    await setVar(page, 'showComp', CS.ATTACK_FAILED);
    await setVar(page, 'isCompRoomChosen', true);
    await setVar(page, 'randomGhostPassage', 0); // no room assigned

    // Call the picker again -- it must recover and stamp a real room id.
    await callSetup(page, 'setup.Companion.pickRandomCompanionRoom()');

    const target = await getVar(page, 'randomGhostPassage');
    expect(target).toBeTruthy();
    expect(typeof target).toBe('string');

    const isValid = await page.evaluate((t) => {
      const run = SugarCube.State.variables.run;
      const allIds = run.floorplan.rooms.map(r => r.id);
      return allIds.includes(t);
    }, target);
    expect(isValid).toBe(true);
  });

  /* Realistic flow: simulate the click-driven nav in HuntRun. The
     nav link runs the huntTickStep widget (which can <<goto>> off to
     EventMC / StealClothes / GhostProwlEvent) BEFORE the engine plays
     the "HuntRun" link target. The redirect to CompanionEvent must
     still fire once the player lands back on HuntRun standing in the
     picked room. */
  test('walking into the picked room via nav link redirects to CompanionEvent', async ({ game: page }) => {
    await page.evaluate(() => {
      SugarCube.setup.HuntController.startHunt({ seed: 99, staticHouseId: 'owaissa' });
      SugarCube.setup.HuntController.setField('ghostName', 'Shade');
      SugarCube.setup.HuntController.cheatSetHuntMode(SugarCube.setup.HuntController.HuntMode.ACTIVE);
      SugarCube.setup.Companion.selectCompanion('Brook');
      SugarCube.State.variables.companion = { name: 'Brook' };
    });

    // Suppress random event rolls so huntTickEventChain doesn't goto
    // anywhere other than HuntRun on the nav step.
    await page.evaluate(() => { Math.random = () => 0; });

    const CS = await callSetup(page, 'setup.CompanionShow');
    await setVar(page, 'chosenPlan', 'Plan2');
    await setVar(page, 'showComp', CS.ATTACK_FAILED);
    await setVar(page, 'isCompRoomChosen', true);
    await setVar(page, 'hours', 2);
    await setVar(page, 'minutes', 0);

    // Force a known target room that is NOT the spawn (room_0 is hallway).
    await page.evaluate(() => {
      SugarCube.State.variables.run.currentRoomId = 'room_0';
      SugarCube.State.variables.randomGhostPassage = 'room_1';
    });

    // Land on HuntRun first so $return + tick state initialise.
    await page.evaluate(() => SugarCube.Engine.play('HuntRun'));
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => SugarCube.State.passage)).toBe('HuntRun');

    // Now walk into the picked room the same way a nav-link click would:
    // setCurrentRoom -> huntTickStep -> Engine.play('HuntRun').
    await page.evaluate(() => {
      SugarCube.setup.HuntController.setCurrentRoom('room_1');
      SugarCube.setup.HuntController.tick();
      SugarCube.Engine.play('HuntRun');
    });
    await page.waitForTimeout(200);

    expect(await page.evaluate(() => SugarCube.State.passage)).toBe('CompanionEvent');

    // Verify the player visually sees CompanionEvent (not HuntRun) — a
    // :passagestart redirect that flips State.passage but lets the
    // outer enginePlay continue to swap its own DOM in afterwards would
    // pass the State.passage check above while still showing HuntRun to
    // the player. Check the actual rendered passage element.
    const visiblePassage = await page.evaluate(() => {
      var el = document.querySelector('#passages .passage');
      return el ? el.getAttribute('data-passage') : null;
    });
    expect(visiblePassage).toBe('CompanionEvent');
  });

  /* Regression: a save that carries a stale randomGhostPassage (one
     that isn't in the current floor plan) must be repaired the next
     time the tick runs. Otherwise the MC walks into every room and
     nothing happens. */
  test('onPassageReady re-picks when randomGhostPassage points at a room not in this floor plan', async ({ game: page }) => {
    await page.evaluate(() => {
      SugarCube.setup.HuntController.startHunt({ seed: 99, staticHouseId: 'owaissa' });
      SugarCube.setup.HuntController.setField('ghostName', 'Shade');
      SugarCube.setup.HuntController.cheatSetHuntMode(SugarCube.setup.HuntController.HuntMode.ACTIVE);
      SugarCube.setup.Companion.selectCompanion('Brook');
      SugarCube.State.variables.companion = { name: 'Brook' };
    });

    const CS = await callSetup(page, 'setup.CompanionShow');
    await setVar(page, 'chosenPlan', 'Plan2');
    await setVar(page, 'showComp', CS.ATTACK_FAILED);
    await setVar(page, 'isCompRoomChosen', true);
    // Numeric value, as a pre-floorplan-rebuild save would carry.
    await setVar(page, 'randomGhostPassage', 3);
    await setVar(page, 'hours', 2);
    await setVar(page, 'minutes', 0);

    // Calling onPassageReady should detect the mismatch and re-pick.
    await callSetup(page, 'setup.Tick.onPassageReady()');

    const target = await getVar(page, 'randomGhostPassage');
    expect(typeof target).toBe('string');

    const isValid = await page.evaluate((t) => {
      const run = SugarCube.State.variables.run;
      const allIds = run.floorplan.rooms.map(r => r.id);
      return allIds.includes(t);
    }, target);
    expect(isValid).toBe(true);
  });
});
