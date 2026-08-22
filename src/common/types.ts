import {
  GOGCloudSavesLocation,
  GogInstallInfo,
  GogInstallPlatform
} from './types/gog'
import {
  LegendaryInstallPlatform,
  GameMetadataInner,
  LegendaryInstallInfo
} from './types/legendary'
import { NileInstallInfo, NileInstallPlatform } from './types/nile'
import {
  ZoomInstallPlatform,
  ZoomInstalledInfo,
  ZoomInstallInfo
} from './types/zoom'
import { TitleBarOverlay } from 'electron'
import { ChildProcess } from 'child_process'
import type { HeroicHowLongToBeatEntry } from 'backend/wiki_game_info/howlongtobeat/utils'
import type { Path } from 'backend/schemas'
import type LogWriter from 'backend/logger/log_writer'

export type Runner =
  | 'legendary'
  | 'gog'
  | 'sideload'
  | 'nile'
  | 'zoom'
  | 'steam'

// NOTE: Do not put enum's in this module or it will break imports

export type DialogType = 'MESSAGE' | 'ERROR'

export interface ButtonOptions {
  text: string
  onClick?: () => void
  // 37-02 (D-07): a serializable discriminator for a backend-composed
  // button. `onClick` is a function and does NOT survive the
  // `sendFrontendMessage('showDialog', ...)` structured-clone/JSON hop
  // (backend/dialog/dialog.ts) — a button built in the backend with only
  // `onClick` renders its text and does nothing once it reaches the
  // renderer. `action` is the serializable half: the renderer
  // (DialogHandler) maps a recognized literal back to a real handler
  // (e.g. `'steamSignIn'` -> `navigate('/login')`) before the button is
  // ever rendered. Never a URL or arbitrary string — an enum, so no
  // externally-influenced value can become a navigation target.
  action?: 'steamSignIn'
}

export type LaunchParams = {
  appName: string
  launchArguments?: LaunchOption
  runner: Runner
  skipVersionCheck?: boolean
  args?: string[]
}

export type LaunchOption =
  | BaseLaunchOption
  | AltExeLaunchOption
  | DLCLaunchOption

// Option to append extra parameters to the launch command
interface BaseLaunchOption {
  type?: 'basic'
  name: string
  parameters: string
}

// Option to launch an alternative executable instead
interface AltExeLaunchOption {
  type: 'altExe'
  executable: Path
}

// Option to launch a DLC (another game) instead of the base game
interface DLCLaunchOption {
  type: 'dlc'
  dlcAppName: string
  dlcTitle: string
}

interface About {
  description: string
  shortDescription: string
}

export type Release = {
  type: 'stable' | 'beta'
  html_url: string
  name: string
  tag_name: string
  published_at: string
  prerelease: boolean
  id: number
  body?: string
}

export type ExperimentalFeatures = {
  enableHelp: boolean
  cometSupport: boolean
  umuSupport?: boolean
  zoomPlatform?: boolean
}

export interface AppSettings extends GameSettings {
  analyticsOptIn: boolean
  notifyHumbleExpirations: boolean
  addDesktopShortcuts: boolean
  addStartMenuShortcuts: boolean
  addSteamShortcuts: boolean
  altGogdlBin: string
  altCometBin: string
  altLegendaryBin: string
  altNileBin: string
  autoUpdateGames: boolean
  checkForUpdatesOnStartup: boolean
  checkUpdatesInterval: number
  customCSS: string
  customThemesPath: string
  customWinePaths: string[]
  darkTrayIcon: boolean
  defaultInstallPath: string
  defaultSteamPath: string
  sharedWinePrefix: string
  defaultWinePrefix: string // only here for backwards compatibility, don't use in new code
  defaultWinePrefixDir: string
  disableController: boolean
  disablePlaytimeSync: boolean
  disableSmoothScrolling: boolean
  disableLogs: boolean
  disableAnimations: boolean
  discordRPC: boolean
  disableGOGPresence: boolean
  downloadNoHttps: boolean
  downloadProtonToSteam: boolean
  enableSteamNativeInstall: boolean
  egsLinkedPath: string
  enableUpdates: boolean
  exitToTray: boolean
  gamepadRepeatDelay: number
  gamepadInitialRepeatDelay: number
  noTrayIcon: boolean
  experimentalFeatures?: ExperimentalFeatures
  framelessWindow: boolean
  hideChangelogsOnStartup: boolean
  hideWindowOnProtocolLaunch: boolean
  libraryTopSection: LibraryTopSectionOptions
  maxRecentGames: number
  maxWorkers: number
  minimizeOnLaunch: boolean
  startInConsoleMode: boolean
  startInTray: boolean
  allowInstallationBrokenAnticheat: boolean
  disableUMU: boolean
  verboseLogs: boolean
  showValveProton: boolean
  steamGridDbApiKey: string
}

export type LibraryTopSectionOptions =
  | 'disabled'
  | 'recently_played'
  | 'recently_played_installed'
  | 'favourites'

export type ExecResult = {
  stderr: string
  stdout: string
  fullCommand?: string
  error?: string
  abort?: boolean
}

export interface ExtraInfo {
  about?: About
  reqs: Reqs[]
  releaseDate?: string
  storeUrl?: string
  changelog?: string
  genres?: string[]
  /** total playtime in minutes from getUserOwnedApps() — undefined for non-Steam games */
  steamPlaytimeMinutes?: number
  /** Unix-seconds timestamp of the last play session from getUserOwnedApps() — undefined/0 for non-Steam games */
  steamLastPlayed?: number
}

export type GameConfigVersion = 'auto' | 'v0' | 'v0.1'

export type GOGAchievement = {
  achievement_id: string
  achievement_key: string
  visible: boolean
  name: string
  description: string
  image_url_unlocked: string
  image_url_locked: string
  rarity: number
  date_unlocked: string | null
  rarity_level_description: string
  rarity_level_slug: string
}

export type GameAchievement = GOGAchievement

export interface GameInfo {
  runner: 'legendary' | 'gog' | 'sideload' | 'nile' | 'zoom' | 'steam'
  store_url?: string
  app_name: string
  art_cover: string
  art_logo?: string
  art_background?: string
  art_icon?: string
  art_square: string
  cloud_save_enabled?: boolean
  developer?: string
  extra?: ExtraInfo
  folder_name?: string
  install: Partial<InstalledInfo>
  installable?: boolean
  is_installed: boolean
  namespace?: string
  // NOTE: This is the save folder without any variables filled in...
  save_folder?: string
  // ...and this is the folder with them filled in
  save_path?: string
  gog_save_location?: GOGCloudSavesLocation[]
  title: string
  canRunOffline: boolean
  thirdPartyManagedApp?: string
  isEAManaged?: boolean
  isUbisoftManaged?: boolean
  is_mac_native?: boolean
  /** MAC32-01: resolved macOS build architecture. Absent key / 'unknown' means
   * "not resolved" — a missing or blank Steam `osarch` tag is NEVER coerced to
   * '32' (the documented false-32-bit-flag trap). '32' routes the game to the
   * CrossOver/Wine bottle (32-bit dropped in Catalina/2019); '64' and 'unknown'
   * both stay on native macOS handling. */
  mac_arch?: '32' | '64' | 'unknown'
  is_linux_native?: boolean
  /** D-17: Windows-depot availability signal, mirroring
   * `SteamMetadataCacheEntry.is_windows_native`. Sourced from
   * `data.platforms.windows` on the SAME `appdetails` response that already
   * yields `data.platforms.mac` / `data.platforms.linux` — persisted by
   * 34.13-02, hydrated onto `GameInfo` in `library.ts`. Load-bearing
   * contract: only `=== true` permits offering a Windows install. `undefined`
   * means "never captured" (pre-34.13 cache entries) and MUST NOT be coerced
   * to available — forcing a Windows install of a game with no Windows depot
   * is an explicitly Deferred Idea. Per the UI-SPEC, the Windows `MenuItem`
   * is ABSENT (never present-but-disabled) when this is not `=== true`. */
  is_windows_native?: boolean
  /** Delisted = confirmed unavailable on Steam (appdetails success:false).
   * When true the game is hidden from Console and not activatable. */
  is_delisted?: boolean
  /** Phase 17 D-08 reconciliation — mirrors steamMetadataStore.platformsCaptured
   * so the frontend bottle indicator matches the backend D-11 routing gate. */
  steamPlatformsCaptured?: boolean
  browserUrl?: string
  description?: string
  //used for store release versions. if remote !== local, then update
  version?: string
  dlcList?: GameMetadataInner[]
  customUserAgent?: string
  launchFullScreen?: boolean
  overrides?: {
    title?: string
    art_cover?: string
    art_square?: string
  }
}

export interface GameSettings {
  autoInstallDxvk: boolean
  autoInstallVkd3d: boolean
  autoInstallDxvkNvapi: boolean
  autoSyncSaves: boolean
  battlEyeRuntime: boolean
  DXVKFpsCap: string //Entered as string but used as number
  eacRuntime: boolean
  enableDXVKFpsLimit: boolean
  enableEsync: boolean
  enableFSR: boolean
  enableMsync: boolean
  enableFsync: boolean
  enableWineWayland: boolean
  enableHDR: boolean
  enableWoW64: boolean
  gamescope: GameScopeSettings
  enviromentOptions: EnviromentVariable[]
  ignoreGameUpdates: boolean
  language: string
  launcherArgs: string
  lastUsedLaunchOption?: LaunchOption
  maxSharpness?: number
  nvidiaPrime: boolean
  offlineMode: boolean
  otherOptions?: string //deprecated
  preferSystemLibs: boolean
  showFps: boolean
  showMangohud: boolean
  targetExe: string
  useGameMode: boolean
  wineCrossoverBottle: string
  winePrefix: string
  wineVersion: WineInstallation
  wrapperOptions: WrapperVariable[]
  savesPath: string
  gogSaves?: GOGCloudSavesLocation[]
  beforeLaunchScriptPath: string
  afterLaunchScriptPath: string
  disableUMU: boolean
  verboseLogs: boolean
  advertiseAvxForRosetta: boolean
  enableQuickSavesMenu: boolean
}

export type Status =
  | 'installing'
  | 'importing'
  | 'updating'
  | 'launching'
  | 'playing'
  | 'uninstalling'
  | 'repairing'
  | 'done'
  | 'canceled'
  | 'moving'
  | 'queued'
  | 'error'
  | 'syncing-saves'
  | 'notAvailable'
  | 'notSupportedGame'
  | 'notInstalled'
  | 'installed'
  | 'redist'
  | 'extracting'
  | 'winetricks'

export interface GameStatus {
  appName: string
  progress?: InstallProgress
  folder?: string
  context?: string // Additional context e.g current step
  runner?: Runner
  status: Status
}

export type GlobalConfigVersion = 'auto' | 'v0'
export interface InstallProgress {
  bytes: string
  eta: string
  folder?: string
  percent?: number
  downSpeed?: number
  diskSpeed?: number
  file?: string
}
export interface InstalledInfo {
  manifest?: {
    disk_size: number
    download_size: number
    app_name: string
    languages: string[]
    versionEtag: string
    dependencies: string[]
    perLangSize: {
      [key: string]: {
        download_size: number
        disk_size: number
      }
    }
  }
  executable: string
  install_path: string
  install_size: string
  is_dlc: boolean
  isDosbox?: boolean
  dosboxConf?: string[]
  version: string
  platform: InstallPlatform
  appName?: string
  installedWithDLCs?: boolean // OLD DLC boolean (all dlcs installed)
  installedDLCs?: string[] // New installed GOG DLCs array
  language?: string // For GOG games
  versionEtag?: string // Checksum for checking GOG updates
  buildId?: string // For verifing and version pinning of GOG games
  branch?: string // GOG beta channels
  // Whether to skip update check for this title (currently only used for GOG as it is the only platform actively supporting version rollback)
  pinnedVersion?: boolean
  cyberpunk?: {
    // Cyberpunk compatibility options
    modsEnabled: boolean
    modsToLoad: string[] // If this is empty redmod will load mods in alphabetic order
  }
  // steam-startup-resume-crash (2026-07-18) / D-04 softened: set true when
  // SteamLibraryManager.init() detects a leftover interrupted (StateFlags
  // 1026) download on startup. Surfaces the game as resumable without
  // auto-driving any heavy depot work unattended — the user's own Install
  // click (SteamGame.install()) clears this and performs the resume.
  // 260821-rb5: as of this task, this flag has a THIRD writer — the
  // install-start breadcrumb below — in addition to the startup ACF scan
  // and markSteamInstallIncomplete.
  steamResumePending?: boolean
  // 260821-rb5: crash-surviving resume breadcrumb. Written at native depot
  // install START (games.ts's runNativeDepotDownload, before the
  // downloadSteamDepots await) and persisted immediately to
  // steamLibraryStore so a kill -9 microseconds later still finds them on
  // disk. Closes case C of the aborted-depot-residue todo
  // (.planning/todos/pending/2026-08-16-aborted-depot-residue-has-no-acf.md):
  // no JS runs at teardown, so no appmanifest_*.acf is ever written and
  // scanDownloadingAppIds can never see the residue.
  //
  // The PRESENCE of steamResumeInstalldir is the breadcrumb discriminator.
  // steamResumePending alone is ambiguous — it is also set by the
  // ACF-derived startup scan and by markSteamInstallIncomplete. Only a
  // breadcrumb-carrying entry participates in init()'s startup self-heal
  // check.
  //
  // These hold the values ACTUALLY used by the run (including
  // opts.targetSteamappsDirOverride, i.e. a bottle steamapps root), never a
  // re-derived guess.
  //
  // They are cleared on the successful (status: 'done') route and by
  // init()'s self-heal; they deliberately SURVIVE an errored or cancelled
  // run, because those leave residue too.
  steamResumeTargetSteamappsDir?: string
  steamResumeInstalldir?: string
}

export interface Reqs {
  minimum: string
  recommended: string
  title: string
}

export type SyncType = 'Download' | 'Upload' | 'Force download' | 'Force upload'

export type UserInfo = {
  account_id: string
  displayName: string
  user: string
}
export interface WineInstallation {
  bin: string
  name: string
  type: 'wine' | 'proton' | 'crossover' | 'toolkit'
  lib?: string
  lib32?: string
  wineserver?: string
}

export interface InstallArgs {
  path: string
  platformToInstall: InstallPlatform
  installDlcs?: Array<string>
  sdlList?: string[]
  installLanguage?: string
  branch?: string
  build?: string
  dependencies?: string[]
  /** D-17: install-time override that routes a Steam install into the
   * `GameLibSteam` Wine bottle instead of native macOS handling, EVEN THOUGH
   * `platformToInstall` is hardcoded `'Windows'` for every Steam install
   * already (`installSteamGame()`). This is a SEPARATE field, deliberately —
   * `platformToInstall === 'Windows'` cannot distinguish a user's deliberate
   * bottle choice from that legacy default, and the Steam backend reads
   * `platformToInstall` nowhere, so reinterpreting it would route every
   * mac-native install into the bottle. Value contract: only `=== true`
   * overrides; `undefined` and `false` are both "legacy routing,
   * byte-identical to today" (the invariant 34.13-06's regression guard
   * pins). 34.13-08 is the sole writer; 34.13-06 is the sole reader. Plain
   * `boolean` by design — it carries no path, name or command, so it can
   * only SELECT among `SteamGame.install()`'s four existing branches, never
   * widen the install surface. */
  steamForceWindowsViaBottle?: boolean
}

export interface InstallParams extends InstallArgs {
  appName: string
  gameInfo: GameInfo
  runner: Runner
  size?: string
}

export interface UpdateParams {
  appName: string
  runner: Runner
  gameInfo: GameInfo
  installDlcs?: Array<string>
  installLanguage?: string
  build?: string
  branch?: string
}

export interface GOGLoginData {
  expires_in: number
  access_token: string
  refresh_token: string
  user_id: string
  loginTime: number
  error?: boolean
}

export interface GOGImportData {
  // "appName": "1441974651", "buildId": "55136646198962890", "title": "Prison Architect", "tasks": [{"category": "launcher", "isPrimary": true, "languages": ["en-US"], "name": "Prison Architect", "osBitness": ["64"], "path": "Launcher/dowser.exe", "type": "FileTask"}, {"category": "game", "isHidden": true, "languages": ["en-US"], "name": "Prison Architect - launcher process Prison Architect64_exe", "osBitness": ["64"], "path": "Prison Architect64.exe", "type": "FileTask"}, {"category": "document", "languages": ["en-US"], "link": "http://www.gog.com/support/prison_architect", "name": "Support", "type": "URLTask"}, {"category": "other", "languages": ["en-US"], "link": "http://www.gog.com/forum/prison_architect/prison_break_escape_map_megathread/post1", "name": "Escape Map Megathread", "type": "URLTask"}], "installedLanguage": "en-US"}
  appName: string
  buildId: string
  title: string
  tasks: Array<{
    category: string
    isPrimary?: boolean
    languages?: Array<string>
    arguments?: Array<string> | string
    path: string
    name: string
    type: string
  }>
  installedLanguage: string
  platform: GogInstallPlatform
  versionName: string
  dlcs: string[]
}

export interface LaunchPreperationResult {
  success: boolean
  failureReason?: string
  rpcClient?: RpcClient
  mangoHudCommand?: string[]
  gameModeBin?: string
  gameScopeCommand?: string[]
  offlineMode?: boolean
}

export interface RpcClient {
  destroy(): void
}

export interface CallRunnerOptions {
  logMessagePrefix?: string
  logWriters?: LogWriter[]
  logSanitizer?: (line: string) => string
  env?: Record<string, string> | NodeJS.ProcessEnv
  wrappers?: string[]
  onOutput?: (output: string, child: ChildProcess) => void
  abortId?: string
  cwd?: string
}

export interface EnviromentVariable {
  key: string
  value: string
}

export interface WrapperVariable {
  exe: string
  args: string
}

export interface WrapperEnv {
  appName: string
  appRunner: Runner
}

type AntiCheat =
  | 'Arbiter'
  | 'BattlEye'
  | 'Denuvo Anti-Cheat'
  | 'Easy Anti-Cheat'
  | 'EQU8'
  | 'FACEIT'
  | 'FairFight'
  | 'Mail.ru Anti-Cheat'
  | 'miHoYo Protect'
  | 'miHoYo Protect 2'
  | 'NEAC Protect'
  | 'Nexon Game Security'
  | 'nProtect GameGuard'
  | 'PunkBuster'
  | 'RICOCHET'
  | 'Sabreclaw'
  | 'Treyarch Anti-Cheat'
  | 'UNCHEATER'
  | 'Unknown (Custom)'
  | 'VAC'
  | 'Vanguard'
  | 'Warden'
  | 'XIGNCODE3'
  | 'Zakynthos'

export interface AntiCheatInfo {
  status: 'Broken' | 'Denied' | 'Working' | 'Running' | 'Supported'
  anticheats: AntiCheat[]
  notes: string[]
  native: boolean
  storeIds: {
    epic?: {
      namespace: string
      slug: string
    }
    steam?: string
  }
  reference: string
  updates: AntiCheatReference[]
}

interface AntiCheatReference {
  name: string
  date: string
  reference: string
}

export interface Runtime {
  id: number
  name: string
  created_at: string
  architecture: string
  url: string
}

export type RuntimeName = 'eac_runtime' | 'battleye_runtime' | 'umu'

export type RecentGame = {
  appName: string
  title: string
}

export type HiddenGame = RecentGame

export type FavouriteGame = HiddenGame

export type RefreshOptions = {
  checkForUpdates?: boolean
  fullRefresh?: boolean
  library?: Runner | 'all'
  runInBackground?: boolean
}

export interface WineVersionInfo extends VersionInfo {
  isInstalled: boolean
  hasUpdate: boolean
  installDir: string
}

export type GamepadActionStatus = Record<
  ValidGamepadAction,
  {
    // handles basic repeat delay
    triggeredAt: { [key: number]: number }
    repeatDelay: false | number
    // for initial post activation delay
    activationDelay?: false | number
    hasRepeated?: boolean
  }
>

export type ValidGamepadAction = GamepadActionArgs['action']

export type GamepadActionArgs =
  | GamepadActionArgsWithMetadata
  | GamepadActionArgsWithoutMetadata

interface GamepadActionArgsWithMetadata {
  action: 'leftClick' | 'rightClick'
  metadata: {
    elementTag: string
    x: number
    y: number
  }
}

interface GamepadActionArgsWithoutMetadata {
  action:
    | 'padUp'
    | 'padDown'
    | 'padLeft'
    | 'padRight'
    | 'leftStickUp'
    | 'leftStickDown'
    | 'leftStickLeft'
    | 'leftStickRight'
    | 'rightStickUp'
    | 'rightStickDown'
    | 'rightStickLeft'
    | 'rightStickRight'
    | 'mainAction'
    | 'back'
    | 'altAction'
    | 'esc'
    | 'tab'
    | 'shiftTab'
    | 'keyboardClick'
    | 'guide'
  metadata?: undefined
}

export type InstallPlatform =
  | LegendaryInstallPlatform
  | GogInstallPlatform
  | NileInstallPlatform
  | ZoomInstallPlatform
  | 'Browser'

export type ConnectivityStatus = 'offline' | 'check-online' | 'online'

export interface Tools {
  exe?: string
  tool: string
  appName: string
  runner: Runner
}

export interface Tool {
  name: string
  url: string
  os: string
  strip?: number
}

export type DMStatus = 'done' | 'error' | 'abort' | 'paused'
export interface DMQueueElement {
  type: 'update' | 'install'
  params: InstallParams
  addToQueueTime: number
  startTime: number
  endTime: number
  status?: DMStatus
}

type ProtonVerb =
  | 'run'
  | 'waitforexitandrun'
  | 'runinprefix'
  | 'destroyprefix'
  | 'getcompatpath'
  | 'getnativepath'

export type WineCommandArgs = {
  commandParts: string[]
  wait?: boolean
  protonVerb?: ProtonVerb
  gameSettings?: GameSettings
  gameInstallPath?: string
  installFolderName?: string
  options?: CallRunnerOptions
  startFolder?: string
  skipPrefixCheckIKnowWhatImDoing?: boolean
  ignoreLogging?: boolean
}

export interface SaveSyncArgs {
  arg: string | undefined
  path: string
  appName: string
  runner: Runner
}

export interface RunWineCommandArgs {
  appName: string
  runner: Runner
  commandParts: string[]
}

export interface ImportGameArgs {
  appName: string
  path: string
  runner: Runner
  platform: InstallPlatform
  winePrefix?: string
  wineVersion?: WineInstallation
  wineCrossoverBottle?: string
}

export interface MoveGameArgs {
  appName: string
  path: string
  runner: Runner
}

export interface DiskSpaceData {
  free: number
  diskSize: number
  message: string
  validPath: boolean
  validFlatpakPath: boolean
}

export interface ToolArgs {
  appName: string
  action: 'backup' | 'restore'
}

export type StatusPromise = Promise<{ status: 'done' | 'error' | 'abort' }>

export interface GameScoreInfo {
  score: string
  urlid: string
}
export interface PCGamingWikiInfo {
  steamID: string
  howLongToBeatID: string
  metacritic: GameScoreInfo
  opencritic: GameScoreInfo
  igdb: GameScoreInfo
  direct3DVersions: string[]
  genres: string[]
  releaseDate: string[]
}

export interface AppleGamingWikiInfo {
  crossoverRating: string
  wineRating: string
  crossoverLink: string
}

export interface CodeweaversInfo {
  macRating: number | null
  linuxRating: number | null
  slug: string
}

export interface GamesDBInfo {
  steamID: string
}

export interface ProtonDBCompatibilityInfo {
  level: string
}

export interface SteamDeckComp {
  category: number
}

export interface SteamInfo {
  compatibilityLevel: string | null
  steamDeckCatagory: number | null
}

/**
 * Outcome of a single wiki sub-lookup.
 *
 * Exists because `null` used to mean three different things — the request FAILED, the
 * game genuinely is not on that wiki, or it was found but carried nothing. Collapsing
 * them made a PCGamingWiki outage indistinguishable from "this game has no extra info",
 * and the game page's answer to both was to hide the Extra info tab entirely. A real
 * 403 (see `backend/utils.ts`'s User-Agent note) therefore presented as a silent,
 * unfalsifiable absence for every game in the library.
 *
 * `skipped` is distinct from `notfound` on purpose: HowLongToBeat takes its ID FROM the
 * PCGamingWiki result, so when that lookup errors HLTB never issues a request at all.
 * Reporting that as `notfound` would blame HLTB for PCGamingWiki's failure.
 */
export type WikiSourceOutcome = 'ok' | 'notfound' | 'error'
export type HowLongToBeatOutcome = 'ok' | 'notfound' | 'skipped'

export interface WikiFetchStatus {
  pcgamingwiki: WikiSourceOutcome
  howlongtobeat: HowLongToBeatOutcome
}

export interface WikiInfo {
  pcgamingwiki: PCGamingWikiInfo | null
  applegamingwiki: AppleGamingWikiInfo | null
  codeweavers: CodeweaversInfo | null
  howlongtobeat: HeroicHowLongToBeatEntry | null
  gamesdb: GamesDBInfo | null
  steamInfo: SteamInfo | null
  umuId: string | null
  /**
   * OPTIONAL deliberately: `wikiGameInfoStore` is a 30-day cache, so entries written
   * before this field existed are still live and must keep type-checking. Treat absent
   * as "unknown outcome" rather than assuming success.
   */
  fetchStatus?: WikiFetchStatus
}

/**
 * Defines from where the version comes
 */
export type Type =
  | 'Wine-GE'
  | 'GE-Proton'
  | 'Proton'
  | 'Wine-Lutris'
  | 'Wine-Kron4ek'
  | 'Wine-Crossover'
  | 'Wine-Staging-macOS'
  | 'Game-Porting-Toolkit'
  | 'Proton-CachyOS'

/**
 * Interface contains information about a version
 * - version
 * - type (wine, proton, lutris, ge ...)
 * - date
 * - download link
 * - checksum link
 * - size (download and disk)
 */
export interface VersionInfo {
  version: string
  type: Type
  date: string
  download: string
  downsize: number
  disksize: number
  checksum: string
  release_notes_link: string
}

/**
 * Enum for the supported repositorys
 */
export enum Repositorys {
  PROTONGE,
  PROTON,
  WINELUTRIS,
  WINECROSSOVER,
  WINESTAGINGMACOS,
  GPTK,
  PROTONCACHYOS
}

export type WineManagerStatus =
  | { status: 'idle' | 'unzipping' }
  | { status: 'downloading'; percentage: number; avgSpeed: number; eta: string }

export interface WineManagerUISettings {
  value: string
  type: Type
}

export type DownloadManagerState = 'idle' | 'running' | 'paused' | 'stopped'

export interface WindowProps extends Electron.Rectangle {
  maximized: boolean
  frame?: boolean
  titleBarStyle?: 'default' | 'hidden' | 'hiddenInset'
  titleBarOverlay?: TitleBarOverlay | boolean
}

interface GameScopeSettings {
  enableUpscaling: boolean
  enableLimiter: boolean
  enableForceGrabCursor: boolean
  windowType: string
  gameWidth: string
  gameHeight: string
  upscaleWidth: string
  upscaleHeight: string
  upscaleMethod: string
  fpsLimiter: string
  fpsLimiterNoFocus: string
  additionalOptions: string
}

export type InstallInfo =
  | LegendaryInstallInfo
  | GogInstallInfo
  | NileInstallInfo
  | ZoomInstalledInfo
  | ZoomInstallInfo

export interface KnowFixesInfo {
  title: string
  notes?: Record<string, string>
  winetricks?: string[]
  runInPrefix?: string[]
  envVariables?: Record<string, string>
  wikiLink?: string
}

export interface UploadedLogData {
  // Descriptive name of the log file (e.g. "Game log of ...")
  name: string
  // Token to modify the file (used to delete the log file on the server)
  token: string
  // Time the log file was uploaded (used to know whether it expired)
  uploadedAt: number
}

export interface RunnerCommandStub {
  commandParts: string[]
  response?: Promise<ExecResult>
  stdout?: string
  stderr?: string
}

export interface SGDBGrid {
  id: number
  url: string
  thumb: string
}

export interface SGDBGame {
  id: number
  name: string
}

export type ReleasesInfo = Record<
  | 'ge-proton'
  | 'wine-ge'
  | 'game-porting-toolkit'
  | 'proton-cachyos'
  | 'wine-staging'
  | 'wine-crossover'
  | 'dxvk'
  | 'dxvk-mac'
  | 'dxmt'
  | 'vkd3d',
  {
    tag: string
    published_at: string
  }
> & {
  anticheatFiles: {
    shaMac: string
    shaLinux: string
  }
}
