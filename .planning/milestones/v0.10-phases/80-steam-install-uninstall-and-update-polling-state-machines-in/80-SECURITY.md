---
phase: 80
slug: steam-install-uninstall-and-update-polling-state-machines-in
status: verified
threats_open: 0
asvs_level: 1
created: 2026-11-16
---

# Phase 80 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

Register authored at plan time (33 PLAN.md `<threat_model>` blocks). Mitigations verified against HEAD `af892de18`, after both review-fix rounds (`git log --grep='^fix(80):'`); where a fix moved or replaced a mechanism, the evidence cites its current location. Verification only — no new-threat scan. ASVS 1, block_on high (defaults; not configured).

---

## Trust Boundaries

| Boundary | Description | Plans |
|----------|-------------|-------|
| sidecar -> shell (state-event reply) | AckReply arrives from the sidecar process | 80-01 |
| CI workflow | rust-test.yml gains new -p arguments | 80-01 |
| test fixtures -> driver | timeline JSON read by tests only | 80-02 |
| shipped locale files -> notification text | locale JSON is shipped content | 80-03 |
| game title (from library) -> interpolation | titles come from Steam metadata | 80-03 |
| on-disk ACF / libraryfolders.vdf -> Rust | files other software (Steam, a user) can write | 80-04 |
| caller-supplied appId and roots -> path joins | from the sidecar via rustInvoke (plan 18) | 80-04 |
| on-disk ACF installdir -> remove_dir_all | a planted ACF could aim deletion anywhere | 80-05 |
| sidecar-supplied appId/roots -> remove_copy | via rustInvoke (plan 18) | 80-05 |
| Rust -> /bin/sh watchdog child | argv crosses into a shell script | 80-06 |
| content_log.txt -> parser | file written by Steam | 80-06 |
| restart-hold JSON on disk -> Rust | user-state file, untrusted content | 80-07 |
| config.json -> Rust | user-editable settings | 80-07 |
| ps/pgrep/tasklist output -> parser | OS process listings | 80-07 |
| Windows registry / registry.vdf -> Rust | values Steam (or anything in the user session) writes | 80-08 |
| Rust -> sidecar state events | sidecar applies them to its in-memory state | 80-09 |
| installed game files -> probe | binary and Info.plist from a downloaded game | 80-10 |
| shell -> sidecar invoke frame | the shell is the only caller (caller 'shell'), payload zod-validated | 80-11 |
| Rust -> steam-bridge-helper | bundled binary, argv | 80-12 |
| helper stdout -> parser | last-line JSON | 80-12 |
| ACF state -> completion decision | Steam-written files | 80-13 |
| ACF / monitor observations -> step | Steam-written state | 80-14 |
| sidecar start args -> loop | appId, title, roots, options via rustInvoke | 80-15 |
| persisted hold records -> poll start | user-state file read at boot | 80-16 |
| rustInvoke args -> dispatch | from the sidecar (plan 18 adds generated validation in front) | 80-17 |
| sidecar stdout -> shell router | rustInvoke frames, possibly forged by a compromised sidecar | 80-18 |
| Jest -> CLI child | spawned test process | 80-19 |
| shell -> sidecar invoke | state events into Node | 80-20 |
| sidecar -> shell ack | reply parsed by Rust | 80-20 |
| shell -> OS notification | translated text | 80-20 |
| process env -> flag | GAMELIB_STEAM_POLLS, dev-only | 80-21 |
| sidecar -> shell rustInvoke | start args with title and roots | 80-22 |
| sidecar -> Rust mirror pushes | in-flight set changes | 80-23 |
| sidecar -> Rust | uninstall start args, claim ids | 80-24 |
| TS wrapper -> Rust removal | deletion request | 80-25 |
| default flip | every user build now runs Rust polls | 80-26 |
| live run against the operator's real Steam account | real profile, deliberate | 80-27 |
| test suite | coverage moving from Jest to cargo | 80-28, 80-29 |
| removal of the ts arm | no fallback for these functions | 80-30 |
| removal of the fallback | Rust polls are the only implementation | 80-31 |
| future edits | reintroduction of TS poll code | 80-32 |
| live run on the operator's account | named real-profile arm | 80-33 |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Evidence at HEAD | Status |
|-----------|----------|-----------|-------------|------------------|--------|
| T-80-01 | Tampering | AckReply parse | mitigate | `SP/src/events.rs:121-139`: `#[serde(default)]` on every field, `from_value` falls back to `not_acked()` with `unwrap_or_else`. The shell's only parse site is `src-tauri/src/steampoll_dispatch.rs:351-355` (`ack_from_invoke`: Ok goes to `from_value`, Err goes to `not_acked`). Tests: `SP/tests/contracts.rs:120-127` and `steampoll_dispatch.rs:761` (`"garbage"` becomes `not_acked`). | closed |
| T-80-02 | Information disclosure | crate logging | mitigate | `SP/src/lib.rs:7` states the T-28-04 / T-80-02 rule. I checked every `eprintln!`/`log(` in `SP/src` (acf_copies, hold, outbox, rearm, install_loop) and the `shell_eprintln!` lines in `steampoll_dispatch.rs`. They log only appId, source, kind, counts, `io::ErrorKind` or fixed reason strings. None logs a path, args or payload. | closed |
| T-80-03 | Denial of service | panics in dispatch | mitigate | `SP/src/dispatch.rs:503-506`: `catch_unwind(AssertUnwindSafe(\ | closed |
| T-80-04 | Information disclosure | fixtures | mitigate | All 81 `appId` values in `SP/tests/fixtures/{timelines,expected-ts}` are `"1000"` and all 65 titles are `"Test Game"`. Paths are only `/fake/steam`, `/fake/bottle` and `/fake/bridge`. Neither directory contains `/Users/`, `/home/` or a real user name. | closed |
| T-80-05 | Tampering | goldens silently regenerated | mitigate | Commit `a281e00bd` (80-29) deleted the `UPDATE_STEAMPOLL_GOLDENS` TS writer (`steamPollTsDriver.test.ts`, `tsDriver.ts`), so nothing in `src/`, `meta/` or `src-tauri/` can write `expected-ts/*.json` any more. The only consumer, `gamelib-steampoll-cli/tests/frozen_parity.rs:83-95`, reads and asserts and has no write path. Silent regeneration is not possible. Doc nit: `SP/tests/fixtures/timelines/README.md:5-11` still tells readers to regenerate with the deleted driver. | closed |
| T-80-06 | Spoofing | interpolated titles | mitigate | `gamelib-i18n/src/lib.rs:126-135` `escape()` covers `& < > " ' /` and produces `&amp; … &#39; &#x2F;`. `gamelib-i18n/tests/render.rs:14` compares every golden row in `tests/fixtures/rendered.json` (48 escaped rows). | closed |
| T-80-07 | Denial of service | malformed locale JSON | mitigate | `gamelib-i18n/src/lib.rs:64` (`if let Ok(value) = serde_json::from_str` skips the file on a parse failure) and `:36` (`FALLBACK = "en"`). Tested in `gamelib-i18n/tests/render.rs:53` `malformed_locale_file_falls_back_to_en`. | closed |
| T-80-08 | Tampering | appId in `appmanifest_{id}.acf` join | mitigate | `SP/src/acf_state.rs:58` `is_numeric_app_id` is checked before every join, at `:134` (`read_acf_state_located`), `:194` (`read_acf_update_state`) and `:208-211` (`read_acf_update_fields_from_dir`). Tested in `SP/tests/acf_state.rs:444-451` with `../1`, `1/../2`, `""`, `1a`, `-1` and `" 1"`. | closed |
| T-80-09 | Tampering | hostile installdir in ACF | mitigate | `SP/src/acf_state.rs` has no `fs::remove*` or `fs::write` call. It only reports `install_path`. The crate's only deletion sites are `SP/src/acf_copies.rs:395,405,414`, all behind `guard_install_root` (T-80-11). | closed |
| T-80-10 | Denial of service | malformed ACF | mitigate | `read_acf_state_located` returns `Unknown` or `Absent` and never panics (`SP/src/acf_state.rs:133-143`). The source files have no `unwrap`/`expect`/`panic!`. Tested in `SP/tests/acf_state.rs:150` (`\0{{{` manifest), `:396`, `:408` and `:430`. | closed |
| T-80-11 | Tampering | path traversal in installdir | mitigate | `SP/src/acf_copies.rs`: `installdir_shape` refuses Nested and Escaping (`:356-370`; absolute or `:`/NUL at `:132`, `is_absolute/has_root` at `:240`). The library root is pinned to the manifest's own `steamapps_dir` (`:350-352` comment and `:378`). `guard_install_root` (`:278-322`) rejects dot segments and a missing `steamapps` ancestor, then checks `canonicalize(root).starts_with(canonicalize(steamapps)/common)` (`:311-321`). Tests: `SP/tests/acf_copies_security.rs:61-143`. | closed |
| T-80-12 | Tampering | symlink / junction escape | mitigate | `SP/src/acf_copies.rs:300-306`: `is_symlink`/`is_reparse_point` refusal of `install_root` and `common` (`symlink_metadata` at `:258`, Windows reparse attribute at `:263-268`). Tests: `SP/tests/acf_copies_security.rs:250,261,275` (unix) and `:288` (Windows, cfg-gated). The summary says the Windows branch was not run on this host. | closed |
| T-80-13 | Elevation of privilege | non-numeric appId into a path | mitigate | `SP/src/acf_copies.rs:32-34` `is_numeric_app_id`, checked first in `remove_copy` (`:328-331`). `dispatch.rs` also calls `numeric_app_id(op, &a.app_id)?` per op (e.g. `:496`). Test: `acf_copies_security.rs:53`. | closed |
| T-80-14 | Repudiation | silent deletions | mitigate | Every `remove_copy` outcome logs appId, source and outcome and no path: `SP/src/acf_copies.rs:329,337,360,366,384,391,407,415` (`remove_copy removed appId {app_id} source {src}`). | closed |
| T-80-15 | Elevation of privilege | watchdog spawn | mitigate | `SP/src/monitor.rs:30-51`: `WATCHDOG_SH` is a fixed `r#""#` literal. `build_watchdog_spawn` (`:55-69`) passes `parent_pid`, `watch_pid` (`u32::to_string`) and fixed `inner_argv` (`:71-91`, absolute `/usr/bin/script`, `/usr/bin/nettop`, steam pid as `u32`) as positional args after `-c SCRIPT gamelib-watchdog`. Nothing is formatted into the script text. | closed |
| T-80-16 | Denial of service | orphaned nettop after a hard kill | mitigate | The watchdog loop checks `kill -0 "$p"` with `sleep 1` (`SP/src/monitor.rs:43-49`). `kill_on_drop(true)` is set in `SP/src/runtime.rs:53,75`. `stop_all` is at `monitor.rs:396`, through `install_loop.rs:522` and `src-tauri/src/steampoll_dispatch.rs:266-280` (`steampoll_exit_shutdown`), and is called from `src-tauri/src/main.rs:760`. The plan's smoke-1 live check is a runtime step I did not repeat. | closed |
| T-80-17 | Denial of service | huge content_log | mitigate | `SP/src/monitor.rs:25` `MAX_TAIL_BYTES = 256 * 1024`, applied at `:101` and `:108`. | closed |
| T-80-18 | Information disclosure | profile leakage in tests | mitigate | `TokioRunner` (`SP/src/runtime.rs:48-53,70-75`) sets no `env` literal: only args, null stdin and pipes. The crate tests use `tempfile`/`temp_dir`. The `frozen_parity.rs:18` CLI spawn uses `.env_clear()`. The profile fixtures use the synthetic `/Users/gamer`. | closed |
| T-80-19 | Tampering | hold record parse | mitigate | `SP/src/hold.rs:68-98` `parse_record` checks every field by type (pid 1..=u32::MAX, non-empty token, finite `recordedAt`, string-array `skippedDepots`) and returns `None` otherwise. `list`/`read` filter through it (`hold.rs` `list`/`read`). Rejects are logged at `:374`. | closed |
| T-80-20 | Tampering | store write races with the sidecar | mitigate | R3 is recorded at `SP/src/lib.rs:24`. `hold.rs:184-189` has a process-wide `STORE_LOCK` for read-modify-write (A/WR-03). `save` (`:244-272`) writes a per-write temp name (`.tmp-{pid}-{n}`), mode 0600, `sync_all`, then `rename`. An unparseable store is never overwritten (`:315,347`). | closed |
| T-80-21 | Tampering | defaultSteamPath from config | mitigate | `SP/src/profile.rs:133` `default_steam_path()` returns `Option<String>`. Its uses (`dispatch.rs:133,442`, `rearm.rs:47-49`) are read roots or probe roots only. The crate's only deletion path (`acf_copies.rs:405`) goes through `guard_install_root`. | closed |
| T-80-22 | Elevation of privilege | probe spawns | mitigate | `SP/src/hold.rs:462-530`: fixed programs (`%SystemRoot%\System32\tasklist.exe`, `/usr/bin/pgrep`, `/bin/ps`; Linux uses bare `pgrep`/`ps`) and argv `Vec`s. Pids are filtered `> 0` and rendered from `u32` (`:513-521`). `running.rs:33-38` is a fixed `ps -eo args`. `monitor.rs:242-243` is `/usr/bin/pgrep`. None goes through a shell. | closed |
| T-80-23 | Tampering | RunningAppID value | accept | Rationale: "only a number shown as status; no path or command is built from it". The code agrees: `gamelib-steamfiles/src/readers.rs:272` parses to an integer and `running.rs:47-50` takes digits only. | closed |
| T-80-24 | Elevation of privilege | reg.exe spawn removed | mitigate | `gamelib-steamfiles/src/readers.rs:301-330` reads `RegGetValueW(HKEY_CURRENT_USER, …, RRF_RT_REG_DWORD)` through `windows_sys`. No `reg.exe`/`"reg"` spawn remains in `gamelib-steampoll/src` or `gamelib-steamfiles/src`; the only mentions are doc comments, `running.rs:3,58`. | closed |
| T-80-25 | Denial of service | overlapping probes | mitigate | `SP/src/running.rs:214-219` runs one spawned task with `interval_at` and `MissedTickBehavior::Delay`. The `in_flight` `AtomicBool` swap guard and RAII reset are at `:126,158,293-297`. A/WR-02 registers the task under `start()`'s lock (`:118,204`). | closed |
| T-80-26 | Denial of service | unbounded queue | mitigate | `SP/src/outbox.rs:33` `MAX_QUEUED_APP_IDS = 256`. `enqueue` (`:162-207`) keeps one entry per (appId, kind) and one install-state kind per appId, and evicts the oldest appId above the cap. The applied-seq map is also capped (`:40,136`). Test: `SP/tests/outbox.rs:348` `queue_is_bounded_by_app_id_cap`. | closed |
| T-80-27 | Denial of service | ack wait stalls polls | mitigate | `SP/src/outbox.rs:266-267` wraps each send in `tokio::time::timeout(ACK_TIMEOUT_MS)` (`constants.rs:38` = 5000). When not ready, `not_acked()` is returned with no send (`outbox.rs:305-320`). Tests: `tests/outbox.rs:77` (5 s then log) and `:103` (not-ready runs post-ack effects at once). The shell side also bounds the invoke under the crate timer (B/WR-02 `c65ec88bd`, B/WR-01 `9af1a4394`). | closed |
| T-80-28 | Tampering | half-applied replay | mitigate | The `installed`/`uninstalled` events carry the full install object (schema `sidecarInternal.ts:110-153`). The handler writes the whole install state (`src/backend/sidecar/steamPollEventRegistration.ts` `applyInstalled`/`applyUninstalled`, `persistAndPush`). C/IN-04 added a per-app seq guard that answers stale events with `applied:true` and no change (header comment, `noteApplied` at about `:261`). The outbox replays in ascending seq (`outbox.rs:13`). | closed |
| T-80-29 | Information disclosure | logs | mitigate | The outbox log lines carry appId and kind only (`SP/src/outbox.rs:164-168,205,257-260,309-313`). | closed |
| T-80-30 | Elevation of privilege | binary path into lipo/file | mitigate | `SP/src/mac_arch.rs:52,59,65`: `runner.run("lipo", vec!["-archs", p])` and `run("file", vec![p])`. These are argv arrays through `TokioRunner` (`Command::args`, no shell). | closed |
| T-80-31 | Denial of service | hung probe | mitigate | `SP/src/mac_arch.rs:17-18` `PROBE_TIMEOUT = 5_000 ms`, passed per probe (`:52`). `runtime.rs:56-57` times out with `tokio::time::timeout`, and `kill_on_drop` kills the child. | closed |
| T-80-32 | Tampering | hostile CFBundleExecutable (../) | mitigate | `SP/src/mac_arch.rs:106-120` `bundle_executable_name` accepts only a bare name: no `/`, `\`, `.` or `..`. The result is `Contents/MacOS/<name>` (`:133-139`). The launch-exe path is lexically contained by `contained()` (`:99-104`). Deviation: the plan says "canonical containment". A symlink placed inside `Contents/MacOS` is not resolved, but the only consequence is a read-only `lipo`/`file` argv probe. This does not leave the `../` threat open. | closed |
| T-80-33 | Spoofing | renderer reaching steamPollStateEvent | mitigate | `src/common/types/ipc/sidecarInternal.ts:191-200` has `steamPollStateEvent: 'shell'`, wired at `channelSchemas.ts:110-115`. The guard is the generated Rust relay allow-list: `src-tauri/src/ipc_contract.rs:488` `RENDERER_CHANNELS` does not list `steamPollStateEvent`, and `src-tauri/src/relay_commands.rs:20-28` `relay_channel_verdict` refuses any channel outside it before the frame crosses the pipe. Plan correction: `validateInbound` (`src/backend/sidecar/ipcValidation.ts:49-80`) does not read `caller`; it only validates the schema. Test: `src/backend/sidecar/__tests__/ipcSchemas/sidecarInternal.test.ts:197-215`. | closed |
| T-80-34 | Tampering | malformed event | mitigate | `sidecarInternal.ts:104-153`: `z.discriminatedUnion('kind', [z.strictObject …])` per kind. `appId: numericId` = `z.string().regex(/^\d+$/).max(20)` (`:21`), `seq: count` (finite, ≥0). C/WR-08 relaxed `sizeOnDisk`/`buildid` to bounded strings (max 256) and `installPath` to max 65536. The handler sanitises `sizeOnDisk` (`sizeOnDiskBytes`). Strictness and the numeric appId check remain. | closed |
| T-80-35 | Information disclosure | logging payloads | mitigate | `steamPollEventRegistration.ts` has two `logWarning` calls: `steamPollStateEvent rearmSettled reconcile failed (${name})` (about `:189`) and `steamPollStateEvent failed for app ${appId} kind ${ev.kind} (${name})` (about `:266`). Both log channel, appId, kind and error name only. | closed |
| T-80-36 | Denial of service | sidecar exit contract | mitigate | Grep of `steamPollEventRegistration.ts` finds no `setTimeout`/`setInterval`/`watch(`/`spawn`/`createServer`. The only detached work is the event-driven `void refreshInstallState().catch(...)` (rearmSettled), which is not a handle and not boot-time work. | closed |
| T-80-37 | Elevation of privilege | helper path | mitigate | crate/update.rs:73 takes the helper only from `host.bridge_helper_path()`. Shell host: shell/steampoll_dispatch.rs:436-438 returns `self.helper`, which is set once at :454 from `bundled_bridge_helper_path(app)` (:321-323). That path is built from the app root, asset dir and arch (:295-308). No rustInvoke op args carry a helper path. | closed |
| T-80-38 | Tampering | appId / library path argv | mitigate | crate/update.rs:54-56 (`is_valid_app_id`, 1-10 ASCII digits) runs at :70-72 before the spawn. :76-81 passes the library path as one argv element through `runner.run(program, argv, ...)`, with no shell. | closed |
| T-80-39 | Denial of service | helper hang | mitigate | The bound is now in Rust (`HELPER_TIMEOUT_MS = 30_000`, crate/update.rs:31), passed to `runner.run` at :83-88. A timeout returns `code: None`, which maps to `helper-failed` (:90-92). Requests cannot overlap: the `in_flight` guard is at :452-456 and is cleared at :285. The install loop awaits the request inside the tick, so `MissedTickBehavior::Delay` also serialises it (install_loop.rs:563, :790-799). | closed |
| T-80-40 | Tampering | appId in start args | mitigate | crate/uninstall.rs:314-316 `valid_app_id`. `start_uninstall` rejects a bad appId at :327-329 before registering or spawning. The dispatch struct `UninstallStartArgs` uses `deny_unknown_fields` (crate/dispatch.rs:315-326). Note: the generated `SteampollUninstallStartArgs` (shell/ipc_contract.rs:2383-2425) checks only that appId is a string, not that it is numeric. This is a deliberate choice documented in src/common/types/ipc/rustInvoke.ts:156-157 ("the crate enforces the numeric constraint"). The planned second numeric check in the generated Args is therefore absent. The authoritative crate check cannot be bypassed, so this is a defence-in-depth deviation, not an open threat. | closed |
| T-80-41 | Denial of service | runaway poll | mitigate | MAX_TICKS cap at crate/uninstall.rs:98-103. One task per appId: `registry.try_register` (crate/registry.rs:116-126) checks and inserts under one map lock, and a duplicate returns `Ok(false)` (uninstall.rs:332-334). This replaced the original check-then-register after review fix A/WR-06 (60e036b2f). | closed |
| T-80-42 | Spoofing | title in notification | accept | See Accepted risks. Notification text goes through `render_notify_text` and then `show_notification` as plain title/body strings (shell/steampoll_dispatch.rs:326-335, :377-391). | closed |
| T-80-43 | Tampering | hostile sizeOnDisk / buildid strings | mitigate | `size_on_disk: String` and `buildid: Option<String>` are carried as strings in the event (crate/events.rs:25-32). The TS handler at src/backend/sidecar/steamPollEventRegistration.ts:86-89 `sizeOnDiskBytes` does `Number(raw)` and clamps non-finite or negative values to 0. It then calls `getFileSize(...)` at :102 and :119. This is stricter than the planned `getFileSize(Number())`. | closed |
| T-80-44 | Denial of service | Mac arch probe blocking ticks | mitigate | crate/install_loop.rs:786-789 calls `spawn_mac_arch` after the effects are applied. :902-920 runs it as a separate `registry.spawn` task, off the tick. The probe is bounded by `PROBE_TIMEOUT` = 5 s (crate/mac_arch.rs:18, used at :52). | closed |
| T-80-45 | Repudiation | lost completion | mitigate | Completion is an `Effect::Transition`. When an ack fails, `apply_effects_with` calls `outbox.enqueue` (crate/outbox.rs:323). `flush` (:229-258) removes a queued entry only after an applied ack. `mark_ready` (:215) replays on READY and `retry_pending` (:222) retries in session. Since review fixes B/CR-01 (a3285aaff) and B/WR-02 (1ee6107a0), the shell drives the retry loop at shell/steampoll_dispatch.rs:177-258. | closed |
| T-80-46 | Tampering | appId / roots in StartInstallArgs | mitigate | crate/install_loop.rs:141-143 `valid_app_id`, checked first in `start_install_reporting` (:242-245). The install loop only reads roots. The only deletion is `remove_copy` (crate/acf_copies.rs:326ff), which has its own guards: numeric appId (:328-330), state Unknown/in-progress refusal (:335-338), the single-segment installdir check `installdir_shape` (:357-363), and the manifest-root pin from A/CR-01 (5336c1daa). | closed |
| T-80-47 | Denial of service | many polls | mitigate | crate/install_loop.rs:252-255: if the appId already has a slot, `start` upgrades it and returns. Otherwise the slot insert and `registry.register` happen while the `polls` lock is held (:300-303), so only one task can exist per appId. MAX_TICKS caps at :637 and :671. | closed |
| T-80-48 | Denial of service | slow tick overlap | mitigate | `ticker.set_missed_tick_behavior(MissedTickBehavior::Delay)` at crate/install_loop.rs:563 (and uninstall.rs:344). Test at crate/../tests/install_loop.rs:1084 `a_slow_tick_delays_the_next_one_instead_of_overlapping` asserts `max_in_flight == 1` (:1139). | closed |
| T-80-49 | Tampering | forged hold record | mitigate | `HoldStore::list` returns only records that pass `parse_record` (crate/hold.rs:68, filtered at :281). `decide_rearm` (hold.rs:125-164) arms a record only when one of its pids is live (:140-149) and that pid's live start token equals the stored token (:153-162). Otherwise the result is Drop or Unknown, and an Unknown record is not re-armed (crate/rearm.rs:113-127). | closed |
| T-80-50 | Denial of service | boot stall | mitigate | The rearm probes go through `runner.run(..., PROBE_TIMEOUT)` (crate/hold.rs:472-481 and :534). `steampoll_boot` spawns `rearm_persisted_holds` on `gamelib_steampoll::runtime::handle().spawn` and returns at once (shell/steampoll_dispatch.rs:144-157). It is called from setup at shell/main.rs:1619. | closed |
| T-80-51 | Tampering | op args | mitigate | crate/dispatch.rs: 14 `deny_unknown_fields` arg structs (:234-327). `numeric_app_id` (:218-224) is applied in remove_copy, bridge_finalized, cancel_delegated, install_stop, native_in_flight and uninstall_stop. install_start and uninstall_start validate inside `start_install_reporting` and `start_uninstall`, and the read ops validate in acf_state (T-80-08, other slice). `AcfSource` is a serde enum. Bad args return `{op}:bad-args` (:202-209). | closed |
| T-80-52 | Denial of service | panic in an op | mitigate | crate/dispatch.rs:503-506 `pub fn dispatch` wraps `run_op` in `catch_unwind`, which returns `{op}:panic`. All 24 shell arms go through it (shell/steampoll_dispatch.rs, 24 `rpc_steampoll_*` fns). | closed |
| T-80-53 | Information disclosure | CLI env in Jest | mitigate | The Jest spawn of the CLI was deleted. `meta/gamelibSteampollCli.ts` and the TS replay harness were retired in a281e00bd (80-29) and 74f4b0512 (80-31). src/backend/__tests__/steamPollsPortComplete.test.ts:14-26 (`DELETED` list) fails if they come back. Nothing in src/ or meta/ spawns `gamelib-steampoll-cli` (grep). Parity now runs as a cargo test (gamelib-steampoll-cli/tests/frozen_parity.rs), with no Jest child process. | closed |
| T-80-54 | Tampering | arm args | mitigate | Every shell arm calls `Steampoll*Args::from_args(args)?` before `gamelib_steampoll::dispatch` (24/24 arms, e.g. shell/steampoll_dispatch.rs:119-132). The crate then deserialises into `deny_unknown_fields` structs (T-80-51). | closed |
| T-80-55 | Information disclosure | arm logging | mitigate | shell/steampoll_dispatch.rs has 5 `shell_eprintln!` sites (:146, :251, :278, :388, :448). None formats args, paths or titles: :388 logs the `show_notification` error string only, and :278 logs a count. The module header states the rule (:4). | closed |
| T-80-56 | Elevation of privilege | unknown channel | mitigate | shell/rust_dispatch.rs:17-19 `RustInvokeChannel::from_name(channel)` returns `rustInvoke:unknown-channel` before the exhaustive match. Steampoll arms are at :90ff. | closed |
| T-80-57 | Information disclosure | CLI spawn inheriting the real profile | mitigate | Same as T-80-53. The Jest-spawned CLI and its helper module were deleted at the P80 gate and are pinned absent by steamPollsPortComplete.test.ts:14-26, so no Jest-to-CLI child process remains. | closed |
| T-80-58 | Repudiation | divergences silently matched | mitigate | Ledger: crate/../tests/fixtures/divergences.json (DV-80-01, DV-80-02). Stale-ledger failure: gamelib-steampoll-cli/tests/frozen_parity.rs:5, :56-97 (an unledgered diff fails, a ledger entry that no longer diffs fails, an entry with no DV id fails). Write-up and operator acceptance: 80-PARITY.md:3 "Status: APPROVED (2026-11-16, operator)", :46/:55 DV sections, :75 verbatim "approved". | closed |
| T-80-59 | Denial of service | blocking invoke on a tokio worker | mitigate | shell/steampoll_dispatch.rs:419-428: `state.invoke_until(...)` runs only inside `runtime::handle().spawn_blocking`. `notify` uses `std::thread::spawn` (:381). The invoke mechanism changed to `invoke_until` (shell/shell_state.rs:254ff) in review fixes B/WR-01 and B/WR-02. | closed |
| T-80-60 | Denial of service | pending-table growth | mitigate | The bound is now `STATE_EVENT_INVOKE_BOUND = ACK_TIMEOUT_MS - 500ms` (shell/steampoll_dispatch.rs:341-342). It replaced the 5 s bound in B/WR-02 so the invoke settles before the crate timer. It is applied as `timeout_for("steamPollStateEvent")` (shell/main.rs:399-410) and as the `invoke_until` deadline. `invoke_until` removes the pending entry on stale, lock failure and write failure (shell/shell_state.rs:290-302). `await_reply` removes it on timeout (:310ff). | closed |
| T-80-61 | Tampering | forged ack reply | mitigate | `AckReply` has `#[serde(default)]`: `applied: bool` plus Option fields (crate/events.rs:120-128). `from_value` falls back to `not_acked()` (:137-139). The shell's `ack_from_invoke` (shell/steampoll_dispatch.rs:351-356) maps an Err to `not_acked`. | closed |
| T-80-62 | Information disclosure | notification/event logging | mitigate | `ShellPollHost` doc comment at shell/steampoll_dispatch.rs:358; `state_event`/`notify` log nothing but the notify error (:388). Crate log lines name appId/kind/source (e.g. install_loop.rs:264-268, outbox.rs:165, :258). | closed |
| T-80-63 | Denial of service | orphan nettop / polls after quit | mitigate | shell/main.rs:760 `steampoll_exit_shutdown()` runs before `state.shutdown_child()` (:762). It cancels all polls with a bounded wait and stops the monitors (shell/steampoll_dispatch.rs:268-280). The watchdog is anchored on the shell pid (crate/monitor.rs:8-9, :55). The smoke check passed: 80-HUMAN-UAT.md:29-30 found no GameLib nettop or watchdog left after a Force Quit. | closed |
| T-80-64 | Tampering | unknown flag value | mitigate | `GAMELIB_STEAM_POLLS` was deleted at the gate as planned (the flag was removed in 74f4b0512, 80-31). A grep of src-tauri/src, src and meta finds it only in the forbidden-symbol list of steamPollsPortComplete.test.ts:28-36, which fails if it reappears. | closed |
| T-80-65 | Denial of service | boot work blocking setup | mitigate | Same evidence as T-80-50: shell/steampoll_dispatch.rs:142-157 spawns the rearm on the steampoll runtime and returns. Setup calls it at main.rs:1617-1619. | closed |
| T-80-66 | Tampering | double implementation running | mitigate | The TS poll loops and the flag are deleted, so only the Rust implementation can run. installPolling.ts, uninstallPolling.ts and runningPoll.ts are now thin `invokeSteamPoll` wrappers with no `setInterval` or `setTimeout` (grep). Deletion is pinned by steamPollsPortComplete.test.ts:14-36. | closed |
| T-80-67 | Denial of service | sidecar exit contract on the ts arm | mitigate | The TS arm and its interval were deleted (see T-80-66), so the sidecar holds no poll timer. | closed |
| T-80-68 | Information disclosure | logging args | mitigate | src/backend/storeManagers/steam/pollRust/rustSteamPoll.ts:27 logs `[steampoll] rust ${channel}` only. The file header (:3) states "Only the channel is logged, never the args". | closed |
| T-80-69 | Tampering | stale in-flight mirror (one-tick race) | accept | Rationale below. Mirror push exists: `src-tauri/crates/gamelib-steampoll/src/install_loop.rs:494` `set_native_in_flight`, read by the next tick. | closed |
| T-80-70 | Denial of service | reconcile reporting a held game installed | mitigate | `install_loop.rs:469-490` `holding_app_ids()` adds the `pending_rearm` set to `holding` (fail closed). `rearm.rs:43-46` sets pending for every record before the first await and clears it after (`rearm.rs:52-54`). TS consumer: `pollRust/rustSteamPoll.ts:87-101` drops `status.holding` ids, called by `library/refresh.ts:204` and `library/rustRefresh.ts:91`. A status rejection propagates and does not fail open. Test: `tests/install_loop.rs:1358` `pending_rearm_counts_as_holding_and_sets_the_reconcile_flag`, run at HEAD and passing. Boot order: `main.rs:1619` `steampoll_boot()` runs before `spawn_sidecar_state` (`main.rs:1620`). | closed |
| T-80-71 | Tampering | forged claim id | accept | Rationale below. Also holds in code: `gamelib-steampoll/src/running.rs:267-281` `release` acts only when `c.id == claim.id && !c.released`. | closed |
| T-80-72 | Denial of service | two running polls | mitigate | The flag gating was replaced by deleting the TS poller (80-31). `createRunningPoll` and the `steam-running-poll` boot step are absent from `src`/`meta` (grep finds only the historical note at `src/backend/process/README.md:280`). The only starter is `steampoll_dispatch.rs:156` `facade.running.start()`. `running.rs:195-231` `start()` is idempotent (`started` flag) and, since WR-02 fix `4a4100057`, registers its token inside the state lock so `stop()` (`running.rs:234`) can cancel it. | closed |
| T-80-73 | Tampering | TS-side deletion bypassing the Rust guard | mitigate | At HEAD `library/acfState.ts` has no `rmSync` call. The only match is a comment at line 124. The TS arm was removed in 80-30 (c64398d01/deb891707). `removeSteamInstallCopy` keeps only the `NUMERIC_APP_ID` check (`acfState.ts:263`) and then calls `invokeSteamPoll` (`acfState.ts:286`), so Rust does the deletion. | closed |
| T-80-74 | Tampering | bridge bottle removal | mitigate | `acfState.ts:314-317`: the default bottle is never removed. A per-game bottle goes only through `removePerGameBridgeBottle` (`steam/bridgeBottleLifecycle.ts:165`), which calls the shared `guardPerGameBridgeBottleName` (`bridgeBottleLifecycle.ts:60`: numeric appId, then the T-17-01 chokepoint). `git log` shows no phase-80 commit touching that file. The last change is d872dea92 (66.4-20). | closed |
| T-80-75 | Denial of service | regression shipped by default | mitigate | Parity was APPROVED in 3c7d7b39c (15:48, `80-PARITY.md:3`, `:75`) before the flip in bd0a8bd76 (16:40). The ts arm stayed available until the gate. Live UAT items 1-5 all pass (`80-HUMAN-UAT.md:30-50`). | closed |
| T-80-76 | Information disclosure | captured logs | mitigate | `80-HUMAN-UAT.md` records outcomes only. I grepped it and the 80-27/80-33 summaries for SteamID64 (`7656119…`), tokens, passwords, account names, emails and `/Users/` paths: no matches. The one log line quoted uses `<id>` (`80-HUMAN-UAT.md:38`). | closed |
| T-80-77 | Repudiation | gate met without evidence | mitigate | `80-HUMAN-UAT.md:52-61`: 6/6 pass, 0 issues, "Delete gate: MET". It cites 3 CI legs on run 43813887944, and `gh run view` confirms success on f078c2762, which is an ancestor of MET commit 09369391d. It also cites APPROVED parity. MET 09369391d (19:19) is earlier than every deletion commit (847c799d1 19:37 onward). | closed |
| T-80-78 | Repudiation | lost coverage (80-28) | mitigate | `80-28-SUMMARY.md` records an inventory grep run before any edit, a per-file deleted/kept table and the cargo mapping for the two unmapped files (`steamDownloadProgress` -> `tests/progress.rs`; `childWatchdog` -> `watchdog_real::*`). `frozen_parity` is kept: `gamelib-steampoll-cli/tests/frozen_parity.rs`, run at HEAD and passing. The 80-04..80-16 mapping tables are in the other auditors' slices. | closed |
| T-80-79 | Tampering | TS deletion path surviving | mitigate | `acfState.ts` `rmSync` count is 0 at HEAD (comment only, line 124). Port-complete pin: `src/backend/__tests__/steamPollsPortComplete.test.ts` (21/21 pass at HEAD). Note: the pin's FORBIDDEN list (lines 28-36) bans poll-loop symbols and does not assert `rmSync` absence in `acfState.ts`, so nothing would catch that particular regression. This is informational, not a gap against the declared plan. | closed |
| T-80-80 | Tampering | TS loop or TS path guard reintroduced | mitigate | `steamPollsPortComplete.test.ts`: DELETED list (14-26), FORBIDDEN identifiers (28-36), reg-query RunningAppID regex (39-40), a test that the scan can fail (100), and an anti-vacuity floor `scanned.length >= 500` (114-115). 21/21 pass at HEAD. | closed |
| T-80-81 | Repudiation | stale docs | mitigate | `.planning/research/STEAM-STACK.md:160` "Amended by Phase 80". `src-tauri/crates/README.md:17,19` describe the steampoll crate and the deleted TS loops. `src/backend/process/README.md:280` is updated. | closed |
| T-80-82 | Denial of service | broken install flow shipped | mitigate | Live smoke items 7 install, 8 uninstall and 9 launch all pass (`80-HUMAN-UAT.md:74-84`). The 3 rust-test.yml legs are green on eb1e2d37e (run 43825957344, confirmed). Residual: Jest CI run 43825957425 is red on known-red suites plus `steamLaunchRuntime.test.ts`, which has been red since fba351fbe, before phase 80 (`80-33-SUMMARY.md`). | closed |
| T-80-83 | Denial of service | regression with no fallback (80-30) | mitigate | Delete gate MET 09369391d is an ancestor of c64398d01 and deb891707. The post-deletion smoke has items 7-9 passing (`80-HUMAN-UAT.md:74-84`). | closed |
| T-80-84 | Denial of service | regression with no fallback (80-31) | mitigate | MET is earlier than 74f4b0512 and 0133f144b. Post-deletion smoke items 7-9 pass. rust-test.yml run 43825957344 on eb1e2d37e (contains the deletions and the pin) is green on all three legs, confirmed via `gh run view`. | closed |
| T-80-85 | Tampering | two writers of the restart-hold file | mitigate | No `steam_restart_hold`, `restartHold` or `RestartHold` store or writer remains in `src`/`meta` (the only matches are the `withoutSteamRestartHolds` reader). The one path comes from `gamelib-steampoll/src/profile.rs:91-94` and is written only by `HoldStore` (`hold.rs:224-338`, atomic temp+rename, 0600). Callers: `rearm.rs:36` and `steampoll_dispatch.rs:462`. | closed |
| T-80-86 | Repudiation | lost coverage (80-29) | mitigate | `80-29-SUMMARY.md` "Deleted cases and their cargo mapping" lists each deleted case with its cargo counterpart. The final inventory grep is recorded under "Final inventory". `frozen_parity` passes at HEAD. | closed |
| T-80-SC | Tampering | new crates' dependencies | accept | No new external package. The deps in `SP/Cargo.toml`, `gamelib-steampoll-cli/Cargo.toml` and `gamelib-i18n/Cargo.toml` are tokio, tokio-util, serde, serde_json, tempfile and in-repo path crates. | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-80-01 | T-80-23 | Rationale: "only a number shown as status; no path or command is built from it". The code agrees: `gamelib-steamfiles/src/readers.rs:272` parses to an integer and `running.rs:47-50` takes digits only. | plan-time disposition | 2026-11-16 |
| AR-80-02 | T-80-42 | See Accepted risks. Notification text goes through `render_notify_text` and then `show_notification` as plain title/body strings (shell/steampoll_dispatch.rs:326-335, :377-391). | plan-time disposition | 2026-11-16 |
| AR-80-03 | T-80-69 | Rationale below. Mirror push exists: `src-tauri/crates/gamelib-steampoll/src/install_loop.rs:494` `set_native_in_flight`, read by the next tick. | plan-time disposition | 2026-11-16 |
| AR-80-04 | T-80-71 | Rationale below. Also holds in code: `gamelib-steampoll/src/running.rs:267-281` `release` acts only when `c.id == claim.id && !c.released`. | plan-time disposition | 2026-11-16 |
| AR-80-05 | T-80-SC | No new external package. The deps in `SP/Cargo.toml`, `gamelib-steampoll-cli/Cargo.toml` and `gamelib-i18n/Cargo.toml` are tokio, tokio-util, serde, serde_json, tempfile and in-repo path crates. | plan-time disposition | 2026-11-16 |

*Accepted risks do not resurface in future audit runs.*

---

## Non-blocking audit notes

All threats are closed; these are drift between plan text and code, or residual hardening worth a todo.

- **T-80-33** — the plan says `validateInbound` enforces caller `shell`; it only checks the schema (`src/backend/sidecar/ipcValidation.ts:49-80`). The real guard is the Rust relay allow-list: `steamPollStateEvent` is absent from `RENDERER_CHANNELS` (`src-tauri/src/ipc_contract.rs`) and `relay_channel_verdict` (`src-tauri/src/relay_commands.rs:20-28`) refuses it. Register text is stale.
- **T-80-40** — the numeric appId check is single-layer: the generated `Steampoll*Args` in `ipc_contract.rs` take appId as a plain string (deliberate, `rustInvoke.ts:156-157`); the crate check runs on every appId path.
- **T-80-32** — containment is lexical, not canonical: `CFBundleExecutable` must be a bare name (`mac_arch.rs:106-120`). A symlink inside `Contents/MacOS` is still followed, but only by a read-only `lipo`/`file` probe.
- **T-80-79** — `steamPollsPortComplete.test.ts` does not forbid `rmSync` in `library/acfState.ts`; absent today, but a reintroduction would not be caught.
- **T-80-70** — the boot rearm is a spawned task, so pending-rearm is not set synchronously inside `steampoll_boot`; the sidecar is spawned after it (`main.rs:1619-1620`), so the race is theoretical.
- **T-80-05** — `tests/fixtures/timelines/README.md:5-11` still documents the goldens driver deleted in 80-29 (`a281e00bd`). Stale doc only.
- **T-80-12, T-80-16** — not re-run in this audit: the Windows reparse-point test is Windows-only, and the smoke-1 live check was not repeated.
- **CI** — Jest run 43825957425 is red on suites already failing before phase 80 (incl. `steamLaunchRuntime.test.ts`, red since `fba351fbe`); the three rust-test.yml legs the plans gate on are green.

Threat flags: the 8 SUMMARY `## Threat Flags` sections map to registered IDs or report none. No unregistered flags.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-16 | 87 | 87 | 0 | gsd-security-auditor ×3 (plans 01-11, 12-22, 23-33) |

## Security Audit 2026-11-16
| Metric | Count |
|--------|-------|
| Threats found | 87 |
| Closed | 87 |
| Open | 0 |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-16
