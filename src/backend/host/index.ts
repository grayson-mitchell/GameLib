/**
 * Host services (D-66.3-01): the Tauri-native replacements for the Electron facade that lived
 * in `backend/platform`. Each is a `createX(deps)` factory with no module state. One boot step
 * ('host-services', right after 'logger') builds them once and stores them on
 * `BootServices.host`. The bound transport functions (`requestRustInvoke`,
 * `requestOpenExternal`, `openDetached`, `runSync`) are constructor dependencies.
 */

import type { requestRustInvoke } from '../sidecar/sidecarRpc'
import type { IpcRegistry } from '../sidecar/ipcRegistry'
import { createNativeImage } from '../sidecar/nativeImageShim'
import type { ProcessRunner } from '../process/types'
import { createAppState, type AppState } from './appState'
import { createDialogs, type Dialogs } from './dialogs'
import { createNotifications, type Notifications } from './notifications'
import { createOpenExternal, type OpenExternal } from './openExternal'

export type RequestRustInvoke = typeof requestRustInvoke

export interface HostServices {
  ipc: IpcRegistry
  openExternal: OpenExternal
  dialogs: Dialogs
  notifications: Notifications
  appState: AppState
  imageTools: ReturnType<typeof createNativeImage>
}

export interface HostServicesDeps {
  platform: NodeJS.Platform
  /** The registry is a parameter, not built here: the boot step owns its single instance. */
  ipc: IpcRegistry
  requestRustInvoke: RequestRustInvoke
  requestOpenExternal: (url: string) => void
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
    imageTools: createNativeImage({ runSync: deps.runSync })
  }
}

export type { AppState } from './appState'
export type { Dialogs } from './dialogs'
export type { Notifications } from './notifications'
export type { OpenExternal } from './openExternal'
export type { AppInfo } from './appInfo'
