"""Shared filesystem helpers for tools/ scripts.

Centralises the repo-root and passages-dir lookups (every tools/ script
otherwise re-derives `Path(__file__).resolve().parent.parent`), and
provides a passages-grep helper used by several linters. Also exposes
the runtime ASSET_BASE (parsed from `setup.ImagePath` in StoryInit.tw)
so asset checkers don't each maintain their own copy of that regex.
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Iterable, Iterator

_TOOLS_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _TOOLS_DIR.parent
_PASSAGES_DIR = _REPO_ROOT / "passages"


def repo_root() -> Path:
    """Return the absolute path to the repository root."""
    return _REPO_ROOT


def passages_dir() -> Path:
    """Return the absolute path to the passages/ directory."""
    return _PASSAGES_DIR


def iter_passages() -> list[Path]:
    """Return every .tw passage file under passages/ in sorted order.

    Standalone `.js` script files are excluded so passage-syntax-aware
    tools (link checkers, macro linters, twee formatters) don't try to
    parse raw JavaScript as twee. Tools that need to scan script bodies
    should use iter_sources() instead.
    """
    return sorted(_PASSAGES_DIR.rglob("*.tw"))


def iter_sources() -> list[Path]:
    """Return every source file (.tw + .js) under passages/ in sorted order.

    Used by checkers whose patterns may appear in either twee passages
    or standalone `.js` controller files (e.g. ghost-data integrity,
    undefined-variable detection).
    """
    return sorted(
        list(_PASSAGES_DIR.rglob("*.tw")) + list(_PASSAGES_DIR.rglob("*.js"))
    )


def read_passage(path: Path) -> str:
    """Read a passage file with the same encoding/error policy used everywhere."""
    return path.read_text(encoding="utf-8", errors="replace")


def grep_passages(
    pattern: str | re.Pattern[str],
    *,
    files: Iterable[Path] | None = None,
) -> Iterator[tuple[Path, int, str, re.Match[str]]]:
    """Yield (path, lineno, line, match) for every regex match in the
    passages tree.

    `pattern` may be a string (compiled internally) or a pre-compiled
    regex. `files` overrides the default iter_passages() for callers
    that want to scope the scan.
    """
    regex = re.compile(pattern) if isinstance(pattern, str) else pattern
    for path in (files if files is not None else iter_passages()):
        for lineno, line in enumerate(read_passage(path).splitlines(), 1):
            for m in regex.finditer(line):
                yield path, lineno, line, m


_IMAGE_PATH_RE = re.compile(r'''setup\.ImagePath\s*=\s*["']([^"']+)["']''')


def image_path() -> str:
    """Return the value of `setup.ImagePath` in StoryInit.tw.

    Falls back to `"assets"` when the file is missing or the assignment
    can't be parsed (matches the historical default).
    """
    story_init = _PASSAGES_DIR / "StoryInit.tw"
    if story_init.is_file():
        m = _IMAGE_PATH_RE.search(story_init.read_text(encoding="utf-8", errors="replace"))
        if m:
            return m.group(1)
    return "assets"
