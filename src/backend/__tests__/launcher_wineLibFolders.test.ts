/**
 * 59-31 H3: setupWineEnvVars must not log "Couldn't find all library folders"
 * on macOS for a wine installation that carries no lib/lib32 (the built-in
 * engine), and its env must be unchanged. Linux keeps the error.
 *
 * Spawns nothing. Platform flags are mocked per case via jest.isolateModules.
 */
import type { GameSettings, WineInstallation } from 'common/types'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  logDebug: jest.fn(),
  LogPrefix: { Backend: 'Backend', Gog: 'Gog', Legendary: 'Legendary' },
  getRunnerLogWriter: jest.fn(),
  createGameLogWriter: jest.fn()
}))

const LIB_ERROR = "Couldn't find all library folders"

function loadWith(platform: { isMac: boolean; isLinux: boolean }) {
  let setup!: (s: GameSettings, id?: string) => Record<string, string>
  let logError!: jest.Mock
  jest.isolateModules(() => {
    jest.doMock('backend/constants/environment', () => ({
      ...jest.requireActual('backend/constants/environment'),
      ...platform
    }))
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    logError = require('backend/logger').logError
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { setupWineEnvVars } = require('backend/launcher')
    // The launcher's path slice is explicit (66.4-17): the flatpak home and the runtime folder.
    setup = (settings, id) =>
      setupWineEnvVars(
        {
          paths: { flatpakHome: '/test/flatpak', runtimePath: '/test/runtime' }
        },
        settings,
        id
      )
  })
  return { setup, logError }
}

const settingsFor = (wineVersion: Partial<WineInstallation>) =>
  ({
    wineVersion: {
      type: 'wine',
      bin: '/pins/bin/wine',
      name: 'Wine-Staging 11.20 + DXVK-macOS 1.10.3 (built-in)',
      wineserver: '/pins/bin/wineserver',
      ...wineVersion
    },
    wineCrossoverBottle: 'GameLibSteamBridge-1',
    enviromentOptions: [],
    preferSystemLibs: false
  }) as unknown as GameSettings

const libErrorLogged = (logError: jest.Mock) =>
  logError.mock.calls.some(([m]) => String(m).includes(LIB_ERROR))

describe('H3: setupWineEnvVars library-folder error', () => {
  it('macOS, wine with no lib paths: no error, env has no LD_LIBRARY_PATH or WINEDLLPATH', () => {
    const { setup, logError } = loadWith({ isMac: true, isLinux: false })
    const env = setup(settingsFor({}))
    expect(libErrorLogged(logError)).toBe(false)
    expect(env).not.toHaveProperty('LD_LIBRARY_PATH')
    expect(env).not.toHaveProperty('WINEDLLPATH')
  })

  it('macOS, wine with lib and lib32: LD_LIBRARY_PATH is set as before', () => {
    const { setup, logError } = loadWith({ isMac: true, isLinux: false })
    const env = setup(settingsFor({ lib: '/pins/lib', lib32: '/pins/lib32' }))
    expect(libErrorLogged(logError)).toBe(false)
    expect(env.LD_LIBRARY_PATH).toContain('/pins/lib:/pins/lib32')
  })

  it('Linux, wine with no lib paths: the error is still logged', () => {
    const { setup, logError } = loadWith({ isMac: false, isLinux: true })
    setup(settingsFor({}))
    expect(libErrorLogged(logError)).toBe(true)
  })
})
