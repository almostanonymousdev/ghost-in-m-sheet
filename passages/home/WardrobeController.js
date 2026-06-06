/*
 * Centralised wardrobe data + state transitions.
 *
 * One object-per-subsystem save shape: every wardrobe fact lives in the
 * single $wardrobe bundle, behind a small object model. There are no
 * per-item $<name>State<N> save keys, no aggregate $<slot>State flags,
 * no flat $remember* / $isXxxStolen / $lostClothing scattered across the
 * save -- those all collapsed into $wardrobe:
 *
 *   $wardrobe = {
 *     items:      { <id>: "worn" | "not worn" | "not bought", ... },
 *     remembered: { <groupName>: "<id>" | "no<id>" | null, ... },
 *     stolen:     { shirt, bra, panties, bottom, jeans, shorts, skirt },
 *     lost:       [ <id>, ... ]   // tier items a hunt stole and the MC
 *                                 // never recovered; buyback list
 *   }
 *
 * The canonical item **id** ("tshirt0", "bra1", "skirt3", "neckChoker1")
 * is the old rememberVar token. Aggregate worn/not-worn/not-bought state
 * per slot is **computed** from the items (see `state` / `worn`), so
 * there's nothing to keep in sync -- a tier change is visible to every
 * reader immediately.
 *
 * Each clothing item runs the same shape on equip ("remove the previously
 * worn sibling's beauty, add ours, clear siblings, remember ourselves"),
 * so the per-item branches collapse to one config entry + one shared
 * equip/unequip handler.
 *
 * The state string values ("worn" / "not worn" / "not bought") are still
 * part of the save format -- several passages compare against those
 * literals via the API -- so they don't get renamed.
 */
(function () {
    'use strict';

    var CS = setup.ClothingState = Object.freeze({
        NOT_BOUGHT: "not bought",
        NOT_WORN:   "not worn",
        WORN:       "worn"
    });

    /* Slot identifiers used by setup.Wardrobe.worn / state. 'tshirt' |
     * 'bra' | 'panties' | 'jeans' | 'shorts' | 'skirt'. jeans/shorts/skirt
     * are sub-slots of the single bottomOuter group. */
    setup.WardrobeSlot = Object.freeze({
        TSHIRT:  'tshirt',
        BRA:     'bra',
        PANTIES: 'panties',
        JEANS:   'jeans',
        SHORTS:  'shorts',
        SKIRT:   'skirt'
    });

    /* --------------------------------------------------------------- *
     * Object model: WardrobeItem + WardrobeGroup. Both are thin
     * projections over the live $wardrobe bundle -- they hold only
     * static catalogue data (id, image, price, beauty delta) and read
     * mutable state through wb() on demand, so the prototypes never
     * need to live in (or be cloned with) State.variables.
     * --------------------------------------------------------------- */

    function WardrobeItem(cfg, groupName) {
        this.id     = cfg.id;
        this.img    = cfg.img;
        this.beauty = cfg.beauty || 0;
        this.slot   = cfg.slot;
        this.price  = cfg.price;            // undefined for slot-0 defaults
        this.group  = groupName;
        /* bottomOuter merges jeans/shorts/skirt into one group/remember
         * slot; the per-item category distinguishes them for the
         * per-slot worn() rollup and the steal classifier. */
        this.category = (groupName === 'bottomOuter')
            ? (cfg.id.indexOf('jeans') === 0 ? 'jeans'
                : cfg.id.indexOf('shorts') === 0 ? 'shorts'
                : cfg.id.indexOf('skirt') === 0 ? 'skirt' : 'bottomOuter')
            : groupName;
        this.onEquip   = cfg.onEquip;
        this.onUnequip = cfg.onUnequip;
    }
    WardrobeItem.prototype.state    = function () { return wb().items[this.id]; };
    WardrobeItem.prototype.setState = function (st) { wb().items[this.id] = st; };
    WardrobeItem.prototype.isWorn   = function () { return this.state() === CS.WORN; };
    WardrobeItem.prototype.isBought = function () { return this.state() !== CS.NOT_BOUGHT; };

    function WardrobeGroup(cfg) {
        this.name          = cfg.name;
        this.appendTarget  = cfg.appendTarget;
        this.replaceTarget = cfg.replaceTarget;
        this.bareImage     = cfg.bareImage;      // undefined when no bare bitmap
        this.tracksMemory  = !!cfg.tracksMemory; // neck has no remember slot
        var self = this;
        this.items = cfg.items.map(function (it) { return new WardrobeItem(it, self.name); });
    }
    WardrobeGroup.prototype.item = function (id) {
        return this.items.find(function (it) { return it.id === id; }) || null;
    };
    WardrobeGroup.prototype.wornItem = function () {
        return this.items.find(function (it) { return it.isWorn(); }) || null;
    };
    WardrobeGroup.prototype.remembered = function () {
        return this.tracksMemory ? wb().remembered[this.name] : null;
    };
    WardrobeGroup.prototype.setRemembered = function (token) {
        if (this.tracksMemory) { wb().remembered[this.name] = token; }
    };

    /* --------------------------------------------------------------- *
     * Catalogue. `tracksMemory` flags groups that keep a last-worn
     * token (for beauty diffing on swap + the HUD redress shortcut);
     * neck has none. Groups with a bareImage render that bitmap when
     * their slot-0 item comes off. Item fields:
     *   id     -- canonical id / save key into $wardrobe.items
     *   img    -- filename under outfits/wardrobe/
     *   beauty -- delta applied on equip / undone on unequip
     *   slot   -- 0 = free default; 1..3 = purchased tiers
     *   price  -- store cost (slot 1..3); also the Bedroom buyback price
     *   onEquip / onUnequip -- optional side-effect callbacks
     * --------------------------------------------------------------- */
    var CATALOGUE = [
        {
            name: "neck",
            tracksMemory: false,
            appendTarget: "#availableAccessories",
            replaceTarget: "#currentNeck",
            items: [
                {
                    id: "neckChoker1", img: "neck-choker1.png",
                    beauty: 0, slot: 1, price: 100,
                    onEquip: function () {
                        if (setup.Mc.lust() <= 15) { setup.Mc.setLust(15); }
                    }
                }
            ]
        },
        {
            name: "stockings",
            tracksMemory: true,
            appendTarget: "#availableClothes",
            replaceTarget: "#currentUnderwearStockings",
            items: [
                { id: "stockings1", img: "stockings1.png", beauty: 2, slot: 1, price: 30 },
                { id: "stockings2", img: "stockings2.png", beauty: 4, slot: 2, price: 60 },
                { id: "stockings3", img: "stockings3.png", beauty: 6, slot: 3, price: 120 }
            ]
        },
        {
            name: "bra",
            tracksMemory: true,
            appendTarget: "#availableClothes",
            replaceTarget: "#currentUnderwearTop",
            bareImage: "underweartop.png",
            items: [
                { id: "bra0", img: "slip1.png", beauty: 0, slot: 0 },
                { id: "bra1", img: "slip2.png", beauty: 2, slot: 1, price: 20 },
                { id: "bra2", img: "slip3.png", beauty: 4, slot: 2, price: 30 },
                { id: "bra3", img: "slip4.png", beauty: 6, slot: 3, price: 40 }
            ]
        },
        {
            name: "panties",
            tracksMemory: true,
            appendTarget: "#availableClothes",
            replaceTarget: "#currentUnderwearBottom",
            bareImage: "underwearbottom.png",
            items: [
                { id: "panties0", img: "short1.png", beauty: 0, slot: 0 },
                { id: "panties1", img: "short2.png", beauty: 2, slot: 1, price: 25 },
                { id: "panties2", img: "short3.png", beauty: 4, slot: 2, price: 35 },
                { id: "panties3", img: "short4.png", beauty: 6, slot: 3, price: 45 }
            ]
        },
        {
            name: "tshirt",
            tracksMemory: true,
            appendTarget: "#availableOuterwear",
            replaceTarget: "#currentOuterwearTop",
            bareImage: "outerweartop.png",
            items: [
                { id: "tshirt0", img: "tshirt0.png", beauty: 0,  slot: 0 },
                { id: "tshirt1", img: "tshirt1.png", beauty: 5,  slot: 1, price: 30 },
                { id: "tshirt2", img: "tshirt2.png", beauty: 8,  slot: 2, price: 40 },
                { id: "tshirt3", img: "tshirt3.png", beauty: 11, slot: 3, price: 50 }
            ]
        },
        {
            name: "bottomOuter",
            tracksMemory: true,
            appendTarget: "#availableOuterwear",
            replaceTarget: "#currentOuterwearBottom",
            bareImage: "outerwearbottom.png",
            items: [
                { id: "jeans0",  img: "jeans0.png",  beauty: 0,  slot: 0 },
                { id: "jeans1",  img: "jeans1.png",  beauty: 5,  slot: 1, price: 30 },
                { id: "jeans2",  img: "jeans2.png",  beauty: 8,  slot: 2, price: 40 },
                { id: "jeans3",  img: "jeans3.png",  beauty: 11, slot: 3, price: 50 },
                { id: "shorts1", img: "shorts1.png", beauty: 6,  slot: 1, price: 35 },
                { id: "shorts2", img: "shorts2.png", beauty: 9,  slot: 2, price: 45 },
                { id: "shorts3", img: "shorts3.png", beauty: 12, slot: 3, price: 55 },
                { id: "skirt1",  img: "skirt1.png",  beauty: 7,  slot: 1, price: 40 },
                { id: "skirt2",  img: "skirt2.png",  beauty: 10, slot: 2, price: 50 },
                { id: "skirt3",  img: "skirt3.png",  beauty: 13, slot: 3, price: 60 }
            ]
        }
    ];

    var GROUPS = CATALOGUE.map(function (cfg) { return new WardrobeGroup(cfg); });
    setup.WARDROBE_GROUPS = GROUPS;

    /* Legacy rememberVar name -> group name, for the save migration that
     * folds old flat saves into the bundle. Kept here next to the
     * catalogue so the mapping lives with the data it describes. */
    setup.WARDROBE_REMEMBER_LEGACY = Object.freeze({
        rememberTopOuter:        'tshirt',
        rememberBottomOuter:     'bottomOuter',
        rememberTopUnder:        'bra',
        rememberBottomUnder:     'panties',
        rememberBottomStockings: 'stockings'
    });

    function groupByName(name) {
        return GROUPS.find(function (g) { return g.name === name; }) || null;
    }
    function groupForId(id) {
        return GROUPS.find(function (g) { return !!g.item(id); }) || null;
    }
    function itemById(id) {
        for (var i = 0; i < GROUPS.length; i++) {
            var it = GROUPS[i].item(id);
            if (it) { return it; }
        }
        return null;
    }
    /* Items contributing to a slot's aggregate worn-state. jeans/shorts/
     * skirt each filter the shared bottomOuter group by category. */
    function itemsForSlot(slot) {
        if (slot === 'jeans' || slot === 'shorts' || slot === 'skirt') {
            return groupByName('bottomOuter').items.filter(function (it) {
                return it.category === slot;
            });
        }
        var grp = groupByName(slot);
        return grp ? grp.items : [];
    }

    /* The single backing object. Lazily seeded so any stray early read
     * (before initState / migration) still gets a coherent bundle. */
    function wb() {
        var s = State.variables;
        if (!s.wardrobe || typeof s.wardrobe !== 'object') {
            s.wardrobe = freshBundle();
        }
        return s.wardrobe;
    }

    /* A pristine wardrobe: slot-0 defaults worn, everything else
     * unpurchased; nothing stolen or lost; remember tokens point at the
     * slot-0 default for groups that have one (so canQuickRedress reads
     * false on a fresh game -- a positive token, not a "no<id>" marker). */
    function freshBundle() {
        var items = {};
        var remembered = {};
        GROUPS.forEach(function (g) {
            g.items.forEach(function (it) {
                items[it.id] = (it.slot === 0) ? CS.WORN : CS.NOT_BOUGHT;
            });
            if (g.tracksMemory) {
                var slot0 = g.items.find(function (it) { return it.slot === 0; });
                remembered[g.name] = slot0 ? slot0.id : null;
            }
        });
        return {
            items: items,
            remembered: remembered,
            stolen: { shirt: false, bra: false, panties: false, bottom: false,
                      jeans: false, shorts: false, skirt: false },
            lost: []
        };
    }
    setup.freshWardrobeBundle = freshBundle;

    /* steal/restore category -> group name. */
    var STEAL_GROUP = Object.freeze({
        shirt: 'tshirt', bra: 'bra', panties: 'panties', bottom: 'bottomOuter'
    });

    /* Variables owned by this controller. Everything wardrobe lives in
       one bundle now; other controllers go through the API below. */
    var OWNED_VARS = Object.freeze(['wardrobe']);

    setup.Wardrobe = {
        OWNED_VARS: OWNED_VARS,

        /* not worn -> worn. Applies beauty delta, subtracts the
         * previously remembered sibling's beauty, marks every other item
         * in the group not-worn, then stamps the remember slot with this
         * item's id. */
        equip: function (grp, item) {
            item.setState(CS.WORN);
            if (item.beauty) { setup.Mc.addBeauty(item.beauty); }

            if (grp.tracksMemory) {
                var remembered = grp.remembered();
                grp.items.forEach(function (other) {
                    if (other !== item && other.beauty && other.id === remembered) {
                        setup.Mc.addBeauty(-other.beauty);
                    }
                });
            }

            /* Clear siblings. Slot 0 is always owned (no "not bought"
             * state), so it flips unconditionally; slots 1+ only flip
             * if they've been purchased. */
            grp.items.forEach(function (other) {
                if (other === item) { return; }
                if (other.slot === 0) {
                    other.setState(CS.NOT_WORN);
                } else if (other.state() !== CS.NOT_BOUGHT) {
                    other.setState(CS.NOT_WORN);
                }
            });

            grp.setRemembered(item.id);
            if (typeof item.onEquip === "function") { item.onEquip(); }
        },

        /* worn -> not worn. Undoes the beauty delta and stamps the
         * remember slot with "no"+id so the next equip knows nothing is
         * currently on. */
        unequip: function (grp, item) {
            item.setState(CS.NOT_WORN);
            if (item.beauty) { setup.Mc.addBeauty(-item.beauty); }
            grp.setRemembered("no" + item.id);
            if (typeof item.onUnequip === "function") { item.onUnequip(); }
        },

        /* Query helpers used by passages / HUD widgets. `state(slot)` is
         * computed by rolling up the slot's items: worn beats not-worn
         * beats not-bought. `slot` is one of 'tshirt' | 'bra' | 'panties'
         * | 'jeans' | 'shorts' | 'skirt' (also 'neck' | 'stockings'). */
        state: function (slot) {
            var items = itemsForSlot(slot);
            if (items.some(function (it) { return it.state() === CS.WORN; }))     { return CS.WORN; }
            if (items.some(function (it) { return it.state() === CS.NOT_WORN; })) { return CS.NOT_WORN; }
            return CS.NOT_BOUGHT;
        },
        worn: function (slot) {
            return this.state(slot) === CS.WORN;
        },

        isChokerWorn: function () {
            return itemById('neckChoker1').isWorn();
        },

        isPantiesStolen: function () { return wb().stolen.panties === true; },
        isBottomStolen:  function () { return wb().stolen.bottom === true; },
        isShirtStolen:   function () { return wb().stolen.shirt === true; },
        isBraStolen:     function () { return wb().stolen.bra === true; },

        isDressedForStreet: function () {
            var top = this.state('tshirt') !== CS.NOT_WORN;
            var bot = this.state('jeans') !== CS.NOT_WORN ||
                (this.state('shorts') !== CS.NOT_WORN && this.state('shorts') !== CS.NOT_BOUGHT) ||
                (this.state('skirt') !== CS.NOT_WORN && this.state('skirt') !== CS.NOT_BOUGHT);
            return top && bot;
        },
        isWearingUnderwear: function () {
            return this.state('bra') !== CS.NOT_WORN && this.state('panties') !== CS.NOT_WORN;
        },

        /* Coverage score (0-100) summarising how dressed the MC is.
         * Consumed by the hunt event roller to dampen harassment
         * frequency and to surface a "Hunt harassment" estimate in
         * the Wardrobe passage. Tops contribute roughly half the
         * total; bottoms the other half. A fully dressed outfit
         * (tshirt + bra + bottoms + panties) lands at 100. */
        coverage: function () {
            var n = 0;
            if (this.worn(setup.WardrobeSlot.TSHIRT))  n += 30;
            if (this.worn(setup.WardrobeSlot.BRA))     n += 20;
            if (this.worn(setup.WardrobeSlot.JEANS))   n += 30;
            else if (this.worn(setup.WardrobeSlot.SHORTS)) n += 20;
            else if (this.worn(setup.WardrobeSlot.SKIRT))  n += 10;
            if (this.worn(setup.WardrobeSlot.PANTIES)) n += 20;
            return n > 100 ? 100 : n;
        },

        /* Per-body-part multipliers driven by what the MC is wearing.
         * rollBodyPartEvent scales each body-part's weight by these
         * values so dressing strategically redirects which events
         * fire -- covered zones become rare, exposed ones stay full
         * weight (or amplify for skirt-no-panties). Returns floats;
         * caller rounds. */
        exposureMultipliers: function () {
            var t  = this.worn(setup.WardrobeSlot.TSHIRT);
            var b  = this.worn(setup.WardrobeSlot.BRA);
            var j  = this.worn(setup.WardrobeSlot.JEANS);
            var s  = this.worn(setup.WardrobeSlot.SHORTS);
            var k  = this.worn(setup.WardrobeSlot.SKIRT);
            var p  = this.worn(setup.WardrobeSlot.PANTIES);

            var tits;
            if (t && b)      tits = 0.3;
            else if (t)      tits = 0.5;
            else if (b)      tits = 0.7;
            else             tits = 1.0;

            var ass;
            if (j)           ass = 0.3;
            else if (s)      ass = 0.6;
            else if (k && p) ass = 0.7;
            else if (k)      ass = 1.2;
            else if (p)      ass = 0.8;
            else             ass = 1.0;

            var pussy;
            if (j)           pussy = 0.2;
            else if (s)      pussy = 0.3;
            else if (k && p) pussy = 0.4;
            else if (k)      pussy = 1.0;
            else if (p)      pussy = 0.25;
            else             pussy = 1.0;

            return {
                brain:  1.0,
                tits:   tits,
                ass:    ass,
                bottom: ass,
                mouth:  1.0,
                pussy:  pussy,
                anal:   pussy
            };
        },

        /* Coarse string label for the Wardrobe UI readout. Maps the
         * 0-100 coverage score to High / Medium / Low so the player
         * can see how their outfit will influence hunt event
         * frequency without having to learn the underlying numbers. */
        harassmentLevel: function () {
            var c = this.coverage();
            if (c >= 70) return 'Low';
            if (c >= 35) return 'Medium';
            return 'High';
        },

        /* Strip the MC down to NOT_WORN across every wardrobe slot.
           Used by the MonkeyPaw tier-3 sealed-room branch. */
        stripToNaked: function () {
            ['tshirt', 'bra', 'panties', 'bottomOuter'].forEach(function (name) {
                groupByName(name).items.forEach(function (it) {
                    if (it.state() === CS.WORN) { it.setState(CS.NOT_WORN); }
                });
            });
        },

        /* Test / cheat shortcut: unequip whichever item is currently
           worn in every wardrobe slot, through the regular unequip path
           so beauty deltas reverse and the "no<id>" remember markers get
           stamped. Used by the Flashbacks gallery to plant a nude MC
           before replaying NudityEvent / HuntOverProwl variants without
           forcing the player's real wardrobe to flip. Caller snapshots
           wardrobe state and restores on exit.

           The `cheat` prefix marks this as cheat/test-only -- see
           tests/cheat-method-lint.spec.js. */
        cheatStripAll: function () {
            var self = this;
            GROUPS.forEach(function (grp) {
                var worn = grp.wornItem();
                if (worn) { self.unequip(grp, worn); }
            });
        },

        /* Permanently discard whatever garment the ghost stole (mark as
         * "not bought"). Fired when the MC leaves the hunt without
         * recovering her clothes. Works off each group's "no<id>"
         * remember marker and resets every stolen flag. Each lost
         * slot-1..3 item is pushed onto $wardrobe.lost so the Bedroom
         * "Replace lost clothing" buyback button can offer to
         * repurchase it at store price. */
        loseAllStolen: function () {
            var bundle = wb();
            var st = bundle.stolen;
            function discardFromGroup(groupName) {
                var grp = groupByName(groupName);
                var token = grp.remembered();
                if (typeof token !== "string" || token.indexOf("no") !== 0) { return; }
                var item = grp.item(token.slice(2));
                if (item && item.slot !== 0) {
                    item.setState(CS.NOT_BOUGHT);
                    if (bundle.lost.indexOf(item.id) === -1) { bundle.lost.push(item.id); }
                }
            }
            if (st.panties) { discardFromGroup("panties"); }
            if (st.bottom)  { discardFromGroup("bottomOuter"); }
            if (st.shirt)   { discardFromGroup("tshirt"); }
            if (st.bra)     { discardFromGroup("bra"); }
            st.panties = false; st.bottom = false; st.shirt = false; st.bra = false;
            st.jeans = false; st.shorts = false; st.skirt = false;
        },

        /* Lookup an item descriptor by its canonical id. Used by
         * ReplaceLostClothing to render the price/image of each lost
         * garment without the passage having to know the group->item
         * mapping. */
        itemById: function (id) { return itemById(id); },

        /* Lost-clothing list (mutable copy). Populated by loseAllStolen
         * when the MC leaves a hunt with stolen tier-1..3 clothing she
         * didn't recover. The Bedroom shows the buyback button while
         * this list is non-empty. */
        lostClothing: function () { return wb().lost.slice(); },
        hasLostClothing: function () { return wb().lost.length > 0; },

        /* Repurchase a lost garment at store price. Deducts money, flips
         * the slot back to NOT_WORN (the same state a fresh mall purchase
         * leaves it in), and removes the entry from $wardrobe.lost.
         * Returns true on success, false when the item isn't actually
         * lost or the MC can't afford it. */
        replaceLostClothing: function (id) {
            var bundle = wb();
            var idx = bundle.lost.indexOf(id);
            if (idx === -1) { return false; }
            var item = itemById(id);
            if (!item || typeof item.price !== "number") { return false; }
            if (setup.Mc.money() < item.price) { return false; }
            setup.Mc.removeMoney(item.price);
            item.setState(CS.NOT_WORN);
            bundle.lost.splice(idx, 1);
            return true;
        },

        /* Mall-shop helpers. A clothing item is "not purchased" while its
         * state is NOT_BOUGHT; purchase deducts money and flips it to
         * NOT_WORN (its drawer entry, ready to equip). */
        notPurchased: function (id) {
            return itemById(id).state() === CS.NOT_BOUGHT;
        },
        purchase: function (id) {
            var item = itemById(id);
            if (item.state() !== CS.NOT_BOUGHT) { return false; }
            if (setup.Mc.money() < item.price) { return false; }
            setup.Mc.removeMoney(item.price);
            item.setState(CS.NOT_WORN);
            return true;
        },

        /* Asset paths for the steal-clothes passages. Each passage shows
           a randomised image/video bucketed by what the MC is currently
           wearing -- the bucket layout lives here so the passage stays a
           one-line <<image>>/<<video>> render. */
        stealPantiesImage: function () {
            var bucket =
                this.worn(setup.WardrobeSlot.JEANS)  ? [1, 2, 3]    :
                this.worn(setup.WardrobeSlot.SHORTS) ? [4, 5, 6]    :
                this.worn(setup.WardrobeSlot.SKIRT)  ? [7, 8, 9]    :
                                      [10, 11, 12];
            var n = bucket[Math.floor(Math.random() * bucket.length)];
            return "mechanics/steal-clothes/" + n + ".png";
        },
        stealBottomOuterImage: function () {
            var bucket = this.worn(setup.WardrobeSlot.PANTIES)
                ? [13, 14, 15]
                : [16, 17, 18];
            var n = bucket[Math.floor(Math.random() * bucket.length)];
            return "mechanics/steal-clothes/" + n + ".png";
        },
        stealBraVideo: function () {
            var bucket = this.worn(setup.WardrobeSlot.TSHIRT)
                ? [3, 4]
                : [1, 2];
            var n = bucket[Math.floor(Math.random() * bucket.length)];
            return "mechanics/steal-clothes/" + n + ".mp4";
        },

        /* Steal the currently-worn garment in a category ('shirt' | 'bra'
         * | 'panties' | 'bottom'). Flips that item to "not worn", refunds
         * its beauty delta, stamps the "no<id>" marker, and sets the
         * matching stolen flag. For 'bottom' it also records the
         * jeans/shorts/skirt sub-flag. Returns the stolen descriptor
         * ('panties' / 'bra' / 'shirt' for the simple cases; the bottom
         * sub-category 'jeans'/'shorts'/'skirt' for bottom) or null when
         * nothing was worn to steal. Used by the Steal* hunt-event
         * passages and the MonkeyPaw clothes-theft wish. */
        stealGarment: function (category) {
            var grp = groupByName(STEAL_GROUP[category]);
            var item = grp.wornItem();
            if (!item) { return null; }
            item.setState(CS.NOT_WORN);
            if (item.beauty) { setup.Mc.addBeauty(-item.beauty); }
            grp.setRemembered("no" + item.id);
            var st = wb().stolen;
            if (category === 'bottom') {
                st.bottom = true;
                st[item.category] = true;
                return item.category;
            }
            st[category] = true;
            return category;
        },

        /* Symmetric inverse of stealGarment for the same categories:
         * restore the "no<id>" marker back to "<id>", flip the item to
         * "worn", re-add the beauty delta, and clear the stolen flag(s).
         * Used by FindStolen<Garment> / FurnitureSearch / HuntOver
         * recovery beats. Returns true unless nothing was remembered as
         * stolen. */
        restoreGarment: function (category) {
            var grp = groupByName(STEAL_GROUP[category]);
            var token = grp.remembered();
            if (typeof token !== "string" || token.indexOf("no") !== 0) { return false; }
            var item = grp.item(token.slice(2));
            if (item) {
                item.setState(CS.WORN);
                if (item.beauty) { setup.Mc.addBeauty(item.beauty); }
                grp.setRemembered(item.id);
            }
            var st = wb().stolen;
            st[category] = false;
            if (category === 'bottom') { st.jeans = false; st.shorts = false; st.skirt = false; }
            return true;
        },

        /* Remove a single slot-0 item from the MC -- used by the Wardrobe
         * screen's "take off your default bottom / top / bra / panties"
         * links. `id` is the slot-0 item id (e.g. "tshirt0"). Routes
         * through unequip so the remember slot gets stamped "no<id>" --
         * without that, a hunt starting with the slot already empty has
         * no redress link in the sidebar HUD (canQuickRedress checks the
         * marker). */
        takeOffSlotZero: function (id) {
            var grp = groupForId(id);
            var item = grp ? grp.item(id) : null;
            if (!item) { return; }
            this.unequip(grp, item);
        },

        /* MC HUD: pick the currently-worn outer-bottom garment and
         * return its descriptor ({state, tip, icon}) or null. */
        currentBottomDescriptor: function () {
            var rows = [
                { slot: 'jeans',  tip: "Wearing jeans",  icon: "jeans.jpg" },
                { slot: 'shorts', tip: "Wearing shorts", icon: "shorts.jpg" },
                { slot: 'skirt',  tip: "Wearing skirt",  icon: "skirt.jpg" }
            ];
            for (var i = 0; i < rows.length; i++) {
                if (this.worn(rows[i].slot)) {
                    return { state: CS.WORN, tip: rows[i].tip, icon: rows[i].icon };
                }
            }
            return null;
        },

        /* MC HUD: name of the currently-worn bottom-outer slot
         * ('jeans'/'shorts'/'skirt') or null. Pairs with
         * currentBottomDescriptor for the hunt-mode click target. */
        currentBottomSlotName: function () {
            if (this.worn('jeans'))  { return 'jeans'; }
            if (this.worn('shorts')) { return 'shorts'; }
            if (this.worn('skirt'))  { return 'skirt'; }
            return null;
        },

        /* Map a WardrobeSlot value (or 'bottomOuter') to its group. The
         * three bottom-outer aliases (jeans/shorts/skirt) collapse to the
         * same group. Returns null for unknown slot names. */
        groupForSlot: function (slot) {
            var groupName = (slot === 'jeans' || slot === 'shorts' || slot === 'skirt')
                ? 'bottomOuter' : slot;
            return groupByName(groupName);
        },

        /* HUD click: take off whatever is currently worn in `slot`'s
         * group. Returns true iff anything was removed. */
        quickUndress: function (slot) {
            var grp = this.groupForSlot(slot);
            var worn = grp.wornItem();
            if (!worn) { return false; }
            this.unequip(grp, worn);
            return true;
        },

        /* HUD click: re-equip whichever item was last worn in `slot`'s
         * group (reads the "no<id>" marker). Returns false when nothing
         * has been remembered or the remembered item is no longer
         * purchased / is currently stolen. */
        quickRedress: function (slot) {
            var item = this._rememberedItem(slot);
            if (!item) { return false; }
            this.equip(this.groupForSlot(slot), item);
            return true;
        },

        /* Predicate paired with quickRedress: true iff the slot has a
         * remembered last-worn item the HUD can put back on with one
         * click. */
        canQuickRedress: function (slot) {
            return !!this._rememberedItem(slot);
        },

        /* End-of-hunt auto-redress for clothes the MC took off herself
         * via the side-panel quickUndress shortcut. Voluntarily-removed
         * slots leave their stolen flag false (only steal events flip
         * those), so quickRedress' stolen/NOT_BOUGHT filters do the work:
         * any slot that still has a re-equippable remembered item gets it
         * back on. Stolen items either ran through loseAllStolen (now
         * NOT_BOUGHT) or are still flagged stolen, so they correctly stay
         * off. Returns the list of slots that were actually redressed. */
        redressAfterHunt: function () {
            var slots = ['tshirt', 'bra', 'panties', 'bottomOuter'];
            var restored = [];
            for (var i = 0; i < slots.length; i++) {
                if (this.quickRedress(slots[i])) { restored.push(slots[i]); }
            }
            return restored;
        },

        _rememberedItem: function (slot) {
            var grp = this.groupForSlot(slot);
            if (!grp || !grp.tracksMemory) { return null; }
            var token = grp.remembered();
            if (typeof token !== 'string' || token.indexOf('no') !== 0) { return null; }
            var item = grp.item(token.slice(2));
            if (!item) { return null; }
            if (item.state() === CS.NOT_BOUGHT) { return null; }
            if (this.isSlotStolen(slot)) { return null; }
            return item;
        },

        /* True iff the slot's group currently has its in-hunt "stolen"
         * marker set. Used by canQuickRedress / quickRedress to refuse
         * the HUD shortcut: stolen clothing has to be actually recovered
         * (FindStolenClothes) or fully lost (HuntOverTime /
         * HuntOverExhaustion). The bottom-outer group shares one
         * aggregate marker since the steal flow collapses jeans/shorts/
         * skirt into the same slot. */
        isSlotStolen: function (slot) {
            var st = wb().stolen;
            switch (slot) {
                case 'tshirt':      return st.shirt   === true;
                case 'bra':         return st.bra     === true;
                case 'panties':     return st.panties === true;
                case 'bottomOuter':
                case 'jeans':
                case 'shorts':
                case 'skirt':       return st.bottom  === true;
                default:            return false;
            }
        },

        // --- Aggregate worn-state predicates ----------------------
        /* "Anything covering the legs?" -- true iff at least one of
           the three bottom-outer slots is worn. */
        hasBottomWorn: function () {
            return this.worn(setup.WardrobeSlot.JEANS)
                || this.worn(setup.WardrobeSlot.SKIRT)
                || this.worn(setup.WardrobeSlot.SHORTS);
        },
        hasTopWorn: function () { return this.worn(setup.WardrobeSlot.TSHIRT); },
        isFullyDressed: function () {
            return this.hasTopWorn() && this.hasBottomWorn();
        },
        isFullyNude: function () {
            return !this.worn(setup.WardrobeSlot.TSHIRT)
                && !this.worn(setup.WardrobeSlot.PANTIES)
                && !this.hasBottomWorn();
        },
        isTopless: function () {
            return !this.worn(setup.WardrobeSlot.TSHIRT) && this.hasBottomWorn();
        },
        isBottomless: function () {
            return !this.worn(setup.WardrobeSlot.JEANS)
                && !this.worn(setup.WardrobeSlot.SHORTS)
                && !this.worn(setup.WardrobeSlot.SKIRT)
                && !this.worn(setup.WardrobeSlot.PANTIES);
        },
        isTopBare: function () {
            return !this.worn(setup.WardrobeSlot.TSHIRT) && !this.worn(setup.WardrobeSlot.BRA);
        },
        hasAnyGarmentWorn: function () {
            return this.hasBottomWorn() || this.hasTopWorn()
                || this.worn(setup.WardrobeSlot.PANTIES) || this.worn(setup.WardrobeSlot.BRA);
        },

        // --- Stolen-clothes aggregate -----------------------------
        /* Aggregate "anything currently stolen?" gate. Derived from the
           four per-garment flags -- each piece is tracked + restored
           independently (see setup.HuntController.stashStolenClothes), so
           this is just a convenience disjunction. */
        hasClothesStolen: function () {
            return this.isPantiesStolen()
                || this.isBraStolen()
                || this.isShirtStolen()
                || this.isBottomStolen();
        },

        // --- Steal targeting --------------------------------------
        /* True iff there is at least one garment a ghost steal event
           can actually take this tick. Used as the gate at the roll
           site so we never trigger a steal that would find nothing. */
        canStealAnyItem: function () {
            return this.worn(setup.WardrobeSlot.BRA)
                || this.worn(setup.WardrobeSlot.PANTIES)
                || this.hasBottomWorn();
        },
        /* Given the MC's current clothing state, return the list of
           garment categories that are still available to steal
           ("panties", "bra", "outerwear"). Used by StealClothes to
           pick a random target. */
        availableStealTargets: function () {
            var opts = [];
            if (this.worn(setup.WardrobeSlot.PANTIES)) opts.push('panties');
            if (this.worn(setup.WardrobeSlot.BRA)) opts.push('bra');
            if (this.worn(setup.WardrobeSlot.TSHIRT) || this.worn(setup.WardrobeSlot.JEANS)
                || this.worn(setup.WardrobeSlot.SKIRT) || this.worn(setup.WardrobeSlot.SHORTS)) {
                opts.push('outerwear');
            }
            return opts;
        },

        // --- Nudity event branch helpers --------------------------
        /* The NudityEvent passage gates on whether the MC has lost
           pants only vs lost everything below the waist. Same
           predicates as isFullyNude / a partial variant, kept named
           for the consuming branch. */
        nudityNakedNoBottoms: function () {
            return !this.worn(setup.WardrobeSlot.TSHIRT)
                && !this.worn(setup.WardrobeSlot.PANTIES)
                && !this.hasBottomWorn();
        },
        nudityToplessWithPanties: function () {
            return !this.worn(setup.WardrobeSlot.TSHIRT)
                && this.worn(setup.WardrobeSlot.PANTIES)
                && !this.hasBottomWorn();
        },

        // --- Possession helper ------------------------------------
        /* Hot/possession scenes drop whatever outer top + bottom the MC
           is wearing (without refunding beauty or stamping a redress
           marker -- the possessor undresses her, recomputeBeauty resyncs
           on the next sleep). Operates on the positive remember tokens:
           a "no<id>" token means that layer is already off. */
        dropWornOuter: function () {
            ['tshirt', 'bottomOuter'].forEach(function (name) {
                var grp = groupByName(name);
                var token = grp.remembered();
                if (typeof token === 'string' && token.indexOf('no') !== 0) {
                    var item = grp.item(token);
                    if (item) { item.setState(CS.NOT_WORN); }
                }
            });
        },

        // --- Remember-token getters -------------------------------
        /* Read-only views of the per-group last-worn tokens. Consumed by
           findStolenDressupVideo (which combo was stolen) and the gym
           lingerie gate. */
        rememberTopOuter:        function () { return wb().remembered.tshirt; },
        rememberBottomOuter:     function () { return wb().remembered.bottomOuter; },
        rememberTopUnder:        function () { return wb().remembered.bra; },
        rememberBottomUnder:     function () { return wb().remembered.panties; },
        rememberBottomStockings: function () { return wb().remembered.stockings; },

        // --- Dressup video lookup ---------------------------------
        /* Which dress-up video to show while the MC puts clothes back on.
           Reads the current "no<id>" remember tokens to figure out which
           bottom / underwear combo was stolen. Returns a video path or
           null. */
        findStolenDressupVideo: function () {
            var ro = this.rememberBottomOuter();
            var ru = this.rememberBottomUnder();
            function isJeans(k) { return typeof k === "string" && k.indexOf("nojeans") === 0; }
            function isShorts(k) { return typeof k === "string" && k.indexOf("noshorts") === 0; }
            function isSkirt(k) { return typeof k === "string" && k.indexOf("noskirt") === 0; }
            function hasPanties(k) { return typeof k === "string" && k.indexOf("panties") === 0; }
            function noPanties(k) { return typeof k === "string" && k.indexOf("nopanties") === 0; }
            if (isJeans(ro) && hasPanties(ru)) return "characters/mc/jeansp.mp4";
            if (isJeans(ro) && noPanties(ru)) return "characters/mc/jeansnp.mp4";
            if (isShorts(ro)) return "characters/mc/shorts.mp4";
            if (isSkirt(ro) && hasPanties(ru)) return "characters/mc/skirtp.mp4";
            if (isSkirt(ro) && noPanties(ru)) return "characters/mc/skirtnp.mp4";
            return null;
        }
    };

    /* Build a fresh $wardrobe bundle. Called from initState() and from
     * the legacy-save migration once the flat keys have been folded in. */
    setup.initWardrobe = function (vars) {
        vars.wardrobe = freshBundle();
    };
}());
