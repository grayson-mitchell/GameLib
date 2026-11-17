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

const INACTIVE_NOTE =
  'This isn’t your active theme. Pick it in the gallery to use it.'
const ID = '00000000000000a1'
const setThemeStub = jest.fn()
// A plain recorder, not jest.fn(): the jest config resets mock implementations between tests.
const storeSetCheckedCalls: unknown[][] = []
let holdWrite: Promise<boolean> | null = null
const storeSetChecked = (...args: unknown[]) => {
  storeSetCheckedCalls.push(args)
  return holdWrite ?? Promise.resolve(true)
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
  holdWrite = null
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

// The header's save status; the preview column carries a second polite status (contrast summary).
const headerStatus = () =>
  document.querySelector('.themeEditor__status') as HTMLElement

const saveButton = () =>
  screen.getByRole<HTMLButtonElement>('button', { name: 'Save theme' })

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
    expect(headerStatus().textContent).toBe('Saved and applied')
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
    expect(headerStatus().textContent).toBe('Saved')
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
  it('keeps Save disabled until something changes', () => {
    seed('midnightMirage')
    renderEditor()
    expect(saveButton().disabled).toBe(true)
    typeInto(screen.getByLabelText('Body background'), '#123456')
    expect(saveButton().disabled).toBe(false)
    expect(screen.getByText('Unsaved changes')).not.toBeNull()
  })

  it('writes once for a double click while the save is pending', async () => {
    seed('midnightMirage')
    let release: (ok: boolean) => void = () => undefined
    holdWrite = new Promise<boolean>((resolve) => {
      release = resolve
    })
    renderEditor()
    typeInto(screen.getByLabelText('Body background'), '#123456')
    fireEvent.click(saveButton())
    expect(saveButton().disabled).toBe(true)
    fireEvent.click(saveButton())
    expect(storeSetCheckedCalls).toHaveLength(1)
    await act(async () => {
      release(true)
      await holdWrite
    })
    expect(headerStatus().textContent).toBe('Saved')
  })

  it('announces nothing and stays dirty when the write fails', async () => {
    seed('custom:' + ID)
    holdWrite = Promise.resolve(false)
    renderEditor()
    typeInto(screen.getByLabelText('Body background'), '#123456')
    await act(async () => {
      fireEvent.click(saveButton())
    })
    expect(headerStatus().textContent).toBe('')
    expect(setThemeStub).not.toHaveBeenCalled()
    expect(saveButton().disabled).toBe(false)
  })

  it('shows the inactive-theme note only while the theme is not active', () => {
    seed('midnightMirage')
    const { unmount } = renderEditor()
    expect(screen.getByText(INACTIVE_NOTE)).not.toBeNull()
    unmount()
    seed('custom:' + ID)
    renderEditor()
    expect(screen.queryByText(INACTIVE_NOTE)).toBeNull()
  })

  it('names the base theme and goes back to Appearance when clean', () => {
    seed('midnightMirage')
    const { router } = renderEditor()
    expect(screen.getByText('Based on Nord Light')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Back to Appearance' }))
    expect(router.state.location.pathname).toBe('/accessibility')
  })
  it('keeps a live-derived token out of the draft: set it, clear it, and the theme is clean again', () => {
    seed('midnightMirage')
    renderEditor()
    fireEvent.click(screen.getByRole('button', { name: /Advanced/ }))
    const field = document.getElementById(
      'token--focus-ring-color'
    ) as HTMLInputElement
    expect(field.value).toBe('')
    typeInto(field, '#abcdef')
    expect(saveButton().disabled).toBe(false)
    typeInto(field, '')
    expect(field.value).toBe('')
    expect(saveButton().disabled).toBe(true)
  })
})
