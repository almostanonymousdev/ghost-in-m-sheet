const { test, expect } = require('@playwright/test');
const { openGame, callSetup } = require('./helpers');

/* setup.Templates is the single source of truth for room-template
   metadata: furniture slots, hide-spots, procedural eligibility.
   The floor-plan generator and the eventual hunt-room renderer
   read from here. */
test.describe('Room template catalogue', () => {
  let page;

  test.beforeAll(async ({ browser }) => {
    page = await openGame(browser);
  });

  test.afterAll(async () => {
    await page.close();
  });

  // --- Catalogue shape ---

  test('catalogue lists the core room templates', async () => {
    const ids = await callSetup(page, 'setup.Templates.ids()');
    const expected = [
      'kitchen', 'bathroom', 'bedroom', 'livingroom', 'hallway',
      'nursery', 'basement'
    ];
    expected.forEach(id => expect(ids).toContain(id));
  });

  test('catalogue lists the hunt-only templates', async () => {
    const ids = await callSetup(page, 'setup.Templates.ids()');
    ['attic', 'dining-room', 'sauna', 'sex-dungeon', 'walk-in-closet']
      .forEach(id => expect(ids).toContain(id));
  });

  test('every entry has the required fields', async () => {
    const tmpls = await callSetup(page, 'setup.Templates.list()');
    tmpls.forEach(t => {
      expect(typeof t.id).toBe('string');
      expect(typeof t.label).toBe('string');
      expect(Array.isArray(t.furniture)).toBe(true);
      expect(typeof t.proceduralEligible).toBe('boolean');
      // hideSpot must be either null or one of the furniture suffixes.
      if (t.hideSpot !== null) {
        expect(t.furniture).toContain(t.hideSpot);
      }
    });
  });

  test('byId returns the entry or null', async () => {
    const k = await callSetup(page, 'setup.Templates.byId("kitchen")');
    expect(k.id).toBe('kitchen');

    const missing = await callSetup(page, 'setup.Templates.byId("ballroom")');
    expect(missing).toBeNull();
  });

  // --- Procedural eligibility ---

  test('hallway is not in the procedural-eligible list', async () => {
    const eligible = await callSetup(page, 'setup.Templates.proceduralEligibleIds()');
    expect(eligible).not.toContain('hallway');
  });

  test('story-locked templates (ironclad cells, hallwayUpstairs) are not procedurally eligible', async () => {
    const eligible = await callSetup(page, 'setup.Templates.proceduralEligibleIds()');
    ['BlockA', 'BlockB', 'BlockACellA', 'reception', 'hallwayUpstairs', 'bedroomTwo']
      .forEach(id => expect(eligible).not.toContain(id));
  });

  test('authored-house templates (kitchen, bedroom, livingroom) remain procedurally eligible', async () => {
    // Hunt plans draw from the union of authored and hunt-only
    // templates so the floor plan has variety beyond the five
    // dedicated hunt scenes.
    const eligible = await callSetup(page, 'setup.Templates.proceduralEligibleIds()');
    ['kitchen', 'bathroom', 'bedroom', 'livingroom', 'nursery', 'basement']
      .forEach(id => expect(eligible).toContain(id));
  });

  test('enigma trio rooms (roomA, roomB, roomC) are NOT procedurally eligible', async () => {
    // The empty-furniture enigma rooms are story-locked and have no
    // hunt background art, so they must not show up in hunt plans.
    const eligible = await callSetup(page, 'setup.Templates.proceduralEligibleIds()');
    ['roomA', 'roomB', 'roomC']
      .forEach(id => expect(eligible).not.toContain(id));
  });

  test('hunt-only templates (attic, dining-room, sauna, sex-dungeon, walk-in-closet) are procedurally eligible', async () => {
    const eligible = await callSetup(page, 'setup.Templates.proceduralEligibleIds()');
    ['attic', 'dining-room', 'sauna', 'sex-dungeon', 'walk-in-closet']
      .forEach(id => expect(eligible).toContain(id));
  });

  test('every procedurally-eligible template has a hunt background entry', async () => {
    // setup.Styles.bgUrlForTemplate must resolve every hunt room
    // the floor-plan generator can pick, so the player never lands
    // in a room with no background art.
    const eligible = await callSetup(page, 'setup.Templates.proceduralEligibleIds()');
    for (const id of eligible) {
      const bg = await callSetup(page, `setup.Styles.bgUrlForTemplate("${id}")`);
      expect(bg, `template "${id}" has no hunt background mapping`).toBeTruthy();
    }
  });

  // --- Slot-id helpers ---

  test('slotIdsFor builds room-prefixed slot ids', async () => {
    const slots = await callSetup(page, 'setup.Templates.slotIdsFor("kitchen", "room_3")');
    expect(slots).toEqual(['room_3_desk', 'room_3_table', 'room_3_sink1']);
  });

  test('slotIdsFor returns [] for unknown template or missing roomId', async () => {
    expect(await callSetup(page, 'setup.Templates.slotIdsFor("ballroom", "room_1")')).toEqual([]);
    expect(await callSetup(page, 'setup.Templates.slotIdsFor("kitchen", "")')).toEqual([]);
  });

  test('hideSpotIdFor returns the prefixed hide-spot slot or null', async () => {
    expect(await callSetup(page, 'setup.Templates.hideSpotIdFor("bedroom", "room_2")')).toBe('room_2_bed');
    expect(await callSetup(page, 'setup.Templates.hideSpotIdFor("kitchen", "room_1")')).toBeNull();
    expect(await callSetup(page, 'setup.Templates.hideSpotIdFor("ballroom", "room_1")')).toBeNull();
  });

  // --- FloorPlan integration ---

  test('FloorPlan.nonHallwayTemplates matches Templates.proceduralEligibleIds minus hallway', async () => {
    const fpList = await callSetup(page, 'setup.FloorPlan.nonHallwayTemplates()');
    const tmplList = await callSetup(page, 'setup.Templates.proceduralEligibleIds()');
    expect(fpList.sort()).toEqual(tmplList.filter(id => id !== 'hallway').sort());
  });
});
