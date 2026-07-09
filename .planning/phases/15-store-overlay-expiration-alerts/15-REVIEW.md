---
phase: 15-store-overlay-expiration-alerts
reviewed: 2026-07-09T20:39:25Z
depth: standard
files_reviewed: 16
files_reviewed_list:
  - src/common/discounts/badges.ts
  - src/common/humble/viewFilters.ts
  - src/common/types.ts
  - src/backend/config.ts
  - src/backend/humble/electronStores.ts
  - src/backend/humble/expirationAlerts.ts
  - src/backend/humble/library.ts
  - src/frontend/screens/Discounts/index.tsx
  - src/frontend/screens/Discounts/components/DiscountCard/index.tsx
  - src/frontend/screens/Discounts/components/DiscountCard/index.css
  - src/frontend/screens/Humble/Keys/Waiting/index.tsx
  - src/frontend/screens/Settings/components/NotifyHumbleExpirations.tsx
  - src/frontend/screens/Settings/components/index.ts
  - src/frontend/screens/Settings/sections/GeneralSettings/index.tsx
  - public/locales/en/translation.json
  - src/backend/humble/__tests__/expirationAlerts.test.ts
findings:
  critical: 1
  warning: 2
  info: 2
  total: 5
status: issues_found
---

# Phase 15: Code Review Report

**Reviewed:** 2026-07-09T20:39:25Z
**Depth:** standard
**Files Reviewed:** 16
**Status:** issues_found

## Summary

Phase 15 adds Discounts-screen ownership badges (HSTORE-01) and Humble
expiration alerts (HSTORE-03). The expiration-transition detection, the pinned
"Expiring soon" partition, and the settings/config plumbing are largely sound
and well-tested. However, the review surfaced one blocking defect: the
**"Key available" badge — a core HSTORE-01 deliverable — is structurally
unreachable in production** because of how the container wires up the pure
`resolveDiscountBadge` helper. The helper's own unit tests pass only because
they hand-decouple two maps that the real container derives from the same
source. Two secondary issues concern the notification dedup key (machineName
collisions can re-fire on every sync) and missing i18n keys for the OS
notification copy.

The focus areas requested were: notification dedup, expiration-transition
detection, ownership badge exact-match, and settings/config plumbing. Findings
below map to all four.

## Critical Issues

### CR-01: "Key available" badge is unreachable in production — the branch can never execute

**File:** `src/frontend/screens/Discounts/index.tsx:81-93, 487-502` (with `src/common/discounts/badges.ts:35-56`)

**Issue:** The container builds both inputs to `resolveDiscountBadge` from the
**same source** — `steam.library`:

```ts
const titleToSteamAppId = ... for (const game of steam.library) map.set(key, game.app_name)
const ownedSteamAppIds = new Set(steam.library.map((g) => g.app_name))
```

Inside `resolveDiscountBadge`, the only way to obtain an `appId` is
`titleToAppId.get(normalize(product.title))`. Every value in
`titleToSteamAppId` is a `game.app_name` pulled from `steam.library`, and
`ownedSteamAppIds` is exactly the set of those same `app_name`s. Therefore
**any `appId` the helper resolves is guaranteed to be present in
`ownedAppIds`**, so `ownedAppIds.has(appId)` is always true and the function
returns `'owned'` on every title match. The `'key-available'` branch
(`badges.ts:48-55`) is dead code from this call site — a Humble key waiting for
a game the user does *not* own on Steam has no entry in `titleToSteamAppId`
(it is not in `steam.library`), so `appId` is `undefined` and the helper
returns `null`. Net result: the "Key available" pill never renders, defeating
HSTORE-01 / D-84.

The unit test `badges.test.ts:58-67` masks this by passing
`ownedAppIds = new Set<string>()` (empty) *alongside* a populated
`titleToAppId` — a state the real container can never produce — so the suite
is green while the shipped feature is inert.

**Fix:** Resolve the title→appId bridge from a source that includes games the
user does NOT own on Steam. Since `HumbleKey` already carries both `title` and
`steamAppId`, build the bridge (and/or the key-available match) directly from
the waiting-keys set rather than from `steam.library`:

```ts
// Include Humble keys' own steamAppId so an unowned-but-keyed game resolves.
const titleToSteamAppId = useMemo(() => {
  const map = new Map<string, string>()
  for (const game of steam.library) {
    const key = game.title?.trim().toLowerCase()
    if (key && !map.has(key)) map.set(key, game.app_name)
  }
  for (const k of (humble.keys ?? [])) {
    const key = k.title?.trim().toLowerCase()
    if (key && k.steamAppId && !map.has(key)) map.set(key, k.steamAppId)
  }
  return map
}, [steam.library, humble.keys])
```

`ownedSteamAppIds` should stay derived from `steam.library` only, so the
`'owned'`-wins precedence is preserved and the `'key-available'` branch becomes
reachable. Add an integration-level test that exercises the helper with the
two maps built exactly as the container builds them (not artificially
decoupled) to prevent regression.

## Warnings

### WR-01: Notification dedup keyed by `machineName` alone — collisions re-fire every sync

**File:** `src/backend/humble/expirationAlerts.ts:27-38`, `src/backend/humble/electronStores.ts:149-152`

**Issue:** `humbleNotifiedExpirationStore` is keyed by `key.machineName`, and
`detectAndNotifyExpirationTransitions` reads/writes it with `key.machineName`.
The same `machineName` can appear across two different orders/bundles
(`gamekey`s) — this is the exact collision the Phase 14 composite-key
discipline (WR-01 lesson) was introduced to prevent, and it is honored by
`humbleAuditStore` and `humbleLocalRedeemedStore` (both keyed
`gamekey:machineName`), but *not* here. `getKeys()` (`library.ts:458-464`)
flattens keys across all orders with no de-duplication, so if the same
`machineName` exists in two orders with **different** expirations, the loop
sets the store to one date for the first and the other date for the second;
every subsequent sync then sees `current !== last` for both and re-fires the
notification indefinitely — the notification storm the design set out to avoid.

**Fix:** Key the dedup store by the composite, consistent with the other
disconnect-exempt stores. `HumbleKey` already carries `gamekey`:

```ts
const composite = `${key.gamekey}:${key.machineName}`
const last = humbleNotifiedExpirationStore.get(composite)?.expiration ?? null
...
humbleNotifiedExpirationStore.set(composite, { expiration: current })
```

### WR-02: OS notification i18n keys are referenced but not registered

**File:** `src/backend/humble/expirationAlerts.ts:88-109`, `public/locales/en/translation.json`

**Issue:** `buildDigestCopy` calls
`i18next.t('humble.notification.expiringTitleSingle', ...)` and three sibling
keys (`expiringBodySingle`, `expiringTitlePlural`, `expiringBodyPlural`), but
none of these keys exist in `public/locales/en/translation.json` (grep
confirms zero matches). The user-facing feature works in English *only* because
each call passes an inline English fallback as the second argument; for every
other locale the OS notification silently falls back to English, and
translators have no key to localize. This is inconsistent with Plan 01's own
convention, which deliberately hand-registered the `discounts.badge.*` keys.

**Fix:** Add the four keys under a `humble.notification` block in
`translation.json` (matching the fallback strings in `buildDigestCopy`), the
same way the badge keys were added.

## Info

### IN-01: Dedup store advances even when notifications are disabled — backlog is silently consumed

**File:** `src/backend/humble/expirationAlerts.ts:30-45, 52-55`

**Issue:** The loop that advances `humbleNotifiedExpirationStore` runs *before*
the `suppressNotifications` early-return and the `notifyHumbleExpirations`
settings gate. So while notifications are disabled, transitions are still
recorded as "notified." If the user later enables the toggle, transitions that
occurred while it was off will never surface — the "last-notified" watermark
already moved past them. This is asserted as intended behavior by
`expirationAlerts.test.ts:268-279`, so it appears to be a deliberate product
decision (avoid a backlog storm on enable). Flagged only to confirm intent —
if the desired behavior is "surface anything that changed since the toggle was
enabled," the store advance must be gated behind the settings check.

**Fix:** No change if intended. Otherwise, move the store `.set` inside the
branch that actually fires (or is allowed to fire) the notification.

### IN-02: `getKeys()` flattening has no cross-order de-duplication

**File:** `src/backend/humble/library.ts:458-464`

**Issue:** `getKeys()` concatenates `entry.keys` across every cached order with
no de-dup. This is pre-existing and fine for the Keys views, but it is the
input to `detectAndNotifyExpirationTransitions` and compounds WR-01: a
duplicate `machineName` across orders is counted twice in the digest
(`newlyExpiring.length`), inflating the "N Humble keys" count and potentially
naming the same game twice. Resolving WR-01 (composite keying) largely
neutralizes this; noted for completeness.

**Fix:** None required beyond WR-01; if a precise digest count matters,
de-duplicate `newlyExpiring` by composite key before building the copy.

---

_Reviewed: 2026-07-09T20:39:25Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
