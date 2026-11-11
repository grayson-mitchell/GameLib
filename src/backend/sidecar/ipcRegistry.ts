/**
 * The IPC handler/listener registry (D-66.3-01). Replaces the module-level
 * `handlerRegistry` / `listenerRegistry` Maps and the `ipcMain` recorder that lived in
 * `backend/platform`. `createIpcRegistry()` returns an isolated instance with no module state:
 * two registries never share a handler. `sidecarRpc` dispatch reads from the instance passed to
 * `startRpcServer`.
 *
 * No `backend/logger` import (see the module-scope note in `backend/platform/index.ts`: the
 * logger's import chain needs the path shim loaded first). Typed registration helpers take the
 * registry as their first argument instead of reaching for a module singleton.
 */

import type {
  AsyncIPCFunctions,
  SyncIPCFunctions,
  TestSyncIPCFunctions
} from 'common/types/ipc'
import type { IpcMainEvent } from '../platform/types'

/** The event object handed to a handler. `sidecarRpc` dispatches with `undefined`. */
export type IpcEvent = unknown

// Return type is `unknown`: it subsumes `Promise<unknown>`, and the handler may still return
// a Promise; the dispatcher awaits the result regardless.
export type IpcHandler = (event: IpcEvent, ...args: unknown[]) => unknown
export type IpcListener = (event: IpcEvent, ...args: unknown[]) => void

export interface IpcRegistry {
  /** Registers the req/resp handler for a channel (a later call replaces an earlier one). */
  handle(channel: string, handler: IpcHandler): void
  removeHandler(channel: string): void
  /** Appends a fire-and-forget listener. */
  on(channel: string, listener: IpcListener): void
  /** Like `on`, but the listener runs once and is then removed. */
  once(channel: string, listener: IpcListener): void
  getHandler(channel: string): IpcHandler | undefined
  /** An empty array for an unknown channel. */
  getListeners(channel: string): readonly IpcListener[]
  has(channel: string): boolean
  /** Drops every listener on a channel. */
  removeAllListeners(channel: string): void
  /** Live read-only views, for enumeration (coverage tests, the interim platform delegate). */
  handlerMap(): ReadonlyMap<string, IpcHandler>
  listenerMap(): ReadonlyMap<string, readonly IpcListener[]>
}

export function createIpcRegistry(): IpcRegistry {
  const handlers = new Map<string, IpcHandler>()
  const listeners = new Map<string, IpcListener[]>()

  const registry: IpcRegistry = {
    handle(channel, handler) {
      handlers.set(channel, handler)
    },
    removeHandler(channel) {
      handlers.delete(channel)
    },
    on(channel, listener) {
      const existing = listeners.get(channel) ?? []
      existing.push(listener)
      listeners.set(channel, existing)
    },
    once(channel, listener) {
      const wrapped: IpcListener = (...args) => {
        const remaining = (listeners.get(channel) ?? []).filter(
          (registered) => registered !== wrapped
        )
        listeners.set(channel, remaining)
        listener(...args)
      }
      registry.on(channel, wrapped)
    },
    getHandler(channel) {
      return handlers.get(channel)
    },
    getListeners(channel) {
      return listeners.get(channel) ?? []
    },
    has(channel) {
      return handlers.has(channel) || listeners.has(channel)
    },
    removeAllListeners(channel) {
      listeners.delete(channel)
    },
    handlerMap() {
      return handlers
    },
    listenerMap() {
      return listeners
    }
  }
  return registry
}

// ---- Typed registration helpers (moved from backend/ipc.ts) -------------------------------

export function handleTyped<ChannelName extends keyof AsyncIPCFunctions>(
  ipc: Pick<IpcRegistry, 'handle'>,
  channel: ChannelName,
  handler: (
    e: IpcMainEvent,
    ...args: Parameters<AsyncIPCFunctions[ChannelName]>
  ) =>
    | ReturnType<AsyncIPCFunctions[ChannelName]>
    | Awaited<ReturnType<AsyncIPCFunctions[ChannelName]>>
): void {
  ipc.handle(channel, handler as never)
}

export function onTyped<ChannelName extends keyof SyncIPCFunctions>(
  ipc: Pick<IpcRegistry, 'on'>,
  channel: ChannelName,
  listener: (
    e: IpcMainEvent,
    ...args: Parameters<SyncIPCFunctions[ChannelName]>
  ) => void
): void {
  ipc.on(channel, listener as never)
}

/** Registers only when `env.CI === 'e2e'`; the env is passed in, not read from `process.env`. */
export function onTestOnly<ChannelName extends keyof TestSyncIPCFunctions>(
  ipc: Pick<IpcRegistry, 'on'>,
  env: Pick<NodeJS.ProcessEnv, 'CI'>,
  channel: ChannelName,
  listener: (...args: Parameters<TestSyncIPCFunctions[ChannelName]>) => void
): void {
  if (env.CI === 'e2e') ipc.on(channel, listener as never)
}
