import {
  isSteamPurchaseIntentUrl,
  runSteamStoreExitRefresh,
  resetSteamStoreExitRefreshState,
  isPurchaseIntentUrlFor,
  runStoreExitRefresh,
  resetStoreExitRefreshState,
  type StoreExitStoreKey
} from '../storeExitRefresh'

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
  const log = jest.fn()
  const mk = (over: Record<string, unknown> = {}) => ({
    signInState: 'connected',
    refreshInFlight: false,
    refreshLibrary: jest.fn().mockResolvedValue(undefined),
    log,
    ...over
  })

  beforeEach(() => {
    resetSteamStoreExitRefreshState()
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

  it('a caller-reported in-flight refresh skips, and the next exit refreshes', () => {
    const a = mk({ refreshInFlight: true })
    expect(runSteamStoreExitRefresh(a)).toBe('skipped-in-flight')
    expect(a.refreshLibrary).not.toHaveBeenCalled()
    const b = mk()
    expect(runSteamStoreExitRefresh(b)).toBe('refreshed')
  })

  it('back-to-back exits each refresh once the previous one has settled (no time throttle)', async () => {
    expect(runSteamStoreExitRefresh(mk())).toBe('refreshed')
    await Promise.resolve()
    await Promise.resolve()
    const second = mk()
    expect(runSteamStoreExitRefresh(second)).toBe('refreshed')
    expect(second.refreshLibrary).toHaveBeenCalledTimes(1)
  })

  it('skips while the previous auto refresh is unresolved, then recovers after resolve or reject', async () => {
    let resolve!: () => void
    const pending = new Promise<void>((r) => (resolve = r))
    expect(
      runSteamStoreExitRefresh(mk({ refreshLibrary: () => pending }))
    ).toBe('refreshed')
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
    expect(runSteamStoreExitRefresh(mk())).toBe('refreshed')
  })

  it('logs one line per call with the origin and outcome', () => {
    runSteamStoreExitRefresh(mk())
    expect(log).toHaveBeenCalledTimes(1)
    expect(log.mock.calls[0][0]).toContain('steam-store-exit')
    expect(log.mock.calls[0][0]).toContain('refreshed')
  })
})

describe('isPurchaseIntentUrlFor (quick 261030-ts4)', () => {
  const cases: Record<string, { yes: string[]; no: string[] }> = {
    gog: {
      yes: [
        'https://www.gog.com/game/foo',
        'https://www.gog.com/en/game/foo',
        'https://www.gog.com/cart',
        'https://www.gog.com/en/checkout',
        'https://www.gog.com/checkout/abc',
        'https://www.gog.com/redeem/GOG-KEY-1'
      ],
      no: [
        'https://www.gog.com/',
        'https://www.gog.com/en/games',
        'https://www.gog.com/games?query=x',
        'https://www.gog.com/en/game',
        'https://af.gog.com?as=1838482841',
        'http://www.gog.com/game/foo',
        'https://www.gog.com.attacker.net/game/foo',
        'https://attacker.net/?u=www.gog.com/game/foo',
        'https://www.gog.com/gameplay/foo',
        'https://store.steampowered.com/app/1'
      ]
    },
    epic: {
      yes: [
        'https://store.epicgames.com/en-US/p/x?y=1#z',
        'https://store.epicgames.com/p/fortnite',
        'https://store.epicgames.com/en-US/bundles/some-bundle',
        'https://store.epicgames.com/purchase?offers=1',
        'https://www.epicgames.com/store/en-US/p/foo',
        'https://www.epicgames.com/store/product/foo'
      ],
      no: [
        'https://store.epicgames.com/en-US/',
        'https://store.epicgames.com/en-US/browse',
        'https://store.epicgames.com/en-US/free-games',
        'https://store.epicgames.com/en-US/pass',
        'https://www.epicgames.com/store/en-US/',
        'http://store.epicgames.com/p/x',
        'https://store.epicgames.com.attacker.net/p/x',
        'https://evil.com/?u=store.epicgames.com/p/x'
      ]
    },
    amazon: {
      yes: [
        'https://gaming.amazon.com',
        'https://gaming.amazon.com/home',
        'https://gaming.amazon.com/some-game/dp/amzn1.pg.item.x'
      ],
      no: [
        'http://gaming.amazon.com/',
        'https://www.amazon.com/',
        'https://gaming.amazon.com.attacker.net/',
        'https://attacker.net/?u=gaming.amazon.com'
      ]
    }
  }
  for (const [store, { yes, no }] of Object.entries(cases)) {
    it.each(yes)(`${store} true for %s`, (url) => {
      expect(isPurchaseIntentUrlFor(store, url)).toBe(true)
    })
    it.each(no)(`${store} false for %s`, (url) => {
      expect(isPurchaseIntentUrlFor(store, url)).toBe(false)
    })
  }

  it.each([
    'humble',
    'wiki',
    'store-page',
    'bogus',
    '__proto__',
    'constructor'
  ])('never arms for non-table key %s', (key) => {
    expect(isPurchaseIntentUrlFor(key, 'https://www.gog.com/game/foo')).toBe(
      false
    )
  })

  it('cross-store URLs never arm', () => {
    expect(
      isPurchaseIntentUrlFor('steam', 'https://www.gog.com/game/foo')
    ).toBe(false)
    expect(
      isPurchaseIntentUrlFor('gog', 'https://store.steampowered.com/app/1')
    ).toBe(false)
  })
})

describe('runStoreExitRefresh (quick 261030-ts4)', () => {
  const log = jest.fn()
  const mk = (over: Record<string, unknown> = {}) => ({
    signInState: 'connected',
    refreshInFlight: false,
    refreshLibrary: jest.fn().mockResolvedValue(undefined),
    log,
    ...over
  })
  const stores: StoreExitStoreKey[] = ['epic', 'gog', 'amazon']

  beforeEach(() => {
    resetStoreExitRefreshState()
    log.mockClear()
  })

  it.each(stores)('%s: signed-out never dispatches', (store) => {
    for (const s of ['not-connected', 'expired']) {
      const d = mk({ signInState: s })
      expect(runStoreExitRefresh(store, d)).toBe('skipped-signed-out')
      expect(d.refreshLibrary).not.toHaveBeenCalled()
    }
  })

  it.each(stores)('%s: connected/unknown refresh and log', (store) => {
    for (const s of ['connected', 'unknown']) {
      resetStoreExitRefreshState()
      log.mockClear()
      const d = mk({ signInState: s })
      expect(runStoreExitRefresh(store, d)).toBe('refreshed')
      expect(d.refreshLibrary).toHaveBeenCalledTimes(1)
      expect(log).toHaveBeenCalledTimes(1)
      expect(log.mock.calls[0][0]).toContain(`[${store}StoreExitRefresh]`)
      expect(log.mock.calls[0][0]).toContain(`${store}-store-exit`)
      expect(log.mock.calls[0][0]).toContain('refreshed')
    }
  })

  it.each(stores)('%s: caller in-flight skips', (store) => {
    const d = mk({ refreshInFlight: true })
    expect(runStoreExitRefresh(store, d)).toBe('skipped-in-flight')
    expect(d.refreshLibrary).not.toHaveBeenCalled()
  })

  it('in-flight is per store and recovers after resolve and reject', async () => {
    let resolve!: () => void
    const pending = new Promise<void>((r) => {
      resolve = r
    })
    expect(
      runStoreExitRefresh('gog', mk({ refreshLibrary: () => pending }))
    ).toBe('refreshed')
    expect(runStoreExitRefresh('gog', mk())).toBe('skipped-in-flight')
    expect(runStoreExitRefresh('epic', mk())).toBe('refreshed')
    resolve()
    await pending
    await Promise.resolve()
    await Promise.resolve()
    expect(
      runStoreExitRefresh(
        'gog',
        mk({ refreshLibrary: () => Promise.reject(new Error('boom')) })
      )
    ).toBe('refreshed')
    for (let i = 0; i < 4; i++) await Promise.resolve()
    expect(runStoreExitRefresh('gog', mk())).toBe('refreshed')
  })
})
