/**
 * Phase 56 plan 19 / Phase 63 plan 07: UE-aware launch DRM wrapper resolver.
 * Caller logic only: containment and byte detection are Rust leaves, faked here
 * through deps.contain / deps.detect. Scanner semantics (symlinks, escapes,
 * .bind) are covered by the Rust tests and legacyTsScanners.test.ts.
 */
import { dirname, resolve } from 'path'

import { logWarning } from 'backend/logger'
import { requestRustInvoke } from 'backend/sidecar/sidecarRpc'

import { containedGameExeReal, detectLaunchDrmWrapper } from '../drmScanExe'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  logError: jest.fn(),
  logDebug: jest.fn(),
  LogPrefix: { Steam: 'Steam', Backend: 'Backend' }
}))

jest.mock('backend/sidecar/sidecarRpc', () => ({
  requestRustInvoke: jest.fn()
}))

jest.mock('backend/constants/paths', () => ({
  builtBridgeShimPath: '/nonexistent/steam_api.dll',
  builtBridgeShim64Path: '/nonexistent/steam_api64.dll'
}))

jest.mock('../../../bottle', () => ({
  DEFAULT_BRIDGE_BOTTLE_NAME: 'GameLibSteamBridge',
  sanitizeBottleName: (n: string | null) => n,
  getBottleDir: jest.fn()
}))

jest.mock('../../importScan', () => ({ scanSteamApiImports: jest.fn() }))

type Reason = 'root-unresolvable' | 'realpath-failed' | 'escapes'

const BOTTLE = '/b'
const EXE = '/g/Game/Game.exe'
const SHIP = '/g/Game/Game/Binaries/Win64/Game-Win64-Shipping.exe'
const layout = (exes: string[]) =>
  jest.fn().mockResolvedValue({ steamworksDir: null, shippingExes: exes })

/** contain fake: every path maps to itself unless listed in `fail`. */
function containFake(fail: Record<string, Reason> = {}): jest.Mock {
  return jest.fn(async (path: string) =>
    fail[path]
      ? { real: null, reason: fail[path] }
      : { real: `real:${path}`, reason: null }
  )
}
const warnings = () =>
  jest.mocked(logWarning).mock.calls.map((c) => String(c[0]))

describe('detectLaunchDrmWrapper', () => {
  beforeEach(() => jest.mocked(logWarning).mockClear())

  it('launch exe with .bind wins without a UE lookup', async () => {
    const findUnreal = jest.fn()
    const detect = jest.fn().mockResolvedValue('steamstub')
    await expect(
      detectLaunchDrmWrapper(BOTTLE, EXE, {
        findUnreal,
        detect,
        contain: containFake()
      })
    ).resolves.toEqual({ drmWrapper: 'steamstub', drmExe: EXE })
    expect(detect).toHaveBeenCalledWith(`real:${EXE}`)
    expect(findUnreal).not.toHaveBeenCalled()
  })

  it('contains against dirname(launch exe) and scans the real path', async () => {
    const contain = containFake()
    await detectLaunchDrmWrapper(BOTTLE, EXE, {
      findUnreal: layout([]),
      detect: jest.fn().mockResolvedValue('none'),
      contain
    })
    expect(contain).toHaveBeenCalledWith(
      EXE,
      dirname(EXE),
      'detectLaunchDrmWrapper'
    )
  })

  it('UE bootstrap none, Shipping exe steamstub -> Shipping exe', async () => {
    const detect = jest.fn(async (p: string) =>
      p === `real:${SHIP}` ? ('steamstub' as const) : ('none' as const)
    )
    await expect(
      detectLaunchDrmWrapper(BOTTLE, EXE, {
        findUnreal: layout([SHIP]),
        detect,
        contain: containFake()
      })
    ).resolves.toEqual({ drmWrapper: 'steamstub', drmExe: SHIP })
  })

  it('UE layout with no steamstub Shipping exe -> none, launch exe', async () => {
    await expect(
      detectLaunchDrmWrapper(BOTTLE, EXE, {
        findUnreal: layout([SHIP]),
        detect: jest.fn().mockResolvedValue('none'),
        contain: containFake()
      })
    ).resolves.toEqual({ drmWrapper: 'none', drmExe: EXE })
  })

  it('skips non-.exe candidates and sorts the rest', async () => {
    const detect = jest.fn().mockResolvedValue('none')
    await detectLaunchDrmWrapper(BOTTLE, EXE, {
      findUnreal: layout(['/g/z.exe', '/g/readme.txt', '/g/a.exe']),
      detect,
      contain: containFake()
    })
    expect(detect.mock.calls.map((c) => c[0])).toEqual([
      `real:${EXE}`,
      'real:/g/a.exe',
      'real:/g/z.exe'
    ])
  })

  it('unreadable launch exe and no UE layout -> undefined', async () => {
    await expect(
      detectLaunchDrmWrapper(BOTTLE, EXE, {
        findUnreal: jest.fn().mockResolvedValue(null),
        detect: jest.fn(),
        contain: containFake({ [EXE]: 'realpath-failed' })
      })
    ).resolves.toEqual({ drmWrapper: undefined, drmExe: EXE })
    expect(warnings()).toContain(
      'detectLaunchDrmWrapper: skipped Game.exe (realpath failed)'
    )
  })

  it('unresolvable game folder returns early without a UE lookup', async () => {
    const findUnreal = jest.fn()
    await expect(
      detectLaunchDrmWrapper(BOTTLE, EXE, {
        findUnreal,
        detect: jest.fn(),
        contain: containFake({ [EXE]: 'root-unresolvable' })
      })
    ).resolves.toEqual({ drmWrapper: undefined, drmExe: EXE })
    expect(findUnreal).not.toHaveBeenCalled()
    expect(warnings()).toContain(
      'detectLaunchDrmWrapper: skipped Game.exe (game folder unresolvable)'
    )
  })

  it('ignores a Shipping exe that escapes the game folder', async () => {
    const detect = jest.fn().mockResolvedValue('none')
    await expect(
      detectLaunchDrmWrapper(BOTTLE, EXE, {
        findUnreal: layout([SHIP]),
        detect,
        contain: containFake({ [SHIP]: 'escapes' })
      })
    ).resolves.toEqual({ drmWrapper: 'none', drmExe: EXE })
    expect(
      detect.mock.calls.some((c) => String(c[0]).includes('Shipping'))
    ).toBe(false)
    expect(
      warnings().some(
        (m) =>
          m.includes('Game-Win64-Shipping.exe') &&
          m.includes('escapes game folder')
      )
    ).toBe(true)
  })

  it('refuses a bootstrap that escapes, and the UE Shipping fallback still runs', async () => {
    const detect = jest.fn(async (p: string) =>
      p === `real:${SHIP}` ? ('steamstub' as const) : ('none' as const)
    )
    await expect(
      detectLaunchDrmWrapper(BOTTLE, EXE, {
        findUnreal: layout([SHIP]),
        detect,
        contain: containFake({ [EXE]: 'escapes' })
      })
    ).resolves.toEqual({ drmWrapper: 'steamstub', drmExe: SHIP })
    expect(detect.mock.calls.some((c) => c[0] === `real:${EXE}`)).toBe(false)
    expect(
      warnings().some(
        (m) => m.includes('Game.exe') && m.includes('escapes game folder')
      )
    ).toBe(true)
  })

  it('never rejects when findUnrealLayout throws', async () => {
    await expect(
      detectLaunchDrmWrapper(BOTTLE, EXE, {
        findUnreal: jest.fn().mockRejectedValue(new Error('boom')),
        detect: jest.fn().mockResolvedValue('none'),
        contain: containFake()
      })
    ).resolves.toEqual({ drmWrapper: 'none', drmExe: EXE })
  })

  it('returns a lexical drmExe (resolve(candidate)), not the scanned real path', async () => {
    const lexical = '/link/Game/Game/Binaries/Win64/S-Shipping.exe'
    await expect(
      detectLaunchDrmWrapper(BOTTLE, EXE, {
        findUnreal: layout([lexical]),
        detect: jest.fn(async (p: string) =>
          p.includes('S-Shipping') ? ('steamstub' as const) : ('none' as const)
        ),
        contain: containFake()
      })
    ).resolves.toEqual({ drmWrapper: 'steamstub', drmExe: resolve(lexical) })
  })

  it('a throwing detector on one candidate does not abandon the rest', async () => {
    const a = '/g/a-Shipping.exe'
    const b = '/g/b-Shipping.exe'
    const detect = jest.fn(async (p: string) => {
      if (p === `real:${EXE}`) return 'none' as const
      if (p === `real:${a}`) throw new Error('scan boom')
      return 'steamstub' as const
    })
    await expect(
      detectLaunchDrmWrapper(BOTTLE, EXE, {
        findUnreal: layout([b, a]),
        detect,
        contain: containFake()
      })
    ).resolves.toEqual({ drmWrapper: 'steamstub', drmExe: b })
    expect(
      warnings().some(
        (m) => m.includes('a-Shipping.exe') && m.includes('scan threw')
      )
    ).toBe(true)
  })

  it('a rejected contain is treated as not contained, never thrown', async () => {
    const contain = jest.fn().mockRejectedValue(new Error('transport down'))
    const detect = jest.fn()
    await expect(
      detectLaunchDrmWrapper(BOTTLE, EXE, {
        findUnreal: layout([SHIP]),
        detect,
        contain
      })
    ).resolves.toEqual({ drmWrapper: undefined, drmExe: EXE })
    expect(detect).not.toHaveBeenCalled()
    expect(warnings().some((m) => m.includes('containment check failed'))).toBe(
      true
    )
  })
})

describe('default contain leaf (rust)', () => {
  beforeEach(() => {
    jest.mocked(requestRustInvoke).mockReset()
    jest.mocked(logWarning).mockClear()
  })

  it('sends scan_contained_real with { path, rootDir: dirname(exe) }', async () => {
    jest
      .mocked(requestRustInvoke)
      .mockResolvedValue({ real: '/real/Game.exe', reason: null })
    await expect(containedGameExeReal(EXE, 'placeShimForGame')).resolves.toBe(
      '/real/Game.exe'
    )
    expect(requestRustInvoke).toHaveBeenCalledWith('scan_contained_real', [
      { path: EXE, rootDir: dirname(EXE) }
    ])
  })

  it('maps an escapes result to null with the existing log text', async () => {
    jest
      .mocked(requestRustInvoke)
      .mockResolvedValue({ real: null, reason: 'escapes' })
    await expect(containedGameExeReal(EXE, 'placeShimForGame')).resolves.toBe(
      null
    )
    expect(warnings()).toContain(
      'placeShimForGame: skipped Game.exe (escapes game folder)'
    )
  })

  it('maps a transport rejection to null (fail closed)', async () => {
    jest.mocked(requestRustInvoke).mockRejectedValue(new Error('no sidecar'))
    await expect(containedGameExeReal(EXE, 'placeShimForGame')).resolves.toBe(
      null
    )
    expect(warnings().some((m) => m.includes('containment check failed'))).toBe(
      true
    )
  })
})
