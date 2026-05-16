# Ghost Hunting Plotline

The core gameplay revolves around investigating haunted locations to identify and document ghosts. Using various equipment (EMF readers, spirit boxes, UV lights, etc.), you gather evidence to determine the ghost's type. Each ghost has unique behaviors, strengths, and weaknesses. The investigation process involves searching rooms, collecting evidence, and managing your sanity and corruption levels. Successfully identifying a ghost allows you to choose how to deal with it, whether that's exorcising it, escaping, or other options depending on the ghost type.

* **Investigation equipment** - Various tools help identify ghost types and behaviors. Each tool produces a specific type of evidence used to narrow down the ghost's identity. The per-tool check passages (EMFcheck, SpiritboxCheck, UVLcheck/UVLcheckArt, GWBcheck/GWBcheckArt, PlasmCheck/PlasmCheckArt) have been removed entirely — their roll/branch/render logic now lives in the `<<toolCheck>>` macro registered by [ToolController.js](../passages/haunted_houses/tools/ToolController.js), and per-tool metadata (icon, evidence id, crucifix/temperature/tarot overrides, etc.) lives in `setup.searchToolDefs` in [StoryScript.js](../passages/StoryScript.js).
  * [ToolController.js](../passages/haunted_houses/tools/ToolController.js) - Shared roll/branch/render scaffolding for every tool check
  * [TemperatureHigh.tw](../passages/haunted_houses/tools/TemperatureHigh.tw) - High-temperature evidence passage
  * [Crucifix.tw](../passages/haunted_houses/tools/Crucifix.tw) - Crucifix usage
  * [TarotCards.tw](../passages/haunted_houses/tools/TarotCards.tw) - Tarot card mechanics
  * [widgetTarot.tw](../passages/haunted_houses/tools/widgetTarot.tw) - Tarot widget used at hunt start
  * [widgetHauntedHouseRoom.tw](../passages/haunted_houses/tools/widgetHauntedHouseRoom.tw) - Shared per-room search/tool widget
  * [widgetHauntedHouseStreet.tw](../passages/haunted_houses/tools/widgetHauntedHouseStreet.tw) - Shared street/approach widget

* **Evidence collection** - Per-room search is driven by the shared room widget above; evidence files track what has been found. Evidence add/remove (including Mimic disguise rotations) now lives on `setup.Ghost` in [GhostController.js](../passages/ghosts/GhostController.js) rather than a standalone passage.
  * [Evidence.tw](../passages/gui/Evidence.tw) - Evidence tracking and display
  * [GhostController.js](../passages/ghosts/GhostController.js) - `setup.Ghost` namespace; owns per-ghost evidence lists and the shrink/prune logic that used to live in DeleteEvidence
  * [FindCursedItem.tw](../passages/haunted_houses/general/FindCursedItem.tw) - Searching for cursed items in haunted houses

* **Hunt flow** - The core loop of starting, running, and ending a ghost hunt. Per-tick events (light flicker, ghost event, clothes-steal roll, random prowl trigger) and per-step stat drain run through the shared `<<huntTickStep>>` / `<<huntTickEventChain>>` widgets in [widgetInclude.tw](../passages/gui/widgetInclude.tw); hunt nav links and the `<<huntToolBar>>` widget all fire the same chain through `setup.HuntController` predicates (`isHuntActive`, `shouldTriggerSteal`, `shouldStartRandomProwl`, `huntOverPassage`). The legacy `<<includeTimeEventClothesHunt>>` / `<<includeTimeEventHunt>>` widgets are kept as thin aliases for `<<huntTickStep>>`.
  * [HuntController.js](../passages/hunt/HuntController.js) - Hunt facade — owns `isActive()`/`activeGhost()`/`isGhostHere()` and the hunt-over routing helpers
  * [HuntEnd.tw](../passages/haunted_houses/hunt/HuntEnd.tw) - Ending a hunt normally
  * [HuntOverManual.tw](../passages/haunted_houses/hunt/HuntOverManual.tw) - Manually ending a hunt
  * [HuntOverSanity.tw](../passages/haunted_houses/hunt/HuntOverSanity.tw) - Hunt ending due to sanity loss
  * [HuntOverTime.tw](../passages/haunted_houses/hunt/HuntOverTime.tw) - Hunt ending due to time limit
  * [HuntOverExhaustion.tw](../passages/haunted_houses/hunt/HuntOverExhaustion.tw) - Hunt ending due to exhaustion
  * [HuntEventSuccubus.tw](../passages/haunted_houses/hunt/HuntEventSuccubus.tw) - Succubus hunt event

* **Ghost behavior and randomization** - The ghost type is rolled at the start of each hunt from a seed-derived index into `setup.Ghosts.names()`; the spawn room comes from the floor-plan generator. Mid-run room changes are handled by `setup.HuntController.shuffleGhostRoom()` → `setup.HuntController.driftGhostRoom()`.
  * [GhostStreet.tw](../passages/haunted_houses/general/GhostStreet.tw) - Ghost street assignment (entry point for the Hunt card)
  * [GhostHuntEvent.tw](../passages/haunted_houses/general/GhostHuntEvent.tw) - Ghost hunt event triggers
  * [FreezeHunt.tw](../passages/haunted_houses/general/FreezeHunt.tw) - Freeze-state / stall handling during a hunt

* **Sanity and survival mechanics** - Environmental and ghost interactions affect the player's state and can force the hunt to end.
  * [Hide.tw](../passages/haunted_houses/general/Hide.tw) - Hiding from the ghost
  * [RunFast.tw](../passages/haunted_houses/general/RunFast.tw) - Running from the ghost
  * [LightPassageGhost.tw](../passages/haunted_houses/general/LightPassageGhost.tw) - Ghost-controlled lighting (manual light toggles are driven by the `<<addclass>>`/`<<removeclass>>` switch hosted in [StyleController.js](../passages/styles/StyleController.js); no standalone manual-light passage)
  * [FrontDoorLocked.tw](../passages/haunted_houses/general/FrontDoorLocked.tw) - Locked-door / trapped-inside handling
  * [PrayHunt.tw](../passages/haunted_houses/general/PrayHunt.tw) - Praying during a hunt

* **Clothing and nudity events** - Ghosts can steal clothing during hunts, creating nudity events that affect the exhibitionism system. Per-item steal/restore is driven by `setup.Wardrobe.stealWornInGroup` / `restoreStolenInGroup` in [WardrobeController.js](../passages/home/WardrobeController.js).
  * [StealClothes.tw](../passages/haunted_houses/general/StealClothes.tw) - Clothes-stealing entry point (dispatches to the per-slot variants in [stealPassages.tw](../passages/haunted_houses/general/stealPassages.tw))
  * [stealPassages.tw](../passages/haunted_houses/general/stealPassages.tw) - Per-slot steal/restore passage bodies
  * [FindStolenClothes.tw](../passages/haunted_houses/general/FindStolenClothes.tw) - Finding and re-dressing in stolen clothes (calls the `restoreStolenInGroup` helpers for each slot)
  * [NudityEvent.tw](../passages/haunted_houses/general/NudityEvent.tw) - Nudity event triggers
  * [NudityEventTwo.tw](../passages/haunted_houses/general/NudityEventTwo.tw) - Second nudity event

* **Hunt-house plumbing** - The hunt lifecycle composes its floor plan from the catalogues in [passages/hunt/](../passages/hunt/) — see [hunt-mode.md](hunt-mode.md) for the full lifecycle, modifiers, and the witch's ectoplasm storefront. Shared room / cursed-item / monkey-paw plumbing still lives here:
  * [HauntedHousesController.js](../passages/haunted_houses/HauntedHousesController.js) - Shared haunted-house state and helpers (cursed-item placement, prowl roll, drift hooks)
  * [RoomsController.js](../passages/haunted_houses/RoomsController.js) - `setup.Rooms` namespace for per-room state (`byId`, `templateOf`, `isDark`, `setBackground`, `seed`); each room state object carries a `template` field so hunts can mint extra rooms with arbitrary ids
  * [MonkeyPaw.tw](../passages/haunted_houses/general/MonkeyPaw.tw) / [MonkeyPawController.js](../passages/haunted_houses/MonkeyPawController.js) - Monkey's Paw cursed wish item
  * [FurnitureSearch.tw](../passages/haunted_houses/general/FurnitureSearch.tw) - Searching furniture for evidence and stash loot
