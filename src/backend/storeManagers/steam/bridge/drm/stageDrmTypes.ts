/**
 * Input, deps and result types of the `bottle-stage` DrmStep. A leaf: the
 * registry, restore and process-listing siblings share `StageDrmBottleDeps`
 * without importing stageDrmBottle.ts back.
 */
import type { GameSettings } from 'common/types'
import type { ManagerDeps } from 'backend/services/types'
import type {
  findRuntimeLoadedSteamApiDlls,
  findUnrealLayout
} from '../bridgeScan'
import type { restoreBridgeSteamApiOriginals } from '../originalRestore'
import type { openStageWineLog } from './stageWineLog'

export type StageDrmBottleInput = {
  appId: string
  bottleName: string
  bottleSettings: GameSettings
  exePath: string
  installRoot: string
  installdir: string
  valveClientDir: string
  componentDir: string
  /** Gap 11: extra exe dirs (UE Shipping exe) whose TCP artifacts are cleaned. */
  extraExeDirs?: string[]
  /** Plan 56-32: trace root for the stage session's wine log. */
  stageLogDir?: string
  signal?: AbortSignal
}

/** The command and spawn slices the stage reaches its wine and process work through (66.1 R3). */
export type StageDrmBottleSlices = Pick<
  ManagerDeps,
  | 'commandRunner'
  | 'spawnAsync'
  | 'runner'
  | 'config'
  | 'steamBottle'
  | 'steamUser'
  | 'paths'
  | 'engineRuntime'
  | 'steamLaunchRuntime'
>

export type StageDrmBottleDeps = {
  getBottleDir?: (bottleName: string) => string
  findDlls?: typeof findRuntimeLoadedSteamApiDlls
  findUnreal?: typeof findUnrealLayout
  restoreOriginals?: typeof restoreBridgeSteamApiOriginals
  runReg?: (
    commandParts: string[]
  ) => Promise<{ code?: number | null; stderr?: string }>
  regTimeoutMs?: number
  /** Live wine processes of the bottle, logged on a reg add timeout. */
  listBottleProcesses?: (bottleDir: string) => Promise<string[]>
  /**
   * Ends the stage's own wine session after a reg add timeout, so the retry
   * starts a fresh one (debug drm-stage-winebus-hid-spin).
   */
  endStageSession?: (args: {
    appId: string
    bottleName: string
    bottleDir: string
  }) => Promise<void>
  /** Plan 56-32: opens the stage wine log sink (injectable for tests). */
  openStageLog?: typeof openStageWineLog
  /** Plan 56-32: dev-only fault injection is ignored when this is true. */
  isPackaged?: () => boolean
  env?: NodeJS.ProcessEnv
}

export type StageDrmBottleOk = {
  steamDirHost: string
  steamDirWin: string
  helperHostPath: string
  helperWinPath: string
  steamClient64WinPath: string
  restored: string[]
  removed: string[]
  foreignSteamClientLeft: string[]
  staged: string[]
  registryWritten: boolean
}
