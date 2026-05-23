const { test, expect } = require('../fixtures');
const { goToPassage, getVar } = require('../helpers');

test('body part radio is a real group, defaults to mind, commits on advance', async ({ game }) => {
  await goToPassage(game, 'Intro');

  // All six radios share one name attribute — true HTML radio group.
  const names = await game.locator('input[type="radio"]').evaluateAll(els =>
    Array.from(new Set(els.map(e => e.name)))
  );
  expect(names).toEqual(['radiobutton-sensualbodypartchoice']);

  // Default selection = mind (brain).
  expect(await getVar(game, 'sensualBodyPartChoice')).toBe('brain');
  const minds = game.locator('input[type="radio"]').nth(0);
  await expect(minds).toBeChecked();

  // Fresh-game sensitivity map: every part starts at 1, including brain.
  // The chosen part isn't bumped until the player leaves the Intro screen.
  const initial = await getVar(game, 'sensualBodyPart');
  expect(initial.brain).toBe(1);
  expect(initial.tits).toBe(1);

  // Picking another radio updates the staged choice but does NOT change
  // any sensitivity yet.
  const tits = game.locator('input[type="radio"]').nth(1);
  await tits.click();
  await expect(tits).toBeChecked();
  await expect(minds).not.toBeChecked();
  expect(await getVar(game, 'sensualBodyPartChoice')).toBe('tits');
  const afterClick = await getVar(game, 'sensualBodyPart');
  expect(afterClick.tits).toBe(1);
  expect(afterClick.brain).toBe(1);

  // Advancing to the next screen commits the choice: tits jumps to 3,
  // brain stays at the base sensitivity of 1.
  await goToPassage(game, 'Intro1');
  const afterAdvance = await getVar(game, 'sensualBodyPart');
  expect(afterAdvance.tits).toBe(3);
  expect(afterAdvance.brain).toBe(1);
});
