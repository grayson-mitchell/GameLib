import type { AppInfo } from 'backend/process/context'

import { logError, logInfo, LogPrefix } from '../logger'
import type { SendFrontendMessage } from 'backend/host/frontendMessage'

import type { UploadedLogData } from 'common/types'
import type { Stores } from 'backend/services/types'

async function sendRequestToApi(
  deps: { appInfo: Pick<AppInfo, 'version'> },
  formData: FormData | string,
  url = 'https://dpaste.com/api/v2/'
) {
  return fetch(url, {
    body: formData,
    method: 'post',
    headers: {
      'User-Agent': `HeroicGamesLauncher/${deps.appInfo.version}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  }).catch((err) => {
    logError([`Failed to send data to dpaste.com:`, err], LogPrefix.LogUploader)
    return null
  })
}

const EXPIRY_DAYS = 2

/** The store slice the log uploader reads (66.1, R1). */
export interface LogUploaderDeps {
  stores: Pick<Stores, 'logger'>
  appInfo: Pick<AppInfo, 'version'>
  sendFrontendMessage: SendFrontendMessage
}

/**
 * Deletes a log file previously uploaded by the native `uploadLogFile` (`src-tauri/src/log_upload.rs`)
 * @param url The URL to the uploaded log file
 * @returns Whether the file was deleted
 */
async function deleteUploadedLogFile(
  deps: LogUploaderDeps,
  url: string
): Promise<boolean> {
  const logData = deps.stores.logger.uploadedLogFileStore.get_nodefault(url)
  if (!logData) return false

  const formData = new FormData()
  formData.set('token', logData.token)
  formData.set('delete', '')

  const response = await sendRequestToApi(deps, formData, url)
  if (!response) return false

  if (!response.ok) {
    logError(
      [
        `Failed to delete log file upload, response error code ${response.status} ${response.statusText}, text:`,
        await response.text()
      ],
      LogPrefix.LogUploader
    )
    return false
  }

  deps.stores.logger.uploadedLogFileStore.delete(url)
  deps.sendFrontendMessage('logFileUploadDeleted', url)
  logInfo([`Deleted log file ${logData.name} (${url})`], LogPrefix.LogUploader)

  return true
}

/**
 * Returns all log files which are still valid. Also deletes expired
 * ones from {@link uploadedLogFileStore}
 */
async function getUploadedLogFiles(
  deps: LogUploaderDeps
): Promise<Record<string, UploadedLogData>> {
  const allStoredLogs = deps.stores.logger.uploadedLogFileStore.raw_store
  const validUploadedLogs: Record<string, UploadedLogData> = {}
  // Filter and delete expired logs
  for (const [key, value] of Object.entries(allStoredLogs)) {
    const timeDifferenceMs = Date.now() - value.uploadedAt
    const timeDifferenceDays = timeDifferenceMs / 1000 / 60 / 60 / 24
    if (timeDifferenceDays >= EXPIRY_DAYS) {
      deps.stores.logger.uploadedLogFileStore.delete(key)
    } else {
      validUploadedLogs[key] = value
    }
  }
  return validUploadedLogs
}

export { deleteUploadedLogFile, getUploadedLogFiles }
