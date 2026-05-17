/*
 * Achievements event bus. Mirrors the shape of setup.Hunt (see
 * passages/hunt/Hunt.js): two channels, named events, fire-and-forget
 * notifications with a per-event ctx.
 *
 * Why a dedicated bus? The Hunt bus fires inside hunts. Achievement
 * triggers come from everywhere -- hunt outcomes today, outfit changes
 * / zone visits / wish branches tomorrow -- and the UI toast is itself
 * a subscriber. Keeping a separate bus lets non-hunt subscribers
 * register without piggy-backing on Hunt.Event, and keeps the toast
 * layer decoupled from AchievementsController.
 *
 * Subscriptions live in module-local memory (not $State); like the
 * Hunt bus, they're behavior, re-registered on script re-eval.
 */
setup.Achievements = setup.Achievements || {};

(function () {
	var Event = Object.freeze({
		UNLOCKED:    'unlocked',    // ctx: { id, entry }  -- new unlock just persisted
		ALREADY_HAD: 'already-had'  // ctx: { id, entry }  -- unlock() called on an owned id
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
			catch (e) { console.error('Achievements.on(' + event + ') subscriber threw:', e); }
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
			catch (e) { console.error('Achievements.filter(' + event + ') subscriber threw:', e); }
		}
		return ctx;
	}

	setup.Achievements.Event = Event;
	setup.Achievements.on = on;
	setup.Achievements.emit = emit;
	setup.Achievements.filter = filter;
	setup.Achievements.applyFilter = applyFilter;
})();
