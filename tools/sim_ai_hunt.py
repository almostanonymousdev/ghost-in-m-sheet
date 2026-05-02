#!/usr/bin/env python3
"""
Simplistic AI that plays through a haunted-house contract against every
ghost type in every house (Owaissa / Elm / Enigma / Ironclad), using data
parsed from the game's own .tw sources at startup.

Models the core hunt loop from Ghost in M'Sheet:

  - Ghost picks a favorite room from the house's room list at contract
    start and can switch rooms every 20 in-game minutes with 45% chance
    (HauntedHouses.shuffleGhostRoom / HauntedHouses.rollStartingRoom).
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
    6 + prowlChanceBonus. If the ghost's canProwl(mc) gate is also satisfied,
    a prowl fires. The AI hides; ghost-specific override rules (Deogen,
    Jinn) apply via runningSucceeds / hidingSucceeds.
  - Exit reasons tracked: identified, energy, sanity_zero (HuntOverSanity),
    caught_in_hunt (HuntEnd), search_timeout.

Simple AI patterns:
  1) "Find ghost's favorite room" - walk rooms with lights ON (safe),
     take temperature readings; elevated reading (>= 18) means ghost room.
  2) "Scan for evidence in the ghost's room" - turn lights off for the
     tool bonus, scan every tool each round, revert lights if sanity gets
     dangerous. As soon as any evidence reads positive (the room is
     confirmed), force EMF/UVL windows open so the timed-tool scans
     succeed this pass instead of waiting for a ghost event. If evidence
     is still incomplete and the ghost relocates, drop back to pattern 1.
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


REPO_ROOT = Path(__file__).resolve().parent.parent
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
    # prowlCondition is either `mc.sanity <= N` or `mc.lust >= N`.
    hc = _need(re.search(
        r'prowlCondition:[^,]*?mc\.(sanity|lust)\s*(<=|>=)\s*(\d+)', block),
        f"prowlCondition for {name}")
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
    nude / lust_fuel / lust_100 / overcharged / orgasm_cooldown.
    The [^}]+ capture stops at the first `}`, which is fine because every
    branch's stat assignments precede its snap.contributors.push({...})
    call; the assignments we care about are inside the truncated body."""
    branches = {
        "dark":            r'if \(isCurrentRoomDark\(\)\)\s*\{([^}]+)\}',
        "topless":         r'if \(snap\.clothing === "topless"\)\s*\{([^}]+)\}',
        "nude":            r'else if \(snap\.clothing === "nude"\)\s*\{([^}]+)\}',
        "lust_fuel":       r'if \(mc && mc\.lust >= LUST_FUEL_THRESHOLD\)\s*\{([^}]+)\}',
        "lust_100":        r'if \(mc && mc\.lust >= 100\)\s*\{([^}]+)\}',
        "overcharged":     r'if \(snap\.overchargedTools\)\s*\{([^}]+)\}',
        "orgasm_cooldown": r'if \(cooldown > 0\)\s*\{([^}]+)\}',
    }
    fields = {
        "sanity_per_step":  r'snap\.sanityPerStep\s*([+\-])=\s*([\d.]+)',
        "lust_per_step":    r'snap\.lustPerStep\s*([+\-])=\s*([\d.]+)',
        "energy_per_step":  r'snap\.energyPerStep\s*([+\-])=\s*([\d.]+)',
        "tool_chance":      r'snap\.toolChanceBonus\s*([+\-])=\s*([\d.]+)',
        "tool_window":      r'snap\.toolWindowBonus\s*([+\-])=\s*([\d.]+)',
        "hunt_chance":      r'snap\.prowlChanceBonus\s*([+\-])=\s*([\d.]+)',
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


def _parse_orgasm_spend(widget_src: str) -> dict[str, float]:
    """Pull the widgetEvent.tw `shouldOrgasm` spend block: -N sanity, -M lust,
    cooldown=K. These values also live in PS2-style passage code so we parse
    them rather than hardcode, matching how every other mechanics constant
    flows through the loader."""
    sanity_m = re.search(r'<<addSanity\s+-(\d+)>>', widget_src)
    lust_m   = re.search(r'<<addLust\s+-(\d+)>>',   widget_src)
    cd_m     = re.search(r'setOrgasmCooldown\s*\(\s*(\d+)\s*\)', widget_src)
    if not (sanity_m and lust_m and cd_m):
        raise SystemExit(
            "parser: widgetEvent.tw orgasm spend block not found "
            "(addSanity / addLust / orgasmCooldownSteps)")
    return {
        "sanity_loss":   float(sanity_m.group(1)),
        "lust_drop":     float(lust_m.group(1)),
        "cooldown_steps": int(cd_m.group(1)),
    }


def _parse_orgasm_body_part_ratio(events_src: str) -> float:
    """Count body parts that can orgasm vs total. setup.Events.shouldOrgasm
    returns true for a subset of body parts; the total bodypart set is
    EventsController.tw's bodyPartKeys array."""
    # shouldOrgasm has two return statements; we want the `return bodyPart
    # === 'x' || bodyPart === 'y' ...` one, not the `return false` guard.
    gate_m = re.search(
        r"return\s+(bodyPart\s*===\s*'\w+'(?:\s*\|\|\s*bodyPart\s*===\s*'\w+')*)",
        events_src)
    all_m  = re.search(r'bodyPartKeys\s*=\s*\[([^\]]+)\]', events_src)
    if not (gate_m and all_m):
        raise SystemExit("parser: shouldOrgasm / bodyPartKeys not found")
    orgasm_parts = re.findall(r"'(\w+)'", gate_m.group(1))
    all_parts    = re.findall(r"'(\w+)'", all_m.group(1))
    if not (orgasm_parts and all_parts):
        raise SystemExit("parser: couldn't extract body-part lists")
    return len(orgasm_parts) / len(all_parts)


def _parse_event_choice_costs(event_mc_src: str) -> dict[str, float]:
    """Pull the Run / Embrace inline expressions from EventMC.tw so the sim
    picks up whatever the passage currently charges for each choice. Embrace
    sanity is a per-ghost random roll (setup.Events.ghostSanityEventDecreased
    -> Ghost.rollEventSanityLoss), so we just verify the call shape is
    present here; the simulator rolls each ghost's sanityEventLossRange."""
    run_m = re.search(
        r"Run away[^\[]*\[setup\.Mc\.addEnergy\(-(\d+)\)\]", event_mc_src)
    embrace_m = re.search(
        r"Embrace it[^\[]*\[setup\.Mc\.addSanity\("
        r"-setup\.Events\.ghostSanityEventDecreased\(\)\);\s*"
        r"setup\.addLust\((\d+)\)\]",
        event_mc_src)
    if not (run_m and embrace_m):
        raise SystemExit("parser: EventMC.tw Run/Embrace cost block not found")
    return {
        "run_energy":   float(run_m.group(1)),
        "embrace_lust": float(embrace_m.group(1)),
    }


def _parse_temperature(src: str) -> dict[str, int]:
    """Pull base range + ghost-room offsets from TemperatureHigh.tw. Shape:
    {base_lo, base_hi, offset_with_temp, offset_no_temp}. Lets the AI's
    room-detection threshold track the game's reading distribution."""
    base = re.search(
        r'random\((\d+),\s*(\d+)\)\s*\+\s*setup\.Time\.temperature\(\)', src)
    with_temp = re.search(
        r'_inGhostRoom\s+and\s+_hasTempEvidence>>\s*'
        r'<<set\s+_offset\s+to\s+(\d+)', src)
    no_temp = re.search(
        r'<<elseif\s+_inGhostRoom>>\s*<<set\s+_offset\s+to\s+(\d+)', src)
    if not (base and with_temp and no_temp):
        raise SystemExit("parser: TemperatureHigh.tw constants not found")
    return {
        "base_lo": int(base.group(1)),
        "base_hi": int(base.group(2)),
        "offset_with_temp": int(with_temp.group(1)),
        "offset_no_temp": int(no_temp.group(1)),
    }


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
    temp_base_lo: int                        # TemperatureHigh.tw random(lo,hi)
    temp_base_hi: int
    temp_offset_with_temp: int               # ghost room + temp evidence
    temp_offset_no_temp: int                 # ghost room without temp evidence
    snapshot_bonuses: dict[str, dict[str, float]]
    contract_sanity_drain: float             # baseline sanity -= /step in-house
    contract_sanity_drain_with_companion: float
    dawn_minutes: int                        # HuntOverTime fires at $hours >= 6
    orgasm_sanity_loss: float                # widgetEvent.tw shouldOrgasm spend
    orgasm_lust_drop: float
    orgasm_cooldown_steps: int
    orgasm_lust_threshold: int               # shouldOrgasm gate
    orgasm_body_part_ratio: float            # P(event body-part triggers orgasm)
    event_run_energy: float                  # EventMC Run away cost
    event_embrace_lust: float                # EventMC Embrace it gain
    # Embrace sanity cost is a per-ghost random roll
    # (setup.Events.ghostSanityEventDecreased -> Ghost.rollEventSanityLoss),
    # so the simulator draws from each ghost's sanityEventLossRange instead
    # of carrying a single scalar here.
    ghost_event_chance_per_step: float = 0.05  # not encoded as a single
                                               # constant in-game; keeps the
                                               # ArtEvent/EventMC/Freeze
                                               # activation rate tunable.


def load_game_data() -> GameData:
    story_script = _read("StoryScript.tw")
    story_init = _read("mc/GameInit.tw")
    hh_controller = _read("haunted_houses/HauntedHousesController.tw")
    hunt_controller = _read("hunt/HuntController.tw")
    hide_tw = _read("haunted_houses/general/Hide.tw")
    run_tw = _read("haunted_houses/general/RunFast.tw")
    temp_tw = _read("haunted_houses/tools/TemperatureHigh.tw")
    widget_event = _read("events/widgetEvent.tw")
    events_ctl = _read("events/EventsController.tw")
    event_mc = _read("events/EventMC.tw")
    time_ctl = _read("time/TimeController.tw")
    style_controller = _read("styles/StyleController.tw")

    ghosts = {g["name"]: g for g in _load_ghosts()}

    tier_chance_raw = _parse_int_map(story_script, r"setup\.TIER_CHANCE")
    tier_chance = {k: v / 100.0 for k, v in tier_chance_raw.items()}
    tool_window = _parse_int_map(story_script, r"setup\.TOOL_TIME_REMAIN")

    # HauntConditions constants.
    energy_per_step = _find_num(r"var\s+ENERGY_PER_STEP\s*=\s*([\d.]+)",
                                story_script)
    lust_fuel = int(_find_num(r"var\s+LUST_FUEL_THRESHOLD\s*=\s*(\d+)",
                              story_script))
    dark_bg = int(_find_num(r"DARK:\s*(\d+)", style_controller))
    snapshot_bonuses = _parse_snapshot_bonuses(story_script)
    contract_drain, companion_drain = _parse_contract_drain(story_script)
    temp_cfg = _parse_temperature(temp_tw)

    # mc starting stats (mc/GameInit.tw).
    start_sanity = _find_num(r"sanity\s*:\s*(\d+)", story_init)
    start_lust   = _find_num(r"lust\s*:\s*(\d+)",   story_init)
    start_energy = _find_num(r"energy\s*:\s*(\d+)", story_init)

    # HuntController.tw shuffleGhostRoom(): Math.random() < 0.45.
    # The classic-mode dispatch lives there now (HauntedHousesController
    # only owns the per-mode driftGhostRoom helper that picks the
    # destination room).
    ghost_move_chance = _find_num(
        r"function\s+shuffleGhostRoom[^{}]*\{[^}]*?Math\.random\(\)\s*<\s*([\d.]+)",
        hunt_controller)

    # HauntedHousesController shouldStartRandomProwl(): threshold base + HauntConditions bonus
    hunt_base_threshold = int(_find_num(
        r"shouldStartRandomProwl:[^}]*?var\s+threshold\s*=\s*(\d+)",
        hh_controller))

    # Hide.tw: `if _checkH lte 50` -> success (swap: player lucky)
    hide_pct = _find_num(r"_checkH\s+lte\s+(\d+)", hide_tw) / 100.0

    # RunFast.tw: `if _check lte 30` -> caught; success = 1 - that.
    run_caught = _find_num(r"_check\s+lte\s+(\d+)", run_tw) / 100.0

    # TimeController.tw: `isMorningPlus: function () { return sv().hours >= N; }`
    # PassageDone gates dawn via setup.Time.isMorningPlus(), which reads this.
    dawn_hours = int(_find_num(r"isMorningPlus:[^}]*?hours\s*>=\s*(\d+)",
                               time_ctl))

    # widgetEvent.tw + EventsController.tw: orgasm spend + gate
    orgasm = _parse_orgasm_spend(widget_event)
    orgasm_threshold = int(_find_num(
        r'shouldOrgasm:\s*function[^{]*\{[^}]*?lust\(?\)?\s*<\s*(\d+)',
        events_ctl + "\n"))
    orgasm_ratio = _parse_orgasm_body_part_ratio(events_ctl)

    # EventMC.tw: Run / Embrace costs
    event_costs = _parse_event_choice_costs(event_mc)

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
        temp_base_lo=temp_cfg["base_lo"],
        temp_base_hi=temp_cfg["base_hi"],
        temp_offset_with_temp=temp_cfg["offset_with_temp"],
        temp_offset_no_temp=temp_cfg["offset_no_temp"],
        snapshot_bonuses=snapshot_bonuses,
        contract_sanity_drain=contract_drain,
        contract_sanity_drain_with_companion=companion_drain,
        dawn_minutes=dawn_hours * 60,
        orgasm_sanity_loss=orgasm["sanity_loss"],
        orgasm_lust_drop=orgasm["lust_drop"],
        orgasm_cooldown_steps=orgasm["cooldown_steps"],
        orgasm_lust_threshold=orgasm_threshold,
        orgasm_body_part_ratio=orgasm_ratio,
        event_run_energy=event_costs["run_energy"],
        event_embrace_lust=event_costs["embrace_lust"],
    )


GD = load_game_data()

STEP_MINUTES = 1                 # one nav tick = one in-game minute
HUNT_EVENT_SANITY_LOSS_DEFAULT = (1, 5)  # Ghost.rollEventSanityLoss default

# Temperature detection threshold used by the AI. This is a simulator-side
# policy, not a game constant; the game displays the reading in red/yellow/
# green so a human doesn't threshold the number directly. Keep this at the
# game's historic "unambiguous" value so raising temp_base_hi or lowering
# temp_offset_no_temp in the game source creates false positives / negatives
# around the AI's fixed rule. Overridable via --temp-ai-threshold.
TEMP_AI_THRESHOLD = 18


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
                f"ghost {name}: bad prowlCondition kind {kind!r}")
        require(0 < threshold <= 100,
                f"ghost {name}: prowlCondition threshold {threshold} "
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
            f"shuffleGhostRoom Math.random() threshold "
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
    for branch in ("dark", "topless", "nude", "lust_fuel", "lust_100",
                   "overcharged", "orgasm_cooldown"):
        d = GD.snapshot_bonuses.get(branch)
        require(bool(d), f"snapshot branch {branch!r} missing from parser")
        if d:
            require(any(v != 0 for v in d.values()),
                    f"snapshot branch {branch!r} has no nonzero deltas: {d}")

    # Orgasm spend + event-choice constants.
    require(GD.orgasm_sanity_loss > 0,
            f"orgasm sanity loss {GD.orgasm_sanity_loss} must be > 0")
    require(GD.orgasm_lust_drop > 0,
            f"orgasm lust drop {GD.orgasm_lust_drop} must be > 0")
    require(GD.orgasm_cooldown_steps > 0,
            f"orgasm cooldown steps {GD.orgasm_cooldown_steps} must be > 0")
    require(0 < GD.orgasm_lust_threshold <= 100,
            f"orgasm lust threshold {GD.orgasm_lust_threshold} out of (0,100]")
    require(0 < GD.orgasm_body_part_ratio <= 1,
            f"orgasm body-part ratio {GD.orgasm_body_part_ratio} out of (0,1]")
    require(GD.event_run_energy > 0,
            f"event run energy {GD.event_run_energy} must be > 0")
    require(GD.event_embrace_lust > 0,
            f"event embrace lust {GD.event_embrace_lust} must be > 0")
    require(GD.dawn_minutes > 0,
            f"dawn minutes {GD.dawn_minutes} must be > 0")

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
    hunt_active_flag: bool = False   # $prowlActivated
    orgasm_cooldown: int = 0  # $orgasmCooldownSteps
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
                    energy_per_step=0.0,
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
        if self.mc.lust >= 100:
            active.append("lust_100")
        if self.overcharged:
            active.append("overcharged")
        if self.orgasm_cooldown > 0:
            active.append("orgasm_cooldown")
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
                elif k == "energy_per_step":
                    snap["energy_per_step"] += v
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
        string if the hunt ends this tick ("sanity_zero", "caught_in_hunt",
        "dawn", "energy"), else None."""
        self.current_room = room
        self.minutes += STEP_MINUTES
        self.mc.energy -= GD.energy_per_step
        self._maybe_move_ghost()

        # Per-step tick effects (HauntConditions.applyTickEffects). The
        # energy drain inside the helper is on top of the nav-step drain
        # above (matches the snapshot's energyPerStep contributor — used
        # by the orgasm cooldown axis).
        # Sanity never hits 0 via natural drain (min clamp 1); the hunt-over
        # -sanity exit comes from GhostHuntEvent's rollEventSanityLoss. We
        # still surface sanity_zero if some future sink drives it below 1.
        self._apply_tick_effects()

        if self.orgasm_cooldown > 0:
            self.orgasm_cooldown -= 1

        # Ghost event (activates tools, may trigger orgasm, forces
        # Run/Embrace choice).
        if random.random() < GD.ghost_event_chance_per_step:
            reason = self._resolve_ghost_event()
            if reason:
                return reason

        # Random ghost-hunt roll (CheckHuntStart.tw).
        if not self.hunt_active_flag and can_hunt(
                self.ghost_name, self.mc.sanity, self.mc.lust):
            threshold = GD.hunt_base_threshold + self.snapshot()["hunt_chance_bonus"]
            if random.randint(0, 100) <= threshold:
                reason = self._resolve_hunt_event()
                if reason:
                    return reason

        if self.minutes >= GD.dawn_minutes:
            return "dawn"
        if self.mc.energy <= 0:
            return "energy"
        return None

    def _resolve_ghost_event(self) -> str | None:
        """widgetEvent.tw + EventMC.tw: tools activate, orgasm may fire if
        lust is at threshold, then the player picks Run (energy) or
        Embrace (sanity/lust). AI runs whenever it can afford to -- energy
        is the stricter resource than sanity under the current balance."""
        self._activate("uvl")
        self._activate("emf")

        # shouldOrgasm: lust at threshold AND the event body-part is one
        # of the orgasm-capable ones. Applied BEFORE the player choice,
        # matching widgetEvent.tw's inline spend above the EventMC link block.
        if (self.mc.lust >= GD.orgasm_lust_threshold
                and random.random() < GD.orgasm_body_part_ratio):
            self.mc.sanity -= GD.orgasm_sanity_loss
            self.mc.lust   -= GD.orgasm_lust_drop
            if self.mc.lust < 0:   self.mc.lust = 0
            self.orgasm_cooldown = GD.orgasm_cooldown_steps
            if self.mc.sanity < 1:
                self.mc.sanity = 0
                return "sanity_zero"

        # Player choice. Run preserves sanity but burns a full energy
        # point; Embrace is sanity-negative but costs no energy. Embrace
        # sanity is a per-ghost roll from sanityEventLossRange (matches
        # setup.Events.ghostSanityEventDecreased -> rollEventSanityLoss).
        if self.mc.energy >= GD.event_run_energy:
            self.mc.energy -= GD.event_run_energy
            if self.mc.energy <= 0:
                return "energy"
        else:
            lo, hi = GD.ghosts[self.ghost_name].get(
                "sanity_loss", HUNT_EVENT_SANITY_LOSS_DEFAULT)
            self.mc.sanity -= random.randint(lo, hi)
            self.mc.lust   += GD.event_embrace_lust
            if self.mc.lust > 100: self.mc.lust = 100
            if self.mc.sanity < 1:
                self.mc.sanity = 0
                return "sanity_zero"
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
        # After the event, the prowl-trigger clock resets (prowlActivated=1;
        # next CheckHuntStart waits for elapsedTimeProwl >= prowlTimeRemain).
        # Approximate with a 60-minute cooldown window expressed as
        # "no new hunt this step"; next step we re-arm the flag.
        self.hunt_active_flag = False
        return None

    # --- tool rolls ----------------------------------------------------
    def _apply_tick_effects(self) -> None:
        """Mirror of setup.HauntConditions.applyTickEffects(): bleed
        sanity/lust/energy per the active snapshot bonuses. Called from
        nav steps and from controller-routed tool checks (gwb / plasm /
        spiritbox / emf / uvl), matching the production call sites in
        widgetInclude.tw and ToolController.render."""
        snap = self.snapshot()
        self.mc.sanity = clamp(self.mc.sanity + snap["sanity_per_step"],
                               1, GD.start_sanity)
        self.mc.lust   = clamp(self.mc.lust + snap["lust_per_step"], 0, 100)
        self.mc.energy += snap["energy_per_step"]

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

    def tool_tick(self) -> str | None:
        """widgetInclude.tw `<<toolTick>>`: each tool click burns one
        in-game minute and routes to HuntOverTime if dawn just broke. The
        per-tick drain itself is *not* applied here -- it fires once per
        meter completion inside ToolController.render (mirrored by the
        controller-routed scan methods below). Returns 'dawn' exit reason
        when the click pushed the clock past 6am."""
        self.minutes += STEP_MINUTES
        if self.minutes >= GD.dawn_minutes:
            return "dawn"
        return None

    def temperature_scan(self) -> int:
        base = random.randint(GD.temp_base_lo, GD.temp_base_hi)
        offset = 0
        if self.current_room == self.ghost_room:
            has_temp = "temperature" in self.ghost_evidence
            offset = GD.temp_offset_with_temp if has_temp else GD.temp_offset_no_temp
            # Temperature evidence only registers when the reading actually
            # beats the AI's detection threshold; otherwise it reads cold and
            # the AI can't confirm temp as one of the three evidences.
            if has_temp and base + offset >= TEMP_AI_THRESHOLD:
                self.found.add("temperature")
        return base + offset

    def gwb_scan(self) -> bool:
        self._apply_tick_effects()
        if self.current_room != self.ghost_room or "gwb" not in self.ghost_evidence:
            return False
        if self._roll_tier():
            self.found.add("gwb")
            self._activate("emf")
            return True
        return False

    def plasm_scan(self) -> bool:
        self._apply_tick_effects()
        if self.current_room != self.ghost_room or "glass" not in self.ghost_evidence:
            return False
        if self._roll_tier():
            self.found.add("glass")
            return True
        return False

    def spiritbox_scan(self) -> bool:
        self._apply_tick_effects()
        if self.current_room != self.ghost_room or "spiritbox" not in self.ghost_evidence:
            return False
        if self._roll_tier():
            self.found.add("spiritbox")
            self._activate("emf")
            return True
        return False

    def emf_scan(self) -> bool:
        self._apply_tick_effects()
        if self.current_room != self.ghost_room or "emf" not in self.ghost_evidence:
            return False
        if self.minutes > self.emf_until:
            return False
        self.found.add("emf")
        return True

    def uvl_scan(self) -> bool:
        self._apply_tick_effects()
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
    'found' / 'energy' / 'sanity_zero' / 'caught_in_hunt' / 'dawn'
    / 'search_timeout'."""
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
        tick_reason = hunt.tool_tick()
        if tick_reason:
            return None, tick_reason
        if reading >= TEMP_AI_THRESHOLD:
            return dest, "found"
        seen_cold.add(dest)
        tried += 1
    return None, "search_timeout"


def pattern_scan_for_evidence(hunt: Hunt, suspected: str, rounds: int = 6
                              ) -> tuple[bool, str | None]:
    """Scan every tool each round. Each tool click burns 1 in-game minute
    (widgetInclude.tw `<<toolTick>>`), so a full round is 1 nav + 6 tool
    clicks = 7 in-game minutes. Turns lights off for the tool bonus
    unless sanity is already below SANITY_DANGER. Returns (complete,
    exit_reason). complete=True when the evidence set is fully confirmed."""
    # GWB / Spiritbox roll before EMF so their hits can open the EMF window
    # in the same pass; temperature runs first to match the
    # pattern_find_ghost_room cadence.
    # Each entry pairs a scan callable with the timed-tool name it fronts
    # ("" for non-timed scans). Keeping the tag alongside the callable
    # avoids fragile bound-method identity checks in the activation step.
    scans: list[tuple[callable, str]] = [
        (hunt.temperature_scan, ""), (hunt.gwb_scan,       ""),
        (hunt.spiritbox_scan,   ""), (hunt.plasm_scan,     ""),
        (hunt.emf_scan,      "emf"), (hunt.uvl_scan,    "uvl"),
    ]
    for _ in range(rounds):
        if hunt.out_of_energy():
            return hunt.found >= hunt.ghost_evidence, "energy"
        # Dynamic safety: lights off unless sanity is near-critical.
        hunt.lights[suspected] = (LIGHT_OFF if hunt.mc.sanity > SANITY_DANGER
                                  else LIGHT_ON)
        exit_reason = hunt.move_to(suspected)
        if exit_reason:
            return hunt.found >= hunt.ghost_evidence, exit_reason
        for scan, timed_tool in scans:
            # Once any evidence has confirmed the ghost's room, force the
            # EMF/UVL windows open so those timed-tool scans read positive
            # this pass instead of waiting on a ghost event to activate them.
            if timed_tool and hunt.found:
                hunt._activate(timed_tool)
            scan()
            tick_reason = hunt.tool_tick()
            if tick_reason:
                return hunt.found >= hunt.ghost_evidence, tick_reason
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
        "energy": 0, "sanity_zero": 0, "caught_in_hunt": 0,
        "dawn": 0, "search_timeout": 0,
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
    ("--temp-base-lo",    "temp_base_lo",            int,   "lower bound of normal-room temperature roll"),
    ("--temp-base-hi",    "temp_base_hi",            int,   "upper bound of normal-room temperature roll (raise for false positives)"),
    ("--temp-offset-with-temp", "temp_offset_with_temp", int, "offset added in ghost's room when the ghost has temp evidence"),
    ("--temp-offset-no-temp",   "temp_offset_no_temp",   int, "offset added in ghost's room when the ghost lacks temp evidence (lower for false negatives)"),
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
    p.add_argument("--temp-ai-threshold", type=int, default=None,
                   help=f"Override: AI temperature-detection threshold "
                        f"(default {TEMP_AI_THRESHOLD}).")
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
    global SIM_COMPANION, TEMP_AI_THRESHOLD
    SIM_COMPANION = args.companion
    if args.companion:
        notes.append("companion=True")
    if args.temp_ai_threshold is not None:
        TEMP_AI_THRESHOLD = args.temp_ai_threshold
        notes.append(f"TEMP_AI_THRESHOLD={TEMP_AI_THRESHOLD}")
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
