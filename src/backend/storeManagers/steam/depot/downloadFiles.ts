// Depot file download loop: healReconciledFileModes + downloadDepotFiles (extracted from ../depot.ts, 62-10).

import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { resolve } from 'path'
import { getFileSize, sendProgressUpdate } from 'backend/utils'
import { type LzmaModule, type OnChunkAttempt } from './decompress'
import { HostHealthTracker } from './hostHealth'
import { StallTracker } from './stallTracker'
// debug/depot-stall-bound-did-not-fire, W-2: type-only — the run-scoped
// give-up below stamps the DownloadManager watchdog's existing stall marker
// so both no-progress bounds classify and render through one contract.
import type { StallError } from 'backend/downloadmanager/installStallWatchdog'
import { InflightLimiter } from './inflightLimiter'
import { DecompressPool } from './decompressPool'
import { reconcilePartialState, verifyStructuralIntegrity } from './reconcile'
import { summarizeDepotFlags, formatDepotFlagsCensus } from './flagsCensus'
import {
  DIRECTORY_FLAG,
  SYMLINK_FLAG,
  FAILURE_LOG_CAP,
  describeDepotFailure,
  type DepotModeCounters,
  type DepotPlanFile,
  type DepotPlan
} from './planModel'
import { applyMachOExecutableFallback } from './machO'
import {
  FILE_CONCURRENCY,
  TARGET_INFLIGHT_CHUNKS,
  formatEta,
  PROGRESS_THROTTLE_MS,
  PROGRESS_THROTTLE_PERCENT,
  PROGRESS_HEARTBEAT_MS,
  rollingRateMiBs,
  resolveContainedPath,
  type DownloadDepotFilesOpts,
  type DepotDownloadFailure,
  type DepotDownloadResult,
  downloadSingleFile,
  applyEDepotFileModes
} from './download'

/**
 * Re-applies EDepotFileFlag modes to every reconciled (skipped-download) file
 * in `plan` that is not in `jobFiles` — heals a prior session that sha1-
 * verified a file's CONTENT as complete but never actually ran (or never
 * finished) mode application for it. Exported and shared by BOTH
 * `downloadDepotFiles`' own post-reconciliation heal step (fresh-install/
 * live-resume path) AND `library.ts`'s startup-resume path
 * (`buildResumeFinalizeOpts`, Phase 23 code-review CR-01 gap closure) so the
 * two callers can never silently diverge on this discipline — mirrors
 * `canWriteFullOwnership`'s own single-source-of-truth rule.
 *
 * Directory(64)/Symlink(512) manifest entries are explicitly skipped — the
 * same early-return guard `downloadSingleFile` itself applies before ever
 * reaching mode application (23-code-review WR-01): a directory or symlink
 * path must never be handed to chmod/attrib.exe, since `file.flags` is
 * truthy for those entries too (e.g. `Directory | ReadOnly` = 72) and a
 * `chmod(dirPath, 0o444)` would strip a directory's traversable bit.
 *
 * `counters` (23-06, G-23-02 trace instrumentation) is an OPTIONAL trailing
 * param — omitting it (library.ts's own startup-resume call site, unchanged
 * by this plan) leaves behavior byte-for-byte identical; `downloadDepotFiles`
 * threads its own per-run counters through here so the download-complete
 * census also reflects modes applied while healing reconciled files.
 *
 * G-23-02 (23-08 Task 3 gap, closed by this plan, quick-260818-v81): this
 * heal loop now applies BOTH compensators, mirroring the fresh-download call
 * site (downloadSingleFile) exactly, in the same order — EDepotFileFlag
 * modes first, then the Mach-O fallback. Previously the loop's own
 * `!file.flags` early-continue skipped every flagless manifest entry before
 * either compensator ever ran; that early-continue WAS the G-23-02 defect.
 * A flagless manifest is the NORMAL case for native macOS titles, not an
 * edge case — 23-TRACE.md's H2 verdict found HUMANKIND's own manifest
 * carries flagBearing=140 out of 18,949 entries, executableFlagged=0,
 * distinctFlagValues=[64] (Directory only) — so skipping flagless entries
 * skipped essentially the entire install, including the main game binary
 * (`Contents/MacOS/Humankind`). Fixing this widens the loop body from ~140
 * entries to ~18.5k for a title like HUMANKIND: each now costs one bounded
 * 4KB positional read (`MACHO_PROBE_BYTES`) via applyMachOExecutableFallback,
 * a deliberate, accepted pre-download cost on the resume path (T-v81-05).
 */
export async function healReconciledFileModes(
  plan: DepotPlan,
  installRoot: string,
  jobFiles: Set<DepotPlanFile>,
  counters?: DepotModeCounters
): Promise<{ allModesHealed: boolean; failures: DepotDownloadFailure[] }> {
  const failures: DepotDownloadFailure[] = []
  let allModesHealed = true

  for (const depot of plan.depots) {
    for (const file of depot.files) {
      if (jobFiles.has(file)) continue
      if (
        file.flags !== undefined &&
        file.flags & (DIRECTORY_FLAG | SYMLINK_FLAG)
      ) {
        continue
      }
      const dest = resolveContainedPath(installRoot, file.filename)

      if (file.flags) {
        const modeResult = await applyEDepotFileModes(
          dest,
          file.flags,
          counters
        )
        if (!modeResult.ok) {
          allModesHealed = false
          failures.push({
            file: file.filename,
            error: `failed to re-apply file mode flags on reconciled file: ${modeResult.error}`
          })
        }
      }

      // G-23-02 (23-08 Task 3, VERDICT: H2): SECONDARY Mach-O fallback, run
      // unconditionally for every reconciled file that reaches this point —
      // never wrapped in try/catch (it swallows and logs its own errors) and
      // never allowed to influence allModesHealed/failures, matching the
      // fresh-download call site's contract exactly.
      await applyMachOExecutableFallback(dest, file.filename, file.flags)
    }
  }

  return { allModesHealed, failures }
}

/**
 * Download every file across every depot in `plan`, streaming to disk with
 * bounded file- and chunk-level concurrency, containment + SHA1 verification,
 * throttled DownloadManager progress (D-01/D-03, matches library.ts
 * pollInstallOnce()'s progressUpdate shape exactly), and prompt AbortSignal
 * cancel (D-02). Failures are collected, never swallowed — a per-file error
 * (traversal, SHA1 mismatch, exhausted chunk retries) does not stop the rest
 * of the download.
 */
export async function downloadDepotFiles(
  plan: DepotPlan,
  opts: DownloadDepotFilesOpts
): Promise<DepotDownloadResult> {
  const lzmaModule = await import('lzma')
  const lzma = ((lzmaModule as { default?: LzmaModule }).default ??
    lzmaModule) as unknown as LzmaModule

  // Phase 21 gap closure (21-15, D-UAT-03): move LZMA/zlib chunk decompress
  // off the main thread onto a worker_threads pool. `lzma` above is kept as
  // the inline-fallback codec — pool.decode transparently falls back to
  // inline main-thread decodeChunk if the pool never initializes, so a
  // pool-init failure never blocks the install (LOCKED requirement).
  const pool = new DecompressPool()
  await pool.init()

  const installRoot = resolve(
    opts.targetSteamappsDir,
    'common',
    opts.installdir
  )

  // 23-06: census logged on the RECEIVED plan at download entry — paired
  // with buildDepotPlan's own stage=plan-build census so a flags-dropping
  // serialization boundary between plan-build and download is directly
  // observable (H5). Emitting the SAME census at both points is the point.
  logInfo(
    `steam-flags-census stage=download-entry appId=${plan.appId} ` +
      formatDepotFlagsCensus(summarizeDepotFlags(plan)),
    LogPrefix.Steam
  )

  // 23-06: fresh per-invocation mode-application counters (G-23-02 trace
  // instrumentation) — NEVER module-level (see DepotModeCounters doc comment;
  // 23-05's per-appId single-flight means two different appIds can be
  // downloading concurrently, and module-level counters would let one run's
  // chmods corrupt another's count).
  const modeCounters: DepotModeCounters = { chmodAttempts: 0, modeCallsites: 0 }

  try {
    // Phase 23 (23-03, D-04): reconcile on-disk state BEFORE building the
    // download job list — a present, sha1-verified file is never
    // re-downloaded (D-05: reconciliation fills first-install/resume gaps
    // only, it never owns updates). A reconciliation-time error (e.g. a
    // path-traversal filename) must never abort the WHOLE run — fall back
    // to the pre-23-03 full job list so every file still goes through
    // downloadSingleFile's own per-job try/catch, which already records a
    // per-file traversal/mismatch as a DepotDownloadFailure without ever
    // crashing the loop (T-21-01 preserved).
    let jobs: Array<{
      depotId: string
      key: Buffer
      file: DepotPlanFile
      fileSeed: number
    }>
    // quick-260821-nyh: bytes the reconciler verified already present and
    // therefore excluded from `jobs` — seeds `doneBytes` below so the
    // numerator and the plan-scoped `totalBytes` denominator measure the
    // SAME set. Stays 0 on the fallback path (full job list rebuilt),
    // matching that path's existing full-re-download behaviour.
    let reconciledSkippedBytes = 0
    try {
      const reconciled = await reconcilePartialState(plan, installRoot)
      jobs = reconciled.jobs
      reconciledSkippedBytes = reconciled.skippedBytes
    } catch (err) {
      logWarning(
        [
          `downloadDepotFiles: reconciliation failed, falling back to a full re-download:`,
          err
        ],
        LogPrefix.Steam
      )
      jobs = []
      let fallbackSeed = 0
      for (const depot of plan.depots) {
        for (const file of depot.files) {
          jobs.push({
            depotId: depot.depotId,
            key: depot.key,
            file,
            fileSeed: fallbackSeed++
          })
        }
      }
    }

    const totalBytes = plan.totalBytes
    const failures: DepotDownloadFailure[] = []

    // Every file the reconciler skipped (already sha1-verified, not
    // re-downloaded) still needs its EDepotFileFlag modes re-applied
    // idempotently — heals an older partial download whose modes were never
    // set (RESEARCH.md Pattern 3). A failure here is NOT swallowed: it's
    // recorded the same way a fresh-download mode-application failure
    // already is (T-23-03), so a healing failure also blocks the
    // completeness gate below. Shared with library.ts's startup-resume path
    // (healReconciledFileModes, 23-code-review CR-01) — including its
    // Directory(64)/Symlink(512) skip guard (23-code-review WR-01), so a
    // manifest entry combining those bits with ReadOnly/Hidden can never
    // reach chmod/attrib.exe against a directory or symlink path here either.
    const jobFiles = new Set(jobs.map((j) => j.file))
    const { failures: healFailures } = await healReconciledFileModes(
      plan,
      installRoot,
      jobFiles,
      modeCounters
    )
    failures.push(...healFailures)

    // quick-260821-nyh: `doneBytes` means "plan bytes present on disk", NOT "bytes this
    // run wrote" — it is seeded with the reconciler's skip total so the numerator and the
    // plan-scoped `totalBytes` denominator measure the SAME set. Without this a resumed
    // install starts at 0% and terminates short of 100% (HUMANKIND 1124300 finished a
    // fully successful resume reading 76%). `runStartBytes` keeps the ETA's rate
    // numerator run-scoped; `lastEmitBytes` is seeded so the first emit window's delta is
    // this window's writes, not the whole seed.
    const runStartBytes = reconciledSkippedBytes
    let doneBytes = reconciledSkippedBytes // decompressed bytes written to disk — drives percent + disk rate
    let netBytes = 0 // compressed bytes fetched over the wire — drives download rate
    let lastEmitBytes = reconciledSkippedBytes
    let lastEmitNetBytes = 0
    let lastEmitTime = Date.now()
    let lastDownSpeed = 0 // MiB/s — reused across sub-window forced emits
    let lastDiskSpeed = 0 // MiB/s
    const tStart = Date.now()

    // Debug/steam-install-slow-start (cycle 3): ONE tracker for this whole
    // download run, shared across every file/depot — host health is a
    // property of the RUN (which content-server edges are currently good),
    // never per-file. See depot/hostHealth.ts for the root-cause writeup and
    // scoring/blacklist mechanics. Cycle 5: seeded with the directory's own
    // weightedload ranking (opts.hostWeightedLoads) so cold-start selection
    // favors the local, low-weightedload edges immediately.
    const hostHealth = new HostHealthTracker(opts.hostWeightedLoads)

    // Quick 260817-ihr (IHR-02): ONE explicit in-flight-request budget for
    // this whole download run, shared across every file/depot — see
    // depot/inflightLimiter.ts. Replaces the accidental ~8-request ceiling
    // that emerged from FILE_CONCURRENCY alone once most files turned out to
    // be single-chunk (see FILE_CONCURRENCY's own doc comment for the
    // 2026-08-17 evidence).
    const limiter = new InflightLimiter(TARGET_INFLIGHT_CHUNKS)

    // Debug/steam-install-slow-start (cycle 7): ONE forward-progress clock
    // for this whole download run, shared across every file/depot — see
    // depot/stallTracker.ts. Lets downloadFileChunks re-queue an exhausted
    // chunk instead of aborting its whole file, as long as the run overall
    // keeps making progress; only a genuine, sustained run-wide stall gives
    // up honestly.
    //
    // debug/depot-stall-bound-did-not-fire (2026-09-25): now injectable so
    // the run-scoped give-up in the file-worker loop below can be tested
    // without sleeping for STALL_TIMEOUT_MS of real time. Defaults to the
    // exact `new StallTracker()` this line has always been.
    const stallTracker = opts.stallTracker ?? new StallTracker()

    // Debug/steam-install-slow-start (cycle 2): the chunk-fetch retry/rotation/
    // timeout path was previously completely invisible in the dev log — this
    // block makes it observable without changing any retry/backoff/rotation
    // behavior (fetchChunk's onAttempt hook is purely a reporting callback).
    // Aggregated PER HOST (not per-chunk — a multi-thousand-chunk install would
    // flood the log) and flushed periodically via the existing heartbeat below.
    interface HostStat {
      attempts: number
      successes: number
      timeouts: number
      errors: number
      totalMs: number
      // Debug/steam-install-slow-start (diagnostic re-open, cycle 9): per-
      // reason failure counts (HTTP status / error name-or-code) for
      // outcome==='error' attempts only -- timeouts are already
      // unambiguously CHUNK_FETCH_TIMEOUT_MS firing (see `timeouts` above)
      // and are not broken down further. Purely observational: read only by
      // logChunkStreamStats below, never by any selection/retry/backoff
      // logic.
      reasons: Map<string, number>
    }
    const hostStats = new Map<string, HostStat>()
    let totalAttempts = 0
    let totalRotations = 0 // attempt index > 0 -- a chunk that needed >1 host
    let totalTimeouts = 0
    let firstByteMs: number | undefined
    // Debug/humankind-depot-full-stall (2026-08-17, network-vs-decode split):
    // run-wide (not per-host, to keep the log line bounded) accumulators for
    // ChunkAttemptEvent.netMs -- the pure network-fetch portion of a
    // successful attempt's `ms`, now populated by decompress.ts's fetchChunk.
    // `successSamples` doubles as the denominator for BOTH `totalSuccessMs`
    // and `totalNetMs` since every 'success' event now carries `netMs`.
    // Purely observational: read only by logChunkStreamStats below, never by
    // any retry/backoff/selection/hostHealth logic (hostHealth.record still
    // only ever receives the unchanged, combined `ev.ms`).
    let totalSuccessMs = 0
    let totalNetMs = 0
    let successSamples = 0
    const onAttempt: OnChunkAttempt = (ev) => {
      totalAttempts++
      if (ev.attempt > 0) totalRotations++
      if (ev.outcome === 'timeout') totalTimeouts++
      const stat = hostStats.get(ev.host) ?? {
        attempts: 0,
        successes: 0,
        timeouts: 0,
        errors: 0,
        totalMs: 0,
        reasons: new Map<string, number>()
      }
      stat.attempts++
      stat.totalMs += ev.ms
      if (ev.outcome === 'success') {
        stat.successes++
        totalSuccessMs += ev.ms
        successSamples++
        if (ev.netMs !== undefined) totalNetMs += ev.netMs
      } else if (ev.outcome === 'timeout') stat.timeouts++
      else {
        stat.errors++
        if (ev.reason)
          stat.reasons.set(ev.reason, (stat.reasons.get(ev.reason) ?? 0) + 1)
      }
      hostStats.set(ev.host, stat)
    }

    // quick 261027-d5i (todo 2026-10-26-chunk-timeouts-by-depot-or-host-unmeasured):
    // per-depot attempt counts so a live run can tell whether timeouts cluster
    // on one depot (e.g. XCOM 200511). Purely observational: read only by
    // logChunkStreamStats, never by any retry/backoff/rotation/hostHealth/
    // selection logic.
    const depotStats = new Map<
      string,
      { attempts: number; successes: number; timeouts: number; errors: number }
    >()
    const recordDepotAttempt = (
      depotId: string,
      ev: Parameters<OnChunkAttempt>[0]
    ) => {
      const d = depotStats.get(depotId) ?? {
        attempts: 0,
        successes: 0,
        timeouts: 0,
        errors: 0
      }
      d.attempts++
      if (ev.outcome === 'success') d.successes++
      else if (ev.outcome === 'timeout') d.timeouts++
      else d.errors++
      depotStats.set(depotId, d)
    }

    // Ranks hosts worst-first (timeouts+errors desc) and caps the line length —
    // a large install can resolve dozens of content-server hosts, and logging
    // every one every ~15s would itself become log noise.
    const logChunkStreamStats = () => {
      const elapsedSec = Math.round((Date.now() - tStart) / 1000)
      const percent =
        totalBytes > 0 ? Math.round((doneBytes / totalBytes) * 100) : 0
      // Debug/steam-install-slow-start (cycle 3): tags each host with the
      // hostHealth tracker's own live unhealthy/healthy verdict — lets a
      // hardware reproduction confirm the scoring/blacklist logic is actually
      // deprioritizing the same hosts the raw a/ok/to/err counts suggest are
      // bad, without having to cross-reference two separate systems by hand.
      const worst = Array.from(hostStats.entries())
        .map(([host, s]) => ({
          host,
          ...s,
          avgMs: s.attempts ? Math.round(s.totalMs / s.attempts) : 0,
          unhealthy: hostHealth.snapshot(host).unhealthy,
          // Debug/steam-install-slow-start (cycle 5): the directory's own
          // weightedload for this host, when known — lets a hardware
          // reproduction directly confirm the low-weightedload local caches
          // are absorbing the attempts and the high-weightedload (130) CDN
          // fallbacks are receiving little/none, per the fix directive.
          weightedload: opts.hostWeightedLoads?.get(host),
          // Debug/steam-install-slow-start (cycle 7): the scheme this host is
          // actually being requested over (mandatory-https vs http) + whether
          // it's a usetokenauth server — lets a hardware reproduction confirm
          // alibaba (https_support='unavailable') is now requested over http,
          // and that NO host is quietly triggering a token fetch.
          scheme:
            opts.hostMeta?.get(host)?.httpsSupport === 'mandatory'
              ? 'https'
              : 'http',
          usetokenauth: !!opts.hostMeta?.get(host)?.usetokenauth,
          // CDN-auth implementation cycle: the directory's own `type` for
          // this host (CDN vs SteamCache) — lets a hardware validation run
          // directly confirm the widened `wantsCdnAuthToken` gate (PART 2)
          // is firing for type=CDN hosts and NOT for type=SteamCache ones,
          // and that a token is actually being acquired (via the separate
          // `[Timing] CDN auth token acquired` log line) for the hosts that
          // previously flipped 403 -> ok.
          type: opts.hostMeta?.get(host)?.type,
          // Debug/steam-install-slow-start (diagnostic re-open, cycle 9):
          // compact failure-reason breakdown for this host's `errors`
          // count, worst (most frequent) reason first, capped at 4 distinct
          // reasons so a host with many different failure signatures still
          // renders a bounded line. Empty string when there are no
          // outcome==='error' attempts for this host yet.
          errBreakdown: Array.from(s.reasons.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4)
            .map(([reason, count]) => `${reason}:${count}`)
            .join(',')
        }))
        .sort((a, b) => b.timeouts + b.errors - (a.timeouts + a.errors))
        .slice(0, 6)
        .map(
          (s) =>
            `${s.host}[a=${s.attempts} ok=${s.successes} to=${s.timeouts} ` +
            `err=${s.errors}${s.errBreakdown ? `{${s.errBreakdown}}` : ''} ` +
            `avgMs=${s.avgMs}${s.weightedload !== undefined ? ` wl=${s.weightedload}` : ''} ` +
            `scheme=${s.scheme}${s.usetokenauth ? ' usetokenauth' : ''}` +
            `${s.type ? ` type=${s.type}` : ''}${s.unhealthy ? ' UNHEALTHY' : ''}]`
        )
        .join(' ')
      // Debug/humankind-depot-full-stall (2026-08-17, network-vs-decode
      // split): avgMs (success-only, run-wide) is the SAME combined
      // fetch+decode duration this file has logged since cycle 2 -- kept
      // here for direct continuity with every prior hardware run's numbers.
      // avgNetMs/avgDecodeMs are NEW: the first time this codebase can
      // report the network-fetch and decode-stage portions of that duration
      // SEPARATELY, instead of inferring the split via Little's Law against
      // an assumed worker count. `poolStats` (below) is DecompressPool's own
      // live saturation snapshot -- lets a hardware run directly confirm (or
      // refute) whether the decode pool is actually the thing running out of
      // headroom, instead of inferring it from timing alone.
      const avgMsAll = successSamples
        ? Math.round(totalSuccessMs / successSamples)
        : 0
      const avgNetMs = successSamples
        ? Math.round(totalNetMs / successSamples)
        : 0
      const avgDecodeMs = avgMsAll - avgNetMs
      const poolStats = pool.stats()
      const depots = [...depotStats.entries()]
        .sort(([, a], [, b]) => b.timeouts + b.errors - (a.timeouts + a.errors))
        .slice(0, 6)
        .map(
          ([id, s]) =>
            `${id}[a=${s.attempts} ok=${s.successes} to=${s.timeouts} err=${s.errors}]`
        )
        .join(' ')
      logInfo(
        `[Timing] chunk-stream stats @${elapsedSec}s: percent=${percent}% ` +
          `downSpeedMiBs=${lastDownSpeed.toFixed(2)} diskSpeedMiBs=${lastDiskSpeed.toFixed(2)} ` +
          `totalAttempts=${totalAttempts} rotations=${totalRotations} timeouts=${totalTimeouts} ` +
          `avgMs=${avgMsAll} avgNetMs=${avgNetMs} avgDecodeMs=${avgDecodeMs} ` +
          `pool[size=${poolStats.size} busy=${poolStats.busy} idle=${poolStats.idle} ` +
          `queued=${poolStats.queued} inline=${poolStats.inlineFallback}] ` +
          `hosts=${hostStats.size} worstHosts=[${worst}]` +
          // Appended last deliberately: keeps every earlier field in place for
          // parsers/greps over the existing line.
          ` depots=[${depots}]`,
        LogPrefix.Steam
      )
    }

    const emitProgress = (force: boolean) => {
      const percentDelta =
        totalBytes > 0 ? ((doneBytes - lastEmitBytes) / totalBytes) * 100 : 0
      const timeDelta = Date.now() - lastEmitTime
      // THROTTLE (~1%/500ms), never per-chunk — an IPC flood on a fast LAN (T-21-12).
      if (
        !force &&
        percentDelta < PROGRESS_THROTTLE_PERCENT &&
        timeDelta < PROGRESS_THROTTLE_MS
      ) {
        return
      }

      // Rolling/instantaneous rates over the window since the last emit (not a
      // cumulative average since start), so both figures reflect the CURRENT
      // rate and drop promptly on a stall. downSpeed = network (compressed)
      // transfer; diskSpeed = write (decompressed) throughput — for game assets
      // the decompressed rate typically reads higher than the wire rate.
      lastDownSpeed = rollingRateMiBs(
        netBytes - lastEmitNetBytes,
        timeDelta,
        lastDownSpeed
      )
      lastDiskSpeed = rollingRateMiBs(
        doneBytes - lastEmitBytes,
        timeDelta,
        lastDiskSpeed
      )

      lastEmitBytes = doneBytes
      lastEmitNetBytes = netBytes
      lastEmitTime = Date.now()

      // ETA stays a STABLE estimate from the cumulative average install rate
      // (disk bytes since start) — an instantaneous ETA would jitter every frame.
      const elapsedSec = (Date.now() - tStart) / 1000
      const avgBytesPerSec =
        elapsedSec > 0 ? (doneBytes - runStartBytes) / elapsedSec : 0
      const remaining = Math.max(totalBytes - doneBytes, 0)
      const etaSec = avgBytesPerSec > 0 ? remaining / avgBytesPerSec : 0

      // Exact shape library.ts's pollInstallOnce() (L944-953) already speaks —
      // the DownloadManager needs zero changes for the native depot-download path.
      // 260817-dib: routed through sendProgressUpdate (backend/utils) rather
      // than a raw sendFrontendMessage -- it performs the SAME
      // sendFrontendMessage('progressUpdate', payload) call AND emits onto
      // backendEvents' `progressUpdate-${appName}` bus, which is the seam
      // installStallWatchdog.ts's withStallTimeout re-arms on. Without this,
      // Steam's native depot download had no progress signal reaching
      // backendEvents at all, and the stall watchdog could never re-arm for
      // a healthy, advancing Steam install.
      sendProgressUpdate({
        appName: plan.appId,
        runner: 'steam',
        status: 'installing',
        progress: {
          // Denominator is the REAL multi-depot summed total (D-03), never a
          // single depot's own bytes.
          // WR-03: clamp to 100 — doneBytes can exceed totalBytes (matches
          // library.ts pollInstallOnce's own Math.min(100, ...) clamp).
          percent:
            totalBytes > 0
              ? Math.min(100, Math.round((doneBytes / totalBytes) * 100))
              : 0,
          bytes: getFileSize(doneBytes),
          // MiB/s (not raw bytes/sec) to match the UI's "MB/s" label + the
          // gog/legendary unit convention (UAT D-UAT-02).
          downSpeed: lastDownSpeed,
          diskSpeed: lastDiskSpeed,
          // HH:MM:SS, not raw "1247s" (UAT D-UAT-02).
          eta: Number.isFinite(etaSec) && etaSec > 0 ? formatEta(etaSec) : ''
        }
      })
    }

    const queue = [...jobs]
    const workerCount = Math.min(FILE_CONCURRENCY, queue.length)

    // Wall-clock heartbeat: forces emitProgress(true) every PROGRESS_HEARTBEAT_MS
    // regardless of chunk completion, so the graph advances even when chunk
    // completions bunch up. Started just before the worker fan-out and cleared
    // in the finally below on BOTH normal completion and throw/abort -- never
    // leaks a dangling interval past this Promise.all's own lifetime.
    //
    // Debug/steam-install-slow-start (cycle 2): also flushes the chunk-stream
    // stats log every STATS_LOG_EVERY_TICKS ticks (~15s at the 1s heartbeat
    // cadence) -- deliberately reuses this SAME interval rather than starting a
    // second one, preserving the existing "exactly one setInterval" test
    // contract (depot.test.ts's heartbeat-cadence test).
    const STATS_LOG_EVERY_TICKS = 15
    let heartbeatTicks = 0
    // debug/depot-stall-bound-did-not-fire (2026-09-25): one-shot latch so the
    // run-scoped give-up below records exactly ONE failure and ONE log line,
    // not one per file-worker — all FILE_CONCURRENCY workers run on the same
    // event-loop thread, so this is race-free by construction.
    let runStallRecorded = false
    const heartbeat = setInterval(() => {
      emitProgress(true)
      heartbeatTicks++
      if (heartbeatTicks % STATS_LOG_EVERY_TICKS === 0) {
        logChunkStreamStats()
      }
    }, PROGRESS_HEARTBEAT_MS)
    try {
      await Promise.all(
        Array.from({ length: workerCount }, async (_, fileWorkerSlot) => {
          while (queue.length) {
            // Checked per-file AND per-chunk (inside downloadFileChunks) so a
            // queue-cancel stops issuing new work promptly (D-02).
            if (opts.signal?.aborted) return
            // debug/depot-stall-bound-did-not-fire (2026-09-25): the RUN-SCOPED
            // half of the 180s no-progress bound, which did not exist before
            // this fix and is the reason the 2026-08-27 Californium wedge ran
            // for 51 minutes at 0 B/s after both its watchdog and its Cancel.
            //
            // Before this check, `stallTracker` was consulted at exactly ONE
            // site — downloadFileChunks' per-chunk catch (see the hasStalled()
            // guard there) — whose only power is to stop re-queuing one chunk
            // and fail ONE FILE. That per-file failure lands in the catch
            // below, which records it and pulls the NEXT job; `failures.length`
            // is never a loop-exit condition anywhere. So a run making ZERO
            // forward progress did not stop: it walked its whole remaining file
            // queue, burning one full CHUNK_FETCH_ATTEMPTS exhaustion
            // (8 x CHUNK_FETCH_TIMEOUT_MS + ~12s of backoff, ~132s) per file
            // per worker slot, bounded only by TARGET_INFLIGHT_CHUNKS. The
            // bound fired the whole time; nothing acted on it at run scope.
            //
            // What "no forward progress" means here, stated precisely —
            // specialist review W-1 (2026-09-25) CORRECTED the first version
            // of this comment, which claimed hasStalled() "can only be true
            // when NOTHING landed on disk anywhere in the run". That was
            // measurably FALSE and the correction is the reason
            // `stallTracker.recordProgress()` now runs below on a successful
            // file. `recordProgress()` had exactly ONE call site in the repo
            // — after `await fd.write(...)` in downloadFileChunks — so the
            // clock only ever saw DECOMPRESSED CHUNK BYTES, never work
            // completed. downloadSingleFile's directory, symlink and
            // zero-byte branches, and its whole post-chunk tail (a
            // whole-file sha1File re-read, applyEDepotFileModes,
            // applyMachOExecutableFallback), all complete a planned file
            // while writing no chunk at all. 32 concurrent whole-file SHA1
            // re-reads of multi-GB paks on a slow external disk exceeding
            // STALL_TIMEOUT_MS is not exotic, and before this check that
            // mattered to nobody (hasStalled() was advisory, read only
            // inside a per-chunk catch that a healthy file never enters).
            // Sampled HERE it is terminal and unrecoverable, so the clock
            // has to be able to see that work.
            //
            // With the recordProgress() below, reaching this point requires
            // STALL_TIMEOUT_MS in which no chunk byte landed AND no file
            // completed, anywhere in the run — a genuinely dead run. A
            // merely-slow one cannot get here: a successful attempt is
            // bounded at CHUNK_FETCH_TIMEOUT_MS (15s) and a full exhaustion
            // at ~132s, so every in-flight slot has turned over at least
            // once inside the window.
            //
            // The verify-tail residual this comment used to leave open is
            // CLOSED (quick 260926-ju4): sha1File now takes a progress
            // callback and the call site at :1659 feeds it into
            // recordProgress(), so the whole-file re-read is visible to the
            // clock as the work it is. That fix also corrected this
            // paragraph's own overstatement. A run in which every file
            // SUCCEEDS can never be killed at THIS consult, tail or no tail:
            // the recordProgress() below is the last statement before the
            // loop returns here with no await in between, so a worker cannot
            // read a clock its own tail made stale, and no other worker sits
            // at this line without having just recorded progress itself. The
            // consults a long tail could actually poison were the per-file
            // CATCH below (downloadSingleFile threw, so nothing recorded
            // progress, and the clock is stale by the whole length of the
            // tail that preceded the throw — escalating one honest per-file
            // failure into a run-level give-up) and downloadFileChunks'
            // per-chunk guard at :1462, consulted by a DIFFERENT worker
            // mid-tail — which would fail a whole file over one transient
            // chunk error, the exact outcome StallTracker exists to prevent.
            // Both are closed by the same signal.
            //
            // Scope limit, stated honestly: this stops the run TAKING NEW
            // FILES. Files already in flight are not interrupted — they drain
            // through their own per-chunk guard within one ~132s exhaustion.
            // Interrupting them needs an abort signal this function does not
            // own, and is a larger change than this fix is entitled to make.
            if (stallTracker.hasStalled()) {
              if (!runStallRecorded) {
                runStallRecorded = true
                const msSinceProgress = stallTracker.msSinceProgress()
                // Specialist review W-2 (2026-09-25): stamped with the
                // DownloadManager watchdog's OWN `StallError` marker pair
                // (installStallWatchdog.ts) so classifyDepotError can branch
                // on the property rather than on this sentence's wording —
                // the same discipline `.eresult`/`.code` already get — and
                // render the honest, already-localised stall copy instead of
                // dropping into the causeless generic bucket. Without this
                // the message below matches none of classifyDepotError's
                // signatures and the user is told only "The Steam download
                // failed."
                const stalledErr: StallError = Object.assign(
                  new Error(
                    `download stalled: no forward progress for ` +
                      `${msSinceProgress}ms across the whole run ` +
                      `— giving up with ${queue.length} file(s) unattempted`
                  ),
                  { isStall: true as const, msSinceProgress }
                )
                failures.push({
                  // Specialist review I-1 (2026-09-25): this was
                  // `queue[0]?.file.filename ?? '(run)'`, which named an
                  // UNATTEMPTED file as the failing one — it then printed as
                  // `first: file="..."` in downloadSteamDepots' aggregate
                  // error line, blaming a file that never even ran. The `??`
                  // fallback was dead too: `while (queue.length)` was
                  // evaluated with no intervening await, so `queue[0]` is
                  // always defined here. This is a RUN-level event, so it
                  // carries the run-level sentinel unconditionally.
                  file: '(run)',
                  error: stalledErr.message,
                  cause: stalledErr,
                  // Quick 260927-tpm (D-A): tags this record as run-level so
                  // formatDownloadFailureSummary can partition it out of the
                  // per-file count without this array losing the record —
                  // it still belongs in `failures` (D-B) and every other
                  // reader keeps counting it exactly as before.
                  scope: 'run'
                })
                logWarning(
                  `downloadDepotFiles: appId=${plan.appId} ${stalledErr.message}`,
                  LogPrefix.Steam
                )
              }
              return
            }
            const job = queue.shift()!
            try {
              await downloadSingleFile(
                installRoot,
                job.depotId,
                job.key,
                opts.hosts,
                lzma,
                job.file,
                job.fileSeed,
                opts.signal,
                (disk, net) => {
                  // Debug/steam-install-slow-start (cycle 2): time from the
                  // start of this streaming phase (tStart, set right before the
                  // heartbeat/worker fan-out) to the very FIRST decompressed
                  // byte landing on disk -- explains the reported "long lag
                  // before it initiated" independently of buildDepotPlan's
                  // already-measured ~3.5s (which ends before this phase
                  // starts).
                  if (firstByteMs === undefined && disk > 0) {
                    firstByteMs = Date.now() - tStart
                    logInfo(
                      `[Timing] downloadDepotFiles: first bytes written after ${firstByteMs}ms`,
                      LogPrefix.Steam
                    )
                  }
                  doneBytes += disk
                  netBytes += net
                  emitProgress(false)
                },
                pool.decode,
                (ev) => {
                  recordDepotAttempt(job.depotId, ev)
                  onAttempt(ev)
                },
                hostHealth,
                opts.cdnAuth,
                opts.hostMeta,
                stallTracker,
                // Phase 25 (multi-host fan-out): this file's own slot in the
                // FILE_CONCURRENCY pool, combined inside downloadSingleFile
                // -> downloadFileChunks with the chunk pool's own index.
                fileWorkerSlot,
                // 23-06: this RUN's own mode-application counters (G-23-02
                // trace instrumentation) — scoped per invocation, see
                // DepotModeCounters doc comment.
                modeCounters,
                // Quick 260817-ihr (IHR-02): this RUN's own in-flight-request
                // budget — see depot/inflightLimiter.ts.
                limiter
              )
              // debug/depot-stall-bound-did-not-fire, specialist review W-1
              // (2026-09-25): the SECOND forward-progress signal, and the
              // reason the run-scoped give-up above is safe. Until this line
              // the run's only notion of progress was "a decompressed chunk
              // byte hit disk" (downloadFileChunks' single
              // recordProgress() call site), which is blind to every file
              // that completes without writing a chunk — directory entries,
              // symlinks, zero-byte entries — and to the whole verify/chmod
              // tail of a file that DID write chunks. A successful return
              // from downloadSingleFile is unambiguous forward progress by
              // any definition, so it resets the clock.
              //
              // This cannot weaken the bound against the 2026-08-27
              // Californium case it was built for: a file that fails THROWS,
              // so this line is unreachable on the failure path, and on that
              // run zero files completed. It only prevents a run that IS
              // completing work from being declared dead.
              stallTracker.recordProgress()
            } catch (err) {
              failures.push({
                file: job.file.filename,
                error: (err as Error).message,
                // 37-02 (D-08): preserve the original thrown value so
                // classifyDepotError can read `.code`/`.eresult` off it.
                cause: err
              })
              // debug/steam-depot-unclassified-generic-error (F2): this catch
              // used to record the failure and log NOTHING, so an install
              // could fail N files and leave the operator with one generic
              // sentence ("The Steam download failed.") and no record of what
              // failed. That is why the 2026-08-27 Fallout 2 report has no
              // `reason=` line anywhere: a decode-stage failure rethrows and
              // is logged upstream, but an fs/HTTP error at open/write time
              // was swallowed HERE. Capped so a 19k-file title cannot flood
              // the log — the aggregate at the throw site reports the true
              // per-FILE total as of quick 260927-tpm (formatDownloadFailureSummary
              // partitions the run-level record, if any, out of this count).
              // Named residual (D-D, not fixed here): this cap is compared
              // against `failures.length` — the UNFILTERED array — so on a
              // run that both hits this cap AND later stalls, the "further
              // failures suppressed" line at the cap boundary can be off by
              // one against the per-file count this comment now describes.
              // Tracked as a new pending todo (260927-tpm Task 2) rather than
              // fixed here — this quick task's scope is the aggregate line
              // only.
              if (failures.length <= FAILURE_LOG_CAP) {
                logWarning(
                  `downloadDepotFiles: appId=${plan.appId} depot=${job.depotId} ` +
                    `file="${job.file.filename}" failed: ${describeDepotFailure(err)}`,
                  LogPrefix.Steam
                )
              } else if (failures.length === FAILURE_LOG_CAP + 1) {
                logWarning(
                  `downloadDepotFiles: appId=${plan.appId} further per-file ` +
                    `failures suppressed after ${FAILURE_LOG_CAP} — see the ` +
                    `aggregate on the download-failed line below`,
                  LogPrefix.Steam
                )
              }
            }
          }
        })
      )
    } finally {
      clearInterval(heartbeat)
    }

    emitProgress(true)
    // Debug/steam-install-slow-start (cycle 2): always log a final stats
    // snapshot regardless of where heartbeatTicks landed relative to
    // STATS_LOG_EVERY_TICKS, so a short run (or one that fails before the
    // first periodic flush) still leaves a stats line in the log — total
    // attempts/timeouts/rotations are always meaningful even at totalBytes=0.
    if (totalAttempts > 0) {
      logChunkStreamStats()
    }

    // Phase 23 (23-02, D-01): a job left in `queue` means the run aborted
    // before every planned file was even attempted — never "verified".
    const allJobsAttempted = queue.length === 0

    // 23-06: final census, now including the RUNTIME counters that only
    // exist once the download has actually run — chmodAttempts/modeCallsites
    // discriminate H3 (modes applied then lost) from H1/H4, and
    // jobCount/reconciledSkipped discriminate H4 (reconciler + heal loop both
    // skipped the same files via their respective `!file.flags` guards).
    const finalCensus = summarizeDepotFlags(plan)
    logInfo(
      `steam-flags-census stage=download-complete appId=${plan.appId} ` +
        formatDepotFlagsCensus(finalCensus, {
          chmodAttempts: modeCounters.chmodAttempts,
          modeCallsites: modeCounters.modeCallsites,
          jobCount: jobs.length,
          reconciledSkipped: finalCensus.totalFiles - jobs.length
        }),
      LogPrefix.Steam
    )

    // Phase 23 (23-08 Task 2a): `allModesApplied` used to be vacuously
    // `failures.length === 0` — true even when ZERO mode applications were
    // ever attempted (T-23-27). Fail closed: if the manifest claims
    // executable-flagged entries (finalCensus.executableFlagged > 0) but
    // THIS RUN's own chmodAttempts is 0, the completeness gate must decline
    // StateFlags=4 regardless of `failures` being empty — forcing the
    // byte-identical StateFlags=1026 verify-handoff (D-01) instead of an
    // unproven `4`. Reads ONLY this run's own modeCounters (never
    // module-level, see the DepotModeCounters doc comment) so a concurrent
    // install of a DIFFERENT appId (23-05 supports this) can never satisfy
    // this run's gate on another run's behalf.
    //
    // Deliberately NOT triggered when executableFlagged === 0 (T-23-28): a
    // manifest that genuinely has no executable-flagged entries (a pure
    // data depot, or — per 23-TRACE.md's H2 verdict — a native macOS title
    // whose manifest never carries Executable/CustomExecutable bits at all)
    // must still earn allModesApplied: true here; an over-strict gate would
    // force every such install to 1026 and silently destroy the whole
    // phase's value. G-23-02's fix for THAT case is 23-08 Task 3's
    // narrowly-scoped Mach-O fallback, which operates independently of this
    // gate.
    const executableClaimedByManifest = finalCensus.executableFlagged > 0
    const modesActuallyAppliedThisRun = modeCounters.chmodAttempts > 0
    const allModesApplied =
      failures.length === 0 &&
      (!executableClaimedByManifest || modesActuallyAppliedThisRun)

    // quick-261026-uhi (todo 2026-10-25, observed in the XCOM 200510 pause
    // logs): a user pause/cancel aborts the job loop before executable files
    // reach chmod, so chmodAttempts=0 is EXPECTED there and is not an
    // integrity finding. Suppress only the log line: allModesApplied above is
    // deliberately still false, so the 1026 outcome is unchanged, and the
    // run's outcome 'cancelled' independently fails canWriteFullOwnership
    // (allFilesVerifiedThisRun can still be true when the abort lands after
    // the queue drained, so it is not the guard here).
    // The gate is abort-only (not runLooksComplete) so a non-cancelled run
    // that applied zero chmods against an executable-claiming manifest, with
    // or without failures, still warns.
    if (
      executableClaimedByManifest &&
      !modesActuallyAppliedThisRun &&
      !opts.signal?.aborted
    ) {
      logWarning(
        `downloadDepotFiles: appId=${plan.appId} manifest claims ` +
          `executableFlagged=${finalCensus.executableFlagged} but this ` +
          `run's chmodAttempts=0 — failing closed to StateFlags=1026 ` +
          `instead of an unproven StateFlags=4 (G-23-02/T-23-27)`,
        LogPrefix.Steam
      )
    }

    // Phase 23 (NBD-01/02/03): reconcilePartialState (above, ~line 2160) runs
    // ONCE at the START of downloadDepotFiles as the job-list builder. This
    // is the only point at which the tree is in its FINAL state for this run
    // — after the job loop, after healReconciledFileModes, after every
    // per-file mode application — so it is the only place a post-write
    // clobber (a later job overwriting an earlier file's destination, a
    // truncation, a regular file replaced by a directory) can be caught
    // before the completeness gate grants StateFlags=4.
    //
    // Guarded by runLooksComplete (the cancelled/failed-run decision): a
    // cancelled or already-failed run already fails allFilesVerifiedThisRun
    // via allJobsAttempted/failures below, so its value cannot change the
    // ACF written for that run — running ~1 stat() per planned file there
    // would be pure waste, and its per-file failures are already logged
    // individually at the loop's own catch site. The check therefore runs
    // ONLY on the runs that would otherwise be granted a 4 — exactly the
    // population it exists to police. This is a strict tightening: no run
    // that previously resolved to 1026 can now resolve to 4.
    //
    // Fail-closed contract: a structural mismatch resolves to false, a throw
    // (including PathTraversalError) resolves to false, and an unguarded
    // (incomplete/cancelled) run keeps the pre-existing false from
    // allJobsAttempted/failures. No branch here resolves to true on
    // incomplete information (gotcha 6 / fail-open-recreation precedent).
    const runLooksComplete =
      allJobsAttempted && failures.length === 0 && !opts.signal?.aborted
    let structurallyVerified = true
    if (runLooksComplete) {
      try {
        const structural = await verifyStructuralIntegrity(plan, installRoot)
        structurallyVerified = structural.ok
        if (!structural.ok) {
          logWarning(
            `downloadDepotFiles: appId=${plan.appId} post-download structural ` +
              `re-verification found ${structural.mismatchCount} of ` +
              `${structural.checked} planned entries damaged or missing — failing ` +
              `closed to StateFlags=1026 instead of an unproven StateFlags=4: ` +
              structural.mismatches
                .map(
                  (m) =>
                    `"${m.filename}" ${m.reason} (expected=${m.expectedSize} found=${m.foundSize})`
                )
                .join('; '),
            LogPrefix.Steam
          )
        }
      } catch (err) {
        structurallyVerified = false
        logWarning(
          `downloadDepotFiles: appId=${plan.appId} post-download structural ` +
            `re-verification threw — failing closed to StateFlags=1026: ${String(err)}`,
          LogPrefix.Steam
        )
      }
    }

    return {
      outcome: opts.signal?.aborted ? 'cancelled' : 'completed',
      failures,
      allFilesVerifiedThisRun:
        allJobsAttempted && failures.length === 0 && structurallyVerified,
      allModesApplied
    }
  } finally {
    // No workers leak across installs — shutdown() is safe to call even if
    // init() itself fell back to inline decode (it just terminates zero
    // workers in that case).
    await pool.shutdown()
  }
}
