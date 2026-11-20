---
phase: quick-261120-tbr
plan: 01
subsystem: steam-depot-download
tags: [steam, depot, opt-in-dlc, config.optionaldlc, verify, update-estimate]
requires:
  - quick 261120-st3 (selectAllDepots skips opt-in DLC depots unless enabledOptInDlc names the DLC)
provides:
  - "optInDlcOfInstalledDepots: installed depot ids mapped to their config.optionaldlc DLC appIds"
  - "DownloadSteamDepotsOpts.installedDepotIds, supplied by verify and the update estimate"
  - "buildDepotRefs passes enabledOptInDlc, so an installed opt-in DLC depot stays in updates, verify and the estimate"
affects:
  - src/backend/storeManagers/steam/depot/select.ts
  - src/backend/storeManagers/steam/depot/plan.ts
  - src/backend/storeManagers/steam/depot/planModel.ts
  - src/backend/storeManagers/steam/depotRust/verify.ts
  - src/backend/storeManagers/steam/depotRust/updateEstimate.ts
tech-stack:
  added: []
  patterns:
    - "installed set = update delta keys union ACF installed ids; absent on a fresh install"
key-files:
  created:
    - .planning/todos/pending/2026-11-20-opt-in-dlc-has-no-enable-path-in-the-install-dialog.md
  modified:
    - src/backend/storeManagers/steam/depot/select.ts
    - src/backend/storeManagers/steam/depot/planModel.ts
    - src/backend/storeManagers/steam/depot/plan.ts
    - src/backend/storeManagers/steam/depotRust/verify.ts
    - src/backend/storeManagers/steam/depotRust/updateEstimate.ts
    - src/backend/storeManagers/steam/__tests__/depot.test.ts
    - src/backend/storeManagers/steam/__tests__/depot.cmPlan.test.ts
    - src/backend/storeManagers/steam/depotRust/__tests__/rustVerify.test.ts
    - src/backend/storeManagers/steam/depotRust/__tests__/updateEstimate.test.ts
    - .planning/codebase/CONCERNS.md
    - .planning/todos/completed/2026-11-20-opt-in-dlc-depots-have-no-enable-path-and-drop-from-updates.md
decisions:
  - "Field named installedDepotIds (ReadonlySet<string>), matching the enabledOptInDlc type; buildDepotRefs unions it with delta.oldGidByDepot keys"
  - "The helper does not filter on the DLC app's own extended.optionaldlc: optInDlcNotEnabled already decides which DLCs are opt-in"
  - "The update estimate passes installedDepotIds, not delta, because delta means a chunk-level delta job"
metrics:
  duration: "about 25 minutes"
  completed: 2026-11-20
  tasks: 3
  files: 11
status: complete
actuals:
  tokens: 14000
  tasks: 3
  commits: 3
plan_head_before: 89c7ebaaae70d458b41e732af0e8167dbdab6c45
plan_head_after: 2111cec0bb4d9d213dd01524ed0b648b823ed6e1
---

# Quick 261120-tbr: Installed opt-in DLC depots stay selected

An installed opt-in DLC depot (Dota 2 shape: depot 381450, `config.optionaldlc` 313250) is now treated
as enabled in Steam depot selection, so it stays in updates, verify and the update estimate. Fresh
installs still skip opt-in DLC.

## What changed

- `select.ts`: new `optInDlcOfInstalledDepots(appinfo, dlcInfos, installedDepotIds)`. It looks each
  digit-only installed id up in the base app's depots and every DLC app's own depots, and returns the
  `String()`-coerced `config.optionaldlc` values. Header and `enabledOptInDlc` JSDoc updated.
- `planModel.ts`: `DownloadSteamDepotsOpts.installedDepotIds?: ReadonlySet<string>`.
- `plan.ts`: `buildDepotRefs` unions `delta.oldGidByDepot` keys with `installedDepotIds`, computes the
  enabled DLC set, adds it to `selectOpts` as `enabledOptInDlc` only when non-empty, and logs one
  ids-only line (`buildDepotRefs: installed opt-in DLC <ids> enabled for app <appId>`).
- `verify.ts`: passes the ACF installed depot ids, so the opt-in depot is planned and keyed under the
  base app instead of the `dlcappid` fallback owner. Pinning loop and fallback unchanged.
- `updateEstimate.ts`: passes `installedDepotIds` from `ctx.oldGidByDepot` keys (not `delta`).
- Source todo closed to `completed/` with a Resolution section; the enable-path UX is a new pending
  todo (`severity: minor`, `platform: any`, `ready: human`); CONCERNS.md points at the new todo.

## Commits

- `38ade8ea5` fix(quick-261120-tbr): keep installed opt-in DLC depots selected in buildDepotRefs
- `d566c2770` fix(quick-261120-tbr): pass installed depot ids from verify and the update estimate
- `2111cec0b` docs(quick-261120-tbr): close the opt-in DLC update todo; file the enable-path follow-up

(`git rev-list --count` over the plan range reads 4: `bcae1c49a docs(83): capture phase context`, from
another session, landed between Task 1 and Task 2. `commits: 3` above is this plan's own.)

## RED then GREEN

- Task 1: before the source change, 6 of the new tests failed (the 4 select-helper tests, which could
  not import the helper, plus cmPlan update test (b) and the `installedDepotIds` test (c)). Fresh install
  (a) and base-only update (d) passed at that point, as they pin behaviour that must not change.
- Task 2: both new tests failed at HEAD. The verify test failed on the owner app: the key was requested
  as `(313250, 381450)` rather than `(12345, 381450)`. The estimate test failed on the missing field.

## Verification

- 12 buildDepotRefs-consuming suites: 12 passed, 244 tests (baseline 234).
- `-t 261120-tbr`: 8 passing in depot.test.ts + depot.cmPlan.test.ts, 2 in rustVerify + updateEstimate.
- `pnpm codecheck` exit 0 after both code tasks. Scoped `npx prettier --check` passes on all nine TS
  paths. The todo gate prints `OK: 10 pending todo(s)`.
- The D-02 census over select.ts stays green on the new helper.
- No commit touches install.ts, updateBridge.ts, retire.ts or acf.rs. `graphify update .` ran after the
  code changes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] ESLint `--max-warnings 0` is not clean on depot.cmPlan.test.ts at HEAD**
- **Found during:** Task 1
- **Issue:** The plan's `eslint --max-warnings 0` gate over the five Task 1 paths exits 1 on 10
  `@typescript-eslint/unbound-method` warnings in pre-existing lines of depot.cmPlan.test.ts (125, 132,
  399 onward). They exist independent of this change.
- **Fix:** Left the pre-existing warnings (out of scope). Made the new test wiring reuse `wire([])`
  rather than repeat `jest.mocked(steamUser.getClient)`, so this plan adds zero warnings. The other
  four files, and all four Task 2 files, are warning-free.
- **Files modified:** src/backend/storeManagers/steam/__tests__/depot.cmPlan.test.ts
- **Commit:** 38ade8ea5

**2. [Plan correction, informational] The source todo's verify claim was partly stale**
- verify.ts already pinned every ACF installed depot, so the depot never left the verify job. What
  changed after 261120-st3 was the key owner app (313250 via the `dlcappid` fallback instead of the base
  app). Recorded in the closed todo's Resolution section, as the plan directed.

## Known Stubs

None.

## Threat Flags

None. No new endpoint, auth path or schema; the new log line carries the appId and DLC appIds only
(asserted not to contain the SteamID64).

## Self-Check: PASSED

- FOUND: 38ade8ea5, d566c2770, 2111cec0b (ancestors of HEAD)
- FOUND: select.ts `optInDlcOfInstalledDepots`, planModel.ts `installedDepotIds`, plan.ts `enabledOptInDlc`
- FOUND: completed todo with `## Resolution`; new pending todo with `ready: human`
