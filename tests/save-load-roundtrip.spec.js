const { test, expect } = require('./fixtures');
const { goToPassage, setVar, getVar, resetGame } = require('./helpers');

/*
 * Save/load round-trip tests.
 *
 * SaveMigration.js runs on every save (scrub) and load (apply defaults
 * + migrate legacy shapes). These tests lock in three guarantees that
 * are otherwise easy to silently regress when someone refactors a
 * variable name or class shape:
 *
 *   1. ROUND-TRIP — saving and loading the current state produces a
 *      visibly identical game. Catches class-instance dehydration,
 *      undefined survival, scrub side-effects on live state.
 *   2. GHOST PROTOTYPE — Ghost is a prototype-based class
 *      (passages/ghosts/GhostController.js:227). Plain-object
 *      "regressions" look fine in console but lose every method.
 *   3. LEGACY MIGRATION — old saves stored hunt state as a scatter of
 *      flat $ghost / $ghostName / $ghostEvidence / etc. variables;
 *      SaveMigration folds them onto $huntMode + the $run bundle. If
 *      that logic breaks, players with old saves silently lose progress.
 *
 * The "snapshot only what we care about" pattern keeps tests robust
 * against drift in timestamps, random nonces, and other state that
 * SugarCube touches during serialize but isn't player-visible.
 */

/* Every tracked field is paired with the non-default value its test
   should write before saving. Round-trip tests are only meaningful when
   the saved value differs from the GameInit default -- otherwise
   "before == after" passes vacuously even if the field never made it
   into (or out of) the blob. Every entry's value MUST differ from the
   GameInit/SaveMigration default for that field. */
const NON_DEFAULTS = {
  'mc.money':              257,
  'mc.energy':             7,
  'mc.sanity':             42,
  'mc.lust':               55,
  'mc.corruption':         13,
  'mc.lvl':                7,
  'mc.exp':                23,
  'hours':                 14,
  'minutes':               30,
  'dailySeed':             12345,
  'firstVisitDeliveryHub': false,
  'firstVisitWitchShop':   false,
  'jeansState':            'in wardrobe',
  'tshirtState':           'in laundry',
};
const TRACKED_VARS = Object.keys(NON_DEFAULTS);

function snapshot(page) {
  return page.evaluate((paths) => {
    const out = { passage: SugarCube.State.passage };
    const get = (varName) => {
      const parts = varName.split('.');
      let v = SugarCube.State.variables;
      for (const p of parts) {
        if (v == null) return undefined;
        v = v[p];
      }
      return v;
    };
    for (const p of paths) out[p] = get(p);
    return out;
  }, TRACKED_VARS);
}

/* Stamp every TRACKED_VARS field with its NON_DEFAULTS value, so the
   subsequent save captures a state that is recognisably distinct from
   a fresh-game reset. Tests that need "before-save" non-default values
   should call this before commitToSave. */
async function setAllNonDefault(page) {
  for (const k of TRACKED_VARS) {
    await setVar(page, k, NON_DEFAULTS[k]);
  }
}

/*
 * Flush live State.variables into State.history[active].variables.
 *
 * SugarCube keeps State.variables as a working copy of the active
 * moment; direct mutations there don't auto-write back to history, and
 * Save.serialize reads from history. A normal passage transition does
 * this flush implicitly. Tests that mutate via setVar and then save
 * must do it explicitly, or the save will capture the pre-mutation
 * snapshot.
 *
 * The JSON round-trip mirrors what Save itself does (and is what
 * SaveMigration.scrubNonSerialisable expects to encounter — functions
 * and DOM nodes can't survive serialize anyway).
 */
function commitToSave(page) {
  return page.evaluate(() => {
    const idx = SugarCube.State.activeIndex !== undefined
      ? SugarCube.State.activeIndex
      : SugarCube.State.history.length - 1;
    const moment = SugarCube.State.history[idx];
    if (!moment) return;
    moment.variables = JSON.parse(JSON.stringify(SugarCube.State.variables));
  });
}

test.describe('Save/load round-trip', () => {
  test('Save.serialize() returns a non-empty string', async ({ game: page }) => {
    await goToPassage(page, 'CityMap');
    const blob = await page.evaluate(() => SugarCube.Save.serialize());
    expect(typeof blob).toBe('string');
    expect(blob.length).toBeGreaterThan(0);
  });

  test('round-trip preserves every tracked field at non-default values', async ({ game: page }) => {
    /* Every TRACKED_VARS entry is set to its NON_DEFAULTS value before
       save, so the round-trip exercises real persistence (not just
       "default == default"). After a full game reset clears everything
       back to GameInit defaults, deserialise must restore every tracked
       field to the saved non-default value. */
    await goToPassage(page, 'CityMap');
    await setAllNonDefault(page);
    await commitToSave(page);

    const before = await snapshot(page);
    // Every saved field is genuinely distinct from the GameInit default.
    for (const k of TRACKED_VARS) {
      expect(before[k]).toEqual(NON_DEFAULTS[k]);
    }

    const blob = await page.evaluate(() => SugarCube.Save.serialize());
    await resetGame(page);
    // Reset wiped at least one tracked field back to default; otherwise
    // the deserialise step below could pass as a no-op.
    expect(await getVar(page, 'mc.lvl')).toBe(1);
    expect(await getVar(page, 'dailySeed')).not.toBe(NON_DEFAULTS.dailySeed);

    await page.evaluate((b) => SugarCube.Save.deserialize(b), blob);

    expect(await snapshot(page)).toEqual(before);
  });

  test('Ghost behaviour survives a save/load round-trip', async ({ game: page }) => {
    // The codebase deliberately stores hunt state as plain serializable
    // data ($run.ghostName, $run.evidence ids, $huntMode integer, ...)
    // and projects to a Ghost instance on demand via
    // setup.HuntController.activeGhost(). That sidesteps class-rehydration entirely.
    // The contract this test pins: after round-trip,
    // setup.HuntController.activeGhost() returns a working Ghost instance with the
    // same observable behaviour.
    await goToPassage(page, 'CityMap');
    await page.evaluate(() => {
      SugarCube.setup.HuntController.startHunt({ seed: 1 });
      SugarCube.setup.HuntController.setField('ghostName', 'Shade');
      SugarCube.setup.HuntController.setField('disguiseName', 'Shade');
      const g = SugarCube.setup.Ghosts.getByName('Shade');
      SugarCube.setup.HuntController.setField('evidence', g.evidence.map(e => e.id));
      SugarCube.setup.HuntController.setHuntMode(SugarCube.setup.HuntController.HuntMode.ACTIVE);
    });
    await commitToSave(page);

    // The Ghost constructor isn't exposed on setup.Ghosts, so we infer
    // "is a Ghost instance" by checking it shares the prototype with
    // entries from setup.Ghosts.list() (which are constructed via
    // `new Ghost(...)` at module load).
    const live = await page.evaluate(() => {
      const g = SugarCube.setup.HuntController.activeGhost();
      const refProto = Object.getPrototypeOf(SugarCube.setup.Ghosts.list()[0]);
      return {
        name: g && g.name,
        sharesGhostPrototype: Object.getPrototypeOf(g) === refProto,
        labels: g.evidenceLabels(),
        hasEmf: g.hasEvidence('emf'),
        hasGarbage: g.hasEvidence('not-a-real-evidence-id'),
      };
    });
    expect(live.name).toBe('Shade');
    expect(live.sharesGhostPrototype).toBe(true);
    // evidenceLabels() joins with ", " — should be a non-empty string
    // listing Shade's three evidence types.
    expect(typeof live.labels).toBe('string');
    expect(live.labels.split(',').length).toBe(3);
    expect(live.hasGarbage).toBe(false);

    const blob = await page.evaluate(() => SugarCube.Save.serialize());
    await resetGame(page);
    await page.evaluate((b) => SugarCube.Save.deserialize(b), blob);

    const restored = await page.evaluate(() => {
      const g = SugarCube.setup.HuntController.activeGhost();
      const refProto = Object.getPrototypeOf(SugarCube.setup.Ghosts.list()[0]);
      return {
        name: g && g.name,
        sharesGhostPrototype: Object.getPrototypeOf(g) === refProto,
        labels: g.evidenceLabels(),
        hasEmf: g.hasEvidence('emf'),
        hasGarbage: g.hasEvidence('not-a-real-evidence-id'),
      };
    });

    expect(restored).toEqual(live);
  });

  test('legacy v1 save migrates flat $ghost* vars onto $huntMode + $run via setup.applySaveDefaults', async ({ game: page }) => {
    await goToPassage(page, 'CityMap');

    const migrated = await page.evaluate(() => {
      // The legacy shape, exactly as documented in SaveMigration.js.
      const legacy = {
        // A mid-hunt $run with the procedural fields already populated;
        // SaveMigration patches in the ghost-side fields from the flat
        // legacy vars.
        run: {
          seed: 1, number: 1, modifiers: [], loadout: null, objective: null,
          floorplan: { rooms: [], edges: [], spawnRoomId: null }
        },
        ghost:            { name: 'Shade', evidence: ['emf', 'temperature', 'gwb'] },
        ghostName:        'Shade',
        ghostEvidence:    ['emf', 'temperature', 'gwb'],
        ghostRoom:        { name: 'kitchen' },
        ghostIsTrapped:   1,
        ghostHuntingMode: 2,
        saveMimic:        0,
        ghostActivity:    'idle',
        ghostRoomCI:      0,
      };
      SugarCube.setup.applySaveDefaults(legacy);
      return legacy;
    });

    // Mode lifted to top-level $huntMode.
    expect(migrated.huntMode).toBe(2);

    // Ghost identity / evidence / trapped flag folded onto $run.
    expect(migrated.run).toBeTruthy();
    expect(migrated.run.ghostName).toBe('Shade');     // saveMimic=0 → real name = displayed name
    expect(migrated.run.disguiseName).toBe('Shade');
    expect(migrated.run.evidence).toEqual(['emf', 'temperature', 'gwb']);
    expect(migrated.run.trapped).toBe(true);

    // $hunt bundle and the flat legacy fields are deleted.
    expect(migrated.hunt).toBeUndefined();
    for (const key of [
      'ghost', 'ghostName', 'ghostEvidence', 'ghostRoom',
      'ghostIsTrapped', 'ghostHuntingMode', 'saveMimic',
      'ghostActivity', 'ghostRoomCI',
    ]) {
      expect(migrated[key], `legacy field "${key}" should be deleted`).toBeUndefined();
    }
  });

  test('saveMimic=1 in legacy save preserves the visible name as Mimic-cover on $run', async ({ game: page }) => {
    // The Mimic ghost masquerades as another ghost; legacy saves stored
    // the cover name in $ghostName and the real type in $saveMimic. The
    // migration must preserve both on $run: ghostName = real identity,
    // disguiseName = displayed cover.
    await goToPassage(page, 'CityMap');

    const migrated = await page.evaluate(() => {
      const legacy = {
        run: {
          seed: 1, number: 1, modifiers: [], loadout: null, objective: null,
          floorplan: { rooms: [], edges: [], spawnRoomId: null }
        },
        ghostName:        'Shade',          // what the player saw
        ghostEvidence:    ['emf', 'gwb', 'glass'],
        ghostHuntingMode: 2,                // active hunt
        saveMimic:        1,                // it's actually a Mimic
      };
      SugarCube.setup.applySaveDefaults(legacy);
      return legacy.run;
    });

    expect(migrated.disguiseName).toBe('Shade');
    expect(migrated.ghostName).toBe('Mimic');
  });

  test('legacy v5 $hunt bundle is flattened onto $huntMode + $run on load', async ({ game: page }) => {
    // v2-v5 saves stored hunt state as a single $hunt object. v6
    // removes the bundle: $hunt.mode lifts to top-level $huntMode and
    // the per-hunt fields fold onto $run.
    await goToPassage(page, 'CityMap');

    const migrated = await page.evaluate(() => {
      const legacy = {
        run: {
          seed: 9, number: 4, modifiers: [], loadout: null, objective: null,
          floorplan: { rooms: [], edges: [], spawnRoomId: null }
        },
        hunt: {
          name:     'Phantom',
          realName: 'Mimic',
          evidence: ['uvl', 'temperature', 'spiritbox'],
          room:     { name: 'bedroom' },
          trapped:  true,
          mode:     2,
        }
      };
      SugarCube.setup.applySaveDefaults(legacy);
      return legacy;
    });

    expect(migrated.hunt).toBeUndefined();
    expect(migrated.huntMode).toBe(2);
    expect(migrated.run.ghostName).toBe('Mimic');
    expect(migrated.run.disguiseName).toBe('Phantom');
    expect(migrated.run.evidence).toEqual(['uvl', 'temperature', 'spiritbox']);
    expect(migrated.run.trapped).toBe(true);
  });

  test('legacy $wish<Name> flags migrate into $monkeyPawLearned', async ({ game: page }) => {
    // 0.5.1 stored each Monkey Paw wish unlock as a separate flat flag
    // ($wishActivity, $wishKnowledge, ...). The post-overhaul code reads
    // $monkeyPawLearned[<id>] instead. Without migration, a player who
    // had learned individual wishes pre-overhaul loses access to them.
    await goToPassage(page, 'CityMap');

    const migrated = await page.evaluate(() => {
      const legacy = {
        wishActivity:     1,
        wishTraptheghost: 1,
        wishKnowledge:    1,
        // wishSanity / wishLeave / wishDawn were never learned in this save.
      };
      SugarCube.setup.applySaveDefaults(legacy);
      return legacy;
    });

    expect(migrated.monkeyPawLearned).toEqual({
      activity:     true,
      trapTheGhost: true,
      knowledge:    true,
    });

    // Legacy flags are dropped so they can't shadow future writes.
    for (const key of [
      'wishActivity', 'wishTraptheghost', 'wishSanity',
      'wishLeave', 'wishKnowledge', 'wishDawn',
    ]) {
      expect(migrated[key], `legacy flag "${key}" should be deleted`).toBeUndefined();
    }
  });

  test('boughtMonkeyPawGuide===2 marks every wish learned (the F95 0.5.1 bug)', async ({ game: page }) => {
    // The exact reported bug: a 0.5.1 save where the Monkey Paw guide had
    // already been purchased loaded with no wish buttons except "I wish
    // for anything". The guide-bought flag survived the migration, but
    // none of the legacy per-wish flags translated to monkeyPawLearned,
    // so the MonkeyPaw passage's <<for setup.MonkeyPaw.list()>> loop
    // skipped every entry.
    await goToPassage(page, 'CityMap');

    const migrated = await page.evaluate(() => {
      const legacy = {
        boughtMonkeyPawGuide: 2,
        // Mimics the 0.5.1 WitchController.unlockMonkeyPawWishes side
        // effects: every per-wish flag set together with $wishAnything.
        wishActivity:     1,
        wishTraptheghost: 1,
        wishSanity:       1,
        wishLeave:        1,
        wishKnowledge:    1,
        wishDawn:         1,
        wishAnything:     true,
      };
      SugarCube.setup.applySaveDefaults(legacy);
      return legacy;
    });

    expect(migrated.monkeyPawLearned).toEqual({
      activity:     true,
      trapTheGhost: true,
      sanity:       true,
      leave:        true,
      knowledge:    true,
      dawn:         true,
    });
    // Pre-split saves had a single "learned" bit that gated both
    // label and description; the migration mirrors that into the
    // post-split monkeyPawEffectsKnown map so a 0.5.1 save still
    // shows descriptions after upgrading.
    expect(migrated.monkeyPawEffectsKnown).toEqual({
      activity:     true,
      trapTheGhost: true,
      sanity:       true,
      leave:        true,
      knowledge:    true,
      dawn:         true,
    });
    expect(migrated.wishAnything).toBe(true);
    expect(migrated.boughtMonkeyPawGuide).toBe(2);
  });

  test('boughtMonkeyPawGuide===2 alone (no per-wish flags) still unlocks every wish', async ({ game: page }) => {
    // Defensive: a save shape that lost the $wish<Name> scatter (e.g.
    // already partially migrated, or a custom export) but kept the guide
    // flag must still expose every wish. The guide is the source of truth
    // for "every spell is unlocked".
    await goToPassage(page, 'CityMap');

    const migrated = await page.evaluate(() => {
      const legacy = { boughtMonkeyPawGuide: 2 };
      SugarCube.setup.applySaveDefaults(legacy);
      return legacy;
    });

    expect(migrated.monkeyPawLearned).toEqual({
      activity:     true,
      trapTheGhost: true,
      sanity:       true,
      leave:        true,
      knowledge:    true,
      dawn:         true,
    });
    expect(migrated.wishAnything).toBe(true);
  });

  test('after migration, every wish in the catalogue reports as learned', async ({ game: page }) => {
    // End-to-end check against the live setup.MonkeyPaw API, so a future
    // catalogue rename (e.g. renaming the 'trapTheGhost' id) would fail
    // this test alongside the migration itself.
    await goToPassage(page, 'CityMap');

    const allLearned = await page.evaluate(() => {
      // Apply migration to the live State, then ask the controller.
      Object.assign(SugarCube.State.variables, { boughtMonkeyPawGuide: 2 });
      SugarCube.setup.applySaveDefaults(SugarCube.State.variables);
      return SugarCube.setup.MonkeyPaw.list().every(function (w) {
        return SugarCube.setup.MonkeyPaw.isLearned(w.id);
      });
    });

    expect(allLearned).toBe(true);
  });

  test('migration is a no-op when no legacy wish flags or guide are present', async ({ game: page }) => {
    // A fresh save without any Monkey Paw history should keep its empty
    // (or absent) monkeyPawLearned map and never gain a stray wishAnything.
    await goToPassage(page, 'CityMap');

    const migrated = await page.evaluate(() => {
      const legacy = {};
      SugarCube.setup.applySaveDefaults(legacy);
      return legacy;
    });

    expect(migrated.monkeyPawLearned).toBeUndefined();
    expect(migrated.wishAnything).toBeUndefined();
  });

  test('migration floors mc.lvl at 1', async ({ game: page }) => {
    // A save carrying a sub-1 level (corrupted, hand-edited, or
    // damaged by an older bug) should be clamped back to 1 on load
    // so downstream level-gated systems don't divide by zero or
    // walk off the start of the XP table.
    await goToPassage(page, 'CityMap');

    const floored = await page.evaluate(() => {
      const cases = [
        { mc: { lvl: 0 } },
        { mc: { lvl: -3 } },
        { mc: { lvl: null } },
        { mc: {} }
      ];
      cases.forEach(function (c) { SugarCube.setup.applySaveDefaults(c); });
      return cases.map(function (c) { return c.mc.lvl; });
    });

    expect(floored).toEqual([1, 1, 1, 1]);
  });

  test('migration leaves mc.lvl untouched when already >= 1', async ({ game: page }) => {
    await goToPassage(page, 'CityMap');

    const preserved = await page.evaluate(() => {
      const save = { mc: { lvl: 7 } };
      SugarCube.setup.applySaveDefaults(save);
      return save.mc.lvl;
    });

    expect(preserved).toBe(7);
  });

  // --- Hunt-mode migration --------------------------------------

  test('legacy save (pre-hunt) gets $run/$ectoplasm/$runsStarted defaults', async ({ game: page }) => {
    // A v1/v2 save predates the hunt subsystem entirely. Loading
    // should populate the three hunt-mode state vars with their
    // safe-default classic-mode values.
    await goToPassage(page, 'CityMap');

    const migrated = await page.evaluate(() => {
      const legacy = {};
      SugarCube.setup.applySaveDefaults(legacy);
      return legacy;
    });

    expect(migrated.run).toBeNull();
    expect(migrated.ectoplasm).toBe(0);
    expect(migrated.runsStarted).toBe(0);
  });

  test('migration preserves a mid-hunt $run object', async ({ game: page }) => {
    // If a save is taken mid-hunt, the $run object survives
    // applySaveDefaults intact (the defaulter only fills undefined
    // / null fields).
    await goToPassage(page, 'CityMap');

    const liveRun = {
      seed: 42,
      number: 3,
      modifiers: ['pheromones'],
      loadout: { tools: ['emf'] },
      objective: 'rescue',
      floorplan: { seed: 42, rooms: [], edges: [], spawnRoomId: null, loot: {}, bossRoomId: null }
    };
    const migrated = await page.evaluate((run) => {
      const save = { run: run, ectoplasm: 7, runsStarted: 3 };
      SugarCube.setup.applySaveDefaults(save);
      return save;
    }, liveRun);

    expect(migrated.run).toEqual(liveRun);
    expect(migrated.ectoplasm).toBe(7);
    expect(migrated.runsStarted).toBe(3);
  });

  test('round-trip preserves a mid-hunt save', async ({ game: page }) => {
    // Full Save.serialize() / deserialize() cycle in a live
    // session. Catches any subtle scrub-on-save behavior that
    // applySaveDefaults can't reproduce on its own.
    await goToPassage(page, 'CityMap');
    await page.evaluate(() => SugarCube.setup.HuntController.startHunt({ seed: 12345 }));
    await commitToSave(page);

    const blob = await page.evaluate(() => SugarCube.Save.serialize());
    await resetGame(page);
    await page.evaluate((b) => SugarCube.Save.deserialize(b), blob);

    const after = await page.evaluate(() => ({
      run: SugarCube.State.variables.run,
      ectoplasm: SugarCube.State.variables.ectoplasm,
      runsStarted: SugarCube.State.variables.runsStarted,
    }));
    expect(after.run.seed).toBe(12345);
    expect(after.run.number).toBe(1);
    expect(after.run.modifiers.length).toBe(2);
    expect(Array.isArray(after.run.floorplan.rooms)).toBe(true);
    expect(after.runsStarted).toBe(1);
  });

  test('ectoplasm and runsStarted survive across ended runs in a save', async ({ game: page }) => {
    // Lifetime counters persist across run boundaries. A serialize
    // taken after end() must still know how many runs have been
    // attempted and how many mL of ectoplasm the player has banked.
    await goToPassage(page, 'CityMap');
    await page.evaluate(() => {
      SugarCube.setup.HuntController.startHunt({ seed: 1 });
      SugarCube.setup.HuntController.endHunt(true);
      SugarCube.setup.HuntController.startHunt({ seed: 2 });
      SugarCube.setup.HuntController.endHunt(false);
    });
    await commitToSave(page);

    const before = await page.evaluate(() => ({
      run: SugarCube.State.variables.run,
      ectoplasm: SugarCube.State.variables.ectoplasm,
      runsStarted: SugarCube.State.variables.runsStarted,
    }));
    expect(before.run).toBeNull();
    expect(before.runsStarted).toBe(2);

    const blob = await page.evaluate(() => SugarCube.Save.serialize());
    await resetGame(page);
    await page.evaluate((b) => SugarCube.Save.deserialize(b), blob);

    const after = await page.evaluate(() => ({
      run: SugarCube.State.variables.run,
      ectoplasm: SugarCube.State.variables.ectoplasm,
      runsStarted: SugarCube.State.variables.runsStarted,
    }));
    expect(after).toEqual(before);
  });

  test('load redirects a moment pointing at a removed passage to Livingroom', async ({ game: page }) => {
    // When a release renames or removes a passage, existing saves
    // whose current moment.title points at the gone passage would
    // otherwise hit SugarCube's "passage does not exist" error and
    // refuse to load at all. SaveMigration rewrites any such moment
    // to a known-safe fallback (Livingroom) so the player keeps their
    // progress and lands somewhere benign.
    await goToPassage(page, 'CityMap');
    await setVar(page, 'mc.money', 999);
    await commitToSave(page);

    const passage = await page.evaluate(() => {
      const blob = SugarCube.Save.serialize();
      // Mutate the moment title to a passage that doesn't exist.
      // Save serialization is opaque, so go via the in-memory object
      // surface instead: rewrite history, then re-serialize.
      const idx = SugarCube.State.activeIndex !== undefined
        ? SugarCube.State.activeIndex
        : SugarCube.State.history.length - 1;
      SugarCube.State.history[idx].title = 'PassageThatDoesNotExist_' + Date.now();
      const mutated = SugarCube.Save.serialize();
      SugarCube.Save.deserialize(mutated);
      return SugarCube.State.passage;
    });

    expect(passage).toBe('Livingroom');
    expect(await getVar(page, 'mc.money')).toBe(999);
  });

  test('resetSaveToFallback preserves progression and resets transient state', async ({ game: page }) => {
    // Cross-version fallback contract: when a save's metadata.version
    // doesn't match the running build's SAVE_VERSION, we carry the
    // player's earned progression forward but throw away anything
    // transient. Driven directly on a synthetic vars object so the
    // assertions don't depend on Save serialization details.
    await goToPassage(page, 'CityMap');

    const after = await page.evaluate(() => {
      const vars = {
        // Progression that must survive:
        mc: {
          name: 'Maud', money: 777, sanity: 50, lust: 60,
          corruption: 7, lvl: 4, exp: 33,
          energy: 6, energyMax: 12,
          beautyBase: 30, beautyModifier: 12,
          frozenBeauty: 88,         // hunt-only override -- must drop
          possessionResidue: 3,
        },
        ectoplasm: 250,
        runsStarted: 14,
        equipment: { emf: 3, spiritbox: 3, gwb: 5, glass: 5, temperature: 5, uvl: 5 },
        spiritboxLvl: 3,
        crucifixAmount: 2,
        hasPSpray: 1, hasPSprayCharges: 4,
        meta: { unlocks: { 'foo': 1 }, bannedModifiers: ['bar'], rerollCharges: 2 },
        achievements: { 'first-hunt': { at: 1 } },
        monkeyPawLearned: { activity: true, knowledge: true },
        ghostInfoCollected: { Shade: true, Spirit: true },
        ectoplasmQuestStage: 3,
        relationshipBlake: 4,
        lostClothing: ['jeansState'],
        rememberTopOuter: 'tshirt0', rememberBottomOuter: 'jeans0',
        // Companion stat row + marker:
        companion: { name: 'Brook' },
        brook: { sanity: 80, lust: 20, chanceToAttack: 5 },

        // Transient state that must be wiped:
        run: { seed: 99, number: 5, modifiers: [], floorplan: { rooms: [], edges: [], spawnRoomId: null } },
        huntMode: 2,                                       // POSSESSED
        tools: { emf: { activated: 1, activationTime: 42 }, uvl: { activated: 1, activationTime: 7 } },
        succubusEvent: { eventCD: 1, pcStage: 3 },
        tentacles: { stageAll: 2 },
        webcam: { showCD: 1, money: 999 },                 // not the MC's wallet -- webcam pay
        summoning: { text: 'whoosh' },
        cursedHomeItem: 'tv', cursedHomeItemActive: true,
        temperature: -8,
        deliverySpecialOrder: true,
        deliveryCorrectThisShift: 2, deliveryStreak: 5,
        pendingHuntHouseId: 'owaissa',
        hauntedHouse: 'owaissa',
        prowlActivated: true, prowlActivationTime: 60, elapsedTimeProwl: 30,
        twinsEventActive: true,
        // Clock somewhere weird:
        hours: 23, minutes: 45, meridiem: 'PM',
      };
      SugarCube.setup.resetSaveToFallback(vars);
      return vars;
    });

    // --- Preserved fields survive intact -----------------------
    expect(after.mc.name).toBe('Maud');
    expect(after.mc.money).toBe(777);
    expect(after.mc.sanity).toBe(50);
    expect(after.mc.lvl).toBe(4);
    expect(after.mc.exp).toBe(33);
    expect(after.mc.corruption).toBe(7);
    expect(after.mc.possessionResidue).toBe(3);
    expect(after.mc.beautyBase).toBe(30);
    expect(after.mc.beautyModifier).toBe(12);
    expect(after.ectoplasm).toBe(250);
    expect(after.runsStarted).toBe(14);
    expect(after.equipment.emf).toBe(3);
    expect(after.spiritboxLvl).toBe(3);
    expect(after.crucifixAmount).toBe(2);
    expect(after.hasPSpray).toBe(1);
    expect(after.hasPSprayCharges).toBe(4);
    expect(after.meta.unlocks.foo).toBe(1);
    expect(after.meta.rerollCharges).toBe(2);
    expect(after.achievements['first-hunt']).toEqual({ at: 1 });
    expect(after.monkeyPawLearned.knowledge).toBe(true);
    expect(after.ghostInfoCollected.Shade).toBe(true);
    expect(after.ectoplasmQuestStage).toBe(3);
    expect(after.relationshipBlake).toBe(4);
    expect(after.lostClothing).toEqual(['jeansState']);
    expect(after.rememberTopOuter).toBe('tshirt0');
    expect(after.companion).toEqual({ name: 'Brook' });
    expect(after.brook.sanity).toBe(80);

    // --- mc.frozenBeauty is stripped (hunt-only override) ------
    expect(after.mc.frozenBeauty).toBeUndefined();

    // --- Transient state is reset ------------------------------
    expect(after.run).toBeNull();
    expect(after.huntMode).toBe(0);
    expect(after.tools.emf.activated).toBe(0);
    expect(after.tools.emf.activationTime).toBe(0);
    expect(after.tools.uvl.activated).toBe(0);
    expect(after.succubusEvent).toEqual({});
    expect(after.tentacles).toEqual({});
    expect(after.webcam).toEqual({});
    expect(after.summoning).toEqual({});
    expect(after.cursedHomeItem).toBe('');
    expect(after.cursedHomeItemActive).toBe(false);
    expect(after.temperature).toBe(0);
    expect(after.deliverySpecialOrder).toBe(false);
    expect(after.deliveryCorrectThisShift).toBe(0);
    expect(after.deliveryStreak).toBe(0);
    expect(after.pendingHuntHouseId).toBeNull();
    expect(after.hauntedHouse).toBeNull();

    // --- Clock parked at 11 AM ---------------------------------
    expect(after.hours).toBe(11);
    expect(after.minutes).toBe(0);
    expect(after.meridiem).toBe('AM');
  });

  test('cross-version save load drops the MC in the Livingroom at 11 AM', async ({ game: page }) => {
    // End-to-end check on the Save.onLoad wiring: a save whose
    // metadata.version doesn't match SAVE_VERSION should come back
    // with the player's MC stats intact but the clock + passage reset.
    // SaveMigration's onSave handler stamps metadata.version on every
    // serialize; we register a one-shot follow-up onSave that downgrades
    // the stamp to v1 so the next load sees a "legacy" save.
    await goToPassage(page, 'CityMap');
    await setVar(page, 'mc.money', 555);
    await setVar(page, 'mc.lvl', 9);
    await setVar(page, 'ectoplasm', 88);
    await setVar(page, 'hours', 22);
    await setVar(page, 'minutes', 17);
    await setVar(page, 'huntMode', 2);
    await commitToSave(page);

    const blob = await page.evaluate(() => {
      const downgrade = function (save) {
        save.metadata = save.metadata || {};
        save.metadata.version = 1;
        SugarCube.Save.onSave.delete(downgrade);
      };
      SugarCube.Save.onSave.add(downgrade);
      return SugarCube.Save.serialize();
    });

    await resetGame(page);
    await page.evaluate((b) => SugarCube.Save.deserialize(b), blob);

    expect(await page.evaluate(() => SugarCube.State.passage)).toBe('Livingroom');
    expect(await getVar(page, 'hours')).toBe(11);
    expect(await getVar(page, 'minutes')).toBe(0);
    expect(await getVar(page, 'meridiem')).toBe('AM');
    expect(await getVar(page, 'mc.money')).toBe(555);
    expect(await getVar(page, 'mc.lvl')).toBe(9);
    expect(await getVar(page, 'ectoplasm')).toBe(88);
    expect(await getVar(page, 'run')).toBeNull();
    expect(await getVar(page, 'huntMode')).toBe(0);
  });

  test('SAVE_VERSION marker is at the hunt-aware schema version', async ({ game: page }) => {
    // v3 = hunt-mode subsystem landed. v6 = $hunt bundle removed
    // (state folded onto $huntMode + $run). Future downstream tooling
    // can read this off save.metadata.version.
    await goToPassage(page, 'CityMap');
    const v = await page.evaluate(() => SugarCube.setup.SAVE_VERSION);
    expect(v).toBeGreaterThanOrEqual(6);
  });
});
