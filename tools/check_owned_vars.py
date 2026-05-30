#!/usr/bin/env python3
"""
OWNED_VARS leak detector for Ghost in M'Sheet controllers.

Each `setup.X = (function () { ... })()` controller declares an
`OWNED_VARS` list — the story variables that controller is allowed to
own. Other controllers are expected to go through the controller's
API for both reads and writes; touching another bundle's State.variables
directly bypasses the API and couples controllers invisibly. This
linter flags cross-controller direct accesses (reads AND writes) that
bypass the API.

Scope: JavaScript files under `passages/`. Twee passages do plenty of
`<<set $mc.X to ...>>` and `$mc.X` reads, much of which is legitimate
game-flow code; a passage-side check would be all-noise. The JS-only
scope catches the high-signal violation: one controller reaching into
another's bundle.

Definition of "access" (read or write):
  * `State.variables.foo`           (any reference, read or assigned)
  * `State.variables["foo"]`
  * `sv().foo`
  * `<alias>.foo`                   where `<alias>` was declared as
                                    `var/let/const <alias> = sv()` or
                                    `= State.variables` in the same file
  * `s.foo.bar`                     (nested access — flagged against
                                    the top-level owner of `foo`)
  * Both bare reads and compound assignments (`+=`, `-=`, `++`, ...)
    are flagged the same way — the canonical fix in both cases is to
    route through the owning controller's API.

Files exempt from the leak rule (these layers exist precisely to seed /
reshape state across every bundle):
  * passages/updates/SaveMigration.js
  * passages/updates/Migrations.js
  * passages/mc/GameInit.js
  * passages/updates/TickController.js  (per-passage maintenance — its
    job is to touch cross-bundle state on every tick; the cost of
    routing through APIs on the hot path was deemed too high)

Exits 0 if no leaks, 1 otherwise.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

from lib_repo import passages_dir, read_passage, repo_root


# Files that are allowed to touch any owned var. These are the
# init / migration / per-tick layers that legitimately span every bundle.
EXEMPT_FILES = {
    "passages/updates/SaveMigration.js",
    "passages/updates/Migrations.js",
    "passages/mc/GameInit.js",
    "passages/updates/TickController.js",
}


# Top-of-file OWNED_VARS block. We match the whole `Object.freeze([...])`
# payload so we can pull the string literals out of it.
OWNED_VARS_BLOCK = re.compile(
    r"OWNED_VARS\s*=\s*Object\.freeze\(\s*\[([^\]]*)\]\s*\)",
    re.DOTALL,
)
STRING_LITERAL = re.compile(r"['\"]([a-zA-Z_]\w*)['\"]")

# Access sites (reads and writes). The captured group is always the
# top-level story-variable name. Cross-controller reads couple two
# bundles invisibly (HuntController reading $mc.lust ties it to the
# Mc bundle's shape), so we flag them the same way as writes —
# the canonical fix is the same in both cases: call setup.Mc.lust().
ACCESS_PATTERNS = [
    # State.variables.foo (with optional sub-property tails so the
    # match anchors on `foo`, not the deeper chain)
    re.compile(r"\bState\.variables\.([a-zA-Z_]\w*)"),
    # State.variables["foo"]
    re.compile(r'\bState\.variables\[\s*["\']([a-zA-Z_]\w*)["\']\s*\]'),
    # sv().foo
    re.compile(r"\bsv\(\)\.([a-zA-Z_]\w*)"),
]

# Per-file alias detection: `var/let/const <name> = sv()` or
# `= State.variables` (without an immediate `.x` / `[…]` tail, which
# would be a sub-property read instead of an alias). The matched
# alias name then feeds an additional access pattern of `<alias>.foo`.
ALIAS_DECL = re.compile(
    r"\b(?:var|let|const)\s+([A-Za-z_]\w*)\s*=\s*(?:sv\(\)|State\.variables)(?![.\[])"
)

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
    """Walk every JS file, find direct accesses (reads + writes) whose
    top-level var is owned by another file."""
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
        raw_lines = raw.splitlines()
        # Collect per-file aliases (var s = sv(); etc.) so we can flag
        # `s.foo` reads / writes the same way as `sv().foo`.
        aliases = {m.group(1) for m in ALIAS_DECL.finditer(cleaned)}
        access_res = list(ACCESS_PATTERNS)
        for alias in sorted(aliases):
            access_res.append(
                re.compile(r"(?<![A-Za-z0-9_$])" + re.escape(alias) + r"\.([a-zA-Z_]\w*)")
            )
        for lineno, line in enumerate(cleaned.splitlines(), 1):
            for pat in access_res:
                for m in pat.finditer(line):
                    name = m.group(1)
                    owner = owners.get(name)
                    if owner is None or owner == path:
                        continue
                    raw_line = raw_lines[lineno - 1] if lineno - 1 < len(raw_lines) else line
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

    print(f"\nLEAKS ({len(leaks)} accesses across {len(by_pair)} file-pairs):\n")
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
        print(f"  {offender_rel}  touches {owner_rel}'s vars ({', '.join(names)}):")
        for e in entries[:5]:
            print(f"      :{e['lineno']:>4}  ${e['name']}")
            print(f"           {e['snippet']}")
        if len(entries) > 5:
            print(f"      ... and {len(entries) - 5} more")
        print()

    sys.exit(1)


if __name__ == "__main__":
    main()
