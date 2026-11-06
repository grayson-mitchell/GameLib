jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Backend: 'Backend' }
}))
jest.mock('backend/sidecar/sidecarRpc', () => ({
  requestRustInvoke: jest.fn()
}))

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { requestRustInvoke } from 'backend/sidecar/sidecarRpc'
import { checkWinemacMetalViewExports } from '../machoExports'
import { parseMachODefinedExternals } from 'backend/scanners/legacyMachoParse'
import { winemacPathFor } from 'backend/scanners/scanTypes'
import {
  buildFat,
  buildThin,
  EXT_DEF,
  EXT_UNDF,
  LOCAL_DEF,
  STAB,
  type Sym
} from './fixtures/machoFixtures'

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

const ALL_FOUR = [
  '_macdrv_functions',
  '_macdrv_view_create_metal_view',
  '_macdrv_view_get_metal_layer',
  '_macdrv_view_release_metal_view'
]

describe('checkWinemacMetalViewExports', () => {
  const envKey = 'GAMELIB_SCANNER_MACHO_EXPORTS'
  const savedEnv = process.env[envKey]
  let bundle: string

  beforeEach(() => {
    bundle = mkdtempSync(join(tmpdir(), 'macho-exports-'))
  })
  afterEach(() => {
    if (savedEnv === undefined) delete process.env[envKey]
    else process.env[envKey] = savedEnv
    rmSync(bundle, { recursive: true, force: true })
  })

  const writeImage = (data: Buffer) => {
    const p = winemacPathFor(bundle)
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, data)
  }

  describe('ts path', () => {
    beforeEach(() => {
      process.env[envKey] = 'ts'
    })

    it('passes when _macdrv_functions is defined', async () => {
      writeImage(buildThin([{ name: '_macdrv_functions', type: EXT_DEF }]))
      expect(await checkWinemacMetalViewExports(bundle, 'test')).toEqual({
        ok: true
      })
      expect(requestRustInvoke).not.toHaveBeenCalled()
    })

    it('passes when all three metal-view names are defined', async () => {
      writeImage(
        buildThin([
          { name: '_macdrv_view_create_metal_view', type: EXT_DEF },
          { name: '_macdrv_view_get_metal_layer', type: EXT_DEF },
          { name: '_macdrv_view_release_metal_view', type: EXT_DEF }
        ])
      )
      expect(await checkWinemacMetalViewExports(bundle, 'test')).toEqual({
        ok: true
      })
    })

    it('fails listing the missing names when only two of three exist', async () => {
      writeImage(
        buildThin([
          { name: '_macdrv_view_create_metal_view', type: EXT_DEF },
          { name: '_macdrv_view_get_metal_layer', type: EXT_DEF }
        ])
      )
      expect(await checkWinemacMetalViewExports(bundle, 'test')).toEqual({
        ok: false,
        winemacPath: winemacPathFor(bundle),
        reason: 'winemac.so lacks the macdrv metal-view exports',
        missing: ['_macdrv_functions', '_macdrv_view_release_metal_view']
      })
    })

    it('fails with all four missing for the Staging 11.20 shape', async () => {
      writeImage(buildThin(staging))
      expect(await checkWinemacMetalViewExports(bundle, 'test')).toEqual({
        ok: false,
        winemacPath: winemacPathFor(bundle),
        reason: 'winemac.so lacks the macdrv metal-view exports',
        missing: ALL_FOUR
      })
    })

    it('fails when winemac.so is absent', async () => {
      expect(await checkWinemacMetalViewExports(bundle, 'test')).toEqual({
        ok: false,
        winemacPath: winemacPathFor(bundle),
        reason: 'winemac.so not found',
        missing: ALL_FOUR
      })
    })

    it('fails when the file is not a parseable Mach-O', async () => {
      writeImage(Buffer.from('not macho'))
      expect(await checkWinemacMetalViewExports(bundle, 'test')).toEqual({
        ok: false,
        winemacPath: winemacPathFor(bundle),
        reason: 'winemac.so is not a parseable x86_64 Mach-O',
        missing: ALL_FOUR
      })
    })
  })

  describe('rust path', () => {
    beforeEach(() => {
      process.env[envKey] = 'rust'
    })

    it('makes one scan_winemac_metal_exports round-trip and returns its result', async () => {
      ;(requestRustInvoke as jest.Mock).mockResolvedValue({ ok: true })
      expect(await checkWinemacMetalViewExports(bundle, 'test')).toEqual({
        ok: true
      })
      expect(requestRustInvoke).toHaveBeenCalledTimes(1)
      expect(requestRustInvoke).toHaveBeenCalledWith(
        'scan_winemac_metal_exports',
        [{ wineBundlePath: bundle }]
      )
    })

    it('passes a typed failure through untouched', async () => {
      const failure = {
        ok: false,
        winemacPath: winemacPathFor(bundle),
        reason: 'winemac.so not found',
        missing: ALL_FOUR
      }
      ;(requestRustInvoke as jest.Mock).mockResolvedValue(failure)
      expect(await checkWinemacMetalViewExports(bundle, 'test')).toEqual(
        failure
      )
    })

    it('fails closed (ok:false, all four missing) when the transport rejects', async () => {
      ;(requestRustInvoke as jest.Mock).mockRejectedValue(new Error('boom'))
      const r = await checkWinemacMetalViewExports(bundle, 'test')
      expect(r).toEqual({
        ok: false,
        winemacPath: winemacPathFor(bundle),
        reason: 'could not read winemac.so: rust scan failed: Error: boom',
        missing: ALL_FOUR
      })
    })
  })
})
