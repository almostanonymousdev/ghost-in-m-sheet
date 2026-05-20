const { test, expect } = require('../fixtures');
const { setVar, getVar, callSetup, goToPassage } = require('../helpers');
const { expectCleanPassage } = require('./e2e-helpers');

/* Browser-side coverage for the "return to Khadija to call the ghost"
   flow. Each test rebuilds the same minimal state by hand instead of
   walking the full intro -> witch -> haunt route because every step on
   that route has its own side effects (time advance, RNG draw, sanity
   tick). The pieces we actually want to exercise are:

     1. HuntOutside identify fork (contract vs rogue link)
     2. WitchInside pending-contract surface link
     3. WitchEndContract dropdown gate
     4. WitchEndContractResolve correct / wrong paths
     5. Re-entry: the player can leave the witch's desk and come back

   The default shop state has firstVisitWitchShop = true; that branch
   prints the long onboarding monologue and doesn't surface the
   pending-contract link. Every test below flips that flag off via
   setup.Witch.markShopVisited() so we land on the regular branch. */

async function setupContractHunt(page, houseId) {
  await page.evaluate(() => { SugarCube.setup.Witch.markShopVisited(); });
  await page.evaluate(id => {
    SugarCube.setup.WitchContract.cheatGrantContract(id);
  }, houseId);
  await page.evaluate(id => {
    SugarCube.setup.HuntController.startHunt({ seed: 1, staticHouseId: id });
  }, houseId);
  /* The shop dialog reads $mc.lvl for several side conversations. Pin
     it to 0 so the only optional link rendered on WitchInside is the
     pending-contract one we're testing. */
  await setVar(page, 'mc.lvl', 0);
  /* Keep the clock in the small hours -- TickController's dawn
     intercept (`if (isMorningPlus && isHunting) goto HuntOverTime`)
     fires from any passage at hours >= 6 while the hunt is active.
     The contract resolution doesn't advance time, so hour 2 stays
     night across the whole walk back to Khadija. */
  await setVar(page, 'hours', 2);
  await setVar(page, 'minutes', 0);
}

test.describe('WitchInside — pending contract surface link', () => {
  test('renders "You have findings from Owaissa" link when contract is pending', async ({ game: page }) => {
    await setupContractHunt(page, 'owaissa');
    await goToPassage(page, 'WitchInside');
    const text = await page.locator('#passages').innerText();
    expect(text).toMatch(/You have findings from .*Owaissa/i);
    await expectCleanPassage(page);
  });

  test('renders "findings from Elm" link when held key matches elm', async ({ game: page }) => {
    await setupContractHunt(page, 'elm');
    await goToPassage(page, 'WitchInside');
    const text = await page.locator('#passages').innerText();
    expect(text).toMatch(/You have findings from .*Elm/i);
    await expectCleanPassage(page);
  });

  test('no pending link when no contract is held', async ({ game: page }) => {
    await page.evaluate(() => { SugarCube.setup.Witch.markShopVisited(); });
    await setVar(page, 'hours', 12);
    await setVar(page, 'minutes', 0);
    await goToPassage(page, 'WitchInside');
    const text = await page.locator('#passages').innerText();
    expect(text).not.toMatch(/You have findings from/i);
    await expectCleanPassage(page);
  });

  test('no pending link when contract is held but no hunt active', async ({ game: page }) => {
    /* Holding a key without an active hunt -- shouldn't surface the
       "findings" prompt either. The link presupposes the player just
       walked out of the haunt with the key still in their pocket. */
    await page.evaluate(() => { SugarCube.setup.Witch.markShopVisited(); });
    await page.evaluate(() => SugarCube.setup.WitchContract.cheatGrantContract('owaissa'));
    await setVar(page, 'hours', 12);
    await setVar(page, 'minutes', 0);
    await goToPassage(page, 'WitchInside');
    const text = await page.locator('#passages').innerText();
    expect(text).not.toMatch(/You have findings from/i);
    await expectCleanPassage(page);
  });

  test('no pending link when held key targets a different house than the run', async ({ game: page }) => {
    /* Owaissa key held, elm run active -- the run is rogue from the
       contract system's POV (heldHouseId !== staticHouseId). The
       findings link should NOT surface; the player would resolve elm
       via HuntIdentify instead. */
    await page.evaluate(() => { SugarCube.setup.Witch.markShopVisited(); });
    await page.evaluate(() => SugarCube.setup.WitchContract.cheatGrantContract('owaissa'));
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1, staticHouseId: 'elm' }));
    /* Hunt is active -- keep hours in night zone or TickController
       redirects to HuntOverTime before WitchInside finishes rendering. */
    await setVar(page, 'hours', 2);
    await setVar(page, 'minutes', 0);
    await goToPassage(page, 'WitchInside');
    const text = await page.locator('#passages').innerText();
    expect(text).not.toMatch(/You have findings from/i);
    await expectCleanPassage(page);
  });
});

test.describe('HuntOutside — identify fork', () => {
  test('contract hunt routes the identify link at "Take your findings to Khadija"', async ({ game: page }) => {
    await setupContractHunt(page, 'owaissa');
    await goToPassage(page, 'HuntOutside');
    const text = await page.locator('#passages').innerText();
    expect(text).toContain('Take your findings to Khadija');
    expect(text).not.toContain('Identify the ghost');
    await expectCleanPassage(page);
  });

  test('rogue hunt (no held key) routes the identify link at HuntIdentify', async ({ game: page }) => {
    await page.evaluate(() => { SugarCube.setup.Witch.markShopVisited(); });
    /* startHunt with no staticHouseId -> procedural floor plan, no
       contract. modifierCount: 0 avoids drawing modifiers (some have
       side-effects on outside dialog). */
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1, modifierCount: 0 }));
    await goToPassage(page, 'HuntOutside');
    const text = await page.locator('#passages').innerText();
    expect(text).toContain('Identify the ghost');
    expect(text).not.toContain('Take your findings to Khadija');
    await expectCleanPassage(page);
  });

  test('rogue hunt with mismatched held key still routes to HuntIdentify', async ({ game: page }) => {
    /* Hold owaissa, run elm -- per the truth table, identify must fall
       through to the rogue path. */
    await page.evaluate(() => { SugarCube.setup.Witch.markShopVisited(); });
    await page.evaluate(() => SugarCube.setup.WitchContract.cheatGrantContract('owaissa'));
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1, staticHouseId: 'elm' }));
    await goToPassage(page, 'HuntOutside');
    const text = await page.locator('#passages').innerText();
    expect(text).toContain('Identify the ghost');
    expect(text).not.toContain('Take your findings to Khadija');
    await expectCleanPassage(page);
  });

  test('no active hunt collapses HuntOutside to the back-to-CityMap branch', async ({ game: page }) => {
    await goToPassage(page, 'HuntOutside');
    const text = await page.locator('#passages').innerText();
    expect(text).toContain('No active hunt');
    await expectCleanPassage(page);
  });
});

test.describe('WitchEndContract — dropdown gate', () => {
  test('renders ghost dropdown + name-the-ghost button when contract is pending', async ({ game: page }) => {
    await setupContractHunt(page, 'owaissa');
    await goToPassage(page, 'WitchEndContract');
    /* The dropdown is bound to $ghostTypeSelected via SugarCube's
       <<listbox>>. SugarCube renders that as a <select>; we don't pin
       the test to its id (id auto-gen has shifted between SugarCube
       releases), just that the passage contains one and that it's
       populated with every ghost name. */
    const selectCount = await page.locator('#passages select').count();
    expect(selectCount).toBeGreaterThan(0);
    const optionCount = await page.locator('#passages select option').count();
    const ghostCount = await page.evaluate(() => SugarCube.setup.Ghosts.names().length);
    expect(optionCount).toBe(ghostCount);
    const text = await page.locator('#passages').innerText();
    expect(text).toContain('Name the ghost');
    expect(text).toContain('Not yet');
    await expectCleanPassage(page);
  });

  test('shows the house label in Khadija\'s line', async ({ game: page }) => {
    /* "Well? <house>. What was in there." -- the house label drives
       the prompt so the player knows which contract they're closing
       out. Owaissa = "10100 Owaissa Cresent", Elm = "1500 Elm Drive". */
    await setupContractHunt(page, 'owaissa');
    await goToPassage(page, 'WitchEndContract');
    const label = await page.evaluate(() => SugarCube.setup.HuntHouses.byId('owaissa').label);
    expect(await page.locator('#passages').innerText()).toContain(label);

    await page.evaluate(() => SugarCube.setup.HuntController.endHunt(false));
    await setupContractHunt(page, 'elm');
    await goToPassage(page, 'WitchEndContract');
    const elmLabel = await page.evaluate(() => SugarCube.setup.HuntHouses.byId('elm').label);
    expect(await page.locator('#passages').innerText()).toContain(elmLabel);
  });

  test('collapses to "Nothing to report" when no contract is held', async ({ game: page }) => {
    await page.evaluate(() => { SugarCube.setup.Witch.markShopVisited(); });
    await goToPassage(page, 'WitchEndContract');
    const text = await page.locator('#passages').innerText();
    expect(text).toContain('Nothing to report');
    /* The dropdown must not render -- there's no contract to resolve. */
    await expect(page.locator('#passages select')).toHaveCount(0);
    await expectCleanPassage(page);
  });

  test('collapses to "Nothing to report" when hunt is not active', async ({ game: page }) => {
    /* Held key but no run -- shouldn't render the guess UI. The
       resolve passage gates on both flags too. */
    await page.evaluate(() => { SugarCube.setup.Witch.markShopVisited(); });
    await page.evaluate(() => SugarCube.setup.WitchContract.cheatGrantContract('owaissa'));
    await goToPassage(page, 'WitchEndContract');
    expect(await page.locator('#passages').innerText()).toContain('Nothing to report');
    await expect(page.locator('#passages select')).toHaveCount(0);
    await expectCleanPassage(page);
  });
});

test.describe('WitchEndContractResolve — correct guess', () => {
  test('correct guess pays contract cash, clears held key, ends the hunt', async ({ game: page }) => {
    await setupContractHunt(page, 'owaissa');
    await setVar(page, 'mc.money', 0);
    const trueName = await callSetup(page, 'setup.HuntController.ghostName()');
    await setVar(page, 'ghostTypeSelected', trueName);

    await goToPassage(page, 'WitchEndContractResolve');

    const text = await page.locator('#passages').innerText();
    expect(text).toMatch(/Good\. Money on the way/i);
    expect(text).toContain(`+$200`);
    /* Cash paid to MC. */
    expect(await getVar(page, 'mc.money')).toBe(200);
    /* Held slot empty + hunt cleared down. */
    expect(await callSetup(page, 'setup.WitchContract.hasHeldContract()')).toBe(false);
    expect(await callSetup(page, 'setup.HuntController.isActive()')).toBe(false);
    await expectCleanPassage(page);
  });

  test('correct guess on elm pays the higher contract payout', async ({ game: page }) => {
    await setupContractHunt(page, 'elm');
    await setVar(page, 'mc.money', 0);
    const trueName = await callSetup(page, 'setup.HuntController.ghostName()');
    await setVar(page, 'ghostTypeSelected', trueName);

    await goToPassage(page, 'WitchEndContractResolve');

    expect(await getVar(page, 'mc.money')).toBe(500); // elm contract payout
    expect(await callSetup(page, 'setup.WitchContract.hasHeldContract()')).toBe(false);
    await expectCleanPassage(page);
  });

  test('correct guess does NOT pay ectoplasm (contract hunts are cash-only)', async ({ game: page }) => {
    await setupContractHunt(page, 'owaissa');
    const ectoBefore = await callSetup(page, 'setup.HuntController.ectoplasm()');
    const trueName = await callSetup(page, 'setup.HuntController.ghostName()');
    await setVar(page, 'ghostTypeSelected', trueName);

    await goToPassage(page, 'WitchEndContractResolve');

    /* Cash branch on, but ectoplasm balance unchanged. */
    expect(await callSetup(page, 'setup.HuntController.ectoplasm()')).toBe(ectoBefore);
    await expectCleanPassage(page);
  });

  test('correct guess shows the +exp line', async ({ game: page }) => {
    await setupContractHunt(page, 'owaissa');
    const trueName = await callSetup(page, 'setup.HuntController.ghostName()');
    await setVar(page, 'ghostTypeSelected', trueName);

    await goToPassage(page, 'WitchEndContractResolve');
    expect(await page.locator('#passages').innerText()).toMatch(/\+\d+\s*exp/);
    await expectCleanPassage(page);
  });

  test('Back link from WitchEndContractResolve points at WitchInside', async ({ game: page }) => {
    await setupContractHunt(page, 'owaissa');
    const trueName = await callSetup(page, 'setup.HuntController.ghostName()');
    await setVar(page, 'ghostTypeSelected', trueName);
    await goToPassage(page, 'WitchEndContractResolve');
    /* The .backbtn link routes back to WitchInside so the player can
       continue browsing the shop after closing the contract. */
    await page.locator('#passages').getByText('Back', { exact: true }).first().click();
    await page.waitForFunction(() =>
      SugarCube.State.passage === 'WitchInside'
    );
    expect(await page.evaluate(() => SugarCube.State.passage)).toBe('WitchInside');
    await expectCleanPassage(page);
  });
});

test.describe('WitchEndContractResolve — wrong guess', () => {
  test('wrong guess burns the key, pays nothing, ends the hunt', async ({ game: page }) => {
    await setupContractHunt(page, 'owaissa');
    await setVar(page, 'mc.money', 0);
    const trueName = await callSetup(page, 'setup.HuntController.ghostName()');
    const wrongName = await page.evaluate(real => {
      const other = SugarCube.setup.Ghosts.list().find(g => g.name !== real);
      return other ? other.name : null;
    }, trueName);
    await setVar(page, 'ghostTypeSelected', wrongName);

    await goToPassage(page, 'WitchEndContractResolve');

    const text = await page.locator('#passages').innerText();
    expect(text).toContain("Key's spent");
    expect(text).toContain('No payout');
    expect(await getVar(page, 'mc.money')).toBe(0);
    expect(await callSetup(page, 'setup.WitchContract.hasHeldContract()')).toBe(false);
    expect(await callSetup(page, 'setup.HuntController.isActive()')).toBe(false);
    expect(await getVar(page, 'run')).toBeFalsy();
    await expectCleanPassage(page);
  });

  test('wrong guess prints the true ghost name + evidence', async ({ game: page }) => {
    /* The "It was a <ghost>. <evidence labels>." line is the player's
       only debrief on what they missed; without it, wrong calls
       become opaque. */
    await setupContractHunt(page, 'elm');
    const trueName = await callSetup(page, 'setup.HuntController.ghostName()');
    const wrongName = await page.evaluate(real => {
      const other = SugarCube.setup.Ghosts.list().find(g => g.name !== real);
      return other ? other.name : null;
    }, trueName);
    await setVar(page, 'ghostTypeSelected', wrongName);

    await goToPassage(page, 'WitchEndContractResolve');
    const text = await page.locator('#passages').innerText();
    expect(text).toContain(trueName);
    await expectCleanPassage(page);
  });

  test('wrong guess does NOT pay ectoplasm either', async ({ game: page }) => {
    await setupContractHunt(page, 'owaissa');
    const ectoBefore = await callSetup(page, 'setup.HuntController.ectoplasm()');
    const trueName = await callSetup(page, 'setup.HuntController.ghostName()');
    const wrongName = await page.evaluate(real => {
      const other = SugarCube.setup.Ghosts.list().find(g => g.name !== real);
      return other ? other.name : null;
    }, trueName);
    await setVar(page, 'ghostTypeSelected', wrongName);

    await goToPassage(page, 'WitchEndContractResolve');
    expect(await callSetup(page, 'setup.HuntController.ectoplasm()')).toBe(ectoBefore);
    await expectCleanPassage(page);
  });

  test('wrong guess stamps WRONG_CALL failure reason on the closed run', async ({ game: page }) => {
    /* $run is cleared by endHunt, so we can't read run.failureReason
       after the resolve passage. Instead, set up + walk to the
       resolve passage with a wrong guess, then check the FailureReason
       constant matches the enum so the WRONG_CALL identity is wired
       through. (The unit-test sibling covers the runtime stamp.) */
    await setupContractHunt(page, 'owaissa');
    expect(await page.evaluate(() => SugarCube.setup.HuntController.FailureReason.WRONG_CALL))
      .toBe('wrong_call');
  });
});

test.describe('WitchEndContract — navigation continuity', () => {
  test('"Not yet" link from WitchEndContract returns to WitchInside without resolving', async ({ game: page }) => {
    /* The player can back out of the dropdown without spending the
       key. After clicking "Not yet", we should land on WitchInside
       with the contract still held and the hunt still active. */
    await setupContractHunt(page, 'owaissa');
    await goToPassage(page, 'WitchEndContract');
    /* "Not yet -- let me think" is the back link. */
    await page.locator('#passages').getByText('Not yet -- let me think', { exact: true }).first().click();
    await page.waitForFunction(() => SugarCube.State.passage === 'WitchInside');

    expect(await callSetup(page, 'setup.WitchContract.hasHeldContract()')).toBe(true);
    expect(await callSetup(page, 'setup.HuntController.isActive()')).toBe(true);
    /* And the pending link is still surfaced -- the player can resume
       guessing whenever they're ready. */
    expect(await page.locator('#passages').innerText()).toMatch(/You have findings from/i);
    await expectCleanPassage(page);
  });

  test('player can browse the shop while a contract is pending and the link persists', async ({ game: page }) => {
    /* Open WitchInside, walk to WitchSale, walk back -- the pending
       link should still be there. The hunt is paused at this point,
       not ended; only the resolve passage tears it down. */
    await setupContractHunt(page, 'owaissa');
    await setVar(page, 'mc.money', 100);

    await goToPassage(page, 'WitchInside');
    expect(await page.locator('#passages').innerText()).toMatch(/You have findings from/i);

    await goToPassage(page, 'WitchSale');
    await expectCleanPassage(page);

    await goToPassage(page, 'WitchInside');
    /* Hunt + contract still alive. */
    expect(await callSetup(page, 'setup.WitchContract.hasHeldContract()')).toBe(true);
    expect(await callSetup(page, 'setup.HuntController.isActive()')).toBe(true);
    expect(await page.locator('#passages').innerText()).toMatch(/You have findings from/i);
    await expectCleanPassage(page);
  });

  test('pending link disappears after the contract is resolved (success)', async ({ game: page }) => {
    await setupContractHunt(page, 'owaissa');
    const trueName = await callSetup(page, 'setup.HuntController.ghostName()');
    await setVar(page, 'ghostTypeSelected', trueName);

    await goToPassage(page, 'WitchEndContractResolve');
    await goToPassage(page, 'WitchInside');

    /* Sanity: held cleared and link gone. */
    expect(await callSetup(page, 'setup.WitchContract.hasHeldContract()')).toBe(false);
    expect(await page.locator('#passages').innerText()).not.toMatch(/You have findings from/i);
    await expectCleanPassage(page);
  });

  test('pending link disappears after a wrong guess too', async ({ game: page }) => {
    await setupContractHunt(page, 'elm');
    const trueName = await callSetup(page, 'setup.HuntController.ghostName()');
    const wrongName = await page.evaluate(real => {
      const other = SugarCube.setup.Ghosts.list().find(g => g.name !== real);
      return other ? other.name : null;
    }, trueName);
    await setVar(page, 'ghostTypeSelected', wrongName);

    await goToPassage(page, 'WitchEndContractResolve');
    await goToPassage(page, 'WitchInside');

    expect(await callSetup(page, 'setup.WitchContract.hasHeldContract()')).toBe(false);
    expect(await page.locator('#passages').innerText()).not.toMatch(/You have findings from/i);
    await expectCleanPassage(page);
  });

  test('clicking the pending link from WitchInside navigates to WitchEndContract', async ({ game: page }) => {
    await setupContractHunt(page, 'owaissa');
    await goToPassage(page, 'WitchInside');
    /* The pending link text is "You have findings from <house>." --
       click any element matching that prose. */
    await page.locator('#passages')
      .getByText(/You have findings from/i)
      .first()
      .click();
    await page.waitForFunction(() => SugarCube.State.passage === 'WitchEndContract');
    expect(await page.evaluate(() => SugarCube.State.passage)).toBe('WitchEndContract');
    await expectCleanPassage(page);
  });
});
