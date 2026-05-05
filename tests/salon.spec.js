const { test, expect } = require('./fixtures');
const { setVar, callSetup } = require('./helpers');

test.describe('Salon Controller', () => {
  test('isOpen true during operating hours (8-21)', async ({ game: page }) => {
    // arrange
    await setVar(page, 'hours', 12);

    // act
    const result = await callSetup(page, 'setup.Salon.isOpen()');

    // assert
    expect(result).toBe(true);
  });

  test('isOpen true at hour 8', async ({ game: page }) => {
    // arrange
    await setVar(page, 'hours', 8);

    // act
    const result = await callSetup(page, 'setup.Salon.isOpen()');

    // assert
    expect(result).toBe(true);
  });

  test('isOpen true at hour 21', async ({ game: page }) => {
    // arrange
    await setVar(page, 'hours', 21);

    // act
    const result = await callSetup(page, 'setup.Salon.isOpen()');

    // assert
    expect(result).toBe(true);
  });

  test('isOpen false at hour 7 (boundary)', async ({ game: page }) => {
    // arrange
    await setVar(page, 'hours', 7);

    // act
    const result = await callSetup(page, 'setup.Salon.isOpen()');

    // assert
    expect(result).toBe(false);
  });

  test('isOpen false at hour 22 (boundary)', async ({ game: page }) => {
    // arrange
    await setVar(page, 'hours', 22);

    // act
    const result = await callSetup(page, 'setup.Salon.isOpen()');

    // assert
    expect(result).toBe(false);
  });

  test('isOpen false at midnight', async ({ game: page }) => {
    // arrange
    await setVar(page, 'hours', 0);

    // act
    const result = await callSetup(page, 'setup.Salon.isOpen()');

    // assert
    expect(result).toBe(false);
  });
});
