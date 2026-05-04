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
    await clickLink(page, 'Rogue Hunt', 'RogueStart');

    // RogueStart auto-rolls the run via setup.Rogue.startRogue, so $run
    // already exists on entry. Confirm the lifecycle stamps look sane.
    let run = await getVar(page, 'run');
    expect(run).not.toBeNull();
    expect(run.number).toBe(1);
    expect(run.modifiers.length).toBe(2);

    // 2. Enter the hunt (RogueRun).
    await clickLink(page, 'Enter the hunt', 'RogueRun');

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
    await clickLink(page, 'Rogue Hunt', 'RogueStart');
    await clickLink(page, 'Enter the hunt', 'RogueRun');
    await clickLink(page, 'Lose', 'RogueEnd');

    // 5 base + 0 success + 2 modifiers = 7.
    expect(await getVar(page, 'echoes')).toBe(7);
    expect(await getVar(page, 'run')).toBeNull();
  });

  test('walking back in mid-run forfeits the prior run as failure', async () => {
    test.setTimeout(15_000);

    // Run 1: start it, then bail back out without finishing.
    await goToPassage(page, 'GhostStreet');
    await clickLink(page, 'Rogue Hunt', 'RogueStart');
    await clickLink(page, 'Enter the hunt', 'RogueRun');
    await goToPassage(page, 'GhostStreet');

    // The card never offers "Resume Run" -- only the fresh-haunt link.
    await expect(
      page.locator('.passage').getByText('Resume Run', { exact: true })
    ).toHaveCount(0);

    // Walking back in pays out failure echoes for run 1, then rolls run 2.
    await clickLink(page, 'Rogue Hunt', 'RogueStart');
    const run = await getVar(page, 'run');
    expect(run.number).toBe(2);
    // Run 1: 5 base + 0 success + 2 modifiers = 7 echoes from the forfeit.
    expect(await getVar(page, 'echoes')).toBe(7);
    expect(await getVar(page, 'runsStarted')).toBe(2);
  });

  test('RogueRun layout: minimap top-left, exits in toolbar, exits advance the player', async () => {
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickLink(page, 'Rogue Hunt', 'RogueStart');
    await clickLink(page, 'Enter the hunt', 'RogueRun');

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
    await clickLink(page, 'Rogue Hunt', 'RogueStart');
    await ensureNotEmptyBag(page);
    await clickLink(page, 'Enter the hunt', 'RogueRun');

    const toolOrder = await callSetup(page, 'setup.searchToolOrder');
    expect(toolOrder.length).toBe(6);
    await expect(page.locator('.rogue-run-tools .rogue-tool-card'))
      .toHaveCount(toolOrder.length);
  });

  test('startRogue stamps a ghost on $run and Ghosts.active() returns it', async () => {
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickLink(page, 'Rogue Hunt', 'RogueStart');

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
    await clickLink(page, 'Rogue Hunt', 'RogueStart');
    await clickLink(page, 'Enter the hunt', 'RogueRun');

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

  /* Shared setup: drop the per-tick repeat duration to ~10ms so the
     tool meter completes within a test budget. Real play uses
     150ms..1s per tick depending on MC level. */
  async function fastToolTicks(page) {
    await page.evaluate(() => {
      SugarCube.State.variables.timerToolsDecreased = '10ms';
    });
  }

  test('clicking a tool kicks off the meter and lands the result in the tray', async () => {
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickLink(page, 'Rogue Hunt', 'RogueStart');
    await ensureNotEmptyBag(page);
    await clickLink(page, 'Enter the hunt', 'RogueRun');
    await fastToolTicks(page);
    /* Pin the per-tick chain off so an event-chain goto can't hijack
       the meter mid-flight (same protection the other rogue tool
       tests use). */
    await stubPerTickGatesQuiet(page);

    // Baseline: GhostStreet resets to midnight.
    expect(await getVar(page, 'minutes')).toBe(0);

    // The top-center result tray exists and is empty until a tool fires.
    const tray = page.locator('#rogue-tool-result');
    await expect(tray).toHaveCount(1);
    await expect(tray).toBeEmpty();

    // Each tool card has a clickable label that, on click, starts a
    // <<repeat>>-driven meter under the icon. The meter ticks
    // $equipment.<tool> times (default tier 5) and on completion
    // wikifies the tool result into the tray.
    const emfCard = page.locator('.rogue-tool-card').first();
    await expect(emfCard.locator('a')).toHaveCount(1);
    await emfCard.locator('a').click();

    // Per click, the tier-5 EMF burns 5 toolTicks (1 min each) plus
    // one applyTickEffects (1 min, since RogueRun is huntActive) =
    // 6 in-game minutes.
    await page.waitForFunction(() => SugarCube.State.variables.minutes === 6);
    await expect(tray.locator('.boldText')).toHaveCount(1);
    await expect(emfCard.locator('.boldText')).toHaveCount(0);
    await expect(emfCard).not.toHaveClass(/disabled-link/);

    // Re-clicking the same tool reopens the meter and overwrites the
    // tray with a fresh reading rather than appending to it.
    await emfCard.locator('a').click();
    await page.waitForFunction(() => SugarCube.State.variables.minutes === 12);
    await expect(tray.locator('.boldText')).toHaveCount(1);
  });

  test('a tool click renders the shared top-of-screen meter while ticking', async () => {
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickLink(page, 'Rogue Hunt', 'RogueStart');
    await ensureNotEmptyBag(page);
    await clickLink(page, 'Enter the hunt', 'RogueRun');
    /* Pin event-chain gates off so a stray <<goto>> can't tear the
       meter element out from under the assertions. */
    await stubPerTickGatesQuiet(page);

    // Slow the per-tick interval so the meter is visible long enough
    // to assert against. Real play uses 150ms..1s.
    await page.evaluate(() => {
      SugarCube.State.variables.timerToolsDecreased = '200ms';
    });

    // The shared progress bar lives at the top of the layout
    // (#rogue-tool-meter) and is empty pre-click.
    const meter = page.locator('#rogue-tool-meter');
    await expect(meter).toHaveCount(1);
    await expect(meter.locator('[id^="meter-"]')).toHaveCount(0);

    // The cardlink class lives on the inner label span (so the
    // shared <<addclass>> path can disable both rogue and classic
    // tool slots without leaking 30px-tall classic .cardlink
    // styling onto the outer card).
    const emfCard = page.locator('.rogue-tool-card').first();
    const cardLabel = emfCard.locator('.rogue-tool-card-label');
    await emfCard.locator('a').click();

    // Mid-flight: the meter renders a SugarCube meter element (id
    // prefixed with "meter-") into the shared top container, and
    // the label cardlink picks up .disabled-link so the player can't
    // double-fire while ticking.
    await expect(meter.locator('[id^="meter-"]')).toHaveCount(1);
    await expect(cardLabel).toHaveClass(/disabled-link/);

    // Wait for the meter to clear at the end of the tick + the
    // disabled-link guard to lift.
    await expect(meter.locator('[id^="meter-"]')).toHaveCount(0);
    await expect(cardLabel).not.toHaveClass(/disabled-link/);
  });


  /* Shared per-tick gate stub used by the evidence-find tests. The
     plasm/gwb hit paths emit a deferred goto to EctoglassFound /
     GwbFound; if the per-tick chain (light flicker, prowl event,
     steal, random hunt) navigates first, the deferred goto lands on
     the wrong passage. Pinning the gates to constants is more
     reliable than seeding Math.random because Event's body-part roll
     branches on the active ghost's flags. */
  async function stubPerTickGatesQuiet(page) {
    await page.evaluate(() => {
      SugarCube.setup.Events.rollProwlEvent      = () => false;
      SugarCube.setup.Events.maybeTurnOffLights  = () => null;
      SugarCube.setup.HuntController.shouldTriggerSteal     = () => false;
      SugarCube.setup.HuntController.shouldStartRandomProwl = () => false;
    });
  }

  test('Ectoglass hit in rogue mode routes to EctoglassFound', async () => {
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickLink(page, 'Rogue Hunt', 'RogueStart');
    await ensureNotEmptyBag(page);
    await clickLink(page, 'Enter the hunt', 'RogueRun');

    await stubPerTickGatesQuiet(page);
    await fastToolTicks(page);
    await page.evaluate(() => {
      SugarCube.setup.ToolController.findPlasm = () => ({
        pack: { prefix: 'mechanics/plasm/mess/', start: 1, end: 7,
                ext: '.png', cssClass: 'displayCentredImgs' },
        message: ''
      });
    });

    const ectoCard = page.locator('.rogue-tool-card').filter({ hasText: 'Ectoglass' });
    await expect(ectoCard).toHaveCount(1);
    await ectoCard.locator('a').click();

    await page.waitForFunction(() => SugarCube.State.passage === 'EctoglassFound');

    // Image + MC reaction line are both present.
    await expect(page.locator('.passage img')).toHaveCount(1);
    await expect(page.locator('.passage').getByText('great... now its all over me'))
      .toBeVisible();

    // $evidenceFind was stamped by renderPlasm before the deferred goto.
    expect(await getVar(page, 'evidenceFind').then(v => v && v.tool)).toBe('plasm');

    // Back link returns the player to RogueRun.
    await page.locator('.passage').getByText('Back', { exact: true }).click();
    await page.waitForFunction(() => SugarCube.State.passage === 'RogueRun');
  });

  test('GWB hit in rogue mode routes to GwbFound', async () => {
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickLink(page, 'Rogue Hunt', 'RogueStart');
    await ensureNotEmptyBag(page);
    await clickLink(page, 'Enter the hunt', 'RogueRun');

    await stubPerTickGatesQuiet(page);
    await fastToolTicks(page);
    await page.evaluate(() => {
      SugarCube.setup.ToolController.findGwb = () => ({
        pack: { prefix: 'mechanics/gwb/', start: 1, end: 18, ext: '.jpg' },
        message: SugarCube.setup.ToolController.Messages.gwb
      });
    });

    const gwbCard = page.locator('.rogue-tool-card').filter({ hasText: 'GWB' });
    await expect(gwbCard).toHaveCount(1);
    await gwbCard.locator('a').click();

    await page.waitForFunction(() => SugarCube.State.passage === 'GwbFound');

    // Image + the canonical GWB-found reaction line are both present.
    await expect(page.locator('.passage img')).toHaveCount(1);
    await expect(
      page.locator('.passage').getByText(/Ohh\.\.\. what is this/i)
    ).toBeVisible();

    expect(await getVar(page, 'evidenceFind').then(v => v && v.tool)).toBe('gwb');

    await page.locator('.passage').getByText('Back', { exact: true }).click();
    await page.waitForFunction(() => SugarCube.State.passage === 'RogueRun');
  });

  test('Ectoglass miss in rogue mode renders not-found in the tray (no goto)', async () => {
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickLink(page, 'Rogue Hunt', 'RogueStart');
    await ensureNotEmptyBag(page);
    await clickLink(page, 'Enter the hunt', 'RogueRun');

    await stubPerTickGatesQuiet(page);
    await fastToolTicks(page);
    await page.evaluate(() => {
      SugarCube.setup.ToolController.findPlasm = () => null;
    });

    const ectoCard = page.locator('.rogue-tool-card').filter({ hasText: 'Ectoglass' });
    await ectoCard.locator('a').click();

    // Tray shows the canonical "no ectoplasm stains" copy after the
    // meter completes; player stays on RogueRun.
    await expect(
      page.locator('#rogue-tool-result').getByText(/ectoplasm stains/i)
    ).toBeVisible();
    expect(await page.evaluate(() => SugarCube.State.passage)).toBe('RogueRun');
  });

  test('furniture strip renders one icon per template slot for the current room', async () => {
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickLink(page, 'Rogue Hunt', 'RogueStart');
    await clickLink(page, 'Enter the hunt', 'RogueRun');

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
    await clickLink(page, 'Rogue Hunt', 'RogueStart');
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
    await clickLink(page, 'Rogue Hunt', 'RogueStart');

    // Place the player in the room+slot one of the four base loot
    // kinds is hidden in. The floor-plan generator might land
    // cursedItem on a furniture-less template (roomA/B/C); skip past
    // those so the click target is always a real slot. We only need
    // *some* base loot kind pinned to a furniture suffix to exercise
    // the search wiring -- tool_<id> loot is drafted when locked_tools
    // happens to roll, but it has its own pickup branch covered
    // separately by the Empty Bag e2e.
    const fp = await getVar(page, 'run').then(r => r.floorplan);
    const BASE_KINDS = ['cursedItem', 'rescueClue', 'tarotCards', 'monkeyPaw'];
    const lootKind = BASE_KINDS.find(k => fp.lootFurniture[k]);
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
    await clickLink(page, 'Rogue Hunt', 'RogueStart');
    await clickLink(page, 'Enter the hunt', 'RogueRun');

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
    await clickLink(page, 'Rogue Hunt', 'RogueStart');
    await ensureNotEmptyBag(page);
    await clickLink(page, 'Enter the hunt', 'RogueRun');

    /* Pin event randomness off so the click only exercises the
       per-tick drain branch (not Event / StealClothes / GhostHuntEvent
       gotos). The chain still calls Event but rollProwlEvent's
       chance-roll is gated on Math.random; pre-seeding all rolls
       to 1.0 keeps every roll above its threshold. */
    await page.evaluate(() => { Math.random = () => 0.99; });
    await fastToolTicks(page);

    // Snapshot the starting MC state.
    const before = await page.evaluate(() => {
      const mc = SugarCube.State.variables.mc;
      return { energy: mc.energy, sanity: mc.sanity };
    });

    // A tool click runs the meter through `tier` ticks. Each tick
    // burns 1 minute via <<toolTick>>; on completion <<applyTickEffects>>
    // fires once (energy -0.125, sanity -<contractDrain>, +1 minute).
    // Default equipment tier is 5, so 5 toolTicks + 1 applyTickEffects = 6.
    await page.locator('.rogue-tool-card').first().locator('a').click();
    await page.waitForFunction(() => SugarCube.State.variables.minutes >= 6);

    const after = await page.evaluate(() => {
      const mc = SugarCube.State.variables.mc;
      return { energy: mc.energy, sanity: mc.sanity };
    });
    expect(after.energy).toBeLessThan(before.energy);
    expect(after.sanity).toBeLessThan(before.sanity);
    expect(await getVar(page, 'minutes')).toBe(6);
  });

  test('per-tick chain runs on nav click and burns one in-game minute', async () => {
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickLink(page, 'Rogue Hunt', 'RogueStart');
    await clickLink(page, 'Enter the hunt', 'RogueRun');
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
    await clickLink(page, 'Rogue Hunt', 'RogueStart');
    await ensureNotEmptyBag(page);
    await clickLink(page, 'Enter the hunt', 'RogueRun');
    await page.evaluate(() => { Math.random = () => 0.99; });
    await fastToolTicks(page);

    // Set the MC up so the meter's completion <<applyTickEffects>>
    // collapses sanity.
    await page.evaluate(() => { SugarCube.State.variables.mc.sanity = 0.1; });

    await page.locator('.rogue-tool-card').first().locator('a').click();

    // The widget's post-applyTickEffects guard routes to
    // huntOverPassage("sanity") -> RogueEnd.
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
    await clickLink(page, 'Rogue Hunt', 'RogueStart');
    await ensureNotEmptyBag(page);
    await clickLink(page, 'Enter the hunt', 'RogueRun');

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
    await fastToolTicks(page);

    // Click any tool. Each meter tick runs huntTickEventChain, which
    // may <<goto>> us to GhostHuntEvent / EventMC / StealClothes
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
    await clickLink(page, 'Rogue Hunt', 'RogueStart');
    await clickLink(page, 'Enter the hunt', 'RogueRun');

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
    await clickLink(page, 'Rogue Hunt', 'RogueStart');
    await clickLink(page, 'Enter the hunt', 'RogueRun');

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
    await clickLink(page, 'Rogue Hunt', 'RogueStart');
    await clickLink(page, 'Enter the hunt', 'RogueRun');

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
    await clickLink(page, 'Rogue Hunt', 'RogueStart');
    await clickLink(page, 'Enter the hunt', 'RogueRun');

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
    await clickLink(page, 'Rogue Hunt', 'RogueStart');
    await ensureNotEmptyBag(page);
    await clickLink(page, 'Enter the hunt', 'RogueRun');

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
    await clickLink(page, 'Rogue Hunt', 'RogueStart');
    await ensureNotEmptyBag(page);
    await clickLink(page, 'Enter the hunt', 'RogueRun');

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

  test('rogue picks up the tarot deck via FurnitureSearch and Bag opens TarotCards', async () => {
    test.setTimeout(20_000);

    /* Tarot pickup parity: rogue's FurnitureSearch branch routes
       through the same PickupTarotCards include + markTarotCarrying
       call classic uses, so $tarotCardsStage flips to CARRYING and
       the Bag link becomes visible. */
    await goToPassage(page, 'GhostStreet');
    await clickLink(page, 'Rogue Hunt', 'RogueStart');
    await ensureNotEmptyBag(page);

    // Walk the player to the room+slot the deck is hidden in.
    const fp = await getVar(page, 'run').then(r => r.floorplan);
    const tarotRoom      = fp.loot.tarotCards;
    const tarotFurniture = fp.lootFurniture.tarotCards;
    expect(tarotRoom).toBeDefined();
    expect(tarotFurniture).toBeDefined();

    await page.evaluate(id => SugarCube.setup.Rogue.setCurrentRoom(id), tarotRoom);
    await goToPassage(page, 'RogueRun');

    const fLabel = await callSetup(page,
      `setup.Rogue.currentRoomData().furniture.find(f => f.suffix === "${tarotFurniture}").label`);
    await page.locator('.rogue-furniture-item')
      .filter({ hasText: fLabel })
      .first()
      .click();
    await page.waitForFunction(() => SugarCube.State.passage === 'FurnitureSearch');

    // Click through the linkappend "deck of cards." reveal.
    await page.locator('.passage').getByText('deck of cards.', { exact: true }).click();

    // Carry stage flipped (shared with classic).
    expect(await callSetup(page, 'setup.HauntedHouses.tarotCardsStage()'))
      .toBe(await callSetup(page, 'setup.TarotStage.CARRYING'));
    // Loot collected so a re-search at the same slot finds nothing.
    expect(await callSetup(page, 'setup.Rogue.hasCollected("tarotCards")')).toBe(true);

    // Walk back into RogueRun and open Bag -- the tarot link must be visible.
    await clickLink(page, 'Back', 'RogueRun');
    await page.evaluate(() => SugarCube.Engine.play('Bag'));
    await page.waitForFunction(() => SugarCube.State.passage === 'Bag');
    await expect(
      page.locator('.passage').getByText('Look at the deck', { exact: true })
    ).toBeVisible();
  });

  test('rogue picks up the monkey paw via FurnitureSearch and Bag opens MonkeyPaw', async () => {
    test.setTimeout(20_000);

    await goToPassage(page, 'GhostStreet');
    await clickLink(page, 'Rogue Hunt', 'RogueStart');
    await ensureNotEmptyBag(page);

    const fp = await getVar(page, 'run').then(r => r.floorplan);
    const pawRoom      = fp.loot.monkeyPaw;
    const pawFurniture = fp.lootFurniture.monkeyPaw;
    expect(pawRoom).toBeDefined();
    expect(pawFurniture).toBeDefined();

    await page.evaluate(id => SugarCube.setup.Rogue.setCurrentRoom(id), pawRoom);
    await goToPassage(page, 'RogueRun');

    const fLabel = await callSetup(page,
      `setup.Rogue.currentRoomData().furniture.find(f => f.suffix === "${pawFurniture}").label`);
    await page.locator('.rogue-furniture-item')
      .filter({ hasText: fLabel })
      .first()
      .click();
    await page.waitForFunction(() => SugarCube.State.passage === 'FurnitureSearch');
    await page.locator('.passage').getByText('paw.', { exact: true }).click();

    expect(await callSetup(page, 'setup.MonkeyPaw.isFound()')).toBe(true);
    expect(await callSetup(page, 'setup.Rogue.hasCollected("monkeyPaw")')).toBe(true);

    await clickLink(page, 'Back', 'RogueRun');
    await page.evaluate(() => SugarCube.Engine.play('Bag'));
    await page.waitForFunction(() => SugarCube.State.passage === 'Bag');
    await expect(
      page.locator('.passage').getByText('Look at the paw', { exact: true })
    ).toBeVisible();
    expect(await callSetup(page, 'setup.MonkeyPaw.isCarrying()')).toBe(true);
  });

  test('rogue tarot draw fires the Knowledge effect and stamps $chosenEvidence', async () => {
    test.setTimeout(20_000);

    /* Pre-set conditions so the deck draw lands on the Knowledge card
       (the only card with a deterministic state mutation we can pin
       without triggering passage transitions). The card weights from
       setup.tarotDeck place Knowledge after Passion+Pulse (40% combined),
       so a roll of 41 (out of 101) lands on Knowledge. */
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({ seed: 1 }));
    await page.evaluate(() => SugarCube.setup.Rogue.setField('ghostName', 'Shade'));
    await page.evaluate(() => SugarCube.setup.HauntedHouses.markTarotCarrying());
    await goToPassage(page, 'RogueRun');

    // Pin the deck draw to "knowledge" -- a roll <= 50 (passion 20 +
    // pulse 20 + oblivion 1 + knowledge 10) lands inside the
    // knowledge band; we go with 45 to be inside knowledge but not
    // oblivion (which would route to a hunt-over passage).
    await page.evaluate(() => { Math.random = () => 0.45; });
    await goToPassage(page, 'TarotCards');

    await page.locator('.passage').getByText('Pull a card', { exact: true }).click();
    // The knowledge widget runs setup.HuntController.consumeKnowledgeEvidence
    // inside <<timed 2s>>; wait for the side effect.
    await page.waitForFunction(() =>
      SugarCube.State.variables.knowledgeUsed === 1, null, { timeout: 5000 });

    expect(await getVar(page, 'knowledgeUsed')).toBe(1);
    const chosen = await getVar(page, 'chosenEvidence');
    // Shade lacks spiritbox/uvl/glass; rogue knowledge picks one.
    expect(['spiritbox', 'uvl', 'glass']).toContain(chosen);

    // Drawn-cards counter incremented (shared classic counter).
    expect(await getVar(page, 'drawnCards')).toBe(1);
  });

  test('rogue monkey-paw dawn wish forfeits the run as "time" failure', async () => {
    test.setTimeout(20_000);

    await goToPassage(page, 'GhostStreet');
    await clickLink(page, 'Rogue Hunt', 'RogueStart');
    await ensureNotEmptyBag(page);
    await clickLink(page, 'Enter the hunt', 'RogueRun');

    // Hand the player the paw without going through pickup.
    await page.evaluate(() => SugarCube.setup.MonkeyPaw.markFound());
    await goToPassage(page, 'MonkeyPaw');

    // The dawn wish renders an "I wish for dawn" link only when
    // it's been learned; pre-learn it so the link surfaces.
    await page.evaluate(() => SugarCube.setup.MonkeyPaw.markLearned('dawn'));
    await goToPassage(page, 'MonkeyPaw');

    await page.locator('.passage').getByText('I wish for dawn', { exact: true }).click();

    // The dawn wish goto resolves through HuntController.huntOverPassage("time")
    // which in rogue stamps "time" failure + returns "RogueEnd".
    await page.waitForFunction(() => SugarCube.State.passage === 'RogueEnd');
    expect(await getVar(page, 'run')).toBeNull();
    await expect(
      page.locator('.passage').getByText(/clock/i)
    ).toBeVisible();
  });

  test('Empty Bag run places every tool in furniture and pickup adds it to the toolbar', async () => {
    test.setTimeout(20_000);

    /* End-to-end recovery flow for the Empty Bag modifier: the
       run starts with [] tools (the toolbar collapses to "your bag
       is empty"), but the floor plan now has every tool stamped
       into furniture. Walk to a tool's room, click its furniture,
       confirm the pickup beat, return to RogueRun, and the toolbar
       gains the picked-up tool card. */
    await page.evaluate(() => {
      // Start a fresh run with locked_tools pinned so the toolbar
      // begins empty and missingToolsToPlace returns the full set.
      SugarCube.setup.Rogue.startRogue({
        seed: 9, modifierCount: 0
      });
      // Pin locked_tools post-draft so the placement was based on
      // the pre-startRogue modifier set; rebuild the floor plan
      // with the missing tools stamped in.
      SugarCube.setup.Rogue.addModifier('locked_tools');
      const fp = SugarCube.setup.FloorPlan.generate(9, {
        roomCount: 7,
        toolKinds: SugarCube.setup.searchToolOrder.slice()
      });
      SugarCube.setup.Rogue.setField('floorplan', fp);
    });
    await goToPassage(page, 'RogueRun');

    // Toolbar is empty.
    await expect(page.locator('.rogue-run-tools .rogue-tool-card-empty')).toBeVisible();
    await expect(page.locator('.rogue-run-tools .rogue-tool-card')).toHaveCount(1);

    // Pick a tool that's pinned to a slot all by itself, so the solo
    // pickup path (linkappend "equipment." click) fires. Multi-item
    // slots are exercised by the dedicated multi-item test below.
    const fp = await getVar(page, 'run').then(r => r.floorplan);
    const toolKey = Object.keys(fp.loot).find((k) => {
      if (!k.startsWith('tool_')) return false;
      const room = fp.loot[k];
      const slot = fp.lootFurniture[k];
      if (!slot) return false;
      const others = Object.keys(fp.loot).filter(o =>
        o !== k && fp.loot[o] === room && fp.lootFurniture[o] === slot);
      return others.length === 0;
    });
    expect(toolKey).toBeDefined();
    const toolId   = toolKey.slice('tool_'.length);
    const room     = fp.loot[toolKey];
    const fSlot    = fp.lootFurniture[toolKey];

    await page.evaluate(id => SugarCube.setup.Rogue.setCurrentRoom(id), room);
    await goToPassage(page, 'RogueRun');

    const fLabel = await callSetup(page,
      `setup.Rogue.currentRoomData().furniture.find(f => f.suffix === "${fSlot}").label`);
    await page.locator('.rogue-furniture-item')
      .filter({ hasText: fLabel })
      .first()
      .click();
    await page.waitForFunction(() => SugarCube.State.passage === 'FurnitureSearch');

    await expect(
      page.locator('.passage').getByText(/piece of hunting/i)
    ).toBeVisible();
    await page.locator('.passage').getByText('equipment.', { exact: true }).click();
    expect(await callSetup(page, `setup.Rogue.hasCollected("${toolKey}")`)).toBe(true);

    // Return to RogueRun. Toolbar now includes the picked-up tool.
    await clickLink(page, 'Back', 'RogueRun');
    expect(await callSetup(page, 'setup.Rogue.startingTools()')).toEqual([toolId]);
    await expect(page.locator('.rogue-run-tools .rogue-tool-card')).toHaveCount(1);
    await expect(page.locator('.rogue-run-tools .rogue-tool-card-empty')).toHaveCount(0);
    await expect(page.locator('.rogue-run-tools a')).toHaveCount(1);
  });

  test('multi-item furniture slot reveals every loot kind in a single search', async () => {
    test.setTimeout(20_000);

    /* When the floor-plan generator stacks multiple loot kinds on
       the same furniture slot (it falls back to sharing when a room
       runs out of unique slots), one search should surface all of
       them at once -- the player never has to click the same drawer
       twice. The compact <<rogueLootBeat>> widget renders one short
       line per kind and marks it collected; the back-button is one
       click away. */
    await page.evaluate(() => {
      SugarCube.setup.Rogue.startRogue({ seed: 1, modifierCount: 0 });
      // Hand-crafted plan: kitchen at room_1 holds tarot + paw + an EMF
      // pickup all on the desk slot. The player walks in and clicks
      // once.
      SugarCube.setup.Rogue.setField('floorplan', {
        rooms: [
          { id: 'room_0', template: 'hallway' },
          { id: 'room_1', template: 'kitchen' }
        ],
        edges: [['room_0', 'room_1']],
        spawnRoomId: 'room_1',
        loot: {
          tarotCards: 'room_1',
          monkeyPaw:  'room_1',
          tool_emf:   'room_1'
        },
        lootFurniture: {
          tarotCards: 'desk',
          monkeyPaw:  'desk',
          tool_emf:   'desk'
        },
        bossRoomId: null
      });
      SugarCube.setup.Rogue.setCurrentRoom('room_1');
    });
    await goToPassage(page, 'RogueRun');

    // Click the desk slot.
    await page.locator('.rogue-furniture-item')
      .filter({ hasText: 'Desk' })
      .first()
      .click();
    await page.waitForFunction(() => SugarCube.State.passage === 'FurnitureSearch');

    // The combined header sets the multi-item beat.
    await expect(
      page.locator('.passage').getByText(/several things/i)
    ).toBeVisible();
    // All three kinds rendered in the compact form.
    await expect(
      page.locator('.passage').getByText(/strange deck of tarot cards/i)
    ).toBeVisible();
    await expect(
      page.locator('.passage').getByText(/withered monkey's paw/i)
    ).toBeVisible();
    await expect(
      page.locator('.passage').getByText(/piece of hunting equipment/i)
    ).toBeVisible();

    // All three flagged collected on this single search -- no
    // linkappend gates to click through.
    expect(await callSetup(page, 'setup.Rogue.hasCollected("tarotCards")')).toBe(true);
    expect(await callSetup(page, 'setup.Rogue.hasCollected("monkeyPaw")')).toBe(true);
    expect(await callSetup(page, 'setup.Rogue.hasCollected("tool_emf")')).toBe(true);

    // Carry-stage flips happened (Bag link surfaces the deck + paw).
    expect(await callSetup(page, 'setup.HauntedHouses.tarotCardsStage()'))
      .toBe(await callSetup(page, 'setup.TarotStage.CARRYING'));
    expect(await callSetup(page, 'setup.MonkeyPaw.isFound()')).toBe(true);

    // A re-search of the same slot now finds nothing.
    await clickLink(page, 'Back', 'RogueRun');
    await page.locator('.rogue-furniture-item')
      .filter({ hasText: 'Desk' })
      .first()
      .click();
    await page.waitForFunction(() => SugarCube.State.passage === 'FurnitureSearch');
    await expect(
      page.locator('.passage').getByText(/nothing of note/i)
    ).toBeVisible();
  });

  test('two consecutive runs increment runsStarted across the lifecycle', async () => {
    test.setTimeout(20_000);

    await goToPassage(page, 'GhostStreet');

    // Run 1: win.
    await clickLink(page, 'Rogue Hunt', 'RogueStart');
    await clickLink(page, 'Enter the hunt', 'RogueRun');
    await clickLink(page, 'Win', 'RogueEnd');
    expect(await getVar(page, 'runsStarted')).toBe(1);
    expect(await getVar(page, 'echoes')).toBe(12);

    // Run 2: lose.
    await clickLink(page, 'Visit the meta-shop', 'RogueMetaShop');
    await clickLink(page, 'Continue hunting', 'RogueStart');
    const run2 = await getVar(page, 'run');
    expect(run2.number).toBe(2);
    await clickLink(page, 'Enter the hunt', 'RogueRun');
    await clickLink(page, 'Lose', 'RogueEnd');
    expect(await getVar(page, 'runsStarted')).toBe(2);
    // 12 (run 1) + 7 (run 2 fail) = 19.
    expect(await getVar(page, 'echoes')).toBe(19);
  });
});
