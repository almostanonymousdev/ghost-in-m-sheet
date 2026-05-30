/**
 * setup.Ledger -- per-passage cheat detection window.
 *
 * The earlier audit only ran at midnight rollover. That left a
 * gap: a player could edit State.variables in the console, then
 * trigger a legitimate controller write (e.g. spend money) inside
 * the same in-game day, and the legitimate write would overwrite
 * the mirror before midnight ever rolled around -- masking the cheat.
 *
 * This spec proves the per-passage audit (wired into
 * setup.Tick.onPassageReady) closes that window. After a console
 * edit, the very next passage navigation must surface CHEAT_USED,
 * *before* any tracked-field mutator has a chance to overwrite the
 * mirror.
 */
const { test, expect } = require('../fixtures');
const { goToPassage } = require('../helpers');

async function startRecording(page) {
    await page.evaluate(() => {
        const SE = SugarCube.setup.StoryEvents;
        window.__ledgerEvents = [];
        window.__ledgerUnsub = SE.on(SE.Event.CHEAT_USED, (ctx) => {
            window.__ledgerEvents.push(ctx);
        });
        SugarCube.setup.Ledger.resync();
    });
}

async function pollCheats(page) {
    return page.evaluate(() => {
        try {
            if (typeof window.__ledgerUnsub === 'function') window.__ledgerUnsub();
        } catch (_) {}
        const out = (window.__ledgerEvents || []).filter(
            (e) => e && typeof e.source === 'string' && e.source.indexOf('ledger:') === 0
        );
        window.__ledgerEvents = [];
        return out;
    });
}

test.describe('setup.Ledger -- per-passage audit', () => {
    test('a console money edit is caught on the next passage navigation', async ({ game: page }) => {
        await page.evaluate(() => SugarCube.setup.Mc.setMoney(50));
        await startRecording(page);

        /* Console-style cheat: bypass the controller and set the live
           value directly. The mirror still reads 50 at this point. */
        await page.evaluate(() => {
            SugarCube.State.variables.mc.money = 99999;
        });

        /* No audit has run yet -- mirror still says 50, live says 99999. */
        const stillStale = await page.evaluate(
            () => SugarCube.setup.Ledger.audit().length
        );
        expect(stillStale, 'audit should still see the divergence pre-navigation').toBe(1);

        /* Navigate. onPassageReady must fire auditAndReport at the top,
           emitting CHEAT_USED and resyncing the mirror. */
        await goToPassage(page, 'Bedroom');

        const fired = await pollCheats(page);
        expect(fired.length).toBe(1);
        expect(fired[0].source).toBe('ledger:money');
        expect(fired[0].expected).toBe(50);
        expect(fired[0].actual).toBe(99999);
    });

    test('a console ectoplasm edit is caught on the next passage navigation', async ({ game: page }) => {
        await page.evaluate(() => {
            SugarCube.State.variables.ectoplasm = 5;
            SugarCube.setup.Ledger.resync();
        });
        await startRecording(page);

        await page.evaluate(() => {
            SugarCube.State.variables.ectoplasm = 5000;
        });

        await goToPassage(page, 'Bedroom');

        const fired = await pollCheats(page);
        expect(fired.length).toBe(1);
        expect(fired[0].source).toBe('ledger:ectoplasm');
        expect(fired[0].expected).toBe(5);
        expect(fired[0].actual).toBe(5000);
    });

    test('legitimate gameplay flow over many passages stays clean', async ({ game: page }) => {
        await page.evaluate(() => {
            SugarCube.setup.Mc.setMoney(100);
            SugarCube.setup.Mc.setSanity(40);
            SugarCube.setup.Mc.setEnergy(5);
        });
        await startRecording(page);

        await goToPassage(page, 'Bedroom');
        await page.evaluate(() => {
            SugarCube.setup.Mc.earn(20);
            SugarCube.setup.Mc.addSanity(-3);
        });
        await goToPassage(page, 'House');
        await page.evaluate(() => {
            SugarCube.setup.Mc.removeMoney(10);
            SugarCube.setup.Mc.addEnergy(-1);
        });
        await goToPassage(page, 'Bedroom');

        const fired = await pollCheats(page);
        expect(fired).toEqual([]);
    });

    test('legitimate spend in the same day does NOT mask a prior console edit', async ({ game: page }) => {
        /* The regression this whole change is about: under the
           midnight-only audit, a console edit followed by a legitimate
           write in the same in-game day would clobber the mirror with
           the new live value and slip past the next midnight audit.
           With per-passage auditing the cheat is caught at the first
           navigation after the edit, so the legitimate write can't
           mask it. */
        await page.evaluate(() => SugarCube.setup.Mc.setMoney(40));
        await startRecording(page);

        /* Console edit. */
        await page.evaluate(() => {
            SugarCube.State.variables.mc.money = 50000;
        });

        /* First navigation -- audit fires here. */
        await goToPassage(page, 'Bedroom');

        /* Now a legitimate controller spend. Per-passage audit already
           caught the cheat above, so this write to the resynced mirror
           is harmless. Without per-passage auditing, this write would
           reach midnight with the mirror lined up to the (still
           inflated) live value, masking the cheat. */
        await page.evaluate(() => SugarCube.setup.Mc.removeMoney(100));
        await goToPassage(page, 'House');

        const fired = await pollCheats(page);
        expect(fired.length).toBe(1);
        expect(fired[0].source).toBe('ledger:money');
        expect(fired[0].expected).toBe(40);
        expect(fired[0].actual).toBe(50000);
    });

    test('audit fires before any in-passage controller mutation', async ({ game: page }) => {
        /* If the audit ran AFTER the migration / ensure block in
           onPassageReady, an ensure step that legitimately touched a
           tracked field could resync the mirror before the audit ran
           and mask the cheat. Pin the ordering by stamping a divergence
           and checking the CHEAT_USED ctx still shows the pre-mutation
           expected value, not a post-mutation one. */
        await page.evaluate(() => SugarCube.setup.Mc.setMoney(60));
        await startRecording(page);
        await page.evaluate(() => {
            SugarCube.State.variables.mc.money = 8888;
        });

        await goToPassage(page, 'Bedroom');

        const fired = await pollCheats(page);
        expect(fired.length).toBe(1);
        /* expected must equal what the mirror held BEFORE the audit;
           if an ensure-call had overwritten the mirror first, this
           would be 8888 (the live value), not 60. */
        expect(fired[0].expected).toBe(60);
        expect(fired[0].actual).toBe(8888);
    });
});
