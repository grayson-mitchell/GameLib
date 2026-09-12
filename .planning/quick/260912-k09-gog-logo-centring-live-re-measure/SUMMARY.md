---
phase: quick-260912-k09
plan: 01
subsystem: ui
tags: [live-gate, humble-keys, gamepage, svg, measurement, themes]

requires: []
provides:
  - "Live re-measure of the gog-logo.svg centring fix on Humble Keys and GamePage, in nord-light and nord-dark"
  - "Evidence set (6 captures + 2 prediction renders + measurements.md) under .planning/quick/260912-k09-*/evidence/"
  - "Closed todo: the owed live gate for quick task 260912-873"
affects: [humble-keys-ui, gamepage-ui]

tech-stack:
  added: []
  patterns:
    - "Swift CGWindowListCopyWindowInfo helper for window geometry (JXA fails silently, AX is blind, no pyobjc)"
    - "screencapture -o -l <windowid> for shadow-free window capture at exact 2.0 scale"
    - "Predict-then-measure: OLD vs NEW asset rendered into identical viewports before touching the app"

key-files:
  created:
    - .planning/quick/260912-k09-gog-logo-centring-live-re-measure/PLAN.md
    - .planning/quick/260912-k09-gog-logo-centring-live-re-measure/SUMMARY.md
    - .planning/quick/260912-k09-gog-logo-centring-live-re-measure/evidence/measurements.md
    - .planning/quick/260912-k09-gog-logo-centring-live-re-measure/evidence/ (6 captures, 2 prediction renders)
  modified:
    - .planning/todos/pending/2026-09-12-gog-logo-live-remeasure-humble-keys-and-gamepage-owed.md (removed, moved to completed/)

key-decisions:
  - "Did NOT rebuild. The running release build carries all three fix commits, and no post-build commit touches the measured files or redefines the tokens they use — so a rebuild would have measured the same pixels at the cost of a full release build + DMG."
  - "Surface 3 closed by code-read, not by a live capture: 'pixel-identical before and after' is a counterfactual that would need a second release build of 39e1e62bb^, and every runner tile provably renders an inlined ?react SVG so the deleted `img` rule matched nothing."
  - "Used an intensity-weighted centroid, not a threshold bbox, as the centring discriminator on Humble Keys — the bbox is threshold-sensitive at a 38.4px box while the centroid moves 0.002 device px across thresholds 16-40."

requirements-completed: []

duration: 2h
completed: 2026-09-12
---

# Quick Task 260912-k09: gog-logo centring live re-measure — Summary

**The shipped centring fix is confirmed live on both measurable surfaces, in both a light and a dark
theme. Surface 3 was resolved from source rather than papered over with a screenshot.**

## Results

| surface | theme | measured | predicted (centred / old) | verdict |
|---|---|---|---|---|
| Humble Keys "Racine" row | nord-light | GOG − Steam centroid **−0.088 device** | +0.032 / +1.726 | PASS |
| Humble Keys "Racine" row | nord-dark | GOG − Steam centroid **+0.415 device** | +0.032 / +1.726 | PASS |
| GamePage store icon | nord-light | box **46.0 CSS**, gaps 15/15, asym **0** | 0 / +6 device | PASS |
| GamePage store icon | nord-dark | box **46.0 CSS**, gaps 15/15, asym **0** | 0 / +6 device | PASS |
| Login runner tile | — | no `<img>` exists under `.runnerIcon.gog` | rule was dead | resolved by code-read |

On GamePage, GOG's box is identical to Steam's to the device pixel in both themes — the concern that
deleting the `&.gogIcon` override would leave GOG sized differently from its neighbours does not
materialise.

## Corrections to the todo's own expectations

- The todo predicted Humble ink of "19.2 × 17.5 CSS". Measured is **19.0 × 18.0** at thresholds
  16–40; 17.5 appears only at threshold ≥60. Extent is threshold-dependent and is not the
  discriminator — the centroid is, and it is threshold-stable.
- Surface 3's expectation ("pixel-identical") is not livable-measurable at all; recorded as such.

## Seven estimator/method traps, all self-caught

Each produced a plausible wrong answer before being caught: a bundle grep that finds nothing
*including its positive control* (assets are compressed into the Tauri binary); counting Humble rows
by a field name that does not exist in the schema (`store` vs `platform`); a config census that
missed `store/config.json` entirely (the operator supplied the correct theme); a half-max edge
estimator that under-measured Steam by 1.7 CSS px; colour-similarity box detection that returned a
64.0 CSS box in dark theme because the game art is within tolerance of `--body-background`; a
single-seed step walk that stopped at the glyph edge instead of the box edge; and JXA's
`CGWindowListCopyWindowInfo`, which fails silently and negatively here (a compiled Swift helper was
required). Full detail in `evidence/measurements.md`.

## Session hygiene

An orphaned dev sidecar alive since 2026-09-11 was writing into the same `gamelib.log` as the gate
app and was killed before measuring; quitting the packaged app re-orphans its own sidecar, which was
killed too. A `login` keychain prompt raised at relaunch was left unanswered and timed out after
45 s — harmless here, because `humble.isLoggedIn` reads a persisted config flag rather than the
keyring. The operator's theme was switched to nord-dark for the second half and **restored to
nord-light**, verified in `store/config.json` and on screen.

## Not done

No rebuild at HEAD. The measurement is against build `16ec08de3` (10 commits behind
`2b3d3d05f`), justified by a file- and token-level diff recorded in `evidence/measurements.md`.
