const { test, expect } = require('../fixtures');
const { setVar, getVar, setHuntMode, getHuntMode, goToPassage } = require('../helpers');
const { expectCleanPassage, setupHunt } = require('./e2e-helpers');

const ROOMS = [
  'ElmHallway',
  'ElmHallwayUpstairs',
  'ElmKitchen',
  'ElmBathroom',
  'ElmBathroomTwo',
  'ElmBedroom',
  'ElmBedroomTwo',
  'ElmNursery',
  'ElmBasement',
];

async function clickPassageLink(page, linkText, expectedPassage) {
  await page.locator('.passage').getByText(linkText, { exact: true }).first().click();
  await page.waitForFunction(p => SugarCube.State.passage === p, expectedPassage);
}

test.describe('Haunted house — Elm', () => {
  test.describe.configure({ retries: 1 });
  test('Elm Street renders with a Go inside link when no companion is set', async ({ game: page }) => {
    await setVar(page, 'hauntedHouse', 'elm');
    await setHuntMode(page, 1);
    await goToPassage(page, 'Elm Street');
    await expectCleanPassage(page);
    await expect(page.locator('.passage').getByText('Go inside', { exact: true })).toBeVisible();
    expect(await page.locator('.passage').textContent()).toContain('Elm Street');
  });

  test('clicking Go inside enters ElmHallway and sets huntingMode to 2', async ({ game: page }) => {
    test.setTimeout(10_000);
    await setupHunt(page, 'Spirit', 'elm');
    await setHuntMode(page, 1);
    await goToPassage(page, 'Elm Street');
    await clickPassageLink(page, 'Go inside', 'ElmHallway');
    expect(await getHuntMode(page)).toBe(2);
  });

  test('End the hunt link appears on street while inside hunt mode', async ({ game: page }) => {
    await setupHunt(page, 'Spirit', 'elm');
    await goToPassage(page, 'Elm Street');
    await expectCleanPassage(page);
    await expect(page.locator('.passage').getByText('End the hunt', { exact: true })).toBeVisible();
  });

  test('End the hunt from street sends player to HuntOverManual and sets mode 3', async ({ game: page }) => {
    test.setTimeout(10_000);
    await setupHunt(page, 'Spirit', 'elm');
    await setVar(page, 'isClothesStolen', 0);
    await goToPassage(page, 'Elm Street');
    await clickPassageLink(page, 'End the hunt', 'HuntOverManual');
    expect(await getHuntMode(page)).toBe(3);
  });

  for (const room of ROOMS) {
    test(`${room} renders cleanly during a hunt`, async ({ game: page }) => {
      await setupHunt(page, 'Spirit', 'elm');
      await goToPassage(page, room);
      await expectCleanPassage(page);
    });
  }

  test('ElmHallway exposes links to every downstairs room plus upstairs, basement, and leave', async ({ game: page }) => {
    await setupHunt(page, 'Spirit', 'elm');
    await goToPassage(page, 'ElmHallway');
    const hallway = page.locator('.passage');
    for (const label of ['bedroom', 'bathroom', 'kitchen', 'upstairs', 'basement', 'leave']) {
      await expect(hallway.getByText(label, { exact: true }), label).toBeVisible();
    }
  });

  test('ElmHallwayUpstairs exposes links to every upstairs room plus downstairs', async ({ game: page }) => {
    await setupHunt(page, 'Spirit', 'elm');
    await goToPassage(page, 'ElmHallwayUpstairs');
    const up = page.locator('.passage');
    for (const label of ['downstairs', 'bathroom', 'bedroom', 'nursery']) {
      await expect(up.getByText(label, { exact: true }), label).toBeVisible();
    }
  });

  test('Hallway downstairs navigation works for all three child rooms', async ({ game: page }) => {
    test.setTimeout(20_000);
    await setupHunt(page, 'Spirit', 'elm');

    const pairs = [
      ['bedroom', 'ElmBedroom'],
      ['bathroom', 'ElmBathroom'],
      ['kitchen', 'ElmKitchen'],
    ];
    for (const [label, target] of pairs) {
      await goToPassage(page, 'ElmHallway');
      await clickPassageLink(page, label, target);
      await expectCleanPassage(page);
      await clickPassageLink(page, 'hallway', 'ElmHallway');
    }
  });

  test('Hallway basement round-trip works', async ({ game: page }) => {
    test.setTimeout(10_000);
    await setupHunt(page, 'Spirit', 'elm');
    await goToPassage(page, 'ElmHallway');
    await clickPassageLink(page, 'basement', 'ElmBasement');
    await expectCleanPassage(page);
    await clickPassageLink(page, 'hallway', 'ElmHallway');
  });

  test('Hallway upstairs round-trip traverses upstairs rooms', async ({ game: page }) => {
    test.setTimeout(30_000);
    await setupHunt(page, 'Spirit', 'elm');
    await goToPassage(page, 'ElmHallway');
    await clickPassageLink(page, 'upstairs', 'ElmHallwayUpstairs');
    await expectCleanPassage(page);

    const pairs = [
      ['bathroom', 'ElmBathroomTwo'],
      ['bedroom', 'ElmBedroomTwo'],
      ['nursery', 'ElmNursery'],
    ];
    for (const [label, target] of pairs) {
      await goToPassage(page, 'ElmHallwayUpstairs');
      await clickPassageLink(page, label, target);
      await expectCleanPassage(page);
      await clickPassageLink(page, 'hallway', 'ElmHallwayUpstairs');
    }

    await clickPassageLink(page, 'downstairs', 'ElmHallway');
  });

  test('Hallway leave link returns to Elm Street', async ({ game: page }) => {
    test.setTimeout(10_000);
    await setupHunt(page, 'Spirit', 'elm');
    await goToPassage(page, 'ElmHallway');
    await clickPassageLink(page, 'leave', 'Elm Street');
    expect(await getHuntMode(page)).toBe(2);
  });

  test('ElmBedroom renders cleanly with cursedHuntActive = 1 (hide-spot branch)', async ({ game: page }) => {
    await setupHunt(page, 'Spirit', 'elm');
    await setVar(page, 'cursedHuntActive', 1);
    await goToPassage(page, 'ElmBedroom');
    await expectCleanPassage(page);
  });

  test('ElmNursery renders cleanly with cursedHuntActive = 1 (hide-spot branch)', async ({ game: page }) => {
    await setupHunt(page, 'Spirit', 'elm');
    await setVar(page, 'cursedHuntActive', 1);
    await goToPassage(page, 'ElmNursery');
    await expectCleanPassage(page);
  });

  test('Elm controller flag round-trips with setupHunt', async ({ game: page }) => {
    await setupHunt(page, 'Spirit', 'elm');
    expect(await page.evaluate(() => SugarCube.setup.HauntedHouses.isElm())).toBe(true);
    expect(await page.evaluate(() => SugarCube.setup.HauntedHouses.isOwaissa())).toBe(false);
    expect(await page.evaluate(() => SugarCube.setup.HauntedHouses.isIronclad())).toBe(false);
  });
});
