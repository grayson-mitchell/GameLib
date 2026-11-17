# Technology Stack: v0.11 Node Sidecar Retirement

**Project:** GameLib, milestone v0.11 (phase numbering starts at 82)
**Researched:** 2026-11-17
**Scope:** only what the port of `src/backend` to Rust adds. The Steam crates, `steam-vent`,
`gamelib-depot` and the Tauri shell plugins are not re-researched (see `.planning/research/STEAM-STACK.md`).
**Versions:** crates.io `max_stable_version` queried 2026-11-17 (HIGH). Choice rationale is
this researcher's judgement over the usage evidence below (MEDIUM unless noted).

## 1. Inventory: what the backend actually imports

Measured with `grep -rhoE "from '[^./][^']*'" src/backend` excluding `__tests__`. File counts for the
single-use packages are exact; the package.json runtime deps that only the backend uses are the
ones in the table. Everything else in `dependencies` is renderer-only and stays (React, MUI, fuse.js,
sanitize-html, i18next browser side, zustand, recharts, intro.js, simple-keyboard, short-uuid and so on: zero backend imports).

| Node dependency (backend use) | Importing files | Rust replacement | Verdict |
|---|---|---|---|
| `conf` ^10.2.0 (`store_backend.ts`, one class every store passes through) | 2 | Own `gamelib-store` crate on `serde_json` + `tempfile` (see section 3) | Replace, no crate |
| `graceful-fs` (71) / `fs` / `node:fs` / `fs/promises` (~85) | ~155 | `std::fs`, `tokio::fs` | Replace (std) |
| `path` / `node:path` / `os` / `process` / `util` | ~180 | `std::path`, `std::env`, `directories`-free (paths come from `StoreRoot`/appPaths, port that) | Replace (std) |
| `axios` ^1.20 (20 files) | 20 | `reqwest` 0.13 (already in depot/steamcm) | Replace |
| `zod` ^4.6 (16 files) | 16 | `serde` + `#[serde(deny_unknown_fields, rename_all="camelCase")]` Args structs (the established pattern) | Replace |
| `i18next` + `i18next-fs-backend` (46 files) | 46 | `gamelib-i18n` (exists, `Catalog::load`) | Extend, do not add |
| `node:crypto` / `crypto` (25) | 25 | RustCrypto: `sha2`, `sha1`, `md-5`, `hmac`, `rand`, `base64` | Replace |
| `shlex` ^2.1.2 (10) | 10 | `shlex` 2.0.1 (same author, same API shape) | Replace 1:1 |
| `semver` ^7.7 (2) | 2 | `semver` 1.0.28 | Replace 1:1 |
| `filesize` (2) | 2 | `bytesize` 2.7.0, or a 10-line formatter if output must match byte-for-byte | Replace |
| `sanitize-filename` (1) | 1 | `sanitize-filename` 0.6.0 (verify Windows reserved-name parity in a test) | Replace |
| `plist` ^3.1 (`utils/compatibility_layers.ts`) | 1 | `plist` 1.10.4 | Replace |
| `ini` ^3.0.1 (`gog/games.ts:1254`, parses GOG `goggame` uninstaller ini) | 1 | `rust-ini` 0.21.3 (**not** crate `ini` 2.0.0: 2M downloads vs 146M, newer but unproven) | Replace |
| `json5` (`nile/library.ts`) | 1 | `json5` 1.3.7 | Replace |
| `fs-extra` (`copySync` in `nile/library.ts`) | 1 | 20-line recursive copy helper over `std::fs` (+ `walkdir` 2.5.0 if a second caller needs it); do not add `fs_extra` (unmaintained since 2023) | Replace |
| `easydl` (`utils.ts:1609`, single-file download with resume) | 1 | `reqwest` streaming + Range, the same shape as `gamelib-depot`'s CDN downloader | Replace |
| `@xhayper/discord-rpc` 1.3.0 (`utils.ts:647`) | 1 | `discord-rich-presence` 1.1.0 (IPC-only, matches what the backend does: set activity) | Replace |
| `@shockpkg/icon-encoder` (shortcut/Steam icon) | 1 | `icns` 0.5.0 (macOS) / `ico` 0.6.0 (Windows) over `image` 0.25.10 only if the code actually decodes PNG: check the call site first | Replace (verify scope) |
| `tmp` (`sidecar/bootstrap.ts`, `appFolderStep.ts`) | 2 | `tempfile` 3.27.0 (already in `gamelib-steampoll-cli`) | Replace; the bootstrap use dies with the sidecar |
| `node:zlib` gzip/gunzip/unzip (3 files + `crc32`) | 4 | `flate2` 1.1.11 (already in `gamelib-depot` with `zlib-rs`), `crc32fast` 1.5.5 | Replace |
| in-repo ustar reader (`knownFixOverlayInstall.ts`) | 1 | `tar` 0.4.46 over `flate2::read::GzDecoder` | Replace (see pitfalls: path-traversal parity) |
| `node:net` (`inviteBridge.ts`, `helperProcess.ts`) | 2 | `tokio::net::{TcpStream, UnixStream}` | Replace |
| `node:dns` (`connectivityNow.ts`) | 1 | `tokio::net::lookup_host`; add `hickory-resolver` 0.26.3 only if the probe needs a specific resolver | Replace |
| `node:child_process` / `process/runner.ts` | 1 + runner | `tokio::process` (already in steampoll/steamcm) | Replace (section 4) |
| `typed-emitter`, `type-fest`, `source-map-support`, `i18next-http-backend`, `node-gyp` | n/a | Type-only or Node-only | **Delete** with the sidecar |
| `electron` (2 files, comments and type shims) | 2 | none | **Delete** |
| `fuse.js`, `fastest-levenshtein` | renderer; 1 backend use of levenshtein | `strsim` 0.11.1 for the one backend caller (title matching in `common/matching/titleMatch`, if it runs in Rust) | Replace if the matcher moves |
| `fast-xml-parser` (devDependency, not imported by backend at grep time) | 0 | `quick-xml` 0.42.0 only if an XML caller appears in a slice | Not needed now |

`dependencies` after v0.11 loses (backend-only): conf, graceful-fs, axios (confirm no renderer use),
zod (confirm renderer use first, it may stay), ini, json5, plist, fs-extra, easydl, shlex, semver,
filesize, sanitize-filename, @xhayper/discord-rpc, @shockpkg/icon-encoder, i18next-fs-backend, source-map-support.
Run a renderer-import grep per package at removal time: several (`zod`, `semver`, `filesize`, `i18next`) may be shared.

## 2. Recommended Stack: new Rust dependencies

Every crate here is new to the workspace unless marked "in tree". Keep the existing
conventions: `rust-version = "1.77.2"` for new crates unless a dependency forces more (depot sets
1.89 for `aes 0.9`; anything pulling RustCrypto 0.11 generation, such as `sha2 0.11`, `hmac 0.13`, will
need roughly 1.85+, so set the crate's `rust-version` honestly, as depot did), the two clippy deny lines,
and update `EXPECTED_LOCKFILE_CRATE_NAMES` in the same commit as each lockfile change.

### Async runtime and HTTP (in tree)
| Technology | Version | Purpose | Why |
|---|---|---|---|
| tokio | 1.54.1 (in tree as `"1"`) | Process spawning, timers, file IO, sockets, the long-lived managers | Already the runtime in steamcm/depot/steampoll. One runtime, never a second. |
| tokio-util | 0.7.20 (in tree) | `CancellationToken` replaces `aborthandler` | Depot/steampoll already use it |
| reqwest | 0.13.5 (in tree), `rustls-no-provider` + `ring` provider as in depot | Replaces all 20 axios files | Same TLS config as the Steam crates: no OpenSSL, no per-OS TLS divergence. Add features `json`, `stream`, `gzip`, `cookies` (Humble session) per slice. |
| futures-util | 0.3.34 (in tree) | Stream plumbing for downloads | in tree |
| tokio-stream | 0.1.19 | `LinesStream` over child stdout/stderr | Only if line-splitting by hand gets ugly; `tokio::io::BufReader::lines()` is enough for most |

### Persisted JSON stores (new crate `gamelib-store`)
| Technology | Version | Purpose | Why |
|---|---|---|---|
| serde_json with `preserve_order` | 1.0.154 | Read/write store files; dot-path get/set on `Value` | `conf` stores a plain JSON object and writes it with a tab indent. Matching that exactly needs `serde_json::ser::PrettyFormatter::with_indent(b"\t")` and insertion-ordered maps (`preserve_order`) so files diff cleanly and old/new builds interoperate during the dual-path window. |
| tempfile | 3.27.0 | Atomic write: `NamedTempFile::new_in(dir)` then `.persist(path)` after `sync_all` | Same guarantee `conf` gets from `write-file-atomic`, no new crate. `atomic-write-file` 0.3.1 is the alternative (6M downloads, thin); only switch if Windows rename-over-open-file races show up in testing. |
| fs4 | 1.1.0 (**defer**) | Advisory file lock | Only needed if two processes write one store. One shell process owns the stores after retirement, so skip. `fs2` is dead (2018). |

### Logging
| Technology | Version | Purpose | Why |
|---|---|---|---|
| (own `gamelib-log` module/crate) | n/a | Port `logger/` (formatter, `LogWriter`, rotation, file modes) | The log line format, per-prefix files, rotation and the renderer-supplied `sanitizeRendererLogMessage` are product behaviour that tools and users read. Port the 272-line writer rather than re-express it in a framework. |
| tracing | 0.1.44 (in tree via steamcm) | Receive events from `steam-vent`, `reqwest`, `rustls` | steam-vent emits `tracing`; route it into the same writer with a tiny `Layer`. |
| tracing-subscriber | 0.3.23 | The `Layer` plumbing only | Do not use `tracing-appender` 0.2.5 as the primary file logger: it does not give the existing per-prefix file split, rotation-on-first-write gate or the `0o600` modes. |

### Process spawning and output parsing (legendary/gogdl/nile/wine)
| Technology | Version | Purpose | Why |
|---|---|---|---|
| tokio::process (in tokio, feature `process`) | 1.54.1 | Spawn, stdio pipes, `kill_on_drop`, `wait` | Already proven in steampoll. Argv-form only (never a shell), matching the existing sidecar rule. |
| shlex | 2.0.1 | Split user-entered launch-option/wrapper strings | 1:1 with the TS `shlex` dependency |
| regex | 1.13.1 | Progress/ETA/size line parsing from legendary/gogdl/nile stderr | Existing TS parsing is regex-based; port patterns verbatim and golden-test against captured transcripts (section 5). Compile once with `std::sync::LazyLock`. |
| which | 8.0.6 | Locate wine/gamescope/umu binaries on PATH | Replaces hand-rolled PATH walks |
| libc / nix | libc 0.2.186 in tree; nix 0.32.0 | Process-group kill (`killpg`), signals | `libc` is already a unix dep; add `nix` only if the signal code gets large. Windows tree-kill: `windows-sys` Job Objects (already a windows dep). |
| sysinfo | 0.40.4 | Process enumeration (running-game detection, wineserver wait) | Only if a slice needs a process list; the steampoll `running.rs` approach may already cover it. |

### Archive and compression
| Technology | Version | Purpose | Why |
|---|---|---|---|
| flate2 | 1.1.11 (in tree, `zlib-rs`) | gzip/zlib for knownFix overlays, crossover index, GOG `unzipSync` (raw zlib, not a .zip) | in tree |
| tar | 0.4.46 | Replaces the hand-written ustar reader | Use `Archive::unpack_in`-style entry-by-entry extraction so traversal checks stay under your control (pitfall 3) |
| zip | 9.6.1 | Only if a slice finds a real `.zip` (Wine/engine/tool downloads, DXVK, Gamescope bundles) | Verify the actual archive formats the engine/tools index downloads before adding; do not add speculatively. |
| sevenz-rust2 | 0.25.0 | Only if a tool ships as `.7z` | Same rule |
| zstd 0.14.4, xz2 0.1.7 | in tree (depot) | `.tar.zst`/`.tar.xz` engine archives, if used | in tree. Note xz2 0.1.7 is old (2022); depot already carries it with `static`. |
| crc32fast | 1.5.5 | Steam non-Steam shortcut appid (`crc32` in `steamhelper.ts`) | Must equal zlib's crc32 (it does) |

### Parsers
| Format | Crate | Version | Notes |
|---|---|---|---|
| VDF (libraryfolders, ACF, localconfig, registry, shortcuts) | `gamelib-steamfiles` | in tree | Do not add `keyvalues-parser`; the in-repo crate already owns binary + text VDF. |
| plist | `plist` | 1.10.4 | Wine/CrossOver `Info.plist`, `compatibility_layers.ts` |
| ini | `rust-ini` | 0.21.3 | GOG goggame ini; `configparser` 3.3.0 is the alternative but has Python-semantics surprises |
| xml | `quick-xml` | 0.42.0 | Only on demand (no backend XML import found today) |
| json5 | `json5` | 1.3.7 | Nile library |
| url | `url` | 2.5.8 | Probably already transitive via reqwest; use for Humble/store URL handling |

### Crypto
| Crate | Version | Purpose |
|---|---|---|
| sha2 | 0.11.1 | Overlay/redist ledger verification, token hashing |
| sha1 | 0.11.0 (in tree) | where TS used `createHash('sha1')` |
| md-5 | 0.11.0 | Legendary/GOG manifest md5 if used |
| hmac | 0.13.0 | Only if a TS caller uses `createHmac` (grep at slice time) |
| rand | 0.10.4 | Replaces `randomBytes`/`randomUUID` |
| uuid | 1.29.3 | If `randomUUID` ids must stay UUIDv4 strings |
| base64 | 0.23.1 | **Version skew:** steamcm pins `0.22`. Use `0.22` in new crates to keep one copy unless a slice needs 0.23 features. |

### Keyring, notifications, i18n, dialogs, tray (already Rust)
| Concern | Status | Action |
|---|---|---|
| keyring | `keyring = "3"` in `src-tauri/Cargo.toml`, wired via `keyring_dispatch.rs` | Keep. 4.2.0 exists on crates.io; upgrading is a separate, deliberate change with Keychain-prompt re-verification, not part of v0.11. Port TS `secretStore`/`tokenStore` callers to call the Rust fn directly instead of through rustInvoke. |
| notifications | `tauri-plugin-notification` + `macos_notifications.rs`, `notification_show.rs` | Delete `backend/dialog` Notification usage; call these directly from Rust managers via a host trait. |
| i18n | `gamelib-i18n` (`Catalog::load(dir, lang)`) | Port the remaining `i18next.t` call sites; extend crate with interpolation/plural if any caller needs it, do not add a third-party i18n crate. |
| dialogs | `rfd`, `tauri-plugin-dialog`, `dialogs.rs` | Existing. |
| shell/open | `tauri-plugin-opener`, `shell_open.rs` | Existing. |

### File watching
| Technology | Version | Purpose | Why |
|---|---|---|---|
| notify | 8.2.2 | Replaces `installedJsonWatcher.ts` and `fs.watch` in `launchEngine`/bootstrap | The standard, actively maintained crate. 12 backend files mention timers/watch; most are polling `setInterval`, which become `tokio::time::interval`, not a watcher. |
| notify-debouncer-full | 0.7.0 | Coalesce bursty writes to `installed.json` | Legendary rewrites the file in several writes. Always **also** keep a periodic re-read: macOS FSEvents and network or Wine-prefix filesystems drop events. |

### Discord
`discord-rich-presence` 1.1.0 (blocking IPC client; run on `spawn_blocking`). `discord-presence` 3.2.0
is the alternative with an event model the backend does not use. Confidence MEDIUM: confirm the exact
activity fields in `utils.ts:647` map before committing.

## 3. Pattern: persisted stores and versioned migrations

What exists: `store_backend.ts` wraps `conf` (JSON file per store, `configName` + `cwd`, dot keys,
`0o600` modes enforced, containment check, read-only refusal) and `storeVersioning/`
(engine, backup, per-store codecs in `storeMigrations`, ~786 lines) owns versions and backup before
migrate. Both are product-specific logic that no crate replaces. Recommendation:

1. New Tauri-free crate **`gamelib-store`** (library + `-cli`, per the Phase 63 recipe).
2. `Store { path, value: serde_json::Map, version }` with `get(dotKey)`, `set`, `delete`, `has`, `clear`;
   writes through `tempfile` persist, tab-indented, preserved key order, `0o600`/dir `0o700` on unix.
3. Port `storeVersioning` as a pure state machine with `fn migrate(from: u32, v: Value) -> Result<Value>`
   step tables per store (no crate: `serde_json::Value` transforms). Backup-before-migrate and refuse-newer-version behaviour move 1:1.
4. Typed access at call sites via `serde` structs deserialized from the `Value`; unknown keys must round-trip (`#[serde(flatten)] extra: Map`) so a newer build's fields survive an older build's write.
5. A single owner. Because the sidecar and Rust shell both read some stores today (shell reads
   settings), cut the store ports in order: stores crate first, then every consumer, so the
   dual-writer window is as short as possible.

Do not adopt `confy`, `config`, `figment` (they own the format), `sled`/`redb` (changes on-disk format, breaks rollback) or `rusqlite` (no relational need).

## 4. Pattern: how crates plug into the shell (verified from the repo)

Three layers, repeated for scan, steamfiles, steamcm, depot, steampoll:

1. **Library crate** `src-tauri/crates/<name>`, Tauri-free. `dispatch(op, &[Value]) -> Result<Value,String>`
   with sorted `OPS`, `catch_unwind`, `deny_unknown_fields` Args, results-not-errors.
2. **App channel**: a `RUST_*` const in `src/common/types/sidecarTransport.ts` (`RUST_INVOKE_CHANNELS`), an
   arm in `dispatch_rust_channel` (`src-tauri/src/sidecar.rs`), and a `<crate>_dispatch.rs` in
   `src-tauri/src` holding the `rpc_*` handlers (see `steampoll_dispatch.rs`). The TS side calls
   `requestRustInvoke` (sidecar to Rust). All channels are strings in/out, no bytes.
3. **Headless**: `<crate>-cli` (`<op> <json>`, `--list`, `--ndjson`), spawned argv-form from `meta/` under
   `createFakeHomeProfile()`, for parity sweeps and Jest.

Stateful long-running work (Phases 79 and 80) adds a **host trait** (`PollHost` in steampoll `host.rs`):
the crate defines `trait Host { notify, emit_state_event, ... }` and the app implements it, so the crate stays
Tauri-free while the shell supplies notifications, i18n and event emission. Parity is proven by replay
(Tier 1 golden fixtures permanent, Tier 2 local oracle-vs-Rust sweep, deleted at the end).

**What changes in v0.11 (the important design decision).** Until now every port was a *leaf*
reached by `rustInvoke` from TS. A leaf cannot be ported that way once its **callers** are Rust.
Two phases of the recipe need to be added, and the roadmap should treat them as foundation work
before any manager slice:

- **Renderer-facing channels without the sidecar.** Today the renderer's `sidecar_invoke` (in `relay_commands.rs`) forwards
  allow-listed channels into the sidecar. Slice by slice, a channel's handler must be served by a Rust
  handler registered in the same allow-list instead, so the renderer contract is unchanged. Build the
  Rust-side channel router once (`channel -> fn(args) -> future`) and have `sidecar_invoke` consult it
  before falling back to the sidecar. Deleting the sidecar later means deleting only the fallback.
- **Events to the renderer.** `send`/frontend-message frames from the sidecar become `AppHandle::emit` from a
  host trait implementation. Port `backend/host/frontendMessage` and `rustInvokeDeps` (37 import sites) into one `Host` trait early; every
  slice depends on it.

Do not put business logic in `src-tauri/src`: keep it in crates, keep `src-tauri/src` to dispatch shims
(the repo is already splitting oversized shell files, see the single-instance and tray quick tasks).

### Crate layout recommended for the remaining ports
Keep one crate per cohesive domain, not one per TS folder; a new crate costs a lockfile entry,
a parity test and CLI each time.

| Crate | Owns |
|---|---|
| `gamelib-store` | stores, config, versioning (section 3) |
| `gamelib-log` (or module) | logger, log files, rotation |
| `gamelib-proc` | spawn/kill/stream abstraction (`ProcessRunner`), argv builders, wine env, process groups |
| `gamelib-legendary`, `gamelib-gog`, `gamelib-nile` (or one `gamelib-stores-ext`) | argv build, output parsing, library/installed state for each external binary |
| `gamelib-engine` | engine/wine/tools/CrossOver index, bottle primitives |
| `gamelib-humble`, `gamelib-services` | Humble and the long tail |
| Steam slices extend `gamelib-steamcm`, `gamelib-steampoll`, `gamelib-steamfiles`, `gamelib-depot`; the bridge gets `gamelib-steambridge` | |

## 5. Pattern: external binaries (legendary, gogdl, nile) and wine

- Existing TS has a `ProcessRunner` abstraction (`process/runner.ts`, `commandRunner.ts`) with injected clock and
  context. Port the same interface as a Rust trait so tests inject a fake runner, which is how the
  parity tests will work (no real legendary in CI).
- Spawn argv-form with `tokio::process::Command`; set `kill_on_drop(true)` for short jobs but **not**
  for game launches (the game must outlive the app's task). Put each child in its own process group
  (`pre_exec setsid` on unix, `CREATE_NEW_PROCESS_GROUP`/Job Object on Windows).
- Parse output line by line from `BufReader::lines()` on stdout and stderr read concurrently; a
  single-pipe read deadlocks when the other fills. Never `wait_with_output` on long installs.
- **Parity capture first.** Record real legendary/gogdl/nile transcripts (stdout, stderr, exit code,
  timing) once, commit as golden fixtures, and test the Rust parser against them. These tools change their output between releases, so this is
  the only reliable regression net. Pin the bundled binary versions in the golden file's name.
- Wine/CrossOver: env construction, `wineserver --wait` with the existing 30-minute finite timeout, prefix
  bottle primitives. Keep the `createFakeHomeProfile()` discipline for any Rust-side tests that spawn; there is no Rust-side
  equivalent today, so a tiny `gamelib-testutil` crate (fake HOME + env scrub) is worth adding in the
  first slice rather than hand-rolling `env` per crate.
- Downloads from legendary/gogdl stay inside those binaries. Only `easydl` single-file downloads (`utils.ts`) move to reqwest.

## 6. Alternatives Considered

| Category | Recommended | Alternative | Why not |
|---|---|---|---|
| Stores | own `gamelib-store` on serde_json | `confy`/`config`/`figment`, `sled`, `redb`, `rusqlite` | Change the on-disk format or own it; versioned migration and file-compat with the current JSON is the requirement |
| Logging | own writer + `tracing` Layer for third-party | `tracing-appender`, `log4rs`, `flexi_logger`, `tauri-plugin-log` | None reproduce per-prefix files, rotation gate, existing line format; tauri-plugin-log would add a second log destination |
| HTTP | reqwest 0.13 | `ureq`, `hyper` direct, `surf` | One HTTP stack and one rustls config across crates already |
| Async | tokio | async-std/smol | Already tokio everywhere |
| Errors | `String` at the dispatch boundary, `thiserror` 2.0.21 inside crates | `anyhow` | Boundary is `Result<Value,String>` by contract; `thiserror` for typed internal errors is fine; avoid `anyhow` in libraries |
| ini | rust-ini 0.21.3 | `ini` 2.0.0, `configparser` 3.3.0 | Fewer users / different semantics |
| Archive | tar+flate2 | shell out to `tar`, `7z` | Spawning adds a spawn site, platform dependence, and Windows lacks them |
| Watcher | notify 8 | `hotwatch`, polling only | notify is the base; keep a poll backstop |
| Discord | discord-rich-presence | rewrite IPC by hand | Not worth it |
| keyring | keep 3.x | upgrade to 4.2.0 | Out of scope; Keychain behaviour is spike-verified on 3.x |
| Node-in-binary | none | Keep Node SEA for the long tail | Contradicts the milestone goal |

## 7. Installation (per slice; never one big add)

```toml
# gamelib-store
serde = { version = "1", features = ["derive"] }
serde_json = { version = "1", features = ["preserve_order"] }
tempfile = "3"

# gamelib-proc / managers
tokio = { version = "1", features = ["rt-multi-thread", "sync", "time", "process", "macros", "io-util", "fs", "net"] }
tokio-util = "0.7"
shlex = "2"
regex = "1"
which = "8"

# archive / parse, only when the slice needs it
tar = "0.4"
flate2 = { version = "1", default-features = false, features = ["zlib-rs"] }
plist = "1"
rust-ini = "0.21"
json5 = "1"
semver = "1"
crc32fast = "1"
sanitize-filename = "0.6"

# app crate
notify = "8"
notify-debouncer-full = "0.7"
discord-rich-presence = "1"
```

Remove from `package.json` per slice, in the same commit as the TS deletion. At the end: the sidecar
SEA build script, `build:sidecar*`, `@types/node` only if no build tool needs it (Vite config does, keep),
and `node-gyp` if only the SEA build used it.

## 8. What NOT to add

- `tauri-plugin-store`, `tauri-plugin-fs`, `tauri-plugin-log`, `tauri-plugin-http`: duplicates of first-party
  logic that must stay byte-compatible; the backend runs below the webview.
- A second async runtime, OpenSSL/native-tls, `async-trait` for new traits (native async-in-traits needs Rust 1.75+;
  `PollHost` uses a `BoxFuture` pattern already, follow that), `anyhow` in crates, `lazy_static`/`once_cell` (use `std::sync::LazyLock`).
- `keyvalues-parser` or any second VDF parser; `zip`/`sevenz-rust2`/`quick-xml`/`scraper` until a slice proves a caller.
- Embedded JS engines (`deno_core`, `boa`, `rquickjs`) to "keep" TS logic: defeats the goal.
- A new IPC mechanism. The unchanged renderer contract means the `sidecar_invoke`/allow-list stays; only the backend behind it changes.

## Confidence

| Area | Level | Notes |
|---|---|---|
| Inventory of Node imports | HIGH | Measured by grep over `src/backend` (non-test). The package.json renderer/backend split per package must be re-confirmed at each removal. |
| Crate versions | HIGH | crates.io API 2026-11-17. `zip 9.6.1` and `base64 0.23.1` jumps are unusual: confirm API when first used. |
| Shell integration pattern | HIGH | Read from `crates/README.md`, `steampoll_dispatch.rs`, `relay_commands.rs`, Cargo manifests |
| Store/log "own crate" choice | MEDIUM | Judgement from the code (`store_backend.ts`, `log_writer.ts`); not a library question |
| Router-with-fallback for `sidecar_invoke` | MEDIUM | Inferred from `relay_commands.rs`; needs a planning spike to confirm how `send` events and `invoke` ordering are handled |
| discord-rich-presence / icns / notify specifics | MEDIUM | Not checked against docs.rs API per call site |

## Sources

- crates.io API (`/api/v1/crates/<name>`), queried 2026-11-17, for every version in this file
- `/Users/graysonmitchell/Projects/GameLib/package.json`, `src-tauri/Cargo.toml`, `src-tauri/crates/*/Cargo.toml`
- `/Users/graysonmitchell/Projects/GameLib/src-tauri/crates/README.md` (the migration recipe)
- `src-tauri/src/steampoll_dispatch.rs`, `relay_commands.rs`, `sidecar.rs`; `src/backend/store_backend.ts`, `logger/log_writer.ts`, `knownFixOverlayInstall.ts`
