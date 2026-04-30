const { test, expect } = require('@playwright/test');
const { openGame, resetGame, callSetup } = require('./helpers');

/* setup.Rogue.minimapData() denormalises the active run's floor plan
   for the minimap widget — one record per room with template
   label, spawn / boss flags, and the stash kinds anchored on it.
   The widget renders straight from this list, so coverage here
   is the cheaper way to lock in the structure. */
test.describe('Rogue minimap data', () => {
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

  test('returns null when no rogue run is active', async () => {
    expect(await callSetup(page, 'setup.Rogue.minimapData()')).toBeNull();
  });

  test('emits one record per room with template-resolved label', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({
      seed: 42, floorPlanOpts: { roomCount: 5 }
    }));

    const mm = await callSetup(page, 'setup.Rogue.minimapData()');
    expect(mm.length).toBe(5);
    mm.forEach(r => {
      expect(typeof r.id).toBe('string');
      expect(typeof r.template).toBe('string');
      expect(typeof r.label).toBe('string');
      expect(typeof r.isSpawn).toBe('boolean');
      expect(typeof r.isBoss).toBe('boolean');
      expect(Array.isArray(r.stashKinds)).toBe(true);
    });

    // Hallway gets the human-friendly label from setup.Templates.
    const hall = mm.find(r => r.id === 'room_0');
    expect(hall.template).toBe('hallway');
    expect(hall.label).toBe('Hallway');
  });

  test('exactly one room is flagged as spawn', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({ seed: 1 }));
    const mm = await callSetup(page, 'setup.Rogue.minimapData()');
    const spawns = mm.filter(r => r.isSpawn);
    expect(spawns.length).toBe(1);
    expect(spawns[0].id).not.toBe('room_0');
  });

  test('boss room is flagged when includeBoss is on, otherwise no rooms are', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({
      seed: 1, floorPlanOpts: { includeBoss: true }
    }));
    let mm = await callSetup(page, 'setup.Rogue.minimapData()');
    expect(mm.filter(r => r.isBoss).length).toBe(1);

    await page.evaluate(() => SugarCube.setup.Rogue.end());
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({ seed: 1 }));
    mm = await callSetup(page, 'setup.Rogue.minimapData()');
    expect(mm.filter(r => r.isBoss).length).toBe(0);
  });

  test('stash kinds attach to the rooms they were placed on', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({
      seed: 31, floorPlanOpts: { roomCount: 6 }
    }));
    const mm = await callSetup(page, 'setup.Rogue.minimapData()');
    const fp = await callSetup(page, 'setup.Rogue.field("floorplan")');

    // Each kind in fp.stashes should appear in exactly one room's
    // stashKinds list.
    Object.entries(fp.stashes).forEach(([kind, roomId]) => {
      const owner = mm.find(r => r.id === roomId);
      expect(owner).toBeDefined();
      expect(owner.stashKinds).toContain(kind);
    });

    // Conversely, only those kinds appear on rooms.
    const seen = mm.flatMap(r => r.stashKinds.map(k => [k, r.id]));
    seen.forEach(([k, id]) => {
      expect(fp.stashes[k]).toBe(id);
    });
  });

  test('rooms with no stash report an empty stashKinds array', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({
      seed: 99, floorPlanOpts: { roomCount: 9 }
    }));
    const mm = await callSetup(page, 'setup.Rogue.minimapData()');

    // The hallway never carries a stash; its stashKinds should be empty.
    const hall = mm.find(r => r.id === 'room_0');
    expect(hall.stashKinds).toEqual([]);
  });

  test('label falls back to template id if the template is unknown', async () => {
    // Synthesize a run with a template id that isn't in setup.Templates.
    await page.evaluate(() => {
      SugarCube.setup.Rogue.startRogue({ seed: 1 });
      const fp = SugarCube.setup.Rogue.field('floorplan');
      fp.rooms.push({ id: 'room_x', template: 'mystery_template' });
      SugarCube.setup.Rogue.setField('floorplan', fp);
    });

    const mm = await callSetup(page, 'setup.Rogue.minimapData()');
    const x = mm.find(r => r.id === 'room_x');
    expect(x.template).toBe('mystery_template');
    expect(x.label).toBe('mystery_template');
  });

  // --- Layout + connections ---

  test('each record carries a position {col, row} and a neighbour list', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({
      seed: 42, floorPlanOpts: { roomCount: 5 }
    }));
    const mm = await callSetup(page, 'setup.Rogue.minimapData()');

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
    expect(await callSetup(page, 'setup.Rogue.minimapSvg()')).toBe('');
  });

  test('minimapSvg emits one <rect> per room and one <line> per edge', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({
      seed: 1, floorPlanOpts: { roomCount: 6 }
    }));
    const svg = await callSetup(page, 'setup.Rogue.minimapSvg()');
    const fp = await callSetup(page, 'setup.Rogue.field("floorplan")');

    const rectCount = (svg.match(/<rect /g) || []).length;
    const lineCount = (svg.match(/<line /g) || []).length;
    expect(rectCount).toBe(fp.rooms.length);
    expect(lineCount).toBe(fp.edges.length);

    // The hallway label should appear in the SVG.
    expect(svg.indexOf('>Hallway<')).toBeGreaterThan(-1);
  });

  test('minimapSvg flags the player\'s current room with the current class', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({
      seed: 1, floorPlanOpts: { roomCount: 5 }
    }));
    let svg = await callSetup(page, 'setup.Rogue.minimapSvg()');
    // Default: room_0 (hallway) is current.
    expect(svg).toMatch(/rogue-minimap-current[^"]*"\s+data-room="room_0"/);

    // Move the player; the highlight should follow.
    await page.evaluate(() => SugarCube.setup.Rogue.setCurrentRoom('room_2'));
    svg = await callSetup(page, 'setup.Rogue.minimapSvg()');
    expect(svg).toMatch(/rogue-minimap-current[^"]*"\s+data-room="room_2"/);
    expect(svg).not.toMatch(/rogue-minimap-current[^"]*"\s+data-room="room_0"/);
  });

  test('minimapSvg tags spawn and boss rooms when present', async () => {
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({
      seed: 1, floorPlanOpts: { roomCount: 5, includeBoss: true }
    }));
    const fp = await callSetup(page, 'setup.Rogue.field("floorplan")');
    const svg = await callSetup(page, 'setup.Rogue.minimapSvg()');
    const spawnRe = new RegExp('rogue-minimap-spawn[^"]*"\\s+data-room="' + fp.spawnRoomId + '"');
    const bossRe  = new RegExp('rogue-minimap-boss[^"]*"\\s+data-room="' + fp.bossRoomId + '"');
    expect(svg).toMatch(spawnRe);
    expect(svg).toMatch(bossRe);
  });
});
