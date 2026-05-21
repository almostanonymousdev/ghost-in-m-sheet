const { test, expect } = require('../fixtures');
const { goToPassage, getVar } = require('../helpers');

test('body part radio is a real group, defaults to mind, mirrors choice', async ({ game }) => {
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

  // Default sensitivity map: brain = 3 bonus, others = 1.
  const initial = await getVar(game, 'sensualBodyPart');
  expect(initial.brain).toBe(3);
  expect(initial.tits).toBe(1);

  // Picking another radio deselects mind and bumps that part to 3.
  const tits = game.locator('input[type="radio"]').nth(1);
  await tits.click();
  await expect(tits).toBeChecked();
  await expect(minds).not.toBeChecked();
  expect(await getVar(game, 'sensualBodyPartChoice')).toBe('tits');
  const afterClick = await getVar(game, 'sensualBodyPart');
  expect(afterClick.tits).toBe(3);
});
