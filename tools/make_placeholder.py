#!/usr/bin/env python3
"""
Dev helper: generate a placeholder image or video with a label drawn on it.

Usage:
    python3 make_placeholder.py TEXT PATH WIDTH HEIGHT
    python3 make_placeholder.py --rebuild-manifest
    python3 make_placeholder.py --match-borders

PATH is resolved relative to ./asset-placeholders (when not absolute) so the
defaults line up with how build.sh swaps in real assets. The file extension
decides the output format:
    .png / .jpg / .jpeg  -> still image (ffmpeg color source + drawtext)
    .mp4                 -> 3-second looping video (H.264 + AAC)
    .webm                -> 3-second looping video (VP8 + Opus, with audio track)

For PNG output, if a real asset exists at the matching path under ./assets,
its fully-transparent outer rows/columns are mirrored on the placeholder so
the visible content lines up with the eventual real asset.

Examples:
    python3 make_placeholder.py "Alice 1" characters/alice/1.png 640 360
    python3 make_placeholder.py "Trans Alex 3" characters/trans/alex/3.jpg 640 360
    python3 make_placeholder.py "Blake intro" characters/blake/home/1.mp4 640 360

Each successful generation also adds/updates an entry in
asset-placeholders/index.json. Run with --rebuild-manifest to regenerate the
manifest from scratch by scanning every placeholder under asset-placeholders/
(uses ffprobe for dimensions; labels stay empty unless you regenerate via the
normal mode). Run with --match-borders to crop+pad every existing PNG
placeholder so its transparent border matches the corresponding asset PNG.

Requires ffmpeg on PATH.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_BASE = REPO_ROOT / "asset-placeholders"
ASSETS_BASE = REPO_ROOT / "assets"
MANIFEST_PATH = DEFAULT_BASE / "index.json"
IMAGE_EXTS = {".png", ".jpg", ".jpeg"}
VIDEO_EXTS = {".mp4", ".webm"}
VIDEO_DURATION = "3"
BG_COLOR = "gray"
FG_COLOR = "white"
TRANSPARENT = "0x00000000"


def find_font() -> str:
    try:
        out = subprocess.check_output(
            ["fc-match", "sans", "--format=%{file}"], text=True
        ).strip()
        if out and Path(out).is_file():
            return out
    except (OSError, subprocess.CalledProcessError):
        pass
    for candidate in (
        "/usr/share/fonts/google-noto/NotoSans-Regular.ttf",
        "/usr/share/fonts/liberation-sans-fonts/LiberationSans-Regular.ttf",
        "/usr/share/fonts/dejavu/DejaVuSans.ttf",
    ):
        if Path(candidate).is_file():
            return candidate
    sys.exit("error: no sans font found; install a TTF or pass --font")


def build_drawtext_filter(textfile: Path, width: int, font: str) -> str:
    # Use drawtext's textfile= rather than text= to sidestep ffmpeg's filter
    # escaping rules (apostrophes are particularly nasty when this filter is
    # chained with another via comma). Only paths the caller controls are
    # passed in, so the simple single-quoted form is fine for both.
    font_size = max(16, width // 14)
    return (
        f"drawtext=fontfile='{font}'"
        f":textfile='{textfile}'"
        f":fontcolor={FG_COLOR}"
        f":fontsize={font_size}"
        f":x=(w-text_w)/2"
        f":y=(h-text_h)/2"
        f":box=1:boxcolor=black@0.5:boxborderw=10"
    )


def run_ffmpeg(cmd: list[str]) -> None:
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        sys.stderr.write(result.stderr)
        sys.exit(f"ffmpeg failed (exit {result.returncode})")


def matching_asset(out_path: Path) -> Path | None:
    """For a placeholder under ./asset-placeholders, return the corresponding
    file under ./assets (or None if it isn't there)."""
    try:
        rel = out_path.resolve().relative_to(DEFAULT_BASE)
    except ValueError:
        return None
    candidate = ASSETS_BASE / rel
    return candidate if candidate.is_file() else None


def detect_transparent_borders(png_path: Path) -> tuple[int, int, int, int]:
    """Return (left, top, right, bottom) — count of fully-transparent edge
    rows/columns. Returns (0,0,0,0) when the file has no usable alpha or is
    fully transparent (no inner content to preserve)."""
    dims = probe_dimensions(png_path)
    if not dims:
        return (0, 0, 0, 0)
    width, height = dims
    try:
        proc = subprocess.run(
            [
                "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
                "-i", str(png_path),
                "-vf", "format=rgba,alphaextract",
                "-f", "rawvideo", "-pix_fmt", "gray",
                "-",
            ],
            capture_output=True, check=True,
        )
    except (OSError, subprocess.CalledProcessError):
        return (0, 0, 0, 0)
    data = proc.stdout
    if len(data) != width * height:
        return (0, 0, 0, 0)
    zero_row = b"\x00" * width

    top = 0
    while top < height and data[top * width:(top + 1) * width] == zero_row:
        top += 1
    if top == height:  # fully transparent — leave the placeholder unchanged
        return (0, 0, 0, 0)
    bottom = 0
    while bottom < height - top and \
            data[(height - 1 - bottom) * width:(height - bottom) * width] == zero_row:
        bottom += 1
    left = 0
    while left < width and all(data[y * width + left] == 0 for y in range(height)):
        left += 1
    right = 0
    while right < width - left and \
            all(data[y * width + (width - 1 - right)] == 0 for y in range(height)):
        right += 1
    return (left, top, right, bottom)


def borders_for(out_path: Path, width: int, height: int) -> tuple[int, int, int, int]:
    """Borders to mirror onto a PNG placeholder of the requested size, derived
    from the matching real asset if one exists. (0,0,0,0) means no padding."""
    if out_path.suffix.lower() != ".png":
        return (0, 0, 0, 0)
    asset = matching_asset(out_path)
    if asset is None or asset.suffix.lower() != ".png":
        return (0, 0, 0, 0)
    asset_dims = probe_dimensions(asset)
    if asset_dims != (width, height):
        return (0, 0, 0, 0)
    return detect_transparent_borders(asset)


def generate(text: str, out_path: Path, width: int, height: int) -> None:
    ext = out_path.suffix.lower()
    if ext not in IMAGE_EXTS and ext not in VIDEO_EXTS:
        sys.exit(f"error: unsupported extension {ext!r} (use .png/.jpg/.mp4/.webm)")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    font = find_font()

    base = [
        "ffmpeg",
        "-y",
        "-hide_banner",
        "-loglevel", "error",
        "-f", "lavfi",
    ]
    fd, label_path = tempfile.mkstemp(prefix="placeholder-label-", suffix=".txt")
    os.close(fd)
    label_file = Path(label_path)
    label_file.write_text(text, encoding="utf-8")
    try:
        if ext == ".png":
            left, top, right, bottom = borders_for(out_path, width, height)
            inner_w = width - left - right
            inner_h = height - top - bottom
            if inner_w <= 0 or inner_h <= 0:
                cmd = base + [
                    "-i", f"color=c={TRANSPARENT}:s={width}x{height},format=rgba",
                    "-frames:v", "1",
                    str(out_path),
                ]
            else:
                vf = build_drawtext_filter(label_file, inner_w, font)
                if (left, top, right, bottom) == (0, 0, 0, 0):
                    filter_chain = vf
                else:
                    filter_chain = (
                        f"{vf},pad={width}:{height}:{left}:{top}:color={TRANSPARENT}"
                    )
                cmd = base + [
                    "-i", f"color=c={BG_COLOR}:s={inner_w}x{inner_h},format=rgba",
                    "-vf", filter_chain,
                    "-frames:v", "1",
                    str(out_path),
                ]
        elif ext in IMAGE_EXTS:  # .jpg / .jpeg — no alpha
            vf = build_drawtext_filter(label_file, width, font)
            cmd = base + [
                "-i", f"color=c={BG_COLOR}:s={width}x{height}:d=0.1",
                "-vf", vf,
                "-frames:v", "1",
                str(out_path),
            ]
        elif ext == ".webm":
            vf = build_drawtext_filter(label_file, width, font)
            cmd = base + [
                "-i", f"color=c={BG_COLOR}:s={width}x{height}:r=24:d={VIDEO_DURATION}",
                "-f", "lavfi", "-i", f"anullsrc=r=48000:cl=stereo",
                "-vf", vf,
                "-c:v", "libvpx",
                "-b:v", "200k",
                "-pix_fmt", "yuv420p",
                "-c:a", "libopus",
                "-t", VIDEO_DURATION,
                "-shortest",
                str(out_path),
            ]
        else:
            vf = build_drawtext_filter(label_file, width, font)
            cmd = base + [
                "-i", f"color=c={BG_COLOR}:s={width}x{height}:r=24:d={VIDEO_DURATION}",
                "-vf", vf,
                "-c:v", "libx264",
                "-pix_fmt", "yuv420p",
                "-t", VIDEO_DURATION,
                str(out_path),
            ]
        run_ffmpeg(cmd)
    finally:
        label_file.unlink(missing_ok=True)
    print(f"wrote {out_path}")


def resolve_out(name: str) -> Path:
    p = Path(name)
    if p.is_absolute():
        return p
    return DEFAULT_BASE / p


def kind_for(ext: str) -> str:
    return "image" if ext in IMAGE_EXTS else "video"


def load_manifest() -> dict:
    if not MANIFEST_PATH.is_file():
        return {"entries": {}}
    try:
        data = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"entries": {}}
    if "entries" not in data or not isinstance(data["entries"], dict):
        data["entries"] = {}
    return data


def save_manifest(data: dict) -> None:
    data["entries"] = dict(sorted(data["entries"].items()))
    MANIFEST_PATH.write_text(
        json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )


def update_manifest_entry(out_path: Path, label: str, width: int, height: int) -> None:
    """Record this placeholder in asset-placeholders/index.json.
    Skips silently if `out_path` lives outside DEFAULT_BASE."""
    try:
        rel = out_path.resolve().relative_to(DEFAULT_BASE)
    except ValueError:
        return
    data = load_manifest()
    data["entries"][str(rel)] = {
        "label": label,
        "width": width,
        "height": height,
        "kind": kind_for(out_path.suffix.lower()),
    }
    save_manifest(data)


def probe_dimensions(path: Path) -> tuple[int, int] | None:
    """Read width/height of an image or video using ffprobe."""
    if not shutil.which("ffprobe"):
        return None
    try:
        out = subprocess.check_output(
            [
                "ffprobe", "-v", "error",
                "-select_streams", "v:0",
                "-show_entries", "stream=width,height",
                "-of", "csv=p=0:s=x",
                str(path),
            ],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except (OSError, subprocess.CalledProcessError):
        return None
    parts = out.split("x")
    if len(parts) != 2:
        return None
    try:
        return int(parts[0]), int(parts[1])
    except ValueError:
        return None


def rebuild_manifest() -> None:
    """Scan asset-placeholders/ from scratch. Dimensions come from ffprobe;
    label is left empty for files we didn't generate this run."""
    print(f"scanning {DEFAULT_BASE}/ ...")
    entries: dict[str, dict] = {}
    valid_exts = IMAGE_EXTS | VIDEO_EXTS
    for path in sorted(DEFAULT_BASE.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in valid_exts:
            continue
        rel = str(path.relative_to(DEFAULT_BASE))
        dims = probe_dimensions(path)
        entries[rel] = {
            "label": "",
            "width": dims[0] if dims else None,
            "height": dims[1] if dims else None,
            "kind": kind_for(path.suffix.lower()),
        }
    save_manifest({"entries": entries})
    print(f"wrote {MANIFEST_PATH} ({len(entries)} entries)")


def match_borders_all() -> None:
    """For each PNG placeholder whose matching asset has a transparent border,
    crop+pad the placeholder so its outer transparent rows/columns match the
    asset. Existing inner pixels are preserved (the outermost N rows/cols are
    simply replaced with transparency)."""
    if not shutil.which("ffmpeg"):
        sys.exit("error: ffmpeg not found on PATH")
    print(f"scanning {DEFAULT_BASE}/ ...")
    updated = skipped = 0
    for path in sorted(DEFAULT_BASE.rglob("*.png")):
        asset = matching_asset(path)
        if asset is None or asset.suffix.lower() != ".png":
            skipped += 1
            continue
        ph_dims = probe_dimensions(path)
        asset_dims = probe_dimensions(asset)
        if not ph_dims or ph_dims != asset_dims:
            skipped += 1
            continue
        left, top, right, bottom = detect_transparent_borders(asset)
        if (left, top, right, bottom) == (0, 0, 0, 0):
            skipped += 1
            continue
        width, height = ph_dims
        inner_w = width - left - right
        inner_h = height - top - bottom
        if inner_w <= 0 or inner_h <= 0:
            skipped += 1
            continue
        tmp = path.with_name(path.stem + ".tmp" + path.suffix)
        cmd = [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-i", str(path),
            "-vf", (
                f"format=rgba,"
                f"crop={inner_w}:{inner_h}:{left}:{top},"
                f"pad={width}:{height}:{left}:{top}:color={TRANSPARENT}"
            ),
            "-frames:v", "1",
            str(tmp),
        ]
        run_ffmpeg(cmd)
        tmp.replace(path)
        updated += 1
        rel = path.relative_to(DEFAULT_BASE)
        print(f"updated {rel} (l={left} t={top} r={right} b={bottom})")
    print(f"done — updated {updated}, skipped {skipped}")


def main(argv: list[str]) -> None:
    if len(argv) == 2 and argv[1] == "--rebuild-manifest":
        rebuild_manifest()
        return
    if len(argv) == 2 and argv[1] == "--match-borders":
        match_borders_all()
        return
    if len(argv) != 5:
        sys.exit(
            "usage: make_placeholder.py TEXT PATH WIDTH HEIGHT\n"
            "       make_placeholder.py --rebuild-manifest\n"
            "       make_placeholder.py --match-borders\n"
            "       (PATH is relative to ./asset-placeholders unless absolute)"
        )
    text, name, width_s, height_s = argv[1:]
    try:
        width = int(width_s)
        height = int(height_s)
    except ValueError:
        sys.exit("error: WIDTH and HEIGHT must be integers")
    if width <= 0 or height <= 0:
        sys.exit("error: WIDTH and HEIGHT must be positive")
    if not shutil.which("ffmpeg"):
        sys.exit("error: ffmpeg not found on PATH")
    out_path = resolve_out(name)
    generate(text, out_path, width, height)
    update_manifest_entry(out_path, text, width, height)


if __name__ == "__main__":
    main(sys.argv)
