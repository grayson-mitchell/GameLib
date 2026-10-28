/**
 * Phase 56 plan 09: the bottle-stage step of DRM mode. Real fs under a temp
 * bottle, injected restoreOriginals / runReg, no network and no wine spawn.
 */
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  logError: jest.fn(),
  logDebug: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))

jest.mock('backend/constants/paths', () => ({
  builtBridgeShimPath: '/nonexistent/steam_api.dll',
  builtBridgeShim64Path: '/nonexistent/steam_api64.dll'
}))

jest.mock('../../importScan', () => ({ scanSteamApiImports: jest.fn() }))

jest.mock('../../../bottle', () => ({
  DEFAULT_BRIDGE_BOTTLE_NAME: 'GameLibSteamBridge',
  sanitizeBottleName: (n: string | null) =>
    n && /^[A-Za-z0-9_-]+$/.test(n) ? n : null,
  getBottleDir: jest.fn(),
  resolveBridgeBottleName: (a: string) => `GameLibSteamBridge-${a}`
}))

jest.mock('../../../depot', () => ({
  downloadSelectedDepotFiles: jest.fn(),
  normalizeDepotPath: (p: string) => p,
  resolveContainedPath: (r: string, f: string) => join(r, f),
  sha1File: jest.fn()
}))

jest.mock('backend/launcher', () => ({ runWineCommand: jest.fn() }))

import { runWineCommand } from 'backend/launcher'
import {
  buildDrmRegistryCommands,
  drmRegistryStagedInUserReg,
  isPhase52ForwarderBytes,
  removeTcpBridgeArtifacts,
  restoreDrmOriginals,
  stageDrmBottle,
  DRM_HELPER_WIN,
  DRM_STEAMCLIENT64_WIN,
  type StageDrmBottleInput
} from '../stageDrmBottle'
import type { GameSettings } from 'common/types'

const SHIM = Buffer.from('MZ....GameLibSteamBridgeShim....')
const ORIG = Buffer.from('MZ-original')
const FORWARDER = Buffer.concat([
  Buffer.from('MZ-fwd'),
  Buffer.from('GameLib steamclient forwarder', 'utf16le')
])

const LIVE_STALE = `[Software\\\\Valve\\\\Steam\\\\ActiveProcess] 1792813400
#time=1dd6369cfefa3fa
"SteamClientDll64"="C:\\\\Program Files (x86)\\\\Steam\\\\steamapps\\\\common\\\\Grim Dawn\\\\x64\\\\steamclient64.dll"
"Universe"="Public"
`
const STAGED_REG = `[Software\\\\Valve\\\\Steam] 1792813500
#time=1dd6369cfefa400
"SteamPath"="C:\\\\Program Files (x86)\\\\Steam"

[Software\\\\Valve\\\\Steam\\\\ActiveProcess] 1792813400
#time=1dd6369cfefa3fa
"SteamClientDll64"="C:\\\\Program Files (x86)\\\\Steam\\\\steamclient64.dll"
"SteamPath"="C:\\\\Program Files (x86)\\\\Steam"
"Universe"="Public"
`

let tmp: string
let bottle: string
let installRoot: string
let exePath: string

function write(p: string, b: Buffer | string): void {
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, b)
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'gl-drm-stage-'))
  bottle = join(tmp, 'GameLibSteamBridge-1')
  installRoot = join(
    bottle,
    'drive_c',
    'Program Files (x86)',
    'Steam',
    'steamapps',
    'common',
    'Grim Dawn'
  )
  exePath = join(installRoot, 'Game.exe')
  write(exePath, 'MZ-exe')
})

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

describe('buildDrmRegistryCommands', () => {
  it('returns the four HKCU argv in order', () => {
    const s = 'C:\\Program Files (x86)\\Steam'
    const ap = 'HKCU\\Software\\Valve\\Steam\\ActiveProcess'
    expect(buildDrmRegistryCommands()).toEqual([
      [
        'reg',
        'add',
        ap,
        '/v',
        'SteamClientDll64',
        '/t',
        'REG_SZ',
        '/d',
        s + '\\steamclient64.dll',
        '/f'
      ],
      [
        'reg',
        'add',
        ap,
        '/v',
        'Universe',
        '/t',
        'REG_SZ',
        '/d',
        'Public',
        '/f'
      ],
      ['reg', 'add', ap, '/v', 'SteamPath', '/t', 'REG_SZ', '/d', s, '/f'],
      [
        'reg',
        'add',
        'HKCU\\Software\\Valve\\Steam',
        '/v',
        'SteamPath',
        '/t',
        'REG_SZ',
        '/d',
        s,
        '/f'
      ]
    ])
  })

  it('never names the local-machine hive', () => {
    for (const argv of buildDrmRegistryCommands()) {
      for (const el of argv) expect(el).not.toMatch(/HKLM|HKEY_LOCAL_MACHINE/i)
      expect(argv[2].startsWith('HKCU\\')).toBe(true)
    }
  })
})

describe('drmRegistryStagedInUserReg', () => {
  it('is true for a staged user.reg', () => {
    expect(drmRegistryStagedInUserReg(STAGED_REG)).toBe(true)
  })
  it('is false for the stale forwarder section', () => {
    expect(drmRegistryStagedInUserReg(LIVE_STALE)).toBe(false)
  })
  it('is false when one value is missing', () => {
    expect(
      drmRegistryStagedInUserReg(STAGED_REG.replace('"Universe"="Public"', ''))
    ).toBe(false)
  })
  it('is false when the Steam-level SteamPath is missing', () => {
    const t = STAGED_REG.split('\n\n')[1]
    expect(drmRegistryStagedInUserReg(t)).toBe(false)
  })
  it('is false when the values live under a different section', () => {
    expect(
      drmRegistryStagedInUserReg(
        STAGED_REG.replace(
          'Valve\\\\Steam\\\\ActiveProcess]',
          'Valve\\\\Steam\\\\ActiveProcessX]'
        )
      )
    ).toBe(false)
  })
  it('is false for empty and oversize input and never throws', () => {
    expect(drmRegistryStagedInUserReg('')).toBe(false)
    expect(drmRegistryStagedInUserReg('a'.repeat(70 * 1024 * 1024))).toBe(false)
  })
})

describe('isPhase52ForwarderBytes', () => {
  it('detects the utf16le marker', () => {
    expect(isPhase52ForwarderBytes(FORWARDER)).toBe(true)
  })
  it('rejects latin1-only text, random MZ, and empty', () => {
    expect(
      isPhase52ForwarderBytes(Buffer.from('GameLib steamclient forwarder'))
    ).toBe(false)
    expect(isPhase52ForwarderBytes(Buffer.from('MZ\x01\x02\x03'))).toBe(false)
    expect(isPhase52ForwarderBytes(Buffer.alloc(0))).toBe(false)
  })
})

function swapCtx(restoreOriginals?: jest.Mock) {
  return {
    appId: '1',
    bottleDir: bottle,
    exePath,
    installRoot,
    installdir: 'Grim Dawn',
    signal: undefined,
    deps: {
      findUnreal: async () => null,
      restoreOriginals:
        restoreOriginals ??
        (jest.fn(async () => ({ status: 'ok', outcomes: [] })) as never)
    }
  } as unknown as Parameters<typeof restoreDrmOriginals>[0]
}

describe('restoreDrmOriginals', () => {
  const live = () => join(installRoot, 'x64', 'steam_api64.dll')

  it('swaps shim for the original and leaves no backup', async () => {
    write(live(), SHIM)
    write(live() + '.gamelib-orig', ORIG)
    const r = await restoreDrmOriginals(swapCtx())
    expect(r).toEqual({ ok: true, restored: [join('x64', 'steam_api64.dll')] })
    expect(readFileSync(live())).toEqual(ORIG)
    expect(existsSync(live() + '.gamelib-orig')).toBe(false)
  })

  it('is idempotent and touches no mtime on a second run', async () => {
    write(live(), SHIM)
    write(live() + '.gamelib-orig', ORIG)
    await restoreDrmOriginals(swapCtx())
    utimesSync(live(), 1000, 1000)
    const before = statSync(live()).mtimeMs
    const r = await restoreDrmOriginals(swapCtx())
    expect(r).toEqual({ ok: true, restored: [] })
    expect(statSync(live()).mtimeMs).toBe(before)
  })

  it('leaves an original in place even beside a backup', async () => {
    write(live(), ORIG)
    write(live() + '.gamelib-orig', Buffer.from('MZ-other'))
    const r = await restoreDrmOriginals(swapCtx())
    expect(r).toEqual({ ok: true, restored: [] })
    expect(readFileSync(live())).toEqual(ORIG)
  })

  it('refuses all-or-nothing when one shim has no restorable original', async () => {
    const a = live()
    const b = join(installRoot, 'Plugins', 'steam_api64.dll')
    write(a, SHIM)
    write(a + '.gamelib-orig', ORIG)
    write(b, SHIM)
    const restoreOriginals = jest.fn(async () => ({
      status: 'partial',
      outcomes: []
    }))
    const r = await restoreDrmOriginals(swapCtx(restoreOriginals))
    expect(restoreOriginals).toHaveBeenCalledTimes(1)
    expect(restoreOriginals).toHaveBeenCalledWith({
      appId: '1',
      bottleDir: bottle,
      installRoot,
      installdir: 'Grim Dawn',
      signal: undefined
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.cause).toMatch(/^no restorable original for /)
    expect(readFileSync(a)).toEqual(SHIM)
    expect(readFileSync(b)).toEqual(SHIM)
  })

  it('swaps both when restoreOriginals writes the missing backup', async () => {
    const a = live()
    const b = join(installRoot, 'Plugins', 'steam_api64.dll')
    write(a, SHIM)
    write(a + '.gamelib-orig', ORIG)
    write(b, SHIM)
    const restoreOriginals = jest.fn(async () => {
      write(b + '.gamelib-orig', ORIG)
      return { status: 'ok', outcomes: [] }
    })
    const r = await restoreDrmOriginals(swapCtx(restoreOriginals))
    expect(r.ok).toBe(true)
    expect(readFileSync(a)).toEqual(ORIG)
    expect(readFileSync(b)).toEqual(ORIG)
  })

  it('refuses a symlinked live path', async () => {
    const target = join(tmp, 'target.dll')
    write(target, SHIM)
    mkdirSync(dirname(live()), { recursive: true })
    symlinkSync(target, live())
    write(live() + '.gamelib-orig', ORIG)
    const ctx = swapCtx()
    ;(ctx.deps as { findDlls?: unknown }).findDlls = async () => [
      { name: 'steam_api64.dll', path: live(), isGameLibShim: true }
    ]
    const r = await restoreDrmOriginals(ctx)
    expect(r.ok).toBe(false)
    expect(readFileSync(target)).toEqual(SHIM)
  })

  it('refuses a symlinked backup', async () => {
    const target = join(tmp, 'orig.dll')
    write(target, ORIG)
    write(live(), SHIM)
    symlinkSync(target, live() + '.gamelib-orig')
    const r = await restoreDrmOriginals(swapCtx())
    expect(r.ok).toBe(false)
    expect(readFileSync(live())).toEqual(SHIM)
    expect(readFileSync(target)).toEqual(ORIG)
  })
})

describe('removeTcpBridgeArtifacts', () => {
  const ctx = () =>
    ({
      appId: '1',
      bottleDir: bottle,
      exePath,
      installRoot
    }) as unknown as Parameters<typeof removeTcpBridgeArtifacts>[0]

  it('removes the cfg in every location', () => {
    const nested = join(installRoot, 'Plugins', 'x86_64', 'steam_api64.dll')
    const cfgs = [
      join(installRoot, 'gamelib_bridge.cfg'),
      join(installRoot, 'compat', 'gamelib_bridge.cfg'),
      join(installRoot, 'x64', 'gamelib_bridge.cfg'),
      join(dirname(nested), 'gamelib_bridge.cfg')
    ]
    for (const c of cfgs) write(c, 'cfg')
    const r = removeTcpBridgeArtifacts(ctx(), [nested])
    expect(r.ok).toBe(true)
    for (const c of cfgs) expect(existsSync(c)).toBe(false)
  })

  it('refuses a cfg that is a directory', () => {
    mkdirSync(join(installRoot, 'gamelib_bridge.cfg'))
    const r = removeTcpBridgeArtifacts(ctx(), [])
    expect(r.ok).toBe(false)
  })

  it('removes only a marked forwarder', () => {
    const a = join(installRoot, 'steamclient64.dll')
    const dll = join(installRoot, 'x64', 'steam_api64.dll')
    const b = join(installRoot, 'x64', 'steamclient64.dll')
    write(a, FORWARDER)
    write(b, Buffer.from('MZ-game-own'))
    const r = removeTcpBridgeArtifacts(ctx(), [dll])
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.removed).toContain(join('steamclient64.dll'))
      expect(r.foreignSteamClientLeft).toEqual([
        join('x64', 'steamclient64.dll')
      ])
    }
    expect(existsSync(a)).toBe(false)
    expect(readFileSync(b)).toEqual(Buffer.from('MZ-game-own'))
  })

  it('never reads a steamclient64.dll over 4 MiB', () => {
    const a = join(installRoot, 'steamclient64.dll')
    write(a, Buffer.concat([FORWARDER, Buffer.alloc(5 * 1024 * 1024)]))
    const r = removeTcpBridgeArtifacts(ctx(), [])
    expect(r.ok).toBe(true)
    expect(existsSync(a)).toBe(true)
    expect(lstatSync(a).size).toBeGreaterThan(4 * 1024 * 1024)
  })
})

// Referenced by the Task 2 block below.
export const _unused = {
  readdirSync,
  stageDrmBottle,
  runWineCommand,
  DRM_HELPER_WIN,
  DRM_STEAMCLIENT64_WIN
}
export type _In = StageDrmBottleInput
export type _GS = GameSettings
