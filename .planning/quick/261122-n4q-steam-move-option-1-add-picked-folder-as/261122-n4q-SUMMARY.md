---
phase: quick-261122-n4q
plan: 01
subsystem: steam-move-install
tags: [steam, macos, move, addlibraryfolder, bridge-helper, steamclient, spike-094]
requires:
  - quick 261122-9sl (Steam Move via MoveApp)
  - spike 094 (AddLibraryFolder, folder gaps, post-move verify)
provides:
  - "--steam-moveapp --add-library: register a picked non-library folder with AddLibraryFolder, then MoveApp to the returned index"
  - "gap-tolerant gl_ia_list_folders / gl_ia_find_folder (fixes --steam-installapp --library and --steam-moveapp after a library removal)"
  - "one-shot post-move StartValidatingApp nudge and a not-settled / verify-pending result"
  - "host-compiled harness for the helper's pure folder, nesting and wait logic"
affects:
  - native/steam-bridge/helper/gamelib_installapp.h
  - src/backend/storeManagers/steam/steamInstallApp.ts
  - src/backend/storeManagers/steam/moveNative.ts
tech-stack:
  added: []
  patterns:
    - "pure state machine (gl_ia_move_wait_step) driven by a host-compiled arm64 harness with a fake vtable and synthetic clock"
key-files:
  created:
    - src/backend/storeManagers/steam/__tests__/fixtures/installapp_harness.c
    - src/backend/storeManagers/steam/__tests__/installAppHarness.test.ts
  modified:
    - native/steam-bridge/helper/gamelib_installapp.h
    - src/backend/storeManagers/steam/steamInstallApp.ts
    - src/backend/storeManagers/steam/moveNative.ts
    - src/backend/storeManagers/steam/__tests__/steamInstallApp.test.ts
    - src/backend/storeManagers/steam/__tests__/steamInstallAppHelper.test.ts
    - src/backend/storeManagers/steam/__tests__/moveNative.test.ts
    - .planning/todos/pending/2026-11-20-implement-steam-move-install.md
decisions:
  - "One helper run with an --add-library flag, not a separate subcommand; Add's return value flows straight into MoveApp"
  - "AddLibraryFolder only when the picked folder matches none of Steam's live folders"
  - "Order in the helper: refusals, read-only CanMoveApp, Add, relist check, MoveApp"
  - "TS owns every user-facing refusal; the helper re-checks existence, length and nesting against Steam's live list"
  - "Non-empty picked folders are allowed; only an existing copy (install folder or appmanifest) is refused"
  - "GameLib never creates the folder"
  - "Paths of 255 bytes or more are refused (GL_IA_ADD_PATH_MAX 254, drift-tested)"
  - "Gap rule: an empty path is skipped and indices are kept; a non-absolute or non-directory entry still fails the lookup"
  - "Nudge timing 5 s, not-settled after 60 s more; the 60 s fallback applies only with Files Missing clear"
  - "No pre-move 'the picked folder becomes the library root' note (needs i18n strings); flagged"
metrics:
  tasks: 3
  duration: "single session"
  completed: 2026-11-22
status: complete
commits: 3
plan_head_before: a68c019df67cd930747b8e976485e60aa33aba76
plan_head_after: 1f9f0cd2c
actuals:
  tokens: 13100
  tasks: 3
  commits: 3
---

# Quick 261122-n4q: Steam Move option 1 (add the picked folder as a library) Summary

Picking a folder that is not a Steam library in GameLib's Move picker now registers it with
`IClientAppManager::AddLibraryFolder` and moves the game to the index that call returned, landing it in
`<picked>/steamapps/common/<installdir>`. The shipped folder-gap bug in `gl_ia_list_folders` is fixed,
a stalled post-move verify is nudged once, and success is never reported while Files Missing is set.

## Commits

| Task | Commit | What |
| ---- | ------ | ---- |
| 1 (tracer) | `90e58a60e` | `--add-library` helper route with guarded AddLibraryFolder and relist check, gap-tolerant folder listing, TS seam and moveNative refusals, host harness for the pure logic |
| 2 | `eed72dc3f` | `gl_ia_move_wait_step` state machine, one-shot StartValidatingApp nudge, `not-settled` result mapped in TS, shared `gl_ia_find_validate_slot` |
| 3 | `1f9f0cd2c` | Todo Live gate rewritten for the new-folder and existing-library moves, Solution sentence updated, progress section |

## What changed

- **Helper (`gamelib_installapp.h`).**
  - `--steam-moveapp <id> --library <abs> --add-library`. Add runs only when the picked folder matches none of Steam's live folders. The slot is called only when its unique `0x16a1` ID resolves and RemoveLibraryFolder's unique `0xbc0b` sits at exactly Add + 3, each checked with `gl_ia_slot_hi` at that position. Remove is never called (`vt[remove_slot]` gate is 0). Shape is `int32 (const char *)`.
  - Order: refusals (`library-not-directory`, `path-too-long`, `inside-library` / `contains-library` with `folderIndex`), `not-installed`, read-only CanMoveApp, dry-run exit, wait-slot resolution, CanMoveApp error return, Add (`ret < 0` is `add-library-refused` with `addRet`), relist check at `ret` (`add-library-unverified`), then MoveApp to `ret`. A refused move therefore never leaves a new library behind. Every non-dry-run ok line and the MoveApp-stage error line carry `addedLibrary`.
  - `gl_ia_list_folders` skips gaps (empty path) and keeps Steam indices; `gl_ia_find_folder` replaces both inline matching loops. A non-absolute or non-directory entry still fails the lookup.
  - `gl_ia_move_wait_step` replaces the inline wait decision. `gl_ia_find_validate_slot` is the validate guard factored out of `gl_ia_run_validate` with identical checks.
- **TS seam (`steamInstallApp.ts`).** `addLibrary` option (argv `--add-library` before `--wait`), `addedLibrary` on ok and error, a `not-settled` outcome, `STEAM_LIBRARY_PATH_MAX_BYTES = 254`.
- **`moveNative.ts`.** Matched libraries take the unchanged route plus a collision check. Unmatched folders take the add route with refusals in this order: not an existing directory, not writable, over 254 bytes, is or inside the current install, contains the current install, inside an existing library, contains an existing library, already holds a copy (install folder or appmanifest). A rejected `listLibraries` now refuses instead of falling through. The old "add a drive in Steam first" refusal is deleted. New outcome messages for every new refused reason, `method-unverified:AddLibraryFolder`, an error after Add, and `not-settled` (which reconciles install_path first).

## Planner decisions recorded (from the plan)

- One helper run with `--add-library`, not a second subcommand: no index crosses the TS boundary and there is one multi-second getter scan.
- Add only when unmatched: Steam's idempotency was tested only for the exact path, and Add on a subfolder of a library leaves stub files (spike 094 step 3). The existing-library route stays free of writes.
- Refusals, then CanMoveApp, then Add, then MoveApp. A MoveApp error after Add leaves the library registered (GameLib never calls Remove); the error line and message say so.
- TS owns the messages; the helper re-checks against Steam's live list because `libraryfolders.vdf` can lag Steam's memory.
- Empty-folder rule: non-empty folders are allowed (Steam adds its stub next to existing files; users pick `~/Games`). Only an existing copy of this game's install folder or appmanifest is refused, on both routes.
- GameLib does not create the folder; a missing path is refused.
- Gap rule and its consequence: an empty path is a gap, skipped with indices kept. A non-empty non-absolute entry (shape drift) or an absolute path that does not stat still fails with `library-lookup-unverified`. The latter means **a library on an unmounted volume still breaks the lookup** (spike 094 lists this as untested); recorded as still open in the todo.
- Nudge timing: 5 s (`GL_IA_MOVE_NUDGE_AFTER_S`) at the target with Files Missing set and no busy bits, one StartValidatingApp, then `not-settled` / `verify-pending` after 60 s (`GL_IA_MOVE_VERIFY_PENDING_S`) more. `GL_IA_MOVE_SETTLE_FALLBACK_S` (60 s) now applies only with Files Missing clear. No validate slot means no nudge and not-settled after 60 s.
- **"The UI should say so" (spike 094) is not implemented as a pre-move note.** After a move the Location row shows the real `<picked>/steamapps/common/<installdir>` path and refusal messages name the library, but a note in the shared Move confirmation needs new i18n catalog strings behind the i18n gates and was not among the five spec items. **Flagged to the orchestrator.**

## Verification

- `npx jest` over `installAppHarness`, `steamInstallAppHelper`, `steamInstallApp`, `moveNative`, `validateNative` and `fakeHomeIsolation`: 6 suites, 182 tests, all green (run after Task 2; after Task 1 the five suites then in scope were 161 tests, green).
- `pnpm build-steam-bridge` exit 0 (arm64 and x86_64 helper with `-Werror=uninitialized`), `pnpm codecheck` clean.
- Scoped `npx prettier --check` and `npx eslint` over the six TS paths of each task: clean. The header and `installapp_harness.c` have no prettier parser (`inferredParser: null`) and were hand-matched.
- All grep gates from both tasks met: `0x16a1u` 1, `0xbc0bu` 1, `--add-library` 3, `gl_ia_find_folder(` 3, old matching loops 0, `vt[remove_slot]` 0, `'--add-library'` in TS 1, `addLibrary: true` in moveNative 1, old refusal text 0, `GL_IA_MOVE_NUDGE_AFTER_S` 3, `gl_ia_move_wait_step` 2, `gl_ia_find_validate_slot` 3, `not-settled` in the header 3, `GL_IA_FN_CANCELVALIDATION` 3.
- `python3 .planning/todos/todo-frontmatter-gate.py`: `OK: 14 pending todo(s)`; frontmatter unchanged, file still in `pending/`.
- `graphify update .` ran after Task 2.
- No helper was run with the real HOME, and AddLibraryFolder, MoveApp, StartValidatingApp and RemoveLibraryFolder were never called against a real Steam. The only helper runs were the jest cases under `createFakeHomeProfile()` (stop at `steamclient-missing`) and the host harness, which links no steamclient.

## Deviations from Plan

None - plan executed as written. Minor implementation notes:

- The moveNative `contains-library` test needed the current install moved outside the library (a fixture adjustment in the test, not a code change), because a folder containing a library that holds the current install hits the more specific "contains the current install" refusal first.
- `fake` vtable function pointers are stored as `void *` in the harness, which compiles under `-Wall -Werror` (no `-pedantic`).

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model (T-n4q-01..11 all addressed as planned; T-n4q-09 and T-n4q-11 accepted).

## Pending: live gate (human only, not run by the executor)

Task 3's `<human-check>` is the operator's and is **pending**. Prep: `pnpm build-steam-bridge`, `pnpm build:sidecar`, restart with `pnpm tauri:dev` (never `tauri:dev:run`). Steps, in short: with Mac Steam running and signed in, move WazHack (264160) to a new empty folder outside every library (e.g. `~/GameLibMoveTest`); confirm it appears in Steam → Settings → Storage, the game is in `<folder>/steamapps/common/WazHack`, GameLib's Location follows with no Refresh and Play launches it (record whether the "file check hasn't finished" message appears, which would mean the nudge did not settle Steam); move it back to an existing library with no new Storage entry; confirm the refusals (inside a library, parent of a library, its own install folder) leave Steam unchanged and create no stub in the inside-library folder; remove the test library in Steam's UI and move between two existing libraries again without a restart (gap fix, no `library-lookup-unverified`); clean up. Pass on steps 2-5 meets the todo's live gate; moving the todo to `completed/` is the operator's call. The todo stays `ready: live-gate` in `pending/`.

## Self-Check: PASSED

- FOUND: native/steam-bridge/helper/gamelib_installapp.h, src/backend/storeManagers/steam/__tests__/fixtures/installapp_harness.c, src/backend/storeManagers/steam/__tests__/installAppHarness.test.ts
- FOUND commits: 90e58a60e, eed72dc3f, 1f9f0cd2c (ancestors of HEAD; `git rev-list --count` from the ledger base is 3)
- No pre-existing unrelated dirty or untracked path was staged or committed.
