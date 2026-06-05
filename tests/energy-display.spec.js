const { test, expect } = require('./fixtures');
const { callSetup, setVar } = require('./helpers');

/* setup.Mc.energyDisplay() feeds the sidebar energy meter label. Energy
   carries fractional deltas now (the seduce minigame refunds 0.2 on
   submit/continue), so the raw $mc.energy value picks up float noise. The
   readout must clamp to at most 2 decimals and never show a long tail
   like 13.400000000000002, while keeping an exact 13.2 from drooping to
   13.19 under truncation. */
test.describe('setup.Mc.energyDisplay — sidebar energy readout', () => {
  async function display(page, raw) {
    await setVar(page, 'mc.energy', raw);
    return callSetup(page, 'setup.Mc.energyDisplay()');
  }

  test('whole values render without trailing decimals', async ({ game: page }) => {
    expect(await display(page, 20)).toBe(20);
    expect(await display(page, 0)).toBe(0);
  });

  test('strips the float tail from a noisy subtraction result', async ({ game: page }) => {
    expect(await display(page, 13.400000000000002)).toBe(13.4);
  });

  test('an exact 13.2 stored as 13.199999999999999 still reads 13.2', async ({ game: page }) => {
    // Math.trunc alone would give 13.19 here; the noise-snap step rescues it.
    expect(await display(page, 13.199999999999999)).toBe(13.2);
  });

  test('truncates a genuine third decimal place rather than rounding up', async ({ game: page }) => {
    expect(await display(page, 13.456)).toBe(13.45);
  });

  test('a fractional energy value (spend 1 + two 0.2 refunds from 20) reads 19.4', async ({ game: page }) => {
    expect(await display(page, 20 - 1 + 0.2 + 0.2)).toBe(19.4);
  });

  test('cumulative 0.2 refunds (0.2 * 67) read 13.4, not 13.400000000000002', async ({ game: page }) => {
    let e = 0;
    for (let i = 0; i < 67; i++) e += 0.2;
    expect(await display(page, e)).toBe(13.4);
  });
});
