// Download outcome + orchestration: downloadSteamDepots, downloadSelectedDepotFiles and failure summaries (extracted from ../depot.ts, 62-10).

import { downloadDepotFiles } from './downloadFiles'
import { getContentServerHosts } from './contentServers'
import { finalizeToSteam, type FinalizeDepotEntry } from './finalize'
import { logWarning, logError, LogPrefix } from 'backend/logger'
import { SteamUser } from '../user'
import { CdnAuthTokenCache } from './cdnAuth'
import { classifyDepotError, type DepotErrorAction } from '../depotErrors'
import {
  DIRECTORY_FLAG,
  SYMLINK_FLAG,
  describeDepotFailure,
  type DownloadSteamDepotsOpts,
  type DepotPlanEntry,
  type DepotPlan
} from './planModel'
import { throwIfAborted, getDepotClient, buildDepotPlan } from './plan'
import { depotPipeline } from '../depotRust/pipelineFlag'
import { downloadSteamDepotsRust } from '../depotRust/install'
import { downloadSelectedDepotFilesRust } from '../depotRust/secondary'
import {
  type DepotDownloadFailure,
  type DepotDownloadResult,
  shouldFinalizeAfterThrow
} from './download'

interface DepotDownloadOutcome {
  status: 'done' | 'error' | 'cancelled'
  error?: string
  /** 23.2-03 (G-23-01): depot ids skipped by the EResult-40 skip-and-warn
   *  policy (DepotPlan.skippedDepots), threaded out so plan 23.2-04 can
   *  surface a user-facing completion notice. Populated on every return path
   *  that occurs AFTER buildDepotPlan resolved — 'done', 'error' and
   *  'cancelled' alike. Left undefined on a throw before the plan ever
   *  existed (nothing to report). */
  skippedDepots?: string[]
  /** 37-02 (D-06/D-07): the structured affordance classifyDepotError
   *  assigned to `error` — carried alongside it on both 'error' return
   *  paths below so callers (games.ts) can render the right dialog
   *  affordance without re-classifying anything themselves. Undefined on
   *  every non-error status. */
  errorAction?: DepotErrorAction
}

/**
 * Quick 260927-v8i (D-01/D-02/D-03/D-05): the ONE shared, deterministic
 * selection this quick task exists to add. Both `formatDownloadFailureSummary`'s
 * `first:` fragment below and `downloadSteamDepots`' error-path classifier
 * argument now call this single function over the SAME `failures` array —
 * one call, one const, read twice — so the two can no longer independently
 * pick different records and describe/classify the same failed run two
 * different ways.
 *
 * (a) Why this needs to be deterministic at all: `failures` is populated by
 * `FILE_CONCURRENCY` workers racing to push onto the same array as each
 * fails, plus the run-level stall give-up appended whenever the whole run's
 * no-progress bound trips. Array order is real async completion order, not
 * semantic priority — reading `failures[0]` (what both consumers used to do,
 * independently) picked whichever failure happened to land first: a race,
 * not a decision.
 *
 * (b) Why the run-level record wins when both kinds of failure are present:
 * the run gave up — a single file failure alongside that give-up is usually
 * a symptom of the same dying run, not an independent cause the user should
 * be told to inspect. `classifyDepotError` reaches `isStallError`
 * (depotErrors.ts:283) for the run-level record and returns the real
 * localised `steam.download.error.stalled` copy with the actionable
 * `action: 'retry'` — a stronger diagnosis than an arbitrary file-level
 * failure such as a `sha1 mismatch`, classified `verifyFailed` with
 * `action: 'none'`.
 *
 * (c) Tier 1 — a preference for a NON-RETRYABLE file-level cause ahead of
 * the run-level record — was considered and DROPPED, on a measurement, not
 * an assumption: no file-level `DepotDownloadFailure` can carry a `.cause`
 * for which `isNonRetryableDepotError` (depotErrors.ts:81) returns true. The
 * only two sites in all of `src/` that ever stamp a numeric `.eresult`
 * property (`wrapDepotKeyError` here at depot.ts:610-612, and depot.ts:897)
 * both live inside `buildDepotPlan`, whose throws are caught by
 * `downloadSteamDepots`'s own OUTER catch and classified directly — they
 * never enter this array at all. So the shipped rule is two-tier, not
 * three, and no tier-1 mechanism or test exists for a case that cannot
 * happen today.
 *
 * (d) The residual this measurement leaves, named where the next reader
 * will see it: if a FUTURE change ever stamps a numeric `.eresult` onto
 * something thrown out of `downloadSingleFile` or `healReconciledFileModes`,
 * a permanent, non-retryable cause could be masked behind this function's
 * retryable-looking stalled copy — telling a user to retry something that
 * can never succeed. Nothing detects that today; a source gate over
 * `.eresult` assignment sites was considered and declined as too broad and
 * fragile to be worth the false confidence it would look like it bought.
 *
 * D-05: the non-empty precondition is inherited unchanged from the
 * `failures[0]` read this replaces — this function is not made total, and
 * its only production caller stays guarded by the entry gate at
 * depot.ts:3498 (`if (result.failures.length)`).
 */
export function selectPrimaryDepotFailure(
  failures: DepotDownloadFailure[]
): DepotDownloadFailure {
  const primary = failures.find((f) => f.scope === 'run') ?? failures[0]
  if (primary === undefined) {
    throw new Error('selectPrimaryDepotFailure: failures must be non-empty')
  }
  return primary
}

/**
 * Quick 260927-tpm (D-A/D-C): the aggregate download-failed log line's sole
 * formatter, factored out so the fix and its RED/GREEN tests share one
 * definition instead of the call site re-deriving the count inline. Reports
 * the FILE-level failure count only — a run-level give-up (tagged
 * `scope: 'run'`, see DepotDownloadFailure) is excluded from that count and
 * surfaced instead as its own trailing fragment, so N file failures always
 * reads as N, never N+1, while the run-level reason is still visible in the
 * same line. `failures` itself is untouched (D-B): every completeness-gate
 * reader upstream of this call keeps counting the unfiltered array exactly
 * as before — this function only changes how the array is DESCRIBED, not
 * what it contains.
 *
 * Quick 260927-v8i (D-01, superseding D-C): `first:` no longer reads
 * `failures[0]` directly — it reports whichever record
 * `selectPrimaryDepotFailure` selects above, which is the SAME record the
 * error-path classifier is fed (one shared call, D-03). Case C (a run that
 * stalls with zero files ever having failed individually) used to be
 * described as "the one case where `first:` and the run fragment describe
 * the same underlying record from two angles" — under D-01 that is now the
 * NORMAL case whenever any run-level record exists at all, not a coincidence
 * of array order.
 */
export function formatDownloadFailureSummary(
  appId: string,
  failures: DepotDownloadFailure[],
  classificationKey: string
): string {
  const fileFailures = failures.filter((f) => f.scope !== 'run')
  const runFailure = failures.find((f) => f.scope === 'run')
  const first = selectPrimaryDepotFailure(failures)
  const runFragment = runFailure ? `; run: ${runFailure.error}` : ''
  return (
    `downloadSteamDepots: appId=${appId} download failed — ` +
    `${fileFailures.length} file failure(s), classified as ` +
    `${classificationKey}; first: file="${first.file}" ` +
    `${describeDepotFailure(first.cause ?? first.error)}` +
    runFragment
  )
}

/**
 * Normalised depot path used to select files: backslashes to slashes, leading
 * slashes stripped, lowercased. Shared with bridge/originalRestore.ts so the
 * selector and the caller agree on one form.
 */
export function normalizeDepotPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase()
}

export interface DownloadSelectedDepotFilesOpts extends DownloadSteamDepotsOpts {
  /**
   * Files to fetch, in the {@link normalizeDepotPath} form. A list rather than a predicate so the
   * Rust pipeline can take it over the wire (D-02); the TS path builds its predicate from it.
   */
  selectPaths: string[]
  /** Test seam: defaults to {@link downloadDepotFiles}. */
  downloadFiles?: typeof downloadDepotFiles
}

export interface DownloadSelectedDepotFilesResult {
  status: 'done' | 'cancelled' | 'error'
  /** The files fetched: manifest filename (Windows separators), size, lowercase hex sha1. */
  files: Array<{ filename: string; size: number; sha1: string }>
  error?: string
  failures?: DepotDownloadFailure[]
}

/**
 * Quick 261026-lif: fetch ONLY the manifest files `select` accepts into
 * `<targetSteamappsDir>/common/<installdir>/`. A partial fetch into a staging
 * tree: it never calls finalizeToSteam, so no appmanifest ACF is ever written.
 * Directory and symlink entries are never selected. NEVER throws: every
 * failure maps to a structured status.
 */
export async function downloadSelectedDepotFiles(
  appId: string,
  opts: DownloadSelectedDepotFilesOpts
): Promise<DownloadSelectedDepotFilesResult> {
  // D-16: the flag is read once, here.
  if (depotPipeline() === 'rust') {
    return downloadSelectedDepotFilesRust(appId, opts)
  }
  const wanted = new Set(opts.selectPaths.map(normalizeDepotPath))
  let lease: Awaited<ReturnType<typeof SteamUser.acquireAuthenticated>> | null =
    null
  try {
    lease = await SteamUser.acquireAuthenticated({
      reason: 'original-restore',
      guidedAction: 'install',
      appName: appId
    })
    if (!lease.ok) {
      throw new Error(
        `downloadSteamDepots: no authenticated Steam CM connection available for appId ${appId} (${lease.reason})`
      )
    }
    const plan = await buildDepotPlan(appId, opts)
    const picked: DownloadSelectedDepotFilesResult['files'] = []
    let totalBytes = 0
    const depots: DepotPlanEntry[] = []
    for (const depot of plan.depots) {
      const files = depot.files.filter((f) => {
        const flags = f.flags ?? 0
        if (flags & DIRECTORY_FLAG || flags & SYMLINK_FLAG) return false
        return wanted.has(normalizeDepotPath(f.filename))
      })
      if (!files.length) continue
      for (const f of files) {
        totalBytes += Number(f.size)
        picked.push({
          filename: f.filename,
          size: Number(f.size),
          sha1: (Buffer.isBuffer(f.sha_content)
            ? f.sha_content.toString('hex')
            : String(f.sha_content)
          ).toLowerCase()
        })
      }
      depots.push({ ...depot, files })
    }
    if (!depots.length) return { status: 'done', files: [] }

    const filteredPlan: DepotPlan = { ...plan, depots, totalBytes }
    const client = getDepotClient()
    const {
      hosts,
      weightedLoads: hostWeightedLoads,
      hostMeta
    } = await getContentServerHosts(client, Number(appId))
    throwIfAborted(opts.signal)
    const cdnAuth = new CdnAuthTokenCache(client, Number(appId))
    const result = await (opts.downloadFiles ?? downloadDepotFiles)(
      filteredPlan,
      {
        targetSteamappsDir: opts.targetSteamappsDir,
        installdir: opts.installdir,
        hosts,
        hostWeightedLoads,
        cdnAuth,
        hostMeta,
        signal: opts.signal
      }
    )
    if (result.outcome === 'cancelled' || opts.signal?.aborted === true) {
      return { status: 'cancelled', files: picked }
    }
    if (result.failures.length) {
      const first = selectPrimaryDepotFailure(result.failures)
      return {
        status: 'error',
        files: picked,
        error: classifyDepotError(first.cause ?? first.error).message,
        failures: result.failures
      }
    }
    return { status: 'done', files: picked }
  } catch (err) {
    if (opts.signal?.aborted === true) return { status: 'cancelled', files: [] }
    return {
      status: 'error',
      files: [],
      error: classifyDepotError(err).message
    }
  } finally {
    if (lease?.ok) lease.release()
  }
}

/**
 * The public depot-download orchestrator — Plan 07's SteamGame.install() call
 * site. Builds the DepotPlan (buildDepotPlan), resolves content-server hosts,
 * streams every file to disk (downloadDepotFiles), and ALWAYS converges on
 * finalizeToSteam: on full success, on a partial/failed download, on
 * AbortSignal cancel, and on any thrown error from plan-building itself
 * (Pattern 5, D-04/D-05/D-07). The manifest write is always the LAST
 * filesystem action before returning control. NEVER throws — every failure
 * mode maps to a structured outcome the caller (Plan 07) and the
 * DownloadManager queue consume directly, the same convention gog/legendary's
 * own install() functions already use.
 */
export async function downloadSteamDepots(
  appId: string,
  opts: DownloadSteamDepotsOpts
): Promise<DepotDownloadOutcome> {
  // D-16: the flag is read once, here; a job never mixes TS and Rust stages.
  if (depotPipeline() === 'rust') return downloadSteamDepotsRust(appId, opts)
  const attempted: FinalizeDepotEntry[] = []
  let displayName = opts.installdir
  // D-02: captured once from the DepotPlan (plan-time PICS read) so
  // finalizeToSteam can thread the real buildid into a StateFlags=4
  // manifest — never re-derived by a second PICS call (Pitfall 4).
  let buildid: string | undefined
  // D-01: the completeness-gate inputs from the download run this
  // orchestration actually performed. Undefined (never assigned) on the
  // zero-depot early-return and the thrown-error catch path below — both
  // correctly fail CLOSED to the 1026 fallback via finalizeToSteam's own
  // opts-omitted defaults.
  let lastResult: DepotDownloadResult | undefined
  // 23.2-02 (D-08): true once downloadDepotFiles is about to be invoked —
  // set BEFORE that await, not after, so a throw inside downloadDepotFiles
  // with bytes already on disk still counts as "attempted." Feeds
  // shouldFinalizeAfterThrow, the catch block's only gate on whether
  // finalize() is even called.
  let downloadAttempted = false
  // 23.2-03 (G-23-01): captured from plan.skippedDepots immediately after
  // buildDepotPlan resolves, alongside displayName/buildid. Stays undefined
  // if buildDepotPlan itself threw (Case A) — a throw before the plan exists
  // has nothing to report.
  let skippedDepots: string[] | undefined

  // D-UAT-09 (21-17): an aborted signal forces the outcome threaded into
  // finalizeToSteam to 'cancelled' regardless of what lastResult.outcome
  // says — closes the race where a user cancel landing after the last
  // in-loop signal check would otherwise let downloadDepotFiles's own
  // 'completed' outcome flow straight through to canWriteFullOwnership.
  // canWriteFullOwnership itself is untouched (still requires
  // outcome==='completed'); this is the single call site deciding what
  // outcome value it ever sees.
  const finalize = (): Promise<void> => {
    const cancelled =
      lastResult?.outcome === 'cancelled' || opts.signal?.aborted === true
    return finalizeToSteam(appId, {
      targetSteamappsDir: opts.targetSteamappsDir,
      installdir: opts.installdir,
      name: displayName,
      depots: attempted,
      buildid,
      outcome: cancelled ? 'cancelled' : lastResult?.outcome,
      failures: lastResult?.failures,
      allFilesVerified: lastResult?.allFilesVerifiedThisRun,
      allModesApplied: lastResult?.allModesApplied
    })
  }

  try {
    const plan = await buildDepotPlan(appId, opts)
    displayName = plan.name
    buildid = plan.buildid
    skippedDepots = plan.skippedDepots

    for (const d of plan.depots) {
      attempted.push({
        depotId: d.depotId,
        gid: d.gid,
        size: d.files.reduce((sum, f) => sum + Number(f.size), 0)
      })
    }

    if (!plan.depots.length) {
      // Nothing owned/matching this OS — still finalize (honest, empty
      // state) so a dangling prior partial attempt is never left unresolved.
      // 23.2-02 (D-08): this write's serialized shape (empty InstalledDepots
      // block) is the SAME shape the D-08 stub produces, but this call site
      // is deliberately OUT OF SCOPE for that fix — buildDepotPlan already
      // returned successfully here (a real, honest "zero owned depots"
      // result), unlike the catch-path case D-08 targets, where
      // buildDepotPlan never returned at all.
      await finalize()
      // WR-02 (21-17): honor an abort on this early return exactly like the
      // main path (L2119) and the thrown-error path (L2152) do. If the signal
      // was aborted after buildDepotPlan resolved with zero depots, finalize()
      // above already forced the honest 'cancelled'/1026 manifest; reporting
      // 'done' here would skip games.ts runNativeDepotDownload's cancelled
      // branch and thus never call markSteamInstallIncomplete — surfacing an
      // aborted install as if it had succeeded. Returning 'cancelled' routes
      // it through the SAME abort->cancelled->mark chain (is_installed=false,
      // steamResumePending=true) as the other two abort return paths.
      return opts.signal?.aborted === true
        ? { status: 'cancelled', skippedDepots }
        : { status: 'done', skippedDepots }
    }

    const client = getDepotClient()
    const {
      hosts,
      weightedLoads: hostWeightedLoads,
      hostMeta
    } = await getContentServerHosts(client, Number(appId))
    throwIfAborted(opts.signal)

    // Debug/steam-install-slow-start: cycle 2's periodic host-list refresh
    // (disproven — see the comment above getContentServerHosts) is REPLACED
    // by health-aware selection WITHIN this fixed host list, applied inside
    // downloadDepotFiles via its own HostHealthTracker (depot/hostHealth.ts).
    // Cycle 5: hostWeightedLoads threads the directory's own load-based
    // ranking (cycle-4 lead (a)) into that tracker's cold-start PRIOR.
    // Cycle 6: one CdnAuthTokenCache per download run — created here (where
    // the authenticated `client` is available) and threaded through
    // downloadDepotFiles the same way hosts/hostWeightedLoads already are, so
    // fetchChunk's chunk URLs CAN carry a real per-depot+host CDN auth
    // token (see depot/cdnAuth.ts). Cycle 7: gated strictly behind
    // `hostMeta`'s per-host `usetokenauth` flag inside fetchChunk itself —
    // cycle 6's unconditional fetch is DISPROVEN (see depot/decompress.ts's
    // fetchChunk doc comment); in practice this cache stays dormant.
    // hostMeta also threads https_support so fetchChunk can build the exact
    // steam-user URL scheme per host (unlocks http-only edges like alibaba).
    const cdnAuth = new CdnAuthTokenCache(client, Number(appId))
    downloadAttempted = true
    const result = await downloadDepotFiles(plan, {
      targetSteamappsDir: opts.targetSteamappsDir,
      installdir: opts.installdir,
      hosts,
      hostWeightedLoads,
      cdnAuth,
      hostMeta,
      signal: opts.signal
    })
    lastResult = result

    // Manifest write is always the LAST fs action — after every file write
    // attempt, before returning control (D-07 no-race guarantee).
    await finalize()

    if (result.outcome === 'cancelled' || opts.signal?.aborted === true) {
      return { status: 'cancelled', skippedDepots }
    }
    if (result.failures.length) {
      // D-06: surface the CLASSIFIED, plain-language message — never the raw
      // failure string — so the DownloadManager queue's existing generic
      // error+Retry UI shows something actionable ("Steam servers dropped
      // the connection", not a stack trace).
      // 37-02 (D-08): pass the preserved cause object (falls back to the
      // pre-flattened string only if no cause was captured), so
      // classifyDepotError can read `.code`/`.eresult` off it directly.
      // Quick 260927-v8i (D-01/D-03): ONE call to selectPrimaryDepotFailure
      // over the unfiltered array, read twice below — so the record fed to
      // the classifier and the record formatDownloadFailureSummary's
      // `first:` fragment describes are the same object by construction,
      // never two independent index-0 reads that could disagree on which
      // worker's failure happened to land first.
      const selectedFailure = selectPrimaryDepotFailure(result.failures)
      const classified = classifyDepotError(
        selectedFailure.cause ?? selectedFailure.error
      )
      // debug/steam-depot-unclassified-generic-error (F2): the classified
      // message is all the UI ever shows, and for the generic bucket that is
      // "The Steam download failed." — a sentence with no cause in it. Record
      // the aggregate the classifier was fed so the log can answer "how many
      // files, which ones, and what did the UNCLASSIFIED text actually say".
      // `classified.key` is logged too: it is the ONLY way to tell from a log
      // whether the generic fallback was reached (nothing matched) or a real
      // signature matched — the user-facing string cannot distinguish a
      // classified failure from an unclassified one.
      //
      // Quick 260927-tpm (D-A/D-C): the count below used to be
      // `result.failures.length` — every entry in the unfiltered array,
      // including a run-level stall give-up, so N failed files logged as
      // N+1. formatDownloadFailureSummary partitions the run-level record
      // out of the count (and surfaces it as its own trailing fragment).
      // Quick 260927-v8i: both this classifier input above and that
      // formatter's `first:` fragment now come from the ONE shared
      // selection (D-01) — this is exactly what that quick task changed.
      // `result.failures` itself stays unfiltered for every OTHER reader:
      // the file-COUNT partition is still 260927-tpm's, untouched here.
      logError(
        formatDownloadFailureSummary(appId, result.failures, classified.key),
        LogPrefix.Steam
      )
      return {
        status: 'error',
        error: classified.message,
        // 37-02 (D-06/D-07): thread the structured affordance out alongside
        // the message so games.ts can forward it without re-classifying.
        errorAction: classified.action,
        skippedDepots
      }
    }
    return { status: 'done', skippedDepots }
  } catch (err) {
    // Any thrown failure — plan-build error, content-server resolution
    // failure, anything — still funnels through the SAME finalize path
    // (Pattern 5): write whatever landed, never rethrow. 23.2-02 (D-08):
    // EXCEPT when nothing was ever attempted this run (buildDepotPlan threw
    // before downloadDepotFiles was ever reached, Case A,
    // 23.2-MANIFEST-WRITE-TAXONOMY.md) — in that case attempted is still []
    // and buildid is still undefined, so finalize() would write a
    // StateFlags=1026/buildid=0/empty-InstalledDepots stub over whatever
    // `.acf` already existed, even a complete prior install. Gated behind
    // shouldFinalizeAfterThrow (the only place this decision is made) so the
    // Phase 21 1026 verify-handoff (Case B: plan built, download attempted,
    // then failed/cancelled) is untouched — downloadAttempted is true there.
    if (shouldFinalizeAfterThrow({ downloadAttempted })) {
      await finalize().catch((finalizeErr) => {
        logWarning(
          [
            `downloadSteamDepots: finalizeToSteam itself failed for appId ${appId}:`,
            finalizeErr
          ],
          LogPrefix.Steam
        )
      })
    } else {
      logWarning(
        `downloadSteamDepots: plan-build failed for appId ${appId} before any depot was attempted — manifest deliberately left untouched (D-08)`,
        LogPrefix.Steam
      )
    }
    // D-UAT-05: a cancel issued during plan-building throws
    // DepotPlanAbortedError (or races with some OTHER thrown error while the
    // signal is already aborted) — checked via opts.signal?.aborted rather
    // than `instanceof` so either case still reports 'cancelled', matching
    // downloadDepotFiles's own signal-aborted -> 'cancelled' outcome instead
    // of surfacing a spurious error/Retry UI for a user-requested stop.
    if (opts.signal?.aborted) {
      return { status: 'cancelled', skippedDepots }
    }
    const classified = classifyDepotError(err)
    return {
      status: 'error',
      error: classified.message,
      errorAction: classified.action,
      skippedDepots
    }
  }
}
