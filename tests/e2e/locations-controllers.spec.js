const { test, expect } = require('../fixtures');
const { setVar, getVar, callSetup, goToPassage } = require('../helpers');
const { expectCleanPassage } = require('./e2e-helpers');

test.describe('Gym — fitness gain mechanics', () => {
  test('applyFitnessGain raises fit and beauty proportionally', async ({ game: page }) => {
    await setVar(page, 'mc.fit', 0);
    await setVar(page, 'mc.beauty', 10);
    await setVar(page, 'mc.energyMax', 10);
    await setVar(page, 'mc.energyPoints', 0);

    const result = await page.evaluate(() => SugarCube.setup.Gym.applyFitnessGain(5));
    expect(result.fit).toBe(5);
    // beauty up by 1 (5/5=1)
    expect(result.beautyIncrease).toBe(1);
    expect(result.beauty).toBe(11);
  });

  test('applyFitnessGain caps fit at 100 and unlocks energy bonus', async ({ game: page }) => {
    await setVar(page, 'mc.fit', 95);
    await setVar(page, 'mc.beauty', 50);
    await setVar(page, 'mc.energyMax', 12);
    await setVar(page, 'mc.energyPoints', 9);

    const result = await page.evaluate(() => SugarCube.setup.Gym.applyFitnessGain(20));
    expect(result.fit).toBe(100);
    expect(result.reachedFitCap).toBe(true);
    expect(result.energyMax).toBe(20);
    expect(result.hitEnergyCap).toBe(true);
  });

  test('applyFitnessGain leaves stats clamped at 0', async ({ game: page }) => {
    await setVar(page, 'mc.fit', 5);
    await setVar(page, 'mc.beauty', 5);
    await setVar(page, 'mc.energyMax', 10);
    await setVar(page, 'mc.energyPoints', 0);

    const result = await page.evaluate(() => SugarCube.setup.Gym.applyFitnessGain(-100));
    expect(result.fit).toBe(0);
    expect(result.beauty).toBeGreaterThanOrEqual(0);
  });

  test('payForCoach and spendEnergyToTrain mutate $mc accordingly', async ({ game: page }) => {
    await setVar(page, 'mc.money', 100);
    await setVar(page, 'mc.energy', 10);
    await setVar(page, 'trainingCost', 15);

    await page.evaluate(() => SugarCube.setup.Gym.payForCoach());
    expect(await getVar(page, 'mc.money')).toBe(85);

    await page.evaluate(() => SugarCube.setup.Gym.spendEnergyToTrain());
    expect(await getVar(page, 'mc.energy')).toBe(5);
  });

  test('Emily relationship init / raise / cooldown', async ({ game: page }) => {
    await page.evaluate(() => { delete SugarCube.State.variables.relationEmily; });
    expect(await callSetup(page, 'setup.Gym.hasMetEmily()')).toBe(false);
    await page.evaluate(() => SugarCube.setup.Gym.greetEmilyFirstTime());
    expect(await callSetup(page, 'setup.Gym.hasMetEmily()')).toBe(true);
    expect(await callSetup(page, 'setup.Gym.emilyRelationshipStage()')).toBe(1);

    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => SugarCube.setup.Gym.raiseEmilyRelationship());
    }
    expect(await callSetup(page, 'setup.Gym.emilyRelationshipStage()')).toBe(6);

    await page.evaluate(() => SugarCube.setup.Gym.startEmilyCooldown());
    expect(await callSetup(page, 'setup.Gym.emilyOnCooldown()')).toBe(true);
  });

  test('raiseEmilyRelationship caps at 10', async ({ game: page }) => {
    await setVar(page, 'relationEmily', 10);
    const result = await page.evaluate(() => SugarCube.setup.Gym.raiseEmilyRelationship());
    expect(result).toBe(false);
    expect(await getVar(page, 'relationEmily')).toBe(10);
  });

  test('Trainer 1 tip / discount / cooldown lifecycle', async ({ game: page }) => {
    await page.evaluate(() => { delete SugarCube.State.variables.trainer1TipReceived; });
    expect(await callSetup(page, 'setup.Gym.trainer1Tipped()')).toBe(false);
    await page.evaluate(() => SugarCube.setup.Gym.markTrainer1Tipped());
    expect(await callSetup(page, 'setup.Gym.trainer1Tipped()')).toBe(true);

    expect(await callSetup(page, 'setup.Gym.trainer1Discounted()')).toBe(false);
    await page.evaluate(() => SugarCube.setup.Gym.applyTrainer1Discount());
    expect(await callSetup(page, 'setup.Gym.trainer1Discounted()')).toBe(true);

    await page.evaluate(() => SugarCube.setup.Gym.startTrainer1SexCooldown());
    expect(await callSetup(page, 'setup.Gym.trainer1OnCooldown()')).toBe(true);
  });
});

test.describe('Gym — passage rendering with progression state', () => {
  for (const passage of [
    'GymTrainerEvent1Start', 'GymTrainerEvent1Start1', 'GymTrainerEvent1Start2',
    'GymTrainerEvent2Start', 'GymTrainerEvent2Start2',
    'GymGroupEvent1Start', 'GymGroupEvent1Start2', 'GroupGymTraining',
    'GymTraining', 'GymTrainingTrainer', 'EmilyTalk',
  ]) {
    test(`${passage} renders cleanly`, async ({ game: page }) => {
      test.setTimeout(10_000);
      await setVar(page, 'hours', 10);
      await setVar(page, 'mc.fit', 30);
      await setVar(page, 'mc.beauty', 50);
      await setVar(page, 'mc.lust', 50);
      await setVar(page, 'mc.energy', 10);
      await setVar(page, 'mc.money', 200);
      await setVar(page, 'sportswear', 1);
      await setVar(page, 'trainingCost', 15);
      await setVar(page, 'trainer1TipReceived', 1);
      await setVar(page, 'relationEmily', 1);
      await goToPassage(page, passage);
      await expectCleanPassage(page);
    });
  }
});

test.describe('Park — controller mutations', () => {
  test('startJoggingCooldown sets jogging to 1', async ({ game: page }) => {
    await setVar(page, 'jogging', 0);
    await page.evaluate(() => SugarCube.setup.Park.startJoggingCooldown());
    expect(await getVar(page, 'jogging')).toBe(1);
  });

  test('spendJoggingEnergy subtracts 2 from energy', async ({ game: page }) => {
    await setVar(page, 'mc.energy', 10);
    await page.evaluate(() => SugarCube.setup.Park.spendJoggingEnergy());
    expect(await getVar(page, 'mc.energy')).toBe(8);
  });

  test('dropEnergyToZero zeroes mc.energy', async ({ game: page }) => {
    await setVar(page, 'mc.energy', 7);
    await page.evaluate(() => SugarCube.setup.Park.dropEnergyToZero());
    expect(await getVar(page, 'mc.energy')).toBe(0);
  });

  test('isBeautyBelow flips around the threshold', async ({ game: page }) => {
    await setVar(page, 'mc.beauty', 30);
    expect(await callSetup(page, 'setup.Park.isBeautyBelow(30)')).toBe(true);
    expect(await callSetup(page, 'setup.Park.isBeautyBelow(40)')).toBe(false);
    await setVar(page, 'mc.beauty', 40);
    expect(await callSetup(page, 'setup.Park.isBeautyBelow(40)')).toBe(true);
  });

  test('canJogNow requires sportswear, hours-in-range, no cooldown, energy >= 2', async ({ game: page }) => {
    await setVar(page, 'sportswear', 1);
    await setVar(page, 'hours', 10);
    await setVar(page, 'jogging', 0);
    await setVar(page, 'mc.energy', 5);
    expect(await callSetup(page, 'setup.Park.canJogNow()')).toBe(true);

    await setVar(page, 'mc.energy', 1);
    expect(await callSetup(page, 'setup.Park.canJogNow()')).toBe(false);

    await setVar(page, 'mc.energy', 5);
    await setVar(page, 'jogging', 1);
    expect(await callSetup(page, 'setup.Park.canJogNow()')).toBe(false);

    await setVar(page, 'jogging', 0);
    await setVar(page, 'hours', 23);
    expect(await callSetup(page, 'setup.Park.canJogNow()')).toBe(false);
  });

  test('shouldTriggerParkMugging gates on exhibitionism < 5', async ({ game: page }) => {
    await setVar(page, 'mc.exhibitionism', 5);
    expect(await callSetup(page, 'setup.Park.shouldTriggerParkMugging()')).toBe(false);
    await setVar(page, 'mc.exhibitionism', 9);
    expect(await callSetup(page, 'setup.Park.shouldTriggerParkMugging()')).toBe(false);
  });

  test('applyMuggingOutcome zeroes energy and bumps exhibitionism', async ({ game: page }) => {
    await setVar(page, 'mc.energy', 8);
    await setVar(page, 'mc.exhibitionism', 2);

    const result = await page.evaluate(() => SugarCube.setup.Park.applyMuggingOutcome());
    expect(result).toBe(3);
    expect(await getVar(page, 'mc.energy')).toBe(0);
    expect(await getVar(page, 'mc.exhibitionism')).toBe(3);
  });

  test('applyMuggingOutcome caps exhibitionism at 10 and returns null', async ({ game: page }) => {
    await setVar(page, 'mc.energy', 5);
    await setVar(page, 'mc.exhibitionism', 10);
    const result = await page.evaluate(() => SugarCube.setup.Park.applyMuggingOutcome());
    expect(result).toBeNull();
    expect(await getVar(page, 'mc.exhibitionism')).toBe(10);
    expect(await getVar(page, 'mc.energy')).toBe(0);
  });
});

test.describe('Park — event passages', () => {
  for (const passage of ['ParkEvent1', 'ParkEvent2', 'ParkJogging', 'ParkMugging']) {
    test(`${passage} renders cleanly`, async ({ game: page }) => {
      await setVar(page, 'hours', 10);
      await setVar(page, 'sportswear', 1);
      await setVar(page, 'mc.energy', 5);
      await setVar(page, 'mc.beauty', 50);
      await setVar(page, 'mc.exhibitionism', 1);
      await goToPassage(page, passage);
      await expectCleanPassage(page);
    });
  }
});

test.describe('Library — controller helpers', () => {
  test('selectComics sets the chosen issue and clears the others', async ({ game: page }) => {
    await page.evaluate(() => SugarCube.setup.Library.selectComics(2));
    await page.evaluate(() => SugarCube.setup.Library.selectComics(3));
    const active = await callSetup(page, 'setup.Library.activeComic()');
    const all = await callSetup(page, 'setup.Library.comics');
    expect(active).toEqual(all[2]);
  });

  test('resetComics clears the active issue', async ({ game: page }) => {
    await page.evaluate(() => SugarCube.setup.Library.selectComics(2));
    await page.evaluate(() => SugarCube.setup.Library.resetComics());
    expect(await callSetup(page, 'setup.Library.activeComic()')).toBeNull();
  });

  test('discovery flag setters add the entries to availableSearchResults until found', async ({ game: page }) => {
    await page.evaluate(() => {
      const V = SugarCube.State.variables;
      delete V.foundTips; delete V.foundComics; delete V.foundGirl;
      delete V.foundGuy; delete V.foundBrook;
      // brookIsWithRain is true while isBrookePossessed === 0 AND CD <= 2.
      // Push the CD past that to make Brook meetable.
      V.isBrookePossessed = 0; V.isBrookePossessedCD = 5;
    });
    let results = await callSetup(page, 'setup.Library.availableSearchResults()');
    expect(results.sort()).toEqual(['Comics', 'book', 'brook', 'girl', 'guy'].sort());

    await page.evaluate(() => SugarCube.setup.Library.markTipsBookFound());
    await page.evaluate(() => SugarCube.setup.Library.markComicsFound());
    results = await callSetup(page, 'setup.Library.availableSearchResults()');
    expect(results).not.toContain('book');
    expect(results).not.toContain('Comics');
  });

  test('gainSmallCorruption caps at 3', async ({ game: page }) => {
    await setVar(page, 'mc.corruption', 2.95);
    await page.evaluate(() => SugarCube.setup.Library.gainSmallCorruption());
    let after = await getVar(page, 'mc.corruption');
    expect(after).toBeCloseTo(3.05, 1);

    await setVar(page, 'mc.corruption', 3.5);
    await page.evaluate(() => SugarCube.setup.Library.gainSmallCorruption());
    after = await getVar(page, 'mc.corruption');
    expect(after).toBeCloseTo(3.5, 1);
  });

  test('tryGainGropingCorruption gates at the cap', async ({ game: page }) => {
    await setVar(page, 'mc.corruption', 4);
    await page.evaluate(() => SugarCube.setup.Library.tryGainGropingCorruption(5, 0.5));
    expect(await getVar(page, 'mc.corruption')).toBeCloseTo(4.5, 1);

    await setVar(page, 'mc.corruption', 6);
    await page.evaluate(() => SugarCube.setup.Library.tryGainGropingCorruption(5, 0.5));
    expect(await getVar(page, 'mc.corruption')).toBe(6);
  });

  test('wearingPants and wearingSkirt mirror clothing state', async ({ game: page }) => {
    await setVar(page, 'jeansState', 'worn');
    expect(await callSetup(page, 'setup.Library.wearingPants()')).toBe(true);
    await setVar(page, 'jeansState', 'not worn');
    await setVar(page, 'shortsState', 'worn');
    expect(await callSetup(page, 'setup.Library.wearingPants()')).toBe(true);
    await setVar(page, 'shortsState', 'not worn');
    expect(await callSetup(page, 'setup.Library.wearingPants()')).toBe(false);

    await setVar(page, 'skirtState', 'worn');
    expect(await callSetup(page, 'setup.Library.wearingSkirt()')).toBe(true);
  });

  test('Brook hunt-pick records spent money + flags', async ({ game: page }) => {
    await page.evaluate(() => {
      const V = SugarCube.State.variables;
      V.brook = { name: 'Brook', lvl: 3, paidForSolo: 0, goingSolo: 0, chooseOwaissa: 0, chooseElm: 0 };
      V.mc.money = 100;
    });

    await page.evaluate(() => SugarCube.setup.Library.pickBrookForSoloOwaissa());
    expect(await getVar(page, 'mc.money')).toBe(80);
    expect(await getVar(page, 'brook.paidForSolo')).toBe(1);
    expect(await getVar(page, 'brook.goingSolo')).toBe(1);
    expect(await getVar(page, 'brook.chooseOwaissa')).toBe(1);
    expect(await getVar(page, 'brook.chooseElm')).toBe(0);

    // Already paid: should not deduct again
    await page.evaluate(() => SugarCube.setup.Library.pickBrookForSoloElm());
    expect(await getVar(page, 'mc.money')).toBe(80);
    expect(await getVar(page, 'brook.chooseOwaissa')).toBe(0);
    expect(await getVar(page, 'brook.chooseElm')).toBe(1);
  });

  test('refreshBrookSoloChances stores chance values', async ({ game: page }) => {
    await page.evaluate(() => {
      SugarCube.State.variables.brook = { lvl: 3 };
    });
    await page.evaluate(() => SugarCube.setup.Library.refreshBrookSoloChances());
    expect(await getVar(page, 'brook.soloChanceOwaissa')).toBe(40);
    expect(await getVar(page, 'brook.soloChanceElm')).toBe(25);
  });
});

test.describe('Mall — Blake content and warden outfit', () => {
  test('blakeUnlocked requires alice.lvl >= 2', async ({ game: page }) => {
    await page.evaluate(() => { SugarCube.State.variables.alice = { lvl: 1 }; });
    expect(await callSetup(page, 'setup.Mall.blakeUnlocked()')).toBe(false);
    await page.evaluate(() => { SugarCube.State.variables.alice = { lvl: 2 }; });
    expect(await callSetup(page, 'setup.Mall.blakeUnlocked()')).toBe(true);
  });

  test('blakeFirstMeeting reflects $dialogBlake undefined', async ({ game: page }) => {
    await page.evaluate(() => { delete SugarCube.State.variables.dialogBlake; });
    expect(await callSetup(page, 'setup.Mall.blakeFirstMeeting()')).toBe(true);
    await setVar(page, 'dialogBlake', 0);
    expect(await callSetup(page, 'setup.Mall.blakeFirstMeeting()')).toBe(false);
  });

  test('sellCursedItemToBlake clears CI flags and adds $60', async ({ game: page }) => {
    await setVar(page, 'gotCursedItem', 1);
    await setVar(page, 'isCIDildo', 1);
    await setVar(page, 'isCIButtplug', 1);
    await setVar(page, 'mc.money', 10);
    await page.evaluate(() => SugarCube.setup.Mall.sellCursedItemToBlake());
    expect(await getVar(page, 'mc.money')).toBe(70);
    expect(await getVar(page, 'gotCursedItem')).toBe(0);
    expect(await getVar(page, 'isCIDildo')).toBe(0);
  });

  test('warden outfit: gate, purchase, completion', async ({ game: page }) => {
    await setVar(page, 'mc.corruption', 2);
    expect(await callSetup(page, 'setup.Mall.meetsCorruptionForWarden()')).toBe(false);
    await setVar(page, 'mc.corruption', 3);
    expect(await callSetup(page, 'setup.Mall.meetsCorruptionForWarden()')).toBe(true);

    await setVar(page, 'wardenClothesStage', 1);
    expect(await callSetup(page, 'setup.Mall.canBuyWardenOutfit()')).toBe(true);

    await setVar(page, 'mc.money', 600);
    await page.evaluate(() => SugarCube.setup.Mall.buyWardenOutfit());
    expect(await getVar(page, 'mc.money')).toBe(100);
    expect(await getVar(page, 'wardenClothesStage')).toBe(2);
    expect(await callSetup(page, 'setup.Mall.canBuyWardenOutfit()')).toBe(false);
  });

  test('pepper spray: needs/has/buy round-trip', async ({ game: page }) => {
    await page.evaluate(() => { delete SugarCube.State.variables.hasPSpray; });
    expect(await callSetup(page, 'setup.Mall.needsPepperSpray()')).toBe(true);
    expect(await callSetup(page, 'setup.Mall.hasPepperSpray()')).toBe(false);

    await setVar(page, 'mc.money', 100);
    await page.evaluate(() => SugarCube.setup.Mall.buyPepperSpray());
    expect(await callSetup(page, 'setup.Mall.hasPepperSpray()')).toBe(true);
    expect(await callSetup(page, 'setup.Mall.pepperSprayCharges()')).toBe(3);
    expect(await getVar(page, 'mc.money')).toBe(90);
  });

  test('canBuyCamera requires undefined isCameraBought + mareEventStart === 3', async ({ game: page }) => {
    await page.evaluate(() => { delete SugarCube.State.variables.isCameraBought; });
    await setVar(page, 'ghostMareEventStart', 3);
    expect(await callSetup(page, 'setup.Mall.canBuyCamera()')).toBe(true);
    await setVar(page, 'isCameraBought', 0);
    expect(await callSetup(page, 'setup.Mall.canBuyCamera()')).toBe(false);
  });

  test('blake relationship raise', async ({ game: page }) => {
    await setVar(page, 'relationshipBlake', 0);
    await page.evaluate(() => SugarCube.setup.Mall.raiseBlakeRelationship());
    await page.evaluate(() => SugarCube.setup.Mall.raiseBlakeRelationship());
    expect(await callSetup(page, 'setup.Mall.blakeRelationship()')).toBe(2);
    expect(await callSetup(page, 'setup.Mall.canRaiseBlakeRelationship()')).toBe(true);
    await setVar(page, 'relationshipBlake', 5);
    expect(await callSetup(page, 'setup.Mall.canRaiseBlakeRelationship()')).toBe(false);
  });

  test('blakeIsCompanionCandidate gates at 5', async ({ game: page }) => {
    await setVar(page, 'relationshipBlake', 4);
    expect(await callSetup(page, 'setup.Mall.blakeIsCompanionCandidate()')).toBe(false);
    await setVar(page, 'relationshipBlake', 5);
    expect(await callSetup(page, 'setup.Mall.blakeIsCompanionCandidate()')).toBe(true);
  });
});

test.describe('Church — relationship & exorcism levers', () => {
  test('initRainIfNeeded only seeds 0 when undefined', async ({ game: page }) => {
    await page.evaluate(() => { delete SugarCube.State.variables.relationshipWithRain; });
    await page.evaluate(() => SugarCube.setup.Church.initRainIfNeeded());
    expect(await callSetup(page, 'setup.Church.relationshipWithRain()')).toBe(0);

    await setVar(page, 'relationshipWithRain', 5);
    await page.evaluate(() => SugarCube.setup.Church.initRainIfNeeded());
    expect(await callSetup(page, 'setup.Church.relationshipWithRain()')).toBe(5);
  });

  test('adjustRainRelationship adds to current value', async ({ game: page }) => {
    await setVar(page, 'relationshipWithRain', 1);
    await page.evaluate(() => SugarCube.setup.Church.adjustRainRelationship(2));
    expect(await callSetup(page, 'setup.Church.relationshipWithRain()')).toBe(3);
    await page.evaluate(() => SugarCube.setup.Church.adjustRainRelationship(-1));
    expect(await callSetup(page, 'setup.Church.relationshipWithRain()')).toBe(2);
  });

  test('upgradeSpiritboxReward only fires when not already at level 3', async ({ game: page }) => {
    await setVar(page, 'equipment', { spiritbox: 1 });
    let granted = await page.evaluate(() => SugarCube.setup.Church.upgradeSpiritboxReward());
    expect(granted).toBe(true);
    expect(await getVar(page, 'equipment.spiritbox')).toBe(3);

    granted = await page.evaluate(() => SugarCube.setup.Church.upgradeSpiritboxReward());
    expect(granted).toBe(false);
  });

  test('startExorcismQuest sets stage 1 and grants amulet', async ({ game: page }) => {
    await setVar(page, 'exorcismQuestStage', 0);
    await page.evaluate(() => { delete SugarCube.State.variables.amulet; });
    await page.evaluate(() => SugarCube.setup.Church.startExorcismQuest());
    expect(await getVar(page, 'exorcismQuestStage')).toBe(1);
    expect(await getVar(page, 'amulet')).toBe(1);
  });

  test('startPriestToolEvent sets eventToolsOneStart and upgrades temperature', async ({ game: page }) => {
    await setVar(page, 'eventToolsOneStart', 0);
    await setVar(page, 'equipment', { temperature: 1 });
    await page.evaluate(() => SugarCube.setup.Church.startPriestToolEvent());
    expect(await callSetup(page, 'setup.Church.priestToolEventStarted()')).toBe(true);
    expect(await getVar(page, 'equipment.temperature')).toBe(3);
  });

  test('confessFlushLust drops lust to 0 only when at 100, gains corruption', async ({ game: page }) => {
    await setVar(page, 'mc.lust', 100);
    await setVar(page, 'mc.corruption', 1);
    await page.evaluate(() => SugarCube.setup.Church.confessFlushLust());
    expect(await getVar(page, 'mc.lust')).toBe(0);
    expect(await getVar(page, 'mc.corruption')).toBeCloseTo(1.2, 1);

    await setVar(page, 'mc.lust', 80);
    await setVar(page, 'mc.corruption', 5);
    await page.evaluate(() => SugarCube.setup.Church.confessFlushLust());
    expect(await getVar(page, 'mc.lust')).toBe(80);
    expect(await getVar(page, 'mc.corruption')).toBe(5);
  });

  test('clearLust always zeroes lust', async ({ game: page }) => {
    await setVar(page, 'mc.lust', 75);
    await page.evaluate(() => SugarCube.setup.Church.clearLust());
    expect(await getVar(page, 'mc.lust')).toBe(0);
  });

  test('lustTooHighForPriest threshold 85', async ({ game: page }) => {
    await setVar(page, 'mc.lust', 84);
    expect(await callSetup(page, 'setup.Church.lustTooHighForPriest()')).toBe(false);
    await setVar(page, 'mc.lust', 85);
    expect(await callSetup(page, 'setup.Church.lustTooHighForPriest()')).toBe(true);
  });

  test('clearBrookePossession resets the flags', async ({ game: page }) => {
    await setVar(page, 'isBrookePossessed', 1);
    await setVar(page, 'isBrookePossessedCD', 5);
    await page.evaluate(() => SugarCube.setup.Church.clearBrookePossession());
    expect(await getVar(page, 'isBrookePossessed')).toBe(0);
    expect(await getVar(page, 'isBrookePossessedCD')).toBe(0);
  });
});
