/**
 * setup.Ledger shadow-ledger cheat detection.
 *
 * Pins:
 *   - Every legitimate write to a tracked field (mc.money via the
 *     accessors / earn, ectoplasm via addEctoplasm / removeEctoplasm)
 *     keeps $ledger in lock-step with the live value.
 *   - A bypass write (cheat: direct State.variables edit) is caught
 *     by setup.Ledger.audit() and surfaced as setup.StoryEvents.Event
 *     .CHEAT_USED with ctx.source = 'ledger:<field>'.
 *   - After firing, the ledger resyncs so the next midnight audit
 *     doesn't re-fire on the same edit.
 *   - The audit hooks into the day-rollover pipeline (setup.Tick
 *     .resetCooldowns).
 */
const { test, expect } = require('@playwright/test');
const { openGame, resetGame } = require('./helpers');

test.describe('setup.Ledger', () => {
	let page;

	test.beforeAll(async ({ browser }) => {
		page = await openGame(browser);
	});

	test.afterAll(async () => {
		await page.close();
	});

	test.beforeEach(async () => {
		await resetGame(page);
		await page.waitForFunction(() => SugarCube.setup.Ledger && SugarCube.setup.Ledger.audit);
		await page.evaluate(() => {
			window.__leSubs = window.__leSubs || [];
			while (window.__leSubs.length) window.__leSubs.shift()();
			SugarCube.setup.Ledger.resync();
		});
	});

	test('controller exposes the canonical API + OWNED_VARS', async () => {
		const shape = await page.evaluate(() => {
			const L = SugarCube.setup.Ledger;
			return {
				owned:      Array.from(L.OWNED_VARS || []),
				frozen:     Object.isFrozen(L.OWNED_VARS),
				hasMoney:    typeof L.money       === 'function',
				hasEcto:     typeof L.ectoplasm   === 'function',
				hasSanity:   typeof L.sanity      === 'function',
				hasLust:     typeof L.lust        === 'function',
				hasEnergy:   typeof L.energy      === 'function',
				hasRecMo:    typeof L.recordMoney     === 'function',
				hasRecEc:    typeof L.recordEctoplasm === 'function',
				hasRecSan:   typeof L.recordSanity    === 'function',
				hasRecLust:  typeof L.recordLust      === 'function',
				hasRecEn:    typeof L.recordEnergy    === 'function',
				hasAudit:    typeof L.audit          === 'function',
				hasAuditR:   typeof L.auditAndReport === 'function',
				hasResync:   typeof L.resync         === 'function'
			};
		});
		expect(shape.owned).toEqual(['ledger']);
		expect(shape.frozen).toBe(true);
		expect(shape.hasMoney).toBe(true);
		expect(shape.hasEcto).toBe(true);
		expect(shape.hasSanity).toBe(true);
		expect(shape.hasLust).toBe(true);
		expect(shape.hasEnergy).toBe(true);
		expect(shape.hasRecMo).toBe(true);
		expect(shape.hasRecEc).toBe(true);
		expect(shape.hasRecSan).toBe(true);
		expect(shape.hasRecLust).toBe(true);
		expect(shape.hasRecEn).toBe(true);
		expect(shape.hasAudit).toBe(true);
		expect(shape.hasAuditR).toBe(true);
		expect(shape.hasResync).toBe(true);
	});

	test('initState seeds the ledger from live values', async () => {
		const seeded = await page.evaluate(() => {
			const L = SugarCube.setup.Ledger;
			const V = SugarCube.State.variables;
			return {
				money:     L.money(),     liveMoney:  V.mc.money,
				ecto:      L.ectoplasm(), liveEcto:   V.ectoplasm,
				sanity:    L.sanity(),    liveSanity: V.mc.sanity,
				lust:      L.lust(),      liveLust:   V.mc.lust,
				energy:    L.energy(),    liveEnergy: V.mc.energy
			};
		});
		expect(seeded.money).toBe(seeded.liveMoney);
		expect(seeded.ecto).toBe(seeded.liveEcto);
		expect(seeded.sanity).toBe(seeded.liveSanity);
		expect(seeded.lust).toBe(seeded.liveLust);
		expect(seeded.energy).toBe(seeded.liveEnergy);
	});

	test('setMoney() mirrors through to the ledger', async () => {
		const after = await page.evaluate(() => {
			SugarCube.setup.Mc.setMoney(250);
			return SugarCube.setup.Ledger.money();
		});
		expect(after).toBe(250);
	});

	test('addMoney() mirrors through to the ledger', async () => {
		const after = await page.evaluate(() => {
			const before = SugarCube.State.variables.mc.money;
			SugarCube.setup.Mc.addMoney(40);
			return {
				live:   SugarCube.State.variables.mc.money,
				mirror: SugarCube.setup.Ledger.money(),
				delta:  SugarCube.State.variables.mc.money - before
			};
		});
		expect(after.delta).toBe(40);
		expect(after.mirror).toBe(after.live);
	});

	test('removeMoney() mirrors through to the ledger', async () => {
		const after = await page.evaluate(() => {
			SugarCube.setup.Mc.setMoney(100);
			SugarCube.setup.Mc.removeMoney(30);
			return {
				live:   SugarCube.State.variables.mc.money,
				mirror: SugarCube.setup.Ledger.money()
			};
		});
		expect(after.live).toBe(70);
		expect(after.mirror).toBe(70);
	});

	test('earn() mirrors through to the ledger', async () => {
		const after = await page.evaluate(() => {
			SugarCube.setup.Mc.setMoney(50);
			SugarCube.setup.Mc.earn(25);
			return {
				live:   SugarCube.State.variables.mc.money,
				mirror: SugarCube.setup.Ledger.money()
			};
		});
		expect(after.live).toBe(75);
		expect(after.mirror).toBe(75);
	});

	test('addEctoplasm() mirrors through to the ledger', async () => {
		const after = await page.evaluate(() => {
			SugarCube.State.variables.ectoplasm = 0;
			SugarCube.setup.Ledger.resync();
			SugarCube.setup.HuntController.addEctoplasm(15);
			return {
				live:   SugarCube.State.variables.ectoplasm,
				mirror: SugarCube.setup.Ledger.ectoplasm()
			};
		});
		expect(after.live).toBe(15);
		expect(after.mirror).toBe(15);
	});

	test('removeEctoplasm() mirrors through to the ledger', async () => {
		const after = await page.evaluate(() => {
			SugarCube.State.variables.ectoplasm = 20;
			SugarCube.setup.Ledger.resync();
			const ok = SugarCube.setup.HuntController.removeEctoplasm(5);
			return {
				ok:     ok,
				live:   SugarCube.State.variables.ectoplasm,
				mirror: SugarCube.setup.Ledger.ectoplasm()
			};
		});
		expect(after.ok).toBe(true);
		expect(after.live).toBe(15);
		expect(after.mirror).toBe(15);
	});

	test('removeEctoplasm() rejection (insufficient funds) does not write to the ledger', async () => {
		const result = await page.evaluate(() => {
			SugarCube.State.variables.ectoplasm = 3;
			SugarCube.setup.Ledger.resync();
			const ok = SugarCube.setup.HuntController.removeEctoplasm(100);
			return {
				ok:     ok,
				live:   SugarCube.State.variables.ectoplasm,
				mirror: SugarCube.setup.Ledger.ectoplasm()
			};
		});
		expect(result.ok).toBe(false);
		expect(result.live).toBe(3);
		expect(result.mirror).toBe(3);
	});

	test('audit() returns [] when ledger matches live state', async () => {
		const diffs = await page.evaluate(() => {
			SugarCube.setup.Mc.setMoney(500);
			SugarCube.setup.Ledger.resync();
			return SugarCube.setup.Ledger.audit();
		});
		expect(diffs).toEqual([]);
	});

	test('audit() flags a console-style direct money edit', async () => {
		const diffs = await page.evaluate(() => {
			SugarCube.setup.Mc.setMoney(100);
			// simulate a player editing State.variables in the dev console
			SugarCube.State.variables.mc.money = 999999;
			return SugarCube.setup.Ledger.audit();
		});
		expect(diffs.length).toBe(1);
		expect(diffs[0].field).toBe('money');
		expect(diffs[0].source).toBe('ledger:money');
		expect(diffs[0].expected).toBe(100);
		expect(diffs[0].actual).toBe(999999);
	});

	test('audit() flags a console-style direct ectoplasm edit', async () => {
		const diffs = await page.evaluate(() => {
			SugarCube.State.variables.ectoplasm = 0;
			SugarCube.setup.Ledger.resync();
			SugarCube.State.variables.ectoplasm = 5000;
			return SugarCube.setup.Ledger.audit();
		});
		expect(diffs.length).toBe(1);
		expect(diffs[0].field).toBe('ectoplasm');
		expect(diffs[0].source).toBe('ledger:ectoplasm');
		expect(diffs[0].expected).toBe(0);
		expect(diffs[0].actual).toBe(5000);
	});

	test('auditAndReport() emits CHEAT_USED on divergence', async () => {
		const seen = await page.evaluate(() => {
			const SE = SugarCube.setup.StoryEvents;
			const events = [];
			window.__leSubs.push(
				SE.on(SE.Event.CHEAT_USED, (ctx) => events.push(ctx))
			);
			SugarCube.setup.Mc.setMoney(100);
			SugarCube.State.variables.mc.money = 7777;
			SugarCube.setup.Ledger.auditAndReport();
			return events;
		});
		expect(seen.length).toBe(1);
		expect(seen[0].source).toBe('ledger:money');
		expect(seen[0].expected).toBe(100);
		expect(seen[0].actual).toBe(7777);
	});

	test('auditAndReport() does NOT emit when state matches', async () => {
		const seen = await page.evaluate(() => {
			const SE = SugarCube.setup.StoryEvents;
			const events = [];
			window.__leSubs.push(
				SE.on(SE.Event.CHEAT_USED, (ctx) => events.push(ctx))
			);
			SugarCube.setup.Mc.setMoney(60);
			SugarCube.setup.Ledger.auditAndReport();
			return events;
		});
		expect(seen).toEqual([]);
	});

	test('auditAndReport() resyncs the ledger so the next audit does not double-fire', async () => {
		const counts = await page.evaluate(() => {
			const SE = SugarCube.setup.StoryEvents;
			let n = 0;
			window.__leSubs.push(
				SE.on(SE.Event.CHEAT_USED, () => { n++; })
			);
			SugarCube.setup.Mc.setMoney(50);
			SugarCube.State.variables.mc.money = 9999;
			SugarCube.setup.Ledger.auditAndReport();
			const first = n;
			SugarCube.setup.Ledger.auditAndReport();
			return { first: first, total: n };
		});
		expect(counts.first).toBe(1);
		expect(counts.total).toBe(1);
	});

	test('setup.Tick.resetCooldowns() runs the audit', async () => {
		const seen = await page.evaluate(() => {
			const SE = SugarCube.setup.StoryEvents;
			const events = [];
			window.__leSubs.push(
				SE.on(SE.Event.CHEAT_USED, (ctx) => events.push(ctx))
			);
			SugarCube.setup.Mc.setMoney(80);
			SugarCube.State.variables.mc.money = 12345;
			SugarCube.setup.Tick.resetCooldowns();
			return events;
		});
		expect(seen.length).toBe(1);
		expect(seen[0].source).toBe('ledger:money');
		expect(seen[0].actual).toBe(12345);
	});

	test('addSanity() mirrors through to the ledger (post-clamp)', async () => {
		const after = await page.evaluate(() => {
			SugarCube.setup.Mc.setSanity(50);
			SugarCube.setup.Mc.addSanity(-20);
			return {
				live:   SugarCube.State.variables.mc.sanity,
				mirror: SugarCube.setup.Ledger.sanity()
			};
		});
		expect(after.live).toBe(30);
		expect(after.mirror).toBe(30);
	});

	test('addSanity() ledger records the clamped-to-max value', async () => {
		const after = await page.evaluate(() => {
			const V = SugarCube.State.variables;
			V.mc.sanityMax = 100;
			SugarCube.setup.Mc.setSanity(90);
			SugarCube.setup.Mc.addSanity(50);
			return {
				live:   V.mc.sanity,
				mirror: SugarCube.setup.Ledger.sanity()
			};
		});
		expect(after.live).toBe(100);
		expect(after.mirror).toBe(100);
	});

	test('addSanity() ledger records the clamped-to-zero value on collapse', async () => {
		const after = await page.evaluate(() => {
			SugarCube.setup.Mc.setSanity(10);
			SugarCube.setup.Mc.addSanity(-50);
			return {
				live:   SugarCube.State.variables.mc.sanity,
				mirror: SugarCube.setup.Ledger.sanity()
			};
		});
		expect(after.live).toBe(0);
		expect(after.mirror).toBe(0);
	});

	test('setLust() mirrors through to the ledger', async () => {
		const after = await page.evaluate(() => {
			SugarCube.setup.Mc.setLust(40);
			return {
				live:   SugarCube.State.variables.mc.lust,
				mirror: SugarCube.setup.Ledger.lust()
			};
		});
		expect(after.live).toBe(40);
		expect(after.mirror).toBe(40);
	});

	test('addLust() mirrors through to the ledger (post-clamp)', async () => {
		const after = await page.evaluate(() => {
			SugarCube.setup.Mc.setLust(10);
			SugarCube.setup.Mc.addLust(15);
			return {
				live:   SugarCube.State.variables.mc.lust,
				mirror: SugarCube.setup.Ledger.lust()
			};
		});
		expect(after.live).toBe(25);
		expect(after.mirror).toBe(25);
	});

	test('addEnergy() mirrors through to the ledger', async () => {
		const after = await page.evaluate(() => {
			SugarCube.setup.Mc.setEnergy(5);
			SugarCube.setup.Mc.addEnergy(2);
			return {
				live:   SugarCube.State.variables.mc.energy,
				mirror: SugarCube.setup.Ledger.energy()
			};
		});
		expect(after.live).toBe(7);
		expect(after.mirror).toBe(7);
	});

	test('audit() flags a console-style direct sanity edit', async () => {
		const diffs = await page.evaluate(() => {
			SugarCube.setup.Mc.setSanity(60);
			SugarCube.State.variables.mc.sanity = 100;
			return SugarCube.setup.Ledger.audit();
		});
		expect(diffs.length).toBe(1);
		expect(diffs[0].field).toBe('sanity');
		expect(diffs[0].source).toBe('ledger:sanity');
		expect(diffs[0].expected).toBe(60);
		expect(diffs[0].actual).toBe(100);
	});

	test('audit() flags a console-style direct lust edit', async () => {
		const diffs = await page.evaluate(() => {
			SugarCube.setup.Mc.setLust(20);
			SugarCube.State.variables.mc.lust = 0;
			return SugarCube.setup.Ledger.audit();
		});
		expect(diffs.length).toBe(1);
		expect(diffs[0].field).toBe('lust');
		expect(diffs[0].source).toBe('ledger:lust');
		expect(diffs[0].expected).toBe(20);
		expect(diffs[0].actual).toBe(0);
	});

	test('audit() flags a console-style direct energy edit', async () => {
		const diffs = await page.evaluate(() => {
			SugarCube.setup.Mc.setEnergy(3);
			SugarCube.State.variables.mc.energy = 99;
			return SugarCube.setup.Ledger.audit();
		});
		expect(diffs.length).toBe(1);
		expect(diffs[0].field).toBe('energy');
		expect(diffs[0].source).toBe('ledger:energy');
		expect(diffs[0].expected).toBe(3);
		expect(diffs[0].actual).toBe(99);
	});

	test('flags BOTH money and ectoplasm when both diverge', async () => {
		const diffs = await page.evaluate(() => {
			SugarCube.setup.Mc.setMoney(100);
			SugarCube.State.variables.ectoplasm = 0;
			SugarCube.setup.Ledger.resync();
			SugarCube.State.variables.mc.money    = 5000;
			SugarCube.State.variables.ectoplasm   = 200;
			return SugarCube.setup.Ledger.audit();
		});
		const fields = diffs.map((d) => d.field).sort();
		expect(fields).toEqual(['ectoplasm', 'money']);
	});

	/* ------------------------------------------------------------------
	 * No-false-positive coverage.
	 *
	 * Each test below exercises a legitimate gameplay mutator that touches
	 * a tracked field and then asserts setup.Ledger.audit() is clean. If a
	 * mutator forgets to mirror through Ledger.record*, audit returns a
	 * divergence and the test fails — that's the signal a future writer
	 * has introduced a code path that the cheat detector would falsely
	 * flag as a console edit.
	 * ------------------------------------------------------------------ */

	test('addMoney/removeMoney loop leaves the ledger clean', async () => {
		const diffs = await page.evaluate(() => {
			const Mc = SugarCube.setup.Mc;
			Mc.setMoney(0);
			for (var i = 0; i < 25; i++) Mc.addMoney(7);
			for (var j = 0; j <  8; j++) Mc.removeMoney(3);
			return SugarCube.setup.Ledger.audit();
		});
		expect(diffs).toEqual([]);
	});

	test('setMoney to zero and to a large value leaves the ledger clean', async () => {
		const diffs = await page.evaluate(() => {
			SugarCube.setup.Mc.setMoney(0);
			SugarCube.setup.Mc.setMoney(987654);
			return SugarCube.setup.Ledger.audit();
		});
		expect(diffs).toEqual([]);
	});

	test('earn() through a full earn-spend cycle leaves the ledger clean', async () => {
		const diffs = await page.evaluate(() => {
			const Mc = SugarCube.setup.Mc;
			Mc.setMoney(0);
			Mc.earn(45);
			Mc.earn(10);
			Mc.removeMoney(20);
			Mc.earn(5);
			return SugarCube.setup.Ledger.audit();
		});
		expect(diffs).toEqual([]);
	});

	test('consumeEnergyDrink leaves the ledger clean', async () => {
		const diffs = await page.evaluate(() => {
			const V = SugarCube.State.variables;
			SugarCube.setup.Mc.setEnergy(2);
			V.energyDrinkAmount = 1;
			SugarCube.setup.Ledger.resync();
			SugarCube.setup.Mc.consumeEnergyDrink();
			return {
				diffs:  SugarCube.setup.Ledger.audit(),
				live:   V.mc.energy,
				mirror: SugarCube.setup.Ledger.energy()
			};
		});
		expect(diffs.diffs).toEqual([]);
		expect(diffs.live).toBe(diffs.mirror);
		expect(diffs.live).toBe(5);
	});

	test('consumeEnergyDrink with no drinks left leaves the ledger clean', async () => {
		const result = await page.evaluate(() => {
			const V = SugarCube.State.variables;
			SugarCube.setup.Mc.setEnergy(4);
			V.energyDrinkAmount = 0;
			SugarCube.setup.Ledger.resync();
			const ok = SugarCube.setup.Mc.consumeEnergyDrink();
			return {
				ok:    ok,
				diffs: SugarCube.setup.Ledger.audit()
			};
		});
		expect(result.ok).toBe(false);
		expect(result.diffs).toEqual([]);
	});

	test('addEnergy clamped to energyMax leaves the ledger clean', async () => {
		const result = await page.evaluate(() => {
			SugarCube.setup.Mc.setEnergy(0);
			const max = SugarCube.setup.Mc.energyMax();
			SugarCube.setup.Mc.addEnergy(max * 10);
			return {
				diffs:  SugarCube.setup.Ledger.audit(),
				live:   SugarCube.State.variables.mc.energy,
				max:    max
			};
		});
		expect(result.diffs).toEqual([]);
		expect(result.live).toBe(result.max);
	});

	test('addEnergy clamped to zero leaves the ledger clean', async () => {
		const result = await page.evaluate(() => {
			SugarCube.setup.Mc.setEnergy(1);
			SugarCube.setup.Mc.addEnergy(-100);
			return {
				diffs:  SugarCube.setup.Ledger.audit(),
				live:   SugarCube.State.variables.mc.energy
			};
		});
		expect(result.diffs).toEqual([]);
		expect(result.live).toBe(0);
	});

	test('addLust clamped to lustMax leaves the ledger clean', async () => {
		const result = await page.evaluate(() => {
			SugarCube.setup.Mc.setLust(0);
			const max = SugarCube.State.variables.mc.lustMax;
			SugarCube.setup.Mc.addLust(max * 10);
			return {
				diffs:  SugarCube.setup.Ledger.audit(),
				live:   SugarCube.State.variables.mc.lust,
				max:    max
			};
		});
		expect(result.diffs).toEqual([]);
		expect(result.live).toBe(result.max);
	});

	test('addLust clamped to zero leaves the ledger clean', async () => {
		const result = await page.evaluate(() => {
			SugarCube.setup.Mc.setLust(5);
			SugarCube.setup.Mc.addLust(-100);
			return {
				diffs:  SugarCube.setup.Ledger.audit(),
				live:   SugarCube.State.variables.mc.lust
			};
		});
		expect(result.diffs).toEqual([]);
		expect(result.live).toBe(0);
	});

	test('clampLust on a fractional value leaves the ledger clean', async () => {
		const result = await page.evaluate(() => {
			const m = SugarCube.State.variables.mc;
			m.lust = 12.345678;
			SugarCube.setup.Mc.clampLust();
			return {
				diffs:  SugarCube.setup.Ledger.audit(),
				live:   m.lust,
				mirror: SugarCube.setup.Ledger.lust()
			};
		});
		// clampLust rewrites mc.lust to a 2-decimal Number and records it,
		// so any direct mutation we did before is captured by the record
		// call and audit() should be clean.
		expect(result.diffs).toEqual([]);
		expect(result.live).toBe(result.mirror);
		expect(result.live).toBe(12.35);
	});

	test('addEctoplasm/removeEctoplasm loop leaves the ledger clean', async () => {
		const diffs = await page.evaluate(() => {
			const H = SugarCube.setup.HuntController;
			SugarCube.State.variables.ectoplasm = 0;
			SugarCube.setup.Ledger.resync();
			for (var i = 0; i < 12; i++) H.addEctoplasm(11);
			for (var j = 0; j <  5; j++) H.removeEctoplasm(7);
			return SugarCube.setup.Ledger.audit();
		});
		expect(diffs).toEqual([]);
	});

	test('HauntConditions.removeEnergy routes through setup.Mc and stays clean', async () => {
		const result = await page.evaluate(() => {
			SugarCube.setup.Mc.setEnergy(7);
			const ok = SugarCube.setup.HauntConditions.removeEnergy(3);
			return {
				ok:    ok,
				diffs: SugarCube.setup.Ledger.audit(),
				live:  SugarCube.State.variables.mc.energy
			};
		});
		expect(result.ok).toBe(true);
		expect(result.live).toBe(4);
		expect(result.diffs).toEqual([]);
	});

	test('HuntConditions.removeEnergy at exact balance flags exhaustion and stays clean', async () => {
		const result = await page.evaluate(() => {
			SugarCube.State.variables.exhausted = false;
			SugarCube.setup.Mc.setEnergy(2);
			const ok = SugarCube.setup.HauntConditions.removeEnergy(2);
			return {
				ok:        ok,
				diffs:     SugarCube.setup.Ledger.audit(),
				live:      SugarCube.State.variables.mc.energy,
				exhausted: SugarCube.State.variables.exhausted
			};
		});
		expect(result.ok).toBe(true);
		expect(result.live).toBe(0);
		expect(result.exhausted).toBe(true);
		expect(result.diffs).toEqual([]);
	});

	test('HuntConditions.removeEnergy rejection (insufficient) leaves the ledger clean', async () => {
		const result = await page.evaluate(() => {
			SugarCube.setup.Mc.setEnergy(1);
			const ok = SugarCube.setup.HauntConditions.removeEnergy(5);
			return {
				ok:    ok,
				diffs: SugarCube.setup.Ledger.audit(),
				live:  SugarCube.State.variables.mc.energy
			};
		});
		expect(result.ok).toBe(false);
		expect(result.live).toBe(1);
		expect(result.diffs).toEqual([]);
	});

	test('Mc.setSanity at min/max boundary leaves the ledger clean', async () => {
		const diffs = await page.evaluate(() => {
			SugarCube.setup.Mc.setSanity(0);
			SugarCube.setup.Mc.setSanity(SugarCube.setup.Mc.sanityMax());
			return SugarCube.setup.Ledger.audit();
		});
		expect(diffs).toEqual([]);
	});

	test('multi-step random walk over every Mc mutator leaves the ledger clean', async () => {
		/* Hammer every accessor in sequence. If any mutator forgot to
		   call setup.Ledger.record*, one of the live/mirror pairs will
		   diverge and audit() will surface it. */
		const diffs = await page.evaluate(() => {
			const Mc = SugarCube.setup.Mc;
			const H  = SugarCube.setup.HuntController;
			SugarCube.State.variables.ectoplasm = 0;
			SugarCube.setup.Ledger.resync();
			for (var i = 0; i < 50; i++) {
				Mc.addMoney(13);
				if (i % 3 === 0) Mc.removeMoney(5);
				if (i % 4 === 0) Mc.earn(2);
				Mc.addEnergy(i % 2 === 0 ? -1 : 2);
				Mc.addSanity(i % 5 === 0 ? -3 : 1);
				Mc.addLust(i % 7 === 0 ? -4 : 2);
				if (i % 6 === 0) Mc.clampLust();
				if (i % 8 === 0) Mc.setLust(0);
				H.addEctoplasm(i % 2 === 0 ? 4 : 1);
				if (i % 9 === 0 && H.ectoplasm() >= 2) H.removeEctoplasm(2);
			}
			return SugarCube.setup.Ledger.audit();
		});
		expect(diffs).toEqual([]);
	});

	test('repeated resetCooldowns on clean state does not emit CHEAT_USED', async () => {
		const seen = await page.evaluate(() => {
			const SE = SugarCube.setup.StoryEvents;
			const events = [];
			window.__leSubs.push(
				SE.on(SE.Event.CHEAT_USED, (ctx) => events.push(ctx))
			);
			// Three midnights with no mutations between → still no fire.
			SugarCube.setup.Tick.resetCooldowns();
			SugarCube.setup.Tick.resetCooldowns();
			SugarCube.setup.Tick.resetCooldowns();
			return events;
		});
		expect(seen).toEqual([]);
	});

	test('legitimate gameplay loop followed by resetCooldowns does not emit CHEAT_USED', async () => {
		const seen = await page.evaluate(() => {
			const SE = SugarCube.setup.StoryEvents;
			const Mc = SugarCube.setup.Mc;
			const H  = SugarCube.setup.HuntController;
			const events = [];
			window.__leSubs.push(
				SE.on(SE.Event.CHEAT_USED, (ctx) => events.push(ctx))
			);
			SugarCube.State.variables.ectoplasm = 0;
			SugarCube.setup.Ledger.resync();
			Mc.earn(100);
			Mc.removeMoney(40);
			Mc.addEnergy(-3);
			Mc.consumeEnergyDrink && Mc.consumeEnergyDrink();
			Mc.addSanity(-5);
			Mc.addLust(20);
			Mc.clampLust();
			H.addEctoplasm(25);
			H.removeEctoplasm(10);
			SugarCube.setup.Tick.resetCooldowns();
			return events.filter((e) => e && (e.source || '').startsWith('ledger:'));
		});
		expect(seen).toEqual([]);
	});

	test('save serialization + deserialization round-trip preserves the ledger', async () => {
		/* SugarCube's State.variables is a working copy of the active
		   moment — direct mutations DO NOT auto-write back to history,
		   and Save.serialize reads from history. So this test mutates
		   via the controllers, flushes State.variables into the active
		   moment, serializes, wipes the live values, then deserializes
		   and asserts the audit is clean against the restored state. */
		const result = await page.evaluate(() => {
			const Mc = SugarCube.setup.Mc;
			const H  = SugarCube.setup.HuntController;
			SugarCube.State.variables.ectoplasm = 0;
			Mc.setMoney(321);
			Mc.setSanity(42);
			Mc.setEnergy(7);
			Mc.setLust(33);
			H.addEctoplasm(12);
			// Flush the working copy into the active history moment so
			// Save.serialize picks up our mutations.
			var idx = SugarCube.State.activeIndex !== undefined
				? SugarCube.State.activeIndex
				: SugarCube.State.history.length - 1;
			var moment = SugarCube.State.history[idx];
			moment.variables = JSON.parse(JSON.stringify(SugarCube.State.variables));
			var blob = SugarCube.Save.serialize();
			// Trash live state between save and load — proves the load is
			// what's restoring the values, not the working copy.
			SugarCube.State.variables.mc.money = 99999;
			SugarCube.State.variables.ledger.money = 99999;
			SugarCube.Save.deserialize(blob);
			var diffs = SugarCube.setup.Ledger.audit();
			var live  = SugarCube.State.variables;
			return {
				diffs:    diffs,
				money:    live.mc.money,
				sanity:   live.mc.sanity,
				energy:   live.mc.energy,
				lust:     live.mc.lust,
				ecto:     live.ectoplasm,
				mirror: {
					money:    SugarCube.setup.Ledger.money(),
					sanity:   SugarCube.setup.Ledger.sanity(),
					energy:   SugarCube.setup.Ledger.energy(),
					lust:     SugarCube.setup.Ledger.lust(),
					ecto:     SugarCube.setup.Ledger.ectoplasm()
				}
			};
		});
		expect(result.diffs).toEqual([]);
		expect(result.money).toBe(321);
		expect(result.ecto).toBe(12);
		expect(result.mirror.money).toBe(result.money);
		expect(result.mirror.sanity).toBe(result.sanity);
		expect(result.mirror.energy).toBe(result.energy);
		expect(result.mirror.lust).toBe(result.lust);
		expect(result.mirror.ecto).toBe(result.ecto);
	});

	test('legacy save without $ledger seeds lazily without firing CHEAT_USED', async () => {
		const result = await page.evaluate(() => {
			const SE = SugarCube.setup.StoryEvents;
			const events = [];
			window.__leSubs.push(
				SE.on(SE.Event.CHEAT_USED, (ctx) => events.push(ctx))
			);
			const V = SugarCube.State.variables;
			V.mc.money    = 250;
			V.mc.sanity   = 35;
			V.mc.energy   = 6;
			V.mc.lust     = 18;
			V.ectoplasm   = 9;
			// Wipe the ledger as if loaded from a save that pre-dates it.
			V.ledger = null;
			// First audit must seed (via the lazy bundle()) and not fire.
			const diffs = SugarCube.setup.Ledger.audit();
			SugarCube.setup.Tick.resetCooldowns();
			return {
				diffs:  diffs,
				events: events.filter((e) => e && (e.source || '').startsWith('ledger:')),
				bundle: V.ledger
			};
		});
		expect(result.diffs).toEqual([]);
		expect(result.events).toEqual([]);
		expect(result.bundle).toEqual({
			money:     250,
			ectoplasm:   9,
			sanity:    35,
			lust:      18,
			energy:     6
		});
	});

	test('setMoney/setSanity/setEnergy/setLust direct accessors all mirror correctly', async () => {
		const result = await page.evaluate(() => {
			const Mc = SugarCube.setup.Mc;
			Mc.setMoney(11);
			Mc.setSanity(22);
			Mc.setEnergy(3);
			Mc.setLust(44);
			return {
				diffs:  SugarCube.setup.Ledger.audit(),
				mirror: {
					money:  SugarCube.setup.Ledger.money(),
					sanity: SugarCube.setup.Ledger.sanity(),
					energy: SugarCube.setup.Ledger.energy(),
					lust:   SugarCube.setup.Ledger.lust()
				}
			};
		});
		expect(result.diffs).toEqual([]);
		expect(result.mirror).toEqual({ money: 11, sanity: 22, energy: 3, lust: 44 });
	});
});
