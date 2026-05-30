const { test, expect } = require('../fixtures');
const { setVar, getVar, callSetup, goToPassage } = require('../helpers');
const { expectCleanPassage } = require('./e2e-helpers');

test.describe('Witch — cursed-item quest lifecycle', () => {
  test('quest progresses offer → active → turn-in → reward', async ({ game: page }) => {
    await page.evaluate(() => { delete SugarCube.State.variables.gotCursedItem; });
    await setVar(page, 'mc.lvl', 3);

    expect(await callSetup(page, 'setup.Witch.canOfferCursedItemQuest()')).toBe(true);
    expect(await callSetup(page, 'setup.Witch.cursedItemQuestActive()')).toBe(false);
    expect(await callSetup(page, 'setup.Witch.hasCursedItemToTurnIn()')).toBe(false);

    await page.evaluate(() => SugarCube.setup.Witch.startCursedItemQuest());
    expect(await getVar(page, 'gotCursedItem')).toBe(0);
    expect(await callSetup(page, 'setup.Witch.cursedItemQuestActive()')).toBe(true);
    expect(await callSetup(page, 'setup.Witch.canOfferCursedItemQuest()')).toBe(false);

    await setVar(page, 'gotCursedItem', 1);
    expect(await callSetup(page, 'setup.Witch.hasCursedItemToTurnIn()')).toBe(true);

    await setVar(page, 'mc.money', 50);
    await setVar(page, 'isCIDildo', true);
    await setVar(page, 'isCIButtplug', false);
    await setVar(page, 'isCIBeads', false);
    await setVar(page, 'isCIHDildo', true);
    await page.evaluate(() => SugarCube.setup.Witch.collectCursedItemReward());

    expect(await getVar(page, 'mc.money')).toBe(80);
    expect(await getVar(page, 'gotCursedItem')).toBe(0);
    expect(await getVar(page, 'isCIDildo')).toBe(false);
    expect(await getVar(page, 'isCIHDildo')).toBe(false);
  });

  test('shouldAwardGwb3OnTurnIn fires upgradeGwbToLvl3', async ({ game: page }) => {
    await setVar(page, 'equipment', { gwb: 1 });
    expect(await callSetup(page, 'setup.Witch.shouldAwardGwb3OnTurnIn()')).toBe(true);
    await page.evaluate(() => SugarCube.setup.Witch.upgradeGwbToLvl3());
    expect(await callSetup(page, 'setup.Witch.ownsLevel3Gwb()')).toBe(true);
    expect(await callSetup(page, 'setup.Witch.shouldAwardGwb3OnTurnIn()')).toBe(false);
  });

  /* Legacy-save recovery: before the cursed-item loot gate landed
     (commit e2ebd835) a player could find a cursed item while still at
     lvl 1, never having heard about the quest. The witch must accept
     the turn-in regardless of level so they aren't stuck holding it. */
  test('witch turn-in is reachable at lvl 1 with a stranded cursed item', async ({ game: page }) => {
    await setVar(page, 'mc.lvl', 1);
    await setVar(page, 'mc.money', 0);
    await setVar(page, 'hours', 12);
    await setVar(page, 'firstVisitWitchShop', false);
    await setVar(page, 'gotCursedItem', 1);
    await setVar(page, 'isCIDildo', true);
    await page.evaluate(() => {
      SugarCube.State.variables.huntMode = 0;
      SugarCube.State.variables.run = null;
    });

    await goToPassage(page, 'WitchInside');
    await expectCleanPassage(page);

    const turnInVisible = await page.evaluate(() => {
      return document.querySelector('.passage').textContent.includes('I found the cursed object');
    });
    expect(turnInVisible).toBe(true);
  });

  /* Using a cursed item via UseCursedItem must clear the held flags so
     the player isn't left with phantom carry state -- otherwise Brook
     refuses to fetch another and the witch can't accept a turn-in that
     no longer exists. */
  test('UseCursedItem consumes the held item', async ({ game: page }) => {
    await setVar(page, 'gotCursedItem', 1);
    await setVar(page, 'isCIDildo', true);
    await setVar(page, 'isCIButtplug', false);
    await setVar(page, 'isCIBeads', false);
    await setVar(page, 'isCIHDildo', false);

    await goToPassage(page, 'UseCursedItem');

    expect(await callSetup(page, 'setup.Witch.hasCursedItemToTurnIn()')).toBe(false);
    expect(await getVar(page, 'gotCursedItem')).toBe(0);
    expect(await getVar(page, 'isCIDildo')).toBe(false);
  });
});

test.describe('Witch — exorcism and rescue referrals', () => {
  test('exorcismQuestNotStarted is true when stage is 0 or undefined', async ({ game: page }) => {
    await page.evaluate(() => { delete SugarCube.State.variables.exorcismQuestStage; });
    expect(await callSetup(page, 'setup.Witch.exorcismQuestNotStarted()')).toBe(true);
    await setVar(page, 'exorcismQuestStage', 0);
    expect(await callSetup(page, 'setup.Witch.exorcismQuestNotStarted()')).toBe(true);
    await setVar(page, 'exorcismQuestStage', 1);
    expect(await callSetup(page, 'setup.Witch.exorcismQuestNotStarted()')).toBe(false);
  });

  test('resetExorcismQuestStage sets stage back to 0', async ({ game: page }) => {
    await setVar(page, 'exorcismQuestStage', 5);
    await page.evaluate(() => SugarCube.setup.Witch.resetExorcismQuestStage());
    expect(await getVar(page, 'exorcismQuestStage')).toBe(0);
  });

  test('hasSuccubusEncounter reads $succubus', async ({ game: page }) => {
    await page.evaluate(() => { delete SugarCube.State.variables.succubus; });
    expect(await callSetup(page, 'setup.Witch.hasSuccubusEncounter()')).toBe(false);
    await setVar(page, 'succubus', 1);
    expect(await callSetup(page, 'setup.Witch.hasSuccubusEncounter()')).toBe(true);
  });

  test('clearQuestForRescue sets $hasQuestForRescue to 0', async ({ game: page }) => {
    await setVar(page, 'hasQuestForRescue', 3);
    await page.evaluate(() => SugarCube.setup.MissingWomen.resetQuestToAvailable());
    expect(await getVar(page, 'hasQuestForRescue')).toBe(0);
  });
});

test.describe('Witch — level 3 tools referral', () => {
  test('restartToolEvent clears eventToolsOneStart', async ({ game: page }) => {
    await setVar(page, 'eventToolsOneStart', 1);
    await page.evaluate(() => SugarCube.setup.Witch.restartToolEvent());
    expect(await getVar(page, 'eventToolsOneStart')).toBe(0);
    expect(await callSetup(page, 'setup.Witch.canAskAboutLevel3Tools()')).toBe(true);
  });

  test('markWardenOutfitHintOpened sets wardenClothesStage to 1', async ({ game: page }) => {
    await setVar(page, 'wardenClothesStage', 0);
    await page.evaluate(() => SugarCube.setup.Witch.markWardenOutfitHintOpened());
    expect(await getVar(page, 'wardenClothesStage')).toBe(1);
    expect(await callSetup(page, 'setup.Witch.canAskAboutIronclad()')).toBe(true);
  });
});

test.describe('Witch — weaken ghost quest', () => {
  test('markWeakenQuestStarted sets weakenTheGhostQuest to 1', async ({ game: page }) => {
    await page.evaluate(() => { delete SugarCube.State.variables.weakenTheGhostQuest; });
    expect(await callSetup(page, 'setup.Witch.hasWeakenTheGhostQuest()')).toBe(false);
    await page.evaluate(() => SugarCube.setup.Witch.markWeakenQuestStarted());
    expect(await getVar(page, 'weakenTheGhostQuest')).toBe(1);
    expect(await callSetup(page, 'setup.Witch.hasWeakenTheGhostQuest()')).toBe(true);
  });

  test('markGhostWeakened reflects in isGhostWeakened', async ({ game: page }) => {
    await setVar(page, 'isWeakenGhost', false);
    expect(await callSetup(page, 'setup.Witch.isGhostWeakened()')).toBe(false);
    await page.evaluate(() => SugarCube.setup.Witch.markGhostWeakened());
    expect(await getVar(page, 'isWeakenGhost')).toBe(true);
    expect(await callSetup(page, 'setup.Witch.isGhostWeakened()')).toBe(true);
  });

});

test.describe('Witch — ectoplasm-unlock quest flow', () => {
  const passageText = (page) =>
    page.evaluate(() => document.querySelector('.passage').textContent);

  test('briefing shows the running tally while under the bar', async ({ game: page }) => {
    await setVar(page, 'mc.lvl', 5);
    await page.evaluate(() => SugarCube.setup.Witch.offerEctoplasmQuest());
    await page.evaluate(() => SugarCube.setup.Witch.recordWeakenReward(30));

    await goToPassage(page, 'WitchEctoplasmQuest');
    await expectCleanPassage(page);
    const text = await passageText(page);
    /* "1 / 3" tally and the briefing prose, not the completion branch.
       Anchor on the durable mechanic line rather than easily-reworded
       dialogue. */
    expect(text).toContain('1 / 3');
    expect(text).toContain('Wring each one dry');
    expect(text).not.toContain('Show me, then');
  });

  test('completion branch (earned the normal way) offers the lesson', async ({ game: page }) => {
    await setVar(page, 'mc.lvl', 5);
    await page.evaluate(() => SugarCube.setup.Witch.offerEctoplasmQuest());
    await page.evaluate(() => {
      SugarCube.setup.Witch.recordWeakenReward(30);
      SugarCube.setup.Witch.recordWeakenReward(30);
      SugarCube.setup.Witch.recordWeakenReward(30);
    });

    expect(await callSetup(page, 'setup.Witch.isEctoplasmQuestPrequalified()')).toBe(false);
    await goToPassage(page, 'WitchEctoplasmQuest');
    await expectCleanPassage(page);
    const text = await passageText(page);
    expect(text).toContain('walked back in the same person');
    expect(text).toContain('Show me, then');
  });

  test('completion branch (prequalified) acknowledges the early work', async ({ game: page }) => {
    await setVar(page, 'mc.lvl', 5);
    await page.evaluate(() => {
      SugarCube.setup.Witch.recordWeakenReward(30);
      SugarCube.setup.Witch.recordWeakenReward(30);
      SugarCube.setup.Witch.recordWeakenReward(30);
    });
    await page.evaluate(() => SugarCube.setup.Witch.offerEctoplasmQuest());

    expect(await callSetup(page, 'setup.Witch.isEctoplasmQuestPrequalified()')).toBe(true);
    await goToPassage(page, 'WitchEctoplasmQuest');
    await expectCleanPassage(page);
    const text = await passageText(page);
    expect(text).toContain('before you opened your mouth');
    expect(text).toContain('Show me, then');
  });

  test('the banishing lesson shows one video on load and gates the exit behind every reveal', async ({ game: page }) => {
    await goToPassage(page, 'WitchBanishLesson');
    await expectCleanPassage(page);

    const videoCount = () => page.locator('.passage video').count();
    const clickReveal = (hasText) =>
      page.locator('.passage a.macro-linkreplace').filter({ hasText }).first().click();

    /* "One video at a time": exactly one clip is in the DOM on load and the
       exit link is buried in the innermost reveal, so it must be absent. */
    expect(await videoCount()).toBe(1);
    expect(await passageText(page)).not.toContain('Leave, soaked through');

    /* Walk the five nested reveals in order by their diegetic anchor text.
       Each click reveals exactly one more clip, never stacking videos. */
    const reveals = [
      "can't even find it",
      "You're staring",
      'Where does that come in',
      "already in my mouth",
      "not finished showing me",
    ];
    for (let i = 0; i < reveals.length; i++) {
      await clickReveal(reveals[i]);
      expect(await videoCount()).toBe(i + 2);
      /* The exit appears only after the final reveal. */
      const seen = await passageText(page);
      if (i < reveals.length - 1) {
        expect(seen).not.toContain('Leave, soaked through');
      }
    }
    expect(await videoCount()).toBe(6);
    expect(await passageText(page)).toContain('Leave, soaked through');

    /* Following the exit (gated on finishing the lesson) opens the economy. */
    expect(await callSetup(page, 'setup.Witch.ectoplasmUnlocked()')).toBe(false);
    await page.locator('.passage a').filter({ hasText: 'Leave, soaked through' }).first().click();
    expect(await callSetup(page, 'setup.Witch.ectoplasmQuestComplete()')).toBe(true);
    expect(await callSetup(page, 'setup.Witch.ectoplasmUnlocked()')).toBe(true);
  });

  test('WitchEctoplasmQuestDone fires completeEctoplasmQuest and opens the economy', async ({ game: page }) => {
    expect(await callSetup(page, 'setup.Witch.ectoplasmUnlocked()')).toBe(false);
    await goToPassage(page, 'WitchEctoplasmQuestDone');
    await expectCleanPassage(page);
    expect(await callSetup(page, 'setup.Witch.ectoplasmQuestComplete()')).toBe(true);
    expect(await callSetup(page, 'setup.Witch.ectoplasmUnlocked()')).toBe(true);
  });
});

test.describe('Witch — tool upgrades and crucifix', () => {
  test('TOOL_UPGRADE_PRICES lists a price for each tool', async ({ game: page }) => {
    const prices = await page.evaluate(() => SugarCube.setup.Witch.TOOL_UPGRADE_PRICES);
    expect(prices.emf).toBe(200);
    expect(prices.temperature).toBe(100);
    expect(prices.spiritbox).toBe(500);
    expect(prices.gwb).toBe(400);
    expect(prices.glass).toBe(300);
    expect(prices.uvl).toBe(400);
  });

  test('upgradeTool raises tool to 4 and deducts money', async ({ game: page }) => {
    await setVar(page, 'mc.money', 500);
    await setVar(page, 'equipment', { emf: 2, temperature: 1, spiritbox: 1, gwb: 1, glass: 1, uvl: 1 });
    await page.evaluate(() => SugarCube.setup.Witch.upgradeTool('emf'));
    expect(await callSetup(page, 'setup.Witch.toolLevel("emf")')).toBe(4);
    expect(await getVar(page, 'mc.money')).toBe(300);
  });

  test('buyDetector sets boughtDetector and deducts $200', async ({ game: page }) => {
    await setVar(page, 'mc.money', 300);
    await page.evaluate(() => { delete SugarCube.State.variables.boughtDetector; });
    expect(await callSetup(page, 'setup.Witch.detectorBought()')).toBe(false);
    await page.evaluate(() => SugarCube.setup.Witch.buyDetector());
    expect(await getVar(page, 'mc.money')).toBe(100);
    expect(await callSetup(page, 'setup.Witch.detectorBought()')).toBe(true);
  });

  test('initCrucifixIfNeeded only sets 0 when undefined', async ({ game: page }) => {
    await page.evaluate(() => { delete SugarCube.State.variables.crucifixAmount; });
    await page.evaluate(() => SugarCube.setup.ToolController.initCrucifixIfNeeded());
    expect(await callSetup(page, 'setup.ToolController.crucifixAmount()')).toBe(0);

    await setVar(page, 'crucifixAmount', 3);
    await page.evaluate(() => SugarCube.setup.ToolController.initCrucifixIfNeeded());
    expect(await callSetup(page, 'setup.ToolController.crucifixAmount()')).toBe(3);
  });

  test('addCrucifix increments crucifixAmount', async ({ game: page }) => {
    await setVar(page, 'crucifixAmount', 0);
    await page.evaluate(() => SugarCube.setup.ToolController.addCrucifix());
    await page.evaluate(() => SugarCube.setup.ToolController.addCrucifix());
    expect(await callSetup(page, 'setup.ToolController.crucifixAmount()')).toBe(2);
  });

  test('clearHiddenEvidence removes all hidden-evidence flags', async ({ game: page }) => {
    await setVar(page, 'hiddenEvidence', 1);
    await setVar(page, 'hiddenEvidence1', 1);
    await setVar(page, 'hiddenEvidence2', 1);
    await setVar(page, 'deleteSecondEvidence', true);
    await setVar(page, 'deleteThirdEvidence', true);
    await setVar(page, 'deleteOneEvidence', true);
    await page.evaluate(() => SugarCube.setup.Ghosts.clearHiddenEvidence());
    const V = await page.evaluate(() => ({
      a: SugarCube.State.variables.hiddenEvidence,
      b: SugarCube.State.variables.hiddenEvidence1,
      c: SugarCube.State.variables.hiddenEvidence2,
      d: SugarCube.State.variables.deleteSecondEvidence,
      e: SugarCube.State.variables.deleteThirdEvidence,
      f: SugarCube.State.variables.deleteOneEvidence,
    }));
    expect(V.a).toBeUndefined();
    expect(V.b).toBeUndefined();
    expect(V.c).toBeUndefined();
    expect(V.d).toBeUndefined();
    expect(V.e).toBeUndefined();
    expect(V.f).toBeUndefined();
  });
});

test.describe('Witch — night sneak-in gating', () => {
  test('witchLateNightHour is true only when hours <= 5', async ({ game: page }) => {
    await setVar(page, 'hours', 2);
    expect(await callSetup(page, 'setup.Witch.witchLateNightHour()')).toBe(true);
    await setVar(page, 'hours', 5);
    expect(await callSetup(page, 'setup.Witch.witchLateNightHour()')).toBe(true);
    await setVar(page, 'hours', 6);
    expect(await callSetup(page, 'setup.Witch.witchLateNightHour()')).toBe(false);
  });

  test('startWitchNightCooldown and canVisitWitchBedroomNight', async ({ game: page }) => {
    await page.evaluate(() => { delete SugarCube.State.variables.witchNight; });
    expect(await callSetup(page, 'setup.Witch.canVisitWitchBedroomNight()')).toBe(true);
    await page.evaluate(() => SugarCube.setup.Witch.startWitchNightCooldown());
    expect(await getVar(page, 'witchNight')).toBe(1);
    expect(await callSetup(page, 'setup.Witch.canVisitWitchBedroomNight()')).toBe(false);
  });

  test('startStealItemsCooldown gates canStealItemsFromWitch', async ({ game: page }) => {
    await page.evaluate(() => { delete SugarCube.State.variables.stealItemsFromWitch; });
    expect(await callSetup(page, 'setup.Witch.canStealItemsFromWitch()')).toBe(true);
    await page.evaluate(() => SugarCube.setup.Witch.startStealItemsCooldown());
    expect(await getVar(page, 'stealItemsFromWitch')).toBe(1);
    expect(await callSetup(page, 'setup.Witch.canStealItemsFromWitch()')).toBe(false);
  });

  test('markKeyFromWitchStolen sets $gotKeyFromWitch and unlocks sneak-in', async ({ game: page }) => {
    await page.evaluate(() => { delete SugarCube.State.variables.gotKeyFromWitch; });
    await setVar(page, 'hours', 2);
    expect(await callSetup(page, 'setup.Witch.canSneakInAtNight()')).toBe(false);
    await page.evaluate(() => SugarCube.setup.Witch.markKeyFromWitchStolen());
    expect(await callSetup(page, 'setup.Witch.hasStolenKey()')).toBe(true);
    expect(await callSetup(page, 'setup.Witch.canSneakInAtNight()')).toBe(true);
  });
});

test.describe('Witch — passage rendering with mixed state', () => {
  test('Witch entrance renders at 10:00 (just-open edge)', async ({ game: page }) => {
    await setVar(page, 'hours', 10);
    await goToPassage(page, 'Witch');
    await expectCleanPassage(page);
  });

  test('Witch entrance renders at 23:59 (closing edge)', async ({ game: page }) => {
    await setVar(page, 'hours', 23);
    await setVar(page, 'minutes', 59);
    await goToPassage(page, 'Witch');
    await expectCleanPassage(page);
  });

  test('WitchInside renders without error when no hunt is active', async ({ game: page }) => {
    await setVar(page, 'hours', 12);
    await setVar(page, 'firstVisitWitchShop', false);
    await page.evaluate(() => {
      SugarCube.State.variables.huntMode = 0;
      SugarCube.State.variables.run = null;
    });
    await goToPassage(page, 'WitchInside');
    await expectCleanPassage(page);
  });
});
