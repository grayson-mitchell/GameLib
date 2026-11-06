/**
 * TS oracle for the Phase 63 Rust ports. Zero backend imports, so meta/ tools
 * can bundle it, the same rule as importParse.ts (D-51-15). Deleted in 63-14.
 *
 * One async function per scan op. Each takes exactly the op's args object,
 * resolves the op's result shape (scanTypes.ts) and never throws.
 */

import { closeSync, openSync, readSync } from 'node:fs'
import { realpath } from 'node:fs/promises'
import {
  PE_SECTION_SCAN_BYTES,
  hasSteamStubSection,
  parsePeSectionNames
} from '../storeManagers/steam/bridge/peSections'
import {
  detectSteamDrmInPe,
  readPeImportedDllNames,
  readPeSteamApiDelayImports
} from '../storeManagers/steam/bridge/peSteamDrm'
import { isContainedWithin } from '../storeManagers/steam/bridge/bridgeScan'
import { checkWinemacMetalViewExportsSync } from './legacyMachoParse'
import type {
  ContainedRealArgs,
  ContainedRealResult,
  ExePathArgs,
  PeDelayImportScanResult,
  PeImportedDllsResult,
  ScanArgsFor,
  ScanOp,
  ScanResultFor,
  SteamDrmScanResult,
  SteamstubSectionResult,
  WinemacArgs,
  WinemacMetalCheck
} from './scanTypes'

type Reader = (offset: number, length: number) => Uint8Array | null
/** Reads up to `length` bytes; a short read returns what exists. */
type PartialReader = (offset: number, length: number) => Buffer

/**
 * Owns openSync / readSync / closeSync for the ranged fd reader idiom (never
 * slurps the file; the fd is always closed, T-br4-02). An open or read
 * failure is returned as `{ error }`, not thrown.
 */
function withRangedReader<T>(
  path: string,
  fn: (read: Reader, readUpTo: PartialReader) => T
): { value: T; error: null } | { value: null; error: string } {
  let fd: number | null = null
  try {
    fd = openSync(path, 'r')
    const handle = fd
    const value = fn(
      (offset, length) => {
        const buf = Buffer.alloc(length)
        const n = readSync(handle, buf, 0, length, offset)
        return n < length ? null : new Uint8Array(buf.buffer, buf.byteOffset, n)
      },
      (offset, length) => {
        const buf = Buffer.alloc(length)
        const n = readSync(handle, buf, 0, length, offset)
        return buf.subarray(0, n)
      }
    )
    return { value, error: null }
  } catch (error) {
    return { value: null, error: String(error) }
  } finally {
    if (fd !== null) {
      try {
        closeSync(fd)
      } catch {
        // best effort
      }
    }
  }
}

export async function containedRealTs(
  args: ContainedRealArgs
): Promise<ContainedRealResult> {
  let rootReal: string
  try {
    rootReal = await realpath(args.rootDir)
  } catch {
    return { real: null, reason: 'root-unresolvable' }
  }
  let real: string
  try {
    real = await realpath(args.path)
  } catch {
    return { real: null, reason: 'realpath-failed' }
  }
  if (!isContainedWithin(rootReal, real)) {
    return { real: null, reason: 'escapes' }
  }
  return { real, reason: null }
}

export async function steamstubSectionTs(
  args: ExePathArgs
): Promise<SteamstubSectionResult> {
  const r = withRangedReader(args.exePath, (_read, readUpTo) =>
    hasSteamStubSection(parsePeSectionNames(readUpTo(0, PE_SECTION_SCAN_BYTES)))
      ? ('steamstub' as const)
      : ('none' as const)
  )
  if (r.error !== null) return { drmWrapper: null, readError: r.error }
  return { drmWrapper: r.value, readError: null }
}

export async function steamDrmTs(
  args: ExePathArgs
): Promise<SteamDrmScanResult> {
  const r = withRangedReader(args.exePath, (read) => detectSteamDrmInPe(read))
  if (r.error !== null) {
    return {
      parsed: false,
      cegMarkers: [],
      hasBindSection: false,
      readError: r.error
    }
  }
  return { ...r.value, readError: null }
}

export async function peImportedDllsTs(
  args: ExePathArgs
): Promise<PeImportedDllsResult> {
  const r = withRangedReader(args.exePath, (read) =>
    readPeImportedDllNames(read)
  )
  if (r.error !== null) return { names: null, readError: r.error }
  return { names: r.value, readError: null }
}

export async function peDelayImportsTs(
  args: ExePathArgs
): Promise<PeDelayImportScanResult> {
  const r = withRangedReader(args.exePath, (read) =>
    readPeSteamApiDelayImports(read)
  )
  if (r.error !== null) {
    return {
      parsed: false,
      dll: null,
      arch: 'none',
      symbols: [],
      conflict: false,
      readError: r.error
    }
  }
  return { ...r.value, readError: null }
}

export async function winemacMetalExportsTs(
  args: WinemacArgs
): Promise<WinemacMetalCheck> {
  return checkWinemacMetalViewExportsSync(args.wineBundlePath)
}

/** Dispatch by op string. */
export async function runLegacyOp<Op extends ScanOp>(
  op: Op,
  args: ScanArgsFor<Op>
): Promise<ScanResultFor<Op>> {
  const a = args as never
  let out: unknown
  switch (op) {
    case 'scan_contained_real':
      out = await containedRealTs(a)
      break
    case 'scan_steamstub_section':
      out = await steamstubSectionTs(a)
      break
    case 'scan_steam_drm':
      out = await steamDrmTs(a)
      break
    case 'scan_pe_imported_dlls':
      out = await peImportedDllsTs(a)
      break
    case 'scan_pe_delay_imports':
      out = await peDelayImportsTs(a)
      break
    case 'scan_winemac_metal_exports':
      out = await winemacMetalExportsTs(a)
      break
    default:
      throw new Error(`unsupported legacy op: ${op}`)
  }
  return out as ScanResultFor<Op>
}
