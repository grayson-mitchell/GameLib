import type { GameInfo } from 'common/types'
import { resetAllStores, type StoreHooks } from '../storeKit'
import type { UiState } from '../uiState'
import type { DialogModalOptions } from 'frontend/types'

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
// eslint-disable-next-line @typescript-eslint/no-require-imports
const readInitialUi = require('../uiState').readInitialUi as () => {
  platform: unknown
}

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

  it('has the moved UI slice defaults', () => {
    const s = useUiState.getState()
    expect(s.platform).toBe('unknown')
    expect(s.isFullscreen).toBe(false)
    expect(s.isFrameless).toBe(false)
    expect(s.activeController).toBe('')
    expect(s.connectivity).toEqual({ status: 'offline', retryIn: 0 })
    expect(s.dialogModalOptions).toEqual({ showDialog: false })
    expect(s.dialogQueue).toEqual([])
    expect(s.externalLinkDialogOptions).toEqual({ showDialog: false })
    expect(s.showRedeemKeyDialog).toBe(false)
  })

  it('showDialogModal: two calls in one tick each see the previous result', () => {
    const { showDialogModal } = useUiState.getState()
    const a: DialogModalOptions = { title: 'a', dialogId: 'a' }
    const b: DialogModalOptions = { title: 'b', dialogId: 'b' }
    showDialogModal(a)
    showDialogModal(b)
    const s = useUiState.getState()
    expect(s.dialogModalOptions).toMatchObject({ title: 'a', showDialog: true })
    expect(s.dialogQueue).toHaveLength(1)
    expect(s.dialogQueue[0]).toMatchObject({ title: 'b' })
    showDialogModal({ showDialog: false })
    const after = useUiState.getState()
    expect(after.dialogModalOptions).toMatchObject({ title: 'b' })
    expect(after.dialogQueue).toEqual([])
  })

  it('showResetDialog opens the reset dialog with Yes -> resetHeroic and No', () => {
    const resetHeroic = jest.fn()
    ;(window.api as unknown as Record<string, unknown>).resetHeroic =
      resetHeroic
    useUiState.getState().showResetDialog()
    const current = useUiState.getState().dialogModalOptions
    expect(current.showDialog).toBe(true)
    expect(current.buttons).toHaveLength(2)
    expect(current.buttons?.[0]?.onClick).toBe(resetHeroic)
  })

  it('sets the external-link and redeem-key dialog state', () => {
    useUiState
      .getState()
      .handleExternalLinkDialog({ showDialog: true, linkCallback: () => 1 })
    expect(useUiState.getState().externalLinkDialogOptions.showDialog).toBe(
      true
    )
    useUiState.getState().handleRedeemKeyDialog(true)
    expect(useUiState.getState().showRedeemKeyDialog).toBe(true)
  })

  it('readInitialUi reads window.platform at call time', () => {
    ;(window as unknown as { platform: string }).platform = 'linux'
    expect(readInitialUi().platform).toBe('linux')
    ;(window as unknown as { platform: string }).platform = 'darwin'
    expect(readInitialUi().platform).toBe('darwin')
    expect(Object.keys(readInitialUi())).toEqual(['platform'])
  })
})
