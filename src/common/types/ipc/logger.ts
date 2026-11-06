import type { UploadedLogData } from '../../types'
import type { GetLogFileArgs } from 'backend/logger/paths'

export interface LoggerSync {
  logError: (message: unknown) => void
  logInfo: (message: unknown) => void
  showLogFileInFolder: (args: GetLogFileArgs) => void
}

export interface LoggerAsync {
  uploadLogFile: (
    name: string,
    args: GetLogFileArgs
  ) => Promise<false | [string, UploadedLogData]>
  deleteUploadedLogFile: (url: string) => Promise<boolean>
  getUploadedLogFiles: () => Promise<Record<string, UploadedLogData>>
}

export interface LoggerFrontendMessages {
  logFileUploaded: (url: string, data: UploadedLogData) => void
  logFileUploadDeleted: (url: string) => void
}
