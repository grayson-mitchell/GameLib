# Phase 73: Steam depot download pipeline in Rust - Research

**Researched:** 2026-11-09
**Domain:** Rust port of an existing Node download pipeline (HTTP chunk fetch, AES-CBC, LZMA/zstd/deflate, positional file writes, protobuf manifest, ACF write) plus sidecar<->shell pipe plumbing
**Confidence:** HIGH on the codebase mapping and the plumbing; HIGH on the crate stack (built and measured here); MEDIUM on Windows/Linux (build-only, not run here)

## Summary

The port is mostly a faithful transliteration of ~11.6k lines of TypeScript whose behaviour is pinned by years of incident-driven comments (User-Agent header, 15 s attempt timeout, 8 attempts, capped backoff, host-health scoring, stall tracking, structural reconcile). The valuable thing to carry over is those behaviours and their test vectors, not the structure. The crate stack in CONTEXT is right, with one correction: **`aes` 0.9.4 / `cbc` 0.2.1 need no `--cfg aes_armv8`**. I measured 15.3 GiB/s AES-256-CBC on this arm64 Mac with no rustflags (067b needed the flag only on aes 0.8.4). That means no `src-tauri/.cargo/config.toml` rustflags, which would otherwise have leaked into the whole Tauri build.

The "new plumbing" in D-03/D-06 is smaller than CONTEXT assumes. The shell already has a Rust-to-sidecar request/response leg (`SidecarState::invoke`) and a fire-and-forget leg (`write_frame` with `kind: "send"`), used today to relay renderer calls. What is missing is a Tauri-free way for `gamelib-depot` to reach them: a `JobHost` trait implemented in the shell, plus two sidecar channels (a token `invoke` and an event `send`) registered with schemas so `validateInbound` does not reject them (it fails closed on unknown channels). No new wire frame kind is required.

Three things in the repo are not named in CONTEXT and will break deletion if missed: `bridge/originalRestore.ts` calls `downloadSelectedDepotFiles` with a **function** `select` predicate (cannot cross the pipe); `library/resume.ts` runs `buildDepotPlan` + `reconcilePartialState` + `healReconciledFileModes` + `finalizeToSteam` at startup with no download (this is exactly the D-13 `verify_only` mode plus Rust finalize); and `steam-user` itself statically `require`s `lzma` and `zstddec`, so those two packages and `patches/lzma.patch` + `patches/steam-user.patch` **stay**; only `lzma-native` goes.

**Primary recommendation:** New Tauri-free crates `gamelib-depot` (lib) and `gamelib-depot-cli` (bin). One long-running `depot_job_run` rustInvoke channel on `UNBOUNDED_RUST_CHANNELS` that returns the final outcome, a short `depot_job_cancel` channel, a `depot_manifest_summary` channel for D-02, and a `JobHost` trait whose shell implementation sends progress as `send` frames and asks Node for CDN tokens via `invoke`. Port module-for-module with the TS unit-test vectors, prove parity with a synthetic-fixture Tier 1 (cargo + Jest on shared goldens) and an operator-assisted Tier 2 sweep, then delete.

## Project Constraints (from CLAUDE.md)

- GameLib is an independent project; do not raise deviation from upstream Heroic as a concern.
- Steam stack is frozen (`steam-user` stays the CM client; `STEAM-STACK.md`). Do not re-propose rejected options.
- Five conventions (load `Skill("gamelib-conventions")`):
  1. Todos in `.planning/todos/pending/` carry `severity:`, `platform:`, `ready:` (bare, lowercase, in that order).
  2. Spawned child processes from `src/` or `meta/` use `createFakeHomeProfile()`, never a hand-rolled `env` literal (applies to the new CLI's spawn sites, e.g. the parity sweep and any Jest test spawning `gamelib-depot-cli`).
  3. Sidecar timers/watchers/sockets/child handles must be `unref()`ed and leave no unbounded in-flight work at boot; exit is by event-loop drain at stdin EOF. The rustInvoke pending Promise for a depot job is not a handle, but the abort path must not wait on Rust at EOF.
  4. UAT items: `### N.` heading at column 0, inline `expected:`, `result:` opens with a status word.
  5. Every `<verify>` block runs `npx prettier --check` over the exact paths written (check `--file-info` first; omit if all ignored).
- GSD commands use a hyphen (`/gsd-execute-phase`).
- Memory notes: `tauri dev` does not rebuild the sidecar (`pnpm build:sidecar`); a fresh worktree needs `build:sidecar-sea` + `vite build` before `tauri:dev:run` (exit 101 otherwise); dev launch is `pnpm tauri:dev`, never `tauri:dev:run`; do not touch the six stale bridge installs during parity runs.
- Use `graphify query` for orientation; never read `GRAPH_REPORT.md` / `graph.json`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Carried from Phase 63 (not re-asked)
- Crate layout: a new Tauri-free library crate beside `gamelib-scan`, plus CLI access for
  headless tools (63 D-01/D-02). The app calls it in-process via `rustInvoke` (63 D-03).
  Spawns from `src/`/`meta/` use `createFakeHomeProfile()` (63 D-04).
- **Bytes never cross the JSON-lines pipe**. Only job descriptions, events and small results
  do (63 D-08).
- A dev/advanced-only fallback flag, hidden from the normal UI (63 D-11). The TypeScript path is
  deleted inside the phase once verified live (63 D-13). Restart dev after sidecar changes.
- Crates from 067b: `aes` + `cbc` with `--cfg aes_armv8`, `flate2` on `zlib-rs`, `xz2` (static
  liblzma), `zstd`.

#### Node/Rust boundary
- **D-01:** **Rust fetches and parses manifests.** Node supplies only CM-derived inputs per
  depot: manifest ID, manifest request code, depot key, CDN host list. Rust fetches each manifest
  from the CDN, parses it (protobuf content manifest), and caches it on disk. TypeScript
  manifest parsing (`loadContentManifestParser`, steam-user `getRawManifest` use) is deleted.
- **D-02:** TypeScript planning steps that read manifest file lists (the steam_api prescreen,
  `screenDepotPlanForSteamApi` / `prescreenBridgeDepots`, and anything else that inspects
  file paths) **ask Rust for summaries** over `rustInvoke`, such as matching paths and counts.
  They never receive the full manifest.
- **D-03:** **CDN auth tokens are requested from Node on demand.** When Rust needs a token for a
  host, or gets an auth failure (403) on one, it sends a request over the pipe and Node's
  `CdnAuthTokenCache` (`cdnAuth.ts`, including the `_send` workaround) answers. This needs a new
  **Rust→sidecar request direction** on the pipe, which doesn't exist today.
- **D-04:** **Depot selection stays in TypeScript** (`select.ts`, `appinfoOrder.ts`). It runs off
  PICS appinfo, which only Node fetches. Node hands Rust a job: depots, manifest IDs, request
  codes, keys, install dir and mode. Rust owns everything per file and per chunk, including CDN
  host health and failover (`hostHealth.ts`), stall tracking (`stallTracker.ts`) and the
  in-flight limiter (`inflightLimiter.ts`).
- **D-05:** **Delta-ready shape, no delta logic.** The job schema leaves room for Phase 74, for
  example an optional per-depot `from_manifest`, and the file and chunk writer is built to be
  reused for patching. Phase 74 implements the diff and patch.

#### Progress, pause, cancel, errors
- **D-06:** **Push events on the pipe.** Add a Rust→sidecar event frame keyed by job ID. It
  carries throttled progress (bytes, files, current host, rate), per-chunk warnings, the D-03
  token requests, and the final outcome. Long jobs must not hit the 60 s `rustInvoke` timeout:
  either the start call returns at once and the outcome arrives as an event, or the channel goes
  on `UNBOUNDED_RUST_CHANNELS`. The planner picks one. The UI-facing progress shape stays as it
  is today.
- **D-07:** **Pause stays abort + reconcile** (T-23-15 semantics). Pause cancels the Rust job.
  Resume starts a new job, which reconciles what's on disk and fetches only what's missing or
  mismatched. Rust keeps no suspended in-memory state.
- **D-08:** **Rust cancels jobs when it loses the sidecar.** Jobs are owned by the sidecar
  connection. When the sidecar dies or restarts (dead-sidecar Restart, stdin EOF), Rust cancels
  every job and flushes. The restarted sidecar resumes from `resumeBreadcrumbs` through
  reconcile. No job keeps writing to disk without an owner, and there's no reattach logic.
- **D-09:** **Same error/outcome taxonomy, 1:1.** Rust emits the same outcome and error kinds
  that `outcome.ts` and the 23.2 manifest-write taxonomy define today, including stall and
  host-health errors. The sidecar maps them to the existing TypeScript types, so UI strings,
  toasts and download-queue behaviour don't change. A test asserts every kind maps.

#### What else moves to Rust
- **D-10:** **All file-level post-processing moves into the Rust job.** That covers the sha1
  reconcile walk (`reconcile.ts`: `reconcilePartialState`, `verifyStructuralIntegrity`), the
  EDepotFileFlag ReadOnly/Hidden attributes (`fileAttributes.ts`), executable bits including
  the Mach-O content-gated +x fallback (`machO.ts`), the cross-depot path-collision check
  (`pathCollisions.ts`), and the flags census (`flagsCensus.ts`). All of them need the parsed
  manifest, which now lives in Rust.
- **D-11:** **ACF writing moves to Rust.** Rust measures real bytes on disk (keeping
  `finalizeToSteam`'s rule: never a manifest-derived sum, spike 001) and writes
  `appmanifest_*.acf` (the `buildAppManifestText` / `writeAppManifest` equivalent). TypeScript
  still **decides the policy inputs** (StateFlags and handoff mode, target library or
  steamapps root, bridge-bottle root) and passes them in the job. It also still owns adoption,
  Steam restart holds and library-state updates. The single-convergence rule holds: cancel,
  failure and success all go through the finalize step.
- **D-12:** **Shared redists use the same Rust job.** A Steamworks Common Redistributables
  download (`sharedRedist.ts`) becomes an ordinary Rust depot job with its own install root and
  no ACF. TypeScript keeps the lease, the per-GID ledger (`gamelib-shared-redists.json`) and
  the installer-run logic (`bridge/sharedRedistInstall.ts`).
- **D-13:** **Add a `verify_only` job mode without UI.** It runs the reconcile walk over an
  existing install and reports mismatches without fetching anything. It feeds the pending Verify
  todo later. No button or action ships in 73.

#### Parity and cutover
- **D-14:** **The parity corpus is a codec-coverage set**, chosen so every codec and edge case
  is covered:
  - an LZMA-heavy game (Civ V, 067a's corpus);
  - a modern zstd/VSZa depot;
  - a zip/deflate depot;
  - a multi-depot game with a cross-depot path collision;
  - a Mac-native game that needs the Mach-O +x fallback (HUMANKIND);
  - a shared-redist job.

  Parity means byte-identical trees (SHA1 per file), identical file modes and attributes, and
  identical ACF text apart from timestamps. CI gets committed synthetic chunk and manifest
  fixtures in `cargo test`. Game content is never committed.
- **D-15:** **Delete gate: parity, live macOS run, CI builds.** All of these must hold:
  - zero corpus parity diffs;
  - a live `pnpm tauri:dev` smoke on macOS covering install, pause/resume, cancel, sidecar
    restart mid-job (D-08), a bridge install, and a shared-redist job;
  - the Rust crate builds and passes `cargo test` on all three CI legs (macOS, Linux, Windows),
    with `xz2`/liblzma statically linked.

  Windows and Linux are verified by build and test, not live. Once all three hold, the
  TypeScript `steam/depot/` pipeline, its decompress worker pool and bundle, `lzma-native`, and
  the October `lzma-native` SEA packaging code are deleted inside this phase.
- **D-16:** **One flag for the whole pipeline**, `depotPipeline: 'rust' | 'ts'`, dev/advanced
  only. It defaults to `rust` once corpus parity passes. Stages can't be mixed across the
  boundary, because manifests live on one side.
- **D-17:** **Performance gate is no regression.** On the same job and connection, Rust must
  match TypeScript throughput within noise, and its peak RSS must be no worse than the post-fix
  Node pool (`b8f015a08`, `db95a4373`). There's no speed-up target.

### Claude's Discretion
- The crate name (e.g. `gamelib-depot`), channel names, the exact event-frame and token-request
  wire shapes, and the async runtime structure (tokio tasks, `spawn_blocking` for decode).
- How the start call avoids the 60 s timeout (D-06), and where the on-disk manifest cache lives.
- Whether headless tools and tests reach the pipeline through the existing `gamelib-scan-cli`
  binary or a new one. Phase 63 D-01 requires a CLI; its form is open.
- The HTTP client crate, concurrency limits, and how much of `download.ts`/`downloadFiles.ts`
  internals carry over one-for-one versus being restructured idiomatically, as long as D-09
  and D-14 parity holds.
- Which codec-coverage titles to use for zstd and zip/deflate, picked from installed or owned
  games.

### Deferred Ideas (OUT OF SCOPE)
- Delta (patch) downloads: Phase 74, built on the D-05 job shape.
- A Verify button or action and Move install for Steam games: the pending todo, built on the
  D-13 `verify_only` mode.
- Moving CM traffic (appinfo, request codes, depot keys, tokens) and depot selection to Rust:
  this belongs to a later sidecar-retirement slice.
- Live Windows/Linux install runs: build- and test-verified only in 73 (D-15).
</user_constraints>

<phase_requirements>
## Phase Requirements

No requirement IDs are mapped to this phase (TBD). Success criteria derived from the goal and CONTEXT decisions, for the planner to use as must-haves:

| ID (derived) | Description | Research Support |
|----|-------------|------------------|
| P73-A | A Steam install (fresh, resume, cancel, sidecar-restart) completes through the Rust job with byte-identical tree, modes, attributes and ACF (minus `LastUpdated`) vs the TS pipeline on the D-14 corpus | Parity harness (Validation), Pitfalls 1-9 |
| P73-B | `downloadSteamDepots`, `downloadSharedRedistDepots`, `downloadSelectedDepotFiles`, startup resume and `prescreenBridgeDepots` keep their TS signatures and results over `rustInvoke` | Consumer inventory, Pattern 3 |
| P73-C | Every Rust outcome/error kind maps to the existing TS error shape and `classifyDepotError` result (D-09) | Pitfall 4, error taxonomy table |
| P73-D | Pause/cancel/sidecar-loss leave no ownerless writer, and the single-convergence finalize still runs (D-07, D-08, D-11) | Pattern 4 |
| P73-E | `gamelib-depot` builds and passes `cargo test` on macOS, Linux, Windows CI legs with liblzma static; clippy ratchet and lockfile pin stay green | Stack, CI section, Pitfall 10-11 |
| P73-F | `steam/depot/` pipeline, decompress pool/worker/bundle, `lzma-native`, and the SEA lzma packaging are deleted with a deletion-gate test; `lzma`, `zstddec`, both patches stay | Deletion inventory |
| P73-G | Throughput within noise of TS and peak RSS no worse than post-fix Node pool (D-17) | Validation, Pitfall 12 |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| CM traffic: appinfo, ownership, depot keys, manifest request codes, content-server list, CDN tokens | Node sidecar (`steam-user`) | — | Frozen stack; D-04 and Deferred. |
| Depot selection, plan-build retry, queue, breadcrumbs, lease, redist ledger, Steam handoff | Node sidecar | — | Policy layer (CONTEXT domain). |
| Manifest fetch, parse, cache, filename decrypt | Rust (`gamelib-depot`, in shell process) | — | D-01. |
| Chunk fetch, host health, stall, in-flight limit, decrypt, decompress, positional write, whole-file SHA1 | Rust | — | D-04. Jobs run in the Tauri shell process, not the sidecar. |
| Reconcile / structural verify / modes / Mach-O +x / collisions / flags census / ACF | Rust | — | D-10, D-11, D-13. |
| Progress shape sent to UI, rate/ETA formatting, stall watchdog (`installStallWatchdog`) | Node sidecar | Rust supplies raw counters at >=1 Hz | UI contract unchanged; watchdog re-arms only on an observed advance. |
| Error classification (`classifyDepotError`, i18n) | Node sidecar | Rust supplies structured `kind`/`code`/tokens | D-09. |
| Job lifetime ownership | Tauri shell (Rust) | Sidecar connection | D-08: shell cancels on sidecar EOF. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `aes` | 0.9.4 (2026-11-02) | AES-256 block cipher | RustCrypto. **Measured 15.3 GiB/s on this arm64 Mac, no cfg flag** (scratchpad bench). |
| `cbc` | 0.2.1 | CBC mode (Steam: ECB-encrypted IV + CBC body, PKCS7) | RustCrypto; pairs with aes 0.9. |
| `sha1` | 0.11.0 | chunk SHA1 and whole-file SHA1 | RustCrypto; measured 2.9 GiB/s on arm64. |
| `flate2` | 1.1.x, `default-features=false, features=["zlib-rs"]` | raw deflate for PK containers | Locked by 067b. |
| `xz2` | 0.1.7, `features=["static"]` | VZ container: `lzma_alone` decoder | Locked. `static` makes `lzma-sys` always compile vendored **xz 5.2.5** with `cc` (no cmake, no pkg-config probe, `lzma-sys-0.1.20/build.rs`). Built and `otool -L` shows no liblzma/zstd/libz dylib. |
| `zstd` | 0.14.3 | VSZa container | Locked; builds with `cc`. |
| `prost` | 0.14.4 | protobuf decode of `ContentManifestPayload/Metadata` | Derive-only structs, no `protoc`, no `build.rs`. Built and round-tripped here. |
| `tokio` | 1.x (lock has 1.53.0) | runtime: `rt-multi-thread`, `sync`, `time`, `fs`, `macros`, `io-util` | Already in `Cargo.lock` via tauri. |
| `reqwest` | 0.13, `default-features=false, features=["rustls-no-provider","stream"]` + `rustls` 0.23 `["ring","std"]` | HTTP/HTTPS chunk + manifest GET | Already in lock (0.13.4 via tauri-plugin-updater); no `aws-lc` in the lock, so a default-features reqwest would add `aws-lc-sys`. Built here: GET over both `http://` and `https://` to `cache1-lax1.steamcontent.com` returned 200, no `aws-lc-rs` in the tree. Install the ring provider once (`rustls::crypto::ring::default_provider().install_default()`, ignore `Err`). |
| `serde`, `serde_json` | 1 | job/event/outcome wire types | Matches `gamelib-scan`. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `futures-util` | 0.3 (in lock) | bounded concurrent streams | file/chunk worker pools |
| `tokio-util` | 0.7 (in lock) | `CancellationToken` | D-07/D-08 cancel at chunk/file granularity |
| `windows-sys` | 0.61 (in lock via tauri), `Win32_Storage_FileSystem` | `SetFileAttributesW` for ReadOnly/Hidden | Replaces TS `spawnSync('attrib')`; cfg(windows) only |
| `libc` | in lock | `fchmod`/`lutimes` as needed | unix modes/symlinks (std has `PermissionsExt`, `symlink`, `FileExt::write_all_at`, so libc is probably unnecessary) |
| `tempfile` | 3 (dev) | test dirs | same as gamelib-scan |
| local HTTP server for tests | `tokio` `TcpListener` hand-served, or `hyper` already in lock | synthetic CDN in `cargo test` | Tier 1 fixtures |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `prost` derive | hand-written varint reader | ~100 lines, fine for 3 messages, but zero benefit over derive and loses unknown-field skipping |
| `zip` crate for manifest wrapper | small EOCD + central-directory reader (~40 lines) | `zip` 4.x is already advisory-ignored in `deny.toml` (RUSTSEC-2026-0367/8/9/0429); adding a second `zip` version adds noise. The chunk PK container needs custom local-header parsing anyway (data-descriptor quirk), so one shared container module is simpler. Parity-test it against AdmZip output. |
| `xz2` 0.1.7 (2022, `alexcrichton/xz2-rs`) | `liblzma` crate (maintained fork) | Locked by CONTEXT; note only. Vendored xz is 5.2.5 and the decoder sees untrusted network data after AES+sha gating (sha1 of decompressed bytes is checked), so exposure is limited. |
| aes 0.8.4 + `--cfg aes_armv8` | aes 0.9.4 | 0.8.4 needs workspace rustflags (spike 067b); 0.9.4 does not. **Use 0.9.4.** |

**Installation (`src-tauri/crates/gamelib-depot/Cargo.toml`):**
```toml
[dependencies]
aes = "0.9"
cbc = "0.2"
sha1 = "0.11"
flate2 = { version = "1", default-features = false, features = ["zlib-rs"] }
xz2 = { version = "0.1", features = ["static"] }
zstd = "0.14"
prost = "0.14"
tokio = { version = "1", features = ["rt-multi-thread", "sync", "time", "fs", "macros", "io-util"] }
tokio-util = "0.7"
futures-util = "0.3"
reqwest = { version = "0.13", default-features = false, features = ["rustls-no-provider", "stream"] }
rustls = { version = "0.23", default-features = false, features = ["ring", "std"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
[target.'cfg(windows)'.dependencies]
windows-sys = { version = "0.61", features = ["Win32_Storage_FileSystem"] }
[lints.clippy]
dbg_macro = "deny"
todo = "deny"
```
Add the crate to `[workspace] members` in `src-tauri/Cargo.toml` and as a path dependency of `gamelib-shell` (as `gamelib-scan` is).

**Version verification:** crates.io API, 2026-11-09: aes 0.9.4 (msrv 1.89), cbc 0.2.1 (1.85), sha1 0.11.0 (1.85), prost 0.14.4 (1.85), zstd 0.14.3, xz2 0.1.7, reqwest 0.13.5, tokio 1.54.1, flate2 1.1.11, windows-sys 0.61.2. Dependency set (aes, cbc, sha1, xz2 static, zstd, flate2 zlib-rs, prost) compiled and ran in a scratch project on this machine.

## Package Legitimacy Audit

slopcheck could not be installed (`pip3 install` was denied by the sandbox in this session). Per protocol every recommended crate is therefore tagged `[ASSUMED]` for slopcheck purposes; crates.io metadata (age, downloads, repo) was checked directly and is shown. All are long-established; none is new or low-download.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| aes | crates.io | 10 yrs | 400M | RustCrypto/block-ciphers | unavailable `[ASSUMED]` | Approved, human-verify gate advised |
| cbc | crates.io | 5 yrs | 137M | RustCrypto/block-modes | unavailable `[ASSUMED]` | Approved, human-verify gate advised |
| sha1 | crates.io | 12 yrs | 662M | RustCrypto/hashes | unavailable `[ASSUMED]` | Approved |
| flate2 | crates.io | 12 yrs | 830M | rust-lang/flate2-rs | unavailable `[ASSUMED]` | Approved |
| xz2 | crates.io | 10 yrs | 74M | alexcrichton/xz2-rs | unavailable `[ASSUMED]` | Approved (already CONTEXT-locked) |
| zstd | crates.io | 10 yrs | 468M | gyscos/zstd-rs | unavailable `[ASSUMED]` | Approved |
| prost | crates.io | 9 yrs | 696M | tokio-rs/prost | unavailable `[ASSUMED]` | Approved |
| reqwest, tokio, tokio-util, futures-util, rustls, windows-sys | crates.io | 8-10 yrs | 0.9-1.9B | seanmonstar / tokio-rs / rust-lang / rustls / microsoft | unavailable `[ASSUMED]` | Approved; **already in `Cargo.lock`** |

**Packages removed due to slopcheck [SLOP]:** none (tool unavailable).
**Packages flagged [SUS]:** none observed. Because slopcheck was unavailable, the planner should add one `checkpoint:human-verify` before the first `Cargo.toml` edit that introduces `aes`, `cbc`, `sha1`, `prost`, `xz2`, `zstd` (the six crates not already in `Cargo.lock`).

## Architecture Patterns

### System Architecture Diagram

```
 renderer ──install/pause/cancel──> Node sidecar (policy layer, unchanged signatures)
                                       │
   CM-only work stays here:            │  downloadSteamDepots / downloadSharedRedistDepots /
   PICS, ownership, select.ts,         │  downloadSelectedDepotFiles / resume.ts / prescreen
   getDepotDecryptionKey,              │
   getManifestRequestCode,             ▼  rustInvoke (stdout frame {kind:"rustInvoke"})
   getContentServers, CdnAuthTokenCache ─────────────────────────────────────────────┐
        ▲   ▲                                                                         │
        │   │ invoke "depotCdnToken"  (Rust -> sidecar, request/response)            ▼
        │   └──────────────────────────────────────────── Tauri shell process (src-tauri)
        │ send "depotJobEvent" (progress ≤2 Hz + 1 Hz heartbeat,                ┌────────────────────────┐
        │   warnings, planned totals) (Rust -> sidecar, fire-and-forget)         │ depot_dispatch.rs      │
        └────────────────────────────────────────────────────────────────────────│  JobHost impl over     │
                                                                                  │  Arc<SidecarState>     │
   sidecar stdout EOF ──> reader thread ──> gamelib_depot::cancel_all() (D-08)    └──────────┬─────────────┘
                                                                                             │ run_job(job, host, cancel)
                                                                                  ┌──────────▼─────────────┐
   job JSON (small): depots[{depotId, manifestId, requestCode, key, fromManifest?}],         │ gamelib-depot (lib)    │
   hosts[], installRoot, mode, finalize{…}, cacheDir, selectPaths?                  │ 1 manifest: fetch→unzip│
                                                                                  │   →prost decode→decrypt│
                                                                                  │   names→disk cache     │
                                                                                  │ 2 plan: collisions,    │
                                                                                  │   case-insens. probe   │
                                                                                  │ 3 reconcile (sha1 walk)│
                                                                                  │ 4 per-file workers(32) │
                                                                                  │   chunk fetch (limiter,│
                                                                                  │   host health, stall)  │
                                                                                  │   → spawn_blocking:    │
                                                                                  │   AES→VZ/VS/PK→sha1   │
                                                                                  │   → write_all_at       │
                                                                                  │   → whole-file SHA1    │
                                                                                  │   → modes/attrs/Mach-O │
                                                                                  │ 5 finalize: measure    │
                                                                                  │   bytes → ACF (atomic) │
                                                                                  └──────────┬─────────────┘
                                                                                             ▼
                                                                          steamapps/common/<installdir>/…  + appmanifest_<id>.acf
   headless: gamelib-depot-cli  (job JSON on stdin, NDJSON events on stdout, static tokens) → parity sweep, cargo tests
```

### Recommended Project Structure
```
src-tauri/crates/
├── gamelib-depot/
│   ├── src/lib.rs            # run_job, summarize, cancel_all, JobHost trait, OPS
│   ├── src/job.rs            # serde job/outcome/event types (deny_unknown_fields, camelCase)
│   ├── src/manifest.rs       # fetch, unzip, prost decode, filename decrypt, disk cache
│   ├── src/container.rs      # VZ / VSZa / PK / manifest zip; steam_decrypt
│   ├── src/fetch.rs          # HTTP attempt loop, headers, timeout, backoff, token retry
│   ├── src/host_health.rs    # port of hostHealth.ts (constants preserved)
│   ├── src/stall.rs, inflight.rs
│   ├── src/download.rs       # file worker, chunk pwrite, whole-file sha1
│   ├── src/reconcile.rs      # reconcilePartialState + verifyStructuralIntegrity
│   ├── src/post.rs           # modes, attributes (cfg), macho +x, collisions, census
│   ├── src/acf.rs            # buildAppManifestText/writeAppManifest + finalize + canWriteFullOwnership
│   ├── src/outcome.rs        # error kinds (D-09)
│   └── tests/ (fixtures/, golden.rs, fake_cdn.rs)
├── gamelib-depot-cli/        # bin: run | summarize | verify  (job JSON stdin, NDJSON stdout)
src-tauri/src/depot_dispatch.rs   # rpc_depot_* arms + JobHost impl + EOF hook
src/backend/storeManagers/steam/depotRust/   # thin TS: rustDepot.ts (invoke helpers), jobBuilder.ts, errorMap.ts
```
The README already names this crate (`gamelib-depot`) as the next application of the pattern.

### Pattern 1: Run the whole job on the rustInvoke worker thread, unbounded channel (recommended answer to D-06)
**What:** `depot_job_run` is dispatched on its own `thread::spawn`ed worker by `sidecar.rs` (every rustInvoke already is). That thread calls `runtime.block_on(run_job(...))` on a process-wide `OnceLock<tokio::runtime::Runtime>` owned by the crate and writes the final outcome as the response. Add `RUST_DEPOT_JOB_RUN` to `UNBOUNDED_RUST_CHANNELS` (precedent: the three dialog channels, with a documented reason, CR-04). Cancel via `depot_job_cancel` (normal 60 s channel, returns immediately).
**Why not start-and-event:** one response path, the sidecar-side Promise matches today's `await downloadSteamDepots(...)`, and a lost outcome event cannot strand the caller. A pending unbounded Promise is not a handle, so the sidecar exit contract is unaffected.
**Hazard:** if the shell dies the sidecar's stdin EOF ends it anyway. If the sidecar dies the shell's reader hits EOF: call `cancel_all()` there (D-08).

### Pattern 2: `JobHost` trait keeps the crate Tauri-free
```rust
// Source: pattern from gamelib-scan (Tauri-free dispatch) + shell_state.rs SidecarState::invoke/write_frame (read in this session)
pub trait JobHost: Send + Sync + 'static {
    fn emit(&self, ev: JobEvent);                                   // fire-and-forget; must never block the job
    fn cdn_token(&self, req: TokenRequest) -> Result<Option<String>, String>; // blocking; called via spawn_blocking
    fn manifest_request_code(&self, depot_id: &str, manifest_id: &str) -> Result<Option<String>, String>;
}
```
Shell impl: `emit` pushes into a bounded latest-wins slot drained by one aggregator thread that calls `state.write_frame(&SidecarRpcRequest{kind:"send", channel:"depotJobEvent", ...})` (never per chunk). `cdn_token` and `manifest_request_code` call `state.invoke("depotCdnToken"|"depotManifestRequestCode", ...)`. CLI impl: static token map from the job (or none; CDN edges need no token per cycle-14 pcap in `decompress.ts`), no request-code refresh.
`SidecarState::invoke` blocks on `recv_timeout`; **never call it directly on a tokio worker** (use `spawn_blocking`).

### Pattern 3: TypeScript keeps its signatures and becomes a thin job builder
- `fetchDepotPlanEntry` shrinks to: owned-depot filter, `getDepotDecryptionKey`, `getManifestRequestCode`, EResult-40 skip-and-warn. It returns a `DepotRef` (ids, key, request code, owner appId), not files. `withPlanBuildRetry` and `wrapDepotKeyError` stay.
- `downloadSteamDepots`: build refs, `getContentServerHosts`, build job, `rustInvoke('depot_job_run')`, map outcome to `DepotDownloadOutcome`. `totalBytes` is reported by Rust in a first `planned` event (only depot-internal code used `plan.totalBytes`).
- `downloadSharedRedistDepots(Leased)`: same job, `finalize: null`, own install root. Lease, index file and ledger stay in TS.
- `downloadSelectedDepotFiles`: **pass `selectPaths: string[]`** (the normalized wanted paths, a small list) instead of a predicate; Rust returns `files[{filename,size,sha1}]`. `originalRestore.ts` already builds `wanted: Map` up front.
- `library/resume.ts` startup resume: `mode: 'verify_only'` with `finalize` set; Rust runs reconcile, heals modes, writes the honest `4`/`1026` ACF, returns `{missing[], allFilesVerified, allModesHealed}`.
- `prescreenBridgeDepots` / `screenDepotPlanForSteamApi`: new channel `depot_manifest_summary` (fetch+cache manifests, return `{depotId, fileCount, totalBytes, matches:[normalizedPath…]}` for a supplied pattern list). Keep Rust-side wall clock under ~45 s per call to stay inside the 60 s rustInvoke bound, or run it as a `depot_job_run` mode `summarize` if manifests are huge.
- Move `formatEta` / `rollingRateMiBs` (used by `library/installPollOnce.ts`) and `PROGRESS_*` constants into a small surviving TS module before deleting `depot/`.

### Pattern 4: Cancellation and single-convergence finalize
One `CancellationToken` per job, checked before every chunk fetch attempt, before every file, and inside backoff sleeps (mirrors `signal.aborted` checks in `download.ts`). Cancel/failure/success all `await` `finalize` (the `canWriteFullOwnership` gate, ported with its tests, fails closed). Registry `HashMap<JobId, CancellationToken>` behind a `Mutex`; `cancel_all()` is called from (a) the `start_reader` EOF path next to `drain_pending_invokes`, (b) `RunEvent::Exit` with a bounded wait (suggest 5 s) so finalize can write the 1026 record, (c) `depot_job_cancel`. Because job inputs include everything finalize needs, Rust can finalize without Node.
At sidecar stdin EOF the TS abort handler must fire-and-forget the cancel (stdout may already be closed); do not await Rust there.

### Pattern 5: Wire shapes (Claude's discretion, recommended)
- Job: `{ jobId, mode: "install"|"verify_only"|"summarize"|"select_files", appId, installRoot, depots:[{depotId, manifestId, requestCode, key /*64 hex*/, ownerAppId, fromManifest: null}], hosts:[{host, vhost?, kind:"CDN"|"SteamCache", httpsMandatory, useTokenAuth, weightedLoad}], selectPaths?, finalize?: {steamappsDir, installdir, name, buildid, lastOwner, installedDepots?}, cacheDir, limits? }`. 64-bit ids are strings end to end (project rule, spike 001). Generated Args via `x-rust-value: true` for the nested job (the emitter in `genIpcContract.ts` supports only flat types otherwise), deserialized in-crate with `deny_unknown_fields`.
- Events: `{jobId, seq, kind:"planned"|"progress"|"warning"|"hostSummary", …}`. Progress carries raw counters `{doneBytes, netBytes, totalBytes, filesDone, filesTotal, host, elapsedMs}`; TS keeps `rollingRateMiBs`, ETA and `sendProgressUpdate` so the UI shape is untouched. A 1 s heartbeat must keep flowing even with no chunk landing (TS watchdog re-arms only on an observed advance of `percent` or the `bytes` string).
- Outcome: `{status:"completed"|"cancelled"|"error", failures:[{file, kind, message, code?, eresult?, scope?:"run", msSinceProgress?}], allFilesVerified, allModesApplied, skipped…, stats}`.

### Anti-Patterns to Avoid
- **Logging the job, event or token payloads.** Depot keys (32 B) and CDN tokens ride these frames. `sidecar.rs` logs channel names only (T-28-04); keep it so, and never `{:?}` a `DepotJob`. Give key fields a redacting `Debug`.
- **Per-chunk events over the pipe.** The shell has one stdin mutex shared with every other frame; a stalled Node event loop would block job threads on a full pipe. Coalesce.
- **Blocking a tokio worker on `SidecarState::invoke`.**
- **Mixing stages across the boundary.** Whole pipeline flips with `depotPipeline`; do not leave TS manifest parsing "just for summaries".
- **Reading the whole install into a manifest-sized in-memory structure twice.** Parse once, hold `Arc<Manifest>`, stream files.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Protobuf manifest decode | varint parser | `prost` derive structs; model `filename`/`linktarget` as `bytes` (wire-identical to `string`) and `from_utf8_lossy`, so a non-UTF-8 name does not abort the manifest the way a strict `String` field would | Matches protobuf.js leniency in steam-user |
| AES-CBC / SHA1 / deflate / zstd / LZMA | anything | RustCrypto + `flate2` + `zstd` + `xz2` | Locked, measured |
| HTTP connection pooling, TLS | raw hyper | `reqwest` (already in lock) | Keep-alive per host is what makes 32 in-flight cheap |
| Cancellation | AtomicBool polling | `tokio_util::sync::CancellationToken` | Wakes sleeping backoff/awaits |
| Windows file attributes | `attrib.exe` spawn | `SetFileAttributesW` | No process spawn, no 2 s timeout |
| Atomic ACF write | write in place | tmp file + fsync + rename (port of `writeAppManifest`) | Crash safety, T-21-06 |
| Positional writes | seek+write | `std::os::unix::fs::FileExt::write_all_at` / `windows::fs::FileExt::seek_write` loop | No shared cursor across tasks |
| Host health / stall / limiter | new design | Port `hostHealth.ts`, `stallTracker.ts`, `inflightLimiter.ts` constants and tests one-for-one | Each constant is an incident fix (see comments in `download.ts`, `decompress.ts`) |

**Key insight:** the risk is behavioural regression, not missing libraries. Every magic number in the TS (`CHUNK_FETCH_TIMEOUT_MS=15000`, `CHUNK_FETCH_ATTEMPTS=8`, backoff `200*2^i` capped 3000, `FILE_CONCURRENCY=32`, `TARGET_INFLIGHT_CHUNKS=32`, `PROGRESS_HEARTBEAT_MS=1000`, stall 3 min, `MAX_CONSECUTIVE_FAILURES=5`, `TOP_N_FANOUT=8`, `DEMOTED_PROBE_INTERVAL=32`) exists because of a live failure. Carry them as named constants with a comment pointing at the TS origin.

## Runtime State Inventory

(Phase deletes and replaces a subsystem; included because stale runtime state can survive a code-only swap.)

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `resumeBreadcrumbs` (persisted native-install-in-progress records), partially written install trees, existing `appmanifest_*.acf` written by TS. All remain valid: Rust reconcile reads the same on-disk tree and writes the same ACF layout. New: manifest disk cache dir (created by Rust). | None for old data. Define cache dir and eviction. No data migration. |
| Live service config | None — verified: the pipeline holds no external-service config (CM session stays in Node). | None |
| OS-registered state | None — verified by grep for launchd/Task Scheduler references in `steam/depot/`; none. | None |
| Secrets/env vars | New dev env var for the D-16 flag (name TBD, suggest `GAMELIB_DEPOT_PIPELINE`). Existing `GAMELIB_DECOMPRESS_POOL_SIZE` (067b harness) becomes dead. | Add one, remove one; document in the crates README |
| Build artifacts | `build/main/decompressWorker.js` (dev decode worker) produced by `pnpm build:decompress-worker-dev`, referenced by `tauri:dev:run`/`tauri:dev:packaged` scripts; `lzmaNativeResolvedPaths.generated.cjs` (gitignored generated file); SEA assets `lzma_native.node` / `liblzma.dll` embedded by `meta/buildSidecarSea.ts`. | Remove script steps, generator, generated file, `.gitignore` line, SEA asset embedding and the `NATIVE_LZMA_REQUIRED_TRIPLES` check |

## Common Pitfalls

### Pitfall 1: `lzma` and `zstddec` are not deletable
**What goes wrong:** deleting "all lzma" breaks sidecar boot. `patches/steam-user.patch` makes `steam-user/components/cdn_compression.js` do a static `require('lzma')` and it also requires `zstddec`; steam-user loads that file at import.
**How to avoid:** delete only `lzma-native` (package.json, lockfile, typedef `lzma-native.d.ts`, SEA code). Keep `lzma`, `zstddec`, `patches/lzma.patch`, `patches/steam-user.patch`. The patch's comment claiming `lzma-native` is "never installed" is stale (it is a real dependency at 8.0.6); update the comment. Add `smoke:sidecar` to the gate.

### Pitfall 2: Consumers CONTEXT did not name
`originalRestore.ts` (`select` predicate), `library/resume.ts` (reconcile+heal+finalize with no download), `library/installPollOnce.ts` (`formatEta`, `rollingRateMiBs`), `depotErrors.ts` (`isDecodeStageError` from `depot/decompress`), `sidecar/index.ts` (`runDecompressPoolSelfTest`), `sidecar/installRejectionGuard.ts` (mentions lzma), `cancelDelete.ts`. Each needs a replacement before `git rm`. A deletion-gate test (63 pattern: `scannerPortComplete.test.ts`) should assert paths gone, forbidden symbols absent, intended exemptions present.

### Pitfall 3: Tests that import the deleted modules
Steam `__tests__` with `depot*`, `reconcile`, `decompressPool`, `decompressWorkerRealBuild`, `lzmaNative*`, `hostHealth`, `inflightLimiter`, `cdnAuth` (stays: Node keeps `CdnAuthTokenCache`), `pathCollisions`, `fileAttributes`, `flagsCensus`, `manifest`, `depotLeaseMocks.ts`, plus `meta/__tests__/{buildSidecarSea,esbuildWorkerBundleShared,runTs}.test.ts`. Port their **vectors** into Rust tests before deleting (hostHealth, inflightLimiter, reconcile, pathCollisions, flagsCensus, fileAttributes, manifest text, canWriteFullOwnership, resolveContainedPath). Caller tests then mock `rustInvoke` with a small stub (63 lesson: `stubRustScan.ts` style, not a parser).

### Pitfall 4: Error taxonomy relies on message text and properties, not just kinds
`classifyDepotError` matches `/ENOSPC/i`, `/traversal/i`, `/sha1 mismatch/i`, `/CDN \d|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|no content servers/i`, reads `.eresult`, `isDecodeStageError(err)` (a `.code` property), and `isStallError` (`isStall` + `msSinceProgress`). Rust `io::Error` text is "No space left on device (os error 28)", not "ENOSPC"; Windows disk-full is error 112/39. **Rust must emit a structured `kind` and the TS `errorMap.ts` must rebuild the `Error` with the exact property/token the classifier expects** (e.g. kind `disk_full` -> message containing `ENOSPC`). The D-09 test should feed every Rust kind through `classifyDepotError` and assert the same `key`/`action` as the legacy error did. Also keep `selectPrimaryDepotFailure` semantics (`scope:'run'` beats file-level) and `FAILURE_LOG_CAP`.

### Pitfall 5: Manifest request codes rotate
Reported to rotate about every 5 minutes (secondhand; `[ASSUMED]`, LOW). Fetch manifests immediately after Node obtains codes, and let Rust ask Node for a fresh code on 401/403/404 (`manifest_request_code` host callback). Manifest bytes are immutable per (depotId, gid) so the disk cache key is that pair; resume then needs no code at all when the cache is warm.

### Pitfall 6: Filename decrypt, PK containers and the manifest wrapper are three different zip-ish things
- Manifest wrapper: `CdnCompression.unzip` accepts VSZa, VZa, or a real zip (first entry via **central directory**).
- Chunk PK container: local file header only; Stored with bit-3 data descriptor needs `cbOriginal` for length; Deflate (method 8) is self-terminating.
- Filenames: base64 ciphertext when `filenames_encrypted`, decrypted with the same ECB-IV+CBC routine, then **truncated at the first NUL**, UTF-8. `sha_filename` is deliberately not verified ("some manifests contain invalid filename hashes").
- Do not verify the manifest signature (TS skips it).
- VZ: `props = buf[7..12]`, payload `buf[12..len-10]`, `outSize = u32le at len-6`, rebuild `props|u64le(outSize)|payload` and feed `lzma_alone` decoder (`Stream::new_lzma_decoder(u64::MAX)`; 067b did exactly this). VSZa: header 4, crc 4, body, footer 15 with `decompressedSize` at `len-11`; reject if it differs from `cb_original` **before allocating**.
- Always check `len == cb_original` then SHA1, in that order (reason codes `size_mismatch` then `sha1_mismatch`).

### Pitfall 7: Request headers and URL scheme parity
`User-Agent: Valve/Steam HTTP Client 1.0`, `Accept: text/html,*/*;q=0.9`, `Accept-Charset: ISO-8859-1,utf-8,*;q=0.7`; scheme `https://` only when `https_support == 'mandatory'`, else `http://` (steam-user parity); token gate is `usetokenauth==1 || type=='CDN'`; manifest URL `{scheme}{host}/depot/{depotId}/manifest/{manifestId}/5/{requestCode}{token}`; chunk URL `/depot/{depotId}/chunk/{sha}`. Let reqwest decode gzip transparently only if the TS did (undici default did); verify against a real host, do not force `Accept-Encoding`.

### Pitfall 8: Case-insensitive volumes, Windows and symlinks
`pathCollisions.ts` keys paths by `caseInsensitivePaths` decided at plan time by probing the destination volume; port the probe. Keep `resolveContainedPath` (normalise `\`→`/`, reject `..` escape) and the symlink target containment check. Windows symlink creation needs privilege: TS used `fs.symlink`, same failure class; preserve behaviour, do not silently skip. Clear a stale directory at a file path before writing (`clearStaleDirectoryAtFilePath`).

### Pitfall 9: Mode and attribute parity
Executable (32|128) → `0o755`; ReadOnly(8) → `0o444`/`0o555` if executable; Hidden(16) is a POSIX no-op with a warning; Windows `attrib +R/+H`. Order in TS: exec chmod, then readonly chmod (readonly overrides). Mach-O fallback: only when not already executable, not win32; probe first 4096 bytes, thin or fat (first slice only, `nfat<=32`, slice offset `<= 64 MiB`), accept MH_EXECUTE(2) and MH_DYLIB(6). Parity asserts modes, so compare `st_mode & 0o7777` per file. Reconcile-skipped files also get modes healed (`healReconciledFileModes`).

### Pitfall 10: Clippy ratchet and lockfile pin make "new crate" a CI-affecting change
`meta/clippyRatchet.cjs` holds `--workspace --all-targets` warnings at **equality** ceilings per OS; any new warning in the new crates fails CI (and a fall also fails). New crates must be clippy-clean on rustc/clippy 1.99.1 on **both** darwin and win32 (cfg(windows) code only lints on the Windows leg and Linux is never linted). `src/backend/__tests__/cargoFeatures.test.ts` pins `EXPECTED_LOCKFILE_CRATE_NAMES`; add every new crate name in the same commit (expect at least: aes, cbc, cipher, crypto-common, inout, sha1, cpufeatures, xz2, lzma-sys, zstd, zstd-safe, zstd-sys, prost, prost-derive, gamelib-depot, gamelib-depot-cli, plus any transitive new ones from `cargo tree`). `rust-test.yml` needs `-p gamelib-depot -p gamelib-depot-cli` added to the explicit `cargo test` step (workspace members are not default members; a plain `cargo test` silently skips them).

### Pitfall 11: `rust-version` and `incompatible_msrv`
The crates README mandates `rust-version = "1.77.2"`, but the new deps need 1.85-1.89 and clippy's `incompatible_msrv` (already at a ceiling of 1 in the darwin map) would fire for any newer std API (`is_none_or` 1.82, `LazyLock` 1.80, `File::lock` 1.89). Resolver "2" is not MSRV-aware so the build works. Recommend `rust-version = "1.89"` for the two new crates and a one-line README note; otherwise keep 1.77.2 and restrict std usage. Planner: pick one and measure the ratchet.

### Pitfall 12: Work now runs inside the UI process
Jobs live in the Tauri shell, not the sidecar: 32 file workers plus decode can starve the UI thread. Bound decode with `spawn_blocking` plus a semaphore of `min(cpus-1, 4)` (the Node pool defaulted to `min(cpus,4)`), keep the HTTP in-flight limiter at 32, and measure RSS in the shell process for D-17. Each chunk buffer is ~1 MiB compressed + ~1 MiB decoded; 32 in flight is ~64-100 MiB, so the old 2.75 GB figure should not recur. Gate on measurement, not belief.

### Pitfall 13: Sidecar exit contract
No new timers/handles in the sidecar. The event listener is a registry entry. The abort-on-EOF path in `releaseOnStdinEof()` (`pauseCurrentDownload()` then `callAllAbortControllers()`) must not `await` Rust. `smoke:sidecar` misses slow exit, so add a fake-HOME check that a started-then-EOF'd job leaves the sidecar exiting by drain (convention 3).

### Pitfall 14: Request/response channel registration is fail-closed
`validateInbound` rejects any channel with no schema; `ipcSchemaCoverage` requires every registered channel to have one. Add `depotJobEvent` (send) and `depotCdnToken`, `depotManifestRequestCode` (invoke) to `channelSchemas.ts` with `caller: 'shell'` so they are absent from `RENDERER_CHANNELS`; register handlers in a `*FlowRegistration.ts`; add the three `depot_*` rustInvoke constants to `sidecarTransport.ts` + `RUST_INVOKE_CHANNELS` + `rustInvoke.ts` args schema; run `pnpm gen:ipc-contract` and commit `ipc_contract.rs` (`pnpm check:ipc-contract` gates CI); add the match arms in `rust_dispatch.rs` (exhaustive, a missing arm is a compile error); extend the static parity test (`OPS` == constants == arms).

### Pitfall 15: Corpus assumption in D-14
067a measured Civ V's 978-chunk sample as **917 zip, 61 LZMA, 0 zstd**. Civ V is the zip-heavy title, not "LZMA-heavy". Pick the LZMA title by measuring chunk containers (the Rust CLI can print a container histogram per manifest), and pick the zstd title the same way. Never commit game content.

### Pitfall 16: Fresh-worktree and dev loop
`tauri dev` rebuilds Rust on change but not the sidecar. Any TS change needs `pnpm build:sidecar` + restart. A fresh worktree needs `build:sidecar-sea` + `vite build` first (exit 101 otherwise). Launch with `pnpm tauri:dev`. Do not leave the stale-fixture bridge installs (Manor Lords, Core Keeper, Abiotic Factor, Planet Crafter, Hell Clock, Mining Mechs) in any parity run.

## Code Examples

### Steam chunk decrypt (aes 0.9 / cbc 0.2)
```rust
// Source: 067b rust-bench/src/main.rs (steam_decrypt) adapted; aes 0.9.4 API verified by compile+run in scratchpad.
use aes::cipher::{BlockModeDecrypt, BlockDecrypt, KeyInit, KeyIvInit, block_padding::Pkcs7};
type CbcDec = cbc::Decryptor<aes::Aes256>;
fn steam_decrypt(enc: &[u8], key: &[u8; 32]) -> Result<Vec<u8>, DecodeError> {
    if enc.len() < 32 { return Err(DecodeError::short()); }
    // first 16 bytes: IV encrypted with AES-256-ECB; remainder: AES-256-CBC with that IV, PKCS7
    let mut iv = aes::Block::try_from(&enc[..16]).unwrap();
    aes::Aes256::new(key.into()).decrypt_block(&mut iv);
    let mut body = enc[16..].to_vec();
    let plain = CbcDec::new(key.into(), &iv).decrypt_padded::<Pkcs7>(&mut body).map_err(|_| DecodeError::decode_failed())?;
    Ok(plain.to_vec())
}
```
(Confirm exact trait/method names against the compiler; the 0.9 API renamed `BlockDecryptMut` to `BlockModeDecrypt`. The scratch bench used `decrypt_padded::<NoPadding>` successfully. Match `crypto.ts` byte-for-byte, including its handling of the ECB IV block.)

### Per-file write skeleton
```rust
// Source: download.ts downloadSingleFile semantics (read in this session)
let f = OpenOptions::new().write(true).create(true).truncate(true).open(&dest)?;
f.set_len(size)?;                                   // truncate to final size, then positional writes
// per chunk (any order): pwrite(offset, &decoded) — unix: f.write_all_at(buf, off)
// after all chunks: re-read file, SHA1 == sha_content else Err(Sha1Mismatch)  // whole-file gate, kept
// then modes: exec -> 0o755; readonly/hidden; Mach-O +x fallback
```

### Pipe plumbing in the shell (existing primitives)
```rust
// Source: src-tauri/src/shell_state.rs and sidecar.rs (read in this session)
// Rust -> sidecar request/response:  state.invoke("depotCdnToken".into(), vec![json!({...})])   // blocking, 60 s bound
// Rust -> sidecar fire-and-forget:   state.write_frame(&SidecarRpcRequest{ id: state.next_id(), kind: "send", channel: "depotJobEvent".into(), args })
// EOF hook: in start_reader, right beside drain_pending_invokes(...):   gamelib_depot::cancel_all();
```

### Round-trip the synthetic fixtures (Tier 1 builder, test-only encoders)
Build a manifest with `prost::Message::encode_to_vec`, wrap as `magic|len|payload` sections, zip/VZ/VSZa-wrap in test code (`xz2::stream::Stream::new_lzma_encoder`, `zstd::encode_all`, `flate2` deflate), AES-encrypt with a throwaway key (as 067b did), serve from a local `TcpListener`. Expected tree hashes come from the TS pipeline run once by a generator, as in 63 (`expected.json`).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| aes 0.8.4 needs `--cfg aes_armv8` | aes 0.9.x: ARMv8 backend on by default | aes 0.9.0 changelog ("Enable ARMv8 backend by default") ; measured here | No workspace rustflags needed |
| `lzma-native` addon + SEA asset embedding + win32 `liblzma.dll` side-load | `xz2` `static` (vendored xz 5.2.5 compiled by `cc`) | this phase | Retires the October SEA fixes and the open win32 "native LZMA never engages" todo |
| reqwest default TLS | reqwest 0.13 `rustls-no-provider` + `ring` | already how the lock resolves | Avoids `aws-lc-sys` (C + nasm on Windows) |
| 14 MB decode-worker bundle x16 workers | one in-process Rust decode pool | 067b / this phase | Idle RSS issue gone by construction |

**Deprecated/outdated:** `build:decompress-worker-dev`, `GAMELIB_DECOMPRESS_POOL_SIZE`, `runDecompressPoolSelfTest`, `lzmaLoader*`, `NATIVE_LZMA_REQUIRED_TRIPLES`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Manifest request codes rotate roughly every 5 minutes | Pitfall 5 | If much shorter, the `manifest_request_code` refresh callback becomes mandatory rather than defensive; plan it anyway |
| A2 | All listed crates are legitimate (slopcheck unavailable; crates.io metadata only) | Package Legitimacy Audit | Supply-chain risk; mitigated by `checkpoint:human-verify` before first add |
| A3 | `rust-version = "1.89"` is acceptable for the new crates despite the README's 1.77.2 rule | Pitfall 11 | Convention deviation; user may prefer keeping 1.77.2 and pinning older RustCrypto |
| A4 | Windows/Linux builds of xz2-static/zstd-sys/aes/ring succeed with only `cc`/MSVC/gcc (no cmake) | Stack | Verified on macOS only; CI legs are the real proof (D-15) |
| A5 | Decode concurrency `min(cpus-1, 4)` is a good default and the shell UI stays responsive | Pitfall 12 | Needs live measurement in the D-17 gate |
| A6 | `aes` 0.9 uses AES-NI on x86_64 by runtime detection with no flag | Stack | Release targets include x86_64 linux/windows; benchmark on CI or a Windows box before claiming parity on throughput |
| A7 | `depot_manifest_summary` fits inside 60 s for the largest manifests (fetch + parse + cache) | Pattern 3 | If not, move to a job mode on the unbounded channel |

## Open Questions

1. **Where does the manifest cache live and how is it evicted?**
   - Known: key is (depotId, manifestId), content immutable, raw bytes still hold encrypted names so no key is persisted.
   - Unclear: size policy (large depots can have multi-MB manifests).
   - Recommendation: job carries `cacheDir` (e.g. under the app data dir, `depot-manifests/`), atomic tmp+rename write, keep the newest 2 GIDs per depot, prune on job success.
2. **Does `depot_manifest_summary` stay a short call or become a job mode?** Recommendation: short call with a hard 45 s internal deadline; promote to the job channel only if A7 fails.
3. **Event frames for the per-chunk warnings (D-06)?** Recommendation: aggregate into the 1 Hz host summary plus a capped list of distinct warning strings, because the TS side only logs them (`[Timing] chunk-stream stats` line); do not forward every attempt.
4. **Flag form.** 63 used env-only (`GAMELIB_SCANNER_<NAME>`); recommend `GAMELIB_DEPOT_PIPELINE=rust|ts`, read once per job at `runNativeDepotDownload`, default `ts` until corpus parity passes then `rust`, deleted in the same phase (D-13/D-16). CONTEXT's "advanced" wording does not require a persisted setting.
5. **Zstd and LZMA corpus titles** (Pitfall 15): need an owned-game container histogram; operator choice at plan time.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| rustc / cargo | all crate work | ✓ | 1.99.1 | — (equals clippy pin) |
| C compiler (`cc`) | `lzma-sys`, `zstd-sys`, `ring` | ✓ (macOS) | Apple clang 21 | — |
| cmake | not needed (xz2/zstd use `cc`) | ✗ | — | none needed |
| Node / pnpm | Jest, sidecar build | ✓ | 22.23.4 / 10.28.0 | — |
| Windows + Linux hosts | D-15 CI-leg build/test | ✗ locally | — | GitHub Actions `rust-test.yml` matrix (windows/macos/ubuntu) is the proof |
| Live Steam account + QR scan | Tier 2 sweep, live smoke | operator-assisted | — | none; manual-only by nature (067a harness) |
| Docker | — | ✗ | — | not required |
| slopcheck / pip | package audit | ✗ (denied) | — | `[ASSUMED]` tags + human-verify checkpoint |

**Missing with no fallback:** none blocking.
**Missing with fallback:** Windows/Linux local runs (use CI), slopcheck (human gate).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `cargo test` (built-in) for `gamelib-depot*`; Jest 29 + ts-jest for TS side (`Meta` project for `meta/`) |
| Config file | `src-tauri/Cargo.toml` (workspace), `jest.config.js` |
| Quick run command | `cd src-tauri && cargo test -p gamelib-depot -p gamelib-depot-cli` ; `pnpm exec jest <touched paths>` |
| Full suite command | `pnpm test:ci && cd src-tauri && cargo test -p gamelib-scan -p gamelib-scan-cli -p gamelib-depot -p gamelib-depot-cli && cargo test --bin gamelib-shell` |
| Also | `pnpm check:ipc-contract`, `pnpm find-deadcode`, `pnpm smoke:sidecar`, clippy: `cd src-tauri && cargo +1.99.1 clippy --workspace --all-targets --message-format=json > $TMP/c.json && node ../meta/clippyRatchet.cjs $TMP/c.json --list` |

### Phase Requirements → Test Map
| Decision / Req | Behavior | Test Type | Automated Command | File Exists? |
|----------------|----------|-----------|-------------------|-------------|
| D-01 manifest | fetch (mock CDN) → unzip (zip/VZ/VSZa) → prost decode → names decrypted → cache hit on 2nd call | unit/integration | `cargo test -p gamelib-depot manifest` | ❌ Wave 0 |
| D-02 summaries | path matches/counts equal TS `screenDepotPlanForSteamApi` on fixtures; full manifest never returned | unit + Jest | `cargo test -p gamelib-depot summarize`; `pnpm exec jest src/backend/storeManagers/steam/__tests__/depot.prescreen.test.ts` | ❌ W0 (Rust), ✅ (Jest, updated) |
| D-03 tokens | 403 on token host → `cdn_token(force)` called once → retry succeeds; no token for non-token hosts | integration (fake CDN + fake JobHost) | `cargo test -p gamelib-depot fetch_token` | ❌ W0 |
| D-04 | host failover, health scoring, stall (run-scope failure), limiter bound | unit | `cargo test -p gamelib-depot host_health stall inflight` (vectors ported from `hostHealth.test.ts`, `inflightLimiter.test.ts`) | ❌ W0 |
| D-05 | job accepts `fromManifest: null`, rejects unknown fields | unit | `cargo test -p gamelib-depot job_schema` | ❌ W0 |
| D-06 | long job not bound by 60 s; events ≥1 Hz heartbeat; no per-chunk frames | integration + Jest | `cargo test -p gamelib-depot events_throttle`; Jest on `rustDepot.ts` with stubbed `requestRustInvoke` | ❌ W0 |
| D-07 | cancel mid-file then second job reconciles and fetches only missing | integration | `cargo test -p gamelib-depot cancel_resume` | ❌ W0 |
| D-08 | `cancel_all()` on EOF; finalize ran; no writer after return | unit (shell) | `cd src-tauri && cargo test --bin gamelib-shell depot_eof` | ❌ W0 |
| D-09 | every Rust kind → TS Error → same `classifyDepotError` key/action; ENOSPC token; stall props | Jest | `pnpm exec jest src/backend/storeManagers/steam/__tests__/depotRustErrorMap.test.ts` | ❌ W0 |
| D-10 | reconcile, modes (octal), Mach-O thin/fat, collisions, census equal TS vectors | unit | `cargo test -p gamelib-depot reconcile post` | ❌ W0 |
| D-11 | ACF text equals TS `buildAppManifestText` (minus LastUpdated), atomic write, StateFlags gate fail-closed, SizeOnDisk = measured | golden | `cargo test -p gamelib-depot acf`; Jest golden from TS generator | ❌ W0 |
| D-12 | shared-redist job: own root, `finalize:null`, no ACF written | integration | `cargo test -p gamelib-depot redist_job` | ❌ W0 |
| D-13 | `verify_only` fetches nothing (fake CDN records zero hits), reports mismatches, startup-resume shape | integration | `cargo test -p gamelib-depot verify_only` | ❌ W0 |
| D-14 Tier 1 | synthetic fixture tree SHA1 == `expected.json` produced by TS oracle; modes match | golden | `cargo test -p gamelib-depot --test golden`; Jest asserts TS==golden | ❌ W0 |
| D-14 Tier 2 | real corpus, same job to both pipelines, zero diffs (SHA1 per file, modes, attributes, ACF) | local, operator-assisted | sweep script (exit 0 clean / 1 diff / 3 no inputs; zero inputs fails) | ❌ W0; **manual-only**: needs a live Steam login (QR) and owned games |
| D-15 live | macOS `pnpm tauri:dev` install, pause/resume, cancel, sidecar restart mid-job, bridge install, redist job | manual UAT | UAT file per live-gate-contract-authoring; each item names the log line proving the Rust path ran | ❌ W0; manual-only |
| D-15 CI | static liblzma: built binary has no dynamic liblzma/zstd/zlib reference | CI check | step `otool -L` / `ldd` / `dumpbin /dependents` on `gamelib-depot-cli`; plus `cargo test` on 3 legs | ❌ W0 |
| D-16 | flag selects path; default; both paths never mixed in one job | Jest | `pnpm exec jest …depotPipelineFlag.test.ts` | ❌ W0 |
| D-17 | throughput within noise; peak RSS ≤ post-fix Node pool | local benchmark | harness reuse of 067a (`run.sh`) against the Rust path, same connection | manual-only (network-dependent) |
| Wiring | channel constants == `OPS` == match arms; schemas for 3 shell channels; generated contract fresh | Jest + cargo | `pnpm exec jest src/backend/sidecar/__tests__/transportParity.test.ts depotChannelParity`; `pnpm check:ipc-contract` | ✅ transportParity / ❌ depotChannelParity W0 |
| Deletion | paths gone, forbidden symbols absent, exemptions present, `lzma`/`zstddec`/patches still present, ≥500-file walk | Jest | `pnpm exec jest src/backend/__tests__/depotPortComplete.test.ts` | ❌ W0 (authored in the delete plan) |
| Lockfile pin | new crate names listed | Jest | `pnpm exec jest src/backend/__tests__/cargoFeatures.test.ts` | ✅ (update) |
| Exit contract | started-then-EOF job: sidecar exits by drain, fake HOME | smoke | `pnpm smoke:sidecar` + a fake-HOME case via `createFakeHomeProfile()` | ✅ partial |

### Sampling Rate
- **Per task commit:** `cd src-tauri && cargo test -p gamelib-depot` and affected Jest files; `npx prettier --check <exact paths>` in every `<verify>`.
- **Per wave merge:** full suite above + clippy ratchet + `pnpm check:ipc-contract` + `pnpm find-deadcode`.
- **Phase gate:** full suite green, Tier 2 sweep clean, live UAT passed, three CI legs green, before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `src-tauri/crates/gamelib-depot/` and `gamelib-depot-cli/` skeletons with lints and workspace/lockfile updates, `rust-test.yml` `-p` entries
- [ ] Synthetic CDN fixtures: test-only encoders for zip/VZ/VSZa/AES, manifest builder (prost), local HTTP server, fake `JobHost`
- [ ] TS oracle generator that writes `expected.json` (tree SHA1, modes, ACF text) from the current TS pipeline over the same fixtures (must land **before** any TS deletion)
- [ ] Ported unit vectors from `hostHealth.test.ts`, `inflightLimiter.test.ts`, `reconcile.test.ts`, `pathCollisions.test.ts`, `flagsCensus.test.ts`, `fileAttributes.test.ts`, `manifest.test.ts`, `depot.finalize.test.ts`
- [ ] `depotRustErrorMap.test.ts` (D-09), `depotChannelParity.test.ts`, `depotPipelineFlag.test.ts`
- [ ] Tier 2 sweep script and the parity corpus selection (container histogram)
- [ ] Framework install: none (cargo and Jest already present)

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (CM auth stays in Node) | — |
| V3 Session Management | no | — |
| V4 Access Control | yes (path containment) | `resolve_contained_path`, symlink-target containment, numeric-only appId/depotId/gid guards |
| V5 Input Validation | yes | serde `deny_unknown_fields` on every wire type; numeric-id regex; `vdfEscape` for `name`/`installdir` in the ACF (WR-01); zstd footer size checked against `cb_original` before allocation; bounded manifest/section lengths |
| V6 Cryptography | yes | RustCrypto `aes`/`cbc`/`sha1`; never hand-rolled; sha1 of decompressed chunk and whole file is the integrity gate (Steam's manifest signature is not verified, matching TS) |
| V9 Communications | yes | rustls (ring) for https hosts; http for non-mandatory hosts is Valve-sanctioned and integrity is gated by chunk SHA1 |
| V12 Files | yes | tmp+rename ACF; refuse writes outside install root; no following pre-existing symlinks out of root |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal via manifest filename or symlink target | Tampering/EoP | `resolve_contained_path` on every filename; reject symlink targets that resolve outside the root (port `PathTraversalError` cases and tests) |
| Decompression bomb / oversize alloc from hostile chunk | DoS | check container-declared size == `cb_original` before allocating; cap output at `cb_original`; reject footer/header magic mismatch |
| Depot key or CDN token leak into logs/crash dumps | Info disclosure | redacting `Debug`, no job/event body logging, no keys in the on-disk manifest cache, `zeroize`-style handling optional |
| Forged frame on the shared stdout pipe (`sidecar-log-output-shares-the-rpc-stdout-pipe`) | Spoofing | `depot_*` channels only reachable as `rustInvoke` allow-listed names; Rust validates job via Args struct; installRoot must be re-contained against allowed roots by the shell arm (do not trust the path blindly: assert under a `steamapps` root or the bridge bottle root, like `rendererPathGuard`) |
| Malicious host redirect / mixed content | Tampering | host list is Node-supplied (CM directory); chunk SHA1 gate rejects altered bytes; do not follow redirects off-host (set `redirect(Policy::none())` and match TS behaviour) |
| Panic in a job thread kills the shell | DoS | `catch_unwind` in `dispatch` (63 contract), job errors are values; cancel_all on panic path |
| Hostile `installdir`/name in ACF | Tampering | keep `sanitizeInstalldir` in TS (resume.ts does) and `vdfEscape` in Rust |

## Sources

### Primary (HIGH confidence)
- Repository code read this session: `73-CONTEXT.md`; `src-tauri/crates/README.md`; `src-tauri/src/{sidecar.rs,shell_state.rs,relay_commands.rs,rust_dispatch.rs,scan_dispatch.rs}`; `src/backend/sidecar/{sidecarRpc.ts,ipcValidation.ts}`; `meta/genIpcContract.ts`; `.github/workflows/rust-test.yml`; `meta/clippyRatchet.cjs`; `steam/depot/{plan,planModel,download,downloadFiles,decompress,chunkDecode,outcome,finalize,manifest,fileAttributes,machO,reconcile}.ts`; `bridge/originalRestore.ts`; `library/resume.ts`; `depotErrors.ts`; `downloadmanager/installStallWatchdog.ts`; `patches/steam-user.patch`; `node_modules/steam-user/components/{cdn.js,cdn_compression.js,content_manifest.js}` and `protobufs/content_manifest.proto`; spikes 067a/067b/067c READMEs; `Skill("gamelib-conventions")`; spike-findings `steam-native-install.md`.
- Measured here (scratchpad builds): aes 0.9.4 + cbc 0.2.1 AES-256-CBC 15.3 GiB/s with no cfg; sha1 0.11 2.9 GiB/s; prost derive round-trip; zstd/xz2-static/flate2-zlib-rs link with no dynamic dependency (`otool -L`); reqwest 0.13 `rustls-no-provider` + ring GET over http and https with no `aws-lc-rs` in the tree.
- `lzma-sys-0.1.20/build.rs` (static feature always compiles vendored xz 5.2.5 via `cc`).
- crates.io API (versions, dates, downloads, MSRV), 2026-11-09.
- aes CHANGELOG (RustCrypto/block-ciphers): "Enable ARMv8 backend by default", edition 2024 / MSRV 1.85 in 0.9.0.

### Secondary (MEDIUM confidence)
- Web search on manifest request code rotation (SteamDB figure quoted secondhand, beta only): used only for A1.

### Tertiary (LOW confidence)
- A1, A5, A6 above.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — built, linked and measured on this machine; Windows/Linux builds unverified until CI.
- Architecture: HIGH — pipe primitives, channel registration path, consumers and deletion inventory were read from source.
- Pitfalls: HIGH for codebase-derived ones (1-4, 6-11, 13-14); MEDIUM for 5, 12 (need live measurement).

**Research date:** 2026-11-09
**Valid until:** 2026-12-09 (RustCrypto majors are moving; recheck `aes`/`cbc`/`sha1` versions and `Cargo.lock` before the first crate commit)
