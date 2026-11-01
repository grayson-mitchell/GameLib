// D1 report rows: counts, outcome, cached Steam title (D-13, D-20).
// D1 is a cache and counter only; GitHub stays the source of truth.
import type { D1Like } from './env'
import type { BodyEntry } from './prBody'

export type ReportRef = {
  appId: string
  key: 'macArch' | 'drm'
  op: 'add' | 'remove'
}

export type ReportRow = {
  count: number
  first_seen: number
  last_seen: number
  title: string | null
  outcome: string | null
  pr_number: number | null
  issue_number: number | null
}

export type Outcome =
  | 'pr'
  | 'issue'
  | 'suppressed'
  | 'already-known'
  | 'skipped'

export async function upsertReport(
  db: D1Like,
  r: ReportRef & { version: string },
  nowMs: number
): Promise<ReportRow> {
  const row = await db
    .prepare(
      `INSERT INTO reports (app_id, key, op, count, first_seen, last_seen, last_version) VALUES (?, ?, ?, 1, ?, ?, ?) ON CONFLICT(app_id, key, op) DO UPDATE SET count = count + 1, last_seen = excluded.last_seen, last_version = excluded.last_version RETURNING count, first_seen, last_seen, title, outcome, pr_number, issue_number`
    )
    .bind(r.appId, r.key, r.op, nowMs, nowMs, r.version)
    .first<ReportRow>()
  if (!row) throw new Error('reports upsert returned no row')
  return row
}

export async function setOutcome(
  db: D1Like,
  r: ReportRef,
  o: {
    outcome: Outcome
    prNumber?: number
    issueNumber?: number
    title?: string
  }
): Promise<void> {
  await db
    .prepare(
      `UPDATE reports SET outcome = ?, pr_number = COALESCE(?, pr_number), issue_number = COALESCE(?, issue_number), title = COALESCE(?, title) WHERE app_id = ? AND key = ? AND op = ?`
    )
    .bind(
      o.outcome,
      o.prNumber ?? null,
      o.issueNumber ?? null,
      o.title ?? null,
      r.appId,
      r.key,
      r.op
    )
    .run()
}

export async function setTitle(
  db: D1Like,
  r: ReportRef,
  title: string
): Promise<void> {
  await db
    .prepare(
      `UPDATE reports SET title = ? WHERE app_id = ? AND key = ? AND op = ?`
    )
    .bind(title, r.appId, r.key, r.op)
    .run()
}

type EntryRow = {
  key: string
  op: string
  count: number
  first_seen: number
  last_seen: number
  last_version: string | null
}

export async function entriesForApp(
  db: D1Like,
  appId: string
): Promise<BodyEntry[]> {
  const { results } = await db
    .prepare(
      `SELECT key, op, count, first_seen, last_seen, last_version FROM reports WHERE app_id = ? ORDER BY key, op`
    )
    .bind(appId)
    .all<EntryRow>()
  return results.map((e) => ({
    key: e.key as BodyEntry['key'],
    op: e.op as BodyEntry['op'],
    detector: e.key === 'macArch' ? 'macho' : 'ceg',
    count: e.count,
    firstSeen: e.first_seen,
    lastSeen: e.last_seen,
    lastVersion: e.last_version
  }))
}

export function shouldRefreshBody(count: number): boolean {
  return (
    [2, 3, 5, 10, 25, 50].includes(count) || (count >= 100 && count % 100 === 0)
  )
}
