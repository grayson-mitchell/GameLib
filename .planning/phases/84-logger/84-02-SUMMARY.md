---
phase: 84-logger
plan: 02
subsystem: infra
tags: [rust, gamelib-log, log-writer, golden, frame-contract, sanitiser, storehost, ci]

requires:
  - phase: 84-logger
    provides: "the TS golden (cases.json, entries.json, expected/), the shared logFrameVectors.json and the live gate contract (84-01)"
provides:
  - "gamelib-log crate: prefix/level closed sets, formatter.ts byte-for-byte format, writer thread with every target, rotation and 0600, kind:log frame parser, renderer sanitiser"
  - "gamelib_core::paths log_dir, log_file and the LogTarget / LogRunner / GameLogType / LogPathError types (D-08)"
  - "gamelib_core::store minimal StoreHost (open_cache, Store get/set/remove/snapshot/on_change, StoreChange) for uploadedLogs (D-09)"
  - "Rust == TS golden over all 57 non-renderer cases and all 12 renderer cases"
affects: [84-03, 84-04, 84-05, 84-06, 84-07, 84-08, 84-09, 84-11, 85-store-host]

actuals:
  tokens: 26800
  tasks: 4
  commits: 5
plan_head_before: 92b0d0c86389605752e56bea02162753453722a4
plan_head_after: 73afed020d74636ea70d0219347e55e7466da712

tech-stack:
  added: ["gamelib-log (in-repo crate)", "indexmap 2 (serde feature) as a gamelib-core dependency, already locked", "chrono 0.4 (clock, std) in gamelib-log, already locked"]
  patterns:
    - "single writer thread behind a bounded sync_channel(4096): try_send, a full channel drops and counts, the writer later logs the count"
    - "open-append-close per batch, no held handle; every message under catch_unwind"
    - "typed targets cross the trust boundary, never a path; the writer resolves every path through gamelib_core::paths::log_file"
    - "renderer redaction placed Rust-at-write; the order-preserving RendererMessage deserializer avoids serde_json's ordered-map feature"
    - "persist seam takes the rename function so the WR-05 direct-write fallback is testable without permissions"

key-files:
  created:
    - src-tauri/crates/gamelib-log/Cargo.toml
    - src-tauri/crates/gamelib-log/src/lib.rs
    - src-tauri/crates/gamelib-log/src/prefix.rs
    - src-tauri/crates/gamelib-log/src/format.rs
    - src-tauri/crates/gamelib-log/src/writer.rs
    - src-tauri/crates/gamelib-log/src/frame.rs
    - src-tauri/crates/gamelib-log/src/sanitize.rs
    - src-tauri/crates/gamelib-log/tests/golden.rs
    - src-tauri/crates/gamelib-core/src/store.rs
    - src/backend/logger/__tests__/logPrefixParity.test.ts
  modified:
    - src-tauri/Cargo.toml
    - src-tauri/Cargo.lock
    - src-tauri/crates/gamelib-core/Cargo.toml
    - src-tauri/crates/gamelib-core/src/lib.rs
    - src-tauri/crates/gamelib-core/src/paths.rs
    - .github/workflows/rust-test.yml
    - meta/__tests__/rustTestWorkflow.test.ts
    - src/backend/__tests__/cargoFeatures.test.ts
    - src-tauri/crates/README.md

key-decisions:
  - "gamelib-log is its own Tauri-free crate (not a gamelib-core module); it reads no env and takes log dir, user-data dir, clock and timezone source through LogConfig"
  - "gamelib.log rotates once per Logger, on the first general write that actually has data to write (a blank-only first write does not claim it)"
  - "A rejected target (bad appName, comet game) drops the batch and logs 'log target rejected: <error kind>' only; the hostile name never reaches the log"
  - "Renderer cases in the golden are parsed with a local order-preserving visitor, because serde_json::Value without the ordered-map feature sorts keys; preserve_order stays off crate-wide (anchored count is 0)"
  - "StoreHost rolls the in-memory value back when a persist fails and fires no change event; listeners are cloned out of their lock so they can call back into the store"

patterns-established:
  - "Test modules named for what they pin (writer::mode, writer::second_init, writer::windows) so the acceptance filters match"
  - "Golden replay goes through parse_frame, so the frame parser and the writer are exercised by the same 57 cases"

requirements-completed: [FND-05]

coverage:
  - id: D1
    description: "Rust writer reproduces the TS log files byte for byte for every non-renderer golden case (general, runner, game, gogRedist, rotation, close, shell line)"
    requirement: FND-05
    verification:
      - kind: integration
        ref: "cargo test -p gamelib-log --test golden (rust_writer_matches_the_ts_golden, 57 cases)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Renderer sanitiser (CR/LF escapes, 65,536-unit and 256-entry caps, surrogate-pair cut, key order) byte-equal to the TS golden"
    requirement: FND-05
    verification:
      - kind: integration
        ref: "cargo test -p gamelib-log --test golden (rust_sanitiser_matches_the_ts_golden_for_every_renderer_case, 12 cases) and 8 sanitize:: unit tests"
        status: pass
    human_judgment: false
  - id: D3
    description: "kind:log frame contract: every valid vector parses, every invalid vector rejected with its exact reason, 4 MiB and 1,048,576-unit caps"
    requirement: FND-05
    verification:
      - kind: unit
        ref: "cargo test -p gamelib-log frame:: (7 tests over src/common/__fixtures__/logFrameVectors.json)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Log paths in gamelib-core (log_dir, log_file) with appName validation and the comet-game refusal"
    requirement: FND-05
    verification:
      - kind: unit
        ref: "cargo test -p gamelib-core paths (11 tests)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Minimal StoreHost core for uploadedLogs with the full D-09 API"
    requirement: FND-05
    verification:
      - kind: unit
        ref: "cargo test -p gamelib-core store (12 tests)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Windows rename-failure arm (writer::windows) and the Windows/Linux legs of the new crate"
    requirement: FND-05
    verification:
      - kind: other
        ref: "writer::windows is cfg(windows) and was written but not run on this macOS machine; the rust-test.yml Windows leg runs it"
        status: unknown
    human_judgment: true
    rationale: "No Windows host available to this executor; the test is compiled out on macOS."

duration: not measured (start time not recorded)
completed: 2026-11-21
status: complete
---

# Phase 84 Plan 02: Rust log writer, core log paths and StoreHost Summary

**A Tauri-free `gamelib-log` crate that writes every GameLib log file byte-equal to the TS golden (57 writer cases plus 12 renderer cases), with typed-target path resolution and the minimal uploadedLogs StoreHost in gamelib-core, wired into CI.**

## Performance

- **Duration:** not measured (start time not recorded)
- **Completed:** 2026-11-21
- **Tasks:** 4 (one tracer, three TDD)
- **Files:** 19 changed in the plan's commits (about 2,900 insertions, 8 deletions)

## Accomplishments

- **Tracer (Task 1):** core `log_dir` / `log_file` (D-08), the `gamelib-log` crate skeleton, `format_line` (formatter.ts byte for byte, padding widths derived from the closed sets, `Shell` in the set), and a writer thread for `gamelib.log`, proven by the golden on the 38 general-target cases (37 TS oracle cases plus `shell-line`), then CI, censuses and README in the same commit. Tracer verified end-to-end before expansion.
- **Writer (Task 2):** `TargetBatch` / `Entry` / `Logger::submit`, rotation to `.old` (replacing an old `.old`), the `Logging to file(s) <path>` DEBUG line, one WARNING per failed rotation per target, 0600 on unix, `init` first-call-wins, and `frame::parse_frame` over `logFrameVectors.json`. The golden now replays all 57 non-renderer cases through `parse_frame` and the Logger.
- **Sanitiser (Task 3):** `RendererMessage` (order-preserving deserializer) and `renderer_body`; all 12 renderer golden cases match byte for byte, including the IN-04 forge string and the surrogate-pair cut.
- **StoreHost (Task 4):** `gamelib_core::store` with open, atomic write plus direct-write fallback, and change events, reading the TS-written shape unchanged.

## Task Commits

1. **Task 1: tracer, scaffold, core paths, general writer, CI** - `0fbbb9522` (feat)
2. **Task 2: every target, rotation, mode, second init, frame contract** - `c5136c74f` (feat)
3. **Task 3: renderer sanitiser** - `3cf2c9fbf` (feat)
4. **Task 4: StoreHost core and plan-end gates** - `13db3e06c` (feat)
5. **Follow-up: sanitiser counts UTF-16 units with `encode_utf16`** (the Task 3 acceptance grep) - `73afed020` (refactor)

## Measured Cargo.lock / census diff (EXPECTED_LOCKFILE_CRATE_NAMES)

Exactly one name was added: **`gamelib-log`**. `chrono`, `serde`, `serde_json`, `indexmap 2.14.0` and `iana-time-zone` were already locked, so `cargoFeatures.test.ts` needed no other change (it passes). The Cargo.lock edit adds the `gamelib-log` package entry (deps: chrono, gamelib-core, gamelib-testutil, serde, serde_json) and two dependency lines on `gamelib-core` (`gamelib-testutil` as a dev-dependency, `indexmap 2.14.0`). The anchored guard `cargo tree -e features -i serde_json | grep -c 'serde_json feature "preserve_order"'` reads 0.

## Final StoreHost public API (the shape Phase 85 widens)

```rust
// gamelib_core::store
pub enum StoreChange { Set { key: String }, Removed { key: String } }
pub struct StoreHost;                       // Default
impl StoreHost {
    pub fn new() -> StoreHost;
    pub fn open_cache(&self, dir: &Path, name: &str) -> io::Result<Arc<Store>>;
}
pub struct Store;
impl Store {
    pub fn get(&self, key: &str) -> Option<Value>;
    pub fn set(&self, key: &str, v: Value) -> io::Result<()>;
    pub fn remove(&self, key: &str) -> io::Result<bool>;
    pub fn snapshot(&self) -> Vec<(String, Value)>;
    pub fn on_change(&self, f: Box<dyn Fn(&StoreChange) + Send + Sync>);
}
```

Behaviour: one `Arc<Store>` per resolved file; a missing file is an empty store and writes nothing until the first `set`; a non-object or unparseable file is `InvalidData` and is never overwritten; `name` must be one plain file name (`InvalidInput` otherwise); persist is `<file>.tmp-<pid>` (0600) then rename, with a direct-write fallback and temp cleanup; a new directory is 0700; a failed persist restores the in-memory value and fires nothing. The crate-private seam is `persist_atomic(path, &IndexMap, rename_fn)`.

## Other public surface (for 84-03 onward)

`gamelib_log::{init, global, log, submit, flush}`; `Logger::{start, log, submit_line, submit, flush}`; `LogConfig { platform, log_dir, user_data, clock, tz }`; `TzOffset` / `SystemTz`; `frame::{LogFrame, FrameBatch, FrameTarget, FrameEntry, FrameReject, parse_frame, LOG_FRAME_MAX_BYTES, LOG_ENTRY_MAX_UTF16}`; `sanitize::{RendererMessage, renderer_body, LOG_TEXT_MAX, LOG_ARRAY_MAX}`. Literals: `log writer: <N> lines dropped (ingest full)`, `log rotation failed for <target kind>: <ErrorKind>`, `log target rejected: <error kind>`.

## Decisions Made

See `key-decisions` above. Two worth restating for later plans: the writer thread is a plain std thread that holds nothing open (no `Shutdown` registrant yet; 84-03 owns the exit flush through `flush`), and `init` drops the losing config without ever starting a second thread, so a second GameLib launch cannot rotate.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Formatted line ending in a newline gained a second newline**
- **Found during:** Task 1 (golden, `line-trailing-newline-string`)
- **Issue:** the general writer appended `\n` unconditionally; TS appends it only when the line does not already end with one.
- **Fix:** every formatted line goes through `normalise_chunk`, the same per-chunk rule as raw chunks.
- **Files modified:** `src-tauri/crates/gamelib-log/src/writer.rs`
- **Verification:** golden 38 of 38, later 57 of 57
- **Commit:** `0fbbb9522`

**2. [Rule 3 - Blocking] clippy `should_implement_trait` on the three `from_str` methods**
- **Found during:** Task 1 verify
- **Issue:** the plan names `from_str` returning `Option`, which clippy rejects under `-D warnings`.
- **Fix:** `#[allow(clippy::should_implement_trait)]` on `Level::from_str`, `LogRunner::from_str` and `GameLogType::from_str`; names kept as the plan states.
- **Commit:** `0fbbb9522`

**3. [Rule 3 - Blocking] Renderer golden cannot use `serde_json::Value`**
- **Found during:** Task 3
- **Issue:** without the ordered-map feature `Value` sorts object keys, losing the `stack, name` order the golden pins.
- **Fix:** `golden.rs` parses renderer cases with its own order-preserving visitor (also expanding `$gen`), keeping `preserve_order` off.
- **Commit:** `3cf2c9fbf`

### Process deviations

- **TDD cycle collapsed to one commit per task.** Tasks 2, 3 and 4 are `tdd="true"`, but `gsd_run check tdd-red-evidence` has no adapter for `cargo test` output, and a Rust test that names a symbol that does not exist is a build failure, which the classifier refuses as INVALID_RED. Tests and implementation were written together and committed as one `feat` per task. RED was evidenced by mutation instead: with the rotate rename replaced by a no-op, 6 writer tests and the golden failed; with the file mode changed to 0644, `writer::mode::a_new_log_file_is_created_0600` failed; both mutations were reverted and the suite returned to green. This is weaker than a committed RED and is recorded as such.
- **`gamelib-testutil` added as a gamelib-core dev-dependency** (needed for FakeHome in store tests; no cycle, testutil does not depend on core). The plan's `files_modified` lists core's `Cargo.toml`, so the file is in scope; the dev-dependency itself was not spelled out.

**Total deviations:** 3 auto-fixed (1 bug, 2 blocking) plus the two process notes above. **Impact:** none on scope; the golden and acceptance criteria are met as written.

## Plan notes (results the plan predicted differently)

- **No `rustOverride` was needed.** The plan allowed for a case where TS rotated `gamelib.log` twice; every TS case uses one shared general writer, so none does, and all 57 non-renderer cases match the unmodified golden.
- The golden prints `golden cases replayed: 57` (equal to the 57 non-renderer cases in `cases.json`) and `renderer cases replayed: 12`.
- Test counts: gamelib-log 36 lib tests (13 `writer::`, 7 `frame::`, 8 `sanitize::`, 8 format and prefix) plus 2 golden tests; gamelib-core 35 (11 paths, 12 store).

## Gates at the last commit

`cargo test -p gamelib-log -p gamelib-core`, `cargo clippy -p gamelib-core -p gamelib-log --all-targets -- -D warnings`, `cargo fmt --check` for both crates, the darwin clippy ratchet over the workspace (`cargo +1.99.1 clippy --workspace --all-targets`, `clippyRatchet.cjs --list`: PASS, no ceiling change), `pnpm codecheck`, `pnpm lint` (0 errors, production and tests PASS), `pnpm find-deadcode` (PASS, 312 baselined), and jest for `logPrefixParity`, `rustTestWorkflow` and `cargoFeatures` (39 passed). Prettier `--file-info` showed all five written non-Rust files as not ignored, and `prettier --check` passed over them. No user-facing string changed, so the hardcoded-string and i18n gates were not run (per plan).

## Issues Encountered

- `writer::windows` (the held-`.old` rename arm) is `cfg(windows)` and could not run on this macOS machine; it is written against `OpenOptionsExt::share_mode` and will run on the CI Windows leg. The unix-only `writer::mode` tests ran and pass here.
- The working tree held unrelated uncommitted work throughout (bridge, SteamEngineLaunchNotice, planning debris); none of it was touched or staged.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model. T-84-04 (appName validation, comet refusal, typed targets only), T-84-05 (0600 test), T-84-06 (bounded channel, catch_unwind, open-append-close, failed rename keeps appending), T-84-07 (`deny_unknown_fields`, closed sets, caps, every invalid vector) and T-84-22 (atomic persist, 0600/0700, corrupt file untouched) are each covered by a named test. T-84-SC: no new registry crate.

## Next Phase Readiness

- 84-03 can wire `gamelib_log::init` into the shell, add `gamelib-log` to the shell's dependencies, and use `Logger::flush` in the exit path.
- 84-05 calls `sanitize::renderer_body` from the native renderer channels and writes the uploadedLogs list through `StoreHost::open_cache`.
- Phase 85 widens `gamelib_core::store` without changing the signatures above.

## Self-Check: PASSED

- Files exist: all ten created files FOUND (`gamelib-log` Cargo.toml, lib.rs, prefix.rs, format.rs, writer.rs, frame.rs, sanitize.rs, tests/golden.rs; `gamelib-core/src/store.rs`; `logPrefixParity.test.ts`).
- Commits are ancestors of HEAD: `0fbbb9522`, `c5136c74f`, `3cf2c9fbf`, `13db3e06c`, `73afed020`; measured count `rev-list --count 92b0d0c86..HEAD` = 5.
- Acceptance: `pub fn log_dir` 1; anchored preserve_order count 0; `-p gamelib-log` in rust-test.yml; `"gamelib-log"` in cargoFeatures 1; `gamelib-log` in rustTestWorkflow at least 3; `logFrameVectors.json` in frame.rs 3; `0o600` in writer.rs 3; `deny_unknown_fields` in frame.rs 4; `encode_utf16` in sanitize.rs present; `pub fn renderer_body` 1; `open_cache` signature 1; `pub enum StoreChange` 1; all five Store methods present; 12 store tests; 8 sanitize tests.
