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

  it('an exe found with no steam_api import at all classifies "bridge" flagged no-steam-api', () => {
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

    expect(row.class).toBe('bridge')
    expect(row.detail).toBe('no-steam-api, flagged')
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
      ['appid', 'arch', 'class', 'detail', 'installdir', 'name'].sort()
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
      detail: ''
    },
    {
      appid: '2',
      name: 'Bridge B',
      installdir: 'Bridge B',
      arch: 'x64',
      class: 'bridge',
      detail: ''
    },
    {
      appid: '3',
      name: 'Missing',
      installdir: 'Missing',
      arch: 'x86',
      class: 'missing-symbols',
      detail: 'SteamAPI_SteamScreenshots_v003'
    },
    {
      appid: '4',
      name: 'No Binary',
      installdir: 'No Binary',
      arch: 'none',
      class: 'no-binary',
      detail: 'no scannable PE executable found under installdir'
    }
  ]

  it('counts routed as the number of class "bridge" rows, and total as every row including no-binary', () => {
    const summary = summarizeCensus(rows)

    expect(summary.routed).toBe(2)
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
        detail: 'no scannable PE executable found under installdir'
      }
    ]

    expect(summarizeCensus(onlyNoBinary).routed).toBe(0)
  })
})
