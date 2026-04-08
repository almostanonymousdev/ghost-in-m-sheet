#!/usr/bin/env python3
"""
Asset reference checker for Better Ghost Hunter (Twine/SugarCube).

Finds src="assets/..." and href="assets/..." references in passage files
that point to files not present on disk.
"""

import re
import sys
from pathlib import Path

# Match src or href values that start with assets/
ASSET_REF = re.compile(r"""(?:src|href)=["'](assets/[^"']+)["']""")


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
            for m in ASSET_REF.finditer(line):
                refs.append((m.group(1), tw_file, lineno))

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
