import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  findRuntimeLoadedSteamApiDlls,
  findSteamApiImporterPes,
  findUnrealLayout,
  isContainedWithin,
  partitionManagedImports,
  readFileEffectiveArch,
  resolveWalkRoot,
  scanManagedSteamApi,
  servedFamiliesFor,
  type BridgeScanDeps
} from '../bridgeScan'
import { buildManagedPe } from './fixtures/managedPe'

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'bridgescan-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

const put = (rel: string, data: Buffer | string = 'x') => {
  const full = join(root, rel)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, data)
  return full
}

const makeDeps = (
  scan: BridgeScanDeps['scanImports'] = async () => ({
    status: 'ok',
    arch: 'none',
    symbols: []
  })
) => {
  const warn = jest.fn()
  const deps: BridgeScanDeps = {
    scanImports: scan,
    warn,
    isShimBytes: (b) => b.toString('latin1').includes('GameLibSteamBridgeShim')
  }
  return { deps, warn }
}

describe('D-53-12 import boundary', () => {
  it('imports only node: and relative modules', () => {
    const src = readFileSync(join(__dirname, '..', 'bridgeScan.ts'), 'utf8')
    expect(src).not.toMatch(/from 'backend\//)
    const specs = [...src.matchAll(/from '([^']+)'/g)].map((m) => m[1])
    expect(specs.length).toBeGreaterThan(0)
    for (const spec of specs) {
      expect(spec.startsWith('node:') || spec.startsWith('./')).toBe(true)
    }
  })
})

describe('lifted walks (smoke)', () => {
  it('isContainedWithin and resolveWalkRoot', () => {
    expect(isContainedWithin(root, join(root, 'a'))).toBe(true)
    expect(isContainedWithin(root, root)).toBe(false)
    expect(isContainedWithin(root, join(root, '..', 'x'))).toBe(false)
    expect(resolveWalkRoot(root, join(root, 'g', 'a.exe'), undefined)).toBe(
      join(root, 'g')
    )
    expect(resolveWalkRoot(root, join(root, 'g', 'a.exe'), '/elsewhere')).toBe(
      join(root, 'g')
    )
    expect(
      resolveWalkRoot(root, join(root, 'g', 'a.exe'), join(root, 'i'))
    ).toBe(join(root, 'i'))
  })

  it('findRuntimeLoadedSteamApiDlls finds originals and shims, not backups', async () => {
    const orig = put('bin/steam_api64.dll', 'original')
    const shim = put('bin2/steam_api.dll', 'GameLibSteamBridgeShim')
    put('bin/steam_api64.dll.gamelib-orig', 'backup')
    const { deps } = makeDeps()
    const found = await findRuntimeLoadedSteamApiDlls(root, [], deps)
    expect(found.map((d) => [d.name, d.path, d.isGameLibShim]).sort()).toEqual(
      [
        ['steam_api.dll', shim, true],
        ['steam_api64.dll', orig, false]
      ].sort()
    )
  })

  it('findUnrealLayout reports the Steamworks dir and Shipping exes', async () => {
    put('Game.exe')
    put('Engine/Binaries/ThirdParty/Steamworks/Steamv1/Win64/steam_api64.dll')
    const ship = put('Game/Binaries/Win64/Game-Win64-Shipping.exe')
    const layout = await findUnrealLayout(root, root)
    expect(layout?.steamworksDir).toBe(
      join(root, 'Engine', 'Binaries', 'ThirdParty', 'Steamworks')
    )
    expect(layout?.shippingExes).toEqual([ship])
    expect(await findUnrealLayout(root, join(root, 'Game'))).toBeNull()
  })

  it('findSteamApiImporterPes scans priority paths first and caps the walk', async () => {
    const launch = put('Game.exe')
    const dll = put('x64/Engine.dll')
    const ship = put('Game/Binaries/Win64/G-Win64-Shipping.exe')
    put('x64/steam_api64.dll')
    const scanned: string[] = []
    const { deps } = makeDeps(async (p) => {
      scanned.push(p)
      return { status: 'ok', arch: 'x64', symbols: ['SteamAPI_Init'] }
    })
    const found = await findSteamApiImporterPes('1', root, launch, [ship], deps)
    expect(found.map((f) => f.path)).toEqual([ship, dll])
    expect(scanned).not.toContain(launch)
    expect(scanned.filter((p) => p === ship)).toHaveLength(1)
  })

  it('findSteamApiImporterPes stops at the 512-file cap with one warning', async () => {
    const launch = put('Game.exe')
    for (let i = 0; i < 520; i++) put(`d/f${i}.dll`)
    const { deps, warn } = makeDeps()
    await findSteamApiImporterPes('1', root, launch, [], deps)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('readFileEffectiveArch treats AnyCPU as x64 and 32BITREQUIRED as x86', () => {
    const anyCpu = put(
      'a.exe',
      buildManagedPe({ machine: 0x14c, clrFlags: 0x1 })
    )
    const x86 = put(
      'b.exe',
      buildManagedPe({ machine: 0x14c, clrFlags: 0x20001 })
    )
    expect(readFileEffectiveArch(anyCpu)).toBe('x64')
    expect(readFileEffectiveArch(x86)).toBe('x86')
    expect(readFileEffectiveArch(join(root, 'missing.exe'))).toBeNull()
  })
})

describe('D-53-04 managed scan', () => {
  it('partitions required names from unserved-family counts', () => {
    expect(
      partitionManagedImports(
        [
          'SteamAPI_Init',
          'SteamAPI_ManualDispatch_Init',
          'SteamAPI_ISteamUser_GetSteamID',
          'SteamAPI_ISteamUGC_CreateQueryAllUGCRequestPage',
          'SteamAPI_SteamUser_v023',
          'SteamAPI_SteamUGC_v016'
        ],
        new Set(['SteamUser'])
      )
    ).toEqual({
      required: [
        'SteamAPI_ISteamUser_GetSteamID',
        'SteamAPI_Init',
        'SteamAPI_ManualDispatch_Init',
        'SteamAPI_SteamUser_v023'
      ],
      unservedFamilyCount: 2
    })
  })

  it('parses ISteamUserStats as SteamUserStats, not SteamUser', () => {
    expect(
      partitionManagedImports(
        ['SteamAPI_ISteamUserStats_GetStat'],
        new Set(['SteamUser'])
      )
    ).toEqual({ required: [], unservedFamilyCount: 1 })
  })

  it('servedFamiliesFor reads the served version maps', () => {
    expect(servedFamiliesFor('x64').has('SteamUser')).toBe(true)
    expect(servedFamiliesFor('x86').has('SteamUser')).toBe(true)
  })

  const monoTree = () => {
    const exe = put('Game.exe')
    const utf16 = Buffer.from('xxSteamUser023\0', 'utf16le')
    put(
      'Game_Data/Managed/com.rlabrecque.steamworks.net.dll',
      Buffer.concat([
        buildManagedPe({
          moduleRefs: ['steam_api64', 'steam_api'],
          implMaps: [
            { name: 'SteamAPI_Init', module: 1 },
            { name: 'SteamAPI_ISteamUser_GetSteamID', module: 1 },
            { name: 'SteamAPI_Shutdown', module: 2 }
          ]
        }),
        utf16
      ])
    )
    put('Game_Data/Managed/Assembly-CSharp.dll', buildManagedPe({}))
    return exe
  }

  it('scans x64 Mono imports and UTF-16 version constants', async () => {
    const exe = monoTree()
    const { deps } = makeDeps()
    expect(await scanManagedSteamApi(exe, root, 'x64', deps)).toEqual({
      kind: 'mono',
      assemblies: 2,
      unparsed: 0,
      symbols: ['SteamAPI_ISteamUser_GetSteamID', 'SteamAPI_Init'],
      versionStrings: ['SteamUser023']
    })
  })

  it('reads the steam_api module only for x86', async () => {
    const exe = monoTree()
    const { deps } = makeDeps()
    const r = await scanManagedSteamApi(exe, root, 'x86', deps)
    expect(r.kind === 'mono' && r.symbols).toEqual(['SteamAPI_Shutdown'])
  })

  it('flags IL2CPP and reports none', async () => {
    const exe = put('Game.exe')
    const { deps } = makeDeps()
    expect(await scanManagedSteamApi(exe, root, 'x64', deps)).toEqual({
      kind: 'none'
    })
    put('GameAssembly.dll')
    expect(await scanManagedSteamApi(exe, root, 'x64', deps)).toEqual({
      kind: 'il2cpp',
      reason: 'il2cpp: not scanned'
    })
  })

  it('skips symlinked dlls and counts unparsable ones', async () => {
    const exe = monoTree()
    const outside = mkdtempSync(join(tmpdir(), 'bridgescan-out-'))
    try {
      writeFileSync(
        join(outside, 'evil.dll'),
        buildManagedPe({
          moduleRefs: ['steam_api64'],
          implMaps: [{ name: 'Evil', module: 1 }]
        })
      )
      symlinkSync(
        join(outside, 'evil.dll'),
        join(root, 'Game_Data', 'Managed', 'evil.dll')
      )
      put('Game_Data/Managed/junk.dll', 'not a pe')
      const { deps } = makeDeps()
      const r = await scanManagedSteamApi(exe, root, 'x64', deps)
      expect(r.kind === 'mono' && r.symbols).not.toContain('Evil')
      expect(r.kind === 'mono' && r.unparsed).toBe(1)
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
  })

  it('skips a symlinked Managed dir', async () => {
    const exe = put('Game.exe')
    const real = join(root, 'real')
    mkdirSync(real)
    mkdirSync(join(root, 'Game_Data'))
    symlinkSync(real, join(root, 'Game_Data', 'Managed'))
    const { deps } = makeDeps()
    expect(await scanManagedSteamApi(exe, root, 'x64', deps)).toEqual({
      kind: 'none'
    })
  })

  it('stops at 256 dlls with one warning', async () => {
    const exe = put('Game.exe')
    for (let i = 0; i < 260; i++) {
      put(`Game_Data/Managed/a${String(i).padStart(3, '0')}.dll`, 'x')
    }
    const { deps, warn } = makeDeps()
    const r = await scanManagedSteamApi(exe, root, 'x64', deps)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(r.kind === 'mono' && r.unparsed).toBe(256)
  })
})
