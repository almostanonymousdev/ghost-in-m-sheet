/*
 * Witch contract storefront.
 *
 * Khadija sells "keys" to specific haunted houses. The MC pays the
 * fee up front, holds one key at a time, and the GhostStreet card
 * for the matching house unlocks until the run resolves. On a
 * correct call she pays cash; on any other outcome the key is
 * gone and no payout.
 *
 * Contract hunts pay only in cash. Procedural ("rogue") hunts -- no
 * key held, MC walks into a stranger's house on her own -- pay both
 * cash AND ectoplasm. The split is intentional: contracts are the
 * steady-income loop, rogue runs are the meta-progression loop.
 *
 * State shape:
 *   $contracts = {
 *     offered:        [{ houseId, fee, payout }, ...],
 *     held:           null | { houseId, fee, payout },
 *     lastRefreshDay: int (last $dailySeed the offered list was rolled at)
 *   }
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
	   successful run -- enough to sting without bankrupting. */
	var TEMPLATES = Object.freeze({
		owaissa:  Object.freeze({ houseId: 'owaissa',  fee: 30,  payout: 200  }),
		elm:      Object.freeze({ houseId: 'elm',      fee: 75,  payout: 500  }),
		ironclad: Object.freeze({ houseId: 'ironclad', fee: 200, payout: 1200 })
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
			return this.heldHouseId() === houseId;
		},
		feeFor: function (houseId) {
			var t = TEMPLATES[houseId];
			return t ? t.fee : null;
		},
		payoutFor: function (houseId) {
			var t = TEMPLATES[houseId];
			return t ? t.payout : null;
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
			return true;
		},
		/* Resolve the currently-held contract. `success` true pays the
		   contract's cash payout; anything else burns the key for no
		   money. Either way the held slot clears and the player can
		   buy a new key next time the board refreshes. Returns the
		   cash amount paid (0 on burnt-key). No-op when no contract
		   is held -- safe to call from endHunt for every hunt. */
		resolveHeld: function (success) {
			var s = state();
			var contract = s.held;
			if (!contract) return 0;
			var payout = success ? contract.payout : 0;
			s.held = null;
			return payout;
		},
		clearHeld: function () { state().held = null; },

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
