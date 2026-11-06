/**
 * Winemac Metal-view export check (quick 261031-rjv, Phase 63).
 *
 * Native in Rust as `scan_winemac_metal_exports` (gamelib-scan, D-05); the path-based
 * wrapper below picks the implementation per `GAMELIB_SCANNER_MACHO_EXPORTS`. The TS
 * parser in `backend/scanners/legacyMachoParse.ts` stays as the `ts` fallback until
 * 63-13 (the module is deleted in 63-14).
 *
 * Fail-closed: a transport rejection resolves `ok:false` (the DXMT gate skips), never `ok:true`.
 */
import { runScanner } from '../scanners/rustScan'
import {
  DXMT_REQUIRED_MACDRV_SYMBOLS,
  winemacPathFor,
  type WinemacMetalCheck
} from '../scanners/scanTypes'
import { winemacMetalExportsTs } from '../scanners/legacyTsScanners'

export type { WinemacMetalCheck } from '../scanners/scanTypes'

export async function checkWinemacMetalViewExports(
  wineBundlePath: string,
  caller: string
): Promise<WinemacMetalCheck> {
  try {
    return await runScanner(
      'machoExports',
      'scan_winemac_metal_exports',
      { wineBundlePath },
      () => winemacMetalExportsTs({ wineBundlePath }),
      caller
    )
  } catch (error) {
    return {
      ok: false,
      winemacPath: winemacPathFor(wineBundlePath),
      reason: `could not read winemac.so: rust scan failed: ${String(error)}`,
      missing: [...DXMT_REQUIRED_MACDRV_SYMBOLS]
    }
  }
}
