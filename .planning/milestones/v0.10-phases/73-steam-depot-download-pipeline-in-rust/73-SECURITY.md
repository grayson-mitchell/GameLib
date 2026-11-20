---
phase: 73
slug: steam-depot-download-pipeline-in-rust
status: verified
threats_open: 0
asvs_level: 1
created: 2026-11-16
---

# Phase 73 - Security

Verified against current code (post phases 74-80). Paths are repo-relative. Phase 73 ported the Steam depot download pipeline from TypeScript to the in-repo `gamelib-depot` crate (`src-tauri/crates/gamelib-depot`), driven by the shell's `depot_dispatch.rs` over rustInvoke, flipped the default to Rust, then deleted the TS pipeline. Where a guard moved, was renamed or was superseded by a later phase, the row says "Drift".

Direct verification on 2026-11-16:
- `cargo test -p gamelib-depot`: every target ok (75 lib unit, 38 acf, 21 container, 13 delta, 8 delta_fallback, 12 delta_resume, 17 fetch, 10 finalize_op, golden, fixtures_gen 2 pass/1 ignored, job_install 12, job_modes, manifest, post, reconcile, summarize_delta; 0 failed).
- `cargo test -p gamelib-shell depot_dispatch`: 6 passed (the install-root guard pair, `depot_eof_cancels_all_jobs`, reply mapping x3).
- Jest, 12 suites, 194 tests, all pass: `cargoFeatures`, `depotPortComplete`, `depotHostChannels`, `depotRust/**` (jobInputs, rustDepot, rustInstall, rustSecondary, progressBridge.stage, updateEstimate), `depotPaths`, `meta/depotParitySweep`, `meta/gamelibDepotCli`.
- Greps over `src-tauri/src`, `src-tauri/crates/gamelib-depot{,-cli}`, `src/backend/sidecar`, `src/backend/storeManagers/steam/depotRust` (assertions in the rows).
Not run: `pnpm smoke:sidecar` and `pnpm install --frozen-lockfile` (closed from SUMMARY/VERIFICATION records), Windows/Linux CI legs (records), anything touching the operator's Steam library or profile files, full workspace builds.

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| crates.io -> build | Six third-party crates compiled into the shell | source |
| CDN -> decoder/fetcher | chunk and manifest bytes, redirects, hosts supplied by Node | untrusted bytes |
| manifest names/link targets -> filesystem | CDN-supplied names become paths | file names, link targets |
| sidecar -> shell (`depot_*` rustInvoke) | job JSON with depot keys and an install path | keys, paths |
| shell -> sidecar (`depotCdnToken`, `depotManifestRequestCode`, `depotJobEvent`) | shell-originated frames on the stdin pipe | job ids, request codes, events |
| job FinalizeSpec -> ACF | name/installdir/buildid from PICS via Node | strings |
| repo/CI/tooling -> verdicts | fixtures, parity sweep, deletion gate | test inputs, reports |
| operator's real library -> parity/UAT records | live account and paths | logs |

## Threat Register

Status key: CLOSED = verified in current code or by a direct run; SUPERSEDED = the named mitigation no longer exists because a later change removed the risk (the replacement is verified); PROCESS = closed on SUMMARY/VERIFICATION/PARITY/UAT/CI records, not re-observed; ACCEPTED = in the Accepted Risks log below. Severity is the plan's column.

| Threat ID | Category | Sev | Disposition | Status | Evidence |
|-----------|----------|-----|-------------|--------|----------|
| T-73-SC | Tampering | high | mitigate | CLOSED + PROCESS | Lockfile pin: `src/backend/__tests__/cargoFeatures.test.ts` crate-name set pin (:294-321) lists all six (`aes`, `cbc`, `sha1`, `prost`, `xz2`, `zstd`) and `gamelib-depot`/`gamelib-depot-cli` (:217); suite passes (run). Legitimacy check: 73-01-SUMMARY "Operator-resolved checkpoints" records operator "approved" for all six before any edit (PROCESS, not re-observable) |
| T-73-01 | Info disclosure | high | mitigate | CLOSED | `gamelib-depot/src/job.rs:32-46` hand-written `Debug for DepotRef` prints `key` and `request_code` as `<redacted>`; test `job_debug_redacts_key` at `job.rs:338` (cargo test, pass). `Fetcher` Debug (`fetch.rs:742`) omits tokens |
| T-73-02 | Tampering | med | mitigate | CLOSED | `deny_unknown_fields` on every wire struct (`job.rs:18,50,63,78,86,107`, `lib.rs:145,152`, `delta.rs:740,877`); `DepotJob::validate()` `job.rs:229-253` checks numeric depot/manifest/owner ids, 64 ASCII-hex key, absolute install root, select-files needs paths; test `validate_rejects_bad_shapes` (pass). `from_manifest` is not in `validate()` but only reaches `ManifestStore::cache_path`, which re-checks numeric (`manifest.rs:464,494`); summarize checks it at `manifest.rs:166-167` |
| T-73-03 | DoS | med | mitigate | CLOSED | `lib.rs:253` `catch_unwind(AssertUnwindSafe(..))` in `dispatch`, panic -> `Err("<op>:panic")`; test `panic_becomes_err` (pass) |
| T-73-04 | Tampering | low | mitigate | CLOSED | `grep -rIn 'aes_armv8\|RUSTFLAGS'` over the repo excluding node_modules/target/.planning/.claude: 0 hits in code, config or workflows; no `src-tauri/.cargo/` and no `rustflags` in any Cargo.toml (73-01-SUMMARY key-decision matches) |
| T-73-05 | DoS | high | mitigate | CLOSED | `container.rs:231-264` VSZa: footer size compared to trusted `expected` before the decoder runs (:247-253, "refusing to allocate"), then `declared > cap` (:255); `drain_capped`/`Capped` (:136-176) cap all codec output at `cb_original`; manifest zip declared size vs `MAX_MANIFEST_BYTES` (`container.rs:16,421`); test `vsza_footer_size_mismatch_rejected_before_alloc` at `tests/container.rs:146` (pass) |
| T-73-06 | Tampering | med | mitigate | CLOSED | `container.rs:349-360` `decode_chunk`: length then SHA1 check against the manifest chunk sha, returns the data only on success; the caller writes after `decode_chunk` (`download.rs:424-431`) |
| T-73-07 | DoS | med | mitigate | CLOSED | `u16_at`/`u32_at` (`container.rs:178-190`) return `DecodeError`, `decode_pk` uses `buf.get(..)` (:271-273); container tests (21, pass) include the truncation loop |
| T-73-08 | Info disclosure | low | mitigate | CLOSED | `container.rs:14,54-60` `RAW_BODY_PREVIEW_BYTES = 16`, `hex_preview` takes at most 16 bytes of the decrypted buffer; no `key` in any `DecodeError` message (read of all `DecodeError::new/failed` sites in `container.rs`) |
| T-73-09 | Tampering | med | mitigate | CLOSED | `fetch.rs:144` `.redirect(reqwest::redirect::Policy::none())`; chunk SHA1 gate downstream (T-73-06) |
| T-73-10 | Info disclosure | high | mitigate | CLOSED | `fetch.rs:107-112` `AttemptErr` "never holds a URL or any reqwest error text"; failure messages are `host`/path only (`fetch.rs:336,343,389,647-658`); test `failure_messages_never_contain_token` at `tests/fetch.rs:305` (pass). Drift (stronger): see T-73-41, no CDN token is requested at all now |
| T-73-11 | DoS | med | mitigate | CLOSED | `fetch.rs:10,34,46,554-555,612-634`: 15 s per-attempt `tokio::time::timeout`, 8 attempts, `backoff_with` capped, `TRANSIENT_BUDGET` 300 s; `stall.rs` tracker; fetch tests 17 pass |
| T-73-12 | DoS | med | mitigate | CLOSED | Grep: the only production callers of `JobHost::cdn_token` / `manifest_request_code` are `fetch.rs:375` and `fetch.rs:446`, both inside `tokio::task::spawn_blocking`; all other hits are the trait declaration, test hosts and the shell impl |
| T-73-13 | Spoofing | low | accept | ACCEPTED | Accepted Risks log, AR-73-01 |
| T-73-14 | Tampering/EoP | high | mitigate | CLOSED | `post.rs:114-128` `resolve_contained_path` (normalises `\`, lexical resolve, `is_contained`); every file write goes through it: `download.rs:302,468`, `delta.rs:253,951,1288,1337,1359,1501`, ACF installdir `acf.rs:182`. Tests `traversal_rejected` (`tests/post.rs:245`) and delta `delta_traversal_rejected` (:741) pass. Real Windows defect found and fixed in phase 73 (drive prefix dropped, PARITY "Found and fixed by the CI legs"); regression `windows_drive_root_keeps_its_prefix` at `tests/post.rs:749` is `cfg(windows)` (CI record, PROCESS) |
| T-73-15 | Tampering/EoP | high | mitigate | CLOSED | `post.rs:131-150` `check_symlink_target` called before `place_symlink` (`download.rs:492`); test `symlink_escape_rejected` at `tests/post.rs:265` (pass). See Observation O-2 (lexical-only check, TS parity) |
| T-73-16 | Tampering | med | mitigate | CLOSED | `post.rs:427,458-492,552` `path_collision_key`/`probe_case_insensitive`/`detect_path_collisions`, wired in `download.rs:32`; `multi-depot-collision` fixture covered by `golden.rs` (pass) |
| T-73-17 | EoP | med | mitigate | CLOSED | `post.rs:231,252` `SetFileAttributesW` via `windows-sys`; grep `Command::new\|process::Command` over `crates/gamelib-depot/src`: 0 hits |
| T-73-18 | Tampering | med | mitigate | CLOSED | Drift: ACF text now built in `gamelib-steamfiles/src/acf.rs`. `vdf_escape` (:222-233) used on `installdir` and `name` (:265-266); `assert_numeric`/`assert_numeric_buildid` on app id, depot ids, manifest ids, buildid (:249-260 area); `depot/acf.rs:111,179,208` `check_app_id` and numeric `last_owner`; `installdir` contained under `steamapps/common` via `resolve_contained_path` (`depot/acf.rs:182`). TS `sanitizeInstalldir`/`resolveSteamInstallTarget` still present (`steam/acfInstalldir.ts`, `gameInstallDepot.ts`) |
| T-73-19 | Tampering | med | mitigate | CLOSED | `gamelib-steamfiles/src/atomic.rs:49-86` `atomic_write`: unique tmp opened `create_new`, `sync_all`, same-dir `rename`, tmp removed on error; called by `write_app_manifest` (`acf.rs:~290`). Drift: now shared with `shortcuts.vdf` (75 D-11) |
| T-73-20 | Integrity | high | mitigate | CLOSED | `depot/acf.rs:71-82` `can_write_full_ownership` requires Completed, 0 failures, non-empty non-"0" buildid, `all_files_verified`, `all_modes_applied`; `finalize` ANDs it with the TS policy input `spec.allow_full_ownership` (:185). `run_finalize_op` (`lib.rs:~175`) hard-codes `all_files_verified: false` (fail closed). Test `policy_false_forces_1026` at `tests/acf.rs:364` and `absent_or_zero_buildid_writes_1026` (pass; 38 acf tests) |
| T-73-21 | DoS | med | mitigate | CLOSED | `reconcile.rs:179-220` hashing on `spawn_blocking` behind `Semaphore::new(hash_threads.max(1))`, `cancel.is_cancelled()` checked per file (:194,205); reconcile tests pass |
| T-73-22 | DoS | med | mitigate | CLOSED | `manifest.rs:345-355` section length checked against `MAX_MANIFEST_BYTES` and `buf.len() - pos` before slicing; prost errors mapped to `DecodeError`, no panic (manifest tests pass) |
| T-73-23 | Tampering | high | mitigate | CLOSED | `manifest.rs:464-466,494-503` `cache_path` returns `None` unless depot and gid are all digits (<= 20); `prune_dir` re-checks (:556); test `cache_path_rejects_non_numeric_ids` at `tests/manifest.rs:307` (pass) |
| T-73-24 | Info disclosure | med | mitigate | CLOSED | `manifest.rs:545` `write_atomic(&path, bytes)` writes the fetched raw bytes; `key` is only passed to `parse_manifest`; cache dir is 0700 (`depot_dispatch.rs:46-56`) |
| T-73-25 | Tampering | med | accept | ACCEPTED | Accepted Risks log, AR-73-02 |
| T-73-26 | Info disclosure | low | mitigate | CLOSED | `tests/fixtures/README.md:45` "Never add game content", inline PRNG; `fixtures_parse_and_stay_small` pass (size cap) |
| T-73-27 | Tampering | low | mitigate | CLOSED | `fixtures_are_deterministic` in `tests/fixtures_gen.rs` pass (non-ignored; `regenerate_fixtures` is the ignored one) |
| T-73-28 | Tampering | med | mitigate | SUPERSEDED | Drift: the TS oracle generator (and the whole TS depot pipeline) was deleted in 73-19/20; only the committed goldens remain (`tests/fixtures/expected.json`, consumed by `golden.rs`, pass). The tampering surface (oracle writing outside temp dirs) no longer exists. Wave-time record: 73-08-SUMMARY "mkdtemp roots, containment HOME asserted" (PROCESS) |
| T-73-29 | Info disclosure | low | mitigate | CLOSED | `grep -cE '"/(Users|home|tmp|var)|[A-Z]:\\\\' tests/fixtures/expected.json` = 0 |
| T-73-30 | DoS | low | mitigate | SUPERSEDED | The lingering-HTTP-server oracle was deleted with the TS pipeline (73-19/20); no jest oracle server exists. 73-08-SUMMARY records unref/close at wave time (PROCESS) |
| T-73-31 | Tampering | high | mitigate | CLOSED | Every write path through `resolve_contained_path` (T-73-14); per-chunk SHA1 in `decode_chunk` before `write_all_at` (`download.rs:424-431`); whole-file SHA1 `download.rs:582-596` before modes; test `whole_file_sha1_mismatch_is_file_failure` at `download.rs:1353` (pass). The delta path repeats the whole-file SHA1 gate (`delta.rs:593-606`) |
| T-73-32 | DoS | med | mitigate | CLOSED | `events.rs:6-10,24-26` progress throttled (500 ms / 1 %), no per-chunk events, warnings coalesced once per second; shell queue `EVENT_QUEUE_BOUND = 64` with `try_send` (`depot_dispatch.rs:11,137`) |
| T-73-33 | DoS | med | mitigate | CLOSED | `download.rs:64,1063` decode semaphore sized from `available_parallelism`; `lib.rs:43` runtime `.worker_threads(2)`; `inflight.rs` bounded in-flight limiter |
| T-73-34 | Tampering | high | mitigate | CLOSED | Cancel checked per file/chunk/backoff: `download.rs:295,385,411,426,430,582,647`; test `no_writes_after_return` at `tests/job_install.rs:364` (pass). Shell cancels all jobs on sidecar EOF (T-73-48) |
| T-73-35 | Info disclosure | med | mitigate | CLOSED | Warnings carry host and path only: `fetch.rs:107` `AttemptErr` holds no URL; the URL with token query is built only at `fetch.rs:545` and never formatted into a failure or warning |
| T-73-36 | Info disclosure | med | mitigate | CLOSED | `job.rs:130-141,158-165` `DepotSummary`/`SummarizeResult` carry counts, `matches` (capped by `MATCH_CAP`), installscript names, skipped depot ids; no file list or chunk data |
| T-73-37 | DoS | med | mitigate | CLOSED | `manifest.rs:155,230` `tokio::time::timeout(Duration::from_secs(45), work)` |
| T-73-38 | Tampering | med | mitigate | CLOSED | `download.rs:881-886` `select_paths` is only a filter over manifest entries (`normalize_depot_path` set membership); each selected file still written via `write_file` -> `resolve_contained_path` (:468); a path not in the manifest is never written |
| T-73-39 | Integrity | med | mitigate | CLOSED | verify_only goes through reconcile full SHA1 (`reconcile.rs`, `download.rs:750` `all_files_verified`) and the single gate T-73-20; `tests/job_modes.rs` `verify_only_reports_missing_and_writes_1026` (pass) |
| T-73-40 | Spoofing | med | mitigate | CLOSED | `src/common/types/ipc/sidecarInternal.ts:129-138` `depotCdnToken`, `depotManifestRequestCode`, `depotJobEvent` all `caller: 'shell'`; test "all three channels carry caller shell" (`depotHostChannels.test.ts`, pass); `validateInbound` rejects malformed payloads (same file, pass) |
| T-73-41 | Info disclosure | high | mitigate | CLOSED (drift) | Named test `token_never_logged` does not exist under that name. Drift: Phase 79 (CF-06) made `depotCdnToken` answer `''` and never request a CDN token (`depotHostRegistration.ts:58-72`, test "answers \"\" for a registered job: no CDN token is ever requested (CF-06)", pass), which removes the token from the pipe and logs. Logging discipline still holds: `depotHostRegistration.ts:34-42` logs channel, jobId and `err.name` only; `depot_dispatch.rs` header and body format no job/event/token/argument into any log (grep: only `shell_diag` count line :292); `rustDepot.ts:88` logs jobId and status; `jobBuilder.ts:2` "Never logs the job" |
| T-73-42 | Tampering | med | mitigate | CLOSED | `sidecarInternal.ts:25-62` `z.strictObject` schemas with `numericId`, host max 253, depots `.max(512)`, message length cap; unknown jobId dropped (`depotHostRegistration.ts:114-121`, `jobRegistry.ts`) - suite pass |
| T-73-43 | DoS | med | mitigate | CLOSED | `jobRegistry.ts:7,58,65` closure `Map`, "no timers, watchers, sockets or handles", disposer removes only its own entry; `depotHostRegistration.ts` creates no timers (header :23, grep `setTimeout\|setInterval` 0 hits in both) |
| T-73-44 | Integrity | med | mitigate | CLOSED | `depotRust/errorMap.ts` with `depotRustErrorMap.test.ts` (D-09 every-kind test); `depotRust/**` suites pass (run) |
| T-73-45 | Spoofing/Tampering | high | mitigate | CLOSED, see O-1 | Channels are the generated enum, no wildcard arm: `rust_dispatch.rs:118-121` routes the four depot channels, unknown names return `rustInvoke:unknown-channel` (71 T-71-23); args via generated `DepotJobRunArgs::from_args` + crate `deny_unknown_fields`; `depot_dispatch.rs:18-41` `guard_install_root` (absolute, no `.`/`..`, a `steamapps` ancestor) called at `rpc_depot_job_run` (:222); cache dir shell-owned (`manifest_cache_dir`, :46-62; `JobContext` never from args). Tests `install_root_guard_rejects_relative_dotdot_and_non_steamapps` (:348) and `..._accepts_library_bridge_and_redist_roots` pass (cargo test) |
| T-73-46 | Info disclosure | med | mitigate | CLOSED | `depot_dispatch.rs:6` "Nothing here formats a job, event, token or argument into a log line"; grep of that file for `format!`/log macros finds only error-code strings and `shell_diag("depot jobs cancelled on sidecar EOF: {n}")`; crate: grep `println!\|eprintln!\|dbg!\|log::\|tracing::` 0 hits, `dbg_macro = "deny"` in `gamelib-depot/Cargo.toml` |
| T-73-47 | DoS | med | mitigate | CLOSED | `depot_dispatch.rs:11,87,131-149` per-job `sync_channel(64)`, `try_send`, progress/host summary droppable, others one 2 ms retry then drop |
| T-73-48 | Tampering | high | mitigate | CLOSED | `sidecar.rs:665` `on_sidecar_eof_cancel_jobs()` on stdout EOF (-> `registry::cancel_all`, `depot_dispatch.rs:290-293`); `main.rs:745` `cancel_all_and_wait(EXIT_FINALIZE_WAIT)` (5 s) at exit before the sidecar is killed; test `depot_eof_cancels_all_jobs` at `depot_dispatch.rs:402` (pass) and registry tests `cancel_all_and_wait_returns_after_guards_drop` (pass). Live: UAT item 4 `depot jobs cancelled on sidecar EOF: 1`, no write after kill (PROCESS) |
| T-73-49 | DoS | med | mitigate | CLOSED + PROCESS | Code: `jobRegistry.ts` no timers; abort path `rustDepot.ts:80-82` `cancelDepotJob` on `abort`. `smoke:sidecar` PASS recorded in 73-12/20/21-SUMMARY (PROCESS, not re-run). Live: UAT item 9 (Force Quit orphaned an idle sidecar, ESTABLISHED sockets) was operator-accepted for the delete gate as a pre-existing exit-contract defect; its todo `2026-11-09-sidecar-orphaned-after-tauri-dev-ctrl-c.md` is now in `todos/completed/`, and 73-VERIFICATION re-verification saw an ordinary Cmd-Q exit with no orphan. See O-3 |
| T-73-50 | Tampering | med | mitigate | CLOSED | `acfInstalldir.ts`/`gameInstallDepot.ts` still carry `sanitizeInstalldir`/`resolveSteamInstallTarget`; shell `guard_install_root` (T-73-45); crate re-contains installdir under `steamapps/common` (`acf.rs:182`) |
| T-73-51 | Info disclosure | med | mitigate | CLOSED | `jobBuilder.ts:2` "Never logs the job: it carries depot keys"; grep of `jobBuilder.ts` for logger calls: none other than the header comment; `rustDepot.ts:88` jobId/status only; `depotJobInputs.test.ts` passes |
| T-73-52 | Integrity | med | mitigate | SUPERSEDED | The TS/Rust flag no longer exists: `depotPortComplete.test.ts:73` lists `GAMELIB_DEPOT_PIPELINE` in `FORBIDDEN` and the deletion test passes (run); grep of `src`, `meta`, `src-tauri/src` for the flag outside tests: 0 hits. Mixed-stage hazard removed |
| T-73-53 | DoS | low | mitigate | SUPERSEDED | No flag value to misread (same evidence as T-73-52) |
| T-73-54 | Tampering | med | mitigate | CLOSED | Same code as T-73-38 and T-73-45; `rustSecondary.test.ts` (select_files originalRestore path) passes; `steam/depotPaths.ts` `resolveContainedPath` kept for `bridge/originalRestore.ts` (T-73-70) |
| T-73-55 | DoS | med | mitigate | CLOSED | `depotRust/**` creates no timers; job cancelled on EOF (T-73-48); startup resume uses the existing breadcrumb gating (UAT item 7 "persisted Steam queue head ... NOT auto-resuming", PROCESS) |
| T-73-56 | Integrity | med | mitigate | CLOSED | Rust gate fail-closed (T-73-20); resume verify path `download.rs:1115` sets `all_files_verified` only from reconcile; `install.ts:191` comment/policy feed to `allowFullOwnership`; `run_finalize_op` never proves verification |
| T-73-57 | Info disclosure | med | mitigate | CLOSED | `meta/gamelibDepotCli.ts:107` and `meta/depotParitySweep.ts:86` call `createFakeHomeProfile({ prefix })` per spawn; `depotParitySweep.test.ts:145`, `gamelibDepotCli.test.ts` pass (run) |
| T-73-58 | Info disclosure | med | mitigate | CLOSED | `depotParitySweep.ts:22,183-195` redaction: sha1 of relative path (12 hex) plus basename; secret strings redacted at :369; tests assert no absolute paths (suite pass) |
| T-73-59 | Info disclosure | med | mitigate | CLOSED | `gamelib-depot-cli/src/main.rs:12,26-41` tokens come from stdin map only; CLI prints events/outcome only; `tests/cli.rs` and `gamelibDepotCli.test.ts` pass. Drift: the production path no longer has tokens (CF-06) |
| T-73-60 | Integrity | med | mitigate | CLOSED | `depotParitySweep.ts:21,380-402,438-439` zero inputs / unreadable log -> exit 3, `missingCodecs` -> failed; covered by the sweep test (pass) |
| T-73-61 | Info disclosure | med | mitigate | PROCESS | 73-PARITY.md redacted; my grep of 73-PARITY/UAT/VERIFICATION for `/Users/`, `/home/`, drive paths, 7656119 ids: only the synthetic `/Users/me/...` test fixture quote at PARITY:233. Scratchpad deletion not verifiable |
| T-73-62 | Tampering | med | mitigate | PROCESS | PARITY "Corpus" and "Phase 74 fixtures" state the dedicated `PARITY_LIB` and that the six Phase 74 fixtures were not touched. Disclosed incident: Civ V was uninstalled from the real library by a misconfigured `defaultSteamPath` (PARITY "Incidents"); operator-side, restored |
| T-73-63 | Repudiation | low | mitigate | PROCESS | PARITY records `exit code: 1` with per-title outcome lines and the explained ACF-counter deviation (:131,:165,:178) |
| T-73-64 | Integrity | med | mitigate | PROCESS, see O-4 | Plan precondition was "PARITY exit 0 + approval". The sweep exited 1 (ACF counter fields, Stellaris `DownloadType`/`TargetBuildID`); the operator explicitly approved as Steam's own post-adoption rewrite, file trees identical (PARITY :3,:172-178,:276). Flip happened after approval, not before |
| T-73-65 | Repudiation | low | mitigate | PROCESS | `73-UAT.md` items 1-9 each name the `[depot-rust] outcome ...` log line with timestamps |
| T-73-66 | Info disclosure | low | mitigate | PROCESS | UAT/PARITY paste only proof lines; grep in T-73-61 found no tokens or non-basename paths (73-18-SUMMARY:92) |
| T-73-67 | Repudiation | med | mitigate | PROCESS | PARITY `## Delete gate (D-15)` :274-278 three `- [x]` lines before 73-19; 73-18-SUMMARY:9,92 |
| T-73-68 | Repudiation | med | mitigate | PROCESS | 73-19-SUMMARY "Precondition (T-73-68)" :68-70 records reading the gate before any change |
| T-73-69 | Integrity | med | mitigate | PROCESS | 73-19-SUMMARY coverage table maps removed TS assertions to Rust tests (:~100-188); the golden and codec tests it points to pass (run) |
| T-73-70 | Integrity | med | mitigate | CLOSED | `steam/depotPaths.ts` exports `resolveContainedPath` and `sha1File`; `__tests__/depotPaths.test.ts` passes (run) |
| T-73-71 | DoS | low | mitigate | PROCESS | `pnpm smoke:sidecar` PASS recorded in 73-20-SUMMARY:153 and 73-21-SUMMARY:82 (not re-run here) |
| T-73-72 | DoS | med | mitigate | SUPERSEDED | Plan: "gate asserts lzma/zstddec kept". Drift: Phase 79 retired steam-user, so `depotPortComplete.test.ts:143-155` now asserts `lzma`, `zstddec`, `lzma-native` are all absent from package.json and no patch for them exists (`patches/` holds only `@types__node@22.19.3.patch`); the test passes (run). Boot proof was the 73-21 `smoke:sidecar` (PROCESS) and is stale for the current tree |
| T-73-73 | Tampering | med | mitigate | SUPERSEDED | `patches/steam-user.patch`/`lzma.patch` no longer exist (asserted by `depotPortComplete.test.ts:153-154`); `pnpm-workspace.yaml` has no lzma/steam-user entry. No hand-edited patch drift possible. Not re-run: `pnpm install --frozen-lockfile` |
| T-73-74 | Integrity | med | mitigate | CLOSED | `src/backend/__tests__/depotPortComplete.test.ts` `DELETED` (:14) and `FORBIDDEN` (:68) lists with comment-stripping scan, self-test that a forbidden symbol in code is caught (:132-137) and anti-vacuity >= 500 files (:157); suite passes (run) |

Counts: 75 entries; CLOSED on code or direct run 52 (including the 3 CLOSED with drift notes), SUPERSEDED 6 (T-73-28, 30, 52, 53, 72, 73), PROCESS-only 15 (T-73-61..69, 71 and the process halves of T-73-SC, 49), ACCEPTED 2. No entry open. No BLOCKER.

## Accepted Risks Log

| ID | Threat | Rationale | Verification |
|----|--------|-----------|--------------|
| AR-73-01 | T-73-13 plaintext http CDN hosts (Spoofing, low) | Valve-sanctioned for non-mandatory content hosts. Integrity does not depend on transport: every chunk is length+SHA1 checked against the manifest before any write (`container.rs:349-360`) and again as a whole-file SHA1 (`download.rs:582-596`); redirects are disabled (`fetch.rs:144`). Residual: an on-path observer sees chunk requests and hosts. Code: `fetch.rs:545` `scheme_for(meta)` |
| AR-73-02 | T-73-25 unsigned manifest (Tampering, med) | Matches the TS behaviour: the manifest signature section (`SIGNATURE_MAGIC`) is parsed past, not verified (`manifest.rs:~341`). A forged manifest can only name files and chunk hashes; every written byte is still gated by per-chunk and whole-file SHA1 against that manifest, so a malicious manifest source (CDN/MITM on an http host) could substitute content that is self-consistent with its own manifest. Path containment (T-73-14/15) bounds where it can write. Request codes come from the signed-in Steam CM session, which narrows the practical exposure |

## Observations (not blockers)

- **O-1 (T-73-45 scope).** `guard_install_root` is applied at `rpc_depot_job_run` only. `rpc_depot_finalize` (added by 75-19, after this phase) and the finalize-op arm take `finalize.steamapps_dir` from the sidecar request without the guard: `depot/acf.rs:180` writes `appmanifest_<id>.acf` (numeric id, atomic write) under whatever absolute directory is supplied and creates it (`create_dir_all`, :~203). `check_app_id` and the numeric/escaped ACF content bound what is written, and the sidecar is the same trust domain that already supplies `installRoot`. The threat register's mitigation (guard on job run, cache dir shell-owned) is verified; this is a coverage gap in a later-added op. Suggested follow-up: reuse `guard_install_root` on `steamapps_dir`'s `steamapps` ancestor in `rpc_depot_finalize`.
- **O-2 (T-73-15).** `resolve_contained_path` and `check_symlink_target` are purely lexical (`lexical_resolve`), a deliberate port of the TS `relative()` check. They do not follow symlinks already on disk, so a pre-existing in-tree symlink chain is not re-resolved before writes. Same as TS behaviour and out of this plan's mitigation text; noted for completeness.
- **O-3 (T-73-49).** The live Force Quit orphan (UAT item 9) was a sidecar exit-contract defect, accepted by the operator for the delete gate on 2026-11-09 with the rationale "the Rust pipeline stopped all writes". Its todo is completed and the 2026-11-10 re-verification saw a clean Cmd-Q; I did not re-reproduce a Force Quit.
- **O-4 (T-73-64).** The flip precondition was literally "sweep exit 0". It was met by an operator-approved explained deviation (exit 1). The decision is recorded, so this is closed as PROCESS, but a reader should not read it as a zero-diff sweep. Peak RSS was never sampled (D-17) and the cross-depot collision path was not exercised live (PARITY :174).
- **O-5.** `73-VERIFICATION.md` lists a surviving TS `canWriteFullOwnership`/ACF writer for zero-depot and resume-failure paths. Current code: `grep canWriteFullOwnership` in `src/backend` non-test finds only comments (`install.ts:191`, `installPollOnce.ts:123,427`), and the Rust `run_finalize_op` serves the no-download case, so that duplicate gate is gone (consistent with 75-19).
- **O-6.** Named mitigation tests that moved or changed: `token_never_logged` has no namesake (see T-73-41); `depotPipelineFlag.test.ts` renamed to `depotJobInputs.test.ts`; the ACF writer and `vdf_escape` moved from the depot crate to `gamelib-steamfiles`.

## Unregistered Flags

None. Every `## Threat Flags` section in 73-01..21-SUMMARY says None, and I found no new attack surface that lacks a register entry beyond the O-1 coverage note (a later-phase op).

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-16 | 75 | 75 (52 code/run, 6 superseded, 15 process, 2 accepted overlap counted in the register) | 0 | gsd-security-auditor (State B, created) |

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in the Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

Approval: verified 2026-11-16
