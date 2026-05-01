# asset-placeholders/

Dev stubs for every image and video the game references. Layout mirrors
`assets/` (the production tree) one-for-one; the build path is selected by
`setup.ImagePath` in [passages/StoryInit.tw](../passages/StoryInit.tw).

## Layout

| Bucket           | Contents                                                                                |
| ---------------- | --------------------------------------------------------------------------------------- |
| `characters/`    | Per-character art (alice, blake, brook, mc, witch, succubus, trans, rescue) + `ghosts/` |
| `scenes/`        | Locations (bath, shower, room, gym, prison, library, church, deliveryhub, cursed-home, cursed-gym, webcam, animated) and `furniture/` |
| `outfits/`       | Wardrobe art split by piece — see "Outfits" below                                       |
| `mechanics/`     | Game-system art (hunting, possessed, exorcism, plasm, gwb, uvl, mind, minigame, sanityover, curseditems, cursedpossessions, tentacles, bj, porn, steal-clothes) |
| `ui/`            | UI chrome — `icons/`, `art/` (illustration art), `img/` (loose icons + tags)            |

## Outfits

Outfit art is grouped by piece, with sanity-stage variants under `s1/s2/s3/`:

```
outfits/bottoms/jeans/{s1,s2,s3}/
outfits/bottoms/shorts/{s1,s2,s3}/
outfits/bottoms/skirt/{s1,s2,s3}/
outfits/bottoms/panties/{s1,s2,s3}/
outfits/bottoms/no-panties/{s1,s2,s3}/
outfits/bottoms/naked/
outfits/tops/{bra,no-bra,tshirt}/
outfits/combos/skirt-no-panties/{s1,s2,s3}/
outfits/combos/tshirt-no-bra/
outfits/wardrobe/                  # wardrobe-UI thumbnails
```

The numeric stage suffix on legacy `jeans1/jeans2/jeans3` was renamed to
`s1/s2/s3` so a path is self-documenting at a glance.

## Adding a placeholder

```bash
python3 tools/make_placeholder.py "LABEL" PATH WIDTH HEIGHT
```

`PATH` is relative to this directory. Supported extensions: `.png`, `.jpg`,
`.jpeg` (still image) and `.mp4`, `.webm` (3-second looping video). Each call
also updates `index.json` with the file's label, dimensions, and kind.

For `.png` output, if a real asset already lives at the matching path under
`assets/` and shares the requested dimensions, the placeholder mirrors the
asset's outer transparent rows/columns so the visible content lines up with
the eventual real art.

## Matching transparent borders on existing placeholders

```bash
python3 tools/make_placeholder.py --match-borders
```

Walks every `.png` under `asset-placeholders/`, compares it to the matching
file under `assets/`, and crops + transparently pads the placeholder so its
fully-transparent outer rows/columns mirror the asset's. Idempotent.

## Adding the real asset

Drop the production file at the same relative path under `assets/`. The
build (and lints `tools/check_assets.py` + `tests/asset-references.spec.js`)
verifies that every passage reference resolves to a file under both trees.

## Manifest

`index.json` is a flat `{ entries: { "<rel-path>": { label, width, height, kind } } }`
catalogue of every placeholder. Rebuild it after bulk file changes with:

```bash
python3 tools/make_placeholder.py --rebuild-manifest
```

(Uses `ffprobe` for dimensions; the label stays empty for files that
weren't generated through the normal `make_placeholder.py` flow.)
