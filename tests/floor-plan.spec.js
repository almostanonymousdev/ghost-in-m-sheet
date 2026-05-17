const { test, expect } = require('@playwright/test');
const { openGame, callSetup } = require('./helpers');

/* setup.FloorPlan generates deterministic, fully-connected room
   graphs for hunts. Same seed must always produce the same
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

  test('non-hallway templates prefer distinct picks before repeating', async () => {
    /* The hunt catalogue is small, so the generator allows templates
       to repeat once the pool is exhausted (Maze + tool-loot can
       request more rooms than there are distinct templates). For a
       plan that fits inside the catalogue, picks are still distinct;
       for a plan that overflows it, every catalogue template must
       appear at least once before any repeats. */
    const cat = await callSetup(page, 'setup.FloorPlan.nonHallwayTemplates()');
    const fittingPlan = await gen(7, { roomCount: Math.min(cat.length, 5) + 1 });
    const fittingTmpls = fittingPlan.rooms.slice(1).map(r => r.template);
    expect(new Set(fittingTmpls).size).toBe(fittingTmpls.length);

    const overflowPlan = await gen(7, { roomCount: cat.length + 3 });
    const overflowTmpls = overflowPlan.rooms.slice(1).map(r => r.template);
    cat.forEach(id => expect(overflowTmpls).toContain(id));
    expect(overflowTmpls.length).toBe(cat.length + 2);
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

  test('toolKinds option seeds tool_<id> loot for each requested tool', async () => {
    /* When the hunt lifecycle starts a run with locked_tools or a
       restricted loadout.tools, it asks the floor-plan generator to
       place the missing tools in furniture so the player can recover
       them by exploring. The generator namespaces them as
       'tool_<id>' so they share the same loot pipeline as
       cursedItem / rescueClue / tarotCards / monkeyPaw without
       colliding with future loot kinds. */
    const plan = await gen(123, {
      roomCount: 7,
      toolKinds: ['emf', 'uvl', 'spiritbox']
    });
    ['emf', 'uvl', 'spiritbox'].forEach((tool) => {
      const key = 'tool_' + tool;
      expect(plan.loot[key]).toBeDefined();
      expect(plan.loot[key]).not.toBe('room_0');
      // Every tool pin must land on a real furniture suffix --
      // the player needs a clickable slot to find it.
      const room = plan.rooms.find(r => r.id === plan.loot[key]);
      expect(room).toBeDefined();
      expect(plan.lootFurniture[key]).toBeDefined();
    });
  });

  test('toolKinds default to no tool loot when the option is omitted', async () => {
    const plan = await gen(123);
    Object.keys(plan.loot).forEach((k) => {
      expect(k.startsWith('tool_')).toBe(false);
    });
  });

  test('toolIdFromLootKind / isToolLootKind round-trip the tool prefix', async () => {
    expect(await callSetup(page, 'setup.FloorPlan.toolLootKind("emf")')).toBe('tool_emf');
    expect(await callSetup(page, 'setup.FloorPlan.toolIdFromLootKind("tool_uvl")')).toBe('uvl');
    expect(await callSetup(page, 'setup.FloorPlan.isToolLootKind("tool_gwb")')).toBe(true);
    expect(await callSetup(page, 'setup.FloorPlan.isToolLootKind("cursedItem")')).toBe(false);
    expect(await callSetup(page, 'setup.FloorPlan.toolIdFromLootKind("cursedItem")')).toBeNull();
  });

  test('all six tool kinds always land on furniture-bearing rooms across many seeds', async () => {
    /* Empty Bag runs need every tool placed reliably; the generator
       forces tool_* loot onto a furniture-bearing non-hallway room
       (just like tarotCards / monkeyPaw). Fuzz across seeds to make
       sure no run ends up with a tool stranded on roomA/B/C. */
    test.setTimeout(20_000);
    const fails = await page.evaluate(() => {
      const out = [];
      const tools = SugarCube.setup.searchToolOrder.slice();
      for (let seed = 1; seed <= 100; seed++) {
        const plan = SugarCube.setup.FloorPlan.generate(seed, {
          roomCount: 7, toolKinds: tools
        });
        tools.forEach((tool) => {
          const key = 'tool_' + tool;
          if (!plan.loot[key]) {
            out.push(`seed ${seed}: ${key} not placed`); return;
          }
          const room = plan.rooms.find(r => r.id === plan.loot[key]);
          const t = SugarCube.setup.Templates.byId(room.template);
          if (!t || !t.furniture || !t.furniture.length) {
            out.push(`seed ${seed}: ${key} on furniture-less ${room.template}`); return;
          }
          if (!plan.lootFurniture[key]) {
            out.push(`seed ${seed}: ${key} missing furniture pin`); return;
          }
          if (t.furniture.indexOf(plan.lootFurniture[key]) === -1) {
            out.push(`seed ${seed}: ${key} pin ${plan.lootFurniture[key]} not in ${room.template}`);
          }
        });
      }
      return out;
    });
    expect(fails).toEqual([]);
  });

  test('rare loot kinds (cash, ectoplasm) appear in roughly 10% of hunts', async () => {
    /* RARE_LOOT_KINDS are rolled independently at RARE_LOOT_CHANCE
       per kind, so over many seeds each kind's placement rate should
       hover near 10%. Fuzz across 1000 seeds and bound the rate to
       a wide tolerance so the test isn't flaky against future PRNG
       changes -- the goal is "rare, not absent, not common", not a
       precise rate match. */
    test.setTimeout(20_000);
    const counts = await page.evaluate(() => {
      const out = { cash: 0, ectoplasm: 0, total: 0 };
      for (let seed = 1; seed <= 1000; seed++) {
        const plan = SugarCube.setup.FloorPlan.generate(seed, { roomCount: 5 });
        out.total++;
        if (plan.loot.cash)      out.cash++;
        if (plan.loot.ectoplasm) out.ectoplasm++;
      }
      return out;
    });
    expect(counts.cash / counts.total).toBeGreaterThan(0.05);
    expect(counts.cash / counts.total).toBeLessThan(0.18);
    expect(counts.ectoplasm / counts.total).toBeGreaterThan(0.05);
    expect(counts.ectoplasm / counts.total).toBeLessThan(0.18);
  });

  test('rare loot, when placed, lands on a furniture-bearing room with a pin', async () => {
    /* Same forced-furniture pipeline as tarotCards / tool_* -- the
       player needs a clickable slot to find them. Fuzz across seeds
       and verify every placed rare-loot kind has both a furniture
       room and a valid suffix pin. */
    test.setTimeout(20_000);
    const fails = await page.evaluate(() => {
      const out = [];
      for (let seed = 1; seed <= 500; seed++) {
        const plan = SugarCube.setup.FloorPlan.generate(seed, { roomCount: 5 });
        ['cash', 'ectoplasm'].forEach((k) => {
          if (!plan.loot[k]) return; // miss, fine
          const room = plan.rooms.find(r => r.id === plan.loot[k]);
          const t = SugarCube.setup.Templates.byId(room.template);
          if (!t || !Array.isArray(t.furniture) || !t.furniture.length) {
            out.push(`seed ${seed}: ${k} on furniture-less ${room.template}`);
            return;
          }
          if (!plan.lootFurniture[k]) {
            out.push(`seed ${seed}: ${k} missing furniture pin`);
            return;
          }
          if (t.furniture.indexOf(plan.lootFurniture[k]) === -1) {
            out.push(`seed ${seed}: ${k} pin ${plan.lootFurniture[k]} not in ${room.template}`);
          }
        });
      }
      return out;
    });
    expect(fails).toEqual([]);
  });

  test('rare loot placement is deterministic per seed', async () => {
    /* The rare-loot rolls consume the same RNG stream as everything
       else in the plan, so same-seed plans must include or exclude
       cash / ectoplasm identically -- otherwise replays and shared
       seed strings would drift. */
    const a = await gen(7);
    const b = await gen(7);
    expect(Boolean(a.loot.cash)).toBe(Boolean(b.loot.cash));
    expect(Boolean(a.loot.ectoplasm)).toBe(Boolean(b.loot.ectoplasm));
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
        // Spawn must resolve to a real room id (any room, including
        // the hallway -- classic mode lets the ghost lair in the
        // hallway and the hunt mirror does the same).
        if (!ids.has(plan.spawnRoomId)) {
          fails.push(`seed ${seed}: spawn ${plan.spawnRoomId} not a real room`);
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

  // --- BFS distances ---

  test('bfsDistances stamps the source room at distance 0', async () => {
    const plan = await gen(1, { roomCount: 6 });
    const dist = await page.evaluate(p =>
      SugarCube.setup.FloorPlan.bfsDistances(p, 'room_0'), plan);
    expect(dist['room_0']).toBe(0);
  });

  test('bfsDistances assigns finite hop counts to every reachable room', async () => {
    const plan = await gen(7, { roomCount: 6 });
    const dist = await page.evaluate(p =>
      SugarCube.setup.FloorPlan.bfsDistances(p, 'room_0'), plan);
    plan.rooms.forEach(r => {
      expect(typeof dist[r.id]).toBe('number');
      expect(dist[r.id]).toBeGreaterThanOrEqual(0);
    });
  });

  test('bfsDistances reports neighbors at distance 1', async () => {
    const plan = await gen(3, { roomCount: 6 });
    const dist = await page.evaluate(p =>
      SugarCube.setup.FloorPlan.bfsDistances(p, 'room_0'), plan);
    const neighbors = await page.evaluate(p =>
      SugarCube.setup.FloorPlan.neighborsOf(p, 'room_0'), plan);
    neighbors.forEach(id => expect(dist[id]).toBe(1));
  });

  test('bfsDistances satisfies the spanning-tree triangle inequality', async () => {
    /* For any edge (a, b), |dist(src, a) - dist(src, b)| === 1 in
       a tree; a violation would mean the BFS missed an edge. */
    const plan = await gen(11, { roomCount: 7 });
    const dist = await page.evaluate(p =>
      SugarCube.setup.FloorPlan.bfsDistances(p, 'room_0'), plan);
    plan.edges.forEach(([a, b]) => {
      expect(Math.abs(dist[a] - dist[b])).toBe(1);
    });
  });

  test('bfsDistances returns {} for an unknown source id', async () => {
    const plan = await gen(1);
    const dist = await page.evaluate(p =>
      SugarCube.setup.FloorPlan.bfsDistances(p, 'room_does_not_exist'), plan);
    expect(dist).toEqual({});
  });
});
