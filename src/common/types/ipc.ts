import type { OpenDialogOptions, TitleBarOverlay } from 'electron'

import type { SystemInformation } from 'backend/utils/systeminfo'

import type {
  AntiCheatInfo,
  AppSettings,
  ButtonOptions,
  ConnectivityStatus,
  DialogType,
  DiskSpaceData,
  DMQueueElement,
  DownloadManagerState,
  ExecResult,
  ExtraInfo,
  GameAchievement,
  GameInfo,
  GamepadActionArgs,
  GameSettings,
  GameStatus,
  ImportGameArgs,
  InstallInfo,
  InstallParams,
  InstallPlatform,
  KnowFixesInfo,
  LaunchOption,
  LaunchParams,
  MoveGameArgs,
  RecentGame,
  Release,
  Runner,
  RunnerCommandStub,
  RuntimeName,
  RunWineCommandArgs,
  SaveSyncArgs,
  StatusPromise,
  ToolArgs,
  Tools,
  UpdateParams,
  UploadedLogData,
  UserInfo,
  WikiInfo,
  WineCommandArgs,
  WineInstallation,
  WineManagerStatus,
  WineVersionInfo
} from '../types'
import type { CatalogLocaleSettings, CatalogProduct } from './discounts'
import type {
  StoreSearchDeal,
  StoreSearchResult,
  StoreSearchStore
} from './storeSearch'
import type { GOGCloudSavesLocation, UserData } from './gog'
import type { NileLoginData, NileRegisterData, NileUserData } from './nile'
import type { OAuthRunner, OAuthCaptureOutcome } from './oauthLogin'
import type { GameOverride, SelectiveDownload } from './legendary'
import type { GetLogFileArgs } from 'backend/logger/paths'
import type {
  RedeemKeyResult,
  SteamBottleConfig,
  SteamUserData
} from './steam'
import type {
  ClaimAnnotation,
  HumbleAuthState,
  HumbleKey,
  HumbleSyncState,
  HumbleUserData,
  HumbleValidationReport,
  RedeemOutcome,
  RevealOutcome
} from './humble'

// ts-prune-ignore-next
interface SyncIPCFunctions {
  setZoomFactor: (zoomFactor: string) => void
  changeLanguage: (language: string) => void
  notify: (args: { title: string; body: string }) => void
  frontendReady: () => void
  lock: (playing: boolean) => void
  unlock: () => void
  quit: () => void
  openExternalUrl: (url: string) => void
  openFolder: (folder: string) => void
  openSupportPage: () => void
  openReleases: () => void
  openWeblate: () => void
  showAboutWindow: () => void
  openLoginPage: () => void
  openDiscordLink: () => void
  openKofiPage: () => void
  openGithubSponsorsPage: () => void
  openWinePrefixFAQ: () => void
  openWebviewPage: (url: string) => void
  openWikiLink: () => void
  openSidInfoPage: () => void
  openCustomThemesWiki: () => void
  showConfigFileInFolder: (appName: string) => void
  removeFolder: ([path, folderName]: [string, string]) => void
  clearCache: (showDialog?: boolean, fromVersionChange?: boolean) => void
  clearAchievementCache: (appName: string) => void
  resetHeroic: () => void
  createNewWindow: (url: string) => void
  logoutGOG: () => void
  logError: (message: unknown) => void
  logInfo: (message: unknown) => void
  showItemInFolder: (item: string) => void
  clipboardWriteText: (text: string) => void
  processShortcut: (combination: string) => void
  addNewApp: (args: GameInfo) => void
  showLogFileInFolder: (args: GetLogFileArgs) => void
  addShortcut: (appName: string, runner: Runner, fromMenu: boolean) => void
  removeShortcut: (appName: string, runner: Runner) => void
  removeFromDMQueue: (appName: string) => void
  clearDMFinished: () => void
  abort: (id: string) => void
  'connectivity-changed': (newStatus: ConnectivityStatus) => void
  'set-connectivity-online': () => void
  changeTrayColor: () => void
  setSetting: (args: {
    appName: string
    key: keyof AppSettings
    value: unknown
  }) => void
  resumeCurrentDownload: () => void
  pauseCurrentDownload: () => void
  cancelDownload: (removeDownloaded: boolean) => void
  copySystemInfoToClipboard: () => void
  minimizeWindow: () => void
  maximizeWindow: () => void
  unmaximizeWindow: () => void
  closeWindow: () => void
  setFullscreen: (enabled: boolean) => void
  setTitleBarOverlay: (options: TitleBarOverlay) => void
  winetricksInstall: (
    runner: Runner,
    appName: string,
    component: string
  ) => void
  changeGameVersionPinnedStatus: (
    appName: string,
    runner: Runner,
    status: boolean
  ) => void
  logoutZoom: () => void
  logoutSteam: () => void
  humbleDisconnect: () => void
  // D-06 silent cancel: fired when the /loginweb/humble route unmounts
  // before a candidate cookie is accepted.
  humbleStopLogin: () => void
  // D-17: relayed from the /loginweb/humble webview's did-navigate /
  // did-navigate-in-page events to force an immediate re-validation,
  // bypassing the poll-path throttle.
  humbleLoginNavigated: () => void
  setGameMetadataOverride: (args: {
    appName: string
    title?: string
    art_cover?: string
    art_square?: string
  }) => void
}

/*
 * These events should only be used during tests to stub/mock
 *
 * We have to handle them in another interface because these
 * events don't have an IpcMainEvent first argument when handled
 */
interface TestSyncIPCFunctions {
  setLegendaryCommandStub: (stubs: RunnerCommandStub[]) => void
  resetLegendaryCommandStub: () => void
  setGogdlCommandStub: (stubs: RunnerCommandStub[]) => void
  resetGogdlCommandStub: () => void
  setNileCommandStub: (stubs: RunnerCommandStub[]) => void
  resetNileCommandStub: () => void
}

// ts-prune-ignore-next
interface AsyncIPCFunctions {
  kill: (appName: string, runner: Runner) => Promise<void>
  checkDiskSpace: (folder: string) => Promise<DiskSpaceData>
  callTool: (args: Tools) => Promise<void>
  runWineCommand: (
    args: WineCommandArgs
  ) => Promise<{ stdout: string; stderr: string }>
  winetricksInstalled: (runner: Runner, appName: string) => Promise<string[]>
  winetricksAvailable: (runner: Runner, appName: string) => Promise<string[]>
  checkGameUpdates: () => Promise<string[]>
  getEpicGamesStatus: () => Promise<boolean>
  updateAll: () => Promise<({ status: 'done' | 'error' | 'abort' } | null)[]>
  getMaxCpus: () => number
  getHeroicVersion: () => string
  getLegendaryVersion: () => Promise<string>
  getGogdlVersion: () => Promise<string>
  getCometVersion: () => Promise<string>
  getNileVersion: () => Promise<string>
  isFullscreen: () => boolean
  isFrameless: () => boolean
  isMaximized: () => boolean
  isMinimized: () => boolean
  showUpdateSetting: () => boolean
  getLatestReleases: () => Promise<Release[]>
  getCurrentChangelog: () => Promise<Release | null>
  getGameInfo: (appName: string, runner: Runner) => Promise<GameInfo | null>
  getAchievements: (
    appName: string,
    runner: Runner,
    lang?: string
  ) => Promise<GameAchievement[]>
  getExtraInfo: (appName: string, runner: Runner) => Promise<ExtraInfo | null>
  getGameSettings: (
    appName: string,
    runner: Runner
  ) => Promise<GameSettings | null>
  getGOGLinuxInstallersLangs: (appName: string) => Promise<string[]>
  getInstallInfo: (
    appName: string,
    runner: Runner,
    installPlatform: InstallPlatform,
    build?: string,
    branch?: string
  ) => Promise<InstallInfo | null>
  getUserInfo: () => Promise<UserInfo | undefined>
  getAmazonUserInfo: () => Promise<NileUserData | undefined>
  getZoomUserInfo: () => Promise<{ username: string } | undefined>
  isLoggedIn: () => boolean
  login: (sid: string) => Promise<{
    status: 'done' | 'failed'
    data: UserInfo | undefined
  }>
  authGOG: (code: string) => Promise<{
    status: 'done' | 'error'
    data?: UserData
  }>
  authAmazon: (data: NileRegisterData) => Promise<{
    status: 'done' | 'failed'
    user: NileUserData | undefined
  }>
  authZoom: (url: string) => Promise<{ status: 'done' | 'error' }>
  // Phase 34.4.1 Plan 09 (D-04, REQ-34.4.1-08): captures an OAuth redirect code/token for one
  // of the four still-unported login runners (legendary/gog/nile/zoom) via the Tauri
  // login-window seam. This channel captures a redirect -- it does NOT authenticate: `login`,
  // `authGOG`, `authAmazon` and `authZoom` above remain unported and still reject with
  // UNPORTED_CHANNEL_MARKER until Phase 34.5 (SEAM Invariant B). Tauri-only by construction --
  // resolves `{ status: 'unsupported' }` under Electron (no seam installed there).
  oauthCaptureLogin: (params: {
    runner: OAuthRunner
    url: string
  }) => Promise<OAuthCaptureOutcome>
  steamStartQR: () => Promise<{
    status: 'done' | 'error'
    challengeUrl?: string
  }>
  steamPollQR: () => Promise<{
    status: 'done' | 'waiting' | 'error'
    username?: string
  }>
  steamPollCredential: () => Promise<{
    status: 'done' | 'waiting' | 'error'
    username?: string
  }>
  steamStartCredentials: (credentials: {
    username: string
    password: string
  }) => Promise<{ status: 'done' | 'guard_required' | 'error' }>
  steamSubmitGuard: (code: string) => Promise<{ status: 'done' | 'error' }>
  redeemSteamKey: (payload: {
    store: 'steam'
    key: string
  }) => Promise<RedeemKeyResult>
  getSteamUserInfo: () => Promise<SteamUserData | undefined>
  checkSteamInstalled: () => Promise<boolean>
  getSteamSyncedAt: () => Promise<number | null>
  getSteamInstallSize: (appId: string) => Promise<string>
  // Phase 21 (21-09), D-09: registered Steam libraries for the multi-library
  // install-location override picker (D-08 — registered folders only, never
  // an arbitrary filesystem browse). Gated server-side on the D-13 opt-in
  // (see main.ts) — returns [] when native install is OFF.
  listSteamLibraryTargets: () => Promise<
    { path: string; steamappsDir: string; isPrimary: boolean }[]
  >
  // Phase 17 (17-04): provisions the dedicated Steam CrossOver bottle
  // (create via the locked cxbottle mechanism, fetch + non-silently run
  // SteamSetup.exe, D-02). Bottled-Steam auth stays opaque (D-04) — this
  // never inspects loginusers.vdf/sentry.
  steamBottleProvision: (args?: {
    bottleName?: string
    wineVersion?: WineInstallation
  }) => Promise<{ status: 'done' | 'error'; error?: string }>
  isSteamBottleProvisioned: () => Promise<boolean>
  steamBottleStatus: () => Promise<
    Pick<SteamBottleConfig, 'provisioned' | 'bottleName'>
  >
  // Phase 21 (21-10), D-10: on user consent, downloads + non-silently runs
  // (Win/macOS) or link-opens (Linux) the official native Steam client
  // installer. See clientSetup.ts's startGuidedClientInstall.
  steamClientSetupStart: () => Promise<{
    status: 'started' | 'link-opened' | 'error'
    error?: string
  }>
  // Phase 21 (21-10), D-10/D-11: re-checks ensureSteamClientReady(appId)
  // after the user has acted (finished the guided install, or launched
  // Steam once) — the frontend polls/re-checks this to know when to retry
  // the install. appId is guarded server-side (T-21-05) inside
  // ensureSteamClientReady itself, the single seam both this handler and
  // SteamGame.install() go through.
  steamClientSetupRecheck: (appId: string) => Promise<{
    status: 'ready' | 'needs-install' | 'needs-launch'
    ready: boolean
    error?: string
  }>
  // `'cancelled'` (quick task 260808-gl6) = the user closed the sign-in window. Distinct
  // from `'error'` (the watch could not continue) so the renderer can return to Manage
  // Accounts silently instead of rendering a failure panel — see humble/user.ts's
  // LoginResult.
  humbleStartLogin: () => Promise<{
    status: 'done' | 'waiting' | 'error' | 'cancelled'
    username?: string
  }>
  humbleGetUserInfo: () => Promise<HumbleUserData | undefined>
  humbleReconnect: () => Promise<{
    status: 'done' | 'waiting' | 'error' | 'cancelled'
    username?: string
  }>
  humbleCheckHealth: () => Promise<void>
  // D-05/D-07/UA note: standard-Chrome UA applied to the /loginweb/humble
  // webview's `useragent` attribute so Google SSO offers its normal
  // password / "Try another way" flows instead of embedded-browser
  // restrictions.
  humbleGetLoginUserAgent: () => Promise<string>
  // Plan 05 (Phase 10): dev-only D-12 validation trigger. Wired only behind a
  // dev-flag guard in backend/main.ts (never in packaged builds, T-10-16) —
  // exercises the real adapter with the real stored cookie and returns a
  // redacted HumbleValidationReport (D-15, no cookie/gamekey values).
  humbleRunValidation: () => Promise<HumbleValidationReport>
  // Phase 11 (library.ts, Plan 02): triggers a bounded-concurrency sync
  // (D-23/D-25). Returns the overall outcome — never throws; failures are
  // fail-soft (D-31), surfaced via humbleGetSyncState instead.
  humbleSync: () => Promise<{ status: 'ok' | 'partial' | 'failed' }>
  // Returns the current display-safe key inventory from humbleLibraryStore
  // (never the generic storeGet bridge — WR-09 finding, T-11 store isolation).
  humbleGetKeys: () => Promise<HumbleKey[]>
  humbleGetSyncState: () => Promise<HumbleSyncState>
  // Phase 12 (Plan 04, D-42): "Not the same game" override for a
  // fuzzy-matched ownership row. Only ever meaningful for
  // matchConfidence === 'fuzzy' keys — the backend validates this
  // server-side (never trust renderer-only gating) and no-ops for an
  // exact-match machineName.
  humbleSetOwnershipOverride: (machineName: string) => Promise<void>
  humbleClearOwnershipOverride: (machineName: string) => Promise<void>
  // WR-04 (14-REVIEW): machineName->overriddenAt (ms) map of every recorded
  // "Not the same game" override, so the undo affordance can key off "an
  // override record exists" rather than the (cleared-by-the-override)
  // fuzzy/owned flags.
  humbleGetOwnershipOverrides: () => Promise<Record<string, number>>
  // Phase 13 (Plan 02, D-59/D-57 resolution): confirms the user completed the
  // "Open Humble" gift action for a giftable-spares key (an
  // ownedElsewhere && state === 'UNREVEALED' key). The backend re-validates
  // both conditions server-side (never trust renderer-only gating) and
  // no-ops for an ineligible machineName. No gift-link value ever crosses
  // this channel — D-57 resolved to a static deep-link GameLib never
  // possesses.
  humbleRecordGiftLinkOpened: (machineName: string) => Promise<void>
  // Returns the machineName->giftedAt (ms) map from humbleGiftedAtStore so
  // the Spares view can disable/label an already-gifted key (D-59).
  humbleGetGiftedAt: () => Promise<Record<string, number>>
  // Phase 14 guided claim flow (HCLAIM-01/02). Both gamekey AND machineName
  // are required (composite-key discipline, Pattern 3) — unlike the older
  // machineName-only channels above. Returns the revealed key value directly
  // (never persisted to a broadcast type — C4/T-14-02).
  humbleRevealKey: (params: {
    gamekey: string
    machineName: string
  }) => Promise<RevealOutcome>
  // Phase 14 (HCLAIM-04, D-77): marks a key as locally redeemed. Backend
  // re-validates eligibility server-side (never trust renderer-only gating).
  humbleMarkRedeemed: (params: {
    gamekey: string
    machineName: string
  }) => Promise<RedeemOutcome>
  // Phase 14: reverses a local-only "Mark as redeemed" action (Undo
  // affordance) — never applicable to a server-confirmed redeem.
  humbleUndoRedeemed: (params: {
    gamekey: string
    machineName: string
  }) => Promise<void>
  // Phase 14: returns the previously-revealed key value for a key that was
  // already revealed in an earlier session, or null if not yet revealed
  // (Pitfall B — REVEALED flag set but no confirmed key value stored yet).
  humbleGetRevealedKeyValue: (params: {
    gamekey: string
    machineName: string
  }) => Promise<string | null>
  // Phase 14: per-key reveal/redeem annotations, keyed by the composite
  // `gamekey:machineName` string, for the claim-flow wizard/list UI.
  humbleGetClaimAnnotations: () => Promise<Record<string, ClaimAnnotation>>
  logoutLegendary: () => Promise<void>
  logoutAmazon: () => Promise<void>
  getAlternativeWine: () => Promise<WineInstallation[]>
  readConfig: (config_class: 'library' | 'user') => Promise<GameInfo[] | string>
  requestAppSettings: () => AppSettings
  requestGameSettings: (appName: string) => Promise<GameSettings>
  writeConfig: (args: { appName: string; config: Partial<AppSettings> }) => void
  refreshLibrary: (library?: Runner | 'all') => Promise<void>
  launch: (args: LaunchParams) => StatusPromise
  openDialog: (args: OpenDialogOptions) => Promise<string | false>
  install: (args: InstallParams) => Promise<void>
  uninstall: (
    appName: string,
    runner: Runner,
    shouldRemovePrefix: boolean,
    shoudlRemoveSetting: boolean
  ) => Promise<void>
  repair: (appName: string, runner: Runner) => Promise<void>
  moveInstall: (args: MoveGameArgs) => Promise<void>
  importGame: (args: ImportGameArgs) => StatusPromise
  updateGame: (args: UpdateParams) => Promise<void>
  changeInstallPath: (args: MoveGameArgs) => Promise<void>
  egsSync: (arg: string) => Promise<string>
  syncGOGSaves: (
    gogSaves: GOGCloudSavesLocation[],
    appname: string,
    arg: string
  ) => Promise<string>
  syncSaves: (args: SaveSyncArgs) => Promise<string>
  gamepadAction: (args: GamepadActionArgs) => Promise<void>
  runWineCommandForGame: (args: RunWineCommandArgs) => Promise<ExecResult>
  getShellPath: (path: string) => Promise<string>
  getWebviewPreloadPath: () => string
  clipboardReadText: () => string
  getCustomThemes: () => Promise<string[]>
  getThemeCSS: (theme: string) => Promise<string>
  isNative: (args: { appName: string; runner: Runner }) => boolean
  getLogContent: (args: GetLogFileArgs) => string
  installWineVersion: (release: WineVersionInfo) => Promise<void>
  refreshWineVersionInfo: (fetch?: boolean) => Promise<void>
  removeWineVersion: (release: WineVersionInfo) => Promise<void>
  'wine.isValidVersion': (release: WineInstallation) => Promise<boolean>
  shortcutsExists: (appName: string, runner: Runner) => boolean
  addToSteam: (appName: string, runner: Runner) => Promise<boolean>
  removeFromSteam: (appName: string, runner: Runner) => Promise<void>
  isAddedToSteam: (appName: string, runner: Runner) => Promise<boolean>
  getAnticheatInfo: (appNamespace: string) => Promise<AntiCheatInfo | null>
  getKnownFixes: (appName: string, runner: Runner) => KnowFixesInfo | null
  getGameMetadataOverride: (appName: string) => Promise<{
    title?: string
    art_cover?: string
    art_square?: string
  } | null>
  getAllGameOverrides: () => Promise<
    Record<
      string,
      {
        title?: string
        art_cover?: string
        art_square?: string
      }
    >
  >
  // Phase 19 (Plan 06): bulk CrossOver-rating resolver (D-11/D-16). Keyed by
  // `app_name`; `number` = matched rating, `null` = eligible & consulted with
  // no record, key-absent = never looked up (ineligible under the D-02 gate).
  getCrossoverIndex: () => Promise<Record<string, number | null>>
  getEosOverlayStatus: () => {
    isInstalled: boolean
    version?: string
    install_path?: string
  }
  getLatestEosOverlayVersion: () => Promise<string>
  updateEosOverlayInfo: () => Promise<void>
  installEosOverlay: () => Promise<string | undefined>
  removeEosOverlay: () => Promise<boolean>
  enableEosOverlay: (
    appName: string
  ) => Promise<{ wasEnabled: boolean; installNow?: boolean }>
  disableEosOverlay: (appName: string) => Promise<void>
  isEosOverlayEnabled: (appName?: string) => Promise<boolean>
  downloadRuntime: (runtime_name: RuntimeName) => Promise<boolean>
  isRuntimeInstalled: (runtime_name: RuntimeName) => Promise<boolean>
  getDMQueueInformation: () => {
    elements: DMQueueElement[]
    finished: DMQueueElement[]
    state: DownloadManagerState
  }
  'get-connectivity-status': () => {
    status: ConnectivityStatus
    retryIn: number
  }
  getSystemInfo: (cache?: boolean) => Promise<SystemInformation>
  removeRecent: (appName: string) => Promise<void>
  getWikiGameInfo: (
    title: string,
    appName: string,
    runner: Runner,
    forceRefresh?: boolean
  ) => Promise<WikiInfo | null>
  getDefaultSavePath: (
    appName: string,
    runner: Runner,
    alreadyDefinedGogSaves: GOGCloudSavesLocation[]
  ) => Promise<string | GOGCloudSavesLocation[]>
  isGameAvailable: (args: {
    appName: string
    runner: Runner
  }) => Promise<boolean>
  toggleDXVK: (args: ToolArgs) => Promise<boolean>
  toggleVKD3D: (args: ToolArgs) => Promise<boolean>
  toggleDXVKNVAPI: (args: ToolArgs) => Promise<boolean>
  pathExists: (path: string) => Promise<boolean>
  getLaunchOptions: (appName: string, runner: Runner) => Promise<LaunchOption[]>
  getGameOverride: () => Promise<GameOverride>
  getGameSdl: (appName: string) => Promise<SelectiveDownload[]>
  getPlaytimeFromRunner: (
    runner: Runner,
    appName: string
  ) => Promise<number | undefined>
  getAmazonLoginData: () => Promise<NileLoginData>
  hasExecutable: (executable: string) => Promise<boolean>

  setPrivateBranchPassword: (appName: string, password: string) => void
  getPrivateBranchPassword: (appName: string) => string

  getAvailableCyberpunkMods: () => Promise<string[]>
  setCyberpunkModConfig: (props: {
    enabled: boolean
    modsToLoad: string[]
  }) => Promise<void>

  uploadLogFile: (
    name: string,
    args: GetLogFileArgs
  ) => Promise<false | [string, UploadedLogData]>
  deleteUploadedLogFile: (url: string) => Promise<boolean>
  getUploadedLogFiles: () => Promise<Record<string, UploadedLogData>>
  getCustomCSS: () => Promise<string>
  isIntelMac: () => boolean
  getGogDiscounts: (
    locale: CatalogLocaleSettings,
    hideOwned?: boolean,
    wishlistOnly?: boolean
  ) => Promise<CatalogProduct[]>
  searchStores: (query: string) => Promise<StoreSearchResult[]>
  getStoreSearchDeals: (gameId: string) => Promise<StoreSearchDeal[]>
  getStoreSearchStoreMap: () => Promise<Record<string, StoreSearchStore>>
  'steamgriddb.hasApiKey': () => Promise<boolean>
  'steamgriddb.setApiKey': (key: string) => Promise<void>
  'steamgriddb.searchGame': (
    query: string
  ) => Promise<Array<{ id: number; name: string }>>
  'steamgriddb.getGrids': (args: {
    gameId: number
    styles?: string[]
    dimensions?: string[]
  }) => Promise<Array<{ id: number; url: string; thumb: string }>>
  'steamgriddb.getHeroes': (args: {
    gameId: number
    styles?: string[]
    dimensions?: string[]
  }) => Promise<Array<{ id: number; url: string; thumb: string }>>
}

interface FrontendMessages {
  gameStatusUpdate: (status: GameStatus) => void
  wineVersionsUpdated: () => void
  showDialog: (
    title: string,
    message: string,
    type: DialogType,
    buttons?: Array<ButtonOptions>
  ) => void
  changedDMQueueInformation: (
    elements: DMQueueElement[],
    state: DownloadManagerState
  ) => void
  maximized: () => void
  unmaximized: () => void
  fullscreen: (status: boolean) => void
  refreshLibrary: (runner?: Runner) => void
  openScreen: (screen: string) => void
  'connectivity-changed': (status: {
    status: ConnectivityStatus
    retryIn: number
  }) => void
  launchGame: (appName: string, runner: Runner, args: string[]) => void
  installGame: (appName: string, runner: Runner) => void
  recentGamesChanged: (newRecentGames: RecentGame[]) => void
  pushGameToLibrary: (info: GameInfo) => void
  // Phase 17 (17-04): pushed by SteamGame.install()/launch() (17-05) when a
  // bottle-eligible game is un-provisioned; the global listener (17-06)
  // subscribes to this to drive the guided-setup flow.
  steamBottleSetupRequired: (payload: { appName: string }) => void
  // Phase 24 (24-06), D-05/D-06: pushed by helperProcess.ts's
  // ensureBridgeHelperReady() when the shared native Steam-bridge helper is
  // not ready (unreachable within the poll budget, or up but not inited
  // against a live Steam session -- 'not-inited' is a DISTINCT reason from
  // 'unreachable', review finding #7). Registered here -- the first
  // producer wave -- so sendFrontendMessage('steamBridgeSetupRequired', ...)
  // typechecks at first use (finding #1). 24-08 is the first CONSUMER (adds
  // fallbackAvailable to the payload it sends).
  steamBridgeSetupRequired: (payload: {
    appName: string
    reason?: string
    fallbackAvailable?: boolean
  }) => void
  // Phase 21 (21-10), D-10/D-11: pushed by clientSetup.ts's
  // ensureSteamClientReady() (native depot-download opt-in ON, non-bottle
  // path) when the Steam CLIENT itself is either absent ('install') or
  // installed-but-never-launched ('launch-once'). Distinct from
  // steamBottleSetupRequired above — that event is the macOS CrossOver
  // BOTTLE flow; this one is the native/host Steam client itself.
  steamClientSetupRequired: (payload: {
    appName: string
    reason: 'install' | 'launch-once'
  }) => void
  // Emitted while Steam per-game metadata/art is being fetched in the
  // background (throttled). `syncing: true` when the first fetch starts,
  // `false` once the last one finishes — drives the library sync indicator.
  steamMetadataSyncing: (payload: { syncing: boolean }) => void
  progressOfWinetricks: (payload: {
    messages: string[]
    installingComponent: string
  }) => void
  progressOfWineManager: (version: string, progress: WineManagerStatus) => void
  'installing-winetricks-component': (component: string) => void
  logFileUploaded: (url: string, data: UploadedLogData) => void
  logFileUploadDeleted: (url: string) => void
  progressUpdate: (progress: GameStatus) => void
  metadataChanged: (
    overrides: Record<
      string,
      { title?: string; art_cover?: string; art_square?: string }
    >
  ) => void
  // Phase 19 (Plan 06): pushed after a validated background CrossOver-index
  // refresh so the grid picks up freshly resolved ratings without a manual
  // pull. Same three-state shape as `getCrossoverIndex`'s resolved map.
  crossoverIndexChanged: (index: Record<string, number | null>) => void
  // Plan 02 (Phase 10): pushed by HumbleUser.checkHealthAndFlagExpiry() on a
  // startup/401 expiry detection. MUST NOT include the session cookie
  // (Pitfall 4 / T-10-05) — HumbleAuthState is structurally cookie-free.
  humbleAuthState: (state: HumbleAuthState) => void
  // Phase 11 (library.ts, Plan 02): pushed after each sync commits fresh
  // data. Carries the display-safe HumbleKey[] only — no cookie, no raw
  // key value (C4 / T-11-01).
  humbleKeysUpdated: (keys: HumbleKey[]) => void
  // Phase 11 (library.ts, Plan 02): progressive-fill sync progress (D-26).
  // No cookie, no raw key/gamekey values — counts only.
  humbleSyncProgress: (progress: { done: number; total: number }) => void
  // Live-UAT round 2 (D-31/D-32): terminal sync-state push, emitted on EVERY
  // HumbleLibrary.sync() exit path. The single authoritative end-of-sync
  // signal — carries syncedAt/syncError/cooldownUntil so the freshness line
  // and the fail-soft banner update in-session. Display-safe by type: no
  // cookie, no key values.
  humbleSyncStateChanged: (state: HumbleSyncState) => void

  // Used inside tests, so we can be a bit lenient with the type checking here
  message: (...params: unknown[]) => void
}

export type {
  SyncIPCFunctions,
  TestSyncIPCFunctions,
  AsyncIPCFunctions,
  FrontendMessages
}
