/**
 * The ONLY era-specific file of the D-14 re-render harness.
 *
 * Store era (Phase 69): the app is mounted through the real boot path --
 * initStateSubscriptions() then
 * <BootSequence><MemoryRouter><Library/></MemoryRouter></BootSequence> -- and
 * the UI-driven steps write the zustand stores directly. The IPC-driven steps
 * (gameStatusPush, libraryRefreshPush) are unchanged from the baseline era.
 *
 * window.api must already be the fake (see fakeApi.ts) BEFORE this module is
 * required, because helpers/stores.ts calls window.api.storeNew at import.
 */
import React from 'react'
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { MemoryRouter } from 'react-router-dom'
import i18next from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'

import BootSequence from '../../src/frontend/state/BootSequence'
import Library from '../../src/frontend/screens/Library'
import {
  __resetInitStateSubscriptionsGuardForTests,
  initStateSubscriptions
} from '../../src/frontend/state/initStateSubscriptions'
import useLibraryState from '../../src/frontend/state/libraryState'
import useSettingsState from '../../src/frontend/state/settingsState'
import useUiState from '../../src/frontend/state/uiState'
import { resetAllStores } from '../../src/frontend/state/storeKit'
import { emit } from './fakeApi'

let i18nReady: Promise<unknown> | null = null
function ensureI18n() {
  i18nReady ||= i18next.use(initReactI18next).init({
    lng: 'en',
    fallbackLng: 'en',
    resources: { en: { translation: {} } },
    interpolation: { escapeValue: false },
    react: { useSuspense: false }
  })
  return i18nReady
}

export type Wrap = (id: 'Library', el: React.ReactElement) => React.ReactElement

export async function mountApp(
  container: HTMLElement,
  wrap: Wrap
): Promise<Root> {
  await ensureI18n()
  // 69-18: handleRefreshLibrary is now a boot listener (once-guarded), so the
  // seam registers it the way index.tsx does before render. Every run installs
  // a fresh fake api (listeners cleared), so the once-guard is reset first.
  resetAllStores()
  __resetInitStateSubscriptionsGuardForTests()
  initStateSubscriptions()
  // libraryStatus is store state: a fresh run must start empty or the repeated
  // gameStatusPush becomes a no-op.
  useLibraryState.setState({ libraryStatus: [] })
  const root = createRoot(container)
  await act(async () => {
    root.render(
      <BootSequence>
        <I18nextProvider i18n={i18next}>
          <MemoryRouter>{wrap('Library', <Library />)}</MemoryRouter>
        </I18nextProvider>
      </BootSequence>
    )
  })
  return root
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0))

export const steps = {
  async toggleAppearance(): Promise<void> {
    await act(async () => {
      const settings = useSettingsState.getState()
      settings.setAllTilesInColor(!settings.allTilesInColor)
      await flush()
    })
  },
  async gameStatusPush(firstEpicApp: string): Promise<void> {
    await act(async () => {
      emit(
        'handleGameStatus',
        {},
        { appName: firstEpicApp, runner: 'legendary', status: 'installing' }
      )
      await flush()
    })
  },
  async dialogOpenClose(): Promise<void> {
    await act(async () => {
      useUiState.getState().showDialogModal({ title: 'perf', message: 'perf' })
      await flush()
    })
    await act(async () => {
      useUiState.getState().showDialogModal({ showDialog: false })
      await flush()
    })
  },
  async libraryRefreshPush(): Promise<void> {
    await act(async () => {
      emit('handleRefreshLibrary', {}, 'legendary')
      await flush()
      await flush()
    })
  }
}
