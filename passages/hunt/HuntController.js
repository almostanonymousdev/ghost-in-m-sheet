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
		// Ghost-room shuffle interval gate -- written only by
		// shuffleGhostRoom (below) and reset when a run starts/ends.
		'lastChangeIntervalRoom'
	]);

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
		run.ghostName     = opts.ghostName;
		run.disguiseName  = opts.ghostName;
		run.evidence      = Array.isArray(opts.evidence) ? opts.evidence.slice() : [];
		if (run.trapped === undefined) run.trapped = false;
		if (run.modifiers     === undefined) run.modifiers     = [];
		if (run.loadout       === undefined) run.loadout       = {};
		if (run.objective     === undefined) run.objective     = setup.HuntEnums.Objective.IDENTIFY.id;
		if (run.staticHouseId === undefined) run.staticHouseId = null;
		if (run.currentRoomId === undefined) run.currentRoomId = 'room_0';
		if (run.searchedFurniture === undefined) run.searchedFurniture = null;
		if (run.collectedLoot === undefined) run.collectedLoot = [];
		if (run.lights        === undefined) run.lights        = {};
	}

	/* End the current run. Preserves the run number so the next
	   start() picks up where we left off; the new run will overwrite
	   the rest of the fields. Also flips $huntMode back to NONE and
	   tears down companion bookkeeping that startHunt stamped, so a
	   Cancel from the HuntStart lobby (which calls this directly, not
	   endHunt) doesn't leave Ghosts.isHunting() stuck on -- which
	   would let the post-passage tick redirect the player into
	   HuntOverTime once the clock crossed 06:00. */
	function end() {
		var prior = sv().run;
		sv().run = null;
		if (setup.Ghosts && typeof setup.Ghosts.setHuntMode === 'function') {
			setup.Ghosts.setHuntMode(setup.Ghosts.HuntMode.NONE);
		}
		if (setup.Companion) {
			if (typeof setup.Companion.runHuntFailHooks === 'function') setup.Companion.runHuntFailHooks();
			if (typeof setup.Companion.resetHuntState === 'function') setup.Companion.resetHuntState();
		}
		/* Pair with freezeBeauty() in startHunt. No-op when nothing is
		   frozen, so the lobby-cancel path (which never reached the freeze)
		   stays correct. */
		if (setup.Mc && typeof setup.Mc.unfreezeBeauty === 'function') {
			setup.Mc.unfreezeBeauty();
		}
		return prior;
	}

	function active()    { return sv().run || null; }
	function isActive()  { return !!sv().run; }

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
	function seed()       { return sv().run ? sv().run.seed : null; }
	function number()     { return sv().run ? sv().run.number : 0; }
	function modifiers()  { return sv().run ? sv().run.modifiers.slice() : []; }
	function loadout()    { return sv().run ? sv().run.loadout : null; }
	function objective()  { return sv().run ? sv().run.objective : null; }
	function currentRoomId() {
		var run = sv().run;
		return run ? (run.currentRoomId || 'room_0') : null;
	}
	/* Furniture-search bookkeeping. The HuntRun layout wraps each
	   furniture image in a link that calls setSearchedFurniture(suffix)
	   then routes to FurnitureSearch, which reads the {room,
	   suffix} pair via searchedFurniture() and looks up what (if
	   anything) is hidden there with lootAt(). takeLoot() marks a
	   kind as collected so a follow-up search of the same spot finds
	   nothing. */
	function setSearchedFurniture(suffix) {
		var run = sv().run;
		if (!run) return;
		run.searchedFurniture = { room: run.currentRoomId || 'room_0', suffix: suffix };
	}
	function searchedFurniture() {
		var run = sv().run;
		return run ? (run.searchedFurniture || null) : null;
	}
	function collectedLoot() {
		var run = sv().run;
		return run && Array.isArray(run.collectedLoot) ? run.collectedLoot.slice() : [];
	}
	function hasCollected(kind) {
		var run = sv().run;
		return !!(run && Array.isArray(run.collectedLoot)
			&& run.collectedLoot.indexOf(kind) !== -1);
	}
	function takeLoot(kind) {
		var run = sv().run;
		if (!run || !kind) return false;
		if (!Array.isArray(run.collectedLoot)) run.collectedLoot = [];
		if (run.collectedLoot.indexOf(kind) !== -1) return false;
		run.collectedLoot.push(kind);
		setup.Hunt.emit(setup.Hunt.Event.LOOT_TAKEN, { kind: kind, roomId: run.currentRoomId || null });
		return true;
	}
	/* All (uncollected) loot kinds hidden in `roomId`'s `suffix`
	   furniture slot, in the order they were stamped onto the plan.
	   The floor-plan generator prefers distinct slots but can fall
	   back to sharing one when the room runs out of unique furniture
	   (forced-furniture loot kinds: tarotCards, monkeyPaw, tool_<id>),
	   so a single search may legitimately surface several items at
	   once. Returns []  when no run is active. */
	function lootKindsAt(roomId, suffix) {
		var run = sv().run;
		if (!run || !run.floorplan) return [];
		var fp = run.floorplan;
		var loot = fp.loot || {};
		var furn = fp.lootFurniture || {};
		var collected = Array.isArray(run.collectedLoot) ? run.collectedLoot : [];
		var out = [];
		Object.keys(loot).forEach(function (k) {
			if (loot[k] === roomId && furn[k] === suffix && collected.indexOf(k) === -1 && isLootKindAvailable(k)) {
				out.push(k);
			}
		});
		return out;
	}

	/* Is the given loot kind currently *retrievable*? Some kinds are
	   stamped onto the floor plan but gated by external state that can
	   flip mid-run (clothesStolen → restored elsewhere; tarot deck moved
	   out of HIDDEN; monkey paw retired). FurnitureSearch already
	   refuses to hand out these pickups when the gate is closed, but
	   without filtering at lootKindsAt the detector kept highlighting
	   the slot ("highlighted furniture says nothing in it"). Centralize
	   the gates here so the highlight and the pickup stay in lockstep. */
	function isLootKindAvailable(kind) {
		if (kind === 'clothesStolen') {
			return !!(setup.HauntedHouses && setup.HauntedHouses.hasClothesStolen && setup.HauntedHouses.hasClothesStolen());
		}
		if (kind === 'tarotCards') {
			return !!(setup.HauntedHouses && setup.HauntedHouses.tarotCardsStage &&
				setup.HauntedHouses.tarotCardsStage() === setup.TarotStage.HIDDEN);
		}
		if (kind === 'monkeyPaw') {
			return !!(setup.MonkeyPaw && setup.MonkeyPaw.isDiscoverable && setup.MonkeyPaw.isDiscoverable());
		}
		return true;
	}

	/* Single-kind variant -- returns the first uncollected loot kind
	   at the slot, or null. Kept for callers that only need to know
	   "is there anything here"; multi-kind sites use lootKindsAt. */
	function lootAt(roomId, suffix) {
		var kinds = lootKindsAt(roomId, suffix);
		return kinds.length ? kinds[0] : null;
	}

	/* Stash stolen clothes onto a furniture slot somewhere on the
	   floor plan, using the same loot/lootFurniture pipeline as
	   cursedItem / tarotCards / monkeyPaw -- so a normal furniture
	   search reveals them via setup.HuntController.lootKindsAt. The
	   stash is weighted by BFS distance from the player's current
	   room: ~50% chance to land in the current room (when it has any
	   furniture), with the remainder split among reachable rooms
	   on a 1/distance falloff (so a neighbor is twice as likely as
	   a room two hops away). When the current room has no furniture
	   the full weight redistributes onto the rest of the house.
	   The slot picker prefers furniture pieces that aren't already
	   pinned to other loot, so co-located stashes are rare. Returns
	   `{ roomId, suffix }` on success or null when the floor plan
	   has no furniture-bearing rooms.

	   Also clears any prior 'clothesStolen' entry from collectedLoot
	   so a re-steal during the same run is findable again. */
	function stashStolenClothes(rngOpt) {
		var run = sv().run;
		if (!run || !run.floorplan) return null;
		var fp = run.floorplan;
		var rand = (typeof rngOpt === 'function') ? rngOpt : Math.random;

		var furnitureRooms = fp.rooms.filter(function (r) {
			var t = setup.Templates && setup.Templates.byId(r.template);
			return !!(t && Array.isArray(t.furniture) && t.furniture.length);
		});
		if (!furnitureRooms.length) return null;

		var current = run.currentRoomId || 'room_0';
		var distances = setup.FloorPlan.bfsDistances(fp, current);

		// Weight rooms: distance-0 absorbs 50% (when reachable +
		// has furniture), the rest splits the remaining 50% by 1/d.
		var hasCurrent = furnitureRooms.some(function (r) { return r.id === current; });
		var falloff = furnitureRooms.map(function (r) {
			var d = distances[r.id];
			if (d == null) return 0;        // unreachable
			if (d === 0)   return 0;        // current-room handled separately
			return 1 / d;
		});
		var falloffSum = falloff.reduce(function (a, b) { return a + b; }, 0);

		var weights;
		if (hasCurrent && falloffSum > 0) {
			weights = furnitureRooms.map(function (r, i) {
				return r.id === current ? 0.5 : 0.5 * (falloff[i] / falloffSum);
			});
		} else if (hasCurrent) {
			// Only the current room is furnitured & reachable.
			weights = furnitureRooms.map(function (r) {
				return r.id === current ? 1 : 0;
			});
		} else if (falloffSum > 0) {
			// No furniture in current room: redistribute 100% by 1/d.
			weights = falloff.map(function (w) { return w / falloffSum; });
		} else {
			// Nothing reachable from current room had furniture --
			// fall back to a uniform pick across all furniture rooms
			// (covers degenerate plans where current is isolated).
			weights = furnitureRooms.map(function () { return 1 / furnitureRooms.length; });
		}

		var roll = rand();
		var cum = 0;
		var pickedIdx = furnitureRooms.length - 1;
		for (var i = 0; i < weights.length; i++) {
			cum += weights[i];
			if (roll < cum) { pickedIdx = i; break; }
		}
		var picked = furnitureRooms[pickedIdx];
		var t = setup.Templates.byId(picked.template);

		// Avoid (room, suffix) collisions with already-placed loot
		// when there's a free slot to use.
		var lootFurn = fp.lootFurniture || {};
		var taken = {};
		Object.keys(fp.loot || {}).forEach(function (k) {
			if (k === 'clothesStolen') return;
			if (fp.loot[k] === picked.id && lootFurn[k]) taken[lootFurn[k]] = true;
		});
		var available = t.furniture.filter(function (f) { return !taken[f]; });
		var pool = available.length ? available : t.furniture.slice();
		var suffix = pool[Math.floor(rand() * pool.length)];

		if (!fp.loot) fp.loot = {};
		if (!fp.lootFurniture) fp.lootFurniture = {};
		fp.loot.clothesStolen = picked.id;
		fp.lootFurniture.clothesStolen = suffix;

		// A previous steal in the same run may have left
		// 'clothesStolen' in collectedLoot; clear it so the new
		// stash is searchable.
		if (Array.isArray(run.collectedLoot)) {
			var idx = run.collectedLoot.indexOf('clothesStolen');
			if (idx !== -1) run.collectedLoot.splice(idx, 1);
		}

		return { roomId: picked.id, suffix: suffix };
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

	// --- Meta-progression: ectoplasm (mL) ---------------------
	function ectoplasm() { return sv().ectoplasm || 0; }
	function addEctoplasm(n) {
		sv().ectoplasm = (sv().ectoplasm || 0) + (n || 0);
		return sv().ectoplasm;
	}
	/* Spend `n` mL of ectoplasm. Returns true on success, false if
	   the player can't afford it. No partial deductions. */
	function removeEctoplasm(n) {
		var have = sv().ectoplasm || 0;
		if (have < n) return false;
		sv().ectoplasm = have - n;
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
			count:         opts.modifierCount != null ? opts.modifierCount : null,
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
			fpOpts:        fpOpts,
			modifierIds:   modifierIds,
			seed:          seed,
			loadout:       opts.loadout || null,
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
		   (setup.Ghosts.isHunting() / active(), companion mini panel +
		   walk-home gate, Mimic rotation, Bag tabs, tick-side morning /
		   possessed checks) lights up immediately. */
		setup.Ghosts.activateHunt();
		/* Pin the in-game clock to midnight so the post-passage tick
		   doesn't punt the player into HuntOverTime the moment they
		   land on HuntStart/HuntRun. In production this matches what
		   GhostStreet already does on entry; here we keep the controller
		   self-consistent so callers that bypass GhostStreet (tests,
		   future entry points) still see a well-defined clock. */
		if (setup.Time && typeof setup.Time.resetToMidnight === 'function') {
			setup.Time.resetToMidnight();
		}
		/* Same shared-state reset classic did at GhostRandomize:
		   tarot deck back to HIDDEN, monkey paw back to 3 wishes /
		   not-yet-found / no banned houses, knowledge-evidence
		   overlay cleared. The cursed-item carry pickup reuses
		   markTarotCarrying / markFound, so both items feed
		   into the same Bag link + TarotCards / MonkeyPaw passages. */
		if (setup.HauntedHouses && setup.HauntedHouses.resetCursedItemState) {
			setup.HauntedHouses.resetCursedItemState();
		}
		/* Notebook checkboxes also reset so Intense Intuition's
		   pre-check below isn't joined by leftover ticks from a
		   previous run. */
		if (setup.Ghosts && setup.Ghosts.resetEvidenceChecks) {
			setup.Ghosts.resetEvidenceChecks();
		}
		applyMetaUnlocksAtStart(floorplan, seed, evidenceIds);
		/* Pin MC beauty for the duration of the hunt so drift chance,
		   event rolls, and other beauty-driven checks see a stable
		   value even if clothes get torn off / makeup wipes mid-run.
		   end() clears it on both the success-payout path and the
		   lobby-cancel path. */
		setup.Mc.freezeBeauty();
		setup.Hunt.emit(setup.Hunt.Event.START, { ghostName: ghostName, seed: seed });
		return active();
	}

	/* Stamp meta-shop unlocks onto the freshly-built run. Splits the
	   side-effect block out of startHunt() so the lifecycle code stays
	   focused on roll/draft/floor-plan composition. The run object is
	   already populated when this runs, so the pre-stamps land on the
	   right $run.collectedLoot list. */
	function applyMetaUnlocksAtStart(floorplan, seed, evidenceIds) {
		var run = sv().run;
		if (!run) return;
		var Shop = setup.HuntShop;
		var Item = Shop.ShopItem;

		/* Witch's Blessing: tarot deck already in the bag. Mirrors the
		   FurnitureSearch pickup -- markTarotCarrying flips the stage
		   so Bag exposes the tarot link, and stamping 'tarotCards' onto
		   collectedLoot prevents the floor-plan tarot pickup from
		   double-granting. We leave the floor-plan pin intact so a
		   re-search of that slot still reports nothing (already-collected). */
		if (Shop.hasUnlock(Item.WITCHS_BLESSING)
			&& setup.HauntedHouses
			&& typeof setup.HauntedHouses.markTarotCarrying === 'function') {
			setup.HauntedHouses.markTarotCarrying();
			takeLoot('tarotCards');
		}

		/* Monkey's Favor: paw already found, ready for its first wish.
		   Same pattern as Witch's Blessing, against MonkeyPaw.markFound. */
		if (Shop.hasUnlock(Item.MONKEYS_FAVOR)
			&& setup.MonkeyPaw
			&& typeof setup.MonkeyPaw.markFound === 'function') {
			setup.MonkeyPaw.markFound();
			takeLoot('monkeyPaw');
		}

		/* Stat-cap bumps. Snapshot the prior caps so endHunt can
		   restore them; the player's $mc.sanityMax / energyMax are
		   long-lived and must come back unchanged. */
		run.preRunStatCaps = {
			sanityMax: setup.Mc.sanityMax(),
			sanity:    setup.Mc.sanity(),
			energyMax: setup.Mc.energyMax(),
			energy:    setup.Mc.energy()
		};
		if (Shop.hasUnlock(Item.STEELED_HAND)) {
			setup.Mc.setSanityMax(setup.Mc.sanityMax() + 25);
			setup.Mc.addSanity(25);
		}
		if (Shop.hasUnlock(Item.CALVES_OF_STEEL)) {
			setup.Mc.setEnergyMax(setup.Mc.energyMax() + 5);
			setup.Mc.addEnergy(5);
		}

		/* Intense Intuition: pre-check one of the ghost's true evidence
		   ids in the Notebook. Picked seed-deterministically from the
		   per-run evidence list (already trimmed by Fog of War, so the
		   pre-check never reveals a hidden one). */
		if (Shop.hasUnlock(Item.INTENSE_INTUITION)
			&& Array.isArray(evidenceIds) && evidenceIds.length
			&& setup.Ghosts && typeof setup.Ghosts.setEvidenceCheck === 'function') {
			var idx = ((seed ^ 0x27d4eb2f) >>> 0) % evidenceIds.length;
			setup.Ghosts.setEvidenceCheck(evidenceIds[idx], true);
		}
	}

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
	   Procedural runs default to allowed; static-plan houses opt in
	   or out via the catalogue's allowsCompanions flag, surfaced by
	   the COMPANION_ALLOWED filter subscriber in HuntHousesController.
	   Drives both the HuntStart "Talk to her" gate and the in-hunt
	   HUD via Companion.inHauntedHouseLocation. */
	var huntAllowsCompanions = guarded(false, function () {
		var ctx = setup.Hunt.applyFilter(setup.Hunt.Event.COMPANION_ALLOWED, {
			allowed:       true,
			staticHouseId: staticHouseId()
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
			addr:          addr,
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

	/* Ghost-room drift. Picks a fresh room (any template,
	   including the hallway) from the floor plan and updates
	   floorplan.spawnRoomId. Called by shuffleGhostRoom() once the
	   shared interval gate + 45% roll have passed; the controller
	   already filtered for `staysInOneRoom`, so all that's left here
	   is the rule "prefer to drift somewhere different from the
	   current lair". */
	function driftGhostRoom() {
		var run = sv().run;
		if (!run || !run.floorplan) return;
		if (run.trapped) return;
		var fp = run.floorplan;
		if (!Array.isArray(fp.rooms) || !fp.rooms.length) return;
		var allIds = fp.rooms.map(function (r) { return r.id; });
		// Prefer drifting somewhere new; fall back to the full pool
		// when there's only one room in the plan.
		var others = allIds.filter(function (id) { return id !== fp.spawnRoomId; });
		var pool = others.length ? others : allIds;
		var fromRoom = fp.spawnRoomId;
		fp.spawnRoomId = pool[Math.floor(Math.random() * pool.length)];
		setup.Hunt.emit(setup.Hunt.Event.DRIFT, { fromRoom: fromRoom, toRoom: fp.spawnRoomId });
	}

	/* Minimap data (minimapData / minimapSvg / collapse state),
	   currentRoomData, and humanizeLootKind / humanizeFurniture
	   helpers live in HuntMinimap.js and splice onto this api at
	   load time. Hosted there so view-layer SVG-building doesn't
	   bloat the lifecycle file. */

	/* Outcome / failure-reason readers and writers. Callers go
	   through these instead of touching $run.outcome / $run.failureReason
	   directly so the field names + Outcome enum stay in one place.
	   markSuccess / markFailure cover the common "stamp the result on
	   the run before navigating to HuntSummary" flow. */
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

	/* Map a (success, failureReason) pair to the passage HuntSummary's
	   Continue link should target. Successful runs and failures without
	   a dedicated HuntOver* screen fall back to CityMap. Centralizing
	   the lookup keeps HuntSummary free of FailureReason branches. */
	function exitPassageForOutcome(success, reason) {
		if (success) return "CityMap";
		var FR = setup.HuntEnums.FailureReason;
		if (reason === FR.SANITY) return "HuntOverSanity";
		if (reason === FR.EXHAUSTION) return "HuntOverExhaustion";
		if (reason === FR.TIME) return "HuntOverTime";
		return "CityMap";
	}

	/* End the active run, paying out cash (contract hunt) or cash
	   plus ectoplasm (rogue hunt) based on whether the MC walked in
	   with a key from Khadija. Returns a small summary record the
	   result passage can render without needing to peek at $run state.

	   Payout split:
	     * Contract hunt -- $run.staticHouseId matches the key the
	       player is holding from setup.WitchContract. Success pays
	       the contract's cash payout (modifier multiplier applies).
	       Any failure burns the key for no money. No ectoplasm.
	     * Rogue hunt -- no contract held, or the held key is for a
	       different house. Pays cash on success and ectoplasm on
	       any outcome (small consolation on failure). Cash is the
	       steady-income side, ectoplasm feeds the meta-shop.

	   Run cleanup mirrors the classic HuntOver* passages: commit any
	   tempCorr the run accumulated, reset bait/overcharged/exhaustion
	   flags, and reset timed-tool activations. setup.HauntedHouses
	   owns those helpers because the cleanup is shared. */
	function endHunt(success) {
		var run = active();
		if (!run) return null;
		var payCtx = setup.Hunt.applyFilter(setup.Hunt.Event.PAYOUT, {
			multiplier: 1,
			modifierIds: (run.modifiers || []).slice(),
			success: !!success
		});
		var mult = (typeof payCtx.multiplier === 'number') ? payCtx.multiplier : 1;

		var heldId = (setup.WitchContract && typeof setup.WitchContract.heldHouseId === 'function')
			? setup.WitchContract.heldHouseId()
			: null;
		var isContractHunt = !!run.staticHouseId && heldId === run.staticHouseId;

		var cashPayout = 0;
		var ectoplasmPayout = 0;
		var contractPayout = 0;
		if (isContractHunt) {
			contractPayout = setup.WitchContract.resolveHeld(!!success);
			cashPayout = Math.round(contractPayout * mult);
		} else {
			cashPayout = Math.round((success ? 50 : 0) * mult);
			ectoplasmPayout = Math.round((success ? 10 : 3) * mult);
		}
		if (cashPayout > 0 && setup.Mc && typeof setup.Mc.addMoney === 'function') {
			setup.Mc.addMoney(cashPayout);
		}
		if (ectoplasmPayout > 0) addEctoplasm(ectoplasmPayout);
		var xpReward = Math.round((success ? 20 : 5) * mult);
		if (setup.Mc && typeof setup.Mc.grantExp === 'function') {
			setup.Mc.grantExp(xpReward);
		}
		var summary = {
			seed: run.seed,
			number: run.number,
			modifiers: (run.modifiers || []).slice(),
			objective: run.objective,
			failureReason: run.failureReason || null,
			success: !!success,
			isContractHunt: isContractHunt,
			cashPayout: cashPayout,
			ectoplasmPayout: ectoplasmPayout,
			payout: cashPayout + ectoplasmPayout,
			xp: xpReward,
			exitPassage: exitPassageForOutcome(!!success, run.failureReason || null)
		};
		/* Stash the outcome on persistent meta-state so HuntSummary
		   can gate the "Start a new hunt" continuation link on it --
		   $run is cleared by end() below, so the passage needs a
		   side channel that survives a successful close. */
		setup.HuntShop.markLastWasSuccess(success);
		if (setup.HauntedHouses) {
			if (typeof setup.HauntedHouses.commitTempCorruption === 'function') {
				setup.HauntedHouses.commitTempCorruption();
			}
			if (typeof setup.HauntedHouses.resetToolTimers === 'function') {
				setup.HauntedHouses.resetToolTimers();
			}
			/* Hand the deck and paw back so a follow-up run starts
			   from HIDDEN / 3 wishes instead of inheriting whatever
			   the run left them in. */
			if (typeof setup.HauntedHouses.resetCursedItemState === 'function') {
				setup.HauntedHouses.resetCursedItemState();
			}
		}
		/* Tear down the legacy hunt-mode state stamped at startHunt so
		   the next contract starts from HuntMode.NONE and the per-tick
		   companion machinery (mini panel, attack roll, leave-after-event)
		   sees a clean slate. runHuntFailHooks gives the active companion
		   (if any) a chance to clean up their own state; resetHuntState
		   then zeroes the shared plan / showComp / isCompChosen flags. */
		setup.Ghosts.setHuntMode(setup.Ghosts.HuntMode.POSSESSED);
		if (setup.Companion) {
			setup.Companion.runHuntFailHooks();
			setup.Companion.resetHuntState();
		}
		/* Auto-redress slots the MC undressed herself during the run.
		   The caught path runs this through cleanupAfterHunt; the
		   clean-exit paths (success / flee) skip that helper, so
		   we redress here too. Stolen / lost items are already filtered. */
		if (setup.Wardrobe && typeof setup.Wardrobe.redressAfterHunt === 'function') {
			setup.Wardrobe.redressAfterHunt();
		}
		/* Restore the pre-run sanity / energy caps if the run bumped
		   them via Steeled Hand / Calves of Steel. Caps are long-lived
		   (energyMax in particular is bumped by permanent fitness
		   gains), so we always snap back to whatever the player walked
		   in with. Current sanity/energy follow the delta: clamp to
		   the restored cap so a fresh hunt doesn't start with a
		   125-out-of-100 bar. */
		var caps = run.preRunStatCaps;
		if (caps) {
			setup.Mc.setSanityMax(caps.sanityMax);
			setup.Mc.setEnergyMax(caps.energyMax);
			if (setup.Mc.sanity() > caps.sanityMax) setup.Mc.setSanity(caps.sanityMax);
			if (setup.Mc.energy() > caps.energyMax) setup.Mc.setEnergy(caps.energyMax);
		}
		end();
		/* Roll the next-run seed so the GhostStreet card preview and
		   the HuntStart lobby pick a different address / floor plan
		   for the next attempt. Without this the card stayed pinned
		   to the in-game daily seed and showed the same address until
		   the player slept. */
		rollNextSeed();
		setup.Hunt.emit(setup.Hunt.Event.END, {
			success: !!success,
			isContractHunt: isContractHunt,
			cashPayout: cashPayout,
			ectoplasmPayout: ectoplasmPayout,
			payout: cashPayout + ectoplasmPayout,
			failureReason: summary.failureReason,
			ghostName: run.ghostName || null,
			seed: run.seed,
			number: run.number
		});
		return summary;
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
	   sourced through the SIDEBAR_OUTFIT filter so per-house overrides
	   live on the catalogue entry (HuntHousesController subscriber)
	   instead of branching here. Returns null when no run is active or
	   no subscriber stamps an outfit. Drives widgetMcStatus's
	   fixed-outfit tile branch. */
	var sidebarOutfit = guarded(null, function () {
		var ctx = setup.Hunt.applyFilter(setup.Hunt.Event.SIDEBAR_OUTFIT, {
			outfit:        null,
			staticHouseId: staticHouseId()
		});
		return ctx.outfit || null;
	});

	/* Random hunt-event roll. Uses the shared threshold + ghost.canProwl
	   gate -- the predicate works off $prowlActivated / $elapsedTimeProwl /
	   $prowlTimeRemain, which the per-tick TickController maintenance
	   keeps fresh. When a roll comes back true the per-tick chain in
	   widgetInclude routes to GhostProwlEvent (Hide / RunFast / PrayHunt /
	   FreezeHunt / HuntEventSuccubus all return through huntCaughtPassage
	   or $return so they land back on the right passage). */
	var shouldStartProwl = guarded(false, function () {
		return setup.HauntedHouses.shouldStartProwl();
	});

	/* Steal-clothes roll. The wardrobe / stash side-effects are
	   shared, so once a steal fires the StealClothes cascade works.
	   Per-house opt-outs (Ironclad's runsStealClothes=false) and
	   modifier overrides (Swiper) live as STEAL_CHECK filter
	   subscribers applied inside HauntedHouses.shouldTriggerSteal. */
	var shouldTriggerSteal = guarded(false, function () {
		return setup.HauntedHouses.shouldTriggerSteal();
	});

	/* Passage to <<goto>> when the per-tick chain detects a
	   hunt-over condition. `reason` is one of setup.HuntEnums.FailureReason.SANITY |
	   EXHAUSTION | TIME. Stamps the run as a failure with the reason
	   and returns "HuntSummary" so the chain widget can route there
	   with one <<goto>>. */
	var huntOverPassage = guarded(null, function (reason) {
		markFailure(reason);
		return "HuntSummary";
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

	/* "Ghost catches the MC" exit target that HuntEnd's <<huntEndExit>>
	   widget routes through. Stamps a CAUGHT failure on the run and
	   routes to HuntSummary. */
	function huntCaughtPassage() {
		if (isActive()) {
			setup.Hunt.emit(setup.Hunt.Event.CAUGHT, { ghostName: ghostName() });
			markFailure(setup.HuntEnums.FailureReason.CAUGHT);
			return "HuntSummary";
		}
		return "Sleep";
	}

	/* Periodic ghost-room shuffle. Roughly every 20 in-game minutes
	   the ghost has a chance to drift to a different room. The
	   interval gate (`$lastChangeIntervalRoom`) lives at the
	   controller level. Drift chance scales with MC beauty: base 45%
	   at beauty <= 30, losing 0.5% per point above 30, floored at 20%.

	   Skips when:
	   - no hunt is active;
	   - the ghost's catalogue marks it `staysInOneRoom`;
	   - the same 20-minute interval has already rolled this run. */
	function shuffleGhostRoom() {
		if (!isHuntActive()) return;
		var ghost = activeGhost();
		if (!ghost || ghost.staysInOneRoom) return;
		// Bait pins the ghost to the player for its window; skip the
		// drift roll so the bait spend doesn't get undone by a shuffle.
		if (setup.HauntConditions && setup.HauntConditions.isBaitActive
			&& setup.HauntConditions.isBaitActive()) return;
		var mins = setup.Time.minutes() || 0;
		var interval = mins < 20 ? "0-19" : mins < 40 ? "20-39" : "40-59";
		var s = sv();
		if (interval === s.lastChangeIntervalRoom) return;
		if (Math.random() < driftChance()) {
			driftGhostRoom();
		}
		s.lastChangeIntervalRoom = interval;
	}

	function driftChance() {
		var beauty = (setup.Mc && setup.Mc.beauty) ? (setup.Mc.beauty() || 0) : 0;
		var bonus = Math.max(0, beauty - 30);
		return Math.max(0.20, 0.45 - bonus * 0.005);
	}

	/* End-of-HuntEnd cleanup. Wraps the wardrobe / companion /
	   tool-timer reset. Caller wraps this in
	   `not setup.Ghosts.hasHighPriestess()` so the priestess reprieve
	   still skips the cleanup entirely. The hunt lifecycle handles
	   its own $run teardown when the player clicks the huntEndExit
	   link through to HuntSummary. */
	function onCaughtCleanup() {
		setup.HauntedHouses.cleanupAfterHunt({ loseStolen: true });
	}

	/* Pin the active ghost to the player's current room. Used by the
	   Monkey Paw activity-tier-3 and trapTheGhost-tier-3 wishes.
	   Snaps floorplan.spawnRoomId to $run.currentRoomId. Returns true
	   on success, false when no run is active. */
	var snapGhostToCurrentRoom = guarded(false, function () {
		var run = active();
		if (!run || !run.floorplan) return false;
		var roomId = run.currentRoomId || 'room_0';
		run.floorplan.spawnRoomId = roomId;
		return true;
	});

	/* Pin the ghost in place + lock the player's exit. Stamps
	   run.trapped + run.exitLock so the nav layer can refuse exits
	   until the lock is cleared. The trapped flag also opts the run
	   out of the periodic ghost-room drift roll. */
	var trapGhost = guarded(false, function (unlockBy) {
		var run = active();
		if (!run) return false;
		run.trapped = true;
		run.exitLock = { unlockBy: unlockBy };
		setup.Hunt.emit(setup.Hunt.Event.TRAP, { unlockBy: unlockBy, roomId: run.floorplan && run.floorplan.spawnRoomId });
		return true;
	});

	/* True iff the run's ghost is currently trapped. driftGhostRoom
	   uses this to skip the shuffle for trapped ghosts. */
	var isGhostTrapped = guarded(false, function () {
		var run = active();
		return !!(run && run.trapped);
	});

	/* Runs are one-shot, so banning a house is a no-op. */
	function banActiveContext() {
		return null;
	}

	/* "Get me out of here" exit target -- the goto used by the
	   Monkey Paw leave wish. Stamps an ABANDON failure on the run
	   and returns HuntSummary so the leave wish forfeits the run cleanly. */
	var streetExitPassage = guarded(null, function () {
		markFailure(setup.HuntEnums.FailureReason.ABANDON);
		return "HuntSummary";
	});

	/* "The MC has been possessed" target -- the goto used by the Tarot
	   Possession card. Stamps a POSSESSED failure on the run and ends
	   it before the player lands on CityMapPossessed (so a fresh hunt
	   isn't bleeding into the payout summary). Jumps to a daytime
	   hour so the city-map render makes sense after the possession.
	   The widget caller wraps the link around the returned passage so
	   the imperative side effects fire as part of the link click. */
	var possessionPassage = guarded(null, function () {
		setup.Hunt.emit(setup.Hunt.Event.POSSESS, { ghostName: ghostName() });
		markFailure(setup.HuntEnums.FailureReason.POSSESSED);
		endHunt(false);
		setup.Time.setHours(Math.floor(Math.random() * (20 - 12 + 1)) + 12);
		return "CityMapPossessed";
	});

	/* "Remove one piece of evidence" -- used by the Tarot Knowledge
	   card and the Monkey Paw knowledge wish. Picks a random
	   evidence the active ghost doesn't have. Writes the result via
	   setup.Ghosts setters so the $knowledgeUsed / $chosenEvidence
	   state stays owned by GhostController. */
	var consumeKnowledgeEvidence = guarded(undefined, function () {
		if (setup.Ghosts.knowledgeUsed()) return;
		setup.Ghosts.markKnowledgeUsed();
		var ghost = activeGhost();
		var owned = [];
		if (ghost && Array.isArray(ghost.evidence)) {
			owned = ghost.evidence.map(function (e) {
				return e && e.id ? e.id : e;
			});
		}
		var all = ['emf', 'spiritbox', 'gwb', 'uvl', 'glass', 'temperature'];
		var missing = all.filter(function (e) { return owned.indexOf(e) === -1; });
		setup.Ghosts.setChosenEvidence(missing.length
			? missing[Math.floor(Math.random() * missing.length)]
			: null);
	});

	/* Meta-shop unlock effects wire into the same filter bus the
	   modifiers use. The buildHunt path stays agnostic; each unlock
	   that mutates a lifecycle ctx registers its own subscriber. */
	setup.Hunt.filter(setup.Hunt.Event.FLOORPLAN_OPTIONS, function (ctx) {
		/* Smaller House meta-unlock shaves one room off the haunt.
		   Applied after any modifier room-count bumps so it composes
		   with Maze (still net +2) and the tool-loot expansion (still
		   keeps a slot per missing tool). Floor at the generator's
		   hard min of 2 (hallway + 1). */
		if (!setup.HuntShop.hasUnlock(setup.HuntShop.ShopItem.SMALLER_HOUSE)) return;
		if (!ctx || !ctx.fpOpts) return;
		ctx.fpOpts.roomCount = Math.max(2, (ctx.fpOpts.roomCount || 5) - 1);
	});

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
		/* Outcome / FailureReason / Objective / objectiveDescription
		   are spliced onto this api by HuntEnums.js after this file
		   evaluates -- see the splice block at the bottom of HuntEnums.js. */
		start: start,
		cheatStampMinimalRun: cheatStampMinimalRun,
		end: end,
		active: active,
		isActive: isActive,
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
		setSearchedFurniture: setSearchedFurniture,
		searchedFurniture: searchedFurniture,
		stashStolenClothes: stashStolenClothes,
		lootAt: lootAt,
		lootKindsAt: lootKindsAt,
		takeLoot: takeLoot,
		hasCollected: hasCollected,
		collectedLoot: collectedLoot,
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
		driftGhostRoom: driftGhostRoom,
		address: address,
		addressFromSeed: setup.HuntAddresses.addressFromSeed,
		ROAD_NAMES: setup.HuntAddresses.ROAD_NAMES,
		ROAD_SUFFIXES: setup.HuntAddresses.ROAD_SUFFIXES,
		activeGhost: activeGhost,
		isGhostHere: isGhostHere,
		isHuntActive: isHuntActive,
		tick: tick,
		sidebarOutfit: sidebarOutfit,
		shouldStartProwl: shouldStartProwl,
		shouldTriggerSteal: shouldTriggerSteal,
		huntOverPassage: huntOverPassage,
		realGhostName: realGhostName,
		ghostRoomLabel: ghostRoomLabel,
		huntCaughtPassage: huntCaughtPassage,
		onCaughtCleanup: onCaughtCleanup,
		shuffleGhostRoom: shuffleGhostRoom,
		driftChance: driftChance,
		snapGhostToCurrentRoom: snapGhostToCurrentRoom,
		trapGhost: trapGhost,
		isGhostTrapped: isGhostTrapped,
		banActiveContext: banActiveContext,
		streetExitPassage: streetExitPassage,
		possessionPassage: possessionPassage,
		consumeKnowledgeEvidence: consumeKnowledgeEvidence,
		isInsideHuntPassage: isInsideHuntPassage
	};
})();
