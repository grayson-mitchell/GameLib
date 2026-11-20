# Phase 63: Rust migration pattern and executable scanners - Research

**Researched:** 2026-11-07
**Domain:** Cargo workspace restructure, sidecar-to-Rust `rustInvoke` seam, PE / Mach-O byte parsing in Rust, parity harness
**Confidence:** HIGH on the seam, workspace layout and caller inventory (all read from this repo or measured here). MEDIUM on objdump-vs-native import-table equivalence (only a real-game sweep settles it, per D-07).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Headless tool path and crate layout
- **D-01:** Headless Node tools reach Rust through a **standalone Rust CLI binary**. `meta/bridgeCensus.ts` (`pnpm bridge-census`) is one such tool: it runs under plain Node with no shell, so `rustInvoke` isn't available to it. The CLI takes a path and prints JSON. A permanent second TS implementation and a napi-rs native addon were both rejected, so in the end there is **one implementation, in Rust**.
- **D-02:** `src-tauri/` becomes a **Cargo workspace** with three members:
  - `gamelib-shell`, the existing app crate;
  - a **Tauri-free library crate** for the scanners (working name `gamelib-scan`), pure parsing with no Tauri dependency;
  - a thin **CLI bin crate** over the library.

  Later ports add sibling library crates the same way. This layout is part of the reusable pattern.
- **D-03:** **The app calls the scanners in-process through `rustInvoke`**, using the shell's existing sidecar to Rust request/response channel. Only headless tools spawn the CLI. Both paths use the same library crate.
- **D-04:** Anything in `meta/` (or `src/`) that spawns the CLI must use `createFakeHomeProfile()` under the fake-HOME convention (load `Skill("gamelib-conventions")`).

#### importScan / objdump
- **D-05:** The Rust port **parses the PE import and delay-import tables natively**. objdump stops being a runtime dependency of the scanner. `peSteamDrm.ts`'s `readPeImportedDllNames` and `readPeSteamApiDelayImports` are the existing native reference.
- **D-06:** **The whole import-closure walk moves to Rust.** That covers following dependent DLLs next to the exe (`scanImportClosure`). TS sends `{ exePath }` (plus the appId if Rust needs it) and receives the complete closure result in one round-trip. The fail-closed behaviours carry over, including the T-51-06 typed error when both `steam_api.dll` and `steam_api64.dll` show up.
- **D-07:** If native parsing and the old objdump-based TS result disagree on a real game, **treat it as a parity failure to investigate**. objdump is not assumed to be correct. That scanner's flag stays on `ts` until the cause is understood and written down.

#### Boundary and signatures
- **D-08:** The boundary sits at **caller-facing entry points**, with one async `rustInvoke` channel per operation, a path going in and a small result coming out. Candidates are `scanSteamApiImports`, a path-based Steam DRM detect, the PE machine arch, the PE imported DLL names, the steam_api delay imports, SteamStub section detection, `detectLaunchDrmWrapper`, `containedGameExeReal` and `checkWinemacMetalViewExports`. The planner settles the final list. The `Buffer`/`PeReader`-taking helpers become Rust internals, and **bytes never cross the JSON-lines pipe**. Neither a single "scan everything" channel nor a 1:1 mirror of every helper was chosen.
- **D-09:** **Sync callers become async.** The roadmap's "TypeScript function signature unchanged" is relaxed to: same name and result type, now `Promise`-returning and path-based. Today's sync call sites are:
  - `shimGenerate.ts:525`: `hasSteamStubSection(parsePeSectionNames(buf))`
  - `shimGenerate.ts:606`: `detectSteamDrmInPe(reader)`
  - `gameLaunch.ts:809`: `detectSteamDrmInPe(reader)`
  - `gameMakerRunner.ts:87`: `readPeImportedDllNames(reader)`
  - `dxmt.ts:152` and `dxmt.ts:217`: `checkWinemacMetalViewExports`
  - `meta/bridgeCensus.ts:1439` and `:2216`: `readPeSteamApiDelayImports` and `detectSteamDrmInPe`. These go through the CLI.

  The roadmap names `steam/games.ts` as a caller. After phase 62's split, the DRM call sites are in `gameLaunch.ts` and `gameBridgeLaunch.ts`.
- **D-10:** Rust must keep the security properties the TS code enforces. That means `containedGameExeReal`'s game-folder containment and realpath check, the numeric-appId check (T-24-06), and the bounded reads (`PE_SECTION_SCAN_BYTES`, `MAX_PE_SECTIONS`).

#### Fallback flag and parity
- **D-11:** **A flag per scanner** (shape like `scanners.<name>: 'rust' | 'ts'`). Each scanner's flag **defaults to Rust once that scanner's parity passes**, and a scanner that fails parity can be held on `ts` alone. The flag is dev/advanced only and not shown in the normal UI.
- **D-12:** **The parity harness has two tiers:**
  1. Small synthetic or crafted PE and Mach-O fixtures, committed to the repo, run in CI through `cargo test` and a TS-vs-Rust parity test. They cover SteamStub sections, CEG resource names, delay imports, both-arch `steam_api` imports, truncated or malformed headers, x86/x64 and the winemac Metal exports.
  2. A local-only sweep over every installed game exe on this machine, shaped like bridge-census, that diffs TS against Rust per scanner. **Game binaries are never committed.**
- **D-13:** **"Verified live" means all of the following:**
  - the local sweep shows zero TS/Rust diffs;
  - a live `pnpm tauri:dev` smoke on the Rust path exercises every caller: shim generation, the GameMaker runner, the DRM checks in `gameLaunch`/`gameBridgeLaunch`, and the DXMT Metal check.

  Once that holds, **the TS scanners and their flags are deleted inside this phase**. Restart dev so the sidecar is rebuilt (`tauri dev` doesn't rebuild it).

### Claude's Discretion
- How headless tools get the CLI built: build on demand with incremental `cargo build`, or use a prebuilt binary with a staleness check. Either way, fail clearly when cargo or the binary is missing. The user declined to choose.
- Whether the Jest tests for TS callers mock the async scanner boundary or spawn the real CLI. Mocking keeps Jest free of a Rust toolchain. The user declined to choose.
- Crate and channel naming, the JSON result shapes (they mirror the existing TS result types), running the scans off the async runtime (e.g. `spawn_blocking`), whether the `rustInvoke` 60 s timeout needs an `UNBOUNDED_RUST_CHANNELS`-style exception for large closure walks, and keeping the workspace building on all three CI legs (macOS, Linux, Windows).
- Whether objdump can be dropped from any bundle or doc once `importScan` is verified on Rust.

### Deferred Ideas (OUT OF SCOPE)
- The Steam depot download pipeline in Rust (migration step 2). It waits on its own spike, which is out of scope here.
- Reviewed todos not folded: `todo.match-phase 63` keyword-matched 21 pending todos (e.g. "x86 shim parity for the modern SteamInternal_* family", "Extend the clippy ratchet to the Windows leg"). None is about porting the scanners.
</user_constraints>

<phase_requirements>
## Phase Requirements

No requirement IDs are assigned (Requirements: TBD). Derived must-haves, for the planner to map plans onto:

| ID (derived) | Description | Research Support |
|----|-------------|------------------|
| M-1 | Workspace restructure; app, CI, clippy ratchet, tauri dev/build keep working | Section "Cargo workspace" |
| M-2 | Tauri-free `gamelib-scan` lib + thin CLI over one shared `dispatch()` | "Architecture Patterns" |
| M-3 | One `rustInvoke` channel per operation, allow-list on both sides, parity test green | "rustInvoke seam" |
| M-4 | Native PE (import, delay-import, sections, CEG resources) and Mach-O readers, bounded reads, fail-closed | "Rust parsing approach" |
| M-5 | Async path-based TS wrappers; every D-09 caller migrated | "Caller inventory" |
| M-6 | Per-scanner `rust`/`ts` flag, default `rust` once parity passes | "Flag" |
| M-7 | Tier-1 committed fixtures + goldens (`cargo test` + Jest); tier-2 local sweep script | "Parity harness" |
| M-8 | Census uses the CLI under `createFakeHomeProfile()` | "Headless CLI" |
| M-9 | Live gate, then TS parsers + flags deleted; pattern written up for the depot port | "Validation Architecture" |
</phase_requirements>

## Summary

The work is lower-risk than the scope suggests because the seam is already built and the workspace move is nearly free. **The app crate can stay exactly where it is** (`src-tauri/Cargo.toml` becomes the workspace root *and* keeps its `[package]`), with `crates/gamelib-scan` and `crates/gamelib-scan-cli` added as members. I proved this in a scratch copy: `cargo metadata --offline` resolves it, `Cargo.lock` stays in `src-tauri/`, the target dir stays `src-tauri/target`, the only lockfile diff is the two new package names, and `cargo build -p gamelib-scan-cli` compiles in about 3 s without touching Tauri. Nothing in `tauri.conf.json`, `build.rs`, the `build:sidecar*`/`tauri:dev` scripts, `sidecar.rs`'s `CARGO_MANIFEST_DIR/../build/main/sidecar.js`, rust-cache's `./src-tauri -> target`, or the release workflow has to change. What *does* silently stop covering the new code is anything that relies on cargo's default member: `cargo test --bin gamelib-shell` and `cargo clippy --all-targets` run in `src-tauri/` select only the root package, so the new crates need explicit `-p`/`--workspace` steps in `rust-test.yml`.

The `rustInvoke` seam needs no new mechanism. Every request is already handled on its own `std::thread::spawn` worker (`sidecar.rs:511`), not on the reader thread or an async runtime, so a blocking scan needs no `spawn_blocking`. A new channel is: a `RUST_*` const plus an entry in `RUST_INVOKE_CHANNELS` (`sidecarTransport.ts`), and a string-literal arm in `dispatch_rust_channel` (`store_embed.rs:1810`); `transportParity.test.ts` fails on any drift in either direction. The 60 s timeout is ample (header reads of a few KB, at most 32 followed DLLs) and no unbounded exception is warranted.

The real design risks are not plumbing. They are: (1) `importScan` is **not** a straight port. The native code must enumerate import-table *symbols*, which no existing TS reader does (`readPeImportedDllNames` reads DLL names only), and it must reproduce the quirks of text parsed from Apple's `/usr/bin/objdump`; (2) `detectLaunchDrmWrapper` depends on `findUnrealLayout` in `bridgeScan.ts`, which is outside the port list; (3) the census runs its **own** objdump scan with no closure walk, so `importParse.ts` cannot be deleted; (4) `cargoFeatures.test.ts` pins the exact crate-name set of `Cargo.lock`, so the two new package names must be added to that pin in the same commit.

**Primary recommendation:** Keep `gamelib-shell` at the `src-tauri/` root as workspace root; add `crates/gamelib-scan` (hand-rolled PE and Mach-O parsing, zero new third-party crates, ranged `Read+Seek` access) and `crates/gamelib-scan-cli`; expose one `gamelib_scan::dispatch(op, args)` used by both the shell's `rustInvoke` arms and the CLI; keep thin async TS wrappers at the existing module paths so the existing `jest.mock` sites keep working; verify with committed synthetic fixtures plus TS-generated golden JSON, then a local sweep, then delete the TS parsers.

## Project Constraints (from CLAUDE.md)

- **Conventions skill** (`gamelib-conventions`, loaded): (a) spawn from `src/`/`meta/` uses `createFakeHomeProfile()`, never a hand-rolled env literal; isolated by default plus a named justified real-profile arm; `fakeHomeIsolation.test.ts` enforces in-repo spawn sites. (b) Sidecar handles must be `unref()`'d and no unbounded in-flight work at boot (a new wrapper creates no timers; `requestRustInvoke`'s own timer is already `unref()`'d). (c) Every task `<verify>` runs `npx prettier --check` over exact paths written (check `--file-info` first; omit when all paths are prettier-ignored, e.g. `.rs`/`.toml` are not prettier targets, so say so rather than carry a green that proves nothing). (d) Todos need `severity:`/`platform:`/`ready:` frontmatter. (e) UAT item shape.
- **Fake HOME hides `~/.cargo` and `~/.rustup`** (`meta/clippyRatchet.cjs` header states this). So `cargo build` must NOT run under a fake profile; only the *built binary* does. See "Headless CLI".
- `tauri dev` does not rebuild the sidecar (memory): restart dev before live-testing any TS wrapper change. Dev launch is `pnpm tauri:dev`, never `tauri:dev:run`.
- Fresh worktree needs `build:sidecar-sea` + `vite build` before `cargo`/tauri (memory) - relevant to `cargo test` for the shell crate only; the new crates need neither.
- GameLib is not a Heroic-tracking fork: do not raise upstream-mergeability concerns.
- Steam stack is frozen (STEAM-STACK.md); this phase touches none of it.
- GSD workflow: edits go through a GSD command; GSD commands use a hyphen (`/gsd-execute-phase`).
- Orientation uses `graphify query`; never read `GRAPH_REPORT.md` or `graph.json`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| PE/Mach-O byte parsing, closure walk, realpath containment | Rust library (`gamelib-scan`) | - | Single implementation (D-01). Pure, Tauri-free, unit-testable with `cargo test`. |
| App-side invocation | Rust shell (`dispatch_rust_channel` arms) | Node sidecar (async TS wrapper) | D-03. Shell arms are one-liners over `gamelib_scan::dispatch`. |
| Headless invocation | Standalone CLI binary | `meta/` TS spawn helper | D-01/D-04. Same `dispatch` function. |
| Orchestration needing TS-only knowledge (`findUnrealLayout`, logging, flag resolution) | Node sidecar (TS) | - | Logger (`LogPrefix.Steam`) and `bridgeScan.ts` live in TS. Rust returns `diagnostics` the TS wrapper logs. |
| appId validation (T-24-06) | Rust (authoritative) + TS pre-check retained | - | Reject before any file read, both sides. |
| Scanner flag (`rust`/`ts`) | Node sidecar config | - | Dev/advanced only; Rust never reads it. |
| Parity oracle / sweep | Node (`meta/`) | Rust CLI | TS oracle exists only until deletion. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Rust toolchain | 1.99.1 local (cargo 1.99.1, rustc 1.99.1) [VERIFIED: `cargo --version` on this machine]; clippy pinned 1.99.1 in CI | Build | Already the repo's pinned clippy toolchain. |
| `serde` 1 (derive), `serde_json` 1 | already in `src-tauri/Cargo.toml` | Result/arg (de)serialisation | Already direct deps of the shell, so **no new crate names enter `Cargo.lock`**. |
| (no PE/Mach-O parsing crate) | - | Hand-rolled readers over ranged `Read + Seek` | See "Rust parsing approach". |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `tempfile` | already in `Cargo.lock` (transitive) | dev-dependency for filesystem tests (closure walk, containment, symlink escape) | Tests only. Declaring it as a dev-dep adds no new crate name to the lock. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled readers | `object` 0.40.0, `goblin` 0.10.7, `pelite` 0.10.0 [VERIFIED: `cargo search` on crates.io, 2026-11-07] | See below. Rejected for this phase. |
| `std::fs::canonicalize` | `dunce` crate | `dunce` would add a lock entry; a 5-line verbatim-prefix strip is enough (bridge is macOS-only in practice, Windows leg only compiles/tests). |

**Installation:** none. No external packages are added (workspace path crates only).

**Version verification:** `cargo search object|goblin|pelite` run 2026-11-07 returned the versions above. They are listed only as the *rejected* alternatives; nothing is installed.

## Package Legitimacy Audit

No external packages are recommended for installation; the audit table is therefore empty by design.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| (none added) | - | - | - | - | n/a | The two new crates are in-repo path crates; `serde`/`serde_json`/`tempfile` are already in `Cargo.lock`. |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none
*`object`/`goblin`/`pelite` appear above only as rejected alternatives and carry `[ASSUMED]` for anything beyond their existence and version.*

### Rust parsing approach: recommendation = hand-rolled port

Reasons, in order of weight:

1. **Behavioural parity is the acceptance test (D-07, D-12).** The TS readers have specific, deliberate quirks the library crates would not reproduce: any short read means `parsed: false` for the whole scan (all-or-nothing, never partial); RVA-to-offset uses `VirtualSize` with a `SizeOfRawData` fallback when `VirtualSize == 0` (53-15: Godot `pck` overlay fix); sections capped at 96, directory entries at 4096, name units 256, delay descriptors 256, delay thunks 4096, import descriptors 1024; resource subdirectories must have non-zero relative offsets (cycle guard); the delay-import "attributes bit 0 clear means VAs" rule. A line-for-line port reproduces them; a library would need wrapping and still differ on malformed input.
2. **Bounded reads (D-10).** The scanners read through ranged callbacks and never slurp an exe (T-br4-02). `object` and `goblin` parse a `&[u8]`, which means reading or mmapping the whole file; game exes are routinely hundreds of MB. A hand-rolled reader over `Read + Seek` keeps the 8 KiB / ranged-read property. [ASSUMED: neither crate offers a ranged-reader API; I did not verify their docs, but this does not change the recommendation because of reasons 1 and 3.]
3. **No new supply chain.** `cargoFeatures.test.ts` pins every crate name in `Cargo.lock` after a past silent-feature-flip incident (AR-34.1-07). Hand-rolling keeps that pin to exactly `gamelib-scan` and `gamelib-scan-cli`.
4. **Size is small.** PE parts are about 400 TS lines of straight-line arithmetic; Mach-O is about 70.

Mach-O (`machoExports`) is read whole in TS today (`readFileSync` of `winemac.so`, a few MB). The Rust port may `fs::read` it; keep the same `buf.len() >= 32` and bounds checks, fat-binary handling that selects only `CPU_TYPE_X86_64`, and return `None` for anything unsupported.

## Cargo workspace restructure

**Recommended layout (lowest churn):**

```
src-tauri/
├── Cargo.toml            # [package] gamelib-shell (unchanged) + NEW [workspace] members
├── Cargo.lock            # unchanged location; gains 2 package names
├── build.rs, tauri.conf.json, src/, binaries/, target/   # unchanged
└── crates/
    ├── gamelib-scan/       # lib, Tauri-free
    └── gamelib-scan-cli/   # bin, thin
```

Append to `src-tauri/Cargo.toml` (placement among the existing sections is free):

```toml
[workspace]
members = ["crates/gamelib-scan", "crates/gamelib-scan-cli"]
resolver = "2"
```

[VERIFIED: scratch-copy experiment on this machine]: `cargo metadata --offline` reports `workspace_root = <copy>`, `target_directory = <copy>/target`, members `gamelib-scan`, `gamelib-scan-cli`, `gamelib-shell`, and `workspace_default_members = [gamelib-shell]`. The lockfile diff was exactly `gamelib-scan` and `gamelib-scan-cli`. `cargo build -p gamelib-scan-cli --offline` took 3.1 s and compiled neither Tauri nor `tauri-build`.

Why not move the app into `crates/gamelib-shell/` (a literal reading of "three members")? It would break `sidecar.rs:38` (`CARGO_MANIFEST_DIR/../build/main/sidecar.js`), `tauri.conf.json` relative paths (`../build/renderer`, `../build/locales/`, ...), `binaries/gamelib-sidecar`, `capabilities/`, `icons/`, the `Cargo.lock` pin test path, the Tauri CLI's `src-tauri` discovery, two CI `working-directory: src-tauri` steps, and rust-cache. The root-package form satisfies D-02 (gamelib-shell **is** a workspace member) with none of that. Recommend it and record it as the pattern: *"the app crate stays the workspace root; each port adds `crates/<name>` siblings."*

### Every place that assumes the crate at the root: audited

| Place | Assumption | Effect of root-package workspace | Action |
|-------|-----------|----------------------------------|--------|
| `tauri.conf.json`, `build.rs`, `capabilities/`, `icons/` | paths relative to `src-tauri/` | none | none |
| `sidecar.rs:38` | `env!("CARGO_MANIFEST_DIR")/../build/main/sidecar.js` | `CARGO_MANIFEST_DIR` is still `src-tauri/` | none |
| `package.json` `tauri:dev:run` (`tauri dev`), `tauri:dev:packaged` (`tauri build --debug`) | Tauri CLI locates `src-tauri/` | unchanged; `tauri build` builds the root package only, so the CLI binary is **not** bundled (intended: headless tools only) | none. Verify once in the live smoke that `tauri dev` rebuilds when `crates/gamelib-scan/src/*` changes [ASSUMED: tauri-cli watches workspace members via cargo metadata; unverified, MEDIUM]. |
| `build:sidecar`/`build:sidecar-sea` | esbuild of `src/sidecar/index.ts` | unrelated | none |
| `rust-test.yml` `cargo test --bin gamelib-shell` (cwd `src-tauri`) | default member | still runs, **but covers only gamelib-shell** | add `cargo test -p gamelib-scan -p gamelib-scan-cli` step on both legs (Windows, macOS). These two crates need no vite build, no sidecar placeholder, no webkit, so they can also run on a Linux leg (the existing Linux exclusion, caveat (a), is about the shell crate). |
| `rust-test.yml` clippy ratchet: `cargo +1.99.1 clippy --all-targets --message-format=json` | default member only | new crates are **unlinted** | change to `cargo +1.99.1 clippy --workspace --all-targets ...`. `meta/clippyRatchet.cjs` requires a `gamelib-shell` compiler-artifact and an equality ceiling per lint; new crates must start at 0 warnings so ceilings do not move. Run the ratchet locally before and after and expect identical counts. Update `meta/__tests__/clippyRatchet.test.ts` only if its fixture assumes one package. |
| `[lints.clippy]` (`dbg_macro`, `todo` = deny) in root | per-package table | new crates do not inherit | repeat the two deny lines in each new crate's manifest (or hoist to `[workspace.lints]` + `[lints] workspace = true` in all three; either is fine, hoisting touches the root so prefer repeating). |
| `[profile.release]` (`opt-level="s"`, `lto`, `strip`) | profiles are root-only | applies to the CLI in `--release` | CLI should be built in **debug** (header reads are tiny) so no LTO cost. |
| `swatinem/rust-cache` `workspaces: './src-tauri -> target'` (rust-test and release-tauri) | target dir at `src-tauri/target` | unchanged | none |
| `release-tauri.yml` | `tauri-action` builds root package | unchanged | none |
| `src-tauri/.gitignore` `/target` | | covers workspace target | none |
| `src/backend/__tests__/cargoFeatures.test.ts` | pins `Cargo.lock` crate-name set (`EXPECTED_LOCKFILE_CRATE_NAMES`, sorted) | **goes red** | add `"gamelib-scan"` and `"gamelib-scan-cli"` in sorted position in the same commit. Also re-read the Cargo.toml `keyring`/`tauri` regex tests: they match `name = {` lines in the root manifest only, so a `[workspace]` table is harmless. |
| `src/backend/__tests__/quitTeardownWiring.test.ts` etc. | read `src-tauri/Cargo.toml` / `src/*.rs` text | unchanged | none |
| `transportParity.test.ts` | reads `src-tauri/src/*.rs` top level only | new crates under `crates/` are not scanned (correct); arms must stay string-literal arms in `store_embed.rs` | see seam section |
| `meta/knipRatchet.cjs` / `knip` | TS only | new `meta/` TS helper must be reachable from an entry point or counted | add it as used (imported by the sweep/census) |
| `Cargo.toml` `rust-version = "1.77.2"` | MSRV for the shell | `clippy::incompatible_msrv` already has 1 ceiling | set `rust-version = "1.77.2"` on new crates; avoid std APIs newer than 1.77 (e.g. prefer `Path::strip_prefix`, `File::read_exact`, `seek`), or the lint count would rise and fail the ratchet. |

## Architecture Patterns

### System Architecture Diagram

```
                      App path (D-03)                                   Headless path (D-01)
                                                                        
 shimGenerate / gameLaunch / gameBridgeLaunch /                  meta/bridgeCensus.ts, meta/scannerParitySweep.ts
 gameMakerRunner / dxmt                                                          |
        |  await scanX(path)                                                     |  spawn (fake HOME, argv-form)
        v                                                                        v
 TS wrapper (same name/type, async)  --flag 'ts'-->  TS legacy impl      gamelib-scan-cli <op> <json-args>   (or NDJSON on stdin)
        | flag 'rust'  (default)                      (deleted at end)             |
        v                                                                        |
 requestRustInvoke(RUST_SCAN_*, [args]) ----JSON line---> sidecar.rs thread::spawn |
        ^                                                       |                  |
        | response {id, ok, result}                             v                  v
        |                                      store_embed.rs dispatch_rust_channel arm  -->  gamelib_scan::dispatch(op, &args)
        +-------------------------------------------------------------------------------<-- Result<Value,String>
                                                                        |
                                                  gamelib-scan: ranged Read+Seek --> PE / Mach-O readers --> typed result (+ diagnostics[])
                                                                        |
                                                              std::fs (realpath, open, read ranges)
```

### Recommended project structure

```
src-tauri/crates/gamelib-scan/
├── Cargo.toml                 # no tauri dependency; serde, serde_json; dev: tempfile
├── src/
│   ├── lib.rs                 # pub fn dispatch(op:&str,args:&[Value])->Result<Value,String>; pub const OPS
│   ├── reader.rs              # trait/struct for ranged reads: Option<Vec<u8>>, short read = None (mirrors PeReader)
│   ├── pe/{mod,sections,imports,delay,resources}.rs
│   ├── macho.rs
│   ├── contain.rs             # realpath + strict containment
│   └── closure.rs             # scanImportClosure + scan_steam_api_imports
└── tests/
    ├── fixtures/*.bin + expected.json   # committed, synthetic
    └── golden.rs
src-tauri/crates/gamelib-scan-cli/src/main.rs   # argv/NDJSON -> dispatch -> JSON on stdout
src/backend/storeManagers/steam/bridge/scanners/  # (or keep wrappers at the old paths; see below)
meta/scannerParitySweep.ts, meta/gamelibScanCli.ts (resolve + spawn helper)
```

### Pattern 1: one `dispatch()`, two front ends (the reusable pattern)

**What:** The library exposes `dispatch(op, args) -> Result<Value, String>` and `OPS: &[&str]`. The shell's `dispatch_rust_channel` has one literal arm per op calling `gamelib_scan::dispatch("op", args)`. The CLI calls the same function. Op names equal channel names.
**Why:** guarantees D-03's "both paths use the same library"; the argument/result JSON is identical on both paths, so a CLI-driven sweep is evidence about the in-app path. A depot port copies it: new crate `gamelib-depot`, new ops, same shape.
**Shell arm shape** (matches `wake_lock_*`; the arm opener must stay one line ending `=> {` because several main.rs source-scan tests look for that shape):

```rust
// Source: pattern of "wake_lock_start" arm, src-tauri/src/store_embed.rs:4486
"scan_pe_delay_imports" => {
    gamelib_scan::dispatch("scan_pe_delay_imports", args)
}
```

**Rules for `dispatch`:**
- Bad arguments return `Err("scan_x:bad-args")` (house style `wake_lock_start:bad-args`). **Not-a-PE, truncated, or unreadable are results, not errors**: `{parsed:false,...}`, `null`, or the typed `{status:'error', error}` the TS code already returns. A rejected `rustInvoke` should mean transport failure only.
- Single JSON object argument per op (`args[0]`), parsed with `serde_json::from_value` into a struct with `#[serde(deny_unknown_fields)]`.
- Results must serialise to the same shape as the TS types: `camelCase` (`#[serde(rename_all = "camelCase")]`), `Option::None` as `null`, and `delaySymbols` must be **absent, not `[]`** when there are no steam_api delay imports (`#[serde(skip_serializing_if = "Option::is_none")]`). The TS `ImportScanResult` comment calls this out explicitly.
- Add `diagnostics: Vec<{level:'info'|'warn', message}>` to results that TS currently logs (importScan, drmScanExe). Rust has no access to the sidecar logger (`LogPrefix.Steam`); the TS wrapper forwards diagnostics to `logWarning`/`logInfo` with the identical message text, so existing log lines survive.

### Pattern 2: keep thin async wrappers at the existing module paths

The repo has roughly 20 `jest.mock('../importScan' | '../machoExports' | '../peSteamDrm' | '../drm/drmScanExe')` and `jest.spyOn(drmScanExe, 'detectLaunchDrmWrapper')` sites (stageDrmBottle, drmScanExe, originalRestore, shimGenerate, games, dxmtExportGate, dxmtBootFetch tests, plus `games.test.ts` `mockReturnValue` on `detectSteamDrmInPe`). Keeping the **function names and module paths** (D-09: "same name and result type, now `Promise`") means those mocks keep working; only `mockReturnValue(x)` becomes `mockResolvedValue(x)` where the function turned async (`detectSteamDrmInPe`, `checkWinemacMetalViewExports`, `readPeImportedDllNames`, `detectDrmWrapper`). What D-13 deletes is the **parsing code and the `ts` branch**, not the module entry points. `bridgeScan.ts` already abstracts the import scan behind `BridgeScanDeps.scanImports: (exePath) => Promise<BridgeImportScan>`, which stays unchanged.

### Pattern 3: per-scanner flag

`resolveScannerImpl(name): 'rust' | 'ts'` in one small TS module. Recommended source of truth: an optional hidden `scanners?: Partial<Record<ScannerName,'rust'|'ts'>>` on `AppSettings` (never rendered; `src/common/types.ts:112`), with an environment override `GAMELIB_SCANNER_<NAME>=ts|rust` for the live gate and the sweep (the repo already has many `GAMELIB_*` env switches). Default `'rust'` is shipped per scanner only after that scanner's sweep is clean (D-11); until then the default constant for that scanner is `'ts'`. Scanner names (one per channel group, so one can be held back alone): `peSections`, `importScan`, `peSteamDrm` (covers DRM detect, delay imports, imported DLL names), `drmScanExe`, `machoExports`. [ASSUMED: exact key names; planner may rename.]

While both exist the wrapper does `impl === 'ts' ? legacyTs(...) : rustInvoke(...)`. The legacy TS code remains an exported `*Ts` function so the sweep can call **both** regardless of flag.

### Recommended channel list (final list is the planner's per D-08)

| Channel (`RUST_*` const / string) | Args (`args[0]`) | Result | Replaces |
|---|---|---|---|
| `scan_steam_api_imports` | `{exePath, appId}` | `ImportScanResult` + `diagnostics` | `scanSteamApiImports` (incl. closure, D-06) |
| `scan_steam_drm` | `{exePath}` | `{parsed, cegMarkers, hasBindSection}` | `detectSteamDrmInPe` (callers: shimGenerate:606, gameLaunch:809, census) |
| `scan_steamstub_section` | `{exePath}` | `'steamstub'|'none'|null` | `detectDrmWrapper` = `hasSteamStubSection(parsePeSectionNames(first 8192 B))` (shimGenerate:525) |
| `scan_pe_imported_dlls` | `{exePath}` | `string[] | null` | `readPeImportedDllNames` (gameMakerRunner:87). Also keeps `MAX_EXE_SCAN_BYTES` stat gate TS-side or in Rust (see pitfall 7) |
| `scan_pe_delay_imports` | `{exePath}` | `PeDelayImportResult` | `readPeSteamApiDelayImports` (census:1439) |
| `scan_contained_real` | `{exePath, rootDirOf?}` | `string | null` + diagnostics | `containedGameExeReal` and the `containedReal` leaf of `detectLaunchDrmWrapper` |
| `scan_winemac_metal_exports` | `{wineBundlePath}` | `WinemacMetalCheck` | `checkWinemacMetalViewExports` (dxmt.ts:152, :217) |

Not recommended as channels: `parsePeSectionNames` / `hasSteamStubSection` / `CEG_RESOURCE_NAMES` (internals); `readPeMachineArch` (**no production caller** - only its own tests; verified by grep over `src` and `meta`; port it only as an internal helper or drop it, a dead export would otherwise be re-created in Rust); `parseMachODefinedExternals` (internal); `detectSteamDrmInPeBytes` (test convenience).

**`detectLaunchDrmWrapper` decision (needs the planner's attention).** It composes `realpath containment` + `detectDrmWrapper` + `findUnrealLayout(bottleDir, dirname(exePath))` (async TS in `bridgeScan.ts`, not in the port list, uses `lstat` symlink checks and bottle containment) + the same for up to 8 sorted UE Shipping exes, with `deps.detect`/`deps.findUnreal` injection used heavily by `drmScanExe.test.ts` and spied in `shimGenerate.test.ts`. Rust cannot call back into TS. Two options:
  - **A (recommended):** keep `detectLaunchDrmWrapper` as a thin TS orchestrator (about 40 lines, no byte parsing) calling the two Rust leaves `scan_contained_real` and `scan_steamstub_section`, keeping `findUnrealLayout` in TS. Preserves ordering (UE layout is only probed when the launch exe is not steamstub), log lines, and the injected-deps test structure. Round trips are cheap (at most 1 + 2 x 8).
  - B: port `findUnrealLayout` to Rust too and send `{bottleDir, exePath}`. One round trip, but it enlarges scope (new lstat/symlink semantics, `isContainedWithin`) beyond "no new scanning capability".
Choosing A means `drmScanExe.ts` survives as orchestration while its realpath/containment and detection move to Rust. Document that in the plan so D-13's "TS scanners deleted" is read as "all byte-parsing and path-containment code deleted".

### Anti-Patterns to Avoid
- **Passing bytes over the pipe.** Even "just the first 8 KiB" violates D-08. Pass the path.
- **Letting rustInvoke rejection change behaviour.** Today `detectDrmWrapper` returns `undefined` on read failure, `scanSteamApiImports` returns `{status:'error'}`, `readPeImportedDllNames` returns `null`, `readLaunchExeCegMarkers` returns `[]` with a warning. A timed-out or rejected rustInvoke must map to the *same* fail-closed values in the wrapper (`try { await ... } catch { fail-closed }`). Never let a transport error throw into callers that previously could not throw.
- **Spawning the CLI from the app.** D-03: app = rustInvoke only.
- **Re-implementing path containment with string prefix.** Use `canonicalize` on both, then `Path::strip_prefix`, and require a non-empty remainder (strictly inside; `rel !== ''` in TS).
- **Running `cargo` under the fake profile.** It will not find `~/.cargo`/`~/.rustup`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON args/results | manual string building | `serde` derive + `serde_json` | Already in tree; avoids shape drift. |
| Channel allow-list sync | a new sync mechanism | `RUST_INVOKE_CHANNELS` + `transportParity.test.ts` | Already fails on drift in both directions. |
| Fake HOME env | env literal in the CLI spawn | `createFakeHomeProfile()` (`src/backend/testUtils/fakeHomeProfile.ts`) | `fakeHomeIsolation.test.ts` rejects hand-rolled literals. |
| Temp dirs in Rust tests | manual `std::env::temp_dir()` juggling | `tempfile` (already locked) | Cleanup on panic. |
| Per-request thread pool | `spawn_blocking`/tokio/rayon | the existing `thread::spawn` in `sidecar.rs:511` | Handlers already run off the reader thread and off any async runtime. |
| Staleness check for the CLI | mtime/hash logic | `cargo build` itself | Cargo's no-op rebuild is its own staleness check (about 0.2 s). |

**Key insight:** the novelty in this phase is *verification*, not mechanism. Every mechanism needed already exists in the repo.

## Runtime State Inventory

This is a port, not a rename, but one stateful consideration applies:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None. The scanners are stateless; persisted verdicts (`writeBridgeModeVerdict`, shim `drm` stamps) store results, not scanner identity. | None, but if native parsing changes a verdict for an installed title, the persisted verdict goes stale until the next scan: the sweep (D-12 tier 2) is what catches this before the flag flips. |
| Live service config | None | None |
| OS-registered state | None | None |
| Secrets/env vars | New optional `GAMELIB_SCANNER_<NAME>` override (not a secret) | none |
| Build artifacts | `src-tauri/target/debug/gamelib-scan-cli[.exe]` (new, gitignored under `/target`). The Node SEA sidecar embeds the TS wrappers, so **the sidecar must be rebuilt** after wrapper changes (`build:sidecar`); `tauri dev` does not do that. | Restart `pnpm tauri:dev`; check `build/main/sidecar.js` mtime (memory). |

## Common Pitfalls

### Pitfall 1: Native import-table parsing is new code and will differ from Apple objdump text
**What goes wrong:** `readPeImportedDllNames` returns only DLL names; `importScan` needs the **symbols** of the `steam_api(64).dll` block. No TS reader enumerates import-table symbols natively (the delay reader does, for the delay table). Meanwhile today's symbols come from regex-scraping `/usr/bin/objdump --private-headers` output (Apple LLVM objdump on this machine), with quirks that must be decided deliberately:
- ordinal-only imports print no identifier, so `TRAILING_IDENTIFIER` skips them (the delay reader instead emits `#<n>`);
- symbols are NOT de-duplicated within the block, and kept in table order; DLL-name dedupe (`parseImportedDllNames`) is case-insensitive, first spelling kept;
- the heading match is case-insensitive on the DLL name, ends the section at the next `DLL Name:`; the export table's `DLL name:` (lowercase n) must not count (uw-284100 incident);
- `conflict` = both steam_api.dll and steam_api64.dll headings.
**How to avoid:** Write the Rust walker to mirror the delay-table walker's bounds discipline (ILT/INT walk with the 4096 thunk cap, `u64` thunks for PE32+, ordinal bit handling, hint/name at `rva+2`), then **decide ordinal behaviour from the sweep** rather than guessing: if no real game has an ordinal steam_api import, document it and skip them to match objdump (D-07 says disagreement is a parity failure to write down, not to paper over). Build a new TS fixture builder for import tables with symbol thunks; the existing `fixtures/importPe.ts` builds DLL names only.
**Warning signs:** sweep diffs limited to `symbols` ordering, duplicates, or `#n` entries.

### Pitfall 2: The census has its own import scan, so `importParse.ts` cannot be deleted
`meta/bridgeCensus.ts:1478 scanImportsSync` runs its own `spawnSync('/usr/bin/objdump')` (a declared real-profile spawn) plus `parseSteamApiImportTable` and `readDelayImports`, with **no closure walk** and a different error vocabulary (`'objdump failed'`, `'conflict'`). D-09 routes only census lines 1439 (`readPeSteamApiDelayImports`) and 2216 (`detectSteamDrmInPe`) through the CLI. Consequently `importParse.ts` (`parseSteamApiImportTable`, `parseImportedDllNames`) and `fixtures/objdumpImports.ts` stay while the census keeps its objdump arm; `runtimeLoadedSteamApiMarker` from the same file is also used by `shimGenerate.ts:103`. Only `importScan.ts`'s objdump spawn and its two `importParse` imports go. **Decision for the planner:** either leave the census objdump arm as is (smallest) or add a `scan_steam_api_imports` call with a `closure:false` option and drop the census objdump spawn (then `importParse.ts` text parsers become deletable). Recommend the former for this phase; record the latter as follow-up.
Answer to the discretion item "can objdump be dropped from any bundle or doc": objdump is the macOS system binary, never bundled. After this phase the *app* no longer needs it (and Linux/Windows stop being unable to scan), but the census still does. Update `importScan.ts` header docs only; no bundle change.

### Pitfall 3: `readLaunchExeCegMarkers` and friends are exported sync helpers
`gameLaunch.ts:801 readLaunchExeCegMarkers(steamGame, exePath)` is sync, exported, and called at `gameLaunch.ts:777` and `gameBridgeLaunch.ts:225` (both inside async functions), plus likely tests. It becomes async; update both call sites with `await`. In `shimGenerate.ts:502` `detectDrmWrapper(fallbackReal)` is evaluated inside an object literal argument: hoist it to an `await` before the literal. `detectExeSteamDrm` (shimGenerate:598) is sync and called from async `placeShimForGame`; make it async and `await` at :496.

### Pitfall 4: Windows `canonicalize` returns `\\?\` verbatim paths
`containedGameExeReal` returns the *real* path and callers then scan it or compare lexical paths. On Windows `std::fs::canonicalize` yields `\\?\C:\...`. The bridge is macOS-only in practice [ASSUMED from project scope], but `cargo test` runs on the Windows leg. Compare both operands after the same `canonicalize` (so tests pass) and strip the verbatim prefix on output; add a `#[cfg(windows)]` unit test. Also `Path` to JSON needs UTF-8: return a typed non-UTF-8 failure as "unresolvable" (`null`), never lossy-convert a path you will later open.

### Pitfall 5: `cargoFeatures.test.ts` lockfile pin
Adding the two crates turns `Cargo.lock crate-name set` red until `EXPECTED_LOCKFILE_CRATE_NAMES` gains `"gamelib-scan"`, `"gamelib-scan-cli"` (sorted). Do it in the commit that creates the crates. Do not add a third-party crate casually: each addition also needs that pin updated and a supply-chain look.

### Pitfall 6: Default-members hide the new crates from CI
See the workspace table: `cargo test --bin gamelib-shell` and plain `cargo clippy` silently stop short of `crates/`. Add explicit steps; an assertion in the plan's verify step should be `cargo test -p gamelib-scan` (count > 0), not just exit 0.

### Pitfall 7: Behaviour split between TS pre-checks and the Rust scan
Keep, on the TS side, anything that is not parsing and that tests rely on: `NUMERIC_APP_ID` pre-check (`importScan.ts:206`, logs T-24-06), the `data.win` stat and `MAX_EXE_SCAN_BYTES` size gate plus the `GAMEMAKER_MSAA_PROBE` `buf.includes` in `gameMakerRunner.ts`. Note the last one **reads the whole exe into a Buffer** (`readFile`) for the MSAA byte search; moving only the DLL-name read to Rust does not remove that slurp. It is out of scope ("no new scanning capability") but worth a one-line note so nobody claims the whole detector became bounded. Re-check the numeric appId in Rust as well (defence in depth; D-10).

### Pitfall 8: `rustInvoke` outside the sidecar
`requestRustInvoke` writes a frame to stdout. It works only inside the sidecar. Jest must mock the wrappers (or `sidecarRpc`); `pnpm bridge-census` / the sweep never call the wrappers, they use the CLI. Add a guard: the sweep imports only the legacy `*Ts` functions and the CLI helper, not the flag-resolving wrappers.

### Pitfall 9: Sidecar exit contract
Wrappers add no timers/handles. `requestRustInvoke` already `unref()`s its 60 s timer. Do not add any boot-time scan or warm-up call. `pnpm smoke:sidecar` is the check; it misses slow exit, so also keep zero scanner work at import time.

### Pitfall 10: Thread-per-request cost in loops
`bridgeScan` scans up to `IMPORTER_SCAN_MAX_FILES = 512` PE files per game via `scanImports`, each now one rustInvoke (one OS thread each, sequential). That is fine functionally; measure once in the live smoke that a 512-file Unity/UE scan does not regress wall time versus objdump (it should be far faster, since it replaces 512 process spawns).

## Code Examples

### Ranged reader contract (mirrors `PeReader`: short read means failure)

```rust
// Source: port of peSteamDrm.ts PeReader/readExact (this repo)
pub struct RangedFile { f: std::fs::File, len: u64 }
impl RangedFile {
    /// None when the range runs past EOF or the read fails: the caller treats it as
    /// "not parsed" (exactly the TS `readExact` BoundsError path).
    pub fn read(&mut self, offset: u64, length: usize) -> Option<Vec<u8>> {
        use std::io::{Read, Seek, SeekFrom};
        let end = offset.checked_add(length as u64)?;
        if end > self.len { return None; }
        self.f.seek(SeekFrom::Start(offset)).ok()?;
        let mut buf = vec![0u8; length];
        self.f.read_exact(&mut buf).ok()?;
        Some(buf)
    }
}
```

Use `u64` offsets with `checked_add`; TS `Number.isSafeInteger` guards become `checked_*`. Make the in-memory test reader implement the same trait so fixtures and files exercise one code path.

### Typed args / result with TS-compatible JSON

```rust
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ScanImportsArgs { exe_path: String, app_id: String }

#[derive(serde::Serialize)]
#[serde(tag = "status", rename_all = "lowercase")]
enum ImportScanResult {
    Ok { arch: &'static str, dll: Option<String>, symbols: Vec<String>,
         #[serde(skip_serializing_if = "Option::is_none", rename = "delaySymbols")]
         delay_symbols: Option<Vec<String>> },
    Error { error: String },
}
```

### TS wrapper skeleton

```ts
// src/backend/storeManagers/steam/bridge/importScan.ts  (path kept; name and result type kept)
export async function scanSteamApiImports(appId: string, exePath: string): Promise<ImportScanResult> {
  if (!NUMERIC_APP_ID.test(appId)) { /* unchanged T-24-06 branch */ }
  if (resolveScannerImpl('importScan') === 'ts') return scanSteamApiImportsTs(appId, exePath)
  try {
    const r = (await requestRustInvoke(RUST_SCAN_STEAM_API_IMPORTS, [{ exePath, appId }])) as RustImportScan
    for (const d of r.diagnostics ?? []) (d.level === 'warn' ? logWarning : logInfo)(d.message, LogPrefix.Steam)
    return stripDiagnostics(r)
  } catch (error) {
    logWarning([`scanSteamApiImports: rustInvoke failed for appId ${appId}`, error], LogPrefix.Steam)
    return { status: 'error', error: `Rust scan failed: ${String(error)}` }
  }
}
```

### Spawning the CLI from `meta/` under a fake profile

```ts
// meta/gamelibScanCli.ts - usage per convention; cargo build is a SEPARATE real-env step
import { createFakeHomeProfile } from '../src/backend/testUtils/fakeHomeProfile'
const profile = createFakeHomeProfile({ prefix: 'gamelib-scan-' })
try {
  const r = spawnSync(cliPath, [op, JSON.stringify(args)], { env: profile.childEnv(), encoding: 'utf-8' })
  // exit code 0 + one JSON line on stdout; non-zero = usage error; never parse stderr as data
} finally { profile.dispose() }
```

The profile is per invocation by convention ("fresh profile per invocation, always"). For the sweep's thousands of calls use the CLI's **NDJSON batch mode** (one process, one fresh profile for the whole run, explicitly named in a comment as a single-process batch, not a reused profile) so the cost is one spawn, not one per exe.

## Headless CLI build strategy (discretion): recommendation

**Build on demand with plain `cargo build`; no prebuilt binary and no custom staleness logic.**
- package.json: `"bridge-census": "cargo build -p gamelib-scan-cli --manifest-path src-tauri/Cargo.toml && node meta/runTs.cjs ..."` (and the same prefix for the sweep script). Cargo's incremental no-op check *is* the staleness check; cold build measured about 3 s here.
- This runs in the operator's real environment (no fake HOME), since cargo needs `~/.cargo`/`~/.rustup`. That is not a convention violation: the rule covers spawns that read or write a *profile*; `cargo build` of this tree is not profile-dependent. State this in a comment.
- `meta/gamelibScanCli.ts` resolves `${CARGO_TARGET_DIR ?? 'src-tauri/target'}/debug/gamelib-scan-cli[.exe]` and, when missing, throws a clear message (`run: cargo build -p gamelib-scan-cli --manifest-path src-tauri/Cargo.toml; is cargo on PATH?`). Debug profile on purpose: `[profile.release]` is `opt-level = "s"` + LTO + strip, slower to build and irrelevant for header reads.
- The CLI is **not** bundled in the shipped app (`tauri build` builds the root package only).
- CLI contract: `gamelib-scan-cli <op> <json-args>` prints exactly one JSON value on stdout and exits 0; `gamelib-scan-cli --ndjson` reads one `{op,args}` per stdin line and writes one `{ok,result|error}` per line. Exit non-zero only for usage errors. Library `OPS` drives `--list`, which the Jest parity test can compare to the `RUST_SCAN_*` channel consts.

**Jest strategy (discretion): mock the async boundary; never spawn the CLI from Jest.** The Jest lane (`test.yml`, ubuntu, `pnpm test:ci`) has no Rust step and mocks are how all 20 existing consumers work. TS-side correctness vs Rust is covered by the committed-golden approach below, not by spawning.

## Parity harness

### Tier 1: committed synthetic fixtures + golden JSON (runs in CI)

Conflict to note: the existing TS tests state "no binaries are checked in" because fixtures are built in memory (`peSteamDrm.test.ts` `buildPe`, `fixtures/importPe.ts`, `fixtures/delayImportPe.ts`, `machoExports.test.ts` builders). D-12 says fixtures are committed. Reconcile with this design:

1. A generator script (`meta/genScanFixtures.ts`, run manually, output committed) reuses the TS builders (extract the local `buildPe` from `peSteamDrm.test.ts` into `__tests__/fixtures/` first) and writes `src-tauri/crates/gamelib-scan/tests/fixtures/<case>.bin` (each a few KB, **synthetic, no game bytes**).
2. The same script runs the **TS oracle** over each fixture and writes `expected.json`: `{ case: { op: result } }`.
3. `cargo test -p gamelib-scan` (tests/golden.rs) asserts Rust output equals `expected.json` for every fixture and op, on both CI legs.
4. A Jest test asserts the TS implementation equals the same `expected.json` (fails if the TS oracle drifts, which also proves the goldens are TS-derived). Because this uses committed files, **Jest needs no Rust toolchain** and no spawn. This Jest test is deleted with the TS parsers; the golden file and `cargo test` remain as the permanent regression.
5. Cases (from D-12): `.bind` section present/absent/`.binder`/`.BIND`; 96+ sections; CEG names (`STEAM_SPLIT_GUID`, `STEAM_GUIDD`, `STEAM_MINSTANCE`, lowercase variant, ids instead of names, self-referencing subdirectory, resource RVA outside every section, `resourceSize==0`); the 53-15 Godot `pck` overlay (large `SizeOfRawData`, `VirtualSize` 8); delay imports x86/x64, ordinal thunks, VA vs RVA (attributes bit 0), both-arch conflict, over-long name; import-table steam_api x86, x64, both-arch conflict (T-51-06), closure case; truncated at each header boundary, empty file, not-MZ, bad PE signature, unknown optional-header magic; Mach-O thin x86_64, fat with x86_64 slice, fat without it, truncated symtab, missing `_macdrv_functions` with and without the three alternate symbols, no `LC_DYSYMTAB`.
6. Closure and containment need a directory, so they are Rust `tempfile` tests (symlink escape, missing DLL, system-DLL skip, `..`/separator names refused, depth 2 and 32-DLL caps, case-insensitive dedupe) rather than golden files. Mirror the 12-plus cases in `importScan.test.ts`.

### Tier 2: local-only sweep (`pnpm scanner-parity-sweep`, shaped like bridge-census)

`meta/scannerParitySweep.ts`: reuses the census's bottle/exe enumeration (`findBridgeBottles`, `walkExes`, `isExcludedExeName` at `bridgeCensus.ts:1312-1400`; bottles under `~/Library/Application Support/CrossOver/Bottles`, so the enumeration itself needs the real HOME, a **named real-profile arm**, while the CLI runs under a fake profile). For each exe: run the legacy `*Ts` function and the CLI op, deep-compare, print per-scanner counts (`checked`, `equal`, `diff`) and, for diffs only, the op, a path hash or basename, and a compact JSON diff. Never write game bytes anywhere; the output is a console report, not committed. It must also sweep DLLs next to exes for the closure op, and (macOS only) `winemac.so` for installed Wine builds. Exit non-zero on any diff so D-13's "zero diffs" is a command's exit code. Export the diff function as a pure unit-testable helper with a `meta/__tests__` test (as `bridgeCensus.test.ts` does).

### Tier 3 (D-13 live gate): `pnpm tauri:dev` smoke on the Rust path

Exercise: (a) place a shim for a bridge game (shimGenerate: scan, SteamStub section, CEG detect); (b) GameMaker D3D11 runner detection on a GameMaker title; (c) launch a DRM-mode and an ordinary bridge title (gameLaunch, gameBridgeLaunch `detectLaunchDrmWrapper`, `readLaunchExeCegMarkers`); (d) DXMT Metal check (install or update a Wine-Staging-macOS build with DXMT: dxmt.ts:152 on `wineVersionInstalled`, :217 on boot). Capture the shell log lines (`diagnostics` forwarded through the sidecar logger) as evidence. Per memory, restart dev so the sidecar rebuilds; check `build/main/sidecar.js` mtime. Use the project's live-gate-contract authoring (`Skill("spike-findings-gamelib")`, `references/live-gate-contract-authoring.md`) for the UAT file shape.

## Caller and test inventory

Verified against the tree on 2026-11-07. D-09's list is correct; additions marked +.

| Caller | Site | Becomes |
|---|---|---|
| `shimGenerate.ts` | :482 `detectLaunchDrmWrapper`, :492 `containedGameExeReal`, :496 `detectExeSteamDrm` (+), :502 `detectDrmWrapper` (+), :525 `parsePeSectionNames/hasSteamStubSection` (D-09), :606 `detectSteamDrmInPe` (D-09), :822 and :882 `scanSteamApiImports` (+) | all async; :502 hoisted; :822 already `Promise` |
| `gameLaunch.ts` | :771 `detectLaunchDrmWrapper` (+), :777 and :801-809 `readLaunchExeCegMarkers`/`detectSteamDrmInPe` (D-09) | helper async, `await` at :777 |
| `gameBridgeLaunch.ts` | :212 `detectLaunchDrmWrapper` (+), :225 `readLaunchExeCegMarkers` (+) | `await` at :225 |
| `gameMakerRunner.ts` | :87 `readPeImportedDllNames` (D-09); keep `stat`/size gate and MSAA byte probe | async result |
| `tools/dxmt.ts` | :152 (inside async `wineVersionInstalled` handler), :217 (inside an async fn) | `await` |
| `bridge/bridgeScan.ts` | `BridgeScanDeps.scanImports` interface | unchanged |
| `meta/bridgeCensus.ts` | :1439 `readDelayImports`, :2216 `scanExeSteamDrm` (D-09); `runObjdump`/`scanImportsSync` stay (Pitfall 2) | CLI helper; both helpers become async/ batched (callers `scanImportsSync` is `Promise.resolve(sync)` today) |

Existing Jest coverage to migrate or convert to goldens: `bridge/__tests__/peSections.test.ts`, `peSteamDrm.test.ts` (readPeMachineArch block drops with the dead export), `importScan.test.ts` (spawnAsync-mocked; closure and conflict cases move to Rust tempfile tests), `drm/__tests__/drmScanExe.test.ts` (stays, with async deps), `tools/__tests__/machoExports.test.ts` (parser cases to goldens; the `checkWinemacMetalViewExports` fs cases to Rust tempfile tests), mocks in `dxmtExportGate.test.ts`, `dxmtBootFetch.test.ts`, `stageDrmBottle.test.ts`, `originalRestore.test.ts`, `shimGenerate.test.ts`, `shimCoverage.test.ts` (imports `parseSteamApiImports`; stays), `steam/__tests__/games.test.ts` (`detectSteamDrmInPe` `mockReturnValue` to `mockResolvedValue` at ~12917, 13066, 13101).

Result types the Rust JSON must mirror (from source):
- `PeSteamDrmResult { parsed: boolean; cegMarkers: string[]; hasBindSection: boolean }`, CEG match is `s.toUpperCase()` in the 3-name set, the marker pushed **as read** (original case), de-duplicated, file order; names are UTF-16 code units, `String.fromCharCode` (not UTF-8).
- `PeDelayImportResult { parsed; dll: 'steam_api.dll'|'steam_api64.dll'|null; arch: 'x86'|'x64'|'none'; symbols: string[]; conflict: boolean }`; the `dll`/`arch` rule when both present is x86 (`conflict: true`).
- `ImportScanResult = {status:'ok'; arch; dll: string|null; symbols; delaySymbols?} | {status:'error'; error}`; the three conflict error strings share `CONFLICTING_HEADINGS_ERROR`.
- `LaunchDrmWrapper { drmWrapper: 'steamstub'|'none'|undefined; drmExe }`: `undefined` serialises as absent/`null` over JSON, so the wrapper must map `null` to `undefined`.
- `WinemacMetalCheck = {ok:true} | {ok:false; winemacPath; reason; missing: string[]}` with the exact reason strings (`'winemac.so not found'`, `'could not read winemac.so: ...'`, `'winemac.so is not a parseable x86_64 Mach-O'`, `'winemac.so lacks the macdrv metal-view exports'`) and the `_macdrv_functions` OR "all three view symbols" rule. Mach-O `Err(...)` text will differ (`String(error)` is Node-specific); parity covers the other three exactly and treats the read-error text as free-form (documented, not diffed).

Security properties to carry (D-10), each needs a named Rust test: realpath of `dirname(exe)` is the root; candidate real path must be strictly inside it (symlink escape refused, equal-to-root refused); numeric appId check before any file open (reject `"1 2"`, `"../x"`, empty); `PE_SECTION_SCAN_BYTES = 8192` single-read cap for the steamstub check and `MAX_PE_SECTIONS = 96` (exact-count test with 97 sections); the peSteamDrm caps (4096 dir entries, 256 name units, 256 delay descriptors, 4096 thunks, 1024 import descriptors, 256-byte names); closure limits (`CLOSURE_MAX_DEPTH=2`, `CLOSURE_MAX_DLLS=32`; followable names exclude separators, `..`, SYSTEM_DLLS and `api-ms-`/`ext-ms-`; steam_api itself skipped; same-directory containment); never panics on hostile input (fuzz-ish loop over truncations of every fixture asserting no panic and a typed result).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single `src-tauri` crate | Root-package workspace with `crates/*` | this phase | Template for the depot port. |
| objdump subprocess + regex over text | native import/delay-import table walk | this phase (D-05) | Removes a macOS-only runtime dependency, 33 spawns per closure; new parity risk (Pitfall 1). |
| Sync byte-parsing in the sidecar event loop | async rustInvoke on its own thread | this phase | Frees the Node event loop during scans. |

**Deprecated/outdated:** `ts-prune` (replaced by knip, commit eb6019be5); comments in the TS files still say `ts-prune-ignore-next`, irrelevant once the code is deleted.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `tauri dev` (tauri-cli) rebuilds when a workspace member crate changes | Workspace table | Dev loop needs a manual `cargo build`; caught by the first live smoke. |
| A2 | `object`/`goblin` have no ranged-reader API (slice-based) | Parsing approach | Low: the recommendation also rests on quirk-parity and lockfile pinning. |
| A3 | The bridge/Wine path is macOS-only, so Windows `\\?\` canonicalize output is not user-facing | Pitfall 4 | If Windows ever runs the bridge, strip the prefix (already specified). |
| A4 | Scanner flag key names and storage (`AppSettings.scanners` plus `GAMELIB_SCANNER_<NAME>` env) | Pattern 3 | Cosmetic; planner may choose another dev-only store. |
| A5 | Real games have no ordinal-only steam_api imports (so skipping them matches objdump) | Pitfall 1 | Sweep will show diffs; resolved by D-07 investigation. |
| A6 | A Linux leg for `cargo test -p gamelib-scan` is feasible because the crates are Tauri-free | Workspace table | If a CI runner lacks cargo defaults, keep to the two existing OS legs. |

## Open Questions (RESOLVED)

1. **`detectLaunchDrmWrapper` placement (Option A vs B above).**
   - Known: depends on TS `findUnrealLayout`; tests inject `detect`/`findUnreal`.
   - Unclear: whether the user reads D-13 "TS scanners deleted" as including the orchestrator.
   - Recommendation: Option A (thin TS orchestrator, Rust leaves); state it in PLAN.md so it is not re-litigated.
   - RESOLVED: Option A. `detectLaunchDrmWrapper` stays a TS orchestrator over the Rust leaves `scan_contained_real` and `scan_steamstub_section`, and `findUnrealLayout` stays in TS. Confirmed with the user at the 63-11 checkpoint (plan 63-07).
2. **Census import scan: leave on objdump or move to CLI?** Recommendation: leave (Pitfall 2); `importParse.ts` stays.
   - RESOLVED: the census objdump arm stays. Only census lines ~1439/~2216 route through the CLI (plan 63-10).
3. **Ordinal imports in the static import table:** emit `#n` (like the delay reader) or skip (like the objdump regex)? Decide from the sweep (A5).
   - RESOLVED: skip ordinal-only static imports, matching objdump. The 63-11 sweep confirms this, and any diff is a D-07 finding (plan 63-05).
4. **`readPeMachineArch` has no production caller.** Recommend not porting it (delete with its tests); confirm with the user only if they want it kept for a future placer.
   - RESOLVED: not ported; it is deleted with `peSteamDrm.ts` (plan 63-02).
5. **Where the hidden flag lives** (AppSettings vs env only). Recommendation in Pattern 3.
   - RESOLVED: an env var (`GAMELIB_SCANNER_<NAME>`) plus a defaults table, with no AppSettings key. Listed at the 63-11 checkpoint (plan 63-02).
6. **Does the user want a Linux `cargo test` leg for the new crates?** Optional; cheap and a good template for later ports.
   - RESOLVED: no Linux leg. The crates are tested on the existing Windows and macOS legs, and clippy runs with `--workspace` (plan 63-01).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| cargo / rustc | build, tests, CLI | yes | 1.99.1 | none needed; CI installs `stable` and pins clippy 1.99.1 |
| `/usr/bin/objdump` (Apple LLVM) | TS oracle for sweep and census | yes | system | none; required for the tier-2 oracle only |
| Node / pnpm | Jest, `meta/` scripts | yes | v22.23.4 / 10.28.0 | n/a |
| CrossOver bottles (`~/Library/Application Support/CrossOver/Bottles`) | tier-2 sweep and live smoke | present on the operator machine per census design [ASSUMED: contents vary] | n/a | sweep reports "0 exes found" and exits non-zero to avoid a vacuous green |
| ctx7 / Context7 | docs lookup | not used | n/a | Std-only Rust; no library docs needed |

**Missing dependencies with no fallback:** none found.
**Missing dependencies with fallback:** none.

## Validation Architecture

(`.planning/config.json` was checked for `workflow.nyquist_validation`; the key is absent or enabled for this phase's purposes, so the section is included.)

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Rust built-in `cargo test` (new crates); Jest 29 + ts-jest (TS side, `Meta` project for `meta/`) |
| Config file | `src-tauri/Cargo.toml` (workspace); `jest.config.js` |
| Quick run command | `cd src-tauri && cargo test -p gamelib-scan -p gamelib-scan-cli` ; `pnpm exec jest <paths>` |
| Full suite command | `pnpm test:ci` plus `cd src-tauri && cargo test -p gamelib-scan -p gamelib-scan-cli && cargo test --bin gamelib-shell` |

### Decision to Check Map
| Decision | Behavior | Test Type | Automated Command | File Exists? |
|----------|----------|-----------|-------------------|-------------|
| D-02 workspace | members resolve; default member still gamelib-shell; lockfile = old + 2 names | meta | `cd src-tauri && cargo metadata --format-version 1 --no-deps` parsed by a Jest/Meta test; `cargoFeatures.test.ts` | pin test exists (update); metadata test Wave 0 |
| D-02/CI | new crates run in CI and clippy covers them | workflow gate | extend `meta/__tests__/ciTriggerWiring.test.ts`-style text test asserting `-p gamelib-scan` and `clippy --workspace` strings in `rust-test.yml` | Wave 0 |
| D-03 channels | every `scan_*` channel in `RUST_INVOKE_CHANNELS` and as a literal arm | unit | `pnpm exec jest src/backend/sidecar/__tests__/transportParity.test.ts` | exists |
| D-03 one impl | shell arms and CLI both call `gamelib_scan::dispatch`; `OPS` equals the channel set | unit | `cargo test -p gamelib-scan ops_list` + Jest comparing `cli --list` strings (static source read, no spawn) | Wave 0 |
| D-04 | CLI spawn sites use `createFakeHomeProfile` | gate | `pnpm exec jest src/backend/__tests__/fakeHomeIsolation.test.ts` | exists |
| D-05/D-06 | native import table + closure incl. T-51-06 conflict | unit | `cargo test -p gamelib-scan closure` (tempfile) | Wave 0 |
| D-07 | native vs objdump disagreement is surfaced | local sweep | `pnpm scanner-parity-sweep` (non-zero on any diff) | Wave 0 |
| D-08 | no bytes cross the pipe | static | Jest source test: no `readSync`/`Buffer` in wrappers, args are path objects | Wave 0 |
| D-09 | every caller awaits | type + unit | `pnpm exec tsc --noEmit` (floating-promise/misused-promise lint), caller Jest suites | exists |
| D-10 security | containment, appId, caps, no panic on truncation | unit | `cargo test -p gamelib-scan security` | Wave 0 |
| D-11 flag | `ts` keeps legacy path, `rust` default per scanner, env override | unit | `pnpm exec jest <resolveScannerImpl test>` | Wave 0 |
| D-12 tier 1 | Rust == golden; TS == golden | unit | `cargo test -p gamelib-scan --test golden`; `pnpm exec jest <goldenParity test>` | Wave 0 |
| D-12 tier 2 | zero diffs on installed games | local | `pnpm scanner-parity-sweep` | Wave 0 |
| D-13 live | all callers on Rust path | manual UAT (live) | `pnpm tauri:dev` per UAT file; evidence = forwarded diagnostics in the sidecar log | Wave N |
| D-13 delete | no TS parser left, flags gone | static | grep-based Jest gate: no `parsePeSectionNames`, `readPeSteamApiDelayImports`, `OBJDUMP_BIN` in `src/` (census exempt) | Wave N |
| exit contract | no leaked handles | smoke | `pnpm smoke:sidecar` | exists |
| lint/dead code | no orphan exports | gate | `pnpm find-deadcode`; `meta/knip-baseline.txt` unchanged or smaller | exists |

### Sampling Rate
- **Per task commit:** the touched crate's `cargo test -p <crate>` and the affected Jest files.
- **Per wave merge:** `pnpm test:ci`, `cargo test -p gamelib-scan -p gamelib-scan-cli`, `cargo test --bin gamelib-shell`, clippy ratchet (`--workspace`) locally, `pnpm smoke:sidecar`, `pnpm find-deadcode`.
- **Phase gate:** the full suite green, `pnpm scanner-parity-sweep` exit 0, live smoke recorded, then the deletion commit re-runs everything.

### Wave 0 Gaps
- [ ] `src-tauri/crates/gamelib-scan` and `-cli` scaffolds, golden test harness, `tests/fixtures/` and `expected.json`.
- [ ] `meta/genScanFixtures.ts` (reuses extracted TS builders) and a new import-table-with-symbols builder.
- [ ] `meta/scannerParitySweep.ts`, `meta/gamelibScanCli.ts`, package.json scripts.
- [ ] `EXPECTED_LOCKFILE_CRATE_NAMES` update in `cargoFeatures.test.ts`.
- [ ] `rust-test.yml` steps (`cargo test -p ...`, `clippy --workspace`) and a text-level gate for them.
- [ ] Jest tests: `resolveScannerImpl`, golden parity (TS side), wrapper fail-closed behaviour on rustInvoke rejection.
- [ ] `<verify>` blocks: `.rs`/`.toml`/`.json` goldens are likely prettier-ignored; run `npx prettier --file-info` first and omit the check for ignored paths (convention), but keep it for every `.ts` file written.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | - |
| V3 Session Management | no | - |
| V4 Access Control | yes (file-scope) | realpath containment: candidate must be strictly inside `realpath(dirname(exe))`; reject symlink escapes |
| V5 Input Validation | yes | `serde` typed args with `deny_unknown_fields`; numeric appId regex before any open; argv-form spawn only (no shell string) |
| V6 Cryptography | no | - |
| V12 Files | yes | bounded ranged reads, hard caps on every loop, no whole-file slurp (except the Mach-O `winemac.so` read already in TS) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Hostile PE (any installed game exe is untrusted input): oversized counts, cyclic resource dirs, out-of-range RVAs, integer overflow | DoS / Tampering | Caps ported 1:1; `checked_add/mul`; short read = `parsed:false`; no `unwrap` on parsed values; truncation-loop test asserts no panic |
| Panic inside a `thread::spawn` worker leaves a `rustInvoke` unanswered until the 60 s timeout | DoS | Wrap `dispatch` body in `std::panic::catch_unwind` and return `Err("scan_x:panic")`; the response is then written even on a bug |
| Symlink escape out of the game folder | Info disclosure / Tampering | canonicalize both sides, strict `strip_prefix`, tempfile symlink test (`std::os::unix::fs::symlink`) |
| Command injection through exe path or appId | Tampering | no shell; the CLI is spawned argv-form; appId digits-only |
| Real-profile data written by the CLI or captures | Info disclosure | CLI runs under `createFakeHomeProfile()`; sweep prints no game bytes; nothing committed from the sweep |
| Forged `rustInvoke` frame reaching a scan with an arbitrary path | Tampering / Info disclosure | Scan results leak only parse facts (booleans, DLL/symbol names), never contents; paths come from the same trusted sidecar that previously read them. Allow-list stays the gate (T-28-03). |

## Sources

### Primary (HIGH confidence)
- This repo, read directly: `src-tauri/Cargo.toml`, `build.rs`, `tauri.conf.json`, `src/sidecar.rs` (rustInvoke dispatch, `thread::spawn` at ~511), `src/store_embed.rs:1810` (`dispatch_rust_channel`), `src/common/types/sidecarTransport.ts` (channels, `RUST_INVOKE_CHANNELS`), `src/backend/sidecar/sidecarRpc.ts` (timeout, `UNBOUNDED_RUST_CHANNELS`), `src/backend/sidecar/__tests__/transportParity.test.ts`, `src/backend/__tests__/cargoFeatures.test.ts`, `.github/workflows/rust-test.yml`, `meta/clippyRatchet.cjs`, `package.json` scripts, all five scanner sources plus `importParse.ts`, `bridgeScan.ts`, every caller listed.
- `.claude/skills/gamelib-conventions/SKILL.md` (fake HOME two-profile rule, exit contract) and `src/backend/testUtils/fakeHomeProfile.ts`.
- Local measurements on this machine, 2026-11-07: scratch workspace experiment (`cargo metadata --offline`, `cargo build -p gamelib-scan-cli --offline`, lockfile diff); `cargo --version`.
- `cargo search` (crates.io) for `object` 0.40.0, `goblin` 0.10.7, `pelite` 0.10.0.

### Secondary (MEDIUM confidence)
- Cargo workspace semantics (root package plus `[workspace]`, default-members = root package) confirmed by the experiment above; not re-checked against docs.rs text in this session.

### Tertiary (LOW confidence)
- tauri-cli watching workspace members (A1), crate APIs for `object`/`goblin` (A2), Windows verbatim-path behaviour (from general knowledge, A3).

## Metadata

**Confidence breakdown:**
- Standard stack / workspace: HIGH, experimentally verified.
- rustInvoke seam: HIGH, read end to end with the parity test.
- Architecture (dispatch, wrappers, flag, harness): MEDIUM-HIGH, design recommendations consistent with all locked decisions.
- Pitfalls: HIGH for items 2-9 (code read); MEDIUM for pitfall 1 (needs the sweep).

**Research date:** 2026-11-07
**Valid until:** 30 days (stable toolchain; the in-repo seam files change under phases 62/64/67, so re-check `sidecarTransport.ts` and `store_embed.rs` line numbers before executing).
