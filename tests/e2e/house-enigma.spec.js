const { test, expect } = require('@playwright/test');
const { openGame, resetGame, setVar, getVar, setHuntMode, getHuntMode, goToPassage } = require('../helpers');
const { expectCleanPassage, setupHunt } = require('./e2e-helpers');

const ROOMS = [
  'EnigmaHallway',
  'EnigmaLivingroom',
  'EnigmaKitchen',
  'EnigmaBathroom',
  'EnigmaBedroom',
  'EnigmaBasement',
  'EnigmaRoomA',
  'EnigmaRoomB',
  'EnigmaRoomC',
];

async function clickPassageLink(page, linkText, expectedPassage) {
  await page.locator('.passage').getByText(linkText, { exact: true }).first().click();
  await page.waitForFunction(p => SugarCube.State.passage === p, expectedPassage);
}

test.describe('Haunted house — Enigma', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  test('Enigma Street renders with a Go inside link (no companion branch in this street)', async () => {
    await setVar(page, 'hauntedHouse', 'enigma');
    await setHuntMode(page, 1);
    await goToPassage(page, 'Enigma Street');
    await expectCleanPassage(page);
    await expect(page.locator('.passage').getByText('Go inside', { exact: true })).toBeVisible();
    expect(await page.locator('.passage').textContent()).toContain('Enigma Street');
  });

  test('clicking Go inside enters EnigmaHallway and sets huntingMode to 2', async () => {
    test.setTimeout(10_000);
    await setupHunt(page, 'Spirit', 'enigma');
    await setHuntMode(page, 1);
    await goToPassage(page, 'Enigma Street');
    await clickPassageLink(page, 'Go inside', 'EnigmaHallway');
    expect(await getHuntMode(page)).toBe(2);
  });

  test('End the hunt link appears on street while inside hunt mode', async () => {
    await setupHunt(page, 'Spirit', 'enigma');
    await goToPassage(page, 'Enigma Street');
    await expectCleanPassage(page);
    await expect(page.locator('.passage').getByText('End the hunt', { exact: true })).toBeVisible();
  });

  test('End the hunt from street sends player to HuntOverManual and sets mode 3', async () => {
    test.setTimeout(10_000);
    await setupHunt(page, 'Spirit', 'enigma');
    await setVar(page, 'isClothesStolen', 0);
    await goToPassage(page, 'Enigma Street');
    await clickPassageLink(page, 'End the hunt', 'HuntOverManual');
    expect(await getHuntMode(page)).toBe(3);
  });

  for (const room of ROOMS) {
    test(`${room} renders cleanly during a hunt`, async () => {
      await setupHunt(page, 'Spirit', 'enigma');
      await goToPassage(page, room);
      await expectCleanPassage(page);
    });
  }

  test('EnigmaHallway exposes links to every adjacent room plus leave', async () => {
    await setupHunt(page, 'Spirit', 'enigma');
    await goToPassage(page, 'EnigmaHallway');
    const hallway = page.locator('.passage');
    for (const label of ['livingroom', 'bedroom', 'bathroom', 'kitchen', 'basement', 'leave']) {
      await expect(hallway.getByText(label, { exact: true }), label).toBeVisible();
    }
  });

  test('EnigmaBasement exposes links to every off-basement room plus hallway', async () => {
    await setupHunt(page, 'Spirit', 'enigma');
    await goToPassage(page, 'EnigmaBasement');
    const basement = page.locator('.passage');
    for (const label of ['hallway', 'room A', 'room B', 'room C']) {
      await expect(basement.getByText(label, { exact: true }), label).toBeVisible();
    }
  });

  test('Hallway navigates to each of its four child rooms and back', async () => {
    test.setTimeout(25_000);
    await setupHunt(page, 'Spirit', 'enigma');
    const pairs = [
      ['livingroom', 'EnigmaLivingroom'],
      ['bedroom', 'EnigmaBedroom'],
      ['bathroom', 'EnigmaBathroom'],
      ['kitchen', 'EnigmaKitchen'],
    ];
    for (const [label, target] of pairs) {
      await goToPassage(page, 'EnigmaHallway');
      await clickPassageLink(page, label, target);
      await expectCleanPassage(page);
      await clickPassageLink(page, 'hallway', 'EnigmaHallway');
    }
  });

  test('Hallway → Basement → RoomA/B/C → Basement round-trip', async () => {
    test.setTimeout(25_000);
    await setupHunt(page, 'Spirit', 'enigma');
    await goToPassage(page, 'EnigmaHallway');
    await clickPassageLink(page, 'basement', 'EnigmaBasement');
    await expectCleanPassage(page);

    const pairs = [
      ['room A', 'EnigmaRoomA'],
      ['room B', 'EnigmaRoomB'],
      ['room C', 'EnigmaRoomC'],
    ];
    for (const [label, target] of pairs) {
      await goToPassage(page, 'EnigmaBasement');
      await clickPassageLink(page, label, target);
      await expectCleanPassage(page);
      await clickPassageLink(page, 'basement', 'EnigmaBasement');
    }

    await clickPassageLink(page, 'hallway', 'EnigmaHallway');
  });

  test('Hallway leave link returns to Enigma Street', async () => {
    test.setTimeout(10_000);
    await setupHunt(page, 'Spirit', 'enigma');
    await goToPassage(page, 'EnigmaHallway');
    await clickPassageLink(page, 'leave', 'Enigma Street');
    expect(await getHuntMode(page)).toBe(2);
  });

  test('Enigma is flagged as the real house', async () => {
    // The Enigma house is the only one whose HOUSE_CONFIG entry has
    // isRealHouse: true. With $hauntedHouse === 'enigma' the controller's
    // isRealHouse() / isRealHouseActive() should both report true.
    await setupHunt(page, 'Spirit', 'enigma');
    expect(await page.evaluate(() => SugarCube.setup.HauntedHouses.isRealHouse())).toBe(true);
  });

  test('Enigma controller flag round-trips with setupHunt', async () => {
    await setupHunt(page, 'Spirit', 'enigma');
    expect(await page.evaluate(() => SugarCube.setup.HauntedHouses.isEnigma())).toBe(true);
    expect(await page.evaluate(() => SugarCube.setup.HauntedHouses.isOwaissa())).toBe(false);
    expect(await page.evaluate(() => SugarCube.setup.HauntedHouses.isElm())).toBe(false);
    expect(await page.evaluate(() => SugarCube.setup.HauntedHouses.isIronclad())).toBe(false);
  });
});
