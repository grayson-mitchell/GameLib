import {
  HumbleValidationReport,
  HumbleValidationEndpointResult,
  AdapterResult
} from 'common/types/humble'

import { HumbleUser } from './user'
import { getAccountIdentity, getGamekeys, getOrderDetail } from './adapter'

/**
 * D-12 dev-only in-app debug trigger. Exercises the REAL adapter
 * (getAccountIdentity/getGamekeys/getOrderDetail) with the REAL stored
 * encrypted cookie, decrypted via HumbleUser.getCredentials() — never a
 * standalone Node script (D-12: Node CLI is not Electron main).
 *
 * Returns a redacted HumbleValidationReport (D-15): endpoint paths, result
 * status, zod-parse pass/fail, a gamekey COUNT (never gamekey values), and a
 * steam_app_id PRESENCE boolean (never the id value itself). This function
 * never writes to disk — the human checkpoint (Plan 05 Task 2) transcribes
 * the (still-redacted) result into 10-VALIDATION.md.
 */
export async function runHumbleValidation(): Promise<HumbleValidationReport> {
  const timestamp = new Date().toISOString()
  const cookie = await HumbleUser.getCredentials()

  if (!cookie) {
    return {
      transport: 'axios',
      timestamp,
      overall: 'fail',
      endpoints: [
        {
          path: '/api/v1/user/info',
          status: 'not_attempted',
          schemaValid: false,
          advisory: true
        },
        { path: '/api/v1/user/order', status: 'not_attempted', schemaValid: false },
        {
          path: '/api/v1/order/{gamekey}',
          status: 'not_attempted',
          schemaValid: false
        }
      ],
      gamekeyCount: 0,
      steamAppIdPresent: false
    }
  }

  const endpoints: HumbleValidationEndpointResult[] = []

  // D-13 revised: the account-identifier endpoint is ADVISORY ONLY (D-02).
  // It is still called and recorded, but can never fail the overall verdict.
  const identity = await getAccountIdentity(cookie)
  endpoints.push(
    toEndpointResult('/api/v1/user/info', identity, { advisory: true })
  )

  // D-13 point 1: gamekeys list
  const gamekeys = await getGamekeys(cookie)
  endpoints.push(toEndpointResult('/api/v1/user/order', gamekeys))

  let gamekeyCount = 0
  let steamAppIdPresent = false
  let orderDetailOk = false

  if (gamekeys.status === 'ok') {
    gamekeyCount = gamekeys.data.length
    const firstGamekey = gamekeys.data[0]

    if (firstGamekey) {
      // D-13 point 2: at least one order-detail fetch
      const orderDetail = await getOrderDetail(cookie, firstGamekey)
      endpoints.push(toEndpointResult('/api/v1/order/{gamekey}', orderDetail))
      orderDetailOk = orderDetail.status === 'ok'

      // D-13 point 3: tpkd_dict.all_tpks[n].steam_app_id presence
      if (orderDetail.status === 'ok') {
        const tpks = orderDetail.data.tpkd_dict?.all_tpks ?? []
        steamAppIdPresent = tpks.some(
          (tpk) =>
            typeof tpk === 'object' &&
            tpk !== null &&
            'steam_app_id' in (tpk as Record<string, unknown>)
        )
      }
    } else {
      endpoints.push({
        path: '/api/v1/order/{gamekey}',
        status: 'not_attempted',
        schemaValid: false
      })
    }
  } else {
    endpoints.push({
      path: '/api/v1/order/{gamekey}',
      status: 'not_attempted',
      schemaValid: false
    })
  }

  // D-13 revised: overall depends ONLY on gamekeys + order-detail +
  // steamAppIdPresent. The advisory identity result above can never flip
  // this verdict (D-02).
  const overall: 'pass' | 'fail' =
    gamekeys.status === 'ok' && orderDetailOk && steamAppIdPresent
      ? 'pass'
      : 'fail'

  return {
    transport: 'axios',
    timestamp,
    overall,
    endpoints,
    gamekeyCount,
    steamAppIdPresent
  }
}

function toEndpointResult(
  path: string,
  result: AdapterResult<unknown>,
  opts?: { advisory?: boolean }
): HumbleValidationEndpointResult {
  return {
    path,
    status: result.status,
    schemaValid: result.status === 'ok',
    ...(opts?.advisory ? { advisory: true } : {})
  }
}
