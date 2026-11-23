---
phase: 87-engine-wine-and-tools
plan: 06
subsystem: infra
tags: [rust, fetch, reqwest, replay, golden, dxvk, engine-ctx, wine-ctx, scripted-fakes, cli]

requires:
  - phase: 87-engine-wine-and-tools
    provides: the SpecRunner seam and SpecProcRunner (87-04), the gamelib-engine and gamelib-wine crates and both CLIs (87-02)
  - phase: 86-info-services
    provides: the Http/ReqwestHttp/Replay pinning rules this Fetch seam copies
provides:
  - gamelib_engine::fetch (Fetch, FetchRequest, FetchResponse, FetchError, Progress, DownloadOutcome, ReqwestFetch, Replay) serving JSON GETs and streamed downloads with progress and cancel
  - gamelib_engine::dxvk (DxvkInstaller, DxvkRequest, DxvkTool, DxvkAction, DxvkSource, NoDxvk), the engine-owned DXVK seam (D-25 a)
  - gamelib_engine::sinks (EngineUi, EngineLog, NullEmitter)
  - the full EngineCtx (proc, fetch, emitter, ui, log, i18n, dxvk, app_version, with_* swaps) and WineCtx (fetch, proc)
  - gamelib_engine::testing (ScriptedSpecRunner, ScriptedDxvk, RecordingEmitter, RecordingUi, RecordingLog, FixedClock), forwarded by gamelib-wine's testing feature
  - CLI flags --replay and --home on both gamelib-engine-cli and gamelib-wine-cli
affects: [every later Phase 87 Rust port plan, 87-27, 87-29, 87-40, 87-41]

actuals:
  tokens: 27843
  tasks: 2
  commits: 2

plan_head_before: e8126f3a56582e67ec764c527d8b08d3017e2b9a
plan_head_after: 7e39e165e11f75ca336f86a825f5fefae4ecb5d8

tech-stack:
  added: []
  patterns:
    - "one network seam: Fetch with a Replay that pins method, URL, query and the pinned headers (the GameLib User-Agent among them) and fails on an unmatched or leftover exchange; a download goes through one writer (write_body) shared by ReqwestFetch and Replay"
    - "a download streams to <dest>.part and is renamed over dest, so dest is never half written; any failure or cancel removes the part file"
    - "FetchError is a category (network, status(n), failed-to-get-headers, aborted, too-large, io); a reqwest::Error is classified after .without_url() and nothing of it is kept"
    - "progress throttling reads the injected Clock, never wall time, so a stepping FixedClock makes the sequence deterministic"
    - "EngineCtx::new fills neutral defaults (SpecProcRunner, a lazy ReqwestFetch, NullEmitter, NoDxvk, an empty catalog); with_* methods swap one seam"

key-files:
  created:
    - src-tauri/crates/gamelib-engine/src/fetch.rs
    - src-tauri/crates/gamelib-engine/src/dxvk.rs
    - src-tauri/crates/gamelib-engine/src/sinks.rs
    - src-tauri/crates/gamelib-engine/src/testing.rs
    - src-tauri/crates/gamelib-engine/tests/fetch_replay.rs
    - src-tauri/crates/gamelib-engine/tests/fixtures/recorded/fetch_selftest/ (7 cases)
  modified:
    - src-tauri/crates/gamelib-engine/Cargo.toml
    - src-tauri/crates/gamelib-engine/src/lib.rs
    - src-tauri/crates/gamelib-engine/src/ctx.rs
    - src-tauri/crates/gamelib-wine/Cargo.toml
    - src-tauri/crates/gamelib-wine/src/ctx.rs
    - src-tauri/crates/gamelib-engine-cli/src/main.rs
    - src-tauri/crates/gamelib-engine-cli/tests/cli.rs
    - src-tauri/crates/gamelib-wine-cli/src/main.rs
    - src-tauri/crates/gamelib-wine-cli/tests/cli.rs
    - src-tauri/Cargo.lock

key-decisions:
  - "Replay makes a HEAD for a download only when the case recorded one for that URL: the 87-05 TS recordings of a download are a GET, so a Rust HEAD there would be an unmatched request, while ReqwestFetch always makes the HEAD the TS made"
  - "A Fetch::get answers any HTTP status as a response and FetchResponse::error_for_status gives the axios throw-on-non-2xx; a download maps a non-2xx to status(n)"
  - "DxvkTool carries the TS's fourth name dxvk-macOS (the tool a bottle on the pinned engine gets) and the source is a DxvkSource {dir, version} like the TS, not a bare string"
  - "The CLI's default home stays <user-data>/home, not the user-data directory's parent: a --user-data path the operator gave could have a real directory as its parent"

patterns-established:
  - "A wine test replays its own case through WineCtx::with_fetch and keeps the Arc<Replay> to call finish(); the sticky failure names the unmatched request while the caller sees only a category"
  - "ScriptedSpecRunner records spawns in the oracle's spawns.json vocabulary (program, argv, envDiff set/unset against a base env, cwd, stdin, via, result) so a golden compares RecordedSpawn::to_json directly"

requirements-completed: [SVC-02]

coverage:
  - id: D1
    description: "Fetch seam: ReqwestFetch and a pinning Replay serve a recorded GET and a streamed download byte for byte, with throttled progress, cancel, failed-HEAD and status mapping, and errors that never carry a URL"
    requirement: SVC-02
    verification:
      - kind: integration
        ref: "cargo test -p gamelib-engine --features testing --test fetch_replay (14 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The engine-owned DxvkInstaller trait injected as EngineCtx.dxvk with a NoDxvk default and a ScriptedDxvk fake, with no gamelib-wine in gamelib-engine's tree"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "cargo test -p gamelib-engine --features testing (dxvk, ctx, testing modules)"
        status: pass
      - kind: other
        ref: "test \"$(cargo tree -p gamelib-engine | grep -c gamelib-wine)\" -eq 0"
        status: pass
    human_judgment: false
  - id: D3
    description: "Full EngineCtx and WineCtx (emitter, ui, log, i18n, proc, fetch, dxvk, app_version), the scripted fakes behind the testing feature, and --replay and --home on both CLIs that fail the run on replay drift"
    requirement: SVC-02
    verification:
      - kind: integration
        ref: "cargo test -p gamelib-engine-cli -p gamelib-wine -p gamelib-wine-cli"
        status: pass
    human_judgment: false

duration: 12 min
completed: 2026-11-23
status: complete
---

# Phase 87 Plan 06: Fetch seam, DxvkInstaller and the full contexts Summary

**One network seam (`Fetch`) whose `Replay` pins every Rust request to its recorded TS twin and streams downloads byte for byte with progress and cancel, plus the engine-owned `DxvkInstaller`, the UI and log sinks and scripted fakes, so every later port builds an `EngineCtx` or `WineCtx` with real or scripted seams and no crate cycle.**

## Performance

- **Duration:** 12 min (2026-11-23T01:18Z to 01:30Z)
- **Tasks:** 2 of 2
- **Files:** 4 new sources, 1 new integration test, 7 fixture cases, 10 modified files

## Accomplishments

- `gamelib_engine::fetch` is `Fetch` (`get` and `download`), `ReqwestFetch` (a HEAD for the length then a streamed GET, one connection, five redirects, a lazily built client after the rustls provider is installed) and `Replay` behind `testing`. `Replay` copies gamelib-info's pinning rules: method, scheme, host, path, the decoded query in order and the pinned headers in both directions, `tsOnly`, `rustOnly`, `networkError`, a sticky first failure and a `finish()` that fails on any leftover exchange. The GameLib `User-Agent` is one pair of consts and `user_agent(version)`.
- A download streams to `<dest>.part`, hashes SHA-256 while it writes, reports progress at most once per second by the injected clock plus a final 100, and renames over `dest` only when complete; a cancel returns `aborted` and a failure of any kind removes the part file. A failed HEAD is `failed-to-get-headers`, a non-2xx GET is `status(n)`. `FetchError` is a category only and `reqwest::Error` is looked at only after `.without_url()` (T-87-09); a test proves a refused connection to `http://127.0.0.1:<port>/private/path?key=SECRET` leaks neither the host, the path nor the key.
- `EngineCtx` carries `proc: Arc<dyn SpecRunner>`, `fetch`, `emitter`, `ui: Option<Arc<dyn EngineUi>>` (notify, show_dialog with an ack id, raise_main_window, send_to_sidecar), `log`, `i18n: Arc<Catalog>`, `dxvk: Arc<dyn DxvkInstaller>` and `app_version`. `EngineCtx::new` keeps its signature and fills neutral defaults, nothing spawns or connects at build time, and `with_*` swaps one seam. `WineCtx` takes its own `fetch` and `proc` from the engine context, and gamelib-wine's `testing` feature forwards `gamelib-engine/testing`.
- `gamelib_engine::testing`: `ScriptedSpecRunner` (outputs keyed by program and argv, recording every spawn with its env diffed against a base and a `to_json` in the oracle's `spawns.json` shape, unscripted spawns listed), `ScriptedDxvk`, `RecordingEmitter`, `RecordingUi`, `RecordingLog`, `FixedClock` (fixed, stepping, set, advance).
- Both CLIs build the context with `--home <dir>` (default `<user-data>/home`) and `--replay <case-dir>`; a replayed run exits 2 on a request the case does not hold or an exchange left over, and withholds its stdout. They use the shared `FixedClock` instead of each carrying its own.

## Task Commits

1. **Task 1 (tracer): Fetch, ReqwestFetch and the pinning Replay end to end** - `423fa415a` (feat)
2. **Task 2: EngineCtx and WineCtx in full, DxvkInstaller, sinks, scripted fakes, CLI wiring** - `7e39e165e` (feat)

Tracer gate: auto mode off, `HUMAN_VERIFY_MODE` end-of-phase, the tracer's `<verify>` is automated only, so it was re-run end to end after the commit and passed. Tracer verified end-to-end, expansion followed.

TDD (task-level, plan type `execute`): the 14 tests of `fetch_replay.rs` were written first. Their RED was a compile failure (`unresolved import gamelib_engine::fetch`), the module not existing, which the strict RED classifier would call `build_failure`; it was not submitted to the classifier because the plan is not `type: tdd`. GREEN followed in the one task commit.

## Verification

- `cargo test -p gamelib-engine --features testing`: 25 unit tests and 14 `fetch_replay` tests passed.
- `cargo test -p gamelib-engine-cli -p gamelib-wine -p gamelib-wine-cli`: 8, 9 and 5 tests passed (the new CLI tests cover drift, `tsOnly` leftover, `--home` and a missing case; wine's `ctx::tests` cover the shared handles and a replay through `WineCtx`).
- `cargo clippy -p gamelib-engine -p gamelib-engine-cli -p gamelib-wine -p gamelib-wine-cli --all-targets --features gamelib-wine/testing -- -D warnings` and `cargo fmt ... --check`: clean.
- Gates: `cargo tree -p gamelib-engine | grep -c gamelib-wine` is 0; `cargo tree -p gamelib-engine -e features | grep -c 'reqwest feature "query"'` is 0; `grep -c without_url fetch.rs` is 3; `pub trait DxvkInstaller` and `pub trait EngineUi` each appear once.
- `npx jest src/backend/__tests__/engineWineFixtureRedaction.test.ts` (87-05's permanent scan over both crates' fixtures): 10 passed with the new `fetch_selftest` fixtures in place.
- Prettier: every path written is Rust, JSON under `gamelib-engine/tests/fixtures` (prettier-ignored by 87-05) or this SUMMARY; no prettier-visible source file was written.

## Decisions Made

See `key-decisions`. In short: Replay's HEAD is conditional on a recorded HEAD (the TS download recordings are a GET); `get` returns any status and `error_for_status` is the axios behaviour; the DXVK request follows the TS shape; the CLI home default stays inside `--user-data`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] DxvkTool and the source type follow the TS, not the plan's shorthand**
- **Found during:** Task 2 (reading `createDxvk.installRemove` in `src/backend/tools/index.ts`)
- **Issue:** the plan names `DxvkTool { Dxvk, DxvkNvapi, Vkd3d }` and `source: Option<String>`. The TS takes four tools (`dxvk-macOS` is the one a pinned-engine bottle gets and every macOS golden in 87-09 and 87-27 uses it) and a source of `{ dir, version }`. A three-variant enum could not express the macOS install and a bare string would drop the version.
- **Fix:** added `DxvkTool::DxvkMacOs` (`dxvk-macOS`) and `DxvkSource { dir, version }`; `as_str()` gives the TS names. No downstream plan constructs `DxvkRequest` yet (87-27 and 87-29 only reference the type).
- **Files modified:** `src-tauri/crates/gamelib-engine/src/dxvk.rs`
- **Commit:** `7e39e165e`

**2. [Rule 2 - Missing critical] CLI default home kept inside --user-data**
- **Found during:** Task 2
- **Issue:** the plan says `--home` defaults to "the user-data dir's parent FakeHome". A `--user-data` the operator types can sit directly under a real directory (`~/scratch/userData`), so the parent would be the real profile the CLI must never read or write.
- **Fix:** the default stays `<user-data>/home`, as the CLI already had it; `--home` is the explicit override a FakeHome-based caller passes.
- **Files modified:** `src-tauri/crates/gamelib-engine-cli/src/main.rs`, `src-tauri/crates/gamelib-wine-cli/src/main.rs`
- **Commit:** `7e39e165e`

**3. [Rule 3 - Blocking] `url` and `rustls` added to gamelib-engine**
- **Found during:** Task 1
- **Issue:** the plan lists reqwest, futures-util and sha2. Replay matches on parsed URLs and reqwest with `rustls-no-provider` needs a provider installed before a client is built.
- **Fix:** `rustls` (ring) as a dependency and `url` as an optional dependency behind `testing`, the pins gamelib-info already uses. Cargo.lock gained dependency edges for `gamelib-engine` only, no new package name (T-87-SC holds).
- **Files modified:** `src-tauri/crates/gamelib-engine/Cargo.toml`, `src-tauri/Cargo.lock`
- **Commit:** `423fa415a`

**4. [Rule 2 - Missing critical] Extra FetchError categories and a body cap**
- **Found during:** Task 1
- **Issue:** the plan lists four categories. A download writes a file (a disk failure is not `network`) and a get reads a body into memory (a hostile or wrong URL could send gigabytes).
- **Fix:** added `io` and `too-large` (a get over 16 MiB, refused by declared length before reading and again while reading), plus a 60 s default get timeout and a 60 s per-chunk idle limit on downloads, so a stalled transfer cannot hold a Shutdown registrant open.
- **Files modified:** `src-tauri/crates/gamelib-engine/src/fetch.rs`
- **Commit:** `423fa415a`

---

**Total deviations:** 4 auto-fixed (1 Rule 1, 2 Rule 2, 1 Rule 3). **Impact on plan:** all necessary for fidelity to the TS or for safety; no scope creep and no later plan is affected.

## Issues Encountered

None beyond the deviations. `cargo fmt` reformatted several files after the first write; the committed state is formatted.

## Known Stubs

None. `NoDxvk` and `NullEmitter` are the intended neutral defaults, not stubs; the real DXVK installer is 87-29's and the shell's emitter and UI sinks arrive with the shell wiring.

## Threat Flags

None. The only new network surface is the `Fetch` seam the plan's threat model (T-87-09) already covers, and its mitigation (category-only errors, `without_url()` first) is implemented and tested.

## Self-Check: PASSED

- FOUND: src-tauri/crates/gamelib-engine/src/fetch.rs, dxvk.rs, sinks.rs, testing.rs
- FOUND: src-tauri/crates/gamelib-engine/tests/fetch_replay.rs
- FOUND: commit 423fa415a, commit 7e39e165e (both ancestors of HEAD)
