/**
 * Parity tests between classic Elm and rogue-elm.
 *
 * `rogue-elm` is a static-plan rogue house with the same nine
 * rooms and the same two-floor hub-and-spoke topology as classic
 * Elm. Identical coverage to rogue-owaissa-parity, just keyed on
 * Elm's bigger room set (downstairs hallway hub + upstairs
 * hallway hub branching to bathroomTwo / bedroomTwo / nursery).
 *
 * Per-house data is loaded straight from the catalogue, so a
 * future static rogue house plugged in through setup.RogueHouses
 * gets parity coverage by adding its own *-parity.spec.js
 * mirror; the lint test that checks "no per-house branches" lives
 * in rogue-owaissa-parity.spec.js and walks the catalogue.
 */
const { test, expect } = require('@playwright/test');
const { openGame, resetGame, setVar, callSetup } = require('./helpers');

test.describe('Rogue Elm parity', () => {
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

  /* Translate edges to alphabetical "min--max" pairs of templates so
     orderless edge-set comparison reduces to array equality. */
  const elmEdgeKeys = (rooms, edges) => {
    return edges.map(([a, b]) => {
      const tA = rooms.find(r => r.id === a).template;
      const tB = rooms.find(r => r.id === b).template;
      const [x, y] = [tA, tB].sort();
      return `${x}--${y}`;
    }).sort();
  };

  // --- Catalogue ---

  test('setup.RogueHouses lists rogue-elm', async () => {
    const ids = await callSetup(page, 'setup.RogueHouses.ids()');
    expect(ids).toContain('rogue-elm');
  });

  test('rogue-elm entry has label, image, level gate matching classic Elm', async () => {
    const h = await callSetup(page, 'setup.RogueHouses.byId("rogue-elm")');
    const classic = await callSetup(page, 'setup.HauntedHouses.byId("elm")');
    expect(h).not.toBeNull();
    expect(typeof h.label).toBe('string');
    expect(h.label.length).toBeGreaterThan(0);
    expect(h.image).toBe(classic.image);
    expect(h.levelGate).toBe(classic.levelGate);
  });

  test('rogue-elm allows companions (catalogue flag)', async () => {
    expect(await callSetup(page, 'setup.RogueHouses.allowsCompanions("rogue-elm")')).toBe(true);
  });

  // --- Plan blueprint parity ---

  test('rogue-elm plan has the same nine room templates as classic Elm', async () => {
    const classicRooms = await callSetup(
      page, 'setup.HauntedHouses.byId("elm").rooms.slice().sort()');
    const plan = await callSetup(page, 'setup.RogueHouses.planFor("rogue-elm")');
    const rogueTemplates = plan.rooms.map(r => r.template).slice().sort();
    expect(rogueTemplates).toEqual(classicRooms);
  });

  test('rogue-elm plan templates are all known to setup.Templates', async () => {
    const plan = await callSetup(page, 'setup.RogueHouses.planFor("rogue-elm")');
    for (const r of plan.rooms) {
      const t = await callSetup(page, `setup.Templates.byId(${JSON.stringify(r.template)})`);
      expect(t).not.toBeNull();
    }
  });

  test('rogue-elm plan has hallway as room_0 and eight edges (spanning tree, 9 rooms)', async () => {
    const plan = await callSetup(page, 'setup.RogueHouses.planFor("rogue-elm")');
    expect(plan.rooms[0].id).toBe('room_0');
    expect(plan.rooms[0].template).toBe('hallway');
    expect(plan.rooms.length).toBe(9);
    expect(plan.edges.length).toBe(8); // tree on 9 nodes
  });

  test('rogue-elm plan edges mirror classic Elm nav graph', async () => {
    /* Classic Elm exits encode a directed multigraph (each passage
       lists its outgoing links), but the underlying topology is
       undirected. Downstairs:
         hallway <-> {kitchen, bathroom, bedroom, basement}
       Staircase:
         hallway <-> hallwayUpstairs
       Upstairs:
         hallwayUpstairs <-> {bathroomTwo, bedroomTwo, nursery}
       Eight undirected edges total, shared between the two
       hub-and-spoke trees. */
    const expected = [
      'hallway--kitchen',
      'bathroom--hallway',
      'bedroom--hallway',
      'basement--hallway',
      'hallway--hallwayUpstairs',
      'bathroomTwo--hallwayUpstairs',
      'bedroomTwo--hallwayUpstairs',
      'hallwayUpstairs--nursery'
    ].map(s => s.split('--').sort().join('--')).sort();

    const plan = await callSetup(page, 'setup.RogueHouses.planFor("rogue-elm")');
    const got = elmEdgeKeys(plan.rooms, plan.edges);
    expect(got).toEqual(expected);
  });

  test('rogue-elm plan room degrees match the dual-hub Elm topology', async () => {
    /* Two hubs: downstairs hallway has degree 5 (kitchen, bathroom,
       bedroom, basement, hallwayUpstairs); upstairs hallway has
       degree 4 (bathroomTwo, bedroomTwo, nursery, hallway). Every
       other room is a leaf with degree 1. Sorted ascending: seven
       leaves (1) plus the two hubs (4, 5). */
    const plan = await callSetup(page, 'setup.RogueHouses.planFor("rogue-elm")');
    const degree = {};
    plan.rooms.forEach(r => { degree[r.id] = 0; });
    plan.edges.forEach(([a, b]) => { degree[a]++; degree[b]++; });
    const sortedDegrees = Object.values(degree).sort((a, b) => a - b);
    expect(sortedDegrees).toEqual([1, 1, 1, 1, 1, 1, 1, 4, 5]);
  });

  test('planFor returns a deep copy -- mutating the result does not corrupt the catalogue', async () => {
    const before = await callSetup(page, 'setup.RogueHouses.planFor("rogue-elm")');
    await page.evaluate(() => {
      const p = SugarCube.setup.RogueHouses.planFor('rogue-elm');
      p.rooms[0].template = 'corrupted';
      p.edges[0][0] = 'corrupted';
    });
    const after = await callSetup(page, 'setup.RogueHouses.planFor("rogue-elm")');
    expect(after).toEqual(before);
  });

  // --- Floor-plan generator integration ---

  test('FloorPlan.generate with the rogue-elm plan freezes rooms + edges across seeds', async () => {
    const plan = await callSetup(page, 'setup.RogueHouses.planFor("rogue-elm")');
    const seeds = [1, 2, 7, 100, 999, 12345];
    const shapes = [];
    for (const seed of seeds) {
      const fp = await page.evaluate(({ s, p }) =>
        SugarCube.setup.FloorPlan.generate(s, { staticPlan: p }),
        { s: seed, p: plan });
      shapes.push({ rooms: fp.rooms, edges: fp.edges });
    }
    for (let i = 1; i < shapes.length; i++) {
      expect(shapes[i].rooms).toEqual(shapes[0].rooms);
      expect(shapes[i].edges).toEqual(shapes[0].edges);
    }
  });

  test('FloorPlan.generate with the rogue-elm plan still rolls spawn + loot from the seed', async () => {
    const plan = await callSetup(page, 'setup.RogueHouses.planFor("rogue-elm")');
    const spawns = new Set();
    const lootCursed = new Set();
    for (let seed = 1; seed <= 30; seed++) {
      const fp = await page.evaluate(({ s, p }) =>
        SugarCube.setup.FloorPlan.generate(s, { staticPlan: p }),
        { s: seed, p: plan });
      spawns.add(fp.spawnRoomId);
      lootCursed.add(fp.loot.cursedItem);
    }
    expect(spawns.size).toBeGreaterThan(1);
    expect(lootCursed.size).toBeGreaterThan(1);
  });

  test('FloorPlan.generate with the rogue-elm plan honors connectivity invariant', async () => {
    const plan = await callSetup(page, 'setup.RogueHouses.planFor("rogue-elm")');
    for (const seed of [1, 2, 3, 100, 999]) {
      const fp = await page.evaluate(({ s, p }) =>
        SugarCube.setup.FloorPlan.generate(s, { staticPlan: p }),
        { s: seed, p: plan });
      const connected = await page.evaluate(f =>
        SugarCube.setup.FloorPlan.isConnected(f), fp);
      expect(connected).toBe(true);
    }
  });

  test('FloorPlan.generate with the rogue-elm plan picks a spawn from the full room list', async () => {
    /* Spawn picks uniformly across all rooms (hallway eligible),
       mirroring classic mode where the ghost can lair in the entry
       hallway. Pin only that the picked spawn is a real room id. */
    const plan = await callSetup(page, 'setup.RogueHouses.planFor("rogue-elm")');
    const allIds = plan.rooms.map(r => r.id);
    for (let seed = 1; seed <= 20; seed++) {
      const fp = await page.evaluate(({ s, p }) =>
        SugarCube.setup.FloorPlan.generate(s, { staticPlan: p }),
        { s: seed, p: plan });
      expect(allIds).toContain(fp.spawnRoomId);
    }
  });

  // --- Lifecycle integration ---

  test('startRogue with staticHouseId="rogue-elm" stamps the id on the run', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({
      seed: 1, staticHouseId: 'rogue-elm'
    }));
    expect(await callSetup(page, 'setup.Rogue.staticHouseId()')).toBe('rogue-elm');
    const house = await callSetup(page, 'setup.Rogue.staticHouse()');
    expect(house).not.toBeNull();
    expect(house.id).toBe('rogue-elm');
  });

  test('rogue-elm runs draft no modifiers (catalogue modifierCount: 0)', async () => {
    expect(await callSetup(page, 'setup.RogueHouses.byId("rogue-elm").modifierCount')).toBe(0);
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({
      seed: 1, staticHouseId: 'rogue-elm'
    }));
    expect(await callSetup(page, 'setup.Rogue.modifiers()')).toEqual([]);
  });

  test('rogue-elm modifier suppression is robust to seed changes', async () => {
    for (const seed of [1, 2, 7, 42, 999, 12345]) {
      await page.evaluate(({ s }) => {
        SugarCube.setup.Rogue.start({ seed: s });
        SugarCube.setup.Rogue.end();
        SugarCube.setup.Rogue.startRogue({ seed: s, staticHouseId: 'rogue-elm' });
      }, { s: seed });
      expect(await callSetup(page, 'setup.Rogue.modifiers()')).toEqual([]);
      await page.evaluate(() => SugarCube.setup.Rogue.endRogue(false));
    }
  });

  test('rogue-elm runs always have the same room set across seeds', async () => {
    const sigs = new Set();
    for (const seed of [1, 2, 7, 42, 999, 12345]) {
      await page.evaluate(({ s }) => {
        SugarCube.setup.Rogue.start({ seed: s });
        SugarCube.setup.Rogue.end();
        SugarCube.setup.Rogue.startRogue({ seed: s, staticHouseId: 'rogue-elm' });
      }, { s: seed });
      const fp = await callSetup(page, 'setup.Rogue.field("floorplan")');
      const sig = fp.rooms
        .map(r => `${r.id}:${r.template}`)
        .sort()
        .join('|');
      sigs.add(sig);
      await page.evaluate(() => SugarCube.setup.Rogue.endRogue(false));
    }
    expect(sigs.size).toBe(1);
  });

  test('rogue-elm run address label reads the catalogue label, not a generated street', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({
      seed: 1, staticHouseId: 'rogue-elm'
    }));
    const addr = await callSetup(page, 'setup.Rogue.address()');
    const cat = await callSetup(page, 'setup.RogueHouses.byId("rogue-elm")');
    expect(addr.formatted).toBe(cat.label);
  });

  // --- Companion gate parity ---

  test('Companion.inHauntedHouseLocation true while inside a rogue-elm run', async () => {
    await setVar(page, 'hauntedHouse', null);
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({
      seed: 1, staticHouseId: 'rogue-elm'
    }));
    expect(await callSetup(page, 'setup.Companion.inHauntedHouseLocation()')).toBe(true);
  });

  // --- Cross-mode parity ---

  test('rogue-elm room set has the same template multiset as classic Elm rooms array', async () => {
    /* Each template appears the same number of times in both lists.
       Catches a drift where the rogue plan picks up a duplicated
       template or drops a unique one. */
    const classic = await callSetup(
      page, 'setup.HauntedHouses.byId("elm").rooms.slice()');
    const plan = await callSetup(page, 'setup.RogueHouses.planFor("rogue-elm")');
    const rogue = plan.rooms.map(r => r.template);

    const tally = (arr) => {
      const m = {};
      arr.forEach(t => { m[t] = (m[t] || 0) + 1; });
      return m;
    };
    expect(tally(rogue)).toEqual(tally(classic));
  });

  test('rogue-elm neighbors of room_0 (downstairs hallway) match classic Elm hallway exits', async () => {
    /* Classic ElmHallway exits to bedroom, bathroom, kitchen,
       upstairs (ElmHallwayUpstairs), basement -- five branches.
       The rogue plan's downstairs hallway must reach the same
       five neighbors (regardless of seed; room_0 is fixed). */
    const plan = await callSetup(page, 'setup.RogueHouses.planFor("rogue-elm")');
    for (const seed of [1, 7, 42]) {
      const fp = await page.evaluate(({ s, p }) =>
        SugarCube.setup.FloorPlan.generate(s, { staticPlan: p }),
        { s: seed, p: plan });
      const nbrIds = await page.evaluate(f =>
        SugarCube.setup.FloorPlan.neighborsOf(f, 'room_0'), fp);
      const nbrTemplates = nbrIds
        .map(id => fp.rooms.find(r => r.id === id).template)
        .sort();
      expect(nbrTemplates).toEqual(['basement', 'bathroom', 'bedroom', 'hallwayUpstairs', 'kitchen']);
    }
  });

  test('rogue-elm upstairs hallway has bathroomTwo / bedroomTwo / nursery / hallway as neighbors', async () => {
    const plan = await callSetup(page, 'setup.RogueHouses.planFor("rogue-elm")');
    const fp = await page.evaluate(p =>
      SugarCube.setup.FloorPlan.generate(1, { staticPlan: p }), plan);
    const upHallway = fp.rooms.find(r => r.template === 'hallwayUpstairs');
    const nbrs = await page.evaluate(({ f, k }) =>
      SugarCube.setup.FloorPlan.neighborsOf(f, k), { f: fp, k: upHallway.id });
    const nbrTemplates = nbrs
      .map(id => fp.rooms.find(r => r.id === id).template)
      .sort();
    expect(nbrTemplates).toEqual(['bathroomTwo', 'bedroomTwo', 'hallway', 'nursery']);
  });

  test('rogue-elm BFS distances match the classic-Elm nav-graph distances from hallway', async () => {
    /* Classic Elm walking distances from the downstairs hallway:
         hallway:          0
         kitchen:          1
         bathroom:         1
         bedroom:          1
         basement:         1
         hallwayUpstairs:  1 (staircase)
         bathroomTwo:      2 (upstairs leaf)
         bedroomTwo:       2 (upstairs leaf)
         nursery:          2 (upstairs leaf)
       The rogue static plan must reproduce the same hop counts. */
    const plan = await callSetup(page, 'setup.RogueHouses.planFor("rogue-elm")');
    const fp = await page.evaluate(p =>
      SugarCube.setup.FloorPlan.generate(1, { staticPlan: p }), plan);
    const dist = await page.evaluate(f =>
      SugarCube.setup.FloorPlan.bfsDistances(f, 'room_0'), fp);
    const distByTemplate = {};
    fp.rooms.forEach(r => { distByTemplate[r.template] = dist[r.id]; });
    expect(distByTemplate).toEqual({
      hallway:         0,
      kitchen:         1,
      bathroom:        1,
      bedroom:         1,
      basement:        1,
      hallwayUpstairs: 1,
      bathroomTwo:     2,
      bedroomTwo:      2,
      nursery:         2
    });
  });

  test('every rogue-elm template has a body-background entry in setup.Styles.rogueRooms', async () => {
    /* The RogueRun bodyBackground widget reads bg art from
       setup.Styles.bgUrlForTemplate(templateId, dark). A static
       rogue house can use story-locked templates (Elm uses
       hallwayUpstairs / bathroomTwo / bedroomTwo) which the
       procedural pipeline never sees, so the rogueRooms style map
       must explicitly cover them. */
    const plan = await callSetup(page, 'setup.RogueHouses.planFor("rogue-elm")');
    for (const r of plan.rooms) {
      const lit = await callSetup(
        page, `setup.Styles.bgUrlForTemplate(${JSON.stringify(r.template)}, false)`);
      const dark = await callSetup(
        page, `setup.Styles.bgUrlForTemplate(${JSON.stringify(r.template)}, true)`);
      expect(lit, `lit bg for template ${r.template}`).not.toBeNull();
      expect(dark, `dark bg for template ${r.template}`).not.toBeNull();
    }
  });
});
