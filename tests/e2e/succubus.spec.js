/*
 * End-to-end coverage for the succubus storyline.
 *
 * The succubus feature has three distinct stages and several
 * cross-controller hooks. Each describe block exercises one slice:
 *
 *   1. Door-knock arrival (Livingroom).            succubus -> 1
 *   2. SuccubusEventTV / SuccubusPCEvent ambient events while she
 *      is hanging around the house and not yet bound by the
 *      summoning ritual.
 *   3. Witch referral + SummoningStart "Agree"/"Disagree" branches.
 *      Agree path advances exorcismQuestStage to SUCCUBUS_SUMMONED,
 *      bumps succubus to 2, and seeds the 5-day eventTimer.
 *   4. Re-summoning (SuccubusChoice) once SUCCUBUS_SUMMONED.
 *   5. HuntEventSuccubus availability during ghost prowls while the
 *      eventTimer is active.
 *   6. Daily Tick maintenance: eventCD cycle and eventTimer decay.
 *
 * Regression: setup.Witch.setSuccubusVisited(v) was missing from the
 * controller API, so both markSuccubusArrived (door knock) and the
 * SummoningStart "Agree" back-link threw "bad evaluation". Tests in
 * this file exercise both call paths to keep that regression caught.
 */
const { test, expect } = require('../fixtures');
const { setVar, getVar, callSetup, goToPassage } = require('../helpers');
const { expectCleanPassage } = require('./e2e-helpers');

test.describe('Succubus — setter contract', () => {
  test('setSuccubusVisited(1) writes $succubus and flips succubusVisited', async ({ game: page }) => {
    await page.evaluate(() => { delete SugarCube.State.variables.succubus; });
    expect(await callSetup(page, 'setup.Witch.succubusVisited()')).toBe(false);
    expect(await callSetup(page, 'setup.Witch.hasSuccubusEncounter()')).toBe(false);

    await page.evaluate(() => SugarCube.setup.Witch.setSuccubusVisited(1));

    expect(await getVar(page, 'succubus')).toBe(1);
    expect(await callSetup(page, 'setup.Witch.succubusVisited()')).toBe(true);
    expect(await callSetup(page, 'setup.Witch.hasSuccubusEncounter()')).toBe(true);
  });

  test('setSuccubusVisited(2) leaves succubusVisited false but keeps encounter true', async ({ game: page }) => {
    // Stage 2 represents "she has been summoned and bound" -- the
    // post-knock TV/PC event predicate (succubusVisited) should stop
    // firing on its own, while gating predicates that only care about
    // "has she been encountered" (succubusCanKnock, eventTimer-aware
    // hunt option) stay true / use other flags.
    await page.evaluate(() => SugarCube.setup.Witch.setSuccubusVisited(2));

    expect(await getVar(page, 'succubus')).toBe(2);
    expect(await callSetup(page, 'setup.Witch.succubusVisited()')).toBe(false);
    expect(await callSetup(page, 'setup.Witch.hasSuccubusEncounter()')).toBe(true);
  });

  test('markSuccubusArrived routes through setSuccubusVisited(1)', async ({ game: page }) => {
    // HomeController calls setup.Witch.setSuccubusVisited(1) -- before
    // the setter existed this threw "bad evaluation".
    await page.evaluate(() => { delete SugarCube.State.variables.succubus; });
    await page.evaluate(() => SugarCube.setup.Home.markSuccubusArrived());

    expect(await getVar(page, 'succubus')).toBe(1);
    expect(await callSetup(page, 'setup.Witch.succubusVisited()')).toBe(true);
  });
});

test.describe('Succubus — door knock arrival', () => {
  test('succubusCanKnock requires evening hours, corruption, and no prior encounter', async ({ game: page }) => {
    await page.evaluate(() => { delete SugarCube.State.variables.succubus; });
    await setVar(page, 'mc.corruption', 6);

    await setVar(page, 'hours', 17);
    expect(await callSetup(page, 'setup.Home.succubusCanKnock()')).toBe(false);
    await setVar(page, 'hours', 18);
    expect(await callSetup(page, 'setup.Home.succubusCanKnock()')).toBe(true);
    await setVar(page, 'hours', 20);
    expect(await callSetup(page, 'setup.Home.succubusCanKnock()')).toBe(true);
    await setVar(page, 'hours', 21);
    expect(await callSetup(page, 'setup.Home.succubusCanKnock()')).toBe(false);
  });

  test('succubusCanKnock false once succubus var is defined at any stage', async ({ game: page }) => {
    await setVar(page, 'hours', 19);
    await setVar(page, 'mc.corruption', 6);

    await setVar(page, 'succubus', 1);
    expect(await callSetup(page, 'setup.Home.succubusCanKnock()')).toBe(false);
    await setVar(page, 'succubus', 2);
    expect(await callSetup(page, 'setup.Home.succubusCanKnock()')).toBe(false);
  });

  test('Livingroom shows the knock link when the gate opens', async ({ game: page }) => {
    await page.evaluate(() => { delete SugarCube.State.variables.succubus; });
    await setVar(page, 'hours', 19);
    await setVar(page, 'mc.corruption', 6);

    await goToPassage(page, 'Livingroom');
    await expectCleanPassage(page);

    const knockLink = page.locator('.passage').getByText(/knocking on the door/i);
    await expect(knockLink).toBeVisible();
  });

  test('clicking the knock link marks succubus arrival without console errors', async ({ game: page }) => {
    await page.evaluate(() => { delete SugarCube.State.variables.succubus; });
    await setVar(page, 'hours', 19);
    await setVar(page, 'mc.corruption', 6);

    await goToPassage(page, 'Livingroom');
    await page.locator('.passage')
      .getByText(/knocking on the door/i)
      .first()
      .click();

    await expectCleanPassage(page);
    expect(await getVar(page, 'succubus')).toBe(1);
    expect(await callSetup(page, 'setup.Witch.succubusVisited()')).toBe(true);
  });
});

test.describe('Succubus — ambient TV event', () => {
  test('succubusTVEventReady requires stage 1 + eventCD 0 + evening', async ({ game: page }) => {
    await setVar(page, 'succubus', 1);
    await page.evaluate(() => {
      SugarCube.State.variables.succubusEvent = { eventCD: 0 };
    });
    await setVar(page, 'hours', 19);
    expect(await callSetup(page, 'setup.Home.succubusTVEventReady()')).toBe(true);

    await setVar(page, 'hours', 17);
    expect(await callSetup(page, 'setup.Home.succubusTVEventReady()')).toBe(false);

    await setVar(page, 'hours', 19);
    await page.evaluate(() => { SugarCube.State.variables.succubusEvent.eventCD = 1; });
    expect(await callSetup(page, 'setup.Home.succubusTVEventReady()')).toBe(false);

    await page.evaluate(() => { SugarCube.State.variables.succubusEvent.eventCD = 0; });
    await setVar(page, 'succubus', 2);
    expect(await callSetup(page, 'setup.Home.succubusTVEventReady()')).toBe(false);
  });

  test('SuccubusEventTV passage renders and bumps eventCD to 1', async ({ game: page }) => {
    await setVar(page, 'succubus', 1);
    await page.evaluate(() => {
      SugarCube.State.variables.succubusEvent = { eventCD: 0 };
    });
    await setVar(page, 'hours', 19);
    await goToPassage(page, 'SuccubusEventTV');
    await expectCleanPassage(page);
    expect(await callSetup(page, 'setup.Home.succubusEventCD()')).toBe(1);
  });

  test('Watching TV in Livingroom routes to SuccubusEventTV when ready', async ({ game: page }) => {
    await setVar(page, 'succubus', 1);
    await page.evaluate(() => {
      SugarCube.State.variables.succubusEvent = { eventCD: 0 };
    });
    await setVar(page, 'hours', 19);
    await goToPassage(page, 'Livingroom');
    await page.locator('.passage').getByText(/Watch tv/i).first().click();
    await page.waitForFunction(
      () => SugarCube.State.passage === 'SuccubusEventTV'
    );
    await expectCleanPassage(page);
  });
});

test.describe('Succubus — ambient PC event', () => {
  test('isSuccubusPCEventReady true when stage 1 and eventCD 0', async ({ game: page }) => {
    await setVar(page, 'succubus', 1);
    await page.evaluate(() => {
      SugarCube.State.variables.succubusEvent = { eventCD: 0 };
    });
    expect(await callSetup(page, 'setup.Home.isSuccubusPCEventReady()')).toBe(true);
  });

  test('isSuccubusPCEventReady fires on eventCD 2 at evening even post-summoning', async ({ game: page }) => {
    // The second branch of isSuccubusPCEventReady stays open after the
    // succubus has been summoned (succubus = 2) so the PC dream
    // sequence can resume mid-arc.
    await setVar(page, 'succubus', 2);
    await page.evaluate(() => {
      SugarCube.State.variables.succubusEvent = { eventCD: 2 };
    });
    await setVar(page, 'hours', 20);
    expect(await callSetup(page, 'setup.Home.isSuccubusPCEventReady()')).toBe(true);

    await setVar(page, 'hours', 10);
    expect(await callSetup(page, 'setup.Home.isSuccubusPCEventReady()')).toBe(false);
  });

  test('bumpSuccubusPCEventStage increments pcStage from undefined to 1', async ({ game: page }) => {
    await page.evaluate(() => {
      SugarCube.State.variables.succubusEvent = {};
    });
    await page.evaluate(() => SugarCube.setup.Home.bumpSuccubusPCEventStage());
    expect(await callSetup(page, 'setup.Home.succubusPCEventStage()')).toBe(1);
    await page.evaluate(() => SugarCube.setup.Home.bumpSuccubusPCEventStage());
    expect(await callSetup(page, 'setup.Home.succubusPCEventStage()')).toBe(2);
  });

  test('SuccubusPCEvent passage renders cleanly', async ({ game: page }) => {
    await setVar(page, 'succubus', 1);
    await page.evaluate(() => {
      SugarCube.State.variables.succubusEvent = { eventCD: 0 };
    });
    await goToPassage(page, 'SuccubusPCEvent');
    await expectCleanPassage(page);
    expect(await callSetup(page, 'setup.Home.succubusPCEventStage()')).toBe(0);
  });
});

test.describe('Succubus — summoning ritual (Witch referral path)', () => {
  async function primeSummoningContext(page) {
    // Drop all the "another summon path" guards so SummoningStart routes
    // straight to the succubus branch (exorcismQuestStage === REFERRED).
    await page.evaluate(() => {
      const V = SugarCube.State.variables;
      V.ghostSpecialEventSpirit = 1;
      V.twinsEventActive = 0;
      V.ghostMareEventStart = 0;
      V.exorcismQuestStage = SugarCube.setup.ExorcismQuestStage.REFERRED;
      delete V.gotCursedItem;
      V.succubusEvent = {};
      delete V.succubus;
    });
  }

  test('SummoningStart renders the succubus deal at exorcismQuestStage REFERRED', async ({ game: page }) => {
    await primeSummoningContext(page);
    await goToPassage(page, 'SummoningStart');
    await expectCleanPassage(page);

    const passage = page.locator('.passage');
    await expect(passage.getByText(/the succubus emerges/i)).toBeVisible();
    await expect(passage.getByRole('link', { name: 'Agree', exact: true })).toBeVisible();
    await expect(passage.getByRole('link', { name: 'Disagree', exact: true })).toBeVisible();
  });

  test('Agree branch survives the back-link without "setSuccubusVisited is not a function"', async ({ game: page }) => {
    // Regression: the back-link evaluates
    //   setup.Witch.markSuccubusSummoned(); setup.Witch.setSuccubusVisited(2)
    // which used to throw because the setter was missing.
    await primeSummoningContext(page);
    await goToPassage(page, 'SummoningStart');
    await page.locator('.passage')
      .getByRole('link', { name: 'Agree', exact: true })
      .click();

    // After Agree: the eventTimer is seeded, then the Back link
    // returns to Bedroom and stamps the post-summoning state.
    expect(await callSetup(page, 'setup.Home.succubusEventTimer()')).toBe(5);

    await page.locator('.passage a').filter({ hasText: 'Back' }).first().click();
    await page.waitForFunction(() => SugarCube.State.passage === 'Bedroom');

    await expectCleanPassage(page);
    expect(await getVar(page, 'succubus')).toBe(2);
    expect(await callSetup(page, 'setup.Witch.exorcismQuestStage()'))
      .toBe(await callSetup(page, 'setup.ExorcismQuestStage.SUCCUBUS_SUMMONED'));
  });

  test('Disagree branch returns to Bedroom without binding the succubus', async ({ game: page }) => {
    await primeSummoningContext(page);
    await goToPassage(page, 'SummoningStart');
    await page.locator('.passage')
      .getByRole('link', { name: 'Disagree', exact: true })
      .click();
    await page.locator('.passage a').filter({ hasText: 'Back' }).first().click();
    await page.waitForFunction(() => SugarCube.State.passage === 'Bedroom');

    await expectCleanPassage(page);
    // Neither flag should advance on the disagree branch.
    expect(await getVar(page, 'succubus')).toBeUndefined();
    expect(await callSetup(page, 'setup.Home.succubusEventTimer()')).toBeUndefined();
    expect(await callSetup(page, 'setup.Witch.exorcismQuestStage()'))
      .toBe(await callSetup(page, 'setup.ExorcismQuestStage.REFERRED'));
  });
});

test.describe('Succubus — re-summon menu (post-binding)', () => {
  async function primeSummonedContext(page) {
    await page.evaluate(() => {
      const V = SugarCube.State.variables;
      V.ghostSpecialEventSpirit = 1;
      V.twinsEventActive = 0;
      V.ghostMareEventStart = 0;
      V.exorcismQuestStage = SugarCube.setup.ExorcismQuestStage.SUCCUBUS_SUMMONED;
      delete V.gotCursedItem;
      V.succubus = 2;
      V.summoning = {};
    });
  }

  test('SummoningStart in SUCCUBUS_SUMMONED stage offers the four choices', async ({ game: page }) => {
    await primeSummonedContext(page);
    await goToPassage(page, 'SummoningStart');
    await expectCleanPassage(page);

    const passage = page.locator('.passage');
    await expect(passage.getByText(/Change your body temporarily/i)).toBeVisible();
    await expect(passage.getByText(/Possess you/i)).toBeVisible();
    await expect(passage.getByText(/Strapon fuck/i)).toBeVisible();
    await expect(passage.getByText(/Something unusual/i)).toBeVisible();
  });

  test('setSummoningChoice stores the chosen branch and SuccubusChoice renders it', async ({ game: page }) => {
    for (const choice of [1, 2, 3, 4]) {
      await primeSummonedContext(page);
      await page.evaluate(
        (c) => SugarCube.setup.Home.setSummoningChoice(c),
        choice
      );
      expect(await callSetup(page, 'setup.Home.summoningChoice()')).toBe(choice);

      await goToPassage(page, 'SuccubusChoice');
      await expectCleanPassage(page);
    }
  });

  test('advanceSummoning resets the eventTimer to 6 and skips ~4 hours', async ({ game: page }) => {
    await primeSummonedContext(page);
    await setVar(page, 'hours', 10);
    await setVar(page, 'minutes', 0);

    const rolled = await page.evaluate(() => SugarCube.setup.Home.advanceSummoning());

    expect(await callSetup(page, 'setup.Home.succubusEventTimer()')).toBe(6);
    expect(await getVar(page, 'hours')).toBe(14);
    expect(rolled).toBe(false);
  });

  test('SuccubusChoice back-link sets the bedroom wake-up banner via setSuccubusChoiceText', async ({ game: page }) => {
    // The "Pass out" back-link inside each branch fires
    //   setup.Home.setSuccubusChoiceText(<1|2>)
    // which Bedroom reads on entry and then clears.
    await page.evaluate(() => SugarCube.setup.Home.setSuccubusChoiceText(1));
    expect(await callSetup(page, 'setup.Home.succubusChoiceText()')).toBe(1);

    await page.evaluate(() => SugarCube.setup.Home.clearSuccubusChoiceText());
    expect(await callSetup(page, 'setup.Home.succubusChoiceText()')).toBeUndefined();
  });
});

test.describe('Succubus — TV wake-up banner', () => {
  test('setSuccubusTVText / clearSuccubusTVText round-trips through the bundle', async ({ game: page }) => {
    await page.evaluate(() => SugarCube.setup.Home.setSuccubusTVText(1));
    expect(await callSetup(page, 'setup.Home.succubusTVText()')).toBe(1);
    await page.evaluate(() => SugarCube.setup.Home.clearSuccubusTVText());
    expect(await callSetup(page, 'setup.Home.succubusTVText()')).toBeUndefined();
  });

  test('Bedroom clears the TV banner after rendering it once', async ({ game: page }) => {
    await page.evaluate(() => SugarCube.setup.Home.setSuccubusTVText(1));
    await goToPassage(page, 'Bedroom');
    await expectCleanPassage(page);
    expect(await callSetup(page, 'setup.Home.succubusTVText()')).toBeUndefined();
  });
});

test.describe('Succubus — hunt-event protection', () => {
  test('HauntedHouses.succubusEventTimer mirrors Home.succubusEventTimer', async ({ game: page }) => {
    await page.evaluate(() => {
      SugarCube.State.variables.succubusEvent = { eventTimer: 4 };
    });
    expect(await callSetup(page, 'setup.HauntedHouses.succubusEventTimer()')).toBe(4);
  });

  test('HauntedHouses.succubusEventTimer falls back to 0 when bundle is empty', async ({ game: page }) => {
    await page.evaluate(() => { SugarCube.State.variables.succubusEvent = {}; });
    expect(await callSetup(page, 'setup.HauntedHouses.succubusEventTimer()')).toBe(0);
  });

  test('HuntEventSuccubus passage renders without errors', async ({ game: page }) => {
    await setVar(page, 'return', 'HuntRun');
    await goToPassage(page, 'HuntEventSuccubus');
    await expectCleanPassage(page);
  });
});

test.describe('Succubus — daily tick maintenance', () => {
  test('Tick.resetCooldowns cycles eventCD 1 → 2 → 0 while succubus stage is 1', async ({ game: page }) => {
    await setVar(page, 'succubus', 1);
    await page.evaluate(() => {
      SugarCube.State.variables.succubusEvent = { eventCD: 1 };
    });

    await page.evaluate(() => SugarCube.setup.Tick.resetCooldowns());
    expect(await callSetup(page, 'setup.Home.succubusEventCD()')).toBe(2);

    await page.evaluate(() => SugarCube.setup.Tick.resetCooldowns());
    expect(await callSetup(page, 'setup.Home.succubusEventCD()')).toBe(0);
  });

  test('Tick.resetCooldowns leaves eventCD at 0 (no cycle until event fires)', async ({ game: page }) => {
    await setVar(page, 'succubus', 1);
    await page.evaluate(() => {
      SugarCube.State.variables.succubusEvent = { eventCD: 0 };
    });
    await page.evaluate(() => SugarCube.setup.Tick.resetCooldowns());
    expect(await callSetup(page, 'setup.Home.succubusEventCD()')).toBe(0);
  });

  test('Tick.resetCooldowns decrements eventTimer at SUCCUBUS_SUMMONED stage', async ({ game: page }) => {
    await page.evaluate(() => {
      const V = SugarCube.State.variables;
      V.exorcismQuestStage = SugarCube.setup.ExorcismQuestStage.SUCCUBUS_SUMMONED;
      V.succubusEvent = { eventTimer: 3 };
    });
    await page.evaluate(() => SugarCube.setup.Tick.resetCooldowns());
    expect(await callSetup(page, 'setup.Home.succubusEventTimer()')).toBe(2);

    await page.evaluate(() => SugarCube.setup.Tick.resetCooldowns());
    expect(await callSetup(page, 'setup.Home.succubusEventTimer()')).toBe(1);

    await page.evaluate(() => SugarCube.setup.Tick.resetCooldowns());
    expect(await callSetup(page, 'setup.Home.succubusEventTimer()')).toBe(0);

    // Floor at 0 -- daily tick should not push it negative.
    await page.evaluate(() => SugarCube.setup.Tick.resetCooldowns());
    expect(await callSetup(page, 'setup.Home.succubusEventTimer()')).toBe(0);
  });

  test('eventTimer does not decrement while still in REFERRED stage', async ({ game: page }) => {
    // REFERRED means the witch has handed off the quest but the player
    // hasn't actually completed the summoning ritual yet. The timer
    // shouldn't decay because there is no protection to tick down.
    await page.evaluate(() => {
      const V = SugarCube.State.variables;
      V.exorcismQuestStage = SugarCube.setup.ExorcismQuestStage.REFERRED;
      V.succubusEvent = { eventTimer: 5 };
    });
    await page.evaluate(() => SugarCube.setup.Tick.resetCooldowns());
    expect(await callSetup(page, 'setup.Home.succubusEventTimer()')).toBe(5);
  });
});

test.describe('Succubus — save migration backfill', () => {
  test('ensureSuccubusCooldown seeds eventCD when succubus is defined', async ({ game: page }) => {
    await setVar(page, 'succubus', 1);
    await page.evaluate(() => {
      SugarCube.State.variables.succubusEvent = {};
      delete SugarCube.State.variables.succubusEvent.eventCD;
    });
    await page.evaluate(() => SugarCube.setup.Migrations.ensureSuccubusCooldown());
    expect(await callSetup(page, 'setup.Home.succubusEventCD()')).toBe(0);
  });

  test('ensureSuccubusCooldown is a no-op for fresh games (no encounter yet)', async ({ game: page }) => {
    await page.evaluate(() => {
      delete SugarCube.State.variables.succubus;
      SugarCube.State.variables.succubusEvent = {};
    });
    await page.evaluate(() => SugarCube.setup.Migrations.ensureSuccubusCooldown());
    expect(await callSetup(page, 'setup.Home.succubusEventCD()')).toBeUndefined();
  });
});
