/**
 * Sidecar bootstrap module (Phase 27 Plan 02 — Task 2).
 *
 * The real process entry is `src/sidecar/index.ts` (bundled by `pnpm
 * build:sidecar` to `build/main/sidecar.js`, spawned by the Rust shell —
 * `src-tauri/src/main.rs`, 27-01), which imports `init` from this module and
 * calls it unconditionally.
 *
 * This module's ordering is load-bearing (spike 009's sharp edge): nothing in `src/` imports
 * `electron` (`meta/__tests__/electronAbsence.test.ts` gates that) and the `backend/platform`
 * facade is gone (66.3): module-scope path reads go through `./appPaths`, and the IPC registry
 * is built fresh by the 'host-services' boot step.
 */

// ---- Step 1: load the platform layer FIRST, before `./handlers` (below) pulls
//              in the backend module graph. --------------------------------
import {
  createOutboundHttpTracker,
  type OutboundHttpTracker
} from './outboundHttpRegistry'

import type { Readable, Writable } from 'node:stream'
import { existsSync, mkdirSync, renameSync } from 'graceful-fs'
import { dirSync, tmpNameSync } from 'tmp'
import { join } from 'node:path'
import Backend from 'i18next-fs-backend'
import i18next from 'i18next'
import { createInstalledJsonWatcher } from './installedJsonWatcher'
import { createAppShellState } from './appShellFlowRegistration'
import { createStoreEmbedSeam } from '../store/storeEmbedSeam'
import { removeLegacyZoomData } from './legacyZoomDataCleanup'
import { releaseOnStdinEof } from './stdinEofRelease'
import { READY_SENTINEL } from 'common/types/sidecarTransport'
import { i18nextLanguageOptions, localeFileSegments } from 'common/languages'

// ---- Step 2: import the backend registration path — AFTER the platform import -------
// Importing `./handlers` registers nothing (D-08); the 'register-handlers' boot step calls it.

import { registerHandlers } from './handlers'
import { createHostServices, type HostServices } from '../host'
import { createIpcRegistry, type IpcRegistry } from './ipcRegistry'
import { createStores } from '../stores/createStores'
import { createStoreRegistry } from '../stores/storeRegistry'
import { createStoreRoot, type StoreRoot } from '../stores/storeRoot'
import { createStoreManagers } from '../storeManagers'
import { registerGogdlStubListeners } from '../storeManagers/gog/e2eMock'
import { registerLegendaryStubListeners } from '../storeManagers/legendary/e2eMock'
import { registerNileStubListeners } from '../storeManagers/nile/e2eMock'
import {
  createSteamProcesses,
  type SteamProcesses
} from '../storeManagers/steam/steamProcesses'
import type {
  BootServices,
  ShellState,
  StoreManagers,
  Stores
} from '../services/types'
// Block D (finding A1, quick-260907-odi). Adds NO new module to the sidecar bundle:
// `sidecar/createStores` already imports `playtimeSyncQueue` from this exact
// module, so this is a second binding onto an already-resident singleton, not a new edge.
// Block G (todo 2026-09-06, quick-260908-wk0). Adds NO new module to the sidecar bundle:
// `bootstrap.ts` already imports `./installedJsonWatcher` at its own line 39, and
// `installedJsonWatcher.ts` already reaches the manager table through its injected deps --
// so this is a second binding onto an already-resident singleton, strictly stronger than the
// `./handlers`-transitive route (`runnerMiscFlowRegistration.ts:92`,
// `installFlowRegistration.ts:125`, `appShellFlowRegistration.ts:164` all also import it), not a
// new edge.
// Phase 34.5 gap cycle 6 plan 44 (F-34.5-G6-09, REQ-34.5-01/05/12): `protocol.ts` reads
// `dialog`/`app` from `backend/platform`, so this import is safe ONLY because `../platform`
// (Step 1, above) has already been evaluated by the time this
// statement runs — ES modules evaluate every static import before a module's own executable
// statements run, so the exact ordering that makes `import './handlers'` safe makes this safe
// too. `bootstrap.ts` is deliberately absent from `electronReachLedger.test.ts`'s
// `ENTRY_POINTS` list (confirmed at planning time): that ledger tracks registration modules,
// and `bootstrap.ts` itself has never been a member.
import { handleProtocol } from '../protocol'
import type { ProtocolDeps } from '../protocol'
import type { ProcessGuards } from './processGuards'
import { createSidecarRpc, type SidecarRpc } from './sidecarRpc'
import {
  createTokenStoreSlot,
  clearOrphanedElectronToken
} from '../storeManagers/steam/tokenStore'
import { createSteamBottle } from '../storeManagers/steam/bottle'
import { SidecarKeyringTokenStore } from './keyringTokenStore'
import {
  createSidecarHumbleSecretStore,
  startSidecarHumbleSecretStore,
  type SidecarHumbleSecretStore
} from './humbleSecretStore'
import {
  createSidecarSteamGridDbSecretStore,
  startSidecarSteamGridDbSecretStore,
  type SidecarSteamGridDbSecretStore
} from './steamgridSecretStore'
import { createSteamGridDbSecrets } from '../steamgrid/secretStore'
import { createHumbleServices } from '../humble'
import { registerDxmtListeners } from '../tools/dxmt'
// 34.5 gap cycle 4 plan 36 (developer-scoped Routing addition): the dev-only plaintext vault
// that this branch installs INSTEAD OF the two keyring stores below, when opted into. Import
// only — no module-scope call. See installDevSecretVault()'s own header for the full guardrail
// set; this file only decides WHICH arm runs and records which one did.
import { createDevSecretVault, type DevSecretVault } from './devSecretVault'
// Deviation (Rule 1 — bug, found live during the 33-05 install-hang gate,
// fix/steam-native-install-stability): `initOnlineMonitor()` was previously wired ONLY at
// `main.ts`'s `app.whenReady()`, which the headless sidecar never runs. With no init, `isOnline()`
// (backend/online_monitor.ts) read `undefined === 'online'` forever, so
// `downloadmanager/utils.ts`'s pre-install guard rejected EVERY Steam install instantly with
// "App offline, skipping install" even when fully online. Paired with the sidecar
// `net.isOnline()` stub (platform/index.ts) so the very first status check falls through to the
// real `pingSites()` ping instead of pinning `'offline'` permanently.
import axios from 'axios'
import { randomUUID } from 'node:crypto'
import { createOnlineMonitor } from '../online_monitor'
import { checkConnectivityNow } from '../connectivityNow'
import { createEngineState } from '../engine/engineState'
import { createEngineRuntime } from '../engine/engineRuntime'
import { createSteamLaunchRuntime } from '../storeManagers/steam/steamLaunchRuntime'
import { createBridgeRuntime } from '../storeManagers/steam/bridge/bridgeRuntime'
import { createGogRuntime } from '../storeManagers/gog/gogRuntime'
import { createLegendaryRuntime } from '../storeManagers/legendary/legendaryRuntime'
import { createNileRuntime } from '../storeManagers/nile/nileRuntime'
import { createSystemInfoCache } from '../utils/systeminfo'
import { createHltbCredentials } from '../wiki_game_info/howlongtobeat/utils'
import { createSteamInstallRuntime } from '../storeManagers/steam/steamInstallRuntime'
import { createWinetricksQueue } from '../tools/winetricksQueue'
import { createToolsState, type ToolsState } from '../tools/toolsState'
import type { OnlineMonitor } from '../online_monitor'
// Block E (todo 2026-09-06, quick-260908-fre). `grep -rn
// "storeManagers/legendary/user\|storeManagers/gog/user" src/backend/sidecar/` confirms
// `./handlers` (Step 2, above) already pulls both classes in transitively:
// `handlers.ts` imports `registerRunnerAuthFlows` from `./runnerAuthFlowRegistration`, which
// itself imports `LegendaryUser` from `../storeManagers/legendary/user` and `GOGUser` from
// `../storeManagers/gog/user`. So these three imports add NO new module to the sidecar
// bundle — each is a second binding onto an already-resident module, not a new edge.
import { LegendaryUser } from '../storeManagers/legendary/user'
import { GOGUser, type GOGUserDeps } from '../storeManagers/gog/user'
import type { GOGPresenceDeps } from '../storeManagers/gog/presence'
// Block H (todo 2026-09-06, quick-260909-k5x). `grep -rn "gog/presence" src/backend
// --include='*.ts'` (re-run at execution time) confirms `presence.ts` is ALREADY resident in
// the sidecar bundle: `utils.ts:43` does `import gogPresence from './storeManagers/gog/
// presence'`, and `bootstrap.ts` already imports `checkRosettaInstall` from `'../utils'` for
// Block F above -- pulling `utils.ts`'s module graph in, which already contains this import.
// `launcher.ts:77` is a second, independent route. So this is a second binding onto an
// already-resident singleton, NOT a new module edge. Corollary: because ES modules are
// singletons, this import does NOT cause a second registration of `presence.ts`'s module-scope
// `backendEvents.on('settingChanged', ...)` listener -- that listener is installed exactly
// once, the first time ANY route requires the module.
//
// Sanity note, not an action: this import is unaffected by `electronUntouched.test.ts`'s
// by-construction gate, which bans only the Steam token surface bindings (`configStore`,
// `TOKEN_STORE_KEY`, `TOKEN_PREFIX`) in this file.
import gogPresence from '../storeManagers/gog/presence'
// Phase 49 plan 08 (R3, A10): the bounded boot sign-in probe pass and its outcomes pull handler.
// `outcomes.ts` is already resident in the sidecar bundle through the store users' verdict
// writers; `pass.ts` is new but only composes modules already resident (the five store users and
// the online monitor). `pass.ts` imports from `backend/platform` only, never `electron`
// (electronReachLedger.test.ts).
import { createSignInProbePass } from '../signInProbe/pass'
import { createSignInProbeOutcomes } from '../signInProbe/outcomes'
import { createSignInEpochs } from '../signInProbe/sessionEpoch'
import {
  createAnonymousClient,
  createRawAnonymousClient
} from '../storeManagers/steam/anonymousClient'
import { createSteamSignInState } from '../storeManagers/steam/userSignInState'
import { createSteamAuthTrigger } from '../storeManagers/steam/authTrigger'
import { createSteamLibraryState } from '../storeManagers/steam/state'
import { createSteamGameSessionState } from '../storeManagers/steam/gameSessionState'
// Deviation (Rule 3 — blocking, Phase 27 Plan 04): `backend/logger`'s
// `logInfo`/`logWarning`/`logError` (called throughout the REAL Steam
// read/action flow code Plan 04 wires up — e.g. library.ts's refresh()
// "Steam client not ready..." warning, games.ts's launch() "launching
// appId..." info line, buildSteamProtocolUrl's guard-rejection warning)
// dereference a module-private `heroicLogWriter` that is ONLY ever assigned
// by that module's exported `init()`/`initHeadless()`. The headless sidecar
// has no Electron-app startup hook, so every one of those log calls threw
// `Cannot read properties of undefined (reading 'logInfo')` the instant a
// real flow handler ran (discovered by Task 2's own end-to-end test). Uses
// `initHeadless()` (added by this same deviation, `backend/logger/index.ts`)
// rather than the real `init()` Electron's main process calls: `init()`
// pulls in the static global-config getter (assumes an already-initialized `userData`
// config file — a real Electron app guarantees this, this headless process
// does not) and fires a fire-and-forget system-info dump (shells out to
// hardware/binary-version probes; its async chain can outlive a short-lived
// caller, e.g. a test process tearing down before it resolves).
// `initHeadless()` assigns the SAME `heroicLogWriter` singleton via the
// SAME real `LogWriter` class, skipping only those two Electron-app-only
// side effects — not a reimplementation of logging itself.
import {
  initHeadless as initLogger,
  logDebug,
  logInfo,
  logWarning,
  logError,
  logErrorSettled,
  logBootFacts,
  getRunnerLogWriter,
  LogPrefix
} from '../logger'
import { createGlobalConfig, type GlobalConfigSlice } from '../config'
import { createGameConfigs } from '../game_config'
import { resolveAppInfo } from '../host/appInfo'
import { isPackagedSidecar } from './isPackagedSidecar'
import { prepareAppFolder } from './appFolderStep'
import { readXdgUserDir } from './knownFolders'
import { homedir, release as osRelease, tmpdir } from 'os'
import {
  derivePaths,
  resolveAppDataDir,
  resolveKnownFolder
} from '../process/appPaths'
import { createAppContext } from '../process/context'
import type { AppContext, AppPaths } from '../process/context'
import type { LogSink, ProcessRunner } from '../process/types'
import { createIpcValidator } from './ipcValidation'
import { createMiscRuntime } from '../miscRuntime'
import { createAppRuntime } from '../appRuntime'
import type { AppRuntime } from '../appRuntime'
import { fetchLastestReleases } from '../utils/releases'
import { downloadAntiCheatData } from '../anticheat/utils'
import { isMac, isSnap } from '../constants/environment'
// Block F (todo 2026-09-06, quick-260908-k3x). `checkRosettaInstall()` has no static import
// edge back into `sidecar/` (`grep -n "from './sidecar\|from '\.\./sidecar" src/backend/
// utils.ts` returns nothing), so this import introduces no cycle. `isMac` above is already
// imported for other blocks -- not duplicated here.
import {
  checkRosettaInstall,
  errorHandler,
  sendGameStatusUpdate,
  type ErrorHandlerDeps
} from '../utils'
import { createCommandRunner } from '../commandRunner'
import { createSpawnAsync } from '../spawnAsync'
import { createQuitHandler } from '../quitHandler'
import { tOrFallback } from '../i18nFallback'
import { createDownloadQueue } from '../downloadmanager/downloadqueue'
import {
  createBridgeHelperRegistry,
  DEFAULT_STEAM_WAIT_SCHEDULE
} from '../storeManagers/steam/bridge/helperRegistry'
import { createSteamUser } from '../storeManagers/steam/user'
// Transitional (removed by plan 27): the legacy registries still hold children until plans
// 23/24/26 move them onto the runner.
import {
  setupEnvVars,
  setupWineEnvVars,
  validWine,
  verifyWinePrefix
} from '../launcher'
import { getUmuPath, isUmuSupported } from '../utils/compatibility_layers'
import { searchForExecutableOnPath } from '../utils/os/path'
import {
  createAbortRegistry,
  type AbortRegistry
} from '../utils/aborthandler/aborthandler'
import { createWineWindowRaiser } from '../utils/wineWindowRaise'
// Todo 2026-08-16 (quick task 260822-s8y): `applyMigrations()` had exactly ONE call site in
// the whole repo -- `main.ts:412`, inside Electron's `app.whenReady()` -- so under Tauri the
// entire migration system was dead code that PRESENTED as live (`createStores`
// registers `migrationsStore`, so grepping for "migration" made it look wired). Two
// consequences: `LegendaryGlobalConfigFolderMigration` had never run on the shipping runtime,
// and any future `Migration` added to `getAllMigrations()` would have shipped as a silent
// no-op. Same family as the `initOnlineMonitor()` gap above.
import MigrationSystem from '../migration'

// ---- Step 3: start the RPC server, wire the transport, signal READY -------

/**
 * Boot is ONE ordered list of named steps that runs once per process (Phase 66 D-08).
 * `bootSidecar` runs the list over an `AppContext` built once at boot (D-01); there are no
 * per-block once-guard booleans and no module-level `i18nReady` promise any more. The old
 * guards existed only because tests called `init()` many times per module registry (a repeat
 * would stack another `ipcMain` listener, another `runOnceWhenOnline` registration, another
 * i18next init); a second boot now throws instead, and tests boot once per fresh registry.
 *
 * Ordering constraints each step records on itself, summarised: migrations come first after
 * the logger (the migration system logs and `heroicLogWriter` is unset until `initLogger()`);
 * the logger step binds the processGuards sinks once (WR-04); secret stores and the online
 * monitor come after the RPC server and transport and before READY; rosetta comes after i18n
 * (it awaits that boot's own `state.i18nReady`); register-handlers comes after the logger (the
 * download-queue notice logs synchronously, C-04) and before rpc-server (no frame may arrive
 * before its channel exists); READY precedes the sign-in probe and the
 * startup protocol URL.
 *
 * 'app-folder' is FIRST (D-66.4-04): the heroic -> GameLib rename and the CI=e2e app folder must
 * precede every step that reads under the app folder (pathsBootOrder.test.ts pins it).
 *
 * 'stores' follows 'logger' and precedes 'migrations' (which reads `migrationsStore`);
 * 'command-runner' and 'store-managers' follow 'migrations'. They fill the per-boot
 * `BootServices` from `prebuilt` or the identity facades (66.1).
 *
 * Exit contract: no step may create an unref()-less handle or leave unbounded in-flight work.
 *
 * @public Consumed by sidecar tests through require() in a fresh module registry (D-08),
 * which knip cannot see.
 */
export const BOOT_STEP_NAMES = [
  'app-folder',
  'outbound-http-tracking',
  'logger',
  'sidecar-rpc',
  'host-services',
  'sign-in-probe-state',
  'steam-session-state',
  'steam-token-store',
  'steam-anonymous-client',
  'bridge-helper-registry',
  'stores',
  'migrations',
  'config',
  'secret-vault',
  'steamgrid-secrets',
  'steam-bottle',
  'abort-registry',
  'app-runtime',
  'misc-runtime',
  'command-runner',
  'steam-user',
  'humble-services',
  'online-monitor-owner',
  'engine-state',
  'engine-runtime',
  'steam-launch-runtime',
  'steam-bridge-runtime',
  'steam-install-runtime',
  'gog-runtime',
  'legendary-runtime',
  'nile-runtime',
  'info-caches',
  'tools-state',
  'winetricks-queue',
  'store-managers',
  'download-queue',
  'shell-exe-receipt',
  'asset-root-check',
  'i18n',
  'app-shell-state',
  'register-handlers',
  'rpc-server',
  'protocol-url-handler',
  'mac-steam-online-restore',
  'secret-stores',
  'orphaned-token-cleanup',
  'online-monitor',
  'anticheat-listener',
  'releases-fetch',
  'installed-json-watcher',
  'steam-running-poll',
  'playtime-lock-clear',
  'legacy-zoom-cleanup',
  'engine-temp-sweep',
  'store-user-reconcile',
  'rosetta',
  'playtime-queue-drain',
  'gog-presence',
  'sign-in-probe-outcomes',
  'ready-sentinel',
  'sign-in-probe',
  'startup-protocol-url'
] as const

type BootStepName = (typeof BOOT_STEP_NAMES)[number]

/**
 * The slice of the entry-built process guards the boot needs: only the two late-bound log sink
 * setters (D-66.3-10). Never stored on `BootServices` or `AppContext`.
 */
type BootGuards = Pick<
  ProcessGuards,
  'setUnhandledRejectionLogSink' | 'setUncaughtExceptionLogSink'
>

interface BootIo {
  input: Readable
  output: Writable
  guards: BootGuards
}

/** Values one boot produces for later steps; created inside `bootSidecar`, one per boot. */
interface BootState {
  /**
   * The i18next init promise for this boot, chained so a step can await CATALOG READINESS
   * rather than mere init()-was-called (D-02 area, Block F). Holds the CAUGHT promise, not the
   * raw `i18next.use(Backend).init(...)` one, because a failed i18n init must still let the
   * Rosetta check run (falling back to i18next's inline defaults). If the i18n step's own
   * outer `try` throws before reaching `init(...)` this stays `Promise.resolve()`, which is
   * the correct degrade.
   */
  i18nReady: Promise<void>
  /** The per-boot services, filled by the 'stores', 'command-runner' and 'store-managers' steps. */
  services: Partial<BootServices>
  /**
   * The dev-only plaintext vault when this boot selected it ('secret-vault' step), else null. Held
   * here, not on `BootServices`: it is a selection input for the secret-store owners and the
   * 'secret-stores' step, never something a handler reads.
   */
  secretVault: DevSecretVault | null
  /** The keyring-backed SteamGridDB store this boot built, when no dev vault was selected. */
  steamGridKeyringStore: SidecarSteamGridDbSecretStore | null
  /** The keyring-backed Humble store this boot built, when no dev vault was selected. */
  humbleKeyringStore: SidecarHumbleSecretStore | null
  /**
   * This boot's outbound HTTP tracker ('outbound-http-tracking' step), read by 'rpc-server' for the
   * stdin-EOF release. Held here, not on `BootServices`: no handler reads it.
   */
  outboundHttp: OutboundHttpTracker | null
  /**
   * This boot's shell instances ('app-shell-state' step), read by 'register-handlers' and
   * 'installed-json-watcher'. Held here, not on `BootServices`: no handler reads it after boot.
   */
  shellState: ShellState | null
  /**
   * This boot's stdio transport ('sidecar-rpc' step): 'host-services' takes its bound send
   * functions, 'rpc-server' starts it. Held here, not on `BootServices`: the handlers reach the
   * transport through host services.
   */
  rpc: SidecarRpc | null
}

/**
 * The GOG user slice for presence, resolved by getter at call time (R4): the 'gog-presence' step
 * and the quit handler read the boot's stores and managers only when they fire.
 */
function gogPresenceDeps(state: BootState): GOGPresenceDeps {
  return {
    get config() {
      return requireServices(state).config
    },
    get appInfo() {
      return requireServices(state).appInfo
    },
    get onlineMonitor() {
      return requireServices(state).onlineMonitor
    },
    get gogRuntime() {
      return requireServices(state).gogRuntime
    },
    get paths() {
      return requireServices(state).paths
    },
    stores: {
      get gog() {
        return requireServices(state).stores.gog
      }
    },
    libraryManagers: {
      get gog() {
        return requireServices(state).managers.library.gog
      }
    }
  }
}

function requireSteamProcesses(state: BootState): SteamProcesses {
  const { steamProcesses } = state.services
  if (!steamProcesses) {
    throw new Error('store-managers step ran before the command-runner step')
  }
  return steamProcesses
}

function requireBridgeHelpers(state: BootState): BootServices['bridgeHelpers'] {
  const { bridgeHelpers } = state.services
  if (!bridgeHelpers) throw new Error('bridge-helper-registry step has not run')
  return bridgeHelpers
}

function requireEngineRuntime(state: BootState): BootServices['engineRuntime'] {
  const { engineRuntime } = state.services
  if (!engineRuntime) throw new Error('engine-runtime step has not run')
  return engineRuntime
}

function requireHost(state: BootState): HostServices {
  const { host } = state.services
  if (!host) throw new Error('host-services step has not run')
  return host
}

function requireShellState(state: BootState): ShellState {
  if (!state.shellState) throw new Error('app-shell-state step has not run')
  return state.shellState
}

function requireRpc(state: BootState): SidecarRpc {
  if (!state.rpc) throw new Error('sidecar-rpc step has not run')
  return state.rpc
}

function requireAborts(state: BootState): AbortRegistry {
  const { aborts } = state.services
  if (!aborts) throw new Error('abort-registry step has not run')
  return aborts
}

function requireStoreRoot(state: BootState): StoreRoot {
  const { storeRoot } = state.services
  if (!storeRoot) throw new Error('stores step has not run')
  return storeRoot
}

function requireAppRuntime(state: BootState): AppRuntime {
  const { appRuntime } = state.services
  if (!appRuntime) throw new Error('app-runtime step has not run')
  return appRuntime
}

function requireToolsState(state: BootState): ToolsState {
  const { toolsState } = state.services
  if (!toolsState) throw new Error('tools-state step has not run')
  return toolsState
}

function requireServices(state: BootState): BootServices {
  const {
    stores,
    storeRegistry,
    storeRoot,
    managers,
    launcher,
    commandRunner,
    runner,
    clock,
    steamProcesses,
    spawnAsync,
    quit,
    downloadQueue,
    host,
    config,
    gameConfigs,
    paths,
    appInfo,
    onlineMonitor,
    engineState,
    engineRuntime,
    steamLaunchRuntime,
    bridgeRuntime,
    steamInstallRuntime,
    gogRuntime,
    legendaryRuntime,
    nileRuntime,
    infoCaches,
    aborts,
    appRuntime,
    miscRuntime,
    windowRaiser,
    toolsState,
    winetricksQueue,
    signInProbe,
    steamSession,
    tokenStore,
    anonymousClient,
    bridgeHelpers,
    steamBottle,
    steamUser,
    steamGridSecrets,
    humble
  } = state.services
  if (
    !stores ||
    !storeRegistry ||
    !storeRoot ||
    !managers ||
    !launcher ||
    !commandRunner ||
    !runner ||
    !clock ||
    !steamProcesses ||
    !spawnAsync ||
    !quit ||
    !downloadQueue ||
    !host ||
    !config ||
    !gameConfigs ||
    !paths ||
    !appInfo ||
    !onlineMonitor ||
    !engineState ||
    !engineRuntime ||
    !steamLaunchRuntime ||
    !bridgeRuntime ||
    !steamInstallRuntime ||
    !gogRuntime ||
    !legendaryRuntime ||
    !nileRuntime ||
    !infoCaches ||
    !aborts ||
    !appRuntime ||
    !miscRuntime ||
    !windowRaiser ||
    !toolsState ||
    !winetricksQueue ||
    !signInProbe ||
    !steamSession ||
    !tokenStore ||
    !anonymousClient ||
    !bridgeHelpers ||
    !steamBottle ||
    !steamUser ||
    !steamGridSecrets ||
    !humble
  ) {
    const missing = (
      [
        'stores',
        'storeRegistry',
        'storeRoot',
        'managers',
        'launcher',
        'commandRunner',
        'runner',
        'clock',
        'steamProcesses',
        'spawnAsync',
        'quit',
        'downloadQueue',
        'host',
        'config',
        'gameConfigs',
        'paths',
        'appInfo',
        'onlineMonitor',
        'engineState',
        'engineRuntime',
        'steamLaunchRuntime',
        'bridgeRuntime',
        'steamInstallRuntime',
        'gogRuntime',
        'legendaryRuntime',
        'nileRuntime',
        'infoCaches',
        'aborts',
        'appRuntime',
        'miscRuntime',
        'windowRaiser',
        'toolsState',
        'winetricksQueue',
        'signInProbe',
        'steamSession',
        'tokenStore',
        'anonymousClient',
        'bridgeHelpers',
        'steamBottle',
        'steamUser',
        'steamGridSecrets',
        'humble'
      ] as const
    ).filter((name) => !state.services[name])
    throw new Error(`boot services missing: ${missing.join(', ')}`)
  }
  return {
    stores,
    storeRegistry,
    storeRoot,
    managers,
    launcher,
    commandRunner,
    runner,
    clock,
    steamProcesses,
    spawnAsync,
    quit,
    downloadQueue,
    host,
    config,
    gameConfigs,
    paths,
    appInfo,
    onlineMonitor,
    engineState,
    engineRuntime,
    steamLaunchRuntime,
    bridgeRuntime,
    steamInstallRuntime,
    gogRuntime,
    legendaryRuntime,
    nileRuntime,
    infoCaches,
    aborts,
    appRuntime,
    miscRuntime,
    windowRaiser,
    toolsState,
    winetricksQueue,
    signInProbe,
    steamSession,
    tokenStore,
    anonymousClient,
    bridgeHelpers,
    steamBottle,
    steamUser,
    steamGridSecrets,
    humble
  }
}

interface BootStep {
  name: BootStepName
  run(ctx: AppContext, io: BootIo, state: BootState): void
}

/**
 * Delivers a startup (cold-start) `gamelib://` deep link to `handleProtocol`, if `argv`
 * carries one (Phase 34.5 gap cycle 6 plan 44, F-34.5-G6-09, REQ-34.5-01/05/12) — the sidecar
 * side of the shell's `sidecar_forward_args` allow-list (`src-tauri/src/main.rs`).
 *
 * Finds the first element starting `gamelib://` — mirrors `protocol.ts`'s own
 * `parseHeroicUrl`'s `args.find((arg) => arg.startsWith('gamelib://'))` exactly, so this
 * function's own pre-check can never diverge from what `handleProtocol` itself would accept.
 * Returns `false` with NO logging when absent — a normal boot has no deep link, and a
 * per-boot log line would be noise.
 *
 * When present, logs `[bootstrap] startup protocol URL present` at `LogPrefix.Backend` — the
 * URL itself is NOT logged here; `handleProtocol` (`protocol.ts:50`) logs it authoritatively
 * one line later, and double-logging would put two different renderings of the same value in
 * the gate's evidence.
 *
 * Calls `handleProtocol` wrapped in `Promise.resolve(...).catch(...)`: `handleProtocol` is not
 * `async`, and its `launch` arm returns `handleLaunch`'s promise un-awaited (`protocol.ts:56`)
 * — an unwrapped call would leave a floating rejection. The whole body is wrapped in
 * try/catch so a synchronous throw can never fail boot (T-34.5-G3-02, matching the two
 * existing boot-time diagnostic blocks above at `:161`/`:203`).
 *
 * `argv` defaults to `process.argv` but is injectable, so a test can drive this PRODUCTION
 * function with a synthetic argv instead of reconstructing the call site
 * (`test-must-exercise-production-call-shape`).
 */
// Consumed by src/backend/sidecar/__tests__/bootstrapWirings.test.ts via
// `const { init, deliverStartupProtocolUrl } = require('../bootstrap')`
// (line ~253), then actually CALLED. `require()`'s return type is `any`, so
// this reference is invisible to ts-prune despite both files being in
// tsconfig `include`.
/** The protocol handler's slice of the boot services (host members flattened). */
function protocolDepsOf(services: BootServices): ProtocolDeps {
  return {
    managers: services.managers,
    launcher: services.launcher,
    stores: services.stores,
    config: services.config,
    dialogs: services.host.dialogs,
    sendFrontendMessage: services.host.sendFrontendMessage,
    appState: services.host.appState,
    notifications: services.host.notifications,
    appRuntime: services.appRuntime,
    paths: services.paths
  }
}

export function deliverStartupProtocolUrl(
  deps: ProtocolDeps,
  argv: string[] = process.argv
): boolean {
  const hasProtocolUrl = argv.some((arg) => arg.startsWith('gamelib://'))
  if (!hasProtocolUrl) return false

  try {
    logInfo('[bootstrap] startup protocol URL present', LogPrefix.Backend)
    void Promise.resolve(handleProtocol(deps, argv)).catch((error) => {
      logError(
        `[bootstrap] deliverStartupProtocolUrl: handleProtocol rejected: ${error}`,
        LogPrefix.Backend
      )
    })
  } catch (error) {
    logError(
      `[bootstrap] deliverStartupProtocolUrl threw synchronously: ${error}`,
      LogPrefix.Backend
    )
  }
  return true
}

/**
 * Registers the `handleProtocolUrl` invoke channel — the sidecar-side entry point the Rust
 * shell's single-instance accept loop calls to deliver a WARM (already-running) deep link
 * (Phase 34.5 gap cycle 6 plan 44, D-44-A). Runs once, as a boot step (D-08).
 *
 * Rejects anything that is not a `string` beginning `gamelib://` by THROWING —
 * `new Error('handleProtocolUrl: rejected a non-gamelib argument')`, deliberately never
 * echoing the rejected value in the message (T-34.5-G6-25: the Rust accept loop that calls
 * this channel logs only the reason and byte count, never the payload, and this handler must
 * not undo that). A thrown handler produces an `ok:false` response frame back to the Rust
 * accept loop, which logs `ok`/`err` only.
 *
 * On acceptance, calls `handleProtocol` the same wrapped way `deliverStartupProtocolUrl` does
 * above, and returns `true` IMMEDIATELY — without awaiting the launch. This is load-bearing:
 * `handleProtocolUrl` is deliberately absent from `LONG_RUNNING_CHANNELS`
 * (`src-tauri/src/main.rs`'s `handle_protocol_url_channel_is_bounded_at_invoke_timeout` test,
 * Task 1), so a handler that awaited `handleLaunch` would block the shell's accept thread
 * until `INVOKE_TIMEOUT` (60s) fired mid-game.
 */
// Not exported: no file imports `registerProtocolUrlHandler` from this
// module -- the only outside references
// (src/backend/sidecar/__tests__/bootstrapWirings.test.ts) are source-text
// checks (`initBody.toContain('registerProtocolUrlHandler()')`), a call-site
// string match indifferent to the `export` keyword. Called internally by
// `init()` below.
function registerProtocolUrlHandler(
  ipc: Pick<IpcRegistry, 'handle'>,
  getDeps: () => ProtocolDeps
): void {
  ipc.handle('handleProtocolUrl', (_event: unknown, url?: unknown) => {
    if (typeof url !== 'string' || !url.startsWith('gamelib://')) {
      throw new Error('handleProtocolUrl: rejected a non-gamelib argument')
    }
    void Promise.resolve(handleProtocol(getDeps(), [url])).catch((error) => {
      logError(
        `[bootstrap] registerProtocolUrlHandler: handleProtocol rejected: ${error}`,
        LogPrefix.Backend
      )
    })
    return true
  })
}

/**
 * Clears a stranded GOG playtime-sync `lock` sentinel at sidecar boot (finding A1 LEG 2,
 * quick-260907-odi).
 *
 * `syncQueuedPlaytime()` (`gog/library.ts:169`) guards its critical section with
 * `playtimeSyncQueue.has('lock')`. The deleted Electron `main.ts:469` cleared this key at every
 * boot (`playtimeSyncQueue.delete('lock')`); that line has no successor in the Tauri sidecar.
 * This is the process-death half of a two-leg fix: its companion is the `try/finally` added to
 * `syncQueuedPlaytime()` itself, which releases the lock on an in-process throw but cannot
 * survive SIGKILL, a crash, or a power loss -- `finally` never runs if the process dies mid-sync.
 * This function is the only thing that can recover from THAT case, and it only runs at boot.
 *
 * The lock never ages out on its own: `playtimeSyncQueue` is a file-backed `CacheStore`
 * (`gog/stores.ts:42`) that survives restarts, and `CacheStore` evaluates its
 * lifespan/expiry only inside `get()` (`cache.ts:64-88`) -- `has()` (`cache.ts:142`) is a raw
 * `current_store.has(key)` passthrough with no expiry check, and nothing else ever calls
 * `get('lock')` for this key.
 *
 * Checks `has('lock')` first and returns silently if absent -- a normal boot must log nothing
 * here. Only the clearing path logs, at `logWarning` (not `logInfo`): a stranded lock means a
 * previous sync died mid-flight, which is an anomaly worth surfacing, matching this file's
 * existing reservation of `logWarning` for its other abnormal boot paths. Wrapped in try/catch
 * per this file's standing rule that a boot-time block must never fail boot.
 *
 * @public Consumed by sidecar tests through require() in a fresh module registry (D-08),
 * which knip cannot see.
 */
export function clearStrandedPlaytimeSyncLock(deps: {
  playtimeSyncQueue: Stores['gog']['playtimeSyncQueue']
}): void {
  const { playtimeSyncQueue } = deps
  try {
    if (!playtimeSyncQueue.has('lock')) {
      return
    }
    playtimeSyncQueue.delete('lock')
    logWarning(
      '[bootstrap] Cleared a stranded GOG playtime sync lock left by an interrupted sync',
      LogPrefix.Backend
    )
  } catch (error) {
    logWarning(
      `[bootstrap] clearStrandedPlaytimeSyncLock() failed: ${String(error)}`,
      LogPrefix.Backend
    )
  }
}

/**
 * Restores the boot-time Epic/GOG user reconciliation deleted with `src/backend/main.ts` in
 * commit `5643c7583` ("feat(35-14)!: delete the Electron entry points") (todo 2026-09-06,
 * quick-260908-fre). The deleted source, `main.ts:442-457`, ran inside `app.whenReady()`:
 *
 *     runOnceWhenOnline(async () => {
 *       if (!LegendaryUser.isLoggedIn(deps.gogUser)) {
 *         logInfo('User Not Found, removing it from Store', { prefix: ..., forceLog: true })
 *         configStore.delete('userInfo')
 *       }
 *       if (GOGUser.isLoggedIn()) GOGUser.getUserDetails()
 *     })
 *
 * Honesty note (established fact 4): `LegendaryUser.getUserInfo()` (`legendary/user.ts:679-681`)
 * already does `configStore.delete('userInfo')` lazily, whenever something calls it while
 * logged out. This function restores the EAGER boot-time leg only — it is a second, earlier
 * trigger for the same delete, not the sole reconciliation mechanism.
 *
 * The callback passed to `runOnceWhenOnline` is deliberately SYNCHRONOUS (`() => {...}`), unlike
 * the deleted `main.ts` version's `async` callback, which was never `await`ed for anything and
 * gained nothing from being `async`. A sync callback makes the floated `getUserDetails()`
 * promise and its `.catch` below syntactically obvious, instead of hiding a floated call behind
 * an unawaited `async` function body.
 *
 * TWO try/catch layers, not one — this is the subtle part. `runOnceWhenOnline` either invokes
 * the callback immediately (if already online) or defers it to
 * `connectivityEmitter.once('online', ...)` (if offline), so when offline the callback body runs
 * on a LATER turn, outside the stack frame of any `try` wrapping the `runOnceWhenOnline(...)`
 * call itself. An outer `try { runOnceWhenOnline(cb) } catch {}` therefore protects only the
 * registration, never the deferred work. Both `LegendaryUser.isLoggedIn()` (an `existsSync`) and
 * `configStore.delete()` can throw, so the callback body gets its OWN inner try/catch too. This
 * repo's standing rule is that a boot-time block must never fail boot — here that costs two
 * guards, not one. Do not "simplify" this back down to one.
 *
 * `GOGUser.getUserDetails()`'s promise gets an explicit `.catch`: `runOnceWhenOnline`'s callback
 * return value is discarded, so an unhandled rejection would otherwise surface only via
 * `processGuards`' process-wide net. Relying on that net for a known-floatable promise is exactly
 * what `deliverStartupProtocolUrl` and the migrations block above already refuse to do in this
 * file. `getUserDetails()` does `await axios.get(...).catch(...)` internally but can still reject
 * earlier — `getCredentials()` (`gog/user.ts:303`) spawns a `gogdl auth` subprocess.
 *
 * The ported `logInfo` line is deliberately VERBATIM, including `forceLog: true`, and does NOT
 * carry this file's local `[bootstrap] ` message-prefix convention: the literal
 * `'User Not Found, removing it from Store'` is the exact string the todo's bundle-level evidence
 * greps for, and it is the receipt that proves this port shipped. Prefixing it would silently
 * invalidate that evidence. The two catch-arm diagnostics below are new lines, so they DO follow
 * the local `[bootstrap] ` convention.
 *
 * @public Consumed by sidecar tests through require() in a fresh module registry (D-08),
 * which knip cannot see.
 */
export function reconcileStoreUsersWhenOnline(deps: {
  kvs: Pick<Stores['kvs'], 'configStore'>
  gogUser: GOGUserDeps
  onlineMonitor: Pick<OnlineMonitor, 'runOnceWhenOnline'>
}): void {
  const { runOnceWhenOnline } = deps.onlineMonitor
  const { configStore } = deps.kvs
  try {
    runOnceWhenOnline(() => {
      try {
        if (!LegendaryUser.isLoggedIn(deps.gogUser)) {
          // Verbatim, unprefixed — see the doc comment above (D5).
          logInfo('User Not Found, removing it from Store', {
            prefix: LogPrefix.Backend,
            forceLog: true
          })
          configStore.delete('userInfo')
        }
        if (GOGUser.isLoggedIn(deps.gogUser)) {
          GOGUser.getUserDetails(deps.gogUser).catch((error: unknown) => {
            logWarning(
              `[bootstrap] reconcileStoreUsersWhenOnline: GOGUser.getUserDetails() failed: ${String(error)}`,
              LogPrefix.Backend
            )
          })
        }
      } catch (error) {
        logWarning(
          `[bootstrap] reconcileStoreUsersWhenOnline: callback failed: ${String(error)}`,
          LogPrefix.Backend
        )
      }
    })
  } catch (error) {
    logWarning(
      `[bootstrap] reconcileStoreUsersWhenOnline: could not be started: ${String(error)}`,
      LogPrefix.Backend
    )
  }
}

/**
 * Restores the boot-time GOG queued-playtime drain deleted with `src/backend/main.ts` in commit
 * `5643c7583` ("feat(35-14)!: delete the Electron entry points") (todo 2026-09-06,
 * quick-260908-wk0). The deleted source, `main.ts:470-476`, ran inside `app.whenReady()`,
 * immediately after the `playtimeSyncQueue.delete('lock')` line Block D above already ported:
 *
 *     // Make sure lock is not present when starting up
 *     playtimeSyncQueue.delete('lock')
 *     if (!settings.disablePlaytimeSync) {
 *       runOnceWhenOnline(() => <manager table>['gog'].syncQueuedPlaytime())
 *     } else {
 *       logDebug('Skipping playtime sync queue upload - playtime sync disabled', {
 *         prefix: LogPrefix.Backend
 *       })
 *     }
 *
 * LOAD-BEARING ORDERING (D2): Block D already cleared a lock stranded by process death.
 * `syncQueuedPlaytime()`'s FIRST statement is `if (playtimeSyncQueue.has('lock')) return`
 * (`gog/library.ts`). Calling this helper before Block D's clear has run would let a stale lock
 * silently no-op the very drain this block adds -- restoring the call site while leaving the bug
 * unfixed for exactly the users whose previous sync died mid-flight, i.e. the ones with a
 * non-empty queue. THIS IS THE SINGLE MOST IMPORTANT SENTENCE IN THIS FILE'S BLOCK G. The call
 * site below is therefore placed after Block D (and Block E, appended as Block G), never before.
 *
 * THREE GUARDS, not one (D4). `runOnceWhenOnline` either invokes its callback immediately (if
 * already online) or defers it to `connectivityEmitter.once('online', ...)` (if offline) --
 * `online_monitor.ts:136-142`. In the deferred case the callback body runs on a LATER turn,
 * outside the stack frame of any `try` wrapping the `runOnceWhenOnline(...)` call itself, so an
 * outer `try { runOnceWhenOnline(cb) } catch {}` covers only the REGISTRATION, never the deferred
 * body -- hence the inner `try/catch` around the callback. And `syncQueuedPlaytime()` CAN reject:
 * its `try/finally` (finding A1 LEG 1, `gog/library.ts`) deliberately re-throws rather than
 * swallowing -- the `finally` only releases the lock -- and `postPlaytimeSession` does network
 * I/O. `runOnceWhenOnline`'s callback return value is discarded, so a floated
 * `syncQueuedPlaytime()` promise needs its OWN explicit `.catch`, or the rejection would surface
 * only via `processGuards`' process-wide net -- exactly what `deliverStartupProtocolUrl` and the
 * migrations block above already refuse to rely on. Do not "simplify" this back down to fewer
 * guards.
 *
 * SETTINGS READ OUTSIDE THE CALLBACK (D5): `deps.config.getSettings()` runs synchronously
 * at helper-entry time, before `runOnceWhenOnline` is even called, and the `disablePlaytimeSync`
 * branch returns early. Two reasons: fidelity (the deleted `main.ts` read `settings` at
 * `whenReady()` time, not at online time), and determinism (a user toggling the setting between
 * boot and coming online should not change what a boot-time decision already made). The whole
 * synchronous body sits inside the outer try, so a throwing `getSettings()` cannot fail boot.
 *
 * THE `logDebug` LINE IS VERBATIM AND UNPREFIXED (D6), including its
 * `{ prefix: LogPrefix.Backend }` options-object form. Two reasons, and an honest limit:
 *   1. Block E established the house rule at this exact site: a PORTED log literal keeps its
 *      original form; NEW diagnostic lines added by the port take the local `[bootstrap] `
 *      prefix. This is the second application of that rule.
 *   2. Honesty about what it is NOT: unlike Block E's `'User Not Found, removing it from Store'`,
 *      this string is NOT the todo's own bundle-level evidence -- this todo's evidence is the
 *      *count of `syncQueuedPlaytime()` call sites in `build/main/sidecar.js`* (recorded exactly
 *      one, at `sidecar.js:23753`). So the verbatim decision here rests on the house rule and on
 *      port fidelity, not on protecting a named grep. It is nonetheless a clean, independent
 *      receipt for the DISABLED arm specifically -- that string appears zero times in `src/`
 *      today.
 * The two NEW catch-arm diagnostics below DO take the `[bootstrap] ` prefix and name this
 * function, in the shape of `reconcileStoreUsersWhenOnline`'s catch arms.
 *
 * OUT OF SCOPE AT THE TIME THIS WAS WRITTEN, explicitly (D13): `runOnceWhenOnline(gogPresence.
 * setPresence)` sat on the very next line of the deleted source (`main.ts:477`) and was, at the
 * time this function was ported, a SEPARATE todo that was not yet resolved
 * (`2026-09-06-gog-presence-never-set-at-startup-and-its-keepalive-never-arms.md`). That todo was
 * subsequently CLOSED by quick-260909-k5x and ported as **Block H**
 * (`setGogPresenceWhenOnline()`, below `checkRosettaWhenMac()`), with its own independent call
 * site in `init()`. The prohibition this note used to carry -- "do not import `gogPresence` from
 * this function" -- is now stale in its absolute form: the MODULE (this file) imports
 * `gogPresence` at file scope for Block H's use. The surviving, narrower statement is:
 * `syncQueuedPlaytimeWhenOnline()` itself still does not use `gogPresence` and is still not
 * Block H's caller -- the two blocks are independent boot-time side effects with independent
 * call sites in `init()`, and neither reads or writes state the other depends on. Leaving the old
 * absolute wording here would make this comment invert its own file.
 *
 * @public Consumed by sidecar tests through require() in a fresh module registry (D-08),
 * which knip cannot see.
 */
export function syncQueuedPlaytimeWhenOnline(deps: {
  managers: Pick<StoreManagers, 'library'>
  config: Pick<GlobalConfigSlice, 'getSettings'>
  onlineMonitor: Pick<OnlineMonitor, 'runOnceWhenOnline'>
}): void {
  const { runOnceWhenOnline } = deps.onlineMonitor
  const library = deps.managers.library
  try {
    const settings = deps.config.getSettings()
    if (settings.disablePlaytimeSync) {
      // Verbatim, unprefixed -- see the doc comment above (D6).
      logDebug('Skipping playtime sync queue upload - playtime sync disabled', {
        prefix: LogPrefix.Backend
      })
      return
    }
    runOnceWhenOnline(() => {
      try {
        library['gog'].syncQueuedPlaytime().catch((error: unknown) => {
          logWarning(
            `[bootstrap] syncQueuedPlaytimeWhenOnline: syncQueuedPlaytime() failed: ${String(error)}`,
            LogPrefix.Backend
          )
        })
      } catch (error) {
        logWarning(
          `[bootstrap] syncQueuedPlaytimeWhenOnline: callback failed: ${String(error)}`,
          LogPrefix.Backend
        )
      }
    })
  } catch (error) {
    logWarning(
      `[bootstrap] syncQueuedPlaytimeWhenOnline: could not be started: ${String(error)}`,
      LogPrefix.Backend
    )
  }
}

/**
 * Restores the boot-time Rosetta-availability probe deleted with `src/backend/main.ts` in
 * commit `5643c7583` ("feat(35-14)!: delete the Electron entry points") (todo 2026-09-06,
 * quick-260908-k3x). The old caller was `main.ts:241` -- that file no longer exists, so this
 * is a port into the sidecar's own boot path, not a re-wire of an existing call site.
 * `checkRosettaInstall({ runner })` itself (`utils.ts`) takes the boot runner for its bounded
 * (10 000 ms) probe and has no platform guard of its own, so the caller must gate it, which is
 * this function's whole job.
 *
 * FIVE decisions this function's shape encodes:
 *
 * 1. **Why the mac gate lives HERE and not in `checkRosettaInstall()`**: the probe shells
 *    `arch -x86_64 /usr/sbin/sysctl`, which is meaningless off macOS. Gating the caller
 *    instead of the callee leaves `checkRosettaInstall()`'s own test suite
 *    (`checkRosettaInstall.test.ts`) valid and unmodified.
 * 2. **Why floated, not awaited**: `init()` is synchronous by contract -- `src/sidecar/
 *    index.ts` and ~10 test suites call it as such. Same constraint the `applyMigrations()`
 *    comment above records.
 * 3. **Why chained off `i18nReady` rather than relying on statement order**: the dialog's
 *    title/message come from `i18next.t()`, and `i18next.use(Backend).init()` is
 *    asynchronous (installed i18next is 22.5.1; `i18next-fs-backend` reads catalogs off
 *    disk). Statement order alone would only guarantee `i18next.init()` had been *called*,
 *    not that the catalog had *loaded* -- so a non-English user would get the inline English
 *    defaults baked into `checkRosettaInstall()`'s `t()` calls. Chaining makes the ordering
 *    exact rather than probable.
 * 4. **Why it cannot fail boot**: `dialog.showMessageBox` is a total method under the sidecar
 *    (never rejects -- `platform/index.ts`), the chained promise is `.catch()`-guarded, and
 *    the whole synchronous body is wrapped in try/catch too.
 * 5. **`icon: windowIcon`** (inside `checkRosettaInstall()`) is inert under the Rust dialog
 *    forward, which passes only `message`/`title`/`kind`/`buttons` -- named here so a reader
 *    does not go looking for a missing icon.
 */
export function checkRosettaWhenMac(
  i18nReady: Promise<void>,
  deps: {
    runner: Pick<ProcessRunner, 'run'>
    paths: Pick<AppPaths, 'windowIcon'>
    dialogs: Pick<HostServices['dialogs'], 'showMessageBox'>
  }
): void {
  if (!isMac) return
  try {
    i18nReady
      .then(() => checkRosettaInstall(deps))
      .catch((error: unknown) => {
        logWarning(
          `[bootstrap] checkRosettaInstall() failed: ${String(error)}`,
          LogPrefix.Backend
        )
      })
  } catch (error) {
    logWarning(
      `[bootstrap] checkRosettaWhenMac() could not be started: ${String(error)}`,
      LogPrefix.Backend
    )
  }
}

/**
 * Restores the boot-time GOG presence call deleted with `src/backend/main.ts` in commit
 * `5643c7583` ("feat(35-14)!: delete the Electron entry points") (todo
 * 2026-09-06-gog-presence-never-set-at-startup-and-its-keepalive-never-arms.md, quick-260909-k5x).
 * The deleted source, `main.ts:477`, was the line immediately after Block G's ported call
 * (`main.ts:470-476`) and read, in full:
 *
 *     runOnceWhenOnline(gogPresence.setPresence)
 *
 * KEEP-ALIVE NOTE: `presence.ts`'s module-scope `interval` is `undefined` at process start, and
 * `setPresence()` arms its own 5-minute `setInterval` the first time it runs past its early
 * return (`if (!interval) { interval = setInterval(setPresence, 5 * 60 * 1000) }`). So this one
 * boot-time call is what arms the keep-alive too -- Block H closes BOTH halves of the todo's
 * title, not just "presence is set at boot".
 *
 * D-K5X-01 -- PLACEMENT/ORDERING: Block H has NO ordering constraint of its own beyond the
 * generic three every boot-time block in this file already satisfies:
 *   1. after `initLogger()` -- the helper logs, and `heroicLogWriter` is unset before that
 *      (standing `sidecar-console-and-logger-are-invisible` finding);
 *   2. after `initOnlineMonitor()` -- it calls `runOnceWhenOnline`, the same requirement
 *      Blocks B/E/G already record;
 *   3. before the `READY_SENTINEL` write -- so presence is at least queued before the frontend
 *      can drive any RPC, without delaying READY itself.
 * Each candidate load-bearing dependency was checked and REFUTED, individually:
 *   - *Not* dependent on Block D (`playtimeSyncQueue.delete('lock')`). `setPresence` never reads
 *     `playtimeSyncQueue`. Block G's load-bearing constraint is specific to
 *     `syncQueuedPlaytime()`'s `if (playtimeSyncQueue.has('lock')) return` first statement;
 *     Block H has no analogue.
 *   - *Not* dependent on Block E (`reconcileStoreUsersWhenOnline`). Block E's
 *     `configStore.delete('userInfo')` arm is Epic-scoped and gated on
 *     `!LegendaryUser.isLoggedIn()`; its GOG arm only calls `GOGUser.getUserDetails()` when
 *     ALREADY logged in, which cannot change what `GOGUser.isLoggedIn()` returns. `setPresence`
 *     calls `GOGUser.getCredentials()` itself and refreshes on its own.
 *   - *Not* dependent on Block F (`i18nReady`). Block H paints no dialog and reads no catalog.
 *   - *Not* dependent on Block G. Both blocks read `disablePlaytimeSync`, but neither writes it
 *     and neither shares state with the other.
 * So: the only constraints are the generic three. Appending after Block G satisfies all three
 * and leaves the existing A->B->C->D->E->F->G sequence byte-identical.
 *
 * One HONEST, non-load-bearing note: when the process boots offline, Blocks E, G and H each
 * register a `connectivityEmitter.once('online', ...)` listener, so their callbacks fire in
 * registration order (E, then G, then H). That ordering is deterministic and observable, but
 * nothing depends on it -- it is not dressed up as a constraint here.
 *
 * D-K5X-02 -- NO SETTINGS HOIST, deliberately DIFFERENT from Block G's D5. Block G hoisted
 * the global-config `getSettings()` read to helper entry because the deleted source ITSELF read
 * `settings` at `whenReady()` time (`main.ts:470-476`'s `if (!settings.disablePlaytimeSync)`
 * wrapper). Block H's deleted source had NO such wrapper -- `main.ts:477` was a bare
 * `runOnceWhenOnline(gogPresence.setPresence)` with zero settings access at the call site.
 * Reproducing that exactly means the gate stays exactly where the deleted source left it: inside
 * `setPresence`, evaluated at ONLINE time, not at helper-entry time. Two consequences, neither an
 * "improvement" to make:
 *   - There is NO skip-log arm here. Block G's verbatim `logDebug` receipt has no counterpart in
 *     the deleted presence source; inventing one would be a new log line masquerading as a port.
 *   - A user who toggles `disableGOGPresence` between boot and coming online SHOULD see the new
 *     value honoured. That is not a determinism regression relative to Block G -- it is the
 *     deleted source's own behaviour, and `presence.ts`'s module-scope `settingChanged` listener
 *     already makes live toggling the documented model for this specific flag.
 *
 * THREE GUARD LAYERS, same shape as Blocks E/G, and an honest limit on what they guard against:
 * `setPresence()` today wraps its ENTIRE body in its own `try/catch` and logs+swallows
 * (`presence.ts`), so it CANNOT reject as currently written -- the inner guards below are
 * UNREACHABLE against the current implementation. They are defence-in-depth for the call site,
 * the same shape Blocks E and G established, and insurance against a future `presence.ts`
 * refactor that lets a rejection out. Do NOT claim `setPresence` can reject today -- that would
 * be a false rationale, worse than a missing one. What IS structurally necessary regardless of
 * `setPresence`'s current implementation is the standing `runOnceWhenOnline` argument Block G's
 * header already records: when offline, the callback body runs on a LATER turn, outside the
 * stack frame of any `try` wrapping the `runOnceWhenOnline(...)` call, so the outer
 * `try { runOnceWhenOnline(cb) } catch {}` covers only REGISTRATION, never the deferred body --
 * hence the inner `try/catch` around the callback.
 *
 * There is no ported log literal in this block (unlike Block E/G's D6-shaped verbatim strings),
 * so the verbatim-log house rule does not apply here -- do not go looking for a verbatim string
 * that was never in the deleted source. The two new catch-arm diagnostics below take this file's
 * local `[bootstrap] ` prefix and name `setGogPresenceWhenOnline`, in the shape of
 * `reconcileStoreUsersWhenOnline`'s and `syncQueuedPlaytimeWhenOnline`'s own catch arms.
 *
 * LOAD-BEARING CALL SHAPE: `gogPresence.setPresence(deps)` is called as a property access on the
 * default-export object, resolved at CALL time -- not destructured
 * (`const { setPresence } = gogPresence`), and not passed as the bare reference
 * `runOnceWhenOnline(gogPresence.setPresence)` the deleted source used. Two reasons: (i) the
 * arrow-function wrapper is what makes the inner try/catch and the explicit `.catch` possible at
 * all -- Block E made the same sync-arrow deviation from its deleted `async` callback for the
 * same reason; (ii) a `jest.spyOn(gogPresence, 'setPresence')` can only intercept a call-time
 * property access, so a destructured binding would make the wiring proof (this suite:
 * `gogPresenceBootWire.test.ts`) silently measure nothing.
 *
 * OUT OF SCOPE, filed separately: `deletePresence()` calls `clearInterval(interval)` but never
 * resets `interval` to `undefined`, so after any `deletePresence()` the `if (!interval)` guard in
 * `setPresence()` stays falsy-blocked and the keep-alive cannot re-arm within the same process.
 * That is a REAL, SEPARATE defect, filed as
 * `2026-09-09-deletepresence-never-resets-interval-so-the-keepalive-cannot-re-arm.md` and
 * deliberately NOT fixed here to keep this task atomic. `presence.ts` is untouched by Block H.
 *
 * @public Consumed by sidecar tests through require() in a fresh module registry (D-08),
 * which knip cannot see.
 */
export function setGogPresenceWhenOnline(deps: GOGPresenceDeps): void {
  const { runOnceWhenOnline } = deps.onlineMonitor
  try {
    runOnceWhenOnline(() => {
      try {
        gogPresence.setPresence(deps).catch((error: unknown) => {
          logWarning(
            `[bootstrap] setGogPresenceWhenOnline: gogPresence.setPresence(deps) failed: ${String(error)}`,
            LogPrefix.Backend
          )
        })
      } catch (error) {
        logWarning(
          `[bootstrap] setGogPresenceWhenOnline: callback failed: ${String(error)}`,
          LogPrefix.Backend
        )
      }
    })
  } catch (error) {
    logWarning(
      `[bootstrap] setGogPresenceWhenOnline: could not be started: ${String(error)}`,
      LogPrefix.Backend
    )
  }
}

function runBootSteps(
  ctx: AppContext,
  io: BootIo,
  state: BootState,
  prebuilt: Partial<BootServices>
): void {
  const steps = buildBootSteps(prebuilt)
  const built = steps.map((step) => step.name).join(',')
  if (built !== BOOT_STEP_NAMES.join(',')) {
    throw new Error(`boot step list drifted from BOOT_STEP_NAMES: ${built}`)
  }
  for (const step of steps) step.run(ctx, io, state)
}

// The one sanctioned top-level `let` (D-08/D-13): boot runs once per process, by construction.
let booted = false

/**
 * Runs the ordered boot steps over an `AppContext` built once by the caller (D-01). Streams are
 * injectable (`stream.PassThrough` pairs under test). A second call in one process throws:
 * tests boot once per fresh module registry via `bootFresh()`.
 *
 * @public Consumed by sidecar tests through require() in a fresh module registry (D-08),
 * which knip cannot see.
 */
export function bootSidecar(
  ctx: AppContext,
  input: Readable,
  output: Writable,
  guards: BootGuards,
  prebuilt: Partial<BootServices> = {}
): BootServices {
  if (booted) {
    throw new Error(
      'sidecar boot already ran in this process (D-08): tests boot once per fresh module registry via bootFresh()'
    )
  }
  booted = true
  const state: BootState = {
    i18nReady: Promise.resolve(),
    services: {},
    secretVault: null,
    steamGridKeyringStore: null,
    humbleKeyringStore: null,
    outboundHttp: null,
    shellState: null,
    rpc: null
  }
  runBootSteps(ctx, { input, output, guards }, state, prebuilt)
  return requireServices(state)
}

/**
 * The production path set, derived from the platform layer by `process/appPaths`.
 *
 * @public Consumed by sidecar tests through require() in a fresh module registry (D-08),
 * which knip cannot see.
 */
export function resolveAppPaths(): AppPaths {
  const home = homedir()
  const appData = resolveAppDataDir(process.platform, process.env, home)
  // Same body the platform delegate's getAppPath() has: never throws, resolves to cwd unpackaged.
  const appRoot = process.env.GAMELIB_APP_ROOT || process.cwd()
  const derived = derivePaths({
    appData,
    // CI=e2e (unreachable, D-35-14-01): a name only, no I/O; the 'app-folder' step creates it.
    configRoot:
      process.env.CI === 'e2e'
        ? tmpNameSync({ prefix: 'gamelib-e2e-' })
        : appData,
    home,
    userHome: isSnap ? process.env.SNAP_REAL_HOME! : home,
    flatpakHome: process.env.XDG_DATA_HOME?.replace('/data', '') || home,
    appRoot,
    assetDir:
      isPackagedSidecar() || process.env.CI === 'e2e' ? 'build' : 'public',
    arch: process.arch,
    tempDir: tmpdir()
  })
  // `exe` is defined as an accessor after the spread: an object literal with a getter, spread into
  // another, would run the getter at build time.
  return Object.defineProperty(
    {
      ...derived,
      appRoot,
      appData,
      knownFolder: (name: 'desktop' | 'documents') =>
        resolveKnownFolder(
          name,
          process.platform,
          process.env,
          home,
          readXdgUserDir
        )
    },
    'exe',
    {
      // Lazy: unset GAMELIB_SHELL_EXE throws (T-34.5-02: an empty value must never be written into
      // a shortcut launch command), and boot must not die for a path only shortcut code reads.
      // Returned verbatim, never trimmed or existence-checked: the Tauri shell is the authority
      // for its own path.
      get: () => {
        const shellExe = process.env.GAMELIB_SHELL_EXE
        if (!shellExe) {
          throw new Error(
            '[process/appPaths] exe is unavailable: GAMELIB_SHELL_EXE was not set by the Tauri shell at spawn time'
          )
        }
        return shellExe
      },
      enumerable: true
    }
  ) as AppPaths
}

export function init(
  deps: { guards: BootGuards },
  input: Readable = process.stdin,
  output: Writable = process.stdout
): void {
  bootSidecar(
    createAppContext({
      platform: process.platform,
      paths: resolveAppPaths(),
      appInfo: resolveAppInfo({
        platform: process.platform,
        osRelease: osRelease(),
        isPackaged: isPackagedSidecar()
      }),
      log: createBackendLogSink(),
      baseEnv: process.env
    }),
    input,
    output,
    deps.guards
  )
}

function createBackendLogSink(): LogSink {
  return {
    info: (message) => logInfo(message, LogPrefix.Backend),
    warn: (message) => logWarning(message, LogPrefix.Backend),
    error: (message) => logError(message, LogPrefix.Backend)
  }
}

// Kept LAST in the file: `bootstrapWirings.test.ts` slices from `export function init(` to EOF
// to source-gate the call order of the steps below.
function buildBootSteps(prebuilt: Partial<BootServices>): BootStep[] {
  return [
    {
      name: 'app-folder',
      // The heroic -> GameLib config-folder move and the CI=e2e app folder, ahead of every step that
      // reads under the app folder (D-66.4-04). Synchronous and bounded; holds no handle.
      run: (ctx) => {
        prepareAppFolder(ctx.paths, {
          env: process.env,
          fs: { existsSync, mkdirSync, renameSync },
          dirSync,
          log: (line) => console.log(line),
          logError: (line) => console.error(line)
        })
      }
    },
    {
      name: 'outbound-http-tracking',
      run: (_ctx, _io, state) => {
        // Track outbound HTTP first, ahead of migrations/i18next/boot work, so boot-time requests
        // are tracked too and destroyed at stdin EOF (quick 261110-9w2). One tracker per boot
        // (66.4-15); its diagnostics_channel subscription is the only side effect.
        const outboundHttp = createOutboundHttpTracker()
        outboundHttp.install()
        state.outboundHttp = outboundHttp
      }
    },
    {
      name: 'logger',
      run: (_ctx, io) => {
        initLogger()
        // WR-04 (gap cycle 1): `processGuards.ts` has ZERO static imports so that
        // `src/sidecar/index.ts` can install the unhandledRejection guard as its FIRST
        // import, ahead of this module's own graph (and therefore ahead of
        // `../platform`). The price of that is a logger it cannot import, so the
        // sink is bound here instead -- the first moment `heroicLogWriter` exists. Before
        // this line the guard writes to stderr, which is the only safe channel that early
        // anyway. Adding an import of `logWarning` to `processGuards.ts` instead would
        // reintroduce the boot failure recorded in `727be5dbb`.
        io.guards.setUnhandledRejectionLogSink((message) =>
          logWarning(message, LogPrefix.Backend)
        )
        // D-35-10-01: the `uncaughtException` sibling guard, bound in the same window and
        // for the same WR-04 reason. `logError`, NOT `logWarning` -- this preserves the
        // severity of the Electron handler at `main.ts:618` that plan 35-14 deletes
        // (`logError(err, LogPrefix.Backend)`). A shared sink would have demoted every
        // uncaught exception to a warning. Before this line the guard writes to stderr.
        // Phase 72 D-04: returns the write promise (`logErrorSettled`, same severity) so the
        // now-fatal guard can await the flush before exiting.
        io.guards.setUncaughtExceptionLogSink((message) =>
          logErrorSettled(message, LogPrefix.Backend)
        )
      }
    },
    {
      name: 'sidecar-rpc',
      // The one transport instance of this boot (66.4-15, D-05): rustPending, the output stream
      // and the pre-start line buffer live in its closure. Construction opens no stream and
      // arms nothing; frames pushed before 'rpc-server' starts it are buffered and flushed on
      // start, as before. After 'logger' because the validator's sink is the logger (Phase 67
      // D-09: boundary rejections reach gamelib.log; ipcValidation avoids importing it).
      run: (ctx, _io, state) => {
        state.rpc = createSidecarRpc({
          validator: createIpcValidator({
            now: () => ctx.clock.now(),
            sink: (line) => logWarning(line, LogPrefix.Backend)
          })
        })
      }
    },
    {
      name: 'host-services',
      // Built once, right after the logger: the Tauri-native services that replace the Electron
      // facade. `host.ipc` is the one registry instance (66.1 C-WR-1: no split-brain), built here.
      run: (ctx, _io, state) => {
        const rpc = requireRpc(state)
        state.services.host =
          prebuilt.host ??
          createHostServices({
            platform: ctx.platform,
            ipc: createIpcRegistry(),
            requestRustInvoke: rpc.requestRustInvoke,
            requestOpenExternal: rpc.requestOpenExternal,
            pushFrontendMessage: rpc.pushFrontendMessage,
            openDetached: (url, onError) =>
              ctx.runner.openDetached(url, onError),
            runSync: (cmd, argv, opts) => ctx.runner.runSync(cmd, argv, opts)
          })
      }
    },
    {
      name: 'sign-in-probe-state',
      // Builds the one sign-in epoch fence, outcome map and probe pass of this boot (D-05,
      // D-66.3-13). Construction does no I/O and arms nothing: the outcome handler is registered by
      // 'sign-in-probe-outcomes' and the pass is started by 'sign-in-probe'. Right after 'host-services'
      // (it needs the IPC registry and push) and before 'stores', so the Steam and Humble static
      // holders and every ManagerDeps carry the same instances.
      run: (_ctx, _io, state) => {
        const host = requireHost(state)
        if (prebuilt.signInProbe) {
          state.services.signInProbe = prebuilt.signInProbe
          return
        }
        const epochs = createSignInEpochs()
        const outcomes = createSignInProbeOutcomes({
          ipc: host.ipc,
          push: (channel, payload) =>
            host.pushFrontendMessage(channel, payload),
          epochs
        })
        state.services.signInProbe = {
          epochs,
          outcomes,
          pass: createSignInProbePass({ epochs, outcomes })
        }
      }
    },
    {
      name: 'steam-session-state',
      // Builds the one Steam sign-in session state, auth-unlock latch set, library map and per-session game maps of this boot (D-05,
      // D-66.3-13). Pure in-memory construction: no I/O, timer or handle. Before 'stores' so the
      // SteamUser holder, bound in 'stores' and rebound in 'command-runner', and every ManagerDeps
      // carry the same instances.
      run: (_ctx, _io, state) => {
        state.services.steamSession = prebuilt.steamSession ?? {
          signIn: createSteamSignInState(),
          authTrigger: createSteamAuthTrigger(),
          libraryState: createSteamLibraryState(),
          gameSession: createSteamGameSessionState()
        }
      }
    },
    {
      name: 'steam-token-store',
      // Builds the one Steam token store slot of this boot (D-05, 66.4-07). Construction only: the slot
      // starts on the fail-closed UnconfiguredTokenStore and the 'secret-stores' step configures it
      // (T-28-10 ordering). No I/O, timer or handle. Before 'stores' so the SteamUser built in
      // 'steam-user' and every ManagerDeps carry the same slot.
      run: (_ctx, _io, state) => {
        state.services.tokenStore =
          prebuilt.tokenStore ??
          createTokenStoreSlot({
            log: (message) => logInfo(message, LogPrefix.Steam)
          })
      }
    },
    {
      name: 'steam-anonymous-client',
      // Builds the one anonymous CM client owner of this boot (D-05, D-66.3-14). Construction
      // connects nothing and arms no timer: the connect is lazy (first `get`), bounded, and its
      // idle-close timer runs on the boot clock (unref'd). Released at stdin EOF through
      // releaseOnStdinEof. Before 'stores' so the SteamUser holder carries the same instance.
      run: (ctx, _io, state) => {
        state.services.anonymousClient =
          prebuilt.anonymousClient ??
          createAnonymousClient({
            clock: ctx.clock,
            createClient: createRawAnonymousClient
          })
      }
    },
    {
      name: 'bridge-helper-registry',
      // Builds the one bridge-helper registry of this boot (D-05, D-66.3-14): the per-appId helper
      // map and the exit teardown. Construction spawns nothing and installs no listener (the
      // process 'exit' teardown is added on the first spawn). The wait schedule, helper path and
      // spawn env are the production values; a test hands the boot a prebuilt registry.
      run: (ctx, _io, state) => {
        state.services.bridgeHelpers =
          prebuilt.bridgeHelpers ??
          createBridgeHelperRegistry({
            steamWaitSchedule: DEFAULT_STEAM_WAIT_SCHEDULE,
            helperPath: () => ctx.paths.steamBridgeHelperPath,
            spawnEnv: () => process.env
          })
      }
    },
    {
      name: 'stores',
      // Builds every store family against ONE per-boot registry (66.1 plan 25, A3); that registry
      // is what the name-keyed store RPC handlers resolve through. Store construction opens no
      // timer, watcher or handle.
      run: (ctx, _io, state) => {
        // Stores and registry are a pair: the registry the RPC handlers resolve through must be
        // the one the stores registered into. Take both from `prebuilt` or build both, so one
        // can never drift from the other (C-IN-4). The root joins them: prebuilt stores are
        // useless without the root they write and notify through, and the write handlers bind
        // the renderer push on it. A root given alone is honoured and the stores are built on it.
        if (!prebuilt.stores !== !prebuilt.storeRegistry) {
          throw new Error(
            'boot: prebuilt.stores and prebuilt.storeRegistry must be given together'
          )
        }
        if (prebuilt.stores && !prebuilt.storeRoot) {
          throw new Error(
            'boot: prebuilt.stores needs the prebuilt.storeRoot it was built on'
          )
        }
        // The one place a store directory is decided: every store resolves under it.
        const root =
          prebuilt.storeRoot ??
          createStoreRoot({ userData: ctx.paths.userData })
        state.services.storeRoot = root
        if (prebuilt.stores && prebuilt.storeRegistry) {
          state.services.stores = prebuilt.stores
          state.services.storeRegistry = prebuilt.storeRegistry
        } else {
          const registry = createStoreRegistry()
          state.services.stores = createStores({ registry, root })
          state.services.storeRegistry = registry
        }
      }
    },
    {
      name: 'migrations',
      run: (ctx, _io, state) => {
        // ---- Data migrations (todo 2026-08-16, quick task 260822-s8y) -----------
        // Mirrors `main.ts:412`'s `await MigrationSystem.get().applyMigrations()`, which the headless
        // sidecar never runs -- the same class of gap as `initOnlineMonitor()` below.
        //
        // Placement: FIRST after `initLogger()`, matching Electron's ordering (migrations are the
        // very next statement after its own `initLogger()`), and required to be after it because
        // `applyMigration` calls `logInfo`/`logError` unconditionally and `heroicLogWriter` is unset
        // until `initLogger()` runs (the standing sidecar-logger finding).
        //
        // WHAT THIS DELIBERATELY DOES NOT REPRODUCE, and why. Electron AWAITS migrations before
        // `initStoreManagers()`. The sidecar cannot: `./handlers` (Step 2, above) is imported at
        // MODULE SCOPE, long before `init()` is ever called, so every store manager already exists by
        // the time this line runs -- and `initStoreManagers()` is itself dead under Tauri. `init()` is
        // also synchronous by contract (`src/sidecar/index.ts` and ~10 test suites call it as such),
        // so the promise is floated the way `fetchLastestReleases()` below is.
        //
        // The real constraint is narrower than Electron's: migrations must finish before the FIRST
        // read of `legendaryConfigPath`, which arrives as an RPC call after the READY_SENTINEL write
        // below. READY is deliberately NOT delayed on this promise. That is a known, bounded
        // limitation rather than a proof of safety: `LegendaryGlobalConfigFolderMigration` only does
        // any work when `legendaryConfigPath` is ABSENT -- i.e. the user has never logged into Epic in
        // GameLib -- so a read that loses the race finds nothing, which is precisely today's
        // behaviour, and the copy is local filesystem I/O begun milliseconds into boot. A migration
        // that ever needs a hard happens-before guarantee against a handler will need `init()` to
        // become async; do not assume this placement covers that case.
        try {
          // 'stores' runs before this step (pinned by bootSourceShape): same migrationsStore instance.
          const { stores } = state.services
          if (!stores) throw new Error('stores step has not run')
          new MigrationSystem({ stores, paths: ctx.paths })
            .applyMigrations()
            .catch((error: unknown) => {
              logWarning(
                `[bootstrap] applyMigrations() failed: ${String(error)}`,
                LogPrefix.Backend
              )
            })
        } catch (error) {
          logWarning(
            `[bootstrap] applyMigrations() could not be started: ${error}`,
            LogPrefix.Backend
          )
        }
      }
    },
    {
      name: 'config',
      run: (ctx, _io, state) => {
        // Placement is load-bearing: AFTER 'logger' and 'migrations', BEFORE 'command-runner' and
        // 'i18n'. This builds the process's first-ever global-config read, and the
        // config-version-upgrade path (config.ts:145/152) can itself call `logInfo`/`logError`
        // synchronously, which throws while `heroicLogWriter` is unset (same ordering reason as
        // `initOnlineMonitor()`'s and `tokenStore.configure()`'s placement comments below).
        // MigrationSystem's only migration copies the legendary config folder and never writes
        // config.json, so running after 'migrations' loses nothing. configBootOrder.test.ts pins it.
        // createGlobalConfig() runs the settings migration first; the per-game registry holds its
        // cache in its closure and reads global defaults through the config built here.
        const config =
          prebuilt.config ??
          createGlobalConfig({
            versioning: requireStoreRoot(state).versioning,
            paths: prebuilt.paths ?? ctx.paths,
            requestRustInvoke: requireHost(state).requestRustInvoke,
            // The bus is built by the later 'app-runtime' step; a setting can only change at call time.
            onSettingChanged: (change) =>
              requireAppRuntime(state).events.emit('settingChanged', change)
          })
        state.services.config = config
        state.services.gameConfigs =
          prebuilt.gameConfigs ??
          createGameConfigs({
            config,
            versioning: requireStoreRoot(state).versioning,
            paths: prebuilt.paths ?? ctx.paths
          })
        state.services.paths = prebuilt.paths ?? ctx.paths
        state.services.appInfo = prebuilt.appInfo ?? ctx.appInfo
      }
    },
    {
      name: 'secret-vault',
      // Decides, once, whether this boot uses the dev-only plaintext vault (D-66.3-01, T-66.3-56).
      // After 'logger' (the vault logs) and before every secret owner. Local file I/O only, no
      // RPC, so it needs no transport; the keyring arm needs none at construction either (the
      // keyring is touched only by the migrations in 'secret-stores', after 'rpc-server').
      run: (ctx, _io, state) => {
        state.secretVault = createDevSecretVault(ctx.paths)
      }
    },
    {
      name: 'steamgrid-secrets',
      // Builds the one SteamGridDB API-key owner of this boot (D-05, C-WR-2) over the selected
      // store, before 'register-handlers' so the enrichment registration receives it. Construction
      // does no I/O; the one-time migration stays in 'secret-stores' after 'rpc-server' (T-28-10).
      run: (_ctx, _io, state) => {
        let store
        if (state.secretVault) {
          store = state.secretVault.steamGridDbSecretStore
        } else {
          state.steamGridKeyringStore = createSidecarSteamGridDbSecretStore(
            requireHost(state).requestRustInvoke
          )
          store = state.steamGridKeyringStore
        }
        state.services.steamGridSecrets =
          prebuilt.steamGridSecrets ?? createSteamGridDbSecrets({ store })
      }
    },
    {
      name: 'steam-bottle',
      // Builds the one Steam bottle helper instance of this boot (D-05, D-66.3-15), replacing the
      // static bottle-stores holder. Needs the bottle config store ('stores') and the global
      // config ('config'); construction reads and writes nothing, so it adds no I/O to boot.
      run: (ctx, _io, state) => {
        const { stores, config } = state.services
        if (!stores) throw new Error('boot: stores step must run first')
        if (!config) throw new Error('boot: config step must run first')
        state.services.steamBottle =
          prebuilt.steamBottle ??
          createSteamBottle({
            stores,
            config,
            paths: ctx.paths,
            // 'engine-runtime' runs after this step: resolve the locator at call time.
            crossover: {
              resolveCrossoverBinDir: (opts) =>
                requireEngineRuntime(state).crossover.resolveCrossoverBinDir(
                  opts
                ),
              resolveCrossoverBinDirAsync: (d, opts) =>
                requireEngineRuntime(
                  state
                ).crossover.resolveCrossoverBinDirAsync(d, opts)
            }
          })
      }
    },
    {
      name: 'abort-registry',
      // Builds the abort-controller registry and the Wine window raiser of this boot (D-05, 66.4-13).
      // No I/O, no timer, no handle: the raiser arms its (unref'd, ctx.clock) timers only when a game
      // launches. After 'steam-bottle', before 'command-runner' (which registers its commands in it) and 'engine-runtime'
      // (the Steam engine download registers in it). Stdin EOF aborts the registry
      // ('rpc-server' wires releaseOnStdinEof) after pausing the download queue.
      run: (ctx, _io, state) => {
        state.services.aborts = prebuilt.aborts ?? createAbortRegistry()
        state.services.windowRaiser =
          prebuilt.windowRaiser ?? createWineWindowRaiser({ clock: ctx.clock })
      }
    },
    {
      name: 'app-runtime',
      // Builds the app runtime of this boot (D-05, 66.4-17): event bus, frontend-ready flag, launch
      // single-flight, image fetches, CrossOver index fetch and memo, overlay install single-flight.
      // Construction only: no I/O, no timer, no listener. After 'abort-registry', before
      // 'store-managers' (and every consumer of the bus, flags and flights).
      run: (ctx, _io, state) => {
        state.services.appRuntime =
          prebuilt.appRuntime ??
          createAppRuntime({ clock: ctx.clock, paths: ctx.paths })
      }
    },
    {
      name: 'misc-runtime',
      // Builds the misc runtime of this boot (D-05, 66.4-18): the metadata-override push (its notifier
      // is a constructor dependency, over this boot's frontend push), the Mac arch prompt chain and the
      // CheapShark store-map cache. Construction only: no I/O, no timer, no handle. Directly after
      // 'app-runtime', before 'store-managers' (ManagerDeps carries it) and 'register-handlers'.
      run: (_ctx, _io, state) => {
        const host = requireHost(state)
        state.services.miscRuntime =
          prebuilt.miscRuntime ??
          createMiscRuntime({
            metadataChanged: (overrides) => {
              try {
                host.pushFrontendMessage('metadataChanged', overrides)
              } catch (error) {
                logWarning(
                  `[bootstrap] metadataChanged push failed: ${error instanceof Error ? error.message : String(error)}`,
                  LogPrefix.Backend
                )
              }
            }
          })
      }
    },
    {
      name: 'command-runner',
      run: (ctx, _io, state) => {
        const { aborts } = state.services
        if (!aborts)
          throw new Error('command-runner step ran before abort-registry')
        const errorHandlerDeps: ErrorHandlerDeps = {
          get libraryManagers() {
            return requireServices(state).managers.library
          },
          get dialogs() {
            return requireHost(state).dialogs
          },
          get appState() {
            return requireHost(state).appState
          },
          get sendFrontendMessage() {
            return requireHost(state).sendFrontendMessage
          }
        }
        state.services.runner = prebuilt.runner ?? ctx.runner
        state.services.clock = ctx.clock
        // Built once per boot; starts nothing (the 'steam-running-poll' step arms the poller's
        // interval, the monitors spawn per polled install), so the exit contract holds.
        const { config } = state.services
        if (!config) throw new Error('boot: config step must run first')
        state.services.steamProcesses =
          prebuilt.steamProcesses ??
          createSteamProcesses({
            runner: ctx.runner,
            clock: ctx.clock,
            platform: ctx.platform,
            config,
            openExternal: requireHost(state).openExternal,
            paths: ctx.paths,
            versioning: requireStoreRoot(state).versioning,
            aborts,
            sendFrontendMessage: requireHost(state).sendFrontendMessage,
            requestRustInvoke: requireHost(state).requestRustInvoke
          })
        state.services.commandRunner =
          prebuilt.commandRunner ??
          createCommandRunner({
            runner: ctx.runner,
            platform: ctx.platform,
            logger: {
              logInfo,
              logWarning,
              logError,
              logDebug,
              backendPrefix: LogPrefix.Backend
            },
            getRunnerLogWriter: (runner) =>
              getRunnerLogWriter(runner, {
                disableLogs: config.getSettings().disableLogs
              }),
            abort: {
              create: (id) => aborts.create(id),
              remove: (id) => aborts.delete(id)
            },
            // CommandRunnerDeps keeps its (error, appName, runner) shape; the manager table is
            // read only in errorHandler's deleted-folder branch, after boot, like the
            // commandToArgsArray closure below ('command-runner' runs before 'store-managers').
            errorHandler: (error, appName, runner) =>
              errorHandler(errorHandlerDeps, error, appName, runner),
            searchForExecutableOnPath,
            // Read lazily: 'command-runner' runs before 'store-managers', and the closure only
            // fires after boot has completed.
            commandToArgsArray: (command) =>
              requireServices(
                state
              ).managers.library.legendary.commandToArgsArray(command),
            wine: {
              getDefaultSettings: () =>
                requireServices(state).config.getSettings(),
              // The runner built below: wineboot goes through it, not a legacy launcher function.
              verifyWinePrefix: (settings) => {
                const { commandRunner } = state.services
                if (!commandRunner) throw new Error('command runner not built')
                return verifyWinePrefix(
                  { commandRunner, paths: ctx.paths },
                  settings
                )
              },
              validWine,
              setupEnvVars,
              setupWineEnvVars: (settings, gameId) =>
                setupWineEnvVars({ paths: ctx.paths }, settings, gameId),
              isUmuSupported: (settings) =>
                isUmuSupported({ paths: ctx.paths }, settings),
              getUmuPath: () => getUmuPath({ paths: ctx.paths })
            }
          })
        state.services.spawnAsync =
          prebuilt.spawnAsync ?? createSpawnAsync({ runner: ctx.runner })
        state.services.quit =
          prebuilt.quit ??
          createQuitHandler({
            runner: ctx.runner,
            isLocked: () => existsSync(join(ctx.paths.gamesConfigPath, 'lock')),
            // Read lazily: this handler is built before 'download-queue' and only fires after boot.
            isRunning: () => requireServices(state).downloadQueue.isRunning(),
            isBridgeHosting: () => requireBridgeHelpers(state).hasLive(),
            showMessageBox: (opts) =>
              requireHost(state).dialogs.showMessageBox(opts),
            t: tOrFallback,
            abortAll: () => aborts.abortAll(),
            releaseSteam: async () => {
              // Anonymous client first, then the authenticated session; the session release
              // still runs when the anonymous release throws.
              try {
                state.services.anonymousClient?.releaseForShutdown()
              } finally {
                await state.services.steamUser?.releaseForShutdown()
              }
            },
            deletePresence: () =>
              gogPresence.deletePresence(gogPresenceDeps(state)),
            exit: () => requireHost(state).appState.exit()
          })
      }
    },
    {
      name: 'steam-user',
      // Builds the one authenticated Steam session owner of this boot (D-05, D-66.3-16),
      // replacing the static SteamUser class. After 'command-runner' (the Mac Steam go-offline
      // instance exists there), before 'store-managers' and 'rpc-server' (the EOF release).
      // Construction connects nothing and arms no timer: the logon is lazy and the idle-close
      // timer runs on the boot clock, unref'd (exit contract).
      run: (_ctx, _io, state) => {
        const {
          stores,
          config,
          clock,
          steamProcesses,
          signInProbe,
          steamSession,
          tokenStore,
          anonymousClient
        } = state.services
        if (!stores) throw new Error('boot: stores step must run first')
        if (!config) throw new Error('boot: config step must run first')
        if (!clock || !steamProcesses)
          throw new Error('boot: command-runner step must run first')
        if (!signInProbe || !steamSession || !tokenStore || !anonymousClient)
          throw new Error(
            'boot: sign-in / steam-session / anonymous steps must run first'
          )
        state.services.steamUser =
          prebuilt.steamUser ??
          createSteamUser({
            stores,
            signIn: signInProbe,
            steamSession,
            tokenStore,
            anonymousClient,
            macSteamOffline: steamProcesses.macSteamOffline,
            clock,
            config,
            sendFrontendMessage: requireHost(state).sendFrontendMessage
          })
      }
    },
    {
      name: 'humble-services',
      // Builds the Humble user, library, sync fence and login-window seam slot of this boot (D-05,
      // D-66.3-17), replacing the static holders. Path taken: EARLY CONSTRUCTION, before
      // 'store-managers' (ManagerDeps carries the seam slot) and 'register-handlers'. It is possible
      // because the store choice (keyring vs dev vault) is made in 'secret-vault' and the keyring
      // store's construction does no I/O: the keyring is touched only by the one-time migration in
      // 'secret-stores', after 'rpc-server' (T-28-10). The seam slot starts empty; the
      // rustInvoke-backed seam is installed by registerHumbleLoginFlows, before any handler runs.
      run: (_ctx, _io, state) => {
        const { stores, signInProbe, steamUser, appInfo } = state.services
        if (!stores) throw new Error('boot: stores step must run first')
        if (!appInfo) throw new Error('boot: config step must run first')
        if (!signInProbe || !steamUser)
          throw new Error(
            'boot: sign-in-probe-state / steam-user steps must run first'
          )
        let secretStore
        if (state.secretVault) {
          secretStore = state.secretVault.humbleSecretStore
        } else {
          state.humbleKeyringStore = createSidecarHumbleSecretStore(
            requireHost(state).requestRustInvoke
          )
          secretStore = state.humbleKeyringStore
        }
        state.services.humble =
          prebuilt.humble ??
          createHumbleServices({
            stores,
            secretStore,
            steamUser,
            signInOutcomes: signInProbe.outcomes,
            appInfo,
            sendFrontendMessage: requireHost(state).sendFrontendMessage
          })
      }
    },
    {
      name: 'online-monitor-owner',
      // Builds the one monitor of this boot (D-05). Construction does no I/O: the listeners, the
      // handler and the first probe belong to the 'online-monitor' step (start()), whose position
      // after rpc-server and before READY is load-bearing. Before 'store-managers' so ManagerDeps
      // can carry the slice.
      run: (ctx, _io, state) => {
        const host = requireHost(state)
        const monitor: OnlineMonitor =
          prebuilt.onlineMonitor ??
          createOnlineMonitor({
            // The same fresh check Play uses; the monitor re-runs it while 'online'.
            freshOfflineCheck: () =>
              checkConnectivityNow('periodic watch', monitor),
            clock: ctx.clock,
            ipc: host.ipc,
            push: (channel, payload) =>
              host.pushFrontendMessage(channel, payload),
            head: (url, opts) => axios.head(url, opts),
            newEpoch: randomUUID
          })
        state.services.onlineMonitor = monitor
      }
    },
    {
      name: 'engine-state',
      // Builds the one engine decision/notice owner of this boot (D-05, D-66.3-12). Construction
      // does no I/O and arms no timers; the notice store is read from 'stores' on first use. Before
      // 'store-managers' so ManagerDeps and the launcher can carry it.
      run: (ctx, _io, state) => {
        const host = requireHost(state)
        const { stores } = state.services
        if (!stores) throw new Error('boot: stores step must run first')
        state.services.engineState =
          prebuilt.engineState ??
          createEngineState({
            publish: (engineState) =>
              host.pushFrontendMessage('engineStateChanged', engineState),
            now: () => ctx.clock.now(),
            isMac: () => isMac,
            noticeStore: () => stores.engine.noticeStore
          })
      }
    },
    {
      name: 'engine-runtime',
      // Builds the one engine runtime of this boot (D-05, 66.4-05): ledger, selection registry,
      // launch overlay contexts, launch deadlines, switch / bottle-creation / pinned-download
      // single-flight maps, the CrossOver bin-dir memo. Construction only allocates empty maps: no
      // I/O and no timer (deadlines run on ctx.clock, whose timers are unref'd). After 'engine-state'
      // and before 'store-managers' so ManagerDeps and the launcher carry it.
      run: (ctx, _io, state) => {
        state.services.engineRuntime =
          prebuilt.engineRuntime ??
          createEngineRuntime({
            clock: ctx.clock,
            paths: ctx.paths,
            aborts: requireAborts(state)
          })
      }
    },
    {
      name: 'steam-launch-runtime',
      // Builds the one Steam launch-path runtime of this boot (D-05, 66.4-06): bottle process monitors,
      // the bottled-Steam raise loop, the DRM / overlay runner registry, the DRM-mode notice latch and
      // the platform-capture chain. Construction allocates empty collections only: no I/O and no timer;
      // the monitor and raise-loop timers a launch arms later run on ctx.clock, whose timers are
      // unref'd, so nothing here can hold the sidecar open at stdin EOF. After 'engine-runtime' and
      // before 'store-managers' so ManagerDeps carries it.
      run: (ctx, _io, state) => {
        state.services.steamLaunchRuntime =
          prebuilt.steamLaunchRuntime ??
          createSteamLaunchRuntime({ clock: ctx.clock })
      }
    },
    {
      name: 'steam-bridge-runtime',
      // Builds the one Steam bridge runtime of this boot (D-05, 66.4-08): the DRM and overlay runner
      // clone single-flight maps, the loader-entitlement plist counter and the shared-redist install
      // map with its ledger tmp sequence. Construction allocates empty maps and counters only: no I/O,
      // no timer, no handle, so the sidecar exit contract holds. After 'steam-launch-runtime' and before
      // 'store-managers' so ManagerDeps carries it.
      run: (_ctx, _io, state) => {
        state.services.bridgeRuntime =
          prebuilt.bridgeRuntime ??
          createBridgeRuntime({
            aborts: requireAborts(state),
            versioning: requireStoreRoot(state).versioning
          })
      }
    },
    {
      name: 'steam-install-runtime',
      // Builds the one Steam install runtime of this boot (D-05, 66.4-09): the depot appinfo order tap,
      // the CDN auth schema cache, the shared-redist lock table, the Rust depot job registry, the install
      // and uninstall poll registries and the restart-hold bookkeeping. Construction allocates empty maps,
      // sets and counters only: no I/O, no timer, no handle, so the sidecar exit contract holds. After
      // 'steam-bridge-runtime' and before 'store-managers' so ManagerDeps carries it. Depot jobs and poll
      // timers are released at stdin EOF by the install AbortControllers and the poll's own unref'd interval.
      run: (_ctx, _io, state) => {
        state.services.steamInstallRuntime =
          prebuilt.steamInstallRuntime ??
          createSteamInstallRuntime({
            requestRustInvoke: requireHost(state).requestRustInvoke,
            sendFrontendMessage: requireHost(state).sendFrontendMessage,
            appRuntime: requireAppRuntime(state)
          })
      }
    },
    {
      name: 'gog-runtime',
      // Builds the one GOG runtime of this boot (D-05, 66.4-10): the library and installed-game maps, the
      // presence keep-alive slot, the resume-progress baselines, the credential cache with its single
      // in-flight spawn and the e2e gogdl stub slot. Construction allocates empty maps and counters only:
      // no I/O, no timer, no handle, so the sidecar exit contract holds; the presence interval is armed
      // later by 'gog-presence' on the boot clock (unref'd). After 'steam-install-runtime' and before
      // 'store-managers' so ManagerDeps carries it.
      run: (ctx, _io, state) => {
        state.services.gogRuntime =
          prebuilt.gogRuntime ?? createGogRuntime({ clock: ctx.clock })
      }
    },
    {
      name: 'legendary-runtime',
      // Builds the one Legendary runtime of this boot (D-05, 66.4-11): the in-memory library, installed
      // and account-game collections plus the e2e legendary stub slot. Construction allocates empty
      // collections only: no I/O, no timer, no handle. After 'gog-runtime' and before 'store-managers'.
      run: (_ctx, _io, state) => {
        state.services.legendaryRuntime =
          prebuilt.legendaryRuntime ?? createLegendaryRuntime()
      }
    },
    {
      name: 'nile-runtime',
      // Builds the one Nile runtime of this boot (D-05, 66.4-11): the login-data single-flight and the
      // e2e nile stub slot. No I/O, no timer, no handle. After 'legendary-runtime', before 'store-managers'.
      run: (_ctx, _io, state) => {
        state.services.nileRuntime = prebuilt.nileRuntime ?? createNileRuntime()
      }
    },
    {
      name: 'info-caches',
      // Builds the system-information and HowLongToBeat credential caches of this boot (D-05, 66.4-12).
      // No I/O, no timer, no handle: each cache fetches on first use. After 'nile-runtime', before 'store-managers'.
      run: (_ctx, _io, state) => {
        state.services.infoCaches = prebuilt.infoCaches ?? {
          systemInfo: createSystemInfoCache(),
          hltb: createHltbCredentials()
        }
      }
    },
    {
      name: 'tools-state',
      // Builds the tools' one single-flight slot, catalog and script-metadata caches and winetricks
      // environment reports (D-05, D-66.2-03, 66.4-14). Allocates a Map and closures: no I/O, timer
      // or handle. Directly before 'winetricks-queue', which reads the slot and the reports.
      run: (_ctx, _io, state) => {
        state.services.toolsState = prebuilt.toolsState ?? createToolsState()
      }
    },
    {
      name: 'winetricks-queue',
      // Builds the one winetricks apply queue of this boot (D-05, D-66.3-12). Construction does no
      // I/O and arms no timer: it only subscribes to the environment-report change signal. Before
      // 'store-managers' (requireServices needs every field once the managers exist) and
      // 'register-handlers', which hands it to the Wine-tools registration.
      run: (_ctx, _io, state) => {
        const host = requireHost(state)
        const toolsState = requireToolsState(state)
        state.services.winetricksQueue =
          prebuilt.winetricksQueue ??
          createWinetricksQueue({
            push: (channel, queueState) =>
              host.pushFrontendMessage(channel, queueState),
            sendGameStatus: (update) =>
              sendGameStatusUpdate(
                {
                  sendFrontendMessage: host.sendFrontendMessage,
                  appRuntime: requireAppRuntime(state)
                },
                update
              ),
            getInstallingComponent: () => toolsState.installing.get(),
            environment: toolsState.winetricksEnv
          })
      }
    },
    {
      name: 'store-managers',
      run: (ctx, _io, state) => {
        const { stores, commandRunner, spawnAsync, runner } = state.services
        const {
          config,
          gameConfigs,
          paths,
          appInfo,
          host,
          onlineMonitor,
          engineState,
          engineRuntime,
          steamLaunchRuntime,
          bridgeRuntime,
          steamInstallRuntime,
          gogRuntime,
          legendaryRuntime,
          nileRuntime,
          infoCaches,
          aborts,
          appRuntime,
          miscRuntime,
          windowRaiser,
          toolsState,
          signInProbe,
          steamSession,
          tokenStore,
          anonymousClient,
          bridgeHelpers,
          steamBottle,
          steamUser,
          humble
        } = state.services
        if (
          !stores ||
          !commandRunner ||
          !spawnAsync ||
          !runner ||
          !config ||
          !gameConfigs ||
          !paths ||
          !appInfo ||
          !host ||
          !onlineMonitor ||
          !engineState ||
          !engineRuntime ||
          !steamLaunchRuntime ||
          !bridgeRuntime ||
          !steamInstallRuntime ||
          !gogRuntime ||
          !legendaryRuntime ||
          !nileRuntime ||
          !infoCaches ||
          !aborts ||
          !appRuntime ||
          !miscRuntime ||
          !windowRaiser ||
          !toolsState ||
          !signInProbe ||
          !steamSession ||
          !tokenStore ||
          !anonymousClient ||
          !bridgeHelpers ||
          !steamBottle ||
          !steamUser ||
          !humble
        ) {
          throw new Error(
            'store-managers step ran before stores/command-runner/config/host-services'
          )
        }
        // The 'download-queue' step runs after this one, so the managers reach the queue through
        // an accessor resolved when they enqueue; never read state.services.downloadQueue here.
        // `runner: ctx.runner` is the runner commandRunner is built on: spawn and stop share one
        // registry.
        if (prebuilt.managers && prebuilt.launcher) {
          state.services.managers = prebuilt.managers
          state.services.launcher = prebuilt.launcher
          return
        }
        const built = createStoreManagers({
          stores,
          commandRunner,
          spawnAsync,
          runner,
          clock: ctx.clock,
          steamProcesses: requireSteamProcesses(state),
          getDownloadQueue: () => requireServices(state).downloadQueue,
          versioning: requireStoreRoot(state).versioning,
          config,
          gameConfigs,
          paths,
          appInfo,
          dialogs: host.dialogs,
          sendFrontendMessage: host.sendFrontendMessage,
          requestRustInvoke: host.requestRustInvoke,
          openExternal: host.openExternal,
          notifications: host.notifications,
          appState: host.appState,
          imageTools: host.imageTools,
          onlineMonitor,
          engineState,
          engineRuntime,
          steamLaunchRuntime,
          bridgeRuntime,
          steamInstallRuntime,
          gogRuntime,
          legendaryRuntime,
          nileRuntime,
          infoCaches,
          aborts,
          appRuntime,
          miscRuntime,
          windowRaiser,
          toolsState,
          signIn: signInProbe,
          steamSession,
          tokenStore,
          anonymousClient,
          bridgeHelpers,
          steamBottle,
          steamUser,
          loginWindowSeam: humble.loginWindowSeam
        })
        state.services.managers = prebuilt.managers ?? built
        state.services.launcher = prebuilt.launcher ?? built.launcher
      }
    },
    {
      name: 'download-queue',
      // Builds the queue and registers one connectivity listener: no timer, watcher, socket or
      // child, so nothing here can hold the loop (exit contract).
      run: (_ctx, _io, state) => {
        const { stores, managers } = state.services
        if (!stores || !managers) {
          throw new Error('download-queue step ran before store-managers')
        }
        let queue = prebuilt.downloadQueue
        if (!queue) {
          const {
            host,
            config,
            onlineMonitor,
            steamSession,
            steamBottle,
            engineRuntime,
            steamLaunchRuntime,
            aborts,
            appRuntime,
            paths
          } = state.services
          if (
            !host ||
            !config ||
            !onlineMonitor ||
            !steamSession ||
            !steamBottle ||
            !engineRuntime ||
            !steamLaunchRuntime ||
            !aborts ||
            !appRuntime ||
            !paths
          ) {
            throw new Error(
              'download-queue step ran before host-services/config/online-monitor-owner/steam-session-state'
            )
          }
          queue = createDownloadQueue({
            stores,
            managers,
            onlineMonitor,
            config,
            dialogs: host.dialogs,
            appState: host.appState,
            notifications: host.notifications,
            sendFrontendMessage: host.sendFrontendMessage,
            requestRustInvoke: host.requestRustInvoke,
            steamSession,
            steamBottle,
            engineRuntime,
            steamLaunchRuntime,
            aborts,
            appRuntime,
            paths
          })
          queue.start()
        }
        state.services.downloadQueue = queue
        // No System Information dump at boot (A-CR-1): the full probe set is lazy (getSystemInfo
        // RPC). Only cheap static facts are logged.
        logBootFacts()
      }
    },
    {
      name: 'shell-exe-receipt',
      run: () => {
        // ---- Boot-time receipt logging (Phase 34.5 G-3, plan 34.5-18) -----------
        // Logs the GAMELIB_SHELL_EXE value the SIDECAR ACTUALLY RECEIVED, not what the Rust shell's
        // own `eprintln!` at main.rs:1231 CLAIMS it sent (that line only ever reaches the shell
        // process's own stderr -- the `pnpm tauri:dev` terminal -- never `gamelib.log`). The child's
        // own observation is strictly stronger evidence: it proves what appPaths can actually see,
        // not merely what the parent set on the spawn call. `34.5-LIVE-GATE.md` precondition 5 cites
        // this exact prefix (`GAMELIB_SHELL_EXE received=`) as its evidence source -- the gate's
        // re-run reads it from here, not the terminal.
        //
        // Reads `process.env.GAMELIB_SHELL_EXE` directly rather than the `exe` path accessor,
        // which THROWS on an unset/empty value (T-34.5-01) -- this diagnostic must report an unset
        // value, never crash boot trying to report it. Placement (after `initLogger()` above, before
        // `output.write(READY_SENTINEL)` below) is load-bearing per the standing
        // `sidecar-console-and-logger-are-invisible` finding: anything logged before `initLogger()`
        // throws into a swallowed rejection, and the sidecar's stdout IS the RPC pipe, so `console.*`
        // is invisible too. Wrapped in try/catch -- a diagnostic must never fail boot (T-34.5-G3-02).
        try {
          const shellExeReceived = process.env.GAMELIB_SHELL_EXE
          if (shellExeReceived) {
            logInfo(
              `[bootstrap] GAMELIB_SHELL_EXE received=${shellExeReceived}`,
              LogPrefix.Backend
            )
          } else {
            logWarning(
              '[bootstrap] GAMELIB_SHELL_EXE received=<UNSET>',
              LogPrefix.Backend
            )
          }
        } catch (error) {
          logWarning(
            `[bootstrap] Failed to log GAMELIB_SHELL_EXE receipt: ${error}`,
            LogPrefix.Backend
          )
        }
      }
    },
    {
      name: 'asset-root-check',
      run: (ctx) => {
        // ---- Boot-time asset-root self-check (Phase 34.5 G-1/G-3, plan 34.5-18) -------------------
        // Makes plan 34.5-16's GAMELIB_APP_ROOT handoff observable at the exact boot moment, before
        // any login can be attempted: on 2026-08-01 the `spawn ./{legendary,gogdl,nile} ENOENT` lines
        // fired at 00:06:26, six seconds before the first login interaction at 00:06:32
        // (`34.5-LIVE-GATE.md`'s "Root cause" section) -- this diagnosis must be present by then, so
        // it runs directly after the receipt log above and before the i18next block below (the first
        // other startup diagnostic, and cannot be outrun by a login attempt).
        //
        // This is the FOURTH recurrence of the `publicdir-getapppath-chunking` family. The `locales`
        // existsSync warning immediately below (D-02) already half-knew this in 2026 -- it added a
        // loud existsSync check for ONE publicDir-relative consumer and never generalised the
        // implication to every other one (`bin/`, the most costly). This block is that
        // generalisation, named here so a future reader sees the lesson at the exact site where it
        // was previously missed.
        //
        // Deliberately does NOT import `archSpecificBinary` (private to `utils.ts`) -- widening that
        // module's public surface just for a diagnostic costs more than duplicating its four-line
        // join here, and `appRootResolution.test.ts`'s real-filesystem block is what keeps the two
        // resolutions honest (it fails if they diverge). Under the packaged Tauri build this check is
        // EXPECTED to report `exists=false` until residual R-34.5-G1-PKG (`34.5-16-SUMMARY.md`) is
        // resolved -- that is the point of this check: loud, not silent. Wrapped in try/catch -- a
        // diagnostic must never fail boot (T-34.5-G3-02).
        try {
          const appRootEnv = process.env.GAMELIB_APP_ROOT
          const appRootSource = appRootEnv ? 'GAMELIB_APP_ROOT' : 'process.cwd'
          logInfo(
            `[bootstrap] appRoot resolved=${ctx.paths.appRoot} source=${appRootSource}`,
            LogPrefix.Backend
          )

          const publicDirExists = existsSync(ctx.paths.publicDir)
          logInfo(
            `[bootstrap] publicDir resolved=${ctx.paths.publicDir} exists=${publicDirExists}`,
            LogPrefix.Backend
          )

          let assetMissing = !publicDirExists
          for (const runnerBinaryName of [
            'legendary',
            'gogdl',
            'nile',
            'comet'
          ]) {
            // Mirrors archSpecificBinary's own arch-native-first, x64-fallback resolution
            // (utils.ts:517-527) without importing it -- see comment above.
            const archNativePath = join(
              ctx.paths.publicDir,
              'bin',
              process.arch,
              process.platform,
              runnerBinaryName
            )
            const x64FallbackPath = join(
              ctx.paths.publicDir,
              'bin',
              'x64',
              process.platform,
              runnerBinaryName
            )
            const resolvedRunnerPath = existsSync(archNativePath)
              ? archNativePath
              : x64FallbackPath
            const runnerExists = existsSync(resolvedRunnerPath)
            if (!runnerExists) assetMissing = true
            logInfo(
              `[bootstrap] runner binary ${runnerBinaryName} path=${resolvedRunnerPath} exists=${runnerExists}`,
              LogPrefix.Backend
            )
          }

          if (assetMissing) {
            logError(
              `[bootstrap] SIDECAR ASSET ROOT DEFECT -- resolved publicDir "${ctx.paths.publicDir}" is missing required assets; see 34.5-APP-ROOT-SWEEP.md for the full consumer sweep`,
              LogPrefix.Backend
            )
          }
        } catch (error) {
          logWarning(
            `[bootstrap] Asset-root self-check failed: ${error}`,
            LogPrefix.Backend
          )
        }

        // i18next initialization (D-02): mirrors main.ts:460-472's
        // `i18next.use(Backend).init({...})` call -- the ONLY i18next.init() call site in the
        // whole backend, which only ever runs inside Electron's `app.whenReady()` and therefore
        // never executes under the headless sidecar. Without it, `i18next.t()` returns
        // `undefined` for every one of the 103 backend `t()` call sites reachable from the
        // sidecar (verified against installed i18next 22.5.1 -- it does not throw and there is
        // no rescuing inline English default).
        //
      }
    },
    {
      name: 'i18n',
      run: (ctx, _io, state) => {
        // Reads the config the 'config' step built (placement rationale lives on that step).
        try {
          const settings = requireServices(state).config.getSettings()
          const localesDir = join(ctx.paths.publicDir, 'locales')
          // Loud-not-silent locale resolution (publicdir-getapppath-chunking gotcha family):
          // under the sidecar, the app root (`GAMELIB_APP_ROOT`) resolves to `process.cwd()`,
          // not a packaged asar root -- so the packaged-build half of this path cannot be
          // proven by jest and is a named deferred-UAT item. If the resolved directory is
          // absent, warn loudly naming the resolved path rather than silently falling back --
          // i18next's own `fallbackLng`/key-return behavior below is still strictly better than
          // the current permanent `undefined`.
          //
          // Phase 34.5 plan 34.5-18 (G-3): this check was, for a long time, the ONLY member of
          // this family in the codebase -- and it stopped short. The implication ("publicDir can
          // be wrong under the sidecar") was known here but never generalised past `locales/` to
          // every other publicDir-relative consumer, most costly `bin/` (the runner binaries) --
          // that gap cost live-gate items 1/2/3 (`spawn ./{legendary,gogdl,nile} ENOENT`,
          // `34.5-LIVE-GATE.md`'s "Root cause" section, the fourth recurrence of this family). The
          // boot-time asset-root self-check above generalises this exact pattern to `publicDir`
          // itself and every bundled runner binary, run earlier in `init()` than this block so it
          // cannot be outrun by a login attempt.
          if (!existsSync(localesDir)) {
            logWarning(
              `[bootstrap] i18next locales directory not found at "${localesDir}" -- backend-side translated strings will fall back to their keys`,
              LogPrefix.Backend
            )
          }
          // Assigned to `i18nReady` (Block F, quick-260908-k3x) -- see that variable's own
          // declaration comment for why the CAUGHT promise, not the raw one, is what's held.
          state.i18nReady = i18next
            .use(Backend)
            .init({
              backend: {
                // quick-260925-bq4: `addPath` used to sit here as
                // join(publicDir,'locales','{{lng}}','{{ns}}'). Nothing in this init
                // sets `saveMissing`, so it was never reached -- and once `{{lng}}`
                // became a BCP-47 tag it would have pointed at a `pt-BR` directory
                // that does not exist. Removed rather than "fixed", for the same
                // reason quick task 260901-b8z removed the renderer's copy: a dead
                // option pointing at a plausible-looking path is a trap.
                allowMultiLoading: false,
                // A function, not '{{lng}}': the resolved code is now the BCP-47 tag
                // while the directory keeps its shipped name. NOTE the signature --
                // i18next-fs-backend 2.6.0 calls loadPath with SCALARS
                // (`loadPath(language, namespace)`, :52-53), whereas
                // i18next-http-backend in the renderer passes ARRAYS. The two call
                // sites are deliberately not identical.
                loadPath: (language: string, namespace: string) =>
                  join(
                    ctx.paths.publicDir,
                    'locales',
                    ...localeFileSegments(language, namespace)
                  )
              },
              debug: false,
              returnEmptyString: false,
              returnNull: false,
              fallbackLng: 'en',
              // `lng` + `supportedLngs` as one unit (quick-260925-bq4) -- see
              // i18nextLanguageOptions' header for why they must stay in step.
              ...i18nextLanguageOptions(settings.language),
              // Plan 34.6-19 (REQ-34.6-05, T-34.6-51): fork strings live in their
              // own `gamelib` namespace (public/locales/{{lng}}/gamelib.json),
              // upstream Heroic strings stay in `translation`.
              //
              // The `supportedLngs` list above is shared with the renderer's own
              // i18next init (`src/frontend/index.tsx`) via `common/languages` --
              // that divergence risk is closed structurally, not by convention.
              // quick-260925-bq4 tightened this further: `lng` and `supportedLngs`
              // now arrive together from `i18nextLanguageOptions()`, so the two
              // inits cannot drift on either half independently, and
              // `languages.realI18next.test.ts` exercises that same function rather
              // than a hand-rolled copy of these options.
              //
              // The `ns`/`defaultNS` pair below is NOT mirrored in the renderer,
              // and that is correct, not a gap: `src/frontend/index.tsx`'s init
              // sets no `ns`/`defaultNS` at all, because the renderer loads the
              // `gamelib` namespace lazily via `useTranslation('gamelib')`
              // (react-i18next's `loadNamespaces`), used at `src/frontend/App.tsx:189`
              // and ~30 further call sites. Do not "fix" this by copying `ns` into
              // the renderer's init.
              ns: ['translation', 'gamelib'],
              defaultNS: 'translation'
            })
            .then(() => undefined)
            .catch((error) => {
              logWarning(
                `[bootstrap] i18next initialization failed: ${error}`,
                LogPrefix.Backend
              )
            })
        } catch (error) {
          logWarning(
            `[bootstrap] Failed to read settings for i18next initialization: ${error}`,
            LogPrefix.Backend
          )
        }
      }
    },
    {
      name: 'app-shell-state',
      // No I/O, no timer, no watcher at construction: the tray timer and the debounce arm lazily
      // on the boot clock (unref'd), the watcher opens only when 'installed-json-watcher' starts it.
      run: (ctx, _io, state) => {
        const services = requireServices(state)
        state.shellState = {
          appShell: createAppShellState({ clock: ctx.clock }),
          installedJson: createInstalledJsonWatcher({
            clock: ctx.clock,
            managers: services.managers,
            paths: services.paths,
            sendFrontendMessage: requireHost(state).sendFrontendMessage
          }),
          storeEmbed: createStoreEmbedSeam()
        }
      }
    },
    {
      name: 'register-handlers',
      // Closures only: installs channel handlers, creates no timer, watcher, socket or child.
      run: (ctx, _io, state) => {
        const services = requireServices(state)
        registerHandlers({
          log: ctx.log,
          services,
          shellState: requireShellState(state)
        })
        // e2e-only command stubs (66.3-07): each registers only when CI === 'e2e'.
        registerGogdlStubListeners(
          services.host.ipc,
          { CI: process.env.CI },
          services.gogRuntime.stubs
        )
        registerLegendaryStubListeners(
          services.host.ipc,
          { CI: process.env.CI },
          services.legendaryRuntime.stubs
        )
        registerNileStubListeners(
          services.host.ipc,
          { CI: process.env.CI },
          services.nileRuntime.stubs
        )
      }
    },
    {
      name: 'rpc-server',
      run: (_ctx, { input, output }, state) => {
        requireRpc(state).start(input, output, requireServices(state).host.ipc)
        const services = requireServices(state)
        const outboundHttp = state.outboundHttp
        if (!outboundHttp)
          throw new Error('outbound-http-tracking step has not run')
        releaseOnStdinEof(input, {
          outboundHttp,
          downloadQueue: services.downloadQueue,
          aborts: services.aborts,
          anonymousClient: services.anonymousClient,
          steamUser: services.steamUser,
          stopAllSteamDownloadMonitors: () =>
            services.steamProcesses.downloadMonitor.stopAll(),
          stopRunningGamePoll: () => services.steamProcesses.runningPoll.stop()
        })
      }
    },
    {
      name: 'protocol-url-handler',
      run: (_ctx, _io, state) => {
        // Phase 34.5 gap cycle 6 plan 44 (F-34.5-G6-09): registered immediately after
        // startRpcServer() and BEFORE the READY_SENTINEL write below, so the shell can never send a
        // handleProtocolUrl frame for an unregistered channel.
        registerProtocolUrlHandler(requireServices(state).host.ipc, () =>
          protocolDepsOf(requireServices(state))
        )
      }
    },
    {
      name: 'mac-steam-online-restore',
      run: (_ctx, _io, state) => {
        // Owed Mac Steam goonline, three layers: routed quit (handleExit), stdin EOF
        // (releaseOnStdinEof), and this boot call. kill -9 of the sidecar is covered ONLY here.
        void requireSteamProcesses(
          state
        ).macSteamOffline.restoreMacSteamOnlineIfOwed('boot')
      }
    },
    {
      name: 'secret-stores',
      run: (ctx, _io, state) => {
        const {
          stores,
          host,
          onlineMonitor,
          config,
          tokenStore,
          aborts,
          paths
        } = requireServices(state)
        registerDxmtListeners({
          stores,
          paths,
          runner: ctx.runner,
          aborts,
          onlineMonitor,
          dialogs: host.dialogs,
          appState: host.appState,
          sendFrontendMessage: host.sendFrontendMessage,
          requestRustInvoke: host.requestRustInvoke,
          events: requireAppRuntime(state).events
        })
        // Placement is load-bearing (Phase 28, T-28-10): must run AFTER startRpcServer() so
        // requestRustInvoke can write frames, and BEFORE any invoke handler body can run (those
        // only fire from the RPC loop below, never at module-import time) so no handler ever
        // observes the fail-closed default UnconfiguredTokenStore in the sidecar build (D-12). This constraint is inherited
        // UNCHANGED by both arms of the exclusive branch immediately below (34.5 gap cycle 4 plan 36):
        // installDevSecretVault() only performs local file I/O (no RPC), but the keyring arm it
        // replaces on the OTHER side of this branch needs the same live transport
        // startSidecarHumbleSecretStore()'s migration logic does, so the branch as a whole stays
        // below startRpcServer() regardless of which arm a given boot takes.
        //
        // Exclusive, not additive (34.5 gap cycle 4 plan 36, Routing's developer-scoped dev-vault
        // item): calling installDevSecretVault() first and checking its return value BEFORE touching
        // either keyring install is deliberate. Running the vault install alongside or after the
        // keyring installs would leave startSidecarHumbleSecretStore()'s fire-and-forget
        // migrateHumbleSecrets() already dispatched -- a migration that reads the keyring and writes
        // configStore, i.e. precisely the Keychain interaction this branch exists to let a developer
        // avoid -- and would mean a boot that both prompted for Keychain access AND then discarded the
        // result underneath the vault. Exactly one arm below ever runs. The `[bootstrap] secret
        // stores: ` line is the receipt: `34.5-UNTESTED-ITEMS.md`'s `U-34.5-01` row keys its
        // retirement condition directly off this exact string, so a live `gamelib.log` can prove which
        // arm a given gate run actually used. Phase 34.6 plan 02 (`34.6-CONTEXT.md` amendment A-03)
        // extends this same keyring arm with an additional SteamGridDB secret-store install below:
        // without it, the SteamGridDB port landing in plan 34.6-09 would persist the operator's API
        // key in `config.json` in the clear via the sidecar's dead `safeStorage` stub.
        const devSecretVault = state.secretVault
        if (devSecretVault) {
          tokenStore.configure(devSecretVault.tokenStore)
          logInfo('[bootstrap] secret stores: dev-vault', LogPrefix.Backend)
        } else {
          tokenStore.configure(
            new SidecarKeyringTokenStore(requireHost(state).requestRustInvoke)
          )
          // Phase 34.4.1 gap-cycle plan 13 (F-1 BLOCKING closure): the keyring-backed Humble
          // secret store was already built and injected into the Humble services by the
          // 'humble-services' step (66.3-17); this arm only runs its observable receipt line and the
          // one-time plaintext migration, at the same site as the Steam TokenStore just above. Must
          // run AFTER startRpcServer() for the same reason tokenStore.configure() does (the migration
          // calls requestRustInvoke, which needs a live transport).
          const humbleKeyringStore = state.humbleKeyringStore
          if (!humbleKeyringStore)
            throw new Error('boot: humble-services step must run first')
          startSidecarHumbleSecretStore(humbleKeyringStore, {
            stores,
            requestRustInvoke: requireHost(state).requestRustInvoke
          })
          // Phase 34.6 plan 02 (A-03): same placement reasoning as startSidecarHumbleSecretStore()
          // just above -- its migration also calls requestRustInvoke, so it must run AFTER
          // startRpcServer() and inside this same keyring arm.
          const steamGridKeyringStore = state.steamGridKeyringStore
          if (!steamGridKeyringStore)
            throw new Error('boot: steamgrid-secrets step must run first')
          startSidecarSteamGridDbSecretStore(steamGridKeyringStore, {
            stores,
            config,
            requestRustInvoke: requireHost(state).requestRustInvoke
          })
          logInfo('[bootstrap] secret stores: keyring', LogPrefix.Backend)
        }
      }
    },
    {
      name: 'orphaned-token-cleanup',
      run: (_ctx, _io, state) => {
        // Unconditional legacy-key cleanup (debug/steam-token-survives-keychain), OUTSIDE both arms
        // above on purpose: by the time either arm finishes, `activeTokenStore` has already been
        // swapped away from the unconfigured default (T-28-10 ordering — the block above), so the
        // orphaned pre-Tauri `refreshToken` key in `steam_store/config.json` is dead under either
        // arm, not just one. `clearOrphanedElectronToken()` itself lives in `tokenStore.ts`, not
        // here — `bootstrap.ts` is banned by `electronUntouched.test.ts`'s D-04 binding gate from
        // importing `configStore`/`TOKEN_STORE_KEY` directly, and that module is already the one
        // place in the codebase permitted to touch them. Presence-only: never reads, logs, or
        // measures the value, and this log line fires ONLY when the key was actually present and
        // deleted (an absent key produces zero output, and stays that way on every later boot).
        if (
          clearOrphanedElectronToken({ stores: requireServices(state).stores })
        ) {
          logInfo(
            '[bootstrap] removed a legacy pre-Tauri `refreshToken` key from `steam_store/config.json`; the Keychain (`steam-refresh-token` slot) is the authoritative store',
            LogPrefix.Backend
          )
        }
      }
    },
    {
      name: 'online-monitor',
      run: (_ctx, _io, state) => {
        // Placement is load-bearing (fix/steam-native-install-stability, 33-05 live-gate gap): must
        // run AFTER startRpcServer() so initOnlineMonitor()'s immediate
        // `sendFrontendMessage('connectivity-changed', ...)` call (inside `setStatus()`) has a live
        // transport to push through, and BEFORE the READY_SENTINEL write below so the frontend's
        // `get-connectivity-status` handler is guaranteed registered before the renderer can possibly
        // ask for it.
        requireServices(state).onlineMonitor.start()
      }
    },
    {
      name: 'anticheat-listener',
      run: (_ctx, _io, state) => {
        // Block A — re-homed `releasesInfoReady` anticheat listener (D-04). Reproduces
        // `anticheat/ipc_handler.ts:12-19`'s body exactly, including its `logDebug` line.
        // `anticheat/ipc_handler.ts` itself cannot be side-effect-imported from
        // `src/backend/sidecar/`: its module scope calls `addHandler` from `backend/ipc`, which
        // imports the real `electron` (D-04's curated-import discipline, carried from Phase 30
        // D-08 / 34.1 D-09) — so this listener has no other home under the sidecar, and without it
        // D-07's emit below would fire into a void and `getAnticheatInfo` would still structurally
        // be unable to return data. Electron keeps using `anticheat/ipc_handler.ts`'s own copy via
        // `main.ts`'s `import './anticheat/ipc_handler'` — this is an addition for the sidecar
        // only, never a second registration in the same process.
        //
        // Must be registered before Block B's fetch, below, so the listener exists before the
        // event it responds to can possibly fire.
        //
        // CR-02 (34.2-09): the outer `try`/`catch` below covers ONLY the synchronous
        // `backendEvents.on(...)` registration call, which cannot itself throw — it gives ZERO
        // coverage to the listener body, which runs later from the emitter, outside this stack
        // frame. The `.catch()` attached directly to the `downloadAntiCheatData(...)` call is what
        // covers that body: `createMD5`'s `await` inside `downloadAntiCheatData` sits outside its
        // own internal try/catch, so an `EACCES`/`ENOENT`/TOCTOU/is-a-directory fault on the local
        // anticheat cache file would otherwise reject an unguarded promise.
        try {
          requireAppRuntime(state).events.on(
            'releasesInfoReady',
            (releasesInfo) => {
              logDebug(
                'Releases info ready, checking anticheat data',
                LogPrefix.Backend
              )
              downloadAntiCheatData(
                {
                  onlineMonitor: requireServices(state).onlineMonitor,
                  paths: requireServices(state).paths
                },
                isMac
                  ? releasesInfo.anticheatFiles.shaMac
                  : releasesInfo.anticheatFiles.shaLinux
              ).catch((error) => {
                logWarning(
                  `[bootstrap] downloadAntiCheatData failed: ${String(error)}`,
                  LogPrefix.Backend
                )
              })
            }
          )
        } catch (error) {
          logWarning(
            `[bootstrap] Failed to register releasesInfoReady anticheat listener: ${error}`,
            LogPrefix.Backend
          )
        }
      }
    },
    {
      name: 'releases-fetch',
      run: (_ctx, _io, state) => {
        // Block B — fetchLastestReleases() (D-07). Must run AFTER initOnlineMonitor() above,
        // because fetchLastestReleases wraps its work in runOnceWhenOnline, and AFTER Block A so
        // the releasesInfoReady listener exists before the event it responds to can fire. Its own
        // `process.env.CI === 'e2e'` and `isWindows` early-returns are preserved unchanged by
        // calling it as-is — not replicated or bypassed here.
        try {
          fetchLastestReleases({
            onlineMonitor: requireServices(state).onlineMonitor,
            appRuntime: requireAppRuntime(state)
          })
        } catch (error) {
          logWarning(
            `[bootstrap] fetchLastestReleases() failed: ${error}`,
            LogPrefix.Backend
          )
        }
      }
    },
    {
      name: 'installed-json-watcher',
      run: (_ctx, _io, state) => {
        // Block C — the `installed.json` watcher (Phase 35 plan 35-10, REQ-35-16). Ports
        // `main.ts:1036-1048`, an Electron-only module-scope side effect that the sidecar never
        // inherited: plan 35-01's D-17 census found ZERO import edges from the sidecar into
        // `main.ts`, so under Tauri nothing refreshed the in-memory `installedGames` map and
        // `legendary sync-saves` computed save paths against a stale view. See
        // `installedJsonWatcher.ts` for the full mechanism, the debounce rationale and teardown.
        //
        // Placement: after Block B and immediately before READY_SENTINEL, so the existence check runs
        // once the app-data path shim is fully resolved rather than at module load — a fresh profile
        // has no `installed.json` until legendary first writes one, which is exactly what `main.ts`'s
        // own `existsSync` guard is for. Idempotence is owned by the watcher module itself (a second
        // start returns `false`), so this call site deliberately carries no extra flag of its own.
        //
        // JEST GUARD, and it is load-bearing rather than cosmetic. `legendaryInstalled` resolves to
        // the developer's REAL `~/Library/Application Support/gamelib/legendaryConfig/installed.json`
        // in any suite that calls `init()` without a homedir override — and most do not. Opening a
        // real `fs.watch` there leaks a libuv handle into the Jest worker, which then parks in
        // `uv__io_poll` and never exits: measured directly during this plan's mutation testing, where
        // an orphaned watch handle hung the run outright instead of failing it. `JEST_WORKER_ID` is
        // Jest's own zero-config signal (always set in a worker, never set for the real Tauri sidecar
        // process), mirroring `handlers.ts:145`'s existing use of it for the same class of problem —
        // under real Tauri this is unconditionally false and the watcher always arms.
        if (process.env.JEST_WORKER_ID === undefined) {
          try {
            requireShellState(state).installedJson.start()
          } catch (error) {
            logWarning(
              `[bootstrap] installedJson.start() failed: ${error}`,
              LogPrefix.Backend
            )
          }
        }
      }
    },
    {
      name: 'steam-running-poll',
      run: (_ctx, _io, state) => {
        // The global RunningAppID poller (quick 261111-7wo, todo 2026-11-11). It used to start only
        // from `SteamLibraryManager.init()`, which -- like `initStoreManagers()` -- is dead under
        // Tauri, so a Windows `steam://launch` launch (no `steamLaunchWatch` coverage) never
        // reached Playing. Starting it here makes this step the single owner.
        //
        // Placement: after 'rpc-server' and 'transport' (a gameStatusUpdate frame always has a bound
        // transport) and before READY. `start()` is registration only: the first probe lands one
        // interval (5 s) later, so nothing runs at boot itself.
        //
        // Exit contract: the interval is a `ctx.clock` timer, unref'd by default, with no keepAlive.
        // Each probe is a `runner.run` child with a timeout (reg 2000 ms / ps 1000 ms) and is itself
        // unref'd, so nothing here references the loop. It is still stopped at stdin EOF, from the
        // 'rpc-server' step (releaseOnStdinEof), so a post-EOF tick never spawns or writes a frame.
        //
        // No `JEST_WORKER_ID` guard, unlike 'installed-json-watcher': every test boot carries a fake
        // clock, so nothing real is armed -- and a guard would make this step untestable.
        try {
          requireSteamProcesses(state).runningPoll.start()
        } catch (error) {
          logWarning(
            `[bootstrap] running-game poller failed to start: ${String(error)}`,
            LogPrefix.Backend
          )
        }
      }
    },
    {
      name: 'playtime-lock-clear',
      run: (_ctx, _io, state) => {
        // Block D — boot-time stranded GOG playtime-sync lock clear (finding A1 LEG 2,
        // quick-260907-odi). Placed after `initLogger()` (the helper logs, and `heroicLogWriter` is
        // unset before that — see the standing `sidecar-console-and-logger-are-invisible` finding)
        // and before READY so the lock is already clear by the time any RPC-driven playtime sync can
        // arrive. Mirrors `main.ts`'s ordering intent, where the clear ran during app startup rather
        // than lazily. `clearStrandedPlaytimeSyncLock()` itself never fails boot (see its own header),
        // so no additional try/catch is needed at this call site — matches Blocks A/B's shape, which
        // wrap their own bodies rather than duplicating that at the call site too.
        clearStrandedPlaytimeSyncLock({
          playtimeSyncQueue: requireServices(state).stores.gog.playtimeSyncQueue
        })
      }
    },
    {
      name: 'legacy-zoom-cleanup',
      run: (ctx) => {
        // Legacy Zoom Platform data removal (quick-261029-toq). After `initLogger()` (it logs).
        // Fire-and-forget: never awaited before READY, never rejects, creates no handle (see the
        // module header for the sidecar exit-contract reasoning).
        void removeLegacyZoomData(ctx.paths.userData)
      }
    },
    {
      name: 'engine-temp-sweep',
      run: (_ctx, _io, state) => {
        // Stale engine temp sweep (G20): removes steam-engines/.tmp-* left by an interrupted unpack.
        // Placed after `initLogger()` (it logs) and before READY (no install can hold a temp dir yet).
        // Exit contract: synchronous, creates no handle, nothing in flight once it returns.
        try {
          requireEngineRuntime(state).fallback.sweepStaleEngineTemps()
        } catch {
          /* never fails boot */
        }
      }
    },
    {
      name: 'store-user-reconcile',
      run: (_ctx, _io, state) => {
        // Block E — boot-time Epic/GOG user reconciliation (todo 2026-09-06, quick-260908-fre).
        // Placement (D2): must be after `initLogger()` above (the helper logs, and `heroicLogWriter`
        // is unset before that — the standing `sidecar-console-and-logger-are-invisible` finding);
        // must be after `initOnlineMonitor()` above (it calls `runOnceWhenOnline`, the same
        // requirement Block B's `fetchLastestReleases()` comment already records); and runs before
        // READY so the reconciliation is at least queued before the frontend can issue its first
        // `getUserInfo`-shaped RPC. Appending after Block D satisfies all three while leaving the
        // existing A→B→C→D sequence byte-identical. `reconcileStoreUsersWhenOnline()` itself never
        // fails boot (see its own header), so no additional try/catch is needed at this call site —
        // matches Block D's call site shape, which wraps its own body rather than duplicating that
        // here too.
        reconcileStoreUsersWhenOnline({
          kvs: requireServices(state).stores.kvs,
          onlineMonitor: requireServices(state).onlineMonitor,
          gogUser: {
            appInfo: requireServices(state).appInfo,
            onlineMonitor: requireServices(state).onlineMonitor,
            stores: requireServices(state).stores,
            libraryManagers: requireServices(state).managers.library,
            gogRuntime: requireServices(state).gogRuntime,
            paths: requireServices(state).paths
          }
        })
      }
    },
    {
      name: 'rosetta',
      run: (ctx, _io, state) => {
        // Block F — boot-time Rosetta-availability probe (todo 2026-09-06, quick-260908-k3x).
        // Placement is constrained from both sides:
        //   - Must be AFTER the i18next block above so `i18nReady` holds the real init promise
        //     rather than the `Promise.resolve()` initial value.
        //   - Must be AFTER `startRpcServer(input, output)`
        //     above, because the dialog reaches the shell via `requestRustInvoke`, which needs a
        //     live write stream -- do not rely on the `i18nReady` await pushing this into a later
        //     macrotask; the placement itself must carry it.
        // Runs before READY_SENTINEL below, but deliberately does NOT delay it: boot is not
        // blocked on a warning dialog (see `checkRosettaWhenMac(state.i18nReady)`'s own header for why it can
        // never fail boot). The guard flag lives at this call site, matching Blocks A/B/E, not
        // inside `checkRosettaWhenMac(state.i18nReady)` -- see `rosettaCheckInitialized`'s declaration comment.
        checkRosettaWhenMac(state.i18nReady, {
          runner: ctx.runner,
          paths: ctx.paths,
          dialogs: requireHost(state).dialogs
        })
      }
    },
    {
      name: 'playtime-queue-drain',
      run: (_ctx, _io, state) => {
        // Block G — boot-time GOG queued-playtime drain (todo 2026-09-06, quick-260908-wk0).
        // LOAD-BEARING PLACEMENT, stated first and in full: syncQueuedPlaytime()'s first statement is
        // `if (playtimeSyncQueue.has('lock')) return`, so running this before Block D would let a lock
        // stranded by process death silently no-op the very drain this block adds -- restoring the
        // call site while leaving the bug unfixed for exactly the users whose previous sync died
        // mid-flight. Appending here, after Block F, keeps this AFTER Block D's clear (the load-bearing
        // constraint), AFTER `initLogger()` (the helper logs, and `heroicLogWriter` is unset before
        // that -- the standing `sidecar-console-and-logger-are-invisible` finding), AFTER
        // `initOnlineMonitor()` (it calls `runOnceWhenOnline`, the same requirement Blocks B/E already
        // record), and BEFORE READY_SENTINEL below -- so the drain is at least queued before the
        // frontend can drive any RPC, without delaying READY itself. `syncQueuedPlaytimeWhenOnline()`
        // itself never fails boot (see its own header), so no additional try/catch is needed at this
        // call site -- matches Blocks D/E/F's call site shape.
        syncQueuedPlaytimeWhenOnline({
          managers: requireServices(state).managers,
          config: requireServices(state).config,
          onlineMonitor: requireServices(state).onlineMonitor
        })
      }
    },
    {
      name: 'gog-presence',
      run: (_ctx, _io, state) => {
        // Block H — boot-time GOG presence call (todo 2026-09-06, quick-260909-k5x). Unlike Block G,
        // this block has NO load-bearing ordering constraint of its own -- do not go hunting for one.
        // Only the generic three apply (see `setGogPresenceWhenOnline()`'s own header for the full
        // refutation of Blocks D/E/F/G as candidates): after `initLogger()`, after
        // `initOnlineMonitor()`, and before READY_SENTINEL below. Appending here, after Block G,
        // satisfies all three. `setGogPresenceWhenOnline()` itself never fails boot per its own
        // header, so no additional try/catch is needed at this call site, matching Blocks D/E/F/G.
        setGogPresenceWhenOnline(gogPresenceDeps(state))
        // React immediately when the user toggles GOG presence on/off in settings. Registered here
        // (not at presence.ts import) because the listener needs the boot's deps.
        requireAppRuntime(state).events.on(
          'settingChanged',
          ({ key, newValue }) => {
            if (key !== 'disableGOGPresence') return
            const deps = gogPresenceDeps(state)
            if (newValue) {
              void gogPresence.deletePresence(deps, true)
            } else {
              void gogPresence.setPresence(deps)
            }
          }
        )
      }
    },
    {
      name: 'sign-in-probe-outcomes',
      run: (_ctx, _io, state) => {
        // Phase 49 plan 08 (R3) -- the sign-in probe outcomes PULL handler. Registration only, and
        // placed before the READY write so the renderer's mount-time pull is answerable the moment the
        // shell sees READY. It reads an in-memory map and starts no probe.
        requireServices(state).signInProbe.outcomes.registerHandler()
      }
    },
    {
      name: 'ready-sentinel',
      run: (_ctx, { output }) => {
        output.write(`${READY_SENTINEL}\n`)
      }
    },
    {
      name: 'sign-in-probe',
      run: (_ctx, _io, state) => {
        // Phase 49 plan 08 (R3, SPEC "READY first"): the bounded boot sign-in probe pass starts HERE,
        // after the READY write, so READY never waits on a probe. The call is registration only -- one
        // connectivity listener and an unref()'d setImmediate -- so it cannot delay the protocol-URL
        // delivery below. It creates no handle of its own beyond those the pass enumerates in its
        // exit-contract header (every timer unref()'d, spawned children aborted at the bound).
        const services = requireServices(state)
        services.signInProbe.pass.start({
          libraryManagers: services.managers.library,
          stores: services.stores,
          appInfo: services.appInfo,
          aborts: services.aborts,
          steamUser: services.steamUser,
          humbleUser: services.humble.user,
          onlineMonitor: services.onlineMonitor,
          gogRuntime: services.gogRuntime,
          paths: services.paths,
          sendFrontendMessage: services.host.sendFrontendMessage
        })
      }
    },
    {
      name: 'startup-protocol-url',
      run: (_ctx, _io, state) => {
        // Phase 34.5 gap cycle 6 plan 44 (F-34.5-G6-09): the LAST statement of init(), deliberately
        // AFTER the READY_SENTINEL write above — so the shell knows the sidecar is up before any
        // launch begins, and so every store manager imported by ./handlers (Step 2, above) is fully
        // constructed before handleProtocol can possibly touch the manager table. The sign-in probe
        // pass start above is registration only, so protocol-URL delivery is still the last statement
        // that does any work.
        deliverStartupProtocolUrl(protocolDepsOf(requireServices(state)))
      }
    }
  ]
}
