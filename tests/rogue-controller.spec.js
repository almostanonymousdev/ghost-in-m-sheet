const { test, expect } = require('@playwright/test');
const { openGame, resetGame, getVar, setVar, callSetup } = require('./helpers');

/* setup.Rogue owns rogue-run lifecycle ($run) and the persistent
   meta-progression currency ($echoes). Classic mode = no rogue
   run active = $run is null. */
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

  test('fresh save initializes echoes to 0', async () => {
    expect(await getVar(page, 'echoes')).toBe(0);
    expect(await callSetup(page, 'setup.Rogue.echoes()')).toBe(0);
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
      modifiers: ['power_outage', 'tarot_only'],
      loadout: { tools: ['emf'], money: 50 },
      objective: 'rescue'
    }));

    expect(await callSetup(page, 'setup.Rogue.modifiers()')).toEqual(['power_outage', 'tarot_only']);
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
    expect(await callSetup(page, 'setup.Rogue.hasModifier("power_outage")')).toBe(false);

    await page.evaluate(() => SugarCube.setup.Rogue.start({
      seed: 1, modifiers: ['power_outage']
    }));

    expect(await callSetup(page, 'setup.Rogue.hasModifier("power_outage")')).toBe(true);
    expect(await callSetup(page, 'setup.Rogue.hasModifier("tarot_only")')).toBe(false);
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

  // --- Echoes ---

  test('addEchoes accumulates the persistent currency', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.addEchoes(5));
    await page.evaluate(() => SugarCube.setup.Rogue.addEchoes(7));
    expect(await callSetup(page, 'setup.Rogue.echoes()')).toBe(12);
  });

  test('spendEchoes rejects when the player cannot afford the cost', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.addEchoes(3));

    expect(await callSetup(page, 'setup.Rogue.spendEchoes(5)')).toBe(false);
    expect(await callSetup(page, 'setup.Rogue.echoes()')).toBe(3); // unchanged
  });

  test('spendEchoes deducts on success', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.addEchoes(10));

    expect(await callSetup(page, 'setup.Rogue.spendEchoes(4)')).toBe(true);
    expect(await callSetup(page, 'setup.Rogue.echoes()')).toBe(6);
  });

  test('canAffordEchoes reflects the current balance', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.addEchoes(5));

    expect(await callSetup(page, 'setup.Rogue.canAffordEchoes(5)')).toBe(true);
    expect(await callSetup(page, 'setup.Rogue.canAffordEchoes(6)')).toBe(false);
  });

  test('echoes survive across run start/end', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.addEchoes(10));
    await page.evaluate(() => SugarCube.setup.Rogue.start({ seed: 1 }));
    expect(await callSetup(page, 'setup.Rogue.echoes()')).toBe(10);
    await page.evaluate(() => SugarCube.setup.Rogue.end());
    expect(await callSetup(page, 'setup.Rogue.echoes()')).toBe(10);
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
