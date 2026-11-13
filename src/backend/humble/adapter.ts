import axios from 'axios'
import { z } from 'zod'

import { logError, logInfo, logWarning, LogPrefix } from 'backend/logger'
import { AdapterResult } from 'common/types/humble'
import { HUMBLE_BASE_URL, ORY_SESSION_COOKIE_PREFIX } from './constants'
import type { AppInfo } from 'backend/process/context'
import type { LoginWindowSeamSlot } from './loginWindowSeam'
import type { HumbleActionIdCache, HumbleActionIdEntry } from './actionIdCache'

/**
 * C5 isolation wall: every outgoing Humble HTTP call and every incoming
 * Humble HTTP response passes through this file. Callers never see a blind
 * cast of an untrusted response (T-10-02) and never see a raw axios error
 * (T-10-03) — every outcome is a typed AdapterResult.
 *
 * Discipline (T-10-01, PITFALLS.md C4): never interpolate the session cookie
 * or a full response body into a logger call.
 */

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
// `z.looseObject` at every level keeps a shape drift from failing the whole
// order (Pitfall 5).
const OrderDetailTpkSchema = z.looseObject({
  redeemed_key_val: z.unknown().nullish(),
  redeemed_key_value: z.string().nullish(),
  is_expired: z.boolean().nullish(),
  expiration: z.string().nullish(),
  key_type: z.string().nullish(),
  human_name: z.string().nullish(),
  machine_name: z.string().nullish(),
  // Phase 14 (HCLAIM-01): the reveal endpoint's third form field. Real type
  // is unconfirmed (likely numeric) — tolerant union, same looseObject
  // convention as every sibling field. Never placed on the public
  // HumbleKey type (classify.ts keeps it in a backend-only side-channel).
  keyindex: z.union([z.string(), z.number()]).nullish()
})

const OrderDetailSchema = z.looseObject({
  gamekey: z.string().nullish(),
  tpkd_dict: z
    .looseObject({
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
    .nullish(),
  // D-27: unpicked Humble Choice month detection fields (UNPICKED
  // pseudo-entry branch in classify.ts) — Assumption A1, unconfirmed by
  // live validation; defensive/optional throughout.
  product: z
    .looseObject({
      category: z.string().nullish(),
      choice_url: z.string().nullish(),
      human_name: z.string().nullish()
    })
    .nullish()
})

export type OrderDetail = z.infer<typeof OrderDetailSchema>
export type OrderDetailTpk = z.infer<typeof OrderDetailTpkSchema>

// WR-04: axios's default timeout is 0 (unlimited). A hung transport (stalled
// TCP, captive portal, Humble blackholing the request) would otherwise pin
// user.ts's `validationInFlight` flag for minutes — silently dropping every
// poll tick and forced revalidation — until the OS-level TCP timeout fires.
// A hung request must become a transient error, not a stall.
const REQUEST_TIMEOUT_MS = 15_000

/**
 * Debug session humble-reveal-key-fails (round 6): thrown by
 * `humblePostRequest` for any non-2xx HTTP response from the login-window
 * seam transport. The seam's `revealPost()` result never rejects on a
 * non-2xx status — it always resolves a response, status code and all — so
 * this class exists purely to give `mapAxiosError` a single,
 * transport-agnostic shape (`.response.{status,headers,data}`) to
 * pattern-match against, alongside axios's own `AxiosError` (still used by
 * `humbleRequest`'s GET path).
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

/**
 * What the adapter's calls read from the boot: the login-window seam slot and the app info (UA
 * source) for the reveal POST, and the action-id owner for the library fetch and the reveal.
 */
export interface HumbleAdapterDeps {
  loginWindowSeam: Pick<LoginWindowSeamSlot, 'getOrThrow'>
  appInfo: Pick<AppInfo, 'userAgentFallback'>
  actionIds: HumbleActionIdCache
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
 * behavior of getGamekeys/getOrderDetail is unchanged.
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

/**
 * Login state of a stored/candidate Humble session, via the Next.js site's own
 * `GET /api/auth/session-status` (JSON `{ status: 'anonymous' | 'authenticated' }`).
 *
 * Why this and not `/api/v1/user/order`: that legacy API 404s for fully authenticated
 * sessions since Humble's Next.js move (measured live 2026-11-13). `session-status`
 * stays `anonymous` for the AAL1 Ory session that exists after the first factor and
 * flips to `authenticated` only once 2FA completes (same run: whoami 403 -> 200
 * active/aal2 at that moment), so a first-factor cookie can never complete login.
 *
 * `unknown` = any non-200 or unrecognised body (health is undecided, never evidence of
 * expiry). A network failure THROWS, like every other adapter call. Status word only:
 * the cookie and body are never logged.
 */
export type HumbleSessionStatus = 'authenticated' | 'anonymous' | 'unknown'

export async function getSessionStatus(
  cookie: string
): Promise<HumbleSessionStatus> {
  const res = await axios.get(`${HUMBLE_BASE_URL}/api/auth/session-status`, {
    headers: {
      Accept: 'application/json',
      Cookie: cookie.startsWith(ORY_SESSION_COOKIE_PREFIX)
        ? cookie
        : `_simpleauth_sess=${cookie}`
    },
    timeout: REQUEST_TIMEOUT_MS,
    maxRedirects: 0,
    validateStatus: () => true
  })
  if (res.status !== 200) return 'unknown'
  const status = (res.data as { status?: unknown } | null)?.status
  if (status === 'authenticated' || status === 'anonymous') return status
  return 'unknown'
}

// ── Library data source (Next.js server action, Humble's 2026-11 site move) ──
//
// Humble's legacy `/api/v1/user/order` + `/api/v1/order/<gamekey>` REST API is
// gone (404 even for an aal2 session). The site's own Library page now loads
// the Purchased list client-side through the Next.js SERVER ACTION
// `filterUserLibrary` (5 items per page, `pagination.totalPages`). The action
// id is a build artifact: it is scraped at runtime from the public JS chunks
// listed by the authenticated /home/library HTML (next to the literal name
// "filterUserLibrary"), cached in the boot's action-id owner (one per
// createHumbleServices), and re-discovered only when a POST proves it stale. Read-only: this action only lists/filters;
// it never reveals or redeems a key.
//
// Redaction (C4/C5): only counts, statuses and field NAMES are ever logged.
// `gameKey`, cookies and response bodies never reach a logger.

const LIBRARY_PATH = '/home/library'
const LIBRARY_ACTION_NAME = 'filterUserLibrary'
const LIBRARY_PAGE_SIZE = 5
/** Runaway guard: more pages than this is drift, not a library. */
const HUMBLE_LIBRARY_MAX_PAGES = 200
/** The client's initial `useActionState` value (chunk 178_o_u738jf3.js). */
const INITIAL_LIBRARY_STATE = {
  results: [],
  pagination: { page: 1, totalPages: 1, totalDocs: 0 },
  success: true
}
const LIBRARY_PAGE_GAP_MS = 300
const CHUNK_FETCH_GAP_MS = 150
// Exact tree the browser sends for /home/library (captured 2026-11-13).
const ROUTER_STATE_TREE =
  '%5B%22%22%2C%7B%22children%22%3A%5B%22(default)%22%2C%7B%22children%22%3A%5B%22(account)%22%2C%7B%22children%22%3A%5B%22home%22%2C%7B%22children%22%3A%5B%22library%22%2C%7B%22children%22%3A%5B%22__PAGE__%22%2C%7B%7D%2Cnull%2Cnull%2C0%5D%7D%2Cnull%2Cnull%2C4%5D%7D%2Cnull%2Cnull%2C8%5D%7D%2Cnull%2Cnull%2C8%5D%7D%2Cnull%2Cnull%2C8%5D%7D%2Cnull%2Cnull%2C24%5D'
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'

const LibraryKeySchema = z.looseObject({
  id: z.string().nullish(),
  title: z.string().nullish(),
  keyIntegrationId: z.string().nullish(),
  gameKey: z.unknown().nullish(),
  redemptionData: z.unknown().nullish(),
  redeemedAt: z.unknown().nullish(),
  expired: z.boolean().nullish(),
  redemptionExpiryDate: z.unknown().nullish(),
  directRedeem: z.unknown().nullish()
})
const LibraryItemSchema = z.looseObject({
  id: z.string(),
  title: z.string().nullish(),
  itemType: z.string().nullish(),
  type: z.string().nullish(),
  entitlements: z
    .looseObject({ keys: z.array(z.unknown()).nullish() })
    .nullish()
})
const LibraryPageSchema = z.looseObject({
  results: z.array(z.unknown()),
  pagination: z.looseObject({
    page: z.number().nullish(),
    totalPages: z.number(),
    totalDocs: z.number().nullish()
  })
})

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

function libraryCookieHeader(cookie: string): string {
  return cookie.startsWith(ORY_SESSION_COOKIE_PREFIX)
    ? cookie
    : `_simpleauth_sess=${cookie}`
}

/** React Flight serializes a Date as "$D<iso>"; anything else is not a date. */
function flightDateToIso(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const raw = value.startsWith('$D') ? value.slice(2) : value
    if (value.startsWith('$') && !value.startsWith('$D')) return undefined
    const d = new Date(raw)
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }
  return undefined
}

/**
 * Maps one library item onto the legacy order-detail shape classifyOrder
 * already understands (one tpk per `entitlements.keys[]` element), so the
 * whole classification/freeze/dedup stack stays unchanged.
 *
 *  - gamekey   = item id; machine_name = key id (stable per-key identity)
 *  - key_type  = keyIntegrationId (steam, epic_keyless, generic, ...)
 *  - redeemed_key_val = `redemptionData.keyFormatted` (or `gameKey`) when
 *    Humble returns it (a revealed key);
 *    `true` when only `redeemedAt` is set (revealed, value not delivered);
 *    absent when unrevealed (gameKey is null then).
 *  - is_expired/expiry_date = expired / redemptionExpiryDate
 *  - keyindex is NOT provided by the new API. The internal `keyindex` field
 *    now carries keyIntegrationId, the second argument of the reveal action
 *    `redeemEntitlementAction(keyId, keyIntegrationId)` (see revealKey).
 *  - NOT mapped (no home in the model): redeemable, giftStatus, notGiftable,
 *    unavailableBefore/After, instructionsHtml, custom CTA fields. Download-
 *    only items and `entitlement-group` rows yield zero keys (D-29).
 */
export function libraryItemToOrderDetail(item: unknown): OrderDetail | null {
  const parsed = LibraryItemSchema.safeParse(item)
  if (!parsed.success) return null
  const it = parsed.data
  const rawKeys = it.entitlements?.keys ?? []
  const tpks: Record<string, unknown>[] = []
  for (const rawKey of rawKeys) {
    const k = LibraryKeySchema.safeParse(rawKey)
    if (!k.success) continue
    const key = k.data
    // A revealed key lives in `redemptionData.keyFormatted` (`gameKey` is null
    // for it); `gameKey` stays as a fallback. Never logged (C4).
    const keyFormatted = (
      key.redemptionData as { keyFormatted?: unknown } | null | undefined
    )?.keyFormatted
    const gameKey =
      typeof keyFormatted === 'string' && keyFormatted !== ''
        ? keyFormatted
        : typeof key.gameKey === 'string' && key.gameKey !== ''
          ? key.gameKey
          : undefined
    const expiry = flightDateToIso(key.redemptionExpiryDate)
    tpks.push({
      machine_name: key.id ?? `${it.id}:${tpks.length}`,
      human_name: key.title ?? it.title ?? undefined,
      key_type: key.keyIntegrationId ?? 'generic',
      // The new reveal action is addressed by (key id, integration id), not
      // the legacy keyindex. The integration id rides the existing internal
      // `keyindex` side-channel so cache/eligibility plumbing is unchanged.
      keyindex: key.keyIntegrationId ?? 'generic',
      ...(key.directRedeem === true ? { direct_redeem: true } : {}),
      ...(gameKey !== undefined
        ? { redeemed_key_val: gameKey }
        : key.redeemedAt
          ? { redeemed_key_val: true }
          : {}),
      is_expired: key.expired === true,
      ...(expiry ? { expiry_date: expiry } : {})
    })
  }
  const order = OrderDetailSchema.safeParse({
    gamekey: it.id,
    human_name: it.title ?? undefined,
    tpkd_dict: { all_tpks: tpks }
  })
  return order.success ? order.data : null
}

type FlightPage = z.infer<typeof LibraryPageSchema> & {
  echoedQuery?: string
  /**
   * The decoded result row exactly as the server serialized it. It is threaded
   * back as the NEXT request's useActionState prevState (the browser does the
   * same; the server ignores the paging fields otherwise). Flight and reply
   * encodings agree for the value forms present ("$undefined", "$D<iso>", `$$`
   * escapes), so it round-trips verbatim. It contains key codes of revealed
   * items: never log it.
   */
  rawRow: unknown
}

/** Extracts the action result row ({results, pagination}) from a flight body. */
function parseLibraryFlight(text: string): FlightPage | null {
  let echoedQuery: string | undefined
  let result: z.infer<typeof LibraryPageSchema> | undefined
  let rawRow: unknown
  for (const line of text.split('\n')) {
    const m = line.match(/^([0-9a-f]+):(\{[\s\S]*\})$/)
    if (!m || !m[2]) continue
    try {
      const json: unknown = JSON.parse(m[2])
      if (m[2].includes('"results"')) {
        const parsed = LibraryPageSchema.safeParse(json)
        if (parsed.success && !result) {
          result = parsed.data
          rawRow = json
        }
      } else if (m[1] === '0') {
        // Row 0 carries the request URL's query string back as `q`.
        const q = (json as { q?: unknown } | null)?.q
        if (typeof q === 'string') echoedQuery = q
      }
    } catch {
      /* not a JSON row */
    }
  }
  return result ? { ...result, echoedQuery, rawRow } : null
}

type ActionOutcome =
  | { kind: 'ok'; page: FlightPage }
  | { kind: 'stale' }
  | { kind: 'session_expired' }
  | { kind: 'access_denied' }
  | { kind: 'schema_error'; raw: unknown }

async function discoverActionId(
  cookie: string,
  pagePath: string,
  actionName: string,
  known: HumbleActionIdEntry | null
): Promise<
  | { kind: 'ok'; cache: HumbleActionIdEntry }
  | { kind: 'session_expired' }
  | { kind: 'access_denied' }
  | { kind: 'schema_error' }
> {
  const html = await axios.get(`${HUMBLE_BASE_URL}${pagePath}`, {
    headers: {
      Cookie: libraryCookieHeader(cookie),
      Accept: 'text/html',
      'User-Agent': BROWSER_UA
    },
    timeout: REQUEST_TIMEOUT_MS,
    maxRedirects: 0,
    responseType: 'text',
    transformResponse: (d) => d,
    validateStatus: () => true
  })
  if (html.status === 401) return { kind: 'session_expired' }
  if (html.status === 403 || html.status === 429)
    return { kind: 'access_denied' }
  if (html.status >= 500) throw new Error(`library page ${html.status}`)
  if (html.status !== 200) {
    const loc = String(html.headers?.['location'] ?? '')
    return loc.includes('auth.humblebundle.com')
      ? { kind: 'session_expired' }
      : { kind: 'schema_error' }
  }
  const body = typeof html.data === 'string' ? html.data : ''
  const scripts = [
    ...new Set(
      [...body.matchAll(/\/_next\/static\/[A-Za-z0-9_\-/()[\].%~]+\.js/g)].map(
        (x) => x[0]
      )
    )
  ]
  // The previously-known chunk path is unchanged across a non-deploy, so try
  // it first; a fresh deploy renames it and falls through to the full scan.
  const ordered = known
    ? [known.chunk, ...scripts.filter((s) => s !== known.chunk)].filter((s) =>
        scripts.includes(s)
      )
    : scripts
  let fetched = 0
  for (const chunk of ordered) {
    if (fetched > 0) await sleep(CHUNK_FETCH_GAP_MS)
    fetched += 1
    const res = await axios.get(`${HUMBLE_BASE_URL}${chunk}`, {
      headers: { 'User-Agent': BROWSER_UA },
      timeout: REQUEST_TIMEOUT_MS,
      responseType: 'text',
      transformResponse: (d) => d,
      validateStatus: () => true
    })
    const text = typeof res.data === 'string' ? res.data : ''
    const m = text.match(
      new RegExp(`"([0-9a-f]{40,44})",[^"]{0,60}"${actionName}"`)
    )
    if (m && m[1]) {
      logInfo(
        [
          `Humble library: discovered ${actionName} action after ${fetched} chunk fetches (of ${scripts.length})`
        ],
        LogPrefix.Backend
      )
      return { kind: 'ok', cache: { id: m[1], chunk } }
    }
  }
  logWarning(
    [`Humble library: ${actionName} action id not found in ${fetched} chunks`],
    LogPrefix.Backend
  )
  return { kind: 'schema_error' }
}

function discoverLibraryActionId(
  cookie: string,
  known: HumbleActionIdEntry | null
) {
  return discoverActionId(cookie, LIBRARY_PATH, LIBRARY_ACTION_NAME, known)
}

/**
 * What the browser's re-encode of a result row looks like: keys whose value is
 * the flight marker "$undefined" are dropped (React omits undefined props).
 */
function mirrorPrevState(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(mirrorPrevState)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === '$undefined') continue
      out[k] = mirrorPrevState(v)
    }
    return out
  }
  return value
}

async function postLibraryAction(
  cookie: string,
  actionId: string,
  pageNumber: number,
  prevState: unknown
): Promise<ActionOutcome> {
  const fd = new FormData()
  // Part 0 = the action's args: [prevState, FormData ref]. Page 1 passes the
  // client's initial useActionState value; page N passes page N-1's result.
  // React's encodeReply appends the `_1_*` entries first and `set`s the root
  // part "0" LAST, so the browser's body has "0" at the end. THIS ORDER IS
  // LOAD-BEARING: with "0" first the server decodes an empty FormData and
  // silently answers with its defaults (page 1, limit 5) - measured live.
  const root = JSON.stringify([mirrorPrevState(prevState), '$K1'])
  // The browser increments requestId from the previous state's (a counter).
  const prevRequestId = Number(
    (prevState as { requestId?: unknown } | null)?.requestId
  )
  const fields: Record<string, string> = {
    requestId: String((Number.isFinite(prevRequestId) ? prevRequestId : 0) + 1),
    query: '',
    sort: 'mostRecent',
    cursor: String(LIBRARY_PAGE_SIZE * pageNumber),
    page: String(pageNumber),
    limit: String(LIBRARY_PAGE_SIZE),
    hideRevealed: 'false',
    hideExpired: 'false',
    dateExpires: ''
  }
  // React's encodeReply names a FormData argument's entries `_<id>_<field>`
  // (leading underscore; the argument is part id 1, referenced as "$K1" from
  // the root part "0").
  for (const [k, v] of Object.entries(fields)) fd.append(`_1_${k}`, v)
  fd.append('0', root)
  // The server takes the page from the request URL's query string (it echoes
  // it back as `q` in flight row 0), exactly as the browser posts from
  // /home/library?page=N.
  const query = pageNumber > 1 ? `?page=${pageNumber}` : ''
  const res = await fetch(`${HUMBLE_BASE_URL}${LIBRARY_PATH}${query}`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      Cookie: libraryCookieHeader(cookie),
      'User-Agent': BROWSER_UA,
      Accept: 'text/x-component',
      'Next-Action': actionId,
      'Next-Router-State-Tree': ROUTER_STATE_TREE,
      Origin: HUMBLE_BASE_URL,
      Referer: `${HUMBLE_BASE_URL}${LIBRARY_PATH}${query}`
    },
    body: fd,
    signal: AbortSignal.timeout(20_000)
  })
  if (res.status === 401) return { kind: 'session_expired' }
  if (res.status === 403 || res.status === 429) return { kind: 'access_denied' }
  if (res.status >= 300 && res.status < 400) {
    return (res.headers.get('location') ?? '').includes('auth.humblebundle.com')
      ? { kind: 'session_expired' }
      : { kind: 'stale' }
  }
  if (res.status >= 500) throw new Error(`library action ${res.status}`)
  if (res.status === 404) return { kind: 'stale' }
  const ct = res.headers.get('content-type') ?? ''
  const text = await res.text()
  if (!ct.includes('text/x-component') || /Server action not found/i.test(text))
    return { kind: 'stale' }
  const page = parseLibraryFlight(text)
  if (!page) return { kind: 'schema_error', raw: `bytes=${text.length}` }
  return { kind: 'ok', page }
}

/**
 * Fetches the WHOLE Humble library (every page of `filterUserLibrary`) and
 * maps each item to an order-detail-shaped object (see
 * libraryItemToOrderDetail). All-or-nothing: any failure mid-run discards the
 * partial result so the caller never commits a truncated library.
 *
 * Failure mapping: 401 / redirect to the auth host -> session_expired;
 * 403/429 -> access_denied; unrecognised shape or undiscoverable action id ->
 * schema_error; network/timeout/5xx THROW (transient, same contract as the
 * rest of this module).
 */
export async function getLibraryOrders(
  cookie: string,
  actionIds: HumbleActionIdCache,
  opts: { signal?: () => boolean } = {}
): Promise<AdapterResult<OrderDetail[]>> {
  try {
    let reusedCached = false
    let action = actionIds.get('library')
    if (!action) {
      const found = await discoverLibraryActionId(cookie, null)
      if (found.kind !== 'ok') {
        return found.kind === 'schema_error'
          ? { status: 'schema_error', raw: 'action id not found' }
          : { status: found.kind }
      }
      actionIds.set('library', found.cache)
      action = found.cache
    } else {
      reusedCached = true
      logInfo(
        ['Humble library: reusing cached filterUserLibrary action id'],
        LogPrefix.Backend
      )
    }

    const orders: OrderDetail[] = []
    const seen = new Set<string>()
    const seenIds = new Set<string>()
    let totalPages = 1
    let totalDocs: number | null | undefined
    let rediscovered = !reusedCached
    let pagesFetched = 0
    let prevState: unknown = INITIAL_LIBRARY_STATE

    for (let page = 1; page <= totalPages; page++) {
      if (page > HUMBLE_LIBRARY_MAX_PAGES) {
        logWarning(
          [`Humble library: page cap ${HUMBLE_LIBRARY_MAX_PAGES} exceeded`],
          LogPrefix.Backend
        )
        return { status: 'schema_error', raw: 'page cap exceeded' }
      }
      if (opts.signal?.()) throw new Error('library fetch aborted')
      if (page > 1) await sleep(LIBRARY_PAGE_GAP_MS)

      let outcome = await postLibraryAction(cookie, action.id, page, prevState)
      if (outcome.kind === 'stale' && !rediscovered) {
        // The id changed (a deploy) or the cache was wrong: re-scrape once.
        rediscovered = true
        logInfo(
          ['Humble library: action id stale, re-discovering'],
          LogPrefix.Backend
        )
        const found = await discoverLibraryActionId(cookie, action)
        if (found.kind !== 'ok') {
          actionIds.set('library', null)
          return found.kind === 'schema_error'
            ? { status: 'schema_error', raw: 'action id not found' }
            : { status: found.kind }
        }
        actionIds.set('library', found.cache)
        action = found.cache
        outcome = await postLibraryAction(
          cookie,
          found.cache.id,
          page,
          prevState
        )
      }
      if (outcome.kind === 'stale') {
        actionIds.set('library', null)
        return { status: 'schema_error', raw: 'action rejected' }
      }
      if (outcome.kind === 'schema_error') {
        return { status: 'schema_error', raw: outcome.raw }
      }
      if (outcome.kind !== 'ok') return { status: outcome.kind }

      pagesFetched += 1
      prevState = outcome.page.rawRow
      if (page === 1) {
        totalPages = outcome.page.pagination.totalPages
        totalDocs = outcome.page.pagination.totalDocs
      }
      // Paging self-check: a server that ignores the paging fields silently
      // re-serves page 1. A partial library must never be returned as
      // complete (the caller prunes the cache against it).
      const reportedPage = outcome.page.pagination.page
      let fresh = 0
      for (const item of outcome.page.results) {
        const id = (item as { id?: unknown } | null)?.id
        if (typeof id === 'string' && !seenIds.has(id)) {
          seenIds.add(id)
          fresh += 1
        }
        const order = libraryItemToOrderDetail(item)
        if (order && order.gamekey && !seen.has(order.gamekey)) {
          seen.add(order.gamekey)
          orders.push(order)
        }
      }
      if (
        (typeof reportedPage === 'number' && reportedPage !== page) ||
        (outcome.page.results.length > 0 && fresh === 0)
      ) {
        logWarning(
          [
            `Humble library: paging not honored (requested page ${page}, server reported ${reportedPage ?? 'none'}, echoed query '${outcome.page.echoedQuery ?? 'none'}', ${fresh} new items) — refusing a partial library`
          ],
          LogPrefix.Backend
        )
        return { status: 'schema_error', raw: 'paging not honored' }
      }
      if (outcome.page.results.length === 0) break
    }

    if (typeof totalDocs === 'number' && seenIds.size < totalDocs) {
      logWarning(
        [
          `Humble library: incomplete (${seenIds.size} of totalDocs=${totalDocs}) — refusing a partial library`
        ],
        LogPrefix.Backend
      )
      return { status: 'schema_error', raw: 'incomplete library' }
    }

    logInfo(
      [
        `Humble library: fetched totalDocs=${totalDocs ?? 'unknown'} totalPages=${totalPages} pagesFetched=${pagesFetched} items=${orders.length}`
      ],
      LogPrefix.Backend
    )
    return { status: 'ok', data: orders }
  } catch (err) {
    return mapAxiosError<OrderDetail[]>(err)
  }
}

const REDEEM_ACTION_NAME = 'redeemEntitlementAction'

const RedeemActionResultSchema = z.looseObject({
  success: z.boolean(),
  key: z.string().nullish(),
  errorKind: z.string().nullish(),
  orderStatus: z.string().nullish()
})

function parseRedeemFlight(
  text: string
): z.infer<typeof RedeemActionResultSchema> | null {
  for (const line of text.split('\n')) {
    const m = line.match(/^([0-9a-f]+):(\{[\s\S]*\})$/)
    if (!m || !m[2] || !m[2].includes('"success"')) continue
    try {
      const parsed = RedeemActionResultSchema.safeParse(JSON.parse(m[2]))
      if (parsed.success) return parsed.data
    } catch {
      /* not a JSON row */
    }
  }
  return null
}

type RedeemPost =
  | { kind: 'ok'; result: z.infer<typeof RedeemActionResultSchema> }
  | { kind: 'stale' }
  | { kind: 'session_expired' }
  | { kind: 'access_denied' }
  | { kind: 'schema_error'; detail: string }

async function postRedeemAction(
  cookie: string,
  actionId: string,
  pagePath: string,
  keyId: string,
  keyIntegrationId: string
): Promise<RedeemPost> {
  // encodeReply of primitive-only args is a JSON array posted as text/plain;
  // the omitted third argument (the provider sign-in result, unused for plain
  // keys) is the "$undefined" marker.
  const res = await fetch(`${HUMBLE_BASE_URL}${pagePath}`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      Cookie: libraryCookieHeader(cookie),
      'User-Agent': BROWSER_UA,
      Accept: 'text/x-component',
      'Content-Type': 'text/plain;charset=UTF-8',
      'Next-Action': actionId,
      Origin: HUMBLE_BASE_URL,
      Referer: `${HUMBLE_BASE_URL}${pagePath}`
    },
    body: JSON.stringify([keyId, keyIntegrationId, '$undefined']),
    signal: AbortSignal.timeout(20_000)
  })
  if (res.status === 401) return { kind: 'session_expired' }
  if (res.status === 403 || res.status === 429) return { kind: 'access_denied' }
  if (res.status >= 300 && res.status < 400) {
    return (res.headers.get('location') ?? '').includes('auth.humblebundle.com')
      ? { kind: 'session_expired' }
      : { kind: 'stale' }
  }
  if (res.status >= 500) throw new Error(`redeem action ${res.status}`)
  if (res.status === 404) return { kind: 'stale' }
  const ct = res.headers.get('content-type') ?? ''
  const text = await res.text()
  if (!ct.includes('text/x-component') || /Server action not found/i.test(text))
    return { kind: 'stale' }
  const result = parseRedeemFlight(text)
  if (!result) {
    // Shape only: status, content type, flight row count. Never the body.
    return {
      kind: 'schema_error',
      detail: `status=${res.status} contentType=${ct} rows=${text.split('\n').length} bytes=${text.length}`
    }
  }
  return { kind: 'ok', result }
}

/**
 * Reveals a key through Humble's Next.js server action
 * `redeemEntitlementAction(keyId, keyIntegrationId, signInResult?)` (the
 * legacy POST /humbler/redeemkey is gone). The action id is scraped from the
 * chunks of the key's own detail page /home/library/<gamekey>, cached, and
 * re-discovered once if a POST proves it stale. `params.keyindex` carries the
 * key's keyIntegrationId (see libraryItemToOrderDetail); `params.machineName`
 * is the key id.
 *
 * Redaction (C4): logs carry only statuses, shapes and the action's short
 * errorKind enum, never the key, cookie or response body.
 */
export async function revealKey(
  cookie: string,
  actionIds: HumbleActionIdCache,
  params: { gamekey: string; machineName: string; keyindex: string | number }
): Promise<AdapterResult<{ key: string }> | { status: 'rejected_by_server' }> {
  const startedAt = Date.now()
  const pagePath = `${LIBRARY_PATH}/${encodeURIComponent(params.gamekey)}`
  try {
    let rediscovered = false
    for (;;) {
      let action = actionIds.get('redeem')
      if (!action) {
        const found = await discoverActionId(
          cookie,
          pagePath,
          REDEEM_ACTION_NAME,
          null
        )
        if (found.kind !== 'ok') {
          return found.kind === 'schema_error'
            ? { status: 'schema_error', raw: 'redeem action id not found' }
            : { status: found.kind }
        }
        actionIds.set('redeem', found.cache)
        action = found.cache
        rediscovered = true
      }
      const out = await postRedeemAction(
        cookie,
        action.id,
        pagePath,
        params.machineName,
        String(params.keyindex)
      )
      if (out.kind === 'stale') {
        actionIds.set('redeem', null)
        if (rediscovered) return { status: 'schema_error', raw: 'stale' }
        continue
      }
      if (out.kind === 'schema_error') {
        logWarning(
          [`Humble adapter: reveal response unrecognised ${out.detail}`],
          LogPrefix.Backend
        )
        return { status: 'schema_error', raw: out.detail }
      }
      if (out.kind !== 'ok') return { status: out.kind }
      const r = out.result
      if (!r.success) {
        logWarning(
          [
            'Humble adapter: reveal rejected by server',
            `errorKind=${r.errorKind ?? 'none'} orderStatus=${r.orderStatus ?? 'none'}`
          ],
          LogPrefix.Backend
        )
        return { status: 'rejected_by_server' }
      }
      if (!r.key) {
        logWarning(
          [
            'Humble adapter: reveal succeeded without a key',
            `orderStatus=${r.orderStatus ?? 'none'}`
          ],
          LogPrefix.Backend
        )
        return { status: 'schema_error', raw: undefined }
      }
      logInfo(
        [
          'Humble adapter: redeemEntitlementAction reveal succeeded',
          `keyPresent=true durationMs=${Date.now() - startedAt}`
        ],
        LogPrefix.Backend
      )
      return { status: 'ok', data: { key: r.key } }
    }
  } catch (err) {
    return mapAxiosError<{ key: string }>(err, 'reveal')
  }
}
