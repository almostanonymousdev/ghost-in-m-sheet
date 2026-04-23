#!/usr/bin/env python3
"""
Simplistic AI that plays through a haunted-house contract against every
ghost type in every house (Owaissa / Elm / Enigma / Ironclad), using data
parsed from the game's own .tw sources at startup.

Models the core hunt loop from Ghost in M'Sheet:

  - Ghost picks a favorite room from the house's room list at contract
    start and can switch rooms every 20 in-game minutes with 35% chance
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
    python3 sim_ai_hunt.py                 # every house x every ghost
    python3 sim_ai_hunt.py elm             # all ghosts in one house
    python3 sim_ai_hunt.py elm Phantom     # detailed single (house, ghost)
    python3 sim_ai_hunt.py Phantom         # one ghost across all houses
    python3 sim_ai_hunt.py --validate-data # check parser still matches game
Trailing positional args are [trials] [tier] on each form.
"""

from __future__ import annotations

import argparse
import random
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path


# ---- Game-data loader ------------------------------------------------
#
# Everything in this section parses numbers/flags straight from the game's
# .tw source. The AI below consumes these values; nothing that affects
# mechanics is hardcoded.


REPO_ROOT = Path(__file__).resolve().parent
PASSAGES = REPO_ROOT / "passages"

EVIDENCE_ENUM = {
    "EMF": "emf", "SPIRITBOX": "spiritbox", "GWB": "gwb",
    "GLASS": "glass", "TEMPERATURE": "temperature", "UVL": "uvl",
}


def _read(rel: str) -> str:
    return (PASSAGES / rel).read_text(encoding="utf-8", errors="replace")


def _find_num(pattern: str, text: str, cast=float) -> float:
    m = re.search(pattern, text)
    if not m:
        raise SystemExit(f"parser: couldn't match {pattern!r}")
    return cast(m.group(1))


def _need(m: re.Match | None, what: str) -> re.Match:
    if m is None:
        raise SystemExit(f"parser: couldn't find {what}")
    return m


def _parse_ghost_block(block: str) -> dict:
    name = _need(re.search(r'name:\s*"([^"]+)"', block), "ghost name").group(1)
    ev_match = _need(re.search(r'evidence:\s*\[([^\]]+)\]', block),
                     "ghost evidence")
    evidence = frozenset(
        EVIDENCE_ENUM[k] for k in re.findall(r'\bE\.([A-Z]+)', ev_match.group(1))
    )
    # huntCondition is either `mc.sanity <= N` or `mc.lust >= N`.
    hc = _need(re.search(
        r'huntCondition:[^,]*?mc\.(sanity|lust)\s*(<=|>=)\s*(\d+)', block),
        f"huntCondition for {name}")
    kind = ("sanity_max" if hc.group(1) == "sanity" else "lust_min")
    hunt_cond = (kind, int(hc.group(3)))
    hide = running = None
    m = re.search(r'hidingSucceeds:\s*(true|false)', block)
    if m: hide = (m.group(1) == "true")
    m = re.search(r'runningSucceeds:\s*(true|false)', block)
    if m: running = (m.group(1) == "true")
    lo, hi = 1, 5
    m = re.search(r'sanityEventLossRange:\s*\[(\d+),\s*(\d+)\]', block)
    if m: lo, hi = int(m.group(1)), int(m.group(2))
    return {
        "name": name, "evidence": evidence, "hunt_cond": hunt_cond,
        "hide": hide, "run": running, "sanity_loss": (lo, hi),
    }


def _load_ghosts() -> list[dict]:
    src = _read("ghosts/GhostController.tw")
    gc_start = src.index("var GHOST_CONFIG")
    # brace-balance the ghost config list; each entry is a `{...}` object
    list_start = src.index("[", gc_start)
    i = list_start + 1
    depth = 0
    starts: list[int] = []
    ends: list[int] = []
    while i < len(src):
        c = src[i]
        if c == "[":
            depth += 1
        elif c == "]" and depth == 0:
            break
        elif c == "]":
            depth -= 1
        elif c == "{" and depth == 0:
            # balance this object literal
            j = i + 1
            d = 1
            while j < len(src) and d > 0:
                if src[j] == "{": d += 1
                elif src[j] == "}": d -= 1
                j += 1
            starts.append(i)
            ends.append(j)
            i = j
            continue
        i += 1
    return [_parse_ghost_block(src[s:e]) for s, e in zip(starts, ends)]


def _parse_int_map(text: str, varname: str) -> dict[int, int]:
    m = re.search(varname + r'\s*=\s*\{([^}]+)\}', text)
    if not m:
        raise SystemExit(f"parser: couldn't find {varname}")
    return {int(k): int(v)
            for k, v in re.findall(r'(\d+)\s*:\s*(\d+)', m.group(1))}


def _parse_snapshot_bonuses(src: str) -> dict[str, dict[str, float]]:
    """Pull the per-condition snap.X += N lines from setup.HauntConditions
    .snapshot(). Returns {condition: {field: delta}} for dark / topless /
    nude / lust_fuel / overcharged."""
    branches = {
        "dark":        r'if \(isCurrentRoomDark\(\)\)\s*\{([^}]+)\}',
        "topless":     r'if \(snap\.clothing === "topless"\)\s*\{([^}]+)\}',
        "nude":        r'else if \(snap\.clothing === "nude"\)\s*\{([^}]+)\}',
        "lust_fuel":   r'if \(mc && mc\.lust >= LUST_FUEL_THRESHOLD\)\s*\{([^}]+)\}',
        "overcharged": r'if \(snap\.overchargedTools\)\s*\{([^}]+)\}',
    }
    fields = {
        "sanity_per_step":  r'snap\.sanityPerStep\s*([+\-])=\s*([\d.]+)',
        "lust_per_step":    r'snap\.lustPerStep\s*([+\-])=\s*([\d.]+)',
        "tool_chance":      r'snap\.toolChanceBonus\s*([+\-])=\s*([\d.]+)',
        "tool_window":      r'snap\.toolWindowBonus\s*([+\-])=\s*([\d.]+)',
        "hunt_chance":      r'snap\.huntChanceBonus\s*([+\-])=\s*([\d.]+)',
    }
    out: dict[str, dict[str, float]] = {}
    for name, block_re in branches.items():
        m = re.search(block_re, src)
        if not m:
            raise SystemExit(f"parser: snapshot branch {name} not found")
        body = m.group(1)
        deltas: dict[str, float] = {}
        for f, pat in fields.items():
            fm = re.search(pat, body)
            if fm:
                sign = 1 if fm.group(1) == "+" else -1
                deltas[f] = sign * float(fm.group(2))
        out[name] = deltas
    return out


def _parse_contract_drain(src: str) -> tuple[float, float]:
    """Pull the `hasCompanion ? X : Y` ternary out of the contract-drain
    block in HauntConditions.snapshot(). Returns (base_drain, companion_drain)
    so the no-companion case is always first."""
    m = re.search(
        r"hasCompanion\s*\?\s*([\d.]+)\s*:\s*([\d.]+)\s*;", src)
    if not m:
        raise SystemExit("parser: contract drain ternary not found")
    companion_drain, base_drain = float(m.group(1)), float(m.group(2))
    return base_drain, companion_drain


def _parse_houses() -> dict[str, list[str]]:
    """Pull every HOUSE_CONFIG entry's id + rooms out of
    HauntedHousesController.tw. Returns {house_id: [room_var_name, ...]}."""
    src = _read("haunted_houses/HauntedHousesController.tw")
    out: dict[str, list[str]] = {}
    for m in re.finditer(
            r"id:\s*'([^']+)'[^{}]*?rooms:\s*\[([^\]]+)\]", src, re.DOTALL):
        out[m.group(1)] = re.findall(r"'([^']+)'", m.group(2))
    return out


@dataclass
class GameData:
    ghosts: dict[str, dict]
    tier_chance: dict[int, float]            # tier -> per-roll chance (0-1)
    tool_window: dict[int, int]              # tier -> minutes
    houses: dict[str, list[str]]             # house id -> room names
    ghost_move_chance: float
    hunt_base_threshold: int
    hide_success_base: float                 # 0-1
    run_success_base: float                  # 0-1
    energy_per_step: float
    start_energy: float
    start_sanity: float
    start_lust: float
    lust_fuel_threshold: int
    dark_bg: int
    snapshot_bonuses: dict[str, dict[str, float]]
    contract_sanity_drain: float             # baseline sanity -= /step in-house
    contract_sanity_drain_with_companion: float
    ghost_event_chance_per_step: float = 0.05  # not encoded as a single
                                               # constant in-game; keeps the
                                               # ArtEvent/EventMC/Freeze
                                               # activation rate tunable.


def load_game_data() -> GameData:
    story_script = _read("StoryScript.tw")
    story_init = _read("StoryInit.tw")
    change_room = _read("haunted_houses/general/ChangeGhostRoom.tw")
    check_hunt = _read("haunted_houses/hunt/CheckHuntStart.tw")
    hide_tw = _read("haunted_houses/general/Hide.tw")
    run_tw = _read("haunted_houses/general/RunFast.tw")

    ghosts = {g["name"]: g for g in _load_ghosts()}

    tier_chance_raw = _parse_int_map(story_script, r"setup\.TIER_CHANCE")
    tier_chance = {k: v / 100.0 for k, v in tier_chance_raw.items()}
    tool_window = _parse_int_map(story_script, r"setup\.TOOL_TIME_REMAIN")

    # HauntConditions constants.
    energy_per_step = _find_num(r"var\s+ENERGY_PER_STEP\s*=\s*([\d.]+)",
                                story_script)
    lust_fuel = int(_find_num(r"var\s+LUST_FUEL_THRESHOLD\s*=\s*(\d+)",
                              story_script))
    dark_bg = int(_find_num(r"var\s+DARK\s*=\s*(\d+)", story_script))
    snapshot_bonuses = _parse_snapshot_bonuses(story_script)
    contract_drain, companion_drain = _parse_contract_drain(story_script)

    # mc starting stats (StoryInit.tw).
    start_sanity = _find_num(r"sanity\s*:\s*(\d+)", story_init)
    start_lust   = _find_num(r"lust\s*:\s*(\d+)",   story_init)
    start_energy = _find_num(r"energy\s*:\s*(\d+)", story_init)

    # ChangeGhostRoom.tw: Math.random() < 0.35
    ghost_move_chance = _find_num(r"Math\.random\(\)\s*<\s*([\d.]+)",
                                   change_room)

    # CheckHuntStart.tw: _huntThreshold to N + setup.HauntConditions...
    hunt_base_threshold = int(_find_num(r"_huntThreshold\s+to\s+(\d+)",
                                         check_hunt))

    # Hide.tw: `if _checkH lte 50` -> success (swap: player lucky)
    hide_pct = _find_num(r"_checkH\s+lte\s+(\d+)", hide_tw) / 100.0

    # RunFast.tw: `if _check lte 30` -> caught; success = 1 - that.
    run_caught = _find_num(r"_check\s+lte\s+(\d+)", run_tw) / 100.0

    return GameData(
        ghosts=ghosts,
        tier_chance=tier_chance,
        tool_window=tool_window,
        houses=_parse_houses(),
        ghost_move_chance=ghost_move_chance,
        hunt_base_threshold=hunt_base_threshold,
        hide_success_base=hide_pct,
        run_success_base=1.0 - run_caught,
        energy_per_step=energy_per_step,
        start_energy=start_energy,
        start_sanity=start_sanity,
        start_lust=start_lust,
        lust_fuel_threshold=lust_fuel,
        dark_bg=dark_bg,
        snapshot_bonuses=snapshot_bonuses,
        contract_sanity_drain=contract_drain,
        contract_sanity_drain_with_companion=companion_drain,
    )


GD = load_game_data()

STEP_MINUTES = 1                 # one nav tick = one in-game minute
HUNT_EVENT_SANITY_LOSS_DEFAULT = (1, 5)  # Ghost.rollEventSanityLoss default


def validate_game_data() -> list[str]:
    """Assert every piece of game data the simulator depends on is actually
    present and well-formed. Returns a list of error strings; empty list
    means the game sources still match the parser's expectations."""
    errors: list[str] = []

    def require(cond: bool, msg: str) -> None:
        if not cond:
            errors.append(msg)

    # Ghosts.
    expected_ghost_count = 18
    require(len(GD.ghosts) == expected_ghost_count,
            f"expected {expected_ghost_count} ghosts, got {len(GD.ghosts)}: "
            f"{sorted(GD.ghosts)}")
    valid_evidence = set(EVIDENCE_ENUM.values())
    for name, g in GD.ghosts.items():
        require(len(g["evidence"]) == 3,
                f"ghost {name}: expected 3 evidence types, got "
                f"{sorted(g['evidence'])}")
        bad = g["evidence"] - valid_evidence
        require(not bad, f"ghost {name}: unknown evidence {sorted(bad)}")
        kind, threshold = g["hunt_cond"]
        require(kind in ("sanity_max", "lust_min"),
                f"ghost {name}: bad huntCondition kind {kind!r}")
        require(0 < threshold <= 100,
                f"ghost {name}: huntCondition threshold {threshold} "
                f"out of range")
        lo, hi = g["sanity_loss"]
        require(0 < lo <= hi,
                f"ghost {name}: sanityEventLossRange {g['sanity_loss']} bad")

    # Tier-gated tools.
    for tier in (3, 4, 5):
        require(tier in GD.tier_chance,
                f"TIER_CHANCE missing tier {tier}; got {GD.tier_chance}")
        require(tier in GD.tool_window,
                f"TOOL_TIME_REMAIN missing tier {tier}; got {GD.tool_window}")
    for tier, p in GD.tier_chance.items():
        require(0 < p <= 1, f"TIER_CHANCE[{tier}]={p} out of (0,1]")
    for tier, w in GD.tool_window.items():
        require(w > 0, f"TOOL_TIME_REMAIN[{tier}]={w} not positive")

    # Houses.
    expected_houses = {"elm", "owaissa", "enigma", "ironclad"}
    missing = expected_houses - set(GD.houses)
    require(not missing, f"HOUSE_CONFIG missing houses: {sorted(missing)}")
    for house, rooms in GD.houses.items():
        require(len(rooms) >= 2,
                f"house {house!r} rooms too short: {rooms}")
        require(len(set(rooms)) == len(rooms),
                f"house {house!r} rooms contain duplicates: {rooms}")

    # Scalar constants.
    require(0 < GD.ghost_move_chance <= 1,
            f"ChangeGhostRoom Math.random() threshold "
            f"{GD.ghost_move_chance} out of (0,1]")
    require(0 <= GD.hunt_base_threshold <= 100,
            f"CheckHuntStart base threshold {GD.hunt_base_threshold} bad")
    require(0 < GD.hide_success_base < 1,
            f"Hide.tw success base {GD.hide_success_base} bad")
    require(0 < GD.run_success_base < 1,
            f"RunFast.tw success base {GD.run_success_base} bad")
    require(GD.energy_per_step > 0,
            f"ENERGY_PER_STEP {GD.energy_per_step} not positive")
    require(GD.start_energy > 0,
            f"starting energy {GD.start_energy} not positive")
    require(GD.start_sanity > 0,
            f"starting sanity {GD.start_sanity} not positive")
    require(GD.start_lust >= 0,
            f"starting lust {GD.start_lust} negative")
    require(GD.lust_fuel_threshold > 0,
            f"LUST_FUEL_THRESHOLD {GD.lust_fuel_threshold} not positive")
    require(GD.dark_bg != 1,
            f"DARK constant collides with LIGHT_ON: {GD.dark_bg}")

    # Snapshot bonuses: every branch we rely on must exist, and at least
    # one numeric delta within it.
    for branch in ("dark", "topless", "nude", "lust_fuel", "overcharged"):
        d = GD.snapshot_bonuses.get(branch)
        require(bool(d), f"snapshot branch {branch!r} missing from parser")
        if d:
            require(any(v != 0 for v in d.values()),
                    f"snapshot branch {branch!r} has no nonzero deltas: {d}")

    # Contract-drain ternary: companion arm must be no worse than the
    # no-companion arm (the whole point of the companion bonus), and both
    # must be positive - zero drain would silently defeat the gate-opening
    # mechanic that landed this whole change.
    require(GD.contract_sanity_drain > 0,
            f"contract sanity drain {GD.contract_sanity_drain} must be > 0")
    require(0 < GD.contract_sanity_drain_with_companion
            <= GD.contract_sanity_drain,
            f"companion contract drain "
            f"{GD.contract_sanity_drain_with_companion} must be in "
            f"(0, {GD.contract_sanity_drain}]")

    # Spot-check: a run should execute without crashing in each house,
    # with and without a companion.
    ghost = next(iter(GD.ghosts))
    for house in GD.houses:
        for companion in (False, True):
            try:
                play_hunt(ghost, house=house, tier=3, companion=companion)
            except Exception as e:
                errors.append(
                    f"smoke run in {house} (companion={companion}) raised "
                    f"{type(e).__name__}: {e}")

    return errors


def can_hunt(name: str, sanity: float, lust: float) -> bool:
    kind, threshold = GD.ghosts[name]["hunt_cond"]
    return sanity <= threshold if kind == "sanity_max" else lust >= threshold


def ghost_evidence(name: str) -> frozenset[str]:
    return GD.ghosts[name]["evidence"]


LIGHT_ON = 1
LIGHT_OFF = GD.dark_bg


@dataclass
class Mc:
    sanity: float = field(default_factory=lambda: GD.start_sanity)
    lust: float = field(default_factory=lambda: GD.start_lust)
    energy: float = field(default_factory=lambda: GD.start_energy)


@dataclass
class Hunt:
    ghost_name: str
    house: str = "elm"
    tier: int = 3
    companion: bool = False
    rooms: list[str] = field(default_factory=list)
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
        if not self.rooms:
            if self.house not in GD.houses:
                raise SystemExit(f"Unknown house: {self.house!r}. "
                                 f"Choose from {sorted(GD.houses)}.")
            self.rooms = list(GD.houses[self.house])
        self.ghost_room = random.choice(self.rooms)
        self.current_room = random.choice(self.rooms)
        self.last_move_interval = self._interval()
        self.lights = {r: LIGHT_ON for r in self.rooms}

    # --- snapshots / state queries ------------------------------------
    @property
    def ghost_evidence(self) -> frozenset[str]:
        return ghost_evidence(self.ghost_name)

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
        """Mirror of setup.HauntConditions.snapshot() - pulls per-branch
        deltas from GD.snapshot_bonuses, which is parsed from StoryScript.tw."""
        snap = dict(sanity_per_step=0.0, lust_per_step=0.0,
                    tool_chance_bonus=0.0, tool_window_bonus=0.0,
                    hunt_chance_bonus=0.0)
        # Contract-drain branch: always active inside a hunt (Hunt is the
        # in-house context). Companion halves the drain.
        snap["sanity_per_step"] -= (GD.contract_sanity_drain_with_companion
                                    if self.companion
                                    else GD.contract_sanity_drain)
        active: list[str] = []
        if self.dark:
            active.append("dark")
        c = self.clothing
        if c == "topless":
            active.append("topless")
        elif c == "nude":
            active.append("nude")
        if self.mc.lust >= GD.lust_fuel_threshold:
            active.append("lust_fuel")
        if self.overcharged:
            active.append("overcharged")
        for branch in active:
            for k, v in GD.snapshot_bonuses[branch].items():
                # tool_chance / hunt_chance are percent points in the
                # game; the tier-chance table is decimal (0-1). Scale the
                # tool-chance bonus into 0-1, leave hunt-chance as
                # percent points (CheckHuntStart.tw compares vs a 0-100
                # roll).
                if k == "tool_chance":
                    snap["tool_chance_bonus"] += v / 100.0
                elif k == "hunt_chance":
                    snap["hunt_chance_bonus"] += v
                elif k == "tool_window":
                    snap["tool_window_bonus"] += v
                elif k == "sanity_per_step":
                    snap["sanity_per_step"] += v
                elif k == "lust_per_step":
                    snap["lust_per_step"] += v
        return snap

    # --- time / ghost bookkeeping -------------------------------------
    def _interval(self) -> str:
        m = self.minutes % 60
        return "0-19" if m < 20 else "20-39" if m < 40 else "40-59"

    def _maybe_move_ghost(self) -> None:
        i = self._interval()
        if i != self.last_move_interval:
            if random.random() < GD.ghost_move_chance:
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
        self.mc.energy -= GD.energy_per_step
        self._maybe_move_ghost()

        # Per-step tick effects (HauntConditions.applyTickEffects).
        snap = self.snapshot()
        self.mc.sanity = clamp(self.mc.sanity + snap["sanity_per_step"],
                               1, GD.start_sanity)
        self.mc.lust   = clamp(self.mc.lust + snap["lust_per_step"], 0, 100)
        # Sanity never hits 0 via natural drain (min clamp 1); the hunt-over
        # -sanity exit comes from GhostHuntEvent's rollEventSanityLoss. We
        # still surface sanity_zero if some future sink drives it below 1.

        # Ghost event (activates tools).
        if random.random() < GD.ghost_event_chance_per_step:
            self._activate("uvl")
            self._activate("emf")

        # Random ghost-hunt roll (CheckHuntStart.tw).
        if not self.hunt_active_flag and can_hunt(
                self.ghost_name, self.mc.sanity, self.mc.lust):
            threshold = GD.hunt_base_threshold + snap["hunt_chance_bonus"]
            if random.randint(0, 100) <= threshold:
                reason = self._resolve_hunt_event()
                if reason:
                    return reason
        return None

    def _resolve_hunt_event(self) -> str | None:
        """GhostHuntEvent.tw: AI hides. Returns exit reason if caught,
        else None (hunt passed, event marker set)."""
        self.hunt_active_flag = True
        # Sanity event loss on hunt start - ghost-specific range when set,
        # else the Ghost.rollEventSanityLoss default.
        lo, hi = GD.ghosts[self.ghost_name].get(
            "sanity_loss", HUNT_EVENT_SANITY_LOSS_DEFAULT)
        self.mc.sanity -= random.randint(lo, hi)
        if self.mc.sanity < 1:
            self.mc.sanity = 0
            return "sanity_zero"
        # Hide (AI's default). Ghost override beats the roll.
        override = GD.ghosts[self.ghost_name].get("hide")
        if override is True:
            survived = True
        elif override is False:
            survived = False
        else:
            survived = random.random() < GD.hide_success_base
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
        window = GD.tool_window[self.tier] + self.snapshot()["tool_window_bonus"]
        until = self.minutes + int(window)
        if tool == "emf":
            self.emf_until = max(self.emf_until, until)
        else:
            self.uvl_until = max(self.uvl_until, until)

    def _roll_tier(self) -> bool:
        bonus = self.snapshot()["tool_chance_bonus"]
        return random.random() < GD.tier_chance[self.tier] + bonus

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


def play_hunt(ghost_name: str, house: str = "elm", tier: int = 3,
              companion: bool = False
              ) -> tuple[bool, set[str], str]:
    """Run one contract with the simple AI. Returns
    (identified, evidence_seen, exit_reason). exit_reason in
    {identified, energy, sanity_zero, caught_in_hunt, search_timeout}."""
    hunt = Hunt(ghost_name=ghost_name, house=house, tier=tier,
                companion=companion)

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
    house: str
    trials: int
    tier: int
    companion: bool
    wins: int
    evidence_counts: dict[str, int]
    count_by_found: list[int]
    fail_reasons: dict[str, int]
    missed_evidence: dict[tuple[str, ...], int]


# Sim-scoped flag flipped by --companion. Used as the default for every
# subsequent `simulate()` call; avoids threading it through every CLI branch.
SIM_COMPANION = False


def simulate(ghost_name: str, house: str, trials: int, tier: int,
             companion: bool | None = None) -> Result:
    if ghost_name not in GD.ghosts:
        raise SystemExit(f"Unknown ghost: {ghost_name!r}. "
                         f"Choose from {sorted(GD.ghosts)} or 'all'.")
    if house not in GD.houses:
        raise SystemExit(f"Unknown house: {house!r}. "
                         f"Choose from {sorted(GD.houses)} or 'all'.")
    if tier not in GD.tier_chance:
        raise SystemExit(f"Unknown tier: {tier}. "
                         f"Choose from {sorted(GD.tier_chance)}.")

    comp: bool = SIM_COMPANION if companion is None else companion
    target = ghost_evidence(ghost_name)
    wins = 0
    evidence_counts = {e: 0 for e in EVIDENCE_ENUM.values()}
    count_by_found = [0] * 4
    fail_reasons: dict[str, int] = {
        "energy": 0, "sanity_zero": 0, "caught_in_hunt": 0, "search_timeout": 0,
    }
    missed_evidence: dict[tuple[str, ...], int] = {}

    for _ in range(trials):
        ok, found, reason = play_hunt(ghost_name, house=house, tier=tier,
                                       companion=comp)
        if ok:
            wins += 1
        else:
            fail_reasons[reason] = fail_reasons.get(reason, 0) + 1
            missing = tuple(sorted(target - found))
            missed_evidence[missing] = missed_evidence.get(missing, 0) + 1
        for e in found:
            evidence_counts[e] = evidence_counts.get(e, 0) + 1
        count_by_found[min(len(found & target), 3)] += 1

    return Result(ghost_name, house, trials, tier, comp, wins,
                  evidence_counts, count_by_found, fail_reasons,
                  missed_evidence)


def print_detailed(r: Result) -> None:
    target = sorted(ghost_evidence(r.ghost))
    losses = r.trials - r.wins
    print(f"{r.house} AI hunt - {r.trials} runs vs {r.ghost} "
          f"(tier {r.tier}, {len(GD.houses[r.house])} rooms)")
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


def _row_for(r: Result) -> tuple[float, str, str]:
    """Per-result summary row: (success_pct, ghost_label, failure_blurb)."""
    rate = 100 * r.wins / r.trials
    fails = r.trials - r.wins
    if not fails:
        return (rate, r.ghost, "-")
    reason, count = _top_reason(r.fail_reasons)
    miss, miss_count = max(r.missed_evidence.items(), key=lambda kv: kv[1])
    miss_label = "+".join(miss) if miss else "none"
    return (rate, r.ghost,
            f"{reason} {count}/{fails} (miss {miss_label} {miss_count})")


def print_house_summary(results: list[Result], keep: int = 2) -> None:
    """Compact per-house summary: the `keep` worst and best ghosts only."""
    assert results, "print_house_summary called with no results"
    house = results[0].house
    ordered = sorted(results, key=lambda x: x.wins / x.trials)
    trials_total = sum(r.trials for r in results)
    wins_total = sum(r.wins for r in results)
    fails = trials_total - wins_total
    house_reasons: dict[str, int] = {}
    for r in results:
        for k, v in r.fail_reasons.items():
            house_reasons[k] = house_reasons.get(k, 0) + v

    header = (f"{house} ({len(GD.houses[house])} rooms) - "
              f"{100 * wins_total / trials_total:.2f}% overall")
    if fails:
        reason, count = _top_reason(house_reasons)
        header += f" - top fail {reason} {count}/{fails}"
    print(header)

    # 2 worst, 2 best. Collapse if total ghosts <= 2*keep (would double-print).
    if len(ordered) <= keep * 2:
        shown = [("", r) for r in ordered]
    else:
        shown = ([("worst", r) for r in ordered[:keep]]
                 + [("best", r) for r in ordered[-keep:][::-1]])
    for label, r in shown:
        rate, name, blurb = _row_for(r)
        prefix = f"  [{label}]" if label else "  "
        print(f"{prefix:<9} {name:<13} {rate:>7.2f}%   {blurb}")


def print_overall(all_results: list[Result]) -> None:
    """Footer across every (house, ghost) pair."""
    total_runs = sum(r.trials for r in all_results)
    total_wins = sum(r.wins for r in all_results)
    overall_reasons: dict[str, int] = {}
    for r in all_results:
        for k, v in r.fail_reasons.items():
            overall_reasons[k] = overall_reasons.get(k, 0) + v

    print()
    print(f"overall success: {total_wins}/{total_runs} "
          f"({100 * total_wins / total_runs:.2f}%)")
    total_fails = total_runs - total_wins
    if total_fails:
        top_r, top_c = _top_reason(overall_reasons)
        print(f"overall top failure: {top_r} ({top_c}/{total_fails} fails, "
              f"{100 * top_c / total_runs:.2f}% of runs)")
        ordered = sorted(overall_reasons.items(), key=lambda kv: -kv[1])
        breakdown = ", ".join(f"{k}={v}" for k, v in ordered if v)
        print(f"failure breakdown: {breakdown}")
    else:
        print("overall top failure: none")


def run_all_houses(trials: int, tier: int) -> None:
    total_ghosts = len(GD.ghosts)
    total_runs = total_ghosts * len(GD.houses) * trials
    print(f"AI hunt - {trials} runs per (house, ghost), tier {tier}, "
          f"{len(GD.houses)} houses x {total_ghosts} ghosts "
          f"({total_runs} runs total)")
    all_results: list[Result] = []
    for house in GD.houses:
        print()
        house_results = [simulate(name, house, trials, tier)
                         for name in GD.ghosts]
        all_results.extend(house_results)
        print_house_summary(house_results, keep=2)
    print_overall(all_results)


# ---- Experimental overrides -----------------------------------------
#
# Every override mutates the parsed game data in-place before any Hunt is
# constructed. Mc's default_factory reads GD.start_* lazily, so changing
# those values here flows through to every subsequent contract.

_OVERRIDE_FIELDS: list[tuple[str, str, type, str]] = [
    # (flag,              GD attribute,              cast, help-text fragment)
    ("--energy",          "start_energy",            float, "starting mc.energy"),
    ("--sanity",          "start_sanity",            float, "starting mc.sanity"),
    ("--lust",            "start_lust",              float, "starting mc.lust"),
    ("--energy-per-step", "energy_per_step",         float, "energy drain per nav tick"),
    ("--ghost-move-chance", "ghost_move_chance",     float, "P(ghost relocates) per 20-min interval"),
    ("--ghost-event-chance", "ghost_event_chance_per_step", float,
     "P(ghost event fires) per nav tick"),
    ("--hunt-threshold",  "hunt_base_threshold",     int,   "CheckHuntStart base threshold (0-100)"),
    ("--hide-success",    "hide_success_base",       float, "Hide.tw baseline success rate (0-1)"),
    ("--run-success",     "run_success_base",        float, "RunFast.tw baseline success rate (0-1)"),
    ("--lust-fuel-threshold", "lust_fuel_threshold", int,   "lust threshold for the passive tool bonus"),
]


def _apply_overrides(args: argparse.Namespace) -> list[str]:
    """Apply any --flag overrides to GD and return a list of human-readable
    '<field>=<value>' notes so headers can flag experimental runs."""
    notes: list[str] = []
    for flag, attr, _cast, _help in _OVERRIDE_FIELDS:
        dest = flag.lstrip("-").replace("-", "_")
        v = getattr(args, dest, None)
        if v is not None:
            setattr(GD, attr, v)
            notes.append(f"{attr}={v}")
    return notes


def _print_overrides_banner(notes: list[str]) -> None:
    if notes:
        print(f"[overrides active] {', '.join(notes)}")
        print()


def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="sim_ai_hunt.py",
        description="Simulate the simple AI playing haunted-house contracts. "
                    "Mechanics are parsed live from the game's .tw source.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Positional TARGET forms:\n"
            "  (omitted) / 'all'   -> every house x every ghost\n"
            "  <house>             -> all ghosts in that house\n"
            "  <house> <ghost>     -> detailed single combo\n"
            "  <ghost>             -> that ghost across all houses\n"
        ),
    )
    p.add_argument("target", nargs="?", default="all",
                   help="'all' (default), a house id, or a ghost name.")
    p.add_argument("target2", nargs="?", default=None,
                   help="When TARGET is a house, the second arg can name "
                        "a specific ghost for a detailed per-run report.")
    p.add_argument("--validate-data", action="store_true",
                   help="Check that the parser still finds every expected "
                        "piece of game data, then exit.")
    p.add_argument("--trials", type=int, default=None,
                   help="Runs per (house, ghost). Default 3000 for 'all', "
                        "5000 for single-house, 10000 for single combo.")
    p.add_argument("--tier", type=int, default=3,
                   help="Equipment tier for gwb/plasm/spiritbox (3/4/5). "
                        "Default 3.")
    p.add_argument("--companion", action="store_true",
                   help="Model the AI with a companion along. Halves the "
                        "baseline contract sanity drain per nav tick.")
    for flag, _attr, cast, help_text in _OVERRIDE_FIELDS:
        p.add_argument(flag, type=cast, default=None,
                       help=f"Override: {help_text}.")
    return p


def main() -> None:
    args = _build_parser().parse_args()

    if args.validate_data:
        errors = validate_game_data()
        if errors:
            print("sim_ai_hunt.py: game-data validation FAILED "
                  f"({len(errors)} issue(s)):", file=sys.stderr)
            for e in errors:
                print(f"  - {e}", file=sys.stderr)
            sys.exit(1)
        total_rooms = sum(len(v) for v in GD.houses.values())
        print(f"sim_ai_hunt.py: game-data validation OK "
              f"({len(GD.ghosts)} ghosts, {len(GD.houses)} houses, "
              f"{total_rooms} rooms, {len(GD.tier_chance)} tool tiers).")
        return

    notes = _apply_overrides(args)
    global SIM_COMPANION
    SIM_COMPANION = args.companion
    if args.companion:
        notes.append("companion=True")
    if args.tier not in GD.tier_chance:
        raise SystemExit(f"Unknown tier: {args.tier}. "
                         f"Choose from {sorted(GD.tier_chance)}.")

    target, target2 = args.target, args.target2

    if target == "all":
        trials = args.trials if args.trials is not None else 3000
        _print_overrides_banner(notes)
        run_all_houses(trials, args.tier)
    elif target in GD.houses:
        house = target
        if target2 is not None:
            if target2 not in GD.ghosts:
                raise SystemExit(
                    f"Unknown ghost: {target2!r}. "
                    f"Choose from {sorted(GD.ghosts)}.")
            trials = args.trials if args.trials is not None else 10000
            _print_overrides_banner(notes)
            print_detailed(simulate(target2, house, trials, args.tier))
        else:
            trials = args.trials if args.trials is not None else 5000
            _print_overrides_banner(notes)
            print(f"AI hunt - {trials} runs per ghost in {house} "
                  f"(tier {args.tier})")
            print()
            results = [simulate(name, house, trials, args.tier)
                       for name in GD.ghosts]
            for r in sorted(results, key=lambda x: x.wins / x.trials):
                rate, name, blurb = _row_for(r)
                print(f"  {name:<13} {rate:>7.2f}%   {blurb}")
            print_overall(results)
    elif target in GD.ghosts:
        ghost = target
        if target2 is not None:
            raise SystemExit(
                f"When TARGET is a ghost, TARGET2 isn't used (got "
                f"{target2!r}). Put the house first: "
                f"'sim_ai_hunt.py <house> {ghost}'.")
        trials = args.trials if args.trials is not None else 5000
        _print_overrides_banner(notes)
        print(f"AI hunt - {trials} runs vs {ghost} across "
              f"{len(GD.houses)} houses (tier {args.tier})")
        print()
        results = [simulate(ghost, house, trials, args.tier)
                   for house in GD.houses]
        for r in sorted(results, key=lambda x: x.wins / x.trials):
            rate = 100 * r.wins / r.trials
            fails = r.trials - r.wins
            if fails:
                reason, count = _top_reason(r.fail_reasons)
                blurb = f"{reason} {count}/{fails}"
            else:
                blurb = "-"
            print(f"  {r.house:<10} ({len(GD.houses[r.house]):>2} rooms)"
                  f"  {rate:>7.2f}%   {blurb}")
        print_overall(results)
    else:
        raise SystemExit(
            f"Unknown target: {target!r}. Use 'all', a house id "
            f"({sorted(GD.houses)}), or a ghost name "
            f"({sorted(GD.ghosts)}).")


if __name__ == "__main__":
    main()
