---
created: 2026-11-24T00:00:00.000Z
title: 'macOS shortcut icon is cropped from the centre of the resized image, not from the top-left the code asked for'
area: shortcuts
severity: minor
platform: macos
ready: live-gate
found_by: 'Phase 94 plan 94-24, filing the quirks the Rust port copied for parity (D-20, D-25). Measured at planning time against the shipped sips chain.'
files:
  - src-tauri/crates/gamelib-shortcuts/src/icns.rs
  - src-tauri/crates/gamelib-shortcuts/tests/icns.rs
  - src-tauri/crates/gamelib-shortcuts/tests/fixtures/golden/icon_geometry
---

## Problem

The deleted TypeScript built the macOS `.icns` with `createFromBuffer(png).resize({ width: 512 }).crop({ x: 0, y: 0,
width: 512, height: 512 })`. Electron's `crop` takes a top-left origin, so the intent was to keep the top-left 512x512.
Under the sidecar's `sips` shim the offset is a no-op (`--cropOffset` was measured to change nothing), so `sips` crops
CENTRED. A tall icon (a 600x900 cover) therefore loses its top and bottom equally, and the shortcut shows the middle of
the art.

The Rust port keeps the shipped behaviour on purpose (D-25 superseded D-13's `0,0` origin): `icns.rs` resizes to width
512 keeping the aspect and crops from the centre (`top = (height - 512) / 2`). The `golden/icon_geometry` goldens pin
which colour band survives at fixed sample points, so changing the crop is a deliberate golden change, not a silent one.

## What fixing it would change

Crop from the top (or pick the crop that best frames the art) in `icns.rs`, re-record the four `icon_geometry` goldens,
and look at a real game's shortcut icon on a Mac. This is cosmetic: nothing fails today, the icon is just framed by the
middle. Do it only after the goldens exist (see 2026-11-24-record-macos-icon-geometry-goldens-on-a-mac), so the change
is measured against what shipped.
