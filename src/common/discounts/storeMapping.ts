import type { Runner } from '../types'

/**
 * CheapShark numeric `storeID` -> GameLib `Runner` mapping (Phase 20,
 * RESEARCH Open Question 1). CheapShark identifies stores by a small
 * numeric ID string in its `/games` and `/stores` responses; GameLib
 * identifies stores by the `Runner` union. This is the single source of
 * truth for that mapping — do not restring store names anywhere else.
 *
 * Amazon (`'4'`) is mapped for forward-compat but is `isActive:0` on
 * CheapShark today (RESEARCH Pitfall 2) — it will simply never match at
 * runtime. This does not affect the "Owned on Amazon" badge, which reads
 * GameLib's own `amazon.library`, not this mapping.
 */
export const CHEAPSHARK_STORE_TO_RUNNER: Record<string, Runner> = {
  '1': 'steam',
  '7': 'gog',
  '25': 'legendary',
  '4': 'nile'
}

export function resolveRunner(storeId: string): Runner | undefined {
  return CHEAPSHARK_STORE_TO_RUNNER[storeId]
}
