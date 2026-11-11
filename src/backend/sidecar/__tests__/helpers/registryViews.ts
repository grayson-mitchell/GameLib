import type { IpcHandler, IpcListener, IpcRegistry } from '../../ipcRegistry'

/**
 * Read/write Map-like views over an IPC registry instance, resolved at call time. These stand in
 * for the module-scope `handlerRegistry` / `listenerRegistry` maps the retired `backend/platform`
 * delegate exported; the registry itself is the boot's `host.ipc`.
 */
export function createRegistryViews(getIpc: () => IpcRegistry | null) {
  const handlers = () => getIpc()?.handlerMap() ?? new Map<string, IpcHandler>()
  const listeners = () =>
    getIpc()?.listenerMap() ?? new Map<string, readonly IpcListener[]>()
  return {
    handlerRegistry: {
      get: (channel: string): IpcHandler | undefined => handlers().get(channel),
      has: (channel: string): boolean => handlers().has(channel),
      set: (channel: string, handler: IpcHandler): void =>
        getIpc()?.handle(channel, handler),
      delete: (channel: string): boolean => {
        const had = handlers().has(channel)
        getIpc()?.removeHandler(channel)
        return had
      },
      clear: (): void => {
        for (const channel of [...handlers().keys()])
          getIpc()?.removeHandler(channel)
      },
      keys: () => handlers().keys(),
      entries: () => handlers().entries(),
      get size(): number {
        return handlers().size
      }
    },
    listenerRegistry: {
      get: (channel: string): readonly IpcListener[] | undefined =>
        listeners().get(channel),
      has: (channel: string): boolean => listeners().has(channel),
      set: (channel: string, list: readonly IpcListener[]): void => {
        getIpc()?.removeAllListeners(channel)
        for (const listener of list) getIpc()?.on(channel, listener)
      },
      delete: (channel: string): boolean => {
        const had = listeners().has(channel)
        getIpc()?.removeAllListeners(channel)
        return had
      },
      clear: (): void => {
        for (const channel of [...listeners().keys()])
          getIpc()?.removeAllListeners(channel)
      },
      keys: () => listeners().keys(),
      entries: () => listeners().entries(),
      get size(): number {
        return listeners().size
      }
    }
  }
}
