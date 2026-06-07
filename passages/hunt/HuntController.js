/*
 * Hunt lifecycle + facade controller.
 *
 * Owns the predicates and dispatch points the shared tool / evidence /
 * event stack queries: "is a hunt in flight", "which ghost is active",
 * "is the player in the ghost's room", "where should the per-tick
 * chain route on a hunt-over condition". Each hunt is represented by
 * a single $run object holding everything that varies between hunts:
 *
 *   $run = {
 *     seed,        // int, drives the floor-plan generator + any
 *                  //      other deterministic per-run rolls
 *     number,      // int, monotonically incremented per attempt
 *     modifiers,   // [<modifier_id>, ...] active modifier deck
 *     loadout,     // { tools: [...], money: n, ... }
 *     objective,   // string id (catalogue below)
 *     floorplan    // populated by setup.FloorPlan
 *   }
 *
 * `$ectoplasm` is the meta-progression currency that survives runs,
 * measured in mL. Spent in the meta-shop on permanent unlocks.
 *
 * Per-run state lives on $run. Persistent meta-state lives on
 * $ectoplasm (and any future $meta.* keys). Both keys are owned here
 * so other controllers can query through this API rather than
 * reaching into State directly.
 */
setup.HuntController = (function () {
	var OWNED_VARS = Object.freeze([
		'run', 'ectoplasm', 'runsStarted',
		'nextHuntSeed', 'pendingHuntHouseId',
		'huntMode'
	]);

	/* Lifecycle stages of the current hunt. Stored as the top-level
	   $huntMode integer (default 0 = NONE) and accessed through the
	   huntMode()/setHuntMode() helpers below. Prefer the predicate
	   helpers (isHunting, isPossessed, isEnded, …) to comparing
	   raw ints.

	   ENDED vs POSSESSED: ENDED is the catch-all "the hunt is over"
	   state — graceful exits (manual leave, exhaustion, sanity-out,
	   contract close, walk home). POSSESSED is the narrower "the
	   ghost actually caught and possessed the MC" state, reached only
	   through the Possessed passage. Post-hunt cleanup that only
	   applies to genuine possession (e.g. retiring the monkey paw
	   and marking the tarot deck spent — see
	   setup.Tick.applyPossessionItemCleanup) keys off POSSESSED;
	   anything that just needs "the hunt is over" keys off isEnded(). */
	var HuntMode = Object.freeze({
		NONE: 0,   // no hunt active
		ACTIVE: 2,   // player is inside the house, hunt in progress
		POSSESSED: 3,   // ghost caught + possessed the MC (Possessed passage)
		ENDED: 4    // hunt ended without possession (graceful exits)
	});

	var sv = setup.sv;

	/* Street-address vocabulary lives in HuntAddresses.js so the
	   ~100-line tables don't bloat the lifecycle file. Re-exported
	   on the api below for existing call sites + tests. */
	var addressFromSeed = setup.HuntAddresses.addressFromSeed;

	/* Outcome / FailureReason / Objective enums live in HuntEnums.js
	   (loaded after this file alphabetically) and are spliced back
	   onto setup.HuntController for callers. Internal references go
	   through setup.HuntEnums.X at call time. */

	// --- Run lifecycle ----------------------------------------
	/* Start a fresh run. opts:
		seed       -- int; if omitted, a random seed is rolled.
		modifiers  -- array of modifier ids; defaults to [].
		loadout    -- starting loadout object; defaults to {}.
		objective  -- objective id string; defaults to setup.HuntEnums.Objective.IDENTIFY.
	   The run number increments from $runsStarted, which persists
	   across end() so attempt counts survive between runs. The
	   floorplan field is left undefined for the floor-plan
	   generator to fill in. */
	function start(opts) {
		opts = opts || {};
		sv().runsStarted = (sv().runsStarted || 0) + 1;
		sv().run = {
			seed: opts.seed != null ? opts.seed : Math.floor(Math.random() * 1e9),
			number: sv().runsStarted,
			modifiers: Array.isArray(opts.modifiers) ? opts.modifiers.slice() : [],
			loadout: opts.loadout || {},
			objective: opts.objective || setup.HuntEnums.Objective.IDENTIFY.id,
			// Static-plan houses (setup.HuntHouses) stamp their
			// catalogue id here so downstream consumers can ask which
			// frozen plan the run is using -- HUD label override, the
			// companion gate, save migration. Procedural runs leave it
			// null and behave exactly as before.
			staticHouseId: opts.staticHouseId || null,
			// Player starts in the hallway. Nav links in HuntRun
			// update this via setCurrentRoom() before re-rendering.
			currentRoomId: 'room_0',
			// Furniture-search state. searchedFurniture is the
			// {room, suffix} pair the player just clicked, read by
			// FurnitureSearch. collectedLoot tracks which
			// loot kinds have already been picked up this run, so
			// repeat searches at the same spot find nothing.
			searchedFurniture: null,
			collectedLoot: [],
			/* Per-room light state, keyed by floor-plan room id. Missing
			   entries default to dark (matches classic, where every room
			   starts dark on house entry); the hunt light widget toggles
			   them via setRoomLight. */
			lights: {}
		};
		setup.Tick.resetStepCount();
		return sv().run;
	}

	/* Test / cheat shortcut: stamp a minimal $run with the named ghost
	   as both real identity and current disguise, copy in evidence ids,
	   and default the rest of the shape to match what production start()
	   produces. This exists so unit specs and the cheat menu can park
	   the player in an "active hunt" state without spinning up a
	   floorplan / modifiers / starting tools — but the resulting $run
	   must satisfy every accessor below (modifiers(), loadout(), etc.)
	   so cold passage renders don't trip on undefined fields.

	   The `cheat` prefix marks this as cheat/test-only — see
	   tests/cheat-method-lint.spec.js, which forbids production passages
	   from calling any setup.X.cheat* method outside the cheat dialog. */
	function cheatStampMinimalRun(opts) {
		opts = opts || {};
		var run = sv().run;
		if (!run || typeof run !== 'object') {
			sv().run = {};
			run = sv().run;
		}
		run.ghostName = opts.ghostName;
		run.disguiseName = opts.ghostName;
		run.evidence = Array.isArray(opts.evidence) ? opts.evidence.slice() : [];
		if (run.trapped === undefined) run.trapped = false;
		if (run.modifiers === undefined) run.modifiers = [];
		if (run.loadout === undefined) run.loadout = {};
		if (run.objective === undefined) run.objective = setup.HuntEnums.Objective.IDENTIFY.id;
		if (run.staticHouseId === undefined) run.staticHouseId = null;
		if (run.currentRoomId === undefined) run.currentRoomId = 'room_0';
		if (run.searchedFurniture === undefined) run.searchedFurniture = null;
		if (run.collectedLoot === undefined) run.collectedLoot = [];
		if (run.lights === undefined) run.lights = {};
	}

	/* End the current run. Preserves the run number so the next
	   start() picks up where we left off; the new run will overwrite
	   the rest of the fields. Also flips $huntMode back to NONE and
	   tears down companion bookkeeping that startHunt stamped, so a
	   Cancel from the HuntStart lobby (which calls this directly, not
	   endHunt) doesn't leave isHunting() stuck on -- which would let
	   the post-passage tick redirect the player into HuntOverTime once
	   the clock crossed 06:00. */
	function end() {
		var prior = sv().run;
		sv().run = null;
		setHuntMode(HuntMode.NONE);
		if (setup.Companion) {
			if (typeof setup.Companion.runHuntFailHooks === 'function') setup.Companion.runHuntFailHooks();
			if (typeof setup.Companion.resetActiveCompanionStats === 'function') setup.Companion.resetActiveCompanionStats();
			/* Clear the per-hunt recruitment marker (and the scratch hunt
			   state it folds in). Runs last so the two hooks above still
			   see the active companion. This is the only place recruitment
			   is torn down now that midnight no longer wipes it -- see
			   setup.Companion.endHuntRecruitment. */
			if (typeof setup.Companion.endHuntRecruitment === 'function') setup.Companion.endHuntRecruitment();
		}
		/* Pair with freezeBeauty() in startHunt. No-op when nothing is
		   frozen, so the lobby-cancel path (which never reached the freeze)
		   stays correct. */
		if (setup.Mc && typeof setup.Mc.unfreezeBeauty === 'function') {
			setup.Mc.unfreezeBeauty();
		}
		return prior;
	}

	function active() { return sv().run || null; }
	function isActive() { return !!sv().run; }

	/* Hunt-mode query/mutation helpers. Prefer these to raw
	   $huntMode comparisons — they keep the magic ints out of
	   passages and give each stage a readable predicate. */
	function huntMode() { return sv().huntMode || HuntMode.NONE; }
	function setHuntMode(mode) { sv().huntMode = mode; }
	function isHunting() { return huntMode() === HuntMode.ACTIVE; }
	function isPossessed() { return huntMode() === HuntMode.POSSESSED; }
	/* True once the hunt is over for any reason — graceful exit or
	   genuine possession. Use when the caller only cares that the
	   run has wrapped; key off isPossessed() for possession-specific
	   cleanup. */
	function isEnded() { var m = huntMode(); return m === HuntMode.ENDED || m === HuntMode.POSSESSED; }
	/* True for any stage past NONE — "a hunt is in progress or in
	   its post-mortem (ended/possessed) phase". */
	function isAnyMode() { return huntMode() !== HuntMode.NONE; }

	/* Flip $huntMode to ACTIVE and clear stale per-hunt ability flags
	   (highpriestess / bansheeAbility / cthulionAbility live on setup.Ghosts as
	   per-hunt singletons). Called from startHunt once $run is stamped. */
	function activateHunt() {
		setHuntMode(HuntMode.ACTIVE);
		if (setup.Ghosts && typeof setup.Ghosts.clearHuntFlags === 'function') {
			setup.Ghosts.clearHuntFlags();
		}
	}

	/* Wrap a function body in the "bail out when no run is active" guard.
	   Replaces the `if (!isActive()) return <fallback>;` first-line pattern
	   so the no-run branch is declarative and impossible to forget.
	   Usage: var foo = guarded(false, function () { ... }); */
	function guarded(fallback, fn) {
		return function () {
			if (!isActive()) return fallback;
			return fn.apply(null, arguments);
		};
	}

	// --- Field accessors --------------------------------------
	function seed() { return sv().run ? sv().run.seed : null; }
	function number() { return sv().run ? sv().run.number : 0; }
	function modifiers() { return sv().run ? sv().run.modifiers.slice() : []; }
	function loadout() { return sv().run ? sv().run.loadout : null; }
	function objective() { return sv().run ? sv().run.objective : null; }
	function currentRoomId() {
		var run = sv().run;
		return run ? (run.currentRoomId || 'room_0') : null;
	}
	/* Move the player into `roomId`. No-op when no run is active or
	   the id isn't on the current floor plan; nav links call this
	   before re-entering HuntRun. */
	function setCurrentRoom(roomId) {
		var run = sv().run;
		if (!run || !run.floorplan) return false;
		var found = run.floorplan.rooms.some(function (r) { return r.id === roomId; });
		if (!found) return false;
		var prev = run.currentRoomId || null;
		run.currentRoomId = roomId;
		if (prev !== roomId) {
			/* Hunt-mode replacement for the classic stepCount bump that
			   used to live in widgetHauntedHouseRoom. Companion event
			   lust gain (setup.Companion.eventLustGain) scales off this,
			   so missing the bump zeroes every event payout. */
			setup.Tick.incrementStepCount();
			setup.Hunt.emit(setup.Hunt.Event.ROOM_ENTER, { roomId: roomId, fromRoomId: prev });
		}
		return true;
	}

	/* Per-room light state. Hunt rooms are not seeded into setup.Rooms,
	   so the light/dark flag lives on $run.lights keyed by floor-plan
	   room id; missing entries default to DARK (matches classic-mode
	   defaults from setup.Rooms.seed). The huntFooterLight widget toggles
	   this and re-navigates HuntRun, which re-resolves the body
	   background through setup.Styles.bgUrlForTemplate(template, dark). */
	function isRoomDark(roomId) {
		var run = sv().run;
		if (!run || !roomId) return false;
		var lights = run.lights || {};
		var v = lights[roomId];
		if (v == null) return true;
		return v === setup.RoomLight.DARK;
	}
	function setRoomLight(roomId, lightConst) {
		var run = sv().run;
		if (!run || !roomId) return;
		if (!run.lights) run.lights = {};
		run.lights[roomId] = lightConst;
	}
	function isCurrentRoomDark() {
		return isRoomDark(currentRoomId());
	}

	function hasModifier(id) {
		var run = sv().run;
		return !!(run && run.modifiers && run.modifiers.indexOf(id) !== -1);
	}

	/* Tool keys the hunt toolbar should render this run, in canonical
	   setup.searchToolOrder. Resolution order:
		 1. Build the "starting" base set: loadout.tools intersected
			with searchToolOrder, or all six tools when loadout.tools
			is unset.
		 2. Run the base through the STARTING_TOOLS filter so
			modifiers (Empty Bag clears to []) and static-house quirks
			can mutate the set without HuntController branching on
			each one.
		 3. Union with any tool the player has picked up from
			furniture this run ($run.collectedLoot entries shaped as
			'tool_<id>'). Tools placed in the floor plan and clicked
			through FurnitureSearch land in collectedLoot via takeLoot,
			so a started-empty bag fills back in as the player
			searches the rooms.
	   Order is always the canonical setup.searchToolOrder regardless
	   of the order tools were picked up. Returns [] when no run is
	   active. */
	function startingTools() {
		var run = sv().run;
		if (!run) return [];
		var order = (setup.searchToolOrder || []).slice();
		var base = startingToolsBase(run.modifiers || [], run.loadout || null);
		var collected = Array.isArray(run.collectedLoot) ? run.collectedLoot : [];
		return order.filter(function (t) {
			if (base.indexOf(t) !== -1) return true;
			return collected.indexOf(setup.FloorPlan.toolLootKind(t)) !== -1;
		});
	}

	/* Compute the tool-pickup loot kinds the floor-plan generator
	   should place this run -- exactly the tools the player would
	   otherwise be missing from the toolbar. The base set is the
	   loadout intersection (or full kit), then the STARTING_TOOLS
	   filter runs so modifier / static-house subscribers can mutate
	   it. Returns an array of tool ids (not loot keys); the FloorPlan
	   generator wraps them with the 'tool_' prefix. */
	function startingToolsBase(modifierIds, loadout) {
		var order = (setup.searchToolOrder || []).slice();
		var base;
		if (loadout && Array.isArray(loadout.tools)) {
			base = order.filter(function (t) {
				return loadout.tools.indexOf(t) !== -1;
			});
		} else {
			base = order.slice();
		}
		var ctx = setup.Hunt.applyFilter(setup.Hunt.Event.STARTING_TOOLS, {
			tools: base,
			modifierIds: Array.isArray(modifierIds) ? modifierIds : [],
			loadout: loadout || null
		});
		return Array.isArray(ctx.tools) ? ctx.tools : [];
	}
	function missingToolsToPlace(modifierIds, loadout) {
		var order = (setup.searchToolOrder || []).slice();
		var base = startingToolsBase(modifierIds, loadout);
		return order.filter(function (t) { return base.indexOf(t) === -1; });
	}

	function setObjective(id) {
		if (sv().run) sv().run.objective = id;
	}

	/* Add a modifier to the active run if not already present.
	   Returns true if it was added. */
	function addModifier(id) {
		var run = sv().run;
		if (!run || !id) return false;
		if (!Array.isArray(run.modifiers)) run.modifiers = [];
		if (run.modifiers.indexOf(id) !== -1) return false;
		run.modifiers.push(id);
		return true;
	}

	/* Stow arbitrary generator output (e.g. floor plan) on the run
	   so the floor-plan generator can hand state back without
	   needing a top-level $variable. Subsystems read the field via
	   this API rather than via $run directly. */
	function setField(key, value) {
		var run = sv().run;
		if (!run) return;
		run[key] = value;
	}
	function field(key) {
		var run = sv().run;
		return run ? run[key] : undefined;
	}

	// --- alt currency: ectoplasm (mL) ---------------------
	function ectoplasm() { return sv().ectoplasm || 0; }
	function addEctoplasm(n) {
		sv().ectoplasm = (sv().ectoplasm || 0) + (n || 0);
		setup.Ledger.recordEctoplasm(sv().ectoplasm);
		return sv().ectoplasm;
	}
	/* Spend `n` mL of ectoplasm. Returns true on success, false if
	   the player can't afford it. No partial deductions. */
	function removeEctoplasm(n) {
		var have = sv().ectoplasm || 0;
		if (have < n) return false;
		sv().ectoplasm = have - n;
		setup.Ledger.recordEctoplasm(sv().ectoplasm);
		return true;
	}
	function canAffordEctoplasm(n) { return (sv().ectoplasm || 0) >= n; }

	// --- Per-cycle hunt seed ---------------------------------
	/* Seed for the *next* run. The GhostStreet card preview
	   and HuntStart's auto-roll both read this so the previewed
	   address always matches the address the lobby renders.
	   Persisted between visits so the player can leave and return
	   without the haunt reshuffling under them; rolled fresh once a
	   run finishes (endHunt) so the next attempt gets a new seed.
	   Lazily initialised when first read on saves predating the
	   field. */
	function rollFreshSeed() {
		return Math.floor(Math.random() * 0x100000000);
	}
	function nextSeed() {
		var s = sv();
		if (typeof s.nextHuntSeed !== 'number') {
			s.nextHuntSeed = rollFreshSeed();
		}
		return s.nextHuntSeed;
	}
	function rollNextSeed() {
		sv().nextHuntSeed = rollFreshSeed();
		return sv().nextHuntSeed;
	}

	// --- Composition helpers for the lifecycle passages -------
	/* Roll a fresh run end-to-end: seed, modifier draft,
	   floor-plan generation, and $run population. opts:
		seed          -- explicit seed (default = random in [0,1e9));
						 also drives the modifier draft, offset by a
						 32-bit constant so it differs from the
						 floor-plan rng stream.
		modifierCount -- how many modifiers to draft. Resolution order:
						 1. opts.modifierCount when set (caller wins);
						 2. catalogue entry's modifierCount when
							staticHouseId points at a setup.HuntHouses
							record carrying that field;
						 3. fallback default of 2 (procedural runs).
		floorPlanOpts -- forwarded to setup.FloorPlan.generate.
		loadout       -- forwarded to start().
		objective     -- forwarded to start() (default setup.HuntEnums.Objective.IDENTIFY). */
	function startHunt(opts) {
		opts = opts || {};
		var seed = opts.seed != null ? opts.seed : Math.floor(Math.random() * 1e9);
		/* Resolve modifierCount through the MODIFIER_COUNT filter so
		   per-house overrides ("this house has no modifier deck") live
		   on the catalogue entry, not as a branch here. Caller's
		   opts.modifierCount wins unconditionally; otherwise the
		   subscriber may set ctx.count from the static-house entry;
		   otherwise the procedural default (2) applies. */
		var mcCtx = setup.Hunt.applyFilter(setup.Hunt.Event.MODIFIER_COUNT, {
			count: opts.modifierCount != null ? opts.modifierCount : null,
			staticHouseId: opts.staticHouseId || null
		});
		var modifierCount = (mcCtx.count != null) ? mcCtx.count : 2;

		/* Modifier draft honors the player's banlist. Banned ids are
		   stripped from the draft pool before weighting; banlist slots
		   are bought from the meta-shop (setup.HuntShop.ShopItem.BANLIST_SLOT). */
		var draft = setup.Modifiers.draft(
			(seed ^ 0x9e3779b9) >>> 0,
			modifierCount,
			{ banned: setup.HuntShop.bannedModifiers() }
		);
		var modifierIds = draft.map(function (m) { return m.id; });
		/* Static hunt houses can pin extra modifiers (zero-weight
		   catalogue entries that never appear in the random draft) via
		   their catalogue's `forcedModifiers: [...]` field. Forced
		   modifiers stack on top of the draft and are unaffected by
		   the player's banlist -- the catalogue requires them for the
		   house to play as designed (e.g. Ironclad's warden costume +
		   prison visuals). Filter subscribers in ModifiersController
		   then own the per-channel behaviour, so HuntController stays
		   free of house-id branches. */
		if (opts.staticHouseId) {
			var staticHouse = setup.HuntHouses.byId(opts.staticHouseId);
			var forced = staticHouse && staticHouse.forcedModifiers;
			if (Array.isArray(forced)) {
				for (var fi = 0; fi < forced.length; fi++) {
					if (modifierIds.indexOf(forced[fi]) === -1) {
						modifierIds.push(forced[fi]);
					}
				}
			}
		}

		/* Compose the floor-plan options. Tools the player would
		   otherwise be missing from the toolbar (Empty Bag modifier or
		   a restricted loadout.tools) get placed in furniture so the
		   run is recoverable -- the player can explore, find them, and
		   the toolbar fills in via startingTools()'s collected-loot
		   union. Bump the room count when there's tool loot to place
		   so the per-room furniture pool has slack for the extra
		   pins; default 5 rooms isn't enough headroom for all six
		   tools in the worst-case Empty Bag run. */
		var fpOpts = Object.assign({}, opts.floorPlanOpts || {});
		var toolKinds = missingToolsToPlace(modifierIds, opts.loadout);
		if (toolKinds.length && fpOpts.toolKinds == null) {
			fpOpts.toolKinds = toolKinds;
		}
		if (fpOpts.toolKinds && fpOpts.toolKinds.length && fpOpts.roomCount == null) {
			fpOpts.roomCount = Math.max(5, 4 + Math.ceil(fpOpts.toolKinds.length / 2));
		}
		/* Hand the floor-plan options to the filter bus so modifiers
		   (Maze), meta-unlocks (Smaller House), and static houses
		   (frozen plan injection) can mutate fpOpts without
		   HuntController branching on their ids. Subscribers live in
		   ModifiersController, HuntHousesController, and the meta-unlock
		   subscriber registered below. */
		var fpCtx = setup.Hunt.applyFilter(setup.Hunt.Event.FLOORPLAN_OPTIONS, {
			fpOpts: fpOpts,
			modifierIds: modifierIds,
			seed: seed,
			loadout: opts.loadout || null,
			staticHouseId: opts.staticHouseId || null
		});
		fpOpts = fpCtx.fpOpts || fpOpts;
		var floorplan = setup.FloorPlan.generate(seed, fpOpts);
		/* Snapshot the spawn room id for Reliable Recon. driftGhostRoom
		   mutates floorplan.spawnRoomId; comparing against this snapshot
		   lets the minimap drop the recon highlight the moment the ghost
		   relocates for the first time. */
		floorplan.originalSpawnRoomId = floorplan.spawnRoomId;

		/* Pick the haunting ghost from the catalogue using a seed-derived
		   index so a given seed reproduces the same ghost across replays.
		   The lair room is whichever room the floor-plan generator picked
		   as the spawn -- room_0 is always the hallway the player starts
		   in, so this guarantees the ghost lives at least one nav-hop
		   away from spawn. */
		var ghostNames = setup.Ghosts.names();
		var ghostName = ghostNames[((seed ^ 0x85ebca6b) >>> 0) % ghostNames.length];

		/* Build the per-run evidence list. By default ghosts answer to
		   their catalogue evidence verbatim; Fog of War splices one of
		   the three out so identification is harder. The picked
		   evidence is seed-derived so a given seed always loses the
		   same one across replays. */
		var ghostCat = setup.Ghosts.getByName(ghostName);
		var evidenceIds = (ghostCat && Array.isArray(ghostCat.evidence))
			? ghostCat.evidence.map(function (e) { return e.id; })
			: [];
		var evCtx = setup.Hunt.applyFilter(setup.Hunt.Event.EVIDENCE_POOL, {
			evidence: evidenceIds,
			modifierIds: modifierIds,
			seed: seed,
			ghostName: ghostName
		});
		evidenceIds = Array.isArray(evCtx.evidence) ? evCtx.evidence : evidenceIds;

		start({
			seed: seed,
			modifiers: modifierIds,
			loadout: opts.loadout || {},
			objective: opts.objective || setup.HuntEnums.Objective.IDENTIFY.id,
			staticHouseId: opts.staticHouseId || null
		});
		setField('floorplan', floorplan);
		setField('ghostName', ghostName);
		setField('evidence', evidenceIds);
		setField('disguiseName', ghostName);
		/* Flip $huntMode to ACTIVE so the per-hunt machinery
		   (isHunting() / activeGhost(), companion mini panel +
		   walk-home gate, Mimic rotation, Bag tabs, tick-side morning /
		   possessed checks) lights up immediately. */
		activateHunt();
		/* Pin the in-game clock to midnight so the post-passage tick
		   doesn't punt the player into HuntOverTime the moment they
		   land on HuntStart/HuntRun. In production this matches what
		   GhostStreet already does on entry; here we keep the controller
		   self-consistent so callers that bypass GhostStreet (tests,
		   future entry points) still see a well-defined clock. */
		if (setup.Time && typeof setup.Time.resetToMidnight === 'function') {
			setup.Time.resetToMidnight();
		}
		/* Seed the drift-roll clock so the first post-passage tick
		   after hunt start doesn't immediately roll a drift (which would
		   fire the 'It Moved' achievement before the ghost has actually
		   moved). The gate is consumed by HuntDrift.shuffleGhostRoom(). */
		setup.HuntDrift.seedNextDriftClock();
		/* Same shared-state reset the classic flow did:
		   tarot deck back to HIDDEN, monkey paw back to 3 wishes /
		   not-yet-found / no banned houses, knowledge-evidence
		   overlay cleared. The cursed-item carry pickup reuses
		   markTarotCarrying / markFound, so both items feed
		   into the same Bag link + TarotCards / MonkeyPaw passages. */
		resetCursedItemState();
		/* Notebook checkboxes also reset so Intense Intuition's
		   pre-check below isn't joined by leftover ticks from a
		   previous run. */
		if (setup.Ghosts && setup.Ghosts.resetEvidenceChecks) {
			setup.Ghosts.resetEvidenceChecks();
		}
		setup.HuntMetaUnlocks.applyAtStart(sv().run, seed, evidenceIds);
		/* Pin MC beauty for the duration of the hunt so drift chance,
		   event rolls, and other beauty-driven checks see a stable
		   value even if clothes get torn off / makeup wipes mid-run.
		   end() clears it on both the success-payout path and the
		   lobby-cancel path. */
		setup.Mc.freezeBeauty();
		setup.Hunt.emit(setup.Hunt.Event.START, { ghostName: ghostName, seed: seed });
		return active();
	}

	/* Meta-shop unlock stamping at hunt start lives in HuntMetaUnlocks.js.
	   See setup.HuntMetaUnlocks.applyAtStart(run, seed, evidenceIds). */

	function ghostName() {
		var run = sv().run;
		return run ? (run.ghostName || null) : null;
	}
	/* Catalogue id of the static house powering the active run,
	   or null when the run is procedural. Mirrors ghostName() in
	   shape: stamped at startHunt() and surfaced read-only here. */
	function staticHouseId() {
		var run = sv().run;
		return run ? (run.staticHouseId || null) : null;
	}
	/* True when companions are eligible for the active hunt at all.
	   Procedural runs default to allowed; static-plan houses opt out
	   by pinning the `solo_only` forced modifier in the catalogue
	   (its COMPANION_ALLOWED subscriber in ModifiersController sets
	   ctx.allowed=false). Drives both the HuntStart "Talk to her"
	   gate and the in-hunt HUD via Companion.inHauntedHouseLocation. */
	var huntAllowsCompanions = guarded(false, function () {
		var ctx = setup.Hunt.applyFilter(setup.Hunt.Event.COMPANION_ALLOWED, {
			allowed: true,
			staticHouseId: staticHouseId(),
			modifierIds: modifiers()
		});
		return !!ctx.allowed;
	});
	/* Evidence id list for the active ghost. Returns the
	   per-run override stamped at startHunt (so Fog of War's spliced
	   list survives reads), or null when no run is active or no
	   override was set. setup.Ghosts._activeFromCatalogue consults
	   this to overlay evidence onto the catalogue Ghost. */
	function runEvidence() {
		var run = sv().run;
		if (!run || !Array.isArray(run.evidence)) return null;
		return run.evidence.slice();
	}
	/* Seed-derived street address shown in the lobby/HUD instead of
	   the raw seed. Returns null off-run; callers that need a label
	   for an arbitrary seed can call addressFromSeed() directly.

	   Per-house label overrides (Owaissa, Elm, Ironclad) ride the
	   ADDRESS filter -- HuntHousesController stamps `addr.formatted`
	   off its catalogue label. The seed-derived number/road/suffix
	   fields stay so callers that want the underlying address
	   (rng-seed displays, diagnostics) can still read them. */
	function address() {
		var run = sv().run;
		if (!run) return null;
		var addr = addressFromSeed(run.seed);
		var ctx = setup.Hunt.applyFilter(setup.Hunt.Event.ADDRESS, {
			addr: addr,
			staticHouseId: staticHouseId()
		});
		return ctx.addr;
	}
	function ghostRoomId() {
		var run = sv().run;
		return run && run.floorplan ? (run.floorplan.spawnRoomId || null) : null;
	}
	function isInGhostRoom() {
		var run = sv().run;
		if (!run) return false;
		return (run.currentRoomId || 'room_0') === ghostRoomId();
	}

	/* driftGhostRoom / shuffleGhostRoom / driftChance live in HuntDrift.js
	   and splice onto this api at load time. The drift-clock state
	   ($nextDriftAtMinute) is also owned there. */

	/* Minimap data (minimapData / minimapSvg / collapse state),
	   currentRoomData, and humanizeLootKind / humanizeFurniture
	   helpers live in HuntMinimap.js and splice onto this api at
	   load time. Hosted there so view-layer SVG-building doesn't
	   bloat the lifecycle file. */

	/* Outcome / failure-reason readers and writers. Callers go
	   through these instead of touching $run.outcome / $run.failureReason
	   directly so the field names + Outcome enum stay in one place.
	   markSuccess / markFailure cover the common "stamp the result on
	   the run before the lifecycle helper calls endHunt" flow. */
	function outcome() {
		var run = sv().run;
		return run ? (run.outcome || null) : null;
	}
	function failureReason() {
		var run = sv().run;
		return run ? (run.failureReason || null) : null;
	}
	function isSuccess() {
		return outcome() === setup.HuntEnums.Outcome.SUCCESS;
	}
	function markSuccess() {
		var run = sv().run;
		if (!run) return;
		run.outcome = setup.HuntEnums.Outcome.SUCCESS;
		run.failureReason = null;
	}
	function markFailure(reason) {
		var run = sv().run;
		if (!run) return;
		run.outcome = setup.HuntEnums.Outcome.FAILURE;
		if (reason) run.failureReason = reason;
	}

	/* Tear down per-run house / companion / wardrobe / stat-cap state.
	   This is the catch-all lifecycle teardown -- witch contract close,
	   exhaustion / sanity exits, manual leave, wrong-call. Genuine
	   possession transitions to POSSESSED separately from the Possessed
	   passage and skips this teardown.

	   Mirrors the classic HuntOver* passages: commit tempCorr,
	   reset tool timers, hand the deck / paw back to HIDDEN / 3
	   wishes. runHuntFailHooks gives the active companion a chance
	   to clean up its own state; resetHuntState zeroes the shared
	   plan / showComp / isCompChosen flags. Auto-redress slots the MC
	   undressed during the run (clean-exit paths skip cleanupAfterHuntFinalized,
	   so we redress here too -- stolen / lost items are already
	   filtered). */
	function cleanupRunState(run) {
		commitTempCorruption();
		resetToolTimers();
		resetCursedItemState();
		setHuntMode(HuntMode.ENDED);
		setup.Companion.runHuntFailHooks();
		setup.Companion.resetHuntState();
		setup.Wardrobe.redressAfterHunt();
		setup.HuntPayout.restorePreRunStatCaps(run);
	}

	// --- Cursed-item lifecycle ---------------------------------
	/* Reset the cursed-item carry/use state shared across runs:
	   tarot deck stage + draw count + drawn-card stamp, and the
	   monkey-paw lifecycle (wishes count, found stage, learned
	   knowledge, door lock, banned houses). The Notebook's
	   crossed-out-evidence overlay also resets so the
	   knowledge wish / tarot draw doesn't leak between hunts.
	   Called from the hunt lifecycle start/end so a fresh hunt
	   always starts with a fresh deck and an unfound paw. */
	function resetCursedItemState() {
		setup.Tarot.resetHunt();
		setup.Ghosts.clearChosenEvidence();
		setup.MonkeyPaw.resetHunt();
	}

	// --- Tool timers + transient hunt flags --------------------
	/* Per-hunt reset of activatable tool windows (EMF / UVL) and
	   the lust-fuel / overcharged-tools toggles that live under
	   HuntConditions. */
	function resetToolTimers() {
		setup.resetTools();
		setup.HauntConditions.resetHuntFlags();
	}

	// --- Temp corruption accumulator ---------------------------
	/* Bank `amount` into the in-hunt temp corruption pool. Mc owns
	   the underlying $tempCorr; the per-hunt commit drops it onto
	   $mc.corruption (capped at +1) and resets the pool. */
	function addTempCorruption(amount) {
		setup.Mc.setTempCorr((setup.Mc.tempCorr() || 0) + amount);
	}
	function tempCorruption() { return setup.Mc.tempCorr() || 0; }
	function commitTempCorruption() {
		var amount = Math.min(1, setup.Mc.tempCorr() || 0);
		setup.Mc.setTempCorr(amount);
		setup.Mc.addCorruption(amount);
		setup.Mc.setTempCorr(0);
		return amount;
	}

	// --- Hunt-over lifecycle wrap-ups --------------------------
	/* Shared "the hunt is over" tail used by the dedicated HuntOver
	   passages and the Possessed passage. Commits any temp
	   corruption the run accumulated, flips $huntMode out of
	   ACTIVE, and (by default) runs cleanupAfterHuntFinalized so
	   tool timers, companion hooks, and stolen-clothes redress all
	   happen atomically. Options:
		 * possessed: land in POSSESSED instead of the ENDED catch-all,
		   which keys possession-specific cleanup (tarot mark-spent,
		   monkey paw retire) via setup.Tick.applyPossessionItemCleanup.
		 * loseStolen: forwarded to cleanupAfterHuntFinalized to nuke
		   any stolen-clothing flags.
		 * deferCleanup: skip the inline cleanup. Use when the
		   mode-flip needs to fire at passage load but the cleanup
		   should wait for a downstream branch (e.g. HuntOverSanity
		   defers until the High Priestess reprieve resolves). */
	function markHuntOver(opts) {
		opts = opts || {};
		commitTempCorruption();
		setHuntMode(opts.possessed ? HuntMode.POSSESSED : HuntMode.ENDED);
		if (!opts.deferCleanup) {
			cleanupAfterHuntFinalized({ loseStolen: !!opts.loseStolen });
		}
	}
	/* Common end-of-hunt cleanup shared by the hunt lifecycle and
	   the shared hunt-over passages. Does NOT flip $huntMode --
	   markHuntOver owns that and (by default) chains into this
	   function. Standalone callers are the ones that need cleanup
	   without the mode-flip (onCaughtCleanup keeps $huntMode ACTIVE
	   during the post-prowl reveal) or that deferred the cleanup
	   step at markHuntOver time. Pass { loseStolen: true } to nuke
	   any stolen-clothing flags. */
	function cleanupAfterHuntFinalized(opts) {
		opts = opts || {};
		resetToolTimers();
		setup.Companion.runHuntFailHooks();
		setup.Companion.resetHuntState();
		if (opts.loseStolen) setup.Wardrobe.loseAllStolen();
		setup.Wardrobe.redressAfterHunt();
	}

	/* Per-tick steal chance ($stealChance), the prowl/steal trigger
	   rolls (shouldStartProwl, shouldTriggerSteal), the
	   stealClothesTriggered latch, and the prowl-event bookkeeping
	   (rearmHuntTimer, beginProwlEvent) live in HuntProwl.js and
	   splice onto this api at load time. The STEAL_CHECK darkness
	   filter is also registered there. */

	// --- Static house identity helpers -------------------------
	/* Convenience predicates over staticHouseId(). The two referenced
	   externally today are owaissa (Events outfit table) and elm
	   (Events outfit table); the rest of the static catalogue is
	   covered by forced-modifier subscribers and the staticHouseId()
	   getter directly. */
	function isStaticHouse(id) { return staticHouseId() === id; }
	function isOwaissa() { return isStaticHouse('owaissa'); }
	function isElm() { return isStaticHouse('elm'); }

	/* End the active run. Returns a summary record the result passage
	   can render without peeking at $run state, or null when no run is
	   active.

	   Payout split:
		 * Contract hunt -- $run.staticHouseId matches the contract
		   the player is holding from setup.WitchContract. Success
		   pays the contract's cash payout, no ecto. Failure burns
		   the contract for nothing.
		 * Rogue hunt -- no contract held, or held key mismatched.
		   Pays cash on success and ecto on any non-flee outcome
		   (small consolation on failure). Flee pays nothing. */
	function endHunt(success) {
		var run = active();
		if (!run) return null;
		/* Snapshot teardown-sensitive state for the settle emit below.
		   cleanupRunState() resets the monkey-paw (resetCursedItemState ->
		   MonkeyPaw.resetHunt) and end() nulls $run, both BEFORE the emit,
		   so a subscriber reading live state at settle time sees it already
		   wiped. The ctx is the side channel that survives the close (same
		   reason ghostName / modifiers ride along). */
		var pawCarried = setup.MonkeyPaw.isFound();
		var pawWishesLeft = setup.MonkeyPaw.wishesLeft();
		var runModifiers = (run.modifiers || []).slice();
		var summary = setup.HuntPayout.settle(run, success);
		/* Stash the outcome on persistent meta-state so any post-hunt
		   surface that cares about the last result can gate on it --
		   $run is cleared by end() below, so anyone reading needs a
		   side channel that survives a successful close. */
		setup.HuntShop.markLastWasSuccess(success);
		cleanupRunState(run);
		end();
		/* Roll the next-run seed so the GhostStreet card preview and
		   the HuntStart lobby pick a different address / floor plan
		   for the next attempt. Without this the card stayed pinned
		   to the in-game daily seed and showed the same address until
		   the player slept. */
		rollNextSeed();
		setup.Hunt.emit(huntEndEventFor(summary.failureReason), {
			success: !!success,
			isContractHunt: summary.isContractHunt,
			cashPayout: summary.cashPayout,
			ectoplasmPayout: summary.ectoplasmPayout,
			payout: summary.payout,
			failureReason: summary.failureReason,
			ghostName: run.ghostName || null,
			modifiers: runModifiers,
			monkeyPawCarried: pawCarried,
			monkeyPawWishesLeft: pawWishesLeft,
			seed: run.seed,
			number: run.number
		});
		return summary;
	}

	/* Pick the lifecycle-end event for a given failure reason.
	   POSSESSED / CAUGHT / SANITY are "MC went down" outcomes and
	   route through ASSAULTED; everything else (success, FLED,
	   WRONG_CALL, ABANDON, no reason) is a peaceful exit and routes
	   through GRACEFUL. */
	function huntEndEventFor(failureReason) {
		var FR = setup.HuntEnums.FailureReason;
		var assaulted = failureReason === FR.POSSESSED
			|| failureReason === FR.CAUGHT
			|| failureReason === FR.SANITY;
		return assaulted
			? setup.Hunt.Event.HUNT_END_ASSAULTED
			: setup.Hunt.Event.HUNT_END_GRACEFUL;
	}

	// --- Facade / dispatch helpers ----------------------------
	/* The active Ghost instance, or null when no hunt is in flight.
	   Hands back the catalogue ghost as-is, since the evidence list
	   isn't mutated per run. */
	var activeGhost = guarded(null, function () {
		return setup.Ghosts._activeFromCatalogue(ghostName());
	});

	/* True iff the player is in the same room as the active ghost.
	   The optional `houses` filter is silently ignored -- runs aren't
	   house-specific. */
	var isGhostHere = guarded(false, function (houses) {
		if (passage() !== "HuntRun") return false;
		return isInGhostRoom();
	});

	/* True iff the per-tick effects + event chain should fire on
	   this tool-tick / nav-step. A run is in flight AND the player is
	   on the HuntRun passage (so the lobby / end / shop don't drain
	   stats or roll events). */
	var isHuntActive = guarded(false, function () {
		return passage() === "HuntRun";
	});

	/* Hunt tick entry point. Called from the <<huntTickStep>> widget
	   once per nav-step / tool-tick during a hunt. Fires Event.TICK so
	   subscribers (per-tick stat drains, event-roll modifiers, etc.)
	   can hook in without HuntController having to know about them.
	   No-op when no run is active so widget-side guards stay simple. */
	var tick = guarded(undefined, function () {
		var minutes = (setup.Time && typeof setup.Time.minutes === 'function')
			? setup.Time.minutes()
			: null;
		setup.Hunt.emit(setup.Hunt.Event.TICK, { roomId: currentRoomId(), minutes: minutes });
	});

	/* { image, tip } override for the MC sidebar wardrobe strip,
	   sourced through the SIDEBAR_OUTFIT filter so overrides live on
	   the relevant modifier definition (warden_outfit's catalogue
	   sidebarOutfit field, surfaced by its ModifiersController
	   subscriber) instead of branching here. Returns null when no
	   run is active or no subscriber stamps an outfit. Drives
	   widgetMcStatus's fixed-outfit tile branch. */
	var sidebarOutfit = guarded(null, function () {
		var ctx = setup.Hunt.applyFilter(setup.Hunt.Event.SIDEBAR_OUTFIT, {
			outfit: null,
			staticHouseId: staticHouseId(),
			modifierIds: modifiers()
		});
		return ctx.outfit || null;
	});

	/* Passage to <<goto>> when the per-tick chain detects a
	   hunt-over condition. `reason` is one of setup.HuntEnums.FailureReason.SANITY |
	   EXHAUSTION | TIME. Stamps the failure, runs endHunt() to settle
	   the run (payout + state teardown), and returns the dedicated
	   HuntOver* narrative passage so the chain widget can route there
	   with one <<goto>>. */
	var huntOverPassage = guarded(null, function (reason) {
		markFailure(reason);
		var summary = endHunt(false);
		return summary ? summary.exitPassage : setup.HuntPayout.exitPassageForOutcome(false, reason);
	});

	/* The ghost's true identity for the active hunt. Hunts don't
	   disguise, so $run.ghostName is always the real name. Returns ''
	   when no run is active. */
	function realGhostName() {
		return ghostName() || '';
	}

	/* Display label for the ghost's current room. Resolves the
	   floor-plan spawn room id back through the template catalogue
	   so the cheat panel sees a human label ("Bedroom") instead of
	   the internal id ("room_3"). Returns '' when no run is active. */
	var ghostRoomLabel = guarded('', function () {
		var run = active();
		var roomId = ghostRoomId();
		if (!run || !roomId || !run.floorplan) return '';
		var rooms = run.floorplan.rooms || [];
		for (var i = 0; i < rooms.length; i++) {
			if (rooms[i].id === roomId) {
				var t = setup.Templates && setup.Templates.byId(rooms[i].template);
				return t ? t.label : rooms[i].template;
			}
		}
		return roomId;
	});

	/* "Ghost catches the MC" exit target that HuntOverProwl's <<huntBlackoutExit>>
	   widget routes through. Stamps a CAUGHT failure on the run, runs
	   endHunt() to settle payout + teardown, and returns the exit
	   passage (Sleep — the prowl-blackout chain feeds the bedroom
	   cum-covered wake-up). Outside a hunt, also falls back to Sleep. */
	function huntCaughtPassage() {
		if (isActive()) {
			setup.Hunt.emit(setup.Hunt.Event.CAUGHT, { ghostName: ghostName() });
			markFailure(setup.HuntEnums.FailureReason.CAUGHT);
			var summary = endHunt(false);
			return summary ? summary.exitPassage : "Sleep";
		}
		return "Sleep";
	}

	/* End-of-HuntOverProwl cleanup. Wraps the wardrobe / companion /
	   tool-timer reset. Caller wraps this in
	   `not setup.Ghosts.hasHighPriestess()` so the priestess reprieve
	   still skips the cleanup entirely. $run teardown lives on
	   huntCaughtPassage, which is what the huntBlackoutExit link
	   eventually routes through. */
	function onCaughtCleanup() {
		cleanupAfterHuntFinalized({ loseStolen: true });
	}

	/* snapGhostToCurrentRoom / trapGhost / isGhostTrapped / isExitLocked /
	   exitLockReason / clearExitLock / lockCurrentRoom / isRoomLocked /
	   clearRoomLock / sacrificeCursedItemAtDoor are defined in
	   HuntLocks.js and spliced onto this api at the bottom of that
	   file. The trap-and-seal bookkeeping lives there so this file
	   stays focused on hunt lifecycle. */

	/* Runs are one-shot, so banning a house is a no-op. */
	function banActiveContext() {
		return null;
	}

	/* "Get me out of here" exit target -- the goto used by the
	   Monkey Paw leave wish. Stamps an ABANDON failure on the run,
	   runs endHunt() to settle payout + teardown, and returns the exit
	   passage so the leave wish forfeits the run cleanly. */
	var streetExitPassage = guarded(null, function () {
		markFailure(setup.HuntEnums.FailureReason.ABANDON);
		var summary = endHunt(false);
		return summary ? summary.exitPassage : "CityMap";
	});

	/* "The MC has been possessed" target -- the goto used by the Tarot
	   Possession card. Stamps a POSSESSED failure on the run and ends
	   it before the player lands on CityMapPossessed (so a fresh hunt
	   isn't bleeding into the payout summary). Jumps to a daytime
	   hour so the city-map render makes sense after the possession.

	   Not wrapped in `guarded()` because tarotPossession renders three
	   <<link ... `possessionPassage()`>> targets (Give in / Pull a card
	   / Back) and SugarCube evaluates each backtick at link render
	   time. The first call ends the run; the next two must still
	   resolve to a real passage rather than null, otherwise the
	   re-enabled "Pull a card" and Back stay dead and the player gets
	   stuck on TarotCards. Mirrors huntCaughtPassage's pattern. */
	function possessionPassage() {
		if (isActive()) {
			setup.Hunt.emit(setup.Hunt.Event.POSSESS, { ghostName: ghostName() });
			markFailure(setup.HuntEnums.FailureReason.POSSESSED);
			endHunt(false);
			setup.Time.setHours(Math.floor(Math.random() * (20 - 12 + 1)) + 12);
		}
		return "CityMapPossessed";
	}

	/* "Remove one piece of evidence" -- used by the Tarot Knowledge
	   card and the Monkey Paw knowledge wish. Picks a random
	   evidence the active ghost doesn't have so the Notebook can
	   black it out. Writes the result via setup.Ghosts setters so
	   the $knowledgeUsed / $chosenEvidence state stays owned by
	   GhostController.

	   Uses ghost.hasEvidence() (not the raw catalogue array) so
	   Mimic's bonus ectoplasm is never picked as "false" -- the
	   diary must not lie when the player can see ectoplasm in the
	   room. Derives the candidate id list from setup.Ghosts.Evidence
	   so adding a new evidence type to the catalogue automatically
	   includes it here. */
	var consumeKnowledgeEvidence = guarded(undefined, function () {
		if (setup.Ghosts.knowledgeUsed()) return;
		var ghost = activeGhost();
		var allIds = Object.keys(setup.Ghosts.Evidence).map(function (k) {
			return setup.Ghosts.Evidence[k].id;
		});
		var missing = allIds.filter(function (id) {
			return ghost ? !ghost.hasEvidence(id) : true;
		});
		if (!missing.length) return;
		setup.Ghosts.markKnowledgeUsed();
		setup.Ghosts.setChosenEvidence(missing[Math.floor(Math.random() * missing.length)]);
	});

	/* Meta-shop unlock subscribers (SMALLER_HOUSE / FLOORPLAN_OPTIONS)
	   wire into the filter bus from HuntMetaUnlocks.js at module load. */

	/* True iff the Bag was just opened from inside a hunt-context
	   passage -- gates the carry links for the tarot deck and the
	   monkey paw. Accepts the HuntRun passage. */
	function isInsideHuntPassage() {
		var prev = previous(1);
		if (!prev) return false;
		return prev === "HuntRun";
	}

	return {
		OWNED_VARS: OWNED_VARS,
		HuntMode: HuntMode,
		/* Outcome / FailureReason / Objective / objectiveDescription
		   are spliced onto this api by HuntEnums.js after this file
		   evaluates -- see the splice block at the bottom of HuntEnums.js. */
		start: start,
		cheatStampMinimalRun: cheatStampMinimalRun,
		/* Cheat/test-only mode flip. Production lifecycle goes through
		   activateHunt() / markHuntOver() / endRun(); this exists so
		   unit specs can park the controller in a chosen mode without
		   spinning up the full start/end machinery. The `cheat` prefix
		   is lint-enforced (tests/cheat-method-lint.spec.js). */
		cheatSetHuntMode: setHuntMode,
		end: end,
		active: active,
		isActive: isActive,
		huntMode: huntMode,
		isHunting: isHunting,
		isPossessed: isPossessed,
		isEnded: isEnded,
		isAnyMode: isAnyMode,
		activateHunt: activateHunt,
		seed: seed,
		number: number,
		modifiers: modifiers,
		hasModifier: hasModifier,
		addModifier: addModifier,
		loadout: loadout,
		startingTools: startingTools,
		startingToolsBase: startingToolsBase,
		missingToolsToPlace: missingToolsToPlace,
		objective: objective,
		setObjective: setObjective,
		setField: setField,
		field: field,
		outcome: outcome,
		failureReason: failureReason,
		isSuccess: isSuccess,
		markSuccess: markSuccess,
		markFailure: markFailure,
		currentRoomId: currentRoomId,
		setCurrentRoom: setCurrentRoom,
		isRoomDark: isRoomDark,
		isCurrentRoomDark: isCurrentRoomDark,
		setRoomLight: setRoomLight,
		/* setSearchedFurniture / searchedFurniture / collectedLoot /
		   hasCollected / takeLoot / lootKindsAt / lootAt / stealClothes /
		   stashStolenClothes are spliced onto this api by HuntLoot.js
		   after this file evaluates -- see the splice block at the
		   bottom of HuntLoot.js. */
		ectoplasm: ectoplasm,
		addEctoplasm: addEctoplasm,
		removeEctoplasm: removeEctoplasm,
		canAffordEctoplasm: canAffordEctoplasm,
		nextSeed: nextSeed,
		rollNextSeed: rollNextSeed,
		startHunt: startHunt,
		endHunt: endHunt,
		/* minimapData / minimapSvg / isMinimapCollapsed /
		   toggleMinimapCollapsed / currentRoomData / humanizeLootKind
		   are spliced onto this api by HuntMinimap.js after this file
		   evaluates -- see the splice block at the bottom of HuntMinimap.js. */
		ghostName: ghostName,
		staticHouseId: staticHouseId,
		huntAllowsCompanions: huntAllowsCompanions,
		runEvidence: runEvidence,
		ghostRoomId: ghostRoomId,
		isInGhostRoom: isInGhostRoom,
		/* driftGhostRoom / shuffleGhostRoom / driftChance are spliced
		   onto this api by HuntDrift.js after this file evaluates --
		   see the splice block at the bottom of HuntDrift.js. */
		address: address,
		addressFromSeed: setup.HuntAddresses.addressFromSeed,
		ROAD_NAMES: setup.HuntAddresses.ROAD_NAMES,
		ROAD_SUFFIXES: setup.HuntAddresses.ROAD_SUFFIXES,
		activeGhost: activeGhost,
		isGhostHere: isGhostHere,
		isHuntActive: isHuntActive,
		tick: tick,
		sidebarOutfit: sidebarOutfit,
		/* shouldStartProwl / shouldTriggerSteal / stealClothesTriggered /
		   markStealClothesTriggered / resetStealClothesTriggered /
		   stealChance / setStealChance / recomputeStealChance /
		   rearmHuntTimer / beginProwlEvent are spliced onto this api by
		   HuntProwl.js after this file evaluates -- see the splice block
		   at the bottom of HuntProwl.js. */
		addTempCorruption: addTempCorruption,
		tempCorruption: tempCorruption,
		commitTempCorruption: commitTempCorruption,
		resetCursedItemState: resetCursedItemState,
		resetToolTimers: resetToolTimers,
		markHuntOver: markHuntOver,
		cleanupAfterHuntFinalized: cleanupAfterHuntFinalized,
		isStaticHouse: isStaticHouse,
		isOwaissa: isOwaissa,
		isElm: isElm,
		huntOverPassage: huntOverPassage,
		realGhostName: realGhostName,
		ghostRoomLabel: ghostRoomLabel,
		huntCaughtPassage: huntCaughtPassage,
		onCaughtCleanup: onCaughtCleanup,
		/* snapGhostToCurrentRoom / trapGhost / isGhostTrapped / isExitLocked /
		   exitLockReason / clearExitLock / lockCurrentRoom / isRoomLocked /
		   clearRoomLock / sacrificeCursedItemAtDoor are spliced onto this api
		   by HuntLocks.js after this file evaluates -- see the splice block
		   at the bottom of HuntLocks.js. */
		banActiveContext: banActiveContext,
		streetExitPassage: streetExitPassage,
		possessionPassage: possessionPassage,
		consumeKnowledgeEvidence: consumeKnowledgeEvidence,
		isInsideHuntPassage: isInsideHuntPassage
	};
})();
