const { test, expect } = require('@playwright/test');
const { openGame, resetGame, getVar, goToPassage, callSetup, ensureOpenPage, seedRandom } = require('../helpers');

/* End-to-end hunt lifecycle: GhostStreet → HuntStart → HuntRun →
   HuntOver* / CityMap (endings settle the run inline via endHunt),
   plus the witch's ectoplasm storefront (WitchEctoplasm). Exercises
   the actual passage flow so any wiring break (missing link text,
   broken setField call, wrong passage transition) shows up here. */
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
    /* GhostStreet's huntCard is hidden until the witch's ectoplasm-
       unlock quest is complete. New games start with the quest
       NOT_OFFERED, so without flipping it every test would land on a
       GhostStreet with no rogue card to click. Wait for $mc to be
       re-initialised by StoryInit before mutating it -- resetGame only
       blocks until the first passage renders, which can race the
       variable rebind. */
    await page.waitForFunction(() => SugarCube.State.variables.mc != null);
    await page.evaluate(() => {
      SugarCube.State.variables.mc.lvl = 4;
      SugarCube.setup.Witch.completeEctoplasmQuest();
    });
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

    // 3. Win the run. Stamp the success outcome and settle the run
    // through endHunt; the in-game flow gates this behind a correct
    // ghost identification, but for lifecycle coverage we drive the
    // outcome directly. (HuntSummary was removed -- the helpers now
    // settle the run inline and route straight to the city map.)
    await page.evaluate(() => SugarCube.setup.HuntController.markSuccess());
    await page.evaluate(() => SugarCube.setup.HuntController.endHunt(true));

    // endHunt clears the run and pays out ectoplasm (mL).
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
    expect(await page.evaluate(() => SugarCube.setup.HuntShop.rerollCharges())).toBe(1);
  });

  test('losing a run still pays out failure-base * deck multiplier of ectoplasm', async () => {
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickHuntCard(page);
    await clickLink(page, 'Enter the hunt', 'HuntRun');
    const expected = await page.evaluate(() =>
      Math.round(3 * SugarCube.setup.Modifiers.payoutMultiplier()));
    await page.evaluate(() => SugarCube.setup.HuntController.markFailure());
    await page.evaluate(() => SugarCube.setup.HuntController.endHunt(false));

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

  test('hunt exit nav auto-shrinks to fit its bounding box when the current room has many neighbours', async () => {
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickHuntCard(page);
    await clickLink(page, 'Enter the hunt', 'HuntRun');

    // The procedurally-rolled floor plan doesn't reliably produce a
    // >3-exit room every run, so synthesise that case by injecting
    // extra edges; the live count is read from FloorPlan.neighborsOf
    // (the same source currentRoomData consults), so adding edges to
    // fp.edges is the minimum mutation needed.
    const hubId = await page.evaluate(() => {
      const fp = SugarCube.State.variables.run.floorplan;
      const hub = fp.rooms[0];
      const others = fp.rooms.filter(r => r.id !== hub.id).slice(0, 4);
      others.forEach(o => fp.edges.push([hub.id, o.id]));
      return hub.id;
    });

    await page.evaluate(id => SugarCube.setup.HuntController.setCurrentRoom(id), hubId);
    await goToPassage(page, 'HuntRun');

    // HuntNavFit runs in a requestAnimationFrame after :passagedisplay,
    // so wait for it to finish shrinking before we measure overflow.
    await page.waitForFunction(() => {
      const nav = document.querySelector('.hunt-run-nav');
      return nav && nav.style.height !== '';
    });

    const dims = await page.evaluate(() => {
      const nav = document.querySelector('.hunt-run-nav');
      if (!nav) return null;
      return {
        scrollHeight: nav.scrollHeight,
        clientHeight: nav.clientHeight,
        linkCount: nav.querySelectorAll('a').length,
      };
    });
    expect(dims).not.toBeNull();
    expect(dims.linkCount).toBeGreaterThan(3);
    // Auto-fit shrinks the font until the natural content height fits
    // inside the bounding box -- so scrollHeight should never exceed
    // clientHeight (allow a 2px slack for sub-pixel rounding).
    expect(dims.scrollHeight).toBeLessThanOrEqual(dims.clientHeight + 2);
  });

  /* The exit-nav box is fixed to the viewport and sized by HuntNavFit so
     it occupies the strip between the HUD bar's bottom edge and the
     viewport bottom. A regression where the HUD bar isn't measurable at
     fit() time (or where the SVG/layout pushes the HUD off-screen) would
     either stretch the nav over the whole viewport or collapse it to 0 --
     both have shipped before. This locks the geometry. */
  test('hunt exit nav stays anchored to the HUD bar bottom, not the full viewport', async () => {
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickHuntCard(page);
    await clickLink(page, 'Enter the hunt', 'HuntRun');

    await page.waitForFunction(() => {
      const nav = document.querySelector('.hunt-run-nav');
      return nav && nav.style.height !== '';
    });

    const geom = await page.evaluate(() => {
      const nav = document.querySelector('.hunt-run-nav');
      const hud = document.querySelector('.hunt-run-hud');
      if (!nav || !hud) return null;
      const navR = nav.getBoundingClientRect();
      const hudR = hud.getBoundingClientRect();
      return {
        viewportH: window.innerHeight,
        navTop: navR.top,
        navBottom: navR.bottom,
        navHeight: navR.height,
        hudBottom: hudR.bottom,
        hudTop: hudR.top,
      };
    });
    expect(geom).not.toBeNull();
    /* Nav's top edge sits just below the HUD bar (HuntNavFit adds a small
       4px gap). If a render-timing bug leaves hud unmeasured, fit() falls
       back to topPx = 4 and the nav stretches over the whole viewport. */
    expect(geom.navTop).toBeGreaterThanOrEqual(geom.hudBottom);
    expect(geom.navTop - geom.hudBottom).toBeLessThanOrEqual(10);
    /* Nav must not poke above the HUD bar. */
    expect(geom.navTop).toBeGreaterThan(geom.hudTop);
    /* Nav's bottom edge is near the viewport bottom (CSS bottom: 0.5em). */
    expect(geom.viewportH - geom.navBottom).toBeLessThanOrEqual(20);
    /* And it must actually have a non-trivial height -- a 0-height nav
       would silently hide every exit link. */
    expect(geom.navHeight).toBeGreaterThan(20);
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

    // Contributor chips render in their own vertical list on the left
    // edge of the bottom region (.hunt-run-effects); the centered stats
    // row (.hunt-conditions) carries only the per-step deltas.
    const effects = page.locator('.hunt-run-bottom .hunt-run-effects');
    // Baseline: no Lust contributor chip (mc.lust starts at 0).
    await expect(effects).not.toContainText('Lust ≥');

    // Cross the LUST_FUEL_THRESHOLD (50) without re-rendering the
    // passage -- the HUD should pick this up only after the tool-tick
    // refresh, which mirrors classic's nav re-render.
    await page.evaluate(() => { SugarCube.State.variables.mc.lust = 60; });

    // Click any tool; the huntToolSlot refreshes the full HUD trio
    // (stats / effects / actions) after applyTickEffects.
    await page.locator('.hunt-tool-card').first().locator('a').click();
    await page.waitForFunction(() => SugarCube.State.variables.minutes >= 6);

    await expect(effects).toContainText('Lust ≥ 50');
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

  test('startHunt stamps a ghost on $run and HuntController.activeGhost() returns it', async () => {
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickHuntCard(page);

    const run = await getVar(page, 'run');
    expect(run.ghostName).toBeTruthy();

    // No witch contract is open, but setup.HuntController.activeGhost() must hand
    // back the hunt ghost so the shared <<toolCheck>> path can read
    // its evidence list.
    const activeName = await callSetup(page, 'setup.HuntController.activeGhost().name');
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

    // The floor-plan generator can place the ghost in any room
    // (including the hallway where the player starts). Pin the
    // ghost to a non-hallway room so the "elsewhere vs. lair"
    // distinction is meaningful for this test.
    const ghostRoom = await page.evaluate(() => {
      const fp = SugarCube.State.variables.run.floorplan;
      const target = fp.rooms.find(r => r.id !== 'room_0').id;
      fp.spawnRoomId = target;
      return target;
    });

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

  test('clicking a tool kicks off the meter and lands the result in the card overlay', async () => {
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

    // Each tool card has a clickable label that, on click, starts a
    // <<repeat>>-driven meter under the icon. The meter ticks
    // $equipment.<tool> times (default tier 5) and on completion
    // drops the result into the per-tool card overlay.
    const emfCard = page.locator('.hunt-tool-card').first();
    const emfCountdown = emfCard.locator('.hunt-tool-countdown');
    await expect(emfCard.locator('a')).toHaveCount(1);
    await emfCard.locator('a').click();

    // Per click, the tier-5 EMF burns 5 toolTicks (1 min each) plus
    // one applyTickEffects (1 min, since HuntRun is huntActive) =
    // 6 in-game minutes.
    await page.waitForFunction(() => SugarCube.State.variables.minutes === 6);
    // The coloredText reading lives in the per-card countdown overlay
    // -- the only place hunt-tool results are surfaced now (the
    // top-of-screen tray + meter were removed in favour of per-tool
    // feedback in the toolbar row).
    await expect(emfCountdown.locator('.hunt-tool-card-number .boldText')).toHaveCount(1);
    await expect(emfCard).not.toHaveClass(/disabled-link/);

    // Re-clicking the same tool reopens the meter and overwrites the
    // card with a fresh reading rather than appending to it.
    await emfCard.locator('a').click();
    await page.waitForFunction(() => SugarCube.State.variables.minutes === 12);
    await expect(emfCountdown.locator('.hunt-tool-card-number .boldText')).toHaveCount(1);
  });

  test('a tool click renders a countdown square over the in-use icon', async () => {
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickHuntCard(page);
    await ensureNotEmptyBag(page);
    await clickLink(page, 'Enter the hunt', 'HuntRun');
    await stubPerTickGatesQuiet(page);

    // Slow the per-tick interval so the countdown stays visible long
    // enough to assert mid-flight values.
    await page.evaluate(() => {
      SugarCube.State.variables.timerToolsDecreased = '200ms';
    });

    const emfCard = page.locator('.hunt-tool-card').first();
    const countdown = emfCard.locator('.hunt-tool-countdown');
    await expect(countdown).toHaveCount(1);
    await expect(countdown).toBeEmpty();

    const equip = await getVar(page, 'equipment.emf');

    // Hook a MutationObserver onto the countdown so every textContent
    // transition is captured — Playwright's toHaveText poll can miss
    // intermediate values when ticks pass faster than its sample rate.
    // The observer keeps logging the trimmed number text and the pie's
    // --pie-pct value until the pie disappears (the slot widget swaps
    // the pie+number tick frame for the in-card result on completion);
    // tests await __countdownDone before reading the log so the final
    // mutation isn't lost to the microtask gap. textContent is trimmed
    // because the widget body ends with a newline before <</widget>>
    // that nobr renders as a trailing space — invisible in the UI but
    // visible to textContent.
    await page.evaluate(() => {
      window.__countdownLog = [];
      window.__pieLog = [];
      window.__colorLog = [];
      window.__countdownDone = new Promise((resolve) => {
        const el = document.querySelector('.hunt-tool-card .hunt-tool-countdown');
        new MutationObserver(() => {
          const t = el.textContent.trim();
          window.__countdownLog.push(t);
          const pie = el.querySelector('.hunt-tool-pie');
          window.__pieLog.push(pie ? pie.style.getPropertyValue('--pie-pct') : null);
          window.__colorLog.push(pie ? pie.style.getPropertyValue('--pie-color') : null);
          if (!pie && window.__countdownLog.length > 1) resolve();
        }).observe(el, { childList: true, characterData: true, subtree: true });
      });
    });

    await emfCard.locator('a').click();
    await page.evaluate(() => window.__countdownDone);

    const log = await page.evaluate(() => window.__countdownLog);
    const pieLog = await page.evaluate(() => window.__pieLog);
    const colorLog = await page.evaluate(() => window.__colorLog);
    // For a tier-5 EMF the captured tick sequence is 5,4,3,2,1,0 —
    // the last frame in the run drops the pie and swaps in the
    // EMF result number (a 1-3 digit coloredText reading).
    const expectedTicks = [];
    for (let n = equip; n >= 0; n--) expectedTicks.push(String(n));
    expect(log.slice(0, equip + 1)).toEqual(expectedTicks);
    expect(log).toHaveLength(equip + 2);
    expect(log[log.length - 1]).toMatch(/^\d+$/);
    // Pie fill walks 0,20,40,60,80,100 in step with the countdown
    // (one (100/equip)% slice per tick); the final entry is null
    // because the in-card result frame has no pie.
    const expectedPie = [];
    for (let n = equip; n >= 0; n--) expectedPie.push(String((equip - n) * (100 / equip)));
    expectedPie.push(null);
    expect(pieLog).toEqual(expectedPie);
    // Pie colour hue ramps 0°(red) → 120°(green) in step with the fill.
    const expectedColor = [];
    for (let n = equip; n >= 0; n--) {
      const pct = (equip - n) * (100 / equip);
      expectedColor.push(`hsl(${Math.round(pct * 1.2)}, 75%, 50%)`);
    }
    expectedColor.push(null);
    expect(colorLog).toEqual(expectedColor);
  });

  test('a tool resumes from its interrupted progress (countdown + pie)', async () => {
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickHuntCard(page);
    await ensureNotEmptyBag(page);
    await clickLink(page, 'Enter the hunt', 'HuntRun');
    await stubPerTickGatesQuiet(page);

    // Park the EMF tool partway through its tick run as if a per-tick
    // event-chain goto had pulled the player out mid-meter. The next
    // click should resume from this point — countdown shows the
    // remaining ticks, not the full equipment tier; pie starts
    // partially filled to match.
    const equip = await getVar(page, 'equipment.emf');
    const resumeFrom = 2; // already done 2 of 5 ticks
    await page.evaluate((rf) => {
      SugarCube.State.variables.currentsearchHunt.emf = rf;
    }, resumeFrom);

    await page.evaluate(() => {
      SugarCube.State.variables.timerToolsDecreased = '200ms';
    });

    const emfCard = page.locator('.hunt-tool-card').first();
    const countdown = emfCard.locator('.hunt-tool-countdown');
    const remainingAtResume = equip - resumeFrom;

    // Snapshot the pre-click state of the pie at the resume point.
    await page.evaluate(() => {
      window.__resumeFirstFrame = null;
      const el = document.querySelector('.hunt-tool-card .hunt-tool-countdown');
      new MutationObserver(() => {
        if (window.__resumeFirstFrame !== null) return;
        const pie = el.querySelector('.hunt-tool-pie');
        window.__resumeFirstFrame = {
          num: el.textContent.trim(),
          pct: pie ? pie.style.getPropertyValue('--pie-pct') : null,
        };
      }).observe(el, { childList: true, characterData: true, subtree: true });
    });

    await emfCard.locator('a').click();
    // First rendered state must match the resume point, not a fresh run.
    await expect.poll(
      () => page.evaluate(() => window.__resumeFirstFrame)
    ).toEqual({
      num: String(remainingAtResume),
      pct: String(resumeFrom * (100 / equip)),
    });

    // Run completes — the in-card EMF reading replaces the pie+number
    // tick frame and stays populated as the visible result.
    await expect(countdown.locator('.hunt-tool-card-number')).toHaveCount(1);
    await expect(countdown.locator('.hunt-tool-pie')).toHaveCount(0);
  });

  test('EMF run leaves the reading in the tool card overlay', async () => {
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickHuntCard(page);
    await ensureNotEmptyBag(page);
    await clickLink(page, 'Enter the hunt', 'HuntRun');
    await stubPerTickGatesQuiet(page);
    await fastToolTicks(page);

    const emfCard = page.locator('.hunt-tool-card').first();
    const countdown = emfCard.locator('.hunt-tool-countdown');

    await emfCard.locator('a').click();

    // EMF is a numeric tool, so the card carries a coloredText number
    // (not a thumbs-down).
    await expect(countdown.locator('.hunt-tool-card-number')).toHaveCount(1);
    await expect(countdown.locator('.hunt-tool-card-thumbsdown')).toHaveCount(0);
    await expect(countdown.locator('.hunt-tool-pie')).toHaveCount(0);

    // The card-overlay text is the displayed reading.
    const cardText = (await countdown.innerText()).trim();
    expect(cardText).toMatch(/^\d+$/);
  });

  test('thermometer reading carries its color into the tool card overlay', async () => {
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickHuntCard(page);
    await ensureNotEmptyBag(page);
    await clickLink(page, 'Enter the hunt', 'HuntRun');
    await stubPerTickGatesQuiet(page);
    await fastToolTicks(page);

    // TemperatureHigh's colour branch only fires below tier 5 (tier 5
    // is plain). Tier 3 in the ghost's room without temperature
    // evidence picks the yellow branch — testable without rolling RNG
    // because we pin the player into the lair room first. Filter on
    // the evidence object's .id (entries are Evidence objects, not
    // raw strings) so the prune actually drops the temperature item
    // regardless of which ghost the auto-roll lands on.
    await page.evaluate(() => {
      SugarCube.State.variables.equipment.temperature = 3;
      const ghost = SugarCube.setup.HuntController.activeGhost();
      ghost.evidence = ghost.evidence.filter(e => e.id !== 'temperature');
      SugarCube.setup.isGhostHere = () => true;
    });

    const thermoCard = page.locator('.hunt-tool-card').filter({ hasText: 'Thermometer' });
    const countdown = thermoCard.locator('.hunt-tool-countdown');

    await thermoCard.locator('a').click();

    await expect(countdown.locator('.hunt-tool-card-number')).toHaveCount(1);
    // The coloredText span's inline `color:` attribute is what
    // overrides the countdown's default white text, so assert on the
    // style directly.
    const cardSpan = countdown.locator('.hunt-tool-card-number .boldText');
    await expect(cardSpan).toHaveCount(1);
    const cardColor = await cardSpan.evaluate(el => el.style.color);
    expect(cardColor).toBe('yellow');
  });

  test('GWB miss drops a thumbs-down into the tool card overlay', async () => {
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickHuntCard(page);
    await ensureNotEmptyBag(page);
    await clickLink(page, 'Enter the hunt', 'HuntRun');
    await stubPerTickGatesQuiet(page);
    await fastToolTicks(page);

    // Force the renderer down the not-found branch.
    await page.evaluate(() => {
      SugarCube.setup.ToolController.findGwb = () => null;
    });

    const gwbCard = page.locator('.hunt-tool-card').filter({ hasText: 'GWB' });
    const countdown = gwbCard.locator('.hunt-tool-countdown');

    await gwbCard.locator('a').click();

    await expect(countdown.locator('.hunt-tool-card-thumbsdown')).toHaveCount(1);
    await expect(countdown.locator('.hunt-tool-card-number')).toHaveCount(0);
    await expect(countdown.locator('.hunt-tool-pie')).toHaveCount(0);
  });

  test('clicking a second tool clears the previous tool\'s in-card result', async () => {
    test.setTimeout(20_000);

    await goToPassage(page, 'GhostStreet');
    await clickHuntCard(page);
    await ensureNotEmptyBag(page);
    await clickLink(page, 'Enter the hunt', 'HuntRun');
    await stubPerTickGatesQuiet(page);
    await fastToolTicks(page);
    await page.evaluate(() => {
      SugarCube.setup.ToolController.findGwb = () => null;
    });

    const emfCard = page.locator('.hunt-tool-card').first();
    const emfCountdown = emfCard.locator('.hunt-tool-countdown');
    const gwbCard = page.locator('.hunt-tool-card').filter({ hasText: 'GWB' });
    const gwbCountdown = gwbCard.locator('.hunt-tool-countdown');

    // Run EMF first; card fills with the reading.
    await emfCard.locator('a').click();
    await expect(emfCountdown.locator('.hunt-tool-card-number')).toHaveCount(1);

    // Click GWB — the slot's first action is clearAllHuntCards(), so
    // the EMF card empties out before GWB's tick starts.
    await gwbCard.locator('a').click();
    await expect(emfCountdown.locator('.hunt-tool-card-number')).toHaveCount(0);
    await expect(gwbCountdown.locator('.hunt-tool-card-thumbsdown')).toHaveCount(1);
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
      SugarCube.setup.Events.rollRandomEvent     = () => false;
      SugarCube.setup.Events.maybeTurnOffLights  = () => null;
      SugarCube.setup.HuntController.shouldTriggerSteal     = () => false;
      SugarCube.setup.HuntController.shouldStartProwl = () => false;
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

  test('UVL hit in hunt mode routes to UvlFound and pops up the picture', async () => {
    /* Regression: with the top-of-screen tool tray removed, a UVL hit
       has nowhere to render its image pack -- the renderer output
       lands in the hidden #hunt-tool-sink. UvlFound is the equivalent
       of GwbFound / EctoglassFound: it reads $evidenceFind.pack and
       renders the picture full-size on its own passage. */
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickHuntCard(page);
    await ensureNotEmptyBag(page);
    await clickLink(page, 'Enter the hunt', 'HuntRun');

    await stubPerTickGatesQuiet(page);
    await fastToolTicks(page);
    // Force the renderer down the hit branch by giving the ghost the
    // UVL evidence + flagging the UVL tool as freshly activated.
    await page.evaluate(() => {
      const g = SugarCube.setup.HuntController.activeGhost();
      if (!g.evidence.includes('uvl')) g.evidence.push('uvl');
      SugarCube.setup.activateTool('uvl');
    });

    const uvlCard = page.locator('.hunt-tool-card').filter({ hasText: 'UVL' });
    await expect(uvlCard).toHaveCount(1);
    await uvlCard.locator('a').click();

    await page.waitForFunction(() => SugarCube.State.passage === 'UvlFound');

    // Image pack landed in the passage.
    await expect(page.locator('.passage img')).toHaveCount(1);
    expect(await getVar(page, 'evidenceFind').then(v => v && v.tool)).toBe('uvl');

    // Back link returns the player to HuntRun.
    await page.locator('.passage').getByText('Back', { exact: true }).click();
    await page.waitForFunction(() => SugarCube.State.passage === 'HuntRun');
  });

  test('Spiritbox click with the lights on drops a thumbs-down into the card', async () => {
    /* Lights-off is a tool-wide rule
       (setup.searchToolDefs.spiritbox.needsLightCheck): the hunt
       tool slot must short-circuit a click while the room is lit
       and surface a rejection marker in the per-tool card overlay
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
    const countdown = spiritboxCard.locator('.hunt-tool-countdown');
    await expect(spiritboxCard).toHaveCount(1);
    await spiritboxCard.locator('a').click();

    // Card overlay carries the thumbs-down rejection marker; meter
    // never starts and the player stays on HuntRun.
    await expect(countdown.locator('.hunt-tool-card-thumbsdown')).toHaveCount(1);
    await expect(countdown.locator('.hunt-tool-pie')).toHaveCount(0);
    expect(await page.evaluate(() => SugarCube.State.passage)).toBe('HuntRun');
  });

  test('Spiritbox click with the lights off proceeds into the meter cycle', async () => {
    /* Negative companion test of the lights-off guard: with the
       current room dark, the spiritbox click must drop into the
       same <<repeat>> meter loop the other tools use, not the
       lights-off thumbs-down rejection. */
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
    const countdown = spiritboxCard.locator('.hunt-tool-countdown');
    await spiritboxCard.locator('a').click();

    // The rejection thumbs-down must NOT appear -- this click landed
    // in the meter branch (pie is visible mid-tick). .disabled-link
    // is added to .cardlink (the inner span the click handler
    // annotates) for the duration of the cycle.
    await expect(countdown.locator('.hunt-tool-card-thumbsdown')).toHaveCount(0);
    await expect(spiritboxCard.locator('.cardlink')).toHaveClass(/disabled-link/);
  });

  test('Ectoglass miss in hunt mode drops a thumbs-down into the card (no goto)', async () => {
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
    const countdown = ectoCard.locator('.hunt-tool-countdown');
    await ectoCard.locator('a').click();

    // Card overlay carries the thumbs-down miss marker; player stays
    // on HuntRun.
    await expect(countdown.locator('.hunt-tool-card-thumbsdown')).toHaveCount(1);
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
    /* Open the cursed-item quest so the cursedItem loot gate (see
       setup.HuntController.isLootKindAvailable) lets the slot light
       up — this test exercises a generic "find loot" flow and picks
       whichever base kind happens to land on a furniture slot. */
    await page.evaluate(() => SugarCube.setup.Witch.clearCursedItemHeld());

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
       per-tick drain branch (not Event / StealClothes / GhostProwlEvent
       gotos). The chain still calls Event but rollRandomEvent's
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

  test('sanity collapse during a hunt tool tick routes to HuntOverSanity as failure', async () => {
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
    // huntOverPassage("sanity") -> HuntOverSanity (which settles
    // the run inline via endHunt).
    await page.waitForFunction(() => SugarCube.State.passage === 'HuntOverSanity');

    // The run is closed and the sanity-collapse beat is on-screen.
    expect(await getVar(page, 'run')).toBeNull();
    await expect(
      page.locator('.passage').getByText(/tips sideways/i)
    ).toBeVisible();
  });

  test('per-tick chain in the hunt triggers GhostProwlEvent when shouldStartProwl fires', async () => {
    test.setTimeout(15_000);

    /* The huntTickStep widget calls huntTickEventChain, which goes
       through HuntController.shouldStartProwl. With timer
       state pre-stamped past the threshold and Math.random pinned
       low, a single tool tick should land on GhostProwlEvent. */
    await goToPassage(page, 'GhostStreet');
    await clickHuntCard(page);
    await ensureNotEmptyBag(page);
    await clickLink(page, 'Enter the hunt', 'HuntRun');

    await page.evaluate(() => {
      const V = SugarCube.State.variables;
      V.prowlActivated = false;
      V.prowlTimeRemain = 0;
      V.elapsedTimeProwl = 0;
      V.prowlActivationTime = 0;
      V.mc.sanity = 30; // satisfies every sanity-cutoff ghost
      V.mc.lust = 60;   // satisfies lust-condition ghosts too
      V.mc.energy = 5;  // keep applyTickEffects from triggering exhaustion
      // Pin the hunt ghost to Shade so its prowlCondition (sanity<=55) trips.
      SugarCube.setup.HuntController.setField('ghostName', 'Shade');
      // Force every Math.random call to 0 so:
      //   - maybeTurnOffLights roll: 0 (no light flicker dest)
      //   - rollRandomEvent's various rolls all round-trip: chance=0,
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
    // may <<goto>> us to GhostProwlEvent / EventMC / StealClothes
    // depending on which roll trips first. Any of those is a valid
    // "the per-tick chain DID fire sanity-driven side content".
    await page.locator('.hunt-tool-card').first().locator('a').click();
    await page.waitForFunction(() =>
      ['GhostProwlEvent', 'EventMC', 'StealClothes'].includes(SugarCube.State.passage),
      null,
      { timeout: 10_000 }
    );
    expect(await getVar(page, 'run')).not.toBeNull();
  });

  test('hunt-survival options in GhostProwlEvent are reachable in hunt mode', async () => {
    test.setTimeout(15_000);

    await goToPassage(page, 'GhostStreet');
    await clickHuntCard(page);
    await clickLink(page, 'Enter the hunt', 'HuntRun');

    // Drop straight into the hunt event UI.
    await goToPassage(page, 'GhostProwlEvent');
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

  test('FreezeHunt with no garments routes to HuntOverSanity as a "sanity" failure in hunt mode', async () => {
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
    // setup.HuntController.huntOverPassage("sanity") which settles
    // the run inline (endHunt) and routes to HuntOverSanity. The
    // failure stamping happens before the run is cleared, but $run
    // is null by the time the assertion runs -- we assert on the
    // HuntOverSanity-rendered beat instead.
    await page.locator('.passage').getByText(/Surrender to the cold/i).click();
    await page.waitForFunction(() => SugarCube.State.passage === 'HuntOverSanity');

    expect(await getVar(page, 'run')).toBeNull();
    await expect(
      page.locator('.passage').getByText(/tips sideways/i)
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

  test('hunt ghost catch routes through HuntOverProwl → Sleep as a "caught" failure', async () => {
    test.setTimeout(20_000);

    /* HuntOverProwl's bottom-of-passage cleanup runs through
       setup.HuntController.onCaughtCleanup() and the huntBlackoutExit
       widget routes its post-scene exit through huntCaughtPassage();
       in hunt mode that settles the run inline (endHunt) and returns
       Sleep so the blackout narration carries straight into the
       bedroom cum-covered wake-up. The e2e check here is that those
       helpers route a real run end-to-end -- the widget rendering +
       linkappend fan-out is covered by the classic hunt-flow tests. */
    await goToPassage(page, 'GhostStreet');
    await clickHuntCard(page);
    await clickLink(page, 'Enter the hunt', 'HuntRun');

    // Snapshot the expected failure payout BEFORE huntCaughtPassage
    // settles the run (it zeroes the active modifier deck on endHunt).
    const expectedFailure = await page.evaluate(() =>
      Math.round(3 * SugarCube.setup.Modifiers.payoutMultiplier()));

    /* Sanity-check that onCaughtCleanup (called from HuntOverProwl)
       does not crash and does not close the run on its own -- the
       run must still be active here so huntCaughtPassage can do the
       inline endHunt. */
    await page.evaluate(() => SugarCube.setup.HuntController.onCaughtCleanup());
    expect(await callSetup(page, 'setup.HuntController.isActive()')).toBe(true);

    // huntCaughtPassage() in hunt mode stamps the "caught" failure,
    // settles the run via endHunt, and returns the exit passage (Sleep).
    const target = await callSetup(page, 'setup.HuntController.huntCaughtPassage()');
    expect(target).toBe('Sleep');
    expect(await getVar(page, 'run')).toBeNull();
    expect(await getVar(page, 'ectoplasm')).toBe(expectedFailure);
  });

  test('ghost-room drift fires for the hunt ghost across 20-minute intervals', async () => {
    test.setTimeout(15_000);

    /* PassageDone calls setup.HuntController.shuffleGhostRoom which
       gates on the next-drift deadline (15-35 min after startHunt /
       the last shuffle) and a 45% roll. We start a run, force the
       roll to 0 (drift fires) and park the clock past the deadline;
       the ghost room must end up somewhere different from where it
       started. */
    await goToPassage(page, 'GhostStreet');
    await clickHuntCard(page);
    await ensureNotEmptyBag(page);
    await clickLink(page, 'Enter the hunt', 'HuntRun');

    // Pin the hunt ghost to one that DOES drift (not Goryo).
    await page.evaluate(() => {
      SugarCube.setup.HuntController.setField('ghostName', 'Shade');
    });

    const initial = await callSetup(page, 'setup.HuntController.ghostRoomId()');

    // Park the clock past the drift deadline and force the roll.
    await page.evaluate(() => {
      SugarCube.State.variables.minutes = 35;
      SugarCube.State.variables.nextDriftAtMinute = 0;
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

    // Even with the roll forced + the drift deadline already passed,
    // Goryo's lair mustn't move.
    await page.evaluate(() => {
      SugarCube.State.variables.minutes = 35;
      SugarCube.State.variables.nextDriftAtMinute = 0;
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

  test('hunt rescueClue pickup flips hasRescueClue and upgrades EMF to lvl 3', async () => {
    test.setTimeout(20_000);

    /* Rescue-clue pickup parity: the hunt's FurnitureSearch branch
       includes RescueClueFound, which sets $hasRescueClue and pushes
       EMF to level 3 when the player clicks the photo reveal. Gate
       requires an active rescue quest -- without one, the loot kind
       is filtered out of the floor plan by MissingWomenController. */
    await page.evaluate(() => {
      const V = SugarCube.State.variables;
      V.hasQuestForRescue = 1;       // ACTIVE
      V.rescueStage = 0;
      V.currentRescueGirl = 'Victoria';
      V.randomRescuePhotoNumber = 5;
      V.tornStyleRandom = 'torn-style-1 torn-effect';
      V.relationshipWithRain = 1;
    });
    await goToPassage(page, 'GhostStreet');
    await clickHuntCard(page);
    await ensureNotEmptyBag(page);

    // EMF starts below lvl 3 so we can see the upgrade fire.
    await page.evaluate(() => { SugarCube.State.variables.equipment.emf = 1; });
    await page.evaluate(() => { SugarCube.State.variables.hasRescueClue = false; });

    const fp = await getVar(page, 'run').then(r => r.floorplan);
    const clueRoom      = fp.loot.rescueClue;
    const clueFurniture = fp.lootFurniture.rescueClue;
    expect(clueRoom).toBeDefined();
    expect(clueFurniture).toBeDefined();

    await page.evaluate(id => SugarCube.setup.HuntController.setCurrentRoom(id), clueRoom);
    await goToPassage(page, 'HuntRun');

    const fLabel = await callSetup(page,
      `setup.HuntController.currentRoomData().furniture.find(f => f.suffix === "${clueFurniture}").label`);
    await page.locator('.hunt-furniture-item')
      .filter({ hasText: fLabel })
      .first()
      .click();
    await page.waitForFunction(() => SugarCube.State.passage === 'FurnitureSearch');

    // Slot is marked collected as soon as the player searches.
    expect(await callSetup(page, 'setup.HuntController.hasCollected("rescueClue")')).toBe(true);

    // Click the linkappend "fragment of the old photo." reveal --
    // that's what RescueClueFound's body calls setRescueClueFound +
    // upgradeEmfToLvl3 inside.
    await page.locator('.passage').getByText('fragment of the old photo.', { exact: true }).click();
    await page.waitForFunction(() => SugarCube.State.variables.hasRescueClue === true);
    expect(await getVar(page, 'hasRescueClue')).toBe(true);
    expect(await callSetup(page, 'setup.MissingWomen.emfLevel()')).toBe(3);
  });

  test('hunt without active rescue quest does not place rescueClue loot', async () => {
    test.setTimeout(15_000);

    /* Gate check: with no active rescue quest the
       FLOORPLAN_OPTIONS filter strips rescueClue from the placement
       pool, so the slot is freed for something else and the player
       can't stumble onto a dead-drop clue. */
    await page.evaluate(() => { SugarCube.State.variables.hasQuestForRescue = 0; });
    await goToPassage(page, 'GhostStreet');
    await clickHuntCard(page);
    await ensureNotEmptyBag(page);

    const fp = await getVar(page, 'run').then(r => r.floorplan);
    expect(fp.loot.rescueClue).toBeUndefined();
    expect(fp.lootFurniture.rescueClue).toBeUndefined();
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
      SugarCube.State.variables.knowledgeUsed === true, null, { timeout: 5000 });

    expect(await getVar(page, 'knowledgeUsed')).toBe(true);
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
    // which settles the run inline and routes to HuntOverTime.
    await page.waitForFunction(() => SugarCube.State.passage === 'HuntOverTime');
    expect(await getVar(page, 'run')).toBeNull();
    await expect(
      page.locator('.passage').getByText(/dawn/i)
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

});
