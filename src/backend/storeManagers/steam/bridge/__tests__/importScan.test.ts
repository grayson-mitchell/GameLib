/**
 * Unit tests for the objdump-based `steam_api` import scanner (Phase 24
 * Plan 05, R3, Task 1).
 *
 * Mock strategy mirrors bottle.test.ts: `backend/utils` (spawnAsync) and
 * `backend/logger` are jest.mock'd; `resetMocks: true` in jest.config
 * means implementations must be re-established in each test.
 */

import { spawnAsync } from 'backend/utils'
import { parseSteamApiImports, scanSteamApiImports } from '../importScan'
import {
  AVERNUM_4_OBJDUMP_OUTPUT,
  HOARD_REUBEN_OBJDUMP_OUTPUT,
  NO_STEAM_API_OBJDUMP_OUTPUT
} from './fixtures/objdumpImports'

jest.mock('backend/utils', () => ({
  spawnAsync: jest.fn()
}))

jest.mock('backend/logger', () => ({
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))

const mockedSpawnAsync = spawnAsync as jest.Mock

describe('importScan', () => {
  beforeEach(() => {
    mockedSpawnAsync.mockReset()
  })

  describe('parseSteamApiImports (pure parser)', () => {
    it('extracts exactly the 2 steam_api imports from the Avernum 4 fixture', () => {
      const symbols = parseSteamApiImports(AVERNUM_4_OBJDUMP_OUTPUT)
      expect(symbols).toEqual(['SteamAPI_Init', 'SteamAPI_Shutdown'])
    })

    it('extracts exactly the 7 steam_api imports from the Hoard fixture', () => {
      const symbols = parseSteamApiImports(HOARD_REUBEN_OBJDUMP_OUTPUT)
      expect(symbols).toEqual([
        'SteamAPI_Init',
        'SteamAPI_RestartAppIfNecessary',
        'SteamAPI_RunCallbacks',
        'SteamAPI_RegisterCallback',
        'SteamAPI_UnregisterCallback',
        'SteamAPI_RegisterCallResult',
        'SteamAPI_UnregisterCallResult'
      ])
    })

    it('returns an empty array (not an error) when steam_api.dll is not imported at all', () => {
      const symbols = parseSteamApiImports(NO_STEAM_API_OBJDUMP_OUTPUT)
      expect(symbols).toEqual([])
    })

    it('never captures a symbol from a DIFFERENT DLL block', () => {
      const symbols = parseSteamApiImports(AVERNUM_4_OBJDUMP_OUTPUT)
      expect(symbols).not.toContain('GetProcAddress')
      expect(symbols).not.toContain('MessageBoxA')
    })
  })

  describe('scanSteamApiImports (spawnAsync wrapper)', () => {
    it('rejects a non-numeric appId before spawning objdump', async () => {
      const result = await scanSteamApiImports('not-numeric', '/some/Game.exe')
      expect(result).toEqual({
        status: 'error',
        error: 'Invalid appId: "not-numeric"'
      })
      expect(mockedSpawnAsync).not.toHaveBeenCalled()
    })

    it('invokes objdump argv-form -- ["--private-headers", exePath], never a shell string', async () => {
      mockedSpawnAsync.mockResolvedValue({
        code: 0,
        stdout: AVERNUM_4_OBJDUMP_OUTPUT,
        stderr: ''
      })

      await scanSteamApiImports(
        '1234',
        '/bottle/Program Files/Avernum 4/Avernum 4.exe'
      )

      expect(mockedSpawnAsync).toHaveBeenCalledTimes(1)
      expect(mockedSpawnAsync).toHaveBeenCalledWith('/usr/bin/objdump', [
        '--private-headers',
        '/bottle/Program Files/Avernum 4/Avernum 4.exe'
      ])
    })

    it('returns exactly the Avernum 4 fixture symbol set on success', async () => {
      mockedSpawnAsync.mockResolvedValue({
        code: 0,
        stdout: AVERNUM_4_OBJDUMP_OUTPUT,
        stderr: ''
      })

      const result = await scanSteamApiImports('1234', '/bottle/Avernum 4.exe')
      expect(result).toEqual({
        status: 'ok',
        symbols: ['SteamAPI_Init', 'SteamAPI_Shutdown']
      })
    })

    it('returns exactly the Hoard fixture symbol set on success', async () => {
      mockedSpawnAsync.mockResolvedValue({
        code: 0,
        stdout: HOARD_REUBEN_OBJDUMP_OUTPUT,
        stderr: ''
      })

      const result = await scanSteamApiImports('5678', '/bottle/Reuben.exe')
      expect(result.status).toBe('ok')
      if (result.status === 'ok') {
        expect(result.symbols).toHaveLength(7)
      }
    })

    it('surfaces a non-zero objdump exit code as a typed error, not a throw', async () => {
      mockedSpawnAsync.mockResolvedValue({
        code: 1,
        stdout: '',
        stderr: "objdump: 'Missing.exe': No such file"
      })

      const result = await scanSteamApiImports('1234', '/bottle/Missing.exe')
      expect(result.status).toBe('error')
    })

    it('catches a spawnAsync rejection (e.g. objdump missing) as a typed error, not an unhandled throw', async () => {
      mockedSpawnAsync.mockRejectedValue(new Error('spawn ENOENT'))

      await expect(
        scanSteamApiImports('1234', '/bottle/Avernum 4.exe')
      ).resolves.toEqual({
        status: 'error',
        error: 'Failed to run objdump: Error: spawn ENOENT'
      })
    })
  })
})
