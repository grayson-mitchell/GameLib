/**
 * Phase 63 (D-11): per-scanner implementation flag. Dev/advanced only: an env
 * var over a defaults table. Never rendered in the UI and never stored in
 * AppSettings. The sidecar inherits the env from `pnpm tauri:dev`.
 *
 * No logger, no timers, no module-level mutable state (sidecar exit contract).
 */
import type { ScanOp } from './scanTypes'

export type ScannerName =
  | 'peSections'
  | 'peSteamDrm'
  | 'importScan'
  | 'drmScanExe'
  | 'machoExports'

export type ScannerImpl = 'rust' | 'ts'

/**
 * Every default starts at 'ts'. Plan 63-11 flips an entry to 'rust' only after
 * that scanner's sweep is clean (zero diff against the TS oracle).
 */
export const SCANNER_DEFAULTS: Readonly<Record<ScannerName, ScannerImpl>> = {
  peSections: 'ts',
  peSteamDrm: 'ts',
  importScan: 'ts',
  drmScanExe: 'ts',
  machoExports: 'ts'
}

export const SCANNER_ENV_KEYS: Readonly<Record<ScannerName, string>> = {
  peSections: 'GAMELIB_SCANNER_PE_SECTIONS',
  peSteamDrm: 'GAMELIB_SCANNER_PE_STEAM_DRM',
  importScan: 'GAMELIB_SCANNER_IMPORT_SCAN',
  drmScanExe: 'GAMELIB_SCANNER_DRM_SCAN_EXE',
  machoExports: 'GAMELIB_SCANNER_MACHO_EXPORTS'
}

export const SCANNER_OPS: Readonly<Record<ScannerName, readonly ScanOp[]>> = {
  peSections: ['scan_steamstub_section'],
  peSteamDrm: [
    'scan_steam_drm',
    'scan_pe_imported_dlls',
    'scan_pe_delay_imports'
  ],
  importScan: ['scan_steam_api_imports'],
  drmScanExe: ['scan_contained_real'],
  machoExports: ['scan_winemac_metal_exports']
}

/** Only the exact strings `rust` and `ts` override the default. */
export function resolveScannerImpl(
  name: ScannerName,
  env: NodeJS.ProcessEnv = process.env
): ScannerImpl {
  const v = env[SCANNER_ENV_KEYS[name]]
  return v === 'rust' || v === 'ts' ? v : SCANNER_DEFAULTS[name]
}
