---
phase: quick-261122-9sl
plan: 01
subsystem: steam
tags: [steam, macos, move-install, bridge-helper, steamclient, installapp]
requires:
  - spike 090 (steamclient-moveapp)
  - quick 261120-p2j (--steam-validateapp pattern)
provides:
  - "--steam-moveapp helper subcommand (run-guarded CanMoveApp/MoveApp, bounded wait)"
  - "requestSteamMoveApp + MOVE_WAIT_TIMEOUT_MS TS seam"
  - "moveRegisteredSteamGame (moveNative.ts) and real SteamGame.moveInstall routing"
  - "path-aware refreshInstallState (pathStale)"
  - "Move gate shown for installed Steam games on macOS"
affects:
  - src/backend/storeManagers/steam
  - native/steam-bridge/helper
  - src/frontend/screens/Game/GamePage/actions
tech-stack:
  added: []
  patterns:
    - "collaborator-injection (as validateNative.ts)"
    - "runtime IPC slot resolution with a neighbour run guard"
key-files:
  created:
    - src/backend/storeManagers/steam/moveNative.ts
    - src/backend/storeManagers/steam/__tests__/moveNative.test.ts
  modified:
    - native/steam-bridge/helper/gamelib_installapp.h
    - native/steam-bridge/helper/bridge_helper.c
    - src/backend/storeManagers/steam/steamInstallApp.ts
    - src/backend/storeManagers/steam/__tests__/steamInstallApp.test.ts
    - src/backend/storeManagers/steam/__tests__/steamInstallAppHelper.test.ts
    - src/backend/storeManagers/steam/library/refresh.ts
    - src/backend/storeManagers/steam/__tests__/library.refresh.test.ts
    - src/backend/storeManagers/steam/gameMaintenance.ts
    - src/frontend/screens/Game/GamePage/actions/installActionGates.ts
    - src/frontend/screens/Game/GamePage/actions/__tests__/installActionGates.test.ts
    - .planning/todos/pending/2026-11-20-implement-steam-move-install.md
key-decisions:
  - "Helper takes --library <absPath> and resolves Steam's folder index itself, rather than TS passing an index"
  - "Run guard is the whole spike-090 slot run 67-70 (CanMoveApp, MoveApp, GetMoveAppProgress, CancelMoveApp) by unique ID and exact position; CancelMoveApp is never called"
  - "CanMoveApp uses the build-verified (appId, uint32 *out) shape with a real stack pointer"
  - "refreshInstallState rewrites a changed install_path (pathStale), which also heals moves made inside Steam"
  - "Tests are jest, not vitest (the repo has no vitest)"
requirements-completed: []
duration: ~35 min
completed: 2026-11-22
status: complete
commits: 3
plan_head_before: 0588c8b19b6b101fc9d45c6df5b045c74bb7f016
plan_head_after: 4bbab9da458b9e356410c7c59fb098366d6304ff
actuals:
  tokens: 35000
  tasks: 3
  commits: 3
---

# Phase quick-261122-9sl Plan 01: Move install for Steam games Summary

Move for Steam-registered games on macOS now goes through the running Mac Steam's own
IClientAppManager::MoveApp via a slot-verified `--steam-moveapp` helper subcommand, with GameLib
refusing unsafe moves up front, holding "Moving..." until Steam's move and post-move verify settle,
and refreshing the cached install_path with no manual Refresh.

## Commits

Measured from the plan ledger: `0588c8b19..4bbab9da4` contains 5 commits, of which 3 are this
plan's. The other two (`730b2ca3a` docs(85-08), `84a958bb2` fix(84)) were made by other sessions
on the shared `main` tree while this ran and carry none of this plan's paths. `commits: 3` is the
count of this plan's own commits.

| Task | Commit | What |
| ---- | ------ | ---- |
| 1 (tracer) | `19efd5662` | `--steam-moveapp` helper subcommand, bridge_helper dispatch, `requestSteamMoveApp`, helper and seam tests |
| 2 | `13f3ff07b` | `moveNative.ts`, `moveInstall()` routing, `pathStale` in `refreshInstallState`, tests |
| 3 | `4bbab9da4` | Move gate for Steam on macOS, gate tests, todo progress note |

## Planner decisions recorded

- **`--library` instead of a folder index.** TS cannot compute Steam's index safely:
  `getSteamLibraries()` prepends `/usr/share/steam` and drops paths that do not exist, so its
  positions are not Steam's indices. The helper resolves the index from Steam's own
  `GetNumLibraryFolders`/`GetLibraryFolderPath` list with `gl_ia_folder_matches`, the same matching
  `--steam-installapp --library` does, and refuses `library-not-registered`.
- **67-70 run guard.** MoveApp (0x4780) is called only when CanMoveApp (0x68b2) is at slot-1,
  GetMoveAppProgress (0x5523) at +1 and CancelMoveApp (0x4309) at +2, each resolved by unique ID and
  re-checked by `gl_ia_slot_hi` at the exact position. GetAppLibraryFolder (0x166e) is accepted on a
  unique ID alone, the same trust level validate gives GetAppInstallState. CancelMoveApp is never
  called.
- **CanMoveApp out-pointer shape.** `uint32 (this, appId, uint32 *out)` with a real stack
  `uint32_t`, never NULL (spike 090's segfault came from the OpenSteamClient `(appId, folder)`
  shape). `out`'s value is ignored. All GetMoveAppProgress out-parameters are real stack variables
  of exactly 8/8/4 bytes.
- **pathStale.** `refreshInstallState` now persists and pushes when an installed entry's stored
  install_path differs from the ACF scan's, so a game moved in Steam itself also heals on the next
  focus, not only moves GameLib started.
- **Not gated** on the experimental InstallApp setting (matches validate and uninstall).
- **No progress percentage** reaches the frontend; "Moving..." is the readout, the helper logs
  progress to stderr only.
- **jest, not vitest.** The repo has no vitest and every existing steam test is jest.
- **changeInstallPath finding.** Set folder / "Wrong folder?" (`changeInstallPath`) is a separate
  action and a library no-op for Steam; its gate stays hidden and it was not touched. The only
  reason Move was unreachable for Steam was `move: conflicting(managedStore)` in
  `installActionGates.ts`.

## Deviations from Plan

None - plan executed as written. Small mechanical notes, none of which change behaviour:

- `moveInstall` logs through `logWarning` on a caught throw (the plan said to return an error
  without naming the log); the message returned to the handler is the error's message.
- The `moveInstall` unregistered-game error uses `getGameInfo().title` for the title.
- `moveNative.test.ts` reconcile mock returns `Promise.resolve()` rather than being `async` to
  satisfy `@typescript-eslint/require-await`.

## Verification

All automated blocks green:

- Task 1: `steamInstallAppHelper.test.ts`, `steamInstallApp.test.ts`, `fakeHomeIsolation.test.ts`
  pass (81 tests); `pnpm build-steam-bridge` compiles the arm64 and x86_64 helper with
  `-Werror=uninitialized`; `pnpm codecheck`, scoped prettier and eslint clean. The new compiled
  helper cases run under `createFakeHomeProfile()` in the existing darwin-only block (no new spawn
  site, no hand-rolled env).
- Task 2: moveNative (27), library.refresh, gamesModuleSurface, games, validateNative,
  installFlows, steamFocusRefreshWire and fakeHomeIsolation suites: 930 tests, all pass;
  codecheck, prettier, eslint clean (one pre-existing `syncSaves` require-await warning in
  `gameMaintenance.ts`, untouched).
- Task 3: `installActionGates` and `installTabSource` suites (52 tests) pass; codecheck, prettier,
  eslint and the todo frontmatter gate (`OK: 14 pending todo(s)`) pass.
- `graphify update .` run.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model. New surface is the helper subcommand and the renderer-chosen
destination, both covered by T-9sl-01/02/04/07 (registered-library match in TS and in the helper,
slot run guard, pathStale reconcile with a containment check, argv guards).

## Live gate (pending, human only)

Not run: no real Steam move was performed against the running Mac Steam client. The operator's
checklist is the Task 3 `<human-check>` in the plan (build helper, `pnpm build:sidecar`, restart with
`pnpm tauri:dev`, move WazHack 264160 to a second library, confirm "Moving..." with no Steam
window, new path without Refresh, the four refusals, and move it back). The todo
`.planning/todos/pending/2026-11-20-implement-steam-move-install.md` stays in `pending/` with
`ready: live-gate`; bridge-game Move, Steam Move off macOS, cross-volume moves and the untested
post-move error paths remain open there.

## Self-Check: PASSED

Created and modified files exist; commits `19efd5662`, `13f3ff07b`, `4bbab9da4` are ancestors of
HEAD. No file deletions in any task commit. Unrelated dirty and untracked files were never staged.
