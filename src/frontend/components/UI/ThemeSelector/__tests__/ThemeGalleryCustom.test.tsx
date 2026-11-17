/**
 * @jest-environment jsdom
 */
import 'frontend/testUtils/jsdomNoticeEnv'

import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ThemeSelector } from '../index'
import type { CustomTheme } from 'common/types/customTheme'
import { MAX_CUSTOM_THEMES } from 'frontend/customThemes/customTheme'
import useSettingsState from 'frontend/state/settingsState'
import useUiState from 'frontend/state/uiState'
import { resetAllStores } from 'frontend/state/storeKit'

void i18next.use(initReactI18next).init({
  lng: 'en',
  resources: {},
  initImmediate: false,
  interpolation: { escapeValue: false }
})

const setThemeStub = jest.fn()

beforeEach(() => {
  Object.assign(window, {
    setTheme: setThemeStub,
    api: {
      storeNew: () => undefined,
      storeGet: (_name: string, _key: string, dflt?: unknown) => dflt,
      storeSet: () => undefined,
      storeSetChecked: () => Promise.resolve(true),
      gamepadAction: () => Promise.resolve()
    }
  })
})

afterEach(() => {
  cleanup()
  resetAllStores()
  setThemeStub.mockReset()
})

const EditorProbe = () => (
  <p data-testid="editor-probe">editor:{useParams().id}</p>
)

const renderGallery = () =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<ThemeSelector />} />
        <Route path="/accessibility/themes/:id" element={<EditorProbe />} />
      </Routes>
    </MemoryRouter>
  )

const hexId = (n: number) => n.toString(16).padStart(16, '0')
const makeTheme = (
  n: number,
  over: Partial<CustomTheme> = {}
): CustomTheme => ({
  id: hexId(n),
  name: `Theme ${n}`,
  base: 'dracula',
  tokens: { '--accent': '#ff0000' },
  ...over
})

const customCards = (container: HTMLElement) =>
  Array.from(
    container.querySelectorAll<HTMLElement>('[data-theme-key^="custom:"]')
  )

describe('ThemeGallery: Your themes group', () => {
  it('shows the empty state when there are no custom themes', () => {
    const { getByRole, getByText, container } = renderGallery()
    const group = getByRole('group', { name: 'Your themes' })
    expect(group).not.toBeNull()
    expect(getByText('No custom themes yet')).not.toBeNull()
    expect(
      getByText(
        'Duplicate a theme to start your own. Your copy keeps the original colours until you change them.'
      )
    ).not.toBeNull()
    expect(customCards(container)).toHaveLength(0)
  })

  it('lists custom themes in stored order beside the built-ins', () => {
    useSettingsState.setState({
      customThemes: [makeTheme(3), makeTheme(1), makeTheme(2)]
    })
    const { getByRole } = renderGallery()
    const group = getByRole('group', { name: 'Your themes' })
    const keys = Array.from(
      group.querySelectorAll<HTMLElement>('[data-theme-key]')
    ).map((c) => c.dataset.themeKey)
    expect(keys).toEqual([
      `custom:${hexId(3)}`,
      `custom:${hexId(1)}`,
      `custom:${hexId(2)}`
    ])
  })

  it('keeps themes with equal names and equal tokens as separate cards by key', () => {
    const same = { name: 'Twin', tokens: { '--accent': '#00ff00' } }
    useSettingsState.setState({
      customThemes: [makeTheme(1, same), makeTheme(2, same)]
    })
    const { container } = renderGallery()
    const keys = customCards(container).map((c) => c.dataset.themeKey)
    expect(keys).toEqual([`custom:${hexId(1)}`, `custom:${hexId(2)}`])
  })

  it('gives a built-in card Duplicate only, with an aria-label naming the theme', () => {
    const { container } = renderGallery()
    const card = container.querySelector('[data-theme-key="dracula"]')
    expect(
      card?.querySelector('[aria-label="Duplicate Dracula"]')
    ).not.toBeNull()
    expect(card?.querySelectorAll('.themeCard__action')).toHaveLength(1)
  })

  it('gives a custom card Edit and Duplicate (and no built-in-only affordance)', () => {
    useSettingsState.setState({ customThemes: [makeTheme(1)] })
    const { container } = renderGallery()
    const card = customCards(container)[0]
    expect(card?.querySelector('[aria-label="Edit Theme 1"]')).not.toBeNull()
    expect(
      card?.querySelector('[aria-label="Duplicate Theme 1"]')
    ).not.toBeNull()
  })

  it('Duplicate adds "<name> copy", does not apply it and opens its editor', () => {
    useSettingsState.setState({ theme: 'marine' })
    const { container, getByTestId } = renderGallery()
    fireEvent.click(
      container.querySelector(
        '[data-theme-key="dracula"] [aria-label="Duplicate Dracula"]'
      ) as HTMLElement
    )
    const { customThemes, theme } = useSettingsState.getState()
    expect(customThemes).toHaveLength(1)
    expect(customThemes[0]?.name).toBe('Dracula copy')
    expect(customThemes[0]?.base).toBe('dracula')
    expect(theme).toBe('marine')
    expect(setThemeStub).not.toHaveBeenCalled()
    expect(getByTestId('editor-probe').textContent).toBe(
      `editor:${customThemes[0]?.id}`
    )
  })

  it('numbers a second copy of the same source', () => {
    const { container } = renderGallery()
    const duplicateDracula = () =>
      fireEvent.click(
        container.querySelector(
          '[data-theme-key="dracula"] [aria-label="Duplicate Dracula"]'
        ) as HTMLElement
      )
    duplicateDracula()
    cleanup()
    const second = renderGallery()
    fireEvent.click(
      second.container.querySelector(
        '[data-theme-key="dracula"] [aria-label="Duplicate Dracula"]'
      ) as HTMLElement
    )
    expect(useSettingsState.getState().customThemes.map((t) => t.name)).toEqual(
      ['Dracula copy', 'Dracula copy 2']
    )
  })

  it('Rename opens the dialog from the card on the current name', () => {
    useSettingsState.setState({ customThemes: [makeTheme(4)] })
    const { container } = renderGallery()
    expect(screen.queryByLabelText('Theme name')).toBeNull()
    fireEvent.click(
      container.querySelector('[aria-label="Rename Theme 4"]') as HTMLElement
    )
    const input = screen.getByLabelText('Theme name') as HTMLInputElement
    expect(input.value).toBe('Theme 4')
    fireEvent.click(screen.getByRole('button', { name: 'Keep name' }))
    expect(screen.queryByLabelText('Theme name')).toBeNull()
  })

  it('Edit navigates to the editor route for that theme', () => {
    useSettingsState.setState({ customThemes: [makeTheme(7)] })
    const { container, getByTestId } = renderGallery()
    fireEvent.click(
      container.querySelector('[aria-label="Edit Theme 7"]') as HTMLElement
    )
    expect(getByTestId('editor-probe').textContent).toBe(`editor:${hexId(7)}`)
  })

  it('refuses Duplicate at the cap with the limit dialog and adds nothing', () => {
    const full = Array.from({ length: MAX_CUSTOM_THEMES }, (_, i) =>
      makeTheme(i + 1)
    )
    useSettingsState.setState({ customThemes: full })
    const { container, queryByTestId } = renderGallery()
    fireEvent.click(
      container.querySelector(
        '[data-theme-key="dracula"] [aria-label="Duplicate Dracula"]'
      ) as HTMLElement
    )
    expect(useSettingsState.getState().customThemes).toHaveLength(
      MAX_CUSTOM_THEMES
    )
    const dialog = useUiState.getState().dialogModalOptions
    expect(dialog.showDialog).toBe(true)
    expect(dialog.title).toBe('Theme limit reached')
    expect(dialog.buttons?.map((b) => b.text)).toEqual(['Close message'])
    expect(queryByTestId('editor-probe')).toBeNull()
  })
})
