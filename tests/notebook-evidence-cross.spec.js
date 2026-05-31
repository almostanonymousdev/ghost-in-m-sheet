const { test, expect } = require('./fixtures');
const { goToPassage, getVar, setVar, callSetup } = require('./helpers');

/*
 * Notebook "not present" (✗) crosses.
 *
 * The EMF / UVL / High-Temperature rows carry a ✗ toggle to the left of
 * their checkbox. Ticking it records the evidence as confirmed-absent,
 * which prunes ghosts that expose it from the candidate highlight. These
 * specs cover the matching logic (setup.Ghosts) and the Notebook DOM
 * wiring (render, live re-highlight, present/absent mutual exclusion).
 */

const names = (page, expr) =>
  callSetup(page, `Array.from(setup.Ghosts.matchingNames(${expr})).sort()`);

test.describe('evidence-cross matching logic', () => {
  test('crossing an evidence rules out ghosts that expose it', async ({ game: page }) => {
    // Confirmed: Ghost Writing Book + Spiritbox. Four ghosts carry both.
    const base = await names(page, '{ gwb: true, spiritbox: true }');
    expect(base).toEqual(['Deogen', 'Moroi', 'Poltergeist', 'Spirit']);

    // Rule out EMF → Spirit (has EMF) drops.
    expect(await names(page, '{ gwb: true, spiritbox: true }, { emf: true }'))
      .toEqual(['Deogen', 'Moroi', 'Poltergeist']);

    // Also rule out UVL → Poltergeist (has UVL) drops.
    expect(await names(page, '{ gwb: true, spiritbox: true }, { emf: true, uvl: true }'))
      .toEqual(['Deogen', 'Moroi']);

    // Also rule out High Temperature → Moroi drops, leaving Deogen.
    expect(await names(page, '{ gwb: true, spiritbox: true }, { emf: true, uvl: true, temperature: true }'))
      .toEqual(['Deogen']);
  });

  test('a falsy cross entry does not rule anything out', async ({ game: page }) => {
    expect(await names(page, '{ gwb: true, spiritbox: true }, { emf: false }'))
      .toEqual(['Deogen', 'Moroi', 'Poltergeist', 'Spirit']);
  });

  test('a cross with no positive checks highlights every non-eliminated ghost', async ({ game: page }) => {
    // With no confirmed evidence a ✗ alone narrows the field: every ghost
    // that does NOT expose the crossed evidence stays lit.
    const survivors = await names(page, '{}, { emf: true }');
    const expected = await callSetup(
      page,
      'setup.Ghosts.list().filter(function (g) {' +
        ' return !g.evidence.some(function (e) { return e.id === "emf"; });' +
        ' }).map(function (g) { return g.name; }).sort()'
    );
    expect(survivors).toEqual(expected);
    expect(survivors.length).toBeGreaterThan(0);
    expect(survivors).not.toContain('Spirit'); // Spirit exposes EMF
  });

  test('an empty slate (no checks, no crosses) highlights nobody', async ({ game: page }) => {
    expect(await names(page, '{}, {}')).toEqual([]);
    expect(await names(page, '{}')).toEqual([]);
  });

  test('every evidence cssClass equals its id (evidenceIdOf relies on it)', async ({ game: page }) => {
    // The Notebook reads a checkbox's row by matching the span's cssClass
    // back to an evidence id. That only works while the two are identical.
    const mismatches = await callSetup(
      page,
      'Object.keys(setup.Ghosts.Evidence).filter(function (k) {' +
        ' var e = setup.Ghosts.Evidence[k]; return e.cssClass !== e.id; })'
    );
    expect(mismatches).toEqual([]);
  });

  test('readEvidenceCrosses covers only the three sensor readings', async ({ game: page }) => {
    const keys = await callSetup(page, 'Object.keys(setup.Ghosts.readEvidenceCrosses()).sort()');
    expect(keys).toEqual(['emf', 'temperature', 'uvl']);
  });

  test('setEvidenceCross writes state for crossable ids and no-ops otherwise', async ({ game: page }) => {
    expect(await callSetup(page, 'setup.Ghosts.setEvidenceCross("emf", true)')).toBe(true);
    expect(await getVar(page, 'EMF5Cross')).toBe(true);
    // Interactive evidences have no cross toggle.
    expect(await callSetup(page, 'setup.Ghosts.setEvidenceCross("spiritbox", true)')).toBe(false);
    expect(await getVar(page, 'SpiritboxCross')).toBeUndefined();
  });

  test('resetEvidenceChecks clears crosses too', async ({ game: page }) => {
    await setVar(page, 'EMF5Cross', true);
    await setVar(page, 'UVLCross', true);
    await setVar(page, 'TemperatureCross', true);
    await callSetup(page, 'setup.Ghosts.resetEvidenceChecks()');
    expect(await getVar(page, 'EMF5Cross')).toBe(false);
    expect(await getVar(page, 'UVLCross')).toBe(false);
    expect(await getVar(page, 'TemperatureCross')).toBe(false);
  });
});

test.describe('Notebook DOM wiring', () => {
  const hasRight = (page, ghost) =>
    page.locator(`[data-ghost="${ghost}"]`).evaluate((el) => el.classList.contains('right'));

  test('a ✗ toggle renders only on the EMF / UVL / High-Temperature rows', async ({ game: page }) => {
    await goToPassage(page, 'Notebook');
    expect(await page.locator('.flexwrapperNotebook .evidence-cross input[type="checkbox"]').count()).toBe(3);
    for (const cls of ['emf', 'uvl', 'temperature']) {
      expect(await page.locator(`span.${cls} .evidence-cross input`).count()).toBe(1);
    }
    for (const cls of ['glass', 'gwb', 'spiritbox']) {
      expect(await page.locator(`span.${cls} .evidence-cross`).count()).toBe(0);
    }
  });

  test('the * bullets are gone from the evidence list', async ({ game: page }) => {
    await goToPassage(page, 'Notebook');
    const text = await page.locator('.flexwrapperNotebook b').first().innerText();
    expect(text).not.toContain('*');
    expect(text).toContain('EMF 5');
  });

  test('crossing EMF live-prunes a ghost from the candidate highlight', async ({ game: page }) => {
    await setVar(page, 'GWBCheck', true);
    await setVar(page, 'SpiritboxCheck', true);
    await goToPassage(page, 'Notebook');

    // Spirit (EMF, Spiritbox, GWB) is a candidate on the positive checks.
    expect(await hasRight(page, 'Spirit')).toBe(true);
    expect(await hasRight(page, 'Deogen')).toBe(true);

    await page.locator('span.emf .evidence-cross input').click();
    await page.waitForTimeout(20);

    expect(await getVar(page, 'EMF5Cross')).toBe(true);
    expect(await hasRight(page, 'Spirit')).toBe(false); // has EMF → ruled out
    expect(await hasRight(page, 'Deogen')).toBe(true);  // no EMF → survives
  });

  test('ticking a ✗ clears the row\'s present checkbox (mutual exclusion)', async ({ game: page }) => {
    await setVar(page, 'EMF5Check', true);
    await goToPassage(page, 'Notebook');

    const presentBox = page.locator('span.emf input[type="checkbox"]').nth(1); // [0] is the cross
    expect(await presentBox.isChecked()).toBe(true);

    await page.locator('span.emf .evidence-cross input').click();
    await page.waitForTimeout(20);

    expect(await getVar(page, 'EMF5Cross')).toBe(true);
    expect(await getVar(page, 'EMF5Check')).toBe(false);
    expect(await presentBox.isChecked()).toBe(false);
  });

  test('ticking a present checkbox clears the row\'s ✗ (mutual exclusion)', async ({ game: page }) => {
    await setVar(page, 'EMF5Cross', true);
    await goToPassage(page, 'Notebook');

    const crossBox = page.locator('span.emf .evidence-cross input');
    expect(await crossBox.isChecked()).toBe(true);

    await page.locator('span.emf input[type="checkbox"]').nth(1).click(); // present checkbox
    await page.waitForTimeout(20);

    expect(await getVar(page, 'EMF5Check')).toBe(true);
    expect(await getVar(page, 'EMF5Cross')).toBe(false);
    expect(await crossBox.isChecked()).toBe(false);
  });

  test('a pre-set cross prunes candidates on initial render (no click)', async ({ game: page }) => {
    await setVar(page, 'GWBCheck', true);
    await setVar(page, 'SpiritboxCheck', true);
    await setVar(page, 'EMF5Cross', true);
    await goToPassage(page, 'Notebook');

    // The cross box renders checked straight from $state…
    expect(await page.locator('span.emf .evidence-cross input').isChecked()).toBe(true);
    // …and the first refreshHighlights() already honors it.
    expect(await hasRight(page, 'Spirit')).toBe(false); // has EMF → ruled out
    expect(await hasRight(page, 'Deogen')).toBe(true);  // no EMF → survives
  });

  test('a crossed evidence with no positive checks lights every non-eliminated ghost', async ({ game: page }) => {
    await goToPassage(page, 'Notebook');
    await page.locator('span.emf .evidence-cross input').click();
    await page.waitForTimeout(20);

    expect(await getVar(page, 'EMF5Cross')).toBe(true);
    const lit = await page.locator('.journal-container span.right').count();
    expect(lit).toBeGreaterThan(0);
    expect(await hasRight(page, 'Spirit')).toBe(false); // exposes EMF → ruled out
    expect(await hasRight(page, 'Deogen')).toBe(true);  // no EMF → stays lit
  });

  test('checking a ✗ strikes through its evidence row (state indicator)', async ({ game: page }) => {
    await goToPassage(page, 'Notebook');
    const row = page.locator('.flexwrapperNotebook span.emf');
    const decoLine = () => row.evaluate((el) => getComputedStyle(el).textDecorationLine);

    expect(await decoLine()).toBe('none');
    await page.locator('span.emf .evidence-cross input').click();
    await page.waitForTimeout(20);
    expect(await decoLine()).toContain('line-through');

    // Toggling back off removes the strikethrough.
    await page.locator('span.emf .evidence-cross input').click();
    await page.waitForTimeout(20);
    expect(await decoLine()).toBe('none');
  });

  test('the ✗ glyph is red whether or not it is active', async ({ game: page }) => {
    await goToPassage(page, 'Notebook');
    const cross = page.locator('span.emf .evidence-cross input');
    const glyphColor = () => cross.evaluate((el) => getComputedStyle(el, '::before').color);

    expect(await glyphColor()).toBe('rgb(255, 0, 0)');
    await cross.click();
    await page.waitForTimeout(20);
    expect(await glyphColor()).toBe('rgb(255, 0, 0)');
  });

  test('the ✗ and the present checkbox are both vertically centered', async ({ game: page }) => {
    await goToPassage(page, 'Notebook');
    const cross = page.locator('span.emf .evidence-cross input');
    const present = page.locator('span.emf input[type="checkbox"]').nth(1);
    expect(await cross.evaluate((el) => getComputedStyle(el).verticalAlign)).toBe('middle');
    expect(await present.evaluate((el) => getComputedStyle(el).verticalAlign)).toBe('middle');
  });

  test('a cross survives navigating away and back', async ({ game: page }) => {
    await goToPassage(page, 'Notebook');
    await page.locator('span.uvl .evidence-cross input').click();
    await page.waitForTimeout(20);
    expect(await getVar(page, 'UVLCross')).toBe(true);

    await goToPassage(page, 'Bag');
    await goToPassage(page, 'Notebook');

    expect(await getVar(page, 'UVLCross')).toBe(true);
    expect(await page.locator('span.uvl .evidence-cross input').isChecked()).toBe(true);
  });
});

test.describe('evidence-cross hunt lifecycle', () => {
  test('starting a hunt clears any standing crosses', async ({ game: page }) => {
    await setVar(page, 'EMF5Cross', true);
    await setVar(page, 'UVLCross', true);
    await setVar(page, 'TemperatureCross', true);

    await callSetup(page, 'setup.HuntController.startHunt({ seed: 1 })');

    expect(await getVar(page, 'EMF5Cross')).toBe(false);
    expect(await getVar(page, 'UVLCross')).toBe(false);
    expect(await getVar(page, 'TemperatureCross')).toBe(false);
  });
});
