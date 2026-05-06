const { test, expect } = require('@playwright/test');
const { openGame, goToPassage, setHuntMode, callSetup } = require('./helpers');

/* Cheats were moved out of the StoryCaption side-panel into the
   built-in SugarCube Settings dialog. Persistent state cheats
   (toggles, the ghost-type list) use Setting.add* directly; one-shot
   mutations and the ghost name/room reveals are injected as a
   buttons section into the dialog body on :dialogopened. These tests
   smoke-check the renamed UIBar entry, the injection itself, and the
   "hide until clicked" reveal pattern. */

async function openSettingsDialog(page) {
  await page.evaluate(() => SugarCube.UI.settings());
  await page.waitForSelector('#ui-dialog-body .cheat-actions', { timeout: 3000 });
}

async function closeDialog(page) {
  await page.evaluate(() => SugarCube.Dialog.close());
  await page.waitForFunction(() => !SugarCube.Dialog.isOpen());
}

test.describe('Cheats moved to the Settings / Cheats dialog', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });

  test.beforeEach(async () => {
    await goToPassage(page, 'Start');
    if (await page.evaluate(() => SugarCube.Dialog.isOpen())) {
      await closeDialog(page);
    }
  });

  test('UIBar settings link reads "Settings / Cheats"', async () => {
    const text = await page.evaluate(
      () => document.querySelector('#menu-item-settings a').textContent
    );
    expect(text).toBe('Settings / Cheats');
  });

  test('Opening Settings injects the cheat actions panel', async () => {
    await openSettingsDialog(page);
    const groupTitles = await page.locator('#ui-dialog-body .cheat-actions-group .cheat-actions-gh').allTextContents();
    expect(groupTitles).toEqual(expect.arrayContaining([
      'MC',
      'Companions',
      'Hunting',
      'Reveal (current contract / hunt)'
    ]));
  });

  test('"Add money" button writes +10,000 to mc.money', async () => {
    const before = await callSetup(page, 'setup.Mc.money()');
    await openSettingsDialog(page);
    await page.locator('#ui-dialog-body .cheat-btn', { hasText: 'Add money' }).click();
    await closeDialog(page);
    const after = await callSetup(page, 'setup.Mc.money()');
    expect(after).toBe(before + 10000);
  });

  test('Hunting buttons disable when no hunt is active', async () => {
    await setHuntMode(page, 0);
    await openSettingsDialog(page);
    const huntingGroup = page.locator('#ui-dialog-body .cheat-actions-group')
      .filter({ has: page.locator('.cheat-actions-gh', { hasText: 'Hunting' }) });
    await expect(huntingGroup.locator('.cheat-actions-gh-note')).toContainText('Available only during a hunt');
    const buttons = huntingGroup.locator('.cheat-btn');
    expect(await buttons.count()).toBeGreaterThan(0);
    for (const btn of await buttons.all()) {
      await expect(btn).toBeDisabled();
    }
  });

  test('Hunting + Reveal cheats enable during a rogue run', async () => {
    await setHuntMode(page, 0);
    await page.evaluate(() => SugarCube.setup.Rogue.startRogue({ seed: 42 }));
    await goToPassage(page, 'RogueRun');
    try {
      await openSettingsDialog(page);

      const huntingGroup = page.locator('#ui-dialog-body .cheat-actions-group')
        .filter({ has: page.locator('.cheat-actions-gh', { hasText: 'Hunting' }) });
      // No "available only..." note when rogue makes the group active.
      expect(await huntingGroup.locator('.cheat-actions-gh-note').count()).toBe(0);
      const huntingButtons = huntingGroup.locator('.cheat-btn');
      expect(await huntingButtons.count()).toBeGreaterThan(0);
      for (const btn of await huntingButtons.all()) {
        await expect(btn).toBeEnabled();
      }

      // Reveal Ghost name surfaces the rogue ghost (no Mimic disguise here).
      const expectedName = await callSetup(page, 'setup.Rogue.ghostName()');
      const revealRow = page.locator('#ui-dialog-body .cheat-reveal').first();
      await expect(revealRow.locator('button.cheat-btn')).toBeEnabled();
      await revealRow.locator('button.cheat-btn').click();
      await expect(revealRow.locator('.cheat-reveal-result'))
        .toContainText(new RegExp(`Ghost name:\\s*${expectedName}`));

      // Reveal Ghost room shows the floor-plan room label, not the raw id.
      const expectedRoom = await callSetup(page, 'setup.HuntController.ghostRoomLabel()');
      expect(expectedRoom).not.toMatch(/^room_\d+$/);
      const roomRow = page.locator('#ui-dialog-body .cheat-reveal').nth(1);
      await roomRow.locator('button.cheat-btn').click();
      await expect(roomRow.locator('.cheat-reveal-result'))
        .toContainText(`Ghost room: ${expectedRoom}`);

      await closeDialog(page);
    } finally {
      await page.evaluate(() => SugarCube.setup.Rogue.end());
    }
  });

  test('Ghost name reveal stays hidden until the button is clicked', async () => {
    await setHuntMode(page, 1);  // contract — stub Hunt is "Shade"
    await openSettingsDialog(page);

    const revealRow = page.locator('#ui-dialog-body .cheat-reveal').first();

    // Before click: shows only the button label, no result span.
    expect(await revealRow.locator('.cheat-reveal-result').count()).toBe(0);
    await expect(revealRow.locator('button.cheat-btn')).toHaveText('Ghost name');

    // After click: button is replaced by the result, which contains the name.
    await revealRow.locator('button.cheat-btn').click();
    await expect(revealRow.locator('.cheat-reveal-result')).toContainText(/Ghost name:\s*Shade/);
    expect(await revealRow.locator('button.cheat-btn').count()).toBe(0);
  });

  test('Reveal hides again when the dialog is closed and reopened', async () => {
    await setHuntMode(page, 1);
    await openSettingsDialog(page);
    await page.locator('#ui-dialog-body .cheat-reveal').first().locator('button.cheat-btn').click();
    await closeDialog(page);

    await openSettingsDialog(page);
    const revealRow = page.locator('#ui-dialog-body .cheat-reveal').first();
    expect(await revealRow.locator('.cheat-reveal-result').count()).toBe(0);
    await expect(revealRow.locator('button.cheat-btn')).toHaveText('Ghost name');
  });
});
