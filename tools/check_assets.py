#!/usr/bin/env python3
"""
Asset reference checker for Ghost in M'Sheet (Twine/SugarCube).

Finds asset references that point to files not present on disk. Scans the
whole source tree — twee passages (.tw), stylesheets (.css), and controller
scripts (.js) — because the .tw -> .js/.css migration moved CSS
`url(assets/…)` rules and JS asset-path tables out of passages and into
standalone files. Supports both legacy src="assets/..." and the
setup.ImagePath variable patterns.
"""

import re
import sys
from pathlib import Path

from lib_repo import image_path, iter_asset_sources, passages_dir, read_passage, repo_root

ASSET_BASE = image_path()

# Patterns that reference assets:
# 1. <<video "PATH">> / <<image "PATH">> — path relative to setup.ImagePath
# 2. Legacy src="assets/..." or href="assets/..." (if any remain)
# 3. url('assets/...') in CSS
# 4. <<furnitureItem "FILE.png" "id">> — first arg is a filename under
#    scenes/furniture/ (the haunted-house furniture widget)
# 5. <<hideSpot "passage" "FILE.png" "id">> — second arg is a filename under
#    scenes/furniture/ (the cursed-hunt hide-spot widget)
# 6. Bare "assets/PATH.ext" / 'assets/PATH.ext' string literals in JS data
#    tables (e.g. StyleController room backgrounds). Anchored on the literal
#    "assets/" prefix and a media extension so concatenation prefixes
#    ('assets/foo/' + v) and bare stems are not misread as files.
ASSET_PATTERNS = [
    # Only match when the path arg is a lone string literal — a trailing
    # space + quote, "{" (options object) or ">>" (macro close). A trailing
    # "+" means the path is a dynamic concatenation, handled separately by
    # the dynamic-path scanner below (scan_dynamic).
    re.compile(r"""<<(?:video|image)\s+["']/?([^"'\n]+?)["'](?=\s*(?:>>|\{|["']))"""),
    re.compile(r"""(?:src|href)=["'](assets/[^"']+)["']"""),
    re.compile(r"""url\(['"]?(assets/[^"')]+)['"]?\)"""),
    re.compile(r"""<<furnitureItem\s+["']([^"']+)["']"""),
    re.compile(r"""<<hideSpot\s+["'][^"']+["']\s+["']([^"']+)["']"""),
    re.compile(
        r"""["'](assets/[^"'\n]+?\.(?:jpg|jpeg|png|webp|gif|mp4|webm|svg))["']""",
        re.IGNORECASE,
    ),
]

# Patterns above whose captured group is just a furniture filename and needs
# the "/img/furniture/" prefix prepended before lookup.
FURNITURE_WIDGET_PATTERN_INDICES = {3, 4}

# `/* … */` block comment. DOTALL so it spans lines like the multi-line
# StyleController usage notes.
_BLOCK_COMMENT_RE = re.compile(r"/\*.*?\*/", re.DOTALL)


def _blank_keep_newlines(match: re.Match[str]) -> str:
    """Replace every non-newline char in `match` with a space.

    Keeps the comment's line/column footprint so line numbers reported
    against the stripped text still line up with the original file.
    """
    return re.sub(r"[^\n]", " ", match.group(0))


def strip_comments(text: str, suffix: str) -> str:
    """Blank `/* … */` block comments in .js/.css source.

    The asset macros (`<<video>>`/`<<image>>`) and bare "assets/…" string
    literals this script hunts for also appear verbatim inside JS/CSS
    doc-comments — e.g. the StyleController usage notes that document
    `<<video "characters/mc/bra-off.webm">>`. Those are documentation,
    not live references, so the example paths must not be required on
    disk. Blank the comment bodies (newlines preserved, so line numbers
    stay accurate) before scanning. Mirrors the same strip in
    tests/asset-references.spec.js. Twee (.tw) is returned verbatim —
    `/* */` there is ordinary prose, not a comment.
    """
    if suffix in (".js", ".css"):
        return _BLOCK_COMMENT_RE.sub(_blank_keep_newlines, text)
    return text


def read_source(path) -> str:
    """Read a source file with its JS/CSS block comments blanked out."""
    return strip_comments(read_passage(path), path.suffix)


def to_asset_path(raw: str) -> str:
    """Normalise a source-relative asset reference to a repo-root-relative
    path under ASSET_BASE.

    Mirrors the inline normalisation the static pass uses: CSS `url()` and
    legacy `src=` write a literal `assets/` prefix that the runtime rewriter
    swaps for ASSET_BASE; everything else is already ASSET_BASE-relative.
    Works for glob patterns too (the `*` segments pass through untouched).
    """
    if raw.startswith("assets/"):
        return ASSET_BASE + raw[len("assets"):]
    if raw.startswith("/"):
        return ASSET_BASE + raw
    if not raw.startswith(ASSET_BASE + "/"):
        return ASSET_BASE + "/" + raw
    return raw


# --- Dynamic (string-concatenation) asset paths --------------------------
#
# Many references are built at runtime by concatenation rather than written
# as a lone literal, e.g.
#     <<video "scenes/deliveryhub/specialevent/" + _pick + ".webm">>
#     <<image "ui/img/" + _icon { width: "90%" }>>
#     "characters/rescue/" + slug + "/" + chapter.id + "." + v + ".mp4"   (JS)
# The static scanner can't resolve these, but it CAN still police the literal
# anchors: replace every variable segment with `*` and require the resulting
# glob to match at least one file. That catches a fat-fingered directory or
# extension literal (the most common dynamic-path typo) while staying silent
# about the genuinely unknowable variable middle.
#
# A path with no leading literal anchor (e.g. `_args[0] + _n + _args[3]`, or a
# `${…}` template head) is skipped — there's nothing to glob against.

_WS = " \t\r\n"
_QUOTES = "\"'`"
# Top-level operator / bracket / separator chars that end a JS/Twee primary
# expression operand. `(` and `[` are handled by balanced-skip before this set
# is consulted, so a `,` inside `f(1, 2)` or `a[i + 1]` doesn't terminate.
_EXPR_TERMINATORS = set(" \t\r\n+-*/%(){}[],;:?|&!=<>\"'`")

# `<<video EXPR …>>` / `<<image EXPR …>>` — anchor at the macro keyword, then
# hand the rest to parse_concat. `\s+` after the name means `<<videoToggle …>>`
# and other longer names never match.
_MACRO_RE = re.compile(r"<<(?:video|image)\s+")
# Bare JS/Twee string literal whose head is a known asset bucket, e.g.
# `"characters/…" + …`. parse_concat starts at the opening quote.
_JS_ASSET_RE = re.compile(r"""["'](?:characters|scenes|outfits|mechanics|ui|assets)/""")


def _skip_balanced(s: str, i: int) -> int:
    """`s[i]` is `(` or `[`. Return the index just past its match, skipping
    nested brackets and string literals (so `)`/`]` inside a string don't
    close the wrong level)."""
    depth = 0
    n = len(s)
    while i < n:
        c = s[i]
        if c in "([":
            depth += 1
        elif c in ")]":
            depth -= 1
            if depth == 0:
                return i + 1
        elif c in _QUOTES:
            _, _, i = _read_string(s, i)
            continue
        i += 1
    return i


def _read_string(s: str, i: int):
    """`s[i]` is a quote (`"`, `'` or backtick). Return
    `(content, is_dynamic, end_index)`. `is_dynamic` is True for a template
    literal containing a `${…}` interpolation (unresolvable → caller treats
    the whole segment as a wildcard)."""
    q = s[i]
    i += 1
    n = len(s)
    buf = []
    dynamic = False
    while i < n:
        c = s[i]
        if c == "\\" and i + 1 < n:
            buf.append(s[i + 1])
            i += 2
            continue
        if q == "`" and c == "$" and i + 1 < n and s[i + 1] == "{":
            dynamic = True
            depth = 0
            i += 1  # now at "{"
            while i < n:
                if s[i] == "{":
                    depth += 1
                elif s[i] == "}":
                    depth -= 1
                    if depth == 0:
                        i += 1
                        break
                i += 1
            continue
        if c == q:
            return "".join(buf), dynamic, i + 1
        buf.append(c)
        i += 1
    return "".join(buf), dynamic, i  # unterminated


def _read_expr_operand(s: str, i: int) -> int:
    """`s[i]` starts a non-string primary expression (identifier, number,
    member access, call, index). Return the index just past it, keeping
    `(…)`/`[…]` balanced. Returns `i` unchanged if `s[i]` is already a
    terminator (nothing to consume)."""
    n = len(s)
    start = i
    while i < n:
        c = s[i]
        if c in "([":
            i = _skip_balanced(s, i)
            continue
        if c in _EXPR_TERMINATORS:
            break
        i += 1
    return i if i > start else start


def parse_concat(s: str, start: int = 0):
    """Parse a `+`-joined path expression beginning at `start`.

    Returns `(segments, end_index)` where `segments` is a list of
    `(value, is_literal)`: a string/template literal contributes its text
    with `is_literal=True`; anything else contributes `('*', False)`.
    Stops at the first whitespace-separated boundary that isn't a `+` (i.e.
    the next positional macro arg, an options `{…}`, or `>>`/EOL/`;`)."""
    segs = []
    i = start
    n = len(s)
    while True:
        while i < n and s[i] in _WS:
            i += 1
        if i >= n:
            break
        c = s[i]
        if c in _QUOTES:
            content, dynamic, i = _read_string(s, i)
            segs.append(("*", False) if dynamic else (content, True))
        else:
            j = _read_expr_operand(s, i)
            if j == i:
                break  # hit "{", ">>", etc. immediately — nothing to consume
            i = j
            segs.append(("*", False))
        while i < n and s[i] in _WS:
            i += 1
        if i < n and s[i] == "+":
            i += 1
            continue
        break
    return segs, i


def concat_to_glob(segs):
    """Turn parse_concat segments into a glob pattern, or None when the
    expression has no resolvable anchor.

    Skips unless: the leading segment is a literal (a real directory anchor),
    at least one segment is a variable (otherwise it's a plain literal the
    static pass already owns), and the literal-only text contains a `/`
    (so we never fall back to a whole-tree `*suffix` scan)."""
    if not segs or not segs[0][1]:
        return None
    if not any(not is_lit for _, is_lit in segs):
        return None
    literal_only = "".join(v for v, is_lit in segs if is_lit)
    if "/" not in literal_only:
        return None
    glob = "".join(v for v, _ in segs)
    # Collapse runs of `*` (`"a/" + x + y + ".mp4"` → `a/**.mp4` → `a/*.mp4`)
    # so the pattern never acquires pathlib's recursive `**` meaning.
    return re.sub(r"\*+", "*", glob)


def scan_dynamic(text: str):
    """Yield `(asset_glob, start_offset)` for every dynamic asset reference in
    `text` — both `<<video>>`/`<<image>>` macro args and bare asset-prefixed
    JS string concatenations. `asset_glob` is normalised under ASSET_BASE."""
    out = []
    matches = [(m.end(), m.start()) for m in _MACRO_RE.finditer(text)]
    matches += [(m.start(), m.start()) for m in _JS_ASSET_RE.finditer(text)]
    for parse_at, report_at in matches:
        segs, _ = parse_concat(text, parse_at)
        glob = concat_to_glob(segs)
        if not glob:
            continue
        norm = to_asset_path(glob)
        # The literal anchor must name a real directory under the asset tree,
        # not the asset root itself: `'assets/' + wholePathVar` normalises to
        # `<ASSET_BASE>/*`, a root wildcard that always matches and proves
        # nothing. The first path component under ASSET_BASE must be a literal.
        if norm.startswith(ASSET_BASE + "/*"):
            continue
        out.append((norm, report_at))
    return out


def main():
    root = repo_root()
    pdir = passages_dir()

    if not pdir.is_dir():
        print(f"ERROR: passages directory not found at {pdir}", file=sys.stderr)
        sys.exit(1)

    # Collect all asset references: (rel_path, file, lineno)
    refs: list[tuple[str, Path, int]] = []
    # Dynamic (concatenated) references, deduped by glob: glob -> (file, lineno)
    dyn_refs: dict[str, tuple[Path, int]] = {}
    for src_file in iter_asset_sources():
        text = read_source(src_file)
        # --- Static (lone-literal) references, line by line ---------------
        for lineno, line in enumerate(text.splitlines(), 1):
            for pi, pattern in enumerate(ASSET_PATTERNS):
                for m in pattern.finditer(line):
                    raw = m.group(1)
                    # Skip paths with template-literal interpolation markers
                    # (e.g. <<image `img/piercing/${_p.img}`>>) — these are
                    # resolved at runtime and can't be verified statically.
                    if "${" in raw:
                        continue
                    if pi in FURNITURE_WIDGET_PATTERN_INDICES:
                        raw = "/scenes/furniture/" + raw
                    refs.append((to_asset_path(raw), src_file, lineno))
        # --- Dynamic (concatenated) references, whole-text ----------------
        for glob_pat, off in scan_dynamic(text):
            if glob_pat in dyn_refs:
                continue
            lineno = text.count("\n", 0, off) + 1
            dyn_refs[glob_pat] = (src_file, lineno)

    missing: list[tuple[str, Path, int]] = [
        (asset_path, src_file, lineno)
        for asset_path, src_file, lineno in refs
        if not (root / asset_path).exists()
    ]

    # Deduplicate: one report per unique asset path
    seen_assets: set[str] = set()
    unique_missing: list[tuple[str, Path, int]] = []
    for asset_path, src_file, lineno in missing:
        if asset_path not in seen_assets:
            seen_assets.add(asset_path)
            unique_missing.append((asset_path, src_file, lineno))

    # A dynamic glob is "missing" when nothing on disk matches it.
    dyn_missing: list[tuple[str, Path, int]] = [
        (glob_pat, src_file, lineno)
        for glob_pat, (src_file, lineno) in dyn_refs.items()
        if next(root.glob(glob_pat), None) is None
    ]

    print(f"Asset references checked : {len(refs)} static, {len(dyn_refs)} dynamic")

    if not unique_missing and not dyn_missing:
        print("All referenced assets exist on disk.")
        sys.exit(0)

    if unique_missing:
        print(f"\nMISSING ASSETS ({len(unique_missing)} unique paths):\n")
        for asset_path, src_file, lineno in sorted(unique_missing):
            try:
                rel = src_file.relative_to(root)
            except ValueError:
                rel = src_file
            print(f"  {asset_path}")
            print(f"      first referenced at {rel}:{lineno}")

    if dyn_missing:
        print(f"\nMISSING DYNAMIC ASSETS ({len(dyn_missing)} unmatched globs):\n")
        for glob_pat, src_file, lineno in sorted(dyn_missing):
            try:
                rel = src_file.relative_to(root)
            except ValueError:
                rel = src_file
            print(f"  {glob_pat}  (no match)")
            print(f"      first referenced at {rel}:{lineno}")

    sys.exit(1)


if __name__ == "__main__":
    main()
