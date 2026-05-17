/*
 * Centralized state queries and mutations for the missing-women /
 * rescue quest line. Passages should call into setup.MissingWomen
 * instead of testing the underlying $variables directly, so the
 * conditions live in one place.
 */
/* Discrete states for $hasQuestForRescue (the rescue quest line's
   lifecycle bit). Use setup.RescueQuestState.X instead of bare ints. */
setup.RescueQuestState = Object.freeze({
	AVAILABLE: 0,
	ACTIVE:    1,
	FAILED:    2,
	SUCCEEDED: 3
});

setup.MissingWomen = (function () {
	function sv() { return State.variables; }
	function pickRandom(arr) {
		return arr[Math.floor(Math.random() * arr.length)];
	}

	/* Per-girl scene catalogue. Each girl has a slug (path component),
	   a list of "chapters" (random pool of variant clip indices + an end
	   clip), and the name pattern for the "stay" clip set used by
	   RescueStay. Add a new girl by extending this map. */
	var RESCUE_GIRLS = Object.freeze({
		Victoria: {
			slug: "victoria",
			chapters: [
				{ id: 10, variants: [0, 1, 2, 3, 4, 5, 6], end: "10-end.mp4" },
				{ id: 11, variants: [0, 1, 2, 3],          end: "11-end.mp4" },
				{ id: 12, variants: [0, 1, 2, 3, 4, 5, 6], end: "12-end.mp4" },
				{ id: 13, variants: [0, 1, 2, 3, 4],       end: "13-end.mp4" }
			],
			stay: { kind: "toggle", base: "victoriaboth", endClip: "victoriaend.mp4" }
		},
		Jade: {
			slug: "jade",
			chapters: [
				{ id: 10, variants: [0, 1, 2, 3, 4], end: "10-end.mp4" },
				{ id: 11, variants: [0, 1, 2, 3],    end: "11-end.mp4" },
				{ id: 12, variants: [0, 1, 2, 3],    end: "12-end.mp4" }
			],
			stay: { kind: "toggle", base: "jadeboth", endClip: "jadeend.mp4" }
		},
		Julia: {
			slug: "julia",
			chapters: [
				{ id: 10, variants: [0, 1, 2, 3], end: "10-end.mp4" },
				{ id: 11, variants: [0, 1, 2, 3], end: "11-end.mp4" }
			],
			stay: { kind: "toggle", base: "juliaboth", endClip: "juliaend.mp4" }
		},
		Nadia: {
			slug: "nadia",
			chapters: [
				{ id: 10, variants: [0, 1, 2, 3, 4, 5], end: "10-end.mp4" },
				{ id: 11, variants: [1, 2, 3, 4, 5],    end: "11-end.mp4" },
				{ id: 12, variants: [1, 2, 3, 4, 5],    end: "12-end.mp4" }
			],
			stay: { kind: "toggle", base: "nadiaboth", endClip: "nadiaend.mp4" }
		},
		Ash: {
			slug: "ash",
			chapters: [
				{ id: 10, variants: [1, 2, 3, 4], end: "11end.mp4" },
				{ id: 11, variants: [1, 2, 3, 4], end: "11end.mp4" }
			],
			stay: { kind: "ash", base: "AshBoth", initial: "ash-both0.mp4", endClip: "ash-both-end.mp4" }
		}
	});

	function chapterPaths(slug, chapter) {
		return chapter.variants.map(function (v) {
			return "characters/rescue/" + slug + "/" + chapter.id + "." + v + ".mp4";
		});
	}

	/* Variables owned by this controller. Other controllers should
	   query these only through the API methods below. */
	var OWNED_VARS = Object.freeze([
		'hasQuestForRescue',
		'rescueQuest',
		'rescue',
		'rescueStage',
		'rescueHouse',
		'randomRescuePhotoNumber',
		'hasRescueClue',
		'currentRescueGirl',
		'rescueJadePossessed',
		'rescueVictoriaPossessed',
		'rescueGirls',
		'rescueRandomGirls',
		'videoRescueEvent',
		'tornStyles',
		'tornStyleRandom'
	]);

	var api = {
		OWNED_VARS: OWNED_VARS,
		// --- Holy water -------------------------------------------
		hasHolyWater: function () {
			return setup.Home.hasHolyWater();
		},
		useHolyWater: function () {
			setup.Home.consumeHolyWater();
		},

		// --- Quest stage predicates --------------------------------
		// (isQuestAvailable / hasActiveQuest / questFailed / questSucceeded
		// fold into the defineStageAccessors block at the bottom.)
		mustReturnToNun: function () {
			var s = sv().hasQuestForRescue;
			var Q = setup.RescueQuestState;
			return s === Q.FAILED || s === Q.SUCCEEDED;
		},

		// --- Task board timing ------------------------------------
		boardPostingsOutToday: function () {
			var h = setup.Time.hours();
			return h >= 18 && h < 24;
		},
		// (rescue / rescueQuest are registered with setup.Cooldowns
		// at the bottom of this file; daily reset flows through
		// setup.Tick.resetCooldowns. ensureBoardCooldowns below still
		// zeros undefined values for legacy saves.)
		boardOnCooldown: function () {
			return setup.Cooldowns.onCooldown('rescueQuest');
		},

		// --- Stay / corruption gate -------------------------------
		canStaySubmissive: function () {
			return setup.Mc.corruption() >= 6;
		},

		// --- House search ------------------------------------------
		canSearchHouse: function () {
			return setup.Mc.energy() >= 1;
		},
		searchTooLate: function () {
			// Mirrors legacy "after 6 p.m. it's pointless" check on
			// rescueHouse, driven by the failed-quest state.
			return this.questFailed();
		},
		isCorrectHouse: function () {
			return sv().randomRescuePhotoNumber === sv().rescueHouse;
		},
		canResolveRescue: function () {
			return sv().rescueStage < 2 && this.isCorrectHouse() && this.hasActiveQuest();
		},
		hasRescueClue: function () {
			return sv().hasRescueClue === 1;
		},

		// --- Rescue event outcome ---------------------------------
		rescueEventAuto: function () {
			return sv().rescueStage === 0;
		},
		rescueEventRolls: function () {
			return sv().rescueStage === 1 && setup.Time.hours() < 18;
		},
		rollRescueSuccess: function () {
			var chance = 100 - (setup.Time.hours() * 100 / 18);
			return random(1, 100) <= chance;
		},
		/* :: RescueEvent entry: branches on the quest stage and a
		   time-of-day roll. Returns 'success' or 'possessed' so the
		   caller can <<include>> the matching follow-up. */
		rescueEventOutcome: function () {
			if (this.rescueEventAuto())  return 'success';
			if (this.rescueEventRolls()) return this.rollRescueSuccess() ? 'success' : 'possessed';
			return 'possessed';
		},

		// --- Girl-specific dispatch --------------------------------
		possessedPassageFor: function (girl) {
			switch (girl) {
				case 'Victoria': return 'RescueVictoriaPossessed';
				case 'Jade':     return 'RescueJadePossessed';
				case 'Julia':    return 'RescueJuliaPossessed';
				case 'Nadia':    return 'RescueNadiaPossessed';
				case 'Ash':      return 'RescueAshPossessed';
				default:         return null;
			}
		},

		// --- Mutations / accessors used by rescue passages --------
		setQuestForRescueStarted: function () {
			sv().hasQuestForRescue = setup.RescueQuestState.ACTIVE;
			sv().rescueStage = 0;
		},
		sleepOffHoursAfterEvent: function () {
			setup.Time.addHours(3);
		},

		// --- Task board state --------------------------------------
		ensureBoardCooldowns: function () {
			var s = sv();
			if (s.rescue === undefined) { s.rescue = 0; }
			if (s.rescueQuest === undefined) { s.rescueQuest = 0; }
		},
		initRescueGirlPool: function (allGirls) {
			sv().rescueGirls = allGirls;
		},
		rollBoardGirls: function () {
			var s = sv();
			setup.Cooldowns.start('rescue');
			s.rescueRandomGirls = [];
			var girls = s.rescueGirls || [];
			var index1 = Math.floor(Math.random() * girls.length);
			s.rescueRandomGirls.push(girls[index1]);
			var remaining = girls.filter(function (_, i) { return i !== index1; });
			var index2 = Math.floor(Math.random() * remaining.length);
			s.rescueRandomGirls.push(remaining[index2]);
		},

		// --- Rescue house / clue accessors -------------------------
		rescueHouseImage: function (n) {
			return "characters/rescue/house/" + n + ".jpg";
		},
		setRescueClueFound: function () { sv().hasRescueClue = 1; },
		clearRescueClue:   function () { sv().hasRescueClue = 0; },

		// --- Rescue quest state -----------------------------------
		// (resetQuestToAvailable / markQuestFailed / markQuestSucceeded
		// fold into the defineStageAccessors block at the bottom.)

		// --- Video pool --------------------------------------------
		startRescueBoardCooldown: function () { setup.Cooldowns.start('rescueQuest'); },

		// --- Rescue scene (per-girl watch loop) -------------------
		rescueGirlConfig: function (girl) { return RESCUE_GIRLS[girl] || null; },
		rescueGirlNames: function () { return Object.keys(RESCUE_GIRLS); },
		/* Roll a chapter, build the variant pool, and seed
		   $videoRescueEvent with the opening clip. Returned scene
		   object is the live state passed back to advance/end. */
		initRescueScene: function (girl) {
			var cfg = RESCUE_GIRLS[girl];
			if (!cfg) return null;
			var chapter = pickRandom(cfg.chapters);
			var srcs = chapterPaths(cfg.slug, chapter);
			var initial = pickRandom(srcs);
			var scene = {
				slug: cfg.slug,
				chapterId: chapter.id,
				srcs: srcs,
				used: [initial],
				current: initial,
				endSrc: "characters/rescue/" + cfg.slug + "/" + chapter.end
			};
			sv().videoRescueEvent = initial;
			return scene;
		},
		/* Pick the next variant clip, avoiding already-shown clips
		   until the pool is exhausted (then reset). */
		advanceRescueScene: function (scene) {
			var remaining = scene.srcs.filter(function (s) {
				return scene.used.indexOf(s) === -1;
			});
			if (remaining.length === 0) {
				scene.used = [];
				remaining = scene.srcs.slice();
			}
			var next = pickRandom(remaining);
			scene.used.push(next);
			scene.current = next;
			sv().videoRescueEvent = next;
			return next;
		},
		/* Switch to the chapter's terminating clip. */
		endRescueScene: function (scene) {
			scene.current = scene.endSrc;
			sv().videoRescueEvent = scene.endSrc;
			return scene.endSrc;
		},
		rescueStayConfig: function (girl) {
			var cfg = RESCUE_GIRLS[girl];
			if (!cfg) return null;
			return {
				slug: cfg.slug,
				stay: cfg.stay
			};
		},
		stayClipPath: function (slug, file) {
			return "characters/rescue/" + slug + "/" + file;
		},

		// --- Torn-photo state (task board / clue display) ---------
		seedTornStyle: function () {
			var styles = sv().tornStyles || [];
			if (!styles.length) return;
			var idx = Math.floor(Math.random() * styles.length);
			sv().tornStyleRandom = styles[idx];
			sv().randomRescuePhotoNumber = 1 + Math.floor(Math.random() * 16);
		},

		// --- EMF upgrade reward from clue --------------------------
		emfLevel: function () {
			return setup.ToolController.tierOf('emf');
		},
		upgradeEmfToLvl3: function () {
			setup.ToolController.setTier('emf', 3);
		}
	};

	// Pure $variable passthrough accessors. `key` overrides the field
	// name where the public method root differs from the underlying var
	// (rescueQuestStage <-> $hasQuestForRescue, rescueVideo <-> $videoRescueEvent,
	// jadePossessedStage <-> $rescueJadePossessed, victoriaPossessedStage <-> $rescueVictoriaPossessed).
	setup.defineAccessors(api, sv, [
		'currentRescueGirl',
		{ name: 'jadePossessedStage',         key: 'rescueJadePossessed' },
		{ name: 'victoriaPossessedStage',     key: 'rescueVictoriaPossessed' },
		{ name: 'rescueCooldown',             key: 'rescue',         set: false },
		{ name: 'rescueGirlsList',            key: 'rescueGirls',      set: false },
		'rescueRandomGirls',
		'rescueHouse',
		'randomRescuePhotoNumber',
		'rescueStage',
		{ name: 'rescueQuestStage',           key: 'hasQuestForRescue', set: false },
		{ name: 'rescueVideo',                key: 'videoRescueEvent' },
		{ name: 'tornStylesList',             key: 'tornStyles',        set: false },
		{ name: 'tornStyleRandom',            set: false }
	]);
	setup.defineStageAccessors(api, sv, 'hasQuestForRescue', setup.RescueQuestState, {
		is:   { isQuestAvailable: 'AVAILABLE', hasActiveQuest: 'ACTIVE',
				questFailed: 'FAILED', questSucceeded: 'SUCCEEDED' },
		mark: { resetQuestToAvailable: 'AVAILABLE', markQuestFailed: 'FAILED',
				markQuestSucceeded: 'SUCCEEDED' }
	});
	return api;
})();
/* Deferred to :storyready -- see ChurchController for rationale. */
$(document).one(':storyready', function () {
	setup.Cooldowns.registerDaily('rescue');
	setup.Cooldowns.registerDaily('rescueQuest');
});
