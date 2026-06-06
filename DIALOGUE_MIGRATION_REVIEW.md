# Dialogue macro migration — review queue

Mechanical conversion of the raw `@@.mc-speech / .notmc-speech / .mc-thoughts;@@` markup to the `<<mc>> / <<say>> / <<thought>> / <<vocal>>` macros is **done and verified** (full `lint` + `chromium` suites green).

- Converted automatically: **387** `<<mc>>`, **301** `<<say>>`, **865** `<<thought>>`, **1** `<<vocal>>` across 210 files.

- Left untouched for your judgement: **380** spans in 129 files, grouped below by the decision they need.

Work a category top-to-bottom; the *Action* line is the recommended fix for that whole group.

## Resolution — editorial pass (2026-06)

The 380 flagged spans have now been worked. Outcome (full `lint` + `chromium` +
`mobile` suites green, whole-tree `check_format.py` / `format_twee.py --check`
clean):

- **Converted: ~125 spans → 287 macro instances** across 76 files —
  116 `<<mc>>`, 99 `<<vocal>>`, 45 `<<say>>`, 21 `<<narration>>`, 6 `<<thought>>`.
  Every clean, standalone spoken / thought / breath / action line was migrated:
  `mixed` → `<<narration>>` + speech; `quoted` → quotes stripped then wrapped;
  `moan-mixed` → speech + `<<vocal>>` per the leading/trailing/pure/woven breath
  policy.
- **Left raw (deliberate): 255 dialogue-class spans**, all matching a documented
  exclusion — they are NOT cleanable by a wrapper-swap and the convention
  explicitly allows incremental migration:
  - **multi-line span** wrapping a `<<linkappend>>`/`<<linkreplace>>`/`<<if>>`
    block (opens then closes on a later line) — a block macro would break the
    reveal structure;
  - **mid-sentence flow** into a `<<link…>>` / `[[wikilink]]` on the same line —
    `<<mc>>`/`<<say>>` are `display:block` and would break the inline run;
  - **dynamic bodies** assembled by `<<= … >>` / `<<print>>` / a bare variable;
  - **UI / stat readouts** (`Exhibitionism increased`, evidence cards,
    Ghostpedia "Information added"), **name-label card headers**, and the few
    spans living inside a **macro string argument**.
  - Out of scope entirely: the 77 `.mc-speechLink` / `.mc-thoughtsLink` reveal
    *button* classes, `@@color:red;@@` succubus/ghost speech (not a migrated
    class), and `.mc-action` / `.location` non-dialogue classes.

Reference conversions to copy when picking off the remaining structural cases
later: [passages/delivery/DeliveryManager.tw](passages/delivery/DeliveryManager.tw),
[passages/church/ChurchPray.tw](passages/church/ChurchPray.tw),
[passages/witch/WitchEctoplasmQuest.tw](passages/witch/WitchEctoplasmQuest.tw),
[passages/missing_women/RescuePossessed.tw](passages/missing_women/RescuePossessed.tw).

The per-span queue below is kept as the historical record of what was flagged;
entries not in the converted set above were left raw under one of the exclusions.

## Summary

| Kind | Count | What it is |
| --- | ---: | --- |
| `mixed` | 28 | Spoken words + stage-direction/action prose in one speech body |
| `quoted` | 9 | Speech body that already contains typed quote characters |
| `moan-mixed` | 142 | Words + a `~moan~` in one speech body |
| `inline` | 91 | A `.mc-speech`/`.notmc-speech` span used mid-sentence inside other prose |
| `ambiguous` | 110 | Markup the agent wasn't confident was a clean wrapper-swap |

## `mixed` — 28

**What:** Spoken words + stage-direction/action prose in one speech body.  
**Action:** Pull the action out into a `<<narration>>` beat (default colour, italic, no quotes) and keep only the spoken words in `<<mc>>`/`<<say>>`. This is the core three-channels-separate fix from the dialogue-markup convention.

### [passages/church/ChurchPray.tw](passages/church/ChurchPray.tw)

- **[L4](passages/church/ChurchPray.tw#L4)** — NPC speech body mixes a stage direction '(Father Ibrahim looks up from the altar.)' with the spoken line 'Bless you, my daughter. How may I assist you?'. Needs the action pulled into a <<narration>> beat and only the spoken portion wrapped in <<say>> — editorial split, left byte-for-byte.
  - `@@.notmc-speech; (Father Ibrahim looks up from the altar.) Bless you, my daughter. How may I assist you?@@`

### [passages/companion/CompanionMain.tw](passages/companion/CompanionMain.tw)

- **[L134](passages/companion/CompanionMain.tw#L134)** — Mixes a spoken word ('Yes,') with a navigation wikilink [[let's go together|WalkHomeTogether]]. The link is a player action/stage element, not part of the spoken line; needs splitting into speech + the action link rather than a blanket <<mc>> wrap.
  - `@@.mc-speech; Yes, [[let's go together|WalkHomeTogether]] @@`

### [passages/delivery/DeliveryEventChoose.tw](passages/delivery/DeliveryEventChoose.tw)

- **[L25](passages/delivery/DeliveryEventChoose.tw#L25)** — A .mc-speech span opens here but wraps the ENTIRE <<linkreplace>> block (image, NPC speech, if/else, links) and only closes with the bare @@ on line 37. This is speech styling painted over narration/action/markup, not a clean spoken line. Needs splitting (the 'Umm... yeah sure' linkreplace label vs the wrapped block).
  - `@@.mc-speech;<<linkreplace " Umm... yeah sure">>`
- **[L55](passages/delivery/DeliveryEventChoose.tw#L55)** — A .mc-speech span opens here but wraps the ENTIRE <<linkreplace>> block (addLust, image, thought, stat icon, if/else, links) and only closes with the bare @@ on line 70. Speech styling over narration/action/markup, not a clean spoken line. Needs splitting (the 'Sure, no problem' label vs the wrapped block).
  - `@@.mc-speech;<<linkreplace "Sure, no problem">>`

### [passages/delivery/DeliveryEventStart.tw](passages/delivery/DeliveryEventStart.tw)

- **[L33](passages/delivery/DeliveryEventStart.tw#L33)** — Placed in the spoken MC class but reads as interior reaction ('She's crazy') plus a navigation/choice link rather than something said aloud. Human should decide thought vs. speech and how to handle the embedded choice link.
  - `@@.mc-speech; She's crazy, I'd rather do [[what she wants|DeliveryEvent1]]@@`

### [passages/gym/GroupGymTraining.tw](passages/gym/GroupGymTraining.tw)

- **[L15](passages/gym/GroupGymTraining.tw#L15)** — MC speech body mixes spoken words ('I'm so horny...Oooh, I can't resist') with action/stage-direction prose ('they start rubbing my pussy right now') and spans a <br> plus an embedded [[link]]. Needs editorial split into spoken + <<narration>> before converting.
  - `@@.mc-speech; I'm so horny...and they start rubbing my pussy right now....<br>\n\t\t\tOooh, [[I can't resist|GymGroupEvent1Start]]@@<br>`

### [passages/haunted_houses/general/FindCursedItem.tw](passages/haunted_houses/general/FindCursedItem.tw)

- **[L2](passages/haunted_houses/general/FindCursedItem.tw#L2)** — An .mc-thoughts span closes and is immediately fused (@@@@) to an .mc-speech span that opens a <<linkappend>> and stays open through line 13, wrapping macros (<<image>>, <<addLust>>, <<statIcon>>), narration prose, stat rewards, and [[links]]. The speech 'body' is really a whole interactive block. Converting any part would break the structure; needs editorial separation of speech vs narration/UI. Left byte-for-byte.
  - `@@.mc-thoughts; You try to find something, but it seems like nothing is there. Suddenly, you feel an unusual warmth ...`

### [passages/home/Bedroom.tw](passages/home/Bedroom.tw)

- **[L56](passages/home/Bedroom.tw#L56)** — MC speech body opens spoken words then wraps a multi-line <<linkappend>> containing narration/action prose, images, and an <<include>> before the closing @@. Speech and stage-direction are entangled; needs splitting into <<mc>> + <<narration>>. (Inner nested @@.mc-thoughts; at line 61 was converted independently.)
  - `@@.mc-speech; Am I home? I don't remember how I got back here. My whole body aches and is <<linkappend "covered with something">>`

### [passages/hunt/CompanyRescue.tw](passages/hunt/CompanyRescue.tw)

- **[L21](passages/hunt/CompanyRescue.tw#L21)** — NPC (Norville medic) speech body interleaves spoken lines ('Easy. Don't try to talk...') with two <i>...</i> stage directions ('The one leaning over you...' / 'He says it the way you'd read a grocery list.'). Needs splitting into <<say>> for the spoken parts plus <<narration>> for the action beats — editorial judgment, left verbatim.
  - `@@.notmc-speech; <i>The one leaning over you has NORVILLE stitched across his chest in white thread.</i> Easy. Don't try to ta`
- **[L45](passages/hunt/CompanyRescue.tw#L45)** — NPC (medic) speech body mixes a spoken line ('Resetting the alignment. This part comes back fast.') with an <i>...</i> stage direction ('His thumb settles under your jaw...'). Needs speech + <<narration>> split — left verbatim.
  - `@@.notmc-speech; Resetting the alignment. This part comes back fast. <i>His thumb settles under your jaw and the world stops b`
- **[L81](passages/hunt/CompanyRescue.tw#L81)** — NPC (medic) speech body mixes spoken lines with two <i>...</i> stage directions ('The Norville one peels his gloves...' / 'He checks a watch.'). Needs speech + <<narration>> split — left verbatim.
  - `@@.notmc-speech; Miraculous. <i>The Norville one peels his gloves with two snaps and smiles.</i> Full recovery. Take it easy,`

### [passages/hunt/HuntLifecycle.tw](passages/hunt/HuntLifecycle.tw)

- **[L331](passages/hunt/HuntLifecycle.tw#L331)** — Body is entirely stage-direction/action prose (no spoken words) painted in the NPC speech colour. It should become a <<narration>> block, not <<say>>. Creating narration is a judgment call this pass forbids, so left byte-for-byte for a human to split/retag.
  - `<div class="hunt-reveal hunt-reveal-text">@@.notmc-speech; The shape thins out and goes. The house cools behind it.@@</div>`

### [passages/missing_women/RescueJadePossessed.tw](passages/missing_women/RescueJadePossessed.tw)

- **[L19](passages/missing_women/RescueJadePossessed.tw#L19)** — The .notmc-speech body opens spoken dialogue but its closing @@ is far away at line 57; the span wraps a <<linkappend>> containing videos, action/narration prose, and nested .mc-thoughts/.mc-speech spans (including a moan-mixed 'OH~ Fuck~' line). Spoken words are mixed with stage-direction/action and macro/video content — needs editorial splitting into speech + <<narration>>. Left byte-for-byte, so all nested spans inside it (lines 22-24,35-38,52-55) are also left untouched.
  - `@@.notmc-speech; Of course, I'll let you go... but not before we <<linkappend "have a little fun first. ">>`

### [passages/missing_women/RescueJuliaPossessed2.tw](passages/missing_women/RescueJuliaPossessed2.tw)

- **[L17](passages/missing_women/RescueJuliaPossessed2.tw#L17)** — The .notmc-speech span opens here but does not close on this line; its @@ closing tag is at line 27 (<</linkappend>>@@), so the speech class wraps an entire <<linkappend>> block containing <<set>>/<<if>>/<<video>> control flow plus two nested @@.mc-speech;@@ / @@.notmc-speech;@@ dialogue spans (lines 25-26). Mixing spoken words with structure and nested dialogue is not a clean wrapper swap; left byte-for-byte including the two nested spans. Needs a human to restructure (likely pull the nested lines out of the outer span and convert each separately).
  - `@@.notmc-speech; Good girl, now let's check your  <<linkappend "other hole.">>`

### [passages/missing_women/RescuePossessed.tw](passages/missing_women/RescuePossessed.tw)

- **[L18](passages/missing_women/RescuePossessed.tw#L18)** — Tagged as NPC speech but the body is entirely second-person action/stage-direction prose with no spoken words; should become <<narration>>. (Victoria branch)
  - `@@.notmc-speech; A sharp pain shot through your head, making you collapse to the floor. The last thing you saw before passing out was her walking`
- **[L28](passages/missing_women/RescuePossessed.tw#L28)** — Tagged as NPC speech but the body is entirely second-person action/stage-direction prose with no spoken words; should become <<narration>>. (Jade branch)
  - `@@.notmc-speech; A sharp pain shot through your head, making you collapse to the floor. The last thing you saw before passing out was her walking`

### [passages/special_event/GhostSpecialEventMare0.tw](passages/special_event/GhostSpecialEventMare0.tw)

- **[L3](passages/special_event/GhostSpecialEventMare0.tw#L3)** — Body 'Nothing happens' is an action/narration beat painted in the .mc-speech colour, not a line the MC says aloud. Needs editorial judgment: likely belongs in <<narration>> (or rephrased) rather than <<mc>>. Left byte-for-byte.
  - `@@.mc-speech;Nothing happens@@`

### [passages/witch/WitchEctoplasmQuest.tw](passages/witch/WitchEctoplasmQuest.tw)

- **[L70](passages/witch/WitchEctoplasmQuest.tw#L70)** — NPC speech body mixes a stage-direction (italic <i>...</i> action) with the spoken line 'Watch the flame. Not me.' — needs splitting into <<narration>> + <<say>>.
  - `@@.notmc-speech; <i>She sets a stub of black candle on the desk between you and turns it upright, then strikes a match.</i> Watch th`
- **[L84](passages/witch/WitchEctoplasmQuest.tw#L84)** — NPC speech body mixes a long stage-direction (italic action) with the spoken line 'Then you stop looking...' — needs splitting into <<narration>> + <<say>>.
  - `@@.notmc-speech; <i>She pulls her shirt over her head, folds it once, lays it on the desk. Bare to the waist, the candle flame doub`
- **[L91](passages/witch/WitchEctoplasmQuest.tw#L91)** — NPC speech body mixes a stage-direction (italic action) with spoken 'Sitting there drooling on yourself...' — needs splitting into <<narration>> + <<say>>.
  - `@@.notmc-speech; <i>Her hand has gone between her legs with no ceremony, two fingers working a slow circle, her breathing flat and `
- **[L92](passages/witch/WitchEctoplasmQuest.tw#L92)** — Entire .notmc-speech body is stage-direction/action prose (italic, no spoken words). It should become <<narration>>, but creating narration is a judgment call this pass — flag for human.
  - `@@.notmc-speech; <i>She comes quick and small, one short breath pushed out through her nose, and her hand goes still. A button wir`
- **[L99](passages/witch/WitchEctoplasmQuest.tw#L99)** — NPC speech body mixes a stage-direction (italic action) with spoken 'Flame between you and the ghost...' — needs splitting into <<narration>> + <<say>>.
  - `@@.notmc-speech; <i>She tips the candle until a bead of wax rolls onto the back of her wrist. Doesn't flinch.</i> Flame between yo`
- **[L100](passages/witch/WitchEctoplasmQuest.tw#L100)** — NPC speech body mixes a stage-direction (italic action) with spoken 'Like you're about to come around it...' — needs splitting into <<narration>> + <<say>>.
  - `@@.notmc-speech; <i>She says a name you've never heard, low and broken open, the way it would come out with a translucent cock dow`
- **[L109](passages/witch/WitchEctoplasmQuest.tw#L109)** — NPC speech body mixes a stage-direction (italic action) with spoken 'Then you say it anyway...' — needs splitting into <<narration>> + <<say>>.
  - `@@.notmc-speech; <i>She opens the desk drawer and lifts out a worn ball gag by the strap.</i> Then you say it anyway. The name do`
- **[L110](passages/witch/WitchEctoplasmQuest.tw#L110)** — NPC speech body mixes a stage-direction (italic action) with spoken 'Keep surviving my houses...' — needs splitting into <<narration>> + <<say>>.
  - `@@.notmc-speech; <i>She buckles it behind her head, bites down, tests the give.</i> Keep surviving my houses and I'll teach you `
- **[L120](passages/witch/WitchEctoplasmQuest.tw#L120)** — NPC speech body mixes a long stage-direction (italic action) with spoken 'Door's behind you.' — needs splitting into <<narration>> + <<say>>.
  - `@@.notmc-speech; <i>She works the gag loose and drops it back in the drawer. Her shirt goes on like she's clocking in for a shift`
- **[L134](passages/witch/WitchEctoplasmQuest.tw#L134)** — NPC speech body mixes a stage-direction (italic action) with spoken 'When you start seeing what the houses leak...' — needs splitting into <<narration>> + <<say>>.
  - `@@.notmc-speech; <i>She doesn't look up from the scroll.</i> When you start seeing what the houses leak, jar it and bring it to `

### [passages/witch/WitchInsideNight.tw](passages/witch/WitchInsideNight.tw)

- **[L16](passages/witch/WitchInsideNight.tw#L16)** — A single @@.mc-speech;@@ open on line 16 wraps a multi-branch <<if>> chain (closes @@ on line 36) whose bodies are mostly terse narration/action prose, not spoken aloud (e.g. 'A loose page on Myling, dog-eared. You pocket it.', 'Nothing useful. Or nothing she lets you find.', 'A crucifix. Older than the church, by the weight of it.') and one branch is a <<goto "WitchTentaclesEvent">> with no spoken text at all. Splitting speech from narration here needs editorial judgment, so left byte-for-byte.
  - `@@.mc-speech;\n<<if _check eq 1>>\n<<if not setup.Ghosts.hasDiscovered("Myling")>>...A loose page on Myling, dog-eared. You pocket it.`

## `quoted` — 9

**What:** Speech body that already contains typed quote characters.  
**Action:** `<<mc>>`/`<<say>>` auto-add curly quotes — converting as-is would double-quote. Remove the hand-typed quotes, then wrap, OR leave the raw span if the quotes are intentional (e.g. a quote-within-a-quote).

### [passages/companion/CompanionLeaving.tw](passages/companion/CompanionLeaving.tw)

- **[L2](passages/companion/CompanionLeaving.tw#L2)** — An .notmc-speech body that already contains a typed closing double-quote ("...don't feel like myself.\""). Converting to <<say>> would double-quote (and the leading/trailing quote pairing is uneven). Needs human cleanup of the stray quote first. Left untouched.
  - `@@.notmc-speech; <<= setup.Mc.name()>>, wait, I don't feel well... This place is driving me crazy, I don't feel`

### [passages/companion/CompanionMain.tw](passages/companion/CompanionMain.tw)

- **[L131](passages/companion/CompanionMain.tw#L131)** — Body contains typed double-quote characters (the <<link "let's go together" ...>> argument). Wrapping with <<mc>> would risk double-quoting; also the speech word 'Yes,' is mixed with an interactive <<link>> spanning lines 131-132. Needs editorial split (speech vs. action link).
  - `@@.mc-speech; Yes, <<link "let's go together" `_companionHuntPassage`>>\n\t\t\t\t\t<</link>> @@`

### [passages/delivery/DeliveryEvent2.tw](passages/delivery/DeliveryEvent2.tw)

- **[L25](passages/delivery/DeliveryEvent2.tw#L25)** — NPC speech body already contains typed straight quotes around 'don't like it'; converting would double-quote.
  - `@@.notmc-speech; Yes, I see how you "don't like it". Will you cum for me, slut?@@`

### [passages/gym/GymTrainerEvent2Start2.tw](passages/gym/GymTrainerEvent2Start2.tw)

- **[L5](passages/gym/GymTrainerEvent2Start2.tw#L5)** — NPC speech body already contains typed double-quotes around "help" (would double-quote under <<say>>), and also has a stray ~ after 'Phew'. Needs a human to strip the quotes and decide on the breath.
  - `@@.notmc-speech; Phew~ thanks for the "help". I guess we can do that again sometimes.@@`

### [passages/home/summoning/SuccubusChoice.tw](passages/home/summoning/SuccubusChoice.tw)

- **[L78](passages/home/summoning/SuccubusChoice.tw#L78)** — MC speech body already contains typed double-quote characters; converting to <<mc>> would double-quote it.
  - `@@.mc-speech; "I'm... I'm cumming... oh fuck!"@@<br>`

### [passages/special_event/GhostSpecialEventWraith.tw](passages/special_event/GhostSpecialEventWraith.tw)

- **[L23](passages/special_event/GhostSpecialEventWraith.tw#L23)** — MC speech body already contains typed double-quote characters; converting to <<mc>> would double-quote it. Left byte-for-byte.
  - `@@.mc-speech; "Help! Please, someone, help me!"@@<br>`
- **[L25](passages/special_event/GhostSpecialEventWraith.tw#L25)** — NPC speech body already contains typed double-quote characters; converting to <<say>> would double-quote it. Left byte-for-byte.
  - `@@.notmc-speech; "Looks like we got lucky today..."@@<br>`
- **[L36](passages/special_event/GhostSpecialEventWraith.tw#L36)** — MC speech body already contains typed double-quote characters (duplicate of the escape-failure branch); converting would double-quote. Left byte-for-byte.
  - `@@.mc-speech; "Help! Please, someone, help me!"@@<br>`
- **[L38](passages/special_event/GhostSpecialEventWraith.tw#L38)** — NPC speech body already contains typed double-quote characters (duplicate of the escape-failure branch); converting would double-quote. Left byte-for-byte.
  - `@@.notmc-speech; "Looks like we got lucky today..."@@<br>`

## `moan-mixed` — 142

**What:** Words + a `~moan~` in one speech body.  
**Action:** Split the spoken words into `<<mc>>`/`<<say>>` and the breath into `<<vocal mc>>`/`<<vocal npc>>` (drop the literal `~`; the macro re-adds them). Where the moan is woven mid-sentence, decide whether it reads better as a separate `<<vocal>>` beat or stays inline as plain `~…~` text.

### [passages/church/ToolsEventChurch.tw](passages/church/ToolsEventChurch.tw)

- **[L7](passages/church/ToolsEventChurch.tw#L7)** — NPC-speech body mixes spoken words with a ~ tilde moan marker (Oh~keep). Needs editorial split.
  - `@@.notmc-speech; Oh~keep sucking it my girl@@`
- **[L8](passages/church/ToolsEventChurch.tw#L8)** — MC-speech body is a tilde vocalisation but with internal tildes (~Hmng~ulrp~), not a single clean ~X~ wrap. Stripping outer tildes leaves a stray inner tilde; needs a human to decide segmentation before using <<vocal mc>>.
  - `@@.mc-speech; ~Hmng~ulrp~@@`

### [passages/church/ToolsEventChurch1.tw](passages/church/ToolsEventChurch1.tw)

- **[L4](passages/church/ToolsEventChurch1.tw#L4)** — NPC-speech body mixes spoken words with a ~ tilde moan marker (Oh~). Needs editorial split of the moan from the speech.
  - `@@.notmc-speech; Oh~ you're so hot, I'm going to cum soon@@`
- **[L8](passages/church/ToolsEventChurch1.tw#L8)** — MC-speech body mixes spoken words with a ~moan~ (Fuck ~I can feel...~). Needs editorial split.
  - `@@.mc-speech; Fuck ~I can feel every millimeter of your huge dick in my ass, so good~@@`
- **[L9](passages/church/ToolsEventChurch1.tw#L9)** — NPC-speech body mixes spoken words with a ~ tilde moan marker (Oh god~). Needs editorial split.
  - `@@.notmc-speech; Oh god~ your asshole is so tight, I'm [[cumming|ToolsEventChurchEnd]]@@`
- **[L13](passages/church/ToolsEventChurch1.tw#L13)** — MC-speech body mixes spoken words with a ~AH~ tilde moan. Needs editorial split.
  - `@@.mc-speech; Fuck~AH~ cum [[on my face|ToolsEventChurchEnd]]@@<br>`

### [passages/church/ToolsEventChurchEnd.tw](passages/church/ToolsEventChurchEnd.tw)

- **[L3](passages/church/ToolsEventChurchEnd.tw#L3)** — MC speech body mixes a spoken word ("Holy") with a tilde vocalisation ("Holy~"). Words + ~moan~ in one body; needs splitting into <<mc>> + <<vocal mc>> by a human.
  - `@@.mc-speech; Holy~ so much cum@@`

### [passages/companion/CompanionMain.tw](passages/companion/CompanionMain.tw)

- **[L151](passages/companion/CompanionMain.tw#L151)** — Multi-line .mc-speech body (lines 151-153) mixes spoken words with a bare ~ tilde vocalisation mid-text and contains <<br>> line breaks. Words + ~moan~ mixed in one body must not be auto-converted; needs a human to separate speech from the vocalisation.
  - `@@.mc-speech; I don't care. I just want to get out of here as soon as possible. Besides, I've walked down the street naked before... It's actually kind of fu…`

### [passages/companion/alice/AliceContinue.tw](passages/companion/alice/AliceContinue.tw)

- **[L7](passages/companion/alice/AliceContinue.tw#L7)** — Speech body "Oh~ yeah," mixes spoken words with a tilde vocalisation (not a pure ~X~ body); also used inline before a linkappend with a separate .mc-speechLink class.
  - `@@.mc-speech; Oh~ yeah,@@ <<linkappend "@@.mc-speechLink;kiss my pussy@@">>`
- **[L23](passages/companion/alice/AliceContinue.tw#L23)** — Speech body "Yeah~" is a word with a trailing tilde, not a pure ~X~ vocalisation; mixed words + moan needs editorial judgment.
  - `@@.mc-speech;Yeah~@@`

### [passages/companion/alice/AliceSpiritEvent.tw](passages/companion/alice/AliceSpiritEvent.tw)

- **[L10](passages/companion/alice/AliceSpiritEvent.tw#L10)** — A .notmc-speech body that mixes a spoken/letter token ("Mm") with chained tilde vocalisations (~slurp~slurp~). Not a clean single ~X~ wrap, so it can't become a bare <<vocal npc>>; a human should decide whether to split it into a <<say>> plus a <<vocal npc>> or rewrite the moan run.
  - `@@.notmc-speech; Mm~slurp~slurp~@@<br>`

### [passages/companion/alice/AliceWalkHome.tw](passages/companion/alice/AliceWalkHome.tw)

- **[L11](passages/companion/alice/AliceWalkHome.tw#L11)** — Body 'Yes~' mixes a spoken word with a freeform tilde vocalisation (not a pure ~X~ moan), and the span sits inline before a <<linkappend>> on the same line (whose label is a separate @@.mc-speechLink; class). Needs editorial split into speech + vocal; do not auto-convert.
  - `@@.mc-speech; Yes~ @@<<linkappend "@@.mc-speechLink; let's do it. @@">>`
- **[L31](passages/companion/alice/AliceWalkHome.tw#L31)** — Body mixes a tilde vocalisation ('Yeah~') with spoken words and a wikilink. Mixed word + ~moan~; needs editorial split, do not auto-convert.
  - `@@.mc-speech;Yeah~Do you want to [[take a shower|AliceContinue]] with me?@@<br> <b>or</b> <br>`

### [passages/companion/blake/BlakeContinue.tw](passages/companion/blake/BlakeContinue.tw)

- **[L3](passages/companion/blake/BlakeContinue.tw#L3)** — MC speech body mixes a tilde vocalisation fragment ('Ah~') with spoken words ('I'm almost there...'). Per spec, do not convert when words and a ~moan~ are mixed; needs a human to split into <<vocal mc>> + <<mc>>.
  - `@@.mc-speech; Ah~ I'm almost there...@@`
- **[L10](passages/companion/blake/BlakeContinue.tw#L10)** — MC speech body is 'Yeah~' — a spoken word with a trailing tilde, not a clean symmetric ~moan~ and not plain speech. Contains a stray tilde, so neither <<mc>> nor <<vocal mc>> applies cleanly; needs editorial judgment.
  - `@@.mc-speech;Yeah~@@`

### [passages/companion/blake/BlakeSpiritEvent.tw](passages/companion/blake/BlakeSpiritEvent.tw)

- **[L37](passages/companion/blake/BlakeSpiritEvent.tw#L37)** — Body mixes a spoken word ("Mm") with tilde-wrapped vocalisations (~slurp~slurp~); not a single clean ~X~ vocalisation, so neither <<say>> nor <<vocal>> applies cleanly. Needs editorial split.
  - `@@.notmc-speech; Mm~slurp~slurp~@@<br>`

### [passages/companion/blake/BlakeWalkHome.tw](passages/companion/blake/BlakeWalkHome.tw)

- **[L14](passages/companion/blake/BlakeWalkHome.tw#L14)** — MC speech body 'Yes~' mixes a spoken word with a trailing ~ tilde vocalisation (not a pure ~moan~ body), and the span is used inline immediately before <<linkappend>>. Both mixed-vocal and inline-block concerns; needs human judgment on split vs <<vocal>>.
  - `@@.mc-speech; Yes~ @@<<linkappend "@@.mc-speechLink; let's do it. @@">>`

### [passages/companion/brook/BrookSpiritEvent.tw](passages/companion/brook/BrookSpiritEvent.tw)

- **[L23](passages/companion/brook/BrookSpiritEvent.tw#L23)** — A .notmc-speech body that mixes a spoken/letter token ("Mm") with chained tilde vocalisations (~slurp~slurp~). Not a clean single ~X~ wrap, so it can't become a bare <<vocal npc>>; a human should decide whether to split it into a <<say>> plus a <<vocal npc>> or rewrite the moan run.
  - `@@.notmc-speech; Mm~slurp~slurp~@@<br>`

### [passages/companion/brook/BrookWalkHome.tw](passages/companion/brook/BrookWalkHome.tw)

- **[L10](passages/companion/brook/BrookWalkHome.tw#L10)** — MC speech body mixes a spoken phrase with a tilde vocalisation ('Yes~ let's do it.'). Not a pure tilde moan; needs editorial split before macro conversion.
  - `@@.mc-speech; Yes~ let's do it. @@`
- **[L28](passages/companion/brook/BrookWalkHome.tw#L28)** — MC speech body is a word + tilde ('Yeah~'); not a pure tilde moan, so neither a clean <<vocal mc>> nor a clean <<mc>>. Needs editorial decision.
  - `@@.mc-speech;Yeah~@@`

### [passages/delivery/DeliveryEvent1.tw](passages/delivery/DeliveryEvent1.tw)

- **[L14](passages/delivery/DeliveryEvent1.tw#L14)** — Body mixes a ~God~ tilde vocalisation with ordinary spoken words ('Don't stop please, I'm cumming') in one .mc-speech span. Not a pure moan and not pure speech; needs editorial split into <<vocal mc>> + <<mc>>.
  - `@@.mc-speech; ~God~ Don't stop please, I'm cumming@@<br>`
- **[L33](passages/delivery/DeliveryEvent1.tw#L33)** — Body interleaves tilde fragments (Mm~ ... ~m~) with the word 'No'. Mixed moan + words in one .mc-speech span; cannot mechanically resolve to a single <<vocal>> or <<mc>>.
  - `@@.mc-speech; Mm~ No...~m~No@@<br>`
- **[L43](passages/delivery/DeliveryEvent1.tw#L43)** — Body uses tildes as inline separators between spoken phrases ('Oh', 'Please don't stop', 'Your cock is so good'). Mixed words + ~ markers in one .mc-speech span; not a pure moan.
  - `@@.mc-speech; Oh~Please don't stop~Your cock is so good~@@<br>`
- **[L48](passages/delivery/DeliveryEvent1.tw#L48)** — Body mixes a tilde with spoken words ('Oh' ~ 'it feels amazing') in one .mc-speech span. Mixed moan + words; needs editorial split.
  - `@@.mc-speech; Oh~it feels amazing@@<br>`
- **[L58](passages/delivery/DeliveryEvent1.tw#L58)** — Body mixes a tilde with spoken words ('Oh' ~ "i'm cumming" ~) in one .mc-speech span. Mixed moan + words; not a pure ~tilde~ vocalisation.
  - `@@.mc-speech; Oh~i'm cumming~@@<br>`
- **[L61](passages/delivery/DeliveryEvent1.tw#L61)** — Body mixes a tilde with spoken words ('Oh' ~ 'so much cum') in one .mc-speech span. Mixed moan + words; not a pure moan.
  - `@@.mc-speech; Oh~so much cum@@<br>`

### [passages/delivery/DeliveryEvent2.tw](passages/delivery/DeliveryEvent2.tw)

- **[L12](passages/delivery/DeliveryEvent2.tw#L12)** — MC speech body mixes spoken words with a ~tilde~ moan ("Ah~ Did you cum inside me?"). Needs a human to split the moan into <<vocal mc>> from the spoken line.
  - `@@.mc-speech; Ah~ Did you cum inside me?@@`
- **[L26](passages/delivery/DeliveryEvent2.tw#L26)** — MC speech span opens here and only closes at the matching @@ after the <</linkappend>> (orig line 38). Body mixes spoken words with ~tilde~ moans ("Ah~ YES~ Fuck me~ PLEASE") and wraps a multi-line <<linkappend>> containing further nested .notmc-speech/.mc-speech/.mc-thoughts spans. Whole structure left untouched; the nested inner spans (orig lines 29,30,31,33) were deliberately NOT converted because they sit inside this open mc-speech block.
  - `@@.mc-speech; Ah~ YES~ Fuck me~ PLEASE, <<linkappend "I'M CUMMING">>`
- **[L44](passages/delivery/DeliveryEvent2.tw#L44)** — NPC speech body mixes spoken words with a ~tilde~ moan ("Ohhh~ maybe you should pay me instead"). Needs a human to split the moan into <<vocal npc>>.
  - `@@.notmc-speech; Ohhh~ maybe you should pay me instead@@`

### [passages/delivery/DeliveryEventChoose.tw](passages/delivery/DeliveryEventChoose.tw)

- **[L66](passages/delivery/DeliveryEventChoose.tw#L66)** — Multi-line .notmc-speech body (spans lines 66-67, closes with @@ after 'touch it?') mixing spoken words with a stray '~' marker in 'Yea~I mean'. The tilde mixed into the words makes this not a clean speech conversion; a human should decide whether the ~ is a hesitation dash to keep verbatim or a vocalisation to split out.
  - `@@.notmc-speech; Yea~I mean, I don't understand what you mean...<br>`

### [passages/delivery/DeliveryEventStart.tw](passages/delivery/DeliveryEventStart.tw)

- **[L18](passages/delivery/DeliveryEventStart.tw#L18)** — Body mixes a ~Mm~ vocalisation with spoken words; not a clean <<mc>> or whole-body <<vocal>>. Needs split into <<vocal mc>> + <<mc>>.
  - `@@.mc-speech; ~Mm~ my pussy is all yours@@`
- **[L19](passages/delivery/DeliveryEventStart.tw#L19)** — NPC line opens with a 'Ha~' breath fused to spoken words; mixed vocalisation + speech needs a human to split into <<vocal npc>> + <<say>>.
  - `@@.notmc-speech; Ha~ i know, suck a little more baby@@`
- **[L31](passages/delivery/DeliveryEventStart.tw#L31)** — Body mixes an 'Ah~' breath with the spoken words 'It hurts'; needs split into <<vocal mc>> + <<mc>>.
  - `@@.mc-speech; Ah~ It hurts@@`
- **[L40](passages/delivery/DeliveryEventStart.tw#L40)** — Spoken words 'Maybe you are right' fused with a '~AH~' moan in one body; needs split into <<mc>> + <<vocal mc>>.
  - `@@.mc-speech; Maybe you are right~AH~@@`
- **[L56](passages/delivery/DeliveryEventStart.tw#L56)** — NPC line opens with a 'Yea~' breath fused to spoken words; mixed vocalisation + speech needs splitting.
  - `@@.notmc-speech; Yea~ that's it, you're a good girl. Here you go, you've earned it@@`
- **[L63](passages/delivery/DeliveryEventStart.tw#L63)** — MC body mixes a 'Mm~' breath, spoken words, and a choice link with a trailing '~' inside the link text; needs editorial split.
  - `@@.mc-speech; Mm~ my pussy is so wet, please [[fuck me~|DeliveryEvent1]] @@`
- **[L78](passages/delivery/DeliveryEventStart.tw#L78)** — Spoken words wrapped around a '~AH~' moan ('right~AH~, work can wait'); needs split into <<mc>> + <<vocal mc>>.
  - `@@.mc-speech; Maybe you are right~AH~, work can wait@@`
- **[L83](passages/delivery/DeliveryEventStart.tw#L83)** — Leading ~Hmng~ulrp~ vocalisation fused with the spoken words 'It's too big to fit in my mouth'; needs split into <<vocal mc>> + <<mc>>.
  - `@@.mc-speech; ~Hmng~ulrp~ It's too big to fit in my mouth@@`
- **[L84](passages/delivery/DeliveryEventStart.tw#L84)** — NPC line opens with an 'Oh~' breath fused to spoken words; mixed vocalisation + speech needs splitting into <<vocal npc>> + <<say>>.
  - `@@.notmc-speech; Oh~ I think it will fit in your pussy, I'm sure you're all wet@@`

### [passages/delivery/DeliverySpecialEvent.tw](passages/delivery/DeliverySpecialEvent.tw)

- **[L77](passages/delivery/DeliverySpecialEvent.tw#L77)** — Body mixes a ~moan~ with spoken words ('~Ah~ just be quick'), so it is neither a pure <<vocal>> nor a clean <<mc>> spoken line; needs splitting.
  - `@@.mc-speech; ~Ah~ just be quick@@<br>`
- **[L85](passages/delivery/DeliverySpecialEvent.tw#L85)** — Body mixes a ~moan~ with spoken words ('~Ah~ God...'), so it is neither a pure <<vocal>> nor a clean <<mc>> spoken line; needs splitting.
  - `@@.mc-speech; ~Ah~ God...@@<br>`

### [passages/events/EventMC.tw](passages/events/EventMC.tw)

- **[L23](passages/events/EventMC.tw#L23)** — MC speech body mixes spoken words with an embedded ~ vocalisation (N-Nooo~); not a clean single moan or pure speech.
  - `@@.mc-speech; N-Nooo~ What is this disgusting thing?! Get away from me!@@`

### [passages/events/widgetEvent.tw](passages/events/widgetEvent.tw)

- **[L15](passages/events/widgetEvent.tw#L15)** — An .mc-speech body mixing spoken words with embedded ~tilde~ moan markers ("AHH~" and "so hard~!!"). Words + moan in one body: needs human split into <<mc>> speech + <<vocal mc>> breath. Left untouched.
  - `@@.mc-speech; AHH~ I-I'm cumming!! Oh god, I'm cumming so hard~!!@@<br>`
- **[L20](passages/events/widgetEvent.tw#L20)** — An .mc-speech body mixing spoken words with embedded ~tilde~ moan markers ("my ass~?!" and "happening~!!"). Words + moan in one body: needs human split into <<mc>> speech + <<vocal mc>> breath. Left untouched.
  - `@@.mc-speech; N-no... I'm... I'm cumming from my ass~?! This can't be happening~!!@@<br>`

### [passages/gui/widgetWebcam.tw](passages/gui/widgetWebcam.tw)

- **[L6](passages/gui/widgetWebcam.tw#L6)** — MC speech body mixes spoken words with a partial tilde vocalisation ('Oh~'); not a pure tilde moan, so not a clean <<vocal>> or <<mc>> conversion. Needs editorial split.
  - `@@.mc-speech; Do you guys like this? Oh~ I'm so wet. I wish someone would lick my juicy pussy. @@`
- **[L17](passages/gui/widgetWebcam.tw#L17)** — MC speech body interleaves spoken words with multiple ~tilde~ moans ('~Ahh~I'm cu... ~Ohhhh fuck~ that was awesome...'). Mixed words+moans must be split by hand into <<vocal>> + <<mc>>.
  - `@@.mc-speech; ~Ahh~I'm cu... ~Ohhhh fuck~ that was awesome. I hope you guys enjoyed the show too@@`
- **[L29](passages/gui/widgetWebcam.tw#L29)** — MC speech body interleaves spoken words with multiple ~tilde~ moans. Mixed words+moans must be split by hand into <<vocal>> + <<mc>>.
  - `@@.mc-speech; ~Ahh~I'm cu... ~Ohhhh fuck~ that was awesome. I hope you guys enjoyed the show too@@`
- **[L41](passages/gui/widgetWebcam.tw#L41)** — MC speech body interleaves spoken words with multiple ~tilde~ moans. Mixed words+moans must be split by hand into <<vocal>> + <<mc>>.
  - `@@.mc-speech; ~Ahh~I'm cu... ~Ohhhh fuck~ that was awesome. I hope you guys enjoyed the show too@@`
- **[L53](passages/gui/widgetWebcam.tw#L53)** — MC speech body interleaves spoken words with multiple ~tilde~ moans. Mixed words+moans must be split by hand into <<vocal>> + <<mc>>.
  - `@@.mc-speech; ~Ahh~I'm cu... ~Ohhhh fuck~ that was awesome. I hope you guys enjoyed the show too@@`

### [passages/gym/GymGroupEvent1Start.tw](passages/gym/GymGroupEvent1Start.tw)

- **[L4](passages/gym/GymGroupEvent1Start.tw#L4)** — MC speech body mixes spoken words with an embedded ~fuck~ moan and a trailing ~.
  - `@@.mc-speech; Oh ~fuck~ this is so good~@@`
- **[L14](passages/gym/GymGroupEvent1Start.tw#L14)** — MC speech body mixes spoken words with trailing ~tilde~ vocalisations.
  - `@@.mc-speech; It's amazing~ Keep going, please~@@`

### [passages/gym/GymGroupEvent1Start2.tw](passages/gym/GymGroupEvent1Start2.tw)

- **[L8](passages/gym/GymGroupEvent1Start2.tw#L8)** — @@.notmc-speech;@@ body mixes spoken words with a ~ vocalisation in one block ("Yes~Finger your juicy pussy."). Needs splitting into <<vocal npc>> + <<say>> by a human; not a clean wrapper swap.
  - `@@.notmc-speech; Yes~Finger your juicy pussy.@@`
- **[L9](passages/gym/GymGroupEvent1Start2.tw#L9)** — @@.mc-speech;@@ body mixes spoken words with ~ vocalisations ("Fuck~ i'm about to~"). Needs human split into <<mc>>/<<vocal mc>>; not a clean wrapper swap.
  - `@@.mc-speech; Fuck~ i'm about to~@@`

### [passages/gym/GymTrainerEvent1Start.tw](passages/gym/GymTrainerEvent1Start.tw)

- **[L17](passages/gym/GymTrainerEvent1Start.tw#L17)** — MC speech body is words mixed with ~tilde~ vocalisations (AGH plus ~gulp~ ~galp~); not a clean single moan.
  - `@@.mc-speech; AGH~gulp~galp~@@`

### [passages/gym/GymTrainerEvent1Start1.tw](passages/gym/GymTrainerEvent1Start1.tw)

- **[L8](passages/gym/GymTrainerEvent1Start1.tw#L8)** — MC speech body mixes spoken words with embedded ~tilde~ moans; needs human split into speech + <<vocal mc>>.
  - `@@.mc-speech; Ohhhh god, yes~ fuck me harder~yesss@@`

### [passages/gym/GymTrainerEvent2Start.tw](passages/gym/GymTrainerEvent2Start.tw)

- **[L8](passages/gym/GymTrainerEvent2Start.tw#L8)** — NPC speech body mixes a ~tilde~ moan (Yes~) with spoken words. Needs editorial split; not a clean wrapper swap.
  - `@@.notmc-speech; Yes~ suck it, you are such a slut @@<br>`
- **[L9](passages/gym/GymTrainerEvent2Start.tw#L9)** — Body is a multi-tilde vocalisation (Gulp~guulp~AGH~), not a single clean ~X~ wrapper, so it does not fit <<vocal mc>> mechanically. Human should decide how to render the layered moans.
  - `@@.mc-speech; Gulp~guulp~AGH~@@<br>`
- **[L20](passages/gym/GymTrainerEvent2Start.tw#L20)** — NPC speech body mixes a ~tilde~ moan (Oh~) with spoken words and embeds a [[link]] target. Needs editorial split between vocalisation and speech; not a clean wrapper swap.
  - `@@.notmc-speech; Oh~ i'm cumming, open your fucking  [[mouth|GymTrainerEvent2Start2]]@@<br>`

### [passages/haunted_houses/general/BaitOrgasm.tw](passages/haunted_houses/general/BaitOrgasm.tw)

- **[L19](passages/haunted_houses/general/BaitOrgasm.tw#L19)** — MC speech body mixes a ~tilde~ vocalisation (A-ahh~) with spoken words. Needs editorial split into <<vocal mc>> + <<mc>>; also mirrors the same string on line 18, so the two should be handled together.
  - `@@.mc-speech; A-ahh~ I can't — I can't stop —!@@<br>`

### [passages/haunted_houses/general/NudityEventTwo.tw](passages/haunted_houses/general/NudityEventTwo.tw)

- **[L10](passages/haunted_houses/general/NudityEventTwo.tw#L10)** — Multi-line .notmc-speech span (opens line 10, closes line 11) whose body mixes a ~tilde~ vocalisation (Oh~) with spoken words, contains an embedded <br> and a <<= >> expression. Needs editorial split into <<vocal npc>> + <<say>>; not a clean wrapper swap.
  - `@@.notmc-speech; Oh~ <<= setup.Mc.name()>>, this is weird, but I'm actually starting to like it. <br> ⏎ I'm so turned on, I feel`
- **[L12](passages/haunted_houses/general/NudityEventTwo.tw#L12)** — MC speech body mixes a ~tilde~ moan (Hehe~) with spoken words. Should be split into <<vocal mc>> + <<mc>> by a human; not convertible mechanically.
  - `@@.mc-speech; Hehe~ and you called me a slut... How about you walk me home first?@@`

### [passages/haunted_houses/general/UseCursedItem.tw](passages/haunted_houses/general/UseCursedItem.tw)

- **[L11](passages/haunted_houses/general/UseCursedItem.tw#L11)** — MC speech body mixes a ~tilde~ moan with spoken words ("Ah~ I can't... and don't want to... stop") and also embeds a stray <br> inside the span. Not a clean whole-body vocalisation and not a clean spoken line; needs editorial split. Left byte-for-byte.
  - `@@.mc-speech; Ah~ I can't... and don't want to... stop <br>@@`

### [passages/haunted_houses/tools/widgetTarot.tw](passages/haunted_houses/tools/widgetTarot.tw)

- **[L10](passages/haunted_houses/tools/widgetTarot.tw#L10)** — Speech body mixes spoken words with a tilde moan fragment ("Ah~"). Needs splitting into a <<vocal mc>> moan + <<mc>> speech; not a clean wrapper swap.
  - `@@.mc-speech; Ah~ I'm getting so wet down there... mmm. @@`
- **[L22](passages/haunted_houses/tools/widgetTarot.tw#L22)** — Speech body mixes words with a tilde moan ("oh~") AND spans two lines with an internal <br>. Needs editorial split into vocal + speech.
  - `@@.mc-speech; My... oh~ my little asshole is pulsating so hard... <br> ⏎ Somehow, I feel much better after that...@@`

### [passages/home/Bedroom.tw](passages/home/Bedroom.tw)

- **[L43](passages/home/Bedroom.tw#L43)** — MC speech body mixes spoken words with a stray tilde vocalisation ('Phew~'); not a whole-body ~X~ moan, so cannot convert to <<mc>> or <<vocal>>. Needs human to split the breath from the words.
  - `@@.mc-speech;Phew~ why is this happening? I'm so turned on right now...@@`
- **[L47](passages/home/Bedroom.tw#L47)** — MC speech body mixes words with an inline tilde ('oh~'); not a whole-body vocalisation. Needs human to separate moan from speech.
  - `@@.mc-speech;That was... oh~ I still feel it. I think I came in my sleep...@@`
- **[L51](passages/home/Bedroom.tw#L51)** — MC speech body mixes words with an inline tilde ('oh~'); not a whole-body vocalisation. Needs human to separate moan from speech.
  - `@@.mc-speech;That was... oh~ I still feel it. I think I came in my sleep, not just once...@@`

### [passages/home/Livingroom.tw](passages/home/Livingroom.tw)

- **[L15](passages/home/Livingroom.tw#L15)** — Body mixes spoken words with a trailing tilde vocalisation ("Hehe~"). Not a clean whole-body ~moan~, so not a <<vocal>> case, and converting to <<mc>> would leave a stray tilde inside a spoken line. Needs editorial split (speech + <<vocal>>).
  - `@@.mc-speech; How long did I sleep? Doesn't matter, I feel fantastic! Hehe~@@`

### [passages/home/cursedItems/CursedBathEvent.tw](passages/home/cursedItems/CursedBathEvent.tw)

- **[L18](passages/home/cursedItems/CursedBathEvent.tw#L18)** — Body mixes shouted words/punctuation with embedded ~ tilde marks (MMPH~! Mmhh~!!); tildes are not a clean single ~X~ wrap of the whole body, so it is not a clean <<vocal>> case. Needs editorial decision on how to split the spoken cry from the moan markers.
  - `@@.mc-speech; MMPH~! Mmhh~!!@@`
- **[L20](passages/home/cursedItems/CursedBathEvent.tw#L20)** — Body mixes a ~ moan marker (ahh~) with clearly spoken words (it hurts... s-stop... too much...!). Cannot cleanly become <<mc>> (would absorb a tilde) or <<vocal>> (has real speech). Needs a human to split into speech + vocal.
  - `@@.mc-speech; Ah-- ahh~ it hurts... s-stop... too much...!@@`

### [passages/home/cursedItems/CursedBedEvent.tw](passages/home/cursedItems/CursedBedEvent.tw)

- **[L21](passages/home/cursedItems/CursedBedEvent.tw#L21)** — MC speech body mixes spoken words ('more... give me more') with tilde vocalisations ('Mmh~' and trailing '~'). Needs editorial split into <<mc>> speech + <<vocal mc>> moan.
  - `@@.mc-speech; Mmh~ more... give me more~@@<br>`

### [passages/home/cursedItems/CursedPCEvent.tw](passages/home/cursedItems/CursedPCEvent.tw)

- **[L44](passages/home/cursedItems/CursedPCEvent.tw#L44)** — The .mc-speech body mixes spoken words with tilde moan markers (AHHH~, FUCK~) rather than being a single clean ~tilde~ vocalisation. Needs editorial judgment to split the moans from the speech (likely <<vocal mc>> + <<mc>>). Left byte-for-byte unchanged.
  - `@@.mc-speech; AHHH~ oh FUCK~ oh god oh god oh god--@@`

### [passages/home/cursedItems/CursedShowerEvent.tw](passages/home/cursedItems/CursedShowerEvent.tw)

- **[L13](passages/home/cursedItems/CursedShowerEvent.tw#L13)** — MC speech body mixes spoken words with ~tilde~ vocalisations ('Ahh~ ah~ ... I need more~'); cannot convert cleanly to either <<mc>> or <<vocal mc>>. Needs a human to split words vs moans.
  - `@@.mc-speech; Ahh~ ah~ oh god... why can't I stop... I need more~@@`
- **[L18](passages/home/cursedItems/CursedShowerEvent.tw#L18)** — MC speech body mixes spoken words with ~tilde~ vocalisations ('Oh fuck~ oh fuck yes~ it's so deep...'); cannot convert cleanly. Needs a human to split words vs moans.
  - `@@.mc-speech; Oh fuck~ oh fuck yes~ it's so deep...@@`

### [passages/home/cursedItems/CursedTVEvent.tw](passages/home/cursedItems/CursedTVEvent.tw)

- **[L11](passages/home/cursedItems/CursedTVEvent.tw#L11)** — MC speech body mixes spoken words ("How did I--") with a ~tilde~ vocalisation ("mmph~"); needs split into <<mc>> + <<vocal mc>>.
  - `@@.mc-speech; How did I-- mmph~@@`
- **[L16](passages/home/cursedItems/CursedTVEvent.tw#L16)** — MC speech body is multiple tilde fragments interleaved with text ("Mmh~! Ah... ahh~!"), not a single clean ~X~ vocalisation; not a safe <<vocal>> wrap.
  - `@@.mc-speech; Mmh~! Ah... ahh~!@@`

### [passages/home/pc/Masturbate.tw](passages/home/pc/Masturbate.tw)

- **[L19](passages/home/pc/Masturbate.tw#L19)** — MC speech body mixes spoken words with a moan/breath ('Fuuhh~') and the tilde is unbalanced (single ~ after Fuuhh, not a ~X~ vocalisation). Needs a human to split the breath into <<vocal mc>> and the words into <<mc>>.
  - `@@.mc-speech; Fuuhh~, i need to rest a bit@@`

### [passages/home/summoning/SuccubusChoice.tw](passages/home/summoning/SuccubusChoice.tw)

- **[L87](passages/home/summoning/SuccubusChoice.tw#L87)** — Body is a moan word with only a trailing tilde ("Mmm~"), not a clean fully-wrapped ~X~ vocalisation, so it is not a safe <<vocal mc>> conversion.
  - `@@.mc-speech; Mmm~@@<br>`
- **[L117](passages/home/summoning/SuccubusChoice.tw#L117)** — Body is a moan word with only a trailing tilde ("Mmm~"), not a clean fully-wrapped ~X~ vocalisation, so it is not a safe <<vocal mc>> conversion.
  - `@@.mc-speech; Mmm~@@<br>`

### [passages/home/summoning/SuccubusEventTV.tw](passages/home/summoning/SuccubusEventTV.tw)

- **[L5](passages/home/summoning/SuccubusEventTV.tw#L5)** — MC speech body mixes a spoken word ("so boring") with a ~tilde~ vocalisation ("Ah~"); needs split into <<mc>> + <<vocal mc>> by a human.
  - `@@.mc-speech; Ah~ so boring.@@`
- **[L32](passages/home/summoning/SuccubusEventTV.tw#L32)** — MC speech body mixes spoken words ("I I can't") with a ~tilde~ vocalisation ("Ah~"); needs split into <<mc>> + <<vocal mc>>.
  - `@@.mc-speech;I I can't Ah~@@`

### [passages/home/summoning/SummonMare.tw](passages/home/summoning/SummonMare.tw)

- **[L21](passages/home/summoning/SummonMare.tw#L21)** — mc-speech body mixes spoken words with a trailing ~ vocalisation (more~); not a pure tilde moan for <<vocal>> nor clean for <<mc>>.
  - `@@.mc-speech; More... oh, God, more~@@<br>`

### [passages/home/summoning/SummonSpirit.tw](passages/home/summoning/SummonSpirit.tw)

- **[L3](passages/home/summoning/SummonSpirit.tw#L3)** — Speech body mixes a non-tilde syllable (Glp) with a ~Ghlp~ tilde vocalisation; not a pure single ~X~ moan, so neither <<mc>> nor <<vocal>> is a clean swap. Left byte-for-byte.
  - `@@.mc-speech; Glp~Ghlp~@@<br>`
- **[L17](passages/home/summoning/SummonSpirit.tw#L17)** — Speech body mixes words with tilde vocalisations (Ah~ ... ass~); not a pure single ~X~ moan, so not a clean <<vocal>>/<<mc>> swap. Left byte-for-byte.
  - `@@.mc-speech; Ah~ My ass~@@<br>`

### [passages/home/summoning/SummonTwins.tw](passages/home/summoning/SummonTwins.tw)

- **[L7](passages/home/summoning/SummonTwins.tw#L7)** — mc-speech body mixes a ~ vocalisation (Oh~) with spoken words; not a pure tilde moan, so it can't become <<vocal>> and isn't clean enough for <<mc>>. Needs a human to split the moan from the line.
  - `@@.mc-speech; Oh~ I guess they're going@@`

### [passages/home/tentacles/TentaclesEventNap.tw](passages/home/tentacles/TentaclesEventNap.tw)

- **[L29](passages/home/tentacles/TentaclesEventNap.tw#L29)** — MC speech body mixes spoken words with a ~ moan tilde ("Oh~"). Not a clean speech line and not a pure ~tilde~ vocalisation, so neither <<mc>> nor <<vocal>> applies mechanically; needs a human to split the breath from the spoken sentence. Left byte-for-byte.
  - `@@.mc-speech; Oh~ fuck, I'm so fucked I can't even stand up.@@<br><br>`

### [passages/home/tentacles/TentaclesEventPC1.tw](passages/home/tentacles/TentaclesEventPC1.tw)

- **[L6](passages/home/tentacles/TentaclesEventPC1.tw#L6)** — Body mixes words with multiple inline ~tilde~ moan segments ("Ah~", "there~"). Not a single whole-body vocalisation, so neither <<mc>> nor <<vocal>> is clean. Needs editorial split.
  - `@@.mc-speech; Ah~ nooo not there~ Ahh@@`
- **[L12](passages/home/tentacles/TentaclesEventPC1.tw#L12)** — Body mixes words with inline ~tilde~ moan segments ("I~", "can't~"). Not a whole-body vocalisation; converting to <<mc>> would embed stray tildes in a spoken line. Needs editorial split.
  - `@@.mc-speech; Oh I I~ can't~ I'm@@`

### [passages/home/tentacles/TentaclesEventSleep.tw](passages/home/tentacles/TentaclesEventSleep.tw)

- **[L14](passages/home/tentacles/TentaclesEventSleep.tw#L14)** — Body mixes spoken words with a trailing ~ moan marker (not a pure ~X~ vocalisation, not clean speech). Needs human to split spoken text from <<vocal mc>>.
  - `@@.mc-speech;Oh no~@@<br>`
- **[L24](passages/home/tentacles/TentaclesEventSleep.tw#L24)** — Body mixes spoken words with embedded ~ moan markers. Needs human to split spoken words from <<vocal mc>> breaths.
  - `@@.mc-speech;Oh, fuck~ what's happening~ Ah@@<br>`
- **[L39](passages/home/tentacles/TentaclesEventSleep.tw#L39)** — Body mixes a moan/cry with a ~ marker before 'fuck' (unbalanced single tilde). Needs human to resolve into spoken + <<vocal mc>>.
  - `@@.mc-speech;Aahhh ~fuck@@`

### [passages/home/tentacles/TentaclesEventSleep1.tw](passages/home/tentacles/TentaclesEventSleep1.tw)

- **[L9](passages/home/tentacles/TentaclesEventSleep1.tw#L9)** — MC speech body 'Mgrm~ Mmm~' uses tildes as trailing moan markers on each syllable rather than a single clean ~X~ enclosure; not a clean <<vocal>> case. Left verbatim for editorial review.
  - `@@.mc-speech;Mgrm~ Mmm~@@<br>`

### [passages/hunt/HuntEventSuccubus.tw](passages/hunt/HuntEventSuccubus.tw)

- **[L33](passages/hunt/HuntEventSuccubus.tw#L33)** — Raw color:red succubus line that ALSO mixes spoken words with a ~moan~ marker ('Oh, fuck~'). Both reasons disqualify mechanical conversion: it is a raw-colour (not .notmc-speech) span, and words+tilde-moan are intermingled so no single macro fits. Needs a human to split the breath from the speech. Left byte-for-byte.
  - `@@color:red; Oh, fuck~ I've missed this so much...@@<br>`

### [passages/library/LibraryGuy.tw](passages/library/LibraryGuy.tw)

- **[L8](passages/library/LibraryGuy.tw#L8)** — mc-speech body mixes a ~ vocalisation (Oh~) with spoken words ('Hey! What do you think you're doing?!'); not a pure tilde moan and not clean for <<mc>>.
  - `@@.mc-speech; Oh~ Hey! What do you think you're doing?!@@<br>`

### [passages/library/LibraryGuy1.tw](passages/library/LibraryGuy1.tw)

- **[L17](passages/library/LibraryGuy1.tw#L17)** — Speech body mixes a ~Ha~ vocalisation with spoken words and a link; also sits inline next to a separate warningtext span on the same line. Needs a human to split the moan from the words.
  - `@@.mc-speech; Ha~, [[no way.|LibraryInside]]@@ @@.warningtext; (Req. <<statIcon setup.StatIcon.CORRUPTION>> ≥ 4)@@`
- **[L21](passages/library/LibraryGuy1.tw#L21)** — Speech body mixes ~Slurp~Slurlp~ vocalisations with spoken words; needs splitting into <<vocal mc>> plus speech/thought.
  - `@@.mc-speech; Slurp~Slurlp~ If someone sees us... Fuck! This thought makes my pussy even wetter, am I really such a slut?@@`
- **[L27](passages/library/LibraryGuy1.tw#L27)** — NPC speech body opens with an Oh~ vocalisation mixed with spoken words and spans two lines (closes line 28); needs splitting before conversion.
  - `@@.notmc-speech; Oh~ you're such a bad girl.<br> ⏎ 			See, no one noticed us, let's have a quick fuck right here@@`
- **[L37](passages/library/LibraryGuy1.tw#L37)** — Speech body mixes an Ah~ vocalisation with spoken words; needs splitting into <<vocal mc>> plus <<mc>>.
  - `@@.mc-speech; Ah~ you know how to please a woman. @@`
- **[L48](passages/library/LibraryGuy1.tw#L48)** — Speech body mixes a ~Ha~ vocalisation with spoken words and a link; also sits inline next to a separate warningtext span on the same line. Duplicate of the line 17 case in the skirt branch.
  - `@@.mc-speech; Ha~, [[no way.|LibraryInside]]@@ @@.warningtext; (Req. <<statIcon setup.StatIcon.CORRUPTION>> ≥ 4)@@`
- **[L59](passages/library/LibraryGuy1.tw#L59)** — NPC speech body opens with an Oh~ vocalisation mixed with spoken words; needs splitting into <<vocal npc>> plus speech.
  - `@@.notmc-speech; Oh~ You're really good at this...<br> How about a quickie? <br>@@`

### [passages/missing_women/RescueAshPossessed.tw](passages/missing_women/RescueAshPossessed.tw)

- **[L6](passages/missing_women/RescueAshPossessed.tw#L6)** — MC speech body mixes spoken words ('It's Ash!') with tilde vocalisations ('Ah~ that hurts~'); needs editorial split into <<mc>> + <<vocal mc>>.
  - `@@.mc-speech; It's Ash! Ah~ that hurts~@@`
- **[L8](passages/missing_women/RescueAshPossessed.tw#L8)** — MC speech body mixes spoken words with a trailing ~moan~ ('what have I done~'); needs editorial split.
  - `@@.mc-speech; Oh no, what have I done~@@`
- **[L11](passages/missing_women/RescueAshPossessed.tw#L11)** — MC speech body mixes spoken words ('My pussy! You finger it too hard.') with a ~moan~ ('Ohhhhh fuck~'); needs editorial split.
  - `@@.mc-speech; Ohhhhh fuck~ My pussy! You finger it too hard.@@`
- **[L15](passages/missing_women/RescueAshPossessed.tw#L15)** — MC speech body mixes vocalisations and onomatopoeia with tildes ('Uhhng~ Glp Gulp~'); not a single clean ~tilde~ vocalisation, so not safe to convert to <<vocal mc>>.
  - `@@.mc-speech; Uhhng~ Glp Gulp~@@`
- **[L23](passages/missing_women/RescueAshPossessed.tw#L23)** — MC speech body mixes a ~moan~ ('Mm~') with spoken words ('what are you doing...'); needs editorial split.
  - `@@.mc-speech; Mm~ what are you doing...@@`

### [passages/missing_women/RescueAshPossessed1.tw](passages/missing_women/RescueAshPossessed1.tw)

- **[L11](passages/missing_women/RescueAshPossessed1.tw#L11)** — MC speech body mixes spoken words with ~tilde~ vocalisations ('Nooo this is not right...~ But feels sooo good~'); cannot convert cleanly to <<mc>> or <<vocal mc>>. Needs a human to split words vs moans.
  - `@@.mc-speech; Nooo this is not right...~ But feels sooo good~@@`

### [passages/missing_women/RescueJadePossessed1.tw](passages/missing_women/RescueJadePossessed1.tw)

- **[L7](passages/missing_women/RescueJadePossessed1.tw#L7)** — MC speech body mixes spoken words with embedded ~tilde~ moans (OH~ Fuck~). Needs a human to split words from vocalisation; not a clean <<mc>> or <<vocal mc>>.
  - `@@.mc-speech; OH~ Fuck~ I'm going to...@@<br>`
- **[L11](passages/missing_women/RescueJadePossessed1.tw#L11)** — MC speech body contains an embedded ~tilde~ (Wha~what) mixing a stutter/moan with words. (Also nested inside the flagged line-8 outer thought span.)
  - `@@.mc-speech; Wha~what is that...@@<br>`
- **[L26](passages/missing_women/RescueJadePossessed1.tw#L26)** — MC speech body mixes spoken words with embedded ~tilde~ moans (OH~ Fuck~).
  - `@@.mc-speech; OH~ Fuck~ I'm going to...@@<br>`
- **[L27](passages/missing_women/RescueJadePossessed1.tw#L27)** — NPC speech body mixes words with an embedded ~tilde~ (Haha~) AND the span runs multiline, its closing @@ at line 31 wrapping a <<linkappend>> block with nested dialogue spans. Both moan-mixed and structurally nested.
  - `@@.notmc-speech; Haha~ Slow down, I have <<linkappend "a surprise for you.">>`
- **[L43](passages/missing_women/RescueJadePossessed1.tw#L43)** — MC speech body mixes spoken words with embedded ~tilde~ moans (OH~ Fuck~).
  - `@@.mc-speech; OH~ Fuck~ I'm going to...@@<br>`

### [passages/missing_women/RescueJuliaPossessed.tw](passages/missing_women/RescueJuliaPossessed.tw)

- **[L12](passages/missing_women/RescueJuliaPossessed.tw#L12)** — MC speech body mixes spoken words with a tilde vocalisation ('...Why are you doing this~Ah!'). Per rules, words + ~moan~ in one body must be flagged, not converted. Also nested inside the line 9-15 linkappend wrapper.
  - `@@.mc-speech; Stop it, <<= setup.MissingWomen.currentRescueGirl()>>. Why are you doing this~Ah!@@`
- **[L22](passages/missing_women/RescueJuliaPossessed.tw#L22)** — MC speech body mixes a moan with spoken words ('AHhh~ no~ don't do that') — tildes interleaved with speech. Needs human to split into <<vocal>> + <<mc>>.
  - `@@.mc-speech;AHhh~ no~ don't do that@@`

### [passages/missing_women/RescueJuliaPossessed3.tw](passages/missing_women/RescueJuliaPossessed3.tw)

- **[L6](passages/missing_women/RescueJuliaPossessed3.tw#L6)** — MC speech body mixes spoken words ('Yes', 'Oh my') with ~tilde~ moan markers ('Yes~ Oh my~Ahhh') in one body. Per the rules, a body mixing words and a ~moan~ must not be auto-converted to <<mc>> or <<vocal>> — needs a human to split spoken vs vocalised. Left byte-for-byte.
  - `@@.mc-speech; Yes~ Oh my~Ahhh@@<br>`

### [passages/missing_women/RescueNadiaPossessed1.tw](passages/missing_women/RescueNadiaPossessed1.tw)

- **[L19](passages/missing_women/RescueNadiaPossessed1.tw#L19)** — MC speech body mixes a tilde moan fragment 'Oh yes~' with spoken words and a [[link]] in one body. Not a clean full-body ~X~ vocalisation, so neither <<mc>> nor <<vocal mc>> applies mechanically. Needs editorial split.
  - `@@.mc-speech; Oh yes~ [[wait, wha...?|RescueNadiaPossessed2]]@@<br>`

### [passages/missing_women/RescueNadiaPossessed2.tw](passages/missing_women/RescueNadiaPossessed2.tw)

- **[L19](passages/missing_women/RescueNadiaPossessed2.tw#L19)** — MC speech body mixes a tilde moan fragment 'Mmm~' with the spoken word 'yeah.' in one body. Not a clean full-body ~X~ vocalisation and not clean spoken words, so neither <<mc>> nor <<vocal mc>> applies mechanically. Needs editorial split.
  - `@@.mc-speech; Mmm~ yeah.@@<br>`

### [passages/missing_women/RescueNadiaPossessed3.tw](passages/missing_women/RescueNadiaPossessed3.tw)

- **[L9](passages/missing_women/RescueNadiaPossessed3.tw#L9)** — NPC speech body mixes a tilde vocalisation ("Mm~") with spoken words. Words + ~moan~ in one body; needs splitting into <<vocal npc>> + <<say>> by a human.
  - `@@.notmc-speech; Mm~ What a tight little hole<br>I can feel your anus pulsating, looks like you're ready to cum@@`
- **[L11](passages/missing_women/RescueNadiaPossessed3.tw#L11)** — MC speech body mixes a tilde vocalisation ("Ahh~") with spoken words. Words + ~moan~ in one body; needs splitting into <<vocal mc>> + <<mc>> by a human.
  - `@@.mc-speech; Ahh~Fuck! I can't, I'm cumming@@`

### [passages/missing_women/RescuePossessed.tw](passages/missing_women/RescuePossessed.tw)

- **[L14](passages/missing_women/RescuePossessed.tw#L14)** — NPC speech body mixes the moan 'Hmm~' with spoken words; needs split into <<vocal npc>> + <<say>>. (Victoria branch)
  - `@@.notmc-speech; Hmm~ what are you doing here?@@`
- **[L17](passages/missing_women/RescuePossessed.tw#L17)** — MC speech body mixes the moan 'Ah~' with spoken words; needs split into <<mc>> + <<vocal mc>>. (Victoria branch)
  - `@@.mc-speech;What? Ah~ what's happening...@@`
- **[L24](passages/missing_women/RescuePossessed.tw#L24)** — NPC speech body mixes the moan 'Hmm~' with spoken words; needs split into <<vocal npc>> + <<say>>. (Jade branch)
  - `@@.notmc-speech; Hmm~ what are you doing here?@@`
- **[L27](passages/missing_women/RescuePossessed.tw#L27)** — MC speech body mixes the moan 'Ah~' with spoken words; needs split into <<mc>> + <<vocal mc>>. (Jade branch)
  - `@@.mc-speech;What? Ah~ what's happening...@@`
- **[L34](passages/missing_women/RescuePossessed.tw#L34)** — NPC speech body mixes the moan 'Hmm~' with spoken words; needs split into <<vocal npc>> + <<say>>. (Julia branch)
  - `@@.notmc-speech; Hmm~ what are you doing here?@@`
- **[L42](passages/missing_women/RescuePossessed.tw#L42)** — NPC speech body mixes the moan 'Hmm~' with spoken words; needs split into <<vocal npc>> + <<say>>. (Nadia branch)
  - `@@.notmc-speech; Hmm~ what are you doing here?@@`
- **[L51](passages/missing_women/RescuePossessed.tw#L51)** — NPC speech body mixes the moan 'Hmm~' with spoken words; needs split into <<vocal npc>> + <<say>>. (Ash branch)
  - `@@.notmc-speech; Hmm~ what are you doing here?@@`

### [passages/missing_women/RescueVictoriaPossessed.tw](passages/missing_women/RescueVictoriaPossessed.tw)

- **[L12](passages/missing_women/RescueVictoriaPossessed.tw#L12)** — Body mixes a tilde vocalisation (Ah~) with spoken words (don't touch me!); not a pure ~moan~ body, so not a clean <<vocal>>. Also nested inside the ambiguous L10-14 notmc block. Left as-is.
  - `@@.mc-speech; Ah~ don't touch me!@@<br>`
- **[L25](passages/missing_women/RescueVictoriaPossessed.tw#L25)** — Body mixes a tilde vocalisation (Ah~) with spoken words; not a pure ~moan~ body. Also nested inside the ambiguous L23-27 notmc block. Left as-is.
  - `@@.mc-speech; Ah~ don't touch me!@@<br>`
- **[L37](passages/missing_women/RescueVictoriaPossessed.tw#L37)** — Body mixes a tilde vocalisation (Ah~) with spoken words; not a pure ~moan~ body. Also nested inside the ambiguous L34-39 notmc block. Left as-is.
  - `@@.mc-speech; Ah~ don't touch me!@@<br>`

### [passages/missing_women/RescueVictoriaPossessed1.tw](passages/missing_women/RescueVictoriaPossessed1.tw)

- **[L4](passages/missing_women/RescueVictoriaPossessed1.tw#L4)** — MC speech body mixes spoken words with tilde vocalisations (~OH~, fuck~). Words + moan markers in one body — needs editorial split into spoken text + <<vocal mc>>, not a clean wrapper swap.
  - `@@.mc-speech; What are you going to do? ~OH~ fuck~ my butthole@@`
- **[L14](passages/missing_women/RescueVictoriaPossessed1.tw#L14)** — MC speech body contains a stray tilde (Oh~you're) mixed into the words — not a clean ~X~ vocalisation and not pure speech. Needs a human to decide whether the tilde is a moan marker or typo before converting.
  - `@@.mc-speech; Oh~you're gonna tear my ass, please be gentle@@`
- **[L24](passages/missing_women/RescueVictoriaPossessed1.tw#L24)** — Identical to line 14 (stage 3 copy). MC speech body has a stray tilde (Oh~you're) mixed with words — ambiguous moan/typo, leave for editorial.
  - `@@.mc-speech; Oh~you're gonna tear my ass, please be gentle@@`

### [passages/missing_women/widgetRescue.tw](passages/missing_women/widgetRescue.tw)

- **[L30](passages/missing_women/widgetRescue.tw#L30)** — MC speech body mixes spoken words with a ~moan~ tilde inside the word 'wow~', plus <br> line breaks across a 3-line span and a <<= >> print. Not a clean single-thing-said-aloud span (it's a multi-line speech+breath blend). Needs a human to split the moan from the words / decide vocal vs speech.
  - `@@.mc-speech; Oh wow~ it's <<= setup.MissingWomen.currentRescueGirl()>>, and it looks like she's... in trouble.<br>`

### [passages/posession/PossessedBrooke.tw](passages/posession/PossessedBrooke.tw)

- **[L26](passages/posession/PossessedBrooke.tw#L26)** — MC speech body mixes spoken words with ~tilde~ vocalisations ('Ah~ Ah fuck ~Yeah~~') — needs a human to split the spoken part from the moan (<<mc>> + <<vocal mc>>). Left as-is.
  - `@@.mc-speech; Ah~ Ah fuck ~Yeah~~@@<br>`
- **[L30](passages/posession/PossessedBrooke.tw#L30)** — MC speech body mixes spoken words with ~tilde~ vocalisations ('Ahh~ not so rough~ ahhh') — needs a human to split spoken part from the moan. Left as-is.
  - `@@.mc-speech; Ahh~ not so rough~ ahhh@@<br>`
- **[L35](passages/posession/PossessedBrooke.tw#L35)** — MC speech body mixes spoken words with ~tilde~ vocalisations ('Ah~ no, it hurts~') — needs a human to split spoken part from the moan. Left as-is.
  - `@@.mc-speech; Ah~ no, it hurts~@@<br>`

### [passages/posession/possessedLocation.tw](passages/posession/possessedLocation.tw)

- **[L115](passages/posession/possessedLocation.tw#L115)** — Multi-line .mc-speech body mixes spoken words with ~tilde~ moans (HAaA~ ... ...i~) and has no closing @@ before the <<linkreplace>> — the span appears to wrap the entire linkreplace block (lines 116-122, incl. the clean .notmc-speech lines 118/120 which are therefore left untouched as they are nested inside this flagged span). Needs editorial split into speech + <<vocal mc>> + narration.
  - `@@.mc-speech; Something's wrong...<br> ⏎ 			HAaA~ I think I...i~ <<linkreplace "@@.usebtn; commiiiing~@@">>`
- **[L124](passages/posession/possessedLocation.tw#L124)** — Single .mc-speech body mixes spoken words with tilde vocalisations (leading AHh~ and trailing ~). Words + ~moan~ in one body — must be split into <<mc>> speech and <<vocal mc>> by a human.
  - `@@.mc-speech; AHh~You are going to break me ~@@<br>`
- **[L126](passages/posession/possessedLocation.tw#L126)** — Multi-line .mc-speech body mixes spoken words with a ~tilde~ moan (oh~ ... ...i~) and has no closing @@ before the <<linkreplace>> — the span wraps the linkreplace block (lines 127-137), so the otherwise-clean .notmc-speech (129/131), .mc-speech (130) and .mc-thoughts (132) inside it are left untouched as nested-in-flagged content. Needs editorial split.
  - `@@.mc-speech; Did she hear what I said?<br> ⏎ 			So that means... oh~ I think I...i~ <<linkreplace "@@.usebtn; commiiiing~@@">>`

### [passages/posession/possessedLocation1.tw](passages/posession/possessedLocation1.tw)

- **[L138](passages/posession/possessedLocation1.tw#L138)** — NPC speech body spans lines 138-139 and mixes spoken words with ~tilde~ vocalisations (Nooo~ ... ~Uuuuwhhh ~). Needs splitting into <<say>> + <<vocal npc>>; left untouched.
  - `@@.notmc-speech; Nooo~ this is not right.. <br> ⏎ 	~Uuuuwhhh ~You're penetrating me too deep@@<br>`
- **[L141](passages/posession/possessedLocation1.tw#L141)** — NPC speech body mixes a word/grunt (NNRGGG) with a ~tilde~ moan (~Ah AHHHhh). Needs splitting into <<say>>/<<vocal npc>>; left untouched.
  - `@@.notmc-speech; NNRGGG ~Ah AHHHhh@@<br>`

### [passages/special_event/GhostSpecialEventWraithEnd.tw](passages/special_event/GhostSpecialEventWraithEnd.tw)

- **[L4](passages/special_event/GhostSpecialEventWraithEnd.tw#L4)** — Body mixes spoken words with a bare ~ tilde ('Yes...~ I love it...'); it is not a pure ~moan~ whole-body vocalisation, so neither <<mc>> nor <<vocal mc>> applies cleanly. Needs a human to decide whether to split the moan out.
  - `@@.mc-speech; Yes...~ I love it...@@<br>`

### [passages/special_event/GhostSpecialEventWraithStart.tw](passages/special_event/GhostSpecialEventWraithStart.tw)

- **[L6](passages/special_event/GhostSpecialEventWraithStart.tw#L6)** — MC speech body mixes spoken/broken words with multiple inline ~tilde~ vocalisations (Mm~Too~ Much~ MMm~ I can't ~ AH); not a pure single ~moan~ that <<vocal>> handles, and not clean spoken words for <<mc>>. Needs a human to split words vs moans.
  - `@@.mc-speech; Mm~Too~ Much~ MMm~ I can't ~ AH@@`

## `inline` — 91

**What:** A `.mc-speech`/`.notmc-speech` span used mid-sentence inside other prose.  
**Action:** `<<mc>>`/`<<say>>` render as blocks (`.speech-line`), so a straight swap would break the inline flow. Either lift the line out into its own block, or leave it as the raw coloured span if it must stay inline.

### [passages/companion/CompanionMain.tw](passages/companion/CompanionMain.tw)

- **[L141](passages/companion/CompanionMain.tw#L141)** — The @@.mc-speech; span sits inline in the middle of other content on the same line (preceded by an <<if>> on the same line, immediately followed by a @@.warningtext; span). <<mc>> renders as a block and would break the inline flow / adjacency with the warning text.
  - `<<if setup.Mc.exhibitionism() lte 4 ...>>@@.mc-speech; Yeah, you're right.@@@@.warningtext; (She'll go with you if you're dressed) or Req. Exhibitionism Leve…`

### [passages/companion/CompanionResult.tw](passages/companion/CompanionResult.tw)

- **[L9](passages/companion/CompanionResult.tw#L9)** — Speech span used inline in the middle of other prose/macros on the same line (followed by <<linkappend>>); also pairs with a non-standard .notmc-speechLink class. Block macro would break inline flow. Left byte-for-byte.
  - `@@.notmc-speech; I'm sure@@ <<linkappend "@@.notmc-speechLink; it's a cursed item...@@">>`
- **[L29](passages/companion/CompanionResult.tw#L29)** — Speech span used inline before an <<image>> macro on the same line; block macro would break inline layout. Left as-is.
  - `@@.notmc-speech; evidence - EMF 5 @@ <<image "ui/img/emf.png" {...}>>`
- **[L37](passages/companion/CompanionResult.tw#L37)** — Speech span used inline before an <<image>> macro on the same line; block macro would break inline layout. Left as-is.
  - `@@.notmc-speech; evidence - Ghost Writing Book @@ <<image "ui/img/gwb.png" {...}>>`
- **[L48](passages/companion/CompanionResult.tw#L48)** — Speech span used inline before an <<image>> macro on the same line; block macro would break inline layout. Left as-is.
  - `@@.notmc-speech; evidence - High Temperature @@ <<image "ui/img/thermometr.png" {...}>>`
- **[L56](passages/companion/CompanionResult.tw#L56)** — Speech span used inline before an <<image>> macro on the same line; block macro would break inline layout. Left as-is.
  - `@@.notmc-speech; evidence - Spirit Box @@ <<image "ui/img/spiritbox.png" {...}>>`
- **[L65](passages/companion/CompanionResult.tw#L65)** — Speech span used inline before a <<statIcon>> macro on the same line; block macro would break inline layout. Left as-is.
  - `@@.notmc-speech; evidence - UVL @@ <<statIcon setup.StatIcon.UVL>>`
- **[L73](passages/companion/CompanionResult.tw#L73)** — Speech span used inline before an <<image>> macro on the same line; block macro would break inline layout. Left as-is.
  - `@@.notmc-speech; evidence - Ectoglass@@ <<image "ui/img/glass.png" {...}>>`

### [passages/companion/alice/AliceHuntEndAlone.tw](passages/companion/alice/AliceHuntEndAlone.tw)

- **[L21](passages/companion/alice/AliceHuntEndAlone.tw#L21)** — A .notmc-speech span shares its line with a .warningtext span ('Req. Alice's lvl >= 3'); converting to a block <<say>> would break the inline layout next to the warning chip. Left as-is.
  - `@@.notmc-speech; I don't want to talk about it...@@ @@.warningtext; Req. Alice's lvl ≥ 3@@`
- **[L23](passages/companion/alice/AliceHuntEndAlone.tw#L23)** — Multi-line .notmc-speech whose body ends mid-line and flows directly into a <<linkappend>> ('scare me') on the same line; the sentence continues into the link, so a block macro would break the inline reveal flow. Left as-is.
  - `@@.notmc-speech;Well, listen...<br> ⏎ 			At first, things went well, of course, sometimes the ghost tried to...@@<<linkappend "@@.notmc-speechLink; scare me@…`
- **[L27](passages/companion/alice/AliceHuntEndAlone.tw#L27)** — Multi-line .notmc-speech whose body ends mid-sentence ('it tried to ') and flows directly into a <<linkappend>> ('chocke me') on the same line; block macro would break the inline link reveal. Left as-is.
  - `@@.notmc-speech;But I'm not easily frightened! <br> ⏎ 				I continued searching for evidence.<br> ⏎ 				The ghost became more aggressive... Sometimes it tried`
- **[L32](passages/companion/alice/AliceHuntEndAlone.tw#L32)** — Multi-line .notmc-speech whose body ends mid-sentence ('when suddenly') and flows directly into a <<linkappend>> ('it appeared right in front of me.') on the same line; block macro would break the inline link reveal. Left as-is.
  - `@@.notmc-speech;But I was stronger than it...<br> ⏎ 					I was about to find the last piece of evidence when suddenly@@ <<linkappend`
- **[L38](passages/companion/alice/AliceHuntEndAlone.tw#L38)** — A .notmc-speech span shares its line with the opening <<if _resultAliceAlone eq 1>> and is immediately followed by a trailing space + <br>, sitting directly adjacent to a following mc-speech block; not on its own line, so converting to a block macro is risky. Left as-is for human review.
  - `<<if _resultAliceAlone eq 1>>@@.notmc-speech; After it cu... weakened, I ran away. That's it. @@<br>`

### [passages/companion/blake/BlakeHuntEndAlone.tw](passages/companion/blake/BlakeHuntEndAlone.tw)

- **[L25](passages/companion/blake/BlakeHuntEndAlone.tw#L25)** — Speech span used inline: immediately followed on the same line by a separate @@.warningtext;@@ span. Converting to a block <<say>> would break the inline pairing with the level-requirement notice.
  - `@@.notmc-speech; I don't want to talk about it...@@ @@.warningtext; Req. Blake's lvl ≥ 3@@`
- **[L27](passages/companion/blake/BlakeHuntEndAlone.tw#L27)** — Speech body ends mid-sentence ("tried to...") and continues inline into a <<linkappend>> on the same line. Block <<say>> would split the continuous spoken sentence; needs editorial judgment to restructure the progressive reveal.
  - `@@.notmc-speech;Well, listen...<br> ⏎ 			At first, things went well, of course, sometimes the ghost tried to...@@<<linkappend "@@.notmc-speechLink; scare me@…`
- **[L31](passages/companion/blake/BlakeHuntEndAlone.tw#L31)** — Speech body ends mid-sentence ("it tried to") and flows inline into a <<linkappend>> continuation on the same line. Block <<say>> would break the inline sentence-into-link reveal.
  - `@@.notmc-speech;But I'm not easily frightened! <br> ⏎ 				I continued searching for evidence.<br> ⏎ 				The ghost became more aggressive... Sometimes it trie…`
- **[L36](passages/companion/blake/BlakeHuntEndAlone.tw#L36)** — Speech body ends mid-sentence ("when suddenly") and continues inline into a <<linkappend>> reveal on the same line. Block <<say>> would break the inline sentence-into-link flow.
  - `@@.notmc-speech;But I was stronger than it...<br> ⏎ 					I was about to find the last piece of evidence when suddenly@@ <<linkappend ⏎ 						"@@.notmc-speech…`

### [passages/companion/brook/BrookHuntEndAlone.tw](passages/companion/brook/BrookHuntEndAlone.tw)

- **[L28](passages/companion/brook/BrookHuntEndAlone.tw#L28)** — notmc-speech span used inline, immediately followed on the same line by an @@.warningtext;@@ requirement span; block macro would break the inline flow.
  - `@@.notmc-speech; I don't want to talk about it...@@ @@.warningtext; Req. Brook's lvl ≥ 3@@`
- **[L30](passages/companion/brook/BrookHuntEndAlone.tw#L30)** — notmc-speech span (lines 30-31) ends mid-line and is immediately followed inline by <<linkappend "@@.notmc-speechLink; scare me@@">>; converting to a block macro would break the inline link continuation.
  - `@@.notmc-speech;Well, listen...<br> ⏎ 		At first, things went well, of course, sometimes the ghost tried to...@@<<linkappend "@@.notmc-speechLink; scare me@@">>`
- **[L34](passages/companion/brook/BrookHuntEndAlone.tw#L34)** — notmc-speech span (lines 34-36) ends mid-line and is immediately followed inline by <<linkappend "@@.notmc-speechLink;strangle me@@">>; block conversion would break the inline link continuation.
  - `@@.notmc-speech;But I'm not easily frightened! <br> ⏎ 			I continued searching for evidence.<br> ⏎ 			The ghost became more aggressive... Sometimes it tried …`
- **[L39](passages/companion/brook/BrookHuntEndAlone.tw#L39)** — notmc-speech span (lines 39-40) ends mid-line and is immediately followed inline by a <<linkappend>> (continuing onto line 41); block conversion would break the inline link continuation.
  - `@@.notmc-speech;But I was stronger than it...<br> ⏎ 				I was about to find the last piece of evidence when suddenly@@ <<linkappend`
- **[L46](passages/companion/brook/BrookHuntEndAlone.tw#L46)** — notmc-speech span is preceded inline on the same line by <<if _resultBrookAlone eq 1>>; block macro would break the inline flow.
  - `<<if _resultBrookAlone eq 1>>@@.notmc-speech; After it cu... weakened, I ran away. That's it. @@<br>`

### [passages/companion/brook/BrookWalkHome.tw](passages/companion/brook/BrookWalkHome.tw)

- **[L11](passages/companion/brook/BrookWalkHome.tw#L11)** — NPC speech span runs inline into the following <<linkappend "@@.notmc-speechLink; this strap-on.@@">> on line 12 (sentence continues 'let's use ... this strap-on.'). Block-level <<say>> would break the inline link flow; needs human handling.
  - `@@.notmc-speech; I have something special for us. Here, let's use @@`

### [passages/delivery/DeliveryEvent1.tw](passages/delivery/DeliveryEvent1.tw)

- **[L59](passages/delivery/DeliveryEvent1.tw#L59)** — The .notmc-speech span is used inline mid-line, immediately followed on the same line by a <<linkappend>> (whose label is a separate .notmc-speechLink span). Converting to the block <<say>> macro would break the inline flow; needs a human to restructure.
  - `@@.notmc-speech; On your knees bitch,@@ <<linkappend "@@.notmc-speechLink; quickly@@">><br>`

### [passages/delivery/DeliveryEventChoose.tw](passages/delivery/DeliveryEventChoose.tw)

- **[L17](passages/delivery/DeliveryEventChoose.tw#L17)** — Two .mc-speech link spans used inline on one line, joined by ' or '. Block layout would break the inline flow; converting to <<mc>> would also drop the dialogue-choice structure. Leave for editorial handling.
  - `@@.mc-speech;[[If you don't mind|DeliveryEventStart]]@@ or @@.mc-speech;[[No, sorry, I won't mess with this|DeliveryMap]`
- **[L19](passages/delivery/DeliveryEventChoose.tw#L19)** — Inline .mc-speech link span followed by <<deliveryCorrReq 5>> macro on the same line. Block layout would break inline flow.
  - `@@.mc-speech;[[No, sorry, I won't mess with this|DeliveryMap][setup.Delivery.markDeliveryFailed()]]@@ <<deliveryCorrReq 5>>`
- **[L35](passages/delivery/DeliveryEventChoose.tw#L35)** — Two .mc-speech link spans used inline on one line, joined by ' or '. Dialogue-choice links; block layout would break inline flow.
  - `@@.mc-speech;[[Tell her that you need money|DeliveryEventStart]]@@ or @@.mc-speech;[[Nah, Just say sorry and leave|DeliveryMap]`
- **[L45](passages/delivery/DeliveryEventChoose.tw#L45)** — Inline .mc-speech span followed by <<deliveryCorrReq 3>> macro on the same line. Block layout would break inline flow.
  - `@@.mc-speech; That sounds strange, I'd rather decline@@ <<deliveryCorrReq 3>>`
- **[L49](passages/delivery/DeliveryEventChoose.tw#L49)** — Two .mc-speech link spans used inline on one line, joined by ' or '. Dialogue-choice links; block layout would break inline flow.
  - `@@.mc-speech;[[Agree|DeliveryEventStart]]@@ or @@.mc-speech;[[Nah, i have to go|DeliveryMap][setup.Delivery.markDeliveryFailed()]]@@`
- **[L61](passages/delivery/DeliveryEventChoose.tw#L61)** — Inline .mc-speech span followed by <<deliveryLustReq 30>> macro on the same line. Block layout would break inline flow.
  - `@@.mc-speech; Done. I have to go, bye.@@ <<deliveryLustReq 30>>`
- **[L68](passages/delivery/DeliveryEventChoose.tw#L68)** — Two .mc-speech link spans used inline on one line, joined by ' or '. Dialogue-choice links; block layout would break inline flow.
  - `@@.mc-speech;[[Just a touch|DeliveryEventStart]]@@ or @@.mc-speech;[[Nah, i have to go|DeliveryMap][setup.Delivery.markDeliveryFailed()]]@@`

### [passages/delivery/DeliveryEventStart.tw](passages/delivery/DeliveryEventStart.tw)

- **[L41](passages/delivery/DeliveryEventStart.tw#L41)** — NPC speech span ends mid-sentence ('sit down and ') and is used inline immediately before a <<linkappend>> that completes the line; block-layout <<say>> would break the inline flow. Needs editorial handling.
  - `@@.notmc-speech; For example: sit down and @@<<linkappend "@@.notmc-speechLink; suck me off@@">>`
- **[L79](passages/delivery/DeliveryEventStart.tw#L79)** — NPC speech span 'Get on ' ends mid-sentence and wraps a <<linkappend>> block (spanning lines 79-87, closing <</linkappend>>@@); inline + widget body, block-layout <<say>> would break it. Needs editorial handling.
  - `@@.notmc-speech; Get on <<linkappend "your knees">>`

### [passages/delivery/DeliverySpecialEvent.tw](passages/delivery/DeliverySpecialEvent.tw)

- **[L25](passages/delivery/DeliverySpecialEvent.tw#L25)** — Two .mc-speech spans on one line, each wrapping a [[link]] rather than spoken words, joined inline by ' or '. Block-level <<mc>> would break the inline flow and these aren't actual spoken dialogue lines.
  - `@@.mc-speech;[[Go inside|DeliverySpecialUnsafe]]@@ or @@.mc-speech;[[No thanks, just pay me|DeliverySpecialRefused]]@@<br>`

### [passages/events/seduceGhostMinigame/widgetSeduceGhostMinigame.tw](passages/events/seduceGhostMinigame/widgetSeduceGhostMinigame.tw)

- **[L244](passages/events/seduceGhostMinigame/widgetSeduceGhostMinigame.tw#L244)** — Spirit case: a .mc-speech span is followed on the same line by narration prose ('Your heart's still going...'). Converting to a block <<mc>> would break the inline flow. A human should split the spoken part into <<mc>> and pull the trailing action into <<narration>>.
  - `@@.mc-speech;Get on home, then. You got what you wanted.@@ Your heart's still going at a stupid clip and you don't fully`
- **[L248](passages/events/seduceGhostMinigame/widgetSeduceGhostMinigame.tw#L248)** — Poltergeist case: a .mc-speech span and a .mc-thoughts span share one line. The speech is inline (followed by another styled span), so block conversion would break flow; left the whole line intact (including the inline thought) so a human can split them into <<mc>> + <<thought>>.
  - `@@.mc-speech;No special trick to you, is there.@@ @@.mc-thoughts;And that's the whole tell: no clever gimmick, just a`
- **[L268](passages/events/seduceGhostMinigame/widgetSeduceGhostMinigame.tw#L268)** — Demon case: a .mc-speech span ('Look at the manners on this one.') sits inline at the end of a narration line. Block <<mc>> would break the line; needs a human to pull the speech onto its own <<mc>> line.
  - `He's face-down with his hips still tipped up, the way you left him, twitching every few seconds like the charge hasn't fin`
- **[L288](passages/events/seduceGhostMinigame/widgetSeduceGhostMinigame.tw#L288)** — Jinn case: a .mc-speech span is followed on the same line by narration prose. Converting to block <<mc>> would break inline flow; needs splitting into <<mc>> + <<narration>>.
  - `@@.mc-speech;Fast hunter, lousy eyes. I'll take the trade.@@ Your pulse won't sit down, and somewhere under the adrenalin`
- **[L290](passages/events/seduceGhostMinigame/widgetSeduceGhostMinigame.tw#L290)** — Moroi case: a .mc-speech span ('There's my mind-crawler.') sits inline at the end of a narration line. Block <<mc>> would break the line; needs a human to pull the speech onto its own line.
  - `He's folded over on his side around the spent ache of it, one hand still loose near his own throat where the static came o`
- **[L316](passages/events/seduceGhostMinigame/widgetSeduceGhostMinigame.tw#L316)** — Mimic case: a .mc-speech span ('You should keep this one.') sits inline at the end of a narration line. Block <<mc>> would break the line; needs a human to pull the speech onto its own <<mc>> line.
  - `You sit back on your heels, wet to the thigh and a little appalled at yourself. @@.mc-speech;You should keep this one.@@`
- **[L320](passages/events/seduceGhostMinigame/widgetSeduceGhostMinigame.tw#L320)** — The Twins case: a .mc-speech span is followed on the same line by narration prose ('The Twins never come alone...'). Converting to block <<mc>> would break inline flow; needs splitting into <<mc>> + <<narration>>.
  - `@@.mc-speech;Two of you. And I've only run down the first.@@ The Twins never come alone — every prowl you settle leaves t`

### [passages/gui/widgetFriends.tw](passages/gui/widgetFriends.tw)

- **[L82](passages/gui/widgetFriends.tw#L82)** — MC speech span starts the line but is followed on the SAME line by rendered <<if>> / @@.warningtext;@@ content ("... on my own...@@ <<if _args[0] lte 4>>@@.warningtext; Req. higher lvl@@"). Wrapping in block-level <<mc>> would break the inline flow with the trailing conditional warning. Left as-is.
  - `@@.mc-speech; Alright, then I'll [[continue|$return][setup.Companion.dismissCompanion()]] on my own...@@ <<if _args[0] lte 4>>`

### [passages/gym/EmilyTalk.tw](passages/gym/EmilyTalk.tw)

- **[L10](passages/gym/EmilyTalk.tw#L10)** — @@.mc-speech;@@ used inline as a styled name label ("Emily") in the middle of narration prose, not as spoken dialogue. Block macro would break inline flow; leave for human (likely should be a plain styled span, not a speech macro).
  - `Relation with @@.mc-speech;Emily@@ improved: <<= setup.Gym.emilyRelationshipStage()>> now!`
- **[L28](passages/gym/EmilyTalk.tw#L28)** — @@.mc-speech;@@ used inline as a styled name label ("Emily") inside narration prose, not spoken dialogue. Block macro would break inline flow.
  - `Relation with @@.mc-speech;Emily@@ improved: <<= setup.Gym.emilyRelationshipStage()>> now!<br>`
- **[L49](passages/gym/EmilyTalk.tw#L49)** — @@.mc-speech;@@ used inline as a styled name label ("Emily") inside narration prose, not spoken dialogue. Block macro would break inline flow.
  - `Relation with @@.mc-speech;Emily@@ improved: <<= setup.Gym.emilyRelationshipStage()>> now!<br>`

### [passages/gym/GymGroupEvent1Start.tw](passages/gym/GymGroupEvent1Start.tw)

- **[L5](passages/gym/GymGroupEvent1Start.tw#L5)** — NPC speech used inline, flowing mid-sentence into a <<linkappend>> continuation on the same line; block macro would break the inline flow.
  - `@@.notmc-speech; Relax baby, we're just getting started. We have some @@ <<linkappend "@@.notmc-speechLink;toys for you@@">>`

### [passages/gym/GymSolo.tw](passages/gym/GymSolo.tw)

- **[L18](passages/gym/GymSolo.tw#L18)** — Two .mc-speech spans used inline mid-sentence ('You see <span>Emily</span>. <span>[[Go talk to her]]</span> after the workout.'). One is just a styled name, the other a styled link; both are embedded in surrounding prose on the same line, so block-rendering <<mc>> would break the inline flow. Left as-is for editorial handling.
  - `You see @@.mc-speech;Emily@@. @@.mc-speech;[[Go talk to her|EmilyTalk]]@@ after the workout.<br>`

### [passages/gym/GymTrainer.tw](passages/gym/GymTrainer.tw)

- **[L25](passages/gym/GymTrainer.tw#L25)** — Two .mc-speech spans joined by inline "or" on one line, each embedding a choice link; block macros would break the inline choice layout.
  - `@@.mc-speech; No, let me [[help you.|GymTrainerEvent2Start]]@@ or @@.mc-speech; Yes, I'm [[not in the mood.|GymInside]]@@`
- **[L37](passages/gym/GymTrainer.tw#L37)** — Two .mc-speech spans used inline within narration prose (a styled name and a choice link); block macros would break the inline flow.
  - `You see @@.mc-speech;Emily@@. @@.mc-speech;[[Go talk to her|EmilyTalk]]@@ after the workout.`

### [passages/gym/GymTrainerEvent1Start1.tw](passages/gym/GymTrainerEvent1Start1.tw)

- **[L9](passages/gym/GymTrainerEvent1Start1.tw#L9)** — NPC speech used inline, flowing mid-sentence into a <<linkappend>> continuation on the same line; block macro would break the inline flow. Also contains a .notmc-speechLink span inside the linkappend label.
  - `@@.notmc-speech; I'll fuck all your@@ <<linkappend "@@.notmc-speechLink; holes@@">>`

### [passages/gym/GymTrainerEvent2Start.tw](passages/gym/GymTrainerEvent2Start.tw)

- **[L10](passages/gym/GymTrainerEvent2Start.tw#L10)** — The .notmc-speech span is used inline mid-sentence, immediately followed on the same line by a <<linkappend>> that continues the spoken sentence (its label uses .notmc-speechLink). Block <<say>> layout would break the inline flow and the linkappend continuation.
  - `@@.notmc-speech; Now I'm going to fuck you@@ <<linkappend "@@.notmc-speechLink;in the ass@@">>`

### [passages/haunted_houses/general/MonkeyPaw.tw](passages/haunted_houses/general/MonkeyPaw.tw)

- **[L35](passages/haunted_houses/general/MonkeyPaw.tw#L35)** — An .mc-speech span is embedded inline inside <label><b>...</b><<monkeyPawWishInput>></label> — wrapped in bold inside a label and followed by an input macro on the same line. Block <<mc>> would break the label/input layout. Left as-is.
  - `<label><b>@@.mc-speech;I wish for/to...@@</b><<monkeyPawWishInput>></label>`

### [passages/haunted_houses/general/StealClothes.tw](passages/haunted_houses/general/StealClothes.tw)

- **[L6](passages/haunted_houses/general/StealClothes.tw#L6)** — The .mc-speech 'Ouch!' span is used inline mid-line, immediately followed by another span on the same line (the .mc-thoughts span, which I did convert). A block <<mc>> here would break the inline layout. Left the speech span byte-for-byte for a human.
  - `@@.mc-speech; Ouch! @@ <<thought>>You tried to break the fall with your hands, but you didn't react in time.`

### [passages/home/AlarmClock.tw](passages/home/AlarmClock.tw)

- **[L9](passages/home/AlarmClock.tw#L9)** — The .mc-speech span sits inline mid-line after the narration 'Alarm is off. ' on the same line. The <<mc>> block layout would break the inline flow with the preceding sentence.
  - `Alarm is off. @@.mc-speech; My eyes will open whenever they feel like it.@@<br>`

### [passages/home/Mirror.tw](passages/home/Mirror.tw)

- **[L39](passages/home/Mirror.tw#L39)** — MC speech span sits inline right after <<else>> control flow; <<mc>> renders as a block and would break the inline branch layout. Single-NPC/no-NPC scene, so left for human review.
  - `<<else>>@@.mc-speech;I don't have enough makeup@@<br>`
- **[L44](passages/home/Mirror.tw#L44)** — MC speech span sits inline right after <<else>> control flow; block macro would break inline layout.
  - `<<else>>@@.mc-speech;I don't have enough makeup@@<br>`
- **[L50](passages/home/Mirror.tw#L50)** — MC speech span nested inline inside a @@.usebtn;@@ span and a <<linkreplace>> opening on the same line; converting to a block <<mc>> would break the inline link body.
  - `<<else>>@@.usebtn;<<linkreplace "Apply slutty makeup (3 charges)">>@@.mc-speech; Why should I do this makeup?@@`
- **[L53](passages/home/Mirror.tw#L53)** — MC speech span sits inline right after <<else>> control flow; block macro would break inline layout.
  - `<<else>>@@.mc-speech;I don't have enough makeup@@<br>`

### [passages/home/TheTwinsEvent.tw](passages/home/TheTwinsEvent.tw)

- **[L4](passages/home/TheTwinsEvent.tw#L4)** — An .mc-speech span sits at line start but is followed on the same line by a <<linkappend ...>> (whose body uses .mc-speechLink). The block-rendering <<mc>> macro would break the inline flow into the linkappend; needs human handling. Body 'Mmm... fuck' has no tildes so it is not a vocal case.
  - `@@.mc-speech;Mmm... fuck@@ <<linkappend "@@.mc-speechLink; this is too good...@@">>`

### [passages/home/pc/DocumentsForAlice.tw](passages/home/pc/DocumentsForAlice.tw)

- **[L16](passages/home/pc/DocumentsForAlice.tw#L16)** — MC speech 'I'm too tired' shares its line with a trailing @@.warningtext;@@ requirement span. <<mc>> renders as a block, which would break the inline flow with the warning text. Needs editorial handling.
  - `@@.mc-speech; I'm too tired@@ @@.warningtext; (Req. 3 <<statIcon setup.StatIcon.ENERGY>>)@@<br>`

### [passages/home/pc/FindGhostInfo.tw](passages/home/pc/FindGhostInfo.tw)

- **[L12](passages/home/pc/FindGhostInfo.tw#L12)** — mc-speech span used inline in the middle of narration prose ('...you come across details about @@.mc-speech;the _entry.name!@@<br>'); the <<mc>> block would break inline flow.
  - `&emsp;&emsp;As you scroll through the information about ghosts, you come across details about @@.mc-speech;the _entry.name!@@<br>`

### [passages/home/pc/Internet.tw](passages/home/pc/Internet.tw)

- **[L20](passages/home/pc/Internet.tw#L20)** — Single line interleaves four spans (mc-thoughts + notmc-speech + mc-speech + mc-thoughts) inline mid-prose. The .mc-speech/.notmc-speech spans are inline (block macros would break the flow), and converting only the surrounding thoughts would leave a half-migrated tangle. Left intact for editorial split.
  - `@@.mc-thoughts; I found information explaining what's happening. It turns out that this behavior is @@@@.notmc-speech; caused by a Mare.@@ @@.mc-speech;To ge…`

### [passages/intro/Intro1.tw](passages/intro/Intro1.tw)

- **[L10](passages/intro/Intro1.tw#L10)** — MC speech span is preceded by `&emsp;&emsp;` indentation on the same line and is interleaved as an indented paragraph within flowing narration paragraphs. The <<mc>> block (curly quotes + .speech-line block) would change rendering vs the current inline indented styled span. Needs human judgment.
  - `&emsp;&emsp;@@.mc-speech; Three freelance jobs in six months, <<= setup.Mc.name()>>.@@`
- **[L13](passages/intro/Intro1.tw#L13)** — Same as line 10: `&emsp;&emsp;` indentation prefix on the same line, embedded in flowing narration; converting to a block macro would change layout/quoting. Needs human judgment.
  - `&emsp;&emsp;@@.mc-speech; Freelance is going to get me killed before it gets me paid.@@`
- **[L16](passages/intro/Intro1.tw#L16)** — Same as line 10: `&emsp;&emsp;` indentation prefix on the same line, embedded in flowing narration; converting to a block macro would change layout/quoting. Needs human judgment.
  - `&emsp;&emsp;@@.mc-speech; Alright. Witch first.@@`

### [passages/library/LibraryGuy.tw](passages/library/LibraryGuy.tw)

- **[L13](passages/library/LibraryGuy.tw#L13)** — mc-speech span (a [[link]] choice) shares its line with a trailing @@.warningtext; (Req. ...)@@ span; converting to the <<mc>> block would push the warningtext to a new line and break the same-line layout.
  - `@@.mc-speech; [[Stop it right now, or I'll scream|LibraryInside]]@@ @@.warningtext; (Req. <<statIcon setup.StatIcon.CORRUPTION>> ≥ 1)@@`

### [passages/missing_women/RescueNadiaPossessed2.tw](passages/missing_women/RescueNadiaPossessed2.tw)

- **[L20](passages/missing_women/RescueNadiaPossessed2.tw#L20)** — NPC speech span sits on the same line as a trailing <<linkappend "towards me.">> that continues the sentence; <<say>> renders as a block which would break the inline flow into the linkappend. Needs a human to decide how to recombine the spoken line with the link continuation.
  - `@@.notmc-speech; Good girl, now turn your butt@@ <<linkappend "towards me.">>`

### [passages/missing_women/RescueVictoriaPossessed.tw](passages/missing_women/RescueVictoriaPossessed.tw)

- **[L6](passages/missing_women/RescueVictoriaPossessed.tw#L6)** — mc-speech span sits inline on the same line as the preceding thought block close + <br>; a block <<mc>> macro mid-line would break the inline flow. Left as-is.
  - `@@.mc-speech; Ugh... my head...@@`
- **[L7](passages/missing_women/RescueVictoriaPossessed.tw#L7)** — Two speech spans (mc then notmc) share one physical line separated by <br>; converting either to a block macro would break inline flow. Left both as-is.
  - `@@.mc-speech; Where am I? <<= setup.MissingWomen.currentRescueGirl()>>, is  that you? Help me!@@<br> @@.notmc-speech; Hello,`
- **[L7](passages/missing_women/RescueVictoriaPossessed.tw#L7)** — Second (notmc) span on a shared physical line with the preceding mc-speech span; block layout would break inline flow. Left as-is.
  - `@@.notmc-speech; Hello, sweetheart. Were you trying to save your little friend? You're too late... She's under my control`
- **[L19](passages/missing_women/RescueVictoriaPossessed.tw#L19)** — mc-speech span inline on the same line as the preceding thought block close + <br>; block macro would break inline flow. Left as-is.
  - `@@.mc-speech; Ugh... my head...@@`
- **[L20](passages/missing_women/RescueVictoriaPossessed.tw#L20)** — Two speech spans (mc then notmc) share one physical line separated by <br>; converting to block macros would break inline flow. Left both as-is.
  - `@@.mc-speech; Where am I? <<= setup.MissingWomen.currentRescueGirl()>>, is  that you? Help me!@@<br> @@.notmc-speech; Hello,`
- **[L20](passages/missing_women/RescueVictoriaPossessed.tw#L20)** — Second (notmc) span on a shared physical line with the preceding mc-speech span; block layout would break inline flow. Left as-is.
  - `@@.notmc-speech; Hello, sweetheart. Were you trying to save your little friend? You're too late... She's under my control`

### [passages/missing_women/RescueVictoriaPossessed1.tw](passages/missing_women/RescueVictoriaPossessed1.tw)

- **[L5](passages/missing_women/RescueVictoriaPossessed1.tw#L5)** — NPC speech span is used inline: the sentence continues into a <<linkappend>> on the same line (the .notmc-speechLink span completes it). Block <<say>> would break the inline flow; the linkappend's own .notmc-speechLink span is a link-styled fragment, not a standalone dialogue span.
  - `@@.notmc-speech; Seems like your sweet little hole is ready for@@ <<linkappend "@@.notmc-speechLink; something more...@@">>`
- **[L15](passages/missing_women/RescueVictoriaPossessed1.tw#L15)** — NPC speech span used inline: sentence continues into a <<linkappend>> (with a .notmc-speechLink fragment) on the same line. Block <<say>> would break the inline layout.
  - `@@.notmc-speech; What a tight ass you have, don't worry,@@ <<linkappend "@@.notmc-speechLink; I'll fix it@@">>`
- **[L25](passages/missing_women/RescueVictoriaPossessed1.tw#L25)** — Identical to line 15 (stage 3 copy). NPC speech used inline before a <<linkappend>> continuation on the same line; block <<say>> would break inline flow.
  - `@@.notmc-speech; What a tight ass you have, don't worry,@@ <<linkappend "@@.notmc-speechLink; I'll fix it@@">>`

### [passages/missing_women/widgetRescue.tw](passages/missing_women/widgetRescue.tw)

- **[L50](passages/missing_women/widgetRescue.tw#L50)** — Two .mc-speech spans used inline on the same line interleaved with a .usebtn link span and literal text ('.'). Converting either to the block-rendering <<mc>> macro would break the inline flow around the Stay button.
  - `@@.mc-speech;Or...@@  @@.usebtn;[[Stay|RescueStay][setup.MissingWomen.markQuestFailed()]]@@.@@.mc-speech; I guess I'm already used to losing...@@`

### [passages/park/Park.tw](passages/park/Park.tw)

- **[L15](passages/park/Park.tw#L15)** — MC speech span is followed inline on the same line by a <<statIcon setup.StatIcon.ENERGY>> macro; the block-rendering <<mc>> macro would break the inline flow with the trailing icon, so left as-is for human review.
  - `@@.mc-speech; Not enough energy@@ <<statIcon setup.StatIcon.ENERGY>><br>`

### [passages/posession/possessed.tw](passages/posession/possessed.tw)

- **[L18](passages/posession/possessed.tw#L18)** — Multi-line .notmc-speech body that ends mid-line ('I'll have to@@') and flows directly into a <<linkappend>> on the same line. Block macro would break the inline lead-in to the link. Needs editorial split (speech + link).
  - `@@.notmc-speech; Shut up! Leave this girl alone!<br> ⏎ 	Ah, it seems prayers won't do... I'll have to@@ <<linkappend "<b>@@.notmc-speechLink;take other measu…`
- **[L38](passages/posession/possessed.tw#L38)** — Single-line .notmc-speech span used inline on the same line before a <<linkappend>>; converting to the block <<say>> macro would break inline flow with the trailing link.
  - `@@.notmc-speech; Maybe I should be more ruthless.@@ <<linkappend "@@.notmc-speechLink; I'll save you, my child@@">>`

### [passages/posession/possessedLocation.tw](passages/posession/possessedLocation.tw)

- **[L145](passages/posession/possessedLocation.tw#L145)** — Inline .mc-speech span mid-line: a partial sentence ('Where the') joined to a continuing <<linkappend>> ('hell am I?'). The <<mc>> block macro would break the inline flow, and the utterance is split across the span + the link, so a human must reassemble it.
  - `@@.mc-speech;Where the@@ <<linkappend "@@.mc-speechLink; hell am I?@@">>`

### [passages/posession/possessedLocation1.tw](passages/posession/possessedLocation1.tw)

- **[L166](passages/posession/possessedLocation1.tw#L166)** — MC speech fragment that flows directly into a following <<linkappend>> (.mc-speechLink continuation 'I can't...') mid-sentence. Converting to the block-rendering <<mc>> macro would break the inline flow with the link. Left untouched for editorial handling.
  - `@@.mc-speech;Oh God... @@ ⏎ 			<<linkappend "@@.mc-speechLink; I can't...@@">>`

### [passages/special_event/GhostSpecialEvent1Mare.tw](passages/special_event/GhostSpecialEvent1Mare.tw)

- **[L3](passages/special_event/GhostSpecialEvent1Mare.tw#L3)** — Clean MC speech body, but the span shares its line with a following <<linkappend>> (which contains the separate .mc-speechLink styled link, not dialogue). Converting to the block <<mc>> macro would break the inline layout with the link; left for human judgment.
  - `@@.mc-speech;Something touches me while I sleep.@@ <<linkappend "@@.mc-speechLink;Watch more.@@">>`

### [passages/special_event/GhostSpecialEventMare.tw](passages/special_event/GhostSpecialEventMare.tw)

- **[L4](passages/special_event/GhostSpecialEventMare.tw#L4)** — MC speech ending mid-sentence ('...I need to ') that flows into the shared <<linkappend>> ('watch more.') below; the spoken sentence is completed inside the link, so a block <<mc>> would break the inline continuation. Left as-is.
  - `@@.mc-speech;Am I touching myself in my sleep? Strange...I need to @@`
- **[L6](passages/special_event/GhostSpecialEventMare.tw#L6)** — Alternate-branch MC speech ending mid-sentence ('...I need to') that flows into the shared <<linkappend>> ('watch more.') below; the spoken sentence is completed inside the link, so a block <<mc>> would break the inline continuation. Left as-is.
  - `@@.mc-speech; Is this really happening again? I need to@@`

### [passages/special_event/GhostSpecialEventSleepSpirit1.tw](passages/special_event/GhostSpecialEventSleepSpirit1.tw)

- **[L4](passages/special_event/GhostSpecialEventSleepSpirit1.tw#L4)** — mc-thoughts body flows mid-sentence directly into <<linkappend "@@.usebtn; it to end.@@">> which completes the sentence ('you no longer want' + 'it to end.'). Converting to a block <<thought>> breaks the inline continuation and triggers the TW004 'closing macro on same line as content' lint that the rest of the codebase avoids.
  - `@@.mc-thoughts; When he finally enters you, you realize this is not just a dream, but the passion consumes you entirely. Your hips instinctively`
- **[L6](passages/special_event/GhostSpecialEventSleepSpirit1.tw#L6)** — mc-thoughts body flows mid-sentence directly into @@.movebtn; [[sleep|Sleep]]@@ which completes the sentence ('you drift back into' + 'sleep'). Block <<thought>> conversion would break the inline continuation into the move-button link.
  - `@@.mc-thoughts; But suddenly, everything stops. You feel something warm and sticky on your body. It spreads across your skin like a heated liquid.`

### [passages/special_event/GhostSpecialEventWraithEnd.tw](passages/special_event/GhostSpecialEventWraithEnd.tw)

- **[L6](passages/special_event/GhostSpecialEventWraithEnd.tw#L6)** — The .notmc-speech span (lines 6-7) closes mid-sentence and is immediately followed inline on the same line by <<linkappend ...>>, whose visible label continues the same spoken sentence and is styled with a separate .notmc-speechLink class inside the macro's string argument. A block <<say>> would break the inline flow into the linkappend, and the link-label class must not be touched. Needs editorial handling.
  - `@@.notmc-speech; Haha, you're such a slut. <br>\nWell, okay, we have to go, I think you can @@<<linkappend "@@.notmc-speechLink;handle the rest yourself.@@">>`

### [passages/special_event/GhostSpecialEventWraithStart.tw](passages/special_event/GhostSpecialEventWraithStart.tw)

- **[L4](passages/special_event/GhostSpecialEventWraithStart.tw#L4)** — An .notmc-speech span used inline mid-line, immediately followed by a <<linkappend>> macro on the same line; converting to a block <<say>> would break the inline flow into the linkappend. The linkappend's string argument also embeds a separate class (.notmc-speechLink) inside a JS string, not a clean dialogue span. Needs editorial handling (split spoken text from the link mechanic).
  - `@@.notmc-speech;I think it's time to free@@ <<linkappend "@@.notmc-speechLink;your mouth from those rags.@@">>`

### [passages/witch/WitchEndContract.tw](passages/witch/WitchEndContract.tw)

- **[L85](passages/witch/WitchEndContract.tw#L85)** — NPC speech span is used inline inside a <div class="hunt-reveal hunt-reveal-text"> with surrounding markup/content on the same line. The block <<say>> macro would break the inline flow/reveal layout. Left verbatim.
  - `<div class="hunt-reveal hunt-reveal-text">@@.notmc-speech; <<= _trueGhost.name>>. Good. Money on the way.@@<br>`
- **[L93](passages/witch/WitchEndContract.tw#L93)** — NPC speech span used inline inside a <div class="hunt-reveal hunt-reveal-text"> with other content on the same line; block <<say>> macro would break the inline reveal layout. Left verbatim.
  - `<div class="hunt-reveal hunt-reveal-text">@@.notmc-speech; <<= _guess>>? No. It was a <<= _trueGhost.name>>. <<= _trueGhost.evidenceLabels()>>. Contract's sp…`

## `ambiguous` — 110

**What:** Markup the agent wasn't confident was a clean wrapper-swap.  
**Action:** Usually markup assembled in a `<<print>>`/`<<= >>`/JS string, a `~moan~` bare in narration, or a span whose role is unclear. Eyeball each and convert by hand only if it's genuinely a spoken/thought line.

### [passages/church/ToolsEventChurch.tw](passages/church/ToolsEventChurch.tw)

- **[L4](passages/church/ToolsEventChurch.tw#L4)** — NPC-speech span opens on line 4 and its closing @@ is on line 10; the body wraps a multi-line <<linkappend>> block containing nested speech spans. Not a clean single spoken line.
  - `@@.notmc-speech; Yes, you are perfection, show what you can do with <<linkappend "your mouth">> <br>`

### [passages/church/ToolsEventChurch1.tw](passages/church/ToolsEventChurch1.tw)

- **[L6](passages/church/ToolsEventChurch1.tw#L6)** — MC-speech span opens on line 6 and its closing @@ is on line 11; the body wraps a multi-line <<linkappend>> block (with nested speech spans inside). Not a clean single spoken line — converting would break the macro-wrapping structure.
  - `@@.mc-speech; Nooo, wait, I feel like I'm going to cum, fuck me <<linkappend "in the ass, please">>`

### [passages/companion/CompanionMain.tw](passages/companion/CompanionMain.tw)

- **[L29](passages/companion/CompanionMain.tw#L29)** — This @@.mc-speech; span opens on line 29 and does not close until line 75, wrapping a large block of UI: a <<link>> chain, four <div class="companionLvlCheckN"> blocks with their own nested <<link>>/<<redo>> macros and @@.warningtext; spans. It is a structural styling wrapper around interactive controls, not a single spoken line. Converting to <<mc>> would be wrong (it is not speech) and would swallow macros/divs/warning spans. Needs a human to decide what (if anything) here is actually dialogue vs. UI chrome.
  - `@@.mc-speech;\n<br>\n<<link "Stay in your regular clothes.">> ... (opens line 29, closes @@ at line 75)`
- **[L78](passages/companion/CompanionMain.tw#L78)** — Speech body is assembled entirely by a <<= >> expression (dynamic NPC response text). Per spec, markup whose body is produced by <<print>>/<<= >> is flagged as ambiguous rather than mechanically wrapped.
  - `@@.notmc-speech;<<= setup.Companion.getByName(_cname).responseFor(setup.Companion.chanceToAttack())>>@@`

### [passages/companion/CompanionResult.tw](passages/companion/CompanionResult.tw)

- **[L12](passages/companion/CompanionResult.tw#L12)** — Speech body is assembled at runtime by <<= _found.speech>> rather than literal text — cannot confirm it is clean spoken prose without typed quotes. Left byte-for-byte.
  - `@@.mc-speech; <<= _found.speech>>@@<br>`

### [passages/companion/Contacts.tw](passages/companion/Contacts.tw)

- **[L12](passages/companion/Contacts.tw#L12)** — NPC-speech span used as a card header rendering the companion's name via <<= _stats.name>>, not spoken dialogue. Wrapping in <<say>> would auto-quote a UI label and turn a name display into blue quoted speech.
  - `@@.notmc-speech; <<= _stats.name>> @@<br>`

### [passages/companion/alice/AliceContinue.tw](passages/companion/alice/AliceContinue.tw)

- **[L10](passages/companion/alice/AliceContinue.tw#L10)** — Multi-line .mc-thoughts body wraps interactive UI (a <<link>>/<<replace>> video toggle and a .usebtn styled span) spanning lines 10-21; not a clean self-contained thought, so the wrapper swap needs human review.
  - `@@.mc-thoughts; You took turns pleasuring  <<link "@@.usebtn; each other@@">> ... until you were both completely spent.@@`

### [passages/companion/alice/AliceWalkHome.tw](passages/companion/alice/AliceWalkHome.tw)

- **[L14](passages/companion/alice/AliceWalkHome.tw#L14)** — Multi-line .mc-thoughts body (closes @@<br> at line 25) wraps an interactive <<link>>/<<replace>> toggle plus an embedded @@.usebtn;@@ styled span, not a clean text-only thought. Left for human judgment rather than wrapping an interactive control in <<thought>>.
  - `@@.mc-thoughts; You took turns pleasuring ⏎ 	<<link "@@.usebtn;each other@@">>`

### [passages/companion/widgetCompanion.tw](passages/companion/widgetCompanion.tw)

- **[L85](passages/companion/widgetCompanion.tw#L85)** — .mc-speech wraps a multi-line <<link>> macro whose label is an assembled TwineScript expression (closes <</link>>@@ on the next line). Not a clean spoken-text body; converting would wrap an interactive link in the speech block. Human should decide how to present this clickable line.
  - `@@.mc-speech;<<link `"Ask " + _cName + " how " + _args[1] + " ghost hunt went."` `_cName + "HuntEndAlone"`>>`
- **[L96](passages/companion/widgetCompanion.tw#L96)** — .mc-speech wraps a multi-line <<link>> macro (closes <</link>>@@ at line 102) with nested <<replace>>/<<run>> body. Wrapping an interactive link, not plain spoken prose; left for human judgment.
  - `@@.mc-speech;<<link `"Ask " + _cName + " to join you for ghost hunting tonight."`>>`
- **[L110](passages/companion/widgetCompanion.tw#L110)** — .mc-speech wraps a long multi-line <<link>> block (closes <</link>>@@ at line 140) containing nested <<replace>>/<<done>>/<<addclass>> logic and a disabled-state branch. Interactive link, not plain spoken prose; left for human judgment.
  - `@@.mc-speech;<<link "I'd like you to go ghost hunting alone.">>`

### [passages/delivery/DeliveryEvent1.tw](passages/delivery/DeliveryEvent1.tw)

- **[L12](passages/delivery/DeliveryEvent1.tw#L12)** — The .mc-speech span opens here and its closing @@ is on line 18, wrapping an entire <<linkappend>> reveal block (video + nested speech spans). The body mixes spoken words with macro/structural markup, not a clean single utterance. Needs a human to split the spoken bit from the linkappend wrapper.
  - `@@.mc-speech; I don't want this to <<linkappend "ever end">><br>`
- **[L27](passages/delivery/DeliveryEvent1.tw#L27)** — The .notmc-speech span opens here and closes (the @@) on line 36, wrapping a whole <<linkappend>> block (video + nested speech). Spoken words mixed with structural macro markup; not a clean wrapper swap. Needs human handling.
  - `@@.notmc-speech;Wait for me here, <<linkappend "I'll be right back">>`

### [passages/delivery/DeliveryEventStart.tw](passages/delivery/DeliveryEventStart.tw)

- **[L12](passages/delivery/DeliveryEventStart.tw#L12)** — The .mc-speech class wraps an interactive <<linkreplace>> block (spanning lines 12-23, closing <</linkreplace>>@@) rather than a single spoken line, and it is concatenated inline right after a thought span. Converting to <<mc>> would force block layout around a widget. Needs editorial restructure.
  - `@@.mc-speech;<<linkreplace " a blowjob">>`
- **[L29](passages/delivery/DeliveryEventStart.tw#L29)** — The .mc-speech class wraps a <<linkappend>> block (spanning lines 29-34, closing <</linkappend>>@@) carrying nested dialogue/video; not a single spoken line. Converting to <<mc>> would wrap a widget in a block. Needs editorial restructure.
  - `@@.mc-speech; Hmm, okay... <<linkappend "Ouch">>`
- **[L46](passages/delivery/DeliveryEventStart.tw#L46)** — Body is all vocalisation but uses irregular internal tildes (~Hmng~ulrp~), not a clean single ~X~. <<vocal mc>> auto-wraps tildes and could mis-render the internal breaks. Needs a human to confirm intent.
  - `@@.mc-speech; ~Hmng~ulrp~@@`

### [passages/delivery/DeliveryManager.tw](passages/delivery/DeliveryManager.tw)

- **[L270](passages/delivery/DeliveryManager.tw#L270)** — The @@.mc-thoughts;...@@ markup is inside the quoted first argument of <<linkreplace "...">> (used as the link label), not in passage flow. It also wraps a bare ~tilde~ moan. Converting markup assembled inside a macro string argument is out of scope for a mechanical wrapper swap.
  - `<<linkreplace "@@.mc-thoughts;~no. no, fuck, no --~@@">>`
- **[L289](passages/delivery/DeliveryManager.tw#L289)** — The @@.mc-thoughts;...@@ markup is inside the quoted first argument of <<linkreplace "...">> (link label), wrapping a ~tilde~ moan. Markup used as a macro string argument is not a clean mechanical case.
  - `<<linkreplace "@@.mc-thoughts;~just be done with it~@@">>`

### [passages/delivery/DeliverySpecialEvent.tw](passages/delivery/DeliverySpecialEvent.tw)

- **[L67](passages/delivery/DeliverySpecialEvent.tw#L67)** — An .mc-speech span whose body is an entire <<linkreplace>> macro block (spanning lines 67-80) containing videos, nested macros, and further dialogue spans rather than a single spoken line. Not a clean wrapper swap; needs editorial restructuring.
  - `@@.mc-speech;<<linkreplace " I... I need the money">>`

### [passages/gui/Phone.tw](passages/gui/Phone.tw)

- **[L7](passages/gui/Phone.tw#L7)** — Body is a bare SugarCube variable reference (_contact.lockedHint) interpolated at render time, not literal thought prose. Variable-driven content; left for human review rather than guessing the wrapper is safe.
  - `@@.mc-thoughts; _contact.lockedHint @@<br>`
- **[L10](passages/gui/Phone.tw#L10)** — Body is a variable (_stats.name) used as a contact name LABEL in a card header, not an actual spoken utterance. Wrapping in <<say>> would imply dialogue and add quotes around a name display. Variable + non-speech semantics.
  - `@@.notmc-speech; _stats.name @@<br>`
- **[L31](passages/gui/Phone.tw#L31)** — Body is a bare variable reference (_contact.withRainHint) interpolated at render time, not literal thought prose. Variable-driven content; left for human review.
  - `@@.mc-thoughts; _contact.withRainHint @@`

### [passages/gui/widgetText.tw](passages/gui/widgetText.tw)

- **[L30](passages/gui/widgetText.tw#L30)** — MC-speech body is entirely an assembled expression (<<= _out.narrative>>) whose runtime content is unknown; could contain quotes or non-speech text. Left as-is per ambiguous rule.
  - `@@.mc-speech; <<= _out.narrative>>@@<br>`
- **[L48](passages/gui/widgetText.tw#L48)** — MC-speech body is entirely <<= _out.narrative>> (assembled by an expression); content unknown at migration time. Left as-is.
  - `@@.mc-speech; <<= _out.narrative>>@@<br>`
- **[L65](passages/gui/widgetText.tw#L65)** — MC-speech body is entirely <<= _out.narrative>> (assembled by an expression); content unknown at migration time. Left as-is.
  - `@@.mc-speech; <<= _out.narrative>>@@<br>`
- **[L109](passages/gui/widgetText.tw#L109)** — MC-speech body is entirely <<= _out.narrative>> (assembled by an expression); content unknown at migration time. Left as-is.
  - `@@.mc-speech; <<= _out.narrative>>@@`

### [passages/gym/GymTrainer.tw](passages/gym/GymTrainer.tw)

- **[L13](passages/gym/GymTrainer.tw#L13)** — Body is a bare navigation/choice link styled as speech, not spoken dialogue; converting to <<mc>> would mislabel a UI choice as aloud speech.
  - `@@.mc-speech;[[Go to him in sexy lingerie|GymTrainerEvent1Start]]@@`
- **[L20](passages/gym/GymTrainer.tw#L20)** — Tagged .mc-speech but the content is clearly the NPC trainer talking ("you enjoy working out with me"). Speaker mislabel; converting to <<mc>> would bake in the wrong speaker.
  - `@@.mc-speech; It seems like I can feel that you enjoy working out with me.@@`
- **[L21](passages/gym/GymTrainer.tw#L21)** — Tagged .notmc-speech but reads as the MC's reply, entangled with the mislabeled line 20. Speaker assignment needs editorial judgment.
  - `@@.notmc-speech; Oh, sorry, we can stop if you want...@@`
- **[L23](passages/gym/GymTrainer.tw#L23)** — Speech body has a passage link embedded mid-sentence (choice woven into spoken text); not a clean speech-only body.
  - `@@.mc-speech; Yes, I'm [[not in the mood.|GymInside]]@@`
- **[L35](passages/gym/GymTrainer.tw#L35)** — Speech body has a passage link embedded mid-body (choice woven into spoken text); not a clean speech-only body.
  - `@@.mc-speech; Maybe I should [[talk to her?|EmilyTalk]]. I'd like to chat with someone, and she might have something interesting to share.@@`

### [passages/gym/widgetGym.tw](passages/gym/widgetGym.tw)

- **[L6](passages/gym/widgetGym.tw#L6)** — @@.mc-speech;@@ wraps a <span class="evidenceText"> stat-notification card (BEAUTY +1 readout), not spoken dialogue. Converting to <<mc>> would put curly quotes around a UI stat message. Misused dialogue styling for a system notification; leave for human (likely should be .mc-action or a plain evidenceText block).
  - `@@.mc-speech; <span class="evidenceText">Your <<statIcon setup.StatIcon.BEAUTY>> has improved (+1): <<= _gymDelta.beauty>> now!`
- **[L9](passages/gym/widgetGym.tw#L9)** — @@.mc-speech;@@ wraps a <span class="evidenceText"> ENERGY-increase stat notification, not spoken dialogue. Same misuse as line 6.
  - `@@.mc-speech; <span class="evidenceText">Your <<statIcon setup.StatIcon.ENERGY>> has increased (+<<= _gymDelta.energyMaxDelta>>)`
- **[L12](passages/gym/widgetGym.tw#L12)** — @@.mc-speech;@@ wraps a <span class="evidenceText"> ENERGY-cap stat notification, not spoken dialogue. Same misuse as line 6.
  - `@@.mc-speech; <span class="evidenceText">Your <<statIcon setup.StatIcon.ENERGY>> has reached the maximum of 20!</span>`
- **[L15](passages/gym/widgetGym.tw#L15)** — @@.mc-speech;@@ wraps a <span class="evidenceText"> fitness-perfect stat notification, not spoken dialogue. Same misuse as line 6.
  - `@@.mc-speech; <span class="evidenceText">Your fitness level is perfect - 100</span>`
- **[L17](passages/gym/widgetGym.tw#L17)** — @@.mc-speech;@@ wraps a <span class="evidenceText"> fitness-improved stat notification, not spoken dialogue. Same misuse as line 6.
  - `@@.mc-speech; <span class="evidenceText">Your fitness level has improved (+_fitGain): <<= _gymDelta.fit>> now!</span>`

### [passages/haunted_houses/general/BaitOrgasm.tw](passages/haunted_houses/general/BaitOrgasm.tw)

- **[L18](passages/haunted_houses/general/BaitOrgasm.tw#L18)** — The .mc-speech markup lives inside a backtick-quoted JS string passed as the <<linkreplace>> label argument, not as rendered passage prose. Converting it would put a block container macro inside a string literal. Leave for a human.
  - `<<linkreplace `"@@.mc-speech; A-ahh~ I can't — I can't stop —!@@"`>>`

### [passages/haunted_houses/general/EvidenceFoundPassages.tw](passages/haunted_houses/general/EvidenceFoundPassages.tw)

- **[L28](passages/haunted_houses/general/EvidenceFoundPassages.tw#L28)** — MC speech body wraps its text in a styled <span class="evidenceshadowtext">...</span>. Converting to <<mc>> would nest the evidence-shadow styling inside the pink speech block; whether that styling should survive (or be dropped) is a judgment call.
  - `@@.mc-speech; <span class="evidenceshadowtext"> Ohh... what is this...? Nevertheless, one more piece of evidence</span>@@`

### [passages/haunted_houses/general/FindCursedItem.tw](passages/haunted_houses/general/FindCursedItem.tw)

- **[L4](passages/haunted_houses/general/FindCursedItem.tw#L4)** — MC speech body is a <<= _found.speech>> printed expression (content assembled at runtime), and it sits inside the still-open multi-line .mc-speech/linkappend block from line 2. Not a clean static spoken line. Left byte-for-byte.
  - `@@.mc-speech; <<= _found.speech>>@@<br>`

### [passages/haunted_houses/general/FurnitureSearch.tw](passages/haunted_houses/general/FurnitureSearch.tw)

- **[L107](passages/haunted_houses/general/FurnitureSearch.tw#L107)** — MC speech body is assembled entirely from a JS expression (<<= _ci.speech>>). The dynamic string may contain typed quote characters, so wrapping in <<mc>> could double-quote. Needs a human to confirm _ci.speech is quote-free before converting.
  - `@@.mc-speech; <<= _ci.speech>>@@<br>`
- **[L164](passages/haunted_houses/general/FurnitureSearch.tw#L164)** — MC speech body is assembled entirely from a JS expression (<<= _ci.speech>>) inside the huntLootBeat widget. Same dynamic-content concern as line 107; cannot verify it is quote-free, so left unconverted.
  - `@@.mc-speech; <<= _ci.speech>>@@<br>`

### [passages/haunted_houses/general/NudityEvent.tw](passages/haunted_houses/general/NudityEvent.tw)

- **[L69](passages/haunted_houses/general/NudityEvent.tw#L69)** — Not real spoken dialogue — a mechanical stat-increase notification assembled with <<= setup.Mc.exhibitionism()>>. Styled as mc-speech but it is a UI readout, not the MC talking. Left as-is per the 'assembled by <<print>>/<<= >>' ambiguous rule; a human should decide whether to restyle as a system/notification span rather than <<mc>>.
  - `@@.mc-speech; Exhibitionism increased: <<= setup.Mc.exhibitionism()>> now!@@`
- **[L81](passages/haunted_houses/general/NudityEvent.tw#L81)** — Same mechanical stat-increase notification (the >4 exhibitionism branch). Contains <<= >> print and is not actual MC speech; left untouched for human judgment.
  - `@@.mc-speech; Exhibitionism increased: <<= setup.Mc.exhibitionism()>> now!@@`

### [passages/haunted_houses/tools/widgetHauntedHouseStreet.tw](passages/haunted_houses/tools/widgetHauntedHouseStreet.tw)

- **[L44](passages/haunted_houses/tools/widgetHauntedHouseStreet.tw#L44)** — Body is assembled by a <<= >> expression and contains typed double-quotes (<<= _rsh.gateMessage or "Locked">>). Converting risks wrapping a dynamic/quoted expression; this is a UI gate label, not plain monologue. Left byte-for-byte.
  - `@@.mc-thoughts; <<= _rsh.gateMessage or "Locked">>@@`

### [passages/home/pc/FindGhostInfo.tw](passages/home/pc/FindGhostInfo.tw)

- **[L14](passages/home/pc/FindGhostInfo.tw#L14)** — mc-speech body is a system/UI notification ('Information about the _entry.name has been added to the Ghostpedia...'), not actually spoken aloud; also embeds a _entry.name template var. Not a clean spoken line — needs editorial decision (narration vs notification card).
  - `&emsp;&emsp; @@.mc-speech;Information about the _entry.name has been added to the Ghostpedia (ghost icon on the screen).@@`

### [passages/home/pc/Ghostopedia.tw](passages/home/pc/Ghostopedia.tw)

- **[L14](passages/home/pc/Ghostopedia.tw#L14)** — The .notmc-speech body is a dynamic <<= _hct>> print expression (prowlConditionText assembled at runtime), not literal speech text. Converting could mis-wrap a non-spoken UI string; leave for human review.
  - `<<if _hct neq "">><br>@@.notmc-speech;<<= _hct>>@@`

### [passages/home/summoning/SuccubusEventTV.tw](passages/home/summoning/SuccubusEventTV.tw)

- **[L12](passages/home/summoning/SuccubusEventTV.tw#L12)** — NPC (succubus) speech rendered in a raw color:red span, not a .notmc-speech dialogue class. Not a sanctioned mechanical case; also contains a ~tilde~ vocalisation mixed with words.
  - `@@color:red; Hah~ I'll help you, baby...@@`
- **[L35](passages/home/summoning/SuccubusEventTV.tw#L35)** — NPC (succubus) speech rendered in a raw color:red span, not a .notmc-speech dialogue class. Converting would require deciding it is dialogue and which speaker macro applies; left for a human.
  - `@@color:red; Well, that's enough for you today.@@`

### [passages/home/summoning/Summoning.tw](passages/home/summoning/Summoning.tw)

- **[L7](passages/home/summoning/Summoning.tw#L7)** — A single .mc-speech span opens on line 7 and only closes on line 11, wrapping an <<if>> control-flow block (lines 8-10) that itself contains a nested @@.mc-thoughts;...@@ span on line 9. Not a clean one-line wrapper swap: the speech body straddles conditional logic and embeds a thought span, so converting the outer span (or the nested thought independently) needs editorial restructuring. Left byte-for-byte unchanged.
  - `@@.mc-speech; Rain talked about the amulet and how it reacts to the presence of ghosts... <br>`

### [passages/home/summoning/SummoningStart.tw](passages/home/summoning/SummoningStart.tw)

- **[L35](passages/home/summoning/SummoningStart.tw#L35)** — Succubus (NPC) speech rendered via a raw @@color:red;@@ span, not the .notmc-speech dialogue class. Not a clean mechanical case; a human should decide whether to convert to <<say>> (and whether to add a 'Succubus' speaker label, since this whole REFERRED branch is a multi-turn back-and-forth between the MC and the succubus).
  - `@@color:red; Finally, you've reached me, my sweet. Decided to play the hunter, have you?@@`
- **[L37](passages/home/summoning/SummoningStart.tw#L37)** — Succubus speech via raw @@color:red;@@ span rather than .notmc-speech. Convert to <<say>> only after a human confirms the speaker mapping; left byte-for-byte for now.
  - `@@color:red; You naive thing! Do you think you can just banish me like that? You have no idea who you're dealing with, baby.@@`
- **[L39](passages/home/summoning/SummoningStart.tw#L39)** — Succubus speech via raw @@color:red;@@ span, not .notmc-speech. Mechanical conversion not safe; needs human conversion to <<say>>.
  - `@@color:red; Oh, honey, you're so naive. I actually enjoy being here with you, especially when I can play with your puss`
- **[L41](passages/home/summoning/SummoningStart.tw#L41)** — Succubus speech via raw @@color:red;@@ span, not .notmc-speech. Left as-is for human review.
  - `@@color:red; Because you have no choice, bitch. I can make your life hell or heaven, depending on your choice. And don't`
- **[L43](passages/home/summoning/SummoningStart.tw#L43)** — Succubus speech via raw @@color:red;@@ span, not .notmc-speech. Left as-is for human review.
  - `@@color:red; Then I can sometimes distract the ghosts from you during your hunts, so you don't get fucked into oblivion.@@`
- **[L45](passages/home/summoning/SummoningStart.tw#L45)** — Succubus speech via raw @@color:red;@@ span, not .notmc-speech. Left as-is for human review.
  - `@@color:red; Then I'll fuck you every night until you beg for my attention. Choose, baby.@@`
- **[L54](passages/home/summoning/SummoningStart.tw#L54)** — Succubus speech via raw @@color:red;@@ span (inside the Agree <<linkreplace>> body), not .notmc-speech. Left as-is for human conversion to <<say>>.
  - `@@color:red; Great, just think of me when another ghost catches you and wants to fuck you. And now, I'm leaving.@@`
- **[L68](passages/home/summoning/SummoningStart.tw#L68)** — Succubus speech via raw @@color:red;@@ span (inside the Disagree <<linkreplace>> body), not .notmc-speech. Left as-is for human conversion to <<say>>.
  - `@@color:red; Well, sooner or later, you'll agree... So, we'll play with you for a while longer...@@`
- **[L78](passages/home/summoning/SummoningStart.tw#L78)** — Succubus speech via raw @@color:red;@@ span (not .notmc-speech), and the body embeds a trailing <br> plus leads into a .usebtn choice list. Doubly un-mechanical: a human should split the spoken line from the choice scaffolding and convert to <<say>>.
  - `@@color:red; What a good little slut you are, calling me again. Well, let's do something fun. Here's your choice: <br>@@`

### [passages/hunt/HuntEventSuccubus.tw](passages/hunt/HuntEventSuccubus.tw)

- **[L18](passages/hunt/HuntEventSuccubus.tw#L18)** — Raw color:red span used as the succubus's spoken line, not a sanctioned .notmc-speech class. Converting to <<say>> would recolour it (blue) and is an editorial call about whether red NPC speech maps to the say macro. Note the body contains a typed apostrophe (no double-quotes), but it's the raw-colour usage that makes this a judgment case. Left byte-for-byte.
  - `@@color:red; Let's see how long you can last@@<br>`
- **[L44](passages/hunt/HuntEventSuccubus.tw#L44)** — Raw color:red span used as the succubus's spoken line rather than the .notmc-speech class. Converting to <<say>> recolours red->blue; whether red NPC speech should migrate is an editorial decision. Left byte-for-byte.
  - `@@color:red; Fuck me how you want, I'll be your little whore now@@<br>`
- **[L62](passages/hunt/HuntEventSuccubus.tw#L62)** — Raw color:red span used as succubus speech, not .notmc-speech. Same recolour/editorial concern as line 44. Left byte-for-byte.
  - `@@color:red; Fuck me how you want, I'll be your little whore now@@<br>`
- **[L80](passages/hunt/HuntEventSuccubus.tw#L80)** — Raw color:red span used as succubus speech, not .notmc-speech. Same recolour/editorial concern as line 44. Left byte-for-byte.
  - `@@color:red; Fuck me how you want, I'll be your little whore now@@<br>`
- **[L100](passages/hunt/HuntEventSuccubus.tw#L100)** — Raw color:red span used as succubus speech, not .notmc-speech. Same recolour/editorial concern as line 44. Left byte-for-byte.
  - `@@color:red; Fuck me how you want, I'll be your little whore now@@<br>`

### [passages/library/LibraryBrook.tw](passages/library/LibraryBrook.tw)

- **[L46](passages/library/LibraryBrook.tw#L46)** — A .mc-speech span wraps a multi-line <<link>> whose <<replace "#brookInfoAnswer">> body injects nested .mc-speech / .notmc-speech dialogue lines (lines 48-50) at runtime. The dialogue is assembled by macros and the outer span is a UI control, not a clean spoken line — converting block macros inside the <<link>>/<<replace>> body would break layout. Needs human handling.
  - `@@.mc-speech;<<link "Ask Brooke to join you for ghost hunting tonight.">>`
- **[L55](passages/library/LibraryBrook.tw#L55)** — A .mc-speech span wraps a multi-line <<link>> with nested <<replace>> blocks (and nested <<enterbtn>> link replaces) that inject .notmc-speech dialogue at runtime (lines 56, 65, 76) interleaved with .warningtext and color spans. Runtime-assembled / macro-nested dialogue inside link control — not a clean mechanical wrapper swap. Needs human handling.
  - `@@.mc-speech;<<link "I'd like you to go ghost hunting alone.">>`

### [passages/library/LibraryGirl.tw](passages/library/LibraryGirl.tw)

- **[L5](passages/library/LibraryGirl.tw#L5)** — Span tagged .mc-speech but the body ('You watch until she leaves.') is pure second-person narration/action, not something the MC says aloud. Converting to <<mc>> would wrongly add curly quotes and a pink spoken block. Likely belongs in narration; left as-is for editorial judgment.
  - `@@.mc-speech; You watch until she leaves.@@`

### [passages/library/LibraryGuy1.tw](passages/library/LibraryGuy1.tw)

- **[L19](passages/library/LibraryGuy1.tw#L19)** — The .mc-speech span opens but does not close on its line: it wraps an open <<linkappend>> (with a typed quoted body) spanning through the matching <</linkappend>>@@ several lines down. Not a clean single-line speech wrap; restructuring needed.
  - `@@.mc-speech; Well, okay, but keep an eye out to make sure <<linkappend "no one sees us.">>`
- **[L50](passages/library/LibraryGuy1.tw#L50)** — The .mc-speech span opens but does not close on its line: it wraps an open <<linkappend>> (with a typed quoted body) spanning through the matching <</linkappend>>@@ several lines down. Not a clean single-line speech wrap; restructuring needed.
  - `@@.mc-speech; Alright, you can consider yourself deserving of <<linkappend "this.">>`

### [passages/mall/AdultSectionBlake.tw](passages/mall/AdultSectionBlake.tw)

- **[L28](passages/mall/AdultSectionBlake.tw#L28)** — Not spoken dialogue — a system/status notification ('Relationship with Blake increased: now <<=...>>!') styled with the .mc-speech class. Converting to <<mc>> would render it as MC speech with curly quotes, which is wrong. Left as-is for a human to decide (likely should be a plain styled status line, not a dialogue macro).
  - `@@.mc-speech; Relationship with Blake increased: now <<= setup.Mall.blakeRelationship()>>!@@`
- **[L43](passages/mall/AdultSectionBlake.tw#L43)** — .mc-speech wrapping a [[wikilink]] UI action ('Ask her how her ghost hunt went.') rather than literal spoken words. It's a clickable menu option painted in speech colour, not a line the MC says aloud — converting to <<mc>> would auto-quote a navigation link. Needs editorial judgment.
  - `@@.mc-speech; [[Ask her how her ghost hunt went.|BlakeHuntEndAlone]]@@<br>`
- **[L45](passages/mall/AdultSectionBlake.tw#L45)** — .mc-speech opens on a <<link>> and the span body is a multi-line <<link>>...<</link>> block (closes line 52) containing <<run>>/<<replace>> macros. This is a UI action button styled as speech, not a clean spoken line; the macro's auto-quoting/block layout would mangle the link. Needs a human.
  - `@@.mc-speech;<<link "Ask Blake to join you for ghost hunting tonight.">>`
- **[L55](passages/mall/AdultSectionBlake.tw#L55)** — .mc-speech opens on a <<link>> wrapping a large multi-line block (closes line 85) of nested <<link>>/<<replace>>/<<if>> macros and other styled spans. UI action styled as speech, not a literal spoken line — not a clean mechanical wrapper swap. Needs a human.
  - `@@.mc-speech;<<link "I'd like you to go ghost hunting alone.">>`

### [passages/mall/widgetMallShop.tw](passages/mall/widgetMallShop.tw)

- **[L28](passages/mall/widgetMallShop.tw#L28)** — The .mc-thoughts body is assembled by a <<= _ownedText.replace(...)>> print expression and is nested inside a styled <span class="subtitleAmount"> wrapper. The <<thought>> macro applies its own block styling/class, which would conflict with the surrounding subtitleAmount span and the dynamically-generated body; not a safe mechanical wrap. Left byte-for-byte for a human.
  - `<span class="subtitleAmount">@@.mc-thoughts; <<= _ownedText.replace("{n}", State.variables[_varName] || 0)>>@@</span>`

### [passages/missing_women/RescueJadePossessed1.tw](passages/missing_women/RescueJadePossessed1.tw)

- **[L8](passages/missing_women/RescueJadePossessed1.tw#L8)** — Outer .mc-thoughts span opens on this line but its closing @@ is at line 14, wrapping an entire <<linkappend>> block that itself contains nested .mc-thoughts/.mc-speech/.notmc-speech spans. Not a clean single-line thought; converting would require restructuring the nested dialogue.
  - `@@.mc-thoughts; A powerful orgasm shakes your body. ... she started putting something on, but you couldn't see <<linkappend "what it was">>`
- **[L46](passages/missing_women/RescueJadePossessed1.tw#L46)** — NPC speech span opens on line 46, contains an embedded <br>, and runs multiline with its closing @@ at line 59, wrapping a <<linkappend>> block that contains nested .mc-thoughts/.mc-speech/.notmc-speech spans. Multiline nested structure; not a clean single <<say>>.
  - `@@.notmc-speech; I like you better in this position.<br> ⏎ Come on, slut, make your friend <<linkappend "feel good">>`

### [passages/missing_women/RescueJadePossessed2.tw](passages/missing_women/RescueJadePossessed2.tw)

- **[L11](passages/missing_women/RescueJadePossessed2.tw#L11)** — The .mc-speech block opens on line 11 and only closes on line 15 (the @@ after <</linkappend>>). Its body mixes spoken words with a ~tilde~ moan AND wraps a <<linkappend>> that contains a video plus nested .mc-thoughts narration (line 13) and a .notmc-speech NPC line (line 14). Needs editorial splitting into speech + vocal + narration + separate NPC speech; left byte-for-byte, including the nested inner spans.
  - `@@.mc-speech; Oh my god~ I'm going to <<linkappend "cum again~">>`

### [passages/missing_women/RescueJuliaPossessed.tw](passages/missing_women/RescueJuliaPossessed.tw)

- **[L9](passages/missing_women/RescueJuliaPossessed.tw#L9)** — This .mc-thoughts span opens on line 9 and does not close until line 15 (<</linkappend>>@@), wrapping an entire <<linkappend>> block that itself contains nested @@.mc-thoughts;@@ / @@.mc-speech;@@ dialogue spans (lines 11-14). Converting the outer wrapper to <<thought>> would nest those inner dialogue blocks inside a grey-italic thought block and change their meaning. Needs human restructuring; left byte-for-byte.
  - `@@.mc-thoughts; With a strong push, she <<linkappend "shoved you down onto the bed.">>`

### [passages/missing_women/RescueJuliaPossessed1.tw](passages/missing_women/RescueJuliaPossessed1.tw)

- **[L4](passages/missing_women/RescueJuliaPossessed1.tw#L4)** — The .notmc-speech span opens on line 4 and does not close until line 10; it wraps a <<linkappend>> block containing a video, two nested .mc-thoughts spans (lines 6, 8-9 with a [[wikilink]]), and another .notmc-speech line (line 7). The NPC dialogue is split across the structural macro and mixed with narration/thoughts, so it is not a clean wrapper swap. Left lines 4-10 byte-for-byte; a human must restructure (likely pull the spoken text out of the linkappend and add <<narration>> for the action beats).
  - `@@.notmc-speech; You're already dripping wet, and <<linkappend "I'm just getting started.">>`

### [passages/missing_women/RescueNadiaPossessed.tw](passages/missing_women/RescueNadiaPossessed.tw)

- **[L4](passages/missing_women/RescueNadiaPossessed.tw#L4)** — The .mc-speech block opens on line 4 and only closes on line 8 (the @@ after <</linkappend>>). Its body wraps a <<linkappend>> containing a video plus a nested .notmc-speech NPC line (line 6) and a further .mc-speech line mixing words/link/~tilde~ (line 7). Needs editorial restructuring; left byte-for-byte, including the nested inner spans.
  - `@@.mc-speech;What the hell? Wait... how do you <<linkappend "know my...">>`

### [passages/missing_women/RescueVictoriaPossessed.tw](passages/missing_women/RescueVictoriaPossessed.tw)

- **[L10](passages/missing_women/RescueVictoriaPossessed.tw#L10)** — notmc-speech span opens on L10 and closes on L14, wrapping a <<linkappend>> that contains a <<video>> and nested mc/notmc speech spans. Not a clean wrapper swap; needs editorial restructuring. Left byte-for-byte.
  - `@@.notmc-speech; Ha, no way. You don't interest me much, but I'll still <<linkappend "teach you a lesson before I let you`
- **[L13](passages/missing_women/RescueVictoriaPossessed.tw#L13)** — notmc-speech body contains a [[link]] and is nested inside the unconverted L10-14 notmc block. Left as-is.
  - `@@.notmc-speech; What a juicy slut I've got here. Relax, I'm just [[getting started.|RescueVictoriaPossessed1][setup.Missing`
- **[L23](passages/missing_women/RescueVictoriaPossessed.tw#L23)** — notmc-speech span opens on L23 and closes on L27, wrapping a <<linkappend>> containing a <<video>> and nested mc/notmc speech spans. Not a clean wrapper swap. Left byte-for-byte.
  - `@@.notmc-speech; Ha, no way. You don't interest me much, but I'll still <<linkappend "teach you a lesson before I let you`
- **[L26](passages/missing_women/RescueVictoriaPossessed.tw#L26)** — notmc-speech body contains a [[link]] and is nested inside the unconverted L23-27 notmc block. Left as-is.
  - `@@.notmc-speech; What a juicy slut I've got here. Relax, I'm just [[getting started.|RescueVictoriaPossessed1][setup.Missing`
- **[L34](passages/missing_women/RescueVictoriaPossessed.tw#L34)** — notmc-speech span opens on L34 and closes on L39, spanning multiple lines and wrapping a <<linkappend>> with a <<video>> and nested mc/notmc speech spans. Not a clean wrapper swap. Left byte-for-byte.
  - `@@.notmc-speech; Hello, sweetheart. Were you trying to save your little friend? You're too late... She's under my control`
- **[L38](passages/missing_women/RescueVictoriaPossessed.tw#L38)** — notmc-speech body contains a [[link]] and is nested inside the unconverted L34-39 notmc block. Left as-is.
  - `@@.notmc-speech; What a juicy slut I've got here. Relax, I'm just [[getting started.|RescueVictoriaPossessed1][setup.Missing`

### [passages/park/ParkMugging.tw](passages/park/ParkMugging.tw)

- **[L51](passages/park/ParkMugging.tw#L51)** — This .mc-speech span is a UI status notification assembled with <<= _exhibAfter>>, not spoken MC dialogue. Left byte-for-byte unchanged; a human should decide whether it should be a different status style rather than dialogue.
  - `@@.mc-speech;Exhibitionism increased: <<= _exhibAfter>> now!@@`

### [passages/posession/possessedLocation1.tw](passages/posession/possessedLocation1.tw)

- **[L6](passages/posession/possessedLocation1.tw#L6)** — Not a recognized dialogue class (raw color:red; span used as ghost/NPC speech). Body also mixes spoken words with multiple ~tilde~ moans and a stray '*'. Needs a human to decide say vs vocal split; left untouched.
  - `@@color:red; Yes~ fuck me~ more *Ah~<br>@@`
- **[L15](passages/posession/possessedLocation1.tw#L15)** — Raw color:red; span used as NPC/ghost speech rather than a .notmc-speech dialogue class. Out of scope for mechanical conversion; left untouched for editorial review.
  - `@@color:red; What, are you spying? Maybe you can help him, because one dick is not enough for me@@<br>`
- **[L76](passages/posession/possessedLocation1.tw#L76)** — Raw color:red; span used as NPC/ghost speech rather than a .notmc-speech dialogue class. Left untouched.
  - `@@color:red; Well, we've only just started. I think we'll go somewhere else now that we're done here. @@<br>`
- **[L100](passages/posession/possessedLocation1.tw#L100)** — Raw color:red; span used as NPC/ghost speech rather than a .notmc-speech dialogue class. Left untouched.
  - `@@color:red; So which one of you will fuck me first?@@<br>`
- **[L116](passages/posession/possessedLocation1.tw#L116)** — Raw color:red; span used as NPC/ghost speech rather than a .notmc-speech dialogue class. (Inner <<= expr>> would wikify fine inside a macro, but the class itself is non-standard.) Left untouched.
  - `@@color:red; Fuck! I'm not done, but okay, we'll think of something, right, <<= setup.Mc.name()>>? @@<br>`
- **[L140](passages/posession/possessedLocation1.tw#L140)** — Raw color:red; span used as NPC/ghost speech rather than a .notmc-speech dialogue class. Left untouched.
  - `@@color:red; I'll make you cum, buttslut@@<br>`
- **[L164](passages/posession/possessedLocation1.tw#L164)** — Raw color:red; span used as NPC/ghost speech rather than a .notmc-speech dialogue class. Left untouched.
  - `@@color:red;Enjoy this, I've waited so long to use a body like yours.@@<br>`
- **[L174](passages/posession/possessedLocation1.tw#L174)** — Raw color:red; span used as NPC/ghost speech rather than a .notmc-speech dialogue class. Left untouched.
  - `@@color:red; Well, we've only just started. I think we'll go somewhere else now that we're done here. @@<br>`

### [passages/posession/possessedLocation2.tw](passages/posession/possessedLocation2.tw)

- **[L15](passages/posession/possessedLocation2.tw#L15)** — Ghost/possessor speech styled with a raw inline `color:red` span, not one of the recognized dialogue classes (.mc-speech/.notmc-speech). Left untouched; a human should decide whether it maps to <<say>>.
  - `@@color:red; Well, we've only just started. I think we'll go somewhere else now that we're done here. @@`

### [passages/posession/spiritBlake.tw](passages/posession/spiritBlake.tw)

- **[L3](passages/posession/spiritBlake.tw#L3)** — The .mc-thoughts span opens on line 3, spans a <br> line break, and is closed mid-line 4 immediately before <<linkappend "@@.mc-thoughtsLink; came right inside you. @@">> — the thought body is interrupted by a macro and the closing tag abuts an unrelated styled-link class assembled as the linkappend label. Not a clean single-body wrap; needs human judgment to split/restructure.
  - `@@.mc-thoughts; <<= setup.Companion.name()>> licks your incredibly wet pussy, not forgetting about the stranger's balls<br>`

### [passages/special_event/GhostSpecialEventNapSpirit1.tw](passages/special_event/GhostSpecialEventNapSpirit1.tw)

- **[L3](passages/special_event/GhostSpecialEventNapSpirit1.tw#L3)** — Inline .mc-thoughts fragment butts directly against a <<linkappend>> on the same line in a non-nobr passage. Converting to <<thought>> either trips TW004 (close on same line as content) or, if the close is split to its own line, injects a <br> that reflows the linkappend link onto a new line. Needs human to restructure.
  - `@@.mc-thoughts; You open your eyes and notice a dick next to your face. Thoughts race through your mind--could this be`
- **[L6](passages/special_event/GhostSpecialEventNapSpirit1.tw#L6)** — One sentence interleaves two .mc-thoughts fragments around a .usebtn; [[shock and confusion|Bedroom]] link span (note the @@@@ adjacency) inline in a non-nobr passage. Wrapping each thought fragment in <<thought>> would trip TW004 or reflow the sentence with injected <br>s. Needs human to restructure.
  - `@@.mc-thoughts;  It takes you a while to fully grasp what's happening. You decide to stop it, but the mysterious figure`

### [passages/witch/WitchEctoplasm.tw](passages/witch/WitchEctoplasm.tw)

- **[L76](passages/witch/WitchEctoplasm.tw#L76)** — .mc-thoughts span is used inline mid-line (after '-- ') and wraps a <<= _mod.description>> print expression rather than literal prose. Markup assembled from a print expression is a judgment call; left as-is.
  - `-- @@.mc-thoughts;<<= _mod.description>>@@<br>`

### [passages/witch/WitchEctoplasmQuest.tw](passages/witch/WitchEctoplasmQuest.tw)

- **[L81](passages/witch/WitchEctoplasmQuest.tw#L81)** — The speech span is the string argument of <<linkreplace>> (a quoted macro label), not free passage text. Wrapping it in a block container macro inside a macro-string arg is not a clean mechanical swap; needs human review of the reveal-label pattern.
  - `<<linkreplace "@@.mc-speech; What happens if I can't even find it?@@">>`
- **[L88](passages/witch/WitchEctoplasmQuest.tw#L88)** — Speech span used as the quoted string label of <<linkreplace>>; not free passage prose. Block container inside a macro-string arg is not a clean swap.
  - `<<linkreplace "@@.notmc-speech; You're staring.@@">>`
- **[L96](passages/witch/WitchEctoplasmQuest.tw#L96)** — Speech span used as the quoted string label of <<linkreplace>>; not free passage prose. Block container inside a macro-string arg is not a clean swap.
  - `<<linkreplace "@@.mc-speech; And the candle. Where does that come in?@@">>`
- **[L106](passages/witch/WitchEctoplasmQuest.tw#L106)** — Speech span used as the quoted string label of <<linkreplace>>; not free passage prose. Block container inside a macro-string arg is not a clean swap.
  - `<<linkreplace "@@.mc-speech; And if something's already in my mouth when it's time to say it?@@">>`
- **[L112](passages/witch/WitchEctoplasmQuest.tw#L112)** — Thought span used as the quoted string label of <<linkreplace>>; not free passage prose. Even though inline thought is normally convertible, here it lives inside a macro-string argument, so it needs human review.
  - `<<linkreplace "@@.mc-thoughts; She's not finished showing me.@@">>`

### [passages/witch/WitchInside.tw](passages/witch/WitchInside.tw)

- **[L168](passages/witch/WitchInside.tw#L168)** — Malformed span: the .mc-thoughts span has NO closing @@ — it ends with <br> and the next line closes the <<if>>. Converting would require deciding where the thought body actually ends; left byte-for-byte for a human.
  - `@@.mc-thoughts; Find the cursed object in the haunted house. Bring it to Khadija.<br>`
- **[L173](passages/witch/WitchInside.tw#L173)** — Speech class wraps a multi-line <<linkreplace>>/<<goto>> macro (a clickable UI link label, not plain spoken prose). Auto-quoting would wrap the interactive link in curly quotes. Not a clean mechanical speech conversion.
  - `@@.mc-speech;<<linkreplace "What's on the board?">>\n\t\t<<goto "WitchContracts">>\n\t<</linkreplace>>@@`
- **[L176](passages/witch/WitchInside.tw#L176)** — Speech class wraps a multi-line <<linkreplace>>/<<goto>> macro (clickable link label). Auto-quoting would wrap the link. Same case as line 173.
  - `@@.mc-speech;<<linkreplace "What do you have that I can use?">>\n\t\t<<goto "WitchSale">>\n\t<</linkreplace>>@@`
- **[L180](passages/witch/WitchInside.tw#L180)** — Speech class wraps a multi-line <<linkreplace>>/<<goto>> macro (clickable link label). Auto-quoting would wrap the link. Same case as line 173.
  - `@@.mc-speech;<<linkreplace "What's ectoplasm worth?">>\n\t\t\t<<goto "WitchEctoplasm">>\n\t\t<</linkreplace>>@@`
- **[L185](passages/witch/WitchInside.tw#L185)** — Outer .mc-speech wraps a multi-line <<linkreplace>> link label (and contains a nested NPC speech span inside). Both a UI-link issue and a nested-class issue; not a clean mechanical conversion.
  - `@@.mc-speech;<<linkreplace "Anything in level 3 gear?">>`
- **[L186](passages/witch/WitchInside.tw#L186)** — NPC speech body is conditionally assembled with an <<if>>/<<else>>/<</if>> spanning 3 lines, and it is nested inside the outer .mc-speech link-label span on line 185. Conditional-assembly + nesting make this a judgment call.
  - `@@.notmc-speech; <<if setup.Witch.ownsLevel3Gwb()>>\n\t\t\t<<else>>I have a level 3 ghostwriting book. Not for sale. Also,\n\t\t\t<</if>>Father Ibrahim at th…`
