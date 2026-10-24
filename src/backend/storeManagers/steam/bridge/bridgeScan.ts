/**
 * Phase 53 Plan 05 (D-53-12): the install-tree scan pieces that the backend
 * placement path (shimGenerate.ts) and the offline census (meta/bridgeCensus.ts)
 * must share, in one module: the importer-PE walk, the Unreal stub-plus-Shipping
 * layout, the runtime-loaded steam_api dll walk, the Mono managed scan and the
 * AnyCPU-aware arch read.
 *
 * Factoring decision: this module is ASYNC (`node:fs/promises`). The backend
 * walks were already async and the census driver is already async (`runCensus`
 * and `classifyInstalledTitle` are `async`), so one async implementation serves
 * both with no sync twin to drift. The census injects a Promise-returning
 * objdump wrapper around its `spawnSync`; the backend injects
 * `scanSteamApiImports` and `logWarning`.
 *
 * Boundary: `node:*` and relative bridge modules ONLY -- no `backend/` alias,
 * no logger, no spawn helpers (the census runs outside the app). Everything
 * environment-specific arrives through `BridgeScanDeps`.
 *
 * Invariants preserved verbatim from the pre-lift walks: depth 4; 512-file
 * importer cap; symlinks skipped (entry type plus an lstat re-check);
 * `.exe`/`.dll` only; exact-name steam_api exclusion; a `.gamelib-orig` backup
 * is never a candidate; containment inside the bottle via isContainedWithin;
 * Shipping exes scanned first and outside the file cap.
 */

import { closeSync, openSync, readSync } from 'node:fs'
import { lstat, readdir, readFile } from 'node:fs/promises'
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve
} from 'node:path'
import {
  readManagedSteamApiImports,
  readPeEffectiveArch,
  type PeReader
} from './managedImports'
import { readManagedInterfaceVersionStrings } from './interfaceVersions'
import {
  SHIM64_SERVED_INTERFACE_VERSIONS,
  SHIM_SERVED_INTERFACE_VERSIONS
} from './shimCoverage'

// ts-prune-ignore-next -- imported by meta/bridgeCensus.ts, which the dead-code scan does not cover
export type BridgeImportScan =
  | {
      status: 'ok'
      arch: 'x86' | 'x64' | 'none'
      symbols: string[]
      delaySymbols?: string[]
    }
  | { status: 'error'; error: string }

export interface BridgeScanDeps {
  /** objdump-backed import scan of one PE (backend: scanSteamApiImports). */
  scanImports: (exePath: string) => Promise<BridgeImportScan>
  /** One-line warning sink (backend: logWarning with LogPrefix.Steam). */
  warn: (message: string) => void
  /** True iff the bytes are a GameLib shim (backend: isGameLibShimBytes). */
  isShimBytes: (buf: Buffer) => boolean
}

/**
 * True iff `candidateAbsPath` resolves to a location strictly inside
 * `rootAbsPath` (steam-two-install-paths-acf-location / MAC32 lesson:
 * `path.join`/string-prefix checks are NOT containment -- use
 * `path.resolve` + `path.relative` and reject `..`/absolute results).
 */
export function isContainedWithin(
  rootAbsPath: string,
  candidateAbsPath: string
): boolean {
  const rel = relative(rootAbsPath, candidateAbsPath)
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

const RUNTIME_WALK_MAX_DEPTH = 4

interface RuntimeSteamApiDll {
  name: 'steam_api.dll' | 'steam_api64.dll'
  path: string
  /** True when the file at `path` is already a GameLib shim (quick 261023-oq7). */
  isGameLibShim: boolean
}

/**
 * CR-04 / T-51-45: bounded walk of the game's install tree for
 * steam_api(64).dll files -- the game's own AND, since quick 261023-oq7
 * (the shim is placed over a runtime-loaded dll), GameLib shims, flagged
 * `isGameLibShim`. Async fs only, depth-limited, never follows symlinks.
 */
export async function findRuntimeLoadedSteamApiDlls(
  root: string,
  extraRoots: string[],
  deps: Pick<BridgeScanDeps, 'isShimBytes'>
): Promise<RuntimeSteamApiDll[]> {
  const found: RuntimeSteamApiDll[] = []
  const walk = async (dir: string, depth: number): Promise<void> => {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (depth < RUNTIME_WALK_MAX_DEPTH) await walk(full, depth + 1)
        continue
      }
      if (!entry.isFile()) continue
      const lower = entry.name.toLowerCase()
      // Exact names only: `<dll>.gamelib-orig` backups never match (j4l).
      if (lower !== 'steam_api.dll' && lower !== 'steam_api64.dll') continue
      let isShim: boolean
      try {
        if ((await lstat(full)).isSymbolicLink()) continue
        isShim = deps.isShimBytes(await readFile(full))
      } catch {
        continue
      }
      found.push({ name: lower, path: full, isGameLibShim: isShim })
    }
  }
  await walk(root, 0)
  // quick 261024-ir1: extra roots (the Unreal Steamworks dir) get the same
  // bounded walk; dedupe by resolved path since they overlap the main walk.
  for (const extra of extraRoots) await walk(extra, 0)
  const seenPaths = new Set<string>()
  return found.filter((d) => {
    const key = resolve(d.path)
    if (seenPaths.has(key)) return false
    seenPaths.add(key)
    return true
  })
}

/**
 * quick 261024-ir1: Unreal Engine 4/5 layout probe. UE games launch a
 * bootstrap stub `<P>.exe` that imports nothing from steam_api; the real
 * importer is `<P>/Binaries/Win64/<P>-Win64-Shipping.exe` and the dll lives
 * at `Engine/Binaries/ThirdParty/Steamworks/Steamv*\/Win64/` -- 6 directories
 * below the install root, past RUNTIME_WALK_MAX_DEPTH (field cases: Manor
 * Lords 1363080, Abiotic Factor 427410, Ranch Simulator 1119730). Returns
 * null unless a real `Engine/` dir sits beside the stub. Async fs only,
 * lstat-checked at every segment, contained in the bottle (T-ir1-01..03).
 */
const UE_SHIPPING_EXE = /-shipping\.exe$/
const UE_SHIPPING_MAX = 8

async function isRealDir(path: string): Promise<boolean> {
  try {
    const st = await lstat(path)
    return st.isDirectory() && !st.isSymbolicLink()
  } catch {
    return false
  }
}

export async function findUnrealLayout(
  bottleDir: string,
  ueRoot: string
): Promise<{ steamworksDir: string | null; shippingExes: string[] } | null> {
  if (!(await isRealDir(join(ueRoot, 'Engine')))) return null

  let steamworksDir: string | null = join(
    ueRoot,
    'Engine',
    'Binaries',
    'ThirdParty',
    'Steamworks'
  )
  for (const seg of [
    join(ueRoot, 'Engine', 'Binaries'),
    join(ueRoot, 'Engine', 'Binaries', 'ThirdParty'),
    steamworksDir
  ]) {
    if (!(await isRealDir(seg))) {
      steamworksDir = null
      break
    }
  }
  if (
    steamworksDir !== null &&
    !isContainedWithin(bottleDir, resolve(steamworksDir))
  ) {
    steamworksDir = null
  }

  const shippingExes: string[] = []
  let top
  try {
    top = await readdir(ueRoot, { withFileTypes: true })
  } catch {
    return { steamworksDir, shippingExes }
  }
  for (const entry of top) {
    if (entry.isSymbolicLink() || !entry.isDirectory()) continue
    if (entry.name.toLowerCase() === 'engine') continue
    const win64 = join(ueRoot, entry.name, 'Binaries', 'Win64')
    if (!(await isRealDir(join(ueRoot, entry.name)))) continue
    if (!(await isRealDir(join(ueRoot, entry.name, 'Binaries')))) continue
    if (!(await isRealDir(win64))) continue
    let files
    try {
      files = await readdir(win64, { withFileTypes: true })
    } catch {
      continue
    }
    for (const f of files) {
      if (f.isSymbolicLink() || !f.isFile()) continue
      if (!UE_SHIPPING_EXE.test(f.name.toLowerCase())) continue
      const full = join(win64, f.name)
      try {
        if ((await lstat(full)).isSymbolicLink()) continue
      } catch {
        continue
      }
      if (!isContainedWithin(bottleDir, resolve(full))) continue
      shippingExes.push(full)
    }
  }
  shippingExes.sort()
  return { steamworksDir, shippingExes: shippingExes.slice(0, UE_SHIPPING_MAX) }
}

/**
 * quick 261024-i94: the bottle-contained root both placement branches walk.
 * Containment is T-oq7-03 / T-24-06; the fallback is the exe's own folder.
 */
export function resolveWalkRoot(
  bottleDir: string,
  resolvedExePath: string,
  gameInstallRoot: string | undefined
): string {
  return gameInstallRoot &&
    isContainedWithin(bottleDir, resolve(gameInstallRoot))
    ? resolve(gameInstallRoot)
    : dirname(resolvedExePath)
}

// Bounds objdump spawns on Unity/UE trees that ship hundreds of DLLs
// (T-i94-02). Hitting it logs one warning and stops the scan.
const IMPORTER_SCAN_MAX_FILES = 512
const PE_CANDIDATE_EXT = /\.(exe|dll)$/

interface SteamApiImporterPe {
  path: string
  arch: 'x86' | 'x64'
  symbols: string[]
  /** quick 261024-j4l: the subset read from the PE delay import table. */
  delaySymbols: string[]
}

/**
 * quick 261024-i94: bounded walk of the install tree for PEs OTHER than the
 * launch exe that import steam_api(64).dll (e.g. Grim Dawn's x64/Engine.dll).
 * Same walk shape as findRuntimeLoadedSteamApiDlls: async fs, depth-limited,
 * symlinks skipped (entry + lstat re-check). Candidates are .exe/.dll files
 * only; steam_api*.dll themselves and `excludePath` are never scanned. Scans
 * run sequentially; a scan error skips that file (T-i94-01..03).
 */
export async function findSteamApiImporterPes(
  label: string,
  root: string,
  excludePath: string,
  priorityPaths: string[],
  deps: Pick<BridgeScanDeps, 'scanImports' | 'warn'>
): Promise<SteamApiImporterPe[]> {
  const found: SteamApiImporterPe[] = []
  const exclude = resolve(excludePath)
  let scanned = 0
  let capped = false
  // quick 261024-ir1: priority paths (Unreal Shipping exes) are scanned first,
  // outside the file cap, and never again by the walk.
  const seen = new Set<string>()
  for (const p of priorityPaths) {
    const key = resolve(p)
    seen.add(key)
    if (key === exclude) continue
    try {
      if ((await lstat(p)).isSymbolicLink()) continue
    } catch {
      continue
    }
    const result = await deps.scanImports(p)
    if (result.status === 'ok' && result.arch !== 'none') {
      found.push({
        path: p,
        arch: result.arch,
        symbols: result.symbols,
        delaySymbols: result.delaySymbols ?? []
      })
    }
  }
  const walk = async (dir: string, depth: number): Promise<void> => {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (capped) return
      if (entry.isSymbolicLink()) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (depth < RUNTIME_WALK_MAX_DEPTH) await walk(full, depth + 1)
        continue
      }
      if (!entry.isFile()) continue
      const lower = entry.name.toLowerCase()
      // `.exe`/`.dll` only: a `.gamelib-orig` backup is never a candidate (j4l).
      if (!PE_CANDIDATE_EXT.test(lower)) continue
      if (lower === 'steam_api.dll' || lower === 'steam_api64.dll') continue
      if (resolve(full) === exclude || seen.has(resolve(full))) continue
      try {
        if ((await lstat(full)).isSymbolicLink()) continue
      } catch {
        continue
      }
      if (scanned >= IMPORTER_SCAN_MAX_FILES) {
        capped = true
        deps.warn(
          `placeShimForGame: importer-PE scan hit the ${IMPORTER_SCAN_MAX_FILES}-file cap for appId ${label} -- remaining files not scanned`
        )
        return
      }
      scanned++
      const result = await deps.scanImports(full)
      if (result.status === 'ok' && result.arch !== 'none') {
        found.push({
          path: full,
          arch: result.arch,
          symbols: result.symbols,
          delaySymbols: result.delaySymbols ?? []
        })
      }
    }
  }
  await walk(root, 0)
  return found
}

/** An fd-backed ranged PeReader (never a slurp); `close` releases the fd. */
function openPeReader(path: string): { read: PeReader; close: () => void } {
  const fd = openSync(path, 'r')
  return {
    read: (offset, length) => {
      const buf = Buffer.alloc(length)
      const n = readSync(fd, buf, 0, length, offset)
      return n < length ? null : new Uint8Array(buf.buffer, buf.byteOffset, n)
    },
    close: () => {
      try {
        closeSync(fd)
      } catch {
        // nothing left to release
      }
    }
  }
}

/**
 * D-53-10 (amended): the arch a PE actually launches as -- an AnyCPU assembly
 * without 32BITREQUIRED/32BITPREFERRED is x64. Ranged fd reads; null on any
 * error or a non-PE; never throws.
 */
export function readFileEffectiveArch(path: string): 'x86' | 'x64' | null {
  let reader: ReturnType<typeof openPeReader> | null = null
  try {
    reader = openPeReader(path)
    return readPeEffectiveArch(reader.read)
  } catch {
    return null
  } finally {
    reader?.close()
  }
}

// ---------------------------------------------------------------------------
// D-53-04 (amended): Mono managed scan
// ---------------------------------------------------------------------------

const MANAGED_MAX_FILES = 256

export type ManagedScanResult =
  | {
      kind: 'mono'
      assemblies: number
      unparsed: number
      symbols: string[]
      versionStrings: string[]
    }
  | { kind: 'il2cpp'; reason: 'il2cpp: not scanned' }
  | { kind: 'none' }

/** Lowercased interface families the shim serves for `arch`. */
export function servedFamiliesFor(arch: 'x86' | 'x64'): Set<string> {
  const map =
    arch === 'x64'
      ? SHIM64_SERVED_INTERFACE_VERSIONS
      : SHIM_SERVED_INTERFACE_VERSIONS
  return new Set(Array.from(map.values(), (s) => s.family))
}

const FLAT_METHOD_FAMILY = /^SteamAPI_I(Steam[A-Za-z0-9]+)_/
const FLAT_ACCESSOR_FAMILY = /^SteamAPI_(Steam[A-Za-z0-9]+)_v\d{3}$/

function familyOfManagedImport(name: string): string | null {
  const m = FLAT_METHOD_FAMILY.exec(name) ?? FLAT_ACCESSOR_FAMILY.exec(name)
  return m ? m[1].toLowerCase() : null
}

/**
 * D-53-04 (amended): a managed import is REQUIRED when it is a lifecycle name
 * (no parsable family) or belongs to a family the shim serves. Imports of an
 * unserved family are only counted; they never change the clean/miss class.
 * Lifecycle names resolve as covered since 53-04 exports them as no-ops.
 */
export function partitionManagedImports(
  names: string[],
  servedFamilies: ReadonlySet<string>
): { required: string[]; unservedFamilyCount: number } {
  const served = new Set(Array.from(servedFamilies, (f) => f.toLowerCase()))
  const required: string[] = []
  let unservedFamilyCount = 0
  for (const name of new Set(names)) {
    const family = familyOfManagedImport(name)
    if (family === null || served.has(family)) required.push(name)
    else unservedFamilyCount++
  }
  return { required: required.sort(), unservedFamilyCount }
}

/**
 * Scans `<exe dir>/<exe stem>_Data/Managed/*.dll` for steam_api DllImports and
 * UTF-16 interface-version constants (T-53-18/19: real-dir lstat, symlinks
 * skipped, bottle containment, MANAGED_MAX_FILES, ranged reads only). An IL2CPP
 * title (GameAssembly.dll beside the exe, no Managed dir) is flagged, not
 * parsed -- no second parser (D-53-04).
 */
export async function scanManagedSteamApi(
  exePath: string,
  bottleDir: string,
  arch: 'x86' | 'x64',
  deps: Pick<BridgeScanDeps, 'warn'>
): Promise<ManagedScanResult> {
  const exeDir = dirname(exePath)
  const stem = basename(exePath).replace(/\.exe$/i, '')
  const managedDir = join(exeDir, `${stem}_Data`, 'Managed')
  const hasManaged =
    (await isRealDir(managedDir)) &&
    isContainedWithin(bottleDir, resolve(managedDir))
  if (!hasManaged) {
    try {
      const st = await lstat(join(exeDir, 'GameAssembly.dll'))
      if (st.isFile() && !st.isSymbolicLink()) {
        return { kind: 'il2cpp', reason: 'il2cpp: not scanned' }
      }
    } catch {
      // no GameAssembly.dll
    }
    return { kind: 'none' }
  }

  let entries
  try {
    entries = await readdir(managedDir, { withFileTypes: true })
  } catch {
    return { kind: 'none' }
  }
  const symbols = new Set<string>()
  const versions = new Set<string>()
  let assemblies = 0
  let unparsed = 0
  let seen = 0
  const dlls = entries
    .filter(
      (e) =>
        !e.isSymbolicLink() &&
        e.isFile() &&
        e.name.toLowerCase().endsWith('.dll')
    )
    .map((e) => e.name)
    .sort()
  for (const name of dlls) {
    if (seen >= MANAGED_MAX_FILES) {
      deps.warn(
        `managed scan hit the ${MANAGED_MAX_FILES}-file cap in "${managedDir}" -- remaining assemblies not scanned`
      )
      break
    }
    seen++
    const full = join(managedDir, name)
    try {
      if ((await lstat(full)).isSymbolicLink()) continue
    } catch {
      continue
    }
    let reader: ReturnType<typeof openPeReader> | null = null
    try {
      reader = openPeReader(full)
      const r = readManagedSteamApiImports(reader.read)
      if (!r.parsed) {
        unparsed++
        continue
      }
      if (!r.isManaged) continue
      assemblies++
      const names =
        arch === 'x64'
          ? r.steamApiImports.steam_api64
          : r.steamApiImports.steam_api
      for (const n of names) symbols.add(n)
    } catch {
      unparsed++
      continue
    } finally {
      reader?.close()
    }
    for (const v of await readManagedInterfaceVersionStrings(full)) {
      versions.add(v)
    }
  }
  return {
    kind: 'mono',
    assemblies,
    unparsed,
    symbols: Array.from(symbols).sort(),
    versionStrings: Array.from(versions).sort()
  }
}
