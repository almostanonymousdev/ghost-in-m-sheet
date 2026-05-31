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
    # "+" means the path is a dynamic concatenation, which we can't resolve
    # statically.
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


def main():
    root = repo_root()
    pdir = passages_dir()

    if not pdir.is_dir():
        print(f"ERROR: passages directory not found at {pdir}", file=sys.stderr)
        sys.exit(1)

    # Collect all asset references: (rel_path, file, lineno)
    refs: list[tuple[str, Path, int]] = []
    for src_file in iter_asset_sources():
        for lineno, line in enumerate(read_source(src_file).splitlines(), 1):
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
                    # Normalise: map every reference to ASSET_BASE/…
                    if raw.startswith("assets/"):
                        # CSS url() and legacy src= use literal "assets/";
                        # the runtime JS rewriter swaps that prefix for ASSET_BASE
                        asset_path = ASSET_BASE + raw[len("assets"):]
                    elif raw.startswith("/"):
                        asset_path = ASSET_BASE + raw
                    elif not raw.startswith(ASSET_BASE + "/"):
                        asset_path = ASSET_BASE + "/" + raw
                    else:
                        asset_path = raw
                    refs.append((asset_path, src_file, lineno))

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

    print(f"Asset references checked : {len(refs)}")

    if not unique_missing:
        print("All referenced assets exist on disk.")
        sys.exit(0)

    print(f"\nMISSING ASSETS ({len(unique_missing)} unique paths):\n")

    # Group first occurrence by asset path
    for asset_path, src_file, lineno in sorted(unique_missing):
        try:
            rel = src_file.relative_to(root)
        except ValueError:
            rel = src_file
        print(f"  {asset_path}")
        print(f"      first referenced at {rel}:{lineno}")

    sys.exit(1)


if __name__ == "__main__":
    main()
