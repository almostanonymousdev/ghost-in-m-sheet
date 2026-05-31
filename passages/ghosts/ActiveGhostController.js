/* Per-hunt-ghost effect helpers — thin wrappers around setup.Hunt.applyFilter
   (and the active ghost catalogue entry) with the relevant defaults baked in.

   Every method on this api answers "what is the current hunt ghost doing /
   allowing right now?" — so the consumer doesn't have to fetch the active
   Ghost prototype or branch on identity. Two categories of method live here:
     * Filter-driven effects (canTurnOffLights, hideResolution, spiritboxResponse,
       sensorGlitchChance, sanityEventLossRange, …). The subscribers that
       pin these values live on the ghost catalogue entries (huntFilters
       maps) and are wired in GhostController.js's :storyready registrar;
       they gate on setup.Ghosts.huntRealName() === g.name so Mimic's
       disguise never inherits its cover identity's behaviour.
     * Active-ghost projections (hasEvidence, name, evidenceLabels,
       walkHomePassage, goHomePassage, sleepPassage, companionHuntPassage,
       canProwl, roll*). Thin wrappers over setup.HuntController.activeGhost()
       that return a safe default (null / '' / false / 0) when no hunt is
       running. Lets passages and controllers stop juggling a local
       Ghost-or-null variable just to read one field.

   File ordering: this IIFE has no module-load dependency on setup.Hunt
   (everything is read at call-time), so the alphabetical placement
   "ActiveGhostController" < "GhostController" is fine. */
setup.ActiveGhost = (function () {
    'use strict';

    function active() { return setup.HuntController.activeGhost(); }

    /* Sensor-glitch roll — denominator comes from the SENSOR_GLITCH_CHANCE
       filter (Raiju sets emf=3 / temperature=8; everything else is 0).
       On a hit, fires a SENSOR_GLITCH notification so subscribers (UI juice,
       lint hooks) can react. */
    function rollSensorGlitch(tool) {
        var denom = api.sensorGlitchChance(tool);
        var hit = denom > 0 && Math.floor(Math.random() * denom) === 0;
        if (hit) {
            setup.Hunt.emit(setup.Hunt.Event.SENSOR_GLITCH, { tool: tool });
        }
        return hit;
    }

    var api = {
        // --- Filter-driven effects ----------------------------------
        canTurnOffLights: function () {
            return setup.Hunt.applyFilter(setup.Hunt.Event.LIGHTS_OFF_ALLOWED,
                { allowed: true }).allowed;
        },
        staysInOneRoom: function () {
            return !setup.Hunt.applyFilter(setup.Hunt.Event.GHOST_DRIFT_ALLOWED,
                { allowed: true }).allowed;
        },
        hasInvertedSanityStages: function () {
            return !!setup.Hunt.applyFilter(setup.Hunt.Event.SANITY_STAGES_INVERTED,
                { inverted: false }).inverted;
        },
        /* Hide.tw / RunFast.tw resolution. Default is a rolled bool at the
           passage's historical odds (Hide ≈ 35% success, RunFast ≈ 70%
           success); Deogen / Jinn pin the outcome by overriding ctx.outcome
           in their HIDE_RESOLUTION / RUN_RESOLUTION filters. Always returns
           a bool — callers branch on it directly. */
        hideResolution: function () {
            return setup.Hunt.applyFilter(setup.Hunt.Event.HIDE_RESOLUTION,
                { outcome: Math.random() < 0.35 }).outcome;
        },
        runResolution: function () {
            return setup.Hunt.applyFilter(setup.Hunt.Event.RUN_RESOLUTION,
                { outcome: Math.random() >= 0.30 }).outcome;
        },
        canUseTentacles: function () {
            return !!setup.Hunt.applyFilter(setup.Hunt.Event.GHOST_ABILITY,
                { tentacles: false, kiss: false }).tentacles;
        },
        canUseKiss: function () {
            return !!setup.Hunt.applyFilter(setup.Hunt.Event.GHOST_ABILITY,
                { tentacles: false, kiss: false }).kiss;
        },
        cursedActivityVideos: function () {
            return setup.Hunt.applyFilter(setup.Hunt.Event.CURSED_ACTIVITY_VIDEOS,
                { videos: [] }).videos;
        },
        spiritboxResponse: function () {
            return setup.Hunt.applyFilter(setup.Hunt.Event.SPIRITBOX_RESPONSE,
                { possessionChance: 0, staticChance: 0 });
        },
        spiritboxPossessionChance: function () {
            return setup.ActiveGhost.spiritboxResponse().possessionChance;
        },
        spiritboxStaticChance: function () {
            return setup.ActiveGhost.spiritboxResponse().staticChance;
        },
        sensorGlitchChance: function (tool) {
            return setup.Hunt.applyFilter(setup.Hunt.Event.SENSOR_GLITCH_CHANCE,
                { tool: tool, denom: 0 }).denom;
        },
        sanityEventLossRange: function () {
            return setup.Hunt.applyFilter(setup.Hunt.Event.SANITY_EVENT_LOSS_RANGE,
                { range: [1, 5] }).range;
        },

        // --- Active-ghost projections -------------------------------
        /* True when a hunt is running AND the active ghost exposes the
           given evidence type (id string or Evidence object). Bakes in
           the Mimic ectoplasm rule via Ghost.hasEvidence. */
        hasEvidence: function (id) {
            var g = active();
            return !!(g && g.hasEvidence(id));
        },
        /* True identity of the active hunt ghost (Mimic stays "Mimic"
           here even though $run.disguiseName rotates for display). */
        name: function () {
            var g = active();
            return g ? g.name : null;
        },
        evidenceLabels: function () {
            var g = active();
            return g ? g.evidenceLabels() : '';
        },
        /* The true ghost's full catalogue evidence labels (all three),
           independent of per-run pruning. active()/$run.evidence is the
           *gameplay* evidence set -- Fog of War splices one out and the
           DeleteEvidence wish prunes more -- so evidenceLabels() above
           can report fewer than three. Wrong-guess reveals that name the
           ghost's defining signature ("every sign you should have
           recognized") want the canonical triad, not whatever survived
           this hunt, so they read through here instead. */
        trueEvidenceLabels: function () {
            var name = setup.Ghosts.huntRealName();
            if (!name) return '';
            var g = setup.Ghosts.getByName(name);
            return g ? g.evidenceLabels() : '';
        },
        /* Per-ghost passage routes. Each returns null when no hunt is
           running or when the catalogue entry doesn't set the field. */
        walkHomePassage: function () {
            var g = active();
            return (g && g.walkHomePassage) || null;
        },
        goHomePassage: function () {
            var g = active();
            return (g && g.goHomePassage) || null;
        },
        sleepPassage: function () {
            var g = active();
            return (g && g.sleepPassage) || null;
        },
        companionHuntPassage: function () {
            var g = active();
            return (g && g.companionHuntPassage) || null;
        },
        /* HuntProwl's prowl-trigger gate. Reads through Ghost.canProwl
           so per-ghost prowlCondition fns stay catalogue-owned. */
        canProwl: function (mc) {
            var g = active();
            return !!(g && g.canProwl(mc));
        },
        /* Per-tick rolls. The Ghost.prototype roll* methods delegate here
           so the tests that probe a Ghost instance directly still work. */
        rollEventSanityLoss: function () {
            var r = api.sanityEventLossRange();
            return r[0] + Math.floor(Math.random() * (r[1] - r[0] + 1));
        },
        rollEmfGlitch: function () { return rollSensorGlitch('emf'); },
        rollTemperatureGlitch: function () { return rollSensorGlitch('temperature'); }
    };

    return api;
})();
