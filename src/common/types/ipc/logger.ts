import { z } from 'zod'

import type { Runner, UploadedLogData } from '../../types'
import type { GameLogType } from '../sidecarTransport'
import type { PushFns } from './schemaTypes'

// Which log file: the Heroic log, a runner log or a game log. By default (no `type`) a game's
// launch log. The Rust native router decodes this strictly (`log_dispatch::parse_log_file_args`).
export type GetLogFileArgs =
  // Heroic log
  | { appName?: undefined; runner?: undefined }
  // Runner log
  | { appName?: undefined; runner: Runner | 'comet' }
  // Game log
  | { appName: string; runner: Runner; type?: GameLogType }

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

export type LoggerFrontendMessages = PushFns<typeof loggerFrontendMessagesArgs>
