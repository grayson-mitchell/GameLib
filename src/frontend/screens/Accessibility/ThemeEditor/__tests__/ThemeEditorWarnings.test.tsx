/**
 * @jest-environment jsdom
 */
import 'frontend/testUtils/jsdomNoticeEnv'

import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { CustomTheme } from 'common/types/customTheme'
import { formatRatio, tryContrast } from 'frontend/customThemes/colour'
import useSettingsState from 'frontend/state/settingsState'
import { resetAllStores } from 'frontend/state/storeKit'
import ThemeEditor from '../index'

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

const ID = '00000000000000b2'

const theme: CustomTheme = {
  id: ID,
  name: 'Warn',
  base: 'midnightMirage',
  tokens: {
    '--body-background': '#222222',
    '--modal-background': '#222222',
    '--border-color': '#cccccc',
    '--accent': '#5e81ac'
  }
}

beforeEach(() => {
  Object.assign(window, {
    setTheme: jest.fn(),
    api: {
      storeNew: () => undefined,
      storeGet: (_name: string, _key: string, dflt?: unknown) => dflt,
      storeSet: () => undefined,
      storeSetChecked: () => Promise.resolve(true),
      gamepadAction: () => Promise.resolve()
    }
  })
  useSettingsState.setState({ customThemes: [theme], theme: 'midnightMirage' })
})

afterEach(() => {
  cleanup()
  resetAllStores()
})

const renderEditor = () => {
  const router = createMemoryRouter(
    [{ path: 'accessibility/themes/:id', element: <ThemeEditor /> }],
    { initialEntries: [`/accessibility/themes/${ID}`] }
  )
  return render(<RouterProvider router={router} />)
}

const input = (token: string) =>
  document.getElementById(`token${token}`) as HTMLInputElement

const typeInto = (token: string, text: string) => {
  fireEvent.input(input(token), { target: { value: text } })
  fireEvent.keyDown(input(token), { key: 'Enter' })
}

const warningText = (a: string, b: string, fg: string, bg: string) =>
  `${a} vs ${b} ${formatRatio(tryContrast(fg, bg) as number)}:1, needs 3:1`

const saveButton = () =>
  screen.getByRole<HTMLButtonElement>('button', { name: 'Save theme' })

describe('theme editor contrast warnings', () => {
  it('starts with no warnings and says so', () => {
    renderEditor()
    expect(screen.getByText('No contrast warnings')).toBeTruthy()
    expect(document.querySelectorAll('.themeEditor__warning')).toHaveLength(0)
  })

  it('shows a failing pair under both of its rows, counts it, and leaves Save enabled', () => {
    renderEditor()
    typeInto('--border-color', '#333333')
    const text = warningText('Border', 'body', '#333333', '#222222')
    // Border row and Body background row each carry the pair.
    expect(screen.getAllByText(text)).toHaveLength(2)
    const under = (token: string) =>
      input(token)
        .closest('.themeEditor__row')
        ?.querySelectorAll('.themeEditor__warning')
    expect(under('--border-color')).toHaveLength(2)
    expect(under('--body-background')).toHaveLength(1)
    expect(under('--modal-background')).toHaveLength(1)
    expect(under('--accent')).toHaveLength(0)
    // The border-modal pair fails too, so the summary counts both.
    expect(screen.getByText('2 contrast warnings')).toBeTruthy()
    // aria-describedby points at the warning.
    const describedBy =
      input('--body-background').getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(document.getElementById(describedBy as string)?.textContent).toBe(
      text
    )
    // D-15: a warning never blocks Save.
    expect(saveButton().disabled).toBe(false)
  })

  it('uses the singular summary for one failing pair', () => {
    renderEditor()
    typeInto('--accent', '#262626')
    expect(
      screen.getAllByText(warningText('Accent', 'body', '#262626', '#222222'))
    ).toHaveLength(2)
    expect(screen.getByText('1 contrast warning')).toBeTruthy()
  })

  it('drops the warnings, without throwing, when the border becomes fully transparent', () => {
    renderEditor()
    typeInto('--border-color', '#333333')
    expect(screen.getAllByText(/needs 3:1/)).not.toHaveLength(0)
    typeInto('--border-color', 'transparent')
    expect(document.querySelectorAll('.themeEditor__warning')).toHaveLength(0)
    expect(screen.getByText('No contrast warnings')).toBeTruthy()
    expect(saveButton().disabled).toBe(false)
  })
})
