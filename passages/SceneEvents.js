/*
 * Scene-viewing event bus. Same two-channel shape as setup.Hunt /
 * setup.StoryEvents / setup.Achievements -- notifications via on/emit,
 * filters via filter/applyFilter -- exposed under setup.SceneEvents.
 *
 * Purpose: a single chokepoint that fires whenever the player views
 * a registered scene passage. Subscribers consume Event.VIEWED to
 * record progress (the Flashbacks gallery uses it as the sole source
 * of truth for unlock state), drive achievements, etc.
 *
 * Registration model: callers tell the bus which passage names count
 * as scenes via register(passageName, sceneId). The bus subscribes to
 * :passagestart once at module-eval time and emits VIEWED with a
 * { sceneId, passageName } ctx whenever a registered passage opens.
 * Unregistered passages don't emit -- subscribers can trust the
 * presence of an event to mean "this is a real scene."
 *
 * Subscriptions and the registry live in module-local memory (not
 * $State) -- they're behavior, re-registered when scripts re-eval on
 * save/load. Anything that needs persistence writes to its own
 * bundle.
 */
setup.SceneEvents = (function () {
	var Event = Object.freeze({
		VIEWED: 'viewed'   // ctx: { sceneId, passageName }
	});

	var listeners = {};
	var filters = {};
	var registry = {};

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
			catch (e) { console.error('SceneEvents.on(' + event + ') subscriber threw:', e); }
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
			catch (e) { console.error('SceneEvents.filter(' + event + ') subscriber threw:', e); }
		}
		return ctx;
	}

	/* Map a passage name to a stable scene id. Idempotent --
	   re-registering the same passage just overwrites the previous
	   id, which is what you want if a scene moves to a new passage. */
	function register(passageName, sceneId) {
		if (typeof passageName !== 'string' || !passageName) return;
		if (typeof sceneId !== 'string' || !sceneId) return;
		registry[passageName] = sceneId;
	}

	function sceneIdFor(passageName) {
		return registry[passageName] || null;
	}

	/* Test/inspection hook -- returns a shallow copy. */
	function registered() {
		var out = {};
		Object.keys(registry).forEach(function (k) { out[k] = registry[k]; });
		return out;
	}

	if (typeof $ !== 'undefined') {
		$(document).on(':passagestart', function (ev) {
			var name = ev && ev.passage && ev.passage.name;
			if (!name) return;
			var sceneId = registry[name];
			if (!sceneId) return;
			emit(Event.VIEWED, { sceneId: sceneId, passageName: name });
		});
	}

	return {
		Event:        Event,
		on:           on,
		emit:         emit,
		filter:       filter,
		applyFilter:  applyFilter,
		register:     register,
		sceneIdFor:   sceneIdFor,
		registered:   registered
	};
})();
