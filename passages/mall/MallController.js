/*
 * Centralized state queries for the mall and its sections.
 * Passages should call into setup.Mall instead of testing the
 * underlying $variables directly, so the conditions live in one place.
 */
setup.Mall = (function () {
	/* Variables owned by this controller. Other controllers should
	   query these only through the API methods below. */
	var OWNED_VARS = Object.freeze([
		'dialogBlake', 'relationshipBlake',
		'hasPSpray', 'hasPSprayCharges',
		'isPhoneBought'
	]);

	var sv = setup.sv;

	var api = {
		OWNED_VARS: OWNED_VARS,
		// --- Hours -----------------------------------------------
		isOpen: setup.LocationHours(8, 21),

		// --- Blake / adult shop ----------------------------------
		blakeUnlocked: function () {
			return setup.Companion.companionLvl('Alice') >= 2;
		},
		blakeFirstMeeting: function () {
			return sv().dialogBlake === undefined;
		},
		blakeCanIntroduceCursedItemBuyback: function () {
			return setup.Witch.cursedItemQuestStarted() && sv().dialogBlake !== 1;
		},
		blakeHasCursedItemToSell: function () {
			return setup.Witch.hasCursedItemToTurnIn() && sv().dialogBlake === 1;
		},
		canRaiseBlakeRelationship: function () {
			return sv().relationshipBlake <= 4;
		},
		sellCursedItemToBlake: function () {
			setup.Witch.sellCarriedCursedItem(60);
		},
		pickBlakeForHunt: function () {
			setup.Companion.pickCisCompanion('Blake');
		},
		blakeIsCompanionCandidate: function () {
			return sv().relationshipBlake >= 5;
		},
		blakeHuntFinishedAlone: function () {
			return setup.Companion.hasFinishedSoloHunt('Blake');
		},
		canPayForBlakeSoloHunt: function () {
			var paid = setup.Companion.soloHuntPaymentState('Blake');
			return (paid === undefined || paid === 0) && setup.Mc.money() >= 20;
		},
		cannotAffordBlakeSoloHunt: function () {
			return setup.Mc.money() < 20;
		},

		// --- Warden outfit purchase ------------------------------
		canBuyWardenOutfit: function () {
			return setup.Witch.wardenClothesStage() === setup.WardenClothesStage.HINT_OFFERED;
		},
		meetsCorruptionForWarden: function () {
			return setup.Mc.corruption() >= 3;
		},

		// --- General shop: pepper spray --------------------------
		needsPepperSpray: function () {
			var s = sv().hasPSpray;
			return s === undefined || s === 0;
		},
		hasPepperSpray: function () { return sv().hasPSpray === 1; },
		pepperSprayCharges: function () { return sv().hasPSprayCharges || 0; },
		hasPepperSprayCharges: function () {
			return sv().hasPSpray === 1 && (sv().hasPSprayCharges || 0) >= 1;
		},
		consumePepperSprayCharge: function () {
			sv().hasPSprayCharges -= 1;
		},
		buyPepperSpray: function () {
			var s = sv();
			s.hasPSpray = 1;
			s.hasPSprayCharges = 3;
			setup.Mc.removeMoney(10);
		},

		// --- Warden costume purchase -----------------------------
		buyWardenOutfit: function () {
			setup.Mc.removeMoney(500);
			setup.Witch.setWardenClothesStage(setup.WardenClothesStage.OUTFIT_OWNED);
		},

		// --- Phone purchase --------------------------------------
		phoneBought: function () { return sv().isPhoneBought !== undefined; },

		// --- Blake dialogue state / relationship -----------------
		// (blakeDialogStage / setBlakeDialogStage / blakeRelationship /
		// setBlakeRelationship fold into the setup.defineAccessors block
		// at the bottom; raiseBlakeRelationship stays inline because
		// it's a no-arg bump with a `|| 0` fallback that doesn't model
		// cleanly as add(n).)
		raiseBlakeRelationship: function () {
			sv().relationshipBlake = (sv().relationshipBlake || 0) + 1;
		},

		// --- Chance-aloneHunt display values ---------------------
		chanceBlakeAloneOwaissa: function () { return setup.Companion.soloHuntChanceOwaissa('Blake'); },
		chanceBlakeAloneElm:     function () { return setup.Companion.soloHuntChanceElm('Blake'); },

		// --- Camera purchase eligibility -------------------------
		canBuyCamera: function () {
			return !setup.Home.isCameraBoughtFlagSet() && setup.SpecialEvent.mareEventStart() === 3;
		},

		// --- Picking Blake for a solo hunt -----------------------
		pickBlakeForSoloHuntOwaissa: function () {
			setup.Companion.sendCompanionSolo('Blake', 'Owaissa');
		},
		pickBlakeForSoloHuntElm: function () {
			setup.Companion.sendCompanionSolo('Blake', 'Elm');
		}
	};

	// Pure $variable passthrough accessors. Both fields are bumped via
	// the inline raiseBlakeRelationship helper above (no-arg, `|| 0`
	// fallback); only the get/set pair folds here.
	setup.defineAccessors(api, sv, [
		{ name: 'blakeDialogStage',  key: 'dialogBlake',       add: false, remove: false },
		{ name: 'blakeRelationship', key: 'relationshipBlake', add: false, remove: false }
	]);

	return api;
})();
