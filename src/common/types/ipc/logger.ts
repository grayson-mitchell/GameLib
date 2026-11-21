import { z } from 'zod'

import type { UploadedLogData } from '../../types'
import {
  httpUrlArg,
  nonEmptyString,
  runnerArg,
  type InvokeFns,
  type PushFns,
  type SendFns
} from './schemaTypes'

const noArgs = z.tuple([])

// Mirrors GetLogFileArgs in backend/logger/paths.ts: Heroic log, runner log, game log.
const getLogFileArgs = z.union([
  z.strictObject({
    appName: z.undefined().optional(),
    runner: z.undefined().optional()
  }),
  z.strictObject({ runner: z.union([runnerArg(), z.literal('comet')]) }),
  z.strictObject({
    appName: nonEmptyString(),
    runner: runnerArg(),
    type: z
      .enum(['launch', 'install', 'import', 'repair', 'update', 'setup'])
      .optional()
  })
])

export const loggerSyncArgs = {
  showLogFileInFolder: z.tuple([getLogFileArgs])
}

export const loggerAsyncArgs = {
  uploadLogFile: z.tuple([z.string().max(1024), getLogFileArgs]),
  // The paste service URL returned by uploadLogFile. A host allow-list is Phase 72.
  deleteUploadedLogFile: z.tuple([httpUrlArg()]),
  getUploadedLogFiles: noArgs
}

interface LoggerAsyncReturns {
  uploadLogFile: Promise<false | [string, UploadedLogData]>
  deleteUploadedLogFile: Promise<boolean>
  getUploadedLogFiles: Promise<Record<string, UploadedLogData>>
}

// D-12: typing only, backend-originated.
export const loggerFrontendMessagesArgs = {
  logFileUploaded: z.tuple([
    z.string(),
    z.custom<UploadedLogData>(
      (v) => typeof v === 'object' && v !== null && !Array.isArray(v)
    )
  ]),
  logFileUploadDeleted: z.tuple([z.string()])
}

export type LoggerSync = SendFns<typeof loggerSyncArgs>
export type LoggerAsync = InvokeFns<typeof loggerAsyncArgs, LoggerAsyncReturns>
export type LoggerFrontendMessages = PushFns<typeof loggerFrontendMessagesArgs>
