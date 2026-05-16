/**
 * setup.Hunt event bus.
 *
 * Two channels:
 *   - Notifications  on(event, fn) / emit(event, ctx)
 *                    Returns an unsubscribe function. Subscribers fire in
 *                    registration order; a throwing subscriber is logged and
 *                    skipped without blocking the rest.
 *   - Filters        filter(event, fn) / applyFilter(event, ctx) → ctx
 *                    Subscribers mutate the passed ctx in place. Emitter
 *                    consumes the final ctx.
 *
 * Event names live in setup.Hunt.Event. These tests pin the bus contract
 * plus the integration point where setup.HuntController.startHunt emits
 * Event.START.
 */
const { test, expect } = require('@playwright/test');
const { openGame, resetGame, callSetup } = require('./helpers');

test.describe('setup.Hunt pubsub', () => {
  let page;

  test.beforeAll(async ({ browser }) => {
    page = await openGame(browser);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test.beforeEach(async () => {
    await resetGame(page);
    await page.waitForFunction(() => SugarCube.State.variables.mc != null);
    /* Drain any subscribers left behind by prior tests in this file --
       setup.Hunt's subscriber tables live in module-local memory and
       survive Engine.restart. */
    await page.evaluate(() => {
      window.__huntSubs = window.__huntSubs || [];
      while (window.__huntSubs.length) window.__huntSubs.shift()();
    });
  });

  test.describe('notifications: on / emit', () => {
    test('on() subscriber receives ctx', async () => {
      const result = await page.evaluate(() => {
        const calls = [];
        const { Hunt } = SugarCube.setup;
        window.__huntSubs.push(Hunt.on(Hunt.Event.START, (ctx) => calls.push(ctx)));
        Hunt.emit(Hunt.Event.START, { ghostName: 'Banshee', seed: 42 });
        return calls;
      });
      expect(result).toEqual([{ ghostName: 'Banshee', seed: 42 }]);
    });

    test('multiple subscribers fire in registration order', async () => {
      const order = await page.evaluate(() => {
        const log = [];
        const { Hunt } = SugarCube.setup;
        window.__huntSubs.push(Hunt.on(Hunt.Event.START, () => log.push('a')));
        window.__huntSubs.push(Hunt.on(Hunt.Event.START, () => log.push('b')));
        window.__huntSubs.push(Hunt.on(Hunt.Event.START, () => log.push('c')));
        Hunt.emit(Hunt.Event.START, { ghostName: 'X', seed: 1 });
        return log;
      });
      expect(order).toEqual(['a', 'b', 'c']);
    });

    test('unsubscribe returned by on() removes the listener', async () => {
      const calls = await page.evaluate(() => {
        let count = 0;
        const { Hunt } = SugarCube.setup;
        const unsub = Hunt.on(Hunt.Event.START, () => { count++; });
        Hunt.emit(Hunt.Event.START, { ghostName: 'X', seed: 1 });
        unsub();
        Hunt.emit(Hunt.Event.START, { ghostName: 'X', seed: 2 });
        return count;
      });
      expect(calls).toBe(1);
    });

    test('a throwing subscriber does not block subsequent subscribers', async () => {
      /* Silence the console.error the bus emits when a subscriber throws --
         it's expected here, not a test failure. */
      page.on('console', () => {});
      const result = await page.evaluate(() => {
        const log = [];
        const { Hunt } = SugarCube.setup;
        window.__huntSubs.push(Hunt.on(Hunt.Event.START, () => log.push('first')));
        window.__huntSubs.push(Hunt.on(Hunt.Event.START, () => { throw new Error('boom'); }));
        window.__huntSubs.push(Hunt.on(Hunt.Event.START, () => log.push('third')));
        Hunt.emit(Hunt.Event.START, { ghostName: 'X', seed: 1 });
        return log;
      });
      expect(result).toEqual(['first', 'third']);
    });

    test('emit with no subscribers is a no-op', async () => {
      const threw = await page.evaluate(() => {
        const { Hunt } = SugarCube.setup;
        try {
          Hunt.emit(Hunt.Event.END, { outcome: 'success' });
          return false;
        } catch (e) {
          return true;
        }
      });
      expect(threw).toBe(false);
    });

    test('subscribers for one event do not fire on a different event', async () => {
      const counts = await page.evaluate(() => {
        const { Hunt } = SugarCube.setup;
        let starts = 0, ends = 0;
        window.__huntSubs.push(Hunt.on(Hunt.Event.START, () => { starts++; }));
        window.__huntSubs.push(Hunt.on(Hunt.Event.END, () => { ends++; }));
        Hunt.emit(Hunt.Event.START, {});
        Hunt.emit(Hunt.Event.START, {});
        Hunt.emit(Hunt.Event.END, {});
        return { starts, ends };
      });
      expect(counts).toEqual({ starts: 2, ends: 1 });
    });
  });

  test.describe('filters: filter / applyFilter', () => {
    test('filter subscriber mutates ctx in place; applyFilter returns the same object', async () => {
      const result = await page.evaluate(() => {
        const { Hunt } = SugarCube.setup;
        window.__huntSubs.push(Hunt.filter(Hunt.Event.FLOORPLAN_OPTIONS, (ctx) => {
          ctx.extraRooms += 3;
        }));
        const input = { extraRooms: 0, smallerHouse: false };
        const output = Hunt.applyFilter(Hunt.Event.FLOORPLAN_OPTIONS, input);
        return { extraRooms: output.extraRooms, sameRef: output === input };
      });
      expect(result).toEqual({ extraRooms: 3, sameRef: true });
    });

    test('multiple filters chain in registration order', async () => {
      const result = await page.evaluate(() => {
        const { Hunt } = SugarCube.setup;
        window.__huntSubs.push(Hunt.filter(Hunt.Event.PAYOUT, (ctx) => { ctx.multiplier *= 2; }));
        window.__huntSubs.push(Hunt.filter(Hunt.Event.PAYOUT, (ctx) => { ctx.multiplier += 1; }));
        return Hunt.applyFilter(Hunt.Event.PAYOUT, { multiplier: 1 }).multiplier;
      });
      /* (1 * 2) + 1 — confirms order, not just commutativity. */
      expect(result).toBe(3);
    });

    test('applyFilter with no subscribers returns ctx unchanged', async () => {
      const result = await page.evaluate(() => {
        const { Hunt } = SugarCube.setup;
        const input = { evidence: ['EMF', 'GWB', 'PLASM'] };
        const output = Hunt.applyFilter(Hunt.Event.EVIDENCE_POOL, input);
        return { sameRef: output === input, evidence: output.evidence };
      });
      expect(result).toEqual({ sameRef: true, evidence: ['EMF', 'GWB', 'PLASM'] });
    });

    test('unsubscribe returned by filter() removes the filter', async () => {
      const result = await page.evaluate(() => {
        const { Hunt } = SugarCube.setup;
        const unsub = Hunt.filter(Hunt.Event.STARTING_TOOLS, (ctx) => { ctx.tools.length = 0; });
        const first = Hunt.applyFilter(Hunt.Event.STARTING_TOOLS, { tools: ['emf', 'uvl'] }).tools.length;
        unsub();
        const second = Hunt.applyFilter(Hunt.Event.STARTING_TOOLS, { tools: ['emf', 'uvl'] }).tools.length;
        return { first, second };
      });
      expect(result).toEqual({ first: 0, second: 2 });
    });

    test('a throwing filter does not block subsequent filters', async () => {
      page.on('console', () => {});
      const result = await page.evaluate(() => {
        const { Hunt } = SugarCube.setup;
        window.__huntSubs.push(Hunt.filter(Hunt.Event.PAYOUT, (ctx) => { ctx.multiplier += 1; }));
        window.__huntSubs.push(Hunt.filter(Hunt.Event.PAYOUT, () => { throw new Error('boom'); }));
        window.__huntSubs.push(Hunt.filter(Hunt.Event.PAYOUT, (ctx) => { ctx.multiplier += 10; }));
        return Hunt.applyFilter(Hunt.Event.PAYOUT, { multiplier: 0 }).multiplier;
      });
      expect(result).toBe(11);
    });

    test('filter and on use independent buckets per event name', async () => {
      const result = await page.evaluate(() => {
        const { Hunt } = SugarCube.setup;
        let observed = 0;
        window.__huntSubs.push(Hunt.on(Hunt.Event.PAYOUT, () => { observed++; }));
        window.__huntSubs.push(Hunt.filter(Hunt.Event.PAYOUT, (ctx) => { ctx.multiplier += 5; }));

        /* applyFilter must not trigger on() listeners. */
        const filtered = Hunt.applyFilter(Hunt.Event.PAYOUT, { multiplier: 0 }).multiplier;
        const observedAfterApply = observed;

        /* emit() must not run filter() subscribers. */
        const ctx = { multiplier: 0 };
        Hunt.emit(Hunt.Event.PAYOUT, ctx);
        return { filtered, observedAfterApply, observedAfterEmit: observed, ctxAfterEmit: ctx.multiplier };
      });
      expect(result).toEqual({ filtered: 5, observedAfterApply: 0, observedAfterEmit: 1, ctxAfterEmit: 0 });
    });
  });

  test.describe('Event enum', () => {
    test('Event keys are defined strings', async () => {
      const events = await page.evaluate(() => {
        const E = SugarCube.setup.Hunt.Event;
        return {
          START: E.START,
          END: E.END,
          TICK: E.TICK,
          DRIFT: E.DRIFT,
          CAUGHT: E.CAUGHT,
          POSSESS: E.POSSESS,
          TRAP: E.TRAP,
          EVIDENCE_TRIGGER: E.EVIDENCE_TRIGGER,
          LOOT_TAKEN: E.LOOT_TAKEN,
          ROOM_ENTER: E.ROOM_ENTER,
          FLOORPLAN_OPTIONS: E.FLOORPLAN_OPTIONS,
          EVIDENCE_POOL: E.EVIDENCE_POOL,
          STARTING_TOOLS: E.STARTING_TOOLS,
          PAYOUT: E.PAYOUT,
          STEAL_CHECK: E.STEAL_CHECK,
          PROWL_CHECK: E.PROWL_CHECK,
          OBJECTIVE: E.OBJECTIVE,
          COMPANION_ALLOWED: E.COMPANION_ALLOWED
        };
      });
      for (const [key, value] of Object.entries(events)) {
        expect(typeof value, `Event.${key}`).toBe('string');
        expect(value.length, `Event.${key}`).toBeGreaterThan(0);
      }
    });

    test('Event enum is frozen', async () => {
      const frozen = await page.evaluate(() => {
        return Object.isFrozen(SugarCube.setup.Hunt.Event);
      });
      expect(frozen).toBe(true);
    });
  });

  test.describe('integration', () => {
    test('setup.HuntController.startHunt emits Event.START with run ghostName + seed', async () => {
      await page.evaluate(() => { SugarCube.State.variables.mc.lvl = 4; });

      const capture = await page.evaluate(() => {
        const seen = [];
        const { Hunt } = SugarCube.setup;
        window.__huntSubs.push(Hunt.on(Hunt.Event.START, (ctx) => seen.push(ctx)));
        SugarCube.setup.HuntController.startHunt({ seed: 12345 });
        return seen;
      });

      expect(capture.length).toBe(1);
      expect(capture[0].seed).toBe(12345);
      expect(typeof capture[0].ghostName).toBe('string');
      expect(capture[0].ghostName.length).toBeGreaterThan(0);

      const runGhostName = await callSetup(page, 'setup.HuntController.ghostName()');
      expect(capture[0].ghostName).toBe(runGhostName);
    });

    test('setCurrentRoom emits Event.ROOM_ENTER with from/to room ids', async () => {
      await page.evaluate(() => { SugarCube.State.variables.mc.lvl = 4; });
      const capture = await page.evaluate(() => {
        const HC = SugarCube.setup.HuntController;
        const { Hunt } = SugarCube.setup;
        HC.startHunt({ seed: 7777 });
        const seen = [];
        window.__huntSubs.push(Hunt.on(Hunt.Event.ROOM_ENTER, (ctx) => seen.push(ctx)));
        const run = HC.active();
        const ids = run.floorplan.rooms.map(r => r.id);
        const target = ids.find(id => id !== run.currentRoomId);
        const startRoom = run.currentRoomId;
        HC.setCurrentRoom(target);
        // Calling setCurrentRoom with the same id should NOT emit.
        HC.setCurrentRoom(target);
        return { seen, startRoom, target };
      });
      expect(capture.seen.length).toBe(1);
      expect(capture.seen[0].roomId).toBe(capture.target);
      expect(capture.seen[0].fromRoomId).toBe(capture.startRoom);
    });

    test('takeLoot emits Event.LOOT_TAKEN with the kind; duplicate take is a no-op', async () => {
      await page.evaluate(() => { SugarCube.State.variables.mc.lvl = 4; });
      const capture = await page.evaluate(() => {
        const HC = SugarCube.setup.HuntController;
        const { Hunt } = SugarCube.setup;
        HC.startHunt({ seed: 4242 });
        const seen = [];
        window.__huntSubs.push(Hunt.on(Hunt.Event.LOOT_TAKEN, (ctx) => seen.push(ctx)));
        const first = HC.takeLoot('tarotCards');
        const second = HC.takeLoot('tarotCards');
        return { seen, first, second, roomId: HC.currentRoomId() };
      });
      expect(capture.first).toBe(true);
      expect(capture.second).toBe(false);
      expect(capture.seen.length).toBe(1);
      expect(capture.seen[0].kind).toBe('tarotCards');
      expect(capture.seen[0].roomId).toBe(capture.roomId);
    });

    test('driftGhostRoom emits Event.DRIFT with from/to room ids', async () => {
      await page.evaluate(() => { SugarCube.State.variables.mc.lvl = 4; });
      const capture = await page.evaluate(() => {
        const HC = SugarCube.setup.HuntController;
        const { Hunt } = SugarCube.setup;
        HC.startHunt({ seed: 1010 });
        const seen = [];
        window.__huntSubs.push(Hunt.on(Hunt.Event.DRIFT, (ctx) => seen.push(ctx)));
        const before = HC.active().floorplan.spawnRoomId;
        HC.driftGhostRoom();
        const after = HC.active().floorplan.spawnRoomId;
        return { seen, before, after };
      });
      expect(capture.seen.length).toBe(1);
      expect(capture.seen[0].fromRoom).toBe(capture.before);
      expect(capture.seen[0].toRoom).toBe(capture.after);
    });

    test('trapGhost emits Event.TRAP with unlockBy + ghost roomId', async () => {
      await page.evaluate(() => { SugarCube.State.variables.mc.lvl = 4; });
      const capture = await page.evaluate(() => {
        const HC = SugarCube.setup.HuntController;
        const { Hunt } = SugarCube.setup;
        HC.startHunt({ seed: 2020 });
        const seen = [];
        window.__huntSubs.push(Hunt.on(Hunt.Event.TRAP, (ctx) => seen.push(ctx)));
        const ok = HC.trapGhost('monkeyPaw');
        return { seen, ok, ghostRoom: HC.active().floorplan.spawnRoomId };
      });
      expect(capture.ok).toBe(true);
      expect(capture.seen.length).toBe(1);
      expect(capture.seen[0].unlockBy).toBe('monkeyPaw');
      expect(capture.seen[0].roomId).toBe(capture.ghostRoom);
    });

    test('endHunt emits Event.END with success, payout, ghostName, seed', async () => {
      await page.evaluate(() => { SugarCube.State.variables.mc.lvl = 4; });
      const capture = await page.evaluate(() => {
        const HC = SugarCube.setup.HuntController;
        const { Hunt } = SugarCube.setup;
        HC.startHunt({ seed: 3030 });
        const run = HC.active();
        const ghostName = run.ghostName;
        const seed = run.seed;
        const number = run.number;
        const seen = [];
        window.__huntSubs.push(Hunt.on(Hunt.Event.END, (ctx) => seen.push(ctx)));
        const summary = HC.endHunt(true);
        return { seen, summary, ghostName, seed, number };
      });
      expect(capture.seen.length).toBe(1);
      expect(capture.seen[0].success).toBe(true);
      expect(capture.seen[0].payout).toBe(capture.summary.payout);
      expect(capture.seen[0].ghostName).toBe(capture.ghostName);
      expect(capture.seen[0].seed).toBe(capture.seed);
      expect(capture.seen[0].number).toBe(capture.number);
    });

    test('endHunt with failure passes the failureReason through', async () => {
      await page.evaluate(() => { SugarCube.State.variables.mc.lvl = 4; });
      const capture = await page.evaluate(() => {
        const HC = SugarCube.setup.HuntController;
        const { Hunt } = SugarCube.setup;
        HC.startHunt({ seed: 4040 });
        HC.markFailure(HC.FailureReason.CAUGHT);
        const seen = [];
        window.__huntSubs.push(Hunt.on(Hunt.Event.END, (ctx) => seen.push(ctx)));
        HC.endHunt(false);
        return seen;
      });
      expect(capture.length).toBe(1);
      expect(capture[0].success).toBe(false);
      expect(capture[0].failureReason).toBe('caught');
    });

    test('huntCaughtPassage emits Event.CAUGHT before stamping failure', async () => {
      await page.evaluate(() => { SugarCube.State.variables.mc.lvl = 4; });
      const capture = await page.evaluate(() => {
        const HC = SugarCube.setup.HuntController;
        const { Hunt } = SugarCube.setup;
        HC.startHunt({ seed: 5050 });
        const ghostName = HC.ghostName();
        const seen = [];
        window.__huntSubs.push(Hunt.on(Hunt.Event.CAUGHT, (ctx) => seen.push(ctx)));
        const dest = HC.huntCaughtPassage();
        return { seen, ghostName, dest };
      });
      expect(capture.dest).toBe('HuntSummary');
      expect(capture.seen.length).toBe(1);
      expect(capture.seen[0].ghostName).toBe(capture.ghostName);
    });

    test('possessionPassage emits Event.POSSESS before endHunt', async () => {
      await page.evaluate(() => { SugarCube.State.variables.mc.lvl = 4; });
      const capture = await page.evaluate(() => {
        const HC = SugarCube.setup.HuntController;
        const { Hunt } = SugarCube.setup;
        HC.startHunt({ seed: 6060 });
        const ghostName = HC.ghostName();
        const order = [];
        window.__huntSubs.push(Hunt.on(Hunt.Event.POSSESS, (ctx) => order.push({ kind: 'possess', ctx })));
        window.__huntSubs.push(Hunt.on(Hunt.Event.END, (ctx) => order.push({ kind: 'end', ctx })));
        const dest = HC.possessionPassage();
        return { order, ghostName, dest };
      });
      expect(capture.dest).toBe('CityMapPossessed');
      expect(capture.order.map(e => e.kind)).toEqual(['possess', 'end']);
      expect(capture.order[0].ctx.ghostName).toBe(capture.ghostName);
      expect(capture.order[1].ctx.failureReason).toBe('possessed');
    });

    test('huntTickStep widget emits Event.TICK once per nav step', async () => {
      await page.evaluate(() => { SugarCube.State.variables.mc.lvl = 4; });
      const seen = await page.evaluate(() => {
        const HC = SugarCube.setup.HuntController;
        const { Hunt } = SugarCube.setup;
        HC.startHunt({ seed: 7070 });
        SugarCube.State.variables.mc.sanity = 100;
        SugarCube.State.variables.mc.energy = 100;
        SugarCube.Engine.play('HuntRun');
        const log = [];
        window.__huntSubs.push(Hunt.on(Hunt.Event.TICK, (ctx) => log.push(ctx)));
        HC.tick();
        HC.tick();
        return log;
      });
      expect(seen.length).toBe(2);
      expect(typeof seen[0].roomId === 'string' || seen[0].roomId === null).toBe(true);
    });

    test('STARTING_TOOLS filter empties the toolbar when LOCKED_TOOLS is active', async () => {
      await page.evaluate(() => { SugarCube.State.variables.mc.lvl = 4; });
      const result = await page.evaluate(() => {
        const HC = SugarCube.setup.HuntController;
        HC.startHunt({ seed: 8181 });
        const run = HC.active();
        run.modifiers = [SugarCube.setup.Modifiers.LOCKED_TOOLS];
        run.loadout = null;
        return {
          tools: HC.startingTools(),
          base: HC.startingToolsBase([SugarCube.setup.Modifiers.LOCKED_TOOLS], null),
          order: SugarCube.setup.searchToolOrder
        };
      });
      expect(result.tools).toEqual([]);
      expect(result.base).toEqual([]);
      expect(Array.isArray(result.order) && result.order.length > 0).toBe(true);
    });

    test('STARTING_TOOLS filter is a no-op without LOCKED_TOOLS; full kit + loadout intersection survive', async () => {
      await page.evaluate(() => { SugarCube.State.variables.mc.lvl = 4; });
      const result = await page.evaluate(() => {
        const HC = SugarCube.setup.HuntController;
        const order = SugarCube.setup.searchToolOrder.slice();
        const subset = [order[0], order[2]];
        const full = HC.startingToolsBase([], null);
        const intersected = HC.startingToolsBase([], { tools: subset });
        return { full, intersected, order, subset };
      });
      expect(result.full).toEqual(result.order);
      // Intersection preserves canonical order.
      expect(result.intersected).toEqual(result.order.filter(t => result.subset.indexOf(t) !== -1));
    });

    test('LOCKED_TOOLS overrides loadout (Empty Bag wins even with a loadout)', async () => {
      await page.evaluate(() => { SugarCube.State.variables.mc.lvl = 4; });
      const tools = await page.evaluate(() => {
        const HC = SugarCube.setup.HuntController;
        const M = SugarCube.setup.Modifiers;
        const order = SugarCube.setup.searchToolOrder;
        return HC.startingToolsBase([M.LOCKED_TOOLS], { tools: [order[0], order[1]] });
      });
      expect(tools).toEqual([]);
    });

    test('LOCKED_TOOLS empties base but collected loot still fills the toolbar', async () => {
      await page.evaluate(() => { SugarCube.State.variables.mc.lvl = 4; });
      const result = await page.evaluate(() => {
        const HC = SugarCube.setup.HuntController;
        const M = SugarCube.setup.Modifiers;
        HC.startHunt({ seed: 9191 });
        const run = HC.active();
        run.modifiers = [M.LOCKED_TOOLS];
        run.loadout = null;
        const firstTool = SugarCube.setup.searchToolOrder[0];
        run.collectedLoot = [SugarCube.setup.FloorPlan.toolLootKind(firstTool)];
        return { tools: HC.startingTools(), expected: [firstTool] };
      });
      expect(result.tools).toEqual(result.expected);
    });

    test('FLOORPLAN_OPTIONS filter: MAZE adds 3 rooms', async () => {
      const result = await page.evaluate(() => {
        const { Hunt, Modifiers } = SugarCube.setup;
        const baseline = Hunt.applyFilter(Hunt.Event.FLOORPLAN_OPTIONS, {
          fpOpts: { roomCount: 5 },
          modifierIds: [],
          seed: 1
        });
        const mazed = Hunt.applyFilter(Hunt.Event.FLOORPLAN_OPTIONS, {
          fpOpts: { roomCount: 5 },
          modifierIds: [Modifiers.MAZE],
          seed: 1
        });
        return { baseline: baseline.fpOpts.roomCount, mazed: mazed.fpOpts.roomCount };
      });
      expect(result.baseline).toBe(5);
      expect(result.mazed).toBe(8);
    });

    test('FLOORPLAN_OPTIONS filter: SMALLER_HOUSE unlock shaves one room, floor 2', async () => {
      const result = await page.evaluate(() => {
        const { Hunt } = SugarCube.setup;
        // Reach into meta-state directly: buyUnlock has a cost gate, and
        // this test only cares about the filter wiring, not the shop UI.
        const s = SugarCube.State.variables;
        s.meta = s.meta || { unlocks: {}, bannedModifiers: [], rerollCharges: 0 };
        s.meta.unlocks = s.meta.unlocks || {};
        const had = s.meta.unlocks.smaller_house || 0;
        s.meta.unlocks.smaller_house = 1;
        try {
          const normal = Hunt.applyFilter(Hunt.Event.FLOORPLAN_OPTIONS, {
            fpOpts: { roomCount: 5 }, modifierIds: [], seed: 0
          });
          const tiny = Hunt.applyFilter(Hunt.Event.FLOORPLAN_OPTIONS, {
            fpOpts: { roomCount: 2 }, modifierIds: [], seed: 0
          });
          return { normal: normal.fpOpts.roomCount, tiny: tiny.fpOpts.roomCount };
        } finally {
          s.meta.unlocks.smaller_house = had;
        }
      });
      expect(result.normal).toBe(4);
      expect(result.tiny).toBe(2);
    });

    test('EVIDENCE_POOL filter: FOG_OF_WAR drops one evidence; no-op without it', async () => {
      const result = await page.evaluate(() => {
        const { Hunt, Modifiers } = SugarCube.setup;
        const noFog = Hunt.applyFilter(Hunt.Event.EVIDENCE_POOL, {
          evidence: ['emf', 'gwb', 'uvl'], modifierIds: [], seed: 123
        });
        const withFog = Hunt.applyFilter(Hunt.Event.EVIDENCE_POOL, {
          evidence: ['emf', 'gwb', 'uvl'], modifierIds: [Modifiers.FOG_OF_WAR], seed: 123
        });
        const withFogAgain = Hunt.applyFilter(Hunt.Event.EVIDENCE_POOL, {
          evidence: ['emf', 'gwb', 'uvl'], modifierIds: [Modifiers.FOG_OF_WAR], seed: 123
        });
        return { noFog: noFog.evidence, withFog: withFog.evidence, withFogAgain: withFogAgain.evidence };
      });
      expect(result.noFog).toEqual(['emf', 'gwb', 'uvl']);
      expect(result.withFog.length).toBe(2);
      // Deterministic from seed: same seed drops the same evidence.
      expect(result.withFog).toEqual(result.withFogAgain);
    });

    test('PAYOUT filter: modifier multipliers stack through endHunt', async () => {
      await page.evaluate(() => { SugarCube.State.variables.mc.lvl = 4; });
      const result = await page.evaluate(() => {
        const HC = SugarCube.setup.HuntController;
        const M = SugarCube.setup.Modifiers;
        HC.startHunt({ seed: 11111 });
        const run = HC.active();
        // Force a known modifier deck: FOG_OF_WAR (1.5x) + SWIPER (1.4x) = 2.1x.
        run.modifiers = [M.FOG_OF_WAR, M.SWIPER];
        const summary = HC.endHunt(true);
        return { payout: summary.payout, expected: Math.round(10 * 1.5 * 1.4) };
      });
      expect(result.payout).toBe(result.expected);
    });

    test('PAYOUT filter: no modifiers means base payout (round(base * 1))', async () => {
      await page.evaluate(() => { SugarCube.State.variables.mc.lvl = 4; });
      const result = await page.evaluate(() => {
        const HC = SugarCube.setup.HuntController;
        HC.startHunt({ seed: 12121 });
        const run = HC.active();
        run.modifiers = [];
        return { success: HC.endHunt(true).payout, fail: (function () {
          HC.startHunt({ seed: 12122 });
          HC.active().modifiers = [];
          return HC.endHunt(false).payout;
        })() };
      });
      expect(result.success).toBe(10);
      expect(result.fail).toBe(3);
    });

    test('STEAL_CHECK filter: SWIPER forces a steal trigger', async () => {
      const result = await page.evaluate(() => {
        const { Hunt, Modifiers } = SugarCube.setup;
        const off = Hunt.applyFilter(Hunt.Event.STEAL_CHECK, {
          forceTrigger: false, modifierIds: []
        });
        const on = Hunt.applyFilter(Hunt.Event.STEAL_CHECK, {
          forceTrigger: false, modifierIds: [Modifiers.SWIPER]
        });
        return { off: off.forceTrigger, on: on.forceTrigger };
      });
      expect(result.off).toBe(false);
      expect(result.on).toBe(true);
    });

    test('SNAPSHOT filter: PHEROMONES / COLD_SWEAT / OH_BUGGER mutate snap when inHouse', async () => {
      const result = await page.evaluate(() => {
        const { Hunt, Modifiers } = SugarCube.setup;
        function snap() { return { lustPerStep: 0, prowlChanceBonus: 0 }; }
        const all = Hunt.applyFilter(Hunt.Event.SNAPSHOT, {
          snap: snap(),
          modifierIds: [Modifiers.PHEROMONES, Modifiers.COLD_SWEAT, Modifiers.OH_BUGGER],
          inHouse: true
        });
        const outsideHouse = Hunt.applyFilter(Hunt.Event.SNAPSHOT, {
          snap: snap(),
          modifierIds: [Modifiers.PHEROMONES, Modifiers.COLD_SWEAT, Modifiers.OH_BUGGER],
          inHouse: false
        });
        const none = Hunt.applyFilter(Hunt.Event.SNAPSHOT, {
          snap: snap(), modifierIds: [], inHouse: true
        });
        return { all: all.snap, outside: outsideHouse.snap, none: none.snap };
      });
      expect(result.all.lustPerStep).toBe(1);
      expect(result.all.prowlChanceBonus).toBe(19);
      // Outside the house: filter is a no-op even if modifiers active.
      expect(result.outside).toEqual({ lustPerStep: 0, prowlChanceBonus: 0 });
      expect(result.none).toEqual({ lustPerStep: 0, prowlChanceBonus: 0 });
    });

    test('STEAL_CHECK filter: Ironclad runsStealClothes=false sets ctx.suppress', async () => {
      await page.evaluate(() => { SugarCube.State.variables.mc.lvl = 4; });
      const result = await page.evaluate(() => {
        const HC = SugarCube.setup.HuntController;
        const { Hunt } = SugarCube.setup;
        function probe() {
          return Hunt.applyFilter(Hunt.Event.STEAL_CHECK, {
            forceTrigger: false, suppress: false, modifierIds: []
          });
        }
        HC.startHunt({ seed: 1, staticHouseId: 'ironclad' });
        const iron = probe();
        HC.endHunt(false);
        HC.startHunt({ seed: 1, staticHouseId: 'owaissa' });
        const owai = probe();
        HC.endHunt(false);
        HC.startHunt({ seed: 1 });
        const proc = probe();
        return { iron: iron.suppress, owai: owai.suppress, proc: proc.suppress };
      });
      expect(result.iron).toBe(true);
      expect(result.owai).toBe(false);
      expect(result.proc).toBe(false);
    });

    test('STEAL_CHECK filter: house suppress wins over Swiper forceTrigger', async () => {
      await page.evaluate(() => { SugarCube.State.variables.mc.lvl = 4; });
      const result = await page.evaluate(() => {
        const HC = SugarCube.setup.HuntController;
        const M = SugarCube.setup.Modifiers;
        HC.startHunt({ seed: 1, staticHouseId: 'ironclad' });
        HC.active().modifiers = [M.SWIPER];
        // shouldTriggerSteal honors suppress before consulting forceTrigger.
        return SugarCube.setup.HauntedHouses.shouldTriggerSteal();
      });
      expect(result).toBe(false);
    });

    test('COMPANION_ALLOWED filter: Ironclad opts out, owaissa/elm/procedural opt in', async () => {
      await page.evaluate(() => { SugarCube.State.variables.mc.lvl = 4; });
      const result = await page.evaluate(() => {
        const HC = SugarCube.setup.HuntController;
        function probe() { return HC.huntAllowsCompanions(); }
        HC.startHunt({ seed: 1, staticHouseId: 'ironclad' });
        const iron = probe();
        HC.endHunt(false);
        HC.startHunt({ seed: 1, staticHouseId: 'owaissa' });
        const owai = probe();
        HC.endHunt(false);
        HC.startHunt({ seed: 1, staticHouseId: 'elm' });
        const elm = probe();
        HC.endHunt(false);
        HC.startHunt({ seed: 1 });
        const proc = probe();
        return { iron, owai, elm, proc };
      });
      expect(result.iron).toBe(false);
      expect(result.owai).toBe(true);
      expect(result.elm).toBe(true);
      expect(result.proc).toBe(true);
    });

    test('MODIFIER_COUNT filter: static house with modifierCount=0 wins over default', async () => {
      await page.evaluate(() => { SugarCube.State.variables.mc.lvl = 4; });
      const result = await page.evaluate(() => {
        const { Hunt } = SugarCube.setup;
        return {
          owai: Hunt.applyFilter(Hunt.Event.MODIFIER_COUNT,
            { count: null, staticHouseId: 'owaissa' }).count,
          iron: Hunt.applyFilter(Hunt.Event.MODIFIER_COUNT,
            { count: null, staticHouseId: 'ironclad' }).count,
          proc: Hunt.applyFilter(Hunt.Event.MODIFIER_COUNT,
            { count: null, staticHouseId: null }).count,
          // caller pin wins -- subscriber must not overwrite a non-null count
          pinned: Hunt.applyFilter(Hunt.Event.MODIFIER_COUNT,
            { count: 3, staticHouseId: 'owaissa' }).count
        };
      });
      expect(result.owai).toBe(0);
      expect(result.iron).toBe(0);
      expect(result.proc).toBe(null);
      expect(result.pinned).toBe(3);
    });

    test('MODIFIER_COUNT applied: static-house run drafts 0 modifiers', async () => {
      await page.evaluate(() => { SugarCube.State.variables.mc.lvl = 4; });
      const result = await page.evaluate(() => {
        const HC = SugarCube.setup.HuntController;
        HC.startHunt({ seed: 7, staticHouseId: 'owaissa' });
        const owai = HC.modifiers().length;
        HC.endHunt(false);
        HC.startHunt({ seed: 7 });
        const proc = HC.modifiers().length;
        HC.endHunt(false);
        // caller wins even on a static house
        HC.startHunt({ seed: 7, staticHouseId: 'owaissa', modifierCount: 2 });
        const pinned = HC.modifiers().length;
        HC.endHunt(false);
        return { owai, proc, pinned };
      });
      expect(result.owai).toBe(0);
      expect(result.proc).toBe(2);
      expect(result.pinned).toBe(2);
    });

    test('FLOORPLAN_OPTIONS filter: static house stamps fpOpts.staticPlan', async () => {
      const result = await page.evaluate(() => {
        const { Hunt } = SugarCube.setup;
        const iron = Hunt.applyFilter(Hunt.Event.FLOORPLAN_OPTIONS, {
          fpOpts: {}, modifierIds: [], seed: 1, loadout: null,
          staticHouseId: 'ironclad'
        });
        const proc = Hunt.applyFilter(Hunt.Event.FLOORPLAN_OPTIONS, {
          fpOpts: {}, modifierIds: [], seed: 1, loadout: null,
          staticHouseId: null
        });
        return {
          ironRooms: iron.fpOpts.staticPlan && iron.fpOpts.staticPlan.rooms.length,
          ironEdges: iron.fpOpts.staticPlan && iron.fpOpts.staticPlan.edges.length,
          procHasPlan: !!proc.fpOpts.staticPlan
        };
      });
      expect(result.ironRooms).toBe(11);
      expect(result.ironEdges).toBe(10);
      expect(result.procHasPlan).toBe(false);
    });

    test('FLOORPLAN_OPTIONS applied: Ironclad run has the frozen plan in the floor plan', async () => {
      await page.evaluate(() => { SugarCube.State.variables.mc.lvl = 4; });
      const result = await page.evaluate(() => {
        const HC = SugarCube.setup.HuntController;
        HC.startHunt({ seed: 42, staticHouseId: 'ironclad' });
        const fp = HC.active().floorplan || SugarCube.State.variables.run.floorplan;
        const roomCount = fp.rooms.length;
        const templates = fp.rooms.map(r => r.template).sort();
        HC.endHunt(false);
        return { roomCount, templates };
      });
      expect(result.roomCount).toBe(11);
      expect(result.templates).toContain('reception');
      expect(result.templates).toContain('BlockA');
      expect(result.templates).toContain('BlockB');
    });

    test('SIDEBAR_OUTFIT filter: Ironclad stamps warden override; procedural is null', async () => {
      const result = await page.evaluate(() => {
        const { Hunt } = SugarCube.setup;
        return {
          iron: Hunt.applyFilter(Hunt.Event.SIDEBAR_OUTFIT,
            { outfit: null, staticHouseId: 'ironclad' }).outfit,
          owai: Hunt.applyFilter(Hunt.Event.SIDEBAR_OUTFIT,
            { outfit: null, staticHouseId: 'owaissa' }).outfit,
          proc: Hunt.applyFilter(Hunt.Event.SIDEBAR_OUTFIT,
            { outfit: null, staticHouseId: null }).outfit
        };
      });
      expect(result.iron).toBeTruthy();
      expect(result.iron.image).toMatch(/warden/);
      expect(result.owai).toBe(null);
      expect(result.proc).toBe(null);
    });

    test('SIDEBAR_OUTFIT applied: HuntController.sidebarOutfit reads through the filter', async () => {
      await page.evaluate(() => { SugarCube.State.variables.mc.lvl = 4; });
      const result = await page.evaluate(() => {
        const HC = SugarCube.setup.HuntController;
        const off = HC.sidebarOutfit(); // no run -> null
        HC.startHunt({ seed: 1, staticHouseId: 'ironclad' });
        const iron = HC.sidebarOutfit();
        HC.endHunt(false);
        HC.startHunt({ seed: 1, staticHouseId: 'owaissa' });
        const owai = HC.sidebarOutfit();
        HC.endHunt(false);
        HC.startHunt({ seed: 1 });
        const proc = HC.sidebarOutfit();
        HC.endHunt(false);
        return { off: off, ironTip: iron && iron.tip, owai, proc };
      });
      expect(result.off).toBe(null);
      expect(result.ironTip).toMatch(/warden/i);
      expect(result.owai).toBe(null);
      expect(result.proc).toBe(null);
    });

    test('AFTERSHOCK_COOLDOWN filter: Glass Bones halves the per-tick decrement', async () => {
      const result = await page.evaluate(() => {
        const { Hunt, Modifiers } = SugarCube.setup;
        return {
          base: Hunt.applyFilter(Hunt.Event.AFTERSHOCK_COOLDOWN,
            { dec: 1, modifierIds: [] }).dec,
          glass: Hunt.applyFilter(Hunt.Event.AFTERSHOCK_COOLDOWN,
            { dec: 1, modifierIds: [Modifiers.GLASS_BONES] }).dec,
          other: Hunt.applyFilter(Hunt.Event.AFTERSHOCK_COOLDOWN,
            { dec: 1, modifierIds: [Modifiers.PHEROMONES] }).dec
        };
      });
      expect(result.base).toBe(1);
      expect(result.glass).toBe(0.5);
      expect(result.other).toBe(1);
    });

    test('AFTERSHOCK_COOLDOWN applied: Glass Bones stretches V.orgasmCooldownSteps across two ticks', async () => {
      await page.evaluate(() => { SugarCube.State.variables.mc.lvl = 4; });
      const result = await page.evaluate(() => {
        const HC = SugarCube.setup.HuntController;
        const HCo = SugarCube.setup.HauntConditions;
        const V = SugarCube.State.variables;
        HC.startHunt({ seed: 1 });
        // Clear drafted modifiers so the test pins the only one we care about.
        V.run.modifiers = [];
        HC.addModifier(SugarCube.setup.Modifiers.GLASS_BONES);
        V.orgasmCooldownSteps = 2;
        HCo.applyTickEffects();
        const afterFirst = V.orgasmCooldownSteps;
        HCo.applyTickEffects();
        const afterSecond = V.orgasmCooldownSteps;
        HC.endHunt(false);
        // baseline -- no modifier, one tick drops by 1
        HC.startHunt({ seed: 1 });
        V.run.modifiers = [];
        V.orgasmCooldownSteps = 2;
        HCo.applyTickEffects();
        const baselineAfterFirst = V.orgasmCooldownSteps;
        HC.endHunt(false);
        return { afterFirst, afterSecond, baselineAfterFirst };
      });
      expect(result.afterFirst).toBe(1.5);
      expect(result.afterSecond).toBe(1);
      expect(result.baselineAfterFirst).toBe(1);
    });

    test('BAIT_ALLOWED filter: Not Their Type vetoes; default is allowed', async () => {
      const result = await page.evaluate(() => {
        const { Hunt, Modifiers } = SugarCube.setup;
        return {
          base: Hunt.applyFilter(Hunt.Event.BAIT_ALLOWED,
            { allowed: true, modifierIds: [] }).allowed,
          ntt: Hunt.applyFilter(Hunt.Event.BAIT_ALLOWED,
            { allowed: true, modifierIds: [Modifiers.NOT_THEIR_TYPE] }).allowed,
          other: Hunt.applyFilter(Hunt.Event.BAIT_ALLOWED,
            { allowed: true, modifierIds: [Modifiers.PHEROMONES] }).allowed
        };
      });
      expect(result.base).toBe(true);
      expect(result.ntt).toBe(false);
      expect(result.other).toBe(true);
    });

    test('BAIT_ALLOWED applied: HauntConditions.canBait returns false under Not Their Type', async () => {
      await page.evaluate(() => { SugarCube.State.variables.mc.lvl = 4; });
      await page.evaluate(() => {
        const HC = SugarCube.setup.HuntController;
        const V = SugarCube.State.variables;
        V.mc.energy = 10;
        V.baitActive = 0;
        HC.startHunt({ seed: 1 });
        V.run.modifiers = [];
      });
      // canBait gates on passage === "HuntRun"; navigate so isHuntActive() is true.
      await page.evaluate(() => SugarCube.Engine.play('HuntRun'));
      const baseline = await page.evaluate(() => SugarCube.setup.HauntConditions.canBait());
      await page.evaluate(() => {
        SugarCube.setup.HuntController.addModifier(SugarCube.setup.Modifiers.NOT_THEIR_TYPE);
      });
      const vetoed = await page.evaluate(() => SugarCube.setup.HauntConditions.canBait());
      await page.evaluate(() => SugarCube.setup.HuntController.endHunt(false));
      expect(baseline).toBe(true);
      expect(vetoed).toBe(false);
    });

    test('SANITY_EVENT_MULT filter: Brittle Mind adds 0.5 on top of the base', async () => {
      const result = await page.evaluate(() => {
        const { Hunt, Modifiers } = SugarCube.setup;
        return {
          base: Hunt.applyFilter(Hunt.Event.SANITY_EVENT_MULT,
            { mult: 1, modifierIds: [], dark: false, overcharged: false }).mult,
          brittle: Hunt.applyFilter(Hunt.Event.SANITY_EVENT_MULT,
            { mult: 1, modifierIds: [Modifiers.BRITTLE_MIND], dark: false, overcharged: false }).mult,
          stacked: Hunt.applyFilter(Hunt.Event.SANITY_EVENT_MULT,
            { mult: 1.5, modifierIds: [Modifiers.BRITTLE_MIND], dark: true, overcharged: false }).mult
        };
      });
      expect(result.base).toBe(1);
      expect(result.brittle).toBe(1.5);
      expect(result.stacked).toBe(2);
    });

    test('SANITY_EVENT_MULT applied: HauntConditions.eventSanityMultiplier stacks with Brittle Mind', async () => {
      await page.evaluate(() => { SugarCube.State.variables.mc.lvl = 4; });
      const result = await page.evaluate(() => {
        const HC = SugarCube.setup.HuntController;
        const HCo = SugarCube.setup.HauntConditions;
        HC.startHunt({ seed: 1 });
        const baseline = HCo.eventSanityMultiplier();
        HC.addModifier(SugarCube.setup.Modifiers.BRITTLE_MIND);
        const brittle = HCo.eventSanityMultiplier();
        HC.endHunt(false);
        return { baseline, brittle };
      });
      expect(result.baseline).toBe(1);
      expect(result.brittle).toBe(1.5);
    });

    test('STEAL_CHECK filter: Sticky Fingers doubles chanceMult; Swiper still forces', async () => {
      const result = await page.evaluate(() => {
        const { Hunt, Modifiers } = SugarCube.setup;
        return {
          base: Hunt.applyFilter(Hunt.Event.STEAL_CHECK,
            { forceTrigger: false, suppress: false, chanceMult: 1, modifierIds: [] }).chanceMult,
          sticky: Hunt.applyFilter(Hunt.Event.STEAL_CHECK,
            { forceTrigger: false, suppress: false, chanceMult: 1, modifierIds: [Modifiers.STICKY_FINGERS] }).chanceMult,
          swiper: Hunt.applyFilter(Hunt.Event.STEAL_CHECK,
            { forceTrigger: false, suppress: false, chanceMult: 1, modifierIds: [Modifiers.SWIPER] }).forceTrigger,
          stacked: Hunt.applyFilter(Hunt.Event.STEAL_CHECK,
            { forceTrigger: false, suppress: false, chanceMult: 1, modifierIds: [Modifiers.STICKY_FINGERS, Modifiers.SWIPER] })
        };
      });
      expect(result.base).toBe(1);
      expect(result.sticky).toBe(2);
      expect(result.swiper).toBe(true);
      expect(result.stacked.chanceMult).toBe(2);
      expect(result.stacked.forceTrigger).toBe(true);
    });

    test('STEAL_CHECK applied: TickController.recomputeStealChance no longer bakes in modifier mult', async () => {
      await page.evaluate(() => { SugarCube.State.variables.mc.lvl = 4; });
      const result = await page.evaluate(() => {
        const HC = SugarCube.setup.HuntController;
        const T = SugarCube.setup.Tick;
        const V = SugarCube.State.variables;
        HC.startHunt({ seed: 1 });
        T.initTick();
        V.mc.sanity = 50;
        T.recomputeStealChance();
        const baseline = V.stealChance;
        HC.addModifier(SugarCube.setup.Modifiers.STICKY_FINGERS);
        T.recomputeStealChance();
        const withSticky = V.stealChance;
        HC.endHunt(false);
        return { baseline, withSticky };
      });
      // Modifier no longer multiplies the precomputed chance --
      // the multiplier is applied at the per-tick STEAL_CHECK roll.
      expect(result.withSticky).toBe(result.baseline);
    });

    test('ADDRESS filter: static house labels override formatted; procedural keeps seed-derived label', async () => {
      const result = await page.evaluate(() => {
        const { Hunt } = SugarCube.setup;
        const seedAddr = { number: 12, road: 'Hollow', suffix: 'Lane', formatted: '12 Hollow Lane' };
        return {
          iron: Hunt.applyFilter(Hunt.Event.ADDRESS,
            { addr: Object.assign({}, seedAddr), staticHouseId: 'ironclad' }).addr,
          owai: Hunt.applyFilter(Hunt.Event.ADDRESS,
            { addr: Object.assign({}, seedAddr), staticHouseId: 'owaissa' }).addr,
          proc: Hunt.applyFilter(Hunt.Event.ADDRESS,
            { addr: Object.assign({}, seedAddr), staticHouseId: null }).addr
        };
      });
      expect(result.iron.formatted).not.toBe('12 Hollow Lane');
      expect(result.iron.number).toBe(12);
      expect(result.owai.formatted).not.toBe('12 Hollow Lane');
      expect(result.proc.formatted).toBe('12 Hollow Lane');
    });

    test('ADDRESS applied: HuntController.address swaps formatted to the catalogue label for Owaissa', async () => {
      await page.evaluate(() => { SugarCube.State.variables.mc.lvl = 4; });
      const result = await page.evaluate(() => {
        const HC = SugarCube.setup.HuntController;
        HC.startHunt({ seed: 99, staticHouseId: 'owaissa' });
        const owai = HC.address();
        HC.endHunt(false);
        HC.startHunt({ seed: 99 });
        const proc = HC.address();
        HC.endHunt(false);
        return { owaiFormatted: owai && owai.formatted, procFormatted: proc && proc.formatted };
      });
      expect(result.owaiFormatted).toMatch(/owaissa/i);
      expect(result.procFormatted).not.toMatch(/owaissa/i);
    });

    test('tick() is a no-op when no run is active', async () => {
      const seen = await page.evaluate(() => {
        const HC = SugarCube.setup.HuntController;
        const { Hunt } = SugarCube.setup;
        const log = [];
        window.__huntSubs.push(Hunt.on(Hunt.Event.TICK, (ctx) => log.push(ctx)));
        HC.tick();
        return log;
      });
      expect(seen).toEqual([]);
    });
  });
});
