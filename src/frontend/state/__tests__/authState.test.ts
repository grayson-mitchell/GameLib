import '../../testUtils/tauriWindow'
import { resetAllStores } from '../storeKit'
import useAuthState, { readInitialAuth } from '../authState'
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
