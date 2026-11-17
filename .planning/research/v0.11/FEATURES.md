# Feature Landscape: What Is Left on Node (v0.11 Node Sidecar Retirement)

**Domain:** Subsystem census of `src/backend` (+ `src/sidecar`) for the Rust port
**Researched:** 2026-11-17
**Overall confidence:** HIGH for sizes and reachability (measured); MEDIUM for external-binary lists (grep-based); MEDIUM-LOW for per-channel counts (approximate, see method)

## Method (so the numbers can be re-derived)

- **Sizes:** non-test `.ts/.tsx` lines (`wc -l`, excluding `__tests__`, `*.test.*`, `__mocks__`) and test lines (everything under `__tests__` / `*.test.*`). Measured 2026-11-17 on `main` at f7974eb9b.
- **Runtime reachability:** esbuild bundle of the real sidecar entry (`src/sidecar/index.ts`, the same flags as `meta/buildSidecar.ts`) with a metafile. 586 non-test backend files exist; **511 are in the runtime bundle**, 75 are not. Those 75 are the dead/type-only/test-only set listed under "Delete".
- **Channels:** counted from `src/common/types/ipc/*.ts` interface keys and `.handle/.on` registration sites in `src/backend/sidecar/*FlowRegistration.ts`. Interface-key counts include arg-name lines, so treat them as upper bounds. Roughly **250-290 renderer-facing handler/listener registrations** across 27 registration files. `RustInvokeChannel` (sidecar -> Rust shell) has **111** variants; Rust already serves ~109 dispatch arms and ~81 `steamcm/steamfiles/steampoll/depot/scan` RPC names.
- **Runtime npm deps the bundle actually pulls (Rust must replace each):** `axios`, `conf`, `i18next`+`i18next-fs-backend`, `zod`, `ini`, `json5`, `plist`, `semver`, `shlex`, `fs-extra`/`graceful-fs`, `tmp`, `easydl` (download), `fastest-levenshtein`, `filesize`, `sanitize-filename`, `@shockpkg/icon-encoder` (Windows shortcut icons), `@xhayper/discord-rpc` (GOG presence). Node builtins used: `fs`, `path`, `crypto`, `zlib`, `net`, `dns`, `https`, `child_process`, `node:sea`.

## Already on Rust (do not re-port; only the TS shim remains)

| Rust crate / shell module | Rust LOC | TS shim still in `src/backend` | Shim LOC |
|---|---|---|---|
| `gamelib-steamcm` (+cli) CM session, sign-in, PICS, depot keys, owned apps, redeem, store enrichment | 16.6k | `storeManagers/steam/cm/*`, `rustSession.ts`, `anonymousClient.ts` | 587 + |
| `gamelib-depot` (+cli) depot download pipeline | 18.1k | `steam/depotRust/*` | 1,870 |
| `gamelib-steamfiles` (+cli) libraryfolders/ACF/registry/localconfig/shortcuts.vdf | 4.9k | `steam/localFiles/*` | 254 |
| `gamelib-steampoll` (+cli) install/uninstall/update poll loops, restart hold, monitor, outbox | 18.3k | `steam/pollRust/*`, `sidecar/steamPollEventRegistration.ts` (the TS state-event handler Phase 80 left) | 198 + 274 |
| `gamelib-scan` (+cli) library/PE scan | 3.6k | `scanners/rustScan.ts` | 152 |
| `gamelib-i18n` (Rust locale lookup) | 0.3k | `i18nFallback.ts`, `appshell/language.ts` (backend still uses `i18next`) | ~100 |
| Tauri shell (`src-tauri/src/*.rs`, 17.5k): keyring, dialogs, clipboard, notifications, tray, wake-lock, single-instance, login window, store embed, app lifecycle, gamepad | 17.5k | `host/*` (654), `sidecar/keyringTokenStore.ts` (576), `dialog/*`, `store/storeEmbedSeam.ts` | ~1.4k |

These shims are "delete once their callers are Rust" work, not port work. They are the cheapest deletions in the milestone and they only die when the TS callers above them are ported (dependency, not independence).

## Table Stakes (must keep working after the port)

User-visible capability -> owning subsystem. Each row becomes a "user can still X" requirement.

| Capability | Owning subsystem(s) | Complexity |
|---|---|---|
| Sign in / out of Epic, GOG, Amazon (OAuth), Steam (QR/credentials/Guard, already Rust CM), Humble (embedded webview) | `legendary/user`, `gog/user`, `nile/user`, `sidecar/*AuthFlow*`, `oauthLoginCapture`, `humble/user` | Med |
| Browse a unified library with metadata, artwork, playtime, delisted/hidden state | each manager `library.ts`, `images_cache`, `gamedetails`, `wiki_game_info`, `steamgrid` | High |
| Install / update / repair / move / uninstall a game (Epic, GOG, Amazon, sideload, Steam depot + bridge + native) | managers `games.ts`, `downloadmanager`, `utils/*` | High |
| Download queue with pause/resume/cancel and progress | `downloadmanager` | Med |
| Launch a game (native, Wine/Proton/CrossOver, gamescope/mangohud, offline, anti-cheat/known-fix handling) | `launcher.ts`, `engine`, `wine`, `tools`, `knownFix*`, `commandRunner` | High |
| Wine/Proton/CrossOver engine selection, per-game bottles, winetricks, DXVK/DXMT, runtime downloads | `engine`, `wine`, `tools`, `crossover_index`, `steam/bottle*` | High |
| Steam games run on macOS via bridge/DRM/overlay and bottle | `steam/bridge/*`, `steam/game*Launch*`, `bottle*` | Very high |
| Cloud/save sync (legendary, gogdl) | `save_sync.ts`, managers | Med |
| Shortcuts (desktop, start menu, add to Steam) | `shortcuts/*` | Med |
| Settings (global + per game), config.json, per-store caches, versioned stores + migrations | `config.ts`, `game_config.ts`, `store_backend`, `typed_store`, `storeVersioning`, `storeMigrations`, `stores/*` | High (everything reads it) |
| Logs (write, view, upload, delete uploaded) | `logger/*` | Low-Med |
| Cross-store search with owned badges and ITAD/CheapShark | `storeSearch`, `discounts` | Low-Med |
| Humble key sync, classify, cross-ref to Steam, claim flow, expiry alerts | `humble/*` | High |
| Offline/online mode, quit handling, single launch flight, protocol URL (`gamelib://`) | `online_monitor`, `connectivityNow`, `quitHandler`, `launchSingleFlight`, `protocol.ts` | Med |
| Recent games, runs-for-me, anti-cheat badges, compatibility rating, known-fix reports | small dirs, see table | Low |
| Sign-in probes (Epic/GOG/Amazon health) | `signInProbe` | Low-Med |
| EOS overlay install/enable, Discord presence (GOG) | `legendary/eos_overlay`, `gog/presence` | Low-Med |

## Census by subsystem

Legend: **P**=port, **D**=delete, **R**=already-Rust (shim only). Size class: **tiny** <300, **small** <1k, **medium** 1-3k, **large** >3k. "Tests" is test lines. Risk: **Low** = stateless/pure, **High** = persistent state, long-lived children or timers, or parity-critical.

### A. Steam (`storeManagers/steam`, 48,639 src / tests incl. in storeManagers 91k total)

| Sub-area | Src LOC | Capabilities | Class | Size / Risk | External binaries / services | Notes and dependencies |
|---|---:|---|---|---|---|---|
| `bridge/` (top 10,933; `drm/` 5,739; `overlay/` 1,487; **18,159 total**) | 18,159 | Run Windows-only Steam games on macOS through the native steam_api bridge: shim placement/generation, import scan, DRM (SteamStub/CEG) via genuine Valve DLL + `lsteamclient` trampoline, overlay via CX_ENV dylib on a re-signed CrossOver clone, shared-redist install, helper process + invite picker | P | **large, High** (stateful helpers, codesign, wine child lifecycles; verified-strictness rules in MEMORY) | CrossOver `wine`/`wineserver`/`cxbottle`, `codesign`, `xattr`, `unzip`, `pgrep`, native C/ObjC in `native/steam-bridge/` (stays as-is), Valve CDN | `shimExports.generated.ts` (1,146) is generated: regenerate from the Rust side or a data table, do not hand-port. Depends on Foundation (process runner, stores), CrossOver/engine, bottle. Needs `RustInvokeChannel` BridgeInvitePickerOpen already in Rust. |
| Launch: `gameLaunch`, `gameBridgeLaunch`, `gameBridgeWineLaunch`, `gameDrmLaunch`, `gameLaunchOverlay`, `steamLaunchWatch`, `stopSteamLaunchedGame`, `updateLaunchPrompt`, `launchDispatch` | 4,448 | Launch Steam games (steam:// or bridge/bottle), Playing badge, stop, update-prompt-before-launch | P | large, High | `steam://rungameid`, Mac Steam client, wine | Depends on bridge + bottle + gameSessionState (Phase 80 deferred) |
| Bottle: `bottle*`, `bridgeBottle*`, `provisionBottle`, `bottledSteam`, `bottleProcessMonitor` | 4,135 | Create/provision GameLib-managed CrossOver bottle, bottled Steam (narrow fallback), process monitor | P | large, High (long-lived monitor) | CrossOver, winetricks, `wineserver`, `pgrep`, PowerShell (Win) | Shared with `engine/` bottle ledger |
| Install: `gameInstall*`, `installLocation`, `installFormIpc`, `steamInstall*`, `setupDownloads` | 3,236 | Install form (wine/bottle/Steam library target), depot plan, native `InstallApp`, size estimate | P | medium-large, Med | `steam://install`, depot Rust | Calls Rust depot; TS `depot/` (2,148: plan, select, sharedRedist, betaBranch, contentServers) is the plan layer still in TS |
| Uninstall: `gameUninstall`, `cancelDelete`, `nativeDelete`, `removeAllCopies` | 1,436 | Uninstall native/bottle/bridge copies, cancel-delete | P | medium, Med | fs, `steam://uninstall` | Poll half already Rust (`gamelib-steampoll`) |
| Library: `library/` (rustRefresh 520, index 374, acfState 350, refresh 297, uninstallPolling 305, resume 265, installRoot 258, macArch 237, installedMap 213, resumeBreadcrumbs 200, acfUpdateState 94) | 3,415 | Library refresh, installed map, ACF state, resume, `libraryState` | P (Phase 80 deferred: libraryState/gameSession/update cache) | medium, **High** (single source of truth for install state) | `libraryfolders.vdf`, ACFs | **Shadowed:** `uninstallPolling.ts`, `acfState.ts`, `acfUpdateState.ts`, `resume.ts`, `macArch.ts` overlap `gamelib-steampoll` (`uninstall.rs`, `acf_copies.rs`, `update.rs`). Re-check each for dead remnants before porting (graphify/knip). |
| Auth: `user*`, `authTrigger`, `tokenStore`, `rustSession`, `logonVerdict` | 2,151 | Steam account add/remove, sign-in state, key redeem, sync stamps | P (thin over Rust CM) | medium, Med | Rust CM, OS keyring (`RustInvokeChannel` keyring) | Mostly orchestration; sign-in flows already Rust |
| `depot/` | 2,148 | Depot plan/select/shared-redist/beta branch | P | medium, Med | Rust depot, CDN | Pure-ish planning; good early candidate |
| `depotRust/` | 1,870 | Job build, progress bridge, secondary installs, update estimate | R shim, delete after install/update callers move | medium, Low | Rust depot | Event path `RustJobEvent` already timer-free |
| Update: `update*`, `autoUpdateAttempts`, `gameSessionState`(261) | 1,192 | Update detection cache, native update, update bridge, session state | P (Phase 80 deferred) | medium, **High** | Mac Steam client | Ends `polls=ts` fallback |
| Client: `macSteam*`, `steamClientProcess`, `clientSetup`, `steamProcesses` | 1,049 | Adopt/update through running Mac Steam, process detection | P | medium, Med | Mac Steam, `pgrep` | |
| `cm/` | 587 | CM client types + Rust wrapper | R shim | small, Low | | Delete with callers |
| `localFiles/` + `engine/steamEngineDeps.ts` | 254 + 241 | Steam files wrapper; engine deps | R shim / P | tiny | | |
| `pollRust/` | 198 | Rust poll wrapper | R shim | tiny | | Delete after Phase 80 deferred items |
| Remaining top-level (`games.ts` 703, `stores.ts`, `user.ts`, `gameMetadata`, `gameEligibility` 267, `bridgeInstallState` 226, `bridgeKnownFixes` 449, etc.) | rest of 21,767 top-level | Orchestrator class `SteamGame`, eligibility, known fixes, `bridgeInstallState` (Phase 80 deferred) | P | medium, Med | | `bridgeInstallState.ts` is the named deferred item |

Steam sub-total reconciles: 21,767 top + bridge 18,159 + library 3,415 + depot 2,148 + depotRust 1,870 + cm 587 + localFiles 254 + engine 241 + pollRust 198 = 48,639.

### B. Other store managers

| Dir | Src | Tests | Capabilities | Class | Size / Risk | External binaries | Notes |
|---|---:|---:|---|---|---|---|---|
| `storeManagers/gog` | 5,111 (library 1,759, games 1,656) | in 91k | GOG library, install/update/uninstall, Linux installers, redist, cloud save, Galaxy presence via Discord RPC | P | large, High | **gogdl**, **comet**, PowerShell (Win), Wine | `presence.ts` uses `@xhayper/discord-rpc` (needs Rust equivalent or drop) |
| `storeManagers/legendary` | 4,224 (games 1,238, library 1,051, user 756, eos_overlay 331) | | Epic library, install/launch/sync, EOS overlay, offline mode, EGL sync, third-party launchers | P | large, High | **legendary**, Wine/CrossOver/Proton | `commands/` (~270) are arg-builder types only, not in runtime bundle |
| `storeManagers/nile` | 1,983 | | Amazon library/install/launch/auth | P | medium, Med | **nile**, Wine, PowerShell | |
| `storeManagers/sideload` | 429 | | Add non-store games | P | small, Low | Wine/shortcuts | Pure local state |
| `storeManagers/storeManagerCommon` | 233 | | Shared manager base | P | tiny, Low | | |
| `storeManagers/*/e2eMock.ts` + `index.ts` glue | 210 + | | CI=e2e stub listeners wired in `sidecar/bootstrap.ts` | D unless e2e suite is kept | tiny, Low | | Decide with e2e strategy |

Bundled external binaries stay; Rust spawns them: legendary, gogdl, comet, nile live under `build/bin/{arm64,x64}/{darwin,linux,win32}`. Parser contracts (JSON/line formats and progress regexes) are the port surface.

### C. Services and runtime

| Dir / file | Src | Tests | User-visible capabilities | IPC / RPC served | Class | Size / Risk | External binaries / services | Notes |
|---|---:|---:|---|---|---|---|---|---|
| `engine/` (35 files) | 7,043 | 9,114 | Engine choice (CrossOver first, Staging fallback), per-game bottles, adopt bottle, launch deadlines, notices, wine-manager releases | `engineFlowRegistration` (getEngineState, listEngineOptions, getDefaultEngine, getPerGameBottleName, dismissEngineNotice, engineStateChanged) | P | large, **High** | CrossOver, `wineserver`, `wineboot`, `cxbottle`, `tar`, `pgrep`, DXVK/DXMT | Largest non-Steam target; others depend on it (launcher, bottles, tools) |
| `humble/` (16) | 6,205 | 12,887 | Account, key sync/classify/dedup, Steam cross-ref, expiry alerts, claim flow | `humbleFlowRegistration` (~18), `humbleLoginFlowRegistration` (~5) | P | large, Med (stateful cache, fuzzy matching) | Humble HTTPS API, login webview (Rust), keyring | `secretStore.ts` (77) is type-only. Highest test-to-source ratio (2.1x): best parity oracle |
| `tools/` (9) | 2,881 | 4,736 | Winetricks UI/queue, DXVK/DXMT/vkd3d install, Mach-O export parse | `wineToolsFlowRegistration` (~17) | P | medium, Med (queue state) | winetricks, curl, wine, `wineboot`, `wineserver` | Native Winetricks UI "live gate re-run owed" per PROJECT |
| `downloadmanager/` (6) | 1,449 | 2,725 | Queue, finished list, stall watchdog, update element | `downloadQueueFlowRegistration` (~7) | P | medium, **High** (queue persisted; drives managers) | legendary, nile, gogdl via managers | Depends on all three managers; port after or with them |
| `shortcuts/` (8) | 1,881 | 2,664 | Desktop/start-menu shortcuts, add to Steam (non-Steam shortcut + steamhelper) | `shortcutsFlowRegistration` (~8) | P | medium, Med | PowerShell/`.lnk` (Win), `icon-encoder`, `shortcuts.vdf` (Rust steamfiles) | |
| `wine/` (7) | 1,337 | 675 | Download/install Wine, Proton, runtimes | `wineToolsFlowRegistration` | P | medium, Med | `tar`, `unzip`, release feeds | Low test ratio (0.5x): parity risk |
| `wiki_game_info/` (13) | 1,302 | 1,288 | Compatibility rating (CodeWeavers), ProtonDB, PCGamingWiki, HLTB, SteamDeck, GamesDB, umu ids | `enrichmentFlowRegistration` (~27) | P | medium, Low (HTTP + cache) | external web APIs (axios -> reqwest) | Good early candidate; applegamingwiki sub-dir was replaced by CodeWeavers, check for dead code |
| `signInProbe/` (6) | 1,120 | 2,347 | Epic/GOG/Amazon sign-in health | `mainProcess` getSignInProbeOutcomes | P | small, Low | legendary, nile, gogdl | |
| `process/` (6) | 993 | 877 | Process runner: tracked/long-lived children, abort, clock | internal (no IPC) | P | small, **High** (every spawn goes through it; exit contract) | all | Foundation: Rust already has `rustInvoke` runners; design once |
| `logger/` (9) | 918 | 348 | Log files, levels, upload/delete uploaded logs, show in folder | `loggerFlowRegistration` (~11) | P | small, Med | log upload endpoint | Foundation: ordering constraint ("no logger import" cycle comments) |
| `crossover_index/` (6) | 801 | 1,192 | Offline CrossOver compat index + medals | `enrichment` getCrossoverIndex | P | small, Low | `crossover_index` data from build step (`meta/buildCrossoverIndex.ts`) | Pure |
| `storeVersioning/` (7) | 786 | 1,208 | Versioned persisted stores: backup, migrate, discard cache, read-only on newer | internal | P | small, **High** (data-loss class) | fs | Foundation; must keep file formats readable (D-10 dual-read) |
| `host/` (9) | 654 | 653 | Thin seams over Rust shell: dialogs, notifications, openExternal, app state | internal | R shim | small, Low | Rust shell | Delete last-ish |
| `storeMigrations/` (6) | 633 | 965 | Store schema migrations (settings, gameInfo) | internal | P | small, Med | fs | Port with storeVersioning |
| `services/` (3) | 619 | 0 | DI bags/types (`types.ts` 407 type-only) | internal | D (disappears) | small, Low | | Pure DI scaffolding |
| `storeSearch/` (5) | 504 | 618 | Aggregated search, ITAD, CheapShark | `enrichment` search channels | P | small, Low | ITAD, CheapShark HTTP (`__ITAD_API_KEY__` build define) | |
| `gamedetails/` (2) | 477 | 713 | Game-info dispatch/overrides | `gameDetailsFlowRegistration` (~25) | P | small, Med | | Many renderer channels |
| `macArch/` (2) | 324 | 236 | Mac arch recovery prompt / reinstall | via manager | P | small, Med | | Overlaps `steam/library/macArch.ts`, `steamModule` |
| `steamgrid/` (3) | 322 | 375 | SteamGridDB artwork | enrichment | P | small, Low | SteamGridDB API, keyring | |
| `appshell/` (4) | 301 | 259 | Themes, releases/changelog, language, app-management probe | `appShellFlowRegistration` | P | small, Low | GitHub releases, i18n | |
| `stores/` (3) | 277 | 344 | Store registry/creation | internal | P (Rust store layer) | small, Med | | Foundation |
| `dialog/` (2) | 269 | 127 | Dialog display ack | `dialogFlowRegistration` | R shim | small, Low | Rust dialogs | |
| `constants/` (4) | 94 | 0 | Env flags, URLs, key names | internal | P (trivial) | tiny, Low | | |
| `store/` (1, `storeEmbedSeam`) | 181 | 0 | Store embed seam | `storeEmbedFlowRegistration` | R shim | tiny, Low | Rust store_embed | |
| `discounts/` (1) | 181 | 401 | GOG/Epic discounts | enrichment | P | tiny, Low | GOG catalog API | |
| `scanners/` (2) | 152 | 133 | Rust scan wrapper | | R shim | tiny, Low | gamelib-scan | |
| `migration/` (3, `migrations/legendary.ts`) | 171 | 0 | Legacy legendary data migration | internal | P or D (verify age/need) | tiny, Low | | No tests: verify whether still reachable by any user before porting |
| `game_overrides/` (2) | 157 | 0 | Per-game metadata overrides | gameDetails | P | tiny, Low | | |
| `runsForMe/` (2) | 123 | 81 | Runs-for-me map | `getRunsForMeMap`, `setRunsForMe` | P | tiny, Low | | |
| `anticheat/` (1) | 102 | 0 | Anti-cheat info (areweanticheatyet-style fetch + hash) | `getAnticheatInfo` | P | tiny, Low | HTTP | |
| `recent_games/` (1) | 85 | 0 | Recent games list | tray | P | tiny, Low | | |

### D. Backend top-level files (all of them)

| File | LOC | What it does | Class | Risk |
|---|---:|---|---|---|
| `utils.ts` | 1,923 | Catch-all: config write, axios client, game-status messages, exit, Discord presence, wine helpers | P (split first) | **High** (everything imports it) |
| `launcher.ts` | 1,739 | The launch pipeline: env, wrappers (gamescope, mangohud, gamemode), Wine/Proton, pre/post scripts, anticheat | P | **High**, parity-critical |
| `commandRunner.ts` | 748 | Spawn legendary/gogdl/nile/wine with env, PowerShell, abort | P | High (foundation) |
| `jest.setupContainment.ts` | 625 | Jest test fence | D | none |
| `knownFixesRegistry.ts` / `knownFixes.ts` / `knownFixOverlayInstall.ts` / `knownFixOverlays.ts` / `knownFixReport.ts` / `knownFixesFetcher.ts` / `knownFixOverlayArchive.ts` / `knownFixLaunch.ts` | 607 / 454 / 326 / 256 / 264 / 179 / 188 / 107 (2,381) | Known-fix registry fetched from GitHub, overlay archives (tar), report to user, applied at launch | P | Med (network + archive extraction) |
| `protocol.ts` | 464 | `gamelib://` URL handling, cold-start window, launch via protocol | P | Med |
| `config.ts` | 423 | Global/game config load/merge | P | High (foundation) |
| `online_monitor.ts` | 374 | Online/offline probing | P | Med |
| `game_config.ts` | 366 | Per-game config | P | High (foundation) |
| `save_sync.ts` | 275 | Cloud save sync via legendary/gogdl | P | Med |
| `store_backend.ts` | 274 | Conf-backed JSON store backend | P | High (foundation) |
| `cache.ts` | 228 | In-memory/disk cache | P | Low |
| `connectivityNow.ts` | 180 | Instant connectivity check | P | Low |
| `typed_store.ts` | 158 | Typed store wrapper | P | High (foundation) |
| `spawnAsync.ts` | 114 | Spawn helper | P | Low (superseded by process runner) |
| `quitHandler.ts` | 104 | Teardown at quit | P | Med |
| `gamescopeCommand.ts` | 89 | Builds gamescope argv | P | Low |
| `appRuntime.ts` | 78 | Runtime DI holder | D (DI disappears) | Low |
| `images_cache.ts` | 66 | Image download cache | P | Low |
| `miscRuntime.ts` | 58 | DI slice | D | Low |
| `launchSingleFlight.ts` | 56 | One launch at a time | P | Low |
| `settingsMirrorResync.ts` | 49 | Merge config.json into settings mirror store | P | Low (pure) |
| `backend_events.ts` | 42 | Event emitter | D/P (Rust channel) | Low |
| `i18nFallback.ts` | 29 | tOrFallback | R (gamelib-i18n) | Low |
| `schemas.ts` | 10 | Zod `Path` | D | Low |

### E. `src/backend/sidecar` (52 files, 17,994 src / 49,347 test lines) and `src/sidecar/` (130 + 75)

This is the transport and wiring layer. Most of it is deleted by the sidecar removal itself, but the 27 `*FlowRegistration` files are the **renderer IPC contract implementation**: each becomes Rust `#[tauri::command]`/dispatch arms with the same names and payload shapes (`channelSchemas.ts`, `rustInvoke.ts`; `ipc_contract.rs` is generated from TS by `pnpm gen:ipc-contract`; the generator itself is Node build tooling and may stay).

| File | LOC | Role | Class |
|---|---:|---|---|
| `bootstrap.ts` | 3,254 | Boot sequence: step ordering, DI wiring, e2e mode | P as Rust startup; much is DI plumbing that disappears |
| `appShellFlowRegistration` | 840 | ~22 channels (language, notify, quit, relaunch, themes, zoom, tray, versions) | P |
| `installFlowRegistration` | 762 | ~11 channels (install, uninstall, update, repair, install info) | P |
| `handlers.ts` | 648 | Core handlers | P |
| `keyringTokenStore.ts` | 576 | Token store over Rust keyring | R shim |
| `sidecarRpc.ts` | 571 | JSON-RPC transport | D |
| `storeEmbedFlowRegistration` | 510 | ~10 store-embed channels | R shim (Rust owns embed) |
| `humbleLoginFlowRegistration` | 491 | Login webview flow | P (Rust owns the webview) |
| `wineToolsFlowRegistration` | 481 | ~17 channels | P |
| `enrichmentFlowRegistration` | 480 | ~27 channels (wiki, anticheat, known fixes, runs-for-me, crossover index, search) | P |
| `processGuards` | 474 | Crash/rejection guards | D (Rust panic/abort policy replaces) |
| `steamFlowRegistration` | 468 | ~3 steam channels (refreshLibrary, launch) | P |
| `shortcutsFlowRegistration` | 460 | ~8 | P |
| `fileStore.ts` | 432 | File store implementation | **D, dead (see below)** |
| `steamAuthFlowRegistration` | 415 | ~25 steam auth/bottle/misc channels | P |
| `storeWriteHandlers` | 409 | Store write channels | P |
| `loggerFlowRegistration` | 386 | ~11 | P |
| `oauthLoginCapture` + `oauthLoginFlowRegistration` | 372 + 111 | OAuth capture | P |
| `devSecretVault` | 348 | Dev-only Keychain avoidance (see MEMORY: dev-vault flag) | P or keep in Rust dev build |
| `shellFilesFlowRegistration` | 340 | ~15 (open folder, disk space, reset, show in folder) | P |
| `humbleFlowRegistration` | 340 | ~18 | P |
| `runnerMiscFlowRegistration` | 334 | ~15 (tool versions, achievements, sync, runtimes) | P |
| `nativeImageShim` | 334 | Electron nativeImage shim | D (verify callers) |
| `settingsFlowRegistration` | 318 | ~12 | P |
| `gameDetailsFlowRegistration` | 302 | ~25 | P |
| `runnerAuthFlowRegistration` | 285 | ~12 (login/logout per runner) | P |
| `humbleSecretStore` / `steamgridSecretStore` | 285 / 246 | Keyring-backed secrets | R shim |
| `steamPollEventRegistration` | 274 | TS state-event handler for Rust polls | D after Phase 80 deferred items |
| `installedJsonWatcher` | 202 | Watches legendary/gog installed JSON (timer/watcher; exit contract) | P (notify crate) |
| `ipcValidation` + `rendererPathGuard` + `openPolicy` | 171 + 170 + 124 | Security guards on renderer-supplied input | P (semantics must be kept: `assertContainedPath`, openable-URL policy) |
| `knownFolders`, `appFolderStep`, `legacyZoomDataCleanup`, `readOnlyStoresNotice` | 150 / 68 / 58 / 19 | App-folder resolution, one-shot cleanups | P (fold into Rust boot); `legacyZoomDataCleanup` candidate delete |
| `engineFlowRegistration`, `clipboardFlowRegistration`, `eosOverlayFlowRegistration`, `downloadQueueFlowRegistration`, `dialogFlowRegistration`, `depotHostRegistration`, `devEpicCookieSweepRegistration` | 150 / 148 / 147 / 131 / 57 / 125 / 107 | Per-domain registration | P (clipboard/dialog already Rust arms) / `devEpicCookieSweep` dev-only |
| `ipcRegistry`, `sendChannelObservable`, `stdinEofRelease`, `isPackagedSidecar`, `outboundHttpRegistry`, `steamCmConfigGate`, `src/sidecar/index.ts`, `installRejectionGuard` | 128 / 73 / 99 / 92 / 94 / 91 / 55 / 75 | Transport/lifecycle internals | D (outboundHttpRegistry: port the allow-list intent) |

### F. Test-only and generated (non-runtime)

| Dir | Src | Tests | Class |
|---|---:|---:|---|
| `testUtils/` (46) | 3,742 | 443 | D: test scaffolding for Node jest; **none of it is in the runtime bundle** (only 1 file reaches it) |
| `__tests__/` (top) | 0 | 31,270 | D with the code it guards; many are source-text gates (`diPhaseGates`, `electronReachLedger`) that die with the sidecar |
| `__mocks__/` | 0 | 0 | D |
| `jest.config.js`, `jest.globalSetup.js` | | | D (renderer keeps its own jest) |

## Dead code and shadowed code (evidence)

| Item | LOC | Evidence | Action |
|---|---:|---|---|
| `src/backend/sidecar/fileStore.ts` | 432 | Not in the esbuild runtime bundle; `store_backend.ts:63` states "fileStore.ts is not on the production path"; only comment/test references | Delete now (zero-risk, can ship before v0.11 slices) |
| `src/backend/testUtils/*` (45 of 46 files unreachable) | 3,742 | esbuild reachability | Delete with the Node jest suites |
| `src/backend/jest.setupContainment.ts` | 625 | Not reachable | Delete with backend jest |
| `storeManagers/legendary/commands/*` (13 files) | ~270 | Not reachable at runtime (type-only imports) | Collapse into Rust argv builders |
| `humble/secretStore.ts`, `services/types.ts`, `process/types.ts`, `logger/types.ts`, `*/types.ts` | ~700 | Type-only, erased | Become Rust traits/structs |
| `steam/cm/SteamCmClient.ts`, `steam/cm/steamCmTypes.ts`, `depotRust/types.ts`, `localFiles/steamFilesTypes.ts`, `pollRust/steamPollTypes.ts` | ~790 | Type-only | Delete with shim |
| knip baseline (`meta/knip-baseline.txt`) | | No unused `src/backend` files, only ~20 unused exports (e.g. `uninstallNativeInGameLib`, `removeNativeInstallDirectly`, `parseEntitlementKeys`, `verifyOverlayRunnerClone`) | Skip porting those exports |
| `meta/knip-baseline.txt` unused files (meta only) | | `meta/coldBootTiming.ts`, `meta/measureCrossoverMatching.ts`, `meta/probeSeaInWorker.ts` | Delete when SEA goes |
| Steam poll TS remnants (`library/uninstallPolling.ts`, `acfState.ts`, `acfUpdateState.ts`, `resume.ts` poll-restart half, `sidecar/steamPollEventRegistration.ts`) | ~1,100 | Phase 80 shipped Rust loops with a `polls=ts` fallback; CONTEXT lists them as scope to delete | Verify live with graphify, then delete with the Phase 80 deferred slice |
| `*/e2eMock.ts` | 210 | Only reached via CI=e2e branch in `bootstrap.ts` ("unreachable, D-35-14-01" comment at line 1350) | Delete unless Playwright e2e stays |
| `appshell/themes.ts` custom theme/CSS | | Removed in quick 261031-bst per comment | Already trimmed |

## Differentiators and anti-features of the port (scope control)

| Item | Recommendation |
|---|---|
| Re-implement Epic/GOG/Amazon protocols natively | **Anti-feature.** Keep bundled legendary, gogdl, comet, nile as external binaries; Rust spawns and parses (per milestone). |
| Keep a long dual TS/Rust path | Anti-feature. Bounded fallback window only (milestone constraint). |
| Port tests 1:1 | Anti-feature. Port the high-value parity oracles (Humble 12.9k, engine 9.1k, tools 4.7k, shortcuts 2.7k, downloadmanager 2.7k tests) as Rust tests or recorded-fixture replays; delete source-text gate tests. |
| Rust replacement for Discord RPC | Differentiator-at-most; GOG presence is niche, decide keep vs drop. |
| Keep `devSecretVault` | Only if the Rust dev build still needs Keychain-prompt avoidance. |

## Feature (subsystem) dependencies

```
Foundations: process runner + store/config/typed_store/storeVersioning/storeMigrations + logger
   -> everything below (every manager, launcher, engine reads config and spawns children)
config.ts / game_config.ts / utils.ts (split)  -> launcher.ts -> engine/wine/tools -> managers
engine/ (bottle ledger) -> steam bottle*, steam bridge, tools, launcher
commandRunner -> legendary/gog/nile managers -> downloadmanager -> save_sync, signInProbe
Steam: libraryState/gameSession/update cache (Phase 80 deferred) -> bridgeInstallState -> bridge routing -> bridge/drm/overlay
Humble -> steam ownership (reads Rust CM) ; storeSearch/discounts independent
sidecar *FlowRegistration -> deleted per domain as its handlers move; sidecarRpc/bootstrap last
```

## MVP / sequencing recommendation

Port in this order (low risk first, foundations early because everything depends on them):
1. **Zero-risk deletions and shims:** `fileStore.ts`, `testUtils`/`jest.setupContainment` deletion plan, dead exports, type-only files.
2. **Foundations:** store/config/typed_store, storeVersioning + storeMigrations (data-loss class: dual-readable), logger, process runner, `commandRunner`. Everything else is blocked on these.
3. **Steam Phase 80 deferred:** libraryState, gameSession, update-detection cache, then `bridgeInstallState`, then depot plan (`depot/` 2.1k), ends `polls=ts`.
4. **Leaf services (parallelizable, low risk, Rust HTTP + JSON):** `wiki_game_info`, `crossover_index`, `storeSearch`, `discounts`, `anticheat`, `steamgrid`, `runsForMe`, `recent_games`, `appshell`, `signInProbe`, `images_cache`, `online_monitor`.
5. **Engine/wine/tools/launcher + known fixes** (large, High, parity replay).
6. **Epic/GOG/Amazon/sideload managers + downloadmanager + save_sync + shortcuts + Humble.**
7. **Steam bridge** (18k, last big stateful block; depends on engine + bottle).
8. **Sidecar deletion:** `bootstrap`, `sidecarRpc`, registrations, SEA build, packaging.

Defer / re-decide: Discord presence, e2e mocks, `migration/migrations/legendary.ts`, `devSecretVault`.

## Flags for the roadmapper

- **Tiny, low-risk (batch into one or two phases):** anticheat 102, recent_games 85, runsForMe 123, game_overrides 157, discounts 181, scanners 152, store 181, constants 94, appshell 301, steamgrid 322, macArch 324, crossover_index 801, storeSearch 504, i18nFallback/cache/images_cache/schemas/gamescopeCommand/launchSingleFlight/settingsMirrorResync/connectivityNow.
- **Large or stateful (own phase each, parity replay):** steam bridge 18.2k, steam top-level launch/bottle/install/uninstall (~13k), engine 7.0k, humble 6.2k, gog 5.1k, legendary 4.2k, launcher.ts 1.7k, utils.ts 1.9k (split before port), storeVersioning/stores/config (data-loss class), downloadmanager (persisted queue), process runner (child lifecycle), installedJsonWatcher (watcher).
- **Biggest hidden costs:** `utils.ts` and `bootstrap.ts` are grab-bags whose real behaviour is DI wiring; do a responsibility inventory before slicing. `ipcValidation`/`rendererPathGuard`/`openPolicy` are security semantics that must survive in Rust.
- **Low test-ratio areas (parity risk):** `wine/` 0.5x, `services`, `migration`, `game_overrides`, `anticheat`, `recent_games`, `store`, `constants` (zero tests). Add recorded fixtures before porting.
- **Total scale reality check:** 61k (storeManagers) + 18k (sidecar) + ~50k in remaining dirs/top-level. Of the 586 runtime-candidate files, ~75 are not in the runtime bundle; Rust already owns ~83k lines of the Steam stack plus a 17.5k-line shell.

## Sources

- Measured locally: `wc -l` over `src/backend`, esbuild metafile from `src/sidecar/index.ts` (2026-11-17), `src-tauri/src/ipc_contract.rs`, `src/common/types/ipc/*.ts`, `src/backend/sidecar/*FlowRegistration.ts`, `meta/knip-baseline.txt`.
- `.planning/PROJECT.md` ("Next Milestone: v0.11"), `.planning/phases/80-*/80-CONTEXT.md` (scope and deferred lists).
- External-binary lists are keyword-frequency greps of non-test source (MEDIUM confidence; verify per slice).
