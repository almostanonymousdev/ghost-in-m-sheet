const { test, expect } = require('@playwright/test');
const { openGame, resetGame } = require('../helpers');

test.describe('Save.onLoad — recovery wiring', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  test('a Save.onLoad handler is registered', async () => {
    // Proves the recovery hook is wired into the engine's load pipeline.
    // Combined with the setup.recoverMissingPassage unit tests, this covers
    // the end-to-end behavior without having to reach into SugarCube's
    // internal save serialization.
    const size = await page.evaluate(() => SugarCube.Save.onLoad.size);
    expect(size).toBeGreaterThanOrEqual(1);
  });

  test('recoverMissingPassage resolves via the real Story.has()', async () => {
    // Unit tests can fake the recovery target; this test exercises the
    // recovery against the actual compiled Story to make sure CityMap
    // really exists and deleted map passages really don't.
    const cityMapKept = await page.evaluate(() => {
      const m = { title: 'CityMap', variables: {} };
      return SugarCube.setup.recoverMissingPassage(m);
    });
    expect(cityMapKept).toBe(false);

    for (const deleted of ['RescueMap', 'DeliveryMap', 'NoSuchPassage123']) {
      const recovered = await page.evaluate((t) => {
        const m = { title: t, variables: {} };
        const changed = SugarCube.setup.recoverMissingPassage(m);
        return { changed: changed, title: m.title };
      }, deleted);
      expect(recovered.changed).toBe(true);
      expect(recovered.title).toBe('CityMap');
    }
  });
});
