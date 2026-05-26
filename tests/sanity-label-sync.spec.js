const { test, expect } = require('./fixtures');
const { callSetup, getVar } = require('./helpers');

/* $mc.sanityUp is the rounded display string read by the sidebar sanity
   meter's label. Before the fix, only StoryCaption re-stamped it, so a
   mid-passage <<addSanity>> + <<refreshMeter 'sanity'>> animated the bar
   to a new percentage while the number on it stayed at the old value.
   Every mutation through setup.Mc must keep sanityUp aligned with the
   current sanity. */
test.describe('$mc.sanityUp stays aligned with $mc.sanity', () => {
  test('setSanity updates sanityUp', async ({ game: page }) => {
    await callSetup(page, 'setup.Mc.setSanity(75)');
    expect(await getVar(page, 'mc.sanityUp')).toBe('75.00');
  });

  test('addSanity updates sanityUp', async ({ game: page }) => {
    await callSetup(page, 'setup.Mc.setSanity(50)');
    await callSetup(page, 'setup.Mc.addSanity(-12.345)');
    expect(await getVar(page, 'mc.sanityUp')).toBe('37.66');
  });

  test('addSanity clamp at sanityMax updates sanityUp', async ({ game: page }) => {
    await callSetup(page, 'setup.Mc.setSanity(95)');
    await callSetup(page, 'setup.Mc.addSanity(50)');
    expect(await getVar(page, 'mc.sanity')).toBe(100);
    expect(await getVar(page, 'mc.sanityUp')).toBe('100.00');
  });

  test('addSanity collapse to 0 updates sanityUp', async ({ game: page }) => {
    await callSetup(page, 'setup.Mc.setSanity(5)');
    await callSetup(page, 'setup.Mc.addSanity(-10)');
    expect(await getVar(page, 'mc.sanity')).toBe(0);
    expect(await getVar(page, 'mc.sanityUp')).toBe('0.00');
  });

  test('removeSanity updates sanityUp', async ({ game: page }) => {
    await callSetup(page, 'setup.Mc.setSanity(80)');
    await callSetup(page, 'setup.Mc.removeSanity(15)');
    expect(await getVar(page, 'mc.sanityUp')).toBe('65.00');
  });
});
