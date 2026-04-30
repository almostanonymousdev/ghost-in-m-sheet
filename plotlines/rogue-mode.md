# Rogue Mode

A run-based variant on the classic witch-contract loop. Each rogue
run rolls a fresh haunted house from a deterministic seed: the floor
plan, the active modifiers, and the stash placements all change
between runs. Echo currency carries forward from one run to the
next and is spent in the meta-shop on persistent unlocks.

The classic witch-contract flow is unaffected — `$run` is `null`
when no rogue run is active, and predicates like
`setup.Run.isClassic()` / `setup.Run.isRogue()` keep the two modes
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
  run is auto-failed via `setup.Run.endRogue(false)` first (paying
  the failure-rate echoes, no resume). Then rolls a fresh seed
  (or accepts an explicit one), drafts the modifier deck,
  generates the floor plan, and stamps `$run`. Shows the player
  the modifier list and the floor plan before they commit.
  `setup.Run.startRogue({ seed })` does the actual composition.
* **[RogueRun](../passages/rogue/RogueLifecycle.tw)** — in-progress
  view. Currently a placeholder that renders the floor-plan
  minimap (via [`<<rogueMinimap>>`](../passages/rogue/widgetRogueMinimap.tw))
  and offers debug "Win" / "Lose" / "Abandon" links so the
  lifecycle can be exercised end-to-end. The actual room-by-room
  rendering is a follow-up pass once the rogue room renderer
  lands.
* **[RogueEnd](../passages/rogue/RogueLifecycle.tw)** — result
  screen. `setup.Run.endRogue(success)` clears `$run` and pays out
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
[`setup.Run`](../passages/rogue/RunController.tw).

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

The plan is a star topology — `room_0` is always the hallway
backbone; every other room links directly to it. Every room is
reachable; every stash kind (cursed item, rescue clue, tarot,
monkey paw) is placed on a real non-hallway room; the ghost
spawn room is non-hallway. Optionally one room is flagged as
the boss-room slot (`includeBoss: true`).

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
goes through `setup.Run.hasModifier(id)`.

## Echoes (meta-progression)

Earned at run end via `setup.Run.addEchoes(n)` or
`setup.Run.endRogue(success)` (which composes the standard
payout). Spent through `setup.Run.spendEchoes(n)` (returns
`false` if the player can't afford it; no partial deductions).
`setup.Run.canAffordEchoes(n)` is the predicate the storefront
links use to decide whether to render an unlock as active.

## File map

* [RunController.tw](../passages/rogue/RunController.tw) — `setup.Run`: lifecycle, accessors, echoes, composition (`startRogue`/`endRogue`), and `minimapData()`.
* [FloorPlanController.tw](../passages/rogue/FloorPlanController.tw) — `setup.FloorPlan`: seeded generator, neighbor / connectivity helpers.
* [ModifiersController.tw](../passages/rogue/ModifiersController.tw) — `setup.Modifiers`: catalogue + weighted draft.
* [TemplatesController.tw](../passages/rogue/TemplatesController.tw) — `setup.Templates`: room-template metadata + slot-id helpers.
* [RogueLifecycle.tw](../passages/rogue/RogueLifecycle.tw) — `RogueStart`, `RogueRun`, `RogueEnd`, `RogueMetaShop` passages.
* [widgetRogueMinimap.tw](../passages/rogue/widgetRogueMinimap.tw) — `<<rogueMinimap>>` floor-plan view.

## Save migration

`$run`, `$echoes`, and `$runsStarted` are seeded on legacy saves
by [SaveMigration.tw](../passages/updates/SaveMigration.tw)'s
`DEFAULTS` map (default values: `null`, `0`, `0`). `SAVE_VERSION`
bumps to 3 when a save is touched by rogue-aware code, so
downstream tooling can tell which schema generation a save was
last written under.

## Tests

* [run-controller.spec.js](../tests/run-controller.spec.js) — `setup.Run` lifecycle + accessors.
* [floor-plan.spec.js](../tests/floor-plan.spec.js) — generator determinism, connectivity, stash invariants, 200-seed fuzz.
* [modifiers.spec.js](../tests/modifiers.spec.js) — catalogue + draft determinism.
* [templates.spec.js](../tests/templates.spec.js) — template catalogue + slot-id helpers.
* [rogue-lifecycle.spec.js](../tests/rogue-lifecycle.spec.js) — `startRogue` / `endRogue` composition.
* [rogue-minimap.spec.js](../tests/rogue-minimap.spec.js) — `minimapData()` denormalisation.
* [save-load-roundtrip.spec.js](../tests/save-load-roundtrip.spec.js) — migration and round-trip coverage for rogue state.
* [e2e/rogue-flow.spec.js](../tests/e2e/rogue-flow.spec.js) — end-to-end CityMap → start → win → meta-shop walkthrough.
