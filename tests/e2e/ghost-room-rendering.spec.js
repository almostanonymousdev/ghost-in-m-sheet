const { test, expect } = require('@playwright/test');
const { openGame, resetGame, setVar, goToPassage } = require('../helpers');
const { expectCleanPassage, setupHunt } = require('./e2e-helpers');

const ALL_GHOSTS = [
  'Spirit', 'Shade', 'Poltergeist', 'Phantom', 'Goryo', 'Demon',
  'Deogen', 'Jinn', 'Moroi', 'Myling', 'Oni', 'Mimic',
  'The Twins', 'Wraith', 'Mare', 'Cthulion', 'Banshee', 'Raiju',
];

const OWAISSA_ROOMS = [
  'OwaissaHallway', 'OwaissaKitchen', 'OwaissaBathroom',
  'OwaissaBedroom', 'OwaissaLivingroom',
];

test.describe('Ghost room rendering — all Owaissa rooms', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  for (const ghostName of ALL_GHOSTS) {
    test(`${ghostName}: all Owaissa rooms render without errors`, async () => {
      test.setTimeout(15_000);
      await setupHunt(page, ghostName);

      if (ghostName === 'Mimic') {
        await setVar(page, 'saveMimic', 1);
        await setVar(page, 'lastChangeIntervalMimic', ' ');
      }

      for (const room of OWAISSA_ROOMS) {
        await goToPassage(page, room);
        await expectCleanPassage(page);
      }
    });
  }

  test('OwaissaBedroom renders cleanly with $cursedHuntActive = 1 (hideSpot cursed branch)', async () => {
    await setupHunt(page, 'Spirit');
    await setVar(page, 'cursedHuntActive', 1);

    await goToPassage(page, 'OwaissaBedroom');
    await expectCleanPassage(page);
  });
});
