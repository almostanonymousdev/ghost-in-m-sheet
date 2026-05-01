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

    // RogueStart auto-rolls the run via setup.Rogue.startRogue, so $run
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

  test('RogueRun layout: minimap top-left, exits in toolbar, exits advance the player', async () => {
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickLink(page, 'Rogue Haunt', 'RogueStart');
    await clickLink(page, 'Enter the haunt', 'RogueRun');

    // Player starts in the hallway (room_0).
    expect(await getVar(page, 'run').then(r => r.currentRoomId)).toBe('room_0');

    // Layout slots are populated:
    //   - top-left holds the minimap SVG
    //   - top-right holds Win / Lose / Abandon
    //   - bottom-right toolbar slot holds the exit nav links (no
    //     "Exits" header -- the links speak for themselves)
    await expect(page.locator('.rogue-run-tl .rogue-minimap-svg')).toBeVisible();
    await expect(
      page.locator('.rogue-run-tr').getByText('Win', { exact: true })
    ).toBeVisible();
    expect(await page.locator('.rogue-run-nav a').count()).toBeGreaterThan(0);

    // Click the first hallway neighbour from the Exits column and verify
    // currentRoomId follows.
    const fp = await getVar(page, 'run').then(r => r.floorplan);
    const neighbours = fp.edges
      .filter(e => e[0] === 'room_0' || e[1] === 'room_0')
      .map(e => e[0] === 'room_0' ? e[1] : e[0]);
    expect(neighbours.length).toBeGreaterThan(0);

    const firstNeighbourId = neighbours[0];
    const firstNeighbour = fp.rooms.find(r => r.id === firstNeighbourId);
    const tLabel = await callSetup(page, `setup.Templates.byId("${firstNeighbour.template}").label`);

    await page.locator('.rogue-run-nav')
      .getByText(tLabel, { exact: true })
      .first()
      .click();
    await page.waitForFunction(
      id => SugarCube.State.variables.run.currentRoomId === id,
      firstNeighbourId
    );
  });

  test('toolbar renders one card per setup.searchToolOrder entry', async () => {
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickLink(page, 'Rogue Haunt', 'RogueStart');
    await clickLink(page, 'Enter the haunt', 'RogueRun');

    const toolOrder = await callSetup(page, 'setup.searchToolOrder');
    expect(toolOrder.length).toBe(6);
    await expect(page.locator('.rogue-run-tools .rogue-tool-card'))
      .toHaveCount(toolOrder.length);
  });

  test('startRogue stamps a ghost on $run and Ghosts.active() returns it', async () => {
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickLink(page, 'Rogue Haunt', 'RogueStart');

    const run = await getVar(page, 'run');
    expect(run.ghostName).toBeTruthy();

    // No witch contract is open, but setup.Ghosts.active() must hand
    // back the rogue ghost so the shared <<toolCheck>> path can read
    // its evidence list.
    const activeName = await callSetup(page, 'setup.Ghosts.active().name');
    expect(activeName).toBe(run.ghostName);

    // Same ghost is reachable via the rogue-side accessor.
    const rogueGhostName = await callSetup(page, 'setup.Rogue.ghostName()');
    expect(rogueGhostName).toBe(run.ghostName);
  });

  test('isGhostHere() is true only inside the lair room during RogueRun', async () => {
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickLink(page, 'Rogue Haunt', 'RogueStart');
    await clickLink(page, 'Enter the haunt', 'RogueRun');

    // Player starts in room_0 (hallway); the lair is whichever room
    // the floor-plan generator picked as the spawn (always non-hallway).
    const ghostRoom = await callSetup(page, 'setup.Rogue.ghostRoomId()');
    expect(ghostRoom).not.toBe('room_0');

    // Outside the lair: false.
    expect(await callSetup(page, 'setup.isGhostHere()')).toBe(false);

    // Walk into the lair and re-render the passage, then re-check.
    await page.evaluate(id => SugarCube.setup.Rogue.setCurrentRoom(id), ghostRoom);
    await goToPassage(page, 'RogueRun');
    expect(await callSetup(page, 'setup.isGhostHere()')).toBe(true);
  });

  test('clicking a tool advances time and replaces the link with a result', async () => {
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickLink(page, 'Rogue Haunt', 'RogueStart');
    await clickLink(page, 'Enter the haunt', 'RogueRun');

    // Baseline: GhostStreet resets to midnight.
    expect(await getVar(page, 'minutes')).toBe(0);

    // Each tool card has a clickable label that wikifies <<toolCheck>>
    // when clicked. Pick the EMF card -- it never possesses, never
    // navigates away, and renders a deterministic <<coloredText>> span.
    const emfCard = page.locator('.rogue-tool-card').first();
    await expect(emfCard.locator('a')).toHaveCount(1);
    await emfCard.locator('a').click();

    // Time burned by one tick.
    expect(await getVar(page, 'minutes')).toBe(1);

    // Linkreplace strips the <a> once the body wikifies, so the card
    // no longer offers a clickable target -- proves the body fired.
    await expect(emfCard.locator('a')).toHaveCount(0);
  });


  test('furniture strip renders one icon per template slot for the current room', async () => {
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickLink(page, 'Rogue Haunt', 'RogueStart');
    await clickLink(page, 'Enter the haunt', 'RogueRun');

    // The hallway template has 3 furniture suffixes; each renders an
    // icon in the .rogue-run-furniture strip.
    const hallwayFurniture = await callSetup(page, 'setup.Templates.byId("hallway").furniture');
    expect(hallwayFurniture.length).toBeGreaterThan(0);
    await expect(page.locator('.rogue-run-furniture .rogue-furniture-item'))
      .toHaveCount(hallwayFurniture.length);
  });

  test('furniture row no longer shows loot kind labels (no spoilers)', async () => {
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickLink(page, 'Rogue Haunt', 'RogueStart');
    // Walk into the room that holds the cursed-item loot so the row
    // would have rendered a "Cursed item" label under the old layout.
    const fp = await getVar(page, 'run').then(r => r.floorplan);
    const cursedRoom = fp.loot.cursedItem;
    await page.evaluate(id => SugarCube.setup.Rogue.setCurrentRoom(id), cursedRoom);
    await goToPassage(page, 'RogueRun');

    // The deprecated label class should not appear in the DOM.
    await expect(page.locator('.rogue-furniture-loot')).toHaveCount(0);
    // Plain-text spoiler check too.
    await expect(
      page.locator('.rogue-run-furniture').getByText(/Cursed item/i)
    ).toHaveCount(0);
  });

  test('clicking the loot furniture finds the item and marks it collected', async () => {
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickLink(page, 'Rogue Haunt', 'RogueStart');

    // Place the player in the room+slot the cursed item is hidden in.
    // The floor-plan generator might land cursedItem on a furniture-
    // less template (roomA/B/C); skip past those so the click target
    // is always a real slot. We only need *some* loot kind pinned
    // to a furniture suffix to exercise the search wiring.
    const fp = await getVar(page, 'run').then(r => r.floorplan);
    const lootKind = Object.keys(fp.lootFurniture).find(k => fp.lootFurniture[k]);
    expect(lootKind).toBeDefined();
    const lootRoom      = fp.loot[lootKind];
    const lootFurniture = fp.lootFurniture[lootKind];
    await page.evaluate(id => SugarCube.setup.Rogue.setCurrentRoom(id), lootRoom);
    await goToPassage(page, 'RogueRun');

    // Each loot kind has its own line in FurnitureSearch.tw; pick
    // the one this run rolled.
    const LOOT_TEXT = {
      cursedItem:  /cursed item/i,
      rescueClue:  /clue about one of the missing women/i,
      tarotCards:  /strange deck of tarot cards/i,
      monkeyPaw:   /withered monkey's paw/i
    };

    // Click the loot furniture slot. Its label is humanised; pull
    // it from the controller so we click the right one.
    const fLabel = await callSetup(page,
      `setup.Rogue.currentRoomData().furniture.find(f => f.suffix === "${lootFurniture}").label`);
    await page.locator('.rogue-furniture-item')
      .filter({ hasText: fLabel })
      .first()
      .click();
    await page.waitForFunction(() => SugarCube.State.passage === 'FurnitureSearch');
    await expect(
      page.locator('.passage').getByText(LOOT_TEXT[lootKind])
    ).toBeVisible();

    // takeLoot should have been called.
    expect(await callSetup(page, `setup.Rogue.hasCollected("${lootKind}")`)).toBe(true);

    // Walking back to the same slot should now find nothing.
    await clickLink(page, 'Back', 'RogueRun');
    await page.locator('.rogue-furniture-item')
      .filter({ hasText: fLabel })
      .first()
      .click();
    await page.waitForFunction(() => SugarCube.State.passage === 'FurnitureSearch');
    await expect(
      page.locator('.passage').getByText(/nothing of note/i)
    ).toBeVisible();
  });

  test('searching furniture advances the clock by one minute', async () => {
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickLink(page, 'Rogue Haunt', 'RogueStart');
    await clickLink(page, 'Enter the haunt', 'RogueRun');

    // GhostStreet resets to midnight; verify we start at 00:00.
    expect(await getVar(page, 'hours')).toBe(0);
    expect(await getVar(page, 'minutes')).toBe(0);

    // Click any furniture in the hallway.
    await page.locator('.rogue-furniture-item').first().click();
    await page.waitForFunction(() => SugarCube.State.passage === 'FurnitureSearch');

    // Each search should burn one in-game minute, mirroring regular hunts.
    expect(await getVar(page, 'minutes')).toBe(1);
    expect(await getVar(page, 'hours')).toBe(0);
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
    await clickLink(page, 'Continue hunting', 'RogueStart');
    const run2 = await getVar(page, 'run');
    expect(run2.number).toBe(2);
    await clickLink(page, 'Enter the haunt', 'RogueRun');
    await clickLink(page, 'Lose', 'RogueEnd');
    expect(await getVar(page, 'runsStarted')).toBe(2);
    // 12 (run 1) + 7 (run 2 fail) = 19.
    expect(await getVar(page, 'echoes')).toBe(19);
  });
});
