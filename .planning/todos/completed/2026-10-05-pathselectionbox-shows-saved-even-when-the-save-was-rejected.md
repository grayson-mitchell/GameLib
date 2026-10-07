---
created: 2026-10-05T00:00:00.000Z
title: "PathSelectionBox shows \"Saved\" as soon as onPathChange is called, even when the consumer rejects the value"
area: ui
severity: medium
platform: any
ready: code
found_by: "Code-review sweep of phases that never had a review step (07, 23.1, 25, 27, 33, 34.8, 34.12, 34.16, 34.17, 34.18, 36, 44), 2026-10-04 — phase 34.17"
files:
  - src/frontend/components/UI/PathSelectionBox/index.tsx:105-115
  - src/frontend/screens/Settings/components/EgsSettings.tsx:31-39
---

## Problem

`setJustSaved(true)` runs as soon as `onPathChange` is invoked, regardless of outcome. EgsSettings
commits asynchronously and can reject the value (`egsSync` returns `'Error'`, then `setEgsPath('')`).
The CLAUDE.md vocabulary puts "a shipped claim that is false" at critical; it is filed medium on blast
radius — raise it if you read it the other way.

## Failure scenario

The user enters a bad prefix and presses Enter. The field says "Saved" for 2s while the sync-error
modal is open, then flips to "Not saved yet — press Enter".

## Suggested fix

Start the pulse only once the `path` prop equals the value just committed: record the pending value
in a ref and set `justSaved` in the `[path]` effect when they match.

## Provenance

Found by reading the code; no test was run (the review container had no `node_modules`). Not independently re-checked by the orchestrating session — confirm the mechanism before fixing. Line numbers are as of `5927806` on `main`.

## Resolution (2026-10-05)

Confirmed by reading: `commitPath` called `setJustSaved(true)` straight after `onPathChange`.

**Changed.** `src/frontend/components/UI/PathSelectionBox/index.tsx` — `commitPath` now records the
committed value in `pendingCommitRef` instead of starting the pulse. A `[path]` effect starts the
pulse only when the `path` prop arrives equal to that value, and disarms the ref on any path
change. Consequence, deliberate: between a commit and the consumer adopting it (e.g. while
`egsSync` is in flight) the hint reads "Not saved yet — press Enter", which is true at that moment;
the old comment claiming `justSaved` must mask that window was rewritten.

**RED.** New `PathSelectionBox commit hint` cases in `__tests__/index.test.tsx`: Enter `/bad`, then
re-render with `path` unchanged (`/old`) or reset to `''` (EgsSettings's error branch) — both
showed "Saved" on the unfixed component. A third case (path arrives as the committed value →
"Saved") is the control and passes before and after.

**GREEN.** PathSelectionBox suite 13/13; `pnpm codecheck` exit 0; eslint 0 errors (1 pre-existing
warning); prettier `--check` clean.

**Not verified.** No live app run of EgsSettings's reject path; no DOM renderer in this project, so
the effect ordering is exercised through the suite's eager-effect `react` mock, not real React.
