import type { D1Like } from './env'

export const DEFAULT_IP_HOURLY_LIMIT = 10
export const DEFAULT_DAILY_CREATE_CAP = 25

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS

export function parseLimit(raw: string | undefined, fallback: number): number {
  const n = raw === undefined ? NaN : Number.parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

const pad = (n: number) => String(n).padStart(2, '0')

export function utcDayKey(nowMs: number): string {
  const d = new Date(nowMs)
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`
}

export function utcHourKey(nowMs: number): string {
  return `${utcDayKey(nowMs)}${pad(new Date(nowMs).getUTCHours())}`
}

export async function hashIp(
  salt: string,
  ip: string,
  nowMs: number
): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${ip}:${utcDayKey(nowMs)}`)
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data))
  let hex = ''
  for (const b of digest) hex += b.toString(16).padStart(2, '0')
  return hex.slice(0, 32)
}

async function bumpBucket(
  db: D1Like,
  bucket: string,
  expiresMs: number
): Promise<number> {
  const row = await db
    .prepare(
      'INSERT INTO buckets (bucket, n, expires) VALUES (?, 1, ?) ON CONFLICT(bucket) DO UPDATE SET n = n + 1 RETURNING n'
    )
    .bind(bucket, expiresMs)
    .first<{ n: number }>()
  if (!row) throw new Error('bucket upsert returned no row')
  return row.n
}

export async function checkIpLimit(
  db: D1Like,
  salt: string,
  ip: string | null,
  nowMs: number,
  limit: number
): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  const hourStart = Math.floor(nowMs / HOUR_MS) * HOUR_MS
  const who = ip ? await hashIp(salt, ip, nowMs) : 'unknown'
  const n = await bumpBucket(
    db,
    `ip:${who}:${utcHourKey(nowMs)}`,
    hourStart + 2 * HOUR_MS
  )
  if (n <= limit) return { ok: true }
  return {
    ok: false,
    retryAfterSec: Math.ceil((hourStart + HOUR_MS - nowMs) / 1000)
  }
}

export async function reserveDailyCreation(
  db: D1Like,
  nowMs: number,
  cap: number
): Promise<boolean> {
  const dayStart = Math.floor(nowMs / DAY_MS) * DAY_MS
  const n = await bumpBucket(
    db,
    `cap:${utcDayKey(nowMs)}`,
    dayStart + 2 * DAY_MS
  )
  return n <= cap
}

export async function purgeExpiredBuckets(
  db: D1Like,
  nowMs: number
): Promise<void> {
  await db.prepare('DELETE FROM buckets WHERE expires < ?').bind(nowMs).run()
}
