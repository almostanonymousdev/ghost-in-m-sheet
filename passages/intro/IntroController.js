/*
 * Shape registry for the intro / character-creation flow.
 *
 * IntroController owns the body-part vocabulary (BODY_PARTS), the
 * sensitivity tiers (BASE / MAX / CHOSEN), and the default radio
 * choice. The $sensualBodyPart map + $sensualBodyPartChoice slot
 * themselves live on $mc and are accessed through setup.Mc -- this
 * controller only defines the shape and registers the
 * commit-on-passage-leave hook.
 */
setup.Intro = (function () {
	var BODY_PARTS         = ['brain', 'tits', 'ass', 'bottom', 'mouth', 'pussy', 'anal'];
	var BASE_SENSITIVITY   = 1;
	var MAX_SENSITIVITY    = 6;
	var CHOSEN_SENSITIVITY = 3;
	var DEFAULT_CHOICE     = 'brain';
	var CHOICE_PASSAGES    = ['Intro', 'Guide'];

	function defaultSensualBodyParts() {
		var out = {};
		for (var i = 0; i < BODY_PARTS.length; i++) {
			out[BODY_PARTS[i]] = BASE_SENSITIVITY;
		}
		return out;
	}

	function defaultSensualBodyPartChoice() {
		return DEFAULT_CHOICE;
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

	function cheatMaximizeSensualBodyParts(obj) {
		// Cheat-menu helper (StoryCaption "Maximize body part sensitivity").
		// The `cheat` prefix marks this as cheat-only; see
		// tests/cheat-method-lint.spec.js for the call-site restriction.
		if (!obj || typeof obj !== 'object') { return; }
		for (var i = 0; i < BODY_PARTS.length; i++) {
			obj[BODY_PARTS[i]] = MAX_SENSITIVITY;
		}
	}

	// The chosen body part is committed when the player leaves the
	// Intro / Guide screen — picking a radio only stages the choice in
	// $sensualBodyPartChoice. This way a brand-new game shows every part
	// at the BASE_SENSITIVITY of 1 until the player actually moves on.
	$(document).on(':passagestart.sensualBodyPartChoice', function () {
		if (CHOICE_PASSAGES.indexOf(previous()) !== -1) {
			setup.Mc.commitSensualBodyPartChoice();
		}
	});

	return {
		BODY_PARTS:                    BODY_PARTS,
		BASE_SENSITIVITY:              BASE_SENSITIVITY,
		MAX_SENSITIVITY:               MAX_SENSITIVITY,
		CHOSEN_SENSITIVITY:            CHOSEN_SENSITIVITY,
		defaultSensualBodyParts:       defaultSensualBodyParts,
		defaultSensualBodyPartChoice:  defaultSensualBodyPartChoice,
		clampSensualBodyParts:         clampSensualBodyParts,
		cheatMaximizeSensualBodyParts: cheatMaximizeSensualBodyParts,
		ensureSensualBodyParts:        function () { setup.Mc.ensureSensualBodyParts(); },
		currentSensualBodyPart:        function () { return setup.Mc.sensualBodyPart(); }
	};
})();
