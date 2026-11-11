import type { IpcRegistry } from '../sidecar/ipcRegistry'

/**
 * Map-shaped read views over an injected IpcRegistry, for suites that assert on what a
 * registration function wrote (`handlerRegistry.get(ch)`, `listenerRegistry.get(ch)?.length`).
 * Replaces the platform shim's module-level `handlerRegistry` / `listenerRegistry` (66.3-10).
 */
export function ipcViews(ipc: Pick<IpcRegistry, 'handlerMap' | 'listenerMap'>) {
  return {
    handlerRegistry: {
      get: (channel: string) => ipc.handlerMap().get(channel),
      has: (channel: string) => ipc.handlerMap().has(channel)
    },
    listenerRegistry: {
      get: (channel: string) => ipc.listenerMap().get(channel),
      has: (channel: string) => ipc.listenerMap().has(channel)
    }
  }
}
