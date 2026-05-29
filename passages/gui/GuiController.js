/*
 * Centralized helpers for the persistent GUI overlays (Bag, Phone,
 * Notebook, Evidence, ChangeLog, etc.). The shared overlays open
 * from anywhere via the toolbar HUD and need to navigate back to
 * wherever the player came from -- but they have to use <<back>>
 * for in-event/post-contract returns and <<return>> otherwise to
 * avoid stranding the player inside an event chain. Before this
 * controller existed, every overlay re-derived that branch for
 * itself, which led to drift when new "event-like" passages were
 * added but only some overlays got patched.
 */
setup.Gui = (function () {
	var sv = setup.sv;

	/* Variables owned by this controller. Other controllers should
	   query these only through the API methods below. */
	var OWNED_VARS = Object.freeze([
		'guideReturnPassage',
		'timerToolsDecreased',
		'inputWish'
	]);

	// True when the previous passage is tagged "event" -- those should
	// resume via <<back>> through the event chain rather than jumping
	// to $return. Any passage that ought to behave that way (including
	// e.g. WitchEndContract) just needs the "event" tag in its header.
	function useBackInsteadOfReturn() {
		var prev = previous();
		if (!prev) return false;
		var tagList = tags(prev);
		return Array.isArray(tagList) && tagList.indexOf('event') !== -1;
	}

	// --- Phone contacts -----------------------------------------
	/* The three slots on the Phone passage all follow the same
	   "if unlocked, show name+lvl+exp+portrait+text-her link, else
	   show a hint + question mark" structure. The only differences
	   are the unlock predicate, the locked hint, and the hunting
	   guard (Brook also gates on the possession state). Returns
	   one descriptor per slot in stable display order. */
	function phoneContacts() {
		var s = sv();

		function meetFlag(name) { return s['meet' + name] !== undefined; }
		function huntingAlone(name) { return setup.Companion.hasFinishedSoloHunt(name); }

		return [
			{
				key:           'brook',
				stateKey:      'brook',
				portrait:      'characters/brook/brook.png',
				infoPassage:   'BrookInfo',
				lockedHint:    'Need to search in the library',
				isUnlocked:    function () { return meetFlag('Brook'); },
				isHuntingAlone: function () { return huntingAlone('Brook'); },
				canText: function () {
					return !setup.Library.brookIsPossessed()
						&& !setup.Library.brookIsWithRain();
				},
				possessedHint: 'She\'s not answering... Strange, she usually responds right away...',
				withRainHint:  'She\'s probably still with Rain. Maybe it\'s worth waiting a couple of days.',
				isPossessed:   function () { return setup.Library.brookIsPossessed(); },
				isWithRain:    function () { return setup.Library.brookIsWithRain(); }
			},
			{
				key:           'alice',
				stateKey:      'alice',
				portrait:      'characters/alice/alice.png',
				infoPassage:   'AliceInfo',
				lockedHint:    'Deliver books to the correct address',
				isUnlocked:    function () { return meetFlag('Alice'); },
				isHuntingAlone: function () { return huntingAlone('Alice'); },
				canText:       function () { return true; },
				possessedHint: '',
				withRainHint:  '',
				isPossessed:   function () { return false; },
				isWithRain:    function () { return false; }
			},
			{
				key:           'blake',
				stateKey:      'blake',
				portrait:      'characters/blake/blake.png',
				infoPassage:   'BlakeInfo',
				lockedHint:    'Befriend the assistant at the sex shop <br>(Relationship 5+)',
				isUnlocked:    function () { return (setup.Mall.blakeRelationship() || 0) >= 5; },
				isHuntingAlone: function () { return huntingAlone('Blake'); },
				canText:       function () { return true; },
				possessedHint: '',
				withRainHint:  '',
				isPossessed:   function () { return false; },
				isWithRain:    function () { return false; }
			}
		];
	}

	// --- City-map night overlay --------------------------------
	function isCityNightOverlayActive() {
		var h = setup.Time.hours();
		return h >= 22 || (h >= 0 && h <= 5);
	}

	// --- Guide return-to passage ---------------------------------
	// Guide/Evidence pages need to remember which passage opened them
	// so the Back button can jump there. Stored in $guideReturnPassage.
	function guideReturnPassage() { return sv().guideReturnPassage; }
	function setGuideReturnPassage(n) { sv().guideReturnPassage = n; }

	// --- Tool speed (based on MC lvl) ----------------------------
	// $timerToolsDecreased is the "tick" duration passed to the
	// <<repeat>> macros that drive tool meters; it shortens as the
	// player levels up. Writing here centralises the lookup so the
	// scaling table lives in one place.
	var TOOL_TIMER_BY_LVL = {
		1: "1s", 2: "900ms", 3: "800ms", 4: "650ms",
		5: "500ms", 6: "350ms", 7: "200ms"
	};
	function refreshToolTimer() {
		// Settings-dialog override (persists across save/load and history
		// navigation, unlike a one-shot cheat link). Emit CHEAT_USED on
		// consumption so loading a save with the toggle already on still
		// marks the save as cheated.
		if (settings.fastToolTimers) {
			sv().timerToolsDecreased = "10ms";
			setup.StoryEvents.emit(setup.StoryEvents.Event.CHEAT_USED, { source: 'fastToolTimers' });
			return;
		}
		var lvl = setup.Mc.lvl();
		var t = TOOL_TIMER_BY_LVL[lvl];
		sv().timerToolsDecreased = t || "150ms";
	}
	function timerToolsInitialized() {
		return sv().timerToolsDecreased !== undefined;
	}

	// --- Back/forward history controls ---------------------------
	// SugarCube's back/forward/jumpto arrows would let the player
	// rewind one-shot mutations (granted money, consumed cooldowns),
	// so #ui-bar-history is hidden by CSS unless the body carries the
	// `show-history` class. The "Show back/forward buttons" cheat in
	// the Settings dialog toggles this method which adds/removes the
	// class to match `settings.showHistoryControls`.
	function applyHistoryControlsVisibility() {
		$(document.body).toggleClass("show-history", !!settings.showHistoryControls);
	}

	// --- Mirror render -------------------------------------------
	// PassageDone re-renders the mirror image after wash/apply makeup
	// chains so the portrait stays in sync with $mc.makeupImg. The
	// "70%" width branch matches the inline style applied by Mirror.
	function mirrorMakeupImagePath() {
		switch (setup.Mc.makeupImg()) {
			case 1: return "ui/img/makeup1.jpg";
			case 2: return "ui/img/makeup2.jpg";
			case 3: return "ui/img/makeup3.jpg";
			default: return "ui/img/mc.jpg";
		}
	}
	function mirrorMakeupHasWidth() {
		var m = setup.Mc.makeupImg();
		return m >= 1 && m <= 3;
	}

	return {
		OWNED_VARS: OWNED_VARS,
		useBackInsteadOfReturn:  useBackInsteadOfReturn,
		phoneContacts:           phoneContacts,
		isCityNightOverlayActive: isCityNightOverlayActive,
		phoneBought: function () {
			return setup.Mall.phoneBought();
		},
		guideReturnPassage: guideReturnPassage,
		setGuideReturnPassage: setGuideReturnPassage,
		refreshToolTimer: refreshToolTimer,
		timerToolsInitialized: timerToolsInitialized,
		applyHistoryControlsVisibility: applyHistoryControlsVisibility,
		mirrorMakeupImagePath: mirrorMakeupImagePath,
		mirrorMakeupHasWidth: mirrorMakeupHasWidth,
		monkeyPawWishInput: function () { return sv().inputWish; }
	};
})();

/* Built-in SugarCube Settings dialog entries. Values live in the
   global `settings` namespace (persisted to localStorage), not in
   $state — so they are intentionally not in OWNED_VARS.

   Real settings (muteAllVideos) register at script load so they
   exist before the first passage tries to read them. Cheats register
   at :storyready so they can call into other controllers
   (setup.Ghosts.list, setup.Mc, etc.) that finish loading after this
   file. */
Setting.addToggle("muteAllVideos", {
	label   : "Mute all videos",
	default : false
});

/* Stateful cheats are registered through SugarCube's Setting API
   because they have a meaningful persisted value (toggle on/off,
   list selection). They live under a single "Cheats" header,
   alongside `muteAllVideos` (a real player setting). */
var SETTINGS_DIALOG_TITLE = "Settings / Cheats";

$(document).one(":storyready", function () {
	/* Rename the built-in "Settings" UIBar button so the cheats
	   menu's new home is discoverable. We can't intercept
	   L10n.get -- this SugarCube build defines it as a non-writable,
	   non-configurable closure over a private strings table -- so
	   the dialog title gets patched on the rendered DOM instead, in
	   the :dialogopened handler below. */
	$("#menu-item-settings a").text(SETTINGS_DIALOG_TITLE);

	/* Auto-stow the sidebar on phone-width viewports. SugarCube's
	   default stylesheet shrinks #story margins at <768px but keeps
	   #ui-bar at its full 17.5em width and left: 0, so the bar
	   overlays the passage and intercepts clicks. Stowing slides
	   #ui-bar to left: -15.5em; the peek at the right edge stays
	   clickable so the player can un-stow on demand.

	   Triggers: initial storyready (covers real-world page load on
	   a phone), resize (covers rotation), and :passagestart (covers
	   the worker-shared test fixture which resizes after page boot,
	   plus belt-and-suspenders if a passage rewires the sidebar).
	   Once the player explicitly toggles the bar at mobile width,
	   `_userToggledSidebar` flips and we stop fighting them. */
	var _userToggledSidebar = false;
	function autoStowSidebarIfNarrow() {
		if (_userToggledSidebar) return;
		if (window.innerWidth <= 768) {
			$("#ui-bar").addClass("stowed");
		}
	}
	autoStowSidebarIfNarrow();
	$(window).on("resize", autoStowSidebarIfNarrow);
	$(document).on(":passagestart", autoStowSidebarIfNarrow);
	$("#ui-bar-toggle").on("click", function () {
		if (window.innerWidth <= 768) _userToggledSidebar = true;
	});

	/* Notify the StoryEvents bus whenever a cheat is toggled or
	   selected. Real player settings (muteAllVideos) deliberately do
	   not call this. Subscribers (e.g. the cheat achievement) live
	   elsewhere and re-register on script re-eval.

	   SugarCube's settings dialog calls Setting.setValue(name, default)
	   the first time a control renders without a stored value, which
	   fires onChange even though the user hasn't touched anything.
	   ifCheatChanged() guards against that by remembering the value we
	   last observed and only emitting when it actually moves -- so
	   merely opening the dialog never grants the cheat achievement.

	   Toggling a cheat back to its OFF / default value also suppresses
	   the emit: a player who forgot a cheat was on from a previous
	   session and is turning it off shouldn't be charged for it. The
	   action() side-effect still runs (e.g. removing the show-history
	   class) -- only the CHEAT_USED notification is gated. */
	var _lastCheatValue = {};
	var _offCheatValue = {};
	function ifCheatChanged(source, action) {
		var current = settings[source];
		if (_lastCheatValue[source] === current) return;
		_lastCheatValue[source] = current;
		if (action) action();
		if (current === _offCheatValue[source]) return;
		setup.StoryEvents.emit(setup.StoryEvents.Event.CHEAT_USED, { source: source });
	}
	Setting.addHeader(
		"Cheats",
		"Toggles + the ghost-type picker persist across reloads. The button list further down fires one-shot mutations on $state.variables — back/forward arrows can rewind those."
	);
	/* Seed the baseline with each cheat's CURRENT value if one is
	   persisted, otherwise the registered default. The default seed
	   matters: SugarCube's first dialog-open does
	   `Setting.setValue(name, default)` for any control without a
	   stored value, which fires onChange. We want that to look like a
	   no-op against the baseline. Reading settings[X] alone returns
	   undefined here (the default hasn't been written yet), so undefined
	   would not match the about-to-be-written default and the guard
	   would mis-fire on first open. */
	function seedCheat(source, defaultValue) {
		var current = settings[source];
		_lastCheatValue[source] = (current === undefined) ? defaultValue : current;
		_offCheatValue[source] = defaultValue;
	}
	seedCheat('highlightRescueHouse', false);
	seedCheat('fastToolTimers', false);
	seedCheat('showHistoryControls', false);

	Setting.addToggle("highlightRescueHouse", {
		label: "Highlight correct rescue house on map",
		default: false,
		onChange: function () { ifCheatChanged("highlightRescueHouse"); }
	});
	Setting.addToggle("fastToolTimers", {
		label: "Remove tool timers (instant)",
		default: false,
		onChange: function () {
			ifCheatChanged("fastToolTimers", function () {
				setup.Gui.refreshToolTimer();
			});
		}
	});
	Setting.addToggle("showHistoryControls", {
		label: "Show back/forward buttons",
		default: false,
		onChange: function () {
			ifCheatChanged("showHistoryControls", setup.Gui.applyHistoryControlsVisibility);
		}
	});
	setup.Gui.applyHistoryControlsVisibility();
	/* SugarCube's Engine.play clears document.body.className on every
	   navigation, which drops the show-history class. Re-apply it on
	   each :passagestart so the buttons stay visible when the cheat is
	   on. */
	$(document).on(':passagestart', setup.Gui.applyHistoryControlsVisibility);

	/* Any click on the history arrows has to mark the save as cheated.
	   We can't wrap Engine.backward/forward directly (SugarCube defines
	   them as non-writable properties), so we delegate on the document
	   instead: SugarCube's own click handler runs first, rewinds the
	   state synchronously, and only then the event bubbles up here --
	   so markCheated() lands on the new (rewound/advanced) moment's
	   State.variables rather than the moment being discarded. */
	function emitHistoryCheat(source) {
		setup.StoryEvents.emit(setup.StoryEvents.Event.CHEAT_USED, { source: source });
	}
	$(document).on('click', '#history-backward', function () { emitHistoryCheat('historyBackward'); });
	$(document).on('click', '#history-forward',  function () { emitHistoryCheat('historyForward'); });

	var GHOST_PICKER_NULL = "—";
	seedCheat('cheatTarotCard', GHOST_PICKER_NULL);
	seedCheat('cheatGhostType', GHOST_PICKER_NULL);
	Setting.addList("cheatTarotCard", {
		label: "Force next tarot card drawn",
		list: [GHOST_PICKER_NULL].concat((setup.tarotDeck || []).map(function (c) { return c.name; })),
		default: GHOST_PICKER_NULL,
		onChange: function () { ifCheatChanged("cheatTarotCard"); }
	});
	Setting.addList("cheatGhostType", {
		label: "Force ghost type — needs active contract or hunt",
		list: [GHOST_PICKER_NULL].concat(setup.Ghosts.list().map(function (g) { return g.name; })),
		default: GHOST_PICKER_NULL,
		onChange: function () {
			ifCheatChanged("cheatGhostType", function () {
				var name = settings.cheatGhostType;
				if (name === GHOST_PICKER_NULL) return;
				if (!setup.HuntController.isAnyMode()) return;
				var ghost = setup.Ghosts.list().filter(function (g) { return g.name === name; })[0];
				if (ghost) setup.Ghosts.cheatForceHuntGhost(ghost);
			});
		}
	});
});

/* One-shot cheat buttons + lazy reveals. SugarCube's Setting API
   only exposes toggles / lists / ranges / headers — none of which
   model "press once to fire" or "click to reveal" cleanly. So we
   inject a custom buttons section into the Settings dialog body
   each time it opens. The body is rebuilt by SugarCube on every
   open, so reveal targets (ghost name, ghost room) start hidden
   and only show after the player explicitly clicks — exactly the
   "stay hidden until cheat is used" behavior we want. */
(function () {
	function isSettingsDialog() {
		var titleEl = document.getElementById("ui-dialog-title");
		if (!titleEl) return false;
		// Match either the original L10n string (set by Dialog.setup)
		// or our patched title (set on a previous :dialogopened that
		// already ran for this dialog instance).
		var t = titleEl.textContent;
		return t === SugarCube.L10n.get("settingsTitle") || t === SETTINGS_DIALOG_TITLE;
	}

	function makeButton(label, onClick, enabled) {
		var $btn = $('<button type="button" class="cheat-btn"></button>').text(label);
		if (enabled === false) {
			$btn.prop("disabled", true);
		} else {
			$btn.on("click", function (evt) {
				onClick.call(this, evt);
				setup.StoryEvents.emit(setup.StoryEvents.Event.CHEAT_USED, { source: label });
			});
		}
		return $btn;
	}

	function appendGroup($root, title, items, opts) {
		opts = opts || {};
		var enabled = opts.enabled !== false;
		var $group = $('<div class="cheat-actions-group"></div>');
		$group.append($('<h3 class="cheat-actions-gh"></h3>').text(title));
		if (!enabled && opts.disabledMsg) {
			$group.append($('<p class="cheat-actions-gh-note"></p>').text(opts.disabledMsg));
		}
		var $btns = $('<div class="cheat-actions-btns"></div>');
		items.forEach(function (item) {
			$btns.append(makeButton(item.label, item.fire, enabled));
		});
		$group.append($btns);
		$root.append($group);
	}

	function appendRevealGroup($root) {
		var inMode = setup.HuntController.isActive();
		var $group = $('<div class="cheat-actions-group"></div>');
		$group.append($('<h3 class="cheat-actions-gh"></h3>').text("Reveal (current contract / hunt)"));
		if (!inMode) {
			$group.append($('<p class="cheat-actions-gh-note"></p>').text("No active contract or hunt."));
		}

		function reveal(label, compute) {
			var $wrap = $('<div class="cheat-reveal"></div>');
			var $btn = makeButton(label, function () {
				var $result = $('<span class="cheat-reveal-result"></span>')
					.append($("<b></b>").text(label + ": "))
					.append(document.createTextNode(compute()));
				$wrap.empty().append($result);
			}, inMode);
			$wrap.append($btn);
			return $wrap;
		}

		$group.append(reveal("Ghost name", function () {
			return setup.HuntController.realGhostName();
		}));
		$group.append(reveal("Ghost room", function () {
			return setup.HuntController.ghostRoomLabel();
		}));
		$root.append($group);
	}

	function buildCheatActions() {
		var $root = $('<section class="cheat-actions"></section>');
		$root.append($('<h2 class="cheat-actions-h"></h2>').text("One-shot cheats"));
		$root.append($('<p class="cheat-actions-note"></p>').text(
			"Each click fires once."
		));

		appendGroup($root, "MC", [
			{ label: "Add lust (+100)",                fire: function () { setup.Mc.addLust(100); } },
			{ label: "Add money (+10,000)",            fire: function () { setup.Mc.addMoney(10000); } },
			{ label: "Level up (+1)",                  fire: function () { setup.Mc.addLvl(1); } },
			{ label: "Corruption (+1)",                fire: function () { setup.Mc.addCorruption(1); } },
			{ label: "Perfect body (fit = 100)",       fire: function () { setup.Mc.setFit(100); } },
			{ label: "Exhibitionism = 5",              fire: function () { setup.Mc.setExhibitionism(5); } },
			{ label: "Surrender to possession = 11",   fire: function () { setup.Mc.setPossession(11); } },
			{ label: "Maximize body part sensitivity", fire: function () { setup.Intro.cheatMaximizeSensualBodyParts(setup.Intro.currentSensualBodyPart()); } }
		]);

		appendGroup($root, "Companions", [
			{ label: "Brook → lvl 5",                  fire: function () { setup.Companion.cheatSetLvl("brook", 5); } },
			{ label: "Alice → lvl 5",                  fire: function () { setup.Companion.cheatSetLvl("alice", 5); } },
			{ label: "Blake → lvl 5",                  fire: function () { setup.Companion.cheatSetLvl("blake", 5); } },
			{ label: "Best friends with Blake (rel = 5)",   fire: function () { setup.Mall.setBlakeRelationship(5); } },
			{ label: "Companion lust (+100)",               fire: function () { setup.Companion.addLust(100); } }
		]);

		appendGroup($root, "Flashbacks", [
			{ label: "Unlock all flashback scenes", fire: function () { setup.Flashbacks.cheatUnlockAll(); } }
		]);

		appendGroup($root, "Hunting", [
			{ label: "Sanity pills (+30)",            fire: function () { setup.Mc.addSanity(30); } },
			{ label: "Drain companion sanity (-10)",  fire: function () { setup.Companion.drainSanity(10); } },
			{ label: "Trigger possession card",       fire: function () {
				var target = setup.HuntController.possessionPassage();
				Dialog.close();
				if (target) Engine.play(target);
			} }
		], { enabled: setup.HuntController.isHuntActive(), disabledMsg: "Available only during a hunt." });

		appendRevealGroup($root);
		return $root;
	}

	$(document).on(":dialogopened", function () {
		if (!isSettingsDialog()) return;
		var titleEl = document.getElementById("ui-dialog-title");
		if (titleEl) titleEl.textContent = SETTINGS_DIALOG_TITLE;
		var $body = $("#ui-dialog-body");
		if (!$body.length || $body.find(".cheat-actions").length) return;
		$body.append(buildCheatActions());
	});
})();

/* hovertip v2.0
 *
 * <<hovertip "tooltip text" [maxWidthPx]>>...<</hovertip>> — wraps the
 * payload in a span that shows a positioned tooltip on hover/focus. The
 * bubble is position:fixed so it escapes every ancestor stacking
 * context (otherwise sibling .housecard / hunt-tool-card layers with
 * their own z-index would trap the popup behind them); the positioner
 * computes viewport-relative top/left here and reflows on passage end,
 * window resize/scroll, and the sidebar-toggle click. */
window.UpdateHoverTipTxt = function (container) {
	if (Engine.isIdle()) {
		clearInterval(HTTIntervalID);
		if (container === undefined) {
			container = $(document);
		} else {
			container = $(container);
		}
		var i, id, top, left, parent, parentRect, parentCenterX,
			elementList, element, hoverPos, boxPos;
		elementList = container.find('span[id^="hoverTipTxt"]');
		for (i = 0; i < elementList.length; i++) {
			element = $(elementList[i]);
			id = elementList[i].id.substring(11);
			/* Find parent hoverTip item on the page. */
			parent = $(container).find("#hoverTip" + (id));
			parentRect = parent[0].getBoundingClientRect();
			parentCenterX = parentRect.left + parent.outerWidth() / 2;
			/* Position bottom of bubble 6px above the parent's top edge,
			   centered horizontally over the parent. Coords are
			   viewport-relative because the bubble is position:fixed. */
			top = Math.round(parentRect.top - element.outerHeight() - 6);
			left = Math.round(parentCenterX - element.outerWidth() / 2);
			/* The bubble itself escapes ancestor clipping/stacking via
			   position:fixed, but we still want to keep it visually
			   inside a dialog-like containing box when one exists, so
			   the user doesn't end up with a tooltip floating off the
			   side of the dialog. Walk up looking for an overflow-
			   clipping ancestor and clamp inside its bounding rect. */
			while (parent.parent()[0] !== document) {
				var pp = parent.parent();
				var clips =
					pp.css("overflow-x") !== "visible" ||
					pp.css("overflow-y") !== "visible" ||
					pp.css("overflow")   !== "visible";
				if (clips) {
					boxPos = pp[0].getBoundingClientRect();
					break;
				}
				parent = pp;
			}
			/* Update position. */
			element.css({ top: top, left: left });
			hoverPos = element[0].getBoundingClientRect();
			/* Make sure the text isn't outside the bottom of the screen. */
			if (hoverPos.top > window.innerHeight - hoverPos.height - 10) {
				top -= hoverPos.top - (window.innerHeight - hoverPos.height - 10);
			}
			/* Make sure the text isn't outside the top of the screen. */
			if (hoverPos.top < 4) {
				top -= hoverPos.top - 4;
			}
			/* Make sure the text isn't outside the right of the screen. */
			if (hoverPos.left > window.innerWidth - hoverPos.width - 26) {
				left -= hoverPos.left - (window.innerWidth - hoverPos.width - 26);
			}
			/* Make sure the text isn't outside the left of the screen. */
			if (hoverPos.left < 4) {
				left -= hoverPos.left - 4;
			}
			/* Update position. */
			element.css({ top: Math.round(top), left: Math.round(left) });
			hoverPos = element[0].getBoundingClientRect();
			if (boxPos) {  /* Fit within dialog boxes and the like. */
				/* Make sure the text isn't outside the bottom of the box. */
				if (hoverPos.top > boxPos.bottom - hoverPos.height - 10) {
					top -= hoverPos.top - (boxPos.bottom - hoverPos.height - 10);
				}
				/* Make sure the text isn't outside the top of the box. */
				if (hoverPos.top < boxPos.top + 4) {
					top -= hoverPos.top - (boxPos.top + 4);
				}
				/* Make sure the text isn't outside the right of the box. */
				if (hoverPos.left > boxPos.right - hoverPos.width - 26) {
					left -= hoverPos.left - (boxPos.right - hoverPos.width - 26);
				}
				/* Make sure the text isn't outside the left of the box. */
				if (hoverPos.left < boxPos.left + 4) {
					left -= hoverPos.left - boxPos.left - 4;
				}
				/* Update position. */
				element.css({ top: Math.round(top), left: Math.round(left) });
			}
			/* Keep the tail pointed at the parent icon even after the
			   screen-edge / box-edge clamps slid the bubble sideways.
			   tail-left is the bubble-local x of the parent's viewport
			   center. */
			element[0].style.setProperty("--tail-left", Math.round(parentCenterX - left) + "px");
		}
	} else {
		clearInterval(HTTIntervalID);
		HTTIntervalID = setInterval(UpdateHoverTipTxt, 300);
	}
};
/* Waits for passage to be fully rendered before doing anything. */
var HTTIntervalID = 0;
$(document).on(":passageend", function (ev) {
	UpdateHoverTipTxt();
});
$(window).on("resize scroll", function (ev) {
	clearInterval(HTTIntervalID);
	HTTIntervalID = setInterval(UpdateHoverTipTxt, 300);
});
$("#ui-bar-toggle").on("click", function (ev) {
	clearInterval(HTTIntervalID);
	HTTIntervalID = setInterval(UpdateHoverTipTxt, 300);
});

Macro.add("hovertip", {
	tags    : null,
	handler : function () {
		if (this.args.length > 0) {
			var mw = "";
			if ((this.args.length > 1) && (!isNaN(parseInt(this.args[1], 10)))) {
				mw = ' style="max-width: ' + parseInt(this.args[1], 10) + 'px;"';
			}
			if (State.temporary.HoverTipCount == undefined) {
				State.temporary.HoverTipCount = 1;
			} else {
				State.temporary.HoverTipCount++;
			}
			while ($("#hoverTip" + State.temporary.HoverTipCount).length) {
				/* Found an existing hoverTip. */
				State.temporary.HoverTipCount++;
			}
			var output = '<span id="hoverTip' + State.temporary.HoverTipCount +
					'" class="hoverTipTxt hoverTip" tabindex="0" ' +
					'onmouseenter="UpdateHoverTipTxt();">' +
					this.payload[0].contents + '<span id="hoverTipTxt' +
					State.temporary.HoverTipCount + '" class="hoverBox hoverTail"' +
					mw + '>' + this.args[0] + '</span></span>';
			$(this.output).wiki(output);
		} else {
			$(this.output).wiki(this.payload[0].contents);
		}
	}
});
