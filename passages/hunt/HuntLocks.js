/*
 * Ghost / exit / room locks driven by Monkey Paw wishes.
 *
 * Split out of HuntController so the lifecycle file isn't carrying
 * the trap-and-seal bookkeeping. All state lives on the active
 * $run (run.trapped, run.exitLock, run.roomLock) -- HuntController
 * still owns $run; this module only reaches into named sub-fields.
 *
 * Surface:
 *   trapGhost(unlockBy)              -- pin ghost + seal exit
 *   isGhostTrapped() / isExitLocked()
 *   exitLockReason()                 -- 'dawn' | 'cursedItem' | null
 *   clearExitLock()                  -- drop just the exit seal
 *   lockCurrentRoom() / isRoomLocked() / clearRoomLock()
 *   sacrificeCursedItemAtDoor()      -- shared cursed-item unlock
 *   snapGhostToCurrentRoom()         -- pin (no seal) helper used by
 *                                       the activity / trap-tier wishes
 *
 * Spliced back onto setup.HuntController so existing passage / test
 * call sites keep working. Loads alphabetically AFTER HuntController.js
 * (HuntC < HuntL).
 */
setup.HuntLocks = (function () {
	function active() { return setup.HuntController.active(); }

	/* Pin the active ghost to the player's current room. Used by the
	   Monkey Paw activity-tier-3 and trapTheGhost-tier-3 wishes.
	   Snaps floorplan.spawnRoomId to $run.currentRoomId. Returns true
	   on success, false when no run is active. */
	function snapGhostToCurrentRoom() {
		var run = active();
		if (!run || !run.floorplan) return false;
		var roomId = run.currentRoomId || 'room_0';
		run.floorplan.spawnRoomId = roomId;
		return true;
	}

	/* Pin the ghost in place + lock the player's exit. Stamps
	   run.trapped + run.exitLock so the nav layer can refuse exits
	   until the lock is cleared. The trapped flag also opts the run
	   out of the periodic ghost-room drift roll. */
	function trapGhost(unlockBy) {
		var run = active();
		if (!run) return false;
		run.trapped = true;
		run.exitLock = { unlockBy: unlockBy };
		setup.Hunt.emit(setup.Hunt.Event.TRAP, { unlockBy: unlockBy, roomId: run.floorplan && run.floorplan.spawnRoomId });
		return true;
	}

	/* True iff the run's ghost is currently trapped. driftGhostRoom
	   uses this to skip the shuffle for trapped ghosts. */
	function isGhostTrapped() {
		var run = active();
		return !!(run && run.trapped);
	}

	/* True iff the front door is sealed by a trap wish. Read by
	   HuntLifecycle to hide the Outside link while a lock is active. */
	function isExitLocked() {
		var run = active();
		return !!(run && run.exitLock);
	}

	/* What clears the current exit lock — 'dawn' or 'cursedItem'.
	   Returns null when nothing is locked. */
	function exitLockReason() {
		var run = active();
		return (run && run.exitLock && run.exitLock.unlockBy) || null;
	}

	/* Drop the exit lock from the active run. The trap stays put
	   (run.trapped still suppresses drift) so the ghost remains
	   pinned even after the door is unsealed. Returns true if a
	   lock was cleared, false if nothing was locked. */
	function clearExitLock() {
		var run = active();
		if (!run || !run.exitLock) return false;
		run.exitLock = null;
		return true;
	}

	/* Trap the player in their current room. Used by Monkey Paw trap
	   tier 3, where the wish drops the ghost on top of you and seals
	   the room. Cleared by the same cursed-item sacrifice that opens
	   the front door (both locks share the cursedItem key). */
	function lockCurrentRoom() {
		var run = active();
		if (!run) return false;
		run.roomLock = true;
		return true;
	}

	/* True iff the player can't step out of the current room.
	   HuntLifecycle reads this to hide every neighbor nav link. */
	function isRoomLocked() {
		var run = active();
		return !!(run && run.roomLock);
	}

	/* Drop the room lock from the active run. Returns true if a
	   lock was cleared, false otherwise. */
	function clearRoomLock() {
		var run = active();
		if (!run || !run.roomLock) return false;
		run.roomLock = false;
		return true;
	}

	/* Sacrifice a carried cursed item to break a Monkey Paw seal.
	   Valid only when at least one cursedItem-keyed lock is up
	   (front-door exitLock and/or room lock). Clears both in one
	   shot so trap tier 3 (door + room both sealed) costs a single
	   item, not two. Refuses dawn-only exit locks. Returns the
	   cleared type flag on success, null otherwise. */
	function sacrificeCursedItemAtDoor() {
		if (!active()) return null;
		var doorOnCursedItem = exitLockReason() === 'cursedItem';
		var roomLocked = isRoomLocked();
		if (!doorOnCursedItem && !roomLocked) return null;
		if (!setup.Witch.hasCursedItemToTurnIn()) return null;
		var cleared = setup.Witch.consumeCarriedCursedItem();
		if (doorOnCursedItem) clearExitLock();
		if (roomLocked) clearRoomLock();
		return cleared;
	}

	return {
		snapGhostToCurrentRoom: snapGhostToCurrentRoom,
		trapGhost: trapGhost,
		isGhostTrapped: isGhostTrapped,
		isExitLocked: isExitLocked,
		exitLockReason: exitLockReason,
		clearExitLock: clearExitLock,
		lockCurrentRoom: lockCurrentRoom,
		isRoomLocked: isRoomLocked,
		clearRoomLock: clearRoomLock,
		sacrificeCursedItemAtDoor: sacrificeCursedItemAtDoor
	};
})();

/* Backwards-compat splice: existing passages and tests read these
   off setup.HuntController. */
setup.HuntController.snapGhostToCurrentRoom    = setup.HuntLocks.snapGhostToCurrentRoom;
setup.HuntController.trapGhost                 = setup.HuntLocks.trapGhost;
setup.HuntController.isGhostTrapped            = setup.HuntLocks.isGhostTrapped;
setup.HuntController.isExitLocked              = setup.HuntLocks.isExitLocked;
setup.HuntController.exitLockReason            = setup.HuntLocks.exitLockReason;
setup.HuntController.clearExitLock             = setup.HuntLocks.clearExitLock;
setup.HuntController.lockCurrentRoom           = setup.HuntLocks.lockCurrentRoom;
setup.HuntController.isRoomLocked              = setup.HuntLocks.isRoomLocked;
setup.HuntController.clearRoomLock             = setup.HuntLocks.clearRoomLock;
setup.HuntController.sacrificeCursedItemAtDoor = setup.HuntLocks.sacrificeCursedItemAtDoor;
