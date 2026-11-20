# Phase 84: Logger - Research

**Researched:** 2026-11-20
**Domain:** Moving a Node log writer, its renderer channels, an HTTP uploader and the shell's second log path into Rust (std threads, `tracing`/`log` bridges, one append-only file writer), keeping the line format, files, rotation and renderer sanitising byte-for-byte
**Confidence:** HIGH on the behaviour inventory and integration points (all read this session); MEDIUM on batch sizes, rate-limit numbers and the Windows rename semantics (no real Wine launch or Windows rotation run was possible here, see Assumptions)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### Shell diagnostics and sequencing with Phase 83
- **D-01:** **Shell diagnostics go into `gamelib.log`.** Every `shell_diag(...)` call site (`src-tauri/src/main.rs:581` and the other shell modules that call it) logs through the native logger with a new `Shell` prefix, in the standard line format. `gamelib-shell.log` and `shell_diag_log_path` are deleted, as criterion 4 requires. The old `epoch pid=N msg` format is not kept.
- **D-02:** **Phase 84 runs only after 83-11 (the live macOS gate) passes.** That gate's capture recipe scores `gamelib-shell.log` lines by process ID (83-01 decision), so deleting that file mid-gate would invalidate it. Planning 84 now is fine, but execution waits. Once 83 is closed, 84 owns any change to scripts or docs that grep `gamelib-shell.log`. It does not edit 83's gate files while 83 is open.
- **D-03:** **The panic log stays a separate, direct file append.** `install_panic_hook` / `shell_panic_log_path` keep their rules: never panic, and swallow every fallible step. They do not route through the logger, because the logger thread may be what died. Writing an extra best-effort line to `gamelib.log` is allowed but not required.
- **D-04:** **No process ID or origin field gets added to lines.** The source shows only through the existing `[Prefix]` tag, so the criterion 1 golden comparison pins the current format unchanged.

### Who writes game and runner logs
- **D-05:** **Rust writes every log file in this phase**, including the runner and per-game files. TS spawners (launcher, legendary, gogdl, nile, sideload, Steam provisioning, and so on) send their lines to the native writer, which owns the files, rotation and mode. When Phases 88, 91 and 92 later port those spawners, only the sender changes. — **Reversibility:** costly. Undoing it would put file writes back at every TS spawn site and leave two writers again.
- **D-06:** **High-volume game output is sent in batches.** The TS side coalesces stdout/stderr chunks into one IPC send per batch (per tick or per N KB; research picks the numbers from a real Wine launch). File contents are byte-identical to writing each line.
- **D-07:** **Upload and delete-uploaded move to Rust (reqwest)**, using the same dpaste endpoint (`https://dpaste.com/api/v2/`) and expiry behaviour as `src/backend/logger/uploader.ts`. `uploader.ts` and its store slice are deleted.
- **D-08:** **Rust decides where logs live.** The per-OS base log directory (macOS `~/Library/Logs/GameLib`, Windows `%LOCALAPPDATA%\GameLib\logs`, Linux `$XDG_STATE_HOME/GameLib/logs`, which falls back to `~/.local/state/GameLib/logs`) and the relative-path rules (`gamelib`, `runners/<runner>`, `games/<app>_<runner>/<type>`) move into gamelib-core `Paths`. TS `paths.ts` is deleted, and the renderer and "show in folder" ask the native side.
- **D-09 (resolves Phase 82 risk R1, option a):** **Phase 84 builds the minimal `StoreHost` core in gamelib-core:** open, atomic write and a change event, for the single cache store `uploadedLogs` (`store/uploadedLogs.json`). Phase 85 widens the same owner rather than replacing it. So `uploadedLogs` changes owner once, at 84, and the 82 ownership table has no double moves. — **Reversibility:** costly. Phase 85 builds on this StoreHost's API shape, so a later redesign has to touch both phases.

### Forwarder loss and ordering
- **D-10:** **Bounded buffer, then drop and count.** The TS forwarder never blocks its caller. Lines sent before the native writer is ready, or while it is busy, wait in a capped queue. On overflow the oldest lines are dropped, and a later line records `N lines dropped`. Lines logged early at boot are kept. The SidecarSendQueue freeze history is why blocking is ruled out.
- **D-11:** **Order is kept per source only.** Each source's lines (TS sidecar, renderer, Rust) arrive in order. Lines from different sources interleave in the order they reach the writer. This matches 83 D-02, which guarantees no ordering across the native/sidecar boundary.
- **D-12:** **A TS line's timestamp is taken where it originates**, so batching delay doesn't skew it.
- **D-13:** **The logger flushes last, inside the 83 D-12 exit deadline of about 5 s.** The logger registers with `Shutdown` as the final stage, so the `still running at exit deadline` line itself gets written. Anything still unflushed at the deadline is lost. The logger gets no extra budget of its own. It follows the 83 D-14 convention: register with `Shutdown`, and keep boot work bounded.

### Noise policy
- **D-14:** **Rate limiting suppresses identical lines and writes a summary.** It counts lines with the same prefix, level and message (after redaction) within a time window. The first N are written and the rest are counted. When the window closes, one `repeated K more times` line is written. Research/planning picks the window and N (the starting point is about 60 s). The behaviour must be testable with a golden comparison.
- **D-15:** **Rate limiting applies to `gamelib.log` only.** Game and runner logs are raw process transcripts that users upload, so they stay byte-faithful. Rotation keeps them bounded.
- **D-16:** **Crate diagnostics enter at WARN and above by default.** The existing verbose/debug log setting raises them to DEBUG.
- **D-17:** **A `tracing` Layer maps targets onto the existing `LogPrefix` values.** It uses the `tracing` facade, which gamelib-steamcm already depends on, with a fixed map from target to prefix: steam-vent and gamelib-steamcm map to `Steam`, the shell maps to the new `Shell`, and unknown targets map to `Backend`. Per STACK.md, the writer is GameLib's own port of `log_writer.ts`, not `tracing-appender`, `log4rs` or `tauri-plugin-log`.

### Claude's Discretion
- Whether the writer is its own `gamelib-log` crate or a module of gamelib-core (STACK.md allows either).
- Batch size and tick interval for D-06, and the buffer cap for D-10, with research measuring a real Wine launch.
- Where redaction runs. The current `sanitizeRendererLogMessage` / log-secret gate rules must hold for renderer messages. The planner picks TS-before-send or Rust-at-write, as long as the golden test proves the redaction output.
- Channel shapes for the forwarder (send-kind through the 83 native seam), the uploader, delete-uploaded, show-in-folder and log-path queries.

### Deferred Ideas (OUT OF SCOPE)
None. The discussion stayed within the phase's scope.

Reviewed todos (not folded): packaged app blank render (fixed), x86 shim flat API parity, opt-in DLC enable path, fileStore test-mock migration, Phase 82 deferred review findings, protonfixes import tool, winebus IOHID PowerA wedge, GOG Windows elevation live check, Steam move install, Windows unsigned releases.

Not in scope (Phase Boundary): porting the code that spawns games or runners (Phases 88, 91, 92; their spawners keep running in TS and send output to the native writer). Every store except `uploadedLogs` (Phase 85).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FND-05 | Logs keep their format, location, rotation and redaction; log upload and "show in folder" still work | Behaviour Inventory (golden surface); Native Channel Plan (7 channels + 2 pushes); Writer/rotation design; Uploader + StoreHost design; tracing/log bridge; rate limiter; Shutdown flush; Validation Architecture |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- GameLib is an independent project, not a Heroic fork tracking upstream: do not raise upstream mergeability as a concern. [VERIFIED: CLAUDE.md Constraints]
- Rust/Tauri shell + React/TS; Steam stack is Rust (`gamelib-steamcm` on steam-vent). `steam-session`/`steam-user` are retired. [VERIFIED: CLAUDE.md Technology Stack]
- Five conventions (load `Skill("gamelib-conventions")` before acting): (1) todo triage frontmatter `severity:`/`platform:`/`ready:`; (2) spawn child processes from `src/`/`meta/` only via `createFakeHomeProfile()`, never a hand-rolled env; (3) in the sidecar, `unref()` every timer/watcher/socket/child **and** leave no unbounded in-flight work at boot (exit is by event-loop drain at stdin EOF); (4) UAT items: `### N.` heading at column 0, `expected:` inline, `result:` opens with a status word; (5) every task `<verify>` runs `npx prettier --check` over the exact paths written (check `--file-info` first; omit and say so when every path is prettier-ignored, as `.planning` is). [VERIFIED: CLAUDE.md Conventions table]
- GSD workflow: edits go through a GSD command; do not run `generate-claude-md`; CLAUDE.md regions are hand-edited. [VERIFIED: CLAUDE.md]
- graphify: `graphify query` before broad grepping; never read `graphify-out/GRAPH_REPORT.md` or `graph.json` whole; run `graphify update .` after modifying code. (Graphify is disabled in the GSD config, `gsd-tools graphify status` returned `disabled: true`; the repo-level `graphify` CLI is what CLAUDE.md means.) [VERIFIED: CLAUDE.md graphify section; gsd-tools output]
- Rust tests must pass on Windows: join path segments one at a time, drop file handles before rename/delete, share-delete-friendly opens. [VERIFIED: 84-CONTEXT.md code_context]
- Memory: Windows-local jest is ~108/1011 suites red and CI is ubuntu-only for jest, so use targeted `--runTestsByPath` and treat the cargo three-OS legs as the cross-platform proof. [CITED: MEMORY.md windows-local-jest-failures]

## Summary

Four findings change how Phase 84 must be planned, and one of them contradicts the roadmap text.

**1. The TS logger has never written files at 0600.** `LogWriter#writeString` ends in `await fsPromises.appendFile(this.logFilePath, message, 'utf-8')` with no `mode`, and `mkdir(..., { recursive: true })` with no mode (`log_writer.ts:119-121, 213`). No `0o600` exists anywhere under `src/backend/logger` (grep, empty; `git log -S"0o600" -- src/backend/logger` empty). The roadmap criterion ("keep ... 0600 mode"), STACK.md and SUMMARY.md all describe a mode that does not exist today; the actual mode is `0o666 & ~umask` (typically 0644). The golden "before" will therefore record an umask-dependent mode. Recommendation: the Rust writer creates files 0600 (a deliberate tightening, log lines carry env and command lines), the golden pins everything except mode, and a separate unix-only test pins 0600 for Rust. This needs user acknowledgement (Open Question 1) because the phase text says "stay as they are today".

**2. "Redaction" in criterion 1 means `sanitizeRendererLogMessage` only (line-break escaping and length caps), not secret scrubbing.** There is no runtime secret redaction in the logger (`loggerFlowRegistration.ts` D-09 says so explicitly); `meta/logSecretGate.ts` is a build-time ts-morph gate over `src/backend` call-site *names* (`LOG_FUNCTION_RE = /^log(Error|Info|Warning|Debug)(Settled)?$/`). The renderer's `logError`/`logInfo` go straight to the native router in this phase (no sidecar hop), so the sanitiser **must** be ported to Rust; and the TS facade must keep the `logInfo`/`logError`/`logWarning`/`logDebug` names or the gate silently goes blind.

**3. The native router seam from Phase 83 is too narrow for this slice.** `InvokeHandler` is `fn(&[Value]) -> Result<Value, String>` (no state, no emitter, sync) and `NativeSendJob` carries only a `url: String`; the manifest arg vocabulary is `string` + `maxLength` + `format: url`. Logger channels need unions (`string | string[] | {name,message,stack}`; three `getLogFileArgs` shapes), shared state, `FrontendEmitter` pushes (`logFileUploaded`, `logFileUploadDeleted`) and an HTTP call. Phase 84 must generalise the router (a context argument and an async-capable invoke handler) and the manifest/generator vocabulary. The **sidecar's** log traffic is a different path entirely: the sidecar writes frames on stdout and the shell reader thread (`sidecar.rs start_reader`) routes them, so a new `kind: "log"` frame is needed there, not a renderer channel.

**4. The default `verboseLogs` is `true`, so "WARN by default, DEBUG via the verbose setting" (D-16) cannot be wired to that setting as it exists.** `AppSettings extends GameSettings`, `verboseLogs: true` is a global default (`config.ts:345`), and the log writer never filters by level. Recommended: a native verbosity switch (env `GAMELIB_LOG_LEVEL`, plus a `setLogVerbosity` native send the sidecar can call later) with default WARN, and record that wiring the existing per-game/global `verboseLogs` toggle to it needs a user decision (Open Question 2).

**Primary recommendation:** Build a Tauri-free `gamelib-log` crate (formatter, one writer thread, rotate-on-first-write per target, 0600, per-chunk newline rule, rate limiter, `tracing` + `log` bridges, bounded ingest channel) on top of core `Paths`; prove it first with a **tracer** that runs one TS `logInfo` end to end (TS facade -> `kind:"log"` frame -> shell reader -> writer -> `gamelib.log`) against a **golden file generated from the real TS oracle before anything is deleted**; then convert runner/game writers, the 7 renderer channels, the uploader + minimal StoreHost, then delete `shell_diag` and the TS logger with a `loggerPortComplete` gate.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Log file writing, rotation, mode, line format | Rust shell process (`gamelib-log` writer thread) | none | D-05: only Rust writes files. One writer removes the two-writer race the TS debug sessions fought. |
| Log base dir + relative path rules | Rust (`gamelib-core::paths`) | none | D-08. TS `paths.ts` deleted; renderer asks native. |
| Value-to-string conversion of JS values (Error stack, objects, arrays, Promises) | Sidecar TS (forwarder) | none | Only TS holds the JS value; Rust gets a string. Keeps one conversion rule (`convertUnknownToString`). |
| Timestamp | Origin (TS at call time; Rust at call time) | Rust formats `HH:MM:SS` from `epoch_ms + tz_offset` | D-12. |
| Renderer message sanitising | Rust (native router handler) | none | Renderer logs no longer pass through the sidecar. Golden test pins output. |
| Per-source buffering, backpressure, drop count | Sidecar TS forwarder (bounded queue) | Rust ingest channel (`try_send`, drop count) | D-10; neither side may block (SidecarSendQueue freeze, 2026-10-05). |
| Crate diagnostics (steam-vent, reqwest, gamelib-*) | Rust (`tracing` subscriber + `log::Log` impl) | none | They emit via `tracing` / `log`; both must feed the writer. |
| Shell diagnostics (`shell_diag`) | Rust (`Shell` prefix through the writer) | panic hook stays a direct append (D-03) | D-01. |
| Rate limiting | Rust writer thread, `gamelib.log` only | none | D-14/D-15. |
| Upload / delete-uploaded / list | Rust (reqwest, shell glue) + `StoreHost` (`uploadedLogs.json`) | Renderer (UI, unchanged) | D-07, D-09. |
| Show in folder | Rust (`NativeHost` reveal via opener plugin) | none | `shell_show_item_in_folder` already exists in `shell_open.rs`. |
| Final flush at exit | Rust (`handle_exit` last step) | Sidecar (flush on stdin EOF) | D-13. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `gamelib-log` (new in-repo crate) | 0.1.0, `rust-version = "1.77.2"` | Formatter, writer thread, rotation, limiter, ingest, tracing/log bridges | STACK.md "own `gamelib-log` module/crate"; keeps `gamelib-core` free of heavy deps. Recommended over a core module. [CITED: .planning/research/v0.11/STACK.md:77-82] |
| `gamelib-core` (existing) | in-tree | `Paths` (log dir), `Shutdown`/`ExitBudget`, `Clock`, `FrontendEmitter`, new minimal `StoreHost` | D-08, D-09, D-13. [VERIFIED: src-tauri/crates/gamelib-core/src/lib.rs] |
| `tracing` | 0.1.44 (in `Cargo.lock`) | Event facade steam-vent and gamelib crates already emit on | [VERIFIED: Cargo.lock `name = "tracing"` `version = "0.1.44"`] |
| `tracing-subscriber` | 0.3.23, `default-features = false, features = ["registry"]` | `Layer` plumbing only (D-17) | `cargo info tracing-subscriber@0.3.23`: `registry = [sharded-slab, thread_local, std]`, MSRV 1.65. Not in `Cargo.lock` today, so +3 lock names (`tracing-subscriber`, `sharded-slab`, `thread_local`). [VERIFIED: cargo info; gsd-tools legitimacy OK] |
| `log` | 0.4.33 (in `Cargo.lock`) | A tiny `log::Log` impl: `reqwest` depends on `log` | [VERIFIED: Cargo.lock reqwest dependency list contains `"log"`] |
| `chrono` | 0.4.45 (in `Cargo.lock`), `default-features = false, features = ["clock","std"]` | Local `HH:MM:SS` for Rust-originated lines only | Already locked (via `serde_with`; `iana-time-zone` present), no new lock name. [VERIFIED: Cargo.lock chrono block] [ASSUMED: `clock` feature is what pulls `iana-time-zone`, confirm with `cargo tree -e features -i chrono`] |
| `reqwest` | 0.13.4, `default-features = false, features = ["rustls-no-provider"]` | dpaste POSTs (shell glue module) | Same TLS stance as steamcm/depot: provider installed once via `rustls::crypto::ring::default_provider().install_default()`. [VERIFIED: crates/gamelib-steamcm/Cargo.toml; lib.rs:68] |
| `url` | 2 (already a direct shell dep, 83-06) | Validate the dpaste response URL | [VERIFIED: src-tauri/Cargo.toml `url = "2"`] |
| `serde_json` | 1.0.x with `preserve_order` set **explicitly** in `gamelib-log` | Pretty-print object messages like `JSON.stringify(x, null, 2)` | Without `preserve_order` keys sort alphabetically (`message,name,stack`), breaking parity for `{name,message,stack}`. Do not rely on feature unification. [ASSUMED: serde_json default map is a BTreeMap; confirm in the golden test] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `gamelib-testutil` (`FakeHome`) | in-tree | Per-test base dir, 0700 root | Every `gamelib-log` and StoreHost test. The crate reads no env: base dir is a parameter. [VERIFIED: README 2b; testutil lib.rs] |
| `tempfile` | 3.27.0 (in lock) | dev-dependency only | Atomic-write tests |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `tracing-subscriber` `Registry`+`Layer` | Extend the hand-written `tracing::Subscriber` already in `gamelib-steamcm/src/vent.rs` (`VentLogForwarder`) | Zero new crates, but it must implement spans itself (steam-vent uses `#[instrument]`; `new_span` there returns a constant `Id::from_u64(1)`), which is only safe because INFO spans are filtered out at WARN. At DEBUG (D-16) spans enable and a constant id is wrong. D-17 names a Layer; use tracing-subscriber. [VERIFIED: vent.rs:506-532; steam-vent src/connection/mod.rs:403 `#[instrument(...)]`] |
| `gamelib-log` crate | Module in `gamelib-core` | Core gains `tracing`, `chrono`, `log`; core's rule is "traits and composition-root types only". Only choose this if the planner wants zero new crate names; cost is a heavier core every crate depends on. |
| Uploader in `gamelib-log` | Uploader glue in `src-tauri/src/log_upload.rs` + pure parts (form body, URL validation, expiry prune) in `gamelib-log` | Recommended split: keeps `gamelib-log` std-only at MSRV 1.77.2 (reqwest 0.13 + rustls are why steamcm/depot carry the 1.89 exception). |
| `tracing-appender`, `log4rs`, `tauri-plugin-log` | none | Rejected by D-17/STACK: no per-prefix split, no rotate-on-first-write gate, no file modes. |

**Installation (shell and crate manifests, not npm):**
```toml
# src-tauri/crates/gamelib-log/Cargo.toml (new)
[dependencies]
gamelib-core = { path = "../gamelib-core" }
tracing = "0.1"
tracing-subscriber = { version = "0.3", default-features = false, features = ["registry"] }
log = "0.4"
chrono = { version = "0.4", default-features = false, features = ["clock", "std"] }
serde = { version = "1", features = ["derive"] }
serde_json = { version = "1", features = ["preserve_order"] }
[dev-dependencies]
gamelib-testutil = { path = "../gamelib-testutil" }
```
Update `EXPECTED_LOCKFILE_CRATE_NAMES` in `src/backend/__tests__/cargoFeatures.test.ts` (new names: `gamelib-log`, `tracing-subscriber`, `sharded-slab`, `thread_local`), add `-p gamelib-log` to the multi-crate step in `.github/workflows/rust-test.yml` and update `meta/__tests__/rustTestWorkflow.test.ts` in the same commit. [CITED: src-tauri/crates/README.md §1, §3.9; 83-02-SUMMARY.md]

**Version verification:** `cargo info tracing-subscriber@0.3.23` ran this session (version, features, MSRV above). `chrono`, `log`, `reqwest`, `tracing` versions are the ones already in `src-tauri/Cargo.lock` (read this session).

## Package Legitimacy Audit

`gsd-tools query package-legitimacy check --ecosystem crates tracing-subscriber sharded-slab thread_local tracing-log chrono reqwest log` returned `OK` for every package shown (tracing-subscriber 15.9M weekly, repo `tokio-rs/tracing`; sharded-slab 14.7M; thread_local 16.8M; tracing-log 13.7M; chrono OK). These crates are all long-established and appear in the official `tracing`/`reqwest` documentation and ecosystem, so they are tagged `[VERIFIED: gsd-tools package-legitimacy]`. Cargo has no install-time postinstall scripts (`postinstall: null`).

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| tracing-subscriber | crates.io | 7 yrs (2019) | ~15.9M/wk | github.com/tokio-rs/tracing | OK | Approved (new to lock) |
| sharded-slab | crates.io | 7 yrs | ~14.7M/wk | github.com/hawkw/sharded-slab | OK | Approved (transitive, new to lock) |
| thread_local | crates.io | 10 yrs | ~16.8M/wk | github.com/Amanieu/thread_local-rs | OK | Approved (transitive, new to lock) |
| tracing-log | crates.io | 7 yrs | ~13.7M/wk | github.com/tokio-rs/tracing | OK | Not needed (a direct `log::Log` impl replaces it); listed only because it is tracing-subscriber's default feature |
| chrono | crates.io | long | OK | rust-lang-nursery/chrono | OK | Approved (already in lock) |
| log | crates.io | long | OK | rust-lang/log | OK | Approved (already in lock) |
| reqwest | crates.io | long | OK | seanmonstar/reqwest | OK | Approved (already in lock) |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Behaviour Inventory (the golden-comparison surface)

Everything below was read from source this session; line ranges are cited. The golden fixture must cover each row.

### Line format (`formatter.ts`, `constants.ts`)

[VERIFIED: src/backend/logger/formatter.ts:5-30] A line is `joinedPrefixes + ' ' + messageStr`, where prefixes joined by `' '` are:
1. `(HH:MM:SS)` from `now.getHours()/getMinutes()/getSeconds()`, **local time**, each `padStart(2,'0')`.
2. `` `[${logLevel}]:`.padEnd(MaxLogLevelLength + 3, ' ') `` with `MaxLogLevelLength = Math.max(...LogLevel.map(l => l.length))` = 7 (`WARNING`), so width 10.
3. only if `logPrefix` is truthy: `` `[${logPrefix}]:`.padEnd(MaxLogPrefixLength + 3, ' ') ``; `MaxLogPrefixLength` is the longest value of `LogPrefix`, which is 15 (`ProtocolHandler`, `DownloadManager`), so width 18.
4. If the converted message is empty, the function returns `''` ("skip logging completely"), and `writeString` additionally skips any `!message.trim().length`.

Measured with node against these constants (this session): `"(13:05:09) [INFO]:    [Backend]:         System facts: x"`, `"(13:05:09) [WARNING]: [Steam]:           w"`, `"(13:05:09) [ERROR]:   e"` (General prefix `''`: no prefix chunk), `"(13:05:09) [DEBUG]:   [Shell]:           d"`. **Pitfall:** adding any prefix longer than 15 characters changes the padding of every line; `Shell` (5) is safe.

Verbatim `LogPrefix` (constants.ts:3-24) and `LogLevel` (constants.ts:39):
```ts
const LogPrefix = {
  General: '', Legendary: 'Legendary', Gog: 'Gog', Nile: 'Nile', Steam: 'Steam',
  WineDownloader: 'WineDownloader', ToolInstaller: 'ToolInstaller', GlobalConfig: 'GlobalConfig',
  GameConfig: 'GameConfig', ProtocolHandler: 'ProtocolHandler', Frontend: 'Frontend',
  Backend: 'Backend', Runtime: 'Runtime', Shortcuts: 'Shortcuts', WineTricks: 'Winetricks',
  Connection: 'Connection', DownloadManager: 'DownloadManager', ExtraGameInfo: 'ExtraGameInfo',
  Sideload: 'Sideload', LogUploader: 'LogUploader'
}
const LogLevel = ['DEBUG', 'INFO', 'WARNING', 'ERROR'] as const
```
(`WineTricks` key maps to value `'Winetricks'`. Rust needs the same closed set plus `Shell`; drift guard: a parity test that parses `constants.ts` and the Rust enum, in the style of `scanChannelParity.test.ts`.)

Message conversion (formatter.ts:32-49, stays in TS): arrays -> each element converted and joined with `' '`; string/number/boolean -> `toString()`; Promise -> awaited; `Error` -> `stack ?? message`; everything else -> `JSON.stringify(message, null, 2)`. **Existing defect to guard, not to port:** `JSON.stringify(undefined)` returns `undefined`, so `messageStr.length` throws inside the async formatter; the forwarder must wrap conversion in try/catch and fall back to `String(value)`.

### Writer, rotation, retention (`log_writer.ts`)

| Behaviour | Source (verified) | Rust port rule |
|-----------|-------------------|----------------|
| Append form | `await fsPromises.appendFile(this.logFilePath, message, 'utf-8')` (log_writer.ts:213), no mode | Append; create with **0600** on unix (see Open Question 1). |
| Newline rule | `const appendNewline = !message.endsWith('\n')` then `message += '\n'` (log_writer.ts:210-211); whitespace-only skipped (`if (!message.trim().length) return`, :205) | Applied **per chunk**, not per batch (see Pitfall 1). |
| Rotate | `renameSync(this.logFilePath, this.oldLogFilePath)` only `if (existsSync(this.logFilePath))`; `oldLogFilePath` is `this.logFilePath + '.old'` (:131-147); an existing `.old` is overwritten | One `.old`, replaced. No size-based rotation, no numbered archives, no compression. |
| When | One-time gate per `LogWriter` **instance**, claimed synchronously before the first `await` (:166-184), checked after the disabled check, so a disabled writer never rotates | Rotate on the first accepted write of each forwarder instance: the instance's first send carries `rotate: true`. Rust drops no handle (it holds none between batches), renames, then appends. |
| Failed write | A failed write does **not** reopen the gate (:35-46) | Same: never re-rotate after a failed append. |
| Directory | `mkdir(path.dirname(logFilePath), { recursive: true })`, memoised, reset on failure (:117-129), no mode | `create_dir_all`; retry on a later write; do not set a dir mode (the dir is shared with the panic log on macOS). |
| First write of a non-general log | `if (!this.#isGeneralLog) logDebug(`Logging to file(s) ${this.logFilePath}`, LogPrefix.Backend)` (:187-188) | Emit that DEBUG `[Backend]` line **into `gamelib.log`** on each rotation of a runner/game target. Golden must contain it. |
| `skipInitialArchive` | Constructor param, 4th arg; only `log_writer.ts` and its own test use it (`grep -rn skipInitialArchive src` : `log_writer.ts`, `logWriter.test.ts`) and `DecompressPool` no longer exists (`depotPortComplete.test.ts` lists it only inside a deleted-symbol census) | **Drop it.** The decompress-worker exception has no caller; do not port it. |
| Console echo | `outputToOsStreams` is `false` at every production construction (`initHeadless`, `getRunnerLogWriter`, `createGameLogWriter`, `redist.ts`) | Drop it. |
| `disabled && !forceLog` | `if (this.#logsDisabled && !forceLog) return` (:162-164) | Decide in TS before sending; `forceLog` sends. |
| `close()` | Writes `============= End of log =============` then refuses further writes (:268-271); no production caller found in the sweep above | Not ported. Confirm with `graphify query`/grep at plan time. |

Retention: only the previous generation survives (`gamelib.log` + `gamelib.log.old`). `meta/bridgeCensus.ts` reads `gamelib.log` and `gamelib.log.*` siblings (`if (name !== 'gamelib.log' && !name.startsWith('gamelib.log.')) continue`), so this naming is load-bearing for a live tool. [VERIFIED: meta/bridgeCensus.ts:1645-1659]

**Behaviour changes that are deliberate and must be named in the plan** (each has a golden or test):
1. Rotation of `gamelib.log` happens once per **app** launch (the shell's first write), not once per sidecar process. Today a respawned sidecar re-rotates and overwrites `.old` with a log that already is the new session. [VERIFIED by reading `initHeadless`/`LogWriter` semantics; sidecar respawn exists per `verify-dead-sidecar-restart` todo]
2. A **secondary** (second-launch) shell process must never rotate or init the writer: its `std::process::exit(0)` sites (`main.rs:1796`) run before the guard decides primary. Initialise the logger only after the single-instance decision (same rule 83-08 uses for the reaper). Pre-init lines go to stderr only.
3. Empty `XDG_STATE_HOME`/`LOCALAPPDATA`: TS uses `??` (an empty string is "set", yielding a relative path); core `paths::resolve` treats empty as unset. Use the core rule (strictly safer). [VERIFIED: paths.ts:14-23 vs core paths.rs `non_empty`]
4. File mode 0600 (above).
5. A failed rotation rename (Windows: `.old` open elsewhere without share-delete) keeps appending instead of losing the line (TS lets the `renameSync` throw reject the write).

### Paths (`paths.ts`, verbatim)
[VERIFIED: src/backend/logger/paths.ts:12-58]
```ts
if (isWindows) { const localAppData = process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'); return join(localAppData, 'GameLib', 'logs') }
if (isMac) { return join(homedir(), 'Library', 'Logs', 'GameLib') }
const stateHome = process.env.XDG_STATE_HOME ?? join(homedir(), '.local', 'state'); return join(stateHome, 'GameLib', 'logs')
// relative: !(appName||runner) -> 'gamelib'; runner && !appName -> join('runners', runner); else join('games', `${appName}_${runner}`, type = 'launch'); file = relative + '.log'
```
`GameLogType` = `'launch' | 'install' | 'import' | 'repair' | 'update' | 'setup'`; runners are the five keys of `RunnerToLogPrefixMap` (`legendary`, `gog`, `nile`, `sideload`, `steam`) plus `'comet'` for runner logs. **Security gap in today's code:** `appName` is joined unvalidated and the renderer-side zod is only `nonEmptyString()` (`ipc/logger.ts`), so `appName: '../../x'` resolves outside the log tree and `uploadLogFile`/`getLogContent` read it (`.log` suffix only). The Rust resolver must reject segments containing a path separator, `..`, NUL, or empty. Home resolution: copy the shell's existing `HOME` then `USERPROFILE` rule (`steampoll/profile.rs:49-52`); add `Paths::log_dir(platform, home, env_lookup)` and `Paths::log_file(target)` to `gamelib-core::paths` with the same injected-env shape as `resolve`.

### Renderer sanitiser (`sanitizeRendererLogMessage.ts`)
[VERIFIED: sanitizeRendererLogMessage.ts:59-111] `LINE_BREAK_RE = /[\n\r]/g` -> `\n`->`\\n`, `\r`->`\\r` (U+2028/2029 deliberately **not** escaped); `LOG_TEXT_MAX = 65536` UTF-16 code units, overflow becomes `` `${value.slice(0, LOG_TEXT_MAX)}…[truncated ${value.length - LOG_TEXT_MAX} bytes]` `` (the word is "bytes" but the number counts UTF-16 units; keep verbatim); `LOG_ARRAY_MAX = 256` entries, overflow appends `` `…[truncated ${message.length - LOG_ARRAY_MAX} entries]` ``. Strings and strings in arrays are sanitised recursively; everything else is returned as is (objects pass to `JSON.stringify`, which escapes line breaks itself). Port to Rust over `serde_json::Value`, count UTF-16 units with `encode_utf16().count()` and slice on a UTF-16 boundary (a surrogate pair split at the cut is the edge case; mirror `String.prototype.slice` which can split a pair, producing a lone surrogate in JS; in Rust the cut must land on a char boundary, so record this as an accepted divergence with a `divergenceNote` per README §6 and test it).

### Gates and docs that grep log text verbatim (golden must include these)
- `Logging to file(s) <path>` (DEBUG, `[Backend]`, only for non-general writers). [VERIFIED: log_writer.ts:187-188]
- `System facts: ...` boot line (`logBootFacts`, INFO `[Backend]`, array message joined by `' '`). [VERIFIED: logger/index.ts:139-150]
- Shell/native lines the 83 live gate expects, all currently routed through `shell_diag`: `reaper started (pid `, `reaper unavailable:`, `exit finished in <ms> ms`, `still running at exit deadline: <names> (<count>)`, `native send rejected: <channel>`. After D-01 they appear in `gamelib.log` as `[Shell]` lines; the **83 gate is scored by pid in `gamelib-shell.log` and must be closed first** (D-02). The bodies stay byte-identical; only the line wrapper changes. [CITED: 83-HUMAN-UAT.md literal table; 83-09-PLAN.md:30]
- `scanner <name> op=<op> caller=<caller>: impl=rust` (63-UAT proof lines, TS `logInfo` through the sidecar; archived milestone docs). They ride the TS facade; the golden should include one such line as a TS-origin sample. [CITED: 63-11-PLAN.md:72,168]
- `HELLO  shim attached appid=<id>` lines read by `meta/bridgeCensus.ts` from `gamelib.log*` (game output, ends up in game logs and/or gamelib.log). [CITED: bridgeCensus.ts:1335-1337]
- `[bootstrap] GAMELIB_SHELL_EXE received=` and the asset-root check lines are asserted by `bootstrap.test.ts`; they are console/stderr-side, unaffected.

## Every writer of game/runner/other log files today

[VERIFIED: grep for `getRunnerLogWriter|createGameLogWriter|\.writeString\(|LogWriter` over `src`, test files excluded]

| Site | What it writes | Target |
|------|----------------|--------|
| `launcher.ts:283` `createGameLogWriter(appName, runner, 'launch', ...)`; `:1656`, `:1678` `writeString`; `:693,919,1650,1672` LogWriter params | launch log; "IMPORTANT: Logs are disabled" lines with `{ forceLog: true }` (launcher.ts:288-295) | `games/<app>_<runner>/launch.log` |
| `commandRunner.ts:345-351` (header `Wine Command: ...`, per-chunk `writeString(data)`), `:423-425` (pushes `deps.getRunnerLogWriter(runnerProps.name)`), `:504-509` (`logSanitizer`), `:700-717` (`runScriptForGame` `writeString` per chunk when `verboseLogs`) | raw stdout/stderr chunks, **not line-split** | game + runner logs |
| `storeManagers/legendary/games.ts` (`create…` at 519, 624, 845, 886), `gog/games.ts` (445, 880 comet runner log with `redactSecrets`, 1034, 1430), `nile/games.ts` (137, 281, 564, 630) | install/update/repair/import logs | `games/…/<type>.log` |
| `gog/library.ts:665-668`, `gog/setup.ts:140`, `nile/setup.ts:134`, `steam/provisionBottle.ts:444` | runner logs (`getRunnerLogWriter('gog'|'nile'|'steam')`), `logInfo(logContent)` | `runners/<runner>.log` |
| `gog/redist.ts:203,219` `new LogWriter(logPath, false, false)` with `logPath = path.join(deps.paths.gamesConfigPath, 'gog-redist.log')` | **a log file outside the log tree** (`<userData>/GamesConfig/gog-redist.log`; `gamesConfigPath: join(appFolder, 'GamesConfig')`, appPaths.ts:160) | needs its own typed target, see Open Question 3 |
| `utils.ts:1126-1175` | `logWriter.logWarning/logInfo([...,'\n'])` formatted lines into the launch log when `verboseLogs` | launch log |
| `sidecar/steamFlowRegistration.ts`, `settingsFlowRegistration.ts`, steam `gameLaunch.ts`/`launchDispatch.ts` | pass `undefined as unknown as LogWriter` or import the type; settings registers `getLogContent` | n/a |

`getRunnerLogWriter` caches the **first** writer per runner for the sidecar's life, so a later `disableLogs` change is ignored (`logger/index.ts:84-98`, pinned by `loggerWriters.test.ts` "caches the first writer per runner"). `createGameLogWriter` builds a **fresh** writer per call; `logsDisabledPerGame = type === 'launch' ? !settings.verboseLogs : false`. Every fresh writer's first write rotates that file (so each launch/install starts a new `<type>.log` and the previous becomes `<type>.log.old`).

**What the batched forwarder replaces:** the `LogWriter` class surface (`writeString`, `logDebug/Info/Warning/Error`, `logFilePath`) threaded as a *type* through ~25 files (`game_manager.ts`, `types.ts`, `launcher.ts`, `commandRunner.ts`, store managers). Recommended: keep the call-site API and replace the class: a `LogForwarder` with the same method names and a target descriptor (`{kind:'general'} | {kind:'runner', runner} | {kind:'game', appName, runner, type} | {kind:'gogRedist'}`), and rewrite the `import type LogWriter` lines mechanically. 255 production files import `backend/logger` and ~1,836 `logInfo/logError/logWarning/logDebug` call sites exist; 260 test files `jest.mock` the logger. [VERIFIED: grep counts this session] So the **module's export names and signatures must not change**: `logInfo/logWarning/logError/logDebug`, `logInfoSettled/logErrorSettled`, `LogPrefix`, `RunnerToLogPrefixMap`, `getRunnerLogWriter`, `createGameLogWriter`, `initHeadless`, `logBootFacts`. Only internals change. Remove `getLogFilePath` (consumers: `loggerFlowRegistration`, `settingsFlowRegistration`, `jest.setupContainment.ts`).

## Native Channel Plan

### The 7 renderer-facing channels (not "~11") and 2 pushes
[VERIFIED: src/common/types/ipc/logger.ts:50-65; settings.ts:82; loggerFlowRegistration.ts registers 6; settingsFlowRegistration.ts:257 registers `getLogContent`]

| Channel | Kind | Today | Native owner |
|---------|------|-------|--------------|
| `logError` | send | sanitise + `logErrorSettled(..., Frontend)` | router send, slice `logger` (FIFO), Rust sanitiser, prefix `Frontend`, ERROR |
| `logInfo` | send | same, INFO | same |
| `showLogFileInFolder` | send | `showItemInFolder(getLogFilePath(args))`, only `if (existsSync(item))` | router send; reveal via the existing opener path (`shell_open.rs shell_show_item_in_folder` -> `app.opener().reveal_item_in_dir` + macOS Finder reselect); add a `reveal_path` method to `NativeHost`, keep `reveal_path_policy_check` |
| `uploadLogFile(name, args)` | invoke | dpaste POST | router **async** invoke |
| `deleteUploadedLogFile(url)` | invoke | store lookup, POST `token`/`delete` form | router async invoke; **dead in the UI** (button commented out, `deleteButtonReachability.test.tsx`; dpaste has no delete, `token = '1'`) |
| `getUploadedLogFiles` | invoke | returns unexpired entries **and deletes expired ones from the store** (a read with a write side effect, preserved on purpose) | router invoke |
| `getLogContent(args)` | invoke | `existsSync ? readFileSync(utf-8) : ''` | router invoke (Rust reads the file it owns) |
| push `logFileUploaded(url, data)`, `logFileUploadDeleted(url)` | frontend message | `sendFrontendMessage` | `FrontendEmitter::emit` (`TauriFrontendEmitter` exists since 83-02) |

Success criterion 2 says "delete-uploaded ... work from the UI"; the UI path to delete does not exist (verified in the comment block of `loggerFlowRegistration.ts` and the reachability test). Plan it as **channel parity + round-trip test**, not a UI click, and say so in the live gate.

### What the router must grow (the 83-06 shape is single-purpose)
[VERIFIED: src-tauri/src/native_router.rs:42 `pub(crate) type InvokeHandler = fn(&[Value]) -> Result<Value, String>;`; :50-55 `trait NativeHost { fn open_url(&self, url: String); }`; :70-73 `NativeSendJob { channel, url }`; nativeChannels.json arg vocabulary `{name,type:"string",maxLength,maxLengthUnit,format}`]
1. `InvokeHandler` needs state: change to `fn(Arc<NativeCtx>, Vec<Value>) -> BoxFuture<'static, Result<Value,String>>` (the router is already called from an `async fn sidecar_invoke`, which currently does `spawn_blocking(move || handler(&args))`). `NativeCtx` carries the logger handle, `StoreHost`, `FrontendEmitter`, an HTTP client and the app version. Upload can take tens of seconds, so do not park a blocking-pool thread per upload.
2. `NativeSendJob` becomes an enum (or carries `Vec<Value>`) validated per channel; `route_send` keeps FIFO per slice and `Ok(())` on rejection with a channel-name-only log (D-03).
3. The manifest/generator vocabulary needs unions and objects: message = `string | string[] | {name?,message?,stack?}` (strict), `getLogFileArgs` = three strict-object shapes, `uploadLogFile` name `maxLength 1024`. Extend `parseNativeManifest` (`meta/genIpcContract.ts`), the Rust data-driven vector tests, the committed snapshot (`ipcSchemaSnapshot.json`, owner `native`), and the censuses 83-06 touched (`flowRegistrationCensus`, `ipcDomainCensus`, `ipcSchemaCoverage`, `nativeChannelOwnership`, `nativeSeamPortComplete`, `runnerSliceRegistration`). Use `NativeSync`/`NativeAsync` typing from `src/common/types/ipc/native.ts`. [CITED: 83-06-SUMMARY.md, 83-03-SUMMARY.md]
4. Rust serde structs are the schema authority (83 D-07): `#[serde(deny_unknown_fields, rename_all = "camelCase")]`, `appName` segments validated as above.

### The sidecar leg is not the router
The sidecar writes newline-delimited JSON frames to stdout (`sidecarRpc.ts writeLine`, `requestOpenExternal` is the model: `{ id: randomUUID(), kind: 'openExternal', channel, args }`) and the shell's `start_reader` thread routes by `kind`. Add `kind: "log"`:
```json
{ "kind": "log", "batch": [ { "t": {"k":"general"}, "rotate": true, "e": [ {"ts": 1763645109123, "tz": -300, "lvl": "INFO", "pfx": "Backend", "msg": "..."} ] },
                            { "t": {"k":"game","app":"480","runner":"steam","type":"launch"}, "rotate": false, "e": [ {"raw": "chunk\n"} ] } ] }
```
Rules: the reader thread **only parses, validates and `try_send`s** into the logger's bounded ingest channel (never writes files, never blocks: the reader is the only consumer of the sidecar's stdout, and a stall parks every invoke response; see the D-UAT-19 comment on the `openExternal` arm). Validate with a `#[serde(deny_unknown_fields)]` struct, a closed prefix/level/runner/type set, a frame-size cap (recommend 256 KiB) and the path-segment rule. Any process writing to the sidecar's stdout can forge a frame (todo `sidecar-log-output-shares-the-rpc-stdout-pipe`), so validation is the control, same trust level as the `openExternal` arm. Add the arm **before** the "unrecognized frame kind" diagnostic, add a `LOG_FRAME_KIND` constant to `sidecarTransport.ts`, and share valid/invalid frame vectors between jest and cargo like the native manifest does.

TS side (`src/backend/logger/`): `forwarder.ts` with
- one process-wide queue, **bounded by entries and bytes** (recommend 4,000 entries / 4 MiB, [ASSUMED]); on overflow drop the **oldest**, count, and enqueue `N lines dropped` as a normal line at the front of the next batch (D-10);
- unbound until the transport attaches (the `'logger'` bootstrap step runs **before** `'sidecar-rpc'`; `writeLine`'s own `pendingLines` is unbounded, so the forwarder keeps its own queue and does not rely on it); lines logged early at boot are kept up to the cap;
- batching: flush on a tick or a size threshold, whichever first (recommend 50 ms or 32 KiB, [ASSUMED]; see Assumption A2); the tick timer is `unref()`ed (CLAUDE.md convention 3);
- honours backpressure: `stream.write(line)` returning `false` pauses sending until `'drain'` (the queue absorbs, within its bound);
- `flush(): Promise<void>` resolving when the frames were handed to the stream. `logErrorSettled` must keep returning a promise that resolves after that flush, because the now-fatal `uncaughtException` guard awaits it before exiting (`bootstrap.ts`: `io.guards.setUncaughtExceptionLogSink((message) => logErrorSettled(message, LogPrefix.Backend))`, Phase 72 D-04). Hook a final flush into `releaseOnStdinEof()` (`sidecar/stdinEofRelease.ts`), the sanctioned place for exit-time drops;
- timestamps taken at call time: `ts = Date.now()` and `tz = -new Date(ts).getTimezoneOffset()` (minutes), so Rust prints the same `HH:MM:SS` as `getHours()/getMinutes()/getSeconds()` without a tz database.

## Architecture Patterns

### System Architecture Diagram
```
 Sources                                   Rust shell process (one writer)
 -------                                   ------------------------------------------------
 Sidecar TS  logInfo()/LogForwarder
   |  value -> string, ts+tz at origin
   |  bounded queue (drop oldest + count), tick 50ms / 32KiB, unref'd timer
   v  stdout frame {kind:"log", batch}
 [start_reader thread] -- parse + validate + try_send ---+
                                                         |   bounded ingest channel
 Renderer window.api.logError/logInfo                    |   (full => drop + count)
   -> sidecar_send -> NativeRouter (slice "logger" FIFO) |
   -> Rust sanitiser (escape CR/LF, 65536 / 256 caps) ---+
                                                         v
 Rust crates: steam-vent/hyper (tracing) -> Layer --+--> [ writer thread ]
              reqwest/others (log) -> log::Log -----+      |  recv_timeout tick
 shell: shell_log!/diag sinks (Shell prefix) -------+      |  per entry: resolve target path (core Paths)
                                                           |  rotate-on-first-write (rotate:true) -> .old
                                                           |  gamelib.log only: rate limiter (hash prefix+level+msg)
                                                           |  open(append, 0600) -> write batch -> close
                                                           v
        <logdir>/gamelib.log        runners/<runner>.log        games/<app>_<runner>/<type>.log
                                                           ^
 Renderer: uploadLogFile / deleteUploadedLogFile / getUploadedLogFiles / getLogContent / showLogFileInFolder
   -> NativeRouter (async invoke, NativeCtx) -> reqwest dpaste; StoreHost(uploadedLogs.json) ; FrontendEmitter pushes
 Exit: handle_exit -> run_exit(drains, children, finish[ log report lines, ..., logger.flush(remaining) ])
```

### Recommended Project Structure
```
src-tauri/crates/gamelib-log/
  src/lib.rs          # LogHandle (cheap clone), init(base_dir, cfg), submit(), flush(deadline)
  src/format.rs       # line format, padding, local time from (epoch_ms, tz_offset)
  src/prefix.rs       # closed Prefix/Level/Runner/GameLogType enums + target->path (uses core::paths)
  src/writer.rs       # writer thread, rotate gate, per-chunk newline rule, 0600, open-append-close per batch
  src/limiter.rs      # D-14 limiter, injectable Clock, LRU-capped
  src/sanitize.rs     # renderer sanitiser over serde_json::Value
  src/bridge.rs       # tracing Layer (+Registry) and log::Log impl, target->prefix map, reentrancy guard
  src/frame.rs        # serde structs for the sidecar log frame
  tests/golden.rs, tests/fixtures/golden/*
src-tauri/crates/gamelib-core/src/paths.rs   # + log_dir/log_file (D-08)
src-tauri/crates/gamelib-core/src/store.rs   # minimal StoreHost (D-09)
src-tauri/src/log_dispatch.rs                # native channel handlers + uploader glue (reqwest) + frame arm helper
src/backend/logger/{index.ts,constants.ts,types.ts,forwarder.ts,stringifyLogValue.ts}
```

### Pattern 1: Golden before/after (Tier 1, README section 6)
**What:** A generator drives the **real TS** `LogWriter`/`formatLogMessage`/`sanitizeRendererLogMessage` under `jest.useFakeTimers().setSystemTime(new Date(2026, 10, 20, 13, 5, 9))` over a committed `cases.json`, writing `expected.gamelib.log`, per-target expected files and the post-rotation `.old` content. Jest asserts TS == golden **now**; `cargo test -p gamelib-log --test golden` asserts Rust == golden. The oracle is deleted last; fixtures stay. [CITED: src-tauri/crates/README.md §6]
**Cases (minimum):** every level x {General, Backend, Steam, Frontend, Shell, ProtocolHandler(15 chars)}; array/Error/object/number/boolean/Promise messages; empty and whitespace-only; chunk without trailing newline; stack traces with embedded newlines; renderer strings with `\r\n`, 65,537-unit string, 257-entry array, object `{name,message,stack}` key order; rotate: pre-existing file -> `.old` content, second instance rotates again, disabled instance does not rotate, `forceLog` does; the `Logging to file(s)` line; a `[Shell]` line.
**Mode:** not in the golden. Separate unix-only Rust test asserts `0o600` (Open Question 1); TS "before" mode is recorded as umask-dependent in the generator notes.

### Pattern 2: Writer thread with injected base dir and clock
`init(LogConfig { base_dir: PathBuf, clock: Arc<dyn Clock>, tz: TzSource })`, no env reads inside the crate (README 2b rule), so tests use `FakeHome` (0700 root) and a fixed clock. Callers never see errors: every public submit is infallible and non-blocking (`shell_diag` contract, main.rs:579-580 "Best-effort and infallible by construction").

### Pattern 3: Open-append-close per batch (no cached handles)
The writer drains up to N entries per target, opens once (`OpenOptions::new().create(true).append(true)`, unix `.mode(0o600)`), writes, closes. This matches TS (`appendFile` opens and closes per call) and removes the whole class of Windows "held handle blocks rotate/delete" failures. Rust's std default share mode on Windows is `FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE`, so other processes can read, rename and delete the file while it is open. [CITED: doc.rust-lang.org/std/os/windows/fs/trait.OpenOptionsExt.html#tymethod.share_mode] Rotation then needs no handle bookkeeping. Cached handles (with an idle close) are a later optimisation, not a Phase 84 requirement.

### Pattern 4: Subscriber, not a second logger
Install once, in the primary shell process, `tracing::subscriber::set_global_default(Registry::default().with(LogLayer))` and `log::set_boxed_logger(...)`/`set_max_level`. **Delete** `gamelib-steamcm/src/vent.rs VentLogForwarder` and `install_vent_log_forwarder` (it claims the process-global subscriber and discards everything that is not `steam_vent*` at WARN or above; its doc says "do not install another global subscriber without replacing this one"). Remove the call in `facade.rs:551`. Target map (D-17), by prefix match on `target()`: `steam_vent*`, `gamelib_steamcm*`, `gamelib_depot*` (recommended addition, it is a Steam crate) -> `Steam`; `gamelib_shell*` and the shell's own macro -> `Shell`; `gamelib_proc*`, `gamelib_core*`, everything else (hyper, reqwest, rustls, h2, keyring) -> `Backend`. Level: WARN+ by default, DEBUG when verbosity is raised. Tracing events carry a `message` field plus key/values; render `message` then ` key=value` pairs. **Reentrancy:** the writer thread and the uploader must not emit events that loop back (thread-local guard, drop events raised on the writer thread).

### Pattern 5: Rate limiter (D-14/D-15)
Key = hash of `(prefix, level, body)` computed on the sanitised/converted body (not the timestamp), `gamelib.log` only. Recommended: window 60 s, first **5** per key per window written, the rest counted; when a window closes write one `(<time>) [LEVEL]: [Prefix]: <first 200 chars of body> (repeated K more times)` line (the literal `repeated K more times` must appear; fix the exact wrapper in the golden). Close windows lazily on the next entry **and** on the writer's `recv_timeout` tick (5 s) and at flush, so a quiet log still gets its summary. Cap tracked keys (256, evict oldest by flushing its summary) so unique messages cannot grow memory. Injectable `Clock` makes it deterministic, so the "golden" for the limiter is a scripted `(t, line)` input and an expected file. Origin: 80 A-IN-01 (a poll loop writing the same line every tick while hung). [ASSUMED: numbers; see A3]

### Pattern 6: Shutdown (D-13)
Do **not** hold a `Registrant` for the process lifetime: `Shutdown::drain` waits for every held registrant, so a permanent "logger" registrant would be reported as `still running at exit deadline: logger` on every exit. [VERIFIED: shutdown.rs `drain`/`Registrant`] Instead the logger is the **last step of the exit path**: an explicit `logger.flush(remaining)` that sends a barrier to the writer thread and waits for its ack up to the time left in the budget. Two integration facts for the planner, both from 83-09's plan: `handle_exit` logs `exit finished in <ms> ms` and `still running at exit deadline: ...` **after** `run_exit` returns the `ExitReport` (`ExitReport { elapsed, still_running }`), at which point `elapsed` is close to `total` on an overrun, leaving ~0 budget to flush the very line D-13 wants written. Resolve this in the plan by logging those lines and flushing inside `run_exit`'s `finish` stage (pass `still_running` into `finish`, a small core change covered by the existing `shutdown::tests`), or accept a documented floor. Also flush before the two fatal `std::process::exit(1)` sites (`main.rs` "FATAL: sidecar spawn failed", after which a dialog names the log path, currently via `shell_diag_log_path`, which must become the new `gamelib.log` path from core `Paths`). [VERIFIED: main.rs:816-833]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Event plumbing for steam-vent | A second hand-written `Subscriber` | `tracing_subscriber::Registry` + one `Layer` | Spans (`#[instrument]`) need real ids once DEBUG is on |
| Reading `log` crate records | A parser of stderr | `log::Log` impl via `log::set_boxed_logger` | reqwest uses `log`, not `tracing` |
| URL validation of the paste response | Regex | `url::Url::parse` + require `https` and host `dpaste.com` | TS `z.url()` accepts any scheme; a hostile response could otherwise plant a URL that `deleteUploadedLogFile` later POSTs to |
| Local time | Own tz rules | `chrono::Local` for Rust lines; TS sends `epoch_ms + tz_offset` | DST edges |
| JSON pretty-print of object messages | Manual indent | `serde_json::to_string_pretty` with `preserve_order` | Matches `JSON.stringify(x, null, 2)` layout and key order |
| Atomic store write | New primitive | std temp-file + `rename` in the same dir, mode 0600 (fall back to direct write like `fileStore.ts persist`) | Same guarantee as the TS FileStore the file came from |
| Reveal in folder | New OS code | Existing `shell_open::shell_show_item_in_folder` + `reveal_path_policy_check` | Already audited, includes the macOS Finder reselect workaround |
| Test fixtures dirs | `tempdir()` | `gamelib_testutil::FakeHome` | 0700 root; `tempfile`'s default dir mode is not 0700 |

**Key insight:** the format, rotate gate and chunk rules are product behaviour that tools and live gates grep; port the 272-line writer, do not re-express it in a logging framework.

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `<userData>/store/uploadedLogs.json`: flat JSON `{ "<dpaste url>": { name, token, uploadedAt } }`, written by the TS `FileStore` as `JSON.stringify(data, null, 2)` (2-space indent, not tab) to a `…tmp-<pid>` file then `renameSync`, mode `0o600`; keys are URLs so `accessPropertiesByDotNotation: false`. [VERIFIED: stores.ts:12-20; fileStore.ts:292-336; registeredStores.json] No `uploadedLogs` entry in storeVersioning/migrations (grep: only the files listed in the census below). | Code edit + census updates: delete `createLoggerStores`, the `logger` slice in `services/types.ts`/`createStores.ts`/`testUtils/testServices.ts`, the `uploadedLogs` rows in `common/types/storePolicy.ts` (LAZY_STORES), `common/types/typed_store.ts:160`, `registeredStores.json`, `storeKinds.test.ts`, `storeLayer.test.ts`, `fileStore.test.ts`, `tauriTransport.test.ts` (it uses `uploadedLogs` as its lazy-hydration probe store; pick another). Rust StoreHost must read the existing 2-space file unchanged and write the same shape. The 82 table says "TS mirror deleted 85" for this row; D-09 moves ownership to 84, so the mirror deletion moves with it (update `82-STATE-OWNERSHIP.md` only if the plan chooses to; do not edit while 83 is open). |
| Live service config | None. dpaste.com holds the uploaded pastes (2-day expiry), nothing in git. | None. |
| OS-registered state | None for the logger. (`gamelib-shell.log` is a plain file; no launchd/Task Scheduler entry references it.) | None. |
| Secrets/env vars | No secret key names. New optional env var `GAMELIB_LOG_LEVEL` (recommended). Windows `LOCALAPPDATA`, unix `XDG_STATE_HOME`, `HOME`/`USERPROFILE` are already read. | Document the new var; none to migrate. |
| Build artifacts / leftovers | Stale `gamelib-shell.log` files remain in users' log dirs (macOS/Linux; on Windows it was never written because `HOME` is unset there). `meta/captureShellScrollback.ts:12` comment, `macos_notifications.rs:14` doc comment, `macosEpicEmbedDiagPersistence.test.ts:6`, `shellDiagPersistence.test.ts:5`, `tauriShellSource.test.ts:3237`, `main.rs:1729` comment, frontend comment `Login/components/Runner/index.tsx:99`, test comment `logoutFailureSurface.test.tsx:5` all name the file. | Leave existing files (do not delete user files); rewrite the comments/tests. Historical `.planning/**` mentions are not edited. |

## Common Pitfalls

### Pitfall 1: Batching changes bytes unless chunk boundaries survive
**What goes wrong:** `commandRunner` calls `writeString(data)` per raw pipe chunk (not line-split) and `writeString` appends `\n` to any chunk that does not already end with one, and skips whitespace-only chunks. Joining chunks first then applying the rule once changes the file.
**How to avoid:** the batch entry is an **array of chunks**; Rust applies the newline/whitespace rule per chunk. D-06's "byte-identical to writing each line" is only true with this. The golden has a case "three chunks, middle one without a newline".
**Warning signs:** a transcript where a line is split in two at a chunk boundary today and not after.

### Pitfall 2: A permanent Shutdown registrant makes every exit look overrun
See Pattern 6. Test: a fake `Shutdown` with the logger initialised must yield an empty `still_running`.

### Pitfall 3: A secondary instance rotates the live log
Initialise the writer only in the primary after the single-instance decision; before that, `shell_diag`-equivalents go to stderr only. Test: two `init` calls on one dir from two "processes" never produce a second `.old`.

### Pitfall 4: Renaming `shell_diag(` silently blinds four source-text gates
`keyringDiagPersistence.test.ts` (exact count 14, double-prefix guard, **leak-shape guard** banning `secret`/`get_password` in call arguments), `macosEpicEmbedDiagPersistence.test.ts` (exact 30 `crate::shell_diag(`), `shellDiagPersistence.test.ts` (3 `shell_diag(&invoke_abandoned_message(`, Site A/B regexes), `tauriShellSource.test.ts` (dev-build skip must **not** use `shell_diag`, ~L3264). Call-site census: `depot_dispatch.rs` 1, `keyring_dispatch.rs` 19, `macos_epic_embed/nav_delegate.rs` 24, `macos_epic_embed/surface.rs` 6, `macos_notifications.rs` 2, `main.rs` 21 (incl. definition, doc and tests), `shell_state.rs` 3, `sidecar.rs` 13, `single_instance/windows_protocol.rs` 2, `steamcm_dispatch.rs` 1, `terminate_veto.rs` 17 (counts of the token, definition/comments included). [VERIFIED: grep -c this session; `main.rs` is being edited by the 83 session, so re-count at execution]
**How to avoid:** a codemod (`shell_diag(` -> the new call) committed with the four tests' regexes/counts rewritten **in the same commit**, plus a gate that the new call name still appears the same number of times (so the leak guard cannot go vacuous) and that `shell_diag` itself no longer appears (the PortComplete part). Levels: `shell_diag` has no level; default INFO, WARNING for sites whose text starts `WARN:` or says `failed`, ERROR for `FATAL:`.
**Also:** `shell_diag` writes `[shell] {message}` to **stderr** as well (`shell_eprintln!("[shell] {message}")`); keep the stderr echo in the new path (dev terminal and 83 gate transcripts read it). The file line today is `{epoch} pid={pid} {message}` with **no** `[shell]` prefix.

### Pitfall 5: Diag sinks are `fn(&str)` with no level
`gamelib_proc::diag::set_diag_sink(f: fn(&str))` and `gamelib_steamcm::error::set_diag_sink(f: fn(&str))` (main.rs:1730 being added by 83-08; steamcm_dispatch.rs:346) currently point at `shell_diag`. Point them at a shell fn that logs `Shell`/`Steam` at a fixed level; changing the sink signature to carry a level is optional and touches two crates.

### Pitfall 6: Windows
- Rotation rename over an existing `.old` that another process holds open without share-delete fails; keep appending and emit one WARNING (and never loop on it). Test on the CI Windows leg with a second open handle. [ASSUMED: `std::fs::rename` replaces an existing destination on Windows; verify in the Windows leg, A4]
- Delete-pending: deleting a file that still has an open handle leaves a pending-delete state on Windows; creating the same path fails until handles close. Per-batch open-close makes this window tiny.
- Join path segments one at a time; expected paths built with `.join("a").join("b")`.
- `shell_diag` never wrote a file on Windows (`HOME` unset), so Windows gains persisted shell lines at `%LOCALAPPDATA%\GameLib\logs\gamelib.log`: expected, note in the live checklist.

### Pitfall 7: Renderer logs bypass the sidecar, so the sanitiser must move with them
If the Rust handler formats the renderer value without the sanitiser, a renderer string with `\n` forges a standalone `gamelib.log` line (IN-04). Test: golden case with `"a\n(12:34:56) [ERROR]:   [Backend]: forged"`. The old `loggerFlows.test.ts` test "IN-04 a renderer cannot forge a standalone log line through logError" is the model.

### Pitfall 8: A `log` frame arriving before the transport is up, and on exit
Frames sent after the shell stops reading, or after the sidecar is killed in the children stage, are lost; acceptable per D-13, but the **sidecar's own** last lines (`uncaughtException`) rely on `logErrorSettled` resolving after the flush (above). `smoke:sidecar` and `smoke:exit-check` only look for the READY sentinel and an exit, so extra stdout frames do not break them, but `smoke:exit-check` must be re-run because the forwarder adds a timer and an EOF flush (convention 3: no unbounded in-flight work).

### Pitfall 9: Rate-limited `gamelib.log` must not swallow errors the gates look for
The limiter keys on the exact body; messages that embed a counter/pid/path never collapse. The first N per window are always written, and every summary line is itself a normal line, so a gate grepping a line sees at least the first occurrence per minute.

### Pitfall 10: Verbose default
See Summary item 4 and Open Question 2: do not wire D-16 to the existing global `verboseLogs` (default `true`) without a decision.

## Code Examples

### Rust line formatter (port of `formatLogMessage`)
```rust
// Source: port of src/backend/logger/formatter.ts:5-30 (verified this session)
const MAX_LEVEL: usize = 7;   // "WARNING"
const MAX_PREFIX: usize = 15; // "ProtocolHandler" / "DownloadManager"
pub fn format_line(hms: &str, level: Level, prefix: Prefix, body: &str) -> Option<String> {
    if body.is_empty() { return None; }
    let lvl = format!("{:<w$}", format!("[{}]:", level.as_str()), w = MAX_LEVEL + 3);
    let mut parts = vec![format!("({hms})"), lvl];
    if let Some(p) = prefix.as_str().filter(|p| !p.is_empty()) {
        parts.push(format!("{:<w$}", format!("[{p}]:"), w = MAX_PREFIX + 3));
    }
    Some(format!("{} {}", parts.join(" "), body))
}
```
(Pad by `char` count equals UTF-16 length because every prefix/level is ASCII; keep that invariant with a unit test over the closed set.)

### Per-chunk newline rule
```rust
// Source: port of log_writer.ts:205-211
fn normalise_chunk(chunk: &str) -> Option<String> {
    if chunk.trim().is_empty() { return None; } // JS trim vs Rust trim differ on a few unicode spaces; golden-test it
    Some(if chunk.ends_with('\n') { chunk.to_string() } else { format!("{chunk}\n") })
}
```

### StoreHost minimal API (shape Phase 85 widens)
```rust
// gamelib-core/src/store.rs (new). One owner per file; atomic temp+rename; change event; no TS callback.
pub struct StoreHost { /* open stores by (dir, name) */ }
pub struct Store { /* path, serde_json::Map (preserve_order), listeners */ }
impl StoreHost {
    pub fn open_cache(&self, dir: &Path, name: &str) -> io::Result<Arc<Store>>; // 2-space pretty JSON, 0600 file, 0700 new dir
}
impl Store {
    pub fn get(&self, key: &str) -> Option<Value>;           // flat key (no dot traversal), as uploadedLogs needs
    pub fn set(&self, key: &str, v: Value) -> io::Result<()>; // atomic persist, then fire change
    pub fn remove(&self, key: &str) -> io::Result<bool>;
    pub fn snapshot(&self) -> Map<String, Value>;
    pub fn on_change(&self, f: Box<dyn Fn(&StoreChange) + Send + Sync>);
}
```
Keep the API keyed by `(dir, name)`, flat keys first; Phase 85 adds dot-path access, versioned envelopes, backup, and the `storeChanged` bridge **without changing these signatures** (D-09 reversibility is costly). Review the signatures against 85's research flags (read-your-writes, `storeChanged` ordering, Windows atomic rename with an open file) before finalising.

### Uploader parity (dpaste)
```text
POST https://dpaste.com/api/v2/   User-Agent: HeroicGamesLauncher/<app version>   Content-Type: application/x-www-form-urlencoded
body: content=<urlencode(first 10 MiB of file, lossy utf-8)>&expiry_days=2
success: response text trimmed parses as a URL; token stored is the literal '1'; entry {name, token, uploadedAt: now_ms}
expiry prune in getUploadedLogFiles: delete entries where (now - uploadedAt)/86400000 >= 2
```
[VERIFIED: uploader.ts:11-27,29-31,38-48,79-110,150-170]. Keep the User-Agent string for parity unless the user wants it renamed (it still says Heroic). The delete POST sends a `FormData` body with an explicit urlencoded `Content-Type`, which is already incoherent, and dpaste has no delete, so the Rust port should send an urlencoded `token=1&delete=` body and treat any non-2xx as `false`; only URLs already present in the store are ever requested. Redirects: disable (a 3xx must not forward a POST body).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Two writers (TS `LogWriter` + shell `shell_diag` file) | One Rust writer | this phase | one rotate gate, one mode, no rotate race between processes |
| steamcm owns the global `tracing` subscriber (`VentLogForwarder`) | App-wide `Registry` + `Layer` | this phase | 79 WR-03 dropped diagnostics (owned_demos, macowned) are visible |
| Per-write open in Node | Per-batch open in Rust | this phase | same semantics, fewer syscalls |

**Deprecated/outdated:** the Electron-era "`logger/ipc_handler.ts`" comments in `loggerFlowRegistration.ts` (file no longer exists), and any doc claiming the TS log files are 0600.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `serde_json` without `preserve_order` sorts keys alphabetically, so it must be set explicitly | Standard Stack | Object-message golden would fail loudly; low risk |
| A2 | Batch tick 50 ms / 32 KiB and TS queue cap 4,000 entries / 4 MiB are adequate for a Wine launch. No real Wine launch could be measured on this Windows box. | Native Channel Plan | Too-small cap drops game transcript lines (counted); too-large cap bloats sidecar memory. Calibrate in a Wave-0 task with a synthetic emitter and again in the live macOS gate |
| A3 | Limiter window 60 s, first 5 per key, 256 tracked keys, 200-char summary excerpt | Pattern 5 | Cosmetic; the golden pins whatever is chosen |
| A4 | `std::fs::rename` replaces an existing destination on Windows | Pitfall 6 | A failed rotation on Windows; mitigated by keep-appending, proven on the CI Windows leg |
| A5 | `chrono` with `clock`+`std` adds no new `Cargo.lock` package name | Standard Stack | One extra name in `EXPECTED_LOCKFILE_CRATE_NAMES` |
| A6 | reqwest 0.13 emits its diagnostics through the `log` crate (it depends on `log`; it does not depend on `tracing`) | Pattern 4 | If it also emits `tracing`, the Layer already covers it; if neither at WARN, criterion 3's reqwest clause is only demonstrable at DEBUG |
| A7 | `rustls` is built without its `logging` feature here (`features = ["ring","std"]`), so it emits nothing | Pattern 4 | None; extra lines would just appear under `Backend` |
| A8 | Recommended frame-size cap 256 KiB and per-entry TS text cap | Native Channel Plan | Large single `logError(bigObject)` would be truncated (new behaviour); omit the per-entry cap if the user prefers strict parity |
| A9 | Reaching `logErrorSettled`'s "flush complete" at the stdout write callback is enough for the fatal-guard use | Native Channel Plan | Last line lost if the pipe is closed; same exposure as today's frames |

## Open Questions

1. **0600 mode: deliberate tightening or keep today's default?**
   - What we know: the TS writer never sets a mode (log_writer.ts:213 `appendFile` no mode; mkdir no mode); roadmap/STACK/SUMMARY claim 0600; `fileStore.ts` is where 0o600 actually exists (WR-06). Today's real mode is `0o666 & ~umask`.
   - What's unclear: whether the user wants criterion 1 read literally ("keep" = stay at the umask default) or as the clearly intended hardening.
   - Recommendation: Rust creates files 0600 (logs can carry env and command lines; `.old` from an older release stays 0644 and is left alone), record it as a deliberate deviation in the golden notes and the SUMMARY. **Needs user confirmation before it becomes a locked decision.**
2. **What raises crate diagnostics to DEBUG (D-16)?**
   - What we know: no global debug setting exists; `verboseLogs` is in `AppSettings extends GameSettings` with default `true` (`config.ts:345`) and is a per-game override too; `disableLogs` is separate and never gates `gamelib.log`; the TS writer does not filter levels at all.
   - What's unclear: whether "the existing verbose/debug log setting" means that global toggle (which would make DEBUG the default) or something else.
   - Recommendation: native verbosity default WARN; raised by env `GAMELIB_LOG_LEVEL=debug` and a `setLogVerbosity` native send (wired from a TS settings listener only if the user chooses to bind it to the global `verboseLogs`). Confirm which.
3. **`gog-redist.log` lives outside the log tree** (`<userData>/GamesConfig/gog-redist.log`). D-05 says Rust writes every log file, and a Rust writer must not accept arbitrary paths from TS.
   - Recommendation: a typed `gogRedist` target resolved by Rust from `Paths` (needs `games_config_dir`), file location unchanged. Alternative: move it into `runners/gog` (behaviour change). Pick the first unless the user objects.
4. **Does Phase 84 own the `run_exit` signature change** (pass `still_running` into `finish`) given 83 will be closed by then? Recommend yes; the change is tiny and covered by existing `shutdown::tests`.
5. **Windows live check.** CI's Windows leg proves rotation/handles/paths; the operator's Windows box is non-primary and `HOME` is unset there. No Windows live gate is recommended; say so in the plan rather than leaving a `human_needed` item.
6. **`close()`/`End of log` line** has no production caller in the sweep; confirm at plan time with `graphify query "LogWriter close"` before dropping it.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Rust toolchain (cargo) | all `cargo test -p gamelib-log/-core`, shell tests | yes | cargo/rustc 1.98.1 (CI pins 1.99.1 for clippy per 83-02-SUMMARY) | CI three legs are the authority |
| Node / pnpm | jest, `gen:ipc-contract`, golden generator | yes | node v24.19.0, pnpm 10.28.0 | none needed |
| macOS operator machine | live gate (Wine launch for batch calibration, packaged `.app`, show-in-folder, real upload) | not on this box | n/a | the live gate is a human-verify checkpoint, authored first |
| dpaste.com network | live upload only | live gate only | n/a | unit tests use a localhost TCP server behind an `HttpPost` seam; never hit dpaste from CI |
| cargo-deny / clippy darwin ratchet | CI | not locally | n/a | confirm on CI/mac box (`meta/clippyRatchet.cjs`) |

**Missing dependencies with no fallback:** none for planning. **Execution is blocked on Phase 83 closing (D-02).**

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Rust: `cargo test` (std harness, per-crate); TS: jest (projects incl. `Meta`) |
| Config file | `src-tauri/Cargo.toml`, `jest.config.*`, `.github/workflows/rust-test.yml` |
| Quick run command | `cd src-tauri && cargo test -p gamelib-log && cargo test -p gamelib-core` |
| Full suite command | `cd src-tauri && cargo test --bin gamelib-shell && cargo test -p gamelib-log -p gamelib-core -p gamelib-proc -p gamelib-steamcm` then `pnpm exec jest --runTestsByPath <new/changed suites>`, `pnpm check:ipc-contract`, `pnpm codecheck`, `pnpm find-deadcode` |

### Phase Requirements -> Test Map
| Criterion | Behavior | Test Type | Automated Command | File Exists? |
|-----------|----------|-----------|-------------------|-------------|
| SC1 | Line format, rotation, `.old` content, file location, per-chunk rule, sanitiser output byte-equal to TS golden | golden (Tier 1) | `cargo test -p gamelib-log --test golden`; `pnpm exec jest --runTestsByPath meta/__tests__/logGolden.test.ts` (oracle, asserts TS == golden until deleted) | Wave 0 |
| SC1 | Unix mode 0600 for new files | unit (unix only) | `cargo test -p gamelib-log writer::mode` | Wave 0 |
| SC1 | Windows: rotate with `.old` open elsewhere, path segments | unit | `cargo test -p gamelib-log writer::windows` (CI Windows leg) | Wave 0 |
| SC1 | Secondary instance never rotates | unit | `cargo test -p gamelib-log writer::second_init` | Wave 0 |
| SC2 | 7 channels validate and route; invalid vectors rejected with INVALID_ARGS marker; one owner | unit + data-driven | `cd src-tauri && cargo test --bin gamelib-shell native_`; `pnpm check:ipc-contract`; `pnpm exec jest --runTestsByPath src/backend/sidecar/__tests__/nativeChannelOwnership.test.ts src/backend/sidecar/__tests__/ipcSchemaCoverage.test.ts src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts` | exist; extend |
| SC2 | Upload/delete/list against a localhost server; expiry prune; response URL host check; StoreHost round trip incl. reading an existing 2-space `uploadedLogs.json` | unit/integration | `cargo test -p gamelib-log uploader`; `cargo test -p gamelib-core store` | Wave 0 |
| SC2 | Show-in-folder and getLogContent through `NativeHost` fake | unit | `cargo test --bin gamelib-shell log_` | Wave 0 |
| SC3 | `tracing::warn!(target: "steam_vent::…")` and `log::warn!(target: "reqwest::…")` land in `gamelib.log` with the mapped prefix; DEBUG only when raised; Layer reentrancy guard | unit | `cargo test -p gamelib-log bridge` | Wave 0 |
| SC3 | Repeating error rate-limited; summary line; scripted clock | golden (limiter) | `cargo test -p gamelib-log limiter` | Wave 0 |
| D-10 | TS forwarder: bounded queue, drop oldest + `N lines dropped`, early-boot lines kept, tick timer unref'd, backpressure | jest | `pnpm exec jest --runTestsByPath src/backend/logger/__tests__/forwarder.test.ts` | Wave 0 |
| D-10 | `log` frame validation vectors (valid/invalid, size cap, path traversal) shared jest/cargo | unit | `cargo test --bin gamelib-shell log_frame`; jest vectors test | Wave 0 |
| SC4 | `shell_diag`, `shell_diag_log_path`, `gamelib-shell.log`, TS `log_writer/formatter(paths/uploader/stores/sanitize)/loggerFlowRegistration` deleted; `VentLogForwarder` deleted | PortComplete gate | `pnpm exec jest --runTestsByPath src/backend/__tests__/loggerPortComplete.test.ts` (modelled on `nativeSeamPortComplete.test.ts`, with vacuous-pass guards, comments stripped) | Wave 0 |
| D-13 | Flush inside the exit budget; no permanent registrant; `still running at exit deadline` line lands | unit | `cargo test -p gamelib-core shutdown`; `cargo test --bin gamelib-shell handle_exit` | extend |
| Source-text gates | 4 shell_diag-count test files rewritten, leak-shape guard still non-vacuous | jest | `pnpm exec jest --runTestsByPath src/backend/__tests__/keyringDiagPersistence.test.ts src/backend/__tests__/macosEpicEmbedDiagPersistence.test.ts src/backend/__tests__/shellDiagPersistence.test.ts src/backend/__tests__/tauriShellSource.test.ts` | exist; rewrite |
| logSecretGate | Gate still sees the four log function names | jest | `pnpm exec jest --runTestsByPath meta/__tests__/logSecretGate.test.ts` | exists |
| Sidecar exit | Forwarder adds no unbounded exit work | smoke | `pnpm smoke:exit-check`, `pnpm smoke:sidecar` | exist |
| Live | Packaged macOS: shell line in `gamelib.log` with `[Shell]`, real Wine launch transcript byte-faithful, upload via UI, show in folder, `scanner … impl=rust` style line, a steam-vent WARN | human gate | authored first (plan 1), run last | Wave 0 / last plan |

### Sampling Rate
- **Per task commit:** the crate/suite named in that task's `<verify>` plus `npx prettier --check` on the exact written paths (`--file-info` first; `.planning` is ignored, so omit and say so).
- **Per wave merge:** `cargo test -p gamelib-log -p gamelib-core` + `cargo test --bin gamelib-shell` + targeted jest + `pnpm check:ipc-contract` + `pnpm codecheck`.
- **Phase gate:** CI `rust-test.yml` three legs green and the full jest suite on CI before `/gsd-verify-work`; the live macOS gate run.

### Wave 0 Gaps
- [ ] `meta/genLogGolden.ts` + `src-tauri/crates/gamelib-log/tests/fixtures/golden/{cases.json,*.expected}` + `meta/__tests__/logGolden.test.ts`: **committed before any TS is touched** (the oracle).
- [ ] Live-gate contract (`84-HUMAN-UAT.md`, UAT item shape per convention 4), authored before coding (v0.11 rule).
- [ ] `gamelib-log` crate scaffold + CI wiring (`rust-test.yml`, `rustTestWorkflow.test.ts`, `cargoFeatures.test.ts`).
- [ ] Shared frame vectors file (valid/invalid) consumed by jest and cargo.
- [ ] `src/backend/__tests__/loggerPortComplete.test.ts`.
- [ ] Batch/cap calibration: a synthetic emitter measurement (and a live Wine capture in the gate) replacing Assumption A2.

## Security Domain

`security_enforcement` is not set to `false` in `.planning/config.json`, so this section applies.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication / V3 Session | no | no auth surface (the logger handles no credentials) |
| V4 Access Control | yes | the renderer can only reach native channels in the generated allow-list; one-owner test; renderer-supplied paths are descriptors, never paths |
| V5 Input Validation | yes | serde `deny_unknown_fields` arg structs; closed prefix/level/runner/type sets; path-segment validation (no separators, `..`, NUL); frame size cap; renderer sanitiser (CR/LF escape, 65,536 / 256 caps) |
| V6 Cryptography | no | TLS via rustls (ring provider), never hand-rolled |
| V7 Error handling and logging | yes | log-injection defence (renderer CR/LF escape); infallible callers; fixed-text rejection logs naming only the channel (83 D-03); no args in logs |
| V8 Data protection | yes | log files created 0600 (Open Question 1); uploads send up to 10 MiB of **unredacted** log to a public paste with 2-day expiry (inherited, recorded in `loggerFlowRegistration.ts` D-09 / T-34.3-13; not changed here, but the live gate must upload a benign log only) |
| V12 Files and resources | yes | path traversal in `appName`/`runner` (today unvalidated, see Paths); never accept an arbitrary path from TS |
| V13 API / web service | yes | dpaste response URL must be `https` + host `dpaste.com` before it is stored or ever requested again; no redirects on POST |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Forged `log` frame on the shared sidecar stdout pipe (any child process output) | Spoofing/Tampering | Strict serde validation, closed sets, size cap, only enqueue; same trust as the `openExternal` frame |
| Renderer forges log lines with embedded newlines | Tampering | Rust sanitiser, golden-pinned |
| `appName` path traversal reading/uploading arbitrary `*.log` | Information disclosure | segment validation in the Rust resolver, vectors in the manifest |
| Log flooding / unbounded growth (80 A-IN-01) | Denial of service | D-14 limiter on `gamelib.log`, bounded queues both sides, rotation for the rest |
| Hostile paste-service response planting a URL that delete later POSTs to | SSRF/Tampering | https + host check, only store-known URLs, no redirects |
| Panic or deadlock in the logger taking the app down | DoS | catch_unwind in the writer loop, never panic in callers, reentrancy guard, panic hook stays independent (D-03) |
| Secrets in game/transcript logs reaching a public paste | Information disclosure | unchanged by this phase; `redactSecrets`/`authLogSanitizer` stay at their TS call sites; `logSecretGate` keeps its names |

## Suggested plan and wave decomposition (tracer first)

Phase 84 executes after 83-11 (D-02). Numbering is advisory.

- **Wave 0 (no deletions):** 84-01 live-gate contract (UAT items, literal table of lines to find, structural reachability pass like 83-01) **and** golden oracle generation + TS==golden jest test + frame vectors. 84-02 crate scaffold + CI wiring + `Paths::log_dir/log_file` in core.
- **Wave 1 (tracer, one vertical path):** 84-03 `gamelib-log` formatter + writer (rotate gate, 0600, per-chunk rule) + shell init **after** the single-instance guard + `kind:"log"` frame arm + TS forwarder for the **general** log only (`logInfo/…` + `logBootFacts`), bounded queue, EOF flush. Exit criterion: a real sidecar `logInfo` produces a golden-identical line in `gamelib.log` via the shell. Runner/game still on the TS writer (two writers coexist only inside this wave, on different files).
- **Wave 2 (parallel after the tracer):** 84-04 runner/game/redist targets, batching, `LogForwarder` class, `forceLog`/disabled rules, drop counter, convert the ~25 `LogWriter` type sites and all `createGameLogWriter/getRunnerLogWriter/new LogWriter` call sites. 84-05 router generalisation (NativeCtx, async invoke, richer manifest) + `logError/logInfo/showLogFileInFolder/getLogContent` native + Rust sanitiser. 84-06 minimal `StoreHost` + uploader/delete/list + pushes + removal of the sidecar `uploadedLogs` registration and the census rows.
- **Wave 3:** 84-07 tracing `Layer` + `log::Log` bridge + diag sinks + delete `VentLogForwarder`. 84-08 limiter (+ golden). 84-09 `shell_diag` -> new call codemod, four source-text tests, `shell_diag_log_path` and its test deleted, fatal-dialog path via `Paths`.
- **Wave 4:** 84-10 Shutdown final flush + fatal-exit flush (+ `run_exit` `finish` tweak). 84-11 TS deletions (`log_writer.ts`, formatter body, `paths.ts`, `uploader.ts`, `stores.ts`, `sanitizeRendererLogMessage.ts`, `loggerFlowRegistration.ts`, their tests), `loggerPortComplete` gate, `find-deadcode`, doc updates (`src-tauri/crates/README.md` crate list, comments naming `gamelib-shell.log`, `meta/captureShellScrollback.ts` comment). 84-12 live gate run (human) and CI three legs.

## Sources

### Primary (HIGH confidence)
- Repository files read this session: `src/backend/logger/{log_writer,formatter,constants,paths,index,types,stores,uploader,sanitizeRendererLogMessage}.ts`; `src/backend/sidecar/{loggerFlowRegistration,sidecarRpc,settingsFlowRegistration,bootstrap,fileStore}.ts`; `src/common/types/ipc/{logger,nativeChannels.json}`; `src-tauri/src/{main,sidecar,native_router,shell_open}.rs`; `src-tauri/crates/gamelib-core/src/*`; `gamelib-proc/src/diag.rs`; `gamelib-steamcm/src/vent.rs`; `src-tauri/crates/README.md`; `meta/logSecretGate.ts`, `meta/bridgeCensus.ts`, `meta/sidecarStartupSmoke.cjs`; 83-CONTEXT, 83-01/02/03/06 SUMMARY, 83-08/09 PLAN, 83-HUMAN-UAT; 82-STATE-OWNERSHIP; v0.11 STACK/PITFALLS.
- `cargo info tracing-subscriber@0.3.23` (features, MSRV) run this session.
- gsd-tools `package-legitimacy check` (crates) run this session.
- https://doc.rust-lang.org/std/os/windows/fs/trait.OpenOptionsExt.html (default Windows share mode).

### Secondary (MEDIUM confidence)
- Cargo.lock dependency lists (reqwest -> log; chrono features inferred from `iana-time-zone`).

### Tertiary (LOW confidence)
- Batch/cap/limiter numbers and Windows `rename` replace semantics (Assumptions A2-A4).

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM-HIGH: crates verified in lock/cargo info; `chrono` feature set and MSRV of the new crate to confirm with `cargo tree` at plan time.
- Architecture: HIGH: every integration point (reader thread, router types, bootstrap order, exit path) read in source; the main uncertainty is the 83-08/09 final shape of `main.rs` (being edited concurrently).
- Pitfalls: HIGH for TS behaviours and source-text gates; MEDIUM for Windows runtime semantics.

**Research date:** 2026-11-20
**Valid until:** 2026-12-04 (fast-moving: the 83 session is changing `main.rs`, `native_router.rs` and `handle_exit`; re-read them at planning and again at execution)
