/**
 * In-process Mach-O defined-external symbol reader (quick 261031-rjv).
 *
 * The parser now lives in `backend/scanners/legacyMachoParse.ts` (Phase 63,
 * the TS oracle for the Rust port); this module keeps the sync API and the
 * graceful-fs seam until 63-09 makes it async.
 */
import { existsSync, readFileSync } from 'graceful-fs'
import { checkWinemacMetalViewExportsSync } from '../scanners/legacyMachoParse'
import type { WinemacMetalCheck } from '../scanners/scanTypes'

export { parseMachODefinedExternals } from '../scanners/legacyMachoParse'
export type { WinemacMetalCheck } from '../scanners/scanTypes'

export function checkWinemacMetalViewExports(
  wineBundlePath: string
): WinemacMetalCheck {
  return checkWinemacMetalViewExportsSync(wineBundlePath, {
    existsSync,
    readFileSync
  })
}
