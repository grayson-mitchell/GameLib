// First-party type, not the electron package -- see backend/platform/types.ts's own
// header comment for why: this file must not statically import electron's VALUES
// (the four lazy Node-only `require` calls of the electron package this file used to
// carry, one per Electron branch below, were BLOCKER-1 / T-27-07 -- a static named
// import of the electron package's `ipcRenderer` value compiles to an unconditional
// top-level require of that package once bundled, which throws when this module is
// reached from the Tauri renderer bundle regardless of any runtime guard). Phase 35 plan 16
// collapsed every Electron/Tauri runtime-detection branch pair below to its Tauri-only
// body -- nothing runs under Electron anymore, so the four lazy requires are dead code,
// removed rather than left unreachable.
import type { IpcRendererEvent } from 'backend/platform'

import type { AsyncIPCFunctions, SyncIPCFunctions, FrontendMessages } from 'common/types/ipc'
import { invoke as tauriInvoke, send as tauriSend, listen as tauriListen } from './tauriTransport'

// Creates a Promise<T> only if T isn't already a promise
type PromiseOnce<T> = T extends Promise<unknown> ? T : Promise<T>

// Returns a function calling an IPC listener created by the backend, accepting that listeners parameters
function makeListenerCaller<ChannelName extends keyof SyncIPCFunctions>(channel: ChannelName) {
  return (...args: Parameters<SyncIPCFunctions[ChannelName]>) => {
    tauriSend(channel, args)
  }
}

// Like `makeListenerCaller`, but for IPC handlers instead
function makeHandlerInvoker<ChannelName extends keyof AsyncIPCFunctions>(channel: ChannelName) {
  return (...args: Parameters<AsyncIPCFunctions[ChannelName]>) => {
    return tauriInvoke(channel, args) as PromiseOnce<ReturnType<AsyncIPCFunctions[ChannelName]>>
  }
}

// Returns a function the Frontend can call to add a listener to this channel
function frontendListenerSlot<ChannelName extends keyof FrontendMessages>(channel: ChannelName) {
  return (listener: (e: IpcRendererEvent, ...args: Parameters<FrontendMessages[ChannelName]>) => void) => {
    return tauriListen(channel, (...args) =>
      listener(undefined as unknown as IpcRendererEvent, ...(args as Parameters<FrontendMessages[ChannelName]>))
    )
  }
}

export { makeListenerCaller, makeHandlerInvoker, frontendListenerSlot }
