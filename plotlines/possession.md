# Possession Plotline

Ghost possession is a dangerous mechanic that can occur during hunts. When possessed, your character's behavior and appearance change, and you may experience hallucinations or other supernatural effects. The possession system includes multiple stages and can lead to special events depending on the ghost type and your actions. Some companions have specific responses to possession events, and there are mechanics for treating or recovering from possession. The possession plotline adds tension and risk to the ghost hunting experience.

* **Core possession mechanics** - The main possession system that handles becoming possessed and the resulting state.
  * [possessed.tw](../passages/posession/possessed.tw) - Main possession state and effects
  * [PosessionController.js](../passages/posession/PosessionController.js) - Shared possession state and helpers

* **Possession locations** - Possession events that trigger based on where the player is during a hunt.
  * [possessedLocation.tw](../passages/posession/possessedLocation.tw) - Location-based possession event entry
  * [possessedLocation1.tw](../passages/posession/possessedLocation1.tw) - First stage location possession
  * [possessedLocation2.tw](../passages/posession/possessedLocation2.tw) - Second stage location possession
  * [Hot.tw](../passages/posession/Hot.tw) / [Hot1.tw](../passages/posession/Hot1.tw) - Overheating possession-adjacent event
  * [Mimic.tw](../passages/posession/Mimic.tw) - Mimic possession-adjacent event

* **Companion-specific possession** - Brook has unique possession scenarios, including one that occurs at the church. Blake has a spirit-themed possession scene.
  * [PossessedBrooke.tw](../passages/posession/PossessedBrooke.tw) - Brook's possession event during hunts
  * [PossessedBrookeChurch.tw](../passages/posession/PossessedBrookeChurch.tw) - Brook's possession event at the church (unused)
  * [spiritBlake.tw](../passages/posession/spiritBlake.tw) - Blake's spirit-possession scene

* **Possession during rescue** - Missing women can be possessed during rescue missions, requiring specific handling to save them. See [missing-women.md](missing-women.md) for the full list of rescue possession passages.
  * [RescuePossessed.tw](../passages/missing_women/RescuePossessed.tw) - General rescue possession mechanics

* **City map while possessed** - The city map changes appearance when the player is in a possessed state.
  * [CityMapPossessed.tw](../passages/posession/CityMapPossessed.tw) - City navigation while possessed

* **The Twins possession at home** - The Twins can appear during sleep at home, triggering unique dual-entity possession events.
  * [TheTwinsEvent.tw](../passages/home/TheTwinsEvent.tw) - The Twins home event
  * [SleepTwins.tw](../passages/home/SleepTwins.tw) - Sleeping encounter with The Twins

* **Summoning possession at home** - The player can summon spirits at home that cause possession-adjacent events.
  * [Summoning.tw](../passages/home/summoning/Summoning.tw) - Home summoning ritual
  * [SummoningStart.tw](../passages/home/summoning/SummoningStart.tw) - Starting the summoning ritual
  * [SummonMare.tw](../passages/home/summoning/SummonMare.tw) - Summoning the Mare
  * [SummonSpirit.tw](../passages/home/summoning/SummonSpirit.tw) - Summoning a spirit
  * [SummonTentacles.tw](../passages/home/summoning/SummonTentacles.tw) - Summoning tentacles
  * [SummonTwins.tw](../passages/home/summoning/SummonTwins.tw) - Summoning the twins
  * [SuccubusChoice.tw](../passages/home/summoning/SuccubusChoice.tw) - Succubus summoning choices
