/**
 * Host services (D-66.3-01): the Tauri-native replacements for the Electron facade that lived
 * in `backend/platform`. Each is a `createX(deps)` factory with no module state. One boot step
 * ('host-services', right after 'logger') builds them once and stores them on
 * `BootServices.host`. The bound transport functions (`requestRustInvoke`,
 * `requestOpenExternal`, `openDetached`, `runSync`) are constructor dependencies.
 */

import type { SidecarRpc } from '../sidecar/sidecarRpc'
import type { IpcRegistry } from '../sidecar/ipcRegistry'
import { createNativeImage } from '../sidecar/nativeImageShim'
import type { ProcessRunner } from '../process/types'
import { createAppState, type AppState } from './appState'
import { createDialogs, type Dialogs } from './dialogs'
import { createNotifications, type Notifications } from './notifications'
import { createOpenExternal, type OpenExternal } from './openExternal'
import {
  createSendFrontendMessage,
  type SendFrontendMessage
} from './frontendMessage'

export type RequestRustInvoke = SidecarRpc['requestRustInvoke']

export interface HostServices {
  ipc: IpcRegistry
  openExternal: OpenExternal
  dialogs: Dialogs
  notifications: Notifications
  appState: AppState
  imageTools: ReturnType<typeof createNativeImage>
  /** Backend -> frontend push (`webContents.send`); a bound transport function. */
  pushFrontendMessage: (channel: string, ...args: unknown[]) => void
  /** The sidecar -> Rust request leg (allow-listed channels, bounded), for modules that call Rust. */
  requestRustInvoke: RequestRustInvoke
  /** The typed form of the push, handed to every module that notifies the renderer. */
  sendFrontendMessage: SendFrontendMessage
}

export interface HostServicesDeps {
  platform: NodeJS.Platform
  /** The registry is a parameter, not built here: the boot step owns its single instance. */
  ipc: IpcRegistry
  requestRustInvoke: RequestRustInvoke
  requestOpenExternal: (url: string) => void
  pushFrontendMessage: (channel: string, ...args: unknown[]) => void
  openDetached: (url: string, onError?: (code: string) => void) => void
  runSync: ProcessRunner['runSync']
}

export function createHostServices(deps: HostServicesDeps): HostServices {
  const appState = createAppState({ requestRustInvoke: deps.requestRustInvoke })
  return {
    ipc: deps.ipc,
    openExternal: createOpenExternal({
      platform: deps.platform,
      requestOpenExternal: deps.requestOpenExternal,
      openDetached: deps.openDetached,
      requestRustInvoke: deps.requestRustInvoke
    }),
    dialogs: createDialogs({
      requestRustInvoke: deps.requestRustInvoke,
      raiseMainWindowIfHiddenByGameLib: () =>
        appState.raiseMainWindowIfHiddenByGameLib()
    }),
    notifications: createNotifications({
      requestRustInvoke: deps.requestRustInvoke
    }),
    appState,
    imageTools: createNativeImage({ runSync: deps.runSync }),
    requestRustInvoke: deps.requestRustInvoke,
    pushFrontendMessage: deps.pushFrontendMessage,
    sendFrontendMessage: createSendFrontendMessage(deps.pushFrontendMessage)
  }
}
