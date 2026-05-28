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
	   - scenePassage:passage name that plays/initiates the scene
	   - hint:        short teaser shown on locked cards */
	var CATALOGUE = Object.freeze([
		// Delivery Hub 
		{
			id: 'delivery_manager_hj', title: 'Office Handjob', location: 'Delivery Hub',
			scenePassage: 'DeliveryManagerHandjob',
			hint: 'A back-room favor for the manager.'
		},
		{
			id: 'delivery_manager_bj', title: 'Office Blowjob', location: 'Delivery Hub',
			scenePassage: 'DeliveryManagerBlowjob',
			hint: 'Industrial carpet, certificates on the wall.'
		},
		{
			id: 'delivery_manager_sex', title: 'Office Sex', location: 'Delivery Hub',
			scenePassage: 'DeliveryManagerSex',
			hint: 'The couch in the back, broken springs and all.'
		},
		{
			id: 'delivery_special', title: 'Earn the Tip', location: 'Delivery Hub',
			scenePassage: 'DeliverySpecialUnsafe',
			hint: 'A customer who wants more than the package.'
		},

		/* Delivery Events -- the four item-keyed customer encounters
		   that all dispatch through DeliveryEventStart. Each setup()
		   plants the order state via setup.Delivery.cheatReplayOrder so
		   the switch picks the right branch; replayPassages allows the
		   multi-passage chains. */
		{
			id: 'delivery_burger', title: 'Burgers and Bud', location: 'Delivery Events',
			scenePassage: 'DeliveryEventStart',
			replayPassages: ['DeliveryEventStart', 'DeliveryEvent1', 'DeliveryEvent2'],
			skipAutoRegister: true,
			setup: function () { setup.Delivery.cheatReplayOrder('burgers'); },
			hint: 'A stoner with no cash and busy hands.'
		},
		{
			id: 'delivery_pizza', title: 'Pizza, Pegged', location: 'Delivery Events',
			scenePassage: 'DeliveryEventStart',
			replayPassages: ['DeliveryEventStart', 'DeliveryEvent1', 'DeliveryEvent2'],
			skipAutoRegister: true,
			setup: function () { setup.Delivery.cheatReplayOrder('pizza'); },
			hint: 'Her strap, the floor, the receipt.'
		},
		{
			id: 'delivery_package', title: 'Package Negotiation', location: 'Delivery Events',
			scenePassage: 'DeliveryEventStart',
			replayPassages: ['DeliveryEventStart', 'DeliveryEvent1', 'DeliveryEvent2'],
			skipAutoRegister: true,
			setup: function () {
				setup.Delivery.cheatReplayOrder('package');
				/* Package's low-lust fork terminates inside DeliveryEventStart;
				   the replay always takes the full Start -> Event1 -> Event2
				   path so the gallery card matches one scene end-to-end. */
				if (setup.Mc.lust() < 50) setup.Mc.setLust(50);
			},
			hint: 'A doorstep proposition with no exit.'
		},
		{
			id: 'delivery_papers', title: 'Reading the News', location: 'Delivery Events',
			scenePassage: 'DeliveryEventStart',
			replayPassages: ['DeliveryEventStart', 'DeliveryEvent1'],
			skipAutoRegister: true,
			setup: function () {
				setup.Delivery.cheatReplayOrder('newspapers');
				/* Papers gates the flirt branch on corruption >= 3 AND
				   post-bump lust >= 40. Bump both above the line so the
				   replay always plays the full scene -- the snapshot
				   restores the player's real values on exit. */
				if (setup.Mc.corruption() < 3) setup.Mc.setCorruption(3);
				if (setup.Mc.lust() < 30) setup.Mc.setLust(30);
			},
			hint: 'A long lunch with a friendly customer.'
		},

		// Church
		{
			id: 'church_priest', title: 'Confession Reward', location: 'Church',
			scenePassage: 'ToolsEventChurch',
			hint: "Father's gratitude in liquid form."
		},

		// Gym
		{
			id: 'gym_trainer_1', title: 'Personal Training', location: 'Gym',
			scenePassage: 'GymTrainerEvent1Start',
			hint: "The trainer's idea of cool-down."
		},
		{
			id: 'gym_trainer_2', title: 'Hands-On Coaching', location: 'Gym',
			scenePassage: 'GymTrainerEvent2Start',
			hint: 'Anal cardio.'
		},
		{
			id: 'gym_group', title: 'Group Session', location: 'Gym',
			scenePassage: 'GymGroupEvent1Start',
			hint: 'Toys for the whole class.'
		},

		// Park
		{
			id: 'park_mugging', title: 'Stripped on the Trail', location: 'Park',
			scenePassage: 'ParkMugging',
			hint: 'A gun, an empty path, and a long walk home.'
		},

		// Witch's House
		{
			id: 'witch_tentacles', title: 'Sticky Fingers', location: "Witch's House",
			scenePassage: 'WitchTentaclesEvent',
			hint: 'Khadija keeps her own counsel about thieves.'
		},

		// Home -- Bedroom
		{
			id: 'home_cursed_bed', title: 'Hole in the Mattress', location: 'Home -- Bedroom',
			scenePassage: 'CursedBedEvent',
			hint: 'Something glowing under the bed.'
		},
		{
			id: 'home_tentacles_sleep', title: 'Tentacle Nightmare', location: 'Home -- Bedroom',
			scenePassage: 'TentaclesEventSleep',
			hint: 'The dark room with no exit.'
		},
		{
			id: 'home_tentacles_nap', title: 'Afternoon Tentacles', location: 'Home -- Bedroom',
			scenePassage: 'TentaclesEventNap',
			hint: 'They cross the floor while you watch.'
		},
		{
			id: 'home_summon_spirit', title: 'Summon: Spirit', location: 'Home -- Bedroom',
			scenePassage: 'SummonSpirit',
			hint: 'Roughed up by the spirit you called.'
		},
		{
			id: 'home_summon_mare', title: 'Summon: Mare', location: 'Home -- Bedroom',
			scenePassage: 'SummonMare',
			hint: 'Paralyzed in your own bed.'
		},
		{
			id: 'home_summon_tentacles', title: 'Summon: Tentacles', location: 'Home -- Bedroom',
			scenePassage: 'SummonTentacles',
			hint: 'You called them yourself.'
		},
		{
			id: 'home_summon_twins', title: 'Summon: Twins', location: 'Home -- Bedroom',
			scenePassage: 'SummonTwins',
			hint: 'Two cocks, no resistance.'
		},
		{
			id: 'home_nap_spirit', title: 'Naptime Visitor', location: 'Home -- Bedroom',
			scenePassage: 'GhostSpecialEventNapSpirit',
			hint: 'You barely woke for that one.'
		},
		{
			id: 'home_sleep_spirit', title: 'Bedside Manners', location: 'Home -- Bedroom',
			scenePassage: 'GhostSpecialEventSleepSpirit',
			hint: "Hands you can't quite see."
		},

		// Home -- Livingroom
		{
			id: 'home_masturbate', title: 'Quiet Afternoon', location: 'Home -- Livingroom',
			scenePassage: 'Masturbate',
			hint: 'A moment to yourself.'
		},
		{
			id: 'home_cursed_tv', title: 'Yourself On Screen', location: 'Home -- Livingroom',
			scenePassage: 'CursedTVEvent',
			hint: 'The channel changed to you.'
		},
		{
			id: 'home_cursed_pc', title: 'The Old Tenant', location: 'Home -- Livingroom',
			scenePassage: 'CursedPCEvent',
			hint: 'A ghost too feeble to bother you. Until.'
		},
		{
			id: 'home_tentacles_tv', title: 'TV Tentacles', location: 'Home -- Livingroom',
			scenePassage: 'TentaclesEventTV',
			hint: 'They came for the commercial break.'
		},
		{
			id: 'home_tentacles_pc', title: 'Tentacles Online', location: 'Home -- Livingroom',
			scenePassage: 'TentaclesEventPC',
			hint: "They've stopped scaring you."
		},
		{
			id: 'home_succubus_tv', title: 'Succubus on TV', location: 'Home -- Livingroom',
			scenePassage: 'SuccubusEventTV',
			hint: "She'll help you, baby."
		},
		{
			id: 'home_succubus_pc', title: 'Succubus at the PC', location: 'Home -- Livingroom',
			scenePassage: 'SuccubusPCEvent',
			hint: 'Eyes piercing through you.'
		},
		{
			id: 'home_tv_spirit', title: 'Sofa Sleep Visitor', location: 'Home -- Livingroom',
			scenePassage: 'GhostSpecialEventTVSpirit',
			hint: "A dick where it shouldn't be."
		},
		{
			id: 'home_mare_dream', title: 'Mare on the Cam', location: 'Home -- Livingroom',
			scenePassage: 'GhostSpecialEventMare',
			hint: 'The hand on the cam was yours.'
		},

		// Home -- Bathroom
		{
			id: 'home_cursed_shower', title: 'Cursed Shower', location: 'Home -- Bathroom',
			scenePassage: 'CursedShowerEvent',
			hint: 'A dildo where the shampoo should be.'
		},
		{
			id: 'home_cursed_bath', title: 'Black Bathwater', location: 'Home -- Bathroom',
			scenePassage: 'CursedBathEvent',
			hint: 'The tub drops into a void.'
		},
		{
			id: 'home_twins_event', title: 'Twins in the Bath', location: 'Home -- Bathroom',
			scenePassage: 'TheTwinsEvent',
			hint: 'Both of them, in turns.'
		},

		/* Hunt -- scenes the MC lives through inside a haunted house.
		   BaitOrgasm and UseCursedItem normally consume one-shot run
		   state (baitOrgasmPending / gotCursedItem), so they snapshot
		   those flags above and either rely on the no-op-when-absent
		   semantics (BaitOrgasm) or plant the state via a cheat helper
		   (UseCursedItem). HuntEventSuccubus is a pure video scene with
		   no state writes -- it just registers and plays. */
		{
			id: 'hunt_event_succubus', title: 'Succubus Rescue', location: 'Hunt',
			scenePassage: 'HuntEventSuccubus',
			hint: 'She showed up before the ghost did.'
		},
		{
			id: 'hunt_bait_orgasm', title: 'Bait Backfires', location: 'Hunt',
			scenePassage: 'BaitOrgasm',
			setup: function () {
				/* BaitOrgasm gotos HuntOverSanity if sanity is at or
				   below zero on entry. Snapshot already covers mc.sanity,
				   so a real value of 0 is fine -- bump above the gate
				   for the replay window; restore puts the player back. */
				if (setup.Mc.sanity() <= 0) setup.Mc.setSanity(50);
			},
			hint: 'Lust at cap and the ghost on your back.'
		},
		{
			id: 'hunt_cursed_item', title: 'Cursed Plaything', location: 'Hunt',
			scenePassage: 'UseCursedItem',
			setup: function () {
				/* Plant a held cursed item so cursedItemVideo() resolves
				   a video and the consume call has something to clear.
				   The snapshot above captures all four type flags so
				   the player's real carrier state is preserved. */
				setup.Witch.cheatGrantCursedItem('dildo');
			},
			hint: 'The witch buys these back. For a reason.'
		},

		// Hunt Aftermath
		{
			id: 'aftermath_wraith', title: 'Lost in the Forest', location: 'Hunt Aftermath',
			scenePassage: 'GhostSpecialEventWraith',
			hint: 'Rope, woods, helpful strangers.'
		},
		{
			id: 'aftermath_myling', title: 'Walk of Shame', location: 'Hunt Aftermath',
			scenePassage: 'GhostSpecialEventMyling',
			hint: 'They keep staring at you.'
		},
		{
			id: 'aftermath_spirit_walk', title: 'Companion Visitor', location: 'Hunt Aftermath',
			scenePassage: 'GhostSpecialEventSpirit',
			hint: 'Someone joins you and your friend in bed.'
		}
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
		'hours', 'minutes', 'dailySeed',
		'earnedMoney',
		'currentOrder', 'order1', 'order2', 'order3',
		/* Cursed-item carry state -- UseCursedItem reads the type flag
		   to pick a video, then consumes the held flag. Snapshot so a
		   replay doesn't clear a real carried item. */
		'gotCursedItem',
		'isCIDildo', 'isCIButtplug', 'isCIBeads', 'isCIHDildo',
		/* Bait-orgasm flag -- BaitOrgasm reads this to gate consumption,
		   and writes false on consume. Snapshot so a replay can't
		   absorb a real pending orgasm the player was about to live. */
		'baitOrgasmPending'
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
		var entry = byId(id);
		if (!entry) return false;
		var b = store();
		b.active = id;
		b.snapshot = takeSnapshot();
		/* Optional per-entry stub. Catalogue entries that share a
		   dispatcher passage (the four delivery-event scenes all start
		   at DeliveryEventStart) or need contrived state planted
		   (UseCursedItem needs a held cursed item, BaitOrgasm needs
		   sanity > 0) use setup() to prepare. Run after the snapshot
		   so the writes are undone on exitReplay. Most entries omit
		   the field; guard against the missing case. */
		if (typeof entry.setup === 'function') entry.setup();
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

	/* Cheat hook: mark every catalogued scene seen. Wired into the
	   in-game cheat dialog so a tester can open the gallery without
	   having to grind through each scene's unlock path. Goes through
	   markSeen so the no-op-on-duplicate semantics are preserved. */
	function cheatUnlockAll() {
		CATALOGUE.forEach(function (entry) {
			markSeen(entry.id);
		});
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
		/* Multi-passage chains (e.g. DeliveryEventStart -> DeliveryEvent1
		   -> DeliveryEvent2) declare every step in replayPassages so the
		   containment check lets the player walk the chain without being
		   bounced back to the gallery. */
		if (active && Array.isArray(active.replayPassages) &&
			active.replayPassages.indexOf(name) !== -1) return;

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
	   guaranteed present at module-eval time.

	   Entries with skipAutoRegister opt out: they share a dispatcher
	   passage with other scenes (DeliveryEventStart routes burger /
	   pizza / package / papers from one passage), and the 1:1
	   passage→sceneId registry can't represent that fan-out. Their
	   unlock side-band is wired by the dispatcher below. */
	CATALOGUE.forEach(function (entry) {
		if (entry.skipAutoRegister) return;
		setup.SceneEvents.register(entry.scenePassage, entry.id);
	});

	setup.SceneEvents.on(setup.SceneEvents.Event.VIEWED, function (ctx) {
		if (isReplaying()) return;
		markSeen(ctx.sceneId);
	});

	/* The four delivery-event scenes share DeliveryEventStart. The
	   1:1 SceneEvents registry can credit only one at a time, so we
	   bypass the auto-register path (skipAutoRegister) and resolve the
	   sceneId at runtime from the active order. We emit VIEWED via
	   the bus rather than calling markSeen() directly so any future
	   SceneEvents subscriber (achievements, etc.) still sees the
	   canonical event. Replay-active visits skip -- the auto-mark
	   subscriber would do the same. */
	function dispatchDeliveryEventVisit(ev) {
		var name = ev && ev.passage && ev.passage.name;
		if (name !== 'DeliveryEventStart') return;
		if (isReplaying()) return;
		var type = setup.Delivery.currentEventType();
		if (!type) return;
		var sceneId = 'delivery_' + type;
		if (!byId(sceneId)) return;
		setup.SceneEvents.emit(setup.SceneEvents.Event.VIEWED, {
			sceneId: sceneId,
			passageName: name
		});
	}

	if (typeof $ !== 'undefined') {
		$(document).on(':passagestart', containReplay);
		$(document).on(':passagestart', dispatchDeliveryEventVisit);
	}

	return {
		OWNED_VARS: OWNED_VARS,
		all: all,
		byId: byId,
		byPassage: byPassage,
		hasSeen: hasSeen,
		markSeen: markSeen,
		seenCount: seenCount,
		totalCount: totalCount,
		byLocation: byLocation,
		activeId: activeId,
		activeEntry: activeEntry,
		isReplaying: isReplaying,
		enterReplay: enterReplay,
		exitReplay: exitReplay,
		cheatUnlockAll: cheatUnlockAll
	};
})();
