import {
  isSteamPurchaseIntentUrl,
  runSteamStoreExitRefresh,
  resetSteamStoreExitRefreshState,
  isPurchaseIntentUrlFor,
  armForUrl,
  runStoreExitRefresh,
  resetStoreExitRefreshState,
  runStoreExitRefreshAll,
  STORE_EXIT_ROWS,
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
        'https://gaming.amazon.com/some-game/dp/amzn1.pg.item.x',
        'https://luna.amazon.com/claims/home',
        'https://luna.amazon.com'
      ],
      no: [
        'http://gaming.amazon.com/',
        'https://www.amazon.com/',
        'https://gaming.amazon.com.attacker.net/',
        'https://attacker.net/?u=gaming.amazon.com',
        'http://luna.amazon.com/',
        'https://luna.amazon.com.attacker.net/',
        'https://attacker.net/?u=luna.amazon.com',
        'https://evilluna.amazon.com/'
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

describe('armForUrl (quick 261102-s32)', () => {
  const log = jest.fn()
  beforeEach(() => log.mockClear())

  const APP = 'https://store.steampowered.com/app/1669000/'

  it('steam /app/ does not arm on entry (quick 261114-aqa)', () => {
    expect(armForUrl('steam', APP, false, 'entry', log)).toBe(false)
    expect(log).not.toHaveBeenCalled()
  })

  it('steam /app/ arms via in-store nav', () => {
    expect(armForUrl('steam', APP, false, 'nav', log)).toBe(true)
    expect(log).toHaveBeenCalledWith(
      '[steamStoreExitRefresh] armed host=store.steampowered.com via=nav'
    )
  })

  it.each([
    'https://store.steampowered.com/cart',
    'https://store.steampowered.com/cart/',
    'https://store.steampowered.com/checkout/?x=1',
    'https://checkout.steampowered.com/checkout/'
  ])('steam %s still arms on entry', (url) => {
    expect(armForUrl('steam', url, false, 'entry', log)).toBe(true)
    expect(log).toHaveBeenCalledTimes(1)
  })

  it('an arm earned by nav survives an entry call on /app/', () => {
    expect(armForUrl('steam', APP, true, 'entry', log)).toBe(true)
    expect(log).not.toHaveBeenCalled()
  })

  it.each([
    ['amazon', 'https://gaming.amazon.com'],
    ['gog', 'https://www.gog.com/en/game/foo'],
    ['epic', 'https://store.epicgames.com/en-US/p/x']
  ])('%s arms identically via entry and nav', (store, url) => {
    expect(armForUrl(store, url, false, 'entry', log)).toBe(true)
    expect(armForUrl(store, url, false, 'nav', log)).toBe(true)
  })

  it('the nav classifier still counts /app/ as purchase intent', () => {
    expect(isSteamPurchaseIntentUrl(APP)).toBe(true)
    expect(isPurchaseIntentUrlFor('steam', APP)).toBe(true)
  })

  it('arms amazon on the bare start URL and logs once', () => {
    expect(
      armForUrl('amazon', 'https://gaming.amazon.com', false, 'entry', log)
    ).toBe(true)
    expect(log).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledWith(
      '[amazonStoreExitRefresh] armed host=gaming.amazon.com via=entry'
    )
  })

  it('logs hostname only, never path or query', () => {
    expect(
      armForUrl(
        'steam',
        'https://store.steampowered.com/app/391540/?snr=1_x',
        false,
        'nav',
        log
      )
    ).toBe(true)
    expect(log).toHaveBeenCalledWith(
      '[steamStoreExitRefresh] armed host=store.steampowered.com via=nav'
    )
    expect(log.mock.calls[0][0]).not.toContain('/app/')
    expect(log.mock.calls[0][0]).not.toContain('snr')
  })

  it('already armed returns true without logging', () => {
    expect(
      armForUrl(
        'steam',
        'https://store.steampowered.com/cart',
        true,
        'nav',
        log
      )
    ).toBe(true)
    expect(log).not.toHaveBeenCalled()
  })

  it.each([
    ['steam', 'https://store.steampowered.com/'],
    ['gog', 'https://www.gog.com/'],
    ['epic', 'https://store.epicgames.com/en-US/']
  ])('%s home does not arm', (store, url) => {
    expect(armForUrl(store, url, false, 'entry', log)).toBe(false)
    expect(log).not.toHaveBeenCalled()
  })

  it('non-store keys return armed unchanged', () => {
    expect(
      armForUrl('humble', 'https://gaming.amazon.com', false, 'nav', log)
    ).toBe(false)
    expect(
      armForUrl('wiki', 'https://gaming.amazon.com', true, 'nav', log)
    ).toBe(true)
    expect(log).not.toHaveBeenCalled()
  })

  it('cross-store URL does not arm', () => {
    expect(
      armForUrl('gog', 'https://gaming.amazon.com', false, 'nav', log)
    ).toBe(false)
    expect(log).not.toHaveBeenCalled()
  })
})

describe('runStoreExitRefreshAll (quick 261105-pnh)', () => {
  const log = jest.fn()
  type State = Record<string, string>
  const mk = (
    states: State = {},
    inFlightRunners: string[] = [],
    refreshLibrary: (runner: string, origin: string) => Promise<void> = () =>
      Promise.resolve()
  ) => ({
    signInStateFor: (key: string) => states[key] ?? 'connected',
    refreshInFlightFor: (runner: string) => inFlightRunners.includes(runner),
    refreshLibrary: jest.fn(refreshLibrary),
    log
  })
  const flush = async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve()
  }

  beforeEach(() => {
    resetStoreExitRefreshState()
    log.mockClear()
  })

  it('rows carry the expected targets', () => {
    expect(STORE_EXIT_ROWS.amazon.targets.map((t) => t.runner)).toEqual([
      'nile',
      'legendary',
      'gog'
    ])
    expect(STORE_EXIT_ROWS.amazon.targets.map((t) => t.signInKey)).toEqual([
      'nile',
      'legendary',
      'gog'
    ])
    expect(STORE_EXIT_ROWS.steam.targets.map((t) => t.runner)).toEqual([
      'steam'
    ])
    expect(STORE_EXIT_ROWS.epic.targets.map((t) => t.runner)).toEqual([
      'legendary'
    ])
    expect(STORE_EXIT_ROWS.gog.targets.map((t) => t.runner)).toEqual(['gog'])
  })

  it.each(['connected', 'unknown'])(
    'amazon with all %s refreshes all three',
    (s) => {
      const d = mk({ nile: s, legendary: s, gog: s })
      expect(runStoreExitRefreshAll('amazon', d)).toEqual([
        { runner: 'nile', outcome: 'refreshed' },
        { runner: 'legendary', outcome: 'refreshed' },
        { runner: 'gog', outcome: 'refreshed' }
      ])
      expect(d.refreshLibrary.mock.calls).toEqual([
        ['nile', 'amazon-store-exit'],
        ['legendary', 'amazon-store-exit'],
        ['gog', 'amazon-store-exit']
      ])
      expect(log).toHaveBeenCalledTimes(3)
      for (const [i, r] of ['nile', 'legendary', 'gog'].entries()) {
        const line = log.mock.calls[i][0]
        expect(line).toContain('[amazonStoreExitRefresh]')
        expect(line).toContain('origin=amazon-store-exit')
        expect(line).toContain(`runner=${r}`)
      }
    }
  )

  it('signed-out runners are skipped, others refresh', () => {
    const d = mk({ legendary: 'not-connected', gog: 'expired' })
    expect(runStoreExitRefreshAll('amazon', d)).toEqual([
      { runner: 'nile', outcome: 'refreshed' },
      { runner: 'legendary', outcome: 'skipped-signed-out' },
      { runner: 'gog', outcome: 'skipped-signed-out' }
    ])
    expect(d.refreshLibrary).toHaveBeenCalledTimes(1)
  })

  it('all signed out never refreshes', () => {
    const d = mk({
      nile: 'expired',
      legendary: 'not-connected',
      gog: 'not-connected'
    })
    const out = runStoreExitRefreshAll('amazon', d)
    expect(out.map((o) => o.outcome)).toEqual([
      'skipped-signed-out',
      'skipped-signed-out',
      'skipped-signed-out'
    ])
    expect(d.refreshLibrary).not.toHaveBeenCalled()
  })

  it('caller in-flight skips only that runner', () => {
    const d = mk({}, ['legendary'])
    expect(runStoreExitRefreshAll('amazon', d)).toEqual([
      { runner: 'nile', outcome: 'refreshed' },
      { runner: 'legendary', outcome: 'skipped-in-flight' },
      { runner: 'gog', outcome: 'refreshed' }
    ])
  })

  it('module in-flight is per runner, shared across stores, recovers', async () => {
    let resolve!: () => void
    const pending = new Promise<void>((r) => {
      resolve = r
    })
    expect(
      runStoreExitRefresh('epic', {
        signInState: 'connected',
        refreshInFlight: false,
        refreshLibrary: () => pending,
        log
      })
    ).toBe('refreshed')
    expect(
      runStoreExitRefreshAll('amazon', mk()).map((o) => o.outcome)
    ).toEqual(['refreshed', 'skipped-in-flight', 'refreshed'])
    resolve()
    await pending
    await flush()
    resetStoreExitRefreshState()
    expect(
      runStoreExitRefreshAll('amazon', mk()).map((o) => o.outcome)
    ).toEqual(['refreshed', 'refreshed', 'refreshed'])
  })

  it('legendary recovers after the epic refresh resolves without reset', async () => {
    let resolve!: () => void
    const pending = new Promise<void>((r) => {
      resolve = r
    })
    runStoreExitRefresh('epic', {
      signInState: 'connected',
      refreshInFlight: false,
      refreshLibrary: () => pending,
      log
    })
    resolve()
    await pending
    await flush()
    expect(
      runStoreExitRefreshAll('amazon', mk()).map((o) => o.outcome)
    ).toEqual(['refreshed', 'refreshed', 'refreshed'])
  })

  it('legendary recovers after a reject', async () => {
    runStoreExitRefresh('epic', {
      signInState: 'connected',
      refreshInFlight: false,
      refreshLibrary: () => Promise.reject(new Error('boom')),
      log
    })
    await flush()
    expect(
      runStoreExitRefreshAll('amazon', mk()).map((o) => o.outcome)
    ).toEqual(['refreshed', 'refreshed', 'refreshed'])
  })

  it('second exit while pending skips all; no throttle once settled', async () => {
    let resolve!: () => void
    const pending = new Promise<void>((r) => {
      resolve = r
    })
    runStoreExitRefreshAll(
      'amazon',
      mk({}, [], () => pending)
    )
    expect(
      runStoreExitRefreshAll('amazon', mk()).map((o) => o.outcome)
    ).toEqual(['skipped-in-flight', 'skipped-in-flight', 'skipped-in-flight'])
    resolve()
    await pending
    await flush()
    expect(
      runStoreExitRefreshAll('amazon', mk()).map((o) => o.outcome)
    ).toEqual(['refreshed', 'refreshed', 'refreshed'])
  })

  it.each([
    ['steam', 'steam', 'steam-store-exit'],
    ['epic', 'legendary', 'epic-store-exit'],
    ['gog', 'gog', 'gog-store-exit']
  ] as const)('%s yields one entry', (store, runner, origin) => {
    const d = mk()
    expect(runStoreExitRefreshAll(store, d)).toEqual([
      { runner, outcome: 'refreshed' }
    ])
    expect(d.refreshLibrary).toHaveBeenCalledWith(runner, origin)
  })
})
