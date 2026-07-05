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

// Phase 11 (Task 2): tightened to the fields classify.ts consumes.
// `redeemed_key_value` uses `.nullish()` per Open Question 2 — Humble's real
// field-shape for a not-yet-revealed key (absent vs. null vs. empty string)
// is unconfirmed, so any falsy value is treated uniformly as "absent" by the
// classifier rather than trusting strict absence alone. `.passthrough()` at
// every level keeps a shape drift from failing the whole order (Pitfall 5).
const OrderDetailTpkSchema = z
  .object({
    redeemed_key_value: z.string().nullish(),
    expiration: z.string().nullish(),
    key_type: z.string().nullish(),
    human_name: z.string().nullish(),
    machine_name: z.string().nullish()
  })
  .passthrough()

const OrderDetailSchema = z
  .object({
    gamekey: z.string().optional(),
    tpkd_dict: z
      .object({
        // T-11-05: unioned with z.unknown() so a single malformed element
        // (wrong type, null, non-object) never fails validation of the
        // WHOLE order — classify.ts's per-tpk try/skip loop is the layer
        // that actually discards a malformed entry, not schema rejection.
        all_tpks: z.array(z.union([OrderDetailTpkSchema, z.unknown()])).optional()
      })
      .passthrough()
      .optional(),
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
    // D-25: Humble rate-limit (429) is a backoff-inducing denial — routed
    // through the same access_denied abort+cooldown path as 403; never
    // hammered (C5).
    if (err.response?.status === 429) return { status: 'access_denied' }
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
