/**
 * Headless bridge contract test (Phase 27 Plan 03 -- Task 3, mirrors spike 012's
 * bridge-shim-demo). Stubs @tauri-apps/api's `invoke`/`listen` with an in-memory mock
 * sidecar, assembles the three re-pointed `ipc.ts` factories + `tauriTransport.ts`'s
 * synchronous store-snapshot bridge exactly as GameLib's real preload does, and proves
 * the invoke/send/on + synchronous-store contract holds with ZERO electron symbols
 * touched on the Tauri path.
 *
 * TOKEN-WIPE SAFETY (Phase 29 Plan 05): this whole suite constructs NO real store and
 * imports NO real file-system-backed persistence layer -- `tauriTransport.ts` is a pure
 * in-memory bridge over the mocked `@tauri-apps/api`, and every test below stays within
 * that in-memory surface. IF a future edit to this file ever introduces a real store
 * construction (e.g. pulling in the sidecar's actual file store implementation instead of
 * mocking `@tauri-apps/api`), the three-way `os`+`electron`+persistence-layer isolation
 * mock used by `skeletonFlows.test.ts` becomes MANDATORY (29-VALIDATION.md § MANDATORY
 * TEST-ISOLATION RULE; commit 92c29a5e fixed a real dev machine's Steam token getting
 * wiped by a suite that skipped this). This property is enforced mechanically by this
 * file's own acceptance criteria (no reference to the real persistence package's name
 * appears anywhere below).
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
import {
  snapshotGet,
  snapshotHas,
  hydrateStoreSnapshot,
  registerStore
} from '../tauriTransport'
import {
  STORE_FETCH_CHANNEL,
  STORE_CHANGED_CHANNEL,
  STORE_LAZY_MISS_MARKER
} from 'common/types/sidecarTransport'

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

describe('lazy hydrate', () => {
  // Use LAZY_STORES names never touched by the describe block above (which hydrates
  // `configStore`/`steamConfigStore` eagerly) -- module-level snapshot/hydrated state in
  // `tauriTransport.ts` persists for the lifetime of this file's test run, so a fresh,
  // never-hydrated store name per test keeps these assertions independent of run order.

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('a synchronous read of an un-hydrated store returns the caller default, warns exactly once with the STORE_LAZY_MISS_MARKER, and does not throw', () => {
    mockedInvoke.mockResolvedValue({})
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})

    let result: unknown
    expect(() => {
      result = snapshotGet('uploadedLogs', 'lazyMissA', 'FALLBACK')
    }).not.toThrow()

    expect(result).toBe('FALLBACK')
    expect(warnSpy).toHaveBeenCalledTimes(1)
    const [message] = warnSpy.mock.calls[0] as [string]
    expect(message.split(' ')[0]).toBe(STORE_LAZY_MISS_MARKER)
  })

  it('a miss fires a SIDECAR_INVOKE through the mocked invoke with channel STORE_FETCH_CHANNEL and the store name as args', () => {
    mockedInvoke.mockResolvedValue({})
    jest.spyOn(console, 'warn').mockImplementation(() => {})

    // A different, still-un-hydrated store from the test above -- the previous test's
    // fetch of `uploadedLogs` resolves asynchronously and marks it hydrated, which would
    // make a second miss on that same store name silently skip the fetch (correctly, per
    // D-03/D-04) and falsify this assertion.
    snapshotGet('gogSyncStore', 'lazyMissB', 'FALLBACK')

    expect(mockedInvoke).toHaveBeenCalledWith('sidecar_invoke', {
      channel: STORE_FETCH_CHANNEL,
      args: ['gogSyncStore']
    })
  })

  it('a completed fetch self-heals the next read, with no second warning', async () => {
    mockedInvoke.mockImplementation((async (cmd: string, payload?: unknown) => {
      if (cmd === 'sidecar_invoke') {
        const { channel } = payload as { channel: string; args: unknown[] }
        if (channel === STORE_FETCH_CHANNEL) {
          return { someKey: 'real' }
        }
      }
      throw new Error(`unmocked command: ${cmd}`)
    }) as typeof mockedInvoke)
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})

    const first = snapshotGet('wikigameinfo', 'someKey', 'FALLBACK')
    expect(first).toBe('FALLBACK')
    expect(warnSpy).toHaveBeenCalledTimes(1)

    // Let the fired-and-forgotten hydrateStore() resolve.
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    const second = snapshotGet('wikigameinfo', 'someKey', 'FALLBACK')
    expect(second).toBe('real')
    // No second warning -- the store is now marked hydrated.
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it('a rejecting fetch is swallowed -- no unhandled rejection, and the read still returns the default', async () => {
    mockedInvoke.mockImplementation((async () => {
      throw new Error('sidecar unreachable')
    }) as unknown as typeof mockedInvoke)
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    const result = snapshotGet('gogPrivateBranches', 'anything', 'FALLBACK')
    expect(result).toBe('FALLBACK')

    // Let the caught-and-logged rejection settle before the test ends.
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(errorSpy).toHaveBeenCalled()
  })
})

describe('change events', () => {
  let storeChangedHandler:
    | ((event: { payload: { channel: string; args: unknown[] } }) => void)
    | undefined

  beforeAll(() => {
    // The previous describe block's last test may have left `mockedInvoke` rejecting
    // (its "rejecting fetch" case) -- `resetMocks: true` only rewinds mocks immediately
    // before each `it`, not before a sibling describe's `beforeAll`. `registerStore()`
    // below calls `send()`, which fires-and-forgets a `tauriInvoke()` call; a leftover
    // rejecting implementation there would surface as an unhandled promise rejection.
    mockedInvoke.mockReset()

    mockedListen.mockImplementation((async (
      _event: unknown,
      handler: unknown
    ) => {
      storeChangedHandler = handler as typeof storeChangedHandler
      return jest.fn()
    }) as unknown as typeof mockedListen)

    // First-ever registerStore() call in this suite attaches the lazy
    // STORE_CHANGED_CHANNEL subscription (D-06) -- mirrors how the real app triggers it,
    // via storeNew's Tauri branch at boot. Uses a real allow-listed configStore field
    // name (`theme`) purely as the registration target; the store itself is what gets
    // subscribed, not this particular field.
    registerStore('configStore')
  })

  beforeEach(async () => {
    // Flush the microtask the mocked async `listen()` registration resolves on.
    await Promise.resolve()
    await Promise.resolve()
  })

  it('a storeChanged set patches the snapshot in place', () => {
    expect(storeChangedHandler).toBeDefined()
    storeChangedHandler!({
      payload: {
        channel: STORE_CHANGED_CHANNEL,
        args: [{ store: 'configStore', key: 'theme', value: 'dark' }]
      }
    })
    expect(snapshotGet('configStore', 'theme')).toBe('dark')
  })

  it('a storeChanged delete removes the key', () => {
    storeChangedHandler!({
      payload: {
        channel: STORE_CHANGED_CHANNEL,
        args: [{ store: 'configStore', key: 'language', value: 'en' }]
      }
    })
    expect(snapshotHas('configStore', 'language')).toBe(true)

    storeChangedHandler!({
      payload: {
        channel: STORE_CHANGED_CHANNEL,
        args: [{ store: 'configStore', key: 'language', deleted: true }]
      }
    })
    expect(snapshotHas('configStore', 'language')).toBe(false)
  })

  it('a payload on an unrelated channel does not mutate the snapshot', () => {
    storeChangedHandler!({
      payload: {
        channel: 'someOtherChannel',
        args: [{ store: 'configStore', key: 'zoomPercent', value: 'unexpected' }]
      }
    })
    expect(snapshotHas('configStore', 'zoomPercent')).toBe(false)
  })
})

describe('allow-list', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('snapshotGet("humbleConfigStore", "csrfToken", "x") returns undefined (blocked, not the default) and warns', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const result = snapshotGet('humbleConfigStore', 'csrfToken', 'x')
    expect(result).toBeUndefined()
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it('snapshotGet("steamConfigStore", "refreshToken.sub", "x") returns undefined (dot-notation subpath blocked)', () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    const result = snapshotGet('steamConfigStore', 'refreshToken.sub', 'x')
    expect(result).toBeUndefined()
  })

  it('snapshotGet("steamConfigStore", "userData", undefined) is NOT blocked by the allow-list', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const result = snapshotGet('steamConfigStore', 'userData', 'DEFAULT')
    // A denied field's warning names it as blocked; an allowed field's read must never
    // produce that specific message (it may still lazy-miss-warn if un-hydrated, which is
    // a different, non-blocking signal).
    for (const call of warnSpy.mock.calls) {
      expect(String(call[0])).not.toContain('blocked')
    }
    expect(result === 'DEFAULT' || result === undefined).toBe(true)
  })
})
