import { z } from 'zod'

import type { Runner, UploadedLogData } from '../../types'
import type { GameLogType } from '../sidecarTransport'
import {
  httpUrlArg,
  nonEmptyString,
  runnerArg,
  type InvokeFns,
  type PushFns
} from './schemaTypes'

const noArgs = z.tuple([])

// Which log file: the Heroic log, a runner log or a game log. By default (no `type`) a game's
// launch log. The Rust native router decodes this strictly (`log_dispatch::parse_log_file_args`).
export type GetLogFileArgs =
  // Heroic log
  | { appName?: undefined; runner?: undefined }
  // Runner log
  | { appName?: undefined; runner: Runner | 'comet' }
  // Game log
  | { appName: string; runner: Runner; type?: GameLogType }

// The zod twin of GetLogFileArgs, still used by uploadLogFile (the one channel left on the sidecar).
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

export type LoggerAsync = InvokeFns<typeof loggerAsyncArgs, LoggerAsyncReturns>
export type LoggerFrontendMessages = PushFns<typeof loggerFrontendMessagesArgs>
