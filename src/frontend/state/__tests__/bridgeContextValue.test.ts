import { resetAllStores, type StoreHooks } from '../storeKit'
import type { UiState } from '../uiState'
import type { SettingsState } from '../settingsState'
import type { AuthState } from '../authState'
import type * as BridgeModule from '../bridgeContextValue'

// Node-env frontend project (no jsdom): give uiState's transitive imports a
// window before loading them.
;(globalThis as unknown as { window: object }).window = {
  __TAURI_INTERNALS__: {
    invoke: () => Promise.resolve(undefined),
    transformCallback: () => 0,
    unregisterCallback: () => undefined,
    metadata: {
      currentWindow: { label: 'main' },
      currentWebview: { label: 'main' }
    }
  }
}

describe('bridgeContextValue', () => {
  let useUiState: StoreHooks<UiState>
  let useSettingsState: StoreHooks<SettingsState>
  let useAuthState: StoreHooks<AuthState>
  let bridge: typeof BridgeModule

  beforeAll(async () => {
    useUiState = (await import('../uiState')).default
    useSettingsState = (await import('../settingsState')).default
    useAuthState = (await import('../authState')).default
    bridge = await import('../bridgeContextValue')
  })

  afterEach(() => {
    resetAllStores()
  })

  it('bridgedContextSlice follows the store', () => {
    expect(bridge.bridgedContextSlice().platform).toBe('unknown')
    useUiState.setState({ platform: 'linux' })
    expect(bridge.bridgedContextSlice().platform).toBe('linux')
    useUiState.setState({ isFrameless: true })
    expect(bridge.bridgedContextSlice().isFrameless).toBe(true)
  })

  it('exposes the actions as the store functions', () => {
    const slice = bridge.bridgedContextSlice()
    const ui = useUiState.getState()
    expect(slice.showDialogModal).toBe(ui.showDialogModal)
    expect(slice.showResetDialog).toBe(ui.showResetDialog)
    expect(slice.handleExternalLinkDialog).toBe(ui.handleExternalLinkDialog)
    expect(slice.handleRedeemKeyDialog).toBe(ui.handleRedeemKeyDialog)
  })

  it('subscribeBridge fires exactly once per setState', () => {
    const spy = jest.fn()
    bridge.subscribeBridge(spy)
    useUiState.setState({ error: true })
    expect(spy).toHaveBeenCalledTimes(1)
    useUiState.setState({ activeController: 'x' })
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('bridgedContextSlice follows the settings store and derives isRTL', () => {
    expect(bridge.bridgedContextSlice().theme).toBe('midnightMirage')
    useSettingsState.setState({ theme: 'dracula', language: 'ar' })
    const slice = bridge.bridgedContextSlice()
    expect(slice.theme).toBe('dracula')
    expect(slice.isRTL).toBe(true)
    useSettingsState.setState({ language: 'en' })
    expect(bridge.bridgedContextSlice().isRTL).toBe(false)
  })

  it('exposes the settings setters as the store functions', () => {
    const slice = bridge.bridgedContextSlice()
    const settings = useSettingsState.getState()
    expect(slice.setTheme).toBe(settings.setTheme)
    expect(slice.setZoomPercent).toBe(settings.setZoomPercent)
    expect(slice.handleFocusRow).toBe(settings.handleFocusRow)
    expect(slice.setSideBarCollapsed).toBe(settings.setSideBarCollapsed)
  })

  it('subscribeBridge fires for a settings change too', () => {
    const spy = jest.fn()
    bridge.subscribeBridge(spy)
    useSettingsState.setState({ hideTitles: true })
    expect(spy).toHaveBeenCalledTimes(1)
  })

  const classPart = () => {
    return {
      epicLibrary: [],
      gogLibrary: [],
      amazonLibrary: [],
      steamLibrary: []
    }
  }

  it('bridgedAccounts composites keep their keys and follow authState identities', () => {
    useAuthState.setState({
      epicUsername: 'e',
      gogUsername: 'g',
      amazonUserId: 'a-id',
      amazonUsername: 'a',
      steamUsername: 's',
      humble: { isLoggedIn: true, username: 'h', keys: [] }
    })
    const parts = classPart()
    const accounts = bridge.bridgedAccounts(parts)
    expect(Object.keys(accounts)).toEqual([
      'epic',
      'gog',
      'amazon',
      'steam',
      'humble'
    ])
    expect(accounts.epic.username).toBe('e')
    expect(accounts.gog.username).toBe('g')
    expect(accounts.amazon.user_id).toBe('a-id')
    expect(accounts.amazon.username).toBe('a')
    expect(accounts.steam.username).toBe('s')
    expect(accounts.humble).toMatchObject({ isLoggedIn: true, username: 'h' })
    const auth = useAuthState.getState()
    expect(accounts.epic.login).toBe(auth.epicLogin)
    expect(accounts.amazon.getLoginData).toBe(auth.getAmazonLoginData)
    expect(accounts.steam.logout).toBe(auth.steamLogout)
    expect(accounts.humble.logout).toBe(auth.humbleDisconnect)
    expect(bridge.bridgedContextSlice().completeOAuthLogin).toBe(
      auth.completeOAuthLogin
    )
    expect(Object.keys(accounts.humble)).toEqual([
      'isLoggedIn',
      'username',
      'expired',
      'encryptionDegraded',
      'keys',
      'syncedAt',
      'syncError',
      'syncing',
      'login',
      'logout'
    ])

    useAuthState.setState({ epicUsername: null })
    expect(bridge.bridgedAccounts(parts).epic.username).toBeNull()
  })

  it('the slice carries the sign-in notice state and actions, and authState changes notify', () => {
    useAuthState.setState({ dismissedSignInNotices: ['gog'] })
    const slice = bridge.bridgedContextSlice()
    expect(slice.dismissedSignInNotices).toEqual(['gog'])
    expect(slice.handleDismissSignInNotice).toBe(
      useAuthState.getState().handleDismissSignInNotice
    )
    const spy = jest.fn()
    bridge.subscribeBridge(spy)
    useAuthState.setState({ steamUsername: 'x' })
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('serves the collection composites from libraryState and follows it', async () => {
    const useLibraryState = (await import('../libraryState')).default
    let slice = bridge.bridgedContextSlice()
    expect(slice.hiddenGames.list).toEqual([])
    expect(Object.keys(slice.customCategories).sort()).toEqual([
      'addCategory',
      'addToGame',
      'list',
      'listCategories',
      'removeCategory',
      'removeFromGame',
      'renameCategory'
    ])
    expect(Object.keys(slice.favouriteGames).sort()).toEqual([
      'add',
      'list',
      'remove'
    ])
    useLibraryState.setState({ hiddenGames: [{ appName: 'a', title: 'A' }] })
    slice = bridge.bridgedContextSlice()
    expect(slice.hiddenGames.list).toEqual([{ appName: 'a', title: 'A' }])
    expect(slice.hiddenGames.add).toBe(useLibraryState.getState().hideGame)
    expect(slice.setCurrentCustomCategories).toBe(
      useLibraryState.getState().setCurrentCustomCategories
    )
    let fired = 0
    bridge.subscribeBridge(() => {
      fired += 1
    })
    useLibraryState.setState({ favouriteGames: [] })
    expect(fired).toBe(1)
  })
})
