/**
 * Unit tests for automatic per-bottle shim placement (Phase 24 Plan 05,
 * R3, Task 2; widened Phase 51 Plan 07 for arch-aware placement, interface-
 * version capture, and verdict-returning results).
 *
 * Real-tmpdir black-box fs testing (manifest.test.ts precedent) -- node's
 * `fs`/`fs/promises` exports are non-configurable getters under this
 * project's ts-jest/CJS interop, so `jest.spyOn`/`jest.mock('node:fs', ...)`
 * cannot reliably intercept a specific call without breaking the
 * underlying real I/O. Instead this test creates a REAL temp directory
 * tree (bottle dir + game exe dir + a fixture "built shim" file) and lets
 * `placeShimForGame` perform REAL `existsSync`/`copyFileSync`/
 * `readInterfaceVersionStrings` calls against it, then asserts on the real
 * filesystem (and the returned verdict) afterward.
 *
 * The "read the original BEFORE overwriting it" property (D-51-07) is
 * asserted behaviorally, not via a call-order spy: the pre-seeded original
 * dll embeds a KNOWN version string the shim source file does not contain,
 * so the returned verdict's `interfaceVersions` can only be correct if the
 * read happened before `copyFileSync` replaced the file's contents.
 *
 * `getBottleDir`/`sanitizeBottleName` are mocked at the module boundary
 * (avoids pulling in bottle.ts's transitive `electron`/`electron-store`
 * dependency graph for a shimGenerate-focused test) -- `sanitizeBottleName`
 * is re-implemented verbatim (the exact T-17-01 guard from bottle.ts:166)
 * so the "unsafe bottle name rejected" behavior is genuinely exercised,
 * not assumed.
 */

// `node:fs` is NOT mocked anywhere in this test file (unlike bottle.test.ts,
// which mocks `graceful-fs` separately from `node:fs`) -- `readFileSync`
// below is used both for real-tmpdir fixture assertions AND, in the
// BLOCKER 2 test, to grep shimGenerate.ts's own source text (24-04
// precedent: a real source-slice test, not a runtime mock assertion).
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

// Phase 51 Plan 03: SHIM_EXPORTED_SYMBOLS (and its 24-CR-02 pin test) moved
// to shimCoverage.ts / shimCoverage.test.ts -- this file no longer imports
// it, since every remaining test here exercises placeShimForGame's own
// behavior (via readDefExports() below), not the constant itself.
import {
  detectDrmWrapper,
  isGameLibShimBytes,
  placeShimForGame
} from '../shimGenerate'
import { scanSteamApiImports } from '../importScan'
import { getBottleDir, resolveBridgeBottleName } from '../../bottle'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  logError: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))

jest.mock('backend/constants/paths', () => ({
  // Deliberately non-existent -- every test that needs a real source
  // binary passes `opts.shimSourcePath`/`opts.shim64SourcePath` explicitly
  // (dependency injection); this proves the DEFAULT truly falls back to
  // the real import, not a second hardcoded path.
  builtBridgeShimPath: '/nonexistent/mock-builtBridgeShimPath/steam_api.dll',
  builtBridgeShim64Path:
    '/nonexistent/mock-builtBridgeShim64Path/steam_api64.dll'
}))

jest.mock('../importScan', () => ({
  scanSteamApiImports: jest.fn()
}))

jest.mock('../../bottle', () => ({
  DEFAULT_BRIDGE_BOTTLE_NAME: 'GameLibSteamBridge',
  // Verbatim re-implementation of bottle.ts:166's T-17-01 guard -- kept
  // here (not imported) so this test suite never has to load bottle.ts's
  // transitive electron/electron-store dependency graph.
  sanitizeBottleName: (name: string): string | null => {
    if (typeof name !== 'string') return null
    const trimmed = name.trim()
    if (!trimmed) return null
    if (
      trimmed.includes('/') ||
      trimmed.includes('\\') ||
      trimmed.includes('..') ||
      trimmed.includes('\0')
    ) {
      return null
    }
    return trimmed
  },
  getBottleDir: jest.fn(),
  // quick/261016-u1w (D-B): plain arrow function, NOT jest.fn() -- resetMocks
  // wipes a jest.fn()'s implementation before every test, but shimGenerate.ts
  // calls this directly as a pure resolver, so the factory gives it a real
  // (mirrored) implementation that survives resetMocks.
  resolveBridgeBottleName: (appId: string): string | null =>
    /^\d+$/.test(appId) ? `GameLibSteamBridge-${appId}` : null
}))

const mockedScanSteamApiImports = scanSteamApiImports as jest.Mock
const mockedGetBottleDir = getBottleDir as jest.Mock

// 24-CR-02 pin (quick 260930-vrb). SHIM_EXPORTED_SYMBOLS is a hand-synced copy
// of the export list in the COMMITTED native/steam-bridge/generated/steam_api.def
// -- tsconfig.json's `include` is ["src"] only, so src/ cannot import the
// generator that produces it, and only a test can hold the two together. The
// anchor is the committed .def (not generateDefFile output) because
// buildShimCompileArgv (meta/buildSteamBridgeShims.ts) compiles exactly that
// file into the shipped shim. This test deliberately imports nothing from meta/.
const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..')
const STEAM_API_DEF_PATH = join(
  REPO_ROOT,
  'native',
  'steam-bridge',
  'generated',
  'steam_api.def'
)

function readDef(): { header: string; hasExports: boolean; symbols: string[] } {
  const lines = readFileSync(STEAM_API_DEF_PATH, 'utf-8')
    .split(/\r?\n/)
    .map((l) => l.trim())
  const exportsIdx = lines.indexOf('EXPORTS')
  const symbols =
    exportsIdx === -1
      ? []
      : lines
          .slice(exportsIdx + 1)
          .filter((l) => l !== '' && !l.startsWith(';'))
          .map((l) => l.split(/\s+/)[0])
  return { header: lines[0], hasExports: exportsIdx !== -1, symbols }
}

const readDefExports = (): string[] => readDef().symbols

// Quick 261024-br4: a minimal PE32 builder (a trimmed copy of
// peSteamDrm.test.ts's). `cegNames` become named RT_RCDATA entries; an empty
// list yields a clean PE with no resource directory at all.
function buildMinimalPe(cegNames: string[]): Buffer {
  const buf = Buffer.alloc(0x800)
  const pe = 0x80
  const opt = pe + 24
  const optSize = 224
  const sections = cegNames.length > 0 ? 2 : 1
  buf.write('MZ', 0, 'latin1')
  buf.writeUInt32LE(pe, 0x3c)
  buf.writeUInt32LE(0x00004550, pe)
  buf.writeUInt16LE(0x14c, pe + 4)
  buf.writeUInt16LE(sections, pe + 6)
  buf.writeUInt16LE(optSize, pe + 20)
  buf.writeUInt16LE(0x10b, opt)
  buf.writeUInt32LE(16, opt + 92)
  const sec = (i: number, name: string, va: number, raw: number) => {
    const b = opt + optSize + i * 40
    buf.write(name, b, 'latin1')
    buf.writeUInt32LE(0x200, b + 8)
    buf.writeUInt32LE(va, b + 12)
    buf.writeUInt32LE(0x200, b + 16)
    buf.writeUInt32LE(raw, b + 20)
  }
  sec(0, '.text', 0x1000, 0x400)
  if (cegNames.length > 0) {
    const rsrc = 0x600
    sec(1, '.rsrc', 0x2000, rsrc)
    buf.writeUInt32LE(0x2000, opt + 96 + 16)
    buf.writeUInt32LE(0x200, opt + 96 + 20)
    // root: one ID entry (10 = RT_RCDATA) -> subdirectory at +0x18
    buf.writeUInt16LE(1, rsrc + 14)
    buf.writeUInt32LE(10, rsrc + 16)
    buf.writeUInt32LE((0x80000000 | 0x18) >>> 0, rsrc + 20)
    const sub = rsrc + 0x18
    buf.writeUInt16LE(cegNames.length, sub + 12)
    let str = 0x18 + 16 + cegNames.length * 8
    cegNames.forEach((n, i) => {
      buf.writeUInt32LE((0x80000000 | str) >>> 0, sub + 16 + i * 8)
      buf.writeUInt32LE(0x1f0, sub + 16 + i * 8 + 4)
      buf.writeUInt16LE(n.length, rsrc + str)
      buf.write(n, rsrc + str + 2, 'utf16le')
      str += 2 + n.length * 2
    })
  }
  return buf
}

describe('isGameLibShimBytes', () => {
  it('is true for a buffer containing the GameLibSteamBridgeShim marker', () => {
    expect(
      isGameLibShimBytes(Buffer.from('xxGameLibSteamBridgeShim/2xx'))
    ).toBe(true)
  })

  it('is true for a buffer containing the ASCII loopback address', () => {
    expect(isGameLibShimBytes(Buffer.from('xx127.0.0.1xx'))).toBe(true)
  })

  it('is false for a buffer containing neither marker', () => {
    expect(isGameLibShimBytes(Buffer.from('just-a-games-own-dll-bytes'))).toBe(
      false
    )
  })
})

describe('shimGenerate', () => {
  let root: string
  let bottleDir: string
  let gameDir: string
  let gameExePath: string
  let realShimSourcePath: string
  let realShim64SourcePath: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'gamelib-shimgen-test-'))
    bottleDir = join(root, 'bottle')
    gameDir = join(bottleDir, 'drive_c', 'Program Files', 'Avernum 4')
    gameExePath = join(gameDir, 'Avernum 4.exe')
    mkdirSync(gameDir, { recursive: true })
    writeFileSync(gameExePath, 'fake-pe32-exe-bytes')

    realShimSourcePath = join(root, 'built-shim', 'steam_api.dll')
    mkdirSync(join(root, 'built-shim'), { recursive: true })
    writeFileSync(realShimSourcePath, 'fake-compiled-pe32-dll-bytes-x86')

    realShim64SourcePath = join(root, 'built-shim', 'steam_api64.dll')
    writeFileSync(realShim64SourcePath, 'fake-compiled-pe32-dll-bytes-x64')

    mockedGetBottleDir.mockReturnValue(bottleDir)
    mockedScanSteamApiImports.mockReset()
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  const shimDestPath = () => join(gameDir, 'steam_api.dll')
  const shim64DestPath = () => join(gameDir, 'steam_api64.dll')

  it('places the shim next to the .exe and returns success, with a clean verdict', async () => {
    mockedScanSteamApiImports.mockResolvedValue({
      status: 'ok',
      arch: 'x86',
      symbols: ['SteamAPI_Init', 'SteamAPI_Shutdown']
    })

    const result = await placeShimForGame('1234', gameExePath, {
      shimSourcePath: realShimSourcePath
    })

    expect(result.status).toBe('placed')
    if (result.status === 'placed' || result.status === 'already-placed') {
      expect(result.shimPath).toBe(shimDestPath())
      expect(result.verdict).toMatchObject({
        status: 'clean',
        arch: 'x86',
        missingSymbols: [],
        interfaceVersions: {}
      })
    }
    expect(existsSync(shimDestPath())).toBe(true)
    expect(readFileSync(shimDestPath(), 'utf-8')).toBe(
      'fake-compiled-pe32-dll-bytes-x86'
    )
  })

  it('quick/261016-u1w (D-B): resolves the per-game bridge bottle name by default, not the shared legacy name, when no opts.bottleName is given', async () => {
    mockedScanSteamApiImports.mockResolvedValue({
      status: 'ok',
      arch: 'x86',
      symbols: ['SteamAPI_Init', 'SteamAPI_Shutdown']
    })

    await placeShimForGame('1234', gameExePath, {
      shimSourcePath: realShimSourcePath
    })

    expect(mockedGetBottleDir).toHaveBeenCalledWith(
      resolveBridgeBottleName('1234')
    )
    expect(mockedGetBottleDir).not.toHaveBeenCalledWith('GameLibSteamBridge')
  })

  it("OVERWRITES a byte-different file already at shimPath (D-UAT-24-04: the game's own depot-shipped steam_api.dll must not survive)", async () => {
    // Pre-seed a byte-different "game's own dll" stub at the shim
    // destination -- this is the exact scenario D-UAT-24-04 found: the
    // depot download runs BEFORE placeShimForGame and leaves its own
    // steam_api.dll sitting at shimPath.
    writeFileSync(shimDestPath(), 'x'.repeat(100))
    mockedScanSteamApiImports.mockResolvedValue({
      status: 'ok',
      arch: 'x86',
      symbols: ['SteamAPI_Init', 'SteamAPI_Shutdown']
    })

    const result = await placeShimForGame('1234', gameExePath, {
      shimSourcePath: realShimSourcePath
    })

    expect(result.status).toBe('placed')
    expect(readFileSync(shimDestPath(), 'utf-8')).toBe(
      'fake-compiled-pe32-dll-bytes-x86'
    )
    // The coverage check still ran before the overwrite (not skipped just
    // because a file was already present).
    expect(mockedScanSteamApiImports).toHaveBeenCalledTimes(1)
  })

  it('is idempotent -- a second call does not error and the shim is present exactly once (the import scan now runs on every call to learn the arch, but each call still performs exactly one scan)', async () => {
    mockedScanSteamApiImports.mockResolvedValue({
      status: 'ok',
      arch: 'x86',
      symbols: ['SteamAPI_Init', 'SteamAPI_Shutdown']
    })

    const first = await placeShimForGame('1234', gameExePath, {
      shimSourcePath: realShimSourcePath
    })
    expect(first.status).toBe('placed')
    expect(mockedScanSteamApiImports).toHaveBeenCalledTimes(1)

    const second = await placeShimForGame('1234', gameExePath, {
      shimSourcePath: realShimSourcePath
    })
    expect(second).toEqual({
      status: 'already-placed',
      drmWrapper: 'none',
      exeArch: null,
      shimPath: shimDestPath()
    })
    // Phase 51 Plan 07: the arch must be known before the target filename
    // can even be computed, so the scan now runs again on the second
    // call too -- it is the version-capture/coverage work (not the scan)
    // that the byte-identity short-circuit skips.
    expect(mockedScanSteamApiImports).toHaveBeenCalledTimes(2)
    expect(existsSync(shimDestPath())).toBe(true)
  })

  it('returns "placed-miss" (not an error) when the shim export set does not cover an imported flat symbol, and places the shim anyway', async () => {
    mockedScanSteamApiImports.mockResolvedValue({
      status: 'ok',
      arch: 'x86',
      symbols: ['SteamAPI_Init', 'SteamAPI_ISteamRemoteStorage_v016']
    })

    const result = await placeShimForGame('1234', gameExePath, {
      shimSourcePath: realShimSourcePath
    })

    expect(result.status).toBe('placed-miss')
    if (result.status === 'placed-miss') {
      expect(result.verdict.status).toBe('miss')
      expect(result.verdict.missingSymbols).toContain(
        'SteamAPI_ISteamRemoteStorage_v016'
      )
      expect(result.verdict.arch).toBe('x86')
      expect(result.shimPaths).toEqual([shimDestPath()])
    }
    expect(existsSync(shimDestPath())).toBe(true)
    expect(readFileSync(shimDestPath())).toEqual(
      readFileSync(realShimSourcePath)
    )

    // A second call is an identity no-op with no verdict (keeps the miss).
    const second = await placeShimForGame('1234', gameExePath, {
      shimSourcePath: realShimSourcePath
    })
    expect(second).toEqual({
      status: 'already-placed',
      drmWrapper: 'none',
      exeArch: null,
      shimPath: shimDestPath()
    })
  })

  it('on a coverage miss, OVERWRITES a pre-seeded, byte-different target file with the shim (quick 261023-oq7)', async () => {
    writeFileSync(shimDestPath(), 'the-games-own-steam_api.dll-bytes')
    mockedScanSteamApiImports.mockResolvedValue({
      status: 'ok',
      arch: 'x86',
      symbols: ['SteamAPI_Init', 'SteamAPI_ISteamRemoteStorage_v016']
    })

    const result = await placeShimForGame('1234', gameExePath, {
      shimSourcePath: realShimSourcePath
    })

    expect(result.status).toBe('placed-miss')
    expect(readFileSync(shimDestPath())).toEqual(
      readFileSync(realShimSourcePath)
    )
  })

  it('a missing/unresolvable required interface version is a named miss (T-51-16): the shim is still placed (quick 261023-oq7)', async () => {
    // The original dll is present but carries NO recognizable version
    // string for the imported bare accessor -- resolveRequiredInterfaceVersions
    // reports "<Family>@unknown-version", which evaluateShimCoverage
    // treats as a missing symbol, never a silent guess.
    writeFileSync(shimDestPath(), 'no-version-strings-in-here-at-all')
    mockedScanSteamApiImports.mockResolvedValue({
      status: 'ok',
      arch: 'x86',
      symbols: ['SteamUser']
    })

    const result = await placeShimForGame('1234', gameExePath, {
      shimSourcePath: realShimSourcePath
    })

    expect(result.status).toBe('placed-miss')
    if (result.status === 'placed-miss') {
      expect(result.verdict.missingSymbols).toContain(
        'SteamUser@unknown-version'
      )
    }
    expect(readFileSync(shimDestPath())).toEqual(
      readFileSync(realShimSourcePath)
    )
  })

  it('on a coverage miss, interface versions are still captured from the ORIGINAL dll before it is overwritten (quick 261023-oq7)', async () => {
    writeFileSync(shimDestPath(), 'orig SteamUser023 orig')
    mockedScanSteamApiImports.mockResolvedValue({
      status: 'ok',
      arch: 'x86',
      symbols: ['SteamUser', 'SteamAPI_ISteamRemoteStorage_v016']
    })

    const result = await placeShimForGame('1234', gameExePath, {
      shimSourcePath: realShimSourcePath
    })

    expect(result.status).toBe('placed-miss')
    if (result.status === 'placed-miss') {
      expect(result.verdict.interfaceVersions).toMatchObject({
        SteamUser: 'SteamUser023'
      })
    }
    expect(readFileSync(shimDestPath())).toEqual(
      readFileSync(realShimSourcePath)
    )
  })

  it('D-51-07: captures interface versions from the ORIGINAL dll BEFORE overwriting it -- a served version embedded only in the original produces a clean, placed verdict', async () => {
    // The original dll embeds the exact version string shimCoverage.ts
    // serves (SteamUser023) -- the built shim SOURCE file does not contain
    // this string at all (it is just placeholder text). If the
    // implementation read versions AFTER copying instead of before, this
    // version string would never be found and the placement would
    // incorrectly report "SteamUser@unknown-version" / 'miss'.
    writeFileSync(shimDestPath(), 'original-dll-bytes-SteamUser023-embedded')
    mockedScanSteamApiImports.mockResolvedValue({
      status: 'ok',
      arch: 'x86',
      symbols: ['SteamUser']
    })

    const result = await placeShimForGame('1234', gameExePath, {
      shimSourcePath: realShimSourcePath
    })

    expect(result.status).toBe('placed')
    if (result.status === 'placed') {
      expect(result.verdict?.interfaceVersions).toEqual({
        SteamUser: 'SteamUser023'
      })
    }
    expect(readFileSync(shimDestPath(), 'utf-8')).toBe(
      'fake-compiled-pe32-dll-bytes-x86'
    )
  })

  it('a target that is already an older GameLib shim (marker present) has no original left to read -- uses opts.persistedInterfaceVersions', async () => {
    writeFileSync(
      shimDestPath(),
      'an-older-release-of-our-own-shim-GameLibSteamBridgeShim/1'
    )
    mockedScanSteamApiImports.mockResolvedValue({
      status: 'ok',
      arch: 'x86',
      symbols: ['SteamUser']
    })

    const result = await placeShimForGame('1234', gameExePath, {
      shimSourcePath: realShimSourcePath,
      persistedInterfaceVersions: { SteamUser: 'SteamUser023' }
    })

    expect(result.status).toBe('placed')
    if (result.status === 'placed') {
      expect(result.verdict?.interfaceVersions).toEqual({
        SteamUser: 'SteamUser023'
      })
    }
  })

  it('a target that is already an older GameLib shim with NO persistedInterfaceVersions option -> missingSymbols names each imported bare accessor as unknown-version', async () => {
    writeFileSync(shimDestPath(), 'an-older-shim-with-127.0.0.1-embedded')
    mockedScanSteamApiImports.mockResolvedValue({
      status: 'ok',
      arch: 'x86',
      symbols: ['SteamUser']
    })

    const result = await placeShimForGame('1234', gameExePath, {
      shimSourcePath: realShimSourcePath
    })

    expect(result.status).toBe('placed-miss')
    if (result.status === 'placed-miss') {
      expect(result.verdict.missingSymbols).toContain(
        'SteamUser@unknown-version'
      )
    }
  })

  it('rejects a non-numeric appId before any copy operation', async () => {
    const result = await placeShimForGame('not-numeric', gameExePath, {
      shimSourcePath: realShimSourcePath
    })

    expect(result).toEqual({
      status: 'error',
      error: 'Invalid appId: "not-numeric"'
    })
    expect(mockedScanSteamApiImports).not.toHaveBeenCalled()
    expect(existsSync(shimDestPath())).toBe(false)
  })

  it('rejects an unsafe bottle name before any copy operation', async () => {
    const result = await placeShimForGame('1234', gameExePath, {
      bottleName: '../evil',
      shimSourcePath: realShimSourcePath
    })

    expect(result.status).toBe('error')
    if (result.status === 'error') {
      expect(result.error).toContain('Invalid bottle name')
    }
    expect(mockedScanSteamApiImports).not.toHaveBeenCalled()
    expect(existsSync(shimDestPath())).toBe(false)
  })

  it('rejects a gameExePath that resolves outside the bridge bottle', async () => {
    const outsidePath = join(root, 'outside-bottle', 'Game.exe')
    mkdirSync(join(root, 'outside-bottle'), { recursive: true })
    writeFileSync(outsidePath, 'not-in-the-bottle')

    const result = await placeShimForGame('1234', outsidePath, {
      shimSourcePath: realShimSourcePath
    })

    expect(result.status).toBe('error')
    if (result.status === 'error') {
      expect(result.error).toContain('outside the bridge bottle')
    }
    expect(mockedScanSteamApiImports).not.toHaveBeenCalled()
  })

  it('exe imports nothing from steam_api(64)?.dll -> "no-steam-api", no file written, missingSymbols []', async () => {
    mockedScanSteamApiImports.mockResolvedValue({
      status: 'ok',
      arch: 'none',
      symbols: []
    })

    const result = await placeShimForGame('1234', gameExePath, {
      shimSourcePath: realShimSourcePath
    })

    expect(result.status).toBe('no-steam-api')
    if (result.status === 'no-steam-api') {
      expect(result.verdict.missingSymbols).toEqual([])
    }
    expect(existsSync(shimDestPath())).toBe(false)
  })

  describe('CR-04: runtime-loaded steam_api in the install tree', () => {
    const noImports = () =>
      mockedScanSteamApiImports.mockResolvedValue({
        status: 'ok',
        arch: 'none',
        symbols: []
      })

    const MARK_X86 = 'GameLibSteamBridgeShim x86 build'
    const MARK_X64 = 'GameLibSteamBridgeShim x64 build'
    const withMarkedSources = () => {
      writeFileSync(realShimSourcePath, MARK_X86)
      writeFileSync(realShim64SourcePath, MARK_X64)
    }

    it('x64 DLL in a subfolder -> placed-miss naming steam_api64.dll@runtime-loaded, x64 shim copied over it', async () => {
      noImports()
      withMarkedSources()
      mkdirSync(join(gameDir, 'Plugins', 'x86_64'), { recursive: true })
      const dll = join(gameDir, 'Plugins', 'x86_64', 'steam_api64.dll')
      writeFileSync(dll, 'plain-game-dll')

      const result = await placeShimForGame('1234', gameExePath, {
        shimSourcePath: realShimSourcePath,
        shim64SourcePath: realShim64SourcePath
      })

      expect(result.status).toBe('placed-miss')
      if (result.status === 'placed-miss') {
        expect(result.verdict.status).toBe('miss')
        expect(result.verdict.arch).toBe('x64')
        expect(result.verdict.missingSymbols).toEqual([
          'steam_api64.dll@runtime-loaded'
        ])
        expect(result.shimPaths).toEqual([dll])
      }
      expect(readFileSync(dll, 'utf-8')).toBe(MARK_X64)
      expect(existsSync(shimDestPath())).toBe(false)
    })

    it('x86 DLL -> placed-miss arch x86 with steam_api.dll@runtime-loaded, x86 shim copied', async () => {
      noImports()
      withMarkedSources()
      mkdirSync(join(gameDir, 'bin'), { recursive: true })
      const dll = join(gameDir, 'bin', 'Steam_API.dll')
      writeFileSync(dll, 'plain-game-dll')

      const result = await placeShimForGame('1234', gameExePath, {
        shimSourcePath: realShimSourcePath,
        shim64SourcePath: realShim64SourcePath
      })

      expect(result.status).toBe('placed-miss')
      if (result.status === 'placed-miss') {
        expect(result.verdict.arch).toBe('x86')
        expect(result.verdict.missingSymbols).toEqual([
          'steam_api.dll@runtime-loaded'
        ])
      }
      expect(readFileSync(dll, 'utf-8')).toBe(MARK_X86)
    })

    it('both DLLs -> both markers (x86 first), arch x64, each replaced from its own source', async () => {
      noImports()
      withMarkedSources()
      mkdirSync(join(gameDir, 'a'), { recursive: true })
      writeFileSync(join(gameDir, 'a', 'steam_api.dll'), 'plain')
      writeFileSync(join(gameDir, 'a', 'steam_api64.dll'), 'plain')

      const result = await placeShimForGame('1234', gameExePath, {
        shimSourcePath: realShimSourcePath,
        shim64SourcePath: realShim64SourcePath
      })

      expect(result.status).toBe('placed-miss')
      if (result.status === 'placed-miss') {
        expect(result.verdict.arch).toBe('x64')
        expect(result.verdict.missingSymbols).toEqual([
          'steam_api.dll@runtime-loaded',
          'steam_api64.dll@runtime-loaded'
        ])
      }
      expect(readFileSync(join(gameDir, 'a', 'steam_api.dll'), 'utf-8')).toBe(
        MARK_X86
      )
      expect(readFileSync(join(gameDir, 'a', 'steam_api64.dll'), 'utf-8')).toBe(
        MARK_X64
      )
    })

    it('a second call with the shim in place is already-placed with no verdict, never no-steam-api', async () => {
      noImports()
      withMarkedSources()
      const dll = join(gameDir, 'steam_api64.dll')
      writeFileSync(dll, 'plain-game-dll')
      const opts = {
        shimSourcePath: realShimSourcePath,
        shim64SourcePath: realShim64SourcePath
      }
      await placeShimForGame('1234', gameExePath, opts)

      const second = await placeShimForGame('1234', gameExePath, opts)

      expect(second).toEqual({
        status: 'already-placed',
        drmWrapper: 'none',
        exeArch: null,
        shimPath: dll,
        shimPaths: [dll]
      })
    })

    it('quick 261023-ue0: mixed current + original shims -> placed-miss reports BOTH paths', async () => {
      noImports()
      withMarkedSources()
      const current = join(gameDir, 'steam_api.dll')
      writeFileSync(current, MARK_X86)
      mkdirSync(join(gameDir, 'Plugins', 'x86_64'), { recursive: true })
      const original = join(gameDir, 'Plugins', 'x86_64', 'steam_api64.dll')
      writeFileSync(original, 'plain-game-dll')

      const result = await placeShimForGame('1234', gameExePath, {
        shimSourcePath: realShimSourcePath,
        shim64SourcePath: realShim64SourcePath
      })

      expect(result.status).toBe('placed-miss')
      if (result.status === 'placed-miss') {
        expect([...result.shimPaths].sort()).toEqual([current, original].sort())
      }
      expect(readFileSync(original, 'utf-8')).toBe(MARK_X64)
    })

    it('an OLDER GameLib shim in place is re-copied and reported as placed-miss with the marker verdict', async () => {
      noImports()
      withMarkedSources()
      const dll = join(gameDir, 'steam_api.dll')
      writeFileSync(dll, 'GameLibSteamBridgeShim OLD release')

      const result = await placeShimForGame('1234', gameExePath, {
        shimSourcePath: realShimSourcePath,
        shim64SourcePath: realShim64SourcePath
      })

      expect(result.status).toBe('placed-miss')
      if (result.status === 'placed-miss') {
        expect(result.verdict.missingSymbols).toEqual([
          'steam_api.dll@runtime-loaded'
        ])
      }
      expect(readFileSync(dll, 'utf-8')).toBe(MARK_X86)
    })

    it('steam_api64.dll with no x64 source built -> shim-not-built x64, nothing copied', async () => {
      noImports()
      const dll = join(gameDir, 'steam_api64.dll')
      writeFileSync(dll, 'plain-game-dll')

      const result = await placeShimForGame('1234', gameExePath, {
        shimSourcePath: realShimSourcePath,
        shim64SourcePath: join(root, 'never-built', 'steam_api64.dll')
      })

      expect(result).toEqual({ status: 'shim-not-built', arch: 'x64' })
      expect(readFileSync(dll, 'utf-8')).toBe('plain-game-dll')
    })

    it('no steam_api DLL within depth 4 -> unchanged no-steam-api', async () => {
      noImports()
      const deep = join(gameDir, 'a', 'b', 'c', 'd', 'e')
      mkdirSync(deep, { recursive: true })
      writeFileSync(join(deep, 'steam_api.dll'), 'plain')

      const result = await placeShimForGame('1234', gameExePath, {
        shimSourcePath: realShimSourcePath
      })

      expect(result.status).toBe('no-steam-api')
    })

    it('a lone GameLib shim DLL is no longer ignored: an up-to-date one is already-placed', async () => {
      noImports()
      writeFileSync(
        join(gameDir, 'steam_api.dll'),
        'GameLibSteamBridgeShim bytes'
      )
      writeFileSync(realShimSourcePath, 'GameLibSteamBridgeShim bytes')

      const result = await placeShimForGame('1234', gameExePath, {
        shimSourcePath: realShimSourcePath
      })

      expect(result).toEqual({
        status: 'already-placed',
        drmWrapper: 'none',
        exeArch: null,
        shimPath: join(gameDir, 'steam_api.dll'),
        shimPaths: [join(gameDir, 'steam_api.dll')]
      })
    })

    it('an explicit gameInstallRoot outside the bottle falls back to the exe dir', async () => {
      noImports()
      const outside = join(root, 'outside-bottle')
      mkdirSync(outside, { recursive: true })
      writeFileSync(join(outside, 'steam_api.dll'), 'plain')

      const result = await placeShimForGame('1234', gameExePath, {
        shimSourcePath: realShimSourcePath,
        gameInstallRoot: outside
      })

      expect(result.status).toBe('no-steam-api')
    })
  })

  it('returns a typed "shim-not-built" result (not a throw) when the built x86 shim is absent -- dev-time expected state', async () => {
    mockedScanSteamApiImports.mockResolvedValue({
      status: 'ok',
      arch: 'x86',
      symbols: ['SteamAPI_Init']
    })

    const result = await placeShimForGame('1234', gameExePath, {
      shimSourcePath: join(root, 'never-built', 'steam_api.dll')
    })

    expect(result).toEqual({ status: 'shim-not-built', arch: 'x86' })
    expect(existsSync(shimDestPath())).toBe(false)
  })

  it('returns "shim-not-built" even when a game dll is already present at shimPath (missing-source check runs before the identity check)', async () => {
    writeFileSync(shimDestPath(), 'the-games-own-steam_api.dll-bytes')
    mockedScanSteamApiImports.mockResolvedValue({
      status: 'ok',
      arch: 'x86',
      symbols: ['SteamAPI_Init']
    })

    const result = await placeShimForGame('1234', gameExePath, {
      shimSourcePath: join(root, 'never-built', 'steam_api.dll')
    })

    expect(result).toEqual({ status: 'shim-not-built', arch: 'x86' })
    expect(readFileSync(shimDestPath(), 'utf-8')).toBe(
      'the-games-own-steam_api.dll-bytes'
    )
  })

  it('falls back to the real builtBridgeShimPath import when no shimSourcePath override is given (BLOCKER 2 default)', async () => {
    // The jest-mocked backend/constants/paths.builtBridgeShimPath points
    // at a deliberately nonexistent path -- this proves placeShimForGame
    // actually reads THAT imported binding by default (not a second,
    // divergently-hardcoded path that would happen to exist).
    mockedScanSteamApiImports.mockResolvedValue({
      status: 'ok',
      arch: 'x86',
      symbols: ['SteamAPI_Init']
    })

    const result = await placeShimForGame('1234', gameExePath)
    expect(result).toEqual({ status: 'shim-not-built', arch: 'x86' })
  })

  it('x64: an exe importing steam_api64.dll targets steam_api64.dll (filename/source selection), sourced from the x64 shim -- a genuinely uncovered x64 symbol is a named miss, never a silent placement', async () => {
    mockedScanSteamApiImports.mockResolvedValue({
      status: 'ok',
      arch: 'x64',
      // 51-15: SHIM64_EXPORTED_SYMBOLS is now populated (D-51-13 GO) --
      // SteamAPI_Init IS covered, but SteamHTTP (never widened by any
      // Phase 51 plan to date, same still-uncovered example
      // shimCoverage.test.ts uses) is not, so this stays a real miss
      // rather than silently becoming 'placed'.
      symbols: ['SteamAPI_Init', 'SteamHTTP']
    })

    const result = await placeShimForGame('1234', gameExePath, {
      shim64SourcePath: realShim64SourcePath
    })

    // The fail-closed default (T-51-16) means a genuinely uncovered x64
    // symbol is a named 'placed-miss', not a silent 'placed'.
    expect(result.status).toBe('placed-miss')
    if (result.status === 'placed-miss') {
      expect(result.verdict.arch).toBe('x64')
      expect(result.verdict.missingSymbols).toEqual(
        expect.arrayContaining(['SteamHTTP'])
      )
      expect(result.verdict.missingSymbols).not.toContain('SteamAPI_Init')
    }
    // quick 261023-oq7: the x64 shim is placed anyway; the x86 target never is.
    expect(readFileSync(shim64DestPath())).toEqual(
      readFileSync(realShim64SourcePath)
    )
    expect(existsSync(shimDestPath())).toBe(false)
  })

  it('x64: falls back to the real builtBridgeShim64Path import when no shim64SourcePath override is given, defaulting to a typed shim-not-built result', async () => {
    mockedScanSteamApiImports.mockResolvedValue({
      status: 'ok',
      arch: 'x64',
      symbols: ['SteamAPI_Init']
    })

    const result = await placeShimForGame('1234', gameExePath)
    expect(result).toEqual({ status: 'shim-not-built', arch: 'x64' })
  })

  it('x64: "shim-not-built" (D-51-13) when no Win64 shim target is bundled, even with a game dll already at the x64 target path', async () => {
    writeFileSync(shim64DestPath(), 'the-games-own-steam_api64.dll-bytes')
    mockedScanSteamApiImports.mockResolvedValue({
      status: 'ok',
      arch: 'x64',
      symbols: ['SteamAPI_Init']
    })

    const result = await placeShimForGame('1234', gameExePath, {
      shim64SourcePath: join(root, 'never-built', 'steam_api64.dll')
    })

    expect(result).toEqual({ status: 'shim-not-built', arch: 'x64' })
    expect(readFileSync(shim64DestPath(), 'utf-8')).toBe(
      'the-games-own-steam_api64.dll-bytes'
    )
  })

  it('a byte-identical target is "already-placed" with no verdict (the caller keeps its own persisted one)', async () => {
    mockedScanSteamApiImports.mockResolvedValue({
      status: 'ok',
      arch: 'x86',
      symbols: ['SteamAPI_Init', 'SteamAPI_Shutdown']
    })
    writeFileSync(shimDestPath(), 'fake-compiled-pe32-dll-bytes-x86')

    const result = await placeShimForGame('1234', gameExePath, {
      shimSourcePath: realShimSourcePath
    })

    expect(result).toEqual({
      status: 'already-placed',
      drmWrapper: 'none',
      exeArch: null,
      shimPath: shimDestPath()
    })
  })

  it('BLOCKER 2: shimGenerate.ts source imports builtBridgeShimPath from backend/constants/paths and defines no second hardcoded .dll source-location string', () => {
    const source = readFileSync(
      join(__dirname, '..', 'shimGenerate.ts'),
      'utf-8'
    )
    expect(source).toMatch(
      /import\s*\{[^}]*\bbuiltBridgeShimPath\b[^}]*\}\s*from\s*'backend\/constants\/paths'/
    )
    // Every absolute-looking `.dll` string literal in the whole file must
    // be one of the two destination FILENAME constants (no path
    // separators), not a second hardcoded source location.
    const dllStringLiterals = [...source.matchAll(/'[^']*\.dll'/g)].map(
      (m) => m[0]
    )
    for (const literal of dllStringLiterals) {
      expect(['steam_api.dll', 'steam_api64.dll']).toContain(
        literal.slice(1, -1)
      )
    }
  })

  it('24-CR-02: a game importing every symbol steam_api.def exports (including the SteamUser/SteamFriends interface accessors) is placed, not rejected', async () => {
    // Every bare accessor the .def exports now requires a resolvable
    // interface version (D-51-07) -- seed the original dll with exactly
    // the versions shimCoverage.ts serves so this stays a true "fully
    // covered" exercise, not an accidental miss. 51-11 widened the bare
    // accessor set to SteamUtils/SteamApps/SteamUserStats (old-style
    // version strings); 51-14 widens it again to
    // SteamRemoteStorage/SteamMatchmaking/SteamMatchmakingServers/
    // SteamNetworking (the GameServer* names are flat exports, not family
    // accessors, so they need no version string here). All must be
    // embedded, alongside SteamUser023/SteamFriends018.
    writeFileSync(
      shimDestPath(),
      'original-dll-bytes-SteamUser023-SteamFriends018-SteamUtils005-' +
        'STEAMAPPS_INTERFACE_VERSION004-STEAMUSERSTATS_INTERFACE_VERSION010-' +
        'STEAMREMOTESTORAGE_INTERFACE_VERSION005-SteamMatchMaking009-' +
        'SteamMatchMakingServers002-SteamNetworking005-embedded'
    )
    mockedScanSteamApiImports.mockResolvedValue({
      status: 'ok',
      arch: 'x86',
      symbols: readDefExports()
    })

    const result = await placeShimForGame('1234', gameExePath, {
      shimSourcePath: realShimSourcePath
    })

    expect(result.status).toBe('placed')
    if (result.status === 'placed') {
      expect(result.shimPath).toBe(shimDestPath())
      expect(result.verdict?.missingSymbols).toEqual([])
    }
  })

  describe('quick 261024-i94: steam_api importer PEs in the install tree', () => {
    type Scan = {
      status: 'ok'
      arch: 'x86' | 'x64' | 'none'
      symbols: string[]
    }
    const scanByPath = (table: Record<string, Scan>) =>
      mockedScanSteamApiImports.mockImplementation(
        (_appId: string, path: string) =>
          Promise.resolve(
            table[path] ?? { status: 'ok', arch: 'none', symbols: [] }
          )
      )
    const exeScan: Scan = {
      status: 'ok',
      arch: 'x64',
      symbols: ['SteamAPI_Init', 'SteamAPI_Shutdown']
    }
    const mkImporter = (rel: string) => {
      const full = join(gameDir, rel)
      mkdirSync(join(full, '..'), { recursive: true })
      writeFileSync(full, 'importer-pe')
      return full
    }

    it('names an uncovered symbol imported by a same-arch importer PE (placed-miss)', async () => {
      const plugin = mkImporter(join('bin', 'Plugin.dll'))
      scanByPath({
        [gameExePath]: exeScan,
        [plugin]: {
          status: 'ok',
          arch: 'x64',
          symbols: ['SteamAPI_Init', 'SteamAPI_Bogus_v001']
        }
      })

      const result = await placeShimForGame('1234', gameExePath, {
        shim64SourcePath: realShim64SourcePath,
        gameInstallRoot: gameDir
      })

      expect(result.status).toBe('placed-miss')
      if (result.status === 'placed-miss') {
        expect(result.verdict.missingSymbols).toContain('SteamAPI_Bogus_v001')
      }
    })

    it('stays clean when every importer symbol is covered', async () => {
      const plugin = mkImporter(join('bin', 'Plugin.dll'))
      scanByPath({
        [gameExePath]: exeScan,
        [plugin]: { status: 'ok', arch: 'x64', symbols: ['SteamAPI_Init'] }
      })

      const result = await placeShimForGame('1234', gameExePath, {
        shim64SourcePath: realShim64SourcePath,
        gameInstallRoot: gameDir
      })

      expect(result.status).toBe('placed')
      if (result.status === 'placed') {
        expect(result.verdict?.status).toBe('clean')
      }
    })

    it('ignores an other-arch importer PE', async () => {
      const plugin = mkImporter(join('bin', 'Old.dll'))
      scanByPath({
        [gameExePath]: exeScan,
        [plugin]: {
          status: 'ok',
          arch: 'x86',
          symbols: ['SteamAPI_Bogus_v001']
        }
      })

      const result = await placeShimForGame('1234', gameExePath, {
        shim64SourcePath: realShim64SourcePath,
        gameInstallRoot: gameDir
      })

      expect(result.status).toBe('placed')
    })

    it('only scans .exe/.dll candidates, never the exe itself, steam_api*.dll or symlinks', async () => {
      const plugin = mkImporter(join('bin', 'Plugin.DLL'))
      mkImporter(join('bin', 'readme.txt'))
      mkImporter(join('bin', 'steam_api64.dll'))
      mkImporter('steam_api.dll')
      symlinkSync(plugin, join(gameDir, 'bin', 'Link.dll'))
      scanByPath({ [gameExePath]: exeScan })

      await placeShimForGame('1234', gameExePath, {
        shim64SourcePath: realShim64SourcePath,
        gameInstallRoot: gameDir
      })

      const scanned = mockedScanSteamApiImports.mock.calls.map((c) => c[1])
      expect(scanned.filter((p) => p === gameExePath)).toHaveLength(1)
      expect(scanned).toContain(plugin)
      expect(scanned).not.toContain(join(gameDir, 'bin', 'readme.txt'))
      expect(scanned).not.toContain(join(gameDir, 'bin', 'steam_api64.dll'))
      expect(scanned).not.toContain(join(gameDir, 'steam_api.dll'))
      expect(scanned).not.toContain(join(gameDir, 'bin', 'Link.dll'))
    })

    it('skips an importer whose scan errors and keeps placing', async () => {
      const plugin = mkImporter(join('bin', 'Plugin.dll'))
      mockedScanSteamApiImports.mockImplementation(
        (_appId: string, path: string) =>
          Promise.resolve(
            path === plugin
              ? { status: 'error', error: 'objdump boom' }
              : exeScan
          )
      )

      const result = await placeShimForGame('1234', gameExePath, {
        shim64SourcePath: realShim64SourcePath,
        gameInstallRoot: gameDir
      })

      expect(result.status).toBe('placed')
    })

    it('never walks on the byte-identical already-placed path (exactly one scan)', async () => {
      mkImporter(join('bin', 'Plugin.dll'))
      writeFileSync(shim64DestPath(), 'fake-compiled-pe32-dll-bytes-x64')
      mockedScanSteamApiImports.mockResolvedValue(exeScan)

      const result = await placeShimForGame('1234', gameExePath, {
        shim64SourcePath: realShim64SourcePath,
        gameInstallRoot: gameDir
      })

      expect(result.status).toBe('already-placed')
      expect(mockedScanSteamApiImports).toHaveBeenCalledTimes(1)
    })
  })

  describe('quick 261024-i94: runtime-loaded branch names importer symbols', () => {
    type Scan = {
      status: 'ok'
      arch: 'x86' | 'x64' | 'none'
      symbols: string[]
    }
    const scanByPath = (table: Record<string, Scan>) =>
      mockedScanSteamApiImports.mockImplementation(
        (_appId: string, path: string) =>
          Promise.resolve(
            table[path] ?? { status: 'ok', arch: 'none', symbols: [] }
          )
      )
    const writeX64Exe = () => {
      const pe = buildMinimalPe([])
      pe.writeUInt16LE(0x8664, 0x80 + 4)
      writeFileSync(gameExePath, pe)
    }
    const put = (rel: string, body = 'plain-game-dll') => {
      const full = join(gameDir, rel)
      mkdirSync(join(full, '..'), { recursive: true })
      writeFileSync(full, body)
      return full
    }
    const MARK_X86 = 'GameLibSteamBridgeShim x86 build'
    const MARK_X64 = 'GameLibSteamBridgeShim x64 build'
    const grimDawnTree = (engineSymbols: string[]) => {
      writeX64Exe()
      writeFileSync(realShimSourcePath, MARK_X86)
      writeFileSync(realShim64SourcePath, MARK_X64)
      const dll64 = put(join('x64', 'steam_api64.dll'))
      const dll86 = put('steam_api.dll')
      const engine64 = put(join('x64', 'Engine.dll'))
      const engine86 = put('Engine.dll')
      scanByPath({
        [engine64]: { status: 'ok', arch: 'x64', symbols: engineSymbols },
        [engine86]: {
          status: 'ok',
          arch: 'x86',
          symbols: ['SteamInternal_SteamAPI_Init']
        }
      })
      return { dll64, dll86 }
    }
    const opts = () => ({
      shimSourcePath: realShimSourcePath,
      shim64SourcePath: realShim64SourcePath,
      gameInstallRoot: gameDir
    })

    it('Grim Dawn shape: names the x64 importer uncovered symbol only, still replaces both dlls', async () => {
      const { dll64, dll86 } = grimDawnTree([
        'SteamInternal_SteamAPI_Init',
        'SteamInternal_Bogus'
      ])

      const result = await placeShimForGame('1234', gameExePath, opts())

      expect(result.status).toBe('placed-miss')
      if (result.status === 'placed-miss') {
        expect(result.verdict.arch).toBe('x64')
        expect(result.verdict.missingSymbols).toEqual(['SteamInternal_Bogus'])
      }
      expect(readFileSync(dll64, 'utf-8')).toBe(MARK_X64)
      expect(readFileSync(dll86, 'utf-8')).toBe(MARK_X86)
    })

    it('covered importer -> clean placed verdict listing both shim paths', async () => {
      const { dll64, dll86 } = grimDawnTree(['SteamInternal_SteamAPI_Init'])

      const result = await placeShimForGame('1234', gameExePath, opts())

      expect(result.status).toBe('placed')
      if (result.status === 'placed') {
        expect(result.verdict?.status).toBe('clean')
        expect(result.verdict?.arch).toBe('x64')
        expect(result.shimPaths).toEqual(expect.arrayContaining([dll64, dll86]))
        expect(result.shimPaths).toHaveLength(2)
      }
    })

    it('Unity shape: shipped steam_api64.dll with no importer keeps the marker', async () => {
      writeX64Exe()
      writeFileSync(realShim64SourcePath, MARK_X64)
      put(join('Plugins', 'steam_api64.dll'))
      scanByPath({})

      const result = await placeShimForGame('1234', gameExePath, opts())

      expect(result.status).toBe('placed-miss')
      if (result.status === 'placed-miss') {
        expect(result.verdict.missingSymbols).toEqual([
          'steam_api64.dll@runtime-loaded'
        ])
      }
    })

    it('already-current shims run no importer walk (one scan only)', async () => {
      writeX64Exe()
      writeFileSync(realShim64SourcePath, MARK_X64)
      put(join('x64', 'steam_api64.dll'), MARK_X64)
      put(join('x64', 'Engine.dll'))
      scanByPath({})

      const result = await placeShimForGame('1234', gameExePath, opts())

      expect(result.status).toBe('already-placed')
      expect(mockedScanSteamApiImports).toHaveBeenCalledTimes(1)
    })
  })

  describe('quick 261024-ir1: Unreal stub plus Shipping layout', () => {
    type Scan = {
      status: 'ok'
      arch: 'x86' | 'x64' | 'none'
      symbols: string[]
    }
    const scanByPath = (table: Record<string, Scan>) =>
      mockedScanSteamApiImports.mockImplementation(
        (_appId: string, path: string) =>
          Promise.resolve(
            table[path] ?? { status: 'ok', arch: 'none', symbols: [] }
          )
      )
    const writeX64Stub = () => {
      const pe = buildMinimalPe([])
      pe.writeUInt16LE(0x8664, 0x80 + 4)
      writeFileSync(gameExePath, pe)
    }
    const put = (rel: string, body = 'plain-game-dll') => {
      const full = join(gameDir, rel)
      mkdirSync(join(full, '..'), { recursive: true })
      writeFileSync(full, body)
      return full
    }
    const MARK_X64 = 'GameLibSteamBridgeShim x64 build'
    const COVERED = [
      'SteamAPI_RestartAppIfNecessary',
      'SteamInternal_SteamAPI_Init'
    ]
    const opts = () => ({
      shimSourcePath: realShimSourcePath,
      shim64SourcePath: realShim64SourcePath,
      gameInstallRoot: gameDir
    })
    const ueTree = (project: string, sdk: string, steamworksDll = true) => {
      gameExePath = join(gameDir, `${project}.exe`)
      writeX64Stub()
      writeFileSync(realShim64SourcePath, MARK_X64)
      const shipping = put(
        join(project, 'Binaries', 'Win64', `${project}-Win64-Shipping.exe`),
        'shipping-exe'
      )
      const dll = join(
        gameDir,
        'Engine',
        'Binaries',
        'ThirdParty',
        'Steamworks',
        sdk,
        'Win64',
        'steam_api64.dll'
      )
      if (steamworksDll) {
        put(
          join(
            'Engine',
            'Binaries',
            'ThirdParty',
            'Steamworks',
            sdk,
            'Win64',
            'steam_api64.dll'
          )
        )
      } else {
        mkdirSync(join(gameDir, 'Engine'), { recursive: true })
      }
      return { shipping, dll }
    }

    it.each([
      { appId: '1363080', project: 'ManorLords', sdk: 'Steamv157' },
      { appId: '427410', project: 'AbioticFactor', sdk: 'Steamv157' },
      { appId: '1119730', project: 'Ranch_Simulator', sdk: 'Steamv161' }
    ])(
      'field case $project: shim placed over the Engine Steamworks dll, coverage from the Shipping exe',
      async ({ appId, project, sdk }) => {
        const { shipping, dll } = ueTree(project, sdk)
        scanByPath({
          [shipping]: { status: 'ok', arch: 'x64', symbols: COVERED }
        })

        const result = await placeShimForGame(appId, gameExePath, opts())

        expect(result.status).toBe('placed')
        if (result.status === 'placed') {
          expect(result.verdict?.status).toBe('clean')
          expect(result.verdict?.arch).toBe('x64')
          expect(result.verdict?.missingSymbols).toEqual([])
          expect(result.shimPaths).toEqual([resolve(dll)])
        }
        expect(readFileSync(dll, 'utf-8')).toBe(MARK_X64)
        expect(mockedScanSteamApiImports).toHaveBeenCalledWith(appId, shipping)
      }
    )

    it('an uncovered Shipping symbol is named, not the runtime-loaded marker', async () => {
      const { shipping, dll } = ueTree('ManorLords', 'Steamv157')
      scanByPath({
        [shipping]: {
          status: 'ok',
          arch: 'x64',
          symbols: [...COVERED, 'SteamInternal_Bogus']
        }
      })

      const result = await placeShimForGame('1363080', gameExePath, opts())

      expect(result.status).toBe('placed-miss')
      if (result.status === 'placed-miss') {
        expect(result.verdict.missingSymbols).toEqual(['SteamInternal_Bogus'])
      }
      expect(readFileSync(dll, 'utf-8')).toBe(MARK_X64)
    })

    it('the Shipping exe is scanned once, ahead of the cap-bounded importer walk', async () => {
      const { shipping } = ueTree('ManorLords', 'Steamv157')
      for (let n = 0; n < 600; n++) {
        put(
          join('Engine', 'Binaries', 'ThirdParty', 'Filler', `Filler${n}.dll`)
        )
      }
      scanByPath({
        [shipping]: { status: 'ok', arch: 'x64', symbols: COVERED }
      })

      const result = await placeShimForGame('1363080', gameExePath, opts())

      expect(result.status).toBe('placed')
      if (result.status === 'placed') {
        expect(result.verdict?.status).toBe('clean')
      }
      const paths = mockedScanSteamApiImports.mock.calls.map((c) => c[1])
      expect(paths.filter((p) => p === shipping)).toHaveLength(1)
      expect(paths[1]).toBe(shipping)
      const warn = jest.requireMock('backend/logger').logWarning
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('512-file cap'),
        'Steam'
      )
    })

    it('a symlinked Steamworks dir is never followed', async () => {
      ueTree('ManorLords', 'Steamv157', false)
      const outside = join(root, 'outside')
      const outsideDll = join(outside, 'Steamv157', 'Win64', 'steam_api64.dll')
      mkdirSync(join(outside, 'Steamv157', 'Win64'), { recursive: true })
      writeFileSync(outsideDll, 'outside-dll')
      mkdirSync(join(gameDir, 'Engine', 'Binaries', 'ThirdParty'), {
        recursive: true
      })
      symlinkSync(
        outside,
        join(gameDir, 'Engine', 'Binaries', 'ThirdParty', 'Steamworks')
      )
      scanByPath({})

      const result = await placeShimForGame('1363080', gameExePath, opts())

      expect(result.status).toBe('no-steam-api')
      expect(readFileSync(outsideDll, 'utf-8')).toBe('outside-dll')
    })

    it('a symlinked Shipping exe is never scanned', async () => {
      const { shipping } = ueTree('ManorLords', 'Steamv157')
      rmSync(shipping)
      const target = join(root, 'outside-shipping.exe')
      writeFileSync(target, 'outside-exe')
      symlinkSync(target, shipping)
      scanByPath({
        [shipping]: { status: 'ok', arch: 'x64', symbols: COVERED },
        [target]: { status: 'ok', arch: 'x64', symbols: COVERED }
      })

      const result = await placeShimForGame('1363080', gameExePath, opts())

      expect(result.status).toBe('placed-miss')
      if (result.status === 'placed-miss') {
        expect(result.verdict.missingSymbols).toEqual([
          'steam_api64.dll@runtime-loaded'
        ])
      }
      const paths = mockedScanSteamApiImports.mock.calls.map((c) => c[1])
      expect(paths).not.toContain(shipping)
      expect(paths).not.toContain(target)
    })

    it('the Steamworks subtree walk is bounded', async () => {
      ueTree('ManorLords', 'Steamv157', false)
      put(
        join(
          'Engine',
          'Binaries',
          'ThirdParty',
          'Steamworks',
          'a',
          'b',
          'c',
          'd',
          'e',
          'steam_api64.dll'
        )
      )
      scanByPath({})

      const result = await placeShimForGame('1363080', gameExePath, opts())

      expect(result.status).toBe('no-steam-api')
    })

    it('no Engine dir: no Unreal probing at all', async () => {
      gameExePath = join(gameDir, 'Foo.exe')
      writeX64Stub()
      put(join('Foo', 'Binaries', 'Win64', 'Foo-Win64-Shipping.exe'), 'x')
      scanByPath({})

      const result = await placeShimForGame('1234', gameExePath, opts())

      expect(result.status).toBe('no-steam-api')
      expect(mockedScanSteamApiImports).toHaveBeenCalledTimes(1)
    })
  })

  describe('quick 261024-br4: Steam CEG detection on the game exe', () => {
    const okImports = () =>
      mockedScanSteamApiImports.mockResolvedValue({
        status: 'ok',
        arch: 'x86',
        symbols: ['SteamAPI_Init', 'SteamAPI_Shutdown']
      })

    it('a CEG exe keeps its normal status (shim still placed) and carries drm ceg', async () => {
      writeFileSync(
        gameExePath,
        buildMinimalPe(['STEAM_SPLIT_GUID', 'STEAM_GUIDD'])
      )
      okImports()

      const result = await placeShimForGame('1234', gameExePath, {
        shimSourcePath: realShimSourcePath
      })

      expect(result.status).toBe('placed')
      expect(result.drm).toEqual({
        kind: 'ceg',
        markers: ['STEAM_SPLIT_GUID', 'STEAM_GUIDD']
      })
      expect(existsSync(shimDestPath())).toBe(true)
    })

    it('a clean PE exe carries drm null', async () => {
      writeFileSync(gameExePath, buildMinimalPe([]))
      okImports()

      const result = await placeShimForGame('1234', gameExePath, {
        shimSourcePath: realShimSourcePath
      })

      expect(result.status).toBe('placed')
      expect(result.drm).toBeNull()
    })

    it('a non-PE exe carries no drm key', async () => {
      okImports()

      const result = await placeShimForGame('1234', gameExePath, {
        shimSourcePath: realShimSourcePath
      })

      expect(result.status).toBe('placed')
      expect('drm' in result).toBe(false)
    })

    it('an error result never reads the exe for DRM (non-numeric appId, exe outside the bottle)', async () => {
      writeFileSync(gameExePath, buildMinimalPe(['STEAM_SPLIT_GUID']))
      const outsidePath = join(root, 'outside-bottle', 'Game.exe')
      mkdirSync(join(root, 'outside-bottle'), { recursive: true })
      writeFileSync(outsidePath, buildMinimalPe(['STEAM_SPLIT_GUID']))
      const mockedLogWarning = jest.requireMock('backend/logger')
        .logWarning as jest.Mock
      mockedLogWarning.mockClear()

      const badAppId = await placeShimForGame('not-numeric', gameExePath, {
        shimSourcePath: realShimSourcePath
      })
      const outside = await placeShimForGame('1234', outsidePath, {
        shimSourcePath: realShimSourcePath
      })

      expect(badAppId.status).toBe('error')
      expect(outside.status).toBe('error')
      expect('drm' in badAppId).toBe(false)
      expect('drm' in outside).toBe(false)
      const drmLogs = mockedLogWarning.mock.calls.filter(([msg]) =>
        /Steam (CEG|DRM)/.test(String(msg))
      )
      expect(drmLogs).toEqual([])
    })
  })

  describe('quick 261024-j4l: .gamelib-orig backup of game-original dlls', () => {
    type Scan = {
      status: 'ok'
      arch: 'x86' | 'x64' | 'none'
      symbols: string[]
      delaySymbols?: string[]
    }
    const scanByPath = (table: Record<string, Scan>) =>
      mockedScanSteamApiImports.mockImplementation(
        (_appId: string, path: string) =>
          Promise.resolve(
            table[path] ?? { status: 'ok', arch: 'none', symbols: [] }
          )
      )
    const MARK_X86 = 'GameLibSteamBridgeShim x86 build'
    const MARK_X64 = 'GameLibSteamBridgeShim x64 build'
    const put = (rel: string, body = 'plain-game-dll') => {
      const full = join(gameDir, rel)
      mkdirSync(join(full, '..'), { recursive: true })
      writeFileSync(full, body)
      return full
    }
    const x86Scan = () =>
      mockedScanSteamApiImports.mockResolvedValue({
        status: 'ok',
        arch: 'x86',
        symbols: ['SteamAPI_Init', 'SteamAPI_Shutdown']
      })
    const BACKUP = '.gamelib-orig'

    it('exe-imports: a game-original target is copied to <dll>.gamelib-orig before the shim lands', async () => {
      writeFileSync(shimDestPath(), 'game-original-bytes')
      x86Scan()

      const result = await placeShimForGame('1234', gameExePath, {
        shimSourcePath: realShimSourcePath
      })

      expect(result.status).toBe('placed')
      expect(readFileSync(shimDestPath(), 'utf-8')).toBe(
        'fake-compiled-pe32-dll-bytes-x86'
      )
      expect(readFileSync(shimDestPath() + BACKUP, 'utf-8')).toBe(
        'game-original-bytes'
      )
    })

    it('exe-imports: an older GameLib shim is never backed up and an existing backup is kept', async () => {
      writeFileSync(shimDestPath(), 'GameLibSteamBridgeShim old')
      writeFileSync(shimDestPath() + BACKUP, 'orig')
      x86Scan()

      const result = await placeShimForGame('1234', gameExePath, {
        shimSourcePath: realShimSourcePath
      })

      expect(result.status).toBe('placed')
      expect(readFileSync(shimDestPath() + BACKUP, 'utf-8')).toBe('orig')
    })

    it('exe-imports: a stale backup is refreshed from a new game-original', async () => {
      writeFileSync(shimDestPath(), 'new-original')
      writeFileSync(shimDestPath() + BACKUP, 'old-orig')
      x86Scan()

      await placeShimForGame('1234', gameExePath, {
        shimSourcePath: realShimSourcePath
      })

      expect(readFileSync(shimDestPath() + BACKUP, 'utf-8')).toBe(
        'new-original'
      )
    })

    it('runtime-loaded: every replaced game-original dll gets a backup beside it', async () => {
      const pe = buildMinimalPe([])
      pe.writeUInt16LE(0x8664, 0x80 + 4)
      writeFileSync(gameExePath, pe)
      writeFileSync(realShimSourcePath, MARK_X86)
      writeFileSync(realShim64SourcePath, MARK_X64)
      const dll64 = put(join('x64', 'steam_api64.dll'), 'orig64')
      const dll86 = put('steam_api.dll', 'orig86')
      const engine64 = put(join('x64', 'Engine.dll'))
      scanByPath({
        [engine64]: {
          status: 'ok',
          arch: 'x64',
          symbols: ['SteamInternal_SteamAPI_Init']
        }
      })

      const result = await placeShimForGame('1234', gameExePath, {
        shimSourcePath: realShimSourcePath,
        shim64SourcePath: realShim64SourcePath,
        gameInstallRoot: gameDir
      })

      expect(result.status).toBe('placed')
      expect(readFileSync(dll64, 'utf-8')).toBe(MARK_X64)
      expect(readFileSync(dll64 + BACKUP, 'utf-8')).toBe('orig64')
      expect(readFileSync(dll86, 'utf-8')).toBe(MARK_X86)
      expect(readFileSync(dll86 + BACKUP, 'utf-8')).toBe('orig86')
    })

    it('a backup path that is a directory aborts with error and leaves the target', async () => {
      writeFileSync(shimDestPath(), 'game-original-bytes')
      mkdirSync(shimDestPath() + BACKUP)
      x86Scan()

      const result = await placeShimForGame('1234', gameExePath, {
        shimSourcePath: realShimSourcePath
      })

      expect(result.status).toBe('error')
      expect(readFileSync(shimDestPath(), 'utf-8')).toBe('game-original-bytes')
    })

    it('a backup path that is a symlink aborts and nothing is written through it', async () => {
      writeFileSync(shimDestPath(), 'game-original-bytes')
      const outside = join(root, 'outside-backup')
      writeFileSync(outside, 'outside')
      symlinkSync(outside, shimDestPath() + BACKUP)
      x86Scan()

      const result = await placeShimForGame('1234', gameExePath, {
        shimSourcePath: realShimSourcePath
      })

      expect(result.status).toBe('error')
      expect(readFileSync(shimDestPath(), 'utf-8')).toBe('game-original-bytes')
      expect(readFileSync(outside, 'utf-8')).toBe('outside')
      expect(lstatSync(shimDestPath() + BACKUP).isSymbolicLink()).toBe(true)
    })

    it('an existing .gamelib-orig is never a dll, a shimPath or a scan candidate', async () => {
      const pe = buildMinimalPe([])
      pe.writeUInt16LE(0x8664, 0x80 + 4)
      writeFileSync(gameExePath, pe)
      writeFileSync(realShim64SourcePath, MARK_X64)
      const dll64 = put(join('x64', 'steam_api64.dll'), 'orig64')
      const backup = put(join('x64', 'steam_api64.dll' + BACKUP), 'orig64')
      const engine64 = put(join('x64', 'Engine.dll'))
      scanByPath({
        [engine64]: {
          status: 'ok',
          arch: 'x64',
          symbols: ['SteamInternal_SteamAPI_Init']
        }
      })

      const result = await placeShimForGame('1234', gameExePath, {
        shim64SourcePath: realShim64SourcePath,
        gameInstallRoot: gameDir
      })

      expect(result.status).toBe('placed')
      if (result.status === 'placed') {
        expect(result.shimPaths).toEqual([dll64])
      }
      expect(readFileSync(backup, 'utf-8')).toBe('orig64')
      const paths = mockedScanSteamApiImports.mock.calls.map((c) => c[1])
      expect(paths).not.toContain(backup)
    })
  })

  describe('quick 261024-j4l: withhold guard on delay-imported misses and unservable versions', () => {
    type Scan = {
      status: 'ok'
      arch: 'x86' | 'x64' | 'none'
      symbols: string[]
      delaySymbols?: string[]
    }
    const scanByPath = (table: Record<string, Scan>) =>
      mockedScanSteamApiImports.mockImplementation(
        (_appId: string, path: string) =>
          Promise.resolve(
            table[path] ?? { status: 'ok', arch: 'none', symbols: [] }
          )
      )
    const MARK_X64 = 'GameLibSteamBridgeShim x64 build'
    const BACKUP = '.gamelib-orig'
    const MANOR_DELAY_SYMBOLS = [
      'SteamAPI_Init',
      'SteamAPI_Shutdown',
      'SteamAPI_RunCallbacks',
      'SteamAPI_RestartAppIfNecessary',
      'SteamAPI_RegisterCallback',
      'SteamAPI_UnregisterCallback',
      'SteamAPI_RegisterCallResult',
      'SteamAPI_UnregisterCallResult',
      'SteamAPI_GetHSteamUser',
      'SteamAPI_GetHSteamPipe',
      'SteamInternal_FindOrCreateUserInterface',
      'SteamInternal_ContextInit',
      'SteamInternal_CreateInterface',
      'SteamInternal_GameServer_Init'
    ]
    const COVERED = [
      'SteamAPI_RestartAppIfNecessary',
      'SteamInternal_SteamAPI_Init',
      'SteamInternal_FindOrCreateUserInterface'
    ]
    const put = (rel: string, body = 'plain-game-dll') => {
      const full = join(gameDir, rel)
      mkdirSync(join(full, '..'), { recursive: true })
      writeFileSync(full, body)
      return full
    }
    const opts = () => ({
      shimSourcePath: realShimSourcePath,
      shim64SourcePath: realShim64SourcePath,
      gameInstallRoot: gameDir
    })
    // The ir1 UE layout: x64 stub exe + Shipping exe + Engine Steamworks dll.
    const ueTree = (exeBody: string, dllBody = 'plain-game-dll') => {
      gameExePath = join(gameDir, 'ManorLords.exe')
      const pe = buildMinimalPe([])
      pe.writeUInt16LE(0x8664, 0x80 + 4)
      writeFileSync(gameExePath, pe)
      writeFileSync(realShim64SourcePath, MARK_X64)
      const shipping = put(
        join(
          'ManorLords',
          'Binaries',
          'Win64',
          'ManorLords-Win64-Shipping.exe'
        ),
        exeBody
      )
      const dllRel = join(
        'Engine',
        'Binaries',
        'ThirdParty',
        'Steamworks',
        'Steamv157',
        'Win64',
        'steam_api64.dll'
      )
      const dll = put(dllRel, dllBody)
      return { shipping, dll }
    }
    const warnings = () =>
      (jest.requireMock('backend/logger').logWarning as jest.Mock).mock.calls
        .map((c) => (Array.isArray(c[0]) ? String(c[0][0]) : String(c[0])))
        .filter((m) => m.includes('withheld'))

    it('Manor Lords shape: withheld, dll untouched, no backup, verdict names the gaps', async () => {
      const { shipping, dll } = ueTree(
        'SteamUser019 SteamFriends017 SteamUtils008'
      )
      scanByPath({
        [shipping]: {
          status: 'ok',
          arch: 'x64',
          symbols: MANOR_DELAY_SYMBOLS,
          delaySymbols: MANOR_DELAY_SYMBOLS
        }
      })

      const result = await placeShimForGame('1363080', gameExePath, opts())

      expect(result.status).toBe('withheld')
      if (result.status === 'withheld') {
        expect(result.restored).toEqual([])
        expect(result.verdict.status).toBe('miss')
        expect(result.verdict.arch).toBe('x64')
        expect(result.verdict.missingSymbols).toContain(
          'SteamInternal_GameServer_Init'
        )
        expect(result.verdict.missingSymbols).toContain('SteamFriends017')
        expect(result.verdict.missingSymbols).not.toContain('SteamUser019')
      }
      expect(readFileSync(dll, 'utf-8')).toBe('plain-game-dll')
      expect(existsSync(dll + BACKUP)).toBe(false)
      const warned = warnings()
      expect(warned).toHaveLength(1)
      expect(warned[0]).toContain('SteamInternal_GameServer_Init')
      expect(warned[0]).toContain('SteamFriends017')
    })

    it('a delay-only gap with every version served is withheld', async () => {
      const { shipping, dll } = ueTree('SteamUser019 SteamFriends015')
      scanByPath({
        [shipping]: {
          status: 'ok',
          arch: 'x64',
          symbols: [...COVERED, 'SteamAPI_Bogus'],
          delaySymbols: ['SteamAPI_Bogus']
        }
      })

      const result = await placeShimForGame('1363080', gameExePath, opts())

      expect(result.status).toBe('withheld')
      expect(readFileSync(dll, 'utf-8')).toBe('plain-game-dll')
    })

    it('a skew-only gap (static, all symbols covered) is withheld', async () => {
      const { shipping, dll } = ueTree('SteamUser019 SteamFriends017')
      scanByPath({
        [shipping]: { status: 'ok', arch: 'x64', symbols: COVERED }
      })

      const result = await placeShimForGame('1363080', gameExePath, opts())

      expect(result.status).toBe('withheld')
      if (result.status === 'withheld') {
        expect(result.verdict.missingSymbols).toEqual(['SteamFriends017'])
      }
      expect(readFileSync(dll, 'utf-8')).toBe('plain-game-dll')
    })

    it('ELEX shape (served families + null-object-only families) is still placed', async () => {
      const { shipping, dll } = ueTree(
        'SteamUser019 SteamFriends015 SteamUtils008 STEAMHTTP_INTERFACE_VERSION003 STEAMUGC_INTERFACE_VERSION010'
      )
      scanByPath({
        [shipping]: { status: 'ok', arch: 'x64', symbols: COVERED }
      })

      const result = await placeShimForGame('1363080', gameExePath, opts())

      expect(result.status).toBe('placed')
      expect(readFileSync(dll, 'utf-8')).toBe(MARK_X64)
    })

    it('restores the original from .gamelib-orig when the guard trips over an older shim', async () => {
      const { shipping, dll } = ueTree(
        'SteamUser019 SteamFriends015',
        'GameLibSteamBridgeShim old'
      )
      writeFileSync(dll + BACKUP, 'orig-bytes')
      scanByPath({
        [shipping]: {
          status: 'ok',
          arch: 'x64',
          symbols: [...COVERED, 'SteamAPI_Bogus'],
          delaySymbols: ['SteamAPI_Bogus']
        }
      })

      const result = await placeShimForGame('1363080', gameExePath, opts())

      expect(result.status).toBe('withheld')
      if (result.status === 'withheld') {
        expect(result.restored).toEqual([resolve(dll)])
      }
      expect(readFileSync(dll, 'utf-8')).toBe('orig-bytes')
      expect(readFileSync(dll + BACKUP, 'utf-8')).toBe('orig-bytes')
    })

    const allWarnings = () =>
      (
        jest.requireMock('backend/logger').logWarning as jest.Mock
      ).mock.calls.map((c) =>
        Array.isArray(c[0]) ? String(c[0][0]) : String(c[0])
      )
    const bogusScan = (shipping: string) =>
      scanByPath({
        [shipping]: {
          status: 'ok',
          arch: 'x64',
          symbols: [...COVERED, 'SteamAPI_Bogus'],
          delaySymbols: ['SteamAPI_Bogus']
        }
      })

    it('a game-original dll in place is withheld with the truthful own-steam_api warning', async () => {
      const { shipping, dll } = ueTree('SteamUser019 SteamFriends015')
      bogusScan(shipping)

      const result = await placeShimForGame('1363080', gameExePath, opts())

      expect(result.status).toBe('withheld')
      expect(readFileSync(dll, 'utf-8')).toBe('plain-game-dll')
      expect(
        allWarnings().filter((m) => m.includes("game's own steam_api"))
      ).toHaveLength(1)
    })

    it('without a backup the stale shim is refreshed, placed-miss, and no own-steam_api line is logged', async () => {
      const { shipping, dll } = ueTree(
        'SteamUser019 SteamFriends015',
        'GameLibSteamBridgeShim old'
      )
      bogusScan(shipping)

      const result = await placeShimForGame('1363080', gameExePath, opts())

      expect(result.status).toBe('placed-miss')
      if (result.status === 'placed-miss') {
        expect(result.verdict.missingSymbols).toContain('SteamAPI_Bogus')
      }
      expect(readFileSync(dll, 'utf-8')).toBe(MARK_X64)
      const warned = allWarnings()
      expect(warned.some((m) => m.includes("game's own steam_api"))).toBe(false)
      const cannot = warned.filter((m) => m.includes('cannot withhold'))
      expect(cannot).toHaveLength(1)
      expect(cannot[0]).toContain('Verify')
    })

    it('a tampered backup that carries the shim marker is not restored; the shim is refreshed', async () => {
      const { shipping, dll } = ueTree(
        'SteamUser019 SteamFriends015',
        'GameLibSteamBridgeShim old'
      )
      writeFileSync(dll + BACKUP, 'GameLibSteamBridgeShim tampered')
      bogusScan(shipping)

      const result = await placeShimForGame('1363080', gameExePath, opts())

      expect(result.status).toBe('placed-miss')
      expect(readFileSync(dll, 'utf-8')).toBe(MARK_X64)
      expect(readFileSync(dll + BACKUP, 'utf-8')).toBe(
        'GameLibSteamBridgeShim tampered'
      )
      expect(
        allWarnings().some((m) => m.includes("game's own steam_api"))
      ).toBe(false)
    })

    it('runtime-loaded, two shim targets with one backup: nothing is restored, both are refreshed', async () => {
      const { shipping, dll } = ueTree(
        'SteamUser019 SteamFriends015',
        'GameLibSteamBridgeShim old'
      )
      writeFileSync(dll + BACKUP, 'orig-bytes')
      const second = put(
        join('Plugins', 'x86_64', 'steam_api64.dll'),
        'GameLibSteamBridgeShim old'
      )
      bogusScan(shipping)

      const result = await placeShimForGame('1363080', gameExePath, opts())

      expect(result.status).toBe('placed-miss')
      expect(readFileSync(dll, 'utf-8')).toBe(MARK_X64)
      expect(readFileSync(second, 'utf-8')).toBe(MARK_X64)
      expect(readFileSync(dll + BACKUP, 'utf-8')).toBe('orig-bytes')
    })

    it('a restore that fails mid-withhold is an error, with no own-steam_api line', async () => {
      const { shipping, dll } = ueTree(
        'SteamUser019 SteamFriends015',
        'GameLibSteamBridgeShim old'
      )
      writeFileSync(dll + BACKUP, 'orig-bytes')
      chmodSync(dll, 0o444)
      bogusScan(shipping)

      const result = await placeShimForGame('1363080', gameExePath, opts())

      chmodSync(dll, 0o644)
      expect(result.status).toBe('error')
      expect(
        allWarnings().some((m) => m.includes("game's own steam_api"))
      ).toBe(false)
    })

    it('exe-imports branch: a delay-imported miss withholds and leaves the game-original target', async () => {
      writeFileSync(shim64DestPath(), 'game-original-bytes')
      const pe = buildMinimalPe([])
      pe.writeUInt16LE(0x8664, 0x80 + 4)
      writeFileSync(gameExePath, pe)
      mockedScanSteamApiImports.mockResolvedValue({
        status: 'ok',
        arch: 'x64',
        symbols: ['SteamAPI_Init', 'SteamAPI_Bogus'],
        delaySymbols: ['SteamAPI_Bogus']
      })

      const result = await placeShimForGame('1234', gameExePath, {
        shim64SourcePath: realShim64SourcePath
      })

      expect(result.status).toBe('withheld')
      expect(readFileSync(shim64DestPath(), 'utf-8')).toBe(
        'game-original-bytes'
      )
      expect(existsSync(shim64DestPath() + BACKUP)).toBe(false)
    })
  })

  describe('Phase 52 Plan 08: SteamStub .bind detection', () => {
    function makePe(sectionName: string): Buffer {
      const buf = Buffer.alloc(1024)
      buf.writeUInt16LE(0x5a4d, 0)
      buf.writeUInt32LE(0x80, 0x3c)
      buf.writeUInt32LE(0x00004550, 0x80)
      buf.writeUInt16LE(1, 0x80 + 6)
      buf.writeUInt16LE(0xe0, 0x80 + 20)
      buf.write(sectionName, 0x80 + 24 + 0xe0, 'latin1')
      return buf
    }
    const scanOk = () =>
      mockedScanSteamApiImports.mockResolvedValue({
        status: 'ok',
        arch: 'x86',
        symbols: ['SteamAPI_Init']
      })

    it('detectDrmWrapper flags .bind, ignores others and unreadable files', () => {
      writeFileSync(gameExePath, makePe('.bind'))
      expect(detectDrmWrapper(gameExePath)).toBe('steamstub')
      writeFileSync(gameExePath, makePe('.text'))
      expect(detectDrmWrapper(gameExePath)).toBe('none')
      expect(detectDrmWrapper(join(root, 'missing.exe'))).toBeUndefined()
    })

    it('flags result and verdict for a .bind exe, then already-placed', async () => {
      writeFileSync(gameExePath, makePe('.bind'))
      scanOk()
      const first = await placeShimForGame('1234', gameExePath, {
        shimSourcePath: realShimSourcePath
      })
      expect(first.status).toBe('placed')
      expect('drmWrapper' in first && first.drmWrapper).toBe('steamstub')
      expect('verdict' in first && first.verdict?.drmWrapper).toBe('steamstub')
      const second = await placeShimForGame('1234', gameExePath, {
        shimSourcePath: realShimSourcePath
      })
      expect(second.status).toBe('already-placed')
      expect('drmWrapper' in second && second.drmWrapper).toBe('steamstub')
    })

    it('flags a no-steam-api verdict', async () => {
      writeFileSync(gameExePath, makePe('.bind'))
      mockedScanSteamApiImports.mockResolvedValue({
        status: 'ok',
        arch: 'x86',
        symbols: []
      })
      const res = await placeShimForGame('1234', gameExePath, {
        shimSourcePath: realShimSourcePath
      })
      if (res.status === 'no-steam-api') {
        expect(res.verdict.drmWrapper).toBe('steamstub')
      }
    })

    it("reports drmWrapper 'none' (and no verdict key) for a non-.bind exe, placed and already-placed", async () => {
      writeFileSync(gameExePath, makePe('.text'))
      scanOk()
      const res = await placeShimForGame('1234', gameExePath, {
        shimSourcePath: realShimSourcePath
      })
      expect(res.status).toBe('placed')
      expect('drmWrapper' in res && res.drmWrapper).toBe('none')
      expect(
        'verdict' in res && res.verdict && 'drmWrapper' in res.verdict
      ).toBeFalsy()
      const again = await placeShimForGame('1234', gameExePath, {
        shimSourcePath: realShimSourcePath
      })
      expect(again.status).toBe('already-placed')
      expect('drmWrapper' in again && again.drmWrapper).toBe('none')
    })

    it('omits drmWrapper when the exe cannot be read', () => {
      expect(detectDrmWrapper(join(root, 'missing.exe'))).toBeUndefined()
    })

    it('reports exeArch from the PE machine type', async () => {
      scanOk()
      const archOf = async (machine: number | null) => {
        const pe = makePe('.text')
        if (machine !== null) pe.writeUInt16LE(machine, 0x80 + 4)
        else pe.writeUInt16LE(0, 0)
        writeFileSync(gameExePath, pe)
        const res = await placeShimForGame('1234', gameExePath, {
          shimSourcePath: realShimSourcePath
        })
        return 'exeArch' in res ? res.exeArch : 'absent'
      }
      expect(await archOf(0x8664)).toBe('x64')
      expect(await archOf(0x14c)).toBe('x86')
      expect(await archOf(null)).toBeNull()
    })

    it("stamps drmWrapper 'steamstub' on a withheld result and its verdict", async () => {
      const pe = makePe('.bind')
      pe.writeUInt16LE(0x8664, 0x80 + 4)
      writeFileSync(gameExePath, pe)
      writeFileSync(shim64DestPath(), 'game-original-bytes')
      mockedScanSteamApiImports.mockResolvedValue({
        status: 'ok',
        arch: 'x64',
        symbols: ['SteamAPI_Init', 'SteamAPI_Bogus'],
        delaySymbols: ['SteamAPI_Bogus']
      })
      const res = await placeShimForGame('1234', gameExePath, {
        shim64SourcePath: realShim64SourcePath
      })
      expect(res.status).toBe('withheld')
      if (res.status === 'withheld') {
        expect(res.drmWrapper).toBe('steamstub')
        expect(res.verdict.drmWrapper).toBe('steamstub')
        expect(res.exeArch).toBe('x64')
      }
    })

    it('never opens an exe outside the bottle', async () => {
      const outside = join(root, 'outside.exe')
      writeFileSync(outside, makePe('.bind'))
      scanOk()
      const res = await placeShimForGame('1234', outside, {
        shimSourcePath: realShimSourcePath
      })
      expect(res.status).toBe('error')
      expect('drmWrapper' in res).toBe(false)
    })
  })
})
