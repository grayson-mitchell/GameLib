/**
 * The one Humble wire recorder every Phase 94 Humble golden shares (94-06, D-05, Pitfall 4).
 *
 * The TypeScript source does not show the headers Node adds on the wire (axios adds
 * `Accept-Encoding` and a `User-Agent`, undici `fetch` adds `accept`, `accept-language`,
 * `sec-fetch-mode` and a random multipart boundary), so request pinning has to be captured on a
 * socket. `startWireRecorder` starts a local `http.createServer` on 127.0.0.1 that the TS adapter
 * and the Steam app-id resolver are pointed at (`harness.ts`: `pointHumbleAt`,
 * `pointSteamStoreSearchAt`, both test-only, neither a module mock). It records every request as
 * it arrived on the socket: method, target (path and query), header names and values in the order
 * they arrived (`req.rawHeaders`), the body bytes and, for a multipart body, the field names and
 * their order without the boundary.
 *
 * Three modes (`humbleOracleMode()`, from the environment):
 *   - replay (default, offline): answers each request from `recorded/<slice>/<case>/exchanges.json`
 *     and compares the request that arrived with the recorded one. A request with no recorded
 *     twin, or one that differs, is a failure; `close()` throws, so the test fails loudly even if
 *     the code under test swallows the 599 the recorder answered with.
 *   - write (`GAMELIB_WRITE_HUMBLE_GOLDEN=1`): answers from the case's `synthetic` responses (or,
 *     where the case has none for a request, from the recorded exchanges) and rewrites
 *     `exchanges.json` with the requests that arrived.
 *   - forward (`GAMELIB_HUMBLE_ORACLE=forward`, used only by 94-10): proxies each request to the
 *     real https host and records the response. Opt-in by the environment, never a default.
 *
 * `exchanges.json` is the list the Rust replay reads: `{id, request: {method, target, headers,
 * body?, multipart?}, response: {status, headers, bodyFile?}}`. Header lists are `[name, value]`
 * pairs in arrival order.
 *
 * Normalisation, so a recording is the same on every host and a Rust replay can compare:
 *   - the recorder's own origin (`http://127.0.0.1:<port>`) becomes the upstream origin the real
 *     request would have named, in header values, the target and the body; `Host` becomes the
 *     upstream host;
 *   - the multipart boundary is `<BOUNDARY>` and a `content-length` value is `<LENGTH>` (both vary
 *     with data the redaction replaces);
 *   - `x-oracle-upstream`, the header the Steam interceptor adds to say where a request belongs,
 *     is never recorded: the TS never sent it.
 *
 * Redaction runs before anything is written (T-94-10): cookie values (`_simpleauth_sess`,
 * `ory_session_*`, anything), CSRF and authorization values, gamekeys (in a path, a JSON field or a
 * request body), key values, email addresses and account names become `REDACTED`, in requests and
 * responses, and a response's headers are reduced to an allow-list. The same redaction is applied
 * to a live request before it is matched, so a replayed request finds its recorded twin. The
 * recorder binds 127.0.0.1 only (T-94-11).
 */
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse
} from 'http'
import type { AddressInfo } from 'net'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'fs'
import { dirname, join } from 'path'

export type WireMode = 'replay' | 'write' | 'forward'

/** The crate the Humble fixtures live in. */
const HUMBLE_CRATE = 'gamelib-humble'

const REDACTED = 'REDACTED'

/** The real origins a request belongs to, by default. */
const HUMBLE_ORIGIN = 'https://www.humblebundle.com'
export const STEAM_STORE_ORIGIN = 'https://store.steampowered.com'

let fixturesRootOverride: string | null = null

/**
 * Test-only: points every fixture path at `dir` (a temp directory) so the self-tests can write and
 * compare recordings and goldens without touching the committed crate. Returns the restore.
 */
export function overrideFixturesRoot(dir: string): () => void {
  fixturesRootOverride = dir
  return () => {
    fixturesRootOverride = null
  }
}

/** `<repo>/src-tauri/crates/gamelib-humble/tests/fixtures`, or the override. */
export const fixturesRoot = (): string =>
  fixturesRootOverride ??
  join(
    __dirname,
    '..',
    '..',
    '..',
    '..',
    'src-tauri',
    'crates',
    HUMBLE_CRATE,
    'tests',
    'fixtures'
  )

/** `recorded/<slice>/<case>`: the directory holding a case's `exchanges.json` and bodies. */
export const recordedCaseDir = (slice: string, caseId: string): string =>
  join(fixturesRoot(), 'recorded', slice, caseId)

/** The mode the environment asks for. Forward wins over write when both are set. */
export function humbleOracleMode(): WireMode {
  if (process.env.GAMELIB_HUMBLE_ORACLE === 'forward') return 'forward'
  if (process.env.GAMELIB_WRITE_HUMBLE_GOLDEN === '1') return 'write'
  return 'replay'
}

// ---------------------------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------------------------

/** One header's value, redacted by the header's name. `name` is compared case-insensitively. */
export function redactHeaderValue(name: string, value: string): string {
  const lower = name.toLowerCase()
  if (lower === 'cookie') {
    return value
      .split(';')
      .map((pair) => {
        const eq = pair.indexOf('=')
        if (eq < 0) return pair
        return `${pair.slice(0, eq)}=${REDACTED}`
      })
      .join(';')
  }
  if (lower === 'set-cookie') {
    // `name=value; Path=/; HttpOnly`: only the value is a secret.
    const eq = value.indexOf('=')
    if (eq < 0) return value
    const semi = value.indexOf(';')
    const rest = semi < 0 ? '' : value.slice(semi)
    return `${value.slice(0, eq)}=${REDACTED}${rest}`
  }
  if (
    lower === 'authorization' ||
    lower === 'proxy-authorization' ||
    lower === 'x-auth-token' ||
    /csrf|xsrf/.test(lower)
  ) {
    return REDACTED
  }
  if (lower === 'referer' || lower === 'location' || lower === 'origin') {
    return redactTarget(value)
  }
  return redactText(value)
}

/**
 * A request target or URL with its secrets removed: the gamekey path segment of an order
 * (`/home/library/<gamekey>`, `/api/v1/order/<gamekey>`) and the value of a query parameter that
 * names a secret.
 */
export function redactTarget(target: string): string {
  let out = target.replace(
    /(\/(?:home\/library|api\/v1\/order|api\/v1\/orders)\/)([^/?#\s]+)/g,
    `$1${REDACTED}`
  )
  out = out.replace(
    /([?&](?:gamekey|game_key|key|token|csrf|csrf_token|email|username)=)([^&#\s]*)/gi,
    `$1${REDACTED}`
  )
  return out
}

/**
 * JSON field names whose string value is a secret or an identity. The value of one of these keys is
 * replaced wherever it appears in a text body, plain (`"gameKey":"x"`) or escaped inside another
 * string (`\"gameKey\":\"x\"`, how a React Flight row embeds JSON).
 */
const SECRET_FIELDS = [
  'gamekey',
  'game_key',
  'gamekeys',
  'key',
  'key_value',
  'keyvalue',
  'redeemed_key_val',
  'redeemed_key_value',
  'csrf',
  'csrftoken',
  'csrf_token',
  'token',
  'access_token',
  'refresh_token',
  'sessioncookie',
  'email',
  'email_address',
  'username',
  'user_name',
  'account_name',
  'accountname',
  'displayname',
  'display_name',
  'handle'
] as const

const SECRET_FIELD_PATTERN = new RegExp(
  `(\\\\?"(?:${SECRET_FIELDS.join('|')})\\\\?"\\s*:\\s*\\\\?")((?:[^"\\\\]|\\\\(?!"))*)(?=\\\\?")`,
  'gi'
)

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g

const COOKIE_IN_TEXT_PATTERN =
  /\b(_simpleauth_sess|ory_session_[A-Za-z0-9_-]*|__cf_bm|cf_clearance|csrf[A-Za-z0-9_-]*)=([^;\s"'\\,]+)/gi

/** Text with the secrets and identities of a Humble payload replaced by `REDACTED`. */
export function redactText(text: string): string {
  return text
    .replace(SECRET_FIELD_PATTERN, `$1${REDACTED}`)
    .replace(COOKIE_IN_TEXT_PATTERN, `$1=${REDACTED}`)
    .replace(EMAIL_PATTERN, REDACTED)
}

/**
 * A text body for the request to `target`. The reveal POST to `/home/library/<gamekey>` carries
 * `JSON.stringify([keyId, keyIntegrationId, '$undefined'])`: bare ids with no field name, so every
 * string element but the `$undefined` marker is replaced.
 */
function redactRequestBody(target: string, text: string): string {
  if (/\/home\/library\/[^/?#]+/.test(target)) {
    try {
      const parsed: unknown = JSON.parse(text)
      if (Array.isArray(parsed)) {
        return JSON.stringify(
          parsed.map((item: unknown) =>
            typeof item === 'string' && !item.startsWith('$') ? REDACTED : item
          )
        )
      }
    } catch {
      /* not JSON: fall through to the generic pass */
    }
  }
  return redactText(text)
}

// ---------------------------------------------------------------------------------------------
// The recorded shapes
// ---------------------------------------------------------------------------------------------

interface RecordedMultipartPart {
  name: string
  filename?: string
  /** The part's text, redacted. Omitted for a file part. */
  value?: string
}

interface RecordedBody {
  /** The body when it round-trips as UTF-8, redacted. */
  utf8?: string
  /** The body's bytes, when it does not. */
  base64?: string
}

export interface RecordedRequest {
  method: string
  /** Path and query exactly as the request line carried them, redacted. */
  target: string
  /** `[name, value]` in arrival order, redacted and normalised. */
  headers: [string, string][]
  /** Absent for a bodiless request and for a multipart one (see `multipart`). */
  body?: RecordedBody
  /** The fields of a multipart body in order, without the boundary. */
  multipart?: RecordedMultipartPart[]
}

interface RecordedResponse {
  status: number
  /** The allow-listed response headers, in the order served. */
  headers: [string, string][]
  /** A file next to `exchanges.json` holding the byte-exact (redacted) body. */
  bodyFile?: string
}

interface Exchange {
  id: number
  request: RecordedRequest
  response: RecordedResponse
}

/** A response a case supplies for write mode, in place of the network. */
export interface SyntheticResponse {
  /** Request method; any when absent. */
  method?: string
  /** The request target (path and query) the response answers, exact. */
  target: string
  status: number
  headers?: [string, string][]
  /** The response body. A string is sent as UTF-8. */
  body?: string | Buffer
}

export interface WireRecorderOptions {
  slice: string
  caseId: string
  mode?: WireMode
  /** Write mode: the responses to answer with. */
  synthetic?: readonly SyntheticResponse[]
  /**
   * Forward mode: where a request really goes. Defaults to the Steam store for
   * `/api/storesearch/` and to Humble for everything else; an `x-oracle-upstream` request header
   * (the Steam interceptor sets it) wins over both.
   */
  upstream?: (target: string) => string
}

export interface WireRecorder {
  /** `http://127.0.0.1:<port>`: what `pointHumbleAt` and `pointSteamStoreSearchAt` take. */
  readonly baseUrl: string
  /** Every request as it arrived, in order (normalised and redacted). */
  readonly requests: readonly RecordedRequest[]
  /** What went wrong so far (an unmatched or differing request). Empty when all is well. */
  readonly failures: readonly string[]
  /** Stops the server, writes the recording in write and forward mode, throws on a failure. */
  close(): Promise<void>
}

/** The response headers a recording keeps. A CDN edge adds others no replay needs. */
const RESPONSE_HEADER_ALLOW_LIST = [
  'content-type',
  'location',
  'set-cookie',
  'cache-control'
]

const TEXT_CONTENT_TYPE =
  /^(?:text\/|application\/(?:json|javascript|x-javascript|xml)|.*\+json|.*x-component)/i

/** The extension of a response body file, from its content type. */
function bodyExtension(contentType: string): string {
  if (/json/i.test(contentType)) return 'json'
  if (/html/i.test(contentType)) return 'html'
  if (/javascript/i.test(contentType)) return 'js'
  if (/^text\//i.test(contentType) || /x-component/i.test(contentType)) {
    return 'txt'
  }
  return 'bin'
}

function defaultUpstream(target: string): string {
  return target.startsWith('/api/storesearch/')
    ? STEAM_STORE_ORIGIN
    : HUMBLE_ORIGIN
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

/** The fields of a multipart body, in order. A boundary-less content type yields none. */
function parseMultipart(
  body: Buffer,
  contentType: string
): RecordedMultipartPart[] | undefined {
  const match = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType)
  const boundary = match?.[1] ?? match?.[2]
  if (!boundary) return undefined
  const text = body.toString('latin1')
  const parts: RecordedMultipartPart[] = []
  for (const chunk of text.split(`--${boundary}`)) {
    const trimmed = chunk.startsWith('\r\n') ? chunk.slice(2) : chunk
    if (trimmed.length === 0 || trimmed.startsWith('--')) continue
    const split = trimmed.indexOf('\r\n\r\n')
    if (split < 0) continue
    const head = trimmed.slice(0, split)
    const name = /name="((?:[^"\\]|\\.)*)"/i.exec(head)?.[1]
    if (name === undefined) continue
    const filename = /filename="((?:[^"\\]|\\.)*)"/i.exec(head)?.[1]
    const raw = trimmed.slice(split + 4)
    const value = raw.endsWith('\r\n') ? raw.slice(0, -2) : raw
    const part: RecordedMultipartPart = { name }
    if (filename !== undefined) part.filename = filename
    else part.value = redactText(Buffer.from(value, 'latin1').toString('utf8'))
    parts.push(part)
  }
  return parts
}

/** A request as it arrived, normalised and redacted into its recorded form. */
function recordRequest(
  req: IncomingMessage,
  body: Buffer,
  baseUrl: string,
  upstreamOrigin: string
): RecordedRequest {
  const upstreamHost = new URL(upstreamOrigin).host
  const target = redactTarget(req.url ?? '/')
  const headers: [string, string][] = []
  let contentType = ''
  for (let i = 0; i + 1 < req.rawHeaders.length; i += 2) {
    const name = req.rawHeaders[i] ?? ''
    let value = req.rawHeaders[i + 1] ?? ''
    const lower = name.toLowerCase()
    if (lower === 'x-oracle-upstream') continue
    if (lower === 'content-type') contentType = value
    if (lower === 'host') {
      headers.push([name, upstreamHost])
      continue
    }
    if (lower === 'content-length') {
      headers.push([name, '<LENGTH>'])
      continue
    }
    value = value.split(baseUrl).join(upstreamOrigin)
    if (/^multipart\/form-data/i.test(value)) {
      value = value.replace(
        /boundary=(?:"[^"]*"|[^;\s]+)/i,
        'boundary=<BOUNDARY>'
      )
    }
    headers.push([name, redactHeaderValue(name, value)])
  }
  const recorded: RecordedRequest = {
    method: req.method ?? 'GET',
    target,
    headers
  }
  if (body.length === 0) return recorded
  if (/^multipart\/form-data/i.test(contentType)) {
    const parts = parseMultipart(body, contentType)
    if (parts) recorded.multipart = parts
    return recorded
  }
  const text = body.toString('utf8')
  if (Buffer.from(text, 'utf8').equals(body)) {
    recorded.body = {
      utf8: redactRequestBody(
        req.url ?? '/',
        text.split(baseUrl).join(upstreamOrigin)
      )
    }
  } else {
    recorded.body = { base64: body.toString('base64') }
  }
  return recorded
}

const same = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a) === JSON.stringify(b)

/** A one-line description of how two requests differ, without leaking more than the redaction kept. */
function describeDifference(
  expected: RecordedRequest,
  actual: RecordedRequest
): string {
  const diffs: string[] = []
  if (expected.method !== actual.method) {
    diffs.push(`method ${actual.method} != ${expected.method}`)
  }
  if (expected.target !== actual.target) {
    diffs.push(`target ${actual.target} != ${expected.target}`)
  }
  if (!same(expected.headers, actual.headers)) {
    diffs.push(
      `headers ${JSON.stringify(actual.headers)} != ${JSON.stringify(expected.headers)}`
    )
  }
  if (!same(expected.body, actual.body)) diffs.push('body differs')
  if (!same(expected.multipart, actual.multipart)) {
    diffs.push(
      `multipart ${JSON.stringify(actual.multipart)} != ${JSON.stringify(expected.multipart)}`
    )
  }
  return diffs.join('; ')
}

function readExchanges(dir: string): Exchange[] {
  const file = join(dir, 'exchanges.json')
  if (!existsSync(file)) return []
  return JSON.parse(readFileSync(file, 'utf8')) as Exchange[]
}

function sendResponse(
  res: ServerResponse,
  status: number,
  headers: readonly (readonly [string, string])[],
  body: Buffer
): void {
  res.statusCode = status
  for (const [name, value] of headers) {
    if (name.toLowerCase() === 'content-length') continue
    res.appendHeader(name, value)
  }
  res.setHeader('content-length', String(body.length))
  res.end(body)
}

/** Proxies one request to the real host (forward mode), redirects not followed. */
async function forwardRequest(
  req: IncomingMessage,
  body: Buffer,
  origin: string
): Promise<{ status: number; headers: [string, string][]; body: Buffer }> {
  const headers = new Headers()
  for (let i = 0; i + 1 < req.rawHeaders.length; i += 2) {
    const name = req.rawHeaders[i] ?? ''
    const lower = name.toLowerCase()
    if (
      lower === 'host' ||
      lower === 'x-oracle-upstream' ||
      lower === 'content-length' ||
      lower === 'connection' ||
      lower === 'transfer-encoding' ||
      // The proxy hands the body back as bytes: ask for it uncompressed.
      lower === 'accept-encoding'
    ) {
      continue
    }
    headers.append(name, req.rawHeaders[i + 1] ?? '')
  }
  const real = await fetch(`${origin}${req.url ?? '/'}`, {
    method: req.method,
    headers,
    body: body.length > 0 ? new Uint8Array(body) : undefined,
    redirect: 'manual'
  })
  const bytes = Buffer.from(await real.arrayBuffer())
  const out: [string, string][] = []
  real.headers.forEach((value, name) => {
    if (name.toLowerCase() === 'set-cookie') return
    out.push([name, value])
  })
  for (const cookie of real.headers.getSetCookie()) {
    out.push(['set-cookie', cookie])
  }
  return { status: real.status, headers: out, body: bytes }
}

/** The response a recording keeps: allow-listed headers, redacted. */
function allowListed(
  headers: readonly (readonly [string, string])[]
): [string, string][] {
  return headers
    .filter(([name]) => RESPONSE_HEADER_ALLOW_LIST.includes(name.toLowerCase()))
    .map(([name, value]) => [name, redactHeaderValue(name, value)])
}

/** A response body in its recorded (redacted) form. */
function redactedBody(contentType: string, body: Buffer): Buffer {
  if (!TEXT_CONTENT_TYPE.test(contentType)) return body
  const text = body.toString('utf8')
  if (!Buffer.from(text, 'utf8').equals(body)) return body
  return Buffer.from(redactText(text), 'utf8')
}

/**
 * Starts the recorder for one case. The caller points the code under test at `baseUrl`, runs it,
 * and calls `close()` in a `finally` (it also undoes the pointing in the harness). `close()`
 * throws when a request was unmatched or differed from its recording (replay), so a swallowed
 * 599 still fails the test.
 */
export async function startWireRecorder(
  options: WireRecorderOptions
): Promise<WireRecorder> {
  const mode = options.mode ?? humbleOracleMode()
  const dir = recordedCaseDir(options.slice, options.caseId)
  const recordedExchanges = readExchanges(dir)
  const usedRecorded = new Set<number>()
  const usedSynthetic = new Set<number>()
  const requests: RecordedRequest[] = []
  const failures: string[] = []
  const written: { exchange: Exchange; body?: Buffer; ext: string }[] = []
  const upstreamOf = options.upstream ?? defaultUpstream

  let baseUrl = ''

  const handle = async (
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> => {
    const body = await readBody(req)
    const header = req.headers['x-oracle-upstream']
    const origin =
      typeof header === 'string' && header.length > 0
        ? header
        : upstreamOf(req.url ?? '/')
    const recorded = recordRequest(req, body, baseUrl, origin)
    requests.push(recorded)
    const fail = (message: string): void => {
      failures.push(message)
      sendResponse(
        res,
        599,
        [['content-type', 'text/plain']],
        Buffer.from(`wire recorder: ${message}`)
      )
    }

    if (mode === 'forward') {
      try {
        const real = await forwardRequest(req, body, origin)
        const contentType =
          real.headers.find(([n]) => n.toLowerCase() === 'content-type')?.[1] ??
          ''
        const ext = bodyExtension(contentType)
        const id = written.length + 1
        written.push({
          exchange: {
            id,
            request: recorded,
            response: {
              status: real.status,
              headers: allowListed(real.headers),
              ...(real.body.length > 0 ? { bodyFile: `body-${id}.${ext}` } : {})
            }
          },
          body:
            real.body.length > 0
              ? redactedBody(contentType, real.body)
              : undefined,
          ext
        })
        // The client under test gets what the real host said; only the recording is redacted.
        sendResponse(
          res,
          real.status,
          real.headers.filter(
            ([n]) =>
              !['content-encoding', 'transfer-encoding', 'connection'].includes(
                n.toLowerCase()
              )
          ),
          real.body
        )
      } catch (error) {
        fail(`forward to ${origin} failed: ${(error as Error).message}`)
      }
      return
    }

    // write mode: a synthetic response first, then the committed one.
    if (mode === 'write') {
      const synthIndex = (options.synthetic ?? []).findIndex(
        (s, i) =>
          !usedSynthetic.has(i) &&
          (s.method === undefined || s.method === recorded.method) &&
          redactTarget(s.target) === recorded.target
      )
      if (synthIndex >= 0) {
        usedSynthetic.add(synthIndex)
        const s = (options.synthetic ?? [])[synthIndex] as SyntheticResponse
        const headers = s.headers ?? []
        const contentType =
          headers.find(([n]) => n.toLowerCase() === 'content-type')?.[1] ?? ''
        const bytes =
          s.body === undefined
            ? Buffer.alloc(0)
            : Buffer.isBuffer(s.body)
              ? s.body
              : Buffer.from(s.body, 'utf8')
        const ext = bodyExtension(contentType)
        const id = written.length + 1
        written.push({
          exchange: {
            id,
            request: recorded,
            response: {
              status: s.status,
              headers: allowListed(headers),
              ...(bytes.length > 0 ? { bodyFile: `body-${id}.${ext}` } : {})
            }
          },
          body: bytes.length > 0 ? redactedBody(contentType, bytes) : undefined,
          ext
        })
        sendResponse(res, s.status, headers, bytes)
        return
      }
    }

    // replay (and write without a synthetic answer): the committed twin by method and target.
    const index = recordedExchanges.findIndex(
      (e, i) =>
        !usedRecorded.has(i) &&
        e.request.method === recorded.method &&
        e.request.target === recorded.target
    )
    if (index < 0) {
      fail(
        `no recorded exchange for ${recorded.method} ${recorded.target} (${options.slice}/${options.caseId})`
      )
      return
    }
    usedRecorded.add(index)
    const exchange = recordedExchanges[index] as Exchange
    if (mode === 'replay' && !same(exchange.request, recorded)) {
      failures.push(
        `${options.slice}/${options.caseId} #${exchange.id}: the request differs from its recording: ${describeDifference(exchange.request, recorded)}`
      )
    }
    const bytes = exchange.response.bodyFile
      ? readFileSync(join(dir, exchange.response.bodyFile))
      : Buffer.alloc(0)
    if (mode === 'write') {
      const id = written.length + 1
      const ext = exchange.response.bodyFile
        ? (exchange.response.bodyFile.split('.').pop() ?? 'bin')
        : 'bin'
      written.push({
        exchange: {
          id,
          request: recorded,
          response: {
            ...exchange.response,
            ...(bytes.length > 0 ? { bodyFile: `body-${id}.${ext}` } : {})
          }
        },
        body: bytes.length > 0 ? bytes : undefined,
        ext
      })
    }
    sendResponse(
      res,
      exchange.response.status,
      exchange.response.headers,
      bytes
    )
  }

  const server: Server = createServer((req, res) => {
    handle(req, res).catch((error: unknown) => {
      failures.push(`recorder error: ${(error as Error).message}`)
      if (!res.headersSent) res.statusCode = 599
      res.end()
    })
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

  return {
    get baseUrl() {
      return baseUrl
    },
    requests,
    failures,
    async close() {
      await new Promise<void>((resolve) => {
        server.close(() => resolve())
        server.closeAllConnections()
      })
      if (mode === 'replay') {
        const unused = recordedExchanges.filter((_, i) => !usedRecorded.has(i))
        if (unused.length > 0) {
          failures.push(
            `${options.slice}/${options.caseId}: ${unused.length} recorded exchange(s) were never requested (${unused.map((e) => `${e.request.method} ${e.request.target}`).join(', ')})`
          )
        }
      }
      if (mode === 'write' || mode === 'forward') {
        mkdirSync(dir, { recursive: true })
        if (existsSync(dir)) {
          for (const name of readdirSync(dir)) {
            if (name.startsWith('body-')) rmSync(join(dir, name))
          }
        }
        for (const item of written) {
          if (item.body) {
            writeFileSync(
              join(dir, item.exchange.response.bodyFile as string),
              item.body
            )
          }
        }
        mkdirSync(dirname(join(dir, 'exchanges.json')), { recursive: true })
        writeFileSync(
          join(dir, 'exchanges.json'),
          `${JSON.stringify(
            written.map((w) => w.exchange),
            null,
            2
          )}\n`
        )
      }
      if (failures.length > 0) throw new Error(failures.join('\n'))
    }
  }
}
