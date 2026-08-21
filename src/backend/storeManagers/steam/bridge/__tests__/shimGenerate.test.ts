/**
 * Unit tests for automatic per-bottle shim placement (Phase 24 Plan 05,
 * R3, Task 2).
 *
 * Real-tmpdir black-box fs testing (manifest.test.ts precedent) -- node's
 * `fs`/`fs/promises` exports are non-configurable getters under this
 * project's ts-jest/CJS interop, so `jest.spyOn`/`jest.mock('node:fs', ...)`
 * cannot reliably intercept a specific call without breaking the
 * underlying real I/O. Instead this test creates a REAL temp directory
 * tree (bottle dir + game exe dir + a fixture "built shim" file) and lets
 * `placeShimForGame` perform REAL `existsSync`/`copyFileSync` calls
 * against it, then asserts on the real filesystem afterward.
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

import { placeShimForGame } from '../shimGenerate'
import { scanSteamApiImports } from '../importScan'
import { getBottleDir } from '../../bottle'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  logError: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))

jest.mock('backend/constants/paths', () => ({
  // Deliberately non-existent -- every test that needs a real source
  // binary passes `opts.shimSourcePath` explicitly (dependency injection);
  // this proves the DEFAULT truly falls back to the real import, not a
  // second hardcoded path.
  builtBridgeShimPath: '/nonexistent/mock-builtBridgeShimPath/steam_api.dll'
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
  getBottleDir: jest.fn()
}))

const mockedScanSteamApiImports = scanSteamApiImports as jest.Mock
const mockedGetBottleDir = getBottleDir as jest.Mock

describe('shimGenerate', () => {
  let root: string
  let bottleDir: string
  let gameDir: string
  let gameExePath: string
  let realShimSourcePath: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'gamelib-shimgen-test-'))
    bottleDir = join(root, 'bottle')
    gameDir = join(bottleDir, 'drive_c', 'Program Files', 'Avernum 4')
    gameExePath = join(gameDir, 'Avernum 4.exe')
    mkdirSync(gameDir, { recursive: true })
    writeFileSync(gameExePath, 'fake-pe32-exe-bytes')

    realShimSourcePath = join(root, 'built-shim', 'steam_api.dll')
    mkdirSync(join(root, 'built-shim'), { recursive: true })
    writeFileSync(realShimSourcePath, 'fake-compiled-pe32-dll-bytes')

    mockedGetBottleDir.mockReturnValue(bottleDir)
    mockedScanSteamApiImports.mockReset()
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  const shimDestPath = () => join(gameDir, 'steam_api.dll')

  it('places the shim next to the .exe and returns success', async () => {
    mockedScanSteamApiImports.mockResolvedValue({
      status: 'ok',
      symbols: ['SteamAPI_Init', 'SteamAPI_Shutdown']
    })

    const result = await placeShimForGame('1234', gameExePath, {
      shimSourcePath: realShimSourcePath
    })

    expect(result).toEqual({ status: 'placed', shimPath: shimDestPath() })
    expect(existsSync(shimDestPath())).toBe(true)
    expect(readFileSync(shimDestPath(), 'utf-8')).toBe(
      'fake-compiled-pe32-dll-bytes'
    )
  })

  it("OVERWRITES a byte-different file already at shimPath (D-UAT-24-04: the game's own depot-shipped steam_api.dll must not survive)", async () => {
    // Pre-seed a byte-different "game's own dll" stub at the shim
    // destination -- this is the exact scenario D-UAT-24-04 found: the
    // depot download runs BEFORE placeShimForGame and leaves its own
    // steam_api.dll sitting at shimPath.
    writeFileSync(shimDestPath(), 'x'.repeat(100))
    mockedScanSteamApiImports.mockResolvedValue({
      status: 'ok',
      symbols: ['SteamAPI_Init', 'SteamAPI_Shutdown']
    })

    const result = await placeShimForGame('1234', gameExePath, {
      shimSourcePath: realShimSourcePath
    })

    expect(result).toEqual({ status: 'placed', shimPath: shimDestPath() })
    expect(readFileSync(shimDestPath(), 'utf-8')).toBe(
      'fake-compiled-pe32-dll-bytes'
    )
    // The coverage check still ran before the overwrite (not skipped just
    // because a file was already present).
    expect(mockedScanSteamApiImports).toHaveBeenCalledTimes(1)
  })

  it('is idempotent -- a second call does not error and the shim is present exactly once', async () => {
    mockedScanSteamApiImports.mockResolvedValue({
      status: 'ok',
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
    // The idempotent short-circuit skips the import scan entirely on the
    // second call -- no redundant objdump work.
    expect(mockedScanSteamApiImports).toHaveBeenCalledTimes(1)
    expect(existsSync(shimDestPath())).toBe(true)
  })

  it('rejects placement when the shim export set does not cover an imported symbol (Constraint enforcement)', async () => {
    mockedScanSteamApiImports.mockResolvedValue({
      status: 'ok',
      symbols: ['SteamAPI_Init', 'SteamAPI_ISteamRemoteStorage_v016']
    })

    const result = await placeShimForGame('1234', gameExePath, {
      shimSourcePath: realShimSourcePath
    })

    expect(result.status).toBe('error')
    if (result.status === 'error') {
      expect(result.error).toContain('SteamAPI_ISteamRemoteStorage_v016')
    }
    expect(existsSync(shimDestPath())).toBe(false)
  })

  it('rejects placement on coverage failure and leaves a pre-seeded, byte-different target file UNMODIFIED (never overwrite with an insufficient shim)', async () => {
    writeFileSync(shimDestPath(), 'the-games-own-steam_api.dll-bytes')
    mockedScanSteamApiImports.mockResolvedValue({
      status: 'ok',
      symbols: ['SteamAPI_Init', 'SteamAPI_ISteamRemoteStorage_v016']
    })

    const result = await placeShimForGame('1234', gameExePath, {
      shimSourcePath: realShimSourcePath
    })

    expect(result.status).toBe('error')
    expect(readFileSync(shimDestPath(), 'utf-8')).toBe(
      'the-games-own-steam_api.dll-bytes'
    )
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

  it('returns a typed "shim-not-built" result (not a throw) when the built shim is absent -- dev-time expected state', async () => {
    const result = await placeShimForGame('1234', gameExePath, {
      shimSourcePath: join(root, 'never-built', 'steam_api.dll')
    })

    expect(result).toEqual({ status: 'shim-not-built' })
    expect(mockedScanSteamApiImports).not.toHaveBeenCalled()
    expect(existsSync(shimDestPath())).toBe(false)
  })

  it('returns "shim-not-built" even when a game dll is already present at shimPath (missing-source check runs before the identity check)', async () => {
    writeFileSync(shimDestPath(), 'the-games-own-steam_api.dll-bytes')

    const result = await placeShimForGame('1234', gameExePath, {
      shimSourcePath: join(root, 'never-built', 'steam_api.dll')
    })

    expect(result).toEqual({ status: 'shim-not-built' })
    expect(mockedScanSteamApiImports).not.toHaveBeenCalled()
    expect(readFileSync(shimDestPath(), 'utf-8')).toBe(
      'the-games-own-steam_api.dll-bytes'
    )
  })

  it('falls back to the real builtBridgeShimPath import when no shimSourcePath override is given (BLOCKER 2 default)', async () => {
    // The jest-mocked backend/constants/paths.builtBridgeShimPath points
    // at a deliberately nonexistent path -- this proves placeShimForGame
    // actually reads THAT imported binding by default (not a second,
    // divergently-hardcoded path that would happen to exist).
    const result = await placeShimForGame('1234', gameExePath)
    expect(result).toEqual({ status: 'shim-not-built' })
  })

  it('BLOCKER 2: shimGenerate.ts source imports builtBridgeShimPath from backend/constants/paths and defines no second hardcoded .dll source-location string', () => {
    const source = readFileSync(
      join(__dirname, '..', 'shimGenerate.ts'),
      'utf-8'
    )
    expect(source).toMatch(
      /import\s*\{\s*builtBridgeShimPath\s*\}\s*from\s*'backend\/constants\/paths'/
    )
    // The only absolute-looking `.dll` string literal in the whole file
    // must be the destination FILENAME constant (no path separators), not
    // a second hardcoded source location.
    const dllStringLiterals = [...source.matchAll(/'[^']*\.dll'/g)].map(
      (m) => m[0]
    )
    for (const literal of dllStringLiterals) {
      expect(literal).toBe("'steam_api.dll'")
    }
  })
})
