/**
 * setup.SceneEvents bus contract.
 *
 * Pins:
 *   - API shape: Event, on/emit/filter/applyFilter/register/sceneIdFor/registered.
 *   - Visiting a registered passage emits Event.VIEWED with { sceneId, passageName }.
 *   - Visiting an unregistered passage does NOT emit.
 *   - on() returns an unsubscribe function.
 *   - Multiple subscribers all fire; one thrower doesn't break the others.
 *   - applyFilter() runs filter subscribers in order, mutating ctx.
 *   - Every Flashbacks CATALOGUE entry is registered at module load.
 */
const { test, expect } = require('./fixtures');
const { goToPassage } = require('./helpers');

test.describe('setup.SceneEvents', () => {

	test('bus is exposed with the expected API', async ({ game: page }) => {
		const shape = await page.evaluate(() => {
			const S = SugarCube.setup.SceneEvents;
			return {
				Event:        typeof S.Event === 'object' && S.Event !== null,
				VIEWED:       typeof S.Event.VIEWED === 'string' && S.Event.VIEWED.length > 0,
				on:           typeof S.on === 'function',
				emit:         typeof S.emit === 'function',
				filter:       typeof S.filter === 'function',
				applyFilter:  typeof S.applyFilter === 'function',
				register:     typeof S.register === 'function',
				sceneIdFor:   typeof S.sceneIdFor === 'function',
				registered:   typeof S.registered === 'function'
			};
		});
		Object.values(shape).forEach(v => expect(v).toBe(true));
	});

	test('every Flashbacks catalogue entry is registered with the bus', async ({ game: page }) => {
		// Entries that share a dispatcher passage (skipAutoRegister: true)
		// can't fit in the 1:1 registry; the FlashbacksController wires
		// their unlock side-band manually instead. Exempt those rows.
		const data = await page.evaluate(() => {
			const S = SugarCube.setup.SceneEvents;
			const F = SugarCube.setup.Flashbacks;
			return F.all()
				.filter(entry => !entry.skipAutoRegister)
				.map(entry => ({
					id: entry.id,
					scenePassage: entry.scenePassage,
					registeredId: S.sceneIdFor(entry.scenePassage)
				}));
		});
		expect(data.length).toBeGreaterThan(0);
		data.forEach(row => {
			expect(row.registeredId).toBe(row.id);
		});
	});

	test('sceneIdFor returns null for an unregistered passage', async ({ game: page }) => {
		const id = await page.evaluate(() =>
			SugarCube.setup.SceneEvents.sceneIdFor('NoSuchPassage'));
		expect(id).toBeNull();
	});

	test('visiting a registered scene passage emits Event.VIEWED', async ({ game: page }) => {
		// Stand up a one-shot capture on the live bus, then navigate.
		await page.evaluate(() => {
			window.__sceneEventsCaptured = [];
			const S = SugarCube.setup.SceneEvents;
			window.__sceneEventsUnsub = S.on(S.Event.VIEWED, function (ctx) {
				window.__sceneEventsCaptured.push(ctx);
			});
		});

		const scenePassage = await page.evaluate(() =>
			SugarCube.setup.Flashbacks.all()[0].scenePassage);
		const expectedId = await page.evaluate(() =>
			SugarCube.setup.Flashbacks.all()[0].id);

		await goToPassage(page, scenePassage);

		const captured = await page.evaluate(() => window.__sceneEventsCaptured);
		await page.evaluate(() => window.__sceneEventsUnsub());

		// The bus may also pick up other registered scenes if the helper
		// visits intermediate passages, but it must include the target.
		const match = captured.find(c => c.sceneId === expectedId);
		expect(match).toBeDefined();
		expect(match.passageName).toBe(scenePassage);
	});

	test('visiting an unregistered passage does not emit VIEWED', async ({ game: page }) => {
		await page.evaluate(() => {
			window.__sceneEventsCount = 0;
			const S = SugarCube.setup.SceneEvents;
			window.__sceneEventsUnsub = S.on(S.Event.VIEWED, function () {
				window.__sceneEventsCount++;
			});
		});

		await goToPassage(page, 'Livingroom');

		const count = await page.evaluate(() => window.__sceneEventsCount);
		await page.evaluate(() => window.__sceneEventsUnsub());
		expect(count).toBe(0);
	});

	test('on() returns an unsubscribe function that detaches the listener', async ({ game: page }) => {
		const result = await page.evaluate(() => {
			const S = SugarCube.setup.SceneEvents;
			let count = 0;
			const unsub = S.on(S.Event.VIEWED, function () { count++; });
			S.emit(S.Event.VIEWED, { sceneId: 'x', passageName: 'X' });
			const afterFirst = count;
			unsub();
			S.emit(S.Event.VIEWED, { sceneId: 'x', passageName: 'X' });
			return { afterFirst: afterFirst, afterUnsub: count };
		});
		expect(result.afterFirst).toBe(1);
		expect(result.afterUnsub).toBe(1);
	});

	test('multiple subscribers all fire; a thrower does not break the others', async ({ game: page }) => {
		const result = await page.evaluate(() => {
			const S = SugarCube.setup.SceneEvents;
			const calls = [];
			const u1 = S.on(S.Event.VIEWED, function () { calls.push('a'); });
			const u2 = S.on(S.Event.VIEWED, function () { throw new Error('boom'); });
			const u3 = S.on(S.Event.VIEWED, function () { calls.push('c'); });
			S.emit(S.Event.VIEWED, { sceneId: 'x', passageName: 'X' });
			u1(); u2(); u3();
			return calls;
		});
		expect(result).toEqual(['a', 'c']);
	});

	test('applyFilter runs filter subscribers in order and mutates ctx', async ({ game: page }) => {
		const result = await page.evaluate(() => {
			const S = SugarCube.setup.SceneEvents;
			const u1 = S.filter(S.Event.VIEWED, function (ctx) { ctx.tag = 'one'; });
			const u2 = S.filter(S.Event.VIEWED, function (ctx) { ctx.tag += '-two'; });
			const out = S.applyFilter(S.Event.VIEWED, { sceneId: 'x', passageName: 'X' });
			u1(); u2();
			return out.tag;
		});
		expect(result).toBe('one-two');
	});

	test('register is idempotent and overwrites prior mapping', async ({ game: page }) => {
		const result = await page.evaluate(() => {
			const S = SugarCube.setup.SceneEvents;
			S.register('TestPassage', 'first_id');
			const a = S.sceneIdFor('TestPassage');
			S.register('TestPassage', 'second_id');
			const b = S.sceneIdFor('TestPassage');
			return { a: a, b: b };
		});
		expect(result.a).toBe('first_id');
		expect(result.b).toBe('second_id');
	});

	test('register rejects empty / non-string args silently', async ({ game: page }) => {
		const result = await page.evaluate(() => {
			const S = SugarCube.setup.SceneEvents;
			S.register('', 'some_id');
			S.register('SomePassage', '');
			S.register(null, 'some_id');
			S.register('SomePassage', null);
			return {
				empty:    S.sceneIdFor(''),
				someP:    S.sceneIdFor('SomePassage'),
				someNull: S.sceneIdFor(null)
			};
		});
		expect(result.empty).toBeNull();
		expect(result.someP).toBeNull();
		expect(result.someNull).toBeNull();
	});
});
