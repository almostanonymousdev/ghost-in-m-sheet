#!/usr/bin/env python3
"""
Twee formatting linter for Ghost in M'Sheet (Twine/SugarCube).

Checks .tw files for common formatting issues:
  - Trailing whitespace
  - Mixed indentation (tabs vs spaces)
  - Multiple closing macros crammed on one line: <</if>><</if>>
  - Closing macro on same line as unrelated content: </video><</if>>
  - Unclosed / extra-closed container macros (<<if>> without <</if>>, etc.)
  - Space before pipe in links: [[text |Target]]
  - Inline <<else>> / <<elseif>> not on its own line

Usage:
  python3 check_format.py                   # lint all .tw files (human-readable)
  python3 check_format.py --vscode          # lint all, machine-readable for VSCode
  python3 check_format.py --vscode FILE...  # lint specific files
  python3 check_format.py --vscode --watch  # watch mode for VSCode background task
"""

import argparse
import re
import sys
import time
from pathlib import Path

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

PROJECT_DIR = Path(__file__).resolve().parent.parent
PASSAGES_DIR = PROJECT_DIR / "passages"

# Container macros that require a closing tag.  Extend as the project grows.
CONTAINER_MACROS = {
    "if", "for", "switch", "link", "linkappend", "linkreplace",
    "widget", "button", "done", "timed", "repeat",
    "nobr", "silently", "capture",
    "replace", "append", "prepend", "copy",
    "createplaylist", "type",
    # project-specific containers (from twee-config)
    "newmeter", "roomShell", "hovertip", "deliveryEventChoose",
}

# Tags where embedded <style> / <script> blocks live — skip indentation
# checks inside them because CSS/JS follow their own rules.
EMBEDDED_BLOCK_TAGS = {"style", "script"}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

PASSAGE_HEADER = re.compile(r"^::\s*(.+?)(?:\s*[\[{].*)?$")
PASSAGE_HEADER_TAGS = re.compile(r"^::\s*.+?\s*\[([^\]]*)\]")

# Matches an opening macro: <<name ...>>  (but not <</ or <<else or <<elseif)
OPEN_MACRO = re.compile(r"<<(?!/)(?!else\b)(?!elseif\b)(\w+)")
# Matches a closing macro: <</name>>
CLOSE_MACRO = re.compile(r"<</(\w+)>>")

# Multiple closing macros jammed together: >><</
MULTI_CLOSE = re.compile(r"<</\w+>>\s*<</\w+>>")

# Content directly followed by a closing macro on the same line
# e.g.  </video><</if>>   or   some text<</if>>
# Excludes lines that are *only* closing macros or only whitespace + closers.
CONTENT_THEN_CLOSE = re.compile(
    r"(?P<before>.+?)<</\w+>>"
)

# Space before pipe in a link: [[text |Target]]
LINK_SPACE_PIPE = re.compile(r"\[\[[^\]]*\s\|")

# <<else>> or <<elseif ...>> appearing after non-whitespace on the same line
INLINE_ELSE = re.compile(r"\S.*<<else(?:if)?\b")


def is_only_macros(line: str) -> bool:
    """Return True if the line (stripped) consists entirely of macro open/close tags."""
    cleaned = re.sub(r"<</?[^>]*>>", "", line).strip()
    return cleaned == ""


def is_in_embedded_block(lines: list[str], idx: int) -> bool:
    """Rough check: are we between an opening and closing <style>/<script> tag?"""
    depth = 0
    for i in range(idx):
        stripped = lines[i].strip().lower()
        for tag in EMBEDDED_BLOCK_TAGS:
            if re.search(rf"<{tag}\b", stripped):
                depth += 1
            if re.search(rf"</{tag}\s*>", stripped):
                depth -= 1
    return depth > 0


def comment_line_indices(lines: list[str]) -> set[int]:
    """0-based indices of lines whose content is comment body — lines
    that sit inside a /* ... */ block (including the closing ` */`
    line), plus whole-line // comments. Indent checks should skip these:
    wrapping text under a /* opener or aligning with `* `/`// ` is not
    the same as mixing code indentation."""
    result: set[int] = set()
    in_block = False
    for i, line in enumerate(lines):
        if in_block:
            result.add(i)
            if "*/" in line:
                in_block = False
            continue
        stripped = line.lstrip()
        if stripped.startswith("//"):
            result.add(i)
            continue
        start = line.find("/*")
        if start != -1 and line.find("*/", start + 2) == -1:
            # Opens a multi-line block comment; the opening line's own
            # indent is still at code level, so don't mark it.
            in_block = True
    return result


# ---------------------------------------------------------------------------
# Warning data class
# ---------------------------------------------------------------------------

class Warning:
    __slots__ = ("lineno", "col", "code", "message")

    def __init__(self, lineno: int, col: int, code: str, message: str):
        self.lineno = lineno
        self.col = col
        self.code = code
        self.message = message


# ---------------------------------------------------------------------------
# Per-line checks — return list[Warning]
# ---------------------------------------------------------------------------

def check_trailing_whitespace(line: str, lineno: int) -> list[Warning]:
    stripped = line.rstrip()
    if line != stripped:
        col = len(stripped) + 1
        return [Warning(lineno, col, "TW001", "trailing whitespace")]
    return []


def check_mixed_indent(line: str, lineno: int) -> list[Warning]:
    indent = line[: len(line) - len(line.lstrip())]
    if not indent:
        return []
    if "\t" in indent and " " in indent:
        return [Warning(lineno, 1, "TW002", "mixed tabs and spaces in indentation")]
    return []


def check_multi_close(line: str, lineno: int) -> list[Warning]:
    m = MULTI_CLOSE.search(line)
    if m:
        col = m.start() + 1
        return [Warning(lineno, col, "TW003", "multiple closing macros on one line")]
    return []


def check_content_then_close(line: str, lineno: int) -> list[Warning]:
    m = CONTENT_THEN_CLOSE.search(line)
    if not m:
        return []
    before = m.group("before").strip()
    if is_only_macros(before) or before == "":
        return []
    # Point to the closing macro
    close_start = line.find("<</", m.start())
    col = (close_start + 1) if close_start >= 0 else 1
    return [Warning(lineno, col, "TW004", "closing macro on same line as content")]


def check_link_space_pipe(line: str, lineno: int) -> list[Warning]:
    m = LINK_SPACE_PIPE.search(line)
    if m:
        # Point to the space before the pipe
        pipe_pos = line.find("|", m.start())
        col = pipe_pos  # the space is one char before the pipe
        return [Warning(lineno, col, "TW005", "space before | in link")]
    return []


def check_inline_else(line: str, lineno: int) -> list[Warning]:
    m = INLINE_ELSE.search(line)
    if not m:
        return []
    stripped = line.strip()
    if stripped.startswith("<<if") or stripped.startswith("<<elseif"):
        return []
    else_pos = line.find("<<else", m.start())
    col = (else_pos + 1) if else_pos >= 0 else 1
    return [Warning(lineno, col, "TW006", "<<else>>/<<elseif>> should start on its own line")]


# ---------------------------------------------------------------------------
# Whole-passage check: balanced container macros
# ---------------------------------------------------------------------------

def check_balanced_macros(lines: list[str], start_line: int) -> list[Warning]:
    warnings = []
    stack: list[tuple[str, int]] = []
    in_block_comment = False

    for lineno_0, line in enumerate(lines):
        lineno = start_line + lineno_0

        # Track multi-line /* ... */ comments
        working = line
        if in_block_comment:
            end = working.find("*/")
            if end == -1:
                continue
            working = working[end + 2:]
            in_block_comment = False
        # Strip any /* that opens on this line without closing
        while "/*" in working:
            start = working.find("/*")
            end = working.find("*/", start + 2)
            if end == -1:
                working = working[:start]
                in_block_comment = True
                break
            working = working[:start] + working[end + 2:]

        tokens: list[tuple[int, str, bool]] = []
        for m in OPEN_MACRO.finditer(working):
            name = m.group(1).lower()
            if name in CONTAINER_MACROS:
                tokens.append((m.start(), name, False))
        for m in CLOSE_MACRO.finditer(working):
            name = m.group(1).lower()
            if name in CONTAINER_MACROS:
                tokens.append((m.start(), name, True))

        tokens.sort(key=lambda t: t[0])

        for pos, name, is_close in tokens:
            col = pos + 1
            if not is_close:
                stack.append((name, lineno))
            else:
                if stack and stack[-1][0] == name:
                    stack.pop()
                elif stack:
                    top_name, top_line = stack[-1]
                    warnings.append(Warning(
                        lineno, col, "TW007",
                        f"<</{name}>> closes, but innermost open is <<{top_name}>> (line {top_line})"
                    ))
                    stack.pop()
                else:
                    warnings.append(Warning(
                        lineno, col, "TW007",
                        f"<</{name}>> has no matching opener"
                    ))

    for name, lineno in stack:
        warnings.append(Warning(lineno, 1, "TW007", f"<<{name}>> is never closed"))

    return warnings


# ---------------------------------------------------------------------------
# Lint one file
# ---------------------------------------------------------------------------

LINE_CHECKS = [
    check_trailing_whitespace,
    check_mixed_indent,
    check_multi_close,
    check_content_then_close,
    check_link_space_pipe,
    check_inline_else,
]


def lint_file(path: Path) -> list[Warning]:
    """Return a list of Warning objects for *path*."""
    text = path.read_text(encoding="utf-8")
    lines = text.split("\n")
    warnings: list[Warning] = []

    # Split into passages
    passages: list[tuple[str, int, list[str]]] = []
    current_name = "(file header)"
    current_start = 1
    current_lines: list[str] = []

    for i, line in enumerate(lines):
        m = PASSAGE_HEADER.match(line)
        if m:
            if current_lines:
                passages.append((current_name, current_start, current_lines))
            current_name = m.group(1).strip()
            current_start = i + 1
            current_lines = [line]
        else:
            current_lines.append(line)
    if current_lines:
        passages.append((current_name, current_start, current_lines))

    for pname, pstart, plines in passages:
        # Detect [script] passages — skip balanced-macro check on them
        is_script = False
        if plines:
            tag_m = PASSAGE_HEADER_TAGS.match(plines[0])
            if tag_m:
                tags = tag_m.group(1).split()
                is_script = "script" in tags

        # In [script] passages, only check whitespace — macro patterns
        # appear inside JS strings and are not actual Twee macros.
        checks = LINE_CHECKS if not is_script else [
            check_trailing_whitespace,
            check_mixed_indent,
        ]

        comment_lines = comment_line_indices(plines)

        for j, line in enumerate(plines):
            lineno = pstart + j
            in_embed = is_in_embedded_block(plines, j)
            in_comment = j in comment_lines
            for check in checks:
                if check is check_mixed_indent and (in_embed or in_comment):
                    continue
                warnings.extend(check(line, lineno))

        if not is_script:
            warnings.extend(check_balanced_macros(plines, pstart))

    return warnings


# ---------------------------------------------------------------------------
# Output formatters
# ---------------------------------------------------------------------------

def format_human(path: Path, warnings: list[Warning]) -> str:
    """Human-readable grouped output (original format)."""
    rel = path.relative_to(PROJECT_DIR)
    count = len(warnings)
    lines = [f"\n{rel}  ({count} warning{'s' if count != 1 else ''})"]
    for w in warnings:
        lines.append(f"  line {w.lineno}: {w.message}")
    return "\n".join(lines)


def format_vscode(path: Path, warnings: list[Warning]) -> str:
    """Machine-readable: file:line:col: warning CODE: message

    This format is parsed by the VSCode problemMatcher.
    """
    rel = path.relative_to(PROJECT_DIR)
    lines = []
    for w in warnings:
        lines.append(f"{rel}:{w.lineno}:{w.col}: warning {w.code}: {w.message}")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Watch mode
# ---------------------------------------------------------------------------

def collect_mtimes(files: list[Path]) -> dict[Path, float]:
    result = {}
    for f in files:
        try:
            result[f] = f.stat().st_mtime
        except OSError:
            pass
    return result


def watch_loop(files: list[Path] | None, formatter):
    """Poll for changes and re-lint modified files.

    Prints a sentinel line that the VSCode background problemMatcher uses
    to know when a lint cycle starts/ends, so stale diagnostics get cleared.
    """
    if files:
        tw_files = [Path(f).resolve() for f in files]
    else:
        tw_files = sorted(PASSAGES_DIR.rglob("*.tw"))

    mtimes = collect_mtimes(tw_files)

    # Initial full lint
    print(">>> twee-lint start", flush=True)
    for path in tw_files:
        warnings = lint_file(path)
        if warnings:
            print(formatter(path, warnings), flush=True)
    print(">>> twee-lint end", flush=True)

    while True:
        time.sleep(1)

        # Detect new files if watching all
        if not files:
            current_files = sorted(PASSAGES_DIR.rglob("*.tw"))
        else:
            current_files = tw_files

        changed = []
        new_mtimes = collect_mtimes(current_files)
        for f, mt in new_mtimes.items():
            if f not in mtimes or mtimes[f] != mt:
                changed.append(f)
        # Detect deleted files
        deleted = set(mtimes) - set(new_mtimes)
        mtimes = new_mtimes

        if changed or deleted:
            print(">>> twee-lint start", flush=True)
            for path in changed:
                try:
                    warnings = lint_file(path)
                    if warnings:
                        print(formatter(path, warnings), flush=True)
                except OSError:
                    pass
            print(">>> twee-lint end", flush=True)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(description="Twee formatting linter")
    parser.add_argument("files", nargs="*", help="Specific .tw files to lint (default: all)")
    parser.add_argument("--vscode", action="store_true",
                        help="Machine-readable output for VSCode problemMatcher")
    parser.add_argument("--watch", action="store_true",
                        help="Watch for changes and re-lint continuously")
    args = parser.parse_args()

    formatter = format_vscode if args.vscode else format_human

    if args.watch:
        try:
            watch_loop(args.files or None, formatter)
        except KeyboardInterrupt:
            return 0
        return 0

    # Determine file list
    if args.files:
        tw_files = [Path(f).resolve() for f in args.files]
    else:
        tw_files = sorted(PASSAGES_DIR.rglob("*.tw"))

    if not tw_files:
        print("No .tw files found.", file=sys.stderr)
        return 1

    total_warnings = 0
    files_with_warnings = 0

    if args.vscode:
        for path in tw_files:
            warnings = lint_file(path)
            if warnings:
                files_with_warnings += 1
                total_warnings += len(warnings)
                print(formatter(path, warnings))
    else:
        for path in tw_files:
            warnings = lint_file(path)
            if warnings:
                files_with_warnings += 1
                total_warnings += len(warnings)
                print(formatter(path, warnings))

        print()
        if total_warnings:
            print(
                f"Found {total_warnings} formatting warning{'s' if total_warnings != 1 else ''} "
                f"in {files_with_warnings} file{'s' if files_with_warnings != 1 else ''}."
            )
        else:
            print(f"All {len(tw_files)} files passed formatting checks.")

    return 1 if total_warnings else 0


if __name__ == "__main__":
    sys.exit(main())
