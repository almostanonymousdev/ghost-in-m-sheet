/*
 * Hunt lifecycle event bus.
 *
 * Two channels:
 *   - Notifications  on(event, fn) / emit(event, ctx)
 *                    Fire-and-forget side effects (UI juice, logging,
 *                    companion reactions). Subscribers run in registration
 *                    order; a thrown subscriber is logged and skipped.
 *   - Filters        filter(event, fn) / applyFilter(event, ctx) → ctx
 *                    Subscribers mutate the passed ctx in place. Emitter
 *                    consumes the final ctx. Lets modifiers / contracts /
 *                    static-house quirks own their transformations
 *                    (room counts, evidence pool, payout multiplier, ...)
 *                    instead of HuntController branching on each one.
 *
 * Event names live in setup.Hunt.Event so typos surface as undefined
 * lookups rather than silently-dropped emits.
 *
 * Subscriptions live in module-local memory (not $State) -- they're
 * behavioral, re-registered when scripts re-eval on save/load.
 */
setup.Hunt = (function () {
	var Event = Object.freeze({
		START: 'start',
		TICK: 'tick',
		DRIFT: 'drift',
		CAUGHT: 'caught',
		POSSESS: 'possess',
		TRAP: 'trap',
		EVIDENCE_TRIGGER: 'evidence-trigger',
		LOOT_TAKEN: 'loot-taken',
		ROOM_ENTER: 'room-enter',
		FLOORPLAN_OPTIONS: 'floorplan-options',
		EVIDENCE_POOL: 'evidence-pool',
		STARTING_TOOLS: 'starting-tools',
		PAYOUT: 'payout',
		STEAL_CHECK: 'steal-check',
		PROWL_CHECK: 'prowl-check',
		OBJECTIVE: 'objective',
		COMPANION_ALLOWED: 'companion-allowed',
		SNAPSHOT: 'snapshot',
		MODIFIER_COUNT: 'modifier-count',
		SIDEBAR_OUTFIT: 'sidebar-outfit',
		AFTERSHOCK_COOLDOWN: 'aftershock-cooldown',
		BAIT_ALLOWED: 'bait-allowed',
		SANITY_EVENT_MULT: 'sanity-event-mult',
		ADDRESS: 'address',
		/* Player picked a haunted house off GhostStreet. Fires once per
		   hunt, before any in-house ticks. Per-ghost setup that needs to
		   run on house entry (Mimic disguise clock, Mare event-stage
		   progression) subscribes here. */
		HOUSE_ENTER: 'house-enter',
		/* Hunt ended with the MC overpowered -- failureReason in
		   {POSSESSED, CAUGHT, SANITY}. Dedicated CAUGHT / POSSESS
		   events still fire alongside this for the catch/possession
		   beats; ASSAULTED is the lifecycle-end notification for
		   non-graceful exits. Paired with HUNT_END_GRACEFUL: every
		   hunt-end emits exactly one of the two. */
		HUNT_END_ASSAULTED: 'hunt-end-assaulted',
		/* Hunt ended peacefully -- win, flee, wrong-call at the witch's
		   desk, exhaustion, time-out, manual leave, monkey-paw abandon.
		   Paired with HUNT_END_ASSAULTED: every hunt-end emits exactly
		   one of the two. Per-ghost cleanup that should only run on a
		   peaceful exit (e.g. Spirit's clearSpiritEventStage) subscribes
		   here. */
		HUNT_END_GRACEFUL: 'hunt-end-graceful',
		/* A prowl event resolved against the player (NudityEvent, prayer
		   miss, freeze, on-tick prowl, hunt-over passages). Ghosts that
		   stamp a per-prowl flag (e.g. Twins) subscribe here. */
		PROWL_EVENT: 'prowl-event',
		/* Raiju-style sensor glitch rolled true on this tick.
		   ctx: { tool: 'emf' | 'temperature' }. */
		SENSOR_GLITCH: 'sensor-glitch',
		/* Mimic disguise actually swapped (rollMimicType fired and
		   changed disguiseName). ctx: { disguiseName }. */
		MIMIC_ROTATE: 'mimic-rotate',
		/* renderSpiritbox was invoked this tick (player pressed the
		   spiritbox tool in a haunted house). ctx: {}. */
		SPIRITBOX_USED: 'spiritbox-used',
		/* Player pressed a tool slot and took a reading (renderEmf /
		   renderUvl, and any other RENDERERS entry). ctx: { tool }. This
		   is the deliberate player act, distinct from a window merely being
		   open -- a prowl force-activates EMF+UVL for trail/residue without
		   the player touching anything, so win.notools ("Bare Hands") keys
		   off this event, never off isActivated() window state. */
		TOOL_USED: 'tool-used',
		/* Outfit-video resolution for a body-part event. Producers
		   (EventsController.bottomClothingVideos /
		   topClothingVideos) emit before computing the default
		   clothing-aware list; a modifier (e.g. prison_visuals) can
		   set ctx.clothingOverride to a flat clothing key
		   (ClothingKey.PRISON) so the producer returns that key's
		   videos instead. ctx: { eventKey, clothingOverride }. */
		OUTFIT_VIDEOS: 'outfit-videos',
		/* Banshee-ability video pool resolver. Default returns
		   BansheeVideos.house; modifiers can overwrite ctx.videos
		   with a flat list (e.g. prison-themed). ctx: { videos }. */
		BANSHEE_VIDEOS: 'banshee-videos',
		/* UVL sprite pack for the in-house tool render. Default
		   randomly rolls upper/lower wardrobe packs; modifiers can
		   pin ctx.pack to a fixed sprite set (e.g. prison warden
		   packs). ctx: { pack }. */
		UVL_SPRITE_PACK: 'uvl-sprite-pack',
		/* Hunt room background URL. Modifiers can pin ctx.url to a
		   per-template background override (e.g. prison
		   hallway/kitchen). ctx: { templateId, dark, url }. */
		ROOM_BACKGROUND: 'room-background',
		/* Per-event base sanity drain (EventMC roll). Oni broadens.
		   ctx: { range: [lo, hi] }. */
		SANITY_EVENT_LOSS_RANGE: 'sanity-event-loss-range',
		/* SaveEventPassage decreasing-sanity stage table. Shade flips
		   the curve so high sanity rolls more events.
		   ctx: { inverted: false }. */
		SANITY_STAGES_INVERTED: 'sanity-stages-inverted',
		/* Hide.tw resolution. Deogen always finds you, Jinn never does.
		   ctx: { outcome: null|true|false } (null = roll, true = success,
		   false = guaranteed catch). */
		HIDE_RESOLUTION: 'hide-resolution',
		/* RunFast.tw resolution. Deogen can be outrun, Jinn can't.
		   ctx: { outcome: null|true|false }. */
		RUN_RESOLUTION: 'run-resolution',
		/* EventsController.maybeTurnOffLights gate. Phantom can't flick
		   the lights. ctx: { allowed: true }. */
		LIGHTS_OFF_ALLOWED: 'lights-off-allowed',
		/* HuntDrift.shuffleGhostRoom gate. Goryo stays put.
		   ctx: { allowed: true }. */
		GHOST_DRIFT_ALLOWED: 'ghost-drift-allowed',
		/* Per-ghost ability flags consumed by EventsController.rollSaveEvent
		   / rollRandomEvent and the HuntOver / companion-help passages.
		   Cthulion sets tentacles=true, Banshee sets kiss=true.
		   ctx: { tentacles: false, kiss: false }. */
		GHOST_ABILITY: 'ghost-ability',
		/* Sensor-glitch denominator. Raiju sets a non-zero denom on a
		   per-tool query. Consumer rolls (1/denom) and emits SENSOR_GLITCH
		   on hit. ctx: { tool: 'emf'|'temperature', denom: 0 }. */
		SENSOR_GLITCH_CHANCE: 'sensor-glitch-chance',
		/* Spiritbox response chances (0-100). Moroi sets possessionChance,
		   Raiju sets staticChance. Consumer rolls a single d100 and tests
		   each in turn. ctx: { possessionChance: 0, staticChance: 0 }. */
		SPIRITBOX_RESPONSE: 'spiritbox-response',
		/* Cthulion/Banshee contribute their extra clip pool to the Monkey
		   Paw cursed-activity wish. ctx: { videos: [] }. */
		CURSED_ACTIVITY_VIDEOS: 'cursed-activity-videos'
	});

	var listeners = {};
	var filters = {};

	function subscribe(table, event, fn) {
		if (typeof fn !== 'function') return function () { };
		if (!table[event]) table[event] = [];
		var bucket = table[event];
		bucket.push(fn);
		return function unsubscribe() {
			var i = bucket.indexOf(fn);
			if (i !== -1) bucket.splice(i, 1);
		};
	}

	function on(event, fn) {
		return subscribe(listeners, event, fn);
	}

	function emit(event, ctx) {
		var bucket = listeners[event];
		if (!bucket) return;
		for (var i = 0; i < bucket.length; i++) {
			try { bucket[i](ctx); }
			catch (e) { console.error('Hunt.on(' + event + ') subscriber threw:', e); }
		}
	}

	function filter(event, fn) {
		return subscribe(filters, event, fn);
	}

	function applyFilter(event, ctx) {
		var bucket = filters[event];
		if (!bucket) return ctx;
		for (var i = 0; i < bucket.length; i++) {
			try { bucket[i](ctx); }
			catch (e) { console.error('Hunt.filter(' + event + ') subscriber threw:', e); }
		}
		return ctx;
	}

	return {
		Event: Event,
		on: on,
		emit: emit,
		filter: filter,
		applyFilter: applyFilter
	};
})();
