# Missing Women Rescue Plotline

This plotline involves rescuing missing women (Victoria, Julia, Jade, Nadia, and Ash) who have been taken by ghosts. The process begins at the church where you can take missing posters for these women. Each rescue mission requires you to locate their haunted house, investigate the ghost, and complete specific objectives to rescue the woman. The rescue missions have multiple stages and can involve ghost encounters, possession events, and special rescue scenarios. Successfully rescuing a woman completes her storyline and may unlock additional content.

* **Rescue system** - Starting at age 18, you can take missing posters from the church for random women from a pool of five candidates. Each rescue quest appears only once per day.
  * [rescueTaskBoard.tw](../passages/missing_women/rescueTaskBoard.tw) - Task board where you take missing posters
  * [SuburbMap.tw](../passages/gui/SuburbMap.tw) - Shared map of the suburb used by both the rescue and delivery quests; branches on `$suburbMapMode` ("rescue" or "delivery")
  * [rescueHouse.tw](../passages/missing_women/rescueHouse.tw) - Rescue house locations (shows the selected street + house number)
  * randomizeRescueHouse passage is now in [widgetRescue.tw](../passages/missing_women/widgetRescue.tw)
  * Rescue house roster (16 houses across 6 streets) is defined in [StoryInit.tw](../passages/StoryInit.tw) as `setup.rescueStreets`, `setup.rescueHouses`, `setup.rescueHouseById`, and `setup.rescueHouseByAddress`. The delivery hub reuses the same addresses via `setup.deliveryHouses` / `setup.deliveryStreets`.
  * Streets: Maple Street, Oak Avenue, Pine Road, Birch Lane, Willow Court, Cedar Drive

* **Multi-stage rescue process** - Each rescue involves finding the haunted location, investigating the ghost, completing specific objectives, and surviving ghost encounters. Some rescues have multiple stages with possession events and dangerous situations.
  * [rescueAsh.tw](../passages/missing_women/rescueAsh.tw) - Ash's rescue mission
  * [rescueJulia.tw](../passages/missing_women/rescueJulia.tw) - Julia's rescue mission
  * [rescueJade.tw](../passages/missing_women/rescueJade.tw) - Jade's rescue mission
  * [rescueNadia.tw](../passages/missing_women/rescueNadia.tw) - Nadia's rescue mission
  * [rescueVictoria.tw](../passages/missing_women/rescueVictoria.tw) - Victoria's rescue mission
  * [rescueSuccess.tw](../passages/missing_women/rescueSuccess.tw) - Successful rescue outcomes
  * [rescueStay.tw](../passages/missing_women/rescueStay.tw) - Staying at rescue locations
  * [rescueClueFound.tw](../passages/missing_women/rescueClueFound.tw) - Finding clues during rescue
  * [rescueEvent.tw](../passages/missing_women/rescueEvent.tw) - Rescue event triggers

* **Possession during rescue** - Some rescue scenarios involve the missing woman being possessed by the ghost, requiring special handling to save her safely. This can lead to intense possession events with sexual or sensual content.
  * [rescuePossessed.tw](../passages/missing_women/rescuePossessed.tw) - General possession rescue mechanics
  * [rescueAshPossessed.tw](../passages/missing_women/rescueAshPossessed.tw) - Ash's possession rescue
  * [rescueAshPossessed1.tw](../passages/missing_women/rescueAshPossessed1.tw) - Ash's first possession stage
  * [rescueAshPossessed2.tw](../passages/missing_women/rescueAshPossessed2.tw) - Ash's second possession stage
  * [rescueJuliaPossessed.tw](../passages/missing_women/rescueJuliaPossessed.tw) - Julia's possession rescue
  * [rescueJuliaPossessed1.tw](../passages/missing_women/rescueJuliaPossessed1.tw) - Julia's first possession stage
  * [rescueJuliaPossessed2.tw](../passages/missing_women/rescueJuliaPossessed2.tw) - Julia's second possession stage
  * [rescueJuliaPossessed3.tw](../passages/missing_women/rescueJuliaPossessed3.tw) - Julia's third possession stage
  * [rescueJadePossessed.tw](../passages/missing_women/rescueJadePossessed.tw) - Jade's possession rescue
  * [rescueJadePossessed1.tw](../passages/missing_women/rescueJadePossessed1.tw) - Jade's first possession stage
  * [rescueJadePossessed2.tw](../passages/missing_women/rescueJadePossessed2.tw) - Jade's second possession stage
  * [rescueNadiaPossessed.tw](../passages/missing_women/rescueNadiaPossessed.tw) - Nadia's possession rescue
  * [rescueNadiaPossessed1.tw](../passages/missing_women/rescueNadiaPossessed1.tw) - Nadia's first possession stage
  * [rescueNadiaPossessed2.tw](../passages/missing_women/rescueNadiaPossessed2.tw) - Nadia's second possession stage
  * [rescueNadiaPossessed3.tw](../passages/missing_women/rescueNadiaPossessed3.tw) - Nadia's third possession stage
  * [rescueVictoriaPossessed.tw](../passages/missing_women/rescueVictoriaPossessed.tw) - Victoria's possession rescue
  * [rescueVictoriaPossessed1.tw](../passages/missing_women/rescueVictoriaPossessed1.tw) - Victoria's first possession stage
  * [rescueVictoriaPossessed2.tw](../passages/missing_women/rescueVictoriaPossessed2.tw) - Victoria's second possession stage

* **Unique endings** - Each woman has her own story and rescue outcome. Successfully rescuing a woman may lead to additional interactions, gratitude scenes, or even romantic/sexual encounters depending on your choices and their personality.
  * [rescueSuccess.tw](../passages/missing_women/rescueSuccess.tw) - Successful rescue outcomes

* **Risk and reward** - Rescues are dangerous and can result in injury, corruption, or even death if not handled carefully. Success rewards you with experience, items, and potential relationship development with the rescued woman, including intimate gratitude scenes.
