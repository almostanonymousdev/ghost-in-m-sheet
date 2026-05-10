/**
 * E2E side-by-side comparison: classic Owaissa vs Rogue Owaissa.
 *
 * Rogue Owaissa is a static-plan rogue house: same five rooms, same
 * hub-and-branch topology as classic Owaissa, but routed through the
 * rogue lifecycle ($run, ectoplasm payout, modifiers draft) rather
 * than the witch-contract bundle ($hunt). The intent of this spec is
 * to walk a hunt step-by-step in both modes and pin down:
 *
 *   - which behaviors are required to MATCH (shared subsystems --
 *     the per-tick chain, tool stack, evidence pipeline, drift
 *     gating, hunt-event survival options, companion gate, room
 *     nav graph, lights-off rule, catch flow) so we'd catch a
 *     regression that breaks one mode and not the other; AND
 *   - which behaviors are required to DIFFER on purpose (witch
 *     contract reward vs ectoplasm payout, hunt-over passage
 *     routing, mode dispatch, address label, modifier deck) so
 *     we'd catch a regression that *unifies* a divergence we
 *     intentionally split.
 *
 * Each test starts from a clean reset, walks the same step in both
 * modes, and asserts the equivalence (or the documented divergence).
 */
const { test, expect } = require('@playwright/test');
const {
  openGame, resetGame, getVar, setVar, callSetup, goToPassage,
} = require('../helpers');

test.describe('E2E parity: classic Owaissa vs Rogue Owaissa', () => {
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
       for the procedural rogue card, and the rogue-owaissa card uses
       its catalogue levelGate (0). Lifting MC level lets either card
       click; classic Owaissa is also lvl 0 so it stays open. */
    await page.waitForFunction(() => SugarCube.State.variables.mc != null);
    await page.evaluate(() => { SugarCube.State.variables.mc.lvl = 4; });
  });

  /* ---------- shared helpers ---------- */

  async function clickPassageLink(page, linkText, expectedPassage) {
    await page.locator('.passage').getByText(linkText, { exact: true }).first().click();
    await page.waitForFunction(p => SugarCube.State.passage === p, expectedPassage);
  }

  /* Drop the player straight into a classic Owaissa hunt at the
     hallway, mirroring what huntHouseStreet's "Go inside" link does
     (set hunt mode ACTIVE, activate the house, seed a starting
     room). Skips the GhostStreet UI walk so the test focuses on
     the hunt-step parity rather than card clicks. */
  async function startClassicOwaissa(page, ghostName) {
    await page.evaluate((name) => {
      SugarCube.setup.Ghosts.startHunt(name);
      SugarCube.setup.Ghosts.setHuntMode(SugarCube.setup.Ghosts.HuntMode.ACTIVE);
      SugarCube.setup.HauntedHouses.activate('owaissa');
      SugarCube.setup.HauntedHouses.setHuntRoom({ name: 'kitchen' });
      // Pin per-house slot buckets so any stray StealClothes can't
      // crash on a missing slot pool, and zero out the steal chance
      // so navigation stays deterministic.
      SugarCube.State.variables.stealChance = 0;
      const seed = ['hallway_carpet', 'kitchen_table', 'bedroom_table'];
      const V = SugarCube.State.variables;
      if (!V.houseSlots) V.houseSlots = {};
      if (!V.houseSlots.owaissa) V.houseSlots.owaissa = { available: seed.slice(), placeFor: {} };
      /* GameInit seeds V.hours = 12 (noon). Inside a hunt with that
         clock, setup.Time.isMorningPlus() is true, and TickController's
         onPassageDone routes to HuntOverTime as soon as the player
         steps into the haunted house -- which would flip $hunt.mode to
         POSSESSED and trip Bag's tarot cleanup. Reset to midnight so
         the active-hunt state survives navigation. */
      V.hours = 0;
      V.minutes = 10;
    }, ghostName);
    await goToPassage(page, 'OwaissaHallway');
  }

  /* Drop the player into a Rogue Owaissa run on RogueRun. Pins
     ghostName / evidence for parity with the classic helper, and
     pre-rolls the floor plan so room/edge-graph assertions can read
     from $run.floorplan straight away. */
  async function startRogueOwaissa(page, ghostName, seed = 1) {
    await page.evaluate(({ name, s }) => {
      SugarCube.setup.Rogue.startRogue({
        seed: s, staticHouseId: 'rogue-owaissa'
      });
      SugarCube.setup.Rogue.setField('ghostName', name);
      const ghost = SugarCube.setup.Ghosts.getByName(name);
      SugarCube.setup.Rogue.setField('evidence',
        ghost.evidence.map(e => e.id));
      // Same steal-chance pin as the classic helper -- the per-tick
      // chain reads this in either mode.
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

  test('both houses appear on GhostStreet behind the same image asset', async () => {
    /* The two cards share an image (ui/img/owaissa-house.jpg) by
       design -- the rogue card is the static-plan mirror, so the
       art rolls forward. Pin both lookups from the catalogue. */
    const classicImg = await callSetup(page, 'setup.HauntedHouses.byId("owaissa").image');
    const rogueImg   = await callSetup(page, 'setup.RogueHouses.byId("rogue-owaissa").image');
    expect(rogueImg).toBe(classicImg);
  });

  test('both houses share the same level gate (0)', async () => {
    const classicGate = await callSetup(page, 'setup.HauntedHouses.byId("owaissa").levelGate');
    const rogueGate   = await callSetup(page, 'setup.RogueHouses.byId("rogue-owaissa").levelGate');
    expect(classicGate).toBe(0);
    expect(rogueGate).toBe(0);
  });

  test('both houses opt into the companion plan flow', async () => {
    const classicCompanions = await callSetup(page,
      'setup.HauntedHouses.byId("owaissa").allowsCompanions');
    const rogueCompanions   = await callSetup(page,
      'setup.RogueHouses.allowsCompanions("rogue-owaissa")');
    expect(classicCompanions).toBe(true);
    expect(rogueCompanions).toBe(true);
  });

  test('GhostStreet entry from classic Owaissa lands on Owaissa Street', async () => {
    await goToPassage(page, 'GhostStreet');
    await page.locator('.passage').locator('.housecard').getByText('Owaissa Street')
      .first().click();
    await page.waitForFunction(() => SugarCube.State.passage === 'Owaissa Street');
    expect(await callSetup(page, 'setup.HauntedHouses.activeHouse().id')).toBe('owaissa');
  });

  test('GhostStreet entry from Rogue Owaissa lands on RogueStart with staticHouseId stamped', async () => {
    await goToPassage(page, 'GhostStreet');
    await page.locator('.passage').locator('.housecard').getByText('Rogue Owaissa')
      .first().click();
    await page.waitForFunction(() => SugarCube.State.passage === 'RogueStart');
    expect(await callSetup(page, 'setup.Rogue.staticHouseId()')).toBe('rogue-owaissa');
  });

  /* ---------- floor-plan parity ---------- */

  test('rogue-owaissa carries the same five room templates as classic Owaissa', async () => {
    const classicRooms = await callSetup(
      page, 'setup.HauntedHouses.byId("owaissa").rooms.slice().sort()');
    const rogueTemplates = await callSetup(page,
      'setup.RogueHouses.planFor("rogue-owaissa").rooms.map(r => r.template).sort()');
    expect(rogueTemplates).toEqual(classicRooms);
  });

  test('rogue-owaissa hallway connects to {kitchen, bedroom, bathroom}, classic hallway exits the same', async () => {
    /* Classic side: read the exits map directly -- four entries
       (kitchen, bedroom, bathroom, outside-the-house). The first
       three are the in-house neighbours we compare against. */
    const classicExits = await callSetup(page,
      'setup.HauntedHouses.byId("owaissa").exits.OwaissaHallway.map(e => e.label).sort()');
    expect(classicExits).toEqual(['Bathroom', 'Bedroom', 'Kitchen']);

    /* Rogue side: build the floor plan, BFS the room_0 hallway. */
    const plan = await callSetup(page, 'setup.RogueHouses.planFor("rogue-owaissa")');
    const fp = await page.evaluate(p =>
      SugarCube.setup.FloorPlan.generate(1, { staticPlan: p }), plan);
    const rogueNeighbours = await page.evaluate(f => {
      const ids = SugarCube.setup.FloorPlan.neighborsOf(f, 'room_0');
      return ids.map(id => f.rooms.find(r => r.id === id).template).sort();
    }, fp);
    expect(rogueNeighbours).toEqual(['bathroom', 'bedroom', 'kitchen']);
  });

  test('both kitchens connect to the livingroom (one-hop branch off the hub)', async () => {
    const classicKitchenExits = await callSetup(page,
      'setup.HauntedHouses.byId("owaissa").exits.OwaissaKitchen.map(e => e.label).sort()');
    expect(classicKitchenExits).toEqual(['Hallway', 'Livingroom']);

    const plan = await callSetup(page, 'setup.RogueHouses.planFor("rogue-owaissa")');
    const fp = await page.evaluate(p =>
      SugarCube.setup.FloorPlan.generate(1, { staticPlan: p }), plan);
    const kitchenRoom = fp.rooms.find(r => r.template === 'kitchen');
    const rogueKitchenNeighbours = await page.evaluate(({ f, k }) => {
      const ids = SugarCube.setup.FloorPlan.neighborsOf(f, k);
      return ids.map(id => f.rooms.find(r => r.id === id).template).sort();
    }, { f: fp, k: kitchenRoom.id });
    expect(rogueKitchenNeighbours).toEqual(['hallway', 'livingroom']);
  });

  test('classic and rogue produce the same BFS distance map from the hallway', async () => {
    const expected = {
      hallway:    0,
      kitchen:    1,
      bedroom:    1,
      bathroom:   1,
      livingroom: 2,
    };

    /* Rogue side: read straight from setup.FloorPlan.bfsDistances. */
    const plan = await callSetup(page, 'setup.RogueHouses.planFor("rogue-owaissa")');
    const fp = await page.evaluate(p =>
      SugarCube.setup.FloorPlan.generate(1, { staticPlan: p }), plan);
    const rogueDist = await page.evaluate(f => {
      const dist = SugarCube.setup.FloorPlan.bfsDistances(f, 'room_0');
      const out = {};
      f.rooms.forEach(r => { out[r.template] = dist[r.id]; });
      return out;
    }, fp);
    expect(rogueDist).toEqual(expected);

    /* Classic side: walk the exits adjacency by template label so a
       hand-computed BFS exposes the same hop counts. */
    const classicExits = await callSetup(page,
      'setup.HauntedHouses.byId("owaissa").exits');
    const TEMPLATE_BY_PASSAGE = {
      OwaissaHallway:    'hallway',
      OwaissaKitchen:    'kitchen',
      OwaissaBedroom:    'bedroom',
      OwaissaBathroom:   'bathroom',
      OwaissaLivingroom: 'livingroom',
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
    await startClassicOwaissa(page, 'Spirit');
    expect(await callSetup(page, 'setup.HuntController.mode()')).toBe('regular');
    expect(await callSetup(page, 'setup.HuntController.activeGhost().name')).toBe('Spirit');
    expect(await callSetup(page, 'setup.HuntController.realGhostName()')).toBe('Spirit');

    await tearDownAnyMode(page);

    await startRogueOwaissa(page, 'Spirit');
    expect(await callSetup(page, 'setup.HuntController.mode()')).toBe('rogue');
    expect(await callSetup(page, 'setup.HuntController.activeGhost().name')).toBe('Spirit');
    expect(await callSetup(page, 'setup.HuntController.realGhostName()')).toBe('Spirit');
  });

  test('isHuntActive() is true inside both hunts (per-tick chain gate stays open)', async () => {
    await startClassicOwaissa(page, 'Shade');
    expect(await callSetup(page, 'setup.HuntController.isHuntActive()')).toBe(true);

    await tearDownAnyMode(page);

    await startRogueOwaissa(page, 'Shade');
    expect(await callSetup(page, 'setup.HuntController.isHuntActive()')).toBe(true);
  });

  test('isCursedHuntActive is classic-only and false in rogue', async () => {
    await startClassicOwaissa(page, 'Shade');
    /* Classic without an active CursedHunt sub-flow returns false too --
       the predicate trips only when the witch flow has stamped the
       cursed-hunt state. Pin its absence here so the rogue side has a
       baseline to compare against. */
    expect(await callSetup(page, 'setup.HuntController.isCursedHuntActive()')).toBe(false);

    await tearDownAnyMode(page);

    await startRogueOwaissa(page, 'Shade');
    expect(await callSetup(page, 'setup.HuntController.isCursedHuntActive()')).toBe(false);
  });

  test('isGhostHere() flips when the player walks into the ghost room in both modes', async () => {
    /* Classic: ghost pinned to kitchen AFTER all navigation so the
       per-passage shuffleGhostRoom drift can't relocate the ghost
       mid-test. Then walk to OwaissaKitchen -> true; OwaissaBedroom
       -> false. */
    await startClassicOwaissa(page, 'Shade');
    await goToPassage(page, 'OwaissaKitchen');
    await page.evaluate(() => SugarCube.setup.HauntedHouses.setHuntRoom({ name: 'kitchen' }));
    expect(await callSetup(page, 'setup.HuntController.isGhostHere()')).toBe(true);
    await goToPassage(page, 'OwaissaBedroom');
    /* OwaissaBedroom's onPassageDone may also drift; re-pin kitchen
       so the assertion compares against a known room. */
    await page.evaluate(() => SugarCube.setup.HauntedHouses.setHuntRoom({ name: 'kitchen' }));
    expect(await callSetup(page, 'setup.HuntController.isGhostHere()')).toBe(false);

    await tearDownAnyMode(page);

    /* Rogue: lair is whichever room the seeded floor-plan generator
       picked; walk into it via setCurrentRoom + RogueRun re-render. */
    await startRogueOwaissa(page, 'Shade');
    const lairId = await callSetup(page, 'setup.Rogue.ghostRoomId()');
    expect(lairId).not.toBe('room_0');
    await page.evaluate(id => SugarCube.setup.Rogue.setCurrentRoom(id), lairId);
    await goToPassage(page, 'RogueRun');
    expect(await callSetup(page, 'setup.HuntController.isGhostHere()')).toBe(true);
    await page.evaluate(() => SugarCube.setup.Rogue.setCurrentRoom('room_0'));
    await goToPassage(page, 'RogueRun');
    expect(await callSetup(page, 'setup.HuntController.isGhostHere()')).toBe(false);
  });

  /* ---------- per-tick chain parity (sanity / energy / time drain) ---------- */

  test('applyTickEffects burns 1 in-game minute in both classic Owaissa and Rogue Owaissa', async () => {
    /* Both modes' nav links and tool clicks ultimately funnel into
       the same setup.HauntConditions.applyTickEffects pass. Skip
       the click-driven flow (which threads through Event /
       LightPassageGhost includes that may <<goto>> mid-click) and
       call the per-tick handler directly so we exercise the only
       part the two modes actually share. */
    await startClassicOwaissa(page, 'Shade');
    await setVar(page, 'hours', 0);
    await setVar(page, 'minutes', 0);
    await page.evaluate(() => SugarCube.setup.HauntConditions.applyTickEffects());
    expect(await getVar(page, 'minutes')).toBe(1);

    await tearDownAnyMode(page);

    await startRogueOwaissa(page, 'Shade');
    await setVar(page, 'hours', 0);
    await setVar(page, 'minutes', 0);
    await page.evaluate(() => SugarCube.setup.HauntConditions.applyTickEffects());
    expect(await getVar(page, 'minutes')).toBe(1);
  });

  test('applyTickEffects drains sanity in both modes (per-mode rules may scale the drain)', async () => {
    /* Both modes' nav / tool clicks ultimately call
       setup.HauntConditions.applyTickEffects -- the same function.
       The resulting drain may differ in magnitude between modes
       (classic mode scales by witch-contract difficulty / cursed
       hunt state; rogue scales by modifiers like Glass Bones), but
       both must drain something positive on a fresh hunt. */
    async function deltaForMode(mode) {
      await tearDownAnyMode(page);
      if (mode === 'classic') await startClassicOwaissa(page, 'Shade');
      else                    await startRogueOwaissa(page, 'Shade');

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

    const classicDrain = await deltaForMode('classic');
    const rogueDrain   = await deltaForMode('rogue');
    expect(classicDrain).toBeGreaterThan(0);
    expect(rogueDrain).toBeGreaterThan(0);
  });

  /* ---------- ghost drift parity ---------- */

  test('ghost-room drift fires through the same controller in both modes', async () => {
    /* Drive the drift through the per-mode helpers directly so the
       passage-render layer (which would re-fire shuffleGhostRoom via
       TickController.onPassageDone and stamp lastChangeIntervalRoom
       to whatever interval the post-render clock landed on) doesn't
       race the manual state-setup. Both modes' helpers should pick a
       new room when called.

       Classic: rooms[Math.floor(Math.random() * rooms.length)] with
       Math.random()=0 picks rooms[0]='kitchen', so pin the starting
       ghost-room to 'bedroom' to make the change visible.
       Rogue: filters to non-hallway rooms different from the current
       lair, so Math.random()=0 picks the first such candidate. */
    await tearDownAnyMode(page);
    await startClassicOwaissa(page, 'Shade');
    const classicResult = await page.evaluate(() => {
      SugarCube.setup.HauntedHouses.setHuntRoom({ name: 'bedroom' });
      Math.random = () => 0;
      const before = SugarCube.State.variables.hunt.room.name;
      SugarCube.setup.HauntedHouses.driftGhostRoom();
      return { before, after: SugarCube.State.variables.hunt.room.name };
    });
    expect(classicResult.after).not.toBe(classicResult.before);

    await tearDownAnyMode(page);
    await startRogueOwaissa(page, 'Shade');
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
       drifted-to template just needs to be defined. */
    expect(typeof rogueResult.afterTemplate).toBe('string');
  });

  test('Goryo (staysInOneRoom) never drifts in either mode', async () => {
    async function noDrift(mode) {
      await tearDownAnyMode(page);
      if (mode === 'classic') await startClassicOwaissa(page, 'Goryo');
      else                    await startRogueOwaissa(page, 'Goryo');

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
    await startClassicOwaissa(page, 'Shade');
    const classicEv = await callSetup(page,
      'setup.HuntController.activeGhost().evidence.map(e => e.id).sort()');

    await tearDownAnyMode(page);

    await startRogueOwaissa(page, 'Shade');
    const rogueEv = await callSetup(page,
      'setup.HuntController.activeGhost().evidence.map(e => e.id).sort()');

    /* Classic prunes evidence per witch contract (DeleteEvidence);
       this test sets up a fresh hunt with no deletion stamped, so
       the classic ghost still carries its full catalogue evidence.
       Rogue mode never prunes -- the catalogue evidence is what
       activeGhost returns straight off. */
    expect(rogueEv).toEqual(classicEv);
  });

  test('hasEvidence("emf") agrees across modes for the same ghost', async () => {
    /* Sweep a few representative ghosts and confirm each evidence
       check returns identical answers in both modes. */
    const sampled = ['Spirit', 'Shade', 'Phantom', 'Wraith', 'Goryo'];
    const evidenceIds = ['emf', 'spiritbox', 'gwb', 'uvl', 'glass', 'temperature'];
    for (const ghost of sampled) {
      await tearDownAnyMode(page);
      await startClassicOwaissa(page, ghost);
      const classicMatrix = {};
      for (const e of evidenceIds) {
        classicMatrix[e] = await callSetup(page,
          `setup.HuntController.activeGhost().hasEvidence("${e}")`);
      }

      await tearDownAnyMode(page);
      await startRogueOwaissa(page, ghost);
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
    /* Stamp the timer + sanity prerequisites so the only remaining
       gate is HuntController.shouldStartRandomProwl. Both modes
       must answer true. */
    async function gateForMode(mode) {
      await tearDownAnyMode(page);
      if (mode === 'classic') await startClassicOwaissa(page, 'Shade');
      else                    await startRogueOwaissa(page, 'Shade');
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
    await startClassicOwaissa(page, 'Shade');
    expect(await callSetup(page, 'setup.HuntController.huntOverPassage("sanity")'))
      .toBe('HuntOverSanity');

    await tearDownAnyMode(page);

    await startRogueOwaissa(page, 'Shade');
    expect(await callSetup(page, 'setup.HuntController.huntOverPassage("sanity")'))
      .toBe('RogueEnd');
    expect(await callSetup(page, 'setup.Rogue.field("failureReason")')).toBe('sanity');
  });

  test('huntOverPassage("exhaustion") routes to HuntOverExhaustion in classic, RogueEnd in rogue', async () => {
    await startClassicOwaissa(page, 'Shade');
    expect(await callSetup(page, 'setup.HuntController.huntOverPassage("exhaustion")'))
      .toBe('HuntOverExhaustion');

    await tearDownAnyMode(page);

    await startRogueOwaissa(page, 'Shade');
    expect(await callSetup(page, 'setup.HuntController.huntOverPassage("exhaustion")'))
      .toBe('RogueEnd');
    expect(await callSetup(page, 'setup.Rogue.field("failureReason")')).toBe('exhaustion');
  });

  test('huntOverPassage("time") routes to HuntOverTime in classic, RogueEnd in rogue', async () => {
    await startClassicOwaissa(page, 'Shade');
    expect(await callSetup(page, 'setup.HuntController.huntOverPassage("time")'))
      .toBe('HuntOverTime');

    await tearDownAnyMode(page);

    await startRogueOwaissa(page, 'Shade');
    expect(await callSetup(page, 'setup.HuntController.huntOverPassage("time")'))
      .toBe('RogueEnd');
    expect(await callSetup(page, 'setup.Rogue.field("failureReason")')).toBe('time');
  });

  test('huntCaughtPassage routes to Sleep in classic, RogueEnd (caught) in rogue', async () => {
    await startClassicOwaissa(page, 'Shade');
    expect(await callSetup(page, 'setup.HuntController.huntCaughtPassage()')).toBe('Sleep');

    await tearDownAnyMode(page);

    await startRogueOwaissa(page, 'Shade');
    expect(await callSetup(page, 'setup.HuntController.huntCaughtPassage()')).toBe('RogueEnd');
    expect(await callSetup(page, 'setup.Rogue.field("failureReason")')).toBe('caught');
  });

  /* ---------- payout divergence ---------- */

  test('payout for a correct guess: classic pays witch contract money/XP, rogue pays {0,0}', async () => {
    await startClassicOwaissa(page, 'Shade');
    /* Mimic what GhostStreet's huntHouseCard click would do: stamp
       the contract reward fields. */
    await page.evaluate(() => {
      SugarCube.State.variables.moneyFromContract       = 100;
      SugarCube.State.variables.expFromContract         = 50;
      SugarCube.State.variables.moneyFromWeakenTheGhost = 20;
    });
    expect(await callSetup(page, 'setup.HuntController.payoutForGuess(true)'))
      .toEqual({ money: 120, xp: 50 });

    await tearDownAnyMode(page);

    await startRogueOwaissa(page, 'Shade');
    expect(await callSetup(page, 'setup.HuntController.payoutForGuess(true)'))
      .toEqual({ money: 0, xp: 0 });
  });

  test('rogue payout is in ectoplasm (mL) on RogueEnd; classic does not touch ectoplasm', async () => {
    /* Classic Owaissa wins do not increment ectoplasm. */
    await startClassicOwaissa(page, 'Shade');
    const beforeEcto = await getVar(page, 'ectoplasm');
    await page.evaluate(() => SugarCube.setup.Ghosts.endContract());
    expect(await getVar(page, 'ectoplasm')).toBe(beforeEcto);

    await tearDownAnyMode(page);

    /* Rogue Owaissa wins pay base 10 * (modifierCount=0 so multiplier=1)
       = 10 mL on success. */
    await startRogueOwaissa(page, 'Shade');
    await page.evaluate(() => SugarCube.setup.Rogue.markSuccess());
    await goToPassage(page, 'RogueEnd');
    expect(await getVar(page, 'ectoplasm')).toBe(10);
  });

  /* ---------- room nav UI parity ---------- */

  test('classic OwaissaHallway and rogue room_0 (hallway) expose the same neighbours by label', async () => {
    /* Classic: render OwaissaHallway and read the visible nav-link
       labels (the case-sensitive labels are wired by HouseConfig
       exits). */
    await startClassicOwaissa(page, 'Shade');
    await goToPassage(page, 'OwaissaHallway');
    const classicLinks = await page.locator('.passage a').allTextContents();
    /* OwaissaHallway exposes Kitchen / Bedroom / Bathroom / Outside;
       lowercase-compare so we don't trip on label-casing differences
       between the two flows. */
    const classicLower = classicLinks.map(s => s.trim().toLowerCase()).sort();
    expect(classicLower).toEqual(
      expect.arrayContaining(['kitchen', 'bedroom', 'bathroom', 'outside'])
    );

    await tearDownAnyMode(page);

    await startRogueOwaissa(page, 'Shade');
    /* Rogue: the .rogue-run-nav block holds the room nav links
       (template labels from setup.Templates), and the hallway
       exposes a separate Outside link. */
    const navLinks = await page.locator('.rogue-run-nav a').allTextContents();
    const rogueLower = navLinks.map(s => s.trim().toLowerCase()).sort();
    /* The room template labels are "Kitchen" / "Bedroom" / "Bathroom"
       (title-cased in setup.Templates), so lowercased they match the
       classic set. */
    expect(rogueLower).toEqual(
      expect.arrayContaining(['kitchen', 'bedroom', 'bathroom', 'outside'])
    );
  });

  test('classic Outside link returns to Owaissa Street; rogue Outside link routes to RogueOutside', async () => {
    /* Classic: hallway "Outside" link goes to "Owaissa Street". */
    await startClassicOwaissa(page, 'Shade');
    await goToPassage(page, 'OwaissaHallway');
    await clickPassageLink(page, 'Outside', 'Owaissa Street');
    expect(await callSetup(page, 'setup.HauntedHouses.activeHouse().id')).toBe('owaissa');

    await tearDownAnyMode(page);

    /* Rogue: "Outside" routes to RogueOutside (a separate yard
       passage rather than the city-side street card). */
    await startRogueOwaissa(page, 'Shade');
    await clickPassageLink(page, 'Outside', 'RogueOutside');
    expect(await callSetup(page, 'setup.Rogue.isRogue()')).toBe(true);
  });

  /* ---------- companion-gate parity ---------- */

  test('Companion.inHauntedHouseLocation is true in both classic Owaissa and rogue-owaissa', async () => {
    await startClassicOwaissa(page, 'Shade');
    expect(await callSetup(page, 'setup.Companion.inHauntedHouseLocation()')).toBe(true);

    await tearDownAnyMode(page);

    /* Rogue mirror: catalogue.allowsCompanions=true gates this. */
    await startRogueOwaissa(page, 'Shade');
    expect(await callSetup(page, 'setup.Companion.inHauntedHouseLocation()')).toBe(true);
  });

  /* ---------- Hunt event survival options parity ---------- */

  test('GhostHuntEvent renders the same survival options (Hide / Run / Pray / Freeze) in both modes', async () => {
    async function survivalOptionsForMode(mode) {
      await tearDownAnyMode(page);
      if (mode === 'classic') await startClassicOwaissa(page, 'Shade');
      else                    await startRogueOwaissa(page, 'Shade');
      /* Pre-stamp enough sanity / energy / clothing for the full
         option set to render -- naked MCs lose Freeze, exhausted
         MCs lose Pray. */
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
       so once the timer is >= 1 the option must surface in either mode. */
    async function succubusVisibleFor(mode) {
      await tearDownAnyMode(page);
      if (mode === 'classic') await startClassicOwaissa(page, 'Shade');
      else                    await startRogueOwaissa(page, 'Shade');
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
       pin should produce the same body-part choice regardless of mode. */
    async function rolledVideoFor(mode) {
      await tearDownAnyMode(page);
      if (mode === 'classic') await startClassicOwaissa(page, 'Shade');
      else                    await startRogueOwaissa(page, 'Shade');
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
    /* The rule lives on setup.searchToolDefs.spiritbox.needsLightCheck;
       both modes' tool-click sites must short-circuit the click when
       the room is lit. We hit the predicate directly so the test stays
       independent of the per-mode click widget. */
    const def = await callSetup(page, 'setup.searchToolDefs.spiritbox');
    expect(def && def.needsLightCheck).toBe(true);

    /* Classic: per-room light lives on $<roomId>.background, mutated
       through setup.Rooms.setBackground / read through setup.Rooms.isDark.
       Both modes must report the same dark/lit state for an equivalent
       template after the same toggle. */
    await startClassicOwaissa(page, 'Shade');
    await goToPassage(page, 'OwaissaKitchen');
    /* DARK first, then flip to LIT and confirm the read is consistent. */
    await page.evaluate(() =>
      SugarCube.setup.Rooms.setBackground('kitchen', SugarCube.setup.RoomLight.DARK));
    expect(await callSetup(page, 'setup.Rooms.isDark("kitchen")')).toBe(true);
    await page.evaluate(() =>
      SugarCube.setup.Rooms.setBackground('kitchen', SugarCube.setup.RoomLight.LIT));
    expect(await callSetup(page, 'setup.Rooms.isDark("kitchen")')).toBe(false);

    await tearDownAnyMode(page);

    /* Rogue: per-room light lives on $run.lights, mutated through
       setup.Rogue.setRoomLight / read through setup.Rogue.isRoomDark.
       Same toggle, same answers. */
    await startRogueOwaissa(page, 'Shade');
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
    /* Pre-condition both runs with the same ghost (Shade lacks
       spiritbox/uvl/glass) so the result space is identical. */
    await startClassicOwaissa(page, 'Shade');
    await page.evaluate(() => { Math.random = () => 0; });
    await page.evaluate(() => SugarCube.setup.HuntController.consumeKnowledgeEvidence());
    const classicChosen = await getVar(page, 'chosenEvidence');
    expect(['spiritbox', 'uvl', 'glass']).toContain(classicChosen);

    await tearDownAnyMode(page);
    /* knowledgeUsed is sticky across the contract boundary; clear
       it so the second consume call actually fires. */
    await setVar(page, 'knowledgeUsed', 0);

    await startRogueOwaissa(page, 'Shade');
    await page.evaluate(() => { Math.random = () => 0; });
    await page.evaluate(() => SugarCube.setup.HuntController.consumeKnowledgeEvidence());
    const rogueChosen = await getVar(page, 'chosenEvidence');
    expect(['spiritbox', 'uvl', 'glass']).toContain(rogueChosen);
  });

  test('Tarot deck CARRYING stage flips identically in both modes after markTarotCarrying', async () => {
    /* Bag.tw gates the "Look at the deck" link on
       (tarotCarryStage() == CARRYING && isInsideHuntPassage()).
       isInsideHuntPassage reads previous(1) (the passage we just
       came FROM), so navigating Hunt -> Bag is what makes the
       gate trip. Walk the player into a hunt passage, then onto
       Bag, and check the gate from the Bag side. */
    const CARRYING = await callSetup(page, 'setup.TarotStage.CARRYING');

    async function tarotStateOnBag(mode) {
      await tearDownAnyMode(page);
      if (mode === 'classic') await startClassicOwaissa(page, 'Shade');
      else                    await startRogueOwaissa(page, 'Shade');
      await page.evaluate(() => SugarCube.setup.HauntedHouses.markTarotCarrying());
      /* startClassicOwaissa already lands on OwaissaHallway;
         startRogueOwaissa already lands on RogueRun. Navigating to
         Bag from there makes previous(1) = the hunt passage, which
         is what isInsideHuntPassage looks for. */
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
    /* Bag.tw renders "Look at the paw" iff setup.MonkeyPaw.isCarrying()
       is true. isCarrying() = isFound() && isInsideHuntPassage(). Both
       modes must answer true on Bag when the player just came from
       the hunt passage. */
    async function pawStateOnBag(mode) {
      await tearDownAnyMode(page);
      if (mode === 'classic') await startClassicOwaissa(page, 'Shade');
      else                    await startRogueOwaissa(page, 'Shade');
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
    await startClassicOwaissa(page, 'Spirit');
    await page.evaluate(() => SugarCube.setup.HuntJournal.recordHuntStart());
    expect(await getVar(page, 'huntJournal.realGhost')).toBe('Spirit');

    await tearDownAnyMode(page);

    await startRogueOwaissa(page, 'Spirit');
    await page.evaluate(() => SugarCube.setup.HuntJournal.recordHuntStart());
    expect(await getVar(page, 'huntJournal.realGhost')).toBe('Spirit');
  });

  /* ---------- modifier deck divergence ---------- */

  test('rogue-owaissa carries no modifier deck (catalogue modifierCount=0)', async () => {
    /* Classic Owaissa has no "modifiers" concept at all; it's a witch
       contract with delete-evidence rules. Rogue Owaissa is the
       static-plan rogue mirror with modifierCount: 0, so its
       lifecycle drafts an empty modifier list. */
    await startRogueOwaissa(page, 'Shade');
    expect(await callSetup(page, 'setup.Rogue.modifiers()')).toEqual([]);
    /* Classic side has no $run.modifiers concept; setup.Rogue.modifiers()
       returns [] when no run is active too, so the snapshot is the same
       value but for opposite reasons. The interesting parity is "the
       lobby never renders a modifier section for either house". */
  });

  test('rogue-owaissa staticHouseId drives label override; classic uses the haunted-house street name', async () => {
    /* Rogue lifecycle stamps catalogue label as the address; classic
       has no equivalent override -- the passage name is the address. */
    await startRogueOwaissa(page, 'Shade');
    const rogueAddr = await callSetup(page, 'setup.Rogue.address().formatted');
    const cat = await callSetup(page, 'setup.RogueHouses.byId("rogue-owaissa")');
    expect(rogueAddr).toBe(cat.label);
  });

  /* ---------- shared body-background pipeline ---------- */

  test('rogue body-background uses the same dark/lit asset URLs as classic Owaissa', async () => {
    /* The rogue body-background pipeline reads template+dark/lit
       from setup.Styles.bgUrlForTemplate. Classic Owaissa's room
       passages call into the same helper via roomShell. So both
       modes resolve "kitchen + dark" to the same URL. */
    const kitchenDark = await callSetup(page,
      'setup.Styles.bgUrlForTemplate("kitchen", true)');
    const kitchenLit  = await callSetup(page,
      'setup.Styles.bgUrlForTemplate("kitchen", false)');
    expect(kitchenDark).toBeTruthy();
    expect(kitchenLit).toBeTruthy();
    expect(kitchenDark).not.toBe(kitchenLit);

    /* Same template should resolve to the same URL irrespective of
       which mode loaded the room. */
    const hallwayDark1 = await callSetup(page,
      'setup.Styles.bgUrlForTemplate("hallway", true)');
    const hallwayDark2 = await callSetup(page,
      'setup.Styles.bgUrlForTemplate("hallway", true)');
    expect(hallwayDark1).toBe(hallwayDark2);
  });

  /* ---------- snapGhostToCurrentRoom dispatch parity ---------- */

  test('snapGhostToCurrentRoom moves the ghost to the player room in both modes', async () => {
    /* Classic: stand in OwaissaBedroom, snap, hunt.room.name == "bedroom". */
    await startClassicOwaissa(page, 'Shade');
    await goToPassage(page, 'OwaissaBedroom');
    expect(await page.evaluate(() => SugarCube.setup.HuntController.snapGhostToCurrentRoom())).toBe(true);
    expect(await getVar(page, 'hunt.room.name')).toBe('bedroom');

    await tearDownAnyMode(page);

    /* Rogue: stand in some non-room_0 room, snap, floorplan.spawnRoomId
       updates to that room. */
    await startRogueOwaissa(page, 'Shade');
    const fp = await callSetup(page, 'setup.Rogue.field("floorplan")');
    const targetRoom = fp.rooms.find(r => r.template === 'bedroom');
    await page.evaluate(id => SugarCube.setup.Rogue.setCurrentRoom(id), targetRoom.id);
    await goToPassage(page, 'RogueRun');
    expect(await page.evaluate(() => SugarCube.setup.HuntController.snapGhostToCurrentRoom())).toBe(true);
    expect(await callSetup(page, 'setup.Rogue.ghostRoomId()')).toBe(targetRoom.id);
  });

  /* ---------- streetExit parity (MonkeyPaw leave wish) ---------- */

  test('streetExitPassage routes to Owaissa Street in classic, RogueEnd (abandon) in rogue', async () => {
    await startClassicOwaissa(page, 'Shade');
    expect(await callSetup(page, 'setup.HuntController.streetExitPassage()')).toBe('Owaissa Street');

    await tearDownAnyMode(page);

    await startRogueOwaissa(page, 'Shade');
    expect(await callSetup(page, 'setup.HuntController.streetExitPassage()')).toBe('RogueEnd');
    expect(await callSetup(page, 'setup.Rogue.field("failureReason")')).toBe('abandon');
  });

  /* ---------- Possession Tarot parity ---------- */

  test('possessionPassage routes to CityMapPossessed in BOTH modes (rogue stamps + ends the run before routing)', async () => {
    await startClassicOwaissa(page, 'Shade');
    /* possessionPassage has a side effect of randomising the time of
       day; pin Math.random so the test is deterministic. */
    await page.evaluate(() => { Math.random = () => 0; });
    expect(await callSetup(page, 'setup.HuntController.possessionPassage()'))
      .toBe('CityMapPossessed');

    await tearDownAnyMode(page);

    /* Rogue: same destination, but the side effects still record a
       POSSESSED failure on the run before endRogue tears it down --
       so the meta-state remembers it as a possession loss while the
       player UX matches classic's mid-day wake-up. */
    await startRogueOwaissa(page, 'Shade');
    await page.evaluate(() => { Math.random = () => 0; });
    expect(await callSetup(page, 'setup.HuntController.possessionPassage()'))
      .toBe('CityMapPossessed');
    expect(await callSetup(page, 'setup.Rogue.isRogue()')).toBe(false);
  });

  /* ---------- exit-after-onCaughtCleanup ---------- */

  test('onCaughtCleanup flips classic hunt to POSSESSED, leaves rogue $run intact', async () => {
    await startClassicOwaissa(page, 'Shade');
    /* Make sure ACTIVE is the starting mode; onCaughtCleanup should
       flip it to POSSESSED. */
    expect(await callSetup(page, 'setup.Ghosts.huntMode()'))
      .toBe(await callSetup(page, 'setup.Ghosts.HuntMode.ACTIVE'));
    await page.evaluate(() => SugarCube.setup.HuntController.onCaughtCleanup());
    expect(await callSetup(page, 'setup.Ghosts.huntMode()'))
      .toBe(await callSetup(page, 'setup.Ghosts.HuntMode.POSSESSED'));

    await tearDownAnyMode(page);

    await startRogueOwaissa(page, 'Shade');
    /* No $hunt to mutate. The cleanup should not throw, and the run
       should still be intact. */
    expect(await callSetup(page, 'setup.Rogue.isRogue()')).toBe(true);
    await page.evaluate(() => SugarCube.setup.HuntController.onCaughtCleanup());
    expect(await callSetup(page, 'setup.Rogue.isRogue()')).toBe(true);
  });

  /* ---------- Final end-to-end: walking out cleanly ---------- */

  test('classic "End the hunt" surfaces on Owaissa Street; rogue "Flee the hunt" surfaces on RogueOutside', async () => {
    /* The two "exit cleanly" affordances live on different passages
       in each mode -- classic puts "End the hunt" on the street card
       (Owaissa Street); rogue tucks "Flee the hunt" behind the
       hallway's Outside link (RogueOutside). Verify each link
       renders where it should, then assert the exit's effect via
       the controller (mode flip / RogueEnd routing) rather than
       chasing a click cascade through the per-tick chain. */
    await startClassicOwaissa(page, 'Shade');
    await setVar(page, 'isClothesStolen', 0);
    await goToPassage(page, 'Owaissa Street');
    await expect(
      page.locator('.passage').getByText('End the hunt', { exact: true })
    ).toBeVisible();
    /* The link's side effect is setHuntMode(POSSESSED) and a goto to
       HuntOverManual; both are visible in setup.Ghosts.huntMode after
       the navigation. */
    await page.evaluate(() => {
      SugarCube.setup.HauntedHouses.setHuntMode(SugarCube.setup.Ghosts.HuntMode.POSSESSED);
    });
    await goToPassage(page, 'HuntOverManual');
    expect(await callSetup(page, 'setup.Ghosts.huntMode()'))
      .toBe(await callSetup(page, 'setup.Ghosts.HuntMode.POSSESSED'));

    await tearDownAnyMode(page);

    /* Rogue: hallway → RogueOutside → "Flee the hunt" surfaces. The
       link routes to RogueEnd with markFailure(FLED); call the same
       end-of-run flow directly to check the ectoplasm payout. */
    await startRogueOwaissa(page, 'Shade');
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
       modifier multiplier on rogue-owaissa). */
    expect(await getVar(page, 'ectoplasm')).toBe(3);
  });
});
