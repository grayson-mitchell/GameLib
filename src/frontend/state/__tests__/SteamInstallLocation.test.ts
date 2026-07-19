/**
 * Unit tests for the SteamInstallLocation store + startSteamInstall wiring
 * (quick 260719-t8t). Reverses the D-09 zero-friction single-library path:
 * startSteamInstall must now ALWAYS open the install window (0, 1 and >1
 * libraries), never installing immediately.
 *
 * No jsdom is installed in this project (see src/frontend/jest.config.js
 * docstring) so the zustand store is exercised directly and window.api is a
 * plain global stub — no DOM/render tree needed.
 */
import { useSteamInstallLocation } from '../SteamInstallLocation'
import { startSteamInstall, installSteamGame } from '../InstallGameModal'
import { GameInfo } from 'common/types'

const listSteamLibraryTargets = jest.fn()
const install = jest.fn()

;(global as unknown as { window: unknown }).window = {
  api: { listSteamLibraryTargets, install }
}

function makeGameInfo(): GameInfo {
  return {
    runner: 'steam',
    app_name: '440',
    art_cover: 'cover.jpg',
    art_square: 'square.jpg',
    install: {},
    is_installed: false,
    title: 'Team Fortress 2',
    canRunOffline: true
  } as unknown as GameInfo
}

const lib = (path: string, isPrimary = false) => ({
  path,
  steamappsDir: `${path}/steamapps`,
  isPrimary
})

describe('startSteamInstall — always opens the install window (t8t)', () => {
  beforeEach(() => {
    listSteamLibraryTargets.mockReset()
    install.mockReset()
    useSteamInstallLocation.setState({
      isOpen: false,
      appName: undefined,
      gameInfo: null,
      libraries: []
    })
  })

  it('opens the store with >1 libraries (multi-library case)', async () => {
    const libs = [lib('/A', true), lib('/B')]
    listSteamLibraryTargets.mockResolvedValue(libs)

    await startSteamInstall('440', makeGameInfo())

    const state = useSteamInstallLocation.getState()
    expect(state.isOpen).toBe(true)
    expect(state.appName).toBe('440')
    expect(state.libraries).toEqual(libs)
    expect(install).not.toHaveBeenCalled()
  })

  it('opens the store with exactly 1 library (no more zero-friction install)', async () => {
    const libs = [lib('/only', true)]
    listSteamLibraryTargets.mockResolvedValue(libs)

    await startSteamInstall('440', makeGameInfo())

    const state = useSteamInstallLocation.getState()
    expect(state.isOpen).toBe(true)
    expect(state.libraries).toEqual(libs)
    // The single library is present so the dialog can pre-select it.
    expect(install).not.toHaveBeenCalled()
  })

  it('opens the store with 0 libraries (native-install opt-in OFF)', async () => {
    listSteamLibraryTargets.mockResolvedValue([])

    await startSteamInstall('440', makeGameInfo())

    const state = useSteamInstallLocation.getState()
    expect(state.isOpen).toBe(true)
    expect(state.libraries).toEqual([])
    expect(install).not.toHaveBeenCalled()
  })

  it('never installs without first opening the window', async () => {
    listSteamLibraryTargets.mockResolvedValue([lib('/only', true)])

    await startSteamInstall('440', makeGameInfo())

    expect(install).not.toHaveBeenCalled()
    expect(useSteamInstallLocation.getState().isOpen).toBe(true)
  })
})

describe('installSteamGame — unchanged confirm call', () => {
  beforeEach(() => install.mockReset())

  it('calls window.api.install with the given path and steam runner', () => {
    installSteamGame('440', makeGameInfo(), '/only')

    expect(install).toHaveBeenCalledWith(
      expect.objectContaining({
        appName: '440',
        path: '/only',
        runner: 'steam'
      })
    )
  })

  it('defaults path to empty string', () => {
    installSteamGame('440', makeGameInfo())

    expect(install).toHaveBeenCalledWith(
      expect.objectContaining({ path: '' })
    )
  })
})
