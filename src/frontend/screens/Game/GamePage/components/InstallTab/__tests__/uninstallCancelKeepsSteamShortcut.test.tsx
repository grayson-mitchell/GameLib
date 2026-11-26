/**
 * @jest-environment jsdom
 */
import 'frontend/testUtils/jsdomNoticeEnv'

import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GameInfo } from 'common/types'
import type { GameContextType } from 'frontend/types'
import { StoreEmbedSuppressionProvider } from 'frontend/components/UI/NavShell/StoreEmbedSuppressionContext'
import useUiState from 'frontend/state/uiState'
import { resetAllStores } from 'frontend/state/storeKit'
import { tauriGamepadAction } from 'preload/api/tauriGamepadInput'
import { installActionGates } from '../../../actions/installActionGates'
import DangerZone from '../DangerZone'
import IntegrationRows from '../IntegrationRows'

/**
 * RF3 (87-74, debug session rf3-cancel-removes-shortcut): Cancel in the
 * uninstall dialog removed the game's Steam shortcut in re-run 1.
 *
 * The real components are composed here the way the Install tab composes them:
 * the Show in Steam row (`IntegrationRows`) and the danger zone that owns the
 * `UninstallModal` (`DangerZone`), through the real `Dialog` primitive, with the
 * real `tauriGamepadAction` behind `window.api.gamepadAction` (the dialog's
 * mount hack moves DOM focus with it). Only the backend (`window.api`) is faked,
 * so a `removeFromSteam` call is exactly the call that removes the shortcut.
 *
 * jsdom has no layout, so every rect is stubbed to a non-zero box: without it the
 * real `doTab` finds no focusable element and the hack would be a no-op.
 *
 * Status: the first describe is green at HEAD. RF3 was seen once live and is NOT
 * reproduced here, so it pins the contract (a close path never reaches the Show in
 * Steam row, T-87-143) rather than proving a fix. The positive control shows the
 * harness can see a removal. What jsdom cannot model (a second click event, key
 * repeat, WebKit's hit-testing and focus) is the open part of the investigation in
 * `.planning/debug/rf3-cancel-removes-shortcut.md`.
 *
 * The second describe is the hardening the user chose when the live probe (11
 * Cancels, mouse) did not reproduce it. First, provenance logging: one line on
 * every add/remove from the Show in Steam row, naming the event that did it.
 */

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      key: string,
      second?: string | ({ defaultValue?: string } & Record<string, unknown>)
    ) => {
      const known: Record<string, string> = { 'box.yes': 'Yes', 'box.no': 'No' }
      if (typeof second === 'string') return second
      const { defaultValue, ...vars } = second ?? {}
      return (defaultValue ?? known[key] ?? key).replace(
        /\{\{(\w+)\}\}/g,
        (_m, name: string) => String(vars[name])
      )
    }
  })
}))

const APP_NAME = 'trash-goblin'
const BOTTLE = 'GameLib-legendary-54f7949350c949c6a2c47f12e7b15636'

const gameInfo = {
  app_name: APP_NAME,
  runner: 'legendary',
  title: 'Trash Goblin',
  is_installed: true,
  install: { platform: 'Windows', install_size: '1 GB' }
} as unknown as GameInfo

const gates = installActionGates({
  is: {} as GameContextType['is'],
  runner: 'legendary',
  isInstalled: true,
  isThirdPartyManaged: false,
  hasWinePrefix: true,
  hasChangelog: false,
  cloudSavesAvailable: false
})

const api = {
  isAddedToSteam: jest.fn(),
  shortcutsExists: jest.fn(),
  removeFromSteam: jest.fn(),
  addToSteam: jest.fn(),
  uninstall: jest.fn(),
  getGameInfo: jest.fn(),
  isNative: jest.fn(),
  getGameSettings: jest.fn(),
  requestGameSettings: jest.fn(),
  getPerGameBottleName: jest.fn(),
  getSteamDeleteRoute: jest.fn(),
  logError: jest.fn(),
  logInfo: jest.fn()
}

let rectSpy: jest.SpyInstance

beforeEach(() => {
  api.isAddedToSteam.mockResolvedValue(true)
  api.shortcutsExists.mockResolvedValue(false)
  api.removeFromSteam.mockResolvedValue(undefined)
  api.addToSteam.mockResolvedValue(true)
  api.uninstall.mockResolvedValue(undefined)
  api.getGameInfo.mockResolvedValue(gameInfo)
  api.isNative.mockResolvedValue(false)
  api.getGameSettings.mockResolvedValue({
    winePrefix: '/Users/x/Games/GameLib/Prefixes/shared',
    wineCrossoverBottle: BOTTLE
  })
  api.requestGameSettings.mockResolvedValue({
    winePrefix: '/Users/x/Games/GameLib/Prefixes/shared'
  })
  api.getPerGameBottleName.mockResolvedValue(BOTTLE)
  api.getSteamDeleteRoute.mockResolvedValue({ gamelibDelete: false })
  Object.assign(window, {
    api: {
      ...api,
      storeNew: () => undefined,
      storeGet: (_name: string, _key: string, dflt?: unknown) => dflt,
      storeSet: () => undefined,
      storeSetChecked: () => Promise.resolve(true),
      gamepadAction: tauriGamepadAction
    }
  })
  rectSpy = jest
    .spyOn(Element.prototype, 'getBoundingClientRect')
    .mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 100,
      bottom: 20,
      width: 100,
      height: 20,
      toJSON: () => ({})
    } as DOMRect)
  useUiState.setState({ platform: 'darwin' })
})

afterEach(() => {
  cleanup()
  rectSpy.mockRestore()
  resetAllStores()
})

function Page({ children }: { children?: ReactNode }) {
  return (
    <MemoryRouter>
      <StoreEmbedSuppressionProvider>
        <IntegrationRows gameInfo={gameInfo} platform="darwin" />
        <DangerZone gameInfo={gameInfo} gates={gates} />
        {children}
      </StoreEmbedSuppressionProvider>
    </MemoryRouter>
  )
}

const steamRow = () => screen.getByRole('switch', { name: 'Show in Steam' })
const noButton = () => screen.getByRole('button', { name: 'No' })

async function renderPageWithShortcutOn() {
  render(<Page />)
  await waitFor(() =>
    expect(steamRow().getAttribute('aria-checked')).toBe('true')
  )
}

async function openUninstallDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /^Uninstall/ }))
  await screen.findByRole('button', { name: 'No' })
}

function expectNoSteamChange() {
  expect(api.removeFromSteam).not.toHaveBeenCalled()
  expect(api.addToSteam).not.toHaveBeenCalled()
  expect(api.uninstall).not.toHaveBeenCalled()
  expect(steamRow().getAttribute('aria-checked')).toBe('true')
}

describe('RF3: the uninstall dialog closes without touching the Steam shortcut', () => {
  it('positive control: a click on the Show in Steam row does remove the shortcut', async () => {
    const user = userEvent.setup()
    await renderPageWithShortcutOn()
    await user.click(steamRow())
    await waitFor(() => expect(api.removeFromSteam).toHaveBeenCalledTimes(1))
    expect(api.removeFromSteam).toHaveBeenCalledWith(APP_NAME, 'legendary')
  })

  it('one full mouse click on No changes nothing', async () => {
    const user = userEvent.setup()
    await renderPageWithShortcutOn()
    await openUninstallDialog(user)
    await user.click(noButton())
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'No' })).toBeNull()
    )
    // Let any deferred work (focus restore, effects, the 500 ms transition) land.
    await act(() => new Promise((resolve) => setTimeout(resolve, 600)))
    expectNoSteamChange()
  })

  it('the same click with focus already on the Show in Steam row (left there by an earlier click) changes nothing', async () => {
    const user = userEvent.setup()
    await renderPageWithShortcutOn()
    act(() => steamRow().focus())
    await openUninstallDialog(user)
    await user.click(noButton())
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'No' })).toBeNull()
    )
    await act(() => new Promise((resolve) => setTimeout(resolve, 600)))
    expectNoSteamChange()
  })

  it('every other close path (header close, Escape, backdrop) changes nothing', async () => {
    const user = userEvent.setup()
    await renderPageWithShortcutOn()

    await openUninstallDialog(user)
    await user.click(screen.getByRole('button', { name: 'close' }))
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'No' })).toBeNull()
    )

    await openUninstallDialog(user)
    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'No' })).toBeNull()
    )

    await openUninstallDialog(user)
    const container = document.querySelector('.MuiDialog-container')
    if (!container) throw new Error('no dialog container')
    fireEvent.mouseDown(container)
    fireEvent.click(container)
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'No' })).toBeNull()
    )

    await act(() => new Promise((resolve) => setTimeout(resolve, 600)))
    expectNoSteamChange()
  })
})

// A dialog's close starts a 500 ms stale-click window on switch rows. Every test
// that closes a dialog settles past it, so the next test starts outside it.
const settle = () =>
  act(() => new Promise((resolve) => setTimeout(resolve, 600)))

const loggedLines = () => api.logInfo.mock.calls.map(([line]) => String(line))
const steamActivationLines = () =>
  loggedLines().filter((line) =>
    line.startsWith('[Shortcuts] Show in Steam activation:')
  )

async function closeUninstallDialogWithNo(
  user: ReturnType<typeof userEvent.setup>
) {
  await openUninstallDialog(user)
  await user.click(noButton())
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'No' })).toBeNull()
  )
}

describe('RF3 hardening: provenance logging', () => {
  it('logs one provenance line for a pointer click that removes the shortcut', async () => {
    const user = userEvent.setup()
    await renderPageWithShortcutOn()
    await user.click(steamRow())
    await waitFor(() => expect(api.removeFromSteam).toHaveBeenCalledTimes(1))
    const lines = steamActivationLines()
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatch(
      /^\[Shortcuts\] Show in Steam activation: action=remove event=click trusted=(true|false) detail=1 key=- repeat=false sinceDialogCloseMs=(none|\d+) appName=trash-goblin runner=legendary$/
    )
  })

  it('logs the key, repeat flag and event type for a keyboard activation', async () => {
    await renderPageWithShortcutOn()
    fireEvent.keyDown(steamRow(), { key: 'Enter' })
    await waitFor(() => expect(api.removeFromSteam).toHaveBeenCalledTimes(1))
    const lines = steamActivationLines()
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatch(
      /action=remove event=keydown trusted=(true|false) detail=0 key=Enter repeat=false /
    )
  })

  it('reports the ms since the last dialog closed, and an add reads action=add', async () => {
    const user = userEvent.setup()
    api.isAddedToSteam.mockResolvedValue(false)
    render(<Page />)
    await waitFor(() =>
      expect(steamRow().getAttribute('aria-checked')).toBe('false')
    )
    await closeUninstallDialogWithNo(user)
    await settle()
    await user.click(steamRow())
    await waitFor(() => expect(api.addToSteam).toHaveBeenCalledTimes(1))
    const line = steamActivationLines()[0] ?? ''
    expect(line).toContain('action=add event=click')
    const since = /sinceDialogCloseMs=(\d+)/.exec(line)
    expect(since).not.toBeNull()
    expect(Number(since?.[1])).toBeGreaterThanOrEqual(500)
  })
})
