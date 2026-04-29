const { test, expect } = require('@playwright/test');
const { openGame, resetGame, setVar, getVar, setHuntMode, getHuntMode, goToPassage } = require('../helpers');
const { expectCleanPassage, setupHunt } = require('./e2e-helpers');

const ROOMS = [
  'OwaissaHallway',
  'OwaissaKitchen',
  'OwaissaBathroom',
  'OwaissaBedroom',
  'OwaissaLivingroom',
];

/**
 * Click a link inside the rendered passage by its visible text and wait
 * until the engine settles on the expected passage.
 */
async function clickPassageLink(page, linkText, expectedPassage) {
  await page.locator('.passage').getByText(linkText, { exact: true }).first().click();
  await page.waitForFunction(p => SugarCube.State.passage === p, expectedPassage);
}

test.describe('Haunted house — Owaissa', () => {
  // Click-driven navigation tests hit 4-5 goToPassage / clickPassageLink calls
  // in sequence; a single slow navigation under parallel load can blow the
  // default 5s timeout. Single retry covers transient contention.
  test.describe.configure({ retries: 1 });

  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  test('Owaissa Street renders with a Go inside link when no companion is set', async () => {
    await setVar(page, 'hauntedHouse', 'owaissa');
    await setHuntMode(page, 1);

    await goToPassage(page, 'Owaissa Street');
    await expectCleanPassage(page);

    await expect(page.locator('.passage').getByText('Go inside', { exact: true })).toBeVisible();
    expect(await page.locator('.passage').textContent()).toContain('Owaissa Street');
  });

  test('clicking Go inside enters OwaissaHallway and sets huntingMode to 2', async () => {
    test.setTimeout(10_000);
    await setupHunt(page, 'Spirit', 'owaissa');
    await setHuntMode(page, 1);

    await goToPassage(page, 'Owaissa Street');
    await clickPassageLink(page, 'Go inside', 'OwaissaHallway');

    expect(await getHuntMode(page)).toBe(2);
  });

  test('End the hunt link appears on street while inside hunt mode', async () => {
    await setupHunt(page, 'Spirit', 'owaissa');
    await goToPassage(page, 'Owaissa Street');
    await expectCleanPassage(page);
    await expect(page.locator('.passage').getByText('End the hunt', { exact: true })).toBeVisible();
  });

  test('End the hunt from street sends player to HuntOverManual and sets mode 3', async () => {
    test.setTimeout(10_000);
    await setupHunt(page, 'Spirit', 'owaissa');
    await setVar(page, 'isClothesStolen', 0);
    await goToPassage(page, 'Owaissa Street');
    await clickPassageLink(page, 'End the hunt', 'HuntOverManual');
    expect(await getHuntMode(page)).toBe(3);
  });

  for (const room of ROOMS) {
    test(`${room} renders cleanly during a hunt`, async () => {
      await setupHunt(page, 'Spirit', 'owaissa');
      await goToPassage(page, room);
      await expectCleanPassage(page);
    });
  }

  test('OwaissaHallway exposes links to every adjacent Owaissa room', async () => {
    await setupHunt(page, 'Spirit', 'owaissa');
    await goToPassage(page, 'OwaissaHallway');
    const hallway = page.locator('.passage');
    await expect(hallway.getByText('Kitchen', { exact: true })).toBeVisible();
    await expect(hallway.getByText('Bedroom', { exact: true })).toBeVisible();
    await expect(hallway.getByText('Bathroom', { exact: true })).toBeVisible();
    await expect(hallway.getByText('Outside', { exact: true })).toBeVisible();
  });

  test('Hallway → Kitchen → Livingroom → Kitchen → Hallway navigates without errors', async () => {
    test.setTimeout(15_000);
    await setupHunt(page, 'Spirit', 'owaissa');
    await goToPassage(page, 'OwaissaHallway');
    await expectCleanPassage(page);

    await clickPassageLink(page, 'Kitchen', 'OwaissaKitchen');
    await expectCleanPassage(page);

    await clickPassageLink(page, 'Livingroom', 'OwaissaLivingroom');
    await expectCleanPassage(page);

    await clickPassageLink(page, 'Kitchen', 'OwaissaKitchen');
    await clickPassageLink(page, 'Hallway', 'OwaissaHallway');
    await expectCleanPassage(page);
  });

  test('Hallway → Bedroom → Hallway round-trip works', async () => {
    test.setTimeout(10_000);
    await setupHunt(page, 'Spirit', 'owaissa');
    await goToPassage(page, 'OwaissaHallway');
    await clickPassageLink(page, 'Bedroom', 'OwaissaBedroom');
    await expectCleanPassage(page);
    await clickPassageLink(page, 'Hallway', 'OwaissaHallway');
  });

  test('Hallway → Bathroom → Hallway round-trip works', async () => {
    test.setTimeout(10_000);
    await setupHunt(page, 'Spirit', 'owaissa');
    await goToPassage(page, 'OwaissaHallway');
    await clickPassageLink(page, 'Bathroom', 'OwaissaBathroom');
    await expectCleanPassage(page);
    await clickPassageLink(page, 'Hallway', 'OwaissaHallway');
  });

  test('Hallway Outside link returns to Owaissa Street', async () => {
    test.setTimeout(10_000);
    await setupHunt(page, 'Spirit', 'owaissa');
    await goToPassage(page, 'OwaissaHallway');
    await clickPassageLink(page, 'Outside', 'Owaissa Street');
    expect(await getHuntMode(page)).toBe(2);
  });

  test('OwaissaBedroom renders cleanly when cursedHuntActive is 1 (hide-spot branch)', async () => {
    await setupHunt(page, 'Spirit', 'owaissa');
    await setVar(page, 'cursedHuntActive', 1);
    await goToPassage(page, 'OwaissaBedroom');
    await expectCleanPassage(page);
  });

  test('Owaissa controller flag round-trips with setupHunt', async () => {
    await setupHunt(page, 'Spirit', 'owaissa');
    expect(await page.evaluate(() => SugarCube.setup.HauntedHouses.isOwaissa())).toBe(true);
    expect(await page.evaluate(() => SugarCube.setup.HauntedHouses.isElm())).toBe(false);
    expect(await page.evaluate(() => SugarCube.setup.HauntedHouses.isEnigma())).toBe(false);
    expect(await page.evaluate(() => SugarCube.setup.HauntedHouses.isIronclad())).toBe(false);
  });
});
