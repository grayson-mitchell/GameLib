import axios from 'axios'
import { z } from 'zod'

import { logError, LogPrefix } from 'backend/logger'
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

const GamekeysSchema = z.array(z.string())

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
 * Single transport seam (D-14 revised): every adapter function routes its
 * HTTP call through this one function, with the identical signature
 * `humbleRequest(path, cookie): Promise<unknown>`. Axios stays the primary
 * transport. If the live validation gate (Plan 06) shows the bare-axios
 * transport is blocked by Humble, this is the ONLY function that needs to be
 * swapped for a `session.fromPartition('persist:humble').fetch()`
 * implementation behind the same signature — call sites in
 * getGamekeys/getOrderDetail/getAccountIdentity never change.
 */
async function humbleRequest(path: string, cookie: string): Promise<unknown> {
  const res = await axios.get(`${HUMBLE_BASE_URL}${path}`, {
    headers: buildHeaders(cookie)
  })
  return res.data
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

export async function getGamekeys(
  cookie: string
): Promise<AdapterResult<string[]>> {
  try {
    const data = await humbleRequest('/api/v1/user/order', cookie)
    const parsed = GamekeysSchema.safeParse(data)
    if (!parsed.success) return { status: 'schema_error', raw: data }
    return { status: 'ok', data: parsed.data }
  } catch (err) {
    return mapAxiosError<string[]>(err)
  }
}

export async function getOrderDetail(
  cookie: string,
  gamekey: string
): Promise<AdapterResult<OrderDetail>> {
  try {
    const data = await humbleRequest(`/api/v1/order/${gamekey}`, cookie)
    const parsed = OrderDetailSchema.safeParse(data)
    if (!parsed.success) return { status: 'schema_error', raw: data }
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
    const data = await humbleRequest('/api/v1/user/info', cookie)
    const parsed = AccountIdentitySchema.safeParse(data)
    if (!parsed.success) return { status: 'schema_error', raw: data }
    return { status: 'ok', data: parsed.data }
  } catch (err) {
    return mapAxiosError<HumbleUserData>(err)
  }
}
