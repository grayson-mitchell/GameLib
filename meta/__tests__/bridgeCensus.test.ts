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
  classifyCensusTitle,
  formatCensusMarkdown,
  readPersistedScanArch,
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

  it('verified is true only for a routed row with playVerified', () => {
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

    expect(mk(true).verified).toBe(true)
    expect(mk(false).verified).toBe(false)
    expect(mk(true, 'does-not-run').verified).toBe(false)
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
        'installdir',
        'name',
        'verified'
      ].sort()
    )
  })
})

describe('formatCensusMarkdown', () => {
  it('prints the Verified column and the routed/verified summary line', () => {
    const mk = (
      appid: string,
      cls: CensusRow['class'],
      verified: boolean
    ): CensusRow => ({
      appid,
      name: appid,
      installdir: appid,
      arch: 'x86',
      class: cls,
      detail: '',
      verified
    })
    const out = formatCensusMarkdown([
      mk('1', 'bridge', true),
      mk('2', 'bridge', false),
      mk('3', 'known-bad', false)
    ])

    expect(out).toContain('| Verified |')
    expect(out).toContain('| bridge | yes |')
    expect(out).toContain(
      '3 of 3 routed to the bridge; 1 of 3 verified running through the bridge; 2 of 3 fully covered by the shim (bridge=2, known-bad=1)'
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
      verified: false
    },
    {
      appid: '2',
      name: 'Bridge B',
      installdir: 'Bridge B',
      arch: 'x64',
      class: 'bridge',
      detail: '',
      verified: false
    },
    {
      appid: '3',
      name: 'Missing',
      installdir: 'Missing',
      arch: 'x86',
      class: 'missing-symbols',
      detail: 'SteamAPI_SteamScreenshots_v003',
      verified: false
    },
    {
      appid: '4',
      name: 'No Binary',
      installdir: 'No Binary',
      arch: 'none',
      class: 'no-binary',
      detail: 'no scannable PE executable found under installdir',
      verified: false
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
      verified: false
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
    expect(out).toContain('fully covered by the shim')
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
        verified: false
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
