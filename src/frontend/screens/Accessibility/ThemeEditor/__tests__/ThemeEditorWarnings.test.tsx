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

const NORD_ID = '00000000000000c3'

const nordCopy: CustomTheme = {
  id: NORD_ID,
  name: 'Nord copy',
  base: 'nord-light',
  tokens: { ...theme.tokens, '--success-button': '#a3be8c' }
}

const renderNord = () => {
  useSettingsState.setState({
    customThemes: [nordCopy],
    theme: 'midnightMirage'
  })
  const router = createMemoryRouter(
    [{ path: 'accessibility/themes/:id', element: <ThemeEditor /> }],
    { initialEntries: [`/accessibility/themes/${NORD_ID}`] }
  )
  return render(<RouterProvider router={router} />)
}

const rowOf = (token: string) =>
  input(token).closest('.themeEditor__row') as HTMLElement

describe('theme editor chips', () => {
  it('marks the Success button of a Nord Light copy as set by the base theme, with an (i) help', () => {
    renderNord()
    const row = rowOf('--success-button')
    expect(row.textContent).toContain('Set by base theme')
    const help = row.querySelector('button.helpLink--iconOnly') as HTMLElement
    expect(help).toBeTruthy()
    fireEvent.click(help)
    expect(
      screen.getByText(
        'Nord Light sets this directly, so editing it doesn’t change the real app.'
      )
    ).toBeTruthy()
  })

  it('does not mark the Success button of any other base as set by the base theme', () => {
    renderEditor()
    expect(rowOf('--success-button').textContent).not.toContain(
      'Set by base theme'
    )
  })

  it('marks a core token the thumbnail does not draw as not in preview, without an (i)', () => {
    renderEditor()
    const row = rowOf('--modal-background')
    expect(row.textContent).toContain('Not in preview')
    expect(row.querySelector('.helpLink')).toBeNull()
    expect(rowOf('--body-background').textContent).not.toContain(
      'Not in preview'
    )
  })

  it('marks a live-derived token in Advanced as derived, and names its source in the (i) help', () => {
    renderEditor()
    fireEvent.click(screen.getByRole('button', { name: /Advanced/ }))
    const row = rowOf('--focus-ring-color')
    expect(row.textContent).toContain('Derived')
    fireEvent.click(row.querySelector('button.helpLink--iconOnly') as Element)
    expect(
      screen.getByText('Follows Accent until you set a value here.')
    ).toBeTruthy()
  })

  it('keeps every help text behind an icon-only trigger: no Help link, and no text until it is opened', () => {
    renderEditor()
    fireEvent.click(screen.getByRole('button', { name: /Advanced/ }))
    expect(
      document.querySelectorAll('.helpLink:not(.helpLink--iconOnly)')
    ).toHaveLength(0)
    expect(
      screen.queryByText('Follows Accent until you set a value here.')
    ).toBeNull()
  })
})
