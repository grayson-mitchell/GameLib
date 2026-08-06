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
  getZoomUserInfo: jest.fn(),
  logInfo: jest.fn()
}
;(globalThis as unknown as { window: { api: typeof mockApi } }).window = {
  api: mockApi
}

// Imported after the mocks above (textual order -- this project's ts-jest setup does not
// hoist jest.mock like babel-jest; see useDebouncedStoreSearch.test.ts).
import {
  useTauriOAuthLogin,
  createOAuthLoginCompletion,
  type TauriOAuthLoginState,
  type OAuthLoginCompletionPayload
} from '../useTauriOAuthLogin'
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

type OnLoginSuccess = (payload: OAuthLoginCompletionPayload) => void
// Quick task 260803-eee Task 4: the cancel-path sibling of OnLoginSuccess.
type OnCancelled = () => void

function mount(
  runner: OAuthRunner | undefined,
  onLoginSuccess?: OnLoginSuccess,
  onCancelled?: OnCancelled
): Hook {
  harness().__resetMount()
  harness().__beginRender()
  return useTauriOAuthLogin(runner, onLoginSuccess, onCancelled)
}

function rerender(
  runner: OAuthRunner | undefined,
  onLoginSuccess?: OnLoginSuccess,
  onCancelled?: OnCancelled
): Hook {
  harness().__beginRender()
  return useTauriOAuthLogin(runner, onLoginSuccess, onCancelled)
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
async function settle(
  runner: OAuthRunner | undefined,
  onLoginSuccess?: OnLoginSuccess,
  onCancelled?: OnCancelled
): Promise<Hook> {
  let value: Hook = { phase: 'idle' }
  for (let i = 0; i < 8; i++) {
    await flushPromises()
    value = rerender(runner, onLoginSuccess, onCancelled)
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
  mockApi.getZoomUserInfo.mockReset()
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
      const onLoginSuccess = jest.fn()

      const unhandled = jest.fn()
      process.on('unhandledRejection', unhandled)
      try {
        mount(runner, onLoginSuccess)
        const hook = await settle(runner, onLoginSuccess)

        expect(hook).toEqual({ phase: 'blocked', runner, channel: expectedChannel })
        expect(mockApi[apiMethod]).toHaveBeenCalledTimes(1)
      } finally {
        process.off('unhandledRejection', unhandled)
      }
      // The mocked UNPORTED_CHANNEL_MARKER rejection was consumed by the hook's own catch --
      // it must never surface as an unhandled rejection.
      expect(unhandled).not.toHaveBeenCalled()
      // A blocked/refused channel must never be mistaken for a successful login.
      expect(onLoginSuccess).not.toHaveBeenCalled()
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
    const onLoginSuccess = jest.fn()

    mount('gog', onLoginSuccess)
    const hook = await settle('gog', onLoginSuccess)

    expect(hook).toEqual({ phase: 'error', message: 'backend exploded' })
    expect(onLoginSuccess).not.toHaveBeenCalled()
  })
})

describe('useTauriOAuthLogin — captured -> auth channel -> completion (Phase 34.5 Plan 26, F-34.5-G6-02 layer 2)', () => {
  it('a resolved { status: "done" } auth channel call falls through to idle, never forcing "blocked"', async () => {
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

  it('on { status: "done" }, invokes the injected onLoginSuccess exactly once with the correct runner and username', async () => {
    mockApi.oauthCaptureLogin.mockResolvedValue({
      status: 'captured',
      runner: 'gog',
      code: 'GOG-CODE',
      redirectUrl: 'https://embed.gog.com/on_login_success?code=GOG-CODE'
    })
    mockApi.authGOG.mockResolvedValue({ status: 'done', data: { username: 'grayson' } })
    const onLoginSuccess = jest.fn()

    mount('gog', onLoginSuccess)
    const hook = await settle('gog', onLoginSuccess)

    expect(hook).toEqual({ phase: 'idle' })
    expect(onLoginSuccess).toHaveBeenCalledTimes(1)
    expect(onLoginSuccess).toHaveBeenCalledWith({
      runner: 'gog',
      username: 'grayson',
      user_id: undefined
    })
  })

  it('legendary: onLoginSuccess receives displayName as username', async () => {
    mockApi.oauthCaptureLogin.mockResolvedValue({
      status: 'captured',
      runner: 'legendary',
      code: 'EPIC-CODE',
      redirectUrl: 'http://localhost:8080/?code=EPIC-CODE'
    })
    mockApi.login.mockResolvedValue({
      status: 'done',
      data: { account_id: 'acc-1', displayName: 'Epic Grayson', user: 'epic-user' }
    })
    const onLoginSuccess = jest.fn()

    mount('legendary', onLoginSuccess)
    await settle('legendary', onLoginSuccess)

    expect(onLoginSuccess).toHaveBeenCalledWith({
      runner: 'legendary',
      username: 'Epic Grayson',
      user_id: undefined
    })
  })

  it('nile: onLoginSuccess receives both username (user.name) and user_id', async () => {
    mockApi.oauthCaptureLogin.mockResolvedValue({
      status: 'captured',
      runner: 'nile',
      code: 'NILE-CODE',
      redirectUrl: 'https://amazon.com/ap/signin?openid.oa2.authorization_code=NILE-CODE'
    })
    mockApi.authAmazon.mockResolvedValue({
      status: 'done',
      user: {
        account_pool: 'pool-1',
        user_id: 'nile-user-1',
        home_region: 'us',
        name: 'Nile Grayson',
        given_name: 'Grayson'
      }
    })
    const onLoginSuccess = jest.fn()

    mount('nile', onLoginSuccess)
    await settle('nile', onLoginSuccess)

    expect(onLoginSuccess).toHaveBeenCalledWith({
      runner: 'nile',
      username: 'Nile Grayson',
      user_id: 'nile-user-1'
    })
  })

  it('zoom: fetches getZoomUserInfo() only after status is "done" and forwards its username', async () => {
    mockApi.oauthCaptureLogin.mockResolvedValue({
      status: 'captured',
      runner: 'zoom',
      code: 'ZTOK',
      redirectUrl: 'https://www.zoom-platform.com/?li_token=ZTOK'
    })
    mockApi.authZoom.mockResolvedValue({ status: 'done' })
    mockApi.getZoomUserInfo.mockResolvedValue({ username: 'Zoom Grayson' })
    const onLoginSuccess = jest.fn()

    mount('zoom', onLoginSuccess)
    await settle('zoom', onLoginSuccess)

    expect(mockApi.getZoomUserInfo).toHaveBeenCalledTimes(1)
    expect(onLoginSuccess).toHaveBeenCalledWith({
      runner: 'zoom',
      username: 'Zoom Grayson',
      user_id: undefined
    })
  })

  it('zoom: does NOT call getZoomUserInfo() when authZoom resolves a non-"done" status', async () => {
    mockApi.oauthCaptureLogin.mockResolvedValue({
      status: 'captured',
      runner: 'zoom',
      code: 'ZTOK',
      redirectUrl: 'https://www.zoom-platform.com/?li_token=ZTOK'
    })
    mockApi.authZoom.mockResolvedValue({ status: 'error' })
    const onLoginSuccess = jest.fn()

    mount('zoom', onLoginSuccess)
    const hook = await settle('zoom', onLoginSuccess)

    expect(mockApi.getZoomUserInfo).not.toHaveBeenCalled()
    expect(onLoginSuccess).not.toHaveBeenCalled()
    expect(hook).toEqual({
      phase: 'error',
      message: 'Login failed for zoom: status=error'
    })
  })

  it('a resolved-but-refused ({ status: "failed" }) response settles { phase: "error" } naming the status, never masquerading as "blocked" or invoking onLoginSuccess', async () => {
    mockApi.oauthCaptureLogin.mockResolvedValue({
      status: 'captured',
      runner: 'legendary',
      code: 'EPIC-CODE',
      redirectUrl: 'http://localhost:8080/?code=EPIC-CODE'
    })
    mockApi.login.mockResolvedValue({ status: 'failed', data: undefined })
    const onLoginSuccess = jest.fn()

    mount('legendary', onLoginSuccess)
    const hook = await settle('legendary', onLoginSuccess)

    expect(hook).toEqual({
      phase: 'error',
      message: 'Login failed for legendary: status=failed'
    })
    expect(onLoginSuccess).not.toHaveBeenCalled()

    const matching = mockApi.logInfo.mock.calls.filter(
      ([line]) => typeof line === 'string' && line.includes('auth channel refused: status=failed')
    )
    expect(matching).toHaveLength(1)
  })

  it('outside Tauri (isTauri() false), onLoginSuccess is never invoked even for a real OAuth runner', async () => {
    mockIsTauri.mockReturnValue(false)
    const onLoginSuccess = jest.fn()

    const hook = await settle('gog', onLoginSuccess)

    expect(hook).toEqual({ phase: 'idle' })
    expect(onLoginSuccess).not.toHaveBeenCalled()
    expect(mockApi.authGOG).not.toHaveBeenCalled()
  })
})

describe('useTauriOAuthLogin — completion callback drives the real GlobalState-shaped wiring (Task 2)', () => {
  // Constructs the completion callback EXACTLY as index.tsx wires it: `createOAuthLoginCompletion`
  // is the same factory GlobalState.tsx uses to build `completeOAuthLogin`, with `setState` and
  // `handleSuccessfulLogin` spied so the OBSERVABLE downstream effect (a library refresh, not the
  // mutating call's own report) can be asserted -- per this phase's standing lesson that a green
  // suite is not evidence of parity unless something asserts parity.
  function wireCompletionCallback() {
    const setState = jest.fn()
    const handleSuccessfulLogin = jest.fn()
    const onLoginSuccess = createOAuthLoginCompletion({ setState, handleSuccessfulLogin })
    return { setState, handleSuccessfulLogin, onLoginSuccess }
  }

  it('the wired handleSuccessfulLogin -> refreshLibrary chain receives { library: runner } (mirrors GlobalState.tsx\'s own handleSuccessfulLogin body)', async () => {
    const setState = jest.fn()
    const refreshLibrary = jest.fn()
    // Mirrors GlobalState.tsx's own handleSuccessfulLogin body EXACTLY --
    //   storage.setItem('category', 'all')
    //   this.refreshLibrary({ runInBackground: false, library: runner })
    // -- so asserting on refreshLibrary here is asserting the REAL production observable effect
    // a captured OAuth login triggers, not a re-interpretation of it.
    function handleSuccessfulLogin(runner: OAuthRunner): void {
      refreshLibrary({ runInBackground: false, library: runner })
    }
    const onLoginSuccess = createOAuthLoginCompletion({ setState, handleSuccessfulLogin })

    mockApi.oauthCaptureLogin.mockResolvedValue({
      status: 'captured',
      runner: 'gog',
      code: 'GOG-CODE',
      redirectUrl: 'https://embed.gog.com/on_login_success?code=GOG-CODE'
    })
    mockApi.authGOG.mockResolvedValue({ status: 'done', data: { username: 'grayson' } })

    mount('gog', onLoginSuccess)
    await settle('gog', onLoginSuccess)

    expect(refreshLibrary).toHaveBeenCalledTimes(1)
    expect(refreshLibrary).toHaveBeenCalledWith({
      runInBackground: false,
      library: 'gog'
    })
  })

  it('a successful GOG capture calls setState with the gog slice and handleSuccessfulLogin with "gog"', async () => {
    const { setState, handleSuccessfulLogin, onLoginSuccess } = wireCompletionCallback()

    mockApi.oauthCaptureLogin.mockResolvedValue({
      status: 'captured',
      runner: 'gog',
      code: 'GOG-CODE',
      redirectUrl: 'https://embed.gog.com/on_login_success?code=GOG-CODE'
    })
    mockApi.authGOG.mockResolvedValue({ status: 'done', data: { username: 'grayson' } })

    mount('gog', onLoginSuccess)
    await settle('gog', onLoginSuccess)

    // Asserted by VALUE, not merely "was called" -- a future change that refreshed the wrong
    // library would still make a bare "was called" assertion pass.
    expect(setState).toHaveBeenCalledWith({ gog: { library: [], username: 'grayson' } })
    expect(handleSuccessfulLogin).toHaveBeenCalledTimes(1)
    expect(handleSuccessfulLogin).toHaveBeenCalledWith('gog')
    // No other runner's slice was ever touched by this single GOG login.
    expect(setState).not.toHaveBeenCalledWith(
      expect.objectContaining({ epic: expect.anything() })
    )
    expect(setState).not.toHaveBeenCalledWith(
      expect.objectContaining({ amazon: expect.anything() })
    )
    expect(setState).not.toHaveBeenCalledWith(
      expect.objectContaining({ zoom: expect.anything() })
    )
  })

  it('a successful nile capture sets both user_id and username, leaving other runners untouched', async () => {
    const { setState, handleSuccessfulLogin, onLoginSuccess } = wireCompletionCallback()

    mockApi.oauthCaptureLogin.mockResolvedValue({
      status: 'captured',
      runner: 'nile',
      code: 'NILE-CODE',
      redirectUrl: 'https://amazon.com/ap/signin?openid.oa2.authorization_code=NILE-CODE'
    })
    mockApi.authAmazon.mockResolvedValue({
      status: 'done',
      user: {
        account_pool: 'pool-1',
        user_id: 'nile-user-1',
        home_region: 'us',
        name: 'Nile Grayson',
        given_name: 'Grayson'
      }
    })

    mount('nile', onLoginSuccess)
    await settle('nile', onLoginSuccess)

    expect(setState).toHaveBeenCalledWith({
      amazon: { library: [], user_id: 'nile-user-1', username: 'Nile Grayson' }
    })
    expect(handleSuccessfulLogin).toHaveBeenCalledWith('nile')
    expect(setState).not.toHaveBeenCalledWith(expect.objectContaining({ gog: expect.anything() }))
    expect(setState).not.toHaveBeenCalledWith(
      expect.objectContaining({ epic: expect.anything() })
    )
  })

  it('a capture that ends { phase: "blocked" } never calls setState or handleSuccessfulLogin', async () => {
    const { setState, handleSuccessfulLogin, onLoginSuccess } = wireCompletionCallback()

    mockApi.oauthCaptureLogin.mockResolvedValue({
      status: 'captured',
      runner: 'gog',
      code: 'GOG-CODE',
      redirectUrl: 'https://embed.gog.com/on_login_success?code=GOG-CODE'
    })
    mockApi.authGOG.mockRejectedValue(new Error(UNPORTED_CHANNEL_MARKER))

    mount('gog', onLoginSuccess)
    const hook = await settle('gog', onLoginSuccess)

    expect(hook).toEqual({ phase: 'blocked', runner: 'gog', channel: 'authGOG' })
    expect(setState).not.toHaveBeenCalled()
    expect(handleSuccessfulLogin).not.toHaveBeenCalled()
  })

  it('a capture that ends { phase: "error" } (resolved-but-refused) never calls setState or handleSuccessfulLogin', async () => {
    const { setState, handleSuccessfulLogin, onLoginSuccess } = wireCompletionCallback()

    mockApi.oauthCaptureLogin.mockResolvedValue({
      status: 'captured',
      runner: 'gog',
      code: 'GOG-CODE',
      redirectUrl: 'https://embed.gog.com/on_login_success?code=GOG-CODE'
    })
    mockApi.authGOG.mockResolvedValue({ status: 'error', data: undefined })

    mount('gog', onLoginSuccess)
    const hook = await settle('gog', onLoginSuccess)

    expect(hook.phase).toBe('error')
    expect(setState).not.toHaveBeenCalled()
    expect(handleSuccessfulLogin).not.toHaveBeenCalled()
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

describe('useTauriOAuthLogin — onCancelled callback (quick task 260803-eee Task 4)', () => {
  it('{ status: "cancelled" } invokes onCancelled exactly once', async () => {
    mockApi.oauthCaptureLogin.mockResolvedValue({ status: 'cancelled' })
    const onCancelled = jest.fn()

    mount('gog', undefined, onCancelled)
    const hook = await settle('gog', undefined, onCancelled)

    expect(hook).toEqual({ phase: 'cancelled' })
    expect(onCancelled).toHaveBeenCalledTimes(1)
  })

  it.each<[string, unknown]>([
    ['timeout', { status: 'timeout' }],
    ['unsupported', { status: 'unsupported' }],
    ['error', { status: 'error', message: 'seam threw' }]
  ])(
    'a non-cancelled outcome (%s) never invokes onCancelled',
    async (_label, outcome) => {
      mockApi.oauthCaptureLogin.mockResolvedValue(outcome)
      const onCancelled = jest.fn()

      mount('gog', undefined, onCancelled)
      await settle('gog', undefined, onCancelled)

      expect(onCancelled).not.toHaveBeenCalled()
    }
  )

  it('a captured login that succeeds never invokes onCancelled', async () => {
    mockApi.oauthCaptureLogin.mockResolvedValue({
      status: 'captured',
      runner: 'gog',
      code: 'GOG-CODE',
      redirectUrl: 'https://embed.gog.com/on_login_success?code=GOG-CODE'
    })
    mockApi.authGOG.mockResolvedValue({ status: 'done', data: { username: 'grayson' } })
    const onCancelled = jest.fn()
    const onLoginSuccess = jest.fn()

    mount('gog', onLoginSuccess, onCancelled)
    await settle('gog', onLoginSuccess, onCancelled)

    expect(onLoginSuccess).toHaveBeenCalledTimes(1)
    expect(onCancelled).not.toHaveBeenCalled()
  })

  it('a late { status: "cancelled" } resolution after real unmount does not invoke onCancelled (shares the pre-capture short-circuit with timeout/error/unsupported)', async () => {
    let resolveCapture: (value: unknown) => void = () => {}
    mockApi.oauthCaptureLogin.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCapture = resolve
        })
    )
    const onCancelled = jest.fn()

    mount('gog', undefined, onCancelled)
    await flushPromises()
    rerender('gog', undefined, onCancelled)

    unmount()

    resolveCapture({ status: 'cancelled' })
    await flushPromises()

    // The component (and the route it would have navigated away from) is already gone in this
    // scenario, so there is nothing for onCancelled to usefully do -- unlike onLoginSuccess,
    // which must still propagate a captured code's irreversible auth-exchange result.
    expect(onCancelled).not.toHaveBeenCalled()
  })

  it('runner=undefined never invokes onCancelled (guard no-op)', async () => {
    const onCancelled = jest.fn()

    await settle(undefined, undefined, onCancelled)

    expect(onCancelled).not.toHaveBeenCalled()
  })
})

describe('useTauriOAuthLogin — capture-transport-failed (F-34.5-G6-02, plan 34.5-23)', () => {
  it('a rejected oauthCaptureLogin settles on { phase: "error", message } instead of staying "awaiting"', async () => {
    mockApi.oauthCaptureLogin.mockRejectedValue(new Error('sidecar invoke timed out'))

    const unhandled = jest.fn()
    process.on('unhandledRejection', unhandled)
    try {
      mount('gog')
      const hook = await settle('gog')

      expect(hook).toEqual({ phase: 'error', message: 'sidecar invoke timed out' })
    } finally {
      process.off('unhandledRejection', unhandled)
    }
    // The rejection must never escape as an unhandled promise rejection -- this was the
    // exact defect shape F-34.5-G6-02 diagnosed (a bare, unguarded await).
    expect(unhandled).not.toHaveBeenCalled()
  })

  it('emits exactly one logInfo line containing capture-transport-failed and the runner name', async () => {
    mockApi.oauthCaptureLogin.mockRejectedValue(new Error('sidecar invoke timed out'))

    mount('gog')
    await settle('gog')

    const matching = mockApi.logInfo.mock.calls.filter(([line]) =>
      typeof line === 'string' && line.includes('capture-transport-failed')
    )
    expect(matching).toHaveLength(1)
    expect(matching[0][0]).toContain('runner=gog')
  })

  it('a non-Error rejection value still produces a { phase: "error" } state via String(error)', async () => {
    mockApi.oauthCaptureLogin.mockRejectedValue('raw-string-rejection')

    mount('zoom')
    const hook = await settle('zoom')

    expect(hook).toEqual({ phase: 'error', message: 'raw-string-rejection' })
  })

  it('a late rejection after unmount produces no setState, logging only the Plan 34.5-34 cancelled-midflight diagnostic (Task 1 supersedes the old "no log line" assertion)', async () => {
    let rejectCapture: (reason: unknown) => void = () => {}
    mockApi.oauthCaptureLogin.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectCapture = reject
        })
    )

    mount('legendary')
    await flushPromises()
    const beforeUnmount = rerender('legendary')
    expect(beforeUnmount).toEqual({ phase: 'awaiting' })

    unmount()
    mockApi.logInfo.mockClear()

    const unhandled = jest.fn()
    process.on('unhandledRejection', unhandled)
    try {
      rejectCapture(new Error('sidecar invoke timed out'))
      await flushPromises()
    } finally {
      process.off('unhandledRejection', unhandled)
    }

    expect(unhandled).not.toHaveBeenCalled()
    // Plan 34.5-34 Task 1: this site now emits a diagnostic line naming the cancellation
    // window instead of staying silent -- but it must still be the ONLY line (no error/state
    // line pretending the rejection was handled as live), and it must carry the permitted
    // vocabulary only (no message content from the rejection).
    expect(mockApi.logInfo).toHaveBeenCalledTimes(1)
    expect(mockApi.logInfo).toHaveBeenCalledWith(
      '[useTauriOAuthLogin] runner=legendary phase=cancelled-midflight at=capture-transport'
    )
  })
})

describe('useTauriOAuthLogin — cancellation-window instrumentation (Plan 34.5-34 Task 1)', () => {
  it('unmounting while the capture promise is still pending logs phase=cancelled-midflight at=capture', async () => {
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
    mockApi.logInfo.mockClear()

    resolveCapture({
      status: 'captured',
      runner: 'legendary',
      code: 'STALE-CODE',
      redirectUrl: 'http://localhost:8080/?code=STALE-CODE'
    })
    await flushPromises()

    const matching = mockApi.logInfo.mock.calls.filter(
      ([line]) =>
        typeof line === 'string' &&
        line.includes('phase=cancelled-midflight') &&
        line.includes('at=capture')
    )
    expect(matching.length).toBeGreaterThanOrEqual(1)
  })

  it('unmounting while the auth-exchange promise is still pending, then resolving { status: "done" }, logs at=auth authStatus=done', async () => {
    mockApi.oauthCaptureLogin.mockResolvedValue({
      status: 'captured',
      runner: 'gog',
      code: 'GOG-CODE',
      redirectUrl: 'https://embed.gog.com/on_login_success?code=GOG-CODE'
    })
    let resolveAuth: (value: unknown) => void = () => {}
    mockApi.authGOG.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAuth = resolve
        })
    )

    mount('gog')
    await settle('gog')
    expect(mockApi.authGOG).toHaveBeenCalledTimes(1)

    unmount()
    mockApi.logInfo.mockClear()

    resolveAuth({ status: 'done', data: { username: 'grayson' } })
    await flushPromises()

    const matching = mockApi.logInfo.mock.calls.filter(
      ([line]) =>
        typeof line === 'string' &&
        line.includes('at=auth') &&
        line.includes('authStatus=done')
    )
    expect(matching.length).toBeGreaterThanOrEqual(1)
  })

  it('a normal, uncancelled login to completion never logs a cancelled-midflight line', async () => {
    mockApi.oauthCaptureLogin.mockResolvedValue({
      status: 'captured',
      runner: 'gog',
      code: 'GOG-CODE',
      redirectUrl: 'https://embed.gog.com/on_login_success?code=GOG-CODE'
    })
    mockApi.authGOG.mockResolvedValue({ status: 'done', data: { username: 'grayson' } })

    mount('gog')
    await settle('gog')

    const matching = mockApi.logInfo.mock.calls.filter(
      ([line]) => typeof line === 'string' && line.includes('cancelled-midflight')
    )
    expect(matching).toHaveLength(0)
  })

  it('the cleanup logs a phase=teardown line naming whether a run was still in flight', async () => {
    let resolveCapture: (value: unknown) => void = () => {}
    mockApi.oauthCaptureLogin.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCapture = resolve
        })
    )

    mount('legendary')
    await flushPromises()
    rerender('legendary')

    unmount()

    const teardownLines = mockApi.logInfo.mock.calls.filter(
      ([line]) => typeof line === 'string' && line.includes('phase=teardown')
    )
    expect(teardownLines).toHaveLength(1)
    expect(teardownLines[0][0]).toContain('inflight=true')

    // Avoid leaking the still-pending promise into a later test.
    resolveCapture({ status: 'cancelled' })
  })

  it('every logInfo argument uses only the permitted key vocabulary -- never a code, token, redirect URL, or raw username', async () => {
    mockApi.oauthCaptureLogin.mockResolvedValue({
      status: 'captured',
      runner: 'nile',
      code: 'NILE-SECRET-CODE',
      redirectUrl: 'https://amazon.com/ap/signin?openid.oa2.authorization_code=NILE-SECRET-CODE'
    })
    mockApi.authAmazon.mockResolvedValue({
      status: 'done',
      user: {
        account_pool: 'pool-1',
        user_id: 'nile-user-1',
        home_region: 'us',
        name: 'SecretUsername',
        given_name: 'Grayson'
      }
    })

    mount('nile')
    await settle('nile')

    const permittedKeys = ['runner', 'phase', 'at', 'authStatus', 'inflight', 'channel', 'message']
    const forbidden = ['NILE-SECRET-CODE', 'SecretUsername', 'authorization_code']

    for (const [line] of mockApi.logInfo.mock.calls) {
      expect(typeof line).toBe('string')
      for (const banned of forbidden) {
        expect(line as string).not.toContain(banned)
      }
      const keysInLine = permittedKeys.filter((key) => (line as string).includes(`${key}=`))
      // Every logged line uses `key=value` tokens drawn only from the permitted vocabulary --
      // this loop asserts no OTHER `=`-delimited token sneaks in unnoticed.
      const allTokens = (line as string).match(/(\w+)=/g) ?? []
      for (const token of allTokens) {
        const key = token.slice(0, -1)
        expect(permittedKeys).toContain(key)
      }
      void keysInLine
    }
  })
})

describe('useTauriOAuthLogin — finalizing (capture complete, exchange in flight) [quick task 260803-eee]', () => {
  it.each<[OAuthRunner, keyof typeof mockApi]>([
    ['legendary', 'login'],
    ['gog', 'authGOG'],
    ['nile', 'authAmazon'],
    ['zoom', 'authZoom']
  ])(
    'runner=%s: a captured outcome with the auth channel still pending leaves the hook at { phase: "finalizing", runner }',
    async (runner, apiMethod) => {
      mockApi.oauthCaptureLogin.mockResolvedValue({
        status: 'captured',
        runner,
        code: 'CODE123',
        redirectUrl: 'https://example.com/?code=CODE123'
      })
      mockApi[apiMethod].mockImplementation(() => new Promise(() => {}))

      mount(runner)
      const hook = await settle(runner)

      expect(hook).toEqual({ phase: 'finalizing', runner })
    }
  )

  it('when the auth channel then resolves { status: "done" }, the hook still settles on { phase: "idle" } and onLoginSuccess fires exactly once', async () => {
    let resolveAuth: (value: unknown) => void = () => {}
    mockApi.oauthCaptureLogin.mockResolvedValue({
      status: 'captured',
      runner: 'gog',
      code: 'GOG-CODE',
      redirectUrl: 'https://embed.gog.com/on_login_success?code=GOG-CODE'
    })
    mockApi.authGOG.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAuth = resolve
        })
    )
    const onLoginSuccess = jest.fn()

    mount('gog', onLoginSuccess)
    const finalizing = await settle('gog', onLoginSuccess)
    expect(finalizing).toEqual({ phase: 'finalizing', runner: 'gog' })

    resolveAuth({ status: 'done', data: { username: 'grayson' } })
    const hook = await settle('gog', onLoginSuccess)

    expect(hook).toEqual({ phase: 'idle' })
    expect(onLoginSuccess).toHaveBeenCalledTimes(1)
  })

  it.each<[string, unknown]>([
    ['cancelled', { status: 'cancelled' }],
    ['timeout', { status: 'timeout' }],
    ['unsupported', { status: 'unsupported' }],
    ['error', { status: 'error', message: 'seam threw' }]
  ])(
    'a non-captured outcome (%s) never passes through finalizing and logs no phase=finalizing line',
    async (_label, outcome) => {
      mockApi.oauthCaptureLogin.mockResolvedValue(outcome)

      mount('zoom')
      const hook = await settle('zoom')

      expect(hook.phase).not.toBe('finalizing')
      const finalizingLines = mockApi.logInfo.mock.calls.filter(
        ([line]) => typeof line === 'string' && line.includes('phase=finalizing')
      )
      expect(finalizingLines).toHaveLength(0)
    }
  )

  it('an auth channel rejecting with UNPORTED_CHANNEL_MARKER still settles { phase: "blocked" } -- finalizing does not shadow it', async () => {
    mockApi.oauthCaptureLogin.mockResolvedValue({
      status: 'captured',
      runner: 'gog',
      code: 'GOG-CODE',
      redirectUrl: 'https://embed.gog.com/on_login_success?code=GOG-CODE'
    })
    mockApi.authGOG.mockRejectedValue(new Error(UNPORTED_CHANNEL_MARKER))

    mount('gog')
    const hook = await settle('gog')

    expect(hook).toEqual({ phase: 'blocked', runner: 'gog', channel: 'authGOG' })
  })

  it('emits exactly one logInfo line containing phase=finalizing and the runner name per captured login', async () => {
    mockApi.oauthCaptureLogin.mockResolvedValue({
      status: 'captured',
      runner: 'gog',
      code: 'GOG-CODE',
      redirectUrl: 'https://embed.gog.com/on_login_success?code=GOG-CODE'
    })
    mockApi.authGOG.mockResolvedValue({ status: 'done', data: { username: 'grayson' } })

    mount('gog')
    await settle('gog')

    const matching = mockApi.logInfo.mock.calls.filter(
      ([line]) =>
        typeof line === 'string' &&
        line.includes('phase=finalizing') &&
        line.includes('runner=gog')
    )
    expect(matching).toHaveLength(1)
  })
})

describe('useTauriOAuthLogin — preparing (quick task 260806-teb)', () => {
  it("runner='nile' reaches { phase: 'preparing', runner: 'nile' } before getAmazonLoginData() resolves", async () => {
    let resolveAmazonData: (value: unknown) => void = () => {}
    mockApi.getAmazonLoginData.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAmazonData = resolve
        })
    )
    mockApi.oauthCaptureLogin.mockImplementation(() => new Promise(() => {}))

    mount('nile')
    await flushPromises()
    const hook = rerender('nile')

    expect(hook).toEqual({ phase: 'preparing', runner: 'nile' })
    expect(mockApi.oauthCaptureLogin).not.toHaveBeenCalled()

    resolveAmazonData(AMAZON_LOGIN_DATA)
  })

  it("runner='nile' moves preparing -> awaiting only AFTER getAmazonLoginData() resolves, and before oauthCaptureLogin is called", async () => {
    let resolveAmazonData: (value: unknown) => void = () => {}
    mockApi.getAmazonLoginData.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAmazonData = resolve
        })
    )
    mockApi.oauthCaptureLogin.mockImplementation(() => new Promise(() => {}))

    mount('nile')
    await flushPromises()
    const preparing = rerender('nile')
    expect(preparing).toEqual({ phase: 'preparing', runner: 'nile' })

    resolveAmazonData(AMAZON_LOGIN_DATA)
    const hook = await settle('nile')

    expect(hook).toEqual({ phase: 'awaiting' })
    expect(mockApi.oauthCaptureLogin).toHaveBeenCalledWith({
      runner: 'nile',
      url: AMAZON_LOGIN_DATA.url
    })
  })

  it.each<OAuthRunner>(['legendary', 'gog', 'zoom'])(
    "runner=%s never observes { phase: 'preparing' } -- its url resolves from a constant with no spawn",
    async (runner) => {
      mockApi.oauthCaptureLogin.mockImplementation(() => new Promise(() => {}))

      mount(runner)
      await flushPromises()
      const hook = rerender(runner)

      expect(hook).toEqual({ phase: 'awaiting' })
      expect(hook.phase).not.toBe('preparing')

      const preparingLines = mockApi.logInfo.mock.calls.filter(
        ([line]) => typeof line === 'string' && line.includes('phase=preparing')
      )
      expect(preparingLines).toHaveLength(0)
    }
  )

  it('a getAmazonLoginData() rejection still lands { phase: "error" } and logs the existing failed-to-resolve line -- preparing is not terminal', async () => {
    mockApi.getAmazonLoginData.mockRejectedValue(new Error('nile auth exited non-zero'))

    mount('nile')
    const hook = await settle('nile')

    expect(hook).toEqual({ phase: 'error', message: 'nile auth exited non-zero' })
    const matching = mockApi.logInfo.mock.calls.filter(
      ([line]) =>
        typeof line === 'string' &&
        line.includes('phase=error (failed to resolve login url)')
    )
    expect(matching).toHaveLength(1)
  })

  it('a teardown during preparing (getAmazonLoginData still in flight, then rejecting) logs phase=cancelled-midflight at=login-url and suppresses the state update', async () => {
    // Mirrors the existing "late rejection after unmount" precedent in the
    // capture-transport-failed describe block below -- same shape, but the in-flight promise
    // here is getAmazonLoginData() during `preparing`, not oauthCaptureLogin() during
    // `awaiting`.
    let rejectAmazonData: (reason: unknown) => void = () => {}
    mockApi.getAmazonLoginData.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectAmazonData = reject
        })
    )

    mount('nile')
    await flushPromises()
    const preparing = rerender('nile')
    expect(preparing).toEqual({ phase: 'preparing', runner: 'nile' })

    unmount()
    mockApi.logInfo.mockClear()

    const unhandled = jest.fn()
    process.on('unhandledRejection', unhandled)
    try {
      rejectAmazonData(new Error('nile auth exited non-zero'))
      await flushPromises()
    } finally {
      process.off('unhandledRejection', unhandled)
    }

    expect(unhandled).not.toHaveBeenCalled()
    // Plan 34.5-34's precedent: this site logs the cancellation diagnostic and returns --
    // it must still be the ONLY line, and oauthCaptureLogin must never be reached.
    expect(mockApi.logInfo).toHaveBeenCalledTimes(1)
    expect(mockApi.logInfo).toHaveBeenCalledWith(
      '[useTauriOAuthLogin] runner=nile phase=cancelled-midflight at=login-url'
    )
    expect(mockApi.oauthCaptureLogin).not.toHaveBeenCalled()
  })

  it('emits exactly one logInfo line containing phase=preparing (fetching login url) and runner=nile per attempt', async () => {
    mockApi.oauthCaptureLogin.mockImplementation(() => new Promise(() => {}))

    mount('nile')
    await settle('nile')

    const matching = mockApi.logInfo.mock.calls.filter(
      ([line]) =>
        typeof line === 'string' &&
        line.includes('phase=preparing (fetching login url)') &&
        line.includes('runner=nile')
    )
    expect(matching).toHaveLength(1)
  })
})

describe('useTauriOAuthLogin — unmount safety', () => {
  it('unmounting mid-capture does not throw, and a captured code still reaches the auth channel (Plan 34.5-34 Task 2 -- a perishable code is never abandoned)', async () => {
    let resolveCapture: (value: unknown) => void = () => {}
    mockApi.oauthCaptureLogin.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCapture = resolve
        })
    )
    mockApi.login.mockRejectedValue(new Error(UNPORTED_CHANNEL_MARKER))

    mount('legendary')
    await flushPromises()
    const beforeUnmount = rerender('legendary')
    expect(beforeUnmount).toEqual({ phase: 'awaiting' })

    unmount()

    // Capture resolves AFTER unmount -- must not throw. Prior to Plan 34.5-34 Task 2 this
    // discarded the captured code; now the code is perishable and single-use, so the auth
    // exchange still proceeds -- asserted on the fake channel's call record, never on the
    // hook's returned state (there is no subsequent render after a real unmount).
    resolveCapture({
      status: 'captured',
      runner: 'legendary',
      code: 'STALE-CODE',
      redirectUrl: 'http://localhost:8080/?code=STALE-CODE'
    })
    await flushPromises()

    expect(mockApi.login).toHaveBeenCalledWith('STALE-CODE')
  })
})

describe('useTauriOAuthLogin — cancellation suppresses state updates only (Plan 34.5-34 Task 2)', () => {
  it('a capture resolving { status: "captured" } AFTER teardown still hands its code to the runner auth channel', async () => {
    let resolveCapture: (value: unknown) => void = () => {}
    mockApi.oauthCaptureLogin.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCapture = resolve
        })
    )
    mockApi.authGOG.mockResolvedValue({ status: 'done', data: { username: 'grayson' } })

    mount('gog')
    await flushPromises()
    rerender('gog')

    unmount()

    resolveCapture({
      status: 'captured',
      runner: 'gog',
      code: 'X',
      redirectUrl: 'https://embed.gog.com/on_login_success?code=X'
    })
    await flushPromises()

    expect(mockApi.authGOG).toHaveBeenCalledWith('X')
  })

  it('an auth channel returning { status: "done" } AFTER teardown still invokes onLoginSuccess exactly once', async () => {
    mockApi.oauthCaptureLogin.mockResolvedValue({
      status: 'captured',
      runner: 'gog',
      code: 'GOG-CODE',
      redirectUrl: 'https://embed.gog.com/on_login_success?code=GOG-CODE'
    })
    let resolveAuth: (value: unknown) => void = () => {}
    mockApi.authGOG.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAuth = resolve
        })
    )
    const onLoginSuccess = jest.fn()

    mount('gog', onLoginSuccess)
    await settle('gog', onLoginSuccess)
    expect(mockApi.authGOG).toHaveBeenCalledTimes(1)

    unmount()

    resolveAuth({ status: 'done', data: { username: 'grayson' } })
    await flushPromises()

    expect(onLoginSuccess).toHaveBeenCalledTimes(1)
    expect(onLoginSuccess).toHaveBeenCalledWith({
      runner: 'gog',
      username: 'grayson',
      user_id: undefined
    })
  })

  it('after teardown, the hook never performs a setState -- no console warning, and no observable state change across a flush', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    try {
      mockApi.oauthCaptureLogin.mockResolvedValue({
        status: 'captured',
        runner: 'gog',
        code: 'GOG-CODE',
        redirectUrl: 'https://embed.gog.com/on_login_success?code=GOG-CODE'
      })
      let resolveAuth: (value: unknown) => void = () => {}
      mockApi.authGOG.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveAuth = resolve
          })
      )

      const preUnmount = mount('gog')
      await settle('gog')
      const stateBeforeUnmount = rerender('gog')
      // Quick task 260803-eee: the captured outcome now advances the hook to "finalizing" while
      // the auth channel is still pending, instead of staying on "awaiting" forever -- this is
      // the exact behaviour this task adds. The baseline snapshot below is updated to match; the
      // test's actual subject (no post-unmount mutation) is unchanged.
      expect(stateBeforeUnmount).toEqual({ phase: 'finalizing', runner: 'gog' })

      unmount()

      resolveAuth({ status: 'done', data: { username: 'grayson' } })
      await flushPromises()
      await flushPromises()

      // No subsequent render happens after a real unmount, so there is nothing new to read --
      // the harness's own state slot is the only thing that COULD have been mutated, and this
      // asserts the pre-unmount snapshot is what a fresh mount would still see (i.e. nothing
      // wrote into the torn-down slot).
      expect(stateBeforeUnmount).toEqual({ phase: 'finalizing', runner: 'gog' })
      expect(preUnmount).toEqual({ phase: 'idle' })
      expect(consoleError).not.toHaveBeenCalled()
    } finally {
      consoleError.mockRestore()
    }
  })

  it('onLoginSuccess is called exactly once, never twice, when the effect re-runs mid-flight', async () => {
    mockApi.oauthCaptureLogin.mockResolvedValue({
      status: 'captured',
      runner: 'gog',
      code: 'GOG-CODE',
      redirectUrl: 'https://embed.gog.com/on_login_success?code=GOG-CODE'
    })
    let resolveAuth: (value: unknown) => void = () => {}
    mockApi.authGOG.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAuth = resolve
        })
    )
    const onLoginSuccess = jest.fn()

    mount('gog', onLoginSuccess)
    await settle('gog', onLoginSuccess)
    expect(mockApi.authGOG).toHaveBeenCalledTimes(1)

    // The effect re-runs with a DIFFERENT runner while the gog auth call is still pending --
    // this tears down the gog closure (cancelled=true) without abandoning it, and starts a
    // fresh legendary closure.
    mockApi.oauthCaptureLogin.mockResolvedValue({ status: 'cancelled' })
    rerender('legendary', onLoginSuccess)
    await flushPromises()

    resolveAuth({ status: 'done', data: { username: 'grayson' } })
    await flushPromises()
    await flushPromises()

    expect(onLoginSuccess).toHaveBeenCalledTimes(1)
    expect(onLoginSuccess).toHaveBeenCalledWith({
      runner: 'gog',
      username: 'grayson',
      user_id: undefined
    })
  })

  it('a post-teardown { status: "timeout" } outcome does NOT call any auth channel', async () => {
    let resolveCapture: (value: unknown) => void = () => {}
    mockApi.oauthCaptureLogin.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCapture = resolve
        })
    )

    mount('gog')
    await flushPromises()
    rerender('gog')

    unmount()

    resolveCapture({ status: 'timeout' })
    await flushPromises()

    expect(mockApi.authGOG).not.toHaveBeenCalled()
    expect(mockApi.login).not.toHaveBeenCalled()
    expect(mockApi.authAmazon).not.toHaveBeenCalled()
    expect(mockApi.authZoom).not.toHaveBeenCalled()
  })
})
