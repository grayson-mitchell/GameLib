import { itadKeyDefineFlag } from '../esbuildWorkerBundleShared'
import { buildSidecarArgv } from '../buildSidecar'

describe('itadKeyDefineFlag (Phase 47 D-01)', () => {
  test('absent key -> empty string', () => {
    expect(itadKeyDefineFlag({})).toBe('--define:__ITAD_API_KEY__=""')
  })
  test('key is quoted', () => {
    expect(itadKeyDefineFlag({ ITAD_API_KEY: 'abc' })).toBe(
      '--define:__ITAD_API_KEY__="abc"'
    )
  })
  test('escapes preserved', () => {
    expect(itadKeyDefineFlag({ ITAD_API_KEY: 'a"b\\c' })).toBe(
      '--define:__ITAD_API_KEY__=' + JSON.stringify('a"b\\c')
    )
  })
  test('whitespace-only is absent', () => {
    expect(itadKeyDefineFlag({ ITAD_API_KEY: '  ' })).toBe(
      '--define:__ITAD_API_KEY__=""'
    )
  })
})

describe('buildSidecarArgv', () => {
  test.each(['linux', 'win32'] as const)(
    '%s carries define and base flags',
    (p) => {
      const { args } = buildSidecarArgv(p, { ITAD_API_KEY: 'k' })
      expect(args).toContain('--define:__ITAD_API_KEY__="k"')
      expect(args).toContain('--packages=external')
      expect(args).toContain('--outfile=build/main/sidecar.js')
      expect(args).toContain('src/sidecar/index.ts')
    }
  )
  test('keyless defaults to empty', () => {
    expect(buildSidecarArgv('linux', {}).args).toContain(
      '--define:__ITAD_API_KEY__=""'
    )
  })
})
