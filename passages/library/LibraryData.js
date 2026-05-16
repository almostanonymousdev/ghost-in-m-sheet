// Static catalogue consumed by LibraryController. Pure data only:
// no behavior, no closures over State.variables. Pulled out of
// LibraryController so that file is "behavior only" and the long
// torn-page tip catalogue lives in one place.
//
// Loaded after LibraryController.js alphabetically; the controller
// reads setup.LibraryData lazily inside its api methods, so by the
// time any game-time call runs both scripts have executed.

setup.LibraryData = (function () {
	/* Torn-page tip catalogue. Each entry is one fragment of advice
	   the MC pieces back together from pages a ghost ripped out of
	   an older field guide. `title` is the heading that prints above
	   the body when the page is found or re-read. Voice: a previous
	   hunter, in evocative second-person, no game-system terms. Add
	   an entry to extend the drop pool — LibraryController's
	   availableSearchResults closes the spigot automatically once
	   every page has been recovered. Placeholders; refine when the
	   final list is settled. */
	var tornPageTips = Object.freeze([
		{
			title: "On the Dark",
			body: "Search in the dark. Where the lights die, the spirits speak louder, and your instruments listen further. The price is steeper -- the dark thins your reason, and a hungry ghost will move on you sooner -- but every reading you take in a black room is worth two in a lit one."
		},
		{
			title: "On the Crucifix",
			body: "A crucifix held close is one hunt unborn. Wait until the room turns cold and the air starts to lean on you -- then break the silence with it. The dead still fear the second prayer."
		},
		{
			title: "On Your Own Hunger",
			body: "Keep yourself together. The hungrier you grow for them, the easier they catch your scent -- and the louder every floorboard answers. There are doors that won't open at all until your blood is up; close those doors yourself, before the house does it for you."
		},
		{
			title: "On Bait",
			body: "If you must summon them to a chosen room, offer the only thing they want. A flush of want -- bare skin, an unspoken thought you would not say aloud -- will pin a spirit to your floorboards more reliably than salt or iron. Use it sparingly. They remember being fed."
		},
		{
			title: "On Companions",
			body: "Never alone if you can help it. Two minds in the dark steady each other; one mind unravels at half the speed. A companion will not save you from what is in the room, but they will buy you the seconds you need to walk out of it."
		},
		{
			title: "On the Bedroom",
			body: "Always go home. A whole night under a familiar roof undoes a bad one in the field -- but only if you make it home before the sun does. Sleep in another's home and you wake into someone else's idea of morning."
		},
		{
			title: "On Bedroom Visitors",
			body: "If something visits while you sleep and will not leave, do not wait it out. Bless the room tonight, before tomorrow gets worse. The thing under your bed grows bolder every night you let it stay."
		},
		{
			title: "On Waking Strange",
			body: "If you wake in a place you didn't lie down in, and your hands are not free -- the thing that took you there has not lost interest just because the sun is up. Conserve your strength. Crawl, if you must. Save your screaming for when it will be heard."
		},
		{
			title: "On the Quick and the Slow",
			body: "Some of them are slow but tireless. Some are quick but blind. Learn which you are sharing the floor with before you learn the wrong way to die. The slow ones cannot be hidden from. The quick ones cannot be outrun."
		},
		{
			title: "On Liars",
			body: "Trust the room before the tools. There are spirits that lie through every needle and dial in your bag -- numbers that spike at empty walls, thermometers that read ice in a sunlit kitchen. When the meter and your skin disagree, believe your skin."
		},
		{
			title: "On Calm",
			body: "Don't trust the calm. There are things in the catalog that will not wait until you are afraid -- they begin while you are still polite. If a room feels wrong on the threshold, it is already too late to be careful. Be quick instead."
		},
		{
			title: "On the Long Walk",
			body: "Every step you take inside a haunted house is a step you will not get back. Pace yourself. The exhausted hunter is the one the spirits keep. Sit when you can. Leave before you have to."
		},
		{
			title: "On Stripping Bare",
			body: "Some hunters peel down to skin to read a room better. They are not wrong -- the readings come sharper, the windows open longer. They are also, in my experience, not the ones who get to write the next page of this book."
		},
		{
			title: "On Overcharging",
			body: "Pushing your tools past their limit reads a room sharper, but it bleeds your nerve every step. Save it for the room you've already pinned -- never for the room you're still searching."
		},
		{
			title: "On Tiers",
			body: "The cheap meter and the expensive meter answer the same question, but only one of them will answer it before the lights come back on. Don't bring rusted iron to a serious house."
		},
		{
			title: "On the Window",
			body: "Your meter isn't always listening. It wakes when the spirit answers a question or marks a page, and it sleeps again a few minutes later. Don't waste those minutes walking to another room."
		},
		{
			title: "On the Witch's Detector",
			body: "There is a thing the old woman sells that hums when a haunted door is close. If you can afford it, buy it. Walking the wrong street twice is worse than her price."
		},
		{
			title: "On Buying Knowledge",
			body: "If a hunter survived something, they will often sell the lesson cheap. The witch keeps a shelf of them. A name in your notebook is one less night spent guessing."
		},
		{
			title: "On the Pills",
			body: "The little white pills work, but only just. Two are a courtesy. A third is a habit you'll regret. Take them when the room starts breathing in time with you, not before."
		},
		{
			title: "On the Edge",
			body: "At the height of want, your reason hemorrhages. If the urge doesn't pass, it will spend itself one way or another -- and you'll pay for the next many minutes in shaking hands and a thinning mind."
		},
		{
			title: "On Confession",
			body: "The priest in the white church will quiet a body that won't quiet itself. Don't be too proud. The dead don't care which knees you knelt on."
		},
		{
			title: "On Salon Mirrors",
			body: "A face that catches the eye buys seconds in a hunt that would otherwise have taken you. Vanity is a kind of armor. Wear it to work."
		},
		{
			title: "On Painted Rooms",
			body: "There is a thing in the catalog that tracks reflections. If a mirror starts showing you twice, paint over the second one before nightfall."
		},
		{
			title: "On the Fourth Smear",
			body: "When ectoplasm comes up in a room where it shouldn't, you are not facing what your notebook says you are. There is a ghost in the catalog that mimics the others; the slime is the only thing it can't fake."
		},
		{
			title: "On Wandering Rooms",
			body: "Most spirits drift between rooms. One does not. If every reading you've taken sits in the same four walls, plan for that."
		},
		{
			title: "On Cold That Isn't Cold",
			body: "There is a kind of ghost that pulls heat out of you faster than out of the air. If your hands are colder than the thermometer says they should be, leave."
		},
		{
			title: "On the Stalker",
			body: "Some spirits don't end with you. If you walked away from one half-finished, look behind you on the way home, and don't sleep alone."
		},
		{
			title: "On Praying",
			body: "When the room turns and the door is too far, pray. It costs a piece of you, and a piece of your stride, but it has saved better hunters than us."
		},
		{
			title: "On the Aftermath",
			body: "When your body finishes against your will inside a haunted room, the next several minutes are not yours. Walk to a wall. Stay there. Don't try to fight what comes for you while you're shaking."
		},
		{
			title: "On the Door You Came In",
			body: "Leaving early is not failing. The door is a tool. Use it before the house decides which door you leave through."
		},
		{
			title: "On the Notebook",
			body: "Write the evidence down the moment you find it. The room will try to make you doubt what you saw. The page won't."
		},
		{
			title: "On the Walk Home",
			body: "If you walked into the house with a companion, walk out with one. Splitting up at the threshold is how the catalog gets longer."
		},
		{
			title: "On the Empty Bag",
			body: "Don't walk into a haunted house with no money in your pocket. The witch's door is open at strange hours, and you will want what she sells before you want what's in your fridge."
		},
		{
			title: "On Familiar Furniture",
			body: "Sometimes a thing follows you home. If your own bed, your own bath, your own screen starts asking for a piece of you, give it nothing. Burn the offer in the fireplace if you have to."
		},
		{
			title: "On the Mirror Twins",
			body: "There is a night when you'll see yourself sleeping next to yourself. Don't reach. Don't speak. Hold the holy water above the pillow and wait it out."
		}
	]);

	return {
		tornPageTips: tornPageTips
	};
})();
