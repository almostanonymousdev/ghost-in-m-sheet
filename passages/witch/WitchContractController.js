/*
 * Witch contract storefront.
 *
 * Khadija sells contracts on specific haunted houses. The MC pays
 * the fee up front, holds one contract at a time, and the
 * GhostStreet card for the matching house unlocks until the run
 * resolves. On a correct call she pays cash; on any other outcome
 * the contract is spent and no payout.
 *
 * Contract hunts pay only in cash. Procedural ("rogue") hunts -- no
 * contract held, MC walks into a stranger's house on her own -- pay
 * both cash AND ectoplasm. The split is intentional: contracts are
 * the steady-income loop, rogue runs are the meta-progression loop.
 *
 * State shape:
 *   $contracts = {
 *     offered:        [{ houseId, fee, payout }, ...],
 *     held:           null | { houseId, fee, payout, ghostName? },
 *     lastRefreshDay: int (last $dailySeed the offered list was rolled at)
 *   }
 *
 * `held.ghostName` is the "pending guess" marker. A held contract
 * without it is a fresh, un-hunted contract; one with it survived a
 * failed hunt (caught/possessed/sanity/exhaustion/time/fled/abandon --
 * anything but a wrong call at the desk) and the player can still
 * walk back to Khadija to make the call.
 */
setup.WitchContract = (function () {
	var OWNED_VARS = Object.freeze(['contracts']);

	function sv() { return State.variables; }
	function state() {
		if (!sv().contracts) sv().contracts = defaultState();
		return sv().contracts;
	}
	function defaultState() {
		return { offered: [], held: null, lastRefreshDay: -1 };
	}

	/* Per-house contract terms. Pricing curve mirrors the level-gate
	   ramp on setup.HuntHouses: Owaissa is the intro contract, Elm is
	   mid-game, Ironclad is the late-game prize. Fee : payout sits
	   around 1 : 6 so a single wrong call costs ~one sixth of a
	   successful run -- enough to sting without bankrupting. xp scales
	   with tier so a late-game contract is worth chasing for level
	   progression, not just cash. */
	var TEMPLATES = Object.freeze({
		owaissa:  Object.freeze({ houseId: 'owaissa',  fee: 30,  payout: 200,  xp: 15 }),
		elm:      Object.freeze({ houseId: 'elm',      fee: 75,  payout: 500,  xp: 25 }),
		ironclad: Object.freeze({ houseId: 'ironclad', fee: 200, payout: 1200, xp: 40 })
	});

	/* Build today's offered list off the HuntHouses catalogue. Khadija
	   only stocks houses the MC has the level + side-quest unlocks to
	   walk into, so the same gate predicates that hide a GhostStreet
	   card also hide the matching contract on the board. Adding a new
	   static house to the catalogue auto-threads it here (provided a
	   TEMPLATES entry exists). */
	function buildOffered() {
		if (!setup.HuntHouses || typeof setup.HuntHouses.list !== 'function') return [];
		var lvl = (setup.Mc && setup.Mc.lvl) ? setup.Mc.lvl() : 0;
		var out = [];
		setup.HuntHouses.list().forEach(function (h) {
			var t = TEMPLATES[h.id];
			if (!t) return;
			var levelGate = typeof h.levelGate === 'number' ? h.levelGate : 0;
			if (lvl < levelGate) return;
			if (typeof h.gate === 'function' && !h.gate()) return;
			out.push(Object.assign({}, t));
		});
		return out;
	}

	function todayKey() {
		if (!setup.Time || typeof setup.Time.dailySeed !== 'function') return 0;
		return setup.Time.dailySeed();
	}

	var api = {
		OWNED_VARS: OWNED_VARS,

		// --- Reads ------------------------------------------------
		offered: function () {
			this.ensureFresh();
			return state().offered.slice();
		},
		held: function () { return state().held; },
		hasHeldContract: function () { return state().held != null; },
		heldHouseId: function () {
			var h = state().held;
			return h ? h.houseId : null;
		},
		canEnterHouse: function (houseId) {
			return this.heldHouseId() === houseId && !this.hasPendingGuess();
		},
		feeFor: function (houseId) {
			var t = TEMPLATES[houseId];
			return t ? t.fee : null;
		},
		payoutFor: function (houseId) {
			var t = TEMPLATES[houseId];
			return t ? t.payout : null;
		},
		/* XP awarded for completing a contract on `houseId`. Success
		   pays the per-tier amount (Owaissa 15 / Elm 25 / Ironclad 40);
		   failure pays nothing, mirroring the cash side. HuntController
		   reads this for the contract-hunt XP bucket instead of the
		   flat rogue-hunt formula. Returns 0 for an unknown houseId so
		   the call site stays safe. */
		xpRewardFor: function (houseId, success) {
			var t = TEMPLATES[houseId];
			if (!t) return 0;
			return success ? t.xp : 0;
		},

		// --- Daily refresh ---------------------------------------
		/* Rebuild the offered list whenever the day-of-game cursor
		   ($dailySeed) has advanced. Idempotent within a day -- callers
		   can sprinkle ensureFresh() defensively. */
		ensureFresh: function () {
			var s = state();
			var day = todayKey();
			if (s.lastRefreshDay === day) return;
			s.offered = buildOffered();
			s.lastRefreshDay = day;
		},
		/* Force a board reroll regardless of whether the day cursor
		   advanced. Called from setup.Home.sleepAdvance so every sleep
		   brings a fresh slate -- including alarm-shortened naps that
		   wake before midnight and so wouldn't otherwise reseed
		   $dailySeed. The held contract is untouched; it survives sleep
		   until a hunt resolves it. */
		refresh: function () {
			var s = state();
			s.offered = buildOffered();
			s.lastRefreshDay = todayKey();
		},

		// --- Mutations --------------------------------------------
		/* Buy the contract for `houseId`. Deducts the fee, removes
		   the offering from today's list, and stamps the held slot.
		   Returns true on success, false if the player can't afford
		   it, already holds a contract, or the offering isn't on the
		   board today. */
		buyContract: function (houseId) {
			this.ensureFresh();
			var s = state();
			if (s.held) return false;
			var t = TEMPLATES[houseId];
			if (!t) return false;
			var idx = -1;
			for (var i = 0; i < s.offered.length; i++) {
				if (s.offered[i].houseId === houseId) { idx = i; break; }
			}
			if (idx === -1) return false;
			if (!setup.Mc || typeof setup.Mc.money !== 'function') return false;
			if (setup.Mc.money() < t.fee) return false;
			setup.Mc.removeMoney(t.fee);
			s.held = Object.assign({}, t);
			s.offered.splice(idx, 1);
			setup.StoryEvents.emit(setup.StoryEvents.Event.CONTRACT_SIGNED,
				{ houseId: t.houseId, fee: t.fee, payout: t.payout });
			return true;
		},
		/* Resolve the currently-held contract. `success` true pays the
		   contract's cash payout; anything else burns the contract for
		   no money. Either way the held slot clears and the player can
		   buy a new contract next time the board refreshes. Returns
		   the cash amount paid (0 on a spent contract). No-op when no
		   contract is held -- safe to call from endHunt for every hunt. */
		resolveHeld: function (success) {
			var s = state();
			var contract = s.held;
			if (!contract) return 0;
			var payout = success ? contract.payout : 0;
			s.held = null;
			return payout;
		},
		clearHeld: function () { state().held = null; },

		// --- Pending guess (deferred contract resolution) ---------
		/* Stamp the true ghost identity onto the held contract so a
		   contract hunt that ended without a call (caught, sanity,
		   exhaustion, time, fled, abandon -- anything but a wrong
		   call) can still be guessed at Khadija's desk the next day.
		   No-op when no contract is held or no name was provided. */
		markHeldPendingGuess: function (ghostName) {
			var h = state().held;
			if (!h || !ghostName) return;
			h.ghostName = ghostName;
		},
		/* True iff the held contract carries a stashed ghost identity
		   from a prior failed hunt -- the player can still call the
		   ghost even though the run itself has ended. */
		hasPendingGuess: function () {
			var h = state().held;
			return !!(h && h.ghostName);
		},
		/* The stashed true-ghost name on the held contract, or null. */
		pendingGuessGhost: function () {
			var h = state().held;
			return (h && h.ghostName) || null;
		},
		/* Settle a pending-guess contract at Khadija's desk after a
		   failed hunt. `success` (correct call) pays the contract's
		   cash + tier XP; failure burns the contract for nothing.
		   Clears the held slot either way. Returns a summary the
		   caller can render: { cashPayout, xp, ghostName }. Pays
		   money + XP directly so the call site doesn't need to
		   re-derive them from the contract tier. */
		settlePendingGuess: function (success) {
			var h = state().held;
			if (!h || !h.ghostName) return { cashPayout: 0, xp: 0, ghostName: null };
			var ghostName = h.ghostName;
			var cashPayout = success ? h.payout : 0;
			var xp = this.xpRewardFor(h.houseId, success);
			state().held = null;
			if (cashPayout > 0 && setup.Mc && typeof setup.Mc.addMoney === 'function') {
				setup.Mc.addMoney(cashPayout);
			}
			if (xp > 0 && setup.Mc && typeof setup.Mc.grantExp === 'function') {
				setup.Mc.grantExp(xp);
			}
			return { cashPayout: cashPayout, xp: xp, ghostName: ghostName };
		},

		// --- Cheat / test helpers ---------------------------------
		/* Stamp a held contract for `houseId` without charging the
		   MC. Used by the cheat menu + unit specs to drop the player
		   straight into a contract hunt. */
		cheatGrantContract: function (houseId) {
			var t = TEMPLATES[houseId];
			if (!t) return;
			state().held = Object.assign({}, t);
		}
	};

	return api;
})();
