const { test, expect } = require('./fixtures');
const { goToPassage, getVar, setVar, callSetup } = require('./helpers');

/**
 * Coverage for the witch's ectoplasm-unlock quest gate. Until the MC
 * finishes the quest, every reference to the ectoplasm currency + the
 * rogue/random hunt card on GhostStreet has to stay hidden. The witch
 * only surfaces the quest once the MC hits level 5.
 *
 * The single read-side gate is setup.Witch.ectoplasmUnlocked(); the
 * stage progression is NOT_OFFERED -> OFFERED -> COMPLETED via
 * markEctoplasmQuestStarted / completeEctoplasmQuest.
 *
 * The quest proof is GHOSTS_TO_WEAKEN seduce-minigame wins, tracked as
 * a lifetime tally (setup.Witch.ectoplasmWeakenCount) that increments on
 * every recordWeakenReward regardless of quest state. offerEctoplasmQuest
 * snapshots whether the MC had already cleared the bar (prequalified).
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

test.describe('Witch ectoplasm-quest weaken counter', () => {
  test('ectoplasmWeakenCount() defaults to 0 and remaining to the full goal', async ({ game: page }) => {
    expect(await callSetup(page, 'setup.Witch.ectoplasmWeakenCount()')).toBe(0);
    const goal = await callSetup(page, 'setup.Witch.GHOSTS_TO_WEAKEN');
    expect(await callSetup(page, 'setup.Witch.ectoplasmWeakenRemaining()')).toBe(goal);
  });

  test('recordWeakenReward increments the lifetime tally even with no quest open', async ({ game: page }) => {
    /* The counter is a lifetime tally — it must move before the quest is
       ever offered, so a hunter who weakens ghosts early gets credit. */
    expect(await callSetup(page, 'setup.Witch.ectoplasmQuestStarted()')).toBe(false);

    await callSetup(page, 'setup.Witch.recordWeakenReward(30)');
    expect(await callSetup(page, 'setup.Witch.ectoplasmWeakenCount()')).toBe(1);
    expect(await callSetup(page, 'setup.Witch.ectoplasmWeakenRemaining()')).toBe(2);

    await callSetup(page, 'setup.Witch.recordWeakenReward(30)');
    await callSetup(page, 'setup.Witch.recordWeakenReward(30)');
    expect(await callSetup(page, 'setup.Witch.ectoplasmWeakenCount()')).toBe(3);
    expect(await callSetup(page, 'setup.Witch.ectoplasmWeakenRemaining()')).toBe(0);
  });

  test('recordWeakenReward still stamps the per-weaken payout flags', async ({ game: page }) => {
    await callSetup(page, 'setup.Witch.recordWeakenReward(45)');
    expect(await callSetup(page, 'setup.Witch.isGhostWeakened()')).toBe(true);
    expect(await callSetup(page, 'setup.Witch.moneyFromWeakenGhost()')).toBe(45);
  });

  test('canCompleteEctoplasmQuest() needs both the quest open and the bar met', async ({ game: page }) => {
    /* Three weakens but no quest yet -> cannot complete. */
    await callSetup(page, 'setup.Witch.recordWeakenReward(30)');
    await callSetup(page, 'setup.Witch.recordWeakenReward(30)');
    await callSetup(page, 'setup.Witch.recordWeakenReward(30)');
    expect(await callSetup(page, 'setup.Witch.canCompleteEctoplasmQuest()')).toBe(false);

    /* Open the quest -> now the bar is satisfied. */
    await setVar(page, 'mc.lvl', 5);
    await callSetup(page, 'setup.Witch.offerEctoplasmQuest()');
    expect(await callSetup(page, 'setup.Witch.canCompleteEctoplasmQuest()')).toBe(true);
  });

  test('quest open but under the bar cannot complete until enough weakens land', async ({ game: page }) => {
    await setVar(page, 'mc.lvl', 5);
    await callSetup(page, 'setup.Witch.offerEctoplasmQuest()');
    expect(await callSetup(page, 'setup.Witch.canCompleteEctoplasmQuest()')).toBe(false);

    await callSetup(page, 'setup.Witch.recordWeakenReward(30)');
    await callSetup(page, 'setup.Witch.recordWeakenReward(30)');
    expect(await callSetup(page, 'setup.Witch.canCompleteEctoplasmQuest()')).toBe(false);

    await callSetup(page, 'setup.Witch.recordWeakenReward(30)');
    expect(await callSetup(page, 'setup.Witch.canCompleteEctoplasmQuest()')).toBe(true);
  });
});

test.describe('Witch ectoplasm-quest prequalification', () => {
  test('isEctoplasmQuestPrequalified() defaults false', async ({ game: page }) => {
    expect(await callSetup(page, 'setup.Witch.isEctoplasmQuestPrequalified()')).toBe(false);
  });

  test('offerEctoplasmQuest with the bar already met flags prequalified + lets her complete at once', async ({ game: page }) => {
    await setVar(page, 'mc.lvl', 5);
    await callSetup(page, 'setup.Witch.recordWeakenReward(30)');
    await callSetup(page, 'setup.Witch.recordWeakenReward(30)');
    await callSetup(page, 'setup.Witch.recordWeakenReward(30)');

    await callSetup(page, 'setup.Witch.offerEctoplasmQuest()');

    expect(await callSetup(page, 'setup.Witch.ectoplasmQuestStarted()')).toBe(true);
    expect(await callSetup(page, 'setup.Witch.isEctoplasmQuestPrequalified()')).toBe(true);
    expect(await callSetup(page, 'setup.Witch.canCompleteEctoplasmQuest()')).toBe(true);
  });

  test('offerEctoplasmQuest under the bar leaves prequalified false', async ({ game: page }) => {
    await setVar(page, 'mc.lvl', 5);
    await callSetup(page, 'setup.Witch.recordWeakenReward(30)');

    await callSetup(page, 'setup.Witch.offerEctoplasmQuest()');

    expect(await callSetup(page, 'setup.Witch.isEctoplasmQuestPrequalified()')).toBe(false);
    expect(await callSetup(page, 'setup.Witch.canCompleteEctoplasmQuest()')).toBe(false);
  });

  test('weakening past the bar after a non-prequalified offer does not retroactively flip prequalified', async ({ game: page }) => {
    /* prequalified is a snapshot taken at offer time; later weakens let
       her complete but must not rewrite "she did it before I asked". */
    await setVar(page, 'mc.lvl', 5);
    await callSetup(page, 'setup.Witch.offerEctoplasmQuest()');
    await callSetup(page, 'setup.Witch.recordWeakenReward(30)');
    await callSetup(page, 'setup.Witch.recordWeakenReward(30)');
    await callSetup(page, 'setup.Witch.recordWeakenReward(30)');

    expect(await callSetup(page, 'setup.Witch.canCompleteEctoplasmQuest()')).toBe(true);
    expect(await callSetup(page, 'setup.Witch.isEctoplasmQuestPrequalified()')).toBe(false);
  });
});
