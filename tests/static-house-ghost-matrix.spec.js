const { test, expect } = require('./fixtures');
const { callSetup } = require('./helpers');

/* Cross-product smoke: every (static-house, ghost) combination must
   start cleanly, populate $run with the named ghost, pin the
   catalogue's forced modifiers, generate a floor-plan matching the
   catalogue blueprint, and end without throwing.

   This catches regressions where a specific ghost's hunt mechanics
   conflict with a specific static-house's forced modifiers (e.g. a
   ghost that relies on clothes-stealing dropped into Ironclad, which
   forces `no_clothes_theft`), or where a catalogue entry forgets to
   list a modifier the rest of the pipeline assumes (e.g. the warden
   outfit chip's HUD subscriber expecting the warden_outfit id).

   18 ghosts x 3 static houses = 54 combinations. We run all 54 inside
   one test so the shared `game` fixture only resets once; individual
   failures bubble up with the descriptive `tag` argument so the diff
   pinpoints which pair regressed. */
test.describe('Static-house x ghost matrix', () => {
    test('every (static-house, ghost) pair starts, pins forced modifiers, and ends cleanly', async ({ game: page }) => {
        test.setTimeout(120_000);

        const houseIds = await callSetup(page, 'setup.HuntHouses.ids()');
        const ghostNames = await callSetup(page, 'setup.Ghosts.names()');

        expect(houseIds.length, 'no static houses to iterate').toBeGreaterThan(0);
        expect(ghostNames.length, 'no ghosts to iterate').toBeGreaterThan(0);

        for (const houseId of houseIds) {
            const houseCat = await callSetup(page, `setup.HuntHouses.byId(${JSON.stringify(houseId)})`);
            const forcedModifiers = (houseCat && houseCat.forcedModifiers) || [];
            const planRoomIds = (houseCat.plan && houseCat.plan.rooms || [])
                .map(function (r) { return r.id; })
                .slice()
                .sort();

            for (const ghostName of ghostNames) {
                const tag = `${houseId} x ${ghostName}`;

                /* Wipe any prior run state. end() is the canonical
                   teardown -- clears $run, flips $huntMode back to
                   NONE, and unfreezes MC beauty. */
                await page.evaluate(() => {
                    if (SugarCube.setup.HuntController.isActive()) {
                        SugarCube.setup.HuntController.end();
                    }
                });

                /* startHunt picks the ghost seed-deterministically.
                   To force a specific (house, ghost) pair, we run
                   startHunt and then override ghostName / disguiseName
                   / evidence via setField, mirroring the pattern used
                   in brook-missing.spec.js. The setField path is the
                   public hunt-state writer, so the override stays
                   inside the controller API (no raw $run writes). */
                const startError = await page.evaluate(({ id, name }) => {
                    try {
                        SugarCube.setup.HuntController.startHunt({ seed: 1, staticHouseId: id });
                        var g = SugarCube.setup.Ghosts.getByName(name);
                        if (!g) return 'getByName returned null for ' + name;
                        var evidenceIds = g.evidence.map(function (e) { return e.id; });
                        SugarCube.setup.HuntController.setField('ghostName', name);
                        SugarCube.setup.HuntController.setField('disguiseName', name);
                        SugarCube.setup.HuntController.setField('evidence', evidenceIds);
                        return null;
                    } catch (e) {
                        return (e && e.stack) ? e.stack : String(e);
                    }
                }, { id: houseId, name: ghostName });
                expect(startError, tag).toBeNull();

                // --- $huntMode + $run identity ---
                expect(await callSetup(page, 'setup.HuntController.isHunting()'), tag).toBe(true);
                expect(await callSetup(page, 'setup.HuntController.staticHouseId()'), tag).toBe(houseId);
                expect(await callSetup(page, 'setup.HuntController.ghostName()'), tag).toBe(ghostName);

                // --- Floor plan matches catalogue blueprint exactly ---
                const fpRoomIds = await callSetup(page, 'setup.HuntController.active().floorplan.rooms.map(function (r) { return r.id; })');
                expect(Array.isArray(fpRoomIds), tag).toBe(true);
                expect(fpRoomIds.length, tag).toBeGreaterThan(0);
                if (planRoomIds.length > 0) {
                    expect(fpRoomIds.slice().sort(), tag).toEqual(planRoomIds);
                }

                // --- Forced modifiers pinned (regardless of seed/banlist) ---
                const activeModifiers = await callSetup(page, 'setup.HuntController.modifiers()');
                for (const fm of forcedModifiers) {
                    expect(activeModifiers, `${tag}: missing forced modifier ${fm}`).toContain(fm);
                }

                // --- Active ghost rehydrates with the overridden identity ---
                const activeGhost = await callSetup(page, 'setup.HuntController.activeGhost()');
                expect(activeGhost, tag).toBeTruthy();
                expect(activeGhost.name, tag).toBe(ghostName);

                // --- Address resolves to the catalogue label (not seed-derived) ---
                const addr = await callSetup(page, 'setup.HuntController.address().formatted');
                expect(addr, tag).toBe(houseCat.label);

                // --- End the hunt without throwing ---
                const endError = await page.evaluate(() => {
                    try {
                        SugarCube.setup.HuntController.end();
                        return null;
                    } catch (e) {
                        return (e && e.stack) ? e.stack : String(e);
                    }
                });
                expect(endError, tag).toBeNull();
                expect(await callSetup(page, 'setup.HuntController.isHunting()'), tag).toBe(false);
                expect(await callSetup(page, 'setup.HuntController.active()'), tag).toBeNull();
            }
        }
    });

    /* Tighter pair-specific assertion: Ironclad pins `no_clothes_theft`,
       so the STEAL_CHECK filter has to drop allowed=false for any
       ghost. Without this, a ghost's per-prowl steal roll would
       fire in a prison, which is wrong per the catalogue contract. */
    test('Ironclad blocks clothes-theft for every ghost', async ({ game: page }) => {
        test.setTimeout(60_000);
        const ghostNames = await callSetup(page, 'setup.Ghosts.names()');

        for (const ghostName of ghostNames) {
            const tag = `ironclad x ${ghostName}`;
            await page.evaluate(() => {
                if (SugarCube.setup.HuntController.isActive()) {
                    SugarCube.setup.HuntController.end();
                }
            });
            await page.evaluate((name) => {
                SugarCube.setup.HuntController.startHunt({ seed: 1, staticHouseId: 'ironclad' });
                SugarCube.setup.HuntController.setField('ghostName', name);
                SugarCube.setup.HuntController.setField('disguiseName', name);
            }, ghostName);

            /* STEAL_CHECK takes { forceTrigger, suppress, chanceMult,
               modifierIds }. The no_clothes_theft subscriber flips
               suppress=true; HuntProwl.shouldTriggerSteal reads
               ctx.suppress and short-circuits. We pass the live
               modifier list (forcedModifiers were just appended on
               startHunt) so the filter sees the same shape it would
               at the prowl roll site. */
            const ctx = await page.evaluate(() => {
                var modifierIds = SugarCube.setup.HuntController.modifiers();
                return SugarCube.setup.Hunt.applyFilter(
                    SugarCube.setup.Hunt.Event.STEAL_CHECK,
                    { forceTrigger: false, suppress: false, chanceMult: 1, modifierIds: modifierIds }
                );
            });
            expect(ctx.suppress, tag).toBe(true);

            await page.evaluate(() => SugarCube.setup.HuntController.end());
        }
    });
});
