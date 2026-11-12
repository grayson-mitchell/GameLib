/**
 * Winemac Metal-view export check (quick 261031-rjv, Phase 63).
 *
 * Native in Rust as `scan_winemac_metal_exports` (gamelib-scan, D-05); the path-based
 * wrapper below calls it directly (no flag, no TS fallback).
 *
 * Fail-closed: a transport rejection resolves `ok:false` (the DXMT gate skips), never `ok:true`.
 */
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import { invokeScan } from '../scanners/rustScan'
import { RUST_SCAN_WINEMAC_METAL_EXPORTS } from 'common/types/sidecarTransport'
import {
  DXMT_REQUIRED_MACDRV_SYMBOLS,
  winemacPathFor,
  type WinemacMetalCheck
} from '../scanners/scanTypes'

export type { WinemacMetalCheck } from '../scanners/scanTypes'

export async function checkWinemacMetalViewExports(
  deps: RustInvokeDeps,
  wineBundlePath: string,
  _caller?: string
): Promise<WinemacMetalCheck> {
  try {
    return await invokeScan(deps, RUST_SCAN_WINEMAC_METAL_EXPORTS, {
      wineBundlePath
    })
  } catch (error) {
    return {
      ok: false,
      winemacPath: winemacPathFor(wineBundlePath),
      reason: `could not read winemac.so: rust scan failed: ${String(error)}`,
      missing: [...DXMT_REQUIRED_MACDRV_SYMBOLS]
    }
  }
}
