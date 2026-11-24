/**
 * The one real Humble sync (94-10, D-05, Pitfall 4): recorded from the operator's own account
 * through the forward-mode wire recorder, redacted before it is written, and replayed offline.
 *
 * Synthetic fixtures cannot show what Cloudflare and Humble really return, nor which implicit
 * headers the TypeScript puts on the wire to the real host. One recorded sync closes that gap. It
 * is read-only by construction:
 *   - it calls `getSessionStatus` and `getLibraryOrders` (session-status, the library page, the
 *     chunk scan up to the `filterUserLibrary` action id, the first `CAPTURE_PAGES` pages of the
 *     server action) and nothing else;
 *   - it never imports the key-reveal function, a spy asserts the module's reveal export is never
 *     called, and every recorded request is checked not to be a POST to `/home/library/<gamekey>`;
 *   - the library fetch is cut after `CAPTURE_PAGES` pages through the adapter's own `signal`
 *     hook, so a handful of orders is read, not the whole library.
 * The TypeScript adapter has no order-detail read of its own (Humble's REST order API is gone; the
 * library page POST already carries each order's detail), so the plan's "one order detail GET" is
 * not in the capture. The only `/home/library/<gamekey>` GET the adapter issues is the page that
 * precedes a reveal, which this capture must not trigger.
 *
 * Modes, by the environment (the cookie never reaches a file, a log or a failure message):
 *   - armed (`GAMELIB_ORACLE_HUMBLE=forward` and `GAMELIB_HUMBLE_CAPTURE_COOKIE` set, in the
 *     operator's own terminal): drives the adapter against the recorder, which forwards to
 *     www.humblebundle.com, writes `recorded/real/sync/` and `recorded/real/WIRE_HEADERS.json`,
 *     and searches every written byte for the literal `GAMELIB_HUMBLE_REDACT_ACCOUNT` and
 *     `GAMELIB_HUMBLE_REDACT_EMAIL` values (a hit deletes what was written);
 *   - otherwise, when `recorded/real/sync/` is committed: replays it offline and compares each
 *     request with its recording;
 *   - otherwise: skips, and says why.
 * The capture driver itself is held by a self-test against a local stand-in for Humble, so a
 * driver fault is found without touching the real site.
 */
import { createServer, type Server } from 'http'
import { gzipSync } from 'zlib'
import type { AddressInfo } from 'net'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import * as adapterModule from '../../adapter'
import { getLibraryOrders, getSessionStatus } from '../../adapter'
import { createHumbleActionIdCache } from '../../actionIdCache'
import {
  withHumbleOracleProfile,
  withWireRecorder
} from 'backend/testUtils/humbleOracle/harness'
import {
  humbleOracleMode,
  humbleRecordedCaseDir,
  overrideFixturesRoot,
  type RecordedRequest,
  type SyntheticResponse,
  type UpstreamObservation,
  type WireRecorder
} from 'backend/testUtils/humbleOracle/wireRecorder'
import {
  literalsFrom,
  scanForLiterals
} from 'backend/testUtils/humbleOracle/literalScan'
import { createFakeHomeProfile } from 'backend/testUtils/fakeHomeProfile'
import {
  CHUNK_PATHS,
  FAKE_COOKIE,
  LIBRARY_ACTION_ID,
  LIBRARY_PATH,
  compressAdapterGaps,
  discoveryResponses,
  libraryPageResponses,
  type FlightItem
} from './flight'

const SLICE = 'real'
const CASE = 'sync'
/** The library fetch stops here: five orders a page, so a handful of orders. */
const CAPTURE_PAGES = 2

const SESSION_PATH = '/api/auth/session-status'

// ---------------------------------------------------------------------------------------------
// The driver: the capture and its replay run exactly this
// ---------------------------------------------------------------------------------------------

interface SyncOutcome {
  session: string
  library: string
}

/** A spy on the module's reveal export: every test asserts it was never called. */
const watchReveal = (): jest.SpyInstance =>
  jest.spyOn(adapterModule, 'revealKey')

const ABORTED = 'library fetch aborted'

/** Text with every occurrence of `secret` removed, for an error that may carry a request. */
const without = (text: string, secret: string): string =>
  secret.length > 0 ? text.split(secret).join('REDACTED') : text

/**
 * One sync: the session probe, then the library fetch cut after `pages` pages. The two adapter
 * calls the plan lists; nothing else. A thrown error is re-raised with the cookie scrubbed, because
 * an axios error serialises the request headers it was sent.
 */
async function driveSync(cookie: string, pages: number): Promise<SyncOutcome> {
  const actionIds = createHumbleActionIdCache()
  try {
    const session = await getSessionStatus(cookie)
    let asked = 0
    let library: string
    try {
      const result = await getLibraryOrders(cookie, actionIds, {
        signal: () => ++asked > pages
      })
      library =
        result.status === 'ok' ? `ok:${result.data.length}` : `${result.status}`
    } catch (error) {
      if (!(error instanceof Error) || error.message !== ABORTED) throw error
      library = `cut-after-${pages}-pages`
    }
    return { session, library }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`humble sync failed: ${without(message, cookie)}`)
  }
}

/** Every recorded request must be a read: no POST to an order's own page (the reveal). */
function assertNoRevealOnTheWire(requests: readonly RecordedRequest[]): void {
  const reveals = requests.filter(
    (r) => r.method === 'POST' && /^\/home\/library\/[^?#]/.test(r.target)
  )
  expect(reveals).toEqual([])
}

// ---------------------------------------------------------------------------------------------
// WIRE_HEADERS.json: the real request shape, derived from what was recorded
// ---------------------------------------------------------------------------------------------

/** The headers whose value is a fixed part of the request shape (a build-stable string). */
const FIXED_HEADERS = [
  'User-Agent',
  'Accept',
  'Content-Type',
  'Next-Router-State-Tree',
  'Origin',
  'Referer',
  'Accept-Encoding'
] as const

interface WireKind {
  method: string
  /** The target of the first request of this kind, redacted. */
  target: string
  /** Header names in wire order, as they arrived. */
  headerNames: string[]
  /** The fixed values, by header name; a header the request did not send is absent. */
  fixedHeaders: Record<string, string>
  nextActionPresent: boolean
  cookiePresent: boolean
  /** The multipart field names in order (a library page POST). */
  multipartFields?: string[]
  /** What the real host answered; `null` when the forward failed. */
  responseStatus: number | null
  /** The `Content-Encoding` the real host answered with; `identity` when it sent none. */
  responseCompression: string | null
}

function kindOf(request: RecordedRequest): string {
  const path = request.target.split('?')[0] ?? ''
  if (request.method === 'GET' && path === SESSION_PATH) return 'session-status'
  if (request.method === 'GET' && path === LIBRARY_PATH) return 'library-page'
  if (request.method === 'GET' && path.startsWith('/_next/static/')) {
    return 'chunk'
  }
  if (request.method === 'POST' && path === LIBRARY_PATH) {
    return request.target.includes('?page=')
      ? 'library-action-next-page'
      : 'library-action'
  }
  return `other-${request.method}-${path}`
}

function wireKind(
  request: RecordedRequest,
  observed: UpstreamObservation | null
): WireKind {
  const lookup = (name: string): string | undefined =>
    request.headers.find(([n]) => n.toLowerCase() === name.toLowerCase())?.[1]
  const fixedHeaders: Record<string, string> = {}
  for (const name of FIXED_HEADERS) {
    const value = lookup(name)
    if (value !== undefined) fixedHeaders[name] = value
  }
  return {
    method: request.method,
    target: request.target,
    headerNames: request.headers.map(([name]) => name),
    fixedHeaders,
    nextActionPresent: lookup('Next-Action') !== undefined,
    cookiePresent: lookup('Cookie') !== undefined,
    ...(request.multipart
      ? { multipartFields: request.multipart.map((part) => part.name) }
      : {}),
    responseStatus: observed?.status ?? null,
    responseCompression: observed
      ? (observed.contentEncoding ?? 'identity')
      : null
  }
}

/** The first request of each kind, keyed by kind, in the order the kinds first appeared. */
function deriveWireHeaders(
  requests: readonly RecordedRequest[],
  upstream: readonly (UpstreamObservation | null)[]
): Record<string, WireKind> {
  const out: Record<string, WireKind> = {}
  requests.forEach((request, index) => {
    const kind = kindOf(request)
    if (!(kind in out)) out[kind] = wireKind(request, upstream[index] ?? null)
  })
  return out
}

const wireHeadersFile = (): string =>
  join(dirname(humbleRecordedCaseDir(SLICE, CASE)), 'WIRE_HEADERS.json')

// ---------------------------------------------------------------------------------------------
// The capture and the replay
// ---------------------------------------------------------------------------------------------

/** `recorded/real/<case>/`, and the pinned shape beside it. Removed when a capture leaks. */
function discardCapture(): void {
  rmSync(humbleRecordedCaseDir(SLICE, CASE), { recursive: true, force: true })
  rmSync(wireHeadersFile(), { force: true })
}

interface CaptureResult {
  outcome: SyncOutcome
  exchanges: number
}

/**
 * Forward mode: the recorder proxies to `upstream` (the real host unless a self-test names a
 * stand-in), writes the recording, then the pinned request shape and the literal scan. A leak
 * deletes everything written and fails with the file and the label, never the value.
 */
async function capture(
  cookie: string,
  upstream: ((target: string) => string) | undefined,
  literals: ReturnType<typeof literalsFrom>
): Promise<CaptureResult> {
  let outcome: SyncOutcome | undefined
  let requests: readonly RecordedRequest[] = []
  let observed: readonly (UpstreamObservation | null)[] = []
  const reveal = watchReveal()
  try {
    await withHumbleOracleProfile(async () => {
      await withWireRecorder(
        { slice: SLICE, caseId: CASE, mode: 'forward', upstream },
        async (recorder: WireRecorder) => {
          try {
            outcome = await driveSync(cookie, CAPTURE_PAGES)
          } finally {
            requests = [...recorder.requests]
            observed = [...recorder.upstream]
          }
        }
      )
    })
  } catch (error) {
    discardCapture()
    throw error
  } finally {
    expect(reveal).not.toHaveBeenCalled()
    reveal.mockRestore()
  }
  assertNoRevealOnTheWire(requests)
  if (outcome === undefined || outcome.session !== 'authenticated') {
    discardCapture()
    throw new Error(
      `the cookie is not an authenticated Humble session (session-status said ${outcome?.session ?? 'nothing'}); nothing was kept`
    )
  }
  mkdirSync(dirname(wireHeadersFile()), { recursive: true })
  writeFileSync(
    wireHeadersFile(),
    `${JSON.stringify(deriveWireHeaders(requests, observed), null, 2)}\n`
  )
  const { findings } = scanForLiterals(dirname(wireHeadersFile()), literals)
  if (findings.length > 0) {
    discardCapture()
    throw new Error(
      `the capture carried the operator's own identity and was deleted: ${findings.join(', ')}`
    )
  }
  return { outcome, exchanges: requests.length }
}

/** The cookie string a recorded request carried, as the adapter takes it (already redacted). */
function recordedCookie(): string {
  const exchanges = JSON.parse(
    readFileSync(
      join(humbleRecordedCaseDir(SLICE, CASE), 'exchanges.json'),
      'utf8'
    )
  ) as { request: RecordedRequest }[]
  const header = exchanges[0]?.request.headers.find(
    ([name]) => name.toLowerCase() === 'cookie'
  )?.[1]
  if (header === undefined) throw new Error('the recording holds no Cookie')
  // The adapter prefixes a bare value with `_simpleauth_sess=`; give it the bare value back.
  return header.startsWith('_simpleauth_sess=')
    ? header.slice('_simpleauth_sess='.length)
    : header
}

/** Replay mode: every request must find its recording, and every recording must be used. */
async function replay(
  options: {
    upstream?: (target: string) => string
    compressGaps?: boolean
  } = {}
): Promise<SyncOutcome> {
  const restoreGaps =
    options.compressGaps === false ? () => undefined : compressAdapterGaps()
  const reveal = watchReveal()
  try {
    let outcome: SyncOutcome | undefined
    await withHumbleOracleProfile(async () => {
      await withWireRecorder(
        {
          slice: SLICE,
          caseId: CASE,
          mode: 'replay',
          upstream: options.upstream
        },
        async (recorder) => {
          outcome = await driveSync(recordedCookie(), CAPTURE_PAGES)
          assertNoRevealOnTheWire(recorder.requests)
        }
      )
    })
    expect(reveal).not.toHaveBeenCalled()
    return outcome as SyncOutcome
  } finally {
    reveal.mockRestore()
    restoreGaps()
  }
}

// ---------------------------------------------------------------------------------------------
// The tests
// ---------------------------------------------------------------------------------------------

const cookie = process.env.GAMELIB_HUMBLE_CAPTURE_COOKIE ?? ''
const armed = humbleOracleMode() === 'forward' && cookie.length > 0
const recorded = existsSync(
  join(humbleRecordedCaseDir(SLICE, CASE), 'exchanges.json')
)

let skipReason: string | null = null
if (!armed && !recorded) {
  skipReason =
    humbleOracleMode() === 'forward'
      ? 'forward mode is set but GAMELIB_HUMBLE_CAPTURE_COOKIE is not: nothing is sent to Humble'
      : 'recorded/real/sync is not committed yet and forward mode is not armed (GAMELIB_ORACLE_HUMBLE=forward with the capture cookie)'
  console.info(`realCapture.oracle: skipped, ${skipReason}`)
}

describe('the real Humble sync (94-10, D-05)', () => {
  if (armed) {
    it('records one real sync from the operator account, redacted before it is written', async () => {
      const literals = literalsFrom(
        process.env.GAMELIB_HUMBLE_REDACT_ACCOUNT,
        process.env.GAMELIB_HUMBLE_REDACT_EMAIL
      )
      const { outcome, exchanges } = await capture(cookie, undefined, literals)
      console.info(
        `realCapture.oracle: captured ${exchanges} exchanges (session ${outcome.session}, library ${outcome.library}); literal scan over ${literals.length} value(s) found nothing`
      )
      expect(exchanges).toBeGreaterThanOrEqual(4)
    }, 120_000)
  }

  const replayIt = skipReason === null ? it : it.skip
  replayIt(
    skipReason === null
      ? 'replays the recorded real sync offline, request for request'
      : `replays the recorded real sync offline (skipped: ${skipReason})`,
    async () => {
      const outcome = await replay()
      expect(outcome.session).toBe('authenticated')
    },
    30_000
  )

  describe('the capture driver, against a local stand-in for Humble', () => {
    const items: FlightItem[] = Array.from({ length: 12 }, (_, i) => ({
      id: `fake-gamekey-${String(i + 1).padStart(4, '0')}`,
      title: `Fake Bundle ${i + 1}`,
      keys: [{ id: `fake_game_${i + 1}_steam`, title: `Fake Game ${i + 1}` }]
    }))
    const baseAnswers: SyntheticResponse[] = [
      {
        method: 'GET',
        target: SESSION_PATH,
        status: 200,
        headers: [['content-type', 'application/json']],
        body: JSON.stringify({ status: 'authenticated' })
      },
      ...discoveryResponses({
        pagePath: LIBRARY_PATH,
        actionId: LIBRARY_ACTION_ID,
        actionName: 'filterUserLibrary'
      }),
      ...libraryPageResponses(items, { requestIds: true })
    ]
    let answers: SyntheticResponse[] = baseAnswers
    const hits: string[] = []
    let server: Server
    let origin = ''
    let restoreRoot: () => void = () => undefined
    let profile: ReturnType<typeof createFakeHomeProfile>
    let restoreGaps: () => void = () => undefined

    beforeAll(async () => {
      server = createServer((req, res) => {
        hits.push(`${req.method} ${req.url}`)
        const answer = answers.find(
          (a) =>
            (a.method === undefined || a.method === req.method) &&
            a.target === req.url
        )
        // Drain the body before answering, as a real host does.
        req.on('data', () => undefined)
        req.on('end', () => {
          if (!answer) {
            res.statusCode = 404
            res.end()
            return
          }
          res.statusCode = answer.status
          for (const [name, value] of answer.headers ?? []) {
            res.setHeader(name, value)
          }
          const body = Buffer.from(String(answer.body ?? ''), 'utf8')
          if (req.url === SESSION_PATH) {
            res.setHeader('content-encoding', 'gzip')
            res.end(gzipSync(body))
            return
          }
          res.end(body)
        })
      })
      await new Promise<void>((resolve) =>
        server.listen(0, '127.0.0.1', resolve)
      )
      origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    })
    afterAll(async () => {
      await new Promise<void>((resolve) => {
        server.close(() => resolve())
        server.closeAllConnections()
      })
    })
    beforeEach(() => {
      profile = createFakeHomeProfile({ prefix: 'gamelib-real-capture-' })
      restoreRoot = overrideFixturesRoot(join(profile.root, 'fixtures'))
      restoreGaps = compressAdapterGaps()
      hits.length = 0
      answers = baseAnswers
    })
    afterEach(() => {
      restoreGaps()
      restoreRoot()
      profile.dispose()
    })

    it('captures two pages, writes the pinned shape, and replays it offline', async () => {
      const { outcome, exchanges } = await capture(
        FAKE_COOKIE,
        () => origin,
        []
      )
      expect(outcome).toEqual({
        session: 'authenticated',
        library: 'cut-after-2-pages'
      })
      // session-status, the library page, the two chunks scanned up to the holder, two action pages.
      expect(exchanges).toBe(6)
      expect(hits.filter((h) => h.startsWith('POST'))).toEqual([
        `POST ${LIBRARY_PATH}`,
        `POST ${LIBRARY_PATH}?page=2`
      ])
      expect(hits.some((h) => /\/home\/library\/./.test(h))).toBe(false)

      const wire = JSON.parse(
        readFileSync(wireHeadersFile(), 'utf8')
      ) as Record<string, WireKind>
      expect(Object.keys(wire)).toEqual([
        'session-status',
        'library-page',
        'chunk',
        'library-action',
        'library-action-next-page'
      ])
      expect(wire['session-status']).toMatchObject({
        method: 'GET',
        responseStatus: 200,
        responseCompression: 'gzip',
        cookiePresent: true,
        nextActionPresent: false
      })
      expect(wire['session-status']?.fixedHeaders.Accept).toBe(
        'application/json'
      )
      expect(wire['library-action']).toMatchObject({
        method: 'POST',
        nextActionPresent: true,
        responseCompression: 'identity'
      })
      expect(wire['library-action']?.multipartFields).toEqual([
        '_1_requestId',
        '_1_query',
        '_1_sort',
        '_1_cursor',
        '_1_page',
        '_1_limit',
        '_1_hideRevealed',
        '_1_hideExpired',
        '_1_dateExpires',
        '0'
      ])
      // The recorder's own origin never reaches a recorded Origin or Referer: they name the
      // upstream (here the stand-in; in the real capture, www.humblebundle.com).
      expect(wire['library-action']?.fixedHeaders.Origin).toBe(origin)
      expect(wire['library-action']?.fixedHeaders.Referer).toBe(
        `${origin}${LIBRARY_PATH}`
      )
      expect(wire['library-action-next-page']?.fixedHeaders.Referer).toBe(
        `${origin}${LIBRARY_PATH}?page=2`
      )

      // The recording replays offline, request for request, from the same driver.
      const again = await replay({
        upstream: () => origin,
        compressGaps: false
      })
      expect(again.library).toBe('cut-after-2-pages')
    })

    it('keeps nothing when the cookie is not an authenticated session', async () => {
      const anonymous = createServer((req, res) => {
        req.resume()
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ status: 'anonymous' }))
      })
      await new Promise<void>((resolve) =>
        anonymous.listen(0, '127.0.0.1', resolve)
      )
      try {
        const base = `http://127.0.0.1:${(anonymous.address() as AddressInfo).port}`
        await expect(capture(FAKE_COOKIE, () => base, [])).rejects.toThrow(
          /not an authenticated Humble session/
        )
        expect(existsSync(humbleRecordedCaseDir(SLICE, CASE))).toBe(false)
        expect(existsSync(wireHeadersFile())).toBe(false)
      } finally {
        await new Promise<void>((resolve) => {
          anonymous.close(() => resolve())
          anonymous.closeAllConnections()
        })
      }
    })

    it('deletes the capture when a literal identity value is found in it', async () => {
      // The stand-in's titles carry the planted literal, as a greeting on a real page might.
      const planted = [
        ...answers.slice(0, 1),
        ...discoveryResponses({
          pagePath: LIBRARY_PATH,
          actionId: LIBRARY_ACTION_ID,
          actionName: 'filterUserLibrary'
        }).map((a) =>
          a.target === LIBRARY_PATH
            ? {
                ...a,
                body: `${String(a.body)}<p>Welcome back, Planted Person</p>`
              }
            : a
        ),
        ...libraryPageResponses(items, { requestIds: true })
      ]
      answers = planted
      await expect(
        capture(FAKE_COOKIE, () => origin, [
          { label: 'account', value: 'Planted Person', match: 'token' }
        ])
      ).rejects.toThrow(/was deleted: .*: account/)
      expect(existsSync(humbleRecordedCaseDir(SLICE, CASE))).toBe(false)
      expect(existsSync(wireHeadersFile())).toBe(false)
    })

    it('a failing forward leaves no partial recording behind', async () => {
      await expect(
        capture(FAKE_COOKIE, () => 'http://127.0.0.1:1', [])
      ).rejects.toThrow()
      expect(existsSync(humbleRecordedCaseDir(SLICE, CASE))).toBe(false)
    })

    it('the cookie is scrubbed from a failure message', async () => {
      const secret = 'ory_session_zzz=ThisIsTheSecretValue'
      let message = ''
      await capture(secret, () => 'http://127.0.0.1:1', []).catch(
        (error: unknown) => {
          message = error instanceof Error ? error.message : String(error)
        }
      )
      expect(message.length).toBeGreaterThan(0)
      expect(message).not.toContain('ThisIsTheSecretValue')
    })
  })

  describe('deriveWireHeaders', () => {
    const request = (
      method: string,
      target: string,
      headers: [string, string][],
      multipart?: { name: string }[]
    ): RecordedRequest => ({ method, target, headers, multipart })

    it('keeps the first request of each kind, header names in wire order', () => {
      const wire = deriveWireHeaders(
        [
          request('GET', SESSION_PATH, [
            ['Accept', 'application/json'],
            ['Cookie', 'a=REDACTED'],
            ['User-Agent', 'axios/9']
          ]),
          request('GET', CHUNK_PATHS[0], [['User-Agent', 'ua']]),
          request('GET', CHUNK_PATHS[1], [['User-Agent', 'second']]),
          request('GET', '/something/else', [])
        ],
        [{ status: 200, contentEncoding: null }, null, null, null]
      )
      expect(Object.keys(wire)).toEqual([
        'session-status',
        'chunk',
        'other-GET-/something/else'
      ])
      expect(wire['session-status']?.headerNames).toEqual([
        'Accept',
        'Cookie',
        'User-Agent'
      ])
      expect(wire['session-status']?.responseCompression).toBe('identity')
      expect(wire.chunk?.fixedHeaders).toEqual({ 'User-Agent': 'ua' })
      expect(wire.chunk?.responseCompression).toBeNull()
    })
  })
})
