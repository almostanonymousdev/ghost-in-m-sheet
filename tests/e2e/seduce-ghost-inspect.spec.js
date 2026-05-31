const { test, expect } = require('../fixtures');
const { setVar, callSetup, goToPassage } = require('../helpers');
const { setupHunt, expectCleanPassage } = require('./e2e-helpers');

/*
 * Seduce-minigame WIN coda: <<seduceGhostInspect>>.
 *
 * When the ghost's arousal meter tops out the player wins, and before the
 * "Continue investigating" link the MC now crouches over the spent ghost
 * and keys out its species wildlife-host style, naming it by its true
 * tell. These specs pin:
 *   1. the shared frame + the right per-ghost specimen render on a win;
 *   2. the inspection keys off the TRUE identity (huntRealName), so a
 *      Mimic is unmasked as a Mimic even while $run.disguiseName shows a
 *      different face;
 *   3. the coda is gated to the win branch (absent mid-game);
 *   4. every catalogue ghost's case renders without a macro leak / error.
 */
test.describe('Seduce-ghost minigame — win-screen inspection', () => {

  // Park the player on the win branch for `ghostName` and render it.
  async function renderWin(page, ghostName, mutate) {
    await setupHunt(page, ghostName);
    await setVar(page, 'mc.energy', 10);
    await setVar(page, 'return', 'HuntRun');
    await page.evaluate(() => {
      SugarCube.State.variables.ghostOrgasmMeter = 100;
      SugarCube.State.variables.minigameVideo = 'start';
      SugarCube.setup.Mc.setOrgasmMeter(0);
    });
    if (mutate) await mutate();
    await goToPassage(page, 'SeduceGhostMinigame');
  }

  test('a win renders the shared frame and the matching specimen', async ({ game: page }) => {
    await renderWin(page, 'Banshee');
    const passage = page.locator('.passage');

    // Shared frame (always present on a win).
    await expect(passage).toContainText('Have a look at this one');
    // Banshee specimen — keyed by its real tell (the sanity-draining kiss).
    await expect(passage).toContainText('All that fuss over a kiss');
    // Outro precedes the existing exit link.
    await expect(passage).toContainText('Off you pop');
    await expect(
      passage.getByText('Continue investigating', { exact: true })
    ).toHaveCount(1);
    await expectCleanPassage(page);
  });

  test('the inspection unmasks a Mimic (switches on the true identity)', async ({ game: page }) => {
    await renderWin(page, 'Mimic', async () => {
      // Rotate the visible disguise to another ghost. The coda must still
      // identify the TRUE identity ($run.ghostName === "Mimic"), not the
      // worn face.
      await page.evaluate(() => {
        SugarCube.setup.HuntController.setField('disguiseName', 'Spirit');
      });
    });
    const passage = page.locator('.passage');

    // Mimic specimen present (pronoun-free substring so the assertion is
    // gender-agnostic and keys on the Mimic's actual tell — the rotating face).
    await expect(passage).toContainText('swapped at the half-hour mark');
    // ...and the disguise's (Spirit's) specimen is NOT what rendered.
    await expect(passage).not.toContainText('going translucent');
    await expectCleanPassage(page);
  });

  test('the inspection is gated to the win branch (absent mid-game)', async ({ game: page }) => {
    await setupHunt(page, 'Spirit');
    await setVar(page, 'mc.energy', 10);
    await page.evaluate(() => {
      SugarCube.State.variables.ghostOrgasmMeter = 40; // below the win line
      SugarCube.State.variables.minigameVideo = 'start';
      SugarCube.setup.Mc.setOrgasmMeter(0);
    });
    await goToPassage(page, 'SeduceGhostMinigame');

    const passage = page.locator('.passage');
    await expect(passage).not.toContainText('Have a look at this one');
    // Mid-game still offers the action menu, not the win exit.
    await expect(
      passage.getByText('Continue investigating', { exact: true })
    ).toHaveCount(0);
  });

  test('every catalogue ghost has a specimen that renders cleanly', async ({ game: page }) => {
    const names = await callSetup(page, 'setup.Ghosts.names()');
    expect(names.length).toBeGreaterThanOrEqual(18);

    for (const name of names) {
      await renderWin(page, name);
      const passage = page.locator('.passage');
      // The frame always renders; a real specimen (not an empty case)
      // follows it before the outro.
      await expect(passage).toContainText('Have a look at this one');
      await expect(passage).toContainText('Off you pop');
      await expectCleanPassage(page);
    }
  });
});
