---
phase: 23-steam-full-ownership-install-stateflags-4
plan: 05
subsystem: steam
tags: [steam, depot, install, single-flight, abort, pause-resume, stateflags, concurrency]

# Dependency graph
requires:
  - phase: 23-03
    provides: buildResumeFinalizeOpts + startup-resume reconciliation loop in library.ts init() — this plan filters that loop's scanDownloadingAppIds consumption against the in-flight registry
  - phase: 23-02
    provides: canWriteFullOwnership fail-closed completeness gate — unchanged here, but the single-flight guard protects it from the concurrent-run race that could otherwise feed it interleaved outcomes
provides:
  - "installDepotDownload is single-flight per appId with join semantics — nativeInstallsInFlight converted from Set<string> to a Map keyed by appId whose value carries the run's Promise<InstallResult> + abort state; a second concurrent install for the same appId awaits the in-flight promise instead of spawning a second downloadSteamDepots"
  - "Fail-safe in-flight cleanup: the appId is removed from the registry in finally on success AND on error/cancel/throw, so a legitimate later re-install is never permanently blocked"
  - "Pause→resume abort-before-restart: a TEARING-DOWN (already-aborted) in-flight entry is awaited to settlement FIRST, then a fresh run starts — the two never overlap; only a genuinely live entry joins"
  - "isNativeInstallInFlight(appId) exported from games.ts (read seam over nativeInstallsInFlight, not the mutable registry); library.ts init() startup-resume skips any appId already in-flight so a stale StateFlags=1026 manifest cannot spawn a phantom concurrent install racing a user-initiated one"
affects: [23-04, 23-UAT]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single-flight join via a Map<appId, {promise, controller/aborted}>: the run's promise is registered synchronously BEFORE the first await (preserving the D-UAT-05 stop()-finds-it-in-flight property), and duplicate entrants await it rather than starting a second producer"
    - "Live-vs-tearing-down discrimination at the guard: join only a non-aborted entry; await an aborted entry's finally-cleanup to settle before starting a fresh run (no stacking) — because aborthandler.ts exposes no is-aborted query, the abort state is carried on the Map value itself"
    - "Reconcile-at-consumption-site: scanDownloadingAppIds/readAcfState kept byte-for-byte (21-08 invariant); the in-flight filter is applied where init() consumes the scan result, via a minimal exported read seam, never by exporting the mutable Set/Map"

key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/library.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
    - src/backend/storeManagers/steam/__tests__/library.test.ts

key-decisions:
  - "nativeInstallsInFlight changed from Set<string> to a Map keyed by appId — the value carries BOTH the run's Promise<InstallResult> and its abort state, since aborthandler.ts has no external is-aborted query; stop()'s .has(this.appId) check works identically on a Map"
  - "The single-flight guard distinguishes a LIVE entry (join: await and return its promise, no second download) from a TEARING-DOWN entry (aborted via stop(): await its settlement first so its finally cleanup runs, THEN start a fresh run) — this is what makes pause→resume never stack two concurrent downloadSteamDepots"
  - "library.ts consumes a minimal exported isNativeInstallInFlight(appId) read seam rather than the mutable registry; scanDownloadingAppIds/readAcfState internals are left byte-for-byte (21-08), the reconciliation is a filter at init()'s consumption site only"
  - "Do-not-touch fence honored: emitProgress/throttle, the StateFlags 4-vs-1026 gate, buildid, and file-mode logic were all out of scope and unchanged — this plan is purely a concurrency-correctness fix for the Gate 1 percent flip-flop"

requirements-completed: []  # REQ-23-07 (D-07 gate) is only PARTIALLY closed by this plan — see "Requirements Status" below. Gate 1 PASSED on hardware; Gates 2 & 3 remain deferred under 23-04.

# Metrics
duration: ~30min
completed: 2026-07-18
---

# Phase 23 Plan 05: Single-Flight Guard + Pause/Resume Abort-Before-Restart (Gate 1 flip-flop fix) Summary

**Closed the Gate 1 multi-depot percent flip-flop by making `installDepotDownload` single-flight per appId (Set→Map with join semantics + fail-safe cleanup), making pause/resume abort-before-restart so two `downloadSteamDepots` runs never overlap, and filtering startup-resume against the in-flight set so a stale `StateFlags=1026` manifest can't spawn a phantom concurrent install — Gate 1 subsequently PASSED on real macOS hardware (2026-07-19).**

## Performance

- **Duration:** ~30 min (code); Gate 1 hardware re-run confirmed 2026-07-19
- **Tasks:** 2 auto (code) completed + Task 3 human-verify checkpoint (Gate 1) PASSED
- **Files modified:** 4 (0 created, 4 modified)

## Accomplishments

- **Root cause fixed:** `installDepotDownload` added the appId to `nativeInstallsInFlight` but never *checked* it on entry, so `install()` could be entered twice for one appId and spawn two concurrent `downloadDepotFiles` runs — each emitting `progressUpdate` for `{ appName: appId, runner: 'steam' }` against its own `doneBytes`, alternating the single percent slot (observed 2%↔16%, 6%↔27% on Hogwarts Legacy 990080).
- **Single-flight guard + join (Task 1, `ddde970d`):** converted `nativeInstallsInFlight` from `Set<string>` to a `Map` keyed by appId carrying the run's `Promise<InstallResult>` + abort state; on entry a live entry is awaited/returned instead of starting a second `downloadSteamDepots`. The run's promise is registered synchronously before the first await (preserves the `stop()`-finds-it-in-flight property). `finally` deletes the entry on success AND error/cancel/throw (fail-safe cleanup — a later re-install is never permanently blocked).
- **Pause/resume no-stacking + startup reconciliation (Task 2, `f963de8b`):** the guard now distinguishes a live entry (join) from a tearing-down/aborted entry (await its settlement first, then start a fresh run) so a pause→resume never overlaps two runs. `library.ts` `init()`'s startup-resume loop skips any appId for which the new exported `isNativeInstallInFlight(appId)` is true, so a stale on-disk `1026` manifest can't double-drive a live in-process install. `scanDownloadingAppIds`/`readAcfState` left byte-for-byte (21-08 invariant).
- **Gate 1 hardware PASS (Task 3, blocking-human):** on real macOS with a real Steam client, after deleting the stale `appmanifest_990080.acf`, the multi-depot install showed a **single monotonic percent** (no flip-flop) through a pause/resume cycle, adopted as `StateFlags=4` with no verify/re-download, and launched — recorded in `23-UAT.md` Gate 1 (user-confirmed 2026-07-19). Phase 25's multi-host fan-out cleared the download-time bottleneck that had blocked observing steps 4–6.

## Task Commits

Each task was committed atomically (TDD — failing test first, then implementation):

1. **Task 1: Single-flight guard + fail-safe cleanup** — `cc77a9df` (test) → `ddde970d` (feat)
2. **Task 2: Pause/resume abort-before-restart + reconcile startup-resume against in-flight set** — `7fccfb2a` (test) → `f963de8b` (feat)
3. **Task 3: Re-run 23-UAT.md Gate 1 on real macOS hardware** — human-verify checkpoint, no code; PASS recorded in `23-UAT.md` (2026-07-19)

**Plan metadata:** (this SUMMARY) — written retroactively; the code landed via the debug/gap-closure commits above (2026-07-18) outside the normal execute-phase summary flow.

## Files Created/Modified

- `src/backend/storeManagers/steam/games.ts` — `nativeInstallsInFlight` Set→Map; single-flight entry guard with live-join vs aborted-await-then-restart; `finally` fail-safe cleanup; exported `isNativeInstallInFlight(appId)` read seam
- `src/backend/storeManagers/steam/library.ts` — `init()` startup-resume loop filters `scanDownloadingAppIds` consumption against `isNativeInstallInFlight(appId)` (2 read sites)
- `src/backend/storeManagers/steam/__tests__/games.test.ts` — single-flight (call-count===1 across overlapping same-appId installs), registry-cleared-on-success/error/cancel, different-appIds-proceed, and pause→resume-no-stacking tests
- `src/backend/storeManagers/steam/__tests__/library.test.ts` — init() skips in-flight appId (finalizeToSteam not called), not-in-flight appId still resumes normally

## Decisions Made

See `key-decisions` in frontmatter — summarized: `Set→Map` carrying promise + abort state (aborthandler has no is-aborted query); guard discriminates live-join vs aborted-await-then-restart (the pause/resume no-stacking mechanism); `library.ts` reads a minimal exported `isNativeInstallInFlight` seam, never the mutable registry; scan/readAcf internals untouched; the 4-vs-1026 gate / buildid / file-mode / emitProgress logic all out of scope and unchanged.

## Deviations from Plan

None in the code — Tasks 1 & 2 executed as written. Process deviation: this SUMMARY was authored retroactively (2026-07-20). The plan's code landed as four atomic debug/gap-closure commits on 2026-07-18 during the `steam-install-slow-start` follow-up, and the Gate 1 hardware PASS was recorded 2026-07-19, but the plan's SUMMARY was never written at the time — this document formalizes that completed work.

## Issues Encountered

- Pre-existing `library.test.ts` leaked-timer issue: the full `pnpm test:ci` suite reports all tests passing then the process exits non-zero ~1s later on a stray `setInterval` in `library.ts`'s poller (documented in `deferred-items.md` since 23-02). Unrelated to this plan's logic; the two files this plan touches pass cleanly in isolation.

## Verification

- `npx jest src/backend/storeManagers/steam/__tests__/games.test.ts src/backend/storeManagers/steam/__tests__/library.test.ts` → **2 suites, 296 tests passed** (re-run 2026-07-20 for this summary).
- Gate 1 real-macOS hardware: **PASS** (user-confirmed 2026-07-19) — single monotonic percent through pause/resume, `StateFlags=4` adoption, no verify/re-download, launched.

## Requirements Status

- **REQ-23-07 (D-07 pre-ship hardware gate) — PARTIAL / still OPEN.** This plan closed the Gate 1 defect and Gate 1 now PASSES on hardware, but REQ-23-07 spans all three D-07 gates. **Gate 2 (hard-DRM launch) and Gate 3 (interrupt-resume) remain PENDING real-hardware runs** and are **deferred** by explicit user decision (2026-07-20). Tracked in `23-UAT.md` (status: testing, 2 pending) and owned by plan **23-04** (the D-07 UAT gate plan). Phase 23 therefore stays **in progress** — not complete — until Gates 2 & 3 pass. `requirements-completed` is intentionally empty to avoid marking REQ-23-07 satisfied.

## User Setup Required

None — no external service configuration. The two deferred gates require a human on real macOS with a live Steam client and owned hard-DRM + multi-depot titles (run via `/gsd-verify-work 23` when ready).

## Next Phase Readiness

- The single-flight guard + startup reconciliation make the concurrency surface safe for the remaining Gates 2 & 3 hardware runs (no phantom concurrent installs, no percent flip-flop, no pause/resume stacking).
- Phase 23 code is complete; the only remaining work to close the phase is the two deferred hardware gates (23-04 / REQ-23-07).

## Threat Flags

| Flag | File | Description |
|------|------|--------------|
| threat_flag: none-new | — | No new network calls, endpoints, or data exposure. `nativeInstallsInFlight` is a module-private in-process registry (now a Map); `isNativeInstallInFlight` is a read-only boolean seam. The startup-resume reconciliation only *narrows* which appIds are resumed (skips in-flight ones), it never broadens the surface — the 23-03 `threat_flag: new-startup-network-call` boundary is unchanged. |

---

*Phase: 23-steam-full-ownership-install-stateflags-4*
*Completed: 2026-07-18 (code) · Gate 1 hardware PASS 2026-07-19 · summary formalized 2026-07-20*

## Self-Check: PASSED

All 4 modified files verified present on disk; all four task commit hashes (cc77a9df, ddde970d, 7fccfb2a, f963de8b) verified present in git log; the two touched test files pass (296/296). Gate 1 PASS recorded in 23-UAT.md. REQ-23-07 correctly left open (Gates 2 & 3 deferred).
