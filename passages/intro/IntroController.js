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
	/* Passages that make up the intro/help flow. Picking a radio in
	   Intro only stages the choice; commit fires once the player
	   actually exits this flow into gameplay. The Intro passage links
	   directly to Evidence (the "Player guide"), so a check that only
	   inspected previous() would mis-fire the commit on that detour
	   and lock brain at CHOSEN_SENSITIVITY regardless of pick. */
	var FLOW_PASSAGES      = ['Intro', 'Guide', 'Evidence'];

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
	// intro/help flow into gameplay — picking a radio only stages the
	// choice in $sensualBodyPartChoice. This way a brand-new game
	// shows every part at the BASE_SENSITIVITY of 1 until the player
	// actually moves on. Navigating between flow passages (Intro →
	// Evidence, Guide ↔ Evidence) does NOT commit; the staged choice
	// can still be changed until the player advances into the game.
	$(document).on(':passagestart.sensualBodyPartChoice', function () {
		var fromFlow = FLOW_PASSAGES.indexOf(previous()) !== -1;
		var toFlow   = FLOW_PASSAGES.indexOf(passage())  !== -1;
		if (fromFlow && !toFlow) {
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
