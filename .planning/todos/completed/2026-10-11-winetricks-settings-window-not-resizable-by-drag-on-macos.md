---
created: 2026-10-11T09:21:26.000Z
title: Winetricks settings window not resizable by dragging on macOS, yet captures show three distinct widths
area: ui
severity: minor
platform: macos
ready: human
found_by: "Phase 45 live gate 45-12 operator remark, launch 4, 2026-10-10 (split from 2026-10-11-winetricks-tab-ux-observations-from-the-45-live-gate item 9 by quick 261011-txc)"
---

**Window not resizable by dragging** (operator, launch 4), yet captures show three distinct
window widths across launches 3-4. Unexplained; `tauri.conf.json` has `resizable: true`. Worth a
live check on its own.

- `src-tauri/tauri.conf.json` declares `"resizable": true` (line 20).
- The gate's captures show three distinct window widths across launches 3-4.
- It needs a live check on its own (no code hypothesis yet).

Evidence: `/tmp/gamelib-gate-45-20261010T194049Z/terminal.log`.

## Resolution (2026-10-12)

Premise refuted by debug session `winetricks-window-not-resizable`. The NSWindow is drag-resizable (launch-4 frames show 1280 -> 87 -> 1319 pt, an operator drag). What did not follow the edge was the in-page Settings dialog, whose paper had `min-width: fit-content`; fixed by 682a20ac7 (261011-hh5) and 70fde4672 (261011-jj1). "Three widths" are two real widths (1280, 1319 pt) plus window-shadow margin. Not re-verified with a live drag on a current build.
