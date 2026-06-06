/**
 * setup.Flashbacks controller contract.
 *
 * Pins:
 *   - Catalogue lookup by id / by scene-passage name.
 *   - markSeen / hasSeen / seenCount / totalCount round-trip.
 *   - byLocation groups catalogue entries by their `location` field.
 *   - enterReplay snapshots MC stats + time; exitReplay restores them.
 *   - SceneEvents.VIEWED auto-marks scenes when visited outside
 *     replay mode, and DOES NOT mark them during replay.
 *   - During replay, navigating off the scene's source passage bounces
 *     the player back to Flashbacks and clears the active id.
 *   - The FlashbackEnter wrapper hands off to the scene without
 *     tripping the containment redirect.
 */
const { test, expect } = require('./fixtures');
const { setVar, getVar, callSetup, goToPassage } = require('./helpers');

test.describe('setup.Flashbacks', () => {

	test('controller is exposed with the expected API', async ({ game: page }) => {
		const shape = await page.evaluate(() => {
			const F = SugarCube.setup.Flashbacks;
			return {
				all: typeof F.all === 'function',
				byId: typeof F.byId === 'function',
				byPassage: typeof F.byPassage === 'function',
				hasSeen: typeof F.hasSeen === 'function',
				markSeen: typeof F.markSeen === 'function',
				seenCount: typeof F.seenCount === 'function',
				totalCount: typeof F.totalCount === 'function',
				byLocation: typeof F.byLocation === 'function',
				enterReplay: typeof F.enterReplay === 'function',
				exitReplay: typeof F.exitReplay === 'function',
				isReplaying: typeof F.isReplaying === 'function',
				activeId: typeof F.activeId === 'function',
				activeEntry: typeof F.activeEntry === 'function'
			};
		});
		Object.values(shape).forEach(v => expect(v).toBe(true));
	});

	test('catalogue is non-empty and lookups are consistent', async ({ game: page }) => {
		const data = await page.evaluate(() => {
			const F = SugarCube.setup.Flashbacks;
			const entries = F.all();
			return {
				count: entries.length,
				firstId: entries[0] && entries[0].id,
				firstPassage: entries[0] && entries[0].scenePassage,
				roundTrip: entries[0] && F.byId(entries[0].id).scenePassage === entries[0].scenePassage,
				passageRoundTrip: entries[0] && F.byPassage(entries[0].scenePassage).id === entries[0].id,
				totalCount: F.totalCount()
			};
		});
		expect(data.count).toBeGreaterThan(0);
		expect(data.totalCount).toBe(data.count);
		expect(data.roundTrip).toBe(true);
		expect(data.passageRoundTrip).toBe(true);
	});

	test('byId returns null for unknown ids; byPassage returns null for unknown passages', async ({ game: page }) => {
		const result = await page.evaluate(() => {
			const F = SugarCube.setup.Flashbacks;
			return {
				badId: F.byId('does-not-exist'),
				badPassage: F.byPassage('NoSuchPassage')
			};
		});
		expect(result.badId).toBeNull();
		expect(result.badPassage).toBeNull();
	});

	test('markSeen / hasSeen / seenCount round-trip on a known id', async ({ game: page }) => {
		const result = await page.evaluate(() => {
			const F = SugarCube.setup.Flashbacks;
			const id = F.all()[0].id;
			SugarCube.State.variables.flashbacks = { seen: {}, active: null };
			const before = F.hasSeen(id);
			const firstMark = F.markSeen(id);
			const after = F.hasSeen(id);
			const secondMark = F.markSeen(id);
			return { before, firstMark, after, secondMark, count: F.seenCount() };
		});
		expect(result.before).toBe(false);
		expect(result.firstMark).toBe(true);
		expect(result.after).toBe(true);
		expect(result.secondMark).toBe(false);
		expect(result.count).toBe(1);
	});

	test('markSeen rejects unknown ids', async ({ game: page }) => {
		const result = await page.evaluate(() => {
			SugarCube.State.variables.flashbacks = { seen: {}, active: null };
			return SugarCube.setup.Flashbacks.markSeen('not-a-real-id');
		});
		expect(result).toBe(false);
	});

	test('byLocation groups entries by their location field', async ({ game: page }) => {
		const data = await page.evaluate(() => {
			const F = SugarCube.setup.Flashbacks;
			const groups = F.byLocation();
			const sections = Object.keys(groups);
			const flat = sections.reduce((acc, k) => acc.concat(groups[k]), []);
			return {
				sections: sections,
				totalEntries: flat.length,
				catalogueCount: F.totalCount(),
				allHaveLocation: flat.every(e => typeof e.location === 'string' && e.location.length > 0)
			};
		});
		expect(data.sections.length).toBeGreaterThan(0);
		expect(data.totalEntries).toBe(data.catalogueCount);
		expect(data.allHaveLocation).toBe(true);
	});

	test('enterReplay snapshots MC stats; exitReplay restores them', async ({ game: page }) => {
		await setVar(page, 'mc.lust', 30);
		await setVar(page, 'mc.sanity', 80);
		await setVar(page, 'mc.energy', 5);
		await setVar(page, 'hours', 14);
		await setVar(page, 'minutes', 30);

		await page.evaluate(() => {
			const F = SugarCube.setup.Flashbacks;
			const id = F.all()[0].id;
			F.enterReplay(id);
		});

		expect(await page.evaluate(() => SugarCube.setup.Flashbacks.isReplaying())).toBe(true);

		// Mutate state mid-replay -- exitReplay must roll these back.
		await setVar(page, 'mc.lust', 90);
		await setVar(page, 'mc.sanity', 10);
		await setVar(page, 'mc.energy', 0);
		await setVar(page, 'hours', 23);
		await setVar(page, 'minutes', 59);

		await page.evaluate(() => SugarCube.setup.Flashbacks.exitReplay());

		expect(await getVar(page, 'mc.lust')).toBe(30);
		expect(await getVar(page, 'mc.sanity')).toBe(80);
		expect(await getVar(page, 'mc.energy')).toBe(5);
		expect(await getVar(page, 'hours')).toBe(14);
		expect(await getVar(page, 'minutes')).toBe(30);
		expect(await page.evaluate(() => SugarCube.setup.Flashbacks.isReplaying())).toBe(false);
	});

	test('cooldowns set during replay are restored on exitReplay', async ({ game: page }) => {
		// Use the first registered daily cooldown; what matters is the
		// snapshot mechanism, not which scene flag we happen to poke.
		const cooldownName = await page.evaluate(() => {
			const names = SugarCube.setup.Cooldowns.listDaily();
			return names[0];
		});
		expect(cooldownName).toBeDefined();

		// Ensure the cooldown is available pre-replay so we can detect
		// the replay-side write and confirm it gets rolled back.
		await page.evaluate((n) => {
			SugarCube.State.variables[n] = 0;
		}, cooldownName);

		await page.evaluate(() => {
			const F = SugarCube.setup.Flashbacks;
			const id = F.all()[0].id;
			F.enterReplay(id);
		});

		// Start the cooldown mid-replay -- simulates a scene-ending
		// widget like setup.Delivery.startManagerBJCooldown().
		await page.evaluate((n) => {
			SugarCube.setup.Cooldowns.start(n);
		}, cooldownName);

		expect(await page.evaluate((n) =>
			SugarCube.setup.Cooldowns.onCooldown(n), cooldownName)).toBe(true);

		await page.evaluate(() => SugarCube.setup.Flashbacks.exitReplay());

		// The pre-replay availability is restored.
		expect(await page.evaluate((n) =>
			SugarCube.setup.Cooldowns.available(n), cooldownName)).toBe(true);
	});

	test('enterReplay refuses unknown ids', async ({ game: page }) => {
		const result = await page.evaluate(() =>
			SugarCube.setup.Flashbacks.enterReplay('not-a-real-id'));
		expect(result).toBe(false);
		expect(await page.evaluate(() => SugarCube.setup.Flashbacks.isReplaying())).toBe(false);
	});

	test(':passagestart auto-marks a catalogued scene when visited outside replay', async ({ game: page }) => {
		// Pick a catalogued scene passage and clear seen state.
		const scenePassage = await page.evaluate(() => SugarCube.setup.Flashbacks.all()[0].scenePassage);
		const id = await page.evaluate(() => SugarCube.setup.Flashbacks.all()[0].id);

		await page.evaluate(() => {
			SugarCube.State.variables.flashbacks = { seen: {}, active: null };
		});

		await goToPassage(page, scenePassage);

		expect(await page.evaluate((sid) =>
			SugarCube.setup.Flashbacks.hasSeen(sid), id)).toBe(true);
	});

	test('off-scene navigation during replay bounces back to Flashbacks', async ({ game: page }) => {
		await page.evaluate(() => {
			const F = SugarCube.setup.Flashbacks;
			const id = F.all()[0].id;
			F.markSeen(id);
			F.enterReplay(id);
		});

		// Replay is active; try to navigate to an unrelated passage.
		// The :passagestart handler should detect mismatch and redirect
		// (deferred via setTimeout) back to the gallery.
		await page.evaluate(() => SugarCube.Engine.play('Livingroom'));
		await page.waitForFunction(
			() => SugarCube.State.passage === 'Flashbacks',
			null,
			{ timeout: 3000 }
		);

		expect(await page.evaluate(() => SugarCube.State.passage)).toBe('Flashbacks');
		expect(await page.evaluate(() => SugarCube.setup.Flashbacks.isReplaying())).toBe(false);
	});

	test('Flashbacks gallery passage exits replay mode', async ({ game: page }) => {
		await page.evaluate(() => {
			const F = SugarCube.setup.Flashbacks;
			const id = F.all()[0].id;
			F.markSeen(id);
			F.enterReplay(id);
		});

		await goToPassage(page, 'Flashbacks');

		expect(await page.evaluate(() => SugarCube.setup.Flashbacks.isReplaying())).toBe(false);
	});

	test('cheatUnlockAll marks every catalogue entry as seen', async ({ game: page }) => {
		const result = await page.evaluate(() => {
			SugarCube.State.variables.flashbacks = { seen: {}, active: null };
			const F = SugarCube.setup.Flashbacks;
			const before = F.seenCount();
			F.cheatUnlockAll();
			return {
				before: before,
				after: F.seenCount(),
				total: F.totalCount(),
				allSeen: F.all().every(e => F.hasSeen(e.id))
			};
		});
		expect(result.before).toBe(0);
		expect(result.after).toBe(result.total);
		expect(result.allSeen).toBe(true);
	});

	test('cheatUnlockAll is idempotent (running twice does not double-count)', async ({ game: page }) => {
		const result = await page.evaluate(() => {
			SugarCube.State.variables.flashbacks = { seen: {}, active: null };
			const F = SugarCube.setup.Flashbacks;
			F.cheatUnlockAll();
			const first = F.seenCount();
			F.cheatUnlockAll();
			const second = F.seenCount();
			return { first: first, second: second, total: F.totalCount() };
		});
		expect(result.first).toBe(result.total);
		expect(result.second).toBe(result.total);
	});

	test('seenCount ignores stale ids in the save (no "47 / 46")', async ({ game: page }) => {
		/* Bug repro: a save written when the catalogue contained an entry
		   that's since been renamed/removed will still carry the old id in
		   $flashbacks.seen. seenCount() must count only catalogue members,
		   otherwise the gallery header reads e.g. "Remembered: 47 / 46". */
		const result = await page.evaluate(() => {
			const F = SugarCube.setup.Flashbacks;
			SugarCube.State.variables.flashbacks = {
				seen: { ghost_of_features_past: true, another_dead_id: true },
				active: null
			};
			F.cheatUnlockAll();
			return { seen: F.seenCount(), total: F.totalCount() };
		});
		expect(result.seen).toBe(result.total);
		expect(result.seen).toBeLessThanOrEqual(result.total);
	});

	test('default state is seeded by initState for new games', async ({ game: page }) => {
		const bundle = await getVar(page, 'flashbacks');
		expect(bundle).toBeDefined();
		expect(bundle).not.toBeNull();
		expect(bundle.seen).toEqual({});
		expect(bundle.active).toBeNull();
	});

	/* ----- Unified-dispatcher (DeliveryEventStart) extension ----- */

	test('all four delivery-event entries are present in the catalogue', async ({ game: page }) => {
		const result = await page.evaluate(() => {
			const F = SugarCube.setup.Flashbacks;
			return {
				burger: !!F.byId('delivery_burger'),
				pizza: !!F.byId('delivery_pizza'),
				package: !!F.byId('delivery_package'),
				papers: !!F.byId('delivery_papers'),
				allDispatchToStart: ['delivery_burger', 'delivery_pizza', 'delivery_package', 'delivery_papers']
					.every(id => F.byId(id).scenePassage === 'DeliveryEventStart')
			};
		});
		expect(result.burger).toBe(true);
		expect(result.pizza).toBe(true);
		expect(result.package).toBe(true);
		expect(result.papers).toBe(true);
		expect(result.allDispatchToStart).toBe(true);
	});

	test('skipAutoRegister entries do not register with SceneEvents', async ({ game: page }) => {
		// DeliveryEventStart is the dispatcher for four scenes -- the 1:1
		// SceneEvents registry can't represent that, so the catalogue
		// entries opt out and the FlashbacksController dispatcher wires
		// the unlock side-band manually.
		const registered = await page.evaluate(() => SugarCube.setup.SceneEvents.registered());
		expect(registered['DeliveryEventStart']).toBeUndefined();
	});

	test('visiting DeliveryEventStart marks the catalogue entry that matches the active order', async ({ game: page }) => {
		await page.evaluate(() => {
			SugarCube.State.variables.flashbacks = { seen: {}, active: null };
			SugarCube.State.variables.currentOrder = 1;
			SugarCube.State.variables.order1 = { item: 'burgers', address: 'Replay', image: '' };
		});

		await goToPassage(page, 'DeliveryEventStart');

		const result = await page.evaluate(() => {
			const F = SugarCube.setup.Flashbacks;
			return {
				burger: F.hasSeen('delivery_burger'),
				pizza: F.hasSeen('delivery_pizza'),
				package: F.hasSeen('delivery_package'),
				papers: F.hasSeen('delivery_papers')
			};
		});
		expect(result.burger).toBe(true);
		expect(result.pizza).toBe(false);
		expect(result.package).toBe(false);
		expect(result.papers).toBe(false);
	});

	test('DeliveryEventStart dispatch maps each item to its catalogue id', async ({ game: page }) => {
		const tags = [
			{ item: 'pizza', id: 'delivery_pizza' },
			{ item: 'package', id: 'delivery_package' },
			{ item: 'newspapers', id: 'delivery_papers' },
			{ item: 'burgers', id: 'delivery_burger' }
		];
		for (const t of tags) {
			await page.evaluate((info) => {
				SugarCube.State.variables.flashbacks = { seen: {}, active: null };
				SugarCube.State.variables.currentOrder = 1;
				SugarCube.State.variables.order1 = { item: info.item, address: 'Replay', image: '' };
			}, t);
			await goToPassage(page, 'DeliveryEventStart');
			const seen = await page.evaluate((id) => SugarCube.setup.Flashbacks.hasSeen(id), t.id);
			expect(seen).toBe(true);
		}
	});

	test('enterReplay invokes the entry.setup() stub to plant dispatcher state', async ({ game: page }) => {
		await page.evaluate(() => {
			SugarCube.State.variables.flashbacks = { seen: {}, active: null };
			SugarCube.State.variables.currentOrder = 99;
			SugarCube.State.variables.order1 = { item: 'books', address: 'Real', image: 'x' };
			const F = SugarCube.setup.Flashbacks;
			F.markSeen('delivery_pizza');
			F.enterReplay('delivery_pizza');
		});

		const state = await page.evaluate(() => ({
			currentOrder: SugarCube.State.variables.currentOrder,
			orderItem: SugarCube.State.variables.order1.item,
			replaying: SugarCube.setup.Flashbacks.isReplaying()
		}));
		expect(state.replaying).toBe(true);
		expect(state.currentOrder).toBe(1);
		expect(state.orderItem).toBe('pizza');
	});

	test('exitReplay restores currentOrder / order1 / earnedMoney captured before setup()', async ({ game: page }) => {
		await page.evaluate(() => {
			SugarCube.State.variables.flashbacks = { seen: {}, active: null };
			SugarCube.State.variables.currentOrder = 7;
			SugarCube.State.variables.order1 = { item: 'books', address: 'Real', image: 'real.jpg' };
			SugarCube.setup.Mc.setEarnedMoney(123);
			const F = SugarCube.setup.Flashbacks;
			F.markSeen('delivery_burger');
			F.enterReplay('delivery_burger');
		});

		// Mutate state mid-replay -- exitReplay must roll it back.
		await page.evaluate(() => {
			SugarCube.State.variables.currentOrder = 2;
			SugarCube.State.variables.order1 = { item: 'pizza', address: 'Mid', image: '' };
			SugarCube.setup.Mc.setEarnedMoney(999);
		});

		await page.evaluate(() => SugarCube.setup.Flashbacks.exitReplay());

		const restored = await page.evaluate(() => ({
			currentOrder: SugarCube.State.variables.currentOrder,
			orderItem: SugarCube.State.variables.order1.item,
			orderAddress: SugarCube.State.variables.order1.address,
			earnedMoney: SugarCube.setup.Mc.earnedMoney()
		}));
		expect(restored.currentOrder).toBe(7);
		expect(restored.orderItem).toBe('books');
		expect(restored.orderAddress).toBe('Real');
		expect(restored.earnedMoney).toBe(123);
	});

	test('replayPassages allowlists multi-passage chains without bouncing', async ({ game: page }) => {
		await page.evaluate(() => {
			const F = SugarCube.setup.Flashbacks;
			F.markSeen('delivery_burger');
			F.enterReplay('delivery_burger');
		});

		// DeliveryEvent1 is on the chain -- containReplay must allow it.
		await goToPassage(page, 'DeliveryEvent1');
		expect(await page.evaluate(() => SugarCube.State.passage)).toBe('DeliveryEvent1');
		expect(await page.evaluate(() => SugarCube.setup.Flashbacks.isReplaying())).toBe(true);

		// DeliveryEvent2 is also on the chain.
		await goToPassage(page, 'DeliveryEvent2');
		expect(await page.evaluate(() => SugarCube.State.passage)).toBe('DeliveryEvent2');
		expect(await page.evaluate(() => SugarCube.setup.Flashbacks.isReplaying())).toBe(true);
	});

	test('delivery_special replay reaches DeliverySpecialUnsafe2 without bouncing', async ({ game: page }) => {
		// The Unsafe scene's payout + Leave link live in DeliverySpecialUnsafe2,
		// reached via a wikilink at the bottom of the linkreplace cascade in
		// DeliverySpecialUnsafe. Without listing the sequel in replayPassages
		// the containReplay guard bounces the player back to the gallery on
		// the very last beat.
		await page.evaluate(() => {
			const F = SugarCube.setup.Flashbacks;
			F.markSeen('delivery_special');
			F.enterReplay('delivery_special');
		});

		await goToPassage(page, 'DeliverySpecialUnsafe2');
		expect(await page.evaluate(() => SugarCube.State.passage)).toBe('DeliverySpecialUnsafe2');
		expect(await page.evaluate(() => SugarCube.setup.Flashbacks.isReplaying())).toBe(true);
	});

	test('passages off the replayPassages chain still bounce back to the gallery', async ({ game: page }) => {
		await page.evaluate(() => {
			const F = SugarCube.setup.Flashbacks;
			F.markSeen('delivery_burger');
			F.enterReplay('delivery_burger');
		});

		// Livingroom is NOT on the chain -- containReplay must bounce.
		await page.evaluate(() => SugarCube.Engine.play('Livingroom'));
		await page.waitForFunction(
			() => SugarCube.State.passage === 'Flashbacks',
			null,
			{ timeout: 3000 }
		);

		expect(await page.evaluate(() => SugarCube.State.passage)).toBe('Flashbacks');
		expect(await page.evaluate(() => SugarCube.setup.Flashbacks.isReplaying())).toBe(false);
	});

	/* ----- Hunt scenes (BaitOrgasm / HuntEventSuccubus / UseCursedItem) ----- */

	test('all three hunt-scene catalogue entries are present', async ({ game: page }) => {
		const result = await page.evaluate(() => {
			const F = SugarCube.setup.Flashbacks;
			return {
				succubus: F.byId('hunt_event_succubus'),
				baitOrgasm: F.byId('hunt_bait_orgasm'),
				cursedItem: F.byId('hunt_cursed_item')
			};
		});
		expect(result.succubus).not.toBeNull();
		expect(result.succubus.scenePassage).toBe('HuntEventSuccubus');
		expect(result.baitOrgasm).not.toBeNull();
		expect(result.baitOrgasm.scenePassage).toBe('BaitOrgasm');
		expect(result.cursedItem).not.toBeNull();
		expect(result.cursedItem.scenePassage).toBe('UseCursedItem');
	});

	test('hunt-scene entries auto-register with SceneEvents (no skipAutoRegister)', async ({ game: page }) => {
		const registered = await page.evaluate(() => SugarCube.setup.SceneEvents.registered());
		expect(registered['HuntEventSuccubus']).toBe('hunt_event_succubus');
		expect(registered['BaitOrgasm']).toBe('hunt_bait_orgasm');
		expect(registered['UseCursedItem']).toBe('hunt_cursed_item');
	});

	test('visiting HuntEventSuccubus marks the catalogue entry as seen', async ({ game: page }) => {
		await page.evaluate(() => {
			SugarCube.State.variables.flashbacks = { seen: {}, active: null };
		});
		await goToPassage(page, 'HuntEventSuccubus');
		expect(await page.evaluate(() =>
			SugarCube.setup.Flashbacks.hasSeen('hunt_event_succubus'))).toBe(true);
	});

	test('UseCursedItem replay plants a held cursed item via cheatGrantCursedItem', async ({ game: page }) => {
		await page.evaluate(() => {
			SugarCube.State.variables.flashbacks = { seen: {}, active: null };
			// Start with no carried item -- setup() must plant one.
			SugarCube.State.variables.gotCursedItem = 0;
			SugarCube.State.variables.isCIDildo = false;
			SugarCube.State.variables.isCIButtplug = false;
			SugarCube.State.variables.isCIBeads = false;
			SugarCube.State.variables.isCIHDildo = false;
			const F = SugarCube.setup.Flashbacks;
			F.markSeen('hunt_cursed_item');
			F.enterReplay('hunt_cursed_item');
		});

		const planted = await page.evaluate(() => ({
			held: SugarCube.State.variables.gotCursedItem,
			dildo: SugarCube.State.variables.isCIDildo,
			carriedType: SugarCube.setup.Witch.carriedCursedItemType(),
			replaying: SugarCube.setup.Flashbacks.isReplaying()
		}));
		expect(planted.held).toBe(1);
		expect(planted.dildo).toBe(true);
		expect(planted.carriedType).toBe('dildo');
		expect(planted.replaying).toBe(true);
	});

	test('exitReplay restores the player\'s real cursed-item carry state', async ({ game: page }) => {
		// Player is mid-quest with a beads variant held; replay must not
		// clobber that on entry, and exit must restore it after consume.
		await page.evaluate(() => {
			SugarCube.State.variables.flashbacks = { seen: {}, active: null };
			SugarCube.setup.Witch.cheatGrantCursedItem('beads');
			const F = SugarCube.setup.Flashbacks;
			F.markSeen('hunt_cursed_item');
			F.enterReplay('hunt_cursed_item');
		});

		// Mid-replay, the setup() planted dildo + the passage's consume
		// would clear it. Simulate the consume directly.
		await page.evaluate(() =>
			SugarCube.setup.Witch.consumeCarriedCursedItem());

		expect(await page.evaluate(() =>
			SugarCube.State.variables.gotCursedItem)).toBe(0);

		await page.evaluate(() => SugarCube.setup.Flashbacks.exitReplay());

		const restored = await page.evaluate(() => ({
			held: SugarCube.State.variables.gotCursedItem,
			beads: SugarCube.State.variables.isCIBeads,
			dildo: SugarCube.State.variables.isCIDildo,
			carriedType: SugarCube.setup.Witch.carriedCursedItemType()
		}));
		expect(restored.held).toBe(1);
		expect(restored.beads).toBe(true);
		expect(restored.dildo).toBe(false);
		expect(restored.carriedType).toBe('beads');
	});

	test('BaitOrgasm replay bumps sanity above 0 to skip the sanity-over goto', async ({ game: page }) => {
		await page.evaluate(() => {
			SugarCube.State.variables.flashbacks = { seen: {}, active: null };
			SugarCube.setup.Mc.setSanity(0);
			const F = SugarCube.setup.Flashbacks;
			F.markSeen('hunt_bait_orgasm');
			F.enterReplay('hunt_bait_orgasm');
		});

		const sanity = await page.evaluate(() => SugarCube.setup.Mc.sanity());
		expect(sanity).toBeGreaterThan(0);
	});

	test('BaitOrgasm exitReplay restores pre-replay sanity (even when setup() bumped it)', async ({ game: page }) => {
		await page.evaluate(() => {
			SugarCube.State.variables.flashbacks = { seen: {}, active: null };
			SugarCube.setup.Mc.setSanity(0);
			const F = SugarCube.setup.Flashbacks;
			F.markSeen('hunt_bait_orgasm');
			F.enterReplay('hunt_bait_orgasm');
		});

		await page.evaluate(() => SugarCube.setup.Flashbacks.exitReplay());
		expect(await page.evaluate(() => SugarCube.setup.Mc.sanity())).toBe(0);
	});

	test('exitReplay restores baitOrgasmPending captured before setup()', async ({ game: page }) => {
		await page.evaluate(() => {
			SugarCube.State.variables.flashbacks = { seen: {}, active: null };
			SugarCube.State.variables.baitOrgasmPending = true;
			const F = SugarCube.setup.Flashbacks;
			F.markSeen('hunt_bait_orgasm');
			F.enterReplay('hunt_bait_orgasm');
		});

		// Simulate a consume that flips the flag to false mid-replay.
		await page.evaluate(() => {
			SugarCube.State.variables.baitOrgasmPending = false;
		});

		await page.evaluate(() => SugarCube.setup.Flashbacks.exitReplay());

		expect(await page.evaluate(() =>
			SugarCube.State.variables.baitOrgasmPending)).toBe(true);
	});

	/* ----- Stripped walk-home + hunt-end catch (NudityEvent / NudityEventTwo /
	         HuntOverProwl / HuntOverSanity) ----- */

	test('all four stripped/caught catalogue entries are present', async ({ game: page }) => {
		const result = await page.evaluate(() => {
			const F = SugarCube.setup.Flashbacks;
			return {
				solo:   F.byId('nudity_walk_solo'),
				duo:    F.byId('nudity_walk_duo'),
				prowl:  F.byId('hunt_caught_prowl'),
				sanity: F.byId('hunt_caught_sanity')
			};
		});
		expect(result.solo).not.toBeNull();
		expect(result.solo.scenePassage).toBe('NudityEvent');
		expect(result.duo).not.toBeNull();
		expect(result.duo.scenePassage).toBe('NudityEventTwo');
		expect(result.prowl).not.toBeNull();
		expect(result.prowl.scenePassage).toBe('HuntOverProwl');
		expect(result.sanity).not.toBeNull();
		expect(result.sanity.scenePassage).toBe('HuntOverSanity');
	});

	test('NudityEvent replay strips the wardrobe so the passage picks the naked branch', async ({ game: page }) => {
		await page.evaluate(() => {
			SugarCube.State.variables.flashbacks = { seen: {}, active: null };
			// Player is fully dressed -- without setup() the passage
			// would <<goto>> Livingroom instead of rendering nude prose.
			const groups = SugarCube.setup.WARDROBE_GROUPS;
			const tshirtGrp = groups.find(g => g.name === 'tshirt');
			SugarCube.setup.Wardrobe.equip(tshirtGrp, tshirtGrp.items.find(it => it.id === 'tshirt1'));
			const F = SugarCube.setup.Flashbacks;
			F.markSeen('nudity_walk_solo');
			F.enterReplay('nudity_walk_solo');
		});

		const planted = await page.evaluate(() => ({
			fullyNude: SugarCube.setup.Wardrobe.isFullyNude(),
			fullyDressed: SugarCube.setup.Wardrobe.isFullyDressed(),
			replaying: SugarCube.setup.Flashbacks.isReplaying()
		}));
		expect(planted.fullyNude).toBe(true);
		expect(planted.fullyDressed).toBe(false);
		expect(planted.replaying).toBe(true);
	});

	test('NudityEvent exitReplay restores a fully-dressed wardrobe and exhibitionism level', async ({ game: page }) => {
		await page.evaluate(() => {
			SugarCube.State.variables.flashbacks = { seen: {}, active: null };
			// Pre-replay state: dressed, exhibitionism = 0.
			const groups = SugarCube.setup.WARDROBE_GROUPS;
			const tshirtGrp = groups.find(g => g.name === 'tshirt');
			SugarCube.setup.Wardrobe.equip(tshirtGrp, tshirtGrp.items.find(it => it.id === 'tshirt1'));
			const jeansGrp = groups.find(g => g.name === 'bottomOuter');
			SugarCube.setup.Wardrobe.equip(jeansGrp, jeansGrp.items.find(it => it.id === 'jeans1'));
			SugarCube.setup.Mc.setExhibitionism(0);
			const F = SugarCube.setup.Flashbacks;
			F.markSeen('nudity_walk_solo');
			F.enterReplay('nudity_walk_solo');
		});

		// Mid-replay: scene-style writes to exhibitionism.
		await page.evaluate(() => SugarCube.setup.Mc.setExhibitionism(7));

		await page.evaluate(() => SugarCube.setup.Flashbacks.exitReplay());

		const restored = await page.evaluate(() => ({
			tshirtWorn: SugarCube.setup.Wardrobe.worn(SugarCube.setup.WardrobeSlot.TSHIRT),
			jeansWorn:  SugarCube.setup.Wardrobe.worn(SugarCube.setup.WardrobeSlot.JEANS),
			exhibitionism: SugarCube.setup.Mc.exhibitionism()
		}));
		expect(restored.tshirtWorn).toBe(true);
		expect(restored.jeansWorn).toBe(true);
		expect(restored.exhibitionism).toBe(0);
	});

	test('NudityEventTwo replay plants an active companion so setActiveLust has somewhere to land', async ({ game: page }) => {
		await page.evaluate(() => {
			SugarCube.State.variables.flashbacks = { seen: {}, active: null };
			// No active companion pre-replay.
			SugarCube.State.variables.companion = {};
			SugarCube.State.variables.isCompChosen = false;
			const F = SugarCube.setup.Flashbacks;
			F.markSeen('nudity_walk_duo');
			F.enterReplay('nudity_walk_duo');
		});

		const planted = await page.evaluate(() => ({
			compName: SugarCube.State.variables.companion && SugarCube.State.variables.companion.name,
			isCompChosen: SugarCube.State.variables.isCompChosen,
			activeState: SugarCube.setup.Companion.activeState(),
			fullyNude: SugarCube.setup.Wardrobe.isFullyNude()
		}));
		expect(planted.compName).toBe('Brook');
		expect(planted.isCompChosen).toBe(true);
		expect(planted.activeState).toBeTruthy();
		expect(planted.fullyNude).toBe(true);
	});

	test('NudityEventTwo exitReplay restores companion bundle even when in-replay lust spikes', async ({ game: page }) => {
		await page.evaluate(() => {
			SugarCube.State.variables.flashbacks = { seen: {}, active: null };
			SugarCube.State.variables.companion = {};
			SugarCube.State.variables.isCompChosen = false;
			// Brook starts with some pre-replay lust value.
			SugarCube.State.variables.brook.lust = 12;
			const F = SugarCube.setup.Flashbacks;
			F.markSeen('nudity_walk_duo');
			F.enterReplay('nudity_walk_duo');
		});

		// Simulate the passage's setActiveLust(100) call mid-replay.
		await page.evaluate(() => SugarCube.setup.Companion.setActiveLust(100));

		await page.evaluate(() => SugarCube.setup.Flashbacks.exitReplay());

		const restored = await page.evaluate(() => ({
			compName: SugarCube.State.variables.companion && SugarCube.State.variables.companion.name,
			isCompChosen: SugarCube.State.variables.isCompChosen,
			brookLust: SugarCube.State.variables.brook.lust
		}));
		// Original companion was an empty marker; restore puts it back.
		expect(restored.compName).toBeUndefined();
		expect(restored.isCompChosen).toBe(false);
		expect(restored.brookLust).toBe(12);
	});

	test('HuntOverProwl replay stamps a Spirit run, leaves huntMode NONE', async ({ game: page }) => {
		await page.evaluate(() => {
			SugarCube.State.variables.flashbacks = { seen: {}, active: null };
			// No active hunt pre-replay.
			SugarCube.State.variables.run = null;
			SugarCube.State.variables.huntMode = SugarCube.setup.HuntController.HuntMode.NONE;
			const F = SugarCube.setup.Flashbacks;
			F.markSeen('hunt_caught_prowl');
			F.enterReplay('hunt_caught_prowl');
		});

		// The setup() must leave huntMode at NONE -- flipping to ACTIVE
		// trips TickController's PassageDone redirect ("isHunting && time
		// past morning -> HuntOverTime"), which bounces the replay to the
		// gallery before the scene renders. activeGhost is guarded on
		// `$run` (isActive), so stamping the run alone gives the catalogue
		// scene the ghost it needs without arming the redirect.
		const planted = await page.evaluate(() => ({
			ghostName: SugarCube.setup.Ghosts.huntRealName(),
			isHunting: SugarCube.setup.HuntController.isHunting(),
			isActive: SugarCube.setup.HuntController.isActive(),
			activeGhost: SugarCube.setup.HuntController.activeGhost() && SugarCube.setup.HuntController.activeGhost().name
		}));
		expect(planted.ghostName).toBe('Spirit');
		expect(planted.isHunting).toBe(false);
		expect(planted.isActive).toBe(true);
		expect(planted.activeGhost).toBe('Spirit');
	});

	test('HuntOverProwl exitReplay clears the planted run and restores prior huntMode', async ({ game: page }) => {
		await page.evaluate(() => {
			SugarCube.State.variables.flashbacks = { seen: {}, active: null };
			SugarCube.State.variables.run = null;
			SugarCube.State.variables.huntMode = SugarCube.setup.HuntController.HuntMode.NONE;
			SugarCube.State.variables.mc.possessionResidue = 0;
			const F = SugarCube.setup.Flashbacks;
			F.markSeen('hunt_caught_prowl');
			F.enterReplay('hunt_caught_prowl');
		});

		// Simulate the passage's onCaughtCleanup + addPossessionResidue cascade.
		await page.evaluate(() => {
			SugarCube.setup.HuntController.onCaughtCleanup();
			SugarCube.setup.Mc.addPossessionResidue();
		});

		await page.evaluate(() => SugarCube.setup.Flashbacks.exitReplay());

		const restored = await page.evaluate(() => ({
			run: SugarCube.State.variables.run,
			huntMode: SugarCube.State.variables.huntMode,
			residue: SugarCube.setup.Mc.possessionResidue(),
			noneMode: SugarCube.setup.HuntController.HuntMode.NONE
		}));
		expect(restored.run).toBeNull();
		expect(restored.huntMode).toBe(restored.noneMode);
		expect(restored.residue).toBe(0);
	});

	test('HuntOverSanity replay stamps a Spirit run, leaves huntMode NONE', async ({ game: page }) => {
		await page.evaluate(() => {
			SugarCube.State.variables.flashbacks = { seen: {}, active: null };
			SugarCube.State.variables.run = null;
			SugarCube.State.variables.huntMode = SugarCube.setup.HuntController.HuntMode.NONE;
			const F = SugarCube.setup.Flashbacks;
			F.markSeen('hunt_caught_sanity');
			F.enterReplay('hunt_caught_sanity');
		});

		// See HuntOverProwl test above for the rationale -- enterReplay
		// must NOT call activateHunt() or the redirect bounces the scene.
		const planted = await page.evaluate(() => ({
			ghostName: SugarCube.setup.Ghosts.huntRealName(),
			isHunting: SugarCube.setup.HuntController.isHunting(),
			isActive: SugarCube.setup.HuntController.isActive()
		}));
		expect(planted.ghostName).toBe('Spirit');
		expect(planted.isHunting).toBe(false);
		expect(planted.isActive).toBe(true);
	});

	test('hunt-defeat replay does not leak isPenaltyOn through the Sleep bounce', async ({ game: page }) => {
		/* Regression: replaying hunt_caught_prowl / hunt_caught_sanity
		   ends in the huntBlackoutExit link, which routes through
		   huntCaughtPassage() -> "Sleep". Sleep's body runs
		   applyHuntDefeatPreSleep() whenever previous() is HuntOverProwl
		   / HuntOverSanity, flipping isPenaltyOn=true and rolling a
		   cursed item. isPenaltyOn isn't in SNAPSHOT_PATHS, so without a
		   replay gate the flag survives exitReplay -- the player returns
		   to the gallery wearing the "Need to buy medicine" injured
		   status, even though they only re-watched a scene. */
		for (const id of ['hunt_caught_prowl', 'hunt_caught_sanity']) {
			const sceneName = id === 'hunt_caught_prowl' ? 'HuntOverProwl' : 'HuntOverSanity';
			await page.evaluate((sceneId) => {
				SugarCube.State.variables.flashbacks = { seen: {}, active: null };
				SugarCube.State.variables.run = null;
				SugarCube.State.variables.huntMode = SugarCube.setup.HuntController.HuntMode.NONE;
				SugarCube.State.variables.isPenaltyOn = false;
				const F = SugarCube.setup.Flashbacks;
				F.markSeen(sceneId);
				F.enterReplay(sceneId);
			}, id);

			// Walk via the live scene first so previous() resolves to the
			// HuntOver* passage when Sleep renders -- that's what trips
			// cameFromHuntDefeat() and arms the leak.
			await page.evaluate((name) => SugarCube.Engine.play(name), sceneName);
			await page.evaluate(() => SugarCube.Engine.play('Sleep'));
			await page.waitForFunction(
				() => SugarCube.State.passage === 'Flashbacks',
				null,
				{ timeout: 3000 }
			);

			const after = await page.evaluate(() => ({
				isPenaltyOn: SugarCube.setup.Mc.isPenalized(),
				passage: SugarCube.State.passage,
				replaying: SugarCube.setup.Flashbacks.isReplaying()
			}));
			expect(after.passage, `[${id}] passage after bounce`).toBe('Flashbacks');
			expect(after.replaying, `[${id}] still in replay`).toBe(false);
			expect(after.isPenaltyOn, `[${id}] isPenaltyOn leaked`).toBe(false);
		}
	});

	test('replay-time achievement unlock is suppressed by isReplaying guard', async ({ game: page }) => {
		// HUNT_END_ASSAULTED with no ctx is a no-op in the onHuntEnd
		// handler anyway, but unlock() must hard-reject any replay-time
		// call to keep future hooks honest.
		const result = await page.evaluate(() => {
			SugarCube.State.variables.flashbacks = { seen: {}, active: null };
			// Make sure save is not cheated -- that would shadow the
			// new guard.
			SugarCube.State.variables.achievements = {};
			const F = SugarCube.setup.Flashbacks;
			F.markSeen('hunt_caught_prowl');
			F.enterReplay('hunt_caught_prowl');
			// Try a direct unlock during replay; should be rejected.
			const duringReplay = SugarCube.setup.Achievements.unlock('disc.trap');
			F.exitReplay();
			// After exit, the same unlock works.
			const afterReplay = SugarCube.setup.Achievements.unlock('disc.trap');
			return { duringReplay, afterReplay };
		});
		expect(result.duringReplay).toBe(false);
		expect(result.afterReplay).toBe(true);
	});

	test('visiting DeliveryEventStart during replay does not double-credit', async ({ game: page }) => {
		// Burger replay enters DeliveryEventStart in replay mode; the auto-mark
		// path must not stamp seen on an unrelated catalogue entry, and must
		// not re-stamp seen on the active one either (markSeen is idempotent
		// but we still want to prove the dispatcher skips during replay).
		const beforeReplay = await page.evaluate(() => {
			SugarCube.State.variables.flashbacks = { seen: {}, active: null };
			const F = SugarCube.setup.Flashbacks;
			F.markSeen('delivery_burger');
			F.enterReplay('delivery_burger');
			return F.seenCount();
		});

		// Mid-replay, plant a different order item -- if the dispatcher
		// fired during replay, this would incorrectly mark delivery_pizza.
		await page.evaluate(() => {
			SugarCube.State.variables.order1.item = 'pizza';
		});

		await goToPassage(page, 'DeliveryEventStart');

		const after = await page.evaluate(() => ({
			seenCount: SugarCube.setup.Flashbacks.seenCount(),
			pizzaSeen: SugarCube.setup.Flashbacks.hasSeen('delivery_pizza')
		}));
		expect(after.seenCount).toBe(beforeReplay);
		expect(after.pizzaSeen).toBe(false);
	});
});

/*
 * Regression: a flashback replay must never frame the save as cheated.
 *
 * The bug class: exitReplay restores the snapshotted stats via direct
 * State.variables writes (writeLeaf), bypassing the controller setters
 * that keep the shadow ledger (setup.Ledger) in lockstep. Any replay
 * scene that moves a ledger-tracked field through its real API -- e.g.
 * the cursed-home events' applyCurseEventEffects (setLust(100) +
 * removeSanity(15)) -- advances both the live value and the ledger
 * mirror; the snapshot restore then rewinds only the live value. The
 * next onPassageReady audit reads the diverged mirror as a dev-console
 * edit, fires CHEAT_USED, and disables every achievement. exitReplay
 * resyncs the ledger so this can never happen for ANY tracked field or
 * ANY scene.
 */
test.describe('flashback replay never frames the save as cheated', () => {

	// One representative API mutation per ledger-tracked, snapshotted
	// field. Covering every tracked field (not just lust) is the point:
	// the fix is class-level, so the test is too.
	const TRACKED_FIELDS = ['lust', 'sanity', 'energy', 'money'];

	test('exitReplay resyncs the ledger for every tracked field', async ({ game: page }) => {
		const results = await page.evaluate((fields) => {
			const F = SugarCube.setup.Flashbacks;
			const Mc = SugarCube.setup.Mc;
			const Ach = SugarCube.setup.Achievements;
			const Ledger = SugarCube.setup.Ledger;
			// Any snapshot-bearing scene works; this one snapshots all
			// the mc.* stat leaves we mutate below.
			const sceneId = 'hunt_cursed_item';

			const writeField = (field) => {
				switch (field) {
					case 'lust':   return Mc.setLust(100);
					case 'sanity': return Mc.setSanity(3);
					case 'energy': return Mc.setEnergy(7);
					case 'money':  return Mc.setMoney(9999);
				}
			};

			const out = {};
			fields.forEach((field) => {
				// Clean, un-cheated baseline.
				SugarCube.State.variables.achievements = {};
				SugarCube.State.variables.flashbacks = { seen: {}, active: null };
				Ledger.resync();

				F.enterReplay(sceneId);
				// The scene moves a tracked field through its controller
				// API -- live value AND ledger mirror both advance.
				writeField(field);
				F.exitReplay();

				// auditAndReport is the exact production trigger: it fires
				// CHEAT_USED on any divergence. With the resync fix it must
				// see none.
				const cheatedBefore = Ach.hasCheated();
				const diffs = Ledger.auditAndReport();
				const cheatedAfter = Ach.hasCheated();
				out[field] = { diffs, cheatedBefore, cheatedAfter };
			});
			return out;
		}, TRACKED_FIELDS);

		for (const field of TRACKED_FIELDS) {
			const r = results[field];
			expect(r.cheatedBefore, `[${field}] cheated before audit`).toBe(false);
			expect(r.diffs, `[${field}] ledger diverged after replay`).toEqual([]);
			expect(r.cheatedAfter, `[${field}] save framed as cheated`).toBe(false);
		}
	});

	test('replaying the cursed-bath scene leaves the save un-cheated (real navigation path)', async ({ game: page }) => {
		// Park a clean, un-cheated baseline with known stat values.
		await page.evaluate(() => {
			SugarCube.State.variables.achievements = {};
			SugarCube.State.variables.flashbacks = { seen: {}, active: null };
			SugarCube.setup.Mc.setLust(10);
			SugarCube.setup.Mc.setSanity(80);
			SugarCube.setup.Ledger.resync();
		});

		// Enter the cursed-bath flashback and fire its stat payload --
		// the same call the passage's final linkappend runs.
		await page.evaluate(() => {
			SugarCube.setup.Flashbacks.enterReplay('home_cursed_bath');
			SugarCube.setup.CursedItems.applyCurseEventEffects();
		});

		// Leave via the gallery -- containReplay restores the snapshot.
		await goToPassage(page, 'Flashbacks');
		// One more hop so a fresh onPassageReady audits the post-restore
		// state (this is where the false positive used to surface).
		await goToPassage(page, 'Home');

		const out = await page.evaluate(() => ({
			cheated: SugarCube.setup.Achievements.hasCheated(),
			audit: SugarCube.setup.Ledger.audit(),
			lust: SugarCube.setup.Mc.lust(),
			sanity: SugarCube.setup.Mc.sanity()
		}));
		expect(out.cheated, 'cursed-bath replay framed the save as cheated').toBe(false);
		expect(out.audit, 'ledger diverged after cursed-bath replay').toEqual([]);
		expect(out.lust, 'lust restored after replay').toBe(10);
		expect(out.sanity, 'sanity restored after replay').toBe(80);
	});

	test('every catalogue scene survives an enter/exit replay without diverging the ledger', async ({ game: page }) => {
		// Walk the whole catalogue: enter each replay, perturb a couple
		// of tracked fields through their real API (standing in for
		// whatever the scene itself does), exit, and confirm the ledger
		// is back in sync and the save is not flagged. Catches any future
		// scene that snapshots a tracked field whose mirror would
		// otherwise be left diverged.
		const failures = await page.evaluate(() => {
			const F = SugarCube.setup.Flashbacks;
			const Mc = SugarCube.setup.Mc;
			const Ach = SugarCube.setup.Achievements;
			const Ledger = SugarCube.setup.Ledger;
			const bad = [];

			F.all().forEach((entry) => {
				SugarCube.State.variables.achievements = {};
				SugarCube.State.variables.flashbacks = { seen: {}, active: null };
				Ledger.resync();

				if (!F.enterReplay(entry.id)) return; // unknown id -- skip
				Mc.setLust(100);
				Mc.removeSanity(5);
				F.exitReplay();

				const diffs = Ledger.auditAndReport();
				if (diffs.length || Ach.hasCheated()) {
					bad.push({ id: entry.id, diffs: diffs.map(d => d.field), cheated: Ach.hasCheated() });
				}
			});
			return bad;
		});
		expect(failures, `scenes that diverged the ledger: ${JSON.stringify(failures)}`).toEqual([]);
	});
});
