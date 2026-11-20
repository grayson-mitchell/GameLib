---
phase: 73-steam-depot-download-pipeline-in-rust
plan: 11
subsystem: steam-depot
tags: [steam, depot, rust-boundary, ipc, error-classification]
requires: [73-01]
provides:
  - depotRust wire types mirroring job.rs/outcome.rs
  - D-09 rustFailureToError / rustOutcomeToDepotOutcome
  - jobRegistry (token, request-code, event routing by jobId)
  - shell-caller channels depotCdnToken, depotManifestRequestCode, depotJobEvent
affects: [73-12]
tech-stack:
  added: []
  patterns: [signature-based error reconstruction, Map-only registry (no handles)]
key-files:
  created:
    - src/backend/storeManagers/steam/depotRust/types.ts
    - src/backend/storeManagers/steam/depotRust/errorMap.ts
    - src/backend/storeManagers/steam/depotRust/progress.ts
    - src/backend/storeManagers/steam/depotRust/jobRegistry.ts
    - src/backend/storeManagers/steam/depotDecodeErrors.ts
    - src/backend/sidecar/depotHostRegistration.ts
    - src/backend/storeManagers/steam/__tests__/depotRustErrorMap.test.ts
    - src/backend/sidecar/__tests__/depotHostChannels.test.ts
  modified:
    - src/backend/storeManagers/steam/depotErrors.ts
    - src/backend/storeManagers/steam/depot/decompress.ts
    - src/backend/storeManagers/steam/depot/download.ts
    - src/backend/storeManagers/steam/library/installPollOnce.ts
    - src/common/types/ipc/sidecarInternal.ts
    - src/backend/sidecar/handlers.ts
    - src/backend/sidecar/__tests__/ipcSchemas/sidecarInternal.test.ts
    - src/backend/sidecar/__tests__/testContainment.test.ts
key-decisions:
  - "Registration module named depotHostRegistration.ts (not ...FlowRegistration.ts) so the flow/domain censuses do not demand a renderer-facing ipc/ domain file for shell-only channels; function name registerDepotHostFlows kept"
  - "Cdn token answer is the cache string verbatim ('' = no token needed), null only for unknown job or cache error"
requirements-completed: [P73-B, P73-C, D-03, D-06, D-09]
duration: ~35min
completed: 2026-11-09
---

# Phase 73 Plan 11: TS boundary for the Rust depot job Summary

Rust depot outcomes now convert 1:1 to the unchanged UI outcome shape, and Node can serve Rust's token, request-code and event traffic over validated, shell-only channels.

## Tasks

1. **Wire types, D-09 error map, helper relocation** - commit 9b2eb3651. `rustFailureToError` rebuilds, per kind, the exact message token or property `classifyDepotError` reads (ENOSPC, traversal, sha1 mismatch, `.code`, `.eresult`, `isStall` + `msSinceProgress`, network signatures). `rustOutcomeToDepotOutcome` reuses `selectPrimaryDepotFailure` and `classifyDepotError`. `DECODE_STAGE_ERROR_CODES`/`isDecodeStageError` moved to `depotDecodeErrors.ts`; `formatEta`, `rollingRateMiBs`, `PROGRESS_*` to `depotRust/progress.ts`; old locations re-export; `installPollOnce.ts` imports the new module. The test reads `ERROR_KINDS` from `outcome.rs`, asserts equality (16 kinds) and runs an every-kind legacy-vs-Rust classification comparison.
2. **Shell-caller channels, registry, handlers** - commit 9286a4d8f. Strict zod schemas (numeric-id regex, length caps, discriminated union on `kind`), `caller: 'shell'` for all three, Map-backed `jobRegistry` with strictly-increasing `seq` filtering, handlers that log channel + jobId + error name only.

## Deviations from Plan

**1. [Rule 3 - Blocking] Registration file renamed.** `depotHostFlowRegistration.ts` became `depotHostRegistration.ts`: any `*FlowRegistration.ts` is forced by `ipcDomainCensus` (file count, domain file pairing, 296-channel total) to have a renderer-facing `ipc/<domain>.ts`, which these shell-only channels must not have. Precedent: `devEpicCookieSweepRegistration.ts`. `registerDepotHostFlows` retained.

**2. [Rule 3 - Blocking] Extra test files touched.** `ipcSchemas/sidecarInternal.test.ts` (fixtures for 3 new channels, count 10 to 13) and `testContainment.test.ts` (classify the new suite as structurally contained).

**3. `DepotDownloadOutcome` type derived** via `Awaited<ReturnType<typeof downloadSteamDepots>>` rather than exporting it from `depot/outcome.ts` (not in the plan's file list). `errorMap.ts` still imports `selectPrimaryDepotFailure` from `depot/outcome.ts`, so deleting `depot/` later must move that function (the plan asked to reuse it).

## Deferred Issues

`macArchKnownFixRouting.test.ts` "Intel: never seeds..." fails on this host independent of this plan (verified with the import change reverted); logged in `deferred-items.md`.

## Known Stubs

None.

## Threat Flags

None. T-73-40..44 mitigated as planned (shell caller, strict schemas, no token logging with `token_never_logged` test, Map-only registry, every-kind test).

## Self-Check: PASSED

Files and both commits verified present; steam and sidecar Jest suites pass (except the deferred pre-existing failure); `tsc --noEmit` clean; prettier clean on all touched paths.
