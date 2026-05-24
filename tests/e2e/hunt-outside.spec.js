const { test, expect } = require('@playwright/test');
const { openGame, resetGame, getVar, setVar, goToPassage, callSetup, ensureOpenPage } = require('../helpers');

/* HuntOutside / HuntIdentify: from the hunt hallway, the player can
   step Outside and choose to identify the ghost, flee the haunt, or
   walk back in. The Outside link is hallway-gated; the menu options
   settle the run via endHunt() inline and goto the appropriate exit
   passage (CityMap on success/abandon, HuntOverProwl on a wrong call). */
test.describe('E2E: Hunt Outside menu', () => {
  let page;
  let savedBrowser;

  test.beforeAll(async ({ browser }) => {
    savedBrowser = browser;
    page = await openGame(browser);
  });

  test.afterAll(async () => {
    if (page && !page.isClosed()) await page.close();
  });

  test.beforeEach(async () => {
    /* Self-heal if the renderer crashed during a prior test — see
       fixtures.js for the equivalent logic on the shared `game` fixture. */
    page = await ensureOpenPage(savedBrowser, page);
    try {
      await resetGame(page);
    } catch (err) {
      page = await openGame(savedBrowser);
      await resetGame(page);
    }
  });

  async function clickLink(page, linkText, expectedPassage) {
    await page.locator('.passage').getByText(linkText, { exact: true }).first().click();
    await page.waitForFunction(p => SugarCube.State.passage === p, expectedPassage);
  }

  async function startRun(page, opts) {
    await page.evaluate((o) => SugarCube.setup.HuntController.startHunt(o || { seed: 1 }), opts);
    await goToPassage(page, 'HuntRun');
  }

  test('Outside link is rendered in the hallway', async () => {
    await startRun(page);
    expect(await getVar(page, 'run').then(r => r.currentRoomId)).toBe('room_0');
    await expect(
      page.locator('.hunt-run-nav').getByText('Outside', { exact: true })
    ).toBeVisible();
  });

  test('Outside link is NOT rendered in non-hallway rooms', async () => {
    await startRun(page);
    // Walk to a non-hallway neighbour.
    const fp = await getVar(page, 'run').then(r => r.floorplan);
    const neighbour = fp.edges
      .filter(e => e[0] === 'room_0' || e[1] === 'room_0')
      .map(e => e[0] === 'room_0' ? e[1] : e[0])
      .find(id => fp.rooms.find(r => r.id === id && r.template !== 'hallway'));
    expect(neighbour).toBeDefined();
    await page.evaluate(id => SugarCube.setup.HuntController.setCurrentRoom(id), neighbour);
    await goToPassage(page, 'HuntRun');
    await expect(
      page.locator('.hunt-run-nav').getByText('Outside', { exact: true })
    ).toHaveCount(0);
  });

  test('clicking Outside routes to HuntOutside with the menu options', async () => {
    await startRun(page);
    await clickLink(page, 'Outside', 'HuntOutside');
    await expect(
      page.locator('.passage').getByText('Identify the ghost', { exact: true })
    ).toBeVisible();
    await expect(
      page.locator('.passage').getByText('Flee the hunt', { exact: true })
    ).toBeVisible();
    await expect(
      page.locator('.passage').getByText('Go back inside', { exact: true })
    ).toBeVisible();
  });

  test('Go back inside returns to HuntRun (hallway, run still active)', async () => {
    await startRun(page);
    await clickLink(page, 'Outside', 'HuntOutside');
    await clickLink(page, 'Go back inside', 'HuntRun');
    expect(await getVar(page, 'run').then(r => r.currentRoomId)).toBe('room_0');
    expect(await callSetup(page, 'setup.HuntController.isActive()')).toBe(true);
  });

  test('Flee the hunt ends the run as failure with reason "fled"', async () => {
    await startRun(page);
    await clickLink(page, 'Outside', 'HuntOutside');
    const ectoBefore = await getVar(page, 'ectoplasm');
    /* Flee is a voluntary walk-away: endHunt pays no consolation
       ectoplasm (and no XP). Routes straight to CityMap (the
       HuntSummary intermediary was removed). */
    await clickLink(page, 'Flee the hunt', 'CityMap');

    expect(await getVar(page, 'run')).toBeNull();
    expect(await getVar(page, 'ectoplasm')).toBe(ectoBefore);
  });

  test('Choose routes through the prep beat to HuntIdentifyResolve', async () => {
    await startRun(page);
    await clickLink(page, 'Outside', 'HuntOutside');
    await clickLink(page, 'Identify the ghost', 'HuntIdentify');
    await clickLink(page, 'Choose', 'HuntIdentifyResolve');
    await expect(
      page.locator('.passage').getByText(/set your jaw and walk back in/i)
    ).toBeVisible();
  });

  test('Identify with the correct ghost reveals the peaceful fade and closes the run on Continue', async () => {
    test.setTimeout(20_000);
    await startRun(page);
    const ghost = await callSetup(page, 'setup.HuntController.ghostName()');

    await clickLink(page, 'Outside', 'HuntOutside');
    await clickLink(page, 'Identify the ghost', 'HuntIdentify');

    // The dropdown is bound to $ghostTypeSelected; set it directly to the
    // correct answer instead of driving the native <select>.
    await page.evaluate((name) => {
      SugarCube.State.variables.ghostTypeSelected = name;
    }, ghost);

    await clickLink(page, 'Choose', 'HuntIdentifyResolve');

    /* The correct-guess branch settles the run inline (endHunt) BEFORE
       the reveal text + Go-home button appear, so snapshot the payout
       before the timed reveal fires (the active modifier deck zeroes
       out on endHunt) and verify after the goto. */
    const expectedSuccess = await page.evaluate(() =>
      Math.round(10 * SugarCube.setup.Modifiers.payoutMultiplier()));

    // Prep beat is visible immediately; the reveal is gated on a 6s
    // <<timed>> block.
    await expect(
      page.locator('.passage').getByText(/shape thins out and goes/i)
    ).toBeVisible({ timeout: 10_000 });
    expect(await callSetup(page, 'setup.HuntController.isActive()')).toBe(false);

    await clickLink(page, 'Go home', 'CityMap');
    expect(await getVar(page, 'run')).toBeNull();
    expect(await getVar(page, 'ectoplasm')).toBe(expectedSuccess);
  });

  test('Identify with the wrong ghost routes into HuntOverProwl and ends as caught', async () => {
    test.setTimeout(20_000);
    await startRun(page);
    const ghost = await callSetup(page, 'setup.HuntController.ghostName()');
    const wrong = await page.evaluate((name) =>
      SugarCube.setup.Ghosts.names().find(n => n !== name), ghost);

    await clickLink(page, 'Outside', 'HuntOutside');
    await clickLink(page, 'Identify the ghost', 'HuntIdentify');

    await page.evaluate((name) => {
      SugarCube.State.variables.ghostTypeSelected = name;
    }, wrong);

    await clickLink(page, 'Choose', 'HuntIdentifyResolve');

    // Wait for the timed reveal to surface the wrong-guess line.
    await expect(
      page.locator('.passage').getByText(/wrong call/i)
    ).toBeVisible({ timeout: 10_000 });

    // The reveal now names the real ghost and lists its evidence so the
    // player knows what they missed.
    const trueLabels = await callSetup(
      page,
      'setup.HuntController.activeGhost().evidenceLabels()'
    );
    await expect(
      page.locator('.passage').getByText(new RegExp(ghost, 'i'))
    ).toBeVisible();
    for (const label of trueLabels.split(/,\s*/)) {
      await expect(
        page.locator('.passage').getByText(label, { exact: false })
      ).toBeVisible();
    }

    // Continue routes to HuntOverProwl; the run is still alive at that point
    // (huntBlackoutExit -> huntCaughtPassage closes it on the next click).
    await clickLink(page, 'Continue', 'HuntOverProwl');
    expect(await callSetup(page, 'setup.HuntController.isActive()')).toBe(true);

    // huntCaughtPassage settles the run (endHunt) before returning a
    // goto target; the player now lands on Sleep, which routes
    // through the bedroom cum-covered wake-up.
    const target = await callSetup(page, 'setup.HuntController.huntCaughtPassage()');
    expect(target).toBe('Sleep');
    expect(await callSetup(page, 'setup.HuntController.isActive()')).toBe(false);
  });

  test('HuntIdentify Back link returns to HuntOutside', async () => {
    await startRun(page);
    await clickLink(page, 'Outside', 'HuntOutside');
    await clickLink(page, 'Identify the ghost', 'HuntIdentify');
    await clickLink(page, 'Back', 'HuntOutside');
    expect(await callSetup(page, 'setup.HuntController.isActive()')).toBe(true);
  });

  test('HuntOutside without an active run shows the empty-state fallback', async () => {
    await goToPassage(page, 'HuntOutside');
    await expect(
      page.locator('.passage').getByText(/no active hunt/i)
    ).toBeVisible();
  });

  test('HuntIdentify without an active run shows the empty-state fallback', async () => {
    await goToPassage(page, 'HuntIdentify');
    await expect(
      page.locator('.passage').getByText(/no active hunt/i)
    ).toBeVisible();
  });

  /* Exhibitionism gate on HuntOutside: a low-exhibitionism MC (< 5)
     who is exposed (bottomless and/or top-bare with a stolen piece
     available to recover) refuses to settle the run from the yard.
     The identify/contract/flee options drop out and only "Go back
     inside" remains. Mirrors the same gate in HuntOverExhaustion. */
  async function stripBottomAndStash(page) {
    await page.evaluate(() => {
      const V = SugarCube.State.variables;
      const NW = SugarCube.setup.ClothingState.NOT_WORN;
      const WORN = SugarCube.setup.ClothingState.WORN;
      V.tshirtState  = WORN;
      V.braState     = WORN;
      V.jeansState   = NW;
      V.shortsState  = NW;
      V.skirtState   = NW;
      V.pantiesState = NW;
      V.isPantiesStolen = true;
      V.isBottomStolen  = false;
      V.isShirtStolen   = false;
      V.isBraStolen     = false;
      V.isClothesStolen = true;
    });
  }

  test('low exhibitionism + bottom stripped: leave options hidden, only Go back inside remains', async () => {
    await startRun(page);
    await stripBottomAndStash(page);
    await setVar(page, 'mc.exhibitionism', 0);

    await clickLink(page, 'Outside', 'HuntOutside');

    await expect(
      page.locator('.passage').getByText('Identify the ghost', { exact: true })
    ).toHaveCount(0);
    await expect(
      page.locator('.passage').getByText('Take your findings to Khadija', { exact: true })
    ).toHaveCount(0);
    await expect(
      page.locator('.passage').getByText('Flee the hunt', { exact: true })
    ).toHaveCount(0);
    await expect(
      page.locator('.passage').getByText('Go back inside', { exact: true })
    ).toBeVisible();
    expect(await callSetup(page, 'setup.HuntController.isActive()')).toBe(true);

    // The single remaining link still walks the MC back into the hallway.
    await clickLink(page, 'Go back inside', 'HuntRun');
    expect(await callSetup(page, 'setup.HuntController.isActive()')).toBe(true);
  });

  test('high exhibitionism + bottom stripped: full leave menu still rendered', async () => {
    await startRun(page);
    await stripBottomAndStash(page);
    await setVar(page, 'mc.exhibitionism', 5);

    await clickLink(page, 'Outside', 'HuntOutside');

    await expect(
      page.locator('.passage').getByText('Identify the ghost', { exact: true })
    ).toBeVisible();
    await expect(
      page.locator('.passage').getByText('Flee the hunt', { exact: true })
    ).toBeVisible();
    await expect(
      page.locator('.passage').getByText('Go back inside', { exact: true })
    ).toBeVisible();
  });

  test('low exhibitionism + fully clothed: gate does not fire, full menu rendered', async () => {
    await startRun(page);
    await page.evaluate(() => {
      const V = SugarCube.State.variables;
      const WORN = SugarCube.setup.ClothingState.WORN;
      const NW = SugarCube.setup.ClothingState.NOT_WORN;
      V.tshirtState  = WORN;
      V.braState     = WORN;
      V.jeansState   = WORN;
      V.shortsState  = NW;
      V.skirtState   = NW;
      V.pantiesState = WORN;
      V.isPantiesStolen = false;
      V.isBottomStolen  = false;
      V.isShirtStolen   = false;
      V.isBraStolen     = false;
      V.isClothesStolen = false;
    });
    await setVar(page, 'mc.exhibitionism', 0);

    await clickLink(page, 'Outside', 'HuntOutside');

    await expect(
      page.locator('.passage').getByText('Identify the ghost', { exact: true })
    ).toBeVisible();
    await expect(
      page.locator('.passage').getByText('Flee the hunt', { exact: true })
    ).toBeVisible();
  });

  test('low exhibitionism + top stripped + still has bottoms: top-only gate fires', async () => {
    await startRun(page);
    await page.evaluate(() => {
      const V = SugarCube.State.variables;
      const WORN = SugarCube.setup.ClothingState.WORN;
      const NW = SugarCube.setup.ClothingState.NOT_WORN;
      V.tshirtState  = NW;
      V.braState     = NW;
      V.jeansState   = WORN;
      V.shortsState  = NW;
      V.skirtState   = NW;
      V.pantiesState = WORN;
      V.isPantiesStolen = false;
      V.isBottomStolen  = false;
      V.isShirtStolen   = true;
      V.isBraStolen     = false;
      V.isClothesStolen = true;
    });
    await setVar(page, 'mc.exhibitionism', 0);

    await clickLink(page, 'Outside', 'HuntOutside');

    await expect(
      page.locator('.passage').getByText('Identify the ghost', { exact: true })
    ).toHaveCount(0);
    await expect(
      page.locator('.passage').getByText('Flee the hunt', { exact: true })
    ).toHaveCount(0);
    await expect(
      page.locator('.passage').getByText('Go back inside', { exact: true })
    ).toBeVisible();
  });
});
