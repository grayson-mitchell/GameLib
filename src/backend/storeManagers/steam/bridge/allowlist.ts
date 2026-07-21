/**
 * Phase 24 Plan 03 (R4) -- the bridge-eligibility allowlist (D-01/D-02): a
 * bundled JSON file, curated by hand, keyed by AppID, deciding which
 * Windows-only Steam titles route through the out-of-process steam_api
 * bridge instead of the Phase 17/22 bottled-Steam fallback.
 *
 * Follows the EXACT `crossoverIndexSchema` precedent
 * (`src/backend/crossover_index/schema.ts`): a `version: z.literal(1)` guard
 * + a bounded array schema, parsed once at module load. Unlike the
 * 1000+-entry CrossOver index, this list is small and developer-curated
 * (`.min(1)`, not `.min(1000)`) -- a malformed entry (missing `appId`, wrong
 * `version`, etc.) throws AT LOAD, fail-loud, rather than silently dropping
 * (T-24-05 mitigation). This is a deliberate posture: the allowlist is a
 * trust boundary that drives a routing decision, and a curated/reviewed list
 * should never partially degrade -- either the whole bundled asset is
 * well-formed, or GameLib fails to start with a clear error.
 *
 * `has(appId)` is the consumer-facing lookup (used by 24-08's
 * `isBridgeEligible()`). It numeric-guards `appId` with the SAME
 * `NUMERIC_APP_ID` regex used project-wide (`bottle.ts:826`,
 * `clientSetup.ts:40`) BEFORE lookup (T-24-07 mitigation) -- a non-numeric
 * appId returns false, it never throws. Only the bundled JSON itself is a
 * fail-loud boundary; a bad caller-supplied appId at the IPC-adjacent lookup
 * boundary must never crash the routing decision.
 */

import { z } from 'zod'
// Static JSON import (tsconfig `resolveJsonModule: true`) so the curated
// allowlist is INLINED into the main-process bundle by rollup. The prior
// `readFileSync(join(__dirname, 'bridge-allowlist.json'))` broke at runtime:
// electron-vite emits the main process as build/main/chunks/index-*.js and
// does NOT copy the sibling .json next to the compiled chunk, so __dirname
// resolution threw ENOENT and crashed startup. A static import guarantees the
// data is present in the bundle while preserving the fail-loud `.parse()`
// posture below (a malformed asset still throws at module load).
import bridgeAllowlistJson from './bridge-allowlist.json'

// Pattern repeated verbatim across bottle.ts:826, clientSetup.ts:40 -- reuse
// the SAME regex value/name, do not redefine a divergent one.
const NUMERIC_APP_ID = /^\d+$/

export const bridgeAllowlistSchema = z.object({
  version: z.literal(1),
  games: z
    .array(
      z.object({
        appId: z.string().regex(NUMERIC_APP_ID),
        title: z.string().min(1),
        note: z.string().optional()
      })
    )
    .min(1)
})

export type BridgeAllowlist = z.infer<typeof bridgeAllowlistSchema>

function loadBridgeAllowlist(): BridgeAllowlist {
  // `.parse()` (not `.safeParse()`) is deliberate -- a malformed bundled
  // allowlist must throw at module load (fail-loud, D-02's curated/reviewed
  // posture), not be silently swallowed into an empty/partial list.
  return bridgeAllowlistSchema.parse(bridgeAllowlistJson)
}

const bridgeAllowlistData = loadBridgeAllowlist()

const appIdSet = new Set(bridgeAllowlistData.games.map((game) => game.appId))

export const bridgeAllowlist = {
  /**
   * Returns true iff `appId` is present in the bundled, zod-validated
   * bridge-eligibility allowlist. Numeric-guarded (T-24-07) -- a
   * non-numeric appId returns false, never throws, so a malformed
   * IPC-adjacent appId can never crash the bridge-vs-fallback routing
   * decision.
   */
  has(appId: string): boolean {
    if (!NUMERIC_APP_ID.test(appId)) {
      return false
    }
    return appIdSet.has(appId)
  }
}
