/**
 * Parity tests between classic Owaissa and rogue-owaissa.
 *
 * `rogue-owaissa` is a static-plan rogue house: same five rooms,
 * same hub-and-branch topology as classic Owaissa, but routed
 * through the rogue lifecycle ($run, ectoplasm payout, modifiers
 * draft) rather than the witch-contract bundle. These tests pin
 * down the parity invariants so the two houses can never drift
 * structurally:
 *
 *   - rogue-owaissa exposes the classic Owaissa room set, the
 *     classic Owaissa edge graph, and the classic-Owaissa
 *     room-template ids
 *   - the floor plan is static across seeds: spawn / loot may
 *     vary, but rooms + edges + templates do not
 *   - the companion gate opens for rogue-owaissa exactly as it
 *     does for classic Owaissa, driven by the catalogue, not by
 *     per-house branches
 *
 * The intent is also to catch the "if rogue_owaissa do A else do B"
 * regression: every assertion below is generic over the catalogue
 * (setup.RogueHouses, HOUSE_CONFIG.allowsCompanions, the floor-plan
 * generator's staticPlan opt) so the only place a new static rogue
 * house gets defined is the catalogue entry itself.
 */
const { test, expect } = require('@playwright/test');
const { openGame, resetGame, setVar, callSetup } = require('./helpers');

test.describe('Rogue Owaissa parity', () => {
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

  /* Convenience: the canonical edge set for classic Owaissa,
     normalised to a sorted "min--max" form so unordered comparisons
     are array-of-string equality. Used both for the catalogue
     check and for the rogue floor plan check below. */
  const owaissaEdgeKeys = (rooms, edges) => {
    const idByTemplate = {};
    rooms.forEach(r => { idByTemplate[r.template] = r.id; });
    return edges.map(([a, b]) => {
      const tA = rooms.find(r => r.id === a).template;
      const tB = rooms.find(r => r.id === b).template;
      const [x, y] = [tA, tB].sort();
      return `${x}--${y}`;
    }).sort();
  };

  // --- Catalogue ---

  test('setup.RogueHouses lists rogue-owaissa', async () => {
    const ids = await callSetup(page, 'setup.RogueHouses.ids()');
    expect(ids).toContain('rogue-owaissa');
  });

  test('rogue-owaissa entry has label, image, level gate', async () => {
    const h = await callSetup(page, 'setup.RogueHouses.byId("rogue-owaissa")');
    expect(h).not.toBeNull();
    expect(typeof h.label).toBe('string');
    expect(h.label.length).toBeGreaterThan(0);
    expect(typeof h.image).toBe('string');
    expect(typeof h.levelGate).toBe('number');
  });

  test('rogue-owaissa allows companions (catalogue flag)', async () => {
    expect(await callSetup(page, 'setup.RogueHouses.allowsCompanions("rogue-owaissa")')).toBe(true);
  });

  test('unknown rogue-house ids resolve to null / false', async () => {
    expect(await callSetup(page, 'setup.RogueHouses.byId("does-not-exist")')).toBeNull();
    expect(await callSetup(page, 'setup.RogueHouses.allowsCompanions("does-not-exist")')).toBe(false);
    expect(await callSetup(page, 'setup.RogueHouses.planFor("does-not-exist")')).toBeNull();
  });

  // --- Plan blueprint parity ---

  test('rogue-owaissa plan has the same five room templates as classic Owaissa', async () => {
    const classicRooms = await callSetup(
      page, 'setup.HauntedHouses.byId("owaissa").rooms.slice().sort()');
    const plan = await callSetup(page, 'setup.RogueHouses.planFor("rogue-owaissa")');
    const rogueTemplates = plan.rooms.map(r => r.template).slice().sort();
    expect(rogueTemplates).toEqual(classicRooms);
  });

  test('rogue-owaissa plan templates are all known to setup.Templates', async () => {
    const plan = await callSetup(page, 'setup.RogueHouses.planFor("rogue-owaissa")');
    for (const r of plan.rooms) {
      const t = await callSetup(page, `setup.Templates.byId(${JSON.stringify(r.template)})`);
      expect(t).not.toBeNull();
    }
  });

  test('rogue-owaissa plan has hallway as room_0 and four edges (spanning tree, 5 rooms)', async () => {
    const plan = await callSetup(page, 'setup.RogueHouses.planFor("rogue-owaissa")');
    expect(plan.rooms[0].id).toBe('room_0');
    expect(plan.rooms[0].template).toBe('hallway');
    expect(plan.rooms.length).toBe(5);
    expect(plan.edges.length).toBe(4); // tree on 5 nodes
  });

  test('rogue-owaissa plan edges mirror classic Owaissa nav graph', async () => {
    /* Classic Owaissa exits encode a directed multigraph (each
       passage lists its outgoing links), but the underlying
       topology is undirected:
         hallway <-> {kitchen, bedroom, bathroom}
         kitchen <-> livingroom
       The rogue plan is a tree on the same templates with the same
       undirected edges -- compare the canonical edge set
       (alphabetical low--high so unordered comparison is just
       string equality). */
    const expected = [
      'bathroom--hallway',
      'bedroom--hallway',
      'hallway--kitchen',
      'kitchen--livingroom'
    ].sort();

    const plan = await callSetup(page, 'setup.RogueHouses.planFor("rogue-owaissa")');
    const got = owaissaEdgeKeys(plan.rooms, plan.edges);
    expect(got).toEqual(expected);
  });

  test('rogue-owaissa plan is a tree (every non-root room has one parent edge)', async () => {
    const plan = await callSetup(page, 'setup.RogueHouses.planFor("rogue-owaissa")');
    /* For a tree with N rooms there are exactly N-1 edges and the
       graph is connected; both invariants are checked elsewhere,
       but spell out the per-room degree here so a future "add a
       cycle" regression fails loudly. */
    const degree = {};
    plan.rooms.forEach(r => { degree[r.id] = 0; });
    plan.edges.forEach(([a, b]) => { degree[a]++; degree[b]++; });
    /* Hallway is the hub with degree 3; kitchen has 2 (hallway +
       livingroom); the three leaves have 1. */
    const sortedDegrees = Object.values(degree).sort();
    expect(sortedDegrees).toEqual([1, 1, 1, 2, 3]);
  });

  test('planFor returns a deep copy -- mutating the result does not corrupt the catalogue', async () => {
    const before = await callSetup(page, 'setup.RogueHouses.planFor("rogue-owaissa")');
    await page.evaluate(() => {
      const p = SugarCube.setup.RogueHouses.planFor('rogue-owaissa');
      p.rooms[0].template = 'corrupted';
      p.edges[0][0] = 'corrupted';
    });
    const after = await callSetup(page, 'setup.RogueHouses.planFor("rogue-owaissa")');
    expect(after).toEqual(before);
  });

  // --- Floor-plan generator integration ---

  test('FloorPlan.generate with staticPlan freezes rooms + edges across seeds', async () => {
    const plan = await callSetup(page, 'setup.RogueHouses.planFor("rogue-owaissa")');
    const seeds = [1, 2, 7, 100, 999, 12345];
    const shapes = [];
    for (const seed of seeds) {
      const fp = await page.evaluate(({ s, p }) =>
        SugarCube.setup.FloorPlan.generate(s, { staticPlan: p }),
        { s: seed, p: plan });
      shapes.push({
        rooms: fp.rooms,
        edges: fp.edges
      });
    }
    /* All seeds produce identical room+edge shapes -- the topology
       is static. Spawn / loot still vary by seed. */
    for (let i = 1; i < shapes.length; i++) {
      expect(shapes[i].rooms).toEqual(shapes[0].rooms);
      expect(shapes[i].edges).toEqual(shapes[0].edges);
    }
  });

  test('FloorPlan.generate with staticPlan still rolls spawn + loot from the seed', async () => {
    /* Static topology, dynamic placements. Run the generator over
       a wide seed range; rooms+edges stay constant but spawn and
       loot must vary at least sometimes (otherwise the seed isn't
       being threaded through). */
    const plan = await callSetup(page, 'setup.RogueHouses.planFor("rogue-owaissa")');
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

  test('FloorPlan.generate with staticPlan honors connectivity invariant', async () => {
    const plan = await callSetup(page, 'setup.RogueHouses.planFor("rogue-owaissa")');
    for (const seed of [1, 2, 3, 100, 999]) {
      const fp = await page.evaluate(({ s, p }) =>
        SugarCube.setup.FloorPlan.generate(s, { staticPlan: p }),
        { s: seed, p: plan });
      const connected = await page.evaluate(f =>
        SugarCube.setup.FloorPlan.isConnected(f), fp);
      expect(connected).toBe(true);
    }
  });

  test('FloorPlan.generate with staticPlan keeps spawn off the hallway', async () => {
    const plan = await callSetup(page, 'setup.RogueHouses.planFor("rogue-owaissa")');
    for (let seed = 1; seed <= 20; seed++) {
      const fp = await page.evaluate(({ s, p }) =>
        SugarCube.setup.FloorPlan.generate(s, { staticPlan: p }),
        { s: seed, p: plan });
      expect(fp.spawnRoomId).not.toBe('room_0');
    }
  });

  test('FloorPlan.generate is deterministic for (seed, staticPlan) pairs', async () => {
    const plan = await callSetup(page, 'setup.RogueHouses.planFor("rogue-owaissa")');
    const a = await page.evaluate(({ s, p }) =>
      SugarCube.setup.FloorPlan.generate(s, { staticPlan: p }),
      { s: 42, p: plan });
    const b = await page.evaluate(({ s, p }) =>
      SugarCube.setup.FloorPlan.generate(s, { staticPlan: p }),
      { s: 42, p: plan });
    expect(a).toEqual(b);
  });

  // --- Lifecycle integration ---

  test('startRogue with staticHouseId="rogue-owaissa" stamps the id on the run', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({
      seed: 1, staticHouseId: 'rogue-owaissa'
    }));
    expect(await callSetup(page, 'setup.Rogue.staticHouseId()')).toBe('rogue-owaissa');
    const house = await callSetup(page, 'setup.Rogue.staticHouse()');
    expect(house).not.toBeNull();
    expect(house.id).toBe('rogue-owaissa');
  });

  test('startRogue without staticHouseId leaves staticHouseId null (procedural mode)', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({ seed: 1 }));
    expect(await callSetup(page, 'setup.Rogue.staticHouseId()')).toBeNull();
    expect(await callSetup(page, 'setup.Rogue.staticHouse()')).toBeNull();
  });

  test('startRogue with rogue-owaissa uses the catalogue plan rooms/edges', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({
      seed: 7, staticHouseId: 'rogue-owaissa'
    }));
    const fp = await callSetup(page, 'setup.Rogue.field("floorplan")');
    const expected = [
      'bathroom--hallway',
      'bedroom--hallway',
      'hallway--kitchen',
      'kitchen--livingroom'
    ].sort();
    const got = owaissaEdgeKeys(fp.rooms, fp.edges);
    expect(got).toEqual(expected);
  });

  test('rogue-owaissa runs always have the same room set across seeds', async () => {
    const sigs = new Set();
    for (const seed of [1, 2, 7, 42, 999, 12345]) {
      await page.evaluate(({ s }) => {
        SugarCube.setup.Rogue.start({ seed: s }); // wipe any prior run
        SugarCube.setup.Rogue.end();
        SugarCube.setup.Rogue.startRogue({ seed: s, staticHouseId: 'rogue-owaissa' });
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

  test('rogue-owaissa run address label reads the catalogue label, not a generated street', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({
      seed: 1, staticHouseId: 'rogue-owaissa'
    }));
    const addr = await callSetup(page, 'setup.Rogue.address()');
    const cat = await callSetup(page, 'setup.RogueHouses.byId("rogue-owaissa")');
    expect(addr.formatted).toBe(cat.label);
  });

  test('procedural rogue runs keep using the seed-derived street address', async () => {
    /* Sanity-check the address override is gated on staticHouseId
       so the procedural rogue card still shows a varied street label. */
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({ seed: 1 }));
    const addr = await callSetup(page, 'setup.Rogue.address()');
    const fromSeed = await callSetup(page, 'setup.Rogue.addressFromSeed(1)');
    expect(addr.formatted).toBe(fromSeed.formatted);
  });

  // --- Companion gate parity ---

  test('Companion.inHauntedHouseLocation true while inside a rogue-owaissa run', async () => {
    await setVar(page, 'hauntedHouse', null);
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({
      seed: 1, staticHouseId: 'rogue-owaissa'
    }));
    expect(await callSetup(page, 'setup.Companion.inHauntedHouseLocation()')).toBe(true);
  });

  test('Companion.inHauntedHouseLocation true while inside classic Owaissa', async () => {
    await setVar(page, 'hauntedHouse', 'owaissa');
    await page.evaluate(() => SugarCube.setup.Rogue.end()); // ensure no run
    expect(await callSetup(page, 'setup.Companion.inHauntedHouseLocation()')).toBe(true);
  });

  test('Companion.inHauntedHouseLocation false while inside a procedural rogue run', async () => {
    /* Procedural runs have no staticHouseId; the catalogue gate
       reads false through both setup.HauntedHouses and
       setup.RogueHouses, so the companion plan flow stays out. */
    await setVar(page, 'hauntedHouse', null);
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({ seed: 1 }));
    expect(await callSetup(page, 'setup.Companion.inHauntedHouseLocation()')).toBe(false);
  });

  test('Companion.inHauntedHouseLocation false in Ironclad (catalogue opts out)', async () => {
    /* Ironclad's HOUSE_CONFIG entry sets allowsCompanions: false;
       the predicate must respect that flag without per-house
       branching in the companion controller. */
    await setVar(page, 'hauntedHouse', 'ironclad');
    await page.evaluate(() => SugarCube.setup.Rogue.end());
    expect(await callSetup(page, 'setup.Companion.inHauntedHouseLocation()')).toBe(false);
  });

  // --- Static-house id staging ---

  test('$pendingRogueStaticHouseId defaults to null on a fresh save', async () => {
    expect(await page.evaluate(() => SugarCube.State.variables.pendingRogueStaticHouseId))
      .toBeNull();
  });

  // --- Cross-mode parity ---

  test('rogue-owaissa room set has the same template multiset as classic Owaissa rooms array', async () => {
    /* Beyond "the templates match", check that the *count* of each
       template matches: classic Owaissa has one of each
       (kitchen/bathroom/bedroom/livingroom/hallway), and so should
       the rogue plan. Catches a subtle regression where two of the
       same template sneak in. */
    const classic = await callSetup(
      page, 'setup.HauntedHouses.byId("owaissa").rooms.slice()');
    const plan = await callSetup(page, 'setup.RogueHouses.planFor("rogue-owaissa")');
    const rogue = plan.rooms.map(r => r.template);

    const tally = (arr) => {
      const m = {};
      arr.forEach(t => { m[t] = (m[t] || 0) + 1; });
      return m;
    };
    expect(tally(rogue)).toEqual(tally(classic));
  });

  test('FloorPlan.layout positions every rogue-owaissa room across seeds', async () => {
    /* The minimap reads positions from setup.FloorPlan.layout. A
       static plan must place every room at a (col, row) cell so
       the minimap renders the full house, not just the spawn
       branch. */
    const plan = await callSetup(page, 'setup.RogueHouses.planFor("rogue-owaissa")');
    for (const seed of [1, 2, 7]) {
      const fp = await page.evaluate(({ s, p }) =>
        SugarCube.setup.FloorPlan.generate(s, { staticPlan: p }),
        { s: seed, p: plan });
      const positions = await page.evaluate(f =>
        SugarCube.setup.FloorPlan.layout(f), fp);
      fp.rooms.forEach(r => {
        expect(positions[r.id]).toBeDefined();
        expect(typeof positions[r.id].col).toBe('number');
        expect(typeof positions[r.id].row).toBe('number');
      });
    }
  });

  test('rogue-owaissa neighbors of room_0 (hallway) match classic Owaissa hallway exits', async () => {
    /* Classic OwaissaHallway exits to kitchen/bedroom/bathroom. The
       rogue plan's hallway must reach the same three neighbors,
       regardless of seed (room_0 stays the hallway). */
    const plan = await callSetup(page, 'setup.RogueHouses.planFor("rogue-owaissa")');
    for (const seed of [1, 7, 42]) {
      const fp = await page.evaluate(({ s, p }) =>
        SugarCube.setup.FloorPlan.generate(s, { staticPlan: p }),
        { s: seed, p: plan });
      const nbrIds = await page.evaluate(f =>
        SugarCube.setup.FloorPlan.neighborsOf(f, 'room_0'), fp);
      const nbrTemplates = nbrIds
        .map(id => fp.rooms.find(r => r.id === id).template)
        .sort();
      expect(nbrTemplates).toEqual(['bathroom', 'bedroom', 'kitchen']);
    }
  });

  test('rogue-owaissa kitchen has livingroom as its non-hallway neighbor', async () => {
    const plan = await callSetup(page, 'setup.RogueHouses.planFor("rogue-owaissa")');
    const fp = await page.evaluate(p =>
      SugarCube.setup.FloorPlan.generate(1, { staticPlan: p }), plan);
    const kitchenRoom = fp.rooms.find(r => r.template === 'kitchen');
    const nbrs = await page.evaluate(({ f, k }) =>
      SugarCube.setup.FloorPlan.neighborsOf(f, k), { f: fp, k: kitchenRoom.id });
    const nbrTemplates = nbrs
      .map(id => fp.rooms.find(r => r.id === id).template)
      .sort();
    expect(nbrTemplates).toEqual(['hallway', 'livingroom']);
  });

  test('rogue-owaissa BFS distances match the classic-Owaissa nav-graph distances from hallway', async () => {
    /* Classic Owaissa walking distances from the hallway:
         hallway:    0
         kitchen:    1 (direct)
         bedroom:    1 (direct)
         bathroom:   1 (direct)
         livingroom: 2 (kitchen -> livingroom)
       The rogue static plan must reproduce the same hop counts. */
    const plan = await callSetup(page, 'setup.RogueHouses.planFor("rogue-owaissa")');
    const fp = await page.evaluate(p =>
      SugarCube.setup.FloorPlan.generate(1, { staticPlan: p }), plan);
    const dist = await page.evaluate(f =>
      SugarCube.setup.FloorPlan.bfsDistances(f, 'room_0'), fp);
    const distByTemplate = {};
    fp.rooms.forEach(r => { distByTemplate[r.template] = dist[r.id]; });
    expect(distByTemplate).toEqual({
      hallway:    0,
      kitchen:    1,
      bedroom:    1,
      bathroom:   1,
      livingroom: 2
    });
  });

  // --- HOUSE_CONFIG companion-flag parity ---

  test('classic Owaissa and Elm both have allowsCompanions: true', async () => {
    expect(await callSetup(page, 'setup.HauntedHouses.byId("owaissa").allowsCompanions')).toBe(true);
    expect(await callSetup(page, 'setup.HauntedHouses.byId("elm").allowsCompanions')).toBe(true);
  });

  test('Ironclad has allowsCompanions: false (matches the legacy predicate)', async () => {
    expect(await callSetup(page, 'setup.HauntedHouses.byId("ironclad").allowsCompanions')).toBe(false);
  });

  test('HauntedHouses.activeHouseAllowsCompanions tracks the catalogue flag', async () => {
    await setVar(page, 'hauntedHouse', 'owaissa');
    expect(await callSetup(page, 'setup.HauntedHouses.activeHouseAllowsCompanions()')).toBe(true);
    await setVar(page, 'hauntedHouse', 'ironclad');
    expect(await callSetup(page, 'setup.HauntedHouses.activeHouseAllowsCompanions()')).toBe(false);
    await setVar(page, 'hauntedHouse', null);
    expect(await callSetup(page, 'setup.HauntedHouses.activeHouseAllowsCompanions()')).toBe(false);
  });

  // --- No "if rogue-owaissa do A else do B" lint ---

  test('no executable code branches on any rogue-house id', async () => {
    /* "if rogue_owaissa do A, else do B" is the design's named
       failure mode -- and the same trap applies to every other
       static rogue house added to setup.RogueHouses. This lint
       walks the catalogue and scans every .tw passage for
       executable comparisons against any catalogue id (== / === /
       eq / != / !== / neq) -- the fingerprints of a per-house
       branch. Comment-only mentions (catalogue docs, widget
       doc-strings, etc.) are allowed; what's forbidden is a code
       path that fires only when the id matches. */
    const fs = require('fs');
    const path = require('path');

    function walk(dir) {
      const out = [];
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) out.push(...walk(full));
        else if (ent.name.endsWith('.tw')) out.push(full);
      }
      return out;
    }

    const ids = await callSetup(page, 'setup.RogueHouses.ids()');
    expect(ids.length).toBeGreaterThan(0);

    /* Comparison operators that would couple a code path to a
       specific catalogue id. Each id is checked with the four
       binary comparison shapes (operator before / after, JS-side
       and SugarCube-side). */
    const buildPatterns = (id) => [
      new RegExp(`(===|!==|==|!=)\\s*['"]${id}['"]`),
      new RegExp(`['"]${id}['"]\\s*(===|!==|==|!=)`),
      new RegExp(`\\b(eq|neq|is|isnot)\\b\\s*['"]${id}['"]`),
      new RegExp(`['"]${id}['"]\\s*\\b(eq|neq|is|isnot)\\b`)
    ];

    const offenders = [];
    for (const f of walk(path.resolve(__dirname, '..', 'passages'))) {
      const body = fs.readFileSync(f, 'utf8');
      for (const id of ids) {
        let hit = false;
        for (const re of buildPatterns(id)) {
          if (re.test(body)) { hit = true; break; }
        }
        if (hit) {
          offenders.push(`${id} -> ${path.relative(path.resolve(__dirname, '..'), f)}`);
          break;
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
