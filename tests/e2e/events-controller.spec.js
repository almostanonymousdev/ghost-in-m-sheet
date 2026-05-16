const { test, expect } = require('../fixtures');
const { setVar, getVar, callSetup, openGame } = require('../helpers');

test.describe('Events controller — tier classification', () => {
  test('lustTier maps lust ranges to 1-7', async ({ game: page }) => {
    const cases = [
      [0, 1], [14, 1],
      [15, 2], [29, 2],
      [30, 3], [44, 3],
      [45, 4], [59, 4],
      [60, 5], [74, 5],
      [75, 6], [89, 6],
      [90, 7], [100, 7],
    ];
    for (const [lust, tier] of cases) {
      await setVar(page, 'mc.lust', lust);
      expect(await callSetup(page, 'setup.Events.lustTier()')).toBe(tier);
    }
  });

  test('corruptionTier maps corruption to discrete buckets', async ({ game: page }) => {
    const cases = [
      [0, 0],
      [1, 1], [1.5, 1],
      [2, 2], [2.9, 2],
      [3, 3],
      [4, 4], [5.9, 4],
      [6, 6],
      [8, 8], [10, 8],
    ];
    for (const [corr, tier] of cases) {
      await setVar(page, 'mc.corruption', corr);
      expect(await callSetup(page, 'setup.Events.corruptionTier()')).toBe(tier);
    }
  });

});

test.describe('Events controller — video resolvers', () => {
  async function setLocation(p, location) {
    await p.evaluate((loc) => {
      if (SugarCube.setup.HuntController.active()) SugarCube.setup.HuntController.end();
      if (loc) {
        SugarCube.setup.HuntController.startHunt({ seed: 1, staticHouseId: `${loc}` });
      }
    }, location || null);
  }

  test('pickByLocation switches by active hunt house', async ({ game: page }) => {
    await setLocation(page, 'owaissa');
    let result = await page.evaluate(() =>
      SugarCube.setup.Events.pickByLocation(['o1'], ['e1']));
    expect(result).toEqual(['o1']);
    await setLocation(page, 'elm');
    result = await page.evaluate(() =>
      SugarCube.setup.Events.pickByLocation(['o1'], ['e1']));
    expect(result).toEqual(['e1']);
    /* Ironclad uses its own prison resolver path; pickByLocation itself
     * just picks owaissa-vs-elm and defaults to owaissa otherwise. */
    await setLocation(page, 'ironclad');
    result = await page.evaluate(() =>
      SugarCube.setup.Events.pickByLocation(['o1'], ['e1']));
    expect(result).toEqual(['o1']);
  });

  test('videoListForEvent("brain") returns the flat mind list', async ({ game: page }) => {
    const list = await page.evaluate(() =>
      SugarCube.setup.Events.videoListForEvent('brain'));
    expect(list.length).toBeGreaterThan(0);
    expect(list[0]).toContain('mind/');
  });

  test('videoListForEvent for tits with a t-shirt + bra picks tshirt set', async ({ game: page }) => {
    await setLocation(page, 'owaissa');
    await setVar(page, 'tshirtState', 'worn');
    await setVar(page, 'braState', 'worn');
    const list = await page.evaluate(() =>
      SugarCube.setup.Events.videoListForEvent('tits'));
    expect(list.length).toBeGreaterThan(0);
    expect(list[0]).toContain('tshirt/');
  });

  test('videoListForEvent for tits with no top + no bra picks noBra set', async ({ game: page }) => {
    await setLocation(page, 'owaissa');
    await setVar(page, 'tshirtState', 'not worn');
    await setVar(page, 'braState', 'not worn');
    const list = await page.evaluate(() =>
      SugarCube.setup.Events.videoListForEvent('tits'));
    expect(list.length).toBeGreaterThan(0);
    expect(list[0]).toContain('/no-bra/');
  });

  test('videoListForEvent for ass with jeans + panties picks jeans set', async ({ game: page }) => {
    await setLocation(page, 'owaissa');
    await setVar(page, 'jeansState', 'worn');
    await setVar(page, 'pantiesState', 'worn');
    await setVar(page, 'shortsState', 'not worn');
    await setVar(page, 'skirtState', 'not worn');
    const list = await page.evaluate(() =>
      SugarCube.setup.Events.videoListForEvent('ass'));
    expect(list[0]).toContain('/jeans/s1/');
  });

  test('videoListForEvent for ass with skirt + no panties picks skirtNP', async ({ game: page }) => {
    await setLocation(page, 'owaissa');
    await setVar(page, 'jeansState', 'not worn');
    await setVar(page, 'shortsState', 'not worn');
    await setVar(page, 'skirtState', 'worn');
    await setVar(page, 'pantiesState', 'not worn');
    const list = await page.evaluate(() =>
      SugarCube.setup.Events.videoListForEvent('ass'));
    expect(list[0]).toContain('/skirt-no-panties/s1/');
  });

  test('videoListForEvent on ironclad always picks prison list', async ({ game: page }) => {
    await setLocation(page, 'ironclad');
    const list = await page.evaluate(() =>
      SugarCube.setup.Events.videoListForEvent('ass'));
    expect(list[0]).toContain('prison/');
  });

  test('bansheeVideos returns ironclad list when isIronclad', async ({ game: page }) => {
    await setLocation(page, 'ironclad');
    let list = await page.evaluate(() => SugarCube.setup.Events.bansheeVideos());
    expect(list[0]).toContain('prison/banshee');

    await setLocation(page, 'owaissa');
    list = await page.evaluate(() => SugarCube.setup.Events.bansheeVideos());
    expect(list[0]).toContain('ghosts/banshee');
  });
});

test.describe('Events controller — orgasm and body-part roll', () => {
  test('shouldOrgasm fires only at lust 100 for pussy/anal', async ({ game: page }) => {
    await setVar(page, 'mc.lust', 100);
    expect(await callSetup(page, 'setup.Events.shouldOrgasm("mouth")')).toBe(false);
    expect(await callSetup(page, 'setup.Events.shouldOrgasm("pussy")')).toBe(true);
    expect(await callSetup(page, 'setup.Events.shouldOrgasm("anal")')).toBe(true);
    expect(await callSetup(page, 'setup.Events.shouldOrgasm("brain")')).toBe(false);
    expect(await callSetup(page, 'setup.Events.shouldOrgasm("tits")')).toBe(false);

    await setVar(page, 'mc.lust', 99);
    expect(await callSetup(page, 'setup.Events.shouldOrgasm("pussy")')).toBe(false);
  });

  test('orgasmSanityLoss is -10', async ({ game: page }) => {
    expect(await callSetup(page, 'setup.Events.orgasmSanityLoss')).toBe(-10);
  });

  test('rollBodyPartEvent returns "" when chance exceeds the lust threshold', async ({ game: page }) => {
    // Lust tier 1 threshold is 4
    await setVar(page, 'mc.lust', 0);
    await page.evaluate(() => {
      SugarCube.State.variables.sensualBodyPart = {
        brain: 1, tits: 0, ass: 0, bottom: 0,
        mouth: 0, pussy: 0, anal: 0,
      };
    });
    const r = await callSetup(page, 'setup.Events.rollBodyPartEvent(5)');
    expect(r).toBe('');
  });

  test('rollBodyPartEvent picks "brain" when only brain has weight at tier 1', async ({ game: page }) => {
    await setVar(page, 'mc.lust', 0);
    await page.evaluate(() => {
      SugarCube.State.variables.sensualBodyPart = {
        brain: 5, tits: 0, ass: 0, bottom: 0,
        mouth: 0, pussy: 0, anal: 0,
      };
    });
    const r = await callSetup(page, 'setup.Events.rollBodyPartEvent(0)');
    expect(r).toBe('brain');
  });

  test('rollBodyPartEvent returns "" when totalWeight is 0', async ({ game: page }) => {
    await setVar(page, 'mc.lust', 100);
    await page.evaluate(() => {
      SugarCube.State.variables.sensualBodyPart = {
        brain: 0, tits: 0, ass: 0, bottom: 0,
        mouth: 0, pussy: 0, anal: 0,
      };
    });
    const r = await callSetup(page, 'setup.Events.rollBodyPartEvent(0)');
    expect(r).toBe('');
  });

  test('coverageDamp tracks setup.Wardrobe.coverage()/12', async ({ game: page }) => {
    // Strip MC fully naked.
    for (const v of ['tshirtState', 'braState', 'pantiesState', 'jeansState', 'shortsState', 'skirtState']) {
      await setVar(page, v, 'not worn');
    }
    expect(await callSetup(page, 'setup.Wardrobe.coverage()')).toBe(0);
    expect(await callSetup(page, 'setup.Events.coverageDamp()')).toBe(0);

    // Fully dressed.
    for (const v of ['tshirtState', 'braState', 'pantiesState', 'jeansState']) {
      await setVar(page, v, 'worn');
    }
    expect(await callSetup(page, 'setup.Wardrobe.coverage()')).toBe(100);
    expect(await callSetup(page, 'setup.Events.coverageDamp()')).toBe(8);
  });

  test('rollBodyPartEvent threshold drops by coverageDamp', async ({ game: page }) => {
    // Tier 1 threshold is 4. Fully dressed coverage = 100 → damp = 8 →
    // effective threshold is 0, so chance=1 must return ''.
    await setVar(page, 'mc.lust', 0);
    for (const v of ['tshirtState', 'braState', 'pantiesState', 'jeansState']) {
      await setVar(page, v, 'worn');
    }
    await page.evaluate(() => {
      SugarCube.State.variables.sensualBodyPart = {
        brain: 5, tits: 0, ass: 0, bottom: 0,
        mouth: 0, pussy: 0, anal: 0,
      };
    });
    expect(await callSetup(page, 'setup.Events.rollBodyPartEvent(1)')).toBe('');
    // Stripping back to naked restores threshold 4, so chance=1 fires brain.
    for (const v of ['tshirtState', 'braState', 'pantiesState', 'jeansState']) {
      await setVar(page, v, 'not worn');
    }
    expect(await callSetup(page, 'setup.Events.rollBodyPartEvent(1)')).toBe('brain');
  });

  test('exposureMultipliers downweights covered body parts', async ({ game: page }) => {
    // Jeans + panties: ass/bottom/pussy/anal heavily damped, tits with
    // tshirt + bra also low. Weight tits and pussy equally; force
    // Math.random() to 0 so the roll picks the first non-zero weight.
    for (const v of ['tshirtState', 'braState', 'pantiesState', 'jeansState']) {
      await setVar(page, v, 'worn');
    }
    await setVar(page, 'shortsState', 'not worn');
    await setVar(page, 'skirtState', 'not worn');
    const mult = await page.evaluate(() => SugarCube.setup.Wardrobe.exposureMultipliers());
    expect(mult.tits).toBeLessThan(0.5);   // tshirt+bra → 0.3
    expect(mult.ass).toBeLessThan(0.5);    // jeans → 0.3
    expect(mult.pussy).toBeLessThan(0.3);  // jeans → 0.2

    // Skirt without panties amplifies ass weight above 1.
    for (const v of ['tshirtState', 'braState', 'jeansState', 'shortsState', 'pantiesState']) {
      await setVar(page, v, 'not worn');
    }
    await setVar(page, 'skirtState', 'worn');
    const mult2 = await page.evaluate(() => SugarCube.setup.Wardrobe.exposureMultipliers());
    expect(mult2.ass).toBeGreaterThan(1);
    expect(mult2.pussy).toBe(1);
  });

  test('rollBodyPartEvent at tier 7 (lust 90+) can pick any of 7 keys', async ({ game: page }) => {
    await setVar(page, 'mc.lust', 95);
    await page.evaluate(() => {
      SugarCube.State.variables.sensualBodyPart = {
        brain: 1, tits: 1, ass: 1, bottom: 1,
        mouth: 1, pussy: 1, anal: 5,
      };
    });
    // Force random to 1.0 → roll = totalWeight = 11, picks last (anal)
    await page.evaluate(() => { window._origRandom = Math.random; Math.random = () => 0.9999; });
    try {
      const r = await callSetup(page, 'setup.Events.rollBodyPartEvent(0)');
      expect(r).toBe('anal');
    } finally {
      await page.evaluate(() => { Math.random = window._origRandom; });
    }
  });
});

test.describe('Events controller — banshee / cthulion abilities', () => {
  test('enableBanshee / clearBanshee toggle bansheeAbility', async ({ game: page }) => {
    await page.evaluate(() => { delete SugarCube.State.variables.bansheeAbility; });
    expect(await callSetup(page, 'setup.Events.bansheeActive()')).toBe(false);
    await page.evaluate(() => SugarCube.setup.Events.enableBanshee());
    expect(await callSetup(page, 'setup.Events.bansheeActive()')).toBe(true);
    expect(await getVar(page, 'bansheeAbility')).toBe(1);
    await page.evaluate(() => SugarCube.setup.Events.clearBanshee());
    expect(await callSetup(page, 'setup.Events.bansheeActive()')).toBe(false);
  });

  test('enableCthulion / clearCthulion toggle cthulionAbility', async ({ game: page }) => {
    await page.evaluate(() => { delete SugarCube.State.variables.cthulionAbility; });
    expect(await callSetup(page, 'setup.Events.cthulionActive()')).toBe(false);
    await page.evaluate(() => SugarCube.setup.Events.enableCthulion());
    expect(await callSetup(page, 'setup.Events.cthulionActive()')).toBe(true);
    await page.evaluate(() => SugarCube.setup.Events.clearCthulion());
    expect(await callSetup(page, 'setup.Events.cthulionActive()')).toBe(false);
  });
});

test.describe('Events controller — companion checks', () => {
  test('hasCompanionOnPlan1 requires both flags set', async ({ game: page }) => {
    await setVar(page, 'isCompChosen', 0);
    await setVar(page, 'chosenPlan', 0);
    expect(await callSetup(page, 'setup.Events.hasCompanionOnPlan1()')).toBe(false);
    await setVar(page, 'isCompChosen', 1);
    expect(await callSetup(page, 'setup.Events.hasCompanionOnPlan1()')).toBe(false);
    await setVar(page, 'chosenPlan', 'Plan1');
    expect(await callSetup(page, 'setup.Events.hasCompanionOnPlan1()')).toBe(true);
  });

  test('companionIsAroused requires lust >= 60', async ({ game: page }) => {
    await page.evaluate(() => { SugarCube.State.variables.companion = { lust: 59 }; });
    expect(await callSetup(page, 'setup.Events.companionIsAroused()')).toBe(false);
    await page.evaluate(() => { SugarCube.State.variables.companion.lust = 60; });
    expect(await callSetup(page, 'setup.Events.companionIsAroused()')).toBe(true);
  });

  test('companionIsInlineFriend matches Alex / Taylor / Casey', async ({ game: page }) => {
    for (const name of ['Alex', 'Taylor', 'Casey']) {
      await page.evaluate((n) => { SugarCube.State.variables.companion = { name: n }; }, name);
      expect(await callSetup(page, 'setup.Events.companionIsInlineFriend()')).toBe(true);
    }
    await page.evaluate(() => { SugarCube.State.variables.companion = { name: 'Alice' }; });
    expect(await callSetup(page, 'setup.Events.companionIsInlineFriend()')).toBe(false);
  });

  test('companionDrainForHelp drains 3 sanity, gains 10 lust', async ({ game: page }) => {
    await page.evaluate(() => {
      SugarCube.State.variables.companion = { name: 'Alice', sanity: 80, lust: 30 };
    });
    await page.evaluate(() => SugarCube.setup.Events.companionDrainForHelp());
    expect(await getVar(page, 'companion.sanity')).toBe(77);
    expect(await getVar(page, 'companion.lust')).toBe(40);
  });
});

test.describe('Events controller — save-event video aliases', () => {
  async function setLocation(p, location) {
    await setVar(p, 'hauntedHouse', location || null);
  }

  test('saveEventBottomVideos picks the right body part by stage', async ({ game: page }) => {
    await setLocation(page, 'owaissa');
    await setVar(page, 'jeansState', 'worn');
    await setVar(page, 'pantiesState', 'worn');
    await setVar(page, 'shortsState', 'not worn');
    await setVar(page, 'skirtState', 'not worn');

    const stage1 = await page.evaluate(() => SugarCube.setup.Events.saveEventBottomVideos(1));
    expect(stage1[0]).toContain('/jeans/s1/');

    const stage2 = await page.evaluate(() => SugarCube.setup.Events.saveEventBottomVideos(2));
    expect(stage2[0]).toContain('/jeans/s2/');

    const stage4 = await page.evaluate(() => SugarCube.setup.Events.saveEventBottomVideos(4));
    expect(stage4.length).toBeGreaterThan(0);
  });

  test('saveEventTopVideos picks the right body part by stage', async ({ game: page }) => {
    await setLocation(page, 'owaissa');
    await setVar(page, 'tshirtState', 'worn');
    await setVar(page, 'braState', 'worn');

    const stage1 = await page.evaluate(() => SugarCube.setup.Events.saveEventTopVideos(1));
    expect(stage1.length).toBeGreaterThan(0);

    const stage3 = await page.evaluate(() => SugarCube.setup.Events.saveEventTopVideos(3));
    expect(stage3[0]).toContain('bj/');
  });
});

test.describe('Events controller — event flags / videos', () => {
  test('initEvent stores the key on argForRandomizer', async ({ game: page }) => {
    await page.evaluate(() => SugarCube.setup.Events.initEvent('mouth'));
    expect(await callSetup(page, 'setup.Events.currentArgForRandomizer()')).toBe('mouth');
  });

  test('setVideoEvent / videoEvent / videoEventIsMp4', async ({ game: page }) => {
    await page.evaluate(() => SugarCube.setup.Events.setVideoEvent('foo.webp'));
    expect(await callSetup(page, 'setup.Events.videoEvent()')).toBe('foo.webp');
    expect(await callSetup(page, 'setup.Events.videoEventIsMp4()')).toBe(false);
    await page.evaluate(() => SugarCube.setup.Events.setVideoEvent('foo.mp4'));
    expect(await callSetup(page, 'setup.Events.videoEventIsMp4()')).toBe(true);
  });

  test('setOrgasmCooldown stores the value', async ({ game: page }) => {
    await page.evaluate(() => SugarCube.setup.Events.setOrgasmCooldown(3));
    expect(await getVar(page, 'orgasmCooldownSteps')).toBe(3);
  });

  test('recordWeakenReward sets weaken flag and money', async ({ game: page }) => {
    await page.evaluate(() => SugarCube.setup.Events.recordWeakenReward());
    expect(await getVar(page, 'isWeakenGhost')).toBe(1);
    expect(await getVar(page, 'moneyFromWeakenTheGhost')).toBe(30);
  });

  test('setCleanedUp coerces to boolean', async ({ game: page }) => {
    await page.evaluate(() => SugarCube.setup.Events.setCleanedUp(1));
    expect(await getVar(page, 'cleanedUp')).toBe(true);
    await page.evaluate(() => SugarCube.setup.Events.setCleanedUp(0));
    expect(await getVar(page, 'cleanedUp')).toBe(false);
  });

  test('clampGhostOrgasmFloor and clampMcOrgasmFloor', async ({ game: page }) => {
    await setVar(page, 'ghostOrgasmMeter', -5);
    await page.evaluate(() => SugarCube.setup.Events.clampGhostOrgasmFloor());
    expect(await callSetup(page, 'setup.Events.ghostOrgasmMeter()')).toBe(0);

    await setVar(page, 'mcOrgasmMeter', -3);
    await page.evaluate(() => SugarCube.setup.Events.clampMcOrgasmFloor());
    expect(await callSetup(page, 'setup.Events.mcOrgasmMeter()')).toBe(0);

    await setVar(page, 'ghostOrgasmMeter', 5);
    await page.evaluate(() => SugarCube.setup.Events.clampGhostOrgasmFloor());
    expect(await callSetup(page, 'setup.Events.ghostOrgasmMeter()')).toBe(5);
  });
});

test.describe('Events controller — eventTextFor lookup', () => {
  let page;

  test.beforeAll(async ({ browser }) => { page = await openGame(browser); });
  test.afterAll(async () => { await page.close(); });

  async function lookup(bodyPart, tier) {
    return page.evaluate(([bp, t]) =>
      SugarCube.setup.Events.eventTextFor(bp, t), [bodyPart, tier]);
  }

  test('returns "" for an unknown body part', async ({ game: page }) => {
    expect(await lookup('nope', 0)).toBe('');
  });

  test('all corruption tiers resolve to non-empty prose for every body part', async ({ game: page }) => {
    const parts = ['brain', 'tits', 'ass', 'bottom', 'mouth', 'pussy', 'anal'];
    const tiers = [0, 1, 2, 3, 4, 6, 8];
    for (const bp of parts) {
      for (const t of tiers) {
        const text = await lookup(bp, t);
        expect(text.length).toBeGreaterThan(0);
        expect(text).toContain('@@.mc-');
      }
    }
  });

  test('strips embedded newlines so the output is one line of wiki source', async ({ game: page }) => {
    const text = await lookup('brain', 8);
    expect(text).not.toContain('\n');
  });

  test('sparse maps fall back to the highest defined tier <= requested', async ({ game: page }) => {
    // mouth defines {0, 4, 6, 8}; tier 1, 2, 3 should resolve to the
    // tier-0 fallback string.
    const t0 = await lookup('mouth', 0);
    for (const t of [1, 2, 3]) {
      expect(await lookup('mouth', t)).toBe(t0);
    }
    // Tier 4 picks its own entry, distinct from the tier-0 fallback.
    expect(await lookup('mouth', 4)).not.toBe(t0);
  });

  test('pussy tier 4 uses the gte-4 speech variant; tier 0-3 use the lt-4 one', async ({ game: page }) => {
    const t3 = await lookup('pussy', 3);
    const t4 = await lookup('pussy', 4);
    expect(t3).toContain('get away from me');
    expect(t4).toContain('shouldn\'t do that to women');
    expect(t3).not.toBe(t4);
  });

  test('brain tiers 0..8 each resolve to a distinct string', async ({ game: page }) => {
    const seen = new Set();
    for (const t of [0, 1, 2, 3, 4, 6, 8]) {
      const text = await lookup('brain', t);
      expect(seen.has(text)).toBe(false);
      seen.add(text);
    }
  });

});
