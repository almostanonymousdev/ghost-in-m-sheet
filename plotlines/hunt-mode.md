# Hunt Mode

The hunt loop. Each hunt rolls a fresh haunted house from a
deterministic seed: the floor plan, the active modifiers, and the
stash placements all change between runs. A small set of static
houses (Owaissa, Elm, Ironclad) ride the same lifecycle but skip
the floor-plan roll and substitute their authored template.
Ectoplasm (measured in mL) carries forward from one run to the next
and is spent at the witch's house ([WitchEctoplasm](../passages/witch/WitchEctoplasm.tw))
on persistent unlocks.

`setup.HuntController.isActive()` is the canonical "a hunt is in
flight" predicate; `$run` is `null` whenever no hunt is active.

## Lifecycle

A hunt flows through four passages. The entry point is the **Hunt**
card on
[GhostStreet](../passages/haunted_houses/general/GhostStreet.tw),
via the [`<<huntCard>>`](../passages/haunted_houses/tools/widgetHauntedHouseStreet.tw)
widget. There is no "resume" — once you start a run, you either
finish it (Win / Lose / Abandon from HuntRun) or forfeit it by
walking back into HuntStart, which counts the unfinished run as
a failure before rolling fresh.

* **[HuntStart](../passages/hunt/HuntLifecycle.tw)** — entry point.
  If the player walks in with an in-flight run on `$run`, that
  run is auto-failed via `setup.HuntController.endHunt(false)` first (paying
  the failure-rate ectoplasm, no resume). Then rolls a fresh seed
  (or accepts an explicit one), drafts the modifier deck,
  generates the floor plan, and stamps `$run`. Shows the player
  the modifier list and the floor plan before they commit.
  `setup.HuntController.startHunt({ seed, staticHouseId })` does the actual
  composition; passing a `staticHouseId` from the
  [`setup.HuntHouses`](../passages/hunt/HuntHousesController.tw)
  catalogue substitutes the authored plan for the procedural roll.
* **[HuntRun](../passages/hunt/HuntLifecycle.tw)** — in-progress
  view. The SVG minimap
  ([`<<huntMinimap>>`](../passages/hunt/widgetHuntMinimap.tw)
  — labeled squares with edges and current/spawn/boss highlights)
  sits in the top-left, the active modifier list and the debug
  Win / Lose / Abandon links sit in the top-right, and the bottom
  is a furniture-icon strip + run HUD + tool/exit toolbar. The
  exits column on the right of the toolbar calls
  `setup.HuntController.setCurrentRoom(id)` and re-enters HuntRun. The
  tools panel ([`<<huntToolBar>>`](../passages/hunt/widgetHuntToolBar.tw))
  emits one card per `setup.searchToolOrder` entry; clicking a
  card wikifies the shared `<<toolCheck>>` macro and burns one
  in-game minute, the same renderer the haunted-house tools use
  (see [Hunt facade](#hunt-facade) for how hunts plug into
  that machinery).
* **[HuntSummary](../passages/hunt/HuntLifecycle.tw)** — result
  screen. `setup.HuntController.endHunt(success)` clears `$run` and pays out
  ectoplasm (5 mL base + 5 mL if successful + 1 mL per active
  modifier). The player can chain straight into a fresh run via
  "Start a new hunt" (re-enters `HuntStart`) or fall back to the
  city; persistent unlocks are bought separately from the witch.
* **[WitchEctoplasm](../passages/witch/WitchEctoplasm.tw)** —
  ectoplasm-spending storefront, reached from `WitchInside`.
  Lists every entry in `setup.HuntController.shopCatalogue()`
  (banlist slot, reroll charge, witch's blessing, smaller house,
  loot sense, etc.) priced in mL. Banlist toggles render here too
  when the player owns one or more slots.

## State shape

Run-level state lives on `$run` and meta-progression state on
`$ectoplasm` / `$runsStarted`. Both are owned by
[`setup.HuntController`](../passages/hunt/HuntController.tw).

```
$run = {
  seed,           // int driving the floor-plan generator + per-run rolls
  number,         // monotonic attempt counter (= $runsStarted at start)
  modifiers,      // array of modifier ids (catalogued in setup.Modifiers)
  loadout,        // { tools, money, ... } — starting kit
  objective,      // string id (default 'identify')
  floorplan,      // populated by setup.FloorPlan.generate()
  ghostName,      // active ghost's catalogue name
  evidence,       // evidence-id list (Fog of War may splice one out)
  staticHouseId,  // null for procedural runs, HuntHouses id otherwise
  trapped,        // true when a Monkey Paw wish has frozen the lair
  exitLock        // matching exit-lock target on trap
}

$ectoplasm     // persistent meta-progression currency, in mL
$runsStarted   // lifetime attempt counter
```

## Floor-plan generator

[`setup.FloorPlan.generate(seed, opts)`](../passages/hunt/FloorPlanController.tw)
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

Hunting tools the player would otherwise be missing from the
toolbar (Empty Bag modifier, restricted `loadout.tools`) get
seeded into the floor plan as `tool_<id>` loot when
`opts.toolKinds` is provided. Each one is forced onto a
furniture-bearing room and pinned to a distinct slot (same
machinery as tarot / monkey paw), so the player can recover the
kit by exploring. `setup.HuntController.startHunt` computes the missing
tools off the drafted modifiers + loadout and forwards them to
the generator; it also bumps `roomCount` when there's tool loot
to place so the per-room slot pool has slack for the extra pins.

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
[`setup.Templates`](../passages/hunt/TemplatesController.tw)
(`kitchen`, `bathroom`, `bedroom`, `livingroom`, `nursery`,
`basement`, `attic`, `dining-room`, `sauna`, `sex-dungeon`,
`walk-in-closet`). Static-house templates (Ironclad cells, Elm's
nursery) stay catalogue-only and don't roll into the procedural pool.

## Hunt facade

The tool / evidence / event stack all reads through
[`setup.HuntController`](../passages/hunt/HuntController.tw), so
passages and widgets never branch on hunt-active-vs-not internally
— they just call the facade and let it return the right thing for
the current run state:

* `isActive()` — true iff a hunt is in flight.
* `activeGhost()` — the catalogue Ghost named in `$run.ghostName`,
  with any per-run evidence override (e.g. Fog of War) overlaid.
  Returns `null` when no run is active.
* `realGhostName()` — `$run.ghostName` or `''`. Used by the cheat
  panel and journal reveals.
* `isGhostHere(houses)` — true iff the player is in the ghost's
  room. Compares `$run.currentRoomId` against
  `floorplan.spawnRoomId` and only fires inside the `HuntRun`
  passage. The optional `houses` filter is silently ignored —
  hunts aren't house-specific.
* `isHuntActive()` — gates the per-tick chain. Run is in flight
  AND the player is on the `HuntRun` passage.
  `setup.HauntConditions.snapshot()`/`applyTickEffects()` and
  `<<toolTick>>`'s HuntOverTime check both read this.
* `shouldTriggerSteal()` — wardrobe-state roll. Honours a
  per-static-house `runsStealClothes: false` opt-out (Ironclad,
  since prison ghosts have their own warden-clothes mechanic).
* `shouldStartRandomProwl()` — gates `CheckHuntStart`'s
  `<<goto "GhostHuntEvent">>`. Delegates to
  `HauntedHouses.shouldStartRandomProwl()`
  (`canStartRandomProwl` + `prowlChanceBonus` + `g.canProwl(mc)`).
* `huntOverPassage(reason)` — stamps the run as a failure with
  the reason and returns `HuntSummary`. Also called by
  `FreezeHunt`'s "Surrender to the cold" link so the
  no-clothes-left branch ends the run cleanly.
* `huntCaughtPassage()` — stamps a `caught` failure on the run
  and returns `HuntSummary`. The High-Priestess tarot override (a
  draw that lets the MC walk away from a catch) is handled
  inside the widget, so the helper isn't reached when the
  priestess is in play.
* `onCaughtCleanup()` — wardrobe / companion / tool-timer reset.
  The matching `$run` cleanup is deferred to
  `setup.HuntController.endHunt`, fired when the player clicks the
  huntEndExit link through to `HuntSummary`.
* `shuffleGhostRoom()` — periodic ghost-room drift. Owns the
  shared 20-minute interval gate and the 45% roll, then
  dispatches to `setup.HuntController.driftGhostRoom` for the actual
  room pick. Skips when the active ghost's catalogue marks it
  `staysInOneRoom` (Goryo / Phantom). Called from
  `TickController.onPassageDone`.
* `snapGhostToCurrentRoom()` — pin the ghost to the player's
  current room. Used by the Monkey Paw tier-3 activity and
  trapTheGhost wishes. Snaps `floorplan.spawnRoomId` to
  `$run.currentRoomId`.
* `trapGhost(unlockBy)` / `isGhostTrapped()` — `trapGhost` stamps
  `run.trapped` and `run.exitLock` so the lair doesn't drift and
  the player's exit is locked.
* `streetExitPassage()` / `banActiveContext()` — used by the
  Monkey Paw leave wish. Stamps an `abandon` failure + returns
  `HuntSummary` (the run forfeits) and bans nothing.
* `possessionPassage()` — used by the Tarot Possession card.
  Stamps a `possessed` failure on the run and routes to
  `HuntSummary`.
* `consumeKnowledgeEvidence()` — used by the Tarot Knowledge
  card and the Monkey Paw knowledge wish. Picks a random
  evidence the ghost doesn't have and stamps it on
  `$chosenEvidence`. Marks `$knowledgeUsed` so a second draw
  is a no-op.
* `isInsideHuntPassage()` — Bag carry-link gate. True iff
  `previous(1)` is `HuntRun`, so the tarot deck and monkey paw
  don't appear in Bag from the city or hunt lobby.

`setup.Ghosts.active()` and `setup.isGhostHere()` are thin
adapters that delegate to the facade. The hunt's ghost is rolled
in `setup.HuntController.startHunt()` from a seed-derived index into
`setup.Ghosts.names()` and stamped onto `$run.ghostName`, so the
same seed reproduces the same ghost.

## Per-tick event chain

`setup.HuntController` predicates drive a single per-tick chain,
shared between nav-link steps and tool clicks:

* `<<huntTickStep>>` — per-nav-step / per-tool-click chain. Runs
  the per-tick stat drains, routes to
  `HuntController.huntOverPassage("sanity"|"exhaustion")` if the
  MC ran out, and otherwise dispatches to the inner chain.
* `<<huntTickEventChain>>` — inner chain. Lights flicker
  (`LightPassageGhost`), a ghost event may roll (`Event` →
  `EventMC`), a steal-clothes event may roll
  (`HuntController.shouldTriggerSteal` → `StealClothes`), and a
  random prowl may start (`HuntController.shouldStartRandomProwl`
  → `GhostHuntEvent`).

The hunt nav links in `HuntRun` and the `<<huntToolBar>>` widget
all call `<<huntTickStep>>`.

`<<includeTimeEventClothesHunt>>` and `<<includeTimeEventHunt>>`
are thin aliases for `<<huntTickStep>>` so existing call sites
keep working without churn.

## Modifier registry

[`setup.Modifiers`](../passages/hunt/ModifiersController.tw)
catalogues every run modifier with a draft weight; weight 0
keeps a modifier out of the random draw (reserved for witch
ectoplasm unlocks, debug, etc.). `setup.Modifiers.draft(seed, n)` does a
seeded weighted no-replacement draw.

Modifiers in the catalogue today: Empty Bag (locked tools)
and Ghost Pheromones (+1 lust/step in-house). The catalogue
deliberately tracks only modifiers with real effect wiring —
catalogue-only entries that ship to the run-start UI but do
nothing in-game make for a bait-and-switch draft, so new ideas
live in this doc until their effect is wired into the relevant
controller. Querying the active deck goes through
`setup.HuntController.hasModifier(id)`.

## Ectoplasm (meta-progression, mL)

Earned at run end via `setup.HuntController.addEctoplasm(n)` or
`setup.HuntController.endHunt(success)` (which composes the standard
payout). Spent through `setup.HuntController.spendEctoplasm(n)` (returns
`false` if the player can't afford it; no partial deductions).
`setup.HuntController.canAffordEctoplasm(n)` is the predicate the storefront
links use to decide whether to render an unlock as active.

## File map

* [HuntController.tw](../passages/hunt/HuntController.tw) — `setup.HuntController`: lifecycle, accessors, ectoplasm, composition (`startHunt`/`endHunt`), `minimapData()` / `minimapSvg()` / `currentRoomData()`, and current-room nav (`currentRoomId` / `setCurrentRoom`).
* [FloorPlanController.tw](../passages/hunt/FloorPlanController.tw) — `setup.FloorPlan`: seeded generator, neighbour / connectivity helpers, BFS layout for the minimap.
* [ModifiersController.tw](../passages/hunt/ModifiersController.tw) — `setup.Modifiers`: catalogue + weighted draft.
* [TemplatesController.tw](../passages/hunt/TemplatesController.tw) — `setup.Templates`: room-template metadata + slot-id helpers.
* [HuntHousesController.tw](../passages/hunt/HuntHousesController.tw) — `setup.HuntHouses`: static-house catalogue (Owaissa / Elm / Ironclad) with authored floor plans and per-house overrides.
* [HuntLifecycle.tw](../passages/hunt/HuntLifecycle.tw) — `HuntStart`, `HuntRun`, `HuntSummary` passages.
* [WitchEctoplasm.tw](../passages/witch/WitchEctoplasm.tw) — persistent-unlock storefront, priced in ectoplasm; reached from `WitchInside`.
* [widgetHuntMinimap.tw](../passages/hunt/widgetHuntMinimap.tw) — `<<huntMinimap>>` SVG floor-plan view.
* [widgetHuntToolBar.tw](../passages/hunt/widgetHuntToolBar.tw) — `<<huntToolBar>>` tool grid; renders one card per `setup.HuntController.startingTools()` entry (default = all six). Empty Bag (`locked_tools`) collapses the strip to a "your bag is empty" placeholder; `loadout.tools` filters to a subset while preserving canonical order. Tools the player picks up from `tool_<id>` furniture loot get unioned back in, so a started-empty bag fills back in as the player searches the rooms.

## Save migration

`$run`, `$ectoplasm`, and `$runsStarted` are seeded on legacy saves
by [SaveMigration.tw](../passages/updates/SaveMigration.tw)'s
`DEFAULTS` map (default values: `null`, `0`, `0`). `SAVE_VERSION`
is bumped each time the hunt-state schema changes so downstream
tooling can tell which schema generation a save was last written
under.

## Tests

* [hunt-state.spec.js](../tests/hunt-state.spec.js) — `setup.HuntController` lifecycle + accessors.
* [floor-plan.spec.js](../tests/floor-plan.spec.js) — generator determinism, connectivity, stash invariants, 200-seed fuzz.
* [modifiers.spec.js](../tests/modifiers.spec.js) — catalogue + draft determinism.
* [templates.spec.js](../tests/templates.spec.js) — template catalogue + slot-id helpers.
* [hunt-lifecycle.spec.js](../tests/hunt-lifecycle.spec.js) — `startHunt` / `endHunt` composition.
* [hunt-minimap.spec.js](../tests/hunt-minimap.spec.js) — `minimapData()` denormalisation.
* [save-load-roundtrip.spec.js](../tests/save-load-roundtrip.spec.js) — migration and round-trip coverage for hunt state.
* [e2e/hunt-flow.spec.js](../tests/e2e/hunt-flow.spec.js) — end-to-end CityMap → start → win → witch ectoplasm shop walkthrough; tool functionality, lair-room `isGhostHere`, time advance per click, tarot/paw pickup + Bag carry, dawn-wish run forfeit.
* [hunt-controller.spec.js](../tests/hunt-controller.spec.js) — `setup.HuntController` facade contract.
* [cursed-items-cross-mode.spec.js](../tests/cursed-items-cross-mode.spec.js) — `setup.HuntController` cursed-item facade (`snapGhostToCurrentRoom`, `trapGhost`, `streetExitPassage`, `possessionPassage`, `consumeKnowledgeEvidence`, `banActiveContext`, `isInsideHuntPassage`) plus the hunt start/end shared-state reset.
