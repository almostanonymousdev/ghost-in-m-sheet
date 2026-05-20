/*
 * Centralized state queries and mutations for the gym location.
 * Passages should call into setup.Gym instead of testing the
 * underlying $variables directly, so the conditions live in one place.
 */
setup.Gym = (function () {
	/* Variables owned by this controller. Other controllers should
	   query these only through the API methods below. */
	var OWNED_VARS = Object.freeze([
		'trainer1TipReceived', 'trainer1Sex', 'trainer1CoachingCost',
		'isDiscountTrainer1', 'trainer2Sex', 'trainer3CoachingCost',
		'relationEmily', 'relationEmilyCD',
		'sportswear', 'trainingCost'
	]);

	var sv = setup.sv;

	var TRAIN_COST = 5;
	var DEFAULT_TRAINING_PRICE = 15;

	return {
		OWNED_VARS: OWNED_VARS,
		// --- Hours / open state --------------------------------
		isOpen:           setup.LocationHours(8, 21),
		isMorning:        setup.LocationHours(8, 11),
		isAfternoon:      setup.LocationHours(12, 16),
		isEvening:        setup.LocationHours(17, 22),
		isGroupClassTime: setup.LocationHours(12, 13),

		// --- Solo video buckets (keyed slightly differently) --
		soloSlotMorning:   setup.LocationHours(8, 12),
		soloSlotAfternoon: setup.LocationHours(13, 17),
		soloSlotEvening:   setup.LocationHours(18, 22),

		// --- Training cost (depends on time + discounts) -----
		computeTrainingCost: function () {
			if (this.isMorning()) {
				return sv().trainer1CoachingCost === undefined ? DEFAULT_TRAINING_PRICE : 0;
			}
			if (this.isAfternoon()) {
				return DEFAULT_TRAINING_PRICE;
			}
			if (this.isEvening()) {
				return sv().trainer3CoachingCost === undefined ? DEFAULT_TRAINING_PRICE : 0;
			}
			return DEFAULT_TRAINING_PRICE;
		},

		// --- Player capability checks ------------------------
		hasSportswear: function () {
			return sv().sportswear !== undefined;
		},
		hasEnergyToTrain: function () {
			return setup.Mc.energy() >= TRAIN_COST;
		},
		canAffordCoach: function () {
			return setup.Mc.money() >= sv().trainingCost;
		},
		canTrainSolo: function () {
			return this.hasSportswear() && this.hasEnergyToTrain();
		},
		canTrainWithCoach: function () {
			return this.hasSportswear() && this.hasEnergyToTrain() && this.canAffordCoach();
		},

		// --- Trainer 1 (morning) event conditions -----------
		// (trainer1Sex / trainer2Sex are registered with
		// setup.Cooldowns at the bottom; daily reset flows through
		// setup.Tick.resetCooldowns.)
		trainer1OnCooldown: function () {
			return setup.Cooldowns.onCooldown('trainer1Sex');
		},
		hasSexyLingerieForTrainer1: function () {
			var bs = setup.Wardrobe.rememberBottomStockings();
			var tu = setup.Wardrobe.rememberTopUnder();
			var bu = setup.Wardrobe.rememberBottomUnder();
			return (bs === 'stockings2' || bs === 'stockings3') &&
				(tu === 'bra2' || tu === 'bra3') &&
				(bu === 'panties2' || bu === 'panties3');
		},
		canTriggerTrainer1Event: function () {
			return sv().trainer1TipReceived === 1 &&
				!this.trainer1OnCooldown() &&
				this.hasSexyLingerieForTrainer1();
		},
		trainer1GaveTip: function () {
			return sv().trainer1TipReceived === 1;
		},

		// --- Trainer 2 (afternoon) event conditions ---------
		trainer2OnCooldown: function () {
			return setup.Cooldowns.onCooldown('trainer2Sex');
		},
		meetsFitForTrainer2Event: function () {
			return setup.Mc.fit() >= 30;
		},

		// --- Group class -----------------------------------
		meetsBeautyForGroupEvent: function () {
			return setup.Mc.beauty() >= 50;
		},
		canJoinGroupOrgy: function () {
			return setup.Mc.lust() >= 50;
		},

		// --- Emily ----------------------------------------
		hasMetEmily: function () {
			return sv().relationEmily !== undefined;
		},
		emilyRelationshipStage: function () {
			return sv().relationEmily || 0;
		},
		emilyOnCooldown: function () {
			return sv().relationEmilyCD === 1;
		},
		startEmilyCooldown: function () {
			State.variables.relationEmilyCD = 1;
		},
		greetEmilyFirstTime: function () {
			// First conversation with Emily in the gym.
			State.variables.relationEmily = 1;
		},
		raiseEmilyRelationship: function () {
			if ((sv().relationEmily || 0) < 10) {
				State.variables.relationEmily = (sv().relationEmily || 0) + 1;
				return true;
			}
			return false;
		},
		trainer1Tipped: function () {
			return sv().trainer1TipReceived === 1;
		},
		markTrainer1Tipped: function () {
			State.variables.trainer1TipReceived = 1;
		},
		trainer1Discounted: function () {
			return sv().isDiscountTrainer1 !== undefined;
		},
		applyTrainer1Discount: function () {
			State.variables.isDiscountTrainer1 = 1;
			State.variables.trainer1CoachingCost = 1;
		},
		markTrainer1Coaching: function () {
			State.variables.trainer1CoachingCost = 1;
		},
		startTrainer1SexCooldown: function () {
			setup.Cooldowns.start('trainer1Sex');
		},
		startTrainer2SexCooldown: function () {
			setup.Cooldowns.start('trainer2Sex');
		},
		trainingCost: function () { return sv().trainingCost; },
		setTrainingCost: function (value) { State.variables.trainingCost = value; },

		// --- Core cost constant (used by GymTrainingTrainer) -----
		payForCoach: function () {
			setup.Mc.removeMoney(State.variables.trainingCost);
		},
		removeEnergyToTrain: function () {
			setup.Mc.removeEnergy(TRAIN_COST);
		},

		// --- Fitness gain (view-agnostic deltas for widgetGym) ---
		// Apply a fit delta and return the side-effect tuple the widget
		// renders: how much beauty went up (or down), how much energyMax
		// rose, and whether fitness hit the 100 cap.
		applyFitnessGain: function (fitGain) {
			return setup.Mc.applyFitnessDelta(fitGain);
		}
	};
})();
setup.Cooldowns.registerDaily('trainer1Sex');
setup.Cooldowns.registerDaily('trainer2Sex');
