const { test, expect } = require('./fixtures');
const { callSetup, getVar } = require('./helpers');

/* Schema snapshot for the $run bundle. The $run object is the
   per-hunt state owned by setup.HuntController. Its shape is the
   wire format for save migration, the SNAPSHOT filter, the lobby
   resume path, and every consumer in passages/hunt/. Adding,
   removing, or renaming a field on $run silently breaks any of
   those consumers; this spec pins the shape so the diff falls out
   as a test failure instead of a runtime regression.

   Three stages are pinned:

     1. After start({...})           -- the minimal seed/floorplan
        scaffolding. Used by lobby resume + procedural test stamps.
     2. After startHunt({...})       -- the full production shape.
        Floor plan, ghost identity, evidence, preRunStatCaps.
     3. After lifecycle moves        -- optional fields that the
        hunt may or may not stamp depending on which path it takes
        (trap, room lock, success, failure, meta-shop reroll).

   When adding a field to $run, extend EXPECTED_AFTER_START or
   EXPECTED_AFTER_START_HUNT here (and document it in the table at
   the top of CLAUDE.local.md). When removing one, drop it from the
   set and from any save migration that still reads it. The "no
   unknown fields" assertions are the safety net for forgetting
   either step. */

const EXPECTED_AFTER_START = new Set([
    'seed',
    'number',
    'modifiers',
    'loadout',
    'objective',
    'staticHouseId',
    'currentRoomId',
    'searchedFurniture',
    'collectedLoot',
    'lights'
]);

const EXPECTED_AFTER_START_HUNT = new Set([
    ...EXPECTED_AFTER_START,
    /* startHunt populates these on top of the start() shape: */
    'floorplan',
    'ghostName',
    'disguiseName',
    'evidence',
    'preRunStatCaps'
]);

/* Optional fields. These are NOT present after start() / startHunt();
   they're stamped on demand by specific lifecycle moves. Pinned with
   the move that owns them so a future refactor that renames one
   surfaces here, not at a vague consumer. */
const OPTIONAL_FIELDS = {
    trapped:        'HuntLocks.trapGhost',
    exitLock:       'HuntLocks.trapGhost / clearExitLock',
    roomLock:       'HuntLocks.lockCurrentRoom / clearRoomLock',
    outcome:        'HuntController.markSuccess / markFailure',
    failureReason:  'HuntController.markFailure',
    rerolls:        'HuntShop.rerollModifiers'
};

test.describe('$run schema', () => {
    test('start() populates exactly the expected fields', async ({ game: page }) => {
        await page.evaluate(() => {
            if (SugarCube.setup.HuntController.isActive()) {
                SugarCube.setup.HuntController.end();
            }
            SugarCube.setup.HuntController.start({ seed: 42 });
        });

        const run = await getVar(page, 'run');
        expect(run, '$run missing after start()').toBeTruthy();
        const actualKeys = new Set(Object.keys(run));

        for (const key of EXPECTED_AFTER_START) {
            expect(actualKeys.has(key), `start() missing required field: ${key}`).toBe(true);
        }
        for (const key of actualKeys) {
            expect(EXPECTED_AFTER_START.has(key),
                `start() stamped unexpected field: ${key} -- add to EXPECTED_AFTER_START or remove from start()`).toBe(true);
        }

        /* Type sanity for the fields that drive the most consumers. */
        expect(typeof run.seed).toBe('number');
        expect(typeof run.number).toBe('number');
        expect(Array.isArray(run.modifiers)).toBe(true);
        expect(typeof run.loadout).toBe('object');
        expect(typeof run.objective).toBe('string');
        expect(run.staticHouseId === null || typeof run.staticHouseId === 'string').toBe(true);
        expect(typeof run.currentRoomId).toBe('string');
        expect(run.searchedFurniture).toBeNull();
        expect(Array.isArray(run.collectedLoot)).toBe(true);
        expect(typeof run.lights).toBe('object');
    });

    test('startHunt() populates exactly the expected fields', async ({ game: page }) => {
        await page.evaluate(() => {
            if (SugarCube.setup.HuntController.isActive()) {
                SugarCube.setup.HuntController.end();
            }
            SugarCube.setup.HuntController.startHunt({ seed: 42, staticHouseId: 'owaissa' });
        });

        const run = await getVar(page, 'run');
        expect(run, '$run missing after startHunt()').toBeTruthy();
        const actualKeys = new Set(Object.keys(run));

        for (const key of EXPECTED_AFTER_START_HUNT) {
            expect(actualKeys.has(key), `startHunt() missing required field: ${key}`).toBe(true);
        }
        for (const key of actualKeys) {
            expect(EXPECTED_AFTER_START_HUNT.has(key),
                `startHunt() stamped unexpected field: ${key} -- add to EXPECTED_AFTER_START_HUNT or stop setting it`).toBe(true);
        }

        /* Additional type sanity for production-only fields. */
        expect(typeof run.floorplan).toBe('object');
        expect(Array.isArray(run.floorplan.rooms)).toBe(true);
        expect(Array.isArray(run.floorplan.edges)).toBe(true);
        expect(typeof run.ghostName).toBe('string');
        expect(typeof run.disguiseName).toBe('string');
        expect(Array.isArray(run.evidence)).toBe(true);
        expect(typeof run.preRunStatCaps).toBe('object');
        expect(typeof run.preRunStatCaps.sanityMax).toBe('number');
        expect(typeof run.preRunStatCaps.energyMax).toBe('number');
    });

    test('cheatStampMinimalRun produces the production-compatible shape', async ({ game: page }) => {
        /* The minimal cheat stamp is used by Ghosts.cheatStartHunt
           and by hand-rolled test setups (helpers.setHuntMode).
           Every field it stamps must be in EXPECTED_AFTER_START_HUNT
           or in OPTIONAL_FIELDS so unit specs don't end up with a
           shape that drifts from production. */
        await page.evaluate(() => {
            if (SugarCube.setup.HuntController.isActive()) {
                SugarCube.setup.HuntController.end();
            }
            SugarCube.setup.Ghosts.cheatStartHunt('Shade');
        });

        const run = await getVar(page, 'run');
        expect(run, 'cheatStartHunt did not stamp $run').toBeTruthy();
        for (const key of Object.keys(run)) {
            const isProductionShape =
                EXPECTED_AFTER_START_HUNT.has(key) || (key in OPTIONAL_FIELDS);
            expect(isProductionShape,
                `cheatStampMinimalRun stamped key not in production shape: ${key}`).toBe(true);
        }
    });

    test('trapGhost stamps run.trapped + run.exitLock with the documented shape', async ({ game: page }) => {
        await page.evaluate(() => {
            if (SugarCube.setup.HuntController.isActive()) {
                SugarCube.setup.HuntController.end();
            }
            SugarCube.setup.HuntController.startHunt({ seed: 42 });
            SugarCube.setup.HuntController.trapGhost('cursedItem');
        });

        const run = await getVar(page, 'run');
        expect(run.trapped).toBe(true);
        expect(run.exitLock).toBeTruthy();
        expect(run.exitLock.unlockBy).toBe('cursedItem');
        expect(Object.keys(run.exitLock)).toEqual(['unlockBy']);
    });

    test('lockCurrentRoom stamps run.roomLock as a boolean true', async ({ game: page }) => {
        await page.evaluate(() => {
            if (SugarCube.setup.HuntController.isActive()) {
                SugarCube.setup.HuntController.end();
            }
            SugarCube.setup.HuntController.startHunt({ seed: 42 });
            SugarCube.setup.HuntController.lockCurrentRoom();
        });

        const run = await getVar(page, 'run');
        expect(run.roomLock).toBe(true);
    });

    test('markSuccess stamps run.outcome and clears run.failureReason', async ({ game: page }) => {
        await page.evaluate(() => {
            if (SugarCube.setup.HuntController.isActive()) {
                SugarCube.setup.HuntController.end();
            }
            SugarCube.setup.HuntController.startHunt({ seed: 42 });
            SugarCube.setup.HuntController.markSuccess();
        });

        const run = await getVar(page, 'run');
        const Outcome = await callSetup(page, 'setup.HuntEnums.Outcome');
        expect(run.outcome).toBe(Outcome.SUCCESS);
        expect(run.failureReason).toBeNull();
    });

    test('markFailure stamps run.outcome + run.failureReason', async ({ game: page }) => {
        await page.evaluate(() => {
            if (SugarCube.setup.HuntController.isActive()) {
                SugarCube.setup.HuntController.end();
            }
            SugarCube.setup.HuntController.startHunt({ seed: 42 });
            SugarCube.setup.HuntController.markFailure(
                SugarCube.setup.HuntEnums.FailureReason.WRONG_CALL
            );
        });

        const run = await getVar(page, 'run');
        const Outcome = await callSetup(page, 'setup.HuntEnums.Outcome');
        const FR = await callSetup(page, 'setup.HuntEnums.FailureReason');
        expect(run.outcome).toBe(Outcome.FAILURE);
        expect(run.failureReason).toBe(FR.WRONG_CALL);
    });

    test('OPTIONAL_FIELDS catalogue covers every non-base field consumed by hunt controllers', async () => {
        /* Source-level lint: every `run.X` read or write in
           passages/hunt/*.js must reference either a base field
           (EXPECTED_AFTER_START_HUNT) or a documented optional
           field (OPTIONAL_FIELDS). Catches the case where a future
           hotfix adds a new $run field and forgets to add it to
           this schema. */
        const fs = require('fs');
        const path = require('path');
        const huntDir = path.resolve(__dirname, '..', 'passages', 'hunt');
        const files = fs.readdirSync(huntDir).filter(n => n.endsWith('.js'));
        const known = new Set([
            ...EXPECTED_AFTER_START_HUNT,
            ...Object.keys(OPTIONAL_FIELDS)
        ]);

        const offenders = [];
        for (const f of files) {
            const body = fs.readFileSync(path.join(huntDir, f), 'utf8');
            const re = /\brun\.([a-zA-Z_][a-zA-Z0-9_]*)/g;
            let m;
            while ((m = re.exec(body)) !== null) {
                const field = m[1];
                if (!known.has(field)) {
                    offenders.push(`${f}: run.${field}`);
                }
            }
        }
        expect(offenders, `Unknown $run.X fields used in passages/hunt/. Add to EXPECTED_AFTER_START_HUNT or OPTIONAL_FIELDS:\n${offenders.join('\n')}`).toEqual([]);
    });
});
