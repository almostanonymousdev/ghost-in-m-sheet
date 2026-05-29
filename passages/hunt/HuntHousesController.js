/*
 * Catalogue of named hunt houses with frozen floor plans.
 *
 * The procedural hunt path (HuntStart with no staticHouseId) still
 * rolls a fresh spanning-tree haunt each run. A "static hunt house"
 * is an entry here that pins a fixed room set + edge graph onto the
 * same hunt lifecycle: same minimap, same nav widget, same modifiers
 * + ectoplasm payout pipeline -- only the topology is frozen so the
 * player walks into a familiar layout.
 *
 * Each entry:
 *   id              -- canonical house key (e.g. 'owaissa').
 *                      Stored on $run.staticHouseId for the lifetime
 *                      of the run so resume / save migration can
 *                      tell which static plan a saved run belongs
 *                      to.
 *   label           -- player-facing card label (lobby + HUD).
 *   image           -- thumbnail URL for the GhostStreet card.
 *   levelGate       -- min Mc.lvl required to pick the card.
 *   modifierCount   -- number of modifiers to draft for runs in
 *                      this house. Omit to inherit the procedural
 *                      default (2). Set to 0 to opt out of the
 *                      modifier deck entirely -- the lobby renders
 *                      no modifier list and the run carries no
 *                      payout multiplier from modifiers.
 *   forcedModifiers -- optional [id, id, ...] list of zero-weight
 *                      modifier ids the catalogue pins onto every
 *                      run in this house, on top of the random draft
 *                      and ignoring the banlist. Each modifier's
 *                      ModifiersController filter subscribers then
 *                      own the per-channel behaviour (sidebar outfit,
 *                      outfit videos, UVL sprite, room backgrounds,
 *                      banshee scene, companion gate, steal gate),
 *                      so house-unique behaviour stays out of the
 *                      catalogue + downstream controllers.
 *   description     -- optional flavor blurb shown on the HuntStart
 *                      lobby in place of the generic
 *                      "A fresh hunt is waiting." line.
 *   roomBackgrounds -- optional per-template background override map:
 *                        { <templateId>: { light, dark }, ... }
 *                      The ROOM_BACKGROUND filter subscriber below
 *                      consults this before falling back to the
 *                      global huntRooms map. Lets a static hunt house
 *                      pin its rooms to its house's classic art when
 *                      the global default points at a different
 *                      house's variant (e.g. elm's kitchen needs
 *                      Elm's kitchen.jpg, not the Owaissa default).
 *                      For prison-themed art the equivalent override
 *                      lives on the prison_visuals modifier instead.
 *   plan            -- frozen floor-plan blueprint:
 *                        { rooms: [{ id, template }, ...],
 *                          edges: [[a, b], ...] }
 *                      rooms[0] must be the hallway. The id strings
 *                      use the same `room_<n>` shape the procedural
 *                      generator emits so every downstream consumer
 *                      (HuntRun, minimap, lootKindsAt, etc.) keeps
 *                      working without per-house branching.
 *
 * Adding a new static hunt house = one entry below + an asset for
 * `image`. The lifecycle, lobby card widget, and companion gate all
 * pick up the new entry through the catalogue.
 */
setup.HuntHouses = (function () {
	/* Owaissa's classic 5-room layout, frozen.
	   Hallway hub connects to kitchen, bedroom, bathroom; kitchen
	   branches off to the livingroom. Same template ids as the
	   classic-Owaissa art so the body-background pipeline picks
	   up identical room visuals for free. */
	var OWAISSA_PLAN = Object.freeze({
		rooms: [
			Object.freeze({ id: 'room_0', template: 'hallway' }),
			Object.freeze({ id: 'room_1', template: 'kitchen' }),
			Object.freeze({ id: 'room_2', template: 'livingroom' }),
			Object.freeze({ id: 'room_3', template: 'bedroom' }),
			Object.freeze({ id: 'room_4', template: 'bathroom' })
		],
		edges: [
			Object.freeze(['room_0', 'room_1']),
			Object.freeze(['room_1', 'room_2']),
			Object.freeze(['room_0', 'room_3']),
			Object.freeze(['room_0', 'room_4'])
		]
	});

	/* Ironclad's classic 11-room cellblock layout, frozen.
	   The hallway (prison entrance) hub connects to reception,
	   kitchen, and the two cellblock hubs. Each cellblock hub
	   branches to its three cells, mirroring the classic Ironclad
	   navigation graph.

	   Prison-unique behaviour (no clothes-theft, no companions, the
	   warden outfit on the sidebar, prison clothing-key for outfit
	   videos, prison UVL sprite pack, prison room backgrounds,
	   prison banshee scene) is driven by the `forcedModifiers`
	   list on the catalogue entry below -- each forced modifier's
	   filter subscribers in ModifiersController own its channel,
	   so HuntHousesController stays free of house-id branches. */
	var IRONCLAD_PLAN = Object.freeze({
		rooms: [
			Object.freeze({ id: 'room_0', template: 'hallway' }),
			Object.freeze({ id: 'room_1', template: 'reception' }),
			Object.freeze({ id: 'room_2', template: 'kitchen' }),
			Object.freeze({ id: 'room_3', template: 'BlockA' }),
			Object.freeze({ id: 'room_4', template: 'BlockACellA' }),
			Object.freeze({ id: 'room_5', template: 'BlockACellB' }),
			Object.freeze({ id: 'room_6', template: 'BlockACellC' }),
			Object.freeze({ id: 'room_7', template: 'BlockB' }),
			Object.freeze({ id: 'room_8', template: 'BlockBCellA' }),
			Object.freeze({ id: 'room_9', template: 'BlockBCellB' }),
			Object.freeze({ id: 'room_10', template: 'BlockBCellC' })
		],
		edges: [
			Object.freeze(['room_0', 'room_1']),  // hallway-reception
			Object.freeze(['room_0', 'room_2']),  // hallway-kitchen
			Object.freeze(['room_0', 'room_3']),  // hallway-BlockA
			Object.freeze(['room_0', 'room_7']),  // hallway-BlockB
			Object.freeze(['room_3', 'room_4']),  // BlockA-CellA
			Object.freeze(['room_3', 'room_5']),  // BlockA-CellB
			Object.freeze(['room_3', 'room_6']),  // BlockA-CellC
			Object.freeze(['room_7', 'room_8']),  // BlockB-CellA
			Object.freeze(['room_7', 'room_9']),  // BlockB-CellB
			Object.freeze(['room_7', 'room_10'])  // BlockB-CellC
		]
	});

	/* Elm's classic 9-room two-floor layout, frozen.
	   Downstairs hallway is the entry hub: kitchen, bathroom,
	   bedroom, basement hang off it, plus the staircase up to
	   hallwayUpstairs which branches to bathroomTwo, bedroomTwo,
	   nursery. Same template ids as the classic Elm art so the
	   body-background pipeline picks up identical Elm room art for
	   free (provided the huntRooms style map covers the upstairs
	   templates). */
	var ELM_PLAN = Object.freeze({
		rooms: [
			Object.freeze({ id: 'room_0', template: 'hallway' }),
			Object.freeze({ id: 'room_1', template: 'kitchen' }),
			Object.freeze({ id: 'room_2', template: 'bathroom' }),
			Object.freeze({ id: 'room_3', template: 'bedroom' }),
			Object.freeze({ id: 'room_4', template: 'basement' }),
			Object.freeze({ id: 'room_5', template: 'hallwayUpstairs' }),
			Object.freeze({ id: 'room_6', template: 'bathroomTwo' }),
			Object.freeze({ id: 'room_7', template: 'bedroomTwo' }),
			Object.freeze({ id: 'room_8', template: 'nursery' })
		],
		edges: [
			Object.freeze(['room_0', 'room_1']),
			Object.freeze(['room_0', 'room_2']),
			Object.freeze(['room_0', 'room_3']),
			Object.freeze(['room_0', 'room_4']),
			Object.freeze(['room_0', 'room_5']),
			Object.freeze(['room_5', 'room_6']),
			Object.freeze(['room_5', 'room_7']),
			Object.freeze(['room_5', 'room_8'])
		]
	});

	var CATALOGUE = Object.freeze([
		Object.freeze({
			id: 'owaissa',
			label: 'Owaissa Avenue',
			image: 'ui/img/owaissa-house.jpg',
			levelGate: 0,
			modifierCount: 0,
			objectiveDescription: 'Gather evidence on the ghost, then bring it back to the witch and name the type.',
			plan: OWAISSA_PLAN
		}),
		Object.freeze({
			id: 'elm',
			label: 'Elm Street',
			image: 'ui/img/elm-house.jpg',
			levelGate: 3,
			modifierCount: 0,
			objectiveDescription: 'Gather evidence on the ghost, then bring it back to the witch and name the type.',
			/* Pin elm's downstairs templates to Elm's classic art so the
			   body-background pipeline shows the Elm variants instead
			   of the Owaissa-defaulted globals in setup.Styles.huntRooms.
			   Upstairs templates (hallwayUpstairs, bathroomTwo,
			   bedroomTwo, nursery) and basement already match Elm in the
			   global map, so they don't need an override. */
			roomBackgrounds: Object.freeze({
				hallway: Object.freeze({ light: 'assets/scenes/room/elm/hallway.jpg', dark: 'assets/scenes/room/elm/hallway-dark.jpg' }),
				kitchen: Object.freeze({ light: 'assets/scenes/room/elm/kitchen.jpg', dark: 'assets/scenes/room/elm/kitchen-dark.jpg' }),
				bathroom: Object.freeze({ light: 'assets/scenes/room/elm/bathroom.jpg', dark: 'assets/scenes/room/elm/bathroom-dark.jpg' }),
				bedroom: Object.freeze({ light: 'assets/scenes/room/elm/bedroom.jpg', dark: 'assets/scenes/room/elm/bedroom-dark.jpg' })
			}),
			plan: ELM_PLAN
		}),
		Object.freeze({
			/* Prison-unique behaviour (no clothes-theft, no companions,
			   warden sidebar outfit, prison-clothing outfit videos,
			   prison UVL sprite pack, prison room backgrounds, prison
			   banshee scene, prison hunt-over scenes) is driven by the
			   `forcedModifiers` list below. Each forced modifier is a
			   weight:0 entry in the catalogue, so it never appears in
			   the random draft; the catalogue pins it on at startHunt
			   time and its filter subscribers in ModifiersController
			   own the per-channel behaviour. modifierCount=0 keeps the
			   prison hunt off the random modifier deck (matching the
			   other static hunt houses); the warden-outfit gate behind
			   the GhostStreet card is enforced via the `gate` predicate. */
			id: 'ironclad',
			label: 'Ironclad Prison',
			image: 'scenes/room/ironclad/ironclad.webp',
			levelGate: 4,
			modifierCount: 0,
			forcedModifiers: Object.freeze([
				'no_clothes_theft',
				'solo_only',
				'warden_outfit',
				'prison_visuals'
			]),
			description: "Ironclad Prison, once a symbol of justice, now stands abandoned, its long and storied past cloaked in shadows. Whispers speak of restless spirits wandering its halls — a chilling reminder of the darkness it once held.",
			gate: function () {
				return setup.Witch && setup.Witch.wardenClothesStage
					&& setup.Witch.wardenClothesStage()
					=== setup.WardenClothesStage.OUTFIT_OWNED;
			},
			gateMessage: 'Warden outfit required',
			plan: IRONCLAD_PLAN
		})
	]);

	function list() { return CATALOGUE.slice(); }

	function byId(id) {
		for (var i = 0; i < CATALOGUE.length; i++) {
			if (CATALOGUE[i].id === id) return CATALOGUE[i];
		}
		return null;
	}

	function ids() {
		return CATALOGUE.map(function (h) { return h.id; });
	}

	/* Convenience: returns the frozen plan for `id`, deep-cloned so
	   callers that mutate (e.g. floor-plan.generate stamps spawn +
	   loot onto the plan) don't trample the catalogue. */
	function planFor(id) {
		var h = byId(id);
		if (!h || !h.plan) return null;
		return {
			rooms: h.plan.rooms.map(function (r) {
				return { id: r.id, template: r.template };
			}),
			edges: h.plan.edges.map(function (e) { return [e[0], e[1]]; })
		};
	}

	/* Static-house filter wiring. Each per-house catalogue feature
	   (frozen floor-plan, modifier-count override, sidebar address
	   label) is registered here against the relevant filter event,
	   so adding a new override = one catalogue field + one subscriber.
	   Per-house behaviour that varies between specific houses (steal
	   gate, companion gate, outfit chip, room art) flows through
	   forcedModifiers instead -- the catalogue lists the modifier ids
	   to pin, and ModifiersController owns the channel-specific
	   subscribers. */

	setup.Hunt.filter(setup.Hunt.Event.FLOORPLAN_OPTIONS, function (ctx) {
		/* Static houses freeze the topology to a catalogue blueprint --
		   same rooms, same edges every run, regardless of seed or
		   modifiers. Spawn / loot / boss still roll off the seed; the
		   room set + edge graph come from the catalogue. The frozen
		   plan is deep-cloned by planFor so downstream mutations
		   (FloorPlan.generate stamps spawn/loot/boss) don't trample the
		   catalogue. ctx.staticHouseId is set by startHunt at the time
		   FLOORPLAN_OPTIONS fires -- $run.staticHouseId isn't stamped
		   yet, so we read from ctx, not activeHouse(). */
		if (!ctx || !ctx.fpOpts || !ctx.staticHouseId) return;
		var plan = planFor(ctx.staticHouseId);
		if (plan) ctx.fpOpts.staticPlan = plan;
	});

	setup.Hunt.filter(setup.Hunt.Event.MODIFIER_COUNT, function (ctx) {
		/* Per-house modifier-count override. Caller's opts.modifierCount
		   wins (ctx.count is non-null on entry then); only when the
		   caller didn't pin a value do we consult the catalogue. The
		   ctx.staticHouseId comes from startHunt -- $run isn't stamped
		   yet at this point in the lifecycle. */
		if (!ctx || ctx.count != null || !ctx.staticHouseId) return;
		var h = byId(ctx.staticHouseId);
		if (h && typeof h.modifierCount === 'number') ctx.count = h.modifierCount;
	});

	setup.Hunt.filter(setup.Hunt.Event.ROOM_BACKGROUND, function (ctx) {
		/* Static house catalogue may carry per-template { light, dark }
		   overrides (Elm's downstairs templates) so the body background
		   picks up the house's classic art. Templates not on the map
		   fall through to the global huntRooms default (set by
		   StyleController). House-id overrides apply to procedural and
		   static runs equally -- staticHouseId is the gating field. */
		if (!ctx || !ctx.staticHouseId) return;
		var h = byId(ctx.staticHouseId);
		if (!h || !h.roomBackgrounds) return;
		var override = h.roomBackgrounds[ctx.templateId];
		if (override) ctx.url = ctx.dark ? override.dark : override.light;
	});

	setup.Hunt.filter(setup.Hunt.Event.ADDRESS, function (ctx) {
		/* Static houses override the seed-derived `formatted` label
		   with their catalogue label so the HUD reads the house name
		   ("Owaissa") instead of a generated street address. Other
		   fields (number/road/suffix) stay untouched. */
		if (!ctx || !ctx.addr || !ctx.staticHouseId) return;
		var h = byId(ctx.staticHouseId);
		if (h && h.label) ctx.addr.formatted = h.label;
	});

	return {
		OWNED_VARS: Object.freeze([]),
		CATALOGUE: CATALOGUE,
		list: list,
		byId: byId,
		ids: ids,
		planFor: planFor
	};
})();
