#!/usr/bin/env python3
"""
Asset reference checker for Ghost in M'Sheet (Twine/SugarCube).

Finds asset references in passage files that point to files not present on disk.
Supports both legacy src="assets/..." and the setup.ImagePath variable patterns.
"""

import re
import sys
from pathlib import Path

# Parse ASSET_BASE from StoryInit's setup.ImagePath assignment
_STORY_INIT = Path(__file__).parent / "passages" / "StoryInit.tw"
_IMAGE_PATH_RE = re.compile(r'''setup\.ImagePath\s*=\s*["']([^"']+)["']''')
ASSET_BASE = "assets"  # fallback
if _STORY_INIT.is_file():
    _match = _IMAGE_PATH_RE.search(_STORY_INIT.read_text(encoding="utf-8", errors="replace"))
    if _match:
        ASSET_BASE = _match.group(1)

# Patterns that reference assets:
# 1. @src="setup.ImagePath + '/PATH'" (static img/source tags)
# 2. @src='setup.ImagePath + "/PATH"' (inside <<link>> macros)
# 3. Legacy src="assets/..." or href="assets/..." (if any remain)
# 4. url('assets/...') in CSS
# 5. <<furnitureItem "FILE.png" "id">> — first arg is a filename under
#    img/furniture/ (the haunted-house furniture widget)
# 6. <<hideSpot "passage" "FILE.png" "id">> — second arg is a filename under
#    img/furniture/ (the cursed-hunt hide-spot widget)
ASSET_PATTERNS = [
    re.compile(r"""@src=["']setup\.ImagePath\s*\+\s*'(/[^']+)'["']"""),
    re.compile(r"""@src='setup\.ImagePath\s*\+\s*\\"/([^\\]+)\\"'"""),
    re.compile(r"""(?:src|href)=["'](assets/[^"']+)["']"""),
    re.compile(r"""url\(['"]?(assets/[^"')]+)['"]?\)"""),
    re.compile(r"""<<furnitureItem\s+["']([^"']+)["']"""),
    re.compile(r"""<<hideSpot\s+["'][^"']+["']\s+["']([^"']+)["']"""),
]

# Patterns above whose captured group is just a furniture filename and needs
# the "/img/furniture/" prefix prepended before lookup.
FURNITURE_WIDGET_PATTERN_INDICES = {4, 5}


def main():
    repo_root = Path(__file__).parent
    passages_dir = repo_root / "passages"

    if not passages_dir.is_dir():
        print(f"ERROR: passages directory not found at {passages_dir}", file=sys.stderr)
        sys.exit(1)

    # Collect all asset references: (rel_path, file, lineno)
    refs: list[tuple[str, Path, int]] = []
    for tw_file in sorted(passages_dir.rglob("*.tw")):
        for lineno, line in enumerate(
            tw_file.read_text(encoding="utf-8", errors="replace").splitlines(), 1
        ):
            for pi, pattern in enumerate(ASSET_PATTERNS):
                for m in pattern.finditer(line):
                    raw = m.group(1)
                    if pi in FURNITURE_WIDGET_PATTERN_INDICES:
                        raw = "/img/furniture/" + raw
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
                    refs.append((asset_path, tw_file, lineno))

    missing: list[tuple[str, Path, int]] = [
        (asset_path, tw_file, lineno)
        for asset_path, tw_file, lineno in refs
        if not (repo_root / asset_path).exists()
    ]

    # Deduplicate: one report per unique asset path
    seen_assets: set[str] = set()
    unique_missing: list[tuple[str, Path, int]] = []
    for asset_path, tw_file, lineno in missing:
        if asset_path not in seen_assets:
            seen_assets.add(asset_path)
            unique_missing.append((asset_path, tw_file, lineno))

    print(f"Asset references checked : {len(refs)}")

    if not unique_missing:
        print("All referenced assets exist on disk.")
        sys.exit(0)

    print(f"\nMISSING ASSETS ({len(unique_missing)} unique paths):\n")

    # Group first occurrence by asset path
    for asset_path, tw_file, lineno in sorted(unique_missing):
        try:
            rel = tw_file.relative_to(repo_root)
        except ValueError:
            rel = tw_file
        print(f"  {asset_path}")
        print(f"      first referenced at {rel}:{lineno}")

    sys.exit(1)


if __name__ == "__main__":
    main()
