/*
 * Hunt lifecycle event bus.
 *
 * Two channels:
 *   - Notifications  on(event, fn) / emit(event, ctx)
 *                    Fire-and-forget side effects (UI juice, logging,
 *                    companion reactions). Subscribers run in registration
 *                    order; a thrown subscriber is logged and skipped.
 *   - Filters        filter(event, fn) / applyFilter(event, ctx) → ctx
 *                    Subscribers mutate the passed ctx in place. Emitter
 *                    consumes the final ctx. Lets modifiers / contracts /
 *                    static-house quirks own their transformations
 *                    (room counts, evidence pool, payout multiplier, ...)
 *                    instead of HuntController branching on each one.
 *
 * Event names live in setup.Hunt.Event so typos surface as undefined
 * lookups rather than silently-dropped emits.
 *
 * Subscriptions live in module-local memory (not $State) -- they're
 * behavioral, re-registered when scripts re-eval on save/load.
 */
setup.Hunt = (function () {
	var Event = Object.freeze({
		START:            'start',
		END:              'end',
		TICK:             'tick',
		DRIFT:            'drift',
		CAUGHT:           'caught',
		POSSESS:          'possess',
		TRAP:             'trap',
		EVIDENCE_TRIGGER: 'evidence-trigger',
		LOOT_TAKEN:       'loot-taken',
		ROOM_ENTER:       'room-enter',
		FLOORPLAN_OPTIONS: 'floorplan-options',
		EVIDENCE_POOL:     'evidence-pool',
		STARTING_TOOLS:    'starting-tools',
		PAYOUT:            'payout',
		STEAL_CHECK:       'steal-check',
		PROWL_CHECK:       'prowl-check',
		OBJECTIVE:         'objective',
		COMPANION_ALLOWED: 'companion-allowed',
		SNAPSHOT:          'snapshot',
		MODIFIER_COUNT:    'modifier-count',
		SIDEBAR_OUTFIT:    'sidebar-outfit',
		AFTERSHOCK_COOLDOWN: 'aftershock-cooldown',
		BAIT_ALLOWED:      'bait-allowed',
		SANITY_EVENT_MULT: 'sanity-event-mult',
		ADDRESS:           'address'
	});

	var listeners = {};
	var filters = {};

	function subscribe(table, event, fn) {
		if (typeof fn !== 'function') return function () {};
		if (!table[event]) table[event] = [];
		var bucket = table[event];
		bucket.push(fn);
		return function unsubscribe() {
			var i = bucket.indexOf(fn);
			if (i !== -1) bucket.splice(i, 1);
		};
	}

	function on(event, fn) {
		return subscribe(listeners, event, fn);
	}

	function emit(event, ctx) {
		var bucket = listeners[event];
		if (!bucket) return;
		for (var i = 0; i < bucket.length; i++) {
			try { bucket[i](ctx); }
			catch (e) { console.error('Hunt.on(' + event + ') subscriber threw:', e); }
		}
	}

	function filter(event, fn) {
		return subscribe(filters, event, fn);
	}

	function applyFilter(event, ctx) {
		var bucket = filters[event];
		if (!bucket) return ctx;
		for (var i = 0; i < bucket.length; i++) {
			try { bucket[i](ctx); }
			catch (e) { console.error('Hunt.filter(' + event + ') subscriber threw:', e); }
		}
		return ctx;
	}

	return {
		Event: Event,
		on: on,
		emit: emit,
		filter: filter,
		applyFilter: applyFilter
	};
})();
