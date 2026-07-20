/**
 * Headless bridge contract test (Phase 27 Plan 03 -- Task 3, mirrors spike 012's
 * bridge-shim-demo). Stubs @tauri-apps/api's `invoke`/`listen` with an in-memory mock
 * sidecar, assembles the three re-pointed `ipc.ts` factories + `tauriTransport.ts`'s
 * synchronous store-snapshot bridge exactly as GameLib's real preload does, and proves
 * the invoke/send/on + synchronous-store contract holds with ZERO electron symbols
 * touched on the Tauri path.
 */

let mockElectronRequireCount = 0

jest.mock('electron', () => {
  mockElectronRequireCount += 1
  throw new Error(
    'electron must never be resolved on the Tauri renderer path (T-27-07)'
  )
})

jest.mock('@tauri-apps/api/core', () => ({
  isTauri: jest.fn(() => true),
  invoke: jest.fn()
}))

jest.mock('@tauri-apps/api/event', () => ({
  listen: jest.fn()
}))

import { invoke as coreInvoke } from '@tauri-apps/api/core'
import { listen as eventListen } from '@tauri-apps/api/event'
import { makeHandlerInvoker, frontendListenerSlot } from '../ipc'
import { snapshotGet, hydrateStoreSnapshot } from '../tauriTransport'

const mockedInvoke = coreInvoke as jest.MockedFunction<typeof coreInvoke>
const mockedListen = eventListen as jest.MockedFunction<typeof eventListen>

describe('Tauri renderer bridge contract (spike 012 parity)', () => {
  // tauriTransport's own `isTauri()` (Phase 27 Plan 05) detects the Tauri context via
  // `globalThis.__TAURI_INTERNALS__` (the runtime's ground-truth injection), not a mockable
  // core flag. Simulate a real Tauri webview so ipc.ts's factories take the Tauri path
  // instead of falling through to their guarded Electron branch (require('electron'),
  // mocked to throw above).
  beforeAll(() => {
    ;(globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {}
  })

  afterAll(() => {
    delete (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
  })

  beforeEach(() => {
    // jest.config.js sets `resetMocks: true`, which wipes each jest.fn()'s
    // implementation (not just its call history) before every test.
    mockedInvoke.mockReset()
    mockedListen.mockReset()
  })

  it('round-trips an invoke call through makeHandlerInvoker via a mock sidecar (req/resp shape preserved)', async () => {
    mockedInvoke.mockImplementation((async (cmd: string, payload?: unknown) => {
      if (cmd === 'sidecar_invoke') {
        const { channel, args } = payload as { channel: string; args: unknown[] }
        return { echoedChannel: channel, echoedArgs: args }
      }
      throw new Error(`unmocked command: ${cmd}`)
    }) as typeof mockedInvoke)

    const invoker = makeHandlerInvoker('getHeroicVersion')
    const result = await invoker()

    expect(result).toEqual({ echoedChannel: 'getHeroicVersion', echoedArgs: [] })
    expect(mockedInvoke).toHaveBeenCalledWith('sidecar_invoke', {
      channel: 'getHeroicVersion',
      args: []
    })
  })

  it('delivers a pushed frontend message to a frontendListenerSlot subscription, and the returned unsubscribe fn stops delivery', async () => {
    const mockUnlisten = jest.fn()
    let registeredHandler:
      | ((event: { payload: { channel: string; args: unknown[] } }) => void)
      | undefined

    mockedListen.mockImplementation((async (_event: unknown, handler: unknown) => {
      registeredHandler = handler as typeof registeredHandler
      return mockUnlisten
    }) as unknown as typeof mockedListen)

    const received: unknown[][] = []
    const slot = frontendListenerSlot('maximized')
    const unsubscribe = slot(((..._args: unknown[]) => {
      received.push(_args)
    }) as never)

    // Flush the microtask the mocked async `listen()` registration resolves on, so
    // tauriTransport's `listen()` has attached its filter callback + captured `unlisten`.
    await Promise.resolve()
    await Promise.resolve()

    expect(registeredHandler).toBeDefined()
    registeredHandler!({ payload: { channel: 'maximized', args: [] } })
    // A push for a DIFFERENT channel must not be delivered to this listener.
    registeredHandler!({ payload: { channel: 'unmaximized', args: [] } })
    expect(received).toEqual([[]])

    unsubscribe()
    expect(mockUnlisten).toHaveBeenCalledTimes(1)
  })

  it('snapshotGet returns synchronously from a hydrated snapshot; a denied secret key returns undefined', async () => {
    mockedInvoke.mockImplementation((async (cmd: string) => {
      if (cmd === 'sidecar_store_snapshot') {
        return {
          configStore: { language: 'en' },
          steamConfigStore: { refreshToken: 'super-secret-token' }
        }
      }
      throw new Error(`unmocked command: ${cmd}`)
    }) as typeof mockedInvoke)

    await hydrateStoreSnapshot()

    const language = snapshotGet('configStore', 'language')
    expect(language).toBe('en')
    // Synchronous -- not a Promise.
    expect(language).not.toBeInstanceOf(Promise)

    const deniedToken = snapshotGet('steamConfigStore', 'refreshToken')
    expect(deniedToken).toBeUndefined()
  })

  it('touches zero electron symbols on the Tauri path (contract_ok)', () => {
    expect(mockElectronRequireCount).toBe(0)
  })
})
