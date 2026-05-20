#!/usr/bin/env python3
"""
OWNED_VARS leak detector for Ghost in M'Sheet controllers.

Each `setup.X = (function () { ... })()` controller declares an
`OWNED_VARS` list — the story variables that controller is allowed to
mutate. Other controllers and passages are expected to go through the
controller's API instead of writing to those variables directly. This
linter flags cross-controller writes that bypass the API.

Scope: JavaScript files under `passages/`. Twee passages do plenty of
`<<set $mc.X to ...>>`, much of which is legitimate game-flow code; a
passage-side check would be all-noise. The JS-only scope catches the
high-signal violation: one controller reaching into another's bundle.

Definition of "write":
  * `s.foo = ...`           (controller-local `var s = setup.sv;` alias)
  * `sv().foo = ...`         (inline accessor)
  * `State.variables.foo = ...`
  * `State.variables["foo"] = ...`
  * `s.foo.bar = ...`        (nested write — flagged against the
                              top-level owner of `foo`)
  * Compound assignments (`+=`, `-=`, `*=`, etc.), as well as `++` /
    `--`, count as writes too.

Files exempt from the leak rule (these layers exist precisely to seed /
reshape state across every bundle):
  * passages/updates/SaveMigration.js
  * passages/updates/Migrations.js
  * passages/mc/GameInit.js

Exits 0 if no leaks, 1 otherwise.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

from lib_repo import passages_dir, read_passage, repo_root


# Files that are allowed to write to any owned var. These are the
# init / migration layers that legitimately span every bundle.
EXEMPT_FILES = {
    "passages/updates/SaveMigration.js",
    "passages/updates/Migrations.js",
    "passages/mc/GameInit.js",
}


# Top-of-file OWNED_VARS block. We match the whole `Object.freeze([...])`
# payload so we can pull the string literals out of it.
OWNED_VARS_BLOCK = re.compile(
    r"OWNED_VARS\s*=\s*Object\.freeze\(\s*\[([^\]]*)\]\s*\)",
    re.DOTALL,
)
STRING_LITERAL = re.compile(r"['\"]([a-zA-Z_]\w*)['\"]")

# Write sites. The captured group is always the top-level story-variable
# name. Compound-assign / increment operators count as writes.
ASSIGN_TAIL = r"\s*(?:[+\-*/%|&^]?=(?!=)|\+\+|--)"

WRITE_PATTERNS = [
    # State.variables.foo = ...
    re.compile(r"\bState\.variables\.([a-zA-Z_]\w*)(?:\.[a-zA-Z_]\w*|\[[^\]]+\])*" + ASSIGN_TAIL),
    # State.variables["foo"] = ...
    re.compile(r'\bState\.variables\[\s*["\']([a-zA-Z_]\w*)["\']\s*\](?:\.[a-zA-Z_]\w*|\[[^\]]+\])*' + ASSIGN_TAIL),
    # sv().foo = ...
    re.compile(r"\bsv\(\)\.([a-zA-Z_]\w*)(?:\.[a-zA-Z_]\w*|\[[^\]]+\])*" + ASSIGN_TAIL),
    # s.foo = ...   (the conventional `var s = setup.sv;` … `s().foo` is
    # covered separately; here we match the bare `s.foo = ...` alias
    # used inside a few scripts that captured `var s = State.variables;`)
    re.compile(r"(?<![A-Za-z0-9_$])s\.([a-zA-Z_]\w*)(?:\.[a-zA-Z_]\w*|\[[^\]]+\])*" + ASSIGN_TAIL),
    # s().foo = ...  — when `var s = setup.sv;` (function alias)
    re.compile(r"(?<![A-Za-z0-9_$])s\(\)\.([a-zA-Z_]\w*)(?:\.[a-zA-Z_]\w*|\[[^\]]+\])*" + ASSIGN_TAIL),
]

# Strip /* block */ and // line comments before scanning so commented-out
# examples in docstrings don't false-positive. We preserve line numbers
# by replacing the matched region with spaces (keeping newlines).
BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.DOTALL)
LINE_COMMENT = re.compile(r"//[^\n]*")
# String literals — drop their contents so "State.variables.x = ..." in a
# docstring example doesn't trip the patterns. Backticks are handled
# separately because they can be multi-line.
DOUBLE_STRING = re.compile(r'"(?:\\.|[^"\\\n])*"')
SINGLE_STRING = re.compile(r"'(?:\\.|[^'\\\n])*'")
TEMPLATE_STRING = re.compile(r"`(?:\\.|[^`\\])*`", re.DOTALL)


def _blank_preserving_newlines(text: str, pattern: re.Pattern[str]) -> str:
    """Replace every match of `pattern` with same-length whitespace
    (newlines kept), so line numbers in the residue still match the
    original file."""
    return pattern.sub(
        lambda m: re.sub(r"[^\n]", " ", m.group(0)),
        text,
    )


def strip_noise(text: str) -> str:
    for pat in (BLOCK_COMMENT, LINE_COMMENT, TEMPLATE_STRING, DOUBLE_STRING, SINGLE_STRING):
        text = _blank_preserving_newlines(text, pat)
    return text


def collect_owners(js_files: list[Path]) -> tuple[dict[str, Path], list[tuple[Path, str]]]:
    """Return (var_name → owning file, list of (file, raw_block_text)).

    The second return is purely for ambiguity reporting — if two
    controllers claim the same var, we want to surface that as a setup
    bug rather than silently picking one.
    """
    owners: dict[str, Path] = {}
    conflicts: list[tuple[str, Path, Path]] = []
    for path in js_files:
        text = path.read_text(encoding="utf-8", errors="replace")
        # Skip lines like "setup.X.OWNED_VARS" / re-exports — they're not
        # original declarations, just access.
        for m in OWNED_VARS_BLOCK.finditer(text):
            for s in STRING_LITERAL.finditer(m.group(1)):
                name = s.group(1)
                if name in owners and owners[name] != path:
                    conflicts.append((name, owners[name], path))
                else:
                    owners[name] = path
    return owners, conflicts


def find_leaks(
    js_files: list[Path],
    owners: dict[str, Path],
    root: Path,
) -> list[dict]:
    """Walk every JS file, find writes whose top-level var is owned by
    another file."""
    leaks: list[dict] = []
    for path in js_files:
        try:
            rel = path.relative_to(root).as_posix()
        except ValueError:
            rel = str(path)
        if rel in EXEMPT_FILES:
            continue
        raw = path.read_text(encoding="utf-8", errors="replace")
        cleaned = strip_noise(raw)
        for lineno, line in enumerate(cleaned.splitlines(), 1):
            for pat in WRITE_PATTERNS:
                for m in pat.finditer(line):
                    name = m.group(1)
                    owner = owners.get(name)
                    if owner is None or owner == path:
                        continue
                    # Report with the *original* line so the user sees
                    # exactly what they wrote (the cleaned line has
                    # comments/strings blanked out).
                    raw_line = raw.splitlines()[lineno - 1] if lineno - 1 < len(raw.splitlines()) else line
                    leaks.append({
                        "file": path,
                        "lineno": lineno,
                        "name": name,
                        "owner": owner,
                        "snippet": raw_line.strip()[:140],
                    })
    return leaks


def main():
    root = repo_root()
    pdir = passages_dir()
    if not pdir.is_dir():
        print(f"ERROR: passages directory not found at {pdir}", file=sys.stderr)
        sys.exit(1)

    js_files = sorted(pdir.rglob("*.js"))
    owners, conflicts = collect_owners(js_files)

    print(f"JS files scanned   : {len(js_files)}")
    print(f"Owned variables    : {len(owners)}")

    exit_code = 0

    if conflicts:
        print(f"\nOWNED_VARS CONFLICTS ({len(conflicts)}):")
        for name, a, b in conflicts:
            try:
                a_rel = a.relative_to(root)
                b_rel = b.relative_to(root)
            except ValueError:
                a_rel, b_rel = a, b
            print(f"  '{name}' claimed by both:")
            print(f"      {a_rel}")
            print(f"      {b_rel}")
        exit_code = 1

    leaks = find_leaks(js_files, owners, root)

    if not leaks:
        if exit_code == 0:
            print("No cross-controller OWNED_VARS leaks found.")
        sys.exit(exit_code)

    # Group leaks by (owner, leaking-file) so a single repeat-offender
    # block lands as one entry rather than fifty.
    by_pair: dict[tuple[Path, Path], list[dict]] = {}
    for leak in leaks:
        by_pair.setdefault((leak["owner"], leak["file"]), []).append(leak)

    print(f"\nLEAKS ({len(leaks)} writes across {len(by_pair)} file-pairs):\n")
    for (owner, offender), entries in sorted(
        by_pair.items(),
        key=lambda kv: (str(kv[0][0]), str(kv[0][1])),
    ):
        try:
            owner_rel = owner.relative_to(root)
            offender_rel = offender.relative_to(root)
        except ValueError:
            owner_rel, offender_rel = owner, offender
        names = sorted({e["name"] for e in entries})
        print(f"  {offender_rel}  writes to {owner_rel}'s vars ({', '.join(names)}):")
        for e in entries[:5]:
            print(f"      :{e['lineno']:>4}  ${e['name']}")
            print(f"           {e['snippet']}")
        if len(entries) > 5:
            print(f"      ... and {len(entries) - 5} more")
        print()

    sys.exit(1)


if __name__ == "__main__":
    main()
