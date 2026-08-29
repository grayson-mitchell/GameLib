// eslint-disable-next-line no-restricted-imports
import { ipcMain, type IpcMainEvent } from 'backend/platform'
import { getMainWindow } from 'backend/main_window'

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

function addOneTimeListener<ChannelName extends keyof SyncIPCFunctions>(
  channel: ChannelName,
  listener: (
    e: IpcMainEvent,
    ...args: Parameters<SyncIPCFunctions[ChannelName]>
  ) => void
) {
  ipcMain.once(channel, listener as never)
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
 * Sends a message to the main window's webContents if available
 * @returns Whether the message got sent
 *
 * debug/steam-install-slow-start (Thread D-1): `getMainWindow()` returns the
 * module-level `mainWindow` reference (or the first `BrowserWindow.getAllWindows()`
 * entry) whenever it is non-null — but a window can be non-null and DESTROYED at
 * the same time, most commonly during app quit (`handleExit()` -> `app.exit()`
 * tears down the window as part of its internal shutdown). A download/install
 * progress heartbeat (e.g. GOG's `onInstallOrUpdateOutput`/`sendProgressUpdate`,
 * or Steam's ACF poller) that fires in that narrow window called
 * `mainWindow.webContents.send(...)` on an already-destroyed window/webContents,
 * which throws "Object has been destroyed" as an UNCAUGHT exception in the main
 * process (Electron's crash dialog: "A uncaught exception occured: TypeError:
 * Object has been destroyed."). Guarding here defensively covers EVERY caller of
 * sendFrontendMessage during teardown, regardless of which one fires.
 */
function sendFrontendMessage<ChannelName extends keyof FrontendMessages>(
  channel: ChannelName,
  ...args: Parameters<FrontendMessages[ChannelName]>
): boolean {
  const mainWindow = getMainWindow()
  if (
    !mainWindow ||
    mainWindow.isDestroyed() ||
    mainWindow.webContents.isDestroyed()
  ) {
    return false
  }

  mainWindow.webContents.send(channel, ...args)
  return true
}

export {
  addListener,
  addOneTimeListener,
  addTestOnlyListener,
  addHandler,
  sendFrontendMessage
}
