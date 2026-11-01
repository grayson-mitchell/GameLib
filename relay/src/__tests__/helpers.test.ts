import { createTestD1 } from './helpers/d1Sqlite'
import { createFakeFetch } from './helpers/fakeFetch'
import { generateTestKeys } from './helpers/testKeys'

describe('relay test helpers', () => {
  describe('createTestD1', () => {
    it('UPSERT RETURNING increments atomically', async () => {
      const db = createTestD1()
      const sql =
        'INSERT INTO buckets (bucket, n, expires) VALUES (?, 1, ?) ON CONFLICT(bucket) DO UPDATE SET n = n + 1 RETURNING n'
      const a = await db.prepare(sql).bind('b', 100).first<{ n: number }>()
      const b = await db.prepare(sql).bind('b', 100).first<{ n: number }>()
      expect(a?.n).toBe(1)
      expect(b?.n).toBe(2)
    })

    it('all() returns results, run() resolves, bind binds in order', async () => {
      const db = createTestD1()
      await db
        .prepare('INSERT INTO buckets (bucket, n, expires) VALUES (?, ?, ?)')
        .bind('x', 5, 9)
        .run()
      const { results } = await db
        .prepare('SELECT bucket, n, expires FROM buckets WHERE bucket = ?')
        .bind('x')
        .all<{ bucket: string; n: number; expires: number }>()
      expect(results).toEqual([{ bucket: 'x', n: 5, expires: 9 }])
      expect(
        await db
          .prepare('SELECT 1 FROM buckets WHERE bucket = ?')
          .bind('nope')
          .first()
      ).toBeNull()
    })
  })

  describe('createFakeFetch', () => {
    it('returns scripted status and json, 404 for unscripted, rejects on Error', async () => {
      const f = createFakeFetch({
        'GET https://x/y': { status: 201, json: { a: 1 } },
        'GET https://x/err': new Error('boom')
      })
      const r = await f.fetch('https://x/y')
      expect(r.status).toBe(201)
      expect(await r.json()).toEqual({ a: 1 })
      await expect(f.fetch('https://x/err')).rejects.toThrow('boom')
      const nf = await f.fetch('https://x/none')
      expect(nf.status).toBe(404)
      expect(await nf.json()).toEqual({ message: 'Not Found' })
    })

    it('consumes arrays in order and records calls', async () => {
      const f = createFakeFetch({
        'POST https://x/p': [
          { status: 200, json: { n: 1 } },
          { status: 500, json: { n: 2 } }
        ]
      })
      const r1 = await f.fetch('https://x/p', {
        method: 'POST',
        body: JSON.stringify({ q: 1 }),
        headers: { h: 'v' }
      })
      const r2 = await f.fetch('https://x/p', { method: 'POST' })
      expect(r1.status).toBe(200)
      expect(r2.status).toBe(500)
      expect(f.calls).toHaveLength(2)
      expect(f.calls[0]).toMatchObject({
        method: 'POST',
        url: 'https://x/p',
        body: { q: 1 }
      })
      expect(f.calls[0].headers.h).toBe('v')
    })

    it('tracks max concurrency', async () => {
      const f = createFakeFetch({
        'GET https://x/a': { status: 200, json: {} }
      })
      await Promise.all([
        f.fetch('https://x/a'),
        f.fetch('https://x/a'),
        f.fetch('https://x/a')
      ])
      expect(f.maxConcurrent()).toBe(3)
    })
  })

  describe('generateTestKeys', () => {
    it('produces PKCS8 and PKCS1 PEMs and a public CryptoKey', async () => {
      const k = await generateTestKeys()
      expect(k.pkcs8Pem.startsWith('-----BEGIN PRIVATE KEY-----')).toBe(true)
      expect(k.pkcs1Pem.startsWith('-----BEGIN RSA PRIVATE KEY-----')).toBe(
        true
      )
      expect(k.publicKey.type).toBe('public')
    })
  })
})
