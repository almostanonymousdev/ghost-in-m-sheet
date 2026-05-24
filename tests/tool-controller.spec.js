const { test, expect } = require('@playwright/test');
const { openGame, resetGame, callSetup, getVar, goToPassage } = require('./helpers');

/* setup.ToolController.render(toolKey) drives the markup that
   <<toolCheck>> wikifies for both classic-hunt completion replaces
   and the hunt toolbar. The plasm and gwb renderers route a hit
   to the shared EctoglassFound / GwbFound passages by stamping
   $evidenceFind and emitting <<deferGoto>> -- both modes use the
   same code path. These tests pin that contract so a regression in
   either renderer surfaces here regardless of which mode triggers
   the click. */
test.describe('ToolController renderers', () => {
  let page;

  test.beforeAll(async ({ browser }) => {
    page = await openGame(browser);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test.beforeEach(async () => {
    await resetGame(page);
    // Make all ToolController renderers callable from the City flow
    // by pinning a known active hunt + ghost. The hunt flow drives
    // setup.HuntController.activeGhost() / setup.HuntController.isGhostHere() —
    // both gate on an in-flight hunt, so we boot one with the
    // requested ghost pinned. Banshee carries both GLASS and GWB so
    // the side-effect test below can call the real findGwb without
    // swapping ghosts. The isGhostHere stub bypasses the HuntRun
    // passage requirement so renderers can run from the City flow.
    await page.evaluate(() => {
      SugarCube.setup.HuntController.startHunt({ seed: 1 });
      // startHunt stamps $run.evidence from the seed-picked ghost; repoint
      // both the name and the evidence override so _activeFromCatalogue
      // builds a Banshee with her real (GLASS, GWB, UVL) evidence list.
      SugarCube.setup.HuntController.setField('ghostName', 'Banshee');
      const banshee = SugarCube.setup.Ghosts.getByName('Banshee');
      SugarCube.setup.HuntController.setField('evidence',
        banshee.evidence.map(e => e.id));
      SugarCube.setup.Ghosts.cheatStartHunt('Banshee');
      SugarCube.setup.HuntController.setHuntMode(SugarCube.setup.HuntController.HuntMode.ACTIVE);
      SugarCube.setup.isGhostHere = () => true;
    });
  });

  test('renderPlasm hit stamps $evidenceFind and emits deferGoto to EctoglassFound', async () => {
    await page.evaluate(() => {
      SugarCube.setup.ToolController.findPlasm = () => ({
        pack: { prefix: 'mechanics/plasm/mess/', start: 1, end: 7,
                ext: '.png', cssClass: 'displayCentredImgs' },
        message: 'msg-stub'
      });
    });

    const markup = await callSetup(page, "setup.ToolController.render('plasm')");
    expect(markup).toContain('<<deferGoto "EctoglassFound">>');

    const find = await getVar(page, 'evidenceFind');
    expect(find.tool).toBe('plasm');
    expect(find.pack.prefix).toBe('mechanics/plasm/mess/');
    expect(find.message).toBe('msg-stub');
  });

  test('renderPlasm miss returns the not-found markup and leaves $evidenceFind alone', async () => {
    await page.evaluate(() => {
      SugarCube.State.variables.evidenceFind = null;
      SugarCube.setup.ToolController.findPlasm = () => null;
    });

    const markup = await callSetup(page, "setup.ToolController.render('plasm')");
    expect(markup).toContain('<<notFound');
    expect(markup).toContain("ectoplasm stains");
    expect(markup).not.toContain('<<deferGoto');

    expect(await getVar(page, 'evidenceFind')).toBeNull();
  });

  test('renderGwb hit stamps $evidenceFind and emits deferGoto to GwbFound', async () => {
    await page.evaluate(() => {
      SugarCube.setup.ToolController.findGwb = () => ({
        pack: { prefix: 'mechanics/gwb/', start: 1, end: 18, ext: '.jpg' },
        message: SugarCube.setup.ToolController.Messages.gwb
      });
    });

    const markup = await callSetup(page, "setup.ToolController.render('gwb')");
    expect(markup).toContain('<<deferGoto "GwbFound">>');

    const find = await getVar(page, 'evidenceFind');
    expect(find.tool).toBe('gwb');
    expect(find.pack.prefix).toBe('mechanics/gwb/');
    expect(find.message).toMatch(/Ohh\.\.\. what is this/i);
  });

  test('renderGwb miss returns the not-found markup', async () => {
    await page.evaluate(() => {
      SugarCube.setup.ToolController.findGwb = () => null;
    });

    const markup = await callSetup(page, "setup.ToolController.render('gwb')");
    expect(markup).toContain('<<notFound');
    expect(markup).not.toContain('<<deferGoto');
  });

  test('findGwb opens the EMF activation window as a side effect of a hit', async () => {
    /* renderGwb's old inline path called setup.activateTool("emf")
       before returning the markup; the find/render split must keep
       that side effect on the find helper or the EMF tool stops
       working downstream of a GWB hit. */
    await page.evaluate(() => {
      const V = SugarCube.State.variables;
      V.equipment = { emf: 5, spiritbox: 5, gwb: 5,
                      glass: 5, temperature: 5, uvl: 5 };
      // Force the gate roll to pass: with chanceByTier(5) = 15%, a
      // pinned Math.random=0 makes the (1..100) roll come out at 1.
      Math.random = () => 0;
      SugarCube.setup.toolsRecord('emf').activated = 0;
    });

    const result = await callSetup(page, 'setup.ToolController.findGwb()');
    expect(result).not.toBeNull();

    const emfActivated = await page.evaluate(() =>
      SugarCube.setup.toolsRecord('emf').activated);
    expect(emfActivated).toBe(1);
  });

  test('maybeTurnOffLights leaves EMF inactive when no light could be flipped', async () => {
    /* The ghost's flick-the-lights roll arms EMF, but only when there
       was an actual light to flick. If the current passage isn't a
       hunt room (or the room is already dark) turnOffLightHere returns
       null, and the previous code path armed EMF anyway — the player
       saw the reading open with no in-world cause. Pin the roll to
       always succeed and stub turnOffLightHere null/non-null to cover
       both branches. */
    await page.evaluate(() => {
      Math.random = () => 0;
      SugarCube.setup.toolsRecord('emf').activated = 0;
      const g = SugarCube.setup.HuntController.activeGhost();
      g.canTurnOffLights = true;
      SugarCube.setup.Events.turnOffLightHere = () => null;
    });
    const dest1 = await callSetup(page, 'setup.Events.maybeTurnOffLights()');
    expect(dest1).toBeNull();
    const emf1 = await page.evaluate(() =>
      SugarCube.setup.toolsRecord('emf').activated);
    expect(emf1).toBe(0);

    await page.evaluate(() => {
      SugarCube.setup.Events.turnOffLightHere = () => 'OwaissaKitchen';
    });
    const dest2 = await callSetup(page, 'setup.Events.maybeTurnOffLights()');
    expect(dest2).toBe('OwaissaKitchen');
    const emf2 = await page.evaluate(() =>
      SugarCube.setup.toolsRecord('emf').activated);
    expect(emf2).toBe(1);
  });

  test('StealClothes arms the UVL activation window', async () => {
    /* When the ghost physically grabs MC's clothes it leaves prints
       behind, so the steal event should open the UVL reading window
       the same way a sanity event does. */
    await page.evaluate(() => {
      SugarCube.setup.toolsRecord('uvl').activated = 0;
    });
    await goToPassage(page, 'StealClothes');
    const uvl = await page.evaluate(() =>
      SugarCube.setup.toolsRecord('uvl').activated);
    expect(uvl).toBe(1);
  });

  test('beginProwlEvent arms EMF + UVL regardless of which branch the player picks', async () => {
    /* EMF + UVL used to only activate when the player picked Freeze;
       Run / Hide / Pray resolutions left both windows shut.
       Centralised onto beginProwlEvent so a prowl arms both readers
       the moment GhostProwlEvent opens — every resolution path
       inherits hot tools. */
    await page.evaluate(() => {
      SugarCube.setup.toolsRecord('emf').activated = 0;
      SugarCube.setup.toolsRecord('uvl').activated = 0;
    });
    await callSetup(page, 'setup.HauntedHouses.beginProwlEvent()');
    const emf = await page.evaluate(() =>
      SugarCube.setup.toolsRecord('emf').activated);
    const uvl = await page.evaluate(() =>
      SugarCube.setup.toolsRecord('uvl').activated);
    expect(emf).toBe(1);
    expect(uvl).toBe(1);
  });

  test('cleanupAfterHunt resets EMF + UVL activation back to defaults', async () => {
    /* Hunt cleanup must scrub the timed-tool activation flags so the
       EMF window opened by beginProwlEvent (or any other mid-hunt
       arming) doesn't leak into the next hunt. */
    await page.evaluate(() => {
      SugarCube.setup.activateTool('emf');
      SugarCube.setup.activateTool('uvl');
    });
    expect(await page.evaluate(() =>
      SugarCube.setup.toolsRecord('emf').activated)).toBe(1);
    expect(await page.evaluate(() =>
      SugarCube.setup.toolsRecord('uvl').activated)).toBe(1);

    await callSetup(page, 'setup.HauntedHouses.cleanupAfterHunt()');

    expect(await page.evaluate(() =>
      SugarCube.setup.toolsRecord('emf').activated)).toBe(0);
    expect(await page.evaluate(() =>
      SugarCube.setup.toolsRecord('uvl').activated)).toBe(0);
  });

  test('clickHuntSearchTool fires the slot link only when not .disabled-link', async () => {
    /* Pin the disabled-state contract for the hunt keyboard-shortcut
       path. .disabled-link is added/removed on the
       .hunt-tool-card-label[data-tool=...] span by widgetHuntToolBar
       around each meter cycle; programmatic .click() bypasses the
       pointer-events: none rule, so the helper has to gate on the
       class explicitly. Two cases below: enabled → click propagates,
       disabled → click is suppressed. */
    const result = await page.evaluate(() => {
      const $ = window.jQuery;
      const $slot = $('<span class="hunt-tool-card-label cardlink" data-tool="emf">' +
                      '<a href="#" id="probe-emf">EMF</a></span>')
                    .appendTo('body');
      let clicks = 0;
      $slot.find('a').on('click', (e) => { e.preventDefault(); clicks++; });

      SugarCube.setup.clickHuntSearchTool('emf');
      const enabled = clicks;

      $slot.addClass('disabled-link');
      SugarCube.setup.clickHuntSearchTool('emf');
      const afterDisable = clicks;

      $slot.removeClass('disabled-link');
      SugarCube.setup.clickHuntSearchTool('emf');
      const reEnabled = clicks;

      $slot.remove();
      return { enabled, afterDisable, reEnabled };
    });

    expect(result.enabled).toBe(1);
    expect(result.afterDisable).toBe(1);
    expect(result.reEnabled).toBe(2);
  });

  test('clickHuntSearchTool is a no-op when no hunt toolbar is rendered', async () => {
    /* Outside HuntRun the [data-tool] selector matches nothing -- the
       function must early-return without throwing so the global
       keydown handler can fan out to both clickAllSearchTools and
       clickHuntSearchTool unconditionally. */
    const threw = await page.evaluate(() => {
      try { SugarCube.setup.clickHuntSearchTool('emf'); return false; }
      catch (e) { return true; }
    });
    expect(threw).toBe(false);
  });

  test('renderSpiritbox hit stamps huntInlineMarkup with the Q/A response', async () => {
    /* In hunt mode the renderer output is wikified into the hidden
       #hunt-tool-sink, so the player would never see the Q/A text
       unless the renderer also stamps the visible-inline buffer. Pin
       the contract on a forced hit: chanceByTier(5) = 15%, so a
       pinned roll of 1 always passes; the spiritbox-container markup
       must end up in both the returned markup AND
       setup.ToolController.huntInlineMarkup() for the toolbar widget
       to drop it into #hunt-tool-inline. */
    await page.evaluate(() => {
      const V = SugarCube.State.variables;
      V.equipment = { emf: 5, spiritbox: 5, gwb: 5,
                      glass: 5, temperature: 5, uvl: 5 };
      Math.random = () => 0;
      SugarCube.setup.ToolController.setHuntInlineMarkup('');
      /* Banshee (the seeded ghost) doesn't carry spiritbox evidence;
         swap to a ghost whose evidence list includes it so the hit
         path's hasEvidence("spiritbox") check passes. */
      SugarCube.setup.HuntController.setField('ghostName', 'Wraith');
      SugarCube.setup.HuntController.setField('evidence',
        ['emf', 'spiritbox', 'gwb']);
    });

    const markup = await callSetup(page, "setup.ToolController.render('spiritbox')");
    expect(markup).toContain('spiritbox-container');
    expect(markup).toContain('spiritbox-answer');

    const inline = await callSetup(page, 'setup.ToolController.huntInlineMarkup()');
    expect(inline).toContain('spiritbox-container');
    expect(inline).toContain('spiritbox-answer');
  });

  test('renderSpiritbox no-response leaves huntInlineMarkup empty (thumbsdown card is the only signal)', async () => {
    /* A silent click should not paint a "silence" line above the
       furniture row -- the per-tool card thumbsdown is the only
       player-visible signal that the click landed. */
    await page.evaluate(() => {
      const V = SugarCube.State.variables;
      V.equipment = { emf: 5, spiritbox: 5, gwb: 5,
                      glass: 5, temperature: 5, uvl: 5 };
      /* Seed a stale inline buffer so the renderer has to actively
         clear it -- guards against a future refactor that drops the
         explicit reset. */
      SugarCube.setup.ToolController.setHuntInlineMarkup('<div>stale</div>');
      /* Pin random high so chanceByTier fails and the no-response
         branch fires. */
      Math.random = () => 0.99;
    });

    const markup = await callSetup(page, "setup.ToolController.render('spiritbox')");
    /* The renderer still returns the silence markup so the hidden
       hunt-tool-sink path stays valid (a future use might pipe it
       somewhere); only the visible inline buffer is suppressed. */
    expect(markup).toContain('spiritbox-no-response');

    const inline = await callSetup(page, 'setup.ToolController.huntInlineMarkup()');
    expect(inline).toBe('');
  });

  test('clearAllHuntCards wipes huntInlineMarkup along with the per-card buffer', async () => {
    /* The toolbar widget calls clearAllHuntCards() at the top of every
       slot click so a stale spiritbox response from the previous tool
       press doesn't linger when the player switches to EMF/UVL/etc. */
    await page.evaluate(() => {
      SugarCube.setup.ToolController.setHuntInlineMarkup('<div>stale</div>');
      SugarCube.setup.ToolController.setHuntCardMarkup('<span>stale</span>');
    });
    await page.evaluate(() => SugarCube.setup.ToolController.clearAllHuntCards());
    expect(await callSetup(page, 'setup.ToolController.huntInlineMarkup()')).toBe('');
    expect(await callSetup(page, 'setup.ToolController.huntCardMarkup()')).toBe('');
  });

  test('Hunt meters are registered for every search tool', async () => {
    /* The hunt toolbar renders one <<showmeter searchHunt<Tool>>> per
       tool slot. Those meter names need to exist before the widget
       fires, which the auto-registration loop in ToolController takes
       care of by including "Hunt" in setup.searchableRooms. */
    const tools = await callSetup(page, 'setup.searchToolOrder');
    for (const tool of tools) {
      const def = await callSetup(page, `setup.searchToolDefs[${JSON.stringify(tool)}]`);
      const meterName = 'searchHunt' + def.meterField;
      const exists = await page.evaluate(name => window.Meter.has(name), meterName);
      expect(exists).toBe(true);
    }
  });

  /* setup.Time.totalMinutes() wraps to 0 at midnight, so when a tool
     was activated near the end of one in-game day and the clock has
     since rolled over into the next, the naive `now - activationTime`
     subtraction goes negative. Without a wrap-around fix the EMF/UVL
     activation flag never expires and the sidebar HUD shows the
     bogus minutes-remaining value `window - elapsed` (which balloons
     to ~1440). Tools meant to live for 10-20 minutes effectively
     "carry over" past midnight until the next activation overwrites
     them. */
  test('tickTimedTool expires an EMF activation after the day rolls past the window', async () => {
    await page.evaluate(() => {
      const V = SugarCube.State.variables;
      V.equipment = V.equipment || {};
      V.equipment.emf = 3;        // tier 3 → 20-minute window
      V.hours = 23; V.minutes = 50;
      SugarCube.setup.activateTool('emf');
      // Roll past midnight by 25 minutes — well past the 20-minute window.
      V.hours = 0; V.minutes = 15;
    });

    const state = await callSetup(page, "setup.tickTimedTool('emf')");
    expect(state).toBe('expired');

    const activated = await page.evaluate(() =>
      SugarCube.setup.toolsRecord('emf').activated);
    expect(activated).toBe(0);
  });

  test('tickTimedTool keeps an EMF activation READY across midnight while still within the window', async () => {
    await page.evaluate(() => {
      const V = SugarCube.State.variables;
      V.equipment = V.equipment || {};
      V.equipment.emf = 3;        // 20-minute window
      V.hours = 23; V.minutes = 55;
      SugarCube.setup.activateTool('emf');
      // 10 in-game minutes later — still inside the 20-minute window.
      V.hours = 0; V.minutes = 5;
    });

    const state = await callSetup(page, "setup.tickTimedTool('emf')");
    expect(state).toBe('ready');
  });

  test('toolTimerRemain returns 0 (not a bogus 1000+) after the clock has wrapped past the activation window', async () => {
    await page.evaluate(() => {
      const V = SugarCube.State.variables;
      V.equipment = V.equipment || {};
      V.equipment.uvl = 3;        // 20-minute window
      V.hours = 23; V.minutes = 50;
      SugarCube.setup.activateTool('uvl');
      // Many hours past midnight: elapsed = -ve under naive math, so
      // window - elapsed would be ~1430. The HUD must clamp to 0.
      V.hours = 9; V.minutes = 0;
    });

    const remain = await callSetup(page, "setup.toolTimerRemain('uvl')");
    expect(remain).toBe(0);
  });

  test('toolTimerRemain returns the real minutes-left across midnight while still within the window', async () => {
    await page.evaluate(() => {
      const V = SugarCube.State.variables;
      V.equipment = V.equipment || {};
      V.equipment.uvl = 3;        // 20-minute window
      V.hours = 23; V.minutes = 50;
      SugarCube.setup.activateTool('uvl');
      // 10 in-game minutes later → 10 minutes of the 20-min window left.
      V.hours = 0; V.minutes = 0;
    });

    const remain = await callSetup(page, "setup.toolTimerRemain('uvl')");
    expect(remain).toBe(10);
  });
});
