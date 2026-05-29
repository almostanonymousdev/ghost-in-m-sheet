/*
 * Hunt loot, furniture searches, and clothes-stash plumbing.
 *
 * Split out of HuntController so the lifecycle file isn't carrying
 * the per-furniture-slot bookkeeping. Mutations land on the active
 * run owned by HuntController -- $run.searchedFurniture,
 * $run.collectedLoot, and $run.floorplan.{loot,lootFurniture} --
 * not on any top-level $variable, so no OWNED_VARS shift is needed.
 *
 * Surface:
 *   setSearchedFurniture(suffix) / searchedFurniture()
 *   collectedLoot() / hasCollected(kind) / takeLoot(kind)
 *   lootKindsAt(roomId, suffix) / lootAt(roomId, suffix)
 *   isLootKindAvailable(kind)
 *   stealClothes(piece)          -- one entry point for Steal* leaf passages
 *   stashStolenClothes(piece, rngOpt) -- pin a kind to a random furniture slot
 *
 * Each function is spliced back onto setup.HuntController at module
 * load so existing passage / test call sites keep working unchanged.
 *
 * Loads alphabetically AFTER HuntController.js (HuntC < HuntL).
 */
setup.HuntLoot = (function () {
	function active() { return setup.HuntController.active(); }

	/* Furniture-search bookkeeping. The HuntRun layout wraps each
	   furniture image in a link that calls setSearchedFurniture(suffix)
	   then routes to FurnitureSearch, which reads the {room,
	   suffix} pair via searchedFurniture() and looks up what (if
	   anything) is hidden there with lootAt(). takeLoot() marks a
	   kind as collected so a follow-up search of the same spot finds
	   nothing. */
	function setSearchedFurniture(suffix) {
		var run = active();
		if (!run) return;
		run.searchedFurniture = { room: run.currentRoomId || 'room_0', suffix: suffix };
	}
	function searchedFurniture() {
		var run = active();
		return run ? (run.searchedFurniture || null) : null;
	}
	function collectedLoot() {
		var run = active();
		return run && Array.isArray(run.collectedLoot) ? run.collectedLoot.slice() : [];
	}
	function hasCollected(kind) {
		var run = active();
		return !!(run && Array.isArray(run.collectedLoot)
			&& run.collectedLoot.indexOf(kind) !== -1);
	}
	function takeLoot(kind) {
		var run = active();
		if (!run || !kind) return false;
		if (!Array.isArray(run.collectedLoot)) run.collectedLoot = [];
		if (run.collectedLoot.indexOf(kind) !== -1) return false;
		run.collectedLoot.push(kind);
		setup.Hunt.emit(setup.Hunt.Event.LOOT_TAKEN, { kind: kind, roomId: run.currentRoomId || null });
		return true;
	}

	/* Is the given loot kind currently *retrievable*? Some kinds are
	   stamped onto the floor plan but gated by external state that can
	   flip mid-run (clothesStolen<Piece> → restored elsewhere; tarot
	   deck moved out of HIDDEN; monkey paw retired). FurnitureSearch
	   already refuses to hand out these pickups when the gate is
	   closed, but without filtering at lootKindsAt the detector kept
	   highlighting the slot ("highlighted furniture says nothing in
	   it"). Centralize the gates here so the highlight and the pickup
	   stay in lockstep. */
	function isLootKindAvailable(kind) {
		if (kind === 'clothesStolenPanties') return setup.Wardrobe.isPantiesStolen();
		if (kind === 'clothesStolenBra') return setup.Wardrobe.isBraStolen();
		if (kind === 'clothesStolenShirt') return setup.Wardrobe.isShirtStolen();
		if (kind === 'clothesStolenBottom') return setup.Wardrobe.isBottomStolen();
		if (kind === 'tarotCards') return setup.Tarot.isTarotDiscoverable();
		if (kind === 'monkeyPaw') return setup.MonkeyPaw.isDiscoverable();
		if (kind === 'cursedItem') return setup.Witch.cursedItemQuestStarted();
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
		var run = active();
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

	/* Single-kind variant -- returns the first uncollected loot kind
	   at the slot, or null. Kept for callers that only need to know
	   "is there anything here"; multi-kind sites use lootKindsAt. */
	function lootAt(roomId, suffix) {
		var kinds = lootKindsAt(roomId, suffix);
		return kinds.length ? kinds[0] : null;
	}

	/* Piece-name → loot-key map for the per-garment clothesStolen
	   pins. The four stolen-clothes loot kinds are placed and
	   retrieved independently, so each garment a steal event takes
	   gets its own pin on the floor plan (overlaps allowed). */
	var STOLEN_PIECE_KINDS = Object.freeze({
		panties: 'clothesStolenPanties',
		bra: 'clothesStolenBra',
		shirt: 'clothesStolenShirt',
		bottom: 'clothesStolenBottom'
	});

	/* Per-piece strip helper: routes to the right Wardrobe primitive
	   for the named garment, then stashes a pin via stashStolenClothes
	   so the corresponding clothesStolen<Piece> kind becomes findable
	   in furniture. Single entry point for hunt-side steal paths
	   (StealPanties / StealBra / StealBottomOuter leaf passages,
	   the no-media shirt branch in StealClothes / FreezeHunt). No-op
	   if the piece isn't currently worn -- stealWornInGroup /
	   stealBottomOuter return false/null in that case, in which case
	   we skip the stash so a missed strip doesn't drop a phantom pin. */
	function stealClothes(piece) {
		var ok = false;
		if (piece === 'panties') {
			ok = setup.Wardrobe.stealWornInGroup('panties', 'pantiesState', 'isPantiesStolen');
		} else if (piece === 'bra') {
			ok = setup.Wardrobe.stealWornInGroup('bra', 'braState', 'isBraStolen');
		} else if (piece === 'shirt') {
			ok = setup.Wardrobe.stealWornInGroup('tshirt', 'tshirtState', 'isShirtStolen');
		} else if (piece === 'bottom') {
			ok = setup.Wardrobe.stealBottomOuter() != null;
		}
		if (!ok) return null;
		return stashStolenClothes(piece);
	}

	/* Stash one stolen garment onto a furniture slot somewhere on the
	   floor plan, using the same loot/lootFurniture pipeline as
	   cursedItem / tarotCards / monkeyPaw -- so a normal furniture
	   search reveals it via setup.HuntController.lootKindsAt. Each
	   stolen piece (panties / bra / shirt / bottom) has its own pin
	   key (clothesStolen<Piece>), is placed at a uniformly random
	   furniture slot across the whole house, and is restored
	   independently when found. Slots collide freely -- two pieces
	   that happen to roll the same (room, suffix) just share the
	   slot, and a single search reveals both via lootKindsAt.

	   Returns `{ roomId, suffix, kind }` on success, or null when
	   the floor plan has no furniture-bearing rooms / the piece arg
	   isn't a known garment.

	   Also clears any prior entry for this piece's kind from
	   collectedLoot so a re-steal during the same run is findable
	   again. */
	function stashStolenClothes(piece, rngOpt) {
		var run = active();
		if (!run || !run.floorplan) return null;
		var kind = STOLEN_PIECE_KINDS[piece];
		if (!kind) return null;
		var fp = run.floorplan;
		var rand = (typeof rngOpt === 'function') ? rngOpt : Math.random;

		/* Build a flat (roomId, suffix) pool across the whole house
		   so the uniform draw is over slots, not rooms -- a room with
		   six furniture pieces is six times more likely than a room
		   with one. No collision avoidance: overlapping with other
		   loot pins (including a stolen sibling) is fine. */
		var slots = [];
		fp.rooms.forEach(function (r) {
			var t = setup.Templates && setup.Templates.byId(r.template);
			if (!t || !Array.isArray(t.furniture) || !t.furniture.length) return;
			t.furniture.forEach(function (suffix) {
				slots.push({ roomId: r.id, suffix: suffix });
			});
		});
		if (!slots.length) return null;
		var pick = slots[Math.floor(rand() * slots.length)];

		if (!fp.loot) fp.loot = {};
		if (!fp.lootFurniture) fp.lootFurniture = {};
		fp.loot[kind] = pick.roomId;
		fp.lootFurniture[kind] = pick.suffix;

		// A previous steal+find cycle for this same piece may have
		// left the kind in collectedLoot; clear it so the new stash
		// is searchable.
		if (Array.isArray(run.collectedLoot)) {
			var idx = run.collectedLoot.indexOf(kind);
			if (idx !== -1) run.collectedLoot.splice(idx, 1);
		}

		return { roomId: pick.roomId, suffix: pick.suffix, kind: kind };
	}

	return {
		setSearchedFurniture: setSearchedFurniture,
		searchedFurniture: searchedFurniture,
		collectedLoot: collectedLoot,
		hasCollected: hasCollected,
		takeLoot: takeLoot,
		isLootKindAvailable: isLootKindAvailable,
		lootKindsAt: lootKindsAt,
		lootAt: lootAt,
		stealClothes: stealClothes,
		stashStolenClothes: stashStolenClothes
	};
})();

/* Backwards-compat splice: existing passages and tests read these
   off setup.HuntController. Keep references live so callers don't
   need to learn the new namespace. */
setup.HuntController.setSearchedFurniture = setup.HuntLoot.setSearchedFurniture;
setup.HuntController.searchedFurniture    = setup.HuntLoot.searchedFurniture;
setup.HuntController.collectedLoot        = setup.HuntLoot.collectedLoot;
setup.HuntController.hasCollected         = setup.HuntLoot.hasCollected;
setup.HuntController.takeLoot             = setup.HuntLoot.takeLoot;
setup.HuntController.lootKindsAt          = setup.HuntLoot.lootKindsAt;
setup.HuntController.lootAt               = setup.HuntLoot.lootAt;
setup.HuntController.stealClothes         = setup.HuntLoot.stealClothes;
setup.HuntController.stashStolenClothes   = setup.HuntLoot.stashStolenClothes;
