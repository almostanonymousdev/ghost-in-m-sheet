const { test, expect } = require('../fixtures');
const { setVar, getVar, setHuntMode, getHuntMode, callSetup, goToPassage, openGame } = require('../helpers');
const { expectCleanPassage, setupHunt } = require('./e2e-helpers');

const COMPANIONS = [
  { name: 'Alice', passages: ['AliceHelp', 'AliceInfo', 'AliceContinue', 'AliceHuntEndAlone'] },
  { name: 'Blake', passages: ['BlakeHelp', 'BlakeInfo', 'BlakeContinue', 'BlakeHuntEndAlone'] },
  { name: 'Brook', passages: ['BrookHelp', 'BrookInfo', 'BrookHuntEndAlone'] },
];

const TRANS_COMPANIONS = ['Alex', 'Taylor', 'Casey'];
const ALL_COMPANIONS = ['Brook', 'Alice', 'Blake', 'Alex', 'Taylor', 'Casey'];

async function selectCompanion(page, name) {
  // Force defaults for $brook/$alice/$blake/$alex/$taylor/$casey before
  // selectCompanion runs. PassageReady normally seeds these via
  // applySaveDefaults, but order of operations after Engine.restart() can
  // leave a window where the store still holds undefined for some slots —
  // tests that touch every companion's `chanceToAttack` then fail with
  // "Cannot set properties of undefined". Calling applySaveDefaults
  // explicitly makes that deterministic and removes the need for retries.
  await page.evaluate(() => {
    if (SugarCube.setup.applySaveDefaults) {
      SugarCube.setup.applySaveDefaults(SugarCube.State.variables);
    }
  });
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
  test('selectCompanion is mutually exclusive across all six names', async ({ game: page }) => {
    for (const name of ['Alice', 'Blake', 'Brook', 'Alex', 'Taylor', 'Casey']) {
      await page.evaluate((n) => SugarCube.setup.Companion.selectCompanion(n), name);
      expect(await getVar(page, name.toLowerCase() + '.chosen')).toBe(1);
      for (const other of ['Alice', 'Blake', 'Brook', 'Alex', 'Taylor', 'Casey']) {
        if (other !== name) expect(await getVar(page, other.toLowerCase() + '.chosen')).toBe(0);
      }
    }
  });

  test('isTransCompanion detects Alex/Taylor/Casey only', async ({ game: page }) => {
    for (const name of TRANS_COMPANIONS) {
      await setVar(page, 'companion', { name });
      expect(await callSetup(page, 'setup.Companion.isTransCompanion()')).toBe(true);
    }
    for (const name of ['Alice', 'Blake', 'Brook']) {
      await setVar(page, 'companion', { name });
      expect(await callSetup(page, 'setup.Companion.isTransCompanion()')).toBe(false);
    }
  });

  test('sanityTier breaks at 75/50/25', async ({ game: page }) => {
    await setVar(page, 'companion', { sanity: 80 });
    expect(await callSetup(page, 'setup.Companion.sanityTier()')).toBe('high');
    await setVar(page, 'companion', { sanity: 60 });
    expect(await callSetup(page, 'setup.Companion.sanityTier()')).toBe('mid');
    await setVar(page, 'companion', { sanity: 40 });
    expect(await callSetup(page, 'setup.Companion.sanityTier()')).toBe('low');
    await setVar(page, 'companion', { sanity: 10 });
    expect(await callSetup(page, 'setup.Companion.sanityTier()')).toBe('critical');
  });

  test('isLustHigh triggers at lust >= 50', async ({ game: page }) => {
    await setVar(page, 'companion', { lust: 49 });
    expect(await callSetup(page, 'setup.Companion.isLustHigh()')).toBe(false);
    await setVar(page, 'companion', { lust: 50 });
    expect(await callSetup(page, 'setup.Companion.isLustHigh()')).toBe(true);
  });
});

test.describe('Companions — passage rendering', () => {
  // These passages pull in heavy <<do>>/<<redo>> blocks and a long chain of
  // conditional branches. Under parallel worker load the default 5s can
  // be tight, so give this describe's tests a 15s budget. Media requests
  // are blocked in openGame() so videos/images don't compete for bandwidth.
  test.describe.configure({ timeout: 15_000 });
  for (const { name, passages } of COMPANIONS) {
    for (const passage of passages) {
      test(`${name} — ${passage} renders cleanly`, async ({ game: page }) => {
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
    test(`${name}Info post-solo-return link renders substituted text`, async ({ game: page }) => {
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
    test(`CompanionMain renders cleanly for ${name}`, async ({ game: page }) => {
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
  test('canShowCompanionMiniPanel requires chosenPlan + hunt mode + active hunt', async ({ game: page }) => {
    await setVar(page, 'chosenPlan', 'Plan1');
    await setHuntMode(page, 2);
    await page.evaluate(() =>
      SugarCube.setup.HuntController.startHunt({ seed: 1, staticHouseId: 'owaissa' }));
    expect(await callSetup(page, 'setup.Companion.canShowCompanionMiniPanel()')).toBe(true);

    await page.evaluate(() => SugarCube.setup.HuntController.end());
    expect(await callSetup(page, 'setup.Companion.canShowCompanionMiniPanel()')).toBe(false);

    await page.evaluate(() =>
      SugarCube.setup.HuntController.startHunt({ seed: 1, staticHouseId: 'elm' }));
    expect(await callSetup(page, 'setup.Companion.canShowCompanionMiniPanel()')).toBe(true);

    await setHuntMode(page, 0);
    expect(await callSetup(page, 'setup.Companion.canShowCompanionMiniPanel()')).toBe(false);
  });

  test('companionAtStreet excludes Plan1–Plan4 (those keep the companion inside)', async ({ game: page }) => {
    await setVar(page, 'isCompChosen', 1);
    for (const plan of ['Plan1', 'Plan2', 'Plan3', 'Plan4']) {
      await setVar(page, 'chosenPlan', plan);
      expect(await callSetup(page, 'setup.Companion.companionAtStreet()')).toBe(false);
    }
    await setVar(page, 'chosenPlan', 'PlanX');
    expect(await callSetup(page, 'setup.Companion.companionAtStreet()')).toBe(true);
  });

  test('canWalkHomeWithCompanion requires any bottom worn', async ({ game: page }) => {
    await setVar(page, 'jeansState', 'not worn');
    await setVar(page, 'skirtState', 'not bought');
    await setVar(page, 'shortsState', 'not bought');
    expect(await callSetup(page, 'setup.Companion.canWalkHomeWithCompanion()')).toBe(false);
    await setVar(page, 'shortsState', 'worn');
    expect(await callSetup(page, 'setup.Companion.canWalkHomeWithCompanion()')).toBe(true);
  });

  test('giveSanityPill raises companion sanity and decrements pills', async ({ game: page }) => {
    await setVar(page, 'sanityPillsAmount', 2);
    await setVar(page, 'companion', { name: 'Alice', sanity: 40 });
    const used = await page.evaluate(() => SugarCube.setup.Companion.giveSanityPill());
    expect(used).toBe(true);
    expect(await getVar(page, 'sanityPillsAmount')).toBe(1);
    expect(await getVar(page, 'companion.sanity')).toBe(70);
  });

  test('giveSanityPill clamps companion sanity at 100', async ({ game: page }) => {
    await setVar(page, 'sanityPillsAmount', 1);
    await setVar(page, 'companion', { name: 'Alice', sanity: 85 });
    await page.evaluate(() => SugarCube.setup.Companion.giveSanityPill());
    expect(await getVar(page, 'companion.sanity')).toBe(100);
  });

  test('giveSanityPill returns false when no pills remain', async ({ game: page }) => {
    await setVar(page, 'sanityPillsAmount', 0);
    await setVar(page, 'companion', { name: 'Alice', sanity: 50 });
    const used = await page.evaluate(() => SugarCube.setup.Companion.giveSanityPill());
    expect(used).toBe(false);
  });

  test('giveSanityPill returns false when companion is already at full sanity', async ({ game: page }) => {
    await setVar(page, 'sanityPillsAmount', 3);
    await setVar(page, 'companion', { name: 'Alice', sanity: 100 });
    const used = await page.evaluate(() => SugarCube.setup.Companion.giveSanityPill());
    expect(used).toBe(false);
    expect(await getVar(page, 'sanityPillsAmount')).toBe(3);
  });

  test('canAffordSoloContract and payForSoloContract integrate correctly', async ({ game: page }) => {
    await setVar(page, 'mc.money', 19);
    expect(await callSetup(page, 'setup.Companion.canAffordSoloContract()')).toBe(false);
    await setVar(page, 'mc.money', 20);
    expect(await callSetup(page, 'setup.Companion.canAffordSoloContract()')).toBe(true);
    await page.evaluate(() => SugarCube.setup.Companion.payForSoloContract('Alice'));
    expect(await getVar(page, 'mc.money')).toBe(0);
    expect(await getVar(page, 'alice.paidForSolo')).toBe(1);
  });

  test('blakeDropsCursedItem only fires when Blake + chosen + cursed item', async ({ game: page }) => {
    await setVar(page, 'companion', { name: 'Blake' });
    await setVar(page, 'isCompChosen', 1);
    await setVar(page, 'gotCursedItem', 1);
    expect(await callSetup(page, 'setup.Companion.blakeDropsCursedItem()')).toBe(true);
    await page.evaluate(() => SugarCube.setup.Companion.clearBlakeCursedItem());
    expect(await getVar(page, 'gotCursedItem')).toBe(0);
  });

  test('resetHuntState zeroes plan/flags for clean post-hunt state', async ({ game: page }) => {
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
  test('WalkHomeTogether renders cleanly for Brook with high lust', async ({ game: page }) => {
    await selectCompanion(page, 'Brook');
    await setVar(page, 'companion.lust', 80);
    await setupHunt(page, 'Shade');
    await goToPassage(page, 'WalkHomeTogether');
    await expectCleanPassage(page);
  });

  test('WalkHomeTogether routes to GhostSpecialEventSpirit for a Spirit ghost', async ({ game: page }) => {
    await selectCompanion(page, 'Alice');
    await setupHunt(page, 'Spirit');
    await goToPassage(page, 'WalkHomeTogether');
    await expectCleanPassage(page);
    const text = await page.locator('#passages').innerText();
    expect(text).toContain('Sleep together');
  });

  for (const passage of [
    'CompanionEvent', 'CompanionLeaving', 'CompanionSucceeded',
    'CompanionFailed', 'CompanionResult',
  ]) {
    test(`${passage} renders cleanly`, async ({ game: page }) => {
      await selectCompanion(page, 'Alice');
      await page.evaluate(() =>
        SugarCube.setup.HuntController.startHunt({ seed: 1, staticHouseId: 'owaissa' }));
      await setVar(page, 'isCompRoomChosen', 0);
      await goToPassage(page, passage);
      await expectCleanPassage(page);
    });
  }

  test('pickRandomCompanionRoomFromContext picks a room without throwing', async ({ game: page }) => {
    await selectCompanion(page, 'Alice');
    await page.evaluate(() =>
      SugarCube.setup.HuntController.startHunt({ seed: 1, staticHouseId: 'owaissa' }));
    await setVar(page, 'isCompRoomChosen', 0);
    await callSetup(page, 'setup.Companion.pickRandomCompanionRoomFromContext()');
    expect(await getVar(page, 'isCompRoomChosen')).toBe(1);
  });
});

test.describe('Companions — hunt setup integration', () => {
  test('Active hunt with Alice chosen renders the mini panel', async ({ game: page }) => {
    await setupHunt(page, 'Shade');
    await selectCompanion(page, 'Alice');
    await setVar(page, 'isCompChosen', 1);
    await setVar(page, 'chosenPlan', 'Plan1');
    await goToPassage(page, 'HuntRun');
    await expectCleanPassage(page);
    expect(await callSetup(page, 'setup.Companion.canShowCompanionMiniPanel()')).toBe(true);
  });

  // Bridging regression: HuntController.startHunt needs to stamp the
  // legacy $hunt object so setup.Ghosts.isHunting() returns true during
  // a dynamic run. Without this the companion mini panel, the
  // walk-home gate, and the per-tick companion machinery all stay
  // dark — they all key off Ghosts.isHunting().
  test('HuntController.startHunt lights up Ghosts.isHunting()', async ({ game: page }) => {
    expect(await callSetup(page, 'setup.Ghosts.isHunting()')).toBe(false);
    await page.evaluate(() =>
      SugarCube.setup.HuntController.startHunt({ seed: 1, staticHouseId: 'owaissa' }));
    expect(await callSetup(page, 'setup.Ghosts.isHunting()')).toBe(true);
    expect(await getVar(page, 'hunt.mode')).toBe(2);
  });

  // endHunt teardown: zeroes the companion plan/showComp/isCompChosen
  // flags so the next contract starts from a clean slate.
  test('HuntController.endHunt clears companion plan/showComp/isCompChosen', async ({ game: page }) => {
    await selectCompanion(page, 'Alice');
    await page.evaluate(() =>
      SugarCube.setup.HuntController.startHunt({ seed: 1, staticHouseId: 'owaissa' }));
    await setVar(page, 'isCompChosen', 1);
    await setVar(page, 'chosenPlan', 'Plan1');
    await setVar(page, 'showComp', 1);
    await page.evaluate(() => SugarCube.setup.HuntController.endHunt(true));
    expect(await getVar(page, 'isCompChosen')).toBe(0);
    expect(await getVar(page, 'chosenPlan')).toBe(0);
    expect(await getVar(page, 'showComp')).toBe(0);
  });

  // Drive HuntStart through setupHunt() so the run is already active
  // when the passage renders -- this skips the in-passage auto-roll and
  // the per-test cross-pollution that occasionally trips startHunt's
  // applyMetaUnlocksAtStart on $mc fields.
  test('HuntStart shows the "Talk to <companion>" link for Owaissa', async ({ game: page }) => {
    await selectCompanion(page, 'Alice');
    await setupHunt(page, 'Shade', 'owaissa');
    await goToPassage(page, 'HuntStart');
    await expectCleanPassage(page);
    const text = await page.locator('#passages').innerText();
    expect(text).toContain('Talk to');
    expect(text).toContain('Alice is waiting');
  });

  test('HuntStart shows the "Talk to <companion>" link for Elm', async ({ game: page }) => {
    await selectCompanion(page, 'Brook');
    await setupHunt(page, 'Shade', 'elm');
    await goToPassage(page, 'HuntStart');
    await expectCleanPassage(page);
    const text = await page.locator('#passages').innerText();
    expect(text).toContain('Talk to');
  });

  test('HuntStart does NOT show the companion link for Ironclad (prison)', async ({ game: page }) => {
    await selectCompanion(page, 'Alice');
    await setupHunt(page, 'Shade', 'ironclad');
    await goToPassage(page, 'HuntStart');
    await expectCleanPassage(page);
    const text = await page.locator('#passages').innerText();
    expect(text).not.toContain('Talk to');
    expect(text).not.toContain('is waiting for you out front');
  });

  test('HuntStart shows the "Talk to <companion>" link for a procedural (random) hunt', async ({ game: page }) => {
    await selectCompanion(page, 'Alice');
    // Drive a procedural run (no staticHouseId) so the companion gate
    // is exercised on the random-house path.
    await page.evaluate(() => {
      SugarCube.setup.HuntController.startHunt({ seed: 1 });
      SugarCube.setup.HuntController.setField('ghostName', 'Shade');
      SugarCube.setup.Ghosts.startHunt('Shade');
      SugarCube.setup.Ghosts.setHuntMode(SugarCube.setup.Ghosts.HuntMode.ACTIVE);
    });
    await goToPassage(page, 'HuntStart');
    await expectCleanPassage(page);
    const text = await page.locator('#passages').innerText();
    expect(text).toContain('Talk to');
    expect(text).toContain('Alice is waiting');
  });

  // Auto-attach: entering HuntStart without clicking "Talk to" should
  // still flag the companion as joining the hunt + light up the HUD
  // card with Plan1 ("stick together"), so the player can re-assign
  // her later via the in-hunt companion icon.
  test('HuntStart auto-attaches the companion when player skips "Talk to"', async ({ game: page }) => {
    await selectCompanion(page, 'Alice');
    await setVar(page, 'isCompChosen', 0);
    await setVar(page, 'chosenPlan', 0);
    await setVar(page, 'showComp', 0);
    await setupHunt(page, 'Shade', 'owaissa');
    await goToPassage(page, 'HuntStart');
    expect(await getVar(page, 'isCompChosen')).toBe(1);
    expect(await getVar(page, 'chosenPlan')).toBe('Plan1');
    expect(await getVar(page, 'showComp')).toBe(1); // CompanionShow.VISIBLE
  });

  test('HuntStart auto-attach preserves a player-picked plan', async ({ game: page }) => {
    await selectCompanion(page, 'Alice');
    await setVar(page, 'isCompChosen', 1);
    await setVar(page, 'chosenPlan', 'Plan3');
    await setVar(page, 'showComp', 0);
    await setupHunt(page, 'Shade', 'owaissa');
    await goToPassage(page, 'HuntStart');
    expect(await getVar(page, 'chosenPlan')).toBe('Plan3');
  });

  // Procedural hunt: companion icon must render in the HuntRun toolbar
  // when the player enters the random house with a companion picked.
  test('HuntRun renders the companion card on a procedural hunt', async ({ game: page }) => {
    await selectCompanion(page, 'Alice');
    await page.evaluate(() => {
      SugarCube.setup.HuntController.startHunt({ seed: 1 });
      SugarCube.setup.HuntController.setField('ghostName', 'Shade');
      SugarCube.setup.Ghosts.startHunt('Shade');
      SugarCube.setup.Ghosts.setHuntMode(SugarCube.setup.Ghosts.HuntMode.ACTIVE);
    });
    await setVar(page, 'isCompChosen', 1);
    await setVar(page, 'chosenPlan', 'Plan1');
    await page.evaluate(() => {
      SugarCube.State.variables.showComp = SugarCube.setup.CompanionShow.VISIBLE;
    });
    await goToPassage(page, 'HuntRun');
    await expectCleanPassage(page);
    const link = page.locator('.hunt-run-companion a.companion-card-link');
    await expect(link).toHaveCount(1);
    expect(await link.getAttribute('data-passage')).toBe('CompanionMain');
  });

  test('HuntStart does NOT show the companion link with no companion selected', async ({ game: page }) => {
    await page.evaluate(() => SugarCube.setup.Companion.clearCompanionSelection());
    await setVar(page, 'companion', null);
    await setupHunt(page, 'Shade', 'owaissa');
    await goToPassage(page, 'HuntStart');
    await expectCleanPassage(page);
    const text = await page.locator('#passages').innerText();
    expect(text).not.toContain('Talk to');
  });

  test('HuntStart with Owaissa marks the companion flag active', async ({ game: page }) => {
    await selectCompanion(page, 'Alice');
    await setVar(page, 'isCompChosen', 0);
    await setupHunt(page, 'Shade', 'owaissa');
    await goToPassage(page, 'HuntStart');
    expect(await getVar(page, 'isCompChosen')).toBe(1);
  });

  // The companion icon must render in the lower-right of the HuntRun
  // toolbar -- between the centered tools cluster and the right-edge
  // nav links. The slot holds the clickable portrait/questionMark
  // <<companionCard>> widget (the sanity/lust mini panel stays in the
  // sidebar via StoryCaption).
  test('HuntRun renders the companion card in the toolbar between tools and nav', async ({ game: page }) => {
    await selectCompanion(page, 'Alice');
    await setupHunt(page, 'Shade', 'owaissa');
    await setVar(page, 'isCompChosen', 1);
    await setVar(page, 'chosenPlan', 'Plan1');
    await page.evaluate(() => {
      SugarCube.State.variables.showComp = SugarCube.setup.CompanionShow.VISIBLE;
    });
    await goToPassage(page, 'HuntRun');
    await expectCleanPassage(page);

    const slot = page.locator('.hunt-run-toolbar .hunt-run-companion');
    await expect(slot).toHaveCount(1);
    // VISIBLE state -> clickable portrait that links to CompanionMain.
    const link = slot.locator('a.companion-card-link');
    await expect(link).toHaveCount(1);
    expect(await link.getAttribute('data-passage')).toBe('CompanionMain');

    // Order check: tools, then companion, then nav within the toolbar.
    const order = await page.evaluate(() => {
      const bar = document.querySelector('.hunt-run-toolbar');
      if (!bar) return null;
      return Array.from(bar.children).map((el) => el.className.split(' ')[0]);
    });
    expect(order).not.toBeNull();
    const tools = order.indexOf('hunt-run-tools');
    const comp  = order.indexOf('hunt-run-companion');
    const nav   = order.indexOf('hunt-run-nav');
    expect(tools).toBeGreaterThanOrEqual(0);
    expect(comp).toBeGreaterThan(tools);
    expect(nav).toBeGreaterThan(comp);
  });

  test('HuntRun companion card swaps to question-mark on ATTACK_FAILED', async ({ game: page }) => {
    await selectCompanion(page, 'Alice');
    await setupHunt(page, 'Shade', 'owaissa');
    await setVar(page, 'isCompChosen', 1);
    await setVar(page, 'chosenPlan', 'Plan1');
    await page.evaluate(() => {
      SugarCube.State.variables.showComp = SugarCube.setup.CompanionShow.ATTACK_FAILED;
    });
    await goToPassage(page, 'HuntRun');
    await expectCleanPassage(page);
    const link = page.locator('.hunt-run-companion a.companion-card-link');
    await expect(link).toHaveCount(1);
    expect(await link.getAttribute('data-passage')).toBe('CompanionFailed');
    // Question-mark image, not the companion portrait.
    expect(await link.locator('img').getAttribute('src') || '').toMatch(/question-mark/);
  });

  test('HuntRun companion card links to CompanionSucceeded on ATTACK_SAFE', async ({ game: page }) => {
    await selectCompanion(page, 'Alice');
    await setupHunt(page, 'Shade', 'owaissa');
    await setVar(page, 'isCompChosen', 1);
    await setVar(page, 'chosenPlan', 'Plan1');
    await page.evaluate(() => {
      SugarCube.State.variables.showComp = SugarCube.setup.CompanionShow.ATTACK_SAFE;
    });
    await goToPassage(page, 'HuntRun');
    await expectCleanPassage(page);
    const link = page.locator('.hunt-run-companion a.companion-card-link');
    await expect(link).toHaveCount(1);
    expect(await link.getAttribute('data-passage')).toBe('CompanionSucceeded');
  });

  test('HuntRun companion card slot is empty when no companion is selected', async ({ game: page }) => {
    await page.evaluate(() => SugarCube.setup.Companion.clearCompanionSelection());
    await setVar(page, 'companion', null);
    await setVar(page, 'chosenPlan', 0);
    await setupHunt(page, 'Shade', 'owaissa');
    await goToPassage(page, 'HuntRun');
    await expectCleanPassage(page);
    // The slot div still exists (it's part of the toolbar layout) but
    // contains no card link when there's no active companion.
    await expect(page.locator('.hunt-run-companion a.companion-card-link')).toHaveCount(0);
  });

  // Cancel from HuntStart calls HuntController.end() directly. Without
  // the cleanup that pairs with startHunt's $hunt stamp, the legacy
  // mode would stay ACTIVE and the per-passage tick would punt the
  // player to HuntOverTime as soon as the in-game clock crossed 06:00.
  test('HuntController.end() resets Ghosts.huntMode to NONE', async ({ game: page }) => {
    await page.evaluate(() =>
      SugarCube.setup.HuntController.startHunt({ seed: 1, staticHouseId: 'owaissa' }));
    expect(await callSetup(page, 'setup.Ghosts.isHunting()')).toBe(true);
    await page.evaluate(() => SugarCube.setup.HuntController.end());
    expect(await callSetup(page, 'setup.Ghosts.isHunting()')).toBe(false);
    expect(await callSetup(page, 'setup.Ghosts.huntMode()')).toBe(0);
  });
});
