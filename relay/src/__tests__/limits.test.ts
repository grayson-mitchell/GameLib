import {
  DEFAULT_DAILY_CREATE_CAP,
  DEFAULT_IP_HOURLY_LIMIT,
  checkIpLimit,
  hashIp,
  parseLimit,
  purgeExpiredBuckets,
  reserveDailyCreation
} from '../limits'
import { createTestD1 } from './helpers/d1Sqlite'

const HOUR = 3_600_000
const DAY = 24 * HOUR
// 2026-03-04T10:20:30Z
const T0 = Date.UTC(2026, 2, 4, 10, 20, 30)
const IP = '203.0.113.5'

function buckets(db: ReturnType<typeof createTestD1>) {
  return db.raw
    .prepare('SELECT bucket, n, expires FROM buckets')
    .all() as Array<{ bucket: string; n: number; expires: number }>
}

describe('limits', () => {
  it('hashIp is 32 hex, hides the IP, rotates daily and by salt', async () => {
    const h = await hashIp('salt', IP, T0)
    expect(h).toMatch(/^[0-9a-f]{32}$/)
    expect(h).not.toContain(IP)
    expect(await hashIp('salt', IP, T0 + 60_000)).toBe(h)
    expect(await hashIp('salt', IP, T0 + DAY)).not.toBe(h)
    expect(await hashIp('other', IP, T0)).not.toBe(h)
  })

  it('allows 10 per UTC hour, rejects the 11th with retryAfterSec, resets next hour', async () => {
    const db = createTestD1()
    for (let i = 0; i < 10; i++) {
      expect(await checkIpLimit(db, 's', IP, T0, 10)).toEqual({ ok: true })
    }
    const r = await checkIpLimit(db, 's', IP, T0, 10)
    const nextHour = Math.floor(T0 / HOUR) * HOUR + HOUR
    expect(r).toEqual({ ok: false, retryAfterSec: (nextHour - T0) / 1000 })
    expect(await checkIpLimit(db, 's', IP, nextHour, 10)).toEqual({ ok: true })
  })

  it('never stores the raw IP and uses the documented key and expiry', async () => {
    const db = createTestD1()
    await checkIpLimit(db, 's', IP, T0, 10)
    const rows = buckets(db)
    expect(rows).toHaveLength(1)
    expect(rows[0].bucket).not.toContain(IP)
    expect(rows[0].bucket).toMatch(/^ip:[0-9a-f]{32}:2026030410$/)
    expect(rows[0].expires).toBe(Math.floor(T0 / HOUR) * HOUR + HOUR)
  })

  it('uses a shared key for a missing IP', async () => {
    const db = createTestD1()
    await checkIpLimit(db, 's', null, T0, 10)
    expect(buckets(db)[0].bucket).toBe('ip:unknown:2026030410')
  })

  it('reserveDailyCreation allows 25 per UTC day then refuses, resets next day', async () => {
    const db = createTestD1()
    for (let i = 0; i < 25; i++) {
      expect(await reserveDailyCreation(db, T0, 25)).toBe(true)
    }
    expect(await reserveDailyCreation(db, T0, 25)).toBe(false)
    expect(await reserveDailyCreation(db, T0 + DAY, 25)).toBe(true)
    const row = buckets(db).find((b) => b.bucket === 'cap:20260304')
    expect(row).toBeDefined()
    expect(row?.expires).toBe(Math.floor(T0 / DAY) * DAY + 2 * DAY)
  })

  it('parses limits with fallbacks', () => {
    expect(parseLimit('7', 10)).toBe(7)
    expect(parseLimit(undefined, 10)).toBe(10)
    expect(parseLimit('0', 10)).toBe(10)
    expect(parseLimit('-3', 10)).toBe(10)
    expect(parseLimit('abc', 10)).toBe(10)
    expect(DEFAULT_IP_HOURLY_LIMIT).toBe(10)
    expect(DEFAULT_DAILY_CREATE_CAP).toBe(25)
  })

  it('purgeExpiredBuckets deletes only expired rows', async () => {
    const db = createTestD1()
    db.raw.exec(
      `INSERT INTO buckets VALUES ('old', 1, ${T0 - 1}), ('edge', 1, ${T0}), ('new', 1, ${T0 + 1})`
    )
    await purgeExpiredBuckets(db, T0)
    expect(
      buckets(db)
        .map((b) => b.bucket)
        .sort()
    ).toEqual(['edge', 'new'])
  })

  it('propagates D1 errors', async () => {
    const db = createTestD1()
    db.raw.exec('DROP TABLE buckets')
    await expect(checkIpLimit(db, 's', IP, T0, 10)).rejects.toThrow()
    await expect(reserveDailyCreation(db, T0, 25)).rejects.toThrow()
  })
})
