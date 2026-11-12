/**
 * Unit tests for the `steam_api` import scanner (Phase 24
 * Plan 05, R3, Task 1; widened Phase 51 Plan 02, Task 1 -- bare accessors,
 * `steam_api64.dll` arch detection, conflicting-heading fail-closed).
 *
 * Mock strategy: the rustInvoke leaf and
 * `backend/logger` are jest.mock'd; `resetMocks: true` in jest.config
 * means implementations must be re-established in each test.
 */

import { logInfo, logWarning } from 'backend/logger'
import { parseSteamApiImports, scanSteamApiImports } from '../importScan'
import { parseImportedDllNames, parseSteamApiImportTable } from '../importParse'
import {
  AVERNUM_4_OBJDUMP_OUTPUT,
  AVERNUM_6_OBJDUMP_OUTPUT,
  CONFLICTING_DLL_HEADINGS_OBJDUMP_OUTPUT,
  DATA_EXPORT_ROW_OBJDUMP_OUTPUT,
  ELEX_X64_OBJDUMP_OUTPUT,
  GRIM_DAWN_EXE_IMPORTS,
  HOARD_REUBEN_REAL_OBJDUMP_OUTPUT,
  HOARD_SPIKE_RECONSTRUCTED_OBJDUMP_OUTPUT,
  NO_STEAM_API_OBJDUMP_OUTPUT,
  XCOM_EU_OBJDUMP_OUTPUT
} from './fixtures/objdumpImports'

const requestRustInvoke = jest.fn()
const rust = { requestRustInvoke }

jest.mock('backend/logger', () => ({
  logWarning: jest.fn(),
  logInfo: jest.fn(),
  LogPrefix: { Steam: 'Steam', Backend: 'Backend' }
}))

const HOARD_BARE_ACCESSORS = [
  'SteamUser',
  'SteamUtils',
  'SteamFriends',
  'SteamApps',
  'SteamMatchmaking',
  'SteamNetworking',
  'SteamRemoteStorage',
  'SteamUserStats'
]

describe('importScan', () => {
  describe('parseSteamApiImports (pure wrapper over parseSteamApiImportTable)', () => {
    it('extracts exactly the 2 steam_api imports from the Avernum 4 fixture', () => {
      const symbols = parseSteamApiImports(AVERNUM_4_OBJDUMP_OUTPUT)
      expect(symbols).toEqual(['SteamAPI_Init', 'SteamAPI_Shutdown'])
    })

    it('extracts exactly the 7 steam_api imports from the reconstructed Hoard fixture', () => {
      const symbols = parseSteamApiImports(
        HOARD_SPIKE_RECONSTRUCTED_OBJDUMP_OUTPUT
      )
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

  describe('parseSteamApiImportTable (pure parser, dll/arch/symbols/conflict)', () => {
    it('reports the Avernum 6 fixture as x86 steam_api.dll with exactly the 2 lifecycle symbols', () => {
      const result = parseSteamApiImportTable(AVERNUM_6_OBJDUMP_OUTPUT)
      expect(result).toEqual({
        dll: 'steam_api.dll',
        arch: 'x86',
        symbols: ['SteamAPI_Shutdown', 'SteamAPI_Init'],
        conflict: false
      })
    })

    it('reports the real Hoard fixture as x86 with all 8 bare accessors', () => {
      const result = parseSteamApiImportTable(HOARD_REUBEN_REAL_OBJDUMP_OUTPUT)
      expect(result.dll).toBe('steam_api.dll')
      expect(result.arch).toBe('x86')
      for (const accessor of HOARD_BARE_ACCESSORS) {
        expect(result.symbols).toContain(accessor)
      }
      expect(result.conflict).toBe(false)
    })

    it('reports the XCOM fixture with the GameServer bare names alongside the client interfaces', () => {
      const result = parseSteamApiImportTable(XCOM_EU_OBJDUMP_OUTPUT)
      expect(result.dll).toBe('steam_api.dll')
      expect(result.arch).toBe('x86')
      expect(result.symbols).toContain('SteamGameServer_Init')
      expect(result.symbols).toContain('SteamGameServerUtils')
      expect(result.symbols).toContain('SteamMatchmakingServers')
    })

    it('reports the ELEX fixture as x64 steam_api64.dll with the runtime-lookup family', () => {
      const result = parseSteamApiImportTable(ELEX_X64_OBJDUMP_OUTPUT)
      expect(result.dll).toBe('steam_api64.dll')
      expect(result.arch).toBe('x64')
      expect(result.symbols).toHaveLength(10)
      expect(result.symbols).toContain('SteamInternal_CreateInterface')
      expect(result.symbols).toContain('SteamAPI_GetHSteamUser')
      expect(result.symbols).toContain('SteamAPI_GetHSteamPipe')
      expect(result.conflict).toBe(false)
    })

    it('reports a non-Steamworks binary (no steam_api heading at all) as none/null/empty', () => {
      const result = parseSteamApiImportTable(NO_STEAM_API_OBJDUMP_OUTPUT)
      expect(result).toEqual({
        dll: null,
        arch: 'none',
        symbols: [],
        conflict: false
      })
    })

    it('flags conflict: true when both steam_api.dll and steam_api64.dll headings are present', () => {
      const result = parseSteamApiImportTable(
        CONFLICTING_DLL_HEADINGS_OBJDUMP_OUTPUT
      )
      expect(result.conflict).toBe(true)
    })

    it('captures a name-only data export row (no Hint/Ord number) and never leaks a KERNEL32.dll row', () => {
      const result = parseSteamApiImportTable(DATA_EXPORT_ROW_OBJDUMP_OUTPUT)
      expect(result.symbols).toEqual([
        'SteamAPI_Init',
        'g_pSteamClientGameServer'
      ])
      expect(result.symbols).not.toContain('GetModuleHandleA')
    })

    it('never captures the Hint/Ord or lookup header rows as symbols', () => {
      const result = parseSteamApiImportTable(HOARD_REUBEN_REAL_OBJDUMP_OUTPUT)
      expect(result.symbols).not.toContain('Name')
      expect(result.symbols).not.toContain('time')
      expect(result.symbols).not.toContain('addr')
    })
  })

  describe('parseImportedDllNames (Phase 52 Plan 05)', () => {
    it('returns DLL names in file order', () => {
      expect(parseImportedDllNames(GRIM_DAWN_EXE_IMPORTS)).toEqual([
        'KERNEL32.dll',
        'Engine.dll',
        'Game.dll'
      ])
    })

    it('dedupes case-insensitively keeping the first spelling', () => {
      const out = 'DLL Name: Foo.dll\nDLL Name: FOO.DLL\nDLL Name: bar.dll\n'
      expect(parseImportedDllNames(out)).toEqual(['Foo.dll', 'bar.dll'])
    })

    it('returns [] when there are no DLL Name lines', () => {
      expect(parseImportedDllNames('nothing here')).toEqual([])
    })
  })

  describe('rust path', () => {
    const mockedInvoke = requestRustInvoke
    it('makes one scan_steam_api_imports round-trip, strips diagnostics and forwards them', async () => {
      mockedInvoke.mockResolvedValue({
        status: 'ok',
        arch: 'x64',
        dll: 'steam_api64.dll',
        symbols: ['SteamAPI_Init'],
        diagnostics: [
          { level: 'warn', message: 'rust warn' },
          { level: 'info', message: 'rust info' }
        ]
      })
      const result = await scanSteamApiImports(
        rust,
        '1234',
        '/g/Game.exe',
        'test'
      )
      expect(mockedInvoke).toHaveBeenCalledTimes(1)
      expect(mockedInvoke).toHaveBeenCalledWith('scan_steam_api_imports', [
        { exePath: '/g/Game.exe', appId: '1234' }
      ])
      expect(result).toEqual({
        status: 'ok',
        arch: 'x64',
        dll: 'steam_api64.dll',
        symbols: ['SteamAPI_Init']
      })
      expect(result).not.toHaveProperty('diagnostics')
      expect(logWarning).toHaveBeenCalledWith('rust warn', 'Steam')
      expect(logInfo).toHaveBeenCalledWith('rust info', 'Steam')
    })

    it('leaves delaySymbols absent when the Rust result has none', async () => {
      mockedInvoke.mockResolvedValue({
        status: 'ok',
        arch: 'x86',
        dll: 'steam_api.dll',
        symbols: [],
        diagnostics: []
      })
      const result = await scanSteamApiImports(
        rust,
        '1234',
        '/g/Game.exe',
        'test'
      )
      expect(result).not.toHaveProperty('delaySymbols')
    })

    it('rejects a non-numeric appId before any scanner call', async () => {
      const result = await scanSteamApiImports(
        rust,
        'abc',
        '/g/Game.exe',
        'test'
      )
      expect(result).toEqual({
        status: 'error',
        error: 'Invalid appId: "abc"'
      })
      expect(mockedInvoke).not.toHaveBeenCalled()
    })

    it('fails closed with a typed error when the transport rejects', async () => {
      mockedInvoke.mockRejectedValue(new Error('pipe closed'))
      const result = await scanSteamApiImports(
        rust,
        '1234',
        '/g/Game.exe',
        'test'
      )
      expect(result).toEqual({
        status: 'error',
        error: 'Rust scan failed: Error: pipe closed'
      })
      expect(logWarning).toHaveBeenCalled()
    })
  })
})
