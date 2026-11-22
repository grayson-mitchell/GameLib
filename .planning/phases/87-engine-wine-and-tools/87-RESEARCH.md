# Phase 87: Engine, Wine and tools - Research

**Researched:** 2026-11-23
**Domain:** Port the macOS CrossOver-first engine step, per-game bottles, the Wine manager / runtimes downloads, Winetricks and the DXVK/DXMT/vkd3d tools from the Node sidecar to two Tauri-free Rust crates, with byte-compatible on-disk state and a live gate on real engines.
**Confidence:** MEDIUM-HIGH (code facts HIGH, read this session; the three scope gaps in "Open Questions" need a user decision before plans are cut)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** The launch-time engine step ports in 87. `launchEngine.ts` (offline refusal, pre-flight with the G29 two-probe rule, fallback when CrossOver is missing/expired/broken, first-need download with progress, registration, the DXVK switch, the fallback toast) and its helpers `launchDeadline`, `gameProcessWatch`, `engineDialogs` and `launchSettings` move to Rust. `launcher.ts` and `storeManagers/{gog,nile}/setup.ts` call it through a typed `rustInvoke` shim until 88 ports them. Phase 88 owns only command-line/environment building.
- **D-02:** Rust emits the engine dialogs and toasts. `engineDialogs` keeps its rules (a dialog on every refused attempt; `showEngineNotice` never takes focus and never raises the window) and the `gamelib:steam.engine.toast.*` strings unchanged.
- **D-03:** Bridge-used engine modules port now, and the bridge reaches them through shims. `bottlePrimitives` (17 bridge callers), `engineSwitch`, `engineDecision`, `runTool`, `launchDeadline` and `engineState` get a Rust owner in 87. Their callers in `storeManagers/steam/**` call typed `rustInvoke` shims with the same signature, following 86 D-05/D-06. Each shim is a row in the schedule test with its deleting phase (95, 96 or 97). Research must count the synchronous call sites; the plan must show each ripple, or keep a sync read where it is a pure read of a file Rust owns. Reversibility: costly.
- **D-04:** Two crates: `gamelib-engine` (+cli) and `gamelib-wine` (+cli). `gamelib-engine` holds the decision, CrossOver detection and demo probe, bottles and ledger, engine switch and markers, the fallback engine, engine state and notices, and the launch step. `gamelib-wine` holds the wine-manager releases, the runtimes download, Winetricks (queue, environment, apply guard, list parse, output classifier) and the DXVK/DXMT/vkd3d tools. `gamelib-wine` may depend on `gamelib-engine` paths; never the reverse. Each has its own dispatch and `-cli`, Tauri-free.
- **D-05:** GPU system info moves to 88. Amend `82-STATE-OWNERSHIP.md`: the `pci_ids_device` and `pci_ids_vendor` rows' "TS mirror deleted" cell moves from 87 to 88, recorded as an amendment with the reason. Re-check the other 87-scheduled rows (`wineDownloaderInfoStore`, `steam_engine_notices`, `steam-engines-dir`) against D-03/D-04 in the same amendment.
- **D-06:** No `GAMELIB_ENGINE` flag. Each sub-slice's TS is deleted once its goldens pass. Sub-slices are engine decision + fallback + launch step, bottles + ledger + switch, wine downloads, and tools. Each one's TS and registrations are deleted in the same plan as its port or the next. The live gate at the end proves the whole set. A gate failure is fixed in Rust and nothing is revived. Reversibility: costly.
- **D-07:** On-disk state is byte-compatible behind the StoreHost version gate. Rust reads and writes the bottle ledger, `<bottle>/.gamelib-engine.json`, `cxbottle.conf` edits, engine notices and the `wine-downloader-info` store byte for byte as the TS does, reusing the Phase 85 `store_version_gate` that already decides marker versions (`stores/bottleVersionGate.ts`). A marker written by a newer build is never overwritten. A corrupt marker or ledger is kept, never reset (FND-06). Goldens include a fixture set of bottles and markers as existing builds wrote them, including the `wine-manager` / null-pinId / retired-pin markers from 61 HUMAN-UAT item 4. Reversibility: one-way.
- **D-08:** TS goldens plus selected Rust tests. Before any Rust for a sub-slice, a TS harness records goldens over a scenario matrix (engine decision; bottles before/after trees on `FakeHome`; spawned commands as argv/env/cwd traces; downloads as replayed HTTP with pinned requests plus sha256 and contained-extraction outcomes). Rust replays the same inputs and must match. Separately port the behavioural TS tests that record incidents as Rust tests (at minimum `legacyBottleUntouched`, sibling-safe removal, DXVK install/remove, the inconclusive pre-flight cases, `gameProcessWatch`'s match forms, the Winetricks apply guard and output classifier). Source-text gate tests are dropped. `wine/` gets its harness and goldens committed first. The goldens carry the Phase 82 D-05 vacuous-pass guards.
- **D-09:** No new spike before planning. Research lists any behaviour the goldens cannot capture (wineserver timing, CrossOver adopting a fallback bottle, the trial licence read from the real HOME); each one becomes a live-gate item.
- **D-10:** Progress events are unchanged and the renderer is untouched. Rust emits the same event names and payload shapes through `FrontendEmitter` for engine and tool downloads, the Winetricks queue and the fallback engine's first-need progress. Goldens pin the event sequence of a replayed download (start, n x progress, done/error) and allow tolerance on how often progress events fire.
- **D-11:** An operator live gate on macOS, authored before coding, with four items: (1) CrossOver healthy, then no-CrossOver fallback (SC1), including one D3D11 title; (2) expired trial to Staging, one throwaway bottle backdated under `nolicence.sb`; (3) bottles (SC2), reuse and sibling-safe removal; (4) tools and downloads (SC3). Offline-UAT memory shape wherever offline refusal is tested.
- **D-12:** The gate build is a signed Phase 87 build installed over a signed Phase 86 build. A dev build does not count.
- **D-13:** Windows and Linux are covered by CI only. Wine-manager (Wine-GE/Proton) and runtimes downloads get their live check with Phase 99.
- **D-14:** A native channel never falls back to the sidecar. Its Rust serde struct (`deny_unknown_fields`, camelCase) is the schema, the zod entry is deleted with the TS registration, and the IPC snapshot is regenerated.
- **D-15:** TS callers use thin same-signature `rustInvoke` shims or D-24-style resolvers. The delete gate counts them and a schedule test lists each with its deleting phase.
- **D-16:** Quirks are copied for parity and each is filed as a todo with the three triage keys; a golden diff never mixes a port with a fix. Known candidates: 61 HUMAN-UAT WR-01 and WR-02, whichever way they were resolved.
- **D-17:** Every spawn (wine, wineserver, CrossOver probes, winetricks, tar) goes through `gamelib-proc`. Tools and probes are `SpawnClass::Helper`; only what must outlive GameLib is `Game`. In-flight work holds a `gamelib_core::shutdown::global()` Registrant, exit work fits `ExitBudget::DEFAULT`, boot work is bounded, no `PR_SET_PDEATHSIG`, no hand-rolled kill.
- **D-18:** Two-profile rule: `demoStatus` is the declared real-profile arm; `runTool` spawns with the isolated fake-HOME env. Rust keeps both arms, named and justified.
- **D-19:** Destructive operations (bottle removal) refuse when a check returns "unknown" and never touch a sibling, using the shared `gamelib-safety` path guards.
- **D-20:** CrossOver first, the pinned Wine-Staging+DXVK auto-fallback, the override is advanced and unsupported unless CrossOver, no GPTK/DXMT engine. Bottled Steam is not a fallback target of the engine step.
- **D-21:** v0.11 rules: live gates authored before coding, goldens recorded from TS before porting, and the phase's last plan leaves no TS or registrations for any ported module except scheduled shims and resolvers.

### Claude's Discretion
- The order sub-slices port within the phase (research may suggest bottles + ledger first).
- Module layout inside the two crates, op names and the channel shapes through the 83 router.
- The recorder and replay fixture format, where fixtures live, and how they're redacted.
- Whether a given sync bridge call site becomes async or reads a Rust-owned file synchronously (D-03), case by case with the count from research.

### Deferred Ideas (OUT OF SCOPE)
- GPU system info (`utils/systeminfo/gpu`, the `pci_ids_*` caches) -> Phase 88 (D-05).
- Linux live check of wine-manager and runtimes downloads -> Phase 99 (D-13).
- Fixing any quirk the port copies -> individual todos (D-16).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SVC-02 | Engine selection, per-game bottles, Wine/CrossOver/Staging downloads, Winetricks and DXVK tools work as before | Channel map, sync-call-site table, on-disk inventory, golden matrix, spawn table and live-gate list below. Also constrained by FND-02 (guarded deletes), FND-04 (no orphans), FND-06 (markers/stores byte-compatible). |
</phase_requirements>

## Summary

The phase is ~11.3k TS source lines and ~14.1k test lines [VERIFIED: `wc -l` over `src/backend/engine`, `tools`, `wine` this session]. The Rust side already has the foundations it needs: `StoreHost` (85), `gamelib-safety` (82), `gamelib-proc` spawn classes, the `FrontendEmitter` seam, `gamelib-i18n`, and the 86 recorded-HTTP replay pattern. What does **not** exist yet, and drives most of the planning risk, is (a) a richer process seam than `gamelib_core::process::ProcessRunner` (it is `run(program, argv, timeout)` only: no env, no cwd, no stdin, no abort, no streaming callback), (b) any Rust notion of `GameSettings`, wine environment building or `validWine` (all in `launcher.ts`, Phase 88), and (c) wine discovery (`utils/compatibility_layers.ts`, 673 lines, not named in CONTEXT). Winetricks, DXVK install/remove and the engine's own spawns all need (b), and `getAlternativeWine` / `getCrossover` need (c). These are scope gaps the user must confirm (Open Questions 1 to 3) before plans are cut.

The second planning driver is the **sync-call-site ripple** (D-03). There are ~58 external call sites of `bottlePrimitives` functions across 17 Steam-bridge files, and almost all of them are synchronous pure helpers (`getBottleDir` 29, `sanitizeBottleName` 7, `isBottleProvisioned` 10, `buildFallbackGameSettings` 4). The worst single ripple is the in-memory engine registry read inside `getBridgeBottleSettings` (sync, 18 callers, 6 sync enclosing functions). Moving those to async shims would rewrite 96/97-owned bridge code for no behavioural gain; the recommended shape is a scheduled "pure-helper twin" plus a write-through selection view (table in "Sync call-site count").

The third driver is that CONTEXT's D-07 list is slightly off: the "bottle ledger" is **in-memory only** (a `Map` per boot), and the TS never *edits* `cxbottle.conf` (it creates a minimal one once and regex-reads `Timestamp`; CrossOver itself edits it). The real on-disk artifacts are the `.gamelib-engine.json` marker, the `.gamelib-pin.json` per pinned-engine dir, `current_dxvk-macOS` in bottles, the `steam_engine_notices` store, the `wine-downloader-info` store, plus the resolved shared-redist file (95, gate only).

**Primary recommendation:** Cut ~28 plans in 8 waves, ordered wine-command core and DXVK first (the engine switch needs them through a trait), then bottles/markers/switch, then decision/fallback, then state/launch step, then wine-manager/runtimes/winetricks, then shims/resolvers, then deletion, with the live-gate contract and the TS golden harnesses authored in wave 0 and the gate run by a different plan. Resolve Open Questions 1 to 3 with the user first.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Engine decision, pre-flight, demo-status probe | Rust `gamelib-engine` | TS caller supplies bridge facts as values | Pure decision over probe results; spawns go through `gamelib-proc` |
| Bottle create/reuse/remove, markers, in-memory ledger/registry | Rust `gamelib-engine` | TS pure-helper twin for sync reads (bridge) | Rust is the only writer; TS reads files/paths synchronously until 96 |
| Fallback engine download, verify, extract, prune | Rust `gamelib-engine` | `tar` helper process | sha256 + contained extraction; destructive prune via `gamelib-safety` |
| Launch-time engine step, deadline, process watch | Rust `gamelib-engine` | TS `launcher.ts` and `gog|nile/setup.ts` via shim (until 88/92) | D-01 |
| Engine dialogs / toasts / notifications | Rust (shell-injected sinks) | Renderer (unchanged) | D-02; `FrontendEmitter` + native notification sink + display-ack |
| Wine command core (env build, validWine, runWineCommand) | Rust `gamelib-wine` (see OQ1) | TS `commandRunner`/`launcher` until 88 | Hard dependency of DXVK, Winetricks, bottle creation |
| DXVK/vkd3d/DXMT install and remove | Rust `gamelib-wine` | trait implemented for `gamelib-engine` | Engine switch calls it; crate direction forbids a direct dep |
| Wine-manager releases, runtimes, Winetricks queue/env/guard | Rust `gamelib-wine` | Renderer progress listeners (unchanged) | D-04 |
| Wine discovery (`getAlternativeWine`, `getCrossover`) | Rust `gamelib-wine` (see OQ2) | `utils/compatibility_layers.ts` until its last TS caller | Needed by `resolveCrossoverBinDirAsync` and the renderer channel |
| GameSettings resolution (global defaults + per-game merge) | TS `config.ts` / `game_config.ts` (until 98) | passed to Rust as an argument by resolvers | Rust has persistence only, no default merge |
| Store persistence (notices, wine-downloader-info) | Rust `StoreHost` | none | Already Rust-owned since 85 |

## Standard Stack

### Core (all already locked in `src-tauri/Cargo.lock`; none is new)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `tokio` | 1.54.1 [VERIFIED: Cargo.lock] | async runtime, timers, process | every domain crate uses it |
| `reqwest` | 0.13 (`default-features=false`, `rustls-no-provider`, add `stream`) [VERIFIED: gamelib-depot/Cargo.toml:26] | GitHub API, lutris runtimes, archive downloads | the shell installs the rustls provider; depot already enables `stream` |
| `sha2` | 0.10.9 [VERIFIED: Cargo.lock; gamelib-depot/Cargo.toml:18] | sha256 (pinned engine) and sha512 (wine-manager checksum) | RustCrypto; no hand-rolled hashing |
| `serde` / `serde_json` | 1 | arg structs, ordered output via `gamelib_store::json::Obj` | crate contract (README section 2) |
| `regex` | 1.13.1 [VERIFIED: gamelib-info/Cargo.toml:44] | demo-status, winetricks list/classifier, process match | JS-regex pitfalls apply (86 Pitfall 4) |
| `semver` | 1.0.28 (transitive today; promote to direct, no new lockfile name) [VERIFIED: Cargo.lock] | `semver.lt` in `tools/index.ts` | same semantics as the npm `semver` used |
| `futures-util`, `tokio-util` | 0.3.33 / 0.7 [VERIFIED: Cargo.lock] | streaming download, `CancellationToken` | already used by depot/proc |
| `gamelib-core`, `gamelib-proc`, `gamelib-safety`, `gamelib-store`, `gamelib-i18n`, `gamelib-testutil` | in-repo | seams, spawns, guards, stores, strings, `FakeHome` | CONTEXT canonical refs |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| system `tar` (spawned) | n/a | archive extraction (`tar -xf <path> -C <dest> --strip-components=<n>`) | Same argv as TS `extractTarFile` [VERIFIED: `src/backend/utils.ts` extractTarFile]; keep for parity (macOS bsdtar, xz) |
| `plist` 1.10.0 | transitive | NOT needed | TS reads `CFBundleVersion` with `/usr/bin/plutil`; keep the spawn for argv-trace parity |
| `rust-ini` | transitive | NOT needed | `cxbottle.conf` is a fixed template string written once, never parsed as INI |
| `flate2`, `tar`, `xz2` crates | locked | NOT needed | extraction stays a `tar` child; do not add a pure-Rust extractor (symlink/xattr/resource-fork behaviour would change) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| spawned `tar` | `tar`+`xz2` crates | Different symlink and xattr handling, 228 MB xz decode in-process; rejected for parity |
| multi-connection EasyDl clone | single streaming GET | TS `downloadFile` does HEAD + 5 ranged connections (`connections = 5`) [VERIFIED: utils.ts downloadFile]; a single stream is slower but functionally equal. Record as a quirk todo (D-16), do not mix into the port diff |

**Installation:** no new packages. Add `gamelib-engine`, `gamelib-engine-cli`, `gamelib-wine`, `gamelib-wine-cli` to `src-tauri/Cargo.toml` members and path deps, `EXPECTED_LOCKFILE_CRATE_NAMES` in `src/backend/__tests__/cargoFeatures.test.ts`, `-p` entries in `.github/workflows/rust-test.yml` and `meta/__tests__/rustTestWorkflow.test.ts`, and `src-tauri/crates/README.md` (recipe sections 1, 8) [CITED: crates/README.md; 86-RESEARCH registration checklist].

**Version verification:** crates were confirmed against `Cargo.lock` (above) and the legitimacy seam; no registry install is performed in this phase.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| sha2 | crates.io | 10 yrs | 32.1M/wk | github.com/RustCrypto/hashes | OK | Approved (already locked) |
| semver | crates.io | 12 yrs | 23.7M/wk | github.com/dtolnay/semver | OK | Approved (already locked, promote to direct) |
| futures-util | crates.io | 8 yrs | 25.8M/wk | github.com/rust-lang/futures-rs | OK | Approved (already locked) |
| tokio-util | crates.io | n/a | 19.7M/wk | tokio-rs | OK | Approved (already locked) |
| regex | crates.io | n/a | 27.1M/wk | rust-lang/regex | OK | Approved (already locked) |
| reqwest | crates.io | n/a | 21.9M/wk | seanmonstar/reqwest | OK | Approved (already locked) |
| tokio | crates.io | n/a | 25.3M/wk | tokio-rs/tokio | OK | Approved (already locked) |
| plist | crates.io | n/a | 3.6M/wk | n/a | OK | Not used |

`gsd-tools query package-legitimacy check --ecosystem crates sha2 semver futures-util tokio-util regex reqwest tokio plist` returned `OK` for all eight [VERIFIED: run this session]. **Packages removed (SLOP):** none. **Packages flagged (SUS):** none. No npm package is added.

## Architecture Patterns

### System Architecture Diagram

```
Renderer (React, unchanged)                  Sidecar (Node, until 99)                 Bridge/launcher TS (until 88/92/95-97)
 getDefaultEngine listEngineOptions            engine RESOLVER (getEngineState)          launcher.ts  gog|nile/setup.ts
 dismissEngineNotice getPerGameBottleName      wine-tools RESOLVER (toggleDXVK*,         steam/** shims: bottlePrimitives twin,
 installWineVersion removeWineVersion ...       winetricks*, runWineCommand*, callTool)    engineSwitch/decision/runTool/state shims,
        | native channel (83 router)                   | one typed rustInvoke                engineSelectionView (write-through)
        v                                              v                                   |
   native_router.rs ----------> engine_dispatch.rs / wine_dispatch.rs <---------------------+  (rustInvoke frames)
   (serde deny_unknown_fields)   builds EngineCtx / WineCtx once, in run_setup
                                       | gamelib_engine::dispatch(op,args,&ctx)   gamelib_wine::dispatch(op,args,&ctx)
                                       v
   +-------- gamelib-engine ---------------------------------+      +------------- gamelib-wine --------------+
   | decision  crossover(locate, demo, tested) runtool        |      | wine_cmd(env, valid_wine, run) discovery |
   | bottles(prims, conf, ledger, markers, switch, perGame)   |<-----| tools(dxvk, vkd3d, dxmt) winetricks(...)  |
   | fallback(download, verify, extract, prune, sweep)        |  DxvkInstaller trait (engine owns trait, |
   | state(notices, publish) launch(step, deadline, watch,    |  wine implements, shell wires)           |
   |   dialogs, settings, registry) fetch(Fetch+Replay)       |      | manager(releases GitHub, runtimes lutris) |
   +--+---------+---------+----------+----------+-------------+      +--+---------+---------+---------+-------+
      |         |         |          |          |                       |         |         |         |
  ProcSpec    StoreHost  Fetch     Emitter    Clock / Shutdown       gamelib-safety guards (all rm), i18n Catalog,
  runner     (notices,  (reqwest|  (Frontend  global().token()       NotifySink + DisplayAck + RaiseWindow sinks
  (gamelib-   wine-dl-   Replay)    Emitter)   + Registrant           (shell impls; no-op in -cli)
   proc)      info)
```

Primary flow (SC1, non-Steam launch on macOS): `launcher.ts` resolver gathers `{runner, appName, title, installPath, platform, isNative, settings, offline}` -> `rustInvoke engine_launch_select` -> Rust: eligibility -> read effective engine (`GamesConfig/<app>.json`, `config.json`) -> resolve prefix -> ensure per-game bottle -> `decide_launch_engine` (cx probe, demo-status, G29 two-probe) -> ensure pinned engine (download with `gameStatusUpdate engine-download` progress) -> `prepare_bottle_for_engine` (marker gate, kill previous wineserver, DXVK install/remove through the trait) -> registry + overlay context set -> toast -> reply `{kind, key, selection, logLines}`; `launcher.ts` writes `logLines` into its game log writer and continues with the 88 env/argv code.

### Recommended Project Structure
```
src-tauri/crates/gamelib-engine/src/
  lib.rs              # dispatch(op,args,&EngineCtx), OPS, CLI_ONLY_OPS, catch_unwind
  ctx.rs              # EngineCtx { host, clock, platform, paths, shutdown, fetch, proc, emitter, notify, dialogs, i18n, dxvk, tools_state }
  spec.rs             # ProcSpec (program, argv, env, replace_env, cwd, stdin, timeout, abort, max_buffer)
  fetch.rs            # trait Fetch + ReqwestFetch + Replay (pinned fields, D-10); stream-to-file with progress+abort
  pins.rs             # reads shared src/common/enginePins.json via include_str!
  decision/{mod,preflight,creation,override_options,offline}.rs
  crossover/{locate,demo_status,tested_versions,run_tool}.rs
  bottles/{paths,sanitize,conf,ledger,marker,gate,switch,per_game,primitives,prefix}.rs
  fallback/{ensure,verify,extract,prune,sweep,progress}.rs
  state/{engine_state,notices,publish}.rs
  launch/{step,deadline,watch,dialogs,settings,registry,state}.rs
  config.rs ids.rs key.rs eligibility.rs
src-tauri/crates/gamelib-wine/src/
  lib.rs ctx.rs
  wine_cmd/{env,valid,command,prefix}.rs        # OQ1
  discovery/{mac,linux,custom}.rs               # OQ2
  tools/{dxvk,vkd3d,dxmt,state,macho}.rs
  winetricks/{queue,env,guard,list_parse,classify,install,metadata}.rs
  manager/{releases,local,install,remove,store}.rs
  runtimes.rs
src-tauri/crates/gamelib-{engine,wine}-cli/   # headless: <op> <json>, --list, --ndjson; FakeHome only
src-tauri/src/{engine_dispatch,wine_dispatch}.rs   # EngineCtx/WineCtx builders, rustInvoke + native arms, sinks
src/common/enginePins.json                          # shared pin table (TS and Rust read the same file; 86 runnerCapabilities.json pattern)
```

### Pattern 1: Dispatch with injected seams (copy 86)
`pub async fn dispatch(op, args: &[Value], ctx: &EngineCtx) -> Result<Value,String>`, `OPS` sorted, `catch_unwind`, "results not errors", `rpc_<op>` arms in `rust_dispatch.rs` [CITED: crates/README.md sections 2, 3; `src-tauri/src/info_dispatch.rs` header]. The shell builds one `Arc<EngineCtx>` in `run_setup` after the store host opens; nothing spawns or waits at build time.

### Pattern 2: Caller facts become value arguments
TS callbacks that read bridge state (`getMonitorPhase`, `ownBottleName`, `crossoverSettings(key)`, `readOverride`, `resolveCrossoverBinDir` with `hintWineBins`, `monitorPhase`) cannot be called from Rust. Each becomes a plain field of the op's args, filled by the TS shim/resolver before the one `rustInvoke`. `steamEngineDeps.ts` shrinks to a resolver that collects them. `onSwitching` becomes a `switched: bool` in the reply (and the engine-state publish Rust already does).

### Pattern 3: Trait seam to avoid the crate cycle
`engineSwitch`/`createFallbackBottle` call `Tools['DXVK'].installRemove` (tools = `gamelib-wine`), but D-04 forbids engine -> wine. `gamelib-engine` owns `trait DxvkInstaller { async fn install_remove(&self, settings, tool, action, source) -> bool }`; `gamelib-wine` implements it; the shell injects it into `EngineCtx`; `-cli` and tests use a scripted fake [CITED: crates/README.md section 2c "never on another domain crate except through a trait"].

### Pattern 4: Recorded oracle (TS) and replay (Rust)
Copy 86: a TS oracle test behind an env flag records goldens (`GAMELIB_WRITE_STORE_GOLDEN=1` style), `cases.json`, `expected/<case>/`, `MANIFEST.json` with a count and floor (`assertAtOrAboveFloor` from `src/backend/testUtils/censusFloor.ts`), requests pinned per 86 D-10 [CITED: 86-RESEARCH Pattern 3; `src/backend/stores/__tests__/storeOracle.test.ts`]. New for 87: record **spawn traces** by wrapping the TS `ProcessRunner.run` / `spawnAsync` seam (argv, env diff vs a fake HOME base, cwd, stdin) and **filesystem trees** (before/after listing with mode + sha) from a `FakeHome`.

### Anti-Patterns to Avoid
- **A flag or dual path** (D-06): none; the shared bottles/markers make dual writers the riskier state.
- **Rust calling TS for state** (ARCHITECTURE anti-pattern 2): pass facts in, return results out.
- **Raw `rm -rf` in Rust**: every delete goes through `gamelib_safety` (see Don't Hand-Roll).
- **`serde_json::Value` for byte-compared output**: marker and store writes use `gamelib_store::json::Obj` (key order).
- **`reqwest::Error` in a log line** (leaks URL): `.without_url()` first [CITED: 86-RESEARCH Anti-Patterns].
- **Mixing a port and a fix in one golden diff** (D-16, D-03 of 86).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Ordered JSON, atomic write, 0600/0644 modes | per-file writers | `gamelib_store::{json, atomic, host}`; markers via `Obj::insert_js` then `JSON.stringify`-equivalent compact text | byte parity |
| Marker version gate and backup | a new gate | `gamelib_store::version_gate::version_gate(path, chain)` and `backup::write_pre_migration_backup` (called in-process; today reached over rustInvoke by TS) [VERIFIED: `src-tauri/src/store_gate_dispatch.rs`] | refuse-newer rule already decided there |
| Recursive delete (bottle dir, engine prune/sweep, wine-manager remove, runtime dir) | `fs::remove_dir_all` | `gamelib_safety::remove::{check_removal, remove_tree}` with an explicit trust root per call | FND-02; TS today has several unguarded `rmSync` (see Common Pitfalls 6) |
| Process spawn | `Command::spawn` | `gamelib_proc::spawn::spawn_helper_tokio(&mut tokio::process::Command, label)` | group kill, reaper, Job (D-17) |
| Exit/shutdown waits | custom timeouts | `gamelib_core::shutdown::global()` Registrant + `token()` in `select!` | conventions rows 2 to 4 |
| UI strings | format! | `gamelib_i18n::Catalog::t(key, default, params)` | byte-equal to i18next for shipped locales |
| HTTP | a mock server | `Fetch` trait with `Replay` (copy `gamelib-info/src/http.rs`) | pins requests and responses |
| Test HOME | `tempfile` direct | `gamelib_testutil::FakeHome` (0700 root) | two-profile rule |
| Hashing | own | `sha2` | trivially correct |

**Key insight:** the parity risk is not the HTTP or the hashing; it is the JS-isms around them (JSON key order and compact form, `existsSync`-then-act ordering, regexes, `process.env` inheritance, timer ordering) and the sync-to-async ripple into 96/97-owned bridge code.

## Sync call-site count (D-03)

Method: grep of `src/backend/storeManagers/**`, `launcher.ts`, `sidecar/**`, `services/**`, `tools/**`, `appshell/**` excluding `__tests__`; enclosing-function async-ness read with an awk heuristic, so the planner must confirm each row when cutting tasks [VERIFIED: greps this session; classification ASSUMED where marked].

| Symbol (TS owner) | External call sites | Sync today? | Ripple if async shim | Recommendation | Deleting phase |
|---|---|---|---|---|---|
| `getBottleDir` | 29 call sites (+1 type) in 16 files: `bridgeBottleLifecycle.ts` 8, `bottle.ts` 2, `provisionBottle.ts` 2, `bridgeKnownFixes.ts` 2, `bridgeBottle.ts` 2, `gameLaunch.ts` 2, `directLaunchProbes.ts` 2, 9 others 1 each | sync, pure `userHome/Library/Application Support/CrossOver/Bottles/<name>` | rewrites path math in sync closures (`stageDrmBottle` default, `bridgeConfig`, `shimGenerate`, `shimPlacement`) | **Keep a sync TS pure-helper twin** `bottlePaths.ts` (not a shim). Cross-language vector file shared by a Jest test and a Rust test | 96 (bottle owner) |
| `sanitizeBottleName` | 7 in 6 files | sync, pure | same | same twin, same vectors (the T-17-01 chokepoint, one rule in two languages) | 96 |
| `isBottleProvisioned` | 10 (`provisionBottle.ts` 6, `bottle.ts` 2, `bridgeBottle.ts` 1, `bridgeBottleLifecycle.ts` 1) | sync `existsSync(<bottle>/cxbottle.conf)` | sync gates inside provisioning | **Sync read of a file CrossOver owns**: keep in the twin | 96 |
| `buildFallbackGameSettings` | 4 (`bridgeWineTools.ts:83`, `bridgeBottle.ts:460`, `gameInstallBridge.ts:402,449`) | sync pure `GameSettings` transform (env filter + wineVersion) | `bridgeBottle.ts:460` sits inside the sync `getBridgeBottleSettings` chain | twin + golden of the transformed object; Rust has its own for DXVK restore settings | 96 |
| `killBottleWineServerWith` | 2 (`bridgeBottleLifecycle.ts:373,386`) | async | none | async shim `engine_kill_bottle_wineserver` | 96 |
| `removeCreatedBottleDir` | 5 (`bridgeBottleLifecycle.ts:585,703,734,753,767`) | sync void, enclosing functions async | `await` only | async shim; Rust version goes through `gamelib-safety` | 96 |
| `createFallbackBottle` | 1 (`bridgeBottleLifecycle.ts:652`) | async | none | async shim | 96 |
| `readBottleEngineMarkerKind` / `...Summary` / `restoreNeedsAbsentPin` | 4 (`bridgeWineTools.ts:76` sync closure, `gameEngineDialogs.ts:76,78`, `gameLaunch.ts:474,476`) | sync, read-only view of the marker | `bridgeWineTools` closure sync | **Sync read of a Rust-owned file** (the 86 "native read" shape): keep a TS read-only reader in the twin; Rust is the only writer | 96 |
| `prepareBottleForEngine` | 3 async sites (`gameEngineDialogs.ts:124`, `gameLaunch.ts:557`, `gameInstallBridge.ts:430`) | async, but args carry callbacks | none (callbacks -> values) | async shim `engine_prepare_bottle`; `getMonitorPhase`, `ownBottleName`, `crossoverSettings`, `crossoverHealthy` pass as values, `onSwitching` becomes `switched` | 96 |
| `reconcileBottleEngineMarker`, `recordPinnedBottleEngine`, `recordCrossoverBottleEngine` | 1, 1, 1 (async enclosing) | async | none | async shims | 96 |
| `decideLaunchEngine`, `decideCreationEngine`, `preflightCrossover`, `isCrossoverMissing` | 2, 1, 2, 2 (all `await`ed) | async | none, but `EngineDecisionDeps` function members (`resolveCrossoverBinDir` with `hintWineBins`, `readOverride`, `monitorPhase`, `killCrossoverWineserver`) become values | async shims; `steamEngineDeps.ts` becomes the resolver | 96 |
| `createRunTool` -> `RunTool` | 3 construction sites (`gameBridgeLaunch.ts:312`, `gameLaunchOverlay.ts:352`, `gameLaunch.ts:787`); 10 consumer files hold the function value | async | none (the value keeps its signature) | `rustRunTool(tool,args,{timeoutMs,signal})` async. `AbortSignal` cannot cross rustInvoke: shim registers a cancel id and calls `engine_run_tool_cancel` on abort | 97 |
| `engineRuntime.launchSettings.getLaunchSettings` | 12 sites (launcher x2, `gog|nile|legendary|sideload/games.ts`, `storeManagerCommon/games.ts`, `gog|nile/setup.ts`) | sync, in-memory overlay | enclosing functions are async (`stop()`, `launch`, `setup`, `prepareWineLaunch`) per the heuristic; `launcher.ts:331` and `nile/setup.ts:126` ASSUMED async | async shim + `await` (non-Steam only) | 88 (launcher), 92 (stores) |
| `engineRuntime.registry.getEngineSelection` / `clearEngineSelection` | get: 7 (`gameLaunchOverlay.ts:305`, `bridgeWineTools.ts:61`, `bridgeBottleLifecycle.ts:371`, `bridgeBottle.ts:490`, `gameLaunch.ts:431,717`, `gameBridgeWineLaunch.ts:183`); clear: 3 | **sync**, and `bridgeBottle.ts:490` is inside sync `getBridgeBottleSettings` (**18 callers**) | 6 sync enclosing functions: `resolveBridgeGameInstallRoot` (10 callers), `getBridgeBottleSteamappsRoot` (2 incl. sync closure `pollRust/rustSteamPoll.ts:61`), `resolveBridgeLaunchWorkingDir` (1), `defaultSteamWineToolsDeps` closures (2), `steamSwitchDeps` closure | **`engineSelectionView`**: a write-through TS view filled from the selection returned by `engine_launch_select` / `engine_prepare_bottle` and cleared by the clear shim; Rust stays the owner. Needs an explicit ownership amendment (in-memory state mirror, scheduled) | 96 |
| `engineRuntime.ledger.markGameStopped` / `markGameRunning` | 1 (`gameBridgeWineLaunch.ts:730`) + via `bindDeadlineToMonitor` | sync void | none | fire-and-forget async shim | 96 |
| `launchDeadline` (`armLaunchDeadline`, `bindDeadlineToMonitor`) | `gameBridgeWineLaunch.ts:181-185,524`, `launcher.ts:1151`, `gog|nile/setup.ts`, `gameLaunch.ts:717` (`onBridgeLaunchDeadline`) | `arm` returns a sync object whose `.state` is read; `onDeadline` is a TS callback | Rust timer must call back into TS for the Steam bridge | async `engine_deadline_arm` + a Rust -> sidecar event `engine_deadline_fired {key}` with a per-key TS callback map (state in TS), precedent: depot `ShellJobHost.emit` and steampoll wake events [CITED: README section 10]. Non-Steam deadline is fully Rust (notice only) | 96 |
| `engineState.publishOverlayNotice`, `publishOverlayExitNotice`, `recordLaunchDecision`, `getEngineState` | 1, 1, 1, 1 | publish methods return a sync boolean used for a log line (`gameBridgeWineLaunch.ts:500` reads `pushed`; ASSUMED log-only, confirm) | none if log-only | async fire-and-forget shims; `getEngineState` already async | 97 / 96 |
| `launchEngine` (`selectEngineForLaunch`, `armEngineLaunchDeadline`, `endEngineLaunch`) | `launcher.ts` (3), `gog/setup.ts`, `nile/setup.ts` | async (`endEngineLaunch` is sync void) | `endEngineLaunch` called from sync sites (`launcher.ts:327`, `setup.ts:135,129`) | async fire-and-forget shim for `end`; `select` takes the resolver bag `{runner, appName, title, installPath, platform, isNative, settings, offline, purpose}` and returns `logLines` for the TS `LogWriter` | 88 (launcher), 92 |
| `engineRuntime.crossover.resolveCrossoverBinDirAsync` | 7 (`bridgeBottleLifecycle` 2, `provisionBottle` 2, `runnerCrossover`, `steamEngineDeps`, `appManagement`) | async | none | async shim | 96/97 |
| `engineRuntime.fallback.isPinnedEngineInstalled` | `gameEngineDialogs.ts:65`, `gameLaunch.ts:463` (async enclosing) | sync existsSync + marker sha | `await` only | async shim, or keep a TS reader of `.gamelib-pin.json` in the twin (recommend twin: pure file read) | 96 |
| `ENGINE_PINS`, `pinById` constants | 6 sites in `gameEngineDialogs`, `gameLaunch`, `gameInstallBridge`, `bridgeBottleLifecycle`, `gameInstall`, `games` | sync const | none | both languages read `src/common/enginePins.json` (86 `runnerCapabilities.json` pattern) | 96 |

Totals: ~58 `bottlePrimitives` call sites, 12 `getLaunchSettings`, 10 registry, 18 `getBridgeBottleSettings`; the avoidable ripple is the pure-helper family plus the registry read. **The twin/view shapes are a third allowed survivor beside shim and resolver; they need user sign-off (Open Question 4)** because CONTEXT D-21 names only shims and resolvers.

## Sidecar channel map (D-10, D-14)

Seam-level facts: all 5 engine channels are `ipc.handle` invoke plus one push; the wine-tools file declares 15 invoke / 0 send [VERIFIED: `engineFlowRegistration.ts`, `wineToolsFlowRegistration.ts` headers read this session]. Zod entries live in `src/common/types/ipc/engine.ts` (`engineAsyncArgs`, `engineFrontendMessagesArgs`), `wineTools.ts` (`wineToolsAsyncArgs`, `wineToolsFrontendMessagesArgs`) and `runnerMisc.ts` (`callTool`, `downloadRuntime`, `isRuntimeInstalled`). Renderer consumers: `src/preload/api/wine.ts` (exports quoted below), `screens/Settings/sections/WinetricksSettings/`, engine badge and notice surfaces.

| Channel | Args (zod) | Returns | Classification | Needs TS-only input | Rust push/event |
|---|---|---|---|---|---|
| `getEngineState` | `{runner, appName}` | `EngineState or null` | **Resolver** | non-Steam: `install.platform==='Browser'`, `game.isNative()` (library managers, 89-92); Steam: bridge/bottle state via `steamEngineDeps` | `engineStateChanged(EngineState)` Rust-emitted |
| `listEngineOptions` | `{runner,appName} or {appName:'default'}` | `EngineOption[]` | **Native** | none (reads `GamesConfig/<app>.json`, `config.json`, wine-downloader-info) | none |
| `getDefaultEngine` | `[]` | `{effectiveEngineId, engineSource, legacyLabel}` | **Native** | global `wineVersion` default = first `wine` on PATH (`getDefaultWineBinary`, `findExecutableOnPath`): Rust must reproduce it (OQ6) | none |
| `getPerGameBottleName` | `{runner,appName}` | `string or null` | **Native** | none (pure) | none |
| `dismissEngineNotice` | `{kind:'no-crossover'} or {kind:'untested-crossover', build}` | `{ok}` | **Native** | none (`steam_engine_notices` via `StoreHost`) | none |
| `installWineVersion` | `WineVersionInfo` | `void` | **Native** | none | `progressOfWineManager(version, WineManagerStatus)`; `wineVersionsUpdated`; native notifications (`notify.install.*`) |
| `refreshWineVersionInfo` | `boolean?` | `void` (errors swallowed, returns undefined) | **Native** | none | `wineVersionsUpdated` |
| `removeWineVersion` | `WineVersionInfo` | `void` | **Native** | none (the stored `installDir` is used, never the renderer's) | `wineVersionsUpdated`; notification `notify.uninstalled` |
| `getAlternativeWine` | `[]` | `WineInstallation[]` | Native **if OQ2 ports discovery**, else resolver | custom wine paths setting (readable from `config.json`) | `wineVersionsUpdated` (via refresh when empty) |
| `wine.isValidVersion` | `WineInstallation` | `boolean` | Native if OQ1 ports `validWine` | none | none |
| `isRuntimeInstalled`, `downloadRuntime` | `RuntimeName` | `boolean` | **Native** (`wine/runtimes`) | none | none (no progress events today) |
| `winetricksQueueState`, `winetricksCancelRemaining` | `[runner, appName]` | `WinetricksQueueState` | **Native** | none | `winetricksQueueChanged(state)` |
| `winetricksApply` | `[runner, appName, verbs[]]` | `WinetricksApplyResult` | **Resolver** | `GameSettings` for the game (merged defaults, TS until 98) | `winetricksQueueChanged`, `progressOfWinetricks`, `installing-winetricks-component`, `showDialog` |
| `winetricksAvailable`, `winetricksInstalled` | `[runner, appName]` | `WinetricksComponent[]`, `string[]` | **Resolver** | `GameSettings` / `Game` (`library[runner].getGame`) | none |
| `toggleDXVK`, `toggleDXVKNVAPI`, `toggleVKD3D` | `{appName, action:'backup'|'restore'}` | `boolean` | **Resolver** | `gameConfigs.get(appName).getSettings()` | `showDialog` on a download failure |
| `runWineCommand` | `commandParts, wait?, protonVerb?, gameSettings?, ...` | `{stdout, stderr}` | **Resolver** | global `config.getSettings()` is spread under `gameSettings` | none |
| `runWineCommandForGame` | `{appName, runner, commandParts, wait?, pendingInstall?}` | `ExecResult` | **Resolver** | game settings; `assertCommandParts` guard stays shape-only | none |
| `callTool` (in `runnerMiscFlowRegistration.ts`, with 13 other non-87 channels, file shrinks but stays) | `{tool:'winecfg'|'runExe', exe?, appName, runner}` | `void` | **Resolver** | `getGame().getSettings()`, GOG `checkForOfflineInstallerChanges`, `sendGameStatusUpdate` | `gameStatusUpdate`, `pushGameToLibrary` (TS) |

Push event shapes to preserve [VERIFIED: `wineTools.ts` read this session]: `progressOfWinetricks {messages: string[], installingComponent: string, failed?: boolean, lines?: WinetricksLogLine[], percent?: number}` (`failed` only on the `['Done']` event); `installing-winetricks-component(string)`; `winetricksQueueChanged(WinetricksQueueState)`; `wineVersionsUpdated()`; `progressOfWineManager(version, state)` with states `{status:'downloading', percentage, avgSpeed, eta}` ... `{status:'idle'}` [VERIFIED: `wineToolsFlowRegistration.ts` installWineVersion handler]; `gameStatusUpdate {appName, runner, status:'engine-download', context: 'downloading:<n>'|'verifying'|'extracting'|'setting-up'}` and `status:'done'` [VERIFIED: `pinnedEngineProgress.ts`]. Download progress cadence is `throttle(…, 1000)` in TS `downloadFile`, so goldens allow tolerance (D-10).

**Boundary events that are TS-bus inputs to Rust (inverse direction):** `releasesInfoReady` (emitted by `utils/releases.ts`) is consumed by `updateWineListsIfOutdated` and the DXMT listener; `wineVersionInstalled` / `wineVersionUninstalled` are emitted by the wine manager and consumed by DXMT [VERIFIED: grep]. Inside Rust the last two are internal calls. `releasesInfoReady` needs a scheduled shim `wine_releases_info_ready` called from the TS release fetch until that fetch ports (88 or later). The 86 anticheat listener is a separate subscriber and stays.

**Registrations to delete:** `sidecar/engineFlowRegistration.ts` (150 lines) and `sidecar/wineToolsFlowRegistration.ts` (482 lines) are replaced by **one slim `engineWineResolvers.ts`** holding only the resolver channels above (D-24) if OQ3 is accepted; the native channels go in `nativeChannels.json` (`slice: "engine"` / `"wine"`), their zod entries are deleted, the IPC snapshot is regenerated (`pnpm gen:ipc-contract`, `pnpm check:ipc-contract`).

## On-disk state inventory (D-07)

| Artifact | Path | Format today | Writer today -> Rust | Version gate |
|---|---|---|---|---|
| Engine marker | `<CrossOver Bottles root>/<bottle>/.gamelib-engine.json` (`ENGINE_MARKER_FILE = '.gamelib-engine.json'`, `engineSwitch.ts:42`) | `JSON.stringify({ ...marker, version: BOTTLE_FILE_VERSION })` with marker keys in order `kind`, `id`, `wineserverBin`, optional `dxvk` (`{dir, version}` or `"failed"`), then `version` (`engineSwitch.ts:395`); compact, mode 0644, tmp `.gamelib-engine.json.tmp-<pid>` then rename | TS -> Rust; must emit identical bytes (`Obj::insert_js`) | `ENGINE_MARKER_CHAIN = 'engine/gamelib-engine-marker'`, `BOTTLE_FILE_VERSION = 1` (`bottleVersionGate.ts:34,44`); states `absent|ok|unreadable|newer`; write refused on `newer` and on a path nobody asked about. Rust calls `version_gate` in-process before every write |
| Marker read rules | same | kinds `crossover|pinned|wine-manager`; `id` must match `/^[A-Za-z0-9._-]{1,64}$/`; `dxvk.dir` must be inside the pinned-engine root; a `crossover` marker is "contradicted" when `current_dxvk-macOS` exists and then reads as the current pin (`engineSwitch.ts readMarker/viewMarker/trustedMarker`) | read-only helpers also used by the bridge (twin) | n/a |
| Marker inference | same | no trusted marker: DXVK-macOS present -> pinned; conf contains `Timestamp` -> crossover; else pinned (`inferMarker`) | Rust | n/a |
| Bottle conf | `<bottle>/cxbottle.conf` | created once, minimal: `[Bottle]` + `"BottleID" = "<UPPERCASE uuid>"`, `"Encoding" = "UTF-8"`, `"Template" = "win10_64"`, `"MenuMode" = "ignore"`, `"AssocMode" = "ignore"`, `"WineArch" = "win64"`, trailing newline (`adoptBottle.ts buildCxbottleConf`), mode 0644, only if `system.reg` exists and no conf exists, tmp `.cxbottle.conf.tmp-<pid>` + `wx` + rename | TS -> Rust. **The TS never edits an existing conf**; CrossOver upgrades it on first use. Reads: `/Timestamp/` regex, existence | none |
| Per-bottle DXVK files | `<bottle>/current_dxvk-macOS` (`DXVK_VERSION_FILE`) | produced by DXVK install | tools | n/a |
| Pinned-engine marker | `<toolsPath>/steam-engines/<pin id>/.gamelib-pin.json` and `dxvk-macOS-<ver>/.gamelib-pin.json` (`const MARKER = '.gamelib-pin.json'`, `fallbackEngine.ts:34`) | `JSON.stringify({ sha256, version })` (`fallbackEngine.ts:304`) | TS -> Rust | none (no `version` key) |
| Engine root | `<appFolder>/tools/steam-engines/` (`join(deps.paths.toolsPath, 'steam-engines')`; `toolsPath = join(appFolder, 'tools')`, `appPaths.ts:130`). **The 82 table says `<appFolder>/steam-engines/`; amend it** | `.tmp-<kind>-*` unpack dirs swept at boot (G20), unpinned dirs pruned | TS -> Rust | n/a |
| Bottle ledger | none on disk. `createBottleLedger()` is an in-memory `Map<bottle, Set<EngineKey>>` | n/a | n/a | **D-07's "ledger" row is a no-op for disk; the ledger flips as in-memory state (82 row `engine-runtime`)** |
| Engine notices | `store_cache/steam_engine_notices.json`, kind `user-state`, single key `dismissedUntestedCrossoverBuilds` = string[] capped at 50 (`MAX_DISMISSED = 50`, `UNTESTED_DISMISSED_KEY = 'dismissedUntestedCrossoverBuilds'`) | `CacheStore('steam_engine_notices', null, {kind:'user-state'})`, so values and the `__timestamp.<key>` pair follow 86's `CacheView` semantics | TS -> Rust via `StoreHost` | existing store versioning (85) |
| wine-downloader-info | `store/wine-downloader-info.json`, kind `cache`, key `wine-releases` = `WineVersionInfo[]` (`{version,type,date,download,downsize,disksize,checksum,release_notes_link,isInstalled,hasUpdate,installDir}`) | `TypeCheckedStoreBackend` cwd `store` | TS -> Rust | cache: discard on shape change |
| Tool dirs | `<toolsPath>/dxmt/latest_dxmt`, `<toolsPath>/dxmt/<version>`, `<toolsPath>/wine/<name>`, `<runtimePath>/<name>/current_version` (`runtimePath = toolsPath/runtimes`) | plain files | Rust | n/a |
| Shared-redist ledger | `<bottle>/gamelib-shared-redists.json`, chain `steam_bridge/shared-redists` | 95-owned | Rust gate only (already) | gate exists; 87 leaves it |

Fixture set (D-07): build from `FakeHome` bottles with markers `crossover`, `pinned:<current>`, `pinned:<retired id>`, `wine-manager:<ver>`, `pinnedId null`/absent `dxvk`, `dxvk:"failed"`, a marker from `version: 2` (newer), an unreadable marker, a contradicted crossover marker, a marker-less bottle with and without `current_dxvk-macOS` and with and without a `Timestamp` conf. The expected outputs are recorded by the TS oracle.

## Golden scenario matrix (D-08)

| Sub-slice | Scenario axes | Recorded as | Count (floor) | Rust test counterparts (port, drop source-text gates) |
|---|---|---|---|---|
| Engine decision | CrossOver {present-healthy, missing, expired, broken, inconclusive (G29 two-probe)} x pins {current, retired, none} x marker {none, crossover, pinned, wine-manager, null-pinId} x setting {Automatic, forced CrossOver, forced pin, forced wine-manager} x offline {y,n} x bottle {busy, idle} -> `{kind, reason, logLines}` incl. `reason=cx-inconclusive` | JSON cases `{inputs, probes(script), expected}`; probe results scripted (the TS decision is already dependency-injected) | ~80 | `engineDecision.test.ts` (1072 lines) incident cases, `offlineRefusal`, `legacyBottleUntouched` (361) |
| Demo status | `Standard`, `Demo version (N days remaining)`, `expired N days ago`, timeout, nonzero exit, invalid bottle name (`> 255` chars) | stdout fixtures + argv/env trace (`--demo-status`, `CX_BOTTLE`) | ~20 | `demoStatus.test.ts` (181), `testedCrossoverVersions` (96) |
| Bottles + markers + switch | create, reuse, remove, switch {crossover->pin, pin->crossover healthy/unhealthy, pin->wine-manager}, DXVK ok/failed, marker newer/unreadable/contradicted, shared-bottle refusal, `bottle-busy`, `game-running`, WR-02 interleave | before/after trees on `FakeHome` (path, mode, sha) + wineserver kill argv trace + marker bytes | ~70 | `engineSwitch.test.ts` (1597), `perGameBottle` (339), `bottlePrimitives` (99), `bottleLedger` (53), `engineRegistry` (43), `adoptBottle` (76) |
| Fallback engine | download ok/offline/hash-mismatch/size-mismatch/abort/extract-fail/symlink-escape; prune; boot sweep; single-flight with joined callers | replayed HTTP + sha256 outcome + extraction tree + event sequence (`downloading` ... `verifying` -> `extracting` -> `setting-up`) | ~25 | `fallbackEngine.test.ts` (554), `pinnedEngineProgress` (130) |
| Launch step | skip/legacy/use/refused x offline x fallback toast; deadline fire/cancel reasons; process-watch match forms (unix, `Z:`, `Y:`, case-insensitive, trailing separator, basename-only unmatchable) | cases + injected clock + scripted `ps` | ~40 | `launchEngine` (538), `launchEngine.deadline` (314), `launchDeadline` (206), `gameProcessWatch` (208), `processListing`, `launchSettings` (174) |
| Engine state / notices | trial notice `<=7` days, untested build, dismissals cap 50, `engineStateChanged` seq | states + store bytes | ~25 | `engineState` (988), `gameEngineState` (383), `engineConfig` (315), `toolSettings` (376) |
| Wine manager / runtimes | GitHub releases per repo (7 repos, `count`), checksum sha512, install/overwrite/backup-restore, abort, remove; lutris runtimes list and `current_version` | **wine/ first (0.5x ratio)**: replayed HTTP with pinned requests, store bytes, tree after install | ~40 | `removeWineVersion` (107), `wine/**` tests |
| Winetricks | list parse, output classifier, apply guard, queue (sequential, cancel, state transitions), environment reports, install lifecycle | pure vectors + spawn trace (`winetricks`, `which`) | ~60 | `winetricksQueue` (690), `winetricksInstallLifecycle` (592), `winetricksListParse` (365), `winetricksOutputClassifier` (330), `winetricksApplyGuard` (150), `winetricksListAvailable` (493) |
| DXVK/DXMT/vkd3d | install/remove backup+restore, evidence lines, macho export gate, boot fetch | file trees + `reg import` argv + HTTP | ~35 | `dxvkInstallRemove` (576), `dxvkEvidenceLines` (155), `dxmtExportGate` (291), `dxmtBootFetch` (263) |

Every case set carries a `MANIFEST.json` count + `assertAtOrAboveFloor` and a "an empty case list fails" test (82 D-05). **Cross-platform rule:** every golden injects `platform` and a `FakeHome` so the three-OS CI legs replay the macOS-only logic; no case reads the real HOME. Source-text gates to drop: `launcherOverlayCensus`, `managerOverlayCensus`, `winetricksInstallPathInvariant`, `toolSettingsWiring`, `runWineCommandOnGameGuard` (convert the guard to a Rust vector test, keep the behaviour).

## Behaviour goldens cannot capture -> live-gate items (D-09)

| Behaviour | Why a golden cannot see it | Gate item | Source |
|---|---|---|---|
| CrossOver reads its trial licence from the **real HOME** (`~/Library/Preferences/com.codeweavers.CrossOver.license`) | fake HOME hides it; `demoStatus` is the declared real-profile arm | 2 | spike 060 README, `macos-runtime-signals.md` (060) |
| Trial clock lives in the bottle's `system.reg` (`InstallTime` XOR const) and a live wineserver overwrites an edit | needs a real wineserver; backdate with `backdate.py` under `nolicence.sb`, stop the wineserver first | 2 | `.planning/spikes/060-crossover-trial-expiry/{backdate.py,nolicence.sb}`; Phase 61 UAT addendum formula |
| CrossOver adopts a fallback-created bottle (minimal conf, `win64`, `setup --upgrade` on first use) and keeps the save | only CrossOver can prove it | 1 (second half) | `adoptBottle.ts` header; 59-01 measurement |
| wineserver timing: `wineserver -k`, `-w`, DXVK restore leaving a CrossOver wineserver lingering (G30), 180 s `cxbottle --create` cap, 30 min `wineserver --wait` | needs real engines and clocks | 1, 3 | `engineSwitch.ts` G30 comment; `commandRunner.ts:97` `WINESERVER_WAIT_TIMEOUT_MS = 1_800_000`; `engineDecision.ts:42` `CX_CREATE_CAP_MS = 120_000` |
| Fallback engine really downloads 228 MB with progress, verifies, extracts (`tar` xz) from a **signed app** and runs a D3D11 title with DXVK | network, signing and GPU | 1 | pin `wine-staging-11.20` (`enginePins.ts`) |
| Process-watch matching on a real CrossOver (`winewrapper.exe`, Z:/Y: forms) and the 180 s no-match notice that must not raise the window | real process table | 1 (and 61-UAT items 13/14, waived in 61, add one launch >180 s check) | spike 068; 61-HUMAN-UAT item 3 |
| Real `winetricks`, DXVK/DXMT install and remove on a bottle, wine-manager download completes with progress | external binaries and network | 4 | D-11 |
| Signed Phase 87 build over a signed 86 build: existing bottles, markers and notices survive; real spawns work from the signed app (entitlements, `tar`, `wine`) | dev builds do not count | all (D-12) | 85 D-16, 86 D-15 |
| TLS fingerprint / Cloudflare behaviour of reqwest against GitHub API | replay is blind | 4 | 86 Pitfall 11 |
| Native notification + in-app dialog display acknowledgement (`displayAcks`) | UI | 1 | `engineDialogs.ts` |
| Offline refusal | needs a real network drop, scoped to the action (memory: offline-UAT) | 1 | CONTEXT D-11 |

Live-gate authoring rule: the plan that writes the contract may not run it, and every item needs the 7-test Structural Reachability Review [CITED: `.claude/skills/spike-findings-gamelib/references/live-gate-contract-authoring.md` sections 1 to 2]. D-16 correction: WR-01 and WR-02 were **fixed** (61-26, 61-27, quick 261107-v6q), not left as quirks, so port the fixed behaviour (`reason=cx-inconclusive`, marker-preserving, no toast; notice-only deadline with no window raise) [VERIFIED: `61-HUMAN-UAT.md` items 1, 2, 4 read this session]. The quirk todos for this phase are other things (single-connection download, long timezone names, etc.).

## Spawn sites and spawn class (D-17)

| Site (TS today) | Command | Rust class | Notes |
|---|---|---|---|
| `bottlePrimitives.killBottleWineServerWith` | `<wineserver> -k`, env = `process.env` + extra + `WINEPREFIX`, timeout | Helper | real-profile arm (env inherits HOME), declared |
| `createFallbackBottle` | `<wine> wineboot -i` (180 s), `<wineserver> -w` (60 s), env `WINEPREFIX,USER=crossover,WINEDLLOVERRIDES='mshtml=',WINEDEBUG=-all,MVK_CONFIG_LOG_LEVEL=0` | Helper | the bottle is created here; a game's wine is later (88) |
| `perGameBottle.createCrossoverBottle` | `<binDir>/cxbottle --create --bottle <name> --template win10_64` (cap `CX_CREATE_CAP_MS`) | Helper | abortable |
| `demoStatus` | `<binDir>/wine --demo-status` with `CX_BOTTLE`, `stdin ''`, 15 s, 64 KiB cap | Helper | **real-profile arm** (no replaced env unless `baseEnv`), declared |
| `runTool` | `/bin/cp`, `/usr/bin/xattr`, `/usr/bin/codesign`, `/usr/bin/plutil`, `/bin/ps` (allowlist of five), fake-HOME env via `createFakeHomeProfile().childEnv()`, 1 MiB cap | Helper | **isolated arm**; Rust uses `FakeHome`-style temp dir, `stdin ''`, `replaceEnv` |
| `processListing` | `ps -axo pid=,command=` else `pgrep -lf .` | Helper (short) | |
| `fallbackEngine` / runtimes / wine-manager extraction | `tar -xf <path> -C <dest> --strip-components=<n>` (no timeout, caller cancels) | Helper | die with GameLib, no orphans |
| `tools/index.ts` | `<wine> --version`, `winetricks <args>` (long, progress parse), `which <dep>`, `reg import` via `runWineCommand`, DXVK `wine` ops | Helper | winetricks dies with GameLib (D-17); `winecfg`/`runExe` (`callTool`) also Helper to preserve today's interim fate (sidecar-group death); flag in OQ7 |
| `wine/manager/downloader/utilities` | `du <param> <folder>` | Helper (short) | |
| `commandRunner.runWineCommand` (OQ1) | wine/proton/umu with merged env, `track:{runner:'wine'}` | Helper for tools; a launched **game** is Game class but that is Phase 88 | |

Missing seam: `gamelib_core::process::ProcessRunner::run(program, argv, timeout)` has no env/cwd/stdin/abort/streaming, and `ProcRunner` ignores more [VERIFIED: `gamelib-core/src/process.rs`, `gamelib-proc/src/runner.rs`]. Wave 0 adds a `ProcSpec` runner trait to `gamelib-core` and an implementation in `gamelib-proc` built on `spawn_helper_tokio` (which takes a `tokio::process::Command`, so env/cwd/stdin are free). Do not bypass `gamelib-proc`. Add an orphan-style test (`cargo test -p gamelib-proc` already is its own CI step) for a winetricks-shaped child that spawns a grandchild.

## STATE-OWNERSHIP amendment rows (D-05)

Append a `### 2026-11-23 (Phase 87 planning)` amendment to `82-STATE-OWNERSHIP.md` and move `storeMirrorSchedule.test.ts` `SCHEDULE` in the same change (that test copies the column and fails on disagreement) [CITED: 82 doc "Amendments" last paragraph].

| row | cell | old -> new | reason |
|---|---|---|---|
| `pci_ids_device` | TS mirror deleted | 87 -> 88 | GPU info moves with `launcher.ts` (CONTEXT D-05) |
| `pci_ids_vendor` | TS mirror deleted | 87 -> 88 | same |
| `info-caches:systemInfo` (in-memory) | flip | 87 -> 88 | its only consumer is the GPU info the launcher uses; flipping it in 87 would be a row with no owner |
| `wineDownloaderInfoStore` | TS mirror deleted | stays 87 | last TS readers (`config.ts getAlternativeWine`, `utils.ts:1084`, `dxmt`, `installFormIpc.ts`) either port in 87 or reach it through a shim; re-check `installFormIpc.ts` and `utils.ts` at plan time |
| `steam_engine_notices` | TS mirror deleted | stays 87 | store is read only by `engineState`, ported in 87 |
| `steam-engines-dir` | flip | stays 87; **file column** `<appFolder>/steam-engines/` -> `<appFolder>/tools/steam-engines/` | [VERIFIED: `fallbackEngine.ts` `join(deps.paths.toolsPath, 'steam-engines')`, `appPaths.ts:130`] |
| `engine-state`, `engine-runtime` | Rust owner | owner token stays R at 87 **but** add a sub-note: `engine-runtime:registry` has a scheduled TS write-through view until 96 (OQ4) | D-03 |
| `tools-state`, `winetricks-queue` | "Rust owner after flip" cell | `gamelib-engine` -> `gamelib-wine` | D-04 puts tools and Winetricks in `gamelib-wine` |
| `engine-runtime` notes | content | drop "ledger" from the persisted list; it is in-memory only | verified above |

## Recommended sub-slice order and plan breakdown

**Order (departs from CONTEXT's list, which is discretion):** wine-command core and DXVK first because the switch and `createFallbackBottle` need `DxvkInstaller`; then bottles/markers/switch (the bridge shims and the decision depend on them); then decision and fallback; then state and the launch step; then wine-manager/runtimes/Winetricks; shims and resolvers; deletion; live gate. Intra-phase shims (TS engine code calling a Rust-ported callee) die inside 87 and are not schedule rows; the last plan's gate asserts only scheduled shims remain.

| Wave | Plan | Content | Est. size |
|---|---|---|---|
| 0 | 87-01 | Live-gate contract authored (4 items + 7-test review) ; `COVERAGE.md` for the new HTTP surface (INTEGRATE/OPT-OUT: GitHub releases API for 7 wine repos + dxvk/dxvk-nvapi/vkd3d-proton/dxmt/Gcenx, `raw.githubusercontent.com/Winetricks/winetricks/master/src/winetricks`, `lutris.net/api/runtimes`, pinned Gcenx archives); 82 amendment; schedule + `*PortComplete` test skeletons | S |
| 0 | 87-02 | Crates + CI + lockfile + README; `ProcSpec` seam in core/proc; `Fetch`+`Replay`; `enginePins.json`; `EngineCtx`/`WineCtx`; dispatch skeletons; native/ipc-contract plumbing | L |
| 0 | 87-03 | TS golden harness core: spawn-trace and tree recorders, manifest floors, vacuous guards, bottle/marker fixture set (D-07) | M |
| 0 | 87-04 | `wine/` + `tools/` goldens first (HTTP replays, sha512, extraction trees, winetricks vectors) | M |
| 1 | 87-05 | wine command core (OQ1): env builders, `valid_wine`, `run_wine_command`, prefix check; goldens | L |
| 1 | 87-06 | DXVK/vkd3d/dxvk-nvapi install/remove, DXMT, macho gate, tool settings; `DxvkInstaller` impl | L |
| 2 | 87-07 | bottle paths/sanitize/conf/ledger/registry/marker+gate (+ TS twin + vector test) | M |
| 2 | 87-08 | engine switch (`prepare_bottle_for_engine`, kill, restore) + per-game bottle + prefix/config/ids/key | L |
| 3 | 87-09 | CrossOver locate/demo/tested/run_tool + `tar` extract | M |
| 3 | 87-10 | engine decision + offline refusal; decision goldens | L |
| 3 | 87-11 | fallback engine (download/verify/extract/prune/sweep/progress) | M |
| 4 | 87-12 | engine state, notices, `engineStateChanged`, native channels (4) | M |
| 4 | 87-13 | launch step, deadline, watch, dialogs/toasts sinks, launch settings | L |
| 5 | 87-14 | wine-manager releases + install/remove + `wine-downloader-info` + (OQ2) discovery | L |
| 5 | 87-15 | runtimes + wine channels native | S |
| 5 | 87-16 | Winetricks queue/env/guard/parse/classify/install | L |
| 6 | 87-17..87-20 | shims and resolvers: bottle twin and engine shims; `engineSelectionView`; tools/wine resolvers; launcher/gog/nile shims; `releasesInfoReady` shim; schedule rows | 4 x M |
| 7 | 87-21..87-26 | per sub-slice TS + registration deletion (engine, bottles, wine/runtimes, tools), census/source-shape test sweep, knip, `meta/backendDiCeilings`, IPC snapshot, `engineWineResolvers.ts` | 6 x S-M |
| 8 | 87-27 | live-gate **run** plan (different author from 87-01), signed build | M |

~27 plans. Parallelism: wave 0 plans 02 to 04 and wave 5 plans 14 to 16 are independent. Delete-in-the-same-or-next-plan (D-06) holds per sub-slice, with the wave 6/7 split only because the bridge shims must exist before the TS owner is deleted.

## Common Pitfalls

### Pitfall 1: The core `ProcessRunner` cannot express the spawns
**What goes wrong:** engine/wine spawns need env, `replaceEnv`, cwd, stdin text, abort, 1 MiB output caps and per-line streaming (winetricks progress); the shared trait has none. **Avoid:** add `ProcSpec` in wave 0, keep `gamelib-proc` as the only spawner. **Warning signs:** a domain crate importing `std::process::Command`.

### Pitfall 2: `launcher.ts` env building is a hard dependency
`runWineCommand`, `setupEnvVars`, `setupWineEnvVars`, `validWine` are imported by `tools/index.ts` (`deps.launcher.setupEnvVars/setupWineEnvVars/validWine`, `deps.commandRunner.runWineCommand`) [VERIFIED: `tools/index.ts:231-233,969,1008-1022`]. `setupWineEnvVars` is ~170 lines of pure branching on `GameSettings`, platform, `process.env` and a few `existsSync` probes [VERIFIED: `launcher.ts:1294-1470`]. Port exactly these four into `gamelib-wine::wine_cmd` with goldens; 88 extends them. Until 88 the TS copies stay (duplication guarded by the same goldens running on both sides). See OQ1.

### Pitfall 3: Marker JSON bytes
`JSON.stringify` key order is insertion order and the version key is **last**; integer-like keys do not occur but `dxvk` may be the string `"failed"`. Use `Obj::insert_js`; assert bytes in goldens, not parsed equality. Non-ASCII paths: JS leaves them literal, serde_json does too, but lone surrogates and `\u007f` differ; add a vector.

### Pitfall 4: `existsSync`-then-act ordering and sync fs inside "async" TS
Many TS paths are `existsSync` checks followed by an await; Rust interleaves differently. Use per-bottle serialisation matching the TS `inFlightSwitches` map (a waiting call re-reads the marker) and a per-key mutex on the registry. Golden: two concurrent switches of one bottle (WR-02).

### Pitfall 5: Rust-owned timers and the exit budget
The 180 s launch deadline and the process watcher are timers; in Rust they are tokio tasks holding a Registrant and watching `global().token()`; at exit they cancel (they must not fire a notice during shutdown). The unref'd TS timers had the same intent [VERIFIED: `launchEngine.ts` header]. Boot work: the stale-temp sweep (`sweepStaleEngineTemps`, synchronous, bounded) and any DXMT boot update (`dxmtBootUpdate`) must be bounded; the latter does a network fetch and must not run unbounded at boot [CITED: README section 9 notes the caller was blocked in 63; `tools/dxmt.ts:232`].

### Pitfall 6: Unguarded deletes in the TS being ported
`removeWineVersion` does `rmSync(installDir, {recursive:true})` on the stored `installDir`; the runtimes download does `rmSync(extractedFolderPath, {recursive:true})`; `pruneUnpinnedEngines` and `sweepStaleEngineTemps` use a local `isContained`; `removeCreatedBottleDir` uses a local `relative()` check [VERIFIED: greps and reads this session]. D-19 requires `gamelib-safety` for all of them. A guard that refuses may differ from the TS (which deleted); that is a **deliberate** hardening permitted by D-19/FND-02, not a D-16 violation, but record each refusal-vs-TS difference as a recorded golden delta, not a silent one. Choose trust roots explicitly: bottles root, `<tools>/steam-engines`, `<tools>/wine`, `<tools>/runtimes`.

### Pitfall 7: Download semantics (EasyDl) vs reqwest
TS does a `HEAD` for `content-length` then multi-connection download with 1 s throttled progress; failure to HEAD aborts with `'Failed to get headers'`; abort message `'Download stopped or paused'` maps to `aborted`. The wine-manager flow checksums with sha512 over `readFileSync` and accepts a **missing** checksum with a warning (Wine-Staging-macOS has none) [VERIFIED: `wine/manager/downloader/main.ts`]. Preserve both outcomes; fixtures include a checksum asset present and absent.

### Pitfall 8: GitHub API and TLS fingerprint
Seven release feeds are `api.github.com`; axios sends the GameLib `User-Agent`, reqwest must send the same descriptive agent (pinned header, 86 D-10) or GitHub may 403. Unauthenticated rate limits (60/h) apply as before. Only a live run proves it (gate item 4).

### Pitfall 9: Sync reads that silently go async
`getBridgeBottleSettings` looks like a pure function; its registry read is the hidden ripple. Plan the `engineSelectionView` before touching `bridgeBottle.ts`, or `tsc` fails across 6 files.

### Pitfall 10: `AbortSignal` over rustInvoke
`RunTool`, `prepareBottleForEngine` (`signal`), `createCrossoverBottle`, `ensurePinnedEngine` take an `AbortSignal`. A signal cannot cross the frame boundary. Each cancellable op takes a `cancelId`; the shim calls `engine_cancel {cancelId}` on abort; stdin-EOF/quit cancels through the Shutdown token (the sidecar `callAllAbortControllers` path today).

### Pitfall 11: Resolver registrations and the SC4 wording
Without Rust `GameSettings` resolution, ten renderer channels remain TS resolvers, which reads against SC4 "registrations deleted". 86 handled the same case with D-24 and a ROADMAP reading change; confirm the same here (OQ3).

### Pitfall 12: Fixtures and secrets
Recorded GitHub responses carry no secrets, but recorded bottle trees include `USER`/home paths; redact like 86 (`fixtureRedaction.test.ts` pattern) and never commit a real `cxbottle.conf` BottleID from the operator's machine.

## Code Examples

### Marker write (byte parity)
```rust
// Source: design; TS reference engineSwitch.ts:395 JSON.stringify({ ...marker, version: BOTTLE_FILE_VERSION })
let mut o = Obj::new();
o.insert_js("kind", Json::str(kind));
o.insert_js("id", Json::str(id));
o.insert_js("wineserverBin", Json::str(ws));
if let Some(d) = dxvk { o.insert_js("dxvk", d.to_json()); } // object {dir,version} or the string "failed"
o.insert_js("version", Json::num(1));
let bytes = o.to_compact_string();   // compact, no trailing newline
// gate first: version_gate(path, "engine/gamelib-engine-marker") != Newer, then tmp ".gamelib-engine.json.tmp-<pid>" 0644 + rename
```

### Shim shape (callers keep the signature)
```ts
// Source: README section 3 step 6; 86 shim rule (one typed call, nothing else)
export async function decideLaunchEngine(deps: DecideDeps, args: DecideArgs): Promise<LaunchDecision> {
  return invokeEngine(RUST_ENGINE_DECIDE_LAUNCH, [toRustDecideArgs(deps, args)]) // monitorPhase/readOverride resolved to values by the caller
}
```

### Spawn through gamelib-proc with a spec
```rust
// Source: gamelib-proc/src/spawn.rs spawn_helper_tokio(cmd: &mut tokio::process::Command, label)
let mut cmd = tokio::process::Command::new(&spec.program);
cmd.args(&spec.argv).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
if spec.replace_env { cmd.env_clear(); }
cmd.envs(&spec.env); if let Some(c) = &spec.cwd { cmd.current_dir(c); }
let (child, _guard) = gamelib_proc::spawn::spawn_helper_tokio(&mut cmd, "engine-cx-probe")?;
// race child.wait_with_output() against timeout and global().token(); dropping the future kills (kill_on_drop)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| Engine registry/ledger/deadlines as per-boot TS objects | Rust-owned in-memory state with a TS view for the sync bridge reads | 87 | needs OQ4 sign-off |
| Marker gate asked over rustInvoke before each TS write | in-process `version_gate` in Rust | 87 | `bottleVersionGate.ts` memo and `primeMarkerGate` die with the TS writers |
| Sidecar relays `engineStateChanged` | Rust emits through `FrontendEmitter` | 87 | remove the publisher from `sidecar/bootstrap.ts` 'engine-state' step |

**Deprecated/outdated:** the `GAMELIB_ENGINE` flag idea (83 D-05 helper) stays unbuilt; `engine/engineRuntime.ts`, `engineServices.ts`, `services/engineServices.ts`, `testUtils/testEngine*.ts` and the boot steps `engine-state`, `engine-runtime`, `tools-state`, `winetricks-queue` in `sidecar/bootstrap.ts` are deleted with their last consumer.

## Runtime State Inventory (rename/migration-shaped: state that must survive the owner change)

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `.gamelib-engine.json` (per bottle), `.gamelib-pin.json` (per pinned dir), `store_cache/steam_engine_notices.json`, `store/wine-downloader-info.json`, `current_dxvk-macOS`, `tools/dxmt/*`, `tools/runtimes/*/current_version` | **Code edit only**: Rust writes the same bytes; no data migration. Proven by the D-07 fixture set |
| Live service config | None. CrossOver's own conf/registry are edited by CrossOver, not by GameLib | None |
| OS-registered state | None for this phase (no launchd/Task Scheduler entries). Running wineservers per bottle are runtime state: a quit must not leave them as orphans (FND-04) | gate item 3 verifies sibling untouched; reaper covers Helper children |
| Secrets/env vars | None read by name here, except `process.env` inheritance in the real-profile arms (`HOME`, `LD_LIBRARY_PATH`, `LD_PRELOAD`, `SteamAppId`, `STEAM_COMPAT_APP_ID`, `SteamGameId`) read by `setupWineEnvVars` | Rust must read the same variables from the process env passed in `ProcSpec` (not from a test-faked env) |
| Build artifacts | sidecar SEA bundle shrinks; `pnpm build:sidecar-sea` must be rebuilt before live testing (memory: tauri dev does not rebuild the sidecar); `Cargo.lock` gains workspace names | rebuild; update `EXPECTED_LOCKFILE_CRATE_NAMES` |

Stale-reference sweep (breaks CI if missed): `src/backend/__tests__/diPhaseGates.test.ts`, `storeKinds.test.ts`, `moduleStateCensus`, `meta/backendDiCeilings` baselines, `sidecar/__tests__/*Flows.test.ts`, `registrationOncePerBoot.test.ts`, `bootSourceShape.test.ts`, `stores/__tests__/createStores.test.ts` and `fixtures/registeredStores.json`, `testUtils/testServices.ts`, `services/types.ts`, `knip` baseline, electron-reach ledger; grep every deleted path across `src/` and `meta/` first [CITED: 86-RESEARCH sweep list; paths are ASSUMED to still apply].

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The enclosing function of each of the 12 `getLaunchSettings` sites is async (awk heuristic; `launcher.ts:331`, `nile/setup.ts:126` unconfirmed) | Sync call-site count | an extra sync ripple in launcher/setup |
| A2 | `publishOverlayNotice` / `publishOverlayExitNotice` return value is log-only | Sync call-site count | a boolean decision would need a sync answer |
| A3 | `callTool`'s Helper classification matches today's behaviour (winecfg/exe die with the sidecar group) | Spawn sites | a user tool dying on quit might be unwanted; decide in OQ7 |
| A4 | A write-through TS selection view is acceptable and race-free because the selection is returned by the same Rust op that sets it | Sync call-site count | stale view if Rust clears a selection by itself (deadline/exit); mitigate with an explicit clear reply |
| A5 | Rust can reproduce the default global wine (`first wine on PATH` + `getWineExecs`) so `getDefaultEngine` can be native | Channel map | otherwise it becomes a resolver |
| A6 | The pre-existing census/source-shape tests listed in the stale-reference sweep still exist unchanged | Runtime State Inventory | plan-time grep corrects it |
| A7 | ~27 plans / 8 waves fits one context each (86 needed 26 plans for ~38% less source) | Breakdown | replan if a plan overruns |
| A8 | Single-stream download is an acceptable replacement for 5-connection EasyDl (no functional difference) | Alternatives | a slow 228 MB first-need download; filed as a quirk todo |

## Open Questions

1. **Wine command core scope (blocker).** *What we know:* DXVK/vkd3d, Winetricks, `createFallbackBottle`'s DXVK step and every wine-tools channel call `runWineCommand`/`setupEnvVars`/`setupWineEnvVars`/`validWine`, which live in `commandRunner.ts`/`launcher.ts` (Phase 88). *Unclear:* CONTEXT says argv/env building is 88. *Recommendation:* port exactly these four into `gamelib-wine::wine_cmd` in 87 (golden argv/env traces recorded from the TS), 88 extends them with launch wrappers and deletes the TS copies. Needs user confirmation and a CONTEXT amendment.
2. **Wine discovery scope.** `getAlternativeWine`, `getCrossover` (mdfind), `getWineOnMac`, `getWineskinWine`, `getGamePortingToolkitWine`, `getWhisky`, `getLinuxWineSet` live in `utils/compatibility_layers.ts` (673 lines), unnamed in CONTEXT [VERIFIED: file read]. `resolveCrossoverBinDirAsync` needs `getCrossover`. *Recommendation:* port the macOS set plus `getAlternativeWine` and the custom-path reader in 87 (`gamelib-wine::discovery`); Linux set ported with goldens only. Confirm, or schedule it to 88 with a shim.
3. **Resolver registrations vs SC4.** Without a Rust `GameSettings` merge (global defaults live in TS until 98), ten renderer channels stay resolvers (`getEngineState`, `winetricksApply/Available/Installed`, `toggleDXVK*`, `runWineCommand`, `runWineCommandForGame`, `callTool`). *Recommendation:* one slim `engineWineResolvers.ts`, schedule rows deleting at 88 (launcher/GameSettings) and 92/96, and amend the ROADMAP SC4 reading the way 86 D-24 did.
4. **Third survivor shapes.** Approve (a) the sync "pure-helper twin" (`bottlePaths.ts`: `getBottleDir`, `sanitizeBottleName`, `isBottleProvisioned`, marker/pin readers, `buildFallbackGameSettings`) and (b) the write-through `engineSelectionView`, both scheduled for 96, as D-03 allows "keep a sync read" but D-21 names only shims and resolvers. The alternative is ~58 + 18 async ripples into 96/97 code.
5. **Crate cycle.** Confirm the `DxvkInstaller` trait (engine-owned, wine-implemented) rather than moving DXVK into `gamelib-engine`.
6. **Global default wine.** Confirm Rust may compute `first wine on PATH` for `getDefaultEngine` (A5), including `Default Wine - Not Found` legacy labelling.
7. **`callTool`/`runWineCommandForGame` spawn class.** Helper (parity with the interim) or Game (an installer a user launched should survive a quit)? Recommendation: Helper, revisit in 88.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Rust toolchain | build, `cargo test -p gamelib-engine -p gamelib-wine` | yes | cargo/rustc 1.99.1 | none needed |
| Node + pnpm + Jest | TS golden harness, shims, gates | yes | node 22.23.4, pnpm 10.28.0 | none |
| macOS (this machine) | live gate | yes | Darwin arm64 | none |
| CrossOver.app | gate items 1 to 3 | yes | `/Applications/CrossOver.app` present | none; trial expiry items need operator approval each time (Phase 59 item 6 precedent) |
| `tar`, `xz` | extraction | yes | `/usr/bin/tar`, `/opt/homebrew/bin/xz` | none |
| `winetricks`, system `wine` | gate item 4, wine-tools goldens | **no** (not on PATH) | n/a | goldens use scripted spawn; gate item 4 needs a bottle's winetricks (macOS winetricks is installed by the user per the tools' own message) |
| Network to GitHub / lutris | recording HTTP goldens, gate | yes (operator) | n/a | replay offline; the recorder needs network once |
| Signed build pipeline | D-12 | per 85 D-16 | n/a | none |

**Missing with no fallback:** none blocking planning. **Missing with fallback:** `winetricks`/`wine` on PATH (record traces with scripted runners; live item 4 on the operator's setup).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29.7 (TS goldens, shims, gates) + `cargo test` (Rust goldens, units) |
| Config file | `src/backend/jest.config.js`; Rust per crate (`src-tauri/crates/gamelib-engine/`, `gamelib-wine/`) |
| Quick run command | `pnpm jest src/backend/engine src/backend/tools src/backend/wine --silent` ; `cargo test -p gamelib-engine -p gamelib-wine` (run from `src-tauri`) |
| Full suite command | `pnpm test:ci` ; `cargo test -p gamelib-safety -p gamelib-testutil && cargo test -p gamelib-proc && cargo test -p gamelib-engine -p gamelib-engine-cli -p gamelib-wine -p gamelib-wine-cli ... && cargo test --bin gamelib-shell` ; `pnpm check:ipc-contract` ; `pnpm planning-gates` |

### Phase Requirements -> Test Map
| Req / SC | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| SVC-02 / SC1 | decision matrix, CrossOver-first, fallback to pin | Rust golden replay | `cargo test -p gamelib-engine --test golden_decision` | Wave 0 |
| SVC-02 / SC1 | launch step, deadline, process watch | Rust unit + golden | `cargo test -p gamelib-engine --test golden_launch` | Wave 0 |
| SVC-02 / SC1 | fallback download/verify/extract + events | Rust replay | `cargo test -p gamelib-engine --test golden_fallback` | Wave 0 |
| SVC-02 / SC1 | live healthy/fallback/adopt | live gate (operator, signed build) | `87-UAT.md` items 1 to 2 | Wave 0 (authored) |
| SVC-02 / SC2 | bottle create/reuse/remove, sibling-safe, markers byte-equal, newer marker kept | Rust golden + safety table | `cargo test -p gamelib-engine --test golden_bottles` | Wave 0 |
| SVC-02 / SC2 | TS twin == Rust vectors | Jest + Rust shared JSON | `pnpm jest src/backend/engine/__tests__/bottlePathsVectors.test.ts` | Wave 0 |
| SVC-02 / SC3 | wine-manager/runtimes/winetricks/DXVK goldens | Rust golden replay | `cargo test -p gamelib-wine` | Wave 0 |
| SVC-02 / SC3 | live tools and downloads | live gate item 4 | `87-UAT.md` | Wave 0 |
| SVC-02 / SC4 | TS and registrations deleted; only scheduled shims/resolvers remain | Jest gate | `pnpm jest src/backend/__tests__/engineWinePortComplete.test.ts src/backend/__tests__/engineWineShimSchedule.test.ts` | Wave 0 |
| FND-04 | no orphan winetricks/tar/wine helper after quit | `gamelib-proc` orphan harness arm | `cargo test -p gamelib-proc` | extend |
| FND-06 | markers/notices/wine-downloader-info round trip, newer never overwritten | Rust golden | `cargo test -p gamelib-engine --test roundtrip_state` | Wave 0 |
| D-14 | channel parity (OPS == constants == arms), IPC snapshot | Jest + gen | `pnpm check:ipc-contract` | exists |

### Sampling Rate
- **Per task commit:** the touched crate's `cargo test -p <crate>` plus the touched Jest folder, and `npx prettier --check` over the exact written paths (convention; `--file-info` first, omit over ignored paths such as `.planning`).
- **Per wave merge:** full Rust set above and `pnpm test:ci`, `pnpm codecheck`, `pnpm lint`.
- **Phase gate:** full suite green, three-OS CI green, then `87-UAT.md` run on the signed build before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `engineWinePortComplete.test.ts`, `engineWineShimSchedule.test.ts` (copy `infoPortComplete`, `infoShimSchedule`; with planted-fixture detector self-tests and walk floors)
- [ ] TS golden harness: spawn-trace and tree recorders, `MANIFEST.json` floors, `assertAtOrAboveFloor`
- [ ] `tests/fixtures/{recorded,golden,state}/<slice>/` in both crates, redaction test
- [ ] `ProcSpec` trait in `gamelib-core`/`gamelib-proc` and its orphan arm
- [ ] cross-language vector file for the bottle-path twin
- [ ] `87-UAT.md` (inline `expected:`, `result:` opens with a status word) with the Structural Reachability table

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | n/a |
| V3 Session Management | no | n/a |
| V4 Access Control | yes (path scope) | `gamelib-safety` trust roots; bottle name chokepoint `sanitizeBottleName`; marker `dxvk.dir` and `wineserverBin` must sit inside the engine root or `<tools>/wine` |
| V5 Input Validation | yes | serde `deny_unknown_fields` structs; renderer `commandParts` shape guard (non-empty string array, max 256 x 4096) as in `wineTools.ts`; `WineVersionInfo` from the renderer is untrusted (use the stored `installDir`) |
| V6 Cryptography | yes (integrity) | `sha2` sha256 for pinned archives, sha512 for wine-manager; never hand-rolled |
| V12 Files/Resources | yes | contained extraction (`assertContained`: every symlink must resolve inside the root), temp dir + rename, size check before hash |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal through a bottle name or marker field (T-17-01, T-59-25, T-59-60) | Tampering | one sanitize function, `relative()`-under-root check, trust root from constants never from data |
| Command/argv injection into wine (T-34.5-C6-49-03) | Tampering/EoP | argv arrays only, no shell on any OS (the Windows branch uses a non-shell spawn), shape-only guard |
| Archive escape via symlink | Tampering | post-extract walk and `realpath` containment; hash before extract |
| Substituted release asset (GitHub assets are mutable) | Tampering | pinned size+sha256 for the engine; sha512 when the feed supplies one; warn when absent (parity) |
| Orphaned privileged helper after Force Quit | DoS | `SpawnClass::Helper` + reaper (FND-04) |
| Secret/URL leakage in logs | Info disclosure | `.without_url()` on reqwest errors; fixed-text log lines |
| Sibling bottle deletion (FND-02) | Tampering | `check_removal`/`remove_tree` refuse on Unknown |

## Project Constraints (from CLAUDE.md)

- Stack is React + TypeScript on a Rust/Tauri shell; GameLib is independent of Heroic upstream; do not raise upstream mergeability.
- Work only through GSD commands; GSD commands are written with a hyphen (`/gsd-execute-phase`).
- Conventions to honour (full text in `Skill("gamelib-conventions")`, loaded): spawn and exit work in Rust go through `gamelib-proc` + `gamelib_core::shutdown::global()` Registrant, one 5 s `ExitBudget::DEFAULT`, bound boot work, never `PR_SET_PDEATHSIG` or a hand-rolled kill; any child spawned from `src/` or `meta/` uses `createFakeHomeProfile()` (two-profile rule: isolated by default plus named real-profile arms, here `demoStatus`, `killBottleWineServerWith`, `createFallbackBottle`); sidecar timers unref'd and no unbounded boot work (TS shims create no handle); todo files in `.planning/todos/pending/` carry `severity:`, `platform:`, `ready:` bare/lowercase/in order; UAT items use `### N.` at column 0, inline `expected:`, `result:` opening with a status word; every task `<verify>` runs scoped `npx prettier --check` after `--file-info` (omit for ignored paths such as `.planning`).
- Steam stack facts: Steam CM, sign-in and depot keys are Rust already; launch of Steam titles stays `shell.openExternal("steam://rungameid/{appId}")`; bottled Steam is a narrow fallback and never an engine-step target.
- Memory: dev launch is `pnpm tauri:dev`, not `tauri:dev:run`; `tauri dev` does not rebuild the sidecar; a fresh worktree needs `build:sidecar-sea` + vite build; offline-UAT steps turn the network off only for the action; GSD commit helpers sweep dirty `.planning` unless `--files`; phase completion and out-of-band planning can clobber `STATE.md`; macOS embed items need both titlebar styles (not relevant here).
- Graphify: use `graphify query` before grepping code; do not read `GRAPH_REPORT.md`/`graph.json`; planning questions go to `gsd-graph`.

## Sources

### Primary (HIGH confidence, read this session)
- `87-CONTEXT.md`; `82-STATE-OWNERSHIP.md`; `86-RESEARCH.md` (pattern); `src-tauri/crates/README.md`
- `src/backend/engine/{engineSwitch,bottlePrimitives,bottleLedger,adoptBottle,fallbackEngine,enginePins,engineConfig,gameEngineState,launchEngine,launchDeadline,launchSettings,engineRegistry,engineDialogs,pinnedEngineProgress,runTool,demoStatus,crossoverLocation,testedCrossoverVersions,engineNoticeStore}.ts`
- `src/backend/stores/bottleVersionGate.ts`; `src-tauri/src/store_gate_dispatch.rs`
- `src/backend/sidecar/{engineFlowRegistration,wineToolsFlowRegistration,runnerMiscFlowRegistration}.ts`; `src/common/types/ipc/{engine,wineTools}.ts`; `src/preload/api/wine.ts`
- `src/backend/tools/index.ts` (imports, deps), `wine/manager/{downloader/main,utils,stores}.ts`, `wine/runtimes/*`, `utils.ts` (`downloadFile`, `extractFiles`), `commandRunner.ts`, `launcher.ts` (env builders, `validWine`), `utils/compatibility_layers.ts` (exports), `config.ts` (`getAlternativeWine`)
- Steam call sites under `src/backend/storeManagers/steam/**` (greps listed in the table)
- `61-HUMAN-UAT.md`; `.planning/spikes/060-crossover-trial-expiry/`; `.claude/skills/spike-findings-gamelib/references/{macos-runtime-signals,live-gate-contract-authoring}.md`
- `gamelib-core` (`process.rs`, `emitter.rs`), `gamelib-proc` (`spawn.rs`, `runner.rs`), `gamelib-safety`, `gamelib-store` (`host.rs`), `gamelib-info/src/ctx.rs`, `src-tauri/src/info_dispatch.rs` header, `Cargo.lock`, `package.json`
- `gsd-tools query package-legitimacy check` (8 crates, all OK)

### Secondary (MEDIUM)
- 86 plan structure and size (26 plans) used for the estimate; `82` amendment mechanics.

### Tertiary (LOW)
- Wave/plan sizing (A7) and the enclosing-function classification (A1, A2) are estimates.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH, no new crates, all confirmed in the lockfile and by the seam.
- Architecture and on-disk formats: HIGH, read from source this session.
- Sync call-site table: MEDIUM, counts from grep and a heuristic for async-ness; the planner must confirm each row.
- Scope gaps (OQ1 to OQ3): HIGH that they exist, LOW on the right resolution until the user decides.
- Pitfalls and live-gate list: MEDIUM-HIGH, grounded in spikes 060/068 and 59/61 records.

**Research date:** 2026-11-23
**Valid until:** 2026-12-07 (fast-moving: Phases 88 and 95 to 97 may reshape the shim schedule)
