const { test, expect } = require('@playwright/test');
const { openGame, resetGame, callSetup, goToPassage } = require('./helpers');

/* setup.HuntController is the cross-mode facade that the regular
   witch-contract flow ($hunt) and the rogue-run flow ($run) both
   plug into. Public surface:
     - mode()          'regular' | 'rogue' | null
     - isActive()      true iff mode() !== null
     - activeGhost()   Ghost instance or null
     - isGhostHere()   bool, mode-aware
   These tests pin the contract so a future caller can rely on the
   facade rather than checking $hunt / $run by hand. */
test.describe('HuntController', () => {
  let page;

  test.beforeAll(async ({ browser }) => {
    page = await openGame(browser);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test.beforeEach(async () => {
    await resetGame(page);
  });

  test('mode() returns null when neither a hunt nor a rogue run is active', async () => {
    expect(await callSetup(page, 'setup.HuntController.mode()')).toBeNull();
    expect(await callSetup(page, 'setup.HuntController.isActive()')).toBe(false);
    expect(await callSetup(page, 'setup.HuntController.activeGhost()')).toBeNull();
    expect(await callSetup(page, 'setup.HuntController.isGhostHere()')).toBe(false);
  });

  test('mode() returns "regular" while a witch contract is open', async () => {
    await page.evaluate(() => SugarCube.setup.Ghosts.startHunt('Shade'));
    expect(await callSetup(page, 'setup.HuntController.mode()')).toBe('regular');
    expect(await callSetup(page, 'setup.HuntController.isActive()')).toBe(true);

    // The classic active() path should still resolve through the facade.
    const activeName = await callSetup(page, 'setup.HuntController.activeGhost().name');
    expect(activeName).toBe('Shade');

    // setup.Ghosts.active() is the legacy alias and must agree.
    const aliasName = await callSetup(page, 'setup.Ghosts.active().name');
    expect(aliasName).toBe('Shade');
  });

  test('mode() returns "rogue" once a rogue run is rolled', async () => {
    await goToPassage(page, 'GhostStreet');
    await page.locator('.passage')
      .getByText('Rogue Haunt', { exact: true })
      .first()
      .click();
    await page.waitForFunction(() => SugarCube.State.passage === 'RogueStart');

    expect(await callSetup(page, 'setup.HuntController.mode()')).toBe('rogue');
    expect(await callSetup(page, 'setup.HuntController.isActive()')).toBe(true);

    // Rogue mode resolves to the rogue ghost from the catalogue.
    const rogueGhostName = await callSetup(page, 'setup.Rogue.ghostName()');
    expect(rogueGhostName).toBeTruthy();
    expect(await callSetup(page, 'setup.HuntController.activeGhost().name')).toBe(rogueGhostName);
    expect(await callSetup(page, 'setup.Ghosts.active().name')).toBe(rogueGhostName);
  });

  test('regular mode wins when both $hunt and $run somehow co-exist', async () => {
    /* Defensive: a corrupted save could carry both. The witch flow has
       priority because that's where evidence-pruning and DeleteEvidence
       state live; rogue runs only ever read from the catalogue. */
    await goToPassage(page, 'GhostStreet');
    await page.locator('.passage')
      .getByText('Rogue Haunt', { exact: true })
      .first()
      .click();
    await page.waitForFunction(() => SugarCube.State.passage === 'RogueStart');
    await page.evaluate(() => SugarCube.setup.Ghosts.startHunt('Spirit'));

    expect(await callSetup(page, 'setup.HuntController.mode()')).toBe('regular');
    expect(await callSetup(page, 'setup.HuntController.activeGhost().name')).toBe('Spirit');
  });

  test('isGhostHere() in rogue mode follows the lair-room comparison', async () => {
    await goToPassage(page, 'GhostStreet');
    await page.locator('.passage')
      .getByText('Rogue Haunt', { exact: true })
      .first()
      .click();
    await page.waitForFunction(() => SugarCube.State.passage === 'RogueStart');
    await page.locator('.passage')
      .getByText('Enter the haunt', { exact: true })
      .first()
      .click();
    await page.waitForFunction(() => SugarCube.State.passage === 'RogueRun');

    // Player starts in room_0 (hallway); lair is non-hallway.
    const lair = await callSetup(page, 'setup.Rogue.ghostRoomId()');
    expect(lair).not.toBe('room_0');
    expect(await callSetup(page, 'setup.HuntController.isGhostHere()')).toBe(false);

    // Walk into the lair, re-render RogueRun, expect true.
    await page.evaluate(id => SugarCube.setup.Rogue.setCurrentRoom(id), lair);
    await goToPassage(page, 'RogueRun');
    expect(await callSetup(page, 'setup.HuntController.isGhostHere()')).toBe(true);

    // Outside the RogueRun passage, isGhostHere() falls back to false
    // even when the player record says they're in the lair -- the
    // tool checks that read this only fire on RogueRun.
    await goToPassage(page, 'CityMap');
    expect(await callSetup(page, 'setup.HuntController.isGhostHere()')).toBe(false);
  });
});
