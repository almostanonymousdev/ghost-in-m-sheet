# Ghost Hunting Plotline

The core gameplay revolves around investigating haunted locations to identify and document ghosts. Using various equipment (EMF readers, spirit boxes, UV lights, etc.), you gather evidence to determine the ghost's type. Each ghost has unique behaviors, strengths, and weaknesses. The investigation process involves searching rooms, collecting evidence, and managing your sanity and corruption levels. Successfully identifying a ghost allows you to choose how to deal with it, whether that's exorcising it, escaping, or other options depending on the ghost type.

* **Investigation equipment** - Various tools help identify ghost types and behaviors. Each tool produces a specific type of evidence used to narrow down the ghost's identity.
  * [EMFcheck.tw](../passages/haunted_houses/tools/EMFcheck.tw) - EMF reader checks
  * [SpiritboxCheck.tw](../passages/haunted_houses/tools/SpiritboxCheck.tw) - Spirit box checks
  * [UVLcheck.tw](../passages/haunted_houses/tools/UVLcheck.tw) - UV light checks
  * [GWBcheck.tw](../passages/haunted_houses/tools/GWBcheck.tw) - Ghost Writing Book checks
  * [PlasmCheck.tw](../passages/haunted_houses/tools/PlasmCheck.tw) - Plasma/Freezing Temperature checks
  * [Crucifix.tw](../passages/haunted_houses/tools/Crucifix.tw) - Crucifix usage
  * [TarotCards.tw](../passages/haunted_houses/tools/TarotCards.tw) - Tarot card mechanics
  * [temperatureHigh.tw](../passages/haunted_houses/tools/temperatureHigh.tw) - High temperature detection

* **Evidence collection** - Each tool has room-specific search passages for every location in each haunted house. Evidence files track what has been found.
  * [Evidence.tw](../passages/Evidence.tw) - Evidence tracking and display
  * [DeleteEvidence.tw](../passages/DeleteEvidence.tw) - Clearing evidence between hunts
  * [LFCI.tw](../passages/haunted_houses/general/LFCI.tw) - Look For Cursed Items mechanic

* **Hunt flow** - The core loop of starting, running, and ending a ghost hunt.
  * [checkHuntStart.tw](../passages/haunted_houses/hunt/checkHuntStart.tw) - Beginning a hunt
  * [huntEnd.tw](../passages/haunted_houses/hunt/huntEnd.tw) - Ending a hunt normally
  * [HuntOverManual.tw](../passages/haunted_houses/hunt/HuntOverManual.tw) - Manually ending a hunt
  * [HuntOverSanity.tw](../passages/haunted_houses/hunt/HuntOverSanity.tw) - Hunt ending due to sanity loss
  * [HuntOverTime.tw](../passages/haunted_houses/hunt/HuntOverTime.tw) - Hunt ending due to time limit
  * [huntEventSuccubus.tw](../passages/haunted_houses/hunt/huntEventSuccubus.tw) - Succubus hunt event

* **Ghost behavior and randomization** - The ghost type and room are randomized at the start of each hunt and can change during it.
  * [GhostRandomize.tw](../passages/haunted_houses/general/GhostRandomize.tw) - Randomizing ghost type and placement
  * [GhostStreet.tw](../passages/haunted_houses/general/GhostStreet.tw) - Ghost street assignment
  * [changeGhostRoom.tw](../passages/haunted_houses/general/changeGhostRoom.tw) - Ghost changing its favorite room
  * [ghostHuntEvent.tw](../passages/haunted_houses/general/ghostHuntEvent.tw) - Ghost hunt event triggers

* **Sanity and survival mechanics** - Environmental and ghost interactions affect the player's state and can force the hunt to end.
  * [Hide.tw](../passages/haunted_houses/general/Hide.tw) - Hiding from the ghost
  * [RunFast.tw](../passages/haunted_houses/general/RunFast.tw) - Running from the ghost
  * [lightPassageGhost.tw](../passages/haunted_houses/general/lightPassageGhost.tw) - Ghost-controlled lighting
  * [lightPassageManual.tw](../passages/haunted_houses/general/lightPassageManual.tw) - Manual lighting control

* **Clothing and nudity events** - Ghosts can steal clothing during hunts, creating nudity events that affect the exhibitionism system.
  * [stealClothesEvent.tw](../passages/haunted_houses/general/stealClothesEvent.tw) - Ghost stealing clothes event trigger
  * [stealClothes.tw](../passages/haunted_houses/general/stealClothes.tw) - Clothes-stealing mechanics
  * [stealBra.tw](../passages/haunted_houses/general/stealBra.tw) - Bra stolen event
  * [stealPanties.tw](../passages/haunted_houses/general/stealPanties.tw) - Panties stolen event
  * [stealShirt.tw](../passages/haunted_houses/general/stealShirt.tw) - Shirt stolen event
  * [stealBottomOuter.tw](../passages/haunted_houses/general/stealBottomOuter.tw) - Outer bottom stolen event
  * [lostClothes.tw](../passages/haunted_houses/general/lostClothes.tw) - Lost clothing summary
  * [findStolenClothes.tw](../passages/haunted_houses/general/findStolenClothes.tw) - Finding stolen clothes
  * [findStolenBra.tw](../passages/haunted_houses/general/findStolenBra.tw) - Finding stolen bra
  * [findStolenPanties.tw](../passages/haunted_houses/general/findStolenPanties.tw) - Finding stolen panties
  * [findStolenShirt.tw](../passages/haunted_houses/general/findStolenShirt.tw) - Finding stolen shirt
  * [findStolenBottom.tw](../passages/haunted_houses/general/findStolenBottom.tw) - Finding stolen bottom
  * [NudityEvent.tw](../passages/haunted_houses/general/NudityEvent.tw) - Nudity event triggers
  * [NudityEventTwo.tw](../passages/haunted_houses/general/NudityEventTwo.tw) - Second nudity event

* **Haunted house locations** - Four distinct haunted house maps, each with unique room layouts.
  * [Elm_Street.tw](../passages/haunted_houses/elm/Elm_Street.tw) - Elm Street house (two-story residential)
  * [Enigma_Street.tw](../passages/haunted_houses/enigma/Enigma_Street.tw) - Enigma Street house
  * [Ironclad_Prison.tw](../passages/haunted_houses/ironclad/Ironclad_Prison.tw) - Ironclad Prison (cell block layout)
  * [Owaissa_Street.tw](../passages/haunted_houses/owaissa/Owaissa_Street.tw) - Owaissa Street house
  * [MonkeyPaw.tw](../passages/haunted_houses/general/MonkeyPaw.tw) - Monkey's Paw cursed item use
  * [furnitureSearch.tw](../passages/haunted_houses/general/furnitureSearch.tw) - Searching furniture for evidence
  * [furnitureCode.tw](../passages/haunted_houses/general/furnitureCode.tw) - Furniture interaction code logic
