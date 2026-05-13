# Rogue Mode

The hunt loop. Each rogue run rolls a fresh haunted house from a
deterministic seed: the floor plan, the active modifiers, and the
stash placements all change between runs. A small set of static
houses (Owaissa, Elm, Ironclad) ride the same lifecycle but skip
the floor-plan roll and substitute their authored template.
Ectoplasm (measured in mL) carries forward from one run to the next
and is spent in the meta-shop on persistent unlocks.

`setup.Rogue.isRogue()` is the canonical "a run is in flight"
predicate; `$run` is `null` whenever no run is active.

## Lifecycle

A rogue run flows through four passages. The entry point is the
**Rogue Hunt** card on
[GhostStreet](../passages/haunted_houses/general/GhostStreet.tw),
via the [`<<rogueHuntCard>>`](../passages/haunted_houses/tools/widgetHauntedHouseStreet.tw)
widget. There is no "resume" — once you start a run, you either
finish it (Win / Lose / Abandon from RogueRun) or forfeit it by
walking back into RogueStart, which counts the unfinished run as
a failure before rolling fresh.

* **[RogueStart](../passages/rogue/RogueLifecycle.tw)** — entry point.
  If the player walks in with an in-flight run on `$run`, that
  run is auto-failed via `setup.Rogue.endRogue(false)` first (paying
  the failure-rate ectoplasm, no resume). Then rolls a fresh seed
  (or accepts an explicit one), drafts the modifier deck,
  generates the floor plan, and stamps `$run`. Shows the player
  the modifier list and the floor plan before they commit.
  `setup.Rogue.startRogue({ seed, staticHouseId })` does the actual
  composition; passing a `staticHouseId` from the
  [`setup.RogueHouses`](../passages/rogue/RogueHousesController.tw)
  catalogue substitutes the authored plan for the procedural roll.
* **[RogueRun](../passages/rogue/RogueLifecycle.tw)** — in-progress
  view. The SVG minimap
  ([`<<rogueMinimap>>`](../passages/rogue/widgetRogueMinimap.tw)
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
  (see [Hunt facade](#hunt-facade) for how rogue runs plug into
  that machinery).
* **[RogueEnd](../passages/rogue/RogueLifecycle.tw)** — result
  screen. `setup.Rogue.endRogue(success)` clears `$run` and pays out
  ectoplasm (5 mL base + 5 mL if successful + 1 mL per active
  modifier). The player can chain straight into a fresh run via
  "Start a new hunt" (re-enters `RogueStart`), spend ectoplasm in the
  meta-shop, or fall back to the city.
* **[RogueMetaShop](../passages/rogue/RogueLifecycle.tw)** —
  ectoplasm-spending storefront. Currently exposes a placeholder
  3 mL unlock; specific unlocks (extra modifier reroll, starting
  tool, companion at run start, etc.) land alongside their
  gameplay hooks.

## State shape

Run-level state lives on `$run` and meta-progression state on
`$ectoplasm` / `$runsStarted`. Both are owned by
[`setup.Rogue`](../passages/rogue/RogueController.tw).

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
  staticHouseId,  // null for procedural runs, RogueHouses id otherwise
  trapped,        // true when a Monkey Paw wish has frozen the lair
  exitLock        // matching exit-lock target on trap
}

$ectoplasm     // persistent meta-progression currency, in mL
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

Hunting tools the player would otherwise be missing from the
toolbar (Empty Bag modifier, restricted `loadout.tools`) get
seeded into the floor plan as `tool_<id>` loot when
`opts.toolKinds` is provided. Each one is forced onto a
furniture-bearing room and pinned to a distinct slot (same
machinery as tarot / monkey paw), so the player can recover the
kit by exploring. `setup.Rogue.startRogue` computes the missing
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
[`setup.Templates`](../passages/rogue/TemplatesController.tw)
(`kitchen`, `bathroom`, `bedroom`, `livingroom`, `nursery`,
`basement`, `attic`, `dining-room`, `sauna`, `sex-dungeon`,
`walk-in-closet`). Static-house templates (Ironclad cells, Elm's
nursery, the Enigma trio) stay catalogue-only and don't roll
into the procedural pool.

## Hunt facade

The tool / evidence / event stack all reads through
[`setup.HuntController`](../passages/hunt/HuntController.tw), so
passages and widgets never branch on rogue-vs-not internally —
they just call the facade and let it return the right thing for
the current run state:

* `isActive()` / `isRogueActive()` — true iff a rogue run is in
  flight. The two names coexist so dispatch sites can read the
  way they want; both delegate to the same check.
* `activeGhost()` — the catalogue Ghost named in `$run.ghostName`,
  with any per-run evidence override (e.g. Fog of War) overlaid.
  Returns `null` when no run is active.
* `realGhostName()` — `$run.ghostName` or `''`. Used by the cheat
  panel and journal reveals.
* `isGhostHere(houses)` — true iff the player is in the ghost's
  room. Compares `$run.currentRoomId` against
  `floorplan.spawnRoomId` and only fires inside the `RogueRun`
  passage. The optional `houses` filter is silently ignored —
  rogue runs aren't house-specific.
* `isHuntActive()` — gates the per-tick chain. Run is in flight
  AND the player is on the `RogueRun` passage.
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
  the reason and returns `RogueEnd`. Also called by
  `FreezeHunt`'s "Surrender to the cold" link so the
  no-clothes-left branch ends the run cleanly.
* `huntCaughtPassage()` — stamps a `caught` failure on the run
  and returns `RogueEnd`. The High-Priestess tarot override (a
  draw that lets the MC walk away from a catch) is handled
  inside the widget, so the helper isn't reached when the
  priestess is in play.
* `onCaughtCleanup()` — wardrobe / companion / tool-timer reset.
  The matching `$run` cleanup is deferred to
  `setup.Rogue.endRogue`, fired when the player clicks the
  huntEndExit link through to `RogueEnd`.
* `shuffleGhostRoom()` — periodic ghost-room drift. Owns the
  shared 20-minute interval gate and the 45% roll, then
  dispatches to `setup.Rogue.driftGhostRoom` for the actual
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
  `RogueEnd` (the run forfeits) and bans nothing.
* `possessionPassage()` — used by the Tarot Possession card.
  Stamps a `possessed` failure on the run and routes to
  `RogueEnd`.
* `consumeKnowledgeEvidence()` — used by the Tarot Knowledge
  card and the Monkey Paw knowledge wish. Picks a random
  evidence the ghost doesn't have and stamps it on
  `$chosenEvidence`. Marks `$knowledgeUsed` so a second draw
  is a no-op.
* `isInsideHuntPassage()` — Bag carry-link gate. True iff
  `previous(1)` is `RogueRun`, so the tarot deck and monkey paw
  don't appear in Bag from the city or rogue lobby.

`setup.Ghosts.active()` and `setup.isGhostHere()` are thin
adapters that delegate to the facade. The rogue ghost is rolled
in `setup.Rogue.startRogue()` from a seed-derived index into
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

The rogue nav links in `RogueRun` and the `<<rogueToolBar>>`
widget all call `<<huntTickStep>>`. Enigma is the only chain
that doesn't go through this stack — it has its own
LightPassageGhost + EventArt loop.

`<<includeTimeEventClothesHunt>>` and `<<includeTimeEventHunt>>`
are thin aliases for `<<huntTickStep>>` so existing call sites
keep working without churn.

## Modifier registry

[`setup.Modifiers`](../passages/rogue/ModifiersController.tw)
catalogues every run modifier with a draft weight; weight 0
keeps a modifier out of the random draw (reserved for meta-shop
unlocks, debug, etc.). `setup.Modifiers.draft(seed, n)` does a
seeded weighted no-replacement draw.

Modifiers in the catalogue today: Empty Bag (locked tools)
and Ghost Pheromones (+1 lust/step in-house). The catalogue
deliberately tracks only modifiers with real effect wiring —
catalogue-only entries that ship to the run-start UI but do
nothing in-game make for a bait-and-switch draft, so new ideas
live in this doc until their effect is wired into the relevant
controller. Querying the active deck goes through
`setup.Rogue.hasModifier(id)`.

## Ectoplasm (meta-progression, mL)

Earned at run end via `setup.Rogue.addEctoplasm(n)` or
`setup.Rogue.endRogue(success)` (which composes the standard
payout). Spent through `setup.Rogue.spendEctoplasm(n)` (returns
`false` if the player can't afford it; no partial deductions).
`setup.Rogue.canAffordEctoplasm(n)` is the predicate the storefront
links use to decide whether to render an unlock as active.

## File map

* [RogueController.tw](../passages/rogue/RogueController.tw) — `setup.Rogue`: lifecycle, accessors, ectoplasm, composition (`startRogue`/`endRogue`), `minimapData()` / `minimapSvg()` / `currentRoomData()`, and current-room nav (`currentRoomId` / `setCurrentRoom`).
* [FloorPlanController.tw](../passages/rogue/FloorPlanController.tw) — `setup.FloorPlan`: seeded generator, neighbour / connectivity helpers, BFS layout for the minimap.
* [ModifiersController.tw](../passages/rogue/ModifiersController.tw) — `setup.Modifiers`: catalogue + weighted draft.
* [TemplatesController.tw](../passages/rogue/TemplatesController.tw) — `setup.Templates`: room-template metadata + slot-id helpers.
* [RogueHousesController.tw](../passages/rogue/RogueHousesController.tw) — `setup.RogueHouses`: static-house catalogue (Owaissa / Elm / Ironclad) with authored floor plans and per-house overrides.
* [RogueLifecycle.tw](../passages/rogue/RogueLifecycle.tw) — `RogueStart`, `RogueRun`, `RogueEnd`, `RogueMetaShop` passages.
* [widgetRogueMinimap.tw](../passages/rogue/widgetRogueMinimap.tw) — `<<rogueMinimap>>` SVG floor-plan view.
* [widgetRogueToolBar.tw](../passages/rogue/widgetRogueToolBar.tw) — `<<rogueToolBar>>` tool grid; renders one card per `setup.Rogue.startingTools()` entry (default = all six). Empty Bag (`locked_tools`) collapses the strip to a "your bag is empty" placeholder; `loadout.tools` filters to a subset while preserving canonical order. Tools the player picks up from `tool_<id>` furniture loot get unioned back in, so a started-empty bag fills back in as the player searches the rooms.
* [HuntController.tw](../passages/hunt/HuntController.tw) — `setup.HuntController`: hunt facade for `isActive()` / `activeGhost()` / `isGhostHere()` and the lifecycle-routing helpers.

## Save migration

`$run`, `$ectoplasm`, and `$runsStarted` are seeded on legacy saves
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
* [e2e/rogue-flow.spec.js](../tests/e2e/rogue-flow.spec.js) — end-to-end CityMap → start → win → meta-shop walkthrough; tool functionality, lair-room `isGhostHere`, time advance per click, tarot/paw pickup + Bag carry, dawn-wish run forfeit.
* [hunt-controller.spec.js](../tests/hunt-controller.spec.js) — `setup.HuntController` facade contract.
* [cursed-items-cross-mode.spec.js](../tests/cursed-items-cross-mode.spec.js) — `setup.HuntController` cursed-item facade (`snapGhostToCurrentRoom`, `trapGhost`, `streetExitPassage`, `possessionPassage`, `consumeKnowledgeEvidence`, `banActiveContext`, `isInsideHuntPassage`) plus the rogue start/end shared-state reset.
