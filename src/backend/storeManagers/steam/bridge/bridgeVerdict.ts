/**
 * Phase 51 Plan 03 (D-51-07/D-51-10): the sole reader/writer family for
 * `SteamMetadataCacheEntry.bridge` (`SteamBridgeVerdict`, electronStores.ts).
 * Every writer here follows the GAP-B / `markForcedWindowsViaBottle` idiom
 * (games.ts): read-modify-write via `{ ...existing, bridge: { ...existing?.bridge,
 * <change> } }`, NEVER a bare `steamMetadataStore.set` with a fresh object
 * literal — `.set()` REPLACES the whole entry (T-18-02-04), so a bare write
 * would wipe the game's art/extra/platformsCaptured/mac_arch/
 * forcedWindowsViaBottle in one call.
 *
 * `readBridgeVerdict` is the opposite posture from `allowlist.ts`'s
 * fail-loud bundled-asset parse: this value is UNTRUSTED disk content
 * (T-51-09), not a reviewed bundled asset, so a malformed stored value
 * returns `undefined` (treated as "never scanned", which routes to
 * `pending-scan` i.e. re-scan) and logs — it never throws.
 */

import { z } from 'zod'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import {
  steamMetadataStore,
  type SteamBridgeScanVerdict,
  type SteamBridgeVerdict,
  type SteamMetadataCacheEntry
} from '../electronStores'

// Pattern repeated verbatim across bottle.ts:826, clientSetup.ts:40,
// allowlist.ts, importScan.ts -- reuse the SAME regex value/name, do not
// redefine a divergent one.
const NUMERIC_APP_ID = /^\d+$/

const bridgeScanVerdictSchema = z.object({
  status: z.enum(['clean', 'miss']),
  arch: z.enum(['x86', 'x64']),
  missingSymbols: z.array(z.string()),
  interfaceVersions: z.record(z.string(), z.string()),
  stubbedInterfaces: z.array(z.string()),
  shimExportSetVersion: z.string(),
  scannedAt: z.string(),
  // Phase 52 Pitfall 2: the non-strict object strips unknown keys on read, so
  // without this a persisted SteamStub detection would be silently forgotten.
  drmWrapper: z.enum(['steamstub']).optional()
})

const bridgeVerdictSchema = z.object({
  scan: bridgeScanVerdictSchema.optional(),
  steamApi: z.enum(['none', 'x86', 'x64', 'both', 'unknown']).optional(),
  userRoute: z.enum(['bottle', 'bridge']).optional(),
  noticeAcknowledgedFor: z.string().optional(),
  limitedNoticeShown: z.boolean().optional(),
  identityFallback: z.boolean().optional(),
  // Quick 261024-br4: without this key the non-strict object strips `drm`
  // on read and a detected CEG would be silently forgotten.
  drm: z.enum(['ceg']).optional()
})

/**
 * D-51-07: safe-parses the stored `bridge` field, never throws. Returns
 * `undefined` for a non-numeric appId, a missing entry, a missing `bridge`
 * field, or a `bridge` value that fails shape validation (logged as a
 * warning in the last case — a tampered/corrupted store entry is worth
 * knowing about, but must never crash the routing decision that depends on
 * it: `undefined` here is "never scanned", the safe default direction).
 */
export function readBridgeVerdict(
  appId: string
): SteamBridgeVerdict | undefined {
  if (!NUMERIC_APP_ID.test(appId)) {
    return undefined
  }

  const existing = steamMetadataStore.get(appId)
  if (!existing?.bridge) {
    return undefined
  }

  const result = bridgeVerdictSchema.safeParse(existing.bridge)
  if (!result.success) {
    logWarning(
      `bridgeVerdict: appId ${appId} -- stored bridge verdict failed shape validation, treating as never-scanned (${result.error.message})`,
      LogPrefix.Steam
    )
    return undefined
  }

  return result.data
}

/**
 * 34.13 review A-09/A-14 precedent (games.ts's `markForcedWindowsViaBottle`):
 * every writer below needs a base entry to spread. Unlike that function,
 * this family does NOT refuse to fabricate one — a bridge verdict can
 * legitimately be the FIRST thing ever written for an appId (e.g. the
 * pre-install D-51-06 prescreen runs before any appdetails fetch). Mirrors
 * `library.ts:884`'s minimal-entry shape exactly, and logs once so a
 * fabricated entry is visible in the log, not just on disk.
 */
function getOrCreateEntryForWrite(appId: string): SteamMetadataCacheEntry {
  const existing = steamMetadataStore.get(appId)
  if (existing) {
    return existing
  }
  logInfo(
    `bridgeVerdict: appId ${appId} -- no metadata entry exists yet; creating a minimal one to record a bridge verdict (library.ts:884 precedent)`,
    LogPrefix.Steam
  )
  return { art_cover: '', art_square: '', extra: { reqs: [] } }
}

function rejectNonNumeric(fnName: string, appId: string): boolean {
  if (NUMERIC_APP_ID.test(appId)) {
    return false
  }
  logWarning(
    `bridgeVerdict: ${fnName} rejected non-numeric appId "${appId}" -- not touching the store (T-51-10 shape)`,
    LogPrefix.Steam
  )
  return true
}

/**
 * D-51-07: persists the result of a completed import scan. A second call
 * for the same appId REPLACES `bridge.scan` but keeps every other
 * `bridge.*` field (e.g. `userRoute`, `identityFallback`) untouched — the
 * spread is `{ ...existing?.bridge, scan }`, never a fresh `{ scan }`
 * literal.
 */
export function writeBridgeScanVerdict(
  appId: string,
  scan: SteamBridgeScanVerdict
): void {
  if (rejectNonNumeric('writeBridgeScanVerdict', appId)) return

  const existing = getOrCreateEntryForWrite(appId)
  steamMetadataStore.set(appId, {
    ...existing,
    bridge: {
      ...existing.bridge,
      scan
    }
  })
}

/**
 * D-51-07: clears ONLY `bridge.scan` (e.g. after
 * `shimCoverage.ts`'s `isScanVerdictNowCovered` confirms a later shim
 * release covers a stale miss) — every other `bridge.*` field, including
 * the user's own `userRoute` override, survives untouched. A no-op (never
 * fabricates an entry) when there is nothing to clear, mirroring
 * `clearForcedWindowsViaBottle`'s early-return precedent (games.ts).
 */
export function clearBridgeScanVerdict(appId: string): void {
  if (rejectNonNumeric('clearBridgeScanVerdict', appId)) return

  const existing = steamMetadataStore.get(appId)
  if (!existing?.bridge?.scan) return

  const { scan: _scan, ...restBridge } = existing.bridge
  steamMetadataStore.set(appId, {
    ...existing,
    bridge: restBridge
  })
}

/**
 * D-51-06: persists the pre-install depot-manifest-file-list prescreen
 * signal, independent of (and run before) any post-install `scan`.
 */
export function setBridgeSteamApiPrescreen(
  appId: string,
  steamApi: NonNullable<SteamBridgeVerdict['steamApi']>
): void {
  if (rejectNonNumeric('setBridgeSteamApiPrescreen', appId)) return

  const existing = getOrCreateEntryForWrite(appId)
  steamMetadataStore.set(appId, {
    ...existing,
    bridge: {
      ...existing.bridge,
      steamApi
    }
  })
}

/**
 * D-51-10/11: persists (or removes) the user's own bridge/bottle override.
 * Passing `undefined` REMOVES the `userRoute` key entirely (via object
 * destructuring, not a stored `undefined` value) -- distinct from never
 * having set it only in that a removal is an explicit user action, but the
 * resulting read is identical: `readBridgeVerdict(appId)?.userRoute` is
 * `undefined` either way.
 */
export function setBridgeUserRoute(
  appId: string,
  userRoute: SteamBridgeVerdict['userRoute'] | undefined
): void {
  if (rejectNonNumeric('setBridgeUserRoute', appId)) return

  const existing = getOrCreateEntryForWrite(appId)
  const { userRoute: _existingUserRoute, ...restBridge } = existing.bridge ?? {}
  steamMetadataStore.set(appId, {
    ...existing,
    bridge: userRoute === undefined ? restBridge : { ...restBridge, userRoute }
  })
}

/**
 * Quick 261024-br4: persists (or removes) the post-install Steam DRM
 * finding (`SteamBridgeVerdict.drm`). Same shape as `setBridgeUserRoute`:
 * passing `undefined` REMOVES the key rather than storing an undefined
 * value, and is a no-op (no store churn, no fabricated entry) when there is
 * no stored `drm` to remove.
 */
export function writeBridgeDrmVerdict(
  appId: string,
  drm: SteamBridgeVerdict['drm'] | undefined
): void {
  if (rejectNonNumeric('writeBridgeDrmVerdict', appId)) return

  if (drm === undefined) {
    const stored = steamMetadataStore.get(appId)
    if (stored?.bridge?.drm === undefined) return
  }

  const existing = getOrCreateEntryForWrite(appId)
  const { drm: _existingDrm, ...restBridge } = existing.bridge ?? {}
  steamMetadataStore.set(appId, {
    ...existing,
    bridge: drm === undefined ? restBridge : { ...restBridge, drm }
  })
}

/**
 * D-51-08: records which `SteamBridgeRouteReason` the user acknowledged
 * when they last dismissed/accepted a route-related dialog.
 */
export function setBridgeNoticeAcknowledged(
  appId: string,
  reason: string
): void {
  if (rejectNonNumeric('setBridgeNoticeAcknowledged', appId)) return

  const existing = getOrCreateEntryForWrite(appId)
  steamMetadataStore.set(appId, {
    ...existing,
    bridge: {
      ...existing.bridge,
      noticeAcknowledgedFor: reason
    }
  })
}

/**
 * D-51-02: marks the one-time "limited functionality" notice as shown for
 * this game. Idempotent (no needless churn) once already true -- mirrors
 * the identity-guard discipline shimGenerate.ts's `placeShimForGame`
 * already uses for its own idempotent no-op case.
 */
export function markBridgeLimitedNoticeShown(appId: string): void {
  if (rejectNonNumeric('markBridgeLimitedNoticeShown', appId)) return

  const existing = getOrCreateEntryForWrite(appId)
  if (existing.bridge?.limitedNoticeShown === true) return

  steamMetadataStore.set(appId, {
    ...existing,
    bridge: {
      ...existing.bridge,
      limitedNoticeShown: true
    }
  })
}

/**
 * D-51-04: records whether the bridge helper fell back to AppID
 * 480 identity-only for this game.
 */
export function setBridgeIdentityFallback(
  appId: string,
  identityFallback: boolean
): void {
  if (rejectNonNumeric('setBridgeIdentityFallback', appId)) return

  const existing = getOrCreateEntryForWrite(appId)
  steamMetadataStore.set(appId, {
    ...existing,
    bridge: {
      ...existing.bridge,
      identityFallback
    }
  })
}
