const { test, expect } = require('./fixtures');
const { goToPassage, setVar, resetGame } = require('./helpers');

/*
 * Save/load round-trip tests.
 *
 * SaveMigration.tw runs on every save (scrub) and load (apply defaults
 * + migrate legacy shapes). These tests lock in three guarantees that
 * are otherwise easy to silently regress when someone refactors a
 * variable name or class shape:
 *
 *   1. ROUND-TRIP — saving and loading the current state produces a
 *      visibly identical game. Catches class-instance dehydration,
 *      undefined survival, scrub side-effects on live state.
 *   2. GHOST PROTOTYPE — Ghost is a prototype-based class
 *      (passages/ghosts/GhostController.tw:227). Plain-object
 *      "regressions" look fine in console but lose every method.
 *   3. LEGACY MIGRATION — old saves stored hunt state as a scatter of
 *      flat $ghost / $ghostName / $ghostEvidence / etc. variables;
 *      SaveMigration consolidates them into $hunt. If that logic
 *      breaks, players with old saves silently lose progress.
 *
 * The "snapshot only what we care about" pattern keeps tests robust
 * against drift in timestamps, random nonces, and other state that
 * SugarCube touches during serialize but isn't player-visible.
 */

const TRACKED_VARS = [
  'mc.money',
  'mc.energy',
  'mc.sanity',
  'mc.lust',
  'mc.corruption',
  'hours',
  'minutes',
  'firstVisitDeliveryHub',
  'firstVisitWitchShop',
  'jeansState',
  'tshirtState',
];

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

  test('round-trip preserves CityMap state with custom stats', async ({ game: page }) => {
    await goToPassage(page, 'CityMap');
    await setVar(page, 'mc.money', 257);
    await setVar(page, 'mc.energy', 7);
    await setVar(page, 'mc.lust', 42);
    await setVar(page, 'hours', 14);
    await setVar(page, 'minutes', 30);
    await setVar(page, 'firstVisitWitchShop', false);
    await commitToSave(page);

    const before = await snapshot(page);

    const blob = await page.evaluate(() => SugarCube.Save.serialize());
    await resetGame(page);
    await page.evaluate((b) => SugarCube.Save.deserialize(b), blob);

    const after = await snapshot(page);
    expect(after).toEqual(before);
  });

  test('round-trip preserves wardrobe + delivery flags', async ({ game: page }) => {
    await goToPassage(page, 'CityMap');
    await setVar(page, 'jeansState', 'in wardrobe');
    await setVar(page, 'tshirtState', 'in laundry');
    await setVar(page, 'firstVisitDeliveryHub', false);
    await commitToSave(page);

    const before = await snapshot(page);

    const blob = await page.evaluate(() => SugarCube.Save.serialize());
    await resetGame(page);
    await page.evaluate((b) => SugarCube.Save.deserialize(b), blob);

    expect(await snapshot(page)).toEqual(before);
  });

  test('Ghost behaviour survives a save/load round-trip', async ({ game: page }) => {
    // The codebase deliberately stores $hunt as plain serializable data
    // (name, evidence ids, mode, ...) and projects to a Ghost instance
    // on demand via setup.Ghosts.active() — see GhostController.tw:447
    // and the comment at line 441-446. That sidesteps class-rehydration
    // entirely. The contract this test pins: after round-trip,
    // setup.Ghosts.active() returns a working Ghost instance with the
    // same observable behaviour.
    await goToPassage(page, 'CityMap');
    await page.evaluate(() => SugarCube.setup.Ghosts.startHunt('Shade'));
    await commitToSave(page);

    // The Ghost constructor isn't exposed on setup.Ghosts, so we infer
    // "is a Ghost instance" by checking it shares the prototype with
    // entries from setup.Ghosts.list() (which are constructed via
    // `new Ghost(...)` at module load).
    const live = await page.evaluate(() => {
      const g = SugarCube.setup.Ghosts.active();
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
      const g = SugarCube.setup.Ghosts.active();
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

  test('legacy v1 save migrates flat $ghost* vars into $hunt via setup.applySaveDefaults', async ({ game: page }) => {
    await goToPassage(page, 'CityMap');

    const migrated = await page.evaluate(() => {
      // The legacy shape, exactly as documented in
      // passages/updates/SaveMigration.tw lines 114-148.
      const legacy = {
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

    // New consolidated shape exists.
    expect(migrated.hunt).toBeTruthy();
    expect(migrated.hunt.name).toBe('Shade');
    expect(migrated.hunt.realName).toBe('Shade');           // saveMimic=0 → realName == name
    expect(migrated.hunt.evidence).toEqual(['emf', 'temperature', 'gwb']);
    expect(migrated.hunt.mode).toBe(2);
    expect(migrated.hunt.trapped).toBe(true);
    expect(migrated.hunt.room).toEqual({ name: 'kitchen' });

    // Legacy fields deleted (they're documented as removed at lines 141-148).
    for (const key of [
      'ghost', 'ghostName', 'ghostEvidence', 'ghostRoom',
      'ghostIsTrapped', 'ghostHuntingMode', 'saveMimic',
      'ghostActivity', 'ghostRoomCI',
    ]) {
      expect(migrated[key], `legacy field "${key}" should be deleted`).toBeUndefined();
    }
  });

  test('saveMimic=1 in legacy save preserves the visible name as Mimic-cover', async ({ game: page }) => {
    // The Mimic ghost masquerades as another ghost; legacy saves stored
    // the cover name in $ghostName and the real type in $saveMimic. The
    // migration must preserve both: visible name vs. realName.
    await goToPassage(page, 'CityMap');

    const migrated = await page.evaluate(() => {
      const legacy = {
        ghostName:        'Shade',          // what the player saw
        ghostEvidence:    ['emf', 'gwb', 'glass'],
        ghostHuntingMode: 1,
        saveMimic:        1,                // it's actually a Mimic
      };
      SugarCube.setup.applySaveDefaults(legacy);
      return legacy.hunt;
    });

    expect(migrated.name).toBe('Shade');
    expect(migrated.realName).toBe('Mimic');
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
        wishAnything:     1,
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
    expect(migrated.wishAnything).toBe(1);
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
    expect(migrated.wishAnything).toBe(1);
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
});
