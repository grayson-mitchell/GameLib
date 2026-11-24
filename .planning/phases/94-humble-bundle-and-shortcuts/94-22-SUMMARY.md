---
phase: 94-humble-bundle-and-shortcuts
plan: 22
subsystem: backend
tags: [rust, shortcuts, resolver, rustinvoke, d-04, d-24, d-27, sc4, guards, schedule]
status: complete

requires:
  - phase: 94-humble-bundle-and-shortcuts
    provides: 94-03 the survivor schedule; 94-11 resolveShortcutsExists and the shortcuts_exist channel; 94-16 get_icon and gog_local_icon; 94-18 the add and remove ops and the notice raising; 94-20 the three Steam ops and the ShortcutGame art fields
provides:
  - five rustInvoke channels RUST_SHORTCUTS_ADD, _REMOVE, _STEAM_ADD, _STEAM_REMOVE, _STEAM_IS_ADDED with zod args, the generated contract, rpc_shortcuts_* fns in the shell and router arms (RUST_SHORTCUTS_CHANNELS now equals the crate's six OPS)
  - src/backend/humbleshortcuts/shortcuts.ts: resolveShortcutsExists (moved), resolveAddShortcut, resolveRemoveShortcut, resolveAddToSteam, resolveRemoveFromSteam, resolveIsAddedToSteam and the store managers' addShortcuts, removeShortcuts, removeNonSteamGame, over one non-exported shortcutInputs helper
  - registerShortcutsResolvers installing all six renderer handles (shortcutsExists, addShortcut, removeShortcut, addToSteam, removeFromSteam, isAddedToSteam)
  - registerProcessShortcut in appShellFlowRegistration.ts (processShortcut relocated unchanged, D-27) and its IPC declaration moved to the app-shell domain
  - shortcuts_add with notify false rejecting a partial failure with the TS message
affects: [94-24, 94-30, 94-31]

requirements-completed: []

actuals:
  tokens: 60500
  tasks: 3
  commits: 3

plan_head_before: c7033dddde19c36868d3028c562e340333e5ed47
plan_head_after: 87dbb33332181860788e3f753b6f8029eca8fd9b

tech-stack:
  added: []
  patterns:
    - "a resolver that must project or reject on the op's answer cannot do it inside the resolver (the 86 shape rule allows only const declarations and one returned call), so the projection lives in the registered handle and the rejection in the Rust op"
    - "a caller-supplied lazy input (the GOG product icon) is decided in the one input helper from facts the crate also checks, so a failing or unneeded lookup never reaches the add"
    - "a deleted registration file's census row, floor and ledger entry are removed or lowered by exactly its own contribution, each edit carrying a Phase 94 plan 22 comment"

key-files:
  created:
    - src/backend/humbleshortcuts/shortcuts.ts
  modified:
    - src/backend/sidecar/shortcutsResolvers.ts
    - src/backend/sidecar/appShellFlowRegistration.ts
    - src/backend/sidecar/handlers.ts
    - src/backend/storeManagers/{steam,gog,legendary,nile,sideload}/games.ts
    - src/backend/storeManagers/sideload/library.ts
    - src/common/types/sidecarTransport.ts
    - src/common/types/ipc/{rustInvoke,appShell,shortcuts,channelSchemas,index}.ts
    - src-tauri/src/{shortcuts_dispatch,rust_dispatch,ipc_contract}.rs
    - src-tauri/crates/gamelib-shortcuts/src/lib.rs
    - src/backend/shortcuts/shortcuts/shortcuts.ts
  deleted:
    - src/backend/sidecar/shortcutsFlowRegistration.ts
    - src/backend/sidecar/__tests__/shortcutsFlows.test.ts

key-decisions:
  - "A resolver cannot answer `existsAfter` or reject a partial failure itself: the 86 shape rule (humbleShortcutsShimSchedule via checkShimShape) lets a resolver hold only const declarations and one returned requestRustInvoke call. So resolveAddShortcut and resolveRemoveShortcut resolve the op's outcome and the registered renderer handle (shortcutsResolvers.ts) answers its existsAfter; and the crate's shortcuts_add with notify false answers a partial failure with an Err carrying the TS's own `Could not write shortcuts: <file>: <error>` message (a store manager has no one to show a failure to), which the store-manager addShortcuts resolver therefore rejects with. notify true still resolves the outcome and raises the notice. Pinned in golden_add.rs."
  - "The GOG product-API icon is resolved lazily in the input helper, as the 94-16 and 94-18 caller contract requires: only for an op that draws an icon (Add to Steam on any platform, a desktop add off Windows or when Add to Steam is on), only when the install holds neither goggame-<id>.ico nor support/icon.png (the same two files the crate prefers), and an API failure is no icon, never a failed add. The two existsSync reads duplicate the crate's gog_local_icon because a TypeScript caller cannot call a Rust function."
  - "A GOG game's store executable is read only for the Windows desktop add, and a game with no metadata (the TS threw and wrote nothing) sends no executable, so the Rust icon chain starts at its install scan instead of the add failing."
  - "The 94-05 oracle drives shortcutsExistOnDisk, which lived in the deleted registration file. It moved, exported, to src/backend/shortcuts/shortcuts/shortcuts.ts (with a ShortcutsExistDeps type) and the oracle was repointed; 94-24 deletes it with that module. The goldens still compare against the TS predicate."
  - "processShortcut moved unchanged into appShellFlowRegistration.ts (registerProcessShortcut). That made it a channel of the app-shell file, so ipcDomainCensus required its declaration in the app-shell IPC domain: shortcutsSyncArgs was removed from ipc/shortcuts.ts and the channel declared in appShellSyncArgs with the same schema (the snapshot and generated contract are unchanged)."
  - "The store managers' unawaited sideload removals (removeShortcuts, removeNonSteamGame) now catch and log a rejection: the TS removal never rejected, a Rust one can (transport, shutdown), and an uninstall must not turn that into an unhandled rejection. The three awaiting uninstall paths (gog, legendary, nile) are unchanged."

patterns-established:
  - "a census footprint of replacing one registration with resolvers: flowRegistrationCensus row, invokeReturnValueSweep module and VOID_PARITY entry, runnerSliceRegistration module/channel list/counts, ipcDomainCensus FILES_FLOOR and owner-less allowlist, registrationOncePerBoot, electronReachLedger entry point, diPhaseGates latch list, OWNED_66_4 and its floor, infoPortComplete exemption, the jestMock ceilings"

requirements: [SVC-05]
duration: 190min
completed: 2026-11-24
---

# Phase 94 Plan 22: Shortcut callers switched to Rust Summary

**Every shortcut caller now reaches Rust through a scheduled resolver: the renderer's six channels and the five store managers call `humbleshortcuts/shortcuts.ts`, `processShortcut` lives in the app shell, and `shortcutsFlowRegistration.ts` is gone, so no shortcut file is written by TypeScript.**

## What was built

- **Task 1 (tracer).** `RUST_SHORTCUTS_ADD`, `_REMOVE`, `_STEAM_ADD`, `_STEAM_REMOVE` and `_STEAM_IS_ADDED` with strict zod args (one shared `shortcutGame`/`shortcutSettings` shape), the regenerated `ipc_contract.rs`, five `rpc_shortcuts_*` fns that decode through the generated structs and call `dispatch_sync` with the literal op name, and the router arms. `shortcutInputs` builds `{ game, settings }` from the game info, the settings and the lazy GOG lookups; `resolveShortcutsExists` moved into the same file and `resolveAddShortcut` was added; `registerShortcutsResolvers` registers `addShortcut` (answering `existsAfter`) and the old `addShortcut` handle was deleted in the same commit.
- **Task 2.** The other four renderer resolvers and the three store-manager resolvers; every store manager and `sideload/library.ts` imports `backend/humbleshortcuts/shortcuts`; `registerProcessShortcut` in `appShellFlowRegistration.ts`, called from `handlers.ts` where the shortcuts registration was; `shortcutsFlowRegistration.ts` and `shortcutsFlows.test.ts` deleted; the store-manager tests that mocked the old module repointed.
- **Task 3.** The schedule rows (nine resolvers `deletedBy: 92`, the registrar and `registerProcessShortcut` as relocated rows, 92 and 98) landed in the Task 2 commit with the resolvers they cover, because the 94-03 rule and the schedule's own set-equality gate require a resolver and its row to share a commit. The Task 3 commit is the remaining acceptance grep (the once-per-boot guard's comment).

## Evidence

- Shell: `cargo test --bin gamelib-shell shortcuts` 21 passed (the three new tests: every write op answers `not-ready` before install, the generated args decode what the resolvers send and refuse drift, and an add then exists then remove round trip on a fake home). Crate: `cargo test -p gamelib-shortcuts` all green including the new `the_dispatch_rejects_a_failed_write_for_a_store_manager_and_resolves_it_for_the_renderer`; `cargo clippy -p gamelib-shortcuts --all-targets -D warnings` and `cargo fmt -p gamelib-shortcuts --check` clean; `rustfmt --check` clean on `shortcuts_dispatch.rs` and `rust_dispatch.rs`; no clippy finding in either shell file.
- TS: `shortcutsResolvers.test.ts` 31 tests (the exact args sent for a sideload, Steam, DLC and title-less game; the GOG lazy icon on Linux with and without local icons, on macOS with a failing or empty API, on Windows with the executable and with a throwing executable; the six handles; the F-34.5-G6-08 frame discriminator and the main.rs `unwrap_or(Value::Null)` pin carried over); `appShellFlows.test.ts` gained the relocated hotkey cases (ctrl+k/j/l, ctrl+q, the degraded and unknown no-ops, a rejecting `handleExit`).
- Gates: `pnpm check:ipc-contract` up to date, `pnpm codecheck` clean, `pnpm planning-gates` 12/12, `pnpm find-deadcode` PASS (310 baselined, unchanged), `pnpm backend-di-ceilings` PASS (the gog import suite's ceiling lowered 18 to 17 for the merged mock, the `shortcutsFlows` entry removed), prettier clean over every file written, eslint 0 errors. Passing: `humbleShortcutsShimSchedule` (36), `shortcutsChannelParity`, `tauriShellSource`, `rustInvokeSchemas`, `ipcDomainCensus`, `ipcSchemaCoverage`, `rendererAllowList`, `flowRegistrationCensus`, `invokeReturnValueSweep`, `runnerSliceRegistration`, `registrationOncePerBoot`, `electronReachLedger`, `diPhaseGates`, `testContainment`, `infoPortComplete`, `humblePortComplete`, `shortcutsPortComplete`, `fakeHomeIsolation`, the 94-05 shortcut oracle suites (13 suites, 729 tests), and the gog and sideload `uninstallSafety` suites.

## Counts that moved (measured after the change)

| Pin | Before | After |
|---|---|---|
| flowRegistrationCensus `shortcutsFlowRegistration.ts` | 5 invoke, 1 send | row removed |
| flowRegistrationCensus `appShellFlowRegistration.ts` | 6 invoke, 13 send | 6, 14 (`processShortcut`); the file joins NO_COUNT_CLAIM (its function docstring states its own 19) |
| invokeReturnValueSweep modules / total / VOID_PARITY | 3 / 26 / 3 | 2 / 21 / 2 |
| runnerSliceRegistration handle/listen, per-module, total | 40/2, 11/6/11/8/6, 42 | 35/1, 11/11/8/6, 36 |
| ipcDomainCensus FILES_FLOOR and scan | 19 | 18 |
| ipcDomainCensus owner-less allowlist | 72 | 77 (five shortcut Async channels) |
| tauriShellSource router arms | 190 | 195 |
| rustInvokeSchemas / `RUST_INVOKE_CHANNELS` | 190 | 195 |
| diPhaseGates OWNED_66_4 and its floor | 54 | 53 (also leaves the 66.4-19 latch list) |
| `66.1 flow registrations` floor | 22 | 22 (the measured count stays at or above it) |
| infoPortComplete INERT_DEPS_EXEMPT | 2 files | 1 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug in the plan] A resolver cannot project `existsAfter` or reject**
- **Found during:** Task 1 (reading checkShimShape before writing the resolver)
- **Issue:** the plan has `resolveAddShortcut` answering `existsAfter` and the store managers' resolvers rejecting on a partial failure, but the schedule's resolver shape check allows only `const` declarations and one returned `requestRustInvoke` call (a `.then` or a property read on the result fails it).
- **Fix:** the registered renderer handle projects `existsAfter`; for the rejection the crate's `shortcuts_add` with `notify: false` now answers a partial failure with an `Err` carrying `AddOutcome::message()`, the TS's own text. `notify: true` is unchanged.
- **Files modified:** `gamelib-shortcuts/src/lib.rs`, `tests/golden_add.rs`, `shortcutsResolvers.ts`, `humbleshortcuts/shortcuts.ts`
- **Commit:** 7c0b1aeca

**2. [Rule 3 - Blocking] `shortcutsExistOnDisk` and the 94-05 oracle**
- **Found during:** Task 2. The oracle imports the predicate from the file this plan deletes.
- **Fix:** the predicate moved, exported, to `src/backend/shortcuts/shortcuts/shortcuts.ts`; the oracle was repointed. Two now-unused exports (`windowsDesktopDir`, `shortcutPathPresent`) stopped being exported so `find-deadcode` stays green. 94-24 deletes all of it.
- **Commit:** 9c3581e4c

**3. [Rule 3 - Blocking] `processShortcut` is declared in the shortcuts IPC domain**
- **Found during:** Task 2. `ipcDomainCensus` (a) requires every channel a registration file registers to be declared in that file's domain.
- **Fix:** `shortcutsSyncArgs` and `ShortcutsSync` removed, the channel declared in `appShellSyncArgs` (and its fixture moved to `appShell.test.ts`); the generated snapshot and contract are byte-identical.
- **Files modified:** `src/common/types/ipc/{appShell,shortcuts,channelSchemas,index}.ts`, `ipcSchemas/{appShell,eosOverlayShortcuts}.test.ts`

**4. [Rule 3 - Blocking] Store-manager tests that mocked or counted the old modules**
- twelve store-manager tests repointed their `jest.mock` from `shortcuts/shortcuts/shortcuts` to `humbleshortcuts/shortcuts` (the gog import suite folds its two mocks into one, ceiling 18 to 17); the gog and sideload `uninstallSafety` suites now answer or expect the `shortcuts_remove` and `shortcuts_steam_remove` channels an uninstall asks Rust for.

**5. [Rule 2 - Missing critical] Robustness and logging**
- `storeCapabilities[runner]` is read defensively (the library's `{}` sentinel has no runner); the two unawaited sideload removals log a rejection instead of leaving it unhandled.

**6. Files outside `files_modified`**
- `src/common/types/ipc/rustInvoke.ts` (the args schema the generator requires for each channel), `ipcDomainCensus.test.ts`, `rustInvokeSchemas.test.ts`, `tauriShellSource.test.ts`, `appShellFlows.test.ts` (the `processShortcut` cases, instead of `shortcutsResolvers.test.ts`, because importing the heavy `appShellFlowRegistration` graph there would break that suite's structural-containment classification), `ipcSchemas/*.test.ts`, the twelve store-manager tests above and `meta/backendDiCeilings/storeManagers.gog.json`.
- The plan's second acceptance for `testContainment` (`'shortcutsResolvers.test.ts'` classified) was already satisfied by 94-11; only its paragraph was reworded.
- `diPhaseGates`'s `66.1 flow registrations` floor needed no change (it stays at or below the measured count).

### Behaviour that changed (named, not hidden)

- A renderer `addShortcut` or `removeShortcut` for a game with no title (the `{}` sentinel) now rejects from Rust (`shortcuts_add:bad-args`) with no notification; the TS caught the throw, showed the error toast and answered the disk state.
- A renderer `addShortcut` whose Rust call itself fails (not ready, shutdown) rejects to the renderer; a partial write still resolves with `existsAfter` and the notice, as the TS did.
- The TS `addShortcut` darwin `GAMELIB_SHELL_EXE` pins and the four `261012-ca6` and `261027-c4g` add-handler cases were deleted with the handler; their properties are carried by `golden_add.rs` and `notice.rs`. A comment in the deleted suite's place names where.

## Windows-only failures (not introduced here)

- `src/backend/sidecar/__tests__`: `appRootResolution`, `bootstrap` (healthy arm), `devSecretVault`, `installFlows`, `structuralContainment` fail on this host as the baseline note records (94-11 listed them); `humble/__tests__/oracle/library.oracle.test.ts` (stateful flows) also fails and involves no file this plan touched.
- `src/backend/storeManagers`: path-separator and Wine-bottle suites (`library.installedMap`, `bottle`, `bridgeBottle`, `overlay*`, `adoptionStatus`, `gogImportGame` comet cases, ...) and `src/backend/__tests__` (`cache`, `utils`, `moveOnUnix`, `protocol`, ...) fail on this host; none of their failing cases involves a shortcut. The shortcutsFlows containment case that was red here went away with the suite.
- `cargo clippy` has pre-existing findings in untouched shell files (`single_instance.rs` and others); none in `shortcuts_dispatch.rs` or `rust_dispatch.rs`.

## Known Stubs

None.

## Threat Flags

None. T-94-41 holds: the zod schemas in `common/types/ipc/shortcuts.ts` still validate the renderer's arguments at the sidecar, and the new rustInvoke schemas are strict objects the shell re-decodes (`deny_unknown_fields` in the crate). T-94-42: the inputs come from the library managers' game info, never from the renderer, and the crate sanitises the title before any path. T-94-63: each guard edit removes only the deleted file's own entries, every floor moves by the measured deletion with a comment naming 94-22, the reach ledger's visited-files floor is untouched, and the acceptance greps pin each removal.

## Self-Check: PASSED

- src/backend/humbleshortcuts/shortcuts.ts: present; src/backend/sidecar/shortcutsFlowRegistration.ts and shortcutsFlows.test.ts: absent
- commits 7c0b1aeca, 9c3581e4c and 87dbb3333 present on gsd/phase-94-humble-bundle-and-shortcuts
- all acceptance greps of Tasks 1 to 3 hold (the `shortcutsFlowRegistration.ts` `'addShortcut'` count is 0 because the file is gone)
