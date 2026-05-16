#!/usr/bin/env python3
"""
Ghost data integrity checker for Better Ghost Hunter.

Validates that:
  - All 18 ghosts are defined in setup.Ghosts (GhostController.js)
  - Each ghost has exactly 3 evidence types
  - Each evidence type is from the known valid set
  - No ghost has duplicate evidence types
  - The hunt startup logic in HuntController draws ghosts from setup.Ghosts
"""

import re
import sys
from pathlib import Path

from lib_repo import iter_sources, passages_dir, read_passage, repo_root

VALID_EVIDENCE = {"emf", "gwb", "temperature", "glass", "spiritbox", "uvl"}
EXPECTED_GHOST_COUNT = 18
EVIDENCE_PER_GHOST = 3

# Mirrors setup.Ghosts.EvidenceType defined in GhostController.js
EVIDENCE_TYPE_ENUM = {
    "EMF":         "emf",
    "SPIRITBOX":   "spiritbox",
    "GWB":         "gwb",
    "GLASS":       "glass",
    "TEMPERATURE": "temperature",
    "UVL":         "uvl",
}

# Any ghost object literal: a `{...}` block containing both a `name: "..."`
# field and an `evidence: [...]` array. Field order doesn't matter as long as
# both sit inside the same brace pair (enforced by the [^{}] class).
GHOST_OBJECT = re.compile(
    r'\{[^{}]*?name:\s*["\']([^"\']+)["\'][^{}]*?evidence:\s*\[([^\]]+)\]',
    re.DOTALL,
)
# Evidence constants can be referenced either via `$EvidenceType.KEY`
# (legacy) or `E.KEY` (the local alias used inside GhostController).
EVIDENCE_TYPE_REF = re.compile(r'(?:\$EvidenceType|\bE)\.([A-Z_]+)')


def extract_evidence(bracketed: str) -> list[str]:
    """
    Pull evidence values out of a JS-style array literal.
    Handles quoted strings ("emf") and enum references (E.EMF, $EvidenceType.EMF).
    """
    enum_values = [
        EVIDENCE_TYPE_ENUM[m.group(1)]
        for m in EVIDENCE_TYPE_REF.finditer(bracketed)
        if m.group(1) in EVIDENCE_TYPE_ENUM
    ]
    if enum_values:
        return enum_values
    return re.findall(r'["\']([^"\']+)["\']', bracketed)


def parse_ghosts() -> list[dict]:
    """
    Scan every source file (.tw + .js) and return a list of
    {name, evidence, file} entries for every ghost object literal encountered.
    """
    ghosts: list[dict] = []
    for src_file in iter_sources():
        text = read_passage(src_file)
        for m in GHOST_OBJECT.finditer(text):
            name = m.group(1)
            evidence = extract_evidence(m.group(2))
            ghosts.append({"name": name, "evidence": evidence, "file": src_file})
    return ghosts


def randomizer_uses_setup_ghosts() -> bool:
    """Verify hunt startup draws its ghost from setup.Ghosts."""
    hunt_file = passages_dir() / "hunt" / "HuntController.js"
    if not hunt_file.exists():
        return False
    return "setup.Ghosts.names" in read_passage(hunt_file)


def main():
    root = repo_root()
    pdir = passages_dir()

    if not pdir.is_dir():
        print(f"ERROR: passages directory not found at {pdir}", file=sys.stderr)
        sys.exit(1)

    ghosts = parse_ghosts()

    failed = False

    # Collapse duplicate names (same ghost may appear in multiple passages,
    # e.g. Cthulion lives in setup.Ghosts *and* in PassageReady save migration).
    unique_by_name: dict[str, dict] = {}
    for entry in ghosts:
        unique_by_name.setdefault(entry["name"], entry)

    defined_count = len(unique_by_name)

    if defined_count != EXPECTED_GHOST_COUNT:
        failed = True
        print(
            f"GHOST COUNT MISMATCH: expected {EXPECTED_GHOST_COUNT} unique ghosts, "
            f"found {defined_count}: {sorted(unique_by_name)}"
        )

    if not randomizer_uses_setup_ghosts():
        failed = True
        print(
            "RANDOMIZER MISMATCH: HuntController.js does not reference setup.Ghosts.names"
        )

    evidence_errors: list[str] = []
    for name in sorted(unique_by_name):
        info = unique_by_name[name]
        ev = info["evidence"]
        try:
            rel = info["file"].relative_to(root)
        except ValueError:
            rel = info["file"]

        if len(ev) != EVIDENCE_PER_GHOST:
            evidence_errors.append(
                f"  {name} ({rel}): expected {EVIDENCE_PER_GHOST} evidence types, got {len(ev)}: {ev}"
            )

        unknown = [e for e in ev if e not in VALID_EVIDENCE]
        if unknown:
            evidence_errors.append(
                f"  {name} ({rel}): unknown evidence type(s): {unknown}  "
                f"(valid: {sorted(VALID_EVIDENCE)})"
            )

        dupes = [e for e in ev if ev.count(e) > 1]
        if dupes:
            evidence_errors.append(
                f"  {name} ({rel}): duplicate evidence: {list(set(dupes))}"
            )

    if evidence_errors:
        failed = True
        print(f"\nGHOST EVIDENCE ERRORS ({len(evidence_errors)}):\n")
        for err in evidence_errors:
            print(err)

    if not failed:
        print(
            f"All {defined_count} ghosts defined, "
            f"each with {EVIDENCE_PER_GHOST} valid evidence types."
        )

    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
