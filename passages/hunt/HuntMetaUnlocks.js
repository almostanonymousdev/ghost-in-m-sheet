/*
 * Meta-shop unlock effects at hunt start.
 *
 * Split out of HuntController so the lifecycle file stays focused on
 * roll/draft/floor-plan composition. The two side-effect blocks the
 * meta-shop owns -- the per-unlock stamp pass that runs after the run
 * is built (Witch's Blessing, Monkey's Favor, Steeled Hand, Calves of
 * Steel, Intense Intuition) and the SMALLER_HOUSE floor-plan-options
 * subscriber -- live here as a single cluster. Each unlock that wants
 * to mutate hunt state at start either gets a branch in applyAtStart
 * or a filter subscriber registered at module load.
 *
 * Surface:
 *   applyAtStart(run, seed, evidenceIds)
 *     Called from HuntController.startHunt after the floor plan is
 *     generated and $run is populated. Stamps each unlock's pre-run
 *     effect onto the passed-in run.
 *
 * Loads alphabetically AFTER HuntController.js (HuntC < HuntM), so
 * setup.HuntController / HuntShop / Tarot / MonkeyPaw / HuntLoot are
 * all available when this module's subscriber wires up.
 */
setup.HuntMetaUnlocks = (function () {
	/* Stateless -- writes go to HuntController-owned $run via the
	   passed-in arg, plus $mc / $meta through controller APIs. */
	var OWNED_VARS = Object.freeze([]);

	/* Stamp meta-shop unlocks onto the freshly-built run. The run object
	   is already populated when this runs, so the pre-stamps land on the
	   right run.collectedLoot list. `run` is passed in by HuntController
	   so this module doesn't have to reach into the $run bundle (owned
	   there). */
	function applyAtStart(run, seed, evidenceIds) {
		if (!run) return;
		var Shop = setup.HuntShop;
		var Item = Shop.ShopItem;

		/* Witch's Blessing: tarot deck already in the bag. Mirrors the
		   FurnitureSearch pickup -- markTarotCarrying flips the stage
		   so Bag exposes the tarot link, and stamping 'tarotCards' onto
		   collectedLoot prevents the floor-plan tarot pickup from
		   double-granting. We leave the floor-plan pin intact so a
		   re-search of that slot still reports nothing (already-collected).
		   Gated on isTarotUnlocked() so an early meta-shop purchase
		   doesn't smuggle the deck in before the level gate the rest
		   of the tarot pipeline (furniture pickup) requires. */
		if (Shop.hasUnlock(Item.WITCHS_BLESSING) && setup.Tarot.isTarotUnlocked()) {
			setup.Tarot.markTarotCarrying();
			setup.HuntLoot.takeLoot('tarotCards');
		}

		/* Monkey's Favor: paw already found, ready for its first wish.
		   Same pattern as Witch's Blessing, against MonkeyPaw.markFound.
		   Gated on MonkeyPaw.isUnlocked() so an early meta-shop purchase
		   doesn't pre-stamp the paw before the player reaches the
		   level that the rest of the paw machinery (furniture pickup,
		   witch dialog) requires. */
		if (Shop.hasUnlock(Item.MONKEYS_FAVOR) && setup.MonkeyPaw.isUnlocked()) {
			setup.MonkeyPaw.markFound();
			setup.HuntLoot.takeLoot('monkeyPaw');
		}

		/* Stat-cap bumps. Snapshot the prior caps so endHunt can
		   restore them; the player's $mc.sanityMax / energyMax are
		   long-lived and must come back unchanged. */
		run.preRunStatCaps = {
			sanityMax: setup.Mc.sanityMax(),
			sanity: setup.Mc.sanity(),
			energyMax: setup.Mc.energyMax(),
			energy: setup.Mc.energy()
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

	return {
		OWNED_VARS: OWNED_VARS,
		applyAtStart: applyAtStart
	};
})();

/* Smaller House meta-unlock shaves one room off the haunt. Applied
   after any modifier room-count bumps so it composes with Maze (still
   net +2) and the tool-loot expansion (still keeps a slot per missing
   tool). Floor at the generator's hard min of 2 (hallway + 1). Lives
   on the FLOORPLAN_OPTIONS filter bus next to the modifier subscribers
   so the buildHunt path stays agnostic. */
setup.Hunt.filter(setup.Hunt.Event.FLOORPLAN_OPTIONS, function (ctx) {
	if (!setup.HuntShop.hasUnlock(setup.HuntShop.ShopItem.SMALLER_HOUSE)) return;
	if (!ctx || !ctx.fpOpts) return;
	ctx.fpOpts.roomCount = Math.max(2, (ctx.fpOpts.roomCount || 5) - 1);
});
