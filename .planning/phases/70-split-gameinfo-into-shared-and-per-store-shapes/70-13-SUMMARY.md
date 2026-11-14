---
phase: 70-split-gameinfo-into-shared-and-per-store-shapes
plan: 13
subsystem: ipc-schemas
tags: [gameinfo, zod, discriminated-union, d-09, d-10]
requires: [70-11, 70-12]
provides:
  - "src/common/types/ipc/gameInfoSchema.ts: installPlatform, five strict per-runner GameInfo schemas, gameInfoSchema (discriminatedUnion on runner)"
  - "src/backend/testUtils/gameInfoFixtures.ts: complete per-runner fixture builders"
  - "gameInfoParity.test.ts: Equal/Simplify parity per member and union plus key coverage"
key-files:
  created:
    - src/common/types/ipc/gameInfoSchema.ts
    - src/backend/testUtils/gameInfoFixtures.ts
    - src/backend/sidecar/__tests__/ipcSchemas/gameInfoParity.test.ts
  modified:
    - src/common/types/ipc/install.ts
    - src/common/types/ipc/gameDetails.ts
    - src/common/types/legendary.ts
    - src/backend/sidecar/__tests__/ipcSchemas/install.test.ts
    - src/backend/sidecar/__tests__/ipcSchemas/gameDetails.test.ts
    - src/backend/sidecar/__tests__/downloadQueueFlows.test.ts
    - src/backend/sidecar/__tests__/gameDetailsFlows.test.ts
requirements-completed: []
completed: 2026-11-14
---

# Phase 70 Plan 13: Strict per-runner GameInfo IPC schemas Summary

install, updateGame and addNewApp now validate GameInfo with a strict `z.discriminatedUnion('runner', ...)` (nested install/extra/about/reqs/overrides/manifest/cyberpunk all strict), with no casts and no `phase70Passthrough` left in install.ts or gameDetails.ts; a compile-time identity parity test proves schema output equals the hand-written interfaces.

## Commits

- 91cb02e71 feat(70-13): strict per-runner GameInfo schemas for install, updateGame and addNewApp
- d1319762e test(70-13): schema/interface parity, key coverage and per-store strict-reject rows

## What changed

- `gameInfoSchema.ts` owns `installPlatform` (moved from install.ts; gameDetails.ts and install.ts import it from here). The one loose boundary is `epicDlcMetadataArg()` (legendary `dlcList`), named and commented, cast like `wineInstallationArg()`.
- Undeclared key at top level, `install` or `extra` is rejected for each of the five runners (IPC_INVALID_ARGS via the existing channel validation).
- Parity test: 5 member `Equal` checks, 1 union check, 1 `@ts-expect-error` negative control, plus runtime key-coverage for each member and nested `install` key sets. The interfaces stay hand-written.
- Fixtures: `steam/gog/legendary/nile/sideloadGameInfoFixture`; the sideload one matches exactly what SideloadDialog.handleInstall sends. install.test.ts and gameDetails.test.ts gained, per runner, one valid row and three invalid rows (top, install, extra), plus the dlcList-extra-keys valid row (SideloadDialog-shape row is the sideload builder).

## Null census (key paths and counts only, no values)

Scanned store_cache/{steam,gog,legendary,nile}_library.json, sideload_apps/library.json, gog_store/installed.json (depth: top, install.*, extra.*):

- `legendary_library.json`: `save_path` is null in 2 entries.
- All other files: 0 nulls.

Resolution: `save_path` declared `str().nullable().optional()` and `LegendaryGameInfo.save_path` widened to `string | null` (comment: save_sync.ts sets it null). tsc stayed clean, so no reader broke. Real-profile key sets for every store were also checked against the declared keys; none were undeclared.

## Deviations from Plan

1. **[Rule 3 - ratchet] Fixtures name members via `GameInfoByRunner['steam']` etc.** Naming `SteamGameInfo` etc. in `src/backend/testUtils/gameInfoFixtures.ts` made `pnpm gameinfo-narrowing-ceiling` report growth (10 vs baseline 0); testUtils is a scanned directory. Using the existing `GameInfoByRunner` indexed type keeps it at 0 without a baseline entry.
2. Temporary `@public` knip tags on the member schemas and three fixtures at the Task 1 commit (consumers arrive in Task 2); removed in Task 2.
3. Of the six flow/unit tests the plan listed, only `downloadQueueFlows.test.ts` and `gameDetailsFlows.test.ts` carry a gameInfo through the validated wire. `installFlows`, `enrichmentFlows`, `shortcutsFlows` and `askForceUninstall` do not send a GameInfo that reaches these schemas (they passed unchanged, including at the strict-schema commit), so they were not edited. No other fixture under src/backend was found rejected by the strict schema.

## Acceptance-grep notes

- `grep -c phase70Passthrough` on install.ts/gameDetails.ts = 0 now, non-zero before (real pass). `z.ZodType<GameInfo, GameInfo>` count 0 in both files (was 1 each).
- `discriminatedUnion('runner'` = 1 and `looseObject` = 1 in gameInfoSchema.ts (a single `grep -c` over both patterns reports 2 lines).
- `git diff -U0 -- '*.test.ts' | grep -c "^[-+].*expect("` = 0 for Task 1.

## Verification

tsc clean; jest (ipcSchemas, ipcSchemaCoverage, rendererZodGuard, the six flow/unit files) 1444 passed at Task 1; ipcSchemas + flows 1341 passed at Task 2; `pnpm check:ipc-contract`, `pnpm find-deadcode`, `pnpm boundaries`, `pnpm gameinfo-narrowing-ceiling` (PASS 784 files) green; prettier clean on touched files.

`pnpm lint` reports 1 error: `src/backend/storeManagers/steam/depotRust/updateEstimate.ts:138:25 prefer-promise-reject-errors`. That file is from another session's commit 0d9ec9e77 (quick-261114-nn2), not touched here; left alone.

## Known Stubs

None.

## Threat Flags

None. T-70-24/26/27 mitigated as planned; T-70-25 accepted (dlcList); T-70-28 honored (census printed paths and counts only). Live addNewApp gate remains 70-16.

## Self-Check: PASSED
