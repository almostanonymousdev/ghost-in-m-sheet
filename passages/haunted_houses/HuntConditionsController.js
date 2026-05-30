/* setup.HauntConditions -- single source of truth for the hunt-mechanics
 * rework. Resolves the player's current haunted-house room from the running
 * passage, aggregates every axis (darkness, clothing, lust, overcharged
 * tools, bait) into one snapshot, and exposes it to:
 *   - huntConditions HUD (per-step stat deltas above the tool bar)
 *   - setup.ToolController.toolSuccessRate (hover tooltip on each tool card)
 *   - setup.ToolController.chanceByTier / .toolTimeRemain (actual tool rolls)
 *   - huntTickEventChain (random-hunt threshold)
 *   - applyTickEffects (per-nav-step sanity/lust/corruption drain)
 * Each axis pushes into contributors[] so the HUD can render a badge row
 * alongside the aggregated numbers. Keep new knobs HERE so the HUD numbers
 * and the underlying mechanics never drift apart. */
setup.HauntConditions = (function () {
	/* HauntConditions owns the per-hunt mechanic state it manages
	   directly: the bait window (active flag, steps remaining,
	   pending-orgasm signal) and the overcharged-tools toggle. Other
	   per-step state it reads/writes (sanity / lust / energy / tempCorr
	   / orgasmCooldown / exhaustion / sanity-collapse flags) belongs to
	   McController and is touched through setup.Mc's API. */
	var OWNED_VARS = Object.freeze([
		'baitActive', 'baitStepsRemain', 'baitOrgasmPending',
		'overchargedTools'
	]);

	var LUST_FUEL_THRESHOLD = 50;   // passive evidence bonus when lust >= this
	var BAIT_INITIAL_LUST_MIN = 10;   // lust the bait click stamps onto the MC (rolled)
	var BAIT_INITIAL_LUST_MAX = 50;
	var BAIT_LUST_PER_STEP_MIN = 5;   // lust accrued each remaining bait step (rolled per step)
	var BAIT_LUST_PER_STEP_MAX = 15;
	var BAIT_STEPS = 3;    // nav ticks the ghost is pinned to you
	var BAIT_ORGASM_SANITY = 10;   // sanity lost when bait pushes lust past the cap
	var ORGASM_COOLDOWN_STEPS = 3;  // aftershock window seeded after any orgasm trigger

	function randInt(lo, hi) {
		return lo + Math.floor(Math.random() * (hi - lo + 1));
	}

	/* Energy as the pacing gate: every nav tick inside a haunted house
	 * burns ENERGY_PER_STEP, capping the total room-search budget per
	 * contract. Spendable actions (bait, pray) charge their own energy
	 * on top of their named cost. Energy at 0 kicks the player out via
	 * HuntOverExhaustion. */
	var ENERGY_PER_STEP = 0.125;
	var ENERGY_COST_BAIT = 0.5;
	var ENERGY_COST_PRAY = 0.5;

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
		if (setup.Wardrobe.isFullyNude()) return "nude";
		if (setup.Wardrobe.isTopless()) return "topless";
		if (setup.Wardrobe.isFullyDressed()) return "dressed";
		return "partial";
	}

	function isBaitActive() { return State.variables.baitActive === true; }
	function isOverchargedMode() { return State.variables.overchargedTools === true; }

	/* Combined per-tick deltas + tool/hunt bonuses, plus a contributors
	 * array used by the HUD widget to show "why". */
	function snapshot() {
		var V = State.variables;
		var inHouse = !!(setup.HuntController && setup.HuntController.isHuntActive
			&& setup.HuntController.isHuntActive());
		var snap = {
			dark: false,
			clothing: clothingState(),
			overchargedTools: isOverchargedMode(),
			baitActive: isBaitActive(),
			baitStepsRemain: V.baitStepsRemain || 0,
			sanityPerStep: 0,
			lustPerStep: 0,
			energyPerStep: inHouse ? -ENERGY_PER_STEP : 0,
			corruptionPending: 0,
			timeLabel: "paused",
			prowlChanceBonus: 0,
			toolChanceBonus: 0,
			toolWindowBonus: 0,
			contributors: []
		};

		if (inHouse) {
			snap.timeLabel = "+1 min/step";
			var hasCompanion = setup.Companion.isCompanionFlagActive();
			var contractDrain = hasCompanion ? 0.2 : 0.4;
			snap.sanityPerStep -= contractDrain;

			/* Time-of-hunt prowl ramp. Hunts start at midnight
			   (totalMinutes = 0) and run to hour 6 = 360 minutes.
			   +1% prowl chance per 20 elapsed minutes, capped at
			   +18%, makes time the dominant driver of escalation —
			   early hunt is quiet, late hunt is dangerous. Stat /
			   clothing contributors below layer smaller bumps on
			   top. */
			var elapsed = (setup.Time && setup.Time.totalMinutes)
				? setup.Time.totalMinutes() : 0;
			var timeBonus = Math.min(18, Math.floor(elapsed / 20));
			if (timeBonus > 0) {
				snap.prowlChanceBonus += timeBonus;
			}
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
			snap.sanityPerStep -= 1;
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
			snap.lustPerStep += 1;
			snap.prowlChanceBonus += 3;
			snap.contributors.push({
				label: "Topless",
				color: "#ff99cc",
				detail: "tools +5% · lust +1/step · prowl +3%"
			});
		} else if (snap.clothing === "nude") {
			snap.toolChanceBonus += 10;
			snap.lustPerStep += 2;
			snap.corruptionPending += 0.1;
			snap.prowlChanceBonus += 5;
			snap.contributors.push({
				label: "Nude",
				color: "#ff66aa",
				detail: "tools +10% · lust +2/step · prowl +5% · corr banking"
			});
		}

		var mcLust = setup.Mc.lust();
		if (mcLust >= LUST_FUEL_THRESHOLD) {
			snap.toolChanceBonus += 5;
			snap.prowlChanceBonus += 3;
			snap.corruptionPending += 0.05;
			snap.sanityPerStep -= 0.2;
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
		if (mcLust >= 100) {
			snap.sanityPerStep -= 1;
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
		var cooldown = setup.Mc.orgasmCooldown() || 0;
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
			snap.sanityPerStep -= 3;
			snap.contributors.push({
				label: "Overcharged",
				color: "#ffaa33",
				detail: "tools +10%, +5 min · prowl +5% · sanity -3/step"
			});
		}

		if (snap.baitActive) {
			snap.prowlChanceBonus += 20;
			snap.sanityPerStep -= 1;
			/* Per-step lust is rolled fresh in applyTickEffects so each tick
			   varies; the HUD reads the midpoint here for a stable readout,
			   and the contributor detail shows the range. */
			snap.lustPerStep += (BAIT_LUST_PER_STEP_MIN + BAIT_LUST_PER_STEP_MAX) / 2;
			snap.contributors.push({
				label: "Baiting (" + snap.baitStepsRemain + ")",
				color: "#cc66ff",
				detail: "ghost pinned here · prowl +20% · lust +"
					+ BAIT_LUST_PER_STEP_MIN + "-" + BAIT_LUST_PER_STEP_MAX + "/step"
			});
		}

		/* commitTempCorruption caps the per-hunt corruption commit
		   at +1, so anything banked past that is silently discarded.
		   Once $tempCorr has reached the ceiling, surface a 0/step
		   reading so the HUD stops promising gains that the cap will
		   eat -- and applyTickEffects below skips its no-op write. */
		if ((setup.Mc.tempCorr() || 0) >= 1) {
			snap.corruptionPending = 0;
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
		if (!setup.Mc.isReady()) return;
		var inHouse = !!(setup.HuntController && setup.HuntController.isHuntActive
			&& setup.HuntController.isHuntActive());
		var snap = snapshot();

		if (snap.sanityPerStep !== 0) {
			if (setup.Mc.addSanity(snap.sanityPerStep) == setup.SanityDeltaResult.COLLAPSED) {
				setup.Mc.markSanityCollapsed();
			}
		}
		if (snap.lustPerStep !== 0) {
			/* Bait's per-step lust is variable: snapshot pushed the midpoint
			   for HUD continuity, but the actual delta is rolled fresh here.
			   Swap the midpoint out for the roll before applying so the cap
			   check and the addLust call both see the real value. */
			var lustDelta = snap.lustPerStep;
			if (snap.baitActive) {
				var midpoint = (BAIT_LUST_PER_STEP_MIN + BAIT_LUST_PER_STEP_MAX) / 2;
				lustDelta = lustDelta - midpoint + randInt(BAIT_LUST_PER_STEP_MIN, BAIT_LUST_PER_STEP_MAX);
			}
			/* Cap-overflow during bait routes to BaitOrgasm — see
			 * consumeBaitOrgasm. Only the bait flow flags this; other
			 * lust sources (topless/nude clothing tick) just clamp. */
			var baitAtCap = snap.baitActive && (setup.Mc.lust() + lustDelta) >= 100;
			if (baitAtCap) {
				V.baitOrgasmPending = true;
			}
			setup.Mc.addLust(lustDelta);
		}
		if (snap.energyPerStep !== 0) {
			setup.Mc.addEnergy(snap.energyPerStep);
			/* Per-step drain mirrors HauntConditions.removeEnergy: zero
			   energy stamps the MC's exhausted flag so includeTimeEvent*
			   widgets can route the next nav tick to HuntOverExhaustion. */
			if ((setup.Mc.energy() || 0) <= 0) { setup.Mc.markExhausted(); }
		}
		if (snap.corruptionPending !== 0) {
			setup.Mc.addTempCorr(snap.corruptionPending);
		}
		if (snap.baitActive) {
			V.baitStepsRemain = Math.max(0, (V.baitStepsRemain || 0) - 1);
			if (V.baitStepsRemain <= 0) {
				V.baitActive = false;
				V.baitStepsRemain = 0;
			}
		}
		var cool = setup.Mc.orgasmCooldown() || 0;
		if (cool > 0) {
			/* Per-tick decrement is filterable so modifiers (Glass Bones)
			   and future contracts can stretch the aftershock window
			   without HuntConditions branching on each one. */
			var modifierIds = (setup.HuntController && setup.HuntController.modifiers)
				? setup.HuntController.modifiers() : [];
			var coolCtx = setup.Hunt.applyFilter(setup.Hunt.Event.AFTERSHOCK_COOLDOWN, {
				dec: 1,
				modifierIds: modifierIds
			});
			var next = cool - coolCtx.dec;
			setup.Mc.setOrgasmCooldown(next < 0 ? 0 : next);
		}
		if (inHouse && typeof setup.addTime === 'function') {
			setup.addTime(1);
		}
	}

	/* Spend ad-hoc energy for a player-driven action (bait, pray).
	 * Returns true on success, false when not enough energy. Sets
	 * V.exhausted at zero so the next nav tick routes to exhaustion. */
	function removeEnergy(amount) {
		if (!setup.Mc.isReady()) return false;
		if ((setup.Mc.energy() || 0) < amount) return false;
		setup.Mc.addEnergy(-amount);
		if ((setup.Mc.energy() || 0) <= 0) {
			setup.Mc.markExhausted();
		}
		return true;
	}

	/* Resolve a pending bait orgasm: drop sanity, reset lust to zero, and
	 * seed the aftershock cooldown so the HUD's Aftershock chip and the
	 * per-step drain land the same way they do after a widgetEvent.tw
	 * orgasm trigger. The bait counter is intentionally NOT cleared — the
	 * ghost stays pinned for the rest of the contract window per spec.
	 * Returns true when an orgasm was actually pending so callers can
	 * branch on the result. */
	function consumeBaitOrgasm() {
		var V = State.variables;
		if (V.baitOrgasmPending !== true) return false;
		V.baitOrgasmPending = false;
		if (!setup.Mc.isReady()) return true;
		setup.Mc.setLust(0);
		var outcome = setup.Mc.addSanity(-BAIT_ORGASM_SANITY);
		if (outcome === setup.SanityDeltaResult.COLLAPSED) {
			setup.Mc.markSanityCollapsed();
		}
		setup.Mc.setOrgasmCooldown(ORGASM_COOLDOWN_STEPS);
		return true;
	}

	function isBaitOrgasmPending() {
		return State.variables.baitOrgasmPending === true;
	}

	/* Player-driven bait: spend energy, pin the ghost to the player's
	 * room for BAIT_STEPS nav ticks, and stamp a rolled chunk of lust
	 * onto the MC. The initial dose can itself trip an orgasm when lust
	 * was already at 100 — the caller should check isBaitOrgasmPending()
	 * right after to route to BaitOrgasm. Returns true when the start
	 * fires. */
	function startBait() {
		var V = State.variables;
		if (!setup.Mc.isReady()) return false;
		if ((setup.Mc.energy() || 0) < ENERGY_COST_BAIT) return false;
		if (!setup.HuntController || !setup.HuntController.snapGhostToCurrentRoom
			|| !setup.HuntController.snapGhostToCurrentRoom()) {
			return false;
		}
		removeEnergy(ENERGY_COST_BAIT);
		V.baitActive = true;
		V.baitStepsRemain = BAIT_STEPS;
		var atCap = setup.Mc.lust() >= 100;
		setup.Mc.addLust(randInt(BAIT_INITIAL_LUST_MIN, BAIT_INITIAL_LUST_MAX));
		if (atCap) {
			V.baitOrgasmPending = true;
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
		return setup.Mc.isReady()
			&& (setup.Mc.energy() || 0) >= ENERGY_COST_BAIT
			&& V.baitActive !== true;
	}

	/* Pray (used by GhostProwlEvent). Costs sanity AND energy. */
	function canPray() {
		if (!setup.Mc.isReady()) return false;
		return setup.Mc.sanity() > 10
			&& (setup.Mc.energy() || 0) >= ENERGY_COST_PRAY;
	}

	function toggleOverchargedTools() {
		var V = State.variables;
		V.overchargedTools = !(V.overchargedTools === true);
		return V.overchargedTools === true;
	}

	/* Point-of-event sanity multiplier. Used by ArtEvent / EventMC "embrace"
	 * drains so the same active axes the HUD already shows (dark,
	 * overcharged) also scale fixed event drains. Keeps the two worlds
	 * reading the same state. */
	function eventSanityMultiplier() {
		var mult = 1;
		if (isCurrentRoomDark()) mult += 0.5;
		if (isOverchargedMode()) mult += 0.25;
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

	/* Called from HuntOverProwl / HuntOverManual / HuntOverTime / HuntOverSanity
	 * /HuntOverExhaustion to scrub hunt-only flags so the next contract
	 * starts clean. */
	function resetHuntFlags() {
		var V = State.variables;
		V.baitActive = false;
		V.baitStepsRemain = 0;
		V.baitOrgasmPending = false;
		V.overchargedTools = false;
		setup.Mc.clearExhausted();
		setup.Mc.clearSanityCollapse();
		setup.Mc.setOrgasmCooldown(0);
	}

	return {
		OWNED_VARS: OWNED_VARS,
		LUST_FUEL_THRESHOLD: LUST_FUEL_THRESHOLD,
		BAIT_INITIAL_LUST_MIN: BAIT_INITIAL_LUST_MIN,
		BAIT_INITIAL_LUST_MAX: BAIT_INITIAL_LUST_MAX,
		BAIT_LUST_PER_STEP_MIN: BAIT_LUST_PER_STEP_MIN,
		BAIT_LUST_PER_STEP_MAX: BAIT_LUST_PER_STEP_MAX,
		BAIT_STEPS: BAIT_STEPS,
		BAIT_ORGASM_SANITY: BAIT_ORGASM_SANITY,
		ENERGY_PER_STEP: ENERGY_PER_STEP,
		ENERGY_COST_BAIT: ENERGY_COST_BAIT,
		ENERGY_COST_PRAY: ENERGY_COST_PRAY,
		currentBgVar: currentBgVar,
		isCurrentRoomDark: isCurrentRoomDark,
		clothingState: clothingState,
		snapshot: snapshot,
		applyTickEffects: applyTickEffects,
		removeEnergy: removeEnergy,
		isBaitActive: isBaitActive,
		startBait: startBait,
		canBait: canBait,
		canPray: canPray,
		isBaitOrgasmPending: isBaitOrgasmPending,
		consumeBaitOrgasm: consumeBaitOrgasm,
		toggleOverchargedTools: toggleOverchargedTools,
		isOverchargedMode: isOverchargedMode,
		eventSanityMultiplier: eventSanityMultiplier,
		resetHuntFlags: resetHuntFlags
	};
})();
