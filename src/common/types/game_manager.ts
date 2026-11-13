import {
  ExtraInfo,
  GameInfo,
  InstallPlatform,
  GameSettings,
  ExecResult,
  InstallArgs,
  InstallInfo,
  LaunchOption,
  GOGAchievement
} from 'common/types'
import { GOGCloudSavesLocation } from './gog'
import type LogWriter from 'backend/logger/log_writer'

// 37-02 (D-06/D-07): the structured affordance an install failure carries,
// declared here (common/) rather than imported from
// backend/storeManagers/steam/depotErrors.ts's DepotErrorAction, since
// common/ must not import from backend/. depotErrors.ts's own
// `DepotErrorAction` is declared as an alias of this same union so the two
// can never drift apart.
export type InstallErrorAction = 'retry' | 'signIn' | 'none'

export interface InstallResult {
  status: 'done' | 'error' | 'abort'
  error?: string
  // Steam bottle (Phase 17): set when install() did NOT actually install because
  // the dedicated Steam bottle isn't provisioned yet — the guided setup was
  // requested instead. The DownloadManager uses this to clear the transient
  // 'installing' badge, since no ACF poller starts in this case.
  deferredToSetup?: boolean
  // D-04 (37-10, second half): set when a native Steam install landed in a
  // safe `app_<id>` fallback directory because PICS returned no usable
  // `config.installdir` (absent/unresolved) — not an error, the install
  // still succeeded, but the on-disk layout is non-portable/non-human-readable.
  installdirFallbackUsed?: boolean
  // 37-02 (D-06/D-07): the classified affordance for an `error` status —
  // undefined means "no specific affordance" (e.g. a pre-download failure
  // that never reached classifyDepotError). Forwarded from
  // DepotDownloadOutcome.errorAction untouched; never re-classified here.
  errorAction?: InstallErrorAction
  // Set when a Steam-registered update was handed to the Steam client and an
  // update-aware poll now owns the game's status; the DownloadManager must not
  // send its own 'done' (74 UAT 17).
  handedOffToSteam?: boolean
}

export type RemoveArgs = {
  shouldRemovePrefix?: boolean
  deleteFiles?: boolean
}

export interface Game {
  getSettings: () => Promise<GameSettings>
  getGameInfo: () => GameInfo
  getExtraInfo: () => Promise<ExtraInfo>
  importGame: (path: string, platform: InstallPlatform) => Promise<ExecResult>
  onInstallOrUpdateOutput: (
    action: 'installing' | 'updating',
    data: string,
    totalDownloadSize: number
  ) => void
  install: (args: InstallArgs) => Promise<InstallResult>
  isNative: () => boolean
  addShortcuts: (fromMenu?: boolean) => Promise<void>
  removeShortcuts: () => Promise<void>
  launch: (
    logWriter: LogWriter,
    launchArguments?: LaunchOption,
    args?: string[],
    skipVersionCheck?: boolean
  ) => Promise<boolean>
  moveInstall: (newInstallPath: string) => Promise<InstallResult>
  repair: () => Promise<ExecResult>
  syncSaves: (
    arg: string,
    path: string,
    gogSaves?: GOGCloudSavesLocation[]
  ) => Promise<string>
  uninstall: (args: RemoveArgs) => Promise<ExecResult>
  update: (updateOverwrites?: {
    build?: string
    branch?: string
    language?: string
    dlcs?: string[]
    dependencies?: string[]
    /** Auto-update: no user present; other stores ignore it. */
    unattended?: boolean
  }) => Promise<InstallResult>
  forceUninstall: () => Promise<void>
  stop: (stopWine?: boolean) => Promise<void>
  isGameAvailable: () => Promise<boolean>
  getAchievements?: (lang: string) => Promise<GOGAchievement[]>
}

export interface LibraryManager {
  init: () => Promise<void>
  getGame: (id: string) => Game
  refresh: () => Promise<ExecResult | null>
  getGameInfo: (appName: string, forceReload?: boolean) => GameInfo | undefined
  /**
   * Synchronous enumeration of every game this runner knows about (installed
   * or not), read from the manager's own persisted library store — no
   * network. Consumed by `crossover_index/ipc_handler.ts`'s
   * `buildCrossoverRatingMap` (Phase 19 Plan 06) to resolve a rating for
   * every library title without a per-runner special case.
   */
  getListOfGames: () => GameInfo[]
  getInstallInfo: (
    appName: string,
    installPlatform: InstallPlatform,
    options: {
      branch?: string
      build?: string
      lang?: string
      retries?: number
    }
  ) => Promise<InstallInfo | undefined>
  listUpdateableGames: () => Promise<string[]>
  /**
   * Optional. The subset of listUpdateableGames that may be queued without a
   * click under autoUpdateGames. Absent means "same as listUpdateableGames".
   * Phase 74 D-02: Steam-registered games are updated by Steam on its own
   * schedule; GameLib never queues them.
   */
  listAutoUpdateableGames?: () => Promise<string[]>
  changeGameInstallPath: (appName: string, newPath: string) => Promise<void>
  changeVersionPinnedStatus: (appName: string, status: boolean) => void
  installState: (appName: string, state: boolean) => void
  getLaunchOptions: (
    appName: string
  ) => LaunchOption[] | Promise<LaunchOption[]>
  /**
   * Optional — only Steam implements this.
   * Re-reads ACF manifests on BrowserWindow 'focus' to reconcile install badges
   * without background polling (D-01/D-02). Focus handler in main.ts invokes
   * this via optional chaining so other runners remain unaffected.
   */
  refreshInstallState?: () => Promise<void>
}
