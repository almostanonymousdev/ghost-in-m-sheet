const { test, expect } = require('@playwright/test');
const { openGame, resetGame, goToPassage, getVar, setVar } = require('../helpers');

/**
 * Wait until SugarCube navigates to the given passage.
 */
function waitForPassage(page, name) {
  return page.waitForFunction((p) => SugarCube.State.passage === p, name);
}

/**
 * Get the current passage name.
 */
function currentPassage(page) {
  return page.evaluate(() => SugarCube.State.passage);
}

/**
 * Readable text content of the main passage body.
 */
function passageText(page) {
  return page.locator('#passages').innerText();
}

/**
 * Locator scoped to the passage content area (excludes sidebar/UI).
 */
function passage(page) {
  return page.locator('#passages');
}

/**
 * Set up state for a player who has already met the manager (not first visit),
 * during open hours, with enough energy to work.
 */
async function setupReadyWorker(page) {
  await setVar(page, 'firstVisitDeliveryHub', false);
  await setVar(page, 'hours', 12);
  await setVar(page, 'mc.energy', 10);
  await setVar(page, 'mc.money', 50);
}

/**
 * Navigate to workDelivery, force deterministic orders with "always"-payMode
 * items (package) so tracking/pay is reliable, and disable special orders.
 * Returns the three orders.
 */
async function startShiftWithKnownOrders(page) {
  await goToPassage(page, 'WorkDelivery');
  await waitForPassage(page, 'WorkDelivery');

  // Override all order items to "package" (payMode: "always") for reliable
  // tracking and pay in tests.  Keep the randomly shuffled addresses.
  await page.evaluate(() => {
    const v = SugarCube.State.variables;
    for (let i = 0; i < 3; i++) {
      v.orders[i].item = 'package';
      v.orders[i].image = v.itemImages.package;
      v['order' + (i + 1)].item = 'package';
      v['order' + (i + 1)].image = v.itemImages.package;
    }
  });

  const orders = await page.evaluate(() => {
    const v = SugarCube.State.variables;
    return [
      { address: v.orders[0].address, item: v.orders[0].item },
      { address: v.orders[1].address, item: v.orders[1].item },
      { address: v.orders[2].address, item: v.orders[2].item },
    ];
  });

  // Disable special order so it doesn't interfere
  await setVar(page, 'deliverySpecialOrder', false);

  return orders;
}

/**
 * Click the "End the shift" button on DeliveryMap.
 * Uses dispatchEvent because the button can be overlapped by house cards.
 */
async function clickEndShift(page) {
  await page.evaluate(() => document.querySelector('#endShift').click());
}

// ─── Hub access ─────────────────────────────────────────────────

test.describe('Delivery E2E — Hub access', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  test('hub shows closed message outside business hours', async () => {
    await setVar(page, 'hours', 23);
    await goToPassage(page, 'DeliveryHub');
    const text = await passageText(page);
    expect(text).toContain('not open right now');
  });

  test('hub shows manager link during open hours', async () => {
    await setVar(page, 'hours', 12);
    await goToPassage(page, 'DeliveryHub');
    const link = passage(page).locator('.enterbtn a');
    await expect(link).toHaveCount(1);
    expect(await link.innerText()).toContain('manager');
  });

  test('hub shows "Take orders" when eligible to work', async () => {
    await setupReadyWorker(page);
    await goToPassage(page, 'DeliveryHub');
    const link = passage(page).locator('.usebtn a');
    await expect(link).toHaveCount(1);
    expect(await link.innerText()).toContain('Take orders');
  });

  test('hub shows too tired message when low energy', async () => {
    await setVar(page, 'firstVisitDeliveryHub', false);
    await setVar(page, 'hours', 12);
    await setVar(page, 'mc.energy', 0);
    await goToPassage(page, 'DeliveryHub');
    const text = await passageText(page);
    expect(text).toContain('too tired');
  });

  test('hub does not show "Take orders" on first visit', async () => {
    await setVar(page, 'hours', 12);
    await setVar(page, 'mc.energy', 10);
    await goToPassage(page, 'DeliveryHub');
    const links = passage(page).locator('.usebtn a');
    await expect(links).toHaveCount(0);
  });

  test('hub displays stats after completing shifts', async () => {
    await setupReadyWorker(page);
    await setVar(page, 'deliveryCompletedShifts', 3);
    await setVar(page, 'deliveryStreak', 2);
    await setVar(page, 'deliveryBestStreak', 2);
    await goToPassage(page, 'DeliveryHub');
    const text = await passageText(page);
    expect(text).toContain('Rank:');
    expect(text).toContain('Streak:');
    expect(text).toContain('Pay:');
  });
});

// ─── Manager — first visit ──────────────────────────────────────

test.describe('Delivery E2E — Manager first visit', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  test('first visit shows intro dialogue and clears first-visit flag', async () => {
    await setVar(page, 'hours', 12);
    await goToPassage(page, 'DeliveryManager');

    const text = await passageText(page);
    expect(text).toContain("I'm John");
    expect(text).toContain('Now you can work as a courier');

    expect(await getVar(page, 'firstVisitDeliveryHub')).toBe(false);
  });

  test('clicking manager link from hub navigates to DeliveryManager', async () => {
    await setVar(page, 'hours', 12);
    await goToPassage(page, 'DeliveryHub');

    await passage(page).locator('.enterbtn a').first().click();
    await waitForPassage(page, 'DeliveryManager');

    expect(await currentPassage(page)).toBe('DeliveryManager');
  });

  test('after first visit, hub now shows Take orders', async () => {
    await setVar(page, 'hours', 12);
    await setVar(page, 'mc.energy', 10);
    await goToPassage(page, 'DeliveryManager');

    expect(await getVar(page, 'firstVisitDeliveryHub')).toBe(false);

    await goToPassage(page, 'DeliveryHub');
    const link = passage(page).locator('.usebtn a');
    await expect(link).toHaveCount(1);
  });
});

// ─── Manager — return visits & payment ──────────────────────────

test.describe('Delivery E2E — Manager return visits', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  test('return visit shows generic greeting (not first visit)', async () => {
    await setupReadyWorker(page);
    await goToPassage(page, 'DeliveryManager');

    const text = await passageText(page);
    expect(text).not.toContain("I'm John");
    expect(text).toContain('Ask about payment');
  });

  test('payment discussion shows beauty requirement when beauty < 45', async () => {
    await setupReadyWorker(page);
    await setVar(page, 'mc.beauty', 30);
    await goToPassage(page, 'DeliveryManager');

    // Click the linkreplace trigger "Ask about payment"
    await passage(page).getByText('Ask about payment').click();

    // Wait for the replacement content to render
    await page.waitForFunction(() => {
      const el = document.querySelector('#passages');
      return el && el.innerText.includes('catch his attention');
    });

    const text = await passageText(page);
    expect(text).toContain('catch his attention');
    expect(text).toContain('45');
  });

  test('payment discussion shows corruption requirement when beauty >= 45 but corruption < 2', async () => {
    await setupReadyWorker(page);
    await setVar(page, 'mc.beauty', 50);
    await setVar(page, 'mc.corruption', 1);
    await goToPassage(page, 'DeliveryManager');

    await passage(page).getByText('Ask about payment').click();

    await page.waitForFunction(() => {
      const el = document.querySelector('#passages');
      return el && el.innerText.includes('No fucking way');
    });

    const text = await passageText(page);
    expect(text).toContain('No fucking way');
  });

  test('BJ option appears when beauty >= 45 and corruption >= 2', async () => {
    await setupReadyWorker(page);
    await setVar(page, 'mc.beauty', 50);
    await setVar(page, 'mc.corruption', 3);
    await goToPassage(page, 'DeliveryManager');

    await passage(page).getByText('Ask about payment').click();

    // Wait for the BJ link to appear in the replacement content
    await page.waitForFunction(() => {
      return !!document.querySelector('#passages a[data-passage="DeliveryManagerEventStart"]');
    });

    const bjLink = passage(page).locator('a[data-passage="DeliveryManagerEventStart"]');
    await expect(bjLink).toHaveCount(1);
  });

  test('BJ event grants money, exp, corruption and sets cooldown', async () => {
    await setupReadyWorker(page);
    await setVar(page, 'mc.beauty', 50);
    await setVar(page, 'mc.corruption', 3);
    const startMoney = await getVar(page, 'mc.money');
    const startCorruption = await getVar(page, 'mc.corruption');

    await goToPassage(page, 'DeliveryManagerEventStart');
    await waitForPassage(page, 'DeliveryManagerEventStart');

    expect(await getVar(page, 'mc.money')).toBe(startMoney + 10);
    expect(await getVar(page, 'mc.corruption')).toBe(startCorruption + 0.5);
    expect(await getVar(page, 'deliveryBJCD')).toBe(1);
  });

  test('manager shows cooldown message after BJ event', async () => {
    await setupReadyWorker(page);
    await setVar(page, 'mc.beauty', 50);
    await setVar(page, 'mc.corruption', 3);
    await setVar(page, 'deliveryBJCD', 1);
    await goToPassage(page, 'DeliveryManager');

    await passage(page).getByText('Ask about payment').click();

    await page.waitForFunction(() => {
      const el = document.querySelector('#passages');
      return el && el.innerText.includes('Enough for today');
    });

    const text = await passageText(page);
    expect(text).toContain('Enough for today');
  });
});

// ─── Shift initialization ───────────────────────────────────────

test.describe('Delivery E2E — Shift initialization', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  test('workDelivery generates 3 orders with addresses and items', async () => {
    await setupReadyWorker(page);
    await goToPassage(page, 'WorkDelivery');

    const orderCount = await page.evaluate(() => SugarCube.State.variables.orders.length);
    expect(orderCount).toBe(3);

    const orders = await page.evaluate(() => {
      return SugarCube.State.variables.orders.map(o => ({
        hasAddress: !!o.address,
        hasItem: !!o.item,
        hasImage: !!o.image,
      }));
    });
    for (const o of orders) {
      expect(o.hasAddress).toBe(true);
      expect(o.hasItem).toBe(true);
      expect(o.hasImage).toBe(true);
    }
  });

  test('workDelivery resets correct-this-shift counter', async () => {
    await setupReadyWorker(page);
    await setVar(page, 'deliveryCorrectThisShift', 5);
    await goToPassage(page, 'WorkDelivery');

    expect(await getVar(page, 'deliveryCorrectThisShift')).toBe(0);
  });

  test('workDelivery shows order list and Start button', async () => {
    await setupReadyWorker(page);
    await goToPassage(page, 'WorkDelivery');

    const text = await passageText(page);
    expect(text).toContain('Here are your orders');

    const startLink = passage(page).locator('.movebtn a');
    await expect(startLink).toHaveCount(1);
    expect(await startLink.innerText()).toContain('Start');
  });

  test('clicking Start navigates to DeliveryMap', async () => {
    await setupReadyWorker(page);
    await goToPassage(page, 'WorkDelivery');

    await passage(page).locator('.movebtn a').click();
    await waitForPassage(page, 'DeliveryMap');

    expect(await currentPassage(page)).toBe('DeliveryMap');
  });
});

// ─── Delivery map ───────────────────────────────────────────────

test.describe('Delivery E2E — Delivery map', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  test('map shows house cards with clickable addresses', async () => {
    await setupReadyWorker(page);
    await startShiftWithKnownOrders(page);

    await passage(page).locator('.movebtn a').click();
    await waitForPassage(page, 'DeliveryMap');

    const houseCards = page.locator('.housecard');
    const count = await houseCards.count();
    // 20 total cells in the grid (10 non-empty + 10 empty)
    expect(count).toBeGreaterThanOrEqual(10);
  });

  test('map shows End the shift button', async () => {
    await setupReadyWorker(page);
    await startShiftWithKnownOrders(page);
    await passage(page).locator('.movebtn a').click();
    await waitForPassage(page, 'DeliveryMap');

    const endShiftBtn = page.locator('#endShift');
    await expect(endShiftBtn).toBeVisible();
    expect(await endShiftBtn.innerText()).toContain('End the shift');
  });

  test('map shows order icons on correct houses', async () => {
    await setupReadyWorker(page);
    await startShiftWithKnownOrders(page);
    await passage(page).locator('.movebtn a').click();
    await waitForPassage(page, 'DeliveryMap');

    const orderIcons = page.locator('.mapOrderIcon');
    const iconCount = await orderIcons.count();
    expect(iconCount).toBeGreaterThanOrEqual(3);
  });
});

// ─── Correct delivery (auto-deliver) ───────────────────────────

test.describe('Delivery E2E — Correct delivery', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  test('delivering to correct address earns success pay', async () => {
    await setupReadyWorker(page);
    const orders = await startShiftWithKnownOrders(page);

    // deliveryAutoDeliver uses <<goto>> which redirects synchronously,
    // so State.passage is never 'DeliveryAutoDeliver' — play and wait
    // for the final passage instead.
    await setVar(page, 'currentHouse', orders[0].address);
    await page.evaluate(() => SugarCube.Engine.play('DeliveryAutoDeliver'));
    await page.waitForFunction(() => SugarCube.State.passage === 'DeliveryEvent');

    const earned = await getVar(page, 'earnedMoney');
    const successPay = await getVar(page, 'jobMoneySuccessed');
    expect(earned).toBeGreaterThanOrEqual(successPay);
  });

  test('correct delivery increments deliveryCorrectThisShift', async () => {
    await setupReadyWorker(page);
    const orders = await startShiftWithKnownOrders(page);

    await setVar(page, 'currentHouse', orders[0].address);
    await page.evaluate(() => SugarCube.Engine.play('DeliveryAutoDeliver'));
    await page.waitForFunction(() => SugarCube.State.passage === 'DeliveryEvent');

    expect(await getVar(page, 'deliveryCorrectThisShift')).toBeGreaterThanOrEqual(1);
  });

  test('correct delivery tracks visit count', async () => {
    await setupReadyWorker(page);
    const orders = await startShiftWithKnownOrders(page);
    const address = orders[0].address;

    await setVar(page, 'currentHouse', address);
    await page.evaluate(() => SugarCube.Engine.play('DeliveryAutoDeliver'));
    await page.waitForFunction(() => SugarCube.State.passage === 'DeliveryEvent');

    const counts = await getVar(page, 'deliveryVisitCounts');
    expect(counts[address]).toBe(1);
  });
});

// ─── Wrong delivery ─────────────────────────────────────────────

test.describe('Delivery E2E — Wrong delivery', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  test('delivering wrong item shows sad image and earns fail pay', async () => {
    await setupReadyWorker(page);
    await goToPassage(page, 'WorkDelivery');
    await waitForPassage(page, 'WorkDelivery');
    await setVar(page, 'deliverySpecialOrder', false);

    // Force order1 = pizza at address A, then visit address B with order1
    const orders = await page.evaluate(() => {
      const v = SugarCube.State.variables;
      return v.orders.map(o => ({ address: o.address, item: o.item }));
    });

    // Go to order[1]'s address but deliver order slot 1 (which has
    // order[0]'s address).  The items are random but addresses differ,
    // so the match check (address === currentHouse) fails.
    await setVar(page, 'currentHouse', orders[1].address);
    await setVar(page, 'currentOrder', 1);
    await goToPassage(page, 'DeliveryEvent');
    await waitForPassage(page, 'DeliveryEvent');

    const text = await passageText(page);
    const earned = await getVar(page, 'earnedMoney');
    const failPay = await getVar(page, 'jobMoneyFailed');

    expect(earned).toBe(failPay);
    expect(text).toContain('mistake');
  });
});

// ─── Auto-deliver to house with no matching order ───────────────

test.describe('Delivery E2E — No order at address', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  test('auto-delivering to house with no order shows "no one ordered" message', async () => {
    await setupReadyWorker(page);
    await startShiftWithKnownOrders(page);

    const noOrderAddress = await page.evaluate(() => {
      const v = SugarCube.State.variables;
      const orderAddresses = v.orders.map(o => o.address);
      return SugarCube.setup.deliveryStreets.find(s => !orderAddresses.includes(s));
    });

    await setVar(page, 'currentHouse', noOrderAddress);
    await goToPassage(page, 'DeliveryAutoDeliver');
    await waitForPassage(page, 'DeliveryAutoDeliver');

    const text = await passageText(page);
    expect(text).toContain('No one here ordered anything');
  });
});

// ─── End shift / back to manager ────────────────────────────────

test.describe('Delivery E2E — End shift', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  test('ending shift from map goes to manager and shows earnings', async () => {
    await setupReadyWorker(page);
    await startShiftWithKnownOrders(page);
    await passage(page).locator('.movebtn a').click();
    await waitForPassage(page, 'DeliveryMap');

    await setVar(page, 'earnedMoney', 30);

    await clickEndShift(page);
    await waitForPassage(page, 'DeliveryManager');

    const text = await passageText(page);
    expect(text).toContain('hard-earned money');
    expect(text).toContain('Earned during the shift');
  });

  test('ending shift increments completed shifts', async () => {
    await setupReadyWorker(page);
    const shiftsBefore = await getVar(page, 'deliveryCompletedShifts');

    await startShiftWithKnownOrders(page);
    await passage(page).locator('.movebtn a').click();
    await waitForPassage(page, 'DeliveryMap');

    await clickEndShift(page);
    await waitForPassage(page, 'DeliveryManager');

    expect(await getVar(page, 'deliveryCompletedShifts')).toBe(shiftsBefore + 1);
  });

  test('ending shift deducts 2 energy', async () => {
    await setupReadyWorker(page);
    const energyBefore = await getVar(page, 'mc.energy');

    await startShiftWithKnownOrders(page);
    await passage(page).locator('.movebtn a').click();
    await waitForPassage(page, 'DeliveryMap');

    await clickEndShift(page);
    await waitForPassage(page, 'DeliveryManager');

    expect(await getVar(page, 'mc.energy')).toBe(energyBefore - 2);
  });

  test('ending shift adds earned money to mc.money', async () => {
    await setupReadyWorker(page);
    const moneyBefore = await getVar(page, 'mc.money');

    await startShiftWithKnownOrders(page);
    await passage(page).locator('.movebtn a').click();
    await waitForPassage(page, 'DeliveryMap');

    await setVar(page, 'earnedMoney', 25);

    await clickEndShift(page);
    await waitForPassage(page, 'DeliveryManager');

    // Money should include the $25 earned (plus potential perfect bonus)
    expect(await getVar(page, 'mc.money')).toBeGreaterThanOrEqual(moneyBefore + 25);
  });

  test('perfect shift (3/3 correct) increments streak', async () => {
    await setupReadyWorker(page);
    await setVar(page, 'deliveryStreak', 2);

    await startShiftWithKnownOrders(page);
    await passage(page).locator('.movebtn a').click();
    await waitForPassage(page, 'DeliveryMap');

    await setVar(page, 'deliveryCorrectThisShift', 3);

    await clickEndShift(page);
    await waitForPassage(page, 'DeliveryManager');

    expect(await getVar(page, 'deliveryStreak')).toBe(3);
  });

  test('imperfect shift resets streak to 0', async () => {
    await setupReadyWorker(page);
    await setVar(page, 'deliveryStreak', 5);

    await startShiftWithKnownOrders(page);
    await passage(page).locator('.movebtn a').click();
    await waitForPassage(page, 'DeliveryMap');

    await setVar(page, 'deliveryCorrectThisShift', 2);

    await clickEndShift(page);
    await waitForPassage(page, 'DeliveryManager');

    expect(await getVar(page, 'deliveryStreak')).toBe(0);
  });

  test('perfect shift shows bonus message', async () => {
    await setupReadyWorker(page);

    await startShiftWithKnownOrders(page);
    await passage(page).locator('.movebtn a').click();
    await waitForPassage(page, 'DeliveryMap');

    await setVar(page, 'deliveryCorrectThisShift', 3);

    await clickEndShift(page);
    await waitForPassage(page, 'DeliveryManager');

    const text = await passageText(page);
    expect(text).toContain('Perfect shift');
    expect(text).toContain('Bonus');
  });

  test('best streak updates when current streak exceeds it', async () => {
    await setupReadyWorker(page);
    await setVar(page, 'deliveryStreak', 4);
    await setVar(page, 'deliveryBestStreak', 4);

    await startShiftWithKnownOrders(page);
    await passage(page).locator('.movebtn a').click();
    await waitForPassage(page, 'DeliveryMap');

    await setVar(page, 'deliveryCorrectThisShift', 3);

    await clickEndShift(page);
    await waitForPassage(page, 'DeliveryManager');

    expect(await getVar(page, 'deliveryBestStreak')).toBe(5);
  });

  test('leave button from manager returns to hub', async () => {
    await setupReadyWorker(page);
    await goToPassage(page, 'DeliveryManager');

    await passage(page).locator('.backbtn a').first().click();
    await waitForPassage(page, 'DeliveryHub');

    expect(await currentPassage(page)).toBe('DeliveryHub');
  });
});

// ─── Full flow: hub → manager → shift → deliver → end ──────────

test.describe('Delivery E2E — Full flow', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  test('complete flow: first visit → take orders → map → end shift → return to hub', async () => {
    await setVar(page, 'hours', 12);
    await setVar(page, 'mc.energy', 10);
    await setVar(page, 'mc.money', 50);

    // 1. Go to hub
    await goToPassage(page, 'DeliveryHub');
    expect(await currentPassage(page)).toBe('DeliveryHub');

    // 2. Visit manager (first visit)
    await passage(page).locator('.enterbtn a').first().click();
    await waitForPassage(page, 'DeliveryManager');
    expect(await getVar(page, 'firstVisitDeliveryHub')).toBe(false);

    // 3. Leave back to hub
    await passage(page).locator('.backbtn a').first().click();
    await waitForPassage(page, 'DeliveryHub');

    // 4. Now "Take orders" should be available
    const workLink = passage(page).locator('.usebtn a');
    await expect(workLink).toHaveCount(1);
    await workLink.click();
    await waitForPassage(page, 'WorkDelivery');

    // 5. Disable special orders for predictability
    await setVar(page, 'deliverySpecialOrder', false);

    // 6. Click Start to go to map
    await passage(page).locator('.movebtn a').click();
    await waitForPassage(page, 'DeliveryMap');

    // 7. End the shift (delivery itself is tested elsewhere)
    await clickEndShift(page);
    await waitForPassage(page, 'DeliveryManager');

    // Verify shift was counted
    expect(await getVar(page, 'deliveryCompletedShifts')).toBe(1);

    // 8. Leave back to hub
    await passage(page).locator('.backbtn a').first().click();
    await waitForPassage(page, 'DeliveryHub');
    expect(await currentPassage(page)).toBe('DeliveryHub');
  });

  test('multiple shifts accumulate completed shift count', async () => {
    await setupReadyWorker(page);

    for (let shift = 0; shift < 2; shift++) {
      await startShiftWithKnownOrders(page);
      await passage(page).locator('.movebtn a').click();
      await waitForPassage(page, 'DeliveryMap');

      await clickEndShift(page);
      await waitForPassage(page, 'DeliveryManager');

      // Re-set energy for next shift
      await setVar(page, 'mc.energy', 10);
      await setVar(page, 'hours', 12);
    }

    expect(await getVar(page, 'deliveryCompletedShifts')).toBe(2);
  });
});

// ─── Special order ──────────────────────────────────────────────

test.describe('Delivery E2E — Special order', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  test('special order shows RUSH label on workDelivery page', async () => {
    await setupReadyWorker(page);

    // Mock Math.random so workDelivery's 25% check always passes.
    // SugarCube's random(1,100) uses Math.random() for non-seeded games.
    await page.evaluate(() => {
      Math.random = () => 0.1;  // random(1,100) → floor(0.1*100)+1 = 11 ≤ 25
    });

    await goToPassage(page, 'WorkDelivery');

    // Restore Math.random
    await page.evaluate(() => { delete Math.random; });

    const text = await passageText(page);
    expect(text).toContain('RUSH');
  });

  test('special order house is marked on map', async () => {
    await setupReadyWorker(page);
    await startShiftWithKnownOrders(page);

    await setVar(page, 'deliverySpecialOrder', true);
    await setVar(page, 'deliverySpecialOrderAddress', 'Golden Road 34');
    await setVar(page, 'deliverySpecialOrderPay', 22);
    await setVar(page, 'deliverySpecialOrderType', 'safe');

    await goToPassage(page, 'DeliveryMap');

    const specialHouse = page.locator('.special-house');
    await expect(specialHouse).toHaveCount(1);
  });

  test('safe special order earns special order pay', async () => {
    await setupReadyWorker(page);
    await startShiftWithKnownOrders(page);

    const specialAddress = 'Golden Road 34';
    await setVar(page, 'deliverySpecialOrder', true);
    await setVar(page, 'deliverySpecialOrderAddress', specialAddress);
    await setVar(page, 'deliverySpecialOrderPay', 22);
    await setVar(page, 'deliverySpecialOrderType', 'safe');
    await setVar(page, 'earnedMoney', 0);

    await setVar(page, 'currentHouse', specialAddress);
    await goToPassage(page, 'DeliverySpecialEvent');

    const text = await passageText(page);
    expect(text).toContain('lifesaver');

    const earned = await getVar(page, 'earnedMoney');
    expect(earned).toBeGreaterThanOrEqual(22);
  });
});

// ─── Route familiarity on map ───────────────────────────────────

test.describe('Delivery E2E — Route familiarity display', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  test('familiar routes get visual indicator on map', async () => {
    await setupReadyWorker(page);
    await setVar(page, 'deliveryVisitCounts', { 'Star Street 25': 3 });

    await startShiftWithKnownOrders(page);
    await goToPassage(page, 'DeliveryMap');

    const familiarHouse = page.locator('.familiar-house');
    await expect(familiarHouse).toHaveCount(1);
  });

  test('unfamiliar routes have no familiar-house class', async () => {
    await setupReadyWorker(page);
    await setVar(page, 'deliveryVisitCounts', {});

    await startShiftWithKnownOrders(page);
    await goToPassage(page, 'DeliveryMap');

    const familiarHouse = page.locator('.familiar-house');
    await expect(familiarHouse).toHaveCount(0);
  });
});
