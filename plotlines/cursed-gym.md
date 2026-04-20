# Cursed Gym (Shower Spirit Bag Swap)

An extension of the cursed-home-items pattern, staged at the gym. After the MC finishes a training session and showers, there is a 10% chance the shower spirit teleports her gym bag -- clothes, phone, keys -- into the men's locker room. The swap stays dormant until she tries to leave the gym: when she heads for the exit, she goes to pick up her bag off the bench, realises it's gone, and has to decide how to go retrieve it before she can actually walk out.

## Mechanics

- **Trigger (roll)**: after any gym training session (`GymTraining`, `GymTrainingTrainer`, `GroupGymTraining`) the passage calls `setup.CursedGym.rollForGymBagSwap()` -- 10% chance to set `$gymBagStolen = 1`. Does not re-roll while a swap is already active.
- **Trigger (playback)**: when the MC clicks "Leave" in `GymInside` and `setup.CursedGym.isBagStolen()` is true, the Leave link routes to `GymBagSwapEvent` instead of `CityMap`.
- **One at a time**: only one gym bag swap can be active, in the same spirit as the cursed-home-items one-at-a-time rule. The two systems are independent of each other -- a cursed home item and a stolen gym bag can coexist.
- **Consumed on use**: each retrieval event calls `setup.CursedGym.clearSwap()` at the end.
- **Stat effects**: each retrieval path applies sanity -15, corruption +0.5, lust set to 100 -- same as cursed home items.
- **Exhib gating**: three escalating retrieval options, gated on `$mc.exhib` using the canonical bands in use elsewhere (0+ / 5+ / 8+).

## Controller

- [CursedGymController.tw](../passages/gym/cursedGym/CursedGymController.tw) -- `setup.CursedGym` namespace with `rollForGymBagSwap()`, `isBagStolen()`, `clearSwap()`, and the exhib-gate predicates `canSneak()`, `canTowel()`, `canNude()` (plus `towelExhib()` / `nudeExhib()` for UI hint text).

## Events

- **Realisation** -- MC swings past the bench on her way to the exit and finds it empty. The shower spirit whispers the bag's new home: the men's locker room. Three retrieval options are offered, each gated on exhib.
  - [GymBagSwapEvent.tw](../passages/gym/cursedGym/GymBagSwapEvent.tw)

- **Sneak retrieval** (always available) -- MC waits in the corridor for the men's locker room to empty, then slips in. She finds the bag, but the shower spirit materialises and collects his toll with a quick, forced-still blowjob before dissolving back into the steam.
  - [GymBagSwapSneak.tw](../passages/gym/cursedGym/GymBagSwapSneak.tw)

- **Towel retrieval** (exhib >= 5) -- MC wraps herself in a towel and walks straight in. Two men freeze mid-change. The shower spirit materialises mid-retrieval and fucks her over the bench while one of the witnesses films.
  - [GymBagSwapTowel.tw](../passages/gym/cursedGym/GymBagSwapTowel.tw)

- **Nude retrieval** (exhib >= 8) -- MC drops her borrowed staff shirt in the corridor, walks a full men's locker room completely naked, climbs onto a bench, and lets the spirit and a handful of onlookers use her on her own terms.
  - [GymBagSwapNude.tw](../passages/gym/cursedGym/GymBagSwapNude.tw)

## Hooks into existing passages

- [GymInside.tw](../passages/gym/GymInside.tw) -- the "Leave" link checks `setup.CursedGym.isBagStolen()` and routes to `GymBagSwapEvent` when true, otherwise falls through to the normal `CityMap` exit.
- [GymTraining.tw](../passages/gym/GymTraining.tw), [GymTrainingTrainer.tw](../passages/gym/GymTrainingTrainer.tw), [GroupGymTraining.tw](../passages/gym/GroupGymTraining.tw) -- after the fitness gain, `<<run setup.CursedGym.rollForGymBagSwap()>>` (only when no swap is already active).

## Variables

| Variable | Type | Description |
|----------|------|-------------|
| `$gymBagStolen` | int | `1` when the shower spirit has stolen the bag and the retrieval event is pending, `0` otherwise |
