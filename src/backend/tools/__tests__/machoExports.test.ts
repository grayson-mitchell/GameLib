jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Backend: 'Backend' }
}))

import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { checkWinemacMetalViewExports } from '../machoExports'
import { winemacPathFor } from 'backend/scanners/scanTypes'

const requestRustInvoke = jest.fn()
const rust = { requestRustInvoke }

const ALL_FOUR = [
  '_macdrv_functions',
  '_macdrv_view_create_metal_view',
  '_macdrv_view_get_metal_layer',
  '_macdrv_view_release_metal_view'
]

describe('checkWinemacMetalViewExports', () => {
  let bundle: string

  beforeEach(() => {
    bundle = mkdtempSync(join(tmpdir(), 'macho-exports-'))
  })
  afterEach(() => {
    rmSync(bundle, { recursive: true, force: true })
  })

  describe('rust path', () => {
    it('makes one scan_winemac_metal_exports round-trip and returns its result', async () => {
      requestRustInvoke.mockResolvedValue({ ok: true })
      expect(await checkWinemacMetalViewExports(rust, bundle, 'test')).toEqual({
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
      requestRustInvoke.mockResolvedValue(failure)
      expect(await checkWinemacMetalViewExports(rust, bundle, 'test')).toEqual(
        failure
      )
    })

    it('fails closed (ok:false, all four missing) when the transport rejects', async () => {
      requestRustInvoke.mockRejectedValue(new Error('boom'))
      const r = await checkWinemacMetalViewExports(rust, bundle, 'test')
      expect(r).toEqual({
        ok: false,
        winemacPath: winemacPathFor(bundle),
        reason: 'could not read winemac.so: rust scan failed: Error: boom',
        missing: ALL_FOUR
      })
    })
  })
})
