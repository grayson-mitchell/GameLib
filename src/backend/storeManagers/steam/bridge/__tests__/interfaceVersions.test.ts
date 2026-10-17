/**
 * Unit tests for the interface-version capture module (Phase 51 Plan 02,
 * Task 2): string parsing, the macro/CamelCase family maps, the bounded
 * streaming reader, and the required-version resolver.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  BARE_ACCESSOR_FAMILY,
  familyOfInterfaceVersion,
  parseInterfaceVersionStrings,
  readInterfaceVersionStrings,
  resolveRequiredInterfaceVersions,
  usesRuntimeInterfaceLookup
} from '../interfaceVersions'
import {
  ELEX_EXE_VERSION_STRINGS,
  XCOM_DLL_VERSION_STRINGS
} from './fixtures/objdumpImports'

const XCOM_BARE_ACCESSOR_SYMBOLS = [
  'SteamMatchmaking',
  'SteamNetworking',
  'SteamApps',
  'SteamMatchmakingServers',
  'SteamRemoteStorage',
  'SteamFriends',
  'SteamUser',
  'SteamUtils',
  'SteamUserStats'
]

const ELEX_IMPORTED_SYMBOLS = [
  'SteamAPI_GetHSteamUser',
  'SteamAPI_GetHSteamPipe',
  'SteamAPI_IsSteamRunning',
  'SteamAPI_RunCallbacks',
  'SteamAPI_RestartAppIfNecessary',
  'SteamAPI_UnregisterCallback',
  'SteamAPI_RegisterCallback',
  'SteamAPI_Shutdown',
  'SteamAPI_Init',
  'SteamInternal_CreateInterface'
]

describe('interfaceVersions', () => {
  describe('parseInterfaceVersionStrings', () => {
    it('extracts both macro and CamelCase version strings, deduped and sorted', () => {
      const bytes = Buffer.concat([
        Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe]),
        Buffer.from('SteamUser016\0', 'latin1'),
        Buffer.from([0x10, 0x20]),
        Buffer.from('STEAMAPPS_INTERFACE_VERSION004\0', 'latin1'),
        Buffer.from([0x30]),
        Buffer.from('SteamUser016\0', 'latin1')
      ])

      expect(parseInterfaceVersionStrings(bytes)).toEqual([
        'STEAMAPPS_INTERFACE_VERSION004',
        'SteamUser016'
      ])
    })

    it('never matches a 300-char run of letters (length cap)', () => {
      const bytes = Buffer.from(
        `noise-before Steam${'B'.repeat(300)}016 SteamUser016 noise-after`,
        'latin1'
      )

      expect(parseInterfaceVersionStrings(bytes)).toEqual(['SteamUser016'])
    })

    it('returns an empty array for a buffer with no version-shaped strings', () => {
      expect(
        parseInterfaceVersionStrings(Buffer.from('nothing here', 'latin1'))
      ).toEqual([])
    })
  })

  describe('familyOfInterfaceVersion', () => {
    it.each([
      ['SteamUser016', 'SteamUser'],
      ['STEAMAPPS_INTERFACE_VERSION004', 'SteamApps'],
      ['STEAMUSERSTATS_INTERFACE_VERSION010', 'SteamUserStats'],
      ['STEAMREMOTESTORAGE_INTERFACE_VERSION005', 'SteamRemoteStorage'],
      ['SteamMatchMaking009', 'SteamMatchMaking'],
      ['Bogus', null]
    ])('familyOfInterfaceVersion(%s) === %s', (version, expected) => {
      expect(familyOfInterfaceVersion(version)).toBe(expected)
    })
  })

  describe('BARE_ACCESSOR_FAMILY', () => {
    it('maps the lowercase-m accessor name to the capital-M version-string family', () => {
      expect(BARE_ACCESSOR_FAMILY['SteamMatchmaking']).toBe('SteamMatchMaking')
    })

    it('does not map any SteamGameServer* bare name (served as flat stubs, no version needed)', () => {
      expect(BARE_ACCESSOR_FAMILY['SteamGameServer']).toBeUndefined()
      expect(BARE_ACCESSOR_FAMILY['SteamGameServer_Init']).toBeUndefined()
      expect(BARE_ACCESSOR_FAMILY['SteamGameServerStats']).toBeUndefined()
      expect(BARE_ACCESSOR_FAMILY['SteamGameServerNetworking']).toBeUndefined()
      expect(BARE_ACCESSOR_FAMILY['SteamGameServerUtils']).toBeUndefined()
    })
  })

  describe('usesRuntimeInterfaceLookup', () => {
    it('is true for ELEX (imports SteamInternal_CreateInterface)', () => {
      expect(usesRuntimeInterfaceLookup(ELEX_IMPORTED_SYMBOLS)).toBe(true)
    })

    it('is false for XCOM (bare accessors only, no SteamInternal_CreateInterface/SteamClient)', () => {
      expect(usesRuntimeInterfaceLookup(XCOM_BARE_ACCESSOR_SYMBOLS)).toBe(false)
    })
  })

  describe('resolveRequiredInterfaceVersions', () => {
    it('resolves the exact 9-entry XCOM required map from its bare accessors and dll version strings', () => {
      const result = resolveRequiredInterfaceVersions({
        importedSymbols: XCOM_BARE_ACCESSOR_SYMBOLS,
        dllVersions: XCOM_DLL_VERSION_STRINGS,
        exeVersions: []
      })

      expect(result).toEqual({
        required: {
          SteamUser: 'SteamUser016',
          SteamFriends: 'SteamFriends011',
          SteamUtils: 'SteamUtils005',
          SteamApps: 'STEAMAPPS_INTERFACE_VERSION004',
          SteamUserStats: 'STEAMUSERSTATS_INTERFACE_VERSION010',
          SteamRemoteStorage: 'STEAMREMOTESTORAGE_INTERFACE_VERSION005',
          SteamMatchMaking: 'SteamMatchMaking009',
          SteamMatchMakingServers: 'SteamMatchMakingServers002',
          SteamNetworking: 'SteamNetworking005'
        },
        problems: []
      })
    })

    it('reports an unknown-version problem when an imported accessor family has no matching version string', () => {
      const result = resolveRequiredInterfaceVersions({
        importedSymbols: ['SteamUser'],
        dllVersions: [],
        exeVersions: []
      })

      expect(result.problems).toContain('SteamUser@unknown-version')
      expect(result.required.SteamUser).toBeUndefined()
    })

    it('reports an ambiguous problem when two versions of one family are present', () => {
      const result = resolveRequiredInterfaceVersions({
        importedSymbols: ['SteamUser'],
        dllVersions: ['SteamUser015', 'SteamUser016'],
        exeVersions: []
      })

      expect(result.problems).toContain(
        'SteamUser@ambiguous(SteamUser015,SteamUser016)'
      )
      expect(result.required.SteamUser).toBeUndefined()
    })

    it('for a runtime-lookup game (ELEX), resolves every known family across exeVersions ∪ dllVersions', () => {
      const result = resolveRequiredInterfaceVersions({
        importedSymbols: ELEX_IMPORTED_SYMBOLS,
        dllVersions: [],
        exeVersions: ELEX_EXE_VERSION_STRINGS
      })

      expect(result.problems).toEqual([])
      expect(result.required).toMatchObject({
        SteamClient: 'SteamClient017',
        SteamUser: 'SteamUser019',
        SteamUtils: 'SteamUtils008',
        SteamApps: 'STEAMAPPS_INTERFACE_VERSION008',
        SteamUserStats: 'STEAMUSERSTATS_INTERFACE_VERSION011',
        SteamRemoteStorage: 'STEAMREMOTESTORAGE_INTERFACE_VERSION013'
      })
    })
  })

  describe('readInterfaceVersionStrings', () => {
    let root: string

    beforeEach(() => {
      root = mkdtempSync(join(tmpdir(), 'gamelib-interfaceversions-test-'))
    })

    afterEach(() => {
      rmSync(root, { recursive: true, force: true })
    })

    it('finds a marker string that straddles a 1 MiB chunk boundary', async () => {
      const chunkSize = 1024 * 1024
      const marker = 'SteamUser016'
      const prefixLength = chunkSize - 6 // marker starts 6 bytes before the boundary
      const content = Buffer.concat([
        Buffer.alloc(prefixLength, 'A'),
        Buffer.from(marker, 'latin1'),
        Buffer.alloc(200, 'B')
      ])
      const filePath = join(root, 'straddle.bin')
      writeFileSync(filePath, content)

      const result = await readInterfaceVersionStrings(filePath)
      expect(result).toEqual({ status: 'ok', versions: ['SteamUser016'] })
    })

    it('returns a typed error mentioning the cap when the file exceeds maxBytes', async () => {
      const filePath = join(root, 'too-big.bin')
      writeFileSync(filePath, Buffer.alloc(2048))

      const result = await readInterfaceVersionStrings(filePath, {
        maxBytes: 1024
      })
      expect(result.status).toBe('error')
      if (result.status === 'error') {
        expect(result.error).toMatch(/1024/)
      }
    })

    it('returns a typed error (never throws) for a missing file', async () => {
      const filePath = join(root, 'does-not-exist.bin')

      await expect(
        readInterfaceVersionStrings(filePath)
      ).resolves.toMatchObject({
        status: 'error'
      })
    })
  })
})
