/*
 * Periodic ghost-room drift.
 *
 * Split out of HuntController so the lifecycle file isn't carrying
 * the per-tick shuffle clock. Owns $nextDriftAtMinute (the
 * top-level deadline timer); everything else reads off the active
 * $run snapshot owned by HuntController.
 *
 * Surface:
 *   shuffleGhostRoom()      -- TickController calls this every step;
 *                              gates on bait/trap/timer, then rolls
 *                              driftChance and may move the ghost.
 *   driftGhostRoom()        -- Force one shuffle (skips the timer
 *                              gate). Used by tests and the Monkey
 *                              Paw activity-tier-2 wish.
 *   driftChance()           -- 0.45 baseline, scaled down 0.5% per
 *                              beauty point above 30, floored at 0.20.
 *   seedNextDriftClock()    -- Called by HuntController.startHunt to
 *                              stamp the first drift deadline so the
 *                              opening tick doesn't roll immediately.
 *
 * Each of the first three is spliced back onto setup.HuntController at
 * module load so existing passage / test call sites keep working
 * unchanged. seedNextDriftClock is called only from HuntController so
 * it isn't on the splice list.
 *
 * Loads alphabetically AFTER HuntController.js (HuntC < HuntD).
 */
setup.HuntDrift = (function () {
	var OWNED_VARS = Object.freeze(['nextDriftAtMinute']);

	function sv() { return setup.sv(); }
	function active() { return setup.HuntController.active(); }

	function totalMinutes() {
		return (setup.Time && typeof setup.Time.totalMinutes === 'function')
			? setup.Time.totalMinutes()
			: 0;
	}

	/* Next-drift deadline = the current clock plus a uniform 15-35
	   minute offset. Re-rolled after every shuffleGhostRoom pass so
	   the cadence stays unpredictable. */
	function rollNextDriftMinute() {
		return totalMinutes() + setup.Rng.intInclusive(15, 35);
	}

	/* Stamp the next-drift deadline. Called from HuntController.startHunt
	   so the first post-passage tick doesn't immediately roll a drift
	   (which would fire the 'It Moved' achievement before the ghost
	   has actually moved). The gate is consumed by shuffleGhostRoom(). */
	function seedNextDriftClock() {
		sv().nextDriftAtMinute = rollNextDriftMinute();
		return sv().nextDriftAtMinute;
	}

	/* Drift chance scales with MC beauty: base 45% at beauty <= 30,
	   losing 0.5% per point above 30, floored at 20%. */
	function driftChance() {
		var beauty = (setup.Mc && setup.Mc.beauty) ? (setup.Mc.beauty() || 0) : 0;
		var bonus = Math.max(0, beauty - 30);
		return Math.max(0.20, 0.45 - bonus * 0.005);
	}

	/* Ghost-room drift. Picks a fresh room (any template,
	   including the hallway) from the floor plan and updates
	   floorplan.spawnRoomId. Called by shuffleGhostRoom() once the
	   next-drift deadline + roll have passed; the controller
	   already filtered for `staysInOneRoom`, so all that's left here
	   is the rule "prefer to drift somewhere different from the
	   current lair". */
	function driftGhostRoom() {
		var run = active();
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

	/* Periodic ghost-room shuffle. Every 15-35 in-game minutes the
	   ghost has a chance to drift to a different room; the exact
	   spacing is re-rolled after each pass so the player can't time
	   movements off a fixed clock.

	   Skips when:
	   - no hunt is active;
	   - the ghost's catalogue marks it `staysInOneRoom`;
	   - bait is currently pinning the ghost to the player;
	   - the clock hasn't yet reached `nextDriftAtMinute`. */
	function shuffleGhostRoom() {
		if (!setup.HuntController.isHuntActive()) return;
		if (setup.ActiveGhost.staysInOneRoom()) return;
		// Bait pins the ghost to the player for its window; skip the
		// drift roll so the bait spend doesn't get undone by a shuffle.
		if (setup.HauntConditions && setup.HauntConditions.isBaitActive
			&& setup.HauntConditions.isBaitActive()) return;
		var s = sv();
		// Defensive seed for saves from before this field existed and
		// for any code path that started a hunt without going through
		// startHunt (older e2e setups). Don't drift on the first tick
		// after seeding — schedule the next roll and bail.
		if (typeof s.nextDriftAtMinute !== 'number') {
			s.nextDriftAtMinute = rollNextDriftMinute();
			return;
		}
		if (totalMinutes() < s.nextDriftAtMinute) return;
		if (Math.random() < driftChance()) {
			driftGhostRoom();
		}
		s.nextDriftAtMinute = rollNextDriftMinute();
	}

	return {
		OWNED_VARS: OWNED_VARS,
		seedNextDriftClock: seedNextDriftClock,
		driftChance: driftChance,
		driftGhostRoom: driftGhostRoom,
		shuffleGhostRoom: shuffleGhostRoom
	};
})();

/* Backwards-compat splice: existing passages and tests read these
   off setup.HuntController. */
setup.HuntController.driftGhostRoom   = setup.HuntDrift.driftGhostRoom;
setup.HuntController.shuffleGhostRoom = setup.HuntDrift.shuffleGhostRoom;
setup.HuntController.driftChance      = setup.HuntDrift.driftChance;
