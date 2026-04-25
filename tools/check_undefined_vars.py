#!/usr/bin/env python3
"""
Undefined story-variable linter for Ghost in M'Sheet (Twine/SugarCube).

Catches the typo class behind bugs like c443cf4 ("missing message in
special-delivery, low corruption path") — a $variable referenced
somewhere but never assigned anywhere in the codebase. SugarCube
silently renders such references as empty strings, so the bug only
surfaces when a player walks down the right branch.

Scope: $story variables only. Temporary _vars are passage-scoped and
flow through <<include>> chains in ways that are hard to model
statically — they're better caught by the runtime fuzzer.

A variable name is considered DEFINED if any of these appear anywhere:
  * <<set $foo ...>> in Twee text
  * <<unset $foo>> (treated as a definition for our purposes — it
    implies the var is recognised by the codebase)
  * State.variables.foo = ... in JS
  * s.foo = ...  or  V.foo = ...  in [script] passages, where s/V is
    the conventional alias for State.variables
  * One of the AUTO_DEFINED names below (engine-managed)

A variable name is considered USED if `$foo` appears anywhere in any
passage body (Twee or [script]) — we don't try to distinguish reads
from writes; a typo'd write is just as much a bug.

Exits 0 if no undefined uses, 1 otherwise.
"""

import re
import sys
from pathlib import Path


# Engine-managed or otherwise auto-populated story variables. Referencing
# these without an explicit <<set>> is fine.
AUTO_DEFINED = {
    "args",      # widget call argument array
    "return",    # set by StoryScript on every passage transition
}

PASSAGE_HEADER = re.compile(r"^::\s*(.+?)(?:\s+\[([^\]]*)\])?(?:\s*\{.*\})?\s*$")

# Definition sites — anything that introduces the variable name into the
# codebase. We accept LHS-only matches; computed-key writes (s[name] = ...)
# are intentionally not matched and instead handled via DYNAMIC_KEY_DEFS.
DEFINITION_PATTERNS = [
    re.compile(r"<<set\s+\$([a-zA-Z_]\w*)"),
    re.compile(r"<<unset\s+\$([a-zA-Z_]\w*)"),
    re.compile(r"State\.variables\.([a-zA-Z_]\w*)\s*="),
    re.compile(r'State\.variables\[\s*["\']([a-zA-Z_]\w*)["\']\s*\]\s*='),
    # Form-input macros bind a story variable by name and create it on
    # first use, so the syntax <<listbox "$foo">> / <<textbox "$foo">> /
    # etc. is itself a definition. Also accepts backtick-templated names
    # like <<radiobutton `"$foo." + _x` ...>> by capturing the root var.
    re.compile(r'<<(?:listbox|textbox|numberbox|radiobutton|checkbox|cycle)\s+["`\']?\$([a-zA-Z_]\w*)'),
]

# Definitions via the conventional `s = State.variables` / `V = State.variables`
# aliases used inside [script] passages. Restricted to script context to
# avoid mis-classifying prose like "she's." or "V." as code.
SCRIPT_ALIAS_PATTERNS = [
    re.compile(r"\b(?:s|V)\.([a-zA-Z_]\w*)\s*="),
    re.compile(r'\b(?:s|V)\[\s*["\']([a-zA-Z_]\w*)["\']\s*\]\s*='),
]

# When initState() does `forEach(name => s[name] = ...)` over a literal
# string array, the static analyzer can't follow the dynamic key. We
# look for that pattern explicitly and treat each literal name in the
# array as a definition. Limited to setup.Game.initState() in
# passages/mc/GameInit.tw — generalising further would cost more in
# parser complexity than it would save in real-world coverage.
DYNAMIC_KEY_DEFS = re.compile(
    r"\[([^\]]+)\]\.forEach\s*\(\s*function\s*\(\s*([a-zA-Z_]\w*)\s*\)\s*\{[^}]*?\bs\[\s*\2\s*\]\s*="
)
ARRAY_LITERAL_STRING = re.compile(r"['\"]([a-zA-Z_]\w*)['\"]")

# Use sites — every $foo reference in a body counts. The negative
# lookbehind for $$ is harmless here (SugarCube doesn't have $$ syntax)
# but documents intent.
USE_PATTERN = re.compile(r"\$([a-zA-Z_]\w*)")

# Regions stripped from passage bodies before USE scanning. We replace
# the matched text with same-length whitespace (keeping newlines) so
# reported line numbers still line up with what the author sees.
#
#   BLOCK_COMMENT  /* ... */ Twee comments — often mention vars by name
#   SCRIPT_BLOCK   <<script>>...<</script>> — raw JS where `$foo` is
#                  jQuery convention, not a Twee variable reference
#   BACKTICK_EXPR  ` ... ` — JS template strings used inside macro args
#                  to construct dynamic var names (e.g. <<label `"$foo"
#                  + _x`>>) where the literal `$foo` text is a string
#                  fragment rather than a real reference.
BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.DOTALL)
SCRIPT_BLOCK = re.compile(r"<<script>>.*?<</script>>", re.DOTALL)
BACKTICK_EXPR = re.compile(r"`[^`\n]*`")


def parse_header(line):
    m = PASSAGE_HEADER.match(line)
    if not m:
        return None
    name = m.group(1).strip()
    tags_raw = m.group(2) or ""
    tags = set(t for t in tags_raw.split() if t)
    return name, tags


def collect_passages(passages_dir):
    """Return a list of dicts: name, file, tags, body."""
    passages = []
    for tw_file in sorted(passages_dir.rglob("*.tw")):
        text = tw_file.read_text(encoding="utf-8", errors="replace")
        lines = text.splitlines()
        current = None
        body_lines = []
        line_offset = 0
        for i, line in enumerate(lines):
            parsed = parse_header(line)
            if parsed:
                if current is not None:
                    passages.append({
                        **current,
                        "body": "\n".join(body_lines),
                    })
                name, tags = parsed
                current = {
                    "name": name,
                    "file": tw_file,
                    "tags": tags,
                    "header_line": i + 1,
                }
                body_lines = []
            else:
                body_lines.append(line)
        if current is not None:
            passages.append({**current, "body": "\n".join(body_lines)})
    return passages


def collect_definitions(passages):
    """Return a set of every defined variable name."""
    defined = set(AUTO_DEFINED)
    for p in passages:
        body = p["body"]
        is_script = "script" in p["tags"]
        for pat in DEFINITION_PATTERNS:
            for m in pat.finditer(body):
                defined.add(m.group(1))
        if is_script:
            for pat in SCRIPT_ALIAS_PATTERNS:
                for m in pat.finditer(body):
                    defined.add(m.group(1))
            # forEach-with-literal-array dynamic key writes
            for m in DYNAMIC_KEY_DEFS.finditer(body):
                array_text = m.group(1)
                for s in ARRAY_LITERAL_STRING.finditer(array_text):
                    defined.add(s.group(1))
    return defined


def collect_uses(passages):
    """Return name -> list of (passage_name, file, lineno, snippet).

    [script] / [stylesheet] passage bodies are skipped: in those, `$foo`
    is JavaScript or CSS (e.g. jQuery aliases like `var $bar = $(...)`)
    rather than a Twee variable reference. Block comments are stripped
    so doc-strings like "Shared defaults for $brook/$alice" don't
    false-positive."""
    uses = {}
    for p in passages:
        if "script" in p["tags"] or "stylesheet" in p["tags"]:
            continue
        # Strip comments / script blocks / backtick templates while
        # preserving line numbers so reported locations still match what
        # the author sees in their editor.
        body = p["body"]
        for pattern in (BLOCK_COMMENT, SCRIPT_BLOCK, BACKTICK_EXPR):
            body = pattern.sub(
                lambda m: re.sub(r"[^\n]", " ", m.group(0)),
                body,
            )
        for lineno, line in enumerate(body.splitlines(), 1):
            for m in USE_PATTERN.finditer(line):
                name = m.group(1)
                uses.setdefault(name, []).append({
                    "passage": p["name"],
                    "file": p["file"],
                    "lineno": p["header_line"] + lineno,
                    "snippet": line.strip()[:120],
                })
    return uses


def main():
    repo_root = Path(__file__).resolve().parent.parent
    passages_dir = repo_root / "passages"

    if not passages_dir.is_dir():
        print(f"ERROR: passages directory not found at {passages_dir}", file=sys.stderr)
        sys.exit(1)

    passages = collect_passages(passages_dir)
    defined = collect_definitions(passages)
    uses = collect_uses(passages)

    undefined = {name: refs for name, refs in uses.items() if name not in defined}

    print(f"Passages found     : {len(passages)}")
    print(f"Variables defined  : {len(defined)}")
    print(f"Variables used     : {len(uses)}")

    if not undefined:
        print("No undefined story variables found.")
        sys.exit(0)

    print(f"\nUNDEFINED VARIABLES ({len(undefined)}):\n")
    for name in sorted(undefined):
        refs = undefined[name]
        print(f'  ${name}  — used {len(refs)}x, never set:')
        for ref in refs[:5]:
            try:
                rel = ref["file"].relative_to(repo_root)
            except ValueError:
                rel = ref["file"]
            print(f"      {rel}:{ref['lineno']}  ({ref['passage']})")
            print(f"        {ref['snippet']}")
        if len(refs) > 5:
            print(f"      ... and {len(refs) - 5} more")
    sys.exit(1)


if __name__ == "__main__":
    main()
