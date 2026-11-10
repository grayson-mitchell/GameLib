import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

import type { GetLogFileArgs } from 'backend/logger/paths'
import type { ConnectivityStatus, GameInfo } from 'common/types'
import type {
  DialogModalOptions,
  ExternalLinkDialogOptions
} from 'frontend/types'
import type { GameSettingsModalType } from '../screens/Settings/components/SettingsModal'
import { notify } from 'frontend/helpers'
import { t } from 'i18next'
import { reduceDialogRequest } from './dialogQueue'
import { bindStoreHooks, registerStoreForReset } from './storeKit'

// Phase 69 D-01: UI/dialog domain store (formerly UiState). The per-game
// display data lives in libraryState.

export interface UiState {
  // Phase 69-06 (D-10 first domain): moved out of GlobalState's StateProps.
  platform: NodeJS.Platform | 'unknown'
  isFullscreen: boolean
  isFrameless: boolean
  activeController: string
  connectivity: { status: ConnectivityStatus; retryIn: number }
  dialogModalOptions: DialogModalOptions
  dialogQueue: DialogModalOptions[]
  externalLinkDialogOptions: ExternalLinkDialogOptions
  showRedeemKeyDialog: boolean
  showDialogModal: (request: DialogModalOptions) => void
  showResetDialog: () => void
  handleExternalLinkDialog: (value: ExternalLinkDialogOptions) => void
  handleRedeemKeyDialog: (show: boolean) => void

  uploadLogFileProps:
    | false
    | {
        logFileArgs: GetLogFileArgs
        name: string
      }
  setUploadLogFileProps: (props: UiState['uploadLogFileProps']) => void

  settingsModalProps:
    | { isOpen: false }
    | {
        isOpen: true
        type: GameSettingsModalType
        gameInfo: GameInfo
      }
  openGameSettingsModal: (gameInfo: GameInfo) => void
  openGameLogsModal: (gameInfo: GameInfo) => void
  openGameCategoriesModal: (gameInfo: GameInfo) => void
  closeSettingsModal: () => void

  showUploadedLogFileList: boolean

  refreshingWineVersions: boolean
  refreshWineVersions: (fetch: boolean) => void
}

const useUiStateRaw = create<UiState>()(
  subscribeWithSelector((set, get) => ({
    platform: 'unknown',
    isFullscreen: false,
    isFrameless: false,
    activeController: '',
    connectivity: { status: 'offline', retryIn: 0 },
    dialogModalOptions: { showDialog: false },
    dialogQueue: [],
    externalLinkDialogOptions: { showDialog: false },
    showRedeemKeyDialog: false,

    showDialogModal: (request) => {
      // Functional update: a button click closes then opens a follow-up in the
      // same batch, and each call must see the previous one's result.
      set((prev) => {
        const next = reduceDialogRequest(
          { current: prev.dialogModalOptions, queue: prev.dialogQueue },
          request
        )
        return { dialogModalOptions: next.current, dialogQueue: next.queue }
      })
    },
    showResetDialog: () => {
      get().showDialogModal({
        title: t('box.reset-heroic.question.title', 'Reset GameLib'),
        message: t(
          'box.reset-heroic.question.message',
          "Are you sure you want to reset GameLib? This will remove all Settings and Caching but won't remove your Installed games or your Epic credentials. Portable versions (AppImage, WinPortable, ...) of GameLib needs to be restarted manually afterwards."
        ),
        buttons: [
          { text: t('box.yes'), onClick: window.api.resetHeroic },
          { text: t('box.no') }
        ]
      })
    },
    handleExternalLinkDialog: (externalLinkDialogOptions) => {
      set({ externalLinkDialogOptions })
    },
    handleRedeemKeyDialog: (showRedeemKeyDialog) => {
      set({ showRedeemKeyDialog })
    },

    uploadLogFileProps: false,
    setUploadLogFileProps: (uploadLogFileProps) => {
      set({ uploadLogFileProps })
    },

    settingsModalProps: { isOpen: false },
    openGameSettingsModal: (gameInfo) => {
      set({
        settingsModalProps: {
          isOpen: true,
          type: 'settings',
          gameInfo
        }
      })
    },
    openGameLogsModal: (gameInfo) => {
      set({
        settingsModalProps: {
          isOpen: true,
          type: 'log',
          gameInfo
        }
      })
    },
    openGameCategoriesModal: (gameInfo) => {
      set({
        settingsModalProps: {
          isOpen: true,
          type: 'category',
          gameInfo
        }
      })
    },
    closeSettingsModal: () => {
      set({ settingsModalProps: { isOpen: false } })
    },

    showUploadedLogFileList: false,

    refreshingWineVersions: false,
    refreshWineVersions: (fetch) => {
      window.api.logInfo('Refreshing wine downloader releases')
      set({ refreshingWineVersions: true })
      window.api
        .refreshWineVersionInfo(fetch)
        .catch(() => {
          window.api.logError('Sync with upstream releases failed')

          notify({
            title: 'Wine-Manager',
            body: t(
              'notify.refresh.error',
              "Couldn't fetch releases from upstream, maybe because of Github API restrictions! Try again later."
            )
          })
        })
        .finally(() => set({ refreshingWineVersions: false }))
    }
  }))
)

/**
 * The values the GlobalState constructor read after hydration. Applied by
 * initStateSubscriptions section (1); read at CALL time, never at module scope.
 */
export function readInitialUi(): Pick<UiState, 'platform'> {
  return {
    platform: window.platform
  }
}

registerStoreForReset(useUiStateRaw)

export default bindStoreHooks(useUiStateRaw)
