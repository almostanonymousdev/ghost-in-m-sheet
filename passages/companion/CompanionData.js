// Static catalogue + lookup tables consumed by CompanionController.
// Pure data only: no behavior, no closures over State.variables. Pulled
// out of CompanionController so that file is "behavior only" and the
// companion catalogue + per-companion event media tables live in
// one place.
//
// Loaded after CompanionController.js alphabetically; the controller
// reads setup.CompanionData lazily inside its api methods (and through
// the deferred companions() helper) so by the time any game-time call
// runs, both scripts have executed.

setup.CompanionData = (function () {
	// Per-companion CompanionEvent video/image tables. Each tier key
	// (high/mid/low/crit) maps either to an array of {type, src} entries
	// or to a {default, inElm?, lustHigh?} bundle whose keys are picked at
	// runtime by Companion.pickEventMediaList. Hoisted here so the catalogue
	// config below can inline them onto each entry's eventMedia field.
	var eventMediaBrook = {
		high: {
			default: [{type:"image",src:"characters/brook/1.0.jpg"},{type:"image",src:"characters/brook/1.1.jpg"},{type:"video",src:"characters/brook/1.2.mp4"},{type:"video",src:"characters/brook/1.3.mp4"},{type:"video",src:"characters/brook/1.4.mp4"},{type:"video",src:"characters/brook/1.5.mp4"}],
			inElm:   [{type:"image",src:"characters/brook/1.6.jpg"},{type:"image",src:"characters/brook/1.7.jpg"},{type:"video",src:"characters/brook/1.8.mp4"}]
		},
		mid: {
			default: [{type:"video",src:"characters/brook/2.0.mp4"},{type:"video",src:"characters/brook/2.1.mp4"},{type:"video",src:"characters/brook/2.2.mp4"},{type:"video",src:"characters/brook/2.3.mp4"},{type:"image",src:"characters/brook/2.4.jpg"}],
			inElm:   [{type:"video",src:"characters/brook/2.5.mp4"},{type:"video",src:"characters/brook/2.6.mp4"},{type:"video",src:"characters/brook/2.7.mp4"},{type:"video",src:"characters/brook/2.8.mp4"}]
		},
		low: {
			default: [{type:"video",src:"characters/brook/3.0.mp4"},{type:"video",src:"characters/brook/3.1.mp4"},{type:"video",src:"characters/brook/3.2.mp4"},{type:"video",src:"characters/brook/3.3.mp4"}],
			inElm:   [{type:"video",src:"characters/brook/3.6.mp4"},{type:"video",src:"characters/brook/3.7.mp4"}]
		},
		crit: {
			default: [{type:"video",src:"characters/brook/4.0.mp4"},{type:"video",src:"characters/brook/4.1.mp4"},{type:"video",src:"characters/brook/4.2.mp4"},{type:"video",src:"characters/brook/4.3.mp4"}],
			inElm:   [{type:"video",src:"characters/brook/4.4.mp4"},{type:"video",src:"characters/brook/4.5.mp4"},{type:"video",src:"characters/brook/4.6.mp4"},{type:"video",src:"characters/brook/4.7.mp4"}]
		}
	};
	var eventMediaAlice = {
		high: [{type:"image",src:"characters/alice/1.0.jpg"},{type:"video",src:"characters/alice/1.1.mp4"},{type:"video",src:"characters/alice/1.2.mp4"},{type:"video",src:"characters/alice/1.3.mp4"},{type:"image",src:"characters/alice/1.4.jpg"},{type:"video",src:"characters/alice/1.5.mp4"}],
		mid: {
			default:  [{type:"video",src:"characters/alice/2.0.mp4"},{type:"video",src:"characters/alice/2.1.mp4"},{type:"video",src:"characters/alice/2.2.mp4"},{type:"video",src:"characters/alice/2.3.mp4"},{type:"video",src:"characters/alice/2.4.mp4"},{type:"video",src:"characters/alice/2.5.mp4"}],
			lustHigh: [{type:"video",src:"characters/alice/2.6.mp4"},{type:"video",src:"characters/alice/2.7.mp4"},{type:"video",src:"characters/alice/2.8.mp4"},{type:"video",src:"characters/alice/2.9.mp4"},{type:"video",src:"characters/alice/2.10.mp4"},{type:"video",src:"characters/alice/2.11.mp4"},{type:"video",src:"characters/alice/2.12.mp4"}]
		},
		low: {
			default:  [{type:"video",src:"characters/alice/3.0.mp4"},{type:"video",src:"characters/alice/3.1.mp4"},{type:"video",src:"characters/alice/3.2.mp4"},{type:"video",src:"characters/alice/3.3.mp4"},{type:"video",src:"characters/alice/3.4.mp4"}],
			inElm:    [{type:"video",src:"characters/alice/3.5.mp4"},{type:"video",src:"characters/alice/3.6.mp4"},{type:"video",src:"characters/alice/3.7.mp4"}],
			lustHigh: [{type:"video",src:"characters/alice/3.8.mp4"},{type:"video",src:"characters/alice/3.9.mp4"},{type:"video",src:"characters/alice/3.10.mp4"},{type:"video",src:"characters/alice/3.11.mp4"},{type:"video",src:"characters/alice/3.12.mp4"}]
		},
		crit: {
			default:  [{type:"video",src:"characters/alice/4.0.mp4"},{type:"video",src:"characters/alice/4.1.mp4"},{type:"video",src:"characters/alice/4.2.mp4"},{type:"video",src:"characters/alice/4.3.mp4"},{type:"video",src:"characters/alice/4.4.mp4"},{type:"video",src:"characters/alice/4.5.mp4"}],
			lustHigh: [{type:"video",src:"characters/alice/4.6.mp4"},{type:"video",src:"characters/alice/4.7.mp4"},{type:"video",src:"characters/alice/4.8.mp4"},{type:"video",src:"characters/alice/4.9.mp4"},{type:"video",src:"characters/alice/4.10.mp4"},{type:"video",src:"characters/alice/4.11.mp4"}]
		}
	};
	var eventMediaBlake = {
		high: [{type:"video",src:"characters/blake/1.1.mp4"},{type:"video",src:"characters/blake/1.2.mp4"},{type:"video",src:"characters/blake/1.3.mp4"},{type:"video",src:"characters/blake/1.4.mp4"},{type:"video",src:"characters/blake/1.5.mp4"}],
		mid:  [{type:"video",src:"characters/blake/2.0.mp4"},{type:"video",src:"characters/blake/2.1.mp4"},{type:"video",src:"characters/blake/2.2.mp4"},{type:"video",src:"characters/blake/2.3.mp4"},{type:"video",src:"characters/blake/2.4.mp4"},{type:"video",src:"characters/blake/2.5.mp4"}],
		low:  [{type:"video",src:"characters/blake/3.0.mp4"},{type:"video",src:"characters/blake/3.1.mp4"},{type:"video",src:"characters/blake/3.2.mp4"},{type:"video",src:"characters/blake/3.3.mp4"},{type:"video",src:"characters/blake/3.4.mp4"}],
		crit: [{type:"video",src:"characters/blake/4.0.mp4"},{type:"video",src:"characters/blake/4.1.mp4"},{type:"video",src:"characters/blake/4.2.mp4"},{type:"video",src:"characters/blake/4.3.mp4"},{type:"video",src:"characters/blake/4.4.mp4"},{type:"video",src:"characters/blake/4.5.mp4"},{type:"video",src:"characters/blake/4.6.mp4"},{type:"video",src:"characters/blake/4.7.mp4"},{type:"video",src:"characters/blake/4.8.mp4"}]
	};

	// Canonical companion catalogue. Static per-companion metadata. The
	// near-identical Main passages collapse into a single
	// <<companionMain>> dispatch by keying off these entries.
	var config = [
		{
			name: "Brook", key: "brook",
			imageFolder: "brook", imagePrefix: "brook",
			canWalkHome: true, hasExpSystem: true,
			pronObj: "her", pronPos: "her",
			neutralResp: "Let's keep it simple.",
			eventMedia: eventMediaBrook,
			// Per-companion content passages — each one is a slot in the
			// generic dispatchers (CompanionHelp / Contacts /
			// WalkHomeTogether / Phone) so callers never reference the
			// per-name passage by literal. Brook has no home-continue
			// follow-up scene; the walk-home video chain ends inline.
			helpPassage:         "BrookHelp",
			huntEndAlonePassage: "BrookHuntEndAlone",
			infoPassage:         "BrookInfo",
			walkHomePassage:     "BrookWalkHome",
			homeContinuePassage: null,
			spiritEventPassage:  "BrookSpiritEvent",
			// Phone / Contacts row metadata: locked-state hint, possessed +
			// with-rain hints (Brook's three transient states the GUI cards
			// have to disambiguate), and whether the row is "unlocked" yet.
			contactsLockedHint: "Need to search in the library",
			isUnlocked:         function () { return setup.Library.hasMetBrook(); },
			canText:            function () {
				return !setup.Library.brookIsPossessed()
					&& !setup.Library.brookIsWithRain();
			},
			possessedHint: "She's not answering... Strange, she usually responds right away...",
			withRainHint:  "She's probably still with Rain. Maybe it's worth waiting a couple of days.",
			isWithRain:    function () { return setup.Library.brookIsWithRain(); },
			// While the MC is in a hunt and Brook is the active companion at
			// lvl 2+, certain ToolController paths (eg. spiritbox-possession
			// roll) stamp Brook as "possessed at home" so the Home arc fires.
			// activatePossessionOnHuntTool fires from ToolController via
			// setup.Companion.maybeActivatePossessionOnHuntTool, keeping the
			// companion-name predicate inside the catalogue.
			activatePossessionOnHuntTool: function () {
				if (setup.Companion.companionLvl('Brook') >= 2
					&& setup.Companion.isCompanionFlagActive()) {
					setup.Home.markBrookePossessedActive();
				}
			},
			// Brook's "have I met her" / "is she available" gates live on
			// the Library/Home controllers (they own meetBrook + the
			// brooke-with-Rain cooldown). Hooks delegate so the companion
			// controller never reads other controllers' $vars by name.
			hasMet:        function () { return setup.Library.hasMetBrook(); },
			isPossessed:   function () { return setup.Library.brookIsPossessed(); },
			isUnavailable: function () { return setup.Home.brookePossessedCDLow(); },
			// Per-companion stat overrides merged over baseStats by
			// Companion.prototype.defaultState(). Only the fields that
			// differ from the shared defaults live here.
			initStats: {
				plan2TimeReq: 15, plan3TimeReq: 10, plan4TimeReq: 10,
				chanceOfSuccessCI: 20, chanceOfSuccessGR: 30
			},
			// Per-street solo-hunt odds keyed by companion level (2..5+).
			// Owaissa is the safer / lower-paying street; Elm is the risk
			// branch. lvl < 2 falls back to 0%/0%.
			soloSkillCurve: { 2: [25, 10], 3: [40, 25], 4: [55, 40], 5: [70, 55] },
			clothingTiers: [
				{ mc: "Lose the top -- it'll be easier to move.",
				resp: "Lose the top. Sure. Library work didn't prepare me for this part of the job, but okay." },
				{ mc: "Down to your underwear. It'll thin the air a little.",
				resp: "Honestly? I move better like this. Don't ask me why." },
				{ mc: "Panties only. Keep it light.",
				resp: "I'm making it easier for the ghost. I know. I don't actually mind." },
				{ mc: "Everything. Make it pay attention to you, not me.",
				resp: "Strip down, draw fire. Got it. Fair warning, I'm not subtle about it." }
			],
			// Per-companion CompanionEvent dialog by sanity tier (1..4).
			// Strings are wikified by <<companionTextEvent>>: $mc.name and
			// $companion.name are substituted at render time.
			eventCopy: [
				"@@.mc-thoughts; As you entered the room, you immediately saw her. She was naked and visibly shaken.@@<br>\n@@.mc-speech; Oh God, what happened to you?@@<br>\n@@.notmc-speech; I don't want to talk about it... Just help me@@<br>\n@@.mc-thoughts; You walked over to her, carefully helping her up.@@<br>",
				"@@.mc-thoughts; As you entered the room, you immediately saw her. But she wasn't alone. Fortunately, you entered just in time, and as soon as you did, the ghost let her go and vanished@@<br>\n@@.mc-speech; $companion.name , are you alright? I saw the ghost trying to...@@<br>\n@@.notmc-speech; Thank you, $mc.name, you came just in time.@@<br>\n@@.mc-thoughts; You walked over to her, carefully helping her up.@@<br>",
				"@@.mc-thoughts; As you entered the room, you immediately saw her. But she wasn't alone. Fortunately, you entered just in time, and as soon as you did, the ghost let her go and vanished@@<br>\n@@.mc-speech; $companion.name, are you alright? I saw what the ghost was doing to you...@@<br>\n@@.notmc-speech; Thank you, $mc.name, you came just in time.@@<br>\n@@.mc-thoughts; You walked over to her, carefully helping her up.@@<br>",
				"@@.mc-thoughts; As you entered the room, you immediately saw her. But she wasn't alone. Fortunately, you entered just in time, and as soon as you did, the ghost let her go and vanished@@<br>\n@@.mc-speech; $companion.name, are you alright? I saw what the ghost was doing to you...@@<br>\n@@.notmc-speech; Thank you, $mc.name, you came just in time.@@<br>\n@@.mc-thoughts; You walked over to her, carefully helping her up.@@<br>"
			]
		},
		{
			name: "Alice", key: "alice",
			imageFolder: "alice", imagePrefix: "alice",
			canWalkHome: true, hasExpSystem: true,
			pronObj: "her", pronPos: "her",
			neutralResp: "Tell me where you want me.",
			eventMedia: eventMediaAlice,
			helpPassage:         "AliceHelp",
			huntEndAlonePassage: "AliceHuntEndAlone",
			infoPassage:         "AliceInfo",
			walkHomePassage:     "AliceWalkHome",
			homeContinuePassage: "AliceContinue",
			spiritEventPassage:  "AliceSpiritEvent",
			contactsLockedHint:  "Deliver books to the correct address",
			isUnlocked:          function () { return setup.Companion.hasAliceMet(); },
			canText:             function () { return true; },
			possessedHint:       "",
			withRainHint:        "",
			isWithRain:          function () { return false; },
			// HuntOver intercept: Alice's catch animation runs a different
			// final-blackout sequence than the wardrobe-based default. Each
			// catalogue entry that wants to intercept the catch sets
			// `huntOverPassage` to the per-companion passage and the
			// HuntOver hook dispatcher in HuntOver.tw includes it instead
			// of the wardrobe-based default.
			huntOverPassage: "AliceHuntOver",
			// Alice owns the $meetAlice flag and $aliceWorkDone. hasMet/
			// markMet wrap the former; onHuntFail (called only on the
			// active companion) zeroes workDone unless Alice was on a
			// solo run -- a botched joint hunt invalidates the delivery.
			hasMet:  function () { return setup.Companion.hasAliceMet(); },
			markMet: function () { setup.Companion.markAliceMet(); },
			onHuntFail: function () {
				var stats = setup.Companion.aliceStats();
				if (stats && stats.goingSolo === 0) setup.Companion.clearAliceWorkDone();
			},
			initStats: {
				plan2TimeReq: 15, plan3TimeReq: 15, plan4TimeReq: 10,
				chanceOfSuccessCI: 30, chanceOfSuccessGR: 50
			},
			soloSkillCurve: { 2: [20, 10], 3: [40, 20], 4: [50, 40], 5: [75, 65] },
			clothingTiers: [
				{ mc: "Lose the top -- it'll be easier to move.",
				resp: "Top off. Right. I trust you, $mc.name, but you're definitely buying coffee after this." },
				{ mc: "Down to your underwear. It'll thin the air a little.",
				resp: "Underwear. Sure. Tell anyone at the office and I'll kill you twice." },
				{ mc: "Panties only. Keep it light.",
				resp: "Just my panties? God. Okay. Don't look at me like that, just keep moving." },
				{ mc: "Everything. Make it pay attention to you, not me.",
				resp: "Completely naked. Cool. Cool cool cool. You owe me forever, $mc.name." }
			],
			eventCopy: [
				"@@.mc-thoughts; When you entered the room, you saw her.@@<br> @@.mc-speech; Are you alright?@@<br> @@.notmc-speech; I'm fine. It's just a ghost, nothing to worry about. And it looks like I almost beat it.@@<br> @@.mc-thoughts; It seems I can see the marks of that fight on her...@@<br> @@.mc-speech; Well done, I'm proud of you.@@<br>",
				"@@.mc-thoughts; As you entered the room, you immediately saw her. But she wasn't alone. <br>The ghost, noticing you, disappeared instantly.@@<br>\n@@.mc-speech; $companion.name, are you alright?@@<br>\n@@.notmc-speech; Yes, I think I'm fine.@@<br>\n@@.mc-thoughts; A faint smile remained on her face, as if she had enjoyed the encounter. @@<br>\n@@.notmc-speech; I hope it comes back so I can teach it a lesson...@@<br>",
				"@@.mc-thoughts; Before entering the room, you hear strange sounds coming from inside. <br>\nAs you entered the room, you immediately saw her. But she wasn't alone. You walked in just in time to see what was happening...<br>\nIt seems she doesn't want to be interrupted. But as soon as the ghost saw you, it disappeared. @@<br>\n@@.mc-speech; $companion.name, are you alright? I heard strange noises...@@<br>\n@@.notmc-speech; Don't worry, it just caught me by surprise.@@<br>\n@@.mc-speech; Sure...@@<br>",
				"@@.mc-thoughts; Before entering the room, you hear soft moans coming from inside. <br>\nAs you entered the room, you immediately saw her. But she wasn't alone. You walked in just in time to see what was happening...<br>\nIt seems she doesn't want to be interrupted. But as soon as the ghost saw you, it disappeared. @@<br>"
			]
		},
		{
			name: "Blake", key: "blake",
			imageFolder: "blake", imagePrefix: "blake",
			canWalkHome: true, hasExpSystem: true,
			pronObj: "her", pronPos: "her",
			neutralResp: "Point me at it.",
			eventMedia: eventMediaBlake,
			helpPassage:         "BlakeHelp",
			huntEndAlonePassage: "BlakeHuntEndAlone",
			infoPassage:         "BlakeInfo",
			walkHomePassage:     "BlakeWalkHome",
			homeContinuePassage: "BlakeContinue",
			spiritEventPassage:  "BlakeSpiritEvent",
			contactsLockedHint:  "Befriend the assistant at the sex shop <br>(Relationship 5+)",
			isUnlocked:          function () { return (setup.Mall.blakeRelationship() || 0) >= 5; },
			canText:             function () { return true; },
			possessedHint:       "",
			withRainHint:        "",
			isWithRain:          function () { return false; },
			// While Blake is the active companion, post-possession cleanup
			// needs to know if the hunt was "Blake with cursed item" so
			// PosessionController can decide whether to return the item
			// to the Witch. Catalogue-driven so PosessionController never
			// hardcodes the companion name.
			triggersPossessionCursedItem: true,
			// If Blake was the active companion and the hunt ended badly
			// while she was carrying a cursed item for the Witch, she
			// drops it. Witch owns the gotCursedItem flag.
			onHuntFail: function () {
				if (!setup.Companion.isCompanionFlagActive()) return;
				if (!setup.Witch.hasCursedItemToTurnIn()) return;
				setup.Witch.clearCursedItemHeld();
			},
			initStats: {
				plan2TimeReq: 10, plan3TimeReq: 15, plan4TimeReq: 10,
				chanceOfSuccessCI: 30, chanceOfSuccessGR: 20,
				chanceOfSuccessAnyEvidence: 15
			},
			soloSkillCurve: { 2: [25, 10], 3: [40, 25], 4: [55, 40], 5: [70, 55] },
			clothingTiers: [
				{ mc: "Lose the top -- it'll be easier to move.",
				resp: "Top off, sure. Honestly half the reason I'm in this is the view." },
				{ mc: "Down to your underwear. It'll thin the air a little.",
				resp: "Underwear's fine. Bait and switch is a perfectly respectable strategy." },
				{ mc: "Panties only. Keep it light.",
				resp: "Just panties. Don't say I never went the extra mile for the cause." },
				{ mc: "Everything. Make it pay attention to you, not me.",
				resp: "Naked it is. If the ghost's got pockets, we're getting paid extra, $mc.name." }
			],
			eventCopy: [
				"@@.mc-thoughts; When you entered the room, you saw her.@@<br> @@.mc-speech; What are you doing?@@<br> @@.notmc-speech; I thought I could attract the ghost this way.@@<br> @@.mc-speech; Why?@@<br> @@.notmc-speech; Well, maybe it would have more cursed items, and I could take them for myself.@@<br>\n@@.mc-speech; I don't think that's how it works, or the ghost would probably not want to share with you.@@<br>\n@@.notmc-speech; I still think my plan will work.@@<br>\n@@.mc-speech; Alright, let's keep looking.@@<br>",
				"@@.mc-thoughts; As you entered the room, you immediately saw her. But she wasn't alone. <br>The ghost, noticing you, disappeared instantly.@@<br>\n@@.mc-speech; $companion.name, are you alright?@@<br>\n@@.notmc-speech; Yes, I saw it! I think you scared it away.@@<br>\n@@.mc-speech; Are you disappointed? I just saved you.@@<br>\n@@.notmc-speech; Well, yeah, of course...@@<br>\n@@.mc-speech; Alright, let's continue.@@<br>",
				"@@.mc-thoughts; Before entering the room, you hear strange sounds coming from inside. <br>\nAs you entered the room, you immediately saw her. But she wasn't alone. You walked in just in time to see what was happening...<br>\nIt seems she doesn't want to be interrupted. But as soon as the ghost saw you, it disappeared. @@<br>\n@@.mc-speech; $companion.name, are you alright? I heard strange noises...@@<br>\n@@.notmc-speech; Don't worry, it just caught me by surprise.@@<br>\n@@.mc-speech; Sure...@@<br>",
				"@@.mc-thoughts; Before entering the room, you hear soft moans coming from inside. <br>\nAs you entered the room, you immediately saw her. But she wasn't alone. You walked in just in time to see what was happening...<br>\nIt seems she doesn't want to be interrupted. But as soon as the ghost saw you, it disappeared. @@<br>\n\n@@.mc-speech; $companion.name, are you alright? I heard screaming...@@<br>\n@@.notmc-speech; Don't worry, it just caught me by surprise.@@<br>\n@@.mc-speech; Sure...@@<br>"
			]
		}
	];

	// Sanity threshold below which the active companion leaves you mid-event
	// for a given level. Index by companion lvl (1..5+). lvl >= 5 is "no
	// floor": trust is total.
	var sanityCapByLevel = [75, 75, 50, 25, 0, 0];

	// Shared stat defaults baked into every fresh $brook/$alice/$blake
	// companion state. Per-companion overrides live in the catalogue's
	// initStats field.
	var baseStats = {
		sanity: 100, sanityMax: 100, corruption: 0,
		lust: 0, lvl: 1, exp: 0, expForNextLvl: 20,
		eventSanityLoss: 10,
		chanceOfSuccessEMF: 15, chanceOfSuccessECTO: 15,
		chanceOfSuccessGWB: 15, chanceOfSuccessSB: 15,
		chanceOfSuccessTEMP: 15, chanceOfSuccessUVL: 15,
		chanceOfSuccessAnyEvidence: 25,
		chosen: 0, chanceToAttack: 25,
		goingSolo: 0, paidForSolo: 0,
		chooseOwaissa: 0, chooseElm: 0,
		soloChanceOwaissa: 0, soloChanceElm: 0
	};

	// The 4 non-zero attack-chance tiers, indexed the same as clothingTiers.
	// Shared across all companions: slider values are game-balance, not
	// character dialogue.
	var tierChances = [40, 55, 70, 90];
	var baseChance  = 25;

	// Payout for a successful solo hunt, keyed by street. Owaissa is the
	// safer / lower-paying contract; Elm is riskier. Driven from data so
	// the controller's payoutSoloHunt doesn't hardcode the figures.
	var soloRewards     = { Owaissa: 50, Elm: 100 };
	// Up-front cost to dispatch a companion solo. Charged by
	// payForSoloContract from $mc.money; canAffordSoloContract gates UI.
	var soloContractFee = 20;

	// When Plan2 succeeds with no cursed item in hand, one of these is
	// rolled and the matching $isCI<Type> save flag is set.
	var cursedItemTypes = [
		{ key: "isCIDildo",    speech: "Dildo???",      img: "mechanics/curseditems/dildo.png" },
		{ key: "isCIButtplug", speech: "Buttplug???",   img: "mechanics/curseditems/buttplug.png" },
		{ key: "isCIBeads",    speech: "Anal beads???", img: "mechanics/curseditems/beads.png" },
		{ key: "isCIHDildo",   speech: "Huge dildo???", img: "mechanics/curseditems/monsterdildo.png" }
	];

	return {
		config:           config,
		sanityCapByLevel: sanityCapByLevel,
		baseStats:        baseStats,
		tierChances:      tierChances,
		baseChance:       baseChance,
		soloRewards:      soloRewards,
		soloContractFee:  soloContractFee,
		cursedItemTypes:  cursedItemTypes
	};
})();
