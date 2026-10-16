# Phase 15: Store Overlay + Expiration Alerts - Pattern Map

**Mapped:** 2026-07-09
**Files analyzed:** 11 (new + modified)
**Analogs found:** 11 / 11

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/common/discounts/badges.ts` (new) | utility (pure helper) | transform | `src/common/humble/viewFilters.ts` | role-match (pure common/ helper convention) |
| `src/backend/discounts/__tests__/badges.test.ts` (new) | test | transform | `src/backend/humble/__tests__/viewFilters.test.ts` | exact (same "common/ tested from backend project" convention) |
| `src/frontend/screens/Discounts/components/DiscountCard/index.tsx` (modify) | component | request-response (presentational) | `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx` (`.humbleKeyOwnedBadge` sibling span) | role-match |
| `src/frontend/screens/Discounts/index.tsx` (modify) | component (container) | CRUD (derives lookup maps from context) | itself — extend existing `ownedTitles` `useMemo` pattern | exact |
| `src/backend/humble/expirationAlerts.ts` (new) | service | event-driven | `src/backend/dialog/dialog.ts` (`notify()`) | role-match (notification dispatch) |
| `src/backend/humble/__tests__/expirationAlerts.test.ts` (new) | test | event-driven | `src/backend/humble/__tests__/electronStores.test.ts` | role-match |
| `src/backend/humble/electronStores.ts` (modify) | model/store | CRUD (persistence) | itself — extend existing `CacheStore` exports (`humbleRevealedStore` et al.) | exact |
| `src/backend/humble/library.ts` (modify, `runSync()` ~line 997) | service (sync orchestrator) | event-driven | itself — `recomputeOwnership()` hook point | exact |
| `src/frontend/screens/Humble/Keys/Waiting/index.tsx` (modify) | component | request-response | itself + `src/frontend/screens/Humble/Keys/components/HumbleKeyGroup/index.tsx` (heading/count chrome) | exact (self) / role-match (heading chrome) |
| `src/frontend/screens/Settings/components/NotifyHumbleExpirations.tsx` (new) | component (settings toggle) | request-response | `src/frontend/screens/Settings/components/AnalyticsOptIn.tsx` | exact |
| `src/common/types.ts` (modify, `AppSettings`) | config/type | CRUD | itself — `analyticsOptIn: boolean` field | exact |
| `src/backend/config.ts` (modify, `getFactoryDefaults()`) | config | CRUD | itself — `analyticsOptIn: false` default entry | exact |
| `src/frontend/screens/Settings/sections/GeneralSettings/index.tsx` (modify) | component (registration) | request-response | itself — `<AnalyticsOptIn />` registration | exact |

## Pattern Assignments

### `src/common/discounts/badges.ts` (new pure helper)

**Analog:** `src/common/humble/viewFilters.ts` + `src/common/humble/urgencyBadge.ts` (module-doc convention), consuming logic from `src/backend/humble/dedup.ts`'s exact-match branch and `src/frontend/screens/Discounts/index.tsx`'s `ownedTitles`.

**Module-doc / no-I/O convention** (`src/common/humble/viewFilters.ts` lines 1-10):
```typescript
import { HumbleKey, HumbleKeyState } from '../types/humble'
import { GENERIC_KEY_PLATFORM } from './groupKeys'

/**
 * Pure view-membership + sort helpers for the Keys-waiting and Giftable-
 * spares tabs (D-53/D-54/D-55/D-56, Phase 13). Kept in common/ (no React, no
 * i18n, no I/O) so it is unit-testable from the backend jest project — the
 * frontend tabs only map the returned flat arrays to `HumbleKeyRow`s.
 */
```
Follow this exact doc-comment + no-React/no-i18n/no-I/O discipline for `badges.ts`.

**Exact-AppID-match precedent** (`src/backend/humble/dedup.ts` lines 148-161, verbatim structure to mirror — never fall back to fuzzy):
```typescript
    // D-71 / WR-01 fix: a falsy-but-present steamAppId ('' or '0') must not
    // ...
    // plain JS truthiness check (`if (key.steamAppId)`) is NOT sufficient
    ...
      key.steamAppId !== undefined &&
      key.steamAppId !== '' &&
      key.steamAppId !== '0'
    ) {
      if (steamGames.some((g) => g.app_name === key.steamAppId)) {
        matchConfidence = 'exact'
```

**Existing exact-normalized-title bridge to mirror** (`src/frontend/screens/Discounts/index.tsx` lines 47-73, verbatim — this is the ONLY existing precedent for `CatalogProduct` → ownership; `badges.ts`'s title→AppID resolution must use the same normalization, `.trim().toLowerCase()`):
```typescript
  // Build a normalized-title set of games owned in ANY store (Epic, GOG,
  // Amazon, Steam, Zoom). Deals catalog products and library games do not
  // share appName across stores, so match by trimmed/lowercased title.
  const ownedTitles = useMemo(() => {
    const set = new Set<string>()
    for (const game of [
      ...epic.library,
      ...gog.library,
      ...amazon.library,
      ...steam.library,
      ...zoom.library
    ]) {
      const key = game.title?.trim().toLowerCase()
      if (key) set.add(key)
    }
    return set
  }, [epic.library, gog.library, amazon.library, steam.library, zoom.library])
```
Note: `ownedTitles` here spans ALL stores by title only — Phase 15's `badges.ts` instead needs a `Map<normalizedTitle, steamAppId>` built from `steam.library` ONLY (Steam's `app_name` is the AppID), because D-82's exact-appid-match requirement means the bridge is: `CatalogProduct.title` → (normalized-title match) → `steam.library` entry → its `app_name` → then exact-AppID comparisons against `ownedAppIds`/`HumbleKey.steamAppId`. Do not reuse `ownedTitles` directly for badges; build a new, separate map scoped to `steam.library`.

**Reused view-membership helper for "Key available"** — call `selectKeysWaiting(humble.keys)` (`src/common/humble/viewFilters.ts` line 58) unchanged, then filter by `k.steamAppId === appId`. `HumbleKey.steamAppId`/`ownedElsewhere` fields are defined in `src/common/types/humble.ts` (read that file directly when implementing — not excerpted here since RESEARCH.md already confirms its shape).

**No-render / D-79 "missing beats wrong" convention:** return `null` (not a placeholder) when no exact title match exists — same convention as `UrgencyBadge`'s `if (tier === null) return null` (see below) and `viewFilters.ts`'s empty-array-on-no-match pattern.

---

### `src/backend/discounts/__tests__/badges.test.ts` (new test)

**Analog:** `src/backend/humble/__tests__/viewFilters.test.ts` (full file header + `makeKey` factory pattern, lines 1-27):
```typescript
/**
 * Unit tests for the pure Keys-waiting / Giftable-spares membership + sort
 * helpers (D-53/D-54/D-55/D-56, HVIEW-01/HVIEW-02). The helpers live in
 * common/humble/viewFilters.ts (no React/i18n/I/O); this test sits in the
 * backend suite because jest's project roots only cover src/backend.
 */

import { HumbleKey, HumbleKeyState } from 'common/types/humble'
import {
  selectKeysWaiting,
  selectGiftableSpares
} from 'common/humble/viewFilters'

function makeKey(overrides: Partial<HumbleKey> = {}): HumbleKey {
  return {
    gamekey: 'gk',
    machineName: `mn-${Math.random().toString(36).slice(2)}`,
    state: 'UNREVEALED',
    title: 'Some Game',
    platform: 'steam',
    expiration: null,
    origin: 'Some Bundle',
    ownedElsewhere: false,
    matchConfidence: 'none',
    ...overrides
  }
}
```
Mirror this: file lives under `src/backend/discounts/__tests__/` per RESEARCH.md's test map (even though the module it tests is `src/common/discounts/badges.ts` — matches the existing "common/ tested from backend project" convention documented in the header comment above), with an equivalent `makeProduct()`/`makeSteamGame()` factory pair.

---

### `src/frontend/screens/Discounts/components/DiscountCard/index.tsx` (modify)

**Analog (current file, full content — read before modifying):**
```typescript
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CachedImage } from 'frontend/components/UI'
import fallBackImage from 'frontend/assets/gamelib_card.svg?url'
import type { CatalogProduct } from 'common/types/discounts'
import {
  normalizeRating,
  parseDiscountPercent,
  withAffiliate
} from '../../helpers'
import './index.css'

interface Props {
  product: CatalogProduct
}

const DiscountCard = ({ product }: Props) => {
  ...
  return (
    <button type="button" className="discountCard" onClick={handleClick} title={product.title}>
      {rating > 0 && (<span className="discountCard__score" ...>...</span>)}
      {discountPercent > 0 && (<span className="discountCard__badge">-{discountPercent}%</span>)}
      <CachedImage className="discountCard__image" src={cover} fallback={fallBackImage} alt={product.title} />
      <div className="discountCard__info">
        <span className="discountCard__title">{product.title}</span>
        <div className="discountCard__priceRow">...</div>
      </div>
    </button>
  )
}
```
Per UI-SPEC Component Inventory: add the new `badge: DiscountBadge` prop (computed by the parent `Discounts/index.tsx`, NOT recomputed inside the card) and render a new pill **inside `.discountCard__info`, directly above `.discountCard__title`** — NOT as a 3rd image-overlay corner span alongside `discountCard__score`/`discountCard__badge` (those use a different "poster badge" chrome per D-80).

**Non-interactive sibling-badge precedent to clone chrome from** (`src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx` lines 118, 146 — usage sites; CSS below):
```typescript
          <span className="humbleKeyOwnedBadge">
```
```css
/* src/frontend/screens/Humble/Keys/index.css lines 198-225 */
.humbleKeyStateBadge {
  padding: var(--space-3xs) var(--space-2xs);
  border-radius: var(--space-3xs);
  font-size: var(--text-sm);
  font-weight: var(--semibold);
  color: var(--neutral-01);
  white-space: nowrap;
}
.humbleKeyStateBadge--UNREVEALED { background: var(--status-info); }
.humbleKeyStateBadge--REDEEMED { background: var(--status-success); }
```
D-80/UI-SPEC lock: the new `.discountCard__badge--owned` / `.discountCard__badge--keyAvailable` pill classes must copy this exact declaration block (`padding`/`border-radius`/`font-size`/`font-weight`/`color: var(--neutral-01)`) and only vary `background` (`var(--status-success)` for owned, `var(--status-info)` for key-available). It must be a `<span>`, never a `<button>`, no `cursor: pointer`, no hover state (D-81).

---

### `src/frontend/screens/Discounts/index.tsx` (modify — appIdMap + per-product badge)

**Analog (existing `useMemo` pattern in the same file, lines 40-73):** already excerpted above under `badges.ts` (`ownedTitles`). Extend this file with a **second, sibling** `useMemo` scoped to `steam.library` only:
```typescript
  const { epic, gog, amazon, steam, zoom } = useContext(ContextProvider)
  // existing ownedTitles useMemo stays unchanged (drives the pre-existing
  // Hide Owned filter) — add a NEW, separate memo for badge resolution:
  const titleToSteamAppId = useMemo(() => {
    const map = new Map<string, string>()
    for (const game of steam.library) {
      const key = game.title?.trim().toLowerCase()
      if (key && !map.has(key)) map.set(key, game.app_name)
    }
    return map
  }, [steam.library])
```
Then per-product in the `.map((product) => ...)` render (line 630-632), call the new `resolveDiscountBadge(product, titleToSteamAppId, ownedSteamAppIds, selectKeysWaiting(humble.keys))` and pass the result as the new `badge` prop to `<DiscountCard>`. Memoize the whole per-product badge computation with `useMemo` keyed on `[paginated, titleToSteamAppId, humble.keys]` (per RESEARCH.md's memoization anti-pattern warning) rather than recomputing inline on every render.

**ContextProvider import already present** — no new import needed beyond `humble` (destructure alongside `epic, gog, amazon, steam, zoom` on line 44) and `selectKeysWaiting`/`resolveDiscountBadge` from their common/ modules.

---

### `src/backend/humble/expirationAlerts.ts` (new)

**Analog:** `src/backend/dialog/dialog.ts` (full file, verbatim `notify()` pattern to extend, lines 1-72):
```typescript
import { LogPrefix, logWarning } from 'backend/logger'
import { dialog, Notification } from 'electron'
import { ButtonOptions, DialogType } from 'common/types'
import { getMainWindow } from '../main_window'
import { sendFrontendMessage } from '../ipc'
import { isSteamDeckGameMode } from 'backend/constants/environment'

...

type NotifyType = {
  title: string
  body: string
}

function notify({ body, title }: NotifyType) {
  if (Notification.isSupported() && !isSteamDeckGameMode) {
    const mainWindow = getMainWindow()
    const notify = new Notification({
      body,
      title
    })

    notify.on('click', () => mainWindow?.show())
    notify.show()
  }
}

export { showDialogBoxModalAuto, notify }
```
Copy the `Notification.isSupported() && !isSteamDeckGameMode` guard verbatim (Pitfall 4 — do not invent a new guard). The new file's notification differs only in its `.on('click', ...)` handler, which must ALSO call `sendFrontendMessage('openScreen', ...)` after `mainWindow?.show()` (D-91) — see the `openScreen` precedent below. Do not import/call `dialog.ts`'s `notify()` directly since its click handler doesn't navigate; build a small local `new Notification({...})` matching the same guard/shape instead, exactly as RESEARCH.md's Pattern 2 shows.

**`openScreen` navigation precedent** (`src/backend/main.ts` lines 1473, 1477, 1481 — verbatim, zero new IPC plumbing needed):
```typescript
      sendFrontendMessage('openScreen', '/settings/general')
      ...
      sendFrontendMessage('openScreen', '/download-manager')
      ...
      sendFrontendMessage('openScreen', '/library')
```
For Phase 15: `sendFrontendMessage('openScreen', '/humble-keys/waiting')`. `sendFrontendMessage` is already imported in `dialog.ts` from `'../ipc'` — same relative import to use from `src/backend/humble/expirationAlerts.ts` (adjust path: `backend/ipc` via the project's path-alias convention, matching `dialog.ts`'s sibling-relative `'../ipc'` since `expirationAlerts.ts` sits at the same depth as `dialog/dialog.ts` — verify actual resolved path alias at implementation time).

**Sync-completion hook point** (`src/backend/humble/library.ts` lines 990-997, verbatim — the exact call site to add `detectAndNotifyExpirationTransitions(getKeys())` immediately after):
```typescript
  // HDEDUP-01: recompute the ownership overlay against the current Steam
  // library at the end of EVERY sync (not just clean ones — a partial sync
  // still committed whatever orders it could, and those newly-captured
  // steamAppIds deserve an immediate match attempt). Placed after the
  // isStale() fence above, so a disconnect mid-sync never re-populates the
  // wiped humbleLibraryStore here either. Itself a no-op when Steam is
  // disconnected/empty (D-48, see recomputeOwnership's own double-gate).
  recomputeOwnership()

  return { status: sawFailure ? 'partial' : 'ok' }
```
Add the new call directly after `recomputeOwnership()` (line 997), before the `return` — mirrors the doc-comment style already established for that line (explain WHY it must run after `recomputeOwnership()` and after the `isStale()` fence above at line 970, so a disconnect mid-sync never fires a notification either).

---

### `src/backend/humble/__tests__/expirationAlerts.test.ts` (new)

**Analog:** `src/backend/humble/__tests__/electronStores.test.ts` — read this file directly at implementation time for the exact `CacheStore` mocking pattern used to test persistence side effects (electron-store is typically mocked/uses a temp dir in this suite). Also mirror `dialog.ts`'s testability shape: `Notification`/`getMainWindow`/`sendFrontendMessage` are all mockable module-level imports, same as `dialog.ts` consumers already mock in existing dialog tests (search `src/backend/dialog/__tests__/` if present, else follow the `jest.mock('electron', ...)` convention used elsewhere in `src/backend/humble/__tests__/`).

---

### `src/backend/humble/electronStores.ts` (modify — add `humbleNotifiedExpirationStore`)

**Analog (existing disconnect-exempt store precedent in the SAME file, lines 91-94, verbatim structure to clone):**
```typescript
const humbleGiftedAtStore = new CacheStore<{ giftedAt: number }, string>(
  'humble_gifted_at',
  null
)
```
And its surrounding doc-comment convention (lines 80-90, condensed pattern — every disconnect-exempt store in this file carries this exact rationale block):
```typescript
// D-59 ...: records when the user confirmed ... Guards against
// double-...ing the same key. Like humbleRevealedStore and
// humbleOwnershipOverrideStore above, this store is NEVER cleared by
// HumbleUser.disconnect() — a ... confirmation must survive a
// disconnect/reconnect cycle so the ... guard is never silently
// dropped. Kept as its own electron-store file on disk for the same
// isolation reason as the two stores above — do not merge this into
// humbleLibraryStore.
```
Per RESEARCH.md Assumption A4: `humbleNotifiedExpirationStore` should follow this SAME disconnect-exempt pattern (never wiped by `HumbleUser.disconnect()`), keyed by `machineName` (never `gamekey` — see the file's own "Anti-Patterns to Avoid" equivalent, RESEARCH.md's final bullet). Value shape: `{ expiration: string }` (the last-notified ISO date string), e.g.:
```typescript
const humbleNotifiedExpirationStore = new CacheStore<
  { expiration: string },
  string
>('humble_notified_expiration', null)
```
Add to the file's final `export { ... }` block (lines 136-145) alongside the existing 7 exports.

**Existing extension test to follow (do not replace):** `src/backend/humble/__tests__/electronStores.test.ts` — extend it with new cases for `humbleNotifiedExpirationStore`, matching whatever `describe`/`test` structure the file already uses for `humbleGiftedAtStore`/`humbleOwnershipOverrideStore`.

---

### `src/frontend/screens/Humble/Keys/Waiting/index.tsx` (modify — pinned section)

**Analog (current file's membership derivation, line 33, to extend with a partition):**
```typescript
  const keys = selectKeysWaiting(humble?.keys ?? [])
```
Change to partition into `{ pinned, rest }` via `getUrgencyTier(...) !== null` (D-87/D-88), e.g.:
```typescript
  const allWaiting = selectKeysWaiting(humble?.keys ?? [])
  const pinned = allWaiting.filter(
    (k) => getUrgencyTier(k.state, k.expiration) !== null
  )
  const rest = allWaiting.filter(
    (k) => getUrgencyTier(k.state, k.expiration) === null
  )
```
`getUrgencyTier` is already imported (line 7) and already used per-row (line 147) — reuse the SAME import, do not add a second one.

**Row rendering to reuse unchanged** (lines 138-178 — the existing `<HumbleKeyRow>` map block): render this exact block twice (once for `pinned`, sorted soonest-first — `allWaiting` is already sorted soonest-first by `selectKeysWaiting`'s `compareWaiting`, so `pinned`/`rest` inherit that order for free — then once for `rest`), wrapped by the new pinned-section heading only for the `pinned` branch.

**Pinned-section heading chrome to clone** (`src/frontend/screens/Humble/Keys/components/HumbleKeyGroup/index.tsx` lines 52-73 — clone the STATIC parts only, per UI-SPEC's explicit "not a collapsible `<button>`" deviation):
```typescript
    <section className="humbleKeyGroup">
      ...
      <button
        type="button"
        className="humbleKeyGroupHeading"
        aria-expanded={expanded}
        aria-controls={listId}
        onClick={() => setExpanded((v) => !v)}
      >
        <FontAwesomeIcon icon={faChevronRight} className={classNames('humbleKeyGroupChevron', { 'humbleKeyGroupChevron--open': expanded })} />
        <span className="humbleKeyGroupLabel">{t(labelKey, labelDefault)}</span>
        <span className="humbleKeyGroupCount">{keys.length}</span>
      </button>
```
UI-SPEC requires the pinned heading to be a **static, non-interactive** `<h2>`-equivalent (no `<button>`, no chevron, no `aria-expanded`, no click handler) reusing only `.humbleKeyGroupHeading`/`.humbleKeyGroupLabel`/`.humbleKeyGroupCount` CSS classes with the `humbleKeys.expiringSoon` / `{{count}}` copy (locked in UI-SPEC). D-89: wrap the whole pinned block (heading + list) in `{pinned.length > 0 && (...)}` — never render a heading with zero rows.

---

### `src/frontend/screens/Settings/components/NotifyHumbleExpirations.tsx` (new)

**Analog (full file, verbatim structure to clone):** `src/frontend/screens/Settings/components/AnalyticsOptIn.tsx`
```typescript
import { ToggleSwitch } from 'frontend/components/UI'
import useSetting from 'frontend/hooks/useSetting'
import { useTranslation } from 'react-i18next'
import InfoIcon from 'frontend/components/UI/InfoIcon'

const AnalyticsOptIn = () => {
  const { t } = useTranslation()
  const [analyticsOptIn, setAnalyticsOptIn] = useSetting(
    'analyticsOptIn',
    false
  )

  return (
    <div className="toggleRow">
      <ToggleSwitch
        htmlId="analyticsOptIn"
        value={analyticsOptIn}
        handleChange={() => setAnalyticsOptIn(!analyticsOptIn)}
        title={t(
          'setting.analyticsOptIn',
          'Send anonymous data to help Heroic development'
        )}
      />
      <InfoIcon
        text={t(
          'help.analytics',
          'Enables Heroic to collect 100% anonymous usage data to help improve the application. Needs restart to take effect.'
        )}
      />
    </div>
  )
}

export default AnalyticsOptIn
```
Clone verbatim with: `htmlId="notifyHumbleExpirations"`, setting key `'notifyHumbleExpirations'`, **default `true`** (not `false` — D-93), title key `setting.notifyHumbleExpirations` → `'Notify when Humble keys gain expiration dates'` (locked copy, UI-SPEC), help key `help.notifyHumbleExpirations` → `'Get an OS notification when a Humble key you haven't claimed gains an expiration date.'` (UI-SPEC).

**Registration precedent** (`src/frontend/screens/Settings/sections/GeneralSettings/index.tsx` lines 1-82 — `AnalyticsOptIn` import line 25, usage line 73): add `NotifyHumbleExpirations` to the same import block and place its `<NotifyHumbleExpirations />` JSX call near `<TraySettings />`/`<DiscordRPC />` (nearest notification/behavior-adjacent group per Claude's Discretion) — exact line position at implementer's discretion, but it must be added to `src/frontend/screens/Settings/components/index.ts`'s barrel export first (check that barrel file exists and follow its existing export-list pattern before wiring into `GeneralSettings/index.tsx`).

**`useSetting` hook (verbatim, confirms fallback mechanics — RESEARCH.md Open Question 3):**
```typescript
// src/frontend/hooks/useSetting.ts
const useSetting = <T extends keyof AppSettings>(
  key: T,
  fallback: NonNullable<AppSettings[T]>
): [NonNullable<AppSettings[T]>, (newVal: AppSettings[T]) => void] => {
  const { getSetting, setSetting } = useContext(SettingsContext)
  const currentValue = getSetting(key, fallback)
  ...
}
```
`key` is typed as `keyof AppSettings` — **`AppSettings` (src/common/types.ts) must get a new `notifyHumbleExpirations: boolean` field** before this compiles (mirrors `analyticsOptIn: boolean` at `src/common/types.ts:97`). Also add a `notifyHumbleExpirations: true` entry to `src/backend/config.ts`'s `getFactoryDefaults()` (mirrors `analyticsOptIn: false` at `src/backend/config.ts:328`) — keep both the type declaration and the factory-default in sync, per that function's own established convention.

---

## Shared Patterns

### OS Notification dispatch (backend)
**Source:** `src/backend/dialog/dialog.ts` lines 61-72 (`notify()`)
**Apply to:** `src/backend/humble/expirationAlerts.ts`
```typescript
function notify({ body, title }: NotifyType) {
  if (Notification.isSupported() && !isSteamDeckGameMode) {
    const mainWindow = getMainWindow()
    const notify = new Notification({ body, title })
    notify.on('click', () => mainWindow?.show())
    notify.show()
  }
}
```
Guard (`Notification.isSupported() && !isSteamDeckGameMode`) must be copied verbatim — this is the codebase's single existing cross-platform-safety check for OS notifications (also referenced from `src/backend/utils.ts:192`'s Epic-offline notification, a second precedent of the same guard).

### Frontend navigation from a backend event
**Source:** `src/backend/main.ts` lines 1473/1477/1481 + `src/frontend/components/UI/Sidebar/index.tsx` lines 58-63
**Apply to:** `expirationAlerts.ts`'s notification click handler
```typescript
// backend
sendFrontendMessage('openScreen', '/humble-keys/waiting')
```
```typescript
// frontend (already mounted app-wide — zero new listener code needed)
useEffect(() => {
  window.api.handleGoToScreen((e, screen) => {
    navigate(screen, { state: { fromGameCard: false } })
  })
}, [])
```

### CacheStore persistence (backend)
**Source:** `src/backend/humble/electronStores.ts` (whole-file convention, e.g. lines 91-94)
**Apply to:** `humbleNotifiedExpirationStore` in the same file
```typescript
const humbleGiftedAtStore = new CacheStore<{ giftedAt: number }, string>(
  'humble_gifted_at',
  null
)
```
Every store in this file is keyed by `machineName` (never `gamekey`) and carries a doc-comment stating explicitly whether `HumbleUser.disconnect()` wipes it. `humbleNotifiedExpirationStore` must state (and implement) that it is DISCONNECT-EXEMPT, matching `humbleRevealedStore`/`humbleOwnershipOverrideStore`/`humbleGiftedAtStore`.

### Pure helper module convention (common/)
**Source:** `src/common/humble/viewFilters.ts` and `src/common/humble/urgencyBadge.ts` (module-doc header convention)
**Apply to:** `src/common/discounts/badges.ts`
```typescript
/**
 * Pure ... helper(s) for ... (D-xx, Phase 15). Kept in common/ (no React, no
 * i18n, no I/O) so it is unit-testable from the backend jest project.
 */
```

### Settings toggle (frontend + type + backend default, 3-file pattern)
**Source:** `src/frontend/screens/Settings/components/AnalyticsOptIn.tsx` + `src/common/types.ts:97` + `src/backend/config.ts:328`
**Apply to:** `NotifyHumbleExpirations.tsx` + `AppSettings.notifyHumbleExpirations` + `getFactoryDefaults()`'s new entry
- Component: `useSetting('notifyHumbleExpirations', true)` + `ToggleSwitch` + `InfoIcon`, wired via `.toggleRow`.
- Type: add `notifyHumbleExpirations: boolean` next to `analyticsOptIn: boolean` in `AppSettings`.
- Backend default: add `notifyHumbleExpirations: true` next to `analyticsOptIn: false` in `getFactoryDefaults()`.

### No-render convention (`{ kind: 'none' }` / null tier → render nothing)
**Source:** `src/frontend/screens/Humble/Keys/components/UrgencyBadge/index.tsx` lines 22-29
```typescript
  if (tier === null || expiration === null) {
    return null
  }
  const parts = getUrgencyCountdownParts(expiration)
  if (parts.kind === 'none') {
    return null
  }
```
**Apply to:** `resolveDiscountBadge` returning `null` (no pill rendered, D-79) and the pinned Expiring-soon section rendering nothing at all when `pinned.length === 0` (D-89) — both must return/render nothing, not an empty-state placeholder.

### Pill badge chrome (`.humbleKeyStateBadge` family)
**Source:** `src/frontend/screens/Humble/Keys/index.css` lines 196-225
```css
.humbleKeyStateBadge {
  padding: var(--space-3xs) var(--space-2xs);
  border-radius: var(--space-3xs);
  font-size: var(--text-sm);
  font-weight: var(--semibold);
  color: var(--neutral-01);
  white-space: nowrap;
}
.humbleKeyStateBadge--UNREVEALED { background: var(--status-info); }
.humbleKeyStateBadge--REDEEMED { background: var(--status-success); }
```
**Apply to:** the new `DiscountCard` ownership pill (`--owned` → `var(--status-success)`, `--keyAvailable` → `var(--status-info)`) and is already the exact chrome `.humbleUrgencyBadge` (lines 260-275) also clones for the pinned section's urgency tiers — this is the single pill-chrome source of truth for the whole phase (D-80).

## No Analog Found

None. Every file in scope has a direct or role-matched analog already in the codebase (this phase is 100% composition per RESEARCH.md's Summary — no new architectural primitives).

## Metadata

**Analog search scope:** `src/common/humble/`, `src/common/discounts/` (does not yet exist), `src/backend/humble/`, `src/backend/dialog/`, `src/frontend/screens/Discounts/`, `src/frontend/screens/Humble/Keys/`, `src/frontend/screens/Settings/`
**Files scanned:** 20 read directly (index.tsx x2 for Discounts/Waiting, DiscountCard, urgencyBadge.ts, viewFilters.ts, electronStores.ts, dialog.ts, library.ts hook region, main.ts openScreen region, AnalyticsOptIn.tsx, GeneralSettings/index.tsx, HumbleKeyGroup, UrgencyBadge component, HumbleKeyRow badge usage + CSS, viewFilters.test.ts, discounts.ts types, config.ts defaults, useSetting.ts, common/types.ts)
**Pattern extraction date:** 2026-07-09
