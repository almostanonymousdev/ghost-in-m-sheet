#!/usr/bin/env python3
"""Build a versioned incremental release zip.

Reads the most recent `vX.Y.Z` git tag, takes its commit date, and bundles
only assets whose `changed` field in `assets/index.json` is on or after
that date — paired with a freshly built `ghost-in-msheet.html`.

Folder layout inside the zip:

    ghost-in-msheet.html
    assets/index.json
    assets/<rel/path/under/assets>/...

Working-tree side effects: `passages/StoryInit.tw` is rewritten so the build
points at `assets/` instead of `asset-placeholders/`, then restored from a
sibling `.bak` in a `finally` block (matches the existing Package Release
flow). No other files are touched. Assets are read, not modified or moved.

Run after `tools/check_release_assets.py` so the index is in sync before
filtering.
"""
from __future__ import annotations

import datetime as dt
import json
import re
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

from lib_repo import passages_dir, repo_root

REPO = repo_root()
ASSETS_DIR = REPO / "assets"
INDEX = ASSETS_DIR / "index.json"
HTML = REPO / "ghost-in-msheet.html"
STORY_INIT = passages_dir() / "StoryInit.tw"
STORY_INIT_BAK = STORY_INIT.with_name(STORY_INIT.name + ".bak")
STORY_CAPTION = passages_dir() / "StoryCaption.tw"

VERSION_RE = re.compile(r"Ghost in M'Sheet (\d[\d.]*[a-z]*)")
TAG_RE = re.compile(r"^v\d+\.\d+\.\d+$")


def read_version() -> str:
    text = STORY_CAPTION.read_text(encoding="utf-8")
    m = VERSION_RE.search(text)
    if not m:
        raise SystemExit("version not found in passages/StoryCaption.tw")
    return m.group(1).replace(".", "-")


def latest_tag() -> str:
    out = subprocess.check_output(
        ["git", "tag", "--list", "v*", "--sort=-v:refname"],
        cwd=REPO, text=True,
    )
    for raw in out.splitlines():
        line = raw.strip()
        if TAG_RE.match(line):
            return line
    raise SystemExit("no vX.Y.Z tag found in `git tag`")


def tag_date(tag: str) -> dt.date:
    """Commit date of `tag` as a YYYY-MM-DD date (committer-local)."""
    out = subprocess.check_output(
        ["git", "log", "-1", "--format=%cs", tag],
        cwd=REPO, text=True,
    ).strip()
    return dt.date.fromisoformat(out)


def build_with_real_assets() -> None:
    """Backup StoryInit, repoint ImagePath at assets/, build, restore."""
    shutil.copy2(STORY_INIT, STORY_INIT_BAK)
    try:
        text = STORY_INIT.read_text(encoding="utf-8")
        text = re.sub(
            r'setup\.ImagePath\s*=\s*"[^"]*"',
            'setup.ImagePath = "assets"',
            text,
        )
        STORY_INIT.write_text(text, encoding="utf-8")
        if sys.platform == "win32":
            cmd = [str(REPO / "scripts" / "build.bat")]
            shell = True
        else:
            cmd = [str(REPO / "scripts" / "build.sh")]
            shell = False
        subprocess.check_call(cmd, cwd=REPO, shell=shell)
    finally:
        if STORY_INIT_BAK.exists():
            shutil.move(str(STORY_INIT_BAK), str(STORY_INIT))


def select_assets(cutoff: dt.date) -> list[str]:
    if not INDEX.exists():
        raise SystemExit(
            f"{INDEX.relative_to(REPO)} missing — run tools/check_release_assets.py first"
        )
    entries = json.loads(INDEX.read_text(encoding="utf-8"))
    selected: list[str] = []
    for e in entries:
        try:
            changed = dt.date.fromisoformat(e["changed"])
        except (KeyError, ValueError, TypeError):
            continue
        if changed >= cutoff:
            selected.append(e["path"])
    selected.sort()
    return selected


def write_zip(zip_path: Path, asset_paths: list[str]) -> int:
    """Return total bytes of files added (uncompressed)."""
    total = 0
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        zf.write(HTML, HTML.name)
        total += HTML.stat().st_size
        zf.write(INDEX, f"assets/{INDEX.name}")
        total += INDEX.stat().st_size
        for rel in asset_paths:
            src = ASSETS_DIR / rel
            if not src.is_file():
                continue
            zf.write(src, f"assets/{rel}")
            total += src.stat().st_size
    return total


def main() -> int:
    version = read_version()
    tag = latest_tag()
    cutoff = tag_date(tag)
    print(
        f"package_incremental_release: most recent tag {tag} ({cutoff.isoformat()})",
        file=sys.stderr,
    )

    build_with_real_assets()
    if not HTML.is_file():
        raise SystemExit(f"build did not produce {HTML.name}")

    paths = select_assets(cutoff)
    print(
        f"package_incremental_release: bundling {len(paths)} asset(s) "
        f"changed on/after {cutoff.isoformat()}",
        file=sys.stderr,
    )

    out_zip = REPO / f"ghost-in-m-sheet-v{version}-incremental-release.zip"
    total = write_zip(out_zip, paths)
    size_mb = out_zip.stat().st_size / 1024 / 1024
    raw_mb = total / 1024 / 1024
    print(
        f"package_incremental_release: wrote {out_zip.name} "
        f"({size_mb:.1f} MiB compressed, {raw_mb:.1f} MiB raw)",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
