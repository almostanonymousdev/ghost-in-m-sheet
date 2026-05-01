const { test, expect } = require('@playwright/test');
const { openGame, callSetup } = require('./helpers');

/* setup.FloorPlan generates deterministic, fully-connected room
   graphs for rogue runs. Same seed must always produce the same
   plan (the generator uses an internal Mulberry32 PRNG, so global
   Math.random patching is irrelevant). */
test.describe('Floor-plan generator', () => {
  let page;

  test.beforeAll(async ({ browser }) => {
    page = await openGame(browser);
  });

  test.afterAll(async () => {
    await page.close();
  });

  /* Tiny helper: generate a plan in-page and return it as JSON. */
  async function gen(seed, opts) {
    return page.evaluate(({ s, o }) =>
      SugarCube.setup.FloorPlan.generate(s, o || {}), { s: seed, o: opts });
  }

  // --- Determinism ---

  test('same seed produces identical plans', async () => {
    const a = await gen(42);
    const b = await gen(42);
    expect(a).toEqual(b);
  });

  test('different seeds produce different plans', async () => {
    const a = await gen(1);
    const b = await gen(2);
    // Distinct seeds should differ in at least one of: room
    // template selection, spawn, or loot placement.
    expect(a).not.toEqual(b);
  });

  test('plan stamps the seed it was generated from', async () => {
    const plan = await gen(2026);
    expect(plan.seed).toBe(2026);
  });

  // --- Room invariants ---

  test('default plan has 5 rooms with hallway as room_0', async () => {
    const plan = await gen(1);
    expect(plan.rooms.length).toBe(5);
    expect(plan.rooms[0]).toEqual({ id: 'room_0', template: 'hallway' });
  });

  test('roomCount option controls room count, with hallway always room_0', async () => {
    const plan = await gen(1, { roomCount: 8 });
    expect(plan.rooms.length).toBe(8);
    expect(plan.rooms[0].template).toBe('hallway');
    // Non-hallway rooms have unique ids.
    const ids = plan.rooms.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('roomCount is clamped to a minimum of 2', async () => {
    const plan = await gen(1, { roomCount: 0 });
    expect(plan.rooms.length).toBe(2);
  });

  test('non-hallway rooms only use templates from the catalogue', async () => {
    const plan = await gen(99, { roomCount: 8 });
    const cat = await callSetup(page, 'setup.FloorPlan.nonHallwayTemplates()');
    plan.rooms.slice(1).forEach(r => {
      expect(cat).toContain(r.template);
    });
  });

  test('non-hallway templates are unique within a single plan', async () => {
    const plan = await gen(7, { roomCount: 6 });
    const tmpls = plan.rooms.slice(1).map(r => r.template);
    expect(new Set(tmpls).size).toBe(tmpls.length);
  });

  // --- Connectivity ---

  test('every room is reachable from the hallway', async () => {
    for (const seed of [1, 2, 3, 100, 999, 12345]) {
      const plan = await gen(seed, { roomCount: 7 });
      const connected = await page.evaluate(p =>
        SugarCube.setup.FloorPlan.isConnected(p), plan);
      expect(connected).toBe(true);
    }
  });

  test('spanning tree: edges connect distinct real rooms, count = roomCount - 1', async () => {
    const plan = await gen(1, { roomCount: 6 });
    const ids = new Set(plan.rooms.map(r => r.id));
    plan.edges.forEach(([a, b]) => {
      expect(a).not.toBe(b);
      expect(ids.has(a)).toBe(true);
      expect(ids.has(b)).toBe(true);
    });
    // Pure spanning tree -- one edge per non-root room.
    expect(plan.edges.length).toBe(plan.rooms.length - 1);
  });

  test('topology varies across seeds (not always a star around the hallway)', async () => {
    // The star generator produced edges where every edge touched
    // room_0; the spanning-tree generator should yield at least one
    // seed in a small range whose layout has a non-hallway edge.
    let foundNonHallwayEdge = false;
    for (let seed = 1; seed <= 50; seed++) {
      const plan = await gen(seed, { roomCount: 6 });
      if (plan.edges.some(([a, b]) => a !== 'room_0' && b !== 'room_0')) {
        foundNonHallwayEdge = true;
        break;
      }
    }
    expect(foundNonHallwayEdge).toBe(true);
  });

  test('neighborsOf is symmetric: a in neighbors(b) iff b in neighbors(a)', async () => {
    const plan = await gen(7, { roomCount: 6 });
    for (const r of plan.rooms) {
      const nbrs = await page.evaluate(({ p, i }) =>
        SugarCube.setup.FloorPlan.neighborsOf(p, i), { p: plan, i: r.id });
      for (const n of nbrs) {
        const back = await page.evaluate(({ p, i }) =>
          SugarCube.setup.FloorPlan.neighborsOf(p, i), { p: plan, i: n });
        expect(back).toContain(r.id);
      }
    }
  });

  // --- Spawn / loot / boss ---

  test('ghost spawns in a non-hallway room', async () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const plan = await gen(seed);
      expect(plan.spawnRoomId).not.toBe('room_0');
      const room = await page.evaluate(({ p, i }) =>
        SugarCube.setup.FloorPlan.roomById(p, i), { p: plan, i: plan.spawnRoomId });
      expect(room).not.toBeNull();
    }
  });

  test('every loot kind is placed on a real non-hallway room', async () => {
    const plan = await gen(31, { roomCount: 6 });
    const kinds = await callSetup(page, 'setup.FloorPlan.LOOT_KINDS');
    const ids = new Set(plan.rooms.map(r => r.id));
    kinds.forEach(k => {
      expect(plan.loot[k]).toBeDefined();
      expect(ids.has(plan.loot[k])).toBe(true);
      expect(plan.loot[k]).not.toBe('room_0');
    });
  });

  test('lootFurniture pins each loot kind to a real furniture suffix on its room', async () => {
    const plan = await gen(31, { roomCount: 6 });
    const kinds = await callSetup(page, 'setup.FloorPlan.LOOT_KINDS');
    for (const k of kinds) {
      const roomId = plan.loot[k];
      const room = plan.rooms.find(r => r.id === roomId);
      const t = await callSetup(page, `setup.Templates.byId("${room.template}")`);
      if (t && t.furniture && t.furniture.length) {
        // Every loot kind on a furniture-bearing room must pin to a
        // suffix that exists in that template's furniture list.
        expect(t.furniture).toContain(plan.lootFurniture[k]);
      } else {
        // Empty-furniture template -> no pin.
        expect(plan.lootFurniture[k]).toBeUndefined();
      }
    }
  });

  test('tarotCards and monkeyPaw always land on a furniture-bearing room', async () => {
    test.setTimeout(20_000);
    // roomCount >= 4 guarantees the distinct-template pool includes at
    // least one furniture-bearing entry (only 3 empty-furniture
    // templates exist), so tarotCards/monkeyPaw can always be placed
    // without falling through to the degraded fallback.
    const fails = await page.evaluate(() => {
      const out = [];
      for (let seed = 1; seed <= 200; seed++) {
        const roomCount = 4 + (seed % 6); // 4..9
        const plan = SugarCube.setup.FloorPlan.generate(seed, { roomCount });
        ['tarotCards', 'monkeyPaw'].forEach((k) => {
          const room = plan.rooms.find(r => r.id === plan.loot[k]);
          const t = SugarCube.setup.Templates.byId(room.template);
          if (!t || !Array.isArray(t.furniture) || !t.furniture.length) {
            out.push(`seed ${seed} (n=${roomCount}): ${k} on furniture-less ${room.template}`);
            return;
          }
          if (!plan.lootFurniture[k]) {
            out.push(`seed ${seed} (n=${roomCount}): ${k} missing furniture pin`);
            return;
          }
          if (t.furniture.indexOf(plan.lootFurniture[k]) === -1) {
            out.push(`seed ${seed} (n=${roomCount}): ${k} pin ${plan.lootFurniture[k]} not in ${room.template} furniture`);
          }
        });
      }
      return out;
    });
    expect(fails).toEqual([]);
  });

  test('bossRoomId is null when includeBoss is false (default)', async () => {
    const plan = await gen(1);
    expect(plan.bossRoomId).toBeNull();
  });

  test('bossRoomId picks a non-hallway room when includeBoss is true', async () => {
    const plan = await gen(1, { includeBoss: true });
    expect(plan.bossRoomId).not.toBeNull();
    expect(plan.bossRoomId).not.toBe('room_0');
  });

  // --- Helpers ---

  test('roomById returns null for unknown ids', async () => {
    const plan = await gen(1);
    const room = await page.evaluate(p =>
      SugarCube.setup.FloorPlan.roomById(p, 'room_999'), plan);
    expect(room).toBeNull();
  });

  // --- Fuzz: invariants must hold across many seeds + room counts ---

  test('generator invariants hold across 200 random (seed, roomCount) pairs', async () => {
    test.setTimeout(20_000);
    const summary = await page.evaluate(() => {
      const fails = [];
      for (let seed = 1; seed <= 200; seed++) {
        const roomCount = 2 + (seed % 8); // 2..9
        const plan = SugarCube.setup.FloorPlan.generate(seed, { roomCount, includeBoss: seed % 3 === 0 });
        // Connectivity.
        if (!SugarCube.setup.FloorPlan.isConnected(plan)) {
          fails.push(`seed ${seed} (n=${roomCount}): not fully connected`);
          continue;
        }
        // Loot placement: all kinds resolve to a real non-hallway room.
        const ids = new Set(plan.rooms.map(r => r.id));
        for (const k of SugarCube.setup.FloorPlan.LOOT_KINDS) {
          if (!ids.has(plan.loot[k])) {
            fails.push(`seed ${seed}: loot ${k} -> unknown room ${plan.loot[k]}`);
          }
          if (plan.loot[k] === 'room_0') {
            fails.push(`seed ${seed}: loot ${k} placed in hallway`);
          }
        }
        // Spawn must be a real non-hallway room.
        if (!ids.has(plan.spawnRoomId) || plan.spawnRoomId === 'room_0') {
          fails.push(`seed ${seed}: spawn ${plan.spawnRoomId} not a non-hallway room`);
        }
        // Boss room (when set) must also be a real non-hallway room.
        if (plan.bossRoomId !== null) {
          if (!ids.has(plan.bossRoomId) || plan.bossRoomId === 'room_0') {
            fails.push(`seed ${seed}: bossRoom ${plan.bossRoomId} not a non-hallway room`);
          }
        }
      }
      return fails;
    });
    expect(summary).toEqual([]);
  });
});
