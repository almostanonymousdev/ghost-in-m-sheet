/*
 * Centralized state queries for the haunting event passages.
 * Passages should call into setup.Events instead of testing the
 * underlying $variables directly, so the conditions live in one place.
 */
setup.Events = (function () {
	var sv = setup.sv;

	/* Variables owned by this controller. Other controllers should
	   query these only through the API methods below. */
	var OWNED_VARS = Object.freeze([
		'argForRandomizer', 'videoEvent',
		'ghostSanityEventDecreased', 'decreasingSanity', 'cleanedUp',
		'chanceToAttractFailed',
		'sanityIfHot', 'sanityInTheDark'
	]);

	// Room metadata (passage name → { stateKey, light/dark URLs,
	// body class }) lives in setup.Styles. isDarkRoom() and
	// turnOffLightHere() below delegate to that single source.

	// --- Per-tier per-tick body-part event chance (private) ------
	// Index 0 is unused; tiers 1-7 map to the per-tick % chance a
	// body-part event fires. Tier is now time-driven (see
	// eventTier) so the chance naturally ramps up as the hunt
	// progresses: at the start the ghost can only mess with the
	// MC's mind (tier 1, 4%); by the late hours every body part
	// is on the table and events fire ~12% per tick.
	var sanityThresholds = [0, 4, 5, 6, 7, 8, 10, 12];

	// Minutes of elapsed hunt time per tier step. Hunts run from
	// midnight (totalMinutes = 0) to hour 6 = 360 minutes, so 50
	// minutes per tier gives a 1→7 sweep over the full hunt window.
	var MINUTES_PER_TIER = 50;

	/* Typed key constants. Mirroring setup.Hunt.Event: lookups throw
	   on unknown keys so a typo surfaces at the call site instead of
	   silently returning undefined / []. Callers may reference these
	   instead of bare strings. */
	var EventKey = Object.freeze({
		BRAIN:  'brain',
		TITS:   'tits',
		ASS:    'ass',
		BOTTOM: 'bottom',
		MOUTH:  'mouth',
		PUSSY:  'pussy',
		ANAL:   'anal'
	});

	var ClothingKey = Object.freeze({
		JEANS:     'jeans',
		JEANS_NP:  'jeansNP',
		SHORTS:    'shorts',
		SKIRT:     'skirt',
		SKIRT_NP:  'skirtNP',
		PANTIES:   'panties',
		NAKED:     'naked',
		TSHIRT:    'tshirt',
		TSHIRT_NB: 'tshirtNB',
		BRA:       'bra',
		NO_BRA:    'noBra',
		PRISON:    'prison',
		MIND:      'mind'
	});

	var CthulionTier = Object.freeze({ S1: 1, S2: 2, S3: 3, COMPANION: 4 });

	var EVENT_KEY_SET    = Object.freeze(Object.keys(EventKey).reduce(function (s, k) { s[EventKey[k]] = true; return s; }, {}));
	var CLOTHING_KEY_SET = Object.freeze(Object.keys(ClothingKey).reduce(function (s, k) { s[ClothingKey[k]] = true; return s; }, {}));

	function assertKnownKey(key, validSet, label) {
		if (!validSet[key]) {
			throw new Error('setup.Events: unknown ' + label + ' "' + key + '"');
		}
	}

	// Body-part keys in escalation order (event numbers 1-7).
	var bodyPartKeys = [
		EventKey.BRAIN, EventKey.TITS, EventKey.ASS, EventKey.BOTTOM,
		EventKey.MOUTH, EventKey.PUSSY, EventKey.ANAL
	];

	function pickRandom(arr) {
		if (!arr || !arr.length) return null;
		return arr[Math.floor(Math.random() * arr.length)];
	}

	// Cthulion ability video pools, keyed by tier (1-4). Tiers 1-3
	// are sanity-banded (used by SaveEventPassage); tier 4 is used by
	// the companion-help passages (BlakeHelp, BrookHelp). Tier 0 is
	// the "no Cthulion this sanity band" sentinel.
	var CTHULION_RANGES = { 1: 7, 2: 5, 3: 8, 4: 10 };
	function cthulionVideos(tier) {
		if (tier === 0) return [];
		var n = CTHULION_RANGES[tier];
		if (!n) throw new Error('setup.Events: unknown Cthulion tier "' + tier + '"');
		var out = [];
		for (var i = 0; i < n; i++) {
			out.push("characters/ghosts/cthulion/" + tier + "." + i + ".mp4");
		}
		return out;
	}
	function cthulionTierForSanity(sanity) {
		if (sanity >= 50) return 1;
		if (sanity >= 30) return 2;
		if (sanity >= 1)  return 3;
		return 0;
	}

	// Video tables live in :: EventVideos (setup.EventVideos and
	// setup.BansheeVideos).

	return {
		OWNED_VARS: OWNED_VARS,
		EventKey: EventKey,
		ClothingKey: ClothingKey,
		CthulionTier: CthulionTier,
		// --- Companion state -------------------------------------
		hasCompanionOnPlan1: function () {
			return setup.Companion.isCompanionFlagActive() && setup.Companion.chosenPlan() === 'Plan1';
		},
		companionIsAroused: function () {
			return setup.Companion.lust() >= 60;
		},
		companionIs: function (name) {
			return setup.Companion.name() === name;
		},
		companionIsInlineFriend: function () {
			var n = setup.Companion.name();
			return n === 'Alex' || n === 'Taylor' || n === 'Casey';
		},

		// --- Dark-room filter (delegates to setup.Styles) --------
		isDarkRoom: function (passageName) {
			return setup.Styles.isDarkRoom(passageName);
		},
		turnOffLightHere: function () {
			return setup.Styles.turnOffLightHere();
		},
		/* :: LightPassageGhost entry: 1-in-65 chance per tick that a
		   light-capable ghost activates EMF and darkens the room.
		   Returns the destination passage to <<goto>>, or null.
		   EMF only arms when a lit hunt room was actually flipped to
		   dark — otherwise the player saw no in-world cause for the
		   reading and the window appeared to open on its own. */
		maybeTurnOffLights: function () {
			var g = setup.Ghosts.active();
			if (!g || !g.canTurnOffLights) return null;
			if (Math.floor(Math.random() * 65) !== 0) return null;
			var dest = this.turnOffLightHere();
			if (!dest) return null;
			setup.activateTool("emf");
			return dest;
		},

		// --- Event escalation tier -------------------------------
		// Time is the primary driver: the longer the hunt has been
		// running, the more body parts the ghost can target.
		// lust/corruption/beauty layer a small (<= +2 tier) bump on
		// top so the player's state still nudges escalation without
		// drowning out the time signal. Outside a hunt the tier
		// floors at 1 (mind only) — body-part rolls are only ever
		// called from hunt event passages so this just keeps the
		// off-hunt fallback well-defined.
		elapsedHuntMinutes: function () {
			if (!setup.HuntController || !setup.HuntController.isHuntActive
				|| !setup.HuntController.isHuntActive()) return 0;
			return (setup.Time && setup.Time.totalMinutes)
				? setup.Time.totalMinutes() : 0;
		},
		statTierBonus: function () {
			var lustW   = Math.min(1, (setup.Mc.lust()       || 0) / 100);
			var corrW   = Math.min(1, (setup.Mc.corruption() || 0) / 8);
			var beautyW = Math.min(1, (setup.Mc.beauty()     || 0) / 100);
			// Sum is 0-3 across the three axes; (sum * 2 / 3) maps
			// 1 maxed → 0, 2 maxed → 1, 3 maxed → 2.
			return Math.min(2, Math.floor((lustW + corrW + beautyW) * 2 / 3));
		},
		eventTier: function () {
			var base = Math.floor(this.elapsedHuntMinutes() / MINUTES_PER_TIER) + 1;
			if (base < 1) base = 1;
			var tier = base + this.statTierBonus();
			if (tier > 7) tier = 7;
			return tier;
		},

		// --- Corruption tiers ------------------------------------
		corruptionTier: function () {
			var c = setup.Mc.corruption();
			if (c >= 8) return 8;
			if (c >= 6) return 6;
			if (c >= 4) return 4;
			if (c >= 3) return 3;
			if (c >= 2) return 2;
			if (c >= 1) return 1;
			return 0;
		},

		// --- MC energy / escape ----------------------------------
		hasEnergyToRunAway: function () {
			return setup.Mc.energy() >= 1;
		},

		// --- Event randomizer helpers ----------------------------

		/* Set up common event state and mark the per-tick "event
		   already fired" flag so search-tool chains skip
		   StealClothesEvent / CheckHuntStart for the rest of the
		   passage. The flag is per-passage temp state — SugarCube
		   resets State.temporary on every passage navigation, and
		   PassageDone defensively resets it again. */
		initEvent: function (eventKey) {
			assertKnownKey(eventKey, EVENT_KEY_SET, 'event key');
			sv().argForRandomizer = eventKey;
			this.markEventTriggered();
		},

		/* Per-tick "event already fired" flag, owned by setup.Events
		   so passages don't share a leaky `_eventTriggered` temp var
		   directly. Backed by State.temporary so it resets between
		   passages without ceremony. */
		eventTriggered:      function () { return State.temporary.eventTriggered === true; },
		markEventTriggered:  function () { State.temporary.eventTriggered = true; },
		resetEventTriggered: function () { State.temporary.eventTriggered = false; },

		/*
		* Look up videos for a given event and clothing type, resolving
		* the location (owaissa/elm) automatically.
		* Returns a flat array if the entry is a prison/mind list,
		* or the location-appropriate array from { owaissa, elm }.
		*/
		getVideos: function (eventKey, clothingType) {
			assertKnownKey(eventKey, EVENT_KEY_SET, 'event key');
			assertKnownKey(clothingType, CLOTHING_KEY_SET, 'clothing key');
			var ev = setup.EventVideos[eventKey];
			var entry = ev[clothingType];
			if (!entry) return [];
			if (Array.isArray(entry)) return entry;
			return this.pickByLocation(entry.owaissa, entry.elm);
		},

		/*
		* Pick from an { owaissa, elm } pair based on the active
		* static hunt-house id ('owaissa' / 'elm').
		* Procedural runs default to owaissa art.
		*/
		pickByLocation: function (owaissaList, elmList) {
			if (setup.HauntedHouses.isElm()) return elmList || [];
			return owaissaList || [];
		},

		/*
		* Determine the correct clothing type for lower-body events
		* and return the matching video list.
		*/
		bottomClothingVideos: function (eventKey) {
			assertKnownKey(eventKey, EVENT_KEY_SET, 'event key');
			if (setup.HauntedHouses.isIronclad()) return this.getVideos(eventKey, ClothingKey.PRISON);
			var jw = setup.Wardrobe.worn(setup.WardrobeSlot.JEANS);
			var sw = setup.Wardrobe.worn(setup.WardrobeSlot.SHORTS);
			var kw = setup.Wardrobe.worn(setup.WardrobeSlot.SKIRT);
			var pw = setup.Wardrobe.worn(setup.WardrobeSlot.PANTIES);
			var ev = setup.EventVideos[eventKey];

			if (jw) {
				if (ev.jeansNP && !pw)
					return this.getVideos(eventKey, ClothingKey.JEANS_NP);
				return this.getVideos(eventKey, ClothingKey.JEANS);
			}
			if (sw)
				return this.getVideos(eventKey, ClothingKey.SHORTS);
			if (kw) {
				if (!pw && ev.skirtNP)
					return this.getVideos(eventKey, ClothingKey.SKIRT_NP);
				return this.getVideos(eventKey, ClothingKey.SKIRT);
			}
			// No outerwear → underwear / naked branch
			if (pw) return this.getVideos(eventKey, ClothingKey.PANTIES);
			return this.getVideos(eventKey, ClothingKey.NAKED);
		},

		/*
		* Determine the correct clothing type for upper-body events
		* and return the matching video list.
		*/
		topClothingVideos: function (eventKey) {
			assertKnownKey(eventKey, EVENT_KEY_SET, 'event key');
			if (setup.HauntedHouses.isIronclad()) return this.getVideos(eventKey, ClothingKey.PRISON);
			var ts = setup.Wardrobe.worn(setup.WardrobeSlot.TSHIRT);
			var br = setup.Wardrobe.worn(setup.WardrobeSlot.BRA);
			var ev = setup.EventVideos[eventKey];

			if (ts) {
				if (ev.tshirtNB && !br)
					return this.getVideos(eventKey, ClothingKey.TSHIRT_NB);
				return this.getVideos(eventKey, ClothingKey.TSHIRT);
			}
			if (br && ev.bra) return this.getVideos(eventKey, ClothingKey.BRA);
			if (ev.noBra)     return this.getVideos(eventKey, ClothingKey.NO_BRA);
			return [];
		},

		/*
		* One-call entry point: sets up event state and returns the
		* resolved video list for the given body-part key
		* ('brain', 'tits', 'ass', 'bottom', 'mouth', 'pussy', 'anal').
		*/
		videoListForEvent: function (eventKey) {
			this.initEvent(eventKey);
			var ev = setup.EventVideos[eventKey];
			if (ev._type === 'flat')   return ev.mind || [];
			if (ev._type === 'top')    return this.topClothingVideos(eventKey);
			if (ev._type === 'bottom') return this.bottomClothingVideos(eventKey);
			throw new Error('setup.Events: EventVideos["' + eventKey + '"] has unknown _type "' + ev._type + '"');
		},

		/*
		* Return the Banshee-ability video list (location-aware).
		*/
		bansheeVideos: function () {
			return setup.HauntedHouses.isIronclad()
				? setup.BansheeVideos.prison.slice()
				: setup.BansheeVideos.house.slice();
		},

		// --- Per-tier prose --------------------------------------
		/*
		* Look up the corruption-tier prose for a body-part event.
		* Falls back to the highest defined tier <= the requested
		* tier so sparse maps (mouth/pussy/anal) don't need every
		* tier listed. Returns '' if the body part is unknown.
		*
		* Embedded newlines (and the indentation that follows them)
		* are stripped so multi-line template literals render the
		* same as the original `nobr` widget body.
		*/
		eventTextFor: function (bodyPart, tier) {
			assertKnownKey(bodyPart, EVENT_KEY_SET, 'event key');
			var entries = setup.EventText && setup.EventText[bodyPart];
			if (!entries) return '';
			var match = null;
			Object.keys(entries).forEach(function (k) {
				var n = Number(k);
				if (n <= tier && (match === null || n > match)) match = n;
			});
			if (match === null) return '';
			return entries[match].replace(/\n\s*/g, '');
		},

		// --- Orgasm check ----------------------------------------
		/*
		* Returns true if the MC should orgasm during a sexual encounter.
		* Triggers when lust is at max (100) and the body part is
		* pussy or anal.
		*/
		shouldOrgasm: function (bodyPart) {
			if (setup.Mc.lust() < 100) return false;
			return bodyPart === 'pussy' || bodyPart === 'anal';
		},

		/*
		* Orgasm sanity penalty.
		*/
		orgasmSanityLoss: -10,

		/*
		* Pick a random body-part event based on lust tier and
		* a sanity-chance roll.  Returns a body-part key string
		* ('brain', 'tits', etc.) or '' if no event triggers.
		*
		* @param {number} chance - a value in [0, 100] (the caller's
		*   random roll, shared with Banshee/Cthulion checks).
		*/
		/*
		* SaveEventPassage sanity-stage video lookup. The stage→body-part
		* mapping reuses eventVideos so the clothing-aware resolvers
		* (bottomClothingVideos / topClothingVideos) stay the single
		* source of truth.
		*
		*   stage 1 "touching"  → bottom: 'ass', top: 'tits' (caller picks)
		*   stage 2 "grinding"  → 'bottom'
		*   stage 3 "blowjob"   → 'mouth'
		*   stage 4 "explicit"  → 'pussy' ∪ 'anal'
		*/
		saveEventBottomVideos: function (stage) {
			if (stage !== 1 && stage !== 2 && stage !== 3 && stage !== 4) {
				throw new Error('setup.Events: unknown SaveEvent stage "' + stage + '"');
			}
			if (stage === 1) return this.bottomClothingVideos(EventKey.ASS);
			if (stage === 2) return this.bottomClothingVideos(EventKey.BOTTOM);
			if (stage === 4) {
				return this.bottomClothingVideos(EventKey.PUSSY)
					.concat(this.bottomClothingVideos(EventKey.ANAL));
			}
			return [];
		},
		saveEventTopVideos: function (stage) {
			if (stage !== 1 && stage !== 2 && stage !== 3 && stage !== 4) {
				throw new Error('setup.Events: unknown SaveEvent stage "' + stage + '"');
			}
			if (stage === 1) return this.topClothingVideos(EventKey.TITS);
			if (stage === 3) return this.topClothingVideos(EventKey.MOUTH);
			return [];
		},

		// --- Ghost special-ability flags (Banshee / Cthulion) ----
		enableBanshee:    function () { setup.Ghosts.enableBanshee(); },
		enableCthulion:   function () { setup.Ghosts.enableCthulion(); },
		clearBanshee:     function () { setup.Ghosts.clearBanshee(); },
		clearCthulion:    function () { setup.Ghosts.clearCthulion(); },
		bansheeActive:    function () { return setup.Ghosts.bansheeActive(); },
		cthulionActive:   function () { return setup.Ghosts.cthulionActive(); },

		// --- Argument randomizer (body-part key) -----------------
		currentArgForRandomizer: function () { return sv().argForRandomizer; },

		// --- Event video selection -------------------------------
		setVideoEvent:    function (video) { sv().videoEvent = video; },
		videoEvent:       function () { return sv().videoEvent; },
		videoEventIsMp4:  function () {
			var ve = sv().videoEvent;
			return typeof ve === 'string' && ve.indexOf('.mp4') !== -1;
		},

		/* Public Cthulion-tier video lookup. Used by rollSaveEvent
		   below (passes the full list to its picker). */
		cthulionVideos: function (tier) { return cthulionVideos(tier); },

		/* Pick one Cthulion video at random for the given tier. The
		   <<cthulionAbility>> widget delegates here so callers don't
		   have to read a list out of widget temp scope. */
		randomCthulionVideo: function (tier) {
			return pickRandom(cthulionVideos(tier));
		},

		/* :: Event entry: generic per-tick haunt event roll. Picks a
		   video (Banshee / Cthulion / body-part) and writes it to
		   $videoEvent. Returns true when the caller should <<goto
		   "EventMC">>. Body-part fallback delegates to
		   videoListForEvent() so the clothing-aware resolvers stay
		   the single source. */
		rollRandomEvent: function () {
			var g           = setup.Ghosts.active();
			var chance      = Math.floor(Math.random() * 101);
			var bansheeRoll = 1 + Math.floor(Math.random() * 10);
			var ctRoll      = 1 + Math.floor(Math.random() * 10);
			var abilityGate = Math.max(0, 5 - Math.floor(setup.Wardrobe.coverage() / 30));
			var videoList = [];

			if (g && g.canKiss && bansheeRoll === 1 && chance <= abilityGate) {
				this.enableBanshee();
				videoList = this.bansheeVideos();
			} else if (g && g.canTentacles && ctRoll === 1 && chance <= abilityGate) {
				this.enableCthulion();
				var et = this.eventTier();
				var tier = et >= 7 ? 3 : et === 6 ? 2 : et === 5 ? 1 : 0;
				if (tier) videoList = cthulionVideos(tier);
			} else {
				var key = this.rollBodyPartEvent(chance);
				if (key) videoList = this.videoListForEvent(key);
			}

			if (!videoList.length) return false;
			sv().videoEvent = pickRandom(videoList);
			return true;
		},

		/* SaveEventPassage entry: runs the sanity-stage / Banshee /
		   Cthulion dispatch, picks a video, writes it to $videoEvent,
		   and returns true if a video was selected (caller <<goto>>s
		   EventMC). Encapsulates the entire flow that SaveEventPassage
		   used to inline. */
		rollSaveEvent: function () {
			var g = setup.Ghosts.active();
			this.setDecreasingSanity(
				g && g.invertedSanityStages
					? { stage1: 9, stage2: 7, stage3: 5, stage4: 3 }
					: { stage1: 3, stage2: 5, stage3: 7, stage4: 9 }
			);
			var ds = this.decreasingSanity();
			var damp = Math.floor(setup.Wardrobe.coverage() / 15);
			ds = {
				stage1: Math.max(0, ds.stage1 - damp),
				stage2: Math.max(0, ds.stage2 - damp),
				stage3: Math.max(0, ds.stage3 - damp),
				stage4: Math.max(0, ds.stage4 - damp)
			};
			var sanity = setup.Mc.sanity();
			var chance      = Math.floor(Math.random() * 101);
			var bansheeRoll = 1 + Math.floor(Math.random() * 6);
			var ctRoll      = 1 + Math.floor(Math.random() * 6);
			var videoList = [];

			if (chance <= ds.stage2 && bansheeRoll === 1 && g && g.canKiss) {
				this.enableBanshee();
				videoList = this.bansheeVideos();
			} else if (chance <= ds.stage2 && ctRoll === 1 && g && g.canTentacles) {
				var tier = cthulionTierForSanity(sanity);
				if (tier) videoList = cthulionVideos(tier);
			} else if (sanity >= 75 && chance <= ds.stage1) {
				var inside = 1 + Math.floor(Math.random() * 5);
				videoList = (inside <= 3)
					? this.saveEventBottomVideos(1)
					: this.saveEventTopVideos(1);
			} else if (sanity >= 50 && sanity < 75 && chance <= ds.stage2) {
				videoList = this.saveEventBottomVideos(2);
			} else if (sanity >= 30 && sanity < 50 && chance <= ds.stage3) {
				videoList = this.saveEventTopVideos(3);
			} else if (sanity >= 1 && sanity < 30 && chance <= ds.stage4) {
				videoList = this.saveEventBottomVideos(4);
			}

			var picked = pickRandom(videoList);
			sv().videoEvent = picked || null;
			return !!picked;
		},

		// --- Ghost sanity-event decreased amount -----------------
		rollGhostSanityEventDecreased: function () {
			var g = setup.Ghosts.active();
			sv().ghostSanityEventDecreased = g ? g.rollEventSanityLoss() : 0;
		},
		ghostSanityEventDecreased: function () { return sv().ghostSanityEventDecreased; },

		// --- Decreasing-sanity stage table -----------------------
		setDecreasingSanity: function (obj) { sv().decreasingSanity = obj; },
		decreasingSanity:    function () { return sv().decreasingSanity; },

		// --- Clothing-state convenience --------------------------
		jeansWorn:   function () { return setup.Wardrobe.worn(setup.WardrobeSlot.JEANS); },
		shortsWorn:  function () { return setup.Wardrobe.worn(setup.WardrobeSlot.SHORTS); },
		skirtWorn:   function () { return setup.Wardrobe.worn(setup.WardrobeSlot.SKIRT); },
		pantiesWorn: function () { return setup.Wardrobe.worn(setup.WardrobeSlot.PANTIES); },

		// --- Orgasm cooldown flag --------------------------------
		setOrgasmCooldown: function (n) { setup.Mc.setOrgasmCooldown(n); },

		// --- Companion lust/sanity mutators (used by eventWidget) ---
		companionDrainForHelp: function () {
			setup.Companion.drainSanity(3);
			setup.Companion.addLust(10);
		},

		// --- Minigame state (SeduceGhost) ------------------------
		minigameVideo:       function () { return setup.SeduceGhostMinigame.minigameVideo(); },
		minigameEventFailed: function () { return setup.SeduceGhostMinigame.minigameEventFailed(); },
		clearMinigameEventFailed: function () { setup.SeduceGhostMinigame.clearMinigameEventFailed(); },
		ghostOrgasmMeter:    function () { return setup.SeduceGhostMinigame.ghostOrgasmMeter(); },
		mcOrgasmMeter:       function () { return setup.Mc.orgasmMeter(); },
		clampGhostOrgasmFloor: function () { setup.SeduceGhostMinigame.clampGhostOrgasmFloor(); },
		clampMcOrgasmFloor: function () {
			if ((setup.Mc.orgasmMeter() || 0) <= 0) setup.Mc.setOrgasmMeter(0);
		},
		chanceToAttractFailedFlag: function () { return sv().chanceToAttractFailed; },

		// --- Weaken-ghost minigame reward ------------------------
		recordWeakenReward: function () {
			setup.Witch.recordWeakenReward(30);
		},

		// --- Room cleanup flag -----------------------------------
		setCleanedUp: function (val) { sv().cleanedUp = !!val; },

		/* Threshold reduction from how dressed the MC is. Each ~12
		   coverage points (range 0-100) trims one off the
		   lust-tier event threshold, so a fully covered MC is ~8
		   harder to harass per tick than a naked one. */
		coverageDamp: function () {
			return Math.floor(setup.Wardrobe.coverage() / 12);
		},

		rollBodyPartEvent: function (chance) {
			var tier      = this.eventTier();
			var threshold = sanityThresholds[tier] - this.coverageDamp();
			if (threshold < 0) threshold = 0;
			if (chance > threshold) return '';

			var parts       = bodyPartKeys.slice(0, tier);
			var bp          = setup.Intro.currentSensualBodyPart();
			var mult        = setup.Wardrobe.exposureMultipliers();
			var weights     = [];
			var totalWeight = 0;

			for (var i = 0; i < parts.length; i++) {
				var raw = (bp[parts[i]] || 0) * 100;
				var m   = mult[parts[i]];
				var w   = typeof m === 'number' ? Math.round(raw * m) : raw;
				weights.push(w);
				totalWeight += w;
			}
			if (totalWeight <= 0) return '';

			var roll = Math.floor(Math.random() * totalWeight) + 1;
			var cumulative = 0;
			for (var i = 0; i < weights.length; i++) {
				cumulative += weights[i];
				if (roll <= cumulative) return parts[i];
			}
			return parts[parts.length - 1];
		}
	};
})();
