# Phase 84: Logger - Pattern Map

**Mapped:** 2026-11-21
**Files analyzed:** ~40 (from the 14 plans' `files_modified`, grouped)
**Analogs found:** 12 / 14 groups (2 have no analog)

All analog paths below were checked as tracked source, not mirrors.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `src-tauri/crates/gamelib-log/{Cargo.toml,src/lib.rs}` | crate scaffold | batch | `src-tauri/crates/gamelib-proc/Cargo.toml` (rust-version 1.77.2, two clippy denies, path-dep on gamelib-core) | exact |
| `gamelib-log/src/{writer,format,prefix,sanitize}.rs` | service/utility | file-I/O, transform | `src/backend/logger/{log_writer,formatter,sanitizeRendererLogMessage,constants}.ts` (the behaviour being ported) | exact (port) |
| `gamelib-log/src/limiter.rs` | utility | transform (windowed) | none in repo; spec in plans 84-07 | no analog |
| `gamelib-log/src/bridge.rs` (tracing Layer, log::Log) | provider | event-driven | `gamelib-steamcm/src/vent.rs:548` `install_vent_log_forwarder` (the thing it replaces; copy only the target filtering idea) | partial |
| `gamelib-log/tests/{golden,limiter_golden}.rs` + fixtures | test | transform | `src/common/__fixtures__/openPolicyCases.json` pattern (shared JSON vectors consumed by TS and cargo); gamelib-core `paths.rs` fixtures | role-match |
| `gamelib-core/src/paths.rs` (log paths, D-08) | utility | transform | same file (`Platform`, `join`, `AppPaths`) | exact |
| `gamelib-core/src/store.rs` (StoreHost minimal) | service | CRUD | `gamelib-core/src/paths.rs` (`<userData>/store_cache/<name>.json` rule) + `emitter.rs` for the change event | role-match |
| `gamelib-core/src/shutdown.rs` (`FinishContext`, D-21) | service | event-driven | same file, `run_exit` at ~145-175 | exact |
| `src-tauri/src/log_dispatch.rs`, `log_upload.rs` | controller | request-response / batch | `src-tauri/src/steampoll_dispatch.rs` (`rpc_*` fns, `args: &[Value] -> Result<Value,String>`) ; upload uses reqwest like steamcm | role-match |
| `src-tauri/src/native_router.rs`, `native_handlers.rs` (log send route) | route | pub-sub FIFO slice | same files: `openExternalUrl` route | exact |
| `src-tauri/src/main.rs` (delete `shell_diag`, `init_native_logger`) | config | event-driven | `main.rs:568-600` `shell_diag` being replaced; `install_panic_hook` kept per D-03 | exact |
| `src-tauri/src/{sidecar,shell_open,...}.rs` call sites | modify | n/a | mechanical `shell_diag(..)` -> logger call | n/a |
| `gamelib-steamcm/src/{vent,facade}.rs` | modify (delete forwarder) | n/a | `vent.rs:548`, `facade.rs:549-551` | exact |
| `src/backend/logger/index.ts` forwarder, `sidecar/loggerFlowRegistration.ts` deletion, `bootstrap.ts` | service | fire-and-forget batch | `loggerFlowRegistration.ts` (what it replaces); `sendChannelObservable.ts` | role-match |
| `ipc_contract.rs`, `nativeChannels.json`, `src/common/__fixtures__/logFrameVectors.json` | config | schema | `ipc_contract.rs:665,775` `"openExternalUrl"` entries | exact |
| `.github/workflows/rust-test.yml`, `meta/__tests__/rustTestWorkflow.test.ts`, `Cargo.lock` census | config | CI | existing crate list in those files | exact |

## Pattern Assignments

### `gamelib-log` crate scaffold
**Analog:** `src-tauri/crates/gamelib-proc/Cargo.toml`
```toml
[package]
name = "gamelib-proc"
version = "0.1.0"
edition = "2021"
rust-version = "1.77.2"
publish = false
[lib]
path = "src/lib.rs"
[dependencies]
gamelib-core = { path = "../gamelib-core" }
[dev-dependencies]
gamelib-testutil = { path = "../gamelib-testutil" }
[lints.clippy]
dbg_macro = "deny"
todo = "deny"
```
Add `tracing-subscriber` with `default-features = false` (plans expect new lockfile names tracing-subscriber, sharded-slab, thread_local). No Tauri dependency, no env reads (inject dirs, clock, tz). Follow `src-tauri/crates/README.md` recipe.

### `gamelib-log/src/{writer,format,prefix,sanitize}.rs` (service, file-I/O)
**Analog:** `src/backend/logger/log_writer.ts` (272 lines) and `formatter.ts`.

Port rules to preserve:
- Line format, `formatter.ts:6-30`: `(HH:MM:SS) [LEVEL]:<pad to MaxLogLevelLength+3> [Prefix]:<pad to MaxLogPrefixLength+3> msg`; empty message returns `''` and the line is skipped.
```ts
const logLevelPrefix = `[${logLevel}]:`.padEnd(MaxLogLevelLength + 3, ' ')
prefixes.push(`[${logPrefix}]:`.padEnd(MaxLogPrefixLength + 3, ' '))
```
- `log_writer.ts:31-50`: the rotate gate is claimed synchronously on first write (once per writer, not reopened after a failed write); a memoized mkdir-p of the parent. In Rust the writer thread owns this, so claim rotation before the first write.
- Rotation: drop file handles before rename/delete, share-delete-friendly opens (Windows; CONTEXT "Established Patterns").
- New files created 0600 on unix (D-18, `#[cfg(unix)] OpenOptionsExt::mode`); mode is not in the golden.
- Timestamps taken at origin (D-12): frames carry `ts` and `tz`.

### `gamelib-core/src/paths.rs` (D-08)
**Analog:** same file lines 1-60. Extend with the log dir rules using the injected-env style:
```rust
pub fn join(platform: Platform, base: &str, parts: &[&str]) -> String {
    let sep = platform.sep();
    let mut out = base.trim_end_matches(sep).to_string();
    for p in parts { out.push(sep); out.push_str(p); }
    out
}
```
Pure functions, env and home injected, join one segment at a time (Windows-correct on any host).

### `gamelib-core/src/shutdown.rs` (D-21, D-13 amendment)
**Analog:** `run_exit` at lines 145-175. `finish: impl FnOnce()` becomes `finish: impl FnOnce(FinishContext)` (carrying `still_running` and remaining budget); the logger's explicit `flush(remaining)` is the last step inside `finish`. No logger registrant. Keep `shutdown::tests` passing.
```rust
children(remaining);
finish();
ExitReport { elapsed: start.elapsed(), still_running }
```

### Native send route for log frames (`native_router.rs`, `native_handlers.rs`)
**Analog:** the `openExternalUrl` route.
```rust
send.insert("openExternalUrl", SendRoute { slice: APP_SHELL_SLICE, validate: native_handlers::parse_open_external_url });
queues.insert(APP_SHELL_SLICE, spawn_slice_worker(APP_SHELL_SLICE, shutdown, move |job| run_send_job(&host, job)));
```
Validate is pure and bounded on the main thread; invalid args are dropped and logged by channel name only (`native_router.rs:~188`: `shell_eprintln!("[shell] native send rejected: {}", echo_channel(channel))`), returning `Ok(())`. Never block the caller (D-10). Note `NativeSendJob` currently carries `url: String`; it needs a widening (enum payload) for log frames. Frame validation (strict fields, size cap, no path from TS, appName without `/`, `\`, `..`, NUL) is exercised by `logFrameVectors.json`.

### `src-tauri/src/log_dispatch.rs` / `log_upload.rs` (invoke handlers)
**Analog:** `src-tauri/src/steampoll_dispatch.rs`:
```rust
pub(crate) fn rpc_steampoll_acf_read_state(args: &[Value]) -> Result<Value, String> { ... }
```
Same signature and arg-validation style for getLogContent, uploadLogFile, deleteUploadedLogFile, getUploadedLogFiles, showLogFileInFolder. Upload: dpaste endpoint `https://dpaste.com/api/v2/` per `src/backend/logger/uploader.ts:14`, expiry behaviour copied from that file.

### `src-tauri/src/main.rs` (shell_diag removal)
**Analog:** `main.rs:568-600`. Delete `shell_diag_log_path` and the file half of `shell_diag`; keep best-effort infallible contract and keep the `shell_eprintln!("[shell] {message}")` echo (the live gate scores `[shell] ` transcript lines). Do not touch `install_panic_hook` / `shell_panic_log_path` (D-03). `shell_diag` callers become `tracing`/logger calls with target `gamelib_shell` (prefix `Shell`).

### `gamelib-steamcm` forwarder deletion
**Analog/target:** `vent.rs:548 install_vent_log_forwarder` and the call at `facade.rs:551`; delete both. The `tracing` Registry + `LogLayer` in `gamelib-log` replaces them (target map: `steam_vent|gamelib_steamcm|gamelib_depot` -> Steam, `gamelib_shell` -> Shell, else Backend; WARN+ default, DEBUG only via `GAMELIB_LOG_LEVEL=debug` passed in from main.rs). Thread-local guard stops writer-thread feedback.

### TS forwarder (`src/backend/logger/index.ts`, `loggerFlowRegistration.ts`)
**Analog:** `loggerFlowRegistration.ts` header (lines 1-30): a `send` channel must be registered once (the IPC registry holds an array; duplicates double-log). After this phase the registration is deleted and `index.ts` sends frames natively through a bounded queue (drop oldest, count `N lines dropped`, D-10), batching raw chunks (D-06). Never use an unregistered send (silent no-op class, G-30-01).

### Tests and fixtures
- Golden is generated from the REAL TS oracle before any logger TS changes (README section 6); `logGolden.test.ts` mocks `../index` so the oracle is independent. Fixtures in `gamelib-log/tests/fixtures/golden/` are prettier-ignored with a reason in `.prettierignore`.
- Shared JSON vectors consumed by both jest and cargo: model on `src/common/__fixtures__/openPolicyCases.json`.
- Tests spawning children or writing real log dirs use `createFakeHomeProfile()` (convention 2); Rust tests inject a temp dir and a scripted clock.

## Shared Patterns

### Infallible from callers' view
Source: `main.rs:581` `shell_diag` and `install_panic_hook`: every fallible step is swallowed; logging never fails an operation.

### Never block the main thread
Source: `native_router.rs` `route_send` docs (validate plus enqueue only; the 2026-10-05 freeze).

### Windows-safe file handling
Source: CONTEXT "Established Patterns": drop handles before rename/delete, join path segments one at a time (`paths.rs::join`).

### Crate conventions
Source: `gamelib-proc/Cargo.toml` plus `src-tauri/crates/README.md`: Tauri-free, no env reads, clippy deny `dbg_macro`/`todo`, add to `rust-test.yml` `-p` list and `rustTestWorkflow.test.ts`.

## No Analog Found

| File | Role | Reason |
|---|---|---|
| `gamelib-log/src/limiter.rs` | utility | No windowed rate limiter exists; use 84-07 spec (60 s, burst 5, 256 keys, 200-char excerpt, scripted-clock golden) |
| `gamelib-core/src/store.rs` | service | No Rust store owner exists yet; model atomic write and change event on `emitter.rs` plus the `store_cache/<name>.json` rule in `paths.rs` (Phase 85 widens it) |

## Metadata

**Analog search scope:** `src-tauri/crates/*`, `src-tauri/src/*`, `src/backend/logger`, `src/backend/sidecar`
**Pattern extraction date:** 2026-11-21
