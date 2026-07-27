/**
 * Unit tests for useTauriOAuthLogin (Phase 34.4.1 Plan 09, D-04, REQ-34.4.1-08 — Task 3).
 *
 * No jsdom / react-test-renderer / `@testing-library/react-hooks` is installed in this project
 * (see `src/frontend/jest.config.js`'s docstring), so `renderHook()` is unavailable. Following
 * `useDebouncedStoreSearch.test.ts`'s established "mock react + invoke directly" pattern, the
 * hook is invoked as a plain function against a hand-rolled slot-based `useState`/`useEffect`
 * mock. This mock adds one capability that file's did not need: `__unmount()`, which invokes
 * every recorded effect cleanup WITHOUT re-running the hook afterward — the only way to prove
 * "no setState after unmount" against a hook that has no automatic React lifecycle here.
 *
 * `isTauri()` is mocked via `preload/tauriTransport` (baseUrl-resolved, same absolute module
 * `useTauriOAuthLogin.ts`'s own relative import resolves to — Jest's module registry is keyed
 * by resolved path, not import specifier text).
 */

jest.mock('react', () => {
  const actualReact = jest.requireActual<typeof import('react')>('react')
  let stateSlots: unknown[] = []
  let stateCursor = 0
  let effectDeps: (unknown[] | undefined)[] = []
  let effectCleanups: (void | (() => void))[] = []
  let effectCursor = 0

  const depsChanged = (
    prev: unknown[] | undefined,
    next: unknown[] | undefined
  ): boolean => {
    if (!prev || !next) return true
    if (prev.length !== next.length) return true
    return prev.some((d, i) => !Object.is(d, next[i]))
  }

  return {
    ...actualReact,
    useState: (initial: unknown) => {
      const idx = stateCursor++
      if (idx >= stateSlots.length) {
        stateSlots[idx] =
          typeof initial === 'function' ? (initial as () => unknown)() : initial
      }
      const setState = (updater: unknown) => {
        stateSlots[idx] =
          typeof updater === 'function'
            ? (updater as (prev: unknown) => unknown)(stateSlots[idx])
            : updater
      }
      return [stateSlots[idx], setState]
    },
    useEffect: (effect: () => void | (() => void), deps?: unknown[]) => {
      const idx = effectCursor++
      if (depsChanged(effectDeps[idx], deps)) {
        const priorCleanup = effectCleanups[idx]
        if (typeof priorCleanup === 'function') {
          priorCleanup()
        }
        effectDeps[idx] = deps
        effectCleanups[idx] = effect()
      }
    },
    __beginRender: () => {
      stateCursor = 0
      effectCursor = 0
    },
    __resetMount: () => {
      stateSlots = []
      stateCursor = 0
      effectDeps = []
      effectCleanups = []
      effectCursor = 0
    },
    // Invokes every recorded effect cleanup (the `cancelled = true` closure flip) without
    // re-invoking the hook afterward -- simulates a real unmount, which this hand-rolled
    // harness otherwise has no lifecycle concept of.
    __unmount: () => {
      for (const cleanup of effectCleanups) {
        if (typeof cleanup === 'function') cleanup()
      }
      effectCleanups = []
    }
  }
})

const mockIsTauri = jest.fn(() => true)
jest.mock('preload/tauriTransport', () => ({
  isTauri: mockIsTauri
}))

const mockApi = {
  oauthCaptureLogin: jest.fn(),
  login: jest.fn(),
  authGOG: jest.fn(),
  authAmazon: jest.fn(),
  authZoom: jest.fn(),
  getAmazonLoginData: jest.fn(),
  logInfo: jest.fn()
}
;(globalThis as unknown as { window: { api: typeof mockApi } }).window = {
  api: mockApi
}

// Imported after the mocks above (textual order -- this project's ts-jest setup does not
// hoist jest.mock like babel-jest; see useDebouncedStoreSearch.test.ts).
import { useTauriOAuthLogin, type TauriOAuthLoginState } from '../useTauriOAuthLogin'
import type { OAuthRunner } from 'common/types/oauthLogin'

const UNPORTED_CHANNEL_MARKER = '[GAMELIB_UNPORTED_CHANNEL]'

type Hook = TauriOAuthLoginState
type HookHarness = {
  __beginRender: () => void
  __resetMount: () => void
  __unmount: () => void
}

function harness(): HookHarness {
  return jest.requireMock('react') as unknown as HookHarness
}

function mount(runner: OAuthRunner | undefined): Hook {
  harness().__resetMount()
  harness().__beginRender()
  return useTauriOAuthLogin(runner)
}

function rerender(runner: OAuthRunner | undefined): Hook {
  harness().__beginRender()
  return useTauriOAuthLogin(runner)
}

function unmount(): void {
  harness().__unmount()
}

function flushPromises(): Promise<void> {
  return Promise.resolve()
    .then(() => Promise.resolve())
    .then(() => Promise.resolve())
}

/** Mirrors useDebouncedStoreSearch.test.ts's `settle()` -- flushes microtasks and re-invokes
 * the hook a fixed number of times so any chain of out-of-render state mutations has enough
 * render-hops to become observable. */
async function settle(runner: OAuthRunner | undefined): Promise<Hook> {
  let value: Hook = { phase: 'idle' }
  for (let i = 0; i < 8; i++) {
    await flushPromises()
    value = rerender(runner)
  }
  return value
}

const AMAZON_LOGIN_DATA = {
  url: 'https://amazon.com/ap/signin',
  client_id: 'client-1',
  code_verifier: 'verifier-1',
  serial: 'serial-1'
}

beforeEach(() => {
  mockIsTauri.mockReturnValue(true)
  mockApi.oauthCaptureLogin.mockReset()
  mockApi.login.mockReset()
  mockApi.authGOG.mockReset()
  mockApi.authAmazon.mockReset()
  mockApi.authZoom.mockReset()
  mockApi.getAmazonLoginData.mockReset()
  mockApi.logInfo.mockReset()
  mockApi.getAmazonLoginData.mockResolvedValue(AMAZON_LOGIN_DATA)
})

describe('useTauriOAuthLogin — guard (no-op outside the four OAuth runners)', () => {
  it('runner=undefined never calls oauthCaptureLogin and stays idle', async () => {
    const hook = await settle(undefined)
    expect(hook).toEqual({ phase: 'idle' })
    expect(mockApi.oauthCaptureLogin).not.toHaveBeenCalled()
  })

  it("runner='humble' (not one of the four OAuth runners) never calls oauthCaptureLogin", async () => {
    const hook = await settle('humble' as never)
    expect(hook).toEqual({ phase: 'idle' })
    expect(mockApi.oauthCaptureLogin).not.toHaveBeenCalled()
  })

  it('under Electron (isTauri() false) stays idle and calls nothing, even for a real OAuth runner', async () => {
    mockIsTauri.mockReturnValue(false)
    const hook = await settle('legendary')
    expect(hook).toEqual({ phase: 'idle' })
    expect(mockApi.oauthCaptureLogin).not.toHaveBeenCalled()
    expect(mockApi.login).not.toHaveBeenCalled()
  })
})

describe('useTauriOAuthLogin — opens the capture and reports awaiting', () => {
  it.each<[OAuthRunner, string]>([
    ['legendary', 'https://www.epicgames.com/id/login?responseType=code'],
    [
      'gog',
      'https://auth.gog.com/auth?client_id=46899977096215655&redirect_uri=https%3A%2F%2Fembed.gog.com%2Fon_login_success%3Forigin%3Dclient&response_type=code&layout=galaxy'
    ],
    ['zoom', 'https://www.zoom-platform.com/login?li=heroic&return_li_token=true']
  ])('runner=%s calls oauthCaptureLogin once with that runner and its login url', async (runner, expectedUrl) => {
    mockApi.oauthCaptureLogin.mockImplementation(
      () => new Promise(() => {}) // never resolves -- only asserting the call shape here
    )

    let hook = mount(runner)
    expect(hook).toEqual({ phase: 'idle' })
    await flushPromises()
    hook = rerender(runner)

    expect(hook).toEqual({ phase: 'awaiting' })
    expect(mockApi.oauthCaptureLogin).toHaveBeenCalledTimes(1)
    expect(mockApi.oauthCaptureLogin).toHaveBeenCalledWith({
      runner,
      url: expectedUrl
    })
  })

  it("runner='nile' fetches getAmazonLoginData() first and forwards its .url", async () => {
    mockApi.oauthCaptureLogin.mockImplementation(() => new Promise(() => {}))

    let hook = mount('nile')
    expect(hook).toEqual({ phase: 'idle' })
    await settle('nile')
    hook = rerender('nile')

    expect(mockApi.getAmazonLoginData).toHaveBeenCalledTimes(1)
    expect(mockApi.oauthCaptureLogin).toHaveBeenCalledWith({
      runner: 'nile',
      url: AMAZON_LOGIN_DATA.url
    })
    expect(hook).toEqual({ phase: 'awaiting' })
  })
})

describe('useTauriOAuthLogin — captured -> auth channel -> blocked (D-04)', () => {
  it.each<[OAuthRunner, keyof typeof mockApi, string]>([
    ['legendary', 'login', 'login'],
    ['gog', 'authGOG', 'authGOG'],
    ['nile', 'authAmazon', 'authAmazon'],
    ['zoom', 'authZoom', 'authZoom']
  ])(
    'runner=%s: a captured code handed to %s rejecting with UNPORTED_CHANNEL_MARKER resolves { phase: "blocked", channel: %s }',
    async (runner, apiMethod, expectedChannel) => {
      mockApi.oauthCaptureLogin.mockResolvedValue({
        status: 'captured',
        runner,
        code: 'CODE123',
        redirectUrl: 'https://example.com/?code=CODE123'
      })
      mockApi[apiMethod].mockRejectedValue(
        new Error(`${UNPORTED_CHANNEL_MARKER} No handler registered for channel '${apiMethod}'`)
      )

      const unhandled = jest.fn()
      process.on('unhandledRejection', unhandled)
      try {
        mount(runner)
        const hook = await settle(runner)

        expect(hook).toEqual({ phase: 'blocked', runner, channel: expectedChannel })
        expect(mockApi[apiMethod]).toHaveBeenCalledTimes(1)
      } finally {
        process.off('unhandledRejection', unhandled)
      }
      // The mocked UNPORTED_CHANNEL_MARKER rejection was consumed by the hook's own catch --
      // it must never surface as an unhandled rejection.
      expect(unhandled).not.toHaveBeenCalled()
    }
  )

  it('legendary: passes the captured code to window.api.login', async () => {
    mockApi.oauthCaptureLogin.mockResolvedValue({
      status: 'captured',
      runner: 'legendary',
      code: 'EPIC-CODE',
      redirectUrl: 'http://localhost:8080/?code=EPIC-CODE'
    })
    mockApi.login.mockRejectedValue(new Error(UNPORTED_CHANNEL_MARKER))

    mount('legendary')
    await settle('legendary')

    expect(mockApi.login).toHaveBeenCalledWith('EPIC-CODE')
  })

  it('gog: passes the captured code to window.api.authGOG', async () => {
    mockApi.oauthCaptureLogin.mockResolvedValue({
      status: 'captured',
      runner: 'gog',
      code: 'GOG-CODE',
      redirectUrl: 'https://embed.gog.com/on_login_success?code=GOG-CODE'
    })
    mockApi.authGOG.mockRejectedValue(new Error(UNPORTED_CHANNEL_MARKER))

    mount('gog')
    await settle('gog')

    expect(mockApi.authGOG).toHaveBeenCalledWith('GOG-CODE')
  })

  it('nile: passes { client_id, code, code_verifier, serial } to window.api.authAmazon', async () => {
    mockApi.oauthCaptureLogin.mockResolvedValue({
      status: 'captured',
      runner: 'nile',
      code: 'NILE-CODE',
      redirectUrl: 'https://amazon.com/ap/signin?openid.oa2.authorization_code=NILE-CODE'
    })
    mockApi.authAmazon.mockRejectedValue(new Error(UNPORTED_CHANNEL_MARKER))

    mount('nile')
    await settle('nile')

    expect(mockApi.authAmazon).toHaveBeenCalledWith({
      client_id: AMAZON_LOGIN_DATA.client_id,
      code: 'NILE-CODE',
      code_verifier: AMAZON_LOGIN_DATA.code_verifier,
      serial: AMAZON_LOGIN_DATA.serial
    })
  })

  it('zoom: passes the FULL redirectUrl (not the token) to window.api.authZoom', async () => {
    mockApi.oauthCaptureLogin.mockResolvedValue({
      status: 'captured',
      runner: 'zoom',
      code: 'ZTOK',
      redirectUrl: 'https://www.zoom-platform.com/?li_token=ZTOK'
    })
    mockApi.authZoom.mockRejectedValue(new Error(UNPORTED_CHANNEL_MARKER))

    mount('zoom')
    await settle('zoom')

    expect(mockApi.authZoom).toHaveBeenCalledWith('https://www.zoom-platform.com/?li_token=ZTOK')
  })

  it('a non-marker rejection from the auth channel becomes { phase: "error" }, never "blocked"', async () => {
    mockApi.oauthCaptureLogin.mockResolvedValue({
      status: 'captured',
      runner: 'gog',
      code: 'GOG-CODE',
      redirectUrl: 'https://embed.gog.com/on_login_success?code=GOG-CODE'
    })
    mockApi.authGOG.mockRejectedValue(new Error('backend exploded'))

    mount('gog')
    const hook = await settle('gog')

    expect(hook).toEqual({ phase: 'error', message: 'backend exploded' })
  })

  it('a resolved (non-rejecting) auth channel call falls through to idle, never forcing "blocked"', async () => {
    mockApi.oauthCaptureLogin.mockResolvedValue({
      status: 'captured',
      runner: 'gog',
      code: 'GOG-CODE',
      redirectUrl: 'https://embed.gog.com/on_login_success?code=GOG-CODE'
    })
    mockApi.authGOG.mockResolvedValue({ status: 'done', data: undefined })

    mount('gog')
    const hook = await settle('gog')

    expect(hook).toEqual({ phase: 'idle' })
  })
})

describe('useTauriOAuthLogin — non-captured outcomes map to their own phases', () => {
  it('{ status: "cancelled" } -> { phase: "cancelled" }', async () => {
    mockApi.oauthCaptureLogin.mockResolvedValue({ status: 'cancelled' })
    mount('zoom')
    const hook = await settle('zoom')
    expect(hook).toEqual({ phase: 'cancelled' })
  })

  it('{ status: "timeout" } -> { phase: "timeout" }', async () => {
    mockApi.oauthCaptureLogin.mockResolvedValue({ status: 'timeout' })
    mount('zoom')
    const hook = await settle('zoom')
    expect(hook).toEqual({ phase: 'timeout' })
  })

  it('{ status: "unsupported" } -> { phase: "error" }', async () => {
    mockApi.oauthCaptureLogin.mockResolvedValue({ status: 'unsupported' })
    mount('zoom')
    const hook = await settle('zoom')
    expect(hook.phase).toBe('error')
  })

  it('{ status: "error", message } -> { phase: "error", message }', async () => {
    mockApi.oauthCaptureLogin.mockResolvedValue({
      status: 'error',
      message: 'seam threw'
    })
    mount('zoom')
    const hook = await settle('zoom')
    expect(hook).toEqual({ phase: 'error', message: 'seam threw' })
  })
})

describe('useTauriOAuthLogin — unmount safety', () => {
  it('unmounting mid-capture does not call setState afterward (no leak)', async () => {
    let resolveCapture: (value: unknown) => void = () => {}
    mockApi.oauthCaptureLogin.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCapture = resolve
        })
    )

    mount('legendary')
    await flushPromises()
    const beforeUnmount = rerender('legendary')
    expect(beforeUnmount).toEqual({ phase: 'awaiting' })

    unmount()

    // Capture resolves AFTER unmount -- must not throw, and must not be observable on a
    // subsequent render (there is no subsequent render in a real unmount, but re-mounting
    // fresh proves the stale promise's resolution never wrote into a stale slot either).
    resolveCapture({
      status: 'captured',
      runner: 'legendary',
      code: 'STALE-CODE',
      redirectUrl: 'http://localhost:8080/?code=STALE-CODE'
    })
    await flushPromises()

    // No error thrown, and mockApi.login (the next step after a real capture) was never
    // reached -- the cancelled guard stopped the chain before it got there.
    expect(mockApi.login).not.toHaveBeenCalled()
  })
})
