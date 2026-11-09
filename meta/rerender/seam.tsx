/**
 * The ONLY era-specific file of the D-14 re-render harness.
 *
 * Current (pre-migration) era: the app is mounted as
 * <GlobalState><MemoryRouter><Library/></MemoryRouter></GlobalState> and the
 * UI-driven steps go through the GlobalState React context.
 *
 * Plan 69-25 rewrites mountApp / toggleAppearance / dialogOpenClose against
 * the zustand stores and calls initStateSubscriptions() first. The IPC-driven
 * steps (gameStatusPush, libraryRefreshPush) stay identical.
 *
 * window.api must already be the fake (see fakeApi.ts) BEFORE this module is
 * required, because helpers/stores.ts calls window.api.storeNew at import.
 */
import React, { useContext } from 'react'
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { MemoryRouter } from 'react-router-dom'
import i18next from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'

import GlobalState from 'frontend/state/GlobalState'
import ContextProvider from 'frontend/state/ContextProvider'
import Library from 'frontend/screens/Library'
import { emit } from './fakeApi'

type Ctx = React.ContextType<typeof ContextProvider>
let ctx: Ctx | null = null

function SeamProbe(): null {
  ctx = useContext(ContextProvider)
  return null
}

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
  const root = createRoot(container)
  await act(async () => {
    root.render(
      <GlobalState>
        <I18nextProvider i18n={i18next}>
          <MemoryRouter>
            <SeamProbe />
            {wrap('Library', <Library />)}
          </MemoryRouter>
        </I18nextProvider>
      </GlobalState>
    )
  })
  return root
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0))

export const steps = {
  async toggleAppearance(): Promise<void> {
    await act(async () => {
      ctx!.setAllTilesInColor(!ctx!.allTilesInColor)
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
      ctx!.showDialogModal({ title: 'perf', message: 'perf' })
      await flush()
    })
    await act(async () => {
      ctx!.showDialogModal({ showDialog: false })
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
