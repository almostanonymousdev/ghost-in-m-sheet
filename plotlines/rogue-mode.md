# Rogue Mode

A run-based variant on the classic witch-contract loop. Each rogue
run rolls a fresh haunted house from a deterministic seed: the floor
plan, the active modifiers, and the stash placements all change
between runs. Echo currency carries forward from one run to the
next and is spent in the meta-shop on persistent unlocks.

The classic witch-contract flow is unaffected — `$run` is `null`
when no rogue run is active, and predicates like
`setup.Rogue.isClassic()` / `setup.Rogue.isRogue()` keep the two modes
cleanly partitioned.

## Lifecycle

A rogue run flows through four passages. The entry point is the
**Rogue Haunt** card on
[GhostStreet](../passages/haunted_houses/general/GhostStreet.tw),
slotted alongside the authored haunts (Owaissa, Ironclad, Elm,
Enigma) via the [`<<rogueHuntCard>>`](../passages/haunted_houses/tools/widgetHauntedHouseStreet.tw)
widget. There is no "resume" — once you start a run, you either
finish it (Win / Lose / Abandon from RogueRun) or forfeit it by
walking back into RogueStart, which counts the unfinished run as
a failure before rolling fresh.

* **[RogueStart](../passages/rogue/RogueLifecycle.tw)** — entry point.
  If the player walks in with an in-flight run on `$run`, that
  run is auto-failed via `setup.Rogue.endRogue(false)` first (paying
  the failure-rate echoes, no resume). Then rolls a fresh seed
  (or accepts an explicit one), drafts the modifier deck,
  generates the floor plan, and stamps `$run`. Shows the player
  the modifier list and the floor plan before they commit.
  `setup.Rogue.startRogue({ seed })` does the actual composition.
* **[RogueRun](../passages/rogue/RogueLifecycle.tw)** — in-progress
  view. Laid out to mirror the regular ghost hunts: the SVG
  minimap ([`<<rogueMinimap>>`](../passages/rogue/widgetRogueMinimap.tw)
  — labeled squares with edges and current/spawn/boss highlights)
  sits in the top-left, the active modifier list and the debug
  Win / Lose / Abandon links sit in the top-right, and the bottom
  is a furniture-icon strip + run HUD + tool/exit toolbar. The
  exits column on the right of the toolbar calls
  `setup.Rogue.setCurrentRoom(id)` and re-enters RogueRun. The
  tools panel ([`<<rogueToolBar>>`](../passages/rogue/widgetRogueToolBar.tw))
  emits one card per `setup.searchToolOrder` entry; clicking a
  card wikifies the shared `<<toolCheck>>` macro and burns one
  in-game minute, the same renderer the haunted-house tools use
  (see [Cross-mode hunt facade](#cross-mode-hunt-facade) for how
  rogue runs plug into that machinery without a `$hunt`).
* **[RogueEnd](../passages/rogue/RogueLifecycle.tw)** — result
  screen. `setup.Rogue.endRogue(success)` clears `$run` and pays out
  echoes (5 base + 5 if successful + 1 per active modifier). The
  player can route to the meta-shop or back to the city.
* **[RogueMetaShop](../passages/rogue/RogueLifecycle.tw)** —
  echo-spending storefront. Currently exposes a placeholder
  3-echo unlock; specific unlocks (extra modifier reroll, starting
  tool, companion at run start, etc.) land alongside their
  gameplay hooks.

## State shape

Run-level state lives on `$run` and meta-progression state on
`$echoes` / `$runsStarted`. Both are owned by
[`setup.Rogue`](../passages/rogue/RogueController.tw).

```
$run = {
  seed,        // int driving the floor-plan generator + per-run rolls
  number,      // monotonic attempt counter (= $runsStarted at start)
  modifiers,   // array of modifier ids (catalogued in setup.Modifiers)
  loadout,     // { tools, money, ... } — starting kit
  objective,   // string id (default 'identify')
  floorplan    // populated by setup.FloorPlan.generate()
}

$echoes        // persistent meta-progression currency
$runsStarted   // lifetime attempt counter
```

## Floor-plan generator

[`setup.FloorPlan.generate(seed, opts)`](../passages/rogue/FloorPlanController.tw)
builds a deterministic floor plan: same seed, same plan. The
generator uses an internal Mulberry32 PRNG, so the result is
independent of the global `Math.random` patching that tests
install for other purposes.

The plan is a random spanning tree rooted at the hallway
(`room_0`); each non-hallway room attaches to one already-placed
room, so layouts vary per seed but stay fully connected. Every
stash kind (cursed item, rescue clue, tarot, monkey paw) is
placed on a real non-hallway room and pinned to a specific
furniture suffix where the template carries one
(`stashFurniture[kind]`); the ghost spawn room is non-hallway.
Optionally one room is flagged as the boss-room slot
(`includeBoss: true`).

```
plan = {
  seed,
  rooms: [{ id: 'room_0', template: 'hallway' }, ...],
  edges: [['room_0', 'room_1'], ...],
  spawnRoomId, stashes, bossRoomId
}
```

Templates available for non-hallway slots come from the
procedural-eligible filter on
[`setup.Templates`](../passages/rogue/TemplatesController.tw)
(`kitchen`, `bathroom`, `bedroom`, `livingroom`, `nursery`,
`basement`, `roomA`, `roomB`, `roomC`). Story-locked templates
(Ironclad cells, Elm's nursery, the Enigma trio) stay
authored-house-only.

## Cross-mode hunt facade

Two completely different lifecycles -- the classic witch-contract
flow (`$hunt`) and rogue runs (`$run`) -- share one tool / evidence
/ event stack. The mode dispatch lives in
[`setup.HuntController`](../passages/hunt/HuntController.tw):

* `mode()` — `'regular'` while a `$hunt` is open, `'rogue'` while
  a rogue run is active, `null` otherwise. Regular wins the tie.
* `activeGhost()` — Ghost instance for whichever mode is active.
  Classic mode rebuilds from `$hunt` evidence (DeleteEvidence /
  Mimic rotation); rogue mode hands back the catalogue ghost
  named in `$run.ghostName`.
* `isGhostHere(houses)` — true iff the player is in the active
  ghost's room. Classic mode pins ghost-room to `$hunt.room.name`
  against the haunted-passage table; rogue mode compares
  `$run.currentRoomId` against `floorplan.spawnRoomId` and only
  fires inside the `RogueRun` passage.

`setup.Ghosts.active()` and `setup.isGhostHere()` are thin
adapters that delegate to the facade -- legacy callers don't move,
new shared code reads through the controller. The rogue ghost
itself is rolled in `setup.Rogue.startRogue()` from a
seed-derived index into `setup.Ghosts.names()` and stamped onto
`$run.ghostName`, so the same seed reproduces the same ghost.

## Modifier registry

[`setup.Modifiers`](../passages/rogue/ModifiersController.tw)
catalogues every run modifier with a draft weight; weight 0
keeps a modifier out of the random draw (reserved for meta-shop
unlocks, debug, etc.). `setup.Modifiers.draft(seed, n)` does a
seeded weighted no-replacement draw.

Modifiers in the catalogue today: Power Outage, Whisper Network
(sanity drain), Cartomancer's Curse (tarot-only), Empty Bag
(locked tools), Skinwalker, Heatwave, Time Loop, Marked
(weight 0). Effect hooks land alongside the gameplay
controllers each modifier touches; querying the active deck
goes through `setup.Rogue.hasModifier(id)`.

## Echoes (meta-progression)

Earned at run end via `setup.Rogue.addEchoes(n)` or
`setup.Rogue.endRogue(success)` (which composes the standard
payout). Spent through `setup.Rogue.spendEchoes(n)` (returns
`false` if the player can't afford it; no partial deductions).
`setup.Rogue.canAffordEchoes(n)` is the predicate the storefront
links use to decide whether to render an unlock as active.

## File map

* [RogueController.tw](../passages/rogue/RogueController.tw) — `setup.Rogue`: lifecycle, accessors, echoes, composition (`startRogue`/`endRogue`), `minimapData()` / `minimapSvg()` / `currentRoomData()`, and current-room nav (`currentRoomId` / `setCurrentRoom`).
* [FloorPlanController.tw](../passages/rogue/FloorPlanController.tw) — `setup.FloorPlan`: seeded generator, neighbour / connectivity helpers, BFS layout for the minimap.
* [ModifiersController.tw](../passages/rogue/ModifiersController.tw) — `setup.Modifiers`: catalogue + weighted draft.
* [TemplatesController.tw](../passages/rogue/TemplatesController.tw) — `setup.Templates`: room-template metadata + slot-id helpers.
* [RogueLifecycle.tw](../passages/rogue/RogueLifecycle.tw) — `RogueStart`, `RogueRun`, `RogueEnd`, `RogueMetaShop` passages.
* [widgetRogueMinimap.tw](../passages/rogue/widgetRogueMinimap.tw) — `<<rogueMinimap>>` SVG floor-plan view.
* [widgetRogueToolBar.tw](../passages/rogue/widgetRogueToolBar.tw) — `<<rogueToolBar>>` six-card tool grid; each card wikifies `<<toolCheck>>` on click.
* [HuntController.tw](../passages/hunt/HuntController.tw) — `setup.HuntController`: cross-mode facade for `mode()` / `activeGhost()` / `isGhostHere()`.

## Save migration

`$run`, `$echoes`, and `$runsStarted` are seeded on legacy saves
by [SaveMigration.tw](../passages/updates/SaveMigration.tw)'s
`DEFAULTS` map (default values: `null`, `0`, `0`). `SAVE_VERSION`
bumps to 3 when a save is touched by rogue-aware code, so
downstream tooling can tell which schema generation a save was
last written under.

## Tests

* [rogue-controller.spec.js](../tests/rogue-controller.spec.js) — `setup.Rogue` lifecycle + accessors.
* [floor-plan.spec.js](../tests/floor-plan.spec.js) — generator determinism, connectivity, stash invariants, 200-seed fuzz.
* [modifiers.spec.js](../tests/modifiers.spec.js) — catalogue + draft determinism.
* [templates.spec.js](../tests/templates.spec.js) — template catalogue + slot-id helpers.
* [rogue-lifecycle.spec.js](../tests/rogue-lifecycle.spec.js) — `startRogue` / `endRogue` composition.
* [rogue-minimap.spec.js](../tests/rogue-minimap.spec.js) — `minimapData()` denormalisation.
* [save-load-roundtrip.spec.js](../tests/save-load-roundtrip.spec.js) — migration and round-trip coverage for rogue state.
* [e2e/rogue-flow.spec.js](../tests/e2e/rogue-flow.spec.js) — end-to-end CityMap → start → win → meta-shop walkthrough; tool functionality, lair-room `isGhostHere`, time advance per click.
* [hunt-controller.spec.js](../tests/hunt-controller.spec.js) — `setup.HuntController` facade contract across both modes.
