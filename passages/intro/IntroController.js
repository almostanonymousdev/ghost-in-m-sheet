/*
 * Centralized helpers for the intro / character-creation flow.
 *
 * The $sensualBodyPart map is set up in :: Intro by the radio
 * buttons, lazily defaulted in PassageReady, defaulted again by
 * SaveMigration, and clamped to a max of 6 in two places. Before
 * this controller existed those constants ('brain', 'tits', ...,
 * the base of 1 and the cap of 6) lived in four files. Anything
 * that needs to seed, clamp, or enumerate the body parts now
 * reads from setup.Intro.
 */
setup.Intro = (function () {
	var BODY_PARTS         = ['brain', 'tits', 'ass', 'bottom', 'mouth', 'pussy', 'anal'];
	var BASE_SENSITIVITY   = 1;
	var MAX_SENSITIVITY    = 6;
	var CHOSEN_SENSITIVITY = 3;
	var DEFAULT_CHOICE     = 'brain';

	function defaultSensualBodyParts() {
		var out = {};
		for (var i = 0; i < BODY_PARTS.length; i++) {
			out[BODY_PARTS[i]] = BASE_SENSITIVITY;
		}
		out[DEFAULT_CHOICE] = CHOSEN_SENSITIVITY;
		return out;
	}

	function defaultSensualBodyPartChoice() {
		return DEFAULT_CHOICE;
	}

	function applyChoice() {
		// Mirror $sensualBodyPartChoice into the sensitivity map.
		// Uses max-merge so toggling the radio in Guide mid-game
		// never nerfs a part the player has already trained up.
		var sv = State.variables;
		if (!sv) return;
		var c = sv.sensualBodyPartChoice;
		if (BODY_PARTS.indexOf(c) === -1) return;
		if (!sv.sensualBodyPart || typeof sv.sensualBodyPart !== 'object') return;
		var current = Number(sv.sensualBodyPart[c]) || 0;
		if (current < CHOSEN_SENSITIVITY) {
			sv.sensualBodyPart[c] = CHOSEN_SENSITIVITY;
		}
	}

	function clampSensualBodyParts(obj) {
		if (!obj || typeof obj !== 'object') { return; }
		for (var i = 0; i < BODY_PARTS.length; i++) {
			var p = BODY_PARTS[i];
			var n = Number(obj[p]);
			if (!Number.isFinite(n)) {
				obj[p] = BASE_SENSITIVITY;
			} else if (n > MAX_SENSITIVITY) {
				obj[p] = MAX_SENSITIVITY;
			}
		}
	}

	function maximizeSensualBodyParts(obj) {
		// Cheat-menu helper (StoryCaption "Maximize body part sensitivity").
		if (!obj || typeof obj !== 'object') { return; }
		for (var i = 0; i < BODY_PARTS.length; i++) {
			obj[BODY_PARTS[i]] = MAX_SENSITIVITY;
		}
	}

	function ensureSensualBodyParts() {
		// Lazy seed for very old saves / brand-new games where
		// SaveMigration hasn't run (no save loaded yet).
		var sv = State.variables;
		if (!sv.sensualBodyPart || typeof sv.sensualBodyPart !== 'object') {
			sv.sensualBodyPart = defaultSensualBodyParts();
		}
		if (typeof sv.sensualBodyPartChoice !== 'string' ||
			BODY_PARTS.indexOf(sv.sensualBodyPartChoice) === -1) {
			sv.sensualBodyPartChoice = DEFAULT_CHOICE;
		}
	}

	// When the player toggles a body-part radio (Intro or Guide), the
	// <<radiobutton>> macro writes $sensualBodyPartChoice. We delegate
	// on the slugged input name to mirror the new choice into the
	// $sensualBodyPart sensitivity map. The delegate fires after the
	// macro's own change.macros listener because element-bound handlers
	// run before bubbled delegates.
	$(document).on(
		'change.sensualBodyPartChoice',
		'input[name="radiobutton-sensualbodypartchoice"]',
		applyChoice
	);

	return {
		BODY_PARTS:                    BODY_PARTS,
		BASE_SENSITIVITY:              BASE_SENSITIVITY,
		MAX_SENSITIVITY:               MAX_SENSITIVITY,
		CHOSEN_SENSITIVITY:            CHOSEN_SENSITIVITY,
		DEFAULT_CHOICE:                DEFAULT_CHOICE,
		defaultSensualBodyParts:       defaultSensualBodyParts,
		defaultSensualBodyPartChoice:  defaultSensualBodyPartChoice,
		clampSensualBodyParts:         clampSensualBodyParts,
		maximizeSensualBodyParts:      maximizeSensualBodyParts,
		ensureSensualBodyParts:        ensureSensualBodyParts,
		applyChoice:                   applyChoice,
		currentSensualBodyPart:        function () { return State.variables.sensualBodyPart; },
		bodyPart:                      function (part) {
			var sv = State.variables.sensualBodyPart;
			return sv ? sv[part] : 0;
		},
		adjustBodyPart:                function (part, delta) {
			var sv = State.variables.sensualBodyPart;
			if (sv) { sv[part] += delta; }
		}
	};
})();
