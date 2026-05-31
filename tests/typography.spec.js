/**
 * Typography — runtime body-font split.
 *
 * StyleController's :passagestart handler stamps `hunt-active` on <body>
 * whenever a hunt run is live, which flips the body font from the
 * literary serif (--font-normal, EB Garamond) used everywhere else to
 * the original clean system sans (--font-haunted) the haunted houses
 * have always rendered in. These tests drive real navigations and read
 * the *computed* font-family so a regression in the toggle, the class,
 * or the CSS variables fails loudly.
 *
 * Web fonts are blocked at the network layer in the fixture, but
 * getComputedStyle returns the declared family stack regardless of
 * whether the font file loaded — so the assertions are about which
 * stack is in force, not glyph rendering.
 */
const { test, expect } = require('./fixtures');
const { goToPassage, setHuntMode } = require('./helpers');

function bodyFont(page) {
  return page.evaluate(() => getComputedStyle(document.body).fontFamily);
}

function hasHuntActive(page) {
  return page.evaluate(() => document.body.classList.contains('hunt-active'));
}

test.describe('Typography — normal locations use the serif', () => {
  test('a town passage with no active hunt renders in EB Garamond, no hunt-active class', async ({ game: page }) => {
    await setHuntMode(page, 0);
    await goToPassage(page, 'Home');
    expect(await hasHuntActive(page)).toBe(false);
    expect(await bodyFont(page)).toContain('EB Garamond');
  });
});

test.describe('Typography — haunted houses keep the system sans', () => {
  test('an active hunt stamps hunt-active and reverts the body to the system sans', async ({ game: page }) => {
    // Stamp a live $run (cheatStartHunt) + ACTIVE mode, then enter the
    // hunt room so :passagestart sees isActive() === true.
    await setHuntMode(page, 2);
    await goToPassage(page, 'HuntRun');
    expect(await hasHuntActive(page)).toBe(true);
    const font = await bodyFont(page);
    expect(font).toContain('-apple-system');
    expect(font).not.toContain('EB Garamond');
  });

  test('leaving the hunt drops hunt-active and restores the serif', async ({ game: page }) => {
    await setHuntMode(page, 2);
    await goToPassage(page, 'HuntRun');
    expect(await hasHuntActive(page)).toBe(true);

    // Clear the run and step back into town.
    await setHuntMode(page, 0);
    await goToPassage(page, 'Home');
    expect(await hasHuntActive(page)).toBe(false);
    expect(await bodyFont(page)).toContain('EB Garamond');
  });
});

test.describe('Typography — display titles', () => {
  test('the sidebar story title renders in the Creepster display font', async ({ game: page }) => {
    await goToPassage(page, 'Home');
    const titleFont = await page.evaluate(() => {
      const el = document.getElementById('story-title');
      return el ? getComputedStyle(el).fontFamily : null;
    });
    expect(titleFont).toContain('Creepster');
  });

  test('the Intro screen title opts into .spooky-title', async ({ game: page }) => {
    await goToPassage(page, 'Intro');
    const found = await page.evaluate(() => {
      const el = document.querySelector('#passages .spooky-title');
      return el ? getComputedStyle(el).fontFamily : null;
    });
    expect(found).toContain('Creepster');
  });
});
