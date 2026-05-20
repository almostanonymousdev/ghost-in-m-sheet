const { test, expect } = require('./fixtures');
const { setVar, getVar, callSetup } = require('./helpers');

/* setup.Migrations holds the one-shot save patches and the
   PassageReady "ensure" defaults. Big patches stamp their
   update<NN> flag so they run at most once per save; ensure
   helpers are idempotent and only fill in fields that are missing.

   Each test here drives a single migration helper directly so a
   future refactor that drops a side-effect (or stops stamping the
   guard flag) is caught. Coverage is otherwise indirect — the
   only test touching this module before was succubus.spec.js
   exercising ensureSuccubusCooldown as a side-effect. */
test.describe('Migrations (setup.Migrations)', () => {

  // --- Update guards --------------------------------------------

  test('update<NN>Applied predicates flip from false to true once the var is set', async ({ game: page }) => {
    await page.evaluate(() => {
      const V = SugarCube.State.variables;
      delete V.update22; delete V.update0909; delete V.update2707;
    });
    expect(await callSetup(page, 'setup.Migrations.update22Applied()')).toBe(false);
    expect(await callSetup(page, 'setup.Migrations.update0909Applied()')).toBe(false);
    expect(await callSetup(page, 'setup.Migrations.update2707Applied()')).toBe(false);

    await setVar(page, 'update22', 0.4);
    await setVar(page, 'update0909', 1);
    await setVar(page, 'update2707', 1);
    expect(await callSetup(page, 'setup.Migrations.update22Applied()')).toBe(true);
    expect(await callSetup(page, 'setup.Migrations.update0909Applied()')).toBe(true);
    expect(await callSetup(page, 'setup.Migrations.update2707Applied()')).toBe(true);
  });

  // --- migrateRoomsAndProwlTimer --------------------------------

  test('migrateRoomsAndProwlTimer seeds the post-0.4 rooms, prowl timer, sanity, and stamps update22', async ({ game: page }) => {
    /* Strip the fields the migration is supposed to set so we can
       observe it filling them in (rather than passing vacuously
       because StoryInit already populated them). */
    await page.evaluate(() => {
      const V = SugarCube.State.variables;
      ['basement','bedroomTwo','nursery','bathroomTwo','hallwayUpstairs',
       'prowlActivated','rememberTopOuter','rememberBottomOuter',
       'prowlTimeRemain','prowlActivationTime','elapsedTimeProwl',
       'sanityIfHot','sanityInTheDark','medicineAmount',
       'ghostMareEventStart','ghostMareEventStage','update22'
      ].forEach(k => { delete V[k]; });
      if (V.mc) delete V.mc.sanityMax;
    });

    await page.evaluate(() => SugarCube.setup.Migrations.migrateRoomsAndProwlTimer());

    /* Five new rooms were seeded — each becomes a room object the
       Rooms controller can resolve. */
    for (const id of ['basement','bedroomTwo','nursery','bathroomTwo','hallwayUpstairs']) {
      const room = await page.evaluate((rid) =>
        SugarCube.setup.Rooms.byId(rid), id);
      expect(room, `room ${id} should exist after seed`).toBeTruthy();
    }

    expect(await getVar(page, 'prowlActivated')).toBe(0);
    expect(await getVar(page, 'rememberTopOuter')).toBe('tshirt0');
    expect(await getVar(page, 'rememberBottomOuter')).toBe('jeans0');
    expect(await getVar(page, 'prowlTimeRemain')).toBe(60);
    expect(await getVar(page, 'prowlActivationTime')).toBe(0);
    expect(await getVar(page, 'elapsedTimeProwl')).toBe(0);
    expect(await getVar(page, 'sanityIfHot')).toBe(0.1);
    expect(await getVar(page, 'sanityInTheDark')).toBe(0.35);
    expect(await getVar(page, 'mc.sanityMax')).toBe(100);
    expect(await getVar(page, 'medicineAmount')).toBe(0);
    expect(await getVar(page, 'ghostMareEventStart')).toBe(0);
    expect(await getVar(page, 'ghostMareEventStage')).toBe(0);

    // Guard flag is stamped so the orchestration loop won't repeat it.
    expect(await getVar(page, 'update22')).toBe(0.4);
    expect(await callSetup(page, 'setup.Migrations.update22Applied()')).toBe(true);
  });

  test('migrateRoomsAndProwlTimer tolerates an absent $mc bundle', async ({ game: page }) => {
    // Old saves predating the bundled $mc shape; the migration
    // must not throw, and must skip the sanityMax write.
    await page.evaluate(() => { delete SugarCube.State.variables.mc; });
    await expect(page.evaluate(
      () => SugarCube.setup.Migrations.migrateRoomsAndProwlTimer())).resolves.not.toThrow();
    expect(await getVar(page, 'update22')).toBe(0.4);
  });

  // --- migrateStockingsFootBought -------------------------------

  test('migrateStockingsFootBought marks stockings + foot piercings NOT_BOUGHT and stamps update2707', async ({ game: page }) => {
    const NOT_BOUGHT = await callSetup(page, 'setup.ClothingState.NOT_BOUGHT');

    // Pre-state: clear the six keys so the migration has to fill them.
    await page.evaluate(() => {
      const V = SugarCube.State.variables;
      ['stockingsState1','stockingsState2','stockingsState3',
       'footState1','footState2','footState3','update2707'
      ].forEach(k => { delete V[k]; });
    });

    await page.evaluate(() => SugarCube.setup.Migrations.migrateStockingsFootBought());

    for (const k of ['stockingsState1','stockingsState2','stockingsState3',
                     'footState1','footState2','footState3']) {
      expect(await getVar(page, k), `${k} should be NOT_BOUGHT`).toBe(NOT_BOUGHT);
    }
    expect(await getVar(page, 'update2707')).toBe(1);
  });

  // --- migrateDeliveryAndCompanionReset -------------------------

  test('migrateDeliveryAndCompanionReset rewrites delivery pay, resets the companion bundle, and stamps update0909', async ({ game: page }) => {
    await page.evaluate(() => {
      const V = SugarCube.State.variables;
      V.jobMoneySuccessed = 999;
      V.jobMoneyFailed    = 999;
      // Existing companion bundle gets blown away; the migration
      // wipes the slate so the player picks fresh.
      V.companion = { name: 'Brook', stats: { foo: 1 } };
      delete V.update0909;
    });

    await page.evaluate(() => SugarCube.setup.Migrations.migrateDeliveryAndCompanionReset());

    expect(await getVar(page, 'jobMoneySuccessed')).toBe(8);
    expect(await getVar(page, 'jobMoneyFailed')).toBe(3);
    expect(await getVar(page, 'companion')).toEqual({ name: false });
    expect(await getVar(page, 'update0909')).toBe(1);
  });

  // --- migrateCompanionPlanTimes --------------------------------

  test('migrateCompanionPlanTimes writes the canonical plan times and stamps update4', async ({ game: page }) => {
    await page.evaluate(() => {
      const V = SugarCube.State.variables;
      V.update4 = 0;
      V.blake = V.blake || {};
      V.alice = V.alice || {};
      V.brook = V.brook || {};
      // Wrong legacy values that the migration should overwrite.
      V.blake.plan2TimeReq = 999;
      V.alice.plan2TimeReq = 999;
      V.alice.plan3TimeReq = 999;
      V.alice.plan4TimeReq = 999;
      V.brook.plan2TimeReq = 999;
      V.brook.plan3TimeReq = 999;
    });

    await page.evaluate(() => SugarCube.setup.Migrations.migrateCompanionPlanTimes());

    expect(await getVar(page, 'blake.plan2TimeReq')).toBe(10);
    expect(await getVar(page, 'alice.plan2TimeReq')).toBe(15);
    expect(await getVar(page, 'alice.plan3TimeReq')).toBe(15);
    expect(await getVar(page, 'alice.plan4TimeReq')).toBe(10);
    expect(await getVar(page, 'brook.plan2TimeReq')).toBe(15);
    expect(await getVar(page, 'brook.plan3TimeReq')).toBe(10);
    expect(await getVar(page, 'update4')).toBe(1);
  });

  test('migrateCompanionPlanTimes is a no-op once update4===1', async ({ game: page }) => {
    await page.evaluate(() => {
      const V = SugarCube.State.variables;
      V.update4 = 1;
      V.blake = { plan2TimeReq: 999 };
    });
    await page.evaluate(() => SugarCube.setup.Migrations.migrateCompanionPlanTimes());
    // Guard short-circuit: the 999 sentinel survives because the
    // migration bailed before any write.
    expect(await getVar(page, 'blake.plan2TimeReq')).toBe(999);
  });

  test('migrateCompanionPlanTimes tolerates missing companion bundles', async ({ game: page }) => {
    await page.evaluate(() => {
      const V = SugarCube.State.variables;
      V.update4 = 0;
      delete V.blake; delete V.alice; delete V.brook;
    });
    await expect(page.evaluate(
      () => SugarCube.setup.Migrations.migrateCompanionPlanTimes())).resolves.not.toThrow();
    expect(await getVar(page, 'update4')).toBe(1);
  });

  // --- ensureUnderwearMemory ------------------------------------

  test('ensureUnderwearMemory only fills the remember* fields when undefined', async ({ game: page }) => {
    await page.evaluate(() => {
      const V = SugarCube.State.variables;
      delete V.rememberTopUnder;
      delete V.rememberBottomUnder;
    });
    await page.evaluate(() => SugarCube.setup.Migrations.ensureUnderwearMemory());
    expect(await getVar(page, 'rememberTopUnder')).toBe('bra0');
    expect(await getVar(page, 'rememberBottomUnder')).toBe('panties0');

    // Idempotent: a prior choice is preserved on subsequent calls.
    await setVar(page, 'rememberTopUnder', 'bra2');
    await setVar(page, 'rememberBottomUnder', 'panties3');
    await page.evaluate(() => SugarCube.setup.Migrations.ensureUnderwearMemory());
    expect(await getVar(page, 'rememberTopUnder')).toBe('bra2');
    expect(await getVar(page, 'rememberBottomUnder')).toBe('panties3');
  });

  test('ensureUnderwearMemory does NOT fill if only one of the pair is set', async ({ game: page }) => {
    /* The guard is `top undefined || bottom undefined`, so a save
       that has top set but bottom missing still gets both rewritten.
       Pin the current behavior so a future refactor doesn't quietly
       split the conditions. */
    await page.evaluate(() => {
      const V = SugarCube.State.variables;
      V.rememberTopUnder = 'bra5';
      delete V.rememberBottomUnder;
    });
    await page.evaluate(() => SugarCube.setup.Migrations.ensureUnderwearMemory());
    expect(await getVar(page, 'rememberTopUnder')).toBe('bra0');
    expect(await getVar(page, 'rememberBottomUnder')).toBe('panties0');
  });

  // --- ensureZeroDefaults ---------------------------------------

  test('ensureZeroDefaults backfills the documented numeric fields to 0', async ({ game: page }) => {
    const KEYS = [
      'ghostSpecialEventSpirit', 'relationshipBlake',
      'crucifixAmount', 'sanityPillsAmount',
      'addLustPiercingTits', 'addLustPiercingPussy',
      'addLustPiercingTongue', 'moneyFromWeakenTheGhost'
    ];
    await page.evaluate((keys) => {
      const V = SugarCube.State.variables;
      keys.forEach(k => { delete V[k]; });
    }, KEYS);

    await page.evaluate(() => SugarCube.setup.Migrations.ensureZeroDefaults());

    for (const k of KEYS) {
      expect(await getVar(page, k), `${k} should default to 0`).toBe(0);
    }
  });

  test('ensureZeroDefaults preserves existing non-zero values', async ({ game: page }) => {
    await setVar(page, 'crucifixAmount', 5);
    await setVar(page, 'relationshipBlake', 7);
    await page.evaluate(() => SugarCube.setup.Migrations.ensureZeroDefaults());
    expect(await getVar(page, 'crucifixAmount')).toBe(5);
    expect(await getVar(page, 'relationshipBlake')).toBe(7);
  });

  // --- seedTornStyles -------------------------------------------

  test('seedTornStyles writes the 10-entry torn-style array', async ({ game: page }) => {
    await page.evaluate(() => { delete SugarCube.State.variables.tornStyles; });
    await page.evaluate(() => SugarCube.setup.Migrations.seedTornStyles());
    const styles = await getVar(page, 'tornStyles');
    expect(Array.isArray(styles)).toBe(true);
    expect(styles.length).toBe(10);
    styles.forEach((s, i) => {
      expect(s).toMatch(/^torn-style-\d+ torn-effect$/);
    });
  });

  test('seedTornStyles overwrites any prior value (not "ensure"-style)', async ({ game: page }) => {
    // Unlike the ensure* helpers, this one unconditionally reseeds.
    // Pin the current contract.
    await setVar(page, 'tornStyles', ['garbage']);
    await page.evaluate(() => SugarCube.setup.Migrations.seedTornStyles());
    const styles = await getVar(page, 'tornStyles');
    expect(styles.length).toBe(10);
  });

  // --- ensureMcFit ----------------------------------------------

  test('ensureMcFit backfills fit + exhibitionism to 0 when undefined', async ({ game: page }) => {
    await page.evaluate(() => {
      const V = SugarCube.State.variables;
      V.mc = V.mc || {};
      delete V.mc.fit;
      delete V.mc.exhibitionism;
    });
    await page.evaluate(() => SugarCube.setup.Migrations.ensureMcFit());
    expect(await getVar(page, 'mc.fit')).toBe(0);
    expect(await getVar(page, 'mc.exhibitionism')).toBe(0);
  });

  test('ensureMcFit preserves existing non-zero values', async ({ game: page }) => {
    await setVar(page, 'mc.fit', 12);
    await setVar(page, 'mc.exhibitionism', 7);
    await page.evaluate(() => SugarCube.setup.Migrations.ensureMcFit());
    expect(await getVar(page, 'mc.fit')).toBe(12);
    expect(await getVar(page, 'mc.exhibitionism')).toBe(7);
  });

  test('ensureMcFit is a no-op when $mc is absent', async ({ game: page }) => {
    await page.evaluate(() => { delete SugarCube.State.variables.mc; });
    await expect(page.evaluate(
      () => SugarCube.setup.Migrations.ensureMcFit())).resolves.not.toThrow();
    expect(await getVar(page, 'mc')).toBeUndefined();
  });

  // --- ensurePSprayInventory ------------------------------------

  test('ensurePSprayInventory zeroes hasPSpray when charges are 0', async ({ game: page }) => {
    await setVar(page, 'hasPSpray', 1);
    await setVar(page, 'hasPSprayCharges', 0);
    await page.evaluate(() => SugarCube.setup.Migrations.ensurePSprayInventory());
    expect(await getVar(page, 'hasPSpray')).toBe(0);
  });

  test('ensurePSprayInventory leaves hasPSpray alone when charges remain', async ({ game: page }) => {
    await setVar(page, 'hasPSpray', 1);
    await setVar(page, 'hasPSprayCharges', 3);
    await page.evaluate(() => SugarCube.setup.Migrations.ensurePSprayInventory());
    expect(await getVar(page, 'hasPSpray')).toBe(1);
  });

  // --- applyPiercingSensitivityPatch ----------------------------

  test('applyPiercingSensitivityPatch initialises sens fields then is idempotent', async ({ game: page }) => {
    await page.evaluate(() => {
      const V = SugarCube.State.variables;
      delete V.piercingTitsAddSens;
      delete V.piercingTongueAddSens;
      delete V.piercingPussyAddSens;
      delete V.updatePiercingBodyPartSens;
    });

    await page.evaluate(() => SugarCube.setup.Migrations.applyPiercingSensitivityPatch());
    expect(await getVar(page, 'piercingTitsAddSens')).toBe(0);
    expect(await getVar(page, 'piercingTongueAddSens')).toBe(0);
    expect(await getVar(page, 'piercingPussyAddSens')).toBe(0);
    expect(await getVar(page, 'updatePiercingBodyPartSens')).toBe(1);

    // Player has accumulated sensitivity; the guard prevents the
    // patch from wiping it on subsequent passages.
    await setVar(page, 'piercingTitsAddSens', 5);
    await page.evaluate(() => SugarCube.setup.Migrations.applyPiercingSensitivityPatch());
    expect(await getVar(page, 'piercingTitsAddSens')).toBe(5);
  });

  // --- ensureSuccubusCooldown / ensureCursedItemCooldown --------

  test('ensureSuccubusCooldown seeds eventCD=0 only when the succubus subsystem is active', async ({ game: page }) => {
    // No $succubus → no backfill (still no need for a cooldown).
    await page.evaluate(() => {
      const V = SugarCube.State.variables;
      delete V.succubus;
      V.succubusEvent = {};
    });
    await page.evaluate(() => SugarCube.setup.Migrations.ensureSuccubusCooldown());
    expect(await page.evaluate(
      () => SugarCube.State.variables.succubusEvent.eventCD)).toBeUndefined();

    // Activate the subsystem → backfill kicks in.
    await page.evaluate(() => { SugarCube.State.variables.succubus = 1; });
    await page.evaluate(() => SugarCube.setup.Migrations.ensureSuccubusCooldown());
    expect(await page.evaluate(
      () => SugarCube.State.variables.succubusEvent.eventCD)).toBe(0);
  });

  test('ensureSuccubusCooldown preserves an existing cooldown', async ({ game: page }) => {
    await page.evaluate(() => {
      const V = SugarCube.State.variables;
      V.succubus = 1;
      V.succubusEvent = { eventCD: 4 };
    });
    await page.evaluate(() => SugarCube.setup.Migrations.ensureSuccubusCooldown());
    expect(await page.evaluate(
      () => SugarCube.State.variables.succubusEvent.eventCD)).toBe(4);
  });

  test('ensureCursedItemCooldown gates on $gotCursedItem', async ({ game: page }) => {
    await page.evaluate(() => {
      const V = SugarCube.State.variables;
      delete V.gotCursedItem;
      delete V.gotCursedItemEventCD;
    });
    await page.evaluate(() => SugarCube.setup.Migrations.ensureCursedItemCooldown());
    expect(await getVar(page, 'gotCursedItemEventCD')).toBeUndefined();

    await setVar(page, 'gotCursedItem', 1);
    await page.evaluate(() => SugarCube.setup.Migrations.ensureCursedItemCooldown());
    expect(await getVar(page, 'gotCursedItemEventCD')).toBe(0);
  });

  // --- ensureRoomTemplates --------------------------------------

  test('ensureRoomTemplates backfills template + id on legacy room objects', async ({ game: page }) => {
    /* Pre-template-field saves stored just `{ background, ... }`.
       The Rooms controller now relies on `template` to drive the
       hunt-room art lookups; without backfill, hunt rooms in the
       owaissa house would render with no background. */
    await page.evaluate(() => {
      const V = SugarCube.State.variables;
      // Strip template/id off every Rooms-owned room object.
      SugarCube.setup.Rooms.OWNED_VARS.forEach((id) => {
        if (V[id] && typeof V[id] === 'object') {
          delete V[id].template;
          delete V[id].id;
        }
      });
    });

    await page.evaluate(() => SugarCube.setup.Migrations.ensureRoomTemplates());

    const sample = await page.evaluate(() => {
      const V = SugarCube.State.variables;
      const ids = SugarCube.setup.Rooms.OWNED_VARS;
      return ids
        .filter((id) => V[id] && typeof V[id] === 'object')
        .slice(0, 5)
        .map((id) => ({ id, template: V[id].template, idField: V[id].id }));
    });
    expect(sample.length).toBeGreaterThan(0);
    sample.forEach((row) => {
      expect(row.template).toBe(row.id);
      expect(row.idField).toBe(row.id);
    });
  });

  test('ensureRoomTemplates preserves an existing template field', async ({ game: page }) => {
    /* A hunt-generated room may have a template that differs from its
       owning id (e.g. an attic template applied to the bedroomTwo
       slot). Backfill must not stomp the explicit value. */
    await page.evaluate(() => {
      const V = SugarCube.State.variables;
      const ids = SugarCube.setup.Rooms.OWNED_VARS;
      const sampleId = ids.find((id) => V[id] && typeof V[id] === 'object');
      if (sampleId) {
        V[sampleId].template = 'attic';
        V[sampleId].id = sampleId;
      }
    });

    await page.evaluate(() => SugarCube.setup.Migrations.ensureRoomTemplates());

    const preserved = await page.evaluate(() => {
      const V = SugarCube.State.variables;
      const ids = SugarCube.setup.Rooms.OWNED_VARS;
      const sampleId = ids.find((id) => V[id] && typeof V[id] === 'object' && V[id].template === 'attic');
      return sampleId ? V[sampleId].template : null;
    });
    expect(preserved).toBe('attic');
  });
});
