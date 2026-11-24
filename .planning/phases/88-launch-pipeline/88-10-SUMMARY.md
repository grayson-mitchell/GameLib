---
phase: 88-launch-pipeline
plan: 10
subsystem: known-fix-overlays
tags: [knownfix, overlay, archive, install, single-flight, env, golden-replay, svc-03]

requires:
  - phase: 88-launch-pipeline
    plan: 06
    provides: golden/overlay_archive (25 cases) and golden/overlay_install (41 cases) with their deltas.json
  - phase: 88-launch-pipeline
    plan: 08
    provides: the order-preserving jsvalue.rs, the reader (read_known_fix_profile, filter_tier1_known_fixes) and the strict op-argument pattern
  - phase: 88-launch-pipeline
    plan: 09
    provides: the knownfix op shape (deny_unknown_fields args, fixed non-echoing literals), KnownFixCtx and the paused-clock golden pattern
provides:
  - gamelib-knownfix overlay/archive.rs (build_overlay_tar_gz, read_overlay_tar_gz, OverlayArchiveFile)
  - gamelib-knownfix overlay/install.rs (ensure_overlay_installed, verify_installed_overlay, VerifyError, is_valid_overlay_id)
  - gamelib-knownfix overlay/env.rs (OverlayInstaller, CtxInstaller, BaseValues, EnvOption, EnvLine, validate_overlay_entries, append_path_list, env_options_of, last_env_option, format_known_fix_env_line, log_known_fix_env, with_known_fix_env, resolve_overlay_env, profile_overlay_env, profile_overlay_env_with)
  - ctx.rs OverlayInstalls (the single-flight table and the 120 s bound) on KnownFixCtx.overlay_installs
  - ops knownfix_profile_overlay_env (launcher shape) and knownfix_resolve_overlay_env (bridge shape)
  - tests golden_overlay_archive.rs (OVERLAY_ARCHIVE_FLOOR 25) and golden_overlay_install.rs (OVERLAY_INSTALL_FLOOR 41)
affects: [88-11, 88-12, 91]

actuals:
  tokens: 31800
  tasks: 3
  commits: 5
commits: 5
plan_head_before: dd7b53bf73147d5069501769d63118d7c9200afa
plan_head_after: 7472d05f1929dab9f75bc3f033930a07131fe002

tech-stack:
  added: []
  patterns:
    - "a single-flight table is a map from the install dir to a tokio OnceCell: the first caller initialises it, concurrent callers wait on the same cell, and a drop guard forgets it however the caller ends, so a cancelled install leaves nothing in flight"
    - "an op that downloads wraps the whole install in `guarded` (registrant plus shutdown token), races the fetch against the token and a 120 s timeout, and runs every disk step after the download in spawn_blocking, so a paused clock only ever sees the one timer that matters"
    - "a golden replay with a scripted network seam: the Fetch fake records each request and whether its future ran to its end, so 'the signal was aborted afterwards' becomes 'the request future was dropped'"
    - "a base-value callback becomes a small trait implemented for a map and for any closure: the ops pass a map, a test passes a recording closure and so compares which keys the resolver asked for"

key-files:
  created:
    - src-tauri/crates/gamelib-knownfix/src/overlay/mod.rs
    - src-tauri/crates/gamelib-knownfix/src/overlay/archive.rs
    - src-tauri/crates/gamelib-knownfix/src/overlay/install.rs
    - src-tauri/crates/gamelib-knownfix/src/overlay/env.rs
    - src-tauri/crates/gamelib-knownfix/tests/golden_overlay_archive.rs
    - src-tauri/crates/gamelib-knownfix/tests/golden_overlay_install.rs
  modified:
    - src-tauri/crates/gamelib-knownfix/src/lib.rs
    - src-tauri/crates/gamelib-knownfix/src/ctx.rs
    - src-tauri/crates/gamelib-knownfix/src/registry.rs
    - src-tauri/crates/gamelib-knownfix/Cargo.toml
    - src-tauri/crates/gamelib-knownfix/tests/fixtures/golden/overlay_install/deltas.json
    - src-tauri/crates/gamelib-knownfix-cli/tests/cli.rs

key-decisions:
  - "The archive download is `EngineCtx.fetch.get`, not `download`: the seam has no `maxBytes`, so the install relies on the seam's own 16 MiB body cap and then holds the body to exactly `archiveSize` (a longer or shorter body is the same `archive size N does not match the pinned M` warning, before the sha256 is looked at). An overlay whose pinned archive is larger than 16 MiB is refused up front and fails open. The real archive is 8 279 592 bytes. Recorded in deltas.json (`fetch-seam-has-no-maxBytes`)"
  - "`ensure_overlay_installed` takes the caller's log label as a third argument (the plan said `(ctx, entry)`): the TS lines are `<label>: overlay <id> ...`, and the label is `<runner> <appName>` for the launcher and `Steam <appId>` for the bridge"
  - "The base-value callback is the `BaseValues` trait, implemented for `BTreeMap<String, String>` (what the ops pass, as the plan says) and for any `Fn(&str) -> Option<String>` (what the replay passes, so `baseAsked` is genuinely compared and not derived)"
  - "A rejected `overlays` entry is echoed into the log with any `scheme://...` run replaced by `<url>`: the golden entry that tried to name a download carries a URL, and prohibition 1 (no URL in gamelib.log) wins over the TS text. Recorded in deltas.json (`url-in-a-rejected-entry-echo`)"
  - "The `skipped: <os>/<wine> is not darwin/crossover` line is not written: the TS wrote it with logDebug and `EngineLog` has info, warn and error only. The replay drops exactly the golden's debug events and requires each to be a `skipped:` line (deltas.json `skipped-overlay-debug-line`)"
  - "flate2 takes the `zlib-rs` backend the other crates use (`default-features = false`), so the writer's deflate output is the closest available to Node's zlib; no new package, Cargo.lock unchanged"
  - "The golden floors are the recorded counts (25 and 41), above the plan's 19 and 37, as 88-09 did"

requirements-completed: [SVC-03]

coverage:
  - id: D1
    description: "build_overlay_tar_gz writes the TS's ustar+gzip (sorted by bytes, mode 0644, owner 0, mtime 0, two zero blocks, 10240 record, gzip level 9 with mtime 0 and OS byte 3) and read_overlay_tar_gz refuses exactly what the TS reader refused with the TS text and order, bounded by the byte cap and with no tar child; all 25 golden/overlay_archive cases replay"
    requirement: SVC-03
    verification:
      - kind: integration
        ref: "src-tauri/crates/gamelib-knownfix/tests/golden_overlay_archive.rs#every_overlay_archive_golden_replays (25 cases, OVERLAY_ARCHIVE_FLOOR 25), #a_written_archive_is_accepted_by_the_strict_reader_whatever_its_deflate_bytes, #every_rejection_the_goldens_record_is_a_message_of_the_reader"
        status: pass
    human_judgment: false
  - id: D2
    description: "ensure_overlay_installed installs a catalogue overlay under the archive and per-file sha256 pins into the TS staging layout (`.<id>.partial-*` mode 0700, `.<id>.stale-*`, install dir 0700, files 0644), fails open with one warning for a wrong id, a failed or never-ending download, wrong bytes, a hostile archive or a cancelled shutdown token, leaves no partial directory, and shares one download between concurrent callers; the 18 install cases of golden/overlay_install replay including the overlays tree, with the 120 s bound on a paused clock"
    requirement: SVC-03
    verification:
      - kind: integration
        ref: "src-tauri/crates/gamelib-knownfix/tests/golden_overlay_install.rs#every_install_golden_replays (18 install cases of 41), #the_cases_split_into_18_install_cases_and_23_env_cases"
        status: pass
    human_judgment: false
  - id: D3
    description: "The overlay env matches the recorded cases: darwin plus CrossOver only, append_path_list without duplicates, the GST_PLUGIN_PATH_1_0 shadow warning, at most 8 entries, the id and target checks, the tier-1 then game then process base precedence, an installer that fails empties the answer; the 23 env and pure-helper cases replay with the base keys the resolver asked for compared as recorded"
    requirement: SVC-03
    verification:
      - kind: integration
        ref: "golden_overlay_install.rs#every_install_golden_replays (41 cases, OVERLAY_INSTALL_FLOOR 41); env.rs unit tests (url redaction, append_path_list shapes, the 512 unit value cut)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Ops knownfix_profile_overlay_env and knownfix_resolve_overlay_env exist with deny_unknown_fields object args, answer fixed `<op>:bad-args` literals that never echo input, answer `{}` for a game whose profiles name no overlay, and are listed by `gamelib-knownfix-cli ops`"
    requirement: SVC-03
    verification:
      - kind: unit
        ref: "lib.rs#the_overlay_env_ops_decode_one_strict_object_and_never_echo_input, gamelib-knownfix-cli tests/cli.rs#ops_prints_the_op_table_and_exits_zero and #the_overlay_env_ops_answer_an_empty_map_for_a_game_with_no_profile_and_refuse_a_bad_call_over_a_fake_home"
        status: pass
    human_judgment: false
  - id: D5
    description: "T-88-24, T-88-25, T-88-26 and prohibition 1: a planted skip of the archive sha256 pin, of the real-directory chain check, of the 0700 partial directory mode, of the single-flight table, of the 8 entry cap, of the duplicate check and of the base precedence each fail goldens; a source scan holds install.rs to gamelib-safety for removal and archive.rs to no fs and no process; every logged line is checked for `://` and the fake HOME path"
    requirement: SVC-03
    verification:
      - kind: integration
        ref: "mutation run of golden_overlay_archive.rs and golden_overlay_install.rs (each planted mutant failed 1 to 7 cases and was reverted), #the_install_removes_nothing_but_through_gamelib_safety_and_spawns_nothing"
        status: pass
    human_judgment: false
  - id: D6
    description: "The Windows and Linux legs, and a real overlay download and install from GitHub against a real CrossOver Wine, were not run; only the macOS dev machine built and tested these crates"
    verification: []
    human_judgment: true
    rationale: "The install replay is `#[cfg(unix)]` (the goldens were recorded on POSIX) and is proven only on this host; the real archive, the real TLS path and GStreamer actually loading the overlay's plugin directory are never touched by a test, by design (the catalogue archive is never fetched)"

duration: about 75min
completed: 2026-11-25
status: complete
---

# Phase 88 Plan 10: Known-fix overlays Summary

**The overlay archive writer and strict reader, the sha256-pinned on-demand install with its single flight, and the overlay env for the launcher and the bridge are Rust, replay all 25 archive and 41 install and env goldens, and the two env ops are ready for 88-12's shims.**

## Performance

- **Duration:** about 75 min (start time was not recorded at launch; estimated from the first and last commits)
- **Tasks:** 3 (one tracer, two TDD)
- **Commits:** 5 (tracer, RED and GREEN for the install, RED and GREEN for the env)
- **Files:** 6 created and 6 modified; 3280 insertions and 10 deletions over the plan

## Accomplishments

- **Tracer (Task 1):** `overlay/archive.rs` writes the ustar header fields of `buildHeader` byte for byte and gzips at level 9 with the OS byte pinned to 3 (the zlib-rs backend writes mtime 0 and xfl 2 on its own, so no header delta is needed). The reader ports every TS check in the TS order and text: gunzip bounded by the cap, checksum, ustar magic, typeflag `0`, empty prefix, the path rules, a numeric size, the expected set, duplicates, larger-than-pin and truncation, then the missing paths. 25 cases replay; the written archives' gunzipped tar and gzip header are identical in all of them, and the compressed bytes are identical to Node's zlib in 4 of the 5 successful builds (the fifth differs in deflate bytes only, which `deltas.json` allows). The tracer `<verify>` was re-run end to end before the install and env tasks started.
- **Install (Task 2, TDD):** `ensure_overlay_installed` follows the TS step order: id pattern, verify an existing install, create the overlays folder, download, size pin, sha256 pin, strict unpack, a `.<id>.partial-*` directory (mode 0700) filled with `wx` files (0644), verification of what was written, the existing install moved to `.<id>.stale-*`, the swap, and removal of the stale directory. Every removal goes through `gamelib-safety` with the overlays folder as trust root. The download is `EngineCtx.fetch.get` under a 120 s bound and the shutdown token, and the whole install runs under `guarded`. Concurrent callers join one `OverlayInstalls` cell; a paused-clock replay of the 120 s and 50 ms deadlines and the shutdown-token abort runs in no wall time. 18 cases replay, tree and events included.
- **Env and ops (Task 3, TDD):** `resolve_overlay_env` and `profile_overlay_env` are the TS twins; the pure helpers answer what the TS did (`append_path_list` normalises like `path.resolve`, the log line cuts values at 512 UTF-16 units, `with_known_fix_env` answers a borrowed value when there is nothing to add). Ops `knownfix_profile_overlay_env` (`{ appName, runner, gameSettings, tier1Env, processEnvBase }`) and `knownfix_resolve_overlay_env` (`{ appId, label, wineType, baseValues }`, reading the `steam` tier-2 profile's `overlays` itself) answer the env map. All 41 cases replay.

## Task Commits

1. **Task 1 (tracer): overlay archive writer and strict reader replayed against golden/overlay_archive** - `93449af45` (feat)
2. **Task 2 RED: failing replay of the overlay install goldens** - `b6cdc0dcd` (test)
3. **Task 2 GREEN: verified overlay install with single flight, bounded download and guarded cleanup** - `beb7c5911` (feat)
4. **Task 3 RED: failing replay of the overlay env goldens** - `e5b55a53f` (test)
5. **Task 3 GREEN: overlay env for the launcher and the bridge, and the two env ops** - `7472d05f1` (feat)

**Plan metadata:** the docs commits that follow this summary (STATE, ROADMAP, REQUIREMENTS).

## TDD Notes

- **RED 1 (b6cdc0dcd):** `install.rs` held the public shapes with inert bodies (`ensure` answered `None`, `verify` answered `Ok`). The replay stopped at its first `damage` step (it writes into an install that was never made) and the source-scan test failed on `gamelib_safety` not appearing, so the RED evidence is a panic in a replay helper plus one failed assertion, not a count of failed cases. No build or zero-test failure.
- **GREEN 1 (beb7c5911):** all 18 cases pass first run. Planted mutants: dropping the archive sha256 check (4 differences), the real-directory check (4), the partial directory mode 0700 to 0755 (7), and a fresh cell per call instead of the shared table (1: the concurrency case) each failed the replay and were reverted.
- **RED 2 (e5b55a53f):** `env.rs` held the shapes with inert bodies. The run failed with 23 differences over 41 cases: exactly the 23 env and pure-helper cases, the 18 install cases still passing. Semantic assessment: the target tests ran and failed on the planned assertions. `gsd check tdd-red-evidence` was not run: `cargo test` console output is not one of its supported report formats and `workflow.tdd_mode` is off.
- **GREEN 2 (7472d05f1):** all 41 cases pass first run. Planted mutants: the entry cap 8 to 7 (1), the duplicate check in `append_path_list` (3), and the base precedence tier-1, game, process swapped (1) each failed and were reverted. A mutant that drops the once-only shadow warning is not caught, because the catalogue holds one overlay and no golden can resolve two.
- **REFACTOR:** none.

## Decisions Made

See `key-decisions` above.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The fetch seam has no `maxBytes`, so the plan's "body cap of `entry.archive_size`" is the pin check**
- **Found during:** Task 2 (reading `fetch.rs`)
- **Issue:** `Fetch::get` takes a request with a timeout and no byte limit, and `Fetch::download` writes a file with no limit either. Adding a field to `FetchRequest` would have changed `gamelib-engine` and its `Replay`.
- **Fix:** the install reads the body with `get` (the seam's own 16 MiB cap), then refuses a body that is not exactly `archiveSize` bytes with the TS size warning; an overlay pinned above 16 MiB is refused before any request and fails open. The replay computes `maxBytesMinusPinnedArchive` from the pin.
- **Files modified:** `overlay/install.rs`, `tests/fixtures/golden/overlay_install/deltas.json`
- **Committed in:** `beb7c5911`

**2. [Rule 2 - Missing critical] A URL in a rejected `overlays` entry reached the log**
- **Found during:** Task 3 (the replay's own check that no log line carries `://` or the HOME path)
- **Issue:** the TS echoes up to 200 characters of a rejected entry, and the golden entry that tries to name a download carries `https://evil.example/x.tar.gz`. Prohibition 1 forbids a URL in gamelib.log.
- **Fix:** the echo replaces every `scheme://...` run with `<url>`; the replay maps the golden line the same way, and `deltas.json` says why.
- **Files modified:** `overlay/env.rs`, `tests/golden_overlay_install.rs`, `tests/fixtures/golden/overlay_install/deltas.json`
- **Committed in:** `7472d05f1`

**3. [Rule 3 - Blocking] `EngineLog` has no debug level**
- **Found during:** Task 3
- **Issue:** the TS wrote the overlay "skipped" line with logDebug (7 golden events). Adding a level to `EngineLog` would change `gamelib-engine`, the recording log and the shell's redacting log.
- **Fix:** the line is not written; the replay drops exactly the golden's debug events and requires each to be a `skipped:` line. What the skip does is still compared through `result` and `ensureCalls`.
- **Files modified:** `overlay/env.rs`, `tests/golden_overlay_install.rs`, `tests/fixtures/golden/overlay_install/deltas.json`
- **Committed in:** `7472d05f1`

### Scope additions (inside the plan's intent)

- `ensure_overlay_installed` takes the log label, `profile_overlay_env_with` takes an installer (the replay's scripted one), `BaseValues` is a trait for a map and a closure, and `registry.rs` makes three private helpers (`slice_units`, `shown`, `member`) `pub(crate)` so the env warnings echo an entry the way the registry ones do.
- `flate2` in `Cargo.toml` takes `default-features = false, features = ["zlib-rs"]` like `gamelib-depot`; no package was added.

---

**Total deviations:** 3 auto-fixed (2 blocking, 1 missing critical), scope additions as listed
**Impact on plan:** none on scope; each is a difference the goldens' `deltas.json` now names, and every artifact the plan lists exists with the planned meaning.

## Behaviour that differs from the TS (recorded, not fixed)

- **An unreadable file in an installed overlay says what the OS says** (`No such file or directory (os error 2)`), not Node's `ENOENT ... lstat '<path>'`; the Rust reason never names a path. The log never carries the two path-bearing verify reasons at all.
- **A profile read through `reader::read_known_fix_profile` echoes a rejected entry with its keys sorted** (the reader holds plain JSON); the pure functions keep file order, which is what the goldens replay.
- **The overlay env of a launch is resolved against a map of values the caller computed up front** in the two ops; the TS asked a callback. The resolver itself asks through `BaseValues`, so the replay compares which keys it asked for.
- **Not recorded in a golden:** a relative `dir` given to `append_path_list` is compared lexically (it never equals an absolute segment), where the TS resolved it against the working directory; the overlay's directory is always absolute.

## Issues Encountered

- A shell probe I wrote with a stray `cat > /tmp/...` waited on stdin and was moved to the background; it wrote nothing and was killed. No repository file was touched.
- The shell's `cargo test --bin gamelib-shell knownfix` (7 tests) passes with the new `KnownFixCtx` field; `cargo fmt --check` and `cargo clippy --all-targets -D warnings` are clean for the two knownfix crates.

## Known Stubs

None. The RED-stage inert bodies of `install.rs` and `env.rs` were replaced in the GREEN commits.

## Threat Flags

None new. T-88-23 (zip-slip, oversize), T-88-24 (substituted payload), T-88-25 (stuck download), T-88-26 (destructive cleanup) are mitigated as the plan names: the strict reader is replayed from goldens, the archive and per-file pins are checked before anything is written, the download has the 120 s bound, the shutdown token and the `knownfix` registrant, and every recursive removal goes through `gamelib-safety`. Neither new op has a native channel yet; 88-12 adds the shims and places both in UNBOUNDED_RUST_CHANNELS (an install may take the full 120 s). T-88-SC: no package was added.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 88-12 can wire `knownfix_profile_overlay_env` and `knownfix_resolve_overlay_env` behind the TS shims, with both in UNBOUNDED_RUST_CHANNELS.
- Open for a live run: a real overlay download from GitHub, GStreamer loading the installed plugin directory under CrossOver, and the Windows and Linux CI legs (D6).
- Cross-cutting note for 88-11 or a follow-up: the 88-09 registry warnings and the 88-08 reader warnings echo operator-authored JSON the same way the overlay one did; they replay the TS text exactly and have no URL redaction.

---
*Phase: 88-launch-pipeline*
*Completed: 2026-11-25*

## Self-Check: PASSED

- FOUND: `src-tauri/crates/gamelib-knownfix/src/overlay/mod.rs`, `archive.rs`, `install.rs`, `env.rs`, `tests/golden_overlay_archive.rs`, `tests/golden_overlay_install.rs`
- FOUND commits: `93449af45`, `b6cdc0dcd`, `beb7c5911`, `e5b55a53f`, `7472d05f1` (all ancestors of HEAD)
- Acceptance: golden_overlay_archive compared 25 cases (floor 25, plan asks 19), every writer case's tar and gzip header byte-identical; golden_overlay_install compared 41 cases (floor 41, plan asks 37) including the concurrency case with one download; no test waits wall time for the 120 s bound (the install replay finishes in 0.11 s); `gamelib-knownfix-cli ops` lists `knownfix_profile_overlay_env` and `knownfix_resolve_overlay_env`
- Plan verification: `cargo test -p gamelib-knownfix` (49 lib, 4 bundled seeds, 3 launch, 4 archive, 6 install, 6 reader, 9 registry), `cargo test -p gamelib-knownfix-cli` (8), `cargo test --bin gamelib-shell knownfix` (7), `cargo clippy -p gamelib-knownfix -p gamelib-knownfix-cli --all-targets -- -D warnings` clean, `cargo fmt --check` clean for both crates
