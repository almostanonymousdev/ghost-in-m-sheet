#!/usr/bin/env python3
"""Build assets/index.json: one entry per media file under assets/.

Each entry has:
    path     — path relative to assets/
    kind     — "video" or "image"
    width    — pixel width
    height   — pixel height
    changed  — most recent of file creation/modification time as YYYY-MM-DD
    source   — {file, start, end} for a single segment, or a list of such
               objects when the output is spliced from multiple segments.
               Omitted when no source info is known.

`assets/index.json` is the authoritative store of source info. On rebuild,
existing source values are loaded from the current index and re-emitted
verbatim. `assets/timestamps.txt`, if present, is used only as a fallback
to seed source info for paths that aren't in the existing index — once the
file is removed the rebuild keeps working off whatever the index already
records.
"""
from __future__ import annotations

import datetime as dt
import json
import os
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
TIMESTAMPS = ASSETS / "timestamps.txt"
OUT = ASSETS / "index.json"

VIDEO_EXTS = {".mp4", ".webm", ".mov", ".m4v", ".mkv"}
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".svg"}

SPLICE_RE = re.compile(r"^(.+\d)([a-z])$")


def merged_path(rel: str) -> str:
    """Strip a trailing splice letter from the basename if present.

    `scenes/.../bath2a.webm` → `scenes/.../bath2.webm`.
    Paths without the splice suffix are returned unchanged.
    """
    p = Path(rel)
    m = SPLICE_RE.match(p.stem)
    if not m:
        return rel
    return (p.parent / (m.group(1) + p.suffix)).as_posix()


def _finalize_segments(segs: list[dict[str, str]]) -> dict[str, str] | list[dict[str, str]]:
    """A single segment is emitted as an object; multiple as a list."""
    return segs[0] if len(segs) == 1 else segs


def parse_timestamps(path: Path) -> dict[str, dict | list]:
    """Return output-path → final-shape source value (object or list).

    Splice rows (e.g. `bath2a.webm`, `bath2b.webm`) are collapsed under
    their merged path (`bath2.webm`) preserving file order.
    """
    grouped: dict[str, list[dict[str, str]]] = {}
    if not path.exists():
        return {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.rstrip("\n")
        if not line.strip():
            continue
        parts = line.split("\t")
        if len(parts) < 4:
            continue
        out_path, start, end, src = parts[0].strip(), parts[1].strip(), parts[2].strip(), parts[3].strip()
        key = merged_path(out_path)
        grouped.setdefault(key, []).append({"file": src, "start": start, "end": end})
    return {k: _finalize_segments(v) for k, v in grouped.items()}


def read_existing_sources(index_path: Path) -> dict[str, dict | list]:
    """Load `source` values from an existing index, keyed by path.

    Once `timestamps.txt` is removed, this is the only source of truth for
    splice/source metadata, so we always consult the prior index first.
    """
    if not index_path.exists():
        return {}
    try:
        data = json.loads(index_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    out: dict[str, dict | list] = {}
    for e in data:
        if isinstance(e, dict) and "path" in e and "source" in e:
            out[e["path"]] = e["source"]
    return out


def load_sources(index_path: Path = OUT, timestamps_path: Path = TIMESTAMPS) -> dict[str, dict | list]:
    """Merge source info from existing index (authoritative) and timestamps.txt (fallback)."""
    merged = parse_timestamps(timestamps_path)
    merged.update(read_existing_sources(index_path))
    return merged


def probe_video(path: Path) -> tuple[int | None, int | None]:
    try:
        r = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-select_streams", "v:0",
                "-show_entries", "stream=width,height",
                "-of", "csv=p=0:s=x",
                str(path),
            ],
            capture_output=True, text=True, timeout=30,
        )
        out = r.stdout.strip().splitlines()
        if not out:
            return None, None
        w, h = out[0].split("x")
        return int(w), int(h)
    except (subprocess.SubprocessError, ValueError, OSError):
        return None, None


def probe_image(path: Path) -> tuple[int | None, int | None]:
    try:
        r = subprocess.run(
            ["identify", "-format", "%w %h", f"{path}[0]"],
            capture_output=True, text=True, timeout=30,
        )
        out = r.stdout.strip()
        if not out:
            return None, None
        w, h = out.split()
        return int(w), int(h)
    except (subprocess.SubprocessError, ValueError, OSError):
        return None, None


def birth_time(path: Path) -> float | None:
    """Return file creation time as Unix seconds, or None if unavailable.

    Python's stdlib `os.stat()` exposes `st_birthtime` only on BSD/macOS/Windows;
    on Linux it's absent even when the kernel/filesystem store it (e.g. btrfs,
    ext4). Shell out to `stat -c %W` to read it via the statx() syscall.
    `%W` returns 0 (or '-') when the filesystem doesn't store a birth time.
    """
    try:
        r = subprocess.run(
            ["stat", "-c", "%W", str(path)],
            capture_output=True, text=True, timeout=10,
        )
        ts = int(r.stdout.strip())
        return float(ts) if ts > 0 else None
    except (subprocess.SubprocessError, ValueError, OSError):
        return None


def classify(path: Path) -> str | None:
    ext = path.suffix.lower()
    if ext in VIDEO_EXTS:
        return "video"
    if ext in IMAGE_EXTS:
        return "image"
    return None


def collect_files() -> list[Path]:
    files: list[Path] = []
    for d, _, fs in os.walk(ASSETS):
        for f in fs:
            p = Path(d) / f
            if classify(p) is not None:
                files.append(p)
    files.sort()
    return files


def build_entry(path: Path, sources: dict[str, dict | list]) -> dict:
    rel = path.relative_to(ASSETS).as_posix()
    kind = classify(path)
    if kind == "video":
        w, h = probe_video(path)
    else:
        w, h = probe_image(path)
    mtime = path.stat().st_mtime
    btime = birth_time(path)
    ts = max(mtime, btime) if btime is not None else mtime
    changed = dt.date.fromtimestamp(ts).isoformat()
    entry: dict = {"path": rel, "kind": kind, "width": w, "height": h, "changed": changed}
    src = sources.get(rel)
    if src:
        entry["source"] = src
    return entry


def main() -> int:
    sources = load_sources()
    files = collect_files()
    print(f"Probing {len(files)} files...", file=sys.stderr)

    entries: list[dict] = [None] * len(files)  # type: ignore[list-item]
    with ThreadPoolExecutor(max_workers=min(16, (os.cpu_count() or 4) * 2)) as ex:
        fut_to_idx = {ex.submit(build_entry, p, sources): i for i, p in enumerate(files)}
        done = 0
        for fut in as_completed(fut_to_idx):
            entries[fut_to_idx[fut]] = fut.result()
            done += 1
            if done % 200 == 0:
                print(f"  {done}/{len(files)}", file=sys.stderr)

    OUT.write_text(json.dumps(entries, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUT} ({len(entries)} entries)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
