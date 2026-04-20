const { test, expect } = require('@playwright/test');
const { openGame, resetGame, setVar, getVar, callSetup, goToPassage } = require('../helpers');
const { expectCleanPassage, setupHunt } = require('./e2e-helpers');

const COMPANIONS = [
  { name: 'Alice', passages: ['AliceInit', 'AliceMain', 'AliceHelp', 'AliceInfo', 'AliceContinue', 'AliceHuntEndAlone'] },
  { name: 'Blake', passages: ['BlakeInit', 'BlakeMain', 'BlakeHelp', 'BlakeInfo', 'BlakeContinue', 'BlakeHuntEndAlone'] },
  { name: 'Brook', passages: ['BrookInit', 'BrookMain', 'BrookHelp', 'BrookInfo', 'BrookHuntEndAlone'] },
];

const TRANS_COMPANIONS = ['Alex', 'Taylor', 'Casey'];

async function selectCompanion(page, name) {
  await page.evaluate((n) => SugarCube.setup.Companion.selectCompanion(n), name);
  const stats = {
    name, sanity: 100, sanityMax: 100, corruption: 0, lust: 0,
    lvl: 1, exp: 0, expForNextLvl: 20, decreaseSanity: 10,
    plan2TimeReq: 15, plan3TimeReq: 15, plan4TimeReq: 10,
    chanceOfSuccessCI: 30, chanceOfSuccessEMF: 15, chanceOfSuccessECTO: 15,
    chanceOfSuccessGWB: 15, chanceOfSuccessSB: 15, chanceOfSuccessTEMP: 15,
    chanceOfSuccessUVL: 15, chanceOfSuccessGR: 50, chanceOfSuccessAnyEvidence: 25,
  };
  await setVar(page, 'companion', stats);
  // Passages like AliceInfo / BlakeInfo / BrookInfo read $alice, $blake, $brook
  // directly; mirror the stats onto the backing story var so those still work.
  await setVar(page, name.toLowerCase(), stats);
}

test.describe('Companions — selection controller', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  test('selectCompanion is mutually exclusive across all six names', async () => {
    for (const name of ['Alice', 'Blake', 'Brook', 'Alex', 'Taylor', 'Casey']) {
      await page.evaluate((n) => SugarCube.setup.Companion.selectCompanion(n), name);
      expect(await getVar(page, 'isCompChosen' + name)).toBe(1);
      for (const other of ['Alice', 'Blake', 'Brook', 'Alex', 'Taylor', 'Casey']) {
        if (other !== name) expect(await getVar(page, 'isCompChosen' + other)).toBe(0);
      }
    }
  });

  test('isTransCompanion detects Alex/Taylor/Casey only', async () => {
    for (const name of TRANS_COMPANIONS) {
      await setVar(page, 'companion', { name });
      expect(await callSetup(page, 'setup.Companion.isTransCompanion()')).toBe(true);
    }
    for (const name of ['Alice', 'Blake', 'Brook']) {
      await setVar(page, 'companion', { name });
      expect(await callSetup(page, 'setup.Companion.isTransCompanion()')).toBe(false);
    }
  });

  test('sanityTier breaks at 75/50/25', async () => {
    await setVar(page, 'companion', { sanity: 80 });
    expect(await callSetup(page, 'setup.Companion.sanityTier()')).toBe('high');
    await setVar(page, 'companion', { sanity: 60 });
    expect(await callSetup(page, 'setup.Companion.sanityTier()')).toBe('mid');
    await setVar(page, 'companion', { sanity: 40 });
    expect(await callSetup(page, 'setup.Companion.sanityTier()')).toBe('low');
    await setVar(page, 'companion', { sanity: 10 });
    expect(await callSetup(page, 'setup.Companion.sanityTier()')).toBe('critical');
  });

  test('isLustHigh triggers at lust >= 50', async () => {
    await setVar(page, 'companion', { lust: 49 });
    expect(await callSetup(page, 'setup.Companion.isLustHigh()')).toBe(false);
    await setVar(page, 'companion', { lust: 50 });
    expect(await callSetup(page, 'setup.Companion.isLustHigh()')).toBe(true);
  });
});

test.describe('Companions — passage rendering', () => {
  // These passages pull in heavy <<do>>/<<redo>> blocks and a long chain of
  // conditional branches. Under parallel worker load the default 5s can
  // flake, so give this describe's tests 15s and two retries. Media requests
  // are blocked in openGame() so videos/images don't compete for bandwidth.
  test.describe.configure({ timeout: 15_000, retries: 2 });

  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  for (const { name, passages } of COMPANIONS) {
    for (const passage of passages) {
      test(`${name} — ${passage} renders cleanly`, async () => {
        await selectCompanion(page, name);
        // Seed vars read by *Main / *HuntEndAlone passages.
        await setVar(page, 'chanceToAttackAlice', 25);
        await setVar(page, 'chanceToAttackBlake', 25);
        await setVar(page, 'chanceToAttackBrook', 25);
        await setVar(page, 'isCompChosen', 1);
        await setVar(page, 'ghostHuntingMode', 2);
        await setVar(page, 'ghost', { name: 'Shade' });
        await goToPassage(page, passage);
        await expectCleanPassage(page);
      });
    }
  }

  for (const name of TRANS_COMPANIONS) {
    test(`${name}Main renders cleanly`, async () => {
      await selectCompanion(page, name);
      await goToPassage(page, name + 'Main');
      await expectCleanPassage(page);
    });
  }

  test('TransformationInit renders cleanly', async () => {
    await goToPassage(page, 'TransformationInit');
    await expectCleanPassage(page);
  });
});

test.describe('Companions — hunt-side events', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  test('canShowCompanionMiniPanel requires chosenPlan + hunt mode + haunted house', async () => {
    await setVar(page, 'chosenPlan', 'Plan1');
    await setVar(page, 'ghostHuntingMode', 2);
    await setVar(page, 'isOwaissa', 1);
    expect(await callSetup(page, 'setup.Companion.canShowCompanionMiniPanel()')).toBe(true);

    await setVar(page, 'isOwaissa', 0);
    await setVar(page, 'isElm', 0);
    expect(await callSetup(page, 'setup.Companion.canShowCompanionMiniPanel()')).toBe(false);

    await setVar(page, 'isElm', 1);
    expect(await callSetup(page, 'setup.Companion.canShowCompanionMiniPanel()')).toBe(true);

    await setVar(page, 'ghostHuntingMode', 0);
    expect(await callSetup(page, 'setup.Companion.canShowCompanionMiniPanel()')).toBe(false);
  });

  test('companionAtStreet excludes Plan1–Plan4 (those keep the companion inside)', async () => {
    await setVar(page, 'isCompChosen', 1);
    for (const plan of ['Plan1', 'Plan2', 'Plan3', 'Plan4']) {
      await setVar(page, 'chosenPlan', plan);
      expect(await callSetup(page, 'setup.Companion.companionAtStreet()')).toBe(false);
    }
    await setVar(page, 'chosenPlan', 'PlanX');
    expect(await callSetup(page, 'setup.Companion.companionAtStreet()')).toBe(true);
  });

  test('canWalkHomeWithCompanion requires any bottom worn', async () => {
    await setVar(page, 'jeansState', 'not worn');
    await setVar(page, 'skirtState', 'not bought');
    await setVar(page, 'shortsState', 'not bought');
    expect(await callSetup(page, 'setup.Companion.canWalkHomeWithCompanion()')).toBe(false);
    await setVar(page, 'shortsState', 'worn');
    expect(await callSetup(page, 'setup.Companion.canWalkHomeWithCompanion()')).toBe(true);
  });

  test('giveSanityPill raises companion sanity and decrements pills', async () => {
    await setVar(page, 'sanityPillsAmount', 2);
    await setVar(page, 'companion', { name: 'Alice', sanity: 40 });
    const used = await page.evaluate(() => SugarCube.setup.Companion.giveSanityPill());
    expect(used).toBe(true);
    expect(await getVar(page, 'sanityPillsAmount')).toBe(1);
    expect(await getVar(page, 'companion.sanity')).toBe(70);
  });

  test('giveSanityPill clamps companion sanity at 100', async () => {
    await setVar(page, 'sanityPillsAmount', 1);
    await setVar(page, 'companion', { name: 'Alice', sanity: 85 });
    await page.evaluate(() => SugarCube.setup.Companion.giveSanityPill());
    expect(await getVar(page, 'companion.sanity')).toBe(100);
  });

  test('giveSanityPill returns false when no pills remain', async () => {
    await setVar(page, 'sanityPillsAmount', 0);
    await setVar(page, 'companion', { name: 'Alice', sanity: 50 });
    const used = await page.evaluate(() => SugarCube.setup.Companion.giveSanityPill());
    expect(used).toBe(false);
  });

  test('giveSanityPill returns false when companion is already at full sanity', async () => {
    await setVar(page, 'sanityPillsAmount', 3);
    await setVar(page, 'companion', { name: 'Alice', sanity: 100 });
    const used = await page.evaluate(() => SugarCube.setup.Companion.giveSanityPill());
    expect(used).toBe(false);
    expect(await getVar(page, 'sanityPillsAmount')).toBe(3);
  });

  test('canAffordSoloContract and payForSoloContract integrate correctly', async () => {
    await setVar(page, 'mc.money', 19);
    expect(await callSetup(page, 'setup.Companion.canAffordSoloContract()')).toBe(false);
    await setVar(page, 'mc.money', 20);
    expect(await callSetup(page, 'setup.Companion.canAffordSoloContract()')).toBe(true);
    await page.evaluate(() => SugarCube.setup.Companion.payForSoloContract('Alice'));
    expect(await getVar(page, 'mc.money')).toBe(0);
    expect(await getVar(page, 'payForHuntAloneAlice')).toBe(1);
  });

  test('blakeDropsCursedItem only fires when Blake + chosen + cursed item', async () => {
    await setVar(page, 'companion', { name: 'Blake' });
    await setVar(page, 'isCompChosen', 1);
    await setVar(page, 'gotCursedItem', 1);
    expect(await callSetup(page, 'setup.Companion.blakeDropsCursedItem()')).toBe(true);
    await page.evaluate(() => SugarCube.setup.Companion.clearBlakeCursedItem());
    expect(await getVar(page, 'gotCursedItem')).toBe(0);
  });

  test('resetHuntState zeroes plan/flags for clean post-hunt state', async () => {
    await setVar(page, 'chosenPlan', 'Plan3');
    await setVar(page, 'isCompChosen', 1);
    await setVar(page, 'showComp', 1);
    await setVar(page, 'isCompRoomChosen', 1);
    await page.evaluate(() => SugarCube.setup.Companion.resetHuntState());
    expect(await getVar(page, 'chosenPlan')).toBe(0);
    expect(await getVar(page, 'isCompChosen')).toBe(0);
    expect(await getVar(page, 'isCompRoomChosen')).toBe(0);
    expect(await getVar(page, 'showComp')).toBe(0);
  });
});

test.describe('Companions — home/intimate events', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  test('WalkHomeTogether renders cleanly for Brook with high lust', async () => {
    await selectCompanion(page, 'Brook');
    await setVar(page, 'companion.lust', 80);
    await setVar(page, 'ghost', { name: 'Shade' });
    await goToPassage(page, 'WalkHomeTogether');
    await expectCleanPassage(page);
  });

  test('WalkHomeTogether routes to GhostSpecialEventSpirit for a Spirit ghost', async () => {
    await selectCompanion(page, 'Alice');
    await setVar(page, 'ghost', { name: 'Spirit' });
    await goToPassage(page, 'WalkHomeTogether');
    await expectCleanPassage(page);
    const text = await page.locator('#passages').innerText();
    expect(text).toContain('Sleep together');
  });

  for (const passage of [
    'CompanionEvent', 'CompanionLeaving', 'CompanionSucceeded',
    'CompanionFailed', 'CompanionResult', 'CompanionRandomRoom',
  ]) {
    test(`${passage} renders cleanly`, async () => {
      await selectCompanion(page, 'Alice');
      // CompanionRandomRoom reads $isOwaissa/$isElm to pick a room list.
      await setVar(page, 'isOwaissa', 1);
      await setVar(page, 'isElm', 0);
      await setVar(page, 'isCompRoomChosen', 0);
      await goToPassage(page, passage);
      await expectCleanPassage(page);
    });
  }
});

test.describe('Companions — hunt setup integration', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  test('Owaissa hallway with Alice chosen renders the mini panel', async () => {
    await setupHunt(page, 'Shade');
    await selectCompanion(page, 'Alice');
    await setVar(page, 'isCompChosen', 1);
    await setVar(page, 'chosenPlan', 'Plan1');
    await goToPassage(page, 'OwaissaHallway');
    await expectCleanPassage(page);
    expect(await callSetup(page, 'setup.Companion.canShowCompanionMiniPanel()')).toBe(true);
  });
});
