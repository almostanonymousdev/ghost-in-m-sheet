/*
 * Shadow ledger for cheat detection.
 *
 * Mirrors a small set of "critical" $variables ($mc.money,
 * $ectoplasm) every time they are written through their owning
 * controller's API. The owning controllers wire setup.Ledger.record*
 * calls into their writeHooks / mutators so every legitimate change
 * updates the mirror in lockstep with the live value.
 *
 * Audit runs per passage navigation (from setup.Tick.onPassageReady
 * -> setup.Ledger.auditAndReport), with a backup call at midnight
 * rollover (setup.Tick.resetCooldowns). The controller compares each
 * mirrored field against the live value. A mismatch means the live
 * value was changed without going through the controller API -- in
 * practice, the player edited State.variables from the browser dev
 * console. The audit emits setup.StoryEvents.Event.CHEAT_USED with
 * ctx { source: 'ledger:<field>', expected, actual } and then
 * resyncs the mirror to the live value so the next audit doesn't
 * re-fire on the same edit.
 *
 * Detection window: one passage navigation. A cheat edit between
 * two passage transitions is caught on the second passage's
 * onPassageReady, before any controller call can overwrite the
 * mirror. The earlier midnight-only cadence let a legitimate write
 * inside the same in-game day mask the cheat; per-passage closes
 * that gap to the time the player spends on a single passage
 * without using a tracked-field mutator.
 */
setup.Ledger = (function () {
	var OWNED_VARS = Object.freeze(['ledger']);

	var sv = setup.sv;

	/* Fields tracked by the ledger. Each entry:
	     field   - mirror key on $ledger
	     read    - function returning the current live value via the
	               owning controller's API (the Ledger only owns
	               $ledger; direct sv().mc.money / sv().ectoplasm
	               access would violate cross-controller ownership)
	     source  - tag emitted as ctx.source on a divergence */
	var TRACKED = [
		{
			field:  'money',
			read:   function () { return setup.Mc.money() || 0; },
			source: 'ledger:money'
		},
		{
			field:  'ectoplasm',
			read:   function () { return setup.HuntController.ectoplasm() || 0; },
			source: 'ledger:ectoplasm'
		},
		{
			field:  'sanity',
			read:   function () { return setup.Mc.sanity() || 0; },
			source: 'ledger:sanity'
		},
		{
			field:  'lust',
			read:   function () { return setup.Mc.lust() || 0; },
			source: 'ledger:lust'
		},
		{
			field:  'energy',
			read:   function () { return setup.Mc.energy() || 0; },
			source: 'ledger:energy'
		}
	];

	/* Lazy-seed the $ledger bundle from the current live values on
	   first access. New games (where initState() writes mc.money = 100
	   directly without going through the accessor) and legacy saves
	   (which never had the bundle) both get a clean snapshot of the
	   pre-tracking state, so the first audit can't false-positive on
	   the initial seed value. */
	function bundle() {
		var s = sv();
		if (!s.ledger) {
			var seed = {};
			TRACKED.forEach(function (t) { seed[t.field] = t.read(); });
			s.ledger = seed;
		}
		return s.ledger;
	}

	function recordMoney(v)     { bundle().money     = v; }
	function recordEctoplasm(v) { bundle().ectoplasm = v; }
	function recordSanity(v)    { bundle().sanity    = v; }
	function recordLust(v)      { bundle().lust      = v; }
	function recordEnergy(v)    { bundle().energy    = v; }

	function money()     { return bundle().money; }
	function ectoplasm() { return bundle().ectoplasm; }
	function sanity()    { return bundle().sanity; }
	function lust()      { return bundle().lust; }
	function energy()    { return bundle().energy; }

	/* Compare every tracked field against its live value. Returns
	   the list of divergences as [{ field, source, expected, actual }];
	   empty array when everything matches. */
	function audit() {
		var b = bundle();
		var out = [];
		for (var i = 0; i < TRACKED.length; i++) {
			var t = TRACKED[i];
			var actual = t.read();
			var expected = b[t.field];
			if (expected !== actual) {
				out.push({
					field:    t.field,
					source:   t.source,
					expected: expected,
					actual:   actual
				});
			}
		}
		return out;
	}

	/* Audit + side-effects: fire CHEAT_USED for each divergence and
	   resync the mirror to the live value so the next midnight audit
	   doesn't re-fire on the same edit. Returns the list of
	   divergences for callers / tests to inspect. */
	function auditAndReport() {
		var diffs = audit();
		if (diffs.length === 0) return diffs;
		var b = bundle();
		for (var i = 0; i < diffs.length; i++) {
			var d = diffs[i];
			setup.StoryEvents.emit(setup.StoryEvents.Event.CHEAT_USED, {
				source:   d.source,
				expected: d.expected,
				actual:   d.actual
			});
			b[d.field] = d.actual;
		}
		return diffs;
	}

	/* Force-resync every tracked field to its live value without
	   firing CHEAT_USED. Used by tests that need to park the ledger
	   in a known-good state, and by SaveMigration when seeding the
	   bundle on a legacy save. */
	function resync() {
		var b = bundle();
		TRACKED.forEach(function (t) { b[t.field] = t.read(); });
	}

	return {
		OWNED_VARS:      OWNED_VARS,
		money:           money,
		ectoplasm:       ectoplasm,
		sanity:          sanity,
		lust:            lust,
		energy:          energy,
		recordMoney:     recordMoney,
		recordEctoplasm: recordEctoplasm,
		recordSanity:    recordSanity,
		recordLust:      recordLust,
		recordEnergy:    recordEnergy,
		audit:           audit,
		auditAndReport:  auditAndReport,
		resync:          resync
	};
})();
