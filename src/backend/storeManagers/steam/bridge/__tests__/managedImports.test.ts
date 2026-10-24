import {
  effectiveLaunchArch,
  readManagedSteamApiImports,
  readPeClrHeader,
  readPeEffectiveArch
} from '../managedImports'
import { buildManagedPe, bufferReader } from './fixtures/managedPe'

describe('readPeClrHeader', () => {
  it('reads flags and metadata location from a managed PE', () => {
    const info = readPeClrHeader(
      bufferReader(buildManagedPe({ machine: 0x14c, clrFlags: 0x1 }))
    )
    expect(info).not.toBeNull()
    expect(info!.flags).toBe(0x1)
    expect(info!.metadataRva).toBeGreaterThan(0)
    expect(info!.metadataSize).toBeGreaterThan(0)
  })

  it('returns null for a native PE', () => {
    expect(readPeClrHeader(bufferReader(buildManagedPe({ clr: false })))).toBe(
      null
    )
  })
})

describe('D-53-10 effectiveLaunchArch', () => {
  it('reads AnyCPU as x64 only without 32BITREQUIRED or 32BITPREFERRED', () => {
    expect(effectiveLaunchArch('x86', 0x1)).toBe('x64')
    expect(effectiveLaunchArch('x86', 0x3)).toBe('x86')
    expect(effectiveLaunchArch('x86', 0x20001)).toBe('x86')
    expect(effectiveLaunchArch('x86', null)).toBe('x86')
    expect(effectiveLaunchArch('x64', 0x1)).toBe('x64')
    expect(effectiveLaunchArch(null, 0x1)).toBe(null)
  })

  it('keeps mixed-mode (no ILONLY) x86 and reads IL-only AnyCPU as x64', () => {
    expect(effectiveLaunchArch('x86', 0x0)).toBe('x86')
    expect(effectiveLaunchArch('x86', 0x1)).toBe('x64')
    expect(effectiveLaunchArch('x86', 0x1 | 0x2)).toBe('x86')
    expect(effectiveLaunchArch('x86', 0x1 | 0x20000)).toBe('x86')
    expect(effectiveLaunchArch('x64', 0x0)).toBe('x64')
    expect(effectiveLaunchArch('x86', null)).toBe('x86')
  })

  it('composes machine and CLR flags over real PE bytes', () => {
    const arch = (o: Parameters<typeof buildManagedPe>[0]) =>
      readPeEffectiveArch(bufferReader(buildManagedPe(o)))
    expect(arch({ machine: 0x14c, clrFlags: 0x1 })).toBe('x64')
    expect(arch({ machine: 0x14c, clrFlags: 0x0 })).toBe('x86')
    expect(arch({ machine: 0x14c, clrFlags: 0x3 })).toBe('x86')
    expect(arch({ machine: 0x14c, clrFlags: 0x20001 })).toBe('x86')
    expect(arch({ machine: 0x14c, clr: false })).toBe('x86')
    expect(arch({ machine: 0x8664, clr: false })).toBe('x64')
  })
})

describe('hostile input never throws and reads as not parsed', () => {
  const pe = buildManagedPe({})

  it('e_lfanew past EOF', () => {
    const b = Buffer.from(pe)
    b.writeUInt32LE(0x7fffffff, 0x3c)
    expect(readPeClrHeader(bufferReader(b))).toBeNull()
    expect(readPeEffectiveArch(bufferReader(b))).toBeNull()
  })

  it('data directory 14 pointing past EOF', () => {
    const b = Buffer.from(pe)
    b.writeUInt32LE(0x70000000, 0x80 + 24 + 96 + 14 * 8)
    expect(readPeClrHeader(bufferReader(b))).toBeNull()
  })

  it('NumberOfRvaAndSizes below 15', () => {
    const b = Buffer.from(pe)
    b.writeUInt32LE(10, 0x80 + 24 + 92)
    expect(readPeClrHeader(bufferReader(b))).toBeNull()
  })

  it('truncated file', () => {
    expect(readPeClrHeader(bufferReader(pe.subarray(0, 0x90)))).toBeNull()
  })
})

describe('readManagedSteamApiImports', () => {
  const read = (o: Parameters<typeof buildManagedPe>[0]) =>
    readManagedSteamApiImports(bufferReader(buildManagedPe(o)))

  it('decodes ImplMap entries per module, sorted and deduped', () => {
    const r = read({
      moduleRefs: ['steam_api64', 'CSteamworks', 'kernel32.dll'],
      implMaps: [
        { name: 'SteamAPI_Init', module: 1 },
        { name: 'SteamAPI_ISteamUser_GetSteamID', module: 1 },
        { name: 'SteamAPI_Init', module: 1 },
        { name: 'Foo', module: 2 }
      ]
    })
    expect(r.parsed).toBe(true)
    expect(r.isManaged).toBe(true)
    expect(r.steamApiImports.steam_api64).toEqual([
      'SteamAPI_ISteamUser_GetSteamID',
      'SteamAPI_Init'
    ])
    expect(r.steamApiImports.steam_api).toEqual([])
    expect(r.importsByModule.csteamworks).toEqual(['Foo'])
  })

  it('matches module names case-insensitively with optional .dll', () => {
    const r = read({
      moduleRefs: ['STEAM_API.dll', 'steam_api64'],
      implMaps: [
        { name: 'A', module: 1 },
        { name: 'B', module: 2 }
      ]
    })
    expect(r.steamApiImports.steam_api).toEqual(['A'])
    expect(r.steamApiImports.steam_api64).toEqual(['B'])
  })

  it('keeps CSteamworks out of steamApiImports', () => {
    const r = read({
      moduleRefs: ['CSteamworks', 'CSteamworks64'],
      implMaps: [
        { name: 'X', module: 1 },
        { name: 'Y', module: 2 }
      ]
    })
    expect(r.steamApiImports).toEqual({ steam_api: [], steam_api64: [] })
    expect(r.importsByModule.csteamworks64).toEqual(['Y'])
  })

  it('decodes wide #Strings indexes', () => {
    const r = read({
      wideStrings: true,
      moduleRefs: ['steam_api64'],
      implMaps: [{ name: 'SteamAPI_Init', module: 1 }]
    })
    expect(r.steamApiImports.steam_api64).toEqual(['SteamAPI_Init'])
  })

  it('decodes with a MethodDef count of 65536 or more', () => {
    const r = read({
      methodDefRows: 70000,
      moduleRefs: ['steam_api64'],
      implMaps: [{ name: 'SteamAPI_Init', module: 1 }]
    })
    expect(r.parsed).toBe(true)
    expect(r.steamApiImports.steam_api64).toEqual(['SteamAPI_Init'])
  })

  it('reads a non-managed PE as parsed, not managed', () => {
    expect(read({ clr: false })).toEqual({
      parsed: true,
      isManaged: false,
      importsByModule: {},
      steamApiImports: { steam_api: [], steam_api64: [] }
    })
  })

  describe('hostile input never throws and reads as not parsed', () => {
    const base = {
      moduleRefs: ['steam_api64'],
      implMaps: [{ name: 'SteamAPI_Init', module: 1 }]
    }
    const unparsed = (buf: Buffer) => {
      const r = readManagedSteamApiImports(bufferReader(buf))
      expect(r.parsed).toBe(false)
      expect(r.steamApiImports).toEqual({ steam_api: [], steam_api64: [] })
    }

    it('truncated #~ stream', () => {
      const full = buildManagedPe(base)
      unparsed(full.subarray(0, full.length - 40))
    })
    it('stream header offset past the metadata blob', () => {
      unparsed(buildManagedPe({ ...base, streamOffsetOverride: 0x7ffffff0 }))
    })
    it('row count that runs the tables past EOF', () => {
      unparsed(buildManagedPe({ ...base, rowCountOverride: 1 << 21 }))
    })
    it('row count above the cap', () => {
      unparsed(buildManagedPe({ ...base, rowCountOverride: (1 << 22) + 1 }))
    })
    it('#Strings index past the heap', () => {
      unparsed(buildManagedPe({ ...base, importNameIndexOverride: 0xfff0 }))
    })
    it('oversized #Strings heap', () => {
      unparsed(buildManagedPe({ ...base, stringsSizeOverride: 0x7fffff00 }))
    })
    it('more than MAX_STREAMS stream headers', () => {
      unparsed(buildManagedPe({ ...base, extraStreams: 20 }))
    })
    it('garbage bytes', () => {
      unparsed(Buffer.alloc(64, 0xff))
    })
  })
})
