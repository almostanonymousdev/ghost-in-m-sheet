/*
 * Narrative test for the possession plotline.
 *
 * Once the MC is "possessed" (by a tarot card, a Mare summon, or a
 * Rescue scene), the runtime lands the player on CityMapPossessed. The
 * player then picks a location, which routes through PossessedLocation
 * -> PossessedLocation1 -> PossessedLocation2 / Possessed. Each
 * resistance step gates on `setup.Mc.possession()` thresholds so the
 * arc has multiple shapes; this spec walks the whole tree.
 *
 * Brooke's separate "go find Brooke" path (PossessedBrooke) and Blake's
 * spirit-event back-half (spiritBlake) are exercised at the end.
 */

const { test, expect } = require('../fixtures');
const { setVar, getVar, goToPassage, seedRandom } = require('../helpers');
const { expectCleanPassage } = require('../e2e/e2e-helpers');

/* Stamp possession state and a location choice. Each subsequent click
   resolves against `setup.Posession.locationChoice()`, so the test must
   pick the variant before entering PossessedLocation. */
async function primePossession(game, location, possessionMeter) {
  await game.evaluate(() => {
    SugarCube.setup.Mc.ensurePossession();
  });
  await setVar(game, 'mcpossession', possessionMeter);
  await game.evaluate((loc) => {
    SugarCube.setup.Posession.setLocationChoice(loc);
  }, location);
}

/* CityMapPossessed needs a sane hour for the city overlay to render. */
async function primeCityMap(game) {
  await setVar(game, 'hours', 14);
  await setVar(game, 'minutes', 0);
}

/* Stamp the Brooke-rescue context. With pepper spray, the page renders
   the church-route link; without it, the player has to ride the black-
   out scene. */
async function primeBrooke(game, { withPepperSpray, analSensitivity }) {
  /* setup.Mall.hasPepperSprayCharges() requires BOTH the bought flag
     ($hasPSpray === 1) AND a non-zero charge count ($hasPSprayCharges). */
  await game.evaluate((withSpray) => {
    const V = SugarCube.State.variables;
    if (withSpray) {
      V.hasPSpray = 1;
      V.hasPSprayCharges = 3;
    } else {
      V.hasPSpray = 0;
      V.hasPSprayCharges = 0;
    }
  }, withPepperSpray);
  await game.evaluate(() => {
    SugarCube.setup.Home.markBrookePossessedActive();
  });
  if (analSensitivity !== undefined) {
    await game.evaluate((n) => {
      const V = SugarCube.State.variables;
      if (!V.sensualBodyPart) V.sensualBodyPart = {};
      V.sensualBodyPart.anal = n;
    }, analSensitivity);
  }
}

test.describe('Possession narrative', () => {

  test.describe('Phase 0: entry routes', () => {

    test('Phase 0a: CityMapPossessed renders the location choices', async ({ game }) => {
      await setVar(game, 'mc.fit', 50);
      await primeCityMap(game);
      await setVar(game, 'mcpossession', 5);
      await goToPassage(game, 'CityMapPossessed');
      await expectCleanPassage(game);

      const bodyText = await game.locator('.passage').textContent();
      expect(bodyText).toMatch(/Gym/);
      expect(bodyText).toMatch(/Home/);
      expect(bodyText).toMatch(/Library/);
      expect(bodyText).toMatch(/Park/);
    });

    test('Phase 0b: gym is gated by fit lvl 30+', async ({ game }) => {
      await setVar(game, 'mc.fit', 5);
      await primeCityMap(game);
      await goToPassage(game, 'CityMapPossessed');
      const bodyText = await game.locator('.passage').textContent();
      expect(bodyText).toMatch(/Req\.\s*fit lvl 30\+/);
    });

    test('Phase 0c: church requires possession meter >= 5', async ({ game }) => {
      await setVar(game, 'mc.fit', 50);
      await primeCityMap(game);
      await game.evaluate(() => SugarCube.setup.Mc.ensurePossession());
      await setVar(game, 'mcpossession', 0);
      await goToPassage(game, 'CityMapPossessed');
      let bodyText = await game.locator('.passage').textContent();
      expect(bodyText).toMatch(/Possession 5\+/);

      await setVar(game, 'mcpossession', 5);
      await goToPassage(game, 'CityMapPossessed');
      const churchLink = game.locator('a:has-text("Church")');
      await expect(churchLink).toBeVisible();
    });
  });

  test.describe('Phase 1: library variant', () => {

    test('Phase 1a: low meter (<4) surrenders on first resist', async ({ game }) => {
      await primePossession(game, 'library', 0);
      await goToPassage(game, 'PossessedLocation');
      await expectCleanPassage(game);

      await game.locator('a:has-text("What\'s happening?")').click();
      await game.locator('a:has-text("Try to resist")').click();
      const bodyText = await game.locator('.passage').textContent();
      // breakFreePossession 3 -> "[[Next|Possessed]]"
      expect(bodyText).toMatch(/Next/);
    });

    test('Phase 1b: meter >= 4 but < 7 surrenders on second resist', async ({ game }) => {
      await primePossession(game, 'library', 4);
      await goToPassage(game, 'PossessedLocation');

      await game.locator('a:has-text("What\'s happening?")').click();
      await game.locator('a:has-text("Try to resist")').click();
      await game.locator('a:has-text("Try to resist again")').click();
      const bodyText = await game.locator('.passage').textContent();
      expect(bodyText).toMatch(/Next/);
    });

    test('Phase 1c: meter >= 7 reaches PossessedLocation1', async ({ game }) => {
      await primePossession(game, 'library', 8);
      await goToPassage(game, 'PossessedLocation');

      await game.locator('a:has-text("What\'s happening?")').click();
      await game.locator('a:has-text("Try to resist")').click();
      await game.locator('a:has-text("Try to resist again")').click();

      await game.waitForFunction(
        () => SugarCube.State.passage === 'PossessedLocation1',
        null,
        { timeout: 5000 }
      );
    });

    test('Phase 1d: PossessedLocation1 (meter < 11) escapes to Possessed', async ({ game }) => {
      await primePossession(game, 'library', 8);
      await goToPassage(game, 'PossessedLocation1');
      await expectCleanPassage(game);

      await game.locator('a:has-text("this had to happen")').click();
      const bodyText = await game.locator('.passage').textContent();
      // canResistFinalAttempt is false -> "regain control" prose + Next link.
      expect(bodyText).toMatch(/regain control of yourself/);
    });

    test('Phase 1e: PossessedLocation1 (meter >= 11) chains to PossessedLocation2', async ({ game }) => {
      await primePossession(game, 'library', 12);
      await goToPassage(game, 'PossessedLocation1');

      await game.locator('a:has-text("this had to happen")').click();
      await game.locator('a:has-text("dragged you along")').click();
      const cumLink = game.locator('a:has-text("cumming")').first();
      await expect(cumLink).toBeVisible();
    });

    test('Phase 1f: PossessedLocation2 routes back to Possessed', async ({ game }) => {
      await primePossession(game, 'library', 12);
      await goToPassage(game, 'PossessedLocation2');
      await expectCleanPassage(game);

      const nextLink = game.locator('a:has-text("Next")').first();
      await expect(nextLink).toBeVisible();
    });
  });

  test.describe('Phase 2: home variant', () => {

    test('Phase 2a: low meter surrenders on first resist', async ({ game }) => {
      await primePossession(game, 'home', 0);
      await goToPassage(game, 'PossessedLocation');
      await expectCleanPassage(game);

      await game.locator('a:has-text("Try to resist")').click();
      const bodyText = await game.locator('.passage').textContent();
      expect(bodyText).toMatch(/Next/);
    });

    test('Phase 2b: meter >= 7 reaches PossessedLocation1', async ({ game }) => {
      await primePossession(game, 'home', 8);
      await goToPassage(game, 'PossessedLocation');

      await game.locator('a:has-text("Try to resist")').click();
      await game.locator('a:has-text("Try to resist again")').click();

      await game.waitForFunction(
        () => SugarCube.State.passage === 'PossessedLocation1',
        null,
        { timeout: 5000 }
      );
    });
  });

  test.describe('Phase 3: gym variant', () => {

    test('Phase 3a: meter >= 7 reaches PossessedLocation1', async ({ game }) => {
      await primePossession(game, 'gym', 8);
      await goToPassage(game, 'PossessedLocation');

      await game.locator('a:has-text("What\'s happening?")').click();
      await game.locator('a:has-text("Try to resist")').click();
      await game.locator('a:has-text("Try to resist again")').click();

      await game.waitForFunction(
        () => SugarCube.State.passage === 'PossessedLocation1',
        null,
        { timeout: 5000 }
      );
    });

    test('Phase 3b: PossessedLocation1 gym (meter < 11) escapes', async ({ game }) => {
      await primePossession(game, 'gym', 8);
      await goToPassage(game, 'PossessedLocation1');
      await expectCleanPassage(game);

      await game.locator('a:has-text("Try to resist again")').click();
      const bodyText = await game.locator('.passage').textContent();
      expect(bodyText).toMatch(/regain control of yourself/);
    });
  });

  test.describe('Phase 4: park variant', () => {

    test('Phase 4a: meter >= 4 reaches PossessedLocation1 directly', async ({ game }) => {
      await primePossession(game, 'park', 5);
      await goToPassage(game, 'PossessedLocation');
      await expectCleanPassage(game);

      await game.locator('a:has-text("hell am I?")').click();
      await game.locator('a:has-text("Try to resist")').click();

      await game.waitForFunction(
        () => SugarCube.State.passage === 'PossessedLocation1',
        null,
        { timeout: 5000 }
      );
    });

    test('Phase 4b: PossessedLocation1 park (meter < 7) escapes', async ({ game }) => {
      await primePossession(game, 'park', 4);
      await goToPassage(game, 'PossessedLocation1');
      await expectCleanPassage(game);

      await game.locator('a:has-text("Try to resist again")').click();
      const bodyText = await game.locator('.passage').textContent();
      expect(bodyText).toMatch(/break free/);
    });
  });

  test.describe('Phase 5: church variant', () => {

    test('Phase 5a: low meter renders escape prose', async ({ game }) => {
      await primePossession(game, 'church', 5);
      await goToPassage(game, 'PossessedLocation');
      await expectCleanPassage(game);

      await game.locator('a:has-text("get rid of the possession")').click();
      const bodyText = await game.locator('.passage').textContent();
      expect(bodyText).toMatch(/almost over|commiiiing/);
    });

    test('Phase 5b: meter >= 11 renders inner climax prose', async ({ game }) => {
      await primePossession(game, 'church', 12);
      await goToPassage(game, 'PossessedLocation');

      await game.locator('a:has-text("get rid of the possession")').click();
      const bodyText = await game.locator('.passage').textContent();
      expect(bodyText).toMatch(/commiiiing/);
    });

    test('Phase 5c: PossessedLocation1 church loops to Possessed', async ({ game }) => {
      await primePossession(game, 'church', 12);
      await goToPassage(game, 'PossessedLocation1');
      await expectCleanPassage(game);

      const bodyText = await game.locator('.passage').textContent();
      expect(bodyText).toMatch(/again and again/);
    });
  });

  test.describe('Phase 6: Possessed (nun exorcism) wrap-up', () => {

    test('Phase 6a: Possessed entry link is clickable', async ({ game }) => {
      await primePossession(game, 'library', 5);
      await seedRandom(game, 1);
      await goToPassage(game, 'Possessed');
      await expectCleanPassage(game);

      const link = game.locator('a:has-text("vanishing as if it never existed")');
      await expect(link).toBeVisible();
    });

    test('Phase 6b: full chain renders the Go home link', async ({ game }) => {
      await primePossession(game, 'library', 5);
      await seedRandom(game, 1);
      await goToPassage(game, 'Possessed');

      await game.locator('a:has-text("vanishing as if it never existed")').click();
      await game.locator('a:has-text("take other measures")').click();
      await game.locator('a:has-text("I\'ll save you, my child")').click();
      await game.locator('a:has-text("Some time later")').click();

      const goHome = game.locator('a:has-text("Go home")');
      await expect(goHome).toBeVisible();
    });
  });

  test.describe('Phase 7: PossessedBrooke rescue branch', () => {

    test('Phase 7a: with pepper spray, the church link renders', async ({ game }) => {
      await primeBrooke(game, { withPepperSpray: true });
      await seedRandom(game, 1);
      await goToPassage(game, 'PossessedBrooke');
      await expectCleanPassage(game);

      const churchLink = game.locator('a:has-text("the church")');
      await expect(churchLink).toBeVisible();
    });

    test('Phase 7b: without pepper spray, black-out chain reaches home link', async ({ game }) => {
      await primeBrooke(game, { withPepperSpray: false, analSensitivity: 5 });
      await seedRandom(game, 1);
      await goToPassage(game, 'PossessedBrooke');
      await expectCleanPassage(game);

      await game.locator('a:has-text("black out")').click();
      await game.locator('a:has-text("hole")').click();

      const homeLink = game.locator('a:has-text("home")').first();
      await expect(homeLink).toBeVisible();
    });

    test('Phase 7c: untrained anal sets the penalty flag', async ({ game }) => {
      await primeBrooke(game, { withPepperSpray: false, analSensitivity: 0 });
      await game.evaluate(() => SugarCube.setup.Mc.clearPenalty());
      await seedRandom(game, 1);
      await goToPassage(game, 'PossessedBrooke');

      await game.locator('a:has-text("black out")').click();
      await game.locator('a:has-text("hole")').click();

      const penalized = await getVar(game, 'isPenaltyOn');
      expect(penalized).toBe(true);
    });
  });

  test.describe('Phase 8: spiritBlake (Blake spirit-event back-half)', () => {

    test('Phase 8a: spiritBlake renders the closing linkappend chain', async ({ game }) => {
      /* setup.Companion.activeState() resolves through
         $companion -> $brook/$alice/$blake; stamp both the marker and
         the per-companion stat object so name() returns "Blake". */
      await game.evaluate(() => {
        const V = SugarCube.State.variables;
        V.companion = { name: 'Blake' };
        if (!V.blake) V.blake = SugarCube.setup.Companion.defaultStateFor('Blake');
      });
      await goToPassage(game, 'spiritBlake');
      await expectCleanPassage(game);

      const link = game.locator('a:has-text("came right inside you.")');
      await expect(link).toBeVisible();

      await link.click();
      const sleepLink = game.locator('a:has-text("Sleep")');
      await expect(sleepLink).toBeVisible();
    });
  });

  test.describe('Phase 9: meter mechanics', () => {

    test('Phase 9a: raiseMeter increments mcpossession below cap', async ({ game }) => {
      await game.evaluate(() => SugarCube.setup.Mc.ensurePossession());
      await setVar(game, 'mcpossession', 0);

      const ok = await game.evaluate(() => SugarCube.setup.Posession.raiseMeter(5));
      expect(ok).toBe(true);
      expect(await getVar(game, 'mcpossession')).toBe(1);
    });

    test('Phase 9b: raiseMeter is a no-op when meter > cap', async ({ game }) => {
      await game.evaluate(() => SugarCube.setup.Mc.ensurePossession());
      await setVar(game, 'mcpossession', 6);

      const ok = await game.evaluate(() => SugarCube.setup.Posession.raiseMeter(5));
      expect(ok).toBe(false);
      expect(await getVar(game, 'mcpossession')).toBe(6);
    });

    test('Phase 9c: meterAtLeast respects the threshold', async ({ game }) => {
      await game.evaluate(() => SugarCube.setup.Mc.ensurePossession());
      await setVar(game, 'mcpossession', 5);

      expect(await game.evaluate(() => SugarCube.setup.Posession.meterAtLeast(5))).toBe(true);
      expect(await game.evaluate(() => SugarCube.setup.Posession.meterAtLeast(6))).toBe(false);
    });
  });
});
