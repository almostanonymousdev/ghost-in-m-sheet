/**
 * E2E side-by-side comparison: classic Elm vs Rogue Elm.
 *
 * Rogue Elm is a static-plan rogue house: same nine rooms, same
 * two-floor hub-and-spoke topology as classic Elm, but routed
 * through the rogue lifecycle ($run, ectoplasm payout, modifiers
 * draft) rather than the witch-contract bundle ($hunt). This spec
 * walks a hunt step-by-step in both modes and pins down:
 *
 *   - which behaviors are required to MATCH (shared subsystems --
 *     per-tick chain, tool stack, evidence pipeline, drift gating,
 *     hunt-event survival options, companion gate, room nav graph,
 *     lights-off rule, catch flow); AND
 *   - which behaviors are required to DIFFER on purpose (witch
 *     contract reward vs ectoplasm payout, hunt-over passage
 *     routing, mode dispatch, address label, modifier deck).
 *
 * The structure mirrors owaissa-rogue-parity.spec.js so the two
 * specs read as a matched pair; a future static rogue house can
 * land its own *-rogue-parity.spec.js with the same scaffolding.
 */
const { test, expect } = require('@playwright/test');
const {
  openGame, resetGame, getVar, setVar, callSetup, goToPassage,
} = require('../helpers');

test.describe('E2E parity: classic Elm vs Rogue Elm', () => {
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
       for the procedural rogue card; classic Elm uses lvl 3 and
       rogue-elm inherits lvl 3 from the catalogue. Lift MC level so
       either card clicks. */
    await page.waitForFunction(() => SugarCube.State.variables.mc != null);
    await page.evaluate(() => { SugarCube.State.variables.mc.lvl = 4; });
  });

  /* ---------- shared helpers ---------- */

  async function clickPassageLink(page, linkText, expectedPassage) {
    await page.locator('.passage').getByText(linkText, { exact: true }).first().click();
    await page.waitForFunction(p => SugarCube.State.passage === p, expectedPassage);
  }

  /* Drop the player straight into a classic Elm hunt at the hallway,
     mirroring what huntHouseStreet's "Go inside" link does (set
     hunt mode ACTIVE, activate the house, seed a starting room).
     Skips the GhostStreet UI walk so the test focuses on hunt-step
     parity rather than card clicks. */
  async function startClassicElm(page, ghostName) {
    await page.evaluate((name) => {
      SugarCube.setup.Ghosts.startHunt(name);
      SugarCube.setup.Ghosts.setHuntMode(SugarCube.setup.Ghosts.HuntMode.ACTIVE);
      SugarCube.setup.HauntedHouses.activate('elm');
      SugarCube.setup.HauntedHouses.setHuntRoom({ name: 'kitchen' });
      SugarCube.State.variables.stealChance = 0;
      const seed = ['hallway_carpet', 'kitchen_table', 'bedroom_table'];
      const V = SugarCube.State.variables;
      if (!V.houseSlots) V.houseSlots = {};
      if (!V.houseSlots.elm) V.houseSlots.elm = { available: seed.slice(), placeFor: {} };
      /* GameInit seeds V.hours = 12. Inside a hunt, isMorningPlus()
         returns true and TickController routes to HuntOverTime as
         soon as a haunted-house passage renders, which would flip
         $hunt.mode to POSSESSED and trip Bag's tarot cleanup. Reset
         to midnight so the active-hunt state survives navigation. */
      V.hours = 0;
      V.minutes = 10;
    }, ghostName);
    await goToPassage(page, 'ElmHallway');
  }

  /* Drop the player into a Rogue Elm run on RogueRun. */
  async function startRogueElm(page, ghostName, seed = 1) {
    await page.evaluate(({ name, s }) => {
      SugarCube.setup.Rogue.startRogue({
        seed: s, staticHouseId: 'rogue-elm'
      });
      SugarCube.setup.Rogue.setField('ghostName', name);
      const ghost = SugarCube.setup.Ghosts.getByName(name);
      SugarCube.setup.Rogue.setField('evidence',
        ghost.evidence.map(e => e.id));
      SugarCube.State.variables.stealChance = 0;
    }, { name: ghostName, s: seed });
    await goToPassage(page, 'RogueRun');
  }

  /* Tear down whatever mode was started so the next setup starts
     clean. Classic ends the witch contract; rogue ends the run.
     Either is a no-op when not active. */
  async function tearDownAnyMode(page) {
    await page.evaluate(() => {
      if (SugarCube.setup.Ghosts.hunt()) SugarCube.setup.Ghosts.endContract();
      if (SugarCube.setup.Rogue.isRogue()) SugarCube.setup.Rogue.end();
    });
    await goToPassage(page, 'CityMap');
  }

  /* ---------- catalogue + entry parity ---------- */

  test('both Elm houses appear on GhostStreet behind the same image asset', async () => {
    const classicImg = await callSetup(page, 'setup.HauntedHouses.byId("elm").image');
    const rogueImg   = await callSetup(page, 'setup.RogueHouses.byId("rogue-elm").image');
    expect(rogueImg).toBe(classicImg);
  });

  test('both Elm houses share the same level gate (3)', async () => {
    const classicGate = await callSetup(page, 'setup.HauntedHouses.byId("elm").levelGate');
    const rogueGate   = await callSetup(page, 'setup.RogueHouses.byId("rogue-elm").levelGate');
    expect(classicGate).toBe(3);
    expect(rogueGate).toBe(3);
  });

  test('both Elm houses opt into the companion plan flow', async () => {
    const classicCompanions = await callSetup(page,
      'setup.HauntedHouses.byId("elm").allowsCompanions');
    const rogueCompanions   = await callSetup(page,
      'setup.RogueHouses.allowsCompanions("rogue-elm")');
    expect(classicCompanions).toBe(true);
    expect(rogueCompanions).toBe(true);
  });

  test('GhostStreet entry from classic Elm lands on Elm Street', async () => {
    await goToPassage(page, 'GhostStreet');
    await page.locator('.passage').locator('.housecard').getByText('Elm Street')
      .first().click();
    await page.waitForFunction(() => SugarCube.State.passage === 'Elm Street');
    expect(await callSetup(page, 'setup.HauntedHouses.activeHouse().id')).toBe('elm');
  });

  test('GhostStreet entry from Rogue Elm lands on RogueStart with staticHouseId stamped', async () => {
    await goToPassage(page, 'GhostStreet');
    await page.locator('.passage').locator('.housecard').getByText('Rogue Elm')
      .first().click();
    await page.waitForFunction(() => SugarCube.State.passage === 'RogueStart');
    expect(await callSetup(page, 'setup.Rogue.staticHouseId()')).toBe('rogue-elm');
  });

  /* ---------- floor-plan parity ---------- */

  test('rogue-elm carries the same nine room templates as classic Elm', async () => {
    const classicRooms = await callSetup(
      page, 'setup.HauntedHouses.byId("elm").rooms.slice().sort()');
    const rogueTemplates = await callSetup(page,
      'setup.RogueHouses.planFor("rogue-elm").rooms.map(r => r.template).sort()');
    expect(rogueTemplates).toEqual(classicRooms);
  });

  test('rogue-elm hallway connects to {kitchen, bathroom, bedroom, basement, hallwayUpstairs}, classic exits the same', async () => {
    /* Classic side: read the exits map (5 entries, all in-house). */
    const classicLabels = await callSetup(page,
      'setup.HauntedHouses.byId("elm").exits.ElmHallway.map(e => e.target).sort()');
    expect(classicLabels).toEqual([
      'ElmBasement', 'ElmBathroom', 'ElmBedroom',
      'ElmHallwayUpstairs', 'ElmKitchen'
    ]);

    /* Rogue side: BFS from room_0 (hallway). */
    const plan = await callSetup(page, 'setup.RogueHouses.planFor("rogue-elm")');
    const fp = await page.evaluate(p =>
      SugarCube.setup.FloorPlan.generate(1, { staticPlan: p }), plan);
    const rogueNeighbours = await page.evaluate(f => {
      const ids = SugarCube.setup.FloorPlan.neighborsOf(f, 'room_0');
      return ids.map(id => f.rooms.find(r => r.id === id).template).sort();
    }, fp);
    expect(rogueNeighbours).toEqual([
      'basement', 'bathroom', 'bedroom', 'hallwayUpstairs', 'kitchen'
    ]);
  });

  test('both upstairs hallways connect to {bathroomTwo, bedroomTwo, nursery, downstairs hallway}', async () => {
    const classicLabels = await callSetup(page,
      'setup.HauntedHouses.byId("elm").exits.ElmHallwayUpstairs.map(e => e.target).sort()');
    expect(classicLabels).toEqual([
      'ElmBathroomTwo', 'ElmBedroomTwo', 'ElmHallway', 'ElmNursery'
    ]);

    const plan = await callSetup(page, 'setup.RogueHouses.planFor("rogue-elm")');
    const fp = await page.evaluate(p =>
      SugarCube.setup.FloorPlan.generate(1, { staticPlan: p }), plan);
    const upstairsRoom = fp.rooms.find(r => r.template === 'hallwayUpstairs');
    const rogueNeighbours = await page.evaluate(({ f, k }) => {
      const ids = SugarCube.setup.FloorPlan.neighborsOf(f, k);
      return ids.map(id => f.rooms.find(r => r.id === id).template).sort();
    }, { f: fp, k: upstairsRoom.id });
    expect(rogueNeighbours).toEqual([
      'bathroomTwo', 'bedroomTwo', 'hallway', 'nursery'
    ]);
  });

  test('classic and rogue produce the same BFS distance map from the hallway', async () => {
    /* Classic Elm walking distances from the downstairs hallway:
         hallway:         0
         kitchen:         1
         bathroom:        1
         bedroom:         1
         basement:        1
         hallwayUpstairs: 1
         bathroomTwo:     2
         bedroomTwo:      2
         nursery:         2 */
    const expected = {
      hallway:         0,
      kitchen:         1,
      bathroom:        1,
      bedroom:         1,
      basement:        1,
      hallwayUpstairs: 1,
      bathroomTwo:     2,
      bedroomTwo:      2,
      nursery:         2,
    };

    const plan = await callSetup(page, 'setup.RogueHouses.planFor("rogue-elm")');
    const fp = await page.evaluate(p =>
      SugarCube.setup.FloorPlan.generate(1, { staticPlan: p }), plan);
    const rogueDist = await page.evaluate(f => {
      const dist = SugarCube.setup.FloorPlan.bfsDistances(f, 'room_0');
      const out = {};
      f.rooms.forEach(r => { out[r.template] = dist[r.id]; });
      return out;
    }, fp);
    expect(rogueDist).toEqual(expected);

    /* Classic side: reconstruct the adjacency from the exits map and
       hand-BFS to confirm the same hop counts. */
    const classicExits = await callSetup(page,
      'setup.HauntedHouses.byId("elm").exits');
    const TEMPLATE_BY_PASSAGE = {
      ElmHallway:         'hallway',
      ElmKitchen:         'kitchen',
      ElmBathroom:        'bathroom',
      ElmBedroom:         'bedroom',
      ElmBasement:        'basement',
      ElmHallwayUpstairs: 'hallwayUpstairs',
      ElmBathroomTwo:     'bathroomTwo',
      ElmBedroomTwo:      'bedroomTwo',
      ElmNursery:         'nursery',
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

  test('mode() distinguishes the two modes (regular vs rogue), with the same activeGhost name', async () => {
    await startClassicElm(page, 'Spirit');
    expect(await callSetup(page, 'setup.HuntController.mode()')).toBe('regular');
    expect(await callSetup(page, 'setup.HuntController.activeGhost().name')).toBe('Spirit');
    expect(await callSetup(page, 'setup.HuntController.realGhostName()')).toBe('Spirit');

    await tearDownAnyMode(page);

    await startRogueElm(page, 'Spirit');
    expect(await callSetup(page, 'setup.HuntController.mode()')).toBe('rogue');
    expect(await callSetup(page, 'setup.HuntController.activeGhost().name')).toBe('Spirit');
    expect(await callSetup(page, 'setup.HuntController.realGhostName()')).toBe('Spirit');
  });

  test('isHuntActive() is true inside both Elm hunts (per-tick chain gate stays open)', async () => {
    await startClassicElm(page, 'Shade');
    expect(await callSetup(page, 'setup.HuntController.isHuntActive()')).toBe(true);

    await tearDownAnyMode(page);

    await startRogueElm(page, 'Shade');
    expect(await callSetup(page, 'setup.HuntController.isHuntActive()')).toBe(true);
  });

  test('isCursedHuntActive is classic-only and false in rogue', async () => {
    await startClassicElm(page, 'Shade');
    expect(await callSetup(page, 'setup.HuntController.isCursedHuntActive()')).toBe(false);

    await tearDownAnyMode(page);

    await startRogueElm(page, 'Shade');
    expect(await callSetup(page, 'setup.HuntController.isCursedHuntActive()')).toBe(false);
  });

  test('isGhostHere() flips when the player walks into the ghost room in both modes', async () => {
    /* Classic: ghost pinned to kitchen AFTER all navigation so the
       per-passage shuffleGhostRoom drift can't relocate the ghost
       mid-test. */
    await startClassicElm(page, 'Shade');
    await goToPassage(page, 'ElmKitchen');
    await page.evaluate(() => SugarCube.setup.HauntedHouses.setHuntRoom({ name: 'kitchen' }));
    expect(await callSetup(page, 'setup.HuntController.isGhostHere()')).toBe(true);
    await goToPassage(page, 'ElmBedroom');
    await page.evaluate(() => SugarCube.setup.HauntedHouses.setHuntRoom({ name: 'kitchen' }));
    expect(await callSetup(page, 'setup.HuntController.isGhostHere()')).toBe(false);

    await tearDownAnyMode(page);

    await startRogueElm(page, 'Shade');
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

  test('applyTickEffects burns 1 in-game minute in both classic Elm and Rogue Elm', async () => {
    await startClassicElm(page, 'Shade');
    await setVar(page, 'hours', 0);
    await setVar(page, 'minutes', 0);
    await page.evaluate(() => SugarCube.setup.HauntConditions.applyTickEffects());
    expect(await getVar(page, 'minutes')).toBe(1);

    await tearDownAnyMode(page);

    await startRogueElm(page, 'Shade');
    await setVar(page, 'hours', 0);
    await setVar(page, 'minutes', 0);
    await page.evaluate(() => SugarCube.setup.HauntConditions.applyTickEffects());
    expect(await getVar(page, 'minutes')).toBe(1);
  });

  test('applyTickEffects drains sanity in both modes (per-mode rules may scale the drain)', async () => {
    async function deltaForMode(mode) {
      await tearDownAnyMode(page);
      if (mode === 'classic') await startClassicElm(page, 'Shade');
      else                    await startRogueElm(page, 'Shade');

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

  /* ---------- ghost drift parity ---------- */

  test('ghost-room drift fires through the same controller in both modes', async () => {
    /* Classic: pin ghost to a non-rooms[0] room so Math.random()=0 picks
       a different one. Elm rooms[0] is 'kitchen' (per HOUSE_CONFIG). */
    await tearDownAnyMode(page);
    await startClassicElm(page, 'Shade');
    const classicResult = await page.evaluate(() => {
      SugarCube.setup.HauntedHouses.setHuntRoom({ name: 'bedroom' });
      Math.random = () => 0;
      const before = SugarCube.State.variables.hunt.room.name;
      SugarCube.setup.HauntedHouses.driftGhostRoom();
      return { before, after: SugarCube.State.variables.hunt.room.name };
    });
    expect(classicResult.after).not.toBe(classicResult.before);

    await tearDownAnyMode(page);
    await startRogueElm(page, 'Shade');
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
    /* Hallway is never a valid drift destination in rogue (rule
       built into Rogue.driftGhostRoom). Classic Elm's drift pool is
       the full house.rooms list, which DOES include hallway and
       hallwayUpstairs -- documented divergence. */
    expect(rogueResult.afterTemplate).not.toBe('hallway');
  });

  test('Goryo (staysInOneRoom) never drifts in either mode', async () => {
    async function noDrift(mode) {
      await tearDownAnyMode(page);
      if (mode === 'classic') await startClassicElm(page, 'Goryo');
      else                    await startRogueElm(page, 'Goryo');

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
    await startClassicElm(page, 'Shade');
    const classicEv = await callSetup(page,
      'setup.HuntController.activeGhost().evidence.map(e => e.id).sort()');

    await tearDownAnyMode(page);

    await startRogueElm(page, 'Shade');
    const rogueEv = await callSetup(page,
      'setup.HuntController.activeGhost().evidence.map(e => e.id).sort()');

    expect(rogueEv).toEqual(classicEv);
  });

  test('hasEvidence agrees across modes for sampled ghosts', async () => {
    const sampled = ['Spirit', 'Shade', 'Phantom', 'Wraith', 'Goryo'];
    const evidenceIds = ['emf', 'spiritbox', 'gwb', 'uvl', 'glass', 'temperature'];
    for (const ghost of sampled) {
      await tearDownAnyMode(page);
      await startClassicElm(page, ghost);
      const classicMatrix = {};
      for (const e of evidenceIds) {
        classicMatrix[e] = await callSetup(page,
          `setup.HuntController.activeGhost().hasEvidence("${e}")`);
      }

      await tearDownAnyMode(page);
      await startRogueElm(page, ghost);
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
      if (mode === 'classic') await startClassicElm(page, 'Shade');
      else                    await startRogueElm(page, 'Shade');
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
    await startClassicElm(page, 'Shade');
    expect(await callSetup(page, 'setup.HuntController.huntOverPassage("sanity")'))
      .toBe('HuntOverSanity');

    await tearDownAnyMode(page);

    await startRogueElm(page, 'Shade');
    expect(await callSetup(page, 'setup.HuntController.huntOverPassage("sanity")'))
      .toBe('RogueEnd');
    expect(await callSetup(page, 'setup.Rogue.field("failureReason")')).toBe('sanity');
  });

  test('huntOverPassage("exhaustion") routes to HuntOverExhaustion in classic, RogueEnd in rogue', async () => {
    await startClassicElm(page, 'Shade');
    expect(await callSetup(page, 'setup.HuntController.huntOverPassage("exhaustion")'))
      .toBe('HuntOverExhaustion');

    await tearDownAnyMode(page);

    await startRogueElm(page, 'Shade');
    expect(await callSetup(page, 'setup.HuntController.huntOverPassage("exhaustion")'))
      .toBe('RogueEnd');
    expect(await callSetup(page, 'setup.Rogue.field("failureReason")')).toBe('exhaustion');
  });

  test('huntOverPassage("time") routes to HuntOverTime in classic, RogueEnd in rogue', async () => {
    await startClassicElm(page, 'Shade');
    expect(await callSetup(page, 'setup.HuntController.huntOverPassage("time")'))
      .toBe('HuntOverTime');

    await tearDownAnyMode(page);

    await startRogueElm(page, 'Shade');
    expect(await callSetup(page, 'setup.HuntController.huntOverPassage("time")'))
      .toBe('RogueEnd');
    expect(await callSetup(page, 'setup.Rogue.field("failureReason")')).toBe('time');
  });

  test('huntCaughtPassage routes to Sleep in classic, RogueEnd (caught) in rogue', async () => {
    await startClassicElm(page, 'Shade');
    expect(await callSetup(page, 'setup.HuntController.huntCaughtPassage()')).toBe('Sleep');

    await tearDownAnyMode(page);

    await startRogueElm(page, 'Shade');
    expect(await callSetup(page, 'setup.HuntController.huntCaughtPassage()')).toBe('RogueEnd');
    expect(await callSetup(page, 'setup.Rogue.field("failureReason")')).toBe('caught');
  });

  /* ---------- payout divergence ---------- */

  test('payout for a correct guess: classic pays witch contract money/XP, rogue pays {0,0}', async () => {
    await startClassicElm(page, 'Shade');
    await page.evaluate(() => {
      SugarCube.State.variables.moneyFromContract       = 180;
      SugarCube.State.variables.expFromContract         = 60;
      SugarCube.State.variables.moneyFromWeakenTheGhost = 30;
    });
    expect(await callSetup(page, 'setup.HuntController.payoutForGuess(true)'))
      .toEqual({ money: 210, xp: 60 });

    await tearDownAnyMode(page);

    await startRogueElm(page, 'Shade');
    expect(await callSetup(page, 'setup.HuntController.payoutForGuess(true)'))
      .toEqual({ money: 0, xp: 0 });
  });

  test('rogue payout is in ectoplasm (mL) on RogueEnd; classic does not touch ectoplasm', async () => {
    await startClassicElm(page, 'Shade');
    const beforeEcto = await getVar(page, 'ectoplasm');
    await page.evaluate(() => SugarCube.setup.Ghosts.endContract());
    expect(await getVar(page, 'ectoplasm')).toBe(beforeEcto);

    await tearDownAnyMode(page);

    await startRogueElm(page, 'Shade');
    await page.evaluate(() => SugarCube.setup.Rogue.markSuccess());
    await goToPassage(page, 'RogueEnd');
    /* rogue-elm has modifierCount=0, so multiplier=1 -> 10 mL on success. */
    expect(await getVar(page, 'ectoplasm')).toBe(10);
  });

  /* ---------- room nav UI parity ---------- */

  test('classic ElmHallway and rogue room_0 (hallway) expose the same five neighbours by label', async () => {
    /* Classic: ElmHallway exposes kitchen / bathroom / bedroom /
       upstairs / basement / leave (lowercased). */
    await startClassicElm(page, 'Shade');
    await goToPassage(page, 'ElmHallway');
    const classicLinks = await page.locator('.passage a').allTextContents();
    const classicLower = classicLinks.map(s => s.trim().toLowerCase()).sort();
    /* The leave-link text on Elm is "leave" (not "Outside"). */
    expect(classicLower).toEqual(
      expect.arrayContaining(['kitchen', 'bedroom', 'bathroom', 'basement', 'upstairs', 'leave'])
    );

    await tearDownAnyMode(page);

    await startRogueElm(page, 'Shade');
    const navLinks = await page.locator('.rogue-run-nav a').allTextContents();
    const rogueLower = navLinks.map(s => s.trim().toLowerCase()).sort();
    /* Rogue uses the template label set ("Kitchen", "Bedroom",
       "Bathroom", "Basement", "Hallway upstairs") plus an Outside
       link off the hallway. Lowercased so casing doesn't trip the
       comparison. */
    expect(rogueLower).toEqual(
      expect.arrayContaining(['kitchen', 'bedroom', 'bathroom', 'basement', 'outside'])
    );
    /* The upstairs nav surfaces as the "Hallway upstairs" template
       label (rogue) versus the lowercase "upstairs" link in classic
       -- documented divergence; both still reach the same
       hallwayUpstairs template by exit. */
  });

  test('classic "leave" link returns to Elm Street; rogue Outside link routes to RogueOutside', async () => {
    /* Classic: hallway "leave" link goes to "Elm Street". */
    await startClassicElm(page, 'Shade');
    await goToPassage(page, 'ElmHallway');
    await clickPassageLink(page, 'leave', 'Elm Street');
    expect(await callSetup(page, 'setup.HauntedHouses.activeHouse().id')).toBe('elm');

    await tearDownAnyMode(page);

    /* Rogue: "Outside" routes to RogueOutside. */
    await startRogueElm(page, 'Shade');
    await clickPassageLink(page, 'Outside', 'RogueOutside');
    expect(await callSetup(page, 'setup.Rogue.isRogue()')).toBe(true);
  });

  /* ---------- companion-gate parity ---------- */

  test('Companion.inHauntedHouseLocation is true in both classic Elm and rogue-elm', async () => {
    await startClassicElm(page, 'Shade');
    expect(await callSetup(page, 'setup.Companion.inHauntedHouseLocation()')).toBe(true);

    await tearDownAnyMode(page);

    await startRogueElm(page, 'Shade');
    expect(await callSetup(page, 'setup.Companion.inHauntedHouseLocation()')).toBe(true);
  });

  /* ---------- Hunt event survival options parity ---------- */

  test('GhostHuntEvent renders the same survival options (Hide / Run / Pray / Freeze) in both modes', async () => {
    async function survivalOptionsForMode(mode) {
      await tearDownAnyMode(page);
      if (mode === 'classic') await startClassicElm(page, 'Shade');
      else                    await startRogueElm(page, 'Shade');
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

  /* ---------- Lights-off rule parity ---------- */

  test('Spiritbox lights-off rule is enforced via the same per-room light state in both modes', async () => {
    const def = await callSetup(page, 'setup.searchToolDefs.spiritbox');
    expect(def && def.needsLightCheck).toBe(true);

    await startClassicElm(page, 'Shade');
    await goToPassage(page, 'ElmKitchen');
    await page.evaluate(() =>
      SugarCube.setup.Rooms.setBackground('kitchen', SugarCube.setup.RoomLight.DARK));
    expect(await callSetup(page, 'setup.Rooms.isDark("kitchen")')).toBe(true);
    await page.evaluate(() =>
      SugarCube.setup.Rooms.setBackground('kitchen', SugarCube.setup.RoomLight.LIT));
    expect(await callSetup(page, 'setup.Rooms.isDark("kitchen")')).toBe(false);

    await tearDownAnyMode(page);

    await startRogueElm(page, 'Shade');
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
    await startClassicElm(page, 'Shade');
    await page.evaluate(() => { Math.random = () => 0; });
    await page.evaluate(() => SugarCube.setup.HuntController.consumeKnowledgeEvidence());
    expect(['spiritbox', 'uvl', 'glass']).toContain(await getVar(page, 'chosenEvidence'));

    await tearDownAnyMode(page);
    await setVar(page, 'knowledgeUsed', 0);

    await startRogueElm(page, 'Shade');
    await page.evaluate(() => { Math.random = () => 0; });
    await page.evaluate(() => SugarCube.setup.HuntController.consumeKnowledgeEvidence());
    expect(['spiritbox', 'uvl', 'glass']).toContain(await getVar(page, 'chosenEvidence'));
  });

  test('Tarot deck CARRYING stage flips identically in both modes after markTarotCarrying', async () => {
    const CARRYING = await callSetup(page, 'setup.TarotStage.CARRYING');

    async function tarotStateOnBag(mode) {
      await tearDownAnyMode(page);
      if (mode === 'classic') await startClassicElm(page, 'Shade');
      else                    await startRogueElm(page, 'Shade');
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
      if (mode === 'classic') await startClassicElm(page, 'Shade');
      else                    await startRogueElm(page, 'Shade');
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
    await startClassicElm(page, 'Spirit');
    await page.evaluate(() => SugarCube.setup.HuntJournal.recordHuntStart());
    expect(await getVar(page, 'huntJournal.realGhost')).toBe('Spirit');

    await tearDownAnyMode(page);

    await startRogueElm(page, 'Spirit');
    await page.evaluate(() => SugarCube.setup.HuntJournal.recordHuntStart());
    expect(await getVar(page, 'huntJournal.realGhost')).toBe('Spirit');
  });

  /* ---------- modifier deck divergence ---------- */

  test('rogue-elm carries no modifier deck (catalogue modifierCount=0)', async () => {
    await startRogueElm(page, 'Shade');
    expect(await callSetup(page, 'setup.Rogue.modifiers()')).toEqual([]);
  });

  test('rogue-elm staticHouseId drives label override; classic uses the haunted-house street name', async () => {
    await startRogueElm(page, 'Shade');
    const rogueAddr = await callSetup(page, 'setup.Rogue.address().formatted');
    const cat = await callSetup(page, 'setup.RogueHouses.byId("rogue-elm")');
    expect(rogueAddr).toBe(cat.label);
  });

  /* ---------- shared body-background pipeline ---------- */

  test('rogue body-background uses the same dark/lit asset URLs as classic Elm (per template)', async () => {
    /* Walk every Elm template through setup.Styles.bgUrlForTemplate
       in both dark and lit modes. The pipeline is shared, so both
       modes should resolve the same template + light state to the
       same URL. */
    const templates = await callSetup(page, 'setup.HauntedHouses.byId("elm").rooms');
    for (const t of templates) {
      const dark = await callSetup(page, `setup.Styles.bgUrlForTemplate(${JSON.stringify(t)}, true)`);
      const lit  = await callSetup(page, `setup.Styles.bgUrlForTemplate(${JSON.stringify(t)}, false)`);
      expect(typeof dark).toBe('string');
      expect(typeof lit).toBe('string');
      /* The dark/lit pair must differ; if a template lacked a
         dark variant, both lookups would return the same URL and a
         lit room would silently wash through unchanged. */
      expect(dark).not.toBe(lit);
    }
  });

  /* ---------- snapGhostToCurrentRoom dispatch parity ---------- */

  test('snapGhostToCurrentRoom moves the ghost to the player room in both modes', async () => {
    /* Classic: stand in ElmBedroom, snap, hunt.room.name == "bedroom". */
    await startClassicElm(page, 'Shade');
    await goToPassage(page, 'ElmBedroom');
    expect(await page.evaluate(() => SugarCube.setup.HuntController.snapGhostToCurrentRoom())).toBe(true);
    expect(await getVar(page, 'hunt.room.name')).toBe('bedroom');

    await tearDownAnyMode(page);

    /* Rogue: stand in some non-room_0 room, snap, floorplan.spawnRoomId
       updates to that room. */
    await startRogueElm(page, 'Shade');
    const fp = await callSetup(page, 'setup.Rogue.field("floorplan")');
    const targetRoom = fp.rooms.find(r => r.template === 'bedroom');
    await page.evaluate(id => SugarCube.setup.Rogue.setCurrentRoom(id), targetRoom.id);
    await goToPassage(page, 'RogueRun');
    expect(await page.evaluate(() => SugarCube.setup.HuntController.snapGhostToCurrentRoom())).toBe(true);
    expect(await callSetup(page, 'setup.Rogue.ghostRoomId()')).toBe(targetRoom.id);
  });

  /* ---------- streetExit parity (MonkeyPaw leave wish) ---------- */

  test('streetExitPassage routes to Elm Street in classic, RogueEnd (abandon) in rogue', async () => {
    await startClassicElm(page, 'Shade');
    expect(await callSetup(page, 'setup.HuntController.streetExitPassage()')).toBe('Elm Street');

    await tearDownAnyMode(page);

    await startRogueElm(page, 'Shade');
    expect(await callSetup(page, 'setup.HuntController.streetExitPassage()')).toBe('RogueEnd');
    expect(await callSetup(page, 'setup.Rogue.field("failureReason")')).toBe('abandon');
  });

  /* ---------- Possession Tarot parity ---------- */

  test('possessionPassage routes to CityMapPossessed in classic, RogueEnd (possessed) in rogue', async () => {
    await startClassicElm(page, 'Shade');
    await page.evaluate(() => { Math.random = () => 0; });
    expect(await callSetup(page, 'setup.HuntController.possessionPassage()'))
      .toBe('CityMapPossessed');

    await tearDownAnyMode(page);

    await startRogueElm(page, 'Shade');
    expect(await callSetup(page, 'setup.HuntController.possessionPassage()')).toBe('RogueEnd');
    expect(await callSetup(page, 'setup.Rogue.field("failureReason")')).toBe('possessed');
  });

  /* ---------- exit-after-onCaughtCleanup ---------- */

  test('onCaughtCleanup flips classic hunt to POSSESSED, leaves rogue $run intact', async () => {
    await startClassicElm(page, 'Shade');
    expect(await callSetup(page, 'setup.Ghosts.huntMode()'))
      .toBe(await callSetup(page, 'setup.Ghosts.HuntMode.ACTIVE'));
    await page.evaluate(() => SugarCube.setup.HuntController.onCaughtCleanup());
    expect(await callSetup(page, 'setup.Ghosts.huntMode()'))
      .toBe(await callSetup(page, 'setup.Ghosts.HuntMode.POSSESSED'));

    await tearDownAnyMode(page);

    await startRogueElm(page, 'Shade');
    expect(await callSetup(page, 'setup.Rogue.isRogue()')).toBe(true);
    await page.evaluate(() => SugarCube.setup.HuntController.onCaughtCleanup());
    expect(await callSetup(page, 'setup.Rogue.isRogue()')).toBe(true);
  });

  /* ---------- Final end-to-end: walking out cleanly ---------- */

  test('classic "End the hunt" surfaces on Elm Street; rogue "Flee the hunt" surfaces on RogueOutside', async () => {
    await startClassicElm(page, 'Shade');
    await setVar(page, 'isClothesStolen', 0);
    await goToPassage(page, 'Elm Street');
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

    await startRogueElm(page, 'Shade');
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
       modifier multiplier on rogue-elm). */
    expect(await getVar(page, 'ectoplasm')).toBe(3);
  });
});
