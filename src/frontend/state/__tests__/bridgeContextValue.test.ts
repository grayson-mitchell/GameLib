import { resetAllStores, type StoreHooks } from '../storeKit'
import type { UiState } from '../uiState'
import type { SettingsState } from '../settingsState'
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
  let bridge: typeof BridgeModule

  beforeAll(async () => {
    useUiState = (await import('../uiState')).default
    useSettingsState = (await import('../settingsState')).default
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
})
