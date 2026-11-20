---
phase: 82-guardrails-hygiene-and-shared-safety-primitives
plan: 07
subsystem: infra
tags: [safety, uninstall, prefix, gog, sideload, reset, fail-closed, refusal-notice, source-gate]

requires:
  - phase: 82-guardrails-hygiene-and-shared-safety-primitives
    provides: "82-03 gamelib-safety crate; 82-05 rustSafety adapter, knownInstalls, protectedRoots, fakeSafetyRustInvoke, rawRecursiveDeletes; 82-06 pushRemovalRefusal and the removalRefusedNotice toast"
provides:
  - "uninstallGameCallback D-14 pre-flight: the prefix is checked (checkRemoval) before game.uninstall; a non-yes verdict pushes the refusal, sends done and deletes nothing"
  - "removePrefix is awaited and goes through guardedRemoveTree (kind prefix, settings-derived protected roots, cross-store known installs); the drive_c/pfx and default/shared-prefix rules now live only in gamelib-safety"
  - "GOG uninstall guard: install + support folders checked before the installed list is touched and before unins000.exe, deleted by one guardedRemoveTree"
  - "Sideload delete-files guard (D-22 sideload-folder) checked before the library entry is touched"
  - "resetHeroic guarded: both app-data targets checked under the appFolder trust root before either is deleted; no relaunch/quit on refusal; relaunch timer unref'd"
  - "src/backend/safety/__tests__/nonSteamDeleteGate.test.ts: raw-recursive-delete source gate over the four guarded files (floor 4, one named allowlist entry, empty-input case)"
  - "Todo for the appName path-injection on removeFixFile/removeSettingsAndLogs (ready: code)"
affects: [82-08, 82-09, 82-11, 83-gamelib-core]

actuals:
  tokens: 12700
  tasks: 3
  commits: 3
plan_head_before: 5d02c2967a930becada02058d352b7babe494ae6
plan_head_after: b67ae3b27072d0094426086e1c89b5715deacaba

tech-stack:
  added: []
  patterns:
    - "Check-then-mutate ordering at every guard site: the verdict is read before a library/installed store, a settings file or a status is written, so a refusal leaves nothing to undo and a second click re-runs the same checks"
    - "A refusal from a check that ran before any delete is outcome refused; any non-removed outcome after a delete was attempted (GOG after unins000.exe, sideload and prefix after the uninstall) is outcome failed"
    - "Guard-site tests drive the real GOGGame / SideloadGame / uninstallGameCallback / resetHeroic against real tmp folders with fakeSafetyRustInvoke; the only jest.mock use is the pre-existing mocks of the two suites that already had them"

key-files:
  created:
    - src/backend/storeManagers/gog/__tests__/uninstallSafety.test.ts
    - src/backend/storeManagers/sideload/__tests__/uninstallSafety.test.ts
    - src/backend/safety/__tests__/nonSteamDeleteGate.test.ts
    - .planning/todos/pending/2026-11-20-uninstall-file-deletes-trust-renderer-appname.md
  modified:
    - src/backend/utils/uninstaller.ts
    - src/backend/utils/__tests__/uninstaller.test.ts
    - src/backend/sidecar/installFlowRegistration.ts
    - src/backend/macArch/recovery.ts
    - src/backend/storeManagers/gog/games.ts
    - src/backend/storeManagers/sideload/games.ts
    - src/backend/utils.ts
    - src/backend/sidecar/shellFilesFlowRegistration.ts
    - src/backend/sidecar/handlers.ts
    - src/backend/sidecar/__tests__/shellFilesFlows.test.ts

key-decisions:
  - "Sideload deletes the folder first and writes the library entry only on success (the plan listed write-then-delete): a failed or unconfirmed delete leaves the entry in place so a retry works, which is what D-13 asks of every guard site"
  - "GOG works on a copy of the installed list and only replaces the store after both folders are confirmed removed, so a failed delete after unins000.exe cannot leave the in-memory list shorter than the persisted one"
  - "An unreadable game settings file means no prefix path is known, so the prefix step is skipped (nothing is deleted); the uninstall itself is not refused for it"
  - "removePrefix is no longer exported: sideload was its only outside caller and knip's ratchet rejects an export with no consumer"
  - "The existing folderLooksShared copy ('holds other programs ... may be shared with other software') is kept as the answer to the carried exec-bit over-refusal; no i18n key was added, so no catalog baseline changed"

patterns-established:
  - "A guard site builds its SafetyRequest from collectKnownInstalls(deps, self), knownInstallKey and protectedRootsFor(deps), and reports through pushRemovalRefusal with reason from firstBlockingItem and otherTitle from titleForKnownKey"

requirements-completed: [FND-02]

coverage:
  - id: D1
    description: "Uninstalling an Epic/GOG/Amazon/sideload game checks the Wine prefix with Rust before anything is uninstalled; a rejected or non-yes check leaves the game and prefix alone, shows the refusal and returns the tile to done"
    requirement: FND-02
    verification:
      - kind: unit
        ref: "src/backend/utils/__tests__/uninstaller.test.ts 'rejects when the check rejects', nested-known-install, idempotency, legendary/nile each"
        status: pass
    human_judgment: false
  - id: D2
    description: "A prefix delete that fails or is refused after the game was uninstalled is reported (remove-prefix, failed or refused) while the success notification and done still fire; the delete is awaited"
    requirement: FND-02
    verification:
      - kind: unit
        ref: "uninstaller.test.ts 'a prefix delete refused after the uninstall' and 'a prefix delete that rejects after the uninstall reports failed'"
        status: pass
    human_judgment: false
  - id: D3
    description: "GOG checks install and support folders before the installed list is spliced and before unins000.exe runs; a refusal changes nothing; another store's install inside the folder is refused naming that game"
    requirement: FND-02
    verification:
      - kind: unit
        ref: "src/backend/storeManagers/gog/__tests__/uninstallSafety.test.ts (6 cases, unins000 present and counted)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Sideload delete-files refuses unless the guard says yes, leaving folder and library entry intact; a dedicated folder is removed"
    requirement: FND-02
    verification:
      - kind: unit
        ref: "src/backend/storeManagers/sideload/__tests__/uninstallSafety.test.ts (7 cases)"
        status: pass
    human_judgment: false
  - id: D5
    description: "resetHeroic deletes nothing and never relaunches unless both targets pass; a refusal pushes a reset notice and can be retried"
    requirement: FND-02
    verification:
      - kind: unit
        ref: "src/backend/sidecar/__tests__/shellFilesFlows.test.ts 'rejects: a failed safety check keeps both targets' and the yes-path case"
        status: pass
    human_judgment: false
  - id: D6
    description: "No raw recursive delete remains in uninstaller.ts, gog/games.ts, sideload/games.ts or utils.ts except the named removeFolder"
    requirement: FND-02
    verification:
      - kind: unit
        ref: "src/backend/safety/__tests__/nonSteamDeleteGate.test.ts"
        status: pass
    human_judgment: false
  - id: D7
    description: "A live sidecar-to-shell round trip through a guarded call site (a real Uninstall or Reset in the running app, with the real Rust crate answering)"
    requirement: FND-02
    verification: []
    human_judgment: true
    rationale: "Not exercised. No app was launched in this run; every test answers the two safety channels with fakeSafetyRustInvoke. The in-process shell arm and the crate are covered by 82-03/82-05 tests, so what remains unproven is the sidecar's requestRustInvoke reaching the arm from these call sites in a running build."

duration: 75min
completed: 2026-11-20
status: complete
---

# Phase 82 Plan 07: Guard adoption on the non-Steam uninstall and reset path Summary

**Every GameLib-side recursive delete on the non-Steam uninstall path (the Wine prefix for Epic, GOG, Amazon and sideload, GOG's install and support folders, sideload's delete-files folder) and in store reset now asks the Rust guard first, refuses with a visible notice on anything but yes, and mutates no library or installed store until it has passed.**

## Performance

- **Duration:** ~75 min
- **Completed:** 2026-11-20
- **Tasks:** 3 (tracer, auto, auto)
- **Files modified:** 14 (4 created, 10 modified)

## Accomplishments

- **Prefix pre-flight and guarded delete (D-14, D-11).** `uninstallGameCallback` reads the game's prefix and runs `checkRemoval` before `game.uninstall`; a refusal pushes an `uninstall` notice, sends the terminal `done` and returns. After a successful uninstall `removePrefix` is awaited and goes through `guardedRemoveTree`; a non-removed outcome pushes `remove-prefix` and the success notification and `done` still fire. The string-equality and `drive_c`/`pfx` checks are deleted from TypeScript (D-06). `UninstallerDeps` gained `requestRustInvoke`, threaded through `installFlowRegistration.ts` and `macArch/recovery.ts`.
- **GOG (D-10, D-16).** The installed entry is found without touching the list, install and support folders (support under the `gogSupportPath` trust root) are checked first, and `unins000.exe` has not run if that fails. After the uninstaller one `guardedRemoveTree` removes both; a non-removed outcome is reported as `failed`, never "nothing was deleted", and the installed store is not written so retry is possible.
- **Sideload (D-22).** The delete-files folder is a `sideload-folder` target with the game's executable; the check runs before the library entry is touched. The internal un-awaited prefix call is gone; `uninstallGameCallback` already removes the sideload prefix through the guard (`storeCapabilities.sideload.installHandOffToClient` is `false`, via `NOT_STEAM`).
- **resetHeroic (D-11).** Async, two `app-data` targets under the `appFolder` trust root in one guarded call; a refusal pushes a `reset` notice and returns before the timer; on success the 1 s relaunch timer is `unref`'d. `registerShellFilesFlows` and `handlers.ts` thread `config`, `requestRustInvoke` and the extra path fields; the listener routes errors to `logSendFailure`. `clearCache` is untouched.
- **Source gate.** `nonSteamDeleteGate.test.ts` scans the four files (floor 4) and expects exactly one offender, `removeFolder` in `utils.ts`, matched by enclosing function with its reason, plus a staleness assertion, an empty-input throw and an injected-delete anti-vacuity case.
- **Todo filed** for `removeFixFile`/`removeSettingsAndLogs` joining the renderer-supplied `appName` into a path (`severity: medium`, `platform: any`, `ready: code`).

## Task Commits

1. **Task 1 (tracer): uninstall pre-flight and guarded prefix removal** - `3bfcdf55a` (feat)
2. **Task 2: GOG install/support folders and sideload delete-files behind the guard** - `1ea267490` (feat)
3. **Task 3: resetHeroic guarded, non-Steam raw-delete gate** - `b67ae3b27` (feat)

Tracer gate: Task 1's verify chain (uninstaller, recovery and installFlows jest, `codecheck`, `backend-di-ceilings`, `planning-gates` todo gate, prettier file-info and check) passed before expansion. The task has no `gate="blocking-human"`. Tracer verified end-to-end, expanded.

`commits: 3` is the measured `rev-list` count over `plan_head_before..HEAD`; all three are this plan's.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Sideload ordering: delete first, library entry after**
- **Found during:** Task 2
- **Issue:** the plan said "write libraryStore, then guardedRemoveTree". If the delete then failed, the entry was already gone and the user could not retry from the tile.
- **Fix:** guard, delete, then write the library entry; a failed delete returns `{ failed: true }` with the entry intact. Tested (`a delete that rejects after the check reports failed and keeps the library entry`).
- **Files modified:** `src/backend/storeManagers/sideload/games.ts`
- **Commit:** `1ea267490`

**2. [Rule 1 - Bug] GOG splice mutated the store's array before the outcome was known**
- **Found during:** Task 2
- **Issue:** `array.splice` on the array returned by `installedGamesStore.get` can mutate a shared reference even when nothing is persisted, so a failed delete could leave the in-memory list shorter than the stored one.
- **Fix:** splice a copy; the store is set only after both folders are confirmed removed.
- **Commit:** `1ea267490`

**3. [Rule 3 - Blocking] Existing tests assumed the old call shape**
- **Issue:** `uninstaller.test.ts` deps had no `config`/`requestRustInvoke`, its managers had no `getListOfGames` (the known-installs read treats a manager that throws as `unknown`), and one failed-uninstall case asserted `getSettings` was never called (the pre-flight now reads it once). `shellFilesFlows.test.ts` stubbed a legendary manager without `getListOfGames` and relied on a real unguarded delete.
- **Fix:** default `yes` fake transport and `getListOfGames` on the doubles; the failed-uninstall case now asserts the prefix survives instead; the reset case answers the safety channels with the fake and a plain-function `getListOfGames` (not a `jest.fn`, which `resetMocks` would wipe).
- **Commits:** `3bfcdf55a`, `b67ae3b27`

**4. [Rule 3 - Blocking] knip: `removePrefix` export lost its consumer**
- **Fix:** `removePrefix` is module-private. It still returns the guard's result for the callback and is exercised through `uninstallGameCallback`.
- **Commit:** `b67ae3b27`

**5. [Rule 3 - Blocking] Lint error and warnings from the change**
- Unused `rmSync` import in `utils.ts` (error) removed; `async` arrow doubles in the new tests rewritten to return `Promise.resolve` so no new `require-await` warning enters the lint ceiling.

**6. [Rule 2 - Missing critical, informational] Unreadable settings skip the prefix instead of throwing**
- `readWinePrefix` catches a settings read error and returns no prefix. Before this plan an unawaited `removePrefix` rejection would have been unhandled; now it is awaited, and a throw there would have escaped `uninstallGameCallback` after the game was already gone.

---

**Total deviations:** 6 (2 bug-class design improvements, 3 blocking, 1 missing-critical)
**Impact on plan:** none on scope; deviation 1 changes the order the plan wrote but meets its stated truth (the library entry is removed only after the guard passes) and D-13 better.

## Issues Encountered

- `moduleStateCensus.test.ts` is red on `X86_NULL_OBJECT_VERSION_SET` at `shimCoverage.ts:515` (the known pre-existing failure); none of this plan's files appear in its output. `diPhaseGates` is the other known red and was not touched.
- `pnpm planning-gates` reports 11/12 passing. The failure is `state-sdk-field-anchor-gate.py` on `STATE.md` ("field 'Progress': expected 1 match, found 0"), which is not a file this plan changed before the STATE update below; `todo-frontmatter-gate.py` passes for the new todo.
- GOG and sideload tests load the real `games.ts` modules, so they need the logger's writer: they call `initHeadless()` (the jest-contained fake HOME holds the file) instead of mocking `backend/logger`. `jestMock` stayed at 1865 in `backend-di-ceilings`.
- The sideload delete-files branch has no UI caller (the only caller of `uninstall`, `uninstallGameCallback`, never passes `deleteFiles`), so D-22 guards a branch that is currently unreachable from the app. It is tested directly.
- The verdicts themselves (a second `.exe`, another known install, a protected root) are decided in `gamelib-safety` and tested there (82-03); these suites inject verdicts through the fake and prove the call sites' behaviour on each, so a `folder-looks-shared` test here shows the refusal handling, not the heuristic.

## Carried Rust-side behaviour

The D-22 exec-bit rule can refuse a native Linux sideload folder that holds helper scripts or libraries. The refusal reaches the user as `folder-looks-shared`: "The game's folder also holds other programs, so it may be shared with other software." That wording already names the situation in plain terms, so no copy or catalog key was added here (no baseline change). Because no UI path passes `deleteFiles` today, nobody can hit the over-refusal yet.

## Known Stubs

None.

## Threat Flags

None. Every new call goes over the two safety channels already covered by T-82-13..16; T-82-20 to T-82-23 are mitigated and tested, and T-82-24 (appName join) is accepted and filed as a todo.

## Next Phase Readiness

- Plans 82-08 and 82-09 can reuse the request shape used here (`collectKnownInstalls` + `knownInstallKey` + `protectedRootsFor`, reasons through `firstBlockingItem`, other game through `titleForKnownKey`) and add their sites to a per-plan raw-delete gate the same way.
- The live sidecar-to-shell round trip is still owed; this plan is the first guarded call site and was not run against a running app.

## Self-Check: PASSED

Created files exist on disk, commits `3bfcdf55a`, `1ea267490` and `b67ae3b27` are ancestors of HEAD, and the chain was re-run green: jest over the three new suites, `uninstaller`, `shellFilesFlows`, `ipcSchemas/shellFiles`, `installFlows`, `recovery`, `library`, `gogImportGame`, and the 153 suites under `sidecar`, `storeManagers/gog`, `storeManagers/sideload`, `macArch`, `utils` and `safety` (3785 passed, 2 skipped); `pnpm codecheck`, `pnpm backend-di-ceilings` (jestMock 1865), `pnpm find-deadcode`, `todo-frontmatter-gate`, prettier check over every TS path written. Acceptance greps: `rmSync(winePrefix` 0, `checkRemoval` in uninstaller.ts 3, `await removePrefix` 1, `rmSync(object.install_path` 0, `rmSync(supportPath` 0, `rmSync(dirname(executable)` 0, `removePrefix(` in sideload/games.ts 0, `checkRemoval(` at gog/games.ts line 1176 before `array.splice` at 1193, `rmSync(folder` in utils.ts 0, `async function resetHeroic` 1, `unref?.()` 1.

---
*Phase: 82-guardrails-hygiene-and-shared-safety-primitives*
*Completed: 2026-11-20*
