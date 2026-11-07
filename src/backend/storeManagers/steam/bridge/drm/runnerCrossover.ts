/**
 * Phase 65 plan 17: CrossOver detection, the shared hashing and containment
 * primitives, and the runner-root removal and process-listing helpers, split
 * out of runnerClone.ts. Nothing here imports runnerClone, runnerEntitlements
 * or runnerVerify (acyclic layering: crossover <- entitlements <- verify <-
 * clone). `isContained`, `safeRemove` and `removeInside` are the path
 * containment controls and are moved byte-identical.
 */
import { createHash } from 'crypto'
import { createReadStream, promises as fsp } from 'fs'
import type { Stats } from 'fs'
import { basename, dirname, isAbsolute, join, relative, sep } from 'path'

import { defaultRunTool, type RunTool } from 'backend/engine/runTool'
import { buildDrmPaths } from './drmPaths'
import {
  findNtdllPatchRow,
  supportedCrossoverBuilds,
  type NtdllPatchRow
} from './ntdllPatchTable'
import { drmStepError, type DrmStepResult } from './steamclientLayerMode'

// cp gets 900 s because the `cp -R` fallback copies about 1 GB.
export const RUNNER_TIMEOUTS = {
  cp: 900_000,
  xattr: 180_000,
  codesign: 60_000,
  plutil: 15_000,
  ps: 15_000
}

export const CROSSOVER_BUILD_RE = /^[0-9]{1,4}(\.[0-9]{1,6}){2,4}$/
export const MAX_NTDLL_BYTES = 16 * 1024 * 1024
export const MAX_SO_BYTES = 4 * 1024 * 1024
// Measured: the real lsteamclient.dll (PE, debug-rich) is about 34 MB.
export const MAX_DLL_BYTES = 64 * 1024 * 1024
export const MAX_LOADER_BYTES = 16 * 1024 * 1024

export const WIN_DLL_REL = join('lib', 'wine', 'x86_64-windows')
export const UNIX_DLL_REL = join('lib', 'wine', 'x86_64-unix')
export const NTDLL_REL = join(WIN_DLL_REL, 'ntdll.dll')
export const LOADER_REL = join(UNIX_DLL_REL, 'wine')
export const WINELOADER_REL = join('bin', 'wineloader')
export const DLL_REL = join(WIN_DLL_REL, 'lsteamclient.dll')
export const SO_REL = join(UNIX_DLL_REL, 'lsteamclient.so')

export async function sha256File(path: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(path)
    stream.on('error', reject)
    stream.on('data', (c) => hash.update(c))
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

export const sha256Bytes = (b: Buffer) =>
  createHash('sha256').update(b).digest('hex')

/** lstat a path that must be a regular non-symlink file of at most maxBytes. */
export async function statRegular(
  path: string,
  maxBytes: number
): Promise<Stats> {
  const st = await fsp.lstat(path)
  if (st.isSymbolicLink() || !st.isFile()) {
    throw new Error(`${basename(path)} is not a regular file`)
  }
  if (st.size > maxBytes) throw new Error(`${basename(path)} is too large`)
  return st
}

export function isContained(root: string, candidate: string): boolean {
  const rel = relative(root, candidate)
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

export function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

// ---------------------------------------------------------------------------
// D-09: CrossOver allowlist
// ---------------------------------------------------------------------------

export type CrossoverAllowed = {
  appPath: string
  cxRoot: string
  binDir: string
  crossoverBuild: string
  cleanNtdllSha256: string
  row: NtdllPatchRow
  supportedBuilds: string[]
}

export type DetectCrossoverDeps = {
  resolveCrossoverBinDir?: () => Promise<string | undefined>
  runTool?: RunTool
  findRow?: (build: string, cleanSha256: string) => NtdllPatchRow | null
  supportedBuilds?: () => string[]
  platform?: NodeJS.Platform
}

export const CX_ROOT_SUFFIX = `${sep}Contents${sep}SharedSupport${sep}CrossOver`

export async function defaultResolveBinDir(): Promise<string | undefined> {
  try {
    const mod = await import('backend/engine/crossoverLocation')
    return await mod.resolveCrossoverBinDirAsync()
  } catch {
    return undefined
  }
}

/**
 * Reads CFBundleVersion of a CrossOver.app. 'unreadable' = plutil failed;
 * 'invalid' = it did not match the build pattern (value is the raw text).
 */
export async function readCrossoverBundleVersion(
  run: RunTool,
  appPath: string,
  timeoutMs: number
): Promise<
  | { status: 'ok'; value: string }
  | { status: 'invalid'; value: string }
  | { status: 'unreadable'; value: '' }
> {
  const plist = await run(
    '/usr/bin/plutil',
    [
      '-extract',
      'CFBundleVersion',
      'raw',
      '-o',
      '-',
      join(appPath, 'Contents', 'Info.plist')
    ],
    { timeoutMs }
  )
  if (plist.code !== 0 || plist.timedOut || plist.aborted) {
    return { status: 'unreadable', value: '' }
  }
  const value = plist.stdout.trim()
  return CROSSOVER_BUILD_RE.test(value)
    ? { status: 'ok', value }
    : { status: 'invalid', value }
}

/**
 * The 'CrossOver allowlist' step. Creates nothing on disk and never calls
 * /bin/cp. Never rejects.
 */
export async function detectAllowedCrossover(
  opts: { crossoverBinDir?: string; appFolder?: string } = {},
  deps: DetectCrossoverDeps = {}
): Promise<DrmStepResult<CrossoverAllowed>> {
  const fail = (cause: string) => drmStepError('unsupported-crossover', cause)
  try {
    const supported = (deps.supportedBuilds ?? supportedCrossoverBuilds)()
    const list = supported.join(',')
    if ((deps.platform ?? process.platform) !== 'darwin') {
      return fail('DRM mode is macOS only')
    }
    const binDir =
      opts.crossoverBinDir ??
      (await (deps.resolveCrossoverBinDir ?? defaultResolveBinDir)())
    if (!binDir) return fail(`CrossOver not found; supported ${list}`)
    if (!binDir.endsWith(`${CX_ROOT_SUFFIX}${sep}bin`)) {
      return fail(`unexpected CrossOver location; supported ${list}`)
    }
    const cxRoot = dirname(binDir)
    const appPath = cxRoot.slice(0, cxRoot.length - CX_ROOT_SUFFIX.length)
    if (!appPath.endsWith('.app')) {
      return fail(`unexpected CrossOver location; supported ${list}`)
    }
    if (opts.appFolder) {
      const paths = buildDrmPaths(opts.appFolder)
      if (
        paths &&
        (cxRoot === paths.runnersRoot || isContained(paths.runnersRoot, cxRoot))
      ) {
        return fail('CrossOver path is inside the runners directory')
      }
    }

    const run = deps.runTool ?? defaultRunTool
    const version = await readCrossoverBundleVersion(
      run,
      appPath,
      RUNNER_TIMEOUTS.plutil
    )
    if (version.status === 'unreadable') {
      return fail('cannot read CrossOver version')
    }
    const build = version.value
    if (version.status === 'invalid') {
      return fail(`installed ${build.slice(0, 40)} supported ${list}`)
    }

    const ntdll = join(cxRoot, NTDLL_REL)
    let sha: string
    try {
      await statRegular(ntdll, MAX_NTDLL_BYTES)
      sha = await sha256File(ntdll)
    } catch {
      return fail(`cannot read CrossOver ntdll for ${build}; supported ${list}`)
    }
    const row = (deps.findRow ?? findNtdllPatchRow)(build, sha)
    if (!row) {
      return fail(
        supported.includes(build)
          ? `installed ${build} has an unrecognised ntdll (${sha.slice(0, 12)}); supported ${list}`
          : `installed ${build} supported ${list}`
      )
    }
    return {
      status: 'ok',
      appPath,
      cxRoot,
      binDir,
      crossoverBuild: build,
      cleanNtdllSha256: sha,
      row,
      supportedBuilds: supported
    }
  } catch (e) {
    return fail(errText(e))
  }
}

const REMOVABLE_RE =
  /^(crossover-[0-9.]+|\.crossover-[0-9.]+\.partial-[A-Za-z0-9]+)$/
/** The only removal path for entries directly under the runners root. */
export async function safeRemove(
  root: string,
  target: string
): Promise<boolean> {
  try {
    if (!isContained(root, target) || dirname(target) !== root) return false
    if (!REMOVABLE_RE.test(basename(target))) return false
    const st = await fsp.lstat(target)
    if (st.isSymbolicLink()) return false
    await fsp.rm(target, { recursive: true, force: true })
    return true
  } catch {
    return false
  }
}

/** Remove something inside a partial dir (containment checked, never throws). */
export async function removeInside(
  root: string,
  target: string
): Promise<void> {
  try {
    if (isContained(root, target)) {
      await fsp.rm(target, { recursive: true, force: true })
    }
  } catch {
    // best effort
  }
}

/**
 * Lists processes. null means ps failed or timed out, which counts as in use.
 */
export async function psListing(
  run: RunTool,
  timeoutMs: number
): Promise<string | null> {
  const r = await run('/bin/ps', ['-axww', '-o', 'command='], { timeoutMs })
  if (r.code !== 0 || r.timedOut || r.aborted) return null
  return r.stdout
}

// The clone's wineserver runs under its own unix path for as long as any Wine
// process in the bottle lives, which is why this full-width command scan
// catches a running game even though Wine retitles game processes to Windows
// paths. A failed ps counts as in use (fail safe).
export async function isPathInUse(
  dir: string,
  run: RunTool,
  timeoutMs: number
): Promise<boolean> {
  const listing = await psListing(run, timeoutMs)
  return listing === null || listing.includes(dir + '/')
}
