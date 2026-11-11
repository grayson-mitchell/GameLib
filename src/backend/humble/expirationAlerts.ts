import i18next from 'i18next'
import type { GlobalConfigSlice } from 'backend/config'
import type { Notifications } from 'backend/host/notifications'
import { isSteamDeckGameMode } from 'backend/constants/environment'
import type { Stores } from 'backend/services/types'
import { HumbleKey } from 'common/types/humble'

/**
 * HSTORE-03 / Phase 15 D-90/D-91/D-92. Fires a single per-sync digest OS
 * notification for keys whose `expiration` transitioned from null (or a
 * different date) to a new date, with transition-based dedup (D-92) so a
 * re-sync observing the SAME expiration never re-fires. A first-ever sync
 * (locked user decision 3 — no notification storm on fresh Humble connect)
 * seeds the `humbleNotifiedExpirationStore` baseline silently: every current
 * expiration is recorded but nothing is shown.
 */
/** The slices the digest needs: the D-93 settings gate and the OS notification. */
export interface ExpirationAlertDeps {
  config: Pick<GlobalConfigSlice, 'getSettings'>
  notifications: Pick<Notifications, 'show'>
}

/** The digest's deps plus the humble store family it dedups through (D-66.3-17). */
export type ExpirationAlertRunDeps = ExpirationAlertDeps & {
  stores: Pick<Stores, 'humble'>
}

export function detectAndNotifyExpirationTransitions(
  deps: ExpirationAlertRunDeps,
  keys: HumbleKey[],
  opts: { suppressNotifications: boolean }
): void {
  const newlyExpiring: HumbleKey[] = []

  for (const key of keys) {
    const composite = `${key.gamekey}:${key.machineName}`

    // WR-01 one-time legacy backfill: entries written before the
    // composite-key migration are keyed by machineName alone (no colon —
    // composite keys always contain one, so there is no collision risk).
    // If the composite entry is absent but a legacy entry exists, copy it
    // forward so the upgrade preserves "already notified" state and does
    // not fire a spurious notification storm. Legacy entries are left in
    // place (harmless, keeps the backfill idempotent).
    if (
      !deps.stores.humble.humbleNotifiedExpirationStore.has(composite) &&
      deps.stores.humble.humbleNotifiedExpirationStore.has(key.machineName)
    ) {
      deps.stores.humble.humbleNotifiedExpirationStore.set(
        composite,
        deps.stores.humble.humbleNotifiedExpirationStore.get(key.machineName)!
      )
    }

    const current = key.expiration
    const last =
      deps.stores.humble.humbleNotifiedExpirationStore.get(composite)
        ?.expiration ?? null

    if (current !== null && current !== last) {
      newlyExpiring.push(key)
      // Always advance the persisted state — even under suppression — so
      // dedup works correctly on every subsequent sync (locked decision 3).
      deps.stores.humble.humbleNotifiedExpirationStore.set(composite, {
        expiration: current
      })
    }
  }

  // First-sync baseline: the notified-state store above is now seeded for
  // every current expiration. Return WITHOUT firing anything (locked
  // decision 3 — a fresh Humble connect where many keys transition
  // null->date must not fire a notification storm).
  if (opts.suppressNotifications) {
    return
  }

  if (newlyExpiring.length === 0) {
    return
  }

  // D-93 settings gate.
  if (deps.config.getSettings().notifyHumbleExpirations !== true) {
    return
  }

  // Pitfall 4 guard — cloned verbatim from src/backend/dialog/dialog.ts's
  // notify(). (Notification.isSupported() was always true under the sidecar.)
  if (isSteamDeckGameMode) {
    return
  }

  const { title, body } = buildDigestCopy(newlyExpiring)
  // The old 'click' listener (raise the window, openScreen '/humble-keys/waiting') never ran:
  // the sidecar's Notification stand-in accepted and ignored 'click'. Notifications.show has no
  // click callback, so it is dropped rather than carried as dead code.
  deps.notifications.show({ title, body })
}

/**
 * D-90 digest copy. Reads ONLY the display-safe `title`/`expiration` fields
 * off `HumbleKey` (Pitfall 5) — the internal-only secret-surface fields
 * carried by the cache's internal key shape (see stores.ts) must
 * never be touched here.
 */
function buildDigestCopy(newlyExpiring: HumbleKey[]): {
  title: string
  body: string
} {
  const single = newlyExpiring[0]
  if (newlyExpiring.length === 1 && single) {
    const date = single.expiration
      ? new Date(single.expiration).toLocaleDateString()
      : ''
    return {
      title: i18next.t(
        'humble.notification.expiringTitleSingle',
        'Humble key expiring'
      ),
      body: i18next.t(
        'humble.notification.expiringBodySingle',
        "{{title}}'s Humble key now expires on {{date}}",
        { title: single.title, date }
      )
    }
  }

  return {
    title: i18next.t(
      'humble.notification.expiringTitlePlural',
      'Humble keys expiring'
    ),
    body: i18next.t(
      'humble.notification.expiringBodyPlural',
      '{{count}} Humble keys gained expiration dates',
      { count: newlyExpiring.length }
    )
  }
}
