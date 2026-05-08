const { test, expect } = require('./fixtures');
const { goToPassage, getVar, setVar, callSetup } = require('./helpers');

/**
 * Regression coverage for the WitchSale ghost-info purchase flow.
 *
 * The original bug: clicking the "Buy" button on a ghost info card in
 * WitchSale (e.g. "Phantom Information, 200$") deducted the money but
 * never marked the ghost as discovered. The purchase could be repeated
 * indefinitely and the Ghostopedia entry stayed locked.
 *
 * Root cause was in passages/witch/widgetWitch.tw — the <<ghostInfoCard>>
 * widget set _ghostName / _price as temp variables and referenced them
 * inside a <<link>> callback. The link's payload runs at click time, by
 * which point the widget's temp scope is gone, so markDiscovered()
 * received undefined and silently no-op'd.
 */
test.describe('WitchSale — ghost info purchase', () => {
  test.beforeEach(async ({ game: page }) => {
    await setVar(page, 'hours', 12);
    await setVar(page, 'mc.money', 5000);
  });

  /** Click the Buy link inside the housecard whose <img alt> matches name. */
  async function clickBuyForGhost(page, ghostName) {
    const card = page.locator('.housecard', {
      has: page.locator(`text=Information about ${ghostName}`),
    });
    await card.locator('.buyItemLink a').click();
    await page.waitForFunction(() => SugarCube.State.passage === 'WitchSale');
  }

  test('buying ghost info marks the ghost as discovered', async ({ game: page }) => {
    await goToPassage(page, 'WitchSale');
    expect(await callSetup(page, 'setup.Ghosts.hasDiscovered("Phantom")')).toBe(false);

    await clickBuyForGhost(page, 'Phantom');

    expect(await callSetup(page, 'setup.Ghosts.hasDiscovered("Phantom")')).toBe(true);
  });

  test('buying ghost info deducts the listed price exactly once', async ({ game: page }) => {
    await goToPassage(page, 'WitchSale');
    const before = await getVar(page, 'mc.money');

    await clickBuyForGhost(page, 'Phantom');

    expect(await getVar(page, 'mc.money')).toBe(before - 200);
  });

  test('after purchase the same ghost card is no longer offered for sale', async ({ game: page }) => {
    await goToPassage(page, 'WitchSale');
    await clickBuyForGhost(page, 'Phantom');

    const phantomCards = page.locator('.housecard', {
      has: page.locator('text=Information about Phantom'),
    });
    await expect(phantomCards.locator('.buyItemLink a')).toHaveCount(0);
  });

  test('purchasing the same ghost twice cannot drain money beyond the single price', async ({ game: page }) => {
    await goToPassage(page, 'WitchSale');
    const before = await getVar(page, 'mc.money');

    await clickBuyForGhost(page, 'Phantom');

    // The second click should be impossible because the buy link is gone.
    // If it ever comes back as a clickable link, that's the bug.
    const phantomBuy = page.locator('.housecard', {
      has: page.locator('text=Information about Phantom'),
    }).locator('.buyItemLink a');
    await expect(phantomBuy).toHaveCount(0);

    expect(await getVar(page, 'mc.money')).toBe(before - 200);
  });

  test('purchased ghost description shows up in Ghostopedia', async ({ game: page }) => {
    await goToPassage(page, 'WitchSale');
    await clickBuyForGhost(page, 'Phantom');

    await goToPassage(page, 'Ghostopedia');
    // Phantom's catalogue description is "This type of ghost cannot turn off the lights."
    // Scope to the rendered passage so we don't match the embedded
    // <tw-passagedata> source (LibraryGhostBook also contains the phrase).
    await expect(
      page.locator('#passages').getByText('cannot turn off the lights').first()
    ).toBeVisible();
  });

  test('buying one ghost does not accidentally mark a different ghost as discovered', async ({ game: page }) => {
    await goToPassage(page, 'WitchSale');
    await clickBuyForGhost(page, 'Phantom');

    expect(await callSetup(page, 'setup.Ghosts.hasDiscovered("Phantom")')).toBe(true);
    expect(await callSetup(page, 'setup.Ghosts.hasDiscovered("Shade")')).toBe(false);
    expect(await callSetup(page, 'setup.Ghosts.hasDiscovered("Demon")')).toBe(false);
  });
});
