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

  /* Strip the Empty Bag modifier from the active rogue run if the
     random draft happened to pick it. Tests that need a clickable
     toolbar call this after RogueStart's auto-roll. The other
     modifiers don't yet gate per-tick behaviour, so dropping just
     locked_tools doesn't bypass anything else under test. */
  async function ensureNotEmptyBag(page) {
    await page.evaluate(() => {
      const run = SugarCube.State.variables.run;
      if (run && Array.isArray(run.modifiers)) {
        run.modifiers = run.modifiers.filter(id => id !== 'locked_tools');
      }
    });
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
    await ensureNotEmptyBag(page);
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

  test('clicking a tool advances time and renders into the top-center tray', async () => {
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickLink(page, 'Rogue Haunt', 'RogueStart');
    await ensureNotEmptyBag(page);
    await clickLink(page, 'Enter the haunt', 'RogueRun');

    // Baseline: GhostStreet resets to midnight.
    expect(await getVar(page, 'minutes')).toBe(0);

    // The top-center result tray exists and is empty until a tool fires.
    const tray = page.locator('#rogue-tool-result');
    await expect(tray).toHaveCount(1);
    await expect(tray).toBeEmpty();

    // Each tool card has a clickable label that wikifies <<toolCheck>>
    // into the tray on click. Pick the EMF card -- it never possesses,
    // never navigates away, and renders a deterministic <<coloredText>>
    // span. The tool card itself stays put; only the tray gains content,
    // and the link remains clickable so the player can re-fire the tool.
    const emfCard = page.locator('.rogue-tool-card').first();
    await expect(emfCard.locator('a')).toHaveCount(1);
    await emfCard.locator('a').click();

    // Time burned by one tick.
    expect(await getVar(page, 'minutes')).toBe(1);

    // Result landed in the top-center tray, not inline under the tool card.
    // EMF's render path emits a <<coloredText>> span (.boldText), so the
    // tray gains exactly one of those and the tool card stays clean.
    await expect(tray).not.toBeEmpty();
    await expect(tray.locator('.boldText')).toHaveCount(1);
    await expect(emfCard.locator('.boldText')).toHaveCount(0);

    // Re-clicking the same tool advances time again and overwrites the
    // tray with a fresh reading rather than appending to it.
    await emfCard.locator('a').click();
    expect(await getVar(page, 'minutes')).toBe(2);
    await expect(tray.locator('.boldText')).toHaveCount(1);
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

  test('per-tick chain runs on tool click: applies stat drains and time', async () => {
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickLink(page, 'Rogue Haunt', 'RogueStart');
    await ensureNotEmptyBag(page);
    await clickLink(page, 'Enter the haunt', 'RogueRun');

    /* Pin event randomness off so the click only exercises the
       per-tick drain branch (not Event / StealClothes / GhostHuntEvent
       gotos). The chain still calls Event but rollProwlEvent's
       chance-roll is gated on Math.random; pre-seeding all rolls
       to 1.0 keeps every roll above its threshold. */
    await page.evaluate(() => { Math.random = () => 0.99; });

    // Snapshot the starting MC state.
    const before = await page.evaluate(() => {
      const mc = SugarCube.State.variables.mc;
      return { energy: mc.energy, sanity: mc.sanity };
    });

    // One EMF click should fire <<huntTickStep>> -> applyTickEffects ->
    // energy -0.125, sanity -<contractDrain> (0.4 baseline) and burn 1
    // in-game minute.
    await page.locator('.rogue-tool-card').first().locator('a').click();

    const after = await page.evaluate(() => {
      const mc = SugarCube.State.variables.mc;
      return { energy: mc.energy, sanity: mc.sanity };
    });
    expect(after.energy).toBeLessThan(before.energy);
    expect(after.sanity).toBeLessThan(before.sanity);
    expect(await getVar(page, 'minutes')).toBe(1);
  });

  test('per-tick chain runs on nav click and burns one in-game minute', async () => {
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickLink(page, 'Rogue Haunt', 'RogueStart');
    await clickLink(page, 'Enter the haunt', 'RogueRun');
    await page.evaluate(() => { Math.random = () => 0.99; });

    expect(await getVar(page, 'minutes')).toBe(0);

    // Click the first nav exit.
    await page.locator('.rogue-run-nav a').first().click();
    await page.waitForFunction(() => SugarCube.State.variables.minutes >= 1);
    expect(await getVar(page, 'minutes')).toBe(1);
  });

  test('sanity collapse during a rogue tool tick routes to RogueEnd as failure', async () => {
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickLink(page, 'Rogue Haunt', 'RogueStart');
    await ensureNotEmptyBag(page);
    await clickLink(page, 'Enter the haunt', 'RogueRun');
    await page.evaluate(() => { Math.random = () => 0.99; });

    // Set the MC up so the next tick will collapse sanity.
    await page.evaluate(() => { SugarCube.State.variables.mc.sanity = 0.1; });

    await page.locator('.rogue-tool-card').first().locator('a').click();

    // The chain should goto huntOverPassage("sanity") -> RogueEnd.
    await page.waitForFunction(() => SugarCube.State.passage === 'RogueEnd');

    // The run is closed and stamped with the sanity reason.
    expect(await getVar(page, 'run')).toBeNull();
    await expect(
      page.locator('.passage').getByText(/sanity gone/i)
    ).toBeVisible();
  });

  test('per-tick chain in rogue triggers GhostHuntEvent when shouldStartRandomProwl fires', async () => {
    test.setTimeout(15_000);

    /* The huntTickStep widget calls huntTickEventChain, which goes
       through HuntController.shouldStartRandomProwl. With timer
       state pre-stamped past the threshold and Math.random pinned
       low, a single tool tick should land on GhostHuntEvent. */
    await goToPassage(page, 'GhostStreet');
    await clickLink(page, 'Rogue Haunt', 'RogueStart');
    await ensureNotEmptyBag(page);
    await clickLink(page, 'Enter the haunt', 'RogueRun');

    await page.evaluate(() => {
      const V = SugarCube.State.variables;
      V.prowlActivated = 0;
      V.prowlTimeRemain = 0;
      V.elapsedTimeProwl = 0;
      V.prowlActivationTime = 0;
      V.mc.sanity = 30; // satisfies every sanity-cutoff ghost
      V.mc.lust = 60;   // satisfies lust-condition ghosts too
      V.mc.energy = 5;  // keep applyTickEffects from triggering exhaustion
      // Pin the rogue ghost to Shade so its prowlCondition (sanity<=55) trips.
      SugarCube.setup.Rogue.setField('ghostName', 'Shade');
      // Force every Math.random call to 0 so:
      //   - LightPassageGhost roll: 0 (no light flicker dest)
      //   - rollProwlEvent's various rolls all round-trip: chance=0,
      //     bansheeRoll/ctRoll = 1 (≠ 1 disables those branches),
      //     body part roll picks the first option.
      //   - shouldTriggerSteal: roll 1, > stealChance? -- with
      //     mc.sanity=30 stealChance ≈ 1.6, so 1 <= 1.6 may trigger
      //     steal first. Force stealChance to 0 to keep the steal
      //     gate closed and let the random-hunt gate fire.
      V.stealChance = 0;
      Math.random = () => 0;
    });

    // Click any tool. The chain runs synchronously inside the link
    // body and may <<goto>> us to GhostHuntEvent / EventMC / StealClothes
    // depending on which roll trips first. Any of those is a valid
    // "the per-tick chain DID fire sanity-driven side content".
    await page.locator('.rogue-tool-card').first().locator('a').click();
    await page.waitForFunction(() =>
      ['GhostHuntEvent', 'EventMC', 'StealClothes'].includes(SugarCube.State.passage),
      null,
      { timeout: 10_000 }
    );
    expect(await getVar(page, 'run')).not.toBeNull();
  });

  test('hunt-survival options in GhostHuntEvent are reachable in rogue mode', async () => {
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickLink(page, 'Rogue Haunt', 'RogueStart');
    await clickLink(page, 'Enter the haunt', 'RogueRun');

    // Drop straight into the hunt event UI.
    await goToPassage(page, 'GhostHuntEvent');
    await expect(
      page.locator('.passage').getByText('Run away', { exact: true })
    ).toBeVisible();
    await expect(
      page.locator('.passage').getByText('Try to hide', { exact: true })
    ).toBeVisible();
    // FreezeHunt is conditionally shown based on garments worn; the
    // generic "Freeze and let it pass" prefix appears in both branches.
    await expect(
      page.locator('.passage').getByText(/Freeze and let it pass/i)
    ).toBeVisible();
  });

  test('PrayHunt (with energy) returns to RogueRun via $return in rogue mode', async () => {
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickLink(page, 'Rogue Haunt', 'RogueStart');
    await clickLink(page, 'Enter the haunt', 'RogueRun');

    // Pre-load enough sanity / energy so PrayHunt doesn't bail out
    // through a hunt-over passage.
    await page.evaluate(() => {
      SugarCube.State.variables.mc.sanity = 80;
      SugarCube.State.variables.mc.energy = 4;
    });

    await goToPassage(page, 'PrayHunt');
    await page.locator('.passage').getByText('Continue').first().click();
    await page.waitForFunction(() => SugarCube.State.passage === 'RogueRun');
  });

  test('FreezeHunt with no garments routes to RogueEnd as a "sanity" failure in rogue mode', async () => {
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickLink(page, 'Rogue Haunt', 'RogueStart');
    await clickLink(page, 'Enter the haunt', 'RogueRun');

    // Strip the MC bare so FreezeHunt's "nothing left to give" branch fires.
    await page.evaluate(() => {
      SugarCube.setup.Wardrobe.stripToNaked();
    });
    await goToPassage(page, 'FreezeHunt');

    // The "Surrender to the cold" link delegates its target to
    // setup.HuntController.huntOverPassage("sanity") which returns
    // "RogueEnd" in rogue mode and stamps failureReason="sanity"
    // on the run before it's cleared by RogueEnd's endRogue call.
    // We assert on the RogueEnd-rendered text since the run record
    // is null by the time the assertion runs.
    await page.locator('.passage').getByText(/Surrender to the cold/i).click();
    await page.waitForFunction(() => SugarCube.State.passage === 'RogueEnd');

    expect(await getVar(page, 'run')).toBeNull();
    await expect(
      page.locator('.passage').getByText(/sanity gone/i)
    ).toBeVisible();
  });

  test('Empty Bag modifier collapses the rogue toolbar to a placeholder', async () => {
    test.setTimeout(15_000);

    /* The toolbar reads from setup.Rogue.startingTools(), which folds
       Empty Bag ('locked_tools') down to []. The widget renders the
       "your bag is empty" placeholder instead of the six tool cards. */
    await page.evaluate(() => {
      SugarCube.setup.Rogue.startRogue({
        seed: 1, modifiers: ['locked_tools'], modifierCount: 0
      });
      // startRogue overwrites modifiers from the draft; pin to just
      // locked_tools so we know the bag is empty for sure.
      SugarCube.State.variables.run.modifiers = ['locked_tools'];
    });
    await goToPassage(page, 'RogueRun');

    await expect(page.locator('.rogue-run-tools .rogue-tool-card')).toHaveCount(1);
    await expect(page.locator('.rogue-run-tools .rogue-tool-card-empty'))
      .toBeVisible();
    await expect(page.locator('.rogue-run-tools a')).toHaveCount(0);
  });

  test('loadout.tools restricts the rogue toolbar to the listed tools', async () => {
    test.setTimeout(15_000);

    await page.evaluate(() => {
      SugarCube.setup.Rogue.startRogue({
        seed: 1,
        loadout: { tools: ['emf', 'uvl'] }
      });
    });
    await goToPassage(page, 'RogueRun');

    // Two cards rendered (in canonical order: emf before uvl).
    await expect(page.locator('.rogue-run-tools .rogue-tool-card')).toHaveCount(2);
    await expect(page.locator('.rogue-run-tools a').first())
      .toContainText(/EMF/);
    await expect(page.locator('.rogue-run-tools a').nth(1))
      .toContainText(/UVL/);
  });

  test('rogue ghost catch routes through HuntEnd → RogueEnd as a "caught" failure', async () => {
    test.setTimeout(20_000);

    /* HuntEnd's bottom-of-passage cleanup runs through
       setup.HuntController.onCaughtCleanup() and the huntEndExit
       widget routes its post-scene exit through huntCaughtPassage();
       in rogue mode that stamps a "caught" failure and returns
       "RogueEnd". The e2e check here is that those helpers route
       a real run end-to-end -- the widget rendering + linkappend
       fan-out is covered by the classic hunt-flow tests. */
    await goToPassage(page, 'GhostStreet');
    await clickLink(page, 'Rogue Haunt', 'RogueStart');
    await clickLink(page, 'Enter the haunt', 'RogueRun');

    // huntCaughtPassage() in rogue mode stamps the failure reason
    // and returns the destination passage.
    const target = await callSetup(page, 'setup.HuntController.huntCaughtPassage()');
    expect(target).toBe('RogueEnd');
    expect(await callSetup(page, 'setup.Rogue.field("outcome")')).toBe('failure');
    expect(await callSetup(page, 'setup.Rogue.field("failureReason")')).toBe('caught');

    // onCaughtCleanup is a no-op in rogue (cleanup happens on
    // RogueEnd via setup.Rogue.endRogue) -- crucially, it must NOT
    // try to call setup.HauntedHouses.endHunt() (which would crash
    // when $hunt is null).
    await page.evaluate(() => SugarCube.setup.HuntController.onCaughtCleanup());
    expect(await callSetup(page, 'setup.Rogue.isRogue()')).toBe(true);

    // Walking into RogueEnd closes the run as a failure.
    await goToPassage(page, 'RogueEnd');
    expect(await getVar(page, 'run')).toBeNull();
    // Failure payout: 5 base + 0 success + 2 modifiers = 7 echoes.
    expect(await getVar(page, 'echoes')).toBe(7);
    await expect(
      page.locator('.passage').getByText(/ends in failure/i)
    ).toBeVisible();
  });

  test('ghost-room drift fires for the rogue ghost across 20-minute intervals', async () => {
    test.setTimeout(15_000);

    /* PassageDone calls setup.HuntController.shuffleGhostRoom which
       gates on a 20-minute interval and a 45% roll. We start a run,
       force the roll to 0 (drift fires) and walk the clock through
       interval boundaries; the ghost room must end up somewhere
       different from where it started. */
    await goToPassage(page, 'GhostStreet');
    await clickLink(page, 'Rogue Haunt', 'RogueStart');
    await ensureNotEmptyBag(page);
    await clickLink(page, 'Enter the haunt', 'RogueRun');

    // Pin the rogue ghost to one that DOES drift (not Goryo).
    await page.evaluate(() => {
      SugarCube.setup.Rogue.setField('ghostName', 'Shade');
    });

    const initial = await callSetup(page, 'setup.Rogue.ghostRoomId()');

    // Force a fresh interval window + the drift roll.
    await page.evaluate(() => {
      SugarCube.State.variables.lastChangeIntervalRoom = '';
      SugarCube.State.variables.minutes = 25; // 20-39 window
      Math.random = () => 0;
    });
    await page.evaluate(() => SugarCube.setup.HuntController.shuffleGhostRoom());

    // Drift should have moved the ghost (since Math.random=0 < 0.45)
    // to a non-hallway room different from `initial` (when more than
    // one non-hallway room exists in the seed=5 plan).
    const fp = await callSetup(page, 'setup.Rogue.field("floorplan")');
    const nonHallwayCount = fp.rooms.filter(r => r.template !== 'hallway').length;
    if (nonHallwayCount > 1) {
      expect(await callSetup(page, 'setup.Rogue.ghostRoomId()')).not.toBe(initial);
    }
    // Either way, the new room is non-hallway.
    const ghostRoom = await callSetup(page, 'setup.Rogue.ghostRoomId()');
    const newRoom = fp.rooms.find(r => r.id === ghostRoom);
    expect(newRoom.template).not.toBe('hallway');
  });

  test('Goryo (staysInOneRoom) never drifts in rogue mode', async () => {
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickLink(page, 'Rogue Haunt', 'RogueStart');
    await ensureNotEmptyBag(page);
    await clickLink(page, 'Enter the haunt', 'RogueRun');

    // Pin the rogue ghost to Goryo, which has staysInOneRoom = true.
    await page.evaluate(() => {
      SugarCube.setup.Rogue.setField('ghostName', 'Goryo');
    });

    const initial = await callSetup(page, 'setup.Rogue.ghostRoomId()');

    // Even with the roll forced + a fresh interval, Goryo's lair
    // mustn't move.
    await page.evaluate(() => {
      SugarCube.State.variables.lastChangeIntervalRoom = '';
      SugarCube.State.variables.minutes = 25;
      Math.random = () => 0;
    });
    await page.evaluate(() => SugarCube.setup.HuntController.shuffleGhostRoom());

    expect(await callSetup(page, 'setup.Rogue.ghostRoomId()')).toBe(initial);
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
