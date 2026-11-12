/**
 * Per-boot services (66.1, D-02). Types only: every import is `import type`.
 *
 * These are held on the sidecar's `BootState` and handed down by the boot steps and
 * `registerHandlers`; they are never module state and never live on `AppContext`
 * (`backend/process/` is a leaf and cannot type-import stores or managers).
 *
 * D-01 slices: a consumer declares only what it uses, as `Pick<BootServices, ...>` or a
 * `{ managers: Pick<StoreManagers, 'library'> }` style interface. Only composition roots
 * see the whole `BootServices`.
 */
import type { TokenStoreSlot } from 'backend/storeManagers/steam/tokenStore'
import type { StoreRegistry } from 'backend/stores/storeRegistry'
import type { StoreRoot } from 'backend/stores/storeRoot'
import type { SpawnAsync } from 'backend/spawnAsync'
import type { QuitHandler } from 'backend/quitHandler'
import type { Runner } from 'common/types'
import type { LibraryManager } from 'common/types/game_manager'
import type { StoreLaunchHooks } from 'backend/storeManagers'
import type { DownloadQueue } from 'backend/downloadmanager/downloadqueue'
import type { Launcher } from 'backend/launcher'
import type { HostServices } from 'backend/host'
import type { Dialogs } from 'backend/host/dialogs'
import type { OpenExternal } from 'backend/host/openExternal'
import type { Notifications } from 'backend/host/notifications'
import type { AppState } from 'backend/host/appState'
import type { GlobalConfigSlice } from 'backend/config'
import type { GameConfigs } from 'backend/game_config'
import type { AppInfo, AppPaths } from 'backend/process/context'
import type { Clock, ProcessRunner } from 'backend/process/types'
import type { OnlineMonitor } from 'backend/online_monitor'
import type { EngineStateService } from 'backend/engine/engineState'
import type { EngineRuntime } from 'backend/engine/engineRuntime'
import type { SteamLaunchRuntime } from 'backend/storeManagers/steam/steamLaunchRuntime'
import type { BridgeRuntime } from 'backend/storeManagers/steam/bridge/bridgeRuntime'
import type { GogRuntime } from 'backend/storeManagers/gog/gogRuntime'
import type { LegendaryRuntime } from 'backend/storeManagers/legendary/legendaryRuntime'
import type { NileRuntime } from 'backend/storeManagers/nile/nileRuntime'
import type { SystemInfoCache } from 'backend/utils/systeminfo'
import type { AbortRegistry } from 'backend/utils/aborthandler/aborthandler'
import type { WineWindowRaiser } from 'backend/utils/wineWindowRaise'
import type { HltbCredentials } from 'backend/wiki_game_info/howlongtobeat/utils'
import type { SteamInstallRuntime } from 'backend/storeManagers/steam/steamInstallRuntime'
import type { WinetricksQueue } from 'backend/tools/winetricksQueue'
import type { SignInEpochs } from 'backend/signInProbe/sessionEpoch'
import type { SignInProbeOutcomes } from 'backend/signInProbe/outcomes'
import type { SignInProbePass } from 'backend/signInProbe/pass'
import type {
  BridgeHelperRegistry,
  BridgeHelperSlice
} from 'backend/storeManagers/steam/bridge/helperRegistry'
import type { AnonymousClient } from 'backend/storeManagers/steam/anonymousClient'
import type { SteamUser } from 'backend/storeManagers/steam/user'
import type { SteamGridDbSecretStore } from 'backend/steamgrid/secretStore'
import type { HumbleServices } from 'backend/humble'
import type { LoginWindowSeamSlot } from 'backend/humble/loginWindowSeam'
import type { SteamBottle } from 'backend/storeManagers/steam/bottle'
import type { SteamSignInState } from 'backend/storeManagers/steam/userSignInState'
import type { SteamAuthTriggerState } from 'backend/storeManagers/steam/authTrigger'
import type { SteamLibraryState } from 'backend/storeManagers/steam/state'
import type { SteamGameSessionState } from 'backend/storeManagers/steam/gameSessionState'
import type { CommandRunner as CommandRunnerImpl } from 'backend/commandRunner'
import type GOGLibraryManager from 'backend/storeManagers/gog/library'
import type LegendaryLibraryManager from 'backend/storeManagers/legendary/library'
import type NileLibraryManager from 'backend/storeManagers/nile/library'
import type SideloadLibraryManager from 'backend/storeManagers/sideload/library'
import type SteamLibraryManager from 'backend/storeManagers/steam/library'
import type { SteamProcesses } from 'backend/storeManagers/steam/steamProcesses'

/** One entry per store family; each is what the family's `createXStores` factory returns. */
export interface Stores {
  kvs: ReturnType<
    typeof import('backend/constants/key_value_stores').createKvsStores
  >
  crossoverIndex: ReturnType<
    typeof import('backend/crossover_index/stores').createCrossoverIndexStores
  >
  downloadManager: ReturnType<
    typeof import('backend/downloadmanager/stores').createDownloadManagerStores
  >
  gameOverrides: ReturnType<
    typeof import('backend/game_overrides/stores').createGameOverridesStores
  >
  humble: ReturnType<typeof import('backend/humble/stores').createHumbleStores>
  logger: ReturnType<typeof import('backend/logger/stores').createLoggerStores>
  macArch: ReturnType<
    typeof import('backend/macArch/stores').createMacArchStores
  >
  migration: ReturnType<
    typeof import('backend/migration/stores').createMigrationStores
  >
  runsForMe: ReturnType<
    typeof import('backend/runsForMe/stores').createRunsForMeStores
  >
  gog: ReturnType<
    typeof import('backend/storeManagers/gog/stores').createGogStores
  >
  legendary: ReturnType<
    typeof import('backend/storeManagers/legendary/stores').createLegendaryStores
  >
  nile: ReturnType<
    typeof import('backend/storeManagers/nile/stores').createNileStores
  >
  sideload: ReturnType<
    typeof import('backend/storeManagers/sideload/stores').createSideloadStores
  >
  steam: ReturnType<
    typeof import('backend/storeManagers/steam/stores').createSteamStores
  >
  wikiGameInfo: ReturnType<
    typeof import('backend/wiki_game_info/stores').createWikiGameInfoStores
  >
  wineManager: ReturnType<
    typeof import('backend/wine/manager/stores').createWineManagerStores
  >
  engine: ReturnType<
    typeof import('backend/engine/engineNoticeStore').createEngineStores
  >
  systemInfo: ReturnType<
    typeof import('backend/utils/systeminfo/gpu/pci_ids').createPciIdCaches
  >
}

export interface StoreManagers {
  /** `gog` keeps its concrete type: boot drains the queued playtime through it. */
  library: Omit<
    Record<Runner, LibraryManager>,
    'gog' | 'legendary' | 'nile' | 'sideload' | 'steam'
  > & {
    gog: GOGLibraryManager
    legendary: LegendaryLibraryManager
    nile: NileLibraryManager
    /** `sideload` keeps its concrete type: game-details adds a sideloaded app through it. */
    sideload: SideloadLibraryManager
    /** `steam` keeps its concrete type: the manager holds the per-boot launch-watch registry. */
    steam: SteamLibraryManager
  }
  launchHooks: Record<Runner, StoreLaunchHooks>
  autoUpdate(runner: Runner, gamesToUpdate: string[]): string[]
  initAll(): Promise<unknown[]>
}

/** The launcher built by createLauncher (the non-command launcher members). */
export type { Launcher }

export type CommandRunner = CommandRunnerImpl

export type { SpawnAsync, QuitHandler }

/** What every library manager receives through its constructor (66.1, R2). */
/** The boot-owned info caches: system information and HowLongToBeat credentials. */
export interface InfoCaches {
  systemInfo: SystemInfoCache
  hltb: HltbCredentials
}

export interface ManagerDeps {
  libraryManagers: StoreManagers['library']
  stores: Stores
  commandRunner: CommandRunner
  launcher: Launcher
  spawnAsync: SpawnAsync
  /**
   * The boot's process runner (the one commandRunner is built on), so a manager's stop path
   * kills through the same registry its spawns are tracked in.
   */
  runner: Pick<ProcessRunner, 'killTracked' | 'spawnLongLived' | 'run'>
  /** The boot clock; timers are unref'd by default (D-04). */
  clock: Clock
  /** The process-wide Steam instances (running poller, download monitor), built once at boot. */
  steamProcesses: SteamProcesses
  /**
   * A call-time accessor, never a queue value: the download queue is built by the
   * 'download-queue' boot step, after the managers exist.
   */
  getDownloadQueue: () => DownloadQueue
  /** The boot-built global config (D-66.3-03). */
  config: GlobalConfigSlice
  /** The boot-built per-game config registry (D-66.3-03). */
  gameConfigs: GameConfigs
  paths: AppPaths
  appInfo: AppInfo
  dialogs: Dialogs
  openExternal: OpenExternal
  notifications: Notifications
  appState: AppState
  imageTools: HostServices['imageTools']
  /** The boot-owned engine decision/notice state (D-66.3-12). */
  engineState: EngineStateService
  /** The boot-owned engine runtime: ledger, registry, deadlines, single-flight maps (66.4-05). */
  engineRuntime: EngineRuntime
  /** The boot-owned Steam launch-path runtime: monitors, raise loop, DRM runners, notice latch, capture chain (66.4-06). */
  steamLaunchRuntime: SteamLaunchRuntime
  /** The boot-owned Steam bridge runtime: runner clone flights, entitlement signer, shared-redist installer (66.4-08). */
  bridgeRuntime: BridgeRuntime
  /** The boot-owned Steam install runtime: depot order tap, CDN schema, shared-redist locks, depot job registry, install and uninstall polls, restart hold (66.4-09). */
  steamInstallRuntime: SteamInstallRuntime
  /** The boot-owned GOG runtime: library maps, presence keep-alive, resume baselines, credential cache, e2e stubs (66.4-10). */
  gogRuntime: GogRuntime
  /** The boot-owned Legendary runtime: library, installed and account-game collections, e2e stubs (66.4-11). */
  legendaryRuntime: LegendaryRuntime
  /** The boot-owned Nile runtime: login-data single-flight, e2e stubs (66.4-11). */
  nileRuntime: NileRuntime
  /** The boot-owned system-information and HowLongToBeat credential caches (66.4-12). */
  infoCaches: InfoCaches
  /** The boot-owned abort-controller registry every cancellable job registers in; stdin EOF and quit abort it (66.4-13). */
  aborts: AbortRegistry
  /** The boot-owned Wine window raiser: its raise timers run on the boot clock (66.4-13). */
  windowRaiser: WineWindowRaiser
  /** The boot-owned sign-in fence and outcome map the store user modules write through (D-66.3-13). */
  signIn: Pick<SignInProbeServices, 'epochs' | 'outcomes'>
  /** The boot-owned Steam sign-in session and auth-unlock state (D-66.3-13). */
  steamSession: SteamSessionServices
  /** The boot-owned Steam token store slot the sign-in and user modules read through (66.4-07). */
  tokenStore: Pick<TokenStoreSlot, 'current'>
  /** The boot-owned bridge-helper registry (D-66.3-14). */
  bridgeHelpers: BridgeHelperSlice
  /** The boot-owned Steam bottle helpers over the bottle config store (D-66.3-15). */
  steamBottle: SteamBottle
  /** The boot-owned anonymous CM client for public PICS reads (D-66.3-14). */
  anonymousClient: Pick<AnonymousClient, 'get' | 'close'>
  /** The boot-owned authenticated Steam session, as the slice the managers call (D-66.3-16). */
  steamUser: SteamUserSlice
  /** The boot-owned login-window seam slot the store user modules wipe cookies through (D-66.3-17). */
  loginWindowSeam: Pick<LoginWindowSeamSlot, 'getOrThrow'>
  /** The boot-owned connectivity monitor, as the slice managers read (D-66.3-11). */
  onlineMonitor: Pick<
    OnlineMonitor,
    | 'isOnline'
    | 'runOnceWhenOnline'
    | 'onConnectivityChange'
    | 'getConnectivityStatus'
    | 'recheckConnectivity'
  >
}

/** The members of the boot-owned SteamUser that production consumers call (D-66.3-16). */
export type SteamUserSlice = Pick<
  SteamUser,
  | 'acquireAuthenticated'
  | 'acquireAuthenticatedWithToken'
  | 'acquireOpenAuthenticated'
  | 'getClient'
  | 'getLogonFailure'
  | 'getPersistedSteamId64'
  | 'isLoggedIn'
  | 'isSteamClientInstalled'
  | 'getUserDetails'
  | 'logout'
>

/** What a Steam function reads from the boot-owned SteamUser: exactly the members it calls. */
export interface SteamUserSliceDeps<K extends keyof SteamUserSlice> {
  steamUser: Pick<SteamUserSlice, K>
}

/**
 * The boot-owned sign-in probe state (D-66.3-13): one epoch fence shared by every store's user
 * module, the outcome map the renderer reads, and the bounded boot probe pass.
 */
export interface SignInProbeServices {
  epochs: SignInEpochs
  outcomes: SignInProbeOutcomes
  pass: SignInProbePass
}

/**
 * The boot-owned Steam session cluster (D-66.3-13), built by the 'steam-session-state' boot step:
 * the QR / credential sign-in state, the keyring auth-unlock latches, the in-memory library map and
 * the per-session game maps.
 */
export interface SteamSessionServices {
  signIn: SteamSignInState
  authTrigger: SteamAuthTriggerState
  /** The in-memory library map, the metadata-fetch dedup set and the metadata slot limiter. */
  libraryState: SteamLibraryState
  /** The per-session game maps: native installs, bridge launches and bridge failures in flight. */
  gameSession: SteamGameSessionState
}

/** What a Steam function reads from the boot-owned library map and metadata-slot limiter. */
export interface SteamLibraryStateDeps {
  steamSession: Pick<SteamSessionServices, 'libraryState'>
}

/** What a Steam function reads from the boot-owned per-session game maps. */
export interface SteamGameSessionDeps {
  steamSession: Pick<SteamSessionServices, 'gameSession'>
}

export interface BootServices {
  stores: Stores
  /** The registry `stores` were built against; the name-keyed store RPC handlers resolve through it. */
  storeRegistry: StoreRegistry
  /** The per-boot store root `stores` were built against (66.4 plan 04). */
  storeRoot: StoreRoot
  managers: StoreManagers
  launcher: Launcher
  commandRunner: CommandRunner
  /** ctx.runner: the process runner commandRunner is built on (one registry). */
  runner: ManagerDeps['runner']
  /** ctx.clock: the boot clock, read by ManagerDeps.clock (66.2). */
  clock: ManagerDeps['clock']
  /** The boot's Steam process instances, shared by every ManagerDeps built from these services. */
  steamProcesses: ManagerDeps['steamProcesses']
  spawnAsync: SpawnAsync
  quit: QuitHandler
  downloadQueue: DownloadQueue
  /** Tauri-native host services (D-66.3-01), built once by the 'host-services' boot step. */
  host: HostServices
  /** Built once by the 'config' boot step (D-66.3-03). */
  config: GlobalConfigSlice
  gameConfigs: GameConfigs
  /** ctx.paths and ctx.appInfo, carried so ManagerDeps can be assembled from services alone. */
  paths: AppPaths
  appInfo: AppInfo
  /** Built by the 'online-monitor-owner' boot step, started by 'online-monitor' (D-66.3-11). */
  onlineMonitor: OnlineMonitor
  /** Built by the 'engine-state' boot step, before 'store-managers' (D-66.3-12). */
  engineState: EngineStateService
  /** Built by the 'engine-runtime' boot step, after 'engine-state' and before 'store-managers' (66.4-05). */
  engineRuntime: EngineRuntime
  /** Built by the 'steam-launch-runtime' boot step, after 'engine-runtime' and before 'store-managers' (66.4-06). */
  steamLaunchRuntime: SteamLaunchRuntime
  /** Built by the 'steam-bridge-runtime' boot step, after 'steam-launch-runtime' and before 'store-managers' (66.4-08). */
  bridgeRuntime: BridgeRuntime
  /** Built by the 'steam-install-runtime' boot step, after 'steam-bridge-runtime' and before 'store-managers' (66.4-09). */
  steamInstallRuntime: SteamInstallRuntime
  /** The boot-owned GOG runtime: library maps, presence keep-alive, resume baselines, credential cache, e2e stubs (66.4-10). */
  gogRuntime: GogRuntime
  /** The boot-owned Legendary runtime: library, installed and account-game collections, e2e stubs (66.4-11). */
  legendaryRuntime: LegendaryRuntime
  /** The boot-owned Nile runtime: login-data single-flight, e2e stubs (66.4-11). */
  nileRuntime: NileRuntime
  /** The boot-owned system-information and HowLongToBeat credential caches (66.4-12). */
  infoCaches: InfoCaches
  /** The boot-owned abort-controller registry every cancellable job registers in; stdin EOF and quit abort it (66.4-13). */
  aborts: AbortRegistry
  /** The boot-owned Wine window raiser: its raise timers run on the boot clock (66.4-13). */
  windowRaiser: WineWindowRaiser
  /** Built by the 'winetricks-queue' boot step, before 'register-handlers' (D-66.3-12). */
  winetricksQueue: WinetricksQueue
  /** Built by the 'sign-in-probe-state' boot step, before 'store-managers' (D-66.3-13). */
  signInProbe: SignInProbeServices
  /** Built by the 'steam-session-state' boot step, before 'store-managers' (D-66.3-13). */
  steamSession: SteamSessionServices
  /** Built by the 'steam-token-store' boot step before 'stores'; configured by 'secret-stores' (66.4-07). */
  tokenStore: TokenStoreSlot
  /** Built by the 'steam-anonymous-client' boot step, before 'store-managers' (D-66.3-14). */
  anonymousClient: AnonymousClient
  /** Built by the 'bridge-helper-registry' boot step, before 'store-managers' (D-66.3-14). */
  bridgeHelpers: BridgeHelperRegistry
  /** Built by the 'steam-bottle' boot step, before 'store-managers' (D-66.3-15). */
  steamBottle: SteamBottle
  /** Built by the 'steam-user' boot step, after 'command-runner' and before 'store-managers' (D-66.3-16). */
  steamUser: SteamUser
  /**
   * Built by the 'steamgrid-secrets' boot step, before 'register-handlers' (D-66.3-17): the one
   * SteamGridDB API-key owner, over the store this boot selected (keyring or dev vault).
   */
  steamGridSecrets: SteamGridDbSecretStore
  /**
   * Built by the 'humble-services' boot step, after 'steam-user' and before 'store-managers'
   * (D-66.3-17): the Humble user/library/fence/login-window seam of this boot.
   */
  humble: HumbleServices
}
