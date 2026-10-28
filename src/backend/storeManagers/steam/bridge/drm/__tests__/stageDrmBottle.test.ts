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
import { logInfo, logWarning } from 'backend/logger'
import {
  buildDrmRegistryCommands,
  drmRegistryMismatches,
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

describe('drmRegistryMismatches', () => {
  it('is empty for a staged body and for a trailing-backslash SteamPath', () => {
    expect(drmRegistryMismatches(STAGED_REG)).toEqual([])
    const t = STAGED_REG.replaceAll(
      '"SteamPath"="C:\\\\Program Files (x86)\\\\Steam"',
      '"SteamPath"="C:\\\\Program Files (x86)\\\\Steam\\\\"'
    )
    expect(drmRegistryMismatches(t)).toEqual([])
  })
  it('names a missing value', () => {
    expect(
      drmRegistryMismatches(STAGED_REG.replace('"Universe"="Public"', ''))
    ).toEqual(['Software\\\\Valve\\\\Steam\\\\ActiveProcess:Universe'])
  })
  it('names every value of a stale body', () => {
    expect(drmRegistryMismatches(LIVE_STALE).length).toBeGreaterThan(0)
  })
})

describe('drmRegistryStagedInUserReg', () => {
  it('is true for a staged user.reg', () => {
    expect(drmRegistryStagedInUserReg(STAGED_REG)).toBe(true)
  })
  it('tolerates a trailing backslash on SteamPath (helper rewrite)', () => {
    const t = STAGED_REG.replaceAll(
      '"SteamPath"="C:\\\\Program Files (x86)\\\\Steam"',
      '"SteamPath"="C:\\\\Program Files (x86)\\\\Steam\\\\"'
    )
    expect(t).not.toBe(STAGED_REG)
    expect(drmRegistryStagedInUserReg(t)).toBe(true)
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
        (jest.fn(() =>
          Promise.resolve({ status: 'ok', outcomes: [] })
        ) as never)
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
    const restoreOriginals = jest.fn(() =>
      Promise.resolve({
        status: 'partial',
        outcomes: []
      })
    )
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
    ;(ctx.deps as { findDlls?: unknown }).findDlls = () =>
      Promise.resolve([
        { name: 'steam_api64.dll', path: live(), isGameLibShim: true }
      ])
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

  it('cleans cfg and forwarder in extraExeDirs', () => {
    const shipping = join(installRoot, 'Game', 'Binaries', 'Win64')
    write(join(shipping, 'gamelib_bridge.cfg'), 'cfg')
    write(join(shipping, 'steamclient64.dll'), FORWARDER)
    const r = removeTcpBridgeArtifacts(ctx(), [], [shipping])
    expect(r.ok).toBe(true)
    expect(existsSync(join(shipping, 'gamelib_bridge.cfg'))).toBe(false)
    expect(existsSync(join(shipping, 'steamclient64.dll'))).toBe(false)
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

describe('stageDrmBottle', () => {
  const settings = { wineVersion: { name: 'clone' } } as unknown as GameSettings
  let valveDir: string
  let compDir: string
  let runReg: jest.Mock
  const pf = () => join(bottle, 'drive_c', 'Program Files (x86)')
  const steamDir = () => join(pf(), 'Steam')

  const input = (
    over: Partial<StageDrmBottleInput> = {}
  ): StageDrmBottleInput => ({
    appId: '1',
    bottleName: 'GameLibSteamBridge-1',
    bottleSettings: settings,
    exePath,
    installRoot,
    installdir: 'Grim Dawn',
    valveClientDir: valveDir,
    componentDir: compDir,
    ...over
  })
  const deps = (over: Record<string, unknown> = {}) => ({
    getBottleDir: () => bottle,
    findUnreal: async () => null,
    restoreOriginals: jest.fn(() =>
      Promise.resolve({ status: 'ok', outcomes: [] })
    ),
    runReg,
    ...over
  })
  const run = (
    over: Partial<StageDrmBottleInput> = {},
    d: Record<string, unknown> = {}
  ) => stageDrmBottle(input(over), deps(d) as never)

  beforeEach(() => {
    valveDir = join(tmp, 'valve')
    compDir = join(tmp, 'comp')
    for (const n of ['steamclient64.dll', 'tier0_s64.dll', 'vstdlib_s64.dll']) {
      write(join(valveDir, n), 'MZ-valve-' + n)
    }
    for (const n of ['lsteamclient.dll', 'steam.exe']) {
      write(join(compDir, n), 'MZ-comp-' + n)
    }
    runReg = jest.fn(() => Promise.resolve({ code: 0 }))
    ;(runWineCommand as jest.Mock).mockReset()
  })

  const expectErr = async (
    p: ReturnType<typeof run>,
    contains?: string
  ): Promise<void> => {
    const r = await p
    expect(r.status).toBe('error')
    if (r.status === 'error') {
      expect(r.step).toBe('bottle-stage')
      if (contains) expect(r.cause).toContain(contains)
    }
    expect(runReg).not.toHaveBeenCalled()
  }

  it('stages a bottle on the happy path', async () => {
    const r = await run()
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    expect(r.steamDirHost).toBe(steamDir())
    expect(r.helperWinPath).toBe(DRM_HELPER_WIN)
    expect(r.helperWinPath).toBe('C:\\Program Files (x86)\\Steam\\steam.exe')
    expect(r.steamClient64WinPath).toBe(DRM_STEAMCLIENT64_WIN)
    expect(r.staged).toHaveLength(5)
    expect(readFileSync(join(steamDir(), 'steam.exe'), 'utf8')).toBe(
      'MZ-comp-steam.exe'
    )
    expect(readFileSync(join(steamDir(), 'tier0_s64.dll'), 'utf8')).toBe(
      'MZ-valve-tier0_s64.dll'
    )
    expect(runReg.mock.calls.map((c) => c[0])).toEqual(
      buildDrmRegistryCommands()
    )
    expect(r.registryWritten).toBe(true)
  })

  it('logs which registry values were not staged before re-running reg adds', async () => {
    write(
      join(bottle, 'user.reg'),
      STAGED_REG.replace('"Universe"="Public"', '')
    )
    await run()
    expect(logInfo).toHaveBeenCalledWith(
      'stageDrmBottle: appId 1 registry not staged: Software\\\\Valve\\\\Steam\\\\ActiveProcess:Universe',
      expect.anything()
    )
  })

  it('is idempotent once the bottle is staged', async () => {
    await run()
    write(join(bottle, 'user.reg'), STAGED_REG)
    runReg.mockClear()
    const f = join(steamDir(), 'lsteamclient.dll')
    utimesSync(f, 1000, 1000)
    const before = statSync(f).mtimeMs
    const r = await run()
    expect(r).toMatchObject({
      status: 'ok',
      staged: [],
      restored: [],
      removed: [],
      registryWritten: false
    })
    expect(runReg).toHaveBeenCalledTimes(0)
    expect(statSync(f).mtimeMs).toBe(before)
  })

  it('replaces a stale staged file and clears a crashed temp', async () => {
    mkdirSync(steamDir(), { recursive: true })
    write(join(steamDir(), 'steam.exe'), 'MZ-stale')
    write(join(steamDir(), 'steam.exe.gamelib-stage-tmp'), 'junk')
    const r = await run()
    expect(r.status).toBe('ok')
    expect(readFileSync(join(steamDir(), 'steam.exe'), 'utf8')).toBe(
      'MZ-comp-steam.exe'
    )
    expect(
      readdirSync(steamDir()).filter((n) => n.endsWith('.gamelib-stage-tmp'))
    ).toEqual([])
  })

  it('swaps and cleans before staging, and refuses early', async () => {
    const live = join(installRoot, 'steam_api64.dll')
    write(live, SHIM)
    write(join(installRoot, 'gamelib_bridge.cfg'), 'cfg')
    await expectErr(run(), 'no restorable original')
    expect(existsSync(join(steamDir(), 'steamclient64.dll'))).toBe(false)
    expect(readFileSync(live)).toEqual(SHIM)
    expect(existsSync(join(installRoot, 'gamelib_bridge.cfg'))).toBe(true)

    write(live + '.gamelib-orig', ORIG)
    const r = await run()
    expect(r.status).toBe('ok')
    expect(readFileSync(live)).toEqual(ORIG)
    expect(existsSync(join(installRoot, 'gamelib_bridge.cfg'))).toBe(false)
  })

  it('removes Shipping-dir artifacts through extraExeDirs', async () => {
    const shipping = join(installRoot, 'Game', 'Binaries', 'Win64')
    write(join(shipping, 'gamelib_bridge.cfg'), 'cfg')
    write(join(shipping, 'steamclient64.dll'), FORWARDER)
    const r = await run({ extraExeDirs: [shipping] })
    expect(r.status).toBe('ok')
    expect(existsSync(join(shipping, 'gamelib_bridge.cfg'))).toBe(false)
    expect(existsSync(join(shipping, 'steamclient64.dll'))).toBe(false)
  })

  it('rejects an extraExeDirs entry outside drive_c and removes nothing', async () => {
    write(join(installRoot, 'gamelib_bridge.cfg'), 'cfg')
    await expectErr(run({ extraExeDirs: [tmp] }), 'extra exe dir')
    expect(existsSync(join(installRoot, 'gamelib_bridge.cfg'))).toBe(true)
  })

  it('behaves as before with extraExeDirs [] ', async () => {
    const r = await run({ extraExeDirs: [] })
    expect(r.status).toBe('ok')
  })

  it.each([
    ['non-numeric appId', () => ({ appId: 'abc' }), 'appId'],
    ['bad bottle name', () => ({ bottleName: '../x' }), 'bottle name'],
    ['exe outside bottle', () => ({ exePath: join(tmp, 'x.exe') }), 'exe'],
    [
      'install root outside bottle',
      () => ({ installRoot: tmp }),
      'install root'
    ]
  ])('refuses %s', async (_n, over, cause) => {
    await expectErr(run((over as () => Partial<StageDrmBottleInput>)()), cause)
    expect(existsSync(steamDir()) && readdirSync(steamDir())).not.toContain(
      'steam.exe'
    )
  })

  it('refuses a 32-bit prefix', async () => {
    rmSync(pf(), { recursive: true, force: true })
    mkdirSync(join(bottle, 'drive_c', 'Program Files'), { recursive: true })
    write(join(bottle, 'drive_c', 'Program Files', 'Game', 'Game.exe'), 'MZ')
    await expectErr(
      run({
        exePath: join(bottle, 'drive_c', 'Program Files', 'Game', 'Game.exe'),
        installRoot: join(bottle, 'drive_c', 'Program Files', 'Game')
      }),
      '64-bit'
    )
  })

  it('refuses a symlinked Steam dir', async () => {
    const real = join(tmp, 'elsewhere')
    mkdirSync(real)
    rmSync(steamDir(), { recursive: true, force: true })
    symlinkSync(real, steamDir())
    await expectErr(run(), 'symlink')
    expect(readdirSync(real)).toEqual([])
  })

  it('refuses a bottle holding a Steam client', async () => {
    write(join(steamDir(), 'steamui.dll'), 'MZ')
    await expectErr(run(), 'Steam client')
  })

  it('refuses a missing source', async () => {
    rmSync(join(valveDir, 'tier0_s64.dll'))
    await expectErr(run(), 'tier0_s64.dll')
  })

  it('refuses a symlinked source', async () => {
    const t = join(tmp, 'real.dll')
    write(t, 'MZ-x')
    rmSync(join(compDir, 'lsteamclient.dll'))
    symlinkSync(t, join(compDir, 'lsteamclient.dll'))
    await expectErr(run(), 'lsteamclient.dll')
  })

  it('refuses a non-PE source', async () => {
    write(join(compDir, 'steam.exe'), 'ELF-nope')
    await expectErr(run(), 'steam.exe')
  })

  it('refuses a symlinked destination', async () => {
    const t = join(tmp, 'victim.exe')
    write(t, 'victim')
    mkdirSync(steamDir(), { recursive: true })
    symlinkSync(t, join(steamDir(), 'steam.exe'))
    await expectErr(run(), 'symlink')
    expect(readFileSync(t, 'utf8')).toBe('victim')
  })

  it('refuses a pre-aborted signal', async () => {
    const ac = new AbortController()
    ac.abort()
    await expectErr(run({ signal: ac.signal }), 'aborted')
    expect(existsSync(join(steamDir(), 'steam.exe'))).toBe(false)
  })

  it('maps a failing reg add to bottle-stage', async () => {
    runReg.mockResolvedValue({ code: 1, stderr: 'boom' })
    const r = await run()
    expect(r.status).toBe('error')
    if (r.status === 'error') {
      expect(r.step).toBe('bottle-stage')
      expect(r.cause).toMatch(/^reg add SteamClientDll64 failed/)
    }
  })

  it('times out a reg add and clears its timer', async () => {
    const clear = jest.spyOn(global, 'clearTimeout')
    runReg.mockImplementation(() => new Promise(() => undefined))
    const listBottleProcesses = jest.fn(() =>
      Promise.resolve(['11:97.5:wineserver', '12:0.0:steam.exe'])
    )
    const r = await run({}, { regTimeoutMs: 20, listBottleProcesses })
    expect(r.status).toBe('error')
    if (r.status === 'error') expect(r.cause).toContain('timed out')
    expect(listBottleProcesses).toHaveBeenCalledWith(bottle)
    expect(logWarning).toHaveBeenCalledWith(
      'stageDrmBottle: appId 1 bottle processes at timeout: 11:97.5:wineserver,12:0.0:steam.exe',
      expect.anything()
    )
    expect(runReg).toHaveBeenCalledTimes(1)
    expect(clear).toHaveBeenCalled()
    clear.mockRestore()
  })

  it('never rejects when the runner throws', async () => {
    runReg.mockRejectedValue(new Error('spawn failed'))
    await expect(run()).resolves.toMatchObject({
      status: 'error',
      step: 'bottle-stage'
    })
  })

  it('uses runWineCommand by default with the bottle settings', async () => {
    ;(runWineCommand as jest.Mock).mockResolvedValue({ code: 0, stderr: '' })
    const d = deps()
    delete (d as { runReg?: unknown }).runReg
    const r = await stageDrmBottle(input(), d as never)
    expect(r.status).toBe('ok')
    expect(runWineCommand).toHaveBeenCalledTimes(4)
    expect(runWineCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        wait: false,
        protonVerb: 'run',
        gameSettings: settings
      })
    )
  })

  it('settles the default reg call on reg.exe exit, not pipe close', async () => {
    ;(runWineCommand as jest.Mock).mockResolvedValue({ code: 0, stderr: '' })
    const d = deps()
    delete (d as { runReg?: unknown }).runReg
    await stageDrmBottle(input(), d as never)
    for (const [args] of (runWineCommand as jest.Mock).mock.calls) {
      expect(args).toEqual(expect.objectContaining({ resolveOnExit: true }))
    }
  })
})
