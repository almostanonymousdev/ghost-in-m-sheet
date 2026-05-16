/* setup.HauntConditions -- single source of truth for the hunt-mechanics
 * rework. Resolves the player's current haunted-house room from the running
 * passage, aggregates every axis (darkness, clothing, lust, overcharged
 * tools, bait) into one snapshot, and exposes it to:
 *   - huntConditions HUD (per-step stat deltas above the tool bar)
 *   - setup.ToolController.toolSuccessRate (hover tooltip on each tool card)
 *   - setup.ToolController.chanceByTier / .toolTimeRemain (actual tool rolls)
 *   - CheckHuntStart (random-hunt threshold)
 *   - applyTickEffects (per-nav-step sanity/lust/corruption drain)
 * Each axis pushes into contributors[] so the HUD can render a badge row
 * alongside the aggregated numbers. Keep new knobs HERE so the HUD numbers
 * and the underlying mechanics never drift apart. */
setup.HauntConditions = (function () {
	var LUST_FUEL_THRESHOLD = 50;   // passive evidence bonus when lust >= this
	var BAIT_INITIAL_LUST   = 20;   // lust the bait click stamps onto the MC
	var BAIT_LUST_PER_STEP  = 10;   // lust accrued each remaining bait step
	var BAIT_STEPS          = 3;    // nav ticks the ghost is pinned to you
	var BAIT_ORGASM_SANITY  = 10;   // sanity lost when bait pushes lust past the cap

	/* Energy as the pacing gate: every nav tick inside a haunted house
	 * burns ENERGY_PER_STEP, capping the total room-search budget per
	 * contract. Spendable actions (bait, pray) charge their own energy
	 * on top of their named cost. Energy at 0 kicks the player out via
	 * HuntOverExhaustion. */
	var ENERGY_PER_STEP    = 0.125;
	var ENERGY_COST_BAIT   = 0.5;
	var ENERGY_COST_PRAY   = 0.5;

	var passageBgIndex = null;
	function bgIndex() {
		if (!passageBgIndex) {
			passageBgIndex = {};
			setup.hauntedPassages.forEach(function (e) {
				passageBgIndex[e.passage] = e.bgRoom;
			});
		}
		return passageBgIndex;
	}

	function currentBgVar() {
		return bgIndex()[passage()] || null;
	}

	function isCurrentRoomDark() {
		var name = currentBgVar();
		if (!name) return false;
		return setup.Rooms.isDark(name);
	}

	/* Clothing buckets. Fully dressed = tshirt + any bottom. Topless = no
	 * tshirt but a bottom. Fully nude = no tshirt, no bottom, no panties. */
	function clothingState() {
		var V = State.variables;
		var WORN = setup.ClothingState.WORN;
		var topOn    = V.tshirtState === WORN;
		var bottomOn = V.jeansState === WORN
			|| V.shortsState === WORN
			|| V.skirtState === WORN;
		var pantiesOn = V.pantiesState === WORN;
		if (!topOn && !bottomOn && !pantiesOn) return "nude";
		if (!topOn && bottomOn)                return "topless";
		if (topOn && bottomOn)                 return "dressed";
		return "partial";
	}

	function isBaitActive()       { return State.variables.baitActive === 1; }
	function isOverchargedMode()  { return State.variables.overchargedTools === 1; }

	/* Combined per-tick deltas + tool/hunt bonuses, plus a contributors
	 * array used by the HUD widget to show "why". */
	function snapshot() {
		var V = State.variables;
		var inHouse = !!(setup.HuntController && setup.HuntController.isHuntActive
			&& setup.HuntController.isHuntActive());
		var snap = {
			dark:              false,
			clothing:          clothingState(),
			overchargedTools:  isOverchargedMode(),
			baitActive:        isBaitActive(),
			baitStepsRemain:   V.baitStepsRemain || 0,
			sanityPerStep:     0,
			lustPerStep:       0,
			energyPerStep:     inHouse ? -ENERGY_PER_STEP : 0,
			corruptionPending: 0,
			timeLabel:         "paused",
			prowlChanceBonus:   0,
			toolChanceBonus:   0,
			toolWindowBonus:   0,
			contributors:      []
		};

		if (inHouse) {
			snap.timeLabel = "+1 min/step";
			var hasCompanion = V.isCompChosen === 1;
			var contractDrain = hasCompanion ? 0.2 : 0.4;
			snap.sanityPerStep -= contractDrain;
		}

		/* Hunt modifiers fold into the aggregated readouts
		   (lust/step, prowl%, etc.) via the SNAPSHOT filter so each
		   modifier's effect lives in ModifiersController, not here.
		   Filter subscribers do NOT push their own contributor chip —
		   the modifier name already shows in the Active Modifiers
		   panel with a hover tooltip describing the effect. */
		var modifierIds = (setup.HuntController && setup.HuntController.modifiers)
			? setup.HuntController.modifiers() : [];
		setup.Hunt.applyFilter(setup.Hunt.Event.SNAPSHOT, {
			snap: snap,
			modifierIds: modifierIds,
			inHouse: inHouse
		});

		if (isCurrentRoomDark()) {
			snap.dark = true;
			snap.sanityPerStep   -= 1;
			snap.prowlChanceBonus += 6;
			snap.toolChanceBonus += 10;
			snap.toolWindowBonus += 5;
			snap.contributors.push({
				label: "Dark",
				color: "#ff7777",
				detail: "tools +10%, +5 min · prowl +6%"
			});
		}

		if (snap.clothing === "topless") {
			snap.toolChanceBonus += 5;
			snap.lustPerStep     += 1;
			snap.prowlChanceBonus += 3;
			snap.contributors.push({
				label: "Topless",
				color: "#ff99cc",
				detail: "tools +5% · lust +1/step · prowl +3%"
			});
		} else if (snap.clothing === "nude") {
			snap.toolChanceBonus   += 10;
			snap.lustPerStep       += 2;
			snap.corruptionPending += 0.1;
			snap.prowlChanceBonus   += 5;
			snap.contributors.push({
				label: "Nude",
				color: "#ff66aa",
				detail: "tools +10% · lust +2/step · prowl +5% · corr banking"
			});
		}

		var mc = V.mc;
		if (mc && mc.lust >= LUST_FUEL_THRESHOLD) {
			snap.toolChanceBonus   += 5;
			snap.prowlChanceBonus   += 3;
			snap.corruptionPending += 0.05;
			snap.sanityPerStep     -= 0.2;
			snap.contributors.push({
				label: "Lust ≥ " + LUST_FUEL_THRESHOLD,
				color: "#e84aa4",
				detail: "tools +5% · prowl +3% · sanity -0.2/step · corr banking"
			});
		}

		/* Orgasm-primed: at max lust the MC is on the edge. Hard sanity
		 * bleed + corruption banking; the actual orgasm trigger lives in
		 * widgetEvent.tw (shouldOrgasm), which also seeds the aftershock
		 * cooldown below. */
		if (mc && mc.lust >= 100) {
			snap.sanityPerStep     -= 1;
			snap.corruptionPending += 0.05;
			snap.contributors.push({
				label: "OrgasmRisk",
				color: "#ff3366",
				detail: "sanity -1/step · corr banking"
			});
		}

		/* Orgasm aftershock: N steps of extra drain seeded by the orgasm
		 * trigger in widgetEvent.tw. Counter is decremented in
		 * applyTickEffects so the chip naturally clears. */
		var cooldown = V.orgasmCooldownSteps || 0;
		if (cooldown > 0) {
			snap.sanityPerStep -= 1;
			snap.energyPerStep -= 0.125;
			snap.contributors.push({
				label: "Aftershock (" + cooldown + ")",
				color: "#aa4477",
				detail: "sanity -1/step · energy -0.125/step"
			});
		}

		if (snap.overchargedTools) {
			snap.toolChanceBonus += 10;
			snap.toolWindowBonus += 5;
			snap.prowlChanceBonus += 5;
			snap.sanityPerStep   -= 1;
			snap.contributors.push({
				label: "Overcharged",
				color: "#ffaa33",
				detail: "tools +10%, +5 min · prowl +5% · sanity -1/step"
			});
		}

		if (snap.baitActive) {
			snap.toolChanceBonus += 20;
			snap.prowlChanceBonus += 20;
			snap.sanityPerStep   -= 1;
			snap.lustPerStep     += BAIT_LUST_PER_STEP;
			snap.contributors.push({
				label: "Baiting (" + snap.baitStepsRemain + ")",
				color: "#cc66ff",
				detail: "ghost pinned here · tools +20% · prowl +20% · lust +"
					+ BAIT_LUST_PER_STEP + "/step"
			});
		}

		return snap;
	}

	/* Apply per-nav-step effects. Called from includeTimeEvent* widgets so
	 * tool-tick spam doesn't double-charge stats. Mutates mc.sanity /
	 * mc.lust / mc.energy, accrues tempCorr, decrements bait counter, and
	 * sets V.exhausted when energy bottoms out (or V.sanityCollapse when
	 * sanity bottoms out) so the includeTimeEvent widget can route to
	 * HuntOverExhaustion / HuntOverSanity. Corresponding meters (sanity /
	 * energy) are refreshed by the caller. */
	function applyTickEffects() {
		var V = State.variables;
		var mc = V.mc;
		if (!mc) return;
		var inHouse = !!(setup.HuntController && setup.HuntController.isHuntActive
			&& setup.HuntController.isHuntActive());
		var snap = snapshot();

		if (snap.sanityPerStep !== 0) {
			if(setup.Mc.applySanityDelta(snap.sanityPerStep) == setup.SanityDeltaResult.COLLAPSED){
				V.sanityCollapse = 1;
			}
		}
		if (snap.lustPerStep !== 0) {
			/* Cap-overflow during bait routes to BaitOrgasm — see
			 * consumeBaitOrgasm. Only the bait flow flags this; other
			 * lust sources (topless/nude clothing tick) just clamp. */
			var baitAtCap = snap.baitActive && (mc.lust + snap.lustPerStep) >= 100;
			if (baitAtCap) {
				V.baitOrgasmPending = 1;
			}
			setup.Mc.applyLustDelta(snap.lustPerStep);
		}
		if (snap.energyPerStep !== 0) {
			setup.Mc.applyEnergyDelta(snap.energyPerStep);
			/* Per-step drain mirrors HauntConditions.removeEnergy: zero
			   energy stamps V.exhausted so includeTimeEvent* widgets can
			   route the next nav tick to HuntOverExhaustion. */
			if ((mc.energy || 0) <= 0) { V.exhausted = 1; }
		}
		if (snap.corruptionPending !== 0) {
			V.tempCorr = (V.tempCorr || 0) + snap.corruptionPending;
		}
		if (snap.baitActive) {
			V.baitStepsRemain = Math.max(0, (V.baitStepsRemain || 0) - 1);
			if (V.baitStepsRemain <= 0) {
				V.baitActive = 0;
				V.baitStepsRemain = 0;
			}
		}
		if ((V.orgasmCooldownSteps || 0) > 0) {
			/* Per-tick decrement is filterable so modifiers (Glass Bones)
			   and future contracts can stretch the aftershock window
			   without HuntConditions branching on each one. */
			var modifierIds = (setup.HuntController && setup.HuntController.modifiers)
				? setup.HuntController.modifiers() : [];
			var coolCtx = setup.Hunt.applyFilter(setup.Hunt.Event.AFTERSHOCK_COOLDOWN, {
				dec: 1,
				modifierIds: modifierIds
			});
			V.orgasmCooldownSteps -= coolCtx.dec;
			if (V.orgasmCooldownSteps < 0) V.orgasmCooldownSteps = 0;
		}
		if (inHouse && typeof setup.addTime === 'function') {
			setup.addTime(1);
		}
	}

	/* Spend ad-hoc energy for a player-driven action (bait, pray).
	 * Returns true on success, false when not enough energy. Sets
	 * V.exhausted at zero so the next nav tick routes to exhaustion. */
	function removeEnergy(amount) {
		var V = State.variables;
		var mc = V.mc;
		if (!mc) return false;
		if ((mc.energy || 0) < amount) return false;
		mc.energy -= amount;
		if (mc.energy <= 0) {
			mc.energy = 0;
			V.exhausted = 1;
		}
		return true;
	}

	/* Resolve a pending bait orgasm: drop sanity, reset lust to zero. The
	 * bait counter is intentionally NOT cleared — the ghost stays pinned
	 * for the rest of the contract window per spec. Returns true when an
	 * orgasm was actually pending so callers can branch on the result. */
	function consumeBaitOrgasm() {
		var V = State.variables;
		if (V.baitOrgasmPending !== 1) return false;
		V.baitOrgasmPending = 0;
		var mc = V.mc;
		if (!mc) return true;
		mc.lust = 0;
		setup.Mc.clampLust();
		var outcome = setup.Mc.applySanityDelta(-BAIT_ORGASM_SANITY);
		if (outcome === setup.SanityDeltaResult.COLLAPSED) {
			V.sanityCollapse = 1;
		}
		return true;
	}

	function isBaitOrgasmPending() {
		return State.variables.baitOrgasmPending === 1;
	}

	/* Player-driven bait: spend energy, pin the ghost to the player's
	 * room for BAIT_STEPS nav ticks, and stamp BAIT_INITIAL_LUST onto
	 * the MC. The +20 can itself trip an orgasm when lust was already
	 * at 100 — the caller should check isBaitOrgasmPending() right
	 * after to route to BaitOrgasm. Returns true when the start fires. */
	function startBait() {
		var V = State.variables;
		var mc = V.mc;
		if (!mc) return false;
		if ((mc.energy || 0) < ENERGY_COST_BAIT) return false;
		if (!setup.HuntController || !setup.HuntController.snapGhostToCurrentRoom
			|| !setup.HuntController.snapGhostToCurrentRoom()) {
			return false;
		}
		removeEnergy(ENERGY_COST_BAIT);
		V.baitActive = 1;
		V.baitStepsRemain = BAIT_STEPS;
		var atCap = mc.lust >= 100;
		setup.Mc.applyLustDelta(BAIT_INITIAL_LUST);
		if (atCap) {
			V.baitOrgasmPending = 1;
		}
		return true;
	}

	function canBait() {
		var V = State.variables;
		if (!setup.HuntController || !setup.HuntController.isHuntActive
			|| !setup.HuntController.isHuntActive()) {
			return false;
		}
		/* Modifiers (Not Their Type) and future contracts can veto bait
		   via the BAIT_ALLOWED filter. Default allowed; subscriber sets
		   ctx.allowed=false to gate the action out. */
		var modifierIds = setup.HuntController.modifiers
			? setup.HuntController.modifiers() : [];
		var baitCtx = setup.Hunt.applyFilter(setup.Hunt.Event.BAIT_ALLOWED, {
			allowed: true,
			modifierIds: modifierIds
		});
		if (!baitCtx.allowed) return false;
		return !!(V.mc
			&& (V.mc.energy || 0) >= ENERGY_COST_BAIT
			&& V.baitActive !== 1);
	}

	/* Pray (used by GhostHuntEvent). Costs sanity AND energy. */
	function canPray() {
		var V = State.variables;
		return !!(V.mc
			&& V.mc.sanity > 10
			&& (V.mc.energy || 0) >= ENERGY_COST_PRAY);
	}

	function toggleOverchargedTools() {
		var V = State.variables;
		V.overchargedTools = V.overchargedTools === 1 ? 0 : 1;
		return V.overchargedTools === 1;
	}

	/* Point-of-event sanity multiplier. Used by ArtEvent / EventMC "embrace"
	 * drains so the same active axes the HUD already shows (dark,
	 * overcharged) also scale fixed event drains. Keeps the two worlds
	 * reading the same state. */
	function eventSanityMultiplier() {
		var mult = 1;
		if (isCurrentRoomDark())  mult += 0.5;
		if (isOverchargedMode())  mult += 0.25;
		/* Modifier contributions (Brittle Mind) and future event-drain
		   stackers live in ModifiersController subscribers. They read
		   the dark/overcharged context to decide whether to compound. */
		var modifierIds = (setup.HuntController && setup.HuntController.modifiers)
			? setup.HuntController.modifiers() : [];
		var ctx = setup.Hunt.applyFilter(setup.Hunt.Event.SANITY_EVENT_MULT, {
			mult: mult,
			modifierIds: modifierIds,
			dark: isCurrentRoomDark(),
			overcharged: isOverchargedMode()
		});
		return ctx.mult;
	}

	/* Called from HuntEnd / HuntOverManual / HuntOverTime / HuntOverSanity
	 * /HuntOverExhaustion to scrub hunt-only flags so the next contract
	 * starts clean. */
	function resetHuntFlags() {
		var V = State.variables;
		V.baitActive          = 0;
		V.baitStepsRemain     = 0;
		V.baitOrgasmPending   = 0;
		V.overchargedTools    = 0;
		V.exhausted           = 0;
		V.sanityCollapse      = 0;
		V.orgasmCooldownSteps = 0;
	}

	return {
		LUST_FUEL_THRESHOLD:    LUST_FUEL_THRESHOLD,
		BAIT_INITIAL_LUST:      BAIT_INITIAL_LUST,
		BAIT_LUST_PER_STEP:     BAIT_LUST_PER_STEP,
		BAIT_STEPS:             BAIT_STEPS,
		BAIT_ORGASM_SANITY:     BAIT_ORGASM_SANITY,
		ENERGY_PER_STEP:        ENERGY_PER_STEP,
		ENERGY_COST_BAIT:       ENERGY_COST_BAIT,
		ENERGY_COST_PRAY:       ENERGY_COST_PRAY,
		currentBgVar:           currentBgVar,
		isCurrentRoomDark:      isCurrentRoomDark,
		clothingState:          clothingState,
		snapshot:               snapshot,
		applyTickEffects:       applyTickEffects,
		removeEnergy:           removeEnergy,
		isBaitActive:           isBaitActive,
		startBait:              startBait,
		canBait:                canBait,
		canPray:                canPray,
		isBaitOrgasmPending:    isBaitOrgasmPending,
		consumeBaitOrgasm:      consumeBaitOrgasm,
		toggleOverchargedTools: toggleOverchargedTools,
		isOverchargedMode:      isOverchargedMode,
		eventSanityMultiplier:  eventSanityMultiplier,
		resetHuntFlags:         resetHuntFlags
	};
})();
