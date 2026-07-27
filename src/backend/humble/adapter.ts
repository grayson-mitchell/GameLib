import axios from 'axios'
import { net } from 'electron'
import { z } from 'zod'

import { logError, logWarning, LogPrefix } from 'backend/logger'
import { AdapterResult, HumbleUserData } from 'common/types/humble'
import {
  HUMBLE_BASE_URL,
  HUMBLE_LOGIN_PARTITION,
  HUMBLE_REDEEM_PATH,
  HUMBLE_REQUIRED_HEADERS
} from './constants'
import { standardBrowserUserAgent } from './userAgent'
import { getLoginWindowSeam, type LoginWindowSeam } from './loginWindowSeam'

/**
 * C5 isolation wall: every outgoing Humble HTTP call and every incoming
 * Humble HTTP response passes through this file. Callers never see a blind
 * cast of an untrusted response (T-10-02) and never see a raw axios error
 * (T-10-03) — every outcome is a typed AdapterResult.
 *
 * Discipline (T-10-01, PITFALLS.md C4): never interpolate the session cookie
 * or a full response body into a logger call.
 */

// GET /api/v1/user/order returns an ARRAY of per-order summary objects, each
// carrying at minimum a `gamekey` string (HUMBLE-SPEC-SOURCE.md Appendix A:
// "Order list: returns the user's gamekeys" — confirmed empirically live in
// Plan 06 to be `[{ gamekey: string, ... }]`, NOT bare strings).
// Per-entry tolerance (Pitfall 5, live-UAT round 2): ONE malformed summary
// entry must never fail the whole list — the array shape is validated
// wholesale, then entries are extracted individually and malformed ones are
// skipped (with a redacted count-only warning). A non-array body, or an
// array where EVERY entry is malformed, is still a schema_error — that is
// wholesale shape drift and must stay loudly self-diagnosing rather than
// silently becoming "0 orders".
const GamekeyEntrySchema = z.object({ gamekey: z.string() }).passthrough()
const GamekeysArraySchema = z.array(z.unknown())

// Live-UAT round 3 (debug: humble-zero-keys-from-valid-orders): field names
// verified against two WORKING integrations (Playnite HumbleKeysLibrary
// Models/Order.cs Tpk model; FailSpy humble-steam-key-redeemer) — the real
// API's redeemed field is `redeemed_key_val` (any JSON type, e.g. an object
// for some non-Steam key types) and the real expiry signal is `is_expired`
// (bool). The spec's `redeemed_key_value`/`expiration` names are kept as
// tolerated fallbacks in case some order types still carry them. Every field
// is optional at the SCHEMA level — but classification requires `key_type`
// (a string) as key evidence: entries without it are download entitlements
// (PDF/ebook bundle contents), excluded per D-29 (live-UAT round 5;
// classify.ts hasKeyEvidence does its own guarded read, so the schema stays
// maximally tolerant here).
// `.passthrough()` at every level keeps a shape drift from failing the whole
// order (Pitfall 5).
const OrderDetailTpkSchema = z
  .object({
    redeemed_key_val: z.unknown().nullish(),
    redeemed_key_value: z.string().nullish(),
    is_expired: z.boolean().nullish(),
    expiration: z.string().nullish(),
    key_type: z.string().nullish(),
    human_name: z.string().nullish(),
    machine_name: z.string().nullish(),
    // Phase 14 (HCLAIM-01): the reveal endpoint's third form field. Real type
    // is unconfirmed (likely numeric) — tolerant union, same .passthrough()
    // convention as every sibling field. Never placed on the public
    // HumbleKey type (classify.ts keeps it in a backend-only side-channel).
    keyindex: z.union([z.string(), z.number()]).nullish()
  })
  .passthrough()

// Phase 14 (HCLAIM-01): the reveal endpoint's response shape, cross-verified
// against two independent community implementations (14-RESEARCH.md "Reveal
// Endpoint Contract"). `error_msg` is intentionally never logged/forwarded
// verbatim by revealKey() below — it may echo a key value (C4).
const RevealResponseSchema = z
  .object({
    success: z.boolean().nullish(),
    key: z.string().nullish(),
    error_msg: z.string().nullish()
  })
  .passthrough()

const OrderDetailSchema = z
  .object({
    gamekey: z.string().nullish(),
    tpkd_dict: z
      .object({
        // T-11-05: unioned with z.unknown() so a single malformed element
        // (wrong type, null, non-object) never fails validation of the
        // WHOLE order — classify.ts's per-tpk try/skip loop is the layer
        // that actually discards a malformed entry, not schema rejection.
        // `.nullish()` (not `.optional()`) throughout: a live
        // `"tpkd_dict": null` / `"all_tpks": null` must degrade to "no
        // tpks" (diagnosed by library.ts's zero-key logging), never fail
        // the whole order parse into a schema_error.
        all_tpks: z.array(z.union([OrderDetailTpkSchema, z.unknown()])).nullish()
      })
      .passthrough()
      .nullish(),
    // D-27: unpicked Humble Choice month detection fields (UNPICKED
    // pseudo-entry branch in classify.ts) — Assumption A1, unconfirmed by
    // live validation; defensive/optional throughout.
    product: z
      .object({
        category: z.string().nullish(),
        choice_url: z.string().nullish(),
        human_name: z.string().nullish()
      })
      .passthrough()
      .nullish()
  })
  .passthrough()

// D-02/D-13 point 4: endpoint confirmed empirically in Plan 05 (10-VALIDATION.md)
const AccountIdentitySchema = z
  .object({
    username: z.string()
  })
  .passthrough()

export type OrderDetail = z.infer<typeof OrderDetailSchema>
export type OrderDetailTpk = z.infer<typeof OrderDetailTpkSchema>

function buildHeaders(cookie: string) {
  return {
    ...HUMBLE_REQUIRED_HEADERS,
    Cookie: `_simpleauth_sess=${cookie}`
  }
}

/**
 * Raw transport result: the parsed body PLUS just enough metadata
 * (content-type, never the body itself beyond what the caller already has)
 * to make a schema_error self-diagnosing (see describeSchemaFailure below) —
 * distinguishes "valid JSON, wrong shape" from "got redirected to an
 * HTML/interstitial page that isn't the API at all".
 */
interface HumbleRawResponse {
  data: unknown
  contentType: string | null
}

/**
 * Single transport seam (D-14 revised): every adapter function routes its
 * HTTP call through this one function, with the identical signature
 * `humbleRequest(path, cookie): Promise<HumbleRawResponse>`. Axios stays the
 * primary transport. If the live validation gate (Plan 06) shows the
 * bare-axios transport is blocked by Humble, this is the ONLY function that
 * needs to be swapped for a `session.fromPartition('persist:humble').fetch()`
 * implementation behind the same signature — call sites in
 * getGamekeys/getOrderDetail/getAccountIdentity never change.
 */
// WR-04: axios's default timeout is 0 (unlimited). A hung transport (stalled
// TCP, captive portal, Humble blackholing the request) would otherwise pin
// user.ts's `validationInFlight` flag for minutes — silently dropping every
// poll tick and forced revalidation — until the OS-level TCP timeout fires.
// A hung request must become a transient error, not a stall.
const REQUEST_TIMEOUT_MS = 15_000

async function humbleRequest(
  path: string,
  cookie: string
): Promise<HumbleRawResponse> {
  const res = await axios.get(`${HUMBLE_BASE_URL}${path}`, {
    headers: buildHeaders(cookie),
    timeout: REQUEST_TIMEOUT_MS
  })
  const contentTypeHeader = res.headers?.['content-type']
  let data: unknown = res.data
  // Live-payload tolerance (UAT round 2): if the body arrives as a raw
  // string but IS valid JSON (mislabeled content-type, an interceptor
  // disabling axios's silent JSON parsing, or a double-encoded body),
  // coerce it once. A genuinely non-JSON body (HTML interstitial /
  // challenge page) stays a string and surfaces as a self-diagnosing
  // schema_error with bodyIsString=true.
  if (typeof data === 'string' && data.length > 0) {
    try {
      data = JSON.parse(data)
    } catch {
      // keep the raw string — describeSchemaFailure flags it
    }
  }
  return {
    data,
    contentType: typeof contentTypeHeader === 'string' ? contentTypeHeader : null
  }
}

/**
 * Debug session humble-reveal-key-fails (round 6): thrown by
 * `humblePostRequest` for any non-2xx HTTP response. `net.request` (unlike
 * axios) never rejects on a non-2xx status — it always resolves a response,
 * status code and all — so this class exists purely to give `mapAxiosError`
 * a single, transport-agnostic shape (`.response.{status,headers,data}`) to
 * pattern-match against, alongside axios's own `AxiosError`.
 */
class HumbleTransportHttpError extends Error {
  response: {
    status: number
    headers: Record<string, unknown> | undefined
    data: unknown
  }
  constructor(response: {
    status: number
    headers: Record<string, unknown> | undefined
    data: unknown
  }) {
    super(`Humble transport HTTP error ${response.status}`)
    this.name = 'HumbleTransportHttpError'
    this.response = response
  }
}

function coerceJsonBody(raw: string): unknown {
  if (raw.length === 0) return raw
  try {
    return JSON.parse(raw)
  } catch {
    // keep the raw string — describeSchemaFailure/summarizeErrorBody flag it
    return raw
  }
}

function firstHeaderValue(value: string | string[] | undefined): string | null {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value[0] ?? null
  return null
}

/**
 * POST transport sibling to `humbleRequest` (D-14 revised, TRANSPORT SWAPPED
 * round 6, DUAL-BUILD BRANCH Phase 34.4.1 Plan 04): the codebase's one
 * write-style Humble call (Phase 14 HCLAIM-01, reveal/redeem) routes through
 * this single function, which now branches on whether a Tauri login-window
 * seam is installed (`getLoginWindowSeam()`).
 *
 * Debug session humble-reveal-key-fails, round 6: rounds 1-5 iterated on the
 * request's CONTENT (CSRF header, csrf_cookie double-submit, dropping
 * X-Requested-By, hand-building the full cookie jar) while staying on axios.
 * Round 5's checkpoint evidence proved content was never the problem:
 * fullCookieJarPresent=true (every fix live) still got a live 403 whose body
 * was `contentType=text/html`, `looksLikeHtml=true`, `bodyLength=4552` — the
 * unmistakable shape of a Cloudflare Bot-Management/WAF challenge PAGE, not
 * a Humble JSON denial (Humble's own denials are always JSON; this endpoint
 * was never reached). Cloudflare fingerprints the TRANSPORT itself (TLS/JA3,
 * HTTP/1.1 vs HTTP/2, cipher/extension order, header casing/ordering) —
 * no header or cookie content, however correct, can fix a transport-level
 * fingerprint mismatch from inside axios's plain Node.js HTTPS stack.
 *
 * Under Electron (`humblePostRequestViaElectronNet`, unchanged): routes
 * through Electron's own Chromium network stack (`net.request`) on the same
 * `persist:humble` partition the login flow already uses — a genuine
 * Chromium TLS/HTTP2 fingerprint, indistinguishable from a real browser tab.
 *
 * Under Tauri (`humblePostRequestViaSeam`, Phase 34.4.1 Plan 04 D-07): there
 * is no `net.request`/partition equivalent at all (no Tauri `session`
 * shape), so the ONE structurally-new option is the login window's OWN
 * `fetch()` — a genuine WKWebView network stack, real in kind, not merely
 * UA-spoofed. This branch does NOT re-run rounds 1-5 of
 * `humble-reveal-key-fails`: cookie/header fidelity was already falsified as
 * the cause under axios; only the TRANSPORT differs here too. Whatever
 * Cloudflare returns against this genuine browser stack — pass or another
 * 403 — is a DECLARABLE outcome (D-07), fed through the SAME
 * `RevealResponseSchema`/error-mapping path either branch uses; see
 * `humblePostRequestViaSeam`'s own doc comment below.
 */
function humblePostRequest(
  path: string,
  body: string,
  csrfToken?: string
): Promise<HumbleRawResponse> {
  const seam = getLoginWindowSeam()
  return seam
    ? humblePostRequestViaSeam(seam, path, body, csrfToken)
    : humblePostRequestViaElectronNet(path, body, csrfToken)
}

/**
 * D-07 Tauri transport branch: the webview's own `fetch()` replaces
 * axios/`net.request`, but the request's CONTENT (csrf header, form body)
 * and the response's SCHEMA (`RevealResponseSchema`, consumed by `revealKey`
 * below) are byte-identical to the Electron path — this function's only job
 * is to shape the seam's `{status, body}` result into the SAME
 * `HumbleRawResponse`/`HumbleTransportHttpError` contract
 * `humblePostRequestViaElectronNet` already produces, so every downstream
 * caller is unchanged.
 *
 * Keeps `REQUEST_TIMEOUT_MS`'s existing semantics on this path too: the Rust
 * arm's own 20s `recv_timeout` (`main.rs`) is a backstop, not a replacement
 * — a hung seam call (a wedged `rustInvoke` round-trip) must still surface
 * as the SAME recognizable timeout error `humblePostRequestViaElectronNet`
 * has always thrown, rather than hanging the reveal indefinitely on this
 * branch specifically.
 */
async function humblePostRequestViaSeam(
  seam: LoginWindowSeam,
  path: string,
  body: string,
  csrfToken?: string
): Promise<HumbleRawResponse> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(
        new Error(`Humble reveal request timed out after ${REQUEST_TIMEOUT_MS}ms`)
      )
    }, REQUEST_TIMEOUT_MS)
  })
  try {
    const result = await Promise.race([
      seam.revealPost({
        originUrl: HUMBLE_BASE_URL,
        path,
        body,
        csrfToken,
        userAgent: standardBrowserUserAgent()
      }),
      timeoutPromise
    ])
    const data = coerceJsonBody(result.body)
    if (result.status >= 200 && result.status < 300) {
      return { data, contentType: null }
    }
    throw new HumbleTransportHttpError({
      status: result.status,
      headers: undefined,
      data
    })
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle)
  }
}

/**
 * Electron transport branch (D-14 revised, TRANSPORT SWAPPED round 6):
 * routes through Electron's own Chromium network stack (`net.request`) on
 * the same `persist:humble` partition the login flow already uses — a
 * genuine Chromium TLS/HTTP2 fingerprint, indistinguishable from a real
 * browser tab, because it IS the same network stack a real browser tab
 * uses. `partition` + `useSessionCookies: true` + `credentials: 'include'`
 * make Chromium attach the partition's live cookie jar NATIVELY
 * (superseding round 5's hand-built HumbleUser.getFullCookieHeader — see
 * that removal's comment in user.ts) — no manual Cookie header is set here
 * at all. `csrf-prevention-token` remains a manually-set header (round 1/3,
 * LIVE-CONFIRMED CORRECT by round 5's csrfTokenPresent=true evidence) since
 * real Humble page JS also derives it from `document.cookie` and sets it
 * explicitly, rather than relying on it being an automatically-attached
 * header. GET paths (`humbleRequest`, still axios) are UNCHANGED — round 4/5
 * evidence shows Cloudflare scores this write endpoint far more
 * aggressively than the read endpoints, so only the one endpoint that has
 * ever failed needs the swap.
 */
function humblePostRequestViaElectronNet(
  path: string,
  body: string,
  csrfToken?: string
): Promise<HumbleRawResponse> {
  return new Promise((resolve, reject) => {
    const request = net.request({
      method: 'POST',
      url: `${HUMBLE_BASE_URL}${path}`,
      partition: HUMBLE_LOGIN_PARTITION,
      credentials: 'include',
      useSessionCookies: true
    })

    // WR-04 parity: humbleRequest's axios timeout applies per-call; net's
    // ClientRequest has no built-in timeout option, so it is armed manually
    // and tears the request down explicitly on expiry — a hung transport
    // must become a transient (rethrown) error, never a silent stall.
    const timeoutHandle = setTimeout(() => {
      request.abort()
      reject(
        new Error(`Humble reveal request timed out after ${REQUEST_TIMEOUT_MS}ms`)
      )
    }, REQUEST_TIMEOUT_MS)
    const clearRequestTimeout = () => clearTimeout(timeoutHandle)

    request.setHeader('Accept', HUMBLE_REQUIRED_HEADERS.Accept)
    request.setHeader('Content-Type', 'application/x-www-form-urlencoded')
    // Presents the same Chrome-shaped UA as the login window/partition
    // (user.ts's watchForLogin already calls ses.setUserAgent with this
    // exact value) — Cloudflare correlates UA against TLS fingerprint, so a
    // mismatched UA on an otherwise-genuine Chromium connection is itself a
    // signal worth avoiding, even though this transport's TLS fingerprint is
    // already self-consistent by construction.
    request.setHeader('User-Agent', standardBrowserUserAgent())
    if (csrfToken) {
      request.setHeader('csrf-prevention-token', csrfToken)
    }

    request.on('response', (response) => {
      const chunks: Buffer[] = []
      response.on('data', (chunk: Buffer) => chunks.push(chunk))
      response.on('end', () => {
        clearRequestTimeout()
        const data = coerceJsonBody(Buffer.concat(chunks).toString('utf8'))
        const contentType = firstHeaderValue(response.headers?.['content-type'])
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve({ data, contentType })
          return
        }
        reject(
          new HumbleTransportHttpError({
            status: response.statusCode,
            headers: response.headers,
            data
          })
        )
      })
      response.on('error', (err: Error) => {
        clearRequestTimeout()
        reject(err)
      })
    })

    request.on('error', (err: Error) => {
      clearRequestTimeout()
      reject(err)
    })

    request.end(body)
  })
}

// Debug session humble-reveal-key-fails (round 5): access_denied currently
// collapses TWO very different failure shapes into one status — a genuine
// Humble JSON denial (real, correctly-authenticated 403) and a Cloudflare
// Bot Management challenge page (HTML, __cf_bm-gated — round 4 evidence
// confirmed Humble sits behind Cloudflare). These have completely different
// root causes and completely different fixes, but were previously
// indistinguishable because mapAxiosError never logged anything for a caught
// HTTP error. This is STRUCTURAL-ONLY (mirrors describeSchemaFailure's own
// redaction discipline, T-10-01/C4): never the response body's contents,
// only its shape (string vs parsed, HTML-looking or not) and length.
function summarizeErrorBody(data: unknown): {
  bodyIsString: boolean
  looksLikeHtml: boolean
  bodyLength: number
} {
  const bodyIsString = typeof data === 'string'
  let bodyLength: number
  try {
    bodyLength =
      typeof data === 'string'
        ? data.length
        : JSON.stringify(data ?? null).length
  } catch {
    bodyLength = -1
  }
  const looksLikeHtml =
    typeof data === 'string' && /^\s*<(!doctype|html)/i.test(data)
  return { bodyIsString, looksLikeHtml, bodyLength }
}

/**
 * Extracts a transport-agnostic `{status, headers, data}` shape from a
 * caught error, whichever of the two transports this adapter uses produced
 * it — axios's `AxiosError` (GET paths, humbleRequest) or this module's own
 * `HumbleTransportHttpError` (the reveal POST, humblePostRequest — round 6).
 * Returns undefined for anything else (network errors, thrown non-HTTP
 * errors), which mapAxiosError treats as "genuinely unexpected" below.
 */
function extractHttpErrorResponse(err: unknown):
  | {
      status: number
      headers: Record<string, unknown> | undefined
      data: unknown
    }
  | undefined {
  if (axios.isAxiosError(err) && err.response) {
    return {
      status: err.response.status,
      headers: err.response.headers as Record<string, unknown> | undefined,
      data: err.response.data
    }
  }
  if (err instanceof HumbleTransportHttpError) {
    return err.response
  }
  return undefined
}

/**
 * Maps a caught error to the 401/403 split. Rethrows anything else — callers
 * are expected to let genuinely unexpected errors surface rather than be
 * swallowed into a misleading AdapterResult.
 *
 * `context`, when provided, additionally logs a redacted HTTP-failure
 * diagnostic (status/content-type/body-shape, never body content) for any
 * caught HTTP error response — opt-in per call site so the existing silent
 * behavior of getGamekeys/getOrderDetail/getAccountIdentity is unchanged.
 */
function mapAxiosError<T>(err: unknown, context?: string): AdapterResult<T> {
  const httpResponse = extractHttpErrorResponse(err)
  if (httpResponse) {
    if (context) {
      const contentType = httpResponse.headers?.['content-type']
      const { bodyIsString, looksLikeHtml, bodyLength } = summarizeErrorBody(
        httpResponse.data
      )
      logWarning(
        [
          `Humble adapter: ${context} HTTP failure diagnostic`,
          `status=${httpResponse.status} contentType=${typeof contentType === 'string' ? contentType : 'unknown'}`,
          `bodyIsString=${bodyIsString} looksLikeHtml=${looksLikeHtml} bodyLength=${bodyLength}`
        ],
        LogPrefix.Backend
      )
    }
    if (httpResponse.status === 401) return { status: 'session_expired' }
    if (httpResponse.status === 403) return { status: 'access_denied' }
    // D-25: Humble rate-limit (429) is a backoff-inducing denial — routed
    // through the same access_denied abort+cooldown path as 403; never
    // hammered (C5).
    if (httpResponse.status === 429) return { status: 'access_denied' }
  }
  logError(
    [
      'Humble adapter: unexpected request failure (see message only, never body/cookie)'
    ],
    LogPrefix.Backend
  )
  throw err
}

// Cap on logged zod issues per failure — enough to diagnose a shape drift
// without the log line growing unbounded on a pathological schema.
const MAX_LOGGED_SCHEMA_ISSUES = 5

/**
 * Makes a `schema_error` self-diagnosing for the NEXT run, fully redacted
 * (T-10-01 / Pitfall 4): logs the zod issue paths + messages (structural
 * only — a path like `[0].gamekey` and a message like "Required" never
 * carries a value), the response content-type, whether the body was a raw
 * string (a non-JSON / HTML redirect masquerading as a 200 would surface
 * here as `bodyIsString=true` rather than a confusing zod issue list — this
 * is the "transport misclassification" hypothesis), and a body LENGTH only
 * — never the body's contents, never the cookie.
 */
function describeSchemaFailure(
  path: string,
  response: HumbleRawResponse,
  error: z.ZodError
): void {
  const { data, contentType } = response
  const bodyIsString = typeof data === 'string'
  let bodyLength: number
  try {
    bodyLength =
      typeof data === 'string'
        ? data.length
        : JSON.stringify(data ?? null).length
  } catch {
    bodyLength = -1 // unserializable body (e.g. circular) — length unknown
  }
  const issues = error.issues
    .slice(0, MAX_LOGGED_SCHEMA_ISSUES)
    .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
  logWarning(
    [
      `Humble adapter: ${path} response failed schema validation`,
      `contentType=${contentType ?? 'unknown'} bodyIsString=${bodyIsString} bodyLength=${bodyLength}`,
      `issues=${JSON.stringify(issues)}`
    ],
    LogPrefix.Backend
  )
}

export async function getGamekeys(
  cookie: string
): Promise<AdapterResult<string[]>> {
  try {
    const response = await humbleRequest('/api/v1/user/order', cookie)
    const parsed = GamekeysArraySchema.safeParse(response.data)
    if (!parsed.success) {
      describeSchemaFailure('/api/v1/user/order', response, parsed.error)
      return { status: 'schema_error', raw: response.data }
    }

    // Per-entry extraction: skip malformed entries instead of failing the
    // whole list (Pitfall 5). Wholesale drift (a non-empty array with ZERO
    // valid entries) is still a schema_error — see comment on the schema.
    const gamekeys: string[] = []
    const entryIssues: string[] = []
    for (const [index, rawEntry] of parsed.data.entries()) {
      const entry = GamekeyEntrySchema.safeParse(rawEntry)
      if (entry.success) {
        gamekeys.push(entry.data.gamekey)
      } else if (entryIssues.length < MAX_LOGGED_SCHEMA_ISSUES) {
        // Structural paths + messages only — never entry values (T-10-01).
        const first = entry.error.issues[0]
        entryIssues.push(
          `[${index}].${first?.path.join('.') || '<root>'}: ${first?.message}`
        )
      }
    }

    if (parsed.data.length > 0 && gamekeys.length === 0) {
      describeSchemaFailure(
        '/api/v1/user/order',
        response,
        new z.ZodError([
          {
            code: z.ZodIssueCode.custom,
            path: [],
            message: `no entry carried a string gamekey (${parsed.data.length} entries)`
          }
        ])
      )
      return { status: 'schema_error', raw: response.data }
    }

    if (entryIssues.length > 0) {
      logWarning(
        [
          `Humble adapter: /api/v1/user/order skipped ${parsed.data.length - gamekeys.length} malformed order-summary entries (kept ${gamekeys.length})`,
          `issues=${JSON.stringify(entryIssues)}`
        ],
        LogPrefix.Backend
      )
    }

    return { status: 'ok', data: gamekeys }
  } catch (err) {
    return mapAxiosError<string[]>(err)
  }
}

export async function getOrderDetail(
  cookie: string,
  gamekey: string
): Promise<AdapterResult<OrderDetail>> {
  try {
    // `?all_tpkds=true` (note the spelling — tpkDs) is REQUIRED to get the
    // full third-party-key allocation in `tpkd_dict.all_tpks`. Without it
    // Humble does not reliably include the tpk data — live-UAT round 3 saw
    // 25/25 orders parse ok with ZERO extractable keys (debug session:
    // humble-zero-keys-from-valid-orders). Every working integration sends
    // it: Playnite HumbleKeysLibrary (`api/v1/order/{0}?all_tpkds=true`) and
    // FailSpy humble-steam-key-redeemer use this exact param.
    // WR-04: `gamekey` is only schema-validated as z.string() from the
    // order-list response — a drifted/hostile value containing '/', '?', '#'
    // or whitespace would silently change the request target or truncate the
    // required all_tpkds=true query. The adapter is the C5 isolation wall:
    // never forward an untrusted string into the URL structure verbatim.
    const response = await humbleRequest(
      `/api/v1/order/${encodeURIComponent(gamekey)}?all_tpkds=true`,
      cookie
    )
    const parsed = OrderDetailSchema.safeParse(response.data)
    if (!parsed.success) {
      describeSchemaFailure(`/api/v1/order/${gamekey}`, response, parsed.error)
      return { status: 'schema_error', raw: response.data }
    }
    return { status: 'ok', data: parsed.data }
  } catch (err) {
    return mapAxiosError<OrderDetail>(err)
  }
}

export async function getAccountIdentity(
  cookie: string
): Promise<AdapterResult<HumbleUserData>> {
  try {
    // D-02/D-13 point 4: endpoint confirmed empirically in Plan 05 (10-VALIDATION.md)
    const response = await humbleRequest('/api/v1/user/info', cookie)
    const parsed = AccountIdentitySchema.safeParse(response.data)
    if (!parsed.success) {
      describeSchemaFailure('/api/v1/user/info', response, parsed.error)
      return { status: 'schema_error', raw: response.data }
    }
    return { status: 'ok', data: parsed.data }
  } catch (err) {
    return mapAxiosError<HumbleUserData>(err)
  }
}

/**
 * The codebase's FIRST write-style Humble adapter call (Phase 14, HCLAIM-01).
 * Contract researched + cross-verified against two independent community
 * implementations (14-RESEARCH.md "Reveal Endpoint Contract") — MEDIUM
 * confidence, validated live before shipping to any UI button (D-71/Plan 06).
 *
 * NAMING TRAP (load-bearing, do not "fix"): the POST field literally named
 * `keytype` carries `params.machineName` (HumbleKey.machineName), NOT the
 * platform label (`key_type`/`platform` elsewhere in this codebase).
 *
 * T-14-01/T-14-05: never a blind cast, never a logged key/error_msg/body —
 * only status/length, matching describeSchemaFailure's redaction discipline.
 *
 * Debug session humble-reveal-key-fails (round 6): no longer takes a `cookie`
 * or `fullCookieHeader` argument — humblePostRequest's electron-net transport
 * sources the live `persist:humble` partition's cookie jar NATIVELY
 * (`useSessionCookies`/`credentials: 'include'`), so a hand-passed session
 * cookie value has nothing left to do here. The caller (library.ts) still
 * independently gates on `HumbleUser.getCredentials()` being present before
 * ever reaching this function — that "are we logged in at all" precondition
 * is unrelated to what this function sends on the wire.
 */
export async function revealKey(
  csrfToken: string | undefined,
  params: { gamekey: string; machineName: string; keyindex: string | number }
): Promise<AdapterResult<{ key: string }> | { status: 'rejected_by_server' }> {
  try {
    const body = new URLSearchParams({
      keytype: params.machineName,
      key: params.gamekey,
      keyindex: String(params.keyindex)
    }).toString()
    const response = await humblePostRequest(HUMBLE_REDEEM_PATH, body, csrfToken)
    const parsed = RevealResponseSchema.safeParse(response.data)
    if (!parsed.success) {
      describeSchemaFailure(HUMBLE_REDEEM_PATH, response, parsed.error)
      return { status: 'schema_error', raw: response.data }
    }
    if (parsed.data.success === false) {
      // WR-06 (14-REVIEW): a well-formed body carrying an EXPLICIT denial
      // (e.g. Humble's "already redeemed"/"expired") is a definitive SERVER
      // verdict, not schema drift — it must never pollute the schema_error
      // diagnostic meaning nor let the caller claim "nothing was used up".
      // C4: error_msg may echo a key value — never logged/forwarded
      // verbatim. Presence/length only, mirroring describeSchemaFailure.
      logWarning(
        [
          `Humble adapter: ${HUMBLE_REDEEM_PATH} reveal rejected by server`,
          `success=false keyPresent=${Boolean(parsed.data.key)} errorMsgLength=${parsed.data.error_msg?.length ?? 0}`
        ],
        LogPrefix.Backend
      )
      return { status: 'rejected_by_server' }
    }
    if (parsed.data.success !== true || !parsed.data.key) {
      // success absent/mistyped, or success:true without a key — genuine
      // shape drift. Same redaction discipline as above.
      logWarning(
        [
          `Humble adapter: ${HUMBLE_REDEEM_PATH} reveal did not succeed`,
          `success=${parsed.data.success ?? 'absent'} keyPresent=${Boolean(parsed.data.key)} errorMsgLength=${parsed.data.error_msg?.length ?? 0}`
        ],
        LogPrefix.Backend
      )
      return { status: 'schema_error', raw: undefined }
    }
    return { status: 'ok', data: { key: parsed.data.key } }
  } catch (err) {
    return mapAxiosError<{ key: string }>(err, 'reveal')
  }
}
