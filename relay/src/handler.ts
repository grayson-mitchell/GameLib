// HTTP edge of the known-fix relay: gating, limits, validation, D1 rows,
// Steam title, token minting and the call into publishReport.
// handleReport never throws: any internal error answers 503.
import {
  KNOWN_FIX_REPORT_MAX_BYTES,
  parseKnownFixReport,
  type RelayResponseBody
} from '../../src/common/knownFixReport'
import type { RelayDeps } from './env'
import {
  GitHubUnavailableError,
  PrivateKeyFormatError,
  getInstallationToken
} from './githubApp'
import { createRepoClient } from './githubFiles'
import {
  DEFAULT_DAILY_CREATE_CAP,
  DEFAULT_IP_HOURLY_LIMIT,
  checkIpLimit,
  parseLimit,
  purgeExpiredBuckets,
  reserveDailyCreation
} from './limits'
import { renderPrBody } from './prBody'
import { publishReport } from './publish'
import {
  acquirePublishLock,
  entriesForPr,
  readReport,
  releasePublishLock,
  setOutcome,
  setTitle,
  shouldRefreshBody,
  upsertReport,
  type ReportRef,
  type ReportRow
} from './reportsTable'
import { lookupSteamTitle } from './steamTitle'

const DAY_MS = 86_400_000

function respond(
  httpStatus: number,
  body: RelayResponseBody,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status: httpStatus,
    headers: { 'Content-Type': 'application/json', ...headers }
  })
}

export async function handleReport(
  request: Request,
  deps: RelayDeps
): Promise<Response> {
  let label = 'relay: ?'
  try {
    return await handle(request, deps, (l) => (label = l))
  } catch (err) {
    const name = err instanceof Error ? err.constructor.name : 'unknown'
    const message = err instanceof Error ? err.message : ''
    console.log(`${label} -> 503 unavailable (${name}: ${message})`)
    return respond(503, { status: 'unavailable' })
  }
}

async function handle(
  request: Request,
  deps: RelayDeps,
  setLabel: (l: string) => void
): Promise<Response> {
  const { db, env } = deps
  const now = deps.now()

  // CR-03: delete expired rate-limit buckets (hashed IPs) on every request,
  // before any validation, so the retention promise holds even at low
  // traffic. The cron in index.ts covers the idle hours.
  try {
    await purgeExpiredBuckets(db, now)
  } catch {
    // best effort; the cron retries
  }

  if (request.method !== 'POST') return respond(405, { status: 'rejected' })
  if (new URL(request.url).pathname !== '/v1/reports') {
    return respond(404, { status: 'rejected' })
  }

  // D-15: every attempt counts, including the ones rejected below.
  const limit = await checkIpLimit(
    db,
    env.IP_HASH_SALT,
    request.headers.get('CF-Connecting-IP'),
    now,
    parseLimit(env.IP_HOURLY_LIMIT, DEFAULT_IP_HOURLY_LIMIT)
  )
  if (!limit.ok) {
    return respond(
      429,
      { status: 'rate-limited' },
      { 'Retry-After': String(limit.retryAfterSec) }
    )
  }

  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().startsWith('application/json')) {
    return respond(415, { status: 'rejected', detail: 'content type' })
  }
  const declared = Number(request.headers.get('content-length') ?? 0)
  if (declared > KNOWN_FIX_REPORT_MAX_BYTES) {
    return respond(413, { status: 'rejected', detail: 'too large' })
  }
  const text = await request.text()
  if (new TextEncoder().encode(text).length > KNOWN_FIX_REPORT_MAX_BYTES) {
    return respond(413, { status: 'rejected', detail: 'too large' })
  }
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return respond(400, { status: 'rejected', detail: 'invalid JSON' })
  }
  const parsed = parseKnownFixReport(json)
  if (!parsed.ok) {
    return respond(422, { status: 'rejected', detail: parsed.error })
  }
  const report = parsed.report
  const ref: ReportRef = { appId: report.appId, key: report.key, op: report.op }
  setLabel(`relay: ${ref.appId} ${ref.key} ${ref.op}`)
  const done = (
    httpStatus: number,
    body: RelayResponseBody,
    h?: Record<string, string>
  ) => {
    console.log(
      `relay: ${ref.appId} ${ref.key} ${ref.op} -> ${httpStatus} ${body.status}`
    )
    return respond(httpStatus, body, h)
  }

  const row = await upsertReport(
    db,
    { ...ref, version: report.gamelibVersion },
    now
  )
  const github = async () => {
    const token = await getInstallationToken(env, deps.fetch, now)
    return createRepoClient({
      fetch: deps.fetch,
      token,
      owner: env.REPO_OWNER,
      repo: env.REPO_NAME
    })
  }

  // D-13 / D-20: a row with an outcome is counted only; never opens a PR
  // or issue.
  const counted = (r: ReportRow) =>
    done(200, {
      status: 'counted',
      ...(r.pr_number !== null ? { pr: r.pr_number } : {}),
      ...(r.issue_number !== null ? { issue: r.issue_number } : {})
    })

  try {
    if (row.outcome !== null) {
      if (
        row.outcome === 'pr' &&
        row.pr_number !== null &&
        shouldRefreshBody(row.count)
      ) {
        // CR-02: refresh only while holding the app's lease, so it cannot
        // overwrite a concurrent fold's body. A held lease skips the refresh.
        const lease = await acquirePublishLock(db, ref.appId, now)
        if (lease !== null) {
          try {
            const gh = await github()
            // CR-01: never rewrite a closed or merged PR; its D-20 marker
            // must keep exactly what it proposed when the operator closed it.
            if ((await gh.getPullState(row.pr_number)) === 'open') {
              await gh.updatePullBody(
                row.pr_number,
                renderPrBody({
                  appId: ref.appId,
                  title: row.title ?? '',
                  entries: await entriesForPr(db, ref.appId, row.pr_number, ref)
                })
              )
            }
          } catch (err) {
            const name = err instanceof Error ? err.constructor.name : 'unknown'
            console.log(`relay: ${ref.appId} body refresh failed (${name})`)
          } finally {
            await releaseLease(lease)
          }
        }
      }
      return counted(row)
    }

    let title = row.title
    if (title === null) {
      const found = await lookupSteamTitle(ref.appId, deps.fetch)
      if (!found.ok) {
        if (found.kind === 'unknown-app') {
          return done(422, { status: 'rejected', detail: 'unknown Steam app' })
        }
        return done(503, { status: 'unavailable' })
      }
      title = found.title
      await setTitle(db, ref, title)
    }

    // CR-02: one publish per appId at a time (the branch is per appId). A
    // request that loses the lease answers a retryable 503 and leaves its
    // outcome NULL, so the client retries and the next attempt folds or is
    // counted against whatever the winner produced.
    const lease = await acquirePublishLock(db, ref.appId, now)
    if (lease === null) {
      return done(503, { status: 'unavailable', detail: 'busy' })
    }
    try {
      return await publishLocked(title)
    } finally {
      await releaseLease(lease)
    }
  } catch (err) {
    if (
      err instanceof PrivateKeyFormatError ||
      err instanceof GitHubUnavailableError
    ) {
      console.log(
        `relay: ${ref.appId} ${ref.key} ${ref.op} -> 503 unavailable (${err.constructor.name}: ${err.message})`
      )
      return respond(503, { status: 'unavailable' })
    }
    throw err
  }

  async function releaseLease(lease: string): Promise<void> {
    try {
      await releasePublishLock(db, ref.appId, lease)
    } catch {
      // best effort: the lease expires on its own after PUBLISH_LOCK_MS
    }
  }

  async function publishLocked(title: string): Promise<Response> {
    // Re-read under the lease: a request that held it before us may have
    // published this very ref since our upsert.
    const fresh = await readReport(db, ref)
    if (fresh !== null && fresh.outcome !== null) return counted(fresh)

    const gh = await github()
    const outcome = await publishReport({
      report,
      title,
      detector: ref.key === 'macArch' ? 'macho' : 'ceg',
      gh,
      baseBranch: env.BASE_BRANCH,
      entriesFor: (prNumber) => entriesForPr(db, ref.appId, prNumber, ref),
      reserveCreation: () =>
        reserveDailyCreation(
          db,
          now,
          parseLimit(env.DAILY_CREATE_CAP, DEFAULT_DAILY_CREATE_CAP)
        )
    })

    switch (outcome.status) {
      case 'created': {
        if (outcome.issueNumber !== undefined) {
          await setOutcome(db, ref, {
            outcome: 'issue',
            issueNumber: outcome.issueNumber
          })
          return done(201, { status: 'created', issue: outcome.issueNumber })
        }
        await setOutcome(db, ref, { outcome: 'pr', prNumber: outcome.prNumber })
        return done(201, { status: 'created', pr: outcome.prNumber })
      }
      case 'updated':
        await setOutcome(db, ref, { outcome: 'pr', prNumber: outcome.prNumber })
        return done(200, { status: 'updated', pr: outcome.prNumber })
      case 'counted':
        await setOutcome(db, ref, {
          outcome: 'issue',
          issueNumber: outcome.issueNumber
        })
        return done(200, { status: 'counted', issue: outcome.issueNumber })
      case 'already-known':
      case 'suppressed':
      case 'skipped':
        await setOutcome(db, ref, {
          outcome:
            outcome.status === 'already-known'
              ? 'already-known'
              : outcome.status
        })
        return done(200, { status: outcome.status })
      case 'rate-limited': {
        const next = (Math.floor(now / DAY_MS) + 1) * DAY_MS
        return done(
          429,
          { status: 'rate-limited' },
          { 'Retry-After': String(Math.max(1, Math.ceil((next - now) / 1000))) }
        )
      }
    }
  }
}
