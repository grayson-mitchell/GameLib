/**
 * The one HTTP recorder every Phase 87 engine and wine oracle shares (87-05, D-08).
 *
 * Carried over from the 86 recorder (retired with the TS info slice) and generalised over the
 * crate the fixtures belong to. `installRecorder` sets `axios.defaults.adapter` to a stable
 * dispatcher. `axios.create` copies the default adapter when an instance is made, so the call has
 * to come before any slice module is imported: the shared `axiosClient` in `backend/utils` and
 * bare `axios` then both pass through it. A test imports its slice module dynamically, after
 * `installRecorder`.
 *
 * Three modes, from the environment:
 *   - `GAMELIB_EW_ORACLE=record`: hit the live service, write
 *     `recorded/<slice>/<case>/exchanges.json` and one byte-exact `body-<n>.<ext>` per response. A
 *     case may name `synthetic` responses (an archive body that must never be a real download, an
 *     error path no live service will produce on demand): those are served in place of the
 *     network and the TS request is still recorded.
 *   - `GAMELIB_WRITE_ENGINE_GOLDEN=1`: replay the recordings; the test rewrites its goldens.
 *   - otherwise: replay and compare. CI is offline and deterministic.
 *
 * `exchanges.json` is the list the Rust replay reads: `{id, request: {method, url, headers,
 * body?}, response: {status, headers, bodyFile?}, tsOnly?, rustOnly?}`.
 *
 * Redaction runs before anything is written (87 Pitfall 12, T-87-10): the `key` query value,
 * every `Authorization` and `x-auth-token` header value, `set-cookie` and a `"token"` field in a
 * JSON response body become `REDACTED`. Response headers are further reduced to an allow-list:
 * a CDN edge adds `cf-ray` (its colo names the operator's region), `report-to` and `nel` tokens,
 * none of which a replay needs. The same redaction is applied to a live request before it is
 * matched, so a replayed request finds its recorded twin.
 */
import axios, {
  AxiosError,
  AxiosHeaders,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig
} from 'axios'
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'

export type OracleMode = 'record' | 'write' | 'compare'

let fixturesRootOverride: string | null = null

/**
 * Test-only: points every fixture path at `dir` (a temp directory) so the harness self-tests can
 * write and compare goldens without touching a committed crate. Returns the restore function.
 */
export function overrideFixturesRoot(dir: string): () => void {
  fixturesRootOverride = dir
  return () => {
    fixturesRootOverride = null
  }
}

/** The crate directory a slice's fixtures live under (`gamelib-wine`, `gamelib-engine`, ...). */
export const fixturesRoot = (crate: string): string =>
  fixturesRootOverride ??
  join(
    __dirname,
    '..',
    '..',
    '..',
    '..',
    'src-tauri',
    'crates',
    crate,
    'tests',
    'fixtures'
  )

export const engineWineRecordedCaseDir = (
  crate: string,
  slice: string,
  caseId: string
): string => join(fixturesRoot(crate), 'recorded', slice, caseId)

const REDACTED = 'REDACTED'

/** The mode the environment asks for. Record wins over write when both are set. */
export function engineWineOracleMode(
  env: NodeJS.ProcessEnv = process.env
): OracleMode {
  if (env.GAMELIB_EW_ORACLE === 'record') return 'record'
  if (env.GAMELIB_WRITE_ENGINE_GOLDEN === '1') return 'write'
  return 'compare'
}

export interface SyntheticResponse {
  /** Matched against the request's method. */
  method: string
  /** Matched against the request URL's path (no query): exact string, or a pattern. */
  path: string | RegExp
  status: number
  headers?: Record<string, string>
  body: string
  /** Binary body, base64. Wins over `body` (a gzip payload does not survive a utf8 string). */
  bodyBase64?: string
  /**
   * The TS sees a transport failure (no response at all). Recorded as an exchange with
   * `status: 0` and `networkError: true`; the TS gets an AxiosError with no `response`.
   */
  networkError?: boolean
}

interface RustOnlyRequest {
  method: string
  url: string
  headers?: Record<string, string>
  body?: string
}

export interface RecorderOptions {
  /** The crate whose `tests/fixtures` hold the recordings, e.g. `gamelib-wine`. */
  crate: string
  slice: string
  caseId: string
  mode?: OracleMode
  synthetic?: SyntheticResponse[]
  /** Fetched in record mode only, so the Rust replay has a response. Never served to TS. */
  rustOnly?: RustOnlyRequest[]
  /**
   * Request ids (`ex-<n>`), `METHOD url` strings, or a `METHOD url-prefix*` pattern, for requests
   * that TS makes and Rust will not.
   */
  tsOnly?: string[]
  /**
   * Record mode only: which URLs may reach the live network. A request this rejects throws instead
   * of being sent, so a binary archive can never be downloaded by accident (T-87-11). Omitted:
   * every request is allowed.
   */
  allowLive?: (url: string) => boolean
}

interface RecordedExchange {
  id: string
  request: {
    method: string
    url: string
    headers: Record<string, string>
    body?: string
  }
  response: {
    status: number
    headers: Record<string, string>
    bodyFile?: string
  }
  tsOnly?: true
  rustOnly?: true
  synthetic?: true
  /** The request failed at the transport: the caller saw an error with no response. */
  networkError?: true
}

export interface Recorder {
  readonly mode: OracleMode
  /** The exchanges seen so far (record mode) or served so far (replay modes). */
  readonly exchanges: readonly RecordedExchange[]
  /** `METHOD url` (secrets redacted) of every request the TS made, in order. */
  readonly requested: readonly string[]
  /** Record mode: write the files. Replay modes: assert nothing was unmatched or left over. */
  finish(): Promise<void>
}

const SECRET_HEADERS = new Set(['authorization', 'x-auth-token', 'set-cookie'])

/** `key=<value>` in a URL's query, whatever the value, becomes `key=REDACTED`. */
export function redactUrl(url: string): string {
  return url.replace(/([?&]key=)[^&#]*/gi, `$1${REDACTED}`)
}

export function redactHeaders(
  headers: Record<string, unknown>
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined || value === null || value === false) continue
    const lower = name.toLowerCase()
    out[lower] = SECRET_HEADERS.has(lower)
      ? REDACTED
      : Array.isArray(value)
        ? value.map(String).join(', ')
        : typeof value === 'object'
          ? JSON.stringify(value)
          : String(value as string | number | boolean)
  }
  return out
}

/** The response headers a replay can need; the rest (`cf-ray`, `report-to`, `nel`, `date`) is edge noise. */
const KEPT_RESPONSE_HEADERS = new Set([
  'content-type',
  'etag',
  'last-modified',
  'link'
])

function allowResponseHeaders(
  headers: Record<string, string>
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => KEPT_RESPONSE_HEADERS.has(name))
  )
}

/** A `"token": "<value>"` field in a JSON body (the HowLongToBeat search-init response). */
function redactBody(body: Buffer, contentType: string): Buffer {
  if (!/json/i.test(contentType)) return body
  const text = body.toString('utf8')
  const redacted = text.replace(/("token"\s*:\s*")[^"]*(")/g, `$1${REDACTED}$2`)
  return redacted === text ? body : Buffer.from(redacted, 'utf8')
}

/** Method plus scheme, lower-cased host, path and the query pairs sorted: the matching key. */
function matchKey(method: string, rawUrl: string): string {
  const url = new URL(rawUrl)
  const pairs = [...url.searchParams.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
  return `${method.toUpperCase()} ${url.protocol}//${url.host.toLowerCase()}${url.pathname}?${pairs.join('&')}`
}

function extensionFor(contentType: string): string {
  if (/json/i.test(contentType)) return 'json'
  if (/html/i.test(contentType)) return 'html'
  if (/^text\//i.test(contentType) || /xml/i.test(contentType)) return 'txt'
  return 'bin'
}

function bodyAsString(data: unknown): string | undefined {
  if (data === undefined || data === null) return undefined
  if (typeof data === 'string') return data
  if (Buffer.isBuffer(data)) return data.toString('utf8')
  if (data instanceof URLSearchParams) return data.toString()
  return JSON.stringify(data)
}

function headerRecord(config: InternalAxiosRequestConfig) {
  const raw: unknown = config.headers
  const plain = raw instanceof AxiosHeaders ? raw.toJSON() : raw
  return redactHeaders((plain ?? {}) as Record<string, unknown>)
}

/** Builds the response axios would hand back, applying `validateStatus` as `settle` does. */
function respond(
  config: InternalAxiosRequestConfig,
  status: number,
  headers: Record<string, string>,
  body: Buffer
): AxiosResponse {
  if (config.responseType === 'stream') {
    throw new Error(
      'oracle recorder: responseType "stream" is not supported; record the body as a buffer'
    )
  }
  // The real http adapter counts the decoded bytes against `maxContentLength` and aborts the
  // request: a caller that sets a cap sees an ERR_BAD_RESPONSE with no response.
  const cap = config.maxContentLength
  if (typeof cap === 'number' && cap > -1 && body.length > cap) {
    throw new AxiosError(
      `maxContentLength size of ${cap} exceeded`,
      AxiosError.ERR_BAD_RESPONSE,
      config
    )
  }
  const data: unknown =
    config.responseType === 'arraybuffer' ? body : body.toString('utf8')
  const response: AxiosResponse = {
    data,
    status,
    statusText: '',
    headers: new AxiosHeaders(headers),
    config,
    request: {}
  }
  if (!config.validateStatus || config.validateStatus(status)) return response
  throw new AxiosError(
    `Request failed with status code ${status}`,
    status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST,
    config,
    response.request,
    response
  )
}

/** What axios throws for a transport failure: an AxiosError with a code and no `response`. */
function networkFailure(config: InternalAxiosRequestConfig): AxiosError {
  return new AxiosError(
    'connect ECONNREFUSED oracle.invalid:443',
    AxiosError.ERR_NETWORK,
    config
  )
}

interface CaseState {
  options: Required<Pick<RecorderOptions, 'crate' | 'slice' | 'caseId'>> &
    RecorderOptions & { mode: OracleMode }
  dir: string
  exchanges: RecordedExchange[]
  bodies: Map<string, Buffer>
  served: Set<number>
  unmatched: string[]
  handle(config: InternalAxiosRequestConfig): Promise<AxiosResponse>
}

let current: CaseState | null = null

const dispatcher: AxiosAdapter = (config) => {
  if (!current) {
    return Promise.reject(
      new Error(
        'oracle recorder: a request was made outside an installed case (call installRecorder first)'
      )
    )
  }
  return current.handle(config)
}

function isTsOnly(
  options: RecorderOptions,
  id: string,
  method: string,
  url: string
): boolean {
  const key = `${method} ${url}`
  return (options.tsOnly ?? []).some((flag) =>
    flag.endsWith('*')
      ? key.startsWith(flag.slice(0, -1))
      : flag === id || flag === key
  )
}

async function realRequest(
  config: InternalAxiosRequestConfig
): Promise<{ status: number; headers: Record<string, string>; body: Buffer }> {
  const adapter = axios.getAdapter('http')
  const response = await adapter({
    ...config,
    responseType: 'arraybuffer',
    validateStatus: () => true
  })
  const raw: unknown = response.headers
  const headers = allowResponseHeaders(
    redactHeaders(
      (raw instanceof AxiosHeaders ? raw.toJSON() : raw) as Record<
        string,
        unknown
      >
    )
  )
  // The body file holds the decoded bytes, so the wire's length and framing headers would lie.
  delete headers['content-length']
  delete headers['transfer-encoding']
  return {
    status: response.status,
    headers,
    body: Buffer.isBuffer(response.data)
      ? response.data
      : Buffer.from(String(response.data), 'utf8')
  }
}

function pathOf(url: string): string {
  return new URL(url).pathname
}

const pathMatches = (want: string | RegExp, got: string): boolean =>
  typeof want === 'string' ? want === got : want.test(got)

/**
 * Sets the shared adapter without starting a case, so a test can import its slice module before
 * the first `installRecorder`. A request made with no case installed is rejected by name.
 */
export function installAdapter(): void {
  axios.defaults.adapter = dispatcher
}

/**
 * Installs the recorder for one case. Call it before importing the slice module (the first call
 * is what sets the shared adapter); call it again for each later case.
 */
export function installRecorder(options: RecorderOptions): Recorder {
  const mode = options.mode ?? engineWineOracleMode()
  const dir = engineWineRecordedCaseDir(
    options.crate,
    options.slice,
    options.caseId
  )
  const exchanges: RecordedExchange[] = []
  const bodies = new Map<string, Buffer>()
  const served = new Set<number>()
  const unmatched: string[] = []
  const requested: string[] = []
  const syntheticUses = new Map<string, number>()

  if (mode !== 'record') {
    const file = join(dir, 'exchanges.json')
    if (existsSync(file)) {
      const loaded = JSON.parse(
        readFileSync(file, 'utf8')
      ) as RecordedExchange[]
      for (const exchange of loaded) {
        exchanges.push(exchange)
        if (exchange.response.bodyFile) {
          bodies.set(
            exchange.response.bodyFile,
            readFileSync(join(dir, exchange.response.bodyFile))
          )
        }
      }
    }
  }

  const store = (
    request: RecordedExchange['request'],
    response: { status: number; headers: Record<string, string>; body: Buffer },
    flags: Partial<
      Pick<RecordedExchange, 'rustOnly' | 'synthetic' | 'networkError'>
    > = {}
  ): void => {
    const n = exchanges.length + 1
    const id = `ex-${n}`
    const contentType = response.headers['content-type'] ?? ''
    const body = redactBody(response.body, contentType)
    let bodyFile: string | undefined
    if (body.length > 0) {
      bodyFile = `body-${n}.${extensionFor(contentType)}`
      bodies.set(bodyFile, body)
    }
    const exchange: RecordedExchange = {
      id,
      request,
      response: {
        status: response.status,
        headers: response.headers,
        ...(bodyFile ? { bodyFile } : {})
      }
    }
    if (!flags.rustOnly && isTsOnly(options, id, request.method, request.url)) {
      exchange.tsOnly = true
    }
    if (flags.rustOnly) exchange.rustOnly = true
    if (flags.synthetic) exchange.synthetic = true
    if (flags.networkError) exchange.networkError = true
    exchanges.push(exchange)
  }

  const handleRecord = async (
    config: InternalAxiosRequestConfig
  ): Promise<AxiosResponse> => {
    const method = (config.method ?? 'get').toUpperCase()
    const url = redactUrl(axios.getUri(config))
    requested.push(`${method} ${url}`)
    const body = bodyAsString(config.data)
    const request = {
      method,
      url,
      headers: headerRecord(config),
      ...(body === undefined ? {} : { body })
    }
    // Several synthetic responses for one method and path are served in order, one per request;
    // the last one repeats (a single entry therefore answers every matching request).
    const candidates = (options.synthetic ?? []).filter(
      (s) =>
        s.method.toUpperCase() === method &&
        pathMatches(s.path, pathOf(axios.getUri(config)))
    )
    const nth =
      syntheticUses.get(`${method} ${pathOf(axios.getUri(config))}`) ?? 0
    syntheticUses.set(`${method} ${pathOf(axios.getUri(config))}`, nth + 1)
    const synthetic = candidates[Math.min(nth, candidates.length - 1)]
    if (synthetic?.networkError) {
      store(
        request,
        { status: 0, headers: {}, body: Buffer.alloc(0) },
        { synthetic: true, networkError: true }
      )
      throw networkFailure(config)
    }
    if (synthetic) {
      const response = {
        status: synthetic.status,
        headers: redactHeaders(synthetic.headers ?? {}),
        body: synthetic.bodyBase64
          ? Buffer.from(synthetic.bodyBase64, 'base64')
          : Buffer.from(synthetic.body, 'utf8')
      }
      store(request, response, { synthetic: true })
      return respond(config, response.status, response.headers, response.body)
    }
    if (options.allowLive && !options.allowLive(url)) {
      throw new Error(
        `oracle recorder: refusing a live request to ${url} in ${options.slice}/${options.caseId}; serve it as a synthetic response`
      )
    }
    const response = await realRequest(config)
    store(request, response)
    return respond(config, response.status, response.headers, response.body)
  }

  const handleReplay = (
    config: InternalAxiosRequestConfig
  ): Promise<AxiosResponse> => {
    const method = (config.method ?? 'get').toUpperCase()
    const url = redactUrl(axios.getUri(config))
    requested.push(`${method} ${url}`)
    const wanted = matchKey(method, url)
    const index = exchanges.findIndex(
      (e, i) =>
        !e.rustOnly &&
        !served.has(i) &&
        matchKey(e.request.method, e.request.url) === wanted
    )
    if (index < 0) {
      unmatched.push(`${method} ${url}`)
      return Promise.reject(
        new Error(
          `oracle recorder: no recorded exchange for ${method} ${url} in ${options.slice}/${options.caseId}`
        )
      )
    }
    served.add(index)
    const exchange = exchanges[index] as RecordedExchange
    if (exchange.networkError) return Promise.reject(networkFailure(config))
    const body = exchange.response.bodyFile
      ? (bodies.get(exchange.response.bodyFile) ?? Buffer.alloc(0))
      : Buffer.alloc(0)
    try {
      return Promise.resolve(
        respond(
          config,
          exchange.response.status,
          exchange.response.headers,
          body
        )
      )
    } catch (error) {
      return Promise.reject(
        error instanceof Error ? error : new Error(String(error))
      )
    }
  }

  const state: CaseState = {
    options: { ...options, mode },
    dir,
    exchanges,
    bodies,
    served,
    unmatched,
    handle: mode === 'record' ? handleRecord : handleReplay
  }
  current = state
  axios.defaults.adapter = dispatcher

  return {
    mode,
    exchanges,
    requested,
    async finish() {
      if (mode === 'record') {
        for (const extra of options.rustOnly ?? []) {
          const method = extra.method.toUpperCase()
          // Headers default to those of the TS request for the same URL (the pinned user-agent
          // Rust must send identically), when TS made one.
          const twin = exchanges.find(
            (e) =>
              !e.rustOnly &&
              e.request.method === method &&
              e.request.url === redactUrl(extra.url)
          )
          const headers = extra.headers ?? twin?.request.headers ?? {}
          const config = {
            url: extra.url,
            method,
            headers: new AxiosHeaders(headers),
            data: extra.body,
            timeout: 15_000
          } as unknown as InternalAxiosRequestConfig
          const response = await realRequest(config)
          store(
            {
              method,
              url: redactUrl(extra.url),
              headers: redactHeaders(headers),
              ...(extra.body === undefined ? {} : { body: extra.body })
            },
            response,
            { rustOnly: true }
          )
        }
        rmSync(dir, { recursive: true, force: true })
        mkdirSync(dir, { recursive: true })
        for (const [name, bytes] of bodies) {
          writeFileSync(join(dir, name), bytes)
        }
        writeFileSync(
          join(dir, 'exchanges.json'),
          `${JSON.stringify(exchanges, null, 2)}\n`
        )
      } else {
        if (unmatched.length > 0) {
          throw new Error(
            `oracle recorder: unmatched requests in ${options.slice}/${options.caseId}: ${unmatched.join('; ')}`
          )
        }
        const left = exchanges
          .map((e, i) => ({ e, i }))
          .filter(({ e, i }) => !e.rustOnly && !served.has(i))
          .map(({ e }) => e.id)
        if (left.length > 0) {
          throw new Error(
            `oracle recorder: recorded exchanges the TS never requested in ${options.slice}/${options.caseId}: ${left.join(', ')}`
          )
        }
      }
      if (current === state) current = null
    }
  }
}

/** One download a case expects: the body served for `url`, and the progress it reports. */
export interface DownloadRecording {
  url: string
  /** A synthetic body (built from in-repo data, never a downloaded binary: T-87-11). */
  body: Buffer | string
  /** Progress callbacks fired, in order, before the body is written. */
  progress?: readonly { transferred: number; total: number }[]
  /** The download fails with this message instead of writing anything. */
  fail?: string
}

export interface DownloadStub {
  /** The stand-in for a `downloadFile(url, destination, onProgress?)` seam. */
  download(
    url: string,
    destination: string,
    onProgress?: (p: { transferred: number; total: number }) => void
  ): Promise<void>
  /** `url` of every download asked for, in order. */
  readonly requested: readonly string[]
  /** Throws when a recording was never asked for. */
  expectAllServed(): void
}

/**
 * Replaces a `downloadFile`-shaped seam (the wine-manager's EasyDl flow, which bypasses the axios
 * adapter) with a stand-in that serves a recorded or synthetic body by URL, keyed exactly. A URL
 * with no recording throws by name rather than serving a default, so a case cannot pass over a
 * download it never described. Each recording is served once.
 */
export function stubDownloadFile(
  recordings: readonly DownloadRecording[]
): DownloadStub {
  const pending = new Map<string, DownloadRecording[]>()
  for (const rec of recordings) {
    pending.set(rec.url, [...(pending.get(rec.url) ?? []), rec])
  }
  const requested: string[] = []
  return {
    requested,
    async download(url, destination, onProgress) {
      requested.push(url)
      const queue = pending.get(url)
      const rec = queue?.shift()
      if (!rec) {
        throw new Error(`oracle recorder: no download recorded for ${url}`)
      }
      for (const step of rec.progress ?? []) onProgress?.(step)
      if (rec.fail !== undefined) throw new Error(rec.fail)
      mkdirSync(dirname(destination), { recursive: true })
      writeFileSync(destination, rec.body)
      await Promise.resolve()
    },
    expectAllServed() {
      const left = [...pending.values()].flat()
      if (left.length > 0) {
        throw new Error(
          `oracle recorder: downloads recorded but never requested: ${left.map((r) => r.url).join(', ')}`
        )
      }
    }
  }
}
