---
phase: 36-login-to-steam-crossfade-and-explicit-login-in-flight-mitiga
plan: 03
subsystem: docs/human-gate
tags: [human-verify, blocking-gate, login, steam, crossfade, loginInFlight]

dependency-graph:
  requires:
    - phase: 36-01
      provides: "the shipped loginInFlight guard, co-mounted Steam overlay, and CSS crossfade this gate scores live"
    - phase: 36-02
      provides: "the threat-register basis change and REQ-36-01..05 this gate discharges REQ-36-02/REQ-36-03 against"
  provides:
    - "Operator's verbatim live-gate verdict for phase 36: PRECONDITION PASS, 10/10 items PASS"
    - "Two new cosmetic gaps found outside the declared 10 items, routed to a separate quick task, not fixed here"
  affects:
    - ".planning/phases/34.4.2-macos-login-window-ux-modal-child-window-attachment-in-field/34.4.2-PLATFORM-SCOPE.md"

tech-stack:
  added: []
  patterns: []

key-files:
  created:
    - .planning/phases/36-login-to-steam-crossfade-and-explicit-login-in-flight-mitiga/36-03-SUMMARY.md
  modified: []

key-decisions:
  - "A stale pre-existing tauri:dev instance (PID 16197) was found first and the run was aborted and relaunched against a fresh build (PID 23762) rather than scored against the stale process — this repo has a ledgered lesson that a fresh build is required to observe post-change UI"
  - "Item 9's post-success divergence from item 6 (confirmation UI holds while the panel slides back, no Dialog exit Slide) was put to the operator as an explicit PASS-acceptable vs FAIL-visually-wrong choice, per the plan's own expected-behaviour note, and the operator chose PASS — acceptable"
  - "The two new cosmetic defects the operator found (QR-code resize, tab-label clipping) are NOT scored against any of the 10 declared items and do NOT reduce any item's verdict — they are out-of-scope discoveries routed to a separate quick task"

requirements-completed: [REQ-36-02, REQ-36-03]

metrics:
  duration: ~10min
  completed: 2026-08-20
---

# Phase 36 Plan 03: Blocking human visual and reachability gate Summary

Operator ran the live gate against a freshly-built `pnpm tauri:dev` (PID 23762) and scored PRECONDITION PASS plus all 10 items PASS — including item 9's designed post-success divergence, which the operator was shown as expected and explicitly accepted — closing the phase's mandatory live-gate requirement.

## Performance

- **Duration:** ~10min (transcription only; the gate itself was run and scored by the operator, not this agent)
- **Tasks:** 1 completed (checkpoint transcription)
- **Files modified:** 0 (this plan's `files_modified` is `[]` by design — SUMMARY-only)

## Harness

- Command: `pnpm tauri:dev`
- PID: 23762
- Started: 21:14:16
- Build state: freshly built from the current tree, AFTER all of wave 1's source commits
- A stale pre-existing instance (PID 16197) was found first; the run was **aborted and relaunched** rather than scored against it, so the verdict below reflects the current tree, not a stale bundle.

## Operator Verdict (verbatim)

**PRECONDITION: PASS.**

**Items 1–8: PASS.** Operator's words: *"it worked beutifully. 1-8 pass cheking other 2 now."*

**Item 9: PASS.** Operator's words: *"9, 1/2 works. the login selection panel slided back into place while the confirmation window stays centered and then disappears and the login selection panel in in place."*

The operator was then shown that this is precisely the plan's documented expected behaviour for the post-success paths (they bypass `Dialog`'s internal `close()`, so its exit Slide never plays), was offered PASS-acceptable vs FAIL-visually-wrong as an explicit choice, and **chose PASS — acceptable**. Both the observation and the fact that the acceptability judgement was put to the operator explicitly and answered are recorded here as instructed.

**Item 10: PASS.** Operator's words: *"10 passes"*.

## Tally

| Verdict | Count |
|---|---|
| PASS | 10 |
| FAIL | 0 |
| BLOCKED | 0 |
| NOT ATTEMPTED | 0 |
| PRECONDITION | PASS (scored separately) |

**Arithmetic check:** 10 (PASS) + 0 (FAIL) + 0 (BLOCKED) + 0 (NOT ATTEMPTED) = **10**, plus the precondition scored separately as PASS. Reconciles against the plan's required total of 10 items plus precondition.

**Mandatory items (1, 2, 3, 5, 6, 7):** all PASS. Phase 36 live-gate requirement is satisfied.

## New Gaps Found Outside the Declared 10 Items

These are **not** item failures and do **not** reduce any item's verdict above. They were found by the operator during the live session but are outside the scope of what any of the 10 items was written to catch. Not fixed here — routed to a separate quick task.

**1. QR-code render resizes the dialog.** Operator's words, verbatim: *"Form resizes when qr code renders. should create initial window with qr code size in mind so resize not required."*

Orchestrator analysis (not operator observation, recorded so the follow-up does not re-derive it): the `qr-active` body is gated on `challengeUrl` (`SteamLogin/index.tsx:306`). Before it arrives, a smaller body renders; when it lands, a 200px `<QRCode>` (`:321`) plus 8px padding appears and the dialog grows. Fix is to reserve the space up front — a `min-height` on `.steamQrContainer` sized to the final QR height. Pre-existing in the Steam form, not caused by phase 36 — it became visible because the dialog now presents as a window.

**2. Alternative login tab label clips.** Operator's words, verbatim: *"the alternative login option is not correctly showing \"username & password\"... looks like a few px wider and will be fine"*

Orchestrator analysis (not operator observation): `SteamLogin/index.tsx:579` uses `<Tabs variant="scrollable" scrollButtons="auto">`. The scrollable variant reserves space for scroll buttons and will not let tabs size to fit, so the longer label `"Username & Password"` (`:593`) clips rather than the row widening. With exactly two tabs, `variant="fullWidth"` is the natural fix. Contributing factor: `.tabsWrapper`, the div wrapping those tabs, has NO reachable CSS rule anywhere — it is styled only under `WineManager/index.css:57`. This was already flagged as pre-existing and scoped-out during quick task 260820-kq0. Pre-existing in the Steam form, not caused by phase 36 — it became visible because the dialog now presents as a window.

## Automated Suite State (context, not scored by this gate)

`pnpm test:ci` currently has **one failing suite**: `meta/__tests__/genI18nGateScope.test.ts`. This is caused by earlier quick task `260820-kq0` (commit `1b7fa0eaa` modified `Dialog.tsx` without adding it to `meta/i18nForkTouchedFiles.json`), **not** by phase 36 — `git log --oneline` confirms no phase-36 commit touches `Dialog.tsx`. Its sibling `hardcodedStringGate` failure was already fixed at `5b7481b2e`. This is not a fully green suite; recorded honestly rather than claimed clean.

## Decisions Made

- The stale pre-existing `tauri:dev` process (PID 16197) was not scored against — the run was aborted and relaunched fresh (PID 23762) before any item was evaluated, consistent with this repo's ledgered "stale bundle" lesson.
- Item 9's PASS carries an explicit acceptability judgement from the operator (not an inferred PASS), per the plan's own expected-behaviour note distinguishing the post-success path from the close-button path.
- The two newly-found cosmetic gaps are recorded here for traceability but deliberately NOT fixed in this plan — `files_modified` for 36-03 is `[]` by design, and both are pre-existing defects in the Steam form unrelated to phase 36's scope.

## Deviations from Plan

None — plan executed exactly as written. This plan's sole task was a `checkpoint:human-verify` transcription; no source file was read, fixed, or modified.

## Known Stubs

None. No source file was touched by this plan.

## Threat Flags

None. This plan introduces no new source surface — `files_modified: []` per its own frontmatter, verified below.

## Self-Check

- `.planning/phases/36-login-to-steam-crossfade-and-explicit-login-in-flight-mitiga/36-03-SUMMARY.md` — this file, created by this plan
- No source files modified — `git status --short` confirms only this SUMMARY.md is new/staged by this plan (pre-existing unrelated changes to `.planning/STATE.md` and `.planning/quick/260819-p2d-uat-3413-bottle-prefill-note/` belong to a concurrent session and were left untouched)

## Self-Check: PASSED
