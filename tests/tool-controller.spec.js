const { test, expect } = require('@playwright/test');
const { openGame, resetGame, callSetup, getVar } = require('./helpers');

/* setup.ToolController.render(toolKey) drives the markup that
   <<toolCheck>> wikifies for both classic-hunt completion replaces
   and the rogue toolbar. The plasm and gwb renderers route a hit
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
    // by pinning a known active hunt + ghost. Classic flows would
    // normally satisfy this via setupHunt; we stub the ghost-here
    // gate directly so the test doesn't need to navigate into a
    // haunted room.
    await page.evaluate(() => {
      // Banshee carries both GLASS and GWB so the side-effect test
      // below can call the real findGwb without swapping ghosts.
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

  test('clickRogueSearchTool fires the slot link only when not .disabled-link', async () => {
    /* Pin the disabled-state contract for the rogue keyboard-shortcut
       path. .disabled-link is added/removed on the
       .rogue-tool-card-label[data-tool=...] span by widgetRogueToolBar
       around each meter cycle; programmatic .click() bypasses the
       pointer-events: none rule, so the helper has to gate on the
       class explicitly. Two cases below: enabled → click propagates,
       disabled → click is suppressed. */
    const result = await page.evaluate(() => {
      const $ = window.jQuery;
      const $slot = $('<span class="rogue-tool-card-label cardlink" data-tool="emf">' +
                      '<a href="#" id="probe-emf">EMF</a></span>')
                    .appendTo('body');
      let clicks = 0;
      $slot.find('a').on('click', (e) => { e.preventDefault(); clicks++; });

      SugarCube.setup.clickRogueSearchTool('emf');
      const enabled = clicks;

      $slot.addClass('disabled-link');
      SugarCube.setup.clickRogueSearchTool('emf');
      const afterDisable = clicks;

      $slot.removeClass('disabled-link');
      SugarCube.setup.clickRogueSearchTool('emf');
      const reEnabled = clicks;

      $slot.remove();
      return { enabled, afterDisable, reEnabled };
    });

    expect(result.enabled).toBe(1);
    expect(result.afterDisable).toBe(1);
    expect(result.reEnabled).toBe(2);
  });

  test('clickRogueSearchTool is a no-op when no rogue toolbar is rendered', async () => {
    /* Outside RogueRun the [data-tool] selector matches nothing -- the
       function must early-return without throwing so the global
       keydown handler can fan out to both clickAllSearchTools and
       clickRogueSearchTool unconditionally. */
    const threw = await page.evaluate(() => {
      try { SugarCube.setup.clickRogueSearchTool('emf'); return false; }
      catch (e) { return true; }
    });
    expect(threw).toBe(false);
  });

  test('Rogue meters are registered for every search tool', async () => {
    /* The rogue toolbar renders one <<showmeter searchRogue<Tool>>> per
       tool slot. Those meter names need to exist before the widget
       fires, which the auto-registration loop in ToolController takes
       care of by including "Rogue" in setup.searchableRooms. */
    const tools = await callSetup(page, 'setup.searchToolOrder');
    for (const tool of tools) {
      const def = await callSetup(page, `setup.searchToolDefs[${JSON.stringify(tool)}]`);
      const meterName = 'searchRogue' + def.meterField;
      const exists = await page.evaluate(name => window.Meter.has(name), meterName);
      expect(exists).toBe(true);
    }
  });
});
