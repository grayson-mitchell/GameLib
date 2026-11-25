import { z } from 'zod'

import type { AppSettings, GameSettings } from '../../types'

import {
  nonEmptyString,
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
    value: z.unknown().optional()
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
  hasExecutable: Promise<boolean>
  setPrivateBranchPassword: void
  getPrivateBranchPassword: string
}

export type SettingsSync = SendFns<typeof settingsSyncArgs>
export type SettingsAsync = InvokeFns<
  typeof settingsAsyncArgs,
  SettingsAsyncReturns
>
