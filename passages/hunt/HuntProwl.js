/*
 * Per-tick prowl + steal-clothes event rolls.
 *
 * Split out of HuntController so the lifecycle file isn't carrying
 * the "should the ghost do something aggressive this tick" math.
 * Owns $stealChance (the sanity-scaled per-tick chance the ghost
 * tries to peel a piece off MC).
 *
 * Surface:
 *   stealChance() / setStealChance(n) / recomputeStealChance(baseline)
 *   shouldStartProwl()        -- gate huntTickEventChain on a fresh
 *                                GhostProwlEvent <<goto>>
 *   shouldTriggerSteal()      -- gate huntTickEventChain on a fresh
 *                                StealClothes <<goto>>
 *   stealClothesTriggered() / markStealClothesTriggered() /
 *     resetStealClothesTriggered()   -- per-tick "already fired" latch,
 *                                       backed by State.temporary so it
 *                                       doesn't leak across <<include>>
 *                                       boundaries
 *   rearmHuntTimer()          -- MC dodged a ghost event, restamp the
 *                                prowl-timer activation flag
 *   beginProwlEvent()         -- GhostProwlEvent opens, reset the prowl
 *                                window + open the EMF/UVL activation
 *                                windows
 *
 * Also owns the STEAL_CHECK darkness filter (a dark current room
 * doubles steal chance), which sat next to the steal code in
 * HuntController and follows it here.
 *
 * Each function is spliced back onto setup.HuntController at module
 * load so existing passage / test call sites keep working unchanged.
 *
 * Loads alphabetically AFTER HuntController.js (HuntC < HuntP).
 */
setup.HuntProwl = (function () {
	var OWNED_VARS = Object.freeze(['stealChance']);

	function sv() { return setup.sv(); }
	function HC() { return setup.HuntController; }

	// --- Per-tick steal chance ---------------------------------
	function stealChance() { return sv().stealChance || 0; }
	function setStealChance(n) { sv().stealChance = n; }
	/* Per-tick recompute. Base chance is sanity-driven (lower
	   sanity = higher chance, capped at 2x baseline at sanity 0)
	   then scaled by baseline (Tick's stealChanceMult). Per-tick
	   modifier scaling (Sticky Fingers, etc.) is applied by the
	   STEAL_CHECK filter at the roll site, not here. */
	function recomputeStealChance(baseline) {
		var sanity = setup.Mc.sanity();
		var sanityScale = Math.log(101 - sanity) / Math.log(101);
		sv().stealChance = (1 + sanityScale) * baseline;
	}

	// --- Random prowl trigger ----------------------------------
	/* Used by the huntTickEventChain widget to gate random hunt
	   start by the prowl-timer window, hunt-conditions threshold,
	   and ghost canProwl check. Returns true when the chain
	   should <<goto "GhostProwlEvent">>. Off-run callers get false. */
	function shouldStartProwl() {
		if (!HC().isActive()) return false;
		if (setup.Ghosts.isProwlActivated()) return false;
		if (setup.Ghosts.elapsedTimeProwl() < setup.Ghosts.prowlTimeRemain()) return false;
		var threshold = 6 + setup.HauntConditions.snapshot().prowlChanceBonus;
		if (Math.floor(Math.random() * 101) > threshold) return false;
		return setup.ActiveGhost.canProwl({ sanity: setup.Mc.sanity(), lust: setup.Mc.lust() });
	}

	// --- Random steal trigger ----------------------------------
	/* Used by the huntTickEventChain widget: rolls the steal chance
	   and gates on whether anything is actually stealable. Returns
	   true when the chain should <<goto "StealClothes">>. Off-run
	   callers get false.

	   STEAL_CHECK filter lets modifiers (Swiper) and contracts bypass
	   or scale the roll, and lets static houses opt out entirely via
	   forced modifiers. Subscribers set forceTrigger=true to skip the
	   roll, or suppress=true to cancel the steal step outright
	   (Ironclad pins no_clothes_theft via its forcedModifiers list).
	   suppress wins over forceTrigger -- a house that doesn't run
	   clothes-stealing shouldn't have Swiper bypass that. The caller
	   still gates on canStealAnyItem so we never steal when nothing
	   is wearable. */
	function shouldTriggerSteal() {
		if (!HC().isActive()) return false;
		var modifierIds = HC().modifiers();
		var ctx = setup.Hunt.applyFilter(setup.Hunt.Event.STEAL_CHECK, {
			forceTrigger: false,
			suppress: false,
			chanceMult: 1,
			modifierIds: modifierIds
		});
		if (ctx.suppress) return false;
		if (ctx.forceTrigger) return setup.Wardrobe.canStealAnyItem();
		var roll = 1 + Math.floor(Math.random() * 100);
		if (roll > stealChance() * (ctx.chanceMult || 1)) return false;
		return setup.Wardrobe.canStealAnyItem();
	}

	/* Per-tick "steal-clothes already fired" flag. Same shape as
	   setup.Events.eventTriggered() — backed by State.temporary
	   so passages don't have to share a leaky `_stealClothesTriggered`
	   temp var across <<include>> boundaries. */
	function stealClothesTriggered() { return State.temporary.stealClothesTriggered === true; }
	function markStealClothesTriggered() { State.temporary.stealClothesTriggered = true; }
	function resetStealClothesTriggered() { State.temporary.stealClothesTriggered = false; }

	/* Record that the MC just dodged a ghost event — stamps the
	   activation flag + timestamp the Hunt tick reads off when
	   deciding if enough in-game time has passed to retry. */
	function rearmHuntTimer() {
		setup.Ghosts.activateProwl();
	}

	/* Start-of-hunt-event bookkeeping: reset elapsedTimeProwl
	   window + stamp the activation time. Called by the first
	   frame of GhostProwlEvent before the player picks
	   run/hide/freeze/pray. Also opens the EMF + UVL activation
	   windows here -- a prowl disturbs the air enough for the
	   readers to pick up trail and residue, regardless of which
	   branch the player resolves into. Hunt cleanup
	   (cleanupAfterHuntFinalized -> resetTools) clears both activations
	   back to defaults at hunt end. */
	function beginProwlEvent() {
		setup.Ghosts.activateProwl();
		setup.Ghosts.setElapsedTimeProwl(0);
		setup.activateTool("emf");
		setup.activateTool("uvl");
	}

	return {
		OWNED_VARS: OWNED_VARS,
		stealChance: stealChance,
		setStealChance: setStealChance,
		recomputeStealChance: recomputeStealChance,
		shouldStartProwl: shouldStartProwl,
		shouldTriggerSteal: shouldTriggerSteal,
		stealClothesTriggered: stealClothesTriggered,
		markStealClothesTriggered: markStealClothesTriggered,
		resetStealClothesTriggered: resetStealClothesTriggered,
		rearmHuntTimer: rearmHuntTimer,
		beginProwlEvent: beginProwlEvent
	};
})();

/* Darkness filter: a dark current room doubles the steal chance.
   Stacks multiplicatively with the modifier filters (Sticky Fingers,
   etc.). The cap is the stealChance() * chanceMult comparison at the
   roll site -- if the product exceeds 100, the 1..100 roll can never
   beat it, so darkness pushes a high-sanity baseline into
   guaranteed-steal territory. */
setup.Hunt.filter(setup.Hunt.Event.STEAL_CHECK, function (ctx) {
	if (setup.HuntController.isCurrentRoomDark()) ctx.chanceMult = (ctx.chanceMult || 1) * 2;
});

/* Backwards-compat splice: existing passages and tests read these
   off setup.HuntController. */
setup.HuntController.stealChance                = setup.HuntProwl.stealChance;
setup.HuntController.setStealChance             = setup.HuntProwl.setStealChance;
setup.HuntController.recomputeStealChance       = setup.HuntProwl.recomputeStealChance;
setup.HuntController.shouldStartProwl           = setup.HuntProwl.shouldStartProwl;
setup.HuntController.shouldTriggerSteal         = setup.HuntProwl.shouldTriggerSteal;
setup.HuntController.stealClothesTriggered      = setup.HuntProwl.stealClothesTriggered;
setup.HuntController.markStealClothesTriggered  = setup.HuntProwl.markStealClothesTriggered;
setup.HuntController.resetStealClothesTriggered = setup.HuntProwl.resetStealClothesTriggered;
setup.HuntController.rearmHuntTimer             = setup.HuntProwl.rearmHuntTimer;
setup.HuntController.beginProwlEvent            = setup.HuntProwl.beginProwlEvent;
