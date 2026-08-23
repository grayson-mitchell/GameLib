import { addHandler } from 'backend/ipc'
import { getGogDiscounts } from './fetchDiscounts'

/**
 * Thin Electron `addHandler` wrapper. All fetch/business logic lives in
 * `./fetchDiscounts` so both this file and the sidecar's
 * `enrichmentFlowRegistration.ts` can import the same underlying function
 * (Phase 34.6 Plan 09, REQ-34.6-08).
 */
addHandler(
  'getGogDiscounts',
  async (_event, locale, hideOwned = false, wishlistOnly = false) =>
    getGogDiscounts(locale, hideOwned, wishlistOnly)
)
