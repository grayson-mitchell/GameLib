/**
 * Phase 63 async path-based wrappers for the two peSteamDrm readers (D-09: same names and result
 * types as peSteamDrm.ts; D-08: a path goes in, a small result comes out). `peSteamDrm.ts` stays
 * the pure TS oracle substrate; app callers import from here. They call Rust directly.
 */
import { logWarning, LogPrefix } from 'backend/logger'
import { invokeScan } from 'backend/scanners/rustScan'
import {
  RUST_SCAN_PE_IMPORTED_DLLS,
  RUST_SCAN_STEAM_DRM
} from 'common/types/sidecarTransport'
import type { SteamDrmScanResult } from 'backend/scanners/scanTypes'

export async function detectSteamDrmInPe(
  exePath: string,
  _caller?: string
): Promise<SteamDrmScanResult> {
  try {
    return await invokeScan(RUST_SCAN_STEAM_DRM, { exePath })
  } catch (error) {
    logWarning(
      `detectSteamDrmInPe: rust scan failed for "${exePath}": ${String(error)}`,
      LogPrefix.Steam
    )
    return {
      parsed: false,
      cegMarkers: [],
      hasBindSection: false,
      readError: `rustInvoke failed: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

export async function readPeImportedDllNames(
  exePath: string,
  _caller?: string
): Promise<string[] | null> {
  try {
    const result = await invokeScan(RUST_SCAN_PE_IMPORTED_DLLS, { exePath })
    return result.names
  } catch (error) {
    logWarning(
      `readPeImportedDllNames: rust scan failed for "${exePath}": ${String(error)}`,
      LogPrefix.Steam
    )
    return null
  }
}
