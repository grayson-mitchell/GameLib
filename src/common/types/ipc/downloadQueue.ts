import { z } from 'zod'

import type { DMQueueElement, DownloadManagerState } from '../../types'
import {
  nonEmptyString,
  type InvokeFns,
  type PushFns,
  type SendFns
} from './schemaTypes'

const noArgs = z.tuple([])

export const downloadQueueSyncArgs = {
  removeFromDMQueue: z.tuple([nonEmptyString(256)]),
  resumeCurrentDownload: noArgs,
  pauseCurrentDownload: noArgs,
  cancelDownload: z.tuple([z.boolean()])
}

export const downloadQueueAsyncArgs = {
  getDMQueueInformation: noArgs
}

interface DownloadQueueAsyncReturns {
  getDMQueueInformation: {
    elements: DMQueueElement[]
    finished: DMQueueElement[]
    state: DownloadManagerState
  }
}

// D-12: typing only, never parsed at runtime. Originates in the backend download manager.
export const downloadQueueFrontendMessagesArgs = {
  changedDMQueueInformation: z.tuple([
    z.custom<DMQueueElement[]>(Array.isArray),
    z.custom<DownloadManagerState>((v) => typeof v === 'string')
  ])
}

export type DownloadQueueSync = SendFns<typeof downloadQueueSyncArgs>
export type DownloadQueueAsync = InvokeFns<
  typeof downloadQueueAsyncArgs,
  DownloadQueueAsyncReturns
>
export type DownloadQueueFrontendMessages = PushFns<
  typeof downloadQueueFrontendMessagesArgs
>
