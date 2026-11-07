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
import { constants as fsConstants, promises as fsp } from 'fs'
import { basename, dirname, join } from 'path'

import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { defaultRunTool, type RunTool } from 'backend/engine/runTool'
import {
  createAbortController,
  deleteAbortController
} from 'backend/utils/aborthandler/aborthandler'
import { buildDrmPaths } from './drmPaths'
import { applyNtdllPatch, type NtdllPatchResult } from './ntdllPatch'
import type { NtdllPatchRow } from './ntdllPatchTable'
import {
  DLL_REL,
  LOADER_REL,
  MAX_DLL_BYTES,
  MAX_NTDLL_BYTES,
  MAX_SO_BYTES,
  NTDLL_REL,
  RUNNER_TIMEOUTS,
  SO_REL,
  WINELOADER_REL,
  errText,
  isPathInUse,
  psListing,
  removeInside,
  safeRemove,
  sha256Bytes,
  sha256File,
  statRegular,
  type CrossoverAllowed
} from './runnerCrossover'
import { resignLoader, scrubCloneXattrs } from './runnerEntitlements'
import {
  MTIME_PINNED_PATHS,
  RUNNER_MARKER_FILE,
  readyFor,
  sec,
  verifyRunnerClone,
  type Marker,
  type RunnerComponentInput,
  type RunnerReady
} from './runnerVerify'
import {
  drmStepError,
  type DrmStep,
  type DrmStepResult
} from './steamclientLayerMode'

// ---------------------------------------------------------------------------
// D-08 / D-10: the runner clone
// ---------------------------------------------------------------------------

// 56-01-SUMMARY "Consequences for later plans": "`cp -c -R` alone is enough; no
// `-p` and no post-clone mtime restore is needed ... The `cp -R` fallback is
// still wise for non-APFS or cross-volume layouts, where the mtime must be
// re-checked." The fallback keeps -p so a plain copy preserves mtimes too.
export const CLONE_ARGV_PRIMARY: readonly string[] = ['-c', '-R']
export const CLONE_ARGV_FALLBACK: readonly string[] = ['-R', '-p']

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

const STALE_CLONE_RE = /^crossover-[0-9]{1,4}(\.[0-9]{1,6}){2,4}$/
const STALE_PARTIAL_RE = /^\.crossover-([0-9.]+)\.partial-[A-Za-z0-9]+$/

const inFlight = new Map<string, Promise<DrmStepResult<RunnerReady>>>()

/**
 * The 'runner' step. Never rejects.
 */
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
  if (built.wineloaderResigned === undefined) {
    try {
      const m = JSON.parse(
        await fsp.readFile(join(runnerDir, RUNNER_MARKER_FILE), 'utf8')
      ) as Marker
      built = { ...built, wineloaderResigned: m.wineloaderResigned === true }
    } catch {
      // verify just read it; treat a race as not re-signed
      built = { ...built, wineloaderResigned: false }
    }
  }
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

/**
 * Clones a CrossOver tree: cp -c -R (APFS clonefile), then cp -R -p as the
 * fallback. Registers an abort controller under opts.abortId. Never throws.
 */
export async function cloneCrossoverTree(
  run: RunTool,
  src: string,
  dest: string,
  opts: { abortId: string; timeoutMs: number; partial: string }
): Promise<
  { ok: true; cloneMethod: 'cp -c' | 'cp -R' } | { ok: false; cause: string }
> {
  const controller = createAbortController(opts.abortId)
  let cloneMethod: 'cp -c' | 'cp -R' = 'cp -c'
  try {
    const first = await run('/bin/cp', [...CLONE_ARGV_PRIMARY, src, dest], {
      timeoutMs: opts.timeoutMs,
      signal: controller.signal
    })
    let last = first
    if (first.code !== 0 && !first.timedOut && !first.aborted) {
      await removeInside(opts.partial, dest)
      cloneMethod = 'cp -R'
      last = await run('/bin/cp', [...CLONE_ARGV_FALLBACK, src, dest], {
        timeoutMs: opts.timeoutMs,
        signal: controller.signal
      })
      if (last.code !== 0 && !last.timedOut && !last.aborted) {
        return {
          ok: false,
          cause: `clone failed (cp -c ${first.code}, cp -R ${last.code}): ${(last.stderr || first.stderr).slice(0, 120)}`
        }
      }
    }
    if (last.timedOut) return { ok: false, cause: 'clone timed out' }
    if (last.aborted) return { ok: false, cause: 'clone aborted' }
    if (last.code !== 0) {
      return { ok: false, cause: `clone failed (cp ${last.code})` }
    }
    return { ok: true, cloneMethod }
  } catch (e) {
    return { ok: false, cause: errText(e) }
  } finally {
    deleteAbortController(opts.abortId)
  }
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
    const t0 = Date.now()
    const cloned = await cloneCrossoverTree(run, crossover.cxRoot, dest, {
      abortId: `drm-runner-clone:${build}`,
      timeoutMs: timeouts.cp,
      partial
    })
    if (!cloned.ok) return stepFail('runner-clone', cloned.cause)
    const cloneMethod = cloned.cloneMethod
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
    const [dllHash, soHash] = hashes
    if (dllHash === undefined || soHash === undefined) {
      return stepFail('runner-patch', 'component file hashes missing')
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
    if ((await sha256File(soTarget)) !== soHash) {
      stepFail(
        'runner-patch',
        'lsteamclient.so changed after signature removal'
      )
    }

    // --- loader re-sign (runner-patch) ---
    const loader = join(dest, LOADER_REL)
    const signed = await resignLoader(
      run,
      loader,
      partial,
      timeouts.codesign,
      'strict'
    )
    if (!signed.ok) stepFail('runner-patch', signed.cause)

    // --- bin/wineloader re-sign (best effort, D-05 vs D-08) ---
    // bin/wine execs bin/wineloader first, and that loader strips DYLD_*
    // unless re-signed. A failure here only costs the overlay tokens.
    const wineloader = join(dest, WINELOADER_REL)
    const wl = await resignLoader(
      run,
      wineloader,
      partial,
      timeouts.codesign,
      'strict'
    )
    let wineloaderResigned = true
    if (!wl.ok) {
      wineloaderResigned = false
      logWarning(
        `runnerClone: crossover-${build} wineloader re-sign skipped: ${wl.cause} (overlay tokens will be omitted, D-08)`,
        LogPrefix.Steam
      )
      const orig = wineloader + '.gamelib-orig'
      try {
        // a half-signed loader must not ship
        await fsp.copyFile(orig, wineloader)
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
          stepFail(
            'runner-patch',
            `wineloader restore failed after re-sign skip: ${errText(e)}`
          )
        }
      }
      await removeInside(partial, orig)
    }

    // --- scrub (runner-clone) ---
    const scrubbed = await scrubCloneXattrs(run, dest, timeouts.xattr)
    if (!scrubbed.ok) stepFail('runner-clone', scrubbed.cause)
    const provenanceRemaining = (scrubbed as { provenanceRemaining: boolean })
      .provenanceRemaining
    if (provenanceRemaining) {
      logWarning(
        `runnerClone: com.apple.provenance remains on crossover-${build} (tolerated)`,
        LogPrefix.Steam
      )
    }

    // --- marker and atomic rename ---
    const marker: Marker = {
      schema: 2,
      crossoverBuild: build,
      cleanNtdllSha256: crossover.cleanNtdllSha256,
      patchedNtdllSha256: row.patchedSha256,
      componentId: component.componentId,
      lsteamclientDllSha256: dllHash,
      lsteamclientSoSha256: soHash,
      loaderSha256: await sha256File(loader),
      wineloaderSha256: await sha256File(wineloader),
      wineloaderResigned,
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
    return { cloneMethod, provenanceRemaining, wineloaderResigned }
  } finally {
    await safeRemove(runnersRoot, partial)
  }
}
