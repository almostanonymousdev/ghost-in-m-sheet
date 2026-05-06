#!/usr/bin/env python3
"""
Automatic formatter for twee3-sugarcube-2 source files.

Covers every mechanically-fixable rule from check_format.py and the
JS tw-source-lint suite, plus a prettier-style re-indentation pass.

Per-line cosmetic fixes
  * strip trailing whitespace
  * normalise mixed tabs/spaces in leading indent to tabs
  * collapse whitespace inside macro delimiters
      <<  set $x >>        ->  <<set $x>>
      <</ if >>            ->  <</if>>
      <<   else>>          ->  <<else>>
  * remove whitespace immediately around the pipe in wiki links
      [[Text | Target]]    ->  [[Text|Target]]
  * normalise passage headers
      ::Name[a a b]{ … }   ->  :: Name [a b] {…}
      (dedupe tags, single space after ::, space between name/tags/meta)

Structural fixes
  * split jammed closing macros   <</if>><</if>>
  * split content followed by a closing macro onto separate lines
  * push <<else>> / <<elseif>> onto their own line
  * split lines with 3+ unpaired block-macro tags
  * re-indent [nobr] passages so closing and mid-block tags align with
    their opener and nested content sits one tab deeper

Whole-file hygiene
  * collapse runs of 3+ blank lines to a single blank line
  * ensure exactly one blank line between passages
  * ensure the file ends with a single trailing newline
  * preserve an optional UTF-8 BOM if present

Safety
  * [script] and [stylesheet] passages get only whitespace fixes — their
    bodies are real JS/CSS with their own rules.
  * Content inside <<script>>…<</script>>, <style>…</style>, and
    /* … */ block comments is kept verbatim.
  * Multi-line macros (`<<set $x to { …\n… }>>`) are detected and their
    continuation lines are exempt from structural and indent changes.
  * Quoted strings inside macro arguments are preserved byte-for-byte —
    fixes are applied only to content outside any string / comment.

TW007 (unbalanced container macros) still needs human review.

Usage:
    python3 format_twee.py                   # format every .tw under passages/
    python3 format_twee.py FILE ...          # format specific files
    python3 format_twee.py --dry-run         # report what would change
    python3 format_twee.py --check           # exit 1 if any file would change
"""

from __future__ import annotations

import argparse
import difflib
import re
import sys
from pathlib import Path

from lib_repo import passages_dir, repo_root

PROJECT_DIR = repo_root()
PASSAGES_DIR = passages_dir()

# Container (block) macros — those whose <<name>> requires a <</name>> close
# and whose body is a real Twee region.  Kept in sync with check_format.py
# and the Playwright tw-source-lint spec.
BLOCK_MACROS = frozenset({
    "if", "for", "switch", "widget", "button",
    "done", "capture", "nobr", "timed", "repeat",
    "silently", "script",
    "link", "linkappend", "linkprepend", "linkreplace",
    "replace", "append", "prepend", "copy",
    "createplaylist", "actions", "type",
    # project-specific containers (from t3lt.twee-config.yml)
    "newmeter", "roomshell", "hovertip", "deliveryeventchoose",
})

# Mid-block markers that share their parent block's indent.
MID_BLOCK = frozenset({"else", "elseif", "case", "default"})

# Passages tagged with these follow their own language's rules.
LANG_TAGS = frozenset({"script", "stylesheet"})

INDENT = "\t"
UTF8_BOM = "\ufeff"

PASSAGE_HEADER_RE = re.compile(r"^::\s*(.+?)\s*$")
PASSAGE_HEADER_PARTS_RE = re.compile(
    r"^::\s*"
    r"(?P<name>[^\[{][^\[{\n]*?)"
    r"(?:\s*(?P<tags>\[[^\]]*\]))?"
    r"(?:\s*(?P<meta>\{.*\}))?"
    r"\s*$"
)

# Inline block-macro scanner (same shape as tw-source-lint.spec.js)
BLOCK_MACRO_TOKEN_RE = re.compile(r"<<\s*(/?)\s*([a-z][\w]*)", re.IGNORECASE)

# Any <<…>> on a line (non-greedy, single-line).
MACRO_RE = re.compile(r"<<([^\n]*?)>>")

# Macro whose body spans multiple lines starts with <<… but has no >> on the
# same line (common pattern: <<set $x to {\n  …\n}>>).
OPEN_UNCLOSED_RE = re.compile(r"<<")
CLOSE_RE = re.compile(r">>")


def strip_block_comments(lines: list[str]) -> list[str]:
    """Return a parallel list with /* … */ block comments and <!-- … -->
    HTML comments replaced by whitespace (length-preserving, so character
    offsets and line counts stay valid).

    Used before scanning for block-macro tokens so `<<link>>` or similar
    SugarCube syntax appearing inside a comment doesn't corrupt the
    formatter's block stack.
    """
    def blank_of(s: str) -> str:
        return re.sub(r"[^\n]", " ", s)

    joined = "\n".join(lines)
    joined = re.sub(r"/\*.*?\*/", lambda m: blank_of(m.group(0)), joined, flags=re.DOTALL)
    joined = re.sub(r"<!--.*?-->", lambda m: blank_of(m.group(0)), joined, flags=re.DOTALL)
    return joined.split("\n")


# ---------------------------------------------------------------------------
# String-aware helpers
# ---------------------------------------------------------------------------

def blank_strings_and_comments(line: str) -> str:
    """Return *line* with quoted strings and /* */ comments blanked out.

    Used when scanning for syntactic tokens that must be ignored inside
    strings / comments.  Length is preserved so match offsets stay valid.
    """
    def blank(m: re.Match) -> str:
        return " " * len(m.group(0))

    result = re.sub(r"/\*.*?\*/", blank, line)
    # Single-line strings only — keep a stray apostrophe from eating the rest.
    result = re.sub(r'"(?:[^"\\]|\\.)*"', blank, result)
    result = re.sub(r"'(?:[^'\\]|\\.)*'", blank, result)
    result = re.sub(r"`(?:[^`\\]|\\.)*`", blank, result)
    return result


# ---------------------------------------------------------------------------
# Per-line cosmetic fixes
# ---------------------------------------------------------------------------

def strip_trailing_ws(line: str) -> str:
    return line.rstrip()


def normalise_mixed_indent(line: str) -> str:
    """Leading mixed tabs/spaces → tabs (assume tab = 4)."""
    indent = line[: len(line) - len(line.lstrip())]
    if not indent or "\t" not in indent or " " not in indent:
        return line
    expanded = indent.expandtabs(4)
    spaces = len(expanded)
    tabs = spaces // 4 + (1 if spaces % 4 >= 2 else 0)
    return INDENT * tabs + line.lstrip()


def normalise_macro_whitespace(line: str) -> str:
    """Collapse internal whitespace in every <<…>> on the line."""
    def fix(m: re.Match) -> str:
        body = m.group(1)
        stripped = body.strip()
        if not stripped:
            return m.group(0)
        # Insert exactly one space between leading slash and name.
        stripped = re.sub(r"^/\s+", "/", stripped)
        # Collapse whitespace between the macro name and its args.
        #   <<set   $x   to   1>>  ->  <<set $x to 1>>
        # Don't touch whitespace inside quoted strings.
        return f"<<{_collapse_toplevel_spaces(stripped)}>>"

    return MACRO_RE.sub(fix, line)


def _collapse_toplevel_spaces(body: str) -> str:
    """Collapse runs of horizontal whitespace that are NOT inside a string."""
    out = []
    i = 0
    in_str = None  # active quote char, or None
    while i < len(body):
        ch = body[i]
        if in_str:
            out.append(ch)
            if ch == "\\" and i + 1 < len(body):
                out.append(body[i + 1])
                i += 2
                continue
            if ch == in_str:
                in_str = None
            i += 1
            continue
        if ch in ('"', "'", "`"):
            in_str = ch
            out.append(ch)
            i += 1
            continue
        if ch in " \t":
            # Collapse this whitespace run to a single space.
            out.append(" ")
            while i < len(body) and body[i] in " \t":
                i += 1
            continue
        out.append(ch)
        i += 1
    return "".join(out)


def normalise_link_pipes(line: str) -> str:
    """[[Text | Target][setter]] → [[Text|Target][setter]]

    Operates on [[...]] blocks; strips whitespace immediately around every `|`.
    """
    def fix(m: re.Match) -> str:
        inner = m.group(1)
        inner = re.sub(r"\s*\|\s*", "|", inner)
        return f"[[{inner}]]"

    return re.sub(r"\[\[([^\[\]\n]*)\]\]", fix, line)


# ---------------------------------------------------------------------------
# Passage header normaliser
# ---------------------------------------------------------------------------

def normalise_passage_header(line: str) -> str:
    """Return a canonical `:: Name [tags] {metadata}` header line."""
    if not line.startswith("::"):
        return line

    body = line[2:].strip()
    if not body:
        return line

    # Peel off optional {metadata} at the end.
    meta = ""
    if body.endswith("}"):
        depth, start = 0, -1
        for i in range(len(body) - 1, -1, -1):
            c = body[i]
            if c == "}":
                depth += 1
            elif c == "{":
                depth -= 1
                if depth == 0:
                    start = i
                    break
        if start > 0:
            meta = body[start:].strip()
            body = body[:start].rstrip()

    # Peel off optional [tags].
    tags = ""
    if body.endswith("]"):
        start = body.rfind("[")
        if start > 0:
            tags_raw = body[start + 1 : -1]
            seen, ordered = set(), []
            for t in tags_raw.split():
                if t not in seen:
                    seen.add(t)
                    ordered.append(t)
            if ordered:
                tags = f"[{' '.join(ordered)}]"
            body = body[:start].rstrip()

    name = body.strip()
    parts = [f":: {name}"] if name else ["::"]
    if tags:
        parts.append(tags)
    if meta:
        parts.append(meta)
    return " ".join(parts)


# ---------------------------------------------------------------------------
# Structural fixes (multi-line)
# ---------------------------------------------------------------------------

def is_only_macros(text: str) -> bool:
    cleaned = re.sub(r"<</?[^>]*>>", "", text).strip()
    return cleaned == ""


def split_closing_macros(line: str) -> list[str]:
    """Break lines that jam multiple closers or content+close together."""
    stripped = line.strip()
    indent = line[: len(line) - len(line.lstrip())]

    # Pure-closer line: one close per output line.
    if re.fullmatch(r"(\s*<</\w+>>\s*)+", stripped):
        parts = re.findall(r"<</\w+>>", stripped)
        if len(parts) <= 1:
            return [line]
        return [indent + p for p in parts]

    all_closes = list(re.finditer(r"<</\w+>>", line))
    if not all_closes:
        return [line]

    # Content followed by a closer — pull the closer(s) onto their own lines.
    for m in all_closes:
        before = line[: m.start()]
        if before.strip() and not is_only_macros(before.strip()):
            content = before.rstrip()
            rest = line[m.start():].strip()
            return [content] + split_closing_macros(indent + rest)

    # Two closers jammed together after macro-only content
    if re.search(r"<</\w+>>\s*<</\w+>>", line):
        first = all_closes[0]
        prefix = line[: first.start()].rstrip()
        closers = re.findall(r"<</\w+>>", line[first.start():])
        out = []
        if prefix.strip():
            out.append(prefix)
        out.extend(indent + c for c in closers)
        return out

    return [line]


def split_inline_else(line: str) -> list[str]:
    """Pull an inline <<else>> / <<elseif …>> onto its own line."""
    stripped = line.strip()
    if stripped.startswith("<<if") or stripped.startswith("<<elseif"):
        return [line]
    m = re.search(r"(?<=\S)(<<\s*else(?:if)?\b[^>]*>>)", line)
    if not m:
        return [line]
    indent = line[: len(line) - len(line.lstrip())]
    before = line[: m.start()].rstrip()
    after = line[m.start():]
    result = []
    if before.strip():
        result.append(before)
    result.append(indent + after)
    return result


def split_trailing_opens(line: str) -> list[str]:
    """Break content that drags a trailing open-block macro onto a new line.

    Targets the `<<if cond>>stuff<<something>>` anti-pattern where the second
    block-macro opener hangs off the end of a content line.  Only splits
    when the line has 3+ unpaired block-macro tags (same heuristic as the
    lint).  Leaves simple 2-token lines alone.
    """
    macros = _scan_block_macros(line)
    if len(macros) < 3:
        return [line]
    # Split at every block-macro boundary that isn't the first one.
    indent = line[: len(line) - len(line.lstrip())]
    out = []
    prev_end = 0
    for idx, (pos, _kind, _name) in enumerate(macros):
        if idx == 0:
            continue
        segment = line[prev_end:pos].rstrip()
        if segment:
            out.append(segment if out else segment)
            prev_end = pos
        # first segment keeps original indent; subsequent use same indent
    tail = line[prev_end:].rstrip()
    if tail:
        out.append((indent if out else "") + tail)
    return out if len(out) > 1 else [line]


def _scan_block_macros(line: str) -> list[tuple[int, str, str]]:
    """Return [(pos, kind, name)] for block-macro tokens on *line*.

    *kind* ∈ {"open", "close", "mid"}.  Same-line open+close pairs for the
    same name are collapsed (both are dropped) so inline patterns like
    `<<link "x" "y">><</link>>` don't count as two open blocks.
    """
    raw: list[tuple[int, str, str]] = []
    for m in BLOCK_MACRO_TOKEN_RE.finditer(line):
        is_close = m.group(1) == "/"
        name = m.group(2).lower()
        if is_close:
            if name in BLOCK_MACROS:
                raw.append((m.start(), "close", name))
        elif name in MID_BLOCK:
            raw.append((m.start(), "mid", name))
        elif name in BLOCK_MACROS:
            raw.append((m.start(), "open", name))
    # Pair same-line open+close (innermost first)
    paired: set[int] = set()
    for i in range(len(raw) - 1, -1, -1):
        if raw[i][1] != "close":
            continue
        for j in range(i - 1, -1, -1):
            if j in paired or i in paired:
                continue
            if raw[j][1] == "open" and raw[j][2] == raw[i][2]:
                paired.add(j)
                paired.add(i)
                break
    return [t for idx, t in enumerate(raw) if idx not in paired]


# ---------------------------------------------------------------------------
# Re-indentation
# ---------------------------------------------------------------------------

def reindent_lines(lines: list[str]) -> list[str]:
    """Rewrite leading whitespace so close/mid tags align with their opener
    and nested content is indented one tab deeper.

    The rules mirror the Playwright tw-source-lint indentation checks:
      * A leading close (`<</if>>`) or mid-block tag (`<<else>>`) takes
        the SAME leading whitespace as the line the matching opener lives on.
      * Any other line sits one tab deeper than its innermost open block
        (unless there's no enclosing block, in which case it's at column 0).

    Exempt regions — kept verbatim:
      * <<script>>…<</script>>
      * <style>…</style>
      * multi-line macros (`<<set $x to { … }>>` split across several lines)
      * blank lines
    """
    stack: list[tuple[str, str]] = []  # (name, line_indent_where_open_appears)
    inside_html_style = False
    inside_script_macro = False
    inside_multiline_macro = False
    multiline_depth = 0

    # Pre-strip block comments so <<link>> inside a JSDoc-style /* … */ or
    # HTML <!-- --> comment doesn't pollute the block-macro stack.
    scannable = strip_block_comments(lines)

    result: list[str] = []

    def _apply_macros_to_stack(scan_text: str, indent: str) -> None:
        for _pos, kind, name in _scan_block_macros(scan_text):
            if kind == "open":
                stack.append((name, indent))
            elif kind == "close":
                for s in range(len(stack) - 1, -1, -1):
                    if stack[s][0] == name:
                        del stack[s]
                        break

    for idx, raw_line in enumerate(lines):
        scan_line = scannable[idx]
        stripped = raw_line.strip()
        scan_stripped = scan_line.strip()
        original_indent = raw_line[: len(raw_line) - len(raw_line.lstrip())]

        safe = blank_strings_and_comments(scan_line)
        opens = len(OPEN_UNCLOSED_RE.findall(safe))
        closes = len(CLOSE_RE.findall(safe))

        if inside_multiline_macro:
            multiline_depth += opens - closes
            if multiline_depth <= 0:
                inside_multiline_macro = False
                multiline_depth = 0
            result.append(raw_line)
            continue

        if opens != closes:
            # Macro spans several lines — emit verbatim but still track block
            # opens/closes so the following lines know their context.
            _apply_macros_to_stack(scan_stripped, original_indent)
            inside_multiline_macro = True
            multiline_depth = opens - closes
            result.append(raw_line)
            continue

        if not stripped:
            result.append("")
            continue

        if inside_html_style:
            result.append(raw_line)
            if re.search(r"</style\s*>", stripped, re.IGNORECASE):
                inside_html_style = False
            continue
        if re.match(r"^<style[\s>]", stripped, re.IGNORECASE):
            parent_indent = (stack[-1][1] + INDENT) if stack else ""
            result.append(parent_indent + stripped)
            if not re.search(r"</style\s*>", stripped, re.IGNORECASE):
                inside_html_style = True
            continue

        if inside_script_macro:
            result.append(raw_line)
            for _pos, kind, name in _scan_block_macros(scan_stripped):
                if kind == "close" and name == "script":
                    inside_script_macro = False
                    for s in range(len(stack) - 1, -1, -1):
                        if stack[s][0] == "script":
                            del stack[s]
                            break
                    break
            continue

        macros = _scan_block_macros(scan_stripped)
        first = macros[0] if macros else None
        leading = first is not None and stripped.startswith("<<")

        if leading and first[1] == "close":
            # Alignment rule: close must match its opener's line-indent.
            new_indent = ""
            for s in range(len(stack) - 1, -1, -1):
                if stack[s][0] == first[2]:
                    new_indent = stack[s][1]
                    break
        elif leading and first[1] == "mid":
            # Mid-block markers share the enclosing block's indent.
            new_indent = stack[-1][1] if stack else ""
        else:
            # Content / nested opens: keep hand-placed indentation if it's
            # already deeper than the enclosing block (HTML children, deep
            # style blocks, etc.).  Only auto-fix when the line is shallower
            # than or equal to the enclosing block — that's a real violation.
            if stack:
                parent_indent = stack[-1][1]
                parent_width = len(parent_indent.expandtabs(4))
                current_width = len(original_indent.expandtabs(4))
                if current_width > parent_width:
                    new_indent = original_indent
                else:
                    new_indent = parent_indent + INDENT
            else:
                new_indent = original_indent

        result.append(new_indent + stripped)

        if first and first[1] == "open" and first[2] == "script":
            inside_script_macro = True

        _apply_macros_to_stack(scan_stripped, new_indent)

    return result


# ---------------------------------------------------------------------------
# Whole-file whitespace hygiene
# ---------------------------------------------------------------------------

def collapse_blank_runs(lines: list[str]) -> list[str]:
    """Collapse 3+ consecutive blank lines to exactly one blank line."""
    out: list[str] = []
    blank_run = 0
    for line in lines:
        if line.strip() == "":
            blank_run += 1
            if blank_run <= 1:
                out.append("")
        else:
            blank_run = 0
            out.append(line)
    return out


def ensure_blank_before_headers(lines: list[str]) -> list[str]:
    """Ensure exactly one blank line before every `:: …` header (except the
    first non-empty line in the file)."""
    out: list[str] = []
    for i, line in enumerate(lines):
        is_header = line.startswith("::")
        if is_header and out:
            # Walk back over existing blanks
            blanks = 0
            while out and out[-1].strip() == "":
                out.pop()
                blanks += 1
            # Only add a separator if there was actual content above
            if out:
                out.append("")
        out.append(line)
    return out


# ---------------------------------------------------------------------------
# Passage splitting & formatting
# ---------------------------------------------------------------------------

def split_into_passages(lines: list[str]) -> list[dict]:
    """Return [{name, tags, header_idx, body: list[str]}, …]

    Anything before the first :: header is stored as a synthetic leading
    block with name=None.
    """
    passages: list[dict] = []
    current = {"name": None, "tags": [], "header_idx": -1, "body": []}
    for i, line in enumerate(lines):
        if line.startswith("::"):
            m = PASSAGE_HEADER_PARTS_RE.match(line)
            passages.append(current)
            tags = []
            if m and m.group("tags"):
                tags = m.group("tags").strip("[]").split()
            current = {
                "name": (m.group("name").strip() if m else line[2:].strip()),
                "tags": tags,
                "header_idx": i,
                "header_line": line,
                "body": [],
            }
        else:
            current["body"].append(line)
    passages.append(current)
    return passages


def format_twee_passage(body: list[str], *, reindent: bool) -> list[str]:
    """Apply every Twee-aware fix to a non-script/non-stylesheet passage."""
    # Pass 1 — cosmetic per-line fixes
    out: list[str] = []
    for line in body:
        line = strip_trailing_ws(line)
        line = normalise_mixed_indent(line)
        line = normalise_link_pipes(line)
        line = normalise_macro_whitespace(line)
        out.append(line)

    # Pass 2 — structural splits that depend on single lines
    split1: list[str] = []
    for line in out:
        split1.extend(split_inline_else(line))

    split2: list[str] = []
    for line in split1:
        split2.extend(split_closing_macros(line))

    split3: list[str] = []
    for line in split2:
        split3.extend(split_trailing_opens(line))

    # Re-run trailing-whitespace cleanup on any lines produced by the splits
    split3 = [strip_trailing_ws(l) for l in split3]

    # Pass 3 — re-indent based on block nesting (only where safe).
    # Outside [nobr] passages, leading whitespace can alter rendered output,
    # so we leave it alone.
    if reindent:
        return reindent_lines(split3)
    return split3


def format_script_passage(body: list[str]) -> list[str]:
    """Minimal fixes for [script] / [stylesheet] bodies — keep JS / CSS intact.

    Mixed-indent normalisation is skipped here because JS traditionally uses
    ` * ` (tab-plus-space-plus-star) for JSDoc comment continuations, which
    would otherwise be rewritten to `\\t* ` and lose the visual alignment.
    """
    return [strip_trailing_ws(line) for line in body]


def format_file_text(text: str) -> str:
    """Format a complete .tw source string."""
    had_bom = text.startswith(UTF8_BOM)
    if had_bom:
        text = text[len(UTF8_BOM):]

    lines = text.split("\n")

    # Drop a trailing empty element produced by a final \n so the length
    # matches the number of physical lines — we re-add the terminator later.
    had_trailing_newline = text.endswith("\n")
    if had_trailing_newline and lines and lines[-1] == "":
        lines.pop()

    passages = split_into_passages(lines)

    new_lines: list[str] = []
    for idx, p in enumerate(passages):
        if p["name"] is None:
            # Leading block (file header comments etc.)
            # Strip trailing-ws only; don't reformat.
            for line in p["body"]:
                new_lines.append(strip_trailing_ws(line))
            continue

        header = normalise_passage_header(p["header_line"])
        new_lines.append(header)

        lower_tags = {t.lower() for t in p["tags"]}
        is_script = bool(lower_tags & LANG_TAGS)
        if is_script:
            body = format_script_passage(p["body"])
        else:
            body = format_twee_passage(p["body"], reindent="nobr" in lower_tags)

        # Strip blank lines at the very start & end of the body — the
        # whole-file pass will insert the single separator.
        while body and body[0].strip() == "":
            body.pop(0)
        while body and body[-1].strip() == "":
            body.pop()
        new_lines.extend(body)

    new_lines = collapse_blank_runs(new_lines)
    new_lines = ensure_blank_before_headers(new_lines)

    # Trim leading / trailing blank lines, then add exactly one terminator.
    while new_lines and new_lines[0].strip() == "":
        new_lines.pop(0)
    while new_lines and new_lines[-1].strip() == "":
        new_lines.pop()

    formatted = "\n".join(new_lines) + "\n"
    if had_bom:
        formatted = UTF8_BOM + formatted
    return formatted


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def process_path(path: Path, *, dry_run: bool, check: bool, show_diff: bool) -> bool:
    """Format one file.  Returns True iff the file was (or would be) changed."""
    original = path.read_text(encoding="utf-8")
    formatted = format_file_text(original)
    if formatted == original:
        return False

    try:
        rel = path.relative_to(PROJECT_DIR) if path.is_absolute() else path
    except ValueError:
        rel = path
    if show_diff:
        diff = difflib.unified_diff(
            original.splitlines(keepends=True),
            formatted.splitlines(keepends=True),
            fromfile=f"a/{rel}",
            tofile=f"b/{rel}",
        )
        sys.stdout.writelines(diff)

    tag = "(would fix)" if dry_run or check else "(fixed)"
    print(f"  {tag} {rel}")
    if not dry_run and not check:
        path.write_text(formatted, encoding="utf-8")
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description="Format twee3-sugarcube-2 files")
    parser.add_argument("files", nargs="*", help="Specific .tw files (default: all under passages/)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Report what would change without writing files")
    parser.add_argument("--check", action="store_true",
                        help="Exit non-zero if any file would change (implies --dry-run)")
    parser.add_argument("--diff", action="store_true",
                        help="Print a unified diff for each changed file")
    args = parser.parse_args()

    if args.files:
        tw_files = [Path(f).resolve() for f in args.files]
    else:
        tw_files = sorted(PASSAGES_DIR.rglob("*.tw"))

    if not tw_files:
        print("No .tw files found.", file=sys.stderr)
        return 1

    changed = 0
    for path in tw_files:
        try:
            if process_path(
                path,
                dry_run=args.dry_run,
                check=args.check,
                show_diff=args.diff,
            ):
                changed += 1
        except OSError as err:
            print(f"  (error) {path}: {err}", file=sys.stderr)

    verb = "would be" if (args.dry_run or args.check) else ""
    total = len(tw_files)
    if changed:
        print(f"\n{changed} file{'s' if changed != 1 else ''} {verb} modified out of {total} total.")
    else:
        print(f"\nAll {total} file{'s' if total != 1 else ''} already formatted.")

    if args.check and changed:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
