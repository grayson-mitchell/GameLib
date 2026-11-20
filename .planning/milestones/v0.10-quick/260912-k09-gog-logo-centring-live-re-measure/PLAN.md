---
quick_task: 260912-k09
title: "Run the owed live re-measure for the gog-logo.svg centring fix"
status: EXECUTED
requirements: []
branch: fix/steam-native-install-stability
baseline: 2b3d3d05f
---

# 260912-k09: gog-logo centring — owed live re-measure

## Why

Quick task 260912-873 flattened `gog-logo.svg` to `viewBox="0 0 34 31"` with default
`preserveAspectRatio` and deleted two compensating per-consumer overrides, but verified all of it by
**desk measurement only**. The follow-up todo
`.planning/todos/pending/2026-09-12-gog-logo-live-remeasure-humble-keys-and-gamepage-owed.md`
(`ready: live-gate`) tracks the three surfaces that still owe a live render.

## Approach

1. **Establish build validity before measuring.** A packaged release build from this morning is
   still running. Confirm by hash that the binary is its build record, confirm the three fix commits
   are ancestors of its source sha, and diff every post-build commit against the measured files and
   the tokens they use. Rebuild only if that diff is non-empty.
2. **Predict before measuring.** Render the OLD and NEW assets into identical square viewports and
   record the expected gaps/centroid offsets, so the live numbers are checkable rather than hopeful.
3. **Surface 1 (Humble Keys).** The 19.2px box is not painted, so measure the GOG mark's
   intensity-weighted centroid against the mean of the Steam rows (Steam's near-square viewBox fills
   the box vertically, making its ink edges a box proxy). Both themes.
4. **Surface 2 (GamePage).** The svg carries a background colour and border-radius, so measure the
   painted box directly and the glyph's inset within it. GOG page vs a Steam page. Both themes.
5. **Surface 3 (Login runner tile).** Resolve from source: if every tile renders an inlined
   `?react` SVG, the deleted `.runnerIcon.gog img` rule matched nothing and the live capture cannot
   prove the counterfactual anyway.
6. Restore the operator's theme; record everything, including estimator failures.

## Constraints discovered

- Devtools is unreachable in a release build; AX is blind to this app; no pyobjc on this machine.
  Window geometry therefore needs a compiled Swift helper, and all measurement is screenshot-based.
- `screencapture -l` must be given `-o`, or the window shadow inflates the capture to 2696×1736 and
  the exact 2.0 scale is lost.

## Tasks

- [x] T1 — verify build identity and post-build diff; decide rebuild/no-rebuild
- [x] T2 — kill the orphaned dev sidecar contaminating `gamelib.log`; relaunch cleanly
- [x] T3 — render OLD vs NEW predictions
- [x] T4 — measure Surface 1 in nord-light and nord-dark
- [x] T5 — measure Surface 2 in nord-light and nord-dark
- [x] T6 — resolve Surface 3 from source
- [x] T7 — restore theme; write evidence + close the todo
