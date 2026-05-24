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
	HIDDEN: 0,
	CARRYING: 1,
	SPENT: 2
});

/* Canonical tarot deck. `effect` names the widget invoked after the card
   is drawn (defined in widgetTarot.tw); draw-time dispatch in TarotCards.tw
   is a single line that wikifies <<effectName>>. Fool has no effect widget --
   its reveal-then-swap flow is handled directly by the draw logic. */
setup.tarotDeck = [
	{ name: "passion", chance: 20, image: "mechanics/cursedpossessions/tarot-cards/passion.jpg", effect: "tarotPassion" },
	{ name: "pulse", chance: 20, image: "mechanics/cursedpossessions/tarot-cards/pulse.jpg", effect: "tarotPulse" },
	{ name: "oblivion", chance: 1, image: "mechanics/cursedpossessions/tarot-cards/oblivion.jpg", effect: "tarotOblivion" },
	{ name: "knowledge", chance: 10, image: "mechanics/cursedpossessions/tarot-cards/knowledge.jpg", effect: "tarotKnowledge" },
	{ name: "power", chance: 12, image: "mechanics/cursedpossessions/tarot-cards/power.jpg", effect: "tarotPower" },
	{ name: "whore", chance: 10, image: "mechanics/cursedpossessions/tarot-cards/whore.jpg", effect: "tarotWhore" },
	{ name: "death", chance: 5, image: "mechanics/cursedpossessions/tarot-cards/death.jpg", effect: "tarotDeath" },
	{ name: "possession", chance: 1, image: "mechanics/cursedpossessions/tarot-cards/possession.jpg", effect: "tarotPossession" },
	{ name: "highpriestess", chance: 2, image: "mechanics/cursedpossessions/tarot-cards/highpriestess.jpg", effect: "tarotHighpriestess" },
	{ name: "fool", chance: 19, image: "mechanics/cursedpossessions/tarot-cards/fool.jpg" }
];

/* Weighted pick: roll once against the accumulated chances, return the
   first card whose running total covers the roll. */
setup.drawTarotCard = function (deck) {
	var total = deck.reduce(function (s, c) { return s + c.chance; }, 0);
	var roll = Math.random() * total;
	var acc = 0;
	for (var i = 0; i < deck.length; i++) {
		acc += deck[i].chance;
		if (roll < acc) return deck[i];
	}
	return deck[deck.length - 1];
};


setup.HauntedHouses = (function () {
	var sv = setup.sv;

	/* Player level at which the tarot deck enters the game: floor-plan
	   pickups stop being filtered out by isLootKindAvailable, and the
	   Witch's Blessing meta-shop perk stops pre-stamping the deck.
	   Matches the monkey paw gate (lvl 2) so both cursed-possession
	   items enter the rotation together alongside the witch's
	   cursed-item quest. */
	var TAROT_LEVEL_REQUIRED = 2;

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
		// Ghost-room drift deadline ($nextDriftAtMinute) is owned by
		// HuntController, which owns shuffleGhostRoom and the run
		// lifecycle that re-seeds it.
	]);

	var api = {
		OWNED_VARS: OWNED_VARS,

		/* Shared hunt-over tail. Commits any temp corruption the run
		   accumulated and flips $huntMode out of ACTIVE. Defaults to
		   the ENDED catch-all; pass { possessed: true } from the
		   Possessed passage to land in POSSESSED instead, which keys
		   possession-specific cleanup (tarot mark-spent, monkey paw
		   retire) via setup.Tick.applyPossessionItemCleanup. */
		endHunt: function (opts) {
			opts = opts || {};
			this.commitTempCorruption();
			var HM = setup.HuntController.HuntMode;
			setup.HuntController.setHuntMode(opts.possessed ? HM.POSSESSED : HM.ENDED);
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
			setup.Companion.runHuntFailHooks();
			setup.Companion.resetHuntState();
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
		hasClothesStolen: function () { return sv().isClothesStolen === true; },
		clearStolenClothesFlag: function () {
			sv().isClothesStolen = false;
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
		/* Used by the huntTickEventChain widget to gate random hunt
		   start by the prowl-timer window, hunt-conditions threshold,
		   and ghost canProwl check. Returns true when the chain
		   should <<goto "GhostProwlEvent">>. */
		shouldStartProwl: function () {
			if (setup.Ghosts.isProwlActivated()) return false;
			if (setup.Ghosts.elapsedTimeProwl() < setup.Ghosts.prowlTimeRemain()) return false;
			var threshold = 6 + setup.HauntConditions.snapshot().prowlChanceBonus;
			if (Math.floor(Math.random() * 101) > threshold) return false;
			var g = setup.HuntController.activeGhost();
			return !!(g && g.canProwl({ sanity: setup.Mc.sanity(), lust: setup.Mc.lust() }));
		},
		/* Used by the huntTickEventChain widget: rolls the steal chance
		   and gates on whether anything is actually stealable. Returns
		   true when the chain should <<goto "StealClothes">>. */
		shouldTriggerSteal: function () {
			/* STEAL_CHECK filter lets modifiers (Swiper) and contracts
			   bypass or scale the roll, and lets static houses opt out
			   entirely. Subscribers set forceTrigger=true to skip the
			   roll, or suppress=true to cancel the steal step outright
			   (Ironclad: runsStealClothes=false). suppress wins over
			   forceTrigger -- a house that doesn't run clothes-stealing
			   shouldn't have Swiper bypass that. The caller still gates
			   on canStealAnyItem so we never steal when nothing is
			   wearable. */
			var modifierIds = (setup.HuntController && setup.HuntController.modifiers)
				? setup.HuntController.modifiers() : [];
			var ctx = setup.Hunt.applyFilter(setup.Hunt.Event.STEAL_CHECK, {
				forceTrigger: false,
				suppress: false,
				chanceMult: 1,
				modifierIds: modifierIds
			});
			if (ctx.suppress) return false;
			if (ctx.forceTrigger) return this.canStealAnyItem();
			var roll = 1 + Math.floor(Math.random() * 100);
			if (roll > this.stealChance() * (ctx.chanceMult || 1)) return false;
			return this.canStealAnyItem();
		},

		/* Per-tick "steal-clothes already fired" flag. Same shape as
		   setup.Events.eventTriggered() — backed by State.temporary
		   so passages don't have to share a leaky `_stealClothesTriggered`
		   temp var across <<include>> boundaries. */
		stealClothesTriggered: function () { return State.temporary.stealClothesTriggered === true; },
		markStealClothesTriggered: function () { State.temporary.stealClothesTriggered = true; },
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

		markClothesStolen: function () { sv().isClothesStolen = true; },

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
		   frame of GhostProwlEvent before the player picks
		   run/hide/freeze/pray. Also opens the EMF + UVL activation
		   windows here -- a prowl disturbs the air enough for the
		   readers to pick up trail and residue, regardless of which
		   branch the player resolves into. Hunt cleanup
		   (cleanupAfterHunt -> resetTools) clears both activations
		   back to defaults at hunt end. */
		beginProwlEvent: function () {
			setup.Ghosts.activateProwl();
			setup.Ghosts.setElapsedTimeProwl(0);
			setup.activateTool("emf");
			setup.activateTool("uvl");
		},
		succubusEventTimer: function () { return setup.Home.succubusEventTimer() || 0; },
		stealChance: function () { return sv().stealChance || 0; },
		setStealChance: function (n) { sv().stealChance = n; },
		/* Per-tick recompute. Base chance is sanity + stealChanceMult
		   only; per-tick modifier scaling (Sticky Fingers, etc.) is
		   applied by the STEAL_CHECK filter at the roll site. The
		   multiplier is owned by Tick and passed in. */
		recomputeStealChance: function (mult) {
			sv().stealChance = (1 + (Math.log(101 - setup.Mc.sanity()) / Math.log(101)) * 1) * mult;
		},
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
		/* Player-level gate. The tarot deck stops appearing in
		   furniture and the Witch's Blessing meta-shop perk skips its
		   pre-stamp until the MC has reached TAROT_LEVEL_REQUIRED. */
		tarotLevelRequired: function () { return TAROT_LEVEL_REQUIRED; },
		isTarotUnlocked: function () { return setup.Mc.lvl() >= TAROT_LEVEL_REQUIRED; },
		/* True when the deck is currently retrievable from a furniture
		   slot. Combines the per-hunt stage gate (HIDDEN means the
		   deck hasn't been picked up yet this hunt) with the player-
		   level gate. FurnitureSearch + HuntController.isLootKindAvailable
		   gate on this so the highlight and the pickup stay in lockstep. */
		isTarotDiscoverable: function () {
			return this.isTarotUnlocked()
				&& this.tarotCardsStage() === setup.TarotStage.HIDDEN;
		},
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
		/* Pull & stamp a fresh tarot card from setup.tarotDeck. The
		   `cheatTarotCard` setting (if set to a card name) forces the
		   draw to that card instead of rolling -- and emits CHEAT_USED
		   so the achievement / cheated-save marker fire on consumption,
		   not just on toggle (loading a save with the picker already
		   set would otherwise sidestep it). */
		drawAndStampTarotCard: function () {
			var forced = null;
			var pick = settings.cheatTarotCard;
			if (pick && pick !== "—") {
				forced = setup.tarotDeck.filter(function (c) {
					return c.name === pick;
				})[0] || null;
				if (forced) {
					setup.StoryEvents.emit(setup.StoryEvents.Event.CHEAT_USED, { source: 'cheatTarotCard' });
				}
			}
			sv().chosenCard = forced || setup.drawTarotCard(setup.tarotDeck);
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
			if (isJeans(ro) && hasPanties(ru)) return "characters/mc/jeansp.mp4";
			if (isJeans(ro) && noPanties(ru)) return "characters/mc/jeansnp.mp4";
			if (isShorts(ro)) return "characters/mc/shorts.mp4";
			if (isSkirt(ro) && hasPanties(ru)) return "characters/mc/skirtp.mp4";
			if (isSkirt(ro) && noPanties(ru)) return "characters/mc/skirtnp.mp4";
			return null;
		},
		clearClothesStolenFlag: function () { sv().isClothesStolen = false; },
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
		{ name: 'chosenTarotCard', key: 'chosenCard', set: false },
		{ name: 'tarotCardsStage', get: false },
		{ name: 'drawnCards', get: false }
	]);
	setup.defineStageAccessors(api, sv, 'tarotCardsStage', setup.TarotStage, {
		mark: { markTarotCarrying: 'CARRYING', markTarotSpent: 'SPENT' }
	});
	return api;
})();
