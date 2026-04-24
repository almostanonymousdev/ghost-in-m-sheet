# Witch Contract Plotline

The witch is a mysterious character who offers contracts and special items. You can visit her house during specific hours (10 AM to midnight) to interact with her. The witch provides quests for finding cursed items and other supernatural objects. Completing her contracts can grant powerful benefits but may come with risks or consequences. The witch also has her own unique storyline that unfolds as you progress through her quests and develop a relationship with her.

* **Witch location and access** - The witch's house is accessible only between 10 AM and midnight (`setup.Witch.isDayTime()` returns true for hours 10–23). Outside these hours, the house appears abandoned or locked, though sneaking in is possible once the MC has stolen her key.
  * [Witch.tw](../passages/witch/Witch.tw) - Witch's house exterior and entry
  * [WitchInside.tw](../passages/witch/WitchInside.tw) - Witch's house interior and main interaction
  * [WitchController.tw](../passages/witch/WitchController.tw) - `setup.Witch` namespace with hours, contract, and access helpers
  * [widgetWitch.tw](../passages/witch/widgetWitch.tw) - Shared witch-related widgets

* **Contract system** - The witch offers contracts for finding specific cursed items, rare artifacts, or performing supernatural tasks. Each contract has unique requirements and rewards.
  * [WitchEndContract.tw](../passages/witch/WitchEndContract.tw) - Contract completion and outcomes
  * [WitchInsideNight.tw](../passages/witch/WitchInsideNight.tw) - Night-time witch interactions

* **Shop and items** - The witch sells rare supernatural items that can aid ghost hunting or unlock unique content.
  * [WitchSale.tw](../passages/witch/WitchSale.tw) - Witch's item shop and purchases

* **Intimate events** - The witch has unique personal events that unlock as your relationship develops.
  * [WitchBedroom.tw](../passages/witch/WitchBedroom.tw) - Witch bedroom events
  * [WitchInsideMast.tw](../passages/witch/WitchInsideMast.tw) - Witch inside events
  * [WitchTentaclesEvent.tw](../passages/witch/WitchTentaclesEvent.tw) - Witch tentacle summoning event

* **Cursed hunt** - The witch can initiate cursed hunt scenarios through items purchased from her shop.
  * [CursedHunt.tw](../passages/haunted_houses/tools/CursedHunt.tw) - Cursed hunt mechanics triggered by witch items
  * [CursedHuntStart.tw](../passages/haunted_houses/general/CursedHuntStart.tw) - Starting a cursed hunt
  * [UseCursedItem.tw](../passages/haunted_houses/general/UseCursedItem.tw) - Using cursed items during hunts
