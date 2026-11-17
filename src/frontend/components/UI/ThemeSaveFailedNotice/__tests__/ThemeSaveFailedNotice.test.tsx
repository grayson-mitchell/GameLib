/**
 * @jest-environment jsdom
 */
import 'frontend/testUtils/jsdomNoticeEnv'

import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import {
  MemoryRouter,
  RouterProvider,
  createMemoryRouter
} from 'react-router-dom'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AppNoticeStack } from 'frontend/components/UI/NoticeStack'
import { StoreEmbedSuppressionProvider } from 'frontend/components/UI/NavShell/StoreEmbedSuppressionContext'
import { PHASE_FALLBACK_MS } from 'frontend/components/UI/NoticeStack/noticeSlot'
import type { CustomTheme } from 'common/types/customTheme'
import useSettingsState from 'frontend/state/settingsState'
import { useThemeSaveFailedNotice } from 'frontend/state/ThemeSaveFailedNotice'
import { resetAllStores } from 'frontend/state/storeKit'
import ThemeEditor from 'frontend/screens/Accessibility/ThemeEditor'

void i18next.use(initReactI18next).init({
  lng: 'en',
  resources: {},
  initImmediate: false,
  interpolation: { escapeValue: false }
})

// jsdom exposes no fetch `Request`, which the data router builds for every navigation.
class FakeRequest {
  readonly method: string
  readonly headers = new Map<string, string>()
  readonly signal: AbortSignal | undefined
  constructor(
    readonly url: string,
    init: { method?: string; signal?: AbortSignal } = {}
  ) {
    this.method = init.method ?? 'GET'
    this.signal = init.signal
  }
}
Object.assign(globalThis, { Request: FakeRequest })

const ID = '00000000000000c3'
const theme: CustomTheme = {
  id: ID,
  name: 'My theme',
  base: 'nord-light',
  tokens: { '--body-background': '#eceff4' }
}
let writeResult = true
const storeSetChecked = () => Promise.resolve(writeResult)

beforeEach(() => {
  Object.assign(window, {
    setTheme: jest.fn(),
    api: {
      storeNew: () => undefined,
      storeGet: (_name: string, _key: string, dflt?: unknown) => dflt,
      storeSet: () => undefined,
      storeSetChecked,
      logInfo: () => undefined,
      gamepadAction: () => Promise.resolve()
    }
  })
})

afterEach(() => {
  cleanup()
  resetAllStores()
  useThemeSaveFailedNotice.setState({ name: null, seq: 0 })
  writeResult = true
  jest.useRealTimers()
})

const mountStack = () =>
  render(
    <MemoryRouter>
      <StoreEmbedSuppressionProvider>
        <AppNoticeStack />
      </StoreEmbedSuppressionProvider>
    </MemoryRouter>
  )

const NOTICE_TEXT =
  'Couldn’t save “My theme”. Your changes are still here, so try again.'

describe('ThemeSaveFailedNotice', () => {
  it('shows the curly-quoted name in the bottom-right stack', () => {
    const { container } = mountStack()
    expect(container.querySelector('.themeSaveFailedNotice')).toBeNull()
    act(() => useThemeSaveFailedNotice.getState().show('My theme'))
    const toast = container.querySelector(
      '.noticeStack > .noticeStackSlot .themeSaveFailedNotice'
    )
    expect(toast?.textContent).toBe(NOTICE_TEXT)
    expect(toast?.getAttribute('role')).toBe('status')
  })

  it('stays until dismissed, then leaves after the exit phases', () => {
    jest.useFakeTimers()
    const { container } = mountStack()
    act(() => useThemeSaveFailedNotice.getState().show('My theme'))
    act(() => {
      jest.advanceTimersByTime(60_000)
    })
    expect(container.querySelector('.themeSaveFailedNotice')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    // The name stays on screen through the exit even though the store cleared it.
    expect(container.querySelector('.themeSaveFailedNotice')?.textContent).toBe(
      NOTICE_TEXT
    )
    act(() => {
      jest.advanceTimersByTime(PHASE_FALLBACK_MS + 1)
    })
    act(() => {
      jest.advanceTimersByTime(PHASE_FALLBACK_MS + 1)
    })
    expect(container.querySelector('.noticeStackSlot')).toBeNull()
  })

  it('a repeat failure re-shows a dismissed notice', () => {
    jest.useFakeTimers()
    const { container } = mountStack()
    act(() => useThemeSaveFailedNotice.getState().show('My theme'))
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    act(() => {
      jest.advanceTimersByTime(PHASE_FALLBACK_MS + 1)
    })
    act(() => {
      jest.advanceTimersByTime(PHASE_FALLBACK_MS + 1)
    })
    expect(container.querySelector('.themeSaveFailedNotice')).toBeNull()
    act(() => useThemeSaveFailedNotice.getState().show('My theme'))
    expect(container.querySelector('.themeSaveFailedNotice')).not.toBeNull()
  })

  it('the editor sets the notice on a refused Save, announces nothing and stays dirty', async () => {
    writeResult = false
    useSettingsState.setState({
      customThemes: [theme],
      theme: 'midnightMirage'
    })
    const router = createMemoryRouter(
      [{ path: 'accessibility/themes/:id', element: <ThemeEditor /> }],
      { initialEntries: [`/accessibility/themes/${ID}`] }
    )
    render(<RouterProvider router={router} />)
    const input = screen.getByLabelText('Body background')
    fireEvent.input(input, { target: { value: '#123456' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    const save = screen.getByRole<HTMLButtonElement>('button', {
      name: 'Save theme'
    })
    await act(async () => {
      fireEvent.click(save)
    })
    expect(useThemeSaveFailedNotice.getState().name).toBe('My theme')
    expect(
      (document.querySelector('.themeEditor__status') as HTMLElement)
        .textContent
    ).toBe('')
    expect(save.disabled).toBe(false)
    expect(screen.getByText('Unsaved changes')).toBeTruthy()
  })

  it('a successful Save leaves the notice state alone', async () => {
    useSettingsState.setState({
      customThemes: [theme],
      theme: 'midnightMirage'
    })
    const router = createMemoryRouter(
      [{ path: 'accessibility/themes/:id', element: <ThemeEditor /> }],
      { initialEntries: [`/accessibility/themes/${ID}`] }
    )
    render(<RouterProvider router={router} />)
    const input = screen.getByLabelText('Body background')
    fireEvent.input(input, { target: { value: '#123456' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save theme' }))
    })
    expect(useThemeSaveFailedNotice.getState().name).toBeNull()
  })
})
