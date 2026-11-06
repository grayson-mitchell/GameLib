import type { DMQueueElement, DownloadManagerState } from '../../types'

// ts-prune-ignore-next
export interface DownloadQueueSync {
  removeFromDMQueue: (appName: string) => void
  resumeCurrentDownload: () => void
  pauseCurrentDownload: () => void
  cancelDownload: (removeDownloaded: boolean) => void
}

// ts-prune-ignore-next
export interface DownloadQueueAsync {
  getDMQueueInformation: () => {
    elements: DMQueueElement[]
    finished: DMQueueElement[]
    state: DownloadManagerState
  }
}

// ts-prune-ignore-next
export interface DownloadQueueFrontendMessages {
  changedDMQueueInformation: (
    elements: DMQueueElement[],
    state: DownloadManagerState
  ) => void
}
