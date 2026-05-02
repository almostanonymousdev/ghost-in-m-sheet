const { test, expect } = require('@playwright/test');
const { openGame, resetGame, setVar, getVar, callSetup, goToPassage } = require('../helpers');
const { expectCleanPassage, setupHunt } = require('./e2e-helpers');

test.describe('Special events — Mare progression state machine', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  test('mareStage and mareStageAtLeast read $ghostMareEventStage', async () => {
    await setVar(page, 'ghostMareEventStage', 0);
    expect(await callSetup(page, 'setup.SpecialEvent.mareStage()')).toBe(0);
    expect(await callSetup(page, 'setup.SpecialEvent.mareStageAtLeast(1)')).toBe(false);

    await setVar(page, 'ghostMareEventStage', 3);
    expect(await callSetup(page, 'setup.SpecialEvent.mareStage()')).toBe(3);
    expect(await callSetup(page, 'setup.SpecialEvent.mareStageAtLeast(2)')).toBe(true);
    expect(await callSetup(page, 'setup.SpecialEvent.mareStageAtLeast(3)')).toBe(true);
    expect(await callSetup(page, 'setup.SpecialEvent.mareStageAtLeast(4)')).toBe(false);
  });

  test('mareStageAtLeast handles undefined stage as 0', async () => {
    await page.evaluate(() => { delete SugarCube.State.variables.ghostMareEventStage; });
    expect(await callSetup(page, 'setup.SpecialEvent.mareStageAtLeast(0)')).toBe(true);
    expect(await callSetup(page, 'setup.SpecialEvent.mareStageAtLeast(1)')).toBe(false);
  });

  test('Home.mareEventActive checks $ghostMareEventStart', async () => {
    await setVar(page, 'ghostMareEventStart', 0);
    expect(await callSetup(page, 'setup.SpecialEvent.mareEventActive()')).toBe(false);
    await setVar(page, 'ghostMareEventStart', 1);
    expect(await callSetup(page, 'setup.SpecialEvent.mareEventActive()')).toBe(true);
    await setVar(page, 'ghostMareEventStart', 4);
    expect(await callSetup(page, 'setup.SpecialEvent.mareEventActive()')).toBe(true);
  });

  test('useHolyWaterOnMare clears mare and consumes water', async () => {
    await setVar(page, 'ghostMareEventStart', 4);
    await setVar(page, 'ghostMareEventStage', 3);
    await setVar(page, 'holyWaterIsCollected', 1);
    expect(await callSetup(page, 'setup.Home.canUseHolyWaterOnMare()')).toBe(true);
    await page.evaluate(() => SugarCube.setup.Home.useHolyWaterOnMare());
    expect(await getVar(page, 'ghostMareEventStart')).toBe(0);
    expect(await getVar(page, 'ghostMareEventStage')).toBe(0);
    expect(await getVar(page, 'holyWaterIsCollected')).toBe(0);
    expect(await callSetup(page, 'setup.Home.canUseHolyWaterOnMare()')).toBe(false);
  });

  test('canUseHolyWaterOnMare requires both flags', async () => {
    await setVar(page, 'ghostMareEventStart', 0);
    await setVar(page, 'holyWaterIsCollected', 1);
    expect(await callSetup(page, 'setup.Home.canUseHolyWaterOnMare()')).toBe(false);
    await setVar(page, 'ghostMareEventStart', 2);
    await setVar(page, 'holyWaterIsCollected', 0);
    expect(await callSetup(page, 'setup.Home.canUseHolyWaterOnMare()')).toBe(false);
  });

  test('mareStageIsLow is true when stage <= 2', async () => {
    await setVar(page, 'ghostMareEventStage', 2);
    expect(await callSetup(page, 'setup.Home.mareStageIsLow()')).toBe(true);
    await setVar(page, 'ghostMareEventStage', 3);
    expect(await callSetup(page, 'setup.Home.mareStageIsLow()')).toBe(false);
  });

  test('clearMareEvent zeroes both progression vars', async () => {
    await setVar(page, 'ghostMareEventStart', 4);
    await setVar(page, 'ghostMareEventStage', 3);
    await page.evaluate(() => SugarCube.setup.SpecialEvent.clearMareEvent());
    expect(await getVar(page, 'ghostMareEventStart')).toBe(0);
    expect(await getVar(page, 'ghostMareEventStage')).toBe(0);
  });
});

test.describe('Special events — Mare passages render across stages', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  test('GhostSpecialEventMare0 (initial discovery) renders cleanly', async () => {
    await setVar(page, 'ghostMareEventStart', 1);
    await setVar(page, 'ghostMareEventStage', 0);
    await goToPassage(page, 'GhostSpecialEventMare0');
    await expectCleanPassage(page);
  });

  test('GhostSpecialEvent1Mare (mid-progression) renders cleanly', async () => {
    await setVar(page, 'ghostMareEventStart', 2);
    await setVar(page, 'ghostMareEventStage', 1);
    await goToPassage(page, 'GhostSpecialEvent1Mare');
    await expectCleanPassage(page);
  });

  test('GhostSpecialEventMareEnd renders cleanly at the climax', async () => {
    await setVar(page, 'ghostMareEventStart', 4);
    await setVar(page, 'ghostMareEventStage', 3);
    await goToPassage(page, 'GhostSpecialEventMareEnd');
    await expectCleanPassage(page);
  });
});

test.describe('Special events — Wraith escape outcomes', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  test('rollEscapeSuccess at energy=1 succeeds for low rolls only', async () => {
    await setVar(page, 'mc.energy', 1);
    // chance = floor(0*100)+1 = 1, energy*5 = 5; 1 <= 5 → true
    await page.evaluate(() => { window._origRandom = Math.random; Math.random = () => 0; });
    try {
      expect(await callSetup(page, 'setup.SpecialEvent.rollEscapeSuccess()')).toBe(true);
    } finally {
      await page.evaluate(() => { Math.random = window._origRandom; });
    }
    // chance = floor(0.05*100)+1 = 6, energy*5 = 5; 6 > 5 → false
    await page.evaluate(() => { window._origRandom = Math.random; Math.random = () => 0.05; });
    try {
      expect(await callSetup(page, 'setup.SpecialEvent.rollEscapeSuccess()')).toBe(false);
    } finally {
      await page.evaluate(() => { Math.random = window._origRandom; });
    }
  });

  test('rollEscapeSuccess at energy=20 always succeeds (chance 100)', async () => {
    await setVar(page, 'mc.energy', 20);
    for (const r of [0, 0.5, 0.99]) {
      await page.evaluate((rr) => { window._origRandom = Math.random; Math.random = () => rr; }, r);
      try {
        expect(await callSetup(page, 'setup.SpecialEvent.rollEscapeSuccess()')).toBe(true);
      } finally {
        await page.evaluate(() => { Math.random = window._origRandom; });
      }
    }
  });

  test('Wraith passage hides escape UI when out of energy', async () => {
    await setVar(page, 'mc.energy', 0);
    await goToPassage(page, 'GhostSpecialEventWraith');
    await expectCleanPassage(page);
    const text = await page.locator('#passages').innerText();
    expect(text).toContain('faint sound of footsteps');
  });

  test('GhostSpecialEventWraithStart and End render cleanly', async () => {
    await goToPassage(page, 'GhostSpecialEventWraithStart');
    await expectCleanPassage(page);
    await resetGame(page);
    await goToPassage(page, 'GhostSpecialEventWraithEnd');
    await expectCleanPassage(page);
  });
});

test.describe('Special events — Spirit corruption / energy gates', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  test('TVSpirit corruption gate flips at exactly 3', async () => {
    for (const c of [0, 1, 2]) {
      await setVar(page, 'mc.corruption', c);
      expect(await callSetup(page, 'setup.SpecialEvent.hasMinCorruptionForTVSpirit()')).toBe(false);
    }
    for (const c of [3, 5, 10]) {
      await setVar(page, 'mc.corruption', c);
      expect(await callSetup(page, 'setup.SpecialEvent.hasMinCorruptionForTVSpirit()')).toBe(true);
    }
  });

  test('SleepSpirit needs corruption >= 5 AND energy >= 5', async () => {
    await setVar(page, 'mc.corruption', 4);
    await setVar(page, 'mc.energy', 10);
    expect(await callSetup(page, 'setup.SpecialEvent.hasMinCorruptionForSleepSpirit()')).toBe(false);
    expect(await callSetup(page, 'setup.SpecialEvent.hasEnergyForSleepSpirit()')).toBe(true);

    await setVar(page, 'mc.corruption', 5);
    await setVar(page, 'mc.energy', 4);
    expect(await callSetup(page, 'setup.SpecialEvent.hasMinCorruptionForSleepSpirit()')).toBe(true);
    expect(await callSetup(page, 'setup.SpecialEvent.hasEnergyForSleepSpirit()')).toBe(false);
  });

  test('markSpiritEventStage and startSpiritEventCooldown are independent', async () => {
    await setVar(page, 'ghostSpiritEventStage', 0);
    await setVar(page, 'ghostSpecialEventSpirit', 0);
    await page.evaluate(() => SugarCube.setup.SpecialEvent.markSpiritEventStage());
    expect(await getVar(page, 'ghostSpiritEventStage')).toBe(1);
    expect(await getVar(page, 'ghostSpecialEventSpirit')).toBe(0);

    await page.evaluate(() => SugarCube.setup.SpecialEvent.startSpiritEventCooldown());
    expect(await getVar(page, 'ghostSpecialEventSpirit')).toBe(1);
  });

  test('Spirit nap variants render with companion-specific branches', async () => {
    for (const comp of ['Alice', 'Brook', 'Blake']) {
      await resetGame(page);
      await setVar(page, 'companion', { name: comp, lust: 30, sanity: 80 });
      await setVar(page, 'isCompChosen', 1);
      await setVar(page, 'mc.corruption', 5);
      await setVar(page, 'mc.energy', 8);
      await goToPassage(page, 'GhostSpecialEventNapSpirit');
      await expectCleanPassage(page);
    }
  });
});

test.describe('Special events — Myling video record', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  test('recordMylingVideo stores the chosen video', async () => {
    await page.evaluate(() => SugarCube.setup.SpecialEvent.recordMylingVideo('ghosts/specials/myling-alice.mp4'));
    expect(await getVar(page, 'videoEventSpecialMyling')).toBe('ghosts/specials/myling-alice.mp4');
  });

  test('GhostSpecialEventMyling and Two render with each companion present', async () => {
    for (const comp of ['Alice', 'Blake', 'Brook']) {
      await resetGame(page);
      await setVar(page, 'companion', { name: comp });
      await setVar(page, 'isCompChosen', 1);
      await goToPassage(page, 'GhostSpecialEventMyling');
      await expectCleanPassage(page);
      await resetGame(page);
      await setVar(page, 'companion', { name: comp });
      await setVar(page, 'isCompChosen', 1);
      await goToPassage(page, 'GhostSpecialEventMylingTwo');
      await expectCleanPassage(page);
    }
  });
});

test.describe('Special events — Twins event mirror', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  test('twinsEventAvailable requires the flag set and CD off', async () => {
    await setVar(page, 'thetwinsevent', 0);
    await setVar(page, 'twinsEventConsumed', 0);
    expect(await callSetup(page, 'setup.Ghosts.twinsEventReady()')).toBe(false);

    await setVar(page, 'thetwinsevent', 1);
    await setVar(page, 'twinsEventConsumed', 0);
    expect(await callSetup(page, 'setup.Ghosts.twinsEventReady()')).toBe(true);

    await setVar(page, 'twinsEventConsumed', 1);
    expect(await callSetup(page, 'setup.Ghosts.twinsEventReady()')).toBe(false);
  });

  test('twinsEventTriggered compares beautyRoll <= mc.beauty', async () => {
    await setVar(page, 'mc.beauty', 50);
    expect(await callSetup(page, 'setup.Home.twinsEventTriggered(30)')).toBe(true);
    expect(await callSetup(page, 'setup.Home.twinsEventTriggered(50)')).toBe(true);
    expect(await callSetup(page, 'setup.Home.twinsEventTriggered(60)')).toBe(false);
  });

  test('consumeTwinsEvent flips flag and starts cooldown', async () => {
    await setVar(page, 'thetwinsevent', 1);
    await setVar(page, 'twinsEventConsumed', 0);
    await page.evaluate(() => SugarCube.setup.Ghosts.consumeTwinsEvent());
    expect(await getVar(page, 'thetwinsevent')).toBe(0);
    expect(await getVar(page, 'twinsEventConsumed')).toBe(1);
  });

  test('TheTwinsEvent passage renders cleanly', async () => {
    await goToPassage(page, 'TheTwinsEvent');
    await expectCleanPassage(page);
  });

  test('clearTwinsEvent zeroes the flag', async () => {
    await setVar(page, 'thetwinsevent', 1);
    await page.evaluate(() => SugarCube.setup.Ghosts.clearTwinsEvent());
    expect(await getVar(page, 'thetwinsevent')).toBe(0);
  });
});

test.describe('Special events — Spirit hunt-end hook', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  test('Spirit ghost has an onHuntEnd hook that resets the stage', async () => {
    await setupHunt(page, 'Spirit');
    await setVar(page, 'ghostSpiritEventStage', 1);
    await page.evaluate(() => SugarCube.setup.Ghosts.fireActiveHuntEnd());
    expect(await getVar(page, 'ghostSpiritEventStage')).toBe(0);
  });

  test('non-Spirit ghosts leave the spirit stage alone on hunt end', async () => {
    await setupHunt(page, 'Shade');
    await setVar(page, 'ghostSpiritEventStage', 1);
    await page.evaluate(() => SugarCube.setup.Ghosts.fireActiveHuntEnd());
    expect(await getVar(page, 'ghostSpiritEventStage')).toBe(1);
  });
});

test.describe('Special events — myling reset of hunt plan', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });
  test.beforeEach(async () => { await resetGame(page); });

  test('resets companion + plan flags in one call', async () => {
    await setVar(page, 'chosenPlan', 'Plan2');
    await setVar(page, 'chosenPlanActivated', 1);
    await setVar(page, 'randomGhostPassage', 5);
    await setVar(page, 'isCompRoomChosen', 1);
    await setVar(page, 'showComp', 1);
    await setVar(page, 'isCompChosen', 1);
    await setVar(page, 'companion', { name: 'Brook' });

    await page.evaluate(() => SugarCube.setup.SpecialEvent.resetHuntPlansAfterMyling());

    expect(await getVar(page, 'chosenPlan')).toBe(0);
    expect(await getVar(page, 'chosenPlanActivated')).toBe(0);
    expect(await getVar(page, 'randomGhostPassage')).toBe(0);
    expect(await getVar(page, 'isCompRoomChosen')).toBe(0);
    expect(await getVar(page, 'showComp')).toBe(0);
    expect(await getVar(page, 'isCompChosen')).toBe(0);
  });
});
