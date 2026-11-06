import type { SystemInformation } from 'backend/utils/systeminfo'
import type { AppSettings, GameSettings, Runner } from '../../types'
import type { GetLogFileArgs } from 'backend/logger/paths'

export interface SettingsSync {
  setSetting: (args: {
    appName: string
    key: keyof AppSettings
    value: unknown
  }) => void
}

export interface SettingsAsync {
  getMaxCpus: () => number
  showUpdateSetting: () => boolean
  requestAppSettings: () => AppSettings
  requestGameSettings: (appName: string) => Promise<GameSettings>
  writeConfig: (args: { appName: string; config: Partial<AppSettings> }) => void
  isNative: (args: { appName: string; runner: Runner }) => boolean
  getLogContent: (args: GetLogFileArgs) => string
  getSystemInfo: (cache?: boolean) => Promise<SystemInformation>
  hasExecutable: (executable: string) => Promise<boolean>

  setPrivateBranchPassword: (appName: string, password: string) => void
  getPrivateBranchPassword: (appName: string) => string
}
