const { test, expect } = require('@playwright/test');
const { openGame, resetGame, getVar, goToPassage, callSetup } = require('../helpers');

/* RogueOutside / RogueIdentify: from the rogue hallway, the player can
   step Outside and choose to identify the ghost, flee the haunt, or
   walk back in. The Outside link is hallway-gated; the menu options
   route through the same RogueEnd lifecycle exit the win/lose links
   already use. */
test.describe('E2E: rogue Outside menu', () => {
  let page;

  test.beforeAll(async ({ browser }) => {
    page = await openGame(browser);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test.beforeEach(async () => {
    await resetGame(page);
  });

  async function clickLink(page, linkText, expectedPassage) {
    await page.locator('.passage').getByText(linkText, { exact: true }).first().click();
    await page.waitForFunction(p => SugarCube.State.passage === p, expectedPassage);
  }

  async function startRun(page, opts) {
    await page.evaluate((o) => SugarCube.setup.Rogue.startRogue(o || { seed: 1 }), opts);
    await goToPassage(page, 'RogueRun');
  }

  test('Outside link is rendered in the hallway', async () => {
    await startRun(page);
    expect(await getVar(page, 'run').then(r => r.currentRoomId)).toBe('room_0');
    await expect(
      page.locator('.rogue-run-nav').getByText('Outside', { exact: true })
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
    await page.evaluate(id => SugarCube.setup.Rogue.setCurrentRoom(id), neighbour);
    await goToPassage(page, 'RogueRun');
    await expect(
      page.locator('.rogue-run-nav').getByText('Outside', { exact: true })
    ).toHaveCount(0);
  });

  test('clicking Outside routes to RogueOutside with the menu options', async () => {
    await startRun(page);
    await clickLink(page, 'Outside', 'RogueOutside');
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

  test('Go back inside returns to RogueRun (hallway, run still active)', async () => {
    await startRun(page);
    await clickLink(page, 'Outside', 'RogueOutside');
    await clickLink(page, 'Go back inside', 'RogueRun');
    expect(await getVar(page, 'run').then(r => r.currentRoomId)).toBe('room_0');
    expect(await callSetup(page, 'setup.Rogue.isRogue()')).toBe(true);
  });

  test('Flee the hunt ends the run as failure with reason "fled"', async () => {
    await startRun(page);
    await clickLink(page, 'Outside', 'RogueOutside');
    /* Snapshot the expected failure payout BEFORE Flee triggers
       endRogue (which clears $run and zeroes the active modifier
       deck). Failure payout = round(failure_base * deck multiplier);
       failure_base is 3 in setup.Rogue.endRogue, and the multiplier
       compounds the per-modifier payoutMultiplier values from the
       active deck. Computing it from the live API keeps the test
       robust against retuned modifier rates. */
    const expected = await page.evaluate(() =>
      Math.round(3 * SugarCube.setup.Modifiers.payoutMultiplier()));
    await clickLink(page, 'Flee the hunt', 'RogueEnd');

    expect(await getVar(page, 'run')).toBeNull();
    expect(await getVar(page, 'ectoplasm')).toBe(expected);
    await expect(
      page.locator('.passage').getByText(/door at your back/i)
    ).toBeVisible();
  });

  test('Choose routes through the prep beat to RogueIdentifyResolve', async () => {
    await startRun(page);
    await clickLink(page, 'Outside', 'RogueOutside');
    await clickLink(page, 'Identify the ghost', 'RogueIdentify');
    await clickLink(page, 'Choose', 'RogueIdentifyResolve');
    await expect(
      page.locator('.passage').getByText(/confidently re-enter/i)
    ).toBeVisible();
  });

  test('Identify with the correct ghost reveals the peaceful fade and closes the run on Continue', async () => {
    test.setTimeout(20_000);
    await startRun(page);
    const ghost = await callSetup(page, 'setup.Rogue.ghostName()');

    await clickLink(page, 'Outside', 'RogueOutside');
    await clickLink(page, 'Identify the ghost', 'RogueIdentify');

    // The dropdown is bound to $ghostTypeSelected; set it directly to the
    // correct answer instead of driving the native <select>.
    await page.evaluate((name) => {
      SugarCube.State.variables.ghostTypeSelected = name;
    }, ghost);

    await clickLink(page, 'Choose', 'RogueIdentifyResolve');

    // Prep beat is visible immediately; the reveal is gated on a 6s
    // <<timed>> block.
    await expect(
      page.locator('.passage').getByText(/fades peacefully/i)
    ).toBeVisible({ timeout: 10_000 });
    expect(await callSetup(page, 'setup.Rogue.field("outcome")')).toBe('success');

    const expectedSuccess = await page.evaluate(() =>
      Math.round(10 * SugarCube.setup.Modifiers.payoutMultiplier()));
    await clickLink(page, 'Continue', 'RogueEnd');
    expect(await getVar(page, 'run')).toBeNull();
    expect(await getVar(page, 'ectoplasm')).toBe(expectedSuccess);
  });

  test('Identify with the wrong ghost routes into HuntEnd and ends as caught', async () => {
    test.setTimeout(20_000);
    await startRun(page);
    const ghost = await callSetup(page, 'setup.Rogue.ghostName()');
    const wrong = await page.evaluate((name) =>
      SugarCube.setup.Ghosts.names().find(n => n !== name), ghost);

    await clickLink(page, 'Outside', 'RogueOutside');
    await clickLink(page, 'Identify the ghost', 'RogueIdentify');

    await page.evaluate((name) => {
      SugarCube.State.variables.ghostTypeSelected = name;
    }, wrong);

    await clickLink(page, 'Choose', 'RogueIdentifyResolve');

    // Wait for the timed reveal to surface the wrong-guess line.
    await expect(
      page.locator('.passage').getByText(/heart sinks/i)
    ).toBeVisible({ timeout: 10_000 });

    // Continue routes to HuntEnd; the run is still alive at that point
    // (huntEndExit -> huntCaughtPassage closes it on the next click).
    await clickLink(page, 'Continue', 'HuntEnd');
    expect(await callSetup(page, 'setup.Rogue.isRogue()')).toBe(true);

    // huntCaughtPassage stamps the failure reason on the run as soon as
    // it's invoked (well before RogueEnd consumes it).
    const target = await callSetup(page, 'setup.HuntController.huntCaughtPassage()');
    expect(target).toBe('RogueEnd');
    expect(await callSetup(page, 'setup.Rogue.field("outcome")')).toBe('failure');
    expect(await callSetup(page, 'setup.Rogue.field("failureReason")')).toBe('caught');
  });

  test('RogueIdentify Back link returns to RogueOutside', async () => {
    await startRun(page);
    await clickLink(page, 'Outside', 'RogueOutside');
    await clickLink(page, 'Identify the ghost', 'RogueIdentify');
    await clickLink(page, 'Back', 'RogueOutside');
    expect(await callSetup(page, 'setup.Rogue.isRogue()')).toBe(true);
  });

  test('RogueOutside without an active run shows the empty-state fallback', async () => {
    await goToPassage(page, 'RogueOutside');
    await expect(
      page.locator('.passage').getByText(/no active rogue run/i)
    ).toBeVisible();
  });

  test('RogueIdentify without an active run shows the empty-state fallback', async () => {
    await goToPassage(page, 'RogueIdentify');
    await expect(
      page.locator('.passage').getByText(/no active rogue run/i)
    ).toBeVisible();
  });
});
