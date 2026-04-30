const { test, expect } = require('@playwright/test');
const { openGame, resetGame, getVar, goToPassage, callSetup } = require('../helpers');

/* End-to-end rogue lifecycle: GhostStreet → RogueStart → RogueRun
   → RogueEnd → RogueMetaShop. Exercises the actual passage flow
   so any wiring break (missing link text, broken setField call,
   wrong passage transition) shows up here. */
test.describe('E2E: rogue run lifecycle', () => {
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

  test('start from GhostStreet → win the run → spend echoes in meta-shop', async () => {
    test.setTimeout(20_000);

    await goToPassage(page, 'GhostStreet');
    expect(await getVar(page, 'run')).toBeNull();
    expect(await getVar(page, 'echoes')).toBe(0);

    // 1. Launch the run from the GhostStreet rogue card.
    await clickLink(page, 'Rogue Haunt', 'RogueStart');

    // RogueStart auto-rolls the run via setup.Run.startRogue, so $run
    // already exists on entry. Confirm the lifecycle stamps look sane.
    let run = await getVar(page, 'run');
    expect(run).not.toBeNull();
    expect(run.number).toBe(1);
    expect(run.modifiers.length).toBe(2);

    // 2. Enter the haunt (RogueRun).
    await clickLink(page, 'Enter the haunt', 'RogueRun');

    // 3. Win the run.
    await clickLink(page, 'Win', 'RogueEnd');

    // The end-passage clears the run and pays out echoes.
    run = await getVar(page, 'run');
    expect(run).toBeNull();
    const echoes = await getVar(page, 'echoes');
    // 5 base + 5 success + 2 modifiers = 12.
    expect(echoes).toBe(12);
    expect(await getVar(page, 'runsStarted')).toBe(1);

    // 4. Walk into the meta-shop and spend 3 echoes.
    await clickLink(page, 'Visit the meta-shop', 'RogueMetaShop');
    await page.locator('.passage').getByText('Spend 3 echoes (placeholder unlock)', { exact: true }).click();
    // The link uses <<replace>> to rewrite the balance text; wait for
    // the underlying state to reflect the spend instead of polling DOM.
    await page.waitForFunction(() => SugarCube.State.variables.echoes === 9);
  });

  test('losing a run still pays out base + per-modifier echoes', async () => {
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickLink(page, 'Rogue Haunt', 'RogueStart');
    await clickLink(page, 'Enter the haunt', 'RogueRun');
    await clickLink(page, 'Lose', 'RogueEnd');

    // 5 base + 0 success + 2 modifiers = 7.
    expect(await getVar(page, 'echoes')).toBe(7);
    expect(await getVar(page, 'run')).toBeNull();
  });

  test('walking back in mid-run forfeits the prior run as failure', async () => {
    test.setTimeout(15_000);

    // Run 1: start it, then bail back out without finishing.
    await goToPassage(page, 'GhostStreet');
    await clickLink(page, 'Rogue Haunt', 'RogueStart');
    await clickLink(page, 'Enter the haunt', 'RogueRun');
    await goToPassage(page, 'GhostStreet');

    // The card never offers "Resume Run" -- only the fresh-haunt link.
    await expect(
      page.locator('.passage').getByText('Resume Run', { exact: true })
    ).toHaveCount(0);

    // Walking back in pays out failure echoes for run 1, then rolls run 2.
    await clickLink(page, 'Rogue Haunt', 'RogueStart');
    const run = await getVar(page, 'run');
    expect(run.number).toBe(2);
    // Run 1: 5 base + 0 success + 2 modifiers = 7 echoes from the forfeit.
    expect(await getVar(page, 'echoes')).toBe(7);
    expect(await getVar(page, 'runsStarted')).toBe(2);
  });

  test('current-room widget renders furniture + nav links, links advance the player', async () => {
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickLink(page, 'Rogue Haunt', 'RogueStart');
    await clickLink(page, 'Enter the haunt', 'RogueRun');

    // The current-room block should render the player's starting
    // room (the hallway) and at least one exit link the player can
    // click to walk into another room.
    await expect(page.locator('.rogue-current-room')).toBeVisible();
    await expect(
      page.locator('.rogue-current-room').getByText('Current Room: Hallway')
    ).toBeVisible();

    expect(await getVar(page, 'run').then(r => r.currentRoomId)).toBe('room_0');

    // The hallway's neighbours come from the floor plan; click the
    // first one and verify currentRoomId follows.
    const fp = await getVar(page, 'run').then(r => r.floorplan);
    const neighbours = fp.edges
      .filter(e => e[0] === 'room_0' || e[1] === 'room_0')
      .map(e => e[0] === 'room_0' ? e[1] : e[0]);
    expect(neighbours.length).toBeGreaterThan(0);

    const firstNeighbourId = neighbours[0];
    const firstNeighbour = fp.rooms.find(r => r.id === firstNeighbourId);
    const tLabel = await callSetup(page, `setup.Templates.byId("${firstNeighbour.template}").label`);

    await page.locator('.rogue-current-room')
      .getByText(tLabel, { exact: true })
      .first()
      .click();
    await page.waitForFunction(
      id => SugarCube.State.variables.run.currentRoomId === id,
      firstNeighbourId
    );
  });

  test('two consecutive runs increment runsStarted across the lifecycle', async () => {
    test.setTimeout(20_000);

    await goToPassage(page, 'GhostStreet');

    // Run 1: win.
    await clickLink(page, 'Rogue Haunt', 'RogueStart');
    await clickLink(page, 'Enter the haunt', 'RogueRun');
    await clickLink(page, 'Win', 'RogueEnd');
    expect(await getVar(page, 'runsStarted')).toBe(1);
    expect(await getVar(page, 'echoes')).toBe(12);

    // Run 2: lose.
    await clickLink(page, 'Visit the meta-shop', 'RogueMetaShop');
    await clickLink(page, 'Start a new run', 'RogueStart');
    const run2 = await getVar(page, 'run');
    expect(run2.number).toBe(2);
    await clickLink(page, 'Enter the haunt', 'RogueRun');
    await clickLink(page, 'Lose', 'RogueEnd');
    expect(await getVar(page, 'runsStarted')).toBe(2);
    // 12 (run 1) + 7 (run 2 fail) = 19.
    expect(await getVar(page, 'echoes')).toBe(19);
  });
});
