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
	/* $companion (the active-companion clone) and the per-companion
	   stat objects ($brook/$alice/$blake/$alex/$taylor/$casey) are
	   owned by this controller, so we read them directly via comp()
	   / State.variables. Anything else (player money/sanity-pills,
	   hours, hunt state, haunted-house flags, witch-quest flags)
	   goes through the owning controller's API. */
	/* Per-companion mutable state used to live in a forest of dynamically-
	   named top-level variables ($isCompChosen<Name>, $chanceToAttack<Name>,
	   $is<Name>GoingForHuntingAlone, $<key>ChooseOwaissa, $payForHuntAlone<Name>,
	   $chanceToSuccessAloneOwaissa<Name>, etc.). They've been moved onto the
	   per-companion stat object ($brook / $alice / $blake / $alex / $taylor /
	   $casey) so every dynamic key concatenation collapses to a normal field
	   read on whatever compFor(name) returns. api.migrateLegacyKeys (called
	   from SaveMigration) carries the legacy keys forward off old saves. */
	var OWNED_VARS = Object.freeze([
		'companion',
		'brook', 'alice', 'blake', 'alex', 'taylor', 'casey',
		'isCompChosen',
		'chosenPlan', 'chosenPlanActivated', 'chosenPlanActivatedTime',
		'chanceToSuccess',
		'chanceToAttack',
		'isCompRoomChosen', 'currentGhostPassage', 'filteredGhostPassages',
		'randomGhostPassage', 'showComp',
		'transFirstStage', 'transPicture', 'transStart',
		'aliceWorkDone',
		'meetAlice',
		'videoEventCompanion', 'randomPassageOwaissa'
	]);

	function comp()    { return State.variables.companion; }
	function compFor(name) { return State.variables[name.toLowerCase()]; }

	/* Generate per-companion stat accessors that all share the
	   `compFor(name) -> object[field]` shape. Each entry produces one
	   method on `api`:
	     { get: name, key: field, miss?: fallback }    one-arg getter
	     { set: name, key: field }                     two-arg setter
	     { is:  name, key: field, value: stage }       predicate
	*/
	function defineCompanionAccessors(api, spec) {
		spec.forEach(function (entry) {
			if (entry.get) {
				api[entry.get] = function (name) {
					var c = compFor(name);
					return c ? c[entry.key] : entry.miss;
				};
			}
			if (entry.set) {
				api[entry.set] = function (name, v) {
					var c = compFor(name);
					if (c) c[entry.key] = v;
				};
			}
			if (entry.is) {
				api[entry.is] = function (name) {
					var c = compFor(name);
					return !!(c && c[entry.key] === entry.value);
				};
			}
		});
	}

	var TRANS_NAMES = ["Alex", "Taylor", "Casey"];

	function isName(n) { var c = comp(); return c && c.name === n; }
	function isTrans(n) { return TRANS_NAMES.indexOf(n) !== -1; }

	// Pure data lives in CompanionData.js (loaded after this script
	// alphabetically). data() is the single accessor — every read goes
	// through it so callers don't need to remember which sub-table they
	// want.
	function data() { return setup.CompanionData; }

	function sanityCapForLevel(lvl) {
		var caps = data().sanityCapByLevel;
		if (typeof lvl !== 'number' || lvl < 1) return caps[0];
		if (lvl >= caps.length) return 0;
		return caps[lvl];
	}

	// Companion is a prototype-based class so per-companion behaviour
	// (image paths, clothing responses, walk-home eligibility) lives on
	// instances rather than as free functions. The mutable stats still
	// live on the existing $brook/... state objects; this class reads
	// through to them via `state()` so existing saves keep working.
	function Companion(cfg) {
		this.name          = cfg.name;
		this.key           = cfg.key;
		this.imageFolder   = cfg.imageFolder;
		this.imagePrefix   = cfg.imagePrefix;
		this.isTrans       = !!cfg.isTrans;
		this.canWalkHome   = cfg.canWalkHome !== false;
		this.hasExpSystem  = cfg.hasExpSystem !== false;
		this.pronObj       = cfg.pronObj;
		this.pronPos       = cfg.pronPos;
		this.neutralResp   = cfg.neutralResp;
		this.clothingTiers = cfg.clothingTiers;
		this.initStats     = cfg.initStats || {};
		this.eventCopy     = cfg.eventCopy || null;
	}

	// Fresh mutable stat object for a brand-new save. Merges the shared
	// base (cis or trans) with this companion's initStats overrides, plus
	// the name. Consumed by SaveMigration's DEFAULTS map so $brook/$alice/
	// ... get populated on load without each companion needing its own
	// {Name}Init passage.
	Companion.prototype.defaultState = function () {
		var base = this.isTrans ? data().transBaseStats : data().cisBaseStats;
		return Object.assign({ name: this.name }, base, this.initStats);
	};

	// Live mutable stat object — the same object the rest of the game
	// reads/writes via $brook, $alice, etc. Returning undefined is fine
	// before the companion's Init passage has run.
	Companion.prototype.state = function () {
		return State.variables[this.key];
	};

	// One of the five portrait files, keyed by the current attack chance.
	// data().baseChance → tier 1 (fully dressed); tierChances[i] → tier i+2.
	Companion.prototype.imagePath = function (chance) {
		var idx = data().tierChances.indexOf(chance);
		var tier = idx === -1 ? 1 : idx + 2;
		return "characters/" + this.imageFolder + "/" + this.imagePrefix + tier + ".png";
	};

	// Companion response for the currently-chosen attack chance. Returns
	// the neutral line when nothing has been asked yet (chance 25), else
	// the clothingTiers entry for that chance. $mc.name is interpolated
	// here because the widget outputs via <<=>>, which doesn't re-wikify.
	Companion.prototype.responseFor = function (chance) {
		var idx = data().tierChances.indexOf(chance);
		var raw = idx === -1 ? this.neutralResp : this.clothingTiers[idx].resp;
		return raw.replace(/\$mc\.name/g, setup.Mc.name() || "");
	};

	Companion.prototype.tierChance = function (idx) { return data().tierChances[idx]; };
	Companion.prototype.tierCount  = function ()    { return data().tierChances.length; };

	// CompanionEvent dialog markup for sanity tier (1..4). Cis companions
	// store their own eventCopy on the catalogue entry; trans companions
	// share data().transEventCopy. Tier-1 trans entry is a {pre, post}
	// pair selected by isTransFirstStageSet; everything else is a flat
	// string. Returns null if no copy is catalogued for the tier (no-op
	// in the widget). Wikification of $companion.name / $mc.name happens
	// at the call site via <<= ...>>.
	Companion.prototype.eventTextForTier = function (tier) {
		if (typeof tier !== 'number' || tier < 1 || tier > 4) return null;
		var entry = this.isTrans
			? (data().transEventCopy || [])[tier - 1]
			: (this.eventCopy || [])[tier - 1];
		if (!entry) return null;
		if (typeof entry === 'object' && entry.pre && entry.post) {
			return State.variables.transFirstStage === 1 ? entry.post : entry.pre;
		}
		return entry;
	};

	// Small thumbnail portrait (contacts list / inline companion links /
	// success banner). Cis companions have a single characters/{folder}/{prefix}.png;
	// trans companions rotate through characters/trans/{$transPicture}.jpg as the
	// hunt-event stages advance ($transPicture is set by markTransFirstStage()).
	Companion.prototype.portraitPath = function () {
		if (this.isTrans) {
			return "characters/trans/" + (State.variables.transPicture || 1) + ".jpg";
		}
		return "characters/" + this.imageFolder + "/" + this.imagePrefix + ".png";
	};

	// Lazy because setup.CompanionData is populated by a script that
	// loads after this one. companions() is called inside api methods
	// (game-time), by which point both scripts have run.
	var COMPANIONS = null;
	function companions() {
		if (!COMPANIONS) {
			COMPANIONS = data().config.map(function (cfg) { return new Companion(cfg); });
		}
		return COMPANIONS;
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

	function getByName(name) {
		var list = companions();
		for (var i = 0; i < list.length; i++) {
			if (list[i].name === name) return list[i];
		}
		return null;
	}

	var api = {
		OWNED_VARS: OWNED_VARS,
		// --- Catalogue -------------------------------------------
		list: function () { return companions(); },
		getByName: getByName,
		// The companion currently selected by the player, or null if
		// none. Mirrors setup.Ghosts.active() in shape; used by shared
		// widgets (sanityPills, companionMain) that need pronouns or
		// image paths without caring which companion is active.
		active: function () {
			var c = comp();
			return c ? getByName(c.name) : null;
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
		name: function () { var c = comp(); return c && c.name; },
		isTransCompanion: function () { return isTrans(this.name()); },
		isName: isName,

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
			var c = compFor(name);
			if (c) c.chosen = 1;
		},
		pickTransCompanion: function (name) {
			// Used by the Internet passage when choosing a trans companion
			// (Alex / Taylor / Casey). Clones the source NPC object onto
			// $companion, toggles the selection flags, and resets the
			// per-hunt trans-event bookkeeping.
			var s = State.variables;
			s.companion = clone(s[name.toLowerCase()]);
			this.selectCompanion(name);
			s.chosenPlan = 0;
			s.transStart = 0;
			s.transPicture = 0;
			delete s.transFirstStage;
		},

		// --- Sanity / lust tiers used by compEvent / *Help / Init -
		sanityTier: function () {
			var c = comp(); if (!c) return "none";
			var s = c.sanity;
			if (s >= 75) return "high";
			if (s >= 50) return "mid";
			if (s >= 25) return "low";
			return "critical";
		},
		isLustHigh: function () {
			var c = comp();
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
			var c = comp();
			return c && c.sanity < 100;
		},
		giveSanityPill: function () {
			if (!this.hasSanityPills() || !this.companionNeedsSanity()) return false;
			if (!setup.Mc.useSanityPill()) return false;
			var c = comp();
			c.sanity += 30;
			if (c.sanity > 100) c.sanity = 100;
			return true;
		},

		// --- Solo hunt --------------------------------------------
		canAffordSoloContract: function () {
			return setup.Mc.money() >= 20;
		},
		cannotAffordSoloContract: function () {
			return setup.Mc.money() < 20;
		},
		payForSoloContract: function (name) {
			var c = compFor(name);
			if (!c) return false;
			if (!c.paidForSolo && setup.Mc.money() >= 20) {
				setup.Mc.removeMoney(20);
				c.paidForSolo = 1;
				return true;
			}
			return false;
		},

		// --- Hunt-end cleanup (shared across huntEnd / HuntOver*) --
		/* Blake drops the cursed item on a bad hunt-end. */
		blakeDropsCursedItem: function () {
			return isName("Blake")
				&& State.variables.isCompChosen === 1
				&& setup.Witch.hasCursedItemToTurnIn();
		},
		clearBlakeCursedItem: function () {
			if (this.blakeDropsCursedItem()) setup.Witch.clearCursedItemHeld();
		},
		aliceResetsWork: function () {
			var alice = compFor('Alice');
			return isName("Alice") && alice && alice.goingSolo === 0;
		},
		resetAliceWorkIfNeeded: function () {
			if (this.aliceResetsWork()) State.variables.aliceWorkDone = 0;
		},
		resetHuntState: function () {
			var s = State.variables;
			s.chosenPlan = 0;
			s.chosenPlanActivated = 0;
			s.randomGhostPassage = 0;
			s.isCompRoomChosen = 0;
			s.showComp = setup.CompanionShow.HIDDEN;
			s.isCompChosen = 0;
		},

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
			var live = State.variables.companion;
			if (!live || typeof live.sanity !== 'number') return false;
			return live.sanity <= this.activeCompanionSanityCap();
		},

		// --- Street-passage "see your companion" test ------------
		companionAtStreet: function () {
			var s = State.variables;
			return s.isCompChosen === 1
				&& s.chosenPlan !== 'Plan1'
				&& s.chosenPlan !== 'Plan2'
				&& s.chosenPlan !== 'Plan3'
				&& s.chosenPlan !== 'Plan4';
		},

		// --- StoryCaption / HUD helpers ---------------------------
		shouldRenderMini: function () {
			var sc = State.variables.showComp;
			var CS = setup.CompanionShow;
			return sc === CS.VISIBLE || sc === CS.ATTACK_SAFE;
		},
		sanityPercent: function () {
			var c = comp();
			return c ? c.sanity / 100 : 0;
		},
		drainSanity: function (n) {
			var c = comp();
			if (c) { c.sanity -= n; }
		},
		addLust: function (n) {
			var c = comp();
			if (c) { c.lust += n; }
		},
		cheatSetLvl: function (key, lvl) {
			var obj = State.variables[key];
			if (obj) { obj.lvl = lvl; }
		},

		// --- Solo-hunt success chances --------------------------
		/* Roll & stash the per-street solo-hunt odds for the given
		   cis companion into the backing save-field names so the
		   link labels can still interpolate them. Called on Info
		   passage entry. The skill curve lives in CompanionData. */
		refreshSoloOdds: function (name) {
			var c = compFor(name);
			if (!c) return;
			var table = data().soloSkillCurve[name] || {};
			var lvl = c.lvl || 0;
			var tier = lvl >= 5 ? 5 : (lvl >= 4 ? 4 : (lvl >= 3 ? 3 : (lvl >= 2 ? 2 : 0)));
			var pair = table[tier] || [0, 0];
			c.soloChanceOwaissa = pair[0];
			c.soloChanceElm     = pair[1];
		},
		soloOdds: function (name, street) {
			var c = compFor(name);
			if (!c) return undefined;
			return street === 'Owaissa' ? c.soloChanceOwaissa : c.soloChanceElm;
		},

		// --- Pick companion for tonight's hunt ------------------
		// Clone the specified companion's stats onto $companion,
		// clear all other selection flags, reset chosenPlan and
		// per-companion solo-hunt bookkeeping.
		pickCisCompanion: function (name) {
			var s = State.variables;
			var c = compFor(name);
			if (!c) return;
			s.companion = clone(c);
			this.selectCompanion(name);
			s.chosenPlan = 0;
			c.goingSolo     = 0;
			c.chooseOwaissa = 0;
			c.chooseElm     = 0;
		},
		deselectCisCompanion: function (name) {
			var c = compFor(name);
			if (c) c.chosen = 0;
		},
		// Send the given companion solo to `street` (either
		// "Owaissa" or "Elm"). Clears the "joined" flag, stamps the
		// street-choice flag, marks the companion as solo-hunting, and
		// pays the 20$ solo-contract fee from $mc.money if not already
		// paid this run. Callers should gate on canAffordSoloContract()
		// for the warning path.
		sendCompanionSolo: function (name, street) {
			var c = compFor(name);
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
		setActiveLust: function (n) {
			var c = comp();
			if (c) c.lust = n;
		},
		/* Pick a video/image descriptor for the CompanionEvent
		   passage. Each companion has a 4-tier sanity ladder
		   (75+, 50–74, 25–49, 0–24); some tiers split further on
		   companion lust or recent-ElmBasement flag. Tables live in
		   CompanionData.eventMediaCis / .eventMediaTrans; this method
		   just picks the right tier and rolls. Returns
		   {src, type:"video"/"image"}. */
		pickEventMedia: function () {
			var c = comp(); if (!c) return null;
			var sanity = c.sanity;
			var lust   = c.lust;
			var inElm  = previous() === 'ElmBasement';
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
			if (!list || !list.length) return null;
			var pick = list[Math.floor(Math.random() * list.length)];
			State.variables.videoEventCompanion = pick.src;
			return pick;
		},

		/* Sanity-tier key for the CompanionEvent dispatcher: picks
		   which <<companionTextEventN>> variant + <<isCompanionContinue>>
		   threshold set applies. */
		eventSanityTier: function () {
			var s = (comp() || {}).sanity || 0;
			return s >= 75 ? 1 : s >= 50 ? 2 : s >= 25 ? 3 : s >= 1 ? 4 : 0;
		},
		/* Active companion's level (pre-clone, reading from
		   $<key>). Used by <<isCompanionContinue>> as the "lvl
		   check" arg; all trans companions are locked at 5. */
		activeCompanionLvl: function () {
			var c = comp(); if (!c) return 0;
			var src = compFor(c.name);
			return src ? src.lvl : 0;
		},

		/* Portrait path for CompanionSucceeded, by outcome. The
		   non-trans companions have dedicated -happy / -sad PNGs;
		   trans companions reuse the rotating $transPicture file. */
		/* Contacts.tw flags -- used on the MC's phone home screen
		   to gate the per-companion contact row. */
		hasMetBrook: function () { return setup.Library.hasMetBrook(); },
		hasMetAlice: function () { return State.variables.meetAlice !== undefined; },
		markMetAlice: function () { State.variables.meetAlice = 1; },
		blakeUnlocked: function () { return setup.Mall.blakeIsCompanionCandidate(); },
		aliceWorkDone: function () { return State.variables.aliceWorkDone === 1; },
		// (hasFinishedSoloHunt / soloHuntPaymentState fold into the
		// defineCompanionAccessors call at the bottom.)
		hasActiveCompanion: function () { return !!(State.variables.companion && State.variables.companion.name); },
		activeCompanionName: function () {
			var c = State.variables.companion;
			return c && c.name;
		},
		// (soloHuntChanceOwaissa / soloHuntChanceElm fold into the
		// defineCompanionAccessors call at the bottom.)
		setSoloHuntChances: function (name, owaissa, elm) {
			var c = compFor(name);
			if (!c) return;
			c.soloChanceOwaissa = owaissa;
			c.soloChanceElm     = elm;
		},
		/* Reset hunt plan/companion flags after a Myling event scares the
		   companion away mid-hunt. If Alice was the active companion and
		   she wasn't on a solo hunt, also clear her work-done flag. */
		resetHuntPlansAfterMyling: function () {
			var s = State.variables;
			s.chosenPlan = 0;
			s.chosenPlanActivated = 0;
			s.randomGhostPassage = 0;
			s.isCompRoomChosen = 0;
			s.showComp = setup.CompanionShow.HIDDEN;
			s.isCompChosen = 0;
			var alice = compFor('Alice');
			if (isName('Alice') && alice && alice.goingSolo === 0) {
				s.aliceWorkDone = 0;
			}
		},
		isBrookeCurrentlyUnavailable: function () {
			return setup.Home.brookePossessedCDLow();
		},

		/* When Plan2 succeeds with no cursed item in hand, roll a
		   random cursed-item type and flag it. Returns the rolled
		   item's info so the passage can render the image + speech.
		   Keyed by the existing $isCI<Type> save flags. The catalogue
		   of types lives in CompanionData. */
		rollFoundCursedItem: function () {
			var list = data().cursedItemTypes;
			var pick = list[Math.floor(Math.random() * list.length)];
			setup.Witch.setCursedItemFlag(pick.key);
			setup.Witch.setCursedItemHeld();
			return pick;
		},
		/* Random GWB evidence image (for Plan3 GWB result). Returns
		   "mechanics/gwb/<1..18>.jpg". */
		pickGwbImage: function () {
			return "mechanics/gwb/" + (Math.floor(Math.random() * 18) + 1) + ".jpg";
		},
		/* Pick a random evidence type id from the current hunt.
		   Used by the Plan3 "look for evidence" result. */
		pickRandomHuntEvidence: function () {
			var ev = setup.Ghosts.huntEvidence();
			if (!ev || !ev.length) return null;
			return ev[Math.floor(Math.random() * ev.length)];
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
			if (!rooms.length) return;
			State.variables.currentGhostPassage = current;
			State.variables.filteredGhostPassages = rooms;
			State.variables.randomGhostPassage = rooms[Math.floor(Math.random() * rooms.length)];
		},

		outcomePortrait: function (success) {
			var c = comp(); if (!c) return null;
			if (c.name === "Brook" || c.name === "Alice" || c.name === "Blake") {
				return "characters/" + c.name.toLowerCase() + "/" + c.name.toLowerCase() + (success ? "-happy" : "-sad") + ".png";
			}
			return "characters/trans/" + (State.variables.transPicture || 1) + ".jpg";
		},
		/* Completed-hunt cleanup: restore Plan1 / clear per-turn
		   hunt scratch flags. Used at the end of CompanionSucceeded. */
		acknowledgeCompanionResult: function () {
			var s = State.variables;
			s.chosenPlan = "Plan1";
			s.chosenPlanActivated = 0;
			s.randomPassageOwaissa = 0;
			s.showComp = setup.CompanionShow.VISIBLE;
			s.isCompRoomChosen = 0;
		},

		/* Pick the chosenPlan-N result: bank the plan id, grace
		   period, timer and success chance into save vars. */
		setHuntPlan: function (planKey, chancePct, minutes) {
			var s = State.variables;
			s.chosenPlan = planKey;
			s.chanceToSuccess = chancePct;
			s.showComp = setup.CompanionShow.HIDDEN;
			s.chosenPlanActivated = 1;
			s.chosenPlanActivatedTime = setup.Time.totalMinutes() + (minutes || 0);
		},
		setStayTogetherPlan: function () {
			var s = State.variables;
			s.chosenPlan = "Plan1";
			s.showComp = setup.CompanionShow.VISIBLE;
			s.chosenPlanActivated = 0;
		},
		/* Ghost-encounter chance for the active companion. Persists
		   on $<key>.chanceToAttack with a top-level $chanceToAttack
		   mirror that the tick handler reads (see TickController). */
		chanceToAttack: function () {
			var c = comp();
			if (!c) return State.variables.chanceToAttack;
			var stats = compFor(c.name);
			return stats ? stats.chanceToAttack : State.variables.chanceToAttack;
		},
		ensureChanceToAttack: function () {
			var c = comp();
			if (!c) return;
			var stats = compFor(c.name);
			if (stats && stats.chanceToAttack === undefined) {
				stats.chanceToAttack = 25;
			}
		},
		setChanceToAttack: function (n) {
			var c = comp();
			if (c) {
				var stats = compFor(c.name);
				if (stats) stats.chanceToAttack = n;
			}
			State.variables.chanceToAttack = n;
		},

		/* Companion "help" event side-effects: zero lust, bank a
		   small sanity top-up. Shared across Alice/Blake/Brook
		   Help passages. */
		helpEventEaseActive: function () {
			var c = comp();
			if (!c) return;
			c.lust = 0;
			c.sanity += 2;
		},

		/* Reset the "paid" flag + solo-hunt-in-progress flag when
		   the player queries the HuntEndAlone passage (which runs
		   the next morning). Called on entry to *HuntEndAlone. */
		acknowledgeSoloHuntEnd: function (name) {
			var c = compFor(name);
			if (!c) return;
			c.paidForSolo = 0;
			c.goingSolo   = 0;
		},
		/* Which street did this companion solo-hunt on? companionChoseOwaissa
		   and companionChoseElm fold into the defineCompanionAccessors call
		   at the bottom. Used to key into the success-chance table. */
		/* Clear the per-companion Owaissa/Elm choice flags. Called
		   at the end of HuntEndAlone after the result is narrated. */
		clearSoloHuntStreet: function (name) {
			var c = compFor(name);
			if (!c) return;
			c.chooseOwaissa = 0;
			c.chooseElm     = 0;
		},
		/* Pay out the solo-hunt reward to $mc.money. Owaissa hunts
		   pay $50, Elm hunts pay $100. Called from *HuntEndAlone
		   when the success roll lands. */
		payoutSoloHunt: function (name) {
			var reward = this.companionChoseElm(name) ? 100 : 50;
			setup.Mc.addMoney(reward);
			return reward;
		},
		isCompanionPossessed: function (name) {
			if (name === 'Brook') { return setup.Library.brookIsPossessed(); }
			return false;
		},
		/* Midnight rollover: any cis companion mid-solo-hunt (goingSolo === 1)
		   ticks to "finished" (goingSolo === 2) so the next morning's
		   *HuntEndAlone passage runs. Called from setup.Tick.resetCooldowns. */
		advanceSoloHuntsAtMidnight: function () {
			['Brook', 'Alice', 'Blake'].forEach(function (name) {
				var c = compFor(name);
				if (c && c.goingSolo === 1) c.goingSolo = 2;
			});
		},

		// --- Companion stat object getter ------------------------
		// Return the mutable state object for a companion by their
		// name key ("alex" / "taylor" / "casey" / "brook" / ...).
		// Used by passages that render a companion card without
		// knowing which companion is currently active (e.g. the
		// Internet trans-companion picker).
		stateFor: function (nameKey) {
			return State.variables[nameKey];
		},

		// --- Active-companion HUD / event helpers ----------------
		decreaseSanity: function () {
			var c = comp();
			return c ? c.decreaseSanity : 0;
		},
		lust: function () {
			var c = comp();
			return c ? c.lust : 0;
		},
		sanity: function () {
			var c = comp();
			return c ? c.sanity : 0;
		},
		lvl: function () {
			var c = comp();
			return c ? c.lvl : 0;
		},
		/* For a given companion slot (key = "brook" / "alice" / "blake")
		   is the companion at the max level 5? Used by the companionExp
		   widget to short-circuit xp gain. */
		isAtMaxLvl: function (name) {
			var obj = compFor(name);
			return obj && obj.lvl >= 5;
		},
		/* Add exp to a specific companion by name (used by the shared
		   companionExp widget). Does nothing if the target is maxed out. */
		grantExpTo: function (name, amount) {
			var obj = compFor(name);
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
			var c = comp();
			if (!c) return;
			c.sanity -= c.decreaseSanity;
			c.lust   += this.eventLustGain();
		},
		/* Per-name bookkeeping called from the shared
		   <<companionTextEvent>> dispatcher: for a trans companion,
		   stamp the transFirstStage flag and set transPicture to the
		   matching portrait index. */
		markTransFirstStage: function () {
			var c = comp();
			if (!c) return;
			var idx = { Alex: 1, Taylor: 2, Casey: 3 }[c.name];
			if (!idx) return;
			State.variables.transFirstStage = 1;
			State.variables.transPicture = idx;
		},
		isTransByName: function (n) { return isTrans(n); },

		// --- isCompanionContinue flow (widgetFriends) ---------
		/* When the companion decides to continue: reset the per-hunt
		   scratch flags so the normal hunt tick can resume. */
		resumeHunt: function () {
			var s = State.variables;
			s.chosenPlanActivated = 0;
			s.randomGhostPassage = 0;
			s.showComp = setup.CompanionShow.VISIBLE;
			s.isCompRoomChosen = 0;
		},
		/* "Continue alone" path: clears showComp + isCompChosen as
		   well so the companion is no longer tagged as active. */
		dismissCompanion: function () {
			var s = State.variables;
			s.showComp = setup.CompanionShow.HIDDEN;
			s.isCompChosen = 0;
			s.chosenPlan = 0;
		}
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
	// companion's mutable state object via compFor(name) and reads
	// or writes a single field; folded here so the wrapper bodies
	// don't have to repeat the null-check / fallback boilerplate.
	defineCompanionAccessors(api, [
		{ get: 'companionLvl',           key: 'lvl',                miss: 0 },
		{ get: 'companionExp',           key: 'exp',                miss: 0 },
		{ get: 'companionExpForNextLvl', key: 'expForNextLvl',      miss: 0 },
		{ get: 'soloHuntChanceOwaissa',  key: 'soloChanceOwaissa' },
		{ get: 'soloHuntChanceElm',      key: 'soloChanceElm' },
		{ get: 'soloHuntPaymentState',   key: 'paidForSolo' },
		{ is:  'hasFinishedSoloHunt',    key: 'goingSolo',     value: 2 },
		{ is:  'companionChoseOwaissa',  key: 'chooseOwaissa', value: 1 },
		{ is:  'companionChoseElm',      key: 'chooseElm',     value: 1 }
	]);
	return api;
})();

/* HUD meters for the active companion's sanity / lust shown in the
 * sidebar while a companion is on a hunt with the MC. */
Meter.add('companionsanity', { label: '$companion.sanity', width: '100%' }, 1);
Meter.add('companionlust',   { label: '$companion.lust',   width: '100%' }, 1);
