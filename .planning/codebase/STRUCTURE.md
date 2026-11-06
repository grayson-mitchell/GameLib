# Codebase Structure

**Analysis Date:** 2026-11-06

## Directory Layout

```
GameLib/
├── src/                      # TypeScript: renderer, preload bridge, sidecar backend, shared types
│   ├── frontend/             # React renderer (Vite bundle)
│   ├── preload/              # window.api attach + Tauri transport (renderer side)
│   ├── backend/              # Node sidecar: all business logic
│   ├── sidecar/              # Sidecar process entry (index.ts, installRejectionGuard.ts)
│   └── common/               # Types and pure helpers shared by all of the above
├── src-tauri/                # Rust shell (Tauri v2)
│   ├── src/                  # 23 .rs modules, main.rs and native arms
│   ├── capabilities/         # Tauri permission capability files
│   ├── binaries/             # Packaged sidecar binary (externalBin)
│   ├── gen/                  # Tauri-generated schemas (not hand-edited)
│   ├── icons/                # App icons
│   ├── tauri.conf.json       # Base Tauri config; per-OS overrides alongside
│   ├── tauri.{macos,linux,windows}.conf.json
│   └── Cargo.toml            # Rust dependencies (per-target `unstable` features)
├── native/steam-bridge/      # Native source for the Steam bridge
├── relay/                    # Cloudflare Worker: known-fix relay (separate package)
├── meta/                     # Build, codegen, maintenance and gate scripts (TS and CJS)
│   └── __tests__/            # Tests for the meta scripts and boundary gates
├── spike/                    # Research spikes (CrossOver compat, Steam bottle)
├── scripts/                  # Small one-off Node scripts (appinfo dump, branding check)
├── patches/                  # pnpm patches (@types/node, lzma, steam-user)
├── signatures/version1/      # CLA signature store (cla.json)
├── snap/                     # Snapcraft packaging (gui/, hooks/, local/)
├── public/                   # Static assets copied into the renderer build (icons, fixes, changelog.json, bin/)
├── doc/                      # Developer docs (ipc.md, electron_store.md, frontend_testing.md, ...)
├── .planning/                # GSD planning state: roadmap, phases, research, todos, codebase maps
├── .dependency-cruiser.cjs   # Import-graph rules (Phase 62)
├── .dependency-cruiser-known-violations.json  # Baseline; may only shrink
├── vite.config.ts            # Renderer build; aliases backend/frontend/common
├── tsconfig*.json            # TypeScript configs (root, eslint, meta)
├── jest.config.js            # Root Jest config; per-root configs live in src/*/
├── eslint.config.mjs         # ESLint flat config (incl. no-restricted-imports for electron IPC)
├── package.json              # Scripts: tauri:dev, build:sidecar, test, boundaries, ...
├── pnpm-workspace.yaml       # pnpm workspace (includes relay/)
├── index.html                # Renderer HTML entry for Vite
├── build/                    # GENERATED: renderer, sidecar bundle (gitignored)
└── node_modules/             # GENERATED (gitignored)
```

## Directory Purposes

**`src/frontend/`:**
- Purpose: React renderer (screens, UI components, client state, router).
- Contains: `App.tsx` (router; `createHashRouter` at ~line 334), `index.tsx` (entry), `screens/`, `components/`, `hooks/`, `state/`, `helpers/`, `styles/`, `themes.scss`, `index.scss`, `assets/`.
- Key files:
  - `src/frontend/index.tsx`: the entry; imports `../preload/tauriAttach` as its first meaningful import.
  - `src/frontend/App.tsx`: the route table.
  - `src/frontend/state/GlobalState.tsx`: the main global state component (2,259 lines).
  - `src/frontend/state/GlobalStateV2.ts`: a zustand store.

**`src/frontend/screens/`:**
- Purpose: One folder per route or large view.
- Contains: `Accessibility/`, `ConsoleMode/`, `Discounts/`, `DownloadManager/`, `Game/`, `Humble/`, `Library/`, `Loading/`, `Login/`, `Settings/`, `StoreSearch/`, `WebView/`, `WineManager/`.
- Key files: `Library/index.tsx` and `Library/LibraryContext.tsx`; `Game/GamePage/components/MainButton.tsx` (the play and install button); `Game/GameContext.tsx`.
- Note: The routes that load these are listed in `App.tsx`. Each screen directory contains its own `components/` and `__tests__/`.

**`src/frontend/components/`:**
- Purpose: Reusable UI.
- Contains: `UI/` (shared primitives such as `UI/Dropdown/index.tsx`, `UI/CachedImage/`, `UI/AboutDialog/`, `UI/ThemeSelector`), `Tour/`.
- Key files: Each component is a folder with `index.tsx`, styles and sometimes a `__tests__/` folder.

**`src/frontend/state/`:**
- Purpose: Client state beyond React local state.
- Contains: `GlobalState.tsx`, `GlobalStateV2.ts`, `ContextProvider.tsx`, `TourContext.tsx`, and Steam UI state modules (`SteamBridgeSetup.ts`, `SteamClientSetup.ts`, `SteamEngineState.ts`, `SteamSetupDownloads.ts`, and others).

**`src/frontend/helpers/`:**
- Purpose: Renderer helpers and the renderer's store declarations.
- Contains: `electronStores.ts` (renderer-side store declarations, Electron-era name), `gamepad.ts`, `shortcuts.ts`, `onlineMonitor.ts`, `steamInstallOptionsEntry.ts`, `index.ts`.

**`src/frontend/hooks/`:**
- Purpose: React hooks.
- Contains: `useSetting.ts`, `useSettingsContext.ts`, `useOpenDialog.ts`, `useLaunchOptions.ts`, `useAwaited.ts`.

**`src/preload/`:**
- Purpose: Renderer-side bridge to Tauri and the `window.api` object.
- Contains: `tauriAttach.ts` (side effect; attaches `window.api`), `tauriTransport.ts` (`invoke`, `send`, `listen`, store snapshot), `ipc.ts` (`makeHandlerInvoker`, `makeListenerCaller`, `frontendListenerSlot`), `platformDetect.ts`, `api/` (per-domain `window.api` modules).
- Key files: `src/preload/api/index.ts` (builds `api`), `src/preload/api/library.ts`, `steam.ts`, `downloadmanager.ts`, `storeEmbed.ts`, `tauriWindowChrome.ts`, `tauriNativeGamepad.ts`, `tauriChildWindows.ts`.
- Note: `src/preload/index.ts` is not present. The renderer does not use a separate preload script.

**`src/sidecar/`:**
- Purpose: Sidecar process entry.
- Contains: `index.ts` (the file bundled by `build:sidecar`) and `installRejectionGuard.ts` (must be the first import in `index.ts`).

**`src/backend/`:**
- Purpose: The Node sidecar. Nearly all logic lives here.
- Key top-level files:
  - `launcher.ts` (2,244 lines): runner-aware launch and Wine command dispatch.
  - `ipc.ts`: `addHandler`, `addListener`, `sendFrontendMessage` wrappers.
  - `main_window.ts`: `getMainWindow()` (returns the stub window).
  - `electron_store.ts` and `store_backend.ts`: persistence (conf shim, store registry).
  - `game_config.ts`, `config.ts`, `cache.ts`, `images_cache.ts`, `protocol.ts`, `online_monitor.ts`, `knownFix*.ts`, `progress_bar.ts`, `save_sync.ts`, `utils.ts`.
  - `longLivedChildren.ts`: registry of long-lived child processes.
  - `backend_events.ts`, `storeChangeNotifier.ts`: internal event buses.

**`src/backend/sidecar/`:**
- Purpose: Transport, composition root and sidecar-only glue.
- Key files:
  - `bootstrap.ts`: `init()` entry; module-scope hook install and import order.
  - `sidecarRpc.ts`: JSON-lines RPC loop.
  - `handlers.ts`: composition root (imports every registration).
  - `*Registration.ts` (23 modules), for example `steamFlowRegistration.ts`, `steamAuthFlowRegistration.ts`, `installFlowRegistration.ts`, `settingsFlowRegistration.ts`, `appShellFlowRegistration.ts`, `humbleFlowRegistration.ts`, `storeEmbedFlowRegistration.ts`, `dialogFlowRegistration.ts`, `wineToolsFlowRegistration.ts`, `runnerMiscFlowRegistration.ts`.
  - `storeRegistration.ts`: side-effect imports that construct every store declaration.
  - `storeWriteHandlers.ts`: store write channels.
  - `installElectronHook.ts`: `Module._load` hook for `require('electron')`.
  - `pathShim.ts`, `nativeImageShim.ts`, `fileStore.ts`, `keyringTokenStore.ts`, `humbleSecretStore.ts`, `steamgridSecretStore.ts`, `devSecretVault.ts` (dev only), `rendererPathGuard.ts`, `processGuards.ts`, `stdinEofRelease.ts`, `installedJsonWatcher.ts`, `oauthLoginCapture.ts`.

**`src/backend/platform/`:**
- Purpose: The Electron-shaped stand-in.
- Key files: `index.ts` (1,252 lines; `ipcMain`, `app`, `dialog`, `shell`, `BrowserWindow`, `handlerRegistry`, `listenerRegistry`, `bindTransport`), `types.ts` (first-party Electron-compatible type declarations), `openDetached.ts`.

**`src/backend/storeManagers/`:**
- Purpose: Per-runner store integrations and the registry.
- Key files: `index.ts` (`libraryManagerMap`, `initStoreManagers`, `autoUpdate`), `runnerLaunchArgv.ts`.
- Subdirectories:
  - `steam/`: the largest, described below.
  - `gog/`: `library.ts`, `games.ts`, `user.ts`, `setup.ts`, `presence.ts`, `redist.ts`, `constants.ts`, `electronStores.ts`, `e2eMock.ts`.
  - `legendary/` (Epic): `library.ts`, `games.ts`, `user.ts`, `setup.ts`, `thirdParty.ts`, `epicOfflineMode.ts`, `commands/`, `eos_overlay/`.
  - `nile/` (Amazon): `library.ts`, `games.ts`, `user.ts`, `setup.ts`, `constants.ts`.
  - `sideload/`: `library.ts`, `games.ts`, `electronStores.ts`.
  - `storeManagerCommon/`: `games.ts` (shared base for game classes).
  - Each runner also has `electronStores.ts` (its persisted declarations) and `__tests__/`.

**`src/backend/storeManagers/steam/`:**
- Purpose: The Steam runner.
- Key files: `library.ts` (`SteamLibraryManager`, 4,393 lines), `games.ts` (`SteamGame`, 7,022 lines; `gameConstants.ts` and `gameSessionState.ts` are its first extracted modules), `depot.ts` (4,598 lines), `bottle.ts` (2,567 lines), `user.ts` (`SteamUser`, 1,562 lines), `state.ts` (shared library Map and fetch limiter), `tokenStore.ts`, `anonymousClient.ts`, `authTrigger.ts`, `launchDispatch.ts`, `installLocation.ts`, `licensedDemos.ts`, `macSteamAdoption.ts`, `macSteamOffline.ts`, `electronStores.ts`.
- Subdirectories:
  - `depot/`: manifest parsing, chunk decode, decompression (`decompressPool.ts` and `decompressWorker.ts` run in worker threads), reconcile, selection, stall tracking, CDN auth.
  - `engine/`: engine registry, pins, switch, fallback and bottle adoption (`engineRegistry.ts`, `enginePins.ts`, `engineSwitch.ts`, `fallbackEngine.ts`, `adoptBottle.ts`).
  - `bridge/`: macOS Steam bridge. Includes `drm/` (runner clone, DRM staging, PE scanning, valve client), `overlay/` (overlay launch, policy, runner clone), `shimGenerate.ts`, `shimExports.generated.ts` (generated; do not hand-edit), `helperProcess.ts`, `bridgeRoute.ts`, `allowlist.ts`, and `bridge-allowlist.json`.
  - `__tests__/`: the Steam test suite.

**`src/backend/humble/`:**
- Purpose: Humble Bundle integration.
- Contains: `user.ts`, `library.ts`, `adapter.ts`, `classify.ts`, `dedup.ts`, `syncFence.ts`, `secretStore.ts`, `loginWindowSeam.ts`, `validation.ts`, `expirationAlerts.ts`, `ipc_handler.ts`, `electronStores.ts`, `__tests__/`.

**`src/backend/store/`:**
- Purpose: Seams for native capabilities installed at startup.
- Contains: `storeEmbedSeam.ts`.

**`src/backend/utils/`:**
- Purpose: Shared helpers (filesystem, aborthandler, compatibility layers, Mac architecture helpers).
- Contains: `compatibility_layers.ts`, `checkGameUpdates.ts`, and subfolders such as `filesystem/`, `aborthandler/`.

**Other backend domains (one folder each unless noted):**
- `downloadmanager/`: download queue and progress (`downloadqueue`, `utils`).
- `wine/`: Wine runtime management (`wine/manager/` with its own `electronStores.ts`).
- `anticheat/`, `signInProbe/`, `runsForMe/`, `game_overrides/`, `gamedetails/`, `migration/`, `logger/`, `macArch/`, `platform/`, `constants/`, `crossover_index/`, `discounts/`, `dialog/`, `recent_games/`, `shortcuts/`, `steamgrid/`, `storeSearch/`, `tools/`, `wiki_game_info/`, `wine/`, `testUtils/`, `__mocks__/`, `__tests__/`.

**`src/common/`:**
- Purpose: Types and pure logic usable from the renderer, preload and backend.
- Key files:
  - `types/ipc.ts`: channel maps (`AsyncIPCFunctions`, `SyncIPCFunctions`, `FrontendMessages`), 945 lines.
  - `types/sidecarTransport.ts`: frame types, channel constants, `READY_SENTINEL`, `RUST_INVOKE_CHANNELS`, `transport-mirror` markers.
  - `types/storePolicy.ts`: D-08 allow-list, `BOOT_SET_STORES`, `LAZY_STORES`, `STORE_UNIVERSE`.
  - `types/electron_store.ts`: store structure types (Electron-era name).
  - `types/game_manager.ts`: `LibraryManager` and `Game` interfaces.
  - `types/steam.ts`, `storeSearch.ts`, `humble.ts`, `gog.ts`, `legendary.ts`, `nile.ts`, `discounts.ts`, `proxy-types.ts`, `oauthLogin.ts`.
  - `types.ts`: barrel-style re-exports used as `import ... from 'common/types'`.
  - `languages.ts`, `utils.ts`, `matching/`, `winetricks/`, `discounts/`, `humble/`, `typedefs/`.

**`src-tauri/src/`:**
- Purpose: The Rust shell.
- Key files:
  - `main.rs` (7,886 lines): Tauri builder, `invoke_handler` list, `.setup()`, `RunEvent::Exit`, shared constants (`INVOKE_TIMEOUT`, `LONG_RUNNING_CHANNELS`), and tests. Split by quick task `261106-ab1`.
  - `sidecar.rs`: spawn (dev and packaged), stdout reader, stderr forwarder.
  - `shell_state.rs`: `SidecarState`, pending map, abandoned ring, shutdown.
  - `relay_commands.rs`: `sidecar_invoke`, `sidecar_send`, `sidecar_store_snapshot`, `open_external`, and `SidecarSendQueue`.
  - `store_embed.rs` (4,623 lines): in-app store and wiki child webviews, and `dispatch_rust_channel`.
  - `store_embed_handoff_policy.rs`: popup and download policy, platform-neutral and testable on Linux.
  - `login_window.rs` (3,339 lines): login child windows, cookie reads and clears.
  - `macos_epic_embed.rs` (2,089 lines), `epic_embed_state.rs`, `epic_embed_js_dialog.rs`: Epic's raw WKWebView (macOS only).
  - `keyring_dispatch.rs`: Keychain `keyring_get` and related arms.
  - `tray.rs`, `single_instance.rs` (deep-link argv helpers, single-instance socket), `terminate_veto.rs`, `clipboard.rs`, `notification_backend.rs`, `macos_notifications.rs`, `macos_native_gamepad.rs`, `native_gamepad_shape.rs`, `wake_lock.rs` (and `wake_lock/`).

**`meta/`:**
- Purpose: Build pipelines, code generation and CI gate scripts. Run through `meta/runTs.cjs` or `node`.
- Key files: `buildSidecarSea.ts` (packaged sidecar), `buildDecompressWorkerDev.ts`, `buildSteamBridgeShims.ts`, `buildLsteamclient.ts`, `buildOverlayArchive.ts`, `buildDrmNativeParts.ts`, `buildRunnersOnedir.ts`, `assembleRendererDist.ts`, `buildCrossoverIndex.ts`, `bridgeCensus.ts`, `tauriDevPreflight.cjs`, `boundaryRatchet.cjs`, `gen_vtables.ts`.
- Tests: `meta/__tests__/`.

**`relay/`:**
- Purpose: Cloudflare Worker for opt-in known-fix sharing.
- Contains: `src/` (`index.ts` entry), `migrations/`, `wrangler.jsonc`, its own `package.json` and `pnpm-lock.yaml`.
- Note: Has its own `package.json`, `pnpm-lock.yaml` and `wrangler.jsonc`. It is not part of the desktop runtime.

**`native/steam-bridge/`:**
- Purpose: Native source for the Steam bridge. Build scripts that consume it live under `meta/`.

**`spike/`:**
- Purpose: Research and experiments. Not part of the build.
- Contains: `crossover-compat-FINDINGS.md`, `crossover-compat-lookup.mjs`, `steam-bottle/`.

**`doc/`:**
- Purpose: Developer documentation.
- Contains: `ipc.md` (channel contract), `electron_store.md` (persistence; Electron-era name), `frontend_design_system.md`, `frontend_testing.md`, `cla.md`, `releases/`.

**`.planning/`:**
- Purpose: GSD workflow state. Not shipped.
- Key files: `ROADMAP.md` (phase plan; Phase 62 in progress), `STATE.md`, `PROJECT.md`, `phases/` (per-phase plans and summaries), `research/` (`ARCHITECTURE.md` predates the Tauri shell, so do not use it for current structure), `todos/`, `spikes/`, `sketches/`, `milestones/`, `codebase/` (this map).

## Key File Locations

**Entry Points:**
- `src-tauri/src/main.rs`: Rust shell (`fn main`, builder around line 1759).
- `src/sidecar/index.ts`: sidecar process.
- `src/backend/sidecar/bootstrap.ts`: sidecar `init()`.
- `src/frontend/index.tsx`: renderer.
- `src/preload/tauriAttach.ts`: `window.api` attach (imported by the renderer entry).
- `relay/src/index.ts`: relay worker.

**Configuration:**
- `src-tauri/tauri.conf.json` (base) plus `tauri.macos.conf.json`, `tauri.linux.conf.json`, `tauri.windows.conf.json`: Tauri app config (`frontendDist: ../build/renderer`, `externalBin: binaries/gamelib-sidecar`).
- `src-tauri/Cargo.toml`: Rust deps; `tauri` `unstable` is enabled per target.
- `src-tauri/capabilities/`: Tauri permission capabilities.
- `vite.config.ts`: renderer build and aliases.
- `tsconfig.json`, `tsconfig.eslint.json`, `tsconfig.meta.json`.
- `.dependency-cruiser.cjs`, `eslint.config.mjs`, `jest.config.js`, `.prettierrc.json`, `.editorconfig`.
- `src/backend/store_backend.ts`: runtime store path rules.

**Core Logic:**
- `src/backend/launcher.ts`: runner-aware launch.
- `src/backend/storeManagers/index.ts`: runner registry.
- `src/backend/storeManagers/steam/games.ts`, `library.ts`, `depot.ts`: Steam.
- `src/backend/sidecar/sidecarRpc.ts`: RPC.
- `src/common/types/ipc.ts`, `src/common/types/sidecarTransport.ts`: contracts.
- `src-tauri/src/relay_commands.rs`, `src-tauri/src/sidecar.rs`: Rust routing.

**Testing:**
- Co-located `__tests__/` folders in every area (for example `src/backend/__tests__/`, `src/backend/storeManagers/steam/__tests__/`, `src/frontend/screens/Game/GamePage/components/__tests__/`).
- `src/backend/testUtils/`, `src/backend/__mocks__/`, `src/frontend/__mocks__/`.
- `src/*/jest.config.js` (`backend`, `frontend`, `common`, `preload`) and root `jest.config.js`.
- Rust unit tests: `#[cfg(test)] mod tests` at the bottom of each module (for example `main.rs` line 1854).

## Naming Conventions

**Files (TypeScript):**
- camelCase for most modules: `steamFlowRegistration.ts`, `sidecarRpc.ts`, `storeEmbedSeam.ts`.
- snake_case for a legacy minority: `electron_store.ts`, `store_backend.ts`, `ipc_handler.ts`, `humble/ipc_handler.ts`, `frontend/helpers/electronStores.ts` (camelCase, but Electron-era name).
- Per-domain store declarations: `electronStores.ts` in each store or domain folder.
- Registration modules: `<domain>FlowRegistration.ts` (flow channels) or `<domain>Registration.ts`.
- Renderer components: `PascalCase.tsx` for component files, and folder `index.tsx` for a component folder (`components/UI/Dropdown/index.tsx`).
- Tests: `<name>.test.ts` or `<name>.test.tsx` inside `__tests__/`. Helpers and mocks are `e2eMock.ts`, `__mocks__/`, `testUtils/`.

**Files (Rust):**
- snake_case modules: `store_embed.rs`, `login_window.rs`, `macos_epic_embed.rs`, `relay_commands.rs`.
- Module subfolder `wake_lock/` sits next to `wake_lock.rs`.

**Directories:**
- Store and domain folders are lowercase: `storeManagers/steam/`, `humble/`, `downloadmanager/`, and `legendary/` (Epic's runner name). Two folders use snake_case: `game_overrides/`, `crossover_index/`.
- Frontend screen folders are PascalCase: `screens/Library/`, `screens/Game/GamePage/`.

**Channels and identifiers:**
- Channel names are camelCase verbs (`refreshLibrary`, `launch`, `winetricksInstall`), with `sidecar:` for read channels (`sidecar:store-snapshot`, `sidecar:store-fetch`) and snake_case for Tauri commands (`sidecar_invoke`, `sidecar_send`, `open_external`).
- Rust-side `rustInvoke` channels are snake_case (`keyring_get`, `dialog_open`).

## Where to Add New Code

**A new sidecar RPC channel (renderer calls backend):**
1. Add the channel type to `src/common/types/ipc.ts` (`AsyncIPCFunctions` for invoke, `SyncIPCFunctions` for send, `FrontendMessages` for push).
2. Register the handler in the matching `src/backend/sidecar/<domain>FlowRegistration.ts`. If none fits, create a new `<domain>FlowRegistration.ts` with `register<Domain>Flows()`, and call it from `src/backend/sidecar/handlers.ts`.
3. Add the `window.api` method in `src/preload/api/<domain>.ts`, built with `makeHandlerInvoker` or `makeListenerCaller` from `src/preload/ipc.ts`.
4. Add a test next to the registration in `src/backend/sidecar/__tests__/`.

**A new Steam behavior:**
- Logic: `src/backend/storeManagers/steam/`, in the file whose concern matches (`games.ts` for per-game, `library.ts` for library refresh, `user.ts` for account, `depot/` for downloads, `engine/` for Wine engine selection, `bridge/` for the macOS bridge).
- Do not import another store manager. Shared helpers go in `src/backend/utils/` or `src/common/`.
- Use the new `src/backend/storeManagers/steam/games*.ts` pattern for new per-game concerns (`gameConstants.ts`, `gameSessionState.ts`). Phase 62 is splitting `games.ts` this way, so keep new modules as leaves that do not import `games.ts`.

**A new store (runner):**
- Folder: `src/backend/storeManagers/<runner>/` with `library.ts`, `games.ts`, `user.ts`, `electronStores.ts`, `__tests__/`.
- Register it in `src/backend/storeManagers/index.ts` (`libraryManagerMap`) and add the runner to `Runner` in `src/common/types`.
- Add a `src/backend/sidecar/<runner>...Registration.ts` if it needs its own channels.

**A new native (Rust) capability:**
- Module: `src-tauri/src/<feature>.rs`. Keep pure logic AppHandle-free in a platform-neutral module so `cargo test` runs on Linux (the `store_embed_handoff_policy.rs` pattern).
- Command (renderer-called): add the `#[tauri::command]` to the module, and list it in `generate_handler!` in `src-tauri/src/main.rs` (~line 1759).
- Sidecar-called: add the channel to `RUST_INVOKE_CHANNELS` in `src/common/types/sidecarTransport.ts`, add a `transport-mirror:` marker in Rust, and add an arm to `dispatch_rust_channel` (`src-tauri/src/store_embed.rs`, line 1810) that delegates to your module.
- Rust must never send a `rustInvoke` frame into the sidecar (`T-28-03b` in `sidecarTransport.ts`). Only the sidecar starts those requests.

**A new renderer screen:**
- Folder: `src/frontend/screens/<Name>/index.tsx`, with `components/` and `__tests__/` beside it.
- Route: add it to the `routes` array in `src/frontend/App.tsx` (around line 238).

**A shared UI component:**
- Folder: `src/frontend/components/UI/<Name>/index.tsx`. Feature-specific components go in the screen's `components/` folder instead.

**A pure helper:**
- Renderer and backend: `src/common/` (for example `src/common/utils.ts`, `src/common/<feature>.ts`).
- Backend only: `src/backend/utils/`.

**A persisted setting or store:**
- Declare it in the domain's `electronStores.ts` (or `src/backend/constants/key_value_stores.ts` for shared keys), and import it into `src/backend/sidecar/storeRegistration.ts` so the sidecar constructs it at boot. Otherwise snapshots silently omit it.
- The renderer may read a field only if it is in `STORE_ALLOWLIST` in `src/common/types/storePolicy.ts`.

**Tests:**
- Backend: `src/backend/<area>/__tests__/<name>.test.ts`, run with `pnpm test` (Jest, per-root config).
- Frontend: `src/frontend/<area>/__tests__/<name>.test.tsx`.
- Spawn sites: use `createFakeHomeProfile()` (see `src/backend/testUtils/`).

## Special Directories

**`build/`:**
- Purpose: Vite renderer output (`build/renderer`, which `frontendDist` points at), sidecar bundle (`build/main/sidecar.js`), and assets copied in by `meta/` scripts.
- Generated: Yes.
- Committed: No (`.gitignore` line 12).

**`src-tauri/target/`:**
- Purpose: Cargo build output.
- Generated: Yes.
- Committed: No (`src-tauri/.gitignore`).

**`src-tauri/gen/`:**
- Purpose: Tauri-generated schemas and bindings.
- Generated: Yes (by the Tauri CLI; do not hand-edit).
- Committed: Present in the tree; check `git ls-files src-tauri/gen` before editing.

**`src-tauri/binaries/`:**
- Purpose: Packaged sidecar binary referenced as `binaries/gamelib-sidecar` in `tauri.conf.json` (currently `gamelib-sidecar-aarch64-apple-darwin`).
- Generated: Yes, by `pnpm build:sidecar-sea`.
- Committed: Present in the working tree; not gitignored.

**`src/backend/storeManagers/steam/bridge/shimExports.generated.ts`:**
- Purpose: Generated export tables for the Steam bridge shim.
- Generated: Yes (`shimGenerate.ts`, `meta/buildSteamBridgeShims.ts`).
- Committed: Yes. Regenerate; do not edit by hand.

**`src/backend/storeManagers/steam/bridge/bridge-allowlist.json`:**
- Purpose: Allow-list data read by the bridge.
- Generated: No. Edited by hand.

**`src/backend/storeManagers/steam/depot/lzmaNativeResolvedPaths.generated.cjs`:**
- Purpose: Resolved native LZMA binding paths.
- Generated: Yes.
- Committed: Yes.

**`public/`:**
- Purpose: Static assets served and copied into the renderer build. Includes `changelog.json`, tray icons, DMG art, `bin/`, `fixes/`.
- Generated: No.
- Committed: Yes.

**`signatures/`:**
- Purpose: CLA signature store (`version1/cla.json`).
- Generated: Not verified; treat as data written by the CLA process, not hand-edited code.
- Committed: Yes.

**`graphify-out/`:**
- Purpose: Knowledge-graph output for code navigation.
- Generated: Yes.
- Committed: No (`.gitignore` line 63).

**`.claude/worktrees/`:**
- Purpose: Git worktrees used by agent runs.
- Generated: Yes.
- Committed: No.

**`.planning/`:**
- Purpose: Workflow state.
- Generated: Partly (by GSD commands).
- Committed: Yes.

---

*Structure analysis: 2026-11-06*
