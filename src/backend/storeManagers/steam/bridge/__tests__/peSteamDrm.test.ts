/**
 * Quick 261024-br4: the pure PE CEG / `.bind` scanner. Every fixture is
 * built in memory by the small builder in fixtures/drmPe.ts (a few KB each).
 */
import {
  CEG_RESOURCE_NAMES,
  detectSteamDrmInPeBytes,
  readPeImportedDllNames,
  readPeMachineArch,
  readPeSteamApiDelayImports
} from '../peSteamDrm'
import { buildPe, PE_OFFSET } from './fixtures/drmPe'
import { buildDelayImportPe } from './fixtures/delayImportPe'
import { buildImportPe } from './fixtures/importPe'

describe('detectSteamDrmInPe (quick 261024-br4)', () => {
  test('PE32 with all three CEG RCDATA names reports them in file order', () => {
    const pe = buildPe({
      resources: {
        rcdataNames: ['STEAM_SPLIT_GUID', 'STEAM_GUIDD', 'STEAM_MINSTANCE']
      }
    })
    expect(detectSteamDrmInPeBytes(pe)).toEqual({
      parsed: true,
      cegMarkers: ['STEAM_SPLIT_GUID', 'STEAM_GUIDD', 'STEAM_MINSTANCE'],
      hasBindSection: false
    })
  })

  test('PE32+ (0x20b) uses the 0x20b data-directory offset', () => {
    const pe = buildPe({
      magic: 0x20b,
      resources: { rcdataNames: ['STEAM_GUIDD'] }
    })
    expect(detectSteamDrmInPeBytes(pe)).toEqual({
      parsed: true,
      cegMarkers: ['STEAM_GUIDD'],
      hasBindSection: false
    })
  })

  test('duplicate names are reported once', () => {
    const pe = buildPe({
      resources: { rcdataNames: ['STEAM_GUIDD', 'STEAM_GUIDD'] }
    })
    expect(detectSteamDrmInPeBytes(pe).cegMarkers).toEqual(['STEAM_GUIDD'])
  })

  test('negative: an RCDATA ID entry, an unrelated name and an RT_ICON dir', () => {
    const pe = buildPe({
      resources: {
        rcdataNames: ['SOME_OTHER_BLOB'],
        rcdataIds: [101],
        iconDir: true
      }
    })
    expect(detectSteamDrmInPeBytes(pe)).toEqual({
      parsed: true,
      cegMarkers: [],
      hasBindSection: false
    })
  })

  test('Overlooting 3410180: a pck section with a huge raw size and VirtualSize 8 does not shadow .rsrc', () => {
    const pe = buildPe({
      pckOverlay: true,
      resources: { rcdataNames: ['STEAM_GUIDD'] }
    })
    expect(detectSteamDrmInPeBytes(pe)).toEqual({
      parsed: true,
      cegMarkers: ['STEAM_GUIDD'],
      hasBindSection: false
    })
  })

  test('a .bind section with no resources is flagged', () => {
    const pe = buildPe({ resources: null, extraSections: ['.bind'] })
    expect(detectSteamDrmInPeBytes(pe)).toEqual({
      parsed: true,
      cegMarkers: [],
      hasBindSection: true
    })
  })

  test('a resource data directory of size 0 is parsed with no markers', () => {
    const pe = buildPe({
      resources: { rcdataNames: ['STEAM_GUIDD'] },
      resourceSizeZero: true
    })
    expect(detectSteamDrmInPeBytes(pe)).toEqual({
      parsed: true,
      cegMarkers: [],
      hasBindSection: false
    })
  })

  describe('hostile input never throws and reads as not parsed', () => {
    const notParsed = { parsed: false, cegMarkers: [], hasBindSection: false }
    const good = () => buildPe({ resources: { rcdataNames: ['STEAM_GUIDD'] } })

    test('garbage', () => {
      const bytes = new Uint8Array(512).map((_, i) => (i * 37 + 11) & 0xff)
      expect(detectSteamDrmInPeBytes(bytes)).toEqual(notParsed)
    })

    test('empty buffer', () => {
      expect(detectSteamDrmInPeBytes(new Uint8Array(0))).toEqual(notParsed)
    })

    test('non-MZ file', () => {
      const bytes = good()
      bytes[0] = 0x7f
      expect(detectSteamDrmInPeBytes(bytes)).toEqual(notParsed)
    })

    test('truncated mid-section-table', () => {
      const bytes = good().subarray(0, PE_OFFSET + 24 + 224 + 20)
      expect(detectSteamDrmInPeBytes(bytes)).toEqual(notParsed)
    })

    test('e_lfanew past EOF', () => {
      const bytes = good()
      new DataView(bytes.buffer).setUint32(0x3c, 0x7fffff00, true)
      expect(detectSteamDrmInPeBytes(bytes)).toEqual(notParsed)
    })

    test('a resource RVA outside every section', () => {
      const bytes = buildPe({
        resources: { rcdataNames: ['STEAM_GUIDD'] },
        resourceRvaOutside: true
      })
      expect(detectSteamDrmInPeBytes(bytes)).toEqual(notParsed)
    })

    test('a self-referencing subdirectory offset', () => {
      const bytes = buildPe({
        resources: { rcdataNames: ['STEAM_GUIDD'], selfReference: true }
      })
      expect(detectSteamDrmInPeBytes(bytes)).toEqual(notParsed)
    })
  })

  test('CEG_RESOURCE_NAMES is the three CEG names', () => {
    expect([...CEG_RESOURCE_NAMES]).toEqual([
      'STEAM_SPLIT_GUID',
      'STEAM_GUIDD',
      'STEAM_MINSTANCE'
    ])
  })
})

describe('readPeMachineArch (quick 261024-i94)', () => {
  const read = (bytes: Uint8Array) => (offset: number, length: number) =>
    offset + length > bytes.length
      ? null
      : bytes.subarray(offset, offset + length)

  test('maps the COFF Machine field to the arch', () => {
    expect(readPeMachineArch(read(buildPe({ magic: 0x20b })))).toBe('x64')
    expect(readPeMachineArch(read(buildPe({ magic: 0x10b })))).toBe('x86')
  })

  test('returns null for non-MZ, bad PE signature, unknown machine, truncation', () => {
    const notMz = buildPe()
    notMz[0] = 0x00
    expect(readPeMachineArch(read(notMz))).toBeNull()

    const badSig = buildPe()
    badSig[PE_OFFSET] = 0x00
    expect(readPeMachineArch(read(badSig))).toBeNull()

    const unknown = buildPe()
    new DataView(unknown.buffer).setUint16(PE_OFFSET + 4, 0x01c4, true)
    expect(readPeMachineArch(read(unknown))).toBeNull()

    expect(readPeMachineArch(read(buildPe().subarray(0, 0x40)))).toBeNull()
    expect(readPeMachineArch(read(new Uint8Array(0)))).toBeNull()
  })

  test('never throws when the reader throws', () => {
    expect(
      readPeMachineArch(() => {
        throw new Error('boom')
      })
    ).toBeNull()
  })
})

describe('readPeSteamApiDelayImports (quick 261024-j4l)', () => {
  const readOf = (b: Uint8Array) => (offset: number, length: number) =>
    offset + length > b.length ? null : b.subarray(offset, offset + length)

  it('reads a PE32+ delay import of steam_api64.dll, skipping other dlls', () => {
    const pe = buildDelayImportPe({
      plus: true,
      dlls: [
        { name: 'KERNEL32.dll', imports: ['Sleep'] },
        {
          name: 'steam_api64.dll',
          imports: ['SteamAPI_Init', 'SteamInternal_GameServer_Init']
        }
      ]
    })
    expect(readPeSteamApiDelayImports(readOf(pe))).toEqual({
      parsed: true,
      dll: 'steam_api64.dll',
      arch: 'x64',
      symbols: ['SteamAPI_Init', 'SteamInternal_GameServer_Init'],
      conflict: false
    })
  })

  it('reads PE32 steam_api.dll as x86 and an ordinal as #N', () => {
    const pe = buildDelayImportPe({
      plus: false,
      dlls: [{ name: 'STEAM_API.DLL', imports: ['SteamAPI_Init', 7] }]
    })
    expect(readPeSteamApiDelayImports(readOf(pe))).toEqual({
      parsed: true,
      dll: 'steam_api.dll',
      arch: 'x86',
      symbols: ['SteamAPI_Init', '#7'],
      conflict: false
    })
  })

  it('reads a PE32+ ordinal', () => {
    const pe = buildDelayImportPe({
      plus: true,
      dlls: [{ name: 'steam_api64.dll', imports: [12, 'SteamAPI_Init'] }]
    })
    expect(readPeSteamApiDelayImports(readOf(pe)).symbols).toEqual([
      '#12',
      'SteamAPI_Init'
    ])
  })

  it.each([false, true])(
    'parses the VA form the same as the RVA form (plus=%s)',
    (plus) => {
      const dlls = [
        {
          name: plus ? 'steam_api64.dll' : 'steam_api.dll',
          imports: ['A', 'B']
        }
      ]
      const rva = readPeSteamApiDelayImports(
        readOf(buildDelayImportPe({ plus, dlls }))
      )
      const va = readPeSteamApiDelayImports(
        readOf(buildDelayImportPe({ plus, dlls, vaForm: true }))
      )
      expect(va).toEqual(rva)
      expect(va.symbols).toEqual(['A', 'B'])
    }
  )

  it('reports no delay imports when data directory 13 is empty', () => {
    const pe = buildDelayImportPe({ plus: true, dlls: [] })
    pe.writeUInt32LE(0, 0x80 + 24 + 112 + 13 * 8)
    expect(readPeSteamApiDelayImports(readOf(pe))).toEqual({
      parsed: true,
      dll: null,
      arch: 'none',
      symbols: [],
      conflict: false
    })
  })

  it('reports no delay imports when NumberOfRvaAndSizes < 14', () => {
    const pe = buildDelayImportPe({
      plus: false,
      dlls: [{ name: 'steam_api.dll', imports: ['A'] }]
    })
    pe.writeUInt32LE(5, 0x80 + 24 + 92)
    const r = readPeSteamApiDelayImports(readOf(pe))
    expect(r.parsed).toBe(true)
    expect(r.dll).toBeNull()
    expect(r.symbols).toEqual([])
  })

  it('flags steam_api.dll plus steam_api64.dll as a conflict', () => {
    const pe = buildDelayImportPe({
      plus: true,
      dlls: [
        { name: 'steam_api.dll', imports: ['A'] },
        { name: 'steam_api64.dll', imports: ['B'] }
      ]
    })
    expect(readPeSteamApiDelayImports(readOf(pe)).conflict).toBe(true)
  })

  it('never throws and returns parsed:false on malformed input', () => {
    const good = buildDelayImportPe({
      plus: true,
      dlls: [{ name: 'steam_api64.dll', imports: ['SteamAPI_Init'] }]
    })
    // truncated
    expect(
      readPeSteamApiDelayImports(readOf(good.subarray(0, 0x90))).parsed
    ).toBe(false)
    // non-MZ
    expect(
      readPeSteamApiDelayImports(readOf(Buffer.from('not a pe at all'))).parsed
    ).toBe(false)
    // descriptor RVA outside every section
    const outside = Buffer.from(good)
    outside.writeUInt32LE(0x90000, 0x80 + 24 + 112 + 13 * 8)
    expect(readPeSteamApiDelayImports(readOf(outside)).parsed).toBe(false)
    // name over 256 bytes with no NUL
    const longName = Buffer.from(good)
    longName.fill(0x41, 0x400 + 64, 0x400 + 64 + 400)
    expect(readPeSteamApiDelayImports(readOf(longName)).parsed).toBe(false)
  })

  it('treats more than the descriptor cap with no terminator as unparsed', () => {
    const pe = buildDelayImportPe({ plus: true, dlls: [] })
    // 300 descriptors each naming kernel32, never terminated
    const nameAt = 0x400 + 0x6000
    pe.write('kernel32.dll\0', nameAt, 'latin1')
    for (let i = 0; i < 300; i++) {
      pe.writeUInt32LE(0x1000 + 0x6000, 0x400 + i * 32 + 4)
    }
    pe.writeUInt32LE(0x1000, 0x80 + 24 + 112 + 13 * 8)
    expect(readPeSteamApiDelayImports(readOf(pe)).parsed).toBe(false)
  })

  it('treats more than the thunk cap with no terminator as unparsed', () => {
    const imports = Array.from({ length: 5000 }, () => 1)
    const pe = buildDelayImportPe({
      plus: false,
      dlls: [{ name: 'steam_api.dll', imports }]
    })
    expect(readPeSteamApiDelayImports(readOf(pe)).parsed).toBe(false)
  })
})

describe('readPeImportedDllNames (quick 261028-k7l)', () => {
  const readOf = (b: Uint8Array) => (offset: number, length: number) =>
    offset + length > b.length ? null : b.subarray(offset, offset + length)

  it('reads PE32 import names in file order, original spelling', () => {
    const pe = buildImportPe({
      plus: false,
      dlls: ['KERNEL32.dll', 'd3d11.dll', 'USER32.dll']
    })
    expect(readPeImportedDllNames(readOf(pe))).toEqual([
      'KERNEL32.dll',
      'd3d11.dll',
      'USER32.dll'
    ])
  })

  it('reads PE32+ import names', () => {
    const pe = buildImportPe({ plus: true, dlls: ['d3d11.dll'] })
    expect(readPeImportedDllNames(readOf(pe))).toEqual(['d3d11.dll'])
  })

  it('returns [] when the import directory is absent', () => {
    const pe = buildImportPe({ plus: true, dlls: ['d3d11.dll'] })
    // data dir 1 RVA lives at opt(0x98) + 112 + 8
    pe.writeUInt32LE(0, 0x80 + 24 + 112 + 8)
    expect(readPeImportedDllNames(readOf(pe))).toEqual([])
  })

  it('returns [] when NumberOfRvaAndSizes < 2', () => {
    const pe = buildImportPe({ plus: false, dlls: ['d3d11.dll'] })
    pe.writeUInt32LE(1, 0x80 + 24 + 92)
    expect(readPeImportedDllNames(readOf(pe))).toEqual([])
  })

  it('returns null on malformed input without throwing', () => {
    const good = buildImportPe({ plus: false, dlls: ['d3d11.dll'] })
    expect(readPeImportedDllNames(readOf(Buffer.alloc(0)))).toBeNull()
    expect(
      readPeImportedDllNames(readOf(Buffer.from('not a pe at all')))
    ).toBeNull()

    const pastEof = Buffer.from(good)
    pastEof.writeUInt32LE(0x7fffff00, 0x3c)
    expect(readPeImportedDllNames(readOf(pastEof))).toBeNull()

    const outside = Buffer.from(good)
    outside.writeUInt32LE(0x40000, 0x80 + 24 + 96 + 8)
    expect(readPeImportedDllNames(readOf(outside))).toBeNull()

    const longName = buildImportPe({ plus: false, dlls: ['x'.repeat(300)] })
    expect(readPeImportedDllNames(readOf(longName))).toBeNull()
  })

  it('caps the descriptor walk when there is no terminator', () => {
    const pe = buildImportPe({ plus: false, dlls: ['a.dll'] })
    const nameRva = 0x1000 + 0x7100
    pe.write('b.dll\0', 0x400 + 0x7100, 'latin1')
    for (let i = 0; i < 1100; i++) {
      pe.writeUInt32LE(nameRva, 0x400 + i * 20 + 12)
      pe.writeUInt32LE(1, 0x400 + i * 20 + 16)
    }
    const names = readPeImportedDllNames(readOf(pe))
    expect(names).toHaveLength(1024)
  })
})
