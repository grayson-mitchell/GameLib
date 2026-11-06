/**
 * Phase 63 async path-based wrappers for the two peSteamDrm readers (D-09: same names and result
 * types as peSteamDrm.ts; D-08: a path goes in, a small result comes out). `peSteamDrm.ts` stays
 * the pure TS oracle substrate; app callers import from here. `caller` tags the per-caller
 * evidence log only.
 */
import { logWarning, LogPrefix } from 'backend/logger'
import { runScanner } from 'backend/scanners/rustScan'
import { peImportedDllsTs, steamDrmTs } from 'backend/scanners/legacyTsScanners'
import type { SteamDrmScanResult } from 'backend/scanners/scanTypes'

export async function detectSteamDrmInPe(
  exePath: string,
  caller: string
): Promise<SteamDrmScanResult> {
  try {
    return await runScanner(
      'peSteamDrm',
      'scan_steam_drm',
      { exePath },
      () => steamDrmTs({ exePath }),
      caller
    )
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
  caller: string
): Promise<string[] | null> {
  try {
    const result = await runScanner(
      'peSteamDrm',
      'scan_pe_imported_dlls',
      { exePath },
      () => peImportedDllsTs({ exePath }),
      caller
    )
    return result.names
  } catch (error) {
    logWarning(
      `readPeImportedDllNames: rust scan failed for "${exePath}": ${String(error)}`,
      LogPrefix.Steam
    )
    return null
  }
}
