const { test, expect } = require('./fixtures');
const { goToPassage, getVar, setVar, callSetup } = require('./helpers');

/**
 * Coverage for the witch's ectoplasm-unlock quest gate. Until the MC
 * finishes the (placeholder) quest, every reference to the ectoplasm
 * currency + the rogue/random hunt card on GhostStreet has to stay
 * hidden. The witch only surfaces the quest once the MC hits level 5.
 *
 * The single read-side gate is setup.Witch.ectoplasmUnlocked(); the
 * stage progression is NOT_OFFERED -> OFFERED -> COMPLETED via
 * markEctoplasmQuestStarted / completeEctoplasmQuest.
 */
test.describe('Witch ectoplasm-unlock quest gate', () => {
  test('ectoplasmUnlocked() defaults false on a fresh save', async ({ game: page }) => {
    expect(await callSetup(page, 'setup.Witch.ectoplasmUnlocked()')).toBe(false);
    expect(await callSetup(page, 'setup.Witch.ectoplasmQuestStarted()')).toBe(false);
    expect(await callSetup(page, 'setup.Witch.ectoplasmQuestComplete()')).toBe(false);
  });

  test('canOfferEctoplasmQuest() is false below level 5', async ({ game: page }) => {
    await setVar(page, 'mc.lvl', 4);
    expect(await callSetup(page, 'setup.Witch.canOfferEctoplasmQuest()')).toBe(false);
  });

  test('canOfferEctoplasmQuest() is true at level 5 before the quest is offered', async ({ game: page }) => {
    await setVar(page, 'mc.lvl', 5);
    expect(await callSetup(page, 'setup.Witch.canOfferEctoplasmQuest()')).toBe(true);
  });

  test('markEctoplasmQuestStarted flips stage to OFFERED and closes the offer window', async ({ game: page }) => {
    await setVar(page, 'mc.lvl', 5);
    await callSetup(page, 'setup.Witch.markEctoplasmQuestStarted()');

    expect(await callSetup(page, 'setup.Witch.ectoplasmQuestStarted()')).toBe(true);
    expect(await callSetup(page, 'setup.Witch.canOfferEctoplasmQuest()')).toBe(false);
    /* Stage is OFFERED, not COMPLETED — the gate still hides the UI. */
    expect(await callSetup(page, 'setup.Witch.ectoplasmUnlocked()')).toBe(false);
  });

  test('completeEctoplasmQuest unlocks the gate', async ({ game: page }) => {
    await callSetup(page, 'setup.Witch.completeEctoplasmQuest()');

    expect(await callSetup(page, 'setup.Witch.ectoplasmQuestComplete()')).toBe(true);
    expect(await callSetup(page, 'setup.Witch.ectoplasmUnlocked()')).toBe(true);
  });

  test('GhostStreet hides the rogue hunt card until the quest is complete', async ({ game: page }) => {
    /* Player at level 5 but quest not yet finished. The rogue
       address card is purely seed-derived and renders as a hunt-house
       icon, so we assert the card is absent via the gate-mirroring
       helper. */
    await setVar(page, 'mc.lvl', 5);
    await goToPassage(page, 'GhostStreet');

    expect(await callSetup(page, 'setup.Witch.ectoplasmUnlocked()')).toBe(false);
    /* The huntCard widget is wrapped in the same gate; with the gate
       off, the seed never advances on render either. */
    const seedBefore = await getVar(page, 'nextHuntSeed');
    await goToPassage(page, 'GhostStreet');
    const seedAfter = await getVar(page, 'nextHuntSeed');
    expect(seedAfter).toBe(seedBefore);
  });

  test('ectoplasm sidebar line stays hidden until the quest is complete', async ({ game: page }) => {
    await goToPassage(page, 'GhostStreet');
    /* StoryCaption renders the ectoplasm line only when unlocked.
       Asserting on the gate is the load-bearing thing — the sidebar
       markup follows directly from it. */
    expect(await callSetup(page, 'setup.Witch.ectoplasmUnlocked()')).toBe(false);
    const captionHtml = await page.locator('#story-caption').innerHTML();
    expect(captionHtml).not.toMatch(/Ectoplasm/i);

    await callSetup(page, 'setup.Witch.completeEctoplasmQuest()');
    await goToPassage(page, 'GhostStreet');

    expect(await callSetup(page, 'setup.Witch.ectoplasmUnlocked()')).toBe(true);
    const unlockedHtml = await page.locator('#story-caption').innerHTML();
    expect(unlockedHtml).toMatch(/Ectoplasm/i);
  });
});
