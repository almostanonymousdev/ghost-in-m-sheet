const { test, expect } = require('@playwright/test');
const { openGame, resetGame, setVar, getVar, goToPassage } = require('../helpers');
const { expectCleanPassage, setupHunt } = require('./e2e-helpers');

const ROOMS = [
  'IroncladHallway',
  'IroncladReception',
  'IroncladKitchen',
  'IroncladBlockA',
  'IroncladBlockB',
  'IroncladBlockACellA',
  'IroncladBlockACellB',
  'IroncladBlockACellC',
  'IroncladBlockBCellA',
  'IroncladBlockBCellB',
  'IroncladBlockBCellC',
];

async function clickPassageLink(page, linkText, expectedPassage) {
  await page.locator('.passage').getByText(linkText, { exact: true }).first().click();
  await page.waitForFunction(p => SugarCube.State.passage === p, expectedPassage);
}

test.describe('Haunted house — Ironclad', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  test('Ironclad Prison renders with a real Go inside link when the warden outfit is ready', async () => {
    await setVar(page, 'isIronclad', 1);
    await setVar(page, 'ghostHuntingMode', 1);
    await setVar(page, 'wardenClothesStage', 2);
    await goToPassage(page, 'Ironclad Prison');
    await expectCleanPassage(page);
    await expect(page.locator('.passage').getByText('Go inside', { exact: true })).toBeVisible();
    expect(await page.locator('.passage').textContent()).toContain('Prison "Ironclad"');
  });

  test('clicking Go inside (wardenClothesStage=2) enters IroncladHallway and sets mode 2', async () => {
    test.setTimeout(10_000);
    await setupHunt(page, 'Spirit', 'ironclad');
    await setVar(page, 'ghostHuntingMode', 1);
    await goToPassage(page, 'Ironclad Prison');
    await clickPassageLink(page, 'Go inside', 'IroncladHallway');
    expect(await getVar(page, 'ghostHuntingMode')).toBe(2);
  });

  test('Ironclad Prison with wardenClothesStage != 2 shows the empty-walk-through branch', async () => {
    test.setTimeout(10_000);
    await setupHunt(page, 'Spirit', 'ironclad');
    // Street is re-entered before the warden outfit is ready.
    await setVar(page, 'wardenClothesStage', 0);
    await setVar(page, 'ghostHuntingMode', 1);
    await goToPassage(page, 'Ironclad Prison');
    await expectCleanPassage(page);

    await page.locator('.passage').getByText('Go inside', { exact: true }).first().click();
    // Linkreplace substitutes in place; wait for the distinctive "nothing happens" text.
    await page.waitForFunction(() =>
      document.querySelector('.passage').textContent.includes('nothing happens')
    );
    const text = await page.locator('.passage').textContent();
    expect(text).toContain('nothing happens');
    expect(text).toContain('Return home');
    expect(await getVar(page, 'mc.energy')).toBe(0);
  });

  test('End the hunt link appears on street while inside hunt mode', async () => {
    await setupHunt(page, 'Spirit', 'ironclad');
    await goToPassage(page, 'Ironclad Prison');
    await expectCleanPassage(page);
    await expect(page.locator('.passage').getByText('End the hunt', { exact: true })).toBeVisible();
  });

  test('End the hunt from street sends player to HuntOverManual and sets mode 3', async () => {
    test.setTimeout(10_000);
    await setupHunt(page, 'Spirit', 'ironclad');
    await setVar(page, 'isClothesStolen', 0);
    await goToPassage(page, 'Ironclad Prison');
    await clickPassageLink(page, 'End the hunt', 'HuntOverManual');
    expect(await getVar(page, 'ghostHuntingMode')).toBe(3);
  });

  for (const room of ROOMS) {
    test(`${room} renders cleanly during a hunt`, async () => {
      await setupHunt(page, 'Spirit', 'ironclad');
      await goToPassage(page, room);
      await expectCleanPassage(page);
    });
  }

  test('IroncladHallway exposes links to Reception, Kitchen, both Blocks, and Leave', async () => {
    await setupHunt(page, 'Spirit', 'ironclad');
    await goToPassage(page, 'IroncladHallway');
    const hallway = page.locator('.passage');
    for (const label of ['Reception', 'Kitchen', 'BlockA', 'BlockB', 'Leave']) {
      await expect(hallway.getByText(label, { exact: true }), label).toBeVisible();
    }
  });

  test('BlockA exposes cell links A/B/C plus Entrance', async () => {
    await setupHunt(page, 'Spirit', 'ironclad');
    await goToPassage(page, 'IroncladBlockA');
    const block = page.locator('.passage');
    for (const label of ['CellA', 'CellB', 'CellC', 'Entrance']) {
      await expect(block.getByText(label, { exact: true }), label).toBeVisible();
    }
  });

  test('BlockB exposes cell links A/B/C plus Entrance', async () => {
    await setupHunt(page, 'Spirit', 'ironclad');
    await goToPassage(page, 'IroncladBlockB');
    const block = page.locator('.passage');
    for (const label of ['CellA', 'CellB', 'CellC', 'Entrance']) {
      await expect(block.getByText(label, { exact: true }), label).toBeVisible();
    }
  });

  test('Hallway navigates to Reception, Kitchen, and both Blocks', async () => {
    test.setTimeout(25_000);
    await setupHunt(page, 'Spirit', 'ironclad');

    const pairs = [
      ['Reception', 'IroncladReception'],
      ['Kitchen', 'IroncladKitchen'],
      ['BlockA', 'IroncladBlockA'],
      ['BlockB', 'IroncladBlockB'],
    ];
    for (const [label, target] of pairs) {
      await goToPassage(page, 'IroncladHallway');
      await clickPassageLink(page, label, target);
      await expectCleanPassage(page);
      await clickPassageLink(page, 'Entrance', 'IroncladHallway');
    }
  });

  test('BlockA → each cell → BlockA round-trip', async () => {
    test.setTimeout(20_000);
    await setupHunt(page, 'Spirit', 'ironclad');
    const pairs = [
      ['CellA', 'IroncladBlockACellA'],
      ['CellB', 'IroncladBlockACellB'],
      ['CellC', 'IroncladBlockACellC'],
    ];
    for (const [label, target] of pairs) {
      await goToPassage(page, 'IroncladBlockA');
      await clickPassageLink(page, label, target);
      await expectCleanPassage(page);
      await clickPassageLink(page, 'BlockA', 'IroncladBlockA');
    }
  });

  test('BlockB → each cell → BlockB round-trip', async () => {
    test.setTimeout(20_000);
    await setupHunt(page, 'Spirit', 'ironclad');
    const pairs = [
      ['CellA', 'IroncladBlockBCellA'],
      ['CellB', 'IroncladBlockBCellB'],
      ['CellC', 'IroncladBlockBCellC'],
    ];
    for (const [label, target] of pairs) {
      await goToPassage(page, 'IroncladBlockB');
      await clickPassageLink(page, label, target);
      await expectCleanPassage(page);
      await clickPassageLink(page, 'BlockB', 'IroncladBlockB');
    }
  });

  test('Hallway Leave link returns to Ironclad Prison', async () => {
    test.setTimeout(10_000);
    await setupHunt(page, 'Spirit', 'ironclad');
    await goToPassage(page, 'IroncladHallway');
    await clickPassageLink(page, 'Leave', 'Ironclad Prison');
    expect(await getVar(page, 'ghostHuntingMode')).toBe(2);
  });

  test('Ironclad controller flag round-trips with setupHunt', async () => {
    await setupHunt(page, 'Spirit', 'ironclad');
    expect(await page.evaluate(() => SugarCube.setup.HauntedHouses.isIronclad())).toBe(true);
    expect(await page.evaluate(() => SugarCube.setup.HauntedHouses.isOwaissa())).toBe(false);
    expect(await page.evaluate(() => SugarCube.setup.HauntedHouses.isElm())).toBe(false);
    expect(await page.evaluate(() => SugarCube.setup.HauntedHouses.isEnigma())).toBe(false);
  });
});
