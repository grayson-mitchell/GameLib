/**
 * Unit tests for the objdump-based `steam_api` import scanner (Phase 24
 * Plan 05, R3, Task 1; widened Phase 51 Plan 02, Task 1 -- bare accessors,
 * `steam_api64.dll` arch detection, conflicting-heading fail-closed).
 *
 * Mock strategy mirrors bottle.test.ts: `backend/utils` (spawnAsync) and
 * `backend/logger` are jest.mock'd; `resetMocks: true` in jest.config
 * means implementations must be re-established in each test.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { spawnAsync } from 'backend/utils'
import { parseSteamApiImports, scanSteamApiImports } from '../importScan'
import { parseImportedDllNames, parseSteamApiImportTable } from '../importParse'
import {
  AVERNUM_4_OBJDUMP_OUTPUT,
  AVERNUM_6_OBJDUMP_OUTPUT,
  CONFLICTING_DLL_HEADINGS_OBJDUMP_OUTPUT,
  DATA_EXPORT_ROW_OBJDUMP_OUTPUT,
  ELEX_X64_OBJDUMP_OUTPUT,
  GRIM_DAWN_ENGINE_DLL_IMPORTS,
  GRIM_DAWN_EXE_IMPORTS,
  GRIM_DAWN_GAME_DLL_IMPORTS,
  HOARD_REUBEN_REAL_OBJDUMP_OUTPUT,
  X86_STEAM_API_DLL_IMPORTS,
  HOARD_SPIKE_RECONSTRUCTED_OBJDUMP_OUTPUT,
  NO_STEAM_API_OBJDUMP_OUTPUT,
  XCOM_EU_OBJDUMP_OUTPUT
} from './fixtures/objdumpImports'
import { buildDelayImportPe } from './fixtures/delayImportPe'

jest.mock('backend/utils', () => ({
  spawnAsync: jest.fn()
}))

jest.mock('backend/logger', () => ({
  logWarning: jest.fn(),
  logInfo: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))

const mockedSpawnAsync = spawnAsync as jest.Mock

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
  beforeEach(() => {
    mockedSpawnAsync.mockReset()
  })

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

  describe('scanSteamApiImports (spawnAsync wrapper, widened result shape)', () => {
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

    it('returns the widened ok shape (arch/dll/symbols) for the Avernum 4 fixture', async () => {
      mockedSpawnAsync.mockResolvedValue({
        code: 0,
        stdout: AVERNUM_4_OBJDUMP_OUTPUT,
        stderr: ''
      })

      const result = await scanSteamApiImports('1234', '/bottle/Avernum 4.exe')
      expect(result).toEqual({
        status: 'ok',
        arch: 'x86',
        dll: 'steam_api.dll',
        symbols: ['SteamAPI_Init', 'SteamAPI_Shutdown']
      })
    })

    it('returns arch x64 and dll steam_api64.dll for the ELEX fixture', async () => {
      mockedSpawnAsync.mockResolvedValue({
        code: 0,
        stdout: ELEX_X64_OBJDUMP_OUTPUT,
        stderr: ''
      })

      const result = await scanSteamApiImports('411300', '/bottle/ELEX.exe')
      expect(result.status).toBe('ok')
      if (result.status === 'ok') {
        expect(result.arch).toBe('x64')
        expect(result.dll).toBe('steam_api64.dll')
      }
    })

    it('returns all 8 Hoard bare accessors for the real Hoard fixture (never "imports nothing")', async () => {
      mockedSpawnAsync.mockResolvedValue({
        code: 0,
        stdout: HOARD_REUBEN_REAL_OBJDUMP_OUTPUT,
        stderr: ''
      })

      const result = await scanSteamApiImports('63000', '/bottle/Reuben.exe')
      expect(result.status).toBe('ok')
      if (result.status === 'ok') {
        expect(result.arch).toBe('x86')
        for (const accessor of HOARD_BARE_ACCESSORS) {
          expect(result.symbols).toContain(accessor)
        }
      }
    })

    it('surfaces conflicting steam_api.dll/steam_api64.dll headings as a typed error, never a guessed arch', async () => {
      mockedSpawnAsync.mockResolvedValue({
        code: 0,
        stdout: CONFLICTING_DLL_HEADINGS_OBJDUMP_OUTPUT,
        stderr: ''
      })

      const result = await scanSteamApiImports('1234', '/bottle/Test.exe')
      expect(result).toEqual({
        status: 'error',
        error: 'conflicting steam_api.dll and steam_api64.dll import headings'
      })
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

  describe('delay imports (quick 261024-j4l)', () => {
    let dir: string
    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'gamelib-delayscan-'))
    })
    afterEach(() => {
      rmSync(dir, { recursive: true, force: true })
    })

    const exeWith = (
      dlls: { name: string; imports: (string | number)[] }[],
      plus = true
    ) => {
      const path = join(dir, 'Game-Shipping.exe')
      writeFileSync(path, buildDelayImportPe({ plus, dlls }))
      return path
    }

    it('reports a delay-only steam_api64 importer when objdump lists no heading', async () => {
      const exe = exeWith([
        {
          name: 'steam_api64.dll',
          imports: ['SteamAPI_Init', 'SteamInternal_GameServer_Init']
        }
      ])
      mockedSpawnAsync.mockResolvedValue({
        code: 0,
        stdout: NO_STEAM_API_OBJDUMP_OUTPUT,
        stderr: ''
      })
      await expect(scanSteamApiImports('1234', exe)).resolves.toEqual({
        status: 'ok',
        arch: 'x64',
        dll: 'steam_api64.dll',
        symbols: ['SteamAPI_Init', 'SteamInternal_GameServer_Init'],
        delaySymbols: ['SteamAPI_Init', 'SteamInternal_GameServer_Init']
      })
    })

    it('dedupes objdump + delay symbols with objdump order first', async () => {
      const exe = exeWith([
        {
          name: 'steam_api64.dll',
          imports: ['SteamAPI_Init', 'SteamAPI_RunCallbacks']
        }
      ])
      mockedSpawnAsync.mockResolvedValue({
        code: 0,
        stdout: ELEX_X64_OBJDUMP_OUTPUT,
        stderr: ''
      })
      const base = parseSteamApiImportTable(ELEX_X64_OBJDUMP_OUTPUT)
      const result = await scanSteamApiImports('1234', exe)
      expect(result).toEqual({
        status: 'ok',
        arch: 'x64',
        dll: 'steam_api64.dll',
        symbols: [
          ...new Set([
            ...base.symbols,
            'SteamAPI_Init',
            'SteamAPI_RunCallbacks'
          ])
        ],
        delaySymbols: ['SteamAPI_Init', 'SteamAPI_RunCallbacks']
      })
    })

    it('errors when objdump and the delay table disagree on the arch', async () => {
      const exe = exeWith([{ name: 'steam_api64.dll', imports: ['A'] }])
      mockedSpawnAsync.mockResolvedValue({
        code: 0,
        stdout: AVERNUM_4_OBJDUMP_OUTPUT,
        stderr: ''
      })
      await expect(scanSteamApiImports('1234', exe)).resolves.toEqual({
        status: 'error',
        error: 'conflicting steam_api.dll and steam_api64.dll import headings'
      })
    })

    it('leaves the result without a delaySymbols key when the file is absent', async () => {
      mockedSpawnAsync.mockResolvedValue({
        code: 0,
        stdout: AVERNUM_4_OBJDUMP_OUTPUT,
        stderr: ''
      })
      const result = await scanSteamApiImports(
        '1234',
        join(dir, 'does-not-exist.exe')
      )
      expect(result).not.toHaveProperty('delaySymbols')
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

  describe('static-import closure (Phase 52 Plan 05)', () => {
    let dir: string
    const mk = (...names: string[]) =>
      names.forEach((n) => writeFileSync(join(dir, n), ''))
    const answer = (map: Record<string, string>) =>
      mockedSpawnAsync.mockImplementation((_bin: string, args: string[]) => {
        const target = args[1]
        const key = Object.keys(map).find((k) => target === join(dir, k))
        return Promise.resolve(
          key
            ? { code: 0, stdout: map[key], stderr: '' }
            : { code: 1, stdout: '', stderr: 'nope' }
        )
      })
    const spawnedTargets = () =>
      mockedSpawnAsync.mock.calls.map((c) => c[1][1] as string)

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'closure-'))
    })
    afterEach(() => rmSync(dir, { recursive: true, force: true }))

    it('reports Engine.dll steam_api64 symbols for an exe that lacks the heading', async () => {
      mk('Grim Dawn.exe', 'Engine.dll', 'Game.dll')
      answer({
        'Grim Dawn.exe': GRIM_DAWN_EXE_IMPORTS,
        'Engine.dll': GRIM_DAWN_ENGINE_DLL_IMPORTS,
        'Game.dll': GRIM_DAWN_GAME_DLL_IMPORTS
      })
      const r = await scanSteamApiImports('219990', join(dir, 'Grim Dawn.exe'))
      expect(r).toMatchObject({
        status: 'ok',
        arch: 'x64',
        dll: 'steam_api64.dll'
      })
      if (r.status === 'ok') expect(r.symbols).toHaveLength(7)
    })

    it('unions symbols with the exe own block, exe first, no duplicates', async () => {
      mk('Grim Dawn.exe', 'Engine.dll')
      answer({
        'Grim Dawn.exe': ELEX_X64_OBJDUMP_OUTPUT.replace(
          'dbghelp.dll',
          'Engine.dll'
        ),
        'Engine.dll': GRIM_DAWN_ENGINE_DLL_IMPORTS
      })
      const r = await scanSteamApiImports('1', join(dir, 'Grim Dawn.exe'))
      expect(r.status).toBe('ok')
      if (r.status === 'ok') {
        expect(r.symbols[0]).toBe('SteamAPI_GetHSteamUser')
        expect(new Set(r.symbols).size).toBe(r.symbols.length)
        expect(r.symbols).toContain('SteamInternal_ContextInit')
      }
    })

    it('follows depth 2 (exe -> Game.dll -> Engine.dll) but not depth 3', async () => {
      mk('a.exe', 'Game.dll', 'Engine.dll')
      answer({
        'a.exe': GRIM_DAWN_EXE_IMPORTS.replace('Engine.dll', 'Zzz.dll'),
        'Game.dll': GRIM_DAWN_GAME_DLL_IMPORTS,
        'Engine.dll': GRIM_DAWN_ENGINE_DLL_IMPORTS
      })
      const r = await scanSteamApiImports('1', join(dir, 'a.exe'))
      expect(r).toMatchObject({ status: 'ok', arch: 'x64' })

      mockedSpawnAsync.mockReset()
      // depth 3: a.exe -> Game.dll -> Mid.dll -> Engine.dll
      mk('Mid.dll')
      answer({
        'a.exe': GRIM_DAWN_EXE_IMPORTS.replace('Engine.dll', 'Zzz.dll'),
        'Game.dll': GRIM_DAWN_GAME_DLL_IMPORTS.replace('Engine.dll', 'Mid.dll'),
        'Mid.dll': GRIM_DAWN_GAME_DLL_IMPORTS,
        'Engine.dll': GRIM_DAWN_ENGINE_DLL_IMPORTS
      })
      const r3 = await scanSteamApiImports('1', join(dir, 'a.exe'))
      expect(r3).toMatchObject({ status: 'ok', arch: 'none' })
    })

    it('does not follow an export-table `DLL name:` as an import (debug uw-284100-no-iface-pins)', async () => {
      // Real objdump shape for Unclaimed World's CSteamworks64.dll (x64): its
      // IMPORT table names steam_api64.dll, and its EXPORT table's own name
      // (lowercase `DLL name:`) is "CSteamworks.dll" -- the x86 sibling.
      mk('CSteamworks64.dll', 'CSteamworks.dll')
      const csteamworks64 = `
The Import Tables:
  lookup 00016d58 time 00000000 fwd 00000000 name 00017176 addr 00014218

    DLL Name: steam_api64.dll
    Hint/Ord  Name
         686  Steam_GetHSteamUserCurrent
           4  SteamAPI_GetSteamInstallPath

  lookup 00016b40 time 00000000 fwd 00000000 name 000171ac addr 00014000

    DLL Name: KERNEL32.dll
    Hint/Ord  Name
         520  GetLastError

Export Table:
 DLL name: CSteamworks.dll
 Ordinal base: 1
`
      const csteamworks86 = X86_STEAM_API_DLL_IMPORTS
      answer({
        'CSteamworks64.dll': csteamworks64,
        'CSteamworks.dll': csteamworks86
      })
      const r = await scanSteamApiImports(
        '284100',
        join(dir, 'CSteamworks64.dll')
      )
      expect(r).toMatchObject({
        status: 'ok',
        arch: 'x64',
        dll: 'steam_api64.dll'
      })
      // The x86 sibling named only by the export table is never spawned.
      expect(spawnedTargets()).toEqual([join(dir, 'CSteamworks64.dll')])
    })

    it('never spawns objdump for path-like, missing, or system names', async () => {
      mk('a.exe')
      const exe = `
    DLL Name: ..\\evil.dll
    DLL Name: sub/evil.dll
    DLL Name: Missing.dll
    DLL Name: USER32.dll
    DLL Name: ntdll.dll
    DLL Name: msvcrt.dll
    DLL Name: api-ms-win-core-foo-l1-1-0.dll
    DLL Name: ext-ms-win-bar.dll
`
      answer({ 'a.exe': exe })
      mockedSpawnAsync.mockClear()
      await scanSteamApiImports('1', join(dir, 'a.exe'))
      expect(spawnedTargets()).toEqual([join(dir, 'a.exe')])
    })

    it('fails closed when two importers disagree on arch', async () => {
      mk('a.exe', 'Engine.dll', 'Other.dll')
      answer({
        'a.exe': GRIM_DAWN_EXE_IMPORTS.replace('Game.dll', 'Other.dll'),
        'Engine.dll': GRIM_DAWN_ENGINE_DLL_IMPORTS,
        'Other.dll': X86_STEAM_API_DLL_IMPORTS
      })
      const r = await scanSteamApiImports('1', join(dir, 'a.exe'))
      expect(r).toEqual({
        status: 'error',
        error: 'conflicting steam_api.dll and steam_api64.dll import headings'
      })
    })

    it('skips a followed DLL whose objdump fails, still returning ok', async () => {
      mk('a.exe', 'Engine.dll')
      answer({ 'a.exe': GRIM_DAWN_EXE_IMPORTS })
      const r = await scanSteamApiImports('1', join(dir, 'a.exe'))
      expect(r).toMatchObject({ status: 'ok', arch: 'none' })
    })

    it('examines at most 32 candidate DLLs', async () => {
      mk('a.exe')
      const names = Array.from({ length: 40 }, (_, i) => `d${i}.dll`)
      mk(...names)
      const exe = names.map((n) => `    DLL Name: ${n}\n`).join('')
      answer({ 'a.exe': exe })
      mockedSpawnAsync.mockClear()
      await scanSteamApiImports('1', join(dir, 'a.exe'))
      expect(mockedSpawnAsync).toHaveBeenCalledTimes(1 + 32)
    })
  })
})
