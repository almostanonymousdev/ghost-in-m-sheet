#!/usr/bin/env python3
"""
Reachability / dead-end linter for Ghost in M'Sheet (Twine/SugarCube).

Flags passages that can be navigated to but have no way out — the static
equivalent of a softlock. Complements the runtime random-walk fuzzer:
the fuzzer catches dead-ends that require specific state to reach, the
linter catches them before CI ever spins up a browser.

A passage is flagged when ALL of these hold:
  * It is referenced as a navigation target (via [[..]], <<link>>,
    <<goto>>, or Engine.play) from somewhere in the codebase
  * It is not special (StoryInit, StoryScript, etc.) or lifecycle
    (PassageReady, PassageDone)
  * It is not tagged [widget], [script], or [stylesheet]
  * Its body contains no interaction pattern — no link, no include, no
    widget call that could render further navigation, no auto-redirect

Widgets and include-only passages are deliberately excluded: they are
templating fragments, not navigable destinations.

Exits 0 if no dead-ends, 1 otherwise.
"""

import re
import sys
from pathlib import Path

SUGARCUBE_SPECIAL = {
    "StoryAuthor", "StoryBanner", "StoryCaption", "StoryMenu", "StoryTitle",
    "StoryInit", "StoryData", "StoryScript", "StoryStylesheet",
    "PassageDone", "PassageFooter", "PassageHeader", "PassageReady",
    "StoryReady",
}

PASSAGE_HEADER = re.compile(r"^::\s*(.+?)(?:\s+\[([^\]]*)\])?(?:\s*\{.*\})?\s*$")

# Navigation targets — if any of these references passage P, P is a
# navigable destination (and therefore must have a way out).
NAV_TARGET_PATTERNS = [
    re.compile(r"\[\[([^\]|>]+?)\]\]"),                              # [[Target]]
    re.compile(r"\[\[[^\]]+?\|([^\]]+?)\]\]"),                       # [[Text|Target]]
    re.compile(r"\[\[[^\]]+?->\s*([^\]]+?)\]\]"),                    # [[Text->Target]]
    re.compile(r"\[\[([^\]<]+?)\s*<-[^\]]+?\]\]"),                   # [[Target<-Text]]
    re.compile(r'<<link\s+["\'][^"\']*["\']\s+["\']([^"\']+)["\']'), # <<link "text" "Target">>
    re.compile(r"""<<goto\s+["']([^"']+)["']"""),                    # <<goto "Target">>
    re.compile(r"""Engine\.play\s*\(\s*["']([^"']+)["']\s*\)"""),    # Engine.play('Target')
]

# Include-only targets — tracked separately. A passage referenced only
# via <<include>> is a templating fragment; it doesn't need its own nav.
INCLUDE_PATTERN = re.compile(r"""<<include\s+["']([^"']+)["']""")

# Interaction patterns — if a passage body contains any of these, it is
# NOT a dead-end. Includes links, auto-redirects, revealer macros, form
# widgets, and dynamic-target navigation (which we can't statically
# resolve but must assume is real).
INTERACTION_PATTERNS = [
    re.compile(r"\[\["),                               # any bracket link
    re.compile(r"<<link\b"),                           # <<link>> / <<linkreplace>> / <<linkappend>> / <<linkprepend>>
    re.compile(r"<<goto\b"),                           # <<goto "...">> or <<goto _var>>
    re.compile(r"<<return\b"),                         # <<return>> back-nav
    re.compile(r"<<back\b"),                           # <<back>> macro
    re.compile(r"<<choice\b"),                         # <<choice>>
    re.compile(r"<<include\b"),                        # <<include>> (may pull in a passage with nav)
    re.compile(r"<<button\b"),                         # <<button>>
    re.compile(r"<<click\b"),                          # <<click>> / <<clickreplace>> / <<clickappend>> / <<clickprepend>>
    re.compile(r"<<timed\b"),                          # <<timed>> auto-advance
    re.compile(r"<<checkbox\b"),                       # form input
    re.compile(r"<<radiobutton\b"),                    # form input
    re.compile(r"<<textbox\b"),                        # form input
    re.compile(r"<<textarea\b"),                       # form input
    re.compile(r"<<listbox\b"),                        # form input
    re.compile(r"<<cycle\b"),                          # cycle input
    re.compile(r"Engine\.play\s*\("),                  # JS navigation
    re.compile(r"\$return\b"),                         # dynamic "return to caller" target
    re.compile(r"previous\s*\(\s*\)"),                 # previous() dynamic target
    re.compile(r"passage\s*\(\s*\)"),                  # passage() re-render
]

# Every <<widget "name">> definition in the codebase. Usages of any of
# these names as a macro are counted as interaction (they may render
# links).
WIDGET_DEF = re.compile(r'<<widget\s+["\']([A-Za-z_][A-Za-z0-9_]*)["\']')


def is_dynamic(target: str) -> bool:
    """True when the target is a runtime expression, not a literal passage."""
    t = target.strip()
    if "(" in t or ")" in t:
        return True
    if t.startswith("$") or t.startswith("_"):
        return True
    if t.startswith("`") or t.endswith("`"):
        return True
    return False


def parse_header(line: str):
    """Return (name, tags set) for a `::` header, or None."""
    m = PASSAGE_HEADER.match(line)
    if not m:
        return None
    name = m.group(1).strip()
    tags_raw = m.group(2) or ""
    tags = set(t for t in tags_raw.split() if t)
    return name, tags


def collect_passages(passages_dir: Path):
    """Return dict: name -> {'file': Path, 'tags': set, 'body': str}."""
    passages: dict[str, dict] = {}
    for tw_file in sorted(passages_dir.rglob("*.tw")):
        text = tw_file.read_text(encoding="utf-8", errors="replace")
        lines = text.splitlines()
        current = None
        body_lines: list[str] = []
        for line in lines:
            parsed = parse_header(line)
            if parsed:
                if current is not None:
                    passages[current["name"]] = {
                        "file": current["file"],
                        "tags": current["tags"],
                        "body": "\n".join(body_lines),
                    }
                name, tags = parsed
                current = {"name": name, "file": tw_file, "tags": tags}
                body_lines = []
            else:
                body_lines.append(line)
        if current is not None:
            passages[current["name"]] = {
                "file": current["file"],
                "tags": current["tags"],
                "body": "\n".join(body_lines),
            }
    return passages


def collect_widget_names(passages: dict[str, dict]) -> set[str]:
    names: set[str] = set()
    for info in passages.values():
        for m in WIDGET_DEF.finditer(info["body"]):
            names.add(m.group(1))
    return names


def collect_references(passages: dict[str, dict]):
    """Return (nav_refs, include_refs) — each is name -> set of (file, lineno)."""
    nav_refs: dict[str, set] = {}
    include_refs: dict[str, set] = {}
    for name, info in passages.items():
        file_str = str(info["file"])
        for lineno, line in enumerate(info["body"].splitlines(), 1):
            for pattern in NAV_TARGET_PATTERNS:
                for m in pattern.finditer(line):
                    target = m.group(1).strip()
                    if is_dynamic(target):
                        continue
                    nav_refs.setdefault(target, set()).add((file_str, lineno, name))
            for m in INCLUDE_PATTERN.finditer(line):
                target = m.group(1).strip()
                if is_dynamic(target):
                    continue
                include_refs.setdefault(target, set()).add((file_str, lineno, name))
    return nav_refs, include_refs


def body_has_interaction(body: str, widget_names: set[str]) -> bool:
    """True if the passage body contains anything that could navigate or
    render further navigation."""
    for pattern in INTERACTION_PATTERNS:
        if pattern.search(body):
            return True
    # Custom widget invocations: <<widgetName ...>> where widgetName was
    # defined via <<widget "widgetName">> somewhere in the codebase.
    # Ordered by descending length so a match on "backOrReturn" doesn't
    # get shadowed by a prefix like "back".
    for name in sorted(widget_names, key=len, reverse=True):
        if re.search(r"<<" + re.escape(name) + r"\b", body):
            return True
    return False


def main():
    repo_root = Path(__file__).parent
    passages_dir = repo_root / "passages"

    if not passages_dir.is_dir():
        print(f"ERROR: passages directory not found at {passages_dir}", file=sys.stderr)
        sys.exit(1)

    passages = collect_passages(passages_dir)
    widget_names = collect_widget_names(passages)
    nav_refs, include_refs = collect_references(passages)

    print(f"Passages found : {len(passages)}")
    print(f"Widgets defined: {len(widget_names)}")

    dead_ends: list[tuple[str, dict]] = []
    for name, info in passages.items():
        if name in SUGARCUBE_SPECIAL:
            continue
        tags = info["tags"]
        if "widget" in tags or "script" in tags or "stylesheet" in tags:
            continue
        # Not referenced as a nav target → either orphan or include-only,
        # neither of which is a dead-end softlock.
        if name not in nav_refs:
            continue
        if body_has_interaction(info["body"], widget_names):
            continue
        dead_ends.append((name, info))

    if not dead_ends:
        print("No dead-end passages found.")
        sys.exit(0)

    print(f"\nDEAD-END PASSAGES ({len(dead_ends)}):\n")
    for name, info in sorted(dead_ends):
        try:
            rel = info["file"].relative_to(repo_root)
        except ValueError:
            rel = info["file"]
        callers = nav_refs.get(name, set())
        tag_str = f" [{' '.join(sorted(info['tags']))}]" if info["tags"] else ""
        print(f'  "{name}"{tag_str}')
        print(f"      defined: {rel}")
        print(f"      reached from {len(callers)} caller(s):")
        for caller_file, caller_line, caller_name in sorted(callers)[:5]:
            try:
                caller_rel = Path(caller_file).relative_to(repo_root)
            except ValueError:
                caller_rel = caller_file
            print(f"        {caller_rel}:{caller_line}  (in passage {caller_name})")
        if len(callers) > 5:
            print(f"        ... and {len(callers) - 5} more")
    sys.exit(1)


if __name__ == "__main__":
    main()
