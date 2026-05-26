const { test, expect } = require('./fixtures');
const { setVar, callSetup } = require('./helpers');

/* The sidebar level icon doubles as an XP gauge: a desaturated base
 * star (always visible) with a color overlay clipped from the top by
 * (100 - pct)% so it fills bottom-up. Rendering goes through the
 * <<lvlStar>> widget — render it directly into a detached div so we
 * don't depend on a sidebar redraw landing between setVar and assert. */

function renderLvlStar(page) {
  return page.evaluate(() => {
    const $div = jQuery('<div></div>');
    $div.wiki('<<lvlStar>>');
    return $div.html();
  });
}

function extractClipInset(html) {
  const m = html.match(/clip-path:\s*inset\(([0-9.]+)%\s+0\s+0\s+0\)/);
  return m ? Number(m[1]) : null;
}

test.describe('Sidebar level star XP gauge', () => {
  test('empty XP renders the fill fully clipped (100% inset)', async ({ game: page }) => {
    await setVar(page, 'mc.exp', 0);
    await setVar(page, 'neededForNextLevel', 100);

    const html = await renderLvlStar(page);

    expect(html).toContain('class="lvl-star-base"');
    expect(html).toContain('class="lvl-star-fill"');
    expect(extractClipInset(html)).toBe(100);
  });

  test('half-filled XP clips the top 50%', async ({ game: page }) => {
    await setVar(page, 'mc.exp', 50);
    await setVar(page, 'neededForNextLevel', 100);

    expect(extractClipInset(await renderLvlStar(page))).toBe(50);
  });

  test('full XP leaves the fill layer unclipped (0% inset)', async ({ game: page }) => {
    await setVar(page, 'mc.exp', 99);
    await setVar(page, 'neededForNextLevel', 100);

    expect(extractClipInset(await renderLvlStar(page))).toBe(1);

    await setVar(page, 'mc.exp', 100);
    expect(extractClipInset(await renderLvlStar(page))).toBe(0);
  });

  test('overflowing exp is clamped (never inverts the clip)', async ({ game: page }) => {
    await setVar(page, 'mc.exp', 250);
    await setVar(page, 'neededForNextLevel', 100);

    expect(extractClipInset(await renderLvlStar(page))).toBe(0);
  });

  test('grantExp drives the clip-path lower as XP rises', async ({ game: page }) => {
    await setVar(page, 'mc.exp', 0);
    await setVar(page, 'neededForNextLevel', 100);
    expect(extractClipInset(await renderLvlStar(page))).toBe(100);

    await callSetup(page, 'setup.Mc.grantExp(25)');
    expect(extractClipInset(await renderLvlStar(page))).toBe(75);

    await callSetup(page, 'setup.Mc.grantExp(50)');
    expect(extractClipInset(await renderLvlStar(page))).toBe(25);
  });
});
