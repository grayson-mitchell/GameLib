import type { TitleBarOverlay } from 'backend/platform'
import type {
  ButtonOptions,
  ConnectivitySnapshot,
  DialogType,
  GameStatus,
  RecentGame,
  Release,
  AppManagementStatus,
  Runner,
  WineManagerStatus
} from '../../types'
import type { RunsForMeState } from '../../runsForMe'
import type { SignInProbeOutcomeMap } from '../../signInState'

// ts-prune-ignore-next
export interface AppShellSync {
  changeLanguage: (language: string) => void
  notify: (args: { title: string; body: string }) => void
  dialogDisplayed: (ackId: string) => void
  frontendReady: () => void
  lock: (playing: boolean) => void
  unlock: () => void
  quit: () => void
  openReleases: () => void
  openWebviewPage: (url: string) => void
  openAppManagementSettings: () => void
  relaunchApp: () => void
  abort: (id: string) => void
  changeTrayColor: () => void
  setTitleBarOverlay: (options: TitleBarOverlay) => void
}

// ts-prune-ignore-next
export interface AppShellAsync {
  getHeroicVersion: () => string
  getAppManagementStatus: () => Promise<AppManagementStatus>
  getLatestReleases: () => Promise<Release[]>
  getCurrentChangelog: () => Promise<Release | null>
  getWebviewPreloadPath: () => string
  // Resolves a `data:` URL for the configured Manage Accounts background, or
  // '' to mean "use the bundled default artwork".
  getLoginBackground: () => Promise<string>
}

// ts-prune-ignore-next
export interface AppShellFrontendMessages {
  gameStatusUpdate: (status: GameStatus) => void
  showDialog: (
    title: string,
    message: string,
    type: DialogType,
    buttons?: Array<ButtonOptions>,
    ackId?: string
  ) => void
  maximized: () => void
  unmaximized: () => void
  fullscreen: (status: boolean) => void
  'connectivity-changed': (snapshot: ConnectivitySnapshot) => void
  launchGame: (appName: string, runner: Runner, args: string[]) => void
  installGame: (appName: string, runner: Runner) => void
  recentGamesChanged: (newRecentGames: RecentGame[]) => void
  // WR-04: a per-game setting write failed twice; the renderer re-reads the stored value
  gameSettingWriteFailed: (payload: { appName: string; key: string }) => void
  progressOfWineManager: (version: string, progress: WineManagerStatus) => void
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
  // Quick 261029-mkz: full "Runs for me" map, pushed after every change.
  runsForMeChanged: (map: Record<string, RunsForMeState>) => void
  // Phase 49 (49-04), D-08: this launch's per-store sign-in probe outcomes,
  // pushed after each probe settles and after each sign-in or sign-out. The
  // payload carries outcome labels only -- never a token, cookie, error text or
  // account identifier (T-49-09).
  signInProbeOutcomes: (payload: { outcomes: SignInProbeOutcomeMap }) => void

  // Used inside tests, so we can be a bit lenient with the type checking here
  message: (...params: unknown[]) => void
}
