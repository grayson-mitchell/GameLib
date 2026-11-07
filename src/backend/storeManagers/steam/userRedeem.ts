import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import SteamUserLib from 'steam-user'
import type { RedeemKeyOutcome, RedeemKeyResult } from 'common/types/steam'
import { SteamUser } from './user'

// ── REQ-26-02/04/05/06: Redeem a single Steam key ──────────────────────────

/**
 * Redeems a single Steam key on the live authenticated CM session. Mirrors
 * submitSteamGuardCode's shape: guard clause first, plain JSON result,
 * never throws across the IPC boundary.
 *
 * `client.redeemKey()`'s TypeScript signature is misleading — it resolves
 * ONLY on EPurchaseResult.OK; every other outcome (already-owned, invalid,
 * rate-limited) REJECTS with an Error carrying `purchaseResultDetails` and
 * `packageList` as extra properties (verified against
 * node_modules/steam-user/components/apps.js:887, not the .d.ts).
 *
 * `store` is REQ-26-06's hidden, store-aware-ready parameter (D-05) —
 * callers default it to 'steam'; only 'steam' is wired today.
 */
export async function redeemKey(
  store: 'steam',
  key: string
): Promise<RedeemKeyResult> {
  const lease = await SteamUser.acquireAuthenticated({
    reason: 'redeem',
    guidedAction: 'redeem'
  })
  if (!lease.ok) {
    logWarning(
      'Steam redeemKey: not connected — skipping redeemKey call',
      LogPrefix.Steam
    )
    return {
      store,
      outcome: 'error',
      message:
        lease.reason === 'go-offline-required'
          ? 'go-offline-required'
          : 'not-connected'
    }
  }
  const client = lease.client

  try {
    const { purchaseResultDetails, packageList } = await client.redeemKey(key)
    // purchaseResultDetails here should already be EPurchaseResult.OK (0) —
    // the promise would have rejected otherwise — but classify defensively
    // anyway rather than assuming.
    return classifyPurchaseResult(store, purchaseResultDetails, packageList)
  } catch (err) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = err as any
    // WR-01: Only a rejection carrying a NUMERIC EPurchaseResult is a genuine
    // Steam purchase verdict. A transport/timeout/unexpected failure (e.g. the
    // 90s internal timeout in steam-user's redeemKey, or a mid-call CM
    // disconnect) carries no purchaseResultDetails — classifying THAT as
    // Unknown -> 'invalid' wrongly tells the user a valid key "doesn't look
    // right". Map it to the generic 'error' outcome (connectivity copy).
    if (typeof e?.purchaseResultDetails !== 'number') {
      // WR-02: status-only diagnostic so genuine unexpected failures are
      // traceable. NEVER log the raw key (T-26-01) — only store/outcome and
      // the error shape (message/name), which never contain the key.
      logWarning(
        [
          `Steam redeemKey failed without a purchase result: store=${store} outcome=error name=${
            e?.name ?? 'unknown'
          } message=${e?.message ?? 'none'}`
        ],
        LogPrefix.Steam
      )
      return { store, outcome: 'error', message: 'redeem-failed' }
    }
    // WR-02: log the rejected purchase-result status before classifying.
    // classifyPurchaseResult's own log cannot distinguish a resolved vs a
    // rejected redeemKey; this line records that the promise rejected.
    logWarning(
      [
        `Steam redeemKey rejected with purchase result: store=${store} purchaseResultDetails=${e.purchaseResultDetails}`
      ],
      LogPrefix.Steam
    )
    return classifyPurchaseResult(
      store,
      e.purchaseResultDetails,
      e.packageList ?? {}
    )
  } finally {
    lease.release()
  }
}

/**
 * Classifies a raw EPurchaseResult value into exactly one of the 4 SPEC
 * REQ5 outcome buckets. References the namespaced `SteamUserLib.EPurchaseResult`
 * enum (8 values) — NEVER the differently-numbered 84-value
 * `EPurchaseResultDetail` enum, which collides on the value 53 but means
 * something different there.
 *
 * Logging is status-only (store/outcome/purchaseResultDetails) — mirrors
 * humble/library.ts's doRevealKey discipline. The raw key value is never
 * passed to this method and must never be logged anywhere in this path.
 */
function classifyPurchaseResult(
  store: 'steam',
  details: SteamUserLib.EPurchaseResult,
  packageList: Record<string, string>
): RedeemKeyResult {
  let outcome: RedeemKeyOutcome

  switch (details) {
    case SteamUserLib.EPurchaseResult.OK:
      outcome = 'success'
      break
    case SteamUserLib.EPurchaseResult.AlreadyOwned:
      outcome = 'already-owned'
      break
    case SteamUserLib.EPurchaseResult.OnCooldown:
      outcome = 'rate-limited'
      break
    case SteamUserLib.EPurchaseResult.InvalidKey:
    case SteamUserLib.EPurchaseResult.DuplicatedKey:
    case SteamUserLib.EPurchaseResult.RegionLockedKey:
    case SteamUserLib.EPurchaseResult.BaseGameRequired:
    case SteamUserLib.EPurchaseResult.Unknown:
    default:
      outcome = 'invalid'
      break
  }

  logInfo(
    `Steam redeemKey: store=${store} outcome=${outcome} purchaseResultDetails=${details}`,
    LogPrefix.Steam
  )

  return { store, outcome, packageList }
}
