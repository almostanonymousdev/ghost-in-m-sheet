/*
 * Centralized state queries and mutations for the haunted-houses
 * subsystem: clothing state, stolen-clothes tracking, hunt-condition
 * helpers, and shared hunt-end cleanup. Passages call into
 * setup.HauntedHouses instead of inlining the underlying checks.
 *
 * Hunts are the only mode that exercises these helpers now --
 * the classic witch-contract flow and the per-house catalogue have
 * been removed.
 */
/* Lifecycle of $tarotCardsStage. HIDDEN: deck still in furniture,
   FurnitureSearch can pick it up. CARRYING: player holds the deck and
   can draw cards. SPENT: every card drawn this hunt; deck is done. */
setup.TarotStage = Object.freeze({
	HIDDEN:    0,
	CARRYING:  1,
	SPENT:     2
});

setup.HauntedHouses = (function () {
	function sv() { return State.variables; }

	/* Variables owned by this controller. Other controllers should
	   query these only through the API methods below. */
	var OWNED_VARS = Object.freeze([
		'isClothesStolen',
		// Hunt-conditions flags driven by HuntConditionsController
		// (bait spend, overcharged-tools toggle, bait countdown,
		// pending bait orgasm trigger).
		'baitActive', 'baitStepsRemain', 'baitOrgasmPending', 'overchargedTools',
		'chosenCard', 'drawnCards', 'tarotCardsStage',
		'cursedItemVide',
		'stealChance'
		// Per-room state objects ($kitchen, $BlockACellA, ...) are
		// owned by setup.Rooms (see RoomsController.js) -- access them
		// through setup.Rooms.byId() rather than reaching into State
		// directly.
		//
		// Ghost-room shuffle interval gates ($currentIntervalRoom,
		// $lastChangeIntervalRoom) are owned by HuntController, which
		// owns shuffleGhostRoom and the run lifecycle that resets them.
	]);

	var api = {
		OWNED_VARS: OWNED_VARS,

		endHunt: function () {
			this.commitTempCorruption();
			setup.Ghosts.setHuntMode(setup.Ghosts.HuntMode.POSSESSED);
		},

		/* Common end-of-hunt cleanup shared by the hunt lifecycle and
		   the shared hunt-over passages. Bundles the four-call
		   boilerplate every hunt-over beat was inlining. Does NOT call
		   endHunt() -- callers vary in whether endHunt should fire at
		   passage load or only when the ghost-catch branch resolves.
		   Pass { loseStolen: true } to nuke any stolen-clothing flags. */
		cleanupAfterHunt: function (opts) {
			opts = opts || {};
			this.resetToolTimers();
			setup.Companion.clearBlakeCursedItem();
			setup.Companion.resetHuntState();
			setup.Companion.resetAliceWorkIfNeeded();
			if (opts.loseStolen) setup.Wardrobe.loseAllStolen();
			setup.Wardrobe.redressAfterHunt();
		},

		// --- Clothing aggregation -------------------------------
		hasBottomWorn: function () {
			return setup.Wardrobe.worn(setup.WardrobeSlot.JEANS)
				|| setup.Wardrobe.worn(setup.WardrobeSlot.SKIRT)
				|| setup.Wardrobe.worn(setup.WardrobeSlot.SHORTS);
		},
		hasTopWorn: function () { return setup.Wardrobe.worn(setup.WardrobeSlot.TSHIRT); },
		isFullyDressed: function () {
			return this.hasTopWorn() && this.hasBottomWorn();
		},
		isFullyNude: function () {
			return !setup.Wardrobe.worn(setup.WardrobeSlot.TSHIRT)
				&& !setup.Wardrobe.worn(setup.WardrobeSlot.PANTIES)
				&& !this.hasBottomWorn();
		},
		isTopless: function () {
			return !setup.Wardrobe.worn(setup.WardrobeSlot.TSHIRT) && this.hasBottomWorn();
		},

		// --- Stolen clothes -------------------------------------
		hasClothesStolen: function () { return sv().isClothesStolen === 1; },
		clearStolenClothesFlag: function () {
			sv().isClothesStolen = 0;
		},

		// --- Timed tool activations -----------------------------
		resetToolTimers: function () {
			setup.resetTools();
			if (setup.HauntConditions && setup.HauntConditions.resetHuntFlags) {
				setup.HauntConditions.resetHuntFlags();
			}
		},

		// --- Corruption accumulator used at hunt end ------------
		// (delegates to setup.Mc, which owns $tempCorr)
		addTempCorruption: function (amount) {
			setup.Mc.setTempCorr((setup.Mc.tempCorr() || 0) + amount);
		},
		tempCorruption: function () { return setup.Mc.tempCorr() || 0; },
		commitTempCorruption: function () {
			var amount = Math.min(1, setup.Mc.tempCorr() || 0);
			setup.Mc.setTempCorr(amount);
			setup.Mc.addCorruption(amount);
			setup.Mc.setTempCorr(0);
			return amount;
		},

		// --- Hunt triggers --------------------------------------
		canStartRandomProwl: function () {
			return !setup.Ghosts.isProwlActivated()
				&& setup.Ghosts.elapsedTimeProwl() >= setup.Ghosts.prowlTimeRemain();
		},
		/* :: CheckHuntStart entry: gates random hunt start by the
		   hunt-conditions threshold + ghost canProwl check. Returns
		   true when the passage should <<goto "GhostHuntEvent">>. */
		shouldStartRandomProwl: function () {
			if (!this.canStartRandomProwl()) return false;
			var threshold = 6 + setup.HauntConditions.snapshot().prowlChanceBonus;
			if (Math.floor(Math.random() * 101) > threshold) return false;
			var g = setup.Ghosts.active();
			return !!(g && g.canProwl(setup.Mc.mc()));
		},
		/* :: StealClothesEvent entry: rolls the steal chance and gates
		   on whether anything is actually stealable. Returns true when
		   the passage should <<goto "StealClothes">>. */
		shouldTriggerSteal: function () {
			/* Swiper modifier bypasses the roll entirely: every tick
			   with something stealable triggers a steal. */
			if (setup.HuntController && setup.HuntController.hasModifier
				&& setup.HuntController.hasModifier(setup.Modifiers.SWIPER)) {
				return this.canStealAnyItem();
			}
			var roll = 1 + Math.floor(Math.random() * 100);
			if (roll > this.stealChance()) return false;
			return this.canStealAnyItem();
		},

		/* Per-tick "steal-clothes already fired" flag. Same shape as
		   setup.Events.eventTriggered() — backed by State.temporary
		   so passages don't have to share a leaky `_stealClothesTriggered`
		   temp var across <<include>> boundaries. */
		stealClothesTriggered:      function () { return State.temporary.stealClothesTriggered === true; },
		markStealClothesTriggered:  function () { State.temporary.stealClothesTriggered = true; },
		resetStealClothesTriggered: function () { State.temporary.stealClothesTriggered = false; },

		// --- NudityEvent branch helpers -------------------------
		nudityNakedNoBottoms: function () {
			return !setup.Wardrobe.worn(setup.WardrobeSlot.TSHIRT)
				&& !setup.Wardrobe.worn(setup.WardrobeSlot.PANTIES)
				&& !this.hasBottomWorn();
		},
		nudityToplessWithPanties: function () {
			return !setup.Wardrobe.worn(setup.WardrobeSlot.TSHIRT)
				&& setup.Wardrobe.worn(setup.WardrobeSlot.PANTIES)
				&& !this.hasBottomWorn();
		},

		markClothesStolen: function () { sv().isClothesStolen = 1; },

		// --- Which static hunt house is active? --------------------
		// Resolves against the hunt's staticHouseId so legacy
		// callers ("which house art / video list?") keep working
		// without threading the id through. Returns false when no
		// hunt is in flight or the run is procedural (no
		// staticHouseId).
		isOwaissa: function () {
			return setup.HuntController && setup.HuntController.staticHouseId
				&& setup.HuntController.staticHouseId() === 'owaissa';
		},
		isElm: function () {
			return setup.HuntController && setup.HuntController.staticHouseId
				&& setup.HuntController.staticHouseId() === 'elm';
		},
		isIronclad: function () {
			return setup.HuntController && setup.HuntController.staticHouseId
				&& setup.HuntController.staticHouseId() === 'ironclad';
		},

		/* Record that the MC just dodged a ghost event — stamps the
		   activation flag + timestamp the Hunt tick reads off when
		   deciding if enough in-game time has passed to retry. */
		rearmHuntTimer: function () {
			setup.Ghosts.activateProwl();
		},
		/* Start-of-hunt-event bookkeeping: reset elapsedTimeProwl
		   window + stamp the activation time. Called by the first
		   frame of GhostHuntEvent before the player picks
		   run/hide/freeze/pray. */
		beginProwlEvent: function () {
			setup.Ghosts.activateProwl();
			setup.Ghosts.setElapsedTimeProwl(0);
		},
		succubusEventTimer: function () { return setup.Home.succubusEventTimer() || 0; },
		stealChance: function () { return sv().stealChance || 0; },
		canStealAnyItem: function () {
			return setup.Wardrobe.worn(setup.WardrobeSlot.BRA) || setup.Wardrobe.worn(setup.WardrobeSlot.PANTIES) || this.hasBottomWorn();
		},
		hasAnyGarmentWorn: function () {
			return this.hasBottomWorn() || this.hasTopWorn()
				|| setup.Wardrobe.worn(setup.WardrobeSlot.PANTIES) || setup.Wardrobe.worn(setup.WardrobeSlot.BRA);
		},

		/* Handed-by-companion cursed item: marks gotCursedItem and
		   rolls one of the four item types. */
		rollCompanionCursedItem: function () {
			setup.Witch.setCursedItemHeld();
			var flags = ["isCIDildo", "isCIButtplug", "isCIBeads", "isCIHDildo"];
			setup.Witch.setCursedItemFlag(flags[Math.floor(Math.random() * flags.length)]);
		},
		// `|| 0` / `|| HIDDEN` getters stay inline — fallback is
		// load-bearing (callers compare with eq/lt and do arithmetic
		// on fresh saves where the field is undefined).
		tarotCardsStage: function () { return sv().tarotCardsStage || setup.TarotStage.HIDDEN; },
		drawnCards: function () { return sv().drawnCards || 0; },
		shouldDeleteOneEvidence: function () {
			return setup.Ghosts.scheduledDeletionCount() >= 1;
		},
		/* Reset the cursed-item carry/use state shared across runs:
		   tarot deck stage + draw count + drawn-card stamp, and the
		   monkey-paw lifecycle (wishes count, found stage, learned
		   knowledge, door lock, banned houses). The Notebook's
		   crossed-out-evidence overlay also resets so the
		   knowledge wish / tarot draw doesn't leak between hunts.
		   Called from the hunt lifecycle start/end so a fresh hunt
		   always starts with a fresh deck and an unfound paw. */
		resetCursedItemState: function () {
			var s = sv();
			s.tarotCardsStage = setup.TarotStage.HIDDEN;
			s.drawnCards = 0;
			delete s.chosenCard;
			setup.Ghosts.clearChosenEvidence();
			setup.MonkeyPaw.resetHunt();
		},
		incrementDrawnCards: function () {
			sv().drawnCards = (sv().drawnCards || 0) + 1;
		},
		/* Pull & stamp a fresh tarot card from setup.tarotDeck. */
		drawAndStampTarotCard: function () {
			sv().chosenCard = setup.drawTarotCard(setup.tarotDeck);
			return sv().chosenCard;
		},
		crucifixAmount: function () { return setup.ToolController.crucifixAmount() || 0; },
		addCrucifix: function (n) {
			for (var i = 0; i < (n || 1); i++) setup.ToolController.addCrucifix();
		},
		/* Random cursed-item usage video for the active item variant.
		   Top-covered dildo has a longer gallery; the others share
		   their own fixed set. */
		cursedItemVideo: function () {
			var t = setup.Witch.carriedCursedItemType();
			var list;
			if (t === 'dildo') {
				list = setup.Wardrobe.worn(setup.WardrobeSlot.TSHIRT)
					? ["mechanics/curseditems/1.0.mp4", "mechanics/curseditems/1.1.mp4", "mechanics/curseditems/1.2.mp4", "mechanics/curseditems/1.3.mp4"]
					: ["mechanics/curseditems/1.0.mp4", "mechanics/curseditems/1.1.mp4"];
			} else if (t === 'buttplug') {
				list = ["mechanics/curseditems/2.0.mp4", "mechanics/curseditems/2.1.mp4", "mechanics/curseditems/2.2.mp4", "mechanics/curseditems/2.3.mp4"];
			} else if (t === 'beads') {
				list = ["mechanics/curseditems/3.0.mp4", "mechanics/curseditems/3.1.mp4", "mechanics/curseditems/3.2.mp4", "mechanics/curseditems/3.3.mp4"];
			} else if (t === 'hdildo') {
				list = ["mechanics/curseditems/4.0.mp4", "mechanics/curseditems/4.1.mp4", "mechanics/curseditems/4.2.mp4"];
			} else {
				return null;
			}
			var pick = list[Math.floor(Math.random() * list.length)];
			sv().cursedItemVide = pick;
			return pick;
		},

		// --- Clothes steal / find -----------------------------
		/* Given the MC's current clothing state, return the list of
		   garment categories that are still available to steal
		   ("panties", "bra", "outerwear"). Used by StealClothes to
		   pick a random target. */
		availableStealTargets: function () {
			var opts = [];
			if (setup.Wardrobe.worn(setup.WardrobeSlot.PANTIES)) opts.push('panties');
			if (setup.Wardrobe.worn(setup.WardrobeSlot.BRA)) opts.push('bra');
			if (setup.Wardrobe.worn(setup.WardrobeSlot.TSHIRT) || setup.Wardrobe.worn(setup.WardrobeSlot.JEANS)
				|| setup.Wardrobe.worn(setup.WardrobeSlot.SKIRT) || setup.Wardrobe.worn(setup.WardrobeSlot.SHORTS)) {
				opts.push('outerwear');
			}
			return opts;
		},
		/* Which dress-up video to show while the MC puts clothes
		   back on. Reads the current "no<key>" remember tokens to
		   figure out which bottom / underwear combo was stolen.
		   Returns a video path or null. */
		findStolenDressupVideo: function () {
			var ro = setup.Wardrobe.rememberBottomOuter();
			var ru = setup.Wardrobe.rememberBottomUnder();
			function isJeans(k) { return typeof k === "string" && k.indexOf("nojeans") === 0; }
			function isShorts(k) { return typeof k === "string" && k.indexOf("noshorts") === 0; }
			function isSkirt(k) { return typeof k === "string" && k.indexOf("noskirt") === 0; }
			function hasPanties(k) { return typeof k === "string" && k.indexOf("panties") === 0; }
			function noPanties(k) { return typeof k === "string" && k.indexOf("nopanties") === 0; }
			if (isJeans(ro) && hasPanties(ru))  return "characters/mc/jeansp.mp4";
			if (isJeans(ro) && noPanties(ru))   return "characters/mc/jeansnp.mp4";
			if (isShorts(ro))                   return "characters/mc/shorts.mp4";
			if (isSkirt(ro) && hasPanties(ru))  return "characters/mc/skirtp.mp4";
			if (isSkirt(ro) && noPanties(ru))   return "characters/mc/skirtnp.mp4";
			return null;
		},
		clearClothesStolenFlag: function () { sv().isClothesStolen = 0; },
		isBottomless: function () {
			return !setup.Wardrobe.worn(setup.WardrobeSlot.JEANS) && !setup.Wardrobe.worn(setup.WardrobeSlot.SHORTS)
				&& !setup.Wardrobe.worn(setup.WardrobeSlot.SKIRT) && !setup.Wardrobe.worn(setup.WardrobeSlot.PANTIES);
		},
		isTopBare: function () {
			return !setup.Wardrobe.worn(setup.WardrobeSlot.TSHIRT) && !setup.Wardrobe.worn(setup.WardrobeSlot.BRA);
		}
	};

	// Pure $variable passthrough accessors. tarotCardsStage / drawnCards
	// keep their inline getters above (the `||` fallback is load-bearing);
	// only the bare setters fold here.
	setup.defineAccessors(api, sv, [
		{ name: 'chosenTarotCard',  key: 'chosenCard', set: false },
		{ name: 'tarotCardsStage',  get: false },
		{ name: 'drawnCards',       get: false }
	]);
	setup.defineStageAccessors(api, sv, 'tarotCardsStage', setup.TarotStage, {
		mark: { markTarotCarrying: 'CARRYING', markTarotSpent: 'SPENT' }
	});
	return api;
})();
