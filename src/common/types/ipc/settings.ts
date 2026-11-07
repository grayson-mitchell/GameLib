import { z } from 'zod'

import type { SystemInformation } from 'backend/utils/systeminfo'
import type { AppSettings, GameSettings } from '../../types'
import type { GetLogFileArgs } from 'backend/logger/paths'

import {
  nonEmptyString,
  optionalArg,
  phase70Passthrough,
  runnerArg,
  type InvokeFns,
  type SendFns
} from './schemaTypes'

const noArgs = z.tuple([])

// D-07: the settings key set is every key of AppSettings (dozens, growing), so the envelope
// bounds the key to a non-empty string and the value stays `unknown` (per-key value types are
// Phase 70). The key is not narrowed to `keyof AppSettings` on the wire; the handler owns that.
const settingKey = nonEmptyString(128)

// D-07 PHASE70-PASSTHROUGH: the config payload is a Partial<AppSettings>. It declares no keys
// because the handler forwards the whole object to GlobalConfig / GameConfig; the loose object
// also tolerates a persisted `wineVersion` carrying legacy or extra keys (67-13 disposition).
// The cast keeps the derived call-site type the full Partial<AppSettings>: zod's loose-object
// input type carries an index signature that an interface cannot satisfy.
const configArg = phase70Passthrough({}) as unknown as z.ZodType<
  Partial<AppSettings>,
  Partial<AppSettings>
>

// GameLogType, listed so a rename fails the call-site type check in getLogContent's consumers.
const LOG_TYPES = [
  'launch',
  'install',
  'import',
  'repair',
  'update',
  'setup'
] as const

// The cast restores the discriminated union the schema cannot express; the handler resolves it.
const logFileArgs = z.strictObject({
  appName: nonEmptyString().optional(),
  runner: z.enum([...runnerArg().options, 'comet']).optional(),
  type: z.enum(LOG_TYPES).optional()
}) as unknown as z.ZodType<GetLogFileArgs, GetLogFileArgs>

export const settingsSyncArgs = {
  setSetting: z.tuple([
    z.strictObject({
      appName: nonEmptyString(),
      key: settingKey,
      value: z.unknown()
    })
  ])
}

export const settingsAsyncArgs = {
  getMaxCpus: noArgs,
  showUpdateSetting: noArgs,
  requestAppSettings: noArgs,
  requestGameSettings: z.tuple([nonEmptyString()]),
  writeConfig: z.tuple([
    z.strictObject({ appName: nonEmptyString(), config: configArg })
  ]),
  isNative: z.tuple([
    z.strictObject({ appName: nonEmptyString(), runner: runnerArg() })
  ]),
  // GetLogFileArgs is a three-way union (Heroic log / runner log / game log); the three arms
  // collapse to one object with every key optional. The handler resolves which arm it is.
  getLogContent: z.tuple([logFileArgs]),
  getSystemInfo: z.tuple([optionalArg(z.boolean())]),
  hasExecutable: z.tuple([nonEmptyString()]),
  // D-10: the password is bounded only; its value never reaches a log or a wire error.
  setPrivateBranchPassword: z.tuple([nonEmptyString(), z.string().max(1024)]),
  getPrivateBranchPassword: z.tuple([nonEmptyString()])
}

interface SettingsAsyncReturns {
  getMaxCpus: number
  showUpdateSetting: boolean
  requestAppSettings: AppSettings
  requestGameSettings: Promise<GameSettings>
  writeConfig: void
  isNative: boolean
  getLogContent: string
  getSystemInfo: Promise<SystemInformation>
  hasExecutable: Promise<boolean>
  setPrivateBranchPassword: void
  getPrivateBranchPassword: string
}

export type SettingsSync = SendFns<typeof settingsSyncArgs>
export type SettingsAsync = InvokeFns<
  typeof settingsAsyncArgs,
  SettingsAsyncReturns
>
