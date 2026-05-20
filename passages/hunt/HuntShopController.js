/*
 * Meta-shop / banlist / reroll subsystem.
 *
 * Owns `$meta` -- the persistent meta-shop state that survives
 * individual runs. Holds the catalogue of player-facing unlocks,
 * the banlist (modifier ids excluded from a run's draft pool), the
 * stockpile of reroll charges, and the "last run was a success"
 * gate read by HuntSummary's continuation link.
 *
 * Unlock effects wire into the hunt lifecycle from elsewhere
 * (HuntController honors most of them; the minimap reads loot_sense /
 * reliable_recon; endHunt restores stat-cap bumps). Currency is
 * paid through setup.HuntController.removeEctoplasm, so HuntShop
 * stays a pure inventory layer: it knows what is owned, how to buy
 * the next copy, and how to spend a reroll, but never touches the
 * run or the ectoplasm balance directly beyond that single call.
 */
setup.HuntShop = (function () {
	var OWNED_VARS = Object.freeze(['meta']);

	var sv = setup.sv;

	/* Catalogue. Each entry is the player-facing record for one
	   persistent unlock (or stackable charge). Costs paid in mL of
	   $ectoplasm; `max` caps how many copies the player may own
	   (1 for one-time unlocks, n for stackable, Infinity for
	   uncapped consumables). Adding a new unlock is just an entry
	   here plus the matching effect site. */
	var ShopItem = Object.freeze({
		BANLIST_SLOT:       'banlist_slot',
		REROLL_CHARGE:      'reroll_charge',
		WITCHS_BLESSING:    'witchs_blessing',
		MONKEYS_FAVOR:      'monkeys_favor',
		SMALLER_HOUSE:      'smaller_house',
		LOOT_SENSE:         'loot_sense',
		STEELED_HAND:       'steeled_hand',
		CALVES_OF_STEEL:    'calves_of_steel',
		INTENSE_INTUITION:  'intense_intuition',
		RELIABLE_RECON:     'reliable_recon'
	});

	var SHOP_CATALOGUE = Object.freeze([
		{
			id: ShopItem.BANLIST_SLOT,
			name: 'Banlist Slot',
			cost: 25,
			max: 3,
			description: 'Permanently ban one modifier from each run\'s draft pool. Stack up to 3 slots.'
		},
		{
			id: ShopItem.REROLL_CHARGE,
			name: 'Reroll Charge',
			cost: 5,
			max: Infinity,
			description: 'Consumable. Spend at the lobby to redraft your modifiers once.'
		},
		{
			id: ShopItem.WITCHS_BLESSING,
			name: 'Witch\'s Blessing',
			cost: 30,
			max: 1,
			description: 'Start every run with the tarot deck already in your bag.'
		},
		{
			id: ShopItem.MONKEYS_FAVOR,
			name: 'Monkey\'s Favor',
			cost: 30,
			max: 1,
			description: 'Start every run with the monkey paw already found.'
		},
		{
			id: ShopItem.SMALLER_HOUSE,
			name: 'Smaller House',
			cost: 20,
			max: 1,
			description: 'Each haunt has one fewer room to search.'
		},
		{
			id: ShopItem.LOOT_SENSE,
			name: 'Loot Sense',
			cost: 20,
			max: 1,
			description: 'Rooms with uncollected loot are highlighted on the minimap.'
		},
		{
			id: ShopItem.STEELED_HAND,
			name: 'Steeled Hand',
			cost: 25,
			max: 1,
			description: 'Begin each run with +25 sanity (max + current).'
		},
		{
			id: ShopItem.CALVES_OF_STEEL,
			name: 'Calves of Steel',
			cost: 25,
			max: 1,
			description: 'Begin each run with +5 stamina (max + current).'
		},
		{
			id: ShopItem.INTENSE_INTUITION,
			name: 'Intense Intuition',
			cost: 30,
			max: 1,
			description: 'One of the ghost\'s evidences is checked off in your notebook from the start.'
		},
		{
			id: ShopItem.RELIABLE_RECON,
			name: 'Reliable Recon',
			cost: 25,
			max: 1,
			description: 'The ghost\'s starting room is highlighted on the minimap. The mark fades the first time the ghost relocates.'
		}
	]);

	function shopItemById(id) {
		for (var i = 0; i < SHOP_CATALOGUE.length; i++) {
			if (SHOP_CATALOGUE[i].id === id) return SHOP_CATALOGUE[i];
		}
		return null;
	}

	/* Backstop accessor that lazily fills in $meta on saves predating
	   the meta-shop. SaveMigration also handles this on load, but
	   reading through here keeps every getter safe even before the
	   migration pass runs. */
	function metaState() {
		var s = sv();
		if (!s.meta || typeof s.meta !== 'object') {
			s.meta = { unlocks: {}, bannedModifiers: [], rerollCharges: 0 };
		}
		if (!s.meta.unlocks || typeof s.meta.unlocks !== 'object') s.meta.unlocks = {};
		if (!Array.isArray(s.meta.bannedModifiers)) s.meta.bannedModifiers = [];
		if (typeof s.meta.rerollCharges !== 'number') s.meta.rerollCharges = 0;
		return s.meta;
	}

	function unlock(id) { return metaState().unlocks[id] || 0; }
	function hasUnlock(id) { return unlock(id) > 0; }
	function catalogue() { return SHOP_CATALOGUE.slice(); }
	function item(id) { return shopItemById(id); }
	function lastWasSuccess() { return !!metaState().lastWasSuccess; }
	function markLastWasSuccess(success) { metaState().lastWasSuccess = !!success; }

	/* Spend ectoplasm and increment the unlock count. Caps at the
	   item's `max`; rejects unknown ids and broke players (no partial
	   deductions). Returns true on success. */
	function buyUnlock(id) {
		var info = shopItemById(id);
		if (!info) return false;
		var owned = unlock(id);
		if (owned >= info.max) return false;
		if (!setup.HuntController.canAffordEctoplasm(info.cost)) return false;
		setup.HuntController.removeEctoplasm(info.cost);
		var m = metaState();
		m.unlocks[id] = owned + 1;
		if (id === ShopItem.REROLL_CHARGE) m.rerollCharges = (m.rerollCharges || 0) + 1;
		return true;
	}

	function bannedModifiers() { return metaState().bannedModifiers.slice(); }
	function bannedSlotsTotal() { return unlock(ShopItem.BANLIST_SLOT); }
	function bannedSlotsUsed() { return metaState().bannedModifiers.length; }
	function bannedSlotsRemaining() {
		return Math.max(0, bannedSlotsTotal() - bannedSlotsUsed());
	}
	/* Toggle a modifier on the banlist. Adds when there's a free slot
	   and the id is unique; removes when already banned. Unknown
	   modifier ids are rejected. Returns true if the list changed. */
	function toggleBannedModifier(id) {
		if (!setup.Modifiers || !setup.Modifiers.byId(id)) return false;
		var m = metaState();
		var idx = m.bannedModifiers.indexOf(id);
		if (idx !== -1) {
			m.bannedModifiers.splice(idx, 1);
			return true;
		}
		if (bannedSlotsUsed() >= bannedSlotsTotal()) return false;
		m.bannedModifiers.push(id);
		return true;
	}
	function isBanned(id) { return metaState().bannedModifiers.indexOf(id) !== -1; }

	function rerollCharges() { return metaState().rerollCharges || 0; }
	/* Decrement the stockpile. Returns true if a charge was actually
	   spent. The caller is responsible for the redraft itself; see
	   redraftRunModifiers below for the in-lobby flow. */
	function consumeRerollCharge() {
		var m = metaState();
		if ((m.rerollCharges || 0) <= 0) return false;
		m.rerollCharges -= 1;
		// Mirror the unlocks count so /buy and consume agree.
		var u = (m.unlocks[ShopItem.REROLL_CHARGE] || 0) - 1;
		m.unlocks[ShopItem.REROLL_CHARGE] = u > 0 ? u : 0;
		return true;
	}

	/* Redraft modifiers for the active run, honoring the banlist.
	   Bumps an internal $run.rerolls counter so the new draft seed
	   never collides with the original. Returns the new modifier id
	   list, or null when no run is active. Run state is reached
	   through HuntController so $run stays owned there. */
	function redraftRunModifiers() {
		if (!setup.HuntController.isActive() || !setup.Modifiers) return null;
		var rerolls = (setup.HuntController.field('rerolls') || 0) + 1;
		setup.HuntController.setField('rerolls', rerolls);
		var runSeed = setup.HuntController.seed() >>> 0;
		var seed = (runSeed ^ 0x9e3779b9 ^ Math.imul(rerolls, 0x85ebca6b)) >>> 0;
		var existing = setup.HuntController.modifiers();
		var draft = setup.Modifiers.draft(seed, existing.length || 2, {
			banned: bannedModifiers()
		});
		var newIds = draft.map(function (m) { return m.id; });
		setup.HuntController.setField('modifiers', newIds);
		return newIds.slice();
	}

	return {
		OWNED_VARS: OWNED_VARS,
		ShopItem: ShopItem,
		catalogue: catalogue,
		item: item,
		unlock: unlock,
		hasUnlock: hasUnlock,
		buyUnlock: buyUnlock,
		lastWasSuccess: lastWasSuccess,
		markLastWasSuccess: markLastWasSuccess,
		bannedModifiers: bannedModifiers,
		bannedSlotsTotal: bannedSlotsTotal,
		bannedSlotsUsed: bannedSlotsUsed,
		bannedSlotsRemaining: bannedSlotsRemaining,
		toggleBannedModifier: toggleBannedModifier,
		isBanned: isBanned,
		rerollCharges: rerollCharges,
		consumeRerollCharge: consumeRerollCharge,
		redraftRunModifiers: redraftRunModifiers
	};
})();
