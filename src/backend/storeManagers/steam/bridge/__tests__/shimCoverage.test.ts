/**
 * Unit tests for the shim-coverage module (Phase 51 Plan 03, ROADMAP
 * sub-decision 2 / D-51-07): the single module whose literals are pinned by
 * tests against the generated `.def` and the `meta/sdk` manifests, and whose
 * `evaluateShimCoverage` is the one place a missing-symbol / stubbed-
 * interface verdict is computed.
 *
 * The 24-CR-02 pin (quick 260930-vrb), previously in shimGenerate.test.ts,
 * moves here verbatim -- SHIM_EXPORTED_SYMBOLS now lives in this module, not
 * shimGenerate.ts. This test deliberately imports nothing from meta/
 * (tsconfig's `include` is `["src"]` only); it anchors the COMMITTED
 * native/steam-bridge/generated/steam_api.def file directly, same as the
 * original pin did.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { parseSteamApiImports } from '../importScan'
import { resolveRequiredInterfaceVersions } from '../interfaceVersions'
import {
  SHIM_EXPORTED_SYMBOLS,
  SHIM64_EXPORTED_SYMBOLS,
  SHIM_SERVED_INTERFACE_VERSIONS,
  SHIM64_SERVED_INTERFACE_VERSIONS,
  SHIM_X64_NULL_OBJECT_FALLBACK,
  SHIM_EXPORT_SET_VERSION,
  computeExportSetVersion,
  evaluateShimCoverage,
  evaluateShimCoverageWith,
  isScanVerdictNowCovered
} from '../shimCoverage'
import {
  HOARD_DLL_VERSION_STRINGS,
  HOARD_REUBEN_REAL_OBJDUMP_OUTPUT,
  XCOM_DLL_VERSION_STRINGS,
  XCOM_EU_OBJDUMP_OUTPUT
} from './fixtures/objdumpImports'

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..')
const STEAM_API_DEF_PATH = join(
  REPO_ROOT,
  'native',
  'steam-bridge',
  'generated',
  'steam_api.def'
)
const SDK_MANIFEST_DIR = join(REPO_ROOT, 'meta', 'sdk')

function readDefExports(): string[] {
  const lines = readFileSync(STEAM_API_DEF_PATH, 'utf-8')
    .split(/\r?\n/)
    .map((l) => l.trim())
  const exportsIdx = lines.indexOf('EXPORTS')
  if (exportsIdx === -1) return []
  return lines
    .slice(exportsIdx + 1)
    .filter((l) => l !== '' && !l.startsWith(';'))
    .map((l) => l.split(/\s+/)[0])
}

describe('SHIM_EXPORTED_SYMBOLS (24-CR-02 pin, moved from shimGenerate.test.ts)', () => {
  test('set-equals the export list of the committed native/steam-bridge/generated/steam_api.def, in both directions', () => {
    const defSymbols = readDefExports()
    expect(defSymbols.length).toBeGreaterThan(0)
    expect(new Set(defSymbols).size).toBe(defSymbols.length)

    const defSet = new Set(defSymbols)
    const missingFromShim = defSymbols.filter(
      (s) => !SHIM_EXPORTED_SYMBOLS.has(s)
    )
    const notInDef = [...SHIM_EXPORTED_SYMBOLS].filter((s) => !defSet.has(s))
    expect(missingFromShim).toEqual([])
    expect(notInDef).toEqual([])
  })
})

describe('SHIM64_EXPORTED_SYMBOLS', () => {
  test('is empty until 51-15 (no Win64 shim target exists yet)', () => {
    expect(SHIM64_EXPORTED_SYMBOLS.size).toBe(0)
  })
})

describe('SHIM_SERVED_INTERFACE_VERSIONS (manifest pin)', () => {
  test('keys equal the set of `interface` values across meta/sdk/*.manifest.json whose arches include x86 (manifests without an `arches` field count as x86)', () => {
    const manifestFiles = readdirSync(SDK_MANIFEST_DIR).filter((f) =>
      f.endsWith('.manifest.json')
    )
    expect(manifestFiles.length).toBeGreaterThan(0)

    const x86Interfaces = new Set<string>()
    for (const file of manifestFiles) {
      const manifest = JSON.parse(
        readFileSync(join(SDK_MANIFEST_DIR, file), 'utf-8')
      )
      const arches: string[] | undefined = manifest.arches
      const isX86 = !arches || arches.includes('x86')
      if (isX86) {
        x86Interfaces.add(manifest.interface)
      }
    }

    expect(new Set(SHIM_SERVED_INTERFACE_VERSIONS.keys())).toEqual(
      x86Interfaces
    )
  })

  test('SteamUser023 is served as wire', () => {
    expect(SHIM_SERVED_INTERFACE_VERSIONS.get('SteamUser023')).toEqual({
      family: 'SteamUser',
      mode: 'wire'
    })
  })

  test('SteamFriends018 is served as wire', () => {
    expect(SHIM_SERVED_INTERFACE_VERSIONS.get('SteamFriends018')).toEqual({
      family: 'SteamFriends',
      mode: 'wire'
    })
  })
})

describe('SHIM64_SERVED_INTERFACE_VERSIONS / SHIM_X64_NULL_OBJECT_FALLBACK', () => {
  test('SHIM64_SERVED_INTERFACE_VERSIONS is empty until 51-15', () => {
    expect(SHIM64_SERVED_INTERFACE_VERSIONS.size).toBe(0)
  })

  test('SHIM_X64_NULL_OBJECT_FALLBACK is false today', () => {
    expect(SHIM_X64_NULL_OBJECT_FALLBACK).toBe(false)
  })
})

describe('SHIM_EXPORT_SET_VERSION / computeExportSetVersion', () => {
  test('SHIM_EXPORT_SET_VERSION is a 12-hex-char string', () => {
    expect(SHIM_EXPORT_SET_VERSION).toMatch(/^[0-9a-f]{12}$/)
  })

  test('computeExportSetVersion changes when a symbol is added to a copy of the inputs', () => {
    const baseInputs = {
      x86ExportedSymbols: SHIM_EXPORTED_SYMBOLS,
      x64ExportedSymbols: SHIM64_EXPORTED_SYMBOLS,
      x86ServedVersions: SHIM_SERVED_INTERFACE_VERSIONS,
      x64ServedVersions: SHIM64_SERVED_INTERFACE_VERSIONS,
      x64NullObjectFallback: SHIM_X64_NULL_OBJECT_FALLBACK
    }
    const before = computeExportSetVersion(baseInputs)
    const after = computeExportSetVersion({
      ...baseInputs,
      x86ExportedSymbols: new Set([
        ...SHIM_EXPORTED_SYMBOLS,
        'SteamAPI_SomeNewFutureSymbol'
      ])
    })

    expect(before).not.toBe(after)
    expect(after).toMatch(/^[0-9a-f]{12}$/)
  })

  test('is stable for the same inputs (deterministic)', () => {
    const inputs = {
      x86ExportedSymbols: SHIM_EXPORTED_SYMBOLS,
      x64ExportedSymbols: SHIM64_EXPORTED_SYMBOLS,
      x86ServedVersions: SHIM_SERVED_INTERFACE_VERSIONS,
      x64ServedVersions: SHIM64_SERVED_INTERFACE_VERSIONS,
      x64NullObjectFallback: SHIM_X64_NULL_OBJECT_FALLBACK
    }
    expect(computeExportSetVersion(inputs)).toBe(SHIM_EXPORT_SET_VERSION)
  })
})

describe('evaluateShimCoverage', () => {
  // 51-11: SteamUtils/SteamUtils005 moved from "missing" to "covered" this
  // plan -- SteamRemoteStorage stays the still-out-of-scope example (second
  // locked interface group, not yet widened).
  test('x86: an exported symbol is covered, an un-exported bare accessor AND its unserved required version are both missing', () => {
    const result = evaluateShimCoverage({
      arch: 'x86',
      symbols: ['SteamAPI_Init', 'SteamRemoteStorage'],
      requiredInterfaceVersions: {
        SteamRemoteStorage: 'STEAMREMOTESTORAGE_INTERFACE_VERSION005'
      },
      versionProblems: []
    })

    expect(result.missingSymbols).toEqual([
      'SteamRemoteStorage',
      'STEAMREMOTESTORAGE_INTERFACE_VERSION005'
    ])
    expect(result.stubbedInterfaces).toEqual([])
  })

  test('x64: with SHIM64 sets empty today, every symbol/version is missing', () => {
    const result = evaluateShimCoverage({
      arch: 'x64',
      symbols: ['SteamAPI_Init', 'SteamUtils'],
      requiredInterfaceVersions: { SteamUtils: 'SteamUtils005' },
      versionProblems: []
    })

    expect(result.missingSymbols).toEqual([
      'SteamAPI_Init',
      'SteamUtils',
      'SteamUtils005'
    ])
  })

  test('versionProblems are appended verbatim after missing symbols/versions', () => {
    const result = evaluateShimCoverage({
      arch: 'x86',
      symbols: ['SteamAPI_Init'],
      requiredInterfaceVersions: {},
      versionProblems: ['SteamUser@unknown-version']
    })

    expect(result.missingSymbols).toEqual(['SteamUser@unknown-version'])
  })

  test('a required version served as wire is neither missing nor stubbed', () => {
    const result = evaluateShimCoverage({
      arch: 'x86',
      symbols: ['SteamAPI_SteamUser_v023'],
      requiredInterfaceVersions: { SteamUser: 'SteamUser023' },
      versionProblems: []
    })

    expect(result.missingSymbols).toEqual([])
    expect(result.stubbedInterfaces).toEqual([])
  })
})

describe('evaluateShimCoverageWith (pure core, exercises the x64 null-object fallback)', () => {
  test('a stub-mode served version is reported under stubbedInterfaces, not missingSymbols', () => {
    const result = evaluateShimCoverageWith(
      {
        x86ExportedSymbols: new Set(['SteamApps']),
        x64ExportedSymbols: new Set(),
        x86ServedVersions: new Map([
          ['SteamApps008', { family: 'SteamApps', mode: 'stub' as const }]
        ]),
        x64ServedVersions: new Map(),
        x64NullObjectFallback: false
      },
      {
        arch: 'x86',
        symbols: ['SteamApps'],
        requiredInterfaceVersions: { SteamApps: 'SteamApps008' },
        versionProblems: []
      }
    )

    expect(result.missingSymbols).toEqual([])
    expect(result.stubbedInterfaces).toEqual(['SteamApps'])
  })

  test('x64 with SHIM_X64_NULL_OBJECT_FALLBACK true: an unserved required version is stubbed, not missing', () => {
    const result = evaluateShimCoverageWith(
      {
        x86ExportedSymbols: new Set(),
        x64ExportedSymbols: new Set(['SteamUser']),
        x86ServedVersions: new Map(),
        x64ServedVersions: new Map(), // empty -- SteamUser023 is unserved on x64
        x64NullObjectFallback: true
      },
      {
        arch: 'x64',
        symbols: ['SteamUser'],
        requiredInterfaceVersions: { SteamUser: 'SteamUser023' },
        versionProblems: []
      }
    )

    expect(result.missingSymbols).toEqual([])
    expect(result.stubbedInterfaces).toEqual(['SteamUser'])
  })

  test('x64 with SHIM_X64_NULL_OBJECT_FALLBACK false: the same unserved required version is missing, not stubbed', () => {
    const result = evaluateShimCoverageWith(
      {
        x86ExportedSymbols: new Set(),
        x64ExportedSymbols: new Set(['SteamUser']),
        x86ServedVersions: new Map(),
        x64ServedVersions: new Map(),
        x64NullObjectFallback: false
      },
      {
        arch: 'x64',
        symbols: ['SteamUser'],
        requiredInterfaceVersions: { SteamUser: 'SteamUser023' },
        versionProblems: []
      }
    )

    expect(result.missingSymbols).toEqual(['SteamUser023'])
    expect(result.stubbedInterfaces).toEqual([])
  })

  test('the x64 null-object fallback never applies on x86 (arch-scoped)', () => {
    const result = evaluateShimCoverageWith(
      {
        x86ExportedSymbols: new Set(),
        x64ExportedSymbols: new Set(),
        x86ServedVersions: new Map(),
        x64ServedVersions: new Map(),
        x64NullObjectFallback: true
      },
      {
        arch: 'x86',
        symbols: [],
        requiredInterfaceVersions: { SteamUser: 'SteamUser023' },
        versionProblems: []
      }
    )

    expect(result.missingSymbols).toEqual(['SteamUser023'])
    expect(result.stubbedInterfaces).toEqual([])
  })
})

// 51-11 Task 3: the acceptance check named in the plan -- evaluateShimCoverage
// on XCOM: Enemy Unknown's (200510) REAL captured import table (51-02's
// fixtures/objdumpImports.ts) must report missing exactly the second/
// last-group families (SteamRemoteStorage, SteamMatchmaking/
// SteamMatchmakingServers, SteamNetworking -- their bare names AND their
// required versions) plus the 9 out-of-scope SteamGameServer* bare names
// (closed by a future 51-14), and NOTHING from the five families this plan
// widened (SteamUser/SteamFriends/SteamUtils/SteamApps/SteamUserStats).
//
// Hoard's (63000) own measurement (261021-pgx) now has a real acceptance
// check too -- see the second describe block below.
describe('evaluateShimCoverage (51-11 Task 3 acceptance check -- XCOM: Enemy Unknown, 200510)', () => {
  const xcomSymbols = parseSteamApiImports(XCOM_EU_OBJDUMP_OUTPUT)
  const { required: xcomRequiredVersions, problems: xcomVersionProblems } =
    resolveRequiredInterfaceVersions({
      importedSymbols: xcomSymbols,
      dllVersions: XCOM_DLL_VERSION_STRINGS,
      exeVersions: []
    })

  test('resolves cleanly (no unknown-version/ambiguous problems) against the real captured import table', () => {
    expect(xcomVersionProblems).toEqual([])
  })

  test('missing is exactly the second/last-group families + their versions + the 9 GameServer* stubs; nothing from the five widened families', () => {
    const result = evaluateShimCoverage({
      arch: 'x86',
      symbols: xcomSymbols,
      requiredInterfaceVersions: xcomRequiredVersions,
      versionProblems: xcomVersionProblems
    })

    const expectedMissingGameServerNames = [
      'SteamGameServer',
      'SteamGameServer_Shutdown',
      'SteamGameServer_BSecure',
      'SteamGameServer_GetSteamID',
      'SteamGameServer_Init',
      'SteamGameServerStats',
      'SteamGameServerNetworking',
      'SteamGameServerUtils',
      'SteamGameServer_RunCallbacks'
    ]
    const expectedMissingBareNames = [
      'SteamMatchmaking',
      'SteamMatchmakingServers',
      'SteamNetworking',
      'SteamRemoteStorage'
    ]
    const expectedMissingVersions = [
      'SteamMatchMaking009',
      'SteamMatchMakingServers002',
      'SteamNetworking005',
      'STEAMREMOTESTORAGE_INTERFACE_VERSION005'
    ]
    const expectedMissing = [
      ...expectedMissingGameServerNames,
      ...expectedMissingBareNames,
      ...expectedMissingVersions
    ]

    expect([...result.missingSymbols].sort()).toEqual(
      [...expectedMissing].sort()
    )
    expect(result.stubbedInterfaces).toEqual([])

    // Nothing from the five families this plan widened appears anywhere
    // in the miss list -- the real acceptance assertion, not just a
    // length check.
    const widenedNames = [
      'SteamUser',
      'SteamFriends',
      'SteamUtils',
      'SteamApps',
      'SteamUserStats',
      'SteamUser016',
      'SteamFriends011',
      'SteamUtils005',
      'STEAMAPPS_INTERFACE_VERSION004',
      'STEAMUSERSTATS_INTERFACE_VERSION010'
    ]
    for (const name of widenedNames) {
      expect(result.missingSymbols).not.toContain(name)
    }
  })
})

// 261021-pgx: Hoard's (63000) own measured acceptance check -- the five
// widened families now covered for Hoard specifically, against its own
// REAL captured import table (HOARD_REUBEN_REAL_OBJDUMP_OUTPUT) and its own
// REAL measured interface-version strings (HOARD_DLL_VERSION_STRINGS).
// Hoard's import table has no SteamMatchmakingServers and no
// SteamGameServer* names (unlike XCOM's 26-import table) -- simpler, only
// 8 bare accessors.
describe('evaluateShimCoverage (Hoard: 63000) -- the five widened families now covered for Hoard specifically', () => {
  const hoardSymbols = parseSteamApiImports(HOARD_REUBEN_REAL_OBJDUMP_OUTPUT)
  const { required: hoardRequiredVersions, problems: hoardVersionProblems } =
    resolveRequiredInterfaceVersions({
      importedSymbols: hoardSymbols,
      dllVersions: HOARD_DLL_VERSION_STRINGS,
      exeVersions: []
    })

  test('resolves cleanly (no unknown-version/ambiguous problems) against the real captured import table', () => {
    expect(hoardVersionProblems).toEqual([])
  })

  test('missing is exactly SteamMatchmaking/SteamNetworking/SteamRemoteStorage + their versions; nothing from the five widened families', () => {
    const result = evaluateShimCoverage({
      arch: 'x86',
      symbols: hoardSymbols,
      requiredInterfaceVersions: hoardRequiredVersions,
      versionProblems: hoardVersionProblems
    })

    const expectedMissingBareNames = [
      'SteamMatchmaking',
      'SteamNetworking',
      'SteamRemoteStorage'
    ]
    const expectedMissingVersions = [
      'SteamMatchMaking009',
      'SteamNetworking005',
      'STEAMREMOTESTORAGE_INTERFACE_VERSION010'
    ]
    const expectedMissing = [
      ...expectedMissingBareNames,
      ...expectedMissingVersions
    ]

    expect([...result.missingSymbols].sort()).toEqual(
      [...expectedMissing].sort()
    )
    expect(result.stubbedInterfaces).toEqual([])

    // Nothing from the five families this plan (and 51-11 before it)
    // widened appears anywhere in the miss list -- the real "now covered
    // for Hoard specifically" assertion, not just a length check.
    const widenedNames = [
      'SteamUser',
      'SteamFriends',
      'SteamUtils',
      'SteamApps',
      'SteamUserStats',
      'SteamUser016',
      'SteamFriends013',
      'SteamUtils005',
      'STEAMAPPS_INTERFACE_VERSION005',
      'STEAMUSERSTATS_INTERFACE_VERSION011'
    ]
    for (const name of widenedNames) {
      expect(result.missingSymbols).not.toContain(name)
    }
  })
})

describe('isScanVerdictNowCovered', () => {
  test('returns true when the stored missing symbol is now exported', () => {
    expect(isScanVerdictNowCovered({ missingSymbols: ['SteamAPI_Init'] })).toBe(
      true
    )
  })

  // 51-11: SteamUtils is now covered -- SteamRemoteStorage (second locked
  // group, not yet widened) is the still-genuinely-uncovered example.
  test('returns false when the stored missing symbol is still not covered', () => {
    expect(
      isScanVerdictNowCovered({ missingSymbols: ['SteamRemoteStorage'] })
    ).toBe(false)
  })

  test('returns true when the stored missing entry is now a served interface version', () => {
    expect(isScanVerdictNowCovered({ missingSymbols: ['SteamUser023'] })).toBe(
      true
    )
  })

  test('a differently-shaped stored entry (e.g. "SteamUser@unknown-version") is never covered', () => {
    expect(
      isScanVerdictNowCovered({
        missingSymbols: ['SteamUser@unknown-version']
      })
    ).toBe(false)
  })

  test('returns true only when EVERY stored missing entry is now covered', () => {
    expect(
      isScanVerdictNowCovered({
        missingSymbols: ['SteamAPI_Init', 'SteamRemoteStorage']
      })
    ).toBe(false)
  })
})
