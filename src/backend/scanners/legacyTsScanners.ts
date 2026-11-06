/**
 * TS oracle for the Phase 63 Rust ports. Zero backend imports, so meta/ tools
 * can bundle it, the same rule as importParse.ts (D-51-15). Deleted in 63-14.
 *
 * One async function per scan op. Each takes exactly the op's args object,
 * resolves the op's result shape (scanTypes.ts) and never throws.
 */

import { closeSync, existsSync, openSync, readSync } from 'node:fs'
import { realpath } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
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
import {
  parseImportedDllNames,
  parseSteamApiImportTable
} from '../storeManagers/steam/bridge/importParse'
import { NUMERIC_APP_ID } from '../storeManagers/steam/gameConstants'
import { checkWinemacMetalViewExportsSync } from './legacyMachoParse'
import type {
  ContainedRealArgs,
  ContainedRealResult,
  ExePathArgs,
  PeDelayImportScanResult,
  PeImportedDllsResult,
  ScanArgsFor,
  ScanDiagnostic,
  ScanOp,
  ScanResultFor,
  SteamApiImportScanResult,
  SteamApiImportsArgs,
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

export const OBJDUMP_BIN = '/usr/bin/objdump'

const CONFLICTING_HEADINGS_ERROR =
  'conflicting steam_api.dll and steam_api64.dll import headings'

const CLOSURE_MAX_DEPTH = 2
const CLOSURE_MAX_DLLS = 32
const SYSTEM_DLLS = new Set([
  'kernel32.dll',
  'user32.dll',
  'ntdll.dll',
  'msvcrt.dll',
  'advapi32.dll',
  'gdi32.dll',
  'shell32.dll',
  'ole32.dll',
  'oleaut32.dll',
  'ws2_32.dll',
  'winmm.dll'
])

function isFollowableName(name: string): boolean {
  if (/[\\/]/.test(name) || name.includes('..')) return false
  const lower = name.toLowerCase()
  if (SYSTEM_DLLS.has(lower) || /^(api|ext)-ms-/i.test(lower)) return false
  return true
}

// Private copy kept as-is from importScan.ts (differs from bridgeScan's only in
// the `rel !== '..'` edge); the closure walk must behave exactly as before.
function isContainedWithinLoose(root: string, candidate: string): boolean {
  const rel = relative(root, candidate)
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

type ClosureBlock = ReturnType<typeof parseSteamApiImportTable>

type ObjdumpRunner = (
  path: string
) => Promise<{ code: number | null; stdout: string }>

const warn = (message: string): ScanDiagnostic => ({ level: 'warn', message })
const info = (message: string): ScanDiagnostic => ({ level: 'info', message })

/** Breadth-first walk of same-directory DLL imports; returns steam_api blocks found. */
async function scanImportClosure(
  appId: string,
  exePath: string,
  exeStdout: string,
  runObjdump: ObjdumpRunner,
  diagnostics: ScanDiagnostic[]
): Promise<{ blocks: { name: string; parsed: ClosureBlock }[] }> {
  const dir = dirname(exePath)
  const root = resolve(dir)
  const blocks: { name: string; parsed: ClosureBlock }[] = []
  const visited = new Set<string>()
  let examined = 0
  let frontier = parseImportedDllNames(exeStdout)
  for (let depth = 1; depth <= CLOSURE_MAX_DEPTH && frontier.length; depth++) {
    const next: string[] = []
    for (const name of frontier) {
      const key = name.toLowerCase()
      if (visited.has(key) || !isFollowableName(name)) continue
      if (/^steam_api(64)?\.dll$/i.test(name)) continue
      const full = join(dir, name)
      if (!isContainedWithinLoose(root, resolve(full)) || !existsSync(full)) {
        continue
      }
      if (examined >= CLOSURE_MAX_DLLS) return { blocks }
      visited.add(key)
      examined++
      try {
        const r = await runObjdump(full)
        if (r.code !== 0) {
          diagnostics.push(
            warn(
              `scanSteamApiImports: objdump exited with code ${r.code} for followed DLL "${full}" (appId ${appId}); skipping`
            )
          )
          continue
        }
        const parsed = parseSteamApiImportTable(r.stdout)
        if (parsed.arch !== 'none' || parsed.conflict) {
          blocks.push({ name, parsed })
        }
        next.push(...parseImportedDllNames(r.stdout))
      } catch (error) {
        diagnostics.push(
          warn(
            `scanSteamApiImports: objdump failed for followed DLL "${full}" (appId ${appId}); skipping: ${String(error)}`
          )
        )
      }
    }
    frontier = next
  }
  return { blocks }
}

/**
 * Delay-import read. Any open/read error returns null, silently: objdump
 * already succeeded or the path is a test stub, and "no delay evidence" is
 * the safe reading.
 */
function readDelayImports(
  exePath: string
): ReturnType<typeof readPeSteamApiDelayImports> | null {
  const r = withRangedReader(exePath, (read) =>
    readPeSteamApiDelayImports(read)
  )
  return r.error === null ? r.value : null
}

/**
 * Runs `objdump --private-headers <exePath>` through the injected runner
 * (argv-form only, T-24-06) and returns the game's exact imported
 * `steam_api(64)?.dll` arch, dll name and symbol set, following the bounded
 * same-directory import closure and merging the PE delay import table. Never
 * throws; failures become a typed `{ status: 'error' }`. Log lines are
 * returned as `diagnostics` for the caller to forward.
 */
export async function steamApiImportsTs(
  args: SteamApiImportsArgs,
  deps: { runObjdump: ObjdumpRunner }
): Promise<SteamApiImportScanResult> {
  const { exePath, appId } = args
  const diagnostics: ScanDiagnostic[] = []
  const fail = (error: string): SteamApiImportScanResult => ({
    status: 'error',
    error,
    diagnostics
  })

  if (!NUMERIC_APP_ID.test(appId)) {
    diagnostics.push(
      warn(
        `scanSteamApiImports: rejected non-numeric appId "${appId}" -- not spawning objdump (T-24-06)`
      )
    )
    return fail(`Invalid appId: "${appId}"`)
  }

  let result: { code: number | null; stdout: string }
  try {
    result = await deps.runObjdump(exePath)
  } catch (error) {
    diagnostics.push(
      warn(
        `scanSteamApiImports: objdump failed to run for appId ${appId} ("${exePath}"): ${String(error)}`
      )
    )
    return fail(`Failed to run objdump: ${String(error)}`)
  }

  if (result.code !== 0) {
    diagnostics.push(
      warn(
        `scanSteamApiImports: objdump exited with code ${result.code} for appId ${appId} ("${exePath}")`
      )
    )
    return fail(`objdump exited with code ${result.code} for "${exePath}"`)
  }

  let parsed: ClosureBlock = parseSteamApiImportTable(result.stdout)
  const closure = await scanImportClosure(
    appId,
    exePath,
    result.stdout,
    deps.runObjdump,
    diagnostics
  )
  const contributing: string[] = []
  for (const { name, parsed: b } of closure.blocks) {
    if (b.conflict || (parsed.arch !== 'none' && b.arch !== parsed.arch)) {
      diagnostics.push(
        warn(
          `scanSteamApiImports: ${CONFLICTING_HEADINGS_ERROR} (via ${name}) for appId ${appId} ("${exePath}")`
        )
      )
      return fail(CONFLICTING_HEADINGS_ERROR)
    }
    parsed = {
      dll: parsed.dll ?? b.dll,
      arch: parsed.arch === 'none' ? b.arch : parsed.arch,
      symbols: [...new Set([...parsed.symbols, ...b.symbols])],
      conflict: parsed.conflict
    }
    contributing.push(name)
  }
  if (contributing.length > 0) {
    diagnostics.push(
      info(
        `scanSteamApiImports: appId ${appId} steam_api imported via ${contributing.join(', ')} (Phase 52 closure)`
      )
    )
  }
  if (parsed.conflict) {
    diagnostics.push(
      warn(
        `scanSteamApiImports: ${CONFLICTING_HEADINGS_ERROR} for appId ${appId} ("${exePath}")`
      )
    )
    return fail(CONFLICTING_HEADINGS_ERROR)
  }

  const delay = readDelayImports(exePath)
  if (!delay || !delay.parsed || delay.dll === null) {
    return {
      status: 'ok',
      arch: parsed.arch,
      dll: parsed.dll,
      symbols: parsed.symbols,
      diagnostics
    }
  }

  if (
    delay.conflict ||
    (parsed.arch !== 'none' && parsed.arch !== delay.arch)
  ) {
    diagnostics.push(
      warn(
        `scanSteamApiImports: ${CONFLICTING_HEADINGS_ERROR} (import table vs delay import table) for appId ${appId} ("${exePath}")`
      )
    )
    return fail(CONFLICTING_HEADINGS_ERROR)
  }

  diagnostics.push(
    info(
      `scanSteamApiImports: appId ${appId} delay-imports ${delay.symbols.length} symbol(s) from ${delay.dll} ("${exePath}")`
    )
  )
  return {
    status: 'ok',
    arch: parsed.arch === 'none' ? delay.arch : parsed.arch,
    dll: parsed.dll ?? delay.dll,
    symbols: [...new Set([...parsed.symbols, ...delay.symbols])],
    delaySymbols: delay.symbols,
    diagnostics
  }
}

/** Dispatch by op string; `deps` is only used by `scan_steam_api_imports`. */
export async function runLegacyOp<Op extends ScanOp>(
  op: Op,
  args: ScanArgsFor<Op>,
  deps?: { runObjdump: ObjdumpRunner }
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
    case 'scan_steam_api_imports':
      if (!deps) throw new Error('scan_steam_api_imports needs runObjdump')
      out = await steamApiImportsTs(a, deps)
      break
    default:
      throw new Error(`unsupported legacy op: ${op}`)
  }
  return out as ScanResultFor<Op>
}
