jest.mock('graceful-fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn()
}))

import { existsSync, readFileSync } from 'graceful-fs'
import {
  checkWinemacMetalViewExports,
  parseMachODefinedExternals
} from '../machoExports'
import {
  buildFat,
  buildThin,
  EXT_DEF,
  EXT_UNDF,
  LOCAL_DEF,
  STAB,
  type Sym
} from './fixtures/machoFixtures'

const existsSyncMock = existsSync as unknown as jest.Mock
const readFileSyncMock = readFileSync as unknown as jest.Mock

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
