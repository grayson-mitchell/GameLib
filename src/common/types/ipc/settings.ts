import { z } from 'zod'

import type { SystemInformation } from 'backend/utils/systeminfo'
import type { AppSettings, GameSettings } from '../../types'
import type { GetLogFileArgs } from 'backend/logger/paths'

import {
  nonEmptyString,
  optionalArg,
  runnerArg,
  type InvokeFns,
  type SendFns
} from './schemaTypes'
import {
  appSettingsSchema,
  appSettingsShape,
  settingKey
} from './settingsSchema'

const noArgs = z.tuple([])

// D-11: writeConfig carries a strict partial of the full AppSettings shape; setSetting validates
// `value` against the schema of its `key`. Both live in settingsSchema.ts.
const configArg = appSettingsSchema.partial()

// setSetting is a `send`: a rejected send is dropped silently (Phase 67 D-09), and JSON turns a
// positional `undefined` into `null` or an absent key. So every optional key also accepts null.
const setSettingArg = z
  .strictObject({
    appName: nonEmptyString(),
    key: settingKey,
    value: z.unknown()
  })
  .superRefine((arg, ctx) => {
    const valueSchema: z.ZodType = appSettingsShape[arg.key]
    const unset = arg.value === null || arg.value === undefined
    if (unset && valueSchema.safeParse(undefined).success) return
    const result = valueSchema.safeParse(arg.value)
    if (!result.success) {
      ctx.addIssue({
        code: 'custom',
        path: ['value'],
        message: `invalid value for setting ${arg.key}`
      })
    }
  })

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
  setSetting: z.tuple([setSettingArg])
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
