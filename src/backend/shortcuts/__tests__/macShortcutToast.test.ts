/**
 * Quick task 261027-c4g: key choice for the Electron-era `addShortcut` / `removeShortcut` toasts
 * in `backend/shortcuts/ipc_handler.ts`. On macOS the toast names the Desktop when a Desktop item
 * was made (add: follows the setting) or was on disk before removal (remove: follows the disk).
 *
 * `shortcuts.ts` is left REAL; paths are computed under the jest containment home with
 * `process.platform` forced to darwin, and every path is asserted to sit under `homedir()` before
 * anything is written. Handlers come from `handlerRegistry` because `resetMocks: true` wipes jest.fn
 * captures (see shortcutsExistsFallback.test.ts).
 */

const mockEnv = { isMac: true }
const mockSettings = { addDesktopShortcuts: false }

jest.mock('../../utils', () => ({
  getGame: jest.fn()
}))
jest.mock('backend/dialog/dialog', () => ({
  notify: jest.fn()
}))
jest.mock('backend/constants/environment', () =>
  Object.defineProperty(
    { ...jest.requireActual('backend/constants/environment') },
    'isMac',
    { get: () => mockEnv.isMac, enumerable: true, configurable: true }
  )
)
jest.mock('backend/config', () => ({
  GlobalConfig: {
    get: () => ({ getSettings: () => mockSettings })
  }
}))
jest.mock('../nonesteamgame/nonesteamgame', () => ({
  addNonSteamGame: jest.fn(),
  isAddedToSteam: jest.fn(),
  removeNonSteamGame: jest.fn()
}))
jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  logError: jest.fn(),
  LogPrefix: { Backend: 'Backend' }
}))

import { mkdirSync, rmSync, symlinkSync } from 'fs'
import { dirname } from 'path'
import { homedir } from 'os'
import { getGame } from '../../utils'
import { notify } from 'backend/dialog/dialog'
import { shortcutFiles } from '../shortcuts/shortcuts'
import { handlerRegistry } from 'backend/platform'
import type { GameInfo } from 'common/types'

import '../ipc_handler'

const mockedGetGame = getGame as jest.Mock
const mockedNotify = notify as jest.Mock

const DESKTOP_ADD = 'gamelib:box.shortcuts.messageMacDesktop'
const DESKTOP_REMOVE = 'gamelib:box.shortcuts.messageRemoveMacDesktop'

describe('261027-c4g: ipc_handler.ts mac toast names the Desktop', () => {
  let originalPlatform: string
  const created: string[] = []

  beforeEach(() => {
    originalPlatform = process.platform
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
      configurable: true
    })
    mockEnv.isMac = true
    mockSettings.addDesktopShortcuts = false
  })

  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      configurable: true
    })
    for (const path of created.splice(0)) {
      rmSync(path, { recursive: true, force: true })
    }
  })

  function contained(title: string) {
    const [desktop, menu] = shortcutFiles(title)
    expect(desktop.startsWith(homedir())).toBe(true)
    expect(menu.startsWith(homedir())).toBe(true)
    created.push(desktop, menu)
    return { desktop, menu }
  }

  function fakeGame(
    title: string,
    work: { add?: () => Promise<void>; remove?: () => Promise<void> }
  ) {
    return {
      getGameInfo: () => ({ title }) as GameInfo,
      addShortcuts: jest.fn(work.add ?? (() => Promise.resolve())),
      removeShortcuts: jest.fn(work.remove ?? (() => Promise.resolve()))
    }
  }

  async function runAdd(title: string, toggle: boolean) {
    const { menu } = contained(title)
    mockSettings.addDesktopShortcuts = toggle
    mockedGetGame.mockReturnValue(
      fakeGame(title, {
        add: () => {
          mkdirSync(menu, { recursive: true })
          return Promise.resolve()
        }
      })
    )
    await handlerRegistry.get('addShortcut')?.(null, 'app', 'legendary', true)
    expect(mockedNotify).toHaveBeenCalledTimes(1)
    return mockedNotify.mock.calls[0][0].body
  }

  async function runRemove(
    title: string,
    toggle: boolean,
    desktopLink: boolean
  ) {
    const { desktop, menu } = contained(title)
    mockSettings.addDesktopShortcuts = toggle
    mkdirSync(menu, { recursive: true })
    if (desktopLink) {
      mkdirSync(dirname(desktop), { recursive: true })
      symlinkSync(menu, desktop)
    }
    mockedGetGame.mockReturnValue(
      fakeGame(title, {
        remove: () => {
          rmSync(desktop, { recursive: true, force: true })
          rmSync(menu, { recursive: true, force: true })
          return Promise.resolve()
        }
      })
    )
    await handlerRegistry.get('removeShortcut')?.(null, 'app', 'legendary')
    expect(mockedNotify).toHaveBeenCalledTimes(1)
    return mockedNotify.mock.calls[0][0].body
  }

  it('add, setting on -> Desktop key', async () => {
    expect(await runAdd('261027-c4g Ipc Add On', true)).toBe(DESKTOP_ADD)
  })

  it('add, setting off -> unchanged message-mac key', async () => {
    expect(await runAdd('261027-c4g Ipc Add Off', false)).toBe(
      'box.shortcuts.message-mac'
    )
  })

  it('remove, Desktop link on disk and setting off -> Desktop key', async () => {
    expect(await runRemove('261027-c4g Ipc Rm Link Off', false, true)).toBe(
      DESKTOP_REMOVE
    )
  })

  it('remove, no Desktop item and setting on -> unchanged message-remove-mac key', async () => {
    expect(await runRemove('261027-c4g Ipc Rm NoLink On', true, false)).toBe(
      'box.shortcuts.message-remove-mac'
    )
  })

  it('not macOS -> generic keys whatever the setting', async () => {
    mockEnv.isMac = false
    expect(await runAdd('261027-c4g Ipc Generic Add', true)).toBe(
      'box.shortcuts.message'
    )
    mockedNotify.mockClear()
    expect(await runRemove('261027-c4g Ipc Generic Rm', true, true)).toBe(
      'box.shortcuts.message-remove'
    )
  })
})
