const { test, expect } = require('@playwright/test');
const { openGame, resetGame, callSetup } = require('./helpers');

/* setup.Run.minimapData() denormalises the active run's floor plan
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
    expect(await callSetup(page, 'setup.Run.minimapData()')).toBeNull();
  });

  test('emits one record per room with template-resolved label', async () => {
    await page.evaluate(() => SugarCube.setup.Run.startRogue({
      seed: 42, floorPlanOpts: { roomCount: 5 }
    }));

    const mm = await callSetup(page, 'setup.Run.minimapData()');
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
    await page.evaluate(() => SugarCube.setup.Run.startRogue({ seed: 1 }));
    const mm = await callSetup(page, 'setup.Run.minimapData()');
    const spawns = mm.filter(r => r.isSpawn);
    expect(spawns.length).toBe(1);
    expect(spawns[0].id).not.toBe('room_0');
  });

  test('boss room is flagged when includeBoss is on, otherwise no rooms are', async () => {
    await page.evaluate(() => SugarCube.setup.Run.startRogue({
      seed: 1, floorPlanOpts: { includeBoss: true }
    }));
    let mm = await callSetup(page, 'setup.Run.minimapData()');
    expect(mm.filter(r => r.isBoss).length).toBe(1);

    await page.evaluate(() => SugarCube.setup.Run.end());
    await page.evaluate(() => SugarCube.setup.Run.startRogue({ seed: 1 }));
    mm = await callSetup(page, 'setup.Run.minimapData()');
    expect(mm.filter(r => r.isBoss).length).toBe(0);
  });

  test('stash kinds attach to the rooms they were placed on', async () => {
    await page.evaluate(() => SugarCube.setup.Run.startRogue({
      seed: 31, floorPlanOpts: { roomCount: 6 }
    }));
    const mm = await callSetup(page, 'setup.Run.minimapData()');
    const fp = await callSetup(page, 'setup.Run.field("floorplan")');

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
    await page.evaluate(() => SugarCube.setup.Run.startRogue({
      seed: 99, floorPlanOpts: { roomCount: 9 }
    }));
    const mm = await callSetup(page, 'setup.Run.minimapData()');

    // The hallway never carries a stash; its stashKinds should be empty.
    const hall = mm.find(r => r.id === 'room_0');
    expect(hall.stashKinds).toEqual([]);
  });

  test('label falls back to template id if the template is unknown', async () => {
    // Synthesize a run with a template id that isn't in setup.Templates.
    await page.evaluate(() => {
      SugarCube.setup.Run.startRogue({ seed: 1 });
      const fp = SugarCube.setup.Run.field('floorplan');
      fp.rooms.push({ id: 'room_x', template: 'mystery_template' });
      SugarCube.setup.Run.setField('floorplan', fp);
    });

    const mm = await callSetup(page, 'setup.Run.minimapData()');
    const x = mm.find(r => r.id === 'room_x');
    expect(x.template).toBe('mystery_template');
    expect(x.label).toBe('mystery_template');
  });
});
