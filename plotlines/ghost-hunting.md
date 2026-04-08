# Ghost Hunting Plotline

The core gameplay revolves around investigating haunted locations to identify and document ghosts. Using various equipment (EMF readers, spirit boxes, UV lights, etc.), you gather evidence to determine the ghost's type. Each ghost has unique behaviors, strengths, and weaknesses. The investigation process involves searching rooms, collecting evidence, and managing your sanity and corruption levels. Successfully identifying a ghost allows you to choose how to deal with it, whether that's exorcising it, escaping, or other options depending on the ghost type.

* **Investigation equipment** - Various tools help identify ghost types and behaviors. Each tool produces a specific type of evidence used to narrow down the ghost's identity.
  * [EMFcheck__nobr.tw](../passages/haunted_houses/tools/EMFcheck__nobr.tw) - EMF reader checks
  * [SpiritboxCheck.tw](../passages/haunted_houses/tools/SpiritboxCheck.tw) - Spirit box checks
  * [UVLcheck.tw](../passages/haunted_houses/tools/UVLcheck.tw) - UV light checks
  * [GWBcheck.tw](../passages/haunted_houses/tools/GWBcheck.tw) - Ghost Writing Book checks
  * [PlasmCheck.tw](../passages/haunted_houses/tools/PlasmCheck.tw) - Plasma/Freezing Temperature checks
  * [Crucifix__noreturn.tw](../passages/haunted_houses/tools/Crucifix__noreturn.tw) - Crucifix usage
  * [TarotCards__nobr_noreturn.tw](../passages/haunted_houses/tools/TarotCards__nobr_noreturn.tw) - Tarot card mechanics
  * [temperatureHigh.tw](../passages/haunted_houses/tools/temperatureHigh.tw) - High temperature detection

* **Evidence collection** - Each tool has room-specific search passages for every location in each haunted house. Evidence files track what has been found.
  * [Evidence.tw](../passages/Evidence.tw) - Evidence tracking and display
  * [DeleteEvidence__nobr.tw](../passages/DeleteEvidence__nobr.tw) - Clearing evidence between hunts
  * [LFCI.tw](../passages/haunted_houses/general/LFCI.tw) - Look For Cursed Items mechanic

* **Hunt flow** - The core loop of starting, running, and ending a ghost hunt.
  * [huntStart__noreturn.tw](../passages/haunted_houses/hunt/huntStart__noreturn.tw) - Beginning a hunt
  * [huntEnd__noreturn.tw](../passages/haunted_houses/hunt/huntEnd__noreturn.tw) - Ending a hunt normally
  * [HuntOverManual.tw](../passages/haunted_houses/hunt/HuntOverManual.tw) - Manually ending a hunt
  * [HuntOverSanity__noreturn.tw](../passages/haunted_houses/hunt/HuntOverSanity__noreturn.tw) - Hunt ending due to sanity loss
  * [HuntOverTime.tw](../passages/haunted_houses/hunt/HuntOverTime.tw) - Hunt ending due to time limit
  * [huntEventSuccubus__nobr_noreturn.tw](../passages/haunted_houses/hunt/huntEventSuccubus__nobr_noreturn.tw) - Succubus hunt event

* **Ghost behavior and randomization** - The ghost type and room are randomized at the start of each hunt and can change during it.
  * [GhostRandomize__event.tw](../passages/haunted_houses/general/GhostRandomize__event.tw) - Randomizing ghost type and placement
  * [GhostStreet__ghoststreet.tw](../passages/haunted_houses/general/GhostStreet__ghoststreet.tw) - Ghost street assignment
  * [changeGhostRoom.tw](../passages/haunted_houses/general/changeGhostRoom.tw) - Ghost changing its favorite room
  * [ghostHuntEvent__noreturn.tw](../passages/haunted_houses/general/ghostHuntEvent__noreturn.tw) - Ghost hunt event triggers

* **Sanity and survival mechanics** - Environmental and ghost interactions affect the player's state and can force the hunt to end.
  * [Hide__noreturn.tw](../passages/haunted_houses/general/Hide__noreturn.tw) - Hiding from the ghost
  * [RunFast__noreturn.tw](../passages/haunted_houses/general/RunFast__noreturn.tw) - Running from the ghost
  * [lightPassageGhost.tw](../passages/haunted_houses/general/lightPassageGhost.tw) - Ghost-controlled lighting
  * [lightPassageManual.tw](../passages/haunted_houses/general/lightPassageManual.tw) - Manual lighting control

* **Clothing and nudity events** - Ghosts can steal clothing during hunts, creating nudity events that affect the exhibitionism system.
  * [stealClothesEvent__nobr.tw](../passages/haunted_houses/general/stealClothesEvent__nobr.tw) - Ghost stealing clothes event trigger
  * [stealClothes__nobr_noreturn.tw](../passages/haunted_houses/general/stealClothes__nobr_noreturn.tw) - Clothes-stealing mechanics
  * [stealBra__nobr.tw](../passages/haunted_houses/general/stealBra__nobr.tw) - Bra stolen event
  * [stealPanties__nobr.tw](../passages/haunted_houses/general/stealPanties__nobr.tw) - Panties stolen event
  * [stealShirt__nobr.tw](../passages/haunted_houses/general/stealShirt__nobr.tw) - Shirt stolen event
  * [stealBottomOuter__nobr.tw](../passages/haunted_houses/general/stealBottomOuter__nobr.tw) - Outer bottom stolen event
  * [lostClothes__nobr.tw](../passages/haunted_houses/general/lostClothes__nobr.tw) - Lost clothing summary
  * [findStolenClothes__nobr.tw](../passages/haunted_houses/general/findStolenClothes__nobr.tw) - Finding stolen clothes
  * [NudityEvent__nobr.tw](../passages/haunted_houses/general/NudityEvent__nobr.tw) - Nudity event triggers
  * [NudityEventTwo__nobr.tw](../passages/haunted_houses/general/NudityEventTwo__nobr.tw) - Second nudity event

* **Haunted house locations** - Four distinct haunted house maps, each with unique room layouts.
  * [Elm_Street.tw](../passages/haunted_houses/elm/Elm_Street.tw) - Elm Street house (two-story residential)
  * [Enigma_Street.tw](../passages/haunted_houses/enigma/Enigma_Street.tw) - Enigma Street house
  * [Ironclad_Prison.tw](../passages/haunted_houses/ironclad/Ironclad_Prison.tw) - Ironclad Prison (cell block layout)
  * [Owaissa_Street.tw](../passages/haunted_houses/owaissa/Owaissa_Street.tw) - Owaissa Street house
  * [MonkeyPaw__nobr_noreturn.tw](../passages/haunted_houses/general/MonkeyPaw__nobr_noreturn.tw) - Monkey's Paw cursed item use
  * [furnitureSearch__nobr_noreturn.tw](../passages/haunted_houses/general/furnitureSearch__nobr_noreturn.tw) - Searching furniture for evidence
