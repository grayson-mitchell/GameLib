import type { Runner } from '../types'

/**
 * IsThereAnyDeal numeric shop id (as a string) -> GameLib `Runner` mapping
 * (Phase 47). ITAD identifies shops by a numeric id in its deals responses;
 * GameLib identifies stores by the `Runner` union. This is the single source
 * of truth for that mapping — do not restring store names anywhere else.
 *
 * The ids are copied from `src/backend/storeSearch/itadCoverage.ts`
 * (ITAD_SHOP_ID_STEAM / _GOG / _EPIC, measured in 47-ITAD-COVERAGE.json) as
 * literals: src/common only imports backend/ as `import type`, so the
 * renderer bundle cannot pull a backend module. storeMapping.test.ts asserts
 * each literal equals the matching constant so they cannot drift.
 *
 * Amazon has no entry: ITAD does not track Amazon. The "Owned on Amazon"
 * badge reads GameLib's own `amazon.library` and is unaffected.
 */
export const ITAD_SHOP_TO_RUNNER: Record<string, Runner> = {
  '61': 'steam',
  '35': 'gog',
  '16': 'legendary'
}

export function resolveRunner(storeId: string): Runner | undefined {
  return ITAD_SHOP_TO_RUNNER[storeId]
}
