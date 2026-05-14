# Locations and Activities

The game world includes several city locations the player can visit between hunts. Each location has its own activities, events, and companion interactions that provide income, stat progression, social encounters, and storyline advancement.

* **Delivery Jobs** - A job system where the player delivers packages, pizzas, burgers, and papers to various addresses around the city. Includes delivery events with unique encounters and a manager storyline. Also serves as the location where the player first meets Alice.
  * [DeliveryHub.tw](../passages/delivery/DeliveryHub.tw) - Delivery job hub
  * [DeliveryController.tw](../passages/delivery/DeliveryController.tw) - Shared delivery state and helpers
  * [DeliveryManager.tw](../passages/delivery/DeliveryManager.tw) - Manager interactions
  * [DeliveryManagerEventStart.tw](../passages/delivery/DeliveryManagerEventStart.tw) - Manager event chain
  * [DeliveryMap.tw](../passages/delivery/DeliveryMap.tw) - Delivery route map
  * [WorkDelivery.tw](../passages/delivery/WorkDelivery.tw) - Working a delivery shift
  * [deliverySmallPassages.tw](../passages/delivery/deliverySmallPassages.tw) - Routing passages (deliveryHouse, deliveryEvent, deliveryActiveIcon, endShiftDelivery)
  * [MeetAlice.tw](../passages/delivery/MeetAlice.tw) - Meeting Alice during deliveries
  * [DeliverySpecialEvent.tw](../passages/delivery/DeliverySpecialEvent.tw) - Special / rare delivery event
  * [widgetDelivery.tw](../passages/delivery/widgetDelivery.tw) - Shared delivery widgets (address formatting, etc.)
  * Delivery encounters (burger / pizza / package / papers) all dispatch through four unified passages, switching on the active order's event type. Per-event metadata (cooldown var, header image, gate check, payMode) lives in `setup.deliveryEvents` in [DeliveryController.tw](../passages/delivery/DeliveryController.tw):
    * [DeliveryEventChoose.tw](../passages/delivery/DeliveryEventChoose.tw) - gate / offer dialog
    * [DeliveryEventStart.tw](../passages/delivery/DeliveryEventStart.tw) - first scene after acceptance. Package's low-lust fork inlines its terminal block here.
    * [DeliveryEvent1.tw](../passages/delivery/DeliveryEvent1.tw) - middle scene. Papers' Event1 is terminal and ends the encounter here.
    * [DeliveryEvent2.tw](../passages/delivery/DeliveryEvent2.tw) - terminal scene for burger / pizza / package high-lust path.
  * Delivery addresses: Amethyst Street 42, Cascade Avenue 56, Emerald Street 17, Golden Road 34, Honeywood Court 3, Jasmine Lane 89, Lilac Lane 72, Onyx Place 10, Twilight Boulevard 61

* **Gym** - Physical training location with solo workouts, group training sessions, and personal trainer events. Multiple trainer event chains with progression.
  * [Gym.tw](../passages/gym/Gym.tw) - Gym exterior and entry
  * [GymInside.tw](../passages/gym/GymInside.tw) - Gym interior and activity selection
  * [GymController.tw](../passages/gym/GymController.tw) - Shared gym state and helpers
  * [GymSolo.tw](../passages/gym/GymSolo.tw) - Solo training session
  * [GymTraining.tw](../passages/gym/GymTraining.tw) - General training mechanics
  * [GymTrainingTrainer.tw](../passages/gym/GymTrainingTrainer.tw) - Training with a personal trainer
  * [GymTrainer.tw](../passages/gym/GymTrainer.tw) - Trainer interaction
  * [GymTrainerEvent1Start.tw](../passages/gym/GymTrainerEvent1Start.tw) - Trainer event chain 1 start
  * [GymTrainerEvent1Start1.tw](../passages/gym/GymTrainerEvent1Start1.tw) - Trainer event chain 1 stage 1
  * [GymTrainerEvent1Start2.tw](../passages/gym/GymTrainerEvent1Start2.tw) - Trainer event chain 1 stage 2
  * [GymTrainerEvent2Start.tw](../passages/gym/GymTrainerEvent2Start.tw) - Trainer event chain 2 start
  * [GymTrainerEvent2Start2.tw](../passages/gym/GymTrainerEvent2Start2.tw) - Trainer event chain 2 stage 2
  * [GroupGymTraining.tw](../passages/gym/GroupGymTraining.tw) - Group training session
  * [GymGroupEvent1Start.tw](../passages/gym/GymGroupEvent1Start.tw) - Group event start
  * [GymGroupEvent1Start2.tw](../passages/gym/GymGroupEvent1Start2.tw) - Group event stage 2
  * [EmilyTalk.tw](../passages/gym/EmilyTalk.tw) - Emily gym-goer conversation
  * [widgetGym.tw](../passages/gym/widgetGym.tw) - Shared gym widgets

* **Library** - A location for reading comics, researching ghost types, and encountering other residents. Includes Brook-specific interactions and resident event chains.
  * [Library.tw](../passages/library/Library.tw) - Library exterior and entry
  * [LibraryInside.tw](../passages/library/LibraryInside.tw) - Library interior and activity selection
  * [LibraryController.tw](../passages/library/LibraryController.tw) - Shared library state and helpers
  * [LibrarySearchResult.tw](../passages/library/LibrarySearchResult.tw) - Search result display
  * [Comics.tw](../passages/library/Comics.tw) - Comics section
  * [ReadComics.tw](../passages/library/ReadComics.tw) - Reading comics
  * [LibraryGhostBook.tw](../passages/library/LibraryGhostBook.tw) - Ghost research book
  * [LibraryTipsBook.tw](../passages/library/LibraryTipsBook.tw) - Tips and hints book
  * [LibraryBrook.tw](../passages/library/LibraryBrook.tw) - Brook-specific library interaction
  * [LibraryGirl.tw](../passages/library/LibraryGirl.tw) - Girl resident encounter
  * [LibraryGuy.tw](../passages/library/LibraryGuy.tw) - Guy resident encounter
  * [LibraryGuy1.tw](../passages/library/LibraryGuy1.tw) - Guy resident event chain
  * [widgetLibrary.tw](../passages/library/widgetLibrary.tw) - Shared library widgets

* **Park** - Outdoor location with jogging activities and park encounter events. Jogging can branch into either the female-stalker chain (ParkEvent1/2) or, when exhibitionism is below 5, a 10% mugging encounter that strips the MC and forces a sneak back to the gate.
  * [Park.tw](../passages/park/Park.tw) - Park entry and activities
  * [ParkController.tw](../passages/park/ParkController.tw) - Shared park state and helpers
  * [ParkJogging.tw](../passages/park/ParkJogging.tw) - Jogging activity
  * [ParkEvent1.tw](../passages/park/ParkEvent1.tw) - Park encounter event 1
  * [ParkEvent2.tw](../passages/park/ParkEvent2.tw) - Park encounter event 2
  * [ParkMugging.tw](../passages/park/ParkMugging.tw) - Armed mugger forces the MC to strip naked and pick her way back to the gate; ends with a capped exhibitionism bump and zeroed energy

* **Church** - Central hub for the rescue quest task board, prayer mechanics, a nun quest, basement access, and exorcism events (Rain storyline). Also hosts church-specific tool events.
  * [Church.tw](../passages/church/Church.tw) - Church exterior and entry
  * [ChurchController.tw](../passages/church/ChurchController.tw) - Shared church state and helpers
  * [ChurchPray.tw](../passages/church/ChurchPray.tw) - Prayer mechanics
  * [ChurchNunQuest.tw](../passages/church/ChurchNunQuest.tw) - Nun quest storyline
  * [ChurchBasementEntrance.tw](../passages/church/ChurchBasementEntrance.tw) - Church basement access
  * [RainExorcism.tw](../passages/church/RainExorcism.tw) - Rain exorcism event
  * [RainHelps.tw](../passages/church/RainHelps.tw) - Rain assistance event
  * [ToolsEventChurch.tw](../passages/church/ToolsEventChurch.tw) - Church tool event
  * [ToolsEventChurch1.tw](../passages/church/ToolsEventChurch1.tw) - Church tool event stage 1
  * [ToolsEventChurchEnd.tw](../passages/church/ToolsEventChurchEnd.tw) - Church tool event conclusion
  * [widgetChurch.tw](../passages/church/widgetChurch.tw) - Shared church widgets

* **Hunt Mode** - The unified ghost-hunt loop, launched from the **Hunt** card on GhostStreet alongside the static-house cards. Each run rolls a deterministic floor plan, modifier deck, and stash placement from a seed; ectoplasm (mL) persists across runs and is spent at the witch's house ([`WitchEctoplasm`](../passages/witch/WitchEctoplasm.tw)) on permanent unlocks. There is no resume — walking back into HuntStart with an unfinished run forfeits it as a failure. See [hunt-mode.md](hunt-mode.md) for the lifecycle, generator, and state shape.
  * [HuntController.tw](../passages/hunt/HuntController.tw) - `setup.HuntController`: lifecycle, accessors, ectoplasm, composition helpers, minimap data
  * [FloorPlanController.tw](../passages/hunt/FloorPlanController.tw) - Seeded floor-plan generator (Mulberry32 PRNG, star topology, stash placement)
  * [ModifiersController.tw](../passages/hunt/ModifiersController.tw) - Run-modifier catalogue and weighted draft
  * [TemplatesController.tw](../passages/hunt/TemplatesController.tw) - Room-template metadata and slot-id helpers
  * [HuntLifecycle.tw](../passages/hunt/HuntLifecycle.tw) - HuntStart, HuntRun, HuntSummary passages
  * [WitchEctoplasm.tw](../passages/witch/WitchEctoplasm.tw) - Persistent-unlock storefront priced in ectoplasm
  * [widgetHuntMinimap.tw](../passages/hunt/widgetHuntMinimap.tw) - `<<huntMinimap>>` floor-plan view

* **Mall** - Shopping location with clothing, electronics, general, and adult sections. The adult section includes Blake-specific companion content.
  * [Mall.tw](../passages/mall/Mall.tw) - Mall exterior and entry
  * [MallController.tw](../passages/mall/MallController.tw) - Shared mall state and helpers
  * [ClothingSection.tw](../passages/mall/ClothingSection.tw) - Clothing store
  * [ElectronicsSection.tw](../passages/mall/ElectronicsSection.tw) - Electronics store (equipment purchases)
  * [GeneralSection.tw](../passages/mall/GeneralSection.tw) - General goods section
  * [AdultSection.tw](../passages/mall/AdultSection.tw) - Adult section
  * [AdultSectionPurchase.tw](../passages/mall/AdultSectionPurchase.tw) - Adult section purchases
  * [AdultSectionBlake.tw](../passages/mall/AdultSectionBlake.tw) - Blake-specific adult section content
  * [widgetMallShop.tw](../passages/mall/widgetMallShop.tw) - Shared mall shop widgets
