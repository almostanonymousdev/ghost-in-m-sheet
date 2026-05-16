# Witch Plotline

The witch is a mysterious character who sells supernatural items and runs through her own intimate storyline. She lives in a house accessible during specific hours (10 AM to midnight). With the hunt loop unified under a single mode, the witch no longer hands out contracts — her role is the shopkeeper for cursed items and the focal point for her personal events.

* **Witch location and access** - The witch's house is accessible only between 10 AM and midnight (`setup.Witch.isDayTime()` returns true for hours 10–23). Outside these hours, the house appears abandoned or locked, though sneaking in is possible once the MC has stolen her key.
  * [Witch.tw](../passages/witch/Witch.tw) - Witch's house exterior and entry
  * [WitchInside.tw](../passages/witch/WitchInside.tw) - Witch's house interior and main interaction
  * [WitchController.js](../passages/witch/WitchController.js) - `setup.Witch` namespace with hours and access helpers
  * [widgetWitch.tw](../passages/witch/widgetWitch.tw) - Shared witch-related widgets
  * [WitchInsideNight.tw](../passages/witch/WitchInsideNight.tw) - Night-time witch interactions

* **Shop and items** - The witch sells rare supernatural items that can aid ghost hunting or unlock unique content.
  * [WitchSale.tw](../passages/witch/WitchSale.tw) - Witch's item shop and purchases

* **Intimate events** - The witch has unique personal events that unlock as your relationship develops.
  * [WitchBedroom.tw](../passages/witch/WitchBedroom.tw) - Witch bedroom events
  * [WitchInsideMast.tw](../passages/witch/WitchInsideMast.tw) - Witch inside events
  * [WitchTentaclesEvent.tw](../passages/witch/WitchTentaclesEvent.tw) - Witch tentacle summoning event
