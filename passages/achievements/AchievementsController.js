/*
 * Achievements: persistent, one-shot unlocks. Browseable across saves,
 * survives endRun() / endContract(). The catalogue is the source of
 * truth for valid ids; $achievements is just the unlocked-when map.
 *
 * Only Hunt-event-bus subscribers are wired here -- adding non-hunt
 * triggers (outfits, zone visits, wishes) is a matter of subscribing
 * from the relevant controller and calling setup.Achievements.unlock(id).
 */
setup.Achievements = setup.Achievements || {};

(function () {
	var OWNED_VARS = Object.freeze(['achievements']);

	var sv = setup.sv;
	function store() {
		var s = sv();
		if (!s.achievements) s.achievements = {};
		return s.achievements;
	}

	/* Static catalogue. id is the storage key. hidden:true keeps the
	   entry out of the locked list entirely until earned (vs. shown
	   with a hint). Bestiary entries are derived from the ghost
	   catalogue at lookup time -- see fullCatalogue() below. */
	var STATIC_CATALOGUE = Object.freeze([
		// --- Failure suite ---
		{ id: 'fail.sanity',     name: 'Lost the Plot',         hint: 'End a hunt with your mind frayed.',     category: 'failure' },
		{ id: 'fail.exhaustion', name: 'Dead on Your Feet',     hint: 'Collapse mid-hunt.',                    category: 'failure' },
		{ id: 'fail.time',       name: 'Sunrise, Sunrise',      hint: 'Run out the clock.',                    category: 'failure' },
		{ id: 'fail.caught',     name: 'Caught Cold',           hint: 'Get taken by something hungry.',        category: 'failure' },
		{ id: 'fail.possessed',  name: 'Not Yourself',          hint: 'Wear another voice home.',              category: 'failure' },
		{ id: 'fail.fled',       name: 'Better Part of Valor',  hint: 'Leave a house in a hurry.',             category: 'failure' },
		// `fail.abandon` fires on FailureReason.ABANDON, which today only
		// stamps from the Monkey Paw "leave wish" exit -- not a generic
		// contract walk-out. Distinct from `disc.cold_feet` below.
		{ id: 'fail.abandon',    name: 'Out the Back',          hint: 'Wish your way out of a hunt.',          category: 'failure' },

		// --- Wins with a twist (Hunt.Event.HUNT_END_GRACEFUL) ---
		{ id: 'win.first',    name: 'First Blood',     hint: 'Banish your first ghost.',                      category: 'win' },
		{ id: 'win.nocaught', name: 'Untouched',       hint: 'Win without ever being grabbed.', hidden: true, category: 'win' },
		{ id: 'win.notools',  name: 'Bare Hands',      hint: 'Win without activating EMF or UVL.', hidden: true, category: 'win' },
		{ id: 'win.mimic',    name: 'Pierce the Veil', hint: 'Banish a Mimic.',                  hidden: true, category: 'win' },
		{ id: 'win.pacifist',    name: 'Used My Words',                 hint: 'Win without pressing the spiritbox once.',                    hidden: true, category: 'win' },
		{ id: 'win.no_wishes',   name: "No, I've Read That Story",      hint: 'Carry the monkey paw through a winning hunt without burning a wish.', hidden: true, category: 'win' },
		{ id: 'win.empty_bag',   name: 'Improvise, Adapt, Get Felt Up', hint: 'Win a hunt rolled with Empty Bag.',                            hidden: true, category: 'win' },
		{ id: 'win.speed_banish',name: "Home Before the Coffee's Cold", hint: 'Banish a ghost in under an hour of in-house time.',           hidden: true, category: 'win' },
		{ id: 'win.faceoff',     name: 'Face/Off',                      hint: 'Banish a Mimic before it changes face.',                      hidden: true, category: 'win' },
		{ id: 'win.knocks',      name: "I'm the One Who Knocks",        hint: 'Outlast the Mare.',                                           hidden: true, category: 'win' },

		// --- Discovery (one-shot the first time something rare fires) ---
		{ id: 'disc.trap',      name: 'Pinned',         hint: 'Trap a ghost mid-hunt.',         category: 'discovery' },
		{ id: 'disc.drift',     name: 'It Moved',       hint: 'Watch the favorite room shift.', category: 'discovery' },
		{ id: 'disc.loot.cash', name: 'Sticky Fingers', hint: 'Pocket cash off a haunted shelf.', category: 'discovery' },
		{ id: 'disc.loot.ecto', name: 'Green Thumb',    hint: 'Bottle ectoplasm.',              category: 'discovery' },
		{ id: 'disc.three_am',     name: 'Three A.M. Somewhere',                hint: 'Be out at the witching hour.',                                 category: 'discovery' },
		{ id: 'disc.trap_twice',   name: 'Stay. Sit. Stay. Again.',             hint: 'Trap the same ghost twice in one hunt.',                       category: 'discovery' },
		{ id: 'disc.pants_on_fire',name: 'Pants on Fire',                       hint: 'Catch a sensor lying to you.',                                 category: 'discovery' },
		{ id: 'disc.drift_twice',  name: "Can't Stop Won't Stop Moving",        hint: 'Watch the favorite room shift twice in one hunt.',             category: 'discovery' },
		{ id: 'disc.naughty_list', name: 'On the Naughty List',                 hint: 'Permanently ban a modifier from your draft pool.',             category: 'discovery' },
		{ id: 'disc.tempting_fate',name: 'Tempting Fate',                       hint: 'Spend a reroll charge.',                                       category: 'discovery' },
		{ id: 'disc.take_two',     name: 'Take Two and Call Me in the Morning', hint: 'Get a sanity pill and swallow one before midnight.',           category: 'discovery' },
		{ id: 'disc.library_card', name: "Havin' Fun Ain't Hard",               hint: 'Crack open one of the deep-shelf books.',                      category: 'discovery' },
		{ id: 'disc.good_girl',    name: 'Good Girl',                           hint: 'Sign your first contract with Khadija.',                       category: 'discovery' },
		{ id: 'disc.cold_feet',    name: 'Cold Feet',                           hint: 'Walk out of a contracted house without facing the ghost.',     category: 'discovery' },
		{ id: 'disc.hide_and_seek',name: 'Hide and Seek',                       hint: 'Learn which ghosts will not be hidden from, and which you must outrun.', hidden: true, category: 'discovery' },

		// repeatable:true entries re-fire UNLOCKED every time unlock()
		// is called, regardless of stored state -- the player-button
		// gag in the bedroom is the canonical example.
		{ id: 'fun.sploosh', name: 'sploosh', hint: '???', hidden: true, repeatable: true, category: 'fun',
		  icon: 'ui/achievements/sploosh.png' },
		{ id: 'fun.cheat',   name: 'all achievements disabled.   ...wait.', hint: 'sit upon your throne of lies', hidden: true, category: 'fun' }
	]);

	function bestiaryCatalogue() {
		if (!setup.Ghosts || typeof setup.Ghosts.list !== 'function') return [];
		return setup.Ghosts.list().map(function (g) {
			return {
				id: bestiaryId(g.name),
				name: g.name,
				hint: '???',
				hidden: true,
				category: 'bestiary'
			};
		});
	}

	function bestiaryId(name) {
		return 'bestiary.' + String(name || '').toLowerCase();
	}

	function fullCatalogue() {
		return STATIC_CATALOGUE.concat(bestiaryCatalogue());
	}

	function byId(id) {
		var all = fullCatalogue();
		for (var i = 0; i < all.length; i++) {
			if (all[i].id === id) return all[i];
		}
		return null;
	}

	function has(id) { return !!store()[id]; }

	/* Cheats poison the save for future unlocks. Once any cheat has fired,
	   no new achievement can be earned -- previously-unlocked entries stay
	   unlocked, but unlock() silently no-ops on fresh ids. The lone
	   exception is 'fun.cheat' itself: the joke entry is *the* artifact
	   that proves the save has been cheated, so the CHEAT_USED handler
	   still needs to grant it after marking the save. */
	function hasCheated() { return !!store().cheatedSave; }
	function markCheated() { store().cheatedSave = true; }

	function unlock(id) {
		var entry = byId(id);
		if (!entry) {
			console.warn('Achievements.unlock: unknown id', id);
			return false;
		}
		if (hasCheated() && id !== 'fun.cheat') return false;
		var s = store();
		var firstTime = !s[id];
		if (firstTime) s[id] = { at: Date.now() };
		if (firstTime || entry.repeatable) {
			setup.Achievements.emit(setup.Achievements.Event.UNLOCKED, { id: id, entry: entry });
		} else {
			setup.Achievements.emit(setup.Achievements.Event.ALREADY_HAD, { id: id, entry: entry });
		}
		return firstTime;
	}

	function all()    { return fullCatalogue(); }
	function locked() {
		var s = store();
		return fullCatalogue().filter(function (a) { return !s[a.id]; });
	}
	function unlocked() {
		var s = store();
		return fullCatalogue().filter(function (a) { return !!s[a.id]; });
	}

	/* --- Per-hunt scratch, NOT $State.
	   Aggregates flags over a single START..END window. Reset on START
	   so a mid-hunt save/load forgets these (conservative direction --
	   if you reloaded mid-hunt, you don't get the no-tools award). */
	var huntFlags = null;
	function resetHuntFlags() {
		/* houseEnterMinutes stays null until HOUSE_ENTER stamps the
		   in-house clock; win.speed_banish gates on a real timestamp so
		   pre-house bailouts can't qualify. */
		huntFlags = {
			caughtThisRun: false,
			toolsUsedThisRun: false,
			spiritboxUsedThisRun: false,
			trapCount: 0,
			driftCount: 0,
			mimicRotateCount: 0,
			houseEnterMinutes: null,
			hadContractAtStart: setup.WitchContract.hasHeldContract(),
			pawHeldAtStart: setup.MonkeyPaw.isFound(),
			threeAmUnlocked: false
		};
	}

	/* Hunt-bus wiring is deferred to :storyready because Tweego's
	   script-passage concatenation order is filesystem-driven --
	   passages/achievements/ sorts ahead of passages/hunt/, so setup.Hunt
	   does not exist yet at the moment this IIFE runs. By :storyready
	   every script passage has eval'd and every setup.* facade is
	   populated. */
	function registerHuntSubscriptions() {
		if (!setup.Hunt || !setup.Hunt.Event) {
			console.error('Achievements: setup.Hunt missing at :storyready; subscriptions skipped.');
			return;
		}
		var E = setup.Hunt.Event;

		setup.Hunt.on(E.START, function () { resetHuntFlags(); });

		setup.Hunt.on(E.CAUGHT, function () {
			if (huntFlags) huntFlags.caughtThisRun = true;
			unlock('fail.caught');
		});

		setup.Hunt.on(E.POSSESS, function () { unlock('fail.possessed'); });
		setup.Hunt.on(E.TRAP, function () {
			unlock('disc.trap');
			if (huntFlags) {
				huntFlags.trapCount += 1;
				if (huntFlags.trapCount >= 2) unlock('disc.trap_twice');
			}
		});
		setup.Hunt.on(E.DRIFT, function () {
			unlock('disc.drift');
			if (huntFlags) {
				huntFlags.driftCount += 1;
				if (huntFlags.driftCount >= 2) unlock('disc.drift_twice');
			}
		});
		setup.Hunt.on(E.SENSOR_GLITCH, function () { unlock('disc.pants_on_fire'); });

		setup.Hunt.on(E.SPIRITBOX_USED, function () {
			if (huntFlags) huntFlags.spiritboxUsedThisRun = true;
		});

		setup.Hunt.on(E.MIMIC_ROTATE, function () {
			if (huntFlags) huntFlags.mimicRotateCount += 1;
		});

		/* Stamp the in-house clock for win.speed_banish. HOUSE_ENTER fires
		   from GhostStreet before the first in-house tick; resetToMidnight
		   has already run by then, so the captured timestamp is the true
		   "minute 0" for the hunt. */
		setup.Hunt.on(E.HOUSE_ENTER, function () {
			if (!huntFlags) return;
			huntFlags.houseEnterMinutes = setup.Time.totalMinutes();
		});

		setup.Hunt.on(E.LOOT_TAKEN, function (ctx) {
			if (!ctx) return;
			if (ctx.kind === 'cash')      unlock('disc.loot.cash');
			if (ctx.kind === 'ectoplasm') unlock('disc.loot.ecto');
		});

		/* No "tool activated" event exists; sample tool state every TICK.
		   TICK fires on every nav step / tool tick during a hunt, so this
		   catches activation within a tick of it happening. The same tick
		   also gates the witching-hour discovery -- only one fire per
		   hunt, so the threeAmUnlocked latch keeps idempotent. */
		setup.Hunt.on(E.TICK, function () {
			if (!huntFlags) return;
			if (setup.ToolController.isActivated('emf')
				|| setup.ToolController.isActivated('uvl')) {
				huntFlags.toolsUsedThisRun = true;
			}
			if (!huntFlags.threeAmUnlocked && setup.Time.hours() === 3) {
				huntFlags.threeAmUnlocked = true;
				unlock('disc.three_am');
			}
		});

		/* Hunt-end achievements split across both end events: wins, flees,
		   exhaustion, time-out, and abandon all arrive via GRACEFUL;
		   sanity-out arrives via ASSAULTED. CAUGHT / POSSESSED already
		   unlock via their dedicated events. Same handler runs on both
		   since the dispatch keys off ctx.success / ctx.failureReason. */
		function onHuntEnd(ctx) {
			var FR = setup.HuntController && setup.HuntController.FailureReason;
			if (!ctx) { huntFlags = null; return; }
			if (ctx.success) {
				unlock('win.first');
				if (huntFlags && !huntFlags.caughtThisRun)        unlock('win.nocaught');
				if (huntFlags && !huntFlags.toolsUsedThisRun)     unlock('win.notools');
				if (huntFlags && !huntFlags.spiritboxUsedThisRun) unlock('win.pacifist');

				/* Empty Bag is the LOCKED_TOOLS modifier id (see
				   passages/hunt/ModifiersController.js). */
				if (setup.HuntController.hasModifier('locked_tools')) {
					unlock('win.empty_bag');
				}

				/* Speed banish: < 60 in-house minutes between HOUSE_ENTER
				   and HUNT_END_GRACEFUL. Skip when the start timestamp
				   never landed (defensive — should always be set by then). */
				if (huntFlags
					&& huntFlags.houseEnterMinutes !== null
					&& setup.Time.totalMinutes() - huntFlags.houseEnterMinutes < 60) {
					unlock('win.speed_banish');
				}

				/* Carried the paw through a win without burning a wish.
				   wishesLeft starts at 3 on resetHunt(); a value of 3 at
				   hunt-end means no wish fired. isFound() being true
				   confirms the player is actually holding the paw rather
				   than having never picked it up. */
				if (setup.MonkeyPaw.isFound()
					&& setup.MonkeyPaw.wishesLeft() === 3) {
					unlock('win.no_wishes');
				}

				var realName = setup.Ghosts && setup.Ghosts.huntRealName && setup.Ghosts.huntRealName();
				if (realName === 'Mimic') unlock('win.mimic');
				if (realName === 'Mare')  unlock('win.knocks');
				/* Mimic face-off: rotateCount <= 1 means the disguise has
				   not yet swapped past its first rolled value. The first
				   PassageDone during a Mimic hunt always emits one
				   MIMIC_ROTATE (initial seeding from lastChangeIntervalMimic
				   = " "), so 0 is the unreachable case and 1 is "first
				   face, never changed." */
				if (realName === 'Mimic' && huntFlags && huntFlags.mimicRotateCount <= 1) {
					unlock('win.faceoff');
				}
				if (realName)             unlock(bestiaryId(realName));
			} else if (FR) {
				if (ctx.failureReason === FR.SANITY)     unlock('fail.sanity');
				if (ctx.failureReason === FR.EXHAUSTION) unlock('fail.exhaustion');
				if (ctx.failureReason === FR.TIME)       unlock('fail.time');
				if (ctx.failureReason === FR.FLED)       unlock('fail.fled');
				if (ctx.failureReason === FR.ABANDON)    unlock('fail.abandon');
				/* Cold feet: the FLED branch of a contracted hunt --
				   the player signed a contract then walked back out.
				   Distinct from fail.abandon (monkey-paw "leave" wish). */
				if (ctx.failureReason === FR.FLED
					&& huntFlags && huntFlags.hadContractAtStart) {
					unlock('disc.cold_feet');
				}
			}
			huntFlags = null;
		}
		setup.Hunt.on(E.HUNT_END_ASSAULTED, onHuntEnd);
		setup.Hunt.on(E.HUNT_END_GRACEFUL, onHuntEnd);
	}
	$(document).one(':storyready', registerHuntSubscriptions);

	/* StoryEvents-bus wiring -- same :storyready deferral rationale as
	   the Hunt subscriptions above. StoryEvents loads from
	   passages/StoryEvents.js, which alphabetically precedes
	   passages/achievements/, so it's available by module-eval time
	   today -- but registering at :storyready keeps the pattern
	   consistent and survives any future filesystem-order shuffling. */
	function registerStoryEventSubscriptions() {
		if (!setup.StoryEvents || !setup.StoryEvents.Event) {
			console.error('Achievements: setup.StoryEvents missing at :storyready; subscriptions skipped.');
			return;
		}
		setup.StoryEvents.on(setup.StoryEvents.Event.CHEAT_USED, function () {
			/* Mark first so the unlock() gate sees a cheated save -- the
			   'fun.cheat' exception is what lets the joke still grant. */
			markCheated();
			unlock('fun.cheat');
		});

		setup.StoryEvents.on(setup.StoryEvents.Event.CONTRACT_SIGNED, function () {
			unlock('disc.good_girl');
		});

		setup.StoryEvents.on(setup.StoryEvents.Event.MODIFIER_BANNED, function () {
			unlock('disc.naughty_list');
		});

		setup.StoryEvents.on(setup.StoryEvents.Event.REROLL_USED, function () {
			unlock('disc.tempting_fate');
		});

		/* Take Two: pick up a sanity pill and swallow it before midnight
		   rolls the day cursor. Both events carry { day } = dailySeed at
		   the moment of the event; matching days proves "same day." A
		   gained-then-used sequence within one day fires once and the
		   counter resets so a subsequent pill on another day doesn't
		   incorrectly fire from stale state. */
		var lastPillGainedDay = null;
		setup.StoryEvents.on(setup.StoryEvents.Event.SANITY_PILL_GAINED, function (ctx) {
			lastPillGainedDay = ctx && ctx.day;
		});
		setup.StoryEvents.on(setup.StoryEvents.Event.SANITY_PILL_USED, function (ctx) {
			if (ctx && lastPillGainedDay !== null && ctx.day === lastPillGainedDay) {
				unlock('disc.take_two');
			}
		});
	}
	$(document).one(':storyready', registerStoryEventSubscriptions);

	/* `disc.hide_and_seek` unlocks once the player has personally
	   seen both a Hide and a RunFast attempt fail -- the moment they
	   learn that not every ghost yields to the same trick. Outcome
	   flags ride alongside the unlock map; iterators key off catalogue
	   ids so the extra entry stays invisible to locked()/unlocked(). */
	function noteHideOutcome(success) { recordHideRunOutcome('hideFail', success); }
	function noteRunOutcome(success)  { recordHideRunOutcome('runFail',  success); }
	function recordHideRunOutcome(flag, success) {
		if (success) return;
		var bag = store();
		if (!bag._hideRunFlags) bag._hideRunFlags = {};
		bag._hideRunFlags[flag] = true;
		if (bag._hideRunFlags.hideFail && bag._hideRunFlags.runFail) {
			unlock('disc.hide_and_seek');
		}
	}

	setup.Achievements.OWNED_VARS       = OWNED_VARS;
	setup.Achievements.unlock           = unlock;
	setup.Achievements.has              = has;
	setup.Achievements.all              = all;
	setup.Achievements.locked           = locked;
	setup.Achievements.unlocked         = unlocked;
	setup.Achievements.byId             = byId;
	setup.Achievements.hasCheated       = hasCheated;
	setup.Achievements.noteHideOutcome  = noteHideOutcome;
	setup.Achievements.noteRunOutcome   = noteRunOutcome;
})();
