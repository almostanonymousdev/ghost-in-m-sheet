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
    await clickLink(page, 'Flee the hunt', 'RogueEnd');

    expect(await getVar(page, 'run')).toBeNull();
    // Failure payout: 5 base + 0 success + 2 modifiers = 7.
    expect(await getVar(page, 'echoes')).toBe(7);
    await expect(
      page.locator('.passage').getByText(/door at your back/i)
    ).toBeVisible();
  });

  test('Identify with the correct ghost wins the run', async () => {
    await startRun(page);
    const ghost = await callSetup(page, 'setup.Rogue.ghostName()');

    await clickLink(page, 'Outside', 'RogueOutside');
    await clickLink(page, 'Identify the ghost', 'RogueIdentify');

    // The dropdown is bound to $ghostTypeSelected; set it directly to the
    // correct answer instead of driving the native <select>.
    await page.evaluate((name) => {
      SugarCube.State.variables.ghostTypeSelected = name;
    }, ghost);

    await page.locator('.passage').getByText('Choose', { exact: true }).click();
    await expect(
      page.locator('.passage').getByText(/right call/i)
    ).toBeVisible();
    expect(await callSetup(page, 'setup.Rogue.field("outcome")')).toBe('success');

    await clickLink(page, 'Close the run', 'RogueEnd');
    expect(await getVar(page, 'run')).toBeNull();
    // 5 base + 5 success + 2 modifiers = 12.
    expect(await getVar(page, 'echoes')).toBe(12);
  });

  test('Identify with the wrong ghost ends the run as a "wrongGhost" failure', async () => {
    await startRun(page);
    const ghost = await callSetup(page, 'setup.Rogue.ghostName()');
    const wrong = await page.evaluate((name) =>
      SugarCube.setup.Ghosts.names().find(n => n !== name), ghost);

    await clickLink(page, 'Outside', 'RogueOutside');
    await clickLink(page, 'Identify the ghost', 'RogueIdentify');

    await page.evaluate((name) => {
      SugarCube.State.variables.ghostTypeSelected = name;
    }, wrong);

    await page.locator('.passage').getByText('Choose', { exact: true }).click();
    await expect(
      page.locator('.passage').getByText(/wrong name/i)
    ).toBeVisible();
    expect(await callSetup(page, 'setup.Rogue.field("outcome")')).toBe('failure');
    expect(await callSetup(page, 'setup.Rogue.field("failureReason")')).toBe('wrongGhost');

    await clickLink(page, 'Close the run', 'RogueEnd');
    expect(await getVar(page, 'run')).toBeNull();
    expect(await getVar(page, 'echoes')).toBe(7);
    await expect(
      page.locator('.passage').getByText(/haunt still uncalled/i)
    ).toBeVisible();
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
