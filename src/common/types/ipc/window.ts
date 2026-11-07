import { z } from 'zod'

import type { InvokeFns, SendFns } from './schemaTypes'

const noArgs = z.tuple([])

// Every window channel is served by the preload's Tauri window APIs and never reaches the
// sidecar; it is registered with caller 'local' in channelSchemas.
export const windowSyncArgs = {
  setZoomFactor: z.tuple([z.string().max(32)]),
  minimizeWindow: noArgs,
  maximizeWindow: noArgs,
  unmaximizeWindow: noArgs,
  closeWindow: noArgs,
  setFullscreen: z.tuple([z.boolean()])
}

export const windowAsyncArgs = {
  isFullscreen: noArgs,
  isFrameless: noArgs,
  isMaximized: noArgs,
  isMinimized: noArgs
}

interface WindowAsyncReturns {
  isFullscreen: boolean
  isFrameless: boolean
  isMaximized: boolean
  isMinimized: boolean
}

export type WindowSync = SendFns<typeof windowSyncArgs>
export type WindowAsync = InvokeFns<typeof windowAsyncArgs, WindowAsyncReturns>
