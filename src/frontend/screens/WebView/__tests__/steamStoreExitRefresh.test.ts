import {
  isSteamPurchaseIntentUrl,
  runSteamStoreExitRefresh,
  resetSteamStoreExitRefreshState,
  STEAM_STORE_EXIT_REFRESH_THROTTLE_MS
} from '../steamStoreExitRefresh'

describe('isSteamPurchaseIntentUrl', () => {
  it.each([
    'https://store.steampowered.com/app/391540/Undertale/',
    'https://store.steampowered.com/cart/',
    'https://store.steampowered.com/cart',
    'https://checkout.steampowered.com/checkout/?purchasetype=self',
    'https://store.steampowered.com/checkout/?purchasetype=self'
  ])('true for %s', (url) => {
    expect(isSteamPurchaseIntentUrl(url)).toBe(true)
  })

  it.each([
    'https://store.steampowered.com/',
    'https://store.steampowered.com/search/?term=x',
    'https://store.steampowered.com/explore/',
    'https://store.steampowered.com/wishlist/',
    'http://store.steampowered.com/app/1',
    'https://evilstore.steampowered.com.attacker.net/app/1',
    'https://attacker.net/?u=store.steampowered.com/app/1',
    'https://www.gog.com/game/foo',
    'https://store.steampowered.com/application/1',
    'https://store.steampowered.com/cartoon',
    'https://store.steampowered.com/checkouts',
    'not a url'
  ])('false for %s', (url) => {
    expect(isSteamPurchaseIntentUrl(url)).toBe(false)
  })
})

describe('runSteamStoreExitRefresh', () => {
  let t = 1_000_000
  const now = () => t
  const log = jest.fn()
  const mk = (over: Record<string, unknown> = {}) => ({
    signInState: 'connected',
    refreshInFlight: false,
    refreshLibrary: jest.fn().mockResolvedValue(undefined),
    log,
    now,
    ...over
  })

  beforeEach(() => {
    resetSteamStoreExitRefreshState()
    t = 1_000_000
    log.mockClear()
  })

  it.each(['not-connected', 'expired'])('%s never dispatches', (s) => {
    const d = mk({ signInState: s })
    expect(runSteamStoreExitRefresh(d)).toBe('skipped-signed-out')
    expect(d.refreshLibrary).not.toHaveBeenCalled()
  })

  it.each(['connected', 'unknown'])('%s refreshes', (s) => {
    const d = mk({ signInState: s })
    expect(runSteamStoreExitRefresh(d)).toBe('refreshed')
    expect(d.refreshLibrary).toHaveBeenCalledTimes(1)
  })

  it('in-flight skips without consuming the throttle window', () => {
    const a = mk({ refreshInFlight: true })
    expect(runSteamStoreExitRefresh(a)).toBe('skipped-in-flight')
    expect(a.refreshLibrary).not.toHaveBeenCalled()
    const b = mk()
    expect(runSteamStoreExitRefresh(b)).toBe('refreshed')
  })

  it('throttles within the window and refreshes at the boundary', async () => {
    expect(runSteamStoreExitRefresh(mk())).toBe('refreshed')
    await Promise.resolve()
    await Promise.resolve()
    t += 1000
    expect(runSteamStoreExitRefresh(mk())).toBe('skipped-throttled')
    t += STEAM_STORE_EXIT_REFRESH_THROTTLE_MS
    expect(runSteamStoreExitRefresh(mk())).toBe('refreshed')
  })

  it('skips while the previous auto refresh is unresolved, then recovers after resolve or reject', async () => {
    let resolve!: () => void
    const pending = new Promise<void>((r) => (resolve = r))
    expect(
      runSteamStoreExitRefresh(mk({ refreshLibrary: () => pending }))
    ).toBe('refreshed')
    t += STEAM_STORE_EXIT_REFRESH_THROTTLE_MS * 2
    expect(runSteamStoreExitRefresh(mk())).toBe('skipped-in-flight')
    resolve()
    await pending
    await Promise.resolve()
    expect(
      runSteamStoreExitRefresh(
        mk({ refreshLibrary: () => Promise.reject(new Error('boom')) })
      )
    ).toBe('refreshed')
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    t += STEAM_STORE_EXIT_REFRESH_THROTTLE_MS
    expect(runSteamStoreExitRefresh(mk())).toBe('refreshed')
  })

  it('logs one line per call with the origin and outcome', () => {
    runSteamStoreExitRefresh(mk())
    expect(log).toHaveBeenCalledTimes(1)
    expect(log.mock.calls[0][0]).toContain('steam-store-exit')
    expect(log.mock.calls[0][0]).toContain('refreshed')
  })
})
