/**
 * Redirect-shape + capture-driver + registration proof for the four OAuth runners (Phase
 * 34.4.1 Plan 09, D-04, REQ-34.4.1-08).
 *
 * `matchOAuthRedirect` is proven against all four real redirect shapes (legendary/localhost,
 * gog/embed.gog.com, nile/openid.oa2.authorization_code, zoom/li_token), their near-miss
 * negatives, a malformed url, and the full cross-runner negative matrix — this IS the
 * REQ-34.4.1-08 evidence: a per-runner navigation-observation claim proven by an executable test,
 * not by a runner-agnosticism grep over Rust source (Task 1).
 *
 * `captureOAuthLogin` is proven against a hand-written fake `LoginWindowSeam` (mirrors
 * `humble/__tests__/user.test.ts`'s "login window seam path" describe block) with jest fake
 * timers, asserting: opens exactly once, closes exactly once on every settled outcome, resolves
 * (never rejects) on every failure path, and never introduces a pending timer after settling
 * (Task 1).
 *
 * `registerOAuthLoginFlows()` is proven against `electronStub`'s registry directly (mirrors
 * `humbleLoginFlows.test.ts`'s "registration kind" describe block): `oauthCaptureLogin` is
 * registered as `ipcMain.handle` and NOT as `ipcMain.on` — a send-vs-handle mismatch fails 100%
 * SILENTLY at runtime — plus the two boundary-validation cases (unknown runner, non-https url)
 * (Task 2).
 *
 * `backend/logger` is factory-mocked (mirrors `electronUntouched.test.ts`) — this module has no
 * other Electron-reaching import, so no `jest.mock('electron', ...)` is needed here at all.
 */

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  logError: jest.fn(),
  LogPrefix: {
    Steam: 'Steam',
    Backend: 'Backend',
    Gog: 'Gog',
    Legendary: 'Legendary',
    Nile: 'Nile',
    Sideload: 'Sideload',
    Zoom: 'Zoom'
  }
}))

import { readFileSync } from 'fs'
import { join } from 'path'

import {
  matchOAuthRedirect,
  captureOAuthLogin,
  type OAuthRunner
} from '../oauthLoginCapture'
import { setLoginWindowSeam, type LoginWindowSeam } from '../../humble/loginWindowSeam'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import { registerOAuthLoginFlows } from '../oauthLoginFlowRegistration'
import { handlerRegistry, listenerRegistry } from '../electronStub'

const ALL_RUNNERS: OAuthRunner[] = ['legendary', 'gog', 'nile', 'zoom']

// ── matchOAuthRedirect (pure) ──────────────────────────────────────────────────────────────────

describe('matchOAuthRedirect — the four REQ-34.4.1-08 redirect shapes', () => {
  it("legendary: localhost + ?code= matches ({ code, redirectUrl })", () => {
    const url = 'http://localhost:8080/?code=ABC'
    expect(matchOAuthRedirect('legendary', url)).toEqual({
      code: 'ABC',
      redirectUrl: url
    })
  })

  it('legendary: the login page itself (right param name, wrong host) does NOT match', () => {
    expect(
      matchOAuthRedirect(
        'legendary',
        'https://www.epicgames.com/id/login?responseType=code'
      )
    ).toBeNull()
  })

  it('gog: embed.gog.com/on_login_success + ?code= matches', () => {
    const url = 'https://embed.gog.com/on_login_success?origin=client&code=XYZ'
    expect(matchOAuthRedirect('gog', url)).toEqual({
      code: 'XYZ',
      redirectUrl: url
    })
  })

  it('gog: the auth origin (not the success redirect) does NOT match', () => {
    expect(
      matchOAuthRedirect('gog', 'https://auth.gog.com/auth?code=XYZ')
    ).toBeNull()
  })

  it('nile: openid.oa2.authorization_code from www.amazon.com matches (host-anchored, closes T-34.4.1-44b)', () => {
    const url = 'https://www.amazon.com/?openid.oa2.authorization_code=NILE1'
    expect(matchOAuthRedirect('nile', url)).toEqual({
      code: 'NILE1',
      redirectUrl: url
    })
  })

  it('nile: a plain `code` param (not the openid.oa2 name) does NOT match', () => {
    expect(
      matchOAuthRedirect('nile', 'https://www.amazon.com/ap/signin?code=NILE1')
    ).toBeNull()
  })

  it('nile: an attacker-controlled origin carrying the identical param does NOT match', () => {
    expect(
      matchOAuthRedirect(
        'nile',
        'https://evil.example/?openid.oa2.authorization_code=NILE1'
      )
    ).toBeNull()
  })

  it('nile: a suffix-confusion origin (amazon.com.evil.example) does NOT match', () => {
    expect(
      matchOAuthRedirect(
        'nile',
        'https://amazon.com.evil.example/?openid.oa2.authorization_code=NILE1'
      )
    ).toBeNull()
  })

  it('nile: the near-miss `amazon.com` (no www.) does NOT match — pinned to the exact host; this is the case live-gate item 3 may falsify', () => {
    expect(
      matchOAuthRedirect(
        'nile',
        'https://amazon.com/?openid.oa2.authorization_code=NILE1'
      )
    ).toBeNull()
  })

  it('nile: www.amazon.com with no code param does NOT match', () => {
    expect(matchOAuthRedirect('nile', 'https://www.amazon.com/')).toBeNull()
  })

  it('nile: a rejected off-origin candidate carrying the param logs the origin exactly once, and never the code value', () => {
    const loggerModule = jest.requireMock('backend/logger') as {
      logWarning: jest.Mock
    }
    loggerModule.logWarning.mockClear()

    matchOAuthRedirect(
      'nile',
      'https://evil.example/?openid.oa2.authorization_code=SECRET_CODE_VALUE'
    )

    expect(loggerModule.logWarning).toHaveBeenCalledTimes(1)
    const [emitted] = loggerModule.logWarning.mock.calls[0]
    expect(emitted).toContain('https://evil.example')
    expect(emitted).not.toContain('SECRET_CODE_VALUE')
  })

  it('guard: legendary and gog behaviours are unchanged by the nile host-anchor edit', () => {
    const legendaryUrl = 'http://localhost:8080/?code=ABC'
    expect(matchOAuthRedirect('legendary', legendaryUrl)).toEqual({
      code: 'ABC',
      redirectUrl: legendaryUrl
    })

    const gogUrl = 'https://embed.gog.com/on_login_success?origin=client&code=XYZ'
    expect(matchOAuthRedirect('gog', gogUrl)).toEqual({
      code: 'XYZ',
      redirectUrl: gogUrl
    })
  })

  it('zoom: li_token matches and returns the FULL redirect url (authZoom takes the url, not the token)', () => {
    const url = 'https://www.zoom-platform.com/?li_token=ZTOK'
    expect(matchOAuthRedirect('zoom', url)).toEqual({
      code: 'ZTOK',
      redirectUrl: url
    })
  })

  it('zoom: the REQUEST url (return_li_token=true) does NOT match — only the RESPONSE carries li_token', () => {
    expect(
      matchOAuthRedirect(
        'zoom',
        'https://www.zoom-platform.com/login?li=heroic&return_li_token=true'
      )
    ).toBeNull()
  })

  it.each(ALL_RUNNERS)(
    'a malformed url never throws for runner=%s — resolves null',
    (runner) => {
      expect(() => matchOAuthRedirect(runner, 'not a url')).not.toThrow()
      expect(matchOAuthRedirect(runner, 'not a url')).toBeNull()
    }
  )

  describe('cross-runner negative matrix — each matching url is null for the other three runners', () => {
    const MATCHING_URLS: Record<OAuthRunner, string> = {
      legendary: 'http://localhost:8080/?code=ABC',
      gog: 'https://embed.gog.com/on_login_success?origin=client&code=XYZ',
      nile: 'https://www.amazon.com/?openid.oa2.authorization_code=NILE1',
      zoom: 'https://www.zoom-platform.com/?li_token=ZTOK'
    }

    for (const ownerRunner of ALL_RUNNERS) {
      for (const otherRunner of ALL_RUNNERS) {
        if (ownerRunner === otherRunner) continue
        it(`${ownerRunner}'s matching url does not match runner=${otherRunner}`, () => {
          expect(
            matchOAuthRedirect(otherRunner, MATCHING_URLS[ownerRunner])
          ).toBeNull()
        })
      }
    }
  })
})

// ── captureOAuthLogin (seam-driven) ────────────────────────────────────────────────────────────

describe('captureOAuthLogin — seam-driven, deadline-bounded, close-guaranteed', () => {
  const mockSeamOpen = jest.fn()
  const mockSeamTakeEvents = jest.fn()
  const mockSeamClose = jest.fn()

  const fakeSeam: LoginWindowSeam = {
    open: (...args: Parameters<LoginWindowSeam['open']>) => mockSeamOpen(...args),
    cookies: jest.fn(),
    cookiesForDomain: jest.fn(),
    takeEvents: (...args: Parameters<LoginWindowSeam['takeEvents']>) =>
      mockSeamTakeEvents(...args),
    close: (...args: Parameters<LoginWindowSeam['close']>) => mockSeamClose(...args),
    clearCookies: jest.fn(),
    revealPost: jest.fn(),
    clearStorage: jest.fn()
  }

  beforeEach(() => {
    mockSeamOpen.mockResolvedValue('oauth-capture-0')
    mockSeamTakeEvents.mockResolvedValue([])
    mockSeamClose.mockResolvedValue(true)
    setLoginWindowSeam(fakeSeam)
  })

  afterEach(() => {
    setLoginWindowSeam(null)
  })

  it('resolves { status: "unsupported" } WITHOUT opening anything when no seam is installed', async () => {
    setLoginWindowSeam(null)

    const result = await captureOAuthLogin('legendary', 'https://www.epicgames.com/id/login')

    expect(result).toEqual({ status: 'unsupported' })
    expect(mockSeamOpen).not.toHaveBeenCalled()
  })

  it('opens exactly once with the runner user agent and visible: true', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] })
    try {
      const promise = captureOAuthLogin('legendary', 'https://www.epicgames.com/id/login')
      await flushAsync()

      expect(mockSeamOpen).toHaveBeenCalledTimes(1)
      expect(mockSeamOpen).toHaveBeenCalledWith('https://www.epicgames.com/id/login', {
        visible: true,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) EpicGamesLauncher'
      })

      mockSeamTakeEvents.mockResolvedValue([
        { event: 'finished', url: 'http://localhost:8080/?code=ABC' }
      ])
      jest.advanceTimersByTime(500)
      await flushAsync()

      await expect(promise).resolves.toEqual({
        status: 'captured',
        runner: 'legendary',
        code: 'ABC',
        redirectUrl: 'http://localhost:8080/?code=ABC'
      })
    } finally {
      jest.useRealTimers()
    }
  })

  it('resolves { status: "captured" } on the first matching event and stops polling immediately', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] })
    try {
      mockSeamTakeEvents.mockResolvedValue([
        { event: 'started', url: 'https://embed.gog.com/on_login_success' },
        { event: 'finished', url: 'https://embed.gog.com/on_login_success?code=GOG1' }
      ])

      const promise = captureOAuthLogin('gog', 'https://auth.gog.com/auth')
      await flushAsync()

      jest.advanceTimersByTime(500)
      await flushAsync()

      const result = await promise
      expect(result).toEqual({
        status: 'captured',
        runner: 'gog',
        code: 'GOG1',
        redirectUrl: 'https://embed.gog.com/on_login_success?code=GOG1'
      })
      expect(mockSeamClose).toHaveBeenCalledTimes(1)
      expect(mockSeamClose).toHaveBeenCalledWith('oauth-capture-0')

      // No further polling after settling.
      mockSeamTakeEvents.mockClear()
      jest.advanceTimersByTime(5000)
      await flushAsync()
      expect(mockSeamTakeEvents).not.toHaveBeenCalled()
    } finally {
      jest.useRealTimers()
    }
  })

  it('resolves { status: "timeout" } when the deadline elapses with only non-matching events, and leaves no pending timer', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] })
    try {
      mockSeamTakeEvents.mockResolvedValue([
        { event: 'started', url: 'https://www.zoom-platform.com/login?li=heroic&return_li_token=true' }
      ])

      const promise = captureOAuthLogin('zoom', 'https://www.zoom-platform.com/login', {
        deadlineMs: 2000,
        pollMs: 500
      })
      await flushAsync()

      jest.advanceTimersByTime(2000)
      await flushAsync()

      await expect(promise).resolves.toEqual({ status: 'timeout' })
      expect(mockSeamClose).toHaveBeenCalledTimes(1)

      // No lingering interval/timeout — advancing further produces no more seam calls.
      mockSeamTakeEvents.mockClear()
      mockSeamClose.mockClear()
      jest.advanceTimersByTime(10_000)
      await flushAsync()
      expect(mockSeamTakeEvents).not.toHaveBeenCalled()
      expect(mockSeamClose).not.toHaveBeenCalled()
    } finally {
      jest.useRealTimers()
    }
  })

  it('resolves { status: "error" } (never rejects) when open() throws', async () => {
    mockSeamOpen.mockRejectedValue(new Error('open failed'))

    const promise = captureOAuthLogin('nile', 'https://amazon.com/ap/signin')

    await expect(promise).resolves.toEqual({
      status: 'error',
      message: 'open failed'
    })
    // No window was ever opened successfully, so there is nothing to close.
    expect(mockSeamClose).not.toHaveBeenCalled()
  })

  it('resolves { status: "error" } (never rejects) when takeEvents() throws, and still closes the window', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] })
    try {
      mockSeamTakeEvents.mockRejectedValue(new Error('takeEvents failed'))

      const promise = captureOAuthLogin('zoom', 'https://www.zoom-platform.com/login')
      await flushAsync()

      jest.advanceTimersByTime(500)
      await flushAsync()

      await expect(promise).resolves.toEqual({
        status: 'error',
        message: 'takeEvents failed'
      })
      expect(mockSeamClose).toHaveBeenCalledTimes(1)
      expect(mockSeamClose).toHaveBeenCalledWith('oauth-capture-0')
    } finally {
      jest.useRealTimers()
    }
  })
})

// ── nav host logging (plan 34.5-24 Task 1, F-34.5-G6-01 discriminator, T-34.5-G6-11) ───────────

describe('captureOAuthLogin — nav host logging (plan 34.5-24 Task 1)', () => {
  const mockSeamOpen = jest.fn()
  const mockSeamTakeEvents = jest.fn()
  const mockSeamClose = jest.fn()

  const fakeSeam: LoginWindowSeam = {
    open: (...args: Parameters<LoginWindowSeam['open']>) => mockSeamOpen(...args),
    cookies: jest.fn(),
    cookiesForDomain: jest.fn(),
    takeEvents: (...args: Parameters<LoginWindowSeam['takeEvents']>) =>
      mockSeamTakeEvents(...args),
    close: (...args: Parameters<LoginWindowSeam['close']>) => mockSeamClose(...args),
    clearCookies: jest.fn(),
    revealPost: jest.fn(),
    clearStorage: jest.fn()
  }

  beforeEach(() => {
    mockSeamOpen.mockResolvedValue('oauth-capture-nav-0')
    mockSeamTakeEvents.mockResolvedValue([])
    mockSeamClose.mockResolvedValue(true)
    setLoginWindowSeam(fakeSeam)
    const loggerModule = jest.requireMock('backend/logger') as { logInfo: jest.Mock }
    loggerModule.logInfo.mockClear()
  })

  afterEach(() => {
    setLoginWindowSeam(null)
  })

  function navHostLines(): string[] {
    const loggerModule = jest.requireMock('backend/logger') as { logInfo: jest.Mock }
    return loggerModule.logInfo.mock.calls
      .map(([msg]: [unknown]) => String(msg))
      .filter((msg: string) => msg.includes('nav host='))
  }

  it('logs "nav host=" exactly once for two consecutive events on the SAME host', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] })
    try {
      mockSeamTakeEvents.mockResolvedValue([
        { event: 'started', url: 'https://www.epicgames.com/id/login' },
        { event: 'finished', url: 'https://www.epicgames.com/id/other?x=1' }
      ])

      const promise = captureOAuthLogin('legendary', 'https://www.epicgames.com/id/login', {
        deadlineMs: 1000,
        pollMs: 500
      })
      await flushAsync()

      const lines = navHostLines()
      expect(lines.length).toBe(1)
      expect(lines[0]).toContain('nav host=www.epicgames.com')
      // Hostname only -- never path, query string, or fragment.
      expect(lines[0]).not.toMatch(/\/id\/|[?]x=1/)

      jest.advanceTimersByTime(1000)
      await flushAsync()
      await promise
    } finally {
      jest.useRealTimers()
    }
  })

  it('logs "nav host=<unparseable>" for a malformed url and does not throw', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] })
    try {
      mockSeamTakeEvents.mockResolvedValue([{ event: 'started', url: 'not a url' }])

      const promise = captureOAuthLogin('gog', 'https://auth.gog.com/auth', {
        deadlineMs: 1000,
        pollMs: 500
      })
      await flushAsync()

      const lines = navHostLines()
      expect(lines.length).toBe(1)
      expect(lines[0]).toContain('nav host=<unparseable>')

      jest.advanceTimersByTime(1000)
      await flushAsync()
      await promise
    } finally {
      jest.useRealTimers()
    }
  })

  it('never logs a captured code value (SECRETVALUE) in any logged line, even on a matching event', async () => {
    const loggerModule = jest.requireMock('backend/logger') as {
      logInfo: jest.Mock
      logWarning: jest.Mock
    }

    mockSeamTakeEvents.mockResolvedValue([
      { event: 'finished', url: 'http://localhost:8080/?code=SECRETVALUE' }
    ])

    const result = await captureOAuthLogin('legendary', 'https://www.epicgames.com/id/login')

    const allLoggedStrings = [
      ...loggerModule.logInfo.mock.calls.map((call: unknown[]) => JSON.stringify(call)),
      ...loggerModule.logWarning.mock.calls.map((call: unknown[]) => JSON.stringify(call))
    ]
    for (const line of allLoggedStrings) {
      expect(line).not.toContain('SECRETVALUE')
    }
    expect(result).toEqual({
      status: 'captured',
      runner: 'legendary',
      code: 'SECRETVALUE',
      redirectUrl: 'http://localhost:8080/?code=SECRETVALUE'
    })
  })
})

// ── resolveUserAgent — diagnostic UA override (plan 34.5-24 Task 2) ────────────────────────────

describe('resolveUserAgent — diagnostic UA override, exercised via captureOAuthLogin (plan 34.5-24 Task 2)', () => {
  const mockSeamOpen = jest.fn()
  const mockSeamTakeEvents = jest.fn()
  const mockSeamClose = jest.fn()
  const DEFAULT_LEGENDARY_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) EpicGamesLauncher'
  const DEFAULT_GOG_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/200.0'
  const ORIGINAL_ENV = { ...process.env }

  const fakeSeam: LoginWindowSeam = {
    open: (...args: Parameters<LoginWindowSeam['open']>) => mockSeamOpen(...args),
    cookies: jest.fn(),
    cookiesForDomain: jest.fn(),
    takeEvents: (...args: Parameters<LoginWindowSeam['takeEvents']>) =>
      mockSeamTakeEvents(...args),
    close: (...args: Parameters<LoginWindowSeam['close']>) => mockSeamClose(...args),
    clearCookies: jest.fn(),
    revealPost: jest.fn(),
    clearStorage: jest.fn()
  }

  beforeEach(() => {
    mockSeamOpen.mockResolvedValue('oauth-capture-ua-0')
    mockSeamTakeEvents.mockResolvedValue([])
    mockSeamClose.mockResolvedValue(true)
    setLoginWindowSeam(fakeSeam)
  })

  afterEach(() => {
    setLoginWindowSeam(null)
    process.env = { ...ORIGINAL_ENV }
  })

  it('with GAMELIB_OAUTH_UA_LEGENDARY UNSET, the seam receives exactly the default literal agent', async () => {
    delete process.env.GAMELIB_OAUTH_UA_LEGENDARY

    await captureOAuthLogin('legendary', 'https://www.epicgames.com/id/login', {
      deadlineMs: 5
    })

    expect(mockSeamOpen).toHaveBeenCalledWith('https://www.epicgames.com/id/login', {
      visible: true,
      userAgent: DEFAULT_LEGENDARY_UA
    })
  })

  it("setting GAMELIB_OAUTH_UA_LEGENDARY changes only legendary's argument, and gog stays at its default in the same suite run", async () => {
    process.env.GAMELIB_OAUTH_UA_LEGENDARY = 'Mozilla/5.0 TestOverrideAgent'

    await captureOAuthLogin('legendary', 'https://www.epicgames.com/id/login', { deadlineMs: 5 })
    await captureOAuthLogin('gog', 'https://auth.gog.com/auth', { deadlineMs: 5 })

    expect(mockSeamOpen).toHaveBeenNthCalledWith(1, 'https://www.epicgames.com/id/login', {
      visible: true,
      userAgent: 'Mozilla/5.0 TestOverrideAgent'
    })
    expect(mockSeamOpen).toHaveBeenNthCalledWith(2, 'https://auth.gog.com/auth', {
      visible: true,
      userAgent: DEFAULT_GOG_UA
    })
  })

  it('a whitespace-only override falls back to the default (an empty UA is the forbidden failure mode)', async () => {
    process.env.GAMELIB_OAUTH_UA_LEGENDARY = '   '

    await captureOAuthLogin('legendary', 'https://www.epicgames.com/id/login', { deadlineMs: 5 })

    expect(mockSeamOpen).toHaveBeenCalledWith('https://www.epicgames.com/id/login', {
      visible: true,
      userAgent: DEFAULT_LEGENDARY_UA
    })
  })

  it('logs exactly one user-agent-override line naming the runner and the override LENGTH (never the value) when an override is in effect', async () => {
    const loggerModule = jest.requireMock('backend/logger') as { logInfo: jest.Mock }
    loggerModule.logInfo.mockClear()
    const override = 'Mozilla/5.0 TestOverrideAgent'
    process.env.GAMELIB_OAUTH_UA_LEGENDARY = override

    await captureOAuthLogin('legendary', 'https://www.epicgames.com/id/login', { deadlineMs: 5 })

    const overrideLines = loggerModule.logInfo.mock.calls
      .map(([msg]: [unknown]) => String(msg))
      .filter((msg: string) => msg.includes('user-agent-override'))
    expect(overrideLines.length).toBe(1)
    expect(overrideLines[0]).toContain('runner=legendary')
    expect(overrideLines[0]).toContain(`len=${override.length}`)
    expect(overrideLines[0]).not.toContain(override)
  })
})

// ── Registration kind + boundary validation (Task 2) ───────────────────────────────────────────
// Registered ONCE for this whole file (not per-test) -- `listenerRegistry`/`handlerRegistry` are
// module-scope maps; calling registerOAuthLoginFlows() more than once would stack a duplicate
// listener onto the same channel array (clipboardFlowRegistration's own test docstring names
// this hazard).
registerOAuthLoginFlows()

describe('registerOAuthLoginFlows() — registration kind (REQ-34.4.1-08)', () => {
  it('oauthCaptureLogin is registered as ipcMain.handle, and NOT as ipcMain.on', () => {
    expect(handlerRegistry.has('oauthCaptureLogin')).toBe(true)
    expect((listenerRegistry.get('oauthCaptureLogin') ?? []).length).toBe(0)
  })

  it('resolves { status: "error" } for an unknown runner, without ever reaching the seam', async () => {
    setLoginWindowSeam(null)
    const handler = handlerRegistry.get('oauthCaptureLogin')
    expect(handler).toBeDefined()

    const result = await handler?.(undefined, { runner: 'sideload', url: 'https://example.com' })

    expect(result).toEqual({
      status: 'error',
      message: expect.stringContaining('unknown runner')
    })
  })

  it('resolves { status: "error" } for a non-https url', async () => {
    setLoginWindowSeam(null)
    const handler = handlerRegistry.get('oauthCaptureLogin')

    const result = await handler?.(undefined, {
      runner: 'legendary',
      url: 'http://not-secure.example.com'
    })

    expect(result).toEqual({
      status: 'error',
      message: expect.stringContaining('https')
    })
  })

  it('forwards a valid { runner, url } pair to captureOAuthLogin (unsupported when no seam installed)', async () => {
    setLoginWindowSeam(null)
    const handler = handlerRegistry.get('oauthCaptureLogin')

    const result = await handler?.(undefined, {
      runner: 'gog',
      url: 'https://auth.gog.com/auth'
    })

    expect(result).toEqual({ status: 'unsupported' })
  })
})

// ── on_navigation must never appear (Pattern 6) ────────────────────────────────────────────────

describe('structural gate: oauthLoginCapture.ts never introduces an on_navigation source', () => {
  it('the source file contains no reference to on_navigation', () => {
    const source = readFileSync(join(__dirname, '..', 'oauthLoginCapture.ts'), 'utf-8')
    const stripped = stripSourceComments(source)
    expect(stripped).not.toMatch(/on_navigation/)
  })
})

// ── No value logging (T-34.4.1-45) ─────────────────────────────────────────────────────────────

describe('structural gate: no logInfo/logWarning call interpolates code/token/redirectUrl/url', () => {
  it('every logInfo/logWarning call site in the source only references runner/label/status', () => {
    const source = readFileSync(join(__dirname, '..', 'oauthLoginCapture.ts'), 'utf-8')
    const stripped = stripSourceComments(source)
    const callSites = stripped.match(/log(?:Info|Warning)\([^)]*\)/g) ?? []
    expect(callSites.length).toBeGreaterThan(0)
    for (const call of callSites) {
      expect(call).not.toMatch(/\bcode\b|\btoken\b|\bredirectUrl\b|\burl\b/)
    }
  })
})

/** Waits a couple of microtask/macrotask turns for async work to progress (mirrors
 * `humble/__tests__/user.test.ts`'s `flushAsync`). */
async function flushAsync(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await new Promise((resolve) => setImmediate(resolve))
}
