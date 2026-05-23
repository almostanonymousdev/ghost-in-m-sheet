/*
 * Save/Load robustness layer.
 *
 * Addresses three classes of save corruption reported on F95zone:
 *   1. Progress variables added in later versions being undefined on old saves
 *      (previously patched ad-hoc in PassageReady; now centralised and applied
 *      on load rather than on next passage entry).
 *   2. Saves silently carrying non-serialisable junk (functions, jQuery nodes,
 *      DOM references) that either throw on load or quietly lose data.
 *   3. Load handlers that throw and leave SugarCube in a half-restored state,
 *      which players experience as "save won't load".
 *
 * Strategy:
 *   - Stamp every save with a version number and a timestamp via Save.onSave.
 *   - On Save.onLoad, walk the save's moments and ensure the "current" moment
 *     has every expected variable defined with a sane default.
 *   - Wrap everything in try/catch so one bad field can't nuke the whole load.
 */
(function () {
	'use strict';

	// Bump this when you add a new required top-level variable and want old
	// saves to pick up its default on next load.
	//   v1: pre-bundle shape (flat $ghost*, $is<House>, etc.)
	//   v2: hunt/tools bundles, $hauntedHouse, $monkeyPawLearned map.
	//   v3: per-run state introduced -- $run / $ectoplasm / $runsStarted
	//       defaults seeded for legacy saves; $houseSlots collapses
	//       the per-house slot forest.
	//   v4: classic mode removed; only the unified hunt mode remains.
	//       Legacy $hauntedHouse / $houseSlots / $isClassicHouse flags
	//       are dropped.
	//   v5: "rogue" terminology dropped. $nextRogueSeed →
	//       $nextHuntSeed, $pendingRogueStaticHouseId →
	//       $pendingHuntHouseId, $currentsearchRogue →
	//       $currentsearchHunt, and the "rogue-" prefix is stripped
	//       from static house ids ('rogue-owaissa' → 'owaissa', etc.).
	//   v6: two unrelated shape changes landed together.
	//       (a) $hunt bundle removed. Hunt-lifecycle state lives on
	//           top-level $huntMode (the integer formerly at
	//           $hunt.mode) and per-hunt ghost name / evidence /
	//           favourite-room / trapped-flag fold into the $run
	//           bundle as ghostName / evidence / favouriteRoomName /
	//           trapped (plus a new disguiseName for Mimic display
	//           rotation).
	//       (b) $companion stopped being a per-pick clone of the
	//           active companion's stat row -- it's now a {name}
	//           marker, and the per-companion $brook/... rows are
	//           the single source of truth for sanity/lust/
	//           chanceToAttack/etc. Old clone fields get ported
	//           back onto the backing row on load.
	//       (c) pre-v6 per-companion legacy-key forwarding retired.
	//	      	 Saves predating v6 ($isCompChosen<Name>,
	//  	     $chanceToSuccessAlone<Street><Name>, $decreaseSanity, ...)
	//      	 no longer carry per-companion solo-hunt state forward;
	//     	 	 fresh per-companion stat rows are seeded from defaults.
	var SAVE_VERSION = 6;
	setup.SAVE_VERSION = SAVE_VERSION;

	/*
	* Central place for default values of variables that are allowed to be
	* missing on old saves. Anything initialised in StoryInit that a later
	* version depends on should be listed here with its default.
	*
	* Values are functions so each save gets its own fresh object / array and
	* two saves can't end up aliasing the same reference after migration.
	*/
	var DEFAULTS = {
		sensualBodyPart: function () {
			return setup.Intro.defaultSensualBodyParts();
		},
		sensualBodyPartChoice: function () {
			return setup.Intro.defaultSensualBodyPartChoice();
		},
		ghostSpecialEventSpirit:  function () { return 0; },
		relationshipBlake:          function () { return 0; },
		crucifixAmount:             function () { return 0; },
		sanityPillsAmount:          function () { return 0; },
		moneyFromWeakenTheGhost:    function () { return 0; },
		piercingTitsAddSens:        function () { return 0; },
		piercingTongueAddSens:      function () { return 0; },
		piercingPussyAddSens:       function () { return 0; },
		addLustPiercingTits:        function () { return 0; },
		addLustPiercingTongue:      function () { return 0; },
		addLustPiercingPussy:       function () { return 0; },
		updatePiercingBodyPartSens: function () { return 1; },
		fixSave:                    function () { return 1; },
		orgasmCooldownSteps:        function () { return 0; },
		baitOrgasmPending:          function () { return 0; },

		// Companion state objects. Per-companion defaults live in the
		// catalogue's initStats (see CompanionData.js); these wrappers
		// pull them through setup.Companion so SaveMigration doesn't
		// need a second copy of the stat tables.
		brook:  function () { return setup.Companion.defaultStateFor('Brook'); },
		alice:  function () { return setup.Companion.defaultStateFor('Alice'); },
		blake:  function () { return setup.Companion.defaultStateFor('Blake'); },

		// Home event bundles -- collapse the old flat $succubusEventCD /
		// $tentaclesEventStageAll / $webcamEvent / $summonText forests
		// into one object per feature. The flat-key fold-forward below
		// handles existing saves; these defaults cover fresh-game/no-prior-
		// state paths.
		succubusEvent: function () { return {}; },
		tentacles:     function () { return {}; },
		webcam:        function () { return {}; },
		summoning:     function () { return {}; },
		alarm:         function () { return { enabled: false, hour: 7 }; },

		// Hunt-mode state: pre-hunt saves don't have these
		// fields. $run is null when no hunt is active
		// (classic mode). $ectoplasm starts at 0 mL. $runsStarted
		// is the lifetime attempt counter, also 0 by default.
		// $meta holds permanent meta-shop unlocks: per-id owned
		// counts, the modifier banlist, and stockpiled reroll
		// charges. Saves predating the meta-shop default to none.
		run:           function () { return null; },
		ectoplasm:     function () { return 0; },
		runsStarted:   function () { return 0; },
		meta:          function () { return { unlocks: {}, bannedModifiers: [], rerollCharges: 0 }; },
		// Persistent unlock map for setup.Achievements. Keys are
		// catalogue ids; values are { at: <epoch-ms> }. Absent on
		// saves predating the achievement system -- defaults to none.
		achievements:  function () { return {}; },
		// Seed for the *next* hunt. Rotated after each run end so
		// the GhostStreet card / HuntStart lobby preview a fresh
		// address every attempt.
		nextHuntSeed: function () { return Math.floor(Math.random() * 0x100000000); },
		// Static-hunt-house id staged from a GhostStreet card.
		// HuntStart consumes it once and clears it; null on saves
		// predating static-plan hunt houses.
		pendingHuntHouseId: function () { return null; },

		// Witch contract storefront. `offered` is rebuilt the first
		// time the player opens the board each in-game day; `held`
		// is the key the player has paid for and not yet used.
		// Saves predating the contract relaunch get an empty board
		// + no held key; ensureFresh fills the offered list lazily.
		contracts: function () { return { offered: [], held: null, lastRefreshDay: -1 }; },

		// Per-day seed; regenerated on every 24h rollover.
		dailySeed:     function () { return Math.floor(Math.random() * 0x100000000); },

		// Buyback for clothes lost during a hunt. Older saves
		// have no array; default to empty.
		lostClothing:  function () { return []; },
		tornPagesFound: function () { return []; },

		// Witch's ectoplasm-unlock quest. Gates the rogue/random
		// hunt card + every visible reference to the ectoplasm
		// currency and meta-shop. Defaults to NOT_OFFERED (0); the
		// witch surfaces the quest once the MC hits level 5.
		ectoplasmQuestStage: function () { return 0; }
	};

	// Flags that flipped from 0/1 integers to true/false booleans.
	// Old saves carry the integer form; this list lets applyDefaults
	// coerce them back to the boolean shape so === true / === false
	// predicates on the new code path keep working without a version bump.
	var BOOLEAN_FLAGS = [
		// wardrobe stolen markers
		'isJeansStolen', 'isSkirtStolen', 'isShortsStolen', 'isTshirtStolen',
		'isBraStolen', 'isPantiesStolen', 'isStockingsStolen',
		'isShirtStolen', 'isBottomStolen',
		// haunted-house + hunt-conditions flags
		'hasClothesStolen', 'isClothesStolen', 'isBaitActive', 'isOverchargedMode',
		'baitOrgasmPending', 'overchargedTools', 'sanityCollapse', 'exhausted',
		'baitActive',
		// home
		'dildoPurchased', 'cameraBought', 'mcSleptWithCameraOn',
		'webcamAccountCreated', 'holyWaterIsCollected',
		// witch
		'isCIDildo', 'isCIButtplug', 'isCIBeads', 'isCIHDildo',
		'amulet', 'gotKeyFromWitch', 'isWeakenGhost',
		// missing women
		'hasRescueClue',
		// ghosts
		'twinsEventActive', 'knowledgeUsed', 'prowlActivated',
		'highpriestess', 'bansheeAbility', 'cthulionAbility',
		'deleteOneEvidence', 'deleteSecondEvidence', 'deleteThirdEvidence',
		// mc
		'isPenaltyOn', 'makeupApplied',
		// companion
		'isCompChosen', 'aliceWorkDone', 'isCompRoomChosen',
		'meetAlice',
		// gym
		'trainer1TipReceived', 'relationEmilyCD',
		// cursed home items + monkey paw
		'cursedHomeItemActive', 'wishAnything'
	];

	function normalizeBooleanFlags(vars) {
		for (var i = 0; i < BOOLEAN_FLAGS.length; i++) {
			var k = BOOLEAN_FLAGS[i];
			var v = vars[k];
			if (v === 1) vars[k] = true;
			else if (v === 0) vars[k] = false;
		}
		// $ghostInfoCollected is a map of name -> 1/true; normalize values.
		var g = vars.ghostInfoCollected;
		if (g && typeof g === 'object') {
			Object.keys(g).forEach(function (gk) {
				if (g[gk] === 1) g[gk] = true;
			});
		}
	}

	// mc sub-fields added after launch -- missing on very old saves
	var MC_DEFAULTS = {
		fit:               0,
		exhibitionism:     0,
		lustMax:           100,
		beautyBase:        30,
		beautyModifier:    0,
		possessionResidue: 0
	};

	function applyDefaults (vars) {
		if (!vars || typeof vars !== 'object') {
			return;
		}

		Object.keys(DEFAULTS).forEach(function (key) {
			if (vars[key] === undefined || vars[key] === null) {
				try {
					vars[key] = DEFAULTS[key]();
				}
				catch (ex) {
					console.error('SaveMigration: failed to default $' + key, ex);
				}
			}
		});

		normalizeBooleanFlags(vars);

		if (vars.mc && typeof vars.mc === 'object') {
			// One-time rename: mc.exhib -> mc.exhibitionism. Carry the old
			// value forward when it's the only one defined, so existing
			// saves don't reset their progress.
			if (vars.mc.exhibitionism === undefined && vars.mc.exhib !== undefined) {
				vars.mc.exhibitionism = vars.mc.exhib;
			}
			delete vars.mc.exhib;

			// One-time split: flat mc.beauty -> mc.beautyBase + mc.beautyModifier.
			// Old saves preserve their displayed beauty: base stays at 30,
			// modifier soaks the rest so beauty() still returns the same total.
			if (vars.mc.beauty !== undefined) {
				if (vars.mc.beautyBase === undefined)     { vars.mc.beautyBase = 30; }
				if (vars.mc.beautyModifier === undefined) {
					vars.mc.beautyModifier = vars.mc.beauty - vars.mc.beautyBase;
				}
			}
			delete vars.mc.beauty;

			Object.keys(MC_DEFAULTS).forEach(function (key) {
				if (vars.mc[key] === undefined || vars.mc[key] === null) {
					vars.mc[key] = MC_DEFAULTS[key];
				}
			});

			if (typeof vars.mc.lvl !== 'number' || vars.mc.lvl < 1) {
				vars.mc.lvl = 1;
			}
		}

		// One-time rename: $checkChoosenLocation -> $checkChosenLocation
		// (typo fix). Carry the old value forward when set.
		if (vars.checkChosenLocation === undefined && vars.checkChoosenLocation !== undefined) {
			vars.checkChosenLocation = vars.checkChoosenLocation;
		}
		delete vars.checkChoosenLocation;

		// v6: collapse the per-pick $companion clone to a {name}
		// marker. Old saves carrying a full clone (sanity / lust /
		// chanceToAttack / eventSanityLoss / ...) are the source-of-
		// truth for live in-hunt values; port those fields onto the
		// backing stat row, then strip the clone down to {name}.
		if (vars.companion && typeof vars.companion === 'object' && vars.companion.name) {
			var marker = vars.companion;
			var rowKey = String(marker.name).toLowerCase();
			var row    = vars[rowKey];
			if (row && typeof row === 'object') {
				Object.keys(marker).forEach(function (k) {
					if (k === 'name') return;
					if (marker[k] !== undefined) row[k] = marker[k];
				});
			}
			vars.companion = { name: marker.name };
		}

		// Library: 4 mutually-exclusive $comics<N> flags collapsed into a
		// single $comicsReading slot (0 = none, 1..4 = active issue).
		if (vars.comicsReading === undefined) {
			for (var ci = 1; ci <= 4; ci++) {
				if (vars['comics' + ci] === 1) { vars.comicsReading = ci; break; }
			}
			if (vars.comicsReading === undefined) vars.comicsReading = 0;
		}
		for (var ck = 1; ck <= 4; ck++) delete vars['comics' + ck];

		// Delivery: 3 flat $deliveryActiveIcon{1,2,3} flags collapsed into
		// a single $deliveryActiveIcons array.
		if (!Array.isArray(vars.deliveryActiveIcons)) {
			vars.deliveryActiveIcons = [
				vars.deliveryActiveIcon1 !== undefined ? !!vars.deliveryActiveIcon1 : true,
				vars.deliveryActiveIcon2 !== undefined ? !!vars.deliveryActiveIcon2 : true,
				vars.deliveryActiveIcon3 !== undefined ? !!vars.deliveryActiveIcon3 : true
			];
		}
		delete vars.deliveryActiveIcon1;
		delete vars.deliveryActiveIcon2;
		delete vars.deliveryActiveIcon3;

		// Ghosts: 18 individual $ghost<Name>InfoCollected flags folded into
		// a single $ghostInfoCollected map keyed by ghost name.
		if (!vars.ghostInfoCollected || typeof vars.ghostInfoCollected !== 'object') {
			vars.ghostInfoCollected = {};
		}
		[
			'Shade', 'Spirit', 'Poltergeist', 'Phantom', 'Goryo', 'Demon',
			'Deogen', 'Jinn', 'Moroi', 'Myling', 'Mare', 'Banshee',
			'Mimic', 'Oni', 'Obake', 'TheTwins', 'HighPriestess', 'Cthulion'
		].forEach(function (gname) {
			var legacyKey = 'ghost' + gname + 'InfoCollected';
			if (vars[legacyKey]) vars.ghostInfoCollected[gname] = true;
			delete vars[legacyKey];
		});

		// clamp body-part sensitivity (old saves occasionally over-increment)
		setup.Intro.clampSensualBodyParts(vars.sensualBodyPart);

		// hasPSpray/charges invariant: if charges are gone, the spray is gone
		if (typeof vars.hasPSprayCharges === 'number' && vars.hasPSprayCharges <= 0) {
			vars.hasPSpray = 0;
		}

		// One-time rename: the random-ghost-attack timer vars were
		// renamed from "hunt*" to "prowl*" to mirror the player/ghost
		// terminology split (the player goes on a "ghost hunt"; what
		// the ghost does mid-session is a "ghost prowl"). Carry old
		// values forward when only the legacy keys are defined.
		[
			['huntActivated',      'prowlActivated'],
			['huntActivationTime', 'prowlActivationTime'],
			['huntTimeRemain',     'prowlTimeRemain'],
			['elapsedTimeHunt',    'elapsedTimeProwl']
		].forEach(function (pair) {
			var oldKey = pair[0];
			var newKey = pair[1];
			if (vars[newKey] === undefined && vars[oldKey] !== undefined) {
				vars[newKey] = vars[oldKey];
			}
			delete vars[oldKey];
		});

		// Older saves stored hunt state as a scatter of top-level
		// variables ($ghost, $ghostName, $ghostEvidence, $ghostRoom,
		// $ghostIsTrapped, $ghostHuntingMode, $saveMimic). The v2-v5
		// shape briefly consolidated them onto a $hunt bundle; v6
		// flattens the bundle back out: $hunt.mode lives at top-level
		// $huntMode, and the per-hunt ghost name / real-name (Mimic
		// disguise) / evidence / trapped-flag move into the $run
		// bundle (ghostName / disguiseName / evidence / trapped),
		// which setup.HuntController.activeGhost() now reads through. Legacy mode
		// 1 (CONTRACT) is dropped — contracts no longer gate hunts,
		// so any pre-entry contract collapses to "no hunt".
		var legacyName = undefined;
		var legacyRealName = undefined;
		var legacyEvidence = undefined;
		var legacyTrapped = false;
		var legacyMode = 0;
		if (vars.hunt && typeof vars.hunt === 'object') {
			if (typeof vars.hunt.name === 'string') legacyName = vars.hunt.name;
			if (typeof vars.hunt.realName === 'string') legacyRealName = vars.hunt.realName;
			if (Array.isArray(vars.hunt.evidence)) legacyEvidence = vars.hunt.evidence.slice();
			legacyTrapped = vars.hunt.trapped === true;
			if (typeof vars.hunt.mode === 'number') legacyMode = vars.hunt.mode;
		}
		if (vars.ghost && typeof vars.ghost === 'object') {
			if (legacyName === undefined && typeof vars.ghost.name === 'string') legacyName = vars.ghost.name;
			if (legacyEvidence === undefined && Array.isArray(vars.ghost.evidence)) legacyEvidence = vars.ghost.evidence.slice();
		}
		if (legacyName === undefined && typeof vars.ghostName === 'string') legacyName = vars.ghostName;
		if (legacyEvidence === undefined && Array.isArray(vars.ghostEvidence)) legacyEvidence = vars.ghostEvidence.slice();
		if (legacyMode === 0 && typeof vars.ghostHuntingMode === 'number') legacyMode = vars.ghostHuntingMode;
		if (legacyMode === 1) legacyMode = 0;
		if (!legacyTrapped && vars.ghostIsTrapped === 1) legacyTrapped = true;
		if (legacyRealName === undefined) {
			legacyRealName = vars.saveMimic === 1 ? 'Mimic' : legacyName;
		}

		if (vars.huntMode === undefined) {
			vars.huntMode = legacyName && legacyMode !== 0 ? legacyMode : 0;
		}

		// Fold the legacy ghost identity / evidence / trapped flag
		// into $run when a hunt was actually active on the save. The
		// $run bundle's other fields (floorplan / currentRoomId /
		// modifiers / etc.) only exist on saves that already had a
		// $run, so we only patch the ghost-side fields here.
		// $run.ghostName is the *real* identity; $run.disguiseName is
		// the currently-displayed name (only differs for Mimic). Old
		// $hunt mapped name=display, realName=real — flip them.
		if (vars.run && typeof vars.run === 'object') {
			if (legacyRealName && vars.run.ghostName === undefined) {
				vars.run.ghostName = legacyRealName;
			}
			if (legacyName && vars.run.disguiseName === undefined) {
				vars.run.disguiseName = legacyName;
			}
			if (legacyEvidence && vars.run.evidence === undefined) {
				vars.run.evidence = legacyEvidence;
			}
			if (legacyTrapped && vars.run.trapped === undefined) {
				vars.run.trapped = true;
			}
		}

		delete vars.hunt;
		delete vars.ghost;
		delete vars.ghostName;
		delete vars.ghostEvidence;
		delete vars.ghostRoom;
		delete vars.ghostIsTrapped;
		delete vars.ghostHuntingMode;
		delete vars.saveMimic;
		delete vars.ghostActivity;
		delete vars.ghostRoomCI;

		// EMF/UVL activation state was four flat vars (EmfActivated,
		// EmfActivationTime, uvlActivated, uvlActivationTime); the new
		// shape bundles them under $tools so activateTool / resetTool /
		// tickTimedTool can operate on a single record per tool.
		if (!vars.tools || typeof vars.tools !== 'object') {
			vars.tools = {
				emf: {
					activated:      vars.EmfActivated === 1 ? 1 : 0,
					activationTime: typeof vars.EmfActivationTime === 'number' ? vars.EmfActivationTime : 0
				},
				uvl: {
					activated:      vars.uvlActivated === 1 ? 1 : 0,
					activationTime: typeof vars.uvlActivationTime === 'number' ? vars.uvlActivationTime : 0
				}
			};
		}
		delete vars.EmfActivated;
		delete vars.EmfActivationTime;
		delete vars.uvlActivated;
		delete vars.uvlActivationTime;
		delete vars.emfTimeRemain;
		delete vars.uvlTimeRemain;
		delete vars.elapsedTime;
		delete vars.elapsedTimeUvl;

		// 0.5.1 stored each Monkey Paw wish unlock as a flat $wish<Name>
		// flag; the post-overhaul code reads $monkeyPawLearned[<id>]
		// instead. Buying the witch's guide ($boughtMonkeyPawGuide===2)
		// historically set every per-wish flag at once, so a save in
		// that state otherwise loads with only the "anything" button
		// (which kept its $wishAnything flag across the rename).
		var WISH_FLAG_TO_ID = {
			wishActivity:     'activity',
			wishTraptheghost: 'trapTheGhost',
			wishSanity:       'sanity',
			wishLeave:        'leave',
			wishKnowledge:    'knowledge',
			wishDawn:         'dawn'
		};
		var hasLegacyWishFlag = Object.keys(WISH_FLAG_TO_ID).some(function (k) {
			return vars[k] !== undefined;
		});
		if (vars.boughtMonkeyPawGuide === setup.MonkeyPawGuide.PURCHASED || hasLegacyWishFlag) {
			if (!vars.monkeyPawLearned || typeof vars.monkeyPawLearned !== 'object') {
				vars.monkeyPawLearned = {};
			}
			Object.keys(WISH_FLAG_TO_ID).forEach(function (flag) {
				if (vars[flag] === 1) vars.monkeyPawLearned[WISH_FLAG_TO_ID[flag]] = true;
			});
			// Buying the guide unlocked everything, including the
			// "anything" meta-wish; some 0.5.1 paths set the per-wish
			// flags but not $wishAnything when the guide was bought.
			if (vars.boughtMonkeyPawGuide === setup.MonkeyPawGuide.PURCHASED) {
				Object.keys(WISH_FLAG_TO_ID).forEach(function (flag) {
					vars.monkeyPawLearned[WISH_FLAG_TO_ID[flag]] = true;
				});
				if (vars.wishAnything !== true) vars.wishAnything = true;
			}
		}
		Object.keys(WISH_FLAG_TO_ID).forEach(function (flag) { delete vars[flag]; });

		// Home event bundles: collapse flat $succubus*, $tentacles*,
		// $webcam* / $prefs*, $summon* / $summoning* keys onto four
		// per-feature objects ($succubusEvent, $tentacles, $webcam,
		// $summoning). For each existing flat key on the save, copy
		// its value into the bundle field, then delete the flat key.
		// Skip a copy when the bundle already has the field — older
		// saves coming through this path twice shouldn't clobber a
		// value that was written via the new-shape API in the
		// meantime.
		function migrateBundle(bundleKey, mapping) {
			if (!vars[bundleKey] || typeof vars[bundleKey] !== 'object') {
				vars[bundleKey] = {};
			}
			var bundle = vars[bundleKey];
			Object.keys(mapping).forEach(function (newField) {
				var oldKey = mapping[newField];
				if (vars[oldKey] !== undefined && bundle[newField] === undefined) {
					bundle[newField] = vars[oldKey];
				}
				delete vars[oldKey];
			});
		}
		migrateBundle('succubusEvent', {
			eventCD:    'succubusEventCD',
			pcStage:    'succubusPCEventStage',
			choiceText: 'succubusChoiceEventText',
			tvText:     'succubusTVText',
			eventTimer: 'succubusEventTimer'
		});
		migrateBundle('tentacles', {
			stageAll:       'tentaclesEventStageAll',
			stageSleep:     'tentaclesEventStageSleep',
			pcText:         'tentaclesEventPCText',
			tvText:         'tentaclesEventTVText',
			afterSleepText: 'tentaclesTextAfterSleep'
		});
		migrateBundle('webcam', {
			event:          'webcamEvent',
			showCD:         'webcamShowCD',
			accountCreated: 'webcamAccountCreated',
			video:          'webcamVideo',
			money:          'prefsmoney',
			subscribers:    'prefssubscribers',
			showCount:      'prefsshowCount'
		});
		migrateBundle('summoning', {
			text:   'summonText',
			choice: 'summoningChoice'
		});

		// Daily-cooldown rename: the `CD` suffix is redundant once the
		// vars are routed through setup.Cooldowns, so they were renamed
		// in place. The twins event also got its trigger flag and
		// cooldown swapped onto a clearer naming pair: $thetwinsevent
		// (the "event is firing" trigger) → $twinsEventActive, and the
		// old $thetwinseventCD (the "event has fired today" cooldown)
		// → $twinsEvent. For each old key on the save, copy its value
		// into the new key (skip when the new key already holds
		// something — don't clobber values written through the new-shape
		// API in the meantime), then delete the old key.
		var FLAT_RENAMES = {
			thetwinsevent:             'twinsEventActive',
			thetwinseventCD:           'twinsEvent',
			joggingCD:                 'jogging',
			stealItemsFromWitchCD:     'stealItemsFromWitch',
			ghostSpecialEventSpiritCD: 'ghostSpecialEventSpirit',
			witchNightCD:              'witchNight',
			trainer1SexCD:             'trainer1Sex',
			trainer2SexCD:             'trainer2Sex',
			findGhostInfoCD:           'findGhostInfo',
			deliveryBJCD:              'deliveryBJ',
			churchSexCD:               'churchSex',
			masturbationCD:            'masturbation',
			exorcismCD:                'exorcism',
			rescueCD:                  'rescue',
			rescueQuestCD:             'rescueQuest',
			// v5: "rogue" terminology dropped. Carry old values
			// forward to their new keys.
			nextRogueSeed:             'nextHuntSeed',
			pendingRogueStaticHouseId: 'pendingHuntHouseId',
			currentsearchRogue:        'currentsearchHunt'
		};
		Object.keys(FLAT_RENAMES).forEach(function (oldKey) {
			var newKey = FLAT_RENAMES[oldKey];
			if (vars[oldKey] !== undefined && vars[newKey] === undefined) {
				vars[newKey] = vars[oldKey];
			}
			delete vars[oldKey];
		});

		// v5: static-plan house ids lost their "rogue-" prefix
		// ('rogue-owaissa' → 'owaissa', etc.). Strip the prefix
		// from any place a save could be carrying a stale id —
		// the pending-house staging slot and the active $run.
		function stripRoguePrefix(id) {
			return typeof id === 'string' && id.indexOf('rogue-') === 0
				? id.slice('rogue-'.length)
				: id;
		}
		if (typeof vars.pendingHuntHouseId === 'string') {
			vars.pendingHuntHouseId = stripRoguePrefix(vars.pendingHuntHouseId);
		}
		if (vars.run && typeof vars.run === 'object'
			&& typeof vars.run.staticHouseId === 'string') {
			vars.run.staticHouseId = stripRoguePrefix(vars.run.staticHouseId);
		}

		// Classic-house flags + per-house slot maps were removed
		// when the game collapsed to a single unified hunt mode.
		// Drop whatever legacy fields the save is carrying so they
		// don't bloat downstream state walks.
		delete vars.hauntedHouse;
		delete vars.isOwaissa;
		delete vars.isElm;
		delete vars.isEnigma;
		delete vars.isIronclad;
		delete vars.isrealhouse;
		delete vars.houseSlots;
		delete vars.cursedHuntActive;
		delete vars.cursedHuntEndTime;
		delete vars.currentFurniture;
		delete vars.isInHideSpot;
		delete vars.moneyFromContract;
		delete vars.expFromContract;
		delete vars.monkeyPawDoorLock;
		['Owaissa', 'Elm', 'Ironclad'].forEach(function (suffix) {
			delete vars['furnitureList' + suffix];
			delete vars['tempList' + suffix];
			['CursedItem', 'RescueClue', 'TarotCards', 'MonkeyPaw', 'Curse', 'ClothesStolen'].forEach(function (kind) {
				delete vars['placeFor' + kind + suffix];
			});
		});

		// Back-fill $lostClothing for saves created before the lost-
		// clothing tracking shipped. loseAllStolen used to just mark
		// the stolen tier item NOT_BOUGHT and clear the rememberVar to
		// "no<key>"; a tier-1..3 var sitting in NOT_BOUGHT while its
		// group's rememberVar still points at "no<that-key>" can only
		// have come from a hunt loss (a never-bought item never has
		// the rememberVar pointed at it). Idempotent — re-runs on
		// every load skip entries already in the list.
		if (Array.isArray(vars.lostClothing) && setup.WARDROBE_GROUPS) {
			setup.WARDROBE_GROUPS.forEach(function (grp) {
				if (!grp.rememberVar) { return; }
				var key = vars[grp.rememberVar];
				if (typeof key !== 'string' || key.indexOf('no') !== 0) { return; }
				var originalKey = key.slice(2);
				grp.items.forEach(function (item) {
					if (item.key !== originalKey) { return; }
					if (item.slot === 0) { return; }
					if (vars[item.var] !== setup.ClothingState.NOT_BOUGHT) { return; }
					if (vars.lostClothing.indexOf(item.var) === -1) {
						vars.lostClothing.push(item.var);
					}
				});
			});
		}
	}

	// Expose for use from Twine (PassageReady belt-and-braces call).
	setup.applySaveDefaults = applyDefaults;

	/*
	 * Hard-reset fallback for saves stamped with a different
	 * SAVE_VERSION. Per-version migrations (applyDefaults +
	 * setup.Migrations) are best-effort; partial migration of an
	 * older save can leave the world in a worse state than a fresh
	 * one. When we detect a version mismatch we rebuild the save
	 * from initState() defaults and carry forward only the player-
	 * persistent fields below -- progression that the player earned
	 * (stats, money, ectoplasm, purchases, quest stages, ghost
	 * info, achievements, wardrobe, companion stat rows). Anything
	 * transient (per-hunt state, tool timers, home event bundles,
	 * daily cooldowns, clock) goes back to defaults, and the MC
	 * is dropped in the Livingroom at 11 AM.
	 */
	var PRESERVE_KEYS = [
		// --- MC core / status / consumables / piercings ---------
		'mc',
		'mcpossession', 'mcOrgasmMeter',
		'percentageOfLevel', 'neededForNextLevel', 'tempCorr',
		'earnedMoney',
		'energyDrinkAmount', 'makeupAmount', 'makeupApplied',
		'medicineAmount', 'sanityPillsAmount',
		'sensualBodyPart', 'sensualBodyPartChoice',
		'piercingTitsAddSens', 'piercingPussyAddSens', 'piercingTongueAddSens',
		'addLustPiercingTits', 'addLustPiercingPussy', 'addLustPiercingTongue',
		'earsPiercing', 'nosePiercing', 'tonguePiercing', 'titsPiercing', 'pussyPiercing',

		// --- Currency / lifetime counters ------------------------
		'ectoplasm', 'runsStarted',

		// --- Equipment / purchases -------------------------------
		'equipment', 'spiritboxLvl',
		'crucifixAmount', 'hasPSpray', 'hasPSprayCharges',
		'boughtDetector', 'boughtMonkeyPawGuide',
		'isPhoneBought', 'isCameraBought', 'dildoPurchased',
		'sportswear',

		// --- Wardrobe (ownership + outer/under memory) ----------
		'tshirtState', 'braState', 'pantiesState', 'jeansState',
		'shortsState', 'skirtState',
		'stockingsState1', 'stockingsState2', 'stockingsState3',
		'footState1', 'footState2', 'footState3',
		'tshirtState0', 'tshirtState1', 'tshirtState2', 'tshirtState3',
		'braState0', 'braState1', 'braState2', 'braState3',
		'pantiesState0', 'pantiesState1', 'pantiesState2', 'pantiesState3',
		'jeansState0', 'jeansState1', 'jeansState2', 'jeansState3',
		'shortsState0', 'shortsState1', 'shortsState2', 'shortsState3',
		'skirtState0', 'skirtState1', 'skirtState2', 'skirtState3',
		'neckChokerState1', 'neckChokerState2', 'neckChokerState3',
		'rememberTopOuter', 'rememberBottomOuter',
		'rememberTopUnder', 'rememberBottomUnder',
		'rememberBottomStockings',
		'lostClothing',

		// --- Quest / story progression --------------------------
		'firstVisitWitchShop', 'firstVisitDeliveryHub',
		'gotKeyFromWitch', 'succubus', 'exorcismQuestStage',
		'gotCursedItem', 'isCIDildo', 'isCIButtplug', 'isCIBeads', 'isCIHDildo',
		'eventToolsOneStart', 'wardenClothesStage',
		'weakenTheGhostQuest', 'isWeakenGhost', 'moneyFromWeakenTheGhost',
		'amulet', 'ectoplasmQuestStage', 'contracts',
		'wishesCount', 'monkeyPawLearned', 'MonkeyPawStage', 'wishAnything',
		'hasQuestForRescue', 'rescueStage', 'hasRescueClue',
		'rescueJadePossessed', 'rescueVictoriaPossessed', 'rescueGirls',
		'ghostSpiritEventStage', 'ghostMareEventStart', 'ghostMareEventStage',
		'videoEventSpecialMyling',
		'relationshipWithRain',
		'trainer1TipReceived', 'trainer1CoachingCost',
		'isDiscountTrainer1', 'trainer3CoachingCost',
		'relationEmily', 'trainingCost',
		'dialogBlake', 'relationshipBlake',
		'meetBrook', 'foundTips', 'foundComics', 'foundBrook',
		'foundGirl', 'foundGuy', 'comicsReading',
		'foundDesecratedBook', 'tornPagesFound',
		'isBrookePossessed', 'mcSleptWithCameraOn', 'holyWaterIsCollected',
		'deliveryCompletedShifts', 'deliveryBestStreak', 'deliveryTotalTips',
		'jobMoneySuccessed', 'jobMoneyFailed',
		'ghostInfoCollected', 'knowledgeUsed',
		'highpriestess', 'bansheeAbility', 'cthulionAbility',
		'achievements', 'meta',

		// --- Companion stat rows + relationship flags -----------
		'companion',
		'brook', 'alice', 'blake',
		'isCompChosen', 'meetAlice', 'aliceWorkDone'
	];

	function resetToFallback(vars) {
		if (!vars || typeof vars !== 'object') { return; }

		// Snapshot only the keys we carry forward.
		var preserved = {};
		PRESERVE_KEYS.forEach(function (k) {
			if (vars[k] !== undefined) { preserved[k] = vars[k]; }
		});

		// Wipe every existing field, then re-seed defaults via the
		// canonical initState() path so we automatically pick up any
		// new fields it adds in the future.
		Object.keys(vars).forEach(function (k) { delete vars[k]; });
		try {
			setup.Game.initState(vars);
		}
		catch (ex) {
			console.error('SaveMigration.resetToFallback: initState failed', ex);
		}

		// Restore preserved fields. mc.frozenBeauty is a hunt-only
		// override; stripping it ensures the post-reset MC shows a
		// real beauty value.
		Object.keys(preserved).forEach(function (k) { vars[k] = preserved[k]; });
		if (vars.mc && typeof vars.mc === 'object') {
			delete vars.mc.frozenBeauty;
		}

		// Drop her in the Livingroom at 11 AM, regardless of where
		// the old save left her.
		vars.hours    = 11;
		vars.minutes  = 0;
		vars.meridiem = 'AM';
		vars.huntMode = 0;
		vars.run      = null;
	}
	setup.resetSaveToFallback = resetToFallback;

	/*
	* Strip values that can't survive a JSON round-trip. These show up when
	* someone accidentally does `<<set $foo to $('#bar')>>` or stashes a
	* function on a variable. SugarCube's own clone() will usually drop them
	* silently, but leaving them in place can cause reload exceptions.
	*/
	function scrubNonSerialisable (obj, seen) {
		if (obj === null || typeof obj !== 'object') {
			return;
		}
		if (seen.has(obj)) {
			return;
		}
		seen.add(obj);

		Object.keys(obj).forEach(function (key) {
			var v = obj[key];
			if (v === null || v === undefined) {
				return;
			}
			var t = typeof v;
			if (t === 'function') {
				delete obj[key];
				return;
			}
			// jQuery object, DOM node, Window, etc.
			if (t === 'object' && (
				(typeof window !== 'undefined' && v === window) ||
				(v.nodeType !== undefined && typeof v.nodeName === 'string') ||
				(typeof jQuery !== 'undefined' && v instanceof jQuery)
			)) {
				delete obj[key];
				return;
			}
			if (v instanceof Map || v instanceof Set || v instanceof WeakMap || v instanceof WeakSet) {
				// Map/Set don't JSON.stringify -- SugarCube's own clone handles
				// them, but only via a revive wrapper, so just drop unknown ones.
				delete obj[key];
				return;
			}
			if (t === 'object') {
				scrubNonSerialisable(v, seen);
			}
		});
	}

	if (typeof Save !== 'undefined' && Save.onSave && typeof Save.onSave.add === 'function') {
		Save.onSave.add(function (save) {
			try {
				save.metadata = save.metadata || {};
				save.metadata.version = SAVE_VERSION;
				save.metadata.savedAt = Date.now();

				// Best-effort scrub of the current moment only. We don't walk
				// the full history because (a) SugarCube has already cloned it
				// and (b) mutating older moments confuses the undo stack.
				if (save.state && Array.isArray(save.state.history) && save.state.history.length) {
					var idx = typeof save.state.index === 'number'
						? save.state.index
						: save.state.history.length - 1;
					var moment = save.state.history[idx];
					if (moment && moment.variables) {
						scrubNonSerialisable(moment.variables, new Set());
					}
				}
			}
			catch (ex) {
				console.error('SaveMigration.onSave failed:', ex);
				// Never rethrow -- a failed scrub is better than a failed save.
			}
		});
	}

	if (typeof Save !== 'undefined' && Save.onLoad && typeof Save.onLoad.add === 'function') {
		Save.onLoad.add(function (save) {
			try {
				if (!save || !save.state || !Array.isArray(save.state.history)) {
					return;
				}

				var idx = typeof save.state.index === 'number'
					? save.state.index
					: save.state.history.length - 1;

				// Apply defaults to the *current* moment. The player will only
				// ever see that one; older moments are just undo history and
				// will get PassageReady's belt-and-braces pass if rewound into.
				var moment = save.state.history[idx];
				if (moment && moment.variables) {
					applyDefaults(moment.variables);
				}

				// Cross-version fallback. Per-version migrations cover the
				// shape changes we know about, but a save stamped with a
				// different SAVE_VERSION than the running build has been
				// through (or *will go through*) edits we can't audit at
				// load time. Carry the player's earned progression forward
				// and reset the rest -- safer than trusting a partial
				// migration to a build whose schema this save predates.
				var FALLBACK_PASSAGE = 'Livingroom';
				save.metadata = save.metadata || {};
				var loadedFrom = Number(save.metadata.version) || 1;
				if (moment && moment.variables && loadedFrom !== SAVE_VERSION) {
					resetToFallback(moment.variables);
					// Throw away undo history -- post-reset, older moments
					// hold variable snapshots that are inconsistent with the
					// reset present, so "Back" would leak stale state.
					moment.title = FALLBACK_PASSAGE;
					save.state.history = [moment];
					save.state.index   = 0;
				}

				// Redirect any moment whose passage was renamed or removed
				// to a known-safe fallback. Otherwise SugarCube throws
				// "the passage X does not exist" and refuses the load.
				if (typeof Story !== 'undefined' && typeof Story.has === 'function'
					&& Story.has(FALLBACK_PASSAGE)) {
					save.state.history.forEach(function (m) {
						if (m && typeof m.title === 'string' && !Story.has(m.title)) {
							m.title = FALLBACK_PASSAGE;
						}
					});
				}

				// Record what version the save was loaded at, so later code
				// can tell "this was a v1 save, run one-time fixups".
				save.metadata.loadedFromVersion = loadedFrom;
				save.metadata.version = SAVE_VERSION;
			}
			catch (ex) {
				console.error('SaveMigration.onLoad failed:', ex);
				// Swallow: a migration failure must not block loading an
				// otherwise-valid save. PassageReady still has fallbacks.
			}
		});
	}
}());
