/*
 * Dialogue rendering macros -- one source of truth for how spoken lines,
 * stage directions, interior thought, and non-verbal vocalizations are
 * marked up.
 *
 * Before this controller, every passage hand-rolled @@.mc-speech;...@@
 * blocks and decided per-line whether to add quotation marks or to
 * italicise the action embedded inside a speech block. The result (called
 * out in player feedback on the manager scene): inside one blue
 * @@.notmc-speech;@@ block the narrator's stage directions and the
 * speaker's actual words were both painted in the speaker colour, and the
 * only thing telling them apart was an <i> toggle. In a long block that is
 * a weak signal.
 *
 * The convention these macros enforce -- three orthogonal channels:
 *   WHO     -> colour          (mc = pink, npc = blue)
 *   SPOKEN  -> curly quotes + roman, in the speaker colour   <<mc>> / <<say>>
 *   ACTION  -> default narration colour, italic, no quotes   <<narration>>
 *   THOUGHT -> grey italic, no quotes                        <<thought>>
 *   VOCAL   -> speaker colour, italic, auto ~tildes~          <<vocal>>
 *
 * So quotes always mean "a mouth said this", colour always means "whose
 * mouth", and stage directions stop borrowing the speaker's colour.
 *
 * Raw @@.mc-speech;@@ / @@.notmc-speech;@@ / @@.mc-thoughts;@@ blocks keep
 * working unchanged -- these macros are the preferred way to write new
 * dialogue and the migration target for old passages.
 *
 * This controller owns no $State: dialogue markup is pure presentation.
 */
setup.Dialogue = (function () {
	// Curly quotation marks. Authors never type these -- the spoken-line
	// macros add them -- so dialogue can never collide with SugarCube's
	// '' (bold) markup and quote style stays consistent game-wide.
	var LEFT_QUOTE  = '“';
	var RIGHT_QUOTE = '”';

	// Non-verbal vocalisations (moans, gasps) get tilde "air quotes" the
	// same way speech gets curly quotes -- authors never type them, <<vocal>>
	// adds them, so the old ~tilde~ moan convention is applied automatically
	// and consistently.
	var TILDE = '~';

	// Render a container macro's body into a fresh <span> carrying `cls`,
	// optionally wrapped in curly quotes and preceded by a bold speaker
	// label. `macro` is the SugarCube macro `this`. Appends to macro.output.
	//
	// opts:
	//   quoted  -- wrap the body in curly quotes (spoken lines)
	//   tilde   -- wrap the body in ~tildes~ (non-verbal vocalisations)
	//   speaker -- string; render a bold "Name:" label in the speaker colour
	function renderLine(macro, cls, opts) {
		opts = opts || {};
		var $span = jQuery(document.createElement('span')).addClass(cls);

		if (opts.speaker) {
			jQuery(document.createElement('b'))
				.addClass('speaker-name')
				.text(opts.speaker + ':')
				.appendTo($span);
			$span.append(document.createTextNode(' '));
		}

		if (opts.quoted) {
			$span.append(document.createTextNode(LEFT_QUOTE));
		} else if (opts.tilde) {
			$span.append(document.createTextNode(TILDE));
		}

		// Render the body so inner macros / variables still work, then
		// keep it as its own span so the quotes sit cleanly around it.
		var body = String(macro.payload[0].contents).trim();
		jQuery(document.createElement('span')).wiki(body).appendTo($span);

		if (opts.quoted) {
			$span.append(document.createTextNode(RIGHT_QUOTE));
		} else if (opts.tilde) {
			$span.append(document.createTextNode(TILDE));
		}

		$span.appendTo(macro.output);
	}

	return {
		LEFT_QUOTE:  LEFT_QUOTE,
		RIGHT_QUOTE: RIGHT_QUOTE,
		TILDE:       TILDE,
		renderLine:  renderLine
	};
})();

// <<mc>> ... <</mc>> -- the MC speaks. Pink, curly-quoted.
// Pass a truthy first arg (<<mc true>>) to prefix her name as a label
// (rare; the MC is the POV character and is normally left unlabelled).
Macro.add('mc', {
	tags    : null,
	handler : function () {
		var speaker = (this.args.length > 0 && this.args[0]) ? setup.Mc.name() : null;
		setup.Dialogue.renderLine(this, 'mc-speech speech-line', {
			quoted  : true,
			speaker : speaker
		});
	}
});

// <<say "Jerry">> ... <</say>> -- an NPC speaks. Blue, curly-quoted.
// Optional first arg is the speaker's name, rendered as a bold label
// (use it on the first line of a speaker's turn; drop it on continuations).
Macro.add('say', {
	tags    : null,
	handler : function () {
		var speaker = (this.args.length > 0 && this.args[0]) ? String(this.args[0]) : null;
		setup.Dialogue.renderLine(this, 'notmc-speech speech-line', {
			quoted  : true,
			speaker : speaker
		});
	}
});

// <<narration>> ... <</narration>> -- a stage direction / action beat.
// Deliberately NOT speaker-coloured: it reads in the default passage colour,
// set apart by italics and the absence of quotes. This is what action lines
// that used to live inside a speech block become.
Macro.add('narration', {
	tags    : null,
	handler : function () {
		setup.Dialogue.renderLine(this, 'stage-dir', {});
	}
});

// <<thought>> ... <</thought>> -- MC interior monologue. Grey italic,
// no quotes (macro wrapper over the existing .mc-thoughts class).
Macro.add('thought', {
	tags    : null,
	handler : function () {
		setup.Dialogue.renderLine(this, 'mc-thoughts', {});
	}
});

// <<vocal mc>> / <<vocal npc>> ... <</vocal>> -- non-verbal vocalisation
// (a moan, gasp, whisper). Formalises the old ~tilde~ convention: keeps the
// speaker colour but italic, and auto-wraps the body in ~tildes~ so the moan
// markup is applied for you instead of being typed by hand.
Macro.add('vocal', {
	tags    : null,
	handler : function () {
		var who = (this.args.length > 0) ? String(this.args[0]).toLowerCase() : 'mc';
		var colour = (who === 'npc') ? 'notmc-speech' : 'mc-speech';
		setup.Dialogue.renderLine(this, colour + ' vocal', { tilde: true });
	}
});
