const { test, expect } = require('../fixtures');
const { setVar, goToPassage } = require('../helpers');
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
  for (const ghostName of ALL_GHOSTS) {
    test(`${ghostName}: all Owaissa rooms render without errors`, async ({ game: page }) => {
      test.setTimeout(15_000);
      await setupHunt(page, ghostName);

      if (ghostName === 'Mimic') {
        await setVar(page, 'lastChangeIntervalMimic', ' ');
      }

      for (const room of OWAISSA_ROOMS) {
        await goToPassage(page, room);
        await expectCleanPassage(page);
      }
    });
  }

  test('OwaissaBedroom renders cleanly with $cursedHuntActive = 1 (hideSpot cursed branch)', async ({ game: page }) => {
    await setupHunt(page, 'Spirit');
    await setVar(page, 'cursedHuntActive', 1);

    await goToPassage(page, 'OwaissaBedroom');
    await expectCleanPassage(page);
  });
});
