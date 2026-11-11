// eslint-disable-next-line no-restricted-imports
import { ipcMain, type IpcMainEvent } from 'backend/platform'
import { pushFrontendMessage } from 'backend/sidecar/sidecarRpc'

import type {
  AsyncIPCFunctions,
  SyncIPCFunctions,
  TestSyncIPCFunctions,
  FrontendMessages
} from 'common/types/ipc'

function addListener<ChannelName extends keyof SyncIPCFunctions>(
  channel: ChannelName,
  listener: (
    e: IpcMainEvent,
    ...args: Parameters<SyncIPCFunctions[ChannelName]>
  ) => void
) {
  ipcMain.on(channel, listener as never)
}

function addTestOnlyListener<ChannelName extends keyof TestSyncIPCFunctions>(
  channel: ChannelName,
  listener: (...args: Parameters<TestSyncIPCFunctions[ChannelName]>) => void
) {
  if (process.env.CI === 'e2e') ipcMain.on(channel, listener as never)
}

function addHandler<ChannelName extends keyof AsyncIPCFunctions>(
  channel: ChannelName,
  handler: (
    e: IpcMainEvent,
    ...args: Parameters<AsyncIPCFunctions[ChannelName]>
  ) =>
    | ReturnType<AsyncIPCFunctions[ChannelName]>
    | Awaited<ReturnType<AsyncIPCFunctions[ChannelName]>>
) {
  ipcMain.handle(channel, handler as never)
}

/**
 * Pushes a message to the renderer through the sidecar transport (`pushFrontendMessage`).
 * @returns Whether the message got sent (always true: the transport buffers until its output
 * stream is bound, so a push before the rpc-server boot step is flushed, not dropped as the old
 * fake-window path dropped it).
 *
 * This replaced a `getMainWindow()?.webContents.send(...)` that went through the platform
 * shim's fake window, whose `isDestroyed()` was always false; the destroyed-window guard
 * (debug/steam-install-slow-start, Thread D-1) is moot with no window object.
 */
function sendFrontendMessage<ChannelName extends keyof FrontendMessages>(
  channel: ChannelName,
  ...args: Parameters<FrontendMessages[ChannelName]>
): boolean {
  pushFrontendMessage(channel, ...args)
  return true
}

// addOneTimeListener was dropped from this export list (260922-vzw): the
// only hit outside this module is a `jest.doMock('../../ipc', () => ({
// addOneTimeListener: jest.fn(), ... }))` mock-object property name in
// src/backend/sidecar/__tests__/wineToolsFlows.test.ts -- coincidental, not
// an import of this function. No file imports it from `ipc.ts`.
export { addListener, addTestOnlyListener, addHandler, sendFrontendMessage }
