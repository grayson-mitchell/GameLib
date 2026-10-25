import { readFileSync } from 'fs'
import { join } from 'path'

import {
  BOTTLE_WINDOWS_VERSION,
  buildHasRunKeyAddParts,
  buildHasRunKeyQueryParts,
  buildRedistProcessCommandParts,
  classifySharedRedist,
  declaredSharedRedistDepotIds,
  entryAppliesToBottle,
  isRedistSuccessExit,
  normaliseSharedRedistOptIn,
  parseInstallScript,
  parseKv1,
  parseRegQueryDword,
  sharedRedistLedgerKey,
  toBottleWindowsPath,
  type InstallScriptEntry
} from '../sharedRedists'

const fx = (name: string) =>
  readFileSync(join(__dirname, 'fixtures/sharedRedists', name), 'utf8')

const FIXTURES = {
  vc2010: fx('228983-vcredist-2010.vdf'),
  vc2015: fx('228986-vcredist-2015.vdf'),
  vc2022: fx('228989-vcredist-2022.vdf'),
  dx: fx('228990-directx-jun2010.vdf'),
  net452: fx('229004-dotnet-4.5.2.vdf'),
  net48: fx('229007-dotnet-4.8.vdf'),
  physx: fx('229033-physx-9.14.0702.vdf')
}

const PATHS = {
  vc2010: '_CommonRedist\\vcredist\\2010\\installscript.vdf',
  vc2015: '_CommonRedist\\vcredist\\2015\\installscript.vdf',
  vc2022: '_CommonRedist\\vcredist\\2022\\installscript.vdf',
  dx: '_CommonRedist\\DirectX\\Jun2010\\installscript.vdf',
  net452: '_CommonRedist\\DotNet\\4.5.2\\installscript.vdf',
  net48: '_CommonRedist\\DotNet\\4.8\\installscript.vdf',
  physx: '_CommonRedist\\PhysX\\9.14.0702\\installscript.vdf'
}

const parse = (k: keyof typeof FIXTURES) =>
  parseInstallScript(FIXTURES[k]) as InstallScriptEntry[]

const DIR = 'Z:\\cache\\steamapps\\common\\Steamworks Shared'

describe('parseKv1', () => {
  it('keeps duplicate sibling keys in file order', () => {
    const root = parseKv1(FIXTURES.net48)
    const script = root.find((n) => n.key.toLowerCase() === 'installscript')!
    const run = (script.value as { key: string; value: unknown }[]).find(
      (n) => n.key === 'Run Process'
    )!
    const entries = run.value as { key: string }[]
    expect(entries.map((e) => e.key)).toEqual(['4.8', '4.8'])
  })

  it('decodes \\\\ and \\" inside quoted strings', () => {
    const root = parseKv1(FIXTURES.physx)
    const script = root[0].value as { key: string; value: unknown }[]
    const run = script[0].value as { key: string; value: unknown }[]
    const entry = run[0].value as { key: string; value: string }[]
    const command = entry.find((n) => n.key === 'command 1')!.value
    expect(command).toBe(
      '/i "%INSTALLDIR%\\_CommonRedist\\PhysX\\9.14.0702\\PhysX-9.14.0702-SystemSoftware.msi" /quiet /norestart'
    )
  })

  it('supports bare tokens and // comments', () => {
    expect(parseKv1('// hi\nkey value\n"a" { b "c" } // tail')).toEqual([
      { key: 'key', value: 'value' },
      { key: 'a', value: [{ key: 'b', value: 'c' }] }
    ])
  })

  it('throws on unbalanced braces and unterminated strings', () => {
    expect(() => parseKv1('"a" {')).toThrow()
    expect(() => parseKv1('"a" }')).toThrow()
    expect(() => parseKv1('"a" "b')).toThrow()
  })
})

describe('parseInstallScript', () => {
  it('parses the 2010 script (lowercase keys) with x86 and x64 entries', () => {
    const entries = parse('vc2010')
    expect(entries.map((e) => e.name)).toEqual(['x86', 'x64'])
    expect(entries[0].hasRunKey).toBe(
      'HKEY_LOCAL_MACHINE\\Software\\Valve\\Steam\\Apps\\CommonRedist\\vcredist\\2010'
    )
    expect(entries[0].processes).toEqual([
      {
        process:
          '%INSTALLDIR%\\_CommonRedist\\vcredist\\2010\\vcredist_x86.exe',
        command: '/quiet /norestart'
      }
    ])
    expect(entries[0].minimumHasRunValue).toBe(1)
    expect(entries[0].requirementOs).toBeNull()
    expect(entries[1].requirementOs).toEqual({
      is64BitWindows: '1',
      osType: undefined
    })
  })

  it('parses the 2015 script (InstallScript / HasRunKey casing) without command', () => {
    const entries = parse('vc2015')
    expect(entries).toHaveLength(2)
    expect(entries[1].requirementOs?.is64BitWindows).toBe('1')
    expect(entries[0].processes[0].command).toBeUndefined()
  })

  it('returns both duplicate .NET 4.8 entries with their own requirement_os', () => {
    const entries = parse('net48')
    expect(entries.map((e) => e.name)).toEqual(['4.8', '4.8'])
    expect(entries[0].requirementOs?.osType).toBe('Windows XP')
    expect(entries[1].requirementOs).toBeNull()
    expect(entries[1].processes[0].process).toContain('Framework 4.8.cmd')
  })

  it('ignores kvsignatures and returns null for malformed or empty scripts', () => {
    expect(parseInstallScript('"installscript" {')).toBeNull()
    expect(parseInstallScript('')).toBeNull()
    expect(parseInstallScript('"installscript" { "other" { } }')).toBeNull()
    expect(parseInstallScript('"kvsignatures" { "x" "y" }')).toBeNull()
  })

  it('reads MinimumHasRunValue case-insensitively', () => {
    const entries = parseInstallScript(
      '"installscript" { "Run Process" { "a" { "MinimumHasRunValue" "3" "process 1" "x" } } }'
    ) as InstallScriptEntry[]
    expect(entries[0].minimumHasRunValue).toBe(3)
  })
})

describe('classifySharedRedist', () => {
  it.each([
    ['vc2010', 'vcredist', 'vcredist 2010'],
    ['vc2015', 'vcredist', 'vcredist 2015'],
    ['vc2022', 'vcredist', 'vcredist 2022'],
    ['dx', 'directx', 'DirectX Jun2010']
  ] as const)('%s is auto (%s)', (key, kind, label) => {
    expect(classifySharedRedist(PATHS[key], parse(key))).toEqual({
      kind,
      label
    })
  })

  it.each([
    ['net452', 'DotNet 4.5.2'],
    ['net48', 'DotNet 4.8'],
    ['physx', 'PhysX 9.14.0702']
  ] as const)('%s is other with a label from the path', (key, label) => {
    expect(classifySharedRedist(PATHS[key], parse(key))).toEqual({
      kind: 'other',
      label
    })
  })

  it('is other for a missing script, unparsable path or empty entries', () => {
    expect(classifySharedRedist(PATHS.vc2010, null).kind).toBe('other')
    expect(classifySharedRedist(PATHS.vc2010, []).kind).toBe('other')
    expect(
      classifySharedRedist('weird\\installscript.vdf', parse('vc2010'))
    ).toEqual({ kind: 'other', label: null })
  })

  it('accepts forward slashes and any path casing', () => {
    expect(
      classifySharedRedist(
        '_commonredist/VCREDIST/2010/INSTALLSCRIPT.VDF',
        parse('vc2010')
      ).kind
    ).toBe('vcredist')
  })

  it('rejects a HasRunKey outside CommonRedist', () => {
    const entries = parse('vc2010').map((e) => ({
      ...e,
      hasRunKey: 'HKEY_LOCAL_MACHINE\\Software\\Evil\\vcredist\\2010'
    }))
    expect(classifySharedRedist(PATHS.vc2010, entries).kind).toBe('other')
  })

  it('rejects a process with a .. segment, a wrong prefix or a wrong extension', () => {
    const base = parse('vc2010')
    const withProc = (process: string) =>
      base.map((e) => ({ ...e, processes: [{ process }] }))
    expect(
      classifySharedRedist(
        PATHS.vc2010,
        withProc('%INSTALLDIR%\\_CommonRedist\\vcredist\\..\\x.exe')
      ).kind
    ).toBe('other')
    expect(
      classifySharedRedist(PATHS.vc2010, withProc('%INSTALLDIR%\\game.exe'))
        .kind
    ).toBe('other')
    expect(
      classifySharedRedist(
        PATHS.vc2010,
        withProc('%INSTALLDIR%\\_CommonRedist\\vcredist\\2010\\x.bat')
      ).kind
    ).toBe('other')
  })

  it('rejects DirectX whose process is not DXSETUP.exe', () => {
    const entries = parse('dx').map((e) => ({
      ...e,
      processes: [
        { process: '%INSTALLDIR%\\_CommonRedist\\DirectX\\Jun2010\\other.exe' }
      ]
    }))
    expect(classifySharedRedist(PATHS.dx, entries).kind).toBe('other')
  })

  it('rejects duplicate entry names even on an otherwise valid vcredist path', () => {
    const e = parse('vc2010')
    expect(classifySharedRedist(PATHS.vc2010, [e[0], e[0]]).kind).toBe('other')
  })
})

describe('entryAppliesToBottle', () => {
  const entry = (
    requirementOs: InstallScriptEntry['requirementOs']
  ): InstallScriptEntry => ({
    name: 'x',
    minimumHasRunValue: 1,
    processes: [],
    requirementOs
  })

  it('applies with no requirement', () => {
    expect(entryAppliesToBottle(entry(null))).toBe(true)
  })
  it('honours Is64BitWindows', () => {
    expect(entryAppliesToBottle(entry({ is64BitWindows: '1' }))).toBe(true)
    expect(entryAppliesToBottle(entry({ is64BitWindows: '0' }))).toBe(false)
  })
  it('honours OSType', () => {
    expect(entryAppliesToBottle(entry({ osType: 'Windows XP' }))).toBe(false)
    expect(
      entryAppliesToBottle(
        entry({ osType: BOTTLE_WINDOWS_VERSION.toUpperCase() })
      )
    ).toBe(true)
  })
  it('skips the noop .NET entry and keeps the real one', () => {
    const [noop, real] = parse('net48')
    expect(entryAppliesToBottle(noop)).toBe(false)
    expect(entryAppliesToBottle(real)).toBe(true)
  })
})

describe('toBottleWindowsPath', () => {
  it('maps a host path onto the z: drive', () => {
    expect(
      toBottleWindowsPath(
        '/Users/x/Library/Application Support/gamelib/steam_store/sharedRedist/steamapps/common/Steamworks Shared'
      )
    ).toBe(
      'Z:\\Users\\x\\Library\\Application Support\\gamelib\\steam_store\\sharedRedist\\steamapps\\common\\Steamworks Shared'
    )
  })
  it('throws on a relative path', () => {
    expect(() => toBottleWindowsPath('relative/dir')).toThrow()
  })
})

describe('buildRedistProcessCommandParts', () => {
  it('builds the 2010 x86 exe argv', () => {
    const [x86] = parse('vc2010')
    expect(
      buildRedistProcessCommandParts(x86.processes[0], 'vcredist', DIR)
    ).toEqual([
      `${DIR}\\_CommonRedist\\vcredist\\2010\\vcredist_x86.exe`,
      '/quiet',
      '/norestart'
    ])
  })

  it('wraps a .cmd in cmd /c', () => {
    const x64 = parse('vc2022')[1]
    expect(
      buildRedistProcessCommandParts(x64.processes[0], 'vcredist', DIR)
    ).toEqual([
      'cmd',
      '/c',
      `${DIR}\\_CommonRedist\\vcredist\\2022\\Microsoft Visual C++ 2022 x64.cmd`
    ])
  })

  it('builds DXSETUP /silent', () => {
    expect(
      buildRedistProcessCommandParts(
        parse('dx')[0].processes[0],
        'directx',
        DIR
      )
    ).toEqual([
      `${DIR}\\_CommonRedist\\DirectX\\Jun2010\\DXSETUP.exe`,
      '/silent'
    ])
  })

  it('rejects non-switch args for auto kinds and control characters', () => {
    const p = parse('vc2010')[0].processes[0]
    expect(
      buildRedistProcessCommandParts(
        { ...p, command: '/quiet C:\\evil.exe' },
        'vcredist',
        DIR
      )
    ).toBeNull()
    expect(
      buildRedistProcessCommandParts(
        { ...p, command: '/quiet\n/x' },
        'vcredist',
        DIR
      )
    ).toBeNull()
    expect(
      buildRedistProcessCommandParts(
        { process: p.process + '\0', command: '/q' },
        'vcredist',
        DIR
      )
    ).toBeNull()
  })

  it('rejects a process that escapes _CommonRedist', () => {
    expect(
      buildRedistProcessCommandParts(
        { process: '%INSTALLDIR%\\_CommonRedist\\..\\evil.exe' },
        'vcredist',
        DIR
      )
    ).toBeNull()
    expect(
      buildRedistProcessCommandParts(
        { process: 'C:\\Windows\\system32\\cmd.exe', command: '/c' },
        'vcredist',
        DIR
      )
    ).toBeNull()
  })

  it('builds the PhysX msiexec argv for kind other with a quote-aware split', () => {
    expect(
      buildRedistProcessCommandParts(
        parse('physx')[0].processes[0],
        'other',
        DIR
      )
    ).toEqual([
      'msiexec',
      '/i',
      `${DIR}\\_CommonRedist\\PhysX\\9.14.0702\\PhysX-9.14.0702-SystemSoftware.msi`,
      '/quiet',
      '/norestart'
    ])
  })

  it('does not accept bare msiexec for an auto kind', () => {
    expect(
      buildRedistProcessCommandParts(
        parse('physx')[0].processes[0],
        'vcredist',
        DIR
      )
    ).toBeNull()
  })

  it('rejects a msiexec %INSTALLDIR% token that resolves outside _CommonRedist', () => {
    expect(
      buildRedistProcessCommandParts(
        {
          process: 'msiexec',
          command: '/i "%INSTALLDIR%\\other\\x.msi" /quiet'
        },
        'other',
        DIR
      )
    ).toBeNull()
    expect(
      buildRedistProcessCommandParts(
        {
          process: 'msiexec',
          command: '/i "%INSTALLDIR%\\_CommonRedist\\..\\x.msi"'
        },
        'other',
        DIR
      )
    ).toBeNull()
  })

  it('handles the opt-in .NET cmd', () => {
    const real = parse('net452')[1]
    expect(
      buildRedistProcessCommandParts(real.processes[0], 'other', DIR)
    ).toEqual([
      'cmd',
      '/c',
      `${DIR}\\_CommonRedist\\DotNet\\4.5.2\\Microsoft .NET Framework 4.5.2.cmd`
    ])
  })
})

describe('HasRunKey builders', () => {
  const key =
    'HKEY_LOCAL_MACHINE\\Software\\Valve\\Steam\\Apps\\CommonRedist\\vcredist\\2022'
  it('builds reg add with a lowercased name and /reg:32', () => {
    expect(buildHasRunKeyAddParts(key, 'x64 14.51.36247.0')).toEqual([
      'reg',
      'add',
      key,
      '/v',
      'x64 14.51.36247.0',
      '/t',
      'REG_DWORD',
      '/d',
      '1',
      '/reg:32',
      '/f'
    ])
    expect(buildHasRunKeyAddParts(key, 'DXSetup')[4]).toBe('dxsetup')
  })
  it('builds reg query', () => {
    expect(buildHasRunKeyQueryParts(key, 'X64')).toEqual([
      'reg',
      'query',
      key,
      '/v',
      'x64',
      '/reg:32'
    ])
  })
  it.each(['"', '\r', '\n', '\0'])('throws on forbidden char %j', (c) => {
    expect(() => buildHasRunKeyAddParts(key + c, 'a')).toThrow()
    expect(() => buildHasRunKeyAddParts(key, 'a' + c)).toThrow()
    expect(() => buildHasRunKeyQueryParts(key + c, 'a')).toThrow()
    expect(() => buildHasRunKeyQueryParts(key, 'a' + c)).toThrow()
  })
  it('parses reg query dwords', () => {
    expect(parseRegQueryDword('    x64    REG_DWORD    0x1\r\n')).toBe(1)
    expect(parseRegQueryDword('    x64    REG_DWORD    0x0')).toBe(0)
    expect(
      parseRegQueryDword('ERROR: The system was unable to find')
    ).toBeNull()
  })
})

describe('isRedistSuccessExit', () => {
  it('accepts 0 for every kind', () => {
    for (const k of ['vcredist', 'directx', 'other'] as const)
      expect(isRedistSuccessExit(k, 0)).toBe(true)
  })
  it('accepts 3010 and 1638 only for vcredist', () => {
    expect(isRedistSuccessExit('vcredist', 3010)).toBe(true)
    expect(isRedistSuccessExit('vcredist', 1638)).toBe(true)
    expect(isRedistSuccessExit('directx', 3010)).toBe(false)
    expect(isRedistSuccessExit('other', 1638)).toBe(false)
  })
  it('rejects other codes and undefined', () => {
    expect(isRedistSuccessExit('vcredist', 1)).toBe(false)
    expect(isRedistSuccessExit('vcredist', undefined)).toBe(false)
  })
})

describe('normaliseSharedRedistOptIn', () => {
  it('keeps numeric strings only, deduped', () => {
    expect(
      normaliseSharedRedistOptIn(['229007', 229004, 'abc', '229007', null])
    ).toEqual(['229007'])
  })
  it('returns [] for non-arrays', () => {
    expect(normaliseSharedRedistOptIn(undefined)).toEqual([])
    expect(normaliseSharedRedistOptIn('229007')).toEqual([])
  })
})

describe('declaredSharedRedistDepotIds', () => {
  it('keeps only depotfromapp 228980 numeric ids in appinfo order', () => {
    expect(
      declaredSharedRedistDepotIds({
        depots: {
          '284101': { config: {} },
          '228990': { depotfromapp: '228980', sharedinstall: '1' },
          '229004': { depotfromapp: 228980 },
          '1007x': { depotfromapp: '228980' },
          '230000': { depotfromapp: '1007' },
          branches: { depotfromapp: '228980' }
        }
      })
    ).toEqual(['228990', '229004'])
  })
  it('returns [] when depots are absent', () => {
    expect(declaredSharedRedistDepotIds({})).toEqual([])
    expect(declaredSharedRedistDepotIds(undefined)).toEqual([])
  })
})

describe('sharedRedistLedgerKey', () => {
  it('lowercases both parts', () => {
    expect(sharedRedistLedgerKey('HKEY\\A', 'X64 1.0')).toBe('hkey\\a|x64 1.0')
    expect(sharedRedistLedgerKey(undefined, 'N')).toBe('|n')
  })
})
