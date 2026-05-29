/*
 * End-of-hunt payout, classification, and summary.
 *
 * Split out of HuntController so the lifecycle file isn't carrying
 * the contract / rogue payout math. Every function here is a pure
 * read off a passed-in `run` snapshot plus calls to Mc / HuntShop /
 * WitchContract setters -- nothing mutates $run directly, so the
 * lifecycle controller stays the only writer of run-shape state.
 *
 *   classify(run, success)        -> { mult, isContractHunt, ... }
 *   applyRewards(cls, success, run) -> { cashPayout, ectoplasmPayout, xpReward }
 *   buildSummary(run, cls, payout, success) -> view-layer record
 *   settle(run, success)          -> summary (composes the three above)
 *   restorePreRunStatCaps(run)    -> snap sanity/energy caps back
 *   exitPassageForOutcome(success, reason) -> "HuntOver*" / "Sleep" / "CityMap"
 *
 * HuntController.endHunt() drives the flow; cleanupRunState calls
 * restorePreRunStatCaps directly so the stat-cap snapshot is restored
 * regardless of payout shape.
 *
 * Loads alphabetically AFTER HuntController.js (HuntC < HuntP). All
 * setup.HuntEnums / setup.HuntController / setup.HuntShop references
 * resolve at call time.
 */
setup.HuntPayout = (function () {
	/* Map a (success, failureReason) pair to the passage the hunt
	   should land on after endHunt fires. Successful runs and failures
	   without a dedicated HuntOver* screen fall back to CityMap.

	   CAUGHT routes to Sleep so the prowl-blackout narration ("fading
	   into darkness", "plunging you into darkness") flows into the
	   bedroom cum-covered wake-up (Bedroom.returningFromHuntDefeat)
	   instead of dropping the MC -- still mid-blackout -- onto the
	   city map. */
	function exitPassageForOutcome(success, reason) {
		if (success) return "CityMap";
		var FR = setup.HuntEnums.FailureReason;
		if (reason === FR.SANITY) return "HuntOverSanity";
		if (reason === FR.EXHAUSTION) return "HuntOverExhaustion";
		if (reason === FR.TIME) return "HuntOverTime";
		if (reason === FR.CAUGHT) return "Sleep";
		return "CityMap";
	}

	/* Classify the run for payout purposes. Three buckets matter:

		 * isContractHunt -- the held contract key matches the run's
		   static house. Contract hunts pay the contract's cash and
		   no ecto; rogue hunts pay cash + ecto.
		 * fledRogue -- the player walked away from a rogue hunt
		   (not a ghost-driven defeat). Pays nothing -- no consolation
		   ecto, no xp. Other rogue failures (sanity, exhaustion,
		   time, caught) still get the small consolation.
		 * mult -- the PAYOUT filter's modifier multiplier on cash /
		   ecto / xp. Default 1.0 when no modifier subscribes. */
	function classify(run, success) {
		var payCtx = setup.Hunt.applyFilter(setup.Hunt.Event.PAYOUT, {
			multiplier: 1,
			modifierIds: (run.modifiers || []).slice(),
			success: !!success
		});
		var mult = (typeof payCtx.multiplier === 'number') ? payCtx.multiplier : 1;
		var heldId = setup.WitchContract.heldHouseId();
		var isContractHunt = !!run.staticHouseId && heldId === run.staticHouseId;
		var fledRogue = !isContractHunt
			&& !success
			&& run.failureReason === setup.HuntEnums.FailureReason.FLED;
		return {
			mult: mult,
			isContractHunt: isContractHunt,
			contractHouseId: isContractHunt ? heldId : null,
			fledRogue: fledRogue
		};
	}

	/* Settle and apply the run's rewards. Contract hunts burn the held
	   contract for its cash payout on success / nothing on a wrong
	   call; any other failure (caught, sanity, exhaustion, time, fled,
	   abandon) DEFERS resolution -- the true ghost identity is stashed
	   on the held slot so the player can walk back to Khadija the
	   next day and still make her call. Rogue hunts pay base 50 cash
	   + 10 ecto on success and 3 ecto on failure. XP splits: contract
	   hunts pay the tier-scaled contract reward (Owaissa 15 / Elm 25 /
	   Ironclad 40 on success, 0 on failure) instead of the flat rogue
	   formula -- the contract IS the achievement, not the kill. Rogue
	   hunts pay 20 success / 5 fail / 0 flee. Contract XP is NOT
	   multiplied by the modifier payout multiplier (the tier already
	   encodes difficulty). */
	function applyRewards(classification, success, run) {
		var mult = classification.mult;
		var cashPayout = 0;
		var ectoplasmPayout = 0;
		var xpReward = 0;
		if (classification.isContractHunt) {
			var FR = setup.HuntEnums.FailureReason;
			var deferGuess = !success
				&& run && run.failureReason !== FR.WRONG_CALL;
			if (deferGuess) {
				/* Hunt ended without a call -- stash the ghost identity
				   so the player can come back to Khadija and guess at
				   her desk. Contract stays held; no money or XP paid
				   now (those settle at settlePendingGuess). */
				setup.WitchContract.markHeldPendingGuess(run.ghostName);
			} else {
				var contractPayout = setup.WitchContract.resolveHeld(!!success);
				cashPayout = Math.round(contractPayout * mult);
				xpReward = setup.WitchContract.xpRewardFor(classification.contractHouseId, !!success);
			}
		} else if (!classification.fledRogue) {
			cashPayout = Math.round((success ? 50 : 0) * mult);
			ectoplasmPayout = Math.round((success ? 10 : 3) * mult);
			xpReward = Math.round((success ? 20 : 5) * mult);
		}
		if (cashPayout > 0) setup.Mc.addMoney(cashPayout);
		if (ectoplasmPayout > 0) setup.HuntController.addEctoplasm(ectoplasmPayout);
		if (xpReward > 0) setup.Mc.grantExp(xpReward);
		return { cashPayout: cashPayout, ectoplasmPayout: ectoplasmPayout, xpReward: xpReward };
	}

	/* Pure summary builder -- packages the data HuntSummary / result
	   passages render. exitPassage routes the caller to the right
	   HuntOver* screen based on success + failureReason. */
	function buildSummary(run, classification, payout, success) {
		return {
			seed: run.seed,
			number: run.number,
			modifiers: (run.modifiers || []).slice(),
			objective: run.objective,
			failureReason: run.failureReason || null,
			success: !!success,
			isContractHunt: classification.isContractHunt,
			cashPayout: payout.cashPayout,
			ectoplasmPayout: payout.ectoplasmPayout,
			payout: payout.cashPayout + payout.ectoplasmPayout,
			xp: payout.xpReward,
			exitPassage: exitPassageForOutcome(!!success, run.failureReason || null)
		};
	}

	/* One-shot composition for HuntController.endHunt: classify the
	   run, apply payout side-effects, return the view-layer summary
	   the result passages render. */
	function settle(run, success) {
		var classification = classify(run, success);
		var payout = applyRewards(classification, success, run);
		return buildSummary(run, classification, payout, success);
	}

	/* Snap sanity / energy maxes back to whatever the player walked in
	   with. Modifiers like Steeled Hand / Calves of Steel bump caps
	   for the duration of a run; energyMax in particular can also be
	   permanently raised by fitness, so we always restore from the
	   per-run snapshot rather than guessing a baseline. Current values
	   clamp to the restored cap so a fresh hunt doesn't start with a
	   125-out-of-100 bar. */
	function restorePreRunStatCaps(run) {
		var caps = run.preRunStatCaps;
		if (!caps) return;
		setup.Mc.setSanityMax(caps.sanityMax);
		setup.Mc.setEnergyMax(caps.energyMax);
		if (setup.Mc.sanity() > caps.sanityMax) setup.Mc.setSanity(caps.sanityMax);
		if (setup.Mc.energy() > caps.energyMax) setup.Mc.setEnergy(caps.energyMax);
	}

	return {
		exitPassageForOutcome: exitPassageForOutcome,
		classify: classify,
		applyRewards: applyRewards,
		buildSummary: buildSummary,
		settle: settle,
		restorePreRunStatCaps: restorePreRunStatCaps
	};
})();
