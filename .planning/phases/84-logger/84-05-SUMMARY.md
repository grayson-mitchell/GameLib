---
phase: 84-logger
plan: 05
subsystem: infra
tags: [rust, tauri, native-router, logger, reqwest, dpaste, ipc-manifest, sanitiser]

requires:
  - phase: 84-logger
    provides: "gamelib-log renderer sanitiser, gamelib_core::paths::log_file and the StoreHost core (84-02), the native writer reachable from the shell (84-03)"
provides:
  - "native router generalised: NativeCtx, async InvokeHandler (NativeFuture), typed SendPayload, the logger slice, NativeHost::reveal_path"
  - "logError, logInfo, showLogFileInFolder (sends on one FIFO slice) and getLogContent, uploadLogFile (async invokes) served by Rust"
  - "log_dispatch.rs (strict GetLogFileArgs decoding, reveal and read through Rust-resolved paths) and log_upload.rs (PasteClient, ReqwestPaste, validate_paste_url, PASTE_TOKEN)"
affects: [84-06, 84-07, 84-08, 84-09, 84-10, 85-store-host]

actuals:
  tokens: 20054
  tasks: 3
  commits: 3
plan_head_before: 11362bad5916dd50656cf8411f54ef27790cc151
plan_head_after: 66b5346aba379aacbfd0d99e86eea1fcc5dd98f1

tech-stack:
  added: ["reqwest 0.13 as a direct shell dependency (already locked through gamelib-steamcm; no new lockfile name)"]
  patterns:
    - "native invoke handlers are fn(Arc<NativeCtx>, Vec<Value>) -> NativeFuture, awaited directly by sidecar_invoke (a blocking handler moves its own work onto spawn_blocking)"
    - "a native send is validated on the caller thread into a SendPayload and run on its slice's single FIFO worker; the validator Err is a fixed category literal, never an argument"
    - "typed descriptors cross the trust boundary, never paths: the file is resolved only through gamelib_core::paths::log_file"
    - "HTTP behind a PasteClient trait: tests aim the real reqwest client at a std TcpListener stand-in"

key-files:
  created:
    - src-tauri/src/log_dispatch.rs
    - src-tauri/src/log_upload.rs
  modified:
    - src-tauri/src/native_router.rs
    - src-tauri/src/native_handlers.rs
    - src-tauri/src/relay_commands.rs
    - src-tauri/src/shell_open.rs
    - src-tauri/src/main.rs
    - src-tauri/src/steampoll_dispatch.rs
    - src-tauri/src/ipc_contract.rs
    - src-tauri/Cargo.toml
    - src-tauri/Cargo.lock
    - src/common/types/ipc/nativeChannels.json
    - src/common/types/ipc/ipcSchemaSnapshot.json
    - src/common/types/ipc/logger.ts
    - src/common/types/ipc/settings.ts
    - src/common/types/ipc/native.ts
    - src/common/types/ipc/index.ts
    - src/common/types/ipc/channelSchemas.ts
    - src/backend/sidecar/loggerFlowRegistration.ts
    - src/backend/sidecar/settingsFlowRegistration.ts
    - src/backend/logger/uploader.ts
    - src/backend/logger/paths.ts

key-decisions:
  - "Renderer log text is sanitised where it lands (gamelib_log::sanitize::renderer_body on the logger slice worker); the sidecar no longer knows logError or logInfo"
  - "GetLogFileArgs is decoded strictly in Rust (three arms, six runners, comet only for a runner log, type defaults to launch) and a game target is also checked against log_file at validation time, so a traversal vector is rejected by the validator and again by the resolver"
  - "A paste URL is stored or returned only if https, host exactly dpaste.com, with no credentials and no explicit port; the shared ReqwestPaste client disables redirects"
  - "The upload record is written through StoreHost at <user_data>/store/uploadedLogs.json and pushed through the FrontendEmitter in NativeCtx"
  - "Manifest invoke vectors: a valid vector must not return INVALID_ARGS (an upload of a log that does not exist legitimately rejects, so success is not the criterion)"

patterns-established:
  - "NativeCtx::for_tests builds a context with a null emitter and an offline paste client; per-test stand-ins override fields by struct literal"
  - "Rejection line is a function (rejection_line) so a test can assert it names the channel and never a message, since shell_eprintln! output is not capturable"

requirements-completed: [FND-05]

coverage:
  - id: D1
    description: "Renderer logError and logInfo are validated and sanitised in Rust (CR/LF escaped, forged-line string kept to one line) and written as Frontend lines through the logger slice; the sidecar no longer registers either"
    requirement: FND-05
    verification:
      - kind: unit
        ref: "cargo test --bin gamelib-shell log_ (log_renderer_error_line_is_sanitised_and_prefixed_frontend, log_validator_*, log_fifty_renderer_errors_reach_the_log_in_send_order)"
        status: pass
      - kind: unit
        ref: "src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts and nativeSeamPortComplete.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "showLogFileInFolder and getLogContent resolve paths only through log_file; traversal never reaches reveal_path; a missing file reveals nothing and reads as an empty string; invalid UTF-8 reads lossily"
    requirement: FND-05
    verification:
      - kind: unit
        ref: "cargo test --bin gamelib-shell log_ (log_show_with_a_traversal_name_never_calls_reveal_path, log_get_content_*)"
        status: pass
    human_judgment: false
  - id: D3
    description: "uploadLogFile runs in Rust against a localhost stand-in: form body, User-Agent, 10 MiB cap, stored record, logFileUploaded push, log lines; false on 500, javascript:, off-host URL, 302 (not followed) and a refused connection; rejects on a missing file"
    requirement: FND-05
    verification:
      - kind: integration
        ref: "cargo test --bin gamelib-shell log_upload (11 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The Show-in-folder button, log viewer and upload dialog work from the real UI against the native logger"
    requirement: FND-05
    verification:
      - kind: other
        ref: "not driven in a live app by this executor; phase checkpoint 84-10 and 84-HUMAN-UAT own the live check"
        status: unknown
    human_judgment: true
    rationale: "A real macOS Finder reveal and a real dpaste.com upload need a running app and the network; the unit and stand-in tests do not exercise either."

duration: not measured (start time not recorded)
completed: 2026-11-21
status: complete
---

# Phase 84 Plan 05: Native router generalised; renderer log channels and upload served by Rust

**The renderer's five log channels (logError, logInfo, showLogFileInFolder, getLogContent, uploadLogFile) are answered by the Rust native router: renderer text is sanitised where it lands, files are resolved only through `log_file`, and the dpaste upload runs on reqwest with the paste-URL trust boundary enforced.**

## Performance

- **Duration:** not measured (start time not recorded)
- **Completed:** 2026-11-21
- **Tasks:** 3 (one tracer, one TDD, one auto)
- **Files:** 31 changed across the three commits (1,996 insertions, 1,324 deletions; the deletions are the TS registrations, zod entries, cases and the uploader function)

## Accomplishments

- **Tracer (Task 1):** `NativeCtx` / `NativeFuture` / async `InvokeHandler` / `SendPayload` and a `logger` slice with its own FIFO worker. `sidecar_invoke` now awaits native handlers instead of parking them on the blocking pool. `logError` and `logInfo` share one validator and format through `renderer_body`; their sidecar registrations, zod entries and cases were deleted in the same commit as the manifest entries.
- **Show and read (Task 2):** strict `parse_log_file_args`; `showLogFileInFolder` reveals an existing resolved file through `NativeHost::reveal_path` (a hand-off thread running the new `shell_open::reveal_item`, which the `ShellShowItemInFolder` command now shares); `getLogContent` reads on `spawn_blocking`, `""` for a missing file, lossy UTF-8 otherwise. The plain `GetLogFileArgs` type moved to `ipc/logger.ts`.
- **Upload (Task 3):** `log_upload.rs` with `PasteClient`, `ReqwestPaste` (redirects off, 60 s timeout), `validate_paste_url`, `PASTE_TOKEN`, and `upload_log_file`. `NativeCtx` widened with `store_host`, `emitter`, `paste`, `app_version`. The TS `uploadLogFile` function and its registration are gone.
- Census figures re-measured, never widened: `loggerFlowRegistration.ts` `{3,3}` -> `{2,0}`, `settingsFlowRegistration.ts` `{11,1}` -> `{10,1}`, each with a dated 84-05 comment and the `register*Flows()` totals rewritten (Gate 2).

## Task Commits

1. **Task 1: tracer, router generalisation and the renderer log path** - `259922e96` (feat)
2. **Task 2: showLogFileInFolder and getLogContent** - `92ad8ec5b` (feat)
3. **Task 3: uploadLogFile with reqwest on the StoreHost core, plan-end gates** - `66b5346ab` (feat)

## Verification

- `cargo test --bin gamelib-shell`: 573 passed, 0 failed, 2 ignored (the 2 pre-existing ignored).
- `cargo test --bin gamelib-shell native_ | log_ | log_upload | shell_open | shell_source_files`: all green with non-zero test counts (40, 38 and 11 for the first, second and third filters).
- `pnpm check:ipc-contract`, the census/ownership/PortComplete/cargoFeatures/tauriShellSource suites, `pnpm codecheck`, `pnpm lint` (0 errors, ceilings held), `pnpm find-deadcode`, `pnpm backend-di-ceilings`, and the darwin clippy ratchet (`PASS (darwin, toolchain 1.99.1)`, no ceiling moved): all pass at the plan's last commit.
- `cargoFeatures` confirms no new lockfile crate name (Cargo.lock gained one line: `reqwest` in gamelib-shell's dependency list).

## Open window (named on purpose)

From `66b5346ab` until 84-06's list/delete commit, `uploadedLogs.json` has **two writers**: Rust (on upload, through `StoreHost`) and the TS `FileStore` (on `getUploadedLogFiles` and `deleteUploadedLogFile`). No push happens before 84-10's checkpoint, so the window never ships. **It stays open until 84-06 closes it.**

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `loggerSyncArgs` emptied, so `channelSchemas.ts` had to change**
- **Found during:** Task 2
- **Issue:** deleting `showLogFileInFolder` left `loggerSyncArgs` empty (the plan says to delete it), but `src/common/types/ipc/channelSchemas.ts` imported and spread it, which was not in `files_modified`.
- **Fix:** removed the import and the `defineChannelEntries('send', loggerSyncArgs)` row; the sync half of `ipcSchemas/logger.test.ts` went with it.
- **Files modified:** `src/common/types/ipc/channelSchemas.ts`, `src/backend/sidecar/__tests__/ipcSchemas/logger.test.ts`
- **Commit:** `92ad8ec5b`

**2. [Rule 3 - Blocking] `tauriShellSource.test.ts` pinned the old shape of `shell_show_item_in_folder`**
- **Found during:** Task 2
- **Issue:** the macOS Finder-reselect ordering test sliced `shell_show_item_in_folder`'s body; after factoring `reveal_item` out the reveal and workaround live there.
- **Fix:** the test slices `reveal_item` (and asserts `shell_show_item_in_folder` calls it). Ordering assertions unchanged.
- **Files modified:** `src/backend/__tests__/tauriShellSource.test.ts`
- **Commit:** `92ad8ec5b`

**3. [Rule 3 - Blocking] `TauriFrontendEmitter`'s field was module-private**
- **Found during:** Task 3
- **Issue:** the plan says to reuse the shell's emitter, but `TauriFrontendEmitter(AppHandle)` could only be built inside `steampoll_dispatch.rs`.
- **Fix:** the field is `pub(crate)`; no behaviour change.
- **Files modified:** `src-tauri/src/steampoll_dispatch.rs`
- **Commit:** `66b5346ab`

**4. [Rule 1 - Bug] Deleting `uploadLogFile` from `uploader.ts` broke `deleteButtonReachability`'s premise check**
- **Found during:** Task 3
- **Issue:** that test greps `uploader.ts` for `const token = '1'`, which only existed inside the deleted function. 84-06's plan owns repointing it, but the test would have been red on `main` between the two plans.
- **Fix:** pulled that one edit forward: the test now reads `src-tauri/src/log_upload.rs` and the regex `const PASTE_TOKEN: &str = "1";`, and its comments name the new home. **84-06 should treat that bullet as already done.**
- **Files modified:** `src/frontend/screens/Settings/sections/LogSettings/components/UploadedLogFilesList/__tests__/deleteButtonReachability.test.tsx`
- **Commit:** `66b5346ab`

### Plan-reading and ordering notes (not rule deviations)

- **Reveal pieces moved from Task 1 to Task 2.** The plan lists `SendPayload::Reveal` and `reveal_path` in Task 1's router work; adding them there would have left dead code (a warning against the clippy ceiling) until Task 2 used them, so they land with their first user.
- **Manifest vectors for logError/logInfo.** The plan prints the valid vectors as `[["x"]]`, `[["a","b"]]`, `[[{...}]]`, `[[{}]]`; read against the invalid list (`["a","b"]` is two args), the intended vectors are one argument each: `["x"]`, `[["a","b"]]`, `[{...}]`, `[{}]`. That is what the manifest holds.
- **Manifest-vector test for invokes.** "Valid" now means "not an INVALID_ARGS error", because a valid `uploadLogFile` vector for a log that does not exist rejects by design. Invalid vectors are still required to return the marker.
- **TDD flag.** Task 2 is `tdd="true"`; the behaviour tests and implementation were written together and committed together (no separate RED commit), because the new tests do not compile until the implementation exists.
- **Rejection log capture.** `shell_eprintln!` output cannot be captured in a test, so the "rejection names the channel only" behaviour is asserted on the extracted `rejection_line(channel)` plus a routed hostile payload; the validator `Err` values are asserted to be fixed literals.
- **Stricter than the plan on purpose (all inside Rust, per "never widen").** `validate_paste_url` also rejects URL credentials and an explicit port; the paste response body is read capped at 64 KiB; CR and LF are escaped in the logged response text, error text and upload name so none can forge a log line. `getLogContent`'s arms are now the three strict ones the plan names, where the old zod collapsed them into one all-optional object (so `{appName}` alone and `{runner, type}` are now rejected).
- **Renderer object key order.** A `{name, message, stack}` object reaches Rust as a `serde_json::Value` (`preserve_order` is off crate-wide), so its keys arrive alphabetical, exactly as they did when the relay round-tripped the same `Value` to the sidecar; the renderer golden's order-preserving deserializer is unaffected. No behaviour change.

**Total deviations:** 4 auto-fixed (3 blocking, 1 bug), 0 architectural. **Impact:** none on scope; all four touch files the plan's own changes made stale.

## Known Stubs

None.

## Threat Flags

None. The dpaste upload surface (T-84-20/21/23) and the renderer-to-Rust channels (T-84-14..17) are the ones the plan's threat model already covers; no new endpoint, auth path or schema was added.

## Notes for later plans

- `registerLoggerFlows`'s `deps` type still carries `openExternal: Pick<OpenExternal, 'showItemInFolder'>` that nothing in the function reads any more; `handlers.ts` still passes it. 84-06 deletes the whole module.
- `LogSettings/index.tsx` carries one pre-existing `react-hooks/exhaustive-deps` warning at the `getLogContent` effect; only its import line changed here.
- 84-06 reuses `PasteClient` / `ReqwestPaste` (post_form takes any URL; redirects stay off), `validate_paste_url`, and `PASTE_TOKEN`. `LocalPaste` in `log_upload.rs`'s tests is the localhost stand-in pattern to copy.
- The macOS Finder reveal and a real dpaste.com upload were not exercised against a live app or the network here; the 84-10 checkpoint and `84-HUMAN-UAT.md` are where that is observed.

## Self-Check: PASSED

- FOUND: src-tauri/src/log_dispatch.rs, src-tauri/src/log_upload.rs
- FOUND commits (ancestors of HEAD): 259922e96, 92ad8ec5b, 66b5346ab
- Acceptance greps re-run at the last code commit: `struct NativeCtx` 1, `fn parse_log_file_args` 1, `fn reveal_item` 1, `Policy::none()` 1, `const PASTE_TOKEN: &str = "1";` 1, `^reqwest =` 1, `spawn_blocking(move || handler` 0, `shell_diag` 0 in both new files, `'uploadLogFile'` / `'getLogContent'` / `ipc.on('showLogFileInFolder'` registrations 0, `GetLogFileArgs } from 'backend/logger/paths'` 0.
