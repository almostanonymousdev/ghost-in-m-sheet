const { test, expect } = require('@playwright/test');
const { openGame, resetGame, setVar, getVar, callSetup, goToPassage } = require('../helpers');
const { expectCleanPassage } = require('./e2e-helpers');

const EVENT_PASSAGES = [
  'GhostSpecialEventMare',
  'GhostSpecialEventMare0',
  'GhostSpecialEvent1Mare',
  'GhostSpecialEventMareEnd',
  'GhostSpecialEventMyling',
  'GhostSpecialEventMylingTwo',
  'GhostSpecialEventNapSpirit',
  'GhostSpecialEventNapSpirit1',
  'GhostSpecialEventSleepSpirit',
  'GhostSpecialEventSleepSpirit1',
  'GhostSpecialEventSleepSpirit2',
  'GhostSpecialEventTVSpirit',
  'GhostSpecialEventTVSpirit1',
  'GhostSpecialEventWraith',
  'GhostSpecialEventWraithStart',
  'GhostSpecialEventWraithEnd',
  'GhostSpecialEventSpirit',
];

test.describe('Special ghost events — controller', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  test('knowsAboutMare tracks Mare discovery', async () => {
    await page.evaluate(() => { SugarCube.setup.Ghosts.getByName('Mare').isInfoCollected = false; });
    expect(await callSetup(page, 'setup.SpecialEvent.knowsAboutMare()')).toBe(false);
    await page.evaluate(() => SugarCube.setup.Ghosts.markDiscovered('Mare'));
    expect(await callSetup(page, 'setup.SpecialEvent.knowsAboutMare()')).toBe(true);
  });

  test('hasMinCorruptionForTVSpirit requires mc.corruption >= 3', async () => {
    await setVar(page, 'mc.corruption', 2);
    expect(await callSetup(page, 'setup.SpecialEvent.hasMinCorruptionForTVSpirit()')).toBe(false);
    await setVar(page, 'mc.corruption', 3);
    expect(await callSetup(page, 'setup.SpecialEvent.hasMinCorruptionForTVSpirit()')).toBe(true);
  });

  test('hasMinCorruptionForSleepSpirit requires mc.corruption >= 5', async () => {
    await setVar(page, 'mc.corruption', 4);
    expect(await callSetup(page, 'setup.SpecialEvent.hasMinCorruptionForSleepSpirit()')).toBe(false);
    await setVar(page, 'mc.corruption', 5);
    expect(await callSetup(page, 'setup.SpecialEvent.hasMinCorruptionForSleepSpirit()')).toBe(true);
  });

  test('hasEnergyForSleepSpirit requires mc.energy >= 5', async () => {
    await setVar(page, 'mc.energy', 4);
    expect(await callSetup(page, 'setup.SpecialEvent.hasEnergyForSleepSpirit()')).toBe(false);
    await setVar(page, 'mc.energy', 5);
    expect(await callSetup(page, 'setup.SpecialEvent.hasEnergyForSleepSpirit()')).toBe(true);
  });

  test('markSpiritEventSeen sets stage and cooldown', async () => {
    await setVar(page, 'ghostSpiritEventStage', 0);
    await setVar(page, 'ghostSpecialEventSpiritCD', 0);
    await page.evaluate(() => SugarCube.setup.SpecialEvent.markSpiritEventSeen());
    expect(await getVar(page, 'ghostSpiritEventStage')).toBe(1);
    expect(await getVar(page, 'ghostSpecialEventSpiritCD')).toBe(1);
  });

  test('clearMareEvent zeroes mare progression', async () => {
    await setVar(page, 'ghostMareEventStart', 4);
    await setVar(page, 'ghostMareEventStage', 2);
    await page.evaluate(() => SugarCube.setup.SpecialEvent.clearMareEvent());
    expect(await getVar(page, 'ghostMareEventStart')).toBe(0);
    expect(await getVar(page, 'ghostMareEventStage')).toBe(0);
  });

  test('companionIs and hasCompanion read $companion.name', async () => {
    await setVar(page, 'companion', {});
    expect(await callSetup(page, 'setup.SpecialEvent.hasCompanion()')).toBe(false);
    expect(await callSetup(page, 'setup.SpecialEvent.companionIs("Alice")')).toBe(false);
    await setVar(page, 'companion', { name: 'Alice' });
    expect(await callSetup(page, 'setup.SpecialEvent.hasCompanion()')).toBe(true);
    expect(await callSetup(page, 'setup.SpecialEvent.companionIs("Alice")')).toBe(true);
    expect(await callSetup(page, 'setup.SpecialEvent.companionIs("Blake")')).toBe(false);
  });

  test('canTryEscape requires mc.energy >= 1', async () => {
    await setVar(page, 'mc.energy', 0);
    expect(await callSetup(page, 'setup.SpecialEvent.canTryEscape()')).toBe(false);
    await setVar(page, 'mc.energy', 1);
    expect(await callSetup(page, 'setup.SpecialEvent.canTryEscape()')).toBe(true);
  });

  test('rollEscapeSuccess always succeeds when random is forced low', async () => {
    await setVar(page, 'mc.energy', 1);
    await page.evaluate(() => { window._origRandom = Math.random; Math.random = () => 0; });
    try {
      // chance = floor(0 * 100) + 1 = 1, energy * 5 = 5, 1 <= 5 -> true
      expect(await callSetup(page, 'setup.SpecialEvent.rollEscapeSuccess()')).toBe(true);
    } finally {
      await page.evaluate(() => { Math.random = window._origRandom; });
    }
  });

  test('rollEscapeSuccess always fails when random is forced high', async () => {
    await setVar(page, 'mc.energy', 1);
    await page.evaluate(() => { window._origRandom = Math.random; Math.random = () => 0.99; });
    try {
      // chance = floor(0.99 * 100) + 1 = 100, energy * 5 = 5, 100 <= 5 -> false
      expect(await callSetup(page, 'setup.SpecialEvent.rollEscapeSuccess()')).toBe(false);
    } finally {
      await page.evaluate(() => { Math.random = window._origRandom; });
    }
  });

  test('spendEscapeEnergy zeroes mc.energy', async () => {
    await setVar(page, 'mc.energy', 5);
    await page.evaluate(() => SugarCube.setup.SpecialEvent.spendEscapeEnergy());
    expect(await getVar(page, 'mc.energy')).toBe(0);
  });

  test('resetHuntPlansAfterMyling clears plan/companion state', async () => {
    await setVar(page, 'chosenPlan', 'Plan2');
    await setVar(page, 'chosenPlanActivated', 1);
    await setVar(page, 'randomGhostPassage', 1);
    await setVar(page, 'isCompRoomChosen', 1);
    await setVar(page, 'showComp', 1);
    await setVar(page, 'isCompChosen', 1);
    await setVar(page, 'companion', { name: 'Alice' });
    await setVar(page, 'alice.goingSolo', 0);
    await setVar(page, 'aliceWorkDone', 1);
    await page.evaluate(() => SugarCube.setup.SpecialEvent.resetHuntPlansAfterMyling());
    expect(await getVar(page, 'chosenPlan')).toBe(0);
    expect(await getVar(page, 'isCompChosen')).toBe(0);
    expect(await getVar(page, 'aliceWorkDone')).toBe(0);
  });

  test('resetHuntPlansAfterMyling leaves aliceWorkDone untouched when Alice is hunting alone', async () => {
    await setVar(page, 'companion', { name: 'Alice' });
    await setVar(page, 'alice.goingSolo', 1);
    await setVar(page, 'aliceWorkDone', 1);
    await page.evaluate(() => SugarCube.setup.SpecialEvent.resetHuntPlansAfterMyling());
    expect(await getVar(page, 'aliceWorkDone')).toBe(1);
  });
});

test.describe('Special ghost events — passage rendering', () => {
  test.describe.configure({ timeout: 10_000, retries: 1 });

  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  for (const passage of EVENT_PASSAGES) {
    test(`${passage} renders cleanly at default state`, async () => {
      await goToPassage(page, passage);
      await expectCleanPassage(page);
    });
  }

  test('Mare event narration changes once info is collected', async () => {
    await page.evaluate(() => { SugarCube.setup.Ghosts.getByName('Mare').isInfoCollected = false; });
    await goToPassage(page, 'GhostSpecialEventMare');
    let text = await page.locator('#passages').innerText();
    expect(text).toContain('touching myself in my sleep');

    await page.evaluate(() => SugarCube.setup.Ghosts.markDiscovered('Mare'));
    await goToPassage(page, 'GhostSpecialEventMare');
    text = await page.locator('#passages').innerText();
    expect(text).toContain('happening again');
  });

  test('Wraith event shows energy escape UI when mc.energy > 0', async () => {
    await setVar(page, 'mc.energy', 4);
    await goToPassage(page, 'GhostSpecialEventWraith');
    await expectCleanPassage(page);
    const text = await page.locator('#passages').innerText();
    expect(text).toContain('escape');
  });
});

test.describe('Special ghost events — home summoning variants', () => {
  test.describe.configure({ timeout: 10_000, retries: 1 });

  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  for (const passage of [
    'SuccubusEventTV',
    'SuccubusPCEvent',
    'TentaclesEventSleep',
    'TentaclesEventSleep1',
    'TentaclesEventTV',
    'TentaclesEventTV1',
    'TentaclesEventNap',
    'TentaclesEventPC',
    'TentaclesEventPC1',
  ]) {
    test(`${passage} renders cleanly`, async () => {
      await goToPassage(page, passage);
      await expectCleanPassage(page);
    });
  }
});
