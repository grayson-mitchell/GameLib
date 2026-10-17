/**
 * Unit tests for the backend->shim port handoff (Phase 51 Plan 01,
 * D-51-01/T-51-02).
 *
 * Real-tmpdir black-box fs testing (shimGenerate.test.ts precedent) --
 * `writeBridgeConfig` performs REAL `writeFileSync`/`renameSync` calls
 * against a genuine temp directory tree, then this test reads the result
 * back off the real filesystem rather than mocking `node:fs`.
 *
 * `getBottleDir`/`sanitizeBottleName` are mocked at the module boundary
 * (avoids pulling in bottle.ts's transitive `electron`/`electron-store`
 * dependency graph) -- `sanitizeBottleName` is re-implemented verbatim
 * (the exact T-17-01 guard from bottle.ts:170), mirroring
 * shimGenerate.test.ts's own mock shape exactly.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { writeBridgeConfig, BRIDGE_CONFIG_FILENAME } from '../bridgeConfig'
import { getBottleDir } from '../../bottle'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  logError: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))

jest.mock('../../bottle', () => ({
  // Verbatim re-implementation of bottle.ts:170's T-17-01 guard -- kept
  // here (not imported) so this suite never loads bottle.ts's transitive
  // electron/electron-store dependency graph.
  sanitizeBottleName: (name: string | null): string | null => {
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

const mockedGetBottleDir = getBottleDir as jest.Mock

const APP_ID = '206060'
const PORT = 55123

describe('bridgeConfig.ts -- writeBridgeConfig', () => {
  let root: string
  let bottleDir: string
  let gameDir: string
  let gameExePath: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'gamelib-bridgeconfig-test-'))
    bottleDir = join(root, 'bottle')
    gameDir = join(bottleDir, 'drive_c', 'Program Files', 'Avernum 6')
    gameExePath = join(gameDir, 'Avernum 6.exe')
    mkdirSync(gameDir, { recursive: true })
    mockedGetBottleDir.mockReset().mockReturnValue(bottleDir)
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  test('writes port=<n>/appid=<id> beside the exe and returns { status: "written" }', () => {
    const result = writeBridgeConfig({
      exePath: gameExePath,
      bottleName: 'GameLibSteamBridge-206060',
      appId: APP_ID,
      port: PORT
    })

    const expectedPath = join(gameDir, BRIDGE_CONFIG_FILENAME)
    expect(result).toEqual({ status: 'written', path: expectedPath })
    expect(existsSync(expectedPath)).toBe(true)
    expect(readFileSync(expectedPath, 'utf-8')).toBe(
      `port=${PORT}\nappid=${APP_ID}\n`
    )
    // No stray .tmp file left behind on success.
    expect(existsSync(`${expectedPath}.tmp`)).toBe(false)
  })

  test('appends one iface.<Family>=<Version> line per supplied interfaceVersions entry', () => {
    const result = writeBridgeConfig({
      exePath: gameExePath,
      bottleName: 'GameLibSteamBridge-206060',
      appId: APP_ID,
      port: PORT,
      interfaceVersions: { SteamUser: '023', SteamFriends: '018' }
    })

    expect(result.status).toBe('written')
    const content = readFileSync(join(gameDir, BRIDGE_CONFIG_FILENAME), 'utf-8')
    expect(content).toBe(
      `port=${PORT}\nappid=${APP_ID}\niface.SteamUser=023\niface.SteamFriends=018\n`
    )
  })

  test('a path escaping the bottle is rejected, no file written', () => {
    const outsidePath = join(root, 'outside', 'Rogue.exe')
    mkdirSync(join(root, 'outside'), { recursive: true })

    const result = writeBridgeConfig({
      exePath: outsidePath,
      bottleName: 'GameLibSteamBridge-206060',
      appId: APP_ID,
      port: PORT
    })

    expect(result.status).toBe('error')
    expect(existsSync(join(root, 'outside', BRIDGE_CONFIG_FILENAME))).toBe(
      false
    )
  })

  test('a non-numeric appId is rejected before any path/write operation', () => {
    const result = writeBridgeConfig({
      exePath: gameExePath,
      bottleName: 'GameLibSteamBridge-206060',
      appId: 'not-numeric',
      port: PORT
    })

    expect(result).toEqual({
      status: 'error',
      error: 'Invalid appId: "not-numeric"'
    })
    expect(mockedGetBottleDir).not.toHaveBeenCalled()
    expect(existsSync(join(gameDir, BRIDGE_CONFIG_FILENAME))).toBe(false)
  })

  test('port 54 (below the ephemeral/registered floor) is rejected', () => {
    const result = writeBridgeConfig({
      exePath: gameExePath,
      bottleName: 'GameLibSteamBridge-206060',
      appId: APP_ID,
      port: 54
    })

    expect(result).toEqual({ status: 'error', error: 'Invalid port: 54' })
    expect(existsSync(join(gameDir, BRIDGE_CONFIG_FILENAME))).toBe(false)
  })

  test('port 70000 (above the valid uint16 range) is rejected', () => {
    const result = writeBridgeConfig({
      exePath: gameExePath,
      bottleName: 'GameLibSteamBridge-206060',
      appId: APP_ID,
      port: 70000
    })

    expect(result.status).toBe('error')
    expect(existsSync(join(gameDir, BRIDGE_CONFIG_FILENAME))).toBe(false)
  })

  test('an unsafe bottle name is rejected, no file written', () => {
    const result = writeBridgeConfig({
      exePath: gameExePath,
      bottleName: '../escape',
      appId: APP_ID,
      port: PORT
    })

    expect(result.status).toBe('error')
    expect(existsSync(join(gameDir, BRIDGE_CONFIG_FILENAME))).toBe(false)
  })

  test('no partial .tmp file survives a rejected call', () => {
    writeBridgeConfig({
      exePath: gameExePath,
      bottleName: 'GameLibSteamBridge-206060',
      appId: 'not-numeric',
      port: PORT
    })

    expect(existsSync(join(gameDir, `${BRIDGE_CONFIG_FILENAME}.tmp`))).toBe(
      false
    )
  })
})
