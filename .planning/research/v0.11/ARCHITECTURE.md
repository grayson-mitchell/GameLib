# Architecture Patterns

**Domain:** Retiring the Node SEA sidecar: porting ~129k lines of backend TS to Rust inside the Tauri v2 shell
**Milestone:** v0.11 Node Sidecar Retirement (phases start at 82)
**Researched:** 2026-11-17
**Confidence:** MEDIUM-HIGH for the seam, the ownership model and the deletion list (read from code). MEDIUM for subsystem dependency edges (import counts are a heuristic grep that misses relative imports). LOW for line counts per phase (rough).

## 1. Current state, mapped

### 1.1 Request path

```
renderer  window.api.*  (src/preload/ipc.ts factories, tauriTransport.ts)
   |  tauriInvoke('sidecar_invoke' | 'sidecar_send' | 'open_external' | 'sidecar_store_snapshot')
   v
Rust shell  src-tauri/src/relay_commands.rs
   |  relay_channel_verdict(): channel must be in ipc_contract.rs RENDERER_CHANNELS (generated, ~237 names)
   |  SidecarState::invoke / send queue  (src-tauri/src/shell_state.rs, per-channel timeout_for)
   v  one JSON line per frame on the sidecar's stdin
Node SEA sidecar  src/backend/sidecar/sidecarRpc.ts -> ipcRegistry (handle/on) -> *FlowRegistration.ts (~8k lines) -> backend modules
   ^  responses and pushes on stdout; src-tauri/src/sidecar.rs start_reader routes them:
   |    response -> pending table;  kind:"send" -> webview event `frontend_message`;
   |    kind:"rustInvoke" -> src-tauri/src/rust_dispatch.rs dispatch_rust_channel (exhaustive match over generated RustInvokeChannel)
```

Facts that shape the plan:

- **Everything a renderer call touches goes through one relay.** `sidecar_invoke` has no Rust-native branch today. The only Rust-served renderer features (store embed, login window, tray, clipboard) are reached by the sidecar calling `rustInvoke` back into Rust, so the sidecar is still the front door. A Rust-native renderer channel therefore needs a new, small router, not a new transport (section 2).
- **Contract source of truth is TS.** `src/common/types/sidecarTransport.ts` (1355 lines, constants and `RUST_INVOKE_CHANNELS`) plus `src/common/types/ipc/*.ts` generate `src-tauri/src/ipc_contract.rs` through `meta/genIpcContract.ts` (`pnpm gen:ipc-contract`, `pnpm check:ipc-contract` in CI). Argument validation lives in the sidecar (`src/backend/sidecar/ipcValidation.ts`, `channelSchemas.ts`); the relay only checks the name.
- **The renderer reads stores synchronously.** `tauriTransport.ts` keeps a local snapshot fed by `sidecar_store_snapshot` (boot), `sidecar:store-fetch` (lazy per-store hydrate), `storeNew`/set/delete sends, and `storeChanged` pushes. This is a second renderer-facing contract besides the ~237 channels and it is owned by `src/backend/sidecar/storeWriteHandlers.ts` and `fileStore.ts`.
- **Shell to sidecar calls exist and must be inverted.** Phase 80's `steamPollStateEvent` (ack, outbox, seq guard, 5 s bound; `src-tauri/src/steampoll_dispatch.rs`, `src/backend/sidecar/steamPollEventRegistration.ts`) and Phase 73's `ShellJobHost` (CDN tokens and request codes through `SidecarState::invoke`, `src-tauri/src/depot_dispatch.rs`) are Rust calling into TS. Each is a dual path that disappears when its TS counterpart (libraryState, the CM session) is in Rust.
- **Process lifecycle is coupled.** Quit routes through the sidecar (`quit_via_sidecar` in `src-tauri/src/main.rs` -> sidecar `handleExit()` -> `app_exit`), the shell shows a dead-sidecar dialog on EOF (`sidecar.rs` `show_dead_sidecar_dialog`), and `main.rs` sets shell env for the sidecar at spawn (Steam dirs, app root, shell exe).
- **Existing Rust units** (`src-tauri/crates`, all Tauri-free, `dispatch(op,args)` contract, README is the recipe): `gamelib-scan`, `gamelib-steamfiles`, `gamelib-steamcm`, `gamelib-depot`, `gamelib-steampoll`, `gamelib-i18n` plus `-cli` bins. Shell glue lives in `*_dispatch.rs` modules wired by arms in `rust_dispatch.rs`. Phase 71 decomposed the shell into modules; `main.rs` is still ~1850 lines of wiring.

### 1.2 Backend size map (non-test TS lines, measured)

| Area | Lines | Note |
|------|-------|------|
| `storeManagers/steam` | ~48.6k | of which `bridge/` 18.2k, `library/` 3.4k, `depot/` 2.1k + `depotRust/` 1.9k (wrappers), `cm/` 0.6k, `pollRust/` 0.2k |
| `sidecar/` | ~18.0k | bootstrap.ts alone 3.25k; flow registrations ~8k; this is the RPC shell and dies with the sidecar |
| `engine/` | 7.0k | CrossOver/Wine engine selection, bottle prep |
| `humble/` | 6.2k | |
| `storeManagers/gog` | 5.1k, `legendary` 4.2k, `nile` 2.0k, `sideload` 0.4k | spawn bundled legendary/gogdl/nile |
| `utils/` | 3.2k, `tools/` 2.9k, `shortcuts/` 1.9k, `downloadmanager/` 1.4k, `wine/` 1.3k, `wiki_game_info/` 1.3k, `signInProbe/` 1.1k, `process/` 1.0k, `logger/` 0.9k, `crossover_index/` 0.8k, `storeVersioning`+`storeMigrations` 1.4k | |
| `config.ts` 423, `typed_store.ts` 158, `store_backend.ts` 274, `stores/` 277, `sidecar/fileStore.ts` 432 | the store stack | |

Note the milestone text says "~129k lines"; the measured non-test backend sum is lower, so confirm what the 129k includes (tests, mocks, testUtils 3.7k) before sizing phases.

### 1.3 Dependency graph (who depends on whom)

Counts are files outside the module that import it (absolute `backend/...` imports only; relative imports are undercounted, so read as ordering, not as exact).

```
ROOTS (everything imports):   logger (200 files) -> utils (83) -> engine (45) -> config (20-41), stores/typed_store
                              ManagerDeps / Stores / HostServices (src/backend/services/types.ts, DI since Phase 66)
MIDDLE (consumed by managers): engine, wine, tools, process, crossover_index, wiki_game_info, game_config, launcher
Steam hub:                    steam/library/libraryState (SteamLibraryState in steam/state.ts, 68 lines; factory
                              createSteamLibraryState) <- read by every steam module (games.ts, refresh, install,
                              uninstall, update, launch, macArch, gameSessionState, bridge install state)
CONSUMERS (leaf-ish callers): humble (-> stores, steam managers, signInProbe), downloadmanager (-> all managers),
                              shortcuts (-> managers, wiki_game_info), signInProbe (-> managers, humble),
                              tools (-> engine), wiki_game_info (-> crossover_index, managers)
SIDECAR-ONLY (dies):          sidecar/*, bootstrap boot steps, ipcRegistry, fileStore shim, handlers.ts
```

Edges that decide ordering:

1. `logger` and `config`/`stores` are imported by essentially everything, but they are imported through DI (`Stores`, `ManagerDeps`, `BootServices` in `services/types.ts`), which already abstracts construction. That is the seam to replace, not 259 call sites.
2. Every Steam module reads `libraryState`; the Phase 80 handler is the only writer outside TS poll code. Porting any Steam service before `libraryState` forces a Rust to TS read-back call.
3. `engine/wine/tools/process` are prerequisites of the Steam bridge (18k lines of bottle, shim and launch code) and of the Epic/GOG/Amazon launchers (wine launch args).
4. `downloadmanager` imports all store managers' install APIs, so it goes after or with them. `humble` and `signInProbe` import steam managers (ownership cross-reference, sign-in state).
5. The renderer store bridge (`sidecar:store-*`, `storeChanged`) depends on the store layer, so it moves with it.

## 2. Recommended Architecture

### 2.1 Target

```
renderer (unchanged window.api, same channel names, same payload shapes)
   | tauriInvoke('sidecar_invoke'|'sidecar_send'|...)  <- command names stay, internals change
   v
src-tauri/src/relay_commands.rs
   |-- allowlist check (RENDERER_CHANNELS, unchanged)
   |-- NEW: native_router::lookup(channel)  -- Rust-owned channels run in-process
   |        else fall through to the sidecar relay (shrinks every slice, deleted in the last phase)
   v
src-tauri/src/<domain>_native.rs    thin: parse args, call crate, map result   (one per slice)
src-tauri/crates/gamelib-<domain>   Tauri-free logic, dispatch(op,args) + JobHost-style traits
src-tauri/crates/gamelib-core (NEW) paths, store host, logger, settings view, events trait (FrontendEmitter), clock, process runner
```

### 2.2 Component boundaries

| Component | Responsibility | Communicates with | New / modified |
|-----------|----------------|-------------------|----------------|
| `relay_commands.rs` | allowlist, then native router, then sidecar relay | native router, `SidecarState` | modified |
| `native_router.rs` | table `channel -> handler` for invoke and send kinds; handlers are `async fn(args, &AppState) -> Result<Value,String>` | `*_native.rs` modules | new |
| `meta/genIpcContract.ts` + `ipc_contract.rs` | adds generated `NATIVE_INVOKE_CHANNELS` / `NATIVE_SEND_CHANNELS` sets; one channel has exactly one owner | TS contract | modified |
| `gamelib-core` crate | shared foundations every domain crate takes by trait: `Paths`, `StoreHost`, `Logger`, `FrontendEmitter`, `Settings` view, `Clock`, `ProcessRunner` (the last two already exist in `gamelib-steampoll`; hoist them) | all domain crates | new |
| Domain crates (`gamelib-wiki`, `-crossover`, `-engine`, `-steamlib`, `-steambridge`, `-legendary`, `-gog`, `-nile`, `-humble`, `-downloads`, `-shortcuts` ...) | logic, parity goldens, CLI where `meta/` needs it | `gamelib-core`, other domain crates by trait | new |
| `*_native.rs` shell modules | Tauri glue only (AppHandle, webview emit, notifications) | native router, crates | new |
| `src/backend/**` TS | shrinks per slice; survivors become thin `rustInvoke` wrappers (63 recipe step 5) | shell via `requestRustInvoke` | modified then deleted |
| Sidecar, SEA build, JSON-RPC bridge | host for not-yet-ported code | shell | deleted last |

### 2.3 Re-pointing one channel (the per-slice mechanic)

Two kinds of slice exist and most subsystems are both. Plan each for both:

- **Renderer-channel slice.** A channel the renderer calls. Steps: (1) implement the handler in the crate and a `*_native.rs` arm; (2) add the channel to the generated native set; (3) delete the sidecar `ipcRegistry.handle` registration in the relevant `*FlowRegistration.ts`; (4) a static parity test asserts crate ops == channel constants == router arms and that no sidecar registration remains for a native channel (the existing `scanChannelParity.test.ts` style, generalised); (5) move the arg schema from `channelSchemas.ts` to a `serde(deny_unknown_fields, rename_all = "camelCase")` struct, because validation moves with the handler (T-28 style: validate before use, keep the `[GAMELIB_IPC_INVALID_CHANNEL]` marker behaviour).
- **Internal-function slice.** A function other TS code still calls (for example `getInstallInfo` used by the download manager). Keep the TS signature as an async `rustInvoke` wrapper (63 D-09: async where it was sync), add the channel to `RUST_INVOKE_CHANNELS`, add an arm in `dispatch_rust_channel`. The wrapper dies when its last TS caller is ported.

Flag rule (README section 5): env-only `GAMELIB_<SLICE>=rust|ts`, default `ts`, flipped after the sweep, deleted in the slice's own delete plan. The router consults the flag for renderer-channel slices so a rollback is an env var, not a rebuild. Hard limit: one flag per slice, removed inside the slice; v0.11 constraint "a dual path may live only for a bounded fallback window" is enforced by a `*PortComplete.test.ts` gate per slice (README 7), which fails if the flag or TS paths remain.

Order-preserving detail: native invoke handlers must run off the main thread and keep per-channel ordering for send-kind channels (the existing `SidecarSendQueue` exists because main-thread writes froze the UI); give the native send path one ordered queue per slice, not a free thread pool.

### 2.4 Where state lives in Rust

Rule: **one owner per state item at every moment, and ownership flips per store family, not per field.** Three tiers:

| State kind | Rust home | Notes |
|------------|-----------|-------|
| Persistent JSON stores (electron-store layout under `userData`, `store_cache/`, `steam_store/`...) | `gamelib-core::StoreHost` in Rust managed state (`Arc<StoreHost>` via `app.manage`), one file per store, atomic write (temp + rename), debounced flush, same JSON layout and key paths so files survive a flip in both directions | replaces `fileStore.ts`, `typed_store.ts`, `store_backend.ts`, `stores/*`; also serves `sidecar:store-snapshot`, `store-fetch`, `storeNew`, set/delete and emits `storeChanged` itself |
| Long-lived in-memory domain state (libraryState, gameSession, update-detection cache, download queue, running-game registry) | one `Arc<Mutex<..>>` or actor task owned by the domain crate, constructed in the shell `setup` and put in managed state; mutations go through methods that persist and emit | the actor shape avoids lock-held-across-await bugs; poll loops (Phase 80, tokio tasks) call it directly |
| Per-request scratch (abort registries, single-flight guards like `launchSingleFlight.ts`) | inside the crate that uses them, never global statics (matches the Phase 66 "zero module state" rule the TS side already enforces) | |

Crates vs shell modules: logic and state machines go in Tauri-free crates (testable on all 3 CI legs, headless via `-cli`); anything needing `AppHandle`, webview windows, notifications or `tauri::State` stays a shell module. The shell is the composition root: it builds `StoreHost`, `Logger`, `FrontendEmitter` once in `setup` and injects trait objects into crates, mirroring the sidecar's boot steps (`bootstrap.ts` BOOT_STEP_NAMES, 'stores' before 'migrations', logger first).

### 2.5 Migrating sidecar-owned state without a permanent dual-write era

The trap is two writers on one store file or one state object. The mechanism, per state item:

1. **Flip ownership at the item's own slice, never earlier.** Until then the sidecar is the sole owner; Rust reads it only through an existing snapshot or event. Phase 80 already used this for libraryState.
2. **When Rust must own a root that TS still consumes synchronously (stores, settings, libraryState), the TS side becomes a write-through mirror**, not a second owner: boot step loads a snapshot from Rust (async boot is fine, boot is already ordered steps); TS reads hit the in-memory mirror; TS writes are ordered send frames to Rust (`store_set`), Rust is the only disk writer and pushes changes back as events. The mirror is deleted with the sidecar. This is the only place a temporary two-sided structure exists and it is a cache, not a writer.
3. **Per-family flip order inside the store host:** logger store and caches first (async-safe, low blast radius), then per-subsystem stores as their consumers move, global settings/config last of the stores because 20+ direct importers and the renderer's `configStore` sync reads depend on it.
4. **Event inversion at the end of each state slice:** when libraryState moves, `steamPollStateEvent`, the outbox, the seq guard and the ack bound are deleted (the poll crate calls the state methods in-process; R1 to R3 of the crate's design record disappear). When the CM session is the only token source, `ShellJobHost`'s sidecar round trip becomes an in-process call.
5. **Versioned migrations** (`storeMigrations/*`, `storeVersioning/*`, `migration/*`, ~1.4k lines) are ported as a `StoreHost` migration step that runs once at shell boot before any store opens, with golden before/after JSON fixtures captured from the TS code first (63 tier-1 oracle pattern). Migrations are one-way: the "flag back to ts" lever is unsafe after a migration ran, so the store-host slice must make that explicit (rollback window ends at first migrated boot; keep a pre-migration backup copy).

## 3. Data flow changes

- **Renderer to backend:** unchanged shape; one extra in-process lookup before relaying. For native channels the sidecar hop (two JSON serializations, a pipe round trip, a Node event loop) disappears. Expect lower latency and no sidecar-startup dependency for those calls.
- **Backend to renderer pushes:** native code emits `frontend_message` events directly (`PollHost::emit_frontend` already does this); channel names and payloads must stay byte-identical. Add a shared `FrontendEmitter` in `gamelib-core` and a recording fake for parity.
- **Notifications:** already Rust (`macos_notifications.rs`, `notification_show.rs`, `gamelib-i18n`).
- **Process spawning:** legendary, gogdl, nile, wine, nettop and the Steam bridge helper are spawned from Rust (`tokio::process`), with Rust owning child lifetimes and teardown (Phase 80 D-07 precedent). This removes the sidecar-pid watchdog idea and the `unref()` exit contract entirely.
- **Boot:** Rust setup builds core services, runs store migrations, starts boot-resume tasks, then shows the window. The READY sentinel and the "state events queue until sidecar READY" window go away.

## 4. Suggested build order

### 4.1 Recommendation: seam first, then foundations as owner-flip (not consumer port), then leaves, then hubs, then deletion

Neither pure strategy works:

- **Pure foundation-first** (port stores/config/logger/migrations as a big-bang) is a ~5k-line port with 200+ consumers still in TS, so nothing user-visible is delivered for a long time and every consumer pays a mirror cost.
- **Pure leaf-first** (start with `wiki_game_info`, `crossover_index`) is safe but each leaf needs settings, a store, the logger and userData paths. With no Rust foundation, each leaf invents its own file reads or calls back into the sidecar, which is the permanent dual path the milestone forbids.

So: build the Rust foundations as the owner of stores and the logger early, but only with a TS-side adapter, not by porting consumers. Then every later slice is a leaf over a stable Rust substrate. Within the leaves, go bottom-up by import edges.

### 4.2 Phases

Numbering is relative (v0.11 starts at 82; phases 82 to ~92). Each slice deletes its own TS (milestone constraint).

| # | Slice | Delivers | Depends on | Why here |
|---|-------|----------|------------|----------|
| A | **Native seam and gates** | `native_router.rs`, generator extension for native channel sets with one-owner test, `gamelib-core` skeleton (`Paths`, `FrontendEmitter`, `Clock`, `ProcessRunner` hoisted from steampoll), per-slice gate template, CI `-p` entries, a `GAMELIB_<SLICE>` flag helper | nothing | every slice needs it; proves the mechanic on one tiny existing channel (for example a shell-only channel moved from sidecar to native) |
| B | **Logger** | Rust log writer producing the same `gamelib.log` format and rotation; TS logger becomes a fire-and-forget forwarder (`send`); renderer `logError` etc. served natively | A | logging is async-safe, the highest fan-in (200 files) with zero API change, and removes the shell's second log path (`shell_diag`); single writer from day one |
| C | **Store host, settings/config, migrations** | `StoreHost` + `Settings` view in Rust; snapshot/fetch/new/set/delete/`storeChanged` served natively; TS `fileStore` becomes write-through mirror; versioned migrations ported with goldens; `config.ts` reads through the mirror | A, B | the root of the dependency graph; later slices read Rust-owned settings directly instead of calling back. Highest-risk foundation: see section 6 |
| D | **Pure leaves** | `wiki_game_info` (1.3k), `crossover_index` (0.8k), `storeSearch`/`discounts`, `runsForMe`, `game_overrides`, `macArch`, `anticheat`, `recent_games`, `steamgrid`, image cache, `signInProbe` lite parts, `dialog`/`appshell` leftovers, connectivity (`online_monitor`) | A, C | small, few importers, mostly network/file reads. Prove the recipe at volume and fill `gamelib-core` gaps cheaply. `wiki_game_info` is a good first slice after C because it has its own store family and 8 importers |
| E | **Engine, wine, tools, process** | `engine/` (7.0k), `wine/` (1.3k), `tools/` (2.9k: winetricks, redist), `process/`, `utils` systeminfo and spawn helpers, `commandRunner`, `spawnAsync`, gamescope | A to D | prerequisite for the Steam bridge and for Epic/GOG/Amazon launch. `engine` is imported by 45 files, so land its Rust API before its consumers port |
| F | **Steam library state** | `libraryState`, `gameSession`, update-detection cache, `markManagedBySteam`, `clearForcedWindowsViaBottle` into one actor in `gamelib-steamlib`; library refresh, rustRefresh, installedMap; delete `steamPollEventRegistration.ts`, the outbox/ack/seq code, `polls=ts` fallback | C, D | the Steam hub; everything after reads it. Ends the Phase 80 dual path. TS Steam modules still alive read it via the mirror pattern (2.5 item 2) until D... G moves them |
| G | **Steam services** | `games.ts` surface, user/sign-in/redeem glue, install/uninstall/launch routing, update detection and prompts, `bridgeInstallState.ts` leftovers, TS depot path (`depot/`, `depotRust/` wrappers), `gameLaunch`, `steamLaunchWatch`, bottle wrappers | E, F | consumes engine and library state; removes `ShellJobHost` sidecar calls |
| H | **Steam bridge (18.2k)** | bridge install/uninstall/launch, DRM-mode launch, known fixes, shim generation callers, bottle lifecycle, overlay archive install | E, F, G | largest single block; split into at least three phases (install routing; launch and bottle lifecycle; known-fix and overlay). Best done after the engine API is stable |
| I | **Runners: Epic, GOG, Amazon, sideload** | spawn bundled legendary/gogdl/nile, parse output, own state; sideload; `storeManagerCommon` | C, E, F-style state pattern | independent of Steam but needs engine/wine and stores; the three runners are structurally similar, so port one (legendary, largest) and clone the shape to gog and nile |
| J | **Download manager, Humble, shortcuts, signInProbe rest** | queue and its persisted state, Humble (6.2k) with its encrypted session and cross-ref to Steam ownership, `shortcuts/nonesteamgame` | F to I | these import all managers, so they come after them. Humble could slide earlier (it only needs stores plus Steam ownership reads) if the roadmap wants parallelism |
| K | **Residue and shell cutover** | `launcher.ts`, `game_config`, `utils` residue, `protocol`, `quitHandler`, `appRuntime`, `miscRuntime`, boot steps; native quit path replaces `quit_via_sidecar`; deep links and single-instance no longer forward to the sidecar | all | the last consumers of the sidecar relay |
| L | **Deletion** | section 5 | all | pure removal, gated |

Parallelism: after C, slices D and the Humble part of J are independent of E to I; E then unblocks F-H and I in parallel only if two engineers are available. One-operator reality: keep the order above.

### 4.3 Ordering constraints worth stating to the roadmapper

- B and C must not be reordered below D: leaf slices written against a callback-to-sidecar settings read have to be rewritten.
- F precedes G and H and also precedes any deletion of the state-event machinery; do not split libraryState across two phases (a half-moved hub forces both mirror directions at once).
- E precedes H and I. `engine` and `wine` expose launch argv and bottle paths that both consume.
- J (download manager) must follow every manager whose install API it calls.
- Do not delete `sidecar/` pieces opportunistically mid-milestone except what a slice itself obsoletes; the RPC server and boot steps must keep working until K.

## 5. What the final deletion phase (L) removes

Verify each against a repo-wide search at phase time; this list is from reading the tree and CI files on 2026-11-17.

**Shell (Rust, `src-tauri`)**
- `src/sidecar.rs` (spawn, node resolution `resolve_node_program`, process group and Windows kill-on-close job, stderr forwarder, `start_reader`, EOF teardown, dead-sidecar dialog), `shell_state.rs` `SidecarState` pending-table and `SidecarSendQueue`, `relay_commands.rs` relay half (keep the commands as the native entry points), `rust_dispatch.rs` `rustInvoke` router, `RUST_INVOKE_KIND`, the READY sentinel, `quit_via_sidecar`, the spawn-time env plumbing in `main.rs` (Steam dirs, app root, shell exe), sidecar kill in `handle_exit`, `sidecar_store_snapshot` rewire.
- `tauri.conf.json` `bundle.externalBin: ["binaries/gamelib-sidecar"]`; `tauri.{macos,linux,windows}.conf.json` `resources` entries that exist only for the sidecar (native modules, the win32 liblzma side-load if any survive, prebuilds); `src-tauri/binaries/gamelib-sidecar-<triple>[.exe]` and its `.gitignore`; `build.rs` externalBin handling; macOS entitlements that exist only for the JIT/Node runtime (`allow-jit`, `allow-unsigned-executable-memory`, library validation relaxations) must be re-evaluated and tightened, and the notarization/signing steps that sign the SEA binary dropped.
- `ipc_contract.rs` generated names for sidecar-only items (`RustInvokeChannel`, `READY_SENTINEL`, `STORE_SNAPSHOT_CHANNEL` naming).

**TS build and tooling**
- `meta/buildSidecar.ts`, `meta/buildSidecarSea.ts`, `meta/sidecarStartupSmoke.cjs`, `meta/sidecarExitCheck.ts`, `meta/probeSeaInWorker.ts`, `meta/esbuildWorkerBundleShared.ts`, `meta/tauriDevPreflight.cjs` sidecar parts, and `package.json` scripts `build:sidecar`, `build:sidecar-sea`, `smoke:sidecar`, `smoke:exit-check`, and the `build:sidecar` prefix in `tauri:dev` / `tauri:dev:run` / `tauri:dev:packaged`.
- The memory note "tauri dev does not rebuild the sidecar" and the fresh-worktree build-prep steps become obsolete; update docs.
- `src/backend/**` entirely (except anything the renderer or `meta/` still imports; audit with `pnpm find-deadcode`): `sidecar/`, `testUtils/`, `__mocks__/`, `jest.setupContainment.ts`, `jest.globalSetup.js`, `backend/jest.config.js`; `src/common/types/sidecarTransport.ts` sidecar framing types (keep channel constants and payload types the renderer uses); `src/common/types/ipc/rustInvoke.ts`, `sidecarInternal.ts`; `src/preload` pieces that only exist for the relay naming (`tauriTransport.ts` keeps its transport but loses `sidecar:` internal channels).
- npm dependencies used only by the backend (`esbuild` SEA flow, `postject`, Node-only libs; `lzma`, `zstddec` and their patches are already the kind of leftover called out in README section 10), the `patches/` for them, `knip` entries, and `meta/backendDiCeilings*` plus all `meta/backendDiCeilings/*.json` backend shards (frontend shards stay), `meta/steamLineCeiling*`, `meta/logSecretGate.ts` if it only scans backend, `.github` path filters for `src/backend`.
- The jest project(s) for backend: `src/backend/jest.config.js` and the matching `projects` entry in the root `jest.config`; keep Meta and Preload and Frontend projects. Test count on CI drops substantially; update any "all N backend suites" gates.

**CI (`.github/workflows`)**
- `release-tauri.yml`: the "Build self-contained sidecar (Node SEA)" step and its `GAMELIB_SIDECAR_TARGET_TRIPLE` env and `matrix.sidecar_triple` field, sidecar post-processing and blob cleanup (`sea-config.json`, `sidecar-prep.blob`), SEA signing/notarization specifics, Node setup if only used for SEA (Node stays for Vite and pnpm).
- `rust-test.yml`: the "Placeholder for externalBin" step and the comments that depend on it, plus the `-p` list stays and grows (new crates).
- `test.yml`: the `pnpm smoke:sidecar` step and its justification block; the backend jest invocation.
- `codecheck.yml`/`lint.yml`: backend-scoped lint targets; the `clippy --workspace` and a cross-platform `cargo test` leg must become the main correctness gate (CI finds Windows-only defects macOS cannot, per the depot port).
- Add the opposite gates: a `nodeRetired.test.ts` deletion gate (modelled on `scannerPortComplete.test.ts` and `depotPortComplete.test.ts`) asserting the paths above stay deleted, no `node`/`externalBin`/SEA string reappears in configs, and the packaged bundle contains no Node binary (size delta recorded; the SEA binary is ~170 MB per the rust-test.yml comment, so the win is large and measurable).

**Docs and conventions**
- `CLAUDE.md` conventions row "create a timer... in the sidecar" (sidecar exit contract) and the sidecar notes in the Technology Stack section; `.planning` skills that mention the sidecar. These are hand-maintained; update directly.

## 6. Patterns to follow

### Pattern 1: Recorded-result Jest parity (Phase 75)
**What:** TS wrappers around a Rust op are tested in Jest by replaying recorded Rust results against kept goldens; Jest needs no Rust toolchain. **When:** every internal-function slice. **Why:** survives deleting the TS oracle.

### Pattern 2: Capture the oracle, then delete it (Phases 63, 73)
**What:** run the TS implementation over a synthetic corpus, commit `expected.json`, make Rust meet it, then delete the TS. **When:** stateful slices (store migrations, libraryState transitions, runner output parsers, download queue). A deliberate divergence carries a `divergenceNote` (63 D-07).

### Pattern 3: Trait-injected host (Phases 73 and 80)
**What:** the crate takes `JobHost`/`PollHost`-style traits; the shell implements them over Tauri; tests use recording fakes. **When:** any slice that emits events, notifies or spawns. Hoist `Clock`, `ProcessRunner`, `FrontendEmitter` into `gamelib-core` so slices stop redefining them.

### Pattern 4: One owner, mirror as cache (this milestone)
Described in 2.5. A mirror is read-mostly and write-through to the owner; it is never a second source of truth and has a named deletion point.

### Pattern 5: Fresh crate per domain, workspace-wide gates
Each crate sets `rust-version`, the two clippy deny lines, an `EXPECTED_LOCKFILE_CRATE_NAMES` update (`cargoFeatures.test.ts`) and a `-p` entry in `rust-test.yml`. With roughly ten more crates, consider one `cargo test --workspace --exclude src-tauri` line so a new crate cannot be silently skipped (non-default members are skipped by plain `cargo test`).

## 7. Anti-patterns to avoid

### Anti-pattern 1: Per-field or per-call ownership flip
**Why bad:** two writers on one store file or state object for an unbounded time; the exact "dual-write era" the milestone forbids. **Instead:** flip a whole store family or state actor in one slice (2.5).

### Anti-pattern 2: Rust calling into TS for settings or state
**Why bad:** recreates the Phase 80 ack/outbox/seq machinery for every slice, adds boot-order races, and cannot be removed until the last TS consumer dies. **Instead:** Rust owns, TS mirrors.

### Anti-pattern 3: Per-tick or per-call Rust to TS callbacks (already rejected in Phase 80 D-06)
Keep it rejected. A slice either moves with its helpers or it does not move.

### Anti-pattern 4: Porting `sidecar/*FlowRegistration.ts` as their own slice
**Why bad:** it is routing glue (about 8k lines) that is mechanically deleted as each channel is re-pointed; porting it duplicates the router. **Instead:** shrink it by deletion inside every slice; the file disappears with the sidecar.

### Anti-pattern 5: Trusting renderer-side arguments after validation moves
Validation currently lives only in the sidecar (`ipcValidation.ts`). When a channel goes native, the Rust handler must validate (serde `deny_unknown_fields`, path containment, `PathGuard`-style checks as in `gamelib-steampoll` `acf_copies`). Losing it silently weakens Phase 72's renderer trust boundary. Add a gate: every native channel has an arg struct and a negative test.

### Anti-pattern 6: Deleting packaging before the last import is gone
README section 10 lesson: check what third-party code still loads before removing a dependency, and sign/notarize a real build before the delete gate. Run a packaged macOS build with the sidecar binary physically absent as the Phase L precondition.

## 8. Risks and research flags

| Slice | Risk | Flag |
|-------|------|------|
| C Store host | synchronous TS reads over async Rust ownership; read-your-writes ordering for the mirror; `steam_store/config.json` is shared by two TS store objects (D-14 in `fileStore.ts`); `storeChanged` push ordering vs the snapshot; JSON byte-compat both ways; Windows atomic rename when the file is open | needs deeper research and a spike |
| B Logger | log rotation, uploader and secret scrubbing (`sanitizeRendererLogMessage`, `logSecretGate`) must match; ordering with the sidecar's early boot lines | standard pattern, moderate |
| E Engine/wine | bottle prep and CrossOver behaviour are heavily empirical (memory notes: engine order, TCC, trial expiry); Wine child lifetimes; macOS-only code paths tested only locally | needs per-slice live gates on real CrossOver and Staging |
| F libraryState | all Steam readers; keeping `pushGameToLibrary` ordering vs frontend refetch (Phase 80 D-05) now in-process | needs deeper research; replay parity from Phase 80 harness |
| H Bridge | 18k lines of Mach-O/PE shim logic partly already in `gamelib-scan`; DRM mode boundary rules (memory: DRM boundary, bridge "verified" is strict) apply to the port itself | split into at least 3 phases; live bridge UAT per game class |
| I Runners | stdout/JSON parsing of legendary/gogdl/nile and auth token flows (Epic device auth on hold, Phase 34.7); bundled binary paths per OS | recorded-output goldens per runner version |
| J Humble | encrypted session persistence (`humbleSecretStore.ts`), cookie capture already Rust | moderate |
| L Deletion | macOS entitlement tightening and notarization re-validation; auto-update feed must ship a bundle without the sidecar and updater metadata must stay valid | run a full signed release dry run |

## 9. Scalability and operational considerations

| Concern | Effect of the migration |
|---------|------------------------|
| Startup | no Node boot, no SEA extraction; `coldBootTiming.ts` baselines should improve (measure before and after C and L) |
| Memory | drops the Node process footprint; Rust stores hold the same JSON in memory |
| Failure isolation | a panic in one domain no longer kills the sidecar and all backend work; `catch_unwind` in `dispatch` (README contract) keeps a panic an error result, but a panic in a shell-hosted task now sits in the app process, so keep crate code panic-free at boundaries and tasks supervised |
| Packaging | removes a ~170 MB per-OS binary and the JIT-related entitlements |
| Test cost | backend jest (176+ suites) is replaced by `cargo test` on 3 OS legs; CI time on Windows legs rises, plan matrix caching |

## 10. Open questions for the roadmapper

1. Does the "~129k lines" figure include tests and mocks? Measured non-test backend source is closer to ~100k lines including 18k of sidecar glue; size phases from the table in 1.2, not the headline.
2. Is the config/settings mirror (C) acceptable to the operator, or should `config.ts` consumers be ported first at the cost of more TS churn? This research recommends the mirror.
3. Order of Humble (J) versus runners (I): both viable; Humble can move up if a user-visible Humble fix is waiting.
4. Whether to extract `gamelib-core` in phase A or grow it organically. Recommended: A, so the dependency direction (domain crates depend on core, never on each other except by trait) is fixed before there are ten crates.

## Sources

- Repo, read 2026-11-17: `.planning/PROJECT.md` (Next Milestone v0.11), `.planning/phases/80-*/80-CONTEXT.md`, `src-tauri/crates/README.md` (the Phase 63/73/75/79/80 recipe and lessons), `src-tauri/src/relay_commands.rs`, `shell_state.rs`, `sidecar.rs`, `rust_dispatch.rs`, `steampoll_dispatch.rs`, `ipc_contract.rs` (generated), `src/common/types/sidecarTransport.ts`, `src/preload/tauriTransport.ts`, `src/backend/sidecar/{fileStore,ipcRegistry,bootstrap,steamPollEventRegistration}.ts`, `src/backend/services/types.ts`, `src/backend/stores/createStores.ts`, `package.json`, `src-tauri/tauri*.json`, `.github/workflows/{release-tauri,rust-test,test}.yml`. HIGH confidence for structure facts.
- Import-edge counts and line counts: grep and `wc` over `src/backend` (absolute imports only), MEDIUM confidence, use for ordering only.
- Not consulted: graph-wide communities (`graphify query` returned a truncated 53-of-1057 node slice with no extra edges beyond the above).
