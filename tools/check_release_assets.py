#!/usr/bin/env python3
"""Pre-release asset audit.

Two responsibilities, both run unconditionally:

1. Compare every relative path that exists in BOTH `asset-placeholders/` and
   `assets/`. If the two files are byte-identical, the "real" asset is still
   the dev stub — fail (exit 1) and list the offenders.

2. Add an entry to `assets/index.json` for any media file under `assets/`
   that isn't already listed. Existing entries (incl. source metadata) are
   preserved verbatim; only the file is rewritten, only when it changed.

Wired in as a dependency of the Package Release tasks so a release can never
ship a placeholder-as-asset by accident, and the index always reflects what
is actually on disk.
"""
from __future__ import annotations

import hashlib
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from build_asset_index import (
    ASSETS,
    OUT,
    build_entry,
    collect_files,
    load_sources,
)
from lib_repo import repo_root

PLACEHOLDERS = repo_root() / "asset-placeholders"


def file_sha(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def find_placeholder_dupes() -> list[str]:
    """Return relative paths whose placeholder and asset bytes match."""
    if not PLACEHOLDERS.is_dir():
        return []
    candidates: list[tuple[Path, Path, str]] = []
    for p_path in PLACEHOLDERS.rglob("*"):
        if not p_path.is_file():
            continue
        rel = p_path.relative_to(PLACEHOLDERS)
        a_path = ASSETS / rel
        if not a_path.is_file():
            continue
        if a_path.stat().st_size != p_path.stat().st_size:
            continue
        candidates.append((p_path, a_path, rel.as_posix()))
    if not candidates:
        return []
    with ThreadPoolExecutor(max_workers=8) as ex:
        results = list(
            ex.map(
                lambda triple: (triple[2], file_sha(triple[0]), file_sha(triple[1])),
                candidates,
            )
        )
    return [rel for rel, h_p, h_a in results if h_p == h_a]


def sync_index() -> tuple[int, int]:
    """Add entries for on-disk media not listed in index.json. Return (existing, added)."""
    if OUT.exists():
        existing = json.loads(OUT.read_text(encoding="utf-8"))
    else:
        existing = []
    by_path = {e["path"]: e for e in existing}
    files = collect_files()
    new_files = [p for p in files if p.relative_to(ASSETS).as_posix() not in by_path]
    if not new_files:
        return len(existing), 0
    print(
        f"check_release_assets: indexing {len(new_files)} new media file(s)...",
        file=sys.stderr,
    )
    sources = load_sources()
    with ThreadPoolExecutor(max_workers=16) as ex:
        new_entries = list(ex.map(lambda p: build_entry(p, sources), new_files))
    merged = existing + new_entries
    merged.sort(key=lambda e: e["path"])
    OUT.write_text(json.dumps(merged, indent=2) + "\n", encoding="utf-8")
    return len(existing), len(new_entries)


def main() -> int:
    existing, added = sync_index()
    total = existing + added
    if added:
        print(
            f"check_release_assets: index now has {total} entries (+{added} new)",
            file=sys.stderr,
        )

    dupes = find_placeholder_dupes()
    if dupes:
        print(
            "check_release_assets: ERROR — these assets are byte-identical to their placeholder:",
            file=sys.stderr,
        )
        for d in dupes:
            print(f"  {d}", file=sys.stderr)
        print(
            "Replace each with a real asset (or remove the placeholder) before packaging.",
            file=sys.stderr,
        )
        return 1

    print(
        f"check_release_assets: OK — {total} indexed assets, no placeholder duplicates.",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
