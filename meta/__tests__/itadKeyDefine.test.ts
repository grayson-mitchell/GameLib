import { buildSidecarArgv } from '../buildSidecar'
import * as shared from '../esbuildWorkerBundleShared'

// Phase 86 (86-17, D-25): the store search is Rust's and the shell bakes the key at compile time, so no
// sidecar bundle carries an ITAD define any more. These are the guards that it stays gone; the source-level
// ban on the `__ITAD_API_KEY__` identifier is `describe('storeSearchPortComplete')` in infoPortComplete.test.ts.
describe('the sidecar bundle carries no ITAD key define (D-25)', () => {
  test('the shared esbuild module no longer exports a define builder', () => {
    expect(Object.keys(shared)).not.toContain('itadKeyDefineFlag')
  })

  test.each(['linux', 'win32'] as const)(
    '%s carries the base flags and no --define at all',
    (p) => {
      const { args } = buildSidecarArgv(p)
      expect(args).toContain('--packages=external')
      expect(args).toContain('--outfile=build/main/sidecar.js')
      expect(args).toContain('src/sidecar/index.ts')
      expect(args.filter((a) => a.startsWith('--define'))).toEqual([])
    }
  )
})
