import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

import type { GetLogFileArgs } from 'backend/logger/paths'
import type {
  ConnectivityStatus,
  GameInfo,
  Runner,
  WineVersionInfo
} from 'common/types'
import type {
  DialogModalOptions,
  ExternalLinkDialogOptions
} from 'frontend/types'
import type { RunsForMeState } from 'common/runsForMe'
import type { GameSettingsModalType } from '../screens/Settings/components/SettingsModal'
import { notify } from 'frontend/helpers'
import {
  gameOverridesStore,
  wineDownloaderInfoStore
} from 'frontend/helpers/stores'
import { t } from 'i18next'
import { reduceDialogRequest } from './dialogQueue'
import { bindStoreHooks, registerStoreForReset } from './storeKit'

// Phase 69 D-01: UI/dialog domain store (formerly UiState). gameOverrides,
// crossoverRatings and runsForMe move to libraryState in 69-16.

type GameOverride = NonNullable<GameInfo['overrides']>

export interface UiState {
  // Phase 69-06 (D-10 first domain): moved out of GlobalState's StateProps.
  platform: NodeJS.Platform | 'unknown'
  error: boolean
  isFullscreen: boolean
  isFrameless: boolean
  activeController: string
  connectivity: { status: ConnectivityStatus; retryIn: number }
  dialogModalOptions: DialogModalOptions
  dialogQueue: DialogModalOptions[]
  externalLinkDialogOptions: ExternalLinkDialogOptions
  showRedeemKeyDialog: boolean
  showInstallModal: {
    show: boolean
    gameInfo: GameInfo | null
    appName: string
    runner: Runner
  }
  wineVersions: WineVersionInfo[]
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

  gameOverrides: Record<string, GameOverride>
  setGameOverrides: (overrides: Record<string, GameOverride>) => void

  // Phase 19 (Plan 06), D-11/D-16: display-only three-state CrossOver
  // rating map (`number` = matched rating, `null` = looked-up-but-absent,
  // key-absent = never looked up). The grid reads this synchronously — no
  // component writes back to it, and reading it never triggers a fetch.
  crossoverRatings: Record<string, number | null>
  setCrossoverRatings: (ratings: Record<string, number | null>) => void

  // Quick 261029-mkz: per-game "Runs for me" override map, keyed
  // `${app_name}_${runner}`. Backend-persisted; this slice mirrors it.
  runsForMe: Record<string, RunsForMeState>
  setRunsForMe: (map: Record<string, RunsForMeState>) => void
}

const useUiStateRaw = create<UiState>()(
  subscribeWithSelector((set, get) => ({
    platform: 'unknown',
    error: false,
    isFullscreen: false,
    isFrameless: false,
    activeController: '',
    connectivity: { status: 'offline', retryIn: 0 },
    dialogModalOptions: { showDialog: false },
    dialogQueue: [],
    externalLinkDialogOptions: { showDialog: false },
    showRedeemKeyDialog: false,
    showInstallModal: {
      show: false,
      appName: '',
      runner: 'legendary',
      gameInfo: null
    },
    wineVersions: [],

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

    // Create-time read preserved (import-time timing, see
    // .planning/todos/pending/2026-11-10-import-time-mirror-reads-before-hydration.md)
    gameOverrides: gameOverridesStore.get('overrides', {}),
    setGameOverrides: (gameOverrides) => set({ gameOverrides }),

    crossoverRatings: {},
    setCrossoverRatings: (crossoverRatings) => set({ crossoverRatings }),

    runsForMe: {},
    setRunsForMe: (runsForMe) => set({ runsForMe }),

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
export function readInitialUi(): Pick<UiState, 'platform' | 'wineVersions'> {
  return {
    platform: window.platform,
    wineVersions: wineDownloaderInfoStore.get('wine-releases', [])
  }
}

registerStoreForReset(useUiStateRaw)

export default bindStoreHooks(useUiStateRaw)
