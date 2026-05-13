const { test, expect } = require('@playwright/test');
const { openGame, resetGame, callSetup } = require('./helpers');

/* setup.HuntController.minimapData() denormalises the active run's floor plan
   for the minimap widget — one record per room with template
   label, spawn / boss flags, and the loot kinds anchored on it.
   The widget renders straight from this list, so coverage here
   is the cheaper way to lock in the structure. */
test.describe('Hunt minimap data', () => {
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

  test('returns null when no hunt is active', async () => {
    expect(await callSetup(page, 'setup.HuntController.minimapData()')).toBeNull();
  });

  test('emits one record per room with template-resolved label', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({
      seed: 42, modifierCount: 0, floorPlanOpts: { roomCount: 5 }
    }));

    const mm = await callSetup(page, 'setup.HuntController.minimapData()');
    expect(mm.length).toBe(5);
    mm.forEach(r => {
      expect(typeof r.id).toBe('string');
      expect(typeof r.template).toBe('string');
      expect(typeof r.label).toBe('string');
      expect(typeof r.isSpawn).toBe('boolean');
      expect(typeof r.isBoss).toBe('boolean');
      expect(Array.isArray(r.lootKinds)).toBe(true);
    });

    // Hallway gets the human-friendly label from setup.Templates.
    const hall = mm.find(r => r.id === 'room_0');
    expect(hall.template).toBe('hallway');
    expect(hall.label).toBe('Hallway');
  });

  test('exactly one room is flagged as spawn', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1 }));
    const mm = await callSetup(page, 'setup.HuntController.minimapData()');
    const spawns = mm.filter(r => r.isSpawn);
    expect(spawns.length).toBe(1);
    expect(spawns[0].id).not.toBe('room_0');
  });

  test('boss room is flagged when includeBoss is on, otherwise no rooms are', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({
      seed: 1, floorPlanOpts: { includeBoss: true }
    }));
    let mm = await callSetup(page, 'setup.HuntController.minimapData()');
    expect(mm.filter(r => r.isBoss).length).toBe(1);

    await page.evaluate(() => SugarCube.setup.HuntController.end());
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1 }));
    mm = await callSetup(page, 'setup.HuntController.minimapData()');
    expect(mm.filter(r => r.isBoss).length).toBe(0);
  });

  test('loot kinds attach to the rooms they were placed on', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({
      seed: 31, floorPlanOpts: { roomCount: 6 }
    }));
    const mm = await callSetup(page, 'setup.HuntController.minimapData()');
    const fp = await callSetup(page, 'setup.HuntController.field("floorplan")');

    // Each kind in fp.loot should appear in exactly one room's
    // lootKinds list.
    Object.entries(fp.loot).forEach(([kind, roomId]) => {
      const owner = mm.find(r => r.id === roomId);
      expect(owner).toBeDefined();
      expect(owner.lootKinds).toContain(kind);
    });

    // Conversely, only those kinds appear on rooms.
    const seen = mm.flatMap(r => r.lootKinds.map(k => [k, r.id]));
    seen.forEach(([k, id]) => {
      expect(fp.loot[k]).toBe(id);
    });
  });

  test('rooms with no loot report an empty lootKinds array', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({
      seed: 99, floorPlanOpts: { roomCount: 9 }
    }));
    const mm = await callSetup(page, 'setup.HuntController.minimapData()');

    // The hallway never carries loot; its lootKinds should be empty.
    const hall = mm.find(r => r.id === 'room_0');
    expect(hall.lootKinds).toEqual([]);
  });

  test('label falls back to template id if the template is unknown', async () => {
    // Synthesize a run with a template id that isn't in setup.Templates.
    await page.evaluate(() => {
      SugarCube.setup.HuntController.startHunt({ seed: 1 });
      const fp = SugarCube.setup.HuntController.field('floorplan');
      fp.rooms.push({ id: 'room_x', template: 'mystery_template' });
      SugarCube.setup.HuntController.setField('floorplan', fp);
    });

    const mm = await callSetup(page, 'setup.HuntController.minimapData()');
    const x = mm.find(r => r.id === 'room_x');
    expect(x.template).toBe('mystery_template');
    expect(x.label).toBe('mystery_template');
  });

  // --- Layout + connections ---

  test('each record carries a position {col, row} and a neighbour list', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({
      seed: 42, floorPlanOpts: { roomCount: 5 }
    }));
    const mm = await callSetup(page, 'setup.HuntController.minimapData()');

    mm.forEach(r => {
      expect(typeof r.position.col).toBe('number');
      expect(typeof r.position.row).toBe('number');
      expect(Array.isArray(r.connections)).toBe(true);
    });

    // The hallway sits at depth 0 (col 0) -- it's always the BFS root.
    const hall = mm.find(r => r.id === 'room_0');
    expect(hall.position.col).toBe(0);

    // Adjacency is symmetric: every connection name reciprocates.
    const byId = Object.fromEntries(mm.map(r => [r.id, r]));
    mm.forEach(r => {
      r.connections.forEach(n => {
        expect(byId[n]).toBeDefined();
        expect(byId[n].connections).toContain(r.id);
      });
    });
  });

  test('layout positions are unique across rooms', async () => {
    // Two rooms must never land on the same (col, row) cell, otherwise
    // the SVG would draw them on top of each other.
    for (const seed of [1, 2, 7, 31, 99, 12345]) {
      const plan = await page.evaluate(s =>
        SugarCube.setup.FloorPlan.generate(s, { roomCount: 8 }), seed);
      const positions = await page.evaluate(p =>
        SugarCube.setup.FloorPlan.layout(p), plan);
      const seen = new Set();
      Object.keys(positions).forEach(id => {
        const key = positions[id].col + ':' + positions[id].row;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      });
    }
  });

  // --- SVG builder ---

  test('minimapSvg returns an empty string with no run active', async () => {
    expect(await callSetup(page, 'setup.HuntController.minimapSvg()')).toBe('');
  });

  test('minimapSvg emits one <rect> per room and one <line> per edge', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({
      seed: 1, floorPlanOpts: { roomCount: 6 }
    }));
    const svg = await callSetup(page, 'setup.HuntController.minimapSvg()');
    const fp = await callSetup(page, 'setup.HuntController.field("floorplan")');

    const rectCount = (svg.match(/<rect /g) || []).length;
    const lineCount = (svg.match(/<line /g) || []).length;
    expect(rectCount).toBe(fp.rooms.length);
    expect(lineCount).toBe(fp.edges.length);

    // The hallway label should appear in the SVG.
    expect(svg.indexOf('>Hallway<')).toBeGreaterThan(-1);
  });

  test('minimapSvg flags the player\'s current room with the current class', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({
      seed: 1, floorPlanOpts: { roomCount: 5 }
    }));
    let svg = await callSetup(page, 'setup.HuntController.minimapSvg()');
    // Default: room_0 (hallway) is current.
    expect(svg).toMatch(/hunt-minimap-current[^"]*"\s+data-room="room_0"/);

    // Move the player; the highlight should follow.
    await page.evaluate(() => SugarCube.setup.HuntController.setCurrentRoom('room_2'));
    svg = await callSetup(page, 'setup.HuntController.minimapSvg()');
    expect(svg).toMatch(/hunt-minimap-current[^"]*"\s+data-room="room_2"/);
    expect(svg).not.toMatch(/hunt-minimap-current[^"]*"\s+data-room="room_0"/);
  });

  test('minimapSvg tags the boss room but never reveals the ghost spawn', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({
      seed: 1, floorPlanOpts: { roomCount: 5, includeBoss: true }
    }));
    const fp = await callSetup(page, 'setup.HuntController.field("floorplan")');
    const svg = await callSetup(page, 'setup.HuntController.minimapSvg()');
    const bossRe  = new RegExp('hunt-minimap-boss[^"]*"\\s+data-room="' + fp.bossRoomId + '"');
    expect(svg).toMatch(bossRe);
    // The ghost's lair must not be highlighted on the minimap --
    // the spawn class is intentionally omitted from the SVG nodes.
    expect(svg).not.toMatch(/hunt-minimap-spawn/);
  });

  // --- Click-to-collapse state ---

  test('isMinimapCollapsed defaults to false; toggle flips and returns the new value', async () => {
    expect(await callSetup(page, 'setup.HuntController.isMinimapCollapsed()')).toBe(false);
    expect(await callSetup(page, 'setup.HuntController.toggleMinimapCollapsed()')).toBe(true);
    expect(await callSetup(page, 'setup.HuntController.isMinimapCollapsed()')).toBe(true);
    expect(await callSetup(page, 'setup.HuntController.toggleMinimapCollapsed()')).toBe(false);
    expect(await callSetup(page, 'setup.HuntController.isMinimapCollapsed()')).toBe(false);
  });

  test('endHunt resets the collapsed flag so the next run starts expanded', async () => {
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1 }));
    await page.evaluate(() => SugarCube.setup.HuntController.toggleMinimapCollapsed());
    expect(await callSetup(page, 'setup.HuntController.isMinimapCollapsed()')).toBe(true);

    await page.evaluate(() => SugarCube.setup.HuntController.endHunt(true));
    expect(await callSetup(page, 'setup.HuntController.isMinimapCollapsed()')).toBe(false);
  });
});
