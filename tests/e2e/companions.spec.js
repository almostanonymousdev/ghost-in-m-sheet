const { test, expect } = require('@playwright/test');
const { openGame, resetGame, setVar, getVar, setHuntMode, getHuntMode, callSetup, goToPassage } = require('../helpers');
const { expectCleanPassage, setupHunt } = require('./e2e-helpers');

const COMPANIONS = [
  { name: 'Alice', passages: ['AliceHelp', 'AliceInfo', 'AliceContinue', 'AliceHuntEndAlone'] },
  { name: 'Blake', passages: ['BlakeHelp', 'BlakeInfo', 'BlakeContinue', 'BlakeHuntEndAlone'] },
  { name: 'Brook', passages: ['BrookHelp', 'BrookInfo', 'BrookHuntEndAlone'] },
];

const TRANS_COMPANIONS = ['Alex', 'Taylor', 'Casey'];
const ALL_COMPANIONS = ['Brook', 'Alice', 'Blake', 'Alex', 'Taylor', 'Casey'];

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
      expect(await getVar(page, name.toLowerCase() + '.chosen')).toBe(1);
      for (const other of ['Alice', 'Blake', 'Brook', 'Alex', 'Taylor', 'Casey']) {
        if (other !== name) expect(await getVar(page, other.toLowerCase() + '.chosen')).toBe(0);
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
        await setVar(page, 'alice.chanceToAttack', 25);
        await setVar(page, 'blake.chanceToAttack', 25);
        await setVar(page, 'brook.chanceToAttack', 25);
        await setVar(page, 'isCompChosen', 1);
        await setHuntMode(page, 2);
        await setVar(page, 'ghost', { name: 'Shade' });
        await goToPassage(page, passage);
        await expectCleanPassage(page);
      });
    }
  }

  // Regression: the <<cisCompanionSoloPicker>> widget's
  // "isCompanionFinishedSoloHunting" branch used to render a wikilink
  // whose display text contained "<<= _cName>>" / "<<= _args[1]>>".
  // SugarCube did not evaluate those macros in display text and the
  // raw "<<=" leaked to the player. The {Brook,Alice,Blake}Info tests
  // above don't set is*GoingForHuntingAlone, so they hit the <<else>>
  // branch and missed the bug. Force the post-solo-return branch and
  // confirm the link renders with the substituted name + pronoun.
  for (const name of ['Brook', 'Alice', 'Blake']) {
    test(`${name}Info post-solo-return link renders substituted text`, async () => {
      await selectCompanion(page, name);
      await setVar(page, `${name.toLowerCase()}.goingSolo`, 2);
      // AliceInfo gates the picker on aliceWorkState === 2; harmless
      // for Brook/Blake which don't read it.
      await page.evaluate(() => SugarCube.setup.Companion.setAliceWorkState(2));
      await goToPassage(page, `${name}Info`);
      await expectCleanPassage(page);
      const text = await page.locator('#passages').innerText();
      expect(text).toContain(`Ask ${name} how her ghost hunt went.`);
      expect(text).not.toContain('<<=');
      expect(text).not.toContain('_cName');
      expect(text).not.toContain('_args');
    });
  }

  for (const name of ALL_COMPANIONS) {
    test(`CompanionMain renders cleanly for ${name}`, async () => {
      await selectCompanion(page, name);
      // Seed vars read by CompanionMain via <<companionMain>>.
      await setVar(page, 'brook.chanceToAttack', 25);
      await setVar(page, 'alice.chanceToAttack', 25);
      await setVar(page, 'blake.chanceToAttack', 25);
      await setVar(page, 'alex.chanceToAttack', 25);
      await setVar(page, 'taylor.chanceToAttack', 25);
      await setVar(page, 'casey.chanceToAttack', 25);
      await setVar(page, 'isCompChosen', 1);
      await setHuntMode(page, 2);
      await setVar(page, 'ghost', { name: 'Shade' });
      await goToPassage(page, 'CompanionMain');
      await expectCleanPassage(page);
    });
  }

});

test.describe('Companions — hunt-side events', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  test('canShowCompanionMiniPanel requires chosenPlan + hunt mode + haunted house', async () => {
    await setVar(page, 'chosenPlan', 'Plan1');
    await setHuntMode(page, 2);
    await setVar(page, 'hauntedHouse', 'owaissa');
    expect(await callSetup(page, 'setup.Companion.canShowCompanionMiniPanel()')).toBe(true);

    await setVar(page, 'hauntedHouse', null);
    expect(await callSetup(page, 'setup.Companion.canShowCompanionMiniPanel()')).toBe(false);

    await setVar(page, 'hauntedHouse', 'elm');
    expect(await callSetup(page, 'setup.Companion.canShowCompanionMiniPanel()')).toBe(true);

    await setHuntMode(page, 0);
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
    expect(await getVar(page, 'alice.paidForSolo')).toBe(1);
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
    await setupHunt(page, 'Shade');
    await goToPassage(page, 'WalkHomeTogether');
    await expectCleanPassage(page);
  });

  test('WalkHomeTogether routes to GhostSpecialEventSpirit for a Spirit ghost', async () => {
    await selectCompanion(page, 'Alice');
    await setupHunt(page, 'Spirit');
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
      // CompanionRandomRoom reads $hauntedHouse to pick a room list.
      await setVar(page, 'hauntedHouse', 'owaissa');
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
