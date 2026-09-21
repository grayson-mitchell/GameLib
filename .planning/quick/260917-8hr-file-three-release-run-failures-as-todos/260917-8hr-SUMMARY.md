---
phase: 260917-8hr
plan: 01
subsystem: build
tags: [ci, tauri, codesign, notarization, rust, cargo, tar, release-tauri]

requires:
  - phase: quick-260914-vbw
    provides: com.apple.security.cs.allow-jit entitlement fix, now vindicated by a real notarization attempt
provides:
  - Three new pending todos recording the three failed matrix legs of run 35223308954
  - Updated STATUS on the parent macOS signing todo reflecting a completed notarization attempt
affects: [release-tauri.yml, macos signing, linux build, windows build]

tech-stack:
  added: []
  patterns: []

key-files:
  created:
    - .planning/todos/pending/2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md
    - .planning/todos/pending/2026-09-17-linux-release-leg-fails-to-compile-get-window-missing-on-apphandle.md
    - .planning/todos/pending/2026-09-17-windows-release-leg-dies-in-install-deps-tar-reads-c-as-a-remote-host.md
  modified:
    - .planning/todos/pending/2026-09-04-macos-releases-ship-unsigned-and-unnotarized.md

key-decisions:
  - "Filed three separate todos (one per matrix leg) rather than one combined todo, matching the plan's per-cause severity/platform split"
  - "Updated the parent macOS todo's STATUS rather than closing it — closing still needs a published, browser-downloaded artifact"
  - "Copied all measured_facts figures verbatim per the fidelity contract; none were re-derived, rounded, or corrected"

patterns-established: []

requirements-completed: [QUICK-260917-8hr-01, QUICK-260917-8hr-02, QUICK-260917-8hr-03, QUICK-260917-8hr-04]

duration: ~20min
completed: 2026-09-17
---

# Quick Task 260917-8hr: File Three Release-Run Failures As Todos Summary

**Filed three pending todos for the three unrelated failures of GitHub Actions run 35223308954 (macOS notarization rejected on 253 Contents/Resources binaries, Linux E0599 on get_window, Windows tar misreading a `C:\` path as a remote host) and updated the parent macOS signing todo's STATUS to record that notarization has now actually run and failed — the blocker grew, it did not shrink.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-09-17T13:16:35Z
- **Tasks:** 3/3 completed
- **Files modified:** 4 (3 created, 1 edited)

## Accomplishments

- Filed `2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md` (severity: critical, platform: macos, ready: code) — records that Tauri's signing pass signs the sidecar, shell, `.app`, and zip but never recurses into `Contents/Resources/`, where 253 Heroic-inherited runner binaries (legendary, nile + its embedded Python 3.12 tree, gogdl, comet, steam-bridge-helper) sit unsigned. Also records that the `allow-jit` entitlement fix is vindicated (zero notarization complaints on the sidecar) and the orchestrator's prediction that the failure would be in the sidecar's nested signing was wrong.
- Filed `2026-09-17-linux-release-leg-fails-to-compile-get-window-missing-on-apphandle.md` (severity: major, platform: linux, ready: code) — records the E0599 compile failure at two call sites (`main.rs:5203`, `:6915`; `:3534`/`:6908` are noted explicitly as non-code), that the same commit compiled fine on macOS, and labels the per-platform Cargo feature-unification cause as an unverified hypothesis.
- Filed `2026-09-17-windows-release-leg-dies-in-install-deps-tar-reads-c-as-a-remote-host.md` (severity: major, platform: windows, ready: code) — records the `tar -tzf` failure in `install-deps`, that every subsequent step (including signing) was skipped, and that this run therefore gives the existing Windows signing todo no information either way.
- Edited `2026-09-04-macos-releases-ship-unsigned-and-unnotarized.md`: added a `## STATUS 2026-09-17` section between the existing 2026-09-14 STATUS section and `## Problem`, recording that notarization ran and returned `Invalid`, that the remaining blocker grew (253 binaries), that `allow-jit` is vindicated, and cross-linking both the new macOS todo and the Windows todo by filename. `status: OPEN` and `ready: live-gate` were left unchanged, as required.

## Task Commits

Each task was committed atomically:

1. **Task 1: File the macOS notarization-rejection todo (FINDING 1)** - `183fac4a3` (docs)
2. **Task 2: File the Linux compile-failure and Windows install-deps todos (FINDINGS 2 and 3)** - `82ac54d86` (docs)
3. **Task 3: Update the existing macOS signing todo, then run the frontmatter gate** - `5b5714b12` (docs)

**Plan metadata:** not committed by this executor per the orchestrator's explicit instruction — `260917-8hr-PLAN.md`, this `260917-8hr-SUMMARY.md`, and `.planning/STATE.md` are committed separately by the orchestrator afterward.

## Files Created/Modified

- `.planning/todos/pending/2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md` - macOS notarization-rejection todo (FINDING 1)
- `.planning/todos/pending/2026-09-17-linux-release-leg-fails-to-compile-get-window-missing-on-apphandle.md` - Linux compile-failure todo (FINDING 2)
- `.planning/todos/pending/2026-09-17-windows-release-leg-dies-in-install-deps-tar-reads-c-as-a-remote-host.md` - Windows install-deps failure todo (FINDING 3)
- `.planning/todos/pending/2026-09-04-macos-releases-ship-unsigned-and-unnotarized.md` - added STATUS 2026-09-17 section (ITEM 4)

## Decisions Made

- Filed three separate todo files (one per matrix leg), matching the plan's per-finding severity/platform breakdown, rather than combining them into one file.
- Left the 2026-09-04 todo's `status: OPEN` and `ready: live-gate` untouched per explicit instruction, even though notarization now has a concrete result — closing still requires a published artifact and a browser-download Gatekeeper check.
- Committed the three todo tasks as three separate atomic commits, matching the plan's three-task structure, rather than one combined commit.

## Deviations from Plan

None - plan executed exactly as written. No Rule 1/2/3 auto-fixes were needed; this was a pure documentation-authoring task with no code paths to break or blocking issues to resolve.

## Fidelity Contract Compliance

Every figure quoted in the three new todos and in the STATUS 2026-09-17 section was copied verbatim from the plan's `<measured_facts>` block: 253, 506, 500, 10, 6, 394, 390, 226, 6, 6, run id 35223308954, tag `v0.7.0-notarize-test1`, commit `cc2d66248`, submission id `b55513c6-5b60-42bd-b69b-6e0dda7bab23`, job duration ~1m47s, call sites `:5203` and `:6915`. None of these figures looked wrong or internally inconsistent to me in a way that suggested a transcription error on the orchestrator's part — the two count tables (506/500/10/6 summing to 1022, and 394/390/226/6/6 also summing to 1022) do not sum to 253 exactly as the fidelity contract warned, and I labelled both as counting issue instances rather than distinct binaries rather than "fixing" the apparent discrepancy. No figure was rounded, re-counted, paraphrased, or corrected.

## Issues Encountered

None. All verification commands specified in each task's `<verify>` block passed on the first attempt.

## Self-Check

See `## Self-Check` section appended below after file/commit verification.

## User Setup Required

None - no external service configuration required. This is a pure documentation-authoring task; the underlying defects it records (macOS resigning, Linux feature drift, Windows tar invocation) remain unfixed and are tracked as `ready: code` in their respective new todos for a future session.

## Next Phase Readiness

- All three `ready: code` todos are desk-ready: a future session can pick any one up without needing a live gate, a human decision, or hardware access, per the `ready:` triage vocabulary in `CLAUDE.md`.
- The macOS notarization-rejection todo is the most actionable next step toward a real signed release, since it names concrete file targets (`.github/workflows/release-tauri.yml`, `src-tauri/tauri.macos.conf.json`) and a specific direction (innermost-first codesign of `Contents/Resources/` before Tauri signs the outer `.app`).
- The Linux and Windows todos both explicitly label their root cause as an unverified hypothesis — a future session should confirm before implementing, per each todo's own text.
- No blockers for closing out this quick task.

---
*Phase: 260917-8hr*
*Completed: 2026-09-17*

## Self-Check: PASSED

All 4 modified/created todo files under `.planning/todos/pending/` confirmed present on disk via
`test -f`. This SUMMARY.md itself confirmed present. All 3 task commit hashes (`183fac4a3`,
`82ac54d86`, `5b5714b12`) confirmed present via `git log --oneline --all`. No missing items.
