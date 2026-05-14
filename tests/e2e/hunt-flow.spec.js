const { test, expect } = require('@playwright/test');
const { openGame, resetGame, getVar, goToPassage, callSetup, ensureOpenPage, seedRandom } = require('../helpers');

/* End-to-end hunt lifecycle: GhostStreet → HuntStart → HuntRun
   → HuntSummary, plus the witch's ectoplasm storefront
   (WitchEctoplasm). Exercises the actual passage flow so any
   wiring break (missing link text, broken setField call, wrong
   passage transition) shows up here. */
test.describe('E2E: hunt lifecycle', () => {
  /* Click-driven hunt navigation hits dozens of passages with heavy
     <<do>>/<<redo>> chains. Under parallel worker load the renderer can OOM
     mid-test ("Target page closed"); the self-healing beforeEach reopens
     the page on the retry, so a single retry covers a transient renderer
     crash without masking real bugs. */
  test.describe.configure({ retries: 1 });
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
    /* If a prior test crashed the renderer (heavy <<do>>/<<redo>> chains
       can OOM under parallel worker load), transparently reopen so this
       test still gets a clean page. Without this, every subsequent test
       in the file fails with "Target page closed" until the worker exits. */
    page = await ensureOpenPage(savedBrowser, page);
    try {
      await resetGame(page);
    } catch (err) {
      page = await openGame(savedBrowser);
      await resetGame(page);
    }
    /* GhostStreet's huntCard gates the link behind setup.Mc.lvl() >= 4.
       New games start at lvl 0, so without this every test would land on
       the "Level 4+ required" placeholder instead of a clickable link.
       Wait for $mc to be re-initialised by StoryInit before mutating it —
       resetGame only blocks until the first passage renders, which can
       race the variable rebind. */
    await page.waitForFunction(() => SugarCube.State.variables.mc != null);
    await page.evaluate(() => { SugarCube.State.variables.mc.lvl = 4; });
    /* Pin Math.random per-test so HuntStart's auto-roll (nextSeed,
       floor-plan generator, modifier draft) lands on the same layout
       every run. Without this the floor-plan layout flips between
       attempts and tests that walk the resulting plan
       (clicking-the-loot-furniture, tarot/paw pickup) flake when the
       loot lands on a slot that stacks with another kind. */
    await seedRandom(page, 0xC0FFEE);
  });

  async function clickLink(page, linkText, expectedPassage) {
    await page.locator('.passage').getByText(linkText, { exact: true }).first().click();
    await page.waitForFunction(p => SugarCube.State.passage === p, expectedPassage);
  }

  /* The hunt card's link text is the per-cycle randomised street
     address, not a fixed "Hunt" label. Resolve the address from
     setup.HuntController.nextSeed() (the same source the card widget reads) and
     click the matching link. */
  async function clickHuntCard(page) {
    const huntAddr = await page.evaluate(() =>
      SugarCube.setup.HuntController.addressFromSeed(SugarCube.setup.HuntController.nextSeed()).formatted
    );
    await clickLink(page, huntAddr, 'HuntStart');
  }

  /* Restart the active hunt with no modifiers so the toolbar is
     fully populated and the floor plan has no tool-recovery loot
     stacked onto authored loot slots (tarot, paw, etc). The default
     HuntStart auto-roll always drafts the full catalogue, which
     means locked_tools is reliably active and the floor-plan
     generator places all six missing tools as furniture loot --
     stacking those onto the same slot as e.g. the tarot deck flips
     FurnitureSearch into its multi-item branch and skips the
     "deck of cards." linkappend reveal these tests pin. Tests that
     need a clean toolbar + clean floor plan call this after the
     HuntStart auto-roll. */
  async function ensureNotEmptyBag(page) {
    await page.evaluate(() => {
      SugarCube.setup.HuntController.startHunt({ modifierCount: 0 });
    });
  }

  test('start from GhostStreet → win the run → spend ectoplasm at the witch', async () => {
    test.setTimeout(20_000);

    await goToPassage(page, 'GhostStreet');
    expect(await getVar(page, 'run')).toBeNull();
    expect(await getVar(page, 'ectoplasm')).toBe(0);

    // 1. Launch the run from the GhostStreet hunt card.
    await clickHuntCard(page);

    // HuntStart auto-rolls the run via setup.HuntController.startHunt, so $run
    // already exists on entry. Confirm the lifecycle stamps look sane.
    let run = await getVar(page, 'run');
    expect(run).not.toBeNull();
    expect(run.number).toBe(1);
    expect(run.modifiers.length).toBe(2);

    // 2. Enter the hunt (HuntRun).
    await clickLink(page, 'Enter the hunt', 'HuntRun');

    // 3. Win the run. Stamp the success outcome and navigate to the
    // end-passage; the in-game flow gates this behind a correct ghost
    // identification, but for lifecycle coverage we drive the outcome
    // directly.
    await page.evaluate(() => SugarCube.setup.HuntController.markSuccess());
    await goToPassage(page, 'HuntSummary');

    // The end-passage clears the run and pays out ectoplasm (mL).
    run = await getVar(page, 'run');
    expect(run).toBeNull();
    const ectoplasm = await getVar(page, 'ectoplasm');
    // Payout = round(success-base 10 * deck payoutMultiplier).
    // Two modifiers from the seeded daily draft -> at least the
    // success base, with each modifier scaling > 1.
    expect(ectoplasm).toBeGreaterThanOrEqual(10);
    expect(await getVar(page, 'runsStarted')).toBe(1);

    // 4. Walk into the witch's ectoplasm storefront and buy the
    // cheapest unlock (Reroll Charge at 5 mL). The shop redirects
    // through goto on every purchase; we wait on the resulting state
    // mutation (charges incremented, ectoplasm deducted) instead of DOM.
    await goToPassage(page, 'WitchEctoplasm');
    await page.locator('.passage')
      .locator('#hunt-shop-row-reroll_charge')
      .getByText(/^Buy \(5 mL\)$/)
      .click();
    await page.waitForFunction(
      remaining => SugarCube.State.variables.ectoplasm === remaining,
      ectoplasm - 5
    );
    expect(await page.evaluate(() => SugarCube.setup.HuntController.rerollCharges())).toBe(1);
  });

  test('losing a run still pays out failure-base * deck multiplier of ectoplasm', async () => {
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickHuntCard(page);
    await clickLink(page, 'Enter the hunt', 'HuntRun');
    const expected = await page.evaluate(() =>
      Math.round(3 * SugarCube.setup.Modifiers.payoutMultiplier()));
    await page.evaluate(() => SugarCube.setup.HuntController.markFailure());
    await goToPassage(page, 'HuntSummary');

    expect(await getVar(page, 'ectoplasm')).toBe(expected);
    expect(await getVar(page, 'run')).toBeNull();
  });

  test('walking back in mid-run forfeits the prior run as failure', async () => {
    test.setTimeout(15_000);

    // Run 1: start it, then bail back out without finishing.
    await goToPassage(page, 'GhostStreet');
    await clickHuntCard(page);
    await clickLink(page, 'Enter the hunt', 'HuntRun');
    // Snapshot the failure payout BEFORE walking back; the forfeit pays
    // failure-base * the run-1 modifier deck.
    const expectedForfeit = await page.evaluate(() =>
      Math.round(3 * SugarCube.setup.Modifiers.payoutMultiplier()));
    await goToPassage(page, 'GhostStreet');

    // The card never offers "Resume Run" -- only the fresh-haunt link.
    await expect(
      page.locator('.passage').getByText('Resume Run', { exact: true })
    ).toHaveCount(0);

    // Walking back in pays out failure ectoplasm for run 1, then rolls run 2.
    await clickHuntCard(page);
    const run = await getVar(page, 'run');
    expect(run.number).toBe(2);
    expect(await getVar(page, 'ectoplasm')).toBe(expectedForfeit);
    expect(await getVar(page, 'runsStarted')).toBe(2);
  });

  test('HuntRun layout: minimap top-left, exits in toolbar, exits advance the player', async () => {
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickHuntCard(page);
    await clickLink(page, 'Enter the hunt', 'HuntRun');

    // Player starts in the hallway (room_0).
    expect(await getVar(page, 'run').then(r => r.currentRoomId)).toBe('room_0');

    // Layout slots are populated:
    //   - top-left holds the minimap SVG
    //   - top-right holds the active-modifier chip list
    //   - bottom-right toolbar slot holds the exit nav links (no
    //     "Exits" header -- the links speak for themselves)
    await expect(page.locator('.hunt-run-tl .hunt-minimap-svg')).toBeVisible();
    await expect(
      page.locator('.hunt-run-tr .hunt-modifier-chip').first()
    ).toBeVisible();
    expect(await page.locator('.hunt-run-nav a').count()).toBeGreaterThan(0);

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

    await page.locator('.hunt-run-nav')
      .getByText(tLabel, { exact: true })
      .first()
      .click();
    await page.waitForFunction(
      id => SugarCube.State.variables.run.currentRoomId === id,
      firstNeighbourId
    );
  });

  test('hunt exit nav switches to compact layout when the current room has >3 neighbours', async () => {
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickHuntCard(page);
    await clickLink(page, 'Enter the hunt', 'HuntRun');

    // Find a room with <=3 exits to serve as the low-exit baseline.
    // The procedurally-rolled floor plan doesn't reliably produce a
    // >3-exit room every run, so synthesise that case by injecting
    // extra edges; the live count is read from FloorPlan.neighborsOf
    // (the same source currentRoomData consults), so adding edges to
    // fp.edges is the minimum mutation needed.
    const { lowId, hubId } = await page.evaluate(() => {
      const fp = SugarCube.State.variables.run.floorplan;
      // Pick a hub and connect it to four other rooms so the live
      // neighbor count is guaranteed to exceed 3.
      const hub = fp.rooms[0];
      const others = fp.rooms.filter(r => r.id !== hub.id).slice(0, 4);
      others.forEach(o => fp.edges.push([hub.id, o.id]));
      // Find a <=3-exit room AFTER the mutation so the four `others`
      // we just bumped don't get picked.
      let low = null;
      for (const r of fp.rooms) {
        if (r.id === hub.id) continue;
        const n = SugarCube.setup.FloorPlan.neighborsOf(fp, r.id).length;
        if (n <= 3) { low = r; break; }
      }
      return { lowId: low?.id ?? null, hubId: hub.id };
    });

    test.skip(!lowId, 'floorplan lacks a <=3-exit room');

    await page.evaluate(id => SugarCube.setup.HuntController.setCurrentRoom(id), hubId);
    await goToPassage(page, 'HuntRun');
    await expect(page.locator('.hunt-run-nav')).toHaveClass(/hunt-run-nav-compact/);

    await page.evaluate(id => SugarCube.setup.HuntController.setCurrentRoom(id), lowId);
    await goToPassage(page, 'HuntRun');
    await expect(page.locator('.hunt-run-nav')).not.toHaveClass(/hunt-run-nav-compact/);
  });

  test('clicking the minimap toggles the hunt-minimap-collapsed class and survives room moves', async () => {
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickHuntCard(page);
    await clickLink(page, 'Enter the hunt', 'HuntRun');
    // The default hunt draft can leave minimapCollapsed lingering true
    // from an earlier test run -- reset to a known state before asserting.
    await page.evaluate(() => {
      if (SugarCube.setup.HuntController.isMinimapCollapsed()) {
        SugarCube.setup.HuntController.toggleMinimapCollapsed();
      }
    });
    await goToPassage(page, 'HuntRun');

    const map = page.locator('.hunt-run-tl .hunt-minimap');
    await expect(map).toBeVisible();
    await expect(map).not.toHaveClass(/hunt-minimap-collapsed/);

    // First click: collapse.
    await map.click();
    await expect(map).toHaveClass(/hunt-minimap-collapsed/);
    expect(await callSetup(page, 'setup.HuntController.isMinimapCollapsed()')).toBe(true);

    // Re-render the passage -- the collapsed flag must persist so the
    // map does not pop back to full size on every navigation step.
    // Drive the re-render directly (setCurrentRoom + goToPassage) so a
    // hunt-event redirect from huntTickStep can't whisk us off HuntRun
    // and break the assertion we actually care about.
    await page.evaluate(() => SugarCube.setup.HuntController.setCurrentRoom('room_1'));
    await goToPassage(page, 'HuntRun');

    const mapAfterMove = page.locator('.hunt-run-tl .hunt-minimap');
    await expect(mapAfterMove).toHaveClass(/hunt-minimap-collapsed/);

    // Second click: expand.
    await mapAfterMove.click();
    await expect(mapAfterMove).not.toHaveClass(/hunt-minimap-collapsed/);
    expect(await callSetup(page, 'setup.HuntController.isMinimapCollapsed()')).toBe(false);
  });

  test('huntFooterLight toggles the current room\'s light state and the body background', async () => {
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickHuntCard(page);
    await clickLink(page, 'Enter the hunt', 'HuntRun');

    // Both buttons render inside the bottom HUD's .hunt-run-lights
    // wrapper (anchored to the right edge, above the .hunt-run-hud
    // border line by absolute positioning).
    const lights = page.locator('.hunt-run-bottom .hunt-run-lights');
    await expect(lights).toHaveCount(1);
    await expect(lights.locator('img')).toHaveCount(2);

    // Default: room_0 starts dark, so the rendered body bg should
    // reference the dark variant of the hallway template. The
    // <<bodyBackground>> widget emits an inline <style> in the
    // passage; <style> content isn't visible text, so read it via
    // evaluate rather than Playwright's hasText matcher.
    const bgStyleText = () => page.evaluate(() => {
      var styles = document.querySelectorAll('.passage style');
      for (var i = 0; i < styles.length; i++) {
        if (styles[i].textContent.indexOf('background-image') !== -1) {
          return styles[i].textContent;
        }
      }
      return '';
    });
    expect(await callSetup(page, 'setup.HuntController.isCurrentRoomDark()')).toBe(true);
    expect(await bgStyleText()).toContain('hallway-dark');

    // Click "lights on" (first image link). HuntRun re-renders, the
    // light flag flips to LIT, and the body bg switches to the lit URL.
    // Test media is blocked at the network layer (see openGame), so the
    // wrapping <a>'s rendered geometry is the icon's intrinsic 32×32 box
    // even when the <img> never decodes — but we still click via DOM
    // dispatch to keep the test independent of layout overlap with the
    // toolbar/nav links anchored on the same edge.
    const clickLightLink = (idx) => page.evaluate((i) => {
      const links = document.querySelectorAll('.hunt-run-bottom .hunt-run-lights a');
      links[i].click();
    }, idx);
    await clickLightLink(0);
    await page.waitForFunction(
      () => SugarCube.setup.HuntController.isCurrentRoomDark() === false
    );
    const litStyle = await bgStyleText();
    expect(litStyle).toContain('hallway.jpg');
    expect(litStyle).not.toContain('hallway-dark');

    // Click "lights off" -- back to dark.
    await clickLightLink(1);
    await page.waitForFunction(
      () => SugarCube.setup.HuntController.isCurrentRoomDark() === true
    );
    expect(await bgStyleText()).toContain('hallway-dark');
  });

  test('HuntRun renders the shared hunt-conditions HUD with live deltas', async () => {
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickHuntCard(page);
    await clickLink(page, 'Enter the hunt', 'HuntRun');

    // The HUD wrapper exists exactly once -- the same .hunt-conditions
    // class classic uses, so <<replace ".hunt-conditions">> works in
    // either mode.
    const hud = page.locator('.hunt-run-bottom .hunt-conditions');
    await expect(hud).toHaveCount(1);

    // The snapshot's per-step deltas are present (sanity/lust/energy
    // each emit a "<n>/step" chip) and the time label renders.
    await expect(hud).toContainText('/step');
    await expect(hud).toContainText('+1 min/step');
  });

  test('Lust ≥ 50 contributor chip appears in the hunt HUD after a tool tick refresh', async () => {
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickHuntCard(page);
    await ensureNotEmptyBag(page);
    await clickLink(page, 'Enter the hunt', 'HuntRun');
    await stubPerTickGatesQuiet(page);
    await fastToolTicks(page);

    const hud = page.locator('.hunt-run-bottom .hunt-conditions');
    // Baseline: no Lust contributor chip (mc.lust starts at 0).
    await expect(hud).not.toContainText('Lust ≥');

    // Cross the LUST_FUEL_THRESHOLD (50) without re-rendering the
    // passage -- the HUD should pick this up only after the tool-tick
    // refresh, which mirrors classic's nav re-render.
    await page.evaluate(() => { SugarCube.State.variables.mc.lust = 60; });

    // Click any tool; the huntToolSlot re-renders .hunt-conditions
    // after applyTickEffects.
    await page.locator('.hunt-tool-card').first().locator('a').click();
    await page.waitForFunction(() => SugarCube.State.variables.minutes >= 6);

    await expect(hud).toContainText('Lust ≥ 50');
  });

  test('toolbar renders one card per setup.searchToolOrder entry', async () => {
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickHuntCard(page);
    await ensureNotEmptyBag(page);
    await clickLink(page, 'Enter the hunt', 'HuntRun');

    const toolOrder = await callSetup(page, 'setup.searchToolOrder');
    expect(toolOrder.length).toBe(6);
    await expect(page.locator('.hunt-run-tools .hunt-tool-card'))
      .toHaveCount(toolOrder.length);
  });

  test('startHunt stamps a ghost on $run and Ghosts.active() returns it', async () => {
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickHuntCard(page);

    const run = await getVar(page, 'run');
    expect(run.ghostName).toBeTruthy();

    // No witch contract is open, but setup.Ghosts.active() must hand
    // back the hunt ghost so the shared <<toolCheck>> path can read
    // its evidence list.
    const activeName = await callSetup(page, 'setup.Ghosts.active().name');
    expect(activeName).toBe(run.ghostName);

    // Same ghost is reachable via the controller-side accessor.
    const huntGhostName = await callSetup(page, 'setup.HuntController.ghostName()');
    expect(huntGhostName).toBe(run.ghostName);
  });

  test('isGhostHere() is true only inside the lair room during HuntRun', async () => {
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickHuntCard(page);
    await clickLink(page, 'Enter the hunt', 'HuntRun');

    // Player starts in room_0 (hallway); the lair is whichever room
    // the floor-plan generator picked as the spawn (always non-hallway).
    const ghostRoom = await callSetup(page, 'setup.HuntController.ghostRoomId()');
    expect(ghostRoom).not.toBe('room_0');

    // Outside the lair: false.
    expect(await callSetup(page, 'setup.isGhostHere()')).toBe(false);

    // Walk into the lair and re-render the passage, then re-check.
    await page.evaluate(id => SugarCube.setup.HuntController.setCurrentRoom(id), ghostRoom);
    await goToPassage(page, 'HuntRun');
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
    await clickHuntCard(page);
    await ensureNotEmptyBag(page);
    await clickLink(page, 'Enter the hunt', 'HuntRun');
    await fastToolTicks(page);
    /* Pin the per-tick chain off so an event-chain goto can't hijack
       the meter mid-flight (same protection the other hunt tool
       tests use). */
    await stubPerTickGatesQuiet(page);

    // Baseline: GhostStreet resets to midnight.
    expect(await getVar(page, 'minutes')).toBe(0);

    // The top-center result tray exists and is empty until a tool fires.
    const tray = page.locator('#hunt-tool-result');
    await expect(tray).toHaveCount(1);
    await expect(tray).toBeEmpty();

    // Each tool card has a clickable label that, on click, starts a
    // <<repeat>>-driven meter under the icon. The meter ticks
    // $equipment.<tool> times (default tier 5) and on completion
    // wikifies the tool result into the tray.
    const emfCard = page.locator('.hunt-tool-card').first();
    await expect(emfCard.locator('a')).toHaveCount(1);
    await emfCard.locator('a').click();

    // Per click, the tier-5 EMF burns 5 toolTicks (1 min each) plus
    // one applyTickEffects (1 min, since HuntRun is huntActive) =
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
    await clickHuntCard(page);
    await ensureNotEmptyBag(page);
    await clickLink(page, 'Enter the hunt', 'HuntRun');
    /* Pin event-chain gates off so a stray <<goto>> can't tear the
       meter element out from under the assertions. */
    await stubPerTickGatesQuiet(page);

    // Slow the per-tick interval so the meter is visible long enough
    // to assert against. Real play uses 150ms..1s.
    await page.evaluate(() => {
      SugarCube.State.variables.timerToolsDecreased = '200ms';
    });

    // The shared progress bar lives at the top of the layout
    // (#hunt-tool-meter) and is empty pre-click.
    const meter = page.locator('#hunt-tool-meter');
    await expect(meter).toHaveCount(1);
    await expect(meter.locator('[id^="meter-"]')).toHaveCount(0);

    // The cardlink class lives on the inner label span (so the
    // shared <<addclass>> path can disable the disabled state
    // tool slots without leaking 30px-tall classic .cardlink
    // styling onto the outer card).
    const emfCard = page.locator('.hunt-tool-card').first();
    const cardLabel = emfCard.locator('.hunt-tool-card-label');
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

  test('Ectoglass hit in hunt mode routes to EctoglassFound', async () => {
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickHuntCard(page);
    await ensureNotEmptyBag(page);
    await clickLink(page, 'Enter the hunt', 'HuntRun');

    await stubPerTickGatesQuiet(page);
    await fastToolTicks(page);
    await page.evaluate(() => {
      SugarCube.setup.ToolController.findPlasm = () => ({
        pack: { prefix: 'mechanics/plasm/mess/', start: 1, end: 7,
                ext: '.png', cssClass: 'displayCentredImgs' },
        message: ''
      });
    });

    const ectoCard = page.locator('.hunt-tool-card').filter({ hasText: 'Ectoglass' });
    await expect(ectoCard).toHaveCount(1);
    await ectoCard.locator('a').click();

    await page.waitForFunction(() => SugarCube.State.passage === 'EctoglassFound');

    // Image + MC reaction line are both present.
    await expect(page.locator('.passage img')).toHaveCount(1);
    await expect(page.locator('.passage').getByText('great... now its all over me'))
      .toBeVisible();

    // $evidenceFind was stamped by renderPlasm before the deferred goto.
    expect(await getVar(page, 'evidenceFind').then(v => v && v.tool)).toBe('plasm');

    // Back link returns the player to HuntRun.
    await page.locator('.passage').getByText('Back', { exact: true }).click();
    await page.waitForFunction(() => SugarCube.State.passage === 'HuntRun');
  });

  test('GWB hit in hunt mode routes to GwbFound', async () => {
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickHuntCard(page);
    await ensureNotEmptyBag(page);
    await clickLink(page, 'Enter the hunt', 'HuntRun');

    await stubPerTickGatesQuiet(page);
    await fastToolTicks(page);
    await page.evaluate(() => {
      SugarCube.setup.ToolController.findGwb = () => ({
        pack: { prefix: 'mechanics/gwb/', start: 1, end: 18, ext: '.jpg' },
        message: SugarCube.setup.ToolController.Messages.gwb
      });
    });

    const gwbCard = page.locator('.hunt-tool-card').filter({ hasText: 'GWB' });
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
    await page.waitForFunction(() => SugarCube.State.passage === 'HuntRun');
  });

  test('Spiritbox click with the lights on prompts the player to kill the lights first', async () => {
    /* Lights-off is a tool-wide rule
       (setup.searchToolDefs.spiritbox.needsLightCheck): the hunt
       tool slot must short-circuit a click while the room is lit
       and route the catalogue prompt into the shared result tray
       instead of starting a meter. Mirrors classic <<searchTool>>'s
       lights-off guard so the rule is enforced in both modes. */
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickHuntCard(page);
    await ensureNotEmptyBag(page);
    await clickLink(page, 'Enter the hunt', 'HuntRun');

    // Force the current hunt room to LIT before the click. The
    // huntFooterLight widget normally toggles this, but pinning
    // it via the controller skips the click + re-render dance.
    await page.evaluate(() => {
      const id = SugarCube.setup.HuntController.currentRoomId();
      SugarCube.setup.HuntController.setRoomLight(id, SugarCube.setup.RoomLight.LIT);
    });
    expect(await callSetup(page, 'setup.HuntController.isCurrentRoomDark()')).toBe(false);

    const spiritboxCard = page.locator('.hunt-tool-card').filter({ hasText: 'Spiritbox' });
    await expect(spiritboxCard).toHaveCount(1);
    await spiritboxCard.locator('a').click();

    // Tray surfaces the lights-off prompt; meter never starts.
    await expect(
      page.locator('#hunt-tool-result').getByText(/turn off the light first/i)
    ).toBeVisible();
    expect(await page.evaluate(() => SugarCube.State.passage)).toBe('HuntRun');
  });

  test('Spiritbox click with the lights off proceeds into the meter cycle', async () => {
    /* Negative companion test of the lights-off guard: with the
       current room dark, the spiritbox click must drop into the
       same <<repeat>> meter loop the other tools use, not the
       lights-off prompt. */
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickHuntCard(page);
    await ensureNotEmptyBag(page);
    await clickLink(page, 'Enter the hunt', 'HuntRun');

    await page.evaluate(() => {
      const id = SugarCube.setup.HuntController.currentRoomId();
      SugarCube.setup.HuntController.setRoomLight(id, SugarCube.setup.RoomLight.DARK);
    });
    expect(await callSetup(page, 'setup.HuntController.isCurrentRoomDark()')).toBe(true);

    const spiritboxCard = page.locator('.hunt-tool-card').filter({ hasText: 'Spiritbox' });
    await spiritboxCard.locator('a').click();

    // Lit-state prompt must NOT appear; the click landed in the
    // meter branch instead. .disabled-link is added to .cardlink
    // (the inner span the click handler annotates) for the
    // duration of the cycle.
    await expect(
      page.locator('#hunt-tool-result').getByText(/turn off the light first/i)
    ).toHaveCount(0);
    await expect(spiritboxCard.locator('.cardlink')).toHaveClass(/disabled-link/);
  });

  test('Ectoglass miss in hunt mode renders not-found in the tray (no goto)', async () => {
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickHuntCard(page);
    await ensureNotEmptyBag(page);
    await clickLink(page, 'Enter the hunt', 'HuntRun');

    await stubPerTickGatesQuiet(page);
    await fastToolTicks(page);
    await page.evaluate(() => {
      SugarCube.setup.ToolController.findPlasm = () => null;
    });

    const ectoCard = page.locator('.hunt-tool-card').filter({ hasText: 'Ectoglass' });
    await ectoCard.locator('a').click();

    // Tray shows the canonical "no ectoplasm stains" copy after the
    // meter completes; player stays on HuntRun.
    await expect(
      page.locator('#hunt-tool-result').getByText(/ectoplasm stains/i)
    ).toBeVisible();
    expect(await page.evaluate(() => SugarCube.State.passage)).toBe('HuntRun');
  });

  test('furniture strip renders one icon per template slot for the current room', async () => {
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickHuntCard(page);
    await clickLink(page, 'Enter the hunt', 'HuntRun');

    // The hallway template has 3 furniture suffixes; each renders an
    // icon in the .hunt-run-furniture strip.
    const hallwayFurniture = await callSetup(page, 'setup.Templates.byId("hallway").furniture');
    expect(hallwayFurniture.length).toBeGreaterThan(0);
    await expect(page.locator('.hunt-run-furniture .hunt-furniture-item'))
      .toHaveCount(hallwayFurniture.length);
  });

  test('furniture row no longer shows loot kind labels (no spoilers)', async () => {
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickHuntCard(page);
    // Walk into the room that holds the cursed-item loot so the row
    // would have rendered a "Cursed item" label under the old layout.
    const fp = await getVar(page, 'run').then(r => r.floorplan);
    const cursedRoom = fp.loot.cursedItem;
    await page.evaluate(id => SugarCube.setup.HuntController.setCurrentRoom(id), cursedRoom);
    await goToPassage(page, 'HuntRun');

    // The deprecated label class should not appear in the DOM.
    await expect(page.locator('.hunt-furniture-loot')).toHaveCount(0);
    // Plain-text spoiler check too.
    await expect(
      page.locator('.hunt-run-furniture').getByText(/Cursed item/i)
    ).toHaveCount(0);
  });

  test('clicking the loot furniture finds the item and marks it collected', async () => {
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickHuntCard(page);
    /* Wipe the auto-rolled modifier deck (and any locked_tools-driven
       tool loot it pinned onto base-loot furniture slots). With
       locked_tools active a single slot can hold both cursedItem and a
       tool, and FurnitureSearch then takes the multi-kind branch with
       "huntLootBeat" instead of the single-kind text the regex below
       expects. modifierCount:0 keeps the floor plan to its base layout
       so the click target is unambiguous. */
    await ensureNotEmptyBag(page);

    // Place the player in the room+slot one of the four base loot
    // kinds is hidden in. The floor-plan generator might land
    // cursedItem on a furniture-less template (roomA/B/C); skip past
    // those so the click target is always a real slot.
    const fp = await getVar(page, 'run').then(r => r.floorplan);
    const BASE_KINDS = ['cursedItem', 'rescueClue', 'tarotCards', 'monkeyPaw'];
    const lootKind = BASE_KINDS.find(k => fp.lootFurniture[k]);
    expect(lootKind).toBeDefined();
    const lootRoom      = fp.loot[lootKind];
    const lootFurniture = fp.lootFurniture[lootKind];
    await page.evaluate(id => SugarCube.setup.HuntController.setCurrentRoom(id), lootRoom);
    await goToPassage(page, 'HuntRun');

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
      `setup.HuntController.currentRoomData().furniture.find(f => f.suffix === "${lootFurniture}").label`);
    await page.locator('.hunt-furniture-item')
      .filter({ hasText: fLabel })
      .first()
      .click();
    await page.waitForFunction(() => SugarCube.State.passage === 'FurnitureSearch');
    await expect(
      page.locator('.passage').getByText(LOOT_TEXT[lootKind])
    ).toBeVisible();

    // takeLoot should have been called.
    expect(await callSetup(page, `setup.HuntController.hasCollected("${lootKind}")`)).toBe(true);

    // Walking back to the same slot should now find nothing.
    await clickLink(page, 'Back', 'HuntRun');
    await page.locator('.hunt-furniture-item')
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
    await clickHuntCard(page);
    await clickLink(page, 'Enter the hunt', 'HuntRun');

    // GhostStreet resets to midnight; verify we start at 00:00.
    expect(await getVar(page, 'hours')).toBe(0);
    expect(await getVar(page, 'minutes')).toBe(0);

    // Click any furniture in the hallway.
    await page.locator('.hunt-furniture-item').first().click();
    await page.waitForFunction(() => SugarCube.State.passage === 'FurnitureSearch');

    // Each search should burn one in-game minute, mirroring regular hunts.
    expect(await getVar(page, 'minutes')).toBe(1);
    expect(await getVar(page, 'hours')).toBe(0);
  });

  test('per-tick chain runs on tool click: applies stat drains and time', async () => {
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickHuntCard(page);
    await ensureNotEmptyBag(page);
    await clickLink(page, 'Enter the hunt', 'HuntRun');

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
    await page.locator('.hunt-tool-card').first().locator('a').click();
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
    await clickHuntCard(page);
    await clickLink(page, 'Enter the hunt', 'HuntRun');
    await page.evaluate(() => { Math.random = () => 0.99; });

    expect(await getVar(page, 'minutes')).toBe(0);

    // Click the first nav exit.
    await page.locator('.hunt-run-nav a').first().click();
    await page.waitForFunction(() => SugarCube.State.variables.minutes >= 1);
    expect(await getVar(page, 'minutes')).toBe(1);
  });

  test('sanity collapse during a hunt tool tick routes to HuntSummary as failure', async () => {
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickHuntCard(page);
    await ensureNotEmptyBag(page);
    await clickLink(page, 'Enter the hunt', 'HuntRun');
    await page.evaluate(() => { Math.random = () => 0.99; });
    await fastToolTicks(page);

    // Set the MC up so the meter's completion <<applyTickEffects>>
    // collapses sanity.
    await page.evaluate(() => { SugarCube.State.variables.mc.sanity = 0.1; });

    await page.locator('.hunt-tool-card').first().locator('a').click();

    // The widget's post-applyTickEffects guard routes to
    // huntOverPassage("sanity") -> HuntSummary.
    await page.waitForFunction(() => SugarCube.State.passage === 'HuntSummary');

    // The run is closed and stamped with the sanity reason.
    expect(await getVar(page, 'run')).toBeNull();
    await expect(
      page.locator('.passage').getByText(/sanity gone/i)
    ).toBeVisible();
  });

  test('per-tick chain in the hunt triggers GhostHuntEvent when shouldStartRandomProwl fires', async () => {
    test.setTimeout(15_000);

    /* The huntTickStep widget calls huntTickEventChain, which goes
       through HuntController.shouldStartRandomProwl. With timer
       state pre-stamped past the threshold and Math.random pinned
       low, a single tool tick should land on GhostHuntEvent. */
    await goToPassage(page, 'GhostStreet');
    await clickHuntCard(page);
    await ensureNotEmptyBag(page);
    await clickLink(page, 'Enter the hunt', 'HuntRun');

    await page.evaluate(() => {
      const V = SugarCube.State.variables;
      V.prowlActivated = 0;
      V.prowlTimeRemain = 0;
      V.elapsedTimeProwl = 0;
      V.prowlActivationTime = 0;
      V.mc.sanity = 30; // satisfies every sanity-cutoff ghost
      V.mc.lust = 60;   // satisfies lust-condition ghosts too
      V.mc.energy = 5;  // keep applyTickEffects from triggering exhaustion
      // Pin the hunt ghost to Shade so its prowlCondition (sanity<=55) trips.
      SugarCube.setup.HuntController.setField('ghostName', 'Shade');
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
    await page.locator('.hunt-tool-card').first().locator('a').click();
    await page.waitForFunction(() =>
      ['GhostHuntEvent', 'EventMC', 'StealClothes'].includes(SugarCube.State.passage),
      null,
      { timeout: 10_000 }
    );
    expect(await getVar(page, 'run')).not.toBeNull();
  });

  test('hunt-survival options in GhostHuntEvent are reachable in hunt mode', async () => {
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickHuntCard(page);
    await clickLink(page, 'Enter the hunt', 'HuntRun');

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

  test('PrayHunt (with energy) returns to HuntRun via $return in hunt mode', async () => {
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickHuntCard(page);
    await clickLink(page, 'Enter the hunt', 'HuntRun');

    // Pre-load enough sanity / energy so PrayHunt doesn't bail out
    // through a hunt-over passage.
    await page.evaluate(() => {
      SugarCube.State.variables.mc.sanity = 80;
      SugarCube.State.variables.mc.energy = 4;
    });

    await goToPassage(page, 'PrayHunt');
    await page.locator('.passage').getByText('Continue').first().click();
    await page.waitForFunction(() => SugarCube.State.passage === 'HuntRun');
  });

  test('FreezeHunt with no garments routes to HuntSummary as a "sanity" failure in hunt mode', async () => {
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickHuntCard(page);
    await clickLink(page, 'Enter the hunt', 'HuntRun');

    // Strip the MC bare so FreezeHunt's "nothing left to give" branch fires.
    await page.evaluate(() => {
      SugarCube.setup.Wardrobe.stripToNaked();
    });
    await goToPassage(page, 'FreezeHunt');

    // The "Surrender to the cold" link delegates its target to
    // setup.HuntController.huntOverPassage("sanity") which returns
    // "HuntSummary" in hunt mode and stamps failureReason="sanity"
    // on the run before it's cleared by HuntSummary's endHunt call.
    // We assert on the HuntSummary-rendered text since the run record
    // is null by the time the assertion runs.
    await page.locator('.passage').getByText(/Surrender to the cold/i).click();
    await page.waitForFunction(() => SugarCube.State.passage === 'HuntSummary');

    expect(await getVar(page, 'run')).toBeNull();
    await expect(
      page.locator('.passage').getByText(/sanity gone/i)
    ).toBeVisible();
  });

  test('Empty Bag modifier collapses the hunt toolbar to a placeholder', async () => {
    test.setTimeout(15_000);

    /* The toolbar reads from setup.HuntController.startingTools(), which folds
       Empty Bag ('locked_tools') down to []. The widget renders the
       "your bag is empty" placeholder instead of the six tool cards. */
    await page.evaluate(() => {
      SugarCube.setup.HuntController.startHunt({
        seed: 1, modifiers: ['locked_tools'], modifierCount: 0
      });
      // startHunt overwrites modifiers from the draft; pin to just
      // locked_tools so we know the bag is empty for sure.
      SugarCube.State.variables.run.modifiers = ['locked_tools'];
    });
    await goToPassage(page, 'HuntRun');

    await expect(page.locator('.hunt-run-tools .hunt-tool-card')).toHaveCount(1);
    await expect(page.locator('.hunt-run-tools .hunt-tool-card-empty'))
      .toBeVisible();
    await expect(page.locator('.hunt-run-tools a')).toHaveCount(0);
  });

  test('loadout.tools restricts the hunt toolbar to the listed tools', async () => {
    test.setTimeout(15_000);

    await page.evaluate(() => {
      SugarCube.setup.HuntController.startHunt({
        seed: 1,
        loadout: { tools: ['emf', 'uvl'] }
      });
    });
    await goToPassage(page, 'HuntRun');

    // Two cards rendered (in canonical order: emf before uvl).
    await expect(page.locator('.hunt-run-tools .hunt-tool-card')).toHaveCount(2);
    await expect(page.locator('.hunt-run-tools a').first())
      .toContainText(/EMF/);
    await expect(page.locator('.hunt-run-tools a').nth(1))
      .toContainText(/UVL/);
  });

  test('hunt ghost catch routes through HuntEnd → HuntSummary as a "caught" failure', async () => {
    test.setTimeout(20_000);

    /* HuntEnd's bottom-of-passage cleanup runs through
       setup.HuntController.onCaughtCleanup() and the huntEndExit
       widget routes its post-scene exit through huntCaughtPassage();
       in hunt mode that stamps a "caught" failure and returns
       "HuntSummary". The e2e check here is that those helpers route
       a real run end-to-end -- the widget rendering + linkappend
       fan-out is covered by the classic hunt-flow tests. */
    await goToPassage(page, 'GhostStreet');
    await clickHuntCard(page);
    await clickLink(page, 'Enter the hunt', 'HuntRun');

    // huntCaughtPassage() in hunt mode stamps the failure reason
    // and returns the destination passage.
    const target = await callSetup(page, 'setup.HuntController.huntCaughtPassage()');
    expect(target).toBe('HuntSummary');
    expect(await callSetup(page, 'setup.HuntController.field("outcome")')).toBe('failure');
    expect(await callSetup(page, 'setup.HuntController.field("failureReason")')).toBe('caught');

    // onCaughtCleanup is a no-op in the hunt (cleanup happens on
    // HuntSummary via setup.HuntController.endHunt) -- crucially, it must NOT
    // try to call setup.HauntedHouses.endHunt() (which would crash
    // when $hunt is null).
    await page.evaluate(() => SugarCube.setup.HuntController.onCaughtCleanup());
    expect(await callSetup(page, 'setup.HuntController.isActive()')).toBe(true);

    // Snapshot the failure payout BEFORE HuntSummary clears the run.
    const expectedFailure = await page.evaluate(() =>
      Math.round(3 * SugarCube.setup.Modifiers.payoutMultiplier()));

    // Walking into HuntSummary closes the run as a failure.
    await goToPassage(page, 'HuntSummary');
    expect(await getVar(page, 'run')).toBeNull();
    expect(await getVar(page, 'ectoplasm')).toBe(expectedFailure);
    await expect(
      page.locator('.passage').getByText(/ends in failure/i)
    ).toBeVisible();
  });

  test('ghost-room drift fires for the hunt ghost across 20-minute intervals', async () => {
    test.setTimeout(15_000);

    /* PassageDone calls setup.HuntController.shuffleGhostRoom which
       gates on a 20-minute interval and a 45% roll. We start a run,
       force the roll to 0 (drift fires) and walk the clock through
       interval boundaries; the ghost room must end up somewhere
       different from where it started. */
    await goToPassage(page, 'GhostStreet');
    await clickHuntCard(page);
    await ensureNotEmptyBag(page);
    await clickLink(page, 'Enter the hunt', 'HuntRun');

    // Pin the hunt ghost to one that DOES drift (not Goryo).
    await page.evaluate(() => {
      SugarCube.setup.HuntController.setField('ghostName', 'Shade');
    });

    const initial = await callSetup(page, 'setup.HuntController.ghostRoomId()');

    // Force a fresh interval window + the drift roll.
    await page.evaluate(() => {
      SugarCube.State.variables.lastChangeIntervalRoom = '';
      SugarCube.State.variables.minutes = 25; // 20-39 window
      Math.random = () => 0;
    });
    await page.evaluate(() => SugarCube.setup.HuntController.shuffleGhostRoom());

    // Drift should have moved the ghost (since Math.random=0 < 0.45)
    // somewhere different from `initial`. The destination is drawn from
    // the full plan minus the current spawn -- hallway is intentionally
    // a valid drift target (see driftGhostRoom comment).
    const fp = await callSetup(page, 'setup.HuntController.field("floorplan")');
    if (fp.rooms.length > 1) {
      expect(await callSetup(page, 'setup.HuntController.ghostRoomId()')).not.toBe(initial);
    }
  });

  test('Goryo (staysInOneRoom) never drifts in hunt mode', async () => {
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickHuntCard(page);
    await ensureNotEmptyBag(page);
    await clickLink(page, 'Enter the hunt', 'HuntRun');

    // Pin the hunt ghost to Goryo, which has staysInOneRoom = true.
    await page.evaluate(() => {
      SugarCube.setup.HuntController.setField('ghostName', 'Goryo');
    });

    const initial = await callSetup(page, 'setup.HuntController.ghostRoomId()');

    // Even with the roll forced + a fresh interval, Goryo's lair
    // mustn't move.
    await page.evaluate(() => {
      SugarCube.State.variables.lastChangeIntervalRoom = '';
      SugarCube.State.variables.minutes = 25;
      Math.random = () => 0;
    });
    await page.evaluate(() => SugarCube.setup.HuntController.shuffleGhostRoom());

    expect(await callSetup(page, 'setup.HuntController.ghostRoomId()')).toBe(initial);
  });

  test('hunt picks up the tarot deck via FurnitureSearch and Bag opens TarotCards', async () => {
    test.setTimeout(20_000);

    /* Tarot pickup parity: the hunt's FurnitureSearch branch routes
       through the same PickupTarotCards include + markTarotCarrying
       call classic uses, so $tarotCardsStage flips to CARRYING and
       the Bag link becomes visible. */
    await goToPassage(page, 'GhostStreet');
    await clickHuntCard(page);
    await ensureNotEmptyBag(page);

    // Walk the player to the room+slot the deck is hidden in.
    const fp = await getVar(page, 'run').then(r => r.floorplan);
    const tarotRoom      = fp.loot.tarotCards;
    const tarotFurniture = fp.lootFurniture.tarotCards;
    expect(tarotRoom).toBeDefined();
    expect(tarotFurniture).toBeDefined();

    await page.evaluate(id => SugarCube.setup.HuntController.setCurrentRoom(id), tarotRoom);
    await goToPassage(page, 'HuntRun');

    const fLabel = await callSetup(page,
      `setup.HuntController.currentRoomData().furniture.find(f => f.suffix === "${tarotFurniture}").label`);
    await page.locator('.hunt-furniture-item')
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
    expect(await callSetup(page, 'setup.HuntController.hasCollected("tarotCards")')).toBe(true);

    // Walk back into HuntRun and open Bag -- the tarot link must be visible.
    await clickLink(page, 'Back', 'HuntRun');
    await page.evaluate(() => SugarCube.Engine.play('Bag'));
    await page.waitForFunction(() => SugarCube.State.passage === 'Bag');
    await expect(
      page.locator('.passage').getByText('Look at the deck', { exact: true })
    ).toBeVisible();
  });

  test('hunt picks up the monkey paw via FurnitureSearch and Bag opens MonkeyPaw', async () => {
    test.setTimeout(20_000);

    await goToPassage(page, 'GhostStreet');
    await clickHuntCard(page);
    await ensureNotEmptyBag(page);

    const fp = await getVar(page, 'run').then(r => r.floorplan);
    const pawRoom      = fp.loot.monkeyPaw;
    const pawFurniture = fp.lootFurniture.monkeyPaw;
    expect(pawRoom).toBeDefined();
    expect(pawFurniture).toBeDefined();

    await page.evaluate(id => SugarCube.setup.HuntController.setCurrentRoom(id), pawRoom);
    await goToPassage(page, 'HuntRun');

    const fLabel = await callSetup(page,
      `setup.HuntController.currentRoomData().furniture.find(f => f.suffix === "${pawFurniture}").label`);
    await page.locator('.hunt-furniture-item')
      .filter({ hasText: fLabel })
      .first()
      .click();
    await page.waitForFunction(() => SugarCube.State.passage === 'FurnitureSearch');
    await page.locator('.passage').getByText('paw.', { exact: true }).click();

    expect(await callSetup(page, 'setup.MonkeyPaw.isFound()')).toBe(true);
    expect(await callSetup(page, 'setup.HuntController.hasCollected("monkeyPaw")')).toBe(true);

    await clickLink(page, 'Back', 'HuntRun');
    await page.evaluate(() => SugarCube.Engine.play('Bag'));
    await page.waitForFunction(() => SugarCube.State.passage === 'Bag');
    await expect(
      page.locator('.passage').getByText('Look at the paw', { exact: true })
    ).toBeVisible();
    expect(await callSetup(page, 'setup.MonkeyPaw.isCarrying()')).toBe(true);
  });

  test('hunt tarot draw fires the Knowledge effect and stamps $chosenEvidence', async () => {
    test.setTimeout(20_000);

    /* Pre-set conditions so the deck draw lands on the Knowledge card
       (the only card with a deterministic state mutation we can pin
       without triggering passage transitions). The card weights from
       setup.tarotDeck place Knowledge after Passion+Pulse (40% combined),
       so a roll of 41 (out of 101) lands on Knowledge. */
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 1 }));
    await page.evaluate(() => {
      SugarCube.setup.HuntController.setField('ghostName', 'Shade');
      // Re-stamp run.evidence to match Shade so any hunt modifier
      // (e.g. Fog of War) drafted at startHunt doesn't leak the
      // previous ghost's spliced list into Shade's evidence view.
      const shade = SugarCube.setup.Ghosts.getByName('Shade');
      SugarCube.setup.HuntController.setField('evidence', shade.evidence.map(e => e.id));
    });
    await page.evaluate(() => SugarCube.setup.HauntedHouses.markTarotCarrying());
    await goToPassage(page, 'HuntRun');

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
    // Shade lacks spiritbox/uvl/glass; hunt knowledge picks one.
    expect(['spiritbox', 'uvl', 'glass']).toContain(chosen);

    // Drawn-cards counter incremented (shared classic counter).
    expect(await getVar(page, 'drawnCards')).toBe(1);
  });

  test('hunt monkey-paw dawn wish forfeits the run as "time" failure', async () => {
    test.setTimeout(20_000);

    await goToPassage(page, 'GhostStreet');
    await clickHuntCard(page);
    await ensureNotEmptyBag(page);
    await clickLink(page, 'Enter the hunt', 'HuntRun');

    // Hand the player the paw without going through pickup.
    await page.evaluate(() => SugarCube.setup.MonkeyPaw.markFound());
    await goToPassage(page, 'MonkeyPaw');

    // The dawn wish renders an "I wish for dawn" link only when
    // it's been learned; pre-learn it so the link surfaces.
    await page.evaluate(() => SugarCube.setup.MonkeyPaw.markLearned('dawn'));
    await goToPassage(page, 'MonkeyPaw');

    await page.locator('.passage').getByText('I wish for dawn', { exact: true }).click();

    // The dawn wish goto resolves through HuntController.huntOverPassage("time")
    // which in the hunt stamps "time" failure + returns "HuntSummary".
    await page.waitForFunction(() => SugarCube.State.passage === 'HuntSummary');
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
       confirm the pickup beat, return to HuntRun, and the toolbar
       gains the picked-up tool card. */
    await page.evaluate(() => {
      // Start a fresh run with locked_tools pinned so the toolbar
      // begins empty and missingToolsToPlace returns the full set.
      SugarCube.setup.HuntController.startHunt({
        seed: 9, modifierCount: 0
      });
      // Pin locked_tools post-draft so the placement was based on
      // the pre-startHunt modifier set; rebuild the floor plan
      // with the missing tools stamped in.
      SugarCube.setup.HuntController.addModifier('locked_tools');
      const fp = SugarCube.setup.FloorPlan.generate(9, {
        roomCount: 7,
        toolKinds: SugarCube.setup.searchToolOrder.slice()
      });
      SugarCube.setup.HuntController.setField('floorplan', fp);
    });
    await goToPassage(page, 'HuntRun');

    // Toolbar is empty.
    await expect(page.locator('.hunt-run-tools .hunt-tool-card-empty')).toBeVisible();
    await expect(page.locator('.hunt-run-tools .hunt-tool-card')).toHaveCount(1);

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

    await page.evaluate(id => SugarCube.setup.HuntController.setCurrentRoom(id), room);
    await goToPassage(page, 'HuntRun');

    const fLabel = await callSetup(page,
      `setup.HuntController.currentRoomData().furniture.find(f => f.suffix === "${fSlot}").label`);
    await page.locator('.hunt-furniture-item')
      .filter({ hasText: fLabel })
      .first()
      .click();
    await page.waitForFunction(() => SugarCube.State.passage === 'FurnitureSearch');

    await expect(
      page.locator('.passage').getByText(/piece of hunting/i)
    ).toBeVisible();
    await page.locator('.passage').getByText('equipment.', { exact: true }).click();
    expect(await callSetup(page, `setup.HuntController.hasCollected("${toolKey}")`)).toBe(true);

    // Return to HuntRun. Toolbar now includes the picked-up tool.
    await clickLink(page, 'Back', 'HuntRun');
    expect(await callSetup(page, 'setup.HuntController.startingTools()')).toEqual([toolId]);
    await expect(page.locator('.hunt-run-tools .hunt-tool-card')).toHaveCount(1);
    await expect(page.locator('.hunt-run-tools .hunt-tool-card-empty')).toHaveCount(0);
    await expect(page.locator('.hunt-run-tools a')).toHaveCount(1);
  });

  test('multi-item furniture slot reveals every loot kind in a single search', async () => {
    test.setTimeout(20_000);

    /* When the floor-plan generator stacks multiple loot kinds on
       the same furniture slot (it falls back to sharing when a room
       runs out of unique slots), one search should surface all of
       them at once -- the player never has to click the same drawer
       twice. The compact <<huntLootBeat>> widget renders one short
       line per kind and marks it collected; the back-button is one
       click away. */
    await page.evaluate(() => {
      SugarCube.setup.HuntController.startHunt({ seed: 1, modifierCount: 0 });
      // Hand-crafted plan: kitchen at room_1 holds tarot + paw + an EMF
      // pickup all on the desk slot. The player walks in and clicks
      // once.
      SugarCube.setup.HuntController.setField('floorplan', {
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
      SugarCube.setup.HuntController.setCurrentRoom('room_1');
    });
    await goToPassage(page, 'HuntRun');

    // Click the desk slot.
    await page.locator('.hunt-furniture-item')
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
    expect(await callSetup(page, 'setup.HuntController.hasCollected("tarotCards")')).toBe(true);
    expect(await callSetup(page, 'setup.HuntController.hasCollected("monkeyPaw")')).toBe(true);
    expect(await callSetup(page, 'setup.HuntController.hasCollected("tool_emf")')).toBe(true);

    // Carry-stage flips happened (Bag link surfaces the deck + paw).
    expect(await callSetup(page, 'setup.HauntedHouses.tarotCardsStage()'))
      .toBe(await callSetup(page, 'setup.TarotStage.CARRYING'));
    expect(await callSetup(page, 'setup.MonkeyPaw.isFound()')).toBe(true);

    // A re-search of the same slot now finds nothing.
    await clickLink(page, 'Back', 'HuntRun');
    await page.locator('.hunt-furniture-item')
      .filter({ hasText: 'Desk' })
      .first()
      .click();
    await page.waitForFunction(() => SugarCube.State.passage === 'FurnitureSearch');
    await expect(
      page.locator('.passage').getByText(/nothing of note/i)
    ).toBeVisible();
  });

  /* The "Start a new hunt" link on HuntSummary chains runs without
     bouncing through the city map; the exit re-enters HuntStart,
     which auto-rolls a fresh seed + modifier deck and stamps a new
     $run. */
  test('HuntSummary offers Start a new hunt that rolls a fresh run', async () => {
    test.setTimeout(15_000);
    await goToPassage(page, 'GhostStreet');
    await clickHuntCard(page);
    await clickLink(page, 'Enter the hunt', 'HuntRun');
    await page.evaluate(() => SugarCube.setup.HuntController.markSuccess());
    await goToPassage(page, 'HuntSummary');
    expect(await getVar(page, 'run')).toBeNull();
    expect(await getVar(page, 'runsStarted')).toBe(1);

    await clickLink(page, 'Start a new hunt', 'HuntStart');
    const run = await getVar(page, 'run');
    expect(run).not.toBeNull();
    expect(run.number).toBe(2);
    expect(await getVar(page, 'runsStarted')).toBe(2);
  });

  /* Continuation gate: a failed identify (or any non-success exit
     like FLED / SANITY / TIME / EXHAUSTION) hides the "Start a new
     hunt" link on HuntSummary, so the player has to step through
     the city map before queueing the next run. */
  test('HuntSummary hides Start a new hunt after a failed run', async () => {
    test.setTimeout(15_000);
    await goToPassage(page, 'GhostStreet');
    await clickHuntCard(page);
    await clickLink(page, 'Enter the hunt', 'HuntRun');
    await page.evaluate(() => SugarCube.setup.HuntController.markFailure());
    await goToPassage(page, 'HuntSummary');
    await expect(page.locator('.passage').getByText('Start a new hunt')).toHaveCount(0);
    await expect(page.locator('.passage').getByText('Continue')).toBeVisible();
  });
});
