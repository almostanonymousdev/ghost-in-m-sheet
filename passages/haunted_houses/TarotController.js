/*
 * Tarot deck system: catalogue + lifecycle for the cursed tarot cards
 * the player can draw mid-hunt. Owns:
 *   - the canonical deck (setup.tarotDeck)
 *   - the per-hunt stage flag (HIDDEN -> CARRYING -> SPENT)
 *   - the drawn-card counter and the latest chosen card
 *   - the discoverable / unlock predicates the FurnitureSearch +
 *     meta-shop pre-stamp paths gate on
 *
 * Draws are dispatched via TarotCards.tw, which wikifies the chosen
 * card's `effect` widget name. Hunt-start / hunt-end teardown lives on
 * HuntController.resetCursedItemState(), which clears the stage + draw
 * counter back to a fresh deck.
 */
/* Lifecycle of $tarotCardsStage. HIDDEN: deck still in furniture,
   FurnitureSearch can pick it up. CARRYING: player holds the deck and
   can draw cards. SPENT: every card drawn this hunt; deck is done. */
setup.TarotStage = Object.freeze({
	HIDDEN: 0,
	CARRYING: 1,
	SPENT: 2
});

/* Canonical tarot deck. `effect` names the widget invoked after the card
   is drawn (defined in widgetTarot.tw); draw-time dispatch in TarotCards.tw
   is a single line that wikifies <<effectName>>. Fool has no effect widget --
   its reveal-then-swap flow is handled directly by the draw logic. */
setup.tarotDeck = [
	{ name: "passion", chance: 20, image: "mechanics/cursedpossessions/tarot-cards/passion.jpg", effect: "tarotPassion" },
	{ name: "pulse", chance: 20, image: "mechanics/cursedpossessions/tarot-cards/pulse.jpg", effect: "tarotPulse" },
	{ name: "oblivion", chance: 1, image: "mechanics/cursedpossessions/tarot-cards/oblivion.jpg", effect: "tarotOblivion" },
	{ name: "knowledge", chance: 10, image: "mechanics/cursedpossessions/tarot-cards/knowledge.jpg", effect: "tarotKnowledge" },
	{ name: "power", chance: 12, image: "mechanics/cursedpossessions/tarot-cards/power.jpg", effect: "tarotPower" },
	{ name: "whore", chance: 10, image: "mechanics/cursedpossessions/tarot-cards/whore.jpg", effect: "tarotWhore" },
	{ name: "death", chance: 5, image: "mechanics/cursedpossessions/tarot-cards/death.jpg", effect: "tarotDeath" },
	{ name: "possession", chance: 1, image: "mechanics/cursedpossessions/tarot-cards/possession.jpg", effect: "tarotPossession" },
	{ name: "highpriestess", chance: 2, image: "mechanics/cursedpossessions/tarot-cards/highpriestess.jpg", effect: "tarotHighpriestess" },
	{ name: "fool", chance: 19, image: "mechanics/cursedpossessions/tarot-cards/fool.jpg" }
];

/* Weighted pick: roll once against the accumulated chances, return the
   first card whose running total covers the roll. */
setup.drawTarotCard = function (deck) {
	var total = deck.reduce(function (s, c) { return s + c.chance; }, 0);
	var roll = Math.random() * total;
	var acc = 0;
	for (var i = 0; i < deck.length; i++) {
		acc += deck[i].chance;
		if (roll < acc) return deck[i];
	}
	return deck[deck.length - 1];
};

setup.Tarot = (function () {
	var sv = setup.sv;

	/* Player level at which the tarot deck enters the game: floor-plan
	   pickups stop being filtered out by isLootKindAvailable, and the
	   Witch's Blessing meta-shop perk stops pre-stamping the deck.
	   Matches the monkey paw gate (lvl 2) so both cursed-possession
	   items enter the rotation together alongside the witch's
	   cursed-item quest. */
	var TAROT_LEVEL_REQUIRED = 2;

	var OWNED_VARS = Object.freeze([
		'chosenCard', 'drawnCards', 'tarotCardsStage'
	]);

	var api = {
		OWNED_VARS: OWNED_VARS,

		// `|| 0` / `|| HIDDEN` getters stay inline — fallback is
		// load-bearing (callers compare with eq/lt and do arithmetic
		// on fresh saves where the field is undefined).
		tarotCardsStage: function () { return sv().tarotCardsStage || setup.TarotStage.HIDDEN; },
		drawnCards: function () { return sv().drawnCards || 0; },
		/* Player-level gate. The tarot deck stops appearing in
		   furniture and the Witch's Blessing meta-shop perk skips its
		   pre-stamp until the MC has reached TAROT_LEVEL_REQUIRED. */
		tarotLevelRequired: function () { return TAROT_LEVEL_REQUIRED; },
		isTarotUnlocked: function () { return setup.Mc.lvl() >= TAROT_LEVEL_REQUIRED; },
		/* True when the deck is currently retrievable from a furniture
		   slot. Combines the per-hunt stage gate (HIDDEN means the
		   deck hasn't been picked up yet this hunt) with the player-
		   level gate. FurnitureSearch + HuntController.isLootKindAvailable
		   gate on this so the highlight and the pickup stay in lockstep. */
		isTarotDiscoverable: function () {
			return this.isTarotUnlocked()
				&& this.tarotCardsStage() === setup.TarotStage.HIDDEN;
		},
		incrementDrawnCards: function () {
			sv().drawnCards = (sv().drawnCards || 0) + 1;
		},
		/* Pull & stamp a fresh tarot card from setup.tarotDeck. The
		   `cheatTarotCard` setting (if set to a card name) forces the
		   draw to that card instead of rolling -- and emits CHEAT_USED
		   so the achievement / cheated-save marker fire on consumption,
		   not just on toggle (loading a save with the picker already
		   set would otherwise sidestep it). */
		drawAndStampTarotCard: function () {
			var forced = null;
			var pick = settings.cheatTarotCard;
			if (pick && pick !== "—") {
				forced = setup.tarotDeck.filter(function (c) {
					return c.name === pick;
				})[0] || null;
				if (forced) {
					setup.StoryEvents.emit(setup.StoryEvents.Event.CHEAT_USED, { source: 'cheatTarotCard' });
				}
			}
			sv().chosenCard = forced || setup.drawTarotCard(setup.tarotDeck);
			return sv().chosenCard;
		},
		/* Reset the tarot carry/use state for a fresh hunt: stage back
		   to HIDDEN, draw counter zero, latest chosen card cleared.
		   Hunt-start / hunt-end teardown owns the call site via
		   HuntController.resetCursedItemState. */
		resetHunt: function () {
			var s = sv();
			s.tarotCardsStage = setup.TarotStage.HIDDEN;
			s.drawnCards = 0;
			delete s.chosenCard;
		}
	};

	// Pure $variable passthrough accessors. tarotCardsStage / drawnCards
	// keep their inline getters above (the `||` fallback is load-bearing);
	// only the bare setters fold here.
	setup.defineAccessors(api, sv, [
		{ name: 'chosenTarotCard', key: 'chosenCard', set: false },
		{ name: 'tarotCardsStage', get: false },
		{ name: 'drawnCards', get: false }
	]);
	setup.defineStageAccessors(api, sv, 'tarotCardsStage', setup.TarotStage, {
		mark: { markTarotCarrying: 'CARRYING', markTarotSpent: 'SPENT' }
	});
	return api;
})();
