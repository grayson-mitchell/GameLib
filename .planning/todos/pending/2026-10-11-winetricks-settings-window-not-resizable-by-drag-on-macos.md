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
