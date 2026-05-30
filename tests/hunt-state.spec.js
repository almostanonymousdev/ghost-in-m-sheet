const { test, expect } = require('@playwright/test');
const { openGame, resetGame, getVar, setVar, callSetup } = require('./helpers');

/* setup.HuntController owns the hunt lifecycle ($run) and the persistent
   meta-progression currency ($ectoplasm, measured in mL). $run is
   null when no hunt is active. */
test.describe('Hunt Controller', () => {
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

  test('fresh save starts with no hunt active', async () => {
    expect(await getVar(page, 'run')).toBeNull();
    expect(await callSetup(page, '(!setup.HuntController.isActive())')).toBe(true);
    expect(await callSetup(page, 'setup.HuntController.isActive()')).toBe(false);
    expect(await callSetup(page, 'setup.HuntController.active()')).toBeNull();
  });

  test('fresh save initializes ectoplasm to 0 mL', async () => {
    expect(await getVar(page, 'ectoplasm')).toBe(0);
    expect(await callSetup(page, 'setup.HuntController.ectoplasm()')).toBe(0);
  });

  // --- Run lifecycle ---

  test('start() with explicit seed records the seed and increments run number', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.start({ seed: 12345 }));

    expect(await callSetup(page, 'setup.HuntController.seed()')).toBe(12345);
    expect(await callSetup(page, 'setup.HuntController.number()')).toBe(1);
    expect(await callSetup(page, 'setup.HuntController.isActive()')).toBe(true);
  });

  test('start() without seed rolls a random one in [0, 1e9)', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.start());

    const seed = await callSetup(page, 'setup.HuntController.seed()');
    expect(typeof seed).toBe('number');
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThan(1e9);
  });

  test('default objective is "identify"', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.start({ seed: 1 }));
    expect(await callSetup(page, 'setup.HuntController.objective()')).toBe('identify');
  });

  test('start() with options stores modifiers, loadout, objective', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.start({
      seed: 7,
      modifiers: ['locked_tools', 'pheromones'],
      loadout: { tools: ['emf'], money: 50 },
      objective: 'rescue'
    }));

    expect(await callSetup(page, 'setup.HuntController.modifiers()')).toEqual(['locked_tools', 'pheromones']);
    expect(await callSetup(page, 'setup.HuntController.loadout()')).toEqual({ tools: ['emf'], money: 50 });
    expect(await callSetup(page, 'setup.HuntController.objective()')).toBe('rescue');
  });

  test('end() clears the active run and isActive flips back to false', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.start({ seed: 1 }));
    expect(await callSetup(page, 'setup.HuntController.isActive()')).toBe(true);

    await page.evaluate(() => SugarCube.setup.HuntController.end());

    expect(await getVar(page, 'run')).toBeNull();
    expect(await callSetup(page, 'setup.HuntController.isActive()')).toBe(false);
    expect(await callSetup(page, '(!setup.HuntController.isActive())')).toBe(true);
  });

  // --- Address (seed -> street label) ---

  test('addressFromSeed returns deterministic { number, road, suffix, formatted }', async () => {
    const a = await callSetup(page, 'setup.HuntController.addressFromSeed(12345)');
    const b = await callSetup(page, 'setup.HuntController.addressFromSeed(12345)');
    expect(a).toEqual(b);
    expect(typeof a.number).toBe('number');
    expect(a.number).toBeGreaterThanOrEqual(1);
    expect(a.number).toBeLessThanOrEqual(999);
    const roads = await callSetup(page, 'setup.HuntController.ROAD_NAMES');
    const suffixes = await callSetup(page, 'setup.HuntController.ROAD_SUFFIXES');
    expect(roads).toContain(a.road);
    expect(suffixes).toContain(a.suffix);
    expect(a.formatted).toBe(`${a.number} ${a.road} ${a.suffix}`);
  });

  test('addressFromSeed produces varied labels across seeds', async () => {
    const labels = [];
    for (let s = 1; s <= 50; s++) {
      labels.push(await callSetup(page, `setup.HuntController.addressFromSeed(${s})`).then(a => a.formatted));
    }
    // Not strictly unique (only 5x5x999 = ~25k labels) but 50 seeds
    // should easily produce more than a few distinct labels.
    expect(new Set(labels).size).toBeGreaterThan(10);
  });

  test('address() returns null off-run and the active run\'s label otherwise', async () => {
    expect(await callSetup(page, 'setup.HuntController.address()')).toBeNull();
    await page.evaluate(() => SugarCube.setup.HuntController.start({ seed: 12345 }));
    const live = await callSetup(page, 'setup.HuntController.address()');
    const fromSeed = await callSetup(page, 'setup.HuntController.addressFromSeed(12345)');
    expect(live).toEqual(fromSeed);
  });

  test('run number increments across successive runs', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.start({ seed: 1 }));
    await page.evaluate(() => SugarCube.setup.HuntController.end());
    await page.evaluate(() => SugarCube.setup.HuntController.start({ seed: 2 }));
    expect(await callSetup(page, 'setup.HuntController.number()')).toBe(2);
    await page.evaluate(() => SugarCube.setup.HuntController.end());
    await page.evaluate(() => SugarCube.setup.HuntController.start({ seed: 3 }));
    expect(await callSetup(page, 'setup.HuntController.number()')).toBe(3);
  });

  // --- Modifier helpers ---

  test('hasModifier matches the active deck and returns false off-run', async () => {
    expect(await callSetup(page, 'setup.HuntController.hasModifier("pheromones")')).toBe(false);

    await page.evaluate(() => SugarCube.setup.HuntController.start({
      seed: 1, modifiers: ['pheromones']
    }));

    expect(await callSetup(page, 'setup.HuntController.hasModifier("pheromones")')).toBe(true);
    expect(await callSetup(page, 'setup.HuntController.hasModifier("locked_tools")')).toBe(false);
  });

  test('addModifier appends to the deck and is idempotent', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.start({ seed: 1 }));

    expect(await callSetup(page, 'setup.HuntController.addModifier("foo")')).toBe(true);
    expect(await callSetup(page, 'setup.HuntController.addModifier("foo")')).toBe(false);
    expect(await callSetup(page, 'setup.HuntController.modifiers()')).toEqual(['foo']);

    await page.evaluate(() => SugarCube.setup.HuntController.addModifier('bar'));
    expect(await callSetup(page, 'setup.HuntController.modifiers()')).toEqual(['foo', 'bar']);
  });

  // --- Generic field stowage ---

  test('setField/field round-trips arbitrary per-run subsystem state', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.start({ seed: 1 }));

    await page.evaluate(() => SugarCube.setup.HuntController.setField('floorplan', { rooms: ['a', 'b'] }));
    expect(await callSetup(page, 'setup.HuntController.field("floorplan")')).toEqual({ rooms: ['a', 'b'] });
  });

  test('setField/field is a no-op when no run is active', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.setField('floorplan', { rooms: ['a'] }));
    expect(await callSetup(page, 'setup.HuntController.field("floorplan")')).toBeUndefined();
  });

  // --- Ectoplasm (mL) ---

  test('addEctoplasm accumulates the persistent currency', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.addEctoplasm(5));
    await page.evaluate(() => SugarCube.setup.HuntController.addEctoplasm(7));
    expect(await callSetup(page, 'setup.HuntController.ectoplasm()')).toBe(12);
  });

  test('removeEctoplasm rejects when the player cannot afford the cost', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.addEctoplasm(3));

    expect(await callSetup(page, 'setup.HuntController.removeEctoplasm(5)')).toBe(false);
    expect(await callSetup(page, 'setup.HuntController.ectoplasm()')).toBe(3); // unchanged
  });

  test('removeEctoplasm deducts on success', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.addEctoplasm(10));

    expect(await callSetup(page, 'setup.HuntController.removeEctoplasm(4)')).toBe(true);
    expect(await callSetup(page, 'setup.HuntController.ectoplasm()')).toBe(6);
  });

  test('canAffordEctoplasm reflects the current balance', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.addEctoplasm(5));

    expect(await callSetup(page, 'setup.HuntController.canAffordEctoplasm(5)')).toBe(true);
    expect(await callSetup(page, 'setup.HuntController.canAffordEctoplasm(6)')).toBe(false);
  });

  test('ectoplasm survives across run start/end', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.addEctoplasm(10));
    await page.evaluate(() => SugarCube.setup.HuntController.start({ seed: 1 }));
    expect(await callSetup(page, 'setup.HuntController.ectoplasm()')).toBe(10);
    await page.evaluate(() => SugarCube.setup.HuntController.end());
    expect(await callSetup(page, 'setup.HuntController.ectoplasm()')).toBe(10);
  });

  // --- Current room ---

  test('currentRoomId defaults to room_0 (hallway) on a fresh run', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1 }));
    expect(await callSetup(page, 'setup.HuntController.currentRoomId()')).toBe('room_0');
  });

  test('currentRoomId is null with no run active', async () => {
    expect(await callSetup(page, 'setup.HuntController.currentRoomId()')).toBeNull();
  });

  test('setCurrentRoom moves the player when the id is on the floor plan', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({
      seed: 1, floorPlanOpts: { roomCount: 5 }
    }));
    expect(await callSetup(page, 'setup.HuntController.setCurrentRoom("room_2")')).toBe(true);
    expect(await callSetup(page, 'setup.HuntController.currentRoomId()')).toBe('room_2');
  });

  test('setCurrentRoom rejects unknown room ids and leaves currentRoomId alone', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1 }));
    expect(await callSetup(page, 'setup.HuntController.setCurrentRoom("room_999")')).toBe(false);
    expect(await callSetup(page, 'setup.HuntController.currentRoomId()')).toBe('room_0');
  });

  test('currentRoomData returns the room name, furniture, and adjacency', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({
      seed: 42, floorPlanOpts: { roomCount: 5 }
    }));
    const cr = await callSetup(page, 'setup.HuntController.currentRoomData()');

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
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({
      seed: 31, floorPlanOpts: { roomCount: 6 }
    }));
    /* Open the cursed-item quest so the cursedItem loot gate (see
       setup.HuntController.isLootKindAvailable) lets the slot light
       up — this test just needs *some* loot kind to be visible on a
       furniture slot and picks the first one keyed in lootFurniture. */
    await page.evaluate(() => SugarCube.setup.Witch.clearCursedItemHeld());
    const fp = await callSetup(page, 'setup.HuntController.field("floorplan")');
    const kind = Object.keys(fp.lootFurniture)[0];
    const roomId = fp.loot[kind];
    const suffix = fp.lootFurniture[kind];

    await page.evaluate((id) => SugarCube.setup.HuntController.setCurrentRoom(id), roomId);
    const cr = await callSetup(page, 'setup.HuntController.currentRoomData()');
    const slot = cr.furniture.find(f => f.suffix === suffix);
    expect(slot).toBeDefined();
    expect(slot.lootKind).toBe(kind);
    expect(typeof slot.lootLabel).toBe('string');
    expect(slot.lootLabel.length).toBeGreaterThan(0);
  });

  test('currentRoomData returns null when no run is active', async () => {
    expect(await callSetup(page, 'setup.HuntController.currentRoomData()')).toBeNull();
  });

  // --- Per-room light state ---

  test('hunt rooms default to dark', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({
      seed: 1, floorPlanOpts: { roomCount: 5 }
    }));
    expect(await callSetup(page, 'setup.HuntController.isRoomDark("room_0")')).toBe(true);
    expect(await callSetup(page, 'setup.HuntController.isRoomDark("room_1")')).toBe(true);
    expect(await callSetup(page, 'setup.HuntController.isCurrentRoomDark()')).toBe(true);
  });

  test('setRoomLight to LIT flips isRoomDark for that room', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({
      seed: 1, floorPlanOpts: { roomCount: 5 }
    }));
    await page.evaluate(() =>
      SugarCube.setup.HuntController.setRoomLight('room_0', SugarCube.setup.RoomLight.LIT));
    expect(await callSetup(page, 'setup.HuntController.isRoomDark("room_0")')).toBe(false);
    expect(await callSetup(page, 'setup.HuntController.isCurrentRoomDark()')).toBe(false);
  });

  test('light state is per-room and survives navigation', async () => {
    /* Toggling room_0 LIT should not bleed into room_1; navigating
       away and back to room_0 should still see LIT. */
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({
      seed: 42, floorPlanOpts: { roomCount: 5 }
    }));
    await page.evaluate(() =>
      SugarCube.setup.HuntController.setRoomLight('room_0', SugarCube.setup.RoomLight.LIT));
    expect(await callSetup(page, 'setup.HuntController.isRoomDark("room_0")')).toBe(false);
    expect(await callSetup(page, 'setup.HuntController.isRoomDark("room_1")')).toBe(true);

    await page.evaluate(() => SugarCube.setup.HuntController.setCurrentRoom('room_1'));
    expect(await callSetup(page, 'setup.HuntController.isCurrentRoomDark()')).toBe(true);
    await page.evaluate(() => SugarCube.setup.HuntController.setCurrentRoom('room_0'));
    expect(await callSetup(page, 'setup.HuntController.isCurrentRoomDark()')).toBe(false);
  });

  test('setRoomLight back to DARK re-darkens the room', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({
      seed: 1, floorPlanOpts: { roomCount: 5 }
    }));
    await page.evaluate(() =>
      SugarCube.setup.HuntController.setRoomLight('room_0', SugarCube.setup.RoomLight.LIT));
    await page.evaluate(() =>
      SugarCube.setup.HuntController.setRoomLight('room_0', SugarCube.setup.RoomLight.DARK));
    expect(await callSetup(page, 'setup.HuntController.isRoomDark("room_0")')).toBe(true);
  });

  test('lights map clears between runs', async () => {
    /* A fresh start() should hand the player a brand-new $run with
       lights cleared -- otherwise saves would leak previous-run light
       picks into a new haunt. */
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({
      seed: 1, floorPlanOpts: { roomCount: 5 }
    }));
    await page.evaluate(() =>
      SugarCube.setup.HuntController.setRoomLight('room_0', SugarCube.setup.RoomLight.LIT));
    await page.evaluate(() => SugarCube.setup.HuntController.end());
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({
      seed: 2, floorPlanOpts: { roomCount: 5 }
    }));
    expect(await callSetup(page, 'setup.HuntController.isRoomDark("room_0")')).toBe(true);
  });

  test('isRoomDark returns false off-run (no haunt to be dark)', async () => {
    expect(await callSetup(page, 'setup.HuntController.isRoomDark("room_0")')).toBe(false);
  });

  // --- Starting tools (loadout / Empty Bag) ---

  test('startingTools defaults to all six tools in canonical order', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.start({ seed: 1 }));
    expect(await callSetup(page, 'setup.HuntController.startingTools()'))
      .toEqual(['emf', 'plasm', 'gwb', 'spiritbox', 'temperature', 'uvl']);
  });

  test('startingTools collapses to [] when the Empty Bag modifier is active', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.start({
      seed: 1, modifiers: ['locked_tools']
    }));
    expect(await callSetup(page, 'setup.HuntController.startingTools()')).toEqual([]);
  });

  test('startingTools restricts to loadout.tools while preserving canonical order', async () => {
    /* The loadout might list tools in any order (witch ectoplasm
       unlocks, starter packs); the toolbar should still render
       them in searchToolOrder. */
    await page.evaluate(() => SugarCube.setup.HuntController.start({
      seed: 1,
      loadout: { tools: ['uvl', 'emf', 'spiritbox'] }
    }));
    expect(await callSetup(page, 'setup.HuntController.startingTools()'))
      .toEqual(['emf', 'spiritbox', 'uvl']);
  });

  test('startingTools returns [] when no run is active', async () => {
    expect(await callSetup(page, 'setup.HuntController.startingTools()')).toEqual([]);
  });

  // --- Multi-kind furniture slots ---

  test('lootKindsAt returns every uncollected kind pinned to a slot', async () => {
    /* The floor-plan generator forces tarotCards / monkeyPaw / tool_*
       loot onto a furniture-bearing room and prefers distinct slots,
       but falls back to sharing one when the room runs out. The
       lookup helper must surface every uncollected kind so a single
       search can pull them all. Bump mc.lvl past the paw's level
       gate so isLootKindAvailable doesn't filter it. */
    await setVar(page, 'mc.lvl', await callSetup(page, 'setup.MonkeyPaw.levelRequired()'));
    await page.evaluate(() => SugarCube.setup.HuntController.start({ seed: 1 }));
    await page.evaluate(() => {
      // Hand-crafted multi-item slot: room_1 / desk holds three kinds.
      SugarCube.setup.HuntController.setField('floorplan', {
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
    expect(await callSetup(page, 'setup.HuntController.lootKindsAt("room_1", "desk")'))
      .toEqual(['tarotCards', 'monkeyPaw', 'tool_emf']);
    // lootAt keeps single-value semantics for lightweight callers.
    expect(await callSetup(page, 'setup.HuntController.lootAt("room_1", "desk")'))
      .toBe('tarotCards');
  });

  test('lootKindsAt drops kinds that have already been collected', async () => {
    await setVar(page, 'mc.lvl', await callSetup(page, 'setup.MonkeyPaw.levelRequired()'));
    await page.evaluate(() => SugarCube.setup.HuntController.start({ seed: 1 }));
    await page.evaluate(() => {
      SugarCube.setup.HuntController.setField('floorplan', {
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
      SugarCube.setup.HuntController.takeLoot('tarotCards');
    });
    expect(await callSetup(page, 'setup.HuntController.lootKindsAt("room_1", "desk")'))
      .toEqual(['monkeyPaw']);
  });

  test('lootKindsAt returns [] outside a run', async () => {
    expect(await callSetup(page, 'setup.HuntController.lootKindsAt("room_1", "desk")'))
      .toEqual([]);
  });

  test('currentRoomData annotates a slot with its full uncollected kind list', async () => {
    /* Bump mc.lvl past the tarot deck's level gate so
       isLootKindAvailable doesn't filter the hand-stamped tarotCards
       kind out of the slot list. */
    await setVar(page, 'mc.lvl', await callSetup(page, 'setup.Tarot.tarotLevelRequired()'));
    await page.evaluate(() => SugarCube.setup.HuntController.start({ seed: 1 }));
    await page.evaluate(() => {
      SugarCube.setup.HuntController.setField('floorplan', {
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
      SugarCube.setup.HuntController.setCurrentRoom('room_1');
    });
    const room = await callSetup(page, 'setup.HuntController.currentRoomData()');
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
       startHunt. */
    await page.evaluate(() => SugarCube.setup.HuntController.start({
      seed: 1, modifiers: ['locked_tools']
    }));
    expect(await callSetup(page, 'setup.HuntController.startingTools()')).toEqual([]);

    // Simulate picking up two tools mid-run.
    await page.evaluate(() => SugarCube.setup.HuntController.takeLoot('tool_uvl'));
    await page.evaluate(() => SugarCube.setup.HuntController.takeLoot('tool_emf'));

    // Order is canonical setup.searchToolOrder, not pickup order.
    expect(await callSetup(page, 'setup.HuntController.startingTools()'))
      .toEqual(['emf', 'uvl']);
  });

  test('startingTools fills in over a restricted loadout as tools are found', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.start({
      seed: 1, loadout: { tools: ['emf'] }
    }));
    expect(await callSetup(page, 'setup.HuntController.startingTools()')).toEqual(['emf']);
    await page.evaluate(() => SugarCube.setup.HuntController.takeLoot('tool_temperature'));
    expect(await callSetup(page, 'setup.HuntController.startingTools()'))
      .toEqual(['emf', 'temperature']);
  });

  test('startHunt places every tool when locked_tools is active', async () => {
    /* The lifecycle composes the floor-plan options based on the
       drafted modifiers / loadout: any tool the toolbar would
       otherwise be missing gets stamped into the floor plan as
       'tool_<id>' loot, so the player can recover the kit by
       searching furniture. */
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({
      seed: 7, modifiers: ['locked_tools']
    }));
    // startHunt uses the drafted modifiers via setup.Modifiers.draft;
    // pin them explicitly via setField since startHunt's modifiers
    // come from the draft (we can't pass them directly).
    await page.evaluate(() => {
      SugarCube.State.variables.run.modifiers = ['locked_tools'];
    });
    // Re-run with the same seed so the floor plan reflects the
    // pinned modifier.
    await page.evaluate(() => SugarCube.setup.HuntController.endHunt(false));
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({
      seed: 7,
      // Force-include locked_tools without a draft fight.
      modifierCount: 0
    }));
    await page.evaluate(() => {
      SugarCube.setup.HuntController.addModifier('locked_tools');
      // Re-roll the floor plan with the modifier present so
      // missingToolsToPlace sees locked_tools.
      const fp = SugarCube.setup.FloorPlan.generate(7, {
        roomCount: 7,
        toolKinds: SugarCube.setup.searchToolOrder.slice()
      });
      SugarCube.setup.HuntController.setField('floorplan', fp);
    });

    const fp = await callSetup(page, 'setup.HuntController.field("floorplan")');
    const tools = await callSetup(page, 'setup.searchToolOrder');
    tools.forEach((tool) => {
      expect(fp.loot['tool_' + tool]).toBeDefined();
      expect(fp.lootFurniture['tool_' + tool]).toBeDefined();
    });
  });

  test('startHunt places no tool loot for a default run', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({
      seed: 7, modifierCount: 0
    }));
    const fp = await callSetup(page, 'setup.HuntController.field("floorplan")');
    Object.keys(fp.loot).forEach((k) => {
      expect(k.startsWith('tool_')).toBe(false);
    });
  });

  test('startHunt with restricted loadout places only the missing tools', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({
      seed: 7, modifierCount: 0,
      loadout: { tools: ['emf', 'uvl'] }
    }));
    const fp = await callSetup(page, 'setup.HuntController.field("floorplan")');
    const placed = Object.keys(fp.loot)
      .filter(k => k.startsWith('tool_'))
      .map(k => k.slice('tool_'.length))
      .sort();
    // The four tools missing from the loadout get placed in furniture.
    expect(placed).toEqual(['gwb', 'plasm', 'spiritbox', 'temperature']);
  });

  // --- Mid-run ghost movement ---

  test('driftGhostRoom moves the ghost to a real room (hallway eligible)', async () => {
    /* setup.HuntController.shuffleGhostRoom does the interval gate
       + 45% roll; this helper just picks the destination. The full
       room list (hallway included) is fair game. */
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({
      seed: 1, floorPlanOpts: { roomCount: 6 }
    }));

    // Force the random-room pick to index 0 of the candidate pool.
    await page.evaluate(() => { Math.random = () => 0; });
    await page.evaluate(() => SugarCube.setup.HuntController.driftGhostRoom());

    const after = await callSetup(page, 'setup.HuntController.ghostRoomId()');

    // Verify the new room is in the floor plan.
    const fp = await callSetup(page, 'setup.HuntController.field("floorplan")');
    const newRoom = fp.rooms.find(r => r.id === after);
    expect(newRoom).toBeDefined();
  });

  test('driftGhostRoom prefers a different room than the current lair', async () => {
    /* When more than one room exists, the helper picks from "every
       room except the current spawn", so a single drift call always
       relocates the ghost (the hallway is eligible). */
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({
      seed: 5, floorPlanOpts: { roomCount: 6 }
    }));

    const initial = await callSetup(page, 'setup.HuntController.ghostRoomId()');

    // Math.random=0 picks the first candidate from the "everything
    // except current" pool, which is guaranteed != initial.
    await page.evaluate(() => { Math.random = () => 0; });
    await page.evaluate(() => SugarCube.setup.HuntController.driftGhostRoom());
    const after = await callSetup(page, 'setup.HuntController.ghostRoomId()');
    expect(after).not.toBe(initial);

    // Verify the new room is in the floor plan.
    const fp = await callSetup(page, 'setup.HuntController.field("floorplan")');
    expect(fp.rooms.find(r => r.id === after)).toBeDefined();
  });

  test('driftGhostRoom is a no-op when no run or floor plan is active', async () => {
    // No run.
    await page.evaluate(() => SugarCube.setup.HuntController.driftGhostRoom());
    expect(await callSetup(page, 'setup.HuntController.ghostRoomId()')).toBeNull();

    // Run but no floor plan.
    await page.evaluate(() => SugarCube.setup.HuntController.start({ seed: 1 }));
    await page.evaluate(() => SugarCube.setup.HuntController.driftGhostRoom());
    expect(await callSetup(page, 'setup.HuntController.ghostRoomId()')).toBeNull();
  });

  test('driftGhostRoom can drift between hallway and the only other room on a 2-room plan', async () => {
    /* Edge case: a 2-room floor plan has hallway + one other room.
       Drift picks from the "everything except current" pool, so a
       single call always swaps to the other room (the hallway is a
       valid destination too). */
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({
      seed: 1, floorPlanOpts: { roomCount: 2 }
    }));
    const initial = await callSetup(page, 'setup.HuntController.ghostRoomId()');

    await page.evaluate(() => SugarCube.setup.HuntController.driftGhostRoom());
    const after = await callSetup(page, 'setup.HuntController.ghostRoomId()');
    expect(after).not.toBe(initial);

    // The two rooms are room_0 (hallway) and room_1 -- drift just
    // toggled between them.
    expect(['room_0', 'room_1']).toContain(after);
  });

  test('Empty Bag wins over a populated loadout.tools', async () => {
    /* If both apply, the modifier takes precedence: the player
       drafted Empty Bag, so even unlocks they were going to start
       with don't show up. */
    await page.evaluate(() => SugarCube.setup.HuntController.start({
      seed: 1,
      modifiers: ['locked_tools'],
      loadout: { tools: ['emf', 'uvl'] }
    }));
    expect(await callSetup(page, 'setup.HuntController.startingTools()')).toEqual([]);
  });

  // --- endHunt payout multiplier ---

  test('endHunt rogue success payout = (cash 50 + ecto 10) * sum of payoutMultipliers', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.start({
      seed: 1, modifiers: ['locked_tools', 'pheromones']
    }));
    const lt = await callSetup(page, 'setup.Modifiers.byId("locked_tools").payoutMultiplier');
    const ph = await callSetup(page, 'setup.Modifiers.byId("pheromones").payoutMultiplier');
    const summary = await page.evaluate(() => SugarCube.setup.HuntController.endHunt(true));
    expect(summary.cashPayout).toBe(Math.round(50 * lt * ph));
    expect(summary.ectoplasmPayout).toBe(Math.round(10 * lt * ph));
  });

  test('endHunt rogue failure pays consolation ectoplasm scaled by multiplier (base 3)', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.start({
      seed: 1, modifiers: ['fog_of_war']
    }));
    const fow = await callSetup(page, 'setup.Modifiers.byId("fog_of_war").payoutMultiplier');
    const summary = await page.evaluate(() => SugarCube.setup.HuntController.endHunt(false));
    expect(summary.cashPayout).toBe(0);
    expect(summary.ectoplasmPayout).toBe(Math.round(3 * fow));
  });

  test('endHunt rogue no-modifier payout = cash 50 + ecto 10 (success) or 0 + ecto 3 (failure)', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.start({ seed: 1, modifiers: [] }));
    let summary = await page.evaluate(() => SugarCube.setup.HuntController.endHunt(true));
    expect(summary.cashPayout).toBe(50);
    expect(summary.ectoplasmPayout).toBe(10);

    await page.evaluate(() => SugarCube.setup.HuntController.start({ seed: 2, modifiers: [] }));
    summary = await page.evaluate(() => SugarCube.setup.HuntController.endHunt(false));
    expect(summary.cashPayout).toBe(0);
    expect(summary.ectoplasmPayout).toBe(3);
  });

  test('endHunt rogue FLED pays nothing (no cash, no ecto, no XP)', async () => {
    /* Flee is a voluntary walk-away, not a ghost-driven defeat --
       so it skips the consolation ectoplasm and the failure-XP
       trickle the other FailureReasons get. */
    await page.evaluate(() => SugarCube.setup.HuntController.start({ seed: 4, modifiers: [] }));
    const xpBefore = await callSetup(page, 'setup.Mc.exp()');
    const ectoBefore = await callSetup(page, 'setup.HuntController.ectoplasm()');
    await page.evaluate(() => SugarCube.setup.HuntController.markFailure(
      SugarCube.setup.HuntController.FailureReason.FLED
    ));
    const summary = await page.evaluate(() => SugarCube.setup.HuntController.endHunt(false));
    expect(summary.cashPayout).toBe(0);
    expect(summary.ectoplasmPayout).toBe(0);
    expect(summary.xp).toBe(0);
    expect(await callSetup(page, 'setup.Mc.exp()')).toBe(xpBefore);
    expect(await callSetup(page, 'setup.HuntController.ectoplasm()')).toBe(ectoBefore);
  });

  test('endHunt auto-redresses slots the MC took off during the run', async () => {
    /* Hunt clean-exit paths (success / flee) skip cleanupAfterHuntFinalized,
       so redressAfterHunt has to fire from endHunt itself. */
    await page.evaluate(() => SugarCube.setup.HuntController.start({ seed: 3, modifiers: [] }));
    await page.evaluate(() => {
      const V = SugarCube.State.variables;
      V.tshirtState0 = 'not worn';
      V.tshirtState1 = 'not worn';
      V.tshirtState  = 'not worn';
      V.rememberTopOuter = 'notshirt1';
      V.isShirtStolen = false;
    });

    await page.evaluate(() => SugarCube.setup.HuntController.endHunt(true));

    expect(await getVar(page, 'tshirtState1')).toBe('worn');
    expect(await getVar(page, 'tshirtState')).toBe('worn');
  });

  // --- Maze modifier (roomCount += 3) ---

  test('Maze in startHunt bumps roomCount by 3 end-to-end', async () => {
    /* End-to-end: when the modifier is in the draft at startHunt
       time, the resulting floor plan has 3 more rooms than the
       default (which is 5). */
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({
      seed: 99, modifierCount: 0
    }));
    const before = (await callSetup(page, 'setup.HuntController.field("floorplan")')).rooms.length;
    expect(before).toBe(5);

    await page.evaluate(() => SugarCube.setup.HuntController.endHunt(false));
    // Patch draft to deterministically return [maze] so startHunt's
    // own modifier-id lookup sees it during fpOpts composition.
    await page.evaluate(() => {
      const orig = SugarCube.setup.Modifiers.draft;
      SugarCube.setup.Modifiers.draft = function () {
        return [SugarCube.setup.Modifiers.byId('maze')];
      };
      SugarCube.setup.HuntController.startHunt({ seed: 99 });
      SugarCube.setup.Modifiers.draft = orig;
    });
    const after = (await callSetup(page, 'setup.HuntController.field("floorplan")')).rooms.length;
    expect(after).toBe(8);
  });

  // --- Fog of War (one evidence spliced) ---

  test('Fog of War splices one evidence id from the run-evidence list', async () => {
    await page.evaluate(() => {
      const orig = SugarCube.setup.Modifiers.draft;
      SugarCube.setup.Modifiers.draft = function () {
        return [SugarCube.setup.Modifiers.byId('fog_of_war')];
      };
      SugarCube.setup.HuntController.startHunt({ seed: 12345 });
      SugarCube.setup.Modifiers.draft = orig;
    });

    const ghostName = await callSetup(page, 'setup.HuntController.ghostName()');
    const cat = await page.evaluate(name =>
      SugarCube.setup.Ghosts.getByName(name).evidence.map(e => e.id), ghostName);
    const runEv = await callSetup(page, 'setup.HuntController.runEvidence()');

    expect(cat.length).toBe(3);
    expect(runEv.length).toBe(2);
    // Two of the catalogue evidences survive.
    runEv.forEach(id => expect(cat).toContain(id));
  });

  test('without Fog of War, runEvidence equals the catalogue evidence', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({
      seed: 12345, modifierCount: 0
    }));
    const ghostName = await callSetup(page, 'setup.HuntController.ghostName()');
    const cat = await page.evaluate(name =>
      SugarCube.setup.Ghosts.getByName(name).evidence.map(e => e.id), ghostName);
    const runEv = await callSetup(page, 'setup.HuntController.runEvidence()');
    expect(runEv).toEqual(cat);
  });

  test('Fog of War: _activeFromCatalogue exposes the spliced evidence on the active ghost', async () => {
    await page.evaluate(() => {
      const orig = SugarCube.setup.Modifiers.draft;
      SugarCube.setup.Modifiers.draft = function () {
        return [SugarCube.setup.Modifiers.byId('fog_of_war')];
      };
      SugarCube.setup.HuntController.startHunt({ seed: 7777 });
      SugarCube.setup.Modifiers.draft = orig;
    });
    const ghostName = await callSetup(page, 'setup.HuntController.ghostName()');
    const ev = await page.evaluate(name => {
      const g = SugarCube.setup.Ghosts._activeFromCatalogue(name);
      return g ? g.evidence.map(e => e.id) : null;
    }, ghostName);
    const runEv = await callSetup(page, 'setup.HuntController.runEvidence()');
    expect(ev).toEqual(runEv);
    expect(ev.length).toBe(2);
  });

  test('Fog of War splice is deterministic for the same seed', async () => {
    async function runEvForSeed(s) {
      await page.evaluate(() => SugarCube.setup.HuntController.endHunt(false));
      await page.evaluate(seed => {
        const orig = SugarCube.setup.Modifiers.draft;
        SugarCube.setup.Modifiers.draft = function () {
          return [SugarCube.setup.Modifiers.byId('fog_of_war')];
        };
        SugarCube.setup.HuntController.startHunt({ seed });
        SugarCube.setup.Modifiers.draft = orig;
      }, s);
      return await callSetup(page, 'setup.HuntController.runEvidence()');
    }
    const a = await runEvForSeed(424242);
    const b = await runEvForSeed(424242);
    expect(a).toEqual(b);
  });
});

/* setup.HuntController.stashStolenClothes places the steal target on a
   furniture slot using the same loot/lootFurniture pipeline as the
   other hunt loot kinds. Each piece ("panties", "bra", "shirt",
   "bottom") is stashed independently with a uniform-random pick over
   every furniture slot on the floor plan -- overlaps between stolen
   pieces (or with other loot) are allowed. */
test.describe('Hunt Controller — stashStolenClothes', () => {
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

  async function startWithPlan() {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({
      seed: 42, floorPlanOpts: { roomCount: 5 }
    }));
  }

  test('returns null when no run is active', async () => {
    const out = await page.evaluate(() =>
      SugarCube.setup.HuntController.stashStolenClothes('panties'));
    expect(out).toBeNull();
  });

  test('returns null for an unknown piece', async () => {
    await startWithPlan();
    const out = await page.evaluate(() =>
      SugarCube.setup.HuntController.stashStolenClothes('socks'));
    expect(out).toBeNull();
  });

  test('stash lands somewhere on the active floor plan', async () => {
    await startWithPlan();
    const result = await page.evaluate(() =>
      SugarCube.setup.HuntController.stashStolenClothes('panties'));
    expect(result).not.toBeNull();
    expect(result.kind).toBe('clothesStolenPanties');
    const fp = await callSetup(page, 'setup.HuntController.field("floorplan")');
    expect(fp.loot.clothesStolenPanties).toBe(result.roomId);
    expect(fp.lootFurniture.clothesStolenPanties).toBe(result.suffix);
    // Picked room must have furniture and the picked suffix must
    // be in that template's furniture list.
    const room = fp.rooms.find(r => r.id === result.roomId);
    const tmpl = await page.evaluate(t =>
      SugarCube.setup.Templates.byId(t), room.template);
    expect(tmpl.furniture).toContain(result.suffix);
  });

  test('each piece gets its own independent pin', async () => {
    /* Stash all four pieces and confirm the floor plan tracks each
       under its own loot key. They are allowed to share a slot, but
       each key must point at a real (room, suffix). */
    await startWithPlan();
    const results = await page.evaluate(() => ({
      panties: SugarCube.setup.HuntController.stashStolenClothes('panties'),
      bra:     SugarCube.setup.HuntController.stashStolenClothes('bra'),
      shirt:   SugarCube.setup.HuntController.stashStolenClothes('shirt'),
      bottom:  SugarCube.setup.HuntController.stashStolenClothes('bottom')
    }));
    for (const r of Object.values(results)) expect(r).not.toBeNull();
    const fp = await callSetup(page, 'setup.HuntController.field("floorplan")');
    expect(fp.loot.clothesStolenPanties).toBe(results.panties.roomId);
    expect(fp.loot.clothesStolenBra).toBe(results.bra.roomId);
    expect(fp.loot.clothesStolenShirt).toBe(results.shirt.roomId);
    expect(fp.loot.clothesStolenBottom).toBe(results.bottom.roomId);
    expect(fp.lootFurniture.clothesStolenPanties).toBe(results.panties.suffix);
    expect(fp.lootFurniture.clothesStolenBra).toBe(results.bra.suffix);
    expect(fp.lootFurniture.clothesStolenShirt).toBe(results.shirt.suffix);
    expect(fp.lootFurniture.clothesStolenBottom).toBe(results.bottom.suffix);
  });

  test('FurnitureSearch can find the stash via lootKindsAt', async () => {
    /* The whole point of plumbing each stash through the loot
       pipeline is that the existing furniture-search lookup picks
       it up without a special case. lootKindsAt gates on the
       matching per-piece isXxxStolen flag so the detector doesn't
       keep highlighting a stash the player can't pick up. */
    await startWithPlan();
    // The corresponding per-piece stolen flag must be true for
    // lootKindsAt to surface the stash.
    await page.evaluate(() => { SugarCube.State.variables.isPantiesStolen = true; });
    const stash = await page.evaluate(() =>
      SugarCube.setup.HuntController.stashStolenClothes('panties'));
    const kinds = await page.evaluate(({ r, s }) =>
      SugarCube.setup.HuntController.lootKindsAt(r, s), { r: stash.roomId, s: stash.suffix });
    expect(kinds).toContain('clothesStolenPanties');
  });

  test('distribution is approximately uniform across furniture slots', async () => {
    /* New placement is uniform-random over every furniture slot,
       not BFS-weighted. Confirm no room dominates the
       distribution and the player's current room has no special
       weight. */
    await startWithPlan();
    const fp = await callSetup(page, 'setup.HuntController.field("floorplan")');
    const furnitureRoom = await page.evaluate(plan => {
      for (const r of plan.rooms) {
        if (r.id === 'room_0') continue;
        const t = SugarCube.setup.Templates.byId(r.template);
        if (t && t.furniture && t.furniture.length) return r.id;
      }
      return null;
    }, fp);
    expect(furnitureRoom).not.toBeNull();
    await page.evaluate(id => SugarCube.setup.HuntController.setCurrentRoom(id), furnitureRoom);

    // Total furniture slots across the plan, and how many are in
    // the current room. Expected share = slotsInRoom / totalSlots.
    const slotCounts = await page.evaluate(plan => {
      let total = 0, inRoom = 0;
      for (const r of plan.rooms) {
        const t = SugarCube.setup.Templates.byId(r.template);
        const n = (t && t.furniture) ? t.furniture.length : 0;
        total += n;
        if (r.id === SugarCube.setup.HuntController.currentRoomId()) inRoom += n;
      }
      return { total, inRoom };
    }, fp);
    const expectedShare = slotCounts.inRoom / slotCounts.total;

    const N = 600;
    const counts = await page.evaluate(n => {
      const c = {};
      for (let i = 0; i < n; i++) {
        const r = SugarCube.setup.HuntController.stashStolenClothes('panties');
        c[r.roomId] = (c[r.roomId] || 0) + 1;
      }
      return c;
    }, N);
    const hereShare = (counts[furnitureRoom] || 0) / N;
    // Allow generous slack for PRNG variance.
    expect(hereShare).toBeGreaterThan(expectedShare - 0.12);
    expect(hereShare).toBeLessThan(expectedShare + 0.12);
  });

  test('re-stashing during the same run clears the prior collected flag', async () => {
    await startWithPlan();
    await page.evaluate(() =>
      SugarCube.setup.HuntController.stashStolenClothes('panties'));
    // Simulate the player having already searched / collected the
    // first stash.
    await page.evaluate(() =>
      SugarCube.setup.HuntController.takeLoot('clothesStolenPanties'));
    expect(await callSetup(page, 'setup.HuntController.hasCollected("clothesStolenPanties")')).toBe(true);

    await page.evaluate(() =>
      SugarCube.setup.HuntController.stashStolenClothes('panties'));
    // After re-stashing, the new stash must be findable again --
    // i.e. the per-piece key is no longer in collectedLoot.
    expect(await callSetup(page, 'setup.HuntController.hasCollected("clothesStolenPanties")')).toBe(false);
  });
});
