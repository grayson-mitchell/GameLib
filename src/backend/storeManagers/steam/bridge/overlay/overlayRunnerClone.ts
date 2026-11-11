/**
 * Phase 60 plan 05 (D-04, D-06, D-08): the overlay-only CrossOver clone.
 *
 * TCP-mode games need dyld injection through `CX_ENV`, which only works on a
 * runner whose two loaders (`bin/wineloader` and `lib/wine/x86_64-unix/wine`)
 * allow dyld env. The user's CrossOver is only ever read; this module builds an
 * unpatched APFS clone of the inner SharedSupport/CrossOver under
 * `<appFolder>/steam-bridge/overlay/runners/crossover-<build>/CrossOver` and
 * re-signs both loaders there.
 *
 * D-04 deliberately differs from the DRM clone: derived entitlements (every
 * dumped stock key plus the dyld one) instead of the strict 5-key check,
 * because D-06 attempts any CrossOver and a future build may change the stock
 * set (RESEARCH Pattern 1.3). There is no allowlist and no patching.
 *
 * It never re-signs inside a `.app`; it clones only the inner
 * SharedSupport/CrossOver (spike 062 Gatekeeper -67018). The xattr scrub is
 * targeted, not `xattr -cr` (orchestrator resolution 5; deviation from CONTEXT
 * D-04's wording). The overlay root is a sibling of the DRM root; neither
 * prunes the other.
 *
 * Every spawn goes through RunTool, which uses
 * createFakeHomeProfile. Nothing runs at import. Nothing here rejects: every
 * failure is an OverlayStepError ('crossover-detect' | 'clone' | 'resign', D-08).
 */
import { promises as fsp } from 'fs'
import { basename, dirname, join, sep } from 'path'

import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import {
  CROSSOVER_BUILD_RE,
  CX_ROOT_SUFFIX,
  LOADER_REL,
  MAX_LOADER_BYTES,
  RUNNER_TIMEOUTS,
  WINELOADER_REL,
  defaultResolveBinDir,
  isContained,
  isPathInUse,
  psListing,
  readCrossoverBundleVersion,
  safeRemove,
  sha256File,
  statRegular
} from '../drm/runnerCrossover'
import { cloneCrossoverTree } from '../drm/runnerClone'
import { RUNNER_MARKER_FILE } from '../drm/runnerVerify'
import {
  DYLD_ENTITLEMENT,
  dumpLoaderEntitlements,
  resignLoader,
  scrubCloneXattrs
} from '../drm/runnerEntitlements'
import type { RunTool } from 'backend/engine/runTool'
import type { EngineRuntime } from 'backend/engine/engineRuntime'
import type { ProcessRunner } from 'backend/process/types'
import {
  overlayStepError,
  type OverlayStepError,
  type OverlayStepResult
} from './overlayNotice'
import { buildOverlayPaths } from './overlayPaths'

export type OverlayCrossover = {
  appPath: string
  cxRoot: string
  binDir: string
  crossoverBuild: string
}

export const OVERLAY_MARKER_SCHEMA = 'overlay-1'

type OverlayMarker = {
  schema: string
  crossoverBuild: string
  wineLoaderSha256: string
  wineloaderSha256: string
  sourceWineLoaderSha256: string
  sourceWineloaderSha256: string
  cloneMethod: string
  createdAt: string
}

const MAX_MARKER_BYTES = 64 * 1024

export type OverlayRunnerReady = {
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
}

type OverlayDeps = {
  runTool: RunTool
  timeouts?: Partial<typeof RUNNER_TIMEOUTS>
  onCloneStart?: () => void
}

const REMOVABLE_RE =
  /^(crossover-[0-9.]+|\.crossover-[0-9.]+\.partial-[A-Za-z0-9]+)$/
const STALE_CLONE_RE = /^crossover-[0-9]{1,4}(\.[0-9]{1,6}){2,4}$/
const STALE_PARTIAL_RE = /^\.crossover-([0-9.]+)\.partial-[A-Za-z0-9]+$/

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

class StepError extends Error {
  constructor(
    readonly step: OverlayStepError['step'],
    message: string
  ) {
    super(message)
  }
}

/**
 * The 'crossover-detect' step. Creates nothing on disk. No allowlist (D-06):
 * any CFBundleVersion matching the build pattern is attempted. Never rejects.
 */
export async function detectCrossoverForOverlay(
  opts: { appFolder: string; crossoverBinDir?: string },
  deps: {
    resolveCrossoverBinDir?: () => Promise<string | undefined>
    runTool: RunTool
    runner: Pick<ProcessRunner, 'run'>
    engineRuntime: Pick<EngineRuntime, 'crossover'>
    platform?: NodeJS.Platform
  }
): Promise<OverlayStepResult<{ crossover: OverlayCrossover }>> {
  const fail = (cause: string) => overlayStepError('crossover-detect', cause)
  try {
    if ((deps.platform ?? process.platform) !== 'darwin') {
      return fail('overlay is macOS only')
    }
    const binDir =
      opts.crossoverBinDir ??
      (await (
        deps.resolveCrossoverBinDir ?? (() => defaultResolveBinDir(deps))
      )())
    if (!binDir) return fail('CrossOver not found')
    if (!binDir.endsWith(`${CX_ROOT_SUFFIX}${sep}bin`)) {
      return fail('unexpected CrossOver location')
    }
    const cxRoot = dirname(binDir)
    const appPath = cxRoot.slice(0, cxRoot.length - CX_ROOT_SUFFIX.length)
    if (!appPath.endsWith('.app')) return fail('unexpected CrossOver location')
    const paths = buildOverlayPaths(opts.appFolder)
    if (
      paths &&
      (cxRoot === paths.runnersRoot || isContained(paths.runnersRoot, cxRoot))
    ) {
      return fail('CrossOver path is inside the overlay runners directory')
    }
    const version = await readCrossoverBundleVersion(
      deps.runTool,
      appPath,
      RUNNER_TIMEOUTS.plutil
    )
    if (version.status === 'unreadable') {
      return fail('cannot read CrossOver version')
    }
    if (version.status === 'invalid') {
      return fail(
        `unrecognised CrossOver version ${version.value.slice(0, 40)}`
      )
    }
    return {
      status: 'ok',
      crossover: {
        appPath,
        cxRoot,
        binDir,
        crossoverBuild: version.value
      }
    }
  } catch (e) {
    return fail(errText(e))
  }
}

function readyFor(
  runnerDir: string,
  build: string,
  extra: Pick<
    OverlayRunnerReady,
    'source' | 'cloneMethod' | 'provenanceRemaining'
  >
): OverlayRunnerReady {
  const cxRoot = join(runnerDir, 'CrossOver')
  return {
    crossoverBuild: build,
    runnerDir,
    cxRoot,
    wrapperBin: join(cxRoot, 'bin', 'wine'),
    wineloaderBin: join(cxRoot, 'bin', 'wineloader'),
    wineserverBin: join(cxRoot, 'bin', 'wineserver'),
    windowsDllDir: join(cxRoot, 'lib', 'wine', 'x86_64-windows'),
    unixDllDir: join(cxRoot, 'lib', 'wine', 'x86_64-unix'),
    ...extra
  }
}

/**
 * Per-launch verification: marker, clone loader hashes, source loader hashes
 * and the dyld entitlement on both clone loaders. Never throws.
 */
export async function verifyOverlayRunnerClone(
  runnerDir: string,
  crossover: OverlayCrossover,
  run: RunTool
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const bad = (reason: string) => ({ ok: false as const, reason })
  try {
    const markerPath = join(runnerDir, RUNNER_MARKER_FILE)
    await statRegular(markerPath, MAX_MARKER_BYTES)
    const m = JSON.parse(
      await fsp.readFile(markerPath, 'utf8')
    ) as OverlayMarker
    if (m.schema !== OVERLAY_MARKER_SCHEMA) return bad('marker schema changed')
    if (m.crossoverBuild !== crossover.crossoverBuild) {
      return bad('marker build differs')
    }
    const cloneRoot = join(runnerDir, 'CrossOver')
    const pairs: Array<[string, string, string, string]> = [
      [LOADER_REL, m.wineLoaderSha256, m.sourceWineLoaderSha256, 'wine loader'],
      [
        WINELOADER_REL,
        m.wineloaderSha256,
        m.sourceWineloaderSha256,
        'wineloader'
      ]
    ]
    for (const [rel, cloneSha, srcSha, label] of pairs) {
      await statRegular(join(cloneRoot, rel), MAX_LOADER_BYTES)
      if ((await sha256File(join(cloneRoot, rel))) !== cloneSha) {
        return bad(`${label} changed since it was signed`)
      }
      const src = join(crossover.cxRoot, rel)
      await statRegular(src, MAX_LOADER_BYTES)
      if ((await sha256File(src)) !== srcSha) {
        return bad(`installed ${label} differs from the one cloned`)
      }
      const keys = await dumpLoaderEntitlements(
        run,
        join(cloneRoot, rel),
        RUNNER_TIMEOUTS.codesign
      )
      if (!keys || !keys.includes(DYLD_ENTITLEMENT)) {
        return bad(`${label} lacks the dyld entitlement`)
      }
    }
    return { ok: true }
  } catch (e) {
    return bad(errText(e))
  }
}

const inFlight = new Map<
  string,
  Promise<OverlayStepResult<{ runner: OverlayRunnerReady }>>
>()

/**
 * The 'clone' / 'resign' steps. Never rejects.
 */
export async function ensureOverlayRunnerClone(
  opts: { appFolder: string; crossover: OverlayCrossover },
  deps: OverlayDeps
): Promise<OverlayStepResult<{ runner: OverlayRunnerReady }>> {
  try {
    const paths = buildOverlayPaths(opts.appFolder)
    const build = opts.crossover?.crossoverBuild
    const runnerDir = paths && build ? paths.runnerDir(build) : null
    if (!paths || !runnerDir) {
      return overlayStepError('clone', 'invalid overlay runner path')
    }
    const existing = inFlight.get(runnerDir)
    if (existing) return await existing
    const p = runFront(
      opts.crossover,
      deps,
      paths.runnersRoot,
      runnerDir
    ).catch(
      (e): OverlayStepError =>
        e instanceof StepError
          ? overlayStepError(e.step, e.message)
          : overlayStepError('clone', e)
    )
    inFlight.set(runnerDir, p)
    try {
      return await p
    } finally {
      inFlight.delete(runnerDir)
    }
  } catch (e) {
    return overlayStepError('clone', e)
  }
}

async function runFront(
  crossover: OverlayCrossover,
  deps: OverlayDeps,
  runnersRoot: string,
  runnerDir: string
): Promise<OverlayStepResult<{ runner: OverlayRunnerReady }>> {
  const run = deps.runTool
  const timeouts = { ...RUNNER_TIMEOUTS, ...deps.timeouts }
  const build = crossover.crossoverBuild

  try {
    const st = await fsp.lstat(runnersRoot)
    if (st.isSymbolicLink() || !st.isDirectory()) {
      return overlayStepError('clone', 'runners root is not a real directory')
    }
  } catch {
    // absent: built below
  }

  let hasDir = false
  try {
    hasDir = (await fsp.lstat(runnerDir)) !== undefined
  } catch {
    hasDir = false
  }
  if (hasDir) {
    const v = await verifyOverlayRunnerClone(runnerDir, crossover, run)
    if (v.ok) {
      await pruneStale(runnersRoot, build, run, timeouts.ps)
      return {
        status: 'ok',
        runner: readyFor(runnerDir, build, { source: 'cache' })
      }
    }
    logWarning(
      `overlayRunnerClone: crossover-${build} failed verification: ${v.reason}`,
      LogPrefix.Steam
    )
    if (await isPathInUse(runnerDir, run, timeouts.ps)) {
      return overlayStepError(
        'clone',
        `overlay runner in use (${v.reason}): quit the game and retry`
      )
    }
    if (!(await safeRemoveOverlay(runnersRoot, runnerDir))) {
      return overlayStepError(
        'clone',
        'could not remove the stale overlay runner'
      )
    }
  }

  const built = await buildRunner(crossover, deps, runnersRoot, runnerDir)
  const v = await verifyOverlayRunnerClone(runnerDir, crossover, run)
  if (!v.ok) {
    await safeRemoveOverlay(runnersRoot, runnerDir)
    return overlayStepError(
      'clone',
      `fresh overlay runner failed verification: ${v.reason}`
    )
  }
  await pruneStale(runnersRoot, build, run, timeouts.ps)
  return {
    status: 'ok',
    runner: readyFor(runnerDir, build, { source: 'clone', ...built })
  }
}

// safeRemove already checks containment, depth and name shape; the local regex
// only documents which names this module may ever remove.
async function safeRemoveOverlay(
  root: string,
  target: string
): Promise<boolean> {
  if (!REMOVABLE_RE.test(basename(target))) return false
  return safeRemove(root, target)
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
      } else if (await safeRemoveOverlay(runnersRoot, dir)) {
        pruned.push(name)
      } else {
        pruneSkipped.push(name)
      }
    }
  } catch (e) {
    logWarning(
      `overlayRunnerClone: prune failed: ${errText(e)}`,
      LogPrefix.Steam
    )
  }
  return { pruned, pruneSkipped }
}

async function buildRunner(
  crossover: OverlayCrossover,
  deps: OverlayDeps,
  runnersRoot: string,
  runnerDir: string
): Promise<Pick<OverlayRunnerReady, 'cloneMethod' | 'provenanceRemaining'>> {
  const run = deps.runTool
  const timeouts = { ...RUNNER_TIMEOUTS, ...deps.timeouts }
  const build = crossover.crossoverBuild
  if (!CROSSOVER_BUILD_RE.test(build)) {
    throw new StepError('clone', 'invalid CrossOver build')
  }

  await fsp.mkdir(runnersRoot, { recursive: true, mode: 0o700 })
  const rootStat = await fsp.lstat(runnersRoot)
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw new StepError('clone', 'runners root is not a real directory')
  }
  await fsp.chmod(runnersRoot, 0o700)

  const partial = await fsp.mkdtemp(
    join(runnersRoot, `.crossover-${build}.partial-`)
  )
  const dest = join(partial, 'CrossOver')
  try {
    deps.onCloneStart?.()
    const t0 = Date.now()
    const cloned = await cloneCrossoverTree(run, crossover.cxRoot, dest, {
      abortId: `overlay-runner-clone:${build}`,
      timeoutMs: timeouts.cp,
      partial
    })
    if (!cloned.ok) throw new StepError('clone', cloned.cause)
    logInfo(
      `overlayRunnerClone: crossover-${build} cloned with ${cloned.cloneMethod} in ${Date.now() - t0} ms`,
      LogPrefix.Steam
    )

    const link = await fsp.lstat(join(dest, 'bin'))
    if (
      !link.isSymbolicLink() ||
      (await fsp.readlink(join(dest, 'bin'))) !== 'CrossOver-Hosted Application'
    ) {
      throw new StepError('clone', 'clone bin symlink missing or changed')
    }
    for (const rel of [
      join('bin', 'wine'),
      join('bin', 'wineloader'),
      join('bin', 'wineserver'),
      LOADER_REL
    ]) {
      const st = await fsp.stat(join(dest, rel))
      if (!st.isFile() || (st.mode & 0o111) === 0) {
        throw new StepError('clone', `${rel} missing or not executable`)
      }
    }

    // Source hashes are taken after the copy and before any re-sign.
    const sourceLoader = await sha256File(join(crossover.cxRoot, LOADER_REL))
    const sourceWineloader = await sha256File(
      join(crossover.cxRoot, WINELOADER_REL)
    )

    const loader = join(dest, LOADER_REL)
    const wineloader = join(dest, WINELOADER_REL)
    for (const target of [loader, wineloader]) {
      const signed = await resignLoader(
        run,
        target,
        partial,
        timeouts.codesign,
        'derived'
      )
      if (!signed.ok) throw new StepError('resign', signed.cause)
    }

    const scrubbed = await scrubCloneXattrs(run, dest, timeouts.xattr)
    if (!scrubbed.ok) throw new StepError('clone', scrubbed.cause)
    if (scrubbed.provenanceRemaining) {
      logWarning(
        `overlayRunnerClone: com.apple.provenance remains on crossover-${build} (tolerated)`,
        LogPrefix.Steam
      )
    }

    const marker: OverlayMarker = {
      schema: OVERLAY_MARKER_SCHEMA,
      crossoverBuild: build,
      wineLoaderSha256: await sha256File(loader),
      wineloaderSha256: await sha256File(wineloader),
      sourceWineLoaderSha256: sourceLoader,
      sourceWineloaderSha256: sourceWineloader,
      cloneMethod: cloned.cloneMethod,
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
        throw new StepError('clone', 'overlay runner dir appeared concurrently')
      }
      throw e
    }
    return {
      cloneMethod: cloned.cloneMethod,
      provenanceRemaining: scrubbed.provenanceRemaining
    }
  } finally {
    await safeRemoveOverlay(runnersRoot, partial)
  }
}
