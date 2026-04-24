# Cursed Home Items

After losing a haunted house run (passing out from sanity loss), there is a 40% chance that a ghost follows the MC home and attaches itself to a random household object. The cursed item remains dormant until the MC interacts with it, at which point a unique supernatural encounter is triggered.

## Mechanics

- **Trigger**: `HuntOverSanity` calls `setup.CursedItems.rollForCursedItem()` — 40% chance, one random item selected
- **Eligible items**: TV, Computer, Bed, Shower, Bathtub (5 total)
- **One at a time**: Only one home item can be cursed at any given time
- **Consumed on use**: The curse clears after the event plays out (`setup.CursedItems.clearCurse()`)
- **Stat effects**: Each event applies sanity -15, corruption +0.5, lust set to 100

## Controller

- [CursedItemsController.tw](../passages/home/cursedItems/CursedItemsController.tw) — `setup.CursedItems` namespace with `rollForCursedItem()`, `isItemCursed(key)`, `clearCurse()`, and `cursedItemLabel()`

## Events

- **Cursed TV** — MC is watching TV when it cuts to static, then shows a video of herself on her own couch. She suddenly finds herself on her knees blowing a spectral presence. When the ghost finishes in her mouth, she's rocked by an intense orgasm before the room fades back to normal.
  - [CursedTVEvent.tw](../passages/home/cursedItems/CursedTVEvent.tw)

- **Cursed PC** — The screen glitches and a ghostly presence materializes behind MC at the desk, caressing her through her clothes before bringing her to climax.
  - [CursedPCEvent.tw](../passages/home/cursedItems/CursedPCEvent.tw)

- **Cursed Bed** — MC wakes to find a sticky substance on her neck and a glowing hole in the mattress. Upon investigating, she is pulled under the bed into a void where tendrils pin and violate her. She eventually gives in, draining the tendrils and inviting them to cover her in cum before blacking out and waking in her normal bed.
  - [CursedBedEvent.tw](../passages/home/cursedItems/CursedBedEvent.tw)

- **Cursed Shower** — MC discovers a mysterious dildo in the shower that compels irresistible lust. She masturbates on the shower floor, then mounts the dildo on the shower door and fucks herself senseless. She deepthroats it as a "thank you" before it fades out of existence.
  - [CursedShowerEvent.tw](../passages/home/cursedItems/CursedShowerEvent.tw)

- **Cursed Bathtub** — MC is relaxing in the bath when she is dragged underwater into an infinite black void. Tentacles pin and fuck her relentlessly, filling her with cum until her belly inflates. As the creature retreats, cum gushes from her mouth and pussy, causing her to squirt in ecstasy before she blacks out and wakes in the normal tub.
  - [CursedBathEvent.tw](../passages/home/cursedItems/CursedBathEvent.tw)

## Home passage hooks

The following passages check for cursed items and redirect to the corresponding event:

- [Livingroom.tw](../passages/home/Livingroom.tw) — TV (watch tv) and PC (Use PC)
- [Bedroom.tw](../passages/home/Bedroom.tw) — Bed (Sleep)
- [Bathroom.tw](../passages/home/Bathroom.tw) — Shower (Take a shower) and Bath (Take a bath)

## Variables

| Variable                | Type   | Description                                                                |
|-------------------------|--------|----------------------------------------------------------------------------|
| `$cursedHomeItem`       | string | Which item is cursed (`"tv"`, `"pc"`, `"bed"`, `"shower"`, `"bath"`, `""`) |
| `$cursedHomeItemActive` | int    | `1` if a cursed item is present, `0` otherwise                             |
