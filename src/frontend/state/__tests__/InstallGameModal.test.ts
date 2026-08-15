/**
 * Unit tests for the Steam install-time store rewrite (34.13-08, D-21..D-28)
 * — the two-entry-point split: `startSteamQuickInstall` (D-23's one-click
 * default, with D-24's local-validity degrade) and `openSteamInstallOptions`
 * (D-25's synchronous, zero-IPC options door).
 *
 * (a) No jsdom / react-test-renderer is installed in this project (see
 * src/frontend/jest.config.js docstring) — this store is a plain zustand
 * module and is exercised directly via getState()/setState()/direct function
 * calls, never rendered. Nothing here mounts a component or touches a DOM.
 *
 * (b) VACUITY BOUNDARY, stated not assumed: every assertion below proves a
 * STORE transition or a plain-function return value. A green run is NOT
 * evidence that any dialog renders, that the caret is visible, or that a
 * gamepad reaches it — `InstallModal/index.tsx` has no Steam branch until
 * 34.13-12, so between this wave and wave 6 `isOpen` flipping to `true`
 * renders NOTHING. That gap belongs to 34.13-13's blocking manual gate
 * (`34.13-VALIDATION.md` vacuous-assertion risk 1 and the gamepad row).
 *
 * (c) Group C's synchronous assertions exist because D-25's whole point is
 * the ABSENCE of an await between the "Install with options…" click and the
 * store flip — a spec that awaits the call cannot distinguish a synchronous
 * flip from one that lands a microtask later, and the difference is exactly
 * the dead-click hazard D-25 exists to remove.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

import { GameInfo, DiskSpaceData, Runner } from 'common/types'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

import {
  useInstallGameModal,
  installSteamGame,
  startSteamQuickInstall,
  openSteamInstallOptions,
  openInstallGameModal,
  closeInstallGameModal,
  resolveQuickInstallTarget,
  evaluateQuickInstallTarget,
  LOW_SPACE_FLOOR_BYTES
} from '../InstallGameModal'
import type { SteamInstallLibraryTarget } from '../InstallGameModal'

function makeGameInfo(overrides: Partial<GameInfo> = {}): GameInfo {
  return {
    runner: 'steam',
    app_name: '570',
    art_cover: '',
    art_square: '',
    install: {},
    is_installed: false,
    title: 'Dota 2',
    canRunOffline: true,
    ...overrides
  }
}

function makeTargets(n: number): SteamInstallLibraryTarget[] {
  return Array.from({ length: n }, (_, i) => ({
    path: `/steam/library-${i}`,
    steamappsDir: `/steam/library-${i}/steamapps`,
    isPrimary: i === 0
  }))
}

function makeDisk(overrides: Partial<DiskSpaceData> = {}): DiskSpaceData {
  return {
    free: LOW_SPACE_FLOOR_BYTES,
    diskSize: LOW_SPACE_FLOOR_BYTES * 10,
    message: '',
    validPath: true,
    validFlatpakPath: true,
    ...overrides
  }
}

let installMock: jest.Mock
let listSteamLibraryTargetsMock: jest.Mock
let checkDiskSpaceMock: jest.Mock

/** The established idiom for stubbing `window` in this node-env project
 * (`hasStatus.reconcile.test.ts:99-110`). Called fresh in `beforeEach` so
 * `resetMocks: true`'s per-test mock reset stays paired with a matching
 * per-test `window.api` shape. */
function stubWindowApi() {
  installMock = jest.fn().mockResolvedValue(undefined)
  listSteamLibraryTargetsMock = jest.fn().mockResolvedValue([])
  checkDiskSpaceMock = jest.fn().mockResolvedValue(makeDisk())
  ;(global as unknown as { window: unknown }).window = {
    api: {
      install: installMock,
      listSteamLibraryTargets: listSteamLibraryTargetsMock,
      checkDiskSpace: checkDiskSpaceMock
    }
  }
}

function resetStore() {
  useInstallGameModal.setState({
    isOpen: false,
    appName: undefined,
    runner: undefined,
    gameInfo: null,
    action: 'install',
    steamDegrade: undefined
  })
}

beforeEach(() => {
  stubWindowApi()
  resetStore()
})

afterEach(() => {
  delete (global as unknown as { window?: unknown }).window
  resetStore()
})

// ---------------------------------------------------------------------------
// Group A — the pure D-24 decision (no store, no IPC).
// ---------------------------------------------------------------------------
describe('Group A: the pure D-24 decision', () => {
  it('A1: resolveQuickInstallTarget returns the isPrimary entry when one exists', () => {
    const targets = makeTargets(3)
    expect(resolveQuickInstallTarget(targets)).toBe(targets[0])
  })

  it('A2: resolveQuickInstallTarget falls back to index 0 when NO entry is flagged isPrimary, and returns undefined for []', () => {
    const targets = makeTargets(2).map((t) => ({ ...t, isPrimary: false }))
    expect(resolveQuickInstallTarget(targets)).toBe(targets[0])
    expect(resolveQuickInstallTarget([])).toBeUndefined()
  })

  it('A3: evaluateQuickInstallTarget with validPath: false → not ok, reason library-missing', () => {
    const target = makeTargets(1)[0]
    const result = evaluateQuickInstallTarget(
      target,
      makeDisk({ validPath: false }),
      1
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.degrade.reason).toBe('library-missing')
    }
  })

  it('A4: free space boundary is asserted on BOTH sides of LOW_SPACE_FLOOR_BYTES', () => {
    const target = makeTargets(1)[0]
    const belowFloor = evaluateQuickInstallTarget(
      target,
      makeDisk({ free: LOW_SPACE_FLOOR_BYTES - 1 }),
      1
    )
    expect(belowFloor.ok).toBe(false)
    if (!belowFloor.ok) {
      expect(belowFloor.degrade.reason).toBe('library-full')
    }

    const atFloor = evaluateQuickInstallTarget(
      target,
      makeDisk({ free: LOW_SPACE_FLOOR_BYTES }),
      1
    )
    expect(atFloor.ok).toBe(true)
  })

  it('A5: DISCRIMINATOR: an UNKNOWN disk verdict is not a failed one', () => {
    const target = makeTargets(1)[0]
    const result = evaluateQuickInstallTarget(target, undefined, 1)
    expect(result.ok).toBe(true)
  })

  it.each([0, 1, 2])(
    'A6: the degrade record carries libraryPath, freeBytes, and onlyLibrary computed from libraryCount=%i',
    (libraryCount) => {
      const target = makeTargets(1)[0]
      const disk = makeDisk({ validPath: false, free: 42 })
      const result = evaluateQuickInstallTarget(target, disk, libraryCount)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.degrade.libraryPath).toBe(target.path)
        expect(result.degrade.freeBytes).toBe(42)
        expect(result.degrade.onlyLibrary).toBe(libraryCount <= 1)
      }
    }
  )

  it('A7: LOW_SPACE_FLOOR_BYTES is exactly 1024 ** 3', () => {
    expect(LOW_SPACE_FLOOR_BYTES).toBe(1024 ** 3)
  })
})

// ---------------------------------------------------------------------------
// Group B — startSteamQuickInstall (D-23).
// ---------------------------------------------------------------------------
describe('Group B: startSteamQuickInstall', () => {
  it('B1: 0 libraries → delegated install, no disk probe', async () => {
    listSteamLibraryTargetsMock.mockResolvedValue([])
    await startSteamQuickInstall('570', makeGameInfo())

    expect(checkDiskSpaceMock).not.toHaveBeenCalled()
    expect(installMock).toHaveBeenCalledTimes(1)
    expect(useInstallGameModal.getState().isOpen).toBe(false)
  })

  it('B2: 1 valid library → installs, no dialog', async () => {
    listSteamLibraryTargetsMock.mockResolvedValue(makeTargets(1))
    checkDiskSpaceMock.mockResolvedValue(makeDisk())
    await startSteamQuickInstall('570', makeGameInfo())

    expect(installMock).toHaveBeenCalledTimes(1)
    const arg = installMock.mock.calls[0][0]
    expect(arg.path).toBe('')
    expect(arg.runner).toBe('steam')
    expect(arg.platformToInstall).toBe('Windows')
    expect(arg.steamForceWindowsViaBottle).not.toBe(true)
    expect(useInstallGameModal.getState().isOpen).toBe(false)
  })

  it('B3: 2 valid libraries → still installs, still no dialog (D-22 trigger is gone)', async () => {
    listSteamLibraryTargetsMock.mockResolvedValue(makeTargets(2))
    checkDiskSpaceMock.mockResolvedValue(makeDisk())
    await startSteamQuickInstall('570', makeGameInfo())

    expect(installMock).toHaveBeenCalledTimes(1)
    expect(useInstallGameModal.getState().isOpen).toBe(false)
  })

  it('B4: DISCRIMINATOR: quick install passes NO path (RESEARCH Q1 — a forwarded target.path would create a second, driftable definition of "primary")', async () => {
    const targets = makeTargets(2)
    listSteamLibraryTargetsMock.mockResolvedValue(targets)
    checkDiskSpaceMock.mockResolvedValue(makeDisk())
    await startSteamQuickInstall('570', makeGameInfo())

    const arg = installMock.mock.calls[0][0]
    expect(arg.path).toBe('')
    expect(arg.path).not.toBe(targets[0].path)
    expect(arg.path).not.toBe(targets[1].path)
  })

  it('B5: probes the RESOLVED primary steamappsDir, never .path', async () => {
    const targets = makeTargets(2)
    listSteamLibraryTargetsMock.mockResolvedValue(targets)
    checkDiskSpaceMock.mockResolvedValue(makeDisk())
    await startSteamQuickInstall('570', makeGameInfo())

    expect(checkDiskSpaceMock).toHaveBeenCalledTimes(1)
    expect(checkDiskSpaceMock).toHaveBeenCalledWith(targets[0].steamappsDir)
  })

  it('B6: rejected listSteamLibraryTargets → installs anyway (delegated path)', async () => {
    listSteamLibraryTargetsMock.mockRejectedValue(new Error('IPC down'))
    await startSteamQuickInstall('570', makeGameInfo())

    expect(installMock).toHaveBeenCalledTimes(1)
    expect(useInstallGameModal.getState().isOpen).toBe(false)
  })

  it('B7: rejected checkDiskSpace → installs anyway (fail-open, mirrors A5)', async () => {
    listSteamLibraryTargetsMock.mockResolvedValue(makeTargets(1))
    checkDiskSpaceMock.mockRejectedValue(new Error('probe failed'))
    await startSteamQuickInstall('570', makeGameInfo())

    expect(installMock).toHaveBeenCalledTimes(1)
    expect(useInstallGameModal.getState().isOpen).toBe(false)
  })

  it('B8: startSteamQuickInstall never rejects, even when both channels reject', async () => {
    listSteamLibraryTargetsMock.mockRejectedValue(new Error('a'))
    checkDiskSpaceMock.mockRejectedValue(new Error('b'))

    await expect(
      startSteamQuickInstall('570', makeGameInfo())
    ).resolves.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Group C — openSteamInstallOptions (D-25) and the degrade (D-24).
// ---------------------------------------------------------------------------
describe('Group C: openSteamInstallOptions', () => {
  it('C1: opens SYNCHRONOUSLY — no await between the call and isOpen', () => {
    const gameInfo = makeGameInfo()
    openSteamInstallOptions('570', gameInfo)

    expect(useInstallGameModal.getState().isOpen).toBe(true)
    expect(useInstallGameModal.getState().runner).toBe('steam')
    expect(useInstallGameModal.getState().action).toBe('install')
    expect(useInstallGameModal.getState().appName).toBe('570')
    expect(useInstallGameModal.getState().gameInfo).toBe(gameInfo)
  })

  it('C2: the options path performs ZERO IPC', () => {
    openSteamInstallOptions('570', makeGameInfo())

    expect(listSteamLibraryTargetsMock).toHaveBeenCalledTimes(0)
    expect(checkDiskSpaceMock).toHaveBeenCalledTimes(0)
    expect(installMock).toHaveBeenCalledTimes(0)
  })

  it('C3: a deliberate options click carries NO degrade', () => {
    openSteamInstallOptions('570', makeGameInfo())
    expect(useInstallGameModal.getState().steamDegrade).toBeUndefined()
  })

  it('C4: missing library → degrades into the dialog', () => {
    const target = makeTargets(1)[0]
    openSteamInstallOptions('570', makeGameInfo(), {
      reason: 'library-missing',
      libraryPath: target.path,
      freeBytes: 0,
      onlyLibrary: true
    })

    expect(installMock).not.toHaveBeenCalled()
    expect(useInstallGameModal.getState().isOpen).toBe(true)
    expect(useInstallGameModal.getState().steamDegrade?.reason).toBe(
      'library-missing'
    )
    expect(useInstallGameModal.getState().steamDegrade?.libraryPath).toBe(
      target.path
    )
  })

  it('C5: full library → degrades into the dialog', () => {
    openSteamInstallOptions('570', makeGameInfo(), {
      reason: 'library-full',
      libraryPath: '/steam/library-0',
      freeBytes: 42,
      onlyLibrary: true
    })

    expect(installMock).not.toHaveBeenCalled()
    expect(useInstallGameModal.getState().steamDegrade?.reason).toBe(
      'library-full'
    )
  })

  it('C6: the ≤1-library corner is CARRIED, not hidden', () => {
    openSteamInstallOptions('570', makeGameInfo(), {
      reason: 'library-missing',
      libraryPath: '/steam/library-0',
      freeBytes: 0,
      onlyLibrary: true
    })
    expect(useInstallGameModal.getState().steamDegrade?.onlyLibrary).toBe(
      true
    )

    openSteamInstallOptions('570', makeGameInfo(), {
      reason: 'library-missing',
      libraryPath: '/steam/library-0',
      freeBytes: 0,
      onlyLibrary: false
    })
    expect(useInstallGameModal.getState().steamDegrade?.onlyLibrary).toBe(
      false
    )
  })

  it('C7: closeInstallGameModal clears steamDegrade', () => {
    openSteamInstallOptions('570', makeGameInfo(), {
      reason: 'library-missing',
      libraryPath: '/steam/library-0',
      freeBytes: 0,
      onlyLibrary: true
    })
    closeInstallGameModal()

    expect(useInstallGameModal.getState().isOpen).toBe(false)
    expect(useInstallGameModal.getState().steamDegrade).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Group D — the chokepoint and the D-17 marshalling.
// ---------------------------------------------------------------------------
describe('Group D: the chokepoint and D-17 marshalling', () => {
  it('D1: openInstallGameModal routes Steam installs to the QUICK path', async () => {
    listSteamLibraryTargetsMock.mockResolvedValue(makeTargets(1))
    checkDiskSpaceMock.mockResolvedValue(makeDisk())

    openInstallGameModal({
      appName: '570',
      runner: 'steam',
      gameInfo: makeGameInfo(),
      action: 'install'
    })

    // Quick install is async internally; flush microtasks.
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(installMock).toHaveBeenCalledTimes(1)
    expect(useInstallGameModal.getState().isOpen).toBe(false)
  })

  it.each(['gog', 'legendary', 'nile'] as Runner[])(
    'D2: D-28: non-Steam runners (%s) are untouched — modal opens, quick install never fires',
    async (runner) => {
      const gameInfo = makeGameInfo({ runner })
      openInstallGameModal({
        appName: 'app-1',
        runner,
        gameInfo,
        action: 'install'
      })

      await Promise.resolve()

      expect(useInstallGameModal.getState().isOpen).toBe(true)
      expect(installMock).not.toHaveBeenCalled()
      expect(listSteamLibraryTargetsMock).not.toHaveBeenCalled()
    }
  )

  it('D3: an import action for Steam still opens the modal', async () => {
    openInstallGameModal({
      appName: '570',
      runner: 'steam',
      gameInfo: makeGameInfo(),
      action: 'import'
    })

    await Promise.resolve()

    expect(useInstallGameModal.getState().isOpen).toBe(true)
    expect(installMock).not.toHaveBeenCalled()
  })

  it('D4: installSteamGame forwards an explicit path and the D-17 override', () => {
    const gameInfo = makeGameInfo()
    installSteamGame('570', gameInfo, '/Volumes/Games/SteamLibrary', true)

    const arg = installMock.mock.calls[0][0]
    expect(arg.path).toBe('/Volumes/Games/SteamLibrary')
    expect(arg.steamForceWindowsViaBottle).toBe(true)
    expect(arg.platformToInstall).toBe('Windows')
  })

  it('D5: the 2-arg and 3-arg legacy call shapes still produce a non-true override', () => {
    const gameInfo = makeGameInfo()

    installSteamGame('570', gameInfo)
    let arg = installMock.mock.calls[0][0]
    expect(arg.steamForceWindowsViaBottle).not.toBe(true)

    installMock.mockClear()
    installSteamGame('570', gameInfo, '/some/path')
    arg = installMock.mock.calls[0][0]
    expect(arg.path).toBe('/some/path')
    expect(arg.steamForceWindowsViaBottle).not.toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Group E — comment-stripped source gates.
// ---------------------------------------------------------------------------
describe('Group E: comment-stripped source gates', () => {
  const rawSource = readFileSync(
    join(__dirname, '../InstallGameModal.ts'),
    'utf-8'
  )
  const strippedSource = stripSourceComments(rawSource)

  it('E1: zero matches of the retired D-22/D-25/D-26 predicates — proven non-vacuous against a known-bad specimen', () => {
    const forbidden =
      /steamInstallFormOpens|alwaysShow|bottleRequired|isSteamBottleEligible|requestAppSettings/g

    expect(strippedSource.match(forbidden)).toBeNull()

    // Non-vacuity: the same matcher DOES match a small inline known-bad
    // specimen, so an unmatchable regex could not silently pass this gate.
    const knownBad =
      'const steamInstallFormOpens = alwaysShow || bottleRequired'
    expect(knownBad.match(forbidden)).not.toBeNull()
  })

  it('E2: zero matches of D-09 no-third-frontend-copy identifiers', () => {
    const forbidden = /is_mac_native|mac_arch|steamPlatformsCaptured/g
    expect(strippedSource.match(forbidden)).toBeNull()
  })

  it('E3: exactly ONE occurrence of steamForceWindowsViaBottle — sole write site', () => {
    const matches = strippedSource.match(/steamForceWindowsViaBottle/g) ?? []
    expect(matches.length).toBe(1)
  })

  it('E4: exactly ONE occurrence of window.api.install( — the single marshalling point', () => {
    const matches = strippedSource.match(/window\.api\.install\(/g) ?? []
    expect(matches.length).toBe(1)
  })

  it("E5: the RAW (unstripped) file does NOT contain the pre-existing false premise (note the 'GamerLib' typo, matched as it actually is)", () => {
    expect(rawSource).not.toContain("never use GamerLib's install modal")
  })
})
