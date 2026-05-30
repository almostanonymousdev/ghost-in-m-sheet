/* Per-hunt-ghost effect helpers — thin wrappers around setup.Hunt.applyFilter
   with the relevant defaults baked in.

   Every method on this api answers "what is the current hunt ghost doing /
   allowing right now?" — so the consumer doesn't have to fetch the active
   Ghost prototype or branch on identity. The filter subscribers that pin
   these values live on the ghost catalogue entries (huntFilters maps) and
   are wired in GhostController.js's :storyready registrar; they gate on
   setup.Ghosts.huntRealName() === g.name so Mimic's disguise never inherits
   its cover identity's behaviour.

   File ordering: this IIFE has no module-load dependency on setup.Hunt
   (everything is read at call-time), so the alphabetical placement
   "ActiveGhostController" < "GhostController" is fine. */
setup.ActiveGhost = (function () {
    'use strict';

    var api = {
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
        }
    };

    return api;
})();
