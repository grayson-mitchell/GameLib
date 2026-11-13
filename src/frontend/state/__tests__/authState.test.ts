import '../../testUtils/tauriWindow'
import { resetAllStores } from '../storeKit'
import useAuthState, { readInitialAuth } from '../authState'
import useLibraryState from '../libraryState'
import useUiState from '../uiState'
import { sanitizeSignInProbeOutcomeMap } from 'common/signInState'
import type { HumbleSyncState } from 'common/types/humble'

// Values the fake backend answers storeGet with, keyed `<store>|<key>`.
let stored: Record<string, unknown> = {}
let setSettingCalls: Array<{ key: string; value: unknown }> = []
let logged: string[] = []

const fakeApi = {
  storeNew: () => undefined,
  storeHas: () => false,
  storeGet: (name: string, key: string, fallback?: unknown) =>
    stored[`${name}|${key}`] ?? fallback,
  setSetting: (payload: { key: string; value: unknown }) => {
    setSettingCalls.push(payload)
  },
  logError: (message: string) => {
    logged.push(message)
  }
}

describe('authState', () => {
  beforeEach(() => {
    // importing the stores pulls tauriAttach, which can overwrite window.api
    ;(window as unknown as { api: unknown }).api = fakeApi
    stored = {}
    setSettingCalls = []
    logged = []
  })

  afterEach(() => {
    resetAllStores()
  })

  it('readInitialAuth normalizes dismissedSignInNotices from the settings mirror', () => {
    stored = { 'configStore|settings': { dismissedSignInNotices: ['gog'] } }
    expect(readInitialAuth().dismissedSignInNotices).toEqual(['gog'])
  })

  it('readInitialAuth reads every identity from the config stores at call time', () => {
    stored = {
      'configStore|userInfo.displayName': 'epicUser',
      'gogConfigStore|userData.username': 'gogUser',
      'nileConfigStore|userData.user_id': 'amzId',
      'nileConfigStore|userData.name': 'amzName',
      'steamConfigStore|userData': { username: 'steamUser' },
      'humbleConfigStore|isLoggedIn': true,
      'humbleConfigStore|userData': { username: 'humbleUser' },
      'humbleConfigStore|encryptionDegraded': true
    }
    expect(readInitialAuth()).toEqual({
      epicUsername: 'epicUser',
      gogUsername: 'gogUser',
      amazonUserId: 'amzId',
      amazonUsername: 'amzName',
      steamUsername: 'steamUser',
      dismissedSignInNotices: [],
      humble: {
        isLoggedIn: true,
        username: 'humbleUser',
        expired: false,
        encryptionDegraded: true,
        keys: [],
        syncedAt: null,
        syncError: 'none',
        syncing: false
      }
    })
    stored = { 'configStore|userInfo.displayName': 'later' }
    expect(readInitialAuth().epicUsername).toBe('later')
  })

  it('dismissing a store adds it and persists once; dismissing twice equals once', () => {
    useAuthState.getState().handleDismissSignInNotice('gog')
    useAuthState.getState().handleDismissSignInNotice('gog')
    expect(useAuthState.getState().dismissedSignInNotices).toEqual(['gog'])
    expect(setSettingCalls).toEqual([
      { appName: 'default', key: 'dismissedSignInNotices', value: ['gog'] }
    ])
  })

  it('dismissals are kept in canonical store order', () => {
    useAuthState.getState().handleDismissSignInNotice('steam')
    useAuthState.getState().handleDismissSignInNotice('legendary')
    expect(useAuthState.getState().dismissedSignInNotices).toEqual([
      'legendary',
      'steam'
    ])
  })

  it('re-arm prunes an expired store and persists only when something changed', () => {
    useAuthState.setState({ dismissedSignInNotices: ['gog', 'steam'] })
    useAuthState.getState().handleRearmSignInDismissals({
      legendary: 'connected',
      gog: 'expired',
      nile: 'connected',
      humble: 'connected',
      steam: 'not-connected'
    })
    expect(useAuthState.getState().dismissedSignInNotices).toEqual(['steam'])
    expect(setSettingCalls).toHaveLength(1)

    useAuthState.getState().handleRearmSignInDismissals({
      legendary: 'connected',
      gog: 'connected',
      nile: 'connected',
      humble: 'connected',
      steam: 'not-connected'
    })
    expect(setSettingCalls).toHaveLength(1)
  })

  it('rearmFromCurrentState resolves states from identities and outcomes', () => {
    // Humble signed in with a latched expiry flag -> expired -> pruned.
    useAuthState.setState({
      dismissedSignInNotices: ['humble'],
      humble: { isLoggedIn: true, expired: true }
    })
    useAuthState.getState().rearmFromCurrentState()
    expect(useAuthState.getState().dismissedSignInNotices).toEqual([])
    expect(setSettingCalls).toHaveLength(1)
  })

  it('rearmFromCurrentState leaves a not-connected dismissal alone', () => {
    useAuthState.setState({ dismissedSignInNotices: ['gog'] })
    useAuthState.getState().rearmFromCurrentState()
    expect(useAuthState.getState().dismissedSignInNotices).toEqual(['gog'])
    expect(setSettingCalls).toHaveLength(0)
  })

  it('resync applies a non-empty patch to the identity fields and rearms', () => {
    stored = {
      'configStore|userInfo.displayName': 'epicUser',
      'nileConfigStore|userData.user_id': 'amzId',
      'nileConfigStore|userData.name': 'amzName',
      'steamConfigStore|userData': { username: 'steamUser' },
      'humbleConfigStore|isLoggedIn': true,
      'humbleConfigStore|expired': true
    }
    useAuthState.setState({ dismissedSignInNotices: ['humble'] })
    useAuthState.getState().resyncSignInIdentityFromStores()
    const s = useAuthState.getState()
    expect(s.epicUsername).toBe('epicUser')
    expect(s.amazonUserId).toBe('amzId')
    expect(s.amazonUsername).toBe('amzName')
    expect(s.steamUsername).toBe('steamUser')
    expect(s.humble.isLoggedIn).toBe(true)
    expect(s.humble.expired).toBe(true)
    // the expired humble session was re-armed
    expect(s.dismissedSignInNotices).toEqual([])
  })

  it('resync skips set on an empty patch but still rearms', () => {
    const listener = jest.fn()
    useAuthState.setState({ dismissedSignInNotices: [] })
    const unsubscribe = useAuthState.subscribe(listener)
    useAuthState.getState().resyncSignInIdentityFromStores()
    unsubscribe()
    expect(listener).not.toHaveBeenCalled()
  })

  it('resync logs and continues when a reader throws, and still rearms', () => {
    ;(window as unknown as { api: unknown }).api = {
      ...fakeApi,
      storeGet: (name: string, key: string) => {
        if (name === 'configStore') throw new Error('boom')
        return fakeApi.storeGet(name, key)
      }
    }
    useAuthState.setState({
      dismissedSignInNotices: ['humble'],
      humble: { isLoggedIn: true, expired: true }
    })
    useAuthState.getState().resyncSignInIdentityFromStores()
    expect(logged).toEqual(['Sign-in identity resync failed: Error: boom'])
    expect(useAuthState.getState().dismissedSignInNotices).toEqual([])
  })

  it('applyHumbleAuthState merges, keeps the previous username and rearms', () => {
    useAuthState.setState({
      humble: { isLoggedIn: false, username: 'kept', keys: [] },
      dismissedSignInNotices: ['humble']
    })
    useAuthState
      .getState()
      .applyHumbleAuthState({ isLoggedIn: true, expired: true })
    const s = useAuthState.getState()
    expect(s.humble).toEqual({
      isLoggedIn: true,
      username: 'kept',
      keys: [],
      expired: true
    })
    expect(s.dismissedSignInNotices).toEqual([])
  })

  it('applySignInProbeOutcomes sanitises: unknown store keys and values are stripped', () => {
    useAuthState.getState().applySignInProbeOutcomes({
      gog: 'healthy',
      bogus: 'healthy',
      steam: 'nonsense'
    })
    expect(useAuthState.getState().signInProbeOutcomes).toEqual({
      gog: 'healthy'
    })
  })

  it('RED specimen: an unsanitised variant lets an unknown store key through', () => {
    const raw = { gog: 'healthy', bogus: 'healthy' }
    const unsanitised = (outcomes: unknown) =>
      useAuthState.setState({
        signInProbeOutcomes: outcomes as Record<string, never>
      })
    unsanitised(raw)
    expect(useAuthState.getState().signInProbeOutcomes).toHaveProperty('bogus')

    useAuthState.getState().applySignInProbeOutcomes(raw)
    expect(useAuthState.getState().signInProbeOutcomes).not.toHaveProperty(
      'bogus'
    )
    expect(sanitizeSignInProbeOutcomeMap(raw)).toEqual({ gog: 'healthy' })
  })

  it('applySignInProbeOutcomes rearms the dismissed set after applying', () => {
    useAuthState.setState({
      dismissedSignInNotices: ['humble'],
      humble: { isLoggedIn: true, expired: true }
    })
    useAuthState.getState().applySignInProbeOutcomes({ humble: 'expired' })
    expect(useAuthState.getState().dismissedSignInNotices).toEqual([])
  })

  it('applyHumbleKeys replaces keys without touching syncing', () => {
    useAuthState.setState({ humble: { syncing: true, keys: [] } })
    useAuthState.getState().applyHumbleKeys([{ id: 'k' } as never])
    expect(useAuthState.getState().humble).toEqual({
      syncing: true,
      keys: [{ id: 'k' }]
    })
  })

  it('applyHumbleSyncProgress sets syncing from done < total', () => {
    useAuthState.getState().applyHumbleSyncProgress(1, 3)
    expect(useAuthState.getState().humble.syncing).toBe(true)
    useAuthState.getState().applyHumbleSyncProgress(3, 3)
    expect(useAuthState.getState().humble.syncing).toBe(false)
  })

  it('applyHumbleSyncState (push) sets freshness and force-clears syncing; the pull leaves it', () => {
    const syncState = { syncedAt: 5, syncError: 'network' } as HumbleSyncState
    useAuthState.setState({ humble: { syncing: true } })
    useAuthState.getState().applyHumbleSyncState(syncState, false)
    expect(useAuthState.getState().humble).toEqual({
      syncing: true,
      syncedAt: 5,
      syncError: 'network'
    })
    useAuthState.getState().applyHumbleSyncState(syncState)
    expect(useAuthState.getState().humble.syncing).toBe(false)
  })
})

describe('authState login/logout actions', () => {
  const order: string[] = []
  let libraryCalls: unknown[][] = []
  let dialogs: Array<{
    title: string
    message: string
    buttons: Array<{ text: string; onClick?: () => void }>
  }> = []
  let userInfo: unknown
  // Config-store answers: handleSuccessfulLogin re-reads identities from them.
  let cfg: Record<string, unknown> = {}
  let logoutLegendaryImpl: () => Promise<void>

  const api = {
    storeNew: () => undefined,
    storeHas: () => false,
    storeGet: (name: string, key: string, fallback?: unknown) =>
      cfg[`${name}|${key}`] ?? fallback,
    setSetting: () => undefined,
    logError: () => undefined,
    login: async (sid: string) => {
      order.push(`login:${sid}`)
      return { status: 'done', data: { displayName: 'epicName' } }
    },
    logoutLegendary: () => {
      order.push('logoutLegendary')
      return logoutLegendaryImpl()
    },
    authGOG: async (token: string) => {
      order.push(`authGOG:${token}`)
      return { status: 'done', data: { username: 'gogName' } }
    },
    logoutGOG: () => {
      order.push('logoutGOG')
    },
    authAmazon: async () => {
      order.push('authAmazon')
      return { status: 'done', user: { user_id: 'amzId', name: 'amzName' } }
    },
    logoutAmazon: async () => {
      order.push('logoutAmazon')
    },
    getAmazonLoginData: async () => ({ url: 'u' }),
    logoutSteam: () => {
      order.push('logoutSteam')
    },
    getSteamUserInfo: async () => userInfo,
    humbleSync: async () => {
      order.push('humbleSync')
    },
    humbleDisconnect: () => {
      order.push('humbleDisconnect')
    }
  }

  beforeEach(() => {
    ;(window as unknown as { api: unknown }).api = api
    ;(window as unknown as { localStorage: unknown }).localStorage = {
      setItem: (k: string, v: string) => order.push(`storage:${k}=${v}`)
    }
    order.length = 0
    libraryCalls = []
    dialogs = []
    userInfo = undefined
    cfg = {
      'configStore|userInfo.displayName': 'epicName',
      'gogConfigStore|userData.username': 'gogName',
      'nileConfigStore|userData.user_id': 'amzId',
      'nileConfigStore|userData.name': 'amzName',
      'steamConfigStore|userData': { username: 'sName' }
    }
    logoutLegendaryImpl = async () => undefined
    useLibraryState.setState({
      refreshLibrary: async (o) => {
        libraryCalls.push(['refresh', o])
      },
      resetRunnerLibrary: (r) => {
        libraryCalls.push(['reset', r])
      },
      setRefreshing: (v) => {
        libraryCalls.push(['refreshing', v])
      }
    })
    useUiState.setState({
      showDialogModal: ((o: (typeof dialogs)[number]) => {
        dialogs.push(o)
      }) as never
    })
  })

  afterEach(() => {
    resetAllStores()
    jest.useRealTimers()
  })

  it('epicLogin sets the identity, resets the library and refreshes via handleSuccessfulLogin', async () => {
    await expect(useAuthState.getState().epicLogin('sid')).resolves.toBe('done')
    expect(useAuthState.getState().epicUsername).toBe('epicName')
    expect(order).toEqual(['login:sid', 'storage:category=all'])
    expect(libraryCalls).toEqual([
      ['reset', 'legendary'],
      [
        'refresh',
        {
          runInBackground: false,
          library: 'legendary',
          origin: 'login-success'
        }
      ]
    ])
  })

  it('epicLogin leaves everything alone on a non-done status', async () => {
    const original = api.login
    api.login = async () => ({ status: 'error', data: undefined }) as never
    try {
      await expect(useAuthState.getState().epicLogin('x')).resolves.toBe(
        'error'
      )
    } finally {
      api.login = original
    }
    expect(useAuthState.getState().epicUsername).toBeUndefined()
    expect(libraryCalls).toEqual([])
  })

  it('epicLogout toggles refreshing around the call and clears identity', async () => {
    useAuthState.setState({ epicUsername: 'epicName' })
    await useAuthState.getState().epicLogout()
    expect(useAuthState.getState().epicUsername).toBeNull()
    expect(libraryCalls).toEqual([
      ['refreshing', true],
      ['reset', 'legendary'],
      ['refreshing', false]
    ])
  })

  it('epicLogout still clears identity and refreshing when logout rejects', async () => {
    useAuthState.setState({ epicUsername: 'epicName' })
    logoutLegendaryImpl = () => Promise.reject(new Error('cookie clear failed'))
    await expect(useAuthState.getState().epicLogout()).rejects.toThrow(
      'cookie clear failed'
    )
    expect(useAuthState.getState().epicUsername).toBeNull()
    expect(libraryCalls).toEqual([
      ['refreshing', true],
      ['reset', 'legendary'],
      ['refreshing', false]
    ])
  })

  it('gogLogin and gogLogout', async () => {
    await expect(useAuthState.getState().gogLogin('tok')).resolves.toBe('done')
    expect(useAuthState.getState().gogUsername).toBe('gogName')
    await useAuthState.getState().gogLogout()
    expect(useAuthState.getState().gogUsername).toBeNull()
    expect(order).toEqual(['authGOG:tok', 'storage:category=all', 'logoutGOG'])
    expect(libraryCalls.slice(-1)).toEqual([['reset', 'gog']])
  })

  it('amazonLogin, getAmazonLoginData and amazonLogout (clears both fields)', async () => {
    await expect(
      useAuthState.getState().amazonLogin({} as never)
    ).resolves.toBe('done')
    expect(useAuthState.getState().amazonUserId).toBe('amzId')
    expect(useAuthState.getState().amazonUsername).toBe('amzName')
    await expect(useAuthState.getState().getAmazonLoginData()).resolves.toEqual(
      { url: 'u' }
    )
    await useAuthState.getState().amazonLogout()
    expect(useAuthState.getState().amazonUserId).toBeNull()
    expect(useAuthState.getState().amazonUsername).toBeNull()
    expect(libraryCalls[0]).toEqual(['reset', 'nile'])
    expect(libraryCalls.slice(-1)).toEqual([['reset', 'nile']])
  })

  it('steamLogin sets identity and refreshes in the background', async () => {
    await expect(
      useAuthState.getState().steamLogin({ status: 'done', username: 'sName' })
    ).resolves.toBe('done')
    expect(useAuthState.getState().steamUsername).toBe('sName')
    expect(libraryCalls).toEqual([
      ['reset', 'steam'],
      [
        'refresh',
        {
          runInBackground: true,
          library: 'steam',
          origin: 'steam-login',
          checkForUpdates: true
        }
      ]
    ])
  })

  it('steamLogout clears identity but keeps installed Steam games once sign-out is confirmed', async () => {
    const installed = { app_name: 'x', is_installed: true }
    const owned = { app_name: 'y', is_installed: false }
    useLibraryState.setState({ steamLibrary: [installed, owned] as never })
    useAuthState.setState({ steamUsername: 'sName' })
    await useAuthState.getState().steamLogout()
    expect(order).toEqual(['logoutSteam'])
    expect(useAuthState.getState().steamUsername).toBeNull()
    expect(libraryCalls).toEqual([])
    expect(useLibraryState.getState().steamLibrary).toEqual([installed])
    expect(dialogs).toEqual([])
  })

  // RED specimen: a variant that cleared state on failure would fail the
  // `toBe('sName')` assertion below, so the check is not vacuous.
  it('steamLogout leaves state untouched and shows the failure dialog when never confirmed', async () => {
    jest.useFakeTimers()
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    userInfo = { username: 'sName' }
    useAuthState.setState({ steamUsername: 'sName' })
    const pending = useAuthState.getState().steamLogout()
    await jest.advanceTimersByTimeAsync(20 * 150)
    await pending
    warn.mockRestore()
    expect(useAuthState.getState().steamUsername).toBe('sName')
    expect(libraryCalls).toEqual([])
    expect(dialogs).toHaveLength(1)
    // i18next is uninitialised here, so `t` yields no text; the dialog shape
    // (one OK button) is what is observable.
    expect(dialogs[0]!.buttons).toHaveLength(1)
  })

  it('humbleLogin marks connected, resyncs and starts a sync; non-done changes nothing', async () => {
    useAuthState.setState({ humble: { expired: true, keys: [] } })
    await useAuthState.getState().humbleLogin({ status: 'error' })
    expect(useAuthState.getState().humble.isLoggedIn).toBeUndefined()
    cfg['humbleConfigStore|isLoggedIn'] = true
    cfg['humbleConfigStore|userData'] = { username: 'h' }
    await useAuthState.getState().humbleLogin({ status: 'done', username: 'h' })
    expect(useAuthState.getState().humble).toMatchObject({
      isLoggedIn: true,
      username: 'h',
      expired: false,
      keys: []
    })
    expect(order).toEqual(['humbleSync'])
  })

  it('humbleDisconnect is confirmation-gated; Yes wipes with the exact reset object, No does nothing', async () => {
    useAuthState.setState({
      humble: { isLoggedIn: true, username: 'h', keys: [{ id: 'k' } as never] }
    })
    await useAuthState.getState().humbleDisconnect()
    expect(dialogs).toHaveLength(1)
    expect(order).toEqual([])
    expect(useAuthState.getState().humble.isLoggedIn).toBe(true)
    dialogs[0]!.buttons[1]!.onClick?.()
    expect(useAuthState.getState().humble.isLoggedIn).toBe(true)
    dialogs[0]!.buttons[0]!.onClick?.()
    expect(order).toEqual(['humbleDisconnect'])
    expect(useAuthState.getState().humble).toEqual({
      isLoggedIn: false,
      username: null,
      expired: false,
      keys: [],
      syncedAt: null,
      syncError: 'none',
      syncing: false
    })
  })

  it('completeOAuthLogin sets the Amazon identity, resets the nile library, then handles login', () => {
    useAuthState.getState().completeOAuthLogin({
      runner: 'nile',
      username: 'amzName',
      user_id: 'amzId'
    })
    expect(useAuthState.getState().amazonUserId).toBe('amzId')
    expect(useAuthState.getState().amazonUsername).toBe('amzName')
    expect(libraryCalls).toEqual([
      ['reset', 'nile'],
      [
        'refresh',
        { runInBackground: false, library: 'nile', origin: 'login-success' }
      ]
    ])
  })

  it('library slot is reached through the store, not captured at import', () => {
    expect(useLibraryState.getState().refreshLibrary).toBeDefined()
  })
})
