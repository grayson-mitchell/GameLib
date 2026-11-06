import type {
  ExtraInfo,
  GameInfo,
  GameSettings,
  InstallInfo,
  InstallPlatform,
  LaunchOption,
  MoveGameArgs,
  Runner
} from '../../types'
import type { GameOverride, SelectiveDownload } from '../legendary'

export interface GameDetailsSync {
  addNewApp: (args: GameInfo) => void
  changeGameVersionPinnedStatus: (
    appName: string,
    runner: Runner,
    status: boolean
  ) => void
  setGameMetadataOverride: (args: {
    appName: string
    title?: string
    art_cover?: string
    art_square?: string
  }) => void
}

export interface GameDetailsAsync {
  kill: (appName: string, runner: Runner) => Promise<void>
  getGameInfo: (appName: string, runner: Runner) => Promise<GameInfo | null>
  getExtraInfo: (appName: string, runner: Runner) => Promise<ExtraInfo | null>
  getGameSettings: (
    appName: string,
    runner: Runner
  ) => Promise<GameSettings | null>
  getInstallInfo: (
    appName: string,
    runner: Runner,
    installPlatform: InstallPlatform,
    build?: string,
    branch?: string
  ) => Promise<InstallInfo | null>
  readConfig: (config_class: 'library' | 'user') => Promise<GameInfo[] | string>
  repair: (appName: string, runner: Runner) => Promise<void>
  changeInstallPath: (args: MoveGameArgs) => Promise<void>
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
  isGameAvailable: (args: {
    appName: string
    runner: Runner
  }) => Promise<boolean>
  getLaunchOptions: (appName: string, runner: Runner) => Promise<LaunchOption[]>
  getGameOverride: () => Promise<GameOverride>
  getGameSdl: (appName: string) => Promise<SelectiveDownload[]>

  getAvailableCyberpunkMods: () => Promise<string[]>
  setCyberpunkModConfig: (props: {
    enabled: boolean
    modsToLoad: string[]
  }) => Promise<void>
}
