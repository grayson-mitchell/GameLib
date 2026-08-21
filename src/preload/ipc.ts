// Type-only -- erased at compile time, so this stays safe even if the module is ever
// reached from the Tauri renderer bundle (see the lazy `require('electron')` comment below).
import type { IpcRendererEvent } from 'electron'

import type { AsyncIPCFunctions, SyncIPCFunctions, FrontendMessages } from 'common/types/ipc'
import { isTauri, invoke as tauriInvoke, send as tauriSend, listen as tauriListen } from './tauriTransport'

// Creates a Promise<T> only if T isn't already a promise
type PromiseOnce<T> = T extends Promise<unknown> ? T : Promise<T>

// Returns a function calling an IPC listener created by the backend, accepting that listeners parameters
function makeListenerCaller<ChannelName extends keyof SyncIPCFunctions>(channel: ChannelName) {
  return (...args: Parameters<SyncIPCFunctions[ChannelName]>) => {
    if (isTauri()) {
      tauriSend(channel, args)
      return
    }
    // Lazy, guarded `require` (NOT a static `import` value) -- BLOCKER-1 / T-27-07: this
    // module may be reached from the Tauri renderer bundle (no Node/Electron there). A
    // static `import { ipcRenderer } from 'electron'` compiles to an unconditional
    // top-level `require('electron')` once bundled (confirmed in build/preload/index.js's
    // own output), which would throw in that context regardless of any runtime guard.
    // Keeping it as a plain function CALL, only reached inside this branch, means it is
    // only ever evaluated when actually invoked -- which `isTauri()` above ensures never
    // happens under Tauri. Electron behavior is otherwise byte-identical to before.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ipcRenderer } = require('electron') as typeof import('electron')
    ipcRenderer.send(channel, ...args)
  }
}

// Like `makeListenerCaller`, but for IPC handlers instead
function makeHandlerInvoker<ChannelName extends keyof AsyncIPCFunctions>(channel: ChannelName) {
  return (...args: Parameters<AsyncIPCFunctions[ChannelName]>) => {
    if (isTauri()) {
      return tauriInvoke(channel, args) as PromiseOnce<ReturnType<AsyncIPCFunctions[ChannelName]>>
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ipcRenderer } = require('electron') as typeof import('electron')
    return ipcRenderer.invoke(channel, ...args) as PromiseOnce<ReturnType<AsyncIPCFunctions[ChannelName]>>
  }
}

// Returns a function the Frontend can call to add a listener to this channel
function frontendListenerSlot<ChannelName extends keyof FrontendMessages>(channel: ChannelName) {
  return (listener: (e: IpcRendererEvent, ...args: Parameters<FrontendMessages[ChannelName]>) => void) => {
    if (isTauri()) {
      return tauriListen(channel, (...args) =>
        listener(undefined as unknown as IpcRendererEvent, ...(args as Parameters<FrontendMessages[ChannelName]>))
      )
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ipcRenderer } = require('electron') as typeof import('electron')
    ipcRenderer.on(channel, listener as never)

    return () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { ipcRenderer } = require('electron') as typeof import('electron')
      ipcRenderer.removeListener(channel, listener as never)
    }
  }
}

export { makeListenerCaller, makeHandlerInvoker, frontendListenerSlot }
