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
/* Discrete results returned by setup.Mc.addSanity. The
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
		'sensualBodyPartChoice',
		'sanityCollapse',
		'exhausted',
		'piercingTitsAddSens',
		'piercingPussyAddSens',
		'piercingTongueAddSens',
		'addLustPiercingTits',
		'addLustPiercingPussy',
		'addLustPiercingTongue',
		'possessionResidue'
	]);

	var sv = setup.sv;

	var api = {
		OWNED_VARS: OWNED_VARS,

		// True once $mc has been stamped by initState. Lets controllers
		// that fire early (Tick, HauntConditions) bail out before $mc
		// exists without reaching into State.variables themselves.
		isReady: function () { return !!sv().mc; },

		// --- Fit percent shorthand ------------------------------
		// $mc.fit is clamped to [0, 100]; plenty of callers that
		// just display a bar divide by 100.
		fitPct: function () { return sv().mc.fit / 100; },

		// --- Beauty: split into base + modifier -----------------
		// `beautyBase` is the immutable starting value seeded at
		// game init; every gameplay-driven change (wardrobe, makeup,
		// tattoos, gym, piercings, ...) writes only `beautyModifier`.
		// Reads come through beauty() so callers see the sum.
		//
		// During a hunt, `mc.frozenBeauty` overrides reads so drift
		// chance / event rolls see a stable value while clothes get
		// torn off, makeup wipes, etc. Writes pass through unchanged --
		// the freeze is read-side only. HuntController calls
		// freezeBeauty()/unfreezeBeauty() through the hunt lifecycle.
		beauty: function () {
			var m = sv().mc;
			if (m.frozenBeauty != null) { return m.frozenBeauty; }
			return (m.beautyBase || 0) + (m.beautyModifier || 0);
		},
		setBeauty: function (v) {
			sv().mc.beautyModifier = v - (sv().mc.beautyBase || 0);
		},
		addBeauty: function (n) {
			sv().mc.beautyModifier = (sv().mc.beautyModifier || 0) + n;
		},
		freezeBeauty: function () {
			var m = sv().mc;
			m.frozenBeauty = (m.beautyBase || 0) + (m.beautyModifier || 0);
		},
		unfreezeBeauty: function () {
			sv().mc.frozenBeauty = null;
		},
		isBeautyFrozen: function () {
			return sv().mc.frozenBeauty != null;
		},

		/* Rebuild beautyModifier from canonical state (worn wardrobe,
		   piercings, tattoos, fit-derived bonus, applied makeup) as a
		   defensive resync. Called from setup.Home.sleepAdvance() so
		   every wake snaps beauty back to a derivable value, papering
		   over any incremental ±delta bookkeeping bug elsewhere. */
		recomputeBeauty: function () {
			var s    = sv();
			var m    = s.mc;
			var WORN = setup.ClothingState && setup.ClothingState.WORN;
			var total = (m.beautyBase || 0);

			total += Math.floor((m.fit || 0) / 5);

			if (Array.isArray(setup.WARDROBE_GROUPS)) {
				setup.WARDROBE_GROUPS.forEach(function (grp) {
					(grp.items || []).forEach(function (item) {
						if (item.beauty && s[item.var] === WORN) {
							total += item.beauty;
						}
					});
				});
			}

			if (Array.isArray(setup.piercingList)) {
				setup.piercingList.forEach(function (p) {
					if (p.beauty && s[p.var] === WORN) {
						total += p.beauty;
					}
				});
			}

			/* Tattoo catalogue is hardcoded in BeautySalonTattoos.tw
			   widget calls; mirror the +amounts here. */
			var TATTOOS = {
				tattooFace:  2, tattooNeck:  2, tattooHand: 1,
				tattooChest: 3, tattooPussy: 3, tattooAss:  3
			};
			Object.keys(TATTOOS).forEach(function (key) {
				if (s[key] === WORN) total += TATTOOS[key];
			});

			if (s.makeupApplied === true) {
				var tier = m.makeupImg;
				total += tier === 1 ? 5 : tier === 2 ? 10 : tier === 3 ? 15 : 0;
			}

			if (total < 0) total = 0;
			m.beautyModifier = total - (m.beautyBase || 0);
		},

		// --- Penalty (sleep / assault debuff flag) --------------
		isPenalized:    function () { return sv().isPenaltyOn === true; },
		setPenalized:   function (on) { sv().isPenaltyOn = !!on; },
		clearPenalty:   function () { sv().isPenaltyOn = false; },

		sensualBodyPart: function () { return sv().sensualBodyPart; },
		bodyPartSensitivity: function (part) {
			var bp = sv().sensualBodyPart;
			return bp ? (bp[part] || 0) : 0;
		},
		sensualBodyPartChoice: function () { return sv().sensualBodyPartChoice; },
		/* Stage the player's intro/guide pick. Setter only — the
		   commit (max-merge into the sensitivity map) runs separately
		   so a brand-new game shows every part at BASE_SENSITIVITY
		   until the player actually leaves the Guide screen. */
		stageSensualBodyPartChoice: function (part) {
			sv().sensualBodyPartChoice = part;
		},
		/* Commit a staged $sensualBodyPartChoice into the sensitivity
		   map. Max-merge so re-visiting Guide mid-game never nerfs a
		   part the player has already trained up. Called from
		   IntroController on leaving any of the CHOICE_PASSAGES. */
		commitSensualBodyPartChoice: function () {
			var s = sv();
			if (!s) return;
			var bp = s.sensualBodyPart;
			var c = s.sensualBodyPartChoice;
			if (!bp || typeof bp !== 'object') return;
			if (!setup.Intro || setup.Intro.BODY_PARTS.indexOf(c) === -1) return;
			var current = Number(bp[c]) || 0;
			if (current < setup.Intro.CHOSEN_SENSITIVITY) {
				bp[c] = setup.Intro.CHOSEN_SENSITIVITY;
			}
		},
		/* Lazy seed for very old saves / brand-new games where
		   SaveMigration hasn't run (no save loaded yet). Called from
		   TickController on every passage. */
		ensureSensualBodyParts: function () {
			var s = sv();
			if (!s.sensualBodyPart || typeof s.sensualBodyPart !== 'object') {
				s.sensualBodyPart = setup.Intro.defaultSensualBodyParts();
			}
			if (typeof s.sensualBodyPartChoice !== 'string' ||
				setup.Intro.BODY_PARTS.indexOf(s.sensualBodyPartChoice) === -1) {
				s.sensualBodyPartChoice = setup.Intro.defaultSensualBodyPartChoice();
			}
		},
		ensurePossession: function () {
			if (sv().mcpossession === undefined) { sv().mcpossession = 0; }
		},

		/* Persistent residue counter. Bumps once per possession outcome
		   (HuntOverProwl catch, HuntOverSanity collapse) and never decays.
		   Threshold prose in those passages gates on the returned count
		   crossing 1 / 3 / 7. Distinct from $mcpossession, which is a
		   per-scene surrender meter. */
		possessionResidue: function () { return sv().mc.possessionResidue || 0; },
		addPossessionResidue: function () {
			var cur = sv().mc.possessionResidue || 0;
			sv().mc.possessionResidue = cur + 1;
			return cur + 1;
		},

		// --- Earned-money accumulator (compound mutation) -------
		earn: function (n) {
			sv().mc.money += n;
			sv().earnedMoney += n;
			setup.Ledger.recordMoney(sv().mc.money);
		},

		// --- Inventory consumables: amount-aware mutators -------
		// consumeX = MC consumes the item and gets its effect.
		// removeX = the item is spent without an immediate MC benefit
		// (e.g. it's given to a companion).
		consumeEnergyDrink: function () {
			if (sv().energyDrinkAmount > 0) {
				sv().energyDrinkAmount -= 1;
				sv().mc.energy = Math.min(sv().mc.energyMax, sv().mc.energy + 3);
				setup.Ledger.recordEnergy(sv().mc.energy);
				return true;
			}
			return false;
		},
		// addMedicine / addSanityPills tolerate undefined so callers
		// don't have to bootstrap the counter on legacy saves.
		addMedicine:    function (n) { sv().medicineAmount    = (sv().medicineAmount    || 0) + n; },
		addSanityPills: function (n) {
			sv().sanityPillsAmount = (sv().sanityPillsAmount || 0) + n;
			if (n > 0) {
				var day = (setup.Time && setup.Time.dailySeed) ? setup.Time.dailySeed() : 0;
				setup.StoryEvents.emit(setup.StoryEvents.Event.SANITY_PILL_GAINED, { day: day });
			}
		},
		consumeMedicine: function () {
			if (sv().medicineAmount > 0) {
				sv().medicineAmount -= 1;
				sv().isPenaltyOn = false;
				return true;
			}
			return false;
		},
		removeSanityPill: function () {
			if (sv().sanityPillsAmount > 0) {
				sv().sanityPillsAmount -= 1;
				var day = (setup.Time && setup.Time.dailySeed) ? setup.Time.dailySeed() : 0;
				setup.StoryEvents.emit(setup.StoryEvents.Event.SANITY_PILL_USED, { day: day });
				return true;
			}
			return false;
		},
		consumeSanityPill: function () {
			if (!this.removeSanityPill()) return false;
			this.addSanity(30);
			return true;
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
			setup.Ledger.recordLust(sv().mc.lust);
		},

		// --- addSanity widget core --------------------------------
		// Applies a delta, clamps to [0, sanityMax]. Returns one of
		// setup.SanityDeltaResult: COLLAPSED if sanity hit 0 (caller
		// should jump to HuntOverSanity), CLAMPED if clamped to max,
		// NORMAL otherwise.
		addSanity: function (delta) {
			var R = setup.SanityDeltaResult;
			var m = sv().mc;
			m.sanity += delta;
			var result = R.NORMAL;
			if (m.sanity >= m.sanityMax) {
				m.sanity = m.sanityMax;
				result = R.CLAMPED;
			} else if (m.sanity < 0) {
				m.sanity = 0;
				result = R.COLLAPSED;
			}
			m.sanityUp = m.sanity.toFixed(2);
			setup.Ledger.recordSanity(m.sanity);
			return result;
		},

		// --- addEnergy widget core --------------------------------
		addEnergy: function (delta) {
			var m = sv().mc;
			m.energy += delta;
			if (m.energy >= m.energyMax) { m.energy = m.energyMax; }
			if (m.energy <= 0)           { m.energy = 0; }
			setup.Ledger.recordEnergy(m.energy);
		},

		// --- addLust widget core --------------------------------
		addLust: function (delta) {
			var m = sv().mc;
			m.lust += delta;
			if (m.lust >= m.lustMax) { m.lust = m.lustMax; }
			if (m.lust <= 0)         { m.lust = 0; }
			setup.Mc.clampLust();
		},
		/* Absolute lust write, clamped to [0, lustMax]. Used by the
		   per-tick choker floor and any caller that needs to pin lust
		   to a specific value rather than nudge it by a delta. */
		setLust: function (value) {
			var m = sv().mc;
			var v = Number(value) || 0;
			if (v < 0) v = 0;
			if (v > m.lustMax) v = m.lustMax;
			m.lust = v;
			setup.Ledger.recordLust(m.lust);
		},

		// --- addFit widget core -----------------------------------
		// Same shape as setup.Gym.applyFitnessGain, but the gym controller
		// imports this method so both widgets share logic.
		addFit: function (delta) {
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
		//
		// Per-part rules are a table: each row lists the sensitivity
		// keys to bump (and which piercing-sens var, if any, adds to
		// the bump) and which key's post-bump value is read back to
		// scale the lust delta.
		//
		// Tuning sensitivity formula: SENS_MULT should be between 0.9
		// and 0.1 for square-root behavior. With SENS_BASE = 0.2 and
		// SENS_MULT = 0.99 behavior is almost linear — adding 0.2 each
		// time for the first ~50 calls, tapering off near 20.
		addLustByPart: function (part, base) {
			var SENS_BASE = 0.2;
			var SENS_MULT = 0.99;
			var BODY_PART_RULES = {
				brain:  { bump: [['brain']],                                                             readback: 'brain'  },
				tits:   { bump: [['tits',   'piercingTitsAddSens']],                                     readback: 'tits'   },
				ass:    { bump: [['ass']],                                                               readback: 'ass'    },
				bottom: { bump: [['bottom'], ['ass'], ['pussy', 'piercingPussyAddSens'], ['anal']],      readback: 'bottom' },
				mouth:  { bump: [['mouth',  'piercingTongueAddSens']],                                   readback: 'mouth'  },
				pussy:  { bump: [['pussy',  'piercingPussyAddSens']],                                    readback: 'pussy'  },
				anal:   { bump: [['anal']],                                                              readback: 'anal'   }
			};

			var sv = State.variables;
			var rule = BODY_PART_RULES[part];
			if (!rule) return;

			var lustBase = (base !== undefined) ? base : 2;
			var bp = sv.sensualBodyPart || {};

			rule.bump.forEach(function (row) {
				var key = row[0];
				var extra = row[1] ? (sv[row[1]] || 0) : 0;
				bp[key] = SENS_MULT * (bp[key] || 0) + SENS_BASE + extra;
			});
			setup.Mc.addLust(lustBase + bp[rule.readback]);
		}
	};

	/* Trivial $mc.<field> accessors. Each row gets get/set/add/remove
	   with the conventional names; pass `false` to suppress one.
	   lust/sanity/energy/fit suppress the auto-generated add — the
	   clamped/cascade versions defined manually above are canonical. */
	setup.defineAccessors(api, function () { return sv().mc; }, [
		{ name: 'money', writeHook: function (_oldV, newV) {
			setup.Ledger.recordMoney(newV);
		} },
		/* sanityUp is the rounded display string the sidebar sanity
		   meter's label binds to ($mc.sanityUp). Every sanity mutation
		   re-stamps it so the number on the bar stays in sync with the
		   animated fill — without the hook, mid-passage refreshMeter
		   calls would leave the label frozen at the previous value.
		   Also mirrors the new live value into the ledger so cheat
		   detection stays in lockstep with any direct setSanity write. */
		{ name: 'sanity', add: false, writeHook: function (_oldV, newV) {
			sv().mc.sanityUp = Number(newV || 0).toFixed(2);
			setup.Ledger.recordSanity(newV);
		} },
		'sanityMax',
		'sanityUp',
		{ name: 'energy', add: false, writeHook: function (_oldV, newV) {
			setup.Ledger.recordEnergy(newV);
		} },
		'energyMax',
		'energyPoints',
		'corruption',
		{ name: 'lust', add: false, writeHook: function (_oldV, newV) {
			setup.Ledger.recordLust(newV);
		} },
		'name',
		{ name: 'fit', add: false },
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

	api.isSanityCollapsed = function () { return sv().sanityCollapse === true; };
	api.markSanityCollapsed = function () { sv().sanityCollapse = true; };
	api.clearSanityCollapse = function () { sv().sanityCollapse = false; };
	api.isExhausted = function () { return sv().exhausted === true; };
	api.markExhausted = function () { sv().exhausted = true; };
	api.clearExhausted = function () { sv().exhausted = false; };
	api.lustPct = function () { return sv().mc.lust / 100; };
	api.sanityPct = function () { return sv().mc.sanity / sv().mc.sanityMax; };
	api.energyPct = function () { return sv().mc.energy / sv().mc.energyMax; };
	return api;
})();

/* HUD lust meter for the MC. The 220px width is the wider sidebar
 * style; per-room search meters use 50% (registered in
 * ToolController). */
Meter.add('mclust', { label: '$mc.lust', width: '220px' }, 1);
