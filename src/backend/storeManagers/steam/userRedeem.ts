import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import type { RedeemKeyOutcome, RedeemKeyResult } from 'common/types/steam'
import type { SteamUserSliceDeps } from 'backend/services/types'

// ── REQ-26-02/04/05/06: Redeem a single Steam key ──────────────────────────

/**
 * Redeems a single Steam key on the live authenticated CM session. Mirrors
 * submitSteamGuardCode's shape: guard clause first, plain JSON result,
 * never throws across the IPC boundary.
 *
 * `client.redeemKey()` resolves ONLY on EPurchaseResult.OK; every other
 * outcome (already-owned, invalid, rate-limited) REJECTS with an Error
 * carrying `purchaseResultDetails` and `packageList` as extra properties.
 * RustCmClient.redeemKey keeps that steam-user call shape: it turns a
 * non-OK `steamcm_redeem_key` reply into that rejection.
 *
 * `store` is REQ-26-06's hidden, store-aware-ready parameter (D-05) —
 * callers default it to 'steam'; only 'steam' is wired today.
 */
export async function redeemKey(
  deps: SteamUserSliceDeps<'acquireAuthenticated'>,
  store: 'steam',
  key: string
): Promise<RedeemKeyResult> {
  const attempt = await redeemOnce(deps, store, key)
  // A Set is the pre-redeem package snapshot of an ambiguous attempt. The
  // lease is released by now; the redeem is NEVER resent, only verified.
  return attempt instanceof Set
    ? verifyAmbiguousRedeem(deps, store, attempt)
    : attempt
}

async function redeemOnce(
  deps: SteamUserSliceDeps<'acquireAuthenticated'>,
  store: 'steam',
  key: string
): Promise<RedeemKeyResult | Set<number>> {
  const lease = await deps.steamUser.acquireAuthenticated({
    reason: 'redeem'
  })
  if (!lease.ok) {
    logWarning(
      'Steam redeemKey: not connected — skipping redeemKey call',
      LogPrefix.Steam
    )
    return {
      store,
      outcome: 'error',
      message: 'not-connected'
    }
  }
  const client = lease.client
  // Snapshot owned package ids so an `ambiguous` redeem (the socket died after
  // the request was sent) is verified by a licence diff — never by resending.
  // null when this lease's licence list is unknown: such a redeem cannot be verified (C1/WR-05).
  const before = client.licenses ? packageIds(client.licenses) : null

  try {
    const { purchaseResultDetails, packageList } = await client.redeemKey(key)
    // purchaseResultDetails here should already be EPurchaseResult.OK (0) —
    // the promise would have rejected otherwise — but classify defensively
    // anyway rather than assuming.
    return classifyPurchaseResult(store, purchaseResultDetails, packageList)
  } catch (err) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = err as any
    if (e?.steamcmKind === 'ambiguous') {
      if (!before) {
        logWarning(
          `Steam redeemKey: ambiguous result and no pre-redeem licence list to verify against (key not resent): store=${store} outcome=error`,
          LogPrefix.Steam
        )
        return { store, outcome: 'error', message: 'redeem-failed' }
      }
      logWarning(
        `Steam redeemKey: ambiguous result, verifying via licence list (key not resent): store=${store}`,
        LogPrefix.Steam
      )
      return before
    }
    // WR-01: Only a rejection carrying a NUMERIC EPurchaseResult is a genuine
    // Steam purchase verdict. A transport/timeout/unexpected failure (e.g. a
    // rustInvoke timeout, or a CM drop mid-call: the Rust session never
    // resends a redeem after a rebuild) carries no purchaseResultDetails —
    // classifying THAT as Unknown -> 'invalid' wrongly tells the user a valid
    // key "doesn't look right". Map it to the generic 'error' outcome
    // (connectivity copy).
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

function packageIds(licenses: { package_id?: number }[]) {
  return new Set(
    licenses
      .map((l) => l.package_id)
      .filter((id): id is number => typeof id === 'number')
  )
}

/**
 * The redeem was sent but the socket died before a reply (never resent, D-02).
 * On a fresh lease, a package absent from the pre-redeem snapshot means it took
 * effect: report success naming those packages. Otherwise today's failure.
 */
async function verifyAmbiguousRedeem(
  deps: SteamUserSliceDeps<'acquireAuthenticated'>,
  store: 'steam',
  before: Set<number>
): Promise<RedeemKeyResult> {
  const failure: RedeemKeyResult = {
    store,
    outcome: 'error',
    message: 'redeem-failed'
  }
  try {
    const lease = await deps.steamUser.acquireAuthenticated({
      reason: 'redeem'
    })
    if (!lease.ok) return failure
    try {
      // An unknown licence list proves nothing either way.
      const after = lease.client.licenses
      if (!after) return failure
      const added = [...packageIds(after)].filter((id) => !before.has(id))
      if (added.length === 0) return failure
      logInfo(
        `Steam redeemKey: store=${store} outcome=success (verified via licence list, ${added.length} new package(s))`,
        LogPrefix.Steam
      )
      return {
        store,
        outcome: 'success',
        packageList: Object.fromEntries(
          added.map((id) => [String(id), ''])
        ) as Record<string, string>
      }
    } finally {
      lease.release()
    }
  } catch {
    return failure
  }
}

/**
 * The 8-value `EPurchaseResult` enum (the former steam-user resource, kept as a plain const).
 */
const EPurchaseResult = {
  Unknown: -1,
  OK: 0,
  AlreadyOwned: 9,
  RegionLockedKey: 13,
  InvalidKey: 14,
  DuplicatedKey: 15,
  BaseGameRequired: 24,
  OnCooldown: 53
} as const

/**
 * Classifies a raw EPurchaseResult value into exactly one of the 4 SPEC
 * REQ5 outcome buckets. References the local `EPurchaseResult`
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
  details: number,
  packageList: Record<string, string>
): RedeemKeyResult {
  let outcome: RedeemKeyOutcome

  switch (details) {
    case EPurchaseResult.OK:
      outcome = 'success'
      break
    case EPurchaseResult.AlreadyOwned:
      outcome = 'already-owned'
      break
    case EPurchaseResult.OnCooldown:
      outcome = 'rate-limited'
      break
    case EPurchaseResult.InvalidKey:
    case EPurchaseResult.DuplicatedKey:
    case EPurchaseResult.RegionLockedKey:
    case EPurchaseResult.BaseGameRequired:
    case EPurchaseResult.Unknown:
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
