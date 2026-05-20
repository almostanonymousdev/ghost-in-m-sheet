/*
 * Centralized state queries and mutations for the main character
 * ($mc plus the handful of top-level "player status" flags and
 * consumables: $isPenaltyOn, $energyDrinkAmount, $makeupAmount/
 * $makeupApplied, $medicineAmount, $sanityPillsAmount, $earnedMoney,
 * level-progress counters, and the possession meter).
 *
 * Any passage that previously read/wrote $mc.x directly should route
 * through setup.Mc via its semantic accessors
 * (setup.Mc.money(), setup.Mc.setMoney(v), setup.Mc.addMoney(n)).
 */
/* Discrete results returned by setup.Mc.applySanityDelta. The
   addSanity widget compares against these to decide whether to fire
   the HuntOverSanity transition. */
setup.SanityDeltaResult = Object.freeze({
	NORMAL:    "",
	CLAMPED:   "clamped",
	COLLAPSED: "collapsed"
});

setup.Mc = (function () {
	/* Variables owned by this controller. Other controllers should
	   query/mutate these only through the API methods below. */
	var OWNED_VARS = Object.freeze([
		'mc',
		'isPenaltyOn',
		'mcpossession',
		'mcOrgasmMeter',
		'orgasmCooldownSteps',
		'percentageOfLevel',
		'neededForNextLevel',
		'tempCorr',
		'earnedMoney',
		'energyDrinkAmount',
		'makeupAmount',
		'makeupApplied',
		'medicineAmount',
		'sanityPillsAmount',
		'sensualBodyPart',
		'sanityCollapse',
		'exhausted',
		'piercingTitsAddSens',
		'piercingPussyAddSens',
		'piercingTongueAddSens',
		'addLustPiercingTits',
		'addLustPiercingPussy',
		'addLustPiercingTongue'
	]);

	var sv = setup.sv;

	var api = {
		OWNED_VARS: OWNED_VARS,

		// --- Fit percent shorthand ------------------------------
		// $mc.fit is clamped to [0, 100]; plenty of callers that
		// just display a bar divide by 100.
		fitPct: function () { return sv().mc.fit / 100; },

		// --- Beauty: split into base + modifier -----------------
		// `beautyBase` is the immutable starting value seeded at
		// game init; every gameplay-driven change (wardrobe, makeup,
		// tattoos, gym, piercings, ...) writes only `beautyModifier`.
		// Reads come through beauty() so callers see the sum.
		beauty: function () {
			var m = sv().mc;
			return (m.beautyBase || 0) + (m.beautyModifier || 0);
		},
		setBeauty: function (v) {
			sv().mc.beautyModifier = v - (sv().mc.beautyBase || 0);
		},
		addBeauty: function (n) {
			sv().mc.beautyModifier = (sv().mc.beautyModifier || 0) + n;
		},

		// --- Penalty (sleep / assault debuff flag) --------------
		isPenalized:    function () { return sv().isPenaltyOn === 1; },
		setPenalized:   function (on) { sv().isPenaltyOn = on ? 1 : 0; },
		clearPenalty:   function () { sv().isPenaltyOn = 0; },

		sensualBodyPart: function () { return sv().sensualBodyPart; },
		bodyPartSensitivity: function (part) {
			var bp = sv().sensualBodyPart;
			return bp ? (bp[part] || 0) : 0;
		},
		ensurePossession: function () {
			if (sv().mcpossession === undefined) { sv().mcpossession = 0; }
		},

		// --- Earned-money accumulator (compound mutation) -------
		earn: function (n) {
			sv().mc.money += n;
			sv().earnedMoney += n;
		},

		// --- Inventory consumables: amount-aware mutators -------
		// useX returns true iff there was at least one to consume.
		useEnergyDrink: function () {
			if (sv().energyDrinkAmount > 0) {
				sv().energyDrinkAmount -= 1;
				sv().mc.energy = sv().mc.energyMax;
				return true;
			}
			return false;
		},
		// addMedicine / addSanityPills tolerate undefined so callers
		// don't have to bootstrap the counter on legacy saves.
		addMedicine:    function (n) { sv().medicineAmount    = (sv().medicineAmount    || 0) + n; },
		addSanityPills: function (n) { sv().sanityPillsAmount = (sv().sanityPillsAmount || 0) + n; },
		useMedicine: function () {
			if (sv().medicineAmount > 0) {
				sv().medicineAmount -= 1;
				return true;
			}
			return false;
		},
		useSanityPill: function () {
			if (sv().sanityPillsAmount > 0) {
				sv().sanityPillsAmount -= 1;
				return true;
			}
			return false;
		},

		// --- XP / level-up ---------------------------------------
		// Single grant-exp mutation shared by the gym, church, witch,
		// etc. XP grants. Returns true iff at least one level-up fired.
		grantExp: function (amount) {
			var s = sv();
			var m = s.mc;
			m.exp += amount;
			s.percentageOfLevel = Math.floor((m.exp / s.neededForNextLevel) * 100);
			var leveled = false;
			while (m.exp >= s.neededForNextLevel) {
				m.exp -= s.neededForNextLevel;
				m.lvl += 1;
				s.percentageOfLevel -= 100;
				s.neededForNextLevel += Math.ceil(0.3 * s.neededForNextLevel);
				leveled = true;
			}
			return leveled;
		},

		// --- Lust helpers --------------------------------------
		clampLust: function () {
			sv().mc.lust = Number(sv().mc.lust.toFixed(2));
		},

		// --- addSanity widget core --------------------------------
		// Applies a delta, clamps to [0, sanityMax]. Returns one of
		// setup.SanityDeltaResult: COLLAPSED if sanity hit 0 (caller
		// should jump to HuntOverSanity), CLAMPED if clamped to max,
		// NORMAL otherwise.
		applySanityDelta: function (delta) {
			var R = setup.SanityDeltaResult;
			var m = sv().mc;
			m.sanity += delta;
			if (m.sanity >= m.sanityMax) {
				m.sanity = m.sanityMax;
				return R.CLAMPED;
			}
			if (m.sanity < 0) {
				m.sanity = 0;
				return R.COLLAPSED;
			}
			return R.NORMAL;
		},

		// --- addEnergy widget core --------------------------------
		applyEnergyDelta: function (delta) {
			var m = sv().mc;
			m.energy += delta;
			if (m.energy >= m.energyMax) { m.energy = m.energyMax; }
			if (m.energy <= 0)           { m.energy = 0; }
		},

		// --- addLust widget core --------------------------------
		applyLustDelta: function (delta) {
			var m = sv().mc;
			m.lust += delta;
			if (m.lust >= m.lustMax) { m.lust = m.lustMax; }
			if (m.lust <= 0)         { m.lust = 0; }
			setup.Mc.clampLust();
		},

		// --- addFit widget core -----------------------------------
		// Same shape as setup.Gym.applyFitnessGain, but the gym controller
		// imports this method so both widgets share logic.
		applyFitnessDelta: function (delta) {
			var m = sv().mc;
			var previousFit = m.fit;
			m.fit += delta;
			var beautyIncrease = Math.floor(m.fit / 5) - Math.floor(previousFit / 5);
			if (beautyIncrease > 0) { setup.Mc.addBeauty(beautyIncrease); }
			if (!m.energyPoints) { m.energyPoints = Math.floor(previousFit / 10); }
			var prevEp = m.energyPoints;
			var curEp  = Math.floor(m.fit / 10);
			var energyMaxDelta = 0;
			if (curEp > prevEp) {
				energyMaxDelta = curEp - prevEp;
				m.energyMax   += energyMaxDelta;
				m.energyPoints = curEp;
			}
			if (previousFit >= 5 && (previousFit - 1) % 5 === 0 && m.fit < 5) {
				setup.Mc.addBeauty(-1);
			}
			m.fit = Math.max(0, Math.min(100, m.fit));
			if (setup.Mc.beauty() < 0) { setup.Mc.setBeauty(0); }
			var hitEnergyCap = false;
			if (m.fit === 100 && m.energyMax < 20) {
				m.energyMax  = 20;
				energyMaxDelta += 20 - (curEp > prevEp ? curEp : prevEp);
				hitEnergyCap = true;
			}
			return {
				fit:             m.fit,
				beauty:          setup.Mc.beauty(),
				beautyIncrease:  beautyIncrease > 0 ? beautyIncrease : 0,
				energyMaxDelta:  energyMaxDelta,
				energyMax:       m.energyMax,
				reachedFitCap:   m.fit === 100,
				hitEnergyCap:    hitEnergyCap
			};
		},

		// --- addLustByPart core -----------------------------------
		// Escalates the chosen body part's sensitivity and feeds
		// the (base + new sens) total into setup.Mc.addLust.
		addLustByPart: function (part, base) {
			var sv = State.variables;
			var lustBase = (base !== undefined) ? base : 2;
			var bp = sv.sensualBodyPart || {};

			// Tuning sensitivity formula: sensMult should be between 0.9 and 0.1 for square root function behavior.
			// With sensBase = 0.2 and sensMult = 0.99 behavior is almost linear:
			//  adding 0.2 each time for the first 50 or so calls, tapering off as sensitivity nears 20.
			var sensBase = 0.2;
			var sensMult = 0.99;

			function bump(key, extra) {
				extra = extra || 0;
				bp[key] = sensMult * (bp[key] || 0) + sensBase + extra;
			}
			switch (part) {
				case 'brain':
					bump('brain');
					setup.Mc.applyLustDelta(lustBase + bp.brain);
					break;
				case 'tits':
					bump('tits', sv.piercingTitsAddSens || 0);
					setup.Mc.applyLustDelta(lustBase + bp.tits);
					break;
				case 'ass':
					bump('ass');
					setup.Mc.applyLustDelta(lustBase + bp.ass);
					break;
				case 'bottom':
					bump('bottom');
					bump('ass');
					bump('pussy', sv.piercingPussyAddSens || 0);
					bump('anal');
					setup.Mc.applyLustDelta(lustBase + bp.bottom);
					break;
				case 'mouth':
					bump('mouth', sv.piercingTongueAddSens || 0);
					setup.Mc.applyLustDelta(lustBase + bp.mouth);
					break;
				case 'pussy':
					bump('pussy', sv.piercingPussyAddSens || 0);
					setup.Mc.applyLustDelta(lustBase + bp.pussy);
					break;
				case 'anal':
					bump('anal');
					setup.Mc.applyLustDelta(lustBase + bp.anal);
					break;
			}
		}
	};

	/* Trivial $mc.<field> accessors. Each row gets get/set/add/remove
	   with the conventional names; pass `false` to suppress one. */
	setup.defineAccessors(api, function () { return sv().mc; }, [
		'money',
		'sanity',
		'sanityMax',
		'sanityUp',
		'energy',
		'energyMax',
		'energyPoints',
		'corruption',
		'lust',
		'name',
		'fit',
		'lvl',
		'exp',
		'exhibitionism',
		'makeupImg',
		'dirty'
	]);

	/* Trivial top-level State.variables accessors. `key` overrides the
	   underlying $variable name when the public method root differs;
	   `get` overrides the getter name. sanityPillsAmount / medicineAmount
	   opt out of the auto-generated add/remove because addMedicine /
	   addSanityPills (defined manually above) tolerate an undefined
	   counter on legacy saves; the auto helpers would NaN-out. */
	setup.defineAccessors(api, sv, [
		'tempCorr',
		'earnedMoney',
		'percentageOfLevel',
		'neededForNextLevel',
		'makeupApplied',
		{ name: 'energyDrinkAmount',  add: 'addEnergyDrink' },
		{ name: 'sanityPillsAmount',  add: false, remove: false },
		{ name: 'medicineAmount',     add: false, remove: false },
		{ name: 'makeupAmount',       add: 'addMakeup', remove: 'removeMakeup' },
		// Public method root differs from $variable name:
		{ name: 'possession',     key: 'mcpossession' },
		{ name: 'orgasmMeter',    key: 'mcOrgasmMeter' },
		{ name: 'orgasmCooldown', key: 'orgasmCooldownSteps' }
	]);

	/* Stamp whatever-is-banked $tempCorr into $mc.corruption,
	   capping at 1 so a single walk-home can't spike corruption
	   more than a point, then reset the bank. */
	api.bankTempCorruption = function () {
		var s = sv();
		if ((s.tempCorr || 0) >= 1) { s.tempCorr = 1; }
		s.mc.corruption += (s.tempCorr || 0);
		s.tempCorr = 0;
	};
	api.isSanityCollapsed = function () { return sv().sanityCollapse === 1; };
	api.clearSanityCollapse = function () { sv().sanityCollapse = 0; };
	api.isExhausted = function () { return sv().exhausted === 1; };
	api.clearExhausted = function () { sv().exhausted = 0; };
	api.lustPct = function () { return sv().mc.lust / 100; };
	api.sanityPct = function () { return sv().mc.sanity / sv().mc.sanityMax; };
	api.energyPct = function () { return sv().mc.energy / sv().mc.energyMax; };
	return api;
})();

/* HUD lust meter for the MC. The 220px width is the wider sidebar
 * style; per-room search meters use 50% (registered in
 * ToolController). */
Meter.add('mclust', { label: '$mc.lust', width: '220px' }, 1);
