const { test, expect } = require('@playwright/test');
const { openGame, resetGame, getVar, goToPassage, callSetup, ensureOpenPage } = require('../helpers');

/* HuntOutside / HuntIdentify: from the hunt hallway, the player can
   step Outside and choose to identify the ghost, flee the haunt, or
   walk back in. The Outside link is hallway-gated; the menu options
   route through the same HuntSummary lifecycle exit the win/lose links
   already use. */
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
    /* Snapshot the expected failure payout BEFORE Flee triggers
       endHunt (which clears $run and zeroes the active modifier
       deck). Failure payout = round(failure_base * deck multiplier);
       failure_base is 3 in setup.HuntController.endHunt, and the multiplier
       compounds the per-modifier payoutMultiplier values from the
       active deck. Computing it from the live API keeps the test
       robust against retuned modifier rates. */
    const expected = await page.evaluate(() =>
      Math.round(3 * SugarCube.setup.Modifiers.payoutMultiplier()));
    await clickLink(page, 'Flee the hunt', 'HuntSummary');

    expect(await getVar(page, 'run')).toBeNull();
    expect(await getVar(page, 'ectoplasm')).toBe(expected);
    await expect(
      page.locator('.passage').getByText(/door at your back/i)
    ).toBeVisible();
  });

  test('Choose routes through the prep beat to HuntIdentifyResolve', async () => {
    await startRun(page);
    await clickLink(page, 'Outside', 'HuntOutside');
    await clickLink(page, 'Identify the ghost', 'HuntIdentify');
    await clickLink(page, 'Choose', 'HuntIdentifyResolve');
    await expect(
      page.locator('.passage').getByText(/confidently re-enter/i)
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

    // Prep beat is visible immediately; the reveal is gated on a 6s
    // <<timed>> block.
    await expect(
      page.locator('.passage').getByText(/fades peacefully/i)
    ).toBeVisible({ timeout: 10_000 });
    expect(await callSetup(page, 'setup.HuntController.field("outcome")')).toBe('success');

    const expectedSuccess = await page.evaluate(() =>
      Math.round(10 * SugarCube.setup.Modifiers.payoutMultiplier()));
    await clickLink(page, 'Continue', 'HuntSummary');
    expect(await getVar(page, 'run')).toBeNull();
    expect(await getVar(page, 'ectoplasm')).toBe(expectedSuccess);
  });

  test('Identify with the wrong ghost routes into HuntEnd and ends as caught', async () => {
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
      page.locator('.passage').getByText(/heart sinks/i)
    ).toBeVisible({ timeout: 10_000 });

    // Continue routes to HuntEnd; the run is still alive at that point
    // (huntEndExit -> huntCaughtPassage closes it on the next click).
    await clickLink(page, 'Continue', 'HuntEnd');
    expect(await callSetup(page, 'setup.HuntController.isActive()')).toBe(true);

    // huntCaughtPassage stamps the failure reason on the run as soon as
    // it's invoked (well before HuntSummary consumes it).
    const target = await callSetup(page, 'setup.HuntController.huntCaughtPassage()');
    expect(target).toBe('HuntSummary');
    expect(await callSetup(page, 'setup.HuntController.field("outcome")')).toBe('failure');
    expect(await callSetup(page, 'setup.HuntController.field("failureReason")')).toBe('caught');
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
});
