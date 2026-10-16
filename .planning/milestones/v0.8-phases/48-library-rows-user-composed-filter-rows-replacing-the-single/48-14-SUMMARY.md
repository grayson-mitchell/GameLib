---
phase: 48-library-rows-user-composed-filter-rows-replacing-the-single
plan: 14
subsystem: ui
tags: [focus-row-strip, resizeobserver, wkwebview, gap-closure, G-48-11a]

requires:
  - phase: 48-library-rows-user-composed-filter-rows-replacing-the-single
    provides: 48-12 createStripCardWidthSync and flip-hold; 48-13 git-ref harness
provides:
  - createNextFrameRunner in focusRowOverflow.ts (never synchronous, one run per frame, cancellable, total)
  - FocusRowStrip observer callback that reads and requests; the width write runs in the next frame
  - a WKWebView resize-sweep harness (shipped vs deferred vs control) with measured loop-error counts
  - WR-01 dispositioned fixed
affects: [48-15]

actuals:
  tokens: 60000
  tasks: 2
  commits: 3
plan_head_before: 8541bfdc1cc6c0dbc010f959259f30dcfd8af4ae
plan_head_after: 6376731a511044f0a495ee107fdd7c66b653c7ad

key-files:
  created:
    - .planning/phases/48-library-rows-user-composed-filter-rows-replacing-the-single/evidence/48-14/wk-ro-sweep.swift
    - .planning/phases/48-library-rows-user-composed-filter-rows-replacing-the-single/evidence/48-14/run-ro-sweep.sh
    - .planning/phases/48-library-rows-user-composed-filter-rows-replacing-the-single/evidence/48-14/results-ro-sweep.json
  modified:
    - src/frontend/screens/Library/components/FocusRowStrip/focusRowOverflow.ts
    - src/frontend/screens/Library/components/FocusRowStrip/index.tsx
    - src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowOverflow.test.ts
    - src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowStripSource.test.ts
    - .planning/phases/48-library-rows-user-composed-filter-rows-replacing-the-single/evidence/48-13/build-harness.mjs
    - .planning/phases/48-library-rows-user-composed-filter-rows-replacing-the-single/48-REVIEW-DISPOSITION.md

key-decisions:
  - "The runner guards a late frame callback with a ticket as well as cancelling the handle, so a browser or stub that ignores cancel still cannot write after unmount (T-48-44)"
  - "Count WebKit's sanitised 'Script error.' (no source line) as the ResizeObserver loop error, after the control showed WebKit never uses the named text on a file:// page"
  - "48-UAT.md G-48-11a left status: failed; the live item 11 re-run belongs to 48-15"

requirements-completed: []

coverage:
  - id: D1
    description: "The ResizeObserver callback in FocusRowStrip/index.tsx writes no style; the width write runs once per frame via createNextFrameRunner; cleanup cancels it"
    verification:
      - kind: unit
        ref: "focusRowOverflow.test.ts N1-N6; focusRowStripSource.test.ts G-48-11a wiring tests (a)-(c)"
        status: pass
    human_judgment: false
  - id: D2
    description: "In WKWebView under item 11's sweep the deferred wiring raises 0 loop errors in each of two runs, with callbacks delivered and 34 width writes; the shipped wiring raises 34 per run"
    verification:
      - kind: other
        ref: "bash evidence/48-14/run-ro-sweep.sh <mode> 1cc619836 (results-ro-sweep.json)"
        status: pass
    human_judgment: false
    note: "Desk proof in a real WebKit engine on a synthetic strip. The live app re-run (item 11 against its own control) is owed to 48-15."
  - id: D3
    description: "WR-01 recorded fixed with a consistent open count"
    verification:
      - kind: other
        ref: "js-yaml check of 48-REVIEW-DISPOSITION.md: WR-01 fixed, open 8 == counted 8, total 11, WR-02 and IN-01 still open"
        status: pass
    human_judgment: false

duration: 70min
completed: 2026-10-09
status: complete
---

# Phase 48 Plan 14: Strip width sync off the ResizeObserver callback Summary

**The strip's card-width write now runs in the next animation frame through `createNextFrameRunner`, and a WKWebView resize sweep measures the pre-fix wiring raising 34 `ResizeObserver loop` errors per run against 0 for the new wiring on the same page.**

## Performance

- **Tasks:** 2 of 2 (Task 1 tracer, Task 2 auto)
- **Commits:** 3 (`ee47fcf6d` red, `1cc619836` green, `6376731a5` evidence and disposition)
- **Files:** 4 under `src/`, 6 under `.planning/`

## Task 1 -- RED and GREEN

**RED** (`ee47fcf6d`, before any code): `Test Suites: 2 failed, 2 passed, 4 total`, `Tests: 11 failed, 140 passed, 151 total`. The 11 are exactly N1, N2, N3, N4 (two cases), N5 (two cases), N6 and the three wiring gates (a), (b), (c). The 140 passing include 48-12's G1-G4, S1-S4, the `useLayoutEffect` test and the "disconnects it" test, unmodified.

**GREEN** (`1cc619836`): `Test Suites: 4 passed, 4 total`, `Tests: 151 passed, 151 total`. `pnpm codecheck` exits 0, `pnpm lint` exits 0, `npx prettier --check` over the four `src/` paths is clean (all four probed not ignored), and `git diff --exit-code d7bcc6e1d` over `Library/index.css`, `GameCard`, `GamesList/index.tsx` and `src/frontend/index.tsx` is empty.

The change:

- `createNextFrameRunner(run, schedule?, cancel?)` returns `{ request, cancel }`. `request` schedules only when nothing is pending; the frame callback clears pending before calling `run`, inside try/catch; `cancel` is idempotent and a ticket makes a late callback after `cancel` a no-op. The default scheduler is `requestAnimationFrame`, falling back to `setTimeout(cb, 0)`.
- In `index.tsx` the observer callback is `readMeasurement()` then `frame.request()`. The runner's work is `syncCardWidth(track)` then `readMeasurement()`. Cleanup calls `frame.cancel()` beside the disconnect and the scroll-listener removal. The `useLayoutEffect` first-paint sync is untouched.

## Task 2 -- WebKit sweep

Rig: `bash evidence/48-14/run-ro-sweep.sh <mode> 1cc619836`. A non-activating accessory `NSWindow` with a `WKWebView` on `WKWebsiteDataStore.nonPersistent()`, content 1280x800, a fluid strip of 14 visible cards (600x900 art) built from the stylesheets and `focusRowOverflow.ts` at `1cc619836`. Item 11's sweep: width 1280 to 600 to 1280 in 40px steps, height 800 to 400 to 800 in 25px steps, 0.15 s per step, 1 s settle. Each run proved it resized: 66 `resize` events, inner width 600..1280, inner height 400..800.

| Mode | Run | Observer callbacks | Width writes | Loop errors |
|------|-----|--------------------|--------------|-------------|
| shipped (pre-48-14, `d7bcc6e1d`) | 1 | 103 | 34 | 34 |
| shipped | 2 | 103 | 34 | 34 |
| deferred (this plan) | 1 | 69 | 34 | 0 |
| deferred | 2 | 69 | 34 | 0 |
| control (resize observed track every delivery) | 1 | 710 | 710 | 710 |

Against item 11's live counts: 27 and 25 with the strip, 0 with `focusRow` null. The shipped arm reproduces the class in WebKit (`armed: true`): one error per width write, 34 of 34. The deferred arm performs the same 34 writes and raises none, so the zero is not a rig that never wrote. The numbers differ from 27 and 25 because the live sweep ran through the app's real layout, not this synthetic page.

**Instrument trap found on the way.** A first pass of the harness counted 0 for the shipped arm. That was the instrument: on a `file://` page WebKit delivers the loop error as the sanitised message `Script error.` (lineno 0), never the text `ResizeObserver loop`. The control arm (708 callbacks, 0 matches) exposed it, and `roLoopErrors` now counts `ResizeObserver loop` or a bare `Script error.` with no source line. `errorEvents` and `errorMessages` are recorded beside it, so any other script error would show. Every recorded run has `errorMessages` of only `Script error.` (shipped, control) or empty (deferred).

**Does the desk proof stand in for the live gate?** No. It precedes it. It shows the mechanism, the fix and the instrument in a real WebKit engine, but on a fixture without the app's `.App .content` scroller, scrollbar or `index.tsx:51` log forwarding. 48-15 still has to count 0 live against its control, and G-48-11a stays `status: failed` in `48-UAT.md` until then.

Disposition: `48-REVIEW-DISPOSITION.md` WR-01 `open` to `fixed`, Source `48-14 1cc619836`. `open:` recounted from the list: 10 to 8 (the header already disagreed with its list at plan time: 9 open findings, `open: 10`). `total: 11`, WR-02 and IN-01 unchanged.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The harness loop-error counter was blind to WebKit's error message**
- **Found during:** Task 2, first sweep
- **Issue:** the plan specified counting window `error` events whose message matches `ResizeObserver loop`. In WKWebView on a `file://` page the message is `Script error.`, so the shipped arm read 0 and would have recorded a green that proves nothing.
- **Fix:** counter widened as described above; added a `--ro control` arm to `build-harness.mjs` that must raise the error if the rig can see it (710 of 710); recorded `errorEvents` and `errorMessages`.
- **Files modified:** `evidence/48-13/build-harness.mjs`
- **Commit:** `6376731a5`

**2. [Plan extension] Control arm and extra result fields**
- `results-ro-sweep.json` holds one `control` run beside the 2 shipped and 2 deferred, and per-run `errorEvents`, `errorMessages`, `resizeEvents`, `innerWidth`, `innerHeight`. The plan's verify (2 deferred, 2 shipped, deferred zero with callbacks) passes unchanged.

**Total deviations:** 1 auto-fixed, 1 additive. No change to scope.

## Issues Encountered

- `swiftc -O` printed an actor-isolation diagnostic note for the probe's top-level code; it compiles and runs. Not touched.
- An early sanity run used a scratchpad-only page and a throwaway binary under the session scratchpad; nothing from it is committed.

## Known Stubs

None.

## Threat Flags

None. The harness loads only `file://` content in a non-persistent store inside a fresh `mktemp -d`; no endpoint, auth path or schema was added.

## Next Phase Readiness

- 48-15 owns the live item 11 re-run: `ResizeObserver loop` count with the strip showing against the `focusRow` null control, and G-48-11a's status flip.
- `src/frontend/index.tsx:51` still forwards every `ErrorEvent` with a null payload; deliberately unchanged (removing the cause removes the events). IN-01 and WR-02 stay open.

## Self-Check: PASSED

Created and present: `focusRowOverflow.ts` (`createNextFrameRunner`), `evidence/48-14/{wk-ro-sweep.swift,run-ro-sweep.sh,results-ro-sweep.json}`. Commits `ee47fcf6d`, `1cc619836`, `6376731a5` present on `quick-261002-b63`.
