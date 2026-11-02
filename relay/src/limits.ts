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

/**
 * WR-02: the rate-limit subject for a client address. One IPv6 client
 * normally controls a whole /64, so IPv6 is bucketed by its /64 prefix
 * (compressed, zoned and IPv4-mapped forms normalised); IPv4 is unchanged.
 * An unparsable value is used as-is (lowercased).
 */
export function rateLimitSubject(ip: string): string {
  const raw = ip.trim().toLowerCase()
  if (!raw.includes(':')) return raw
  const addr = raw.replace(/%.*$/, '')
  const hextets = expandIpv6(addr)
  if (hextets === null) return raw
  // ::ffff:a.b.c.d is an IPv4 client.
  if (hextets.slice(0, 5).every((h) => h === 0) && hextets[5] === 0xffff) {
    return [
      hextets[6] >> 8,
      hextets[6] & 255,
      hextets[7] >> 8,
      hextets[7] & 255
    ].join('.')
  }
  return (
    hextets
      .slice(0, 4)
      .map((h) => h.toString(16).padStart(4, '0'))
      .join(':') + '::/64'
  )
}

function expandIpv6(addr: string): number[] | null {
  const halves = addr.split('::')
  if (halves.length > 2) return null
  const parse = (part: string): number[] | null => {
    if (part === '') return []
    const out: number[] = []
    const groups = part.split(':')
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i]
      if (i === groups.length - 1 && g.includes('.')) {
        const q = g.split('.')
        if (
          q.length !== 4 ||
          !q.every((o) => /^\d{1,3}$/.test(o) && Number(o) <= 255)
        ) {
          return null
        }
        const [a, b, c, d] = q.map(Number)
        out.push((a << 8) | b, (c << 8) | d)
      } else if (/^[0-9a-f]{1,4}$/.test(g)) {
        out.push(Number.parseInt(g, 16))
      } else {
        return null
      }
    }
    return out
  }
  const head = parse(halves[0])
  const tail = halves.length === 2 ? parse(halves[1]) : []
  if (head === null || tail === null) return null
  if (halves.length === 1) return head.length === 8 ? head : null
  const fill = 8 - head.length - tail.length
  if (fill < 1) return null
  return [...head, ...new Array<number>(fill).fill(0), ...tail]
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
  const who = ip ? await hashIp(salt, rateLimitSubject(ip), nowMs) : 'unknown'
  // CR-03: an hourly bucket is useless once its hour ends, so it expires
  // then; the per-request and cron purges delete it within the next 30 min,
  // well inside the "about two hours" the privacy copy promises.
  const n = await bumpBucket(
    db,
    `ip:${who}:${utcHourKey(nowMs)}`,
    hourStart + HOUR_MS
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

/** CR-03: one indexed DELETE; runs on every request and from the cron. */
export async function purgeExpiredBuckets(
  db: D1Like,
  nowMs: number
): Promise<void> {
  await db.prepare('DELETE FROM buckets WHERE expires < ?').bind(nowMs).run()
}
