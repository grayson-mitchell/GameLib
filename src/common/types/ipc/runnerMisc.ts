import type {
  GameAchievement,
  Runner,
  RuntimeName,
  SaveSyncArgs,
  Tools
} from '../../types'
import type { GOGCloudSavesLocation } from '../gog'

export interface RunnerMiscAsync {
  callTool: (args: Tools) => Promise<void>
  getLegendaryVersion: () => Promise<string>
  getGogdlVersion: () => Promise<string>
  getCometVersion: () => Promise<string>
  getNileVersion: () => Promise<string>
  getAchievements: (
    appName: string,
    runner: Runner,
    lang?: string
  ) => Promise<GameAchievement[]>
  getGOGLinuxInstallersLangs: (appName: string) => Promise<string[]>
  egsSync: (arg: string) => Promise<string>
  syncGOGSaves: (
    gogSaves: GOGCloudSavesLocation[],
    appname: string,
    arg: string
  ) => Promise<string>
  syncSaves: (args: SaveSyncArgs) => Promise<string>
  downloadRuntime: (runtime_name: RuntimeName) => Promise<boolean>
  isRuntimeInstalled: (runtime_name: RuntimeName) => Promise<boolean>
  getDefaultSavePath: (
    appName: string,
    runner: Runner,
    alreadyDefinedGogSaves: GOGCloudSavesLocation[]
  ) => Promise<string | GOGCloudSavesLocation[]>
  getPlaytimeFromRunner: (
    runner: Runner,
    appName: string
  ) => Promise<number | undefined>
}
