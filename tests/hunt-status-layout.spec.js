const { test, expect } = require('./fixtures');
const { goToPassage } = require('./helpers');

/* The HuntRun HUD floats two right-edge panels above the .hunt-run-hud
   divider with absolute positioning: the light on/off switches
   (.hunt-run-lights) sit just above the divider, and the narrative status
   panel (.hunt-run-messages — sealed-door / dawn-gate prose) stacks above
   them. The vertical offset between the two is hand-tuned in hunt.css, so a
   wrong height assumption silently lets the prose clip into the switches.

   Regression: the .hunt-run-messages bottom offset budgeted only 32px for
   the lights (the icon's pixel height), but the lights box is ~40px tall —
   the on/off images are inline anchors, so the line box around them adds
   descender space. That 8px shortfall dropped the "front door is sealed
   shut" line on top of the switches. */
test.describe('HuntRun status-panel layout', () => {
  // Put the player in the hallway of a real procedural hunt with the front
  // door sealed, so .hunt-run-messages renders its longest (multi-line)
  // variant right above the light switches.
  async function enterSealedHallway(page) {
    await page.evaluate(() => {
      const HC = SugarCube.setup.HuntController;
      HC.startHunt({ seed: 42 });
      HC.activateHunt();
      const run = SugarCube.State.variables.run;
      const hall = run.floorplan.rooms.find(
        (r) => r.template === SugarCube.setup.FloorPlan.HALLWAY_TEMPLATE
      );
      HC.setCurrentRoom(hall.id);
      HC.trapGhost('cursedItem'); // multi-line sealed-exit message
    });
    await goToPassage(page, 'HuntRun');
  }

  function rects(page) {
    return page.evaluate(() => {
      const r = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return { top: b.top, bottom: b.bottom, left: b.left, right: b.right };
      };
      const m = document.querySelector('.hunt-run-messages');
      return {
        messages: r('.hunt-run-messages'),
        lights: r('.hunt-run-lights'),
        msgText: m ? m.innerText.trim() : null,
      };
    });
  }

  test('the sealed-door message actually renders (guards the geometry test)', async ({ game: page }) => {
    await enterSealedHallway(page);
    const { msgText } = await rects(page);
    expect(msgText).toContain('The front door is sealed shut.');
  });

  test('the sealed-door message does not overlap the light switches', async ({ game: page }) => {
    await enterSealedHallway(page);
    const { messages, lights } = await rects(page);
    expect(messages, '.hunt-run-messages should be present').not.toBeNull();
    expect(lights, '.hunt-run-lights should be present').not.toBeNull();

    // They share the right edge, so a vertical gap is the only thing keeping
    // them apart: the message panel's bottom must sit above the lights' top.
    const verticalGap = lights.top - messages.bottom;
    expect(verticalGap, 'gap between status prose and light switches').toBeGreaterThan(0);
  });
});
