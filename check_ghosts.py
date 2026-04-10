#!/usr/bin/env python3
"""
Ghost data integrity checker for Better Ghost Hunter.

Validates that:
  - All 18 ghosts ($ghost1-$ghost18) are defined somewhere in the passages
  - Each ghost has exactly 3 evidence types
  - Each evidence type is from the known valid set
  - No ghost has duplicate evidence types
  - The ghost randomizer in GhostRandomize uses random(1, N) where N matches
    the number of ghosts defined
"""

import re
import sys
from pathlib import Path

VALID_EVIDENCE = {"emf", "gwb", "temperature", "glass", "spiritbox", "uvl"}
EXPECTED_GHOST_COUNT = 18
EVIDENCE_PER_GHOST = 3

# Mirrors the $EvidenceType enum defined in StoryInit.tw
EVIDENCE_TYPE_ENUM = {
    "EMF":         "emf",
    "SPIRITBOX":   "spiritbox",
    "GWB":         "gwb",
    "GLASS":       "glass",
    "TEMPERATURE": "temperature",
    "UVL":         "uvl",
}

# Matches:  <<set $ghostN to {  ... evidence: ["a", "b", "c"] ... }>>
# We parse this in two passes: find the ghost number and evidence list separately.
GHOST_SET = re.compile(r'<<set\s+\$ghost(\d+)\s+to\s+\{')
EVIDENCE_LIST = re.compile(r'evidence:\s*\[([^\]]+)\]')
# Matches $EvidenceType.KEY references
EVIDENCE_TYPE_REF = re.compile(r'\$EvidenceType\.([A-Z_]+)')
# Matches random(1,N) in GhostRandomize. N is either a numeric literal
# or the setup.GHOST_SLOT_COUNT constant defined in StoryScript.
RANDOM_CALL = re.compile(r'random\s*\(\s*1\s*,\s*([\w\.]+)\s*\)')
GHOST_SLOT_CONST = re.compile(r'setup\.GHOST_SLOT_COUNT\s*=\s*(\d+)')


def extract_strings(bracketed: str) -> list[str]:
    """
    Pull evidence values out of a JS-style array literal.
    Handles both legacy quoted strings ("emf") and enum references ($EvidenceType.EMF).
    """
    # Resolve $EvidenceType.KEY references
    enum_values = [
        EVIDENCE_TYPE_ENUM[m.group(1)]
        for m in EVIDENCE_TYPE_REF.finditer(bracketed)
        if m.group(1) in EVIDENCE_TYPE_ENUM
    ]
    if enum_values:
        return enum_values
    # Fall back to quoted string literals for any legacy definitions
    return re.findall(r'["\']([^"\']+)["\']', bracketed)


def parse_ghosts(passages_dir: Path) -> dict[int, dict]:
    """
    Scan all .tw files and return a mapping of ghost number -> {name, evidence, file}.
    Only the last definition wins (mirrors SugarCube runtime behaviour).
    """
    ghosts: dict[int, dict] = {}
    for tw_file in sorted(passages_dir.rglob("*.tw")):
        text = tw_file.read_text(encoding="utf-8", errors="replace")
        # Find every <<set $ghostN to { ... }>> block.
        # We scan line by line and accumulate until we find the closing }>>
        lines = text.splitlines()
        i = 0
        while i < len(lines):
            m = GHOST_SET.search(lines[i])
            if m:
                ghost_num = int(m.group(1))
                # Gather lines until closing }>> or <<set (next macro)
                block_lines = [lines[i]]
                j = i + 1
                while j < len(lines) and "}>" not in lines[j - 1]:
                    block_lines.append(lines[j])
                    j += 1
                block = "\n".join(block_lines)
                em = EVIDENCE_LIST.search(block)
                if em:
                    evidence = extract_strings(em.group(1))
                    ghosts[ghost_num] = {
                        "evidence": evidence,
                        "file": tw_file,
                    }
            i += 1
    return ghosts


def parse_randomizer_max(passages_dir: Path) -> int | None:
    """Return the upper bound N from random(1,N) in GhostRandomize."""
    randomize_file = passages_dir / "haunted_houses" / "general" / "GhostRandomize__event.tw"
    if not randomize_file.exists():
        return None
    text = randomize_file.read_text(encoding="utf-8", errors="replace")
    m = RANDOM_CALL.search(text)
    if not m:
        return None
    raw = m.group(1)
    if raw.isdigit():
        return int(raw)
    if raw == "setup.GHOST_SLOT_COUNT":
        story_script = passages_dir / "StoryScript__script_.t.tw"
        if story_script.exists():
            cm = GHOST_SLOT_CONST.search(story_script.read_text(encoding="utf-8", errors="replace"))
            if cm:
                return int(cm.group(1))
    return None


def main():
    repo_root = Path(__file__).parent
    passages_dir = repo_root / "passages"

    if not passages_dir.is_dir():
        print(f"ERROR: passages directory not found at {passages_dir}", file=sys.stderr)
        sys.exit(1)

    ghosts = parse_ghosts(passages_dir)
    randomizer_max = parse_randomizer_max(passages_dir)

    failed = False

    # 1. Check all expected ghosts are defined
    missing_nums = [n for n in range(1, EXPECTED_GHOST_COUNT + 1) if n not in ghosts]
    if missing_nums:
        failed = True
        print(f"MISSING GHOST DEFINITIONS: {missing_nums}")

    # 2. Check randomizer upper bound matches ghost count
    if randomizer_max is not None and randomizer_max != EXPECTED_GHOST_COUNT:
        failed = True
        print(
            f"RANDOMIZER MISMATCH: GhostRandomize uses random(1,{randomizer_max}) "
            f"but {EXPECTED_GHOST_COUNT} ghosts are expected"
        )
    defined_count = len(ghosts)
    if randomizer_max is not None and randomizer_max != defined_count:
        failed = True
        print(
            f"RANDOMIZER MISMATCH: GhostRandomize uses random(1,{randomizer_max}) "
            f"but only {defined_count} ghosts are actually defined"
        )

    # 3. Validate each ghost's evidence
    evidence_errors: list[str] = []
    for num in sorted(ghosts):
        info = ghosts[num]
        ev = info["evidence"]
        try:
            rel = info["file"].relative_to(repo_root)
        except ValueError:
            rel = info["file"]

        if len(ev) != EVIDENCE_PER_GHOST:
            evidence_errors.append(
                f"  $ghost{num} ({rel}): expected {EVIDENCE_PER_GHOST} evidence types, got {len(ev)}: {ev}"
            )

        unknown = [e for e in ev if e not in VALID_EVIDENCE]
        if unknown:
            evidence_errors.append(
                f"  $ghost{num} ({rel}): unknown evidence type(s): {unknown}  "
                f"(valid: {sorted(VALID_EVIDENCE)})"
            )

        dupes = [e for e in ev if ev.count(e) > 1]
        if dupes:
            evidence_errors.append(
                f"  $ghost{num} ({rel}): duplicate evidence: {list(set(dupes))}"
            )

    if evidence_errors:
        failed = True
        print(f"\nGHOST EVIDENCE ERRORS ({len(evidence_errors)}):\n")
        for err in evidence_errors:
            print(err)

    if not failed:
        print(
            f"All {defined_count} ghosts defined, "
            f"each with {EVIDENCE_PER_GHOST} valid evidence types. "
            f"Randomizer range matches."
        )

    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
