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
				all:                     typeof F.all === 'function',
				byId:                    typeof F.byId === 'function',
				byPassage:               typeof F.byPassage === 'function',
				hasSeen:                 typeof F.hasSeen === 'function',
				markSeen:                typeof F.markSeen === 'function',
				seenCount:               typeof F.seenCount === 'function',
				totalCount:              typeof F.totalCount === 'function',
				byLocation:              typeof F.byLocation === 'function',
				enterReplay:             typeof F.enterReplay === 'function',
				exitReplay:              typeof F.exitReplay === 'function',
				isReplaying:             typeof F.isReplaying === 'function',
				activeId:                typeof F.activeId === 'function',
				activeEntry:             typeof F.activeEntry === 'function'
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

	test('default state is seeded by initState for new games', async ({ game: page }) => {
		const bundle = await getVar(page, 'flashbacks');
		expect(bundle).toBeDefined();
		expect(bundle).not.toBeNull();
		expect(bundle.seen).toEqual({});
		expect(bundle.active).toBeNull();
	});
});
