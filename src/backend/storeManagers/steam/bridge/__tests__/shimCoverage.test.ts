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
  findUnservableInterfaceVersions,
  isScanVerdictNowCovered
} from '../shimCoverage'
import {
  ELEX_EXE_VERSION_STRINGS,
  ELEX_X64_OBJDUMP_OUTPUT,
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
// 51-15: steam_api64.def is the x64 sibling 51-15 Task 1/2 generate/build.
const STEAM_API64_DEF_PATH = join(
  REPO_ROOT,
  'native',
  'steam-bridge',
  'generated',
  'steam_api64.def'
)
const SDK_MANIFEST_DIR = join(REPO_ROOT, 'meta', 'sdk')

function readDefExports(defPath: string = STEAM_API_DEF_PATH): string[] {
  const lines = readFileSync(defPath, 'utf-8')
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

// 51-15: D-51-13 GO -- same CR-02 pin discipline as SHIM_EXPORTED_SYMBOLS
// above, against the x64 sibling .def.
describe('SHIM64_EXPORTED_SYMBOLS (51-15 pin)', () => {
  test('set-equals the export list of the committed native/steam-bridge/generated/steam_api64.def, in both directions', () => {
    const defSymbols = readDefExports(STEAM_API64_DEF_PATH)
    expect(defSymbols.length).toBeGreaterThan(0)
    expect(new Set(defSymbols).size).toBe(defSymbols.length)

    const defSet = new Set(defSymbols)
    const missingFromShim = defSymbols.filter(
      (s) => !SHIM64_EXPORTED_SYMBOLS.has(s)
    )
    const notInDef = [...SHIM64_EXPORTED_SYMBOLS].filter((s) => !defSet.has(s))
    expect(missingFromShim).toEqual([])
    expect(notInDef).toEqual([])
  })

  test('the modern-SDK lookup family is x64-only -- never present in the x86 steam_api.def', () => {
    const x86Symbols = new Set(readDefExports(STEAM_API_DEF_PATH))
    for (const name of [
      'SteamInternal_CreateInterface',
      'SteamAPI_GetHSteamUser',
      'SteamAPI_GetHSteamPipe'
    ]) {
      expect(SHIM64_EXPORTED_SYMBOLS.has(name)).toBe(true)
      expect(x86Symbols.has(name)).toBe(false)
    }
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

describe('SHIM64_SERVED_INTERFACE_VERSIONS / SHIM_X64_NULL_OBJECT_FALLBACK (51-15)', () => {
  test('keys equal the set of `interface` values across meta/sdk/*.manifest.json whose arches include x64', () => {
    const manifestFiles = readdirSync(SDK_MANIFEST_DIR).filter((f) =>
      f.endsWith('.manifest.json')
    )
    const x64Interfaces = new Set<string>()
    for (const file of manifestFiles) {
      const manifest = JSON.parse(
        readFileSync(join(SDK_MANIFEST_DIR, file), 'utf-8')
      )
      const arches: string[] | undefined = manifest.arches
      if (arches?.includes('x64')) {
        x64Interfaces.add(manifest.interface)
      }
    }

    expect(new Set(SHIM64_SERVED_INTERFACE_VERSIONS.keys())).toEqual(
      x64Interfaces
    )
  })

  // 261021-pgx (shared with Hoard on x86): the SAME generated dispatch code
  // runs regardless of which arch the calling game is -- the wire protocol
  // is a plain TCP byte frame, arch-neutral -- so a manifest that is
  // genuinely wired on x86 is genuinely wired on x64 too.
  test('STEAMUSERSTATS_INTERFACE_VERSION011 is served as wire on x64 (same dispatch code as its x86 Hoard coverage)', () => {
    expect(
      SHIM64_SERVED_INTERFACE_VERSIONS.get(
        'STEAMUSERSTATS_INTERFACE_VERSION011'
      )
    ).toEqual({ family: 'SteamUserStats', mode: 'wire' })
  })

  // 51-26: ELEX's four core interfaces were wired after a live probe
  // against the signed-in Mac Steam (D-09 measurement).
  test("ELEX's four core interfaces are served as wire (51-26 live probe)", () => {
    for (const version of [
      'SteamUser019',
      'SteamFriends015',
      'SteamUtils008',
      'STEAMAPPS_INTERFACE_VERSION008'
    ]) {
      expect(SHIM64_SERVED_INTERFACE_VERSIONS.get(version)?.mode).toBe('wire')
    }
  })

  // Phase 52: SteamClient017/014 forward to the native client (wire);
  // remote storage 013 was never probed and stays stub.
  test('SteamClient017 and SteamClient014 are wire on x64', () => {
    for (const version of ['SteamClient017', 'SteamClient014']) {
      expect(SHIM64_SERVED_INTERFACE_VERSIONS.get(version)?.mode).toBe('wire')
    }
  })

  test('the x64 RemoteStorage013 stays stub', () => {
    expect(
      SHIM64_SERVED_INTERFACE_VERSIONS.get(
        'STEAMREMOTESTORAGE_INTERFACE_VERSION013'
      )?.mode
    ).toBe('stub')
  })

  test('the three shared stub manifests (51-14, widened to x64 this plan) stay stub on x64', () => {
    for (const version of [
      'SteamMatchMaking009',
      'SteamMatchMakingServers002',
      'SteamNetworking005'
    ]) {
      expect(SHIM64_SERVED_INTERFACE_VERSIONS.get(version)?.mode).toBe('stub')
    }
  })

  test('SHIM_X64_NULL_OBJECT_FALLBACK is true (D-51-13 GO)', () => {
    expect(SHIM_X64_NULL_OBJECT_FALLBACK).toBe(true)
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
  // 51-14: SteamRemoteStorage/SteamMatchmaking/SteamMatchmakingServers/
  // SteamNetworking moved from "missing" to "stubbed" this plan --
  // SteamHTTP stays a still-out-of-scope example (never widened by any
  // Phase 51 plan to date).
  test('x86: an exported symbol is covered, an un-exported bare accessor AND its unserved required version are both missing', () => {
    const result = evaluateShimCoverage({
      arch: 'x86',
      symbols: ['SteamAPI_Init', 'SteamHTTP'],
      requiredInterfaceVersions: {
        SteamHTTP: 'STEAMHTTP_INTERFACE_VERSION001'
      },
      versionProblems: []
    })

    expect(result.missingSymbols).toEqual([
      'SteamHTTP',
      'STEAMHTTP_INTERFACE_VERSION001'
    ])
    expect(result.stubbedInterfaces).toEqual([])
  })

  // 51-15: SHIM64 is now populated -- a real x64-exported symbol is
  // covered, and an UNSERVED required version (SteamUtils005 is only ever
  // served on x86; ELEX's own x64 SteamUtils version is SteamUtils008) now
  // falls through to the x64 null-object fallback (stubbed), not missing.
  test('x64: a real exported symbol is covered, and an unserved required version is stubbed via the null-object fallback (D-51-13)', () => {
    const result = evaluateShimCoverage({
      arch: 'x64',
      symbols: ['SteamAPI_Init', 'SteamInternal_CreateInterface'],
      requiredInterfaceVersions: { SteamUtils: 'SteamUtils005' },
      versionProblems: []
    })

    expect(result.missingSymbols).toEqual([])
    expect(result.stubbedInterfaces).toEqual(['SteamUtils'])
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
        x64ExportedSymbols: new Set(['SteamInternal_CreateInterface']),
        x86ServedVersions: new Map(),
        x64ServedVersions: new Map(), // empty -- SteamUser023 is unserved on x64
        x64NullObjectFallback: true
      },
      {
        arch: 'x64',
        symbols: ['SteamInternal_CreateInterface'],
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

// 51-14 Task 2: the full locked interface order is now served -- the
// second/last-group families (SteamRemoteStorage, SteamMatchmaking/
// SteamMatchmakingServers, SteamNetworking) answer as stubs, and the 9
// out-of-scope SteamGameServer* bare names XCOM imports are honest
// unavailable flat stubs too. missingSymbols is now [] for XCOM; the
// previously-missing families show up in stubbedInterfaces instead.
//
// Hoard's (63000) own measurement (261021-pgx) is covered the same way --
// see the second describe block below.
describe('evaluateShimCoverage (51-14 Task 2 acceptance check -- XCOM: Enemy Unknown, 200510)', () => {
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

  test('zero missing symbols; the second/last-group families report stubbed, sorted', () => {
    const result = evaluateShimCoverage({
      arch: 'x86',
      symbols: xcomSymbols,
      requiredInterfaceVersions: xcomRequiredVersions,
      versionProblems: xcomVersionProblems
    })

    expect(result.missingSymbols).toEqual([])
    expect([...result.stubbedInterfaces].sort()).toEqual([
      'SteamMatchMaking',
      'SteamMatchMakingServers',
      'SteamNetworking',
      'SteamRemoteStorage'
    ])

    // Nothing from the five families 51-11 widened appears in
    // stubbedInterfaces -- those are served 'wire', not 'stub'.
    const widenedFamilies = [
      'SteamUser',
      'SteamFriends',
      'SteamUtils',
      'SteamApps',
      'SteamUserStats'
    ]
    for (const family of widenedFamilies) {
      expect(result.stubbedInterfaces).not.toContain(family)
    }
  })
})

// 261021-pgx / 51-14: Hoard's (63000) own measured acceptance check --
// the five widened (51-11) families stay covered for Hoard, and the
// second/last-group families this plan adds now report stubbed instead of
// missing. Hoard's import table has no SteamMatchmakingServers and no
// SteamGameServer* names (unlike XCOM's 26-import table) -- simpler, only
// 8 bare accessors.
describe('evaluateShimCoverage (Hoard: 63000) -- 51-14: the second/last-group families now stubbed for Hoard specifically', () => {
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

  test('zero missing symbols; SteamMatchMaking/SteamNetworking/SteamRemoteStorage report stubbed, sorted', () => {
    const result = evaluateShimCoverage({
      arch: 'x86',
      symbols: hoardSymbols,
      requiredInterfaceVersions: hoardRequiredVersions,
      versionProblems: hoardVersionProblems
    })

    expect(result.missingSymbols).toEqual([])
    expect([...result.stubbedInterfaces].sort()).toEqual([
      'SteamMatchMaking',
      'SteamNetworking',
      'SteamRemoteStorage'
    ])

    // Nothing from the five families 51-11 widened appears in
    // stubbedInterfaces -- those are served 'wire', not 'stub'.
    const widenedFamilies = [
      'SteamUser',
      'SteamFriends',
      'SteamUtils',
      'SteamApps',
      'SteamUserStats'
    ]
    for (const family of widenedFamilies) {
      expect(result.stubbedInterfaces).not.toContain(family)
    }
  })
})

// 51-15 Task 3 (D-51-14 ELEX acceptance): the one real Win64-only title.
// ELEX imports SteamInternal_CreateInterface (runtime lookup, D-51-07) --
// resolveRequiredInterfaceVersions walks EVERY known family found in the
// exe's own version-string pool, not a fixed bare-accessor list.
describe('evaluateShimCoverage (51-15 Task 3 acceptance check -- ELEX, 411300, Win64)', () => {
  const elexSymbols = parseSteamApiImports(ELEX_X64_OBJDUMP_OUTPUT)
  const { required: elexRequiredVersions, problems: elexVersionProblems } =
    resolveRequiredInterfaceVersions({
      importedSymbols: elexSymbols,
      dllVersions: [],
      exeVersions: ELEX_EXE_VERSION_STRINGS
    })

  test('resolves cleanly (no unknown-version/ambiguous problems) against the real captured import table', () => {
    expect(elexVersionProblems).toEqual([])
  })

  test('zero missing symbols; SteamRemoteStorage plus every null-object-fallback family reports stubbed', () => {
    const result = evaluateShimCoverage({
      arch: 'x64',
      symbols: elexSymbols,
      requiredInterfaceVersions: elexRequiredVersions,
      versionProblems: elexVersionProblems
    })

    expect(result.missingSymbols).toEqual([])
    expect(result.stubbedInterfaces).toEqual(
      expect.arrayContaining([
        'SteamRemoteStorage',
        // The eight families ELEX's exe requests that GameLib has no
        // manifest for at all -- answered entirely by the x64 null-object
        // fallback (ROADMAP sub-decision 1), never invented as a stub
        // manifest with no measured basis (D-09).
        'SteamScreenshots',
        'SteamHTTP',
        'SteamUGC',
        'SteamUnifiedMessages',
        'SteamController',
        'SteamAppList',
        'SteamMusic',
        'SteamMusicRemote'
      ])
    )
    // SteamUserStats is served 'wire' (the shared, genuinely-dispatched
    // manifest) -- it must NOT appear in stubbedInterfaces.
    expect(result.stubbedInterfaces).not.toContain('SteamUserStats')
    // 51-26: the four core families are served 'wire' on x64 now.
    for (const family of [
      'SteamUser',
      'SteamFriends',
      'SteamUtils',
      'SteamApps'
    ]) {
      expect(result.stubbedInterfaces).not.toContain(family)
    }
    // Phase 52: SteamClient is forwarded to the native client now.
    expect(result.stubbedInterfaces).not.toContain('SteamClient')
  })
})

describe('isScanVerdictNowCovered', () => {
  test('returns true when the stored missing symbol is now exported', () => {
    expect(
      isScanVerdictNowCovered({
        arch: 'x86',
        missingSymbols: ['SteamAPI_Init']
      })
    ).toBe(true)
  })

  // 51-14: SteamRemoteStorage is now covered -- SteamHTTP (never widened
  // by any Phase 51 plan to date) is the still-genuinely-uncovered
  // example.
  test('returns false when the stored missing symbol is still not covered', () => {
    expect(
      isScanVerdictNowCovered({
        arch: 'x86',
        missingSymbols: ['SteamHTTP']
      })
    ).toBe(false)
  })

  test('returns true when the stored missing entry is now a served interface version', () => {
    expect(
      isScanVerdictNowCovered({
        arch: 'x86',
        missingSymbols: ['SteamUser023']
      })
    ).toBe(true)
  })

  test('a differently-shaped stored entry (e.g. "SteamUser@unknown-version") is never covered', () => {
    expect(
      isScanVerdictNowCovered({
        arch: 'x86',
        missingSymbols: ['SteamUser@unknown-version']
      })
    ).toBe(false)
  })

  test('returns true only when EVERY stored missing entry is now covered', () => {
    expect(
      isScanVerdictNowCovered({
        arch: 'x86',
        missingSymbols: ['SteamAPI_Init', 'SteamHTTP']
      })
    ).toBe(false)
  })
})

describe('isScanVerdictNowCovered is arch-scoped (CR-01)', () => {
  const cases: Array<['x86' | 'x64', string, boolean]> = [
    ['x86', 'SteamInternal_CreateInterface', false],
    ['x64', 'SteamInternal_CreateInterface', true],
    ['x86', 'SteamUser019', false],
    ['x64', 'SteamUser023', true],
    ['x64', 'SteamUser021', false],
    ['x86', 'SteamUser016', true],
    ['x86', 'SteamUser@unknown-version', false]
  ]
  test.each(cases)('%s scan with miss %s -> %s', (arch, entry, expected) => {
    expect(isScanVerdictNowCovered({ arch, missingSymbols: [entry] })).toBe(
      expected
    )
  })

  test('empty missingSymbols is covered on either arch', () => {
    expect(isScanVerdictNowCovered({ arch: 'x86', missingSymbols: [] })).toBe(
      true
    )
    expect(isScanVerdictNowCovered({ arch: 'x64', missingSymbols: [] })).toBe(
      true
    )
  })
})

describe('x64 null-object fallback is runtime-lookup only (CR-03)', () => {
  test('a bare accessor import with an unserved version is missing, not stubbed', () => {
    const result = evaluateShimCoverageWith(
      {
        x86ExportedSymbols: new Set(),
        x64ExportedSymbols: new Set(['SteamUser', 'SteamAPI_Init']),
        x86ServedVersions: new Map(),
        x64ServedVersions: new Map(),
        x64NullObjectFallback: true
      },
      {
        arch: 'x64',
        symbols: ['SteamUser', 'SteamAPI_Init'],
        requiredInterfaceVersions: { SteamUser: 'SteamUser020' },
        versionProblems: []
      }
    )
    expect(result.missingSymbols).toContain('SteamUser020')
    expect(result.stubbedInterfaces).not.toContain('SteamUser')
  })

  test('a runtime-lookup-only family is stubbed', () => {
    const symbols = [
      'SteamInternal_CreateInterface',
      'SteamAPI_GetHSteamUser',
      'SteamAPI_GetHSteamPipe'
    ]
    const result = evaluateShimCoverageWith(
      {
        x86ExportedSymbols: new Set(),
        x64ExportedSymbols: new Set(symbols),
        x86ServedVersions: new Map(),
        x64ServedVersions: new Map(),
        x64NullObjectFallback: true
      },
      {
        arch: 'x64',
        symbols,
        requiredInterfaceVersions: {
          SteamScreenshots: 'STEAMSCREENSHOTS_INTERFACE_VERSION003'
        },
        versionProblems: []
      }
    )
    expect(result.stubbedInterfaces).toContain('SteamScreenshots')
    expect(result.missingSymbols).toEqual([])
  })

  test('a bare import of the family wins over runtime lookup', () => {
    const symbols = ['SteamInternal_CreateInterface', 'SteamUser']
    const result = evaluateShimCoverageWith(
      {
        x86ExportedSymbols: new Set(),
        x64ExportedSymbols: new Set(symbols),
        x86ServedVersions: new Map(),
        x64ServedVersions: new Map(),
        x64NullObjectFallback: true
      },
      {
        arch: 'x64',
        symbols,
        requiredInterfaceVersions: { SteamUser: 'SteamUser020' },
        versionProblems: []
      }
    )
    expect(result.missingSymbols).toContain('SteamUser020')
  })

  test('x86 unserved version is always missing', () => {
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
        symbols: ['SteamInternal_CreateInterface'],
        requiredInterfaceVersions: { SteamUser: 'SteamUser020' },
        versionProblems: []
      }
    )
    expect(result.missingSymbols).toContain('SteamUser020')
  })
})

describe('findUnservableInterfaceVersions (quick 261024-j4l)', () => {
  const RUNTIME = ['SteamInternal_FindOrCreateUserInterface']

  it('x64 runtime lookup: only the version-skewed family counts', () => {
    expect(
      findUnservableInterfaceVersions({
        arch: 'x64',
        symbols: RUNTIME,
        requiredInterfaceVersions: {
          SteamFriends: 'SteamFriends017',
          SteamUser: 'SteamUser019',
          SteamHTTP: 'STEAMHTTP_INTERFACE_VERSION003',
          SteamMatchMaking: 'SteamMatchMaking009'
        }
      })
    ).toEqual(['SteamFriends017'])
  })

  it('x64 without runtime lookup: an unserved bare-accessor version is NULL', () => {
    expect(
      findUnservableInterfaceVersions({
        arch: 'x64',
        symbols: ['SteamFriends'],
        requiredInterfaceVersions: { SteamFriends: 'SteamFriends017' }
      })
    ).toEqual(['SteamFriends017'])
  })

  it('x64 runtime lookup but a bare accessor of the family: NULL, counts', () => {
    expect(
      findUnservableInterfaceVersions({
        arch: 'x64',
        symbols: [...RUNTIME, 'SteamHTTP'],
        requiredInterfaceVersions: {
          SteamHTTP: 'STEAMHTTP_INTERFACE_VERSION003'
        }
      })
    ).toEqual(['STEAMHTTP_INTERFACE_VERSION003'])
  })

  it('x86 bare SteamFriends017 counts', () => {
    expect(
      findUnservableInterfaceVersions({
        arch: 'x86',
        symbols: ['SteamFriends'],
        requiredInterfaceVersions: { SteamFriends: 'SteamFriends017' }
      })
    ).toEqual(['SteamFriends017'])
  })

  it('ELEX shape returns []', () => {
    expect(
      findUnservableInterfaceVersions({
        arch: 'x64',
        symbols: RUNTIME,
        requiredInterfaceVersions: {
          SteamUser: 'SteamUser019',
          SteamFriends: 'SteamFriends015',
          SteamUtils: 'SteamUtils008',
          SteamApps: 'STEAMAPPS_INTERFACE_VERSION008',
          SteamHTTP: 'STEAMHTTP_INTERFACE_VERSION003',
          SteamUGC: 'STEAMUGC_INTERFACE_VERSION010'
        }
      })
    ).toEqual([])
  })

  it('keeps entry order and dedupes', () => {
    expect(
      findUnservableInterfaceVersions({
        arch: 'x64',
        symbols: ['SteamFriends', 'SteamUtils'],
        requiredInterfaceVersions: {
          SteamUtils: 'SteamUtils010',
          SteamFriends: 'SteamFriends017',
          SteamAlias: 'SteamUtils010'
        }
      })
    ).toEqual(['SteamUtils010', 'SteamFriends017'])
  })
})

describe('Grim Dawn (219990) x64 acceptance (52-13)', () => {
  test('the three measured x64 versions are all servable', () => {
    expect(
      findUnservableInterfaceVersions({
        arch: 'x64',
        symbols: [
          'SteamInternal_CreateInterface',
          'SteamInternal_FindOrCreateUserInterface',
          'SteamAPI_RunCallbacks'
        ],
        requiredInterfaceVersions: {
          SteamUser: 'SteamUser023',
          SteamNetworking: 'SteamNetworking006',
          SteamRemoteStorage: 'STEAMREMOTESTORAGE_INTERFACE_VERSION016'
        }
      })
    ).toEqual([])
  })

  test('SteamUser023 is wire, the other two are stub on x64', () => {
    expect(SHIM64_SERVED_INTERFACE_VERSIONS.get('SteamUser023')).toEqual({
      family: 'SteamUser',
      mode: 'wire'
    })
    expect(
      SHIM64_SERVED_INTERFACE_VERSIONS.get('SteamNetworking006')?.mode
    ).toBe('stub')
    expect(
      SHIM64_SERVED_INTERFACE_VERSIONS.get(
        'STEAMREMOTESTORAGE_INTERFACE_VERSION016'
      )?.mode
    ).toBe('stub')
  })
})
