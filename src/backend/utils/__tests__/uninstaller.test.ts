/**
 * quick 261026-avw: removeFixFile covers Steam and only ever removes the
 * downloaded `<app>-<store>.json` direct child of fixesPath.
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'

jest.mock('backend/constants/paths', () => {
  const path = jest.requireActual('path')
  const os = jest.requireActual('os')
  const base = path.join(os.tmpdir(), `gamelib-uninstaller-test-${process.pid}`)
  return {
    defaultWinePrefix: path.join(base, 'prefix'),
    fixesPath: path.join(base, 'fixes'),
    localFixesPath: path.join(base, 'fixes', 'local'),
    gamesConfigPath: path.join(base, 'games')
  }
})
jest.mock('backend/config', () => ({ GlobalConfig: { get: jest.fn() } }))
jest.mock('backend/dialog/dialog', () => ({ notify: jest.fn() }))
jest.mock('backend/utils', () => ({ sendGameStatusUpdate: jest.fn() }))
jest.mock('backend/utils/gameTitle', () => ({ resolveGameTitle: jest.fn() }))
jest.mock('backend/platform', () => ({ Event: {} }))
jest.mock('backend/logger', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Backend: 'Backend' }
}))
jest.mock('i18next', () => ({ t: jest.fn((_k: string, d: string) => d) }))

import { removeFixFile, uninstallGameCallback } from '../uninstaller'
import { notify } from 'backend/dialog/dialog'
import { logInfo } from 'backend/logger'
// The managers arrive by deps now: a plain map the tests fill in per case.
const libraryManagerMap = {} as Record<string, unknown>
const deps = {
  libraryManagers: libraryManagerMap
} as unknown as Parameters<typeof uninstallGameCallback>[0]
import { sendGameStatusUpdate } from 'backend/utils'
import {
  fixesPath,
  gamesConfigPath,
  localFixesPath
} from 'backend/constants/paths'

const infoText = () =>
  (logInfo as jest.Mock).mock.calls
    .flat()
    .map((a) => String(a))
    .join('\n')

beforeEach(() => {
  rmSync(join(fixesPath, '..'), { recursive: true, force: true })
  mkdirSync(localFixesPath, { recursive: true })
})

afterAll(() => {
  rmSync(join(fixesPath, '..'), { recursive: true, force: true })
})

describe('removeFixFile', () => {
  it.each([
    ['284100', 'steam', 'steam'],
    ['1207658930', 'gog', 'gog']
  ] as const)('deletes the downloaded %s file only', (app, runner, store) => {
    const downloaded = join(fixesPath, `${app}-${store}.json`)
    const local = join(localFixesPath, `${app}-${store}.json`)
    const profile = join(fixesPath, `${app}-${store}.profile.json`)
    writeFileSync(downloaded, '{}')
    writeFileSync(local, '{}')
    writeFileSync(profile, '{}')

    removeFixFile(app, runner)

    expect(existsSync(downloaded)).toBe(false)
    expect(existsSync(local)).toBe(true)
    expect(existsSync(profile)).toBe(true)
  })

  it('sideload deletes nothing and does not throw', () => {
    const stray = join(fixesPath, 'x-undefined.json')
    writeFileSync(stray, '{}')
    expect(() => removeFixFile('x', 'sideload')).not.toThrow()
    expect(existsSync(stray)).toBe(true)
  })

  it('a missing file does not throw', () => {
    expect(() => removeFixFile('nope', 'steam')).not.toThrow()
  })
})

describe('uninstallGameCallback refusal (quick 261107-td5)', () => {
  const APP = '264160'
  const getSettings = jest.fn()
  const uninstall = jest.fn()

  const setup = () => {
    mkdirSync(gamesConfigPath, { recursive: true })
    const settings = join(gamesConfigPath, `${APP}.json`)
    const fix = join(fixesPath, `${APP}-steam.json`)
    writeFileSync(settings, '{}')
    writeFileSync(fix, '{}')
    return { settings, fix }
  }
  const statuses = () =>
    (sendGameStatusUpdate as jest.Mock).mock.calls.map((c) => c[0].status)

  beforeEach(() => {
    jest.clearAllMocks()
    libraryManagerMap.steam = {
      getGame: () => ({ uninstall, getSettings })
    }
  })

  it('a refused uninstall keeps settings, prefix and fix file, sends done, no notify', async () => {
    const { settings, fix } = setup()
    uninstall.mockResolvedValue({
      stdout: '',
      stderr: 'Refused: sentinel-reason',
      refused: true
    })

    await uninstallGameCallback(deps, {} as any, APP, 'steam', true, true)

    expect(existsSync(settings)).toBe(true)
    expect(existsSync(fix)).toBe(true)
    expect(getSettings).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
    expect(statuses()).toEqual(['uninstalling', 'done'])
    // quick 261110-uog: the stderr text never reaches logInfo
    expect(infoText()).not.toContain('sentinel-reason')
    expect(infoText()).toContain('Uninstall refused; keeping settings')
  })

  it('an unflagged success still cleans up and sends no done for steam', async () => {
    const { settings, fix } = setup()
    uninstall.mockResolvedValue({ stdout: '', stderr: '' })
    getSettings.mockResolvedValue({ winePrefix: join(gamesConfigPath, 'nope') })

    await uninstallGameCallback(deps, {} as any, APP, 'steam', false, true)

    expect(existsSync(settings)).toBe(false)
    expect(existsSync(fix)).toBe(false)
    expect(statuses()).toEqual(['uninstalling'])
  })

  it('a throwing uninstall still raises the generic error notify', async () => {
    const { settings } = setup()
    uninstall.mockRejectedValue(new Error('boom'))

    await uninstallGameCallback(deps, {} as any, APP, 'steam', false, true)

    expect(notify).toHaveBeenCalledTimes(1)
    expect(existsSync(settings)).toBe(true)
  })
})

describe('uninstallGameCallback failure (quick 261108-anw)', () => {
  const APP = '264160'
  const getSettings = jest.fn()
  const uninstall = jest.fn()
  const statuses = () =>
    (sendGameStatusUpdate as jest.Mock).mock.calls.map((c) => c[0].status)

  beforeEach(() => {
    jest.clearAllMocks()
    libraryManagerMap.steam = {
      getGame: () => ({ uninstall, getSettings })
    }
    libraryManagerMap.legendary = {
      getGame: () => ({ uninstall, getSettings })
    }
  })

  it.each(['steam', 'legendary'] as const)(
    'a failed %s uninstall keeps settings and fix file, one done, no notify',
    async (runner) => {
      mkdirSync(gamesConfigPath, { recursive: true })
      const settings = join(gamesConfigPath, `${APP}.json`)
      const fix = join(
        fixesPath,
        `${APP}-${runner === 'steam' ? 'steam' : 'epic'}.json`
      )
      writeFileSync(settings, '{}')
      writeFileSync(fix, '{}')
      uninstall.mockResolvedValue({
        stdout: '',
        stderr: 'Failed to remove x',
        failed: true
      })

      await uninstallGameCallback(deps, {} as any, APP, runner, true, true)

      expect(existsSync(settings)).toBe(true)
      expect(existsSync(fix)).toBe(true)
      expect(getSettings).not.toHaveBeenCalled()
      expect(notify).not.toHaveBeenCalled()
      expect(statuses()).toEqual(['uninstalling', 'done'])
      // quick 261110-uog: the stderr text never reaches logInfo
      expect(infoText()).not.toContain('Failed to remove x')
      expect(infoText()).toContain('Uninstall failed; keeping settings')
    }
  )
})
