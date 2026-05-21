/*
 * Centralized helpers for the in-game clock state:
 *   $hours, $minutes, $meridiem, $dailySeed
 *
 * Any passage that needs to read or set the clock should route
 * through setup.Time. The mutation widgets <<addTime>> / <<addLust>>
 * (in widgetGuiCommon) used to read State directly -- this controller
 * gives passages a way to do the same without touching $hours/$minutes.
 *
 * Rollover plumbing lives entirely in writeHook callbacks attached to
 * the hours/minutes accessors:
 *   - addMinutes(60) cascades into addHours(1) via the minutes hook.
 *   - addHours(N) wraps past 24, regenerates $dailySeed, and returns
 *     a "did the day roll over?" boolean for the caller. Callers that
 *     advance the clock through setup.Time.addMinutes / addHours
 *     therefore never need to re-implement the wrap-and-reseed dance.
 */
setup.Time = (function () {
	/* Variables owned by this controller. Other controllers should
	   query/mutate these only through the API methods below. */
	var OWNED_VARS = Object.freeze([
		'hours', 'minutes', 'meridiem', 'dailySeed'
	]);

	var sv = setup.sv;

	function freshSeed() {
		return Math.floor(Math.random() * 0x100000000);
	}

	var api = {
		OWNED_VARS: OWNED_VARS,

		// --- Derived / totals --------------------------------
		totalMinutes: function () { return sv().hours * 60 + sv().minutes; },
		display: function () {
			var h = sv().hours < 10 ? '0' + sv().hours : sv().hours;
			var m = Math.floor(sv().minutes) < 10 ?
				'0' + Math.floor(sv().minutes) : Math.floor(sv().minutes);
			return h + ':' + m;
		},

		// --- Windows used by multiple callers ----------------
		isLate:        function () { return sv().hours <= 5; },
		isEarlyMorning: function () { return sv().hours < 6; },
		isMorningPlus:  function () { return sv().hours >= 6; },
		isNight:        function () { return sv().hours >= 23; },

		/* Inclusive-on-both-ends window check over the current hour.
		   `isBetween(8, 21)` covers 08:00 through 21:59, the natural
		   "open from 8 to 9 PM" expression. Backs setup.LocationHours
		   and the in-controller time-window predicates that used to
		   compare $hours to literal endpoints inline. */
		isBetween: function (lo, hi) {
			var h = sv().hours;
			return h >= lo && h <= hi;
		},

		// --- Scheduled in-world actions ---------------------
		// Reset the clock to midnight (used when a hunt starts
		// from the haunted-house street). Bypasses the hours
		// writeHook to skip its 24h wraparound branch -- this is
		// a discontinuous reset, not a wraparound -- but still
		// reseeds $dailySeed so day-keyed content (the witch's
		// contract board, future per-day cursors) treats the
		// reset as the start of a fresh day.
		resetToMidnight: function () {
			sv().hours = 0;
			sv().minutes = 0;
			sv().dailySeed = freshSeed();
		},
		// Sleep/wake paths advance N hours and want a "did the
		// day roll over" answer. addHours already returns it via
		// the writeHook; this thin wrapper coerces the hook's
		// return to a strict bool for legacy callers.
		sleepAdvanceHours: function (n) {
			return api.addHours(n) === true;
		}
	};

	setup.defineAccessors(api, sv, [
		// 24h rollover: wrap and reseed the per-day PRNG. The
		// inner sv().hours assignment bypasses the hook, so no
		// recursion. Returning true lets callers (sleep, addTime)
		// know the day flipped without re-reading the clock.
		{ name: 'hours', writeHook: function (oldV, newV) {
			if (newV >= 24) {
				sv().hours = newV - 24;
				sv().dailySeed = freshSeed();
				return true;
			}
			return false;
		} },
		// Minute rollover cascades into +1 hour, propagating the
		// hours hook's day-rollover signal back to the caller.
		{ name: 'minutes', writeHook: function (oldV, newV) {
			if (newV >= 60) {
				sv().minutes = newV - 60;
				return api.addHours(1);
			}
			return false;
		} },
		'meridiem',
		'dailySeed'
	]);

	return api;
})();
