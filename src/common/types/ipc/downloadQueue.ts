import type { DMQueueElement, DownloadManagerState } from '../../types'

export interface DownloadQueueSync {
  removeFromDMQueue: (appName: string) => void
  resumeCurrentDownload: () => void
  pauseCurrentDownload: () => void
  cancelDownload: (removeDownloaded: boolean) => void
}

export interface DownloadQueueAsync {
  getDMQueueInformation: () => {
    elements: DMQueueElement[]
    finished: DMQueueElement[]
    state: DownloadManagerState
  }
}

export interface DownloadQueueFrontendMessages {
  changedDMQueueInformation: (
    elements: DMQueueElement[],
    state: DownloadManagerState
  ) => void
}
