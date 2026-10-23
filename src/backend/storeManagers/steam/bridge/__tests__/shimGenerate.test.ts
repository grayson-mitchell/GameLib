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
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Phase 51 Plan 03: SHIM_EXPORTED_SYMBOLS (and its 24-CR-02 pin test) moved
// to shimCoverage.ts / shimCoverage.test.ts -- this file no longer imports
// it, since every remaining test here exercises placeShimForGame's own
// behavior (via readDefExports() below), not the constant itself.
import { isGameLibShimBytes, placeShimForGame } from '../shimGenerate'
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
})
