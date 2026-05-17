/*
 * Centralized state queries and mutations for the witch's house.
 * Passages should call into setup.Witch instead of testing the
 * underlying $variables directly, so the conditions live in one place.
 *
 * Variable ownership: Witch only directly reads/writes its own quest
 * and shop state. Anything outside that domain (player stats, time of
 * day, equipment tiers, hunt evidence, monkey-paw guide, cursed-home
 * items) is queried through the owning controller's API.
 */
/* Lifecycle of $exorcismQuestStage. NOT_STARTED: church hasn't yet
   referred the player. REFERRED: church has, summoning is unlocked.
   SUCCUBUS_SUMMONED: the succubus answered the call. */
setup.ExorcismQuestStage = Object.freeze({
	NOT_STARTED:       0,
	REFERRED:          1,
	SUCCUBUS_SUMMONED: 2
});

/* Lifecycle of $wardenClothesStage (Ironclad warden outfit gate).
   HINT_NOT_OFFERED: witch hasn't told the player about the outfit.
   HINT_OFFERED: witch dropped the hint; mall now sells the outfit.
   OUTFIT_OWNED: outfit purchased; prison gate opens. Reset back to
   HINT_NOT_OFFERED after the first wasted visit. */
setup.WardenClothesStage = Object.freeze({
	HINT_NOT_OFFERED: 0,
	HINT_OFFERED:     1,
	OUTFIT_OWNED:     2
});

setup.Witch = (function () {
	/* Variables owned by this controller. Other controllers should
	   query/mutate these only through the API methods below. */
	var OWNED_VARS = Object.freeze([
		'firstVisitWitchShop',
		'gotKeyFromWitch',
		'witchNight',
		'stealItemsFromWitch',
		'succubus',
		'exorcismQuestStage',
		'gotCursedItem',
		'isCIDildo', 'isCIButtplug', 'isCIBeads', 'isCIHDildo',
		'eventToolsOneStart',
		'wardenClothesStage',
		'weakenTheGhostQuest',
		'isWeakenGhost',
		'moneyFromWeakenTheGhost',
		'amulet'
	]);

	function sv() { return State.variables; }

	var api = {
		OWNED_VARS: OWNED_VARS,
		// --- Hours / access --------------------------------------
		isDayTime: function () {
			var h = setup.Time.hours();
			return h > 9 && h <= 23;
		},
		hasStolenKey: function () {
			return sv().gotKeyFromWitch !== undefined;
		},
		canSneakInAtNight: function () {
			return !this.isDayTime() && this.hasStolenKey();
		},

		isFirstVisit: function () {
			return sv().firstVisitWitchShop === true;
		},

		// --- Exorcism referral -----------------------------------
		hasSuccubusEncounter: function () {
			return sv().succubus !== undefined;
		},
		succubusVisited: function () { return sv().succubus === 1; },
		// (markExorcismReferred / markSuccubusSummoned / resetExorcismQuestStage
		// fold into the defineStageAccessors block at the bottom.)
		exorcismQuestNotStarted: function () {
			var s = sv().exorcismQuestStage;
			return s === undefined || s === setup.ExorcismQuestStage.NOT_STARTED;
		},

		// --- Missing-girls / rescue quest ------------------------
		canOfferRescueQuest: function () {
			return setup.MissingWomen.rescueQuestStage() === undefined;
		},
		rescueQuestUnlocked: function () {
			return setup.Mc.lvl() >= 4;
		},

		// --- Cursed-object side quest ----------------------------
		canOfferCursedItemQuest: function () {
			return setup.Mc.lvl() >= 2 && sv().gotCursedItem === undefined;
		},
		cursedItemQuestStarted: function () {
			return sv().gotCursedItem !== undefined;
		},
		cursedItemQuestActive: function () {
			return sv().gotCursedItem === 0;
		},
		hasCursedItemToTurnIn: function () {
			return sv().gotCursedItem === 1;
		},
		clearCursedItemHeld: function () { sv().gotCursedItem = 0; },
		setCursedItemHeld:   function () { sv().gotCursedItem = 1; },
		setCursedItemFlag: function (key) { sv()[key] = 1; },
		/* Consume the cursed item the player is carrying. Clears whichever
		   of the four type flags is set and the held flag, returning the
		   name of the cleared type flag (or null if nothing was carried).
		   Used by the MonkeyPaw front-door sacrifice. */
		consumeCarriedCursedItem: function () {
			var s = sv();
			if (s.gotCursedItem !== 1) return null;
			var TYPE_FLAGS = ['isCIDildo', 'isCIButtplug', 'isCIBeads', 'isCIHDildo'];
			var cleared = null;
			for (var i = 0; i < TYPE_FLAGS.length; i++) {
				if (s[TYPE_FLAGS[i]] === 1) {
					s[TYPE_FLAGS[i]] = 0;
					cleared = TYPE_FLAGS[i];
					break;
				}
			}
			s.gotCursedItem = 0;
			return cleared;
		},
		shouldAwardGwb3OnTurnIn: function () {
			return setup.ToolController.tierOf('gwb') !== 3;
		},
		collectCursedItemReward: function () {
			var s = sv();
			setup.Mc.addMoney(30);
			s.gotCursedItem = 0;
			s.isCIDildo = 0;
			s.isCIButtplug = 0;
			s.isCIBeads = 0;
			s.isCIHDildo = 0;
		},
		unlockMonkeyPawWishes: function () {
			setup.MonkeyPaw.purchaseGuide();
			setup.Mc.removeMoney(400);
		},

		// --- Level 3 tools referral ------------------------------
		canAskAboutLevel3Tools: function () {
			var s = sv().eventToolsOneStart;
			return s === undefined || s === 0;
		},
		grantAmulet: function () { sv().amulet = 1; },
		ownsLevel3Gwb: function () {
			return setup.ToolController.tierOf('gwb') === 3;
		},

		// --- Monkey paw guide ------------------------------------
		canAskAboutMonkeyPaw: function () {
			return setup.MonkeyPaw.guideStage() === setup.MonkeyPawGuide.NOT_ASKED;
		},

		// --- Warden/Ironclad hint --------------------------------
		/* Available once the MC reaches the prison's level gate (4),
		   even before she's stepped inside, so the witch can prime the
		   warden-outfit lead. Closes again only after the outfit is
		   bought (OUTFIT_OWNED). */
		canAskAboutIronclad: function () {
			var s = sv().wardenClothesStage;
			var W = setup.WardenClothesStage;
			if (s === W.OUTFIT_OWNED) return false;
			if (s === W.HINT_NOT_OFFERED || s === W.HINT_OFFERED) return true;
			return setup.Mc.lvl() >= 4;
		},
		// --- Weaken-the-ghost quest ------------------------------
		canOfferWeakenQuest: function () {
			return setup.Mc.lvl() >= 5 && sv().weakenTheGhostQuest === undefined;
		},

		// --- Night exploration -----------------------------------
		// (witchNight / stealItemsFromWitch are registered with
		// setup.Cooldowns at the bottom of this file; the daily reset
		// flows through setup.Tick.resetCooldowns → resetDaily.)
		canStealItemsFromWitch: function () {
			return setup.Cooldowns.available('stealItemsFromWitch');
		},
		canVisitWitchBedroomNight: function () {
			return setup.Cooldowns.available('witchNight');
		},

		// --- Mast (masturbation) event ---------------------------
		canStealKeyFromWitch: function () {
			return !this.hasStolenKey() && setup.Mc.corruption() >= 3;
		},

		// --- Mutations previously inline in witch passages -------
		startWitchNightCooldown: function () { setup.Cooldowns.start('witchNight'); },
		startStealItemsCooldown: function () { setup.Cooldowns.start('stealItemsFromWitch'); },
		markKeyFromWitchStolen:  function () { sv().gotKeyFromWitch = 1; },
		markShopVisited:         function () { sv().firstVisitWitchShop = false; },

		// --- Witch sale (tool upgrades) --------------------------
		TOOL_UPGRADE_PRICES: {
			emf: 200, temperature: 100, spiritbox: 500,
			gwb: 400, glass: 300, uvl: 400
		},
		toolLevel: function (tool) {
			return setup.ToolController.tierOf(tool);
		},
		upgradeTool: function (tool) {
			var price = this.TOOL_UPGRADE_PRICES[tool];
			setup.ToolController.setTier(tool, 4);
			setup.Mc.removeMoney(price);
		},
		buyDetector: function () {
			setup.ToolController.buyDetector();
			setup.Mc.removeMoney(200);
		},
		detectorBought: function () { return setup.ToolController.detectorBought(); },

		// --- Bedroom / night events ------------------------------
		witchLateNightHour: function () {
			return (setup.Time.hours() || 0) <= 5;
		},

		// --- Weaken / contract bookkeeping -----------------------
		markWeakenQuestStarted: function () {
			sv().weakenTheGhostQuest = 1;
		},
		markMonkeyPawGuideBought: function () {
			setup.MonkeyPaw.markGuideAsked();
		},
		startCursedItemQuest: function () {
			sv().gotCursedItem = 0;
		},
		restartToolEvent: function () {
			sv().eventToolsOneStart = 0;
		},
		upgradeGwbToLvl3: function () {
			setup.ToolController.setTier('gwb', 3);
		},

		// --- Tentacles event (anti-midnight wraparound) ----------
		spend2HoursHandleMidnight: function () {
			return setup.Time.sleepAdvanceHours(2);
		},
		hasWeakenTheGhostQuest: function () {
			return sv().weakenTheGhostQuest === 1;
		},
		isGhostWeakened: function () {
			return sv().isWeakenGhost === 1;
		},
		markGhostWeakened: function () { sv().isWeakenGhost = 1; },
		moneyFromWeakenGhost: function () { return sv().moneyFromWeakenTheGhost || 0; },
		recordWeakenReward: function (amount) {
			sv().isWeakenGhost = 1;
			sv().moneyFromWeakenTheGhost = amount;
		},
		clearWeakenGhostState: function () {
			delete sv().isWeakenGhost;
			delete sv().moneyFromWeakenTheGhost;
		},
		/* Drop the carried cursed item (clears type flag + held flag)
		   and pay out `amount` to the MC. Used by the mall buyback. */
		sellCarriedCursedItem: function (amount) {
			var s = sv();
			s.gotCursedItem = 0;
			s.isCIDildo = 0;
			s.isCIButtplug = 0;
			s.isCIBeads = 0;
			s.isCIHDildo = 0;
			setup.Mc.addMoney(amount);
		},
		/* Which of the four cursed-item variants is the MC carrying?
		   Returns "dildo" / "buttplug" / "beads" / "hdildo" or "". */
		carriedCursedItemType: function () {
			var s = sv();
			if (s.isCIDildo === 1)    return 'dildo';
			if (s.isCIButtplug === 1) return 'buttplug';
			if (s.isCIBeads === 1)    return 'beads';
			if (s.isCIHDildo === 1)   return 'hdildo';
			return '';
		}
	};

	setup.defineAccessors(api, sv, [
		'eventToolsOneStart',
		'exorcismQuestStage',
		'wardenClothesStage',
		{ name: 'cursedItemState', key: 'gotCursedItem', set: false }
	]);
	setup.defineStageAccessors(api, sv, 'exorcismQuestStage', setup.ExorcismQuestStage, {
		mark: { resetExorcismQuestStage: 'NOT_STARTED',
				markExorcismReferred: 'REFERRED',
				markSuccubusSummoned: 'SUCCUBUS_SUMMONED' }
	});
	setup.defineStageAccessors(api, sv, 'wardenClothesStage', setup.WardenClothesStage, {
		mark: { markWardenOutfitHintOpened: 'HINT_OFFERED' }
	});
	return api;
})();
/* Deferred to :storyready -- see ChurchController for rationale. */
$(document).one(':storyready', function () {
	setup.Cooldowns.registerDaily('witchNight');
	setup.Cooldowns.registerDaily('stealItemsFromWitch');
});
