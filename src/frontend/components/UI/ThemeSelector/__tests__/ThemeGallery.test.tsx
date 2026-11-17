/**
 * @jest-environment jsdom
 */
import 'frontend/testUtils/jsdomNoticeEnv'

import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { ThemeSelector } from '../index'
import { defaultThemes } from '../themeLabels'
import { BUILTIN_TOKENS } from 'frontend/customThemes/builtinTokens'
import useSettingsState from 'frontend/state/settingsState'
import { resetAllStores } from 'frontend/state/storeKit'

void i18next.use(initReactI18next).init({
  lng: 'en',
  resources: {},
  initImmediate: false
})

const setThemeStub = jest.fn()

beforeEach(() => {
  Object.assign(window, {
    setTheme: setThemeStub,
    api: {
      storeNew: () => undefined,
      storeGet: (_name: string, _key: string, dflt?: unknown) => dflt,
      storeSet: () => undefined,
      storeSetChecked: () => Promise.resolve(true)
    }
  })
})

afterEach(() => {
  cleanup()
  resetAllStores()
  setThemeStub.mockReset()
})

const renderGallery = () =>
  render(
    <MemoryRouter>
      <ThemeSelector />
    </MemoryRouter>
  )

const keys = Object.keys(defaultThemes)

describe('ThemeSelector gallery', () => {
  it('shows all 10 built-in themes in defaultThemes order inside the Built-in group', () => {
    const { container, getByRole } = renderGallery()
    const group = getByRole('group', { name: 'Built-in' })
    const cards = Array.from(
      group.querySelectorAll<HTMLElement>('[data-theme-key]')
    )
    expect(cards).toHaveLength(10)
    expect(cards.map((c) => c.dataset.themeKey)).toEqual(keys)
    expect(container.querySelectorAll('[data-theme-key]')).toHaveLength(10)
  })

  it('marks only the stored theme as current', () => {
    useSettingsState.setState({ theme: 'dracula' })
    const { container } = renderGallery()
    const current = container.querySelectorAll('[aria-current="true"]')
    expect(current).toHaveLength(1)
    expect(
      current[0]?.closest<HTMLElement>('[data-theme-key]')?.dataset.themeKey
    ).toBe('dracula')
  })

  it('applies a theme when its card is clicked', () => {
    const { container } = renderGallery()
    const apply = container.querySelector<HTMLButtonElement>(
      '[data-theme-key="dracula"] button'
    )
    expect(apply).not.toBeNull()
    fireEvent.click(apply as HTMLButtonElement)
    expect(useSettingsState.getState().theme).toBe('dracula')
    expect(setThemeStub).toHaveBeenCalledWith('dracula')
  })

  it('draws the dracula navbar from its own token, lighter than its body', () => {
    const { container } = renderGallery()
    const part = (name: string) =>
      container
        .querySelector('[data-theme-key="dracula"]')
        ?.querySelector(`[data-part="${name}"]`)
        ?.getAttribute('fill')
    const navbar = BUILTIN_TOKENS['dracula']?.['--navbar-background']
    expect(part('tab-bar')).toBe(navbar)
    expect(part('tab-bar')).not.toBe(part('body'))
  })

  it('no longer renders the dropdown id', () => {
    const { container } = renderGallery()
    expect(container.querySelector('#theme_selector')).toBeNull()
    expect(document.getElementById('theme_selector')).toBeNull()
  })
})
