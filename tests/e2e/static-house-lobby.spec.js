const { test, expect } = require('../fixtures');
const { setVar, goToPassage, callSetup } = require('../helpers');

/* The HuntStart lobby lists the run's modifiers so the player can read
   what they're walking into. Static houses (setup.HuntHouses) pin
   forced modifiers that are mandatory house quirks, not a draft the
   player chose -- surfacing them as a "Modifiers" list (and offering a
   reroll control beside it) is misleading. The lobby therefore hides
   the whole modifier section for any static house, including Ironclad,
   whose four forced modifiers (warden outfit, prison visuals, etc.)
   used to render as a player-facing list. */
test.describe('HuntStart lobby -- static-house modifier list', () => {
  test.describe.configure({ timeout: 20_000 });

  test('a procedural hunt shows the modifier section', async ({ game: page }) => {
    /* No pending static house -> HuntStart auto-rolls a procedural run
       with the default two-modifier draft. */
    await setVar(page, 'pendingHuntHouseId', null);
    await goToPassage(page, 'HuntStart');

    expect(await callSetup(page, 'setup.HuntController.staticHouseId()')).toBeNull();
    expect((await callSetup(page, 'setup.Modifiers.activeList()')).length).toBeGreaterThan(0);
    await expect(page.locator('#hunt-lobby-modifiers')).toHaveCount(1);
  });

  test('Ironclad hides the modifier section even though forced modifiers are active', async ({ game: page }) => {
    /* GhostStreet's card sets $pendingHuntHouseId; HuntStart consumes
       it once to roll the static plan + forced modifiers. */
    await setVar(page, 'pendingHuntHouseId', 'ironclad');
    await goToPassage(page, 'HuntStart');

    expect(await callSetup(page, 'setup.HuntController.staticHouseId()')).toBe('ironclad');
    /* The forced modifiers are genuinely on the run -- the section is
       hidden because it's a static house, not because the list is
       empty. */
    expect((await callSetup(page, 'setup.Modifiers.activeList()')).length).toBeGreaterThan(0);

    await expect(page.locator('#hunt-lobby-modifiers')).toHaveCount(0);
    await expect(page.locator('#hunt-lobby-reroll')).toHaveCount(0);
    await expect(page.locator('.hunt-lobby')).not.toContainText('Modifiers');
  });
});
