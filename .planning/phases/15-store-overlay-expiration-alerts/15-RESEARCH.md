# Phase 15: Store Overlay + Expiration Alerts - Research

**Researched:** 2026-07-09
**Domain:** Electron desktop app — React frontend ownership-badge overlay on an existing GOG deals catalog screen, backend sync-pipeline expiration-transition detection, cross-platform OS notifications
**Confidence:** MEDIUM-HIGH (codebase patterns HIGH; one significant scope gap found — see Summary and Open Questions)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

> Numbering continues from Phase 14 to keep v1.2 decision IDs unambiguous. Phase 14 closed at D-77 per its context/verification artifacts — planner should confirm the last used ID in `.planning/phases/14-guided-claim-flow/` and renumber if this range collides.

#### Badge surfaces & states (HSTORE-01)
- **D-78:** Ownership badges appear on the **native Discounts screen only** (`src/frontend/screens/Discounts/`, `DiscountCard` components). The Steam Store WebView is untouched — no script injection into Valve's pages.
- **D-79:** **No "New" badge.** Cards badge only when there's something to say: "Owned" or "Key available". Unowned/unkeyed cards stay clean — the Discounts screen already has an owned-filter. This consciously narrows success criterion 1's "each title" wording; the criterion should be read as "each title with ownership context shows a badge".
- **D-80:** Badges reuse the **existing pill-badge visual language** (Phase 13 status-color pills), keeping ownership signaling consistent across the app. No new corner-ribbon or overlay treatment.
- **D-81:** Badges are **informational only** — no click targets; DiscountCard interaction behavior is unchanged.

#### Badge ↔ ownership/key matching (HSTORE-01)
- **D-82:** Store badges use **exact Steam appid matches only** — no fuzzy title matching on store surfaces. A missing badge beats a wrong one. (Phase 12's fuzzy tier stays where it is; it does not drive store badges.)
- **D-83:** **"Owned" = owned anywhere GameLib knows about** — in the Steam library or Humble-derived (Phase 12 `ownedElsewhere` already unifies the Humble→Steam direction). The badge answers "do I already have this?"
- **D-84:** **"Key available" = exactly the D-53 `selectKeysWaiting` membership** (`src/common/humble/viewFilters.ts`). Badge and Keys-waiting view can never disagree — what's badged is exactly what's listed.
- **D-85:** When a title is both owned and has an unclaimed spare key, **"Owned" wins — single badge per card**. Spare-key info remains the Giftable Spares view's job (Phase 13).

#### Expiring-soon surface (HSTORE-03)
- **D-86:** The expiring-soon surface is a **pinned section at the top of the existing "Keys waiting" view** — no 4th tab, no new sidebar entry.
- **D-87:** Membership reuses **Phase 13 urgency thresholds unchanged** (D-61: badge live at ≤30 days; `warning` ≤30d, `danger` ≤7d). A key enters the pinned section exactly when its urgency badge is live. Zero new threshold logic.
- **D-88:** **Move, don't duplicate** — expiring keys are lifted out of their normal grouping into the pinned section, sorted soonest-expiration-first. Each key has exactly one row.
- **D-89:** When no keys are within the window, the section is **hidden entirely** — consistent with Phase 13's `{ kind: 'none' }` no-render convention.

#### Expiration notifications (HSTORE-03)
- **D-90:** **Digest per sync**, not per-key: one OS notification summarizing newly-expiring keys ("3 Humble keys gained expiration dates"); when exactly one key is affected, name the game. Avoids notification storms when a bundle's keys gain deadlines together.
- **D-91:** **Clicking the notification focuses the app on the "Keys waiting" view**, where the pinned Expiring-soon section holds the affected keys.
- **D-92:** **Transition-based dedup, once per distinct deadline:** persist the last-notified expiration value per key (survives restarts). null→date fires; date→*different* date fires again (a moved deadline is new information); re-syncing the *same* date never re-fires.
- **D-93:** Notifications are **on by default with a Settings toggle** ("Notify when Humble keys gain expiration dates") placed alongside GameLib's existing notification/behavior settings. This satisfies HSTORE-03's "optional".

### Claude's Discretion
- Exact pill copy/i18n keys, badge placement within DiscountCard layout, and the persisted notified-state storage shape (follow the existing electron-store patterns).
- How the digest notification body reads for 2+ keys.
- Where in Settings the toggle lands (nearest existing notification-adjacent group).

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope. (HSTORE-02 bundle/deals listing remains deferred at the requirements level, predating this discussion.)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-------------------|
| HSTORE-01 | When browsing store surfaces, each title is badged Owned / Unclaimed-key-available / New based on ownership and key availability (narrowed by D-79 to Owned/Key-available only, no New badge, on the Discounts screen only per D-78) | See Architecture Patterns §Pattern 1, Don't Hand-Roll, Pitfall 1, Open Question 1 — the exact-match badge resolution mechanism and the CatalogProduct→AppID data-gap finding |
| HSTORE-03 | An "expiring soon" surface flags keys nearing expiration, with optional OS notifications for newly-expiring keys | See Architecture Patterns §Pattern 2, Don't Hand-Roll (urgency reuse, CacheStore, Notification API, openScreen navigation), Pitfall 2/3/4/5, Open Question 2/3 |
</phase_requirements>

## Summary

Phase 15 composes almost entirely from infrastructure already built in Phases 8, 11–14: the pill-badge visual language, the `getUrgencyTier`/`selectKeysWaiting` pure helpers, the `HumbleKey.steamAppId`/`ownedElsewhere` overlay fields, the `CacheStore` persistence pattern, the existing `Notification`/`openScreen` navigation plumbing, and the `useSetting`/`ToggleSwitch` settings pattern. No new npm packages are required anywhere in this phase — everything is built from Electron's built-in `Notification` API, the already-installed `electron-store` wrapper, and existing React/MUI components.

**The one significant finding requiring planner attention:** D-78 names `src/frontend/screens/Discounts/` as the sole badge host, but that screen's data model (`CatalogProduct`, sourced from GOG's own `catalog.gog.com` API) carries **no Steam AppID field at all** — only a GOG product id and a title. D-82 mandates "exact Steam appid matches only — no fuzzy title matching," but there is currently no way to obtain a Steam AppID for a `CatalogProduct` without some title-based resolution step first, because GOG's catalog API doesn't return one. The codebase's only existing precedent for connecting a `CatalogProduct` to ownership is `Discounts/index.tsx`'s inline `ownedTitles` set — an **exact-normalized-title** match (not Phase 12's fuzzy engine, but not an AppID match either). This gap needs to be resolved during planning/discuss before task breakdown — see Open Questions §1 for the recommended resolution.

**Primary recommendation:** Resolve a `CatalogProduct → Steam AppID` mapping via one exact-normalized-title lookup against the already-in-memory `steam.library` (mirroring the existing `ownedTitles` precedent), then drive both the "Owned" and "Key available" badge computations off that resolved AppID using exact comparisons only (`steam.library` membership for Owned; `HumbleKey.steamAppId` + `selectKeysWaiting` membership for Key available) — never falling through to Phase 12's fuzzy tier. Confirm this reading of D-82 with the user before locking the plan, since it is a step beyond the letter of "exact Steam appid matches only."

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Product → Steam AppID resolution (title lookup) | Frontend (React, in-memory) | — | `steam.library` and `humble.keys` are already fully hydrated in `ContextProvider` on the renderer; no backend round-trip needed, matches existing `ownedTitles` pattern in the same file |
| Badge classification (Owned / Key available / none) | Frontend (pure `common/` helper) | — | Pure function over already-loaded arrays; follows the `src/common/humble/*.ts` "no React, no I/O" convention so it's unit-testable from the backend jest project |
| Badge rendering | Frontend (`DiscountCard`) | — | Presentational only, per D-81 (no click targets) |
| Expiring-soon pinned section membership/sort | Frontend (reuses `common/humble/urgencyBadge.ts` + `viewFilters.ts`) | — | D-87/D-88 explicitly reuse existing pure helpers unchanged |
| Expiration-transition detection (null→date, date→different-date) | Backend (Electron main, `src/backend/humble/library.ts`) | — | Must run once per sync, after `recomputeOwnership()` settles the just-synced key set, before the sync function returns |
| "Already notified" state persistence | Backend (`electron-store` via `CacheStore`) | — | Must survive restarts (D-92); exact precedent is `humbleRevealedStore`/`humbleOwnershipOverrideStore` in `electronStores.ts` |
| OS notification dispatch | Backend (Electron main, `Notification` API) | — | Renderer processes cannot reliably create OS-level notifications from a background/hidden state; existing precedent (`dialog.ts`'s `notify()`, `utils.ts`'s Epic-offline notification) is backend-only |
| Notification click → navigate to Keys waiting | Backend (fires `openScreen` IPC message) | Frontend (already-wired `Sidebar` listener calls `navigate()`) | `sendFrontendMessage('openScreen', '/humble-keys/waiting')` — zero new IPC plumbing needed, see Code Examples |
| Notification settings toggle | Backend (`AppSettings`/`GlobalConfig`) | Frontend (`useSetting` + `ToggleSwitch` in Settings) | Standard existing settings-toggle pattern (`AnalyticsOptIn`, `DiscordRPC`) |

## Standard Stack

### Core

No new libraries. This phase is 100% composition of already-installed dependencies.

| Library | Version (installed) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| electron | ^41.1.1 [VERIFIED: package.json] | `Notification` API, `app.setAppUserModelId` (already called in `main.ts:359`) | Built-in, cross-platform OS notification primitive already in use twice in this codebase (`src/backend/utils.ts:192`, `src/backend/dialog/dialog.ts:64`) |
| electron-store (via project's `CacheStore`/`TypeCheckedStoreBackend` wrapper) | ^8.2.0 [VERIFIED: package.json, per CLAUDE.md tech-stack doc] | Persist per-key last-notified-expiration map | Exact precedent: `src/backend/humble/electronStores.ts`'s `humbleRevealedStore`, `humbleOwnershipOverrideStore` |
| react-i18next | already installed | Digest notification body / badge pill copy | Existing convention throughout Humble screens |

### Supporting

No supporting libraries beyond what's already imported by the files this phase touches (`@mui/material` for the Settings toggle row if styled inline, though `ToggleSwitch` is a custom in-house component, not MUI).

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Backend `Notification` API | `node-notifier` npm package | Unnecessary — Electron's built-in API already works cross-platform and is already used twice in this codebase; adding a new dependency for functionality already proven working would violate the "don't hand-roll what's already solved" principle in reverse (don't add a package for what's already built-in and working) |
| Exact-normalized-title product→AppID resolution | Reuse Phase 12's fuzzy matcher for products | Explicitly forbidden by D-82 ("Phase 12's fuzzy tier stays where it is; it does not drive store badges") — fuzzy matching on a screen with no user-facing override affordance (unlike the Humble Keys page's D-42 "Not the same game" override) risks silent wrong badges with no correction path |

**Installation:** None required — no `npm install` step for this phase.

**Version verification:** Electron ^41.1.1 and electron-store ^8.2.0 confirmed present via `package.json` (matches CLAUDE.md's locked v1.2 tech-stack doc). No registry lookups needed since nothing new is installed.

## Package Legitimacy Audit

**Not applicable — this phase installs zero external packages.** Every capability (OS notifications, persistence, settings toggle, badge rendering, pinned-section membership) is achievable with libraries already present in `package.json` and already used in analogous ways elsewhere in this codebase. The Package Legitimacy Gate protocol is skipped per its own scope ("required whenever this phase installs external packages").

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────── Backend (Electron main) ───────────────────────────┐
│                                                                                 │
│  Humble sync (library.ts: runSync)                                            │
│    │                                                                           │
│    ├─ per-order fetch/classify (existing, D-24/D-26)                          │
│    │                                                                           │
│    ├─ setSyncState(...) (existing)                                            │
│    │                                                                           │
│    ├─ recomputeOwnership() (existing, HDEDUP-01 hook point — line ~997)       │
│    │                                                                           │
│    └─▶ [NEW] detectExpirationTransitions(getKeys(), notifiedStore)            │
│           │                                                                    │
│           ├─ diff: null→date OR date→different-date, per BADGE_ELIGIBLE state │
│           ├─ same date re-seen → no-op (D-92 dedup)                           │
│           │                                                                    │
│           ├─▶ [NEW] humbleNotifiedExpirationStore.set(machineName, {date})    │
│           │        (CacheStore, survives restart — electronStores.ts pattern) │
│           │                                                                    │
│           └─▶ if transitions.length > 0 AND setting enabled:                  │
│                  new Notification({ title, body }) .show()                    │
│                  .on('click', () => {                                        │
│                    mainWindow?.show()                                        │
│                    sendFrontendMessage('openScreen', '/humble-keys/waiting') │
│                  })                                                          │
│                                                                                 │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                   │ IPC (existing 'openScreen' channel,
                                   │ already consumed app-wide by Sidebar)
                                   ▼
┌─────────────────────────── Frontend (renderer) ────────────────────────────────┐
│                                                                                  │
│  ContextProvider (already hydrated: steam.library, humble.keys)                │
│    │                                                                            │
│    ├─▶ Discounts screen (index.tsx)                                            │
│    │     │                                                                      │
│    │     ├─ [NEW] resolve title→AppID map from steam.library (once, useMemo)  │
│    │     ├─ [NEW] per-product: resolveDiscountBadge(product, appIdMap, keys)  │
│    │     │        pure helper, exact-match only                                │
│    │     └─▶ DiscountCard renders pill badge (Owned wins over Key-available,  │
│    │           D-85) using existing --status-* pill chrome                    │
│    │                                                                            │
│    └─▶ Humble Keys → Waiting tab (Keys/Waiting/index.tsx)                     │
│          ├─ existing selectKeysWaiting(humble.keys) (D-53, unchanged)         │
│          ├─ [NEW] partition into { pinned: expiring, rest } via                │
│          │        getUrgencyTier() !== null (D-87, reuses Phase 13 tiers)     │
│          └─▶ pinned section rendered first, sorted soonest-first (D-88);      │
│                hidden entirely when empty (D-89)                              │
│                                                                                  │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
src/
├── common/
│   ├── humble/
│   │   ├── urgencyBadge.ts        # existing, reused unchanged (D-87)
│   │   └── viewFilters.ts         # existing, reused unchanged (D-84/D-87)
│   └── discounts/                 # NEW — mirrors common/humble/'s pure-helper convention
│       └── badges.ts              # resolveDiscountBadge() + title-normalization helper
├── backend/
│   └── humble/
│       ├── library.ts             # existing runSync() gains one call after recomputeOwnership()
│       ├── electronStores.ts      # gains humbleNotifiedExpirationStore (CacheStore)
│       └── expirationAlerts.ts    # NEW — detectExpirationTransitions() + digest copy + notify()
├── frontend/
│   └── screens/
│       ├── Discounts/
│       │   ├── index.tsx          # gains appIdMap useMemo + badge lookup per product
│       │   └── components/DiscountCard/index.tsx  # gains badge pill render
│       ├── Humble/Keys/Waiting/
│       │   └── index.tsx          # gains pinned-section partition + render
│       └── Settings/
│           ├── components/NotifyHumbleExpirations.tsx  # NEW, mirrors AnalyticsOptIn.tsx
│           └── sections/GeneralSettings/index.tsx       # (or nearest notification-adjacent group)
```

### Pattern 1: Exact-match badge resolution (no fuzzy fallback)

**What:** A pure function taking a `CatalogProduct`, a `Map<normalizedTitle, appid>` built once from `steam.library`, and the current `humble.keys` array, returning `'owned' | 'key-available' | null`.

**When to use:** Every `DiscountCard` render (memoized per product list, not per-card).

**Example:**
```typescript
// Source: derived from src/backend/humble/dedup.ts's exact-match branch
// (steamAppId !== undefined/''/'0' → g.app_name === key.steamAppId, D-44)
// and src/common/humble/viewFilters.ts's selectKeysWaiting (D-53)
export type DiscountBadge = 'owned' | 'key-available' | null

export function resolveDiscountBadge(
  product: { title: string },
  titleToAppId: Map<string, string>,      // built from steam.library, normalized title -> app_name
  ownedAppIds: Set<string>,                 // Set of steam.library app_name values
  keysWaiting: HumbleKey[]                  // selectKeysWaiting(humble.keys) — already filtered
): DiscountBadge {
  const appId = titleToAppId.get(normalize(product.title))
  if (appId === undefined) return null      // no exact match — D-79/D-82: missing beats wrong
  if (ownedAppIds.has(appId)) return 'owned' // D-83/D-85: Owned wins, single badge per card
  const hasWaitingKey = keysWaiting.some((k) => k.steamAppId === appId)
  return hasWaitingKey ? 'key-available' : null
}

function normalize(title: string): string {
  return title.trim().toLowerCase()          // same normalization as Discounts/index.tsx's ownedTitles
}
```

### Pattern 2: Sync-completion notification hook (transition-based dedup)

**What:** After `recomputeOwnership()` settles in `runSync()`, diff each key's current `expiration` against the persisted last-notified value, fire one digest notification for the whole batch.

**When to use:** End of every `runSync()` call, both clean and partial syncs (mirrors D-47's placement of `recomputeOwnership()` — HSYNC-03 already recomputes expiration on every sync).

**Example:**
```typescript
// Source: derived from src/backend/humble/library.ts:990-997 (recomputeOwnership hook
// point) + src/backend/dialog/dialog.ts's notify() pattern + src/backend/main.ts:1473's
// sendFrontendMessage('openScreen', ...) precedent
import { getMainWindow } from 'backend/main_window'
import { sendFrontendMessage } from 'backend/ipc'
import { Notification } from 'electron'

// BADGE_ELIGIBLE_STATES precedent from urgencyBadge.ts — only these states'
// expiration transitions are notification-worthy (D-92 implicitly scopes to
// keys that can still be acted on).
function detectAndNotifyExpirationTransitions(keys: HumbleKey[]) {
  const newlyExpiring: HumbleKey[] = []
  for (const key of keys) {
    const last = humbleNotifiedExpirationStore.get(key.machineName)
    const current = key.expiration
    if (current !== null && current !== (last?.expiration ?? null)) {
      newlyExpiring.push(key)
      humbleNotifiedExpirationStore.set(key.machineName, { expiration: current })
    }
  }
  if (newlyExpiring.length === 0) return
  if (!isNotifyHumbleExpirationsEnabled()) return  // D-93 settings gate
  if (!Notification.isSupported() || isSteamDeckGameMode) return

  const { title, body } = buildDigestCopy(newlyExpiring)  // D-90
  const notification = new Notification({ title, body })
  notification.on('click', () => {
    getMainWindow()?.show()
    sendFrontendMessage('openScreen', '/humble-keys/waiting')  // D-91
  })
  notification.show()
}
```

### Anti-Patterns to Avoid

- **Falling back to Phase 12's fuzzy matcher for store badges:** D-82 explicitly forbids this. A wrong badge on a purchase-adjacent surface (the deals screen) is worse than a missing one — there's no correction affordance here like the Humble Keys page's D-42 override.
- **Per-key notifications instead of a digest:** D-90 explicitly requires batching per sync to avoid notification storms on bundles where many keys gain deadlines together.
- **Re-deriving urgency thresholds for the pinned section:** D-87 locks reuse of `getUrgencyTier` unchanged — do not introduce a second threshold constant.
- **Recomputing dedup/badge classification for the store overlay on every render without memoization:** `steam.library` and `humble.keys` can be large; the title→AppID map should be built once per data-change (`useMemo`), matching the existing `ownedTitles` pattern in `Discounts/index.tsx`.
- **Persisting notified-state keyed by `gamekey` instead of `machineName`:** Every other per-key persisted store in this codebase (`humbleRevealedStore`, `humbleOwnershipOverrideStore`, `humbleGiftedAtStore`) keys by `machineName` (the stable per-tpk identity) — a new convention here would be inconsistent and error-prone.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cross-platform OS notifications | A notification abstraction layer or third-party notifier package | Electron's built-in `Notification` (already used twice: `utils.ts`, `dialog.ts`) | Already proven working in this exact codebase, zero new dependency surface |
| Windows toast grouping / AppUserModelID | Manual registry/shortcut AppUserModelID setup | Already done — `app.setAppUserModelId('GameLib')` at `main.ts:359` | Confirmed present; no additional Windows-specific work needed for basic toast identity |
| Expiration urgency tiers/countdown copy | New threshold logic for the pinned section | `common/humble/urgencyBadge.ts`'s `getUrgencyTier`/`getUrgencyCountdownParts` | D-87 locks this reuse explicitly; zero new threshold logic |
| Persisted per-key state that survives restarts/reconnects | A bespoke JSON file or new persistence layer | `CacheStore` (wraps `electron-store`) via `src/backend/humble/electronStores.ts`'s established pattern | Exact same shape as 3 existing stores in that file |
| Settings toggle | A bespoke checkbox/config write path | `useSetting` hook + `ToggleSwitch` component + `AppSettings` type field | Standard pattern used by every other boolean setting in `GeneralSettings` |
| Frontend navigation from a backend-originated event | A new IPC channel + new frontend listener | Existing `openScreen` `FrontendMessage`, already consumed app-wide by `Sidebar/index.tsx`'s `handleGoToScreen` listener | Zero new plumbing — `sendFrontendMessage('openScreen', '/humble-keys/waiting')` just works |

**Key insight:** This phase's engineering value is almost entirely in composition and exact-match discipline (title→AppID resolution, transition-dedup semantics), not in building new primitives. Every "Don't Hand-Roll" item above already exists and is exercised elsewhere in the same codebase.

## Common Pitfalls

### Pitfall 1: CatalogProduct has no Steam AppID — badges may render for very few products
**What goes wrong:** Because the Discounts screen's `CatalogProduct` type (`src/common/types/discounts.ts`) has zero Steam-related fields, and the resolution step requires an *exact* normalized-title match against `steam.library`, many GOG catalog products (different title casing/edition suffixes/regional naming vs. the user's Steam library entry) will resolve to no AppID and therefore show no badge at all — even for products the user legitimately owns or has a key for.
**Why it happens:** GOG and Steam titles for the same game are not always byte-identical (e.g. "Celeste" vs "Celeste — Standard Edition", trademark symbols, punctuation).
**How to avoid:** Accept this as an intentional precision-over-recall tradeoff consistent with D-79/D-82's "a missing badge beats a wrong one." Do not silently expand to fuzzy matching to "fix" the coverage gap — that decision belongs to a user-facing discussion, not an implementation shortcut. Document the expected low-badge-coverage rate for the UAT/verification checklist so it isn't mistaken for a bug.
**Warning signs:** UAT testing shows very few or zero badges on a real account with a substantial owned library and pending keys.

### Pitfall 2: Pre-existing 24-48h urgency countdown bug will propagate into the pinned section
**What goes wrong:** Phase 13's `getUrgencyCountdownParts` (in `common/humble/urgencyBadge.ts`) has a confirmed, previously-verified defect: any key expiring between 24h and 48h out returns `{ kind: 'days', value: 2 }` ("2 days left") instead of the UI-spec-locked "1 day left" — confirmed in `.planning/phases/13-keys-waiting-giftable-spares-views/13-VERIFICATION.md` (CR-01) and still open per the `phase-13-verification-gaps` project memory. If Phase 15's pinned Expiring-soon section renders this countdown text (likely, since it's the whole point of an urgency surface), the bug surfaces there too.
**Why it happens:** `Math.ceil(daysLeft)` is applied uniformly with no dedicated 24-48h branch; the unit test meant to catch this was edited to assert the wrong value.
**How to avoid:** D-87 only locks reuse of the *tier* thresholds (`getUrgencyTier`), not a mandate to also inherit the countdown-copy bug silently. Flag this explicitly for the planner: either (a) fix `getUrgencyCountdownParts` as an in-scope prerequisite task for Phase 15 since this phase is the first to build a *dedicated* urgency surface where the bug is most visible, or (b) explicitly defer/accept it and note the known limitation in the phase's verification checklist. Do not let it pass silently as "already reused, not our bug."
**Warning signs:** UAT on a key expiring in the 25h-47h window shows "2 days left" in the pinned section.

### Pitfall 3: Notification digest firing during a background/cold sync could surprise the user
**What goes wrong:** `runSync()` can be triggered by background refresh timers, not just an explicit user-initiated "Sync now" click. Firing an OS notification from an unattended background sync is expected behavior per D-90/D-93 (that's the whole point — "alert the user"), but if the app is launched fresh and does a first-ever sync, every non-expiring→expiring transition across the ENTIRE library will fire at once (a large one-time digest), not just genuinely new information.
**Why it happens:** The notified-state store starts empty; `null → date` is defined (D-92) as always firing.
**How to avoid:** This is very likely intentional per D-92's literal wording ("null→date fires"), but confirm during planning whether a first-sync (empty notified-store) should suppress the initial digest to avoid a jarring "47 keys gained expiration dates" notification on first connect. If not explicitly addressed, this becomes a UAT finding rather than a silent assumption.
**Warning signs:** First sync after a fresh Humble connect fires a notification with an unexpectedly large key count.

### Pitfall 4: Notifications not supported in Steam Deck Game Mode / headless environments
**What goes wrong:** `Notification.isSupported()` can return `false` in some Linux sandboxed/headless environments (no `libnotify`/notification daemon), and the codebase already special-cases `isSteamDeckGameMode` in the existing `notify()` helper (`dialog.ts`) to skip notifications entirely.
**Why it happens:** Steam Deck Game Mode and some Linux window managers lack a freedesktop notification daemon.
**How to avoid:** Reuse the exact same `Notification.isSupported() && !isSteamDeckGameMode` guard already established in `dialog.ts:62`, rather than introducing a new/different check.
**Warning signs:** Silent failure to notify on Linux/Steam Deck with no user-visible fallback — acceptable per existing precedent (fail silent, don't error), but worth confirming this is still the intended behavior for HSTORE-03.

### Pitfall 5: Digest notification body must never include raw key values
**What goes wrong:** The digest names the affected game(s) (D-90's single-key form: "Celeste's Humble key now expires on..."). This is safe (title only), but a careless implementation could be tempted to include more detail (e.g., the key value itself) for "helpfulness."
**Why it happens:** Not a natural mistake given the locked copy, but worth calling out given the codebase's consistent C4/T-14-02 discipline (raw key values NEVER appear outside a stripped-down internal-only field — see `electronStores.ts`'s `HumbleKeyInternal.revealedKeyValue`).
**How to avoid:** Digest copy only ever references `title` and `expiration` — both already on the display-safe `HumbleKey` type. Never read from `HumbleKeyInternal`'s internal-only fields when building notification copy.
**Warning signs:** N/A if the existing `HumbleKey` (not `HumbleKeyInternal`) type is used exclusively for digest copy — this is a design-time discipline check, not a runtime symptom.

## Code Examples

### Existing digest-adjacent notification precedent (backend)
```typescript
// Source: src/backend/dialog/dialog.ts (existing code, verbatim)
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
```

### Existing openScreen navigation precedent (backend → frontend)
```typescript
// Source: src/backend/main.ts:1473 (existing code, verbatim)
sendFrontendMessage('openScreen', '/settings/general')
```
```typescript
// Source: src/frontend/components/UI/Sidebar/index.tsx:58-63 (existing code, verbatim
// — already mounted app-wide, no new listener needed for Phase 15)
useEffect(() => {
  window.api.handleGoToScreen((e, screen) => {
    navigate(screen, { state: { fromGameCard: false } })
  })
}, [])
```

### Existing CacheStore persistence precedent (backend)
```typescript
// Source: src/backend/humble/electronStores.ts (existing code, verbatim — the
// pattern to follow for humbleNotifiedExpirationStore)
const humbleRevealedStore = new CacheStore<{ revealedAt: number }, string>(
  'humble_revealed',
  null
)
```

### Existing settings-toggle precedent (frontend)
```typescript
// Source: src/frontend/screens/Settings/components/AnalyticsOptIn.tsx (existing
// code, verbatim structure — mirror for the new notification toggle)
const AnalyticsOptIn = () => {
  const { t } = useTranslation()
  const [analyticsOptIn, setAnalyticsOptIn] = useSetting('analyticsOptIn', false)

  return (
    <div className="toggleRow">
      <ToggleSwitch
        htmlId="analyticsOptIn"
        value={analyticsOptIn}
        handleChange={() => setAnalyticsOptIn(!analyticsOptIn)}
        title={t('setting.analyticsOptIn', '...')}
      />
      <InfoIcon text={t('help.analytics', '...')} />
    </div>
  )
}
```
Note: D-93 requires **default ON** — unlike `analyticsOptIn`'s `false` default, the new setting's `useSetting('notifyHumbleExpirations', true)` call and its `src/backend/config.ts` default-settings-object entry must both default to `true`.

## State of the Art

Not applicable — no external ecosystem/library version drift is relevant here; every mechanism is either already implemented in this codebase or is Electron's stable, long-standing `Notification` API.

**Deprecated/outdated:** None found relevant to this phase.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Exact-normalized-title resolution of `CatalogProduct → Steam AppID` is an acceptable reading of D-82's "exact Steam appid matches only" (rather than a violation of it) | Summary, Pattern 1, Pitfall 1 | If the user intended a stricter reading (e.g., badges should never appear on the Discounts screen at all until GOG's catalog API returns a Steam AppID field, which it doesn't), the entire HSTORE-01 badge feature as scoped by D-78 may be unbuildable without this title-resolution step, and the discuss-phase decision needs revisiting before planning proceeds |
| A2 | A first-ever sync (empty notified-state store) should fire the digest notification for all newly-expiring keys, per the literal wording of D-92 ("null→date fires") | Pitfall 3 | If the user actually wants first-sync suppression, an unwanted large notification fires on every fresh Humble connect; low severity (one extra notification), easy to patch later |
| A3 | The pre-existing 24-48h urgency countdown-copy bug (CR-01 from Phase 13 verification) is in scope for Phase 15 to fix opportunistically, or at minimum must be explicitly flagged rather than silently inherited | Pitfall 2 | If left unaddressed and unflagged, Phase 15's pinned Expiring-soon section — the highest-visibility urgency surface in the app — ships with a known display bug for its most urgent 24h window |
| A4 | The new `humbleNotifiedExpirationStore` should follow the "survives disconnect" exemption pattern of `humbleRevealedStore`/`humbleOwnershipOverrideStore` (never wiped by `HumbleUser.disconnect()`) rather than being wiped like `humbleLibraryStore`/`humbleSyncStore` | Architecture Patterns, Don't Hand-Roll | If wiped on disconnect, a user who disconnects/reconnects Humble would get re-notified for every already-known expiring key on the next sync — likely undesirable but not explicitly locked in CONTEXT.md (listed under Claude's Discretion: "the persisted notified-state storage shape") |

## Open Questions

1. **How should a `CatalogProduct` (GOG catalog, no Steam AppID) resolve to a Steam AppID for exact-match badging, given D-82's "no fuzzy title matching" constraint?**
   - What we know: `CatalogProduct` (src/common/types/discounts.ts) has `id` (GOG product id) and `title` only — no Steam-related field. The existing `Discounts/index.tsx` already does one title-based cross-store ownership check (`ownedTitles`, exact-normalized, not fuzzy) for the pre-existing "Hide Owned" filter. Phase 12's dedup engine (`recomputeOwnership`/`fuzzyMatch`) operates on `HumbleKey[]` against `GameInfo[]` (Steam library), never on `CatalogProduct[]`.
   - What's unclear: Whether the discuss-phase session anticipated this gap when picking the Discounts screen as the sole badge host (D-78), and whether an exact-normalized-title bridge (this research's recommendation) is an acceptable interpretation of "exact Steam appid matches only," or whether that phrase was meant more narrowly (e.g., assuming a Steam AppID field would somehow already exist on the product).
   - Recommendation: Confirm with the user/planner before task breakdown. If confirmed, build the bridge as a pure `common/discounts/badges.ts` helper (Pattern 1) so it's unit-testable and isolated from Phase 12's fuzzy engine, satisfying the spirit of D-82 (predictability over recall) even though the resolution step is title-based.

2. **Should the pinned Expiring-soon section on Keys-waiting render countdown text (e.g., "3 days left"), and if so, is fixing the known 24-48h bug (CR-01) in scope for this phase?**
   - What we know: D-87 locks reuse of `getUrgencyTier` (color/eligibility) unchanged; it does not explicitly mandate reuse of `getUrgencyCountdownParts` (the buggy countdown-copy helper) for the pinned section specifically, though `HumbleKeyRow`/`UrgencyBadge` already render it elsewhere.
   - What's unclear: Whether the pinned section is expected to show the same `UrgencyBadge` countdown component as the rest of the row (in which case the bug carries over silently), or whether it's discretionary.
   - Recommendation: Surface this to the user/planner explicitly rather than letting the bug propagate unflagged; a one-line prerequisite fix task is low-cost given the bug is already fully diagnosed in `13-VERIFICATION.md`.

3. **Where exactly should the notification toggle live in Settings, and should its default value need a `src/backend/config.ts` default-object entry as well as the `useSetting` call-site default?**
   - What we know: `useSetting('key', defaultValue)` reads from `AppSettings`; existing precedent (`analyticsOptIn: false` in `config.ts`'s default settings object) shows both the type declaration and a config default are typically kept in sync, though `useSetting`'s own default argument may cover first-run cases without a config.ts entry.
   - What's unclear: Whether a `config.ts` default entry is strictly required for a new boolean setting to read as `true` from `useSetting('notifyHumbleExpirations', true)` on a fresh install, or whether the hook's own default argument alone suffices.
   - Recommendation: Planner/implementer should verify `useSetting`'s exact fallback behavior in `src/frontend/hooks/useSetting.ts` before assuming a `config.ts` entry is optional — low risk either way, but worth an explicit check rather than an assumption.

## Environment Availability

Skipped — this phase has no external service/tool dependencies beyond what's already required by the project's existing build (Electron, Node, already-installed npm packages). No new CLI tools, databases, or runtimes are introduced.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | ts-jest (Jest) — two-project setup |
| Config file | `jest.config.js` (root, `projects: ['<rootDir>/src/backend', '<rootDir>/src/frontend']`), plus `src/backend/jest.config.js` / `src/frontend/jest.config.js` |
| Quick run command | `npx jest src/backend/humble/__tests__/<file>.test.ts` (pure helpers in `common/` are tested from the **backend** project — confirmed by an existing in-repo test-file comment: "jest's project roots only cover src/backend") |
| Full suite command | `pnpm test:ci` (or `pnpm test`) |

### Phase Requirement → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|--------------------|-------------|
| HSTORE-01 | `resolveDiscountBadge` returns 'owned' for an exact title→AppID→steam.library match | unit | `npx jest src/backend/discounts/__tests__/badges.test.ts` | ❌ Wave 0 |
| HSTORE-01 | `resolveDiscountBadge` returns 'key-available' for exact AppID match against `selectKeysWaiting` membership | unit | same file as above | ❌ Wave 0 |
| HSTORE-01 | `resolveDiscountBadge` returns null (no badge) when title has no exact match — never falls to fuzzy | unit | same file as above | ❌ Wave 0 |
| HSTORE-01 | 'Owned' wins over 'key-available' when both apply (D-85) | unit | same file as above | ❌ Wave 0 |
| HSTORE-03 | Pinned-section membership == `getUrgencyTier(...) !== null` subset of `selectKeysWaiting` | unit | `npx jest src/backend/humble/__tests__/viewFilters.test.ts` (extend existing file, or new `pinnedSection.test.ts`) | ❌ Wave 0 (extension) |
| HSTORE-03 | Pinned section hidden when zero keys are within the urgency window (D-89) | unit | same as above | ❌ Wave 0 |
| HSTORE-03 | `detectExpirationTransitions`: null→date fires; date→same-date does not; date→different-date fires again | unit | `npx jest src/backend/humble/__tests__/expirationAlerts.test.ts` | ❌ Wave 0 |
| HSTORE-03 | Digest copy: single-key form names the game; 2+ keys use plural digest form | unit | same file as above | ❌ Wave 0 |
| HSTORE-03 | Notification click triggers `sendFrontendMessage('openScreen', '/humble-keys/waiting')` | unit (mock Notification/IPC) | same file as above | ❌ Wave 0 |
| HSTORE-03 | Settings toggle default is `true` and gates notification firing | unit | `npx jest src/frontend/screens/Settings/__tests__/` (or backend config default test) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** targeted `npx jest <changed-file's test>` (< 30s)
- **Per wave merge:** `pnpm test:ci` (full suite, `--runInBand --silent`)
- **Phase gate:** Full suite green before `/gsd:verify-work`, plus `pnpm codecheck` (tsc --noEmit) and `pnpm lint`

### Wave 0 Gaps
- [ ] `src/common/discounts/badges.ts` + `src/backend/discounts/__tests__/badges.test.ts` — new pure helper, no existing file
- [ ] `src/backend/humble/expirationAlerts.ts` + `src/backend/humble/__tests__/expirationAlerts.test.ts` — new transition-detection + digest-copy logic
- [ ] `src/backend/humble/electronStores.ts` — extend with `humbleNotifiedExpirationStore` (no new file, existing file gains an export; existing `electronStores.test.ts` should be extended, not replaced)
- [ ] Pinned-section membership helper (extend `viewFilters.ts` or add a sibling pure function) + corresponding test extension

*(No framework install needed — ts-jest/Jest already fully configured for both `common/` (via backend project) and frontend component tests.)*

## Security Domain

`security_enforcement` is absent from `.planning/config.json` → treated as enabled, per protocol.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | No | This phase adds no new auth surface — reuses Phase 10's existing Humble session |
| V3 Session Management | No | No new session handling |
| V4 Access Control | No | Single-user local Electron app; no multi-tenant concern |
| V5 Input Validation | Marginal | GOG catalog product titles (already-trusted-enough per existing Discounts screen usage) are used as a lookup key only — no injection surface (pure string comparison, no `eval`/dynamic code, no SQL/shell) |
| V6 Cryptography | No | No new cryptographic material; notified-state store holds only a title/machineName + ISO date string, not secrets |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Notification body accidentally leaking a raw Humble key value | Information Disclosure | Digest copy sourced exclusively from the display-safe `HumbleKey` type (`title`, `expiration`) — never from `HumbleKeyInternal`'s `revealedKeyValue`/`keyindex` internal-only fields (existing C4/T-14-02 discipline, see Pitfall 5) |
| A malicious/compromised GOG catalog response injecting a crafted `title` string that collides with an unrelated Steam AppID, silently badging the wrong game as "Owned" | Spoofing (of ownership signal) | Exact-normalized-title match only (no fuzzy scoring, no regex/wildcard matching) minimizes accidental collision surface; a missing badge is explicitly preferred over a wrong one (D-79/D-82) |
| Notified-state store growing unbounded over years of syncs (many machineNames, never pruned) | — (availability/DoS, low severity) | Not a new risk class — mirrors existing `humbleRevealedStore`/`humbleOwnershipOverrideStore`, which already accept this tradeoff; no pruning logic exists for those stores either, so no new pattern to introduce here |

## Sources

### Primary (HIGH confidence — direct codebase inspection)
- `src/common/types/discounts.ts` — confirmed `CatalogProduct` has no Steam-related field
- `src/backend/discounts/index.ts` — confirmed GOG catalog is the sole data source (`catalog.gog.com`), no Steam appid anywhere in the fetch/response pipeline
- `src/frontend/screens/Discounts/index.tsx` — confirmed existing `ownedTitles` exact-normalized-title precedent
- `src/common/humble/urgencyBadge.ts`, `src/common/humble/viewFilters.ts` — confirmed reusable tier/membership helpers and the known 24-48h countdown-copy defect location
- `src/common/types/humble.ts` — confirmed `HumbleKey.steamAppId`/`ownedElsewhere`/`matchConfidence` shape
- `src/backend/humble/dedup.ts` — confirmed exact-AppID-first, fuzzy-fallback matching logic and its `D-44` no-fuzzy-when-appid-present rule
- `src/backend/humble/library.ts` (lines ~781-1000) — confirmed `runSync()` structure and the `recomputeOwnership()` hook point at line 997
- `src/backend/humble/electronStores.ts` — confirmed `CacheStore` persistence pattern and disconnect-survival precedent
- `src/backend/utils.ts:192`, `src/backend/dialog/dialog.ts:56-74` — confirmed existing `Notification` API usage patterns
- `src/backend/main.ts:359` — confirmed `app.setAppUserModelId('GameLib')` already set (Windows toast identity solved)
- `src/backend/main.ts:1473`, `src/frontend/components/UI/Sidebar/index.tsx:58-63` — confirmed existing `openScreen` navigation plumbing, fully reusable with zero new IPC work
- `src/common/types/ipc.ts:490-524` — confirmed `FrontendMessages.openScreen` shape
- `src/frontend/App.tsx:178-197` — confirmed `/humble-keys/waiting` route path
- `src/frontend/screens/Settings/components/AnalyticsOptIn.tsx`, `src/frontend/screens/Settings/sections/GeneralSettings/index.tsx` — confirmed settings-toggle pattern
- `.planning/phases/13-keys-waiting-giftable-spares-views/13-VERIFICATION.md` — confirmed the 24-48h urgency countdown defect (CR-01)
- `.planning/phases/12-ownership-dedup/12-CONTEXT.md` — confirmed D-44 (AppID verdict is final, no fuzzy fallback when AppID present) and D-45/D-46 scope
- `jest.config.js`, `src/backend/humble/__tests__/viewFilters.test.ts` (file-header comment) — confirmed test project structure and the "common/ is tested from the backend project" convention
- `package.json` — confirmed Electron ^41.1.1, no new dependencies needed, existing test/lint/typecheck scripts

### Secondary (MEDIUM confidence)
- None — all findings in this research were verified directly against the codebase; no WebSearch was needed given the phase is pure composition of existing, already-verified project infrastructure.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies, everything verified present in `package.json`
- Architecture: HIGH — every integration point (notification, navigation, persistence, settings) has a direct, verbatim precedent already in the codebase
- Pitfalls: HIGH for Pitfalls 2/4/5 (directly sourced from prior-phase verification artifacts and existing code); MEDIUM for Pitfall 1/3 (architecturally sound reasoning, but the underlying decision gap needs user confirmation, not further code archaeology)

**Research date:** 2026-07-09
**Valid until:** No expiration risk — this research is entirely internal-codebase-derived (no third-party API/library version drift risk). Re-validate only if CONTEXT.md decisions D-78/D-82 are revised.
