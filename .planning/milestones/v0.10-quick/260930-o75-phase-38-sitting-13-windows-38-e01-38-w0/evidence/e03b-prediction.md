# 38-E03 branch (b), Windows HiDPI at scale_factor 2.0: pre-registered criteria

Written 2026-09-30, sitting 13, BEFORE the run. The operator set Windows display scaling to 200%
on the single 3440×1440 display, so the logical size is 1720×720.

**Harness:** spike 027 as patched for 38-E04(b), with the slot sync ported to the app's throttle
and async wrappers for the two UI-facing create commands. The autorun still calls the unchanged
`_impl` bodies through `run_on_main_thread`, the same path 38-E01 was scored on.

**Run:** `SPIKE_AUTORUN=1 SPIKE_AUTORUN_EXIT=1`, with `hwnd_sampler.ps1` recording screenshots.

## PASS requires all of

- H1: `scaleFactor` in the API log reads 2.0, and the sampler's window DPI reads 192.
- H2: the OS container rect equals the requested logical rect ×2, within ±1 physical px, at 1a
  (290,96,760,560 → 580,192,1520,1120) and at 4b (10,400,400,300 → 20,800,800,600). The window is
  clamped to a 720-logical-px-tall screen, so parts of these rects may fall outside the client
  area. The CONTAINER rect is still what gets scored, and any clipping is recorded.
- H3: the renderer-driven slot sync lands the container on the slot, following the same pattern
  E01 saw at 1.25, with the container origin at the slot's logical origin ×2.
- H4: screenshots at 2.0 show embedded text rendered at device resolution. Glyph edges must be
  sharp at 1:1 when viewed, not the soft ×2 upscale that a DPI-virtualised child would produce,
  and there must be no offset between the dashed slot and the embed edge.

FAIL if H2 misses by more than 1 px, or if the content is visibly upscaled or offset. This scores
branch (b) only; 38-E03 stays OPEN for branch (a), other macOS displays, and branch (c), the
unbuilt Linux layout, and mixed-DPI multi-monitor setups are NOT covered, because this host has
one display.
