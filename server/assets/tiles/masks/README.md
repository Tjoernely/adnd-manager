# Alpha Edge Masks

This directory holds the 5 grayscale alpha masks used by the tile compositor
for soft terrain transitions. They are NOT yet wired into the render pipeline
(see TILE_COMPOSITOR_PLAN.md §3 — masks are step 6 of the MVP, after the base
compositor is confirmed working).

## Generation

From the repo root, with `OPENAI_API_KEY` set:

```
OPENAI_API_KEY=sk-... node scripts/generate_mask_assets.mjs
```

The script produces five 1024×1024 PNGs:

- `mask_edge_1024.png`      — one side different
- `mask_corner_1024.png`    — two adjacent sides different
- `mask_opposite_1024.png`  — two opposite sides different
- `mask_three_1024.png`     — three sides different
- `mask_isolated_1024.png`  — all sides different (floating)

## Post-processing (optional, when wiring into the pipeline)

Downscale and clean to a 256×256 grayscale alpha channel, e.g. with ImageMagick:

```
magick mask_edge_1024.png -resize 256x256 -colorspace Gray -normalize mask_edge.png
```

Rotated variants are computed at runtime via `EdgeMaskLibrary` — no extra
generation needed.
