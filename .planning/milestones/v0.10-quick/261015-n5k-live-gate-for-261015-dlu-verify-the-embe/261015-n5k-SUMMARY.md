---
phase: quick-261015-n5k
plan: 01
subsystem: webview/store-embed
tags: [store-embed, notice-row, css-grid, live-gate, macos, wkwebview, evidence, todos]

requires:
  - phase: quick-261015-dlu
    provides: "The minmax(0, 1fr) fix on .WebView__embedContainer and the static-harness prediction table this gate tests against"
  - phase: quick-261015-9qy
    provides: "The 900px minWidth floor (its clamp half was unverified until this gate)"
provides:
  - "Observed-on-hardware verdicts for the todo's three bullets: E3 passes at the 900 floor, the row degrades as predicted at 600, the 500 clip is real and unclaimed"
  - "A live pre-fix control arm reproducing the Item 16 clip on demand (column 419.65625px) and restoring on removal"
  - "A reusable console-side lever for raising StoreEmbedTimeoutBanner without sudo, hosts edits or a 45s wait (probe.js __gateArm)"
  - "A reusable sub-900 viewport technique: dock the Web Inspector right and drag the divider"
affects: [webview, store-embed-notice-row, ui-spec-e3]

actuals:
  tokens: ~95000
  tasks: 1
  commits: 1
plan_head_before: 6d7ad30db
plan_head_after: the single docs(quick-261015-n5k) commit that carries this file (no code commits)

tech-stack:
  added: []
  patterns:
    - "Raise renderer state through the hook's own poll (wrap window.api.<drain>) rather than through the backend condition it mirrors — the real component renders, and no privileged setup is needed"
    - "Dock the Web Inspector to the side to measure layout viewports narrower than the window's minWidth, in the real app, with no CSS override"

key-files:
  created:
    - .planning/quick/261015-n5k-live-gate-for-261015-dlu-verify-the-embe/evidence/README.md
    - .planning/quick/261015-n5k-live-gate-for-261015-dlu-verify-the-embe/evidence/probe.js
    - .planning/quick/261015-n5k-live-gate-for-261015-dlu-verify-the-embe/evidence/gate-measurements.jsonl
    - .planning/quick/261015-n5k-live-gate-for-261015-dlu-verify-the-embe/evidence/0{1..6}-*.png
    - .planning/quick/261015-n5k-live-gate-for-261015-dlu-verify-the-embe/evidence/{winlist,click,drag}.swift
    - .planning/quick/261015-n5k-live-gate-for-261015-dlu-verify-the-embe/evidence/type.sh
    - .planning/todos/completed/2026-10-15-embed-container-column-fix-unverified-on-hardware.md
  modified:
    - .planning/quick/261015-dlu-embed-container-grid-column-has-no-zero-/evidence/README.md
  deleted:
    - .planning/todos/pending/2026-10-15-embed-container-column-fix-unverified-on-hardware.md

key-decisions:
  - "Ran the rig inline from the orchestrating session (no planner/executor spawn): a live gate is driven by CGEvent/keystroke/screencapture from the session that owns the window; the plan was still written before the record was closed so the arms and bars precede the verdict."
  - "Raised the banner by wrapping window.api.storeEmbedTakeNavEvents from the console, not by a hosts blackhole (needs sudo, 45s per arm) and not by inserting banner markup (would bypass React)."
  - "Reached 600/500 viewports by docking the inspector right inside a 1280 window; the 900 minWidth clamp was left in force and measured rather than bypassed."
  - "Included pre-fix control arms at 600 and 500 so the live 'not clipped' is attributable to the fix."

requirements-completed: [TODO-n5k-1]

duration: ~25min wall clock (launch 16:41, teardown 16:52 local), plus the write-up
completed: 2026-10-15
status: complete
---

# Quick Task 261015-n5k: the embed container's zero-floor column, observed in the running app

**`261015-dlu`'s `grid-template-columns: minmax(0, 1fr)` was measured only in a static harness;
this gate rendered the real `StoreEmbedTimeoutBanner` in a `pnpm tauri:dev` build on this Mac and
observed E3 passing at the 900 px floor, the predicted degrade at 600 px (column 344 px, message
ellipsised, actions whole), the predicted residual clip at 500 px (3.92 px), and a live pre-fix
control reproducing the original Item 16 clip to the hundredth of a pixel. No code change.**

## Results (live WebKit, CSS px; full table and frames in `evidence/README.md`)

| arm | viewport | container column | msg width | ellipsised | actions right | clipped |
| --- | --- | --- | --- | --- | --- | --- |
| window 1280 | 1280 | 1024px | 760.08 | no | 1264 | no |
| window 900 (floor) | 900 | 644px | 380.08 | no | 884 | **no — E3 PASS** |
| viewport 600 | 600 | **344px** | 80.08 | **yes** | 584 | **no** |
| viewport 500 | 500 | 244px | 0 | yes | 503.92 | yes (3.92px) |
| CONTROL 600, pre-fix `auto` | 600 | **419.65625px** | 155.73 | no | 659.66 | yes |
| CONTROL 500, pre-fix `auto` | 500 | 419.65625px | 155.73 | no | 659.66 | yes |

Harness agreement: every live fixed-arm number is the harness's number plus the known 10 px
`.App` offset; the control arms equal the harness's `shipped` arm exactly. Clamp: a requested
800x800 left the window at 900x800.

## How the banner was raised (the reusable part)

`useStoreEmbedHost.ts` polls `window.api.storeEmbedTakeNavEvents()` every 250 ms and sets
`navState.loadTimedOut` from the batch. `evidence/probe.js`, imported from the Web Inspector
console via vite's `/@fs/` path, wraps that function so every batch carries `loadTimedOut: true`.
The real hook, the real component, the real i18n string. `__gateArm(false)` restores. The
measurement readback is `console.log` plus `window.api.logInfo` into `gamelib.log`;
`document.title` does not reach the native title under Tauri.

## Observations not acted on (evidence README section e)

1. Under the renderer-side injection a window resize can clear the banner — the slot's
   ResizeObserver set-bounds call returns Rust's own `load_timed_out:false` through
   `applyNavResult`. Artefact of the injection; a real timeout carries `true` on that path
   (Launch 5 saw persistence across a 200→1280 sweep).
2. With the pre-fix sizing, the native Epic subview followed the inflated slot rect ~75 px past
   the layout viewport and painted over the docked inspector — the old defect mis-sized the
   native view as well as the row. The fix confines it (frames 03/04).
3. The docked inspector pane has a ~500 px minimum, so a 900 px window only reaches a 400 px app
   viewport; the gate widened the window to 1280 to reach 600 and 500.

## Verification (run as written)

- `evidence/gate-measurements.jsonl`: 12 records; viewports 900 / 600 / 500 all
  `bannerPresent:true`; two `CONTROL` records at `419.65625px`.
- Frames 01–06 were read (not just captured) before the verdicts were written.
- Teardown: `pgrep -f 'target/debug/gamelib-shell'`, `pgrep -f 'bin/vite'`,
  `pgrep -f 'sidecar.js'`, `lsof -nP -iTCP:5173 | grep LISTEN` all empty.
- `npx prettier --file-info` reports `"ignored": true` for every written path (all under
  `.planning/`), so no `prettier --check` was run; stated rather than carried as a vacuous green.

## What this gate did NOT verify

- The longest-of-49-translations arm of 50-UAT Item 16 (needs a language switch) — still open there.
- `minHeight: 600` — only the width clamp was exercised.
- A genuine 45 s timeout path — the banner was raised renderer-side; the Rust timeout monitor
  and its reload recovery remain Item 16's own business (quick `261014-vot`'s re-run is still owed).
