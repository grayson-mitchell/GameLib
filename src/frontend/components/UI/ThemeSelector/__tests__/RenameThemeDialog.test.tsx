/**
 * @jest-environment jsdom
 */
import 'frontend/testUtils/jsdomNoticeEnv'

import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { RenameThemeDialog } from '../RenameThemeDialog'
import { StoreEmbedSuppressionProvider } from 'frontend/components/UI/NavShell/StoreEmbedSuppressionContext'
import type { CustomTheme } from 'common/types/customTheme'
import useSettingsState from 'frontend/state/settingsState'
import { resetAllStores } from 'frontend/state/storeKit'

void i18next.use(initReactI18next).init({
  lng: 'en',
  resources: {},
  initImmediate: false,
  interpolation: { escapeValue: false }
})

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
})

afterEach(() => {
  cleanup()
  resetAllStores()
})

const hexId = (n: number) => n.toString(16).padStart(16, '0')
const theme = (n: number, name: string): CustomTheme => ({
  id: hexId(n),
  name,
  base: 'dracula',
  tokens: {}
})

const open = (onClose = jest.fn()) => {
  useSettingsState.setState({
    customThemes: [theme(1, 'Mine'), theme(2, 'Other One')]
  })
  render(
    <StoreEmbedSuppressionProvider>
      <RenameThemeDialog
        open
        themeId={hexId(1)}
        currentName="Mine"
        onClose={onClose}
      />
    </StoreEmbedSuppressionProvider>
  )
  return {
    onClose,
    input: screen.getByLabelText<HTMLInputElement>('Theme name'),
    confirm: () => screen.getByRole('button', { name: 'Rename theme' })
  }
}

const type = (input: HTMLInputElement, value: string) => {
  input.value = value
  fireEvent.input(input)
}

describe('RenameThemeDialog', () => {
  it('renders nothing while closed', () => {
    render(
      <RenameThemeDialog
        open={false}
        themeId={hexId(1)}
        currentName="Mine"
        onClose={jest.fn()}
      />
    )
    expect(screen.queryByLabelText('Theme name')).toBeNull()
  })

  it('opens on the current name, focused and selected, with confirm disabled', () => {
    const { input, confirm } = open()
    expect(input.value).toBe('Mine')
    expect(document.activeElement).toBe(input)
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe(4)
    expect((confirm() as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows the empty error and keeps confirm disabled', () => {
    const { input, confirm } = open()
    type(input, '   ')
    expect(screen.getByText('Enter a name.')).not.toBeNull()
    expect((confirm() as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows the 60-character error for 61 characters and accepts exactly 60', () => {
    const { input, confirm } = open()
    type(input, 'a'.repeat(61))
    expect(screen.getByText('Use 60 characters or fewer.')).not.toBeNull()
    expect((confirm() as HTMLButtonElement).disabled).toBe(true)
    type(input, 'a'.repeat(60))
    expect(screen.queryByText('Use 60 characters or fewer.')).toBeNull()
    expect((confirm() as HTMLButtonElement).disabled).toBe(false)
  })

  it('shows the taken error for a case-different existing name, naming that theme', () => {
    const { input, confirm } = open()
    type(input, 'other one')
    expect(
      screen.getByText('You already have a theme called “Other One”.')
    ).not.toBeNull()
    expect((confirm() as HTMLButtonElement).disabled).toBe(true)
  })

  it('renames through the store and closes on a valid new name', () => {
    const { input, confirm, onClose } = open()
    type(input, '  Fresh  ')
    expect((confirm() as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(confirm())
    expect(useSettingsState.getState().customThemes.map((t) => t.name)).toEqual(
      ['Fresh', 'Other One']
    )
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Keep name closes without renaming', () => {
    const { input, onClose } = open()
    type(input, 'Changed')
    fireEvent.click(screen.getByRole('button', { name: 'Keep name' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(useSettingsState.getState().customThemes[0]?.name).toBe('Mine')
  })

  it('Escape closes the dialog', () => {
    const { onClose } = open()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
