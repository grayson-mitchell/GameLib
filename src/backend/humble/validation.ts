import {
  HumbleValidationReport,
  HumbleValidationEndpointResult,
  AdapterResult
} from 'common/types/humble'

import type { HumbleActionIdCache } from './actionIdCache'
import type { HumbleUser } from './user'
import { getLibraryOrders } from './adapter'

/**
 * D-12 dev-only in-app debug trigger. Exercises the REAL adapter
 * (getLibraryOrders) with the REAL stored encrypted cookie,
 * decrypted via the boot's HumbleUser.getCredentials() — never a
 * standalone Node script (D-12: Node CLI is not Electron main).
 *
 * Returns a redacted HumbleValidationReport (D-15): endpoint paths, result
 * status, zod-parse pass/fail, a gamekey COUNT (never gamekey values), and a
 * steam_app_id PRESENCE boolean (never the id value itself). This function
 * never writes to disk — the human checkpoint (Plan 05 Task 2) transcribes
 * the (still-redacted) result into 10-VALIDATION.md.
 */
/**
 * What the validation run reads: the boot's one `HumbleUser` and its one action-id owner, by
 * slice. The dev run shares the owner with the library sync.
 */
export interface HumbleValidationDeps {
  user: Pick<HumbleUser, 'getCredentials'>
  actionIds: HumbleActionIdCache
}

export async function runHumbleValidation(
  deps: HumbleValidationDeps
): Promise<HumbleValidationReport> {
  const timestamp = new Date().toISOString()
  const cookie = await deps.user.getCredentials()

  if (!cookie) {
    return {
      transport: 'axios',
      timestamp,
      overall: 'fail',
      endpoints: [
        {
          path: 'filterUserLibrary',
          status: 'not_attempted',
          schemaValid: false
        }
      ],
      gamekeyCount: 0,
      steamAppIdPresent: false
    }
  }

  const endpoints: HumbleValidationEndpointResult[] = []

  // D-13 (reworked for Humble's 2026-11 site move): the library list is the
  // paginated `filterUserLibrary` server action; each item maps to an
  // order-detail-shaped object, so there is no separate per-order endpoint.
  const library = await getLibraryOrders(cookie, deps.actionIds)
  endpoints.push(toEndpointResult('filterUserLibrary', library))

  let gamekeyCount = 0
  let steamAppIdPresent = false
  if (library.status === 'ok') {
    gamekeyCount = library.data.length
    // The new API carries no steam_app_id field; presence stays an honest
    // boolean over whatever the mapped keys carry.
    steamAppIdPresent = library.data.some((order) =>
      (order.tpkd_dict?.all_tpks ?? []).some(
        (tpk) =>
          typeof tpk === 'object' &&
          tpk !== null &&
          'steam_app_id' in (tpk as Record<string, unknown>)
      )
    )
  }

  // The dev-only gate passes when the library list loads and parses; the
  // steam_app_id probe is advisory now (the new API does not carry it).
  const overall: 'pass' | 'fail' = library.status === 'ok' ? 'pass' : 'fail'

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
  result: AdapterResult<unknown>
): HumbleValidationEndpointResult {
  return {
    path,
    status: result.status,
    schemaValid: result.status === 'ok'
  }
}
