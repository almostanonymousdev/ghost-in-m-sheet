/*
 * Bedroom flashbacks: a gallery of scenes the MC has already lived
 * through. The player picks one and the original scene passage replays
 * as a memory -- video, prose, and dialogue intact, but the time skip
 * and stat deltas (lust, sanity, energy, XP, money, corruption) are
 * suppressed because she's not living it twice, just remembering.
 *
 * Architecture:
 *   - CATALOGUE is the source of truth for replayable scenes. Each
 *     entry pairs a stable id with the scene passage that originates it.
 *   - $flashbacks.seen is the per-save unlocked map. Population is
 *     driven exclusively by setup.SceneEvents.Event.VIEWED -- each
 *     CATALOGUE entry registers its passage with the bus at module
 *     load, and a single subscriber marks the scene seen on first
 *     view. There is no heuristic backfill from other controllers:
 *     a save predating this feature starts with an empty gallery and
 *     fills in as scenes are re-experienced.
 *   - $flashbacks.active is the scene id currently being replayed, or
 *     null. While non-null, the stat-delta widgets short-circuit and
 *     any navigation off the scene passage redirects back to the
 *     Flashbacks gallery -- the replay is contained to one passage.
 *     The auto-mark subscriber checks isReplaying() and skips on
 *     replay so a replay can't re-grant credit it already gave.
 */
setup.Flashbacks = (function () {
	var OWNED_VARS = Object.freeze(['flashbacks']);

	var sv = setup.sv;
	var bundle = setup.lazyBundle('flashbacks', { seen: {}, active: null });

	/* Static catalogue. Each entry is one replayable scene.
	   - id:          stable storage key; never rename without a migration
	   - title:       gallery card label
	   - location:    section header in the gallery
	   - scenePassage:passage name that plays the scene
	   - hint:        short teaser shown on locked cards */
	var CATALOGUE = Object.freeze([
		// Delivery manager arc -- linear scenes that end with a back link
		{ id: 'delivery_manager_hj',  title: 'Office Handjob',  location: 'Delivery Hub',
		  scenePassage: 'DeliveryManagerHandjob',
		  hint: 'A back-room favor for the manager.' },
		{ id: 'delivery_manager_bj',  title: 'Office Blowjob',  location: 'Delivery Hub',
		  scenePassage: 'DeliveryManagerBlowjob',
		  hint: 'Industrial carpet, certificates on the wall.' },
		{ id: 'delivery_manager_sex', title: 'Office Sex',      location: 'Delivery Hub',
		  scenePassage: 'DeliveryManagerSex',
		  hint: 'The couch in the back, broken springs and all.' },

		// Home / Livingroom PC
		{ id: 'home_masturbate',      title: 'Quiet Afternoon', location: 'Home',
		  scenePassage: 'Masturbate',
		  hint: 'A moment to yourself.' },

		// Church
		{ id: 'church_priest_end',    title: 'Confession Reward', location: 'Church',
		  scenePassage: 'ToolsEventChurchEnd',
		  hint: "Father's gratitude in liquid form." }
	]);

	function store() { return bundle(); }
	function seenMap() {
		var b = store();
		if (!b.seen || typeof b.seen !== 'object') b.seen = {};
		return b.seen;
	}

	function byId(id) {
		for (var i = 0; i < CATALOGUE.length; i++) {
			if (CATALOGUE[i].id === id) return CATALOGUE[i];
		}
		return null;
	}

	function byPassage(passageName) {
		for (var i = 0; i < CATALOGUE.length; i++) {
			if (CATALOGUE[i].scenePassage === passageName) return CATALOGUE[i];
		}
		return null;
	}

	function all() { return CATALOGUE.slice(); }

	function hasSeen(id) { return !!seenMap()[id]; }

	function markSeen(id) {
		if (!byId(id)) return false;
		var m = seenMap();
		if (m[id]) return false;
		m[id] = true;
		return true;
	}

	function seenCount() {
		var m = seenMap();
		var n = 0;
		for (var k in m) if (Object.prototype.hasOwnProperty.call(m, k) && m[k]) n++;
		return n;
	}

	function totalCount() { return CATALOGUE.length; }

	function byLocation() {
		var grouped = {};
		for (var i = 0; i < CATALOGUE.length; i++) {
			var e = CATALOGUE[i];
			if (!grouped[e.location]) grouped[e.location] = [];
			grouped[e.location].push(e);
		}
		return grouped;
	}

	function activeId() {
		var a = store().active;
		return typeof a === 'string' ? a : null;
	}
	function isReplaying() { return activeId() !== null; }
	function activeEntry() {
		var id = activeId();
		return id ? byId(id) : null;
	}

	/* Belt-and-braces state preservation. The stat-delta widgets
	   (addStat / addTime / gainXP) short-circuit during replay so the
	   bar animations don't fire and the visible HUD stays put, but
	   scenes occasionally call setup.Mc.setLust(0) or addCorruption()
	   directly -- those slip past a widget gate. A snapshot taken on
	   enterReplay and restored on exitReplay catches those direct
	   writes too. Daily cooldown flags (setup.Cooldowns.start) are
	   also snapshotted, since scene-end widgets stamp things like
	   $deliveryBJ on the way out -- without protection, a single
	   replay would burn the same-day real visit. We enumerate
	   setup.Cooldowns.listDaily() at snapshot time rather than
	   freezing a list here, so new cooldowns are picked up
	   automatically as other controllers register them. */
	var SNAPSHOT_PATHS = Object.freeze([
		'mc.lust', 'mc.sanity', 'mc.energy', 'mc.corruption',
		'mc.money', 'mc.exp', 'mc.lvl',
		'mc.percentageOfLevel', 'mc.neededForNextLevel',
		'mc.sanityMax', 'mc.lustMax', 'mc.energyMax',
		'mc.beautyBase', 'mc.beautyModifier',
		'hours', 'minutes', 'dailySeed'
	]);

	function takeSnapshot() {
		var snap = {};
		var s = sv();
		SNAPSHOT_PATHS.forEach(function (p) {
			var parts = p.split('.');
			var v = s;
			for (var i = 0; i < parts.length && v != null; i++) v = v[parts[i]];
			snap[p] = v;
		});
		setup.Cooldowns.listDaily().forEach(function (name) {
			snap[name] = s[name];
		});
		return snap;
	}

	function restoreSnapshot(snap) {
		if (!snap || typeof snap !== 'object') return;
		var s = sv();
		Object.keys(snap).forEach(function (p) {
			var parts = p.split('.');
			var target = s;
			for (var i = 0; i < parts.length - 1; i++) {
				if (target == null) return;
				target = target[parts[i]];
			}
			if (target == null) return;
			target[parts[parts.length - 1]] = snap[p];
		});
	}

	function enterReplay(id) {
		if (!byId(id)) return false;
		var b = store();
		b.active = id;
		b.snapshot = takeSnapshot();
		return true;
	}
	function exitReplay() {
		var b = store();
		if (b.snapshot) {
			restoreSnapshot(b.snapshot);
			delete b.snapshot;
		}
		b.active = null;
	}

	/* Replay containment. Distinct from the auto-mark subscriber
	   (which lives on the SceneEvents bus, below): this handler only
	   exists to keep a replay pinned to its source passage. Any
	   off-scene navigation while flashbacks.active is non-null kicks
	   the player back to the gallery and clears active so the
	   snapshot is restored. The FlashbackEnter wrapper is whitelisted
	   so the link from the gallery can hand off to the scene without
	   bouncing. */
	function containReplay(ev) {
		if (!isReplaying()) return;
		var name = ev && ev.passage && ev.passage.name;
		if (!name) return;
		if (name === 'FlashbackEnter') return;
		if (name === 'Flashbacks') { exitReplay(); return; }
		var active = activeEntry();
		if (active && name === active.scenePassage) return;

		/* Off-scene navigation during replay: bounce back to the
		   gallery. Engine.play() must be deferred (same race the
		   TickController docstring describes -- a synchronous
		   Engine.play during :passagestart loses to the outer
		   enginePlay's DOM swap, leaving State.passage flipped but
		   the DOM showing the would-be-target). Defer via
		   Engine.DOM_DELAY so the outer play finishes first. */
		exitReplay();
		setTimeout(function () { Engine.play('Flashbacks'); }, Engine.DOM_DELAY || 40);
	}

	/* Wire up the SceneEvents → unlock-map bridge and the replay
	   boundary listener. Each catalogue entry registers its source
	   passage with the bus; a single subscriber marks the scene seen
	   on first view (skipping during replay so re-watching doesn't
	   stamp credit twice). SceneEvents lives at top-level passages/
	   and Tweego evaluates uppercase-prefixed files before descending
	   into the lowercase home/ subdirectory, so setup.SceneEvents is
	   guaranteed present at module-eval time. */
	CATALOGUE.forEach(function (entry) {
		setup.SceneEvents.register(entry.scenePassage, entry.id);
	});

	setup.SceneEvents.on(setup.SceneEvents.Event.VIEWED, function (ctx) {
		if (isReplaying()) return;
		markSeen(ctx.sceneId);
	});

	if (typeof $ !== 'undefined') {
		$(document).on(':passagestart', containReplay);
	}

	return {
		OWNED_VARS:    OWNED_VARS,
		all:           all,
		byId:          byId,
		byPassage:     byPassage,
		hasSeen:       hasSeen,
		markSeen:      markSeen,
		seenCount:     seenCount,
		totalCount:    totalCount,
		byLocation:    byLocation,
		activeId:      activeId,
		activeEntry:   activeEntry,
		isReplaying:   isReplaying,
		enterReplay:   enterReplay,
		exitReplay:    exitReplay
	};
})();
