import axios from 'axios'
import { z } from 'zod'

import { logError, logWarning, LogPrefix } from 'backend/logger'
import { AdapterResult, HumbleUserData } from 'common/types/humble'
import { HUMBLE_BASE_URL, HUMBLE_REQUIRED_HEADERS } from './constants'

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
// .passthrough() on the entry — only `gamekey` is consumed here; the rest of
// the summary object (human_name, created, product, ...) is Phase 11 scope.
const GamekeyEntrySchema = z.object({ gamekey: z.string() }).passthrough()
const GamekeysSchema = z.array(GamekeyEntrySchema)

// Permissive on purpose — Plan 05's live validation gate needs to assert
// tpkd_dict.all_tpks[n].steam_app_id presence against the real API before
// this schema is tightened. .passthrough() keeps unknown fields intact.
const OrderDetailSchema = z
  .object({
    gamekey: z.string().optional(),
    tpkd_dict: z
      .object({
        all_tpks: z.array(z.unknown()).optional()
      })
      .passthrough()
      .optional()
  })
  .passthrough()

// D-02/D-13 point 4: endpoint confirmed empirically in Plan 05 (10-VALIDATION.md)
const AccountIdentitySchema = z
  .object({
    username: z.string()
  })
  .passthrough()

export type OrderDetail = z.infer<typeof OrderDetailSchema>

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
async function humbleRequest(
  path: string,
  cookie: string
): Promise<HumbleRawResponse> {
  const res = await axios.get(`${HUMBLE_BASE_URL}${path}`, {
    headers: buildHeaders(cookie)
  })
  const contentTypeHeader = res.headers?.['content-type']
  return {
    data: res.data,
    contentType: typeof contentTypeHeader === 'string' ? contentTypeHeader : null
  }
}

/**
 * Maps a caught error to the 401/403 split. Rethrows anything else — callers
 * are expected to let genuinely unexpected errors surface rather than be
 * swallowed into a misleading AdapterResult.
 */
function mapAxiosError<T>(err: unknown): AdapterResult<T> {
  if (axios.isAxiosError(err)) {
    if (err.response?.status === 401) return { status: 'session_expired' }
    if (err.response?.status === 403) return { status: 'access_denied' }
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
    const parsed = GamekeysSchema.safeParse(response.data)
    if (!parsed.success) {
      describeSchemaFailure('/api/v1/user/order', response, parsed.error)
      return { status: 'schema_error', raw: response.data }
    }
    return { status: 'ok', data: parsed.data.map((entry) => entry.gamekey) }
  } catch (err) {
    return mapAxiosError<string[]>(err)
  }
}

export async function getOrderDetail(
  cookie: string,
  gamekey: string
): Promise<AdapterResult<OrderDetail>> {
  try {
    const response = await humbleRequest(`/api/v1/order/${gamekey}`, cookie)
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
