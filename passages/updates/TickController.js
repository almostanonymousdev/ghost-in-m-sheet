/*
 * Per-tick maintenance helpers, called from :: PassageDone and
 * :: PassageReady. These run on every passage transition, so the
 * goal is "cheap predicates + small idempotent state nudges". One-
 * shot save migrations live in :: Migrations; load-time defaulting
 * lives in :: SaveMigration.
 */
setup.Tick = (function () {
	var OWNED_VARS = Object.freeze([
		'stealChanceMult',
		'stepCount'
	]);

	function sv() { return State.variables; }


	// --- Rescue quest expiry --------------------------------------
	/* When the rescue quest is active and the player either ran out of
	   stages or let the day slip past 5 PM, fail the quest and reset
	   the per-attempt vars. */
	function tickRescueQuestExpiry() {
		var s = sv();
		var Q = setup.RescueQuestState;
		if (s.hasQuestForRescue !== Q.ACTIVE) return;
		var ranOut = s.rescueStage >= 2 || (s.rescueStage === 1 && s.hours > 17);
		if (!ranOut) return;
		s.hasQuestForRescue = Q.FAILED;
		s.rescueStage = 0;
		s.hasRescueClue = 0;
	}

	// --- Haunt timer accounting ----------------------------------
	function tickProwlTimer() {
		var s = sv();
		if (s.elapsedTimeProwl > s.prowlTimeRemain) {
			s.prowlActivated = 0;
		} else {
			s.elapsedTimeProwl = (s.hours * 60 + s.minutes) - s.prowlActivationTime;
		}
	}

	// --- Choker lust floor ---------------------------------------
	/* The collar/choker keeps lust at >=15 while worn. Returns true
	   if it pushed lust up so callers can refresh the meter. */
	function applyChokerLustFloor() {
		var s = sv();
		if (s.neckChokerState1 !== setup.ClothingState.WORN) return false;
		if (!s.mc || s.mc.lust > 15) return false;
		s.mc.lust = 15;
		return true;
	}

	// --- Possession / tarot cleanup ------------------------------
	function applyPossessionTarotCleanup() {
		if (setup.Ghosts.isPossessed()) {
			sv().tarotCardsStage = setup.TarotStage.SPENT;
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
			&& s.isCompChosen === 1;
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
	function resolveCompanionAttack() {
		var s = sv();
		var CS = setup.CompanionShow;
		var roll = Math.floor(Math.random() * 100) + 1;
		if (roll >= s.chanceToAttack) {
			s.showComp = CS.ATTACK_SAFE;
			return 'safe';
		}
		s.showComp = CS.ATTACK_FAILED;
		s.stepCount = 0;
		return 'hit';
	}
	function atRandomGhostPassage() {
		var target = sv().randomGhostPassage;
		if (!target || !setup.HuntController) return false;
		if (passage() !== "HuntRun") return false;
		return setup.HuntController.currentRoomId() === target;
	}

	// --- Steal-chance recompute ---------------------------------
	function recomputeStealChance() {
		/* Base chance derives from sanity + stealChanceMult only.
		   Per-tick modifier scaling (Sticky Fingers) is applied by the
		   STEAL_CHECK filter at the roll site so all per-tick steal
		   knobs converge in one place. */
		var s = sv();
		s.stealChance = (1 + (Math.log(101 - s.mc.sanity) / Math.log(101)) * 1) * s.stealChanceMult;
	}

	// --- PassageDone tick setup ---------------------------------
	function initTick() {
		sv().stealChanceMult = 1.1;
	}

	// --- Twins event guard --------------------------------------
	function twinsEventFired() { return sv().twinsEventActive === 1; }

	// --- Step counter -------------------------------------------
	function stepCount() { return sv().stepCount || 0; }
	function incrementStepCount() {
		sv().stepCount = (sv().stepCount || 0) + 1;
	}

	// --- Midnight rollover (resetCooldowns helper) --------------
	/* Called once per day-change (via addTime crossing 24). Resets
	   per-day cooldowns and ticks several multi-day counters. The
	   binary day-zero list lives in the setup.Cooldowns registry —
	   each owning controller registers its CDs at module load, so
	   adding a new daily cooldown is one registerDaily() line in the
	   owning controller (not a fan-out edit here). */
	function resetCooldowns() {
		var s = sv();
		setup.Cooldowns.resetDaily();
		// webcam.showCD lives inside the $webcam bundle, not at the
		// $-root, so the registry's flat-key reset can't see it. Reset
		// it inline — the bundle is owned by HomeController.
		if (s.webcam) s.webcam.showCD = 0;

		setup.Companion.advanceSoloHuntsAtMidnight();

		if (s.ghostMareEventStart >= 1) {
			s.ghostMareEventStage += 1;
		} else {
			s.ghostMareEventStage = 0;
		}

		if (s.rescueStage === 0 || s.rescueStage === 1) {
			s.rescueStage += 1;
		}

		if (s.isBrookePossessed === setup.BrookePossession.INACTIVE) {
			s.isBrookePossessedCD = (s.isBrookePossessedCD || 0) + 1;
			if (s.isBrookePossessedCD >= setup.BROOKE_POSSESSED_RECOVERY_DAYS) {
				delete s.isBrookePossessedCD;
				s.isBrookePossessed = setup.BrookePossession.RECOVERED;
			}
		}

		if (s.succubus === 1) {
			if (!s.succubusEvent) s.succubusEvent = {};
			var se = s.succubusEvent;
			if (se.eventCD !== 0) { se.eventCD = (se.eventCD || 0) + 1; }
			if (se.eventCD >= 3)  { se.eventCD = 0; }
		}

		if (s.exorcismQuestStage === setup.ExorcismQuestStage.SUCCUBUS_SUMMONED && s.succubusEvent && s.succubusEvent.eventTimer >= 1) {
			s.succubusEvent.eventTimer -= 1;
		}

		if (s.gotCursedItem === 1 && s.gotCursedItemEventCD < 3) {
			s.gotCursedItemEventCD += 1;
		}
	}

	/* :: PassageReady lifecycle hook. Bundles the per-tick setup that
	   used to live as a long stack of <<run>> calls in the lifecycle
	   passage. Returns a passage name to <<goto>>, or null. The
	   passage stays a thin wrapper that just routes the goto. */
	function onPassageReady() {
		if (setup.Ghosts.isHunting()
			&& companionAttackActiveHit()
			&& resolveCompanionAttack() === "hit") {
			setup.Companion.pickRandomCompanionRoomFromContext();
		}

		if (atRandomGhostPassage()) return "CompanionEvent";

		setup.Gui.refreshToolTimer();
		recomputeStealChance();

		// SaveMigration already ran these defaults on load, but
		// running them here picks up brand-new variables introduced
		// mid-save without a reload.
		if (setup.applySaveDefaults) setup.applySaveDefaults(State.variables);

		setup.Migrations.ensureZeroDefaults();
		setup.Migrations.seedTornStyles();
		applyPossessionTarotCleanup();
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

		if (setup.Ghosts.isMimicHunt() && setup.Ghosts.isHunting()) {
			setup.Posession.rollMimicType(
				setup.Ghosts.names({ exclude: ["Mimic"] })
			);
		}

		setup.HuntController.shuffleGhostRoom();

		if (setup.Time.isMorningPlus() && setup.Ghosts.isHunting()) {
			return { goto: "HuntOverTime" };
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
		applyPossessionTarotCleanup: applyPossessionTarotCleanup,
		activeCompanionShouldLeaveAfterEvent: activeCompanionShouldLeaveAfterEvent,
		companionAttackActiveHit: companionAttackActiveHit,
		resolveCompanionAttack: resolveCompanionAttack,
		atRandomGhostPassage: atRandomGhostPassage,
		recomputeStealChance: recomputeStealChance,
		initTick: initTick,
		twinsEventFired: twinsEventFired,
		stepCount: stepCount,
		incrementStepCount: incrementStepCount,
		resetCooldowns: resetCooldowns,
		onPassageReady: onPassageReady,
		onPassageDone: onPassageDone
	};
})();

/* Per-navigation $return tracker. Every time the engine starts a new
 * passage, stamp its name into $return — that's what `<<return>>`
 * links and the GUI overlays read to jump back to where the player
 * was. Passages that shouldn't be returned to (modal/event chains,
 * dialog popovers) opt out with the "noreturn" tag. */
$(document).on(':passagestart', function (ev) {
	if (!ev.passage.tags.includes('noreturn')) {
		State.variables.return = ev.passage.name;
	}
});
