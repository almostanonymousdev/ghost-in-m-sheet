// Centralized state queries and mutations for the companion system
// (Brook, Alice, Blake, Alex, Taylor, Casey). Passages should call
// into setup.Companion instead of testing the underlying companion
// $variables directly.

/* Discrete states for $showComp — drives which footer card the
   companion HUD renders (HIDDEN = no card, VISIBLE = normal card,
   ATTACK_FAILED = question-mark "go check on them" card,
   ATTACK_SAFE = success-link card). */
setup.CompanionShow = Object.freeze({
	HIDDEN:        0,
	VISIBLE:       1,
	ATTACK_FAILED: 2,
	ATTACK_SAFE:   3
});

setup.Companion = (function () {
	var CS = setup.CompanionShow;

	/* Hunt-plan lifecycle: each named transition writes a fixed subset
	   of {chosenPlan, chosenPlanActivated, randomGhostPassage,
	   isCompRoomChosen, showComp, isCompChosen} plus a couple of
	   resolve-only mop-up fields. Public methods like resetHuntState
	   / dismissCompanion / resumeHunt / setStayTogetherPlan are
	   one-line wrappers over applyTransition so the field-write
	   matrix lives in one place and is diff-friendly when a new
	   transition needs to nudge one of the same fields. STAY_TOGETHER
	   and RESOLVE both land on Plan1; the difference is RESOLVE also
	   stamps the Owaissa-passage scratch flag clear after a successful
	   mission. START_PLAN takes the planKey / chance / timer through
	   the `extra` arg since those vary per call. */
	var KNOWN_PLANS = Object.freeze(['Plan1', 'Plan2', 'Plan3', 'Plan4']);
	var TRANSITIONS = {
		reset:        { chosenPlan: 0,       chosenPlanActivated: 0, randomGhostPassage: 0,
		                isCompRoomChosen: 0, showComp: CS.HIDDEN,    isCompChosen: 0 },
		dismiss:      { chosenPlan: 0,                                                       showComp: CS.HIDDEN, isCompChosen: 0 },
		resume:       { chosenPlanActivated: 0, randomGhostPassage: 0,
		                isCompRoomChosen: 0,    showComp: CS.VISIBLE },
		resolve:      { chosenPlan: 'Plan1', chosenPlanActivated: 0, randomPassageOwaissa: 0,
		                isCompRoomChosen: 0, showComp: CS.VISIBLE },
		stayTogether: { chosenPlan: 'Plan1', chosenPlanActivated: 0, showComp: CS.VISIBLE },
		startPlan:    { chosenPlanActivated: 1, showComp: CS.HIDDEN }
	};

	function applyTransition(name, extra) {
		var spec = TRANSITIONS[name];
		if (!spec) return;
		var s = State.variables;
		Object.keys(spec).forEach(function (k) { s[k] = spec[k]; });
		if (extra) Object.keys(extra).forEach(function (k) { s[k] = extra[k]; });
	}

	/* $companion is a one-field marker { name } pointing at whichever
	   per-companion stat object ($brook/$alice/$blake/$alex/$taylor/
	   $casey) is currently active. The stat objects themselves are
	   the single source of truth for sanity/lust/chanceToAttack/...
	   api.activeState() resolves the marker to that backing object,
	   so reads and writes never diverge between a clone and the
	   source. (The clone shape was retired in SAVE_VERSION 6; the
	   migration ports old saves' clone fields back onto the backing
	   stat object.) Anything else (player money/sanity-pills, hours,
	   hunt state, haunted-house flags, witch-quest flags) goes
	   through the owning controller's API. */
	/* Per-companion mutable state used to live in a forest of dynamically-
	   named top-level variables ($isCompChosen<Name>, $chanceToAttack<Name>,
	   $is<Name>GoingForHuntingAlone, $<key>ChooseOwaissa, $payForHuntAlone<Name>,
	   $chanceToSuccessAloneOwaissa<Name>, etc.). They've been moved onto the
	   per-companion stat object ($brook / $alice / $blake / $alex / $taylor /
	   $casey) so every dynamic key concatenation collapses to a normal field
	   read on whatever api.stateFor(name) returns. api.migrateLegacyKeys (called
	   from SaveMigration) carries the legacy keys forward off old saves. */
	var OWNED_VARS = Object.freeze([
		'companion',
		'brook', 'alice', 'blake', 'alex', 'taylor', 'casey',
		'isCompChosen',
		'chosenPlan', 'chosenPlanActivated', 'chosenPlanActivatedTime',
		'chanceToSuccess',
		'chanceToAttack',
		'isCompRoomChosen', 'randomGhostPassage', 'showComp',
		'transFirstStage', 'transPicture', 'transStart',
		'aliceWorkDone',
		'meetAlice',
		'videoEventCompanion', 'randomPassageOwaissa'
	]);

	/* Generate per-companion stat accessors that all share the
	   `api.stateFor(name) -> object[field]` shape. Each entry produces
	   one method on `api`:
	     { get: name, key: field, miss?: fallback }    one-arg getter
	     { set: name, key: field }                     two-arg setter
	     { is:  name, key: field, value: stage }       predicate
	     { writes: name, sets: { k1: v1, k2: v2 } }    one-arg bulk-write of constants
	*/
	function defineCompanionAccessors(api, spec) {
		spec.forEach(function (entry) {
			if (entry.get) {
				api[entry.get] = function (name) {
					var c = api.stateFor(name);
					return c ? c[entry.key] : entry.miss;
				};
			}
			if (entry.set) {
				api[entry.set] = function (name, v) {
					var c = api.stateFor(name);
					if (c) c[entry.key] = v;
				};
			}
			if (entry.is) {
				api[entry.is] = function (name) {
					var c = api.stateFor(name);
					return !!(c && c[entry.key] === entry.value);
				};
			}
			if (entry.writes) {
				var keys = Object.keys(entry.sets);
				api[entry.writes] = function (name) {
					var c = api.stateFor(name);
					if (!c) return;
					for (var i = 0; i < keys.length; i++) c[keys[i]] = entry.sets[keys[i]];
				};
			}
		});
	}

	/* Same idea as defineCompanionAccessors but each method targets the
	   active companion (api.activeState()) instead of a passed-in name:
	     { get: name, key: field, miss?: fallback }     zero-arg getter
	     { set: name, key: field }                      one-arg setter
	     { add: name, key: field, sign?: 1|-1 }         one-arg additive mutator
	*/
	function defineActiveAccessors(api, spec) {
		spec.forEach(function (entry) {
			if (entry.get) {
				api[entry.get] = function () {
					var c = api.activeState();
					return c ? c[entry.key] : entry.miss;
				};
			}
			if (entry.set) {
				api[entry.set] = function (v) {
					var c = api.activeState();
					if (c) c[entry.key] = v;
				};
			}
			if (entry.add) {
				api[entry.add] = function (n) {
					var c = api.activeState();
					if (c) c[entry.key] += entry.sign === -1 ? -n : n;
				};
			}
		});
	}

	// Pure data lives in CompanionData.js (loaded after this script
	// alphabetically). data() is the single accessor — every read goes
	// through it so callers don't need to remember which sub-table they
	// want.
	function data() { return setup.CompanionData; }

	// The Companion class + the roster live in CompanionCatalogue.js so
	// per-companion behaviour (image paths, clothing responses, walk-home
	// eligibility, contact-row hooks) is separable from the controller's
	// state-mutation surface. Both lazy because CompanionCatalogue.js
	// loads before this file (alphabetical), but its accessors read
	// through setup.CompanionData which loads after.
	function companions() { return setup.CompanionCatalogue.all(); }
	function getByName(name) { return setup.CompanionCatalogue.getByName(name); }

	function sanityCapForLevel(lvl) {
		var caps = data().sanityCapByLevel;
		if (typeof lvl !== 'number' || lvl < 1) return caps[0];
		if (lvl >= caps.length) return 0;
		return caps[lvl];
	}

	function transVids(base, dir, maxIndex) {
		var out = [];
		for (var i = 0; i <= maxIndex; i++) {
			out.push({type:"video",src:"characters/trans/"+dir+"/"+base+"."+i+".mp4"});
		}
		return out;
	}
	function transStills(name, firstStage) {
		if (firstStage) {
			return [{type:"image",src:"characters/trans/"+name+"4.png"},{type:"image",src:"characters/trans/"+name+"5.png"}];
		}
		return [{type:"image",src:"characters/trans/"+name+"1.png"},{type:"image",src:"characters/trans/"+name+"2.png"},{type:"image",src:"characters/trans/"+name+"3.png"}];
	}

	// Resolve the tier entry to a concrete list. A bare array passes
	// through; a {default, inElm?, lustHigh?} bundle picks based on the
	// runtime flags (inElm wins over lustHigh when both are set, which
	// matches the original branching).
	function resolveCisTier(entry, lust, inElm) {
		if (Array.isArray(entry)) return entry;
		if (!entry) return null;
		if (inElm && entry.inElm) return entry.inElm;
		if (lust >= 50 && entry.lustHigh) return entry.lustHigh;
		return entry.default || null;
	}

	var api = {
		OWNED_VARS: OWNED_VARS,
		// --- Catalogue -------------------------------------------
		list: function () { return companions(); },
		getByName: getByName,
		// The mutable stat object for the active companion (the
		// per-companion stat row $brook / $alice / $blake / $alex /
		// $taylor / $casey, resolved through the $companion marker),
		// or undefined if none. Carries .name, .sanity, .lust,
		// .decreaseSanity, etc.
		activeState: function () {
			var marker = State.variables.companion;
			if (!marker || !marker.name) return undefined;
			return this.stateFor(marker.name);
		},
		// The mutable per-companion stat object ($brook / $alice /
		// $blake / $alex / $taylor / $casey) by name (any case).
		// Same object activeState() returns when this name is active.
		stateFor: function (name) {
			if (!name) return undefined;
			return State.variables[String(name).toLowerCase()];
		},
		// The companion currently selected by the player, or null if
		// none. Mirrors setup.Ghosts.active() in shape; used by shared
		// widgets (sanityPills, companionMain) that need pronouns or
		// image paths without caring which companion is active.
		active: function () {
			var marker = State.variables.companion;
			return marker && marker.name ? getByName(marker.name) : null;
		},
		// Fresh stat object for a named companion. Used by SaveMigration
		// to seed $brook/$alice/$blake/$alex/$taylor/$casey on new games
		// and old saves that predate the companion's introduction.
		defaultStateFor: function (name) {
			var c = getByName(name);
			return c ? c.defaultState() : null;
		},

		/* Per-companion flags formerly stored as a forest of dynamically-
		   named top-level vars ($isCompChosen<Name>,
		   $is<Name>GoingForHuntingAlone, $payForHuntAlone<Name>,
		   $<key>Choose<Street>, $chanceToAttack<Name>,
		   $chanceToSuccessAlone<Street><Name>) now live on the per-
		   companion stat object. Carry whatever the old save had forward
		   so existing players don't lose their solo-hunt progress, then
		   strip the legacy keys. Called from SaveMigration.applyDefaults
		   so this controller owns the full save-shape story for companions. */
		migrateLegacyKeys: function (vars) {
			if (!vars || typeof vars !== 'object') return;
			companions().forEach(function (c) {
				var stats = vars[c.key];
				if (!stats || typeof stats !== 'object') return;
				var legacy = {
					chosen:            'isCompChosen' + c.name,
					chanceToAttack:    'chanceToAttack' + c.name,
					goingSolo:         'is' + c.name + 'GoingForHuntingAlone',
					paidForSolo:       'payForHuntAlone' + c.name,
					chooseOwaissa:     c.key + 'ChooseOwaissa',
					chooseElm:         c.key + 'ChooseElm',
					soloChanceOwaissa: 'chanceToSuccessAloneOwaissa' + c.name,
					soloChanceElm:     'chanceToSuccessAloneElm' + c.name
				};
				Object.keys(legacy).forEach(function (newKey) {
					var oldKey = legacy[newKey];
					if (stats[newKey] === undefined && vars[oldKey] !== undefined) {
						stats[newKey] = vars[oldKey];
					}
					delete vars[oldKey];
				});
			});
		},

		// --- Identity --------------------------------------------
		name: function () { var c = this.activeState(); return c && c.name; },
		isTransCompanion: function () { var c = this.active(); return !!(c && c.isTrans); },
		isTransByName:    function (n) { var c = getByName(n); return !!(c && c.isTrans); },
		isName: function (n) { return this.name() === n; },

		// --- Selection ("chosen" flag on each $<key> stat object) --
		anyCompanionSelected: function () {
			var list = companions();
			for (var i = 0; i < list.length; i++) {
				var stats = list[i].state();
				if (stats && stats.chosen === 1) return true;
			}
			return false;
		},
		clearCompanionSelection: function () {
			companions().forEach(function (c) {
				var stats = c.state();
				if (stats) stats.chosen = 0;
			});
		},
		selectCompanion: function (name) {
			this.clearCompanionSelection();
			var c = this.stateFor(name);
			if (c) c.chosen = 1;
		},
		// Stamp the $companion marker onto `name` and reset the
		// per-hunt scratch fields (sanity, lust, chanceToAttack +
		// any solo/trans bookkeeping) on the backing stat object so
		// a fresh hunt always starts from full sanity / no lust.
		// Returns true if the companion was found; false otherwise.
		pick: function (name) {
			var c = getByName(name);
			var stats = this.stateFor(name);
			if (!c || !stats) return false;
			var s = State.variables;
			s.companion = { name: c.name };
			this.selectCompanion(c.name);
			s.chosenPlan = 0;
			stats.sanity         = 100;
			stats.lust           = 0;
			stats.chanceToAttack = 25;
			if (c.isTrans) {
				s.transStart   = 0;
				s.transPicture = 0;
				delete s.transFirstStage;
			} else {
				stats.goingSolo     = 0;
				stats.chooseOwaissa = 0;
				stats.chooseElm     = 0;
			}
			return true;
		},
		pickTransCompanion: function (name) {
			// Internet passage entrypoint for Alex / Taylor / Casey.
			// Thin shim over pick() so the call sites read intent.
			this.pick(name);
		},

		// --- Sanity / lust tiers used by compEvent / *Help / Init -
		sanityTier: function () {
			var c = this.activeState(); if (!c) return "none";
			var s = c.sanity;
			if (s >= 75) return "high";
			if (s >= 50) return "mid";
			if (s >= 25) return "low";
			return "critical";
		},
		isLustHigh: function () {
			var c = this.activeState();
			return c && c.lust >= 50;
		},

		// --- Walk-home eligibility --------------------------------
		hasBottomWorn: function () {
			return setup.Wardrobe.worn(setup.WardrobeSlot.JEANS)
				|| setup.Wardrobe.worn(setup.WardrobeSlot.SKIRT)
				|| setup.Wardrobe.worn(setup.WardrobeSlot.SHORTS);
		},
		canWalkHomeWithCompanion: function () {
			return this.hasBottomWorn();
		},

		// --- Hunt plans -------------------------------------------
		cursedItemQuestUnlocked: function () {
			return setup.Witch.cursedItemQuestStarted();
		},
		hasCursedItem: function () {
			return setup.Witch.hasCursedItemToTurnIn();
		},

		// --- Sanity pills -----------------------------------------
		hasSanityPills: function () {
			return (setup.Mc.sanityPillsAmount() || 0) >= 1;
		},
		companionNeedsSanity: function () {
			var c = this.activeState();
			return c && c.sanity < 100;
		},
		giveSanityPill: function () {
			if (!this.hasSanityPills() || !this.companionNeedsSanity()) return false;
			if (!setup.Mc.useSanityPill()) return false;
			var c = this.activeState();
			c.sanity += 30;
			if (c.sanity > 100) c.sanity = 100;
			return true;
		},

		// --- Solo hunt --------------------------------------------
		canAffordSoloContract: function () {
			return setup.Mc.money() >= data().soloContractFee;
		},
		cannotAffordSoloContract: function () {
			return setup.Mc.money() < data().soloContractFee;
		},
		payForSoloContract: function (name) {
			var c = this.stateFor(name);
			if (!c) return false;
			var fee = data().soloContractFee;
			if (!c.paidForSolo && setup.Mc.money() >= fee) {
				setup.Mc.removeMoney(fee);
				c.paidForSolo = 1;
				return true;
			}
			return false;
		},

		// --- Hunt-end cleanup (shared across huntEnd / HuntOver*) --
		/* Run the active companion's onHuntFail hook (no-op when no
		   companion is active). Each catalogue entry decides what
		   "I was active when the hunt ended badly" means -- Blake
		   drops her cursed item, Alice clears her work-done flag,
		   etc. Callers stack this with resetHuntState() which clears
		   the plan/showComp/isCompChosen flags afterwards. */
		runHuntFailHooks: function () {
			var c = this.active();
			if (c) c.onHuntFail();
		},
		resetHuntState: function () { applyTransition('reset'); },

		// --- House / room / street helpers -----------------------
		/* True when the active hunt is companion-eligible. Procedural
		   runs are eligible by default; static-plan houses opt in or
		   out via the catalogue's allowsCompanions flag. Catalogue-
		   driven so adding a new house never touches this predicate. */
		inHauntedHouseLocation: function () {
			return !!(setup.HuntController && setup.HuntController.huntAllowsCompanions());
		},
		/* Called from HuntStart when the player has a companion picked.
		   Flags the companion as actively joining the run, and if no
		   specific plan was chosen yet, defaults to "stick together"
		   (Plan1 + HUD card visible) so the companion follows the MC
		   into the haunt and the in-hunt card is available for later
		   reassignment. Plans the player already picked (Plan2..Plan4)
		   are preserved. No-op when no companion is selected or the
		   hunt opts out of companions. */
		autoAttachOnHuntStart: function () {
			if (!this.hasActiveCompanion()) return false;
			if (!setup.HuntController || !setup.HuntController.huntAllowsCompanions()) return false;
			this.markCompanionFlagActive();
			var plan = State.variables.chosenPlan;
			var picked = plan === 'Plan1' || plan === 'Plan2'
				|| plan === 'Plan3' || plan === 'Plan4';
			if (!picked) this.setStayTogetherPlan();
			return true;
		},
		canShowCompanionMiniPanel: function () {
			return State.variables.chosenPlan !== undefined
				&& setup.Ghosts.isHunting()
				&& this.inHauntedHouseLocation();
		},

		// --- Per-tick progression (called from PassageDone) -------
		/* For each cis companion (hasExpSystem true) with stat object on
		   $<key>, roll any banked exp into level-ups while lvl < 5, then
		   refresh maxSanityCap from the new level. Trans companions are
		   already at lvl 5 with no exp track and use a flat 0 cap. */
		tickAllCompanionProgression: function () {
			companions().forEach(function (c) {
				if (!c.hasExpSystem) return;
				var stats = c.state();
				if (!stats) return;
				while (stats.lvl < 5 && stats.exp >= stats.expForNextLvl) {
					stats.exp -= stats.expForNextLvl;
					stats.lvl += 1;
					stats.expForNextLvl = 20 + stats.lvl * 20;
				}
				stats.maxSanityCap = sanityCapForLevel(stats.lvl);
			});
		},
		sanityCapForLevel: sanityCapForLevel,
		/* Sanity cap that triggers "companion leaves" mid-event. Cis
		   companions key off their own lvl; trans companions tolerate
		   any non-zero sanity. */
		activeCompanionSanityCap: function () {
			var c = this.active();
			if (!c) return 0;
			if (!c.hasExpSystem) return 0;
			var stats = c.state();
			return stats ? sanityCapForLevel(stats.lvl) : 0;
		},
		activeCompanionShouldLeave: function () {
			var c = this.active();
			if (!c) return false;
			var live = this.activeState();
			if (!live || typeof live.sanity !== 'number') return false;
			return live.sanity <= this.activeCompanionSanityCap();
		},

		// --- Street-passage "see your companion" test ------------
		/* True when a companion is attached but their hunt-plan has
		   already been cleared (eg. after a Myling event reset, or
		   before a plan is picked) -- visually they're "out on the
		   street" rather than off on a Plan2-4 task. */
		companionAtStreet: function () {
			var s = State.variables;
			return s.isCompChosen === 1 && KNOWN_PLANS.indexOf(s.chosenPlan) === -1;
		},

		// --- StoryCaption / HUD helpers ---------------------------
		shouldRenderMini: function () {
			var sc = State.variables.showComp;
			var CS = setup.CompanionShow;
			return sc === CS.VISIBLE || sc === CS.ATTACK_SAFE;
		},
		sanityPercent: function () { return this.sanity() / 100; },
		cheatSetLvl: function (key, lvl) {
			var obj = this.stateFor(key);
			if (obj) { obj.lvl = lvl; }
		},

		// --- Solo-hunt success chances --------------------------
		/* Roll & stash the per-street solo-hunt odds for the given
		   cis companion into the backing save-field names so the
		   link labels can still interpolate them. Called on Info
		   passage entry. The skill curve lives in CompanionData. */
		refreshSoloOdds: function (name) {
			var c = this.stateFor(name);
			if (!c) return;
			var table = data().soloSkillCurve[name] || {};
			var lvl = c.lvl || 0;
			var tier = lvl >= 5 ? 5 : (lvl >= 4 ? 4 : (lvl >= 3 ? 3 : (lvl >= 2 ? 2 : 0)));
			var pair = table[tier] || [0, 0];
			c.soloChanceOwaissa = pair[0];
			c.soloChanceElm     = pair[1];
		},
		soloOdds: function (name, street) {
			var c = this.stateFor(name);
			if (!c) return undefined;
			return street === 'Owaissa' ? c.soloChanceOwaissa : c.soloChanceElm;
		},

		// --- Pick companion for tonight's hunt ------------------
		// Library / Mall entrypoints for Brook / Alice / Blake. Thin
		// shims over pick() so the call sites read intent.
		pickCisCompanion: function (name) { this.pick(name); },
		deselectCisCompanion: function (name) {
			var c = this.stateFor(name);
			if (c) c.chosen = 0;
		},
		// Send the given companion solo to `street` (either
		// "Owaissa" or "Elm"). Clears the "joined" flag, stamps the
		// street-choice flag, marks the companion as solo-hunting, and
		// pays the 20$ solo-contract fee from $mc.money if not already
		// paid this run. Callers should gate on canAffordSoloContract()
		// for the warning path.
		sendCompanionSolo: function (name, street) {
			var c = this.stateFor(name);
			if (!c) return;
			c.chosen        = 0;
			c.chooseOwaissa = (street === 'Owaissa') ? 1 : 0;
			c.chooseElm     = (street === 'Elm') ? 1 : 0;
			c.goingSolo     = 1;
			this.payForSoloContract(name);
		},

		// --- Per-companion state accessors ----------------------
		// (companionLvl / companionExp / companionExpForNextLvl fold
		// into the defineCompanionAccessors call at the bottom.)
		isCompanionFlagActive: function () { return State.variables.isCompChosen === 1; },
		markCompanionFlagActive: function () { State.variables.isCompChosen = 1; },
		/* Pick a video/image descriptor for the CompanionEvent
		   passage. Each companion has a 4-tier sanity ladder
		   (75+, 50–74, 25–49, 0–24); some tiers split further on
		   companion lust or recent-ElmBasement flag. Tables live in
		   CompanionData.eventMediaCis / .eventMediaTrans; this method
		   just picks the right tier and rolls. Returns
		   {src, type:"video"/"image"}.
		   `inElm` defaults to `previous() === 'ElmBasement'` so the in-
		   passage call site (CompanionEvent.tw) doesn't need to pass it,
		   but unit/e2e specs can pin it explicitly without faking the
		   passage history. */
		pickEventMedia: function (inElm) {
			var c = this.activeState(); if (!c) return null;
			if (inElm === undefined) inElm = previous() === 'ElmBasement';
			var sanity = c.sanity;
			var lust   = c.lust;
			var tierKey = sanity >= 75 ? "high"
				: sanity >= 50 ? "mid"
				: sanity >= 25 ? "low"
				: "crit";
			var d = data();
			var list = null;
			if (d.eventMediaCis[c.name]) {
				list = resolveCisTier(d.eventMediaCis[c.name][tierKey], lust, inElm);
			} else if (d.eventMediaTrans[c.name]) {
				var cfg = d.eventMediaTrans[c.name];
				if (tierKey === "high") {
					list = transStills(cfg.name, this.isTransFirstStageSet());
				} else if (tierKey === "mid") {
					list = transVids(cfg.idx, "tease", 9);
				} else if (tierKey === "low") {
					list = transVids(cfg.idx, "bj", cfg.bjMax);
				} else {
					list = transVids(cfg.idx, "sex", cfg.critMax);
				}
			}
			var pick = setup.Rng.pickFrom(list);
			if (!pick) return null;
			State.variables.videoEventCompanion = pick.src;
			return pick;
		},

		/* Sanity-tier key for the CompanionEvent dispatcher: picks
		   which <<companionTextEventN>> variant + <<isCompanionContinue>>
		   threshold set applies. */
		eventSanityTier: function () {
			var s = (this.activeState() || {}).sanity || 0;
			return s >= 75 ? 1 : s >= 50 ? 2 : s >= 25 ? 3 : s >= 1 ? 4 : 0;
		},

		/* Portrait path for CompanionSucceeded, by outcome. The
		   non-trans companions have dedicated -happy / -sad PNGs;
		   trans companions reuse the rotating $transPicture file. */
		/* Contacts.tw flags -- used on the MC's phone home screen
		   to gate the per-companion contact row. Catalogue hooks own
		   the per-companion logic; these are generic dispatchers. */
		hasMet:        function (name) { var c = getByName(name); return c ? c.hasMet() : false; },
		markMet:       function (name) { var c = getByName(name); if (c) c.markMet(); },
		isPossessed:   function (name) { var c = getByName(name); return c ? c.isPossessed() : false; },
		isUnavailable: function (name) { var c = getByName(name); return c ? c.isUnavailable() : false; },
		blakeUnlocked: function () { return setup.Mall.blakeIsCompanionCandidate(); },
		aliceWorkDone: function () { return State.variables.aliceWorkDone === 1; },
		// (hasFinishedSoloHunt / soloHuntPaymentState fold into the
		// defineCompanionAccessors call at the bottom.)
		hasActiveCompanion: function () { var c = this.activeState(); return !!(c && c.name); },
		activeCompanionName: function () {
			var c = this.activeState();
			return c && c.name;
		},
		// (soloHuntChanceOwaissa / soloHuntChanceElm fold into the
		// defineCompanionAccessors call at the bottom.)
		setSoloHuntChances: function (name, owaissa, elm) {
			var c = this.stateFor(name);
			if (!c) return;
			c.soloChanceOwaissa = owaissa;
			c.soloChanceElm     = elm;
		},
		/* Reset hunt plan/companion flags after a Myling event scares the
		   companion away mid-hunt. The active companion's onHuntFail hook
		   takes care of any per-companion bookkeeping (Alice resetting
		   workDone, etc.). */
		resetHuntPlansAfterMyling: function () {
			this.runHuntFailHooks();
			applyTransition('reset');
		},

		/* When Plan2 succeeds with no cursed item in hand, roll a
		   random cursed-item type and flag it. Returns the rolled
		   item's info so the passage can render the image + speech.
		   Keyed by the existing $isCI<Type> save flags. The catalogue
		   of types lives in CompanionData. */
		rollFoundCursedItem: function () {
			var pick = setup.Rng.pickFrom(data().cursedItemTypes);
			if (!pick) return null;
			setup.Witch.setCursedItemFlag(pick.key);
			setup.Witch.setCursedItemHeld();
			return pick;
		},
		/* Random GWB evidence image (for Plan3 GWB result). Returns
		   "mechanics/gwb/<1..18>.jpg". */
		pickGwbImage: function () {
			return "mechanics/gwb/" + setup.Rng.intInclusive(1, 18) + ".jpg";
		},
		/* Pick a random evidence type id from the current hunt.
		   Used by the Plan3 "look for evidence" result. Prefer the
		   post-modifier $run.evidence pool — Fog of War can splice one
		   of the catalogue evidences out, so the run pool can be a
		   subset of the catalogue list. Falls back to the catalogue's
		   raw evidence list (huntEvidence reads the same $run field
		   but returns [] when no run is active). */
		pickRandomHuntEvidence: function () {
			var ev = null;
			if (setup.HuntController
				&& typeof setup.HuntController.isActive === "function"
				&& setup.HuntController.isActive()) {
				ev = setup.HuntController.runEvidence();
			}
			if (!ev || !ev.length) ev = setup.Ghosts.huntEvidence();
			return setup.Rng.pickFrom(ev);
		},

		/* Pick a hunt room id for the companion to wander into.
		   Stamps $randomGhostPassage with the picked room id so the
		   next-tick "is the MC there yet?" check in TickController
		   can fire the CompanionEvent. Excludes the current room.
		   Tags $isCompRoomChosen as 1 so a given hunt step only
		   resolves once. */
		pickRandomCompanionRoomFromContext: function () {
			this.pickRandomCompanionRoom();
		},
		pickRandomCompanionRoom: function () {
			if (State.variables.isCompRoomChosen === 1) return;
			State.variables.isCompRoomChosen = 1;
			if (!setup.HuntController) return;
			var run = setup.HuntController.active();
			if (!run || !run.floorplan) return;
			var current = setup.HuntController.currentRoomId();
			var rooms = run.floorplan.rooms
				.map(function (r) { return r.id; })
				.filter(function (id) { return id !== current; });
			var pick = setup.Rng.pickFrom(rooms);
			if (!pick) return;
			State.variables.randomGhostPassage = pick;
		},

		outcomePortrait: function (success) {
			var c = this.active();
			return c ? c.outcomePortrait(success) : null;
		},
		/* Completed-hunt cleanup: restore Plan1 / clear per-turn
		   hunt scratch flags. Used at the end of CompanionSucceeded. */
		acknowledgeCompanionResult: function () { applyTransition('resolve'); },

		/* Pick the chosenPlan-N result: bank the plan id, grace
		   period, timer and success chance into save vars. */
		setHuntPlan: function (planKey, chancePct, minutes) {
			applyTransition('startPlan', {
				chosenPlan: planKey,
				chanceToSuccess: chancePct,
				chosenPlanActivatedTime: setup.Time.totalMinutes() + (minutes || 0)
			});
		},
		setStayTogetherPlan: function () { applyTransition('stayTogether'); },
		/* Ghost-encounter chance for the active companion. Persists on
		   $<key>.chanceToAttack. The 25 fallback covers the brief window
		   before a freshly-picked companion has had ensureChanceToAttack
		   run for them. */
		chanceToAttack: function () {
			var c = this.activeState();
			return c && c.chanceToAttack !== undefined ? c.chanceToAttack : 25;
		},
		ensureChanceToAttack: function () {
			var c = this.activeState();
			if (c && c.chanceToAttack === undefined) c.chanceToAttack = 25;
		},
		setChanceToAttack: function (n) {
			var c = this.activeState();
			if (c) c.chanceToAttack = n;
		},

		/* Companion "help" event side-effects: zero lust, bank a
		   small sanity top-up. Shared across Alice/Blake/Brook
		   Help passages. */
		helpEventEaseActive: function () {
			var c = this.activeState();
			if (!c) return;
			c.lust = 0;
			c.sanity += 2;
		},

		/* acknowledgeSoloHuntEnd (paid/goingSolo reset on the morning-after
		   HuntEndAlone) and clearSoloHuntStreet (Owaissa/Elm choice reset
		   after narration) fold into the defineCompanionAccessors `writes`
		   spec at the bottom. companionChoseOwaissa / companionChoseElm
		   predicates fold into the same call. */
		/* Pay out the solo-hunt reward to $mc.money. Per-street figures
		   live in data().soloRewards. Called from *HuntEndAlone when the
		   success roll lands. */
		payoutSoloHunt: function (name) {
			var street = this.companionChoseElm(name) ? 'Elm' : 'Owaissa';
			var reward = data().soloRewards[street];
			setup.Mc.addMoney(reward);
			return reward;
		},
		/* Midnight rollover: any companion mid-solo-hunt (goingSolo === 1)
		   ticks to "finished" (goingSolo === 2) so the next morning's
		   *HuntEndAlone passage runs. Iterates every catalogue entry
		   with an exp system (the ones that can do solo contracts). */
		advanceSoloHuntsAtMidnight: function () {
			companions().forEach(function (c) {
				if (!c.hasExpSystem) return;
				var stats = c.state();
				if (stats && stats.goingSolo === 1) stats.goingSolo = 2;
			});
		},

		// --- Active-companion HUD / event helpers ----------------
		// (sanity / lust / lvl / decreaseSanity / setActiveLust / addLust /
		// drainSanity fold into the defineActiveAccessors call at the
		// bottom. lvl() is the canonical active-companion level reader --
		// callers used to also reach activeCompanionLvl() for the same
		// thing.)
		/* For a given companion slot (key = "brook" / "alice" / "blake")
		   is the companion at the max level 5? Used by the companionExp
		   widget to short-circuit xp gain. */
		isAtMaxLvl: function (name) {
			var obj = this.stateFor(name);
			return obj && obj.lvl >= 5;
		},
		/* Add exp to a specific companion by name (used by the shared
		   companionExp widget). Does nothing if the target is maxed out. */
		grantExpTo: function (name, amount) {
			var obj = this.stateFor(name);
			if (!obj || obj.lvl >= 5) return;
			obj.exp += amount;
		},

		// --- Trans-companion first-encounter bookkeeping ----------
		// $transFirstStage gates the companionTextEvent* dispatcher: on
		// the initial trigger it sets to 1 so the follow-up text plays
		// the "post-change" variant. $transPicture records which of the
		// three trans portraits to render (1 Alex / 2 Taylor / 3 Casey).
		isTransFirstStageSet: function () { return State.variables.transFirstStage === 1; },
		/* Lust gain applied to the active companion when a CompanionEvent
		   fires. Scales with the per-hunt step count so longer hunts
		   build up arousal faster. The widgets call eventLustGain() for
		   display and applyEventStatDeltas() to mutate state — both
		   read this single source so they can't drift. */
		eventLustGain: function () { return setup.Tick.stepCount() * 3; },

		/* Apply the standard "$companion.sanity/lust change" side-effects
		   from the shared companionTextEvent widgets. */
		applyEventStatDeltas: function () {
			var c = this.activeState();
			if (!c) return;
			c.sanity -= c.decreaseSanity;
			c.lust   += this.eventLustGain();
		},
		/* Per-name bookkeeping called from the shared
		   <<companionTextEvent>> dispatcher: for a trans companion,
		   stamp the transFirstStage flag and set transPicture to the
		   catalogue-defined portrait index. */
		markTransFirstStage: function () {
			var c = this.active();
			if (!c || !c.portraitIndex) return;
			State.variables.transFirstStage = 1;
			State.variables.transPicture = c.portraitIndex;
		},

		// --- isCompanionContinue flow (widgetFriends) ---------
		/* When the companion decides to continue: reset the per-hunt
		   scratch flags so the normal hunt tick can resume. */
		resumeHunt: function () { applyTransition('resume'); },
		/* "Continue alone" path: clears showComp + isCompChosen as
		   well so the companion is no longer tagged as active. */
		dismissCompanion: function () { applyTransition('dismiss'); }
	};

	// Pure $variable passthrough accessors. Read-only fields use
	// `set: false`; setTransFirstStage is paired with the semantic
	// isTransFirstStageSet getter, so only the setter folds.
	setup.defineAccessors(api, function () { return State.variables; }, [
		'chosenPlan',
		'transPicture',
		{ name: 'aliceWorkState',     key: 'aliceWorkDone' },
		{ name: 'chanceToSuccess',    set: false },
		{ name: 'showComp',           set: false },
		{ name: 'transFirstStage',    get: false, set: 'setTransFirstStage' }
	]);
	// Per-companion stat accessors. Each call resolves the target
	// companion's mutable state object via api.stateFor(name) and reads
	// or writes a single field (or, for `writes`, a fixed set of
	// constants); folded here so the wrapper bodies don't have to
	// repeat the null-check / fallback boilerplate.
	defineCompanionAccessors(api, [
		{ get: 'companionLvl',           key: 'lvl',                miss: 0 },
		{ get: 'companionExp',           key: 'exp',                miss: 0 },
		{ get: 'companionExpForNextLvl', key: 'expForNextLvl',      miss: 0 },
		{ get: 'soloHuntChanceOwaissa',  key: 'soloChanceOwaissa' },
		{ get: 'soloHuntChanceElm',      key: 'soloChanceElm' },
		{ get: 'soloHuntPaymentState',   key: 'paidForSolo' },
		{ is:  'hasFinishedSoloHunt',    key: 'goingSolo',     value: 2 },
		{ is:  'companionChoseOwaissa',  key: 'chooseOwaissa', value: 1 },
		{ is:  'companionChoseElm',      key: 'chooseElm',     value: 1 },
		{ writes: 'acknowledgeSoloHuntEnd',  sets: { paidForSolo: 0, goingSolo: 0 } },
		{ writes: 'clearSoloHuntStreet',     sets: { chooseOwaissa: 0, chooseElm: 0 } }
	]);
	// Active-companion accessors. Bound against api.activeState() so the
	// fallback / null-check is one place instead of one per method body.
	defineActiveAccessors(api, [
		{ get: 'sanity',         key: 'sanity',         miss: 0 },
		{ get: 'lust',           key: 'lust',           miss: 0 },
		{ get: 'lvl',            key: 'lvl',            miss: 0 },
		{ get: 'decreaseSanity', key: 'decreaseSanity', miss: 0 },
		{ set: 'setActiveLust',  key: 'lust' },
		{ add: 'addLust',        key: 'lust' },
		{ add: 'drainSanity',    key: 'sanity', sign: -1 }
	]);
	return api;
})();

/* HUD meters for the active companion's sanity / lust shown in the
 * sidebar while a companion is on a hunt with the MC. Labels are
 * wikified every refresh (Chapel meters call .wiki(label) per tick),
 * so the <<= ...>> macros resolve through the active companion's
 * source-of-truth stat row. */
Meter.add('companionsanity', { label: '<<= setup.Companion.sanity()>>', width: '100%' }, 1);
Meter.add('companionlust',   { label: '<<= setup.Companion.lust()>>',   width: '100%' }, 1);
