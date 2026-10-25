/**
 * Phase 51 Plan 18, Task 1: unit tests for the pure half of the closing
 * census tool -- `classifyCensusTitle` and `summarizeCensus`. Per the task's
 * own contract these are exercised against FIXTURE inputs only (no
 * filesystem, no objdump spawn, no real bottle) -- the impure I/O half
 * (bottle enumeration, ACF parsing, objdump spawning, file reads) is only
 * exercised live via `pnpm bridge-census` (the plan's second `<verify>`
 * line), never here.
 *
 * `classifyCensusTitle` defaults its coverage dependencies to the REAL,
 * shipped `resolveRequiredInterfaceVersions`/`evaluateShimCoverage`/
 * `SHIM64_EXPORTED_SYMBOLS` -- most cases below rely on that real,
 * currently-shipped coverage data (the census tool's whole point is to
 * measure against whatever the build actually ships). Only the
 * 'win64-no-shim' structural case injects a fake, empty x64 export set,
 * because the real one is non-empty since 51-15's D-51-13 GO.
 */

import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  appLogSegmentFor,
  attributeHelperLines,
  censusAccumulators,
  classifyBridgeEvidence,
  findUnityPlayerLogs,
  resetCensusAccumulators,
  selectLatestUnrealLogs,
  classifyCensusTitle,
  countX86ModernOrFlat,
  detectEngine,
  formatCensusMarkdown,
  pickRuntimeSteamApiDll,
  readPersistedScanArch,
  readPersistedScanVerdict,
  selectCensusExe,
  summarizeCensus,
  type CensusRow
} from '../bridgeCensus'

describe('classifyCensusTitle', () => {
  it('an x86 import set fully covered by the shipped shim classifies "bridge"', () => {
    const row = classifyCensusTitle({
      appid: '206060',
      name: 'Avernum 6',
      installdir: 'Avernum 6',
      knownBadReason: null,
      exe: {
        arch: 'x86',
        symbols: ['SteamUser'],
        dllVersions: ['SteamUser023'],
        exeVersions: []
      }
    })

    expect(row.class).toBe('bridge')
    expect(row.detail).toBe('')
  })

  it('x64 with an empty SHIM64 export set classifies "win64-no-shim" without evaluating coverage', () => {
    const resolveRequiredInterfaceVersions = jest.fn()
    const evaluateShimCoverage = jest.fn()

    const row = classifyCensusTitle(
      {
        appid: '411300',
        name: 'ELEX',
        installdir: 'ELEX',
        knownBadReason: null,
        exe: {
          arch: 'x64',
          symbols: ['SteamUser'],
          dllVersions: ['SteamUser019'],
          exeVersions: []
        }
      },
      {
        resolveRequiredInterfaceVersions,
        evaluateShimCoverage,
        x64ExportedSymbols: new Set()
      }
    )

    expect(row.class).toBe('win64-no-shim')
    expect(resolveRequiredInterfaceVersions).not.toHaveBeenCalled()
    expect(evaluateShimCoverage).not.toHaveBeenCalled()
  })

  it('x64 covered by the real shipped SHIM64 set classifies "bridge"', () => {
    const row = classifyCensusTitle({
      appid: '63000',
      name: 'Hoard (x64 fixture)',
      installdir: 'Hoard',
      knownBadReason: null,
      exe: {
        arch: 'x64',
        symbols: ['SteamUserStats'],
        dllVersions: ['STEAMUSERSTATS_INTERFACE_VERSION011'],
        exeVersions: []
      }
    })

    expect(row.class).toBe('bridge')
  })

  it('a plain missing exported symbol classifies "missing-symbols" carrying the list', () => {
    const row = classifyCensusTitle({
      appid: '999001',
      name: 'Missing Symbol Fixture',
      installdir: 'Missing Symbol Fixture',
      knownBadReason: null,
      exe: {
        arch: 'x86',
        symbols: ['SteamAPI_Init', 'SteamAPI_SteamScreenshots_v003'],
        dllVersions: [],
        exeVersions: []
      }
    })

    expect(row.class).toBe('missing-symbols')
    expect(row.detail).toBe('SteamAPI_SteamScreenshots_v003')
  })

  it('an unresolved interface version classifies "unknown-version" with the "<Family>@unknown-version" entry', () => {
    const row = classifyCensusTitle({
      appid: '999002',
      name: 'Unknown Version Fixture',
      installdir: 'Unknown Version Fixture',
      knownBadReason: null,
      exe: {
        arch: 'x86',
        symbols: ['SteamUser'],
        dllVersions: [],
        exeVersions: []
      }
    })

    expect(row.class).toBe('unknown-version')
    expect(row.detail).toBe('SteamUser@unknown-version')
  })

  it('a title on the bundled known-bad list classifies "known-bad" with the reason, regardless of its exe', () => {
    const row = classifyCensusTitle({
      appid: '123456',
      name: 'Known Bad Fixture',
      installdir: 'Known Bad Fixture',
      knownBadReason: 'drm-wrapped',
      exe: {
        arch: 'x86',
        symbols: ['SteamUser'],
        dllVersions: ['SteamUser023'],
        exeVersions: []
      }
    })

    expect(row.class).toBe('known-bad')
    expect(row.detail).toBe('drm-wrapped')
  })

  it('a does-not-run title (Hoard 63000) still classifies "known-bad" in the census', () => {
    const row = classifyCensusTitle({
      appid: '63000',
      name: 'Hoard',
      installdir: 'Hoard',
      knownBadReason: 'does-not-run',
      exe: {
        arch: 'x86',
        symbols: ['SteamUser'],
        dllVersions: ['SteamUser023'],
        exeVersions: []
      }
    })

    expect(row.class).toBe('known-bad')
    expect(row.detail).toBe('does-not-run')
  })

  it('no scannable PE exe found under installdir classifies "no-binary"', () => {
    const row = classifyCensusTitle({
      appid: '38410',
      name: 'Fallout 2',
      installdir: 'Fallout 2',
      knownBadReason: null,
      exe: null
    })

    expect(row.class).toBe('no-binary')
  })

  it('an exe with no steam_api import and no steam_api dll in the tree classifies "no-steam-api" (routed, labelled)', () => {
    const row = classifyCensusTitle({
      appid: '2706020',
      name: 'All Will Fall',
      installdir: 'All Will Fall',
      knownBadReason: null,
      exe: {
        arch: 'none',
        symbols: [],
        dllVersions: [],
        exeVersions: []
      }
    })

    expect(row.class).toBe('no-steam-api')
    expect(row.detail).toBe(
      'launch exe imports no steam_api and none ships in the install tree'
    )
    expect(summarizeCensus([row]).covered).toBe(1)
  })

  it('an exe with no import but a shipped steam_api64.dll classifies "missing-symbols" with the runtime-loaded marker', () => {
    const row = classifyCensusTitle({
      appid: '1',
      name: 'Loader',
      installdir: 'Loader',
      runtimeLoadedDll: 'steam_api64.dll',
      exe: { arch: 'none', symbols: [], dllVersions: [], exeVersions: [] }
    })

    expect(row.class).toBe('missing-symbols')
    expect(row.detail).toBe('steam_api64.dll@runtime-loaded')
    expect(summarizeCensus([row]).covered).toBe(0)
  })

  it('playRecorded is true only for a routed row with playVerified', () => {
    const exe = {
      arch: 'x86' as const,
      symbols: ['SteamUser'],
      dllVersions: ['SteamUser023'],
      exeVersions: []
    }
    const mk = (playVerified: boolean, knownBadReason?: string) =>
      classifyCensusTitle({
        appid: '1',
        name: 'N',
        installdir: 'N',
        playVerified,
        knownBadReason,
        exe
      })

    expect(mk(true).playRecorded).toBe(true)
    expect(mk(false).playRecorded).toBe(false)
    expect(mk(true, 'does-not-run').playRecorded).toBe(false)
  })

  it('a row carries only appid, name, installdir, arch, class, detail -- never a path or account field', () => {
    const row = classifyCensusTitle({
      appid: '206040',
      name: 'Avernum 5',
      installdir: 'Avernum 5',
      knownBadReason: null,
      exe: {
        arch: 'x86',
        symbols: ['SteamUser'],
        dllVersions: ['SteamUser023'],
        exeVersions: []
      }
    })

    expect(Object.keys(row).sort()).toEqual(
      [
        'appid',
        'arch',
        'class',
        'detail',
        'evidence',
        'evidenceDetail',
        'installdir',
        'name',
        'playRecorded'
      ].sort()
    )
  })
})

describe('formatCensusMarkdown', () => {
  it('prints the Play recorded and Evidence columns and the verified summary line', () => {
    const mk = (
      appid: string,
      cls: CensusRow['class'],
      evidence: CensusRow['evidence'],
      evidenceDetail: string,
      playRecorded = false
    ): CensusRow => ({
      appid,
      name: appid,
      installdir: appid,
      arch: 'x86',
      class: cls,
      detail: '',
      playRecorded,
      evidence,
      evidenceDetail
    })
    const out = formatCensusMarkdown([
      mk('1', 'bridge', 'verified', '', true),
      mk('2', 'bridge', 'init-failed', 'SteamAPI_Init'),
      mk('3', 'known-bad', 'unverified', 'no HELLO')
    ])

    expect(out).toContain(
      '| AppID | Name | Installdir | Arch | Class (static scan) | Play recorded (allowlist) | Evidence | Detail |'
    )
    expect(out).toContain('| bridge | yes | verified |')
    expect(out).toContain('init-failed (SteamAPI_Init)')
    expect(out).toContain('unverified (no HELLO)')
    expect(out).toContain(
      '3 of 3 routed to the bridge; 1 of 3 verified running through the bridge (HELLO + clean game log; 1 init-failed, 1 unverified); 1 of 3 play recorded in the allowlist; 2 of 3 symbols covered by the shim (static scan) (bridge=2, known-bad=1)'
    )
  })
})

describe('summarizeCensus', () => {
  const rows: CensusRow[] = [
    {
      appid: '1',
      name: 'Bridge A',
      installdir: 'Bridge A',
      arch: 'x86',
      class: 'bridge',
      detail: '',
      playRecorded: false,
      evidence: 'unverified',
      evidenceDetail: 'x'
    },
    {
      appid: '2',
      name: 'Bridge B',
      installdir: 'Bridge B',
      arch: 'x64',
      class: 'bridge',
      detail: '',
      playRecorded: false,
      evidence: 'unverified',
      evidenceDetail: 'x'
    },
    {
      appid: '3',
      name: 'Missing',
      installdir: 'Missing',
      arch: 'x86',
      class: 'missing-symbols',
      detail: 'SteamAPI_SteamScreenshots_v003',
      playRecorded: false,
      evidence: 'unverified',
      evidenceDetail: 'x'
    },
    {
      appid: '4',
      name: 'No Binary',
      installdir: 'No Binary',
      arch: 'none',
      class: 'no-binary',
      detail: 'no scannable PE executable found under installdir',
      playRecorded: false,
      evidence: 'unverified',
      evidenceDetail: 'x'
    }
  ]

  it('classes: routed follows the resolver, covered is bridge + no-steam-api', () => {
    const mk = (cls: CensusRow['class'], detail = ''): CensusRow => ({
      appid: cls + detail,
      name: cls,
      installdir: cls,
      arch: 'x86',
      class: cls,
      detail,
      playRecorded: false,
      evidence: 'unverified',
      evidenceDetail: 'x'
    })
    const summary = summarizeCensus([
      mk('bridge'),
      mk('no-steam-api'),
      mk('missing-symbols', 'X'),
      mk('unknown-version', 'Y'),
      mk('known-bad', 'does-not-run'),
      mk('known-bad', 'drm-wrapped'),
      mk('win64-no-shim'),
      mk('no-binary')
    ])
    expect(summary.routed).toBe(5)
    expect(summary.covered).toBe(2)
    expect(summary.total).toBe(8)
  })

  it('formatCensusMarkdown keeps the 51-30 prefix', () => {
    const out = formatCensusMarkdown(rows)
    expect(out).toMatch(
      /[0-9]+ of [0-9]+ routed to the bridge; [0-9]+ of [0-9]+ verified running through the bridge/
    )
    expect(out).toContain('symbols covered by the shim')
  })

  it('counts routed per the resolver (scan-miss counts), covered as bridge rows, and total as every row including no-binary', () => {
    const summary = summarizeCensus(rows)

    expect(summary.routed).toBe(3)
    expect(summary.covered).toBe(2)
    expect(summary.total).toBe(4)
    expect(summary.byClass).toEqual({
      bridge: 2,
      'missing-symbols': 1,
      'no-binary': 1
    })
  })

  it('never counts a no-binary row as routed', () => {
    const onlyNoBinary: CensusRow[] = [
      {
        appid: '5',
        name: 'Solo No Binary',
        installdir: 'Solo No Binary',
        arch: 'none',
        class: 'no-binary',
        detail: 'no scannable PE executable found under installdir',
        playRecorded: false,
        evidence: 'unverified',
        evidenceDetail: 'x'
      }
    ]

    expect(summarizeCensus(onlyNoBinary).routed).toBe(0)
    expect(summarizeCensus(onlyNoBinary).covered).toBe(0)
  })
})

describe('quick 261024-br4: detected Steam CEG / SteamStub .bind', () => {
  const coveredExe = {
    arch: 'x86' as const,
    symbols: ['SteamUser'],
    dllVersions: ['SteamUser023'],
    exeVersions: []
  }

  it('CEG markers with no bundled reason classify known-bad "drm-wrapped" and are not routed', () => {
    const row = classifyCensusTitle({
      appid: '200510',
      name: 'XCOM: Enemy Unknown',
      installdir: 'XCom-Enemy-Unknown',
      knownBadReason: null,
      steamDrm: { cegMarkers: ['STEAM_SPLIT_GUID'], hasBindSection: false },
      exe: coveredExe
    })

    expect(row.class).toBe('known-bad')
    expect(row.detail).toBe('drm-wrapped')
    expect(summarizeCensus([row]).routed).toBe(0)
  })

  it('a detected CEG beats a bundled does-not-run reason', () => {
    const row = classifyCensusTitle({
      appid: '63000',
      name: 'Hoard',
      installdir: 'Hoard',
      knownBadReason: 'does-not-run',
      steamDrm: { cegMarkers: ['STEAM_GUIDD'], hasBindSection: false },
      exe: coveredExe
    })

    expect(row.class).toBe('known-bad')
    expect(row.detail).toBe('drm-wrapped')
  })

  it('a .bind section keeps a bridge row bridge and adds the informational suffix', () => {
    const row = classifyCensusTitle({
      appid: '206060',
      name: 'Avernum 6',
      installdir: 'Avernum 6',
      knownBadReason: null,
      steamDrm: { cegMarkers: [], hasBindSection: true },
      exe: coveredExe
    })

    expect(row.class).toBe('bridge')
    expect(row.detail).toBe('SteamStub .bind section (informational)')
    expect(summarizeCensus([row]).routed).toBe(1)
  })

  it('a .bind section appends to an existing detail', () => {
    const row = classifyCensusTitle({
      appid: '1',
      name: 'Unknown Version',
      installdir: 'Unknown Version',
      knownBadReason: null,
      steamDrm: { cegMarkers: [], hasBindSection: true },
      exe: { ...coveredExe, dllVersions: [] }
    })

    expect(row.class).toBe('unknown-version')
    expect(row.detail).toBe(
      'SteamUser@unknown-version; SteamStub .bind section (informational)'
    )
  })

  it('a known-bad row never gains the .bind suffix', () => {
    const row = classifyCensusTitle({
      appid: '63000',
      name: 'Hoard',
      installdir: 'Hoard',
      knownBadReason: 'does-not-run',
      steamDrm: { cegMarkers: [], hasBindSection: true },
      exe: coveredExe
    })

    expect(row.class).toBe('known-bad')
    expect(row.detail).toBe('does-not-run')
  })
})

describe('quick 261024-f0w: dual-arch exe selection', () => {
  const x86Table = {
    dll: 'steam_api.dll' as const,
    arch: 'x86' as const,
    symbols: ['SteamAPI_Init', 'SteamAPI_SteamScreenshots_v003'],
    conflict: false
  }
  const x64Table = {
    dll: 'steam_api64.dll' as const,
    arch: 'x64' as const,
    symbols: ['SteamUser'],
    conflict: false
  }
  const aod = [
    { path: 'common/Age of Decadence/AoD.exe', table: x86Table },
    { path: 'common/Age of Decadence/AoD64.exe', table: x64Table }
  ]

  it('readPersistedScanArch reads bridge.scan.arch for the appId', () => {
    const text = JSON.stringify({
      '230070': {
        art_cover: '',
        bridge: {
          steamApi: 'both',
          scan: { status: 'clean', arch: 'x64' }
        }
      }
    })
    expect(readPersistedScanArch(text, '230070')).toBe('x64')
  })

  it('readPersistedScanArch is total over missing and malformed input', () => {
    const noScan = JSON.stringify({ '1': { bridge: { steamApi: 'both' } } })
    const badArch = JSON.stringify({
      '1': { bridge: { scan: { arch: 'arm' } } }
    })
    expect(readPersistedScanArch(noScan, '1')).toBeUndefined()
    expect(readPersistedScanArch(noScan, '2')).toBeUndefined()
    expect(readPersistedScanArch(badArch, '1')).toBeUndefined()
    expect(readPersistedScanArch('{not json', '1')).toBeUndefined()
    expect(readPersistedScanArch('null', '1')).toBeUndefined()
    expect(readPersistedScanArch(null, '1')).toBeUndefined()
  })

  it('persisted x64 picks AoD64.exe even though AoD.exe is first', () => {
    const sel = selectCensusExe(aod, 'x64')
    expect(sel?.chosen.path).toContain('AoD64.exe')
    expect(sel?.chosen.table.arch).toBe('x64')
    expect(sel?.archNote).toBe('')
  })

  it('persisted x86 picks AoD.exe', () => {
    const sel = selectCensusExe(aod, 'x86')
    expect(sel?.chosen.path.endsWith('AoD.exe')).toBe(true)
  })

  it('no persisted verdict keeps the first importer and says the arch is unconfirmed', () => {
    const sel = selectCensusExe(aod, undefined)
    expect(sel?.chosen.path.endsWith('AoD.exe')).toBe(true)
    expect(sel?.archNote).toMatch(/dual-arch install/)
    expect(sel?.archNote).toMatch(/unconfirmed/)
  })

  it('a persisted arch absent from the scanned exes falls back with a note', () => {
    const sel = selectCensusExe([aod[0]], 'x64')
    expect(sel?.chosen.table.arch).toBe('x86')
    expect(sel?.archNote).toMatch(/not among the scanned exes/)
  })

  it('single-arch and empty candidate lists behave as before', () => {
    expect(selectCensusExe([aod[1]], undefined)?.archNote).toBe('')
    expect(selectCensusExe([aod[1]], 'x64')?.archNote).toBe('')
    expect(selectCensusExe([], 'x64')).toBeNull()
  })

  it('AoD regression: the selected x64 candidate classifies as arch x64, not the x86 symbol list', () => {
    const sel = selectCensusExe(aod, 'x64')!
    const row = classifyCensusTitle({
      appid: '230070',
      name: 'The Age of Decadence',
      installdir: 'Age of Decadence',
      knownBadReason: null,
      archNote: sel.archNote || undefined,
      exe: {
        arch: sel.chosen.table.arch,
        symbols: sel.chosen.table.symbols,
        dllVersions: ['SteamUser019'],
        exeVersions: []
      }
    })
    expect(row.arch).toBe('x64')
    expect(row.detail).not.toContain('SteamAPI_SteamScreenshots_v003')
  })

  it('an archNote is appended to the detail', () => {
    const row = classifyCensusTitle({
      appid: '1',
      name: 'N',
      installdir: 'N',
      archNote: 'dual-arch install, arch unconfirmed',
      exe: null
    })
    expect(row.detail).toMatch(/; dual-arch install, arch unconfirmed$/)
  })
})

describe('quick 261024-f0w: classifyBridgeEvidence', () => {
  const hello = (id: string) =>
    `bridge helper [${id}]: [2026-10-23T21:19:34Z] HELLO  shim attached appid=${id}\n`
  const rogueLog =
    'Unity intercepted Exception: EntryPointNotFoundException: SteamAPI_ISteamClient_GetISteamUser assembly:<unknown assembly> type:<unknown type> member:(null)\n' +
    '  at Steamworks.SteamAPI.Init () [0x00000] in <filename unknown>:0\n'
  const clean = 'Initialize engine version: 2021.3\nLoaded scene\n'

  it('1691190 RogueWaters is init-failed carrying the missing symbol', () => {
    expect(
      classifyBridgeEvidence({
        appid: '1691190',
        appLogTexts: [hello('1691190')],
        gameLogTexts: [rogueLog]
      })
    ).toEqual({
      status: 'init-failed',
      detail: 'SteamAPI_ISteamClient_GetISteamUser'
    })
  })

  it('a SteamInternal_ EntryPointNotFoundException is init-failed with that symbol', () => {
    const r = classifyBridgeEvidence({
      appid: '1',
      appLogTexts: [hello('1')],
      gameLogTexts: [
        'EntryPointNotFoundException: SteamInternal_FindOrCreateUserInterface assembly:x'
      ]
    })
    expect(r).toEqual({
      status: 'init-failed',
      detail: 'SteamInternal_FindOrCreateUserInterface'
    })
  })

  it('SteamAPI_Init and SteamAPI_InitEx failure text are init-failed', () => {
    const run = (text: string) =>
      classifyBridgeEvidence({
        appid: '1',
        appLogTexts: [hello('1')],
        gameLogTexts: [text]
      })
    expect(run('[Steamworks.NET] SteamAPI_Init() failed.')).toEqual({
      status: 'init-failed',
      detail: 'SteamAPI_Init'
    })
    expect(run('SteamAPI_InitEx returned false')).toEqual({
      status: 'init-failed',
      detail: 'SteamAPI_InitEx'
    })
  })

  it('a HELLO and a clean game log is verified', () => {
    expect(
      classifyBridgeEvidence({
        appid: '1',
        appLogTexts: [hello('1')],
        gameLogTexts: [clean]
      }).status
    ).toBe('verified')
  })

  it('a HELLO with no game log is unverified', () => {
    expect(
      classifyBridgeEvidence({
        appid: '1',
        appLogTexts: [hello('1')],
        gameLogTexts: []
      })
    ).toEqual({ status: 'unverified', detail: 'no game log found' })
  })

  it('no HELLO is unverified, and near-miss appids do not vouch', () => {
    const run = (appLog: string) =>
      classifyBridgeEvidence({
        appid: '230070',
        appLogTexts: [appLog],
        gameLogTexts: [clean]
      })
    expect(run('')).toEqual({ status: 'unverified', detail: 'no HELLO' })
    expect(run(hello('2300700')).status).toBe('unverified')
    expect(run(hello('23007')).status).toBe('unverified')
    expect(run(hello('230070')).status).toBe('verified')
  })

  it('a bare Init stack frame or a non-Steam missing symbol is not a failure', () => {
    const r = classifyBridgeEvidence({
      appid: '1',
      appLogTexts: [hello('1')],
      gameLogTexts: [
        'at Steamworks.SteamAPI.Init () [0x00000]\nEntryPointNotFoundException: SomeOtherLib_Foo assembly:x'
      ]
    })
    expect(r.status).toBe('verified')
  })

  it('a non-numeric appid is unverified', () => {
    expect(
      classifyBridgeEvidence({
        appid: '1.*',
        appLogTexts: [hello('1')],
        gameLogTexts: [clean]
      }).status
    ).toBe('unverified')
  })

  it('classifyCensusTitle without evidence reads unverified / evidence not collected', () => {
    const row = classifyCensusTitle({
      appid: '1',
      name: 'N',
      installdir: 'N',
      exe: null
    })
    expect(row.evidence).toBe('unverified')
    expect(row.evidenceDetail).toBe('evidence not collected')
  })

  it('summarizeCensus counts verified from evidence, not playRecorded', () => {
    const mk = (
      evidence: CensusRow['evidence'],
      playRecorded: boolean
    ): CensusRow => ({
      appid: evidence,
      name: 'n',
      installdir: 'n',
      arch: 'x86',
      class: 'bridge',
      detail: '',
      playRecorded,
      evidence,
      evidenceDetail: ''
    })
    const s = summarizeCensus([
      mk('verified', false),
      mk('init-failed', true),
      mk('unverified', true)
    ])
    expect(s.verified).toBe(1)
    expect(s.initFailed).toBe(1)
    expect(s.unverified).toBe(1)
    expect(s.playRecorded).toBe(2)
  })
})

describe('quick 261024-uir: shim-placed runtime-loaded steam_api', () => {
  const noImportExe = {
    arch: 'none' as const,
    symbols: [],
    dllVersions: [],
    exeVersions: []
  }
  const classify = (
    found: Parameters<typeof pickRuntimeSteamApiDll>[0],
    scan: Parameters<typeof pickRuntimeSteamApiDll>[1],
    playVerified = false
  ): CensusRow =>
    classifyCensusTitle({
      appid: '284100',
      name: 'Title',
      installdir: 'Title',
      playVerified,
      ...pickRuntimeSteamApiDll(found, scan),
      exe: noImportExe
    })
  const missVerdict = {
    status: 'miss' as const,
    arch: 'x64' as const,
    missingSymbols: [
      'SteamAPI_RestartAppIfNecessary',
      'steam_api64.dll@runtime-loaded'
    ],
    interfaceVersions: {}
  }

  it('no dll at all stays no-steam-api and covered', () => {
    expect(pickRuntimeSteamApiDll([], undefined)).toEqual({
      runtimeLoadedDll: null,
      shimOnlyRuntimeDll: null
    })
    const row = classify([], undefined)
    expect(row.class).toBe('no-steam-api')
    expect(row.detail).toBe(
      'launch exe imports no steam_api and none ships in the install tree'
    )
    expect(summarizeCensus([row]).covered).toBe(1)
  })

  it('shim with backup classifies exactly as the original', () => {
    const picked = pickRuntimeSteamApiDll(
      [{ name: 'steam_api64.dll', provenance: 'shim-backed' }],
      undefined
    )
    expect(picked).toEqual({
      runtimeLoadedDll: 'steam_api64.dll',
      shimOnlyRuntimeDll: null
    })
    const backed = classify(
      [{ name: 'steam_api64.dll', provenance: 'shim-backed' }],
      undefined
    )
    expect(backed).toEqual(
      classify([{ name: 'steam_api64.dll', provenance: 'original' }], undefined)
    )
    expect(backed.class).toBe('missing-symbols')
    expect(backed.detail).toBe('steam_api64.dll@runtime-loaded')
  })

  it('shim-only plus persisted miss verdict is missing-symbols with the persisted symbols', () => {
    const row = classify(
      [{ name: 'steam_api64.dll', provenance: 'shim-only' }],
      missVerdict
    )
    expect(row.class).toBe('missing-symbols')
    expect(row.detail.startsWith('steam_api64.dll@runtime-loaded')).toBe(true)
    expect(row.detail).toContain('SteamAPI_RestartAppIfNecessary')
    expect(row.detail.split('SteamAPI_RestartAppIfNecessary')).toHaveLength(2)
    expect(row.detail.split('@runtime-loaded')).toHaveLength(2)
    const s = summarizeCensus([row])
    expect(s.covered).toBe(0)
    expect(s.routed).toBe(1)
  })

  it('shim-only plus persisted clean verdict is missing-symbols, not covered', () => {
    const row = classify(
      [{ name: 'steam_api64.dll', provenance: 'shim-only' }],
      { ...missVerdict, status: 'clean', missingSymbols: [] }
    )
    expect(row.class).toBe('missing-symbols')
    expect(row.detail.startsWith('steam_api64.dll@runtime-loaded')).toBe(true)
    expect(row.detail).toContain('persisted bridge.scan clean')
    expect(summarizeCensus([row]).covered).toBe(0)
  })

  it('shim-only with no verdict is unconfirmed: routed, not covered, never play-recorded', () => {
    const row = classify(
      [{ name: 'steam_api64.dll', provenance: 'shim-only' }],
      undefined,
      true
    )
    expect(row.class).toBe('unconfirmed')
    expect(row.arch).toBe('none')
    expect(row.playRecorded).toBe(false)
    expect(row.detail).toContain('steam_api64.dll')
    expect(row.detail).not.toMatch(/[/\\]/)
    const s = summarizeCensus([row])
    expect(s.covered).toBe(0)
    expect(s.routed).toBe(1)
  })

  it('picker precedence: original > shim-backed > shim-only; 64 beats 32', () => {
    expect(
      pickRuntimeSteamApiDll(
        [
          { name: 'steam_api64.dll', provenance: 'shim-only' },
          { name: 'steam_api64.dll', provenance: 'original' }
        ],
        undefined
      ).runtimeLoadedDll
    ).toBe('steam_api64.dll')
    expect(
      pickRuntimeSteamApiDll(
        [
          { name: 'steam_api64.dll', provenance: 'shim-only' },
          { name: 'steam_api64.dll', provenance: 'shim-backed' }
        ],
        undefined
      ).runtimeLoadedDll
    ).toBe('steam_api64.dll')
    const picked = pickRuntimeSteamApiDll(
      [
        { name: 'steam_api.dll', provenance: 'original' },
        { name: 'steam_api64.dll', provenance: 'shim-only' }
      ],
      undefined
    )
    expect(picked.runtimeLoadedDll).toBeNull()
    expect(picked.shimOnlyRuntimeDll).toEqual({
      dll: 'steam_api64.dll',
      persistedScan: null
    })
  })

  it('readPersistedScanVerdict is total and sanitises', () => {
    const wrap = (scan: unknown): string =>
      JSON.stringify({ '1': { bridge: { scan } } })
    expect(readPersistedScanVerdict(null, '1')).toBeUndefined()
    expect(readPersistedScanVerdict('{not json', '1')).toBeUndefined()
    expect(readPersistedScanVerdict('null', '1')).toBeUndefined()
    expect(readPersistedScanVerdict('{}', '1')).toBeUndefined()
    expect(readPersistedScanVerdict(wrap({ arch: 'x64' }), '1')).toBeUndefined()
    expect(
      readPersistedScanVerdict(wrap({ status: 'weird', arch: 'x64' }), '1')
    ).toBeUndefined()
    expect(
      readPersistedScanVerdict(wrap({ status: 'miss', arch: 'arm' }), '1')
    ).toBeUndefined()
    const v = readPersistedScanVerdict(
      wrap({
        status: 'miss',
        arch: 'x86',
        missingSymbols: ['A', 5, 'a/b', 'c\\d', 'x'.repeat(129), 'B'],
        interfaceVersions: { SteamUser: 'SteamUser023', Bad: 7 }
      }),
      '1'
    )
    expect(v).toEqual({
      status: 'miss',
      arch: 'x86',
      missingSymbols: ['A', 'B'],
      interfaceVersions: { SteamUser: 'SteamUser023' }
    })
    expect(
      readPersistedScanVerdict(
        wrap({
          status: 'clean',
          arch: 'x64',
          missingSymbols: 'nope',
          interfaceVersions: 'nope'
        }),
        '1'
      )
    ).toEqual({
      status: 'clean',
      arch: 'x64',
      missingSymbols: [],
      interfaceVersions: {}
    })
  })

  it('formatCensusMarkdown shows unconfirmed=1, routed not covered', () => {
    const row = classify(
      [{ name: 'steam_api.dll', provenance: 'shim-only' }],
      undefined
    )
    const md = formatCensusMarkdown([row])
    expect(md).toContain('unconfirmed=1')
    expect(md).toContain('1 of 1 routed')
    expect(md).toContain('0 of 1 symbols covered')
  })
})

describe('D-53-13: engine-aware bridge evidence', () => {
  const hello = (id: string) =>
    `bridge helper [${id}]: [2026-10-24T18:29:26Z] HELLO  shim attached appid=${id}\n`
  const call = (id: string, m = 'SteamUser023.GetSteamID') =>
    `bridge helper [${id}]: [2026-10-24T18:29:27Z] CALL   ${m}\n`
  const fwd = (id: string) =>
    `bridge helper [${id}]: [2026-10-24T18:29:27Z] FWD    FWD CreateInterface ver=x\n`
  const id = '3410180'

  it('godot: HELLO then a game call is verified with the call named', () => {
    expect(
      classifyBridgeEvidence({
        appid: id,
        engine: 'godot',
        appLogTexts: [
          hello(id) + call(id) + call(id, 'SteamUtils010.GetAppID')
        ],
        gameLogTexts: []
      })
    ).toEqual({
      status: 'verified',
      detail: 'game call SteamUser023.GetSteamID'
    })
  })

  it('a CALL before HELLO does not count', () => {
    expect(
      classifyBridgeEvidence({
        appid: id,
        engine: 'godot',
        appLogTexts: [call(id) + hello(id)],
        gameLogTexts: []
      })
    ).toEqual({ status: 'unverified', detail: 'no game-originated call' })
  })

  it.each(['34101800', '341018'])(
    'a CALL for appid %s does not count for %s',
    (other) => {
      expect(
        classifyBridgeEvidence({
          appid: id,
          engine: 'godot',
          appLogTexts: [hello(id) + call(other)],
          gameLogTexts: []
        })
      ).toEqual({ status: 'unverified', detail: 'no game-originated call' })
    }
  )

  it.each(['godot', 'gamemaker', 'unknown'] as const)(
    '%s with HELLO and only FWD lines is unverified',
    (engine) => {
      expect(
        classifyBridgeEvidence({
          appid: id,
          engine,
          appLogTexts: [hello(id) + fwd(id)],
          gameLogTexts: []
        })
      ).toEqual({ status: 'unverified', detail: 'no game-originated call' })
    }
  )

  it('no HELLO is unverified for every engine', () => {
    for (const engine of ['unity', 'unreal', 'godot', 'gamemaker'] as const) {
      expect(
        classifyBridgeEvidence({
          appid: id,
          engine,
          appLogTexts: [call(id)],
          gameLogTexts: ['clean']
        })
      ).toEqual({ status: 'unverified', detail: 'no HELLO' })
    }
  })

  it('unity: HELLO + clean Player.log is verified with or without a CALL', () => {
    for (const extra of ['', call(id)]) {
      expect(
        classifyBridgeEvidence({
          appid: id,
          engine: 'unity',
          appLogTexts: [hello(id) + extra],
          gameLogTexts: ['Initialize engine\n']
        })
      ).toEqual({ status: 'verified', detail: '' })
    }
  })

  it('unity: a CALL does not substitute for a missing Player.log', () => {
    expect(
      classifyBridgeEvidence({
        appid: id,
        engine: 'unity',
        appLogTexts: [hello(id) + call(id)],
        gameLogTexts: []
      })
    ).toEqual({ status: 'unverified', detail: 'no game log found' })
  })

  it('unity: EntryPointNotFoundException is init-failed with the symbol', () => {
    expect(
      classifyBridgeEvidence({
        appid: id,
        engine: 'unity',
        appLogTexts: [hello(id)],
        gameLogTexts: [
          'EntryPointNotFoundException: SteamAPI_ISteamUtils_IsSteamRunningOnSteamDeck\n'
        ]
      })
    ).toEqual({
      status: 'init-failed',
      detail: 'SteamAPI_ISteamUtils_IsSteamRunningOnSteamDeck'
    })
  })

  it('unreal: a failure marker is init-failed even with a CALL', () => {
    expect(
      classifyBridgeEvidence({
        appid: id,
        engine: 'unreal',
        appLogTexts: [hello(id) + call(id)],
        gameLogTexts: [
          'LogSteamShared: Warning: SteamAPI failed to initialize\n'
        ]
      })
    ).toEqual({ status: 'init-failed', detail: 'UE SteamAPI init failed' })
  })

  it('unreal: the Client API marker verifies', () => {
    expect(
      classifyBridgeEvidence({
        appid: id,
        engine: 'unreal',
        appLogTexts: [hello(id)],
        gameLogTexts: [
          `LogOnline: STEAM: [AppId: ${id}] Client API initialized 1\n`
        ]
      })
    ).toEqual({ status: 'verified', detail: '' })
  })

  it('unreal: a clean log plus a CALL verifies; without either it does not', () => {
    expect(
      classifyBridgeEvidence({
        appid: id,
        engine: 'unreal',
        appLogTexts: [
          hello(id) + call(id) + call(id, 'SteamUtils010.GetAppID')
        ],
        gameLogTexts: ['LogInit: ok\n']
      }).status
    ).toBe('verified')
    expect(
      classifyBridgeEvidence({
        appid: id,
        engine: 'unreal',
        appLogTexts: [hello(id)],
        gameLogTexts: ['LogInit: ok\n']
      }).status
    ).toBe('unverified')
  })

  it('detectEngine recognises each engine', () => {
    expect(detectEngine(['Game.exe', 'Game_Data', 'UnityPlayer.dll'])).toBe(
      'unity'
    )
    expect(detectEngine(['Engine', 'Proj', 'Proj.exe'])).toBe('unreal')
    expect(detectEngine(['Proj-Win64-Shipping.exe'])).toBe('unreal')
    expect(detectEngine(['Game.exe', 'Game.pck'])).toBe('godot')
    expect(detectEngine(['libgodotsteam.windows.dll'])).toBe('godot')
    expect(detectEngine(['data.win', 'Game.exe'])).toBe('gamemaker')
    expect(detectEngine(['a.exe'])).toBe('unknown')
  })
})

describe('D-53-14: Steamworks-using denominator', () => {
  const mk = (
    cls: CensusRow['class'],
    evidence: CensusRow['evidence']
  ): CensusRow => ({
    appid: '1',
    name: 'n',
    installdir: 'n',
    arch: 'x86',
    class: cls,
    detail: '',
    playRecorded: false,
    evidence,
    evidenceDetail: ''
  })

  it('keeps known-bad and win64-no-shim in, drops no-steam-api and no-binary', () => {
    const s = summarizeCensus([
      mk('bridge', 'verified'),
      mk('known-bad', 'unverified'),
      mk('win64-no-shim', 'unverified'),
      mk('no-steam-api', 'verified'),
      mk('no-binary', 'unverified')
    ])
    expect(s.steamworksUsing).toBe(3)
    expect(s.verifiedSteamworksUsing).toBe(1)
    expect(s.majority).toBe(false)
  })

  it('reports a majority and prints the line', () => {
    const rows = [
      mk('bridge', 'verified'),
      mk('bridge', 'verified'),
      mk('known-bad', 'unverified')
    ]
    expect(summarizeCensus(rows).majority).toBe(true)
    expect(formatCensusMarkdown(rows)).toContain(
      '2 of 3 Steamworks-using rows verified (majority: yes)'
    )
  })

  it('exactly half is not a majority', () => {
    expect(
      summarizeCensus([mk('bridge', 'verified'), mk('bridge', 'unverified')])
        .majority
    ).toBe(false)
  })
})

// Phase 53 (53-07, D-53-12): the census answers every scan question through
// bridgeScan.ts; managed, importer and AnyCPU evidence flow into rows.
describe('D-53-12 census shares the install scan', () => {
  const flatFixture: { names: string[] } = JSON.parse(
    readFileSync(
      join(
        __dirname,
        '..',
        '..',
        'src/backend/storeManagers/steam/bridge/__tests__/fixtures/steamworksNetFlatNames.json'
      ),
      'utf-8'
    )
  )
  const base = {
    appid: '1691190',
    name: 'Rogue Waters',
    installdir: 'RogueWaters',
    knownBadReason: null
  }
  const noStatic = {
    arch: 'none' as const,
    symbols: [],
    dllVersions: [],
    exeVersions: []
  }

  it('judges a Mono row on lifecycle plus served-family names and counts the unserved families (D-53-04)', () => {
    const row = classifyCensusTitle({
      ...base,
      runtimeLoadedDll: 'steam_api64.dll',
      managed: {
        kind: 'mono',
        symbols: flatFixture.names,
        versionStrings: ['SteamClient020', 'SteamUser021'],
        assemblies: 3
      },
      exe: noStatic
    })
    // The Rogue Waters shape: every served-family and lifecycle name resolves.
    expect(row.class).toBe('bridge')
    expect(row.arch).toBe('x64')
    expect(row.detail).toMatch(/^\+\d+ unserved-family imports \(lazy\)$/)
    expect(row.detail).not.toMatch(/ISteamUGC|ISteamHTTP|ISteamInventory/)
  })

  it('carries the il2cpp reason in the detail', () => {
    const row = classifyCensusTitle({
      ...base,
      runtimeLoadedDll: 'steam_api64.dll',
      managed: { kind: 'il2cpp', reason: 'il2cpp: not scanned' },
      exe: noStatic
    })
    expect(row.class).toBe('missing-symbols')
    expect(row.detail).toContain('il2cpp: not scanned')
    expect(row.detail).toContain('steam_api64.dll@runtime-loaded')
  })

  it('classifies a UE stub plus Shipping layout from importer evidence, never no-steam-api', () => {
    const row = classifyCensusTitle({
      appid: '1363080',
      name: 'Manor Lords',
      installdir: 'Manor Lords',
      knownBadReason: null,
      runtimeLoadedDll: 'steam_api64.dll',
      launchArch: 'x64',
      importerEvidence: {
        symbols: ['SteamAPI_Init', 'SteamAPI_Shutdown'],
        dllVersions: ['SteamUser021', 'SteamClient020'],
        exeVersions: []
      },
      exe: noStatic
    })
    expect(row.class).not.toBe('no-steam-api')
    expect(['bridge', 'missing-symbols', 'unknown-version']).toContain(
      row.class
    )
    expect(row.arch).toBe('x64')
  })

  it('reports an AnyCPU launch exe as x64 on a runtime-loaded row (D-53-10)', () => {
    const row = classifyCensusTitle({
      appid: '284100',
      name: 'Unclaimed World',
      installdir: 'Unclaimed World',
      knownBadReason: null,
      runtimeLoadedDll: 'steam_api64.dll',
      launchArch: 'x64',
      exe: noStatic
    })
    expect(row.arch).toBe('x64')
  })

  it('counts x86 titles that need the modern or flat names (D-53-09)', () => {
    expect(
      countX86ModernOrFlat([
        { appid: '1', arch: 'x86', symbols: ['SteamAPI_Init'] },
        { appid: '2', arch: 'x86', symbols: ['SteamInternal_ContextInit'] },
        { appid: '3', arch: 'x64', symbols: ['SteamInternal_ContextInit'] },
        { appid: '4', arch: 'x86', symbols: ['SteamAPI_ISteamUser_GetSteamID'] }
      ])
    ).toEqual({ count: 2, appids: ['2', '4'] })
    expect(countX86ModernOrFlat([])).toEqual({ count: 0, appids: [] })
  })

  it('keeps no parallel scan copy: imports bridgeScan, defines no walkUnreal*/findRuntimeSteamApiDll/arch reader', () => {
    const src = readFileSync(join(__dirname, '..', 'bridgeCensus.ts'), 'utf-8')
    expect(src).toMatch(/storeManagers\/steam\/bridge\/bridgeScan/)
    expect(src).not.toMatch(/function\s+walkUnreal/)
    expect(src).not.toMatch(/function\s+findRuntimeSteamApiDll/)
    expect(src).not.toMatch(/function\s+readPe(Machine|Effective)?Arch/)
    expect(src).not.toMatch(/^import .*'backend\//m)
  })
})

describe('53-11: honest per-launch evidence', () => {
  const hello = (id: string) =>
    `bridge helper [${id}]: [2026-10-24T18:29:26Z] HELLO  shim attached appid=${id}\n`
  const call = (id: string, m = 'SteamUser023.GetSteamID') =>
    `bridge helper [${id}]: [2026-10-24T18:29:27Z] CALL   ${m}\n`
  const id = '3410180'

  it('UE: backup logs are dropped and <Project>.log wins', () => {
    const sel = selectLatestUnrealLogs(
      [
        { name: 'AbioticFactor-backup-2026.10.23-21.35.54.log', mtimeMs: 9 },
        { name: 'AbioticFactor.log', mtimeMs: 1 },
        { name: 'Other.log', mtimeMs: 5 }
      ],
      'AbioticFactor'
    )
    expect(sel).toEqual(['AbioticFactor.log'])
  })

  it('UE: without <Project>.log only the newest non-backup .log is kept', () => {
    const sel = selectLatestUnrealLogs(
      [
        { name: 'a.log', mtimeMs: 1 },
        { name: 'b.log', mtimeMs: 7 },
        { name: 'x-backup-1.log', mtimeMs: 99 },
        { name: 'notes.txt', mtimeMs: 100 }
      ],
      'Proj'
    )
    expect(sel).toEqual(['b.log'])
  })

  it('UE: a stale backup failure no longer fails a clean current log', () => {
    const sel = selectLatestUnrealLogs(
      [
        { name: 'AbioticFactor-backup-1.log', mtimeMs: 9 },
        { name: 'AbioticFactor.log', mtimeMs: 1 }
      ],
      'AbioticFactor'
    )
    expect(sel).not.toContain('AbioticFactor-backup-1.log')
  })

  it('Unity: Player.log is read, Player-prev.log is not', () => {
    const bottle = mkdtempSync(join(tmpdir(), 'census-5311-'))
    try {
      const dir = join(
        bottle,
        'drive_c/users/crossover/AppData/LocalLow/Co/Prod'
      )
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'Player.log'), 'clean')
      writeFileSync(join(dir, 'Player-prev.log'), 'SteamAPI_Init() failed.')
      const found = findUnityPlayerLogs(bottle)
      expect(found).toHaveLength(1)
      expect(found[0].endsWith('Player.log')).toBe(true)
    } finally {
      rmSync(bottle, { recursive: true, force: true })
    }
  })

  it('segment: the newest file with a HELLO wins, an older session never pairs', () => {
    const older = {
      name: 'gamelib.log.1',
      mtimeMs: 1,
      text:
        hello(id) +
        call(id) +
        call(id, 'SteamFriends017.GetPersonaName') +
        call(id, 'SteamUtils010.GetAppID')
    }
    const newer = { name: 'gamelib.log', mtimeMs: 2, text: hello(id) }
    const seg = appLogSegmentFor(id, [older, newer])
    expect(seg).toBe(newer.text)
    expect(
      classifyBridgeEvidence({
        appid: id,
        engine: 'godot',
        appLogTexts: seg === null ? [] : [seg],
        gameLogTexts: []
      })
    ).toEqual({ status: 'unverified', detail: 'no game-originated call' })
  })

  it('segment: starts at the LAST HELLO within one file', () => {
    const text = hello(id) + call(id) + call(id, 'A.b') + hello(id)
    const seg = appLogSegmentFor(id, [
      { name: 'gamelib.log', mtimeMs: 1, text }
    ])
    expect(seg).toBe(hello(id).trimEnd() + '\n'.slice(0, 0) + '\n')
    expect(seg).not.toContain('CALL')
  })

  it('segment: null when no file holds a HELLO for the appid', () => {
    expect(
      appLogSegmentFor(id, [{ name: 'g', mtimeMs: 1, text: hello('999') }])
    ).toBeNull()
  })

  it('attributeHelperLines: continuation lines go to the nearest prefix', () => {
    const text =
      `(10:15:27) [WARNING]: [Steam]:           bridge helper [${id}]: [ts] HELLO  shim attached appid=${id}\n` +
      '[ts] CALL   SteamUser023.GetSteamID\n' +
      '[ts] CALL   SteamFriends017.GetPersonaName\n'
    const lines = attributeHelperLines(id, text)
    expect(lines.filter((l) => /CALL/.test(l))).toHaveLength(2)
  })

  it('attributeHelperLines: bare lines after another appid prefix are not attributed', () => {
    const text =
      `(10:15:27) [WARNING]: [Steam]:           bridge helper [${id}]: [ts] HELLO  shim attached appid=${id}\n` +
      '(10:15:28) [WARNING]: [Steam]:           bridge helper [999]: [ts] HELLO  shim attached appid=999\n' +
      '[ts] CALL   SteamUser023.GetSteamID\n'
    const lines = attributeHelperLines(id, text)
    expect(lines.filter((l) => /CALL/.test(l))).toHaveLength(0)
  })

  it('IN-02: the census accumulators reset between runs', () => {
    resetCensusAccumulators()
    expect(censusAccumulators()).toEqual({ judged: 0, scanWarnings: 0 })
  })

  it('IN-04: *_data selects unity only with a matching exe or UnityPlayer.dll', () => {
    expect(detectEngine(['save_data', 'game.exe'])).not.toBe('unity')
    expect(detectEngine(['Game_Data', 'Game.exe'])).toBe('unity')
    expect(detectEngine(['UnityPlayer.dll'])).toBe('unity')
  })
})

describe('53-11: tightened verified rule', () => {
  const id = '3410180'
  const hello = `bridge helper [${id}]: [t] HELLO  shim attached appid=${id}\n`
  const call = (m: string, who = id) =>
    `bridge helper [${who}]: [t] CALL   ${m}\n`
  const nover = (v: string, who = id) =>
    `bridge helper [${who}]: [t] NOVER  flat lookup ver=${v} served=no\n`
  const run = (
    engine: 'unity' | 'unreal' | 'godot' | 'unknown',
    app: string,
    game: string[] = []
  ) =>
    classifyBridgeEvidence({
      appid: id,
      engine,
      appLogTexts: [hello + app],
      gameLogTexts: game
    })

  it('one CALL is unverified and says what is needed', () => {
    for (const engine of ['godot', 'unknown', 'unreal'] as const) {
      expect(
        run(engine, call('STEAMAPPS_INTERFACE_VERSION008.BIsSubscribedApp'), [
          'clean'
        ])
      ).toEqual({
        status: 'unverified',
        detail: '1 game call; needs 2 incl. identity'
      })
    }
  })

  it('BLoggedOn + GetAppID verifies', () => {
    expect(
      run(
        'godot',
        call('SteamUser023.BLoggedOn') + call('SteamUtils010.GetAppID')
      ).status
    ).toBe('verified')
  })

  it('two calls without an identity call stay unverified', () => {
    expect(
      run(
        'godot',
        call('SteamUtils010.GetAppID') +
          call('STEAMAPPS_INTERFACE_VERSION008.BIsSubscribed')
      ).status
    ).toBe('unverified')
  })

  it('the same CALL twice counts once', () => {
    expect(
      run(
        'godot',
        call('SteamUser023.GetSteamID') + call('SteamUser023.GetSteamID')
      )
    ).toEqual({
      status: 'unverified',
      detail: '1 game call; needs 2 incl. identity'
    })
  })

  it('unity: NOVER makes the row init-failed', () => {
    expect(
      run('unity', nover('STEAMSCREENSHOTS_INTERFACE_VERSION003'), ['clean'])
    ).toEqual({
      status: 'init-failed',
      detail: 'unserved STEAMSCREENSHOTS_INTERFACE_VERSION003'
    })
  })

  it('unreal: NOVER with Client API initialized 1 stays verified, noted', () => {
    expect(
      run('unreal', nover('V1'), [
        `LogOnline: STEAM: [AppId: ${id}] Client API initialized 1\n`
      ])
    ).toEqual({ status: 'verified', detail: 'unserved V1 (non-fatal)' })
  })

  it('godot: NOVER with qualifying calls reads unverified', () => {
    expect(
      run(
        'godot',
        nover('V2') +
          call('SteamUser023.GetSteamID') +
          call('SteamUtils010.GetAppID')
      )
    ).toEqual({ status: 'unverified', detail: 'unserved V2' })
  })

  it('unreal: a failure marker wins over NOVER', () => {
    expect(
      run('unreal', nover('V3'), [
        'LogSteamShared: Warning: SteamAPI failed to initialize\n'
      ])
    ).toEqual({ status: 'init-failed', detail: 'UE SteamAPI init failed' })
  })

  it('a NOVER attributed to another appid has no effect', () => {
    expect(run('unity', nover('V4', '999'), ['clean'])).toEqual({
      status: 'verified',
      detail: ''
    })
  })

  it('a known-bad row is never verified', () => {
    const row = classifyCensusTitle({
      appid: '411300',
      name: 'ELEX',
      installdir: 'ELEX',
      knownBadReason: 'does-not-run',
      evidence: { status: 'verified', detail: 'game call X.y' },
      exe: null
    })
    expect(row.class).toBe('known-bad')
    expect(row.evidence).toBe('unverified')
    expect(row.evidenceDetail).toBe('known-bad: does-not-run')
  })
})

describe('53-18: anchored census evidence (WR-01) and rotation (WR-06)', () => {
  const id = '1234'
  const P = `bridge helper [${id}]: `
  const hello = `${P}[t] HELLO  shim attached appid=${id}\n`
  const call = (m: string) => `${P}[t] CALL   ${m}\n`
  const fwd = (v: string) => `${P}[t] FWD    unknown ver=${v}\n`
  const run = (engine: 'unity' | 'godot', text: string) =>
    classifyBridgeEvidence({
      appid: id,
      engine,
      appLogTexts: [text],
      gameLogTexts: engine === 'unity' ? ['clean'] : []
    })

  it('53-18 forged CALL in a FWD version string yields no game calls', () => {
    const text =
      hello +
      fwd('x] CALL   SteamUser021.GetSteamID') +
      fwd('y] CALL   SteamUtils010.GetAppID')
    expect(run('godot', text)).toEqual({
      status: 'unverified',
      detail: 'no game-originated call'
    })
  })

  it('53-18 forged NOVER does not make a Unity row init-failed; genuine does', () => {
    const forged = hello + fwd('z] NOVER  flat lookup ver=SteamUser099')
    expect(run('unity', forged).status).toBe('verified')
    const genuine =
      hello + `${P}[t] NOVER  flat lookup ver=SteamUser099 served=no\n`
    expect(run('unity', genuine).status).toBe('init-failed')
  })

  it('53-18 forged HELLO in a FWD line does not start a segment', () => {
    const forged = fwd(`q] HELLO  shim attached appid=${id}`)
    expect(
      appLogSegmentFor(id, [{ name: 'g', mtimeMs: 1, text: forged }])
    ).toBeNull()
    expect(run('godot', forged)).toEqual({
      status: 'unverified',
      detail: 'no HELLO'
    })
  })

  it('53-18 rotation: HELLO in the older file, CALLs in the newer one', () => {
    const older = { name: 'gamelib.log.1', mtimeMs: 1, text: hello }
    const newer = {
      name: 'gamelib.log',
      mtimeMs: 2,
      text: call('SteamUser021.GetSteamID') + call('SteamUtils010.GetAppID')
    }
    const seg = appLogSegmentFor(id, [newer, older])
    expect(seg).toContain('GetSteamID')
    expect(seg).toContain('GetAppID')
    expect(run('godot', seg ?? '').status).toBe('verified')
  })

  it('53-18 regression: genuine lines still verify', () => {
    const text =
      hello + call('SteamUser021.GetSteamID') + call('SteamUtils010.GetAppID')
    expect(run('godot', text).status).toBe('verified')
  })
})
