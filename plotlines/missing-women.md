# Missing Women Rescue Plotline

This plotline involves rescuing missing women (Victoria, Julia, Jade, Nadia, and Ash) who have been taken by ghosts. The process begins at the church where you can take missing posters for these women. Each rescue mission requires you to locate their haunted house, investigate the ghost, and complete specific objectives to rescue the woman. The rescue missions have multiple stages and can involve ghost encounters, possession events, and special rescue scenarios. Successfully rescuing a woman completes her storyline and may unlock additional content.

* **Rescue system** - Missing posters go up on the church task board from 6 PM onward (`setup.MissingWomen.boardPostingsOutToday()` returns true for hours 18–23), at which point the MC can take one for a random woman drawn from the pool of five. Only one quest is active at a time, with a daily cooldown (`rescueQuestCD`) between postings, and the MC must return to the nun once a quest succeeds or fails before a new one can be taken.
  * [RescueTaskBoard.tw](../passages/missing_women/RescueTaskBoard.tw) - Task board where you take missing posters
  * [RescueMap.tw](../passages/missing_women/RescueMap.tw) - Map for rescue missions
  * [RescueHouse.tw](../passages/missing_women/RescueHouse.tw) - Rescue house locations
  * [MissingWomenController.js](../passages/missing_women/MissingWomenController.js) - Shared rescue state and helpers
  * [widgetRescue.tw](../passages/missing_women/widgetRescue.tw) - Shared rescue widgets (hosts `randomizeRescueHouse`)

* **Multi-stage rescue process** - Each rescue involves finding the haunted location, investigating the ghost, completing specific objectives, and surviving ghost encounters. Some rescues have multiple stages with possession events and dangerous situations.
  * [RescueAsh.tw](../passages/missing_women/RescueAsh.tw) - Ash's rescue mission
  * [RescueJulia.tw](../passages/missing_women/RescueJulia.tw) - Julia's rescue mission
  * [RescueJade.tw](../passages/missing_women/RescueJade.tw) - Jade's rescue mission
  * [RescueNadia.tw](../passages/missing_women/RescueNadia.tw) - Nadia's rescue mission
  * [RescueVictoria.tw](../passages/missing_women/RescueVictoria.tw) - Victoria's rescue mission
  * [RescueSuccess.tw](../passages/missing_women/RescueSuccess.tw) - Successful rescue outcomes
  * [RescueStay.tw](../passages/missing_women/RescueStay.tw) - Staying at rescue locations
  * [RescueClueFound.tw](../passages/missing_women/RescueClueFound.tw) - Finding clues during rescue
  * [RescueEvent.tw](../passages/missing_women/RescueEvent.tw) - Rescue event triggers

* **Possession during rescue** - Some rescue scenarios involve the missing woman being possessed by the ghost, requiring special handling to save her safely. This can lead to intense possession events with sexual or sensual content.
  * [RescuePossessed.tw](../passages/missing_women/RescuePossessed.tw) - General possession rescue mechanics
  * [RescueAshPossessed.tw](../passages/missing_women/RescueAshPossessed.tw) - Ash's possession rescue
  * [RescueAshPossessed1.tw](../passages/missing_women/RescueAshPossessed1.tw) - Ash's first possession stage
  * [RescueAshPossessed2.tw](../passages/missing_women/RescueAshPossessed2.tw) - Ash's second possession stage
  * [RescueJuliaPossessed.tw](../passages/missing_women/RescueJuliaPossessed.tw) - Julia's possession rescue
  * [RescueJuliaPossessed1.tw](../passages/missing_women/RescueJuliaPossessed1.tw) - Julia's first possession stage
  * [RescueJuliaPossessed2.tw](../passages/missing_women/RescueJuliaPossessed2.tw) - Julia's second possession stage
  * [RescueJuliaPossessed3.tw](../passages/missing_women/RescueJuliaPossessed3.tw) - Julia's third possession stage
  * [RescueJadePossessed.tw](../passages/missing_women/RescueJadePossessed.tw) - Jade's possession rescue
  * [RescueJadePossessed1.tw](../passages/missing_women/RescueJadePossessed1.tw) - Jade's first possession stage
  * [RescueJadePossessed2.tw](../passages/missing_women/RescueJadePossessed2.tw) - Jade's second possession stage
  * [RescueNadiaPossessed.tw](../passages/missing_women/RescueNadiaPossessed.tw) - Nadia's possession rescue
  * [RescueNadiaPossessed1.tw](../passages/missing_women/RescueNadiaPossessed1.tw) - Nadia's first possession stage
  * [RescueNadiaPossessed2.tw](../passages/missing_women/RescueNadiaPossessed2.tw) - Nadia's second possession stage
  * [RescueNadiaPossessed3.tw](../passages/missing_women/RescueNadiaPossessed3.tw) - Nadia's third possession stage
  * [RescueVictoriaPossessed.tw](../passages/missing_women/RescueVictoriaPossessed.tw) - Victoria's possession rescue
  * [RescueVictoriaPossessed1.tw](../passages/missing_women/RescueVictoriaPossessed1.tw) - Victoria's first possession stage
  * [RescueVictoriaPossessed2.tw](../passages/missing_women/RescueVictoriaPossessed2.tw) - Victoria's second possession stage

* **Unique endings** - Each woman has her own story and rescue outcome. Successfully rescuing a woman may lead to additional interactions, gratitude scenes, or even romantic/sexual encounters depending on your choices and their personality.
  * [RescueSuccess.tw](../passages/missing_women/RescueSuccess.tw) - Successful rescue outcomes

* **Risk and reward** - Rescues are dangerous and can result in injury, corruption, or even death if not handled carefully. Success rewards you with experience, items, and potential relationship development with the rescued woman, including intimate gratitude scenes.
