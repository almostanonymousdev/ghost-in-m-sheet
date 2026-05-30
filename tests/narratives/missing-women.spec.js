/*
 * Narrative test for the missing-women plotline.
 *
 * Per-passage and per-controller assertions live in tests/e2e/rescue-*.
 * This file walks the *whole arc* a player would take from the moment
 * the church door opens to the moment the nun thanks them (or scolds
 * them), checking at each phase boundary that:
 *   - the entrypoint link is rendered and clickable,
 *   - the guard that controls visibility flips at the right moment,
 *   - the destination passage is reachable.
 *
 * New plotline narratives belong next to this file, under
 * tests/narratives/, following the same "phase-by-phase walk" shape.
 */

const { test, expect } = require('../fixtures');
const { setVar, getVar, goToPassage, callSetup } = require('../helpers');
const { expectCleanPassage } = require('../e2e/e2e-helpers');

/* Park the clock + reset the rescue board so every phase test starts
   from a known, board-cooldown-clear evening, with the player having
   already met Rain (otherwise the missing-persons board doesn't render
   at all and most subsequent links don't exist). */
async function primeBoardOpenEvening(page) {
  await setVar(page, 'relationshipWithRain', 1);
  await setVar(page, 'hasQuestForRescue', 0);
  await setVar(page, 'rescueQuest', 0);
  await setVar(page, 'rescue', 0);
  await setVar(page, 'hours', 20);
  await setVar(page, 'minutes', 0);
}

/* Pin the rescue quest into the "active, found the right house, fresh
   energy" state most middle-phase tests want to walk through. */
async function primeActiveQuest(page, girl, { house = 5, photo = 5 } = {}) {
  await primeBoardOpenEvening(page);
  await setVar(page, 'hasQuestForRescue', 1);
  await setVar(page, 'currentRescueGirl', girl);
  await setVar(page, 'rescueStage', 0);
  await setVar(page, 'randomRescuePhotoNumber', photo);
  await setVar(page, 'rescueHouse', house);
  await setVar(page, 'mc.energy', 10);
  /* TickController normally seeds this every passage; setting it
     directly so tests that go straight to RescueHouse / RescueClueFound
     don't render a stray `undefined` class. */
  await page.evaluate(() => {
    const V = SugarCube.State.variables;
    if (!V.tornStyleRandom) V.tornStyleRandom = 'torn-style-1 torn-effect';
  });
}

test.describe('Narrative — Missing Women rescue plotline', () => {
  /* Phases 0a-0e walk the player from the witch's hut to the moment
     Sister Rain is unlocked at the church -- before the missing-persons
     board has ever appeared. They guard the entry path into Phase 1+. */
  test.describe('Phase 0 — lead-up from Khadija to Sister Rain', () => {
    test('Phase 0a — Khadija\'s "Missing girls" offer is gated behind lvl 4', async ({ game: page }) => {
      await setVar(page, 'firstVisitWitchShop', false);
      await page.evaluate(() => { delete SugarCube.State.variables.hasQuestForRescue; });
      await setVar(page, 'hours', 14);
      await setVar(page, 'mc.lvl', 3);

      await goToPassage(page, 'WitchInside');
      await expectCleanPassage(page);

      const offer = page.locator('.passage .rescueGirlsDisabled');
      await expect(offer).toBeVisible();
      expect(await offer.evaluate(el => el.classList.contains('disabled-link'))).toBe(true);
      expect(await page.locator('.passage').textContent()).toContain('Req. lvl 4+');

      await setVar(page, 'mc.lvl', 4);
      await goToPassage(page, 'WitchInside');
      await expectCleanPassage(page);

      const enabled = page.locator('.passage .rescueGirlsDisabled');
      await expect(enabled).toBeVisible();
      expect(await enabled.evaluate(el => el.classList.contains('disabled-link'))).toBe(false);
    });

    test('Phase 0b — the offer disappears once any rescue state exists', async ({ game: page }) => {
      await setVar(page, 'firstVisitWitchShop', false);
      await setVar(page, 'mc.lvl', 4);
      await setVar(page, 'hours', 14);
      await setVar(page, 'hasQuestForRescue', 0);

      await goToPassage(page, 'WitchInside');
      await expectCleanPassage(page);

      expect(await callSetup(page, 'setup.Witch.canOfferRescueQuest()')).toBe(false);
      await expect(page.locator('.passage').filter({ hasText: 'Missing girls' })).toHaveCount(0);
    });

    test('Phase 0c — clicking the offer seeds AVAILABLE and points the MC at the church', async ({ game: page }) => {
      await setVar(page, 'firstVisitWitchShop', false);
      await setVar(page, 'mc.lvl', 4);
      await setVar(page, 'hours', 14);
      await page.evaluate(() => { delete SugarCube.State.variables.hasQuestForRescue; });

      await goToPassage(page, 'WitchInside');
      await expectCleanPassage(page);

      await page.locator('.passage .usebtn').filter({ hasText: 'Missing girls' }).click();
      await page.waitForFunction(() =>
        SugarCube.State.variables.hasQuestForRescue === 0
      );

      expect(await getVar(page, 'hasQuestForRescue')).toBe(0);
      expect(await page.locator('.passage').textContent())
        .toContain('Go to the church and find Sister Rain');
    });

    test('Phase 0d — Church then offers the "Confess to Sister Rain" entry', async ({ game: page }) => {
      await setVar(page, 'hasQuestForRescue', 0);
      await page.evaluate(() => { delete SugarCube.State.variables.relationshipWithRain; });
      await setVar(page, 'hours', 14);

      expect(await callSetup(page, 'setup.Church.canStartNunQuest()')).toBe(true);
      expect(await callSetup(page, 'setup.Church.showMissingPersonsBoard()')).toBe(false);

      await goToPassage(page, 'Church');
      await expectCleanPassage(page);

      await expect(page.locator('.passage a').filter({ hasText: 'Missing persons board' }))
        .toHaveCount(0);

      const nunLink = page.locator('.passage a').filter({ hasText: 'Confess your sins to Sister Rain' });
      await expect(nunLink).toBeVisible();
      await nunLink.click();
      await page.waitForFunction(() => SugarCube.State.passage === 'ChurchNunQuest');
    });

    test('Phase 0e — first-visit ChurchNunQuest stamps Rain and unlocks the board', async ({ game: page }) => {
      await setVar(page, 'hasQuestForRescue', 0);
      await page.evaluate(() => { delete SugarCube.State.variables.relationshipWithRain; });
      await setVar(page, 'hours', 14);

      expect(await callSetup(page, 'setup.Church.hasMetRain()')).toBe(false);

      await goToPassage(page, 'ChurchNunQuest');
      await expectCleanPassage(page);
      /* The first-visit intro tells the player how the board works. */
      expect(await page.locator('.passage').textContent()).toContain('Board\'s outside');
      expect(await getVar(page, 'relationshipWithRain')).toBe(0);

      /* Returning to Church now surfaces the board entry and hides the
         pre-Rain "Confess to Sister Rain" referral. */
      await page.locator('.passage .backbtn a').filter({ hasText: 'Back' }).click();
      await page.waitForFunction(() => SugarCube.State.passage === 'Church');
      await expectCleanPassage(page);

      await expect(page.locator('.passage a').filter({ hasText: 'Missing persons board' }))
        .toBeVisible();
      await expect(page.locator('.passage a').filter({ hasText: 'Confess your sins to Sister Rain' }))
        .toHaveCount(0);
    });
  });

  test.describe('Phase 1 — board gating before / after meeting Rain', () => {
    test('missing-persons board is hidden in Church before Rain is met', async ({ game: page }) => {
      await page.evaluate(() => { delete SugarCube.State.variables.relationshipWithRain; });
      await setVar(page, 'hasQuestForRescue', 0);
      await setVar(page, 'hours', 20);

      await goToPassage(page, 'Church');
      await expectCleanPassage(page);

      const boardLink = page.locator('.passage a').filter({ hasText: 'Missing persons board' });
      await expect(boardLink).toHaveCount(0);
      expect(await callSetup(page, 'setup.Church.canStartNunQuest()')).toBe(true);
    });

    test('missing-persons board entry appears in Church after Rain is met', async ({ game: page }) => {
      await primeBoardOpenEvening(page);

      await goToPassage(page, 'Church');
      await expectCleanPassage(page);

      const boardLink = page.locator('.passage a').filter({ hasText: 'Missing persons board' });
      await expect(boardLink).toBeVisible();
      await boardLink.click();
      await page.waitForFunction(() => SugarCube.State.passage === 'RescueTaskBoard');
    });
  });

  test.describe('Phase 2 — task board time / cooldown guards', () => {
    test('posters only appear after 18:00', async ({ game: page }) => {
      await primeBoardOpenEvening(page);
      await setVar(page, 'hours', 12);

      await goToPassage(page, 'RescueTaskBoard');
      await expectCleanPassage(page);

      expect(await page.locator('.passage').textContent()).toContain('18:00');
      await expect(page.locator('.passage .usebtn').filter({ hasText: 'Take' })).toHaveCount(0);
    });

    test('two unique poster cards render in the evening with no cooldown', async ({ game: page }) => {
      await primeBoardOpenEvening(page);

      await goToPassage(page, 'RescueTaskBoard');
      await expectCleanPassage(page);

      const takeButtons = page.locator('.passage .usebtn').filter({ hasText: 'Take' });
      await expect(takeButtons).toHaveCount(2);

      const girls = await getVar(page, 'rescueRandomGirls');
      expect(girls).toHaveLength(2);
      expect(girls[0].name).not.toBe(girls[1].name);
    });

    test('board on cooldown shows "Enough for today" and hides Take buttons', async ({ game: page }) => {
      await primeBoardOpenEvening(page);
      await setVar(page, 'rescueQuest', 1);

      await goToPassage(page, 'RescueTaskBoard');
      await expectCleanPassage(page);

      expect(await page.locator('.passage').textContent()).toContain('Enough for today');
      await expect(page.locator('.passage .usebtn').filter({ hasText: 'Take' })).toHaveCount(0);
    });
  });

  test.describe('Phase 3 — taking a poster activates the quest', () => {
    test('clicking Take flips the quest active and seeds the per-quest vars', async ({ game: page }) => {
      await primeBoardOpenEvening(page);

      await goToPassage(page, 'RescueTaskBoard');
      await page.locator('.passage .usebtn').filter({ hasText: 'Take' }).first().click();
      await page.waitForFunction(() => SugarCube.State.variables.hasQuestForRescue === 1);

      expect(await getVar(page, 'hasQuestForRescue')).toBe(1);
      expect(await getVar(page, 'rescueStage')).toBe(0);
      expect(['Victoria', 'Julia', 'Jade', 'Nadia', 'Ash'])
        .toContain(await getVar(page, 'currentRescueGirl'));

      const houseNum = await getVar(page, 'randomRescuePhotoNumber');
      expect(houseNum).toBeGreaterThanOrEqual(1);
      expect(houseNum).toBeLessThanOrEqual(16);
    });

    test('reopening the board with an active quest shows the "already taken" message', async ({ game: page }) => {
      await primeActiveQuest(page, 'Victoria');

      await goToPassage(page, 'RescueTaskBoard');
      await expectCleanPassage(page);

      expect(await page.locator('.passage').textContent())
        .toContain('already taken the missing poster');
      await expect(page.locator('.passage .usebtn').filter({ hasText: 'Take' })).toHaveCount(0);
    });
  });

  test.describe('Phase 4 — rescue map unlocks once a quest is active', () => {
    test('CityMap renders the rescue-map clickable image only when a quest is active', async ({ game: page }) => {
      await primeBoardOpenEvening(page);
      await goToPassage(page, 'CityMap');
      await expectCleanPassage(page);
      await expect(page.locator('.passage .downPointer')).toHaveCount(0);

      await primeActiveQuest(page, 'Victoria');
      await goToPassage(page, 'CityMap');
      await expectCleanPassage(page);
      await expect(page.locator('.passage .downPointer')).toHaveCount(1);
    });

    test('RescueMap renders 16 houses, each navigating to RescueHouse', async ({ game: page }) => {
      await primeActiveQuest(page, 'Victoria');

      await goToPassage(page, 'RescueMap');
      await expectCleanPassage(page);

      await expect(page.locator('.passage .housecard')).toHaveCount(16);

      await page.locator('.passage .icontextcity').first().click();
      await page.waitForFunction(() => SugarCube.State.passage === 'RescueHouse');
      expect(await getVar(page, 'rescueHouse')).toBe(1);
    });
  });

  test.describe('Phase 5 — searching the wrong house wastes time, no progress', () => {
    test('searching a wrong house consumes 1 energy and shows the "find no one" message', async ({ game: page }) => {
      test.setTimeout(10_000);
      await primeActiveQuest(page, 'Victoria', { house: 3, photo: 5 });

      await goToPassage(page, 'RescueHouse');
      await expectCleanPassage(page);

      await page.locator('.passage .usebtn').filter({ hasText: 'Search the house' }).click();
      await page.waitForFunction(() =>
        document.querySelector('.passage').textContent.includes('find no one')
      );

      expect(await getVar(page, 'mc.energy')).toBe(9);
      expect(await getVar(page, 'hasQuestForRescue')).toBe(1);
    });

    test('zero energy gates the search', async ({ game: page }) => {
      await primeActiveQuest(page, 'Victoria', { house: 3, photo: 5 });
      await setVar(page, 'mc.energy', 0);

      await goToPassage(page, 'RescueHouse');
      await expectCleanPassage(page);

      expect(await page.locator('.passage').textContent()).toContain('too tired');
      await expect(page.locator('.passage .usebtn').filter({ hasText: 'Search the house' }))
        .toHaveCount(0);
    });
  });

  test.describe('Phase 6 — finding the photo clue upgrades EMF and tags the photo', () => {
    test('RescueClueFound is reachable, sets hasRescueClue, and bumps EMF to lvl 3', async ({ game: page }) => {
      await primeActiveQuest(page, 'Victoria');
      await setVar(page, 'hasRescueClue', false);
      await setVar(page, 'equipment.emf', 1);
      await setVar(page, 'return', 'OwaissaHallway');

      await goToPassage(page, 'RescueClueFound');
      await expectCleanPassage(page);

      await page.locator('.passage .usebtn').first().click();
      await page.waitForFunction(() => SugarCube.State.variables.hasRescueClue === true);

      expect(await getVar(page, 'hasRescueClue')).toBe(true);
      expect(await getVar(page, 'equipment.emf')).toBe(3);
    });
  });

  test.describe('Phase 7 — photo / house comparison overlay', () => {
    test('with the clue, comparing the correct house surfaces the affirmative line', async ({ game: page }) => {
      await primeActiveQuest(page, 'Victoria', { house: 5, photo: 5 });
      await setVar(page, 'hasRescueClue', true);

      await goToPassage(page, 'RescueHouse');
      await expectCleanPassage(page);

      const compareBtn = page.locator('.passage .usebtn').filter({ hasText: 'Compare the house with the photo' });
      await expect(compareBtn).toBeVisible();
      await compareBtn.click();

      await page.waitForFunction(() => {
        const t = document.querySelector('.passage').textContent;
        return t.includes('this is the house') || t.includes("doesn't really look");
      });
      expect(await page.locator('.passage').textContent()).toContain('this is the house');
    });

    test('without the clue, no Compare button is offered', async ({ game: page }) => {
      await primeActiveQuest(page, 'Victoria', { house: 5, photo: 5 });
      await setVar(page, 'hasRescueClue', false);

      await goToPassage(page, 'RescueHouse');
      await expectCleanPassage(page);

      await expect(page.locator('.passage .usebtn').filter({ hasText: 'Compare the house with the photo' }))
        .toHaveCount(0);
    });
  });

  test.describe('Phase 8 — searching the correct house routes to the rescue event', () => {
    test('correct house at stage 0 dispatches into RescueEvent → RescueSuccess', async ({ game: page }) => {
      test.setTimeout(10_000);
      await primeActiveQuest(page, 'Victoria', { house: 5, photo: 5 });
      await setVar(page, 'rescueStage', 0);

      await goToPassage(page, 'RescueHouse');
      await page.locator('.passage .usebtn').filter({ hasText: 'Search the house' }).click();
      await page.waitForFunction(() => SugarCube.State.passage === 'RescueEvent');
      await expectCleanPassage(page);

      const text = await page.locator('.passage').textContent();
      expect(text).toContain('abandoned house');
      /* RescueEvent includes RescueSuccess at stage 0, which renders the
         player-facing fork. */
      expect(text).toContain('Continue');
      expect(text).toContain('Leave');
    });

    test('RescueEvent also kicks off the board cooldown so the day is burned', async ({ game: page }) => {
      await primeActiveQuest(page, 'Victoria', { house: 5, photo: 5 });
      await setVar(page, 'rescueStage', 0);

      await goToPassage(page, 'RescueEvent');
      await expectCleanPassage(page);
      expect(await callSetup(page, 'setup.MissingWomen.boardOnCooldown()')).toBe(true);
    });
  });

  test.describe('Phase 9 — RescueScene with holy water → success', () => {
    test('holy water resolves the watch loop into a return-to-church success', async ({ game: page }) => {
      test.setTimeout(10_000);
      await primeActiveQuest(page, 'Jade');
      await setVar(page, 'holyWaterIsCollected', true);

      await goToPassage(page, 'RescueScene');
      await expectCleanPassage(page);

      const holyBtn = page.locator('.passage .usebtn').filter({ hasText: 'Use holywater' });
      await expect(holyBtn).toBeVisible();
      await holyBtn.click();

      const leaveLink = page.locator('.passage a').filter({ hasText: 'Leave' });
      await expect(leaveLink).toBeVisible();
      await leaveLink.click();
      await page.waitForFunction(() => SugarCube.State.passage === 'Church');

      expect(await getVar(page, 'holyWaterIsCollected')).toBe(false);
      expect(await getVar(page, 'hasQuestForRescue')).toBe(3);
    });
  });

  test.describe('Phase 10 — RescueScene without holy water gates progress', () => {
    test('no holy water → no Use holywater button, only a Leave path', async ({ game: page }) => {
      await primeActiveQuest(page, 'Jade');
      await setVar(page, 'holyWaterIsCollected', false);

      await goToPassage(page, 'RescueScene');
      await expectCleanPassage(page);

      await expect(page.locator('.passage .usebtn').filter({ hasText: 'Use holywater' }))
        .toHaveCount(0);
      await expect(page.locator('.passage a').filter({ hasText: 'Leave' })).toBeVisible();
    });
  });

  test.describe('Phase 11 — quest expiry routes the player back to the nun for failure', () => {
    test('after expiry, Church redirects pray → ChurchNunQuest and the failure beat plays', async ({ game: page }) => {
      await setVar(page, 'relationshipWithRain', 3);
      await setVar(page, 'hasQuestForRescue', 2);
      await setVar(page, 'hasRescueClue', false);
      await setVar(page, 'hours', 12);

      expect(await callSetup(page, 'setup.MissingWomen.mustReturnToNun()')).toBe(true);
      expect(await callSetup(page, 'setup.Church.shouldRedirectToNunQuest()')).toBe(true);

      // ChurchPray fires <<goto "ChurchNunQuest">> deferred. goToPassage's
      // "did passage match?" wait races the goto and can retry the
      // Engine.play, which would double-fire ChurchNunQuest's
      // adjustRainRelationship(-1) side effect. Drive the engine directly.
      await page.evaluate(() => SugarCube.Engine.play('ChurchPray'));
      await page.waitForFunction(() => SugarCube.State.passage === 'ChurchNunQuest');
      await expectCleanPassage(page);

      expect(await page.locator('.passage').textContent()).toContain('experienced ghost hunter');
      expect(await getVar(page, 'relationshipWithRain')).toBe(2);
    });

    test('the back-to-Church link from ChurchNunQuest resets the quest to AVAILABLE', async ({ game: page }) => {
      await setVar(page, 'relationshipWithRain', 3);
      await setVar(page, 'hasQuestForRescue', 2);
      await setVar(page, 'hasRescueClue', false);
      await setVar(page, 'hours', 12);

      await goToPassage(page, 'ChurchNunQuest');
      await page.locator('.passage .backbtn a').filter({ hasText: 'Back' }).click();
      await page.waitForFunction(() => SugarCube.State.passage === 'Church');

      expect(await getVar(page, 'hasQuestForRescue')).toBe(0);
    });
  });

  test.describe('Phase 12 — success resolution at the nun', () => {
    test('returning at stage SUCCEEDED bumps Rain, upgrades spiritbox, and resets the quest', async ({ game: page }) => {
      await setVar(page, 'relationshipWithRain', 3);
      await setVar(page, 'hasQuestForRescue', 3);
      await setVar(page, 'hasRescueClue', false);
      await setVar(page, 'equipment.spiritbox', 2);
      await setVar(page, 'hours', 12);

      await goToPassage(page, 'ChurchNunQuest');
      await expectCleanPassage(page);
      expect(await page.locator('.passage').textContent()).toContain('thank you');
      expect(await getVar(page, 'relationshipWithRain')).toBe(4);
      expect(await getVar(page, 'equipment.spiritbox')).toBe(3);

      await page.locator('.passage .backbtn a').filter({ hasText: 'Back' }).click();
      await page.waitForFunction(() => SugarCube.State.passage === 'Church');
      expect(await getVar(page, 'hasQuestForRescue')).toBe(0);
    });

    test('with the quest reset, the Church board offers postings again the next evening', async ({ game: page }) => {
      await primeBoardOpenEvening(page);
      await setVar(page, 'hasQuestForRescue', 0);
      await setVar(page, 'rescueQuest', 0);

      await goToPassage(page, 'Church');
      await expectCleanPassage(page);
      await expect(page.locator('.passage a').filter({ hasText: 'Missing persons board' }))
        .toBeVisible();

      await goToPassage(page, 'RescueTaskBoard');
      await expect(page.locator('.passage .usebtn').filter({ hasText: 'Take' })).toHaveCount(2);
    });
  });

  test.describe('Phase 13 — possession branches are reachable for every girl', () => {
    /* The shared widget on RescuePossessed walks the player into the
       per-girl Possessed entry. The narrative test isn't about exercising
       each branch's content (that's covered by rescue-possession-variants);
       it's about confirming the dispatch table doesn't leave any girl
       stranded with an unreachable passage. */
    for (const girl of ['Victoria', 'Jade', 'Julia', 'Nadia', 'Ash']) {
      test(`${girl} possession entrypoint dispatches to Rescue${girl}Possessed`, async ({ game: page }) => {
        expect(await callSetup(page, `setup.MissingWomen.possessedPassageFor("${girl}")`))
          .toBe(`Rescue${girl}Possessed`);

        await primeActiveQuest(page, girl);
        await goToPassage(page, `Rescue${girl}Possessed`);
        await expectCleanPassage(page);
      });
    }
  });
});
