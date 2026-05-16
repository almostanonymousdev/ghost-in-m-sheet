/*
 * Centralized state queries and mutations for the delivery hub.
 * Passages should call into setup.Delivery instead of testing the
 * underlying $variables directly, so the conditions live in one place.
 */
/* When the deliveryEventChoose widget pays out the success earnings:
   ON_DONE waits for the encounter to be marked complete (door 1 →
   thanks); ON_ENTRY pays as soon as the gate is opened. */
setup.DeliveryPayMode = Object.freeze({
	ON_DONE:  "done",
	ON_ENTRY: "always"
});

setup.Delivery = (function () {
	function sv() { return State.variables; }

	/* Variables owned by this controller. Other controllers should
	   query these only through the API methods below. */
	var OWNED_VARS = Object.freeze([
		'deliveryCompletedShifts', 'deliveryStreak', 'deliveryBestStreak',
		'deliveryCorrectThisShift',
		// $deliveryActiveIcons: [bool, bool, bool] — replaces the three
		// $deliveryActiveIcon{1,2,3} flat flags. SaveMigration folds the
		// legacy keys into this array.
		'deliveryActiveIcons',
		'deliveryVisitCounts',
		'currentHouse', 'currentOrder', 'orders', 'shuffledOrders',
		'order1', 'order2', 'order3',
		'jobMoneySuccessed', 'jobMoneyFailed',
		'deliveryBJ', 'deliveryPapersEvent', 'deliveryBurgerEvent',
		'deliveryPackageEvent', 'deliveryPizzaEvent',
		'deliverySpecialOrder', 'deliverySpecialOrderAddress',
		'deliverySpecialOrderType', 'deliverySpecialOrderPay',
		'deliveryTotalTips', 'firstVisitDeliveryHub',
		'itemImages', 'items', 'streets', 'shuffledStreets', 'shuffledItems'
	]);

	function activeIconsArray() {
		var s = State.variables;
		if (!Array.isArray(s.deliveryActiveIcons)) {
			s.deliveryActiveIcons = [false, false, false];
		}
		return s.deliveryActiveIcons;
	}

	return {
		OWNED_VARS: OWNED_VARS,
		// --- Pay tiers & progression -----------------------------
		payTiers: [
			{ minShifts: 0,  base: 10, fail: 3 },
			{ minShifts: 5,  base: 12, fail: 4 },
			{ minShifts: 12, base: 15, fail: 5 },
			{ minShifts: 25, base: 18, fail: 6 },
			{ minShifts: 50, base: 22, fail: 7 }
		],
		updatePayTier: function () {
			var shifts = sv().deliveryCompletedShifts;
			var tiers = this.payTiers;
			var tier = 0;
			for (var i = tiers.length - 1; i >= 0; i--) {
				if (shifts >= tiers[i].minShifts) { tier = i; break; }
			}
			var repBonus = this.reputationPayBonus();
			sv().jobMoneySuccessed = tiers[tier].base + repBonus;
			sv().jobMoneyFailed = tiers[tier].fail;
		},

		// --- Reputation / streaks --------------------------------
		reputationMilestones: [
			{ streak: 5,  level: 1, label: "Reliable",     payBonus: 2 },
			{ streak: 10, level: 2, label: "Trusted",       payBonus: 4 },
			{ streak: 20, level: 3, label: "Star Courier",  payBonus: 6 }
		],
		reputationLevel: function () {
			var best = sv().deliveryBestStreak;
			var milestones = this.reputationMilestones;
			var level = 0;
			for (var i = milestones.length - 1; i >= 0; i--) {
				if (best >= milestones[i].streak) { level = milestones[i].level; break; }
			}
			return level;
		},
		reputationPayBonus: function () {
			var level = this.reputationLevel();
			var milestones = this.reputationMilestones;
			for (var i = 0; i < milestones.length; i++) {
				if (milestones[i].level === level) return milestones[i].payBonus;
			}
			return 0;
		},
		reputationLabel: function () {
			var level = this.reputationLevel();
			var milestones = this.reputationMilestones;
			for (var i = 0; i < milestones.length; i++) {
				if (milestones[i].level === level) return milestones[i].label;
			}
			return "Newbie";
		},
		deliveryTime: function () {
			return this.reputationLevel() >= 3 ? 20 : 30;
		},

		// --- Route familiarity -----------------------------------
		isRouteFamiliar: function (address) {
			var counts = sv().deliveryVisitCounts;
			return counts && counts[address] >= 3;
		},
		trackVisit: function (address) {
			var counts = sv().deliveryVisitCounts;
			if (!counts) { counts = {}; sv().deliveryVisitCounts = counts; }
			if (!counts[address]) { counts[address] = 0; }
			counts[address] += 1;
		},

		// --- Hub hours / shift eligibility -----------------------
		isOpen: function () {
			var h = setup.Time.hours();
			return h > 7 && h < 20;
		},
		isFirstVisit: function () {
			return sv().firstVisitDeliveryHub !== false;
		},
		hasEnergyForShift: function () {
			return setup.Mc.energy() >= 2;
		},
		canStartShift: function () {
			return !this.isFirstVisit() && this.isOpen() && this.hasEnergyForShift();
		},
		tooTiredForShift: function () {
			return !this.isFirstVisit() && this.isOpen() && !this.hasEnergyForShift();
		},

		// --- Manager: flirt / BJ quest ---------------------------
		// (the five delivery daily flags — deliveryBJ plus the four
		// markXxxEvent setters — are registered with setup.Cooldowns at
		// the bottom; daily reset flows through setup.Tick.resetCooldowns.)
		managerBJOnCooldown: function () {
			return setup.Cooldowns.onCooldown('deliveryBJ');
		},
		meetsBeautyForManagerFlirt: function () {
			return setup.Mc.beauty() >= 45;
		},
		managerWillPayExtra: function () {
			return setup.Mc.corruption() >= 2;
		},
		hasMetManagerEvent: function () {
			return hasVisited('DeliveryManagerEventStart');
		},

		// --- Pizza / Package / Burger / Papers gate checks -------
		canAcceptPizzaDeal: function () {
			return setup.Mc.corruption() >= 3;
		},
		canAcceptPackageDeal: function () {
			return setup.Mc.corruption() >= 3;
		},
		canAcceptBurgerWeed: function () {
			return setup.Mc.corruption() >= 4;
		},
		canAcceptPapersFlirt: function () {
			return setup.Mc.corruption() >= 3;
		},
		papersLustHighEnough: function () {
			return setup.Mc.lust() >= 40;
		},
		papersStillCorruptible: function () {
			return setup.Mc.corruption() <= 3;
		},
		papersInitialLustHighEnough: function () {
			return setup.Mc.lust() >= 30;
		},
		packageLustHighEnough: function () {
			// Drives which branch is shown in DeliveryPackageEventStart
			return setup.Mc.lust() > 49;
		},

		// --- State accessors / mutations previously inline --------
		currentHouse:   function () { return sv().currentHouse; },
		setCurrentHouse: function (h) { sv().currentHouse = h; },
		currentOrder:   function () { return sv().currentOrder; },
		setCurrentOrder: function (n) { sv().currentOrder = n; },
		orders:         function () { return sv().orders; },
		earnedMoney:    function () { return setup.Mc.earnedMoney(); },
		addEarnedMoney: function (n) { setup.Mc.addEarnedMoney(n); },
		resetEarnedMoney: function () { setup.Mc.setEarnedMoney(0); },
		addJobSuccessEarnings: function () {
			setup.Mc.addEarnedMoney(sv().jobMoneySuccessed);
		},
		addJobFailEarnings: function () {
			setup.Mc.addEarnedMoney(sv().jobMoneyFailed);
		},
		jobMoneySuccessed: function () { return sv().jobMoneySuccessed; },
		jobMoneyFailed:    function () { return sv().jobMoneyFailed; },

		// --- Special order fields -------------------------------
		specialOrderActive:  function () { return !!sv().deliverySpecialOrder; },
		specialOrderAddress: function () { return sv().deliverySpecialOrderAddress; },
		specialOrderType:    function () { return sv().deliverySpecialOrderType; },
		specialOrderPay:     function () { return sv().deliverySpecialOrderPay; },
		clearSpecialOrder:   function () { sv().deliverySpecialOrder = false; },
		bankSafeSpecialOrder: function () {
			setup.Mc.addEarnedMoney(sv().deliverySpecialOrderPay);
			sv().deliverySpecialOrder = false;
		},

		// --- Event flags ----------------------------------------
		// markEvent(name) reads the cooldown var name from the catalogue
		// (setup.deliveryEvents) so the four delivery encounters share one
		// marker call. Per-event helpers below kept thin for callers that
		// still read by name.
		markEvent: function (name) {
			var cfg = setup.deliveryEvents[name];
			if (cfg) setup.Cooldowns.start(cfg.varName);
		},
		markPapersEvent:  function () { this.markEvent('papers'); },
		markBurgerEvent:  function () { this.markEvent('burger'); },
		markPackageEvent: function () { this.markEvent('package'); },
		markPizzaEvent:   function () { this.markEvent('pizza'); },
		startManagerBJCooldown: function () { setup.Cooldowns.start('deliveryBJ'); },

		// --- Delivery-event catalogue lookups -------------------
		// Maps an order item key (e.g. "burgers") to the catalogue
		// event key (e.g. "burger"). Returns null for items without
		// an encounter (books, generic).
		eventNameForItem: function (item) {
			switch (item) {
				case 'pizza':      return 'pizza';
				case 'package':    return 'package';
				case 'burgers':    return 'burger';
				case 'newspapers': return 'papers';
				default:           return null;
			}
		},
		// Event type for the order in the active currentOrder slot.
		currentEventType: function () {
			var slot = sv().currentOrder;
			var order = sv()['order' + slot];
			return order ? this.eventNameForItem(order.item) : null;
		},
		markMetAlice:     function () { setup.Companion.markMetAlice(); },
		hasMetAlice:      function () { return setup.Companion.hasMetAlice(); },
		markFirstVisited: function () { sv().firstVisitDeliveryHub = false; },

		// --- Active-icon flags for the three daily orders ---------
		// 0-based slot index. The array $deliveryActiveIcons is the source
		// of truth; callers shouldn't poke at the legacy individual flags.
		activeIcon: function (i) { return activeIconsArray()[i]; },
		setActiveIcon: function (i, val) { activeIconsArray()[i] = !!val; },
		resetActiveIcons: function () {
			var arr = activeIconsArray();
			arr[0] = arr[1] = arr[2] = true;
		},

		// --- Per-shift counters --------------------------------
		completedShifts: function () { return sv().deliveryCompletedShifts; },
		correctThisShift: function () { return sv().deliveryCorrectThisShift; },
		incrementCorrectThisShift: function () { sv().deliveryCorrectThisShift += 1; },
		resetCorrectThisShift:     function () { sv().deliveryCorrectThisShift = 0; },
		streak: function () { return sv().deliveryStreak; },
		bestStreak: function () { return sv().deliveryBestStreak; },
		endShift: function () {
			var s = sv();
			s.deliveryCompletedShifts += 1;
			if (s.deliveryCorrectThisShift >= 3) {
				s.deliveryStreak += 1;
			} else {
				s.deliveryStreak = 0;
			}
			if (s.deliveryStreak > s.deliveryBestStreak) {
				s.deliveryBestStreak = s.deliveryStreak;
			}
		},
		bankEarnedMoney: function () {
			// Pay out the shift: credit MC, spend energy, reset counter.
			setup.Mc.addMoney(setup.Mc.earnedMoney());
			setup.Mc.removeEnergy(2);
			setup.Mc.setEarnedMoney(0);
		},
		grantPerfectShiftBonus: function (amount) {
			setup.Mc.addEarnedMoney(amount);
		},

		// --- Find order slot for the current house (used by WorkDelivery) -
		orderSlotForHouse: function (house) {
			var orders = sv().orders || [];
			var icons = activeIconsArray();
			for (var i = 0; i < orders.length; i++) {
				if (orders[i].address === house && icons[i]) return i;
			}
			return -1;
		},

		// --- Manager event lust snippet (previously inline) -------
		clearLust: function () { setup.Mc.setLust(0); },
		addLust:   function (n) { setup.addLust(n); },

		// --- Shift initialization (WorkDelivery passage) --------
		// Rolls the 3 randomized orders + optional special "rush" order
		// for the upcoming shift and seeds the per-shift counters.
		initShift: function () {
			var s = sv();
			s.itemImages = {
				pizza:      "ui/img/pizza.jpg",
				package:    "ui/img/package.jpg",
				newspapers: "ui/img/newspapers.jpg",
				burgers:    "ui/img/burger.jpg",
				books:      "ui/img/books.jpg"
			};
			s.items = ["pizza", "package", "newspapers", "books", "burgers"];
			s.streets = setup.deliveryStreets.slice();
			s.shuffledStreets = s.streets.slice().shuffle();
			s.shuffledItems = s.items.slice().shuffle();

			s.orders = [];
			for (var i = 0; i < 3; i++) {
				var it = s.shuffledItems[i];
				s.orders.push({
					address: s.shuffledStreets[i],
					item:    it,
					image:   s.itemImages[it]
				});
			}
			s.shuffledOrders = s.orders.slice().shuffle();
			s.order1 = s.orders[0];
			s.order2 = s.orders[1];
			s.order3 = s.orders[2];

			s.deliveryCorrectThisShift = 0;

			s.deliverySpecialOrder = false;
			if (Math.floor(Math.random() * 100) + 1 <= 25) {
				s.deliverySpecialOrder = true;
				s.deliverySpecialOrderAddress = s.shuffledStreets[3];
				s.deliverySpecialOrderPay = 20 + Math.floor(Math.random() * 6);
				s.deliverySpecialOrderType = Math.random() < 0.5 ? 'safe' : 'unsafe';
			}
		},
		shuffledOrders: function () { return sv().shuffledOrders; },
		trackCorrect: function () { sv().deliveryCorrectThisShift += 1; },
		addTip:       function (n) {
			setup.Mc.addEarnedMoney(n);
			sv().deliveryTotalTips += n;
		}
	};
})();
setup.Cooldowns.registerDaily('deliveryPizzaEvent');
setup.Cooldowns.registerDaily('deliveryPackageEvent');
setup.Cooldowns.registerDaily('deliveryBurgerEvent');
setup.Cooldowns.registerDaily('deliveryPapersEvent');
setup.Cooldowns.registerDaily('deliveryBJ');

/* Delivery-event catalogue. Each entry holds the metadata the unified
   dispatch passages (DeliveryEventChoose / Start / Event1 / Event2)
   need to render the gate, route between stages, and pay out. The
   per-encounter narrative still lives in those passages — what's here
   is the data the wrapper widgets consume.

   Fields:
     varName       cooldown flag set by markEvent(name)
     videoSubdir   /scenes/deliveryhub/<subdir>/N.mp4 root for the encounter
     headerImg     image rendered above the gate dialog
     payMode       DeliveryPayMode.ON_ENTRY pays the regular delivery
                   fee as soon as the gate is shown; ON_DONE waits for
                   the cooldown var to flip to 1 (encounter complete)
     canAcceptFn   () -> bool, gate the offer dialog; false branch
                   shows the corruption-required line and exits
     gateCorrReq   number rendered by deliveryCorrReq next to the
                   refusal link when canAcceptFn is false. */
setup.deliveryEvents = Object.freeze({
	pizza: Object.freeze({
		varName:     "deliveryPizzaEvent",
		videoSubdir: "pizzaevent",
		headerImg:   "pizzaevent/1.jpg",
		payMode:     setup.DeliveryPayMode.ON_DONE,
		canAcceptFn: function () { return setup.Delivery.canAcceptPizzaDeal(); },
		gateCorrReq: 3
	}),
	package: Object.freeze({
		varName:     "deliveryPackageEvent",
		videoSubdir: "packageevent",
		headerImg:   "packageevent/1.jpg",
		payMode:     setup.DeliveryPayMode.ON_ENTRY,
		canAcceptFn: function () { return setup.Delivery.canAcceptPackageDeal(); },
		gateCorrReq: 3
	}),
	burger: Object.freeze({
		varName:     "deliveryBurgerEvent",
		videoSubdir: "burgerevent",
		headerImg:   "burgerevent/1.jpg",
		payMode:     setup.DeliveryPayMode.ON_ENTRY,
		canAcceptFn: function () { return setup.Delivery.canAcceptBurgerWeed(); },
		gateCorrReq: 5
	}),
	papers: Object.freeze({
		varName:     "deliveryPapersEvent",
		videoSubdir: "papersevent",
		headerImg:   "papersevent/1.jpg",
		payMode:     setup.DeliveryPayMode.ON_ENTRY,
		canAcceptFn: function () { return setup.Delivery.canAcceptPapersFlirt(); },
		gateCorrReq: 3
	})
});
