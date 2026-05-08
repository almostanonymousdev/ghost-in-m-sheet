/**
 * Parity tests between classic Ironclad and rogue-ironclad.
 *
 * `rogue-ironclad` is a static-plan rogue house with the same
 * eleven rooms and the same hub-and-spoke cellblock topology as
 * classic Ironclad: the hallway is the entry hub branching to
 * reception, kitchen, and the two cellblock hubs (BlockA and
 * BlockB). Each block hub branches to its three cells.
 *
 * Identical coverage to rogue-owaissa-parity / rogue-elm-parity,
 * keyed on Ironclad's larger room set + the catalogue's
 * companion opt-out (Ironclad classically excludes companions
 * from the prison hunt path; the rogue mirror inherits that flag
 * via the catalogue, not a per-house branch).
 */
const { test, expect } = require('@playwright/test');
const { openGame, resetGame, setVar, callSetup } = require('./helpers');

test.describe('Rogue Ironclad parity', () => {
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
  const ironcladEdgeKeys = (rooms, edges) => {
    return edges.map(([a, b]) => {
      const tA = rooms.find(r => r.id === a).template;
      const tB = rooms.find(r => r.id === b).template;
      const [x, y] = [tA, tB].sort();
      return `${x}--${y}`;
    }).sort();
  };

  // --- Catalogue ---

  test('setup.RogueHouses lists rogue-ironclad', async () => {
    const ids = await callSetup(page, 'setup.RogueHouses.ids()');
    expect(ids).toContain('rogue-ironclad');
  });

  test('rogue-ironclad entry has label, image, level gate matching classic Ironclad', async () => {
    const h = await callSetup(page, 'setup.RogueHouses.byId("rogue-ironclad")');
    const classic = await callSetup(page, 'setup.HauntedHouses.byId("ironclad")');
    expect(h).not.toBeNull();
    expect(typeof h.label).toBe('string');
    expect(h.label.length).toBeGreaterThan(0);
    expect(h.image).toBe(classic.image);
    expect(h.levelGate).toBe(classic.levelGate);
  });

  test('rogue-ironclad opts out of companions, matching classic Ironclad', async () => {
    /* Classic HOUSE_CONFIG.ironclad sets allowsCompanions: false;
       the rogue mirror inherits that. The catalogue carries the
       flag -- the companion gate (Companion.inHauntedHouseLocation)
       reads it through setup.RogueHouses.allowsCompanions, no
       per-house branch in the predicate. */
    expect(await callSetup(page, 'setup.RogueHouses.allowsCompanions("rogue-ironclad")')).toBe(false);
    expect(await callSetup(page, 'setup.HauntedHouses.byId("ironclad").allowsCompanions')).toBe(false);
  });

  // --- Plan blueprint parity ---

  test('rogue-ironclad plan has the same eleven room templates as classic Ironclad', async () => {
    const classicRooms = await callSetup(
      page, 'setup.HauntedHouses.byId("ironclad").rooms.slice().sort()');
    const plan = await callSetup(page, 'setup.RogueHouses.planFor("rogue-ironclad")');
    const rogueTemplates = plan.rooms.map(r => r.template).slice().sort();
    expect(rogueTemplates).toEqual(classicRooms);
  });

  test('rogue-ironclad plan templates are all known to setup.Templates', async () => {
    const plan = await callSetup(page, 'setup.RogueHouses.planFor("rogue-ironclad")');
    for (const r of plan.rooms) {
      const t = await callSetup(page, `setup.Templates.byId(${JSON.stringify(r.template)})`);
      expect(t).not.toBeNull();
    }
  });

  test('rogue-ironclad plan has hallway as room_0 and ten edges (spanning tree, 11 rooms)', async () => {
    const plan = await callSetup(page, 'setup.RogueHouses.planFor("rogue-ironclad")');
    expect(plan.rooms[0].id).toBe('room_0');
    expect(plan.rooms[0].template).toBe('hallway');
    expect(plan.rooms.length).toBe(11);
    expect(plan.edges.length).toBe(10); // tree on 11 nodes
  });

  test('rogue-ironclad plan edges mirror classic Ironclad nav graph', async () => {
    /* Classic Ironclad exits encode a directed multigraph (each
       passage lists its outgoing links), but the underlying
       topology is undirected:
         hallway <-> {reception, kitchen, BlockA, BlockB}
         BlockA  <-> {BlockACellA, BlockACellB, BlockACellC}
         BlockB  <-> {BlockBCellA, BlockBCellB, BlockBCellC}
       Ten undirected edges total. */
    const expected = [
      'hallway--reception',
      'hallway--kitchen',
      'BlockA--hallway',
      'BlockB--hallway',
      'BlockA--BlockACellA',
      'BlockA--BlockACellB',
      'BlockA--BlockACellC',
      'BlockB--BlockBCellA',
      'BlockB--BlockBCellB',
      'BlockB--BlockBCellC'
    ].map(s => s.split('--').sort().join('--')).sort();

    const plan = await callSetup(page, 'setup.RogueHouses.planFor("rogue-ironclad")');
    const got = ironcladEdgeKeys(plan.rooms, plan.edges);
    expect(got).toEqual(expected);
  });

  test('rogue-ironclad plan room degrees match the entrance + dual-block topology', async () => {
    /* Three hubs:
         hallway:  degree 4 (reception, kitchen, BlockA, BlockB)
         BlockA:   degree 4 (3 cells + hallway)
         BlockB:   degree 4 (3 cells + hallway)
       Eight leaves (reception, kitchen, six cells), each degree 1.
       Sorted ascending: 8 ones + three fours. */
    const plan = await callSetup(page, 'setup.RogueHouses.planFor("rogue-ironclad")');
    const degree = {};
    plan.rooms.forEach(r => { degree[r.id] = 0; });
    plan.edges.forEach(([a, b]) => { degree[a]++; degree[b]++; });
    const sortedDegrees = Object.values(degree).sort((a, b) => a - b);
    expect(sortedDegrees).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 4, 4, 4]);
  });

  test('planFor returns a deep copy -- mutating the result does not corrupt the catalogue', async () => {
    const before = await callSetup(page, 'setup.RogueHouses.planFor("rogue-ironclad")');
    await page.evaluate(() => {
      const p = SugarCube.setup.RogueHouses.planFor('rogue-ironclad');
      p.rooms[0].template = 'corrupted';
      p.edges[0][0] = 'corrupted';
    });
    const after = await callSetup(page, 'setup.RogueHouses.planFor("rogue-ironclad")');
    expect(after).toEqual(before);
  });

  // --- Floor-plan generator integration ---

  test('FloorPlan.generate with the rogue-ironclad plan freezes rooms + edges across seeds', async () => {
    const plan = await callSetup(page, 'setup.RogueHouses.planFor("rogue-ironclad")');
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

  test('FloorPlan.generate with the rogue-ironclad plan still rolls spawn from the seed', async () => {
    const plan = await callSetup(page, 'setup.RogueHouses.planFor("rogue-ironclad")');
    const spawns = new Set();
    for (let seed = 1; seed <= 30; seed++) {
      const fp = await page.evaluate(({ s, p }) =>
        SugarCube.setup.FloorPlan.generate(s, { staticPlan: p }),
        { s: seed, p: plan });
      spawns.add(fp.spawnRoomId);
    }
    expect(spawns.size).toBeGreaterThan(1);
  });

  test('FloorPlan.generate with the rogue-ironclad plan honors connectivity invariant', async () => {
    const plan = await callSetup(page, 'setup.RogueHouses.planFor("rogue-ironclad")');
    for (const seed of [1, 2, 3, 100, 999]) {
      const fp = await page.evaluate(({ s, p }) =>
        SugarCube.setup.FloorPlan.generate(s, { staticPlan: p }),
        { s: seed, p: plan });
      const connected = await page.evaluate(f =>
        SugarCube.setup.FloorPlan.isConnected(f), fp);
      expect(connected).toBe(true);
    }
  });

  test('FloorPlan.generate with the rogue-ironclad plan keeps spawn off the hallway', async () => {
    const plan = await callSetup(page, 'setup.RogueHouses.planFor("rogue-ironclad")');
    for (let seed = 1; seed <= 20; seed++) {
      const fp = await page.evaluate(({ s, p }) =>
        SugarCube.setup.FloorPlan.generate(s, { staticPlan: p }),
        { s: seed, p: plan });
      expect(fp.spawnRoomId).not.toBe('room_0');
    }
  });

  // --- Lifecycle integration ---

  test('startRogue with staticHouseId="rogue-ironclad" stamps the id on the run', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({
      seed: 1, staticHouseId: 'rogue-ironclad'
    }));
    expect(await callSetup(page, 'setup.Rogue.staticHouseId()')).toBe('rogue-ironclad');
    const house = await callSetup(page, 'setup.Rogue.staticHouse()');
    expect(house).not.toBeNull();
    expect(house.id).toBe('rogue-ironclad');
  });

  test('rogue-ironclad runs always have the same room set across seeds', async () => {
    const sigs = new Set();
    for (const seed of [1, 2, 7, 42, 999, 12345]) {
      await page.evaluate(({ s }) => {
        SugarCube.setup.Rogue.start({ seed: s });
        SugarCube.setup.Rogue.end();
        SugarCube.setup.Rogue.startRogue({ seed: s, staticHouseId: 'rogue-ironclad' });
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

  test('rogue-ironclad run address label reads the catalogue label, not a generated street', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({
      seed: 1, staticHouseId: 'rogue-ironclad'
    }));
    const addr = await callSetup(page, 'setup.Rogue.address()');
    const cat = await callSetup(page, 'setup.RogueHouses.byId("rogue-ironclad")');
    expect(addr.formatted).toBe(cat.label);
  });

  // --- Companion gate parity (catalogue opts out for ironclad) ---

  test('Companion.inHauntedHouseLocation false while inside a rogue-ironclad run', async () => {
    /* Classic Ironclad has allowsCompanions:false so the predicate
       is false. The rogue mirror inherits the flag through
       setup.RogueHouses.allowsCompanions, so the predicate stays
       false in rogue-ironclad too -- no per-house branch involved. */
    await setVar(page, 'hauntedHouse', null);
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({
      seed: 1, staticHouseId: 'rogue-ironclad'
    }));
    expect(await callSetup(page, 'setup.Companion.inHauntedHouseLocation()')).toBe(false);
  });

  // --- Cross-mode parity ---

  test('rogue-ironclad room set has the same template multiset as classic Ironclad rooms array', async () => {
    const classic = await callSetup(
      page, 'setup.HauntedHouses.byId("ironclad").rooms.slice()');
    const plan = await callSetup(page, 'setup.RogueHouses.planFor("rogue-ironclad")');
    const rogue = plan.rooms.map(r => r.template);

    const tally = (arr) => {
      const m = {};
      arr.forEach(t => { m[t] = (m[t] || 0) + 1; });
      return m;
    };
    expect(tally(rogue)).toEqual(tally(classic));
  });

  test('rogue-ironclad neighbors of room_0 (hallway) match classic Ironclad hallway exits', async () => {
    /* Classic IroncladHallway exits to Reception, Kitchen, BlockA,
       BlockB -- four branches. The rogue plan's hallway must reach
       the same four neighbors regardless of seed. */
    const plan = await callSetup(page, 'setup.RogueHouses.planFor("rogue-ironclad")');
    for (const seed of [1, 7, 42]) {
      const fp = await page.evaluate(({ s, p }) =>
        SugarCube.setup.FloorPlan.generate(s, { staticPlan: p }),
        { s: seed, p: plan });
      const nbrIds = await page.evaluate(f =>
        SugarCube.setup.FloorPlan.neighborsOf(f, 'room_0'), fp);
      const nbrTemplates = nbrIds
        .map(id => fp.rooms.find(r => r.id === id).template)
        .sort();
      expect(nbrTemplates).toEqual(['BlockA', 'BlockB', 'kitchen', 'reception']);
    }
  });

  test('rogue-ironclad BlockA reaches its three cells plus the hallway', async () => {
    const plan = await callSetup(page, 'setup.RogueHouses.planFor("rogue-ironclad")');
    const fp = await page.evaluate(p =>
      SugarCube.setup.FloorPlan.generate(1, { staticPlan: p }), plan);
    const blockA = fp.rooms.find(r => r.template === 'BlockA');
    const nbrs = await page.evaluate(({ f, k }) =>
      SugarCube.setup.FloorPlan.neighborsOf(f, k), { f: fp, k: blockA.id });
    const nbrTemplates = nbrs
      .map(id => fp.rooms.find(r => r.id === id).template)
      .sort();
    expect(nbrTemplates).toEqual(['BlockACellA', 'BlockACellB', 'BlockACellC', 'hallway']);
  });

  test('rogue-ironclad BlockB reaches its three cells plus the hallway', async () => {
    const plan = await callSetup(page, 'setup.RogueHouses.planFor("rogue-ironclad")');
    const fp = await page.evaluate(p =>
      SugarCube.setup.FloorPlan.generate(1, { staticPlan: p }), plan);
    const blockB = fp.rooms.find(r => r.template === 'BlockB');
    const nbrs = await page.evaluate(({ f, k }) =>
      SugarCube.setup.FloorPlan.neighborsOf(f, k), { f: fp, k: blockB.id });
    const nbrTemplates = nbrs
      .map(id => fp.rooms.find(r => r.id === id).template)
      .sort();
    expect(nbrTemplates).toEqual(['BlockBCellA', 'BlockBCellB', 'BlockBCellC', 'hallway']);
  });

  test('rogue-ironclad cells are leaves (each cell has exactly one neighbor: its block)', async () => {
    const plan = await callSetup(page, 'setup.RogueHouses.planFor("rogue-ironclad")');
    const fp = await page.evaluate(p =>
      SugarCube.setup.FloorPlan.generate(1, { staticPlan: p }), plan);
    const cellTemplates = [
      'BlockACellA', 'BlockACellB', 'BlockACellC',
      'BlockBCellA', 'BlockBCellB', 'BlockBCellC'
    ];
    for (const tmpl of cellTemplates) {
      const room = fp.rooms.find(r => r.template === tmpl);
      const nbrs = await page.evaluate(({ f, k }) =>
        SugarCube.setup.FloorPlan.neighborsOf(f, k), { f: fp, k: room.id });
      expect(nbrs.length).toBe(1);
      const parent = fp.rooms.find(r => r.id === nbrs[0]);
      // BlockA cells are children of BlockA; BlockB cells of BlockB.
      expect(parent.template).toBe(tmpl.startsWith('BlockA') ? 'BlockA' : 'BlockB');
    }
  });

  test('rogue-ironclad BFS distances match the classic-Ironclad nav-graph distances from hallway', async () => {
    /* Classic Ironclad walking distances from the hallway:
         hallway:     0
         reception:   1
         kitchen:     1
         BlockA:      1
         BlockB:      1
         BlockACellA: 2 (hallway -> BlockA -> cell)
         BlockACellB: 2
         BlockACellC: 2
         BlockBCellA: 2
         BlockBCellB: 2
         BlockBCellC: 2
       The rogue static plan must reproduce the same hop counts. */
    const plan = await callSetup(page, 'setup.RogueHouses.planFor("rogue-ironclad")');
    const fp = await page.evaluate(p =>
      SugarCube.setup.FloorPlan.generate(1, { staticPlan: p }), plan);
    const dist = await page.evaluate(f =>
      SugarCube.setup.FloorPlan.bfsDistances(f, 'room_0'), fp);
    const distByTemplate = {};
    fp.rooms.forEach(r => { distByTemplate[r.template] = dist[r.id]; });
    expect(distByTemplate).toEqual({
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
      BlockBCellC: 2
    });
  });

  test('every rogue-ironclad template has a body-background entry in setup.Styles.rogueRooms', async () => {
    /* Ironclad templates (reception, BlockA/B, the six cells) are
       not procedurally eligible, so the rogueRooms style map must
       carry their prison art for the static-plan path to render. */
    const plan = await callSetup(page, 'setup.RogueHouses.planFor("rogue-ironclad")');
    for (const r of plan.rooms) {
      const lit = await callSetup(
        page, `setup.Styles.bgUrlForTemplate(${JSON.stringify(r.template)}, false)`);
      const dark = await callSetup(
        page, `setup.Styles.bgUrlForTemplate(${JSON.stringify(r.template)}, true)`);
      expect(lit, `lit bg for template ${r.template}`).not.toBeNull();
      expect(dark, `dark bg for template ${r.template}`).not.toBeNull();
    }
  });

  test('all three rogue houses appear in the catalogue after rogue-ironclad lands', async () => {
    /* Sanity check: the three static rogue mirrors of the classic
       authored houses are all present. Adding a fourth would
       just bump this assertion. */
    const ids = await callSetup(page, 'setup.RogueHouses.ids()');
    expect(ids.sort()).toEqual(['rogue-elm', 'rogue-ironclad', 'rogue-owaissa']);
  });
});
