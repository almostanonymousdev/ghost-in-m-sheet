/*
 * General-purpose story event bus. Same two-channel shape as
 * setup.Hunt and setup.Achievements -- notifications via on/emit,
 * filters via filter/applyFilter -- exposed under setup.StoryEvents.
 *
 * Why a catch-all bus? Some events don't earn (or warrant) a dedicated
 * controller-owned bus: cheat toggles, debug flips, miscellaneous
 * one-shot story beats. Rather than piggy-backing them onto setup.Hunt
 * (hunt-scoped) or setup.Achievements (unlock-scoped), they land here.
 * Anything that grows enough subscribers / context to justify its own
 * bus can graduate later.
 *
 * Event names live on setup.StoryEvents.Event so typos surface as
 * undefined lookups rather than silently-dropped emits.
 *
 * Subscriptions live in module-local memory (not $State) -- they're
 * behavior, re-registered when scripts re-eval on save/load.
 */
setup.StoryEvents = (function () {
	var Event = Object.freeze({
		CHEAT_USED: 'cheat-used'  // ctx: { source } -- any cheat toggled or fired
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
			catch (e) { console.error('StoryEvents.on(' + event + ') subscriber threw:', e); }
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
			catch (e) { console.error('StoryEvents.filter(' + event + ') subscriber threw:', e); }
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
