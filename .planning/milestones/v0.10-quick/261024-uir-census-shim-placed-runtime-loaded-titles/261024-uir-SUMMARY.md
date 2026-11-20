---
phase: quick-261024-uir
plan: 01
status: complete
completed: 2026-10-24
key-files:
  modified:
    - meta/bridgeCensus.ts
    - meta/__tests__/bridgeCensus.test.ts
  moved:
    - .planning/todos/completed/2026-10-24-bridge-census-reports-shimmed-runtime-loaded-titles-as-no-steam-api.md
commits:
  - e1787d397 feat: pure classifier (readPersistedScanVerdict, pickRuntimeSteamApiDll, 'unconfirmed')
  - 4799e9982 feat: driver (shim-aware walk, backup/verdict dll versions, docblocks)
  - 731776408 chore: close todo
---

# Quick 261024-uir: census classifies shim-placed runtime-loaded titles correctly

A GameLib shim in the install tree now means "a steam_api ships": the census reads the original from `.gamelib-orig`, else the persisted `bridge.scan` verdict, else classifies the new `unconfirmed` class (routed, never covered). It is never `no-steam-api`.

## Census headline (live, read-only, real profile)

- Before: 17 of 18 routed; 15 of 18 symbols covered (bridge=3, known-bad=2, no-steam-api=12, unknown-version=1)
- After: 17 of 18 routed; 6 of 18 symbols covered (bridge=3, known-bad=2, missing-symbols=9, no-steam-api=3, unknown-version=1)
- No title landed `unconfirmed` (every shim-only title has a persisted verdict).

## Per-title class changes (all no-steam-api -> missing-symbols)

| appid | name | after class | after detail |
|---|---|---|---|
| 1167950 | Vampire's Fall: Origins | missing-symbols | steam_api64.dll@runtime-loaded; shim placed over the original, no .gamelib-orig backup -- persisted bridge.scan miss |
| 1284190 | The Planet Crafter | missing-symbols | same, persisted miss |
| 1603180 | Mining Mechs | missing-symbols | same, persisted miss |
| 1691190 | Rogue Waters | missing-symbols | same, persisted miss |
| 1782460 | Hell Clock | missing-symbols | same, persisted miss |
| 219990 | Grim Dawn | missing-symbols | marker + persisted miss: SteamInternal_GameServer_Init and six @ambiguous interface families |
| 284100 | Unclaimed World | missing-symbols | marker + persisted miss: 31 symbols (Steam_*/SteamAPI_* old-SDK exports, VR_*, STEAM*_INTERFACE_VERSION* strings) |
| 3410180 | Overlooting | missing-symbols | same, persisted miss |
| 648800 | Raft | missing-symbols | same, persisted miss (+ SteamStub .bind informational) |

284100 is now not covered (missing-symbols). Of the twelve todo-named appids: nine above changed; 1119730, 1363080 and 427410 stay `no-steam-api`.

## Findings

- Those three keep `no-steam-api` because their steam_api64.dll sits at depth 6 (`Engine/Binaries/ThirdParty/Steamworks/SteamvNNN/Win64/`), beyond the depth-4 walk. The live path's `RUNTIME_WALK_MAX_DEPTH` is also 4, so census still mirrors live; the "none ships" detail is inaccurate for them. Not changed here (out of scope); recorded in the closed todo.
- Raw census captures stayed outside the repo; only T-51-39 row fields appear above.

## Verification

- `npx jest meta/__tests__/bridgeCensus.test.ts`: 49/49 pass (41 pre-existing + 8 new, new ones seen failing first).
- `pnpm codecheck` clean; `prettier --check` passes on both source files (`ignored: false`); the todo is prettier-ignored (`ignored: true`), so no check run.
- `pnpm planning-gates`: 12/12 passed after the todo move.
- `graphify update .` run.

## Deviations from Plan

None. Task 1/2 verify lines were split (prettier `--file-info` takes one file) and run per file.

## Self-Check: PASSED
