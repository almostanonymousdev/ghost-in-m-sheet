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

	/* Shared extra-snapshot bundles. Entries that strip the wardrobe,
	   activate a companion, or stamp a minimal $run reference these
	   from their extraSnapshot field rather than re-listing the paths.
	   Mirrors the relevant controller's OWNED_VARS so anything that
	   cheatStripAll / cheatActivateCompanion / cheatStampMinimalRun can
	   touch gets captured.

	   Defined here (above CATALOGUE) because the catalogue's
	   extraSnapshot fields call .concat() on them at IIFE-eval time --
	   if these declarations sat below the catalogue, var-hoisting would
	   leave them undefined at concat time and the whole controller
	   would throw on load, taking down every script that loads after
	   it (Hunt, Achievements). See the catalogue's nudity_walk_* /
	   hunt_caught_* entries. */
	var WARDROBE_PATHS = Object.freeze([
		'tshirtState', 'braState', 'pantiesState',
		'jeansState', 'shortsState', 'skirtState',
		'tshirtState0', 'tshirtState1', 'tshirtState2', 'tshirtState3',
		'braState0', 'braState1', 'braState2', 'braState3',
		'pantiesState0', 'pantiesState1', 'pantiesState2', 'pantiesState3',
		'jeansState0', 'jeansState1', 'jeansState2', 'jeansState3',
		'shortsState1', 'shortsState2', 'shortsState3',
		'skirtState1', 'skirtState2', 'skirtState3',
		'stockingsState1', 'stockingsState2', 'stockingsState3',
		'footState1', 'footState2', 'footState3',
		'neckChokerState1',
		'rememberTopOuter', 'rememberBottomOuter',
		'rememberTopUnder', 'rememberBottomUnder',
		'rememberBottomStockings',
		'isPantiesStolen', 'isBottomStolen',
		'isShirtStolen', 'isBraStolen',
		'isJeansStolen', 'isShortsStolen', 'isSkirtStolen',
		{ path: 'lostClothing', deep: true }
	]);

	/* Companion state is split across a marker ($companion = {name})
	   and per-companion stat rows ($brook / $alice / $blake). Deep
	   on all four so an in-replay setActiveLust / runHuntFailHooks
	   mutation can be reversed. */
	var COMPANION_PATHS = Object.freeze([
		{ path: 'companion', deep: true },
		{ path: 'brook', deep: true },
		{ path: 'alice', deep: true },
		{ path: 'blake', deep: true },
		'isCompChosen', 'aliceWorkDone'
	]);

	/* Hunt-lifecycle state. $run must be deep because
	   cheatStampMinimalRun mutates the existing object; huntMode is
	   primitive. Possession residue and tool timers are reset by
	   onCaughtCleanup, which the HuntOver* passages run on render. */
	var HUNT_PATHS = Object.freeze([
		{ path: 'run', deep: true },
		'huntMode',
		'exhausted',
		'priestessFreezeTriggered',
		{ path: 'tools', deep: true }
	]);

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

		/* Delivery Events -- the four item-keyed customer encounters
		   that all dispatch through DeliveryEventStart. Each setup()
		   plants the order state via setup.Delivery.cheatReplayOrder so
		   the switch picks the right branch; replayPassages allows the
		   multi-passage chains. */
		{
			id: 'delivery_special', title: 'Earn the Tip', location: 'Delivery Events',
			scenePassage: 'DeliverySpecialUnsafe',
			replayPassages: ['DeliverySpecialUnsafe', 'DeliverySpecialUnsafe2'],
			hint: 'A customer who wants more than the package.'
		},
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
				   post-addLust lust >= 40. In replay mode <<addLust>> is
				   a no-op (widgetGuiCommon's addStat short-circuits on
				   Flashbacks.isReplaying), so the catalogue has to plant
				   lust >= 40 directly -- the snapshot restores the
				   player's real values on exit. */
				if (setup.Mc.corruption() < 3) setup.Mc.setCorruption(3);
				if (setup.Mc.lust() < 40) setup.Mc.setLust(40);
			},
			hint: 'A long lunch with a friendly customer.'
		},

		// Church
		{
			/* Chain: ToolsEventChurch -> ToolsEventChurch1 -> ToolsEventChurchEnd.
			   ToolsEventChurchEnd reads priestToolEventStarted() to decide
			   between the first-time "reward + thermometer" branch and the
			   repeat "bye" branch. For a replay titled "Confession Reward"
			   we want the reward branch to render every time, so the setup
			   stub force-clears eventToolsOneStart and the extraSnapshot
			   captures it for restore. */
			id: 'church_priest', title: 'Confession Reward', location: 'Church',
			scenePassage: 'ToolsEventChurch',
			replayPassages: ['ToolsEventChurch', 'ToolsEventChurch1', 'ToolsEventChurchEnd'],
			setup: function () {
				setup.Witch.setEventToolsOneStart(0);
			},
			extraSnapshot: ['eventToolsOneStart'],
			hint: "Father's gratitude in liquid form."
		},

		// Gym
		{
			/* Chain: GymTrainerEvent1Start -> ...Start1 -> ...Start2. */
			id: 'gym_trainer_1', title: 'Personal Training', location: 'Gym',
			scenePassage: 'GymTrainerEvent1Start',
			replayPassages: ['GymTrainerEvent1Start', 'GymTrainerEvent1Start1', 'GymTrainerEvent1Start2'],
			hint: "The trainer's idea of cool-down."
		},
		{
			/* Chain: GymTrainerEvent2Start -> ...Start2. */
			id: 'gym_trainer_2', title: 'Hands-On Coaching', location: 'Gym',
			scenePassage: 'GymTrainerEvent2Start',
			replayPassages: ['GymTrainerEvent2Start', 'GymTrainerEvent2Start2'],
			hint: 'Anal cardio.'
		},
		{
			/* The orgy scene actually opens inside GroupGymTraining --
			   the linkappend reveal there plays grouptraining1.mp4 and
			   contains the "I can't resist" link forward. Using
			   GroupGymTraining as the entry recovers that lead-in. The
			   passage gates the reveal on beauty >= 50 and lust >= 50,
			   so the setup stub bumps both above the threshold (the
			   stat snapshot restores them on exit). skipAutoRegister
			   blocks the default register-by-scenePassage path because
			   any gym workout visits GroupGymTraining; we register the
			   uniquely-orgy passage GymGroupEvent1Start below the
			   catalogue instead. */
			id: 'gym_group', title: 'Group Session', location: 'Gym',
			scenePassage: 'GroupGymTraining',
			replayPassages: ['GroupGymTraining', 'GymGroupEvent1Start', 'GymGroupEvent1Start2'],
			skipAutoRegister: true,
			setup: function () {
				if (setup.Mc.beauty() < 50) setup.Mc.setBeauty(50);
				if (setup.Mc.lust() < 50) setup.Mc.setLust(50);
			},
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
		{
			/* The linkreplace inside WitchBedroom plays one of two
			   sleeping-lick videos depending on witchLateNightHour(); the
			   scene stays in this single passage, no chain needed. */
			id: 'witch_bedroom_lick', title: 'Lick Khadija', location: "Witch's House",
			scenePassage: 'WitchBedroom',
			hint: "She's asleep. You don't look away."
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
			/* The intended scene needs hasEnergyForSleepSpirit() (energy >= 5)
			   AND hasMinCorruptionForSleepSpirit() (corruption >= 5) so the
			   linkappend cascade reaches GhostSpecialEventSleepSpirit1 with
			   the orgasm + cum beats. Bump both above the threshold; the
			   stat snapshot restores the player's real values on exit. */
			id: 'home_sleep_spirit', title: 'Bedside Manners', location: 'Home -- Bedroom',
			scenePassage: 'GhostSpecialEventSleepSpirit',
			replayPassages: ['GhostSpecialEventSleepSpirit', 'GhostSpecialEventSleepSpirit1', 'GhostSpecialEventSleepSpirit2'],
			setup: function () {
				if (setup.Mc.corruption() < 5) setup.Mc.setCorruption(5);
				if (setup.Mc.energy() < 5) setup.Mc.setEnergy(5);
			},
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
			/* PC-summon scene. SuccubusPCEvent's primary linkappend body
			   reads succubusEvent.eventCD: only eventCD === 0 renders the
			   full sequence (the other values play a 1-line "she
			   disappears" wake-up). Plant eventCD = 0 + pcStage = 0 so the
			   gallery always sees the rich first-time branch; deep-snap
			   the succubusEvent bundle so the player's real cooldown /
			   stage state isn't clobbered. */
			id: 'home_succubus_pc', title: 'Succubus at the PC', location: 'Home -- Livingroom',
			scenePassage: 'SuccubusPCEvent',
			setup: function () {
				setup.Home.setSuccubusEventCD(0);
				setup.Home.setSuccubusPCEventStage(0);
			},
			extraSnapshot: [{ path: 'succubusEvent', deep: true }],
			hint: 'Eyes piercing through you.'
		},
		{
			/* TVSpirit gates the sex branch behind corruption >= 3; below
			   that it renders a 1-line "ghost vanished" wake-up. Force the
			   threshold so the gallery sees the chain (TVSpirit ->
			   TVSpirit1 -> Livingroom). mc.corruption is in SNAPSHOT_PATHS
			   already, so restore on exit is automatic. */
			id: 'home_tv_spirit', title: 'Sofa Sleep Visitor', location: 'Home -- Livingroom',
			scenePassage: 'GhostSpecialEventTVSpirit',
			setup: function () {
				if (setup.Mc.corruption() < 3) setup.Mc.setCorruption(3);
			},
			replayPassages: ['GhostSpecialEventTVSpirit1'],
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
		{
			/* Solo walk home stripped. NudityEvent renders a video off
			   the wardrobe state (naked / topless+panties / topless+bottoms)
			   and writes exhibitionism. cheatStripAll plants the naked
			   variant; the snapshot reverses both the strip and the
			   exhibitionism increment. */
			id: 'nudity_walk_solo', title: 'Walk Home Naked', location: 'Hunt',
			scenePassage: 'NudityEvent',
			setup: function () { setup.Wardrobe.cheatStripAll(); },
			extraSnapshot: WARDROBE_PATHS,
			hint: 'A long block home with nothing on.'
		},
		{
			/* Same walk home, but with a companion. NudityEventTwo calls
			   Companion.setActiveLust(100) on entry -- without a planted
			   active companion the call no-ops and the prose reads
			   wrong. Plant Brook so the active-stat row exists; snapshot
			   the whole companion bundle so the lust spike unwinds.
			   The wardrobe strip is for the same reason as the solo
			   variant. */
			id: 'nudity_walk_duo', title: 'Walk Home Together', location: 'Hunt',
			scenePassage: 'NudityEventTwo',
			setup: function () {
				setup.Wardrobe.cheatStripAll();
				setup.Companion.cheatActivateCompanion('Brook');
			},
			extraSnapshot: WARDROBE_PATHS.concat(COMPANION_PATHS),
			hint: 'You and your friend in matching bathrobes.'
		},
		{
			/* Caught-by-ghost hunt-end. HuntOverProwl branches on
			   ghost.canTentacles, isIronclad, Alice-companion, then
			   wardrobe slot. Stamp a Spirit run (canTentacles false,
			   non-Mimic) so activeGhost() returns the planted ghost --
			   isActive() guards activeGhost on `$run` alone, no need to
			   flip huntMode to ACTIVE. (Doing so trips TickController's
			   PassageDone redirect: "isHunting && morning >= 6" sends
			   the player to HuntOverTime, which then bounces to the
			   gallery before the scene's content can render.) Force a
			   non-Alice companion so the default body-fucking branch
			   renders. The passage runs onCaughtCleanup() + addPossessionResidue()
			   on entry, so HUNT_PATHS captures $run / tools /
			   possessionResidue and restores them on exit. */
			id: 'hunt_caught_prowl', title: 'Caught: Ghost Prowl', location: 'Hunt',
			scenePassage: 'HuntOverProwl',
			setup: function () {
				setup.HuntController.cheatStampMinimalRun({ ghostName: 'Spirit' });
				setup.Companion.cheatActivateCompanion('Brook');
				setup.Wardrobe.cheatStripAll();
			},
			extraSnapshot: HUNT_PATHS.concat(WARDROBE_PATHS).concat(COMPANION_PATHS),
			hint: "What happens when the ghost wins the prowl."
		},
		{
			/* Sanity-out hunt-end. HuntOverSanity branches on tentacles
			   vs ironclad vs default. Spirit again -- canTentacles is
			   false so the generic sanityover/N.mp4 video plays. Same
			   onCaughtCleanup cascade fires; HUNT_PATHS covers it. See
			   hunt_caught_prowl above for why activateHunt is omitted. */
			id: 'hunt_caught_sanity', title: 'Caught: Sanity Break', location: 'Hunt',
			scenePassage: 'HuntOverSanity',
			setup: function () {
				setup.HuntController.cheatStampMinimalRun({ ghostName: 'Spirit' });
			},
			extraSnapshot: HUNT_PATHS.concat(WARDROBE_PATHS).concat(COMPANION_PATHS),
			hint: 'When the house finally tips you sideways.'
		},

		// Hunt Aftermath
		{
			/* Wraith chains GhostSpecialEventWraith -> WraithStart ->
			   WraithEnd -> Sleep. Whitelist the two intermediate passages
			   so the containment guard doesn't bounce the walker back to
			   the gallery mid-chain; Sleep is intentionally NOT in the
			   list because hitting it is the clean exit signal. */
			id: 'aftermath_wraith', title: 'Lost in the Forest', location: 'Hunt Aftermath',
			scenePassage: 'GhostSpecialEventWraith',
			replayPassages: ['GhostSpecialEventWraithStart', 'GhostSpecialEventWraithEnd'],
			hint: 'Rope, woods, helpful strangers.'
		},
		{
			id: 'aftermath_myling', title: 'Walk of Shame', location: 'Hunt Aftermath',
			scenePassage: 'GhostSpecialEventMyling',
			hint: 'They keep staring at you.'
		},
		{
			/* GhostSpecialEventSpirit branches on companionIs("Brook" /
			   "Alice" / "Blake") -- if no companion is active, every
			   branch is false and the page renders blank (a trap). Plant
			   Brook so the bedside-fucking branch always renders. The
			   Blake variant chains to spiritBlake, so whitelist it for
			   the rare case the player toggles companions before
			   replaying. COMPANION_PATHS snapshots the active companion
			   bundle. */
			id: 'aftermath_spirit_walk', title: 'Companion Visitor', location: 'Hunt Aftermath',
			scenePassage: 'GhostSpecialEventSpirit',
			setup: function () {
				setup.Companion.cheatActivateCompanion('Brook');
			},
			extraSnapshot: COMPANION_PATHS,
			replayPassages: ['spiritBlake'],
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
		/* Iterate the catalogue, not the seen map: a save written when the
		   catalogue contained an entry that has since been renamed/removed
		   will still carry the old id in $flashbacks.seen, and counting raw
		   map keys would push the gallery header past totalCount(). */
		var m = seenMap();
		var n = 0;
		for (var i = 0; i < CATALOGUE.length; i++) {
			if (m[CATALOGUE[i].id]) n++;
		}
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
	   automatically as other controllers register them.

	   Entries are either a dotted-path string (primitive leaf, stored
	   by value) or { path, deep: true } for object/array leaves that
	   the in-replay code mutates in place -- $run is the canonical
	   case (HuntController.cheatStampMinimalRun rewrites fields on
	   the existing run rather than replacing the reference), so a
	   shallow capture would store a pointer to the same object that
	   the cheat helper goes on to mutate, leaving nothing to restore.
	   Deep entries pass through structured-clone (JSON round-trip)
	   so the snapshot is independent of subsequent mutations. */
	var SNAPSHOT_PATHS = Object.freeze([
		'mc.lust', 'mc.sanity', 'mc.energy', 'mc.corruption',
		'mc.money', 'mc.exp', 'mc.lvl',
		'mc.percentageOfLevel', 'mc.neededForNextLevel',
		'mc.sanityMax', 'mc.lustMax', 'mc.energyMax',
		'mc.beautyBase', 'mc.beautyModifier',
		'mc.exhibitionism', 'mc.possessionResidue',
		'hours', 'minutes', 'dailySeed',
		'earnedMoney',
		'currentOrder', 'order1', 'order2', 'order3',
		'gotCursedItem',
		'isCIDildo', 'isCIButtplug', 'isCIBeads', 'isCIHDildo',
		'baitOrgasmPending',
		'isPenaltyOn'
	]);

	function pathSpec(entry) {
		if (typeof entry === 'string') return { path: entry, deep: false };
		return { path: entry.path, deep: !!entry.deep };
	}

	function readLeaf(s, path) {
		var parts = path.split('.');
		var v = s;
		for (var i = 0; i < parts.length && v != null; i++) v = v[parts[i]];
		return v;
	}

	function writeLeaf(s, path, value) {
		var parts = path.split('.');
		var target = s;
		for (var i = 0; i < parts.length - 1; i++) {
			if (target == null) return;
			target = target[parts[i]];
		}
		if (target == null) return;
		target[parts[parts.length - 1]] = value;
	}

	function captureValue(v, deep) {
		if (!deep) return v;
		if (v === undefined || v === null) return v;
		return JSON.parse(JSON.stringify(v));
	}

	function takeSnapshot(extras) {
		var snap = {};
		var s = sv();
		var all = SNAPSHOT_PATHS.slice();
		if (Array.isArray(extras)) all = all.concat(extras);
		all.forEach(function (raw) {
			var spec = pathSpec(raw);
			snap[spec.path] = captureValue(readLeaf(s, spec.path), spec.deep);
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
			writeLeaf(s, p, snap[p]);
		});
	}

	function enterReplay(id) {
		var entry = byId(id);
		if (!entry) return false;
		var b = store();
		b.active = id;
		b.snapshot = takeSnapshot(entry.extraSnapshot);
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
		   Engine.DOM_DELAY so the outer play finishes first.

		   exitReplay() rides in the same setTimeout so isReplaying()
		   stays true through the transient bounce render. Otherwise
		   the in-passage stat-delta widgets and any controller side
		   effects gated on isReplaying() see a cleared active id and
		   fire as if the player were really visiting the off-scene
		   passage -- the canonical leak being Sleep.tw's
		   applyHuntDefeatPreSleep() stamping isPenaltyOn=true on the
		   way back from a hunt-defeat replay. */
		setTimeout(function () {
			exitReplay();
			Engine.play('Flashbacks');
		}, Engine.DOM_DELAY || 40);
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

	/* gym_group skips auto-register because its entry passage
	   (GroupGymTraining) is the generic gym-workout passage -- any
	   visit, gates-passed or not, would otherwise mark the scene seen.
	   The orgy only actually unlocks once the player reaches
	   GymGroupEvent1Start (post-"I can't resist" click, only reachable
	   when both beauty and lust gates pass), so the unique credit
	   point is registered directly here. */
	setup.SceneEvents.register('GymGroupEvent1Start', 'gym_group');

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
