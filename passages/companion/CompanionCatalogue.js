// Companion catalogue: the Companion class + the in-memory roster
// built from setup.CompanionData.config. Loads before CompanionController
// (alphabetical) so the controller can reference setup.CompanionCatalogue
// when assembling its facade. All Companion-prototype methods read
// setup.CompanionData lazily, since CompanionData.js loads after this
// file -- by the time any catalogue method runs (game-time), every
// script has been evaluated.

setup.CompanionCatalogue = (function () {
	function data() { return setup.CompanionData; }

	// Resolve a tier entry (array or {default, inElm?, lustHigh?} bundle)
	// to a concrete list. inElm wins over lustHigh when both are set.
	function resolveTier(entry, lust, inElm) {
		if (Array.isArray(entry)) return entry;
		if (!entry) return null;
		if (inElm && entry.inElm) return entry.inElm;
		if (lust >= 50 && entry.lustHigh) return entry.lustHigh;
		return entry.default || null;
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
		this.canWalkHome   = cfg.canWalkHome !== false;
		this.hasExpSystem  = cfg.hasExpSystem !== false;
		this.pronObj       = cfg.pronObj;
		this.pronPos       = cfg.pronPos;
		this.neutralResp   = cfg.neutralResp;
		this.clothingTiers = cfg.clothingTiers;
		this.initStats     = cfg.initStats || {};
		// Per-street solo-hunt odds keyed by companion level (2..5+). Each
		// entry is a [owaissaPct, elmPct] pair. Empty object falls back to
		// 0%/0% in soloOddsFor below, which is what we want for any level
		// the curve doesn't catalogue.
		this.soloSkillCurve = cfg.soloSkillCurve || {};
		this.eventCopy     = cfg.eventCopy || null;
		// CompanionEvent media: tier table keyed by high/mid/low/crit.
		this.eventMedia    = cfg.eventMedia || null;
		// Generic-dispatch slots. Per-companion passages own the actual
		// content (text + media); the generic CompanionHelp /
		// CompanionHuntEndAlone / Contacts / WalkHomeTogether / Phone
		// dispatchers look these up via the active companion. Null means
		// "no scene of that kind for this companion" (eg. Brook has no
		// home-continue follow-up after the walk-home).
		this.helpPassage         = cfg.helpPassage         || null;
		this.huntEndAlonePassage = cfg.huntEndAlonePassage || null;
		this.infoPassage         = cfg.infoPassage         || null;
		this.walkHomePassage     = cfg.walkHomePassage     || null;
		this.homeContinuePassage = cfg.homeContinuePassage || null;
		this.huntOverPassage     = cfg.huntOverPassage     || null;
		this.spiritEventPassage  = cfg.spiritEventPassage  || null;
		// Phone / Contacts row metadata. Default to "unlocked, no special
		// states" so a freshly-added catalogue entry shows up
		// immediately. Each per-companion hint is just a string.
		this.contactsLockedHint = cfg.contactsLockedHint || "";
		this.possessedHint      = cfg.possessedHint      || "";
		this.withRainHint       = cfg.withRainHint       || "";
		this.isUnlocked  = cfg.isUnlocked  || function () { return true; };
		this.canText     = cfg.canText     || function () { return true; };
		this.isWithRain  = cfg.isWithRain  || function () { return false; };
		// Hunt-time / possession catalogue-driven predicates. Default
		// no-op so callers can fire them across the whole roster without
		// branching: only the companion that owns the behaviour actually
		// does anything when it runs.
		this.activatePossessionOnHuntTool = cfg.activatePossessionOnHuntTool || function () {};
		this.triggersPossessionCursedItem = cfg.triggersPossessionCursedItem === true;
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
	// base with this companion's initStats overrides, plus the name.
	// Consumed by SaveMigration's DEFAULTS map so $brook/$alice/... get
	// populated on load without each companion needing its own
	// {Name}Init passage.
	Companion.prototype.defaultState = function () {
		return Object.assign({ name: this.name }, data().baseStats, this.initStats);
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

	// Per-street solo-hunt odds for a given companion level. Buckets lvl
	// into the catalogue's [2,3,4,5+] tiers; lvl < 2 returns [0, 0].
	Companion.prototype.soloOddsFor = function (lvl) {
		var l = lvl || 0;
		var tier = l >= 5 ? 5 : (l >= 4 ? 4 : (l >= 3 ? 3 : (l >= 2 ? 2 : 0)));
		return this.soloSkillCurve[tier] || [0, 0];
	};

	// CompanionEvent media list for a sanity tier ('high' / 'mid' / 'low' /
	// 'crit'). Resolves the per-companion tier table through resolveTier
	// (lust + ElmBasement variants). ctx is {lust, inElm}. Returns null
	// when no media is catalogued for the (companion, tier) pair.
	Companion.prototype.pickEventMediaList = function (tierKey, ctx) {
		ctx = ctx || {};
		if (this.eventMedia) {
			return resolveTier(this.eventMedia[tierKey], ctx.lust || 0, !!ctx.inElm);
		}
		return null;
	};

	// CompanionEvent dialog markup for sanity tier (1..4). The per-companion
	// eventCopy lives on the catalogue entry. Returns null if no copy is
	// catalogued for the tier (no-op in the widget). Wikification of
	// $companion.name / $mc.name happens at the call site via <<= ...>>.
	Companion.prototype.eventTextForTier = function (tier) {
		if (typeof tier !== 'number' || tier < 1 || tier > 4) return null;
		return (this.eventCopy || [])[tier - 1] || null;
	};

	// Small thumbnail portrait (contacts list / inline companion links /
	// success banner). A single characters/{folder}/{prefix}.png per
	// companion.
	Companion.prototype.portraitPath = function () {
		return "characters/" + this.imageFolder + "/" + this.imagePrefix + ".png";
	};

	// Hunt-result portrait shown by CompanionSucceeded — dedicated
	// -happy / -sad PNGs alongside the companion's folder.
	Companion.prototype.outcomePortrait = function (success) {
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
