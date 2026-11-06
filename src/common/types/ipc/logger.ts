import type { UploadedLogData } from '../../types'
import type { GetLogFileArgs } from 'backend/logger/paths'

// ts-prune-ignore-next
export interface LoggerSync {
  logError: (message: unknown) => void
  logInfo: (message: unknown) => void
  showLogFileInFolder: (args: GetLogFileArgs) => void
}

// ts-prune-ignore-next
export interface LoggerAsync {
  uploadLogFile: (
    name: string,
    args: GetLogFileArgs
  ) => Promise<false | [string, UploadedLogData]>
  deleteUploadedLogFile: (url: string) => Promise<boolean>
  getUploadedLogFiles: () => Promise<Record<string, UploadedLogData>>
}

// ts-prune-ignore-next
export interface LoggerFrontendMessages {
  logFileUploaded: (url: string, data: UploadedLogData) => void
  logFileUploadDeleted: (url: string) => void
}
