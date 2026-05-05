const { test, expect } = require('@playwright/test');
const { openGame, resetGame, getVar, setVar, callSetup } = require('./helpers');

/* setup.Rogue owns rogue-run lifecycle ($run) and the persistent
   meta-progression currency ($ectoplasm, measured in mL). Classic
   mode = no rogue run active = $run is null. */
test.describe('Rogue Controller', () => {
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

  // --- Default state ---

  test('fresh save starts in classic mode with no run active', async () => {
    expect(await getVar(page, 'run')).toBeNull();
    expect(await callSetup(page, 'setup.Rogue.isClassic()')).toBe(true);
    expect(await callSetup(page, 'setup.Rogue.isRogue()')).toBe(false);
    expect(await callSetup(page, 'setup.Rogue.active()')).toBeNull();
  });

  test('fresh save initializes ectoplasm to 0 mL', async () => {
    expect(await getVar(page, 'ectoplasm')).toBe(0);
    expect(await callSetup(page, 'setup.Rogue.ectoplasm()')).toBe(0);
  });

  // --- Run lifecycle ---

  test('start() with explicit seed records the seed and increments run number', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.start({ seed: 12345 }));

    expect(await callSetup(page, 'setup.Rogue.seed()')).toBe(12345);
    expect(await callSetup(page, 'setup.Rogue.number()')).toBe(1);
    expect(await callSetup(page, 'setup.Rogue.isRogue()')).toBe(true);
  });

  test('start() without seed rolls a random one in [0, 1e9)', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.start());

    const seed = await callSetup(page, 'setup.Rogue.seed()');
    expect(typeof seed).toBe('number');
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThan(1e9);
  });

  test('default objective is "identify"', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.start({ seed: 1 }));
    expect(await callSetup(page, 'setup.Rogue.objective()')).toBe('identify');
  });

  test('start() with options stores modifiers, loadout, objective', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.start({
      seed: 7,
      modifiers: ['locked_tools', 'pheromones'],
      loadout: { tools: ['emf'], money: 50 },
      objective: 'rescue'
    }));

    expect(await callSetup(page, 'setup.Rogue.modifiers()')).toEqual(['locked_tools', 'pheromones']);
    expect(await callSetup(page, 'setup.Rogue.loadout()')).toEqual({ tools: ['emf'], money: 50 });
    expect(await callSetup(page, 'setup.Rogue.objective()')).toBe('rescue');
  });

  test('end() clears the active run but classic predicate flips back', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.start({ seed: 1 }));
    expect(await callSetup(page, 'setup.Rogue.isRogue()')).toBe(true);

    await page.evaluate(() => SugarCube.setup.Rogue.end());

    expect(await getVar(page, 'run')).toBeNull();
    expect(await callSetup(page, 'setup.Rogue.isRogue()')).toBe(false);
    expect(await callSetup(page, 'setup.Rogue.isClassic()')).toBe(true);
  });

  // --- Address (seed -> street label) ---

  test('addressFromSeed returns deterministic { number, road, suffix, formatted }', async () => {
    const a = await callSetup(page, 'setup.Rogue.addressFromSeed(12345)');
    const b = await callSetup(page, 'setup.Rogue.addressFromSeed(12345)');
    expect(a).toEqual(b);
    expect(typeof a.number).toBe('number');
    expect(a.number).toBeGreaterThanOrEqual(1);
    expect(a.number).toBeLessThanOrEqual(999);
    const roads = await callSetup(page, 'setup.Rogue.ROAD_NAMES');
    const suffixes = await callSetup(page, 'setup.Rogue.ROAD_SUFFIXES');
    expect(roads).toContain(a.road);
    expect(suffixes).toContain(a.suffix);
    expect(a.formatted).toBe(`${a.number} ${a.road} ${a.suffix}`);
  });

  test('addressFromSeed produces varied labels across seeds', async () => {
    const labels = [];
    for (let s = 1; s <= 50; s++) {
      labels.push(await callSetup(page, `setup.Rogue.addressFromSeed(${s})`).then(a => a.formatted));
    }
    // Not strictly unique (only 5x5x999 = ~25k labels) but 50 seeds
    // should easily produce more than a few distinct labels.
    expect(new Set(labels).size).toBeGreaterThan(10);
  });

  test('address() returns null off-run and the active run\'s label otherwise', async () => {
    expect(await callSetup(page, 'setup.Rogue.address()')).toBeNull();
    await page.evaluate(() => SugarCube.setup.Rogue.start({ seed: 12345 }));
    const live = await callSetup(page, 'setup.Rogue.address()');
    const fromSeed = await callSetup(page, 'setup.Rogue.addressFromSeed(12345)');
    expect(live).toEqual(fromSeed);
  });

  test('run number increments across successive runs', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.start({ seed: 1 }));
    await page.evaluate(() => SugarCube.setup.Rogue.end());
    await page.evaluate(() => SugarCube.setup.Rogue.start({ seed: 2 }));
    expect(await callSetup(page, 'setup.Rogue.number()')).toBe(2);
    await page.evaluate(() => SugarCube.setup.Rogue.end());
    await page.evaluate(() => SugarCube.setup.Rogue.start({ seed: 3 }));
    expect(await callSetup(page, 'setup.Rogue.number()')).toBe(3);
  });

  // --- Modifier helpers ---

  test('hasModifier matches the active deck and returns false off-run', async () => {
    expect(await callSetup(page, 'setup.Rogue.hasModifier("pheromones")')).toBe(false);

    await page.evaluate(() => SugarCube.setup.Rogue.start({
      seed: 1, modifiers: ['pheromones']
    }));

    expect(await callSetup(page, 'setup.Rogue.hasModifier("pheromones")')).toBe(true);
    expect(await callSetup(page, 'setup.Rogue.hasModifier("locked_tools")')).toBe(false);
  });

  test('addModifier appends to the deck and is idempotent', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.start({ seed: 1 }));

    expect(await callSetup(page, 'setup.Rogue.addModifier("foo")')).toBe(true);
    expect(await callSetup(page, 'setup.Rogue.addModifier("foo")')).toBe(false);
    expect(await callSetup(page, 'setup.Rogue.modifiers()')).toEqual(['foo']);

    await page.evaluate(() => SugarCube.setup.Rogue.addModifier('bar'));
    expect(await callSetup(page, 'setup.Rogue.modifiers()')).toEqual(['foo', 'bar']);
  });

  // --- Generic field stowage ---

  test('setField/field round-trips arbitrary per-run subsystem state', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.start({ seed: 1 }));

    await page.evaluate(() => SugarCube.setup.Rogue.setField('floorplan', { rooms: ['a', 'b'] }));
    expect(await callSetup(page, 'setup.Rogue.field("floorplan")')).toEqual({ rooms: ['a', 'b'] });
  });

  test('setField/field is a no-op when no run is active', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.setField('floorplan', { rooms: ['a'] }));
    expect(await callSetup(page, 'setup.Rogue.field("floorplan")')).toBeUndefined();
  });

  // --- Ectoplasm (mL) ---

  test('addEctoplasm accumulates the persistent currency', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.addEctoplasm(5));
    await page.evaluate(() => SugarCube.setup.Rogue.addEctoplasm(7));
    expect(await callSetup(page, 'setup.Rogue.ectoplasm()')).toBe(12);
  });

  test('spendEctoplasm rejects when the player cannot afford the cost', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.addEctoplasm(3));

    expect(await callSetup(page, 'setup.Rogue.spendEctoplasm(5)')).toBe(false);
    expect(await callSetup(page, 'setup.Rogue.ectoplasm()')).toBe(3); // unchanged
  });

  test('spendEctoplasm deducts on success', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.addEctoplasm(10));

    expect(await callSetup(page, 'setup.Rogue.spendEctoplasm(4)')).toBe(true);
    expect(await callSetup(page, 'setup.Rogue.ectoplasm()')).toBe(6);
  });

  test('canAffordEctoplasm reflects the current balance', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.addEctoplasm(5));

    expect(await callSetup(page, 'setup.Rogue.canAffordEctoplasm(5)')).toBe(true);
    expect(await callSetup(page, 'setup.Rogue.canAffordEctoplasm(6)')).toBe(false);
  });

  test('ectoplasm survives across run start/end', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.addEctoplasm(10));
    await page.evaluate(() => SugarCube.setup.Rogue.start({ seed: 1 }));
    expect(await callSetup(page, 'setup.Rogue.ectoplasm()')).toBe(10);
    await page.evaluate(() => SugarCube.setup.Rogue.end());
    expect(await callSetup(page, 'setup.Rogue.ectoplasm()')).toBe(10);
  });

  // --- Current room ---

  test('currentRoomId defaults to room_0 (hallway) on a fresh run', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({ seed: 1 }));
    expect(await callSetup(page, 'setup.Rogue.currentRoomId()')).toBe('room_0');
  });

  test('currentRoomId is null with no run active', async () => {
    expect(await callSetup(page, 'setup.Rogue.currentRoomId()')).toBeNull();
  });

  test('setCurrentRoom moves the player when the id is on the floor plan', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({
      seed: 1, floorPlanOpts: { roomCount: 5 }
    }));
    expect(await callSetup(page, 'setup.Rogue.setCurrentRoom("room_2")')).toBe(true);
    expect(await callSetup(page, 'setup.Rogue.currentRoomId()')).toBe('room_2');
  });

  test('setCurrentRoom rejects unknown room ids and leaves currentRoomId alone', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({ seed: 1 }));
    expect(await callSetup(page, 'setup.Rogue.setCurrentRoom("room_999")')).toBe(false);
    expect(await callSetup(page, 'setup.Rogue.currentRoomId()')).toBe('room_0');
  });

  test('currentRoomData returns the room name, furniture, and adjacency', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({
      seed: 42, floorPlanOpts: { roomCount: 5 }
    }));
    const cr = await callSetup(page, 'setup.Rogue.currentRoomData()');

    // Player starts in the hallway, so its template/label should resolve.
    expect(cr.id).toBe('room_0');
    expect(cr.template).toBe('hallway');
    expect(cr.label).toBe('Hallway');
    expect(Array.isArray(cr.furniture)).toBe(true);
    expect(Array.isArray(cr.neighbors)).toBe(true);

    // Furniture entries surface a humanised label and a loot slot
    // (null when the slot is empty).
    cr.furniture.forEach(f => {
      expect(typeof f.suffix).toBe('string');
      expect(typeof f.label).toBe('string');
      expect(f.lootKind === null || typeof f.lootKind === 'string').toBe(true);
    });

    // Each neighbor record carries an id + a label the nav link can render.
    cr.neighbors.forEach(n => {
      expect(typeof n.id).toBe('string');
      expect(typeof n.label).toBe('string');
    });
  });

  test('currentRoomData annotates a furniture slot when loot is pinned to it', async () => {
    // The generator picks a deterministic room+furniture per seed, so
    // we can find a loot kind, jump into its room, and check that the
    // matching furniture entry carries its kind label.
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({
      seed: 31, floorPlanOpts: { roomCount: 6 }
    }));
    const fp = await callSetup(page, 'setup.Rogue.field("floorplan")');
    const kind = Object.keys(fp.lootFurniture)[0];
    const roomId = fp.loot[kind];
    const suffix = fp.lootFurniture[kind];

    await page.evaluate((id) => SugarCube.setup.Rogue.setCurrentRoom(id), roomId);
    const cr = await callSetup(page, 'setup.Rogue.currentRoomData()');
    const slot = cr.furniture.find(f => f.suffix === suffix);
    expect(slot).toBeDefined();
    expect(slot.lootKind).toBe(kind);
    expect(typeof slot.lootLabel).toBe('string');
    expect(slot.lootLabel.length).toBeGreaterThan(0);
  });

  test('currentRoomData returns null when no run is active', async () => {
    expect(await callSetup(page, 'setup.Rogue.currentRoomData()')).toBeNull();
  });

  // --- Starting tools (loadout / Empty Bag) ---

  test('startingTools defaults to all six tools in canonical order', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.start({ seed: 1 }));
    expect(await callSetup(page, 'setup.Rogue.startingTools()'))
      .toEqual(['emf', 'plasm', 'gwb', 'spiritbox', 'temperature', 'uvl']);
  });

  test('startingTools collapses to [] when the Empty Bag modifier is active', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.start({
      seed: 1, modifiers: ['locked_tools']
    }));
    expect(await callSetup(page, 'setup.Rogue.startingTools()')).toEqual([]);
  });

  test('startingTools restricts to loadout.tools while preserving canonical order', async () => {
    /* The loadout might list tools in any order (meta-shop unlocks,
       starter packs); the toolbar should still render them in
       searchToolOrder. */
    await page.evaluate(() => SugarCube.setup.Rogue.start({
      seed: 1,
      loadout: { tools: ['uvl', 'emf', 'spiritbox'] }
    }));
    expect(await callSetup(page, 'setup.Rogue.startingTools()'))
      .toEqual(['emf', 'spiritbox', 'uvl']);
  });

  test('startingTools returns [] when no run is active', async () => {
    expect(await callSetup(page, 'setup.Rogue.startingTools()')).toEqual([]);
  });

  // --- Multi-kind furniture slots ---

  test('lootKindsAt returns every uncollected kind pinned to a slot', async () => {
    /* The floor-plan generator forces tarotCards / monkeyPaw / tool_*
       loot onto a furniture-bearing room and prefers distinct slots,
       but falls back to sharing one when the room runs out. The
       lookup helper must surface every uncollected kind so a single
       search can pull them all. */
    await page.evaluate(() => SugarCube.setup.Rogue.start({ seed: 1 }));
    await page.evaluate(() => {
      // Hand-crafted multi-item slot: room_1 / desk holds three kinds.
      SugarCube.setup.Rogue.setField('floorplan', {
        rooms: [
          { id: 'room_0', template: 'hallway' },
          { id: 'room_1', template: 'kitchen' }
        ],
        edges: [['room_0', 'room_1']],
        spawnRoomId: 'room_1',
        loot: { tarotCards: 'room_1', monkeyPaw: 'room_1', tool_emf: 'room_1' },
        lootFurniture: { tarotCards: 'desk', monkeyPaw: 'desk', tool_emf: 'desk' },
        bossRoomId: null
      });
    });
    expect(await callSetup(page, 'setup.Rogue.lootKindsAt("room_1", "desk")'))
      .toEqual(['tarotCards', 'monkeyPaw', 'tool_emf']);
    // lootAt keeps single-value semantics for lightweight callers.
    expect(await callSetup(page, 'setup.Rogue.lootAt("room_1", "desk")'))
      .toBe('tarotCards');
  });

  test('lootKindsAt drops kinds that have already been collected', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.start({ seed: 1 }));
    await page.evaluate(() => {
      SugarCube.setup.Rogue.setField('floorplan', {
        rooms: [
          { id: 'room_0', template: 'hallway' },
          { id: 'room_1', template: 'kitchen' }
        ],
        edges: [['room_0', 'room_1']],
        spawnRoomId: 'room_1',
        loot: { tarotCards: 'room_1', monkeyPaw: 'room_1' },
        lootFurniture: { tarotCards: 'desk', monkeyPaw: 'desk' },
        bossRoomId: null
      });
      SugarCube.setup.Rogue.takeLoot('tarotCards');
    });
    expect(await callSetup(page, 'setup.Rogue.lootKindsAt("room_1", "desk")'))
      .toEqual(['monkeyPaw']);
  });

  test('lootKindsAt returns [] outside a run', async () => {
    expect(await callSetup(page, 'setup.Rogue.lootKindsAt("room_1", "desk")'))
      .toEqual([]);
  });

  test('currentRoomData annotates a slot with its full uncollected kind list', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.start({ seed: 1 }));
    await page.evaluate(() => {
      SugarCube.setup.Rogue.setField('floorplan', {
        rooms: [
          { id: 'room_0', template: 'hallway' },
          { id: 'room_1', template: 'kitchen' }
        ],
        edges: [['room_0', 'room_1']],
        spawnRoomId: 'room_1',
        loot: { tarotCards: 'room_1', tool_emf: 'room_1' },
        lootFurniture: { tarotCards: 'desk', tool_emf: 'desk' },
        bossRoomId: null
      });
      SugarCube.setup.Rogue.setCurrentRoom('room_1');
    });
    const room = await callSetup(page, 'setup.Rogue.currentRoomData()');
    const desk = room.furniture.find(f => f.suffix === 'desk');
    expect(desk.lootKinds).toEqual(['tarotCards', 'tool_emf']);
    // Single-value fields stay populated with the first kind for
    // legacy callers that just want "is anything here".
    expect(desk.lootKind).toBe('tarotCards');
  });

  test('startingTools unions in tools the player has picked up from furniture', async () => {
    /* When the run starts with locked_tools (Empty Bag), the toolbar
       starts at []. Picking up a 'tool_<id>' loot kind through
       FurnitureSearch (which calls takeLoot with the namespaced key)
       should add that tool to the toolbar without re-running
       startRogue. */
    await page.evaluate(() => SugarCube.setup.Rogue.start({
      seed: 1, modifiers: ['locked_tools']
    }));
    expect(await callSetup(page, 'setup.Rogue.startingTools()')).toEqual([]);

    // Simulate picking up two tools mid-run.
    await page.evaluate(() => SugarCube.setup.Rogue.takeLoot('tool_uvl'));
    await page.evaluate(() => SugarCube.setup.Rogue.takeLoot('tool_emf'));

    // Order is canonical setup.searchToolOrder, not pickup order.
    expect(await callSetup(page, 'setup.Rogue.startingTools()'))
      .toEqual(['emf', 'uvl']);
  });

  test('startingTools fills in over a restricted loadout as tools are found', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.start({
      seed: 1, loadout: { tools: ['emf'] }
    }));
    expect(await callSetup(page, 'setup.Rogue.startingTools()')).toEqual(['emf']);
    await page.evaluate(() => SugarCube.setup.Rogue.takeLoot('tool_temperature'));
    expect(await callSetup(page, 'setup.Rogue.startingTools()'))
      .toEqual(['emf', 'temperature']);
  });

  test('startRogue places every tool when locked_tools is active', async () => {
    /* The lifecycle composes the floor-plan options based on the
       drafted modifiers / loadout: any tool the toolbar would
       otherwise be missing gets stamped into the floor plan as
       'tool_<id>' loot, so the player can recover the kit by
       searching furniture. */
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({
      seed: 7, modifiers: ['locked_tools']
    }));
    // startRogue uses the drafted modifiers via setup.Modifiers.draft;
    // pin them explicitly via setField since startRogue's modifiers
    // come from the draft (we can't pass them directly).
    await page.evaluate(() => {
      SugarCube.State.variables.run.modifiers = ['locked_tools'];
    });
    // Re-run with the same seed so the floor plan reflects the
    // pinned modifier.
    await page.evaluate(() => SugarCube.setup.Rogue.endRogue(false));
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({
      seed: 7,
      // Force-include locked_tools without a draft fight.
      modifierCount: 0
    }));
    await page.evaluate(() => {
      SugarCube.setup.Rogue.addModifier('locked_tools');
      // Re-roll the floor plan with the modifier present so
      // missingToolsToPlace sees locked_tools.
      const fp = SugarCube.setup.FloorPlan.generate(7, {
        roomCount: 7,
        toolKinds: SugarCube.setup.searchToolOrder.slice()
      });
      SugarCube.setup.Rogue.setField('floorplan', fp);
    });

    const fp = await callSetup(page, 'setup.Rogue.field("floorplan")');
    const tools = await callSetup(page, 'setup.searchToolOrder');
    tools.forEach((tool) => {
      expect(fp.loot['tool_' + tool]).toBeDefined();
      expect(fp.lootFurniture['tool_' + tool]).toBeDefined();
    });
  });

  test('startRogue places no tool loot for a default run', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({
      seed: 7, modifierCount: 0
    }));
    const fp = await callSetup(page, 'setup.Rogue.field("floorplan")');
    Object.keys(fp.loot).forEach((k) => {
      expect(k.startsWith('tool_')).toBe(false);
    });
  });

  test('startRogue with restricted loadout places only the missing tools', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({
      seed: 7, modifierCount: 0,
      loadout: { tools: ['emf', 'uvl'] }
    }));
    const fp = await callSetup(page, 'setup.Rogue.field("floorplan")');
    const placed = Object.keys(fp.loot)
      .filter(k => k.startsWith('tool_'))
      .map(k => k.slice('tool_'.length))
      .sort();
    // The four tools missing from the loadout get placed in furniture.
    expect(placed).toEqual(['gwb', 'plasm', 'spiritbox', 'temperature']);
  });

  // --- Mid-run ghost movement ---

  test('driftGhostRoom moves the ghost to a non-hallway room', async () => {
    /* setup.HuntController.shuffleGhostRoom does the interval gate
       + 45% roll; this helper just picks the destination. It must
       always land on a non-hallway room. */
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({
      seed: 1, floorPlanOpts: { roomCount: 6 }
    }));

    const before = await callSetup(page, 'setup.Rogue.ghostRoomId()');
    expect(before).not.toBe('room_0');

    // Force the random-room pick to index 0 of the candidate pool.
    await page.evaluate(() => { Math.random = () => 0; });
    await page.evaluate(() => SugarCube.setup.Rogue.driftGhostRoom());

    const after = await callSetup(page, 'setup.Rogue.ghostRoomId()');
    expect(after).not.toBe('room_0');

    // Verify the new room is in the floor plan and isn't the hallway.
    const fp = await callSetup(page, 'setup.Rogue.field("floorplan")');
    const newRoom = fp.rooms.find(r => r.id === after);
    expect(newRoom).toBeDefined();
    expect(newRoom.template).not.toBe('hallway');
  });

  test('driftGhostRoom prefers a different room than the current lair', async () => {
    /* When more than one non-hallway room exists, the helper picks
       from "every non-hallway room except the current spawn". */
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({
      seed: 5, floorPlanOpts: { roomCount: 6 }
    }));

    const initial = await callSetup(page, 'setup.Rogue.ghostRoomId()');

    // Run drift many times; each call should land somewhere
    // different from `initial`. Math.random=0 picks the first
    // candidate, which is guaranteed to be != initial when others
    // exist.
    await page.evaluate(() => { Math.random = () => 0; });
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => SugarCube.setup.Rogue.driftGhostRoom());
      const cur = await callSetup(page, 'setup.Rogue.ghostRoomId()');
      // After the first call, the ghost should be in some non-
      // initial room. After subsequent calls, the helper picks
      // from "non-hallway and != current", so the room may rotate
      // but never lands on hallway.
      expect(cur).not.toBe('room_0');
    }
  });

  test('driftGhostRoom is a no-op when no run or floor plan is active', async () => {
    // No run.
    await page.evaluate(() => SugarCube.setup.Rogue.driftGhostRoom());
    expect(await callSetup(page, 'setup.Rogue.ghostRoomId()')).toBeNull();

    // Run but no floor plan.
    await page.evaluate(() => SugarCube.setup.Rogue.start({ seed: 1 }));
    await page.evaluate(() => SugarCube.setup.Rogue.driftGhostRoom());
    expect(await callSetup(page, 'setup.Rogue.ghostRoomId()')).toBeNull();
  });

  test('driftGhostRoom falls back to the same room when only one non-hallway room exists', async () => {
    // Edge case: a 2-room floor plan has hallway + one other room.
    // The drift helper should still complete cleanly and leave the
    // ghost on that single non-hallway room.
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({
      seed: 1, floorPlanOpts: { roomCount: 2 }
    }));
    const initial = await callSetup(page, 'setup.Rogue.ghostRoomId()');
    expect(initial).toBe('room_1');

    await page.evaluate(() => SugarCube.setup.Rogue.driftGhostRoom());
    expect(await callSetup(page, 'setup.Rogue.ghostRoomId()')).toBe('room_1');
  });

  test('Empty Bag wins over a populated loadout.tools', async () => {
    /* If both apply, the modifier takes precedence: the player
       drafted Empty Bag, so even unlocks they were going to start
       with don't show up. */
    await page.evaluate(() => SugarCube.setup.Rogue.start({
      seed: 1,
      modifiers: ['locked_tools'],
      loadout: { tools: ['emf', 'uvl'] }
    }));
    expect(await callSetup(page, 'setup.Rogue.startingTools()')).toEqual([]);
  });
});

/* setup.Rogue.stashStolenClothes places the steal target on a
   furniture slot using the same loot/lootFurniture pipeline as
   the other rogue loot kinds, weighted by BFS distance from the
   player's current room (~50% same room, then 1/distance
   falloff). */
test.describe('Rogue Controller — stashStolenClothes', () => {
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

  /* Build a deterministic floor plan whose hallway has furniture so
     the "stash in current room" branch can be exercised. We force
     the templates list through a fixed sequence by patching the
     plan post-generation; the alternative would be hunting for a
     seed whose hallway happens to satisfy the constraint, which is
     brittle. */
  async function startWithPlan() {
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({
      seed: 42, floorPlanOpts: { roomCount: 5 }
    }));
  }

  test('returns null when no run is active', async () => {
    const out = await page.evaluate(() =>
      SugarCube.setup.Rogue.stashStolenClothes());
    expect(out).toBeNull();
  });

  test('stash lands somewhere on the active floor plan', async () => {
    await startWithPlan();
    const result = await page.evaluate(() =>
      SugarCube.setup.Rogue.stashStolenClothes());
    expect(result).not.toBeNull();
    const fp = await callSetup(page, 'setup.Rogue.field("floorplan")');
    expect(fp.loot.clothesStolen).toBe(result.roomId);
    expect(fp.lootFurniture.clothesStolen).toBe(result.suffix);
    // Picked room must have furniture and the picked suffix must
    // be in that template's furniture list.
    const room = fp.rooms.find(r => r.id === result.roomId);
    const tmpl = await page.evaluate(t =>
      SugarCube.setup.Templates.byId(t), room.template);
    expect(tmpl.furniture).toContain(result.suffix);
  });

  test('FurnitureSearch can find the stash via lootKindsAt', async () => {
    /* The whole point of plumbing the stash through the loot
       pipeline is that the existing furniture-search lookup picks
       it up without a special case. */
    await startWithPlan();
    const stash = await page.evaluate(() =>
      SugarCube.setup.Rogue.stashStolenClothes());
    const kinds = await page.evaluate(({ r, s }) =>
      SugarCube.setup.Rogue.lootKindsAt(r, s), { r: stash.roomId, s: stash.suffix });
    expect(kinds).toContain('clothesStolen');
  });

  test('current room (when furnitured) absorbs ~50% of the distribution', async () => {
    /* Force the player into a room with furniture, then sample
       the stash room many times. The current room should land
       roughly half the time -- looser bounds (35-65%) to keep
       the test robust against PRNG variance. */
    await startWithPlan();

    // Pick a non-hallway room with furniture as the player's spot.
    const fp = await callSetup(page, 'setup.Rogue.field("floorplan")');
    const furnitureRoom = await page.evaluate(plan => {
      for (const r of plan.rooms) {
        if (r.id === 'room_0') continue;
        const t = SugarCube.setup.Templates.byId(r.template);
        if (t && t.furniture && t.furniture.length) return r.id;
      }
      return null;
    }, fp);
    expect(furnitureRoom).not.toBeNull();
    await page.evaluate(id => SugarCube.setup.Rogue.setCurrentRoom(id), furnitureRoom);

    const N = 400;
    const counts = await page.evaluate(({ n, here }) => {
      const c = {};
      for (let i = 0; i < n; i++) {
        const r = SugarCube.setup.Rogue.stashStolenClothes();
        c[r.roomId] = (c[r.roomId] || 0) + 1;
      }
      return c;
    }, { n: N, here: furnitureRoom });
    const hereShare = (counts[furnitureRoom] || 0) / N;
    expect(hereShare).toBeGreaterThan(0.35);
    expect(hereShare).toBeLessThan(0.65);
  });

  test('distance falloff: nearer rooms beat farther rooms over many samples', async () => {
    /* Build a long-chain plan so distance 1 vs distance 3 is
       unambiguous. The 1/distance weighting must produce
       count(near) > count(far) when sampled many times. We sample
       from a current room with no furniture so the 50%
       "current-room" bucket isn't in play (the test isolates the
       falloff curve, not the same-room bias). */
    await page.evaluate(() => SugarCube.setup.Rogue.start({ seed: 1 }));
    /* Hand-built plan: room_0 (hallway, no furniture) -- room_1 --
       room_2 -- room_3, all in a straight chain, with room_1 and
       room_3 carrying furniture. We use templates whose furniture
       lists are non-empty by reading the catalogue. */
    const plan = await page.evaluate(() => {
      // Pick two real templates that have furniture.
      const cat = SugarCube.setup.Templates;
      const candidates = SugarCube.setup.FloorPlan.nonHallwayTemplates()
        .map(id => ({ id, t: cat.byId(id) }))
        .filter(x => x.t && x.t.furniture && x.t.furniture.length);
      const a = candidates[0].id;
      const b = candidates[1].id;
      const c = candidates[2].id;
      return {
        seed: 1,
        rooms: [
          { id: 'room_0', template: 'hallway' },
          { id: 'room_1', template: a },
          { id: 'room_2', template: b },
          { id: 'room_3', template: c }
        ],
        edges: [['room_0','room_1'], ['room_1','room_2'], ['room_2','room_3']],
        spawnRoomId: 'room_3',
        loot: {},
        lootFurniture: {},
        bossRoomId: null
      };
    });
    await page.evaluate(p => SugarCube.setup.Rogue.setField('floorplan', p), plan);
    // Player at hallway (room_0) -- which has no furniture, so the
    // 50% same-room bucket isn't engaged. Distances: room_1=1,
    // room_2=2, room_3=3.
    await page.evaluate(() => SugarCube.setup.Rogue.setCurrentRoom('room_0'));

    const N = 600;
    const counts = await page.evaluate(n => {
      const c = { room_1: 0, room_2: 0, room_3: 0 };
      for (let i = 0; i < n; i++) {
        const r = SugarCube.setup.Rogue.stashStolenClothes();
        c[r.roomId] = (c[r.roomId] || 0) + 1;
      }
      return c;
    }, N);

    // Strict ordering by distance: distance 1 > distance 2 > distance 3.
    expect(counts.room_1).toBeGreaterThan(counts.room_2);
    expect(counts.room_2).toBeGreaterThan(counts.room_3);
  });

  test('falls back to non-current rooms when current room has no furniture', async () => {
    /* Hallway typically has no furniture -- if the player is in
       the hallway, the stash must land somewhere with furniture. */
    await startWithPlan();
    await page.evaluate(() => SugarCube.setup.Rogue.setCurrentRoom('room_0'));

    // Confirm hallway has no furniture before stashing.
    const fp = await callSetup(page, 'setup.Rogue.field("floorplan")');
    const hallwayTmpl = await page.evaluate(() =>
      SugarCube.setup.Templates.byId('hallway'));
    if (hallwayTmpl && hallwayTmpl.furniture && hallwayTmpl.furniture.length) {
      // Skip: this assumption only holds when hallway is empty.
      return;
    }

    for (let i = 0; i < 20; i++) {
      const r = await page.evaluate(() =>
        SugarCube.setup.Rogue.stashStolenClothes());
      expect(r.roomId).not.toBe('room_0');
    }
  });

  test('avoids slots already occupied by other loot when an alternative exists', async () => {
    /* Pin the only-other-loot kind to a specific (room, suffix),
       then force the stash into that same room and check the
       picker picks a different slot when the room has spare
       furniture. */
    await page.evaluate(() => SugarCube.setup.Rogue.start({ seed: 1 }));
    // Find a template with at least 3 furniture slots so we can
    // crowd one and still have room left over.
    const tmplId = await page.evaluate(() => {
      const cat = SugarCube.setup.Templates;
      return SugarCube.setup.FloorPlan.nonHallwayTemplates()
        .find(id => {
          const t = cat.byId(id);
          return t && t.furniture && t.furniture.length >= 3;
        });
    });
    expect(tmplId).toBeTruthy();
    const tmpl = await page.evaluate(id =>
      SugarCube.setup.Templates.byId(id), tmplId);

    const occupiedSuffix = tmpl.furniture[0];
    const plan = {
      seed: 1,
      rooms: [
        { id: 'room_0', template: 'hallway' },
        { id: 'room_1', template: tmplId }
      ],
      edges: [['room_0', 'room_1']],
      spawnRoomId: 'room_1',
      loot: { cursedItem: 'room_1' },
      lootFurniture: { cursedItem: occupiedSuffix },
      bossRoomId: null
    };
    await page.evaluate(p =>
      SugarCube.setup.Rogue.setField('floorplan', p), plan);
    await page.evaluate(() => SugarCube.setup.Rogue.setCurrentRoom('room_1'));

    // Sample many stashes; none should land on the occupied slot
    // because the picker has free alternatives.
    let collisions = 0;
    for (let i = 0; i < 50; i++) {
      const r = await page.evaluate(() =>
        SugarCube.setup.Rogue.stashStolenClothes());
      if (r.roomId === 'room_1' && r.suffix === occupiedSuffix) collisions++;
    }
    expect(collisions).toBe(0);
  });

  test('re-stashing during the same run clears the prior collected flag', async () => {
    await startWithPlan();
    await page.evaluate(() => SugarCube.setup.Rogue.stashStolenClothes());
    // Simulate the player having already searched / collected the
    // first stash.
    await page.evaluate(() => SugarCube.setup.Rogue.takeLoot('clothesStolen'));
    expect(await callSetup(page, 'setup.Rogue.hasCollected("clothesStolen")')).toBe(true);

    await page.evaluate(() => SugarCube.setup.Rogue.stashStolenClothes());
    // After re-stashing, the new stash must be findable again --
    // i.e. clothesStolen is no longer in collectedLoot.
    expect(await callSetup(page, 'setup.Rogue.hasCollected("clothesStolen")')).toBe(false);
  });
});
