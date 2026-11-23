---
phase: 87-engine-wine-and-tools
plan: 47
subsystem: engine
tags: [rust, fallback-engine, download, sha256, tar, single-flight, gamelib-safety, golden]
status: complete

requires:
  - phase: 87-engine-wine-and-tools
    provides: the 39 fallback goldens (87-14), the shared Fetch seam with the ranged download (87-06, quick 261123-txk), the pin table (87-02), the pin marker (87-38), gamelib-safety (87-01)
provides:
  - gamelib_engine::fallback::{ensure, verify, extract, prune, progress}
  - ensure::ensure_pinned_engine (single flight, reporting), ensure_pinned_engine_in / _detailed (a caller's own pin table), ensure_raw
  - engines::{pinned_engine_paths_at, is_pinned_engine_installed_at, is_wine_installed_at, is_dxvk_installed_at}
  - EngineCtx.fallback (Flights)
  - ops engine_fallback_ensure, engine_fallback_is_installed
  - test golden_fallback.rs (36 of the 39 goldens replayed, plus quit, drop and guard tests)
affects: [87-48, 87-50, 87-55, 87-56]

actuals:
  tokens: 29000
  tasks: 2
  commits: 2

plan_head_before: 3676074a9b4368a97eff86c4b6a00dad8c317c76
plan_head_after: f8b2b0431c7772602ec37551ef7670ae223a3e23

tech-stack:
  added: []
  patterns:
    - "the download is its own spawned task holding the exit registrant; callers join it by pin id and each has a slot (its signal and its progress listener). The task stops when every slot has aborted (polled synchronously at each stage, the TS's synchronous controller.abort) or at quit (its token is a child of the shutdown token)"
    - "a task that outlives its caller holds an Env of cloned seams, never a borrow of the EngineCtx"
    - "every recursive delete of the module is gamelib_safety remove_tree with <tools>/steam-engines as the trust root; a test fails if the module's source names the std recursive delete"

key-files:
  created:
    - src-tauri/crates/gamelib-engine/src/fallback/mod.rs
    - src-tauri/crates/gamelib-engine/src/fallback/ensure.rs
    - src-tauri/crates/gamelib-engine/src/fallback/verify.rs
    - src-tauri/crates/gamelib-engine/src/fallback/extract.rs
    - src-tauri/crates/gamelib-engine/src/fallback/prune.rs
    - src-tauri/crates/gamelib-engine/src/fallback/progress.rs
    - src-tauri/crates/gamelib-engine/tests/golden_fallback.rs
    - src-tauri/crates/gamelib-engine/tests/fixtures/golden/fallback/deltas.json
  modified:
    - src-tauri/crates/gamelib-engine/src/lib.rs
    - src-tauri/crates/gamelib-engine/src/ctx.rs
    - src-tauri/crates/gamelib-engine/src/engines.rs

key-decisions:
  - "The ops are engine_fallback_ensure and engine_fallback_is_installed over the shared pin table only (a caller names a pin id, never a URL or a hash), so a renderer cannot ask for an archive the table does not ship. The goldens' synthetic pins go through ensure_pinned_engine_in, which takes the table."
  - "tar is run without a cancel token, as the TS gave none: a caller's cancel waits for tar and is answered 'aborted during extract'; a quit ends the run through the app-wide shutdown token every SpecRunner run watches. A cancel token made the abort-during-extract golden racy (tar killed, result code null vs the TS 0)."
  - "the sha256 is hashed again from the file on disk after the size check (not taken from the download's own hash): what is extracted is what was verified, and the 'verifying' status keeps its meaning."
  - "the progress the Rust engine reports has no ETA: the reporter never read it, so no golden field is lost."

patterns-established:
  - "a replay that drives several callers on one thread compares each caller's own sequence (events per app, progress per caller), never their interleaving"

requirements-completed: [SVC-02]

coverage:
  - id: D1
    description: "SC1, D-10: ensure_pinned_engine downloads the pinned DXVK then Wine through ctx.fetch.download, verifies size then sha256, extracts through tar into .tmp-<kind>-*, walks for escaping symlinks, writes .gamelib-pin.json and renames into <tools>/steam-engines/<pin id>; every fallback golden except the three boot-sweep cases replays with the same result, status sequence, markers, log lines, requests, spawn trace and profile tree"
    requirement: SVC-02
    verification:
      - kind: integration
        ref: "src-tauri/crates/gamelib-engine/tests/golden_fallback.rs#every_fallback_golden_replays (36 cases)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Integrity (T-87-47, T-87-48): a size or sha256 mismatch refuses and leaves nothing installed and no temp dir; a symlink resolving outside the extraction root refuses before the rename"
    requirement: SVC-02
    verification:
      - kind: integration
        ref: "golden_fallback.rs: size-mismatch-dxvk/wine, sha256-mismatch-dxvk/wine, symlink-escape-wine"
        status: pass
      - kind: unit
        ref: "src/fallback/verify.rs and src/fallback/extract.rs tests"
        status: pass
    human_judgment: false
  - id: D3
    description: "D-19: prune keeps the current and previous pins and removes other engine directories through gamelib-safety; a target outside the engine root, the root itself and a dot-segment path are refused; a symlink is unlinked with its target untouched; no std recursive delete in the module"
    requirement: SVC-02
    verification:
      - kind: integration
        ref: "golden_fallback.rs#the_guard_refuses_a_target_outside_the_engine_root_and_the_root_itself, #the_fallback_module_deletes_nothing_by_itself, prune goldens"
        status: pass
      - kind: command
        ref: "grep -c remove_dir_all src/fallback/*.rs sums to 0"
        status: pass
    human_judgment: false
  - id: D4
    description: "D-17: the flight holds a shutdown.register('engine-fallback') registrant, a quit cancels the download, no .tmp-* directory is left and the registrant is released before the drain returns; a dropped caller counts as aborted"
    requirement: SVC-02
    verification:
      - kind: integration
        ref: "golden_fallback.rs#a_quit_cancels_the_download_and_leaves_no_partial_directory, #a_dropped_caller_counts_as_aborted_and_the_last_one_stops_the_download"
        status: pass
    human_judgment: false
  - id: D5
    description: "A real download of the 228 MB pinned engine from GitHub, with the app's own ReqwestFetch and progress in the renderer, is not exercised: every body in the tests is a synthetic archive of a few KB served by a stub Fetch"
    requirement: SVC-02
    verification: []
    human_judgment: true
    rationale: "No test reaches the network (87-14 prohibition); the live first-need download belongs to the live Mac run owed after the switch-over (87-50 onward)."

duration: not recorded (the start time was not captured; the plan's code closed at 2026-11-23T15:24Z by the host clock)
completed: 2026-11-24
---

# Phase 87 Plan 47: The pinned fallback engine in Rust Summary

**First-need download of the pinned Wine-Staging and DXVK-macOS in gamelib-engine: size then sha256 check, tar through the spawn seam into a temp dir, a symlink-containment walk, the pin marker, a rename, the engine-download status sequence, single-flight joins, and guarded prune and cleanup; 36 of the 39 87-14 goldens replay.**

## Accomplishments

- **Task 1 (tracer):** `fallback::ensure::ensure_pinned_engine` over `ctx.fetch.download` (the ranged five-connection download from quick 261123-txk is inherited, no new downloader). DXVK downloads before Wine, each into `<tools>/steam-engines/.tmp-<kind>-<random>/{dl,out}`; `verify` checks the size, then (emitting `verifying`) the sha256; `extract` runs `tar -xf <archive> -C <out> --strip-components=1` through `ctx.proc` (label `engine-tar`) and walks `out` for symlinks that resolve outside it; the marker is written and `out` renamed into place. `progress::Reporter` emits `gameStatusUpdate {appName, runner, status: 'engine-download', context}` with `downloading:<n>` (weighted over both archives, never decreasing) then `verifying` then `extracting`, then `setting-up`, or `done` on a failure or abort. The tracer's `<verify>` is automated only, so it was re-run end to end before Task 2 (golden_fallback, clippy, fmt) and passed; no checkpoint.
- **Task 2:** every failure path (offline, size and sha256 mismatch, abort before start / during download / verify / extract, tar failure, symlink escape, stale directory replaced), the single-flight joins (two callers one download; an early abort of one of three; all callers aborting), `prune_unpinned_engines` and the installed check, plus unit tests for the reporter and prune. `golden/fallback/deltas.json` records the four differences from the TS.
- **Ops:** `engine_fallback_ensure` ({pinId, appName, runner, cancelId?}, the sidecar's `PinnedEngineResult` shape) and `engine_fallback_is_installed` ({pinId}). Both take a shipped pin id only; an unknown pin or a bad cancel id is an error.
- **Mutation evidence:** accepting any sha256 turned the replay red; keeping every directory in prune turned it red. Both were reverted before the commit.

## Task Commits

1. **Task 1 (tracer): the pinned fallback engine download in Rust, golden-matched** - `66ea2015c` (feat)
2. **Task 2: reporter and prune unit tests for the failure and retention paths** - `f8b2b0431` (test)

Task 1's commit carries the whole production module and the golden replay (including all the failure paths and prune, which the module needed to compile as one unit); Task 2's commit is the unit-test coverage added after the acceptance check, so the split is less clean than the plan's.

## How this relates to the TS paths, and what remains for the switch-over

- **Nothing calls this yet.** `engines/pinEngine.ts` (`restorePinEngine` / `ensurePinEngine`) and `prepareBottle`'s re-ask-Rust-on-`no DXVK source to restore` still run the TS download (`engine/fallbackEngine.ts`, `pinnedEngineProgress.ts`), which stays until 87-56. `CtxPerGameDeps::ensure_pin` in Rust still answers `PinOutcome::Failed("the pinned engine is not installed")` for a pin that is not on disk; this plan did not touch it.
- **87-50 (launch composition)** and the per-game bottle path should call `ensure_pinned_engine` where the TS calls `ensurePinnedEngineReportingStatus`: `CtxPerGameDeps::ensure_pin` should call it (mapping `Ready` to `PinOutcome::Ready`, an aborted result to `PinOutcome::Aborted`, a failure to `PinOutcome::Failed(error)`) instead of treating a missing pin as a failure. That wire-up is not in this plan's file list.
- **87-55 (rpc arms):** the TS callers need an arm for `engine_fallback_ensure` (with a `cancelId` the sidecar's `AbortSignal` is mapped to, via `engine_cancel`) and `engine_fallback_is_installed`.
- **87-48** moves the stale-`.tmp-*` boot sweep from the sidecar; the three sweep goldens are named in `golden_fallback.rs` (`SWEEP_CASES`) and left to it. `prune::remove_guarded` and `Flights::active_installs` are what it will reuse.

## Decisions Made

See `key-decisions`. In short: pin ids only over the op surface, tar without a cancel token (as the TS), a second sha256 read from disk, no ETA.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The plan's `EnsureArgs` has no way to name a test pin**
- **Found during:** Task 1
- **Issue:** the plan says test pins "come from the case (overriding the shared table)"; an op that takes only `pin_id` cannot carry a synthetic pin, and a caller's abort signal and progress hook cannot cross an op either.
- **Fix:** `ensure_pinned_engine(ctx, EnsureArgs)` is the op's function (shared table, `cancel_id` through `ctx.cancels`); `ensure_pinned_engine_in` and `_detailed` take the table, the pin and a `Caller {cancel, tap}`. The goldens replay through `_detailed`.
- **Files modified:** `src/fallback/ensure.rs`
- **Committed in:** `66ea2015c`

**2. [Rule 1 - Bug] A cancel token on tar made abort-during-extract racy**
- **Found during:** Task 1
- **Issue:** the golden records tar finishing (code 0) before `aborted during extract`; with the flight's token on the spawn the cancel reached tar first and killed it.
- **Fix:** tar carries no cancel token (quit still ends it via the global shutdown token). Recorded in `run_tar`'s doc and `key-decisions`.
- **Files modified:** `src/fallback/extract.rs`, `src/fallback/ensure.rs`
- **Committed in:** `66ea2015c`

**3. [Process] Not all 39 goldens replay here**
- The three boot-sweep goldens are 87-48's by the plan (its objective and truths). The replay lists them by id and asserts the count adds up, so none is skipped silently; the plan's "MANIFEST count -ge 12" holds (39).

**4. [Rule 2 - Missing critical] A dropped caller aborts its slot**
- **Issue:** the op future can be dropped (the renderer goes away); the TS had an `AbortSignal` for this. Without a guard the flight would keep running for nobody and keep a registrant until it finished.
- **Fix:** a `LeaveOnDrop` guard counts a dropped caller as aborted, so the last one leaving stops the download. Test: `a_dropped_caller_counts_as_aborted_and_the_last_one_stops_the_download`.
- **Committed in:** `66ea2015c`

### Recorded deltas (`golden/fallback/deltas.json`)

1. `download-failure-detail-is-the-fetch-category`: the Rust detail of a failed download is the fetch category word ('network', 'aborted'), not the TS downloader's message (T-87-09).
2. `extract-failure-log-names-no-tar-output`: the engine log says 'Engine: tar exited with an error', not the TS's 'Extracting Error: <stderr>' (T-86-15).
3. `removal-goes-through-the-safety-guard`: every delete is `remove_tree` under the engine root (D-19); where the TS would have deleted and the guard refuses, the directory stays with a warning. No golden reaches that branch; the guard test pins it.
4. `unavailable-log-line-names-the-reason-not-the-detail`: 'built-in engine unavailable ...' logs the reason only (a detail can carry a profile path).

**Total deviations:** 4 (1 Rule 3, 1 Rule 1, 1 Rule 2, 1 process) plus the 4 recorded deltas. **Impact:** none on the goals; the goldens' outcomes, events, markers and trees all match.

## Issues Encountered

- The goldens drive several callers; in Rust the callers' events interleave by scheduling, so those cases compare per-app sequences (and sorted log lines), which is stated in the test header. The single-caller cases compare the whole event order.

## Known Stubs

None.

## Threat Flags

None. T-87-47 and T-87-48 are mitigated as planned (size, sha256, contained extraction, rename only after the walk; refusal removes the temp dir); T-87-SC accepted (no new crate; `sha2` and `futures-util` were already dependencies).

## Self-Check: PASSED

- Created files verified on disk: all six `src/fallback/*.rs`, `tests/golden_fallback.rs`, `golden/fallback/deltas.json`.
- Commits `66ea2015c` and `f8b2b0431` are ancestors of HEAD; `commits: 2` measured from the ledger base `3676074a9`.
- `cargo test -p gamelib-engine --features testing` passes (130 lib tests, `golden_fallback` 8, the rest unchanged); `cargo clippy -p gamelib-engine --all-targets --features testing -- -D warnings`, `cargo fmt -p gamelib-engine --check` and `cargo check -p gamelib-engine-cli` pass.
- Acceptance criteria: the download-ok golden passes with its event sequence and marker bytes; every replayed golden/fallback case passes (MANIFEST count 39, floor 30 asserted); `grep -c remove_dir_all src/fallback/*.rs` sums to 0; the existing goldens are untouched (only `deltas.json` was added).
- Prettier check omitted as the tasks' verify blocks say: every path written is Rust or a `.planning` file (ignored).

## Next Phase Readiness

Ready for 87-48 (the boot sweep). The live first-need download and the Rust `CtxPerGameDeps::ensure_pin` wire-up are owed to the switch-over plans (87-50, 87-55, 87-56).

---
*Phase: 87-engine-wine-and-tools*
*Completed: 2026-11-24*
