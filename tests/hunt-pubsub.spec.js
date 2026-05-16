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
  });
});
