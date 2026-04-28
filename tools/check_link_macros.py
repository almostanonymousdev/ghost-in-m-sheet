#!/usr/bin/env python3
"""
Detects SugarCube wikilinks whose target *or* display portion contains
unevaluated macro syntax (e.g. ``<<= var>>``).

Two failure modes are caught:

1. Macro in target. ``[[Ask ...|<<= _cName>>HuntEndAlone]]`` renders the
   literal string ``<<= _cName>>HuntEndAlone`` as a passage name because
   SugarCube does not evaluate macros in wikilink targets. Fix:
   ``[[... |`_cName + "HuntEndAlone"`]]``.

2. Macro in display. ``[[Ask <<= _cName>> ...|target]]`` shows the raw
   ``<<= _cName>>`` text to the player. SugarCube docs claim the display
   text is wikified, but in practice this codebase has hit cases where
   it isn't (see commits e9c193e / this script's history). The canonical
   fix is the ``<<link>>`` macro form, which uses TwineScript expressions
   for both label and target:
       ``<<link `"Ask " + _cName + " how it went."` `_cName + "End"`>><</link>>``

The script walks ``passages/`` and flags either case. It is a
stand-alone parser rather than a regex pass: a regex over ``[[...]]``
mis-handles ``]`` characters inside macro arguments (e.g. ``_args[1]``),
which is exactly the kind of construct most likely to appear next to a
buggy macro.
"""

import sys
from pathlib import Path


def parse_wikilinks(text):
    """Yield ``(offset, content)`` for every ``[[...]]`` wikilink in ``text``.

    Tracks ``<<...>>`` macro nesting so that ``]`` inside macro arguments
    (e.g. ``_args[1]``) does not prematurely terminate the wikilink.
    """
    n = len(text)
    i = 0
    while i < n - 1:
        if text[i] == '[' and text[i + 1] == '[':
            j = i + 2
            depth = 0
            found = False
            while j < n - 1:
                if text[j] == '<' and text[j + 1] == '<':
                    depth += 1
                    j += 2
                    continue
                if text[j] == '>' and text[j + 1] == '>':
                    if depth > 0:
                        depth -= 1
                    j += 2
                    continue
                if depth == 0 and text[j] == ']' and text[j + 1] == ']':
                    yield (i, text[i + 2:j])
                    i = j + 2
                    found = True
                    break
                j += 1
            if not found:
                i += 1
            continue
        i += 1


def split_wikilink_content(content):
    """Split ``[[..]]`` contents into ``(display_text, target)``.

    Returns ``(content, None)`` for the simple ``[[Target]]`` form. The
    splitter respects ``<<...>>`` macro nesting so a ``|`` inside a macro
    argument (e.g. ``<<= a | b>>``) is not treated as the link separator.
    """
    n = len(content)
    i = 0
    depth = 0
    while i < n:
        if i + 1 < n and content[i] == '<' and content[i + 1] == '<':
            depth += 1
            i += 2
            continue
        if i + 1 < n and content[i] == '>' and content[i + 1] == '>':
            if depth > 0:
                depth -= 1
            i += 2
            continue
        if depth == 0:
            if content[i] == '|':
                return content[:i], content[i + 1:]
            if i + 1 < n and content[i] == '-' and content[i + 1] == '>':
                return content[:i], content[i + 2:]
            if i + 1 < n and content[i] == '<' and content[i + 1] == '-':
                return content[i + 2:], content[:i]
        i += 1
    return content, None


def has_unevaluated_macro(text):
    """Return True if ``text`` contains ``<<...>>`` macro syntax outside
    of any backtick segment.

    A backtick-wrapped span is a TwineScript expression — anything
    inside is fine. Only ``<<`` occurrences outside backtick segments
    count as bugs.
    """
    if text is None:
        return False
    in_backtick = False
    i = 0
    n = len(text)
    while i < n:
        ch = text[i]
        if ch == '`':
            in_backtick = not in_backtick
            i += 1
            continue
        if not in_backtick and i + 1 < n and ch == '<' and text[i + 1] == '<':
            return True
        i += 1
    return False


def target_has_unevaluated_macro(target):
    return has_unevaluated_macro(target)


def display_has_unevaluated_macro(display):
    return has_unevaluated_macro(display)


def offset_to_lineno(text, offset):
    return text.count('\n', 0, offset) + 1


def main():
    repo_root = Path(__file__).resolve().parent.parent
    passages_dir = repo_root / "passages"
    if not passages_dir.is_dir():
        print(f"ERROR: passages directory not found at {passages_dir}", file=sys.stderr)
        sys.exit(1)

    target_bugs = []
    display_bugs = []
    total_links = 0
    for tw_file in sorted(passages_dir.rglob("*.tw")):
        text = tw_file.read_text(encoding="utf-8", errors="replace")
        for offset, content in parse_wikilinks(text):
            total_links += 1
            display, target = split_wikilink_content(content)
            rel = tw_file.relative_to(repo_root)
            lineno = offset_to_lineno(text, offset)
            # [[Target]] form: display IS target — only check it once,
            # as a target.
            if target is None:
                if target_has_unevaluated_macro(display):
                    target_bugs.append((rel, lineno, display.strip()))
                continue
            if target_has_unevaluated_macro(target):
                target_bugs.append((rel, lineno, target.strip()))
            if display_has_unevaluated_macro(display):
                display_bugs.append((rel, lineno, display.strip()))

    print(f"Wikilinks scanned: {total_links}")

    failed = False

    if target_bugs:
        failed = True
        print(f"\nUNEVALUATED MACROS IN WIKILINK TARGETS ({len(target_bugs)}):\n")
        for rel, ln, target in target_bugs:
            print(f"  {rel}:{ln}  →  target = {target!r}")
        print(
            "\nSugarCube does NOT evaluate <<...>> macros inside [[Text|target]]\n"
            "wikilink targets — they are treated as literal characters in the\n"
            "passage name. Use the backtick expression syntax instead, e.g.\n"
            '  [[Display|`_name + "Suffix"`]]\n'
        )

    if display_bugs:
        failed = True
        print(f"\nUNEVALUATED MACROS IN WIKILINK DISPLAY TEXT ({len(display_bugs)}):\n")
        for rel, ln, display in display_bugs:
            print(f"  {rel}:{ln}  →  display = {display!r}")
        print(
            "\n[[Text|target]] display portions are not reliably wikified in this\n"
            "codebase — raw <<...>> macros leak to the player. Use the <<link>>\n"
            "macro form, which evaluates both label and target as TwineScript:\n"
            '  <<link `"Ask " + _name + " ..."` `_name + "Suffix"`>><</link>>\n'
        )

    if failed:
        sys.exit(1)

    print("No unevaluated macros found in wikilink targets or display text.")
    sys.exit(0)


if __name__ == "__main__":
    main()
