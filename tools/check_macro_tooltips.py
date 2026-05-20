#!/usr/bin/env python3
"""
Macro/widget tooltip sync linter for `config/t3lt.twee-config.yml`.

The yml file feeds IDE autocomplete + hover docs for every custom macro
in the project. It's edited by hand — which means "I added a new macro
but forgot the yml entry" is a common foot-gun (called out as a gotcha
in CLAUDE.local.md). This linter compares the yml against the source of
truth (every `Macro.add()` call in `.js` files plus every
`<<widget "...">>` declaration in `.tw` files) and flags drift.

Three classes of finding:

  ERROR  — a macro/widget is defined in source but has no yml entry.
           IDE tooltips will be missing for it.
  ERROR  — a macro/widget is defined in source as a container
           (Macro.add tags or `<<widget ... container>>`) but the yml
           entry is missing `container: true`, or vice versa. IDE
           validation will reject correct usage or accept wrong usage.
  WARN   — a yml entry has no matching source definition. Probably a
           dead entry left over from a deleted macro; flagged but does
           not fail the build.

Engine-builtin macros (`<<set>>`, `<<if>>`, etc.) are not in the yml
file by default, so no allowlist is needed for them.

Exits 0 if no errors, 1 if any errors.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

from lib_repo import passages_dir, repo_root


YAML_PATH_REL = "config/t3lt.twee-config.yml"


# JS source: `Macro.add('name', { tags: ..., handler: ... })`. We locate
# the call head with a regex, then scan forward balancing braces /
# brackets / parens to find the matching `})` — macro handlers contain
# arbitrarily-nested braces, strings, and regexes, so a flat regex
# can't capture the body reliably.
MACRO_ADD_HEAD = re.compile(
    r"""Macro\.add\(\s*['"]([a-zA-Z_]\w*)['"]\s*,\s*\{"""
)
TAGS_KEY = re.compile(r"\btags\s*:")
# `tags: ['foo', 'bar']` — captures the array payload so we can extract
# the child-tag names (which legitimately appear in the yml as their
# own entries even though they aren't standalone macros).
TAGS_ARRAY = re.compile(
    r"""tags\s*:\s*\[([^\]]*)\]""",
    re.DOTALL,
)
ARRAY_STRING = re.compile(r"""['"]([a-zA-Z_]\w*)['"]""")


def _scan_balanced(text: str, start: int) -> int | None:
    """Given `start` pointing at the `{` of a Macro.add options object,
    return the index just past the matching `})`. Handles strings,
    template literals, line/block comments, and nested braces. Returns
    None if no balanced close is found (malformed source)."""
    depth = 0
    i = start
    n = len(text)
    while i < n:
        c = text[i]
        # Skip comments.
        if c == "/" and i + 1 < n:
            if text[i + 1] == "/":
                nl = text.find("\n", i)
                i = n if nl == -1 else nl + 1
                continue
            if text[i + 1] == "*":
                end = text.find("*/", i + 2)
                i = n if end == -1 else end + 2
                continue
        # Skip string literals (including escaped quotes).
        if c in ("'", '"', "`"):
            quote = c
            j = i + 1
            while j < n:
                if text[j] == "\\":
                    j += 2
                    continue
                if text[j] == quote:
                    j += 1
                    break
                j += 1
            i = j
            continue
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                # Expect the closing `)` of Macro.add(...).
                j = i + 1
                while j < n and text[j].isspace():
                    j += 1
                if j < n and text[j] == ")":
                    return j + 1
                return i + 1
        i += 1
    return None

# Twee source: `<<widget "name">>` or `<<widget "name" container>>`.
# SugarCube also allows `<<widget 'name'>>`.
WIDGET_DECL = re.compile(
    r"""<<widget\s+['"]([a-zA-Z_]\w*)['"]([^>]*)>>"""
)

# YAML: a simple structural parse. The file is hand-edited but follows
# a strict layout: macros sit at indent 4 under `sugarcube-2: macros:`,
# each macro is a `<name>:` block whose children are `name:` /
# `container:` / `description:`. We don't pull in PyYAML; a regex pass
# over indentation is enough and keeps tools/ dependency-free (consistent
# with the rest of the lint suite).
YAML_MACRO_HEADER = re.compile(r"^    ([a-zA-Z_]\w*):\s*$")
YAML_CONTAINER_LINE = re.compile(r"^      container:\s*(true|false)\s*$")


def collect_js_macros(js_files: list[Path]) -> tuple[dict[str, dict], set[str]]:
    """Return (macros, child_tags).

    macros: name → { 'container': bool, 'file': Path, 'lineno': int }
    child_tags: names that appear inside a container macro's `tags: [...]`
                array. These belong in the yml as their own entries (the
                IDE looks them up when validating <<container>>...<</container>>
                bodies) even though they're not standalone Macro.add() calls.
    """
    macros: dict[str, dict] = {}
    child_tags: set[str] = set()
    for path in js_files:
        text = path.read_text(encoding="utf-8", errors="replace")
        for m in MACRO_ADD_HEAD.finditer(text):
            name = m.group(1)
            brace_idx = m.end() - 1
            close = _scan_balanced(text, brace_idx)
            if close is None:
                continue
            body = text[brace_idx:close]
            is_container = bool(TAGS_KEY.search(body))
            lineno = text.count("\n", 0, m.start()) + 1
            if name not in macros:
                macros[name] = {"container": is_container, "file": path, "lineno": lineno}
            for arr in TAGS_ARRAY.finditer(body):
                for s in ARRAY_STRING.finditer(arr.group(1)):
                    child_tags.add(s.group(1))
    return macros, child_tags


def collect_widgets(tw_files: list[Path]) -> dict[str, dict]:
    """name → { 'container': bool, 'file': Path, 'lineno': int }."""
    widgets: dict[str, dict] = {}
    for path in tw_files:
        text = path.read_text(encoding="utf-8", errors="replace")
        for lineno, line in enumerate(text.splitlines(), 1):
            for m in WIDGET_DECL.finditer(line):
                name = m.group(1)
                modifiers = m.group(2)
                is_container = "container" in modifiers.split()
                if name not in widgets:
                    widgets[name] = {"container": is_container, "file": path, "lineno": lineno}
    return widgets


def parse_yml(yml_path: Path) -> dict[str, dict]:
    """name → { 'container': bool, 'lineno': int }.

    Best-effort: walks the file line-by-line and treats any indent-4
    `name:` line as a macro header. The `container:` line, when present,
    appears at indent 6 anywhere inside the block before the next header.
    """
    entries: dict[str, dict] = {}
    current_name: str | None = None
    current_container = False
    current_lineno = 0
    text = yml_path.read_text(encoding="utf-8", errors="replace")
    for lineno, line in enumerate(text.splitlines(), 1):
        header = YAML_MACRO_HEADER.match(line)
        if header:
            if current_name is not None:
                entries[current_name] = {"container": current_container, "lineno": current_lineno}
            current_name = header.group(1)
            current_container = False
            current_lineno = lineno
            continue
        cont = YAML_CONTAINER_LINE.match(line)
        if cont and current_name is not None:
            current_container = cont.group(1) == "true"
    if current_name is not None:
        entries[current_name] = {"container": current_container, "lineno": current_lineno}
    return entries


def main():
    root = repo_root()
    pdir = passages_dir()
    yml_path = root / YAML_PATH_REL

    if not pdir.is_dir():
        print(f"ERROR: passages directory not found at {pdir}", file=sys.stderr)
        sys.exit(1)
    if not yml_path.is_file():
        print(f"ERROR: yml file not found at {yml_path}", file=sys.stderr)
        sys.exit(1)

    js_files = sorted(pdir.rglob("*.js"))
    tw_files = sorted(pdir.rglob("*.tw"))

    js_macros, child_tags = collect_js_macros(js_files)
    widgets = collect_widgets(tw_files)
    yml_entries = parse_yml(yml_path)

    # Merge JS macros + twee widgets into a single "defined" map. If
    # both define the same name (shouldn't happen — SugarCube would
    # collide at registration), prefer the JS entry but emit a warning.
    defined: dict[str, dict] = {}
    name_collisions: list[str] = []
    for name, info in js_macros.items():
        defined[name] = {"container": info["container"], "source": "js", **info}
    for name, info in widgets.items():
        if name in defined:
            name_collisions.append(name)
            continue
        defined[name] = {"container": info["container"], "source": "tw", **info}

    print(f"JS macros found      : {len(js_macros)}")
    print(f"Twee widgets found   : {len(widgets)}")
    print(f"YAML entries         : {len(yml_entries)}")

    errors = 0
    warnings = 0

    if name_collisions:
        warnings += len(name_collisions)
        print(f"\nNAME COLLISIONS ({len(name_collisions)}):")
        for n in sorted(name_collisions):
            print(f"  '{n}' defined by BOTH a JS Macro.add() and a Twee <<widget>>")

    # ERROR: defined but no yml entry.
    missing = sorted(n for n in defined if n not in yml_entries)
    if missing:
        errors += len(missing)
        print(f"\nMISSING YAML ENTRIES ({len(missing)}):")
        print(f"  Add these to {YAML_PATH_REL} so IDE autocomplete works.")
        for n in missing:
            info = defined[n]
            try:
                rel = info["file"].relative_to(root)
            except ValueError:
                rel = info["file"]
            cont = "  (container)" if info["container"] else ""
            print(f"  - {n:<32}{cont}")
            print(f"      defined at {rel}:{info['lineno']}")

    # ERROR: container mismatch.
    mismatches = []
    for n, info in defined.items():
        if n not in yml_entries:
            continue
        if info["container"] != yml_entries[n]["container"]:
            mismatches.append(n)
    if mismatches:
        errors += len(mismatches)
        print(f"\nCONTAINER MISMATCHES ({len(mismatches)}):")
        for n in sorted(mismatches):
            info = defined[n]
            yml_info = yml_entries[n]
            src_kind = "container" if info["container"] else "plain"
            yml_kind = "container" if yml_info["container"] else "plain"
            try:
                rel = info["file"].relative_to(root)
            except ValueError:
                rel = info["file"]
            print(f"  - {n}: source = {src_kind}, yml = {yml_kind}")
            print(f"      source: {rel}:{info['lineno']}")
            print(f"      yml:    {YAML_PATH_REL}:{yml_info['lineno']}")

    # WARN: yml entry with no source definition. Child-tag names from
    # container macros (e.g. <<newmeter>>'s 'colors' / 'sizing' /
    # 'animation' / 'label') are not standalone Macro.add() calls but
    # legitimately appear in the yml so the IDE can validate the
    # container body — exempt them.
    orphans = sorted(n for n in yml_entries if n not in defined and n not in child_tags)
    if orphans:
        warnings += len(orphans)
        print(f"\nORPHAN YAML ENTRIES ({len(orphans)}, non-fatal):")
        print(f"  These look like dead entries — remove from {YAML_PATH_REL}?")
        for n in orphans:
            print(f"  - {n}  (yml:{yml_entries[n]['lineno']})")

    print()
    if errors == 0 and warnings == 0:
        print("Macro tooltips in sync.")
        sys.exit(0)
    print(f"Summary: {errors} error(s), {warnings} warning(s).")
    sys.exit(1 if errors > 0 else 0)


if __name__ == "__main__":
    main()
