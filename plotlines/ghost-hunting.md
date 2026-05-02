# Ghost Hunting Plotline

The core gameplay revolves around investigating haunted locations to identify and document ghosts. Using various equipment (EMF readers, spirit boxes, UV lights, etc.), you gather evidence to determine the ghost's type. Each ghost has unique behaviors, strengths, and weaknesses. The investigation process involves searching rooms, collecting evidence, and managing your sanity and corruption levels. Successfully identifying a ghost allows you to choose how to deal with it, whether that's exorcising it, escaping, or other options depending on the ghost type.

* **Investigation equipment** - Various tools help identify ghost types and behaviors. Each tool produces a specific type of evidence used to narrow down the ghost's identity. The per-tool check passages (EMFcheck, SpiritboxCheck, UVLcheck/UVLcheckArt, GWBcheck/GWBcheckArt, PlasmCheck/PlasmCheckArt) have been removed entirely — their roll/branch/render logic now lives in the `<<toolCheck>>` macro registered by [ToolController.tw](../passages/haunted_houses/tools/ToolController.tw), and per-tool metadata (icon, evidence id, crucifix/temperature/tarot overrides, etc.) lives in `setup.searchToolDefs` in [StoryScript.tw](../passages/StoryScript.tw).
  * [ToolController.tw](../passages/haunted_houses/tools/ToolController.tw) - Shared roll/branch/render scaffolding for every tool check
  * [TemperatureHigh.tw](../passages/haunted_houses/tools/TemperatureHigh.tw) - High-temperature evidence passage
  * [Crucifix.tw](../passages/haunted_houses/tools/Crucifix.tw) - Crucifix usage
  * [TarotCards.tw](../passages/haunted_houses/tools/TarotCards.tw) - Tarot card mechanics
  * [widgetTarot.tw](../passages/haunted_houses/tools/widgetTarot.tw) - Tarot widget used at hunt start
  * [widgetHauntedHouseRoom.tw](../passages/haunted_houses/tools/widgetHauntedHouseRoom.tw) - Shared per-room search/tool widget
  * [widgetHauntedHouseStreet.tw](../passages/haunted_houses/tools/widgetHauntedHouseStreet.tw) - Shared street/approach widget

* **Evidence collection** - Per-room search is driven by the shared room widget above; evidence files track what has been found. Evidence add/remove (including Mimic disguise rotations) now lives on `setup.Ghost` in [GhostController.tw](../passages/ghosts/GhostController.tw) rather than a standalone passage.
  * [Evidence.tw](../passages/gui/Evidence.tw) - Evidence tracking and display
  * [GhostController.tw](../passages/ghosts/GhostController.tw) - `setup.Ghost` namespace; owns per-ghost evidence lists and the shrink/prune logic that used to live in DeleteEvidence
  * [FindCursedItem.tw](../passages/haunted_houses/general/FindCursedItem.tw) - Searching for cursed items in haunted houses

* **Hunt flow** - The core loop of starting, running, and ending a ghost hunt. Per-tick events (light flicker, ghost event, clothes-steal roll, random prowl trigger) and per-step stat drain run through the shared `<<huntTickStep>>` / `<<huntTickEventChain>>` widgets in [widgetInclude.tw](../passages/gui/widgetInclude.tw); both classic nav/tool clicks and the rogue-mode toolbar/nav fire the same chain, with mode-specific branching dispatched via `setup.HuntController` predicates (`isHuntActive`, `isCursedHuntActive`, `shouldTriggerSteal`, `shouldStartRandomProwl`, `huntOverPassage`). The legacy `<<includeTimeEventClothesHunt>>` / `<<includeTimeEventHunt>>` widgets are kept as thin aliases for `<<huntTickStep>>`.
  * [CheckHuntStart.tw](../passages/haunted_houses/hunt/CheckHuntStart.tw) - Beginning a hunt
  * [HuntEnd.tw](../passages/haunted_houses/hunt/HuntEnd.tw) - Ending a hunt normally
  * [HuntOverManual.tw](../passages/haunted_houses/hunt/HuntOverManual.tw) - Manually ending a hunt
  * [HuntOverSanity.tw](../passages/haunted_houses/hunt/HuntOverSanity.tw) - Hunt ending due to sanity loss
  * [HuntOverTime.tw](../passages/haunted_houses/hunt/HuntOverTime.tw) - Hunt ending due to time limit
  * [HuntOverExhaustion.tw](../passages/haunted_houses/hunt/HuntOverExhaustion.tw) - Hunt ending due to exhaustion
  * [HuntEventSuccubus.tw](../passages/haunted_houses/hunt/HuntEventSuccubus.tw) - Succubus hunt event

* **Ghost behavior and randomization** - The ghost type and room are randomized at the start of each hunt and can change during it. Mid-hunt room changes are handled by `setup.HauntedHouses` / `setup.Ghost` helpers (no standalone ChangeGhostRoom passage).
  * [GhostRandomize.tw](../passages/haunted_houses/general/GhostRandomize.tw) - Randomizing ghost type and placement
  * [GhostStreet.tw](../passages/haunted_houses/general/GhostStreet.tw) - Ghost street assignment
  * [GhostHuntEvent.tw](../passages/haunted_houses/general/GhostHuntEvent.tw) - Ghost hunt event triggers
  * [FreezeHunt.tw](../passages/haunted_houses/general/FreezeHunt.tw) - Freeze-state / stall handling during a hunt

* **Sanity and survival mechanics** - Environmental and ghost interactions affect the player's state and can force the hunt to end.
  * [Hide.tw](../passages/haunted_houses/general/Hide.tw) - Hiding from the ghost
  * [RunFast.tw](../passages/haunted_houses/general/RunFast.tw) - Running from the ghost
  * [LightPassageGhost.tw](../passages/haunted_houses/general/LightPassageGhost.tw) - Ghost-controlled lighting (manual light toggles are driven by the `<<addclass>>`/`<<removeclass>>` switch hosted in [StyleController.tw](../passages/styles/StyleController.tw); no standalone manual-light passage)
  * [FrontDoorLocked.tw](../passages/haunted_houses/general/FrontDoorLocked.tw) - Locked-door / trapped-inside handling
  * [PrayHunt.tw](../passages/haunted_houses/general/PrayHunt.tw) - Praying during a hunt

* **Clothing and nudity events** - Ghosts can steal clothing during hunts, creating nudity events that affect the exhibitionism system. Per-item steal/restore is now driven by `setup.Wardrobe.stealWornInGroup` / `restoreStolenInGroup` in [WardrobeController.tw](../passages/home/WardrobeController.tw), so the previous StealShirt / FindStolenBra / FindStolenPanties / FindStolenShirt / FindStolenBottom / LostClothes passages are gone.
  * [StealClothesEvent.tw](../passages/haunted_houses/general/StealClothesEvent.tw) - Ghost stealing clothes event trigger
  * [StealClothes.tw](../passages/haunted_houses/general/StealClothes.tw) - Clothes-stealing mechanics (dispatches to StealPanties / StealBra / StealBottomOuter or the inline shirt helper)
  * [StealBra.tw](../passages/haunted_houses/general/StealBra.tw) - Bra stolen event
  * [StealPanties.tw](../passages/haunted_houses/general/StealPanties.tw) - Panties stolen event
  * [StealBottomOuter.tw](../passages/haunted_houses/general/StealBottomOuter.tw) - Outer bottom stolen event
  * [FindStolenClothes.tw](../passages/haunted_houses/general/FindStolenClothes.tw) - Finding and re-dressing in stolen clothes (calls the `restoreStolenInGroup` helpers for each slot)
  * [NudityEvent.tw](../passages/haunted_houses/general/NudityEvent.tw) - Nudity event triggers
  * [NudityEventTwo.tw](../passages/haunted_houses/general/NudityEventTwo.tw) - Second nudity event

* **Haunted house locations** - Four distinct haunted house maps, each with unique room layouts. Each house has a street-entry passage and a shared `*_rooms.tw` include for the per-room content rendered via the shared room widget.
  * [HauntedHousesController.tw](../passages/haunted_houses/HauntedHousesController.tw) - Shared haunted-house state and helpers
  * [RoomsController.tw](../passages/haunted_houses/RoomsController.tw) - `setup.Rooms` namespace for per-room state (`byId`, `templateOf`, `isDark`, `setBackground`, `seed`); each room state object carries a `template` field so rogue runs can mint extra rooms with arbitrary ids
  * [Elm_Street.tw](../passages/haunted_houses/elm/Elm_Street.tw) / [elm_rooms.tw](../passages/haunted_houses/elm/elm_rooms.tw) - Elm Street house (two-story residential)
  * [Enigma_Street.tw](../passages/haunted_houses/enigma/Enigma_Street.tw) / [enigma_rooms.tw](../passages/haunted_houses/enigma/enigma_rooms.tw) - Enigma Street house
  * [Ironclad_Prison.tw](../passages/haunted_houses/ironclad/Ironclad_Prison.tw) / [ironclad_rooms.tw](../passages/haunted_houses/ironclad/ironclad_rooms.tw) - Ironclad Prison (cell block layout)
  * [Owaissa_Street.tw](../passages/haunted_houses/owaissa/Owaissa_Street.tw) / [owaissa_rooms.tw](../passages/haunted_houses/owaissa/owaissa_rooms.tw) - Owaissa Street house
  * [MonkeyPaw.tw](../passages/haunted_houses/general/MonkeyPaw.tw) / [MonkeyPawController.tw](../passages/haunted_houses/MonkeyPawController.tw) - Monkey's Paw cursed wish item
  * [FurnitureSearch.tw](../passages/haunted_houses/general/FurnitureSearch.tw) - Searching furniture for evidence (per-house furniture-stash distribution is driven by `setup.HauntedHouses.distributeFurnitureStashes()` via the `runsFurnitureCode` flag in [HauntedHousesController.tw](../passages/haunted_houses/HauntedHousesController.tw); no standalone FurnitureCode passage)
