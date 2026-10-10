---
created: 2026-10-10T22:46:00.000Z
title: During a Winetricks run the first verb intermittently renders as Queued with Cancel remaining disabled until the verb boundary
area: winetricks
severity: major
platform: any
ready: code
found_by: "Phase 45 live gate 45-12 G3 (launch 2) and G1/G7 run frames (launches 1-2), 2026-10-10"
files:
  - src/backend/tools/winetricksQueue.ts
  - src/frontend/screens/Settings/sections/WinetricksSettings/index.tsx
  - src/frontend/screens/Settings/sections/WinetricksSettings/StickyBar/index.tsx
---

## Observation

G3 (launch 2, run `physx`/`d3dcompiler_47`/`d3dx11_43`): the operator reports Cancel remaining was
greyed out for the whole of the first verb (`physx`, 14 s per the backend log) and only became
enabled at the verb boundary, so the pre-registered "press Cancel while the first verb is
Installing" could not be done. Window captures confirm the same in two other runs: launch 1
`burst-light-26.png` (bar `Installing 1 of 3`, Cancel greyed) and launch 2 `burst2-light-071..073.png`
(single-verb run: the in-flight row shows the disabled Queued checkbox, no spinner, no phase word,
for all three frames across the ~7 s run). In launch 4 (`burst6-119.png`) the first verb rendered
correctly (spinner, `Wird installiert…`, Cancel enabled), so the defect is intermittent.

## Candidate mechanism (code read, not unit-proven)

`winetricksQueue.apply()` takes `const state = getState(...)` BEFORE `pushState(run)` and before
`void runLoop(run)` sets `run.currentVerb` and pushes again; it returns that snapshot in the IPC
reply. `applyVerbs()` in the tab does `setQueueState(result.value.state)` on the reply. When the
reply lands after the live pushes, the tab regresses to `currentVerb: ''` and every outcome
`pending`; `StickyBar` then computes `cancelDisabled = run.currentVerb === ''` and
`deriveRowState` returns `queued` for the in-flight verb until the next push at the verb end.
Either return the post-push state from `apply()`, or have the tab ignore a reply state whose
`runId` it already holds with a later `currentVerb`. A unit test can race the two messages.

Evidence: `/tmp/gamelib-gate-45-20261010T194049Z/terminal.log` ("G3 backend", "G7 light run-2
finding", "G3/G9 finding"), captures named above. Launch ordinals 1, 2 (reproduced), 4 (not).
