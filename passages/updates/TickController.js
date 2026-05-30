/*
 * Per-tick maintenance helpers. onPassageReady runs from the
 * :passagestart event handler at the bottom of this file; onPassageDone
 * is still wired through :: PassageDone (it does DOM-render work that
 * has to happen inline with the passage render). These run on every
 * passage transition, so the goal is "cheap predicates + small
 * idempotent state nudges". One-shot save migrations live in
 * :: Migrations; load-time defaulting lives in :: SaveMigration.
 */
setup.Tick = (function () {
	var OWNED_VARS = Object.freeze([
		'stealChanceMult',
		'stepCount'
	]);

	var sv = setup.sv;


	// --- Delegating wrappers -------------------------------------
	/* Per-tick maintenance for state owned by other controllers.
	   Tick keeps a thin wrapper so the orchestration call sites
	   (onPassageDone, tests) read as a flat tick pipeline. */
	function tickRescueQuestExpiry() { setup.MissingWomen.tickQuestExpiry(); }
	function tickProwlTimer() { setup.Ghosts.tickProwlTimer(); }

	// --- Choker lust floor ---------------------------------------
	/* The collar/choker keeps lust at >=15 while worn. Returns true
	   if it pushed lust up so callers can refresh the meter. */
	function applyChokerLustFloor() {
		var s = sv();
		if (s.neckChokerState1 !== setup.ClothingState.WORN) return false;
		if (!s.mc || s.mc.lust > 15) return false;
		setup.Mc.setLust(15);
		return true;
	}

	// --- Possession / tarot cleanup ------------------------------
	/* mark the tarot deck spent and retire the monkey paw, since
	the MC drops her cursed items when the ghost takes her body.
	Graceful hunt-end paths leave the deck/paw in whatever state
	resetCursedItemState() restored them to.*/
	function applyPossessionItemCleanup() {
		if (setup.HuntController.isPossessed()) {
			setup.Tarot.markTarotSpent();
			setup.MonkeyPaw.retire();
		}
	}

	// --- Companion leave check -----------------------------------
	/* Returns true when the player just finished an MC-only event with
	   a companion on Plan1 whose sanity has fallen below their level
	   floor; PassageDone routes those cases to CompanionLeaving. */
	function justFinishedSharedEvent() {
		var s = sv();
		return previous() === 'EventMC'
			&& s.chosenPlan === 'Plan1'
			&& s.isCompChosen === true;
	}
	function activeCompanionShouldLeaveAfterEvent() {
		if (!justFinishedSharedEvent()) return false;
		return setup.Companion.activeCompanionShouldLeave();
	}

	// --- Companion attack timer (PassageReady top block) --------
	function companionAttackActiveHit() {
		var s = sv();
		var CS = setup.CompanionShow;
		return s.chosenPlanActivated === 1 &&
			((s.hours * 60 + s.minutes) >= s.chosenPlanActivatedTime) &&
			s.showComp !== CS.ATTACK_FAILED && s.showComp !== CS.ATTACK_SAFE;
	}
	/* Single mission roll: at plan-timer elapse, decide the entire
	   outcome once against the *displayed* plan chance (chanceToSuccess,
	   stamped by Companion.setHuntPlan from the Plan2/3/4 link). Success
	   → companion returns safely with the prize; failure → companion
	   ambushed and the MC has to track them down. Downstream passages
	   (CompanionSucceeded, isCompanionContinue widget) read this single
	   outcome via showComp and do NOT roll again, so the player's stated
	   "X %" chance equals their observed success rate. The old model
	   rolled chanceToAttack here and then chanceToSuccess downstream,
	   compounding into a much lower effective success rate. */
	function resolveCompanionAttack() {
		var outcome = setup.Companion.resolveHuntAttack();
		if (outcome === 'hit') resetStepCount();
		return outcome;
	}
	function atRandomGhostPassage() {
		var target = sv().randomGhostPassage;
		if (!target || !setup.HuntController) return false;
		if (passage() !== "HuntRun") return false;
		return setup.HuntController.currentRoomId() === target;
	}

	// --- Steal-chance recompute ---------------------------------
	function recomputeStealChance() {
		setup.HuntController.recomputeStealChance(sv().stealChanceMult);
	}

	// --- PassageDone tick setup ---------------------------------
	function initTick() {
		sv().stealChanceMult = 1.1;
	}

	// --- Twins event guard --------------------------------------
	function twinsEventFired() { return sv().twinsEventActive === true; }

	// --- Step counter -------------------------------------------
	function stepCount() { return sv().stepCount || 0; }
	function incrementStepCount() {
		sv().stepCount = (sv().stepCount || 0) + 1;
	}
	function resetStepCount() { sv().stepCount = 0; }

	// --- Midnight rollover (resetCooldowns helper) --------------
	/* Called once per day-change (via addTime crossing 24). Resets
	   per-day cooldowns and ticks several multi-day counters. The
	   binary day-zero list lives in the setup.Cooldowns registry —
	   each owning controller registers its CDs at module load, so
	   adding a new daily cooldown is one registerDaily() line in the
	   owning controller (not a fan-out edit here). */
	function resetCooldowns() {
		/* Shadow-ledger audit at midnight is the belt-and-braces backup
		   for the per-passage audit in onPassageReady. Per-passage is
		   the primary detector (one-navigation window); this catches
		   anything that slipped past it on a long-AFK day. */
		setup.Ledger.auditAndReport();

		setup.Cooldowns.resetDaily();
		setup.Home.tickHomeMidnight();
		setup.Companion.advanceSoloHuntsAtMidnight();
		setup.SpecialEvent.tickMareStageMidnight();
		setup.MissingWomen.tickRescueClockMidnight();
	}

	/* :passagestart lifecycle hook. Bundles the per-tick setup that
	   used to live as a long stack of <<run>> calls in the PassageReady
	   passage. Returns a passage name for the caller to Engine.play(),
	   or null.

	   Note: redirects out of HuntRun (CompanionEvent, HuntOverTime, ...)
	   are issued from onPassageDone via PassageDone.tw's <<goto>>, not
	   from here. A direct Engine.play() at :passagestart races the outer
	   enginePlay -- the outer continues rendering after our handler
	   returns and overwrites the inner passage's DOM swap, so the
	   player visually stays on HuntRun even though State.passage flipped.
	   <<goto>> defers via setTimeout(Engine.DOM_DELAY) and avoids that. */
	function onPassageReady() {
		/* Shadow-ledger audit runs first, before any migration / ensure
		   call has a chance to touch a tracked field. Catches console
		   edits made between the previous passage and this one; with
		   this hook the cheat-detection window is one passage navigation
		   rather than one in-game day. */
		setup.Ledger.auditAndReport();

		if (setup.HuntController.isHunting()
			&& companionAttackActiveHit()
			&& resolveCompanionAttack() === "hit") {
			setup.Companion.pickRandomCompanionRoomFromContext();
		}

		/* Self-heal: if the companion is "missing" (showComp = ATTACK_FAILED)
		   but the per-tick handoff lost the room (initial pick failed, save
		   carries a stale integer index, room id not in this floor plan),
		   pick now so atRandomGhostPassage has something to match against
		   when the MC walks into a room. */
		if (setup.HuntController.isHunting()
			&& setup.Companion.hasLostCompanionRoom()) {
			setup.Companion.pickRandomCompanionRoomFromContext();
		}

		setup.Gui.refreshToolTimer();
		recomputeStealChance();

		// SaveMigration already ran these defaults on load, but
		// running them here picks up brand-new variables introduced
		// mid-save without a reload.
		if (setup.applySaveDefaults) setup.applySaveDefaults(State.variables);

		setup.Migrations.ensureZeroDefaults();
		setup.Migrations.seedTornStyles();
		applyPossessionItemCleanup();
		setup.Migrations.ensureMcFit();
		setup.Intro.ensureSensualBodyParts();
		setup.Intro.clampSensualBodyParts(setup.Intro.currentSensualBodyPart());
		setup.Migrations.ensurePSprayInventory();
		setup.Migrations.applyPiercingSensitivityPatch();
		setup.Migrations.ensureSuccubusCooldown();
		setup.Migrations.ensureCursedItemCooldown();
		setup.Migrations.ensureRoomTemplates();
		return null;
	}

	/* :: PassageDone lifecycle hook (logic-only portion). Bundles all
	   the <<run>> calls and one-shot migration includes. The DOM
	   widget calls (<<applyRoomLightClass>>, <<replace>>, addclass,
	   updatemeter, etc.) stay in the passage because they're rendering
	   ops; this function returns a string when a <<goto>> should fire.
	   Bool flags returned drive in-passage <<replace>> blocks. */
	function onPassageDone() {
		setup.Wardrobe.refreshAggregateStates();

		if (setup.Ghosts.isMimicHunt() && setup.HuntController.isHunting()) {
			setup.Posession.rollMimicType(
				setup.Ghosts.names({ exclude: ["Mimic"] })
			);
		}

		setup.HuntController.shuffleGhostRoom();

		if (setup.Time.isMorningPlus() && setup.HuntController.isHunting()) {
			return { goto: "HuntOverTime" };
		}

		/* Companion-found redirect. Issued from PassageDone (not
		   PassageReady) so PassageDone.tw's <<goto>> defers the
		   Engine.play via setTimeout(Engine.DOM_DELAY). Running
		   Engine.play synchronously from :passagestart races the
		   outer enginePlay -- the outer continues rendering and
		   overwrites the inner's DOM swap, leaving the player
		   visually on HuntRun even though State.passage flipped. */
		if (atRandomGhostPassage()) {
			return { goto: "CompanionEvent" };
		}

		if (!setup.Migrations.update22Applied()) {
			setup.Migrations.migrateRoomsAndProwlTimer();
		}
		if (!setup.Migrations.update0909Applied()) {
			setup.Migrations.migrateDeliveryAndCompanionReset();
		}
		if (!setup.Migrations.update2707Applied()) {
			setup.Migrations.migrateStockingsFootBought();
		}

		setup.Companion.tickAllCompanionProgression();

		if (activeCompanionShouldLeaveAfterEvent()) {
			return { goto: "CompanionLeaving" };
		}

		setup.Migrations.ensureUnderwearMemory();
		initTick();

		tickProwlTimer();
		tickRescueQuestExpiry();
		setup.Migrations.migrateCompanionPlanTimes();
		setup.Mc.ensurePossession();

		var lustChanged = applyChokerLustFloor();
		if (!setup.Gui.timerToolsInitialized()) {
			setup.Gui.refreshToolTimer();
		}
		return { lustChanged: !!lustChanged };
	}

	return {
		OWNED_VARS: OWNED_VARS,
		tickRescueQuestExpiry: tickRescueQuestExpiry,
		tickProwlTimer: tickProwlTimer,
		applyChokerLustFloor: applyChokerLustFloor,
		applyPossessionItemCleanup: applyPossessionItemCleanup,
		activeCompanionShouldLeaveAfterEvent: activeCompanionShouldLeaveAfterEvent,
		companionAttackActiveHit: companionAttackActiveHit,
		resolveCompanionAttack: resolveCompanionAttack,
		atRandomGhostPassage: atRandomGhostPassage,
		recomputeStealChance: recomputeStealChance,
		initTick: initTick,
		twinsEventFired: twinsEventFired,
		stepCount: stepCount,
		incrementStepCount: incrementStepCount,
		resetStepCount: resetStepCount,
		resetCooldowns: resetCooldowns,
		onPassageReady: onPassageReady,
		onPassageDone: onPassageDone
	};
})();

/* Per-navigation lifecycle hook. Replaces the old :: PassageReady
 * dispatcher passage. Two responsibilities:
 *  - $return tracker: stamp the current passage into $return so
 *    `<<return>>` links and GUI overlays know where to send the player.
 *    Passages tagged `noreturn` (modal/event chains, dialogs) opt out.
 *  - Per-tick setup: setup.Tick.onPassageReady() runs the migration /
 *    ensure-defaults / refresh stack and may return a passage name to
 *    redirect to. Engine.play() aborts the current navigation and
 *    starts the redirect, which re-fires :passagestart for the new
 *    passage and stamps $return correctly. */
$(document).on(':passagestart', function (ev) {
	if (!ev.passage.tags.includes('noreturn')) {
		State.variables.return = ev.passage.name;
	}
	var redirect = setup.Tick.onPassageReady();
	if (redirect) Engine.play(redirect);
});
