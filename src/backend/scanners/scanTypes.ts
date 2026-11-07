/**
 * Phase 63 (D-08): the one TS contract for every scanner op. The Rust ops in
 * `gamelib-scan` and the TS wrappers/oracles are both written against these
 * shapes. Types, consts and pure helpers; the only runtime import is `path.join`.
 *
 * Every args field is a `string`: bytes never cross the pipe, only paths.
 */

import { join } from 'path'

export type ScanOp =
  | 'scan_contained_real'
  | 'scan_pe_delay_imports'
  | 'scan_pe_imported_dlls'
  | 'scan_steam_api_imports'
  | 'scan_steam_drm'
  | 'scan_steamstub_section'
  | 'scan_winemac_metal_exports'

/** Sorted. */
export const SCAN_OPS: readonly ScanOp[] = [
  'scan_contained_real',
  'scan_pe_delay_imports',
  'scan_pe_imported_dlls',
  'scan_steam_api_imports',
  'scan_steam_drm',
  'scan_steamstub_section',
  'scan_winemac_metal_exports'
]

/**
 * Library and CLI ops with no rustInvoke channel (its only caller is the census).
 * @public consumed by the rustInvoke allow-list in 63-06
 */
export const CLI_ONLY_SCAN_OPS: readonly ScanOp[] = ['scan_pe_delay_imports']

type ScanDiagnostic = { level: 'info' | 'warn'; message: string }

type ExePathArgs = { exePath: string }
type ContainedRealArgs = { path: string; rootDir: string }
type SteamApiImportsArgs = { exePath: string; appId: string }
type WinemacArgs = { wineBundlePath: string }

export type ContainedRealResult = {
  real: string | null
  reason: 'root-unresolvable' | 'realpath-failed' | 'escapes' | null
}

type SteamstubSectionResult = {
  drmWrapper: 'steamstub' | 'none' | null
  readError: string | null
}

export type SteamDrmScanResult = {
  parsed: boolean
  cegMarkers: string[]
  hasBindSection: boolean
  readError: string | null
}

type PeImportedDllsResult = {
  names: string[] | null
  readError: string | null
}

export type PeDelayImportScanResult = {
  /** false when the bytes are not a well-formed PE (treat as no evidence) */
  parsed: boolean
  dll: 'steam_api.dll' | 'steam_api64.dll' | null
  arch: 'x86' | 'x64' | 'none'
  /** by-name imports as written; ordinals as `#<n>`; de-duplicated, INT order */
  symbols: string[]
  /** both steam_api.dll and steam_api64.dll are delay-imported */
  conflict: boolean
  readError: string | null
}

export type ImportScanResult =
  | {
      status: 'ok'
      arch: 'x86' | 'x64' | 'none'
      dll: string | null
      symbols: string[]
      /** quick 261024-j4l: the subset read from the delay import table.
       *  ABSENT (not []) when the PE has no steam_api delay imports. */
      delaySymbols?: string[]
    }
  | { status: 'error'; error: string }

type SteamApiImportScanResult = ImportScanResult & {
  diagnostics: ScanDiagnostic[]
}

export type WinemacMetalCheck =
  | { ok: true }
  | { ok: false; winemacPath: string; reason: string; missing: string[] }

type ScanContract = {
  scan_contained_real: [ContainedRealArgs, ContainedRealResult]
  scan_steamstub_section: [ExePathArgs, SteamstubSectionResult]
  scan_steam_drm: [ExePathArgs, SteamDrmScanResult]
  scan_pe_imported_dlls: [ExePathArgs, PeImportedDllsResult]
  scan_pe_delay_imports: [ExePathArgs, PeDelayImportScanResult]
  scan_steam_api_imports: [SteamApiImportsArgs, SteamApiImportScanResult]
  scan_winemac_metal_exports: [WinemacArgs, WinemacMetalCheck]
}

export type ScanArgsFor<Op extends ScanOp> = ScanContract[Op][0]
export type ScanResultFor<Op extends ScanOp> = ScanContract[Op][1]

/** The macdrv metal-view symbols DXMT needs winemac.so to define. */
export const DXMT_REQUIRED_MACDRV_SYMBOLS = [
  '_macdrv_functions',
  '_macdrv_view_create_metal_view',
  '_macdrv_view_get_metal_layer',
  '_macdrv_view_release_metal_view'
] as const

/** Pure path join: where a Wine bundle keeps winemac.so. */
export function winemacPathFor(wineBundlePath: string): string {
  return join(
    wineBundlePath,
    'Contents',
    'Resources',
    'wine',
    'lib',
    'wine',
    'x86_64-unix',
    'winemac.so'
  )
}
