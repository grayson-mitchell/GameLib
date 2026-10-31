jest.mock('graceful-fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn()
}))

import { existsSync, readFileSync } from 'graceful-fs'
import {
  checkWinemacMetalViewExports,
  parseMachODefinedExternals
} from '../machoExports'

const existsSyncMock = existsSync as unknown as jest.Mock
const readFileSyncMock = readFileSync as unknown as jest.Mock

type Sym = { name: string; type: number }
const EXT_DEF = 0x0f // N_EXT | N_SECT
const EXT_UNDF = 0x01 // N_EXT | N_UNDF
const LOCAL_DEF = 0x0e
const STAB = 0x24 // stab bits set

function buildThin(
  syms: Sym[],
  opts: { dysymtab?: boolean; breakStroff?: boolean } = {}
): Buffer {
  const dysymtab = opts.dysymtab ?? true
  // order: undefined first, then defined externals, locals first overall like ld
  const ordered = [
    ...syms.filter((s) => s.type === LOCAL_DEF || s.type === STAB),
    ...syms.filter((s) => s.type === EXT_DEF),
    ...syms.filter((s) => s.type === EXT_UNDF)
  ]
  const nlocal = syms.filter(
    (s) => s.type === LOCAL_DEF || s.type === STAB
  ).length
  const nextdef = syms.filter((s) => s.type === EXT_DEF).length
  const nundef = syms.filter((s) => s.type === EXT_UNDF).length

  const strParts: Buffer[] = [Buffer.from([0])]
  const offsets: number[] = []
  let strsize = 1
  for (const s of ordered) {
    offsets.push(strsize)
    const b = Buffer.from(s.name + '\0')
    strParts.push(b)
    strsize += b.length
  }
  const strtab = Buffer.concat(strParts)

  const ncmds = dysymtab ? 2 : 1
  const cmdsBytes = 24 + (dysymtab ? 80 : 0)
  const symoff = 32 + cmdsBytes
  const stroff = symoff + ordered.length * 16

  const header = Buffer.alloc(32)
  header.writeUInt32LE(0xfeedfacf, 0)
  header.writeUInt32LE(0x01000007, 4)
  header.writeUInt32LE(ncmds, 16)
  header.writeUInt32LE(cmdsBytes, 20)

  const symtab = Buffer.alloc(24)
  symtab.writeUInt32LE(0x2, 0)
  symtab.writeUInt32LE(24, 4)
  symtab.writeUInt32LE(opts.breakStroff ? 0x7fffffff : symoff, 8)
  symtab.writeUInt32LE(ordered.length, 12)
  symtab.writeUInt32LE(stroff, 16)
  symtab.writeUInt32LE(strsize, 20)

  const parts = [header, symtab]
  if (dysymtab) {
    const dy = Buffer.alloc(80)
    dy.writeUInt32LE(0xb, 0)
    dy.writeUInt32LE(80, 4)
    dy.writeUInt32LE(0, 8)
    dy.writeUInt32LE(nlocal, 12)
    dy.writeUInt32LE(nlocal, 16)
    dy.writeUInt32LE(nextdef, 20)
    dy.writeUInt32LE(nlocal + nextdef, 24)
    dy.writeUInt32LE(nundef, 28)
    parts.push(dy)
  }
  const nl = Buffer.alloc(ordered.length * 16)
  ordered.forEach((s, i) => {
    nl.writeUInt32LE(offsets[i], i * 16)
    nl.writeUInt8(s.type, i * 16 + 4)
  })
  parts.push(nl, strtab)
  return Buffer.concat(parts)
}

function buildFat(slices: { cputype: number; data: Buffer }[]): Buffer {
  const head = Buffer.alloc(8 + slices.length * 20)
  head.writeUInt32BE(0xcafebabe, 0)
  head.writeUInt32BE(slices.length, 4)
  let off = Math.ceil(head.length / 16) * 16
  const firstOff = off
  slices.forEach((s, i) => {
    const p = 8 + i * 20
    head.writeUInt32BE(s.cputype, p)
    head.writeUInt32BE(off, p + 8)
    head.writeUInt32BE(s.data.length, p + 12)
    off += s.data.length
  })
  return Buffer.concat([
    head,
    Buffer.alloc(firstOff - head.length),
    ...slices.map((s) => s.data)
  ])
}

const staging: Sym[] = [
  { name: '___wine_unix_call_funcs', type: EXT_DEF },
  { name: '___wine_unix_call_wow64_funcs', type: EXT_DEF }
]

describe('parseMachODefinedExternals', () => {
  it('returns defined externals from a thin image', () => {
    const buf = buildThin([
      { name: '_macdrv_functions', type: EXT_DEF },
      { name: '___wine_unix_call_funcs', type: EXT_DEF }
    ])
    expect(parseMachODefinedExternals(buf)).toEqual([
      '_macdrv_functions',
      '___wine_unix_call_funcs'
    ])
  })

  it('does not return undefined imports', () => {
    const buf = buildThin([
      { name: '_macdrv_view_create_metal_view', type: EXT_UNDF },
      { name: '_defined_one', type: EXT_DEF }
    ])
    expect(parseMachODefinedExternals(buf)).toEqual(['_defined_one'])
  })

  it('does not return local or STAB symbols', () => {
    const buf = buildThin([
      { name: '_local', type: LOCAL_DEF },
      { name: '_stab', type: STAB },
      { name: '_ext', type: EXT_DEF }
    ])
    expect(parseMachODefinedExternals(buf)).toEqual(['_ext'])
  })

  it('falls back to filtering all nlists without LC_DYSYMTAB', () => {
    const buf = buildThin(
      [
        { name: '_local', type: LOCAL_DEF },
        { name: '_ext', type: EXT_DEF },
        { name: '_imp', type: EXT_UNDF }
      ],
      { dysymtab: false }
    )
    expect(parseMachODefinedExternals(buf)).toEqual(['_ext'])
  })

  it('parses the x86_64 slice of a fat image', () => {
    const arm = buildThin([{ name: '_arm_only', type: EXT_DEF }])
    const x86 = buildThin([{ name: '_x86_only', type: EXT_DEF }])
    const fat = buildFat([
      { cputype: 0x0100000c, data: arm },
      { cputype: 0x01000007, data: x86 }
    ])
    expect(parseMachODefinedExternals(fat)).toEqual(['_x86_only'])
  })

  it('returns null for a fat image without x86_64', () => {
    const arm = buildThin([{ name: '_arm_only', type: EXT_DEF }])
    const fat = buildFat([{ cputype: 0x0100000c, data: arm }])
    expect(parseMachODefinedExternals(fat)).toBeNull()
  })

  it('returns null for malformed input without throwing', () => {
    const good = buildThin(staging)
    expect(parseMachODefinedExternals(Buffer.from('garbage-bytes'))).toBeNull()
    expect(parseMachODefinedExternals(good.subarray(0, 20))).toBeNull()
    expect(parseMachODefinedExternals(good.subarray(0, 100))).toBeNull()
    const thin32 = Buffer.from(good)
    thin32.writeUInt32LE(0xfeedface, 0)
    expect(parseMachODefinedExternals(thin32)).toBeNull()
    expect(
      parseMachODefinedExternals(buildThin(staging, { breakStroff: true }))
    ).toBeNull()
  })
})

describe('checkWinemacMetalViewExports', () => {
  const setImage = (syms: Sym[]) => {
    existsSyncMock.mockReturnValue(true)
    readFileSyncMock.mockReturnValue(buildThin(syms))
  }
  const path = '/w/Contents/Resources/wine/lib/wine/x86_64-unix/winemac.so'

  it('passes when _macdrv_functions is defined', () => {
    setImage([{ name: '_macdrv_functions', type: EXT_DEF }])
    expect(checkWinemacMetalViewExports('/w')).toEqual({ ok: true })
  })

  it('passes when all three metal-view names are defined', () => {
    setImage([
      { name: '_macdrv_view_create_metal_view', type: EXT_DEF },
      { name: '_macdrv_view_get_metal_layer', type: EXT_DEF },
      { name: '_macdrv_view_release_metal_view', type: EXT_DEF }
    ])
    expect(checkWinemacMetalViewExports('/w')).toEqual({ ok: true })
  })

  it('fails listing the missing names when only two of three exist', () => {
    setImage([
      { name: '_macdrv_view_create_metal_view', type: EXT_DEF },
      { name: '_macdrv_view_get_metal_layer', type: EXT_DEF }
    ])
    const r = checkWinemacMetalViewExports('/w')
    expect(r.ok).toBe(false)
    expect(r).toEqual({
      ok: false,
      winemacPath: path,
      reason: 'winemac.so lacks the macdrv metal-view exports',
      missing: ['_macdrv_functions', '_macdrv_view_release_metal_view']
    })
  })

  it('fails with all four missing for the Staging 11.20 shape', () => {
    setImage(staging)
    expect(checkWinemacMetalViewExports('/w')).toEqual({
      ok: false,
      winemacPath: path,
      reason: 'winemac.so lacks the macdrv metal-view exports',
      missing: [
        '_macdrv_functions',
        '_macdrv_view_create_metal_view',
        '_macdrv_view_get_metal_layer',
        '_macdrv_view_release_metal_view'
      ]
    })
  })

  it('fails when winemac.so is absent', () => {
    existsSyncMock.mockReturnValue(false)
    const r = checkWinemacMetalViewExports('/w')
    expect(r).toEqual({
      ok: false,
      winemacPath: path,
      reason: 'winemac.so not found',
      missing: [
        '_macdrv_functions',
        '_macdrv_view_create_metal_view',
        '_macdrv_view_get_metal_layer',
        '_macdrv_view_release_metal_view'
      ]
    })
  })

  it('fails when the file is not a parseable Mach-O', () => {
    existsSyncMock.mockReturnValue(true)
    readFileSyncMock.mockReturnValue(Buffer.from('not macho'))
    const r = checkWinemacMetalViewExports('/w')
    expect(r).toEqual({
      ok: false,
      winemacPath: path,
      reason: 'winemac.so is not a parseable x86_64 Mach-O',
      missing: [
        '_macdrv_functions',
        '_macdrv_view_create_metal_view',
        '_macdrv_view_get_metal_layer',
        '_macdrv_view_release_metal_view'
      ]
    })
  })
})
