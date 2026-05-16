/*
 * Run-modifier catalogue.
 *
 * Each hunt draws 1-3 modifiers from this catalogue at run start
 * (handled in HuntStart). Modifiers are small declarative records —
 * id, name, description, draft weight. Each modifier's *effect*
 * lives wherever it has to: tool-check overrides hook into
 * setup.HauntConditions / Tool controller; sanity-tick changes hook
 * into McController; tarot-only swaps the evidence pipeline. The
 * active deck is queried via setup.HuntController.hasModifier(id),
 * so other controllers can branch without depending on this module
 * directly.
 *
 * The catalogue here is metadata only — effect wiring is added
 * alongside each modifier as it becomes needed by the gameplay
 * loop. Keeping the catalogue authoritative for *what runs exist*
 * means the run-start UI and the meta-shop can both enumerate the
 * full set without each rediscovering it.
 */
setup.Modifiers = (function () {
	/* Catalogue id constants. Only modifiers with actual gameplay
	   wiring belong here — catalogue-only entries that ship to the
	   run-start UI but do nothing in-game make for a bait-and-switch
	   draft. New ideas live in a design doc until their effect is
	   wired into the relevant controller. Code that gates on a
	   specific modifier (e.g. HuntController's Empty-Bag toolbar
	   branch) references the constant instead of the literal so a
	   typo surfaces at parse time rather than as a silently-failing
	   indexOf. */
	var LOCKED_TOOLS    = 'locked_tools';
	var PHEROMONES      = 'pheromones';
	var GLASS_BONES     = 'glass_bones';
	var BRITTLE_MIND    = 'brittle_mind';
	var COLD_SWEAT      = 'cold_sweat';
	var NOT_THEIR_TYPE  = 'not_their_type';
	var SWIPER          = 'swiper';
	var FOG_OF_WAR      = 'fog_of_war';
	var OH_BUGGER       = 'oh_bugger';
	var STICKY_FINGERS  = 'sticky_fingers';
	var MAZE            = 'maze';

	/* Each entry's `weight` controls relative draft frequency.
	   Anything <= 0 is excluded from random draws (reserved for
	   modifiers that only the meta-shop / cheats can grant).
	   `payoutMultiplier` scales the run's ectoplasm payout — picked
	   to scale roughly with how much harder the modifier makes the
	   run, so harder modifiers earn proportionally more on success. */
	var CATALOGUE = Object.freeze([
		{
			id: LOCKED_TOOLS,
			name: 'Empty Bag',
			description: 'You start with no tools. Find them on the floor — or do without.',
			weight: 1,
			payoutMultiplier: 1.2
		},
		{
			id: PHEROMONES,
			name: 'Ghost Pheromones',
			description: 'The air itself works on you. Lust climbs an extra +1/step the entire hunt.',
			weight: 1,
			payoutMultiplier: 1.2
		},
		{
			id: GLASS_BONES,
			name: 'Glass Bones',
			description: 'Aftershock cooldown lingers twice as long after every orgasm.',
			weight: 1,
			payoutMultiplier: 1.2
		},
		{
			id: BRITTLE_MIND,
			name: 'Brittle Mind',
			description: 'Event-time sanity drains hit 50% harder, on top of dark/overcharged stacking.',
			weight: 1,
			payoutMultiplier: 1.3
		},
		{
			id: COLD_SWEAT,
			name: 'Cold Sweat',
			description: 'Something keeps the ghost interested. Prowl chance +4% the whole hunt.',
			weight: 1,
			payoutMultiplier: 1.15
		},
		{
			id: NOT_THEIR_TYPE,
			name: 'Not Their Type',
			description: 'The ghost will not bite. Baiting is unavailable this run.',
			weight: 1,
			payoutMultiplier: 1.15
		},
		{
			id: SWIPER,
			name: 'Swiper',
			description: 'Every tick with stealable clothes triggers a steal. Hold on to your panties.',
			weight: 1,
			payoutMultiplier: 1.4
		},
		{
			id: FOG_OF_WAR,
			name: 'Fog of War',
			description: 'One of the ghost\'s three evidences is hidden from the start. Good luck.',
			weight: 1,
			payoutMultiplier: 1.5
		},
		{
			id: OH_BUGGER,
			name: 'Oh, Bugger',
			description: 'Something is very wrong. Prowl chance +15% the whole hunt.',
			weight: 1,
			payoutMultiplier: 1.4
		},
		{
			id: STICKY_FINGERS,
			name: 'Sticky Fingers',
			description: 'Steal chance is doubled this run.',
			weight: 1,
			payoutMultiplier: 1.4
		},
		{
			id: MAZE,
			name: 'Maze',
			description: 'The house twists into three extra rooms.',
			weight: 1,
			payoutMultiplier: 1.3
		}
	]);

	function byId(id) {
		for (var i = 0; i < CATALOGUE.length; i++) {
			if (CATALOGUE[i].id === id) return CATALOGUE[i];
		}
		return null;
	}

	function list() { return CATALOGUE.slice(); }

	function draftableList() {
		return CATALOGUE.filter(function (m) { return m.weight > 0; });
	}

	/* Mulberry32 keyed on seed — same pattern as FloorPlan, kept
	   local so a draft is reproducible regardless of Math.random
	   patching elsewhere. */
	function makeRng(seed) {
		var state = (seed | 0) >>> 0;
		return function () {
			state = (state + 0x6D2B79F5) >>> 0;
			var t = state;
			t = Math.imul(t ^ (t >>> 15), t | 1);
			t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		};
	}

	/* Pick `n` modifiers from the draftable catalogue, weighted by
	   each entry's `weight`. Deterministic from `seed` (same seed
	   + same n -> same picks). Picks without replacement: a single
	   modifier never appears twice in the same draft.

	   opts.banned -- optional array of modifier ids to exclude from
	     the pool (used by the meta-shop banlist). Unknown ids are
	     ignored; the resulting draft size is still capped at the
	     remaining pool length. */
	function draft(seed, n, opts) {
		var rng = makeRng(seed);
		var pool = draftableList();
		var banned = (opts && Array.isArray(opts.banned)) ? opts.banned : null;
		if (banned && banned.length) {
			pool = pool.filter(function (m) { return banned.indexOf(m.id) === -1; });
		}
		var picks = [];
		var take = Math.min(n, pool.length);
		for (var i = 0; i < take; i++) {
			var totalW = pool.reduce(function (s, m) { return s + m.weight; }, 0);
			if (totalW <= 0) break;
			var roll = rng() * totalW;
			var acc = 0;
			var idx = pool.length - 1; // fallback for floating-point edge cases
			for (var j = 0; j < pool.length; j++) {
				acc += pool[j].weight;
				if (roll < acc) { idx = j; break; }
			}
			picks.push(pool[idx]);
			pool.splice(idx, 1);
		}
		return picks;
	}

	/* Resolve the active run's modifier ids to their catalogue
	   entries. Unknown ids are dropped silently (e.g. a modifier
	   that was renamed between save and load). */
	function activeList() {
		return setup.HuntController.modifiers()
			.map(function (id) { return byId(id); })
			.filter(function (m) { return !!m; });
	}

	/* Multiplicative payout scaling for the active deck. Unknown ids
	   contribute 1x. Returns 1 when no modifiers are active. */
	function payoutMultiplier() {
		return activeList().reduce(function (acc, m) {
			var mult = (m && typeof m.payoutMultiplier === 'number') ? m.payoutMultiplier : 1;
			return acc * mult;
		}, 1);
	}

	/* Modifier effect wiring. Each modifier whose effect can be expressed
	   as a filter mutation registers a subscriber here so HuntController
	   never has to branch on a specific modifier id. Subscribers are
	   no-ops when their modifier isn't in the active deck. */
	function hasMod(ctx, id) {
		var ids = ctx && ctx.modifierIds;
		return Array.isArray(ids) && ids.indexOf(id) !== -1;
	}

	setup.Hunt.filter(setup.Hunt.Event.STARTING_TOOLS, function (ctx) {
		/* Empty Bag: the player starts with no tools. Tools the player
		   would otherwise be missing get placed in furniture by the
		   floor-plan generator so the run is recoverable. */
		if (hasMod(ctx, LOCKED_TOOLS) && Array.isArray(ctx.tools)) {
			ctx.tools.length = 0;
		}
	});

	setup.Hunt.filter(setup.Hunt.Event.FLOORPLAN_OPTIONS, function (ctx) {
		/* Maze: three extra rooms on top of whatever the base plan
		   would have rolled. Composes with Smaller House (still +2). */
		if (!hasMod(ctx, MAZE)) return;
		if (!ctx || !ctx.fpOpts) return;
		ctx.fpOpts.roomCount = (ctx.fpOpts.roomCount || 5) + 3;
	});

	setup.Hunt.filter(setup.Hunt.Event.EVIDENCE_POOL, function (ctx) {
		/* Fog of War splices one evidence out of the three so
		   identification is harder. Deterministic from the run seed so
		   replays drop the same evidence. */
		if (!hasMod(ctx, FOG_OF_WAR)) return;
		if (!ctx || !Array.isArray(ctx.evidence) || ctx.evidence.length === 0) return;
		var seed = (typeof ctx.seed === 'number') ? ctx.seed : 0;
		var dropIdx = ((seed ^ 0xdeadbeef) >>> 0) % ctx.evidence.length;
		ctx.evidence.splice(dropIdx, 1);
	});

	setup.Hunt.filter(setup.Hunt.Event.PAYOUT, function (ctx) {
		/* Multiplicative payout scaling for the active deck. Each
		   modifier's catalogue `payoutMultiplier` field stacks. */
		if (!ctx || !Array.isArray(ctx.modifierIds)) return;
		for (var i = 0; i < ctx.modifierIds.length; i++) {
			var m = byId(ctx.modifierIds[i]);
			if (m && typeof m.payoutMultiplier === 'number') {
				ctx.multiplier *= m.payoutMultiplier;
			}
		}
	});

	setup.Hunt.filter(setup.Hunt.Event.STEAL_CHECK, function (ctx) {
		/* Swiper: every tick with stealable clothes triggers a steal,
		   bypassing the roll entirely.
		   Sticky Fingers: doubles the chance the per-tick roll passes.
		   Multiplier stacks; subscribers may push it further. */
		if (hasMod(ctx, SWIPER)) ctx.forceTrigger = true;
		if (hasMod(ctx, STICKY_FINGERS)) ctx.chanceMult = (ctx.chanceMult || 1) * 2;
	});

	setup.Hunt.filter(setup.Hunt.Event.AFTERSHOCK_COOLDOWN, function (ctx) {
		/* Glass Bones halves the per-tick cooldown decrement so the
		   orgasm aftershock window lasts twice as long. */
		if (hasMod(ctx, GLASS_BONES)) ctx.dec = (ctx.dec != null ? ctx.dec : 1) * 0.5;
	});

	setup.Hunt.filter(setup.Hunt.Event.BAIT_ALLOWED, function (ctx) {
		/* Not Their Type: the ghost will not bite. Baiting is
		   unavailable for the rest of the run. */
		if (hasMod(ctx, NOT_THEIR_TYPE)) ctx.allowed = false;
	});

	setup.Hunt.filter(setup.Hunt.Event.SANITY_EVENT_MULT, function (ctx) {
		/* Brittle Mind: event-time sanity drains hit 50% harder, on
		   top of dark/overcharged stacking. */
		if (hasMod(ctx, BRITTLE_MIND)) ctx.mult = (ctx.mult || 1) + 0.5;
	});

	setup.Hunt.filter(setup.Hunt.Event.SNAPSHOT, function (ctx) {
		/* Per-step hunt-condition mutations from modifiers. The snap
		   object is HuntConditionsController's aggregated readout; we
		   only bump the numeric fields, never push contributor chips
		   (the Active Modifiers panel already lists the modifier with
		   a hover tooltip). */
		if (!ctx || !ctx.snap || !ctx.inHouse) return;
		if (hasMod(ctx, PHEROMONES))    ctx.snap.lustPerStep      += 1;
		if (hasMod(ctx, COLD_SWEAT))    ctx.snap.prowlChanceBonus += 4;
		if (hasMod(ctx, OH_BUGGER))     ctx.snap.prowlChanceBonus += 15;
	});

	return {
		OWNED_VARS: Object.freeze([]),
		CATALOGUE: CATALOGUE,
		LOCKED_TOOLS:   LOCKED_TOOLS,
		PHEROMONES:     PHEROMONES,
		GLASS_BONES:    GLASS_BONES,
		BRITTLE_MIND:   BRITTLE_MIND,
		COLD_SWEAT:     COLD_SWEAT,
		NOT_THEIR_TYPE: NOT_THEIR_TYPE,
		SWIPER:         SWIPER,
		FOG_OF_WAR:     FOG_OF_WAR,
		OH_BUGGER:      OH_BUGGER,
		STICKY_FINGERS: STICKY_FINGERS,
		MAZE:           MAZE,
		list: list,
		byId: byId,
		draftableList: draftableList,
		draft: draft,
		activeList: activeList,
		payoutMultiplier: payoutMultiplier
	};
})();
