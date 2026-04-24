# Body Modification and Personalization Plotline

The game includes a body modification system that allows you to customize your character's appearance through piercings, tattoos, and other modifications. This system is integrated with the gameplay through the exhibitionism mechanic, where your character's comfort with nudity affects certain interactions and events. The body modification plotline provides character development options and can unlock unique content based on your choices and progression.

* **Body modification hub** - The main interface for viewing and managing body modifications.
  * [BodyModification.tw](../passages/gui/BodyModification.tw) - Body modification overview and management

* **Piercing mechanics** - Piercings can be acquired through the salon or via in-game events.
  * [Piercing.tw](../passages/salon/Piercing.tw) - Piercing application mechanics

* **Beauty salon** - The salon is the primary location for getting piercings and tattoos.
  * [BeautySalon.tw](../passages/salon/BeautySalon.tw) - Salon exterior and entry
  * [BeautySalonInside.tw](../passages/salon/BeautySalonInside.tw) - Salon interior and service menu
  * [BeautySalonPiercing.tw](../passages/salon/BeautySalonPiercing.tw) - Getting piercings at the salon
  * [BeautySalonTattoos.tw](../passages/salon/BeautySalonTattoos.tw) - Getting tattoos at the salon
  * [SalonController.tw](../passages/salon/SalonController.tw) - Shared salon state, pricing, and helpers

* **Mirror and appearance** - The mirror at home lets you review your current appearance and modifications.
  * [Mirror.tw](../passages/home/Mirror.tw) - Home mirror for checking appearance

* **Clothing and wardrobe** - Clothing choices interact with the exhibitionism and body modification systems.
  * [Wardrobe.tw](../passages/home/Wardrobe.tw) - Wardrobe and clothing selection
  * [WardrobeSlots.tw](../passages/home/WardrobeSlots.tw) - Wardrobe slot layout and outfit slots
  * [WardrobeController.tw](../passages/home/WardrobeController.tw) - Wardrobe state and outfit switching logic
  * [ClothesChanges.tw](../passages/home/ClothesChanges.tw) - Clothing state change mechanics

* **Exhibitionism in hunts** - Nudity events during ghost hunts are tied to the exhibitionism level unlocked through body mod progression.
  * [NudityEvent.tw](../passages/haunted_houses/general/NudityEvent.tw) - Nudity event during hunts
  * [NudityEventTwo.tw](../passages/haunted_houses/general/NudityEventTwo.tw) - Second nudity event during hunts
