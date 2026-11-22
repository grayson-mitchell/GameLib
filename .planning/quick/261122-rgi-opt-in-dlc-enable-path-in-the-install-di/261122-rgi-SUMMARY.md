---
phase: quick-261122-rgi
plan: 01
subsystem: steam-depot-download
tags: [steam, opt-in-dlc, install-dialog, install-tab, depot-retirement, ipc]
requires:
  - quick 261120-st3 (selectAllDepots skips opt-in DLC unless enabled)
  - quick 261120-tbr (installed opt-in DLC depots map to the enabled set)
provides:
  - steamOptInDlc install/update field and DownloadSteamDepotsOpts.chosenOptInDlc
  - getSteamOptInDlc IPC (owned opt-in DLC with name, size, installed state, who manages the copy)
  - install dialog "Optional content" ticks
  - Install tab "Optional content" switch rows (add to / remove from a bridge install)
  - decideRetirement disabledOptInDepots input (D-02)
affects:
  - src/backend/storeManagers/steam/depot (select, plan, planModel)
  - src/backend/storeManagers/steam/depotRust (retire, install, updateEstimate)
  - src/backend/storeManagers/steam (optInDlc, updateBridge, games, gameInstallDepot)
  - src/frontend SteamDialog and InstallTab
tech-stack:
  added: []
  patterns:
    - one optional opts field that REPLACES the installed-derived set (chosenOptInDlc)
    - listing reads anonymous PICS first, else an already-open session; never logs on
key-files:
  created:
    - src/backend/storeManagers/steam/optInDlc.ts
    - src/backend/storeManagers/steam/__tests__/optInDlc.test.ts
    - src/frontend/screens/Library/components/InstallModal/SteamDialog/optInDlc.ts
    - src/frontend/screens/Library/components/InstallModal/SteamDialog/__tests__/optInDlc.test.ts
    - src/frontend/screens/Game/GamePage/components/InstallTab/OptInDlcRows.tsx
  modified:
    - src/backend/storeManagers/steam/depot/select.ts
    - src/backend/storeManagers/steam/depot/plan.ts
    - src/backend/storeManagers/steam/depot/planModel.ts
    - src/backend/storeManagers/steam/depotRust/retire.ts
    - src/backend/storeManagers/steam/depotRust/install.ts
    - src/backend/storeManagers/steam/depotRust/updateEstimate.ts
    - src/backend/storeManagers/steam/updateBridge.ts
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/gameInstallDepot.ts
    - src/backend/downloadmanager/utils.ts
    - src/backend/sidecar/installFlowRegistration.ts
    - src/common/types.ts
    - src/common/types/steam.ts
    - src/common/types/game_manager.ts
    - src/common/types/ipc/install.ts
    - src/common/types/ipc/ipcSchemaSnapshot.json
    - src-tauri/src/ipc_contract.rs
    - src/preload/api/misc.ts
    - src/frontend/state/InstallGameModal.ts
    - src/frontend/screens/Library/components/InstallModal/SteamDialog/index.tsx
    - src/frontend/screens/Game/GamePage/components/InstallTab/index.tsx
    - public/locales/en/gamelib.json
    - meta/i18nCatalogPresenceBaseline.json
    - meta/knip-baseline.txt
decisions:
  - "chosenOptInDlc, when present, replaces the installed-derived enabled set; installed-derived minus chosen is the set the user switched off, and its installed depots become optInRetiredDepots (derived server-side only)"
  - "steamOptInDlc is a new field, not installDlcs: the queue cancel path calls removeFromQueue for every installDlcs entry, which would send stray 'done' updates for DLC appIds"
  - "Ownership is null (unknown) without an already-open session; rows with owned !== false are shown (D-05); an unowned DLC downloads nothing (selectDepots ownership gate) and the Install tab row reports the failure inline"
  - "GameLib changes optional content only on bridge installs (Phase 74, D-04); Steam-registered and bottled-Steam copies show read-only rows pointing at Steam"
  - "D-03: no new store, setting or ACF key; installed depots are the only record of enabled"
metrics:
  duration: ~70 min
  completed: 2026-11-22
  tasks: 3
  files: 40
status: complete
estimate_ref: low-confidence 190000 tokens
actuals:
  tokens: 30000
  tasks: 3
  commits: 5
plan_head_before: 0ca2441f68bea07943813e13dbe930da47d7a5c6
plan_head_after: 6d8ee9ca1
---

# Phase quick-261122-rgi Plan 01: Opt-in DLC enable path Summary

GameLib can now enable and disable an opt-in Steam DLC (a DLC whose depots carry `config.optionaldlc`, e.g. Dota 2 Workshop Tools 313250 / depot 381450): an "Optional content" tick per owned DLC in the Steam install dialog, an "Optional content" switch row per DLC on the game page's Install tab, and a retirement rule that deletes a switched-off DLC's depot files and drops them from the ACF.

## What shipped

**Task 1 (tracer): the choice travels from the IPC to depot selection.**
- `steamOptInDlc?: string[]` on `InstallArgs` and `UpdateParams`, the install/update zod schema, and the queue's fixed `install({...})` literal. `gameInstallDepot.ts` turns its digit-only ids into `chosenOptInDlc`; with none the `downloadSteamDepots` call is byte-identical to before.
- `DownloadSteamDepotsOpts.chosenOptInDlc` replaces the installed-derived set in `buildDepotRefs`.
- Pure `listOptInDlc` and `optInDepotsOfDlc` in `select.ts`; the D-02 source census stays green.
- `getSteamOptInDlc` IPC and `optInDlc.ts`: anonymous PICS first, else a session that is already open (`acquireOpenAuthenticated`, added to the Rule F allow-list); never `acquireAuthenticated`; any error is null; `installed` read from the bridge ACF or the Steam ACF; `manage` is `gamelib` (bridge), `steam`, or `not-installed`.
- IPC contract regenerated (`ipc_contract.rs`, `ipcSchemaSnapshot.json`); the census and schema tests updated.

**Task 2: install dialog ticks.** `SteamDialog` lists the owned (or ownership-unknown) opt-in DLC as unticked `ToggleSwitch`es with name and size, only when `gamelibDepotInstall` (`nativeInstallOn || gating.wineSection`). Ticked ids go through `installSteamGame`'s new 5th argument as `steamOptInDlc`; nothing ticked sends today's payload. All the SteamDialog source gates still hold (one `disabled=` term, Effect B is the first `let cancelled`, region order).

**Task 3: Install tab rows and retirement.**
- `decideRetirement` takes `disabledOptInDepots` and retires those depots with their listed owner even when still on the branch or the branch list is incomplete; a selected depot is still kept. `downloadSteamDepotsRust` passes `refs.optInRetiredDepots`; nothing changes in Rust.
- `estimateBridgeUpdate`, `updateBridgeGame` take the chosen set: the cached estimate is skipped, the set reaches the estimate and the delta job, and success notifies "Optional content updated".
- `SteamGame.update({ steamOptInDlc })` runs the change on a bridge install and returns an error ("Steam manages this copy's optional content") on any other copy; `updateQueueElement` forwards the field.
- `OptInDlcRows` (Install tab, before `IntegrationRows`): one `SwitchRow` per owned or unknown entry, checked = backend `installed`, busy "Adding..." / "Removing..." until the game has been seen busy and is idle again, then a re-read; a re-read that does not show the wanted state, or a rejected dispatch, shows the inline failure with Retry. Steam-managed copies show disabled rows with the Steam reason.

## Verification

- Task 1 suites: 9 suites, 1189 tests passed (baseline 1155, 8 suites). Task 2 suites: 3 suites, 160 passed (baseline 151). Task 3 suites: 7 suites, 161 passed (baseline 139); 27 `261122-rgi` tests in the Task 3 `-t` run.
- `pnpm codecheck` exit 0; `pnpm -s check:ipc-contract` up to date; `pnpm -s lint-translations:gamelib` 0 hard failures; `pnpm find-deadcode` PASS; `pnpm -s planning-gates` 12/12; prettier `--check` clean over every written non-ignored path.
- D-03 review: the diff adds no ACF key, no store and no setting.
- Not run: a live app check of the dialog ticks and Install tab rows (no GameLib app run in this execution).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Task 1's commit landed inside another session's docs commit**
- **Found during:** Task 1 commit
- **Issue:** a concurrent session committed (`3d4340bc0`, "docs(debug): resolve steampoll-watchdog-grandchild; close its macOS flake todo") between my `git add` and my `git commit`, and took the shared index with it. All 23 Task 1 paths are in that commit; my own commit then had nothing left. The code is committed and intact; only the message and the three unrelated `.planning/debug` and todo files in that commit are not mine.
- **Fix:** none possible without rewriting shared history. Tasks 2 and 3 used `git add <paths> && git commit -- <paths>` in a single call, and each landed as its own commit.
- **Commit:** 3d4340bc0

**2. [Rule 2 - Missing critical functionality] IPC port inventory**
- **Found during:** final `pnpm planning-gates`
- **Issue:** the new preload channel `getSteamOptInDlc` was in no bucket of `.planning/IPC-PORT-INVENTORY.md`, so the preload-surface gate failed.
- **Fix:** filed it in the "Already ported" bucket line, raised Totals 252 to 253 and 97 to 98, added a short section.
- **Files modified:** `.planning/IPC-PORT-INVENTORY.md`
- **Commit:** 6d8ee9ca1

**3. [Rule 1 - Bug] Type error on the update call**
- **Found during:** Task 3 `pnpm codecheck`
- **Issue:** `SteamGame.update`'s narrower param type made the union call in `updateQueueElement` fail ("Expected 0 arguments").
- **Fix:** typed the parameter as `Parameters<Game['update']>[0]`.
- **Files modified:** `src/backend/storeManagers/steam/games.ts`
- **Commit:** 93e6d145e

**4. [Rule 3 - Blocking] ESLint no-restricted-syntax on a store literal**
- **Issue:** `runner === 'steam'` in `OptInDlcRows` is banned outside `storeCapabilities`.
- **Fix:** `isStore(runner, 'steam')`.
- **Commit:** 93e6d145e

### Plan deviations of shape (no behaviour change)

- The `select.ts`, `plan.ts` and `depot.cmPlan.test.ts` edits the plan lists under Task 3 (`optInRetiredDepots`, `optInDepotsOfDlc`) were done in Task 1, because Task 1's tests needed them. Task 3 only added the retirement, bridge and UI halves.
- I wrote the `select.ts` helpers before running their tests, so that one RED step was not observed. The other tests were written first.
- `decideRetirement`'s `refs` Pick is unchanged: `disabledOptInDepots` is a separate argument, as the plan's key link states.
- `commits: 5` is counted by hand (`3d4340bc0`, `315beaacc`, `93e6d145e`, `97de48040`, `6d8ee9ca1`). `git rev-list --count plan_head_before..HEAD` reads 9 because four commits from other sessions interleaved (`c4dc3df27`, `8399fc6fc`, `4d1fc5294`, `5714cafea`).

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model. T-rgi-01..06 are mitigated as specified: zod `stringList` bounds plus digit-only filtering at `gameInstallDepot.ts` and `SteamGame.update`; `optInRetiredDepots` derived server-side only; `optInDlc.ts` has no `acquireAuthenticated(` (grep gate and Rule F test); ids-only log lines; every CM call bounded by `withTimeout`; numeric appId checks in the handler and the module.

## Self-Check: PASSED

- FOUND: src/backend/storeManagers/steam/optInDlc.ts, src/frontend/screens/Game/GamePage/components/InstallTab/OptInDlcRows.tsx, SteamDialog/optInDlc.ts, both optInDlc test files
- FOUND commits: 3d4340bc0, 315beaacc, 93e6d145e, 97de48040, 6d8ee9ca1 (all ancestors of HEAD)
- FOUND: .planning/todos/completed/2026-11-20-opt-in-dlc-has-no-enable-path-in-the-install-dialog.md (pending copy removed)
