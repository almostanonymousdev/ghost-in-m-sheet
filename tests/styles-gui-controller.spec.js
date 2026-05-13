const { test, expect } = require('./fixtures');
const { setVar, callSetup, goToPassage } = require('./helpers');

/* setup.Styles owns per-room background art + light/dark resolution.
   setup.Gui owns the GUI-overlay return-routing, phone-contact slot
   metadata, and the level-keyed tool-timer table. Both are queried
   from a sprawl of widgets/passages, so a regression here breaks the
   whole right-hand sidebar / overlay chain. These tests pin the
   contract directly off the controller APIs (no DOM dependency). */
test.describe('StyleController (setup.Styles)', () => {

  // --- Catalogue shape -------------------------------------------

  test('every authored haunt-room passage has a backgrounds entry', async ({ game: page }) => {
    const expected = [
      'OwaissaKitchen', 'OwaissaHallway', 'OwaissaBathroom',
      'OwaissaBedroom', 'OwaissaLivingroom',
      'ElmBasement', 'ElmKitchen', 'ElmBathroom', 'ElmBathroomTwo',
      'ElmBedroom', 'ElmBedroomTwo', 'ElmNursery', 'ElmHallway',
      'ElmHallwayUpstairs',
      'IroncladReception', 'IroncladKitchen', 'IroncladHallway',
      'IroncladBlockA', 'IroncladBlockB',
      'IroncladBlockACellA', 'IroncladBlockACellB', 'IroncladBlockACellC',
      'IroncladBlockBCellA', 'IroncladBlockBCellB', 'IroncladBlockBCellC',
    ];
    const known = await callSetup(page, 'Object.keys(setup.Styles.rooms)');
    expected.forEach(p => expect(known).toContain(p));
  });

  test('every authored room entry exposes stateKey, light, dark, cls', async ({ game: page }) => {
    const rooms = await callSetup(page, 'setup.Styles.rooms');
    Object.keys(rooms).forEach(passageName => {
      const r = rooms[passageName];
      expect(typeof r.stateKey).toBe('string');
      expect(r.stateKey.length).toBeGreaterThan(0);
      expect(typeof r.light).toBe('string');
      expect(r.light).toMatch(/^assets\//);
      expect(typeof r.dark).toBe('string');
      expect(r.dark).toMatch(/^assets\//);
      expect(typeof r.cls).toBe('string');
      expect(r.cls.length).toBeGreaterThan(0);
    });
  });

  test('roomOf returns the entry for a known passage and null otherwise', async ({ game: page }) => {
    const k = await callSetup(page, 'setup.Styles.roomOf("OwaissaKitchen")');
    expect(k.stateKey).toBe('kitchen');

    const missing = await callSetup(page, 'setup.Styles.roomOf("NotARoom")');
    expect(missing).toBeNull();
  });

  // --- Light/dark resolution -------------------------------------

  test('bgUrl returns the LIT background when room state is LIT', async ({ game: page }) => {
    const LIT = await callSetup(page, 'setup.RoomLight.LIT');
    await page.evaluate((lit) => {
      SugarCube.setup.Rooms.setBackground('kitchen', lit);
    }, LIT);
    const url = await callSetup(page, 'setup.Styles.bgUrl("OwaissaKitchen")');
    const lightUrl = await callSetup(page, 'setup.Styles.rooms.OwaissaKitchen.light');
    expect(url).toBe(lightUrl);
  });

  test('bgUrl returns the DARK background when room state is DARK', async ({ game: page }) => {
    const DARK = await callSetup(page, 'setup.RoomLight.DARK');
    await page.evaluate((dark) => {
      SugarCube.setup.Rooms.setBackground('kitchen', dark);
    }, DARK);
    const url = await callSetup(page, 'setup.Styles.bgUrl("OwaissaKitchen")');
    const darkUrl = await callSetup(page, 'setup.Styles.rooms.OwaissaKitchen.dark');
    expect(url).toBe(darkUrl);
  });

  test('bgUrl returns null for an unknown passage', async ({ game: page }) => {
    expect(await callSetup(page, 'setup.Styles.bgUrl("NotARoom")')).toBeNull();
  });

  test('isDarkRoom matches the underlying room state', async ({ game: page }) => {
    const LIT = await callSetup(page, 'setup.RoomLight.LIT');
    const DARK = await callSetup(page, 'setup.RoomLight.DARK');

    await page.evaluate((d) => SugarCube.setup.Rooms.setBackground('kitchen', d), DARK);
    expect(await callSetup(page, 'setup.Styles.isDarkRoom("OwaissaKitchen")')).toBe(true);

    await page.evaluate((l) => SugarCube.setup.Rooms.setBackground('kitchen', l), LIT);
    expect(await callSetup(page, 'setup.Styles.isDarkRoom("OwaissaKitchen")')).toBe(false);

    expect(await callSetup(page, 'setup.Styles.isDarkRoom("NotARoom")')).toBe(false);
  });

  test('classesFor pairs the add/remove class names per state', async ({ game: page }) => {
    const LIT = await callSetup(page, 'setup.RoomLight.LIT');
    const DARK = await callSetup(page, 'setup.RoomLight.DARK');

    await page.evaluate((l) => SugarCube.setup.Rooms.setBackground('kitchen', l), LIT);
    let cls = await callSetup(page, 'setup.Styles.classesFor("OwaissaKitchen")');
    expect(cls).toEqual({ add: 'owaissaKitchenLight', remove: 'owaissaKitchenDark' });

    await page.evaluate((d) => SugarCube.setup.Rooms.setBackground('kitchen', d), DARK);
    cls = await callSetup(page, 'setup.Styles.classesFor("OwaissaKitchen")');
    expect(cls).toEqual({ add: 'owaissaKitchenDark', remove: 'owaissaKitchenLight' });

    expect(await callSetup(page, 'setup.Styles.classesFor("NotARoom")')).toBeNull();
  });

  // --- Hunt-room backgrounds ------------------------------------

  test('bgUrlForTemplate returns light/dark variants for the hunt catalogue', async ({ game: page }) => {
    for (const id of ['hallway', 'attic', 'sauna', 'dining-room',
                      'sex-dungeon', 'walk-in-closet']) {
      const lit  = await callSetup(page, `setup.Styles.bgUrlForTemplate("${id}")`);
      const dark = await callSetup(page, `setup.Styles.bgUrlForTemplate("${id}", true)`);
      expect(lit, `template ${id} light`).toBeTruthy();
      expect(dark, `template ${id} dark`).toBeTruthy();
      expect(lit).not.toBe(dark);
    }
  });

  test('bgUrlForTemplate returns null for an unknown template id', async ({ game: page }) => {
    expect(await callSetup(page, 'setup.Styles.bgUrlForTemplate("ballroom")')).toBeNull();
    expect(await callSetup(page, 'setup.Styles.bgUrlForTemplate("ballroom", true)')).toBeNull();
  });

  // --- bodyBackgroundCss -----------------------------------------

  test('bodyBackgroundCss inlines the URL into a body { background-image } block', async ({ game: page }) => {
    const css = await callSetup(page, 'setup.Styles.bodyBackgroundCss("/img/foo.jpg")');
    expect(css).toContain("body {");
    expect(css).toContain("background-image: url('/img/foo.jpg')");
    expect(css).toContain('background-size: cover');
    expect(css).toContain('height: 100vh');
  });

  // --- turnOffLightHere ------------------------------------------

  test('turnOffLightHere flips a lit room to DARK and returns the passage name', async ({ game: page }) => {
    const LIT = await callSetup(page, 'setup.RoomLight.LIT');
    const DARK = await callSetup(page, 'setup.RoomLight.DARK');
    await goToPassage(page, 'OwaissaKitchen');
    await page.evaluate((l) => SugarCube.setup.Rooms.setBackground('kitchen', l), LIT);
    const result = await callSetup(page, 'setup.Styles.turnOffLightHere()');
    expect(result).toBe('OwaissaKitchen');
    expect(await page.evaluate(() =>
      SugarCube.setup.Rooms.byId('kitchen').background)).toBe(DARK);
  });

  test('turnOffLightHere returns null when room is already DARK', async ({ game: page }) => {
    const DARK = await callSetup(page, 'setup.RoomLight.DARK');
    await goToPassage(page, 'OwaissaKitchen');
    await page.evaluate((d) => SugarCube.setup.Rooms.setBackground('kitchen', d), DARK);
    expect(await callSetup(page, 'setup.Styles.turnOffLightHere()')).toBeNull();
  });

  test('turnOffLightHere returns null when current passage is not a known room', async ({ game: page }) => {
    await goToPassage(page, 'Start');
    expect(await callSetup(page, 'setup.Styles.turnOffLightHere()')).toBeNull();
  });
});

test.describe('GuiController (setup.Gui)', () => {

  // --- Tool timer scaling ----------------------------------------

  test('refreshToolTimer maps each MC level to the documented duration', async ({ game: page }) => {
    const expected = {
      0: '1s', 1: '900ms', 2: '800ms', 3: '650ms',
      4: '500ms', 5: '350ms', 6: '200ms'
    };
    for (const lvl of Object.keys(expected)) {
      await page.evaluate((n) => SugarCube.setup.Mc.setLvl(n), Number(lvl));
      await page.evaluate(() => SugarCube.setup.Gui.refreshToolTimer());
      expect(await page.evaluate(() => SugarCube.State.variables.timerToolsDecreased))
        .toBe(expected[lvl]);
    }
  });

  test('refreshToolTimer falls back to 150ms above the documented levels', async ({ game: page }) => {
    await page.evaluate(() => SugarCube.setup.Mc.setLvl(99));
    await page.evaluate(() => SugarCube.setup.Gui.refreshToolTimer());
    expect(await page.evaluate(() => SugarCube.State.variables.timerToolsDecreased))
      .toBe('150ms');
  });

  test('refreshToolTimer honours the fastToolTimers cheat override', async ({ game: page }) => {
    await page.evaluate(() => { SugarCube.settings.fastToolTimers = true; });
    try {
      await page.evaluate(() => SugarCube.setup.Mc.setLvl(3));
      await page.evaluate(() => SugarCube.setup.Gui.refreshToolTimer());
      expect(await page.evaluate(() => SugarCube.State.variables.timerToolsDecreased))
        .toBe('10ms');
    } finally {
      await page.evaluate(() => { SugarCube.settings.fastToolTimers = false; });
    }
  });

  test('timerToolsInitialized reflects whether refreshToolTimer ran', async ({ game: page }) => {
    await page.evaluate(() => { delete SugarCube.State.variables.timerToolsDecreased; });
    expect(await callSetup(page, 'setup.Gui.timerToolsInitialized()')).toBe(false);
    await page.evaluate(() => SugarCube.setup.Gui.refreshToolTimer());
    expect(await callSetup(page, 'setup.Gui.timerToolsInitialized()')).toBe(true);
  });

  // --- Guide return passage --------------------------------------

  test('setGuideReturnPassage round-trips through guideReturnPassage', async ({ game: page }) => {
    await page.evaluate(() => SugarCube.setup.Gui.setGuideReturnPassage('OwaissaKitchen'));
    expect(await callSetup(page, 'setup.Gui.guideReturnPassage()')).toBe('OwaissaKitchen');
    await page.evaluate(() => SugarCube.setup.Gui.setGuideReturnPassage('Home'));
    expect(await callSetup(page, 'setup.Gui.guideReturnPassage()')).toBe('Home');
  });

  // --- Mirror makeup ---------------------------------------------

  test('mirrorMakeupImagePath returns the variant path for stages 1-3 and the default for 0', async ({ game: page }) => {
    await page.evaluate(() => SugarCube.setup.Mc.setMakeupImg(0));
    expect(await callSetup(page, 'setup.Gui.mirrorMakeupImagePath()'))
      .toBe('ui/img/mc.jpg');
    expect(await callSetup(page, 'setup.Gui.mirrorMakeupHasWidth()')).toBe(false);

    for (const m of [1, 2, 3]) {
      await page.evaluate((s) => SugarCube.setup.Mc.setMakeupImg(s), m);
      expect(await callSetup(page, 'setup.Gui.mirrorMakeupImagePath()'))
        .toBe(`ui/img/makeup${m}.jpg`);
      expect(await callSetup(page, 'setup.Gui.mirrorMakeupHasWidth()')).toBe(true);
    }
  });

  // --- City night overlay ----------------------------------------

  test('isCityNightOverlayActive is true at night and false during the day', async ({ game: page }) => {
    for (const h of [22, 23, 0, 5]) {
      await setVar(page, 'hours', h);
      expect(await callSetup(page, 'setup.Gui.isCityNightOverlayActive()'))
        .toBe(true);
    }
    for (const h of [6, 12, 17, 21]) {
      await setVar(page, 'hours', h);
      expect(await callSetup(page, 'setup.Gui.isCityNightOverlayActive()'))
        .toBe(false);
    }
  });

  // --- Phone contacts ---------------------------------------------

  test('phoneContacts returns slots for brook, alice and blake in stable order', async ({ game: page }) => {
    const slots = await page.evaluate(() => {
      // Strip the function fields so they survive page.evaluate's
      // structured clone; the predicate behaviour is exercised in the
      // dedicated tests below.
      return SugarCube.setup.Gui.phoneContacts().map(c => ({
        key: c.key,
        stateKey: c.stateKey,
        portrait: c.portrait,
        infoPassage: c.infoPassage
      }));
    });
    expect(slots.map(s => s.key)).toEqual(['brook', 'alice', 'blake']);
    expect(slots[0].infoPassage).toBe('BrookInfo');
    expect(slots[1].infoPassage).toBe('AliceInfo');
    expect(slots[2].infoPassage).toBe('BlakeInfo');
    slots.forEach(s => expect(s.portrait).toMatch(/\.png$/));
  });

  test('phoneContacts: brook isUnlocked flips when meetBrook is set', async ({ game: page }) => {
    await page.evaluate(() => { delete SugarCube.State.variables.meetBrook; });
    expect(await page.evaluate(
      () => SugarCube.setup.Gui.phoneContacts()[0].isUnlocked()
    )).toBe(false);
    await setVar(page, 'meetBrook', 1);
    expect(await page.evaluate(
      () => SugarCube.setup.Gui.phoneContacts()[0].isUnlocked()
    )).toBe(true);
  });

  test('phoneContacts: blake isUnlocked requires relationship >= 5', async ({ game: page }) => {
    await page.evaluate(() => SugarCube.setup.Mall.setBlakeRelationship(4));
    expect(await page.evaluate(
      () => SugarCube.setup.Gui.phoneContacts()[2].isUnlocked()
    )).toBe(false);
    await page.evaluate(() => SugarCube.setup.Mall.setBlakeRelationship(5));
    expect(await page.evaluate(
      () => SugarCube.setup.Gui.phoneContacts()[2].isUnlocked()
    )).toBe(true);
    await page.evaluate(() => SugarCube.setup.Mall.setBlakeRelationship(99));
    expect(await page.evaluate(
      () => SugarCube.setup.Gui.phoneContacts()[2].isUnlocked()
    )).toBe(true);
  });

  // --- useBackInsteadOfReturn ------------------------------------

  test('useBackInsteadOfReturn is false at game start (no previous passage)', async ({ game: page }) => {
    await goToPassage(page, 'Start');
    expect(await callSetup(page, 'setup.Gui.useBackInsteadOfReturn()')).toBe(false);
  });

  test('useBackInsteadOfReturn is false when the previous passage is untagged', async ({ game: page }) => {
    await goToPassage(page, 'Start');
    await goToPassage(page, 'Home');
    expect(await callSetup(page, 'setup.Gui.useBackInsteadOfReturn()')).toBe(false);
  });

  // --- monkeyPawWishInput ----------------------------------------

  test('monkeyPawWishInput round-trips through $inputWish', async ({ game: page }) => {
    await setVar(page, 'inputWish', 'I wish for ectoplasm.');
    expect(await callSetup(page, 'setup.Gui.monkeyPawWishInput()'))
      .toBe('I wish for ectoplasm.');
  });
});
