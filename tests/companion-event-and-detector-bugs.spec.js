const { test, expect } = require('./fixtures');
const { goToPassage, getVar, callSetup } = require('./helpers');

/* Regression coverage for bugs reported on top of the hunt-unification
 * refactor (commit e7b844b0):
 *
 *   1. Companion event lust gain is computed as `stepCount * 3`. The
 *      stepCount bump used to live in widgetHauntedHouseRoom (classic
 *      mode); under the unified hunt nothing called incrementStepCount,
 *      so every CompanionEvent reported "Blake's lust: + 0".
 *
 *   2. widgetFriends.companionExp rendered the raw token `_args[0]`
 *      instead of interpolating the numeric exp, so the player saw
 *      "Blake's exp: + _args[0]". The grant itself worked.
 *
 *   3. The Witch's Paranormal Detector highlights any loot-bearing
 *      furniture in HuntRun. The lootKindsAt scan was kind-agnostic, so
 *      it still highlighted clothesStolen/tarotCards/monkeyPaw pins
 *      whose pickup gates (hasClothesStolen / TarotStage.HIDDEN /
 *      MonkeyPaw.isDiscoverable) had already flipped — the player saw
 *      "highlighted furniture says nothing in it" when they clicked.
 *
 *   4. HuntOverManual prematurely cleared isClothesStolen when the
 *      passage rendered, before the player had picked "Return to the
 *      house" vs "Leave without taking your clothes". Returning to the
 *      house then failed FurnitureSearch's hasClothesStolen guard, so
 *      the stash that was still on the floor plan could never be
 *      recovered. */
test.describe('Companion event + detector regressions', () => {
  test('setCurrentRoom bumps stepCount once per real move', async ({ game }) => {
    await game.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 99 }));
    const initialStep = await getVar(game, 'stepCount');
    expect(initialStep).toBe(0);

    /* Move to a neighbor of the spawn room. */
    const moves = await game.evaluate(() => {
      const fp = SugarCube.State.variables.run.floorplan;
      const spawn = SugarCube.State.variables.run.currentRoomId;
      const neighbors = SugarCube.setup.FloorPlan.neighborsOf(fp, spawn);
      return { spawn, target: neighbors[0] };
    });
    await game.evaluate(rid => SugarCube.setup.HuntController.setCurrentRoom(rid), moves.target);
    expect(await getVar(game, 'stepCount')).toBe(1);

    /* A no-op (same room) must not bump. */
    await game.evaluate(rid => SugarCube.setup.HuntController.setCurrentRoom(rid), moves.target);
    expect(await getVar(game, 'stepCount')).toBe(1);

    /* Walking back home counts as another step. */
    await game.evaluate(rid => SugarCube.setup.HuntController.setCurrentRoom(rid), moves.spawn);
    expect(await getVar(game, 'stepCount')).toBe(2);
  });

  test('companion eventLustGain scales with step count', async ({ game }) => {
    await game.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 12 }));
    await game.evaluate(() => SugarCube.setup.Companion.selectCompanion('Alice'));
    /* stepCount = 0 → lust gain 0 (the bug the user reported). */
    await game.evaluate(() => { SugarCube.State.variables.stepCount = 0; });
    expect(await callSetup(game, 'setup.Companion.eventLustGain()')).toBe(0);

    /* stepCount = 5 → lust gain 15. */
    await game.evaluate(() => { SugarCube.State.variables.stepCount = 5; });
    expect(await callSetup(game, 'setup.Companion.eventLustGain()')).toBe(15);
  });

  test('companionExp widget renders the numeric exp', async ({ game }) => {
    await game.evaluate(() => {
      const V = SugarCube.State.variables;
      V.companion = JSON.parse(JSON.stringify(V.alice));
      SugarCube.setup.Companion.selectCompanion('Alice');
    });
    /* Render the widget into a scratch passage and read the text. */
    const rendered = await game.evaluate(() => {
      const slot = document.createElement('div');
      slot.id = 'companion-exp-test-slot';
      document.body.appendChild(slot);
      try {
        new SugarCube.Wikifier(slot, '<<companionExp 7>>');
        return slot.textContent;
      } finally {
        slot.remove();
      }
    });
    expect(rendered).toMatch(/Alice's exp:\s*\+\s*7/);
    expect(rendered).not.toContain('_args[0]');
  });

  test('detector does NOT highlight a clothesStolen pin once the flag is cleared', async ({ game }) => {
    await game.evaluate(() => SugarCube.setup.HuntController.startHunt({
      seed: 21, floorPlanOpts: { roomCount: 5 }
    }));
    await game.evaluate(() => SugarCube.setup.Witch.buyDetector());

    /* Plant a clothesStolen stash on the floor plan, then drop the flag
       as if the player walked out of the hunt and back. The detector
       must stop highlighting that furniture because the pickup gate is
       closed -- otherwise the player keeps clicking and sees "nothing
       of note". */
    const stash = await game.evaluate(() => {
      SugarCube.setup.HauntedHouses.markClothesStolen();
      return SugarCube.setup.HuntController.stashStolenClothes();
    });
    expect(stash).not.toBeNull();
    /* Confirm the highlight is on while the flag is set. */
    await game.evaluate(rid => SugarCube.setup.HuntController.setCurrentRoom(rid), stash.roomId);
    let kinds = await game.evaluate(s =>
      SugarCube.setup.HuntController.lootKindsAt(s.roomId, s.suffix), stash);
    expect(kinds).toContain('clothesStolen');

    /* Clear the flag. */
    await game.evaluate(() => SugarCube.setup.HauntedHouses.clearStolenClothesFlag());
    kinds = await game.evaluate(s =>
      SugarCube.setup.HuntController.lootKindsAt(s.roomId, s.suffix), stash);
    expect(kinds).not.toContain('clothesStolen');

    /* The currentRoomData() furniture list (consumed by the HuntRun
       template that drives the highlight class) must drop the kind too. */
    const furniture = await callSetup(game, 'setup.HuntController.currentRoomData().furniture');
    const stashSlot = furniture.find(f => f.suffix === stash.suffix);
    expect(stashSlot).toBeTruthy();
    expect(stashSlot.lootKinds).not.toContain('clothesStolen');
  });

  test('beauty round-trips through steal → restore (FindStolenClothes path)', async ({ game }) => {
    /* Dress up tier-1 tshirt + tier-1 bottom + tier-1 panties + tier-1 bra
       through the Wardrobe equip API so the rememberVars are set the
       way real gameplay would. Then steal each in turn and confirm that
       restoring brings beauty back to baseline. */
    await game.evaluate(() => {
      const W = SugarCube.setup.Wardrobe;
      const groups = SugarCube.setup.WARDROBE_GROUPS;
      function eq(groupName, key) {
        const g = groups.find(x => x.name === groupName);
        const item = g.items.find(x => x.key === key);
        SugarCube.State.variables[item.var] = SugarCube.setup.ClothingState.NOT_WORN;
        W.equip(g, item);
      }
      /* Buy + wear each tier-1 slot. */
      eq('tshirt',      'tshirt1');
      eq('bottomOuter', 'jeans1');
      eq('panties',     'panties1');
      eq('bra',         'bra1');
    });
    const baseline = await callSetup(game, 'setup.Mc.beauty()');
    expect(baseline).toBeGreaterThan(0);

    /* Simulate a full strip event: each slot stolen, then each slot
       restored. The remembered key for each group flips to "no<key>"
       and back during the round trip. */
    await game.evaluate(() => {
      const W = SugarCube.setup.Wardrobe;
      W.stealWornInGroup('tshirt',  'tshirtState',  'isShirtStolen');
      W.stealBottomOuter();
      SugarCube.State.variables.isBottomStolen = 1;
      W.stealWornInGroup('panties', 'pantiesState', 'isPantiesStolen');
      W.stealWornInGroup('bra',     'braState',     'isBraStolen');
    });
    const stripped = await callSetup(game, 'setup.Mc.beauty()');
    expect(stripped).toBeLessThan(baseline);

    await game.evaluate(() => {
      const W = SugarCube.setup.Wardrobe;
      const V = SugarCube.State.variables;
      W.restoreStolenInGroup('panties', 'isPantiesStolen');
      W.restoreStolenInGroup('bottomOuter');
      V.isBottomStolen = 0; V.isJeansStolen = 0; V.isShortsStolen = 0; V.isSkirtStolen = 0;
      W.restoreStolenInGroup('tshirt', 'isShirtStolen');
      W.restoreStolenInGroup('bra',    'isBraStolen');
    });
    const restored = await callSetup(game, 'setup.Mc.beauty()');
    expect(restored).toBe(baseline);
  });

  test('HuntOverManual leaves isClothesStolen alone on render so Return-to-house can recover', async ({ game }) => {
    /* Boot a hunt and stamp a stolen-clothes stash. */
    await game.evaluate(() => SugarCube.setup.HuntController.startHunt({
      seed: 31, floorPlanOpts: { roomCount: 5 }
    }));
    await game.evaluate(() => SugarCube.setup.HauntedHouses.markClothesStolen());
    const stash = await game.evaluate(() => SugarCube.setup.HuntController.stashStolenClothes());
    expect(stash).not.toBeNull();

    /* Land on HuntOverManual: the bug was the flag flipping to 0 on
       render, killing FurnitureSearch's gate before the player chose. */
    await goToPassage(game, 'HuntOverManual');
    expect(await getVar(game, 'isClothesStolen')).toBe(1);
  });
});
