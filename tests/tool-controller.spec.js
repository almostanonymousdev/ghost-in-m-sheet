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
    // setup.Ghosts.active() / setup.HuntController.isGhostHere() —
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
      SugarCube.setup.Ghosts.startHunt('Banshee');
      SugarCube.setup.Ghosts.setHuntMode(SugarCube.setup.Ghosts.HuntMode.ACTIVE);
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
      const g = SugarCube.setup.Ghosts.active();
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
});
