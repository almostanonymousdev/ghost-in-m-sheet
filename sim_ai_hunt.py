#!/usr/bin/env python3
"""
Simplistic AI that plays through an Elm Street hunt against a fixed ghost type.

Models the core hunt loop from Ghost in M'Sheet:

  - Ghost picks a favorite room from Elm's 9-room list at contract start
    and can switch rooms every 20 in-game minutes with 35% probability
    (ChangeGhostRoom.tw / HauntedHouses.rollStartingRoom).
  - Navigating between rooms costs 0.25 energy per step (HauntConditions
    ENERGY_PER_STEP); the contract ends when energy bottoms out.
  - Evidence detection uses the same tier-based chance table as the game:
      * gwb / plasm / spiritbox:  tier 3 -> 35%, tier 4 -> 25%, tier 5 -> 15%
        (setup.TIER_CHANCE in StoryScript.tw)
      * emf / uvl:                timed tools - require activation; read
        positive while their window is open AND the ghost has that evidence
      * temperature:              passive; fires when in the ghost's room and
        the ghost has temperature evidence

  - Haunt conditions (HauntConditions.snapshot) layered on top of each tick:
      * lights off (dark):   sanity -1/step, tool chance +10%, hunt +6%
      * topless:             lust +1/step, tool +5%, hunt +3%
      * nude:                lust +2/step, tool +10%, hunt +5%
      * lust >= 50:          tool +5%, hunt +3%
      * overcharged tools:   tool +10%, tool window +5, hunt +5%, sanity -1/step
  - Ghost hunts (CheckHuntStart.tw): each nav tick rolls random(0,100) <=
    6 + huntChanceBonus. If the ghost's canHunt(mc) gate is also satisfied,
    a hunt fires. The AI hides; ghost-specific override rules (Deogen,
    Jinn) apply via runningSucceeds / hidingSucceeds.
  - Exit reasons tracked: identified, energy, sanity_zero (HuntOverSanity),
    caught_in_hunt (HuntEnd), search_timeout.

Simple AI patterns:
  1) "Find ghost's favorite room" - walk rooms with lights ON (safe),
     take temperature readings; elevated reading (>= 18) means ghost room.
  2) "Scan for evidence in the ghost's room" - turn lights off for the
     tool bonus, scan every tool each round, revert lights if sanity gets
     dangerous. If evidence is still incomplete and the ghost relocates,
     drop back to pattern 1.
  3) "Respond to hunt" - on a hunt event, hide (ghost overrides aside).

Usage:
    python3 sim_ai_hunt.py                   # Phantom, 10000 runs, tier 3
    python3 sim_ai_hunt.py Goryo 50000 4     # different ghost / trials / tier
"""

from __future__ import annotations

import random
import sys
from dataclasses import dataclass, field


ELM_ROOMS = [
    "kitchen", "bathroom", "bedroom", "nursery", "hallway",
    "hallwayUpstairs", "bedroomTwo", "bathroomTwo", "basement",
]

# Evidence triples from GhostController.tw. Mimic's "extra glass" bonus is
# ignored here (the simulation identifies by the canonical triple).
GHOST_EVIDENCE: dict[str, frozenset[str]] = {
    "Shade":       frozenset({"emf", "gwb", "temperature"}),
    "Spirit":      frozenset({"emf", "spiritbox", "gwb"}),
    "Poltergeist": frozenset({"spiritbox", "gwb", "uvl"}),
    "Phantom":     frozenset({"glass", "uvl", "spiritbox"}),
    "Goryo":       frozenset({"glass", "uvl", "emf"}),
    "Demon":       frozenset({"gwb", "uvl", "temperature"}),
    "Deogen":      frozenset({"glass", "gwb", "spiritbox"}),
    "Jinn":        frozenset({"emf", "uvl", "temperature"}),
    "Moroi":       frozenset({"gwb", "temperature", "spiritbox"}),
    "Myling":      frozenset({"gwb", "emf", "uvl"}),
    "Oni":         frozenset({"glass", "emf", "temperature"}),
    "Mimic":       frozenset({"uvl", "temperature", "spiritbox"}),
    "The Twins":   frozenset({"emf", "temperature", "spiritbox"}),
    "Wraith":      frozenset({"glass", "emf", "spiritbox"}),
    "Mare":        frozenset({"glass", "gwb", "temperature"}),
    "Cthulion":    frozenset({"spiritbox", "glass", "temperature"}),
    "Banshee":     frozenset({"glass", "gwb", "uvl"}),
    "Raiju":       frozenset({"emf", "spiritbox", "uvl"}),
}

# Per-ghost hunt conditions (GhostController.tw huntCondition). Lambdas over
# the mc state. Only the ones used by this sim are included.
# ("sanity_max", T) fires when sanity <= T; ("lust_min", T) when lust >= T.
GHOST_HUNT_COND: dict[str, tuple[str, int]] = {
    "Shade":       ("sanity_max", 35),
    "Spirit":      ("lust_min",   50),
    "Poltergeist": ("sanity_max", 50),
    "Phantom":     ("sanity_max", 50),
    "Goryo":       ("lust_min",   50),
    "Demon":       ("sanity_max", 70),
    "Deogen":      ("sanity_max", 50),
    "Jinn":        ("sanity_max", 50),
    "Moroi":       ("sanity_max", 50),
    "Myling":      ("lust_min",   50),
    "Oni":         ("lust_min",   50),
    "Mimic":       ("sanity_max", 50),
    "The Twins":   ("lust_min",   50),
    "Wraith":      ("lust_min",   50),
    "Mare":        ("lust_min",   50),
    "Cthulion":    ("sanity_max", 50),
    "Banshee":     ("lust_min",   50),
    "Raiju":       ("sanity_max", 50),
}


def can_hunt(name: str, sanity: float, lust: float) -> bool:
    kind, threshold = GHOST_HUNT_COND[name]
    return sanity <= threshold if kind == "sanity_max" else lust >= threshold

# Ghost override rules for Hide.tw / RunFast.tw. None = default 50/50 roll.
GHOST_HIDE_SUCCESS = {"Deogen": False, "Jinn": True}
GHOST_RUN_SUCCESS  = {"Deogen": True,  "Jinn": False}

# setup.TIER_CHANCE (per-roll success for gwb / plasm / spiritbox).
TIER_CHANCE = {5: 0.15, 4: 0.25, 3: 0.35}

# setup.TOOL_TIME_REMAIN (in-game minutes the emf / uvl window stays open).
TOOL_WINDOW = {5: 10, 4: 15, 3: 20}

# HauntConditions constants.
ENERGY_PER_STEP = 0.25
START_ENERGY = 10.0
START_SANITY = 100
START_LUST = 0
STEP_MINUTES = 1
GHOST_MOVE_CHANCE = 0.35
GHOST_EVENT_CHANCE_PER_STEP = 0.05  # approximates ArtEvent* / EventMC etc.
HUNT_BASE_THRESHOLD = 6             # CheckHuntStart.tw: 6 + huntChanceBonus
HUNT_EVENT_SANITY_LOSS = (1, 5)     # Ghost.rollEventSanityLoss default
HIDE_SUCCESS_BASE = 0.50            # Hide.tw threshold (checkH <= 50)
RUN_SUCCESS_BASE  = 0.70            # RunFast.tw threshold (check > 30)

# Dark = room.background === 2 (lights off).
LIGHT_ON, LIGHT_OFF = 1, 2


@dataclass
class Mc:
    sanity: float = START_SANITY
    lust: float = START_LUST
    energy: float = START_ENERGY


@dataclass
class Hunt:
    ghost_name: str
    tier: int = 3
    rooms: list[str] = field(default_factory=lambda: list(ELM_ROOMS))
    mc: Mc = field(default_factory=Mc)
    minutes: int = 0
    ghost_room: str = ""
    current_room: str = ""
    last_move_interval: str = ""
    emf_until: int = -1
    uvl_until: int = -1
    found: set[str] = field(default_factory=set)

    # Haunt state
    lights: dict[str, int] = field(default_factory=dict)   # room -> LIGHT_*
    tshirt: bool = True
    bottom: bool = True       # jeans/shorts/skirt worn
    panties: bool = True
    overcharged: bool = False
    hunt_active_flag: bool = False   # $huntActivated
    exit_reason: str = ""

    def __post_init__(self) -> None:
        self.ghost_room = random.choice(self.rooms)
        self.current_room = random.choice(self.rooms)
        self.last_move_interval = self._interval()
        self.lights = {r: LIGHT_ON for r in self.rooms}

    # --- snapshots / state queries ------------------------------------
    @property
    def ghost_evidence(self) -> frozenset[str]:
        return GHOST_EVIDENCE[self.ghost_name]

    @property
    def clothing(self) -> str:
        if not self.tshirt and not self.bottom and not self.panties:
            return "nude"
        if not self.tshirt and self.bottom:
            return "topless"
        if self.tshirt and self.bottom:
            return "dressed"
        return "partial"

    @property
    def dark(self) -> bool:
        return self.lights.get(self.current_room, LIGHT_ON) == LIGHT_OFF

    def snapshot(self) -> dict:
        """Mirror of setup.HauntConditions.snapshot()."""
        snap = dict(sanity_per_step=0, lust_per_step=0,
                    tool_chance_bonus=0.0, tool_window_bonus=0,
                    hunt_chance_bonus=0)
        if self.dark:
            snap["sanity_per_step"] -= 1
            snap["tool_chance_bonus"] += 0.10
            snap["tool_window_bonus"] += 5
            snap["hunt_chance_bonus"] += 6
        c = self.clothing
        if c == "topless":
            snap["tool_chance_bonus"] += 0.05
            snap["lust_per_step"]     += 1
            snap["hunt_chance_bonus"] += 3
        elif c == "nude":
            snap["tool_chance_bonus"] += 0.10
            snap["lust_per_step"]     += 2
            snap["hunt_chance_bonus"] += 5
        if self.mc.lust >= 50:
            snap["tool_chance_bonus"] += 0.05
            snap["hunt_chance_bonus"] += 3
        if self.overcharged:
            snap["tool_chance_bonus"] += 0.10
            snap["tool_window_bonus"] += 5
            snap["hunt_chance_bonus"] += 5
            snap["sanity_per_step"]   -= 1
        return snap

    # --- time / ghost bookkeeping -------------------------------------
    def _interval(self) -> str:
        m = self.minutes % 60
        return "0-19" if m < 20 else "20-39" if m < 40 else "40-59"

    def _maybe_move_ghost(self) -> None:
        i = self._interval()
        if i != self.last_move_interval:
            if random.random() < GHOST_MOVE_CHANCE:
                self.ghost_room = random.choice(self.rooms)
            self.last_move_interval = i

    def out_of_energy(self) -> bool:
        return self.mc.energy <= 0

    # --- navigation ---------------------------------------------------
    def move_to(self, room: str) -> str | None:
        """Walk to a room, paying energy/time, applying tick effects,
        rolling for ghost events and random hunts. Returns an exit-reason
        string if the hunt ends this tick ("sanity_zero", "caught_in_hunt"),
        else None."""
        self.current_room = room
        self.minutes += STEP_MINUTES
        self.mc.energy -= ENERGY_PER_STEP
        self._maybe_move_ghost()

        # Per-step tick effects (HauntConditions.applyTickEffects).
        snap = self.snapshot()
        self.mc.sanity = clamp(self.mc.sanity + snap["sanity_per_step"], 1, START_SANITY)
        self.mc.lust   = clamp(self.mc.lust + snap["lust_per_step"], 0, 100)
        # Sanity never hits 0 via natural drain (min clamp 1); the hunt-over
        # -sanity exit comes from GhostHuntEvent's rollEventSanityLoss. We
        # still surface sanity_zero if some future sink drives it below 1.

        # Ghost event (activates tools).
        if random.random() < GHOST_EVENT_CHANCE_PER_STEP:
            self._activate("uvl")
            self._activate("emf")

        # Random ghost-hunt roll (CheckHuntStart.tw).
        if not self.hunt_active_flag and can_hunt(
                self.ghost_name, self.mc.sanity, self.mc.lust):
            threshold = HUNT_BASE_THRESHOLD + snap["hunt_chance_bonus"]
            if random.randint(0, 100) <= threshold:
                reason = self._resolve_hunt_event()
                if reason:
                    return reason
        return None

    def _resolve_hunt_event(self) -> str | None:
        """GhostHuntEvent.tw: AI hides. Returns exit reason if caught,
        else None (hunt passed, event marker set)."""
        self.hunt_active_flag = True
        # Sanity event loss on hunt start.
        lo, hi = HUNT_EVENT_SANITY_LOSS
        self.mc.sanity -= random.randint(lo, hi)
        if self.mc.sanity < 1:
            self.mc.sanity = 0
            return "sanity_zero"
        # Hide (AI's default). Ghost override beats the roll.
        override = GHOST_HIDE_SUCCESS.get(self.ghost_name)
        if override is True:
            survived = True
        elif override is False:
            survived = False
        else:
            survived = random.random() < HIDE_SUCCESS_BASE
        if not survived:
            return "caught_in_hunt"
        # Survived - ghost event bumps both timed tools (like FreezeHunt).
        self._activate("emf")
        self._activate("uvl")
        # After the event, the hunt-trigger clock resets (huntActivated=1;
        # next CheckHuntStart waits for elapsedTimeHunt >= huntTimeRemain).
        # Approximate with a 60-minute cooldown window expressed as
        # "no new hunt this step"; next step we re-arm the flag.
        self.hunt_active_flag = False
        return None

    # --- tool rolls ----------------------------------------------------
    def _activate(self, tool: str) -> None:
        window = TOOL_WINDOW[self.tier] + self.snapshot()["tool_window_bonus"]
        until = self.minutes + window
        if tool == "emf":
            self.emf_until = max(self.emf_until, until)
        else:
            self.uvl_until = max(self.uvl_until, until)

    def _roll_tier(self) -> bool:
        bonus = self.snapshot()["tool_chance_bonus"]
        return random.random() < TIER_CHANCE[self.tier] + bonus

    def temperature_scan(self) -> int:
        base = random.randint(13, 16)
        offset = 0
        if self.current_room == self.ghost_room:
            offset = 8 if "temperature" in self.ghost_evidence else 5
            if "temperature" in self.ghost_evidence:
                self.found.add("temperature")
        return base + offset

    def gwb_scan(self) -> bool:
        if self.current_room != self.ghost_room or "gwb" not in self.ghost_evidence:
            return False
        if self._roll_tier():
            self.found.add("gwb")
            self._activate("emf")
            return True
        return False

    def plasm_scan(self) -> bool:
        if self.current_room != self.ghost_room or "glass" not in self.ghost_evidence:
            return False
        if self._roll_tier():
            self.found.add("glass")
            return True
        return False

    def spiritbox_scan(self) -> bool:
        if self.current_room != self.ghost_room or "spiritbox" not in self.ghost_evidence:
            return False
        if self._roll_tier():
            self.found.add("spiritbox")
            self._activate("emf")
            return True
        return False

    def emf_scan(self) -> bool:
        if self.current_room != self.ghost_room or "emf" not in self.ghost_evidence:
            return False
        if self.minutes > self.emf_until:
            return False
        self.found.add("emf")
        return True

    def uvl_scan(self) -> bool:
        if self.current_room != self.ghost_room or "uvl" not in self.ghost_evidence:
            return False
        if self.minutes > self.uvl_until:
            return False
        self.found.add("uvl")
        return True


def clamp(x: float, lo: float, hi: float) -> float:
    if x < lo: return lo
    if x > hi: return hi
    return x


# ---- AI patterns -----------------------------------------------------

SANITY_DANGER = 40            # below this, AI reverts to safe mode
LUST_DANGER   = 45            # below the 50 threshold - AI keeps clothes on
                              # to avoid crossing it and enabling more hunts


def pattern_find_ghost_room(hunt: Hunt) -> tuple[str | None, str]:
    """Walk rooms with lights ON (safer). Elevated temperature means the
    ghost's room. Returns (room, reason) where reason is one of
    'found' / 'energy' / 'sanity_zero' / 'caught_in_hunt' / 'search_timeout'."""
    seen_cold: set[str] = set()
    tried = 0
    while tried < len(hunt.rooms) * 2:
        if hunt.out_of_energy():
            return None, "energy"
        candidates = [r for r in hunt.rooms if r not in seen_cold]
        if not candidates:
            seen_cold.clear()
            candidates = list(hunt.rooms)
        dest = random.choice(candidates)
        # Safety: keep lights on while scouting.
        hunt.lights[dest] = LIGHT_ON
        exit_reason = hunt.move_to(dest)
        if exit_reason:
            return None, exit_reason
        reading = hunt.temperature_scan()
        if reading >= 18:
            return dest, "found"
        seen_cold.add(dest)
        tried += 1
    return None, "search_timeout"


def pattern_scan_for_evidence(hunt: Hunt, suspected: str, rounds: int = 6
                              ) -> tuple[bool, str | None]:
    """Scan every tool each round. Turns lights off for the tool bonus
    unless sanity is already below SANITY_DANGER. Returns (complete,
    exit_reason). complete=True when the evidence set is fully confirmed."""
    for _ in range(rounds):
        if hunt.out_of_energy():
            return hunt.found >= hunt.ghost_evidence, "energy"
        # Dynamic safety: lights off unless sanity is near-critical.
        hunt.lights[suspected] = (LIGHT_OFF if hunt.mc.sanity > SANITY_DANGER
                                  else LIGHT_ON)
        exit_reason = hunt.move_to(suspected)
        if exit_reason:
            return hunt.found >= hunt.ghost_evidence, exit_reason
        # Tool pass. GWB / Spiritbox roll before EMF so their hits can
        # open the EMF window in the same pass.
        hunt.temperature_scan()
        hunt.gwb_scan()
        hunt.spiritbox_scan()
        hunt.plasm_scan()
        hunt.emf_scan()
        hunt.uvl_scan()
        if hunt.found >= hunt.ghost_evidence:
            return True, None
    return hunt.found >= hunt.ghost_evidence, None


def play_hunt(ghost_name: str, tier: int = 3) -> tuple[bool, set[str], str]:
    """Run one contract with the simple AI. Returns
    (identified, evidence_seen, exit_reason). exit_reason in
    {identified, energy, sanity_zero, caught_in_hunt, search_timeout}."""
    hunt = Hunt(ghost_name=ghost_name, tier=tier)

    while not hunt.out_of_energy() and hunt.found < hunt.ghost_evidence:
        suspected, reason = pattern_find_ghost_room(hunt)
        if suspected is None:
            hunt.exit_reason = reason
            break
        complete, scan_reason = pattern_scan_for_evidence(hunt, suspected,
                                                           rounds=6)
        if complete:
            hunt.exit_reason = "identified"
            break
        if scan_reason:
            hunt.exit_reason = scan_reason
            break
        # Evidence incomplete but no hard exit -- probably ghost relocated
        # or tools missed. Loop re-searches.

    identified = hunt.found == hunt.ghost_evidence
    reason = hunt.exit_reason or ("identified" if identified else "energy")
    return identified, set(hunt.found), reason


# ---- Runner ----------------------------------------------------------


@dataclass
class Result:
    ghost: str
    trials: int
    tier: int
    wins: int
    evidence_counts: dict[str, int]
    count_by_found: list[int]
    fail_reasons: dict[str, int]
    missed_evidence: dict[tuple[str, ...], int]


def simulate(ghost_name: str, trials: int, tier: int) -> Result:
    if ghost_name not in GHOST_EVIDENCE:
        raise SystemExit(f"Unknown ghost: {ghost_name!r}. "
                         f"Choose from {sorted(GHOST_EVIDENCE)} or 'all'.")
    if tier not in TIER_CHANCE:
        raise SystemExit(f"Unknown tier: {tier}. Choose 3, 4, or 5.")

    wins = 0
    evidence_counts = {e: 0 for e in {"emf", "gwb", "glass",
                                       "spiritbox", "temperature", "uvl"}}
    count_by_found = [0] * 4
    fail_reasons: dict[str, int] = {
        "energy": 0, "sanity_zero": 0, "caught_in_hunt": 0, "search_timeout": 0,
    }
    missed_evidence: dict[tuple[str, ...], int] = {}

    for _ in range(trials):
        ok, found, reason = play_hunt(ghost_name, tier=tier)
        if ok:
            wins += 1
        else:
            fail_reasons[reason] = fail_reasons.get(reason, 0) + 1
            missing = tuple(sorted(GHOST_EVIDENCE[ghost_name] - found))
            missed_evidence[missing] = missed_evidence.get(missing, 0) + 1
        for e in found:
            evidence_counts[e] += 1
        count_by_found[min(len(found & GHOST_EVIDENCE[ghost_name]), 3)] += 1

    return Result(ghost_name, trials, tier, wins, evidence_counts,
                  count_by_found, fail_reasons, missed_evidence)


def print_detailed(r: Result) -> None:
    target = sorted(GHOST_EVIDENCE[r.ghost])
    losses = r.trials - r.wins
    print(f"Elm Street AI hunt - {r.trials} runs vs {r.ghost} (tier {r.tier})")
    print(f"  target evidence: {target}")
    print(f"  identified correctly: {r.wins}/{r.trials} "
          f"({100 * r.wins / r.trials:.2f}%)")
    print("  evidence-piece hit rate (per run):")
    for ev in target:
        pct = 100 * r.evidence_counts[ev] / r.trials
        print(f"    {ev:<12} {pct:6.2f}%")
    print("  runs ending with N-of-3 target evidence collected:")
    for n, c in enumerate(r.count_by_found):
        print(f"    {n}/3: {c:>6}  ({100 * c / r.trials:5.2f}%)")
    if losses:
        print(f"  failure reasons ({losses} failed runs):")
        for reason, c in sorted(r.fail_reasons.items(), key=lambda kv: -kv[1]):
            pct_fail = 100 * c / losses
            pct_all = 100 * c / r.trials
            print(f"    {reason:<16} {c:>6}  ({pct_fail:5.2f}% of fails, "
                  f"{pct_all:5.2f}% of runs)")
        print("  missing evidence on failed runs:")
        items = sorted(r.missed_evidence.items(), key=lambda kv: -kv[1])
        for miss, c in items:
            label = ", ".join(miss) if miss else "(none - but mis-matched)"
            pct_fail = 100 * c / losses
            print(f"    missing {label:<30} {c:>6}  ({pct_fail:5.2f}% of fails)")
    else:
        print("  failure reasons: (no failures)")


def _top_reason(reasons: dict[str, int]) -> tuple[str, int]:
    nonzero = [(k, v) for k, v in reasons.items() if v > 0]
    if not nonzero:
        return ("none", 0)
    return max(nonzero, key=lambda kv: kv[1])


def print_summary(results: list[Result]) -> None:
    trials = results[0].trials
    tier = results[0].tier
    total_runs = sum(r.trials for r in results)
    total_wins = sum(r.wins for r in results)
    overall_reasons: dict[str, int] = {}
    for r in results:
        for k, v in r.fail_reasons.items():
            overall_reasons[k] = overall_reasons.get(k, 0) + v

    print(f"Elm Street AI hunt - {trials} runs per ghost, tier {tier}, "
          f"{len(results)} ghosts ({total_runs} runs total)")
    print()
    header = f"  {'ghost':<13} {'success':>8}   {'top failure':<24}"
    print(header)
    print(f"  {'-' * 13} {'-' * 8}   {'-' * 24}")
    # Worst ghosts first so the interesting ones are easy to spot.
    for r in sorted(results, key=lambda x: x.wins / x.trials):
        rate = 100 * r.wins / r.trials
        fails = r.trials - r.wins
        if fails:
            reason, count = _top_reason(r.fail_reasons)
            miss, miss_count = max(r.missed_evidence.items(),
                                    key=lambda kv: kv[1])
            miss_label = "+".join(miss) if miss else "none"
            top = (f"{reason} {count}/{fails}"
                   f" (miss {miss_label} {miss_count})")
        else:
            top = "-"
        print(f"  {r.ghost:<13} {rate:>7.2f}%   {top:<24}")

    print()
    overall_rate = 100 * total_wins / total_runs
    print(f"  overall success: {total_wins}/{total_runs} ({overall_rate:.2f}%)")
    total_fails = total_runs - total_wins
    if total_fails:
        top_reason, top_count = _top_reason(overall_reasons)
        print(f"  overall top failure: {top_reason} "
              f"({top_count}/{total_fails} fails, "
              f"{100 * top_count / total_runs:.2f}% of runs)")
        ordered = sorted(overall_reasons.items(), key=lambda kv: -kv[1])
        breakdown = ", ".join(f"{k}={v}" for k, v in ordered if v)
        print(f"  failure breakdown: {breakdown}")
    else:
        print("  overall top failure: none")


def main() -> None:
    arg = sys.argv[1] if len(sys.argv) > 1 else "all"
    if arg == "all":
        trials = int(sys.argv[2]) if len(sys.argv) > 2 else 5000
        tier = int(sys.argv[3]) if len(sys.argv) > 3 else 3
        results = [simulate(name, trials, tier)
                   for name in GHOST_EVIDENCE]
        print_summary(results)
    else:
        trials = int(sys.argv[2]) if len(sys.argv) > 2 else 10000
        tier = int(sys.argv[3]) if len(sys.argv) > 3 else 3
        print_detailed(simulate(arg, trials, tier))


if __name__ == "__main__":
    main()
