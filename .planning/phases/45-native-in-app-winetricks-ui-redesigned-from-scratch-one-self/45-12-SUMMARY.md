---
phase: 45-native-in-app-winetricks-ui-redesigned-from-scratch-one-self
plan: 12
subsystem: live-gate-d21
tags: [live-gate, winetricks, macos, gptk, contrast, packaged-build]

requires:
  - phase: 45-native-in-app-winetricks-ui-redesigned-from-scratch-one-self
    provides: plans 45-01..45-11 (the native Winetricks tab, queue, classifier, banner, locales)
provides:
  - 45-LIVE-GATE.md scored (status failed) with build record, results table, evidence inventory and a run-record section naming the contract defects
  - 45-UAT.md with all 27 items resolved (5 pass, 9 issue, 13 blocked)
  - seven triaged todos in .planning/todos/pending/ (3 major, 3 medium, 1 minor/human)
affects: [winetricks-tab, settings-dialog-layout, theme-tokens, phase-45-closure]

tech-stack:
  added: []
  patterns:
    - "live-gate shell side driven by the assistant: tee -a transcript, per-launch log archive, winetricks.log baseline per item, 2 s window-capture bursts by CGWindowID, colour-histogram pixel sampling in Swift, WCAG ratio in Python"

key-files:
  created:
    - .planning/todos/pending/2026-10-11-winetricks-settings-dialog-width-is-content-driven-and-overflows-the-window.md
    - .planning/todos/pending/2026-10-11-winetricks-run-first-verb-renders-queued-and-cancel-stays-disabled.md
    - .planning/todos/pending/2026-10-11-winetricks-apply-button-text-is-unreadable-in-nord-light-and-midnightmirage.md
    - .planning/todos/pending/2026-10-11-winetricks-tab-contrast-misses-below-the-45-and-3-bars.md
    - .planning/todos/pending/2026-10-11-gptk-banner-cannot-appear-at-tab-open-because-list-all-skips-the-version-check.md
    - .planning/todos/pending/2026-10-11-webkit-recent-searches-popup-under-the-winetricks-search-blocks-the-checkbox-click.md
    - .planning/todos/pending/2026-10-11-winetricks-tab-ux-observations-from-the-45-live-gate.md
  modified:
    - .planning/phases/45-native-in-app-winetricks-ui-redesigned-from-scratch-one-self/45-LIVE-GATE.md
    - .planning/phases/45-native-in-app-winetricks-ui-redesigned-from-scratch-one-self/45-UAT.md

key-decisions:
  - "Rebuilt the packaged app on the Mac from HEAD 44d9cc4c3 with APPLE_SIGNING_IDENTITY set: the pre-existing 08:34 bundle was unsigned and carried a sidecar SEA and renderer built before the Phase 45 commits were pulled (build_sha edited before the empty-diff check, per the contract)"
  - "Scored every item on the pre-registered criterion as written; the three contract assumptions the run refuted (list-all feeds the banner, a fresh bad batch per theme, a narrowable window) are recorded in a dated run-record section, not edited into the criteria"
  - "Four launches instead of one, each with its own ordinal and archive; nothing scored in an earlier launch was re-scored"

patterns-established:
  - "screencapture -v must be given a fixed -V; a stop signal discards the file (one recording lost). screencapture -l <CGWindowID> + a Swift colour histogram is a working pixel-sampling rig without pyobjc/ffmpeg"
  - "A failed verb cannot be re-batched within a launch (Retry only); plan bad-containing runs across launches or after a later run replaces the sidecar's latest run"

requirements-completed: [D-01, D-03, D-12, D-14, D-16, D-17, D-18, D-21]

duration: ~3h (19:38Z build start to 22:40Z transcription; operator-driven app side)
completed: 2026-10-10
---

# Phase 45 Plan 12: Live gate D-21 Summary

**The gate ran on a signed packaged build against a real GPTK bottle and FAILED: five G-items are `issue`, one is `blocked` on a missing fixture, four pass, and seven todos carry every defect with its measurement and evidence path.**

## Performance

- **Duration:** ~3 h wall clock (build 19:38Z, launch 1 19:41Z, launch 4 exited 22:36Z, transcription 22:40Z)
- **Started:** 2026-10-10T19:38:27Z
- **Completed:** 2026-10-10T22:45:00Z
- **Tasks:** 3 (Task 1's build half + Task 2 operator checkpoint + Task 3 transcription); Task 1's authoring half was done on Windows in `657716616`
- **Files modified:** 2 planning files + 7 new todos

## Accomplishments

- Packaged release build verified (`com.gamelib.shell`, hardened runtime, `allow-jit`), launched four times from a terminal with a `tee -a` transcript, single pid asserted per launch, logs archived per launch, `winetricks.log` baselined before every installing item (bottle went 15 -> 44 lines).
- G2 (navigation mid-run), G4 (induced failure continues the queue), G5 (`gdiplus_winxp` unattended, zenity present) and the D-15 count (0 ERROR-level Winetricks lines across eight archives, with fixme/Downloading present at lower levels) pass.
- G7 measured 12 cells x 2 themes by pixel sampling of window captures; the operator described each theme before numbers were taken and the descriptions matched the numbers.
- Every defect is a todo with `severity:`/`platform:`/`ready:` in order, the observation, launch ordinal, evidence filenames and (where read) a candidate mechanism flagged as unproven.

## Task Commits

Single docs commit for Task 3 (this summary, the scored gate, the UAT ledger, seven todos). Task 2 produced no commits; the build artefacts are untracked.

## Files Created/Modified

- `45-LIVE-GATE.md` - frontmatter `status: failed`, build record filled, results table, evidence inventory, run-record section
- `45-UAT.md` - 27 `result:` lines (5 pass / 9 issue / 13 blocked), `status: complete`
- 7 todos (see key-files)

## Decisions Made

See frontmatter `key-decisions`. One more: the operator's Retry press at 10:02 (launch 1) was recorded as the record-only Retry observation even though the contract asked for it last.

## Deviations from Plan

- The plan's single launch became four (reasons in the run-record section of 45-LIVE-GATE.md).
- The G9 narrow arm was never established (window could not be narrowed by the operator); 11 backstop ids are `blocked`, three are `issue` from natural-width evidence.
- Two of the contract's reachability assumptions (N11, N12) were wrong; both are recorded as contract defects and the items scored as written.

## Issues Encountered

Listed in the seven todos. Headline: the Settings dialog overflows the window whenever the tab has long rows or log lines (major); the first verb of a run intermittently renders as Queued with Cancel disabled (major); Apply's enabled text is 1.52:1 / 1.01:1 (major); failed-state reds and several borders are under the bars (medium); the GPTK banner cannot appear at tab open (medium); WebKit's recent-searches chip blocks a click (medium).

## Known, Accepted, Temporary State

- The evidence directory `/tmp/gamelib-gate-45-20261010T194049Z` (~5 GB) is outside the repo and will not survive a reboot; `terminal.log` there holds every observation and measurement verbatim. Copy it somewhere durable if the todos are to be worked later.
- `G1c-G2-launch1.mov` exists but was never frame-stepped (no ffmpeg); G1's 0 px claim is not made.

## Next Phase Readiness

Phase 45 cannot close as passed. The three `major` todos are desk-ready (`ready: code`); fixing the dialog width first unblocks re-observing items 11, 12, 24, 26, 27 and the G1 frame-step claim on a re-run. A re-run needs only one launch if the first-verb race is fixed and the banner is derived at tab open.
