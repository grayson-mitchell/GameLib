---
phase: 21-steam-native-install
plan: 04
subsystem: steam-depot-download-orchestrator
tags: [steam, depot-download, pics, content-manifest, tdd]

# Dependency graph
requires:
  - phase: 21-01
    provides: depot/select.ts (selectAllDepots/selectDepots/dlcAppIds), depot/crypto.ts (decryptFilename)
  - phase: 21-02
    provides: depot/manifest.ts (writeAppManifest — type/plan shape only; the finalize CALL is Plan 06)
provides:
  - depot.ts downloadSteamDepots(appId, opts) — resolves every owned depot,
    fetches + parses + decrypts each depot's manifest, sums REAL total bytes
    across all depots (D-03)
  - DepotPlan/DepotPlanEntry/DepotPlanFile/DepotPlanChunk types — the
    enqueue-time contract Plan 05's streaming download loop consumes
affects: [21-05 (streaming download loop consumes DepotPlan), 21-06 (recovery/finalize calls writeAppManifest with DepotPlan data)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Task-level TDD (RED test commit -> GREEN implementation commit, per task)
    - Ambient .d.ts for an undocumented internal steam-user path (mirrors
      lzma.d.ts precedent from Plan 01 — src/common/typedefs/)
    - Loud-throw guard on an undocumented vendor export shape (Pitfall 5,
      T-21-10) instead of a silent failure on a future version bump

key-files:
  created:
    - src/backend/storeManagers/steam/depot.ts
    - src/backend/storeManagers/steam/__tests__/depot.test.ts
    - src/common/typedefs/steam-user-content-manifest.d.ts
  modified: []

key-decisions:
  - "Owned appId/depotId sets are derived inside depot.ts itself (getOwnedSets,
    from the authenticated client's package licenses via getProductInfo),
    rather than as a separate exported primitive — this plan is the only
    caller and the plan's own <interfaces> section scoped ownership
    resolution to the orchestrator, not Plan 01's select.ts"
  - "getProductInfo uses the Promise-returning form from @types/steam-user
    (no callback), while getDepotDecryptionKey/getRawManifest use a small
    local SteamUserDepotExtras interface + callback-to-Promise wrapping,
    since only the latter two are undocumented/untyped in @types/steam-user"
  - "loadContentManifestParser + fetchDepotPlanEntry are only invoked when
    selectAllDepots returns at least one descriptor — an app with zero owned
    depots returns { depots: [], totalBytes: 0 } without ever dynamically
    importing the internal parser module"

patterns-established:
  - "Undocumented vendor internals get an ambient .d.ts (tsc) + a runtime
    loud-throw guard (Pitfall 5) rather than blanket `any` casts — applies to
    any future steam-user internal-path usage"

requirements-completed: [SNI-01, SNI-03]

# Metrics
duration: ~20min
completed: 2026-07-15
---

# Phase 21 Plan 04: Steam Depot Download Orchestrator (Front Half) Summary

Built `downloadSteamDepots(appId, opts)` — the depot-download orchestrator's front half: resolves every owned depot via Plan 01's `selectAllDepots`, fetches and parses each depot's raw manifest through steam-user's undocumented internal parser, decrypts every filename (steam-user truncates them), and sums the REAL total byte count across ALL depots for the DownloadManager's enqueue-time contract (D-03), replacing the `pc_requirements`-derived estimate `getSteamInstallSize` used previously.

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-15T22:28:00+12:00
- **Completed:** 2026-07-15T22:31:00+12:00
- **Tasks:** 2
- **Files modified:** 3 (2 created new source files, 1 new test file)

## Accomplishments
- `downloadSteamDepots` gates on `SteamUser.ensureConnected()` before any network work (T-21-11, never opens a second logon) and rejects a non-numeric appId with `/^\d+$/` before touching it at all (T-21-05)
- Depot selection is fully os-parameterized — `selectAllDepots` is called with the caller-supplied `os`/`language`, never a hardcoded default (D-14, verified with two different `os` values in the same test)
- Multi-depot manifest fetch: each owned depot's decryption key + raw manifest are fetched, parsed via the pinned `steam-user/components/content_manifest.js`, and every filename is decrypted with Plan 01's `decryptFilename` — proven against both a two-depot and a single-depot (N=1) fixture
- `totalBytes` is the REAL sum of `Number(file.size)` across every depot's files (D-03), not the PICS-estimate `size` field select.ts's `DepotDescriptor` carries
- Pitfall 5 (T-21-10) mitigated: `loadContentManifestParser` throws loudly if steam-user's internal export shape is ever missing, and a smoke test asserts the real vendor module still exports `parse()` today

## Task Commits

Each task followed a strict RED -> GREEN TDD cycle:

1. **Task 1: depot.ts skeleton — connection gate + depot selection + params**
   - RED: `ad0d9965` (test) — 3 selection tests fail against a stub that throws unconditionally
   - GREEN: `845c512a` (feat) — numeric guard, connection gate, os-parameterized selection; manifest-fetch helpers stubbed for Task 2
2. **Task 2: Per-depot raw-manifest fetch, filename decrypt, summed real total (D-03)**
   - RED: same test file, `loadContentManifestParser`/`fetchDepotPlanEntry` stubs make the two new manifest+total tests fail
   - GREEN: `0e99feac` (feat) — real manifest fetch/parse/decrypt/sum implementation + ambient `.d.ts` for the undocumented parser path

**Plan metadata:** (this commit) — `docs(21-04): complete depot-download-orchestrator plan`

## Files Created/Modified
- `src/backend/storeManagers/steam/depot.ts` - `downloadSteamDepots` orchestrator; `DepotPlan`/`DepotPlanEntry`/`DepotPlanFile`/`DepotPlanChunk` types; internal `getOwnedSets`/`fetchAppInfo`/`fetchDlcInfos`/`loadContentManifestParser`/`fetchDepotPlanEntry` helpers
- `src/backend/storeManagers/steam/__tests__/depot.test.ts` - 6 tests: appId guard, connection gate, os-parameterization (x2 os values), two-depot manifest fetch + summed total, single-depot (N=1) case, Pitfall-5 smoke assertion
- `src/common/typedefs/steam-user-content-manifest.d.ts` - ambient module declaration for `steam-user/components/content_manifest.js` (undocumented, uncovered by `@types/steam-user`)

## Decisions Made
- Ownership resolution (`getOwnedSets`) lives inside `depot.ts` rather than as a shared exported primitive in `depot/select.ts` — this plan is the sole caller today and the plan's `<interfaces>` section scoped it to the orchestrator
- `getProductInfo` calls use the real typed Promise-returning form from `@types/steam-user`; only `getDepotDecryptionKey`/`getRawManifest` (genuinely undocumented) get a local type extension + callback-to-Promise wrap
- The internal manifest parser is only dynamically imported when at least one depot is selected — an app with zero owned depots short-circuits to `{ depots: [], totalBytes: 0 }` without touching the undocumented path at all

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `src/common/typedefs/steam-user-content-manifest.d.ts` ambient module declaration**
- **Found during:** Task 2, first `tsc --noEmit` run after implementing `loadContentManifestParser`
- **Issue:** `steam-user/components/content_manifest.js` is an internal, undocumented path with no `@types/steam-user` coverage — `tsc` failed with `TS7016: Could not find a declaration file for module 'steam-user/components/content_manifest.js'`, blocking the plan's required clean `tsc --noEmit`.
- **Fix:** Added an ambient `declare module 'steam-user/components/content_manifest.js'` file mirroring Plan 01's `lzma.d.ts` precedent for another untyped/undeclared package path, declaring only the minimal `parse(buffer): { files: unknown[] }` surface `depot.ts` actually touches. The module header explicitly notes this is NOT a guarantee against future shape drift — `loadContentManifestParser`'s runtime loud-throw guard (Pitfall 5, T-21-10) remains the real safety net.
- **Files modified:** `src/common/typedefs/steam-user-content-manifest.d.ts` (new)
- **Commit:** `0e99feac`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary for a clean `tsc --noEmit`; no behavior change, no scope creep.

## TDD Gate Compliance

Both tasks show a genuine RED -> GREEN pair in git log (`test(21-04): ...` before each `feat(21-04): ...`). One note on Task 2's RED phase: of the 3 new tests added, 2 (two-depot, single-depot) genuinely failed against the not-implemented stubs, confirming real RED. The 3rd (the Pitfall-5 smoke test) passed immediately even during RED — this is expected and correct, not a fail-fast violation: that test asserts an environment/vendor invariant (`steam-user/components/content_manifest.js` still exports `parse()`) that is independent of this plan's own implementation status, not a behavior this plan's code produces. It was written to fail loudly if the *vendor* package ever changes shape, not to test `depot.ts` itself.

## Issues Encountered
None beyond the deviation above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `DepotPlan`/`DepotPlanEntry`/`DepotPlanFile` are the exact shapes Plan 05's streaming download loop needs to consume (per-file `chunks` with `sha`/`cb_original`/`offset` preserved verbatim from the raw manifest)
- Plan 05 must still implement: positional `fs.write` streaming to an open fd (not RAM-buffered), the concurrency queue, `AbortSignal` wiring (the `opts.signal` field exists on `DownloadSteamDepotsOpts` but is not yet consulted — deferred to Plan 05 per this plan's own objective statement), and path-containment validation (resolve+relative) for every decrypted filename before it is used as a write destination (T-21-01, caller's responsibility per Plan 01's crypto.ts header comment)
- Plan 06 (recovery/finalize) can now call `writeAppManifest` (Plan 02) with real `DepotPlanEntry[]` data (`depotId`/`gid`/summed sizes) once Plan 05 has written bytes to disk

---
*Phase: 21-steam-native-install*
*Completed: 2026-07-15*

## Self-Check: PASSED

- FOUND: `src/backend/storeManagers/steam/depot.ts`
- FOUND: `src/backend/storeManagers/steam/__tests__/depot.test.ts`
- FOUND: `src/common/typedefs/steam-user-content-manifest.d.ts`
- FOUND: `.planning/phases/21-steam-native-install/21-04-SUMMARY.md`
- FOUND commit `ad0d9965` (test: Task 1 RED)
- FOUND commit `845c512a` (feat: Task 1 GREEN)
- FOUND commit `0e99feac` (feat: Task 2 GREEN)
