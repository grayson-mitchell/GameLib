/**
 * The one HTTP recorder every 86 oracle slice shares (86-04, D-09 and D-10).
 *
 * `installRecorder` sets `axios.defaults.adapter` to a stable dispatcher. `axios.create` copies the
 * default adapter when an instance is made, so the call has to come before any slice module is
 * imported: the shared `axiosClient` in `backend/utils` and bare `axios` then both pass through it.
 * A test imports its slice module dynamically, after `installRecorder`.
 *
 * Three modes, from the environment:
 *   - `GAMELIB_INFO_ORACLE=record`: hit the live service, write `recorded/<slice>/<case>/exchanges.json`
 *     and one byte-exact `body-<n>.<ext>` per response. A case may name `synthetic` responses (for an
 *     error path no live service will produce on demand): those are served in place of the network
 *     and the TS request is still recorded.
 *   - `GAMELIB_WRITE_INFO_GOLDEN=1`: replay the recordings; the test rewrites its goldens.
 *   - otherwise: replay and compare. CI is offline and deterministic.
 *
 * `exchanges.json` is the list 86-03's `Replay::from_case` reads: `{id, request: {method, url,
 * headers, body?}, response: {status, headers, bodyFile?}, tsOnly?, rustOnly?}`. The request is
 * what the TS actually sent (`axios.getUri(config)`), so Rust's request can be pinned to it.
 *
 * Redaction runs before anything is written (Pitfall 10, T-86-08): the `key` query value, every
 * `Authorization` and `x-auth-token` header value, `set-cookie`, and a `"token"` field in a JSON
 * response body become `REDACTED`. The same redaction is applied to a live request before it is
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
import { join } from 'path'

export type OracleMode = 'record' | 'write' | 'compare'

/** Every committed 86 fixture lives under this crate directory. */
export const FIXTURES_ROOT = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  'src-tauri',
  'crates',
  'gamelib-info',
  'tests',
  'fixtures'
)

export const recordedCaseDir = (slice: string, caseId: string): string =>
  join(FIXTURES_ROOT, 'recorded', slice, caseId)

export const REDACTED = 'REDACTED'

/** The mode the environment asks for. Record wins over write when both are set. */
export function oracleMode(env: NodeJS.ProcessEnv = process.env): OracleMode {
  if (env.GAMELIB_INFO_ORACLE === 'record') return 'record'
  if (env.GAMELIB_WRITE_INFO_GOLDEN === '1') return 'write'
  return 'compare'
}

export interface SyntheticResponse {
  /** Matched against the request's method. */
  method: string
  /** Matched against the request URL's path (no query). */
  path: string
  status: number
  headers?: Record<string, string>
  body: string
}

export interface RustOnlyRequest {
  method: string
  url: string
  headers?: Record<string, string>
  body?: string
}

export interface RecorderOptions {
  slice: string
  caseId: string
  mode?: OracleMode
  synthetic?: SyntheticResponse[]
  /** Fetched in record mode only, so the Rust replay has a response. Never served to TS. */
  rustOnly?: RustOnlyRequest[]
  /** Request ids (`ex-<n>`) or `METHOD url` strings that TS makes and Rust will not. */
  tsOnly?: string[]
}

export interface RecordedExchange {
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

/** A `"token": "<value>"` field in a JSON body (the HowLongToBeat search-init response). */
export function redactBody(body: Buffer, contentType: string): Buffer {
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

interface CaseState {
  options: Required<Pick<RecorderOptions, 'slice' | 'caseId'>> &
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
  const flagged = options.tsOnly ?? []
  return flagged.includes(id) || flagged.includes(`${method} ${url}`)
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
  const headers = redactHeaders(
    (raw instanceof AxiosHeaders ? raw.toJSON() : raw) as Record<
      string,
      unknown
    >
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
  const mode = options.mode ?? oracleMode()
  const dir = recordedCaseDir(options.slice, options.caseId)
  const exchanges: RecordedExchange[] = []
  const bodies = new Map<string, Buffer>()
  const served = new Set<number>()
  const unmatched: string[] = []
  const requested: string[] = []

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
    flags: Partial<Pick<RecordedExchange, 'rustOnly' | 'synthetic'>> = {}
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
    const synthetic = (options.synthetic ?? []).find(
      (s) =>
        s.method.toUpperCase() === method &&
        s.path === pathOf(axios.getUri(config))
    )
    if (synthetic) {
      const response = {
        status: synthetic.status,
        headers: redactHeaders(synthetic.headers ?? {}),
        body: Buffer.from(synthetic.body, 'utf8')
      }
      store(request, response, { synthetic: true })
      return respond(config, response.status, response.headers, response.body)
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
          const config = {
            url: extra.url,
            method,
            headers: new AxiosHeaders(extra.headers ?? {}),
            data: extra.body,
            timeout: 15_000
          } as unknown as InternalAxiosRequestConfig
          const response = await realRequest(config)
          store(
            {
              method,
              url: redactUrl(extra.url),
              headers: redactHeaders(extra.headers ?? {}),
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
