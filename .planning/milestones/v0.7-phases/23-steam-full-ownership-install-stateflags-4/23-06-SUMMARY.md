---
phase: 23-steam-full-ownership-install-stateflags-4
plan: 06
subsystem: steam
tags: [steam, depot, instrumentation, logging, trace, g-23-02, root-cause]

# Dependency graph
requires:
  - phase: 23-05
    provides: per-appId single-flight guard (Set->Map with join semantics) and regression-tested support for two concurrent installs of DIFFERENT appIds — this plan's per-invocation chmodAttempts/modeCallsites counters are designed and CONCURRENCY-tested specifically to never regress that property
provides:
  - "A permanent, aggregate-only EDepotFileFlag census (summarizeDepotFlags) logged at three stages of every native depot install — plan-build, download-entry, download-complete — under the stable grep prefix steam-flags-census"
  - "Per-invocation (never module-level) chmodAttempts/modeCallsites runtime counters threaded through downloadSingleFile/healReconciledFileModes/applyEDepotFileModes, proven safe under concurrent different-appId installs"
  - "23-TRACE.md: the G-23-02 hypothesis matrix (H1-H5) with concrete census-field confirm/refute criteria, offline forensic evidence from this machine's real Steam library, and an empty live-run recording template for 23-07"
affects: [23-07, 23-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Emit the SAME pure summarizer's output at two different pipeline stages (plan-build and download-entry) over what should be the identical DepotPlan object — a divergence between the two log lines is itself the diagnostic signal for a serialization/round-trip defect, with no extra code needed to detect it"
    - "Per-invocation counter objects created fresh inside the top-level exported function and threaded down through every private helper as an optional trailing parameter, rather than module-level mutable state — the exact discipline 23-05's per-appId single-flight guard requires of anything that touches install-run state"
    - "Aggregate-only diagnostic logging (counts + a capped distinct-value list, never per-file data) as the mitigation for an information-disclosure/log-size threat pair, verified by a direct grep gate in acceptance criteria rather than a written policy alone"

key-files:
  created:
    - src/backend/storeManagers/steam/depot/flagsCensus.ts
    - src/backend/storeManagers/steam/__tests__/flagsCensus.test.ts
    - .planning/phases/23-steam-full-ownership-install-stateflags-4/23-TRACE.md
  modified:
    - src/backend/storeManagers/steam/depot.ts
    - src/backend/storeManagers/steam/__tests__/depot.test.ts

key-decisions:
  - "Flag constants (EXECUTABLE_FLAG, CUSTOM_EXECUTABLE_FLAG, READONLY_FLAG, HIDDEN_FLAG, DIRECTORY_FLAG, SYMLINK_FLAG) were exported from depot.ts rather than re-declared in flagsCensus.ts, so the census summarizer's flag-bit logic can never silently drift from the production applyEDepotFileModes logic it mirrors"
  - "The distinct-flag-value log cap (32 entries) is expressed as a bit shift (1 << 5) rather than a raw decimal literal, specifically so the file stays free of any accidental 32/128 substring collision with the 'flag constants are imported, not re-literalled' grep gate"
  - "steam-flags-census log lines use the LITERAL string in depot.ts (not a referenced constant) so the acceptance criteria's grep gate for 3+ non-comment call sites counts real log call sites, not references to an imported name"
  - "healReconciledFileModes' new counters parameter is OPTIONAL and trailing — library.ts's own startup-resume call site (buildResumeFinalizeOpts) was deliberately left untouched (not in this plan's files_modified), so its 3-argument call and the corresponding library.test.ts toHaveBeenCalledWith assertion both remain byte-for-byte unchanged"
  - "No mode-application behavior was changed anywhere: the if (file.flags) guard, applyEDepotFileModes' branches, and allModesApplied are untouched other than the counter increments — verified directly via git diff review, matching the acceptance criteria's explicit git diff assertion"

requirements-completed: []  # Neither REQ-23-06 nor REQ-23-07 completed by this plan. REQ-23-06 was already marked complete by an earlier plan (23-01's mode-application implementation) — this plan only adds read-only observability around that existing behavior. REQ-23-07 (the D-07 hardware gate) stays open: this plan is deliberately trace-only (user-locked "trace before fix") and designs no fix for G-23-02, so Gate 2 remains conditional and Gate 3 remains pending.

# Metrics
duration: ~45min
completed: 2026-07-21
---

# Phase 23 Plan 06: G-23-02 Trace Instrumentation + Offline Forensics Summary

**Added a permanent, three-stage EDepotFileFlag census (plan-build / download-entry / download-complete) to the native depot pipeline plus per-invocation chmod counters, then used it to write 23-TRACE.md's H1-H5 hypothesis matrix for the HUMANKIND "0 of 18,809 files +x" blocker (G-23-02) — no fix designed, per the user-locked trace-before-fix ordering.**

## Performance

- **Duration:** ~45 min
- **Tasks:** 2 auto (both completed)
- **Files modified:** 5 (3 created, 2 modified)

## Accomplishments

- **Permanent census instrumentation (Task 1):** `summarizeDepotFlags(plan)` — a pure function walking every file across every depot in a `DepotPlan` — reports `totalFiles`, `flagBearing` (mirroring the EXACT `if (file.flags)` production guard), `executableFlagged`/`readonlyFlagged`/`hiddenFlagged`/`directoryEntries`/`symlinkEntries`, `zeroSizeEntries`, and a capped ascending `distinctFlagValues` list. Wired into `depot.ts` at three `steam-flags-census`-tagged log points: `buildDepotPlan`'s return (both the empty-plan and populated-plan paths), `downloadDepotFiles`' entry (on the SAME plan object, making a flags-dropping serialization boundary between the two directly observable as a log-line divergence — H5), and `downloadDepotFiles`' completion (adding the runtime `chmodAttempts`/`modeCallsites`/`jobCount`/`reconciledSkipped` counters that discriminate H3/H4).
- **Per-invocation counters, concurrency-proven (Task 1):** `chmodAttempts`/`modeCallsites` are created fresh inside `downloadDepotFiles` per call and threaded as an optional trailing parameter through `downloadSingleFile` → `applyEDepotFileModes` and `healReconciledFileModes` → `applyEDepotFileModes` — never module-level state. A dedicated CONCURRENCY test runs two `downloadDepotFiles` invocations for different appIds with overlapping async chunk fetches, in both start orders, and asserts each run's own `chmodAttempts` in its `steam-flags-census` log line is uncorrupted by the other — the exact property that would break if 23-05's per-appId (not global) single-flight guard were paired with module-level counters.
- **23-TRACE.md (Task 2):** the G-23-02 hypothesis matrix (H1 flags-never-populated / H2 manifest-carries-no-exec-bits / H3 modes-applied-then-lost / H4 reconciler-skipped-them / H5 flags-dropped-in-transit), each row bound to a specific `steam-flags-census` field that confirms and one that refutes it. Offline forensic evidence gathered read-only from this machine's real Steam library: execute-bit census, `.acf` field dumps (`inspect-acf.mjs`), and mtime-based inference for HUMANKIND, Cyberpunk 2077, and the WazHack spike-003 control.
- **Unplanned but significant finding surfaced during forensics:** both HUMANKIND and Cyberpunk 2077's on-disk installs have visibly degraded since their respective UAT recordings — Cyberpunk 2077's `.acf` now reads `StateFlags "36"` (FullyInstalled + FilesMissing) instead of the `4` recorded at Gate 1, with only ~7% of its expected content still on disk and zero Mach-O binaries present anywhere; HUMANKIND's `Contents/MacOS/` directories (main binary and the nested `ZFGameBrowser` helper) are now completely empty, not merely non-executable. This is recorded in 23-TRACE.md as an inference (mtimes suggest both were touched earlier the same day, 2026-07-21, by activity unrelated to this plan), with the UAT's own live-recorded numbers kept as the authoritative primary evidence over this session's stale re-inspection.
- **Gate 1 trustworthiness stated plainly:** 23-TRACE.md states directly that Gate 1's launch half is not trustworthy until the HUMANKIND-vs-Cyberpunk discrepancy is resolved, and that today's offline evidence cannot settle it (the reference installs have degraded too far to re-inspect, and no historical `steam-flags-census` log exists for them since the instrumentation didn't exist at their install time) — leaving this as an explicit open question in the live-run recording template for 23-07.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add a permanent EDepotFileFlag census to the depot pipeline** — `1a2d7076` (feat)
2. **Task 2: Offline on-disk forensics + write 23-TRACE.md hypothesis matrix** — `7a21028e` (docs)

**Plan metadata:** (this SUMMARY + STATE/ROADMAP sync) — separate docs commit to follow.

## Files Created/Modified

- `src/backend/storeManagers/steam/depot/flagsCensus.ts` — pure `summarizeDepotFlags(plan)` + `formatDepotFlagsCensus()` formatter, exporting `DepotFlagsCensus`
- `src/backend/storeManagers/steam/depot.ts` — exported the six `EDepotFileFlag` bit constants; added the `DepotModeCounters` interface (per-invocation, never module-level); wired three `steam-flags-census` log call sites (`buildDepotPlan` ×2 return paths, `downloadDepotFiles` entry + completion); threaded `counters` as an optional trailing param through `downloadSingleFile`, `applyEDepotFileModes`, `healReconciledFileModes`
- `src/backend/storeManagers/steam/__tests__/flagsCensus.test.ts` — 8 unit tests for the pure summarizer (H1 all-undefined-flags signature, mixed-flags per-bit counts, `flags: 0` non-bearing, multi-depot aggregation, distinct-value cap, zero-size accounting) and the formatter (no per-file-data leakage, extra-counter folding)
- `src/backend/storeManagers/steam/__tests__/depot.test.ts` — added a `chmodAttempts=0`/`chmodAttempts=1` census-log assertion test and the CONCURRENCY test (two different-appId runs, both start orders, uncorrupted counters)
- `.planning/phases/23-steam-full-ownership-install-stateflags-4/23-TRACE.md` — the G-23-02 hypothesis matrix, offline evidence, Gate 1 trustworthiness assessment, and live-run recording template

## Decisions Made

See `key-decisions` in frontmatter — summarized: flag constants exported from `depot.ts` for single-source-of-truth reuse; the distinct-value cap expressed as `1 << 5` (not a raw `32` literal) to keep the grep-gate clean; `steam-flags-census` written as a literal string at each depot.ts call site (not a referenced constant) so the grep gate for 3+ call sites is meaningful; `healReconciledFileModes`'s new counters param is optional/trailing so `library.ts`'s unrelated startup-resume call site and its test assertion stay untouched; no mode-application behavior changed anywhere (verified via direct `git diff` review).

## Deviations from Plan

None — Tasks 1 and 2 executed exactly as written. One adjustment made mid-Task-1 for correctness against the plan's own acceptance criteria: the census log lines were written using the literal `steam-flags-census` string in `depot.ts` (rather than interpolating the `FLAGS_CENSUS_LOG_PREFIX` constant exported from `flagsCensus.ts`), because the acceptance criteria's grep gate (`grep -c "steam-flags-census"` on `depot.ts`'s own source) requires the literal substring to be present in that file, not merely a reference to a constant defined elsewhere. This is a Rule 1 (bug) fix caught during the plan's own verification step, not a deviation from intent — the `FLAGS_CENSUS_LOG_PREFIX` export remains available in `flagsCensus.ts` for any future consumer that wants the value programmatically.

## Issues Encountered

- Pre-existing `library.test.ts` leaked-timer issue (documented since 23-02/23-05): the full `pnpm jest src/backend/storeManagers/steam` run reports all 847 tests passing, then a worker process is force-exited on a stray `setInterval` in `library.ts`'s poller. Unrelated to this plan's changes; confirmed pre-existing and out of scope.
- During Task 2's offline forensics, discovered the reference installs (HUMANKIND, Cyberpunk 2077) used by Gates 1 and 2 have degraded on disk since their UAT recordings (see Accomplishments above and 23-TRACE.md's "Gate 1 trustworthiness assessment" section for full detail). This is a genuine, unplanned finding surfaced by the forensics task itself — not a code change, and explicitly recorded as an inference rather than a diagnosed root cause (investigating the cause was out of scope for this read-only trace task).

## Verification

- `pnpm jest src/backend/storeManagers/steam/__tests__/flagsCensus.test.ts src/backend/storeManagers/steam/__tests__/depot.test.ts` → 2 suites, 111 tests passed.
- `pnpm jest src/backend/storeManagers/steam` → 24 suites, 847 tests passed (pre-existing leaked-timer non-zero exit after all tests report passing — documented above, not introduced by this plan).
- `npx tsc --noEmit -p .` → 0 errors.
- `npx eslint` on all 4 touched/created source+test files → 0 errors (pre-existing warning classes only, e.g. `@typescript-eslint/require-await` on established `async () => ...` mock patterns already present throughout this file).
- Grep gates: `grep -c "steam-flags-census"` on `depot.ts` → 4 (≥3 required); `grep -c "32\|128"` on `flagsCensus.ts` (comment-stripped) → 0; module-level `chmodAttempts`/`modeCallsites` variable-declaration grep → 0.
- `git diff` review of `applyEDepotFileModes`/the `if (file.flags)` guard/`allModesApplied` → confirmed unchanged other than the counter increments.
- `23-TRACE.md` → exists, contains all five hypothesis IDs (H1-H5) each with confirm/refute census fields, real offline execute-bit counts for every title found on disk, and the explicit "not trustworthy" sentence for Gate 1.

## Requirements Status

- **REQ-23-06 — already Complete (from an earlier plan, unaffected by this one).** This plan's requirements frontmatter lists REQ-23-06 because its instrumentation observes the exact mode-application code REQ-23-06 describes, but the requirement itself was satisfied by 23-01's implementation of `applyEDepotFileModes`/`depot/fileAttributes.ts`, not by this plan. No new completion recorded.
- **REQ-23-07 — still OPEN, unaffected by this plan.** This is a deliberately trace-only plan (user-locked "trace before fix" ordering) — it designs no fix for G-23-02, so Gate 2 (`23-UAT.md`) remains conditional (Denuvo launch proven only after a manual `chmod +x` workaround) and Gate 3 remains pending. `requirements-completed` is intentionally left empty to avoid marking either requirement satisfied by this plan.

## User Setup Required

None — this plan is fully autonomous (no checkpoints, no external service configuration, no auth gates).

## Next Phase Readiness

- The `steam-flags-census` log lines are now permanently emitted on every native depot install (past this commit) — 23-07's live run can capture them directly from `~/Library/Logs/GameLib/gamelib.log` for a fresh install without any further code changes.
- 23-TRACE.md's live-run recording template is ready for 23-07 to fill in verbatim (title/appId, all three census log lines, verdict, implied fix shape).
- 23-08 (the fix plan) is explicitly gated on 23-07's verdict per the user-locked ordering — this plan intentionally leaves `applyEDepotFileModes`, the `if (file.flags)` guard, `fetchDepotPlanEntry`'s mapping, and the completeness gate completely untouched, so 23-08 starts from an unmodified baseline plus the new observability.
- Flagged for 23-07's planning: the current on-disk state of HUMANKIND and Cyberpunk 2077 (this machine's Gate 1/Gate 2 reference installs) has degraded since their UAT recordings (see Issues Encountered) — 23-07 may need a fresh clean install rather than reusing either existing install to get a clean live census.

## Threat Flags

No new threat flags — the plan's own threat register (T-23-16 through T-23-19, T-23-SC) fully covers this plan's surface and all mitigations were verified via the grep-gate acceptance criteria (aggregate-only census content, exactly 3 fixed-size log lines per run, no mode-application-path changes, read-only forensics with no dependency additions).

---

*Phase: 23-steam-full-ownership-install-stateflags-4*
*Completed: 2026-07-21*

## Self-Check: PASSED

All 5 created/modified files verified present on disk (`depot/flagsCensus.ts`, `__tests__/flagsCensus.test.ts`, `23-TRACE.md`, `depot.ts`, `__tests__/depot.test.ts`). Both task commit hashes (`1a2d7076`, `7a21028e`) verified present in `git log --oneline --all`. `pnpm jest src/backend/storeManagers/steam` (24 suites, 847 tests) and `npx tsc --noEmit -p .` both re-confirmed passing at self-check time.
