/**
 * @jest-environment jsdom
 */
import 'frontend/testUtils/jsdomNoticeEnv'

import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { CustomTheme } from 'common/types/customTheme'
import useSettingsState from 'frontend/state/settingsState'
import { resetAllStores } from 'frontend/state/storeKit'
import ThemeEditor from '../index'

void i18next.use(initReactI18next).init({
  lng: 'en',
  resources: {},
  initImmediate: false,
  interpolation: { escapeValue: false }
})

// jsdom exposes no fetch `Request`, which the data router builds for every navigation. The router
// only reads `url`, `method`, `headers` and `signal` from it, so a minimal stand-in is enough.
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

const ID = '00000000000000a1'
const setThemeStub = jest.fn()
// A plain recorder, not jest.fn(): the jest config resets mock implementations between tests.
const storeSetCheckedCalls: unknown[][] = []
const storeSetChecked = (...args: unknown[]) => {
  storeSetCheckedCalls.push(args)
  return Promise.resolve(true)
}

const theme: CustomTheme = {
  id: ID,
  name: 'My Nord',
  base: 'nord-light',
  tokens: { '--body-background': '#eceff4', '--accent': '#5e81ac' }
}

beforeEach(() => {
  Object.assign(window, {
    setTheme: setThemeStub,
    api: {
      storeNew: () => undefined,
      storeGet: (_name: string, _key: string, dflt?: unknown) => dflt,
      storeSet: () => undefined,
      storeSetChecked,
      gamepadAction: () => Promise.resolve()
    }
  })
})

afterEach(() => {
  cleanup()
  resetAllStores()
  setThemeStub.mockReset()
  storeSetCheckedCalls.length = 0
  document.body.className = ''
  document.body.removeAttribute('style')
})

const renderEditor = (id: string = ID) => {
  const router = createMemoryRouter(
    [
      { path: 'accessibility/themes/:id', element: <ThemeEditor /> },
      { path: 'accessibility', element: <p data-testid="appearance">hub</p> }
    ],
    { initialEntries: [`/accessibility/themes/${id}`] }
  )
  const utils = render(<RouterProvider router={router} />)
  return { ...utils, router }
}

const seed = (active: string) =>
  useSettingsState.setState({ customThemes: [theme], theme: active })

const typeInto = (input: HTMLElement, text: string) => {
  fireEvent.input(input, { target: { value: text } })
  fireEvent.keyDown(input, { key: 'Enter' })
}

const bodyRect = (container: HTMLElement) =>
  container.querySelector('[data-part="body"]')

const saveButton = () =>
  screen.getByRole('button', { name: 'Save theme' }) as HTMLButtonElement

describe('ThemeEditor', () => {
  it('lists the 27 core tokens in six groups', () => {
    seed('midnightMirage')
    const { container } = renderEditor()
    expect(
      Array.from(container.querySelectorAll('h2')).map((h) => h.textContent)
    ).toEqual(['Surfaces', 'Navigation', 'Text', 'Buttons', 'Accent', 'Status'])
    expect(container.querySelectorAll('.themeEditor__row')).toHaveLength(27)
  })

  it('repaints only the preview from the draft, never the running app', () => {
    seed('custom:' + ID)
    document.body.className = 'nord-light'
    const { container } = renderEditor()
    expect(bodyRect(container)?.getAttribute('fill')).toBe('#eceff4')
    typeInto(screen.getByLabelText('Body background'), '#123456')
    expect(bodyRect(container)?.getAttribute('fill')).toBe('#123456')
    expect(document.body.style.getPropertyValue('--body-background')).toBe('')
    expect(document.body.className).toBe('nord-light')
    expect(setThemeStub).not.toHaveBeenCalled()
  })

  it('Save re-applies and says "Saved and applied" when the theme is active', async () => {
    seed('custom:' + ID)
    renderEditor()
    typeInto(screen.getByLabelText('Body background'), '#123456')
    await act(async () => {
      fireEvent.click(saveButton())
    })
    const call = storeSetCheckedCalls[0] ?? []
    expect(call[1]).toBe('customThemes')
    const stored = call[2] as CustomTheme[]
    expect(stored[0]?.tokens['--body-background']).toBe('#123456')
    expect(setThemeStub).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status').textContent).toBe('Saved and applied')
  })

  it('Save only persists and says "Saved" when the theme is inactive', async () => {
    seed('midnightMirage')
    renderEditor()
    typeInto(screen.getByLabelText('Body background'), '#123456')
    await act(async () => {
      fireEvent.click(saveButton())
    })
    expect(storeSetCheckedCalls).toHaveLength(1)
    expect(setThemeStub).not.toHaveBeenCalled()
    expect(screen.getByRole('status').textContent).toBe('Saved')
  })

  it('shows "Theme not found" with a way back for an unknown id', () => {
    seed('midnightMirage')
    const { router } = renderEditor('00000000000000ff')
    expect(screen.getByText('Theme not found')).not.toBeNull()
    expect(
      screen.getByText('That custom theme no longer exists.')
    ).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Back to Appearance' }))
    expect(router.state.location.pathname).toBe('/accessibility')
  })
})
