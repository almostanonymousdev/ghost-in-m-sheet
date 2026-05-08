const { test, expect } = require('../fixtures');
const { setVar, callSetup, goToPassage } = require('../helpers');
const { expectCleanPassage } = require('./e2e-helpers');

test.describe('Possession — controller thresholds', () => {
  test('canResistFirstAttempt requires $mcpossession >= 4', async ({ game: page }) => {
    await setVar(page, 'mcpossession', 3);
    expect(await callSetup(page, 'setup.Posession.canResistFirstAttempt()')).toBe(false);
    await setVar(page, 'mcpossession', 4);
    expect(await callSetup(page, 'setup.Posession.canResistFirstAttempt()')).toBe(true);
  });

  test('canResistSecondAttempt requires $mcpossession >= 7', async ({ game: page }) => {
    await setVar(page, 'mcpossession', 6);
    expect(await callSetup(page, 'setup.Posession.canResistSecondAttempt()')).toBe(false);
    await setVar(page, 'mcpossession', 7);
    expect(await callSetup(page, 'setup.Posession.canResistSecondAttempt()')).toBe(true);
  });

  test('canResistFinalAttempt requires $mcpossession >= 11', async ({ game: page }) => {
    await setVar(page, 'mcpossession', 10);
    expect(await callSetup(page, 'setup.Posession.canResistFinalAttempt()')).toBe(false);
    await setVar(page, 'mcpossession', 11);
    expect(await callSetup(page, 'setup.Posession.canResistFinalAttempt()')).toBe(true);
  });

  test('resistance tiers are monotonic', async ({ game: page }) => {
    await setVar(page, 'mcpossession', 11);
    expect(await callSetup(page, 'setup.Posession.canResistFirstAttempt()')).toBe(true);
    expect(await callSetup(page, 'setup.Posession.canResistSecondAttempt()')).toBe(true);
    expect(await callSetup(page, 'setup.Posession.canResistFinalAttempt()')).toBe(true);
  });
});

test.describe('Possession — Brooke rescue', () => {
  test('canPepperSprayBrookeAttacker requires spray owned with charges', async ({ game: page }) => {
    await setVar(page, 'hasPSpray', 0);
    await setVar(page, 'hasPSprayCharges', 3);
    expect(await callSetup(page, 'setup.Posession.canPepperSprayBrookeAttacker()')).toBe(false);
    await setVar(page, 'hasPSpray', 1);
    await setVar(page, 'hasPSprayCharges', 0);
    expect(await callSetup(page, 'setup.Posession.canPepperSprayBrookeAttacker()')).toBe(false);
    await setVar(page, 'hasPSpray', 1);
    await setVar(page, 'hasPSprayCharges', 1);
    expect(await callSetup(page, 'setup.Posession.canPepperSprayBrookeAttacker()')).toBe(true);
  });

  test('analIsTrained and analIsVeryLoose reflect $sensualBodyPart.anal', async ({ game: page }) => {
    await setVar(page, 'sensualBodyPart', { anal: 2 });
    expect(await callSetup(page, 'setup.Posession.analIsTrained()')).toBe(false);
    expect(await callSetup(page, 'setup.Posession.analIsVeryLoose()')).toBe(false);
    await setVar(page, 'sensualBodyPart', { anal: 3 });
    expect(await callSetup(page, 'setup.Posession.analIsTrained()')).toBe(true);
    await setVar(page, 'sensualBodyPart', { anal: 5 });
    expect(await callSetup(page, 'setup.Posession.analIsVeryLoose()')).toBe(true);
  });

  test('PossessedBrooke renders cleanly when player can pepper spray', async ({ game: page }) => {
    await setVar(page, 'hasPSpray', 1);
    await setVar(page, 'hasPSprayCharges', 1);
    await goToPassage(page, 'PossessedBrooke');
    await expectCleanPassage(page);
  });

  test('PossessedBrooke renders cleanly when player has no defense', async ({ game: page }) => {
    await setVar(page, 'hasPSpray', 0);
    await setVar(page, 'hasPSprayCharges', 0);
    await setVar(page, 'sensualBodyPart', { anal: 3 });
    await goToPassage(page, 'PossessedBrooke');
    await expectCleanPassage(page);
  });

  test('PossessedBrookeChurch passage renders cleanly', async ({ game: page }) => {
    await goToPassage(page, 'PossessedBrookeChurch');
    await expectCleanPassage(page);
  });
});

test.describe('Possession — hunt cleanup', () => {
  test('isBlakeHuntWithCursedItem requires Blake + chosen + cursed item', async ({ game: page }) => {
    await setVar(page, 'isCompChosen', 0);
    await setVar(page, 'companion', { name: 'Blake' });
    await setVar(page, 'gotCursedItem', 1);
    expect(await callSetup(page, 'setup.Posession.isBlakeHuntWithCursedItem()')).toBe(false);

    await setVar(page, 'isCompChosen', 1);
    expect(await callSetup(page, 'setup.Posession.isBlakeHuntWithCursedItem()')).toBe(true);

    await setVar(page, 'gotCursedItem', 0);
    expect(await callSetup(page, 'setup.Posession.isBlakeHuntWithCursedItem()')).toBe(false);

    await setVar(page, 'gotCursedItem', 1);
    await setVar(page, 'companion', { name: 'Alice' });
    expect(await callSetup(page, 'setup.Posession.isBlakeHuntWithCursedItem()')).toBe(false);
  });
});

test.describe('Possession — location-based event passages', () => {
  test.describe.configure({ timeout: 10_000, retries: 1 });
  const LOCATIONS = ['library', 'home', 'gym', 'church', 'park'];

  for (const loc of LOCATIONS) {
    test(`PossessedLocation renders cleanly for ${loc} with resistance tier 4`, async ({ game: page }) => {
      await setVar(page, 'checkChosenLocation', loc);
      await setVar(page, 'mcpossession', 4);
      await goToPassage(page, 'PossessedLocation');
      await expectCleanPassage(page);
    });
  }

  test('PossessedLocation handles the no-location fallback branch', async ({ game: page }) => {
    await setVar(page, 'checkChosenLocation', 'nowhere');
    await setVar(page, 'mcpossession', 0);
    await goToPassage(page, 'PossessedLocation');
    await expectCleanPassage(page);
    const text = await page.locator('#passages').innerText();
    expect(text).toContain('possession fading');
  });

  test('PossessedLocation1 renders cleanly', async ({ game: page }) => {
    await setVar(page, 'checkChosenLocation', 'library');
    await setVar(page, 'mcpossession', 7);
    await goToPassage(page, 'PossessedLocation1');
    await expectCleanPassage(page);
  });

  test('PossessedLocation2 renders cleanly', async ({ game: page }) => {
    await setVar(page, 'checkChosenLocation', 'library');
    await setVar(page, 'mcpossession', 11);
    await goToPassage(page, 'PossessedLocation2');
    await expectCleanPassage(page);
  });

  test('main Possessed nun event passage renders cleanly', async ({ game: page }) => {
    await goToPassage(page, 'Possessed');
    await expectCleanPassage(page);
  });
});

test.describe('Possession — city map gating', () => {
  test('CityMapPossessed gates Gym on $mc.fit >= 30', async ({ game: page }) => {
    await setVar(page, 'mc.fit', 10);
    await goToPassage(page, 'CityMapPossessed');
    await expectCleanPassage(page);
    let text = await page.locator('#passages').innerText();
    expect(text).toContain('Req. fit lvl 30');

    await setVar(page, 'mc.fit', 30);
    await goToPassage(page, 'CityMapPossessed');
    text = await page.locator('#passages').innerText();
    expect(text).not.toContain('Req. fit lvl 30');
  });

  test('CityMapPossessed gates Church on $mcpossession >= 5', async ({ game: page }) => {
    await setVar(page, 'mcpossession', 2);
    await goToPassage(page, 'CityMapPossessed');
    let text = await page.locator('#passages').innerText();
    expect(text).toContain('Possession 5+');

    await setVar(page, 'mcpossession', 5);
    await goToPassage(page, 'CityMapPossessed');
    text = await page.locator('#passages').innerText();
    expect(text).not.toContain('Possession 5+');
  });
});

test.describe('Possession — home summoning events', () => {
  test.describe.configure({ timeout: 10_000, retries: 1 });
  for (const passage of [
    'TheTwinsEvent',
    'SleepTwins',
    'Summoning',
    'SummoningStart',
    'SummonMare',
    'SummonSpirit',
    'SummonTentacles',
    'SummonTwins',
    'SuccubusChoice',
  ]) {
    test(`${passage} renders cleanly`, async ({ game: page }) => {
      await goToPassage(page, passage);
      await expectCleanPassage(page);
    });
  }
});
