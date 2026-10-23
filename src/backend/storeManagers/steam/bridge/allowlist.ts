/**
 * Phase 24 Plan 03 (R4) -- the bridge-eligibility allowlist (D-01/D-02): a
 * bundled JSON file, curated by hand, keyed by AppID, deciding which
 * Windows-only Steam titles route through the out-of-process steam_api
 * bridge instead of the Phase 17/22 bottled-Steam fallback.
 *
 * Phase 51 Plan 03 (ROADMAP sub-decision 3 / D-51-08) bumped the schema to
 * `version: 2`: the static list stops being the sole routing input (it is
 * demoted to `seed`, one input of 51-07's composed `SteamBridgeRouteVerdict`
 * -- seed ∪ persisted verdict ∖ known-bad ∖ forced-bottle) and gained a
 * second array, `knownBad`, of titles that get a dialog up front naming WHY
 * the bridge is not expected to work for them (D-51-08's closed reason
 * taxonomy, `SteamBridgeKnownBadReason`). Amended 2026-10-23: only
 * 'drm-wrapped' entries skip the bridge for bottled Steam; the other
 * reasons stay on the bridge behind a one-time informational notice. `version: 1` is no longer accepted at all --
 * there is no discriminated-union fallback; a stale-schema bundled asset
 * throws at load exactly like any other malformed one.
 *
 * Follows the EXACT `crossoverIndexSchema` precedent
 * (`src/backend/crossover_index/schema.ts`): a `version: z.literal(2)` guard
 * + bounded array schemas, parsed once at module load. Unlike the
 * 1000+-entry CrossOver index, `seed` is small and developer-curated
 * (`.min(1)`, not `.min(1000)`); `knownBad` holds only
 * evidence-backed entries (XCOM 200510, Hoard 63000, ELEX 411300 so far)
 * and may legitimately be empty, so it has no `.min()` floor. A
 * malformed entry (missing `appId`, wrong `version`, a `knownBad.reason`
 * outside the closed taxonomy, etc.) throws AT LOAD, fail-loud, rather than
 * silently dropping (T-24-05 mitigation). This is a deliberate posture: the
 * allowlist is a trust boundary that drives a routing decision, and a
 * curated/reviewed list should never partially degrade -- either the whole
 * bundled asset is well-formed, or GameLib fails to start with a clear
 * error.
 *
 * `has(appId)` is the seed-membership lookup (used by 24-08's
 * `isBridgeEligible()` until 51-09 replaces its sole caller with the
 * composed verdict). `knownBadReason(appId)` is the new D-51-08 lookup. Both
 * numeric-guard `appId` with the SAME `NUMERIC_APP_ID` regex used
 * project-wide (`bottle.ts:826`, `clientSetup.ts:40`) BEFORE lookup
 * (T-24-07 mitigation) -- a non-numeric appId returns false/null, neither
 * ever throws. Only the bundled JSON itself is a fail-loud boundary; a bad
 * caller-supplied appId at the IPC-adjacent lookup boundary must never crash
 * the routing decision.
 */

import { z } from 'zod'
import type { SteamBridgeKnownBadReason } from 'common/types/steam'
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

// D-51-08's closed reason taxonomy, as a zod enum. Kept as a `const` tuple
// (not inlined into `z.enum([...])`) so the exhaustiveness check below can
// reference it.
const KNOWN_BAD_REASONS = [
  'drm-wrapped',
  'win64-only',
  'p2p-required',
  'does-not-run'
] as const satisfies readonly SteamBridgeKnownBadReason[]

const knownBadReasonSchema = z.enum(KNOWN_BAD_REASONS)

// Compile-time assertion that the zod enum's inferred type equals
// SteamBridgeKnownBadReason (common/types/steam.ts), in BOTH directions: the
// `satisfies` clause on KNOWN_BAD_REASONS above already catches an entry
// that is not a valid SteamBridgeKnownBadReason; this Record literal catches
// the other direction -- if SteamBridgeKnownBadReason ever gains or loses a
// member, this object fails to typecheck (every key required, no extra key
// permitted) because it must assign exactly one value per member. Left
// unreferenced on purpose: the `_` prefix satisfies no-unused-vars, and a
// column-0 `void` here trips sidecarRejectionGuard's floating-promise check.
const _knownBadReasonExhaustiveness: Record<SteamBridgeKnownBadReason, true> = {
  'drm-wrapped': true,
  'win64-only': true,
  'p2p-required': true,
  'does-not-run': true
}

const allowlistEntrySchema = z.object({
  appId: z.string().regex(NUMERIC_APP_ID),
  title: z.string().min(1),
  note: z.string().optional()
})

// playVerified: a live gate observed the title reach a playable state through
// the bridge. Seed membership alone only means "routes to the bridge without a
// notice" -- it is NOT a claim that the title runs. Seed entries only.
const playVerifiedSchema = z.object({
  evidence: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
})

const seedEntrySchema = allowlistEntrySchema.extend({
  playVerified: playVerifiedSchema.optional()
})

const knownBadEntrySchema = allowlistEntrySchema
  .extend({ reason: knownBadReasonSchema })
  .strict()

export const bridgeAllowlistSchema = z.object({
  version: z.literal(2),
  seed: z.array(seedEntrySchema).min(1),
  // No `.min()` floor -- D-51-08: the known-bad list holds only
  // evidence-backed entries; an empty array is a legitimate, intended state.
  knownBad: z.array(knownBadEntrySchema)
})

// Not exported: verified to have no importer anywhere -- not in any tracked .ts/.tsx
// file (`pnpm find-deadcode` / ts-prune flagged the previously-exported form as an
// over-broad `export` keyword).
type BridgeAllowlist = z.infer<typeof bridgeAllowlistSchema>

function loadBridgeAllowlist(): BridgeAllowlist {
  // `.parse()` -- deliberately NOT the non-throwing parse variant -- a
  // malformed bundled allowlist must throw at module load (fail-loud, D-02's
  // curated/reviewed posture), not be silently swallowed into an
  // empty/partial list.
  return bridgeAllowlistSchema.parse(bridgeAllowlistJson)
}

const bridgeAllowlistData = loadBridgeAllowlist()

const seedAppIdSet = new Set(bridgeAllowlistData.seed.map((game) => game.appId))
const knownBadReasonByAppId = new Map(
  bridgeAllowlistData.knownBad.map((entry) => [entry.appId, entry.reason])
)

export const bridgeAllowlist = {
  /**
   * Returns true iff `appId` is present in the bundled, zod-validated
   * `seed` list (D-51-08: seed membership only -- NOT the composed
   * bridge-vs-bottle verdict; 51-07 composes that from this plus the
   * persisted scan verdict and the known-bad list). Numeric-guarded
   * (T-24-07) -- a non-numeric appId returns false, never throws, so a
   * malformed IPC-adjacent appId can never crash the routing decision.
   */
  has(appId: string): boolean {
    if (!NUMERIC_APP_ID.test(appId)) {
      return false
    }
    return seedAppIdSet.has(appId)
  },

  /**
   * D-51-08: returns the closed-taxonomy reason `appId` is on the bundled
   * known-bad list, or `null` when it is absent (including every
   * non-numeric or unrecognized appId -- same numeric-guard-before-lookup
   * shape as `has()` above, never throws).
   */
  knownBadReason(appId: string): SteamBridgeKnownBadReason | null {
    if (!NUMERIC_APP_ID.test(appId)) {
      return null
    }
    return knownBadReasonByAppId.get(appId) ?? null
  }
}
