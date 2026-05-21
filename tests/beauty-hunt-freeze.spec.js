const { test, expect } = require('./fixtures');
const { callSetup, getVar, setVar } = require('./helpers');

/* setup.Mc.freezeBeauty() pins the displayed beauty for the duration of
   a hunt so drift chance / event rolls stay stable while clothes get
   torn off, makeup wipes, etc. setup.Mc.recomputeBeauty() snaps the
   underlying modifier back to a derivable value on every wake-up. */
test.describe('Beauty — hunt freeze + wake recompute', () => {
  test('startHunt freezes beauty; subsequent writes do not move the displayed value until end', async ({ game: page }) => {
    await callSetup(page, 'setup.Mc.setBeauty(42)');
    expect(await callSetup(page, 'setup.Mc.beauty()')).toBe(42);

    await callSetup(page, 'setup.HuntController.startHunt({ seed: 1 })');
    expect(await callSetup(page, 'setup.Mc.isBeautyFrozen()')).toBe(true);
    expect(await callSetup(page, 'setup.Mc.beauty()')).toBe(42);

    /* Underlying writes during the hunt update beautyModifier, but
       beauty() keeps returning the frozen snapshot. */
    await callSetup(page, 'setup.Mc.addBeauty(-20)');
    expect(await callSetup(page, 'setup.Mc.beauty()')).toBe(42);
    await callSetup(page, 'setup.Mc.setBeauty(0)');
    expect(await callSetup(page, 'setup.Mc.beauty()')).toBe(42);

    /* end() pairs with the freeze; after the hunt closes, beauty()
       resumes returning the live base+modifier. The last setBeauty(0)
       above pinned modifier to -beautyBase. */
    await callSetup(page, 'setup.HuntController.endHunt(false)');
    expect(await callSetup(page, 'setup.Mc.isBeautyFrozen()')).toBe(false);
    expect(await callSetup(page, 'setup.Mc.beauty()')).toBe(0);
  });

  test('lobby cancel (HuntController.end without endHunt) also unfreezes', async ({ game: page }) => {
    await callSetup(page, 'setup.Mc.setBeauty(35)');
    await callSetup(page, 'setup.HuntController.startHunt({ seed: 2 })');
    expect(await callSetup(page, 'setup.Mc.isBeautyFrozen()')).toBe(true);

    /* Cancel from the lobby short-circuits endHunt and calls end()
       directly -- it must still unfreeze beauty. */
    await callSetup(page, 'setup.HuntController.end()');
    expect(await callSetup(page, 'setup.Mc.isBeautyFrozen()')).toBe(false);
  });

  test('sleepAdvance() recomputes beautyModifier, papering over a desynced value', async ({ game: page }) => {
    /* Pin a known input the recompute will pick up. */
    await callSetup(page, 'setup.Mc.setFit(50)');

    /* Deliberately desync the stored modifier; this is the "bug
       elsewhere" the recompute is meant to guard against. */
    await setVar(page, 'mc.beautyModifier', -999);
    expect(await callSetup(page, 'setup.Mc.beauty()')).toBeLessThan(0);

    await callSetup(page, 'setup.Home.sleepAdvance(8)');

    /* Fresh game has no purchased wardrobe/piercings/tattoos and no
       makeup applied, so recompute lands at base (30) + fit (10) = 40. */
    expect(await callSetup(page, 'setup.Mc.beauty()')).toBe(40);
    expect(await getVar(page, 'mc.beautyModifier')).toBe(10);
  });

  test('recomputeBeauty() sums fit, piercings, tattoos, and makeup', async ({ game: page }) => {
    await callSetup(page, 'setup.Mc.setFit(100)');               // +20
    await setVar(page, 'earsPiercing', 'worn');                   // +2
    await setVar(page, 'nosePiercing', 'worn');                   // +3
    await setVar(page, 'tattooFace', 'worn');                     // +2
    await setVar(page, 'tattooHand', 'worn');                     // +1
    await setVar(page, 'mc.makeupImg', 2);
    await setVar(page, 'makeupApplied', 1);                       // tier 2 = +10

    /* Garbage modifier; recompute must override. */
    await setVar(page, 'mc.beautyModifier', 99999);

    await callSetup(page, 'setup.Mc.recomputeBeauty()');

    /* 30 (base) + 20 (fit) + 5 (piercings) + 3 (tattoos) + 10 (makeup) = 68. */
    expect(await callSetup(page, 'setup.Mc.beauty()')).toBe(68);
  });

  test('recompute under a freeze updates the underlying modifier but does not move the displayed value', async ({ game: page }) => {
    await callSetup(page, 'setup.Mc.setBeauty(50)');
    await callSetup(page, 'setup.HuntController.startHunt({ seed: 3 })');
    expect(await callSetup(page, 'setup.Mc.beauty()')).toBe(50);

    /* Recompute during the hunt should write a derivable modifier,
       but reads stay pinned to the frozen snapshot. */
    await callSetup(page, 'setup.Mc.recomputeBeauty()');
    expect(await callSetup(page, 'setup.Mc.beauty()')).toBe(50);
    expect(await callSetup(page, 'setup.Mc.isBeautyFrozen()')).toBe(true);

    /* After the hunt closes, the live (recomputed) value surfaces.
       Fresh-game canonical state lands at base 30 + fit 0 = 30. */
    await callSetup(page, 'setup.HuntController.endHunt(false)');
    expect(await callSetup(page, 'setup.Mc.beauty()')).toBe(30);
  });
});
