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

/* Lifecycle of $ectoplasmQuestStage. Gates every visible reference
   to the ectoplasm currency + meta-shop and the rogue/random hunt
   card on GhostStreet. The witch offers the quest once the MC hits
   level 5; only after she clears it does the ectoplasm economy come
   out of hiding.
     NOT_OFFERED: witch hasn't surfaced the lead.
     OFFERED:     witch told the MC; quest is open but unfinished.
     COMPLETED:   MC turned in the quest; rogue card + ectoplasm UI
                  + shop link all unhide. */
setup.EctoplasmQuestStage = Object.freeze({
	NOT_OFFERED: 0,
	OFFERED:     1,
	COMPLETED:   2
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
		'cursedItemVide',
		'eventToolsOneStart',
		'wardenClothesStage',
		'weakenTheGhostQuest',
		'isWeakenGhost',
		'moneyFromWeakenTheGhost',
		'amulet',
		'ectoplasmQuestStage',
		'ectoplasmWeakenCount',
		'ectoplasmPrequalified'
	]);

	var sv = setup.sv;

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
		setSuccubusVisited: function (v) { sv().succubus = v; },
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
		setCursedItemFlag: function (key) { sv()[key] = true; },
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
				if (s[TYPE_FLAGS[i]] === true) {
					s[TYPE_FLAGS[i]] = false;
					cleared = TYPE_FLAGS[i];
					break;
				}
			}
			s.gotCursedItem = 0;
			return cleared;
		},
		cheatGrantCursedItem: function (type) {
			var s = sv();
			s.gotCursedItem = 1;
			s.isCIDildo    = (type === 'dildo');
			s.isCIButtplug = (type === 'buttplug');
			s.isCIBeads    = (type === 'beads');
			s.isCIHDildo   = (type === 'hdildo');
		},
		shouldAwardGwb3OnTurnIn: function () {
			return setup.ToolController.tierOf('gwb') !== 3;
		},
		collectCursedItemReward: function () {
			var s = sv();
			setup.Mc.addMoney(30);
			s.gotCursedItem = 0;
			s.isCIDildo = false;
			s.isCIButtplug = false;
			s.isCIBeads = false;
			s.isCIHDildo = false;
		},
		// --- Monkey paw shop -------------------------------------
		/* Two tiered items on the shelf: the 400-coin wishes list
		   (labels only) and the 800-coin full guide (labels +
		   descriptions + "anything" meta-wish). Either can be the
		   first purchase; buying the full guide after the list
		   leaves no overlap to refund. WitchSale gates the cards
		   on MonkeyPaw.canBuyWishList / canBuyGuide. */
		MONKEY_PAW_WISH_LIST_PRICE: 400,
		MONKEY_PAW_GUIDE_PRICE:     800,
		buyMonkeyPawWishList: function () {
			setup.MonkeyPaw.purchaseWishList();
			setup.Mc.removeMoney(this.MONKEY_PAW_WISH_LIST_PRICE);
		},
		buyMonkeyPawGuide: function () {
			setup.MonkeyPaw.purchaseGuide();
			setup.Mc.removeMoney(this.MONKEY_PAW_GUIDE_PRICE);
		},

		// --- Level 3 tools referral ------------------------------
		canAskAboutLevel3Tools: function () {
			var s = sv().eventToolsOneStart;
			return s === undefined || s === 0;
		},
		grantAmulet: function () { sv().amulet = true; },
		ownsLevel3Gwb: function () {
			return setup.ToolController.tierOf('gwb') === 3;
		},

		// --- Monkey paw guide ------------------------------------
		/* Witch only engages with paw questions once the MC is
		   high-enough level that the paw can actually appear in
		   hunts (setup.MonkeyPaw.isUnlocked). Otherwise the dialog
		   shouldn't exist -- there's nothing for her to react to. */
		canAskAboutMonkeyPaw: function () {
			return setup.MonkeyPaw.isUnlocked()
				&& setup.MonkeyPaw.guideStage() === setup.MonkeyPawGuide.NOT_ASKED;
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

		// --- Ectoplasm-unlock quest ------------------------------
		/* Khadija won't open the ectoplasm ledger until the MC proves
		   she can wring a ghost dry without going hollow for it the way
		   her dead hunters did. The proof is GHOSTS_TO_WEAKEN ghosts
		   weakened (seduce-minigame wins) -- tracked for life, not just
		   while the favor is open -- after which she teaches the
		   banishing ritual and unlocks the currency. */
		GHOSTS_TO_WEAKEN: 3,
		/* Witch surfaces the quest the first time the MC visits at
		   level 5+; the offer goes away once she takes it. */
		canOfferEctoplasmQuest: function () {
			var stage = sv().ectoplasmQuestStage;
			var E = setup.EctoplasmQuestStage;
			return setup.Mc.lvl() >= 5
				&& (stage === undefined || stage === E.NOT_OFFERED);
		},
		/* Production entry point for accepting the quest: flip the stage
		   to OFFERED and snapshot whether the MC has *already* met the
		   weaken bar, so the briefing can acknowledge a hunter who did
		   the work before being asked. */
		offerEctoplasmQuest: function () {
			sv().ectoplasmPrequalified =
				this.ectoplasmWeakenCount() >= this.GHOSTS_TO_WEAKEN;
			this.markEctoplasmQuestStarted();
		},
		ectoplasmQuestStarted: function () {
			return sv().ectoplasmQuestStage === setup.EctoplasmQuestStage.OFFERED;
		},
		ectoplasmQuestComplete: function () {
			return sv().ectoplasmQuestStage === setup.EctoplasmQuestStage.COMPLETED;
		},
		/* True when the MC had already weakened enough ghosts at the
		   moment she took the quest -- nothing left to prove, skip
		   straight to the lesson with a knowing line from Khadija. */
		isEctoplasmQuestPrequalified: function () {
			return sv().ectoplasmPrequalified === true;
		},
		/* Lifetime tally of ghosts weakened, maintained on every
		   seduce-minigame win regardless of quest state. */
		ectoplasmWeakenCount: function () {
			return sv().ectoplasmWeakenCount || 0;
		},
		ectoplasmWeakenRemaining: function () {
			return Math.max(0, this.GHOSTS_TO_WEAKEN - this.ectoplasmWeakenCount());
		},
		/* True once the MC has weakened enough ghosts to come back and
		   have Khadija teach the banishing ritual. */
		canCompleteEctoplasmQuest: function () {
			return this.ectoplasmQuestStarted()
				&& this.ectoplasmWeakenCount() >= this.GHOSTS_TO_WEAKEN;
		},
		/* Single read-side gate the rest of the codebase calls when
		   deciding whether to show ectoplasm UI / the rogue card /
		   the meta-shop link. */
		ectoplasmUnlocked: function () {
			return this.ectoplasmQuestComplete();
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
		markKeyFromWitchStolen:  function () { sv().gotKeyFromWitch = true; },
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
		remove2HoursHandleMidnight: function () {
			return setup.Time.sleepAdvanceHours(2);
		},
		hasWeakenTheGhostQuest: function () {
			return sv().weakenTheGhostQuest === 1;
		},
		isGhostWeakened: function () {
			return sv().isWeakenGhost === true;
		},
		markGhostWeakened: function () { sv().isWeakenGhost = true; },
		moneyFromWeakenGhost: function () { return sv().moneyFromWeakenTheGhost || 0; },
		recordWeakenReward: function (amount) {
			sv().isWeakenGhost = true;
			sv().moneyFromWeakenTheGhost = amount;
			/* Every weakened ghost is tallied for life, whether or not
			   Khadija's favor is open. Her ectoplasm quest reads this
			   running total: a hunter who has already wrung three ghosts
			   out before she even asks has nothing left to prove (see
			   offerEctoplasmQuest / isEctoplasmQuestPrequalified). */
			sv().ectoplasmWeakenCount = this.ectoplasmWeakenCount() + 1;
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
			s.isCIDildo = false;
			s.isCIButtplug = false;
			s.isCIBeads = false;
			s.isCIHDildo = false;
			setup.Mc.addMoney(amount);
		},
		/* Which of the four cursed-item variants is the MC carrying?
		   Returns "dildo" / "buttplug" / "beads" / "hdildo" or "". */
		carriedCursedItemType: function () {
			var s = sv();
			if (s.isCIDildo === true)    return 'dildo';
			if (s.isCIButtplug === true) return 'buttplug';
			if (s.isCIBeads === true)    return 'beads';
			if (s.isCIHDildo === true)   return 'hdildo';
			return '';
		},
		/* Random cursed-item usage video for the active item variant.
		   Top-covered dildo has a longer gallery; the others share
		   their own fixed set. Stamps the picked path on $cursedItemVide
		   so re-renders within the same passage reuse the same clip. */
		cursedItemVideo: function () {
			var t = this.carriedCursedItemType();
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
	setup.defineStageAccessors(api, sv, 'ectoplasmQuestStage', setup.EctoplasmQuestStage, {
		mark: {
			markEctoplasmQuestStarted: 'OFFERED',
			completeEctoplasmQuest:    'COMPLETED'
		}
	});
	setup.Cooldowns.registerDaily('witchNight');
	setup.Cooldowns.registerDaily('stealItemsFromWitch');
	return api;
})();
