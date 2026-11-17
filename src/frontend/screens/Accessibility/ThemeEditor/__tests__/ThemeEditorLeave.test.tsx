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
import useUiState from 'frontend/state/uiState'
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
const storeSetCheckedCalls: unknown[][] = []
// A plain function, not jest.fn(): the jest config resets mock implementations between tests.
let writeResult = true
const storeSetChecked = (...args: unknown[]) => {
  storeSetCheckedCalls.push(args)
  return Promise.resolve(writeResult)
}

const theme: CustomTheme = {
  id: ID,
  name: 'My Nord',
  base: 'nord-light',
  tokens: { '--body-background': '#eceff4', '--accent': '#5e81ac' }
}

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
  storeSetCheckedCalls.length = 0
  writeResult = true
  document.body.className = ''
  document.body.removeAttribute('style')
})

const renderEditor = () => {
  useSettingsState.setState({
    customThemes: [theme],
    theme: 'midnightMirage'
  })
  const router = createMemoryRouter(
    [
      { path: 'accessibility/themes/:id', element: <ThemeEditor /> },
      { path: 'accessibility', element: <p data-testid="appearance">hub</p> },
      { path: 'library', element: <p data-testid="library">library</p> }
    ],
    { initialEntries: [`/accessibility/themes/${ID}`] }
  )
  render(<RouterProvider router={router} />)
  return router
}

const makeDirty = () => {
  const input = screen.getByLabelText('Body background')
  fireEvent.input(input, { target: { value: '#123456' } })
  fireEvent.keyDown(input, { key: 'Enter' })
}

const clickBack = () =>
  act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Back to Appearance' }))
    await Promise.resolve()
  })

const dialog = () => useUiState.getState().dialogModalOptions

// Drives the prompt the way MessageBoxModal does: onClose first, then the button's onClick.
const press = (label: string) => {
  const options = dialog()
  const button = options.buttons?.find((b) => b.text === label)
  return act(async () => {
    options.onClose?.()
    button?.onClick?.()
    await new Promise((r) => setTimeout(r, 0))
  })
}

// Escape, the backdrop and the header X call onClose alone.
const dismiss = () => {
  const options = dialog()
  return act(async () => {
    options.onClose?.()
    await new Promise((r) => setTimeout(r, 0))
  })
}

describe('ThemeEditor leave prompt', () => {
  it('opens one prompt with the three actions, Save theme focused', async () => {
    const router = renderEditor()
    makeDirty()
    await clickBack()
    const options = dialog()
    expect(options.showDialog).toBe(true)
    expect(options.title).toBe('Unsaved changes')
    expect(options.buttons?.map((b) => b.text)).toEqual([
      'Keep editing',
      'Discard changes',
      'Save theme'
    ])
    const save = options.buttons?.[2]
    expect(save?.autoFocus).toBe(true)
    expect(save?.variant).toBe('primary')
    expect(options.buttons?.[0]?.autoFocus).toBeUndefined()
    expect(router.state.location.pathname).toBe(`/accessibility/themes/${ID}`)
  })

  it('Keep editing stays in the editor with the draft intact', async () => {
    const router = renderEditor()
    makeDirty()
    await clickBack()
    await press('Keep editing')
    expect(router.state.location.pathname).toBe(`/accessibility/themes/${ID}`)
    expect(dialog().showDialog).toBe(false)
    expect(
      screen.getByLabelText<HTMLInputElement>('Body background').value
    ).toBe('#123456')
    expect(screen.getByText('Unsaved changes')).toBeTruthy()
  })

  it('Escape, the backdrop and X (onClose alone) also keep editing', async () => {
    const router = renderEditor()
    makeDirty()
    await clickBack()
    await dismiss()
    expect(router.state.location.pathname).toBe(`/accessibility/themes/${ID}`)
    expect(dialog().showDialog).toBe(false)
    // The block was reset, so a second attempt prompts again.
    await clickBack()
    expect(dialog().showDialog).toBe(true)
  })

  it('Discard changes leaves and writes nothing', async () => {
    const router = renderEditor()
    makeDirty()
    await clickBack()
    await press('Discard changes')
    expect(router.state.location.pathname).toBe('/accessibility')
    expect(storeSetCheckedCalls).toHaveLength(0)
  })

  it('Save theme saves, then leaves', async () => {
    const router = renderEditor()
    makeDirty()
    await clickBack()
    await press('Save theme')
    expect(storeSetCheckedCalls).toHaveLength(1)
    expect(router.state.location.pathname).toBe('/accessibility')
  })

  it('a refused Save stays in the editor with the draft dirty', async () => {
    writeResult = false
    const router = renderEditor()
    makeDirty()
    await clickBack()
    await press('Save theme')
    expect(storeSetCheckedCalls).toHaveLength(1)
    expect(router.state.location.pathname).toBe(`/accessibility/themes/${ID}`)
    expect(screen.getByText('Unsaved changes')).toBeTruthy()
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Save theme' })
        .disabled
    ).toBe(false)
  })

  it('any route change shares the prompt, not just Back', async () => {
    const router = renderEditor()
    makeDirty()
    await act(async () => {
      void router.navigate('/library')
      await Promise.resolve()
    })
    expect(dialog().showDialog).toBe(true)
    expect(router.state.location.pathname).toBe(`/accessibility/themes/${ID}`)
    await press('Discard changes')
    expect(router.state.location.pathname).toBe('/library')
  })

  it('leaves at once when nothing changed', async () => {
    const router = renderEditor()
    await clickBack()
    expect(dialog().showDialog).toBe(false)
    expect(router.state.location.pathname).toBe('/accessibility')
  })
})
