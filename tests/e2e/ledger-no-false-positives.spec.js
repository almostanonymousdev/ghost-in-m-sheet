/**
 * setup.Ledger — false-positive coverage at the passage / passage-flow level.
 *
 * The unit spec ([tests/ledger.spec.js](tests/ledger.spec.js)) covers each
 * mutator on its own. This spec exercises the real gameplay flows that
 * touch tracked fields end-to-end: sleeping, the time-cross-midnight
 * widget, the bedroom restore, a hunt payout, and a save/load cycle.
 *
 * Every test subscribes to setup.StoryEvents.Event.CHEAT_USED before the
 * gameplay action and asserts no ledger:* divergence fires. A test failure
 * here means a real player flow would spuriously flag the player as a
 * cheater — much worse than the unit spec missing a code path.
 */
const { test, expect } = require('../fixtures');
const { setVar, getVar, goToPassage, callSetup } = require('../helpers');

/** Begin recording CHEAT_USED events. Returns a marker the test can read back. */
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

/** Pop the recorded ledger-sourced CHEAT_USED events. */
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

test.describe('setup.Ledger — no spurious CHEAT_USED on real flows', () => {
	test('Sleep → Wake restores energy and does not flag the ledger', async ({ game: page }) => {
		await setVar(page, 'hours', 21);
		await setVar(page, 'minutes', 0);
		await page.evaluate(() => SugarCube.setup.Mc.setEnergy(3));
		await startRecording(page);

		await goToPassage(page, 'Bedroom');
		await page.locator('.passage').getByRole('link', { name: 'Sleep', exact: true }).click();
		await page.waitForFunction(() => SugarCube.State.passage === 'Sleep');
		await page.locator('.passage').getByRole('link', { name: 'Wake up' }).click();
		await page.waitForFunction(() => SugarCube.State.passage === 'Bedroom');

		const energy = await getVar(page, 'mc.energy');
		const energyMax = await callSetup(page, 'setup.Mc.energyMax()');
		expect(energy).toBe(energyMax);

		const fired = await pollCheats(page);
		expect(fired).toEqual([]);
	});

	test('addTime widget crossing midnight runs the audit cleanly', async ({ game: page }) => {
		await setVar(page, 'hours', 23);
		await setVar(page, 'minutes', 50);
		await page.evaluate(() => {
			SugarCube.setup.Mc.setMoney(75);
			SugarCube.setup.Mc.setSanity(50);
			SugarCube.setup.Mc.setEnergy(6);
			SugarCube.setup.Mc.setLust(10);
			SugarCube.State.variables.ectoplasm = 3;
		});
		await startRecording(page);

		/* Crossing midnight inside addTime invokes setup.Tick.resetCooldowns,
		   which runs the ledger audit at the top. If any of the mutators
		   above failed to mirror to $ledger, the audit fires CHEAT_USED. */
		await page.evaluate(() => {
			SugarCube.setup.Time.addMinutes(20);
		});

		const hour = await getVar(page, 'hours');
		expect(hour).toBeLessThan(23);

		const fired = await pollCheats(page);
		expect(fired).toEqual([]);
	});

	test('consumeEnergyDrink through the controller stays clean across midnight', async ({ game: page }) => {
		await setVar(page, 'hours', 23);
		await setVar(page, 'minutes', 55);
		await page.evaluate(() => {
			SugarCube.setup.Mc.setEnergy(2);
			SugarCube.State.variables.energyDrinkAmount = 3;
		});
		await startRecording(page);

		await page.evaluate(() => {
			SugarCube.setup.Mc.consumeEnergyDrink();
			SugarCube.setup.Mc.consumeEnergyDrink();
			// Force the day-rollover audit to run with the just-mutated energy.
			SugarCube.setup.Tick.resetCooldowns();
		});

		const drinks = await getVar(page, 'energyDrinkAmount');
		expect(drinks).toBe(1);
		const fired = await pollCheats(page);
		expect(fired).toEqual([]);
	});

	test('HauntConditions.removeEnergy stays clean across the audit', async ({ game: page }) => {
		await page.evaluate(() => {
			SugarCube.setup.Mc.setEnergy(10);
			SugarCube.State.variables.exhausted = false;
		});
		await startRecording(page);

		const ok = await page.evaluate(() => {
			const a = SugarCube.setup.HauntConditions.removeEnergy(4);
			const b = SugarCube.setup.HauntConditions.removeEnergy(3);
			SugarCube.setup.Tick.resetCooldowns();
			return a && b;
		});
		expect(ok).toBe(true);
		expect(await getVar(page, 'mc.energy')).toBe(3);

		const fired = await pollCheats(page);
		expect(fired).toEqual([]);
	});

	test('save then load: ledger survives serialization without firing', async ({ game: page }) => {
		await page.evaluate(() => {
			SugarCube.setup.Mc.setMoney(444);
			SugarCube.setup.Mc.setSanity(28);
			SugarCube.setup.Mc.setEnergy(5);
			SugarCube.setup.Mc.setLust(33);
			SugarCube.State.variables.ectoplasm = 0;
			SugarCube.setup.HuntController.addEctoplasm(17);
		});
		await startRecording(page);

		const result = await page.evaluate(() => {
			/* Flush the working copy into the active history moment so
			   Save.serialize sees our mutations. */
			var idx = SugarCube.State.activeIndex !== undefined
				? SugarCube.State.activeIndex
				: SugarCube.State.history.length - 1;
			var moment = SugarCube.State.history[idx];
			moment.variables = JSON.parse(JSON.stringify(SugarCube.State.variables));
			var blob = SugarCube.Save.serialize();
			SugarCube.State.variables.mc.money = 1; // junk we expect load to overwrite
			SugarCube.Save.deserialize(blob);
			SugarCube.setup.Tick.resetCooldowns();
			return {
				money:  SugarCube.State.variables.mc.money,
				ecto:   SugarCube.State.variables.ectoplasm,
				diffs:  SugarCube.setup.Ledger.audit()
			};
		});
		expect(result.money).toBe(444);
		expect(result.ecto).toBe(17);
		expect(result.diffs).toEqual([]);

		const fired = await pollCheats(page);
		expect(fired).toEqual([]);
	});

	test('synthetic many-day passage walk does not flag the ledger', async ({ game: page }) => {
		/* Drive the player through a synthesized week: each loop iteration
		   does a representative mix of mutations and then crosses midnight
		   so the audit fires every "day". A regression in any owning
		   controller would push the live value out of sync with the mirror
		   on at least one of these iterations, and the audit would catch it. */
		await page.evaluate(() => {
			SugarCube.State.variables.hours = 22;
			SugarCube.State.variables.minutes = 0;
			SugarCube.setup.Mc.setMoney(50);
			SugarCube.setup.Mc.setSanity(40);
			SugarCube.setup.Mc.setEnergy(5);
			SugarCube.setup.Mc.setLust(0);
			SugarCube.State.variables.ectoplasm = 0;
		});
		await startRecording(page);

		await page.evaluate(() => {
			const Mc = SugarCube.setup.Mc;
			const H  = SugarCube.setup.HuntController;
			for (var day = 0; day < 7; day++) {
				Mc.earn(20);
				Mc.removeMoney(5);
				Mc.addEnergy(-2);
				Mc.addSanity(day % 2 === 0 ? -3 : 4);
				Mc.addLust(7);
				Mc.clampLust();
				H.addEctoplasm(6);
				if (H.ectoplasm() >= 3) H.removeEctoplasm(3);
				// Cross midnight: 22:00 + 180 min = next day 01:00.
				SugarCube.setup.Time.addMinutes(180);
				SugarCube.State.variables.hours = 22;
				SugarCube.State.variables.minutes = 0;
			}
		});

		const fired = await pollCheats(page);
		expect(fired).toEqual([]);
	});

	test('actual console-style edit DOES flag the ledger at midnight (positive control)', async ({ game: page }) => {
		/* Sanity check: the no-false-positive spec must not be passing
		   because the audit is broken. This positive control exercises the
		   real "player edits State.variables in the console" path and
		   asserts the audit DOES fire — proving the detector still works. */
		await page.evaluate(() => {
			SugarCube.setup.Mc.setMoney(10);
			SugarCube.State.variables.ectoplasm = 0;
			SugarCube.setup.Ledger.resync();
		});
		await startRecording(page);

		await page.evaluate(() => {
			// Bypass the controller — exactly what a cheating player would do.
			SugarCube.State.variables.mc.money = 99999;
			SugarCube.setup.Tick.resetCooldowns();
		});

		const fired = await pollCheats(page);
		expect(fired.length).toBe(1);
		expect(fired[0].source).toBe('ledger:money');
		expect(fired[0].actual).toBe(99999);
	});
});
