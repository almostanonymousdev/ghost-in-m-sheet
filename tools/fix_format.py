#!/usr/bin/env python3
"""
Auto-fixer for Twee formatting issues detected by check_format.py.

Fixes TW001–TW006 mechanically.  TW007 (unbalanced macros) requires manual review.

Usage:
  python3 fix_format.py              # fix all .tw files
  python3 fix_format.py FILE ...     # fix specific files
  python3 fix_format.py --dry-run    # show what would change without writing
"""

import argparse
import re
import sys
from pathlib import Path

from lib_repo import passages_dir, repo_root

PROJECT_DIR = repo_root()
PASSAGES_DIR = passages_dir()

EMBEDDED_BLOCK_TAGS = {"style", "script"}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def is_only_macros(text: str) -> bool:
    """True if text consists entirely of macro tags (and whitespace)."""
    cleaned = re.sub(r"<</?[^>]*>>", "", text).strip()
    return cleaned == ""


def get_indent(line: str) -> str:
    """Return the leading whitespace of a line."""
    return line[: len(line) - len(line.lstrip())]


def in_embedded_block(lines: list[str], idx: int) -> bool:
    depth = 0
    for i in range(idx):
        stripped = lines[i].strip().lower()
        for tag in EMBEDDED_BLOCK_TAGS:
            if re.search(rf"<{tag}\b", stripped):
                depth += 1
            if re.search(rf"</{tag}\s*>", stripped):
                depth -= 1
    return depth > 0


# ---------------------------------------------------------------------------
# Fix passes — each takes a list of lines and returns a new list
# ---------------------------------------------------------------------------

def fix_trailing_whitespace(lines: list[str]) -> list[str]:
    """TW001: strip trailing whitespace."""
    return [line.rstrip() for line in lines]


def fix_mixed_indent(lines: list[str]) -> list[str]:
    """TW002: normalize mixed tabs+spaces in leading indent to tabs.

    Treats 4 spaces or 2 spaces as one tab level (whichever is detected),
    then converts the whole indent to tabs.
    """
    result = []
    for i, line in enumerate(lines):
        indent = get_indent(line)
        rest = line.lstrip()
        if not indent or ("\t" not in indent or " " not in indent):
            result.append(line)
            continue
        # Skip inside <style>/<script>
        if in_embedded_block(lines, i):
            result.append(line)
            continue
        # Expand tabs to spaces (assume tab=4), then convert back to tabs
        expanded = indent.expandtabs(4)
        # Determine indent unit: prefer 4, fall back to 2
        n_spaces = len(expanded)
        tab_count = n_spaces // 4
        remainder = n_spaces % 4
        if remainder >= 2:
            tab_count += 1
        result.append("\t" * tab_count + rest)
    return result


# Regex for a closing macro at the *end* of a line (possibly multiple)
CLOSING_MACRO_AT_END = re.compile(r"(<</\w+>>)\s*$")
# Regex for multiple closing macros jammed together
MULTI_CLOSE = re.compile(r"(<</\w+>>)\s*(<</\w+>>)")


def fix_multi_close_and_content_close(lines: list[str]) -> list[str]:
    """TW003 + TW004: split closing macros that are jammed together or follow content."""
    result = []
    for line in lines:
        result.extend(_split_closing_macros(line))
    return result


def _split_closing_macros(line: str) -> list[str]:
    """Recursively split a line that has content followed by closing macros."""
    stripped = line.strip()
    indent = get_indent(line)

    # If the line is only closing macros, split them one per line
    if re.fullmatch(r"(\s*<</\w+>>\s*)+", stripped):
        parts = re.findall(r"<</\w+>>", stripped)
        if len(parts) <= 1:
            return [line]
        return [indent + p for p in parts]

    # Check for content followed by a closing macro
    # Find the last closing macro and see if there's content before it
    all_closes = list(re.finditer(r"<</\w+>>", line))
    if not all_closes:
        return [line]

    # Find the first closing macro that has real content before it
    for m in all_closes:
        before = line[:m.start()]
        if before.strip() and not is_only_macros(before.strip()):
            # Split: content on one line, closing macro(s) on subsequent lines
            content_part = line[:m.start()].rstrip()
            rest_part = line[m.start():].strip()
            # Recursively handle the rest (may have multiple closers)
            rest_lines = _split_closing_macros(indent + rest_part)
            return [content_part] + rest_lines

    # Multiple closers jammed together after macro-only content
    # e.g.  <</if>><</if>>
    if MULTI_CLOSE.search(line):
        # Check if the non-closer prefix is only macros
        first_close = all_closes[0]
        before = line[:first_close.start()].strip()
        if is_only_macros(before) or before == "":
            # Split all the closers
            prefix = line[:first_close.start()].rstrip()
            closers = re.findall(r"<</\w+>>", line[first_close.start():])
            out = []
            if prefix.strip():
                out.append(prefix)
            for c in closers:
                out.append(indent + c)
            return out

    return [line]


def fix_link_space_pipe(lines: list[str]) -> list[str]:
    """TW005: remove space before | in [[text |Target]]."""
    result = []
    for line in lines:
        result.append(re.sub(r"(\[\[[^\]]*?)\s+\|", r"\1|", line))
    return result


def fix_inline_else(lines: list[str]) -> list[str]:
    """TW006: move <<else>>/<<elseif ...>> to its own line when after content."""
    result = []
    for line in lines:
        stripped = line.strip()
        # Skip if line starts with <<if or <<elseif (it's a valid one-liner)
        if stripped.startswith("<<if") or stripped.startswith("<<elseif"):
            result.append(line)
            continue

        # Find <<else>> or <<elseif ...>> after non-whitespace
        m = re.search(r"(?<=\S)(<<else(?:if)?\b[^>]*>>)", line)
        if m:
            indent = get_indent(line)
            before = line[:m.start()].rstrip()
            else_and_after = line[m.start():]
            result.append(before)
            result.append(indent + else_and_after)
        else:
            result.append(line)
    return result


# ---------------------------------------------------------------------------
# Pipeline
# ---------------------------------------------------------------------------

ALL_FIXES = [
    fix_trailing_whitespace,
    fix_mixed_indent,
    fix_inline_else,
    fix_multi_close_and_content_close,
    fix_link_space_pipe,
]

# Only whitespace fixes for [script] passages — macro patterns in JS strings
# are not real Twee macros and must not be split/reformatted.
SAFE_FIXES = [
    fix_trailing_whitespace,
    fix_mixed_indent,
]

PASSAGE_HEADER_TAGS = re.compile(r"^::\s*.+?\s*\[([^\]]*)\]")


def fix_file(path: Path, dry_run: bool = False) -> bool:
    """Apply all fixes to a file. Returns True if the file was changed."""
    original = path.read_text(encoding="utf-8")
    lines = original.split("\n")

    # Detect if entire file is a [script] passage
    is_script = False
    for line in lines:
        m = PASSAGE_HEADER_TAGS.match(line)
        if m and "script" in m.group(1).split():
            is_script = True
            break

    fixes = SAFE_FIXES if is_script else ALL_FIXES
    for fix in fixes:
        lines = fix(lines)

    fixed = "\n".join(lines)
    if fixed == original:
        return False

    if not dry_run:
        path.write_text(fixed, encoding="utf-8")
    return True


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(description="Auto-fix Twee formatting issues")
    parser.add_argument("files", nargs="*", help="Specific .tw files (default: all)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Report what would change without writing files")
    args = parser.parse_args()

    if args.files:
        tw_files = [Path(f).resolve() for f in args.files]
    else:
        tw_files = sorted(PASSAGES_DIR.rglob("*.tw"))

    changed = 0
    for path in tw_files:
        rel = path.relative_to(PROJECT_DIR)
        if fix_file(path, dry_run=args.dry_run):
            changed += 1
            tag = "(would fix)" if args.dry_run else "(fixed)"
            print(f"  {tag} {rel}")

    print(f"\n{changed} file{'s' if changed != 1 else ''} {'would be ' if args.dry_run else ''}modified out of {len(tw_files)} total.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
