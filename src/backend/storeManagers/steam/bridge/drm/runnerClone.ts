/**
 * Phase 56 plan 08: the runner step of DRM mode (D-08, D-09, D-10).
 *
 * The runner is an APFS clone of the installed CrossOver under
 * `<appFolder>/steam-bridge/drm/runners/`. The installed CrossOver is only
 * ever read: the cp source is its one appearance in any argv.
 *
 * The allowlist is 56-06's `ntdllPatchTable.ts`, keyed by `CFBundleVersion`
 * plus the clean ntdll sha256. An unlisted CrossOver fails closed as
 * `unsupported-crossover` and is never patched.
 *
 * The launch form is not chosen here. `RunnerReady` exposes the paths for both
 * the `bin/wine`+`CX_BOTTLE` and the raw `WINELOADER`+`WINEPREFIX` forms.
 * 56-11 and 56-12 pick one from `56-01-SUMMARY.md` (`launch_form:
 * bin/wine+CX_BOTTLE` at the time of writing).
 *
 * Two-profile rule: every spawn here (`cp`, `xattr`, `codesign`, `plutil`,
 * `ps`) needs no user profile and gets the isolated half via
 * `createFakeHomeProfile().childEnv()`. There is no real-profile arm in this
 * module; the wine launch arm lives in 56-12.
 *
 * Sidecar exit contract: nothing runs at import; every child, pipe and
 * deadline is unref'd; the long cp is abortable, so the stdin-EOF
 * `callAllAbortControllers()` ends it.
 *
 * Trust widening (RESEARCH Security Domain): the clone's loader is re-signed
 * ad hoc with `disable-library-validation` kept and the dyld entitlement
 * added, so it loads the unsigned `lsteamclient.so`. Both live under a 0700
 * runners root and are re-hashed on every launch.
 *
 * Step mapping: `runner-clone` covers path setup, copy, clone checks, the
 * xattr scrub, marker, rename, in-use and verify. `runner-patch` covers every
 * modification of the clone after the copy: ntdll, builtins and the loader
 * re-sign.
 */
import { spawn } from 'child_process'
import { createHash } from 'crypto'
import { createReadStream, constants as fsConstants, promises as fsp } from 'fs'
import type { Stats } from 'fs'
import { basename, dirname, isAbsolute, join, relative, sep } from 'path'

import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { createFakeHomeProfile } from 'backend/testUtils/fakeHomeProfile'
import {
  createAbortController,
  deleteAbortController
} from 'backend/utils/aborthandler/aborthandler'
import { buildDrmPaths } from './drmPaths'
import { applyNtdllPatch, type NtdllPatchResult } from './ntdllPatch'
import {
  findNtdllPatchRow,
  supportedCrossoverBuilds,
  type NtdllPatchRow
} from './ntdllPatchTable'
import {
  drmStepError,
  type DrmStep,
  type DrmStepResult
} from './steamclientLayerMode'

// ts-prune-ignore-next
export type RunnerTool =
  | '/bin/cp'
  | '/usr/bin/xattr'
  | '/usr/bin/codesign'
  | '/usr/bin/plutil'
  | '/bin/ps'

const RUNNER_TOOLS: readonly RunnerTool[] = [
  '/bin/cp',
  '/usr/bin/xattr',
  '/usr/bin/codesign',
  '/usr/bin/plutil',
  '/bin/ps'
]

// ts-prune-ignore-next
export type RunToolResult = {
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
  aborted: boolean
}

// ts-prune-ignore-next
export type RunTool = (
  tool: RunnerTool,
  args: readonly string[],
  opts: { timeoutMs: number; signal?: AbortSignal }
) => Promise<RunToolResult>

const OUTPUT_CAP = 1024 * 1024

// cp gets 900 s because the `cp -R` fallback copies about 1 GB.
const RUNNER_TIMEOUTS = {
  cp: 900_000,
  xattr: 180_000,
  codesign: 60_000,
  plutil: 15_000,
  ps: 15_000
}

function unrefHandle(handle: unknown): void {
  ;(handle as { unref?: () => void } | null | undefined)?.unref?.()
}

/**
 * Never rejects. Only the five allowlisted absolute tool paths can be run.
 */
// ts-prune-ignore-next
export const defaultRunTool: RunTool = async (tool, args, opts) => {
  const result: RunToolResult = {
    code: null,
    stdout: '',
    stderr: '',
    timedOut: false,
    aborted: false
  }
  if (!RUNNER_TOOLS.includes(tool)) {
    return { ...result, stderr: `tool not allowed: ${String(tool)}` }
  }
  if (opts.signal?.aborted) return { ...result, aborted: true }

  // These tools need no user profile, so they get the isolated half of the
  // two-profile rule. The env comes from createFakeHomeProfile().childEnv()
  // and is never a hand-rolled literal.
  const profile = createFakeHomeProfile({ prefix: 'gamelib-runner-' })
  let timer: NodeJS.Timeout | undefined
  let onAbort: (() => void) | undefined
  try {
    return await new Promise<RunToolResult>((resolve) => {
      let settled = false
      const done = (code: number | null) => {
        if (settled) return
        settled = true
        resolve({ ...result, code })
      }
      let child: ReturnType<typeof spawn>
      try {
        child = spawn(tool, [...args], {
          env: profile.childEnv(),
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true
        })
      } catch (e) {
        result.stderr = e instanceof Error ? e.message : String(e)
        done(null)
        return
      }
      unrefHandle(child)
      unrefHandle(child.stdout)
      unrefHandle(child.stderr)
      child.stdout?.on('data', (d: Buffer) => {
        if (result.stdout.length < OUTPUT_CAP)
          result.stdout += d.toString('utf8')
      })
      child.stderr?.on('data', (d: Buffer) => {
        if (result.stderr.length < OUTPUT_CAP)
          result.stderr += d.toString('utf8')
      })
      timer = setTimeout(() => {
        result.timedOut = true
        child.kill('SIGKILL')
        done(null)
      }, opts.timeoutMs)
      timer.unref?.()
      if (opts.signal) {
        onAbort = () => {
          result.aborted = true
          child.kill('SIGKILL')
          done(null)
        }
        opts.signal.addEventListener('abort', onAbort, { once: true })
      }
      child.on('error', () => done(null))
      child.on('close', (code) => done(code))
    })
  } finally {
    if (timer) clearTimeout(timer)
    if (onAbort) opts.signal?.removeEventListener('abort', onAbort)
    profile.dispose()
  }
}

const BUILD_RE = /^[0-9]{1,4}(\.[0-9]{1,6}){2,4}$/
const MAX_NTDLL_BYTES = 16 * 1024 * 1024
const MAX_SO_BYTES = 4 * 1024 * 1024
// Measured: the real lsteamclient.dll (PE, debug-rich) is about 34 MB.
const MAX_DLL_BYTES = 64 * 1024 * 1024
const MAX_LOADER_BYTES = 16 * 1024 * 1024

const WIN_DLL_REL = join('lib', 'wine', 'x86_64-windows')
const UNIX_DLL_REL = join('lib', 'wine', 'x86_64-unix')
const NTDLL_REL = join(WIN_DLL_REL, 'ntdll.dll')
const LOADER_REL = join(UNIX_DLL_REL, 'wine')
const DLL_REL = join(WIN_DLL_REL, 'lsteamclient.dll')
const SO_REL = join(UNIX_DLL_REL, 'lsteamclient.so')

async function sha256File(path: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(path)
    stream.on('error', reject)
    stream.on('data', (c) => hash.update(c))
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

const sha256Bytes = (b: Buffer) => createHash('sha256').update(b).digest('hex')

/** lstat a path that must be a regular non-symlink file of at most maxBytes. */
async function statRegular(path: string, maxBytes: number): Promise<Stats> {
  const st = await fsp.lstat(path)
  if (st.isSymbolicLink() || !st.isFile()) {
    throw new Error(`${basename(path)} is not a regular file`)
  }
  if (st.size > maxBytes) throw new Error(`${basename(path)} is too large`)
  return st
}

function isContained(root: string, candidate: string): boolean {
  const rel = relative(root, candidate)
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

// ---------------------------------------------------------------------------
// D-09: CrossOver allowlist
// ---------------------------------------------------------------------------

// ts-prune-ignore-next
export type CrossoverAllowed = {
  appPath: string
  cxRoot: string
  binDir: string
  crossoverBuild: string
  cleanNtdllSha256: string
  row: NtdllPatchRow
  supportedBuilds: string[]
}

// ts-prune-ignore-next
export type DetectCrossoverDeps = {
  resolveCrossoverBinDir?: () => Promise<string | undefined>
  runTool?: RunTool
  findRow?: (build: string, cleanSha256: string) => NtdllPatchRow | null
  supportedBuilds?: () => string[]
  platform?: NodeJS.Platform
}

const CX_ROOT_SUFFIX = `${sep}Contents${sep}SharedSupport${sep}CrossOver`

async function defaultResolveBinDir(): Promise<string | undefined> {
  try {
    const mod = await import('backend/storeManagers/steam/crossoverLocation')
    return await mod.resolveCrossoverBinDirAsync()
  } catch {
    return undefined
  }
}

/**
 * The 'CrossOver allowlist' step. Creates nothing on disk and never calls
 * /bin/cp. Never rejects.
 */
// ts-prune-ignore-next
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
      { timeoutMs: RUNNER_TIMEOUTS.plutil }
    )
    if (plist.code !== 0 || plist.timedOut || plist.aborted) {
      return fail('cannot read CrossOver version')
    }
    const build = plist.stdout.trim()
    if (!BUILD_RE.test(build)) {
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

// ---------------------------------------------------------------------------
// D-08 / D-10: the runner clone
// ---------------------------------------------------------------------------

// 56-01-SUMMARY "Consequences for later plans": "`cp -c -R` alone is enough; no
// `-p` and no post-clone mtime restore is needed ... The `cp -R` fallback is
// still wise for non-APFS or cross-volume layouts, where the mtime must be
// re-checked." The fallback keeps -p so a plain copy preserves mtimes too.
// ts-prune-ignore-next
export const CLONE_ARGV_PRIMARY: readonly string[] = ['-c', '-R']
// ts-prune-ignore-next
export const CLONE_ARGV_FALLBACK: readonly string[] = ['-R', '-p']
// The post-clone mtime check and utimes restore are mandatory whatever cp did:
// a missing wine.inf mtime triggers a prefix update (56-01 contract).
// ts-prune-ignore-next
export const MTIME_PINNED_PATHS: readonly string[] = [
  join('share', 'wine', 'wine.inf')
]
// ts-prune-ignore-next
export const RUNNER_MARKER_FILE = 'gamelib-runner.json'
// ts-prune-ignore-next
export const DYLD_ENTITLEMENT =
  'com.apple.security.cs.allow-dyld-environment-variables'
// ts-prune-ignore-next
export const STOCK_LOADER_ENTITLEMENTS: readonly string[] = [
  'com.apple.security.cs.allow-unsigned-executable-memory',
  'com.apple.security.cs.disable-executable-page-protection',
  'com.apple.security.cs.disable-library-validation',
  'com.apple.security.device.audio-input',
  'com.apple.security.device.camera'
]

/** 56-10's `SteamclientLayerReady` is passed as is. */
// ts-prune-ignore-next
export type RunnerComponentInput = {
  componentId: string
  files: {
    lsteamclientDll: string
    lsteamclientSo: string
    detourPayload: string
  }
}

// ts-prune-ignore-next
export type RunnerReady = {
  crossoverBuild: string
  runnerDir: string
  cxRoot: string
  wrapperBin: string
  wineloaderBin: string
  wineserverBin: string
  windowsDllDir: string
  unixDllDir: string
  source: 'cache' | 'clone'
  cloneMethod?: 'cp -c' | 'cp -R'
  provenanceRemaining?: boolean
  pruned: string[]
  pruneSkipped: string[]
}

// ts-prune-ignore-next
export type RunnerCloneDeps = {
  runTool?: RunTool
  applyPatch?: (
    clean: Buffer,
    payload: Buffer,
    row: NtdllPatchRow
  ) => NtdllPatchResult
  /** 56-11 maps this to the 'Compatibility runner' progress context. */
  onCloneStart?: () => void
  timeouts?: Partial<typeof RUNNER_TIMEOUTS>
}

// ts-prune-ignore-next
export type RunnerVerifyExpect = {
  crossover: CrossoverAllowed
  component: RunnerComponentInput
}

class StepError extends Error {
  constructor(
    readonly step: DrmStep,
    message: string
  ) {
    super(message)
  }
}

const stepFail = (step: DrmStep, message: string): never => {
  throw new StepError(step, message)
}

const REMOVABLE_RE =
  /^(crossover-[0-9.]+|\.crossover-[0-9.]+\.partial-[A-Za-z0-9]+)$/
const STALE_CLONE_RE = /^crossover-[0-9]{1,4}(\.[0-9]{1,6}){2,4}$/
const STALE_PARTIAL_RE = /^\.crossover-([0-9.]+)\.partial-[A-Za-z0-9]+$/

/** The only removal path for entries directly under the runners root. */
async function safeRemove(root: string, target: string): Promise<boolean> {
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
async function removeInside(root: string, target: string): Promise<void> {
  try {
    if (isContained(root, target)) {
      await fsp.rm(target, { recursive: true, force: true })
    }
  } catch {
    // best effort
  }
}

function parseEntitlementKeys(stdout: string): string[] | null {
  const start = stdout.search(/<\?xml|<plist/)
  if (start < 0) return null
  const text = stdout.slice(start)
  const open = text.indexOf('<dict>')
  const close = text.lastIndexOf('</dict>')
  if (open < 0 || close < open) return null
  const inner = text.slice(open + '<dict>'.length, close)
  const keys: string[] = []
  const rest = inner.replace(
    /<key>([^<]{1,200})<\/key>\s*<true\/>/g,
    (_m, k: string) => {
      keys.push(k)
      return ''
    }
  )
  if (rest.trim() !== '') return null
  return keys
}

async function dumpLoaderEntitlements(
  run: RunTool,
  loader: string,
  timeoutMs: number
): Promise<string[] | null> {
  const r = await run(
    '/usr/bin/codesign',
    ['-d', '--entitlements', '-', '--xml', loader],
    { timeoutMs }
  )
  if (r.code !== 0 || r.timedOut || r.aborted) return null
  return parseEntitlementKeys(r.stdout)
}

function entitlementsPlist(): string {
  const keys = [...STOCK_LOADER_ENTITLEMENTS, DYLD_ENTITLEMENT].sort()
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n' +
    '<plist version="1.0">\n<dict>\n' +
    keys.map((k) => `\t<key>${k}</key>\n\t<true/>\n`).join('') +
    '</dict>\n</plist>\n'
  )
}

function readyFor(
  cxRoot: string,
  runnerDir: string,
  build: string,
  extra: Partial<RunnerReady>
): RunnerReady {
  return {
    crossoverBuild: build,
    runnerDir,
    cxRoot,
    wrapperBin: join(cxRoot, 'bin', 'wine'),
    wineloaderBin: join(cxRoot, 'bin', 'wineloader'),
    wineserverBin: join(cxRoot, 'bin', 'wineserver'),
    windowsDllDir: join(cxRoot, WIN_DLL_REL),
    unixDllDir: join(cxRoot, UNIX_DLL_REL),
    source: 'clone',
    pruned: [],
    pruneSkipped: [],
    ...extra
  }
}

type Marker = {
  schema: number
  crossoverBuild: string
  cleanNtdllSha256: string
  patchedNtdllSha256: string
  componentId: string
  lsteamclientDllSha256: string
  lsteamclientSoSha256: string
  loaderSha256: string
  cloneMethod?: string
  createdAt?: string
}

const sec = (ms: number) => Math.floor(ms / 1000)

/**
 * The cheap per-launch verify (RESEARCH F8, D-10). Never throws.
 */
// ts-prune-ignore-next
export async function verifyRunnerClone(
  runnerDir: string,
  expect: RunnerVerifyExpect,
  runTool: RunTool = defaultRunTool
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const bad = (reason: string) => ({ ok: false as const, reason })
  try {
    const { crossover, component } = expect
    const cx = join(runnerDir, 'CrossOver')
    for (const d of [runnerDir, cx]) {
      const st = await fsp.lstat(d)
      if (st.isSymbolicLink() || !st.isDirectory()) {
        return bad(`${basename(d)} is not a real directory`)
      }
    }

    let marker: Marker
    try {
      marker = JSON.parse(
        await fsp.readFile(join(runnerDir, RUNNER_MARKER_FILE), 'utf8')
      ) as Marker
    } catch {
      return bad('marker unreadable')
    }
    if (!marker || marker.schema !== 1) return bad('marker schema mismatch')
    if (
      marker.crossoverBuild !== crossover.crossoverBuild ||
      marker.cleanNtdllSha256 !== crossover.cleanNtdllSha256 ||
      marker.patchedNtdllSha256 !== crossover.row.patchedSha256
    ) {
      return bad('marker does not match the installed CrossOver')
    }
    if (marker.componentId !== component.componentId) {
      return bad('marker component id differs')
    }

    const link = await fsp.lstat(join(cx, 'bin'))
    if (
      !link.isSymbolicLink() ||
      (await fsp.readlink(join(cx, 'bin'))) !== 'CrossOver-Hosted Application'
    ) {
      return bad('bin symlink missing or changed')
    }
    for (const b of ['wine', 'wineloader', 'wineserver']) {
      const st = await fsp.stat(join(cx, 'bin', b))
      if (!st.isFile() || (st.mode & 0o111) === 0) {
        return bad(`bin/${b} is not executable`)
      }
    }

    const ntdll = join(cx, NTDLL_REL)
    await statRegular(ntdll, MAX_NTDLL_BYTES)
    if ((await sha256File(ntdll)) !== crossover.row.patchedSha256) {
      return bad('ntdll.dll does not match the patched hash')
    }
    const orig = ntdll + '.gamelib-orig'
    await statRegular(orig, MAX_NTDLL_BYTES)
    if ((await sha256File(orig)) !== crossover.cleanNtdllSha256) {
      return bad('ntdll.dll.gamelib-orig does not match the clean hash')
    }

    const builtins: Array<[string, string, string, number]> = [
      [
        'lsteamclient.dll',
        DLL_REL,
        component.files.lsteamclientDll,
        MAX_DLL_BYTES
      ],
      ['lsteamclient.so', SO_REL, component.files.lsteamclientSo, MAX_SO_BYTES]
    ]
    const markerHash: Record<string, string> = {
      'lsteamclient.dll': marker.lsteamclientDllSha256,
      'lsteamclient.so': marker.lsteamclientSoSha256
    }
    for (const [name, rel, src, max] of builtins) {
      const path = join(cx, rel)
      try {
        await statRegular(path, max)
      } catch {
        return bad(`${name} missing or not a regular file`)
      }
      const h = await sha256File(path)
      if (h !== markerHash[name]) return bad(`${name} differs from marker`)
      let srcHash: string
      try {
        srcHash = await sha256File(src)
      } catch {
        return bad(`${name} component file unreadable`)
      }
      if (h !== srcHash) return bad(`${name} differs from the component`)
    }

    const loader = join(cx, LOADER_REL)
    await statRegular(loader, MAX_LOADER_BYTES)
    if ((await sha256File(loader)) !== marker.loaderSha256) {
      return bad('loader differs from marker')
    }

    for (const rel of MTIME_PINNED_PATHS) {
      const a = await fsp.stat(join(cx, rel))
      const b = await fsp.stat(join(crossover.cxRoot, rel))
      if (sec(a.mtimeMs) !== sec(b.mtimeMs)) {
        return bad(`mtime of ${rel} differs from the installed copy`)
      }
    }

    const keys = await dumpLoaderEntitlements(
      runTool,
      loader,
      RUNNER_TIMEOUTS.codesign
    )
    if (!keys) return bad('loader entitlements unreadable')
    for (const k of [...STOCK_LOADER_ENTITLEMENTS, DYLD_ENTITLEMENT]) {
      if (!keys.includes(k)) return bad(`loader lacks entitlement ${k}`)
    }
    return { ok: true }
  } catch (e) {
    return bad(errText(e))
  }
}

/**
 * Lists processes. null means ps failed or timed out, which counts as in use.
 */
async function psListing(
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
async function isPathInUse(
  dir: string,
  run: RunTool,
  timeoutMs: number
): Promise<boolean> {
  const listing = await psListing(run, timeoutMs)
  return listing === null || listing.includes(dir + '/')
}

const inFlight = new Map<string, Promise<DrmStepResult<RunnerReady>>>()

/**
 * The 'runner' step. Never rejects.
 */
// ts-prune-ignore-next
export async function ensureRunnerClone(
  opts: {
    appFolder: string
    crossover: CrossoverAllowed
    component: RunnerComponentInput
  },
  deps: RunnerCloneDeps = {}
): Promise<DrmStepResult<RunnerReady>> {
  try {
    const paths = buildDrmPaths(opts.appFolder)
    const build = opts.crossover?.crossoverBuild
    const runnerDir = paths && build ? paths.runnerDir(build) : null
    if (!paths || !runnerDir)
      return drmStepError('runner-clone', 'invalid runner path')
    const existing = inFlight.get(runnerDir)
    if (existing) return await existing
    const p = runFront(opts, deps, paths.runnersRoot, runnerDir).catch(
      (e): DrmStepResult<RunnerReady> =>
        e instanceof StepError
          ? drmStepError(e.step, e.message)
          : drmStepError('runner-clone', e)
    )
    inFlight.set(runnerDir, p)
    try {
      return await p
    } finally {
      inFlight.delete(runnerDir)
    }
  } catch (e) {
    return drmStepError('runner-clone', e)
  }
}

async function runFront(
  opts: {
    appFolder: string
    crossover: CrossoverAllowed
    component: RunnerComponentInput
  },
  deps: RunnerCloneDeps,
  runnersRoot: string,
  runnerDir: string
): Promise<DrmStepResult<RunnerReady>> {
  const run = deps.runTool ?? defaultRunTool
  const timeouts = { ...RUNNER_TIMEOUTS, ...deps.timeouts }
  const { crossover, component } = opts
  const build = crossover.crossoverBuild
  const cxRoot = join(runnerDir, 'CrossOver')
  const expect = { crossover, component }

  // The runners root may be absent; do not create it yet.
  try {
    const st = await fsp.lstat(runnersRoot)
    if (st.isSymbolicLink() || !st.isDirectory()) {
      return drmStepError(
        'runner-clone',
        'runners root is not a real directory'
      )
    }
  } catch {
    // absent: buildRunner creates it
  }

  let source: 'cache' | 'clone' = 'cache'
  let built: Partial<RunnerReady> = {}
  let hasDir = false
  try {
    hasDir = (await fsp.lstat(runnerDir)) !== undefined
  } catch {
    hasDir = false
  }
  if (hasDir) {
    const v = await verifyRunnerClone(runnerDir, expect, run)
    if (!v.ok) {
      logWarning(
        `runnerClone: crossover-${build} failed verification: ${v.reason}`,
        LogPrefix.Steam
      )
      if (await isPathInUse(runnerDir, run, timeouts.ps)) {
        return drmStepError(
          'runner-clone',
          `runner clone failed verification (${v.reason}) and is in use; quit the game and retry`
        )
      }
      if (!(await safeRemove(runnersRoot, runnerDir))) {
        return drmStepError('runner-clone', 'could not remove the stale runner')
      }
      hasDir = false
    }
  }
  if (!hasDir) {
    source = 'clone'
    built = await buildRunner(opts, deps, runnersRoot, runnerDir)
    const v = await verifyRunnerClone(runnerDir, expect, run)
    if (!v.ok) {
      await safeRemove(runnersRoot, runnerDir)
      return drmStepError(
        'runner-clone',
        `fresh runner failed verification: ${v.reason}`
      )
    }
  }

  const { pruned, pruneSkipped } = await pruneStale(
    runnersRoot,
    build,
    run,
    timeouts.ps
  )
  return {
    status: 'ok',
    ...readyFor(cxRoot, runnerDir, build, {
      ...built,
      source,
      pruned,
      pruneSkipped
    })
  }
}

async function pruneStale(
  runnersRoot: string,
  build: string,
  run: RunTool,
  psTimeout: number
): Promise<{ pruned: string[]; pruneSkipped: string[] }> {
  const pruned: string[] = []
  const pruneSkipped: string[] = []
  try {
    const names = await fsp.readdir(runnersRoot)
    const stale = names.filter((n) => {
      if (STALE_CLONE_RE.test(n)) return n !== `crossover-${build}`
      const m = STALE_PARTIAL_RE.exec(n)
      if (!m) return false
      // a partial of another build that this process is building right now
      if (m[1] === build) return true
      return !Array.from(inFlight.keys()).some(
        (k) => dirname(k) === runnersRoot && basename(k) === `crossover-${m[1]}`
      )
    })
    if (stale.length === 0) return { pruned, pruneSkipped }
    const listing = await psListing(run, psTimeout)
    for (const name of stale) {
      const dir = join(runnersRoot, name)
      if (listing === null || listing.includes(dir + '/')) {
        pruneSkipped.push(name)
      } else if (await safeRemove(runnersRoot, dir)) {
        pruned.push(name)
      } else {
        pruneSkipped.push(name)
      }
    }
  } catch (e) {
    logWarning(`runnerClone: prune failed: ${errText(e)}`, LogPrefix.Steam)
  }
  return { pruned, pruneSkipped }
}

async function buildRunner(
  opts: {
    appFolder: string
    crossover: CrossoverAllowed
    component: RunnerComponentInput
  },
  deps: RunnerCloneDeps,
  runnersRoot: string,
  runnerDir: string
): Promise<Partial<RunnerReady>> {
  const run = deps.runTool ?? defaultRunTool
  const timeouts = { ...RUNNER_TIMEOUTS, ...deps.timeouts }
  const { crossover, component } = opts
  const { row } = crossover
  const build = crossover.crossoverBuild

  await fsp.mkdir(runnersRoot, { recursive: true, mode: 0o700 })
  const rootStat = await fsp.lstat(runnersRoot)
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    stepFail('runner-clone', 'runners root is not a real directory')
  }
  await fsp.chmod(runnersRoot, 0o700)

  const partial = await fsp.mkdtemp(
    join(runnersRoot, `.crossover-${build}.partial-`)
  )
  const dest = join(partial, 'CrossOver')
  try {
    // --- clone ---
    deps.onCloneStart?.()
    const abortId = `drm-runner-clone:${build}`
    const controller = createAbortController(abortId)
    const t0 = Date.now()
    let cloneMethod: 'cp -c' | 'cp -R' = 'cp -c'
    try {
      const first = await run(
        '/bin/cp',
        [...CLONE_ARGV_PRIMARY, crossover.cxRoot, dest],
        { timeoutMs: timeouts.cp, signal: controller.signal }
      )
      let last = first
      if (first.code !== 0 && !first.timedOut && !first.aborted) {
        await removeInside(partial, dest)
        cloneMethod = 'cp -R'
        last = await run(
          '/bin/cp',
          [...CLONE_ARGV_FALLBACK, crossover.cxRoot, dest],
          { timeoutMs: timeouts.cp, signal: controller.signal }
        )
        if (last.code !== 0 && !last.timedOut && !last.aborted) {
          stepFail(
            'runner-clone',
            `clone failed (cp -c ${first.code}, cp -R ${last.code}): ${(last.stderr || first.stderr).slice(0, 120)}`
          )
        }
      }
      if (last.timedOut) stepFail('runner-clone', 'clone timed out')
      if (last.aborted) stepFail('runner-clone', 'clone aborted')
      if (last.code !== 0)
        stepFail('runner-clone', `clone failed (cp ${last.code})`)
    } finally {
      deleteAbortController(abortId)
    }
    logInfo(
      `runnerClone: crossover-${build} cloned with ${cloneMethod} in ${Date.now() - t0} ms`,
      LogPrefix.Steam
    )

    // --- clone checks ---
    const link = await fsp.lstat(join(dest, 'bin'))
    if (
      !link.isSymbolicLink() ||
      (await fsp.readlink(join(dest, 'bin'))) !== 'CrossOver-Hosted Application'
    ) {
      stepFail('runner-clone', 'clone bin symlink missing or changed')
    }
    for (const rel of [
      join('bin', 'wine'),
      join('bin', 'wineloader'),
      join('bin', 'wineserver'),
      LOADER_REL
    ]) {
      const st = await fsp.stat(join(dest, rel))
      if (!st.isFile() || (st.mode & 0o111) === 0) {
        stepFail('runner-clone', `${rel} missing or not executable`)
      }
    }
    const ntdll = join(dest, NTDLL_REL)
    await statRegular(ntdll, MAX_NTDLL_BYTES)
    if ((await sha256File(ntdll)) !== crossover.cleanNtdllSha256) {
      stepFail('runner-clone', 'cloned ntdll differs from the installed one')
    }
    for (const rel of MTIME_PINNED_PATHS) {
      const srcSt = await fsp.stat(join(crossover.cxRoot, rel))
      const cloneFile = join(dest, rel)
      let st = await fsp.stat(cloneFile)
      if (sec(st.mtimeMs) !== sec(srcSt.mtimeMs)) {
        await fsp.utimes(cloneFile, srcSt.atime, srcSt.mtime)
        st = await fsp.stat(cloneFile)
        if (sec(st.mtimeMs) !== sec(srcSt.mtimeMs)) {
          stepFail('runner-clone', `mtime of ${rel} not preserved`)
        }
      }
    }

    // --- ntdll patch (runner-patch) ---
    const cleanBytes = await fsp.readFile(ntdll)
    let payload: Buffer
    try {
      await statRegular(component.files.detourPayload, row.sectionRawSize)
      payload = await fsp.readFile(component.files.detourPayload)
    } catch (e) {
      return stepFail('runner-patch', `detour payload: ${errText(e)}`)
    }
    const res = (deps.applyPatch ?? applyNtdllPatch)(cleanBytes, payload, row)
    if (res.status !== 'patched') stepFail('runner-patch', res.reason)
    const patched = (res as { bytes: Buffer }).bytes
    if (sha256Bytes(patched) !== row.patchedSha256) {
      stepFail('runner-patch', 'patched ntdll does not match the pinned hash')
    }
    await fsp.writeFile(ntdll + '.gamelib-orig', cleanBytes, {
      flag: 'wx',
      mode: 0o644
    })
    const tmp = ntdll + '.gamelib-tmp'
    await fsp.writeFile(tmp, patched, { flag: 'wx', mode: 0o644 })
    await fsp.rename(tmp, ntdll)
    if ((await sha256File(ntdll)) !== row.patchedSha256) {
      stepFail('runner-patch', 'written ntdll does not match the pinned hash')
    }

    // --- builtins (runner-patch) ---
    const dllTarget = join(dest, DLL_REL)
    const soTarget = join(dest, SO_REL)
    const hashes: string[] = []
    for (const [src, target, max] of [
      [component.files.lsteamclientDll, dllTarget, MAX_DLL_BYTES],
      [component.files.lsteamclientSo, soTarget, MAX_SO_BYTES]
    ] as Array<[string, string, number]>) {
      try {
        await statRegular(src, max)
      } catch (e) {
        stepFail('runner-patch', `component file: ${errText(e)}`)
      }
      await fsp.copyFile(src, target, fsConstants.COPYFILE_EXCL)
      await fsp.chmod(target, 0o644)
      const h = await sha256File(target)
      if (h !== (await sha256File(src))) {
        stepFail(
          'runner-patch',
          `${basename(target)} copy differs from component`
        )
      }
      hashes.push(h)
    }
    const rm = await run(
      '/usr/bin/codesign',
      ['--remove-signature', soTarget],
      {
        timeoutMs: timeouts.codesign
      }
    )
    if (rm.code !== 0 && !/not signed/i.test(rm.stderr)) {
      stepFail(
        'runner-patch',
        `codesign --remove-signature failed (${rm.code})`
      )
    }
    const dv = await run('/usr/bin/codesign', ['-dv', soTarget], {
      timeoutMs: timeouts.codesign
    })
    if (dv.code === 0 || !/not signed at all/i.test(dv.stderr)) {
      stepFail('runner-patch', 'lsteamclient.so is signed')
    }
    if ((await sha256File(soTarget)) !== hashes[1]) {
      stepFail(
        'runner-patch',
        'lsteamclient.so changed after signature removal'
      )
    }

    // --- loader re-sign (runner-patch) ---
    const loader = join(dest, LOADER_REL)
    await fsp.copyFile(
      loader,
      loader + '.gamelib-orig',
      fsConstants.COPYFILE_EXCL
    )
    const stock = await dumpLoaderEntitlements(run, loader, timeouts.codesign)
    if (!stock) stepFail('runner-patch', 'loader entitlements unreadable')
    const sorted = [...(stock as string[])].sort().join('\n')
    const stockSet = [...STOCK_LOADER_ENTITLEMENTS].sort()
    const sixSet = [...stockSet, DYLD_ENTITLEMENT].sort()
    if (sorted !== stockSet.join('\n') && sorted !== sixSet.join('\n')) {
      stepFail('runner-patch', 'unexpected loader entitlements')
    }
    const plist = join(partial, 'loader-entitlements.plist')
    await fsp.writeFile(plist, entitlementsPlist(), { flag: 'wx', mode: 0o600 })
    const sign = await run(
      '/usr/bin/codesign',
      [
        '--force',
        '--sign',
        '-',
        '--options',
        'runtime',
        '--entitlements',
        plist,
        loader
      ],
      { timeoutMs: timeouts.codesign }
    )
    if (sign.code !== 0) {
      stepFail(
        'runner-patch',
        `loader re-sign failed (${sign.code}): ${sign.stderr.slice(0, 80)}`
      )
    }
    const after = await dumpLoaderEntitlements(run, loader, timeouts.codesign)
    if (!after || !sixSet.every((k) => after.includes(k))) {
      stepFail(
        'runner-patch',
        'loader lacks the dyld entitlement after re-sign'
      )
    }
    await removeInside(partial, plist)

    // --- scrub (runner-clone) ---
    // Never `xattr -c`: it would strip com.apple.cs.* signature xattrs.
    for (const attr of ['com.apple.quarantine', 'com.apple.provenance']) {
      const r = await run('/usr/bin/xattr', ['-r', '-d', attr, dest], {
        timeoutMs: timeouts.xattr
      })
      if (r.timedOut || r.aborted)
        stepFail('runner-clone', `xattr ${attr} scrub timed out`)
    }
    let provenanceRemaining = false
    for (const rel of [
      LOADER_REL,
      NTDLL_REL,
      SO_REL,
      DLL_REL,
      join('bin', 'wineloader')
    ]) {
      const r = await run('/usr/bin/xattr', [join(dest, rel)], {
        timeoutMs: timeouts.xattr
      })
      const lines = r.stdout.split('\n').map((l) => l.trim())
      if (lines.includes('com.apple.quarantine')) {
        stepFail('runner-clone', `quarantine xattr remains on ${rel}`)
      }
      if (lines.includes('com.apple.provenance')) provenanceRemaining = true
    }
    if (provenanceRemaining) {
      logWarning(
        `runnerClone: com.apple.provenance remains on crossover-${build} (tolerated)`,
        LogPrefix.Steam
      )
    }

    // --- marker and atomic rename ---
    const marker: Marker = {
      schema: 1,
      crossoverBuild: build,
      cleanNtdllSha256: crossover.cleanNtdllSha256,
      patchedNtdllSha256: row.patchedSha256,
      componentId: component.componentId,
      lsteamclientDllSha256: hashes[0],
      lsteamclientSoSha256: hashes[1],
      loaderSha256: await sha256File(loader),
      cloneMethod,
      createdAt: new Date().toISOString()
    }
    await fsp.writeFile(
      join(partial, RUNNER_MARKER_FILE),
      JSON.stringify(marker, null, 2),
      { flag: 'wx', mode: 0o600 }
    )
    try {
      await fsp.rename(partial, runnerDir)
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code
      if (code === 'EEXIST' || code === 'ENOTEMPTY') {
        stepFail('runner-clone', 'runner dir appeared concurrently')
      }
      throw e
    }
    return { cloneMethod, provenanceRemaining }
  } finally {
    await safeRemove(runnersRoot, partial)
  }
}
