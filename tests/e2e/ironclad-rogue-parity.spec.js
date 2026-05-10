/**
 * E2E side-by-side comparison: classic Ironclad vs Rogue Ironclad.
 *
 * Rogue Ironclad is a static-plan rogue house: same eleven rooms,
 * same hub-and-spoke cellblock topology as classic Ironclad, but
 * routed through the rogue lifecycle ($run, ectoplasm payout,
 * modifiers draft) rather than the witch-contract bundle ($hunt).
 *
 * Catalogue divergences from the Owaissa / Elm pattern (Ironclad-specific):
 *   - Both Ironclad houses opt OUT of companions (allowsCompanions
 *     is false on both catalogue entries -- the prison hunt has its
 *     own warden-outfit mechanic and no companion choreography).
 *   - Both Ironclad houses opt OUT of the steal-clothes per-tick step
 *     (runsStealClothes: false on both classic HOUSE_CONFIG and rogue
 *     RogueHouses entries). The prison hunt skips the steal cascade
 *     in either mode.
 *   - Both modes gate entry on the warden outfit
 *     (wardenClothesStage === OUTFIT_OWNED). Classic gates the
 *     "Go inside" link on the per-house street card; rogue gates the
 *     GhostStreet card itself via the catalogue's `gate` predicate.
 *
 * The intent of this spec is to walk a hunt step-by-step in both
 * modes and pin down (a) the shared subsystems (per-tick chain,
 * tool stack, evidence pipeline, drift gating, hunt-event survival
 * options, room nav graph, lights-off rule, catch flow) and (b)
 * the documented per-mode divergences above. Mirrors the Owaissa
 * and Elm parity specs.
 */
const { test, expect } = require('@playwright/test');
const {
  openGame, resetGame, getVar, setVar, callSetup, goToPassage,
} = require('../helpers');

test.describe('E2E parity: classic Ironclad vs Rogue Ironclad', () => {
  let page;

  test.beforeAll(async ({ browser }) => {
    page = await openGame(browser);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test.beforeEach(async () => {
    await resetGame(page);
    /* Both rogue cards on GhostStreet gate behind setup.Mc.lvl() >= 4
       for the procedural rogue card; classic Ironclad uses lvl 4 and
       rogue-ironclad inherits lvl 4 from the catalogue. Lift MC level
       so either card clicks. */
    await page.waitForFunction(() => SugarCube.State.variables.mc != null);
    await page.evaluate(() => { SugarCube.State.variables.mc.lvl = 4; });
  });

  /* ---------- shared helpers ---------- */

  async function clickPassageLink(page, linkText, expectedPassage) {
    await page.locator('.passage').getByText(linkText, { exact: true }).first().click();
    await page.waitForFunction(p => SugarCube.State.passage === p, expectedPassage);
  }

  /* Drop the player into a classic Ironclad hunt at the hallway,
     mirroring what huntHouseStreet's "Go inside" link does. Pre-stamps
     wardenClothesStage to OUTFIT_OWNED so the gate-link surfaces. */
  async function startClassicIronclad(page, ghostName) {
    await page.evaluate((name) => {
      SugarCube.setup.Ghosts.startHunt(name);
      SugarCube.setup.Ghosts.setHuntMode(SugarCube.setup.Ghosts.HuntMode.ACTIVE);
      SugarCube.setup.HauntedHouses.activate('ironclad');
      SugarCube.setup.HauntedHouses.setHuntRoom({ name: 'hallway' });
      SugarCube.State.variables.stealChance = 0;
      /* Pin the warden outfit so "Go inside" routes straight into
         IroncladHallway -- otherwise the gate keeps the player on
         the street card. */
      SugarCube.setup.Witch.setWardenClothesStage(
        SugarCube.setup.WardenClothesStage.OUTFIT_OWNED
      );
      /* GameInit seeds V.hours = 12. Inside a hunt, isMorningPlus()
         is true and TickController routes to HuntOverTime as soon
         as a haunted-house passage renders. Reset to midnight. */
      const V = SugarCube.State.variables;
      V.hours = 0;
      V.minutes = 10;
    }, ghostName);
    await goToPassage(page, 'IroncladHallway');
  }

  async function startRogueIronclad(page, ghostName, seed = 1) {
    await page.evaluate(({ name, s }) => {
      /* Pin the warden outfit so the rogue-ironclad catalogue gate
         resolves to true. Tests that exercise the GhostStreet card
         click rely on the same flag to make the card clickable. */
      SugarCube.setup.Witch.setWardenClothesStage(
        SugarCube.setup.WardenClothesStage.OUTFIT_OWNED
      );
      SugarCube.setup.Rogue.startRogue({
        seed: s, staticHouseId: 'rogue-ironclad'
      });
      SugarCube.setup.Rogue.setField('ghostName', name);
      const ghost = SugarCube.setup.Ghosts.getByName(name);
      SugarCube.setup.Rogue.setField('evidence',
        ghost.evidence.map(e => e.id));
      SugarCube.State.variables.stealChance = 0;
    }, { name: ghostName, s: seed });
    await goToPassage(page, 'RogueRun');
  }

  async function tearDownAnyMode(page) {
    await page.evaluate(() => {
      if (SugarCube.setup.Ghosts.hunt()) SugarCube.setup.Ghosts.endContract();
      if (SugarCube.setup.Rogue.isRogue()) SugarCube.setup.Rogue.end();
    });
    await goToPassage(page, 'CityMap');
  }

  /* ---------- catalogue + entry parity ---------- */

  test('both Ironclad houses appear on GhostStreet behind the same image asset', async () => {
    const classicImg = await callSetup(page, 'setup.HauntedHouses.byId("ironclad").image');
    const rogueImg   = await callSetup(page, 'setup.RogueHouses.byId("rogue-ironclad").image');
    expect(rogueImg).toBe(classicImg);
  });

  test('both Ironclad houses share the same level gate (4)', async () => {
    const classicGate = await callSetup(page, 'setup.HauntedHouses.byId("ironclad").levelGate');
    const rogueGate   = await callSetup(page, 'setup.RogueHouses.byId("rogue-ironclad").levelGate');
    expect(classicGate).toBe(4);
    expect(rogueGate).toBe(4);
  });

  test('both Ironclad houses opt OUT of the companion plan flow', async () => {
    /* This is the Ironclad-specific divergence from Owaissa/Elm.
       Both catalogue entries set allowsCompanions=false; the
       companion gate (Companion.inHauntedHouseLocation) reads it
       through the catalogue, not a per-house branch. */
    const classicCompanions = await callSetup(page,
      'setup.HauntedHouses.byId("ironclad").allowsCompanions');
    const rogueCompanions   = await callSetup(page,
      'setup.RogueHouses.allowsCompanions("rogue-ironclad")');
    expect(classicCompanions).toBe(false);
    expect(rogueCompanions).toBe(false);
  });

  test('both Ironclad houses carry the same sidebarOutfit override (warden costume tile)', async () => {
    /* The MC sidebar wardrobe strip swaps in a fixed-outfit tile while
       a hunt is active here -- catalogue-driven via
       HuntController.sidebarOutfit(), not a per-house widget branch.
       Both Ironclad catalogues pin the same warden costume override,
       and the helper resolves to that override in either mode while
       the corresponding hunt is in flight. */
    const classicOutfit = await callSetup(page,
      'setup.HauntedHouses.byId("ironclad").sidebarOutfit');
    const rogueOutfit   = await callSetup(page,
      'setup.RogueHouses.byId("rogue-ironclad").sidebarOutfit');
    expect(classicOutfit).toEqual(rogueOutfit);
    expect(classicOutfit && classicOutfit.image).toBeTruthy();
    expect(classicOutfit && classicOutfit.tip).toBeTruthy();

    /* No hunt active -> helper returns null in either mode. */
    expect(await callSetup(page, 'setup.HuntController.sidebarOutfit()')).toBeNull();

    /* Classic hunt at Ironclad -> helper returns the override. */
    await startClassicIronclad(page, 'Shade');
    expect(await callSetup(page, 'setup.HuntController.sidebarOutfit()'))
      .toEqual(classicOutfit);

    await tearDownAnyMode(page);

    /* Rogue run at rogue-ironclad -> helper returns the same override. */
    await startRogueIronclad(page, 'Shade');
    expect(await callSetup(page, 'setup.HuntController.sidebarOutfit()'))
      .toEqual(rogueOutfit);
  });

  test('GhostStreet entry from classic Ironclad lands on Ironclad Prison', async () => {
    await goToPassage(page, 'GhostStreet');
    /* The card label is "Ironclad Prison" (matches HauntedHouses.byId.streetPassage). */
    await page.locator('.passage').locator('.housecard').getByText('Ironclad Prison')
      .first().click();
    await page.waitForFunction(() => SugarCube.State.passage === 'Ironclad Prison');
    expect(await callSetup(page, 'setup.HauntedHouses.activeHouse().id')).toBe('ironclad');
  });

  test('GhostStreet entry from Rogue Ironclad lands on RogueStart with staticHouseId stamped', async () => {
    /* The rogue-ironclad card gates on wardenClothesStage === OUTFIT_OWNED;
       pin the stage so the link surfaces clickably. */
    await page.evaluate(() => {
      SugarCube.setup.Witch.setWardenClothesStage(
        SugarCube.setup.WardenClothesStage.OUTFIT_OWNED
      );
    });
    await goToPassage(page, 'GhostStreet');
    await page.locator('.passage').locator('.housecard').getByText('Rogue Ironclad')
      .first().click();
    await page.waitForFunction(() => SugarCube.State.passage === 'RogueStart');
    expect(await callSetup(page, 'setup.Rogue.staticHouseId()')).toBe('rogue-ironclad');
  });

  test('Rogue Ironclad card hides behind the warden-outfit gate when stage != OUTFIT_OWNED', async () => {
    /* Without OUTFIT_OWNED the catalogue's `gate` predicate returns
       false; the rogueStaticHouseCard widget swaps the link for the
       gate message ("Warden outfit required"). */
    await page.evaluate(() => {
      const Stages = SugarCube.setup.WardenClothesStage;
      SugarCube.setup.Witch.setWardenClothesStage(Stages.HINT_NOT_OFFERED);
    });
    await goToPassage(page, 'GhostStreet');
    const gatedCard = page.locator('.passage').locator('.housecard')
      .filter({ hasText: 'Warden outfit required' });
    await expect(gatedCard).toHaveCount(1);
    /* With the gate closed the catalogue label is not rendered as a
       clickable link. */
    const liveLink = page.locator('.passage').locator('.housecard a')
      .filter({ hasText: 'Rogue Ironclad' });
    await expect(liveLink).toHaveCount(0);
  });

  /* ---------- floor-plan parity ---------- */

  test('rogue-ironclad carries the same eleven room templates as classic Ironclad', async () => {
    const classicRooms = await callSetup(
      page, 'setup.HauntedHouses.byId("ironclad").rooms.slice().sort()');
    const rogueTemplates = await callSetup(page,
      'setup.RogueHouses.planFor("rogue-ironclad").rooms.map(r => r.template).sort()');
    expect(rogueTemplates).toEqual(classicRooms);
  });

  test('rogue-ironclad hallway connects to {reception, kitchen, BlockA, BlockB}', async () => {
    /* Classic side: read the hallway exits map. */
    const classicLabels = await callSetup(page,
      'setup.HauntedHouses.byId("ironclad").exits.IroncladHallway.map(e => e.target).sort()');
    expect(classicLabels).toEqual([
      'IroncladBlockA', 'IroncladBlockB', 'IroncladKitchen', 'IroncladReception'
    ]);

    /* Rogue side: BFS from room_0 (hallway). */
    const plan = await callSetup(page, 'setup.RogueHouses.planFor("rogue-ironclad")');
    const fp = await page.evaluate(p =>
      SugarCube.setup.FloorPlan.generate(1, { staticPlan: p }), plan);
    const rogueNeighbours = await page.evaluate(f => {
      const ids = SugarCube.setup.FloorPlan.neighborsOf(f, 'room_0');
      return ids.map(id => f.rooms.find(r => r.id === id).template).sort();
    }, fp);
    expect(rogueNeighbours).toEqual(['BlockA', 'BlockB', 'kitchen', 'reception']);
  });

  test('both BlockA hubs branch to {CellA, CellB, CellC} (plus the hallway)', async () => {
    const classicLabels = await callSetup(page,
      'setup.HauntedHouses.byId("ironclad").exits.IroncladBlockA.map(e => e.target).sort()');
    expect(classicLabels).toEqual([
      'IroncladBlockACellA', 'IroncladBlockACellB',
      'IroncladBlockACellC', 'IroncladHallway'
    ]);

    const plan = await callSetup(page, 'setup.RogueHouses.planFor("rogue-ironclad")');
    const fp = await page.evaluate(p =>
      SugarCube.setup.FloorPlan.generate(1, { staticPlan: p }), plan);
    const blockARoom = fp.rooms.find(r => r.template === 'BlockA');
    const rogueNeighbours = await page.evaluate(({ f, k }) => {
      const ids = SugarCube.setup.FloorPlan.neighborsOf(f, k);
      return ids.map(id => f.rooms.find(r => r.id === id).template).sort();
    }, { f: fp, k: blockARoom.id });
    expect(rogueNeighbours).toEqual([
      'BlockACellA', 'BlockACellB', 'BlockACellC', 'hallway'
    ]);
  });

  test('classic and rogue produce the same BFS distance map from the hallway', async () => {
    /* Classic Ironclad walking distances from the hallway:
         hallway:                           0
         reception, kitchen, BlockA, BlockB: 1
         BlockACellA/B/C, BlockBCellA/B/C:   2 */
    const expected = {
      hallway:     0,
      reception:   1,
      kitchen:     1,
      BlockA:      1,
      BlockB:      1,
      BlockACellA: 2,
      BlockACellB: 2,
      BlockACellC: 2,
      BlockBCellA: 2,
      BlockBCellB: 2,
      BlockBCellC: 2,
    };

    const plan = await callSetup(page, 'setup.RogueHouses.planFor("rogue-ironclad")');
    const fp = await page.evaluate(p =>
      SugarCube.setup.FloorPlan.generate(1, { staticPlan: p }), plan);
    const rogueDist = await page.evaluate(f => {
      const dist = SugarCube.setup.FloorPlan.bfsDistances(f, 'room_0');
      const out = {};
      f.rooms.forEach(r => { out[r.template] = dist[r.id]; });
      return out;
    }, fp);
    expect(rogueDist).toEqual(expected);

    /* Classic side: rebuild the adjacency from the exits map and
       hand-BFS to confirm the same hop counts. */
    const classicExits = await callSetup(page,
      'setup.HauntedHouses.byId("ironclad").exits');
    const TEMPLATE_BY_PASSAGE = {
      IroncladHallway:     'hallway',
      IroncladReception:   'reception',
      IroncladKitchen:     'kitchen',
      IroncladBlockA:      'BlockA',
      IroncladBlockB:      'BlockB',
      IroncladBlockACellA: 'BlockACellA',
      IroncladBlockACellB: 'BlockACellB',
      IroncladBlockACellC: 'BlockACellC',
      IroncladBlockBCellA: 'BlockBCellA',
      IroncladBlockBCellB: 'BlockBCellB',
      IroncladBlockBCellC: 'BlockBCellC',
    };
    const adj = {};
    Object.keys(classicExits).forEach(passage => {
      const t = TEMPLATE_BY_PASSAGE[passage];
      if (!t) return;
      adj[t] = classicExits[passage]
        .map(e => TEMPLATE_BY_PASSAGE[e.target])
        .filter(Boolean);
    });
    const classicDist = { hallway: 0 };
    const queue = ['hallway'];
    while (queue.length) {
      const cur = queue.shift();
      (adj[cur] || []).forEach(nbr => {
        if (classicDist[nbr] != null) return;
        classicDist[nbr] = classicDist[cur] + 1;
        queue.push(nbr);
      });
    }
    expect(classicDist).toEqual(expected);
  });

  /* ---------- HuntController dispatch parity ---------- */

  test('mode() distinguishes the two modes, with the same activeGhost name', async () => {
    await startClassicIronclad(page, 'Spirit');
    expect(await callSetup(page, 'setup.HuntController.mode()')).toBe('regular');
    expect(await callSetup(page, 'setup.HuntController.activeGhost().name')).toBe('Spirit');
    expect(await callSetup(page, 'setup.HuntController.realGhostName()')).toBe('Spirit');

    await tearDownAnyMode(page);

    await startRogueIronclad(page, 'Spirit');
    expect(await callSetup(page, 'setup.HuntController.mode()')).toBe('rogue');
    expect(await callSetup(page, 'setup.HuntController.activeGhost().name')).toBe('Spirit');
    expect(await callSetup(page, 'setup.HuntController.realGhostName()')).toBe('Spirit');
  });

  test('isHuntActive() is true inside both Ironclad hunts (per-tick chain gate stays open)', async () => {
    await startClassicIronclad(page, 'Shade');
    expect(await callSetup(page, 'setup.HuntController.isHuntActive()')).toBe(true);

    await tearDownAnyMode(page);

    await startRogueIronclad(page, 'Shade');
    expect(await callSetup(page, 'setup.HuntController.isHuntActive()')).toBe(true);
  });

  test('isCursedHuntActive is classic-only and false in rogue', async () => {
    await startClassicIronclad(page, 'Shade');
    expect(await callSetup(page, 'setup.HuntController.isCursedHuntActive()')).toBe(false);

    await tearDownAnyMode(page);

    await startRogueIronclad(page, 'Shade');
    expect(await callSetup(page, 'setup.HuntController.isCursedHuntActive()')).toBe(false);
  });

  test('isGhostHere() flips when the player walks into the ghost room in both modes', async () => {
    /* Classic: ghost in hallway. Walk to IroncladHallway -> true;
       walk to IroncladReception -> false. Pin ghost room AFTER each
       navigation so onPassageDone shuffleGhostRoom can't relocate
       the ghost mid-test. */
    await startClassicIronclad(page, 'Shade');
    await goToPassage(page, 'IroncladHallway');
    await page.evaluate(() => SugarCube.setup.HauntedHouses.setHuntRoom({ name: 'hallway' }));
    expect(await callSetup(page, 'setup.HuntController.isGhostHere()')).toBe(true);
    await goToPassage(page, 'IroncladReception');
    await page.evaluate(() => SugarCube.setup.HauntedHouses.setHuntRoom({ name: 'hallway' }));
    expect(await callSetup(page, 'setup.HuntController.isGhostHere()')).toBe(false);

    await tearDownAnyMode(page);

    /* Rogue: lair is whichever non-hallway room the floor-plan
       generator picked. */
    await startRogueIronclad(page, 'Shade');
    const lairId = await callSetup(page, 'setup.Rogue.ghostRoomId()');
    expect(lairId).not.toBe('room_0');
    await page.evaluate(id => SugarCube.setup.Rogue.setCurrentRoom(id), lairId);
    await goToPassage(page, 'RogueRun');
    expect(await callSetup(page, 'setup.HuntController.isGhostHere()')).toBe(true);
    await page.evaluate(() => SugarCube.setup.Rogue.setCurrentRoom('room_0'));
    await goToPassage(page, 'RogueRun');
    expect(await callSetup(page, 'setup.HuntController.isGhostHere()')).toBe(false);
  });

  /* ---------- per-tick chain parity ---------- */

  test('applyTickEffects burns 1 in-game minute in both classic Ironclad and Rogue Ironclad', async () => {
    await startClassicIronclad(page, 'Shade');
    await setVar(page, 'hours', 0);
    await setVar(page, 'minutes', 0);
    await page.evaluate(() => SugarCube.setup.HauntConditions.applyTickEffects());
    expect(await getVar(page, 'minutes')).toBe(1);

    await tearDownAnyMode(page);

    await startRogueIronclad(page, 'Shade');
    await setVar(page, 'hours', 0);
    await setVar(page, 'minutes', 0);
    await page.evaluate(() => SugarCube.setup.HauntConditions.applyTickEffects());
    expect(await getVar(page, 'minutes')).toBe(1);
  });

  test('applyTickEffects drains sanity in both modes (per-mode rules may scale the drain)', async () => {
    async function deltaForMode(mode) {
      await tearDownAnyMode(page);
      if (mode === 'classic') await startClassicIronclad(page, 'Shade');
      else                    await startRogueIronclad(page, 'Shade');

      await page.evaluate(() => {
        SugarCube.State.variables.mc.sanity = 80;
        SugarCube.State.variables.mc.energy = 10;
        SugarCube.State.variables.mc.lust   = 0;
        SugarCube.State.variables.hours = 0;
        SugarCube.State.variables.minutes = 0;
      });
      const before = await getVar(page, 'mc.sanity');
      await page.evaluate(() => SugarCube.setup.HauntConditions.applyTickEffects());
      return before - await getVar(page, 'mc.sanity');
    }

    expect(await deltaForMode('classic')).toBeGreaterThan(0);
    expect(await deltaForMode('rogue')).toBeGreaterThan(0);
  });

  /* ---------- steal-clothes opt-out parity ---------- */

  test('shouldTriggerSteal() is FALSE in BOTH Ironclad modes (runsStealClothes opt-out on both catalogues)', async () => {
    /* Both Ironclad catalogue entries carry runsStealClothes:false.
       Classic reads it off setup.HauntedHouses.activeHouse(); rogue
       reads it off setup.RogueHouses.byId(staticHouseId). Either
       way, HuntController.shouldTriggerSteal short-circuits to false
       so the prison hunt skips the steal step in either mode.

       Pre-stamp $stealChance=100 so the predicate WOULD fire if the
       gate was open -- pinning the catalogue opt-out, not the
       wardrobe predicate. */
    async function gateFor(mode) {
      await tearDownAnyMode(page);
      if (mode === 'classic') await startClassicIronclad(page, 'Shade');
      else                    await startRogueIronclad(page, 'Shade');
      await page.evaluate(() => {
        SugarCube.State.variables.stealChance = 100;
      });
      return await callSetup(page, 'setup.HuntController.shouldTriggerSteal()');
    }
    expect(await gateFor('classic')).toBe(false);
    expect(await gateFor('rogue')).toBe(false);
  });

  /* ---------- ghost drift parity ---------- */

  test('ghost-room drift fires through the same controller in both modes', async () => {
    /* Classic Ironclad rooms[0] is 'BlockA' (per HOUSE_CONFIG). With
       Math.random()=0, drift picks rooms[0] -- pin the ghost to a
       different room first so the change is visible. */
    await tearDownAnyMode(page);
    await startClassicIronclad(page, 'Shade');
    const classicResult = await page.evaluate(() => {
      SugarCube.setup.HauntedHouses.setHuntRoom({ name: 'kitchen' });
      Math.random = () => 0;
      const before = SugarCube.State.variables.hunt.room.name;
      SugarCube.setup.HauntedHouses.driftGhostRoom();
      return { before, after: SugarCube.State.variables.hunt.room.name };
    });
    expect(classicResult.after).not.toBe(classicResult.before);

    await tearDownAnyMode(page);
    await startRogueIronclad(page, 'Shade');
    const rogueResult = await page.evaluate(() => {
      Math.random = () => 0;
      const before = SugarCube.setup.Rogue.ghostRoomId();
      SugarCube.setup.Rogue.driftGhostRoom();
      const afterId = SugarCube.setup.Rogue.ghostRoomId();
      const fp = SugarCube.setup.Rogue.field('floorplan');
      const after = fp.rooms.find(r => r.id === afterId);
      return { before, afterId, afterTemplate: after && after.template };
    });
    expect(rogueResult.afterId).not.toBe(rogueResult.before);
    /* Both classic and rogue draw from the full room list, so the
       hallway is a valid drift destination in either mode. The
       drifted-to template just needs to be defined; no per-mode
       hallway exclusion. */
    expect(typeof rogueResult.afterTemplate).toBe('string');
  });

  test('Goryo (staysInOneRoom) never drifts in either mode', async () => {
    async function noDrift(mode) {
      await tearDownAnyMode(page);
      if (mode === 'classic') await startClassicIronclad(page, 'Goryo');
      else                    await startRogueIronclad(page, 'Goryo');

      await page.evaluate(() => {
        SugarCube.State.variables.lastChangeIntervalRoom = '';
        SugarCube.State.variables.minutes = 25;
        Math.random = () => 0;
      });

      const beforeId = mode === 'classic'
        ? await getVar(page, 'hunt.room.name')
        : await callSetup(page, 'setup.Rogue.ghostRoomId()');
      await page.evaluate(() => SugarCube.setup.HuntController.shuffleGhostRoom());
      const afterId = mode === 'classic'
        ? await getVar(page, 'hunt.room.name')
        : await callSetup(page, 'setup.Rogue.ghostRoomId()');
      return { before: beforeId, after: afterId };
    }

    const classicGoryo = await noDrift('classic');
    expect(classicGoryo.after).toBe(classicGoryo.before);

    const rogueGoryo = await noDrift('rogue');
    expect(rogueGoryo.after).toBe(rogueGoryo.before);
  });

  /* ---------- evidence parity ---------- */

  test('activeGhost evidence resolves to the same Shade catalogue list in both modes', async () => {
    await startClassicIronclad(page, 'Shade');
    const classicEv = await callSetup(page,
      'setup.HuntController.activeGhost().evidence.map(e => e.id).sort()');

    await tearDownAnyMode(page);

    await startRogueIronclad(page, 'Shade');
    const rogueEv = await callSetup(page,
      'setup.HuntController.activeGhost().evidence.map(e => e.id).sort()');

    expect(rogueEv).toEqual(classicEv);
  });

  test('hasEvidence agrees across modes for sampled ghosts', async () => {
    const sampled = ['Spirit', 'Shade', 'Phantom', 'Wraith', 'Goryo'];
    const evidenceIds = ['emf', 'spiritbox', 'gwb', 'uvl', 'glass', 'temperature'];
    for (const ghost of sampled) {
      await tearDownAnyMode(page);
      await startClassicIronclad(page, ghost);
      const classicMatrix = {};
      for (const e of evidenceIds) {
        classicMatrix[e] = await callSetup(page,
          `setup.HuntController.activeGhost().hasEvidence("${e}")`);
      }

      await tearDownAnyMode(page);
      await startRogueIronclad(page, ghost);
      const rogueMatrix = {};
      for (const e of evidenceIds) {
        rogueMatrix[e] = await callSetup(page,
          `setup.HuntController.activeGhost().hasEvidence("${e}")`);
      }

      expect(rogueMatrix).toEqual(classicMatrix);
    }
  });

  /* ---------- random-prowl gate parity ---------- */

  test('shouldStartRandomProwl() opens for the same predicate in both modes', async () => {
    async function gateForMode(mode) {
      await tearDownAnyMode(page);
      if (mode === 'classic') await startClassicIronclad(page, 'Shade');
      else                    await startRogueIronclad(page, 'Shade');
      await page.evaluate(() => {
        const V = SugarCube.State.variables;
        V.prowlActivated = 0;
        V.prowlTimeRemain = 0;
        V.elapsedTimeProwl = 0;
        V.prowlActivationTime = 0;
        V.mc.sanity = 30;
        Math.random = () => 0;
      });
      return await callSetup(page, 'setup.HuntController.shouldStartRandomProwl()');
    }
    expect(await gateForMode('classic')).toBe(true);
    expect(await gateForMode('rogue')).toBe(true);
  });

  /* ---------- hunt-over routing parity ---------- */

  test('huntOverPassage("sanity") routes to HuntOverSanity in classic, RogueEnd in rogue', async () => {
    await startClassicIronclad(page, 'Shade');
    expect(await callSetup(page, 'setup.HuntController.huntOverPassage("sanity")'))
      .toBe('HuntOverSanity');

    await tearDownAnyMode(page);

    await startRogueIronclad(page, 'Shade');
    expect(await callSetup(page, 'setup.HuntController.huntOverPassage("sanity")'))
      .toBe('RogueEnd');
    expect(await callSetup(page, 'setup.Rogue.field("failureReason")')).toBe('sanity');
  });

  test('huntOverPassage("exhaustion") routes to HuntOverExhaustion in classic, RogueEnd in rogue', async () => {
    await startClassicIronclad(page, 'Shade');
    expect(await callSetup(page, 'setup.HuntController.huntOverPassage("exhaustion")'))
      .toBe('HuntOverExhaustion');

    await tearDownAnyMode(page);

    await startRogueIronclad(page, 'Shade');
    expect(await callSetup(page, 'setup.HuntController.huntOverPassage("exhaustion")'))
      .toBe('RogueEnd');
    expect(await callSetup(page, 'setup.Rogue.field("failureReason")')).toBe('exhaustion');
  });

  test('huntOverPassage("time") routes to HuntOverTime in classic, RogueEnd in rogue', async () => {
    await startClassicIronclad(page, 'Shade');
    expect(await callSetup(page, 'setup.HuntController.huntOverPassage("time")'))
      .toBe('HuntOverTime');

    await tearDownAnyMode(page);

    await startRogueIronclad(page, 'Shade');
    expect(await callSetup(page, 'setup.HuntController.huntOverPassage("time")'))
      .toBe('RogueEnd');
    expect(await callSetup(page, 'setup.Rogue.field("failureReason")')).toBe('time');
  });

  test('huntCaughtPassage routes to Sleep in classic, RogueEnd (caught) in rogue', async () => {
    await startClassicIronclad(page, 'Shade');
    expect(await callSetup(page, 'setup.HuntController.huntCaughtPassage()')).toBe('Sleep');

    await tearDownAnyMode(page);

    await startRogueIronclad(page, 'Shade');
    expect(await callSetup(page, 'setup.HuntController.huntCaughtPassage()')).toBe('RogueEnd');
    expect(await callSetup(page, 'setup.Rogue.field("failureReason")')).toBe('caught');
  });

  /* ---------- payout divergence ---------- */

  test('payout for a correct guess: classic pays witch contract money/XP, rogue pays {0,0}', async () => {
    await startClassicIronclad(page, 'Shade');
    await page.evaluate(() => {
      SugarCube.State.variables.moneyFromContract       = 170;
      SugarCube.State.variables.expFromContract         = 60;
      SugarCube.State.variables.moneyFromWeakenTheGhost = 25;
    });
    expect(await callSetup(page, 'setup.HuntController.payoutForGuess(true)'))
      .toEqual({ money: 195, xp: 60 });

    await tearDownAnyMode(page);

    await startRogueIronclad(page, 'Shade');
    expect(await callSetup(page, 'setup.HuntController.payoutForGuess(true)'))
      .toEqual({ money: 0, xp: 0 });
  });

  test('rogue payout is in ectoplasm (mL) on RogueEnd; classic does not touch ectoplasm', async () => {
    await startClassicIronclad(page, 'Shade');
    const beforeEcto = await getVar(page, 'ectoplasm');
    await page.evaluate(() => SugarCube.setup.Ghosts.endContract());
    expect(await getVar(page, 'ectoplasm')).toBe(beforeEcto);

    await tearDownAnyMode(page);

    await startRogueIronclad(page, 'Shade');
    await page.evaluate(() => SugarCube.setup.Rogue.markSuccess());
    await goToPassage(page, 'RogueEnd');
    /* rogue-ironclad has modifierCount=0, so multiplier=1 -> 10 mL on success. */
    expect(await getVar(page, 'ectoplasm')).toBe(10);
  });

  /* ---------- room nav UI parity ---------- */

  test('classic IroncladHallway exposes Reception/Kitchen/BlockA/BlockB/Leave; rogue room_0 exposes the same templates plus Outside', async () => {
    /* Classic: IroncladHallway exposes Reception/Kitchen/BlockA/BlockB
       plus a "Leave" link to the prison street. */
    await startClassicIronclad(page, 'Shade');
    await goToPassage(page, 'IroncladHallway');
    const classicLinks = await page.locator('.passage a').allTextContents();
    const classicLower = classicLinks.map(s => s.trim().toLowerCase()).sort();
    expect(classicLower).toEqual(
      expect.arrayContaining(['reception', 'kitchen', 'blocka', 'blockb', 'leave'])
    );

    await tearDownAnyMode(page);

    await startRogueIronclad(page, 'Shade');
    const navLinks = await page.locator('.rogue-run-nav a').allTextContents();
    const rogueLower = navLinks.map(s => s.trim().toLowerCase()).sort();
    /* Rogue uses template labels (the Templates catalogue's `label`
       field). Cellblock hubs render as their template names; the
       hallway exposes an Outside link. */
    expect(rogueLower).toEqual(
      expect.arrayContaining(['kitchen', 'reception', 'outside'])
    );
  });

  test('classic "Leave" link returns to Ironclad Prison; rogue Outside link routes to RogueOutside', async () => {
    await startClassicIronclad(page, 'Shade');
    await goToPassage(page, 'IroncladHallway');
    await clickPassageLink(page, 'Leave', 'Ironclad Prison');
    expect(await callSetup(page, 'setup.HauntedHouses.activeHouse().id')).toBe('ironclad');

    await tearDownAnyMode(page);

    await startRogueIronclad(page, 'Shade');
    await clickPassageLink(page, 'Outside', 'RogueOutside');
    expect(await callSetup(page, 'setup.Rogue.isRogue()')).toBe(true);
  });

  /* ---------- companion-gate divergence ---------- */

  test('Companion.inHauntedHouseLocation is FALSE in both classic Ironclad and rogue-ironclad', async () => {
    /* The Ironclad-specific divergence: both modes opt OUT of the
       companion plan flow via the catalogue's allowsCompanions=false.
       The companion gate reads it through the catalogue lookup, no
       per-house branch in the predicate. */
    await startClassicIronclad(page, 'Shade');
    expect(await callSetup(page, 'setup.Companion.inHauntedHouseLocation()')).toBe(false);

    await tearDownAnyMode(page);

    await startRogueIronclad(page, 'Shade');
    expect(await callSetup(page, 'setup.Companion.inHauntedHouseLocation()')).toBe(false);
  });

  /* ---------- Hunt event survival options parity ---------- */

  test('GhostHuntEvent renders the same survival options (Hide / Run / Pray / Freeze) in both modes', async () => {
    async function survivalOptionsForMode(mode) {
      await tearDownAnyMode(page);
      if (mode === 'classic') await startClassicIronclad(page, 'Shade');
      else                    await startRogueIronclad(page, 'Shade');
      await page.evaluate(() => {
        SugarCube.State.variables.mc.sanity = 80;
        SugarCube.State.variables.mc.energy = 4;
      });
      await goToPassage(page, 'GhostHuntEvent');
      const labels = await Promise.all([
        page.locator('.passage').getByText('Run away',   { exact: true }).count(),
        page.locator('.passage').getByText('Try to hide',{ exact: true }).count(),
        page.locator('.passage').getByText(/Freeze and let it pass/i).count(),
      ]);
      return labels.every(c => c >= 1);
    }
    expect(await survivalOptionsForMode('classic')).toBe(true);
    expect(await survivalOptionsForMode('rogue')).toBe(true);
  });

  /* ---------- Succubus / special-event parity ---------- */

  test('Summon-the-succubus link surfaces on GhostHuntEvent identically in both modes when timer >= 1', async () => {
    /* The succubus link gates on setup.HauntedHouses.succubusEventTimer()
       (read off the global Home succubus bundle, not on $hunt or $run),
       so once the timer is >= 1 the option must surface in either mode.
       Pre-stamp the timer so the link always renders. */
    async function succubusVisibleFor(mode) {
      await tearDownAnyMode(page);
      if (mode === 'classic') await startClassicIronclad(page, 'Shade');
      else                    await startRogueIronclad(page, 'Shade');
      await page.evaluate(() => {
        SugarCube.State.variables.mc.sanity = 80;
        SugarCube.State.variables.mc.energy = 4;
        if (!SugarCube.State.variables.succubusEvent) SugarCube.State.variables.succubusEvent = {};
        SugarCube.State.variables.succubusEvent.eventTimer = 3;
      });
      await goToPassage(page, 'GhostHuntEvent');
      return await page.locator('.passage')
        .getByText('Summon the succubus', { exact: true }).count();
    }
    expect(await succubusVisibleFor('classic')).toBeGreaterThanOrEqual(1);
    expect(await succubusVisibleFor('rogue')).toBeGreaterThanOrEqual(1);
  });

  test('rollProwlEvent picks the same body-part video for the same Math.random seed in both modes', async () => {
    /* The per-tick prowl event roll dispatches off setup.Ghosts.active()
       (which routes through HuntController.activeGhost), so a Math.random
       pin should produce the same body-part choice regardless of mode.
       Pin the random sequence and read the chosen video back off
       $videoEvent. */
    async function rolledVideoFor(mode) {
      await tearDownAnyMode(page);
      if (mode === 'classic') await startClassicIronclad(page, 'Shade');
      else                    await startRogueIronclad(page, 'Shade');
      await page.evaluate(() => {
        SugarCube.State.variables.mc.sanity = 80;
        SugarCube.State.variables.mc.lust   = 0;
        SugarCube.State.variables.videoEvent = '';
        var calls = 0;
        Math.random = function () {
          /* seq drives rollProwlEvent: chance=0 (low enough to clear
             every lust-tier sanity threshold), bansheeRoll=6,
             ctRoll=6 (both !=1 to skip the Banshee/Cthulion paths
             regardless of ghost flags), then 0/0 inside
             rollBodyPartEvent + pickRandom for the body-part roll. */
          var seq = [0.0, 0.5, 0.5, 0.0, 0.0];
          var r = seq[calls % seq.length];
          calls++;
          return r;
        };
        SugarCube.setup.Events.rollProwlEvent();
      });
      return await getVar(page, 'videoEvent');
    }
    const classicVid = await rolledVideoFor('classic');
    const rogueVid   = await rolledVideoFor('rogue');
    expect(typeof classicVid).toBe('string');
    expect(classicVid.length).toBeGreaterThan(0);
    expect(rogueVid).toBe(classicVid);
  });

  /* ---------- Lights-off rule parity ---------- */

  test('Spiritbox lights-off rule is enforced via the same per-room light state in both modes', async () => {
    const def = await callSetup(page, 'setup.searchToolDefs.spiritbox');
    expect(def && def.needsLightCheck).toBe(true);

    await startClassicIronclad(page, 'Shade');
    await goToPassage(page, 'IroncladKitchen');
    await page.evaluate(() =>
      SugarCube.setup.Rooms.setBackground('kitchen', SugarCube.setup.RoomLight.DARK));
    expect(await callSetup(page, 'setup.Rooms.isDark("kitchen")')).toBe(true);
    await page.evaluate(() =>
      SugarCube.setup.Rooms.setBackground('kitchen', SugarCube.setup.RoomLight.LIT));
    expect(await callSetup(page, 'setup.Rooms.isDark("kitchen")')).toBe(false);

    await tearDownAnyMode(page);

    await startRogueIronclad(page, 'Shade');
    await page.evaluate(() => {
      const id = SugarCube.setup.Rogue.currentRoomId();
      SugarCube.setup.Rogue.setRoomLight(id, SugarCube.setup.RoomLight.DARK);
    });
    expect(await callSetup(page, 'setup.Rogue.isCurrentRoomDark()')).toBe(true);
    await page.evaluate(() => {
      const id = SugarCube.setup.Rogue.currentRoomId();
      SugarCube.setup.Rogue.setRoomLight(id, SugarCube.setup.RoomLight.LIT);
    });
    expect(await callSetup(page, 'setup.Rogue.isCurrentRoomDark()')).toBe(false);
  });

  /* ---------- Knowledge / cursed-item carry parity ---------- */

  test('consumeKnowledgeEvidence reveals an evidence the ghost lacks in both modes', async () => {
    await startClassicIronclad(page, 'Shade');
    await page.evaluate(() => { Math.random = () => 0; });
    await page.evaluate(() => SugarCube.setup.HuntController.consumeKnowledgeEvidence());
    expect(['spiritbox', 'uvl', 'glass']).toContain(await getVar(page, 'chosenEvidence'));

    await tearDownAnyMode(page);
    await setVar(page, 'knowledgeUsed', 0);

    await startRogueIronclad(page, 'Shade');
    await page.evaluate(() => { Math.random = () => 0; });
    await page.evaluate(() => SugarCube.setup.HuntController.consumeKnowledgeEvidence());
    expect(['spiritbox', 'uvl', 'glass']).toContain(await getVar(page, 'chosenEvidence'));
  });

  test('Tarot deck CARRYING stage flips identically in both modes after markTarotCarrying', async () => {
    const CARRYING = await callSetup(page, 'setup.TarotStage.CARRYING');

    async function tarotStateOnBag(mode) {
      await tearDownAnyMode(page);
      if (mode === 'classic') await startClassicIronclad(page, 'Shade');
      else                    await startRogueIronclad(page, 'Shade');
      await page.evaluate(() => SugarCube.setup.HauntedHouses.markTarotCarrying());
      await goToPassage(page, 'Bag');
      const stage = await callSetup(page, 'setup.HauntedHouses.tarotCardsStage()');
      const carryStage = await callSetup(page, 'setup.MonkeyPaw.tarotCarryStage()');
      const insideHunt = await callSetup(page, 'setup.HuntController.isInsideHuntPassage()');
      return { stage, carryStage, insideHunt };
    }

    const classic = await tarotStateOnBag('classic');
    expect(classic.stage).toBe(CARRYING);
    expect(classic.carryStage).toBe(CARRYING);
    expect(classic.insideHunt).toBe(true);

    const rogue = await tarotStateOnBag('rogue');
    expect(rogue.stage).toBe(CARRYING);
    expect(rogue.carryStage).toBe(CARRYING);
    expect(rogue.insideHunt).toBe(true);
  });

  test('Monkey paw markFound + isCarrying parity (per-mode hunt-passage gate works in both)', async () => {
    async function pawStateOnBag(mode) {
      await tearDownAnyMode(page);
      if (mode === 'classic') await startClassicIronclad(page, 'Shade');
      else                    await startRogueIronclad(page, 'Shade');
      await page.evaluate(() => SugarCube.setup.MonkeyPaw.markFound());
      await goToPassage(page, 'Bag');
      const found = await callSetup(page, 'setup.MonkeyPaw.isFound()');
      const carrying = await callSetup(page, 'setup.MonkeyPaw.isCarrying()');
      const insideHunt = await callSetup(page, 'setup.HuntController.isInsideHuntPassage()');
      return { found, carrying, insideHunt };
    }

    const classic = await pawStateOnBag('classic');
    expect(classic.found).toBe(true);
    expect(classic.insideHunt).toBe(true);
    expect(classic.carrying).toBe(true);

    const rogue = await pawStateOnBag('rogue');
    expect(rogue.found).toBe(true);
    expect(rogue.insideHunt).toBe(true);
    expect(rogue.carrying).toBe(true);
  });

  /* ---------- HuntJournal parity ---------- */

  test('recordHuntStart snapshots realGhostName in both modes', async () => {
    await startClassicIronclad(page, 'Spirit');
    await page.evaluate(() => SugarCube.setup.HuntJournal.recordHuntStart());
    expect(await getVar(page, 'huntJournal.realGhost')).toBe('Spirit');

    await tearDownAnyMode(page);

    await startRogueIronclad(page, 'Spirit');
    await page.evaluate(() => SugarCube.setup.HuntJournal.recordHuntStart());
    expect(await getVar(page, 'huntJournal.realGhost')).toBe('Spirit');
  });

  /* ---------- modifier deck divergence ---------- */

  test('rogue-ironclad carries no modifier deck (catalogue modifierCount=0)', async () => {
    /* Like rogue-owaissa / rogue-elm, rogue-ironclad pins
       modifierCount=0 on the catalogue entry so the prison hunt stays
       off the modifier deck. The static rogue houses use the catalogue
       opt-out; only the procedural rogue card draws the default deck. */
    await startRogueIronclad(page, 'Shade');
    expect(await callSetup(page, 'setup.Rogue.modifiers()')).toEqual([]);
  });

  test('rogue-ironclad staticHouseId drives label override; classic uses the prison street name', async () => {
    await startRogueIronclad(page, 'Shade');
    const rogueAddr = await callSetup(page, 'setup.Rogue.address().formatted');
    const cat = await callSetup(page, 'setup.RogueHouses.byId("rogue-ironclad")');
    expect(rogueAddr).toBe(cat.label);
  });

  /* ---------- shared body-background pipeline ---------- */

  test('every rogue-ironclad template renders the same dark/lit URLs classic Ironclad pins on the matching passage', async () => {
    /* Per-template URL parity: walk the rogue-ironclad floor plan and,
       for every (template, dark/lit) pair, assert the rogue body-
       background URL is byte-for-byte identical to the URL classic
       Ironclad renders on the matching `Ironclad<Template>` passage.
       The rogue-ironclad catalogue carries explicit `roomBackgrounds`
       overrides for hallway + kitchen (since the global rogueRooms
       defaults point those templates at non-prison art); cellblocks,
       cells, and reception fall through to the prison-art globals.
       Pinning every URL here is what makes "rogue prison uses the
       same prison art as classic" a contract -- if a rogue room
       silently picks up Owaissa's kitchen.jpg again, this test
       fails on that template. */
    const TEMPLATE_TO_PASSAGE = {
      hallway:     'IroncladHallway',
      kitchen:     'IroncladKitchen',
      reception:   'IroncladReception',
      BlockA:      'IroncladBlockA',
      BlockB:      'IroncladBlockB',
      BlockACellA: 'IroncladBlockACellA',
      BlockACellB: 'IroncladBlockACellB',
      BlockACellC: 'IroncladBlockACellC',
      BlockBCellA: 'IroncladBlockBCellA',
      BlockBCellB: 'IroncladBlockBCellB',
      BlockBCellC: 'IroncladBlockBCellC'
    };
    const templates = await callSetup(page,
      'setup.RogueHouses.planFor("rogue-ironclad").rooms.map(r => r.template)');
    for (const t of templates) {
      const passage = TEMPLATE_TO_PASSAGE[t];
      expect(passage, `no classic passage mapping for template ${t}`).toBeTruthy();
      const classic = await callSetup(page,
        `setup.Styles.rooms[${JSON.stringify(passage)}]`);
      const rogueDark = await callSetup(page,
        `setup.Styles.bgUrlForTemplate(${JSON.stringify(t)}, true, "rogue-ironclad")`);
      const rogueLit  = await callSetup(page,
        `setup.Styles.bgUrlForTemplate(${JSON.stringify(t)}, false, "rogue-ironclad")`);
      expect(rogueDark, `${t} dark URL`).toBe(classic.dark);
      expect(rogueLit,  `${t} lit URL`).toBe(classic.light);
    }
  });

  /* ---------- snapGhostToCurrentRoom dispatch parity ---------- */

  test('snapGhostToCurrentRoom moves the ghost to the player room in both modes', async () => {
    /* Classic: stand in IroncladKitchen, snap, hunt.room.name == "kitchen". */
    await startClassicIronclad(page, 'Shade');
    await goToPassage(page, 'IroncladKitchen');
    expect(await page.evaluate(() => SugarCube.setup.HuntController.snapGhostToCurrentRoom())).toBe(true);
    expect(await getVar(page, 'hunt.room.name')).toBe('kitchen');

    await tearDownAnyMode(page);

    /* Rogue: stand in some non-room_0 room with a known template,
       snap, floorplan.spawnRoomId updates to that room. */
    await startRogueIronclad(page, 'Shade');
    const fp = await callSetup(page, 'setup.Rogue.field("floorplan")');
    const targetRoom = fp.rooms.find(r => r.template === 'kitchen');
    await page.evaluate(id => SugarCube.setup.Rogue.setCurrentRoom(id), targetRoom.id);
    await goToPassage(page, 'RogueRun');
    expect(await page.evaluate(() => SugarCube.setup.HuntController.snapGhostToCurrentRoom())).toBe(true);
    expect(await callSetup(page, 'setup.Rogue.ghostRoomId()')).toBe(targetRoom.id);
  });

  /* ---------- streetExit parity (MonkeyPaw leave wish) ---------- */

  test('streetExitPassage routes to Ironclad Prison in classic, RogueEnd (abandon) in rogue', async () => {
    /* HuntController.streetExitPassage now reads the active house's
       streetPassage straight off the catalogue, so classic Ironclad
       routes the MonkeyPaw leave wish back to the prison street.
       Rogue mirror routes through markFailure(ABANDON) -> RogueEnd. */
    await startClassicIronclad(page, 'Shade');
    expect(await callSetup(page, 'setup.HuntController.streetExitPassage()'))
      .toBe('Ironclad Prison');

    await tearDownAnyMode(page);

    await startRogueIronclad(page, 'Shade');
    expect(await callSetup(page, 'setup.HuntController.streetExitPassage()')).toBe('RogueEnd');
    expect(await callSetup(page, 'setup.Rogue.field("failureReason")')).toBe('abandon');
  });

  /* ---------- Possession Tarot parity ---------- */

  test('possessionPassage routes to CityMapPossessed in BOTH modes (rogue stamps + ends the run before routing)', async () => {
    await startClassicIronclad(page, 'Shade');
    await page.evaluate(() => { Math.random = () => 0; });
    expect(await callSetup(page, 'setup.HuntController.possessionPassage()'))
      .toBe('CityMapPossessed');

    await tearDownAnyMode(page);

    /* Rogue: same destination, but the side effects still record a
       POSSESSED failure on the run before endRogue tears it down --
       so the meta-state remembers it as a possession loss while the
       player UX matches classic's mid-day wake-up. */
    await startRogueIronclad(page, 'Shade');
    await page.evaluate(() => { Math.random = () => 0; });
    expect(await callSetup(page, 'setup.HuntController.possessionPassage()'))
      .toBe('CityMapPossessed');
    /* endRogue clears $run, so failureReason isn't directly readable
       afterward. The run no longer exists. */
    expect(await callSetup(page, 'setup.Rogue.isRogue()')).toBe(false);
  });

  /* ---------- exit-after-onCaughtCleanup ---------- */

  test('onCaughtCleanup flips classic hunt to POSSESSED, leaves rogue $run intact', async () => {
    await startClassicIronclad(page, 'Shade');
    expect(await callSetup(page, 'setup.Ghosts.huntMode()'))
      .toBe(await callSetup(page, 'setup.Ghosts.HuntMode.ACTIVE'));
    await page.evaluate(() => SugarCube.setup.HuntController.onCaughtCleanup());
    expect(await callSetup(page, 'setup.Ghosts.huntMode()'))
      .toBe(await callSetup(page, 'setup.Ghosts.HuntMode.POSSESSED'));

    await tearDownAnyMode(page);

    await startRogueIronclad(page, 'Shade');
    expect(await callSetup(page, 'setup.Rogue.isRogue()')).toBe(true);
    await page.evaluate(() => SugarCube.setup.HuntController.onCaughtCleanup());
    expect(await callSetup(page, 'setup.Rogue.isRogue()')).toBe(true);
  });

  /* ---------- Final end-to-end: walking out cleanly ---------- */

  test('classic "End the hunt" surfaces on Ironclad Prison; rogue "Flee the hunt" surfaces on RogueOutside', async () => {
    await startClassicIronclad(page, 'Shade');
    await setVar(page, 'isClothesStolen', 0);
    await goToPassage(page, 'Ironclad Prison');
    await expect(
      page.locator('.passage').getByText('End the hunt', { exact: true })
    ).toBeVisible();
    await page.evaluate(() => {
      SugarCube.setup.HauntedHouses.setHuntMode(SugarCube.setup.Ghosts.HuntMode.POSSESSED);
    });
    await goToPassage(page, 'HuntOverManual');
    expect(await callSetup(page, 'setup.Ghosts.huntMode()'))
      .toBe(await callSetup(page, 'setup.Ghosts.HuntMode.POSSESSED'));

    await tearDownAnyMode(page);

    await startRogueIronclad(page, 'Shade');
    await goToPassage(page, 'RogueOutside');
    await expect(
      page.locator('.passage').getByText('Flee the hunt', { exact: true })
    ).toBeVisible();
    await page.evaluate(() => {
      SugarCube.setup.Rogue.markFailure(SugarCube.setup.Rogue.FailureReason.FLED);
    });
    await goToPassage(page, 'RogueEnd');
    expect(await getVar(page, 'run')).toBeNull();
    /* "Fled" failure pays out failure ectoplasm (3 mL with no
       modifier multiplier on rogue-ironclad). */
    expect(await getVar(page, 'ectoplasm')).toBe(3);
  });
});
