---
phase: 84-logger
plan: 06
subsystem: infra
tags: [rust, tauri, native-router, logger, dpaste, store-host, uploadedLogs, census-deletion]

requires:
  - phase: 84-logger
    provides: "StoreHost core and gamelib_core::paths (84-02); NativeCtx, async InvokeHandler, PasteClient, ReqwestPaste, validate_paste_url, PASTE_TOKEN and the localhost stand-in pattern (84-05)"
provides:
  - "getUploadedLogFiles (with the two-day expiry prune) and deleteUploadedLogFile served by the Rust native router on the logger slice"
  - "uploadedLogs.json has exactly one writer, Rust through StoreHost: the two-writer window 84-05 opened is closed"
  - "the sidecar serves no logger channel; uploader.ts, logger/stores.ts, loggerFlowRegistration.ts, loggerFlows.test.ts, the `logger` store slice and every uploadedLogs table row are deleted"
  - ".planning/phases/84-logger/COVERAGE.md: the dpaste capability matrix"
affects: [84-07, 84-08, 84-09, 84-10, 85-store-host]

actuals:
  tokens: 29114
  tasks: 2
  commits: 6
plan_head_before: e5fc84b8cc052bba7cd262efed9d5325098de8ad
plan_head_after: 9b9ed19579dcd43f328cd75fb0a00c2828232d02

tech-stack:
  added: []
  patterns:
    - "a delete request goes only to a URL already in the store that re-validates through validate_paste_url, over the shared no-redirect client"
    - "a read with a write side effect (the expiry prune) runs on spawn_blocking over StoreHost's snapshot and remove; a corrupt store reads as {} and is never rewritten"
    - "LocalPaste in the log_upload tests now records every URL the handler asked to post to, so a test can assert both the fixed upload endpoint and a delete aimed at a stored URL"

key-files:
  created:
    - .planning/phases/84-logger/COVERAGE.md
  modified:
    - src-tauri/src/log_upload.rs
    - src-tauri/src/native_router.rs
    - src-tauri/src/ipc_contract.rs
    - src/common/types/ipc/nativeChannels.json
    - src/common/types/ipc/ipcSchemaSnapshot.json
    - src/common/types/ipc/logger.ts
    - src/common/types/ipc/native.ts
    - src/common/types/ipc/index.ts
    - src/common/types/ipc/channelSchemas.ts
    - src/backend/sidecar/handlers.ts
  deleted:
    - src/backend/logger/uploader.ts
    - src/backend/logger/stores.ts
    - src/backend/sidecar/loggerFlowRegistration.ts
    - src/backend/sidecar/__tests__/loggerFlows.test.ts

key-decisions:
  - "Both channels resolve to a safe value instead of failing when the shell has no home directory: the list reads as {} and the delete as false (the renderer reads the list at module scope, where a rejection would be worse than an empty list)"
  - "An entry whose uploadedAt is not a number never expires, as in the TS it replaces (NaN >= 2 is false)"
  - "The stored token (not a hard-coded one) is what the delete body carries, falling back to PASTE_TOKEN; it is form-urlencoded, so a hand-edited token cannot add a field"
  - "The os-mock-is-inert behavioural pin moved to enrichmentFlows.test.ts and structuralContainment leg 3 follows it (see Deviations)"
  - "ipcDomainCensus FILES_FLOOR 22 -> 21 as a deliberate file deletion with a dated note; the declaration total stays 289"

patterns-established:
  - "A census that counts a deleted file is lowered in the commit that deletes it, with a dated note naming the deletion, never to absorb an unexplained drop"

requirements-completed: [FND-05]

coverage:
  - id: D1
    description: "getUploadedLogFiles returns unexpired entries and removes entries 48 h old or older from uploadedLogs.json (persisted); a corrupt store returns {} and the file stays byte-identical; extra args return the INVALID_ARGS marker"
    requirement: FND-05
    verification:
      - kind: unit
        ref: "cargo test --bin gamelib-shell log_list_ (returns_unexpired_entries_and_prunes_the_expired_one_from_disk, a_corrupt_store_reads_as_empty_and_the_file_is_byte_identical, keeps_an_entry_without_a_numeric_uploaded_at, a_missing_store_is_empty_and_writes_nothing, any_argument_returns_the_invalid_args_marker)"
        status: pass
    human_judgment: false
  - id: D2
    description: "deleteUploadedLogFile posts token=1&delete= only to a stored URL that re-validates as https://dpaste.com, removes the entry and pushes logFileUploadDeleted on a 2xx, returns false and keeps the entry on 404, refused connection or a redirect (not followed); a planted off-host URL is never posted to; bad args return the INVALID_ARGS marker"
    requirement: FND-05
    verification:
      - kind: integration
        ref: "cargo test --bin gamelib-shell log_delete_ (11 cases incl. posts_the_token_and_removes_the_entry_on_a_2xx, a_planted_off_host_url_is_never_posted_to) and log_upload_then_list_then_delete_round_trips_on_one_store"
        status: pass
    human_judgment: false
  - id: D3
    description: "uploadedLogs.json has one writer: no TS file names the store, and upload, list and delete share one StoreHost"
    requirement: FND-05
    verification:
      - kind: other
        ref: "grep -rln 'uploadedLogs|createLoggerStores' src meta (ts, tsx, json) returns 0; log_upload_then_list_then_delete_round_trips_on_one_store"
        status: pass
    human_judgment: false
  - id: D4
    description: "Every census, ledger and store table that counted the deleted files or the uploadedLogs store says so, with counts re-measured and never widened"
    requirement: FND-05
    verification:
      - kind: unit
        ref: "flowRegistrationCensus, ipcDomainCensus, electronReachLedger, testContainment, structuralContainment, storeKinds, storeLayer, fileStore, storePolicy, tauriTransport, bootSourceShape, diPhaseGates, testServices, genIpcContract jest suites; pnpm check:ipc-contract; pnpm find-deadcode; pnpm planning-gates; darwin clippy ratchet"
        status: pass
    human_judgment: false
  - id: D5
    description: "The dpaste API coverage matrix is a decided record (INTEGRATE or OPT-OUT, a reason on every opt-out)"
    verification:
      - kind: other
        ref: ".planning/phases/84-logger/COVERAGE.md (6 capability rows)"
        status: pass
    human_judgment: false
  - id: D6
    description: "The uploaded-log list, the 2-day prune and the delete work against the real dpaste.com from the running app"
    requirement: FND-05
    verification: []
    human_judgment: true
    rationale: "The tests use a localhost stand-in. The list is read by the renderer at module scope and its live behaviour (and dpaste.com's real answer to a delete request) is for the 84-10 checkpoint and 84-HUMAN-UAT."

duration: 18min
completed: 2026-11-21
status: complete
---

# Phase 84 Plan 06: Uploaded list and delete-uploaded served by Rust; TS uploader, store slice and logger registration deleted

**The uploaded-log list (with its two-day expiry prune) and delete-uploaded run in Rust on the StoreHost and the no-redirect paste client, the delete posting only to a stored URL that re-validates as `https://dpaste.com`; `uploadedLogs.json` now has one writer, and the sidecar serves no logger channel.**

## Performance

- **Duration:** 18 min (07:07 to 07:25 UTC, 2026-11-21)
- **Tasks:** 2 (one tracer with `tdd="true"`, one auto)
- **Files:** 45 changed across the three code commits (incl. 4 deleted TS files and the new COVERAGE.md)

## Accomplishments

- **Tracer (Task 1):** `get_uploaded_log_files` and `delete_uploaded_log_file` in `log_upload.rs`, registered as invokes on the `logger` slice with manifest entries and vectors. `uploader.ts`, the now-empty `loggerFlowRegistration.ts` and `loggerFlows.test.ts` were `git rm`'d; `LoggerAsync` and its `index.ts` intersection member were deleted, `loggerFrontendMessagesArgs`, `GetLogFileArgs` and `UploadedLogData` stay. The census and ledger fallout was handled in the same commit.
- **Store slice (Task 2):** `logger/stores.ts` and the `logger` slice left `services/types.ts`, `createStores.ts` and `testServices.ts`; `uploadedLogs` left `storePolicy`, `typed_store`, `registeredStores.json` and the store-table tests. The on-disk `uploadedLogs.json` is untouched (Rust reads it in place).
- **COVERAGE.md:** six rows (create paste INTEGRATE, delete paste INTEGRATE as parity, title/syntax, poster, retrieval and authentication OPT-OUT with reasons).

## Two-writer window: closed

84-05 left `uploadedLogs.json` with two writers (Rust on upload, the TS `FileStore` on list and delete). It is closed by commit `12df894bc` (the list and delete move) and `9b9ed1957` (the TS store deleted): `grep -rln "uploadedLogs|createLoggerStores" src meta` over ts, tsx and json returns 0, and `log_upload_then_list_then_delete_round_trips_on_one_store` runs upload, list and delete through one `StoreHost`.

## Criterion 2: delete-uploaded has no UI control

**There is no UI control for delete-uploaded.** The button is commented out, and `deleteButtonReachability.test.tsx` pins that (its premise check now reads `PASTE_TOKEN` in `src-tauri/src/log_upload.rs`, the edit 84-05 pulled forward; verified here, not redone). So delete-uploaded is proven by this plan's localhost round-trip test (`log_delete_posts_the_token_and_removes_the_entry_on_a_2xx` and its siblings), not by a click, and **ROADMAP criterion 2's "from the UI" is not literally met for delete-uploaded**; it is met for upload and show-in-folder only. dpaste.com has no delete endpoint either, so the request cannot remove a paste in practice.

## Task Commits

1. **Pre-task fix: re-pin gameDetailsImportGate (84-05 left it red)** - `90ba1d3ab` (fix)
2. **Task 1: tracer, list and delete in Rust; TS uploader, registration and loggerFlows deleted** - `12df894bc` (feat)
3. **Task 2: TS uploadedLogs store slice deleted, COVERAGE.md, plan-end gates** - `9b9ed1957` (refactor)

`commits: 6` in the frontmatter is the measured `rev-list` count over the base `e5fc84b8c`; three of the six (`692736559`, `6cec972e7`, `2d9429168`) are another session's commits that landed on `main` during the run. Mine are the three above. TDD note: Task 1 is `tdd="true"` but the Rust tests do not compile until the handlers exist, so tests and implementation share one commit (the 84-05 precedent); `workflow.tdd_mode` is off.

## Verification

- `cargo test --bin gamelib-shell`: 586 passed, 0 failed, 2 ignored (the 2 pre-existing). `log_upload` filter: 33 tests; `native_`: 40.
- `rustfmt --edition 2021 --check` on `log_upload.rs` and `native_router.rs`: clean. Darwin clippy ratchet: `PASS (darwin, toolchain 1.99.1)`, no ceiling moved.
- `pnpm check:ipc-contract`, `pnpm codecheck`, `pnpm lint` (0 errors, both ceilings PASS), `pnpm find-deadcode` (312 baselined findings, none new), `pnpm planning-gates` (12/12): pass at the last commit.
- Jest over the Backend, Common, Preload and Meta projects: every suite passes except the pre-existing items below.
- `npx prettier --check` over every touched path that prettier sees (`--file-info` confirmed none ignored): clean. `COVERAGE.md` is under the ignored `.planning` tree.

## Decisions Made

See `key-decisions`. In short: safe values (`{}` / `false`) when there is no home directory; a non-numeric `uploadedAt` never expires; the stored token is what the delete body carries.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] gameDetailsImportGate was red after 84-05**
- **Found during:** Task 2 full-suite run
- **Issue:** 84-05 deleted the `getLogContent` handler from `settingsFlowRegistration.ts` but did not run this suite, so its sha256 pin and the registered-channel set (12) were stale.
- **Fix:** re-pinned the digest with a dated note and set the channel count to 11; the diff against the file is that removal plus docstring wording, so no channel, guard or `steamLibrary.has` gate moved.
- **Files modified:** `src/backend/sidecar/__tests__/gameDetailsImportGate.test.ts`
- **Commit:** `90ba1d3ab`

**2. [Rule 3 - Blocking] `channelSchemas.ts` imported the deleted `loggerAsyncArgs`**
- **Found during:** Task 1. Not in `files_modified`.
- **Fix:** removed the import and the `defineChannelEntries('invoke', loggerAsyncArgs)` row.
- **Commit:** `12df894bc`

**3. [Rule 3 - Blocking] structuralContainment leg 3 held its pin in `loggerFlows.test.ts`**
- **Found during:** Task 1 (the plan did not foresee it). The "a per-suite `jest.mock('os')` is INERT" behavioural pin lived only in the deleted suite, and `structuralContainment.test.ts` reads that file by path.
- **Fix:** the pin moved to `enrichmentFlows.test.ts` and leg 3 reads it there. It sits in its own top-level `describe` ahead of the suite's `freshRegistry()`: a first attempt in `gameDetailsFlows.test.ts` failed because that suite's top-level `beforeEach` calls `jest.resetModules()`, which drops the cached setupContainment `os` instance, so the file's own mock took effect there. The doc line in `jest.setupContainment.ts` that named the old home was updated.
- **Files modified:** `src/backend/sidecar/__tests__/enrichmentFlows.test.ts`, `structuralContainment.test.ts`, `src/backend/jest.setupContainment.ts`
- **Commit:** `12df894bc`

**4. [Rule 3 - Blocking] Further counts and a dead export that the deletions tripped (all outside `files_modified`)**
- `ipcDomainCensus.test.ts` also pinned `files.length` to 22 in check (a): now 21 with the same dated note as `FILES_FLOOR`.
- `diPhaseGates.test.ts`: stores modules 17 -> 16 (the walk found one fewer, not a parse miss); the floor of 17 on `[index, ...modules]` still holds at exactly 17.
- `testServices.test.ts`: store families 19 -> 18.
- `genIpcContract.test.ts`: "the real tree clears the floor" built its snapshot with only `getHeroicVersion` as native, so each channel moving to Rust lowered the count below the 231 floor. It now parses the real `nativeChannels.json`, so a move leaves the count unchanged and the floor stays at 231 (never lowered).
- `schemaTypes.ts`: `httpUrlArg` lost its last user and failed `pnpm find-deadcode`; deleted.
- **Commit:** `12df894bc` (census) and `9b9ed1957` (the rest)

**Total deviations:** 4 groups (1 bug, 3 blocking), 0 architectural. **Impact:** none on scope; each touches something the plan's own deletions made stale, or 84-05's change.

## Issues Encountered / Pre-existing

- `pnpm backend-di-ceilings` fails at the last commit on two entries that are not this plan's: `steam/__tests__/games.test.ts` `jestMock` 46 > baseline 45 and `steam/bridge/__tests__/steamOfflineMode.test.ts` with no baseline. Both come from `e5fc84b8c` (the steam-bridge hold commit, the HEAD I started from) and the dirty tree; every shard this plan touched is clean, and no shard entry here needed to move. The plan's "backend-di-ceilings exit 0" criterion is therefore not met on this tree, for that reason only.
- `steamFilesPortComplete.test.ts` failed once in the multi-project run and passes alone (load-sensitive); not touched by this plan.
- `src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts` carries another session's uncommitted hunks; it was never staged.
- Stale prose references to the deleted files remain in comments of files this plan does not own (`backup.ts`, `electronAbsence.test.ts`, `repairFailure.ts`, `logger/index.ts`, `outboundHttpRegistry.ts`, `gog/__tests__/user.test.ts`, `meta/logSecretGate.ts`); 84-07 deletes the logger internals and is the natural place to sweep them.
- Not exercised live: a real dpaste.com list, prune or delete from the running app (84-10 and `84-HUMAN-UAT.md`).

## Known Stubs

None.

## Threat Flags

None. T-84-35 (SSRF on the delete path) is mitigated and tested by `log_delete_a_planted_off_host_url_is_never_posted_to` (five planted URLs, zero requests) and `log_delete_a_redirect_is_not_followed`; T-84-36 (prune tampering) by `log_list_a_corrupt_store_reads_as_empty_and_the_file_is_byte_identical`. No new package or crate was added.

## Next Phase Readiness

Ready for 84-07: the sidecar serves no logger channel, `uploadedLogs` has one owner, and the TS logger internals (`paths.ts`, the oracle, the containment kit's logger/paths element) are left for 84-07's red-first `loggerPortComplete` gate.

## Self-Check: PASSED

- FOUND: `.planning/phases/84-logger/COVERAGE.md`; `src-tauri/src/log_upload.rs` contains `fn delete_uploaded_log_file` and `fn get_uploaded_log_files`.
- ABSENT as required: `src/backend/logger/uploader.ts`, `src/backend/logger/stores.ts`, `src/backend/sidecar/loggerFlowRegistration.ts`, `src/backend/sidecar/__tests__/loggerFlows.test.ts`.
- FOUND commits (ancestors of HEAD): `90ba1d3ab`, `12df894bc`, `9b9ed1957`.
- Acceptance greps: `registerLoggerFlows` in `handlers.ts` 0; `FILES_FLOOR = 21` 1; `log_upload.rs` named in `deleteButtonReachability.test.tsx` 2; `logger/stores.ts` in `bootSourceShape.test.ts` 0; `uploadedLogs|createLoggerStores` over `src meta` (ts, tsx, json) 0; the three channel keys (`uploadLogFile`, `getUploadedLogFiles`, `deleteUploadedLogFile`) present in `nativeChannels.json`.
