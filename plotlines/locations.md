# Locations and Activities

The game world includes several city locations the player can visit between hunts. Each location has its own activities, events, and companion interactions that provide income, stat progression, social encounters, and storyline advancement.

* **Delivery Jobs** - A job system where the player delivers packages, pizzas, burgers, and papers to various addresses around the city. Includes delivery events with unique encounters and a manager storyline. Also serves as the location where the player first meets Alice.
  * [DeliveryHub.tw](../passages/delivery/DeliveryHub.tw) - Delivery job hub
  * [DeliveryManager.tw](../passages/delivery/DeliveryManager.tw) - Manager interactions
  * [DeliveryManagerEventStart.tw](../passages/delivery/DeliveryManagerEventStart.tw) - Manager event chain
  * [SuburbMap.tw](../passages/gui/SuburbMap.tw) - Shared map of the suburb; rendered in delivery mode during a shift and in rescue mode from the church quest (branches on `$suburbMapMode`)
  * [workDelivery.tw](../passages/delivery/workDelivery.tw) - Working a delivery shift
  * [deliverySmallPassages.tw](../passages/delivery/deliverySmallPassages.tw) - Delivery routing passages (deliveryHouse, deliveryEvent, deliveryActiveIcon, endShiftDelivery)
  * [meetAlice.tw](../passages/delivery/meetAlice.tw) - Meeting Alice during deliveries
  * [deliveryEvent1.tw](../passages/delivery/deliveryEvent1.tw) - Delivery encounter event 1
  * [deliveryEvent2.tw](../passages/delivery/deliveryEvent2.tw) - Delivery encounter event 2
  * [deliveryEvent3.tw](../passages/delivery/deliveryEvent3.tw) - Delivery encounter event 3
  * Delivery types: Burger (4 files), Package (5 files), Papers (3 files), Pizza (4 files) - each with start, choose, and stage passages
  * Delivery addresses are the shared rescue house roster in [StoryInit.tw](../passages/StoryInit.tw): 16 houses grouped by street (Maple Street, Oak Avenue, Pine Road, Birch Lane, Willow Court, Cedar Drive). Both quests render the same street-grouped layout through the shared [SuburbMap.tw](../passages/gui/SuburbMap.tw).

* **Gym** - Physical training location with solo workouts, group training sessions, and personal trainer events. Multiple trainer event chains with progression.
  * [Gym.tw](../passages/gym/Gym.tw) - Gym exterior and entry
  * [GymInside.tw](../passages/gym/GymInside.tw) - Gym interior and activity selection
  * [gymSolo.tw](../passages/gym/gymSolo.tw) - Solo training session
  * [GymTraining.tw](../passages/gym/GymTraining.tw) - General training mechanics
  * [GymTrainingTrainer.tw](../passages/gym/GymTrainingTrainer.tw) - Training with a personal trainer
  * [gymTrainer.tw](../passages/gym/gymTrainer.tw) - Trainer interaction
  * [gymTrainerEvent1Start.tw](../passages/gym/gymTrainerEvent1Start.tw) - Trainer event chain 1 start
  * [gymTrainerEvent1Start1.tw](../passages/gym/gymTrainerEvent1Start1.tw) - Trainer event chain 1 stage 1
  * [gymTrainerEvent1Start2.tw](../passages/gym/gymTrainerEvent1Start2.tw) - Trainer event chain 1 stage 2
  * [gymTrainerEvent2Start.tw](../passages/gym/gymTrainerEvent2Start.tw) - Trainer event chain 2 start
  * [gymTrainerEvent2Start2.tw](../passages/gym/gymTrainerEvent2Start2.tw) - Trainer event chain 2 stage 2
  * [GroupGymTraining.tw](../passages/gym/GroupGymTraining.tw) - Group training session
  * [gymGroupEvent1Start.tw](../passages/gym/gymGroupEvent1Start.tw) - Group event start
  * [gymGroupEvent1Start2.tw](../passages/gym/gymGroupEvent1Start2.tw) - Group event stage 2

* **Library** - A location for reading comics, researching ghost types, and encountering other residents. Includes Brook-specific interactions and resident event chains.
  * [Library.tw](../passages/library/Library.tw) - Library exterior and entry
  * [LibraryInside.tw](../passages/library/LibraryInside.tw) - Library interior and activity selection
  * [LibrarySearchResult.tw](../passages/library/LibrarySearchResult.tw) - Search result display
  * [Star_Street_25.tw](../passages/library/Star_Street_25.tw) - Library street location
  * [comics.tw](../passages/library/comics.tw) - Comics section
  * [readComics.tw](../passages/library/readComics.tw) - Reading comics
  * [libraryGhostBook.tw](../passages/library/libraryGhostBook.tw) - Ghost research book
  * [libraryTipsBook.tw](../passages/library/libraryTipsBook.tw) - Tips and hints book
  * [libraryBrook.tw](../passages/library/libraryBrook.tw) - Brook-specific library interaction
  * [libraryGirl.tw](../passages/library/libraryGirl.tw) - Girl resident encounter
  * [libraryGuy.tw](../passages/library/libraryGuy.tw) - Guy resident encounter
  * [libraryGuy1.tw](../passages/library/libraryGuy1.tw) - Guy resident event chain

* **Park** - Outdoor location with jogging activities and park encounter events.
  * [Park.tw](../passages/park/Park.tw) - Park entry and activities
  * [ParkJogging.tw](../passages/park/ParkJogging.tw) - Jogging activity
  * [ParkEvent1.tw](../passages/park/ParkEvent1.tw) - Park encounter event 1
  * [ParkEvent2.tw](../passages/park/ParkEvent2.tw) - Park encounter event 2

* **Church** - Central hub for the rescue quest task board, prayer mechanics, a nun quest, basement access, and exorcism events (Rain storyline). Also hosts church-specific tool events.
  * [Church.tw](../passages/church/Church.tw) - Church exterior and entry
  * [ChurchPray.tw](../passages/church/ChurchPray.tw) - Prayer mechanics
  * [ChurchNunQuest.tw](../passages/church/ChurchNunQuest.tw) - Nun quest storyline
  * [churchBasementEnt.tw](../passages/church/churchBasementEnt.tw) - Church basement access
  * [RainExorcism.tw](../passages/church/RainExorcism.tw) - Rain exorcism event
  * [RainHelps.tw](../passages/church/RainHelps.tw) - Rain assistance event
  * [ToolsEventChurch.tw](../passages/church/ToolsEventChurch.tw) - Church tool event
  * [ToolsEventChurch1.tw](../passages/church/ToolsEventChurch1.tw) - Church tool event stage 1
  * [ToolsEventChurchEnd.tw](../passages/church/ToolsEventChurchEnd.tw) - Church tool event conclusion

* **Mall** - Shopping location with clothing, electronics, and adult sections. The adult section includes Blake-specific companion content.
  * [Mall.tw](../passages/mall/Mall.tw) - Mall exterior and entry
  * [clothingSection.tw](../passages/mall/clothingSection.tw) - Clothing store
  * [electronicsSection.tw](../passages/mall/electronicsSection.tw) - Electronics store (equipment purchases)
  * [adultSection.tw](../passages/mall/adultSection.tw) - Adult section
  * [adultSectionPurchase.tw](../passages/mall/adultSectionPurchase.tw) - Adult section purchases
  * [adultSectionBlake.tw](../passages/mall/adultSectionBlake.tw) - Blake-specific adult section content
