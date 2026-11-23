---
phase: 86-pure-leaf-services
plan: 27
subsystem: backend
tags: [gap-closure, rustInvoke, failure-path, launcher, umu, game-details, steam-shortcut]
requires:
  - phase: 86-pure-leaf-services
    provides: the info shims and resolvers (recentGames, wiki, gameOverrides) that can now reject
provides:
  - resolveLaunchUmuId, the best-effort umu id lookup for the GOG, Epic and Amazon launch() bodies
  - four failure-isolated callers (runLaunchEventCallback, launch() x3, getGameInfo, addNonSteamGame)
  - requestRustInvoke on the runner sign-outs, so clearCache(library) empties the wiki cache again
affects: [86-VERIFICATION truth G, phase 92 (getUmuId row deletion), phase 87 plans editing launcher.ts and handlers.ts]
tech-stack:
  added: []
  patterns: ["failure isolation lives in the caller, the shim stays one typed call (D-05, D-06, D-24)"]
key-files:
  created:
    - src/backend/storeManagers/storeManagerCommon/umuGameId.ts
    - src/backend/storeManagers/storeManagerCommon/__tests__/umuGameId.test.ts
  modified:
    - src/backend/launcher.ts
    - src/backend/__tests__/launcher_launchSingleFlight.test.ts
    - src/backend/storeManagers/gog/games.ts
    - src/backend/storeManagers/legendary/games.ts
    - src/backend/storeManagers/nile/games.ts
    - src/backend/__tests__/infoShimSchedule.test.ts
    - src/backend/gamedetails/dispatch.ts
    - src/backend/gamedetails/__tests__/gameDetailsModules.test.ts
    - src/backend/shortcuts/nonesteamgame/nonesteamgame.ts
    - src/backend/shortcuts/nonesteamgame/__tests__/nonesteamgame.test.ts
    - src/backend/sidecar/handlers.ts
    - src/backend/sidecar/runnerAuthFlowRegistration.ts
    - src/backend/sidecar/__tests__/runnerAuthFlows.test.ts
    - src/backend/utils.ts
    - src/backend/__tests__/clearCacheWiki.test.ts
    - .planning/phases/86-pure-leaf-services/86-REVIEW-DISPOSITION.md
decisions:
  - "The umu catch lives in a new helper under storeManagerCommon, not in the shim and not copied three times: D-06 forbids anything but the typed call in src/backend/info, and a helper is testable without driving a Linux launch()"
  - "infoShimSchedule WIKI_CALLERS names umuGameId.ts in place of the three store managers, because the helper is now the importer of info/wiki.ts"
status: complete
metrics:
  completed: 2026-11-23
actuals:
  tokens: 21000
  tasks: 4
  commits: 5
plan_head_before: 409463f5eb1e77673c71d542ad7b0bad918e8176
plan_head_after: 5bb83650b89d7dae23729ea25408317ee2cada27
commits: 5
---

# Phase 86 Plan 27: Failure-path hardening for the ported services Summary

**Four callers of the Rust info shims now log a warning and continue with the TS default when the call rejects, closing verifier truth G, and the runner sign-outs carry `requestRustInvoke` so the wiki cache clears again.**

## What was built

- **CR-41** (`9acbfc580`): `runLaunchEventCallback` wraps `await addRecentGame(deps, gameInfo)` in try/catch and logs
  `['Recording recent game failed:', error]`. The diff in `launcher.ts` is one statement (+5/-1).
- **WR-41** (`97b62cb2d`): new `resolveLaunchUmuId(deps, appName, runner)` returns the Rust answer, or `null` plus a
  warning on any rejection. The GOG, Epic and Amazon `launch()` bodies call it instead of the `getUmuId` shim. Its
  module doc records why (WR-41), where the isolation sits (D-06) and when it goes (deleted with the `getUmuId` row,
  phase 92). `infoShimSchedule` `WIKI_CALLERS` now lists the helper in place of the three managers; the `getUmuId` row
  is unchanged (shape `shim`, `deletedBy: 92`).
- **WR-42** (`92d18429d`): `getGameInfo` returns `tempGameInfo` when `attachOverrides` rejects; `addNonSteamGame`
  continues with a null wiki result (no Steam id) when `getWikiGameInfo` rejects. Both log a warning.
- **Disposition** (`5a09a8496`): CR-41, WR-41 and WR-42 are `fixed` in `86-REVIEW-DISPOSITION.md` (three frontmatter
  values, three table rows with their fixing shas, `open: 39`).
- **Sign-out wiki-cache clear** (`5bb83650b`): `RunnerAuthFlowDeps` and `userDeps()` carry `requestRustInvoke`;
  `handlers.ts` passes `deps.services.host.requestRustInvoke`. The `canClearWikiCache` doc comment and the
  clearCacheWiki test title no longer call it owed.

No file in `src/backend/info/` changed (`wiki.ts`, `gameOverrides.ts`, `recentGames.ts` byte-unchanged), so D-06 and
D-24 hold.

## Commits

| Task | Commit | Message |
| ---- | ------ | ------- |
| 1 | `9acbfc580` | fix(86-27): guard the recent-games write in the launch callback (CR-41) |
| 2 | `97b62cb2d` | fix(86-27): make the launch umu id lookup best-effort (WR-41) |
| 3 | `92d18429d` | fix(86-27): keep the game page and the Steam shortcut working when a Rust lookup rejects (WR-42) |
| 3 (docs) | `5a09a8496` | docs(86-27): record CR-41, WR-41 and WR-42 as fixed |
| 4 | `5bb83650b` | fix(86-27): sign-outs clear the wiki cache again (pass requestRustInvoke to registerRunnerAuthFlows) |

## RED runs (tests failing against the unfixed source)

- **Task 1 (CR-41)**, `launcher_launchSingleFlight.test.ts`: both new cases failed with
  `Received promise rejected instead of resolved / Rejected to value: [Error: info_recent_add:write-failed]`
  (`Tests: 2 failed, 3 passed, 5 total`).
- **Task 2 (WR-41)**, `umuGameId.test.ts`: the suite failed to run with
  `Cannot find module '../umuGameId' from 'src/backend/storeManagers/storeManagerCommon/__tests__/umuGameId.test.ts'`,
  before the helper existed.
- **Task 3 (WR-42)**, `gameDetailsModules.test.ts`: the new case failed with the thrown `info_overrides_attach:not-ready`.
  `nonesteamgame.test.ts`: `Received promise rejected instead of resolved / Rejected to value: [Error: info_wiki_get:not-ready]`
  (`Tests: 2 failed, 35 passed, 37 total`).
- **Task 4**, `runnerAuthFlows.test.ts`: the extended "injected slices" case and the new "86-27" case failed (the
  received deps lacked `requestRustInvoke`).

## Task 4 outcome: executed

The step-0 gate ran `git status --porcelain --` over `handlers.ts`, `runnerAuthFlowRegistration.ts` and
`runnerAuthFlows.test.ts`: it printed nothing. The step-3 check over `utils.ts` and `clearCacheWiki.test.ts` also
printed nothing, so the stale comments were refreshed too. No "Skipped (foreign-dirty)" entry is needed. The
`ClearCacheDeps.requestRustInvoke` member stays optional, and making it required is still owed (recorded in the
`canClearWikiCache` doc).

## Gate results

- 13 jest suites, 459 tests, all passing (the 12 pre-existing suites plus the new `umuGameId.test.ts`).
- `pnpm codecheck`, `pnpm lint` (0 errors), `pnpm find-deadcode`, `pnpm boundaries`, `pnpm backend-di-ceilings`
  (jestMock=1751 unchanged, no new module mock), `pnpm gameinfo-narrowing-ceiling` and `pnpm planning-gates`
  (12/12) all exit 0.
- Scoped `npx prettier --check` over every non-`.planning` path written: clean.
- Known local red, not this plan's: `meta/__tests__/genI18nGateScope.test.ts` A-17 (R5, operator-deferred).
  `meta/i18nForkTouchedFiles.json` was not regenerated.
- `graphify update .` run from the worktree.

## Deviations from Plan

None. The plan executed as written. In Task 4 the two clean-gate checks passed, so both the registration wiring and
the stale-comment step ran.

## Known Stubs

None.

## Threat Flags

None. The new warning lines carry the operation text, the app name or title and the rejection only (T-86-69).

## Self-Check: PASSED

- Created files present: `umuGameId.ts`, `umuGameId.test.ts`.
- Commits `9acbfc580`, `97b62cb2d`, `92d18429d`, `5a09a8496`, `5bb83650b` are all ancestors of HEAD on `phase/86-gap-closure`.
