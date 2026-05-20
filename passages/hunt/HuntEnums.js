/*
 * Hunt lifecycle enums.
 *
 * Outcome / FailureReason / Objective constants are pure data --
 * the values are the on-disk strings stamped into $run, so saves and
 * tests work against them transparently. Hoisted out of HuntController
 * so they're discoverable on their own and can be referenced without
 * scrolling past the lifecycle implementation.
 *
 * Loads alphabetically AFTER HuntController.js (HuntC < HuntE). All
 * HuntController function bodies look these up at call time via
 * setup.HuntEnums.X.Y -- by the time any function fires, every
 * controller has been evaluated. This file also splices the enums
 * onto setup.HuntController for backwards compat with the existing
 * `setup.HuntController.Outcome.SUCCESS`-style call sites.
 */
setup.HuntEnums = (function () {
	var Outcome = Object.freeze({
		SUCCESS: 'success',
		FAILURE: 'failure'
	});

	var FailureReason = Object.freeze({
		SANITY:     'sanity',
		EXHAUSTION: 'exhaustion',
		TIME:       'time',
		CAUGHT:     'caught',
		ABANDON:    'abandon',
		POSSESSED:  'possessed',
		FLED:       'fled',
		WRONG_CALL: 'wrong_call'
	});

	/* Run-objective catalogue. Each entry carries an `id` (the string
	   stamped onto $run.objective and on-disk saves) and a
	   `description` shown to the player when the run starts. */
	var Objective = Object.freeze({
		IDENTIFY: Object.freeze({
			id: 'identify',
			description: 'Identify the ghost then banish it from the house. Chanting its name will keep you safe.'
		}),
		RESCUE: Object.freeze({
			id: 'rescue',
			description: ''
		})
	});

	function objectiveDescription(id) {
		var keys = Object.keys(Objective);
		for (var i = 0; i < keys.length; i++) {
			if (Objective[keys[i]].id === id) return Objective[keys[i]].description;
		}
		return '';
	}

	return {
		Outcome: Outcome,
		FailureReason: FailureReason,
		Objective: Objective,
		objectiveDescription: objectiveDescription
	};
})();

/* Backwards-compat splice: existing call sites read these off
   setup.HuntController. Keep the references live so a future enum
   bump only needs to edit this file. */
setup.HuntController.Outcome              = setup.HuntEnums.Outcome;
setup.HuntController.FailureReason        = setup.HuntEnums.FailureReason;
setup.HuntController.Objective            = setup.HuntEnums.Objective;
setup.HuntController.objectiveDescription = setup.HuntEnums.objectiveDescription;
