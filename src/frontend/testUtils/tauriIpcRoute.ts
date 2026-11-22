/**
 * Side-effect module for node-env tests that drive the REAL `@tauri-apps/api` (and so the real
 * `preload/tauriTransport`): it installs a `window` whose `__TAURI_INTERNALS__` routes every Tauri
 * `invoke` to `tauriRoute.handler` and keeps the handlers `listen()` registers, so the test can
 * answer commands and emit events with no `jest.mock` of `@tauri-apps/api/core` or `event`.
 * `__TAURI_INTERNALS__` is the seam the Tauri runtime itself injects; `invoke`, `listen` and
 * `transformCallback` all read it at call time.
 *
 * Import this FIRST in the test file, in place of `tauriWindow`: the frontend stores invoke and
 * listen at import time, so the routing must exist before they load. Plain functions, not
 * `jest.fn()`: `resetMocks` would strip a jest.fn's implementation before each test.
 */
type Route = (cmd: string, payload?: unknown) => Promise<unknown>
type Callback = (event: unknown) => void

/** Answers every command other than the event plugin's listen/unlisten. Reassign per test. */
export const tauriRoute: { handler: Route } = {
  handler: () => Promise.resolve(undefined)
}

const callbacks = new Map<number, Callback>()
const listeners = new Map<number, { event: string; callbackId: number }>()
let nextId = 1

function routeInvoke(cmd: string, args?: unknown): Promise<unknown> {
  if (cmd === 'plugin:event|listen') {
    const { event, handler } = args as { event: string; handler: number }
    const eventId = nextId++
    listeners.set(eventId, { event, callbackId: handler })
    return Promise.resolve(eventId)
  }
  if (cmd === 'plugin:event|unlisten') {
    listeners.delete((args as { eventId: number }).eventId)
    return Promise.resolve(undefined)
  }
  return tauriRoute.handler(cmd, args)
}

;(globalThis as unknown as { window: object }).window = {
  __TAURI_INTERNALS__: {
    invoke: routeInvoke,
    transformCallback: (callback: Callback) => {
      const id = nextId++
      callbacks.set(id, callback)
      return id
    },
    unregisterCallback: (id: number) => {
      callbacks.delete(id)
    },
    metadata: {
      currentWindow: { label: 'main' },
      currentWebview: { label: 'main' }
    }
  },
  __TAURI_EVENT_PLUGIN_INTERNALS__: {
    unregisterListener: (_event: string, eventId: number) => {
      listeners.delete(eventId)
    }
  }
}

/** Delivers one Tauri event to every live `listen()` handler for `event`, as the shell's emit does. */
export function emitTauriEvent(event: string, payload: unknown): void {
  for (const [id, listener] of [...listeners]) {
    if (listener.event !== event) continue
    callbacks.get(listener.callbackId)?.({ event, id, payload })
  }
}
