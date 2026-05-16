/*
 * Centralized state queries and mutations for the church location.
 * Passages should call into setup.Church instead of testing the
 * underlying $variables directly, so the conditions live in one place.
 *
 * Cross-controller access: Church only mutates church-owned vars
 * directly; player stats go through setup.Mc, the clock goes through
 * setup.Time, equipment tiers through setup.ToolController, and
 * Brook-possession state through setup.Home.
 */
setup.Church = (function () {
	/* Variables owned by this controller. Other controllers should
	   query/mutate these only through the API methods below. */
	var OWNED_VARS = Object.freeze([
		'relationshipWithRain',
		'churchSex'
	]);

	function sv() { return State.variables; }

	return {
		OWNED_VARS: OWNED_VARS,
		// --- Hours -------------------------------------------------
		isOpen: function () {
			var h = setup.Time.hours();
			return h > 5 && h < 22;
		},

		// --- Rescue / Rain quest line -----------------------------
		hasMetRain: function () {
			return sv().relationshipWithRain !== undefined;
		},
		canStartNunQuest: function () {
			return setup.MissingWomen.rescueQuestStage() === 0 && !this.hasMetRain();
		},
		showMissingPersonsBoard: function () {
			return setup.MissingWomen.rescueQuestStage() !== undefined && this.hasMetRain();
		},
		shouldRedirectToNunQuest: function () {
			var stage = setup.MissingWomen.rescueQuestStage();
			return stage === 2 || stage === 3;
		},

		// --- Holy water -------------------------------------------
		knowsAboutHolyWater: function () {
			return setup.Ghosts.hasDiscovered('Mare') || this.hasMetRain();
		},
		holyWaterAvailable: function () {
			return this.knowsAboutHolyWater() && !setup.Home.hasHolyWater();
		},
		collectHolyWater: function () {
			setup.Home.collectHolyWater();
		},

		// --- Exorcism --------------------------------------------
		canRequestExorcism: function () {
			return setup.Witch.exorcismQuestStage() === setup.ExorcismQuestStage.NOT_STARTED && this.hasMetRain();
		},
		rainTrustsForExorcism: function () {
			return (sv().relationshipWithRain || 0) >= 5;
		},
		rescuesNeededForExorcism: function () {
			return Math.max(0, 5 - (sv().relationshipWithRain || 0));
		},

		// --- Priest: flirt / sex ---------------------------------
		priestRoutesUnlocked: function () {
			return setup.Witch.eventToolsOneStart() === 1;
		},
		canFlirtWithPriest: function () {
			return setup.Mc.lust() >= 40 && this.priestRoutesUnlocked();
		},
		// (churchSex is registered with setup.Cooldowns at the bottom;
		// daily reset flows through setup.Tick.resetCooldowns.)
		priestSexOnCooldown: function () {
			return setup.Cooldowns.onCooldown('churchSex');
		},
		meetsBeautyForFlirt: function () {
			return setup.Mc.beauty() >= 45;
		},

		// --- Priest: level 3 tool quest --------------------------
		canAskAboutLevel3Tools: function () {
			return setup.Witch.eventToolsOneStart() === 0;
		},
		meetsBeautyForLevel3Tools: function () {
			return setup.Mc.beauty() >= 45;
		},
		priestWillTradeToolForSex: function () {
			return setup.Mc.corruption() >= 4;
		},

		// --- Mutations previously done inline by passages ---------
		clearRescueQuest: function () {
			setup.MissingWomen.resetQuestToAvailable();
		},
		clearRescueClue:    function () { setup.MissingWomen.clearRescueClue(); },
		initRainIfNeeded:   function () {
			if (sv().relationshipWithRain === undefined) {
				sv().relationshipWithRain = 0;
			}
		},
		relationshipWithRain: function () { return sv().relationshipWithRain; },
		adjustRainRelationship: function (delta) {
			sv().relationshipWithRain = (sv().relationshipWithRain || 0) + delta;
		},
		upgradeSpiritboxReward: function () {
			// Rain thanks you by upgrading the spiritbox to level 3.
			// Returns true iff a reward was granted (no-op when already
			// at lvl 3).
			if (setup.ToolController.tierOf('spiritbox') !== 3) {
				setup.ToolController.setTier('spiritbox', 3);
				return true;
			}
			return false;
		},
		startPriestToolEvent: function () {
			setup.Witch.setEventToolsOneStart(1);
			setup.ToolController.setTier('temperature', 3);
		},
		priestToolEventStarted: function () {
			return setup.Witch.eventToolsOneStart() === 1;
		},
		startChurchSexCooldown: function () {
			setup.Cooldowns.start('churchSex');
		},

		// --- Priest: lust purge (after confession / pray) --------
		clearLust: function () {
			setup.Mc.setLust(0);
		},
		confessFlushLust: function () {
			if (setup.Mc.lust() >= 100) {
				setup.Mc.setLust(0);
				if (setup.Mc.corruption() < 10) { setup.Mc.addCorruption(0.2); }
			}
			setup.Mc.clampLust();
		},

		// --- Exorcism ---------------------------------------------
		startExorcismQuest: function () {
			setup.Witch.markExorcismReferred();
			setup.Witch.grantAmulet();
		},
		clearBrookePossession: function () {
			setup.Home.clearBrookePossession();
		},

		// --- Lust check for priest tool event --------------------
		lustTooHighForPriest: function () {
			return setup.Mc.lust() >= 85;
		}
	};
})();
setup.Cooldowns.registerDaily('churchSex');
