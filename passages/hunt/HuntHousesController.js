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
 *   allowsCompanions -- when true, gates the companion plan flow
 *                      onto this hunt house. Drives
 *                      Companion.inHauntedHouseLocation through
 *                      the catalogue lookup so adding a new house
 *                      doesn't require touching the predicate.
 *   modifierCount   -- number of modifiers to draft for runs in
 *                      this house. Omit to inherit the procedural
 *                      default (2). Set to 0 to opt out of the
 *                      modifier deck entirely -- the lobby renders
 *                      no modifier list and the run carries no
 *                      payout multiplier from modifiers.
 *   description     -- optional flavor blurb shown on the HuntStart
 *                      lobby in place of the generic
 *                      "A fresh hunt is waiting." line.
 *   roomBackgrounds -- optional per-template background override map:
 *                        { <templateId>: { light, dark }, ... }
 *                      bgUrlForTemplate consults this before falling
 *                      back to the global huntRooms map. Lets a
 *                      static hunt house pin its rooms to its
 *                      house's classic art when the global default
 *                      points at a different house's variant
 *                      (e.g. elm's kitchen needs Elm's kitchen.jpg,
 *                      not the Owaissa-default global).
 *   sidebarOutfit   -- optional { image, tip } override for the MC
 *                      sidebar wardrobe strip while a run is in
 *                      flight here. Read by HuntController.sidebarOutfit()
 *                      and rendered as a single fixed-outfit tile by
 *                      widgetMcStatus (used by Ironclad's warden
 *                      costume).
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
			Object.freeze({ id: 'room_0', template: 'hallway'    }),
			Object.freeze({ id: 'room_1', template: 'kitchen'    }),
			Object.freeze({ id: 'room_2', template: 'livingroom' }),
			Object.freeze({ id: 'room_3', template: 'bedroom'    }),
			Object.freeze({ id: 'room_4', template: 'bathroom'   })
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

	   allowsCompanions is false on the catalogue entry below to
	   match Ironclad's design (companions don't engage in the prison
	   hunt path). Catalogue lookup -- no per-house branch needed. */
	var IRONCLAD_PLAN = Object.freeze({
		rooms: [
			Object.freeze({ id: 'room_0',  template: 'hallway'     }),
			Object.freeze({ id: 'room_1',  template: 'reception'   }),
			Object.freeze({ id: 'room_2',  template: 'kitchen'     }),
			Object.freeze({ id: 'room_3',  template: 'BlockA'      }),
			Object.freeze({ id: 'room_4',  template: 'BlockACellA' }),
			Object.freeze({ id: 'room_5',  template: 'BlockACellB' }),
			Object.freeze({ id: 'room_6',  template: 'BlockACellC' }),
			Object.freeze({ id: 'room_7',  template: 'BlockB'      }),
			Object.freeze({ id: 'room_8',  template: 'BlockBCellA' }),
			Object.freeze({ id: 'room_9',  template: 'BlockBCellB' }),
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
			Object.freeze({ id: 'room_0', template: 'hallway'         }),
			Object.freeze({ id: 'room_1', template: 'kitchen'         }),
			Object.freeze({ id: 'room_2', template: 'bathroom'        }),
			Object.freeze({ id: 'room_3', template: 'bedroom'         }),
			Object.freeze({ id: 'room_4', template: 'basement'        }),
			Object.freeze({ id: 'room_5', template: 'hallwayUpstairs' }),
			Object.freeze({ id: 'room_6', template: 'bathroomTwo'     }),
			Object.freeze({ id: 'room_7', template: 'bedroomTwo'      }),
			Object.freeze({ id: 'room_8', template: 'nursery'         })
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
			id:               'owaissa',
			label:            'Owaissa Avenue',
			image:            'ui/img/owaissa-house.jpg',
			levelGate:        0,
			allowsCompanions: true,
			modifierCount:    0,
			plan:             OWAISSA_PLAN
		}),
		Object.freeze({
			id:               'elm',
			label:            'Elm Street',
			image:            'ui/img/elm-house.jpg',
			levelGate:        3,
			allowsCompanions: true,
			modifierCount:    0,
			/* Pin elm's downstairs templates to Elm's classic art so the
			   body-background pipeline shows the Elm variants instead
			   of the Owaissa-defaulted globals in setup.Styles.huntRooms.
			   Upstairs templates (hallwayUpstairs, bathroomTwo,
			   bedroomTwo, nursery) and basement already match Elm in the
			   global map, so they don't need an override. */
			roomBackgrounds: Object.freeze({
				hallway:  Object.freeze({ light: 'assets/scenes/room/elm/hallway.jpg',  dark: 'assets/scenes/room/elm/hallway-dark.jpg'  }),
				kitchen:  Object.freeze({ light: 'assets/scenes/room/elm/kitchen.jpg',  dark: 'assets/scenes/room/elm/kitchen-dark.jpg'  }),
				bathroom: Object.freeze({ light: 'assets/scenes/room/elm/bathroom.jpg', dark: 'assets/scenes/room/elm/bathroom-dark.jpg' }),
				bedroom:  Object.freeze({ light: 'assets/scenes/room/elm/bedroom.jpg',  dark: 'assets/scenes/room/elm/bedroom-dark.jpg'  })
			}),
			plan:             ELM_PLAN
		}),
		Object.freeze({
			/* Ironclad opts out of the companion plan flow AND the
			   steal-clothes per-tick roll (the prison hunt has its own
			   warden-clothes mechanic and no companion-event choreography).
			   The catalogue carries both gates so the companion / steal
			   predicates are data-driven, no per-house branching needed.
			   modifierCount=0 keeps the prison hunt off the modifier deck
			   for now (matching the other static hunt houses); the
			   warden-outfit gate behind the GhostStreet card is enforced
			   via the `gate` predicate. */
			id:               'ironclad',
			label:            'Ironclad Prison',
			image:            'scenes/room/ironclad/ironclad.webp',
			levelGate:        4,
			allowsCompanions: false,
			runsStealClothes: false,
			modifierCount:    0,
			sidebarOutfit:    Object.freeze({
				image: 'ui/icons/warden1.png',
				tip:   'Wearing a sexy warden costume'
			}),
			description:      "Ironclad Prison, once a symbol of justice, now stands abandoned, its long and storied past cloaked in shadows. Whispers speak of restless spirits wandering its halls — a chilling reminder of the darkness it once held.",
			/* Pin ironclad's hallway and kitchen to the prison's classic
			   art (entrance.webp / ironclad/kitchen.webp) so every room
			   in the plan renders the same scenery the player sees
			   inside Ironclad. The cellblock templates (reception,
			   BlockA/B, BlockA/B cells) already resolve to the prison
			   art via the global huntRooms map. */
			roomBackgrounds: Object.freeze({
				hallway: Object.freeze({ light: 'assets/scenes/room/ironclad/entrance.webp', dark: 'assets/scenes/room/ironclad/entrance-dark.webp' }),
				kitchen: Object.freeze({ light: 'assets/scenes/room/ironclad/kitchen.webp',  dark: 'assets/scenes/room/ironclad/kitchen-dark.webp'  })
			}),
			gate:             function () {
				return setup.Witch && setup.Witch.wardenClothesStage
					&& setup.Witch.wardenClothesStage()
						=== setup.WardenClothesStage.OUTFIT_OWNED;
			},
			gateMessage:      'Warden outfit required',
			plan:             IRONCLAD_PLAN
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

	function allowsCompanions(id) {
		var h = byId(id);
		return !!(h && h.allowsCompanions);
	}

	/* Per-template { light, dark } background override stamped on the
	   catalogue entry, or null when the house doesn't override that
	   template. setup.Styles.bgUrlForTemplate consults this before the
	   global huntRooms map. */
	function backgroundOverride(id, templateId) {
		var h = byId(id);
		if (!h || !h.roomBackgrounds) return null;
		return h.roomBackgrounds[templateId] || null;
	}

	return {
		OWNED_VARS:        Object.freeze([]),
		CATALOGUE:         CATALOGUE,
		list:              list,
		byId:              byId,
		ids:               ids,
		planFor:           planFor,
		allowsCompanions:  allowsCompanions,
		backgroundOverride: backgroundOverride
	};
})();
