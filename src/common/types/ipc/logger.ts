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

// D-09: renderer text is typed, never z.any(). Observed shapes: a string (nearly every
// caller), a string array, and an Error-like object. A real Error JSON-serialises to `{}`
// (message and stack are non-enumerable), so the object arm accepts that too; the global
// error handler in frontend/index.tsx stringifies before sending so the text survives.
// Length is deliberately NOT validated (67 review WR-03): rejecting would replace a long
// diagnostic with a one-line `too_big`. The handler truncates instead
// (backend/logger/sanitizeRendererLogMessage.ts); the 10 MiB frame limit is the hard bound.
const logText = z.string()
const logMessage = z.union([
  logText,
  z.array(logText),
  z.strictObject({
    name: z.string().optional(),
    message: logText.optional(),
    stack: logText.optional()
  })
])

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
  logError: z.tuple([logMessage]),
  logInfo: z.tuple([logMessage]),
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
