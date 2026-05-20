(function () {
    'use strict';

    /* Unified evidence metadata. Each entry bundles the canonical id (used
       in save state as strings) with display metadata. Exposed as
       setup.Ghosts.Evidence. */
    var Evidence = Object.freeze({
        EMF:         Object.freeze({ id: "emf",         label: "EMF5",             cssClass: "emf" }),
        SPIRITBOX:   Object.freeze({ id: "spiritbox",   label: "SpiritBox",        cssClass: "spiritbox" }),
        GWB:         Object.freeze({ id: "gwb",         label: "GhostWritingBook", cssClass: "gwb" }),
        GLASS:       Object.freeze({ id: "glass",       label: "Ectoplasm",        cssClass: "glass" }),
        TEMPERATURE: Object.freeze({ id: "temperature", label: "HighTemperature",  cssClass: "temperature" }),
        UVL:         Object.freeze({ id: "uvl",         label: "UVLight",          cssClass: "uvl" })
    });
    var E = Evidence;

    /* String-id → Evidence object lookup, for converting save-state evidence
       arrays (which store ids for serialisation safety) back into objects. */
    var EvidenceById = {};
    Object.keys(Evidence).forEach(function (k) { EvidenceById[Evidence[k].id] = Evidence[k]; });

    /* Canonical ghost catalogue. Static fields live here; `isInfoCollected`
       is a live accessor backed by the $ghostInfoCollected map (keyed by
       ghost name). Per-ghost data that never changes (descriptions, hints)
       sits in code instead of $state so it's not serialised into every
       save file. */
    var GHOST_CONFIG = [
        {
            name: "Shade", image: "shade.webp",
            evidence: [E.EMF, E.GWB, E.TEMPERATURE],
            hint: "The lower your sanity, the less likely the Shade is to show interest in you.",
            description: "Shade -- one of the oldest types of ghosts. The main feature of the Shade is that the lower your sanity, the less likely the Shade is to show interest in you.",
            prowlCondition:     function (mc) { return mc.sanity <= 55; },
            prowlConditionText: "Can start a prowl if you have <= 55 sanity",
            invertedSanityStages: true
        },
        {
            name: "Spirit", image: "spirit.webp",
            evidence: [E.EMF, E.SPIRITBOX, E.GWB],
            hint: "If it doesn't achieve its goal, it will relentlessly follow its victim.",
            description: "Spirit is a rather shy ghost. Unlike others, if it doesn't achieve its goal, it will relentlessly follow its victim. However, once it gets what it wants, it will vanish and cease to disturb, leaving its target in peace.",
            prowlCondition:     function (mc) { return mc.lust >= 30; },
            prowlConditionText: "Can start a prowl if you have >= 30 lust",
            walkHomePassage:   "GhostSpecialEventSpirit"
        },
        {
            name: "Poltergeist", image: "poltergeist.webp",
            evidence: [E.SPIRITBOX, E.GWB, E.UVL],
            hint: "",
            description: "",
            prowlCondition:     function (mc) { return mc.sanity <= 70; },
            prowlConditionText: "Can start a prowl if you have <= 70 sanity"
        },
        {
            name: "Phantom", image: "phantom.webp",
            evidence: [E.GLASS, E.UVL, E.SPIRITBOX],
            hint: "This type of ghost cannot turn off the lights.",
            description: "This type of ghost cannot turn off the lights.",
            prowlCondition:     function (mc) { return mc.sanity <= 70; },
            prowlConditionText: "Can start a prowl if you have <= 70 sanity",
            canTurnOffLights:  false
        },
        {
            name: "Goryo", image: "goryo.webp",
            evidence: [E.GLASS, E.UVL, E.EMF],
            hint: "Goryo is known for its attachment to a single room and cannot change it like other ghosts do.",
            description: "Goryo is known for its attachment to a single room and cannot change it like other ghosts do. If you notice that the ghost's activity is focused exclusively in one area, you are likely dealing with a Goryo.",
            prowlCondition:     function (mc) { return mc.lust >= 30; },
            prowlConditionText: "Can start a prowl if you have >= 30 lust",
            staysInOneRoom:    true
        },
        {
            name: "Demon", image: "demon.webp",
            evidence: [E.GWB, E.UVL, E.TEMPERATURE],
            hint: "Demon can start a hunt earlier than other ghosts",
            description: "Some sources report that the Demon is a unique ghost that can begin hunting you regardless of your current sanity or lust. Unlike other ghosts that only become active when your mental state declines or your desire increases, the Demon does not so strongly consider your present condition and can initiate its pursuit at nearly any time.",
            findableOnline: true,
            prowlCondition:     function (mc) { return mc.sanity <= 90; },
            prowlConditionText: "Can start a prowl if you have <= 90 sanity"
        },
        {
            name: "Deogen", image: "deogen.webp",
            evidence: [E.GLASS, E.GWB, E.SPIRITBOX],
            hint: "When it starts its hunt, hiding won't help, as the Deogen relentlessly searches for you",
            description: "The Deogen is described as a particularly frightening ghost that will always find you, even if you try to hide. Once it starts its hunt, hiding won't help, as the Deogen relentlessly searches for its prey. However, since the Deogen is extremely slow, there's a chance to escape if you still have the strength to run.",
            findableOnline: true,
            prowlCondition:     function (mc) { return mc.sanity <= 70; },
            prowlConditionText: "Can start a prowl if you have <= 70 sanity",
            hidingSucceeds:    false,   // Deogen always finds you
            runningSucceeds:   true     // …but you can outrun it
        },
        {
            name: "Jinn", image: "jinn.webp",
            evidence: [E.EMF, E.UVL, E.TEMPERATURE],
            hint: "You can't escape from the Jinn by running, as it is incredibly fast.",
            description: "Some ghost hunters have reported that when encountering a Jinn, they tried to run but always failed because the ghost is too fast. However, when they found a hiding spot--even if it was right in front of the Jinn--he often passed by without noticing them. This indicates that hiding from a Jinn is much easier than trying to escape.",
            findableOnline: true,
            prowlCondition:     function (mc) { return mc.sanity <= 70; },
            prowlConditionText: "Can start a prowl if you have <= 70 sanity",
            hidingSucceeds:    true,    // Jinn can be hidden from
            runningSucceeds:   false    // …but never outrun
        },
        {
            name: "Moroi", image: "moroi.webp",
            evidence: [E.GWB, E.TEMPERATURE, E.SPIRITBOX],
            hint: "",
            description: "The Moroi can invade the minds of weak-willed victims when using the Spirit Box. Be cautious when communicating, as this ghost may possess you.",
            prowlCondition:           function (mc) { return mc.sanity <= 70; },
            prowlConditionText:       "Can start a prowl if you have <= 70 sanity",
            spiritboxPossessionChance: 30
        },
        {
            name: "Myling", image: "myling.webp",
            evidence: [E.GWB, E.EMF, E.UVL],
            hint: "Once you leave its presence, strange things begin to happen: those around you start seeing you in unusual clothing or even completely naked.",
            description: "Myling is a ghost that doesn't reveal itself directly upon encounter. However, once you leave its presence, strange things begin to happen: those around you start seeing you in unusual clothing or even completely naked.",
            prowlCondition:     function (mc) { return mc.lust >= 30; },
            prowlConditionText: "Can start a prowl if you have >= 30 lust",
            goHomePassage:        "GhostSpecialEventMyling",
            companionHuntPassage: "GhostSpecialEventMylingTwo"
        },
        {
            name: "Oni", image: "oni.webp",
            evidence: [E.GLASS, E.EMF, E.TEMPERATURE],
            hint: "Encountering this ghost causes sanity to drop faster than with other ghosts.",
            description: "The mythical entity Oni brings not only fear but also rapid psychological devastation. Those who have encountered it report that @@.notmc-speech;Oni causes a sharp and intense decline in sanity@@, significantly accelerating this process compared to other ghosts. If you come face-to-face with Oni, be prepared for a swift and severe assault on your mental health.",
            findableOnline: true,
            prowlCondition:     function (mc) { return mc.lust >= 30; },
            prowlConditionText: "Can start a prowl if you have >= 30 lust",
            sanityEventLossRange: [3, 8]
        },
        {
            name: "Mimic", image: "mimic.webp",
            evidence: [E.UVL, E.TEMPERATURE, E.SPIRITBOX],
            hint: "Mimic always has an extra evidence -- ectoplasm",
            description: "Mimic is a ghost that can mimic nearly all the abilities of other ghosts, making it extremely unpredictable and difficult to identify. Additionally, The Mimic always has an extra evidence -- ectoplasm. Although ectoplasm is not considered evidence for identifying the ghost, its presence can aid in its identification.",
            prowlCondition:     function (mc) { return mc.sanity <= 70; },
            prowlConditionText: "Can start a prowl if you have <= 70 sanity"
        },
        {
            name: "The Twins", image: "the-twins.webp",
            evidence: [E.EMF, E.TEMPERATURE, E.SPIRITBOX],
            hint: "",
            description: "",
            prowlCondition:     function (mc) { return mc.lust >= 30; },
            prowlConditionText: "Can start a prowl if you have >= 30 lust"
        },
        {
            name: "Wraith", image: "wraith.webp",
            evidence: [E.GLASS, E.EMF, E.SPIRITBOX],
            hint: "If caught or if sanity runs out during the ghost hunt, you'll wake up somewhere other than home.",
            description: "This is quite a dangerous ghost. If it catches me or I lose sanity during the ghost hunt... Ending up in the forest with my hands tied is not something I want, so I need to be very careful. But even if things don't go as planned, it's better to conserve my energy to have a chance to escape.",
            prowlCondition:     function (mc) { return mc.lust >= 30; },
            prowlConditionText: "Can start a prowl if you have >= 30 lust",
            sleepPassage:      "GhostSpecialEventWraith"
        },
        {
            name: "Mare", image: "mare.webp",
            evidence: [E.GLASS, E.GWB, E.TEMPERATURE],
            hint: "Mare visits your house while you sleep",
            description: "Mare visits my house while I sleep. It's quite easy to get rid of; I just need to sprinkle holy water in the room where I sleep. It becomes more aggressive each day, so it's best not to delay. Although, someone online mentioned that it might stop haunting after a few days.",
            prowlCondition:     function (mc) { return mc.lust >= 30; },
            prowlConditionText: "Can start a prowl if you have >= 30 lust"
        },
        {
            name: "Cthulion", image: "cthulion.webp",
            evidence: [E.SPIRITBOX, E.GLASS, E.TEMPERATURE],
            hint: "Cthulion rarely reveals its true form, preferring to take on a human appearance. But when it needs to interact with its victims, it's not above using its tentacles.",
            description: "Cthulion is one of the oldest beings, with a history stretching far back before the dawn of humanity. Its true form is so alien to the human mind that most who encounter it can only describe it as \"unspeakable.\" However, Cthulion rarely reveals its true form, preferring to take on a human appearance. But when it needs to interact with its victims, it's not above using its tentacles.",
            prowlCondition:     function (mc) { return mc.sanity <= 70; },
            prowlConditionText: "Can start a prowl if you have <= 70 sanity",
            canTentacles: true,
            cursedActivityVideos: [
                "characters/ghosts/cthulion/1.0.mp4", "characters/ghosts/cthulion/1.1.mp4",
                "characters/ghosts/cthulion/1.2.mp4", "characters/ghosts/cthulion/1.3.mp4",
                "characters/ghosts/cthulion/1.4.mp4", "characters/ghosts/cthulion/1.5.mp4",
                "characters/ghosts/cthulion/1.6.mp4", "characters/ghosts/cthulion/2.0.mp4",
                "characters/ghosts/cthulion/2.1.mp4", "characters/ghosts/cthulion/2.2.mp4",
                "characters/ghosts/cthulion/2.3.mp4", "characters/ghosts/cthulion/2.4.mp4"
            ]
        },
        {
            name: "Banshee", image: "banshee.webp",
            evidence: [E.GLASS, E.GWB, E.UVL],
            hint: "The Banshee has a unique ability called the 'Kiss of the Banshee,' which reduces sanity by 10 points.",
            description: "The Banshee has a unique ability called the \"Kiss of the Banshee,\" which reduces sanity by 10 points.",
            prowlCondition:     function (mc) { return mc.lust >= 30; },
            prowlConditionText: "Can start a prowl if you have >= 30 lust",
            canKiss: true,
            cursedActivityVideos: [
                "characters/ghosts/banshee/1.mp4", "characters/ghosts/banshee/2.mp4",
                "characters/ghosts/banshee/3.mp4", "characters/ghosts/banshee/4.mp4",
                "characters/ghosts/banshee/5.mp4", "characters/ghosts/banshee/6.mp4",
                "characters/ghosts/banshee/7.mp4", "characters/ghosts/banshee/8.mp4",
                "characters/ghosts/banshee/9.mp4", "characters/ghosts/banshee/10.mp4"
            ]
        },
        {
            name: "Raiju", image: "raiju.webp",
            evidence: [E.EMF, E.SPIRITBOX, E.UVL],
            hint: "Raiju is a mysterious entity that occasionally exerts influence over electrical devices, causing them to display incorrect readings. This spectral presence can manipulate the behavior of electronics, leading to unpredictable and sometimes inexplicable malfunctions.",
            description: "Raiju is a mysterious entity that occasionally exerts influence over electrical devices, causing them to display incorrect readings. This spectral presence can manipulate the behavior of electronics, leading to unpredictable and sometimes inexplicable malfunctions.",
            prowlCondition:           function (mc) { return mc.sanity <= 70; },
            prowlConditionText:       "Can start a prowl if you have <= 70 sanity",
            emfGlitchChance:         3,
            temperatureGlitchChance: 8,
            spiritboxStaticChance:   20
        }
    ];

    /* Ghost is a prototype-based class so per-ghost behaviour (canProwl,
       evidenceLabels, hoverHtml, matchesEvidence, …) lives on instances
       rather than as setup.Ghosts.xyz(ghost, …) free functions. The
       $ghostInfoCollected map is exposed as the `isInfoCollected`
       accessor so callers never touch the raw map directly. */
    function Ghost(cfg) {
        this.name              = cfg.name;
        this.image             = cfg.image;
        this.evidence          = cfg.evidence.slice();
        this.hint              = cfg.hint;
        this.description       = cfg.description;
        this.findableOnline    = !!cfg.findableOnline;
        this.prowlCondition     = cfg.prowlCondition;
        this.prowlConditionText = cfg.prowlConditionText || "";

        /* Per-ghost behaviour fields. Consumers check these instead of
           branching on this.name; see passages/gui/Notebook, Hide, RunFast,
           LightPassageGhost, ChangeGhostRoom, EventMC, WalkHomeTogether,
           Sleep, companion Main files, and the HuntOver* flow for examples. */
        this.canTurnOffLights     = cfg.canTurnOffLights !== false;     // default true
        this.staysInOneRoom       = !!cfg.staysInOneRoom;
        /* null = roll normally; true = always succeeds; false = never. */
        this.hidingSucceeds       = (cfg.hidingSucceeds  !== undefined) ? cfg.hidingSucceeds  : null;
        this.runningSucceeds      = (cfg.runningSucceeds !== undefined) ? cfg.runningSucceeds : null;
        this.invertedSanityStages = !!cfg.invertedSanityStages;
        this.walkHomePassage      = cfg.walkHomePassage      || null;   // Spirit: "GhostSpecialEventSpirit"
        this.sleepPassage         = cfg.sleepPassage         || null;   // Wraith: "GhostSpecialEventWraith"
        this.goHomePassage        = cfg.goHomePassage        || null;   // Myling: "GhostSpecialEventMyling"
        this.companionHuntPassage = cfg.companionHuntPassage || null;   // Myling: "GhostSpecialEventMylingTwo"
        this.sanityEventLossRange = cfg.sanityEventLossRange || [1, 5]; // Oni:    [3, 8]

        /* Sensor-glitch chance denominators (1/N per tool reading). */
        this.emfGlitchChance         = cfg.emfGlitchChance         || 0; // Raiju: 3
        this.temperatureGlitchChance = cfg.temperatureGlitchChance || 0; // Raiju: 8

        /* Spiritbox special-response percentages (0-100, rolled once). */
        this.spiritboxPossessionChance = cfg.spiritboxPossessionChance || 0; // Moroi: 30
        this.spiritboxStaticChance     = cfg.spiritboxStaticChance     || 0; // Raiju: 20

        /* Ability flags — check these instead of comparing names. */
        this.canTentacles = !!cfg.canTentacles;  // Cthulion
        this.canKiss      = !!cfg.canKiss;       // Banshee

        /* Extra video clips this ghost contributes to the cursed-activity
           video pool (widgetText). */
        this.cursedActivityVideos = cfg.cursedActivityVideos || null;
    }

    /* All "have I read about this ghost in Ghostopedia yet?" flags share
       a single map at $ghostInfoCollected (replaces 18 individual
       $ghost<Name>InfoCollected vars). The accessor below preserves
       the per-instance read/write API; SaveMigration folds legacy keys
       into the map so existing saves keep their unlocks. */
    function ghostInfoMap() {
        var s = State.variables;
        if (!s.ghostInfoCollected || typeof s.ghostInfoCollected !== "object") {
            s.ghostInfoCollected = {};
        }
        return s.ghostInfoCollected;
    }

    Object.defineProperty(Ghost.prototype, "isInfoCollected", {
        configurable: true,
        enumerable: true,
        get: function () { return !!ghostInfoMap()[this.name]; },
        set: function (v) {
            if (v) { ghostInfoMap()[this.name] = 1; }
            else   { delete ghostInfoMap()[this.name]; }
        }
    });

    Ghost.prototype.canProwl = function (mc) {
        return typeof this.prowlCondition === "function" ? !!this.prowlCondition(mc) : false;
    };

    Ghost.prototype.evidenceClasses = function () {
        return this.evidence.map(function (e) { return e.cssClass; }).join(" ");
    };

    Ghost.prototype.evidenceLabels = function () {
        return this.evidence.map(function (e) { return e.label; }).join(", ");
    };

    /* True when this ghost exposes the given evidence type. Accepts a
       canonical id string ("glass", "emf", …) or an Evidence object.
       Bakes in the Mimic rule: during a Mimic hunt, ectoplasm always
       reads positive — reflecting the "Mimic always has an extra
       evidence -- ectoplasm" hint. */
    Ghost.prototype.hasEvidence = function (type) {
        var id = (type && typeof type === "object") ? type.id : type;
        for (var i = 0; i < this.evidence.length; i++) {
            if (this.evidence[i].id === id) return true;
        }
        if (id === E.GLASS.id && setup.Ghosts.isMimicHunt()) return true;
        return false;
    };

    /* A ghost is a candidate iff at least one of its evidence types is
       confirmed checked AND no evidence outside its set is. `checked` is
       a map of evidence-id → boolean. */
    Ghost.prototype.matchesEvidence = function (checked) {
        var myIds = this.evidence.map(function (e) { return e.id; });
        var anyMatch = false;
        var anyMismatch = false;
        Object.keys(checked).forEach(function (id) {
            if (!checked[id]) return;
            if (myIds.indexOf(id) === -1) anyMismatch = true;
            else anyMatch = true;
        });
        return anyMatch && !anyMismatch;
    };

    Ghost.prototype.hoverHtml = function () {
        var html = "<b>" + this.evidenceLabels() + "</b>";
        if (this.isInfoCollected && this.hint) {
            html += "<br><em>" + this.hint + "</em>";
        }
        return html;
    };

    /* Roll the per-ghost sanity penalty that fires during MC events
       (EventMC). Default 1-5; Oni 3-8. */
    Ghost.prototype.rollEventSanityLoss = function () {
        var r = this.sanityEventLossRange;
        return r[0] + Math.floor(Math.random() * (r[1] - r[0] + 1));
    };

    /* Sensor-glitch rolls — return true when the tool should display a
       bogus reading this tick. Default denominators are 0 (no glitches);
       Raiju overrides via cfg.emfGlitchChance / cfg.temperatureGlitchChance. */
    Ghost.prototype.rollEmfGlitch = function () {
        return this.emfGlitchChance > 0 &&
               Math.floor(Math.random() * this.emfGlitchChance) === 0;
    };
    Ghost.prototype.rollTemperatureGlitch = function () {
        return this.temperatureGlitchChance > 0 &&
               Math.floor(Math.random() * this.temperatureGlitchChance) === 0;
    };

    var GHOSTS = GHOST_CONFIG.map(function (cfg) { return new Ghost(cfg); });

    /* Map the six Notebook checkbox state vars to evidence ids. */
    var CHECK_VAR = {
        emf:         "EMF5Check",
        spiritbox:   "SpiritboxCheck",
        gwb:         "GWBCheck",
        glass:       "EctoglassCheck",
        temperature: "TemperatureCheck",
        uvl:         "UVLCheck"
    };

    /* Turn a state-shaped evidence id array (["emf","gwb",…]) back into the
       Evidence object array the Ghost class expects. Drops unknown ids
       rather than throwing; DeleteEvidence legitimately shrinks the list. */
    function rehydrateEvidence(ids) {
        if (!Array.isArray(ids)) return [];
        var out = [];
        for (var i = 0; i < ids.length; i++) {
            var e = EvidenceById[ids[i]];
            if (e) out.push(e);
        }
        return out;
    }

    /* Lifecycle stages of the current hunt. Stored as the top-level
       $huntMode integer (default 0 = NONE) and accessed through the
       huntMode()/setHuntMode() helpers below. Prefer the predicate
       helpers (isHunting, isPossessed, …) to comparing raw ints. */
    var HuntMode = Object.freeze({
        NONE:      0,   // no hunt active
        ACTIVE:    2,   // player is inside the house, hunt in progress
        POSSESSED: 3    // hunt ended (manual exit, sanity-over, pills)
    });

    /* Memoisation for active(): during a render it's called from every
       evidence tool, hoverHtml, CheckHuntStart, etc. The rebuild (catalogue
       lookup + field copy + evidence rehydrate) is cheap but happens dozens
       of times per passage. Keying on (name, evidence-ids) invalidates the
       cache correctly when Mimic rotates its disguise or DeleteEvidence
       prunes evidence, without needing a separate invalidation hook. */
    var activeCache = { key: null, ghost: null };

    /* The canonical ghost catalogue lives in the GHOSTS closure above;
       setup.Ghosts is the public namespace. Callers that want to iterate
       should use setup.Ghosts.list(). */
    /* Variables owned by this controller. Other controllers should
       query/mutate these only through the API methods below. */
    var OWNED_VARS = Object.freeze([
        'huntMode',
        'prowlActivated', 'prowlActivationTime',
        'elapsedTimeProwl', 'prowlTimeRemain',
        'EMF5Check', 'SpiritboxCheck', 'GWBCheck', 'EctoglassCheck',
        'TemperatureCheck', 'UVLCheck',
        // $ghostInfoCollected: map keyed by ghost name (Shade, Spirit, ...)
        // → 1 once the player has unlocked that Ghostopedia entry. Replaces
        // 18 individual $ghost<Name>InfoCollected flags; legacy keys are
        // folded into the map by SaveMigration.
        'ghostInfoCollected',
        'knowledgeUsed', 'chosenEvidence',
        'deleteOneEvidence', 'deleteSecondEvidence', 'deleteThirdEvidence',
        'hiddenEvidence', 'hiddenEvidence1', 'hiddenEvidence2',
        'lastChangeIntervalMimic',
        'twinsEventActive', 'twinsEvent',
        'highpriestess', 'bansheeAbility', 'cthulionAbility',
        'ghostTypeSelected'
    ]);

    function sv() { return State.variables; }

    var api = {
        OWNED_VARS: OWNED_VARS,
        Evidence: Evidence,
        HuntMode: HuntMode,

        list: function () {
            return GHOSTS;
        },

        /* The ghost currently being hunted. Returns a Ghost instance
           keyed off $run.ghostName via setup.HuntController, with the
           per-run evidence override (Fog of War etc.) applied. null
           when no hunt is active. Cached across calls; see activeCache. */
        active: function () {
            return setup.HuntController.activeGhost();
        },

        /* Internal: hand back the catalogue Ghost named `name`. Used by
           HuntController for hunts. When the active hunt
           carries an `evidence` override (e.g. Fog of War splices one
           id at run start), wrap the catalogue entry so the rehydrated
           evidence list reflects the override without mutating the
           shared catalogue object. */
        _activeFromCatalogue: function (name) {
            if (!name) return null;
            var override = (setup.HuntController && setup.HuntController.runEvidence)
                ? setup.HuntController.runEvidence() : null;
            var key = "catalogue|" + name + "|" + (override ? override.join(",") : "");
            if (activeCache.key === key) return activeCache.ghost;
            var ghost = setup.Ghosts.getByName(name);
            if (!ghost) return null;
            var g;
            if (override) {
                g = Object.create(Ghost.prototype);
                Object.keys(ghost).forEach(function (k) { g[k] = ghost[k]; });
                g.evidence = rehydrateEvidence(override);
            } else {
                g = ghost;
            }
            activeCache.key = key;
            activeCache.ghost = g;
            return g;
        },

        /* Ghost names only. Accepts `{ exclude: [names] }` to drop a subset
           (e.g. Mimic's impersonation list excludes itself). */
        names: function (opts) {
            var exclude = (opts && opts.exclude) || [];
            return GHOSTS
                .filter(function (g) { return exclude.indexOf(g.name) === -1; })
                .map(function (g) { return g.name; });
        },

        getByName: function (name) {
            for (var i = 0; i < GHOSTS.length; i++) {
                if (GHOSTS[i].name === name) return GHOSTS[i];
            }
            return null;
        },

        /* Hunt lifecycle. activateHunt() flips $huntMode to ACTIVE and
           clears stale per-hunt ability flags. Called from
           setup.HuntController.startHunt once $run is stamped. */
        activateHunt: function () {
            State.variables.huntMode = HuntMode.ACTIVE;
            setup.Ghosts.clearHuntFlags();
        },

        /* Test / cheat shortcut. Stamps a minimal $run with the named
           ghost as both real identity and current disguise, copies in
           the catalogue evidence, and flips $huntMode to ACTIVE.
           Production hunt flow goes through setup.HuntController.startHunt
           for the full floorplan / modifiers / starting-tools / event
           bus setup; this helper exists so unit specs and the cheat
           menu can park the player in an "active hunt" state without
           spinning up a procedural run.

           The `cheat` prefix marks this as cheat/test-only — see
           tests/cheat-method-lint.spec.js, which forbids production
           passages from calling any setup.X.cheat* method outside the
           cheat dialog. */
        cheatStartHunt: function (name) {
            var ghost = setup.Ghosts.getByName(name);
            if (!ghost) return false;
            setup.HuntController.cheatStampMinimalRun({
                ghostName: name,
                evidence:  ghost.evidence.map(function (e) { return e.id; })
            });
            setup.Ghosts.activateHunt();
            return true;
        },

        /* Wipe the per-hunt ability flags that ride alongside the hunt
           but live as their own top-level vars. $highpriestess burns on
           use but lingers if the player saved between draw and use;
           $bansheeAbility / $cthulionAbility are event-local and cleared
           by EventMC, but defensive wipes at hunt start keep them from
           leaking across hunts. */
        clearHuntFlags: function () {
            var V = State.variables;
            delete V.highpriestess;
            delete V.bansheeAbility;
            delete V.cthulionAbility;
        },

        /* Hunt-mode query/mutation helpers. Prefer these to raw
           $huntMode comparisons — they keep the magic ints out of
           passages and give each stage a readable predicate. */
        huntMode:    function ()     { return State.variables.huntMode || HuntMode.NONE; },
        setHuntMode: function (mode) { State.variables.huntMode = mode; },
        isHunting:   function ()     { return this.huntMode() === HuntMode.ACTIVE; },
        isPossessed: function ()     { return this.huntMode() === HuntMode.POSSESSED; },
        /* True for any stage past NONE — "a hunt is in progress or in
           its post-mortem (possessed) phase". */
        isAnyMode:   function ()     { return this.huntMode() !== HuntMode.NONE; },

        /* True when this hunt is actually a Mimic. $run.ghostName holds
           the true identity (never rotates); $run.disguiseName rotates
           through cover identities for display. */
        isMimicHunt: function () {
            return setup.HuntController.field('ghostName') === "Mimic";
        },

        /* Info-collected flag helpers. Callers should never touch the
           $ghostInfoCollected map directly — go through these helpers
           or the per-instance .isInfoCollected accessor. */
        markDiscovered: function (name) {
            var g = setup.Ghosts.getByName(name);
            if (g) g.isInfoCollected = true;
        },
        hasDiscovered: function (name) {
            var g = setup.Ghosts.getByName(name);
            return !!(g && g.isInfoCollected);
        },

        readEvidenceChecks: function () {
            var V = State.variables;
            var out = {};
            Object.keys(CHECK_VAR).forEach(function (k) { out[k] = !!V[CHECK_VAR[k]]; });
            return out;
        },

        /* Set a single Notebook evidence checkbox by evidence id
           ('emf', 'gwb', etc.). No-op for unknown ids. Used by the
           hunt meta-shop's Intense Intuition unlock so a freshly
           rolled run can pre-check one of the ghost's true evidences. */
        setEvidenceCheck: function (evidenceId, value) {
            var key = CHECK_VAR[evidenceId];
            if (!key) return false;
            State.variables[key] = !!value;
            return true;
        },

        /* Pure filter: given an evidence-id → boolean map, return a Set of
           ghost names whose evidence pattern matches. View-layer concerns
           (DOM classes, etc.) live in the consumer — see Notebook.tw. */
        matchingNames: function (checked) {
            var matches = new Set();
            GHOSTS.forEach(function (g) {
                if (g.matchesEvidence(checked)) matches.add(g.name);
            });
            return matches;
        },

        /* Challenging-contract flag setters. Witch side-quests schedule
           1-3 evidence types to hide from the next hunt. */
        scheduleHideEvidence: function (count) {
            var s = State.variables;
            s.deleteOneEvidence = 1;
            if (count >= 2) s.deleteSecondEvidence = 1;
            if (count >= 3) s.deleteThirdEvidence = 1;
        },

        /* Cheat-menu helpers (StoryCaption). The `cheat` prefix marks
           these as cheat-only — tests/cheat-method-lint.spec.js
           restricts the call sites. */
        cheatForceHuntGhost: function (g) {
            if (!g) return;
            if (!setup.HuntController
                || typeof setup.HuntController.isActive !== "function"
                || !setup.HuntController.isActive()) {
                return;
            }
            var ids = g.evidence.map(function (e) { return e.id; });
            setup.HuntController.setField('ghostName', g.name);
            setup.HuntController.setField('evidence', ids);
            setup.HuntController.setField('disguiseName', g.name);
        },
        huntName: function () {
            return setup.HuntController.field('disguiseName')
                || setup.HuntController.field('ghostName')
                || '';
        },
        huntRealName: function () {
            return setup.HuntController.field('ghostName') || null;
        },
        /* Human-friendly label for the ghost's current room
           ("Bedroom Upstairs", "Kitchen"). Resolves through the floor-plan
           template catalogue; returns '' when no run is active. The
           <<ghostRoom>> widget lowercases the result. */
        huntRoomName: function () {
            if (setup.HuntController && typeof setup.HuntController.ghostRoomLabel === 'function') {
                return setup.HuntController.ghostRoomLabel();
            }
            return '';
        },
        /* True if the witch contract scheduled at least one
           evidence-removal for this hunt. Used by witch-end-contract
           passages to decide whether the hidden-evidence cleanup
           should run. */
        hasScheduledHiddenEvidence: function () {
            var s = State.variables;
            return s.deleteOneEvidence === 1
                || s.deleteSecondEvidence === 1
                || s.deleteThirdEvidence === 1
                || s.hiddenEvidence !== undefined
                || s.hiddenEvidence1 !== undefined
                || s.hiddenEvidence2 !== undefined;
        },
        /* Drop all hidden-evidence/scheduled-deletion flags. Used at
           witch-contract close so the next hunt starts clean. */
        clearHiddenEvidence: function () {
            var s = State.variables;
            delete s.hiddenEvidence;
            delete s.hiddenEvidence1;
            delete s.hiddenEvidence2;
            delete s.deleteSecondEvidence;
            delete s.deleteThirdEvidence;
            delete s.deleteOneEvidence;
        },
        /* Marks a haunt (the ghost's roam-and-attack event) as in
           progress. Used by tools like the crucifix and by haunted-
           house passages when the player triggers the haunt directly.
           Stamps the time using TimeController. */
        activateProwl: function () {
            var s = State.variables;
            s.prowlActivated = 1;
            s.prowlActivationTime = setup.Time.totalMinutes();
        },
        clearProwlActivation: function () {
            State.variables.prowlActivated = 0;
        },
        isProwlActivated: function () {
            return State.variables.prowlActivated === 1;
        },
        knowledgeUsed: function () { return State.variables.knowledgeUsed === 1; },
        markKnowledgeUsed: function () { State.variables.knowledgeUsed = 1; },
        // `|| 0` getters are kept inline (callers do arithmetic and
        // unguarded comparisons that need 0 on fresh saves); only the
        // raw setters fold into the defineAccessors block.
        elapsedTimeProwl: function () { return State.variables.elapsedTimeProwl || 0; },
        prowlTimeRemain: function () { return State.variables.prowlTimeRemain || 0; },
        resetEvidenceChecks: function () {
            var s = State.variables;
            s.EMF5Check = false;
            s.EctoglassCheck = false;
            s.GWBCheck = false;
            s.SpiritboxCheck = false;
            s.TemperatureCheck = false;
            s.UVLCheck = false;
        },
        hasHighPriestess: function () { return State.variables.highpriestess === 1; },
        setHighPriestess: function (on) { State.variables.highpriestess = on ? 1 : 0; },
        consumeHighPriestess: function () { State.variables.highpriestess = 0; },
        twinsEventActive: function () { return State.variables.twinsEventActive === 1; },
        enableBanshee:  function () { State.variables.bansheeAbility = 1; },
        enableCthulion: function () { State.variables.cthulionAbility = 1; },
        clearBanshee:   function () { delete State.variables.bansheeAbility; },
        clearCthulion:  function () { delete State.variables.cthulionAbility; },
        bansheeActive:  function () { return State.variables.bansheeAbility === 1; },
        cthulionActive: function () { return State.variables.cthulionAbility === 1; },
        /* Mimic rotation: every 30 in-game minutes the mimic disguises itself
           as a different ghost. Returns the new disguise name when the
           interval flipped, null otherwise. */
        rollMimicType: function (ghostTypes) {
            var V = State.variables;
            var m = setup.Time.minutes();
            var interval = (m >= 0 && m < 30) ? '0-29' : '30-59';
            if (interval !== V.lastChangeIntervalMimic) {
                var name = ghostTypes[Math.floor(Math.random() * ghostTypes.length)];
                setup.HuntController.setField('disguiseName', name);
                V.lastChangeIntervalMimic = interval;
                return name;
            }
            return null;
        },
        // twinsEvent is registered with setup.Cooldowns at the
        // bottom of this file; daily reset flows through
        // setup.Tick.resetCooldowns.
        twinsEventReady:  function () {
            return State.variables.twinsEventActive === 1 && setup.Cooldowns.available('twinsEvent');
        },
        consumeTwinsEvent: function () {
            State.variables.twinsEventActive = 0;
            setup.Cooldowns.start('twinsEvent');
        },
        clearTwinsEvent: function () { State.variables.twinsEventActive = 0; },
        clearKnowledgeUsed: function () { State.variables.knowledgeUsed = undefined; },
        /* Drop the Notebook's crossed-out-evidence overlay (set by
           the Tarot Knowledge card / Monkey Paw knowledge wish). The
           overlay is hunt-scoped, so the cursed-item shared-state
           reset clears it on every fresh hunt. */
        clearChosenEvidence: function () { delete State.variables.chosenEvidence; },
        huntEvidence: function () {
            var ev = setup.HuntController.field('evidence');
            return Array.isArray(ev) ? ev : [];
        },
        /* Read-only accessors for the per-hunt hidden-evidence slots
           the witch contract may have stashed; consumers that need to
           filter "still-visible evidence" lists rely on these. */
        hiddenEvidenceList: function () {
            var s = State.variables;
            return [s.hiddenEvidence, s.hiddenEvidence1, s.hiddenEvidence2];
        },
        /* How many evidence-deletions the witch scheduled for this hunt:
           0/1/2/3. Used by HauntedHouses to pick a contract reward tier. */
        scheduledDeletionCount: function () {
            var s = State.variables;
            if (s.deleteThirdEvidence === 1)  return 3;
            if (s.deleteSecondEvidence === 1) return 2;
            if (s.deleteOneEvidence === 1)    return 1;
            return 0;
        },
    };

    // Pure $variable passthrough accessors. elapsedTimeProwl /
    // prowlTimeRemain getters live inline above (their `|| 0` fallback
    // is load-bearing for arithmetic / Sugarcube comparisons); only
    // their setters fold here.
    setup.defineAccessors(api, sv, [
        'ghostTypeSelected',
        'chosenEvidence',
        { name: 'elapsedTimeProwl', get: false },
        { name: 'prowlTimeRemain',  get: false }
    ]);
    setup.Cooldowns.registerDaily('twinsEvent');
    setup.Ghosts = api;

    /* Per-ghost behaviour on hunt-bus events.
     *
     * Each ghost-specific reaction (Spirit clearing its event stage,
     * Mimic seeding the disguise clock, Mare advancing its progression,
     * Twins stamping its prowl flag) lives here as a small subscriber
     * keyed on the active ghost's real name. Replaces the old onHuntEnd /
     * onEnterHouse / prowlEventFlag fields that used to sit on each
     * GHOST_CONFIG entry. Adding a new per-ghost reaction means appending
     * one block below; the catalogue stays purely declarative.
     *
     * Registration is deferred to :storyready because Tweego concatenates
     * passages/ghosts/ before passages/hunt/, so setup.Hunt isn't yet
     * defined when this IIFE runs. */
    $(document).one(':storyready', function () {
        if (!setup.Hunt || !setup.Hunt.Event) {
            console.error('GhostController: setup.Hunt missing at :storyready; per-ghost subscriptions skipped.');
            return;
        }
        var E = setup.Hunt.Event;

        function activeRealName() {
            return setup.Ghosts.huntRealName();
        }

        /* Spirit: reset its event-stage tracker when the hunt ends without
           a catch (HuntOverTime / HuntOverExhaustion / HuntOverManual emit
           HUNT_END_GRACEFUL; HuntOverSanity intentionally does not). */
        setup.Hunt.on(E.HUNT_END_GRACEFUL, function () {
            if (activeRealName() !== 'Spirit') return;
            setup.SpecialEvent.clearSpiritEventStage();
        });

        /* Mimic: seed the rotation clock when entering the haunted house
           so the next tick rolls a fresh disguise. $run.ghostName is
           already "Mimic" by this point, so isMimicHunt() returns true. */
        setup.Hunt.on(E.HOUSE_ENTER, function () {
            if (activeRealName() !== 'Mimic') return;
            State.variables.lastChangeIntervalMimic = " ";
        });

        /* Mare: advance the multi-day Mare event chain on house entry.
           Stage 0 → 1 on first encounter; once the player has read the
           initial GhostSpecialEventMare passage, subsequent entries jump
           straight to stage 4. */
        setup.Hunt.on(E.HOUSE_ENTER, function () {
            if (activeRealName() !== 'Mare') return;
            if (setup.SpecialEvent.mareEventStart() === 0) {
                setup.SpecialEvent.setMareEventStart(1);
            } else if (State.hasPlayed("GhostSpecialEventMare")) {
                setup.SpecialEvent.setMareEventStart(4);
            }
        });

        /* The Twins: stamp the per-prowl event flag. PROWL_EVENT fires
           from HuntOver*, NudityEvent, FreezeHunt, PrayHunt -- anywhere
           the player resolves a prowl. */
        setup.Hunt.on(E.PROWL_EVENT, function () {
            if (activeRealName() !== 'The Twins') return;
            State.variables.twinsEventActive = 1;
        });
    });
})();

/* Ghost-lust meter shown by the seduce-ghost minigame; the bare
 * "ghostlust" label is intentional — the minigame writes its own
 * dynamic label via updatemeter. */
Meter.add('ghostlust', { label: 'ghostlust', width: '100%' }, 1);
