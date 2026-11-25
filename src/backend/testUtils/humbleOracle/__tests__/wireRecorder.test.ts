/**
 * The Humble wire recorder, end to end (94-06 Task 1, the tracer).
 *
 * The committed cases drive the REAL adapter and resolver exports against the recorder in the
 * default replay-and-compare mode: the request that arrives on the socket is compared with the one
 * recorded from the same code, header by header, in arrival order, including the headers Node adds
 * that the TS source never sets. `GAMELIB_WRITE_HUMBLE_GOLDEN=1` re-records them from the
 * synthetic responses below. The self-tests run on a temporary fixtures root.
 */
import axios from 'axios'
import { createServer } from 'http'
import { gzipSync } from 'zlib'
import type { AddressInfo } from 'net'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { getSessionStatus } from 'backend/humble/adapter'
import { searchSteamStoreApps } from 'backend/humble/steamAppIdResolver'
import { createFakeHomeProfile } from 'backend/testUtils/fakeHomeProfile'
import {
  humbleOracleMode,
  overrideFixturesRoot,
  humbleRecordedCaseDir,
  redactHeaderValue,
  redactTarget,
  redactText,
  startWireRecorder,
  type RecordedRequest,
  type SyntheticResponse
} from '../wireRecorder'
import * as humbleConstants from 'backend/humble/constants'
import {
  pointHumbleAt,
  pointSteamStoreSearchAt,
  withWireRecorder
} from '../harness'

const JSON_TYPE: [string, string][] = [['content-type', 'application/json']]

const sessionStatus = (status: string): SyntheticResponse => ({
  target: '/api/auth/session-status',
  status: 200,
  headers: JSON_TYPE,
  body: JSON.stringify({ status })
})

const headerNames = (request: RecordedRequest): string[] =>
  request.headers.map(([name]) => name.toLowerCase())

const headerValue = (
  request: RecordedRequest,
  name: string
): string | undefined =>
  request.headers.find(([n]) => n.toLowerCase() === name)?.[1]

describe('the Humble wire recorder: committed cases replay against the real TS', () => {
  it('getSessionStatus sends the Cookie the TS builds and the implicit headers Node adds', async () => {
    // The tracer, spelled out: the recorder, the pointing and the undo, with no helper between.
    const recorder = await startWireRecorder({
      slice: 'wire',
      caseId: 'session-status-simpleauth',
      synthetic: [sessionStatus('authenticated')]
    })
    const unpoint = pointHumbleAt(recorder.baseUrl)
    let status: string
    try {
      status = await getSessionStatus('a-fake-session-cookie')
      expect(recorder.requests).toHaveLength(1)
      const request = recorder.requests[0] as RecordedRequest
      // The Cookie the TS builds (adapter.ts: a bare value becomes `_simpleauth_sess=<value>`),
      // redacted before anything is recorded.
      expect(headerValue(request, 'cookie')).toBe('_simpleauth_sess=REDACTED')
      expect(JSON.stringify(request)).not.toContain('a-fake-session-cookie')
      // Headers the TS source never sets, added by axios and by Node's http client.
      expect(headerNames(request)).toEqual(
        expect.arrayContaining(['accept-encoding', 'user-agent', 'host'])
      )
      expect(headerValue(request, 'host')).toBe('www.humblebundle.com')
      expect(request.method).toBe('GET')
      expect(request.target).toBe('/api/auth/session-status')
    } finally {
      unpoint()
      await recorder.close()
    }
    expect(status).toBe('authenticated')
  })

  it('pointHumbleAt swaps HUMBLE_BASE_URL and its undo restores the real one', () => {
    const unpoint = pointHumbleAt('http://127.0.0.1:1')
    expect(humbleConstants.HUMBLE_BASE_URL).toBe('http://127.0.0.1:1')
    unpoint()
    expect(humbleConstants.HUMBLE_BASE_URL).toBe('https://www.humblebundle.com')
  })

  it('a stored ory_session cookie is sent as given and redacted by value', async () => {
    const status = await withWireRecorder(
      {
        slice: 'wire',
        caseId: 'session-status-ory',
        synthetic: [sessionStatus('anonymous')]
      },
      async (recorder) => {
        const out = await getSessionStatus(
          'ory_session_projectslug=ory-secret-value'
        )
        const request = recorder.requests[0] as RecordedRequest
        expect(headerValue(request, 'cookie')).toBe(
          'ory_session_projectslug=REDACTED'
        )
        return out
      }
    )
    expect(status).toBe('anonymous')
  })

  it('searchSteamStoreApps reaches the recorder through the interceptor, with its query', async () => {
    const items = await withWireRecorder(
      {
        slice: 'wire',
        caseId: 'steam-storesearch',
        synthetic: [
          {
            target: '/api/storesearch/?term=Hades&l=english&cc=US',
            status: 200,
            headers: JSON_TYPE,
            body: JSON.stringify({
              total: 1,
              items: [{ type: 'app', name: 'Hades', id: 1145360 }]
            })
          }
        ]
      },
      async (recorder) => {
        const found = await searchSteamStoreApps('Hades')
        const request = recorder.requests[0] as RecordedRequest
        expect(request.target).toBe(
          '/api/storesearch/?term=Hades&l=english&cc=US'
        )
        expect(headerValue(request, 'user-agent')).toBe('GameLib')
        // The interceptor's own routing header is never part of what the TS sent.
        expect(headerNames(request)).not.toContain('x-oracle-upstream')
        expect(headerValue(request, 'host')).toBe('store.steampowered.com')
        return found
      }
    )
    expect(items).toEqual([{ type: 'app', name: 'Hades', id: 1145360 }])
  })

  it('every committed case has its exchanges.json', () => {
    for (const caseId of [
      'session-status-simpleauth',
      'session-status-ory',
      'steam-storesearch'
    ]) {
      expect(
        existsSync(
          join(humbleRecordedCaseDir('wire', caseId), 'exchanges.json')
        )
      ).toBe(true)
    }
  })
})

describe('the Humble wire recorder: self-tests on a temporary fixtures root', () => {
  let restoreRoot: () => void = () => undefined
  let dispose: () => void = () => undefined

  beforeEach(() => {
    const profile = createFakeHomeProfile({ prefix: 'gamelib-wire-selftest-' })
    dispose = () => profile.dispose()
    restoreRoot = overrideFixturesRoot(join(profile.root, 'fixtures'))
  })

  afterEach(() => {
    restoreRoot()
    dispose()
  })

  it('pointSteamStoreSearchAt only rewrites the Steam store origin and its undo ejects it', async () => {
    const recorder = await startWireRecorder({
      slice: 's',
      caseId: 'steam-interceptor',
      mode: 'write',
      synthetic: [{ target: '/other', status: 200 }]
    })
    const unpoint = pointSteamStoreSearchAt(recorder.baseUrl)
    try {
      // Another origin passes through untouched (here: straight to the recorder, by its own URL).
      const response = await axios.get(`${recorder.baseUrl}/other`)
      expect(response.status).toBe(200)
      expect(recorder.requests).toHaveLength(1)
    } finally {
      unpoint()
      await recorder.close()
    }
    expect(
      (
        axios.interceptors.request as unknown as { handlers: unknown[] }
      ).handlers.filter(Boolean)
    ).toHaveLength(0)
  })

  it('the mode comes from the environment, forward wins over write', () => {
    const before = { ...process.env }
    try {
      delete process.env.GAMELIB_ORACLE_HUMBLE
      delete process.env.GAMELIB_WRITE_HUMBLE_GOLDEN
      expect(humbleOracleMode()).toBe('replay')
      process.env.GAMELIB_WRITE_HUMBLE_GOLDEN = '1'
      expect(humbleOracleMode()).toBe('write')
      process.env.GAMELIB_ORACLE_HUMBLE = 'forward'
      expect(humbleOracleMode()).toBe('forward')
    } finally {
      process.env.GAMELIB_ORACLE_HUMBLE = before.GAMELIB_ORACLE_HUMBLE
      process.env.GAMELIB_WRITE_HUMBLE_GOLDEN =
        before.GAMELIB_WRITE_HUMBLE_GOLDEN
      if (before.GAMELIB_ORACLE_HUMBLE === undefined) {
        delete process.env.GAMELIB_ORACLE_HUMBLE
      }
      if (before.GAMELIB_WRITE_HUMBLE_GOLDEN === undefined) {
        delete process.env.GAMELIB_WRITE_HUMBLE_GOLDEN
      }
    }
  })

  it('an unmatched request fails loudly, even when the caller swallows the 599', async () => {
    const recorder = await startWireRecorder({
      slice: 's',
      caseId: 'unmatched',
      mode: 'replay'
    })
    const response = await fetch(`${recorder.baseUrl}/never/recorded`)
    expect(response.status).toBe(599)
    await expect(recorder.close()).rejects.toThrow(/no recorded exchange/)
  })

  it('a request that differs from its recording fails, naming what differs', async () => {
    await withWireRecorder(
      {
        slice: 's',
        caseId: 'differs',
        mode: 'write',
        synthetic: [sessionStatus('authenticated')]
      },
      () => getSessionStatus('first-cookie')
    )
    // The same code with a different Accept would be a different request; a different cookie
    // name is, after redaction, the one thing visible.
    await expect(
      withWireRecorder({ slice: 's', caseId: 'differs', mode: 'replay' }, () =>
        getSessionStatus('ory_session_other=second-cookie')
      )
    ).rejects.toThrow(/differs from its recording/)
  })

  it('a recording that was not requested again fails (a request the TS stopped making)', async () => {
    await withWireRecorder(
      {
        slice: 's',
        caseId: 'unused',
        mode: 'write',
        synthetic: [sessionStatus('authenticated')]
      },
      () => getSessionStatus('c')
    )
    await expect(
      withWireRecorder({ slice: 's', caseId: 'unused', mode: 'replay' }, () =>
        Promise.resolve('no request')
      )
    ).rejects.toThrow(/never requested/)
  })

  it('write then replay is green offline, and the recording carries no raw secret', async () => {
    await withWireRecorder(
      {
        slice: 's',
        caseId: 'roundtrip',
        mode: 'write',
        synthetic: [sessionStatus('authenticated')]
      },
      () => getSessionStatus('very-secret-cookie')
    )
    const text = readFileSync(
      join(humbleRecordedCaseDir('s', 'roundtrip'), 'exchanges.json'),
      'utf8'
    )
    expect(text).not.toContain('very-secret-cookie')
    expect(text).toContain('_simpleauth_sess=REDACTED')
    const status = await withWireRecorder(
      { slice: 's', caseId: 'roundtrip', mode: 'replay' },
      () => getSessionStatus('very-secret-cookie')
    )
    expect(status).toBe('authenticated')
  })

  it('records a multipart body as field names and values in order, without the boundary', async () => {
    const recorder = await startWireRecorder({
      slice: 's',
      caseId: 'multipart',
      mode: 'write',
      synthetic: [
        { method: 'POST', target: '/home/library?page=2', status: 204 }
      ]
    })
    try {
      const form = new FormData()
      form.append('_1_requestId', '2')
      form.append('_1_page', '2')
      form.append('0', '["$undefined","$K1"]')
      const response = await fetch(`${recorder.baseUrl}/home/library?page=2`, {
        method: 'POST',
        body: form
      })
      expect(response.status).toBe(204)
      const request = recorder.requests[0] as RecordedRequest
      expect(request.multipart?.map((p) => p.name)).toEqual([
        '_1_requestId',
        '_1_page',
        '0'
      ])
      expect(request.multipart?.[1]?.value).toBe('2')
      expect(request.body).toBeUndefined()
      expect(headerValue(request, 'content-type')).toBe(
        'multipart/form-data; boundary=<BOUNDARY>'
      )
      expect(headerValue(request, 'content-length')).toBe('<LENGTH>')
    } finally {
      await recorder.close()
    }
  })

  it('redacts the reveal POST body ids and a gamekey in the path', async () => {
    const recorder = await startWireRecorder({
      slice: 's',
      caseId: 'reveal',
      mode: 'write',
      synthetic: [
        {
          method: 'POST',
          target: '/home/library/AbCdEfGhIjKlMnOp',
          status: 200
        }
      ]
    })
    try {
      await fetch(`${recorder.baseUrl}/home/library/AbCdEfGhIjKlMnOp`, {
        method: 'POST',
        headers: { 'content-type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify(['key-id-123', 'integration-9', '$undefined'])
      })
      const request = recorder.requests[0] as RecordedRequest
      expect(request.target).toBe('/home/library/REDACTED')
      expect(request.body?.utf8).toBe('["REDACTED","REDACTED","$undefined"]')
    } finally {
      await recorder.close()
    }
    const written = readFileSync(
      join(humbleRecordedCaseDir('s', 'reveal'), 'exchanges.json'),
      'utf8'
    )
    expect(written).not.toContain('AbCdEfGhIjKlMnOp')
  })

  it('forward mode proxies to the named upstream and records the redacted response', async () => {
    const seen: { origin?: string; referer?: string; encoding?: string }[] = []
    const upstream = createServer((req, res) => {
      seen.push({
        origin: req.headers.origin,
        referer: req.headers.referer,
        encoding: req.headers['accept-encoding']
      })
      res.setHeader('content-type', 'application/json')
      res.setHeader('content-encoding', 'gzip')
      res.setHeader(
        'set-cookie',
        '_simpleauth_sess=server-issued; Path=/; HttpOnly'
      )
      res.setHeader('x-cdn-edge', 'colo-123')
      res.end(
        gzipSync(
          JSON.stringify({
            gamekey: 'RealGameKey12345',
            email: 'me@example.test',
            ok: req.url
          })
        )
      )
    })
    await new Promise<void>((resolve) =>
      upstream.listen(0, '127.0.0.1', resolve)
    )
    const origin = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`
    try {
      const recorder = await startWireRecorder({
        slice: 's',
        caseId: 'forward',
        mode: 'forward',
        upstream: () => origin
      })
      let body = ''
      try {
        const response = await fetch(`${recorder.baseUrl}/api/probe`, {
          headers: {
            cookie: '_simpleauth_sess=live-secret',
            origin: recorder.baseUrl,
            referer: `${recorder.baseUrl}/home/library`,
            'accept-encoding': 'gzip'
          }
        })
        body = await response.text()
        // What the real host chose to do with its answer is kept beside the recording.
        expect(recorder.upstream).toEqual([
          { status: 200, contentEncoding: 'gzip' }
        ])
      } finally {
        await recorder.close()
      }
      // The host saw itself, not the recorder, and was asked as the client asked.
      expect(seen).toEqual([
        {
          origin,
          referer: `${origin}/home/library`,
          encoding: 'gzip'
        }
      ])
      // The caller under test got the real answer.
      expect(body).toContain('RealGameKey12345')
      const dir = humbleRecordedCaseDir('s', 'forward')
      const text = readFileSync(join(dir, 'exchanges.json'), 'utf8')
      expect(text).not.toContain('live-secret')
      expect(text).not.toContain('server-issued')
      expect(text).not.toContain('colo-123')
      const bodyFile = readdirSync(dir).find((n) => n.startsWith('body-'))
      expect(bodyFile).toBeDefined()
      const recorded = readFileSync(join(dir, bodyFile as string), 'utf8')
      expect(recorded).not.toContain('RealGameKey12345')
      expect(recorded).not.toContain('me@example.test')
      expect(recorded).toContain('"gamekey":"REDACTED"')
    } finally {
      await new Promise<void>((resolve) => upstream.close(() => resolve()))
    }
  })

  describe('redaction', () => {
    it('rewrites a raw cookie, CSRF token and authorization header', () => {
      expect(
        redactHeaderValue(
          'Cookie',
          '_simpleauth_sess=abc123; ory_session_x=def456'
        )
      ).toBe('_simpleauth_sess=REDACTED; ory_session_x=REDACTED')
      expect(
        redactHeaderValue('Set-Cookie', 'ory_session_x=def456; Path=/; Secure')
      ).toBe('ory_session_x=REDACTED; Path=/; Secure')
      expect(redactHeaderValue('X-CSRF-Token', 'tok')).toBe('REDACTED')
      expect(redactHeaderValue('Authorization', 'Bearer tok')).toBe('REDACTED')
      expect(redactHeaderValue('Accept', 'application/json')).toBe(
        'application/json'
      )
    })

    it('rewrites a gamekey in a path, a referer and a query', () => {
      expect(redactTarget('/home/library/AbCdEfGhIjKlMnOp')).toBe(
        '/home/library/REDACTED'
      )
      expect(
        redactHeaderValue(
          'Referer',
          'https://www.humblebundle.com/home/library/AbCdEfGhIjKlMnOp?page=2'
        )
      ).toBe('https://www.humblebundle.com/home/library/REDACTED?page=2')
      expect(redactTarget('/x?gamekey=abc&page=2')).toBe(
        '/x?gamekey=REDACTED&page=2'
      )
      expect(redactTarget('/home/library?page=2')).toBe('/home/library?page=2')
    })

    it('rewrites key values, emails and account names in JSON, plain or escaped inside a string', () => {
      const plain = redactText(
        '{"gameKey":"G123","redeemed_key_val":"AAAAA-BBBBB-CCCCC","email":"a@b.example","username":"someone","title":"Hades"}'
      )
      expect(plain).toBe(
        '{"gameKey":"REDACTED","redeemed_key_val":"REDACTED","email":"REDACTED","username":"REDACTED","title":"Hades"}'
      )
      const flightRow = '1:"{\\"gameKey\\":\\"G123\\",\\"title\\":\\"Hades\\"}"'
      expect(redactText(flightRow)).toBe(
        '1:"{\\"gameKey\\":\\"REDACTED\\",\\"title\\":\\"Hades\\"}"'
      )
      expect(redactText('contact me@example.test now')).toBe(
        'contact REDACTED now'
      )
      expect(redactText('x _simpleauth_sess=abc; y')).toBe(
        'x _simpleauth_sess=REDACTED; y'
      )
    })
  })
})
