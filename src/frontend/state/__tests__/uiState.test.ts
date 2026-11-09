import type { GameInfo } from 'common/types'
import { resetAllStores, type StoreHooks } from '../storeKit'
import type { UiState } from '../uiState'

// The renderer env is `node` (no jsdom); uiState transitively imports
// frontend/helpers which attaches window.api at module scope, so give it a
// window first and load the modules afterwards.
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
// eslint-disable-next-line @typescript-eslint/no-require-imports
const useUiState = require('../uiState').default as StoreHooks<UiState>

const game = { app_name: 'a', title: 'A', runner: 'steam' } as GameInfo

describe('uiState store', () => {
  afterEach(() => {
    resetAllStores()
    jest.restoreAllMocks()
  })

  it('has the original initial values', () => {
    const s = useUiState.getState()
    expect(s.uploadLogFileProps).toBe(false)
    expect(s.settingsModalProps).toEqual({ isOpen: false })
    expect(s.showUploadedLogFileList).toBe(false)
    expect(s.refreshingWineVersions).toBe(false)
    expect(s.crossoverRatings).toEqual({})
    expect(s.runsForMe).toEqual({})
    expect(typeof s.gameOverrides).toBe('object')
  })

  it('opens and closes the game modals', () => {
    const s = useUiState.getState()
    s.openGameSettingsModal(game)
    expect(useUiState.getState().settingsModalProps).toEqual({
      isOpen: true,
      type: 'settings',
      gameInfo: game
    })
    s.openGameLogsModal(game)
    expect(useUiState.getState().settingsModalProps).toMatchObject({
      type: 'log'
    })
    s.openGameCategoriesModal(game)
    expect(useUiState.getState().settingsModalProps).toMatchObject({
      type: 'category'
    })
    s.closeSettingsModal()
    expect(useUiState.getState().settingsModalProps).toEqual({ isOpen: false })
  })

  it('toggles refreshingWineVersions around the refresh call', async () => {
    let resolve: () => void = () => undefined
    const pending = new Promise<void>((r) => (resolve = r))
    const api = window.api as unknown as Record<string, unknown>
    api.logInfo = jest.fn()
    api.logError = jest.fn()
    api.refreshWineVersionInfo = jest.fn(() => pending)
    useUiState.getState().refreshWineVersions(true)
    expect(useUiState.getState().refreshingWineVersions).toBe(true)
    resolve()
    await pending
    await Promise.resolve()
    expect(useUiState.getState().refreshingWineVersions).toBe(false)
  })

  it('subscribe fires only on selected-slice change', () => {
    const listener = jest.fn()
    useUiState.subscribe((s) => s.showUploadedLogFileList, listener)
    useUiState.setState({ uploadLogFileProps: false })
    expect(listener).not.toHaveBeenCalled()
    useUiState.setState({ showUploadedLogFileList: true })
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
