const { test, expect } = require('./fixtures');
const { setVar, getVar, callSetup, goToPassage } = require('./helpers');

test.describe('Hunt Journal', () => {
  // --- Lifecycle ----------------------------------------------------------

  test('hasUnread is false on a fresh game', async ({ game: page }) => {
    expect(await callSetup(page, 'setup.HuntJournal.hasUnread()')).toBe(false);
    expect(await callSetup(page, 'setup.HuntJournal.journal()')).toBeNull();
  });

  test('record* helpers are no-ops when no hunt is active', async ({ game: page }) => {
    // No $hunt → realName is undefined → recordHuntStart should bail.
    await page.evaluate(() => SugarCube.setup.HuntJournal.recordHuntStart());
    expect(await callSetup(page, 'setup.HuntJournal.journal()')).toBeNull();

    // recordHuntEnd / recordPayout / recordCursedItem should not crash either.
    await page.evaluate(() => {
      SugarCube.setup.HuntJournal.recordHuntEnd();
      SugarCube.setup.HuntJournal.recordCursedItem();
      SugarCube.setup.HuntJournal.recordPayout(true);
    });
    expect(await callSetup(page, 'setup.HuntJournal.journal()')).toBeNull();
    expect(await callSetup(page, 'setup.HuntJournal.hasUnread()')).toBe(false);
  });

  // --- recordHuntStart ----------------------------------------------------

  test('recordHuntStart snapshots sanity and the real ghost name', async ({ game: page }) => {
    await setVar(page, 'mc.sanity', 82);
    await page.evaluate(() => SugarCube.setup.Ghosts.startHunt('Shade'));
    await page.evaluate(() => SugarCube.setup.HuntJournal.recordHuntStart());

    const j = await callSetup(page, 'setup.HuntJournal.journal()');
    expect(j).not.toBeNull();
    expect(j.realGhost).toBe('Shade');
    expect(j.sanityStart).toBe(82);
    expect(j.sanityEnd).toBeNull();
    expect(j.cursedItem).toBeNull();
    expect(j.moneyEarned).toBe(0);
    expect(j.unread).toBe(false);
  });

  test('recordHuntStart records "Mimic" not the rotating disguise', async ({ game: page }) => {
    await page.evaluate(() => SugarCube.setup.Ghosts.startHunt('Mimic'));
    // Force the visible name to a disguise; realName stays "Mimic".
    await page.evaluate(() => { SugarCube.State.variables.hunt.name = 'Spirit'; });
    await page.evaluate(() => SugarCube.setup.HuntJournal.recordHuntStart());

    const j = await callSetup(page, 'setup.HuntJournal.journal()');
    expect(j.realGhost).toBe('Mimic');
  });

  test('recordHuntStart wipes any prior journal so only the latest hunt shows', async ({ game: page }) => {
    await page.evaluate(() => SugarCube.setup.Ghosts.startHunt('Shade'));
    await page.evaluate(() => SugarCube.setup.HuntJournal.recordHuntStart());
    await page.evaluate(() => SugarCube.setup.HuntJournal.recordPayout(true));
    expect(await callSetup(page, 'setup.HuntJournal.hasUnread()')).toBe(true);

    // A new hunt starts: prior unread recap must be cleared.
    await page.evaluate(() => SugarCube.setup.Ghosts.endContract());
    await page.evaluate(() => SugarCube.setup.Ghosts.startHunt('Wraith'));
    await page.evaluate(() => SugarCube.setup.HuntJournal.recordHuntStart());

    expect(await callSetup(page, 'setup.HuntJournal.hasUnread()')).toBe(false);
    const j = await callSetup(page, 'setup.HuntJournal.journal()');
    expect(j.realGhost).toBe('Wraith');
    expect(j.guessedGhost).toBeNull();
  });

  // --- recordHuntEnd ------------------------------------------------------

  test('recordHuntEnd snapshots end sanity', async ({ game: page }) => {
    await setVar(page, 'mc.sanity', 80);
    await page.evaluate(() => SugarCube.setup.Ghosts.startHunt('Shade'));
    await page.evaluate(() => SugarCube.setup.HuntJournal.recordHuntStart());
    await setVar(page, 'mc.sanity', 35);

    await page.evaluate(() => SugarCube.setup.HuntJournal.recordHuntEnd());

    const j = await callSetup(page, 'setup.HuntJournal.journal()');
    expect(j.sanityEnd).toBe(35);
    expect(await callSetup(page, 'setup.HuntJournal.sanityLost()')).toBe(45);
  });

  test('evidenceLabels reads notebook checks live (not from a hunt-end snapshot)', async ({ game: page }) => {
    // Ticks added AFTER recordHuntEnd should still surface in the recap
    // — players often fill in their notebook on the way home.
    await page.evaluate(() => SugarCube.setup.Ghosts.startHunt('Shade'));
    await page.evaluate(() => SugarCube.setup.HuntJournal.recordHuntStart());
    await page.evaluate(() => SugarCube.setup.HuntJournal.recordHuntEnd());

    await setVar(page, 'EMF5Check', true);
    await setVar(page, 'GWBCheck', true);

    const labels = await callSetup(page, 'setup.HuntJournal.evidenceLabels()');
    expect(labels.sort()).toEqual(['EMF5', 'GhostWritingBook']);
  });

  test('sanityLost clamps at 0 when sanity recovered (e.g. pills) during the hunt', async ({ game: page }) => {
    await setVar(page, 'mc.sanity', 40);
    await page.evaluate(() => SugarCube.setup.Ghosts.startHunt('Shade'));
    await page.evaluate(() => SugarCube.setup.HuntJournal.recordHuntStart());
    await setVar(page, 'mc.sanity', 90);
    await page.evaluate(() => SugarCube.setup.HuntJournal.recordHuntEnd());

    expect(await callSetup(page, 'setup.HuntJournal.sanityLost()')).toBe(0);
  });

  // --- recordCursedItem ---------------------------------------------------

  test('recordCursedItem stores the cursed item key when one is active', async ({ game: page }) => {
    await page.evaluate(() => SugarCube.setup.Ghosts.startHunt('Shade'));
    await page.evaluate(() => SugarCube.setup.HuntJournal.recordHuntStart());

    await setVar(page, 'cursedHomeItem', 'tv');
    await setVar(page, 'cursedHomeItemActive', 1);
    await page.evaluate(() => SugarCube.setup.HuntJournal.recordCursedItem());

    const j = await callSetup(page, 'setup.HuntJournal.journal()');
    expect(j.cursedItem).toBe('tv');
    expect(await callSetup(page, 'setup.HuntJournal.cursedItemLabel()')).toBe('TV');
  });

  test('recordCursedItem leaves cursedItem null when no item is cursed', async ({ game: page }) => {
    await page.evaluate(() => SugarCube.setup.Ghosts.startHunt('Shade'));
    await page.evaluate(() => SugarCube.setup.HuntJournal.recordHuntStart());
    await page.evaluate(() => SugarCube.setup.HuntJournal.recordCursedItem());

    const j = await callSetup(page, 'setup.HuntJournal.journal()');
    expect(j.cursedItem).toBeNull();
    expect(await callSetup(page, 'setup.HuntJournal.cursedItemLabel()')).toBe('');
  });

  // --- recordPayout -------------------------------------------------------

  test('recordPayout(true) sums contract + weaken bonus and flips unread', async ({ game: page }) => {
    await page.evaluate(() => SugarCube.setup.Ghosts.startHunt('Shade'));
    await page.evaluate(() => SugarCube.setup.HuntJournal.recordHuntStart());
    await page.evaluate(() => SugarCube.setup.HauntedHouses.setContractReward(240, 70));
    await setVar(page, 'moneyFromWeakenTheGhost', 50);
    await setVar(page, 'ghostTypeSelected', 'Shade');

    await page.evaluate(() => SugarCube.setup.HuntJournal.recordPayout(true));

    const j = await callSetup(page, 'setup.HuntJournal.journal()');
    expect(j.guessedGhost).toBe('Shade');
    expect(j.guessCorrect).toBe(true);
    expect(j.moneyEarned).toBe(290);
    expect(j.xpEarned).toBe(70);
    expect(await callSetup(page, 'setup.HuntJournal.hasUnread()')).toBe(true);
  });

  test('recordPayout(false) pays only the weaken bonus and stamps a wrong guess', async ({ game: page }) => {
    await page.evaluate(() => SugarCube.setup.Ghosts.startHunt('Wraith'));
    await page.evaluate(() => SugarCube.setup.HuntJournal.recordHuntStart());
    await page.evaluate(() => SugarCube.setup.HauntedHouses.setContractReward(240, 70));
    await setVar(page, 'moneyFromWeakenTheGhost', 50);
    await setVar(page, 'ghostTypeSelected', 'Shade');

    await page.evaluate(() => SugarCube.setup.HuntJournal.recordPayout(false));

    const j = await callSetup(page, 'setup.HuntJournal.journal()');
    expect(j.guessedGhost).toBe('Shade');
    expect(j.guessCorrect).toBe(false);
    expect(j.moneyEarned).toBe(50);
    expect(j.xpEarned).toBe(10);
    expect(await callSetup(page, 'setup.HuntJournal.hasUnread()')).toBe(true);
  });

  test('recordHuntEnd flips unread so the next wake shows the recap', async ({ game: page }) => {
    // Drives the morning-routine beat: the recap should surface after
    // the FIRST sleep that follows the hunt, even before the witch
    // contract is closed.
    await page.evaluate(() => SugarCube.setup.Ghosts.startHunt('Shade'));
    await page.evaluate(() => SugarCube.setup.HuntJournal.recordHuntStart());
    await page.evaluate(() => SugarCube.setup.HuntJournal.recordHuntEnd());

    expect(await callSetup(page, 'setup.HuntJournal.hasUnread()')).toBe(true);
    const rec = await callSetup(page, 'setup.HuntJournal.journal()');
    expect(rec.guessedGhost).toBeNull();
    expect(rec.moneyEarned).toBe(0);
  });

  test('recordPayout re-flips unread so a second post-witch wake shows the full recap', async ({ game: page }) => {
    // Player wakes once after the hunt sleep (recap marked read), then
    // visits the witch and sleeps again — the post-payout summary
    // (guess + money) should surface on that second wake.
    await page.evaluate(() => SugarCube.setup.Ghosts.startHunt('Shade'));
    await page.evaluate(() => SugarCube.setup.HuntJournal.recordHuntStart());
    await page.evaluate(() => SugarCube.setup.HuntJournal.recordHuntEnd());
    await page.evaluate(() => SugarCube.setup.HuntJournal.markRead());
    expect(await callSetup(page, 'setup.HuntJournal.hasUnread()')).toBe(false);

    await page.evaluate(() => SugarCube.setup.HauntedHouses.setContractReward(240, 70));
    await setVar(page, 'ghostTypeSelected', 'Shade');
    await page.evaluate(() => SugarCube.setup.HuntJournal.recordPayout(true));

    expect(await callSetup(page, 'setup.HuntJournal.hasUnread()')).toBe(true);
  });

  // --- markRead -----------------------------------------------------------

  test('markRead clears unread without dropping the journal data', async ({ game: page }) => {
    await page.evaluate(() => SugarCube.setup.Ghosts.startHunt('Shade'));
    await page.evaluate(() => SugarCube.setup.HuntJournal.recordHuntStart());
    await page.evaluate(() => SugarCube.setup.HuntJournal.recordPayout(true));
    expect(await callSetup(page, 'setup.HuntJournal.hasUnread()')).toBe(true);

    await page.evaluate(() => SugarCube.setup.HuntJournal.markRead());

    expect(await callSetup(page, 'setup.HuntJournal.hasUnread()')).toBe(false);
    const j = await callSetup(page, 'setup.HuntJournal.journal()');
    expect(j.realGhost).toBe('Shade');
    expect(j.guessCorrect).toBe(true);
  });

  // --- evidenceLabels -----------------------------------------------------

  test('evidenceLabels maps stored ids to canonical Evidence labels', async ({ game: page }) => {
    await page.evaluate(() => SugarCube.setup.Ghosts.startHunt('Shade'));
    await page.evaluate(() => SugarCube.setup.HuntJournal.recordHuntStart());
    await setVar(page, 'EMF5Check', true);
    await setVar(page, 'EctoglassCheck', true);
    await page.evaluate(() => SugarCube.setup.HuntJournal.recordHuntEnd());

    const labels = await callSetup(page, 'setup.HuntJournal.evidenceLabels()');
    expect(labels.sort()).toEqual(['EMF5', 'Ectoplasm']);
  });

  // --- contenders ---------------------------------------------------------

  test('contenders: returns all ghosts whose evidence pattern matches the logged checks', async ({ game: page }) => {
    // EMF + GWB + Temperature → exact match for Shade (no other ghost
    // has all three).
    await page.evaluate(() => SugarCube.setup.Ghosts.startHunt('Shade'));
    await page.evaluate(() => SugarCube.setup.HuntJournal.recordHuntStart());
    await setVar(page, 'EMF5Check', true);
    await setVar(page, 'GWBCheck', true);
    await setVar(page, 'TemperatureCheck', true);
    await page.evaluate(() => SugarCube.setup.HuntJournal.recordHuntEnd());

    const conts = await callSetup(page, 'setup.HuntJournal.contenders()');
    expect(conts.map(c => c.name)).toEqual(['Shade']);
  });

  test('contenders: a single piece of evidence yields multiple matches', async ({ game: page }) => {
    await page.evaluate(() => SugarCube.setup.Ghosts.startHunt('Shade'));
    await page.evaluate(() => SugarCube.setup.HuntJournal.recordHuntStart());
    await setVar(page, 'EMF5Check', true);
    await page.evaluate(() => SugarCube.setup.HuntJournal.recordHuntEnd());

    const conts = await callSetup(page, 'setup.HuntJournal.contenders()');
    const names = conts.map(c => c.name);
    expect(names).toContain('Shade');
    expect(names).toContain('Spirit');
    expect(names).toContain('Jinn');
  });

  test('contenders: hint is exposed only when the ghost has been discovered', async ({ game: page }) => {
    await page.evaluate(() => SugarCube.setup.Ghosts.startHunt('Shade'));
    await page.evaluate(() => SugarCube.setup.HuntJournal.recordHuntStart());
    await setVar(page, 'EMF5Check', true);
    await setVar(page, 'GWBCheck', true);
    await setVar(page, 'TemperatureCheck', true);
    await page.evaluate(() => SugarCube.setup.HuntJournal.recordHuntEnd());
    // Player has read the Shade entry in the Ghostopedia.
    await page.evaluate(() => SugarCube.setup.Ghosts.markDiscovered('Shade'));

    const conts = await callSetup(page, 'setup.HuntJournal.contenders()');
    const shade = conts.find(c => c.name === 'Shade');
    expect(shade.discovered).toBe(true);
    expect(shade.hint).toContain('sanity');
  });

  test('contenders: undiscovered ghost reports discovered=false', async ({ game: page }) => {
    await page.evaluate(() => SugarCube.setup.Ghosts.startHunt('Shade'));
    await page.evaluate(() => SugarCube.setup.HuntJournal.recordHuntStart());
    await setVar(page, 'EMF5Check', true);
    await page.evaluate(() => SugarCube.setup.HuntJournal.recordHuntEnd());

    const conts = await callSetup(page, 'setup.HuntJournal.contenders()');
    expect(conts.length).toBeGreaterThan(0);
    expect(conts.every(c => c.discovered === false)).toBe(true);
  });

  // --- truncate2 ----------------------------------------------------------

  test('truncate2 chops at two decimal places (truncates, not rounds)', async ({ game: page }) => {
    expect(await callSetup(page, 'setup.HuntJournal.truncate2(45.999)')).toBe(45.99);
    expect(await callSetup(page, 'setup.HuntJournal.truncate2(45.123)')).toBe(45.12);
    expect(await callSetup(page, 'setup.HuntJournal.truncate2(45)')).toBe(45);
    expect(await callSetup(page, 'setup.HuntJournal.truncate2(0)')).toBe(0);
  });

  // --- Bedroom integration ------------------------------------------------

  test('full flow: hunt → sleep wake → recap shows contenders, not the real ghost', async ({ game: page }) => {
    // Pick a hunt where the real ghost would NOT match the player's
    // (intentionally wrong) evidence checks, so we can assert the recap
    // doesn't reveal the real identity. Real = Wraith, but the player
    // ticked GWB only — Wraith doesn't have GWB, so it must NOT appear.
    await setVar(page, 'mc.sanity', 80);
    await page.evaluate(() => SugarCube.setup.Ghosts.startHunt('Wraith'));
    await page.evaluate(() => SugarCube.setup.HuntJournal.recordHuntStart());
    await setVar(page, 'GWBCheck', true);
    await setVar(page, 'mc.sanity', 50);
    await page.evaluate(() => SugarCube.setup.HuntJournal.recordHuntEnd());
    expect(await callSetup(page, 'setup.HuntJournal.hasUnread()')).toBe(true);

    // Simulate sleepAdvance arming the recap.
    await page.evaluate(() => SugarCube.setup.HuntJournal.armRecap());

    await goToPassage(page, 'Bedroom');
    const passageText = await page.locator('.passage').first().innerText();
    expect(passageText).toContain('Last Night');
    // Recap header for the contender list.
    expect(passageText).toMatch(/Best fits|Possible|Contenders/i);
    // Real ghost (Wraith) does NOT match the logged evidence, so it
    // must not appear in the contender list — confirms the recap is
    // driven by player observations rather than secretly leaking the
    // hunt's true identity.
    expect(passageText).not.toContain('Wraith');
    expect(await callSetup(page, 'setup.HuntJournal.hasUnread()')).toBe(false);
    expect(await callSetup(page, 'setup.HuntJournal.recapArmed()')).toBe(false);
  });

  test('Bedroom does NOT show the recap on a non-sleep visit', async ({ game: page }) => {
    // No armRecap call → walking into Bedroom from Livingroom mid-day
    // should leave the journal alone.
    await page.evaluate(() => SugarCube.setup.Ghosts.startHunt('Shade'));
    await page.evaluate(() => SugarCube.setup.HuntJournal.recordHuntStart());
    await setVar(page, 'EMF5Check', true);
    await page.evaluate(() => SugarCube.setup.HuntJournal.recordHuntEnd());
    expect(await callSetup(page, 'setup.HuntJournal.hasUnread()')).toBe(true);

    await goToPassage(page, 'Bedroom');
    const passageText = await page.locator('.passage').first().innerText();
    expect(passageText).not.toContain('Last Night');
    // Journal data is preserved for the next sleep wake.
    expect(await callSetup(page, 'setup.HuntJournal.hasUnread()')).toBe(true);
  });

  test('recap renders contender hints when the ghost is discovered', async ({ game: page }) => {
    await page.evaluate(() => SugarCube.setup.Ghosts.startHunt('Shade'));
    await page.evaluate(() => SugarCube.setup.HuntJournal.recordHuntStart());
    await setVar(page, 'EMF5Check', true);
    await setVar(page, 'GWBCheck', true);
    await setVar(page, 'TemperatureCheck', true);
    await page.evaluate(() => SugarCube.setup.HuntJournal.recordHuntEnd());
    await page.evaluate(() => SugarCube.setup.Ghosts.markDiscovered('Shade'));
    await page.evaluate(() => SugarCube.setup.HuntJournal.armRecap());

    await goToPassage(page, 'Bedroom');
    const passageText = await page.locator('.passage').first().innerText();
    // The Shade entry's hint mentions sanity.
    expect(passageText.toLowerCase()).toContain('sanity');
  });

  test('recap reflects evidence checked AFTER hunt-end (player updates notebook on the way home)', async ({ game: page }) => {
    // Real failure mode: player gets caught before they have time to
    // tick checkboxes, recordHuntEnd fires with an empty snapshot, then
    // the player walks home / opens the notebook / records what they
    // saw. The recap on the next sleep wake should reflect the
    // *current* notebook state, not the empty snapshot.
    await page.evaluate(() => SugarCube.setup.Ghosts.startHunt('Shade'));
    await page.evaluate(() => SugarCube.setup.HuntJournal.recordHuntStart());

    // Hunt ends BEFORE the player ticks anything.
    await page.evaluate(() => SugarCube.setup.HuntJournal.recordHuntEnd());

    // Now the player opens the notebook and ticks their observations.
    await setVar(page, 'EMF5Check', true);
    await setVar(page, 'GWBCheck', true);

    // Sleep wake → recap.
    await page.evaluate(() => SugarCube.setup.HuntJournal.armRecap());
    await goToPassage(page, 'Bedroom');
    const passageText = await page.locator('.passage').first().innerText();

    expect(passageText).toContain('EMF5');
    expect(passageText).toContain('GhostWritingBook');
  });

  test('logged evidence survives the real Notebook → HuntEnd → Sleep → Bedroom flow', async ({ game: page }) => {
    // Reproduces "logged evidence shows nothing despite there being boxes
    // checked in the book". Walks the actual passages a player would
    // traverse: enter house, open Notebook, tick a checkbox via the UI,
    // run the hunt-end hooks, sleep, then visit Bedroom — recap should
    // surface the ticked evidence.
    await page.evaluate(() => SugarCube.setup.Ghosts.startHunt('Shade'));
    await page.evaluate(() => SugarCube.setup.HuntJournal.recordHuntStart());

    // Real notebook click via the SugarCube checkbox UI.
    await goToPassage(page, 'Notebook');
    // The widget builds checkboxes whose `id` is the receiver var name.
    // EMF5Check sits under .emf wrapper.
    const emfBox = page.locator('.flexwrapperNotebook input[type="checkbox"]').first();
    await emfBox.check();
    // autocheck listener defers state sync one tick.
    await page.waitForFunction(() => SugarCube.State.variables.EMF5Check === true);
    expect(await getVar(page, 'EMF5Check')).toBe(true);

    // Now run the hunt-end + sleep hooks.
    await page.evaluate(() => SugarCube.setup.HuntJournal.recordHuntEnd());
    const ids = await callSetup(page, 'setup.HuntJournal.loggedEvidenceIds()');
    expect(ids).toContain('emf');

    await page.evaluate(() => SugarCube.setup.HuntJournal.armRecap());
    await goToPassage(page, 'Bedroom');
    const passageText = await page.locator('.passage').first().innerText();
    expect(passageText).toContain('EMF5');
  });

  test('recap displays sanity lost truncated to two decimal places', async ({ game: page }) => {
    await setVar(page, 'mc.sanity', 80.999);
    await page.evaluate(() => SugarCube.setup.Ghosts.startHunt('Shade'));
    await page.evaluate(() => SugarCube.setup.HuntJournal.recordHuntStart());
    await setVar(page, 'mc.sanity', 35.123);
    await setVar(page, 'EMF5Check', true);
    await page.evaluate(() => SugarCube.setup.HuntJournal.recordHuntEnd());
    await page.evaluate(() => SugarCube.setup.HuntJournal.armRecap());

    await goToPassage(page, 'Bedroom');
    const passageText = await page.locator('.passage').first().innerText();
    // sanityLost = 80.999 - 35.123 = 45.876 → truncate to 45.87
    expect(passageText).toContain('45.87');
    // No raw float garbage (e.g. 45.875999...) leaking through.
    expect(passageText).not.toMatch(/45\.876\d/);
  });
});
