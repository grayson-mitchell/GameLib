---
phase: quick-261011-to5
plan: 01
subsystem: planning/todos
tags: [winetricks, contrast, live-gate, measurement, midnightMirage]
requires: []
provides:
  - "The midnightMirage disabled Apply border live-vs-token todo closed on the gate's own frame: no gap, the 1.36:1 was a corner anti-alias pixel"
  - "45-UAT item 7 result corrected after its status word"
affects:
  - .planning/todos/completed/2026-10-11-winetricks-disabled-apply-border-reads-1-36-live-in-midnightmirage-but-6-07-by-token.md
  - .planning/phases/45-native-in-app-winetricks-ui-redesigned-from-scratch-one-self/45-UAT.md
key-files:
  modified:
    - .planning/phases/45-native-in-app-winetricks-ui-redesigned-from-scratch-one-self/45-UAT.md
  moved:
    - .planning/todos/completed/2026-10-11-winetricks-disabled-apply-border-reads-1-36-live-in-midnightmirage-but-6-07-by-token.md
decisions:
  - "Re-measure the surviving gate frame before building a post-fix rig; the frame alone settled the question, so no launch was made"
  - "The multi-DPI arm of the todo was not run: corner anti-aliasing is a border-radius property present at every backing scale, and the capture is an exact 2.0x with no blended straight-edge pixel"
  - "The post-fix border (A6EDFD) was not live-sampled: no packaged build contains e89c0237f; its value is the same frame's disabled-text pixels, 10.51:1"
  - "Planned and executed inline by the orchestrator (no subagents), the 261011-rj0 shape"
metrics:
  tasks: 1
  files: 2
status: complete
actuals:
  tasks: 1
  commits: 1
plan_head_before: b61803a7ba1e3b4a0c6046345115f88f45666c42
---

# Quick 261011-to5: midnightMirage disabled Apply border, 1.36:1 live versus 6.07:1 by token

**Closed with no code change.** The Phase 45 live gate's evidence dir
(`/tmp/gamelib-gate-45-20261010T194049Z`) still held `burst6-007.png`, the frame the 1.36:1 was
scored from. Read pixel by pixel it shows no gap at all.

## What was measured

- **All four edges of the disabled Apply border** in burst6-007.png are a 2-device-pixel run of
  `A8AEAF` on `272F31` (left x 1937-1938, right x 2044-2045, top y 1396-1397, bottom y
  1450-1451). That is 6.07:1 and exactly `--neutral-05`, the token the StickyBar stylesheet
  declared at gate build `44d9cc4c3`.
- **`3D4345` occurs only at the corners** -- (1939,1401), (2043,1401), (1939,1446) -- as the
  roughly 16 percent-coverage anti-aliased pixel of the 4px `border-radius` arc. The gate's
  `sample.swift` returns the most frequent colours in a rect; a rect on a corner with no straight
  run of edge hands back one of these blended pixels as the "second colour". Over the whole button
  bbox the same tool returns background 78.7 percent, border `A8AEAF` 9.5 percent, text `A6EDFD`
  3.5 percent, and `3D4345` is not in the top twelve.
- **nord-light control** (burst3-020.png) reads `A8AEAF` on `D8DEE9` on every straight-edge
  pixel, matching the gate's own 1.66:1; that rect happened to land on a straight edge.
- **Backing scale**: the capture is exactly 2.0x (2784x1824 including the shadow margin); no
  straight-edge row or column is partially covered, so the fractional-grid hypothesis the todo
  carried does not apply to this control.

## What was not done

- No post-fix live sample of the border: no packaged build contains 261011-kqx (`e89c0237f`), and
  the frame's own disabled-text pixels already show `--text-secondary` rendering as `A6EDFD`
  (10.51:1).
- No multi-DPI capture: the artifact is a `border-radius` property, present at every scale.

## Commits

- `996a13046` docs(todos): close the todo and correct 45-UAT item 7.
