import { createTestD1 } from './helpers/d1Sqlite'
import { generateTestKeys } from './helpers/testKeys'
import type { FetchCall } from './helpers/fakeFetch'
import type { RelayEnv } from '../env'
import { resetTokenCacheForTests } from '../githubApp'
import { handleReport } from '../handler'
import { utcDayKey } from '../limits'
import {
  entriesForApp,
  setOutcome,
  shouldRefreshBody,
  upsertReport
} from '../reportsTable'

type Pull = { number: number; merged_at: string | null; body: string }
type Script = {
  steam?: { status: number; json?: unknown }
  closed?: Pull[]
  putStatus?: number
}

const valid = () => ({
  v: 1,
  store: 'steam',
  appId: '220',
  key: 'macArch',
  value: '32',
  op: 'add',
  gamelibVersion: '0.8.0'
})

const NOW = Date.UTC(2026, 10, 2, 12, 0, 0)

async function harness(envOver: Partial<RelayEnv> = {}, script: Script = {}) {
  resetTokenCacheForTests()
  const keys = await generateTestKeys()
  const db = createTestD1()
  const calls: FetchCall[] = []
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status })
  const fetch = async (url: string, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase()
    let body: unknown
    if (typeof init?.body === 'string') body = JSON.parse(init.body)
    calls.push({ method, url, body, headers: {} })
    if (url.startsWith('https://store.steampowered.com/')) {
      const s = script.steam ?? {
        status: 200,
        json: {
          '220': { success: true, data: { type: 'game', name: 'Half-Life 2' } }
        }
      }
      return json(s.status, s.json ?? {})
    }
    if (url.endsWith('/access_tokens')) {
      return json(201, { token: 'tok', expires_at: '2099-01-01T00:00:00Z' })
    }
    if (method === 'GET' && url.includes('/contents/')) return json(404, {})
    if (method === 'GET' && url.includes('state=open')) return json(200, [])
    if (method === 'GET' && url.includes('state=closed')) {
      return json(200, script.closed ?? [])
    }
    if (method === 'GET' && url.includes('/git/ref/heads/')) {
      return json(200, { object: { sha: 'base' } })
    }
    if (method === 'POST' && url.endsWith('/git/refs')) return json(201, {})
    if (method === 'PUT') {
      return json(script.putStatus ?? 201, { content: { sha: 'new' } })
    }
    if (method === 'POST' && url.endsWith('/pulls'))
      return json(201, { number: 7 })
    if (method === 'PATCH') return json(200, {})
    return json(404, {})
  }
  const env: RelayEnv = {
    DB: db,
    REPO_OWNER: 'o',
    REPO_NAME: 'r',
    BASE_BRANCH: 'main',
    GITHUB_APP_ID: '1',
    GITHUB_INSTALLATION_ID: '42',
    GITHUB_APP_PRIVATE_KEY: keys.pkcs8Pem,
    IP_HASH_SALT: 'salt',
    ...envOver
  }
  const deps = { db, fetch, now: () => NOW, random: () => 0.5, env }
  const request = (o: {
    method?: string
    path?: string
    contentType?: string
    body?: string
    ip?: string
    headers?: Record<string, string>
  }) =>
    new Request(`https://relay.test${o.path ?? '/v1/reports'}`, {
      method: o.method ?? 'POST',
      headers: {
        'Content-Type': o.contentType ?? 'application/json',
        'CF-Connecting-IP': o.ip ?? '198.51.100.1',
        ...o.headers
      },
      body: o.method === 'GET' ? undefined : (o.body ?? JSON.stringify(valid()))
    })
  return {
    db,
    calls,
    deps,
    request,
    send: (o: Parameters<typeof request>[0]) => handleReport(request(o), deps)
  }
}

describe('repeat', () => {
  const r = { appId: '1', key: 'macArch' as const, op: 'add' as const }

  it('counts repeats and keeps first_seen', async () => {
    const db = createTestD1()
    const a = await upsertReport(db, { ...r, version: '0.8.0' }, 100)
    expect(a).toMatchObject({
      count: 1,
      outcome: null,
      title: null,
      pr_number: null
    })
    const b = await upsertReport(db, { ...r, version: '0.9.0' }, 200)
    expect(b.count).toBe(2)
    expect(b.first_seen).toBe(100)
    expect(b.last_seen).toBe(200)
    const e = await entriesForApp(db, '1')
    expect(e[0].lastVersion).toBe('0.9.0')
  })

  it('persists outcome, pr number and title', async () => {
    const db = createTestD1()
    await upsertReport(db, { ...r, version: '0.8.0' }, 100)
    await setOutcome(db, r, { outcome: 'pr', prNumber: 7, title: 'T' })
    const n = await upsertReport(db, { ...r, version: '0.8.0' }, 101)
    expect(n).toMatchObject({ outcome: 'pr', pr_number: 7, title: 'T' })
  })

  it('lists entries for an app with derived detector', async () => {
    const db = createTestD1()
    await upsertReport(db, { ...r, version: '1' }, 1)
    await upsertReport(
      db,
      { appId: '1', key: 'drm', op: 'add', version: '1' },
      2
    )
    await upsertReport(
      db,
      { appId: '2', key: 'drm', op: 'add', version: '1' },
      2
    )
    const e = await entriesForApp(db, '1')
    expect(e).toHaveLength(2)
    expect(e.find((x) => x.key === 'macArch')?.detector).toBe('macho')
    expect(e.find((x) => x.key === 'drm')?.detector).toBe('ceg')
  })

  it('throttles body refreshes', () => {
    for (const n of [2, 3, 5, 10, 25, 50, 100, 200, 300]) {
      expect(shouldRefreshBody(n)).toBe(true)
    }
    for (const n of [1, 4, 6, 11, 99, 101, 150]) {
      expect(shouldRefreshBody(n)).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// HTTP edge
// ---------------------------------------------------------------------------

describe('edge', () => {
  it('rejects non-POST with 405 and wrong path with 404', async () => {
    const h = await harness()
    expect((await h.send({ method: 'GET' })).status).toBe(405)
    expect((await h.send({ path: '/other' })).status).toBe(404)
  })

  it('rejects content type, size and bad JSON', async () => {
    const h = await harness()
    expect((await h.send({ contentType: 'text/plain' })).status).toBe(415)
    const big = JSON.stringify({ ...valid(), pad: 'x'.repeat(3000) })
    expect((await h.send({ body: big })).status).toBe(413)
    const bad = await h.send({ body: '{' })
    expect(bad.status).toBe(400)
    expect((await bad.json()).status).toBe('rejected')
  })

  it('rejects schema failures with zero outbound calls', async () => {
    const h = await harness()
    for (const body of [
      { ...valid(), key: 'drm', value: 'ceg', op: 'remove' },
      { ...valid(), title: 'x' },
      { ...valid(), appId: '01' }
    ]) {
      const res = await h.send({ body: JSON.stringify(body) })
      expect(res.status).toBe(422)
      expect((await res.json()).status).toBe('rejected')
    }
    expect(h.calls).toHaveLength(0)
  })
})

describe('limits', () => {
  it('429s the 11th request from one IP and counts rejected ones', async () => {
    const h = await harness()
    for (let i = 0; i < 5; i++) {
      await h.send({ contentType: 'text/plain' })
    }
    for (let i = 0; i < 5; i++) {
      expect((await h.send({ body: '{' })).status).toBe(400)
    }
    const res = await h.send({ body: '{' })
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toMatch(/^\d+$/)
    expect((await res.json()).status).toBe('rate-limited')
  })

  it('429s over the daily cap and leaves the outcome NULL', async () => {
    const h = await harness({ DAILY_CREATE_CAP: '1', IP_HOURLY_LIMIT: '1000' })
    h.db.raw
      .prepare('INSERT INTO buckets (bucket, n, expires) VALUES (?, 1, ?)')
      .run(`cap:${utcDayKey(NOW)}`, NOW + 86_400_000)
    const res = await h.send({})
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toMatch(/^\d+$/)
    const row = h.db.raw.prepare('SELECT outcome FROM reports').get() as {
      outcome: string | null
    }
    expect(row.outcome).toBeNull()
  })
})

describe('title', () => {
  it('422s an unknown app with no GitHub call', async () => {
    const h = await harness(
      {},
      { steam: { status: 200, json: { '220': { success: false } } } }
    )
    expect((await h.send({})).status).toBe(422)
    expect(h.calls.filter((c) => c.url.includes('github'))).toHaveLength(0)
  })

  it('503s when Steam is down', async () => {
    const h = await harness({}, { steam: { status: 503 } })
    const res = await h.send({})
    expect(res.status).toBe(503)
    expect((await res.json()).status).toBe('unavailable')
  })

  it('uses only the Steam title and ignores client headers', async () => {
    const h = await harness()
    const res = await h.send({ headers: { 'X-Title': 'CLIENT-TITLE' } })
    expect(res.status).toBe(201)
    const put = h.calls.find((c) => c.method === 'PUT')
    const file = JSON.parse(
      Buffer.from(
        (put?.body as { content: string }).content,
        'base64'
      ).toString()
    )
    expect(JSON.stringify(file)).toContain('Half-Life 2')
    for (const c of h.calls) {
      expect(JSON.stringify(c.body ?? '')).not.toContain('CLIENT-TITLE')
    }
  })
})

describe('repeat (handler)', () => {
  it('creates once, then counts, refreshing the body at 2 and not 4', async () => {
    const h = await harness()
    const first = await h.send({})
    expect(first.status).toBe(201)
    expect((await first.json()).pr).toBe(7)
    const count = (m: string, u: string) =>
      h.calls.filter((c) => c.method === m && c.url.includes(u)).length
    expect(count('POST', '/pulls')).toBe(1)

    const second = await h.send({})
    expect(second.status).toBe(200)
    expect((await second.json()).status).toBe('counted')
    expect(count('POST', '/pulls')).toBe(1)
    expect(count('PATCH', '/pulls/7')).toBe(1)
    await h.send({}) // 3 -> refresh
    expect(count('PATCH', '/pulls/7')).toBe(2)
    await h.send({}) // 4 -> none
    expect(count('PATCH', '/pulls/7')).toBe(2)
  })

  it('only counts a suppressed row, with no GitHub calls', async () => {
    const h = await harness()
    await upsertReport(
      h.db,
      { appId: '220', key: 'macArch', op: 'add', version: '1' },
      1
    )
    await setOutcome(
      h.db,
      { appId: '220', key: 'macArch', op: 'add' },
      { outcome: 'suppressed' }
    )
    const res = await h.send({})
    expect(res.status).toBe(200)
    expect((await res.json()).status).toBe('counted')
    expect(h.calls).toHaveLength(0)
  })
})

describe('closed', () => {
  it('stores suppressed when an operator closed the PR', async () => {
    const h = await harness(
      {},
      {
        closed: [
          {
            number: 3,
            merged_at: null,
            body: '<!-- gamelib-report: macArch:add -->'
          }
        ]
      }
    )
    const res = await h.send({})
    expect(res.status).toBe(200)
    expect((await res.json()).status).toBe('suppressed')
    const row = h.db.raw.prepare('SELECT outcome FROM reports').get() as {
      outcome: string
    }
    expect(row.outcome).toBe('suppressed')
  })
})

describe('failures', () => {
  it('503s on a GitHub 409 and leaves the outcome NULL', async () => {
    const h = await harness({}, { putStatus: 409 })
    expect((await h.send({})).status).toBe(503)
    const row = h.db.raw.prepare('SELECT outcome FROM reports').get() as {
      outcome: string | null
    }
    expect(row.outcome).toBeNull()
  })

  it('503s on a PKCS#1 key without leaking it', async () => {
    const keys = await generateTestKeys()
    const h = await harness({ GITHUB_APP_PRIVATE_KEY: keys.pkcs1Pem })
    const res = await h.send({})
    expect(res.status).toBe(503)
    expect(await res.text()).not.toContain('PRIVATE KEY')
  })

  it('503s when D1 throws', async () => {
    const h = await harness()
    const res = await handleReport(h.request({}), {
      ...h.deps,
      db: {
        prepare: () => {
          throw new Error('d1 down')
        }
      }
    })
    expect(res.status).toBe(503)
  })

  it('never rejects on an unexpected throw', async () => {
    const h = await harness()
    const res = await handleReport(h.request({}), {
      ...h.deps,
      fetch: () => {
        throw new TypeError('boom')
      }
    })
    expect(res.status).toBe(503)
  })
})

describe('privacy', () => {
  it('never logs the client IP', async () => {
    const h = await harness({}, { steam: { status: 503 } })
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined)
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    await h.send({ ip: '203.0.113.77' })
    await h.send({ ip: '203.0.113.77', body: '{' })
    const all = JSON.stringify([...log.mock.calls, ...err.mock.calls])
    expect(all).not.toContain('203.0.113.77')
    log.mockRestore()
    err.mockRestore()
  })
})
