// Companion catalogue: the Companion class + the in-memory roster
// built from setup.CompanionData.config. Loads before CompanionController
// (alphabetical) so the controller can reference setup.CompanionCatalogue
// when assembling its facade. All Companion-prototype methods read
// setup.CompanionData lazily, since CompanionData.js loads after this
// file -- by the time any catalogue method runs (game-time), every
// script has been evaluated.

setup.CompanionCatalogue = (function () {
	function data() { return setup.CompanionData; }

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
		// Trans companions stamp this index onto $transPicture when they
		// become the active companion (see setup.Companion.markTransFirstStage).
		this.portraitIndex = cfg.portraitIndex || 0;
		// Per-companion hooks. Defaults make every companion "available
		// and uneventful"; catalogue entries override the ones they own.
		// onHuntFail runs only for the active companion at hunt-end (see
		// setup.Companion.runHuntFailHooks) so each hook can assume "I
		// was active."
		this.hasMet        = cfg.hasMet        || function () { return true; };
		this.markMet       = cfg.markMet       || function () {};
		this.isPossessed   = cfg.isPossessed   || function () { return false; };
		this.isUnavailable = cfg.isUnavailable || function () { return false; };
		this.onHuntFail    = cfg.onHuntFail    || function () {};
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

	// Live mutable stat object -- the same object the rest of the game
	// reads/writes via $brook, $alice, etc. Returning undefined is fine
	// before the companion's Init passage has run.
	Companion.prototype.state = function () {
		return State.variables[this.key];
	};

	// One of the five portrait files, keyed by the current attack chance.
	// data().baseChance -> tier 1 (fully dressed); tierChances[i] -> tier i+2.
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

	// Hunt-result portrait shown by CompanionSucceeded. Cis companions
	// have dedicated -happy / -sad PNGs alongside their folder; trans
	// companions reuse the rotating $transPicture file.
	Companion.prototype.outcomePortrait = function (success) {
		if (this.isTrans) {
			return "characters/trans/" + (State.variables.transPicture || 1) + ".jpg";
		}
		return "characters/" + this.imageFolder + "/" + this.imagePrefix
			+ (success ? "-happy" : "-sad") + ".png";
	};

	// Lazy because setup.CompanionData is populated by a script that
	// loads after this one. all() is called inside setup.Companion methods
	// at game-time, by which point both scripts have run.
	var COMPANIONS = null;
	function all() {
		if (!COMPANIONS) {
			COMPANIONS = data().config.map(function (cfg) { return new Companion(cfg); });
		}
		return COMPANIONS;
	}

	function getByName(name) {
		var list = all();
		for (var i = 0; i < list.length; i++) {
			if (list[i].name === name) return list[i];
		}
		return null;
	}

	return { Companion: Companion, all: all, getByName: getByName };
})();
