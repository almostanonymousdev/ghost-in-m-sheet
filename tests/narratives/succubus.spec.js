/*
 * Narrative test for the succubus / exorcism plotline.
 *
 * Per-passage and per-controller assertions for the succubus arc live in
 * tests/e2e/succubus.spec.js. This file walks the *whole arc* a player
 * takes from the moment Khadija's referral becomes available, through
 * the door-knock arrival, the witch dialog, Rain's book, the summoning
 * deal, the post-binding choice menu, and the in-hunt protection event.
 *
 * Each phase asserts:
 *   - the entrypoint link is rendered and clickable,
 *   - the guard that controls visibility flips at the right moment,
 *   - the destination passage is reachable.
 */

const { test, expect } = require('../fixtures');
const { setVar, getVar, goToPassage, callSetup } = require('../helpers');
const { expectCleanPassage } = require('../e2e/e2e-helpers');

/* Park the clock and corruption so the door-knock condition is open.
   succubusCanKnock() requires hours 18-20 + corruption >= 6 +
   no prior encounter. Tests can shift any of these to flip the gate. */
async function primeForDoorKnock(page) {
  await setVar(page, 'hours', 19);
  await setVar(page, 'minutes', 0);
  await setVar(page, 'mc.corruption', 6);
  await page.evaluate(() => { delete SugarCube.State.variables.succubus; });
}

/* Pin the state to "succubus has visited, witch can be asked about it"
   so SuccubusEventTV/PCEvent are reachable and the WitchInside referral
   linkreplace renders. */
async function primeAmbientReady(page) {
  await setVar(page, 'hours', 19);
  await setVar(page, 'minutes', 0);
  await setVar(page, 'mc.corruption', 6);
  await setVar(page, 'succubus', 1);
  /* The TV-event helper gates on a per-day cooldown counter inside
     $succubusEvent. Stamp the bundle so the controller doesn't see
     `undefined.eventCD`. */
  await page.evaluate(() => {
    const V = SugarCube.State.variables;
    V.succubusEvent = V.succubusEvent || {};
    if (V.succubusEvent.eventCD === undefined) V.succubusEvent.eventCD = 0;
  });
}

/* Drop every "another summon path wins" guard so SummoningStart routes
   to the succubus branch. Used by both REFERRED and SUCCUBUS_SUMMONED
   phases below. */
async function primeSummoningContext(page, exorcismStage) {
  await page.evaluate((stage) => {
    const V = SugarCube.State.variables;
    V.ghostSpecialEventSpirit = 1;
    V.twinsEventActive = false;
    V.ghostMareEventStart = 0;
    V.exorcismQuestStage = stage;
    delete V.gotCursedItem;
    V.succubusEvent = V.succubusEvent || {};
  }, exorcismStage);
}

test.describe('Narrative — Succubus / exorcism plotline', () => {
  test.describe('Phase 0 — door-knock arrival in the Livingroom', () => {
    test('Phase 0a — corruption < 6 keeps the knock hidden', async ({ game: page }) => {
      await primeForDoorKnock(page);
      await setVar(page, 'mc.corruption', 5);

      expect(await callSetup(page, 'setup.Home.succubusCanKnock()')).toBe(false);
      await goToPassage(page, 'Livingroom');
      await expectCleanPassage(page);
      await expect(page.locator('.passage').filter({ hasText: 'gently knocking on the door' }))
        .toHaveCount(0);
    });

    test('Phase 0b — out-of-window hours hide the knock', async ({ game: page }) => {
      await primeForDoorKnock(page);
      await setVar(page, 'hours', 14);
      expect(await callSetup(page, 'setup.Home.succubusCanKnock()')).toBe(false);

      await setVar(page, 'hours', 22);
      expect(await callSetup(page, 'setup.Home.succubusCanKnock()')).toBe(false);
    });

    test('Phase 0c — at hours 19 with corruption 6, the knock appears and clicking it stamps $succubus = 1', async ({ game: page }) => {
      await primeForDoorKnock(page);
      expect(await callSetup(page, 'setup.Home.succubusCanKnock()')).toBe(true);

      await goToPassage(page, 'Livingroom');
      await expectCleanPassage(page);

      const knock = page.locator('.passage a.macro-linkreplace')
        .filter({ hasText: 'gently knocking on the door' });
      await expect(knock).toBeVisible();
      await knock.click();

      await page.waitForFunction(() => SugarCube.State.variables.succubus === 1);
      expect(await callSetup(page, 'setup.Witch.succubusVisited()')).toBe(true);
      expect(await callSetup(page, 'setup.Home.succubusCanKnock()')).toBe(false);
    });
  });

  test.describe('Phase 1 — ambient TV / PC events surface after the knock', () => {
    test('Phase 1a — clicking "Watch tv" in the Livingroom routes to SuccubusEventTV', async ({ game: page }) => {
      await primeAmbientReady(page);
      expect(await callSetup(page, 'setup.Home.succubusTVEventReady()')).toBe(true);

      await goToPassage(page, 'Livingroom');
      await expectCleanPassage(page);

      await page.locator('.passage a').filter({ hasText: 'Watch tv' }).click();
      await page.waitForFunction(() => SugarCube.State.passage === 'SuccubusEventTV');
      await expectCleanPassage(page);
    });

    test('Phase 1b — "Use PC" exposes the SuccubusPCEvent back-link when isSuccubusPCEventReady', async ({ game: page }) => {
      await primeAmbientReady(page);
      /* eventCD === 0 + succubusVisited() is enough for
         isSuccubusPCEventReady, but the gate also accepts
         eventCD === 2 inside hours 18-23 as the daily reset path.
         primeAmbientReady stamps eventCD = 0 + succubus = 1, so the
         helper resolves true. */
      expect(await callSetup(page, 'setup.Home.isSuccubusPCEventReady()')).toBe(true);

      await goToPassage(page, 'Use PC');
      await expectCleanPassage(page);
      const back = page.locator('.passage a').filter({ hasText: 'Back' }).first();
      await expect(back).toBeVisible();
      await back.click();
      await page.waitForFunction(() => SugarCube.State.passage === 'SuccubusPCEvent');
      await expectCleanPassage(page);
    });
  });

  test.describe('Phase 2 — Witch refers the player to the church', () => {
    test('Phase 2a — Khadija offers the "Ask about a ghost" linkreplace once SuccubusEventTV has fired', async ({ game: page }) => {
      await primeAmbientReady(page);
      await setVar(page, 'firstVisitWitchShop', false);

      /* WitchInside gates the referral on hasVisited(...) for either
         ambient passage. Walk through SuccubusEventTV so SugarCube's
         visit log records it; that's the truthful path. */
      await goToPassage(page, 'SuccubusEventTV');
      await expectCleanPassage(page);

      await page.evaluate(() => { delete SugarCube.State.variables.exorcismQuestStage; });
      await goToPassage(page, 'WitchInside');
      await expectCleanPassage(page);
      expect(await callSetup(page, 'setup.Witch.exorcismQuestNotStarted()')).toBe(true);

      const ask = page.locator('.passage a.macro-linkreplace')
        .filter({ hasText: 'Ask about a ghost in the house' });
      await expect(ask).toBeVisible();
      await ask.click();

      /* The reveal text routes the player at the church. */
      await page.waitForFunction(() =>
        document.querySelector('.passage')
          .textContent.includes('Visit the church and ask Sister Rain about an exorcism')
      );
      /* The witch's runner stamps exorcismQuestStage back to
         NOT_STARTED (0) so the church can offer the referral. */
      expect(await getVar(page, 'exorcismQuestStage')).toBe(0);
    });
  });

  test.describe('Phase 3 — Rain hands over the exorcism kit', () => {
    test('Phase 3a — Rain refuses if relationshipWithRain < 5, names the gap', async ({ game: page }) => {
      await setVar(page, 'relationshipWithRain', 2);
      await setVar(page, 'exorcismQuestStage', 0);

      expect(await callSetup(page, 'setup.Church.rainTrustsForExorcism()')).toBe(false);
      expect(await callSetup(page, 'setup.Church.rescuesNeededForExorcism()')).toBe(3);

      await goToPassage(page, 'RainExorcism');
      await expectCleanPassage(page);
      expect(await page.locator('.passage').textContent()).toContain('Bring me a few back');
      expect(await page.locator('.passage').textContent()).toContain('3 more');
      expect(await getVar(page, 'exorcismQuestStage')).toBe(0);
    });

    test('Phase 3b — relationship 5+ triggers startExorcismQuest and stamps REFERRED + amulet', async ({ game: page }) => {
      await setVar(page, 'relationshipWithRain', 5);
      await setVar(page, 'exorcismQuestStage', 0);
      await page.evaluate(() => { delete SugarCube.State.variables.amulet; });

      expect(await callSetup(page, 'setup.Church.rainTrustsForExorcism()')).toBe(true);

      await goToPassage(page, 'RainExorcism');
      await expectCleanPassage(page);
      expect(await page.locator('.passage').textContent())
        .toContain('I need to summon a ghost in my house using the book Rain gave me');

      const stage = await getVar(page, 'exorcismQuestStage');
      const referred = await callSetup(page, 'setup.ExorcismQuestStage.REFERRED');
      expect(stage).toBe(referred);
      /* Amulet handed over with the book. */
      expect(await getVar(page, 'amulet')).not.toBeUndefined();
    });
  });

  test.describe('Phase 4 — Summoning ritual at REFERRED stage', () => {
    test('Phase 4a — Bedroom offers the "Summon the ghost" entry once REFERRED is live', async ({ game: page }) => {
      await primeSummoningContext(page,
        await callSetup(page, 'setup.ExorcismQuestStage.REFERRED'));
      await setVar(page, 'exorcism', 0);
      await setVar(page, 'hours', 14);

      expect(await callSetup(page, 'setup.Home.canSummonForExorcism()')).toBe(true);

      await goToPassage(page, 'Bedroom');
      await expectCleanPassage(page);
      const link = page.locator('.passage a').filter({ hasText: 'Summon the ghost' });
      await expect(link).toBeVisible();
      await link.click();
      await page.waitForFunction(() => SugarCube.State.passage === 'Summoning');
      await expectCleanPassage(page);
    });

    test('Phase 4b — SummoningStart in REFERRED renders the succubus deal with Agree + Disagree', async ({ game: page }) => {
      await primeSummoningContext(page,
        await callSetup(page, 'setup.ExorcismQuestStage.REFERRED'));

      await goToPassage(page, 'SummoningStart');
      await expectCleanPassage(page);
      const passage = page.locator('.passage');
      await expect(passage.getByText(/the succubus emerges/i)).toBeVisible();
      await expect(passage.getByRole('link', { name: 'Agree', exact: true })).toBeVisible();
      await expect(passage.getByRole('link', { name: 'Disagree', exact: true })).toBeVisible();
    });

    test('Phase 4c — Agree advances state to SUCCUBUS_SUMMONED + seeds the 5-day timer', async ({ game: page }) => {
      await primeSummoningContext(page,
        await callSetup(page, 'setup.ExorcismQuestStage.REFERRED'));
      await goToPassage(page, 'SummoningStart');

      await page.locator('.passage')
        .getByRole('link', { name: 'Agree', exact: true })
        .click();
      expect(await callSetup(page, 'setup.Home.succubusEventTimer()')).toBe(5);

      await page.locator('.passage a').filter({ hasText: 'Back' }).first().click();
      await page.waitForFunction(() => SugarCube.State.passage === 'Bedroom');
      await expectCleanPassage(page);

      expect(await getVar(page, 'succubus')).toBe(2);
      const summoned = await callSetup(page, 'setup.ExorcismQuestStage.SUCCUBUS_SUMMONED');
      expect(await callSetup(page, 'setup.Witch.exorcismQuestStage()')).toBe(summoned);
    });

    test('Phase 4d — Disagree leaves the state at REFERRED with no succubus binding', async ({ game: page }) => {
      await primeSummoningContext(page,
        await callSetup(page, 'setup.ExorcismQuestStage.REFERRED'));
      await goToPassage(page, 'SummoningStart');

      await page.locator('.passage')
        .getByRole('link', { name: 'Disagree', exact: true })
        .click();
      await page.locator('.passage a').filter({ hasText: 'Back' }).first().click();
      await page.waitForFunction(() => SugarCube.State.passage === 'Bedroom');
      await expectCleanPassage(page);

      expect(await getVar(page, 'succubus')).toBeUndefined();
      expect(await callSetup(page, 'setup.Home.succubusEventTimer()')).toBeUndefined();
      const referred = await callSetup(page, 'setup.ExorcismQuestStage.REFERRED');
      expect(await callSetup(page, 'setup.Witch.exorcismQuestStage()')).toBe(referred);
    });
  });

  test.describe('Phase 5 — Re-summon choice menu at SUCCUBUS_SUMMONED stage', () => {
    test('Phase 5a — SummoningStart now renders the four-choice succubus menu', async ({ game: page }) => {
      await primeSummoningContext(page,
        await callSetup(page, 'setup.ExorcismQuestStage.SUCCUBUS_SUMMONED'));
      await setVar(page, 'succubus', 2);

      await goToPassage(page, 'SummoningStart');
      await expectCleanPassage(page);

      const passage = page.locator('.passage');
      await expect(passage.getByText(/Change your body temporarily/i)).toBeVisible();
      await expect(passage.getByText(/Possess you/i)).toBeVisible();
      await expect(passage.getByText(/Strapon fuck/i)).toBeVisible();
      await expect(passage.getByText(/Something unusual/i)).toBeVisible();
    });

    test('Phase 5b — each choice links to SuccubusChoice with summoningChoice 1-4 stamped', async ({ game: page }) => {
      for (const [label, expected] of [
        ['Change your body temporarily', 1],
        ['Possess you', 2],
        ['Strapon fuck', 3],
        ['Something unusual', 4],
      ]) {
        await primeSummoningContext(page,
          await callSetup(page, 'setup.ExorcismQuestStage.SUCCUBUS_SUMMONED'));
        await setVar(page, 'succubus', 2);
        await goToPassage(page, 'SummoningStart');

        await page.locator('.passage a')
          .filter({ hasText: label })
          .first()
          .click();
        await page.waitForFunction(() =>
          SugarCube.State.passage === 'SuccubusChoice'
        );
        await expectCleanPassage(page);

        const choice = await callSetup(page, 'setup.Home.summoningChoice()');
        expect(choice).toBe(expected);
      }
    });
  });

  test.describe('Phase 6 — Hunt-event protection passage', () => {
    test('HuntEventSuccubus is reachable and renders cleanly', async ({ game: page }) => {
      /* The hunt-event passage is the in-hunt receipt of the timer the
         summon-Agree branch seeded. We just confirm it renders cleanly
         given a typical post-summoning context. */
      await primeSummoningContext(page,
        await callSetup(page, 'setup.ExorcismQuestStage.SUCCUBUS_SUMMONED'));
      await setVar(page, 'succubus', 2);
      await page.evaluate(() => {
        SugarCube.State.variables.succubusEvent = { eventTimer: 5 };
      });

      await goToPassage(page, 'HuntEventSuccubus');
      await expectCleanPassage(page);
    });
  });
});
