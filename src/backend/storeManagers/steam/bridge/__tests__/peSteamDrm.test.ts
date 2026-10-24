/**
 * Quick 261024-br4: the pure PE CEG / `.bind` scanner. Every fixture is
 * built in memory by the small builder below (a few KB each); no binaries
 * are checked in.
 */
import {
  CEG_RESOURCE_NAMES,
  detectSteamDrmInPeBytes,
  readPeMachineArch,
  readPeSteamApiDelayImports
} from '../peSteamDrm'
import { buildDelayImportPe } from './fixtures/delayImportPe'

type PeFixture = {
  magic?: number
  extraSections?: string[]
  resources?: {
    rcdataNames?: string[]
    rcdataIds?: number[]
    iconDir?: boolean
    /** RCDATA subdirectory offset points back at the root */
    selfReference?: boolean
  } | null
  resourceSizeZero?: boolean
  resourceRvaOutside?: boolean
  /**
   * 53-15 (Overlooting 3410180): a section listed BEFORE .rsrc whose
   * SizeOfRawData (an embedded Godot pack) spans past .rsrc's RVA while its
   * VirtualSize is 8.
   */
  pckOverlay?: boolean
}

const PE_OFFSET = 0x80
const RSRC_VA = 0x2000
const RSRC_RAW = 0x400

function buildResourceSection(
  res: NonNullable<PeFixture['resources']>
): Uint8Array {
  const buf = new Uint8Array(0x1000)
  const dv = new DataView(buf.buffer)
  let cursor = 0
  const alloc = (n: number) => {
    const at = cursor
    cursor += n
    return at
  }
  const writeDir = (named: number, ids: number) => {
    const at = alloc(16 + (named + ids) * 8)
    dv.setUint16(at + 12, named, true)
    dv.setUint16(at + 14, ids, true)
    return at
  }
  const leaf = () => alloc(16)

  const topIds = (res.iconDir ? 1 : 0) + 1
  const root = writeDir(0, topIds)
  let slot = 0
  const setEntry = (dir: number, i: number, name: number, data: number) => {
    dv.setUint32(dir + 16 + i * 8, name >>> 0, true)
    dv.setUint32(dir + 16 + i * 8 + 4, data >>> 0, true)
  }

  if (res.iconDir) {
    const icon = writeDir(0, 1)
    setEntry(icon, 0, 1, leaf())
    setEntry(root, slot++, 3, (0x80000000 | icon) >>> 0)
  }

  const names = res.rcdataNames ?? []
  const ids = res.rcdataIds ?? []
  const rc = writeDir(names.length, ids.length)
  names.forEach((n, i) => {
    const str = alloc(2 + n.length * 2)
    dv.setUint16(str, n.length, true)
    for (let k = 0; k < n.length; k++) {
      dv.setUint16(str + 2 + k * 2, n.charCodeAt(k), true)
    }
    setEntry(rc, i, (0x80000000 | str) >>> 0, leaf())
  })
  ids.forEach((id, i) => setEntry(rc, names.length + i, id, leaf()))
  const rcTarget = res.selfReference ? root : rc
  setEntry(root, slot++, 10, (0x80000000 | rcTarget) >>> 0)

  return buf.subarray(0, Math.max(cursor, 16))
}

function buildPe(f: PeFixture = {}): Uint8Array {
  const magic = f.magic ?? 0x10b
  const optSize = magic === 0x20b ? 240 : 224
  const rsrc = f.resources ? buildResourceSection(f.resources) : null
  const sections: {
    name: string
    va: number
    raw: Uint8Array
    vsize?: number
    rawSize?: number
  }[] = [{ name: '.text', va: 0x1000, raw: new Uint8Array(0x10) }]
  if (f.pckOverlay) {
    sections.push({
      name: 'pck',
      va: 0x1800,
      raw: new Uint8Array(0x10),
      vsize: 8,
      rawSize: 0x3000
    })
  }
  if (rsrc) sections.push({ name: '.rsrc', va: RSRC_VA, raw: rsrc })
  for (const [i, name] of (f.extraSections ?? []).entries()) {
    sections.push({ name, va: 0x8000 + i * 0x1000, raw: new Uint8Array(0x10) })
  }

  const total = RSRC_RAW + sections.reduce((n, s) => n + s.raw.length + 0x10, 0)
  const buf = new Uint8Array(total)
  const dv = new DataView(buf.buffer)
  buf[0] = 0x4d
  buf[1] = 0x5a
  dv.setUint32(0x3c, PE_OFFSET, true)
  dv.setUint32(PE_OFFSET, 0x00004550, true)
  dv.setUint16(PE_OFFSET + 4, magic === 0x20b ? 0x8664 : 0x14c, true)
  dv.setUint16(PE_OFFSET + 6, sections.length, true)
  dv.setUint16(PE_OFFSET + 20, optSize, true)
  const opt = PE_OFFSET + 24
  dv.setUint16(opt, magic, true)
  const countOff = magic === 0x20b ? opt + 108 : opt + 92
  const dirs = magic === 0x20b ? opt + 112 : opt + 96
  dv.setUint32(countOff, 16, true)
  if (rsrc) {
    dv.setUint32(dirs + 16, f.resourceRvaOutside ? 0x00f00000 : RSRC_VA, true)
    dv.setUint32(dirs + 20, f.resourceSizeZero ? 0 : rsrc.length, true)
  }

  let raw = RSRC_RAW
  sections.forEach((s, i) => {
    const base = opt + optSize + i * 40
    for (let k = 0; k < s.name.length; k++) buf[base + k] = s.name.charCodeAt(k)
    dv.setUint32(base + 8, s.vsize ?? s.raw.length, true)
    dv.setUint32(base + 12, s.va, true)
    dv.setUint32(base + 16, s.rawSize ?? s.raw.length, true)
    dv.setUint32(base + 20, raw, true)
    buf.set(s.raw, raw)
    raw += s.raw.length + 0x10
  })
  return buf
}

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
