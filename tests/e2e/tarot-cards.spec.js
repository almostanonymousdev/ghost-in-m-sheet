const { test, expect } = require('../fixtures');
const { setVar, getVar, callSetup, goToPassage } = require('../helpers');

/**
 * Tarot deck behavior (setup.drawTarotCard + setup.HauntedHouses.*):
 *
 *   - drawTarotCard rolls Math.random()*101 against accumulated chances
 *   - The deck sums to 100 chance points (passion 20 + pulse 20 + oblivion 1
 *     + knowledge 10 + power 12 + whore 10 + death 5 + possession 1
 *     + highpriestess 2 + fool 19)
 *   - drawnCards is capped at 10 -- TarotCards.tw refuses to draw past that
 *   - Distribution: high-frequency cards (passion/pulse/fool) dominate;
 *     rare cards (oblivion/possession) almost never fire
 */
test.describe('Tarot cards', () => {
  test.describe.configure({ timeout: 30_000 });

  // setup.tarotDeck and setup.drawTarotCard live in a <<script>> block
  // inside the TarotCards passage and only initialise on first visit.
  test.beforeEach(async ({ game: page }) => {
    await goToPassage(page, 'TarotCards');
  });

  test('deck sums to 100 chance points', async ({ game: page }) => {
    const total = await page.evaluate(() =>
      SugarCube.setup.tarotDeck.reduce((s, c) => s + c.chance, 0)
    );
    expect(total).toBe(100);
  });

  test('drawTarotCard returns a card whose chance covers the roll', async ({ game: page }) => {
    // Force roll = 0 → first card (passion).
    const card = await page.evaluate(() => {
      const orig = Math.random;
      Math.random = () => 0;
      try { return SugarCube.setup.drawTarotCard(SugarCube.setup.tarotDeck); }
      finally { Math.random = orig; }
    });
    expect(card.name).toBe('passion');
  });

  test('drawTarotCard at roll≈100 lands on the last (fool) card', async ({ game: page }) => {
    const card = await page.evaluate(() => {
      const orig = Math.random;
      Math.random = () => 0.999999;
      try { return SugarCube.setup.drawTarotCard(SugarCube.setup.tarotDeck); }
      finally { Math.random = orig; }
    });
    expect(card.name).toBe('fool');
  });

  test('1000-sample distribution: passion + pulse + fool together ≥ 50%', async ({ game: page }) => {
    const counts = await page.evaluate(() => {
      const buckets = {};
      for (let i = 0; i < 1000; i++) {
        const c = SugarCube.setup.drawTarotCard(SugarCube.setup.tarotDeck);
        buckets[c.name] = (buckets[c.name] || 0) + 1;
      }
      return buckets;
    });
    const major = (counts.passion || 0) + (counts.pulse || 0) + (counts.fool || 0);
    expect(major).toBeGreaterThan(500);
    // Rare cards: oblivion (1%) and possession (1%) should each appear
    // < 50 in 1000 rolls (theoretical mean 10, generous upper bound 50).
    expect(counts.oblivion || 0).toBeLessThan(50);
    expect(counts.possession || 0).toBeLessThan(50);
  });

  test('drawnCards counter caps draws at 10', async ({ game: page }) => {
    // Pump drawnCards to 10 directly; TarotCards.tw guard reads via
    // setup.HauntedHouses.drawnCards().
    await page.evaluate(() => {
      SugarCube.State.variables.drawnCards = 10;
    });
    expect(await callSetup(page, 'setup.HauntedHouses.drawnCards()')).toBe(10);
    expect(await callSetup(page, 'setup.HauntedHouses.drawnCards() < 10')).toBe(false);
    // markTarotSpent should flip the stage to SPENT (=2).
    await callSetup(page, 'setup.HauntedHouses.markTarotSpent()');
    expect(await callSetup(page, 'setup.HauntedHouses.tarotCardsStage()')).toBe(2);
    expect(await callSetup(page, 'setup.TarotStage.SPENT')).toBe(2);
  });

  test('drawAndStampTarotCard mutates $chosenCard and returns it', async ({ game: page }) => {
    await page.evaluate(() => {
      delete SugarCube.State.variables.chosenCard;
      const orig = Math.random;
      Math.random = () => 0;
      try { SugarCube.setup.HauntedHouses.drawAndStampTarotCard(); }
      finally { Math.random = orig; }
    });
    expect(await getVar(page, 'chosenCard.name')).toBe('passion');
  });

  test('cheatTarotCard setting forces drawAndStampTarotCard to a specific card', async ({ game: page }) => {
    await page.evaluate(() => {
      delete SugarCube.State.variables.chosenCard;
      SugarCube.settings.cheatTarotCard = 'death';
      // Random would otherwise return 'passion' at roll=0; cheat must override.
      const orig = Math.random;
      Math.random = () => 0;
      try { SugarCube.setup.HauntedHouses.drawAndStampTarotCard(); }
      finally { Math.random = orig; SugarCube.settings.cheatTarotCard = '—'; }
    });
    expect(await getVar(page, 'chosenCard.name')).toBe('death');
  });

  test('incrementDrawnCards increments the counter', async ({ game: page }) => {
    await page.evaluate(() => {
      SugarCube.State.variables.drawnCards = 0;
    });
    await callSetup(page, 'setup.HauntedHouses.incrementDrawnCards()');
    await callSetup(page, 'setup.HauntedHouses.incrementDrawnCards()');
    expect(await callSetup(page, 'setup.HauntedHouses.drawnCards()')).toBe(2);
  });

  /* Level gate: the deck is supposed to be invisible (no furniture
     pickups, no Witch's Blessing pre-stamp) below
     HauntedHouses.tarotLevelRequired. The two guarantees below pin
     both halves -- isTarotDiscoverable goes false even when the
     per-hunt stage is HIDDEN, and HuntController.lootKindsAt filters
     the kind out so a furniture search never surfaces it. */
  test('isTarotDiscoverable returns false when MC is below the level gate', async ({ game: page }) => {
    await page.evaluate(() => SugarCube.setup.HauntedHouses.resetCursedItemState());
    const req = await callSetup(page, 'setup.HauntedHouses.tarotLevelRequired()');
    await setVar(page, 'mc.lvl', req - 1);
    expect(await callSetup(page, 'setup.HauntedHouses.isTarotDiscoverable()')).toBe(false);
    await setVar(page, 'mc.lvl', req);
    expect(await callSetup(page, 'setup.HauntedHouses.isTarotDiscoverable()')).toBe(true);
  });

  test('floor-plan furniture search hides tarotCards below level gate', async ({ game: page }) => {
    /* startHunt always places tarotCards on a furniture slot. Below
       the level gate, HuntController.lootKindsAt() filters tarotCards
       out so the player searching that slot finds nothing. At/above
       the gate the deck reappears in the same slot. */
    await setVar(page, 'mc.lvl', 1);
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1 }));
    const slot = await page.evaluate(() => {
      const fp = SugarCube.State.variables.run.floorplan;
      return fp.loot.tarotCards
        ? { room: fp.loot.tarotCards, suffix: fp.lootFurniture.tarotCards }
        : null;
    });
    expect(slot).not.toBeNull();
    expect(slot.suffix).toBeTruthy();

    const lockedKinds = await page.evaluate(
      (s) => SugarCube.setup.HuntController.lootKindsAt(s.room, s.suffix),
      slot
    );
    expect(lockedKinds).not.toContain('tarotCards');

    const req = await callSetup(page, 'setup.HauntedHouses.tarotLevelRequired()');
    await setVar(page, 'mc.lvl', req);
    const unlockedKinds = await page.evaluate(
      (s) => SugarCube.setup.HuntController.lootKindsAt(s.room, s.suffix),
      slot
    );
    expect(unlockedKinds).toContain('tarotCards');
  });

  /* Regression: drawing the Possession card used to leave the "Pull a card"
     and Back links wired to their original draw/$return targets, so a
     player who kept clicking instead of "Give in" got more draws and then
     exited the deck normally. tarotPossession now mirrors tarotDeath and
     re-routes both links to possessionPassage(). */
  test('after drawing Possession, "Pull a card" again routes to CityMapPossessed', async ({ game: page }) => {
    test.setTimeout(15_000);

    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1 }));
    await page.evaluate(() => SugarCube.setup.HauntedHouses.markTarotCarrying());
    await page.evaluate(() => { SugarCube.settings.cheatTarotCard = 'possession'; });
    await goToPassage(page, 'TarotCards');

    await page.locator('.passage').getByText('Pull a card', { exact: true }).click();
    await expect(
      page.locator('.passage').getByText('Give in', { exact: true })
    ).toBeVisible();

    // tarotPossession also re-routes Back; click it to confirm Back no
    // longer escapes to $return after Possession is drawn.
    await page.locator('.passage').getByText('Back', { exact: true }).click({ timeout: 5000 });
    await page.waitForFunction(
      () => SugarCube.State.passage === 'CityMapPossessed',
      null,
      { timeout: 5000 }
    );
    expect(await getVar(page, 'run')).toBeNull();

    await page.evaluate(() => { SugarCube.settings.cheatTarotCard = '—'; });
  });

  test('after drawing Possession, the re-enabled "Pull a card" routes to CityMapPossessed instead of drawing again', async ({ game: page }) => {
    test.setTimeout(15_000);

    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1 }));
    await page.evaluate(() => SugarCube.setup.HauntedHouses.markTarotCarrying());
    await page.evaluate(() => { SugarCube.settings.cheatTarotCard = 'possession'; });
    await goToPassage(page, 'TarotCards');

    await page.locator('.passage').getByText('Pull a card', { exact: true }).click();
    await expect(
      page.locator('.passage').getByText('Give in', { exact: true })
    ).toBeVisible();

    // Wait for the 2s timed re-enable in TarotCards.tw so the
    // .tarotCardHidden wrapper sheds .disabled-link.
    await page.waitForFunction(
      () => !document.querySelector('#tarotCardsEnd')?.classList.contains('disabled-link'),
      null,
      { timeout: 5000 }
    );

    await page.locator('.passage').getByText('Pull a card', { exact: true }).click();
    await page.waitForFunction(
      () => SugarCube.State.passage === 'CityMapPossessed',
      null,
      { timeout: 5000 }
    );
    expect(await getVar(page, 'run')).toBeNull();
    // No additional draw should have been counted -- the only increment
    // came from the click that drew Possession itself.
    expect(await getVar(page, 'drawnCards')).toBe(1);

    await page.evaluate(() => { SugarCube.settings.cheatTarotCard = '—'; });
  });
});
