import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

import type { GetLogFileArgs } from 'backend/logger/paths'
import type { GameInfo } from 'common/types'
import type { RunsForMeState } from 'common/runsForMe'
import type { GameSettingsModalType } from '../screens/Settings/components/SettingsModal'
import { notify } from 'frontend/helpers'
import { gameOverridesStore } from 'frontend/helpers/stores'
import { t } from 'i18next'
import { bindStoreHooks, registerStoreForReset } from './storeKit'

// Phase 69 D-01: UI/dialog domain store (formerly UiState). gameOverrides,
// crossoverRatings and runsForMe move to libraryState in 69-16.

type GameOverride = NonNullable<GameInfo['overrides']>

export interface UiState {
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
  subscribeWithSelector((set) => ({
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

registerStoreForReset(useUiStateRaw)

export default bindStoreHooks(useUiStateRaw)
