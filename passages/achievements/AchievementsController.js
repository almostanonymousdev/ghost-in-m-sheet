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

	function sv() { return State.variables; }
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
		// --- Failure suite (Hunt.Event.END + CAUGHT + POSSESS) ---
		{ id: 'fail.sanity',     name: 'Lost the Plot',         hint: 'End a hunt with your mind frayed.',     category: 'failure' },
		{ id: 'fail.exhaustion', name: 'Dead on Your Feet',     hint: 'Collapse mid-hunt.',                    category: 'failure' },
		{ id: 'fail.time',       name: 'Sunrise, Sunrise',      hint: 'Run out the clock.',                    category: 'failure' },
		{ id: 'fail.caught',     name: 'Caught Cold',           hint: 'Get taken by something hungry.',        category: 'failure' },
		{ id: 'fail.possessed',  name: 'Not Yourself',          hint: 'Wear another voice home.',              category: 'failure' },
		{ id: 'fail.fled',       name: 'Better Part of Valor',  hint: 'Leave a house in a hurry.',             category: 'failure' },
		{ id: 'fail.abandon',    name: 'Cold Feet',             hint: 'Walk away from a contract.',            category: 'failure' },

		// --- Wins with a twist (Hunt.Event.END) ---
		{ id: 'win.first',    name: 'First Blood',     hint: 'Banish your first ghost.',                      category: 'win' },
		{ id: 'win.nocaught', name: 'Untouched',       hint: 'Win without ever being grabbed.', hidden: true, category: 'win' },
		{ id: 'win.notools',  name: 'Bare Hands',      hint: 'Win without activating EMF or UVL.', hidden: true, category: 'win' },
		{ id: 'win.mimic',    name: 'Pierce the Veil', hint: 'Banish a Mimic.',                  hidden: true, category: 'win' },

		// --- Discovery (one-shot the first time something rare fires) ---
		{ id: 'disc.trap',      name: 'Pinned',         hint: 'Trap a ghost mid-hunt.',         category: 'discovery' },
		{ id: 'disc.drift',     name: 'It Moved',       hint: 'Watch the favorite room shift.', category: 'discovery' },
		{ id: 'disc.loot.cash', name: 'Sticky Fingers', hint: 'Pocket cash off a haunted shelf.', category: 'discovery' },
		{ id: 'disc.loot.ecto', name: 'Green Thumb',    hint: 'Bottle ectoplasm.',              category: 'discovery' },

		// repeatable:true entries re-fire UNLOCKED every time unlock()
		// is called, regardless of stored state -- the player-button
		// gag in the bedroom is the canonical example.
		{ id: 'fun.sploosh', name: 'sploosh', hint: '???', hidden: true, repeatable: true, category: 'fun',
		  icon: 'ui/achievements/sploosh.png' },
		{ id: 'fun.cheat',   name: 'all achievements disabled.   ...wait', hint: '???', hidden: true, category: 'fun' }
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
		huntFlags = { caughtThisRun: false, toolsUsedThisRun: false };
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
		setup.Hunt.on(E.TRAP,    function () { unlock('disc.trap'); });
		setup.Hunt.on(E.DRIFT,   function () { unlock('disc.drift'); });

		setup.Hunt.on(E.LOOT_TAKEN, function (ctx) {
			if (!ctx) return;
			if (ctx.kind === 'cash')      unlock('disc.loot.cash');
			if (ctx.kind === 'ectoplasm') unlock('disc.loot.ecto');
		});

		/* No "tool activated" event exists; sample tool state every TICK.
		   TICK fires on every nav step / tool tick during a hunt, so this
		   catches activation within a tick of it happening. */
		setup.Hunt.on(E.TICK, function () {
			if (!huntFlags) return;
			var t = sv().tools;
			if (t && ((t.emf && t.emf.activated) || (t.uvl && t.uvl.activated))) {
				huntFlags.toolsUsedThisRun = true;
			}
		});

		setup.Hunt.on(E.END, function (ctx) {
			var FR = setup.HuntController && setup.HuntController.FailureReason;
			if (!ctx) { huntFlags = null; return; }
			if (ctx.success) {
				unlock('win.first');
				if (huntFlags && !huntFlags.caughtThisRun)    unlock('win.nocaught');
				if (huntFlags && !huntFlags.toolsUsedThisRun) unlock('win.notools');

				var hunt = (setup.Ghosts && setup.Ghosts.hunt && setup.Ghosts.hunt()) || null;
				var realName = hunt && hunt.realName;
				if (realName === 'Mimic') unlock('win.mimic');
				if (realName)             unlock(bestiaryId(realName));
			} else if (FR) {
				if (ctx.failureReason === FR.SANITY)     unlock('fail.sanity');
				if (ctx.failureReason === FR.EXHAUSTION) unlock('fail.exhaustion');
				if (ctx.failureReason === FR.TIME)       unlock('fail.time');
				if (ctx.failureReason === FR.FLED)       unlock('fail.fled');
				if (ctx.failureReason === FR.ABANDON)    unlock('fail.abandon');
				// CAUGHT / POSSESSED already unlocked via their dedicated events.
			}
			huntFlags = null;
		});
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
	}
	$(document).one(':storyready', registerStoryEventSubscriptions);

	setup.Achievements.OWNED_VARS  = OWNED_VARS;
	setup.Achievements.unlock     = unlock;
	setup.Achievements.has        = has;
	setup.Achievements.all        = all;
	setup.Achievements.locked     = locked;
	setup.Achievements.unlocked   = unlocked;
	setup.Achievements.byId       = byId;
	setup.Achievements.hasCheated = hasCheated;
})();
