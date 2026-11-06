<!-- refreshed: 2026-11-06 -->
# Architecture

**Analysis Date:** 2026-11-06

## System Overview

```text
┌──────────────────────────────────────────────────────────────────────────┐
│  Renderer (WKWebView / WebView2 / WebKitGTK)                              │
│  React + TypeScript   `src/frontend/`                                     │
│    window.api.*  ◄── attached by `src/preload/tauriAttach.ts`             │
│    preload/api/*.ts → preload/ipc.ts → preload/tauriTransport.ts          │
└───────────────┬───────────────────────────────▲──────────────────────────┘
   Tauri invoke │ sidecar_invoke / sidecar_send  │ Tauri event "frontend_message"
   open_external│ sidecar_store_snapshot          │ {channel, args}
                ▼                                 │
┌──────────────────────────────────────────────────────────────────────────┐
│  Rust shell (Tauri v2)   `src-tauri/src/`                                 │
│    main.rs (builder, setup, invoke_handler)   relay_commands.rs           │
│    shell_state.rs (SidecarState: stdin, pending map)   sidecar.rs         │
│    reader thread: routes response / push / rustInvoke / openExternal     │
│    native facilities: store_embed.rs, login_window.rs, keyring_dispatch,  │
│    tray.rs, wake_lock.rs, macos_*.rs, single_instance.rs, ...            │
└───────────────┬───────────────────────────────▲──────────────────────────┘
   stdin: JSON  │ request frames                 │ stdout: JSON lines
   lines        ▼                                 │ (responses, pushes,
┌──────────────────────────────────────────────────────────────────────────┐
│  Node sidecar (esbuild bundle `build/main/sidecar.js`, or SEA binary)    │
│  entry `src/sidecar/index.ts` → `src/backend/sidecar/bootstrap.ts`        │
│    sidecarRpc.ts (framing, dispatch)   handlers.ts + *Registration.ts     │
│    platform/index.ts (ipcMain/app/dialog/shell/BrowserWindow stubs)       │
│    launcher.ts · storeManagers/{steam,gog,legendary,nile,sideload}        │
│    downloadmanager/ · humble/ · wine/ · steamgrid/ · logger/ · ...        │
│    persistence: electron_store.ts → store_backend.ts (conf) · fileStore   │
└──────────────────────────────────────────────────────────────────────────┘
          │ spawns / talks to                 │ network
          ▼                                   ▼
  Wine / CrossOver / Steam bridge     Steam CM, Epic, GOG, Amazon, Humble APIs
  (storeManagers/steam/bridge/)        and CDNs
```

Two naming notes that matter when reading this code:

- The runtime is **Tauri**, not Electron. The sidecar still runs with a
  first-party `electron` stand-in (`src/backend/platform/index.ts`), and many
  files keep Electron-era names (`electronStores.ts`, `electron_store.ts`,
  `installElectronHook.ts`). These names are historical; the code they
  describe runs under Tauri.
- `.planning/research/ARCHITECTURE.md` describes an earlier Electron design
  for Humble integration. It is not a source for current structure.

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Tauri builder and setup | Registers Tauri commands, plugins and the `RunEvent::Exit` sidecar shutdown; spawns the sidecar in `.setup()` | `src-tauri/src/main.rs` (`invoke_handler` ~line 1759, `.setup(` ~line 806) |
| Sidecar spawn and reader | Spawns the Node sidecar (dev or packaged), forwards stderr, routes every stdout frame | `src-tauri/src/sidecar.rs` (`spawn_sidecar` line 325, `start_reader` line 356) |
| Pending-invoke state | Holds stdin, `id -> (channel, oneshot)` pending map, abandoned-id ring, id counter, child handle | `src-tauri/src/shell_state.rs` (`SidecarState`) |
| Relay commands | `sidecar_invoke` (req/resp), `sidecar_send` (fire-and-forget via a single writer thread), `sidecar_store_snapshot`, `open_external` | `src-tauri/src/relay_commands.rs` |
| Sidecar→Rust dispatch | Single match on `rustInvoke` channel names; arms delegate to native modules | `src-tauri/src/store_embed.rs` (`dispatch_rust_channel`, line 1810), arms in `keyring_dispatch.rs`, `login_window.rs`, `clipboard.rs`, `store_embed.rs` |
| Native embeds | Child webviews for store and wiki pages; raw WKWebView for Epic on macOS | `src-tauri/src/store_embed.rs`, `src-tauri/src/macos_epic_embed.rs`, `src-tauri/src/epic_embed_state.rs` |
| Login windows | Child `WebviewWindow` for store and Humble sign-in, cookie reads and clears | `src-tauri/src/login_window.rs` |
| Sidecar entry | Installs the unhandled-rejection guard, then bootstraps the backend graph | `src/sidecar/index.ts`, `src/sidecar/installRejectionGuard.ts`, `src/backend/sidecar/bootstrap.ts` |
| Electron stand-in | In-process fake of the Electron main-process API surface; holds `handlerRegistry` and `listenerRegistry` Maps | `src/backend/platform/index.ts` (Maps around line 165–167), `src/backend/sidecar/installElectronHook.ts` |
| RPC loop | Reads JSON lines from stdin, dispatches invoke/send, resolves sidecar→Rust invokes, writes responses and pushes to stdout | `src/backend/sidecar/sidecarRpc.ts` (`startRpcServer`, `handleFrame`, `dispatchInvoke`, `pushFrontendMessage`, `requestRustInvoke`) |
| Channel registration | Composition root that imports every per-domain registration module | `src/backend/sidecar/handlers.ts`, 23 `src/backend/sidecar/*Registration.ts` modules |
| Renderer→backend contract | Typed channel maps (`AsyncIPCFunctions`, `SyncIPCFunctions`, `FrontendMessages`) | `src/common/types/ipc.ts` |
| Transport contract | Frame shapes, channel-name constants, `READY_SENTINEL`, `RUST_INVOKE_CHANNELS`; mirrored by hand in Rust | `src/common/types/sidecarTransport.ts`, `src-tauri/src/sidecar.rs` (`transport-mirror:` markers) |
| Store access policy | D-08 allow-list of store fields the renderer may read; boot-set vs lazy stores | `src/common/types/storePolicy.ts` |
| Renderer API | Builds `window.api` and the Tauri transport wrappers | `src/preload/tauriAttach.ts`, `src/preload/api/index.ts`, `src/preload/ipc.ts`, `src/preload/tauriTransport.ts` |
| Launcher | Runner-aware launch dispatch, Wine command runner | `src/backend/launcher.ts` (2,244 lines) |
| Store managers | Per-store library, game, user and setup logic, reached through one registry | `src/backend/storeManagers/index.ts` (`libraryManagerMap`) |
| Steam store manager | Owned-apps library, native and Wine/CrossOver install and launch, depot downloads, bridge | `src/backend/storeManagers/steam/` (see Layers) |
| Humble Bundle | Library, sync, key state, login-window seam | `src/backend/humble/` |
| Seams (ports) | Interfaces whose Rust-backed implementations are installed at sidecar startup | `src/backend/store/storeEmbedSeam.ts`, `src/backend/humble/loginWindowSeam.ts` |
| Persistence | Conf-backed JSON stores with per-domain declarations | `src/backend/electron_store.ts`, `src/backend/store_backend.ts`, `src/backend/*/electronStores.ts` |
| Renderer shell | Hash router, global React state, zustand stores | `src/frontend/App.tsx`, `src/frontend/state/GlobalState.tsx`, `src/frontend/state/GlobalStateV2.ts` |
| Relay worker (separate) | Cloudflare Worker for known-fix sharing; not part of the desktop runtime | `relay/src/index.ts`, `relay/wrangler.jsonc` |

## Pattern Overview

**Overall:** Process-isolated backend. A Tauri shell owns the window and native
facilities, and a Node sidecar owns all business logic. The two talk over a
private stdio pipe carrying JSON lines, and the renderer reaches the sidecar
only through Tauri commands.

**Key Characteristics:**

- **Three processes, one pipe.** Renderer ↔ Rust is Tauri IPC. Rust ↔ sidecar is
  JSON lines on the child's stdin/stdout. The sidecar never opens a network
  listener for this (see the stdio rationale in `src/common/types/sidecarTransport.ts`).
- **Channel-name RPC, not typed routes.** Every call names a channel string
  (`'refreshLibrary'`, `'steamLaunch'`, ...). `window.api` methods are thin
  wrappers, and the sidecar keeps a `Map<channel, handler>` (`handlerRegistry`).
  Both sides share the channel vocabulary through `src/common/types/ipc.ts`.
- **Four frame kinds** (`src/common/types/sidecarTransport.ts`): `invoke`
  (request expecting a response), `send` (fire-and-forget), `openExternal`
  (sidecar asks the shell to open a URL), and `rustInvoke` (sidecar asks the
  shell to run a native operation). Pushes are a fifth shape with no `kind`
  request: `{kind:'frontendMessage', channel, args}`.
- **Electron-compatible shim, not an Electron app.** The sidecar keeps the
  Electron handler-and-listener call shape so store and launcher code could be
  ported without rewriting each call site. `src/backend/platform/index.ts` is
  the replacement for the `electron` module.
- **Seams for native capabilities.** Backend code depends on interfaces
  (`StoreEmbedSeam`, `LoginWindowSeam`). Rust-backed implementations are
  installed once at sidecar startup.
- **Per-store managers with a shared interface.** `libraryManagerMap` holds one
  `LibraryManager` per runner. `steam` is the largest and is split into
  sub-modules.

## Layers

**Renderer (`src/frontend/`):**
- Purpose: Screens, components and client state.
- Location: `src/frontend/`
- Contains: React screens (`screens/`), UI components (`components/UI/`), hooks (`hooks/`), zustand stores (`state/`), helpers (`helpers/`).
- Depends on: `window.api` (all backend access), `common/*` types.
- Used by: Vite renderer bundle (`index.html`).
- Note: Renderer code must not import `backend/*` at runtime. Shared types come from `common/`.

**Preload / renderer bridge (`src/preload/`):**
- Purpose: Builds `window.api` and speaks the transport to Tauri.
- Location: `src/preload/`
- Contains: `tauriAttach.ts` (side-effect module that attaches `window.api`), `api/*.ts` (one module per domain: `library.ts`, `steam.ts`, `downloadmanager.ts`, `humble.ts`, `storeEmbed.ts`, `wine.ts`, `misc.ts`, `settings.ts`, `menu.ts`, `storeSearch.ts`, plus `tauri*.ts` window and gamepad helpers), `ipc.ts` (three factories), `tauriTransport.ts`.
- Depends on: `@tauri-apps/api`, `common/types/sidecarTransport`, `common/types/storePolicy`.
- Used by: `src/frontend/index.tsx` imports `../preload/tauriAttach` as its first meaningful import.
- Note: `src/preload/index.ts` is an Electron-era file and is not in the Tauri renderer path. `tauriAttach.ts` is the live seam.

**Rust shell (`src-tauri/src/`):**
- Purpose: Window and tray, native facilities, sidecar lifecycle, and frame routing.
- Location: `src-tauri/src/`, 23 `.rs` files including `wake_lock/`.
- Contains: commands in `relay_commands.rs`; state in `shell_state.rs`; process and reader in `sidecar.rs`; native arms in `store_embed.rs`, `login_window.rs`, `keyring_dispatch.rs`, `clipboard.rs`, `notification_backend.rs`, `macos_native_gamepad.rs`.
- Depends on: Tauri v2 and plugins (opener, dialog, shell, notification, clipboard-manager, deep-link, updater), `keyring`, `serde_json`.
- Used by: The renderer (commands) and the sidecar (stdout frames, `rustInvoke`).
- Note: `main.rs` was split into sibling modules by quick task `261106-ab1` (commit `df547170b`). It is 7,886 lines now.

**Sidecar transport (`src/backend/sidecar/sidecarRpc.ts`):**
- Purpose: Framing, validation and dispatch of stdin/stdout JSON lines.
- Location: `src/backend/sidecar/sidecarRpc.ts`
- Contains: `startRpcServer` (10 MiB line cap; oversized invokes get an `ok:false` reply), `handleFrame`, `dispatchInvoke` (`handlerRegistry`), `dispatchSend` (`listenerRegistry`), `pushFrontendMessage`, `requestOpenExternal`, `requestRustInvoke` (60 s timeout, bypassed for human-gated dialog channels).
- Depends on: `common/types/sidecarTransport`, `backend/platform`.

**Registration / composition root (`src/backend/sidecar/`):**
- Purpose: Decides which channels exist and binds them to backend code.
- Location: `src/backend/sidecar/handlers.ts` and 23 `*Registration.ts` modules (for example `steamFlowRegistration.ts`, `installFlowRegistration.ts`, `humbleFlowRegistration.ts`, `storeEmbedFlowRegistration.ts`, `runnerMiscFlowRegistration.ts`).
- Contains: One `register<Domain>Flows()` function per domain, called in order from `handlers.ts` (lines 122–241).
- Depends on: Domain modules directly. Each module imports only what its flows need (a curated-import rule, documented in each file header).
- Note: `storeRegistration.ts` exists only so store declarations are constructed at module scope. Without it, a snapshot would silently return `{}` for unimported stores.

**Platform stand-in (`src/backend/platform/`, `src/backend/ipc.ts`):**
- Purpose: Gives backend code an Electron-shaped API without Electron.
- Location: `src/backend/platform/index.ts` (1,252 lines; `ipcMain`, `app`, `dialog`, `shell`, `BrowserWindow`, `session`, `net`, `protocol`, `safeStorage` (intentionally dead), and others), `src/backend/platform/types.ts`, `src/backend/ipc.ts`.
- Contains: `handlerRegistry` and `listenerRegistry` Maps, and `bindTransport()`, which wires `BrowserWindow.webContents.send` and `shell.openExternal` to the RPC layer.
- Depends on: Nothing from Electron. `installElectronHook.ts` redirects `require('electron')` to this module.
- Used by: Nearly all backend code, via `import ... from 'backend/platform'`.
- Note: `backend/ipc.ts` wraps the stub as `addHandler`, `addListener` and `sendFrontendMessage`, so backend code calls those wrappers, not the stub directly.

**Domain layer (`src/backend/`):**
- Purpose: Store integrations, launch, downloads, Wine, metadata and everything else.
- Location: see Key Abstractions and `STRUCTURE.md`.
- Contains: `launcher.ts`, `storeManagers/`, `downloadmanager/`, `humble/`, `wine/`, `steamgrid/`, `knownFix*.ts`, `logger/`, `migration/`, `game_overrides/`, `online_monitor.ts`, `signInProbe/`, `anticheat/`, and others.
- Depends on: `platform/`, `common/`, store persistence.

**Store managers (`src/backend/storeManagers/`):**
- Purpose: One runner per store.
- Location: `src/backend/storeManagers/{steam,gog,legendary,nile,sideload}/`, `storeManagerCommon/`, and the registry `index.ts`.
- Contains: Each runner has `library.ts` (a `LibraryManager`), `games.ts` (a `Game` class), `user.ts`, `electronStores.ts` (persistence declarations), and `setup.ts` or `constants.ts` where needed.
- Depends on: Its own runner only. Enforced by a dependency-cruiser rule (see Architectural Constraints).
- Used by: `sidecar/*Registration.ts`, `launcher.ts`, `sidecar/bootstrap.ts`.

**Steam store manager (`src/backend/storeManagers/steam/`):**
- Purpose: The largest runner. Covers account auth, owned-apps library, native and Wine/CrossOver install and launch, depot downloads and the macOS Steam bridge.
- Location: `src/backend/storeManagers/steam/`
- Key files: `games.ts` (7,022 lines, `SteamGame` default export at line 1056), `depot.ts` (4,598 lines), `library.ts` (4,393 lines, `SteamLibraryManager` at line 879), `bottle.ts` (2,567 lines), `user.ts` (1,562 lines), `state.ts` (56 lines; shared in-memory `library` Map and metadata-fetch limiter).
- Sub-directories: `depot/` (manifest, chunk decode, decompress pool and workers, reconcile), `engine/` (engine registry, pins, fallback and switch, bottle adoption), `bridge/` (macOS Wine/CrossOver Steam bridge: `drm/`, `overlay/`, PE/Mach-O shim generation, helper process), `__tests__/`.
- Note: `games.ts` is being split by Phase 62 (`gameConstants.ts` and `gameSessionState.ts` already exist). `library.ts` and `bottle.ts` are not in Phase 62 and are targeted by Phase 65.

**Humble Bundle (`src/backend/humble/`):**
- Purpose: Humble library, key state and sign-in.
- Location: `src/backend/humble/` (`user.ts`, `library.ts`, `syncFence.ts`, `secretStore.ts`, `loginWindowSeam.ts`, `ipc_handler.ts`).
- Note: Its login window goes through the `LoginWindowSeam` (see Data Flow).

**Persistence (`src/backend/electron_store.ts`, `store_backend.ts`, `*electronStores.ts`):**
- Purpose: Persisted JSON state with typed declarations.
- Location: `src/backend/store_backend.ts` (a `conf` shim; sets `cwd` explicitly from `sidecar/pathShim.ts`), `src/backend/electron_store.ts` (`TypeCheckedStoreBackend` and a store registry), and 22 `electronStores.ts` declaration modules across domains.
- Contains: Store declarations and cache stores under `store_cache/`. Credentials are not stored here. The Steam refresh token is held through `sidecar/keyringTokenStore.ts`, which calls the Keychain through `rustInvoke` `keyring_get`.

## Data Flow

### Primary Request Path (renderer invoke → sidecar → renderer)

1. A screen calls a `window.api` method, for example `window.api.refreshLibrary()`. The method is built by `makeHandlerInvoker(channel)` in `src/preload/ipc.ts`.
2. `invoke()` in `src/preload/tauriTransport.ts` calls Tauri's `invoke('sidecar_invoke', { channel, args })`.
3. `sidecar_invoke` in `src-tauri/src/relay_commands.rs` runs `SidecarState::invoke` on `spawn_blocking`. That writes `{id, kind:'invoke', channel, args}` as one JSON line to the sidecar's stdin, and parks a oneshot under `pending[id]`. The wait is bounded by `INVOKE_TIMEOUT` (60 s, `src-tauri/src/main.rs` line 142), except for channels on the `LONG_RUNNING_CHANNELS` list (`main.rs` line 168).
4. The sidecar's `startRpcServer` (`src/backend/sidecar/sidecarRpc.ts`) splits stdin on newlines. `handleFrame` sees no `ok` field, so it treats the frame as a request. `dispatchInvoke` looks up `handlerRegistry.get(channel)`.
5. The handler runs. For `refreshLibrary`, that is the registration in `src/backend/sidecar/steamFlowRegistration.ts`, which dispatches through `libraryManagerMap` in `src/backend/storeManagers/index.ts`.
6. `dispatchInvoke` writes `{id, ok:true, result}` (or `ok:false, error`) to stdout via `writeLine`.
7. The Rust reader thread (`start_reader` in `src-tauri/src/sidecar.rs`) sees the `ok` key, removes `pending[id]`, and sends the outcome on the oneshot. Unknown or timed-out ids are logged with their channel name and dropped.
8. `sidecar_invoke` returns to Tauri, which resolves the renderer's promise.

Fire-and-forget `send` follows the same route but skips the response. `sidecar_send` (`relay_commands.rs`) enqueues onto `SidecarSendQueue`, a single writer thread that keeps send order. `dispatchSend` calls every `listenerRegistry` entry for the channel.

### Backend Push (sidecar → renderer)

1. Backend code calls `sendFrontendMessage(channel, ...args)` (`src/backend/ipc.ts`). That reads `getMainWindow()` from `src/backend/main_window.ts`, which returns the stub window.
2. The stub's `webContents.send` was bound by `bindTransport` to `pushFrontendMessage` in `sidecarRpc.ts`. That writes `{kind:'frontendMessage', channel, args}` to stdout.
3. `start_reader` (`src-tauri/src/sidecar.rs`) sees `kind == "frontendMessage"`. For `recentGamesChanged` it also rebuilds the tray menu. It then calls `app.emit("frontend_message", {channel, args})`.
4. In the renderer, `listen(channel, cb)` in `src/preload/tauriTransport.ts` subscribes to `frontend_message` and forwards only the matching channel. `frontendListenerSlot` in `src/preload/ipc.ts` wraps it.

### Sidecar-Initiated Native Call (`rustInvoke`)

1. Backend code calls `requestRustInvoke(channel, args)` (`sidecarRpc.ts`). The channel must be in `RUST_INVOKE_CHANNELS`, or the call rejects immediately.
2. The sidecar writes `{id, kind:'rustInvoke', channel, args}` to stdout and records `rustPending[id]`. Unanswered entries reject after 60 s, except for the `UNBOUNDED_RUST_CHANNELS` (dialog open, message and save), which wait for a human.
3. `start_reader` spawns a worker thread for the frame, so a blocked Keychain prompt cannot stall the reader. The worker calls `dispatch_rust_channel` (`src-tauri/src/store_embed.rs`, line 1810).
4. The worker writes `{id, ok, result|error}` back on stdin via `SidecarState::write_raw`. `handleFrame` resolves `rustPending[id]`.

Examples of channels that run this way: `keyring_get` (Steam refresh token from the Keychain), `dialog_open`, `clipboard`, and the store-embed and login-window arms.

### Open External

`shell.openExternal(url)` in the sidecar calls `requestOpenExternal`, which writes `{kind:'openExternal', channel:'open_external', args:[url]}`. There is no response. The reader checks the URL against the scheme allow-list (`open_external_scheme_check`, `src-tauri/src/relay_commands.rs` line 173) and opens it on a worker thread. A `steam://` URL goes this way on launch.

### Boot Sequence

1. Tauri `.setup()` (`src-tauri/src/main.rs` line 806) calls `spawn_sidecar` (`sidecar.rs` line 325). Debug builds run `node build/main/sidecar.js` (path resolved from `CARGO_MANIFEST_DIR`, overridable with `GAMELIB_SIDECAR_ENTRY`). Release builds run the `gamelib-sidecar` `externalBin` (`src-tauri/tauri.conf.json`).
2. `start_stderr_forwarder` and `start_reader` start on the child's pipes. `app.manage(state)` and `SidecarSendQueue` are registered (`main.rs` around line 1228).
3. The sidecar runs `src/sidecar/index.ts`, which imports `installRejectionGuard` first, then `src/backend/sidecar/bootstrap.ts`.
4. `bootstrap.ts` imports `installElectronHook` first so `require('electron')` resolves to the stub. Then it imports `./handlers`. Module-scope code runs here, including store-manager construction (`storeManagers/index.ts`), so the order is load-bearing.
5. `init()` calls `startRpcServer`, installs the seams, starts the online monitor and the installed-JSON watcher, and prints `__GAMELIB_SIDECAR_READY__`. The transport contract says the shell must not write requests before it sees this line.

### Shutdown

On `RunEvent::Exit`, `SidecarState::shutdown_child` (`shell_state.rs`) sends SIGTERM to the sidecar's process group, waits up to 2 s, then sends SIGKILL. The group covers long-lived children such as GOG's `comet` and the Steam bridge helper. Stdin EOF (`stdinEofRelease.ts`) lets the sidecar drain and exit on its own.

**State Management:**
- Renderer: React state in `src/frontend/state/GlobalState.tsx` (a class component wrapped with `withTranslation`), zustand stores in `src/frontend/state/*.ts`, and router state from `react-router` (`createHashRouter`). Store data arrives through the store snapshot and fetch channels, filtered by the allow-list in `src/common/types/storePolicy.ts`.
- Sidecar: module-level singletons (store manager instances, `library` Map, pending maps), persisted through the conf-backed stores.
- Rust: `SidecarState`, `SidecarSendQueue`, and per-feature state (`epic_embed_state.rs`, `shell_state.rs`, `tray_settings`).

## Key Abstractions

**`window.api` and channel maps:**
- Purpose: The renderer's entire backend surface, typed by channel.
- Examples: `src/preload/api/index.ts`, `src/common/types/ipc.ts` (`AsyncIPCFunctions`, `SyncIPCFunctions`, `FrontendMessages`).
- Pattern: Each `window.api.<name>` is `makeHandlerInvoker` or `makeListenerCaller`. Adding a channel means adding a type in `common/types/ipc.ts`, a registration in a `*Registration.ts`, and a preload method.

**Handler and listener registries:**
- Purpose: Map channel names to backend functions.
- Examples: `handlerRegistry` and `listenerRegistry` in `src/backend/platform/index.ts`. Filled by `ipcMain.handle` and `ipcMain.on` through `src/backend/ipc.ts` (`addHandler`, `addListener`).
- Pattern: Registration is a side effect of import. `handlers.ts` imports each domain's `register...Flows()` and calls it once.

**`LibraryManager` and `Game`:**
- Purpose: The uniform per-runner interface.
- Examples: `src/common/types/game_manager.ts` (interfaces); `src/backend/storeManagers/steam/library.ts` and `games.ts`; `legendary/library.ts` and `legendary/games.ts`.
- Pattern: `libraryManagerMap[runner].getGame(appName)` returns a `Game`. `launch`, `install`, `getGameInfo`, `getSettings` and `isGameAvailable` are the common surface.

**Seams:**
- Purpose: Keep backend code free of Tauri and Rust details.
- Examples: `src/backend/store/storeEmbedSeam.ts` (`StoreEmbedSeam`, installed by `storeEmbedFlowRegistration.ts` through `setStoreEmbedSeam()`); `src/backend/humble/loginWindowSeam.ts` (`LoginWindowSeam`, `createRustLoginWindowSeam()`, `getLoginWindowSeamOrThrow()`).
- Pattern: Plain interface plus a module-scoped holder. Installed unconditionally at startup, before any handler can run.

**Store declarations (`electronStores.ts`):**
- Purpose: Declare a persisted store and its type once, where it is used.
- Examples: `src/backend/storeManagers/steam/electronStores.ts`, `src/backend/humble/electronStores.ts`, `src/backend/logger/electronStores.ts`.
- Pattern: Constructing the store registers it in `electron_store.ts`'s registry. This is why `storeRegistration.ts` imports them for their side effects.

**Steam bridge and engine:**
- Purpose: Run Windows Steam and games inside Wine or CrossOver on macOS.
- Examples: `src/backend/storeManagers/steam/bridge/` (`bridgeRoute.ts`, `helperProcess.ts`, `drm/runnerClone.ts`, `overlay/`), `src/backend/storeManagers/steam/engine/engineRegistry.ts`, `engineSwitch.ts`, `fallbackEngine.ts`.
- Pattern: Engine choice and bottle decisions are inside `steam/` today. Phase 61 (planned) moves them out.

## Entry Points

**Tauri application:**
- Location: `src-tauri/src/main.rs` (`fn main`, Builder at ~line 1759, `.build(tauri::generate_context!())` at ~line 1765).
- Triggers: Launch, `gamelib://` deep links (`tauri-plugin-deep-link`), second launch (`single_instance.rs`, forwards argv to the running instance).
- Responsibilities: Window and tray, spawns the sidecar, routes frames, runs native arms, shuts the sidecar down.

**Sidecar process:**
- Location: `src/sidecar/index.ts`, bundled to `build/main/sidecar.js` by `pnpm build:sidecar` (esbuild, CJS, Node 22, packages external). The SEA build is `pnpm build:sidecar-sea` (`meta/buildSidecarSea.ts`).
- Triggers: Spawned by the Rust shell.
- Responsibilities: Imports and registers the backend, serves stdio RPC.

**Renderer:**
- Location: `src/frontend/index.tsx` (imports `../preload/tauriAttach` before everything else; `bootErrorSurface` first). Vite config at `vite.config.ts`, which sets the `backend`, `frontend` and `common` aliases.
- Triggers: The webview loads `index.html`, or `devUrl` (`http://localhost:5173`) in dev.
- Responsibilities: Attaches `window.api`, sets up i18n, the router (`src/frontend/App.tsx`, `createHashRouter` at ~line 334) and the global state.

**Relay worker:**
- Location: `relay/src/index.ts` (`relay/package.json` `main`), `relay/wrangler.jsonc`.
- Triggers: HTTP requests from clients.
- Responsibilities: Known-fix sharing. Not connected to the desktop sidecar.

## Architectural Constraints

- **Threading:** The sidecar is single-threaded Node with its event loop. CPU-bound work is offloaded to worker threads (`src/backend/storeManagers/steam/depot/decompressPool.ts`, `decompressWorker.ts`). The Rust shell has a reader thread, a send-writer thread, one worker thread per `rustInvoke`, and `spawn_blocking` for invokes. `main.rs` line 1025 notes that the macOS open-URL callback runs on the AppKit main thread.
- **Stdout is shared:** The RPC channel is the child's stdout. Any stray `console.log` in the sidecar lands in the same stream. The reader treats non-JSON lines as diagnostics (`[sidecar:out]`). A line that happens to parse as a frame would be dispatched, which is why the reader only treats a line as a frame after it parses as JSON with a known shape.
- **Global state:** Module-level singletons are common. Examples: `libraryManagerMap` (`storeManagers/index.ts`); `library` and the metadata-fetch limiter (`storeManagers/steam/state.ts`); `handlerRegistry` and `listenerRegistry` (`platform/index.ts`); `rustPending` (`sidecarRpc.ts`); `SidecarState` (`shell_state.rs`). A count taken on 2026-11-06 found 144 top-level `let` declarations in `src/backend` outside tests.
- **Import-time side effects:** Store managers are constructed at import (`storeManagers/index.ts`). The order in `bootstrap.ts` (hook, then handlers, then backend) is required, and `installRejectionGuard` must stay the first import in `src/sidecar/index.ts`.
- **Circular imports:** `steam/games.ts` and `steam/library.ts` form a known cycle (`.dependency-cruiser.cjs` comment). Phase 62's `no-circular-depot` rule covers the depot subtree only.
- **Dependency rules:** `.dependency-cruiser.cjs` defines five rules at severity `error`, held against `.dependency-cruiser-known-violations.json`, which may only shrink:
  - `no-cross-store-manager`: store managers do not import each other.
  - `launcher-only-via-store-managers-index`: `launcher.ts` reaches stores through `storeManagers/index.ts`.
  - `no-depot-parent-back-edge` and `no-circular-depot`: depot subtree layering.
  - `games-split-modules-are-leaves`: modules split out of `games.ts` do not import it at runtime.
- **Lint restriction:** ESLint `no-restricted-imports` forbids `ipcMain`/`ipcRenderer` from `electron` and points to `backend/ipc` and `preload/ipc`.
- **Electron leftovers:** The only live `'electron'` request is the one `installElectronHook.ts` intercepts. The other mentions found in source files are in comments, and the names carry history. A full import scan was not run.
- **Platform-specific:** Native arms are `#[cfg(target_os = ...)]`-gated. `login_window.rs` has separate Windows arms. `macos_epic_embed.rs` is macOS only. Pure logic for those modules sits in platform-neutral files (`store_embed_handoff_policy.rs`, `epic_embed_state.rs`) so it can be tested on Linux.

## Anti-Patterns

### Store-identity branching in shared code

**What happens:** Code branches on the runner name, for example `runner === 'steam'` in UI and backend code. Phase 62's planning notes count 66 frontend sites and 31 backend sites outside `storeManagers/`. `handleLaunch` in `steamFlowRegistration.ts` was runner-blind until a 2026 gap cycle fixed it.
**Why it's wrong:** Each new behavior adds a branch in more places, and a missing branch fails silently.
**Do this instead:** Dispatch through `libraryManagerMap[runner]` (as `handleRefreshLibrary` and `handleLaunch` now do). Phase 62 introduces store capability flags; until then, put store-specific logic inside `storeManagers/<runner>/`.

### Adding a handler to the wrong registration module

**What happens:** A handler is added inline in `handlers.ts` or to a module that is not a `*Registration.ts`.
**Why it's wrong:** `handlers.ts` is the only place that imports registrations, so a channel placed elsewhere either never registers or registers twice. `logError` is an example of a channel that must not be registered a second time (`handlers.ts` header).
**Do this instead:** Add the channel to the domain's `*Registration.ts`. Use the curated-import rule in that file's header.

### Importing the whole backend graph from a registration

**What happens:** A registration module imports a large host module (`launcher.ts`, `storeManagers/index.ts`) for one function.
**Why it's wrong:** It pulls the graph into the sidecar boot path and makes import order matter more. The `steamFlowRegistration.ts` header documents a case where this was removed.
**Do this instead:** Import the narrowest module that has the function. Check the bundle impact before adding a new edge.

### Sending a long wait through the 60 s bounds

**What happens:** A channel that waits for a human or for minutes of work uses the default timeout.
**Why it's wrong:** The renderer sees a spurious timeout while the work continues. The `UNBOUNDED_RUST_CHANNELS` list (`sidecarRpc.ts`) and `LONG_RUNNING_CHANNELS` (`main.rs`) exist for this case.
**Do this instead:** Add the channel to the matching list, with a comment about why it is unbounded.

## Error Handling

**Strategy:** Errors are returned, not thrown across the boundary. The sidecar catches handler errors in `dispatchInvoke` and sends `{ok:false, error: message}`. The renderer receives a rejected promise. Rust-side failures are logged with `shell_eprintln!`.

**Patterns:**
- Unknown channel: `ok:false` with `UNPORTED_CHANNEL_MARKER` (`sidecarRpc.ts`).
- Malformed or non-JSON frames: dropped with a stderr line (`[sidecarRpc] dropped malformed ...`).
- Oversized invoke (over 10 MiB): answered `ok:false` if the id is readable from the first 256 bytes, otherwise dropped.
- Late or abandoned responses: logged with the channel name from the `abandoned` ring in `shell_state.rs` (F-9 observability fix).
- Sidecar exit: `drain_pending_invokes` fails every waiting invoke at once (`sidecar.rs`, `main.rs` test `sidecar_exit_fails_every_pending_invoke_at_once`).
- Keychain: bounded inside Rust at `KEYRING_READ_TIMEOUT`, so a blocked prompt surfaces as `keyring:timeout` before the generic 60 s bound.

## Cross-Cutting Concerns

**Logging:** `src/backend/logger/` (Electron-era `logInfo`, `logError`, etc.) writes to the GameLib log. Rust logs go to stderr through `shell_eprintln!`. The sidecar forwards its stderr to the shell's stderr with a `[sidecar:err]` prefix (`sidecar.rs`).

**Validation:** Partial. Four of the 23 `*Registration.ts` modules validate arguments (`runnerMiscFlowRegistration.ts`, `runnerAuthFlowRegistration.ts`, `shellFilesFlowRegistration.ts`, `wineToolsFlowRegistration.ts`). The sidecar's `isValidRequest` (`sidecarRpc.ts`) checks the request's id, kind (`invoke`, `send` or `openExternal`), channel and args shape, and nothing about the channel's payload. Store reads are filtered by `storePolicy.ts`. Phase 67 plans schema validation at the boundary.

**Authentication:** Store-specific. Steam uses `steam-session` and a refresh token held in the OS Keychain (`sidecar/keyringTokenStore.ts`, `keyring_dispatch.rs`). Epic and Humble use cookie-based login windows (`login_window.rs`, `humble/loginWindowSeam.ts`). The renderer never holds a token; store reads are filtered by the D-08 allow-list.

**Path safety:** `src/backend/sidecar/rendererPathGuard.ts` (`assertContainedPath`) guards renderer-supplied paths. `pathShim.ts` maps Electron path names to app directories.

## Planned Changes

Status from `.planning/ROADMAP.md` at 2026-11-06. The roadmap records Phase 62 as 4 of 21 plans complete. Commit `e3a14cdb2` (62-05) is also on `main`. The rest of Phase 62 is not started.

- **Phase 62 (in progress):** Dependency-cruiser rules and baseline (landed), runner-literal ratchet (landed), CI wiring (landed), TypeScript↔Rust transport parity markers (landed), `STEAM_STORE_API` moved to `gameConstants.ts` (landed). The `games.ts` split has started. The roadmap also lists splits of `steam/depot.ts` and `common/types/ipc.ts`, and store capability flags to replace `runner ===` branching. The roadmap does not say how far those have progressed.
- **Phase 63:** Port PE and Mach-O scanners to Rust with a parity harness and a flag. Adds a Rust path for headless tools.
- **Phase 64:** UI to edit themes. No backend change.
- **Phase 65:** Split `steam/library.ts`, `steam/bottle.ts` and the largest `steam/bridge/` files.
- **Phase 66:** Replace module-level singletons with a context object created in `bootstrap.ts`, and route all child processes through one runner.
- **Phase 67:** Schema validation for every channel at the shared registration path.
- **Phase 68:** Versioned persisted stores and migrations.
- **Main.rs split:** Quick task `261106-ab1` split `main.rs` into sibling modules. The roadmap's "20,324-line main.rs" figure is stale; the file is 7,886 lines now.

---

*Architecture analysis: 2026-11-06*
