/**
 * Behavioural guard test for `runWineCommandOnGame()` (quick task 260907-f2g).
 *
 * WHY THIS FILE EXISTS
 *
 * `tools/index.ts:896` destructured `{ folder_name, install }` from `game.getGameInfo()` and
 * then dereferenced `install.install_path` with no guard. `SteamGame.getGameInfo()` returns
 * `{} as GameInfo` on a double cache miss (D-01, a deliberate cross-runner sentinel), so
 * `install` can arrive `undefined` and the call rejected with an unhandled
 * `TypeError: Cannot read properties of undefined (reading 'install_path')` -- rather than
 * taking the handled no-op shape its own two neighbouring guards already use.
 *
 * WHY `runner: 'gog'` AND NOT `'steam'`
 *
 * `runWineCommandOnGame` returns early for `runner === 'steam'` (Pitfall 5, tools/index.ts:879)
 * BEFORE it reaches either the `isNative()` check or the deref, so a Steam runner would make
 * every test here vacuous -- green against guarded and unguarded source alike. The
 * bottled-macOS-Steam `isNative() === false` case the filed todo describes is the REACHABILITY
 * argument for a `{}` arriving at this line; `'gog'` is the vehicle that actually executes it.
 *
 * NO EXISTING TEST COVERS THIS FUNCTION'S BODY. `sidecar/__tests__/wineToolsFlows.test.ts` and
 * `sidecar/__tests__/runnerMiscFlows.test.ts` both `jest.mock` it away, and
 * `tools/__tests__/dxvkEvidenceLines.test.ts` is a source-text gate that imports nothing from
 * the module. So this is a new file, not duplication.
 *
 * ON IMPORTABILITY. `dxvkEvidenceLines.test.ts:24-27` asserts in prose that `tools/index.ts`
 * "reaches Electron transitively and must not be imported under the backend jest project".
 * That claim was MEASURED FALSE during 260907-f2g's planning and is measured false again by
 * this file: two `jest.mock` factories -- `'../../storeManagers'` and `'../../launcher'` --
 * suffice, and the module loads in about a second. That docstring was deliberately NOT edited
 * by this task (out of scope) and remains inaccurate.
 */

// Declared before the imports: `jest.mock` factory bodies run at require time, which under
// ts-jest's CommonJS output is after these initializers. `resetMocks: true` is set in
// src/backend/jest.config.js, so every return value is assigned inside a test or beforeEach,
// never at module scope.
const mockGetGame = jest.fn()
const mockRunWineCommand = jest.fn()
const mockLogError = jest.fn()

// `tools/index.ts` reaches libraryManagerMap through a LAZY `await import('../storeManagers')`
// at L889 -- jest.mock intercepts it regardless.
jest.mock('../../storeManagers', () => ({
  libraryManagerMap: {
    gog: {
      getGame: (...args: unknown[]) => mockGetGame(...args)
    }
  }
}))

jest.mock('../../launcher', () => ({
  runWineCommand: (...args: unknown[]) => mockRunWineCommand(...args),
  setupEnvVars: jest.fn(),
  setupWineEnvVars: jest.fn(),
  validWine: jest.fn()
}))

jest.mock('backend/logger', () => {
  // Real LogPrefix -- logger/constants.ts is a plain enum-like object with no side effects,
  // so the guard's `LogPrefix.Gog` is asserted against its true value, not a stand-in.
  const { LogPrefix } = jest.requireActual('backend/logger/constants')
  return {
    LogPrefix,
    logError: (...args: unknown[]) => mockLogError(...args),
    logInfo: jest.fn(),
    logWarning: jest.fn(),
    logDebug: jest.fn()
  }
})

import { runWineCommandOnGame } from '../index'
import { LogPrefix } from 'backend/logger/constants'

const wineArgs = { commandParts: ['winecfg'] }

describe('runWineCommandOnGame guards install.install_path (260907-f2g)', () => {
  beforeEach(() => {
    mockRunWineCommand.mockResolvedValue({ stdout: 'ok', stderr: '' })
  })

  // RED-proven: hand-editing the `if (!install?.install_path)` guard block out of
  // tools/index.ts (leaving `gameInstallPath: install.install_path` as the next deref)
  // turns this test red with, verbatim:
  //   Received promise rejected instead of resolved
  //   Rejected to value: [TypeError: Cannot read properties of undefined (reading 'install_path')]
  test('a non-native game whose getGameInfo returns the {} sentinel returns the no-op shape', async () => {
    mockGetGame.mockReturnValue({
      isNative: () => false,
      getGameInfo: () => ({}),
      getSettings: () => ({})
    })

    await expect(
      runWineCommandOnGame('gog', 'no-install-path', wineArgs)
    ).resolves.toEqual({ stdout: '', stderr: '' })

    expect(mockRunWineCommand).not.toHaveBeenCalled()
    expect(mockLogError).toHaveBeenCalledTimes(1)
    // Redaction posture matches the two adjacent guards: runner + appName, never the path.
    const [message, prefix] = mockLogError.mock.calls[0] as [string, string]
    expect(message).toContain('gog')
    expect(message).toContain('no-install-path')
    expect(prefix).toBe(LogPrefix.Gog)
  })

  // Inverse case -- the guard must not be over-broad. A real install path still gets through.
  test('a non-native game with a real install_path still reaches runWineCommand', async () => {
    mockGetGame.mockReturnValue({
      isNative: () => false,
      getGameInfo: () => ({
        app_name: 'g',
        folder_name: 'Game Folder',
        install: { install_path: '/games/g' }
      }),
      getSettings: () => ({})
    })

    await runWineCommandOnGame('gog', 'g', wineArgs)

    expect(mockRunWineCommand).toHaveBeenCalledTimes(1)
    expect(mockRunWineCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        gameInstallPath: '/games/g',
        installFolderName: 'Game Folder',
        commandParts: ['winecfg']
      })
    )
    expect(mockLogError).not.toHaveBeenCalled()
  })

  // Adjacent-branch parity: pins that the new guard returns the SAME shape as the guard it
  // sits directly next to, so the two cannot drift apart.
  test('the pre-existing isNative() branch still returns the same no-op shape', async () => {
    mockGetGame.mockReturnValue({
      isNative: () => true,
      getGameInfo: () => ({
        app_name: 'g',
        folder_name: 'Game Folder',
        install: { install_path: '/games/g' }
      }),
      getSettings: () => ({})
    })

    await expect(runWineCommandOnGame('gog', 'g', wineArgs)).resolves.toEqual({
      stdout: '',
      stderr: ''
    })

    expect(mockRunWineCommand).not.toHaveBeenCalled()
  })
})
