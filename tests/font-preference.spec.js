const { test, expect } = require('./fixtures');
const { callSetup, goToPassage, setHuntMode } = require('./helpers');

/* The "Text font" player setting (Settings dialog) lets readers swap the
   passage/button/link face for a dyslexia-friendly or plain-sans one.
   setup.Gui.applyFontPreference() stamps one of the body.font-pref-*
   classes (see the "player font preference" block in StoryStylesheet.css),
   each of which redefines the --font-normal / --font-haunted role tokens so
   the choice wins in both town and inside a hunt. These tests pin that
   contract off the live computed body font, so a regression in either the
   controller wiring or the CSS token overrides fails here.

   Settings live in localStorage, not $state, so resetGame() does NOT clear
   them between tests on the worker-shared page. Each test sets its own
   choice up front; afterEach restores the default so the preference can't
   leak into another spec file sharing the worker. */

// Map each menu label to the body class + the head-of-stack family the
// computed font-family should resolve to. Kept in lock-step with
// FONT_PREF_BY_CHOICE in GuiController.js and the body.font-pref-* rules.
const DYSLEXIC = 'OpenDyslexic (dyslexia-friendly)';
const LEGIBLE = 'Atkinson Hyperlegible';
const SANS = 'Plain sans-serif';
const DEFAULT = 'Story default';

async function bodyState(page) {
  return page.evaluate(() => ({
    cls: document.body.className,
    font: getComputedStyle(document.body).fontFamily,
    huntActive: document.body.classList.contains('hunt-active'),
  }));
}

// Set the preference, navigate (which fires :passagestart — the only place
// the class is re-applied, since Engine.play wipes body.className), and read
// back the resolved state. Deliberately does NOT call applyFontPreference()
// by hand: the navigation must do it, which is the regression under test.
async function chooseAndNavigate(page, choice, passage) {
  await page.evaluate((c) => { SugarCube.settings.fontChoice = c; }, choice);
  await goToPassage(page, passage);
  return bodyState(page);
}

// Open the Settings dialog (which fires :dialogopened → styleFontChoiceOptions),
// read each font-choice <option>'s inline font-family, then close the dialog.
async function optionFonts(page) {
  await page.evaluate(() => SugarCube.UI.settings());
  await page.waitForFunction(() => !!document.getElementById('setting-control-fontchoice'));
  const fonts = await page.evaluate(() => {
    const sel = document.getElementById('setting-control-fontchoice');
    const out = {};
    Array.from(sel.options).forEach((o) => { out[o.textContent.trim()] = o.style.fontFamily; });
    return out;
  });
  await page.evaluate(() => SugarCube.Dialog.close());
  return fonts;
}

test.describe('Player font preference (setup.Gui font choice)', () => {
  test.afterEach(async ({ game: page }) => {
    await page.evaluate((d) => {
      SugarCube.settings.fontChoice = d;
      SugarCube.setup.Gui.applyFontPreference();
    }, DEFAULT);
  });

  // --- Catalogue / API shape -------------------------------------

  test('fontChoices() exposes the default plus a dyslexia-friendly face', async ({ game: page }) => {
    const choices = await callSetup(page, 'setup.Gui.fontChoices()');
    expect(choices[0]).toBe(DEFAULT);
    expect(choices).toContain(DYSLEXIC);
    expect(choices).toContain(LEGIBLE);
    expect(choices).toContain(SANS);
    // No duplicates; default leads the list (it's the registered default).
    expect(new Set(choices).size).toBe(choices.length);
    expect(await callSetup(page, 'setup.Gui.defaultFontChoice()')).toBe(DEFAULT);
  });

  test('fontChoices() returns a fresh copy each call (no shared mutable array)', async ({ game: page }) => {
    const mutated = await page.evaluate(() => {
      const a = SugarCube.setup.Gui.fontChoices();
      a.push('tampered');
      return SugarCube.setup.Gui.fontChoices().includes('tampered');
    });
    expect(mutated).toBe(false);
  });

  // --- Town (normal) passage: each choice drives the body font ---

  test('Story default leaves the designed serif body font in town', async ({ game: page }) => {
    const s = await chooseAndNavigate(page, DEFAULT, 'Livingroom');
    expect(s.cls).not.toContain('font-pref');
    expect(s.font).toMatch(/EB Garamond/i);
  });

  test('OpenDyslexic choice stamps font-pref-dyslexic and resolves to OpenDyslexic', async ({ game: page }) => {
    const s = await chooseAndNavigate(page, DYSLEXIC, 'Livingroom');
    expect(s.cls).toContain('font-pref-dyslexic');
    expect(s.font).toMatch(/^OpenDyslexic/);
  });

  test('Atkinson Hyperlegible choice stamps font-pref-legible and resolves to Atkinson Hyperlegible', async ({ game: page }) => {
    const s = await chooseAndNavigate(page, LEGIBLE, 'Livingroom');
    expect(s.cls).toContain('font-pref-legible');
    expect(s.font).toMatch(/^"?Atkinson Hyperlegible"?/);
  });

  test('Plain sans-serif choice stamps font-pref-sans and resolves to the system sans', async ({ game: page }) => {
    const s = await chooseAndNavigate(page, SANS, 'Livingroom');
    expect(s.cls).toContain('font-pref-sans');
    expect(s.font).toMatch(/-apple-system/);
    expect(s.font).not.toMatch(/EB Garamond/i);
  });

  // --- Regression: the choice must survive navigation ------------

  test('the chosen font survives repeated passage navigation', async ({ game: page }) => {
    /* Regression: the :passagestart handler in GuiController.js used to be
       registered by passing the (SugarCube-frozen) onChange handler straight
       to jQuery's .on(), which throws "Cannot add property guid, object is
       not extensible" and aborted the rest of the top-level script — so the
       handler never registered and the class was dropped on the first
       navigation. The handler is now wrapped in a fresh anonymous function. */
    await page.evaluate((c) => { SugarCube.settings.fontChoice = c; }, DYSLEXIC);
    await goToPassage(page, 'Livingroom');
    expect((await bodyState(page)).cls).toContain('font-pref-dyslexic');
    await goToPassage(page, 'Home');
    expect((await bodyState(page)).cls).toContain('font-pref-dyslexic');
    await goToPassage(page, 'CityMap');
    expect((await bodyState(page)).cls).toContain('font-pref-dyslexic');
  });

  // --- Hunt boundary: accessibility picks hold; default flips ----

  test('the dyslexic override wins while a hunt is active', async ({ game: page }) => {
    // An accessibility pick must hold everywhere, including inside a hunt
    // where the body would otherwise revert to --font-haunted (system sans).
    await setHuntMode(page, 2);
    const s = await chooseAndNavigate(page, DYSLEXIC, 'Livingroom');
    expect(s.huntActive).toBe(true);
    expect(s.cls).toContain('font-pref-dyslexic');
    expect(s.font).toMatch(/^OpenDyslexic/);
  });

  test('Story default keeps the serif/sans split across the hunt boundary', async ({ game: page }) => {
    // Town renders the serif; the same default choice inside a hunt renders
    // the system sans — the designed split, with no pref class either side.
    const town = await chooseAndNavigate(page, DEFAULT, 'Livingroom');
    expect(town.huntActive).toBe(false);
    expect(town.cls).not.toContain('font-pref');
    expect(town.font).toMatch(/EB Garamond/i);

    await setHuntMode(page, 2);
    const hunt = await chooseAndNavigate(page, DEFAULT, 'Livingroom');
    expect(hunt.huntActive).toBe(true);
    expect(hunt.cls).not.toContain('font-pref');
    expect(hunt.font).toMatch(/-apple-system/);
  });

  // --- Settings dropdown shows each option in its own face -------

  test('fontPreviewProps() covers exactly the same choices as fontChoices()', async ({ game: page }) => {
    const choices = await callSetup(page, 'setup.Gui.fontChoices()');
    const previewKeys = await callSetup(page, 'Object.keys(setup.Gui.fontPreviewProps())');
    expect(previewKeys.sort()).toEqual(choices.slice().sort());
  });

  test('every preview prop resolves to a real --font-* stack on :root', async ({ game: page }) => {
    const resolved = await page.evaluate(() => {
      const props = SugarCube.setup.Gui.fontPreviewProps();
      const root = getComputedStyle(document.documentElement);
      const out = {};
      Object.keys(props).forEach((c) => { out[c] = root.getPropertyValue(props[c]).trim(); });
      return out;
    });
    Object.keys(resolved).forEach((choice) => {
      expect(resolved[choice], `${choice} → empty token`).not.toBe('');
    });
  });

  test('the Settings dropdown renders each option in the font it selects', async ({ game: page }) => {
    const fonts = await optionFonts(page);
    expect(fonts[DEFAULT]).toMatch(/EB Garamond/i);
    expect(fonts[DYSLEXIC]).toMatch(/^OpenDyslexic/);
    expect(fonts[LEGIBLE]).toMatch(/Atkinson Hyperlegible/i);
    expect(fonts[SANS]).toMatch(/-apple-system/);
  });

  test('option previews stay accurate when a font-pref class is already active', async ({ game: page }) => {
    /* The font-pref-* classes override --font-normal/--font-haunted on
       <body>; the previews resolve off <html> (:root) so each row keeps
       showing the face it represents instead of the player's current pick.
       With OpenDyslexic active, the dyslexic-overridden role tokens must
       NOT bleed into the "Story default" (serif) or "Plain sans" rows. */
    await page.evaluate((c) => {
      SugarCube.settings.fontChoice = c;
      SugarCube.setup.Gui.applyFontPreference();
    }, DYSLEXIC);
    const fonts = await optionFonts(page);
    expect(fonts[DEFAULT]).toMatch(/EB Garamond/i);
    expect(fonts[DEFAULT]).not.toMatch(/OpenDyslexic/);
    expect(fonts[SANS]).toMatch(/-apple-system/);
    expect(fonts[SANS]).not.toMatch(/OpenDyslexic/);
    expect(fonts[DYSLEXIC]).toMatch(/^OpenDyslexic/);
  });
});
