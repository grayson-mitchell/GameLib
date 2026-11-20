# Phase 82 utils.ts and bootstrap.ts responsibility inventory

## Measurement head

- Measured head: `eccd683088077d8d57a50e6eb1accade5a58cb5b` (`docs(82-13): record plan 13 progress in STATE and ROADMAP`), measured 2026-11-20 on the main working tree. `src/backend/utils.ts` is 1923 lines, `src/backend/sidecar/bootstrap.ts` is 3320 lines.
- Keyed by symbol or step NAME (stable). The "line" column is the definition line at this sha; plan 82-11 refreshes line numbers at the proof head, so a row is found by name, never by line.
- This describes the code as it is at this sha. Plans 82-07, 82-10, 82-15 and 82-16 (later waves) change both files; every `CI=e2e` and stub-slot note below marks work that is PLANNED, not done.
- Rows: 51 in the utils table (33 names in the `export { ... }` block, 16 inline `export` declarations, plus semverGt and expandPathVariables, which are only reachable through testingExportsUtils), 64 in the boot-step table. Every name is backticked once, in its row's first column; no name is backticked anywhere else in this file, so a gate can count first-column cells.

### Importer counts

"prod/test" counts files that import the symbol from the `src/backend/utils.ts` module, resolved (relative paths and `backend/utils`), excluding `utils.ts` itself and excluding same-named symbols from other modules. A test file is anything under `__tests__`, `testUtils`, `__mocks__` or named `*.test.*`.

- Dynamic `await import('backend/utils')` call sites are added to the prod count: axiosClient +3 (`knownFixOverlayInstall.ts`, `steam/bridge/drm/steamclientLayerInstall.ts`, `steam/bridge/drm/valveClient.ts`) and sendGameStatusUpdate +1 (`steam/bridge/drm/drmLaunchSetup.ts`). They are already folded into the numbers below.
- 96 test files reach the module through `jest.mock`, `requireActual` or a namespace import; those cannot be attributed to a symbol and are not in any "test" count.
- A word-match grep over-counts badly here (IPC channel names such as clearCache, resetHeroic and showItemInFolder appear in 5 to 8 frontend and preload files each that never import the symbol), which is why the counts come from resolved imports.

### Destination slices

83 seam/core, 84 logger, 85 store host, 86 leaves, 87 engine, 88 launch, 89 libraryState, 90 Steam services, 91 Epic runner, 92 GOG/Amazon/sideload runners, 93 download manager, 94 Humble/shortcuts, 95-97 bridge, 98 cutover, 99 deletion, or "delete" (with its owner, or because nothing calls it). A destination is the slice whose Rust code takes the behaviour over; the TS definition is deleted in that slice unless the row says it is kept until the last TS caller.

## utils.ts exports

Responsibility groups: binary paths, wine+runtime, fs, status-push, network, Discord presence, reset+cache, parsing. "DI-wiring" means the function mostly threads injected deps to another owner; "behaviour" means it holds logic a port must reproduce.

| symbol | line (at sha) | responsibility group | importers (prod/test) | destination slice | DI-wiring or behaviour | notes |
| --- | --- | --- | --- | --- | --- | --- |
| `errorHandler` | 252 | status-push | 2/0 | 88 | behaviour | maps runner stderr to a dialog and a library-manager action; its deps are built from getters in the command-runner boot step |
| `getCurrentChangelog` | 879 | network | 1/1 | 98 | behaviour | reads `changelog.json` from publicDir; the `CI=e2e` early return at L882 is planned for removal by 82-16 |
| `isEpicServiceOffline` | 171 | network | 6/0 | 88 | behaviour | notification gated on the online monitor; launcher (88) needs it natively, so it rides on the 86 connectivity leaf rather than waiting for 91 |
| `showItemInFolder` | 394 | fs | 2/0 | 84 | DI-wiring | one-line delegate to the host openExternal; first needed by the native logger's show-in-folder (84) |
| `removeSpecialcharacters` | 316 | parsing | 2/0 | 86 | behaviour | strips store-title punctuation; consumers are wiki_game_info (86) and nile/library (92) |
| `clearCache` | 343 | reset+cache | 4/1 | 85 | behaviour | clears the wikiGameInfo, gog, legendary, nile and systemInfo cache stores; becomes a store-host op over every `kind: cache` store |
| `clearAchievementCache` | 372 | reset+cache | 1/0 | 85 | behaviour | per-key delete on the GOG achievements cache store |
| `resetHeroic` | 379 | reset+cache | 1/0 | 98 | behaviour | deletes config and GamesConfig, then relaunches; guarded by gamelib-safety in plan 82-07; needs the native quit and relaunch path (98) |
| `getLegendaryBin` | 509 | binary paths | 1/0 | 91 | DI-wiring | resolves the bundled legendary binary from settings and publicDir |
| `getGOGdlBin` | 523 | binary paths | 1/0 | 92 | DI-wiring | same shape for gogdl |
| `getCometBin` | 535 | binary paths | 2/2 | 92 | DI-wiring | same shape for comet; also imported by the helper-binaries module |
| `getNileBin` | 547 | binary paths | 1/0 | 92 | DI-wiring | same shape for nile |
| `archSpecificBinary` | 427 | binary paths | 0/0 | 91 | behaviour | arch-native-first, x64-fallback resolution; no importer outside utils.ts (the asset-root-check boot step deliberately re-implements it), so it travels with the first runner bin helper |
| `MACOS_ONEDIR_RUNNERS` | 425 | binary paths | 0/0 | 91 | behaviour | constant read only by archSpecificBinary inside utils.ts; exported but never imported |
| `formatEpicStoreUrl` | 694 | parsing | 1/0 | 91 | behaviour | builds an Epic store URL from a title |
| `constructAndUpdateRPC` | 643 | Discord presence | 1/0 | delete | behaviour | delete with its owner: Discord rich presence was dropped by operator decision 2026-11-17 (REQUIREMENTS-v0.11 Out of Scope); sole caller is launcher |
| `quoteIfNecessary` | 699 | parsing | 0/0 | delete | behaviour | exported but not imported anywhere (the command runner carries its own private copy); dies with the duplicate in 88 |
| `removeQuoteIfNecessary` | 712 | parsing | 1/0 | 88 | behaviour | used by launcher argv handling |
| `detectVCRedist` | 752 | wine+runtime | 1/1 | 87 | behaviour | Windows MSVC redistributable probe plus install prompt, bounded by the 15 s timeout below; wired from the app-shell flow registration |
| `VC_REDIST_PROBE_TIMEOUT_MS` | 734 | wine+runtime | 0/1 | 87 | behaviour | the probe's timeout constant; imported by one test only |
| `shutdownWine` | 900 | wine+runtime | 4/1 | 87 | behaviour | runs wineserver kill through the command runner; callers are the gog, nile, legendary and sideload games modules (91, 92) |
| `getShellPath` | 967 | fs | 2/2 | 92 | behaviour | expands environment variables in a path; callers are save_sync (92) and the shell-files flow registration |
| `getLatestReleases` | 871 | network | 1/1 | 98 | behaviour | already returns an empty list (update notice suppressed until a GameLib release pipeline exists); candidate to delete rather than port |
| `getWineFromProton` | 125 | wine+runtime | 1/0 | 87 | DI-wiring | resolves a Wine install from a Proton/umu setup; caller is the tools module |
| `getFileSize` | 123 | parsing | 13/6 | 86 | behaviour | base-2 size formatter; pure helper with 13 prod importers across every runner, ported once as a leaf helper and consumed by each slice |
| `removeFolder` | 1438 | fs | 1/0 | 93 | behaviour | recursive remove used on download cancel; any native port routes through the shared safety primitives |
| `getPathDiskSize` | 1470 | fs | 1/0 | 92 | behaviour | recursive lstat size walk; sole caller is the GOG games module |
| `sendGameStatusUpdate` | 1544 | status-push | 32/7 | 83 | DI-wiring | frontend push plus event-bus emit; Rust side is the 83 `FrontendEmitter`, but the TS helper stays until the last TS caller (97 DRM launch) and is deleted in 98 |
| `sendProgressUpdate` | 1549 | status-push | 5/3 | 83 | DI-wiring | same as sendGameStatusUpdate, per-app progress channel; TS helper deleted in 98 |
| `calculateEta` | 1740 | parsing | 2/0 | 87 | behaviour | download ETA arithmetic; callers are the wine downloader and the fallback engine |
| `extractFiles` | 1769 | fs | 4/1 | 87 | behaviour | archive extraction through the process runner; callers are tools, wine runtimes, wine downloader and fallback engine |
| `axiosClient` | 1828 | network | 20/12 | 86 | DI-wiring | shared keep-alive HTTP client with the GameLib user agent; first Rust consumers are the 86 leaves (wiki_game_info, crossover_index), deleted when its last importer ports |
| `parseSize` | 1711 | parsing | 0/0 | delete | behaviour | exported but not imported anywhere; no port needed |
| `semverGt` | 76 | parsing | 0/0 | delete | behaviour | reachable only through testingExportsUtils (one test); no production caller |
| `expandPathVariables` | 940 | fs | 0/0 | 92 | behaviour | reachable externally only through testingExportsUtils; production use is inside getShellPath, so it ports with it |
| `askForceUninstall` | 216 | reset+cache | 1/1 | 88 | behaviour | "game folder deleted, remove from installed list?" dialog then forceUninstall on Yes; called on launch paths |
| `ErrorHandlerDeps` | 247 | status-push | 1/0 | 88 | DI-wiring | the Pick type over ManagerDeps that errorHandler takes; deleted with errorHandler |
| `ClearCacheDeps` | 322 | reset+cache | 3/4 | 85 | DI-wiring | deps type for clearCache; deleted with it |
| `startLegendaryCleanup` | 334 | reset+cache | 2/1 | 91 | DI-wiring | fire-and-forget legendary cleanup command |
| `createNecessaryFolders` | 562 | fs | 0/0 | delete | behaviour | exported with no caller anywhere at this sha (not imported, not called inside utils.ts); delete rather than port |
| `SteamLibrariesDeps` | 599 | fs | 10/0 | 89 | DI-wiring | deps type (config plus rustInvoke) shared by the Steam library readers |
| `getSteamLibraries` | 610 | fs | 9/15 | 89 | behaviour | Steam library folder discovery over rustInvoke; every consumer is a Steam library-state or install-location module |
| `downloadDefaultWine` | 994 | wine+runtime | 0/0 | 87 | behaviour | called only from checkWineBeforeLaunch inside utils.ts; exported but not imported elsewhere |
| `checkWineBeforeLaunch` | 1069 | wine+runtime | 4/5 | 87 | behaviour | picks or downloads a Wine before launch; callers are launcher, Steam bottle and the gog and nile setup modules |
| `moveOnWindows` | 1188 | fs | 3/1 | 91 | behaviour | move-install on Windows; callers are the legendary, gog and nile games modules (92 reuses the 91 port) |
| `moveOnUnix` | 1249 | fs | 3/2 | 91 | behaviour | move-install on macOS and Linux; callers include gog library as well |
| `checkRosettaInstall` | 1489 | wine+runtime | 1/1 | 87 | DI-wiring | Rosetta presence probe plus dialog; called from the rosetta boot step, so the call moves to Rust setup in 98 |
| `isMacSonomaOrHigher` | 1526 | wine+runtime | 1/0 | 88 | behaviour | macOS version gate used by launcher and the systeminfo module |
| `downloadFile` | 1581 | network | 6/9 | 87 | behaviour | streaming download with abort and progress; callers span tools, wine, shortcuts, known-fixes fetcher, engine and Steam setup downloads, first Rust consumer is 87 |
| `writeConfig` | 1834 | fs | 2/0 | 85 | behaviour | writes per-game or global settings through the config slice; ports with the 85 store host and config |
| `testingExportsUtils` | 1920 | parsing | 0/1 | delete | DI-wiring | test-only seam that re-exports semverGt and expandPathVariables; deleted with the TS definitions |

## bootstrap.ts boot steps

64 steps in boot order, from `buildBootSteps` (kept last in the file: `bootstrapWirings.test.ts` slices from `export function init(` to EOF to gate the call order). Destination values: "Rust setup" (the step's work becomes shell setup or an owned Rust module), "deleted DI plumbing" (the step only builds sidecar-side wiring and vanishes when its owner ports), "delete" (no Rust equivalent needed).

"CI=e2e" branches in this file today: the e2e tmp app folder and asset dir inside the path resolver region (L1363-1373), comment mentions at L302 and L1507, the three e2e stub listener registrations in the register-handlers step (L2791-2808), and the stub-slot construction in the gog, legendary and nile runtime steps. Plan 82-10 removes the gogdl stub end to end, plan 82-15 the legendary and nile stubs, and plan 82-16 every remaining `CI=e2e` branch.

| step | line (at sha) | what it builds | state it owns | depends on (order constraint) | destination | notes |
| --- | --- | --- | --- | --- | --- | --- |
| `app-folder` | 1506 | the heroic to GameLib config-folder move and the CI=e2e app folder | none (synchronous disk move) | first; ahead of every step that reads under the app folder | Rust setup (85, before the store host opens) | e2e app-folder branch removed by 82-16 |
| `outbound-http-tracking` | 1520 | one outbound HTTP tracker (diagnostics_channel subscription) | outbound HTTP tracker | none; before migrations and boot-time requests so those are tracked | delete (98) | sidecar-only diagnostic destroyed at stdin EOF |
| `logger` | 1531 | initLogger and the unhandled-rejection and uncaught-exception sinks | log writer, two guard sinks | before every step that logs | Rust setup (84) | the guard sinks die with processGuards in 98 |
| `sidecar-rpc` | 1558 | the sidecar RPC transport and IPC validator | rustPending map, output stream, pre-start frame buffer | logger (validator sink) | delete (98) | transport exists only because of the sidecar |
| `host-services` | 1574 | host services (IPC registry, dialogs, appState, openExternal) and the steamcm configure gate | IPC registry, steamcm config gate | sidecar-rpc | deleted DI plumbing (98) | every ManagerDeps takes its host from here |
| `sign-in-probe-state` | 1606 | sign-in epoch fence, outcome map, probe pass | in-memory probe outcomes | host-services; before stores | Rust setup (94) | construction only, no I/O |
| `steam-session-state` | 1633 | Steam sign-in state, auth trigger, libraryState, gameSession | sign-in state, library map, per-session game maps | host-services; before stores | Rust setup (89 libraryState and gameSession, 90 sign-in state and auth trigger) | one step, two owning slices; the split is by state item, not by field |
| `steam-token-store` | 1657 | the Steam token store slot (fail-closed default) | token store slot | none; before stores | Rust setup (90) | configured later by secret-stores |
| `steam-anonymous-client` | 1671 | the anonymous CM client owner over rustInvoke | handle to the Rust anon actor | host-services | Rust setup (90) | becomes an in-process call |
| `bridge-helper-registry` | 1685 | per-appId bridge helper map and exit teardown | helper map | host-services | Rust setup (96) | spawns nothing at boot |
| `stores` | 1707 | the StoreRoot, store registry and every store family | every persisted store's writer | host-services | Rust setup (85) | the one place a store directory is decided |
| `migrations` | 1743 | the data-migration system | migrations store | logger, stores | Rust setup (85) | migrations are floated, not awaited; legendary migration ported only if reachable |
| `config` | 1791 | global config, settings mirror resync, per-game config registry, paths and appInfo | global settings, per-game config cache | logger, migrations, stores; before command-runner and i18n | Rust setup (85) | order pinned by configBootOrder test |
| `secret-vault` | 1832 | the dev-only plaintext vault decision | vault selector | logger; before every secret owner | Rust setup (98) | dev vault must not exist in release builds (98 SC3) |
| `steamgrid-secrets` | 1842 | SteamGridDB API-key owner | secret store handle | secret-vault; before register-handlers | Rust setup (86) | migration stays in secret-stores |
| `itad-secrets` | 1861 | ITAD user-key owner | secret store handle | secret-vault; before register-handlers | Rust setup (86) | new secret, no migration |
| `steam-bottle` | 1874 | the Steam bottle helper | bottle config access | stores, config | Rust setup (96) | replaces the static bottle-stores holder |
| `abort-registry` | 1903 | abort-controller registry and the Wine window raiser | abort controllers, raiser timers | steam-bottle; before command-runner and engine-runtime | Rust setup (83 Shutdown token replaces the registry; window raiser 88) | stdin-EOF aborts the registry via rpc-server |
| `app-runtime` | 1916 | event bus, frontend-ready flag, launch single-flight, image fetches, CrossOver index fetch, overlay install single-flight | the event bus and the flights | abort-registry; before store-managers | Rust setup (98 event bus; 88 launch single-flight; 86 image and CrossOver fetches) | settingChanged is emitted onto this bus by the config step, so Rust-owned config must feed it until 98 |
| `misc-runtime` | 1928 | metadata-override push, Mac arch prompt chain, ITAD rate-limit gate | prompt chain, rate-limit gate | app-runtime; before store-managers and register-handlers | Rust setup (86) | |
| `command-runner` | 1952 | runner, clock, Steam processes, command runner, spawnAsync, quit handler | tracked children, commands | abort-registry, config | Rust setup (87 spawnAsync; 88 command runner; 98 quit handler) | holds the errorHandler dep getters |
| `steam-user` | 2071 | the authenticated Steam session owner | session handle (Rust CM session is lazy) | steam-session-state, steam-token-store, steam-anonymous-client; before store-managers and rpc-server | Rust setup (90) | replaced the static SteamUser class |
| `humble-services` | 2107 | Humble user, library, sync fence, login-window seam slot | Humble session state | secret-vault; before store-managers and register-handlers | Rust setup (94) | seam slot filled by the Humble login registration |
| `online-monitor-owner` | 2145 | the online monitor (construction only) | connectivity status | none; before store-managers | Rust setup (86) | listeners and first probe belong to the online-monitor step |
| `engine-state` | 2169 | engine decision and notice owner | engine notices | stores; before store-managers | Rust setup (87) | |
| `engine-runtime` | 2189 | ledger, selection registry, overlay contexts, launch deadlines, single-flight maps, CrossOver bin-dir memo | in-memory engine maps | engine-state | Rust setup (87) | deadlines run on the unref'd boot clock |
| `steam-launch-runtime` | 2206 | bottle process monitors, raise loop, DRM and overlay runner registry, DRM notice latch, platform-capture chain | in-memory launch collections | engine-runtime | Rust setup (96 monitors and raise loop; 97 DRM and overlay registry) | |
| `steam-bridge-runtime` | 2220 | DRM and overlay clone single-flights, loader-entitlement counter, shared-redist install map | in-memory maps and counters | steam-launch-runtime | Rust setup (95 shared-redist; 97 DRM and overlay clones) | |
| `steam-install-runtime` | 2236 | depot appinfo order tap, CDN auth cache, shared-redist lock table, Rust depot job registry, install and uninstall poll registries, restart-hold bookkeeping | in-memory install registries | steam-bridge-runtime | Rust setup (90; shared-redist lock 95) | |
| `gog-runtime` | 2254 | GOG library and installed maps, presence keep-alive slot, resume baselines, credential cache, e2e gogdl stub slot | in-memory GOG state | steam-install-runtime | Rust setup (92) | stub slot removed by 82-10; presence slot dies with Discord |
| `legendary-runtime` | 2267 | legendary library, installed and account-game collections, e2e legendary stub slot | in-memory legendary state | gog-runtime | Rust setup (91) | stub slot removed by 82-15 |
| `nile-runtime` | 2277 | login-data single-flight and the e2e nile stub slot | login-data flight | legendary-runtime | Rust setup (92) | stub slot removed by 82-15 |
| `info-caches` | 2285 | system-information cache and HowLongToBeat credentials | two lazy caches | nile-runtime | Rust setup (87 system info; 86 HowLongToBeat) | each fetches on first use |
| `tools-state` | 2296 | the tools single-flight slot, catalog and script-metadata caches, winetricks environment reports | in-memory tools state | directly before winetricks-queue | Rust setup (87) | |
| `winetricks-queue` | 2305 | the winetricks apply queue | queue (subscribes to the report-change signal) | tools-state; before store-managers and register-handlers | Rust setup (87) | |
| `store-managers` | 2332 | the store managers and the launcher | manager table, launcher | every runtime step above | deleted DI plumbing (managers leave per slice: 90, 91, 92, 94; launcher 88; step gone in 98) | the download queue is reached through an accessor because it is built after this step |
| `download-queue` | 2461 | the download queue and one connectivity listener | in-memory queue | store-managers | Rust setup (93) | no timer, watcher, socket or child |
| `shell-exe-receipt` | 2526 | boot log of the GAMELIB_SHELL_EXE value the sidecar received | none (log line) | logger | delete (98) | diagnostic for a sidecar that no longer exists |
| `asset-root-check` | 2566 | asset-root self-check log for the GAMELIB_APP_ROOT handoff | none (log lines) | shell-exe-receipt, logger | delete (99) | its comment records that it re-implements arch-specific binary resolution on purpose |
| `i18n` | 2662 | i18next initialisation and locale resolution | i18n instance | config | Rust setup (98) | warns loudly when the locale directory is missing |
| `app-shell-state` | 2764 | app shell state (tray, debounce), the installed.json watcher object, the store-embed seam | shell state | config | Rust setup (98; installed.json watcher 91) | no watcher opens until installed-json-watcher starts it |
| `register-handlers` | 2782 | all channel handlers; the three e2e stub listener registrations | handler table | every service step | deleted DI plumbing (each slice deletes its own registrations; step gone in 98) | the three StubListeners calls are removed by 82-10 (gogdl) and 82-15 (legendary, nile) |
| `rpc-server` | 2810 | starts the RPC loop and wires the stdin-EOF release | RPC loop, EOF release | register-handlers | Rust setup (83 Shutdown contract); delete (98) | EOF pauses the queue and aborts the registry |
| `protocol-url-handler` | 2825 | registers the protocol-URL handler | handler registration | rpc-server; before ready-sentinel | Rust setup (98) | |
| `steamcm-configure` | 2836 | the first steamcm configure attempt through the gate | configure promise | rpc-server; before mac-steam-online-restore | Rust setup (90) | one bounded rustInvoke, retried by the next steamcm op on failure |
| `mac-steam-online-restore` | 2852 | pays an owed Mac Steam go-online | none | steamcm-configure | Rust setup (90) | third layer of three (quit hook, stdout EOF hook, boot call) |
| `steam-adoption-resume` | 2865 | re-registers stored pending-adoption records; migrates old restart holds | none (reads the pending-adoption store) | steamcm-configure, stores | Rust setup (90) | Rust's adoption watch list is in memory |
| `secret-stores` | 2899 | keyring or dev-vault configuration and the one-time secret migrations | token store configuration | rpc-server (needs a live transport) | Rust setup (per owner: 86 SteamGridDB and ITAD keys, 90 Steam token, 94 Humble) | must run before any handler body that reads a secret |
| `orphaned-token-cleanup` | 2983 | clears the orphaned pre-Tauri refresh-token key | none | secret-stores | Rust setup (90) | delete if no upgrade path still reaches it |
| `online-monitor` | 3006 | starts the online monitor (listeners, first probe) | monitor listeners | rpc-server; before ready-sentinel | Rust setup (86) | pushes connectivity-changed immediately, needs the live transport |
| `anticheat-listener` | 3018 | the releasesInfoReady anticheat listener | event listener | online-monitor-owner | Rust setup (86) | exists because anticheat/ipc_handler cannot be side-effect-imported under the sidecar |
| `releases-fetch` | 3074 | fetchLastestReleases | none | online-monitor, anticheat-listener | Rust setup (86) | has its own CI=e2e early return outside this file (82-16 scope) |
| `installed-json-watcher` | 3095 | the installed.json watcher start | file watcher | app-shell-state; just before ready-sentinel | Rust setup (91) | keeps the in-memory installed map fresh |
| `playtime-lock-clear` | 3132 | clears a stranded GOG playtime-sync lock | none | logger; before playtime-queue-drain | Rust setup (92) | never fails boot |
| `legacy-zoom-cleanup` | 3148 | removes legacy Zoom Platform data | none | logger | delete (98) | named in the 98 success criteria as unreachable leftover |
| `engine-temp-sweep` | 3157 | removes stale steam-engines temp directories | none (synchronous) | logger | Rust setup (87) | nothing in flight once it returns |
| `store-user-reconcile` | 3170 | Epic and GOG user reconciliation | none (queues a run-once-online task) | logger, online-monitor | Rust setup (91 Epic, 92 GOG) | |
| `rosetta` | 3198 | the Rosetta availability probe | none | i18n, rpc-server | Rust setup (87 function; boot call 98) | dialog reaches the shell through rustInvoke |
| `playtime-queue-drain` | 3220 | drains queued GOG playtime | none | playtime-lock-clear (load-bearing: a stranded lock would make the drain a no-op) | Rust setup (92) | |
| `gog-presence` | 3243 | the boot GOG presence call | none | logger, online-monitor | delete (92) | dies with Discord presence |
| `sign-in-probe-outcomes` | 3270 | registers the probe-outcomes pull handler | none | before ready-sentinel | Rust setup (94) | reads an in-memory map, starts no probe |
| `ready-sentinel` | 3279 | writes the READY line to stdout | none | everything that must exist before the shell may send frames | delete (98) | the shell's readiness signal for a sidecar |
| `sign-in-probe` | 3285 | starts the bounded boot sign-in probe pass | probe timers (unref'd) | ready-sentinel | Rust setup (94) | registration only; READY never waits on it |
| `startup-protocol-url` | 3308 | delivers the startup protocol URL | none | ready-sentinel; last statement of init | Rust setup (98) | |
