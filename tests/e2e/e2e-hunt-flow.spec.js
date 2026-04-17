const { test, expect } = require('@playwright/test');
const { openGame, resetGame, setVar, getVar, goToPassage } = require('../helpers');

/**
 * Click a SugarCube link whose visible text matches `linkText` and wait
 * until the engine settles on the expected passage.
 */
async function clickLink(page, linkText, expectedPassage) {
  await page.getByText(linkText, { exact: true }).first().click();
  await page.waitForFunction(
    (p) => SugarCube.State.passage === p,
    expectedPassage
  );
}

/**
 * Return the current SugarCube passage name.
 */
function currentPassage(page) {
  return page.evaluate(() => SugarCube.State.passage);
}

test.describe('E2E: buy contract → hunt → guess', () => {
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

  test('full flow: witch contract → owaissa hunt → correct guess', async () => {
    test.setTimeout(30_000);
    // ------------------------------------------------------------------
    // 1. Setup: start at CityMap during daytime with enough money
    // ------------------------------------------------------------------
    await goToPassage(page, 'CityMap');
    await setVar(page, 'hours', 12);
    await setVar(page, 'mc.money', 200);
    // Mark the first-visit flag as already seen so we get the contract UI
    await setVar(page, 'firstVisitWitchShop', false);

    const moneyBefore = await getVar(page, 'mc.money');
    expect(moneyBefore).toBe(200);

    // ------------------------------------------------------------------
    // 2. Navigate to the Witch's House
    // ------------------------------------------------------------------
    await clickLink(page, "Witch's House", 'Witch');
    expect(await currentPassage(page)).toBe('Witch');

    // ------------------------------------------------------------------
    // 3. Go inside the witch's shop
    //    There is a 1-in-7 chance of landing on WitchInsideMast instead.
    //    If that happens, navigate back and retry until we reach WitchInside.
    // ------------------------------------------------------------------
    for (let attempt = 0; attempt < 10; attempt++) {
      await page.getByText('Go inside', { exact: true }).first().click();
      await page.waitForFunction(() =>
        SugarCube.State.passage === 'WitchInside' ||
        SugarCube.State.passage === 'WitchInsideMast'
      );
      if ((await currentPassage(page)) === 'WitchInside') break;
      // Landed on WitchInsideMast — go back and try again
      await goToPassage(page, 'Witch');
    }
    expect(await currentPassage(page)).toBe('WitchInside');

    // ------------------------------------------------------------------
    // 4. Buy a contract
    // ------------------------------------------------------------------
    expect(await getVar(page, 'ghostHuntingMode')).toBe(0);

    await clickLink(page, 'I want to get a contract', 'GhostRandomize');
    expect(await currentPassage(page)).toBe('GhostRandomize');

    // Contract purchased: mode flips to 1, money decreased by 35
    expect(await getVar(page, 'ghostHuntingMode')).toBe(1);
    expect(await getVar(page, 'mc.money')).toBe(moneyBefore - 35);

    // A ghost was assigned
    const ghostName = await getVar(page, 'ghost.name');
    expect(ghostName).toBeTruthy();

    // ------------------------------------------------------------------
    // 5. Navigate back to WitchInside, then leave to CityMap
    // ------------------------------------------------------------------
    await clickLink(page, 'Back', 'WitchInside');
    await clickLink(page, 'Leave', 'Witch');
    await clickLink(page, 'Leave', 'CityMap');
    expect(await currentPassage(page)).toBe('CityMap');

    // ------------------------------------------------------------------
    // 6. Go home and set time to night, then start the hunt
    // ------------------------------------------------------------------
    await goToPassage(page, 'Livingroom');
    await setVar(page, 'hours', 23);
    // Re-render the passage so the night-time links appear
    await goToPassage(page, 'Livingroom');

    await clickLink(page, 'Ghost hunting', 'GhostStreet');
    expect(await currentPassage(page)).toBe('GhostStreet');

    // ------------------------------------------------------------------
    // 7. Choose Owaissa Street
    // ------------------------------------------------------------------
    await clickLink(page, 'Owaissa Street', 'Owaissa Street');
    expect(await currentPassage(page)).toBe('Owaissa Street');

    // Contract reward is set when the house is chosen
    const moneyReward = await getVar(page, 'moneyFromContract');
    expect(moneyReward).toBeGreaterThan(0);

    // ------------------------------------------------------------------
    // 8. Enter the house
    // ------------------------------------------------------------------
    await clickLink(page, 'Go inside', 'OwaissaHallway');
    expect(await currentPassage(page)).toBe('OwaissaHallway');
    expect(await getVar(page, 'ghostHuntingMode')).toBe(2);

    // ------------------------------------------------------------------
    // 9. Immediately leave the house (click "Outside" to return to street)
    // ------------------------------------------------------------------
    await clickLink(page, 'Outside', 'Owaissa Street');
    expect(await currentPassage(page)).toBe('Owaissa Street');
    // Still in hunt mode 2 — we haven't ended the hunt yet
    expect(await getVar(page, 'ghostHuntingMode')).toBe(2);

    // ------------------------------------------------------------------
    // 10. End the hunt from the street
    // ------------------------------------------------------------------
    // Ensure no special exit conditions interfere
    await setVar(page, 'isClothesStolen', 0);
    await clickLink(page, 'End the hunt', 'HuntOverManual');
    expect(await currentPassage(page)).toBe('HuntOverManual');
    expect(await getVar(page, 'ghostHuntingMode')).toBe(3);

    // ------------------------------------------------------------------
    // 11. Go home (Myling has a special redirect, so handle both cases)
    // ------------------------------------------------------------------
    const isMyling = ghostName === 'Myling';
    if (isMyling) {
      await clickLink(page, 'Go home', 'GhostSpecialEventMyling');
      // Navigate through to Livingroom
      await goToPassage(page, 'Livingroom');
    } else {
      await clickLink(page, 'Go home', 'Livingroom');
    }
    expect(await currentPassage(page)).toBe('Livingroom');

    // ------------------------------------------------------------------
    // 12. Navigate back to the witch to submit the guess
    //     (Livingroom → Home → CityMap → Witch → WitchInside)
    // ------------------------------------------------------------------
    await goToPassage(page, 'CityMap');
    await setVar(page, 'hours', 12);
    await clickLink(page, "Witch's House", 'Witch');

    for (let attempt = 0; attempt < 10; attempt++) {
      await page.getByText('Go inside', { exact: true }).first().click();
      await page.waitForFunction(() =>
        SugarCube.State.passage === 'WitchInside' ||
        SugarCube.State.passage === 'WitchInsideMast'
      );
      if ((await currentPassage(page)) === 'WitchInside') break;
      await goToPassage(page, 'Witch');
    }
    expect(await currentPassage(page)).toBe('WitchInside');

    // ------------------------------------------------------------------
    // 13. End the contract — submit a correct guess
    // ------------------------------------------------------------------
    await clickLink(page, 'End the contract', 'WitchEndContract');
    expect(await currentPassage(page)).toBe('WitchEndContract');

    // Select the correct ghost type from the dropdown
    await page.locator('select').selectOption(ghostName);
    // Verify the variable was set
    expect(await getVar(page, 'ghostTypeSelected')).toBe(ghostName);

    const moneyBeforeGuess = await getVar(page, 'mc.money');

    // Click "Choose" to submit the guess (uses linkreplace, not a passage link)
    await page.getByText('Choose', { exact: true }).first().click();

    // Wait for the 6-second timed reveal
    await page.waitForFunction(
      () => document.querySelector('.passage').textContent.includes("you're right"),
      { timeout: 10_000 }
    );

    // The witch confirms the correct guess
    const passageText = await page.locator('.passage').textContent();
    expect(passageText).toContain("you're right");

    // Money was awarded
    const moneyAfterGuess = await getVar(page, 'mc.money');
    expect(moneyAfterGuess).toBe(moneyBeforeGuess + moneyReward);

    // Contract is complete — hunting mode reset to 0
    expect(await getVar(page, 'ghostHuntingMode')).toBe(0);

    // ------------------------------------------------------------------
    // 14. Navigate back to confirm we're in a clean state
    // ------------------------------------------------------------------
    await clickLink(page, 'Back', 'WitchInside');
    expect(await currentPassage(page)).toBe('WitchInside');

    // No "End the contract" link should be visible anymore
    await expect(page.getByText('End the contract')).not.toBeVisible();
  });
});
