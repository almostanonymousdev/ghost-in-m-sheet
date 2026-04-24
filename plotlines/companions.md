# Companion/Relationship Plotlines

The game features multiple companion characters (Alice, Blake, Brook, Alex, Casey, Taylor) who can join you on ghost hunts. Each companion has their own personality, skills, and relationship mechanics. Companions can help with various tasks like finding evidence, locating the ghost's favorite room, or searching for cursed items. They also have personal storylines that develop as you build relationships with them through shared experiences and interactions. Some companions have unique endings depending on your choices and progression.

* **Alice** - A nervous but determined companion who can become more confident as your relationship progresses. She's particularly useful for finding cursed items and has unique interactions during ghost hunts and at home, including intimate moments when her anxiety is soothed.
  * [AliceHelp.tw](../passages/companion/alice/AliceHelp.tw) - Alice's assistance during hunts
  * [AliceInfo.tw](../passages/companion/alice/AliceInfo.tw) - Information about Alice
  * [AliceHuntEndAlone.tw](../passages/companion/alice/AliceHuntEndAlone.tw) - Alice's ending if you hunt alone
  * [AliceContinue.tw](../passages/companion/alice/AliceContinue.tw) - Alice's continuation options
  * Alice's mini panel is inlined in [StoryCaption.tw](../passages/StoryCaption.tw)

* **Blake** - A more experienced hunter who provides solid support during investigations. Has unique endings depending on your choices and can help with various hunting strategies, with potential for romantic/sexual tension during dangerous situations.
  * [BlakeHelp.tw](../passages/companion/blake/BlakeHelp.tw) - Blake's assistance during hunts
  * [BlakeInfo.tw](../passages/companion/blake/BlakeInfo.tw) - Information about Blake
  * [BlakeHuntEndAlone.tw](../passages/companion/blake/BlakeHuntEndAlone.tw) - Blake's ending if you hunt alone
  * [BlakeContinue.tw](../passages/companion/blake/BlakeContinue.tw) - Blake's continuation options
  * Blake's mini panel is inlined in [StoryCaption.tw](../passages/StoryCaption.tw)

* **Brook** - A companion with specific skills for ghost hunting, including higher chances of success with certain evidence types. Has unique home interaction scenarios that can include sensual or sexual content.
  * [BrookHelp.tw](../passages/companion/brook/BrookHelp.tw) - Brook's assistance during hunts
  * [BrookInfo.tw](../passages/companion/brook/BrookInfo.tw) - Information about Brook
  * [BrookHuntEndAlone.tw](../passages/companion/brook/BrookHuntEndAlone.tw) - Brook's ending if you hunt alone
  * Brook's mini panel is inlined in [StoryCaption.tw](../passages/StoryCaption.tw)

* **Alex, Casey, and Taylor** - Additional companions with their own unique personalities and hunting specialties, each bringing different dynamics to your ghost hunting team and potential for intimate encounters.
  * Alex/Casey/Taylor mini panels are inlined in [StoryCaption.tw](../passages/StoryCaption.tw)

* **Companion data & main screen** - Per-companion metadata (pronouns, images, clothing tier text, stat defaults) lives in the `COMPANION_CONFIG` catalogue in [CompanionController.tw](../passages/companion/CompanionController.tw). The shared per-hunt interaction screen (portrait, clothing tiers, plan selection, walk-home) is rendered by [CompanionMain.tw](../passages/companion/CompanionMain.tw). Fresh `$brook/$alice/$blake/$alex/$taylor/$casey` stat objects are seeded by [SaveMigration.tw](../passages/updates/SaveMigration.tw)'s `DEFAULTS` map via `setup.Companion.defaultStateFor(name)` — no per-companion Init passages are needed.

* **Relationship mechanics** - Your choices during hunts, how you treat your companions, and shared experiences affect their loyalty and effectiveness. Companions may develop romantic or sexual feelings for you, leading to intimate encounters during hunts, at home, or when walking home together.
  * [CompanionEvent.tw](../passages/companion/CompanionEvent.tw) - Companion event triggers
  * [WalkHomeTogether.tw](../passages/companion/WalkHomeTogether.tw) - Walking home together with companions
  * [CompanionLeaving.tw](../passages/companion/CompanionLeaving.tw) - Companion leaving scenarios
  * [CompanionSucceeded.tw](../passages/companion/CompanionSucceeded.tw) - Successful companion mission outcomes
  * [CompanionFailed.tw](../passages/companion/CompanionFailed.tw) - Failed companion mission outcomes
  * [Contacts.tw](../passages/companion/Contacts.tw) - Companion contact list and per-companion invite flow
  * [widgetCompanion.tw](../passages/companion/widgetCompanion.tw) - Shared companion widgets

* **Companion events** - Special scenes occur during hunts, at home, and when walking home together that can include nudity, intimate touching, and sexual content depending on your relationship progress and character choices. Some companions have specific requirements for intimate events (exhibitionism level, clothing state, etc.).
  * [CompanionResult.tw](../passages/companion/CompanionResult.tw) - Companion result outcomes
  * [CompanionRandomRoom.tw](../passages/companion/CompanionRandomRoom.tw) - Random companion room events
