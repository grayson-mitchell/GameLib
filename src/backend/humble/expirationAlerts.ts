import { Notification } from 'backend/platform'
import i18next from 'i18next'
import { GlobalConfig } from 'backend/config'
import { isSteamDeckGameMode } from 'backend/constants/environment'
import { getMainWindow } from '../main_window'
import { sendFrontendMessage } from '../ipc'
import { humbleNotifiedExpirationStore } from './electronStores'
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
export function detectAndNotifyExpirationTransitions(
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
      !humbleNotifiedExpirationStore.has(composite) &&
      humbleNotifiedExpirationStore.has(key.machineName)
    ) {
      humbleNotifiedExpirationStore.set(
        composite,
        humbleNotifiedExpirationStore.get(key.machineName)!
      )
    }

    const current = key.expiration
    const last =
      humbleNotifiedExpirationStore.get(composite)?.expiration ?? null

    if (current !== null && current !== last) {
      newlyExpiring.push(key)
      // Always advance the persisted state — even under suppression — so
      // dedup works correctly on every subsequent sync (locked decision 3).
      humbleNotifiedExpirationStore.set(composite, {
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
  if (GlobalConfig.get().getSettings().notifyHumbleExpirations !== true) {
    return
  }

  // Pitfall 4 guard — cloned verbatim from src/backend/dialog/dialog.ts's
  // notify().
  if (!Notification.isSupported() || isSteamDeckGameMode) {
    return
  }

  const { title, body } = buildDigestCopy(newlyExpiring)
  const notification = new Notification({ title, body })
  notification.on('click', () => {
    getMainWindow()?.show()
    sendFrontendMessage('openScreen', '/humble-keys/waiting')
  })
  notification.show()
}

/**
 * D-90 digest copy. Reads ONLY the display-safe `title`/`expiration` fields
 * off `HumbleKey` (Pitfall 5) — the internal-only secret-surface fields
 * carried by the cache's internal key shape (see electronStores.ts) must
 * never be touched here.
 */
function buildDigestCopy(newlyExpiring: HumbleKey[]): {
  title: string
  body: string
} {
  if (newlyExpiring.length === 1) {
    const key = newlyExpiring[0]
    const date = key.expiration
      ? new Date(key.expiration).toLocaleDateString()
      : ''
    return {
      title: i18next.t(
        'humble.notification.expiringTitleSingle',
        'Humble key expiring'
      ),
      body: i18next.t(
        'humble.notification.expiringBodySingle',
        "{{title}}'s Humble key now expires on {{date}}",
        { title: key.title, date }
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
